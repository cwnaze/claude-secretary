// Data for the web dashboard. Read-only: nothing here writes to the vault.

import fs from 'node:fs';
import path from 'node:path';
import { findNotes } from './vault.mjs';
import { readNoteText } from './yaml.mjs';
import { ACTIONS, permission } from './config.mjs';
import { collectEvents } from './calendar.mjs';
import { parseWhen, todayIn, addDays, formatLocal } from './tz.mjs';
import { fmtEvents, followupsDue, peopleDue, invoicesDue, expenseSummary } from './views.mjs';

// First prose paragraph of a note body: skips headings, callouts, lists and embeds.
export function leadParagraph(body) {
  const paras = String(body || '').split(/\n\s*\n/);
  for (const p of paras) {
    const t = p.trim();
    if (!t || /^(#|>|-|\*|\d+\.|!\[\[|\||```)/.test(t)) continue;
    return t.replace(/\s*\n\s*/g, ' ').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a).replace(/[*_`]/g, '');
  }
  return null;
}

function latestBriefing(cfg, date) {
  const notes = findNotes(cfg, { type: 'briefing' })
    .filter((n) => /^Briefing \d{4}-\d{2}-\d{2}/.test(n.title) && n.title.slice(9, 19) <= date)
    .sort((a, b) => b.title.localeCompare(a.title));
  const n = notes[0];
  if (!n) return null;
  let summary = null;
  try { summary = leadParagraph(readNoteText(fs.readFileSync(path.join(cfg.vault, n.path), 'utf8')).body); } catch { /* unreadable note */ }
  return { title: n.title, date: n.title.slice(9, 19), created: n.created ? String(n.created) : null, path: n.path, summary };
}

// Rows of Log.md whose timestamp starts with `date`.
export function logRows(cfg, date) {
  let text;
  try { text = fs.readFileSync(path.join(cfg.rootDir, 'Log.md'), 'utf8'); } catch { return []; }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith(`| ${date}`)) continue;
    const cells = line.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.length < 5) continue;
    const [when, action, target, summary, status] = cells;
    rows.push({ when, action, target, summary, status });
  }
  return rows;
}

const s = (v) => (v === null || v === undefined ? undefined : String(v));

export async function homeData(cfg, { date = null, now = Date.now() } = {}) {
  const st = cfg.settings; const tz = st.timezone;
  const day = date || todayIn(tz, now);
  const from = parseWhen(day, tz, now); const to = parseWhen(addDays(day, 1), tz, now);
  let cal = { events: [], warnings: [] };
  try { cal = await collectEvents(st, from, to); } catch (e) { cal.warnings.push(e.message); }

  const drafts = findNotes(cfg, { type: 'draft', where: { status: 'draft|' } })
    .map((n) => ({ path: n.path, title: n.title, to: s(n.to), subject: s(n.subject), channel: s(n.channel) || 'email', created: s(n.created) }))
    .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  const log = logRows(cfg, day);
  const spend = expenseSummary(cfg, day.slice(0, 7));

  return {
    date: day,
    now: formatLocal(now, tz),
    timezone: tz,
    name: st.name || '',
    work_start: st.work_start,
    work_end: st.work_end,
    vault: path.basename(cfg.vault),
    root: cfg.root,
    settings_found: cfg.settingsFound,
    calendar_backend: st.calendar_backend,
    events: fmtEvents(cal.events, tz),
    calendar_warnings: cal.warnings,
    briefing: latestBriefing(cfg, day),
    drafts,
    blocked: log.filter((r) => r.status === 'blocked'),
    sent_today: log.filter((r) => r.status === 'done').length,
    followups: followupsDue(cfg, 0, day),
    people: peopleDue(cfg, 7, day),
    invoices: invoicesDue(cfg, 7, day),
    spend,
    permissions: Object.fromEntries(ACTIONS.map((a) => [a, permission(st, a)])),
  };
}
