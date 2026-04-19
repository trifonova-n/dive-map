export interface SiteConfig {
  magDeclination: number;
  midLabelLift: number;
  lineBrightness: string;
  metersToFeet: number;
  labelOffsetPx: number;
  cameraDistanceFactor: number;
}

const DEFAULTS: SiteConfig = {
  magDeclination: -12.0,
  midLabelLift: 5,
  lineBrightness: "0xffff66",
  metersToFeet: 3.28084,
  labelOffsetPx: 6,
  cameraDistanceFactor: 1.5,
};

export async function loadConfig(): Promise<SiteConfig> {
  try {
    const resp = await fetch("./site-config.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return { ...DEFAULTS, ...json };
  } catch (e) {
    console.warn("Failed to load site-config.json, using defaults", e);
    return { ...DEFAULTS };
  }
}
