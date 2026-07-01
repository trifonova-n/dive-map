import { SPEED_PRESETS, loadStoredSpeed, saveStoredSpeed } from "../speed";

export interface SpeedPanelDeps {
  /** Fired whenever the selection changes; `null` means Off (no timing). */
  onChange: (mPerMin: number | null) => void;
}

export interface SpeedPanelAPI {
  /** Current selection in m/min, or `null` for Off. */
  getSpeed: () => number | null;
  /** Advance to the next option (Off → Relaxed → … → DPV fast → Off). */
  cycle: () => void;
}

/** Selectable options, with "Off" (no timing) prepended as `mPerMin: null`. */
const OPTIONS: ReadonlyArray<{ label: string; mPerMin: number | null }> = [
  { label: "Off", mPerMin: null },
  ...SPEED_PRESETS.map((p) => ({ label: p.label, mPerMin: p.mPerMin })),
];

/**
 * Always-visible speed selector. Renders a pill row (desktop) and a single
 * cycle button (narrow / AR); CSS shows exactly one. Selecting a speed is the
 * toggle that reveals per-leg times — Off (the default) hides all timing.
 */
export function createSpeedPanel(
  container: HTMLElement,
  deps: SpeedPanelDeps
): SpeedPanelAPI {
  let selected: number | null = loadStoredSpeed();

  const el = document.createElement("div");
  el.className = "panel-box speed-panel";
  container.appendChild(el);

  const pills = document.createElement("div");
  pills.className = "speed-pills";
  const cycleBtn = document.createElement("button");
  cycleBtn.className = "speed-cycle-btn";

  const pillButtons: HTMLButtonElement[] = OPTIONS.map((opt) => {
    const b = document.createElement("button");
    b.className = "speed-pill";
    b.textContent = opt.label;
    if (opt.mPerMin !== null) b.title = `${opt.mPerMin} m/min`;
    b.addEventListener("click", () => select(opt.mPerMin));
    pills.appendChild(b);
    return b;
  });

  cycleBtn.addEventListener("click", () => cycle());

  el.appendChild(pills);
  el.appendChild(cycleBtn);
  paint();

  function currentIndex(): number {
    const idx = OPTIONS.findIndex((o) => o.mPerMin === selected);
    return idx < 0 ? 0 : idx;
  }

  function paint(): void {
    const idx = currentIndex();
    pillButtons.forEach((b, i) => b.classList.toggle("active", i === idx));
    const opt = OPTIONS[idx];
    cycleBtn.textContent =
      opt.mPerMin === null ? "Speed: Off" : `${opt.label} ${opt.mPerMin} m/min`;
    cycleBtn.classList.toggle("active", opt.mPerMin !== null);
  }

  function select(mPerMin: number | null): void {
    if (mPerMin === selected) return;
    selected = mPerMin;
    saveStoredSpeed(selected);
    paint();
    deps.onChange(selected);
  }

  function cycle(): void {
    const next = OPTIONS[(currentIndex() + 1) % OPTIONS.length];
    select(next.mPerMin);
  }

  return {
    getSpeed: () => selected,
    cycle,
  };
}
