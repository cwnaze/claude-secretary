// Vault operations. Notes are only ever created or edited in place — never
// moved or renamed — so wikilinks the user has made keep working.

import fs from 'node:fs';
import path from 'node:path';
import { buildNote, readNoteText, setNoteFields } from './yaml.mjs';
import { todayIn, formatLocal } from './tz.mjs';

export const TYPE_FOLDERS = {
  briefing: 'Briefings',
  triage: 'Inbox',
  draft: 'Inbox/Drafts',
  meeting: 'Meetings',
  followup: 'Follow-ups',
  person: 'People',
  expense: 'Expenses', // + /YYYY-MM
  invoice: 'Expenses/Invoices',
  budget: 'Expenses',
  note: 'Notes',
};
export const TYPES = Object.keys(TYPE_FOLDERS);

export function sanitizeTitle(title) {
  const t = String(title || '').replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('A title is required');
  return t.slice(0, 120);
}

export function folderFor(cfg, type, data = {}) {
  const s = cfg.settings;
  if (s.organize_by === 'tags') return cfg.rootDir;
  let sub = TYPE_FOLDERS[type] || 'Notes';
  if (type === 'expense') {
    const month = String(data.date || todayIn(s.timezone)).slice(0, 7);
    sub = path.join(sub, month);
  }
  return path.join(cfg.rootDir, sub);
}

export function attachmentsDir(cfg, type) {
  if (cfg.settings.organize_by === 'tags') return path.join(cfg.rootDir, 'Attachments');
  return path.join(cfg.rootDir, type === 'expense' || type === 'invoice' ? 'Expenses/Receipts' : 'Attachments');
}

function uniquePath(dir, base, ext = '.md') {
  let p = path.join(dir, base + ext); let i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} ${i++}${ext}`);
  return p;
}

export function tagFor(cfg, type) { return `${cfg.settings.tag_prefix || 'secretary'}/${type}`; }

export function createNote(cfg, { type, title, fields = {}, body = '', tags = [], attach = null }) {
  if (!TYPES.includes(type)) throw new Error(`Unknown note type "${type}". Known: ${TYPES.join(', ')}`);
  const s = cfg.settings;
  const dir = folderFor(cfg, type, fields);
  fs.mkdirSync(dir, { recursive: true });
  const file = uniquePath(dir, sanitizeTitle(title));
  const data = {
    type,
    tags: [tagFor(cfg, type), ...tags.filter(Boolean)],
    created: formatLocal(Date.now(), s.timezone),
    ...fields,
  };
  if (attach) {
    const src = path.resolve(attach);
    if (!fs.existsSync(src)) throw new Error(`Attachment not found: ${src}`);
    const adir = attachmentsDir(cfg, type);
    fs.mkdirSync(adir, { recursive: true });
    const ext = path.extname(src);
    const dest = uniquePath(adir, sanitizeTitle(path.basename(file, '.md')), ext);
    fs.copyFileSync(src, dest);
    data.attachment = `[[${path.basename(dest)}]]`;
    body = `${body}\n\n![[${path.basename(dest)}]]\n`;
  }
  fs.writeFileSync(file, buildNote(data, body.endsWith('\n') ? body : body + '\n'), { flag: 'wx' });
  return file;
}

export function resolveNotePath(cfg, p) {
  const candidates = [p, path.join(cfg.vault, p), path.join(cfg.rootDir, p)];
  for (const c of candidates) {
    for (const f of [c, c.endsWith('.md') ? c : c + '.md']) {
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        const real = path.resolve(f);
        if (!real.startsWith(path.resolve(cfg.vault) + path.sep)) throw new Error(`Refusing to edit a file outside the vault: ${real}`);
        return real;
      }
    }
  }
  throw new Error(`Note not found: ${p}`);
}

export function setFields(cfg, notePath, updates) {
  const f = resolveNotePath(cfg, notePath);
  const text = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, setNoteFields(text, { ...updates, updated: formatLocal(Date.now(), cfg.settings.timezone) }));
  return f;
}

export function appendToNote(cfg, notePath, text) {
  const f = resolveNotePath(cfg, notePath);
  const cur = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, cur + (cur.endsWith('\n') ? '' : '\n') + text + (text.endsWith('\n') ? '' : '\n'));
  return f;
}

function* walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

// Find notes by `type` property anywhere under the secretary root.
export function findNotes(cfg, { type = null, where = {} } = {}) {
  const out = [];
  for (const f of walk(cfg.rootDir)) {
    let data;
    try { ({ data } = readNoteText(fs.readFileSync(f, 'utf8'))); } catch { continue; }
    if (type && data.type !== type) continue;
    let ok = true;
    for (const [k, v] of Object.entries(where)) {
      const vals = String(v).split('|');
      const actual = data[k];
      // a missing property matches "false" or an empty alternative ("status=open|")
      const matches = actual === undefined || actual === null
        ? vals.includes('') || vals.includes('false')
        : vals.includes(String(actual));
      if (!matches) { ok = false; break; }
    }
    if (ok) out.push({ path: path.relative(cfg.vault, f), title: path.basename(f, '.md'), ...data });
  }
  return out;
}

export function logAction(cfg, { action, target = '', summary = '', status = 'done' }) {
  const f = path.join(cfg.rootDir, 'Log.md');
  if (!fs.existsSync(f)) {
    fs.mkdirSync(cfg.rootDir, { recursive: true });
    fs.writeFileSync(f, buildNote({ type: 'log', tags: [tagFor(cfg, 'log')] },
      '# Secretary log\n\nEvery outbound or calendar action Claude takes is recorded here.\n\n| When | Action | Target | Summary | Status |\n|---|---|---|---|---|\n'));
  }
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  fs.appendFileSync(f, `| ${formatLocal(Date.now(), cfg.settings.timezone)} | ${esc(action)} | ${esc(target)} | ${esc(summary)} | ${esc(status)} |\n`);
  return f;
}

export function ensureLayout(cfg) {
  fs.mkdirSync(cfg.rootDir, { recursive: true });
  if (cfg.settings.organize_by !== 'tags') {
    for (const sub of new Set(Object.values(TYPE_FOLDERS))) fs.mkdirSync(path.join(cfg.rootDir, sub), { recursive: true });
  }
  const budget = findNotes(cfg, { type: 'budget' });
  if (budget.length === 0) {
    createNote(cfg, {
      type: 'budget', title: 'Budget',
      fields: { currency: cfg.settings.currency || 'USD' },
      body: '# Monthly budget\n\nAdd one property per category, e.g. `limit_food: 300`.\nClaude compares each month\'s expenses against these limits.\n',
    });
  }
}
