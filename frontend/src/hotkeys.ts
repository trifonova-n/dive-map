import type { WaypointLabelManager } from "./waypoint-labels";

export interface HotkeyOptions {
  /** Return true if Escape was handled (prevents Q3D's handler from firing). */
  onEscape?: () => boolean;
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
