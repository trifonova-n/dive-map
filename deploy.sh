#!/usr/bin/env bash
# Run on the server inside the repo directory.
# First-time setup is in DEPLOY.md.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building and starting containers"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "==> Pruning old images"
docker image prune -f

echo "==> Done. Tail logs with: docker compose -f docker-compose.prod.yml logs -f"
