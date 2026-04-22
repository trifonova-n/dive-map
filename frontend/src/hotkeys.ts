import type { WaypointLabelManager } from "./waypoint-labels";

export interface HotkeyOptions {
  /** Return true if Escape was handled (prevents Q3D's handler from firing). */
  onEscape?: () => boolean;
}

/**
 * Removes Qgis2threejs's built-in `keydown` handler (W, L, R, I, Esc,
 * Backspace, Enter, Shift+R, Shift+S). The vendor listener is bound on
 * `window` with no input-focus guard, so it fires while typing in form
 * fields. Call this after `app.init()` to disable all of them.
 */
export function disableQ3DHotkeys(app: Q3DApplication): void {
  const handler = app.eventListener?.keydown;
  if (handler) window.removeEventListener("keydown", handler);
}

/**
 * Registers keyboard shortcuts.
 * Shift+L toggles waypoint label visibility.
 * Escape (when onEscape returns true) exits plan-panel edit mode.
 */
export function registerHotkeys(
  waypointMgr: WaypointLabelManager,
  opts: HotkeyOptions = {}
): void {
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
        return;
      }

      const isEscape =
        key === "Escape" &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.shiftKey;

      if (isEscape && opts.onEscape?.()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true // capture phase — intercept before Q3D's key handler
  );
}
