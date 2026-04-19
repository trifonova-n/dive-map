import type { WaypointLabelManager } from "./waypoint-labels";

/**
 * Registers keyboard shortcuts.
 * Shift+L toggles waypoint label visibility.
 */
export function registerHotkeys(waypointMgr: WaypointLabelManager): void {
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const key = e.key || "";
      const isShiftL =
        e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        (key === "L" || key === "l");

      if (isShiftL) {
        e.preventDefault();
        e.stopImmediatePropagation();
        waypointMgr.toggle();
      }
    },
    true // capture phase — intercept before Q3D's key handler
  );
}
