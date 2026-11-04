import { XRAY_SHORT, XRAY_SUBTITLE } from "../../../packages/core/src/xray";
import type { MarketXray, WalletXray } from "../../../packages/public-data/src";

export type Tone = "bad" | "warn" | "muted" | "good" | "accent";

export interface ChipModel { text: string; tone: Tone }

export interface TakerRowModel {
  name: string;
  /** Path on the CALIBRE site (the panel prefixes the API base). */
  sitePath: string;
  chip: ChipModel;
  meta: string;
}

/** Everything the panel shows, as plain data. The panel turns it into DOM; nothing here touches the page. */
export interface PanelModel {
  title: string;
  subtitle?: string;
  chip?: ChipModel;
  lead?: string;
  stats: { label: string; value: string }[];
  bar?: { share: number; coverage: number };
  takers: TakerRowModel[];
  notes: string[];
  /** The full X-ray on the CALIBRE site. */
  more?: { label: string; sitePath: string };
  /** Offer a "check again" button (a partial market result). */
  refresh?: boolean;
}

const LABEL_TEXT: Record<string, string> = XRAY_SHORT;

const tone = (t: string | null | undefined): Tone => (t === "bad" || t === "warn" || t === "good" ? t : "muted");
const pct = (p: number) => `${Math.round(p * 100)}%`;
const pts = (p: number) => `${p >= 0 ? "+" : "-"}${Math.abs(p * 100).toFixed(1)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

export function walletModel(r: WalletXray): PanelModel {
  const a = r.audit;
  const notes: string[] = [];
  if (r.xray.caveat) notes.push(r.xray.caveat);
  if (r.tradesFetched === 0) {
    return {
      title: "Wallet X-ray", subtitle: r.name ?? short(r.address), stats: [], takers: [],
      lead: "No trades found for this address. Polymarket accounts trade through a proxy wallet: use the address on the profile page.",
      notes, more: { label: "Open the full X-ray", sitePath: `/wallet/${r.address}` },
    };
  }
  return {
    title: "Wallet X-ray",
    subtitle: r.name && !r.name.startsWith("0x") ? `${r.name} · ${short(r.address)}` : short(r.address),
    chip: { text: LABEL_TEXT[r.xray.label] ?? r.xray.label, tone: tone(r.xray.tone) },
    lead: r.xray.sentence,
    stats: [
      { label: "Scored bets", value: String(a.n) },
      { label: "Edge", value: a.overall.n > 0 ? `${pts(a.overall.edge)} ± ${a.overall.se === null ? "n/a" : (a.overall.se * 200).toFixed(1)}` : "n/a" },
      { label: "Sniping", value: pct(a.sniping.share) },
    ],
    takers: [],
    notes: [...notes, `Label check: ${XRAY_SUBTITLE[r.xray.label]}.`],
    more: { label: "Open the full X-ray", sitePath: `/wallet/${r.address}` },
  };
}

export function marketModel(r: MarketXray, sitePath: string): PanelModel {
  const m = r.move;
  const base: PanelModel = { title: "Market X-ray", subtitle: r.market.question, stats: [], takers: [], notes: [], more: { label: "Open the full X-ray", sitePath } };
  if (!m) {
    return { ...base, lead: r.noMoveReason ?? "No recent move.", notes: [r.caution] };
  }
  const sq = r.squareMoney;
  const notes: string[] = [];
  if (m.settling) notes.push("The price ended at a decided level: this looks like the market settling, not repricing.");
  if (!r.complete) notes.push("Partial result: some takers were still being audited.");
  notes.push(r.caution);
  return {
    ...base,
    chip: sq ? { text: sq.squareWallets > 0 ? `${pct(sq.shareOfJudged ?? 0)} of judged money from proven losers` : "No proven losers among the judged money", tone: sq.squareWallets > 0 ? "bad" : "muted" } : undefined,
    lead: `${r.market.yesOutcome} ${pct(m.from)} → ${pct(m.to)} (${m.points >= 0 ? "+" : "-"}${Math.abs(m.points).toFixed(1)} pts). ${sq?.note ?? ""}`.trim(),
    stats: sq
      ? [
          { label: "Of all pushing money", value: pct(sq.share) },
          { label: "Coverage", value: pct(sq.coverage) },
          { label: "Wallets", value: String(sq.wallets) },
        ]
      : [],
    bar: sq ? { share: sq.share, coverage: sq.coverage } : undefined,
    takers: r.takers.map((t) => ({
      name: t.name && !t.name.startsWith("0x") ? t.name : short(t.address),
      sitePath: `/wallet/${t.address}`,
      chip: t.status === "audited" && t.label
        ? { text: LABEL_TEXT[t.label] ?? t.label, tone: tone(t.tone) }
        : { text: t.status === "pending" ? "Still auditing" : "Audit failed", tone: "warn" },
      meta: `${usd(t.netUsd)} on ${t.pushed}`,
    })),
    notes,
    refresh: !r.complete,
  };
}
