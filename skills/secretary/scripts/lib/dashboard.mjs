// Data for the web dashboard. Read-only: nothing here writes to the vault.

import fs from 'node:fs';
import path from 'node:path';
import { findNotes } from './vault.mjs';
import { readNoteText } from './yaml.mjs';
import { ACTIONS, permission } from './config.mjs';
import { collectEvents } from './calendar.mjs';
import { parseWhen, todayIn, addDays, formatLocal } from './tz.mjs';
import { fmtEvents, followupsDue, peopleDue, invoicesDue, expenseSummary, logRows } from './views.mjs';

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

// Body of the briefing after its `#` title and lead sentence, for the full briefing on the home page.
export function briefingRest(body) {
  const lead = leadParagraph(body);
  const paras = String(body || '').replace(/^\s*# [^\n]*\n/, '').split(/\n\s*\n/);
  let dropped = false;
  const rest = paras.filter((p) => {
    if (dropped || !lead) return true;
    const t = p.trim();
    if (/^(#|>|-|\*|\d+\.|!\[\[|\||```)/.test(t) || !t) return true;
    dropped = true; return false;
  });
  return rest.join('\n\n').trim().slice(0, 12000) || null;
}

function noteBody(cfg, n) {
  try { return readNoteText(fs.readFileSync(path.join(cfg.vault, n.path), 'utf8')).body; } catch { return null; }
}

// Latest note of `type` titled "<prefix> YYYY-MM-DD..." on or before `date`.
function latestDated(cfg, type, prefix, date) {
  const re = new RegExp(`^${prefix} (\\d{4}-\\d{2}-\\d{2})`);
  return findNotes(cfg, { type })
    .map((n) => ({ n, d: n.title.match(re)?.[1] }))
    .filter((x) => x.d && x.d <= date)
    .sort((a, b) => b.n.title.localeCompare(a.n.title))[0] || null;
}

function latestBriefing(cfg, date) {
  const hit = latestDated(cfg, 'briefing', 'Briefing', date);
  if (!hit) return null;
  const body = noteBody(cfg, hit.n);
  return { title: hit.n.title, date: hit.d, created: hit.n.created ? String(hit.n.created) : null, path: hit.n.path, summary: body ? leadParagraph(body) : null, body: body ? briefingRest(body) : null };
}

// ---------- inbox triage ----------

const BUCKETS = [
  ['Urgent', /urgent/i], ['Reply', /repl/i], ['Delegate', /delegat/i], ['Waiting', /wait/i],
  ['FYI', /fyi|info/i], ['Archive', /archiv|newsletter|promo/i], ['Suspicious', /suspicious|phish/i],
];
const plain = (v) => String(v ?? '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/<[^>]*>/g, '').trim();
const firstNumber = (text) => { const m = String(text).match(/\b(\d{1,4})\b/); return m ? Number(m[1]) : 0; };
// Table cells, not splitting on escaped pipes or the alias pipe inside a [[wikilink|alias]].
const cellsOf = (line) => line.trim().replace(/^\||\|$/g, '').replace(/\[\[[^\]]*\]\]/g, (w) => w.replace(/\\?\|/g, '\u0000'))
  .split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/\u0000/g, '|'));

// A triage note has one section per bucket (heading like "🔴 Urgent (2)"), usually a table of
// sender / subject / summary / action, or just a count ("Archive: 14 newsletters").
export function triageBuckets(body) {
  const sections = []; let cur = null;
  for (const line of String(body || '').split('\n')) {
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) { cur = { heading: h[1], header: null, sep: false, rows: [], items: [], text: '' }; sections.push(cur); continue; }
    if (!cur) continue;
    const t = line.trim();
    if (t.startsWith('|')) {
      const cells = cellsOf(t);
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) cur.sep = true;
      else if (!cur.sep) cur.header = cells.map((c) => plain(c).toLowerCase());
      else cur.rows.push(cells.map(plain));
    } else if (/^([-*]|\d+\.)\s+/.test(t)) cur.items.push(plain(t.replace(/^([-*]|\d+\.)\s+(\[.\]\s+)?/, '')));
    else if (t) cur.text += ` ${t}`;
  }
  const out = [];
  for (const sec of sections) {
    const b = BUCKETS.find(([, re]) => re.test(sec.heading));
    if (!b || out.some((o) => o.name === b[0])) continue;
    const col = (re, fallback) => { const i = (sec.header || []).findIndex((h) => re.test(h)); return i >= 0 ? i : fallback; };
    const iFrom = col(/sender|from|who/, 0); const iSubj = col(/subject|thread|email/, 1); const iSum = col(/summary|what|note/, 2);
    const items = sec.rows.length
      ? sec.rows.map((r) => ({ from: r[iFrom] || '', subject: r[iSubj] || '', summary: r[iSum] || '' }))
      : sec.items.map((x) => ({ from: '', subject: x, summary: '' }));
    const count = items.length || firstNumber(sec.heading) || firstNumber(sec.text);
    out.push({ name: b[0], count, items: items.slice(0, 5) });
  }
  return out.sort((a, b) => BUCKETS.findIndex(([n]) => n === a.name) - BUCKETS.findIndex(([n]) => n === b.name));
}

function latestTriage(cfg, date) {
  const hit = latestDated(cfg, 'triage', 'Triage', date);
  if (!hit) return null;
  const body = noteBody(cfg, hit.n);
  return { title: hit.n.title, date: hit.d, created: hit.n.created ? String(hit.n.created) : null, path: hit.n.path, summary: body ? leadParagraph(body) : null, buckets: body ? triageBuckets(body) : [] };
}

// ---------- event details ----------

const MEETING_HOSTS = /(^|\.)(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si)$/i;
const httpUrl = (u) => { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const urlsIn = (text) => (String(text || '').match(/https?:\/\/[^\s<>"')\]]+/g) || []).map(httpUrl).filter(Boolean);

// `link`: the event's own URL, else a web link in its location. `join`: a video-call link from the
// location or description (Canvas lectures put Zoom there and their own calendar page in URL).
export function eventLinks(e) {
  const inLoc = urlsIn(e.location);
  const join = [...inLoc, ...urlsIn(e.description)].find((u) => MEETING_HOSTS.test(new URL(u).hostname)) || null;
  const link = httpUrl(e.url || '') || inLoc.find((u) => u !== join) || null;
  return { link: link || undefined, join: join && join !== link ? join : undefined };
}

// Feed descriptions (Canvas especially) carry underline rules and long runs of blank lines.
export function cleanDescription(text, max = 1500) {
  const t = String(text || '').split('\n').filter((l) => !/^\s*[-=_]{3,}\s*$/.test(l)).join('\n')
    .replace(/\[\]\s*\(https?:[^)]*\)/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t || undefined;
}

// Assignments: Canvas exports each one as UID event-assignment-<id>, all-day when it is due at
// 11:59 pm and otherwise a zero-length event at the due time. Any zero-length timed event is a deadline too.
export function deadlineOf(f) {
  const canvas = /^event-assignment-/.test(f.uid || '');
  if (f.allDay) return canvas ? `${f.start}T23:59` : null;
  return canvas || f.start === f.end ? f.start : null;
}

const wikiTargets = (v) => [...String(v ?? '').matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].split('/').pop().replace(/\.md$/, '').trim().toLowerCase());

// Meeting note for an event (by event_uid, else by its "YYYY-MM-DD <summary>" title) and the open
// follow-ups that came out of it (source links the meeting note, or event_uid matches).
function eventNotes(cfg) {
  const byUid = new Map(); const byTitle = new Map();
  for (const m of findNotes(cfg, { type: 'meeting' })) {
    if (m.event_uid) byUid.set(String(m.event_uid), m);
    byTitle.set(m.title.toLowerCase(), m);
  }
  const open = findNotes(cfg, { type: 'followup' }).filter((n) => !['done', 'dropped'].includes(String(n.status || 'open')));
  return (f) => {
    const m = (f.uid && byUid.get(f.uid)) || byTitle.get(`${f.start.slice(0, 10)} ${f.summary || ''}`.toLowerCase());
    const tasks = open
      .filter((n) => (f.uid && String(n.event_uid || '') === f.uid) || (m && wikiTargets(n.source).includes(m.title.toLowerCase())))
      .map((n) => ({ path: n.path, title: n.title, kind: s(n.kind) || 'todo', due: n.due ? String(n.due).slice(0, 10) : null }));
    return {
      meeting: m ? { path: m.path, title: m.title, status: s(m.status) } : undefined,
      tasks: tasks.length ? tasks : undefined,
    };
  };
}

function dayEvents(cfg, raw, tz) {
  const notesFor = eventNotes(cfg);
  return fmtEvents(raw, tz).map((f, i) => {
    const due = deadlineOf(f);
    return {
      ...f,
      ...(due ? { deadline: true, due, busy: false } : {}),
      ...eventLinks(raw[i]),
      description: cleanDescription(raw[i].description),
      ...notesFor(f),
    };
  });
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
    events: dayEvents(cfg, cal.events, tz),
    calendar_warnings: cal.warnings,
    briefing: latestBriefing(cfg, day),
    triage: latestTriage(cfg, day),
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
