import type { ReactNode } from "react";
export function safeHttpUrl(value: string): string | null {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [], pattern = /(\*\*[^*\n]{1,512}\*\*|`[^`\n]{1,512}`|\[[^\]\n]{1,256}\]\(https?:\/\/[^\s)]+\))/g;
  let cursor = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    nodes.push(text.slice(cursor, match.index)); const token = match[0], key = match.index;
    if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else { const split = token.indexOf("]("), href = safeHttpUrl(token.slice(split + 2, -1)); nodes.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{token.slice(1, split)}</a> : token); }
    cursor = pattern.lastIndex;
  }
  nodes.push(text.slice(cursor)); return nodes;
}
function cells(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(cell => cell.trim());
}
function isDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");
}
export default function SafeMarkdown({ text }: { text: string }) {
  const allLines = text.split(/\r?\n/), lines = allLines.slice(0, 512), blocks: ReactNode[] = [];
  let code: string[] | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.startsWith("```")) { if (code) { blocks.push(<pre key={index}><code>{code.join("\n")}</code></pre>); code = null; } else code = []; continue; }
    if (code) { code.push(line); continue; }
    if (!line.trim()) continue;
    const next = lines[index + 1];
    if (line.includes("|") && next !== undefined && isDivider(next)) {
      const header = cells(line), rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim()) { rows.push(cells(lines[index]!)); index += 1; }
      index -= 1;
      blocks.push(<div className="safe-markdown-table-scroll" key={`table-${index}`}><table><thead><tr>{header.map((cell, cell$index) => <th key={cell$index}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, row$index) => <tr key={row$index}>{header.map((_, cell$index) => <td key={cell$index}>{inline(row[cell$index] ?? "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*[-*] /.test(line) || /^\s*\d+\. /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line), items: string[] = [];
      let scan = index;
      while (scan < lines.length) {
        const candidate = lines[scan]!, match = ordered ? /^\s*\d+\. (.*)$/.exec(candidate) : /^\s*[-*] (.*)$/.exec(candidate);
        if (!match) break;
        items.push(match[1]!); scan += 1;
      }
      index = scan - 1;
      const listItems = items.map((item, item$index) => <li key={item$index}>{inline(item)}</li>);
      blocks.push(ordered ? <ol key={`list-${index}`}>{listItems}</ol> : <ul key={`list-${index}`}>{listItems}</ul>);
      continue;
    }
    if (/^\s*> /.test(line)) {
      const quotes: string[] = [];
      let scan = index;
      while (scan < lines.length && /^\s*> /.test(lines[scan]!)) { quotes.push(lines[scan]!.replace(/^\s*> /, "")); scan += 1; }
      index = scan - 1;
      blocks.push(<blockquote key={`quote-${index}`}>{inline(quotes.join(" "))}</blockquote>);
      continue;
    }
    const heading = /^#{1,3} (.+)$/.exec(line);
    blocks.push(heading ? <h3 key={index}>{inline(heading[1]!)}</h3> : <p key={index}>{inline(line)}</p>);
  }
  if (code) blocks.push(<pre key="unclosed-code"><code>{code.join("\n")}</code></pre>);
  if (allLines.length > 512) blocks.push(<p key="line-limit">Output is truncated to keep this view responsive.</p>);
  return <div className="safe-markdown">{blocks}</div>;
}
