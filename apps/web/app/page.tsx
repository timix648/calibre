import Link from "next/link";
import { FindingsBars } from "@/components/findings-bars";
import { HowItWorks } from "@/components/how-it-works";
import { SmartInput } from "@/components/smart-input";
import { Card, H2, Stat, TableWrap } from "@/components/ui";
import { findings, memory, verdicts } from "@/lib/data";

const SAMPLE_WALLET = "0x684baa57c338c2549aec0aa3f034f695d72a8409";

const POINTS = [
  {
    title: "A square is a bettor who reliably loses",
    body: "A proven losing record is the one label that holds up: in the study, wallets that had lost to their prices kept losing, about 2 points on every bet.",
  },
  {
    title: "A sharp is hard to prove, so we do not call one",
    body: "Past winners did not stay ahead. A positive record is shown, flagged as unproven going forward, and never sold as a signal. Leaderboard rank carries no signal either.",
  },
  {
    title: "Square money is a caution, not a trade",
    body: "On any market we show how much of the latest move came from proven losers, and how much of it we could judge. Whether such moves reverse is a pending study, so we do not tell you to fade them.",
  },
];

const PARTS = [
  { href: "/radar", title: "Radar", body: "Recent moves, judged by who traded them and sealed on Walrus before the result." },
  { href: `/wallet/${SAMPLE_WALLET}`, title: "Wallet X-ray", body: "Edge with error bars, sniping share and a plain-English call. Try a sample wallet." },
  { href: "/proof", title: "Proof", body: "Memory counts, blob links and how to check them yourself." },
];

export default function Home() {
  const sealed = memory.namespaces.find((n) => n.name === "calibre-verdicts")?.memories ?? verdicts.length;
  const w = findings.wide;
  const best = w.rows[0]!;
  const top = w.rows[w.rows.length - 1]!;
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v * 100).toFixed(1)} pts`;
  return (
    <div className="space-y-14 sm:space-y-20">
      <section>
        <p className="text-sm font-medium text-accent">Sharps vs squares, for prediction markets</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Whale X-ray for prediction markets
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          Before you chase a price move or copy a whale, see whether the money behind it comes from traders who reliably lose.
        </p>
        <SmartInput large autoFocus className="mt-8 max-w-2xl" button="X-ray it" />
        <p className="mt-3 text-sm text-muted">
          Accepts a Polymarket profile link, a wallet address, or a market or event link. No address handy?{" "}
          <Link className="text-accent underline" href={`/wallet/${SAMPLE_WALLET}`}>Try a sample wallet</Link>, or open the{" "}
          <Link className="text-accent underline" href="/radar">radar</Link>.
        </p>
      </section>

      <section aria-labelledby="finding">
        <Card>
          <H2 sub={`${best.wallets} wallets chosen without looking at profit, sports markets. Each is ranked by its edge on older bets, then followed on newer ones.`}>
            <span id="finding">The finding: past losers keep losing, past winners do not stay ahead</span>
          </H2>
          <FindingsBars row={best} top={top} />
          <ul className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Reading">
            <li className="rounded-lg border border-line bg-panel-2 px-3.5 py-2.5 text-sm"><span className="num font-semibold">≈ 0</span> <span className="text-muted">Past winners do not stay ahead.</span></li>
            <li className="rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-sm"><span className="num font-semibold text-bad">{signed(best.worst)}</span> <span className="text-muted">Past losers lose about 2 pts per bet.</span></li>
            <li className="rounded-lg border border-line bg-panel-2 px-3.5 py-2.5 text-sm"><span className="font-semibold">No signal</span> <span className="text-muted">in the profit leaderboard (p {top.p}).</span></li>
          </ul>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted hover:text-fg">All five samples, with the same numbers</summary>
            <TableWrap>
              <table className="mt-3 w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 pr-3 font-medium">Sample</th>
                    <th className="px-3 py-2 text-right font-medium">Best third</th>
                    <th className="px-3 py-2 text-right font-medium">Worst third</th>
                    <th className="py-2 pl-3 text-right font-medium">Rank corr.</th>
                  </tr>
                </thead>
                <tbody>
                  {w.rows.map((r) => (
                    <tr key={r.bets} className="border-b border-line/60">
                      <td className="py-2 pr-3">{r.bets} <span className="text-faint">({r.wallets})</span></td>
                      <td className="num px-3 py-2 text-right text-muted">{signed(r.best)}</td>
                      <td className={`num px-3 py-2 text-right ${r.worst <= -0.015 ? "text-bad" : "text-muted"}`}>{signed(r.worst)}</td>
                      <td className="num py-2 pl-3 text-right text-muted">{r.rho.toFixed(2)} <span className="text-faint">p {r.p}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </details>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Edge is how much more often bets won than the prices paid implied. Already-decided bets (97 cents or more, 3 cents or less) are excluded.
            Wallets trade the same events, so the p-values are optimistic.{" "}
            <Link href="/method" className="text-accent underline">Read the method and limits</Link>.
          </p>
        </Card>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="mb-4 text-lg font-semibold tracking-tight">How it works</h2>
        <HowItWorks />
      </section>

      <section aria-labelledby="sharps">
        <h2 id="sharps" className="mb-4 text-lg font-semibold tracking-tight">Sharps vs squares, honestly</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {POINTS.map((p, i) => (
            <li key={p.title} className="rounded-xl border border-line bg-panel p-5">
              <div className="num text-xs text-accent">0{i + 1}</div>
              <h3 className="mt-1 font-semibold leading-snug">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="extension" className="scroll-mt-24" aria-labelledby="ext">
        <Card className="border-accent/30">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 id="ext" className="text-lg font-semibold tracking-tight">X-ray Polymarket as you browse</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The Chrome extension adds a small panel to polymarket.com. On a profile it shows the wallet&apos;s X-ray; on a market it shows who pushed the latest move
                and how much of that money came from proven losers.
              </p>
            </div>
            <ol className="space-y-1.5 text-sm leading-relaxed text-muted">
              <li><span className="num text-accent">1</span> Build it: <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs text-fg">pnpm --filter @calibre/extension build</code></li>
              <li><span className="num text-accent">2</span> Open <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs text-fg">chrome://extensions</code>, turn on Developer mode</li>
              <li><span className="num text-accent">3</span> Load unpacked, pick <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs text-fg">apps/extension/dist</code></li>
              <li><span className="num text-accent">4</span> In its options, set the API address to this site</li>
            </ol>
          </div>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {PARTS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border border-line bg-panel p-5 transition hover:border-accent/60">
            <div className="font-semibold">{l.title} <span aria-hidden className="text-accent">→</span></div>
            <p className="mt-1 text-sm text-muted">{l.body}</p>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Receipts">
        <Stat label="Memories on mainnet" value={memory.total} note="Walrus Memory, Sui" />
        <Stat label="Sealed verdicts" value={sealed} note="Graded after resolution" />
        <Stat label="Sui checkpoint" value={memory.checkpoint ? Number(memory.checkpoint.sequence).toLocaleString("en-US") : "n/a"} note="Read through Tatum gRPC" />
      </section>
    </div>
  );
}
