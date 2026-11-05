import type { Metadata } from "next";
import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { Badge, Card, ExternalLink, H2, PageTitle, Stat, TableWrap } from "@/components/ui";
import { dataGeneratedAt, grades, memory, outcomes, tatumStamped, verdicts, walletIndex } from "@/lib/data";
import { pct, shortAddr, suiscanCheckpoint, utc } from "@/lib/format";

export const metadata: Metadata = { title: "Proof" };

// The first paid agent call (scripts/agent-pay-demo.ts), checked on chain via Sui GraphQL: status SUCCESS, gas price 0,
// 10,000 units of native USDC (0.01) from the agent to the API's recipient address.
const PAYMENT = {
  digest: "9edpkVC9QQegXDDwvxEt5dZyd2NZ36vBLw2yaqknF86K",
  checkpoint: "341674249",
  at: "4 Nov 2026, 20:21:41 UTC",
  from: "0x62c1296aa94dd95c94734f916ff9b69934926ac5ca3706122d4519c7dfbf3cdf",
  to: "0x6b2e6674d9f19c45ababd054fac1dfa3e3cbe8e7f4d58084bda4c4a1460ef5cf",
};

const SHOWN = 10;

export default function Proof() {
  return (
    <div className="space-y-8">
      <PageTitle tab="On-chain receipts"
        title="Proof"
        sub={`Everything here is rebuilt from Walrus Memory on Sui mainnet, not from a private database. Exported ${utc(dataGeneratedAt)}.`}
      />

      <section data-stagger className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4" aria-label="Totals">
        <Stat label="Memories" value={memory.total} note={`Across ${memory.namespaces.filter((n) => n.memories > 0).length} namespaces`} />
        <Stat label="Sealed verdicts" value={verdicts.length} />
        <Stat label="Graded outcomes" value={outcomes.length} />
        <Stat
          label="Stamped via Tatum gRPC"
          value={<><CountUp value={tatumStamped} /><span className="text-muted"> / {verdicts.length}</span></>}
          note="Every sealed verdict carries a Sui checkpoint read through Tatum's Sui gRPC gateway"
        />
      </section>

      <Card>
        <H2 sub="Walrus Memory has no update or delete: a wallet's record is a new version that supersedes the old one.">Memories per namespace</H2>
        <ul data-stagger className="space-y-5">
          {memory.namespaces.filter((n) => n.memories > 0).map((n) => {
            const max = Math.max(...memory.namespaces.map((x) => x.memories));
            return (
              <li key={n.name} className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[14rem_1fr_4rem] sm:items-center">
                <div>
                  <div className="num text-sm text-fg">{n.name}</div>
                  <div className="text-xs text-muted">{HOLDS[n.name] ?? ""}</div>
                </div>
                <div className="h-3 bg-white/[0.04] [clip-path:polygon(0_0,100%_0,calc(100%-6px)_100%,0_100%)]">
                  <div className="bar-x h-full bg-accent/70" style={{ width: `${(n.memories / max) * 100}%` }} />
                </div>
                <div className="num text-right text-lg font-semibold"><CountUp value={n.memories} /></div>
              </li>
            );
          })}
        </ul>
        <p className="num mt-6 border-t border-line pt-3 text-sm text-muted">Total <span className="text-fg"><CountUp value={memory.total} /></span> memories on mainnet</p>
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
                  <th className="px-3 py-2 text-right font-medium">Forecast / price</th>
                  <th className="px-3 py-2 font-medium">Checkpoint</th>
                  <th className="py-2 pl-3 font-medium">Blob</th>
                </tr>
              </thead>
              <tbody>
                {verdicts.slice(0, SHOWN).map((v) => (
                  <tr key={v.id} className="border-b border-line/60 align-top">
                    <td className="py-2.5 pr-3"><Link className="underline decoration-line underline-offset-4 hover:decoration-accent" href={`/move/${v.id}`}>{v.data.question}</Link></td>
                    <td className="px-3 py-2.5"><Badge tone="accent">{v.data.label}</Badge></td>
                    <td className="num px-3 py-2.5 text-muted">{v.data.model ?? "v1"}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right text-muted">{pct(v.data.forecast, 1)} / {pct(v.data.priceAtVerdict, 1)}</td>
                    <td className="num px-3 py-2.5"><ExternalLink href={suiscanCheckpoint(v.data.checkpoint.sequence)}>{v.data.checkpoint.sequence}</ExternalLink></td>
                    <td className="py-2.5 pl-3"><ExternalLink href={v.walruscan}>{v.blobId.slice(0, 8)}…</ExternalLink></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {verdicts.length > SHOWN ? (
          <details className="group mt-2">
            <summary className="num cursor-pointer list-none py-3 text-sm text-accent hover:text-fg">
              <span className="inline-block transition-transform group-open:rotate-90">›</span> Show the other {verdicts.length - SHOWN} sealed verdicts
            </summary>
            <TableWrap>
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sr-only">
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 pr-3 font-medium">Market</th>
                    <th className="px-3 py-2 font-medium">Label</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 text-right font-medium">Forecast / price</th>
                    <th className="px-3 py-2 font-medium">Checkpoint</th>
                    <th className="py-2 pl-3 font-medium">Blob</th>
                  </tr>
                </thead>
                <tbody>
                  {verdicts.slice(SHOWN).map((v) => (
                    <tr key={v.id} className="border-b border-line/60 align-top">
                      <td className="py-2.5 pr-3"><Link className="underline decoration-line underline-offset-4 hover:decoration-accent" href={`/move/${v.id}`}>{v.data.question}</Link></td>
                      <td className="px-3 py-2.5"><Badge tone="accent">{v.data.label}</Badge></td>
                      <td className="num px-3 py-2.5 text-muted">{v.data.model ?? "v1"}</td>
                      <td className="num whitespace-nowrap px-3 py-2.5 text-right text-muted">{pct(v.data.forecast, 1)} / {pct(v.data.priceAtVerdict, 1)}</td>
                      <td className="num px-3 py-2.5"><ExternalLink href={suiscanCheckpoint(v.data.checkpoint.sequence)}>{v.data.checkpoint.sequence}</ExternalLink></td>
                      <td className="py-2.5 pl-3"><ExternalLink href={v.walruscan}>{v.blobId.slice(0, 8)}…</ExternalLink></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </details>
        ) : null}
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
        <H2 sub={`${(memory.namespaces.find((n) => n.name === "calibre-wallets")?.memories ?? 0).toLocaleString("en-US")} wallet records are sealed on Walrus. The local index the watcher labels takers from is larger (${walletIndex.totalRows.toLocaleString("en-US")} wallet-by-league rows across ${walletIndex.totalWallets.toLocaleString("en-US")} wallets) and is not all sealed. A few sealed records:`}>Sample wallet records on Walruscan</H2>
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
        <H2 sub="One real call to the paid agent API, settled on Sui mainnet.">Agent payment receipt</H2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Call</dt><dd><code className="num text-xs">GET /api/v1/xray/&lt;wallet&gt;</code>, paid with MPP (0.01 USDC)</dd>
          <dt className="text-muted">Transaction</dt><dd><ExternalLink href={`https://suiscan.xyz/mainnet/tx/${PAYMENT.digest}`}><span className="num break-all text-xs">{PAYMENT.digest}</span></ExternalLink></dd>
          <dt className="text-muted">Checkpoint</dt><dd><ExternalLink href={suiscanCheckpoint(PAYMENT.checkpoint)}>{Number(PAYMENT.checkpoint).toLocaleString("en-US")}</ExternalLink> <span className="text-muted">at {PAYMENT.at}</span></dd>
          <dt className="text-muted">Transfer</dt><dd>0.01 USDC from the agent wallet <span className="num">{shortAddr(PAYMENT.from)}</span> to the API&apos;s wallet <span className="num">{shortAddr(PAYMENT.to)}</span>; the agent held no SUI and paid no gas</dd>
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The API answers 402 with a payment challenge, the agent signs a USDC transfer, and the server checks the transaction on chain before it returns the X-ray with the digest as its receipt. Each digest pays for one call. See <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs">docs/AGENT_PAYMENTS.md</code>.
        </p>
      </Card>

      <Card>
        <H2>Verify it yourself</H2>
        <p className="text-sm leading-relaxed text-muted">
          The repository includes a script that lists every memory in each namespace, decodes the sealed verdicts and outcomes, checks that the counts agree, reads the latest Sui checkpoint through Tatum's Sui gRPC (with Sui's public GraphQL as a labelled fallback), and writes the result to <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs">docs/PROOF.md</code>.
        </p>
        <pre className="num mt-3 overflow-x-auto cut bg-black/40 p-4 text-sm">{`pnpm install\ncp .env.example .env   # add your Tatum and Walrus Memory keys\npnpm verify`}</pre>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The figures above are static files exported from Walrus Memory by <code className="num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs">pnpm export:site</code>. Live X-rays run on the server: each is stamped with a Sui checkpoint through Tatum&apos;s gRPC, market X-rays read their fills from Tatum&apos;s Prediction Markets API, and every source is labelled on the result.
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
