import Link from "next/link";
import { FindingsChart } from "@/components/findings-chart";
import { SearchBox } from "@/components/search-box";
import { Card, H2, Stat } from "@/components/ui";
import { findings, memory, verdicts, walletIndex } from "@/lib/data";

const SAMPLE_WALLET = "0x684baa57c338c2549aec0aa3f034f695d72a8409";

const STEPS = [
  { title: "Catch the move", body: "When a Polymarket price jumps, CALIBRE pulls the trades behind it and groups them by the wallet that took them." },
  { title: "Audit each wallet", body: "Every wallet's real record is measured against the price it paid, split into pre-game and in-play bets, with bets at already-decided prices set apart as sniping. Edge comes with an error band." },
  { title: "Seal the verdict", body: "The verdict is written to Walrus Memory on Sui mainnet, with a Sui checkpoint read through Tatum, before the result is known. It can say plainly that nobody behind the move has a proven edge." },
  { title: "Grade it later", body: "When the market resolves, the forecast is scored against the market price and the outcome is sealed next to the verdict." },
];

export default function Home() {
  const verdictsNamespace = memory.namespaces.find((n) => n.name === "calibre-verdicts")?.memories ?? verdicts.length;
  return (
    <div className="space-y-12 sm:space-y-16">
      <section>
        <p className="text-sm font-medium text-accent">Polymarket wallet audits, sealed on Walrus</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl sm:leading-[1.1]">
          Who moved this market, and is their record skill, luck, or sniping?
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          CALIBRE shows who traded a move and audits each wallet&apos;s real record with error bars. When nobody behind a move has a proven edge,
          it says so. Every verdict is sealed in Walrus Memory with a Sui checkpoint read through Tatum, and graded after the market resolves.
        </p>
        <SearchBox className="mt-7 max-w-xl" />
        <p className="mt-3 text-sm text-muted">
          No address handy? <Link className="text-accent underline" href={`/wallet/${SAMPLE_WALLET}`}>Audit a sample wallet</Link>, or see the{" "}
          <Link className="text-accent underline" href="/moves">sealed verdicts</Link>.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Numbers">
        <Stat label="Memories on mainnet" value={memory.total} note="Walrus Memory, Sui" />
        <Stat label="Sealed verdicts" value={verdictsNamespace} note="Graded after resolution" />
        <Stat label="Wallet records" value={walletIndex.totalRows.toLocaleString("en-US")} note={`${walletIndex.totalWallets} wallets, by league`} />
        <Stat label="Sui checkpoint" value={memory.checkpoint ? Number(memory.checkpoint.sequence).toLocaleString("en-US") : "n/a"} note="Read through Tatum gRPC" />
      </section>

      <Card>
        <H2
          sub="We checked whether a wallet's edge against the price it paid in older bets predicts its edge in newer bets. If it did, weighting a move by who traded it would carry information."
        >
          What the data says: the leaderboard ranks luck
        </H2>
        <FindingsChart rows={findings.rows} />
        <ul className="mt-5 space-y-2 text-sm leading-relaxed text-muted">
          {findings.readout.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          So CALIBRE does not call a move &quot;sharp money&quot; from wallet history alone. Profit-blind wallets unless noted; sports markets; corrected {findings.corrected}.{" "}
          <Link href="/method" className="text-accent underline">Read the method and limits</Link>.
        </p>
      </Card>

      <section>
        <H2>How it works</H2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-panel p-5">
              <div className="num text-xs text-accent">0{i + 1}</div>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/moves", title: "Sealed verdicts", body: "Every move CALIBRE judged, with its receipt." },
          { href: "/proof", title: "Proof", body: "Memory counts, blob links, and how to verify them yourself." },
          { href: "/method", title: "Method", body: "How edge is measured, the study, and what it cannot show." },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border border-line bg-panel p-5 transition hover:border-accent/60">
            <div className="font-semibold">{l.title} <span aria-hidden className="text-accent">→</span></div>
            <p className="mt-1 text-sm text-muted">{l.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
