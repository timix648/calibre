// Summarise skill-persistence result files into one markdown report.
// Usage: tsx scripts/summarize-study.ts <results.json>... > report.md
import { readFile } from "node:fs/promises";

interface Row { group: string; wallet: string; n: number; bssOld: number; bssNew: number }
interface Result { at: string; params: Record<string, unknown>; rows: Row[] }

const rank = (xs: number[]) => {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r: number[] = new Array(xs.length);
  order.forEach(([, i], k) => (r[i] = k));
  return r;
};
const pearson = (a: number[], b: number[]) => {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let p = 0, x = 0, y = 0;
  for (let i = 0; i < n; i++) { p += (a[i]! - ma) * (b[i]! - mb); x += (a[i]! - ma) ** 2; y += (b[i]! - mb) ** 2; }
  return p / Math.sqrt(x * y);
};
const spearman = (a: number[], b: number[]) => pearson(rank(a), rank(b));
/** One-sided permutation p-value for a positive rank correlation. */
function permP(a: number[], b: number[], shuffles = 10_000): number {
  const obs = spearman(a, b);
  let hits = 0;
  const bb = [...b];
  for (let k = 0; k < shuffles; k++) {
    for (let i = bb.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bb[i], bb[j]] = [bb[j]!, bb[i]!]; }
    if (spearman(a, bb) >= obs) hits++;
  }
  return hits / shuffles;
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pts = (x: number) => (x * 100).toFixed(1);

function line(label: string, rows: Row[]): string {
  if (rows.length < 8) return `| ${label} | ${rows.length} | (too few) | | | | |`;
  const old = rows.map((r) => r.bssOld), now = rows.map((r) => r.bssNew);
  const sorted = [...rows].sort((a, b) => b.bssOld - a.bssOld), third = Math.max(1, Math.floor(rows.length / 3));
  const topNew = mean(sorted.slice(0, third).map((r) => r.bssNew)), botNew = mean(sorted.slice(-third).map((r) => r.bssNew));
  const medianN = [...rows.map((r) => r.n)].sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  return `| ${label} | ${rows.length} | ${spearman(old, now).toFixed(3)} | ${permP(old, now).toFixed(4)} | ${pts(topNew)} | ${pts(botNew)} | ${medianN} |`;
}

const out: string[] = ["# Wider skill-persistence study", ""];
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(await readFile(file, "utf8")) as Result;
  out.push(`## ${file}`, "", `Run at ${r.at}. Params: \`${JSON.stringify(r.params)}\``, "",
    "| Sample | Wallets | Spearman (older vs newer edge) | p (one-sided, permutation) | Newer edge, best third (pts) | Newer edge, worst third (pts) | Median bets |",
    "|---|---|---|---|---|---|---|");
  const random = r.rows.filter((x) => x.group === "random"), top = r.rows.filter((x) => x.group === "top");
  out.push(line("profit-blind, all", random));
  out.push(line("profit-blind, 100+ bets", random.filter((x) => x.n >= 100)));
  out.push(line("profit-blind, 300+ bets", random.filter((x) => x.n >= 300)));
  out.push(line("top earners", top));
  out.push("");
}
console.log(out.join("\n"));
