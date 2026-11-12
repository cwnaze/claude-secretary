// Read-only views over the vault, shared by the `sec` CLI and the dashboard server.

import fs from 'node:fs';
import path from 'node:path';
import { findNotes } from './vault.mjs';
import { todayIn, addDays, daysBetween, formatLocal } from './tz.mjs';

export function fmtEvent(e, tz) {
  return {
    uid: e.uid, summary: e.summary,
    start: e.allDay ? formatLocal(e.start, 'UTC').slice(0, 10) : formatLocal(e.start, tz),
    end: e.allDay ? formatLocal(e.end, 'UTC').slice(0, 10) : formatLocal(e.end, tz),
    allDay: e.allDay, location: e.location || undefined, source: e.source,
    recurring: e.recurring || undefined, ours: e.ours || undefined,
    busy: !(e.transparent || e.status === 'CANCELLED'),
    status: e.status || undefined,
  };
}

// all-day events are parsed in the user's tz; recompute display from wall date
export function fmtEvents(evts, tz) {
  return evts.map((e) => (e.allDay ? { ...fmtEvent(e, tz), start: formatLocal(e.start, tz).slice(0, 10), end: formatLocal(e.end, tz).slice(0, 10) } : fmtEvent(e, tz)));
}

export function followupsDue(cfg, days, today = todayIn(cfg.settings.timezone)) {
  const horizon = addDays(today, days);
  const items = findNotes(cfg, { type: 'followup' }).filter((n) => !['done', 'dropped'].includes(String(n.status || 'open')));
  const due = []; const undated = [];
  for (const n of items) {
    const d = n.due ? String(n.due).slice(0, 10) : null;
    const item = { path: n.path, title: n.title, kind: n.kind || 'todo', status: n.status || 'open', due: d, counterpart: n.counterpart || undefined, owner: n.owner || undefined };
    if (!d) undated.push(item);
    else if (d <= horizon) due.push({ ...item, overdue_days: Math.max(0, daysBetween(d, today)) });
  }
  due.sort((a, b) => a.due.localeCompare(b.due));
  return { today, horizon, due, waiting_on_others: items.filter((n) => n.kind === 'waiting_on').length, undated_open: undated };
}

function nextBirthday(b, today) {
  const m = String(b).match(/(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +today.slice(0, 4);
  let cand = `${y}-${m[1]}-${m[2]}`;
  if (cand < today) cand = `${y + 1}-${m[1]}-${m[2]}`;
  return cand;
}

export function peopleDue(cfg, days, today = todayIn(cfg.settings.timezone)) {
  const horizon = addDays(today, days);
  const birthdays = []; const reconnect = [];
  for (const p of findNotes(cfg, { type: 'person' })) {
    if (p.birthday) { const nb = nextBirthday(p.birthday, today); if (nb && nb <= horizon) birthdays.push({ path: p.path, name: p.title, date: nb, in_days: daysBetween(today, nb) }); }
    const cadence = Number(p.cadence_days || 0);
    if (cadence > 0) {
      const last = p.last_contact ? String(p.last_contact).slice(0, 10) : null;
      const dueOn = last ? addDays(last, cadence) : today;
      if (dueOn <= horizon) reconnect.push({ path: p.path, name: p.title, last_contact: last, due: dueOn, overdue_days: Math.max(0, daysBetween(dueOn, today)) });
    }
  }
  birthdays.sort((a, b) => a.date.localeCompare(b.date));
  reconnect.sort((a, b) => a.due.localeCompare(b.due));
  return { today, horizon, birthdays, reconnect };
}

export function invoicesDue(cfg, days, today = todayIn(cfg.settings.timezone)) {
  const horizon = addDays(today, days);
  const res = [];
  for (const n of findNotes(cfg, { type: 'invoice' })) {
    if (['paid', 'void'].includes(String(n.status))) continue;
    const d = n.due ? String(n.due).slice(0, 10) : null;
    if (d && d <= horizon) res.push({ path: n.path, title: n.title, direction: n.direction || 'payable', amount: n.amount, currency: n.currency, due: d, overdue: d < today, status: n.status || 'open' });
  }
  return res.sort((a, b) => a.due.localeCompare(b.due));
}

export function expenseSummary(cfg, month) {
  const exps = findNotes(cfg, { type: 'expense' }).filter((e) => String(e.date || '').startsWith(month));
  const budget = findNotes(cfg, { type: 'budget' })[0] || {};
  const cats = {}; const byCurrency = {}; let reimbursable = 0; const bad = [];
  for (const e of exps) {
    const amt = Number(e.amount);
    if (Number.isNaN(amt)) { bad.push(e.path); continue; }
    const c = String(e.category || 'uncategorized').toLowerCase();
    const cur = e.currency || cfg.settings.currency;
    byCurrency[cur] = (byCurrency[cur] || 0) + amt;
    if (cur === (cfg.settings.currency || 'USD')) cats[c] = (cats[c] || 0) + amt;
    if (e.reimbursable === true && e.reimbursed !== true) reimbursable += amt;
  }
  const limits = Object.fromEntries(Object.entries(budget).filter(([k]) => k.startsWith('limit_')).map(([k, v]) => [k.slice(6).toLowerCase(), Number(v)]));
  const names = new Set([...Object.keys(cats), ...Object.keys(limits)]);
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    month, currency: cfg.settings.currency, count: exps.length,
    totals_by_currency: Object.fromEntries(Object.entries(byCurrency).map(([k, v]) => [k, r2(v)])),
    categories: [...names].map((n) => ({ category: n, spent: r2(cats[n] || 0), limit: limits[n] || null, remaining: limits[n] ? r2(limits[n] - (cats[n] || 0)) : null })).sort((a, b) => b.spent - a.spent),
    reimbursable_outstanding: r2(reimbursable),
    unreadable_amounts: bad,
    note: Object.keys(byCurrency).length > 1 ? 'Multiple currencies: category totals only include the default currency.' : undefined,
  };
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

// What happened on `date`, for the evening recap: actions logged, follow-ups
// completed, and notes created (meetings, drafts, expenses…).
export function dayRecap(cfg, date) {
  const skip = new Set(['briefing', 'log', 'settings', 'budget']);
  const all = findNotes(cfg);
  const day = (v) => (v ? String(v).slice(0, 10) : '');
  return {
    date,
    log: logRows(cfg, date),
    completed: all.filter((n) => n.type === 'followup' && ['done', 'dropped'].includes(String(n.status)) && day(n.completed) === date)
      .map((n) => ({ path: n.path, title: n.title, kind: n.kind || 'todo', status: n.status, counterpart: n.counterpart || undefined })),
    created: all.filter((n) => !skip.has(n.type) && day(n.created) === date)
      .map((n) => ({ path: n.path, title: n.title, type: n.type, status: n.status || undefined })),
  };
}
