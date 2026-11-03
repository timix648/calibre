import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, ExternalLink, H2, PageTitle, Stat, TableWrap } from "@/components/ui";
import { dataGeneratedAt, grades, memory, outcomes, verdicts, walletIndex } from "@/lib/data";
import { pct, shortAddr, sourceLabel, suiscanCheckpoint, utc } from "@/lib/format";

export const metadata: Metadata = { title: "Proof" };

export default function Proof() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Proof"
        sub={`Everything here is rebuilt from Walrus Memory on Sui mainnet, not from a private database. Exported ${utc(dataGeneratedAt)}.`}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Totals">
        <Stat label="Memories" value={memory.total} note="Across four namespaces" />
        <Stat label="Sealed verdicts" value={verdicts.length} />
        <Stat label="Graded outcomes" value={outcomes.length} />
        <Stat
          label="Sui checkpoint"
          value={memory.checkpoint ? <ExternalLink href={suiscanCheckpoint(memory.checkpoint.sequence)}>{Number(memory.checkpoint.sequence).toLocaleString("en-US")}</ExternalLink> : "n/a"}
          note={memory.checkpoint?.timestamp ? `${utc(memory.checkpoint.timestamp)}, via Tatum gRPC` : undefined}
        />
      </section>

      <Card>
        <H2 sub="Walrus Memory has no update or delete: a wallet's record is a new version that supersedes the old one.">Memories per namespace</H2>
        <TableWrap>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="py-2 pr-3 font-medium">Namespace</th>
                <th className="px-3 py-2 text-right font-medium">Memories</th>
                <th className="py-2 pl-3 font-medium">Holds</th>
              </tr>
            </thead>
            <tbody>
              {memory.namespaces.map((n) => (
                <tr key={n.name} className="border-b border-line/60">
                  <td className="num py-2.5 pr-3">{n.name}</td>
                  <td className="num px-3 py-2.5 text-right">{n.memories}</td>
                  <td className="py-2.5 pl-3 text-muted">{HOLDS[n.name] ?? ""}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 pr-3 font-semibold">Total</td>
                <td className="num px-3 py-2.5 text-right font-semibold">{memory.total}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card>
        <H2 sub="The verdicts sealed so far. Each links to its receipt and to the blob on Walruscan.">Sealed verdicts</H2>
        {verdicts.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pr-3 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Data source</th>
                  <th className="px-3 py-2 text-right font-medium">Forecast / price</th>
                  <th className="px-3 py-2 font-medium">Checkpoint</th>
                  <th className="py-2 pl-3 font-medium">Blob</th>
                </tr>
              </thead>
              <tbody>
                {verdicts.map((v) => (
                  <tr key={v.id} className="border-b border-line/60 align-top">
                    <td className="py-2.5 pr-3"><Link className="underline decoration-line underline-offset-4 hover:decoration-accent" href={`/move/${v.id}`}>{v.data.question}</Link></td>
                    <td className="px-3 py-2.5"><Badge tone="accent">{v.data.label}</Badge></td>
                    <td className="num px-3 py-2.5 text-muted">{v.data.model ?? "v1"}</td>
                    <td className="px-3 py-2.5 text-muted">{sourceLabel(v.data.source)}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right text-muted">{pct(v.data.forecast, 1)} / {pct(v.data.priceAtVerdict, 1)}</td>
                    <td className="num px-3 py-2.5"><ExternalLink href={suiscanCheckpoint(v.data.checkpoint.sequence)}>{v.data.checkpoint.sequence}</ExternalLink></td>
                    <td className="py-2.5 pl-3"><ExternalLink href={v.walruscan}>{v.blobId.slice(0, 8)}…</ExternalLink></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <h3 className="mt-6 text-sm font-semibold">Graded outcomes</h3>
        {grades.length === 0 ? (
          <p className="mt-1 text-sm leading-relaxed text-muted">No sealed verdict has resolved yet, so nothing is graded. Grades appear here as markets resolve.</p>
        ) : (
          <TableWrap>
            <table className="mt-2 w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pr-3 font-medium">Label</th>
                  <th className="px-3 py-2 text-right font-medium">Graded</th>
                  <th className="px-3 py-2 text-right font-medium">Forecast Brier</th>
                  <th className="px-3 py-2 text-right font-medium">Price Brier</th>
                  <th className="py-2 pl-3 text-right font-medium">Gain</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.label} className="border-b border-line/60">
                    <td className="py-2.5 pr-3">{g.label}</td>
                    <td className="num px-3 py-2.5 text-right">{g.n}</td>
                    <td className="num px-3 py-2.5 text-right">{g.forecastBrier.toFixed(4)}</td>
                    <td className="num px-3 py-2.5 text-right">{g.marketBrier.toFixed(4)}</td>
                    <td className="num py-2.5 pl-3 text-right">{g.gain.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <H2 sub={`${walletIndex.totalRows.toLocaleString("en-US")} wallet-by-league records across ${walletIndex.totalWallets} wallets are sealed. A few of them:`}>Sample wallet records on Walruscan</H2>
        <ul className="space-y-2 text-sm">
          {memory.sampleBlobs.map((b) => {
            const [wallet, league] = b.key.split(":");
            return (
              <li key={b.blobId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span><Link className="num text-accent underline decoration-accent/40" href={`/wallet/${wallet}`}>{shortAddr(wallet ?? "")}</Link> <span className="text-muted uppercase">{league}</span></span>
                <ExternalLink href={b.walruscan}><span className="num text-xs">{b.blobId}</span></ExternalLink>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <H2>Verify it yourself</H2>
        <p className="text-sm leading-relaxed text-muted">
          The repository includes a script that lists every memory in each namespace, decodes the sealed verdicts and outcomes, checks that the counts agree, reads the latest Sui checkpoint through Tatum, and writes the result to <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs">docs/PROOF.md</code>.
        </p>
        <pre className="num mt-3 overflow-x-auto rounded-lg border border-line bg-bg p-4 text-sm">{`pnpm install\ncp .env.example .env   # add your Tatum and Walrus Memory keys\npnpm verify`}</pre>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This website makes no Tatum calls and holds no keys: the figures above are static files exported by <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs">pnpm export:site</code>, and the wallet audit reads Polymarket&apos;s free public API.
        </p>
      </Card>
    </div>
  );
}

const HOLDS: Record<string, string> = {
  "calibre-wallets": "Versioned records of each wallet's edge, by league",
  "calibre-verdicts": "Sealed verdicts on market moves, with a Sui checkpoint",
  "calibre-outcomes": "Grades written after a market resolves",
  "calibre-lessons": "Lessons learned from graded verdicts",
};
