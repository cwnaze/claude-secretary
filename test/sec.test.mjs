import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCalendar, occurrences, addEvent, rewriteEvent, freeSlots } from '../skills/secretary/scripts/lib/ics.mjs';
import { zonedToUtc, formatLocal } from '../skills/secretary/scripts/lib/tz.mjs';
import { parseFrontmatter, setNoteFields, readNoteText } from '../skills/secretary/scripts/lib/yaml.mjs';
import { classify, decide } from '../skills/secretary/scripts/lib/guard.mjs';
import { createServer, listen, isLocalHost, resolveStatic } from '../skills/secretary/scripts/lib/server.mjs';
import { leadParagraph } from '../skills/secretary/scripts/lib/dashboard.mjs';
import { loadConfig } from '../skills/secretary/scripts/lib/config.mjs';
import { mapAppleEvents, appleSupported } from '../skills/secretary/scripts/lib/apple.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEC = path.join(here, '..', 'skills', 'secretary', 'scripts', 'sec.mjs');
const NY = 'America/New_York';

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-test-'));
  const run = (...args) => {
    const r = spawnSync(process.execPath, [SEC, ...args], { env: { ...process.env, HOME: home, XDG_CACHE_HOME: path.join(home, '.cache'), SECRETARY_CONFIG: '' }, encoding: 'utf8' });
    let json = null; try { json = JSON.parse(r.stdout); } catch { /* not json */ }
    return { code: r.status, out: r.stdout, err: r.stderr, json };
  };
  return { home, run };
}

const FOREIGN = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Other//EN',
  'BEGIN:VTIMEZONE', 'TZID:America/New_York', 'END:VTIMEZONE',
  'BEGIN:VEVENT', 'UID:class-1', 'DTSTART;TZID=America/New_York:20261102T100000', 'DTEND;TZID=America/New_York:20261102T105000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261211T235959Z', 'EXDATE;TZID=America/New_York:20261111T100000',
  'SUMMARY:EEL 3701 Lecture', 'X-APPLE-CUSTOM:keep-me', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:class-1', 'RECURRENCE-ID;TZID=America/New_York:20261113T100000',
  'DTSTART;TZID=America/New_York:20261113T130000', 'DTEND;TZID=America/New_York:20261113T135000', 'SUMMARY:EEL 3701 (moved)', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:allday-1', 'DTSTART;VALUE=DATE:20261126', 'DTEND;VALUE=DATE:20261128', 'SUMMARY:Thanksgiving break', 'TRANSP:TRANSPARENT', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:long-1', 'DTSTART:20261110T200000Z', 'DURATION:PT1H30M', 'SUMMARY:A very long summary line that definitely needs folding because it is longer than seventy five octets', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

test('DST-correct wall-clock conversion', () => {
  // Nov 1 2026 is the US fall-back date
  assert.equal(new Date(zonedToUtc(2026, 10, 30, 10, 0, 0, NY)).toISOString(), '2026-10-30T14:00:00.000Z');
  assert.equal(new Date(zonedToUtc(2026, 11, 2, 10, 0, 0, NY)).toISOString(), '2026-11-02T15:00:00.000Z');
});

test('weekly RRULE with BYDAY, EXDATE and RECURRENCE-ID override', () => {
  const cal = parseCalendar(FOREIGN);
  const { events } = occurrences(cal, zonedToUtc(2026, 11, 9, 0, 0, 0, NY), zonedToUtc(2026, 11, 16, 0, 0, 0, NY), NY);
  const lect = events.filter((e) => e.uid === 'class-1').map((e) => `${formatLocal(e.start, NY)} ${e.summary}`);
  assert.deepEqual(lect, [
    '2026-11-09T10:00 EEL 3701 Lecture',
    // 11-11 excluded by EXDATE
    '2026-11-13T13:00 EEL 3701 (moved)',
  ]);
});

test('UNTIL stops the series; DURATION is honoured', () => {
  const cal = parseCalendar(FOREIGN);
  const { events } = occurrences(cal, zonedToUtc(2026, 12, 10, 0, 0, 0, NY), zonedToUtc(2026, 12, 20, 0, 0, 0, NY), NY);
  assert.deepEqual(events.filter((e) => e.uid === 'class-1').map((e) => formatLocal(e.start, NY)), ['2026-12-11T10:00']);
  const all = occurrences(cal, Date.UTC(2026, 10, 10), Date.UTC(2026, 10, 11), NY).events;
  const long = all.find((e) => e.uid === 'long-1');
  assert.equal(long.end - long.start, 90 * 60000);
  assert.match(long.summary, /seventy five octets$/);
});

test('editing preserves foreign events byte-for-byte', () => {
  const added = addEvent(FOREIGN, { uid: 'new-1', startMs: Date.UTC(2026, 10, 20, 15), endMs: Date.UTC(2026, 10, 20, 16), summary: 'New' });
  const before = parseCalendar(FOREIGN).events.map((e) => e.raw.join('\n'));
  const after = parseCalendar(added).events;
  assert.equal(after.length, before.length + 1);
  for (const raw of before) assert.ok(after.some((e) => e.raw.join('\n') === raw), 'foreign event changed');
  assert.ok(added.includes('X-APPLE-CUSTOM:keep-me'));
  assert.ok(added.includes('\r\n') && !/[^\r]\n/.test(added), 'line endings preserved');
  const removed = rewriteEvent(added, 'new-1', () => []);
  assert.equal(removed, FOREIGN);
});

test('free slots respect work hours, buffer and busy events', () => {
  const day = (h, m = 0) => zonedToUtc(2026, 11, 10, h, m, 0, NY);
  const slots = freeSlots({
    busy: [{ start: day(11), end: day(12) }], fromMs: day(0), toMs: day(23, 59), tz: NY,
    workDays: ['tue'], workStart: '09:00', workEnd: '17:00', durationMin: 60, bufferMin: 15,
  }).map((s) => `${formatLocal(s.start, NY)}-${formatLocal(s.end, NY).slice(11)}`);
  assert.deepEqual(slots, ['2026-11-10T09:00-10:45', '2026-11-10T12:15-17:00']);
});

test('frontmatter round-trip keeps unknown keys and formatting', () => {
  const text = '---\ntitle: Hello\ncustom:\n  nested: thing\ntags:\n  - a\n  - b\nstatus: open\n---\nBody\n';
  const next = setNoteFields(text, { status: 'done', due: '2026-11-12' });
  assert.match(next, /custom:\n {2}nested: thing/);
  const { data, body } = readNoteText(next);
  assert.equal(data.status, 'done');
  assert.equal(data.due, '2026-11-12');
  assert.deepEqual(data.tags, ['a', 'b']);
  assert.equal(body, 'Body\n');
  assert.deepEqual(parseFrontmatter('x: "a: b"\ny: [1, two]\nz: true'), { x: 'a: b', y: [1, 'two'], z: true });
});

test('CLI: permissions gate calendar writes', () => {
  const { run } = sandbox();
  assert.equal(run('init', '--non-interactive', '--vault', '~/V', '--set', 'timezone=America/New_York').code, 0);
  assert.equal(run('ics', 'add', '--summary', 'X', '--start', '2026-11-10T10:00', '--duration', '30').code, 4);
  assert.equal(run('ics', 'add', '--summary', 'X', '--start', '2026-11-10T10:00', '--duration', '30', '--confirmed').code, 0);
  assert.equal(run('init', '--non-interactive', '--set', 'permission_manage_calendar=off').code, 0);
  assert.equal(run('ics', 'add', '--summary', 'Y', '--start', '2026-11-10T11:00', '--duration', '30', '--confirmed').code, 3);
  assert.equal(run('can', 'send_email').code, 3);
  assert.equal(run('init', '--non-interactive', '--set', 'permission_send_email=banana').code, 1);
});

test('CLI: foreign and recurring events need --force', () => {
  const { home, run } = sandbox();
  const ics = path.join(home, 'cal.ics');
  fs.writeFileSync(ics, FOREIGN);
  run('init', '--non-interactive', '--vault', path.join(home, 'V'), '--set', `calendar_file=${ics}`, '--set', 'timezone=America/New_York', '--set', 'permission_manage_calendar=auto');
  assert.equal(run('ics', 'delete', 'long-1').code, 4);
  assert.equal(run('ics', 'update', 'class-1', '--summary', 'Renamed', '--force').code, 0, 'recurring + foreign with force');
  const r = run('ics', 'delete', 'long-1', '--force');
  assert.equal(r.code, 0, r.err);
  const now = fs.readFileSync(ics, 'utf8');
  assert.ok(!now.includes('UID:long-1'));
  assert.ok(now.includes('SUMMARY:Renamed') && now.includes('SEQUENCE:1'));
  assert.ok(now.includes('SUMMARY:EEL 3701 (moved)'), 'override untouched');
  assert.ok(now.includes('X-APPLE-CUSTOM:keep-me'), 'unknown props kept on patched event');
});

for (const mode of ['folders', 'tags']) {
  test(`CLI: notes + views work with organize_by=${mode}`, () => {
    const { home, run } = sandbox();
    run('init', '--non-interactive', '--vault', path.join(home, 'V'), '--set', `organize_by=${mode}`, '--set', 'timezone=America/New_York');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: NY }).format(new Date());
    const f1 = run('note', 'new', '--type', 'followup', '--title', 'Send slides to Jane', '--field', 'kind=promise', '--field', `due=${today}`, '--field', 'counterpart=[[Jane Doe]]');
    assert.equal(f1.code, 0, f1.err);
    run('note', 'new', '--type', 'followup', '--title', 'Send slides to Jane'); // duplicate title
    run('note', 'new', '--type', 'person', '--title', 'Jane Doe', '--field', `birthday=${today.slice(5)}`, '--field', 'cadence_days=30', '--field', 'last_contact=2026-01-01');
    run('note', 'new', '--type', 'expense', '--title', 'Lunch with Jane', '--field', 'amount=42.5', '--field', 'category=Food', '--field', `date=${today}`, '--field', 'reimbursable=true');
    const due = run('followups', 'due').json;
    assert.equal(due.due.length, 1);
    assert.equal(due.due[0].kind, 'promise');
    assert.equal(run('find', '--type', 'followup').json.length, 2);
    const people = run('people', 'due').json;
    assert.equal(people.birthdays.length, 1);
    assert.equal(people.reconnect.length, 1);
    const exp = run('expenses', 'summary').json;
    assert.equal(exp.categories[0].spent, 42.5);
    assert.equal(exp.reimbursable_outstanding, 42.5);
    run('note', 'set', due.due[0].path, 'status=done');
    assert.equal(run('followups', 'due').json.due.length, 0);
    const root = path.join(home, 'V', 'Secretary');
    const files = fs.readdirSync(root, { recursive: true }).map(String);
    if (mode === 'tags') {
      assert.ok(files.includes('Send slides to Jane.md') && files.includes('Send slides to Jane 2.md'));
      const fm = readNoteText(fs.readFileSync(path.join(root, 'Jane Doe.md'), 'utf8')).data;
      assert.deepEqual(fm.tags, ['secretary/person']);
    } else {
      assert.ok(files.includes(path.join('Follow-ups', 'Send slides to Jane.md')));
      assert.ok(files.includes(path.join('Expenses', today.slice(0, 7), 'Lunch with Jane.md')));
    }
    const brief = run('briefing-data').json;
    assert.equal(brief.people.birthdays.length, 1);
  });
}

test('CLI: refuses to edit files outside the vault', () => {
  const { home, run } = sandbox();
  run('init', '--non-interactive', '--vault', path.join(home, 'V'));
  fs.writeFileSync(path.join(home, 'outside.md'), '---\na: 1\n---\n');
  const r = run('note', 'set', path.join(home, 'outside.md'), 'a=2');
  assert.equal(r.code, 1);
  assert.match(r.err, /outside the vault/);
});

test('CLI: publish template refuses shell metacharacters', () => {
  const { home, run } = sandbox();
  const ics = path.join(home, 'cal.ics'); fs.writeFileSync(ics, FOREIGN);
  run('init', '--non-interactive', '--vault', path.join(home, 'V'), '--set', `calendar_file=${ics}`, '--set', 'calendar_bucket=b$(id)', '--set', 'calendar_key=k');
  const r = run('ics', 'publish', '--dry-run');
  assert.equal(r.code, 1);
  assert.match(r.err, /metacharacters/);
});

test('CLI: key+=value builds lists; missing property matches false', () => {
  const { home, run } = sandbox();
  run('init', '--non-interactive', '--vault', path.join(home, 'V'));
  const r = run('note', 'new', '--type', 'meeting', '--title', '2026-11-10 Sync', '--field', 'attendees+=[[Jane Doe]]', '--field', 'attendees+=[[Sam Lee]]');
  assert.equal(r.code, 0, r.err);
  const data = readNoteText(fs.readFileSync(r.json.absolute, 'utf8')).data;
  assert.deepEqual(data.attendees, ['[[Jane Doe]]', '[[Sam Lee]]']);
  run('note', 'new', '--type', 'expense', '--title', 'A', '--field', 'amount=5', '--field', 'reimbursable=true');
  assert.equal(run('find', '--type', 'expense', '--where', 'reimbursable=true', '--where', 'reimbursed=false').json.length, 1);
});

test('skills follow the Agent Skills spec', () => {
  const root = path.join(here, '..', 'skills');
  for (const dir of fs.readdirSync(root)) {
    const text = fs.readFileSync(path.join(root, dir, 'SKILL.md'), 'utf8');
    const { data, body } = readNoteText(text);
    assert.equal(data.name, dir, `${dir}: name must match folder`);
    assert.match(data.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(data.name.length <= 64);
    assert.ok(data.description && data.description.length <= 1024, `${dir}: description length ${data.description?.length}`);
    assert.ok(body.split('\n').length < 500, `${dir}: body too long`);
    for (const m of body.matchAll(/\]\((references\/[^)]+)\)/g)) assert.ok(fs.existsSync(path.join(root, dir, m[1])), `${dir}: missing ${m[1]}`);
  }
});

test('guard: classifies MCP tool calls into gated actions', () => {
  const cases = [
    ['mcp__claude_ai_Gmail__send_email', {}, 'send_email'],
    ['mcp__claude_ai_Gmail__create_draft', {}, null],
    ['mcp__claude_ai_Gmail__search_threads', {}, null],
    ['mcp__gmail__reply_to_thread', {}, 'send_email'],
    ['mcp__outlook__send_mail', {}, 'send_email'],
    ['mcp__claude_ai_Google_Calendar__create_event', { summary: 'x' }, 'manage_calendar'],
    ['mcp__claude_ai_Google_Calendar__create_event', { attendees: ['a@b.com'] }, 'send_invites'],
    ['mcp__claude_ai_Google_Calendar__list_events', {}, null],
    ['mcp__google-calendar__delete_event', {}, 'manage_calendar'],
    ['mcp__google-calendar__respond_to_event', {}, 'send_invites'],
    ['mcp__outlook__create_calendar_event', { attendees: [] }, 'manage_calendar'],
    ['mcp__claude_ai_Slack__slack_send_message', {}, 'contact_people'],
    ['mcp__slack__chat_post_message', {}, 'contact_people'],
    ['mcp__slack__search_messages', {}, null],
    ['mcp__twilio__send_sms', {}, 'contact_people'],
    ['mcp__github__create_issue', {}, null],
    ['mcp__memory__create_entities', {}, null],
    ['Bash', {}, null],
  ];
  for (const [name, input, want] of cases) assert.equal(classify(name, input), want, name);
  assert.equal(decide('send_email', 'auto'), null);
  assert.equal(decide('send_email', 'ask').permissionDecision, 'ask');
  assert.equal(decide('send_email', 'off').permissionDecision, 'deny');
  assert.equal(decide('send_email', null).permissionDecision, 'deny');
});

test('guard hook: end to end over stdin', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-guard-'));
  const env = { ...process.env, HOME: home, SECRETARY_CONFIG: '' };
  const GUARD = path.join(here, '..', 'hooks', 'guard.mjs');
  const hook = (payload) => {
    const r = spawnSync(process.execPath, [GUARD], { env, input: JSON.stringify(payload), encoding: 'utf8' });
    assert.equal(r.status, 0);
    return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
  };
  const send = { hook_event_name: 'PreToolUse', tool_name: 'mcp__claude_ai_Gmail__send_email', tool_input: { to: 'x@y.com' } };
  assert.equal(hook(send), null, 'no config -> stays out of the way');
  spawnSync(process.execPath, [SEC, 'init', '--non-interactive', '--vault', path.join(home, 'V')], { env });
  assert.equal(hook(send).permissionDecision, 'deny');
  assert.match(fs.readFileSync(path.join(home, 'V', 'Secretary', 'Log.md'), 'utf8'), /blocked by guard/);
  assert.equal(hook({ ...send, tool_name: 'mcp__claude_ai_Gmail__create_draft' }), null);
  assert.equal(hook({ ...send, tool_name: 'mcp__claude_ai_Google_Calendar__create_event', tool_input: {} }).permissionDecision, 'ask');
  spawnSync(process.execPath, [SEC, 'init', '--non-interactive', '--set', 'permission_send_email=auto'], { env });
  assert.equal(hook(send), null, 'auto -> defer to normal permissions');
  fs.writeFileSync(path.join(home, '.claude-secretary.json'), '{broken');
  assert.equal(hook(send).permissionDecision, 'deny', 'unreadable config fails closed');
  assert.equal(hook({ tool_name: 'mcp__github__create_issue', tool_input: {} }), null);
});

test('dashboard: briefing lead paragraph skips headings and lists', () => {
  assert.equal(leadParagraph('# Briefing\n\n## Today\n- a\n- b\n\nTwo things need you:\nreply to [[Marcus Lee|Marcus]] **now**.\n\nMore.'), 'Two things need you: reply to Marcus now.');
  assert.equal(leadParagraph('## Only headings\n- list'), null);
});

test('dashboard server: read-only API, localhost only, no path escapes', async () => {
  const { home, run } = sandbox();
  assert.equal(run('init', '--non-interactive', '--vault', path.join(home, 'V'), '--set', `timezone=${NY}`, '--set', `calendar_file=${path.join(home, 'cal.ics')}`).code, 0);
  run('note', 'new', '--type', 'draft', '--title', 'Re lease', '--field', 'status=draft', '--field', 'subject=Re: lease');
  run('note', 'new', '--type', 'draft', '--title', 'Old one', '--field', 'status=sent');
  run('note', 'new', '--type', 'briefing', '--title', 'Briefing 2026-11-10', '--body', '## Today\n\nYour afternoon is open.');
  run('log', '--action', 'send_email', '--target', 'mcp__x__send_email', '--summary', 'blocked by guard', '--status', 'blocked');
  const ui = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-ui-'));
  fs.writeFileSync(path.join(ui, 'index.html'), 'home'); fs.writeFileSync(path.join(ui, 'inbox.html'), 'inbox'); fs.writeFileSync(path.join(ui, '404.html'), 'missing');
  fs.writeFileSync(path.join(home, 'secret.txt'), 'nope');
  const getConfig = () => { const prev = process.env.HOME; process.env.HOME = home; try { return loadConfig(); } finally { process.env.HOME = prev; } };
  const server = createServer({ uiDir: ui, getConfig });
  const port = await listen(server, 0);
  const get = (p, headers = {}) => fetch(`http://127.0.0.1:${port}${p}`, { headers });
  try {
    assert.equal(await (await get('/')).text(), 'home');
    assert.equal(await (await get('/inbox')).text(), 'inbox');
    const miss = await get('/nope'); assert.equal(miss.status, 404); assert.equal(await miss.text(), 'missing');
    assert.equal(resolveStatic(ui, '/%2e%2e/secret.txt'), null);
    assert.equal(resolveStatic(ui, '/../secret.txt'), null);
    const rebind = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/api/home', headers: { host: 'evil.example' } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', reject));
    assert.equal(rebind, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/home`, { method: 'POST' })).status, 405);
    assert.equal((await get('/api/home?date=x')).status, 400);
    const res = await get('/api/home?date=2026-11-10');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    const d = await res.json();
    assert.equal(d.date, '2026-11-10');
    assert.deepEqual(d.drafts.map((x) => x.subject), ['Re: lease']);
    assert.equal(d.briefing.summary, 'Your afternoon is open.');
    assert.equal(d.permissions.send_email, 'off');
    assert.ok(Array.isArray(d.events));
    assert.ok(isLocalHost('localhost:7410') && isLocalHost('127.0.0.1') && !isLocalHost('localhost.evil.com'));
  } finally { server.close(); }
});

// A temp HOME with a fake `claude` on PATH that logs its arguments, for `claude-secretary uninstall`.
function uninstallSandbox(...initArgs) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-uninstall-'));
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  const calls = path.join(home, 'calls.log');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$*" >> "${calls}"\necho 9.9.9\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: home, XDG_CACHE_HOME: path.join(home, '.cache'), SECRETARY_CONFIG: '', PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const CLI = path.join(here, '..', 'cli', 'claude-secretary.mjs');
  const cli = (...args) => spawnSync(process.execPath, [CLI, 'uninstall', ...args], { env, encoding: 'utf8', input: '' });
  const sec = (...args) => spawnSync(process.execPath, [SEC, ...args], { env, encoding: 'utf8' });
  sec('init', '--non-interactive', '--vault', path.join(home, 'V'), ...initArgs);
  return { home, calls, cli, sec };
}

test('CLI uninstall: removes plugin and marketplace, purges only with consent, never the vault', () => {
  const { home, calls, cli } = uninstallSandbox();
  const pointer = path.join(home, '.claude-secretary.json');
  const cache = path.join(home, '.cache', 'claude-secretary');
  fs.mkdirSync(path.join(cache, 'backups'), { recursive: true });

  let r = cli();
  assert.equal(r.status, 0, r.stderr);
  const log = fs.readFileSync(calls, 'utf8');
  assert.match(log, /plugin uninstall secretary@cwnaze --scope user/);
  assert.match(log, /plugin marketplace remove cwnaze --scope user/);
  assert.ok(fs.existsSync(pointer) && fs.existsSync(cache), 'no purge without --purge');

  fs.rmSync(calls);
  r = cli('--keep-marketplace', '--scope', 'project');
  assert.equal(r.status, 0);
  assert.doesNotMatch(fs.readFileSync(calls, 'utf8'), /marketplace remove/);
  assert.match(fs.readFileSync(calls, 'utf8'), /--scope project/);

  fs.rmSync(calls);
  r = cli('--purge');
  assert.equal(r.status, 1, 'non-interactive --purge needs --yes');
  assert.match(r.stderr, /--yes/);
  assert.ok(!fs.existsSync(calls), 'refused before doing anything');
  assert.ok(fs.existsSync(pointer));

  r = cli('--purge', '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(pointer) && !fs.existsSync(cache));
  assert.ok(fs.existsSync(path.join(home, 'V', 'Secretary', 'Settings.md')), 'vault untouched');
});

test('CLI uninstall: --remove-vault deletes only the secretary folder, --remove-ics the calendar file', () => {
  for (const mode of ['folders', 'tags']) {
    const { home, cli, sec } = uninstallSandbox('--set', `organize_by=${mode}`);
    const vault = path.join(home, 'V'); const ics = path.join(home, 'cal.ics');
    sec('init', '--non-interactive', '--set', `calendar_file=${ics}`);
    fs.writeFileSync(ics, 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    sec('note', 'new', '--type', 'expense', '--title', 'Coffee', '--field', 'date=2026-11-10', '--field', 'amount=4');
    sec('note', 'new', '--type', 'person', '--title', 'Ana');
    fs.writeFileSync(path.join(vault, 'My note.md'), 'mine');

    let r = cli('--remove-vault');
    assert.equal(r.status, 1, 'non-interactive delete needs --yes');
    assert.ok(fs.existsSync(path.join(vault, 'Secretary', 'Settings.md')));

    r = cli('--remove-ics', '--yes');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(ics));
    assert.ok(fs.existsSync(path.join(vault, 'Secretary', 'Settings.md')), `${mode}: --remove-ics leaves the vault`);

    r = cli('--remove-vault', '--purge', '--yes');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(path.join(vault, 'Secretary')), `${mode}: secretary folder removed recursively`);
    assert.equal(fs.readFileSync(path.join(vault, 'My note.md'), 'utf8'), 'mine', 'notes outside the secretary folder survive');
    assert.ok(!fs.existsSync(path.join(home, '.claude-secretary.json')));
  }

  const { home, cli } = uninstallSandbox();
  fs.writeFileSync(path.join(home, '.claude-secretary.json'), JSON.stringify({ vault: path.join(home, 'V'), root: '.' }));
  const r = cli('--remove-vault', '--yes');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing/);
  assert.ok(fs.existsSync(path.join(home, 'V')), 'never deletes the vault itself');
  assert.equal(cli('--remove-vault', '--purge', '--yes').status, 1);
  assert.equal(uninstallSandbox().cli('--remove-ics', '--yes').status, 0, 'no calendar_file: nothing to delete');
});

test('plugin manifests are consistent', () => {
  const root = path.join(here, '..');
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(plugin.version, pkg.version, 'plugin.json and package.json versions must match');
  assert.ok(!/^(claude|anthropic)/.test(plugin.name), 'reserved prefix');
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(hooks.hooks.PreToolUse[0].matcher, 'mcp__.*');
  const st = fs.statSync(path.join(root, 'bin', 'sec'));
  assert.ok(st.mode & 0o111, 'bin/sec must be executable');
  const r = spawnSync(path.join(root, 'bin', 'sec'), ['help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('CLI: vaults finds Obsidian vaults in iCloud Drive (macOS and Windows layouts)', () => {
  const { home, run } = sandbox();
  const mk = (...p) => fs.mkdirSync(path.join(home, ...p), { recursive: true });
  mk('Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents', 'Notes', '.obsidian');
  mk('Library', 'Mobile Documents', 'com~apple~CloudDocs', 'School', 'Vault', '.obsidian');
  mk('Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Photos', 'NotAVault');
  mk('iCloudDrive', 'iCloud~md~obsidian', 'WinVault', '.obsidian');
  mk('iCloudDrive', 'Work', '.obsidian');
  const r = run('vaults');
  assert.equal(r.code, 0, r.err);
  const paths = r.json.map((v) => path.relative(home, v.path)).sort();
  assert.deepEqual(paths, [
    path.join('Library', 'Mobile Documents', 'com~apple~CloudDocs', 'School', 'Vault'),
    path.join('Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents', 'Notes'),
    path.join('iCloudDrive', 'Work'),
    path.join('iCloudDrive', 'iCloud~md~obsidian', 'WinVault'),
  ].sort());
  assert.ok(r.json.every((v) => v.icloud));
  const empty = sandbox().run('vaults');
  assert.deepEqual(empty.json, [], 'no iCloud folders → nothing found, no error');
});

test('apple: EventKit rows map to the occurrences() event shape', () => {
  assert.equal(appleSupported('linux'), false);
  assert.equal(appleSupported('win32'), false);
  assert.equal(appleSupported('darwin'), true);
  const [busy, free, cancelled] = mapAppleEvents([
    { uid: 'a', summary: 'Lecture', location: 'CAR 0100', calendar: 'Class Times', start: 1794509700, end: 1794512700, allDay: false, availability: 0, status: 1, recurring: true },
    { uid: 'b', summary: 'Holiday', location: '', calendar: 'US Holidays', start: 1794460000, end: 1794546400, allDay: true, availability: 1, status: 0, recurring: false },
    { uid: 'c', summary: 'Gone', location: '', calendar: '', start: 1794509700, end: 1794512700, allDay: false, availability: 0, status: 3, recurring: false },
  ]);
  assert.deepEqual(busy, { uid: 'a', summary: 'Lecture', location: 'CAR 0100', allDay: false, status: undefined, transparent: false, ours: false, source: 'apple:Class Times', recurring: true, start: 1794509700000, end: 1794512700000 });
  assert.equal(free.transparent, true);
  assert.equal(free.location, undefined);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.source, 'apple:calendar');
});

test('CLI: calendar_apple setting is validated, names are a list', () => {
  const { home, run } = sandbox();
  assert.equal(run('init', '--non-interactive', '--vault', path.join(home, 'V'), '--set', 'calendar_apple=yes').code, 1);
  assert.equal(run('init', '--non-interactive', '--vault', path.join(home, 'V'), '--set', 'calendar_apple=off', '--set', 'calendar_apple_names=Work, Class Times').code, 0);
  const s = run('config').json.settings;
  assert.equal(s.calendar_apple, 'off');
  assert.deepEqual(s.calendar_apple_names, ['Work', 'Class Times']);
});
