import * as api from "../api-client";

export interface PlanPanelDeps {
  exportWaypoints: () => Array<{ seq: number; latitude: number; longitude: number; depth_m: number }>;
  importWaypoints: (waypoints: api.WaypointAPI[]) => void;
  clearWaypoints: () => void;
}

let currentPlanId: number | null = null;

export function createPlanPanel(
  container: HTMLElement,
  deps: PlanPanelDeps
): { update: () => void } {
  const el = document.createElement("div");
  el.className = "panel-box";
  el.style.display = "none";
  container.appendChild(el);

  async function render() {
    if (!api.isLoggedIn()) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";

    let plans: api.DivePlanAPI[] = [];
    try {
      plans = await api.listPlans();
    } catch {
      // Backend may be down
    }

    const planListHtml = plans
      .map(
        (p) =>
          `<div class="plan-item" data-id="${p.id}">
            <span class="plan-name">${escapeHtml(p.name)}</span>
          </div>`
      )
      .join("");

    const activeLabel = currentPlanId
      ? `Active: <strong>${escapeHtml(plans.find((p) => p.id === currentPlanId)?.name || "")}</strong>`
      : "No plan selected";

    el.innerHTML = `
      <h3>Dive Plans</h3>
      <div style="margin-bottom:8px;font-size:11px;color:#aaa">${activeLabel}</div>
      ${planListHtml || '<div style="color:#888;font-size:12px">No saved plans</div>'}
      <div style="margin-top:8px">
        <input type="text" id="dm-plan-name" placeholder="New plan name" />
        <button class="primary" id="dm-create-plan">Create</button>
      </div>
      <div style="margin-top:6px">
        <button class="primary" id="dm-save" ${currentPlanId ? "" : "disabled"}>Save</button>
        <button class="secondary" id="dm-clear">Clear map</button>
      </div>
      <div class="error" id="dm-plan-error" style="display:none"></div>
    `;

    const errEl = el.querySelector("#dm-plan-error") as HTMLElement;

    function showError(msg: string) {
      errEl.textContent = msg;
      errEl.style.display = "block";
      setTimeout(() => (errEl.style.display = "none"), 4000);
    }

    // Load plan on click
    el.querySelectorAll(".plan-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const id = Number((item as HTMLElement).dataset.id);
        try {
          const detail = await api.getPlan(id);
          deps.clearWaypoints();
          if (detail.waypoints.length) {
            deps.importWaypoints(detail.waypoints);
          }
          currentPlanId = id;
          render();
        } catch (e) {
          showError((e as Error).message);
        }
      });
    });

    // Create plan
    el.querySelector("#dm-create-plan")!.addEventListener("click", async () => {
      const nameEl = el.querySelector("#dm-plan-name") as HTMLInputElement;
      const name = nameEl.value.trim();
      if (!name) return;
      try {
        const plan = await api.createPlan(1, name); // site_id=1 (Point Lobos)
        currentPlanId = plan.id;
        nameEl.value = "";
        render();
      } catch (e) {
        showError((e as Error).message);
      }
    });

    // Save waypoints
    el.querySelector("#dm-save")!.addEventListener("click", async () => {
      if (!currentPlanId) return;
      try {
        const wps = deps.exportWaypoints();
        await api.saveWaypoints(currentPlanId, wps);
        showError(""); // clear
        errEl.textContent = "Saved!";
        errEl.style.color = "#8f8";
        errEl.style.display = "block";
        setTimeout(() => {
          errEl.style.display = "none";
          errEl.style.color = "";
        }, 2000);
      } catch (e) {
        showError((e as Error).message);
      }
    });

    // Clear map
    el.querySelector("#dm-clear")!.addEventListener("click", () => {
      deps.clearWaypoints();
    });
  }

  render();
  return { update: render };
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
