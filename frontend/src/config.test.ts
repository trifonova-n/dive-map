import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config";

// Mock the api-client module so loadConfig doesn't make real HTTP calls
vi.mock("./api-client", () => ({
  getSiteConfig: vi.fn(),
}));

import { getSiteConfig } from "./api-client";
const mockGetSiteConfig = vi.mocked(getSiteConfig);

beforeEach(() => {
  vi.restoreAllMocks();
  // Suppress console.warn in tests
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Default: static site-config.json fetch resolves to a minimal JSON.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  }) as unknown as typeof fetch;
});

describe("loadConfig", () => {
  it("uses backend API for per-site values when available", async () => {
    mockGetSiteConfig.mockResolvedValue({
      id: 7,
      name: "Test Site",
      latitude: 36.5,
      longitude: -121.9,
      mag_declination: -14.5,
      crs_proj4: "+proj=utm +zone=10",
      z_scale: 2.0,
      base_extent: null,
      scene_path: "/data/sites/test/scene.js",
    });

    const config = await loadConfig(7);
    expect(config.siteId).toBe(7);
    expect(config.siteName).toBe("Test Site");
    expect(config.scenePath).toBe("/data/sites/test/scene.js");
    expect(config.magDeclination).toBe(-14.5);
    // Style/unit defaults still apply.
    expect(config.metersToFeet).toBe(3.28084);
    expect(config.midLabelLift).toBe(5);
  });

  it("merges style overrides from the static JSON", async () => {
    mockGetSiteConfig.mockResolvedValue({
      id: 1,
      name: "Point Lobos",
      latitude: 36.55,
      longitude: -121.94,
      mag_declination: -12.0,
      crs_proj4: "+proj=utm +zone=10",
      z_scale: 2.0,
      base_extent: null,
      scene_path: "/data/sites/point-lobos/scene.js",
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ lineBrightness: "0xff0000", labelOffsetPx: 9 }),
    }) as unknown as typeof fetch;

    const config = await loadConfig(1);
    expect(config.lineBrightness).toBe("0xff0000");
    expect(config.labelOffsetPx).toBe(9);
    // Per-site values still come from the API, not the JSON.
    expect(config.magDeclination).toBe(-12.0);
  });

  it("falls back to defaults when the API is unreachable", async () => {
    mockGetSiteConfig.mockRejectedValue(new Error("network error"));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const config = await loadConfig(1);
    expect(config.siteId).toBe(1);
    expect(config.scenePath).toBe("/data/sites/point-lobos/scene.js");
    expect(config.magDeclination).toBe(-12.0);
    expect(config.metersToFeet).toBe(3.28084);
    expect(config.lineBrightness).toBe("0xc026d3");
    expect(config.labelOffsetPx).toBe(6);
    expect(config.cameraDistanceFactor).toBe(1.5);
  });
});
