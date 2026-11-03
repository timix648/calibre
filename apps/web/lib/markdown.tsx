import type { ReactNode } from "react";

/** Inline `code`, **bold**, *italic* and [text](url) only: the subset docs/FINDINGS.md uses. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(<a key={k} href={link[2]} className="text-accent underline">{link[1]}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Renders the Markdown subset used by the repository docs (headings, paragraphs, bullet lists, tables) without a dependency. */
export function Markdown({ source, skipFirstHeading = false }: { source: string; skipFirstHeading?: boolean }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  let skipped = !skipFirstHeading;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${n++}`;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      i++;
      if (!skipped && h[1] === "#") { skipped = true; continue; }
      const level = h[1]!.length;
      blocks.push(level === 1 ? <h1 key={key}>{inline(h[2]!, key)}</h1> : level === 2 ? <h2 key={key}>{inline(h[2]!, key)}</h2> : <h3 key={key}>{inline(h[2]!, key)}</h3>);
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(cells(lines[i++]!));
      blocks.push(
        <div className="table-wrap" key={key}>
          <table>
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c, `${key}r${j}c${k}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]\s+|\s{2,}\S)/.test(lines[i]!)) {
        const l = lines[i++]!;
        if (/^\s*[-*]\s+/.test(l)) items.push(l.replace(/^\s*[-*]\s+/, ""));
        else items[items.length - 1] += " " + l.trim();
      }
      blocks.push(<ul key={key}>{items.map((t, j) => <li key={j}>{inline(t, `${key}i${j}`)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|\s*[-*]\s+|\s*\|)/.test(lines[i]!)) para.push(lines[i++]!.trim());
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }
  return <div className="prose-calibre">{blocks}</div>;
}
