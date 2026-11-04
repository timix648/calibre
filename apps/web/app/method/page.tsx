import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LabelTestTable, allWallets, signedPts, validationRow } from "@/components/label-validation";
import { Card, H2, PageTitle, TableWrap } from "@/components/ui";
import { replay, scale } from "@/lib/data";
import { Markdown } from "@/lib/markdown";

export const metadata: Metadata = { title: "Method" };

// Read at build time from the exported copy of docs/FINDINGS.md (written by `pnpm export:site`). The label validation and the
// replay have their own cards above, so only the earlier studies, from "## Earlier" on, are rendered here.
async function earlierStudies(): Promise<string> {
  const md = await readFile(path.join(process.cwd(), "data", "FINDINGS.md"), "utf8");
  const at = md.indexOf("\n## Earlier");
  return at < 0 ? md : `# Earlier studies\n${md.slice(at)}`;
}

const fixed = (v: number) => (v < 0 ? "\u2212" : v > 0 ? "+" : "") + Math.abs(v).toFixed(1);

export default async function Method() {
  const md = await earlierStudies();
  const everyone = allWallets()!;
  const all = everyone.row;
  const lose = validationRow("proven losing record")!;
  const win = validationRow("proven winning record")!;
  const loseIn = validationRow("proven losing record", "inplay")!;
  const losePre = validationRow("proven losing record", "pregame")!;
  const winIn = validationRow("proven winning record", "inplay")!;
  const winPre = validationRow("proven winning record", "pregame")!;
  const ci = (r: { ci95Pts: [number, number] | null }) => (r.ci95Pts ? `${signedPts(r.ci95Pts[0])} to ${signedPts(r.ci95Pts[1])}` : "n/a");
  return (
    <div className="space-y-8">
      <PageTitle
        title="Method"
        sub="How CALIBRE measures a wallet's record, what the study found, and what none of it can show."
      />

      <Card>
        <H2 sub="Plain sums over the study outputs, written by scripts/scale-stats.ts. Nothing is estimated or extrapolated.">The data behind it</H2>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="num text-fg">${(scale.replay.marketVolumeUsd / 1e9).toFixed(2)}B</dt>
          <dd className="text-muted">Polymarket&apos;s own trading-volume figure, summed over the {scale.replay.markets.toLocaleString("en-US")} closed sports markets in the square-money replay ({scale.replay.leagues} leagues).</dd>
          <dt className="num text-fg">${(scale.replay.pushingUsd / 1e6).toFixed(1)}M</dt>
          <dd className="text-muted">Money that pushed the {scale.replay.moves.toLocaleString("en-US")} replayed moves, traced to {scale.replay.walletsLabeled.toLocaleString("en-US")} distinct taker wallets.</dd>
          <dt className="num text-fg">{scale.index.scoredBets.toLocaleString("en-US")}</dt>
          <dd className="text-muted">Bets scored against the price paid in the wallet index: {scale.index.wallets.toLocaleString("en-US")} wallets, {scale.index.rows.toLocaleString("en-US")} wallet-by-league records, {scale.index.leagues} leagues and categories.</dd>
          <dt className="num text-fg">{scale.wideStudy.scoredBets.toLocaleString("en-US")}</dt>
          <dd className="text-muted">Bets scored in the profit-blind study of {scale.wideStudy.wallets.toLocaleString("en-US")} wallets that the label test uses.</dd>
        </dl>
      </Card>

      <Card>
        <H2>How edge is measured</H2>
        <div className="prose-calibre">
          <p>
            <strong>Edge</strong> is the average of (won minus price paid) over a wallet&apos;s resolved bets, in probability points. A bet bought at 40 cents that wins
            counts +0.60, one that loses counts -0.40. If prices were fair, the average would be zero.
          </p>
          <ul>
            <li>One bet is counted per wallet per market, so splitting one bet into twenty fills does not count twenty times. A sell is scored as a bet on the other side at one minus the price.</li>
            <li>Under &quot;prices are fair&quot;, edge has a known <strong>standard error</strong>, the square root of the sum of p(1-p), divided by the number of bets. That gives a z-score and the error band you see as edge ± 2 standard errors.</li>
            <li><strong>Pre-game</strong> bets (placed before the game or event started) and <strong>in-play</strong> bets (placed once it was live) are scored separately: the first is forecasting, the second is reaction speed.</li>
            <li><strong>Sniping</strong> is a bet at 97 cents or more, or 3 cents or less, where the outcome was effectively decided. These are set apart, with their own share and edge, and never counted as an edge.</li>
            <li>The call: <strong>proven edge</strong> only if z is at least 2 and there are at least 100 bets in a phase; <strong>negative edge</strong> if z is -2 or lower; <strong>too early</strong> under 30 bets; otherwise <strong>no proven edge (consistent with luck)</strong>. A wallet is flagged <strong>mostly sniping</strong> when more than 40% of its resolved bets are sniping.</li>
          </ul>
        </div>
      </Card>

      <Card>
        <H2>The X-ray labels and square money</H2>
        <div className="prose-calibre">
          <p>
            The wallet X-ray puts every wallet in one of five labels, read in this order from its overall record (pre-game and in-play together, one bet per market, sniping excluded):
          </p>
          <ul>
            <li><strong>Proven losing record</strong>: overall z of -2 or lower over at least 30 bets. Lost again in testing ({signedPts(lose.meanNewEdgePts)} pts next, {Math.round((lose.shareNegative ?? 0) * 100)}% of wallets).</li>
            <li><strong>Mostly sniping</strong>: more than 40% of resolved markets were bought at 97 cents or more, or 3 cents or less.</li>
            <li><strong>Too early</strong>: under 30 scored bets.</li>
            <li><strong>Proven winning record</strong>: overall z of 2 or more over at least 100 bets. Rare; stayed ahead modestly in testing ({signedPts(win.meanNewEdgePts)} pts next).</li>
            <li><strong>No proven edge</strong>: everything else.</li>
          </ul>
          <p>
            <strong>Square money</strong> on a market is the share of the money pushing its latest move (4 points or more in the last 6 hours) that came from wallets labeled proven losing record.
            Only the six biggest takers are audited, so every figure comes with its <strong>coverage</strong>: the share of the pushing money that could be judged.
            It is a caution signal, not a trade recommendation: see the replay below, which is early evidence and not conclusive.
          </p>
        </div>
      </Card>

      <Card>
        <H2 sub={`Do the labels predict? Each wallet gets the label it would have had from its older bets; the table shows its edge on its newer bets. ${lose.wallets + win.wallets} of the ${everyone.wallets} wallets earned one of the two proven labels.`}>
          Label validation: the labels predict what a wallet does next
        </H2>
        <LabelTestTable />
        <div className="prose-calibre mt-4">
          <p>
            <strong>Reading it.</strong> A proven losing record is the strongest label: {lose.wallets} wallets, {signedPts(lose.meanNewEdgePts)} pts per bet on their next bets (interval {ci(lose)}),
            against {signedPts(all.meanNewEdgePts)} for all wallets. A proven winning record is rare and modest: {win.wallets} wallets, {signedPts(win.meanNewEdgePts)} pts (interval {ci(win)}).
            Most wallets (the &quot;no proven edge&quot; row) did slightly worse than zero.
          </p>
          <p><strong>Method.</strong></p>
          <ul>
            <li>Source: the per-wallet lines of the 1,000-wallet skill-persistence study (profit-blind wallets drawn from random sports markets, already-decided bets at 97 cents or more, or 3 cents or less, excluded). 983 wallets have a result line.</li>
            <li>Each wallet&apos;s bets are split at the middle. The older half is what the X-ray would have known; the newer half is what happened next. The label comes from the older half with the live rules.</li>
            <li>Edge is points won above the price paid, per bet, one pick per market. Intervals are 95% bootstrap over wallets (2,000 resamples, fixed seed); each wallet counts once.</li>
            <li>The sniping label cannot be derived from the study logs and is left out.</li>
          </ul>
          <p><strong>Caveats.</strong></p>
          <ul>
            <li>The result is mostly driven by in-play bets. By phase, the losing label: in-play {signedPts(loseIn.meanNewEdgePts)} ({ci(loseIn)}, {loseIn.wallets} wallets), pre-game {signedPts(losePre.meanNewEdgePts)} ({ci(losePre)}, {losePre.wallets} wallets). The winning label: in-play {signedPts(winIn.meanNewEdgePts)} ({ci(winIn)}, {winIn.wallets} wallets), pre-game {signedPts(winPre.meanNewEdgePts)} ({ci(winPre)}, {winPre.wallets} wallets). The winning label is not significant in either phase on its own.</li>
            <li>Older and newer halves of the same wallet share its style, and wallets trade the same events, so the intervals are optimistic. This is a test of whether labels carry information, not a trading backtest.</li>
            <li>Edge ignores fees, bet size and bankroll. It is not profit.</li>
          </ul>
        </div>
      </Card>

      <Card>
        <H2 sub={`${replay.moves.toLocaleString("en-US")} real moves of ${replay.minMovePts} points or more within ${replay.windowMinutes} minutes, in ${replay.markets.toLocaleString("en-US")} closed sports markets. The six biggest takers of each move are labeled using only bets that resolved before the move.`}>
          Square-money replay: early evidence, not conclusive
        </H2>
        <TableWrap>
          <table className="mt-1 w-full min-w-[460px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="py-2 pr-3 font-medium">Moves pushed by</th>
                <th className="px-3 py-2 text-right font-medium">Moves</th>
                <th className="py-2 pl-3 text-right font-medium">Follow edge, pts [95% CI]</th>
              </tr>
            </thead>
            <tbody>
              {replay.rows.map((r, i) => (
                <tr key={r.group} className="border-b border-line/60">
                  <td className={`py-2 pr-3 ${i === 0 ? "font-medium" : ""}`}>{r.group}</td>
                  <td className="num px-3 py-2 text-right text-muted">{r.moves.toLocaleString("en-US")}</td>
                  <td className={`num py-2 pl-3 text-right ${i === 0 ? "text-bad" : "text-muted"}`}>{fixed(r.followEdgePts)} [{fixed(r.ci95Pts[0])}, {fixed(r.ci95Pts[1])}]</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <div className="prose-calibre mt-4">
          <p>
            <strong>Reading it.</strong> Following a loser-driven move did {fixed(replay.differencePts)} pts worse than following a clean one (one-sided permutation p = {replay.pOneSided.toFixed(3)}).
            The interval for loser-driven moves spans zero, so this is <strong>early evidence, not conclusive</strong>. An earlier, smaller run (4,355 moves) gave -3.8 pts at p about 0.14: the larger run narrowed the interval and the gap held in direction.
          </p>
          <ul>
            <li>Follow edge is the final result minus the price at the end of the move, in the move&apos;s direction. Negative means the move overshot.</li>
            <li>A move counts as loser-driven when proven losers are 50% or more of the labeled flow; &quot;mixed&quot; sits between that and none. {replay.labeledMoves.toLocaleString("en-US")} of the {replay.moves.toLocaleString("en-US")} moves had takers with enough resolved bets to label.</li>
            <li>By phase: pre-game, loser-driven {replay.byPhase[0]!.loserMoves} moves at {fixed(replay.byPhase[0]!.loserEdgePts)} against {fixed(replay.byPhase[0]!.cleanEdgePts)} for clean ones; in-play, {replay.byPhase[1]!.loserMoves} moves at {fixed(replay.byPhase[1]!.loserEdgePts)} against {fixed(replay.byPhase[1]!.cleanEdgePts)}.</li>
            <li>Moves in the same market, and markets on the same event, are not independent, so the interval and the p-value are optimistic. Only 176 moves were loser-driven.</li>
            <li>CALIBRE shows square money as a caution signal about who pushed the price. It does not tell anyone what to trade.</li>
          </ul>
        </div>
      </Card>

      <Card>
        <H2 sub="The earlier sections of docs/FINDINGS.md, rendered as is. The first study was corrected on 3 Nov 2026 after a stricter test.">The earlier studies, and their correction</H2>
        <Markdown source={md} skipFirstHeading />
      </Card>

      <Card>
        <H2>Limitations</H2>
        <div className="prose-calibre"><ul>
          <li>A wallet audit reads at most the newest 1,000 trades. Older history is not counted.</li>
          <li>Polymarket accounts trade through a proxy wallet, and one person can run several wallets. The audit sees an address, not a person.</li>
          <li>A past record is not a promise. The label test found a proven losing record predicts well, a proven winning record only modestly, and raw edge or leaderboard rank not at all.</li>
          <li>Edge is measured against the price paid. It ignores fees, bet size and bankroll, so it is not profit.</li>
          <li>Resolutions and start times come from Polymarket&apos;s Gamma API. A market without a start time treats the last 3 hours before its close as in-play.</li>
          <li>Verdicts sealed before model v2 can carry forecasts far from the price. They stay as sealed because Walrus Memory is append-only.</li>
          <li>This is not financial advice.</li>
        </ul></div>
      </Card>
    </div>
  );
}
