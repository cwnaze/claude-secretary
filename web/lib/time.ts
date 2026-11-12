// Date helpers over the server's local wall-clock strings ("YYYY-MM-DDTHH:MM").
// Everything is already in the user's Settings timezone, so no Date zone math here.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const utc = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);

export function minutesOf(local: string): number {
  return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}

export function addDays(d: string, n: number): string {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function dayTitle(d: string): string {
  const x = utc(d);
  return `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
}

export function shortDate(d: string): string {
  const x = utc(d);
  return `${MONTHS[x.getUTCMonth()].slice(0, 3)} ${x.getUTCDate()}`;
}

export function monthName(ym: string): string {
  return MONTHS[Number(ym.slice(5, 7)) - 1];
}

export function isoWeek(d: string): number {
  const x = utc(d);
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

export function clock(min: number): string {
  const h = Math.floor(min / 60) % 24; const m = min % 60;
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}` : `${h12}`;
}

export function clockAmPm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${clock(min)} ${h < 12 ? 'am' : 'pm'}`;
}

export function hourLabel(h: number): string {
  if (h === 12) return 'Noon';
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
}

export function range(startMin: number, endMin: number): string {
  const samePeriod = (startMin < 720) === (endMin < 720);
  return `${samePeriod ? clock(startMin) : clockAmPm(startMin)}–${clockAmPm(endMin)}`;
}

export function relativeDay(d: string, today: string): string {
  if (d === today) return 'today';
  if (d === addDays(today, 1)) return 'tomorrow';
  if (d === addDays(today, -1)) return 'yesterday';
  return shortDate(d);
}

export function fromCreated(created: string | undefined, today: string): string | null {
  if (!created) return null;
  const d = created.slice(0, 10);
  const t = created.length > 10 ? clockAmPm(minutesOf(created)) : null;
  if (d === today) return t ? `today ${t}` : 'today';
  return relativeDay(d, today);
}

export function money(n: number, currency = 'USD'): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n); }
  catch { return `${n.toFixed(2)} ${currency}`; }
}

export function unlink(s: string | undefined): string {
  return String(s ?? '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a: string, b: string) => b || a);
}
