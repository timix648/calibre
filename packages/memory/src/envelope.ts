/**
 * A memory is one line: `[cal1|<kind>|<key>|v<n>] <summary> || <json>`.
 * The summary is plain English so semantic recall finds it; the JSON makes replay exact.
 * Walrus Memory has no update or delete, so a new version supersedes the old one by key.
 */
export const SCHEMA = "cal1";

export interface Envelope<T = Record<string, unknown>> {
  kind: string;
  key: string;
  version: number;
  summary: string;
  data: T;
}

const HEADER = /^\[([a-z0-9]+)\|([a-z_-]+)\|([^|\]]+)\|v(\d+)\]\s*/;
const SEP = " || ";

export function encode<T>(e: Envelope<T>): string {
  if (/[|\]]/.test(e.kind) || /[|\]]/.test(e.key)) throw new Error("kind and key must not contain | or ]");
  const summary = e.summary.replace(/\s+/g, " ").replace(/\|\|/g, "|").trim();
  return `[${SCHEMA}|${e.kind}|${e.key}|v${e.version}] ${summary}${SEP}${JSON.stringify(e.data)}`;
}

export function decode<T = Record<string, unknown>>(text: string): Envelope<T> | null {
  const m = HEADER.exec(text);
  if (!m || m[1] !== SCHEMA) return null;
  const rest = text.slice(m[0].length);
  const cut = rest.lastIndexOf(SEP);
  if (cut < 0) return null;
  try {
    return { kind: m[2]!, key: m[3]!, version: Number(m[4]), summary: rest.slice(0, cut), data: JSON.parse(rest.slice(cut + SEP.length)) as T };
  } catch {
    return null;
  }
}

/** Highest version per key wins; unparseable or foreign memories are ignored. */
export function latestByKey<T>(texts: string[], kind?: string): Map<string, Envelope<T>> {
  const out = new Map<string, Envelope<T>>();
  for (const t of texts) {
    const e = decode<T>(t);
    if (!e || (kind && e.kind !== kind)) continue;
    const prev = out.get(e.key);
    if (!prev || e.version > prev.version) out.set(e.key, e);
  }
  return out;
}
