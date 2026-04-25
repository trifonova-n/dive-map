import * as api from "../api-client";
import type { LandmarkAPI } from "../api-client";

export interface LandmarkPanelDeps {
  siteId: number;
  metersToFeet: number;
  /**
   * Toggle landmark placement mode. When on, the next map click is captured
   * and forwarded to `handlePlacementPick`; plan-edit mode (if active) is
   * cancelled. Implementation lives in main.ts where plan-panel is visible.
   */
  setPlacementActive: (flag: boolean) => void;
  /**
   * Convert a world-space point picked by the measure tool into
   * { latitude, longitude, depth_m }. depth_m is null for surface picks.
   */
  worldToLatLonDepth: (pt: THREE.Vector3) => {
    latitude: number;
    longitude: number;
    depth_m: number | null;
  };
  /** Mirror scene state when landmarks change. */
  onLandmarkCreated: (landmark: LandmarkAPI) => void;
  onLandmarkUpdated: (landmark: LandmarkAPI) => void;
  onLandmarkRemoved: (id: number) => void;
  /**
   * Replace all scene landmarks (used on login/logout refetch).
   */
  resetScene: (landmarks: LandmarkAPI[]) => void;
}

export interface LandmarkPanelAPI {
  selectLandmark: (id: number) => void;
  handlePlacementPick: (pt: THREE.Vector3) => void;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  /** Returns true if Escape was handled. */
  handleEscape: () => boolean;
}

type Mode = "browse" | "placing" | "create-form" | "detail" | "edit-form";

interface PendingPosition {
  latitude: number;
  longitude: number;
  depth_m: number | null;
}

export function createLandmarkPanel(
  container: HTMLElement,
  deps: LandmarkPanelDeps
): LandmarkPanelAPI {
  const el = document.createElement("div");
  el.className = "panel-box landmark-panel";
  container.appendChild(el);

  let landmarks: LandmarkAPI[] = [];
  let mode: Mode = "browse";
  let pendingPosition: PendingPosition | null = null;
  let selectedId: number | null = null;
  let formError: string | null = null;

  function render() {
    if (mode === "browse") renderBrowse();
    else if (mode === "placing") renderPlacing();
    else if (mode === "create-form") renderCreateForm();
    else if (mode === "detail") renderDetail();
    else if (mode === "edit-form") renderEditForm();
  }

  function renderBrowse() {
    const loggedIn = api.isLoggedIn();
    const owned = landmarks.filter((l) => l.user_id != null);
    let listHtml: string;
    if (!loggedIn) {
      listHtml =
        '<div class="muted-line">Sign in to add your own landmarks</div>';
    } else if (owned.length) {
      listHtml =
        '<div class="landmark-list">' +
        owned
          .map(
            (l) =>
              `<div class="landmark-item" data-id="${l.id}">
                <span class="landmark-name">${escapeHtml(l.name)}</span>
                ${
                  l.depth_m != null
                    ? `<span class="landmark-depth">${(
                        Math.abs(l.depth_m) * deps.metersToFeet
                      ).toFixed(0)} ft</span>`
                    : ""
                }
              </div>`
          )
          .join("") +
        "</div>";
    } else {
      listHtml = '<div class="muted-line">No landmarks yet</div>';
    }

    el.innerHTML = `
      <h3>My Landmarks</h3>
      ${listHtml}
      <div class="actions-row">
        <button class="primary" id="dm-landmark-add" ${
          loggedIn ? "" : "disabled"
        }>+ Add landmark</button>
      </div>
    `;

    el.querySelectorAll(".landmark-item").forEach((item) => {
      item.addEventListener("click", () => {
        const id = Number((item as HTMLElement).dataset.id);
        selectLandmark(id);
      });
    });

    const addBtn = el.querySelector("#dm-landmark-add") as HTMLButtonElement | null;
    addBtn?.addEventListener("click", () => {
      if (!api.isLoggedIn()) return;
      startPlacement();
    });
  }

  function renderPlacing() {
    el.innerHTML = `
      <h3>New Landmark</h3>
      <div class="edit-hint">Click the map to place your landmark</div>
      <div class="actions-row">
        <button class="secondary" id="dm-landmark-cancel">Cancel</button>
      </div>
    `;
    el.querySelector("#dm-landmark-cancel")!.addEventListener("click", () => {
      cancelPlacement();
    });
  }

  function renderCreateForm() {
    if (!pendingPosition) {
      mode = "browse";
      render();
      return;
    }
    const depthLine =
      pendingPosition.depth_m != null
        ? `depth: ${(pendingPosition.depth_m * deps.metersToFeet).toFixed(0)} ft`
        : "surface";
    el.innerHTML = `
      <h3>New Landmark</h3>
      <div class="landmark-coords-line">
        ${pendingPosition.latitude.toFixed(5)}, ${pendingPosition.longitude.toFixed(5)} · ${depthLine}
      </div>
      <label class="landmark-form-label">Name
        <input type="text" id="dm-landmark-name" maxlength="120" placeholder="Required" />
      </label>
      <label class="landmark-form-label">Description
        <textarea id="dm-landmark-desc" rows="3" placeholder="Optional"></textarea>
      </label>
      <label class="landmark-form-label">Image URL
        <input type="text" id="dm-landmark-image" maxlength="500" placeholder="Optional" />
      </label>
      <div class="error" id="dm-landmark-error" style="display:${formError ? "block" : "none"}">${
        formError ? escapeHtml(formError) : ""
      }</div>
      <div class="actions-row">
        <button class="primary" id="dm-landmark-save">Save</button>
        <button class="secondary" id="dm-landmark-cancel">Cancel</button>
      </div>
    `;
    (el.querySelector("#dm-landmark-name") as HTMLInputElement).focus();
    el.querySelector("#dm-landmark-save")!.addEventListener("click", async () => {
      await submitCreateForm();
    });
    el.querySelector("#dm-landmark-cancel")!.addEventListener("click", () => {
      pendingPosition = null;
      formError = null;
      mode = "browse";
      render();
    });
  }

  function renderDetail() {
    const l = landmarks.find((x) => x.id === selectedId);
    if (!l) {
      selectedId = null;
      mode = "browse";
      render();
      return;
    }
    const ownsIt = l.user_id != null;
    const depthLine =
      l.depth_m != null
        ? `depth: ${(Math.abs(l.depth_m) * deps.metersToFeet).toFixed(0)} ft`
        : "surface";
    const imageHtml = l.image_url
      ? `<img class="landmark-image-preview" src="${escapeAttr(
          l.image_url
        )}" alt="" onerror="this.style.display='none'" />`
      : "";
    const descHtml = l.description
      ? `<div class="landmark-description"></div>`
      : "";
    el.innerHTML = `
      <div class="plan-header">
        <button class="plan-back" id="dm-landmark-back" aria-label="Back">←</button>
        <span class="plan-title">${escapeHtml(l.name)}</span>
      </div>
      ${imageHtml}
      ${descHtml}
      <div class="landmark-coords-line">
        ${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)} · ${depthLine}
      </div>
      ${
        ownsIt
          ? `<div class="actions-row">
               <button class="secondary" id="dm-landmark-edit">Edit</button>
               <button class="danger" id="dm-landmark-delete">Delete</button>
             </div>
             <div class="error" id="dm-landmark-error" style="display:none"></div>`
          : ""
      }
    `;
    // Description is user-supplied text — render via textContent so HTML is inert.
    const descEl = el.querySelector(".landmark-description") as HTMLDivElement | null;
    if (descEl && l.description) descEl.textContent = l.description;

    el.querySelector("#dm-landmark-back")!.addEventListener("click", () => {
      selectedId = null;
      mode = "browse";
      render();
    });
    if (ownsIt) {
      el.querySelector("#dm-landmark-edit")!.addEventListener("click", () => {
        formError = null;
        mode = "edit-form";
        render();
      });
      el.querySelector("#dm-landmark-delete")!.addEventListener("click", async () => {
        await submitDelete(l.id);
      });
    }
  }

  function renderEditForm() {
    const l = landmarks.find((x) => x.id === selectedId);
    if (!l || l.user_id == null) {
      mode = "detail";
      render();
      return;
    }
    const depthLine =
      l.depth_m != null
        ? `depth: ${(Math.abs(l.depth_m) * deps.metersToFeet).toFixed(0)} ft`
        : "surface";
    el.innerHTML = `
      <div class="plan-header">
        <button class="plan-back" id="dm-landmark-back" aria-label="Back">←</button>
        <span class="plan-title">Edit landmark</span>
      </div>
      <div class="landmark-coords-line">
        ${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)} · ${depthLine}
      </div>
      <label class="landmark-form-label">Name
        <input type="text" id="dm-landmark-name" maxlength="120" />
      </label>
      <label class="landmark-form-label">Description
        <textarea id="dm-landmark-desc" rows="3"></textarea>
      </label>
      <label class="landmark-form-label">Image URL
        <input type="text" id="dm-landmark-image" maxlength="500" />
      </label>
      <div class="error" id="dm-landmark-error" style="display:${formError ? "block" : "none"}">${
        formError ? escapeHtml(formError) : ""
      }</div>
      <div class="actions-row">
        <button class="primary" id="dm-landmark-save">Save</button>
        <button class="secondary" id="dm-landmark-cancel">Cancel</button>
      </div>
    `;
    (el.querySelector("#dm-landmark-name") as HTMLInputElement).value = l.name;
    (el.querySelector("#dm-landmark-desc") as HTMLTextAreaElement).value =
      l.description ?? "";
    (el.querySelector("#dm-landmark-image") as HTMLInputElement).value =
      l.image_url ?? "";

    el.querySelector("#dm-landmark-back")!.addEventListener("click", () => {
      formError = null;
      mode = "detail";
      render();
    });
    el.querySelector("#dm-landmark-cancel")!.addEventListener("click", () => {
      formError = null;
      mode = "detail";
      render();
    });
    el.querySelector("#dm-landmark-save")!.addEventListener("click", async () => {
      await submitEditForm(l.id);
    });
  }

  function startPlacement() {
    // Entering placement cancels any plan-edit in progress (handled by dep).
    pendingPosition = null;
    formError = null;
    mode = "placing";
    deps.setPlacementActive(true);
    render();
  }

  function cancelPlacement() {
    if (mode === "placing") {
      deps.setPlacementActive(false);
      mode = "browse";
      render();
    }
  }

  async function submitCreateForm() {
    if (!pendingPosition) return;
    const name = (el.querySelector("#dm-landmark-name") as HTMLInputElement).value.trim();
    const description = (el.querySelector("#dm-landmark-desc") as HTMLTextAreaElement).value.trim();
    const image_url = (el.querySelector("#dm-landmark-image") as HTMLInputElement).value.trim();
    if (!name) {
      setFormError("Give your landmark a name.");
      return;
    }
    try {
      const created = await api.createLandmark(deps.siteId, {
        name,
        latitude: pendingPosition.latitude,
        longitude: pendingPosition.longitude,
        depth_m: pendingPosition.depth_m,
        description: description || null,
        image_url: image_url || null,
      });
      landmarks.push(created);
      deps.onLandmarkCreated(created);
      pendingPosition = null;
      formError = null;
      selectedId = created.id;
      mode = "detail";
      render();
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function submitEditForm(id: number) {
    const name = (el.querySelector("#dm-landmark-name") as HTMLInputElement).value.trim();
    const description = (el.querySelector("#dm-landmark-desc") as HTMLTextAreaElement).value.trim();
    const image_url = (el.querySelector("#dm-landmark-image") as HTMLInputElement).value.trim();
    if (!name) {
      setFormError("Give your landmark a name.");
      return;
    }
    try {
      const updated = await api.updateLandmark(id, {
        name,
        description: description || null,
        image_url: image_url || null,
      });
      const idx = landmarks.findIndex((x) => x.id === id);
      if (idx >= 0) landmarks[idx] = updated;
      deps.onLandmarkUpdated(updated);
      formError = null;
      mode = "detail";
      render();
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function submitDelete(id: number) {
    try {
      await api.deleteLandmark(id);
      landmarks = landmarks.filter((x) => x.id !== id);
      deps.onLandmarkRemoved(id);
      selectedId = null;
      mode = "browse";
      render();
    } catch (e) {
      const errEl = el.querySelector("#dm-landmark-error") as HTMLElement | null;
      if (errEl) {
        errEl.textContent = (e as Error).message;
        errEl.style.display = "block";
      }
    }
  }

  function setFormError(msg: string) {
    formError = msg;
    const errEl = el.querySelector("#dm-landmark-error") as HTMLElement | null;
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    }
  }

  function selectLandmark(id: number) {
    // If a form is open, don't disrupt it.
    if (mode === "create-form" || mode === "edit-form") return;
    if (mode === "placing") cancelPlacement();
    selectedId = id;
    mode = "detail";
    render();
  }

  async function refetchAndReset() {
    try {
      const rows = await api.getLandmarks(deps.siteId);
      landmarks = rows;
      deps.resetScene(rows);
    } catch (e) {
      console.warn("Refetch landmarks failed", e);
    }
  }

  // Initial render (bootstrap loads the initial list and calls resetScene
  // via main.ts; we seed our own cache from a fetch too so the panel list
  // has the ids/descriptions.)
  (async () => {
    try {
      landmarks = await api.getLandmarks(deps.siteId);
    } catch {
      // ignore
    }
    render();
  })();

  return {
    selectLandmark,
    handlePlacementPick: (pt) => {
      if (mode !== "placing") return;
      const pos = deps.worldToLatLonDepth(pt);
      pendingPosition = pos;
      deps.setPlacementActive(false);
      formError = null;
      mode = "create-form";
      render();
    },
    handleLogin: async () => {
      await refetchAndReset();
      mode = "browse";
      selectedId = null;
      render();
    },
    handleLogout: async () => {
      if (mode === "placing") deps.setPlacementActive(false);
      selectedId = null;
      pendingPosition = null;
      mode = "browse";
      await refetchAndReset();
      render();
    },
    handleEscape: () => {
      if (mode === "placing") {
        cancelPlacement();
        return true;
      }
      if (mode === "create-form" || mode === "edit-form") {
        formError = null;
        pendingPosition = null;
        mode = selectedId != null && mode === "edit-form" ? "detail" : "browse";
        render();
        return true;
      }
      return false;
    },
  };
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
