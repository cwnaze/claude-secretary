// iCalendar (RFC 5545) reading, recurrence expansion and surgical editing.
// Edits only touch the VEVENT blocks being changed; every other byte of the
// file (other events, VTIMEZONEs, X- properties) is preserved.

import crypto from 'node:crypto';
import { zonedToUtc, isValidTz, partsInTz, pad } from './tz.mjs';

export const MARKER = 'X-CLAUDE-SECRETARY';

// ---------- low-level parsing ----------

export function detectEol(text) { return text.includes('\r\n') ? '\r\n' : '\n'; }

function unfold(lines) {
  const out = [];
  for (const l of lines) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out;
}

export function parseProp(line) {
  // NAME;P1=V1;P2="quoted:val":VALUE
  let i = 0; let q = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) break;
  }
  const head = line.slice(0, i); const value = line.slice(i + 1);
  const parts = []; let cur = ''; q = false;
  for (const c of head) {
    if (c === '"') { q = !q; cur += c; continue; }
    if (c === ';' && !q) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  const name = parts.shift().toUpperCase();
  const params = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export function unescapeText(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}
export function escapeText(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Split the file into top-level blocks, keeping raw line ranges so we can
// rewrite individual VEVENTs.
export function parseCalendar(text) {
  const eol = detectEol(text);
  const rawLines = text.split(/\r?\n/);
  const events = [];
  let depth = 0; let start = -1; let inEvent = false;
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    if (/^BEGIN:/i.test(l)) {
      depth++;
      if (/^BEGIN:VEVENT$/i.test(l.trim()) && depth === 2) { inEvent = true; start = i; }
    } else if (/^END:/i.test(l)) {
      if (inEvent && /^END:VEVENT$/i.test(l.trim()) && depth === 2) {
        const raw = rawLines.slice(start, i + 1);
        events.push({ start, end: i, raw, ...parseEventLines(raw) });
        inEvent = false;
      }
      depth--;
    }
  }
  return { eol, rawLines, events };
}

function parseEventLines(raw) {
  const props = unfold(raw.slice(1, -1)).map(parseProp);
  // ignore nested VALARM props
  const top = []; let nest = 0;
  for (const p of props) {
    if (p.name === 'BEGIN') { nest++; continue; }
    if (p.name === 'END') { nest--; continue; }
    if (nest === 0) top.push(p);
  }
  const get = (n) => top.find((p) => p.name === n);
  const all = (n) => top.filter((p) => p.name === n);
  return {
    props: top,
    uid: get('UID')?.value || null,
    summary: get('SUMMARY') ? unescapeText(get('SUMMARY').value) : '',
    location: get('LOCATION') ? unescapeText(get('LOCATION').value) : '',
    description: get('DESCRIPTION') ? unescapeText(get('DESCRIPTION').value) : '',
    url: get('URL')?.value || '',
    status: (get('STATUS')?.value || '').toUpperCase(),
    transp: (get('TRANSP')?.value || '').toUpperCase(),
    dtstart: get('DTSTART') || null,
    dtend: get('DTEND') || null,
    duration: get('DURATION')?.value || null,
    rrule: get('RRULE')?.value || null,
    exdates: all('EXDATE'),
    recurrenceId: get('RECURRENCE-ID') || null,
    ours: !!get(MARKER),
    sequence: Number(get('SEQUENCE')?.value || 0),
  };
}

// ---------- date values ----------

// Returns { ms, allDay, tz, wall: {y,mo,d,h,mi,s} }
export function parseDateProp(prop, defaultTz, warnings = []) {
  if (!prop) return null;
  const v = prop.value.split(',')[0].trim();
  const allDay = prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) { warnings.push(`Unparseable date "${v}"`); return null; }
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  let tz;
  if (m[7]) tz = 'UTC';
  else if (prop.params.TZID) {
    tz = prop.params.TZID;
    if (!isValidTz(tz)) {
      const mapped = WINDOWS_TZ[tz];
      if (mapped) tz = mapped;
      else { warnings.push(`Unknown TZID "${prop.params.TZID}", using ${defaultTz}`); tz = defaultTz; }
    }
  } else tz = defaultTz; // floating or all-day: user's zone
  const ms = zonedToUtc(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s, tz);
  return { ms, allDay, tz, wall };
}

const WINDOWS_TZ = {
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris', 'FLE Standard Time': 'Europe/Helsinki',
  'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo', 'AUS Eastern Standard Time': 'Australia/Sydney',
  'UTC': 'UTC',
};

export function parseDuration(d) {
  const m = String(d).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * ((+(m[2] || 0)) * 604800000 + (+(m[3] || 0)) * 86400000 + (+(m[4] || 0)) * 3600000 + (+(m[5] || 0)) * 60000 + (+(m[6] || 0)) * 1000);
}

// ---------- recurrence ----------

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function parseRrule(s) {
  const r = {};
  for (const part of s.split(';')) { const [k, v] = part.split('='); if (k) r[k.toUpperCase()] = v; }
  return r;
}

function wallAddDays(w, n) {
  const t = new Date(Date.UTC(w.y, w.mo - 1, w.d + n));
  return { ...w, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
function weekday(w) { return new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay(); }
function daysInMonth(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }

// Yields wall-clock starts (in the event's tz) for a recurring series.
function* rruleWalls(start, rule, warnings) {
  const freq = rule.FREQ;
  const interval = Math.max(1, +(rule.INTERVAL || 1));
  const byday = rule.BYDAY ? rule.BYDAY.split(',') : null;
  const bymonthday = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  const unsupported = Object.keys(rule).filter((k) => !['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'WKST', 'BYMONTH'].includes(k));
  if (unsupported.length) warnings.push(`RRULE parts ignored: ${unsupported.join(',')}`);
  const bymonth = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number) : null;
  const okMonth = (w) => !bymonth || bymonth.includes(w.mo);

  if (freq === 'DAILY') {
    for (let i = 0; ; i += interval) {
      const w = wallAddDays(start, i);
      if (okMonth(w) && (!byday || byday.some((d) => DAYS.indexOf(d.slice(-2)) === weekday(w)))) yield w;
    }
  } else if (freq === 'WEEKLY') {
    const days = byday ? byday.map((d) => DAYS.indexOf(d.slice(-2))).sort((a, b) => a - b) : [weekday(start)];
    const weekStart = wallAddDays(start, -weekday(start)); // Sunday-based weeks
    for (let wk = 0; ; wk += interval) {
      for (const dow of days) {
        const w = wallAddDays(weekStart, wk * 7 + dow);
        if (Date.UTC(w.y, w.mo - 1, w.d) < Date.UTC(start.y, start.mo - 1, start.d)) continue;
        if (okMonth(w)) yield w;
      }
    }
  } else if (freq === 'MONTHLY') {
    for (let k = 0; ; k += interval) {
      const y = start.y + Math.floor((start.mo - 1 + k) / 12);
      const mo = ((start.mo - 1 + k) % 12) + 1;
      const dim = daysInMonth(y, mo);
      const cands = [];
      if (byday) {
        for (const spec of byday) {
          const mm = spec.match(/^([+-]?\d+)?([A-Z]{2})$/);
          if (!mm) continue;
          const dow = DAYS.indexOf(mm[2]);
          const all = [];
          for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === dow) all.push(d);
          if (mm[1]) { const n = +mm[1]; const d = n > 0 ? all[n - 1] : all[all.length + n]; if (d) cands.push(d); }
          else cands.push(...all);
        }
      } else if (bymonthday) {
        for (const md of bymonthday) { const d = md > 0 ? md : dim + md + 1; if (d >= 1 && d <= dim) cands.push(d); }
      } else if (start.d <= dim) cands.push(start.d);
      for (const d of [...new Set(cands)].sort((a, b) => a - b)) {
        const w = { ...start, y, mo, d };
        if (Date.UTC(y, mo - 1, d) < Date.UTC(start.y, start.mo - 1, start.d)) continue;
        if (okMonth(w)) yield w;
      }
      if (y > start.y + 200) return;
    }
  } else if (freq === 'YEARLY') {
    for (let k = 0; ; k += interval) {
      const y = start.y + k;
      if (start.d <= daysInMonth(y, start.mo)) yield { ...start, y };
      if (k > 300) return;
    }
  } else {
    warnings.push(`Unsupported FREQ=${freq}; showing first occurrence only`);
    yield start;
  }
}

// Expand events into concrete occurrences overlapping [fromMs, toMs).
export function occurrences(cal, fromMs, toMs, defaultTz, { source = 'main' } = {}) {
  const warnings = [];
  const out = [];
  const overrides = new Map(); // uid -> Set(ms of RECURRENCE-ID)
  for (const ev of cal.events) {
    if (ev.recurrenceId) {
      const rid = parseDateProp(ev.recurrenceId, defaultTz, warnings);
      if (rid) { if (!overrides.has(ev.uid)) overrides.set(ev.uid, new Set()); overrides.get(ev.uid).add(rid.ms); }
    }
  }
  for (const ev of cal.events) {
    const st = parseDateProp(ev.dtstart, defaultTz, warnings);
    if (!st) continue;
    let len;
    const en = parseDateProp(ev.dtend, defaultTz, warnings);
    if (en) len = en.ms - st.ms;
    else if (ev.duration) len = parseDuration(ev.duration) ?? 0;
    else len = st.allDay ? 86400000 : 0;
    const base = {
      uid: ev.uid, summary: ev.summary, location: ev.location, allDay: st.allDay,
      description: ev.description, url: ev.url,
      status: ev.status, transparent: ev.transp === 'TRANSPARENT', ours: ev.ours, source,
      recurring: !!ev.rrule || !!ev.recurrenceId,
    };
    const push = (ms) => {
      const end = ms + len;
      if (end > fromMs && ms < toMs) out.push({ ...base, start: ms, end });
    };
    if (!ev.rrule || ev.recurrenceId) { push(st.ms); continue; }
    const rule = parseRrule(ev.rrule);
    const ex = new Set();
    for (const p of ev.exdates) for (const v of p.value.split(',')) {
      const d = parseDateProp({ ...p, value: v }, defaultTz, warnings); if (d) ex.add(d.ms);
    }
    const ov = overrides.get(ev.uid) || new Set();
    const count = rule.COUNT ? +rule.COUNT : Infinity;
    let until = Infinity;
    if (rule.UNTIL) { const u = parseDateProp({ name: 'UNTIL', params: {}, value: rule.UNTIL }, st.tz, warnings); if (u) until = u.allDay ? u.ms + 86399999 : u.ms; }
    let n = 0; let guard = 0;
    for (const w of rruleWalls(st.wall, rule, warnings)) {
      if (++guard > 20000) { warnings.push(`Stopped expanding ${ev.summary} after 20000 iterations`); break; }
      const ms = zonedToUtc(w.y, w.mo, w.d, w.h, w.mi, w.s, st.tz);
      if (ms > until || n >= count || ms >= toMs) break;
      n++;
      if (ex.has(ms) || ov.has(ms)) continue;
      push(ms);
    }
  }
  out.sort((a, b) => a.start - b.start);
  return { events: out, warnings: [...new Set(warnings)] };
}

// ---------- free-slot search ----------

export function freeSlots({ busy, fromMs, toMs, tz, workDays, workStart, workEnd, durationMin, bufferMin = 0, stepMin = 15, limit = 20 }) {
  const dayIdx = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const allowed = new Set((workDays || []).map((d) => dayIdx[String(d).toLowerCase().slice(0, 3)]));
  const [sh, sm] = workStart.split(':').map(Number);
  const [eh, em] = workEnd.split(':').map(Number);
  const intervals = busy
    .map((b) => [b.start - bufferMin * 60000, b.end + bufferMin * 60000])
    .sort((a, b) => a[0] - b[0]);
  const dur = durationMin * 60000; const step = stepMin * 60000;
  const slots = [];
  const p0 = partsInTz(fromMs, tz);
  for (let i = 0; i < 400 && slots.length < limit; i++) {
    const t = new Date(Date.UTC(p0.year, p0.month - 1, p0.day + i));
    const y = t.getUTCFullYear(); const mo = t.getUTCMonth() + 1; const d = t.getUTCDate();
    const dayStart = zonedToUtc(y, mo, d, sh, sm, 0, tz);
    if (dayStart >= toMs) break;
    if (!allowed.has(t.getUTCDay())) continue;
    const dayEnd = zonedToUtc(y, mo, d, eh, em, 0, tz);
    let s = Math.max(dayStart, Math.ceil(fromMs / step) * step);
    const hardEnd = Math.min(dayEnd, toMs);
    while (s + dur <= hardEnd && slots.length < limit) {
      const conflict = intervals.find((b) => b[0] < s + dur && b[1] > s);
      if (conflict) { s = Math.ceil(conflict[1] / step) * step; continue; }
      // grow the window as far as it stays free, report as one slot
      let e = s + dur;
      while (e + step <= hardEnd && !intervals.some((b) => b[0] < e + step && b[1] > e)) e += step;
      slots.push({ start: s, end: e });
      s = e + step;
    }
  }
  return slots;
}

// ---------- writing ----------

function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return [line];
  const out = []; let cur = ''; let curBytes = 0; let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (curBytes + b > limit) { out.push(cur); cur = ' '; curBytes = 1; limit = 75; }
    cur += ch; curBytes += b;
  }
  out.push(cur);
  return out;
}

export function utcStamp(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function dateStamp(ymdStr) { return ymdStr.replace(/-/g, ''); }

export function emptyCalendar(name = 'Calendar') {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//claude-secretary//EN', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`, 'END:VCALENDAR', ''].join('\r\n');
}

export function buildEvent({ uid, startMs, endMs, allDayStart, allDayEnd, summary, location, description, sequence = 0, now = Date.now() }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStamp(now)}`];
  if (allDayStart) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(allDayStart)}`, `DTEND;VALUE=DATE:${dateStamp(allDayEnd)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(startMs)}`, `DTEND:${utcStamp(endMs)}`);
  }
  lines.push(`SUMMARY:${escapeText(summary || '(no title)')}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push(`SEQUENCE:${sequence}`, `LAST-MODIFIED:${utcStamp(now)}`, `${MARKER}:1`, 'END:VEVENT');
  return lines.flatMap(fold);
}

export function newUid() { return `${crypto.randomUUID()}@claude-secretary`; }

export function addEvent(text, ev) {
  const cal = parseCalendar(text);
  const endIdx = cal.rawLines.map((l) => l.trim().toUpperCase()).lastIndexOf('END:VCALENDAR');
  if (endIdx < 0) throw new Error('Calendar file has no END:VCALENDAR');
  const lines = [...cal.rawLines.slice(0, endIdx), ...buildEvent(ev), ...cal.rawLines.slice(endIdx)];
  return lines.join(cal.eol);
}

// Replace or remove all VEVENT blocks with this UID.
export function rewriteEvent(text, uid, replacer) {
  const cal = parseCalendar(text);
  const targets = cal.events.filter((e) => e.uid === uid);
  if (!targets.length) throw new Error(`No event with UID ${uid}`);
  let lines = cal.rawLines.slice();
  for (const t of [...targets].sort((a, b) => b.start - a.start)) {
    const repl = replacer(t) || [];
    lines.splice(t.start, t.end - t.start + 1, ...repl);
  }
  return lines.join(cal.eol);
}

// Edit selected properties of a single-instance event in place.
export function patchEventLines(ev, patch, now = Date.now()) {
  const drop = new Set(['DTSTAMP', 'SEQUENCE', 'LAST-MODIFIED']);
  if (patch.startMs !== undefined || patch.allDayStart) { drop.add('DTSTART'); drop.add('DTEND'); drop.add('DURATION'); }
  if (patch.summary !== undefined) drop.add('SUMMARY');
  if (patch.location !== undefined) drop.add('LOCATION');
  if (patch.description !== undefined) drop.add('DESCRIPTION');
  const body = unfold(ev.raw.slice(1, -1));
  const kept = []; let nest = 0;
  for (const l of body) {
    const p = parseProp(l);
    if (p.name === 'BEGIN') nest++;
    if (nest === 0 && drop.has(p.name)) continue;
    if (p.name === 'END') nest--;
    kept.push(l);
  }
  const add = [`DTSTAMP:${utcStamp(now)}`, `SEQUENCE:${ev.sequence + 1}`, `LAST-MODIFIED:${utcStamp(now)}`];
  if (patch.allDayStart) add.push(`DTSTART;VALUE=DATE:${dateStamp(patch.allDayStart)}`, `DTEND;VALUE=DATE:${dateStamp(patch.allDayEnd)}`);
  else if (patch.startMs !== undefined) add.push(`DTSTART:${utcStamp(patch.startMs)}`, `DTEND:${utcStamp(patch.endMs)}`);
  if (patch.summary !== undefined) add.push(`SUMMARY:${escapeText(patch.summary)}`);
  if (patch.location !== undefined && patch.location !== '') add.push(`LOCATION:${escapeText(patch.location)}`);
  if (patch.description !== undefined && patch.description !== '') add.push(`DESCRIPTION:${escapeText(patch.description)}`);
  return ['BEGIN:VEVENT', ...[...kept.slice(0, 1), ...add, ...kept.slice(1)].flatMap(fold), 'END:VEVENT'];
}
