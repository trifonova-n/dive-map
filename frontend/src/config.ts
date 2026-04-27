import { getSiteConfig } from "./api-client";

export interface SiteConfig {
  siteId: number;
  siteName: string;
  scenePath: string;
  magDeclination: number;
  midLabelLift: number;
  lineBrightness: string;
  routeTubeRadius: number;
  metersToFeet: number;
  labelOffsetPx: number;
  cameraDistanceFactor: number;
}

const STYLE_DEFAULTS = {
  midLabelLift: 5,
  lineBrightness: "0xc026d3",
  routeTubeRadius: 0.4,
  metersToFeet: 3.28084,
  labelOffsetPx: 6,
  cameraDistanceFactor: 1.5,
};

const FALLBACK_SCENE_PATH = "/data/sites/point-lobos/scene.js";
const FALLBACK_MAG_DECLINATION = -12.0;

/**
 * Load site config with triple fallback:
 *   1. Backend API (GET /api/sites/{siteId}/config)
 *   2. Static site-config.json (style/unit overrides only)
 *   3. Hardcoded defaults
 */
export async function loadConfig(siteId: number): Promise<SiteConfig> {
  // Style/unit overrides come from the static JSON; merged onto STYLE_DEFAULTS.
  let styleOverrides: Partial<typeof STYLE_DEFAULTS> = {};
  try {
    const resp = await fetch("./site-config.json");
    if (resp.ok) styleOverrides = await resp.json();
  } catch {
    // Static file missing is fine.
  }

  // Per-site values come from the backend.
  try {
    const site = await getSiteConfig(siteId);
    return {
      ...STYLE_DEFAULTS,
      ...styleOverrides,
      siteId: site.id,
      siteName: site.name,
      scenePath: site.scene_path,
      magDeclination: site.mag_declination,
    };
  } catch (e) {
    console.warn("Site config API unreachable, using fallbacks", e);
    return {
      ...STYLE_DEFAULTS,
      ...styleOverrides,
      siteId,
      siteName: "Unknown site",
      scenePath: FALLBACK_SCENE_PATH,
      magDeclination: FALLBACK_MAG_DECLINATION,
    };
  }
}
