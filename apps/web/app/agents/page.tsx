import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, H2, PageTitle, Stat } from "@/components/ui";

export const metadata: Metadata = {
  title: "For agents",
  description: "CALIBRE as tools an agent can call: an MCP server over a URL, and a wallet X-ray paid for in USDC on Sui.",
};

const MCP_URL = "https://calibre-blush.vercel.app/api/mcp";
const code = "num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs text-fg";

const CLIENTS = [
  { name: "Claude Code", how: <>Run <code className={code}>claude mcp add --transport http calibre {MCP_URL}</code></> },
  { name: "Claude Desktop, Cursor, VS Code, Windsurf, Cline, Goose", how: <>Add a remote or HTTP MCP server in the app&apos;s settings and paste the URL above.</> },
  { name: "Anything else", how: <>It is plain JSON-RPC over HTTP. Any language that can POST can call it, with no SDK and no key.</> },
];

const TOOLS = [
  {
    name: "wallet_audit",
    args: "address",
    what: "A Polymarket wallet's record against the prices it paid: pre-game and in-play edge with error bands, the share of bets placed at already-decided prices, a per-league breakdown, and a verdict. Reads the newest 1,000 trades.",
  },
  {
    name: "latest_verdicts",
    args: "limit",
    what: "The most recent market-move verdicts sealed in Walrus Memory on Sui mainnet: the market, the label, the forecast against the price, the Sui checkpoint it was read at, and the Walruscan link to the blob.",
  },
];

export default function AgentsPage() {
  return (
    <div className="space-y-14">
      <PageTitle tab="For agents"
        title="For agents"
        sub="Two ways a program can use CALIBRE: free tools over MCP, and a paid X-ray settled on chain."
      />

      <section>
        <H2 sub="An open protocol, so this is not tied to any one assistant. Nothing to install and no key to get.">
          MCP server
        </H2>

        <div className="mt-6 plate p-5">
          <div className="text-xs uppercase tracking-[0.14em] text-faint">Endpoint</div>
          <div className="num mt-2 break-all text-sm text-accent">{MCP_URL}</div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Streamable HTTP transport, stateless, read-only. It serves the same two tools as the local server in the
            repository, from the same code.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <div key={t.name} className="plate p-5">
              <div className="flex items-baseline gap-2">
                <span className="num text-sm font-semibold text-fg">{t.name}</span>
                <span className="num text-xs text-faint">({t.args})</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{t.what}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-faint">Adding it</h3>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed">
          {CLIENTS.map((c) => (
            <div key={c.name} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
              <dt className="text-fg">{c.name}</dt>
              <dd className="text-muted">{c.how}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <H2 sub="For an agent with a wallet but no account: no signup, no key, no invoice.">Paid X-ray</H2>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <Stat label="Call" value={<code className="num text-sm">GET /api/v1/xray/&lt;wallet&gt;</code>} note="The same X-ray the site shows" />
          <Stat label="Price" value="0.01 USDC" note="Settled on Sui over MPP" />
          <Stat label="Gas" value="None" note="The buyer holds no SUI" />
        </div>
        <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-muted">
          The first call answers <span className="num">402</span> with a payment challenge; the agent pays and repeats the call
          with the receipt. Every receipt carries the Sui checkpoint the payment was confirmed at, read through Tatum.{" "}
          <Link href="/proof" className="text-accent underline-offset-4 hover:underline">The proof page</Link> has a real
          payment on mainnet, with its digest.
        </p>
      </section>

      <section>
        <H2>Source</H2>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted">
          Both are in the repository:{" "}
          <ExternalLink href="https://github.com/timix648/calibre/tree/main/apps/mcp">apps/mcp</ExternalLink> for the tools and{" "}
          <ExternalLink href="https://github.com/timix648/calibre/blob/main/apps/web/app/api/mcp/route.ts">the HTTP route</ExternalLink>{" "}
          that serves them. The local server runs over stdio with{" "}
          <code className={code}>claude mcp add calibre -- pnpm --silent exec tsx apps/mcp/src/index.ts</code>.
        </p>
      </section>
    </div>
  );
}
