import { getSiteConfig } from "./api-client";

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
  lineBrightness: "0xc026d3",
  metersToFeet: 3.28084,
  labelOffsetPx: 6,
  cameraDistanceFactor: 1.5,
};

/**
 * Load site config with triple fallback:
 *   1. Backend API (GET /api/sites/1/config)
 *   2. Static site-config.json
 *   3. Hardcoded defaults
 */
export async function loadConfig(): Promise<SiteConfig> {
  // Try backend API first
  try {
    const site = await getSiteConfig(1);
    return {
      ...DEFAULTS,
      magDeclination: site.mag_declination,
    };
  } catch {
    // Backend not available, fall through
  }

  // Try static file
  try {
    const resp = await fetch("./site-config.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return { ...DEFAULTS, ...json };
  } catch (e) {
    console.warn("Failed to load site config, using defaults", e);
    return { ...DEFAULTS };
  }
}
