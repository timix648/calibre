import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Card, H2, PageTitle } from "@/components/ui";
import { Markdown } from "@/lib/markdown";

export const metadata: Metadata = { title: "Method" };

// Read at build time from the exported copy of docs/FINDINGS.md (written by `pnpm export:site`).
async function findingsMarkdown(): Promise<string> {
  return readFile(path.join(process.cwd(), "data", "FINDINGS.md"), "utf8");
}

export default async function Method() {
  const md = await findingsMarkdown();
  return (
    <div className="space-y-8">
      <PageTitle
        title="Method"
        sub="How CALIBRE measures a wallet's record, what the study found, and what none of it can show."
      />

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
        <H2 sub="The write-up from the repository, docs/FINDINGS.md, rendered as is. It was corrected on 3 Nov 2026 after a stricter test.">The study, and its correction</H2>
        <Markdown source={md} skipFirstHeading />
      </Card>

      <Card>
        <H2>Limitations</H2>
        <div className="prose-calibre"><ul>
          <li>A wallet audit reads at most the newest 1,000 trades. Older history is not counted.</li>
          <li>Polymarket accounts trade through a proxy wallet, and one person can run several wallets. The audit sees an address, not a person.</li>
          <li>A past record, even a proven one, does not predict a future one. The study above found that it mostly did not.</li>
          <li>Edge is measured against the price paid. It ignores fees, bet size and bankroll, so it is not profit.</li>
          <li>Resolutions and start times come from Polymarket&apos;s Gamma API. A market without a start time treats the last 3 hours before its close as in-play.</li>
          <li>Verdicts sealed before model v2 can carry forecasts far from the price. They stay as sealed because Walrus Memory is append-only.</li>
          <li>This is not financial advice.</li>
        </ul></div>
      </Card>
    </div>
  );
}
