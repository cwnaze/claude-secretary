// Apple Calendar (Calendar.app) reader for macOS, via EventKit through
// `osascript -l JavaScript`. Read-only, zero dependencies. EventKit expands
// recurring events itself and covers every account in Calendar.app (iCloud,
// Google, Exchange, subscriptions).
//
// On other platforms Apple calendars are read as iCloud public calendar links
// in `calendar_feeds` instead (see settings.md).

import { spawnSync } from 'node:child_process';

// EKAuthorizationStatus: 0 not determined, 1 restricted, 2 denied, 3 full access, 4 write-only
const ACCESS = { 0: 'not_determined', 1: 'restricted', 2: 'denied', 3: 'granted', 4: 'write_only' };

// argv: mode ('status' | 'request' | 'calendars' | 'events'), fromSec, toSec, JSON array of calendar titles
const SCRIPT = `
ObjC.import('EventKit');
ObjC.import('Foundation');
function str(x) { try { const v = x.js; return v == null ? '' : String(v).trim(); } catch (e) { return ''; } }
function status() { return Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent)); }
function run(argv) {
  const mode = argv[0];
  const store = $.EKEventStore.alloc.init;
  if (mode === 'request' && (status() === 0 || status() === 4)) {
    const cb = function () {};
    if (store.respondsToSelector('requestFullAccessToEventsWithCompletion:')) store.requestFullAccessToEventsWithCompletion(cb);
    else store.requestAccessToEntityTypeCompletion($.EKEntityTypeEvent, cb);
    const t = Date.now();
    while ((status() === 0 || status() === 4) && Date.now() - t < 60000) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.25));
  }
  const st = status();
  if (mode === 'status' || mode === 'request' || st !== 3) return JSON.stringify({ status: st });
  const all = store.calendarsForEntityType($.EKEntityTypeEvent);
  const cals = [];
  for (let i = 0; i < all.count; i++) {
    const c = all.objectAtIndex(i);
    cals.push({ c: c, title: str(c.title), account: c.source.isNil() ? '' : str(c.source.title) });
  }
  if (mode === 'calendars') return JSON.stringify({ status: st, calendars: cals.map(function (x) { return { title: x.title, account: x.account }; }) });
  const want = JSON.parse(argv[3] || '[]').map(function (s) { return String(s).toLowerCase(); });
  const pick = want.length ? cals.filter(function (x) { return want.indexOf(x.title.toLowerCase()) >= 0; }) : cals;
  if (!pick.length) return JSON.stringify({ status: st, events: [] });
  const arr = $.NSMutableArray.array;
  pick.forEach(function (x) { arr.addObject(x.c); });
  const from = $.NSDate.dateWithTimeIntervalSince1970(Number(argv[1]));
  const to = $.NSDate.dateWithTimeIntervalSince1970(Number(argv[2]));
  const evs = store.eventsMatchingPredicate(store.predicateForEventsWithStartDateEndDateCalendars(from, to, arr));
  const out = [];
  for (let i = 0; i < evs.count; i++) {
    const e = evs.objectAtIndex(i);
    out.push({
      uid: str(e.calendarItemExternalIdentifier), summary: str(e.title), location: str(e.location),
      calendar: e.calendar.isNil() ? '' : str(e.calendar.title),
      start: Number(e.startDate.timeIntervalSince1970), end: Number(e.endDate.timeIntervalSince1970),
      allDay: !!e.allDay, availability: Number(e.availability), status: Number(e.status),
      recurring: !!e.hasRecurrenceRules,
      url: e.URL.isNil() ? '' : str(e.URL.absoluteString), notes: str(e.notes),
    });
  }
  return JSON.stringify({ status: st, events: out });
}`;

export function appleSupported(platform = process.platform) { return platform === 'darwin'; }

function osa(args, timeout = 30000) {
  if (!appleSupported()) throw new Error('Reading Apple Calendar directly needs macOS. On other systems, add your iCloud calendars as public calendar links in calendar_feeds.');
  const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', SCRIPT, ...args.map(String)], { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`osascript failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`osascript failed: ${(r.stderr || '').trim().slice(0, 300)}`);
  return JSON.parse(r.stdout);
}

export function accessName(code) { return ACCESS[code] || 'unknown'; }

function accessError(code) {
  const name = accessName(code);
  if (name === 'granted') return null;
  return new Error(`Apple Calendar access is ${name}. Run \`sec apple access\` to ask for it, or allow it in System Settings → Privacy & Security → Calendars (Full Access) for the app running Claude Code.`);
}

export function appleAccess({ request = false } = {}) {
  return accessName(osa([request ? 'request' : 'status'], request ? 90000 : 30000).status);
}

export function appleCalendars() {
  const r = osa(['calendars']);
  const err = accessError(r.status); if (err) throw err;
  return r.calendars;
}

// Map EventKit rows to the event shape `occurrences()` produces in ics.mjs.
export function mapAppleEvents(rows) {
  return rows.map((e) => ({
    uid: e.uid, summary: e.summary, location: e.location || undefined, allDay: !!e.allDay,
    description: e.notes || undefined, url: e.url || undefined,
    status: e.status === 3 ? 'CANCELLED' : e.status === 2 ? 'TENTATIVE' : undefined,
    transparent: e.availability === 1, // EKEventAvailabilityFree
    ours: false, source: `apple:${e.calendar || 'calendar'}`, recurring: !!e.recurring,
    start: Math.round(e.start * 1000), end: Math.round(e.end * 1000),
  }));
}

export function readAppleEvents(fromMs, toMs, { calendars = [] } = {}) {
  const r = osa(['events', Math.floor(fromMs / 1000), Math.ceil(toMs / 1000), JSON.stringify(calendars)], 60000);
  const err = accessError(r.status); if (err) throw err;
  return mapAppleEvents(r.events);
}
