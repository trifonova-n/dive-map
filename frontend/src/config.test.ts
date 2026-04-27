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
});

describe("loadConfig", () => {
  it("uses backend API when available", async () => {
    mockGetSiteConfig.mockResolvedValue({
      id: 1,
      name: "Point Lobos",
      mag_declination: -14.5,
      crs_proj4: "+proj=utm +zone=10",
      z_scale: 2.0,
      base_extent: null,
    });

    const config = await loadConfig();
    expect(config.magDeclination).toBe(-14.5);
    // Other fields should be defaults
    expect(config.metersToFeet).toBe(3.28084);
    expect(config.midLabelLift).toBe(5);
  });

  it("falls back to static file when API fails", async () => {
    mockGetSiteConfig.mockRejectedValue(new Error("network error"));

    // Mock fetch for the static file fallback
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ magDeclination: -11.0 }),
    }) as unknown as typeof fetch;

    const config = await loadConfig();
    expect(config.magDeclination).toBe(-11.0);
    expect(config.metersToFeet).toBe(3.28084);
  });

  it("falls back to hardcoded defaults when everything fails", async () => {
    mockGetSiteConfig.mockRejectedValue(new Error("network error"));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const config = await loadConfig();
    expect(config.magDeclination).toBe(-12.0);
    expect(config.metersToFeet).toBe(3.28084);
    expect(config.lineBrightness).toBe("0xc026d3");
    expect(config.labelOffsetPx).toBe(6);
    expect(config.cameraDistanceFactor).toBe(1.5);
  });
});
