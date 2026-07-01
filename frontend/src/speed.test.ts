import { describe, it, expect } from "vitest";
import { swimTimeSeconds, formatSwimTime, SPEED_PRESETS } from "./speed";

const METERS_TO_FEET = 3.28084;

describe("swimTimeSeconds", () => {
  it("computes time for a known distance and speed", () => {
    // 20 m at 10 m/min = 2 min = 120 s
    const distFt = 20 * METERS_TO_FEET;
    expect(swimTimeSeconds(distFt, 10, METERS_TO_FEET)).toBeCloseTo(120, 5);
  });

  it("scales inversely with speed", () => {
    const distFt = 100 * METERS_TO_FEET;
    const slow = swimTimeSeconds(distFt, 10, METERS_TO_FEET);
    const fast = swimTimeSeconds(distFt, 20, METERS_TO_FEET);
    expect(slow).toBeCloseTo(fast * 2, 5);
  });

  it("returns 0 for non-positive speed", () => {
    expect(swimTimeSeconds(100, 0, METERS_TO_FEET)).toBe(0);
  });
});

describe("formatSwimTime", () => {
  it("formats sub-minute as M:SS", () => {
    expect(formatSwimTime(45)).toBe("0:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatSwimTime(125)).toBe("2:05");
  });

  it("rounds to the nearest second", () => {
    expect(formatSwimTime(89.6)).toBe("1:30");
  });

  it("formats an hour or more as H:MM:SS", () => {
    expect(formatSwimTime(3661)).toBe("1:01:01");
  });

  it("clamps negatives to zero", () => {
    expect(formatSwimTime(-5)).toBe("0:00");
  });
});

describe("SPEED_PRESETS", () => {
  it("lists the four locked presets in ascending speed order", () => {
    expect(SPEED_PRESETS.map((p) => p.mPerMin)).toEqual([10, 20, 30, 55]);
  });
});
