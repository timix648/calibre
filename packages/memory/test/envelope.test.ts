import { describe, expect, it } from "vitest";
import { decode, encode, FakeMemoryStore, latestByKey } from "../src/index.js";

const cred = (v: number, bss: number) => encode({
  kind: "cred", key: "0xabc:nba", version: v,
  summary: `Wallet 0xabc is ${bss > 0 ? "sharp" : "noise"} on NBA`, data: { bss, n: 10 * v },
});

describe("envelope", () => {
  it("round-trips", () => {
    const text = cred(3, 0.041);
    expect(text.startsWith("[cal1|cred|0xabc:nba|v3] Wallet 0xabc is sharp on NBA || ")).toBe(true);
    expect(decode(text)).toEqual({ kind: "cred", key: "0xabc:nba", version: 3, summary: "Wallet 0xabc is sharp on NBA", data: { bss: 0.041, n: 30 } });
  });

  it("keeps the summary on one line and escapes the separator", () => {
    const text = encode({ kind: "lesson", key: "k", version: 1, summary: "a\nb || c", data: {} });
    expect(text).not.toContain("\n");
    expect(decode(text)?.summary).toBe("a b | c");
  });

  it("rejects foreign or broken memories", () => {
    expect(decode("hello")).toBeNull();
    expect(decode("[other|cred|k|v1] x || {}")).toBeNull();
    expect(decode("[cal1|cred|k|v1] x || {broken")).toBeNull();
    expect(() => encode({ kind: "a|b", key: "k", version: 1, summary: "", data: {} })).toThrow();
  });

  it("picks the highest version per key", () => {
    const latest = latestByKey<{ bss: number }>([cred(1, -0.1), cred(3, 0.04), cred(2, 0.01), "junk"], "cred");
    expect(latest.get("0xabc:nba")?.version).toBe(3);
    expect(latest.get("0xabc:nba")?.data.bss).toBe(0.04);
  });
});

describe("FakeMemoryStore", () => {
  it("recalls within a namespace by word overlap", async () => {
    const s = new FakeMemoryStore();
    await s.rememberBulk("w", [cred(1, 0.1), "[cal1|cred|0xdef:nfl|v1] Wallet 0xdef is noise on NFL || {}"]);
    await s.remember("other", cred(2, 0.2));
    const r = await s.recall({ query: "sharp NBA wallet", namespace: "w", limit: 1 });
    expect(r).toHaveLength(1);
    expect(r[0]!.text).toContain("NBA");
  });
});
