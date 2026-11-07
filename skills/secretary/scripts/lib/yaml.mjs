// Minimal YAML-frontmatter support for Obsidian notes.
// Handles the subset Obsidian Properties produce: flat keys whose values are
// scalars (string, number, boolean, null, date) or lists (block or inline).
// Keys this module does not understand are preserved verbatim on rewrite.

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitNote(text) {
  const m = text.match(FM_RE);
  if (!m) return { frontmatter: '', body: text, hasFrontmatter: false };
  return { frontmatter: m[1], body: text.slice(m[0].length), hasFrontmatter: true };
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if ((s.startsWith('"') && s.endsWith('"')) && s.length >= 2) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s.replace(/\s+#.*$/, '');
}

function splitInlineList(inner) {
  const out = []; let cur = ''; let q = null;
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map(parseScalar);
}

// Returns ordered entries: [{ key, value, raw: [lines], known: bool }]
export function parseEntries(fm) {
  const lines = fm.split(/\r?\n/);
  const entries = [];
  let cur = null;
  for (const line of lines) {
    const top = line.match(/^([A-Za-z0-9_][A-Za-z0-9_\- ]*?):(?:\s(.*)|\s*)$/);
    if (top && !/^\s/.test(line)) {
      const key = top[1];
      const rest = top[2] ?? '';
      cur = { key, raw: [line], known: true };
      const r = rest.trim();
      if (r === '') cur.value = null; // may become a list
      else if (r.startsWith('[') && r.endsWith(']') && !r.startsWith('[[')) cur.value = splitInlineList(r.slice(1, -1));
      else if (r === '|' || r === '>' || r.startsWith('|') || r.startsWith('>')) { cur.value = ''; cur.block = true; }
      else cur.value = parseScalar(r);
      entries.push(cur);
      continue;
    }
    if (!cur) { entries.push({ key: null, raw: [line], known: false }); continue; }
    cur.raw.push(line);
    const li = line.match(/^\s*-\s?(.*)$/);
    if (li && !cur.block && (cur.value === null || Array.isArray(cur.value))) {
      if (!Array.isArray(cur.value)) cur.value = [];
      cur.value.push(parseScalar(li[1]));
    } else if (cur.block) {
      cur.value += (cur.value ? '\n' : '') + line.trim();
    } else if (line.trim() !== '') {
      cur.known = false; // nested map or something we don't model
    }
  }
  return entries;
}

export function parseFrontmatter(fm) {
  const obj = {};
  for (const e of parseEntries(fm)) if (e.key) obj[e.key] = e.value;
  return obj;
}

const DATEISH = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
function needsQuote(s) {
  if (s === '') return true;
  if (DATEISH.test(s)) return false;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(s)) return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  if (/^\d+(:\d+)+$/.test(s)) return true; // "09:00" is a base-60 number in YAML 1.1
  if (/^[\[\]{}>|*&!%@`#,?:\-'"]/.test(s)) return true;
  if (/: |\s#|\n|^\s|\s$/.test(s)) return true;
  return false;
}

export function formatScalar(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  return needsQuote(s) ? JSON.stringify(s) : s;
}

export function formatEntry(key, value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    return [`${key}:`, ...value.map((v) => `  - ${formatScalar(v)}`)];
  }
  const f = formatScalar(value);
  return [f === '' ? `${key}:` : `${key}: ${f}`];
}

export function stringifyFrontmatter(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) lines.push(...formatEntry(k, v));
  return lines.join('\n');
}

// Update some keys in existing frontmatter text, preserving everything else.
export function updateFrontmatter(fm, updates) {
  const entries = parseEntries(fm);
  const seen = new Set();
  for (const e of entries) {
    if (e.key && Object.prototype.hasOwnProperty.call(updates, e.key)) {
      seen.add(e.key);
      const v = updates[e.key];
      e.raw = v === undefined ? [] : formatEntry(e.key, v);
    }
  }
  const out = entries.flatMap((e) => e.raw);
  for (const [k, v] of Object.entries(updates)) if (!seen.has(k) && v !== undefined) out.push(...formatEntry(k, v));
  return out.filter((l, i, a) => !(l === '' && i === a.length - 1)).join('\n');
}

export function buildNote(frontmatterObj, body = '') {
  return `---\n${stringifyFrontmatter(frontmatterObj)}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`;
}

export function readNoteText(text) {
  const { frontmatter, body, hasFrontmatter } = splitNote(text);
  return { data: hasFrontmatter ? parseFrontmatter(frontmatter) : {}, frontmatter, body, hasFrontmatter };
}

export function setNoteFields(text, updates) {
  const { frontmatter, body, hasFrontmatter } = splitNote(text);
  const fm = hasFrontmatter ? updateFrontmatter(frontmatter, updates) : stringifyFrontmatter(updates);
  return `---\n${fm}\n---\n${body}`;
}
