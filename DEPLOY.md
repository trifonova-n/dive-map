# Deploying dive-map

Single-VPS production setup using Docker Compose, Caddy (auto-HTTPS), and a bind-mounted media directory. Target host: anything with Docker — these notes assume a fresh Hetzner CX22 (Ubuntu 24.04, ~$4/mo).

## What gets deployed

- **db** — PostGIS 16, named volume `pgdata`
- **backend** — FastAPI/uvicorn; runs `alembic upgrade head` on every start
- **caddy** — multi-stage image: builds the Vite frontend, then serves it. Reverse-proxies `/api/*` and `/auth/*` to the backend, serves `/data/*` from `/srv/dive-map/media`, terminates TLS via Let's Encrypt.

## One-time server setup

1. **Provision the VPS** and point an A record (e.g. `divemap.example.com`) at its public IP. Wait for DNS to propagate before the first deploy or Let's Encrypt issuance will fail.

2. **Install Docker:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

3. **Clone the repo:**
   ```bash
   git clone <your-repo-url> /srv/dive-map
   cd /srv/dive-map
   ```

4. **Create `.env`:**
   ```bash
   cp .env.example .env
   # generate a JWT secret
   python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
   # generate a DB password
   python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
   nano .env   # paste DOMAIN, POSTGRES_PASSWORD, JWT_SECRET
   ```

5. **Upload the scene file** (from your laptop — it's gitignored):
   ```bash
   ssh root@SERVER 'mkdir -p /srv/dive-map/media/index'
   scp data/index/scene.js root@SERVER:/srv/dive-map/media/index/scene.js
   ```

6. **Deploy:**
   ```bash
   ./deploy.sh
   ```

   First build downloads images and compiles the frontend (~3–5 min on a CX22). Caddy will request a Let's Encrypt cert automatically — watch logs with `docker compose -f docker-compose.prod.yml logs -f caddy` to confirm.

Visit `https://$DOMAIN`. The first request loads the scene file (~100 MB) so it'll take a moment.

## Subsequent deploys

```bash
ssh root@SERVER
cd /srv/dive-map
./deploy.sh
```

The script: `git pull`, rebuilds images, restarts containers in dependency order, prunes old images. Migrations run automatically on backend startup.

## Adding new maps / media

The Caddy container mounts `/srv/dive-map/media` read-only at `/srv/media` and serves it at `/data/*`. To add a file:

```bash
scp newmap.js root@SERVER:/srv/dive-map/media/sites/newsite.js
# now reachable at https://$DOMAIN/data/sites/newsite.js
```

No restart needed — Caddy serves it immediately.

## Backups

Quickest reliable backup: nightly `pg_dump` + `restic` of `/srv/dive-map/media` to a free Backblaze B2 or Cloudflare R2 bucket. Add to root crontab:

```cron
# /etc/cron.d/divemap-backup
0 4 * * * root /srv/dive-map/scripts/backup.sh >> /var/log/divemap-backup.log 2>&1
```

(The backup script isn't included yet — ask Claude to generate one when you're ready to wire up an R2 / B2 bucket.)

## When media outgrows the disk

The 40 GB CX22 disk handles plenty of photos but not much video. When you need to move media to object storage:

1. Create a Cloudflare R2 bucket; enable public access on a subdomain (e.g. `media.divemap.example.com`).
2. Copy `/srv/dive-map/media/*` into the bucket with `rclone`.
3. In `Caddyfile`, replace the `/data/*` block with a `reverse_proxy` to the bucket URL, or just point the frontend at the bucket directly.
4. Add a backend endpoint that returns presigned upload URLs so the browser can upload large files directly to R2.

No DB schema or app rewrite is required — only how media URLs are constructed changes.

## Troubleshooting

- **Cert not issued:** verify DNS resolves to the server (`dig +short $DOMAIN`) and ports 80/443 are open. Caddy will retry automatically.
- **Backend can't reach DB:** the `db` healthcheck must pass before the backend starts. Check `docker compose -f docker-compose.prod.yml ps` and `logs db`.
- **Migration error on deploy:** the backend exits if `alembic upgrade head` fails. Inspect with `logs backend`, fix locally, re-deploy.
- **Frontend rebuild loop is slow:** the multi-stage Dockerfile reinstalls npm deps when `package-lock.json` changes. For a faster iteration loop on the server, scp `dist/` directly into a Caddy bind mount instead of rebuilding.

## Useful commands

```bash
# Logs (all services or one)
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f backend

# Shell into backend (e.g. to run an ad-hoc Alembic command)
docker compose -f docker-compose.prod.yml exec backend bash

# Postgres shell
docker compose -f docker-compose.prod.yml exec db psql -U $POSTGRES_USER $POSTGRES_DB

# Restart one service after editing Caddyfile
docker compose -f docker-compose.prod.yml restart caddy

# Stop everything (data persists in volumes)
docker compose -f docker-compose.prod.yml down
```
