import { describe, it, expect, vi, beforeEach } from "vitest";
import { toLonLatXY } from "./crs";

function makeUserData(
  overrides: Partial<Q3DSceneUserData> = {}
): Q3DSceneUserData {
  return {
    origin: { x: 0, y: 0, z: 0 },
    zScale: 2.0,
    baseExtent: { cx: 0, cy: 0, width: 100, height: 100, rotation: 0 },
    light: "directional",
    ...overrides,
  };
}

describe("toLonLatXY", () => {
  beforeEach(() => {
    // Clear any global proj4 mock between tests
    (globalThis as Record<string, unknown>).proj4 = undefined;
  });

  it("uses proj4 when CRS is available", () => {
    // Mock proj4 to return known values
    (globalThis as Record<string, unknown>).proj4 = vi.fn(
      () => [-121.94, 36.55] as [number, number]
    );

    const ud = makeUserData({
      proj: "+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs",
    });
    const result = toLonLatXY(594797, 4042565, ud);

    expect(result.lon).toBeCloseTo(-121.94, 2);
    expect(result.lat).toBeCloseTo(36.55, 2);
    expect(globalThis.proj4).toHaveBeenCalledWith(
      "+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs",
      "EPSG:4326",
      [594797, 4042565]
    );
  });

  it("tries proj4 property then proj property", () => {
    (globalThis as Record<string, unknown>).proj4 = vi.fn(
      () => [-122.0, 37.0] as [number, number]
    );

    // proj4 property takes precedence over proj
    const ud = makeUserData({
      proj4: "+proj=longlat",
      proj: "+proj=utm +zone=10",
    });
    toLonLatXY(100, 200, ud);

    expect(globalThis.proj4).toHaveBeenCalledWith(
      "+proj=longlat",
      "EPSG:4326",
      [100, 200]
    );
  });

  it("falls back to identity when coords look like degrees", () => {
    const ud = makeUserData(); // no CRS
    const result = toLonLatXY(-121.94, 36.55, ud);

    expect(result.lon).toBe(-121.94);
    expect(result.lat).toBe(36.55);
  });

  it("falls back to Web Mercator for large coordinates without CRS", () => {
    const ud = makeUserData(); // no CRS

    // Known EPSG:3857 coords for approximately (0, 0)
    const result = toLonLatXY(0, 0, ud);
    expect(result.lon).toBeCloseTo(0, 5);
    expect(result.lat).toBeCloseTo(0, 5);

    // San Francisco area in EPSG:3857
    const sf = toLonLatXY(-13627665, 4547675, ud);
    expect(sf.lon).toBeCloseTo(-122.42, 1);
    expect(sf.lat).toBeCloseTo(37.77, 1);
  });

  it("falls back gracefully when proj4 throws", () => {
    (globalThis as Record<string, unknown>).proj4 = vi.fn(() => {
      throw new Error("unsupported CRS");
    });

    const ud = makeUserData({ proj: "+proj=unknown" });
    // Large coords → Web Mercator fallback
    const result = toLonLatXY(-13627665, 4547675, ud);
    expect(result.lon).toBeCloseTo(-122.42, 1);
    expect(result.lat).toBeCloseTo(37.77, 1);
  });
});
