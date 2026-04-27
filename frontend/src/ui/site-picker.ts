import { listSites, type SiteConfigAPI } from "../api-client";

/**
 * Renders the landing page that lets the user choose which dive site to view.
 * Clicking a site navigates to `?site=<id>` (full page load) so the viewer can
 * boot fresh against the chosen site — Q3D's lifecycle isn't designed to be
 * re-initialized in place.
 */
export async function renderSitePicker(container: HTMLElement): Promise<void> {
  const root = document.createElement("div");
  root.id = "dm-site-picker";
  root.innerHTML = `
    <div class="dm-picker-card">
      <h1>Dive Map</h1>
      <p class="dm-picker-sub">Choose a dive site to explore.</p>
      <div class="dm-picker-status">Loading sites…</div>
      <div class="dm-picker-list" hidden></div>
    </div>
  `;
  container.appendChild(root);

  const status = root.querySelector(".dm-picker-status") as HTMLElement;
  const list = root.querySelector(".dm-picker-list") as HTMLElement;

  let sites: SiteConfigAPI[];
  try {
    sites = await listSites();
  } catch (e) {
    status.textContent = "Couldn't load sites. Please try again later.";
    console.error("listSites failed", e);
    return;
  }

  if (!sites.length) {
    status.textContent = "No dive sites configured yet.";
    return;
  }

  status.hidden = true;
  list.hidden = false;
  list.innerHTML = sites
    .map(
      (s) => `
        <a class="dm-site-card" href="?site=${s.id}">
          <div class="dm-site-name">${escapeHtml(s.name)}</div>
          <div class="dm-site-coords">
            ${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}
          </div>
        </a>
      `
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}
