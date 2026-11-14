import type { ReactNode } from 'react';
import { obsidian, safeHref } from '@/lib/obsidian';
import s from './Markdown.module.css';

// A small Markdown renderer for briefing notes: headings, lists, tables, quotes and paragraphs,
// with bold, italics, code, [[wikilinks]] and http(s) links inline. Vault text is untrusted, so
// everything becomes React text and elements; no HTML is ever injected.

const INLINE = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(?<![\w*])[*_]([^*_\n]+)[*_](?![\w*])|(https?:\/\/[^\s<>)\]]+)/g;

export function Inline({ text, vault }: { text: string; vault: string }) {
  const out: ReactNode[] = []; let last = 0; let k = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const [all, wiki, alias, label, href, bold, code, em, bare] = m;
    if (wiki) out.push(<a key={k++} href={obsidian(vault, wiki.split('#')[0].trim())}>{alias || wiki}</a>);
    else if (label) { const h = safeHref(href); out.push(h ? <a key={k++} href={h} target="_blank" rel="noreferrer">{label}</a> : label); }
    else if (bold) out.push(<strong key={k++}><Inline text={bold} vault={vault} /></strong>);
    else if (code) out.push(<code key={k++}>{code}</code>);
    else if (em) out.push(<em key={k++}>{em}</em>);
    else if (bare) { const h = safeHref(bare); out.push(h ? <a key={k++} href={h} target="_blank" rel="noreferrer">{bare}</a> : bare); }
    else out.push(all);
    last = m.index! + all.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// Table cells, not splitting on escaped pipes or the alias pipe inside a [[wikilink|alias]].
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').replace(/\[\[[^\]]*\]\]/g, (w) => w.replace(/\\?\|/g, '\u0000'))
  .split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/\u0000/g, '|'));
const LIST = /^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;

export function Markdown({ text, vault }: { text: string; vault: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = []; let i = 0; let k = 0;
  while (i < lines.length) {
    const line = lines[i]; const t = line.trim();
    if (!t || /^```/.test(t) || /^---+$/.test(t)) { i++; continue; }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push(<h3 key={k++} className={s.h}><Inline text={h[2]} vault={vault} /></h3>); i++; continue; }
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
      const isSep = (r: string[]) => r.every((c) => /^:?-{2,}:?$/.test(c));
      const body = rows.filter((r) => !isSep(r));
      const head = rows[1] && isSep(rows[1]) ? body[0] : null;
      const rest = head ? body.slice(1) : body;
      blocks.push(
        <div key={k++} className={s.tableWrap}><table className={s.table}>
          {head && <thead><tr>{head.map((c, j) => <th key={j}><Inline text={c} vault={vault} /></th>)}</tr></thead>}
          <tbody>{rest.map((r, j) => <tr key={j}>{r.map((c, l) => <td key={l}><Inline text={c} vault={vault} /></td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (LIST.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: { text: string; task: null | boolean }[] = [];
      while (i < lines.length && LIST.test(lines[i])) {
        const m = lines[i].match(LIST)!;
        items.push({ text: lines[i].slice(m[0].length), task: m[2] ? /x/i.test(m[2]) : null });
        i++;
        while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && /^\s{2,}/.test(lines[i])) { items[items.length - 1].text += ` ${lines[i].trim()}`; i++; }
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k++} className={s.list}>
          {items.map((it, j) => (
            <li key={j} data-task={it.task === null ? undefined : it.task ? 'done' : 'open'}><Inline text={it.text} vault={vault} /></li>
          ))}
        </Tag>,
      );
      continue;
    }
    if (t.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '').replace(/^\[![\w-]+\][+-]?\s*/, '')); i++; }
      blocks.push(<blockquote key={k++} className={s.quote}><Inline text={q.filter(Boolean).join(' ')} vault={vault} /></blockquote>);
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\||>|```)/.test(lines[i].trim()) && !LIST.test(lines[i])) { p.push(lines[i].trim()); i++; }
    blocks.push(<p key={k++} className={s.p}><Inline text={p.join(' ')} vault={vault} /></p>);
  }
  return <div className={s.md}>{blocks}</div>;
}

// Split a note into its `##` sections so the first one can show and the rest fold away.
export function sections(text: string): { heading: string | null; body: string }[] {
  const out: { heading: string | null; body: string }[] = [];
  for (const chunk of text.split(/\n(?=#{1,3}\s)/)) {
    const m = chunk.match(/^#{1,3}\s+([^\n]*)\n?([\s\S]*)$/);
    const sec = m ? { heading: m[1].trim(), body: m[2].trim() } : { heading: null, body: chunk.trim() };
    if (sec.heading || sec.body) out.push(sec);
  }
  return out;
}
