import * as api from "../api-client";

export interface WaypointInput {
  latitude: number;
  longitude: number;
  depth_m: number;
}

export interface PlanPanelDeps {
  exportWaypoints: () => Array<{
    seq: number;
    latitude: number;
    longitude: number;
    depth_m: number;
  }>;
  exportSegments: () => Array<{ distFt: number; heading: number }>;
  importWaypoints: (waypoints: WaypointInput[]) => void;
  clearWaypoints: () => void;
  setEditMode: (flag: boolean) => void;
  highlightWaypoint: (seq: number | null) => void;
  metersToFeet: number;
}

export interface PlanPanelAPI {
  update: () => void;
  markDirty: () => void;
  /** Returns true if Escape was handled (editing was active). */
  handleEscape: () => boolean;
  /** Clears plan state tied to the previous session and re-renders. */
  handleLogout: () => void;
}

let currentPlanId: number | null = null;
let currentPlanName = "";
let editing = false;
let unsavedChanges = false;
let isDraft = false;
let loadedWaypoints: api.WaypointAPI[] = [];
let pendingExit: "browse" | "view" | null = null;
let pendingSaveAfterLogin = false;
let selectedSeq: number | null = null;

export function createPlanPanel(
  container: HTMLElement,
  deps: PlanPanelDeps
): PlanPanelAPI {
  const el = document.createElement("div");
  el.className = "panel-box";
  container.appendChild(el);

  async function render() {
    if (pendingExit) {
      renderGuard();
    } else if (currentPlanId === null && !isDraft) {
      await renderBrowse();
    } else if (editing) {
      renderEdit();
    } else {
      renderView();
    }

    // If a save was queued pre-auth and the user has since logged in, retry it.
    if (pendingSaveAfterLogin && api.isLoggedIn()) {
      pendingSaveAfterLogin = false;
      try {
        await persistCurrentPlan();
        await render();
      } catch (e) {
        const errEl = el.querySelector("#dm-plan-error") as HTMLElement | null;
        if (errEl) {
          errEl.textContent = (e as Error).message;
          errEl.style.display = "block";
        }
      }
    }
  }

  function resetStateForLogout() {
    if (editing) deps.setEditMode(false);
    clearSelection();
    deps.clearWaypoints();
    currentPlanId = null;
    currentPlanName = "";
    editing = false;
    unsavedChanges = false;
    isDraft = false;
    loadedWaypoints = [];
    pendingExit = null;
    pendingSaveAfterLogin = false;
  }

  function clearSelection() {
    if (selectedSeq !== null) {
      selectedSeq = null;
      deps.highlightWaypoint(null);
    }
  }

  function selectRow(seq: number) {
    const next = selectedSeq === seq ? null : seq;
    selectedSeq = next;
    deps.highlightWaypoint(next);
    render();
  }

  async function renderBrowse() {
    const loggedIn = api.isLoggedIn();
    let plans: api.DivePlanAPI[] = [];
    if (loggedIn) {
      try {
        plans = await api.listPlans();
      } catch {
        // Backend may be down
      }
    }

    let planListHtml: string;
    if (!loggedIn) {
      planListHtml =
        '<div class="muted-line">Sign in to see your saved plans</div>';
    } else if (plans.length) {
      planListHtml = plans
        .map(
          (p) =>
            `<div class="plan-item" data-id="${p.id}">
                <span class="plan-name">${escapeHtml(p.name)}</span>
              </div>`
        )
        .join("");
    } else {
      planListHtml = '<div class="muted-line">No saved plans yet</div>';
    }

    el.innerHTML = `
      <h3>Dive Plans</h3>
      ${planListHtml}
      <div class="plan-create-form">
        <button class="primary" id="dm-create-plan">+ New dive plan</button>
        <button class="secondary" id="dm-open-csv">Open CSV</button>
        <input type="file" id="dm-open-csv-file" accept=".csv,text/csv" style="display:none" />
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;

    const showError = makeErrorReporter();

    el.querySelectorAll(".plan-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const id = Number((item as HTMLElement).dataset.id);
        try {
          const detail = await api.getPlan(id);
          clearSelection();
          deps.clearWaypoints();
          if (detail.waypoints.length) deps.importWaypoints(detail.waypoints);
          currentPlanId = id;
          currentPlanName = detail.name;
          loadedWaypoints = detail.waypoints;
          editing = false;
          unsavedChanges = false;
          render();
        } catch (e) {
          showError((e as Error).message);
        }
      });
    });

    el.querySelector("#dm-create-plan")!.addEventListener("click", () => {
      // Create a nameless draft — name and backend persistence are deferred
      // until the user chooses to save.
      clearSelection();
      deps.clearWaypoints();
      currentPlanId = null;
      currentPlanName = "";
      loadedWaypoints = [];
      isDraft = true;
      unsavedChanges = true;
      editing = true;
      deps.setEditMode(true);
      render();
    });

    const fileInput = el.querySelector(
      "#dm-open-csv-file"
    ) as HTMLInputElement;
    el.querySelector("#dm-open-csv")!.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const waypoints = parsePlanCsv(text, deps.metersToFeet);
        if (!waypoints.length) {
          showError("No waypoints found in CSV.");
          return;
        }
        clearSelection();
        deps.clearWaypoints();
        deps.importWaypoints(waypoints);
        currentPlanId = null;
        currentPlanName = file.name.replace(/\.csv$/i, "");
        loadedWaypoints = [];
        isDraft = true;
        unsavedChanges = true;
        editing = true;
        deps.setEditMode(true);
        render();
      } catch (e) {
        showError((e as Error).message);
      }
    });
  }

  function renderView() {
    const wps = deps.exportWaypoints();
    el.innerHTML = `
      ${planHeaderHtml()}
      ${summaryStripHtml(wps)}
      ${waypointListHtml(wps, false)}
      <div class="actions-row">
        <button class="primary" id="dm-edit">Edit route</button>
        <button class="secondary" id="dm-save" ${unsavedChanges ? "" : "disabled"}>Save</button>
        <button class="secondary" id="dm-export-csv" ${wps.length ? "" : "disabled"}>Export CSV</button>
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;
    wireHeader();
    wireRowSelection();
    el.querySelector("#dm-edit")!.addEventListener("click", () => {
      editing = true;
      deps.setEditMode(true);
      render();
    });
    wireSave();
    wireExportCsv();
  }

  function renderEdit() {
    const wps = deps.exportWaypoints();
    const emptyHint = wps.length
      ? ""
      : '<div class="edit-hint">Click the map to drop your first waypoint</div>';
    el.innerHTML = `
      ${planHeaderHtml()}
      ${summaryStripHtml(wps)}
      ${emptyHint}
      ${waypointListHtml(wps, true)}
      <div class="actions-row">
        <button class="primary" id="dm-done">Done</button>
        <button class="secondary" id="dm-save" ${unsavedChanges ? "" : "disabled"}>Save</button>
        <button class="secondary" id="dm-export-csv" ${wps.length ? "" : "disabled"}>Export CSV</button>
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;
    wireHeader();
    wireRowSelection();
    el.querySelector("#dm-done")!.addEventListener("click", () =>
      requestExit("view")
    );
    el.querySelectorAll(".wp-row-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const seq = Number((btn as HTMLElement).dataset.seq);
        const current = deps.exportWaypoints();
        const filtered = current.filter((w) => w.seq !== seq);
        clearSelection();
        deps.clearWaypoints();
        if (filtered.length) deps.importWaypoints(filtered);
        unsavedChanges = true;
        render();
      });
    });
    wireSave();
    wireExportCsv();
  }

  function wireRowSelection() {
    el.querySelectorAll(".waypoint-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".wp-row-delete")) return;
        const seq = Number((row as HTMLElement).dataset.seq);
        if (Number.isFinite(seq)) selectRow(seq);
      });
    });
  }

  function renderGuard() {
    el.innerHTML = `
      ${planHeaderHtml()}
      <div class="guard-box">
        <div class="guard-msg">Discard unsaved changes?</div>
        <div class="guard-actions">
          <button class="secondary" id="dm-guard-keep">Keep editing</button>
          <button class="danger" id="dm-guard-discard">Discard</button>
          <button class="primary" id="dm-guard-save">Save &amp; close</button>
        </div>
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;
    el.querySelector("#dm-guard-keep")!.addEventListener("click", () => {
      pendingExit = null;
      render();
    });
    el.querySelector("#dm-guard-discard")!.addEventListener("click", () => {
      clearSelection();
      deps.clearWaypoints();
      if (loadedWaypoints.length) deps.importWaypoints(loadedWaypoints);
      unsavedChanges = false;
      // A discarded draft has nothing to return to — always bounce to Browse.
      finishExit(isDraft ? "browse" : pendingExit);
    });
    el.querySelector("#dm-guard-save")!.addEventListener(
      "click",
      async () => {
        try {
          await persistCurrentPlan();
          finishExit(pendingExit);
        } catch (e) {
          const errEl = el.querySelector("#dm-plan-error") as HTMLElement;
          errEl.textContent = (e as Error).message;
          errEl.style.display = "block";
        }
      }
    );
  }

  function planHeaderHtml(): string {
    const dot = unsavedChanges
      ? '<span class="unsaved-dot" title="Unsaved changes"></span>'
      : "";
    const draftTag = isDraft
      ? '<span class="draft-tag" title="Not saved to your account yet">draft</span>'
      : "";
    const titleSlot = isDraft
      ? `<input type="text" id="dm-plan-name-input" class="plan-title-input"
           placeholder="Untitled plan" value="${escapeAttr(currentPlanName)}"
           aria-label="Plan name" />${draftTag}${dot}`
      : `<span class="plan-title">${escapeHtml(currentPlanName)}${dot}</span>`;
    return `
      <div class="plan-header">
        <button class="plan-back" id="dm-back" aria-label="Back">←</button>
        ${titleSlot}
      </div>
    `;
  }

  function wireDraftNameInput() {
    const input = el.querySelector("#dm-plan-name-input") as HTMLInputElement | null;
    if (!input) return;
    input.addEventListener("input", () => {
      currentPlanName = input.value;
    });
  }

  function summaryStripHtml(
    wps: ReturnType<PlanPanelDeps["exportWaypoints"]>
  ): string {
    if (!wps.length) {
      return `<div class="summary-strip">No waypoints yet</div>`;
    }
    const maxDepthFt =
      Math.max(...wps.map((w) => w.depth_m)) * deps.metersToFeet;
    const totalFt = totalDistanceMeters(wps) * deps.metersToFeet;
    const wpLabel = wps.length === 1 ? "waypoint" : "waypoints";
    return `<div class="summary-strip">${wps.length} ${wpLabel} · ${totalFt.toFixed(0)} ft · max ${maxDepthFt.toFixed(0)} ft</div>`;
  }

  function waypointListHtml(
    wps: ReturnType<PlanPanelDeps["exportWaypoints"]>,
    editable: boolean
  ): string {
    if (!wps.length) return "";
    return (
      `<div class="waypoint-list">` +
      wps
        .map(
          (w) => `
            <div class="waypoint-row${w.seq === selectedSeq ? " selected" : ""}" data-seq="${w.seq}">
              <span class="wp-seq">${w.seq}</span>
              <span class="wp-coords">${w.latitude.toFixed(4)}, ${w.longitude.toFixed(4)}</span>
              <span class="wp-depth">${(w.depth_m * deps.metersToFeet).toFixed(0)} ft</span>
              ${
                editable
                  ? `<button class="wp-row-delete" data-seq="${w.seq}" aria-label="Delete waypoint ${w.seq}">×</button>`
                  : ""
              }
            </div>
          `
        )
        .join("") +
      `</div>`
    );
  }

  function wireHeader() {
    el.querySelector("#dm-back")!.addEventListener("click", () =>
      requestExit("browse")
    );
    wireDraftNameInput();
  }

  function wireSave() {
    const saveBtn = el.querySelector("#dm-save") as HTMLButtonElement;
    saveBtn.addEventListener("click", async () => {
      if (!unsavedChanges) return;
      try {
        await persistCurrentPlan();
        render();
      } catch (e) {
        const errEl = el.querySelector("#dm-plan-error") as HTMLElement;
        errEl.textContent = (e as Error).message;
        errEl.style.display = "block";
      }
    });
  }

  function wireExportCsv() {
    el.querySelector("#dm-export-csv")?.addEventListener("click", () => {
      const wps = deps.exportWaypoints();
      if (!wps.length) return;
      const segments = deps.exportSegments();
      const csv = buildPlanCsv(wps, segments, deps.metersToFeet);
      downloadCsv(csvFilename(currentPlanName, isDraft), csv);
    });
  }

  /**
   * Persists the current plan to the backend. If it's a draft, creates the
   * plan row first; then replaces its waypoints with the current export.
   * Clears isDraft / unsavedChanges on success. Throws on API failure so
   * callers can surface the error inline.
   */
  async function persistCurrentPlan(): Promise<void> {
    if (!api.isLoggedIn()) {
      pendingSaveAfterLogin = true;
      (document.getElementById("dm-email") as HTMLInputElement | null)?.focus();
      throw new Error("Sign in or register below to save your plan.");
    }
    if (isDraft) {
      const name = currentPlanName.trim();
      if (!name) {
        const input = el.querySelector(
          "#dm-plan-name-input"
        ) as HTMLInputElement | null;
        input?.focus();
        throw new Error("Name your plan before saving.");
      }
      currentPlanName = name;
      const plan = await api.createPlan(1, name); // site_id=1 (Point Lobos)
      currentPlanId = plan.id;
      isDraft = false;
    }
    if (currentPlanId === null) return;
    const saved = await api.saveWaypoints(
      currentPlanId,
      deps.exportWaypoints()
    );
    loadedWaypoints = saved;
    unsavedChanges = false;
  }

  function requestExit(target: "browse" | "view") {
    // A draft with no backend record can't land in View — force Browse and
    // always confirm, since leaving without saving loses the plan entirely.
    const actualTarget = isDraft ? "browse" : target;
    if (editing && unsavedChanges) {
      pendingExit = actualTarget;
      render();
      return;
    }
    finishExit(actualTarget);
  }

  function finishExit(target: "browse" | "view" | null) {
    pendingExit = null;
    if (editing) {
      deps.setEditMode(false);
      editing = false;
    }
    if (target === "browse") {
      clearSelection();
      deps.clearWaypoints();
      currentPlanId = null;
      currentPlanName = "";
      loadedWaypoints = [];
      isDraft = false;
      pendingSaveAfterLogin = false;
    }
    render();
  }

  function makeErrorReporter() {
    const errEl = el.querySelector("#dm-plan-error") as HTMLElement;
    return (msg: string) => {
      errEl.textContent = msg;
      errEl.style.display = "block";
      setTimeout(() => (errEl.style.display = "none"), 4000);
    };
  }

  render();

  return {
    update: render,
    markDirty: () => {
      unsavedChanges = true;
      render();
    },
    handleEscape: () => {
      if (!editing) return false;
      requestExit("view");
      return true;
    },
    handleLogout: () => {
      resetStateForLogout();
      render();
    },
  };
}

function totalDistanceMeters(
  wps: Array<{ latitude: number; longitude: number }>
): number {
  let total = 0;
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1];
    const b = wps[i];
    total += haversine(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  return total;
}

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parsePlanCsv(text: string, metersToFeet: number): WaypointInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("CSV is empty.");

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) =>
    headers.findIndex((h) => names.includes(h));
  const latIdx = find("latitude", "lat");
  const lonIdx = find("longitude", "lon", "lng");
  const depthFtIdx = find("depth_ft", "depth (ft)", "depth ft");
  const depthMIdx = find("depth_m", "depth (m)", "depth m", "depth");

  if (latIdx < 0 || lonIdx < 0)
    throw new Error("CSV must have latitude and longitude columns.");
  if (depthFtIdx < 0 && depthMIdx < 0)
    throw new Error("CSV must have a depth_ft or depth_m column.");

  const waypoints: WaypointInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const lat = parseFloat(cells[latIdx]);
    const lon = parseFloat(cells[lonIdx]);
    const depth_m =
      depthMIdx >= 0
        ? parseFloat(cells[depthMIdx])
        : parseFloat(cells[depthFtIdx]) / metersToFeet;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(depth_m))
      throw new Error(`Row ${i + 1}: could not parse lat/lon/depth.`);
    waypoints.push({ latitude: lat, longitude: lon, depth_m });
  }
  return waypoints;
}

function buildPlanCsv(
  wps: Array<{ seq: number; latitude: number; longitude: number; depth_m: number }>,
  segments: Array<{ distFt: number; heading: number }>,
  metersToFeet: number
): string {
  const header =
    "seq,latitude,longitude,depth_ft,distance_to_next_ft,heading_to_next_magnetic";
  const rows = wps.map((w, i) => {
    const seg = segments[i];
    const depthFt = (w.depth_m * metersToFeet).toFixed(1);
    const dist = seg ? seg.distFt.toFixed(1) : "";
    const hdg = seg ? seg.heading.toFixed(1) : "";
    return `${w.seq},${w.latitude.toFixed(6)},${w.longitude.toFixed(6)},${depthFt},${dist},${hdg}`;
  });
  return [header, ...rows].join("\n") + "\n";
}

function csvFilename(name: string, isDraft: boolean): string {
  const base = name.trim() || (isDraft ? "draft-plan" : "dive-plan");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "dive-plan"}.csv`;
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
