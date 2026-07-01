/**
 * Movement-speed presets and swim-time helpers for route segment timing.
 *
 * Speed is a diver preference (not site config): the user picks a preset and
 * every route leg shows how long it takes at that speed. "Off" is the absence
 * of a selection (`null`) — no time is shown. Speeds are metres/minute (the
 * diver convention); distances stay in feet elsewhere in the app.
 */

export interface SpeedPreset {
  id: string;
  label: string;
  /** Movement speed in metres per minute. */
  mPerMin: number;
}

/**
 * Ordered speed presets. "Off" (no timing) is represented as `null`, not an
 * entry here — see the speed panel, which prepends an Off option.
 */
export const SPEED_PRESETS: readonly SpeedPreset[] = [
  { id: "relaxed", label: "Relaxed", mPerMin: 10 },
  { id: "fast", label: "Fast", mPerMin: 20 },
  { id: "dpv-slow", label: "DPV slow", mPerMin: 30 },
  { id: "dpv-fast", label: "DPV fast", mPerMin: 55 },
];

/** Seconds to cover `distFt` feet at `mPerMin` metres/minute. */
export function swimTimeSeconds(
  distFt: number,
  mPerMin: number,
  metersToFeet: number
): number {
  if (mPerMin <= 0) return 0;
  const distMeters = distFt / metersToFeet;
  return (distMeters / mPerMin) * 60;
}

/** Formats a duration as `M:SS`, or `H:MM:SS` when an hour or longer. */
export function formatSwimTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) {
    const mm = String(m).padStart(2, "0");
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

const LS_KEY = "q3d_selectedSpeedMPerMin";

/**
 * Loads the persisted speed selection (m/min), or `null` for Off / unavailable.
 * A stored value that no longer matches a known preset is treated as Off.
 */
export function loadStoredSpeed(): number | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === null || v === "off") return null;
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return SPEED_PRESETS.some((p) => p.mPerMin === n) ? n : null;
  } catch {
    return null;
  }
}

/** Persists the speed selection; `null` stores Off. Fails silently. */
export function saveStoredSpeed(mPerMin: number | null): void {
  try {
    localStorage.setItem(LS_KEY, mPerMin === null ? "off" : String(mPerMin));
  } catch {
    // localStorage unavailable
  }
}
