import { describe, expect, it } from "vitest";
import { latestMove } from "../src/index.js";

const min = 60_000;
const series = (closes: number[]) => closes.map((close, i) => ({ ts: i * 15 * min, close }));

describe("latestMove", () => {
  it("finds the largest move within the window that ends at the latest price", () => {
    const m = latestMove(series([0.5, 0.5, 0.52, 0.55, 0.61]));
    expect(m).toMatchObject({ from: 0.5, to: 0.61 });
  });
  it("ignores moves older than the window and small wiggles", () => {
    expect(latestMove(series([0.3, 0.5, 0.5, 0.5, 0.5, 0.5, 0.51]))).toBeNull();
    expect(latestMove(series([0.5, 0.52, 0.53]))).toBeNull();
  });
  it("ignores starting points pinned near 0 or 1", () => {
    expect(latestMove(series([0.98, 0.9]))).toBeNull();
    expect(latestMove([])).toBeNull();
  });
});
