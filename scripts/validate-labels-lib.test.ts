import { describe, expect, it } from "vitest";
import {
  LABEL_RULES, bootstrapMeanCI, halves, labelFromOlderHalf, parseStudyLog, phaseOfFile, renderMarkdown, validatePhase,
  type LogRow, type ValidationReport,
} from "./validate-labels-lib";

const LOG = `﻿source=public wallets=25+40 trades<=1000
[1] top 0x684baa57 picks=625 edge old=0.014 (z 0.5) new=0.037 (z 1.3) wnba,mlb,fifwc,wta
[2] random 0xa16a1302 picks=21 edge old=-0.005 (z -0.1) new=0.062 (z 0.9) other,nhl
[3] random 0x3d1b085b picks=842 edge old=-0.050 (z -2.4) new=-0.020 (z -0.7) nba,lol
[4] random 0xaf5f9e84 picks=300 edge old=0.080 (z 2.5) new=0.016 (z 0.7) wnba
[5] random 0x8a3b59b6 only 3 resolved picks
[6] random 0x24cee225 picks=139 edge old=-0.043 (z -0.7) new=0.066 (z 1.2) wta,atp
SUMMARY {
  "top": { "wallets": 1 }
}`;

describe("parseStudyLog", () => {
  it("reads wallet lines and ignores skips, headers and the summary", () => {
    const rows = parseStudyLog(LOG);
    expect(rows).toHaveLength(5);
    expect(rows[1]).toMatchObject({ group: "random", wallet: "0xa16a1302", picks: 21, oldEdge: -0.005, oldZ: -0.1, newEdge: 0.062, newZ: 0.9, leagues: "other,nhl" });
  });
  it("copes with CRLF line endings", () => {
    expect(parseStudyLog(LOG.replace(/\n/g, "\r\n"))).toHaveLength(5);
  });
  it("drops lines with non-finite numbers", () => {
    expect(parseStudyLog("[1] random 0xabc picks=40 edge old=NaN (z 1.0) new=0.1 (z 1.0) nba")).toHaveLength(0);
  });
});

describe("labelFromOlderHalf", () => {
  it("uses the older half size and the core thresholds", () => {
    expect(halves(61)).toEqual({ nOld: 30, nNew: 31 });
    expect(labelFromOlderHalf({ picks: 60, oldZ: -2 })).toBe("proven losing record");
    expect(labelFromOlderHalf({ picks: 59, oldZ: -3 })).toBe("too early");
    expect(labelFromOlderHalf({ picks: 200, oldZ: 2 })).toBe("positive record (unproven going forward)");
    expect(labelFromOlderHalf({ picks: 199, oldZ: 3 })).toBe("no proven edge");
    expect(labelFromOlderHalf({ picks: 400, oldZ: -1.9 })).toBe("no proven edge");
  });
});

describe("bootstrapMeanCI", () => {
  it("is deterministic, contains the mean and collapses for constants", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = bootstrapMeanCI(xs)!;
    expect(bootstrapMeanCI(xs)).toEqual(a);
    expect(a[0]).toBeLessThan(4.5);
    expect(a[1]).toBeGreaterThan(4.5);
    expect(bootstrapMeanCI([3, 3, 3])).toEqual([3, 3]);
    expect(bootstrapMeanCI([3])).toBeNull();
  });
});

describe("validatePhase", () => {
  const rows = parseStudyLog(LOG);
  it("groups profit-blind wallets by older-half label and reports newer-half stats", () => {
    const p = validatePhase("pregame", rows);
    expect(p.wallets).toBe(4);
    const by = Object.fromEntries(p.labels.map((l) => [l.label, l]));
    expect(by["proven losing record"]!.wallets).toBe(1);
    expect(by["proven losing record"]!.meanNewEdgePts).toBeCloseTo(-2, 9);
    expect(by["proven losing record"]!.shareNegative).toBe(1);
    expect(by["positive record (unproven going forward)"]!.wallets).toBe(1);
    expect(by["too early"]!.wallets).toBe(1);
    expect(by["no proven edge"]!.wallets).toBe(1);
    expect(by["all wallets"]!.wallets).toBe(4);
    expect(by["all wallets"]!.negative).toBe(1);
    expect(by["too early"]!.ci95Pts).toBeNull();
  });
  it("adds the top earners only on request and counts a wallet once", () => {
    expect(validatePhase("pregame", rows, { includeTop: true }).wallets).toBe(5);
    const dup: LogRow[] = [...rows, ...rows];
    expect(validatePhase("pregame", dup).wallets).toBe(4);
  });
  it("handles an empty phase", () => {
    const p = validatePhase("inplay", []);
    expect(p.wallets).toBe(0);
    expect(p.labels.every((l) => l.meanNewEdgePts === null && l.shareNegative === null)).toBe(true);
  });
});

describe("phaseOfFile and renderMarkdown", () => {
  it("reads the phase from the name", () => {
    expect(phaseOfFile("a/b/wide-inplay.log")).toBe("inplay");
    expect(phaseOfFile(".cache\\skill-persistence-pregame.log")).toBe("pregame");
    expect(phaseOfFile("wide-all.log")).toBe("all");
    expect(phaseOfFile("skill-persistence-allphase.log")).toBe("all");
    expect(phaseOfFile("notes.txt")).toBeNull();
  });
  it("marks preliminary reports and lists every label", () => {
    const report: ValidationReport = {
      generatedAt: "2026-11-04T00:00:00.000Z", preliminary: "40 wallets", sources: ["x.log"], includesTop: false,
      rules: LABEL_RULES, phases: [validatePhase("pregame", parseStudyLog(LOG))],
    };
    const md = renderMarkdown(report);
    expect(md).toContain("Preliminary (40 wallets)");
    for (const l of ["proven losing record", "too early", "no proven edge", "all wallets"]) expect(md).toContain(l);
    expect(renderMarkdown({ ...report, preliminary: null })).not.toContain("Preliminary");
  });
});
