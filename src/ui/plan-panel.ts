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
  importWaypoints: (waypoints: WaypointInput[]) => void;
  clearWaypoints: () => void;
  setEditMode: (flag: boolean) => void;
  metersToFeet: number;
}

export interface PlanPanelAPI {
  update: () => void;
  markDirty: () => void;
  /** Returns true if Escape was handled (editing was active). */
  handleEscape: () => boolean;
}

let currentPlanId: number | null = null;
let currentPlanName = "";
let editing = false;
let unsavedChanges = false;
let loadedWaypoints: api.WaypointAPI[] = [];
let pendingExit: "browse" | "view" | null = null;

export function createPlanPanel(
  container: HTMLElement,
  deps: PlanPanelDeps
): PlanPanelAPI {
  const el = document.createElement("div");
  el.className = "panel-box";
  el.style.display = "none";
  container.appendChild(el);

  async function render() {
    if (!api.isLoggedIn()) {
      el.style.display = "none";
      resetStateForLogout();
      return;
    }
    el.style.display = "block";

    if (pendingExit) {
      renderGuard();
    } else if (currentPlanId === null) {
      await renderBrowse();
    } else if (editing) {
      renderEdit();
    } else {
      renderView();
    }
  }

  function resetStateForLogout() {
    if (editing) deps.setEditMode(false);
    currentPlanId = null;
    currentPlanName = "";
    editing = false;
    unsavedChanges = false;
    loadedWaypoints = [];
    pendingExit = null;
  }

  async function renderBrowse() {
    let plans: api.DivePlanAPI[] = [];
    try {
      plans = await api.listPlans();
    } catch {
      // Backend may be down
    }

    const planListHtml = plans.length
      ? plans
          .map(
            (p) =>
              `<div class="plan-item" data-id="${p.id}">
                <span class="plan-name">${escapeHtml(p.name)}</span>
              </div>`
          )
          .join("")
      : '<div class="muted-line">No saved plans yet</div>';

    el.innerHTML = `
      <h3>Dive Plans</h3>
      ${planListHtml}
      <div class="plan-create-form">
        <input type="text" id="dm-plan-name" placeholder="New plan name" />
        <button class="primary" id="dm-create-plan">Create</button>
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;

    const showError = makeErrorReporter();

    el.querySelectorAll(".plan-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const id = Number((item as HTMLElement).dataset.id);
        try {
          const detail = await api.getPlan(id);
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

    el.querySelector("#dm-create-plan")!.addEventListener("click", async () => {
      const nameEl = el.querySelector("#dm-plan-name") as HTMLInputElement;
      const name = nameEl.value.trim();
      if (!name) return;
      try {
        const plan = await api.createPlan(1, name); // site_id=1 (Point Lobos)
        deps.clearWaypoints();
        currentPlanId = plan.id;
        currentPlanName = plan.name;
        loadedWaypoints = [];
        editing = false;
        unsavedChanges = false;
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
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;
    wireHeader();
    el.querySelector("#dm-edit")!.addEventListener("click", () => {
      editing = true;
      deps.setEditMode(true);
      render();
    });
    wireSave();
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
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;
    wireHeader();
    el.querySelector("#dm-done")!.addEventListener("click", () =>
      requestExit("view")
    );
    el.querySelectorAll(".wp-row-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const seq = Number((btn as HTMLElement).dataset.seq);
        const current = deps.exportWaypoints();
        const filtered = current.filter((w) => w.seq !== seq);
        deps.clearWaypoints();
        if (filtered.length) deps.importWaypoints(filtered);
        unsavedChanges = true;
        render();
      });
    });
    wireSave();
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
      deps.clearWaypoints();
      if (loadedWaypoints.length) deps.importWaypoints(loadedWaypoints);
      unsavedChanges = false;
      finishExit(pendingExit);
    });
    el.querySelector("#dm-guard-save")!.addEventListener(
      "click",
      async () => {
        if (!currentPlanId) return finishExit(pendingExit);
        try {
          const saved = await api.saveWaypoints(
            currentPlanId,
            deps.exportWaypoints()
          );
          loadedWaypoints = saved;
          unsavedChanges = false;
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
    return `
      <div class="plan-header">
        <button class="plan-back" id="dm-back" aria-label="Back">←</button>
        <span class="plan-title">${escapeHtml(currentPlanName)}${dot}</span>
      </div>
    `;
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
            <div class="waypoint-row">
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
  }

  function wireSave() {
    const saveBtn = el.querySelector("#dm-save") as HTMLButtonElement;
    saveBtn.addEventListener("click", async () => {
      if (!currentPlanId || !unsavedChanges) return;
      try {
        const saved = await api.saveWaypoints(
          currentPlanId,
          deps.exportWaypoints()
        );
        loadedWaypoints = saved;
        unsavedChanges = false;
        render();
      } catch (e) {
        const errEl = el.querySelector("#dm-plan-error") as HTMLElement;
        errEl.textContent = (e as Error).message;
        errEl.style.display = "block";
      }
    });
  }

  function requestExit(target: "browse" | "view") {
    if (editing && unsavedChanges) {
      pendingExit = target;
      render();
      return;
    }
    finishExit(target);
  }

  function finishExit(target: "browse" | "view" | null) {
    pendingExit = null;
    if (editing) {
      deps.setEditMode(false);
      editing = false;
    }
    if (target === "browse") {
      deps.clearWaypoints();
      currentPlanId = null;
      currentPlanName = "";
      loadedWaypoints = [];
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
      if (!unsavedChanges) {
        unsavedChanges = true;
        render();
      }
    },
    handleEscape: () => {
      if (!editing) return false;
      requestExit("view");
      return true;
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

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
