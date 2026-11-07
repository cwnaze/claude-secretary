// Time-zone helpers built on Intl (no dependencies).

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  return fmtCache.get(tz);
}

export function isValidTz(tz) {
  if (!tz) return false;
  try { fmt(tz); return true; } catch { return false; }
}

export function localTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Wall-clock parts of a UTC timestamp in a zone.
export function partsInTz(ms, tz) {
  const p = {};
  for (const { type, value } of fmt(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, second: +p.second, weekday: WD[p.weekday],
  };
}

export function offsetMs(ms, tz) {
  const p = partsInTz(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Wall-clock time in tz -> UTC ms. Handles DST gaps/overlaps sensibly.
export function zonedToUtc(y, mo, d, h = 0, mi = 0, s = 0, tz = 'UTC') {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (tz === 'UTC' || tz === 'Etc/UTC') return guess;
  let ts = guess - offsetMs(guess, tz);
  const o2 = offsetMs(ts, tz);
  if (guess - o2 !== ts) ts = guess - o2;
  return ts;
}

export const pad = (n, w = 2) => String(n).padStart(w, '0');

export function ymd(p) { return `${p.year}-${pad(p.month)}-${pad(p.day)}`; }

export function formatLocal(ms, tz) {
  const p = partsInTz(ms, tz);
  return `${ymd(p)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function todayIn(tz, now = Date.now()) { return ymd(partsInTz(now, tz)); }

// Parse "2026-11-10", "2026-11-10T14:30", "2026-11-10T14:30:00Z", "+3d", "today", "tomorrow"
export function parseWhen(input, tz, now = Date.now()) {
  if (input === undefined || input === null || input === '') return null;
  const s = String(input).trim();
  if (s === 'now') return now;
  const rel = s.match(/^([+-]\d+)([dhm])$/);
  if (rel) return now + Number(rel[1]) * { d: 86400000, h: 3600000, m: 60000 }[rel[2]];
  if (s === 'today' || s === 'tomorrow' || s === 'yesterday') {
    const p = partsInTz(now, tz);
    const add = { today: 0, tomorrow: 1, yesterday: -1 }[s];
    const base = Date.UTC(p.year, p.month - 1, p.day + add);
    const b = new Date(base);
    return zonedToUtc(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), 0, 0, 0, tz);
  }
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) {
    const t = Date.parse(s);
    if (Number.isNaN(t)) throw new Error(`Unparseable time: ${s}`);
    return t;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) throw new Error(`Unparseable time: ${s} (use YYYY-MM-DD or YYYY-MM-DDTHH:MM)`);
  return zonedToUtc(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), tz);
}

// Add calendar days to a YYYY-MM-DD string.
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function daysBetween(a, b) {
  const pa = a.split('-').map(Number); const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
