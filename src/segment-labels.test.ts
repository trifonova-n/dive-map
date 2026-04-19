import { describe, it, expect } from "vitest";
import { computeSegment } from "./segment-labels";

const METERS_TO_FEET = 3.28084;
const MAG_DEC = -12.0; // Monterey Bay

describe("computeSegment", () => {
  it("computes distance for a simple horizontal segment", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 3, y: 4, z: 0 };
    const { distFt } = computeSegment(a, b, METERS_TO_FEET, 0);

    // 3-4-5 triangle → 5 meters → 16.4042 feet
    expect(distFt).toBeCloseTo(5 * METERS_TO_FEET, 2);
  });

  it("includes vertical component in distance", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 10 };
    const { distFt } = computeSegment(a, b, METERS_TO_FEET, 0);

    expect(distFt).toBeCloseTo(10 * METERS_TO_FEET, 2);
  });

  it("computes heading due north as 0°", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 10, z: 0 }; // straight north (positive Y)
    const { heading } = computeSegment(a, b, METERS_TO_FEET, 0);

    expect(heading).toBeCloseTo(0, 5);
  });

  it("computes heading due east as 90°", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 10, y: 0, z: 0 }; // straight east (positive X)
    const { heading } = computeSegment(a, b, METERS_TO_FEET, 0);

    expect(heading).toBeCloseTo(90, 5);
  });

  it("computes heading due south as 180°", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: -10, z: 0 };
    const { heading } = computeSegment(a, b, METERS_TO_FEET, 0);

    expect(heading).toBeCloseTo(180, 5);
  });

  it("computes heading due west as 270°", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: -10, y: 0, z: 0 };
    const { heading } = computeSegment(a, b, METERS_TO_FEET, 0);

    expect(heading).toBeCloseTo(270, 5);
  });

  it("applies magnetic declination to heading", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 10, z: 0 }; // true north = 0°
    const { heading } = computeSegment(a, b, METERS_TO_FEET, MAG_DEC);

    // magnetic = true + MAG_DEC = 0 + (-12) = -12 → 348°
    expect(heading).toBeCloseTo(348, 5);
  });

  it("wraps heading to 0-360 range", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: -1, y: 10, z: 0 }; // slightly west of north
    const { heading } = computeSegment(a, b, METERS_TO_FEET, MAG_DEC);

    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading).toBeLessThan(360);
  });

  it("computes 45° NE correctly", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 10, y: 10, z: 0 }; // northeast
    const { heading } = computeSegment(a, b, METERS_TO_FEET, 0);

    expect(heading).toBeCloseTo(45, 5);
  });

  it("returns zero distance for same point", () => {
    const a = { x: 5, y: 5, z: 5 };
    const { distFt } = computeSegment(a, a, METERS_TO_FEET, 0);

    expect(distFt).toBe(0);
  });
});
