import { describe, expect, it } from "vitest";
import { GAUGE_ZONES, arcPath, clearOfLuck, edgeRange, gaugeZone, polar } from "../lib/gauge";

describe("gaugeZone", () => {
  it("runs from calm to caution and clamps bad input", () => {
    expect(gaugeZone(0).name).toBe("calm");
    expect(gaugeZone(0.15).name).toBe("calm");
    expect(gaugeZone(0.2).name).toBe("watch");
    expect(gaugeZone(0.6).name).toBe("caution");
    expect(gaugeZone(7).name).toBe("caution");
    expect(gaugeZone(Number.NaN).name).toBe("calm");
  });
  it("never uses words that recommend a trade", () => {
    expect(GAUGE_ZONES.map((z) => z.label.toLowerCase()).join(" ")).not.toMatch(/fade|bet|buy|sell/);
  });
});

describe("arc geometry", () => {
  it("puts fraction 0 on the left, 0.5 on top and 1 on the right", () => {
    expect(polar(100, 100, 50, 0)).toEqual({ x: 50, y: 100 });
    const top = polar(100, 100, 50, 0.5);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const right = polar(100, 100, 50, 1);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
  });
  it("draws a clockwise arc over the top", () => {
    expect(arcPath(100, 100, 50, 0, 0.5)).toBe("M 50 100 A 50 50 0 0 1 100 50");
  });
});

describe("edge ranges", () => {
  it("picks the smallest nice range that holds every band", () => {
    expect(edgeRange([])).toBe(0.1);
    expect(edgeRange([{ low: -0.04, high: 0.05 }])).toBe(0.1);
    expect(edgeRange([{ low: -0.04, high: 0.05 }, { low: -0.15, high: 0.12 }])).toBe(0.2);
    expect(edgeRange([{ low: null, high: null }, { low: -0.9, high: 0.9 }])).toBe(1);
    expect(edgeRange([{ low: -5, high: 5 }])).toBe(1);
  });
  it("calls a band outside the luck band only when it excludes zero", () => {
    expect(clearOfLuck(-0.05, -0.01)).toBe(true);
    expect(clearOfLuck(0.01, 0.05)).toBe(true);
    expect(clearOfLuck(-0.02, 0.03)).toBe(false);
    expect(clearOfLuck(null, null)).toBe(false);
  });
});
