import Link from "next/link";
import { FindingsBars } from "@/components/findings-bars";
import { LabelTestChart, LabelTestTable, allWallets, signedPts, validationRow } from "@/components/label-validation";
import { SmartInput } from "@/components/smart-input";
import { Card, H2, TableWrap } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { ScaleBand } from "@/components/scale-band";
import { VerdictTrace } from "@/components/verdict-trace";
import { findings, memory, tatumStampedIn } from "@/lib/data";
import { liveRecord } from "@/lib/live-record";

const SAMPLE_WALLET = "0x684baa57c338c2549aec0aa3f034f695d72a8409";

const POINTS = [
  {
    title: "A square is a bettor who reliably loses",
    body: "A proven losing record is the strongest label: in testing, those wallets lost again (-3.8 pts on every next bet, 81% of them).",
  },
  {
    title: "A sharp is rare, and the edge is modest",
    body: "A proven winning record needs z of 2 or more over 100+ bets. In testing those wallets stayed ahead modestly (+2.2 pts next). Leaderboard rank carries no signal.",
  },
  {
    title: "Square money is a caution, not a trade",
    body: "On any market we show how much of the latest move came from proven losers, and how much of it we could judge. In a replay of 11,975 moves, loser-driven moves did 3.1 pts worse for followers (p = 0.07); early evidence, not conclusive.",
  },
];

// Re-render at most every ten minutes, so a verdict sealed on Walrus appears without anything being deployed.
export const revalidate = 600;
// The Walrus recall takes 8 to 13 seconds; give the render room for a slow one.
export const maxDuration = 60;

export default async function Home() {
  const { verdicts, outcomes } = await liveRecord();
  const tatumStamped = tatumStampedIn(verdicts);
  // The live count is the record itself; the namespace inventory is only a fallback for an export that predates it.
  const sealed = Math.max(verdicts.length, memory.namespaces.find((n) => n.name === "calibre-verdicts")?.memories ?? 0);
  const w = findings.wide;
  const best = w.rows[0]!;
  const top = w.rows[w.rows.length - 1]!;
  const losing = validationRow("proven losing record")!;
  const winning = validationRow("proven winning record")!;
  const everyone = allWallets()!;
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v * 100).toFixed(1)} pts`;
  return (
    <div className="space-y-14 sm:space-y-20">
      <section className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <div>
        <span className="tab">Whale X-ray for prediction markets</span>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.03em] sm:text-7xl">
          CALIBRE&apos;s labels predict what a wallet does next
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          Before you chase a price move or copy a whale, see whether the money behind it comes from traders who reliably lose. Tested on {everyone.wallets} wallets, older bets to newer ones.
        </p>
        <SmartInput large autoFocus className="mt-8 max-w-2xl" button="X-ray it" />
        <p className="mt-3 text-sm text-muted">
          Accepts a Polymarket profile link, a wallet address, or a market or event link. No address handy?{" "}
          <Link className="text-accent underline" href={`/wallet/${SAMPLE_WALLET}`}>Try a sample wallet</Link>, or open the{" "}
          <Link className="text-accent underline" href="/radar">radar</Link>.
        </p>
        </div>
        <figure className="hero-panel relative mx-auto hidden w-full max-w-[340px] lg:block" aria-label="The CALIBRE extension panel on a real Polymarket wallet">
          <span aria-hidden className="absolute -inset-10 -z-10 bg-[radial-gradient(closest-side,rgb(94_234_212/0.16),transparent)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/panel-live.png" width={340} height={378} alt="The extension labels the Polymarket wallet SpecStavok mostly sniping: 72% of its bets were on outcomes already decided." className="w-full" />
          <figcaption className="num mt-3 text-[11px] uppercase tracking-[0.14em] text-faint">The extension, on a real wallet</figcaption>
        </figure>
      </section>

      <ScaleBand />

      <section aria-labelledby="labeltest">
        <Card reveal="left">
          <H2 sub={`${everyone.wallets} wallets chosen without looking at profit, sports markets. Each wallet gets the label it would have had from its older bets; the chart shows how it did on its newer ones.`}>
            <span id="labeltest">The test: a wallet&apos;s label from its old bets, and what it did next</span>
          </H2>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center">
          <LabelTestChart />
          <div>
          <ul data-stagger className="grid gap-2" aria-label="Reading">
            <li className="cut bg-bad/10 px-3.5 py-2.5 text-sm"><span className="num font-semibold text-bad">{signedPts(losing.meanNewEdgePts)} pts</span> <span className="text-muted">Proven losing record: {Math.round((losing.shareNegative ?? 0) * 100)}% of {losing.wallets} wallets lost again.</span></li>
            <li className="cut bg-good/10 px-3.5 py-2.5 text-sm"><span className="num font-semibold text-good">{signedPts(winning.meanNewEdgePts)} pts</span> <span className="text-muted">Proven winning record: rare ({winning.wallets} wallets), modest.</span></li>
            <li className="cut bg-white/[0.035] px-3.5 py-2.5 text-sm"><span className="num font-semibold">{signedPts(everyone.row.meanNewEdgePts)} pts</span> <span className="text-muted">All {everyone.wallets} wallets, the baseline.</span></li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Edge is how much more often bets won than the prices paid implied, per bet. The whiskers are 95% intervals. The result is mostly driven by in-play bets, and
            older and newer bets of one wallet share its style, so this is not a trading test.{" "}
            <Link href="/method" className="text-accent underline">Read the method and limits</Link>.
          </p>
          </div>
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted hover:text-fg">The same numbers as a table, with every label</summary>
            <LabelTestTable />
          </details>
        </Card>
      </section>

      <section aria-labelledby="finding">
        <Card reveal="right">
          <H2 sub={`The same ${best.wallets} wallets ranked by raw edge on older bets, split in thirds, then followed on newer ones: the best third breaks even, the worst third keeps losing.`}>
            <span id="finding">The leaderboard has no signal; ranking by raw edge only finds the losers</span>
          </H2>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center">
          <div className="lg:order-2"><FindingsBars row={best} top={top} /></div>
          <div>
          <ul data-stagger className="grid gap-2" aria-label="Reading">
            <li className="cut bg-white/[0.035] px-3.5 py-2.5 text-sm"><span className="num font-semibold">≈ 0</span> <span className="text-muted">Past winners do not stay ahead.</span></li>
            <li className="cut bg-bad/10 px-3.5 py-2.5 text-sm"><span className="num font-semibold text-bad">{signed(best.worst)}</span> <span className="text-muted">Past losers lose about 2 pts per bet.</span></li>
            <li className="cut bg-white/[0.035] px-3.5 py-2.5 text-sm"><span className="font-semibold">No signal</span> <span className="text-muted">in the profit leaderboard (p {top.p}).</span></li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Edge is how much more often bets won than the prices paid implied. Already-decided bets (97 cents or more, 3 cents or less) are excluded.
            Wallets trade the same events, so the p-values are optimistic.{" "}
            <Link href="/method" className="text-accent underline">Read the method and limits</Link>.
          </p>
          </div>
          </div>
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
        </Card>
      </section>

      <section aria-labelledby="how" data-reveal="left" className="border-t border-line pt-14 sm:pt-20">
        <VerdictTrace />
      </section>

      <section aria-labelledby="sharps" data-reveal="right">
        <h2 id="sharps" className="text-2xl font-semibold tracking-tight">Sharps and squares, without the hype</h2>
        <dl data-stagger className="mt-6 divide-y divide-line border-y border-line">
          {POINTS.map((p) => (
            <div key={p.title} className="grid gap-1 py-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-12">
              <dt className="font-semibold leading-snug text-balance">{p.title}</dt>
              <dd className="text-sm leading-relaxed text-muted text-pretty">{p.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="extension" data-reveal="left" className="scroll-mt-24" aria-labelledby="ext">
        <div className="grid gap-8 chamfer p-6 sm:p-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <h2 id="ext" className="text-2xl font-semibold tracking-tight">X-ray Polymarket as you browse</h2>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted text-pretty">
              The Chrome extension adds a small panel to polymarket.com. On a profile it shows the wallet&apos;s label and record; on a market or game
              page it shows who pushed the latest move and how much of that money came from proven losers. It reads only the page address and talks only to this
              site.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <a href="/calibre-extension.zip" download className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:brightness-110 active:translate-y-px">
                Download for Chrome
              </a>
              <Link href="/extension" className="text-sm text-accent underline decoration-accent/40 hover:decoration-accent">Install steps</Link>
              <span className="num text-xs text-faint">zip, 11 KB, Chrome, Edge, Brave</span>
            </div>
          </div>
          <ol className="space-y-3 self-center text-sm leading-relaxed text-muted">
            <li className="grid grid-cols-[1.25rem_1fr] gap-2"><span className="num text-accent">1</span><span>Unzip the download into a folder you will keep.</span></li>
            <li className="grid grid-cols-[1.25rem_1fr] gap-2"><span className="num text-accent">2</span><span>Open <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs text-fg">chrome://extensions</code> and turn on Developer mode.</span></li>
            <li className="grid grid-cols-[1.25rem_1fr] gap-2"><span className="num text-accent">3</span><span>Click Load unpacked and pick that folder.</span></li>
            <li className="grid grid-cols-[1.25rem_1fr] gap-2"><span className="num text-accent">4</span><span>Open any Polymarket profile or market.</span></li>
          </ol>
        </div>
      </section>

      <section aria-label="Receipts" data-reveal="up" className="chamfer">
        <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          <ReceiptStat label="Memories on mainnet" value={memory.total.toLocaleString("en-US")} note="Walrus Memory, Sui" />
          <ReceiptStat label="Sealed verdicts" value={sealed.toLocaleString("en-US")} note="Before the result" />
          <ReceiptStat label="Graded" value={outcomes.length.toLocaleString("en-US")} note="Against the market price" />
          <ReceiptStat label="Stamped via Tatum gRPC" value={`${tatumStamped}`} note={`of ${verdicts.length} verdicts, Sui checkpoint via Tatum`} />
        </dl>
        <p className="border-t border-line px-5 py-3 text-sm text-muted">
          Check them yourself: the <Link href="/radar" className="text-accent underline decoration-accent/40">radar</Link>, the{" "}
          <Link href="/record" className="text-accent underline decoration-accent/40">record</Link> of every graded call, and the{" "}
          <Link href="/proof" className="text-accent underline decoration-accent/40">proof</Link> with every blob on Walruscan.
        </p>
      </section>
    </div>
  );
}

function ReceiptStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="num mt-1 text-xl font-semibold text-fg">{/^[\d,]+$/.test(value) ? <CountUp value={Number(value.replace(/,/g, ""))} /> : value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{note}</dd>
    </div>
  );
}
