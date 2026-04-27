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
    const admin = api.isAdmin();
    // Admins also browse curated (public) landmarks so they can edit them;
    // regular users only see their own.
    const visible = admin
      ? landmarks
      : landmarks.filter((l) => l.user_id != null);
    let listHtml: string;
    if (!loggedIn) {
      listHtml =
        '<div class="muted-line">Sign in to add your own landmarks</div>';
    } else if (visible.length) {
      listHtml =
        '<div class="landmark-list">' +
        visible
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
      <h3>${admin ? "Landmarks" : "My Landmarks"}</h3>
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
      <label class="landmark-form-label">Image
        <input type="file" id="dm-landmark-image-file" accept="image/jpeg,image/png,image/webp" />
      </label>
      <div class="upload-status" id="dm-landmark-upload-status"></div>
      <input type="hidden" id="dm-landmark-image" />
      <div class="landmark-image-slot"></div>
      <div class="error" id="dm-landmark-error" style="display:${formError ? "block" : "none"}">${
        formError ? escapeHtml(formError) : ""
      }</div>
      <div class="actions-row">
        <button class="primary" id="dm-landmark-save">Save</button>
        <button class="secondary" id="dm-landmark-cancel">Cancel</button>
      </div>
    `;
    (el.querySelector("#dm-landmark-name") as HTMLInputElement).focus();
    const createImageInput = el.querySelector("#dm-landmark-image") as HTMLInputElement;
    const createPreviewSlot = el.querySelector(".landmark-image-slot") as HTMLElement;
    wireImagePreview(createImageInput, createPreviewSlot);
    wireFileUpload(
      el.querySelector("#dm-landmark-image-file") as HTMLInputElement,
      createImageInput,
      el.querySelector("#dm-landmark-upload-status") as HTMLElement
    );
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
    // The list endpoint only returns the caller's own landmarks (plus public
    // ones), so any non-null user_id seen here is the current user's.
    const ownsIt = l.user_id != null;
    const canEdit = ownsIt || (l.user_id == null && api.isAdmin());
    const canDelete = ownsIt;
    const depthLine =
      l.depth_m != null
        ? `depth: ${(Math.abs(l.depth_m) * deps.metersToFeet).toFixed(0)} ft`
        : "surface";
    const imageSlot = l.image_url ? `<div class="landmark-image-slot"></div>` : "";
    const descHtml = l.description
      ? `<div class="landmark-description"></div>`
      : "";
    el.innerHTML = `
      <div class="plan-header">
        <button class="plan-back" id="dm-landmark-back" aria-label="Back">←</button>
        <span class="plan-title">${escapeHtml(l.name)}</span>
      </div>
      ${imageSlot}
      ${descHtml}
      <div class="landmark-coords-line">
        ${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)} · ${depthLine}
      </div>
      ${
        canEdit || canDelete
          ? `<div class="actions-row">
               ${canEdit ? `<button class="secondary" id="dm-landmark-edit">Edit</button>` : ""}
               ${canDelete ? `<button class="danger" id="dm-landmark-delete">Delete</button>` : ""}
             </div>
             <div class="error" id="dm-landmark-error" style="display:none"></div>`
          : ""
      }
    `;
    // Description is user-supplied text — render via textContent so HTML is inert.
    const descEl = el.querySelector(".landmark-description") as HTMLDivElement | null;
    if (descEl && l.description) descEl.textContent = l.description;
    // Image: build via DOM API so the URL is treated as a literal src value
    // (no HTML-attribute escaping pitfalls) and we can hide cleanly on error.
    if (l.image_url) {
      const slot = el.querySelector(".landmark-image-slot") as HTMLElement | null;
      if (slot) {
        const img = document.createElement("img");
        img.className = "landmark-image-preview";
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", () => slot.remove());
        img.src = l.image_url;
        slot.appendChild(img);
      }
    }

    el.querySelector("#dm-landmark-back")!.addEventListener("click", () => {
      selectedId = null;
      mode = "browse";
      render();
    });
    if (canEdit) {
      el.querySelector("#dm-landmark-edit")!.addEventListener("click", () => {
        formError = null;
        mode = "edit-form";
        render();
      });
    }
    if (canDelete) {
      el.querySelector("#dm-landmark-delete")!.addEventListener("click", async () => {
        await submitDelete(l.id);
      });
    }
  }

  function renderEditForm() {
    const l = landmarks.find((x) => x.id === selectedId);
    const canEdit =
      !!l &&
      ((l.user_id != null) || (l.user_id == null && api.isAdmin()));
    if (!l || !canEdit) {
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
      <label class="landmark-form-label">Image
        <input type="file" id="dm-landmark-image-file" accept="image/jpeg,image/png,image/webp" />
      </label>
      <div class="upload-status" id="dm-landmark-upload-status"></div>
      <input type="hidden" id="dm-landmark-image" />
      <div class="landmark-image-slot"></div>
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
    const imageInput = el.querySelector("#dm-landmark-image") as HTMLInputElement;
    imageInput.value = l.image_url ?? "";
    const previewSlot = el.querySelector(".landmark-image-slot") as HTMLElement;
    wireImagePreview(imageInput, previewSlot);
    wireFileUpload(
      el.querySelector("#dm-landmark-image-file") as HTMLInputElement,
      imageInput,
      el.querySelector("#dm-landmark-upload-status") as HTMLElement
    );

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

/**
 * Live preview for an image-URL input: renders the URL into `slot` as an
 * `<img>`, hides the slot when blank or when loading fails. Debounced to
 * avoid hammering the network as the user types.
 */
function wireImagePreview(input: HTMLInputElement, slot: HTMLElement): void {
  let debounce: number | undefined;
  function refresh() {
    const url = input.value.trim();
    slot.innerHTML = "";
    if (!url) return;
    const img = document.createElement("img");
    img.className = "landmark-image-preview";
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => (slot.innerHTML = ""));
    img.src = url;
    slot.appendChild(img);
  }
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(refresh, 400);
  });
  refresh();
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function wireFileUpload(
  fileInput: HTMLInputElement,
  hiddenUrl: HTMLInputElement,
  status: HTMLElement
): void {
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      status.textContent = "Image is too large. Max 5 MB.";
      fileInput.value = "";
      return;
    }
    status.textContent = "Uploading…";
    try {
      const url = await api.uploadLandmarkImage(f);
      hiddenUrl.value = url;
      status.textContent = "";
      hiddenUrl.dispatchEvent(new Event("input"));
    } catch (e) {
      status.textContent = (e as Error).message;
      fileInput.value = "";
    }
  });
}
