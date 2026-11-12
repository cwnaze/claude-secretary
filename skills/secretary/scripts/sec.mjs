#!/usr/bin/env node
// claude-secretary helper CLI. Zero dependencies; Node 18+.
// Run `node sec.mjs help` for usage.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, permission, ACTIONS, pointerPath } from './lib/config.mjs';
import { createNote, setFields, appendToNote, findNotes, logAction, ensureLayout, TYPES } from './lib/vault.mjs';
import { parseWhen, todayIn, addDays, daysBetween, formatLocal } from './lib/tz.mjs';
import { parseCalendar, addEvent, rewriteEvent, patchEventLines, newUid, freeSlots } from './lib/ics.mjs';
import { readMain, writeMain, backup, collectEvents, appleEnabled, publish, pull, redact } from './lib/calendar.mjs';
import { runWizard, discoverVaults, isICloudPath } from './lib/wizard.mjs';
import { appleSupported, appleAccess, appleCalendars } from './lib/apple.mjs';
import { createServer, listen, DEFAULT_PORT } from './lib/server.mjs';
import { fmtEvents, followupsDue, peopleDue, invoicesDue, expenseSummary } from './lib/views.mjs';

const HELP = `claude-secretary — helper for the secretary skills

Setup
  init [--vault PATH] [--root Secretary] [--set key=value ...] [--non-interactive]
  config                         Print resolved settings (JSON)
  check                          Health check: vault, settings, calendar, feeds, Apple Calendar, uploader
  vaults                         Obsidian vaults on this machine, including iCloud Drive
  apple status|access|calendars  Apple Calendar on macOS: access state, ask for access, list calendars
  can <action>                   Permission level: off | ask | auto  (exit 0 allowed, 3 off)
                                 actions: ${ACTIONS.join(', ')}
Vault notes
  note new --type T --title X [--field k=v ...] [--tag t ...] [--body TEXT | --body-file F | --stdin] [--attach FILE]
  note set <path> k=v [k=v ...]
  note append <path> (--text TEXT | --stdin)
  find [--type T] [--where k=v ...]        types: ${TYPES.join(', ')}
  log --action A [--target T] [--summary S] [--status S]
Views
  followups due [--days 0]
  people due [--days 14]
  invoices due [--days 7]
  expenses summary [--month YYYY-MM]
  briefing-data [--date YYYY-MM-DD] [--days 1]
Dashboard
  ui [--port ${DEFAULT_PORT}] [--open]      Serve the read-only web dashboard on localhost
Calendar (remote-ics backend; feeds and Apple Calendar are read with both backends)
  ics list [--from today] [--to +7d] [--no-feeds]
  ics free --duration MIN [--from now] [--to +7d] [--buffer MIN] [--after-hours] [--busy-json FILE] [--limit N]
  ics show <uid>
  ics add --summary S (--start T --end T | --start T --duration MIN | --all-day --date D [--end-date D])
          [--location L] [--description D] [--confirmed] [--publish]
  ics update <uid> [--start T --end T] [--summary S] [--location L] [--description D] [--confirmed] [--force] [--publish]
  ics delete <uid> [--confirmed] [--force] [--publish]
  ics publish [--dry-run]
  ics pull                        Download calendar_public_url into calendar_file (backs up first)

Times are in your Settings timezone: 2026-11-10, 2026-11-10T14:30, today, tomorrow, now, +3d, +2h.
Exit codes: 0 ok, 1 error, 3 permission off, 4 needs user confirmation.`;

// ---------- arg parsing ----------
function parseArgs(argv) {
  const pos = []; const flags = {}; const multi = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let [k, v] = a.slice(2).split(/=(.*)/s);
      if (v === undefined) {
        const nx = argv[i + 1];
        if (nx !== undefined && !nx.startsWith('--')) { v = nx; i++; } else v = true;
      }
      if (['set', 'field', 'tag', 'where'].includes(k)) (multi[k] ||= []).push(v);
      else flags[k] = v;
    } else pos.push(a);
  }
  return { pos, flags, multi };
}
const kv = (arr = []) => Object.fromEntries(arr.map((s) => {
  const i = String(s).indexOf('=');
  if (i < 1) throw new Error(`Expected key=value, got "${s}"`);
  return [s.slice(0, i), s.slice(i + 1)];
}));
// key=value pairs with light typing; `key+=value` (repeatable) builds a list.
function typedKv(arr = []) {
  const o = {}; const lists = {};
  for (const s of arr) {
    const m = String(s).match(/^([^=+]+)\+=(.*)$/s);
    if (m) (lists[m[1]] ||= []).push(m[2]);
    else Object.assign(o, kv([s]));
  }
  for (const [k, v] of Object.entries(o)) {
    if (/^-?\d+(\.\d+)?$/.test(v)) o[k] = Number(v);
    else if (v === 'true' || v === 'false') o[k] = v === 'true';
    else if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) o[k] = v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
  }
  return { ...o, ...lists };
}
const out = (x) => process.stdout.write(JSON.stringify(x, null, 2) + '\n');
class Exit extends Error { constructor(code, msg) { super(msg); this.exitCode = code; } }

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

function gate(cfg, action, flags) {
  const lvl = permission(cfg.settings, action);
  if (lvl === 'off') throw new Exit(3, `permission_${action} is "off". Do not perform this action. Propose it to the user (or save a draft) instead.`);
  if (lvl === 'ask' && !flags.confirmed) throw new Exit(4, `permission_${action} is "ask". Show the user exactly what will change, get an explicit yes, then re-run with --confirmed.`);
  return lvl;
}

function requireRemoteIcs(cfg) {
  if (cfg.settings.calendar_backend !== 'remote-ics') {
    throw new Error('calendar_backend is "connector": use the connected calendar tool for this. (The sec ics commands only edit the remote-ics file; `ics list` / `ics free` still read calendar_feeds.)');
  }
}

function eventTimes(flags, tz) {
  if (flags['all-day']) {
    const d = flags.date || flags.start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error('--all-day needs --date YYYY-MM-DD');
    const endD = flags['end-date'] ? addDays(String(flags['end-date']), 1) : addDays(String(d), 1);
    return { allDayStart: String(d), allDayEnd: endD };
  }
  const startMs = parseWhen(flags.start, tz);
  if (!startMs) throw new Error('--start is required');
  let endMs;
  if (flags.end) endMs = parseWhen(flags.end, tz);
  else if (flags.duration) endMs = startMs + Number(flags.duration) * 60000;
  else throw new Error('Give --end or --duration');
  if (!(endMs > startMs)) throw new Error('End must be after start');
  return { startMs, endMs };
}

function afterWrite(cfg, flags, summary) {
  let pub = null;
  if (flags.publish) {
    pub = publish(cfg.settings);
    logAction(cfg, { action: 'calendar_publish', target: cfg.settings.calendar_bucket ? `${cfg.settings.calendar_bucket}/${cfg.settings.calendar_key}` : 'publish command', summary, status: pub.status === 0 ? 'done' : `failed (${pub.status})` });
  }
  return pub;
}

// ---------- commands ----------
async function main() {
  const { pos, flags, multi } = parseArgs(process.argv.slice(2));
  const [cmd, sub, ...rest] = pos;

  if (!cmd || cmd === 'help' || flags.help) { console.log(HELP); return; }

  if (cmd === 'init') {
    const interactive = !flags['non-interactive'] && process.stdin.isTTY;
    const r = await runWizard({ interactive, sets: kv(multi.set), vault: flags.vault || null, root: flags.root || null });
    console.log(`\nSaved settings to ${r.settingsPath}\nPointer file: ${pointerPath()}`);
    if (r.settings.calendar_backend === 'remote-ics') {
      console.log(`Calendar: ${r.settings.calendar_file}${fs.existsSync(r.settings.calendar_file) ? '' : ' (not found yet — run `sec ics pull` or it will be created on first add)'}`);
    }
    console.log('\nNext: in Claude, say "secretary check" to verify your email/calendar connections.');
    return;
  }

  if (cmd === 'vaults') { out(discoverVaults().map((v) => ({ path: v, icloud: isICloudPath(v) }))); return; }

  if (cmd === 'apple') {
    if (!appleSupported()) { out({ supported: false, platform: process.platform, note: 'Apple Calendar can only be read directly on macOS. Add iCloud calendars as public calendar links in calendar_feeds instead.' }); return; }
    if (sub === 'status' || !sub) { out({ supported: true, access: appleAccess() }); return; }
    if (sub === 'access') { out({ supported: true, access: appleAccess({ request: true }) }); return; }
    if (sub === 'calendars') { out({ supported: true, access: 'granted', calendars: appleCalendars() }); return; }
    throw new Error('Usage: apple status|access|calendars');
  }

  if (cmd === 'ui') {
    const port = await listen(createServer(), Number(flags.port || process.env.SECRETARY_PORT || DEFAULT_PORT));
    const url = `http://localhost:${port}/`;
    console.log(`Secretary dashboard: ${url}  (Ctrl-C to stop)`);
    if (flags.open) spawnSync(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [url], { stdio: 'ignore' });
    return new Promise(() => {});
  }

  const cfg = loadConfig();
  const s = cfg.settings; const tz = s.timezone;

  switch (cmd) {
    case 'config': out({ pointer: pointerPath(), vault: cfg.vault, root: cfg.root, settingsPath: cfg.settingsPath, settingsFound: cfg.settingsFound, settings: { ...s, calendar_feeds: (s.calendar_feeds || []).map(redact) } }); return;

    case 'can': {
      const lvl = permission(s, sub);
      console.log(lvl);
      if (lvl === 'off') throw new Exit(3, '');
      return;
    }

    case 'check': {
      const res = { vault: cfg.vault, settings: cfg.settingsFound ? 'ok' : 'MISSING — run init', problems: [], ok: [] };
      try { fs.accessSync(cfg.vault, fs.constants.W_OK); res.ok.push('vault is writable'); } catch { res.problems.push(`vault not writable: ${cfg.vault}`); }
      if (cfg.settingsFound) { try { ensureLayout(cfg); res.ok.push('folder layout present'); } catch (e) { res.problems.push(`layout: ${e.message}`); } }
      res.permissions = Object.fromEntries(ACTIONS.map((a) => [a, permission(s, a)]));
      res.organize_by = s.organize_by;
      res.calendar_backend = s.calendar_backend;
      if (s.calendar_backend === 'remote-ics') {
        try { const { file, text } = readMain(s); res.ok.push(`calendar file readable (${parseCalendar(text).events.length} events): ${file}`); }
        catch (e) { res.problems.push(e.message); }
        try { const p = publish(s, { dryRun: true }); res.publish_command = p.cmd; } catch (e) { res.problems.push(`publish: ${e.message}`); }
        if (/wrangler/.test(s.calendar_publish_command || '')) {
          const w = spawnSync('npx --no-install wrangler whoami', { shell: true, encoding: 'utf8', timeout: 60000 });
          if (w.status === 0) res.ok.push('wrangler is installed and logged in');
          else res.problems.push('wrangler not available or not logged in — run `npx wrangler login`');
        }
      }
      for (const u of s.calendar_feeds || []) {
        try { await collectEvents({ ...s, calendar_feeds: [u], calendar_backend: 'connector' }, Date.now(), Date.now() + 86400000, { apple: false }); res.ok.push(`feed reachable: ${redact(u)}`); }
        catch (e) { res.problems.push(`feed ${redact(u)}: ${e.message}`); }
      }
      if (appleEnabled(s)) {
        try {
          const cals = appleCalendars().map((c) => c.title);
          const missing = (s.calendar_apple_names || []).filter((n) => !cals.some((c) => c.toLowerCase() === String(n).toLowerCase()));
          res.ok.push(`Apple Calendar readable (${cals.length} calendars)`);
          if (missing.length) res.problems.push(`calendar_apple_names not found in Calendar.app: ${missing.join(', ')}`);
        } catch (e) { res.problems.push(`Apple Calendar: ${e.message}`); }
      }
      res.note = 'Email/calendar connectors cannot be seen from this script. Claude must check its own tool list for them.';
      out(res); return;
    }

    case 'note': {
      if (sub === 'new') {
        let body = flags.body && flags.body !== true ? String(flags.body) : '';
        if (flags['body-file']) body = fs.readFileSync(String(flags['body-file']), 'utf8');
        if (flags.stdin) body = readStdin();
        const f = createNote(cfg, { type: String(flags.type), title: String(flags.title), fields: typedKv(multi.field), tags: multi.tag || [], body, attach: flags.attach || null });
        out({ created: path.relative(cfg.vault, f), absolute: f }); return;
      }
      if (sub === 'set') {
        const f = setFields(cfg, rest[0], typedKv(rest.slice(1)));
        out({ updated: path.relative(cfg.vault, f) }); return;
      }
      if (sub === 'append') {
        const text = flags.stdin ? readStdin() : String(flags.text ?? '');
        if (!text) throw new Error('Nothing to append');
        const f = appendToNote(cfg, rest[0], text);
        out({ appended: path.relative(cfg.vault, f) }); return;
      }
      throw new Error('Usage: note new|set|append');
    }

    case 'find': out(findNotes(cfg, { type: flags.type || null, where: kv(multi.where) })); return;

    case 'log': {
      if (!flags.action) throw new Error('--action is required');
      logAction(cfg, { action: String(flags.action), target: flags.target || '', summary: flags.summary || '', status: flags.status || 'done' });
      out({ logged: true }); return;
    }

    case 'followups': out(followupsDue(cfg, Number(flags.days ?? 0))); return;
    case 'people': out(peopleDue(cfg, Number(flags.days ?? 14))); return;
    case 'invoices': out(invoicesDue(cfg, Number(flags.days ?? 7))); return;
    case 'expenses': out(expenseSummary(cfg, flags.month || todayIn(tz).slice(0, 7))); return;

    case 'briefing-data': {
      const date = flags.date || todayIn(tz);
      const days = Number(flags.days ?? 1);
      const from = parseWhen(date, tz); const to = parseWhen(addDays(date, days), tz);
      let cal = { events: [], warnings: [] };
      try { cal = await collectEvents(s, from, to); } catch (e) { cal.warnings.push(e.message); }
      const month = date.slice(0, 7);
      const exp = expenseSummary(cfg, month);
      out({
        date, days, timezone: tz, calendar_backend: s.calendar_backend,
        calendar_note: s.calendar_backend === 'connector' ? 'Fetch events from the connected calendar tool; only extra feeds are included below.' : undefined,
        events: fmtEvents(cal.events, tz), calendar_warnings: cal.warnings,
        followups: followupsDue(cfg, 0, date),
        people: peopleDue(cfg, 7, date),
        invoices: invoicesDue(cfg, 7, date),
        budget_alerts: exp.categories.filter((c) => c.limit && c.spent >= 0.8 * c.limit),
        email_note: s.email_backend === 'connector' ? 'Check the connected email tool for messages needing a reply.' : 'No email backend configured.',
      });
      return;
    }

    case 'ics': return icsCommand(cfg, sub, rest, flags);

    default: throw new Error(`Unknown command "${cmd}". Run \`sec help\`.`);
  }
}

// ---------- calendar ----------
async function icsCommand(cfg, sub, rest, flags) {
  const s = cfg.settings; const tz = s.timezone;
  switch (sub) {
    case 'list': {
      const from = parseWhen(flags.from || 'today', tz); const to = parseWhen(flags.to || '+7d', tz);
      const r = await collectEvents(s, from, to, { feeds: !flags['no-feeds'] });
      out({ timezone: tz, from: formatLocal(from, tz), to: formatLocal(to, tz), events: fmtEvents(r.events, tz), warnings: r.warnings });
      return;
    }
    case 'free': {
      const from = parseWhen(flags.from || 'now', tz); const to = parseWhen(flags.to || '+7d', tz);
      const r = await collectEvents(s, from, to);
      let busy = r.events.filter((e) => !(e.transparent || e.status === 'CANCELLED') && (!e.allDay || s.all_day_is_busy));
      if (flags['busy-json']) {
        const extra = JSON.parse(fs.readFileSync(String(flags['busy-json']), 'utf8'));
        busy = busy.concat(extra.map((b) => ({ start: parseWhen(b.start, tz), end: parseWhen(b.end, tz) })));
      }
      const slots = freeSlots({
        busy, fromMs: from, toMs: to, tz,
        workDays: flags['include-weekends'] ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] : s.work_days,
        workStart: s.work_start, workEnd: flags['after-hours'] ? s.hard_stop : (s.work_end > s.hard_stop ? s.hard_stop : s.work_end),
        durationMin: Number(flags.duration || s.default_meeting_min),
        bufferMin: Number(flags.buffer ?? s.meeting_buffer_min), limit: Number(flags.limit || 20),
      });
      out({ timezone: tz, duration_min: Number(flags.duration || s.default_meeting_min), slots: slots.map((x) => ({ start: formatLocal(x.start, tz), end: formatLocal(x.end, tz) })), warnings: r.warnings });
      return;
    }
    case 'show': {
      requireRemoteIcs(cfg);
      const { text } = readMain(s);
      const ev = parseCalendar(text).events.filter((e) => e.uid === rest[0]);
      if (!ev.length) throw new Error(`No event with UID ${rest[0]}`);
      out(ev.map((e) => ({ uid: e.uid, summary: e.summary, location: e.location, description: e.description, recurring: !!e.rrule, rrule: e.rrule || undefined, ours: e.ours, raw: e.raw.join('\n') })));
      return;
    }
    case 'add': {
      requireRemoteIcs(cfg);
      if (!flags.summary) throw new Error('--summary is required');
      const times = eventTimes(flags, tz);
      gate(cfg, 'manage_calendar', flags);
      const { file, text } = readMain(s, { create: true });
      const uid = newUid();
      const next = addEvent(text, { uid, ...times, summary: String(flags.summary), location: flags.location || '', description: flags.description || '' });
      const bak = backup(file);
      writeMain(file, next);
      const when = times.allDayStart ? `${times.allDayStart} (all day)` : `${formatLocal(times.startMs, tz)} → ${formatLocal(times.endMs, tz)}`;
      logAction(cfg, { action: 'calendar_add', target: String(flags.summary), summary: when });
      const pub = afterWrite(cfg, flags, `add ${flags.summary}`);
      out({ added: uid, when, file, backup: bak, published: pub ? pub.status === 0 : false, publish: pub || undefined });
      return;
    }
    case 'update':
    case 'delete': {
      requireRemoteIcs(cfg);
      const uid = rest[0];
      if (!uid) throw new Error(`Usage: ics ${sub} <uid>`);
      const { file, text } = readMain(s);
      const cal = parseCalendar(text);
      const matches = cal.events.filter((e) => e.uid === uid);
      if (!matches.length) throw new Error(`No event with UID ${uid}`);
      const master = matches.find((e) => !e.recurrenceId) || matches[0];
      if (!master.ours && !flags.force) throw new Exit(4, `"${master.summary}" was not created by the secretary. Confirm with the user that they want to change an event made elsewhere, then add --force.`);
      let patch = null;
      if (sub === 'update') {
        if (matches.length > 1 || master.rrule) {
          if (!flags.force) throw new Exit(4, `"${master.summary}" is a recurring event; editing it changes every occurrence. Confirm with the user, then add --force.`);
        }
        patch = {};
        if (flags.start || flags['all-day']) Object.assign(patch, eventTimes(flags, tz));
        for (const k of ['summary', 'location', 'description']) if (flags[k] !== undefined) patch[k] = flags[k] === true ? '' : String(flags[k]);
        if (!Object.keys(patch).length) throw new Error('Nothing to update');
      }
      gate(cfg, 'manage_calendar', flags);
      const next = sub === 'delete'
        ? rewriteEvent(text, uid, () => [])
        : rewriteEvent(text, uid, (ev) => (ev.start === master.start ? patchEventLines(ev, patch) : ev.raw));
      const bak = backup(file);
      writeMain(file, next);
      logAction(cfg, { action: `calendar_${sub}`, target: master.summary, summary: sub === 'update' ? Object.keys(patch).join(', ') : 'removed' });
      const pub = afterWrite(cfg, flags, `${sub} ${master.summary}`);
      out({ [sub === 'delete' ? 'deleted' : 'updated']: uid, summary: master.summary, file, backup: bak, published: pub ? pub.status === 0 : false, publish: pub || undefined });
      return;
    }
    case 'publish': {
      requireRemoteIcs(cfg);
      if (permission(s, 'manage_calendar') === 'off') throw new Exit(3, 'permission_manage_calendar is "off".');
      const r = publish(s, { dryRun: !!flags['dry-run'] });
      if (!flags['dry-run']) logAction(cfg, { action: 'calendar_publish', target: `${s.calendar_bucket}/${s.calendar_key}`, summary: 'manual publish', status: r.status === 0 ? 'done' : `failed (${r.status})` });
      out(r);
      if (!flags['dry-run'] && r.status !== 0) throw new Exit(1, 'Publish command failed');
      return;
    }
    case 'pull': { requireRemoteIcs(cfg); out(await pull(s)); return; }
    default: throw new Error('Usage: ics list|free|show|add|update|delete|publish|pull');
  }
}

main().catch((e) => {
  if (e.message) process.stderr.write(`${e.exitCode ? '' : 'error: '}${e.message}\n`);
  process.exit(e.exitCode || 1);
});
