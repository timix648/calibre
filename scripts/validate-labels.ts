// Validate the X-ray labels against the skill-persistence study logs.
//   pnpm exec tsx scripts/validate-labels.ts <dir | log files...> [--out-md docs/LABEL_VALIDATION.md]
//     [--out-json apps/web/data/label-validation.json] [--preliminary "40 wallets"] [--include-top]
// A directory is searched for wide-all.log, wide-pregame.log and wide-inplay.log (research/wide-study/logs/); individual
// files may be given instead, e.g. .cache/skill-persistence-allphase.log (the phase is read from the file name).
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseStudyLog, phaseOfFile, renderMarkdown, validatePhase, LABEL_RULES, type PhaseResult, type ValidationReport } from "./validate-labels-lib.js";

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const inputs: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a.startsWith("--")) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { flags.set(a.slice(2), next); i++; } else flags.set(a.slice(2), "true");
  } else inputs.push(a);
}
if (inputs.length === 0) { console.error("usage: validate-labels.ts <dir | log files...> [--out-md f] [--out-json f] [--preliminary text] [--include-top]"); process.exit(1); }

const files: string[] = [];
for (const input of inputs) {
  if ((await stat(input)).isDirectory()) {
    const names = new Set(await readdir(input));
    for (const n of ["wide-all.log", "wide-pregame.log", "wide-inplay.log"]) if (names.has(n)) files.push(join(input, n));
  } else files.push(input);
}
if (files.length === 0) { console.error("no study logs found"); process.exit(1); }

// --include-top adds the top earners to the profit-blind sample (off by default: the top group is picked on profit).
const includeTop = flags.has("include-top");
const phases: PhaseResult[] = [];
for (const file of files) {
  const phase = phaseOfFile(file);
  if (!phase) { console.error(`cannot tell the phase of ${file} (name it ...all, ...pregame or ...inplay)`); process.exit(1); }
  const rows = parseStudyLog(await readFile(file, "utf8"));
  console.log(`${basename(file)}: ${rows.length} wallet lines, phase ${phase}`);
  phases.push(validatePhase(phase, rows, { includeTop }));
}
const order = ["all", "pregame", "inplay"];
phases.sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase));

const preliminary = flags.get("preliminary");
const report: ValidationReport = {
  generatedAt: new Date().toISOString(),
  preliminary: preliminary && preliminary !== "true" ? preliminary : null,
  sources: files.map((f) => basename(f)),
  includesTop: includeTop,
  rules: LABEL_RULES,
  phases,
};
const outMd = flags.get("out-md") ?? "docs/LABEL_VALIDATION.md";
const outJson = flags.get("out-json") ?? "apps/web/data/label-validation.json";
for (const f of [outMd, outJson]) await mkdir(dirname(f), { recursive: true });
await writeFile(outMd, renderMarkdown(report));
await writeFile(outJson, JSON.stringify(report, null, 2) + "\n");
for (const p of phases) {
  console.log(`\n${p.phase} (${p.wallets} wallets)`);
  for (const l of p.labels) {
    const ci = l.ci95Pts ? `[${l.ci95Pts[0].toFixed(2)}, ${l.ci95Pts[1].toFixed(2)}]` : "";
    console.log(`  ${l.label.padEnd(42)} n=${String(l.wallets).padStart(3)} newer ${l.meanNewEdgePts?.toFixed(2) ?? "n/a"} pts ${ci} negative ${l.shareNegative === null ? "n/a" : Math.round(l.shareNegative * 100) + "%"}`);
  }
}
console.log(`\nwrote ${outMd} and ${outJson}`);
