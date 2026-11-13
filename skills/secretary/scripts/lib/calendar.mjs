// High-level calendar operations for the remote-ics backend.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseCalendar, occurrences, emptyCalendar } from './ics.mjs';
import { expandHome } from './config.mjs';
import { readAppleEvents } from './apple.mjs';

export function cacheDir() {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  const d = path.join(base, 'claude-secretary');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function calendarFile(settings) {
  if (!settings.calendar_file) throw new Error('calendar_file is not set in Settings.md');
  return path.resolve(expandHome(settings.calendar_file));
}

export function readMain(settings, { create = false } = {}) {
  const f = calendarFile(settings);
  if (!fs.existsSync(f)) {
    if (!create) throw new Error(`Calendar file not found: ${f}. Run \`sec ics pull\` to download it, or fix calendar_file.`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, emptyCalendar(settings.name ? `${settings.name}'s calendar` : 'Calendar'));
  }
  return { file: f, text: fs.readFileSync(f, 'utf8') };
}

export function backup(file) {
  const dir = path.join(cacheDir(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${path.basename(file)}.${stamp}.bak`);
  fs.copyFileSync(file, dest);
  const olds = fs.readdirSync(dir).filter((f) => f.startsWith(path.basename(file) + '.')).sort();
  for (const o of olds.slice(0, Math.max(0, olds.length - 20))) fs.rmSync(path.join(dir, o));
  return dest;
}

export function writeMain(file, text) {
  // validate before writing so a bad edit never reaches the subscription
  const cal = parseCalendar(text);
  if (!/BEGIN:VCALENDAR/i.test(text) || !/END:VCALENDAR/i.test(text)) throw new Error('Refusing to write: result is not a VCALENDAR');
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return cal.events.length;
}

function feedUrl(u) { return String(u).replace(/^webcal:\/\//i, 'https://'); }

export async function fetchFeed(url, { ttlMs = 15 * 60000 } = {}) {
  const u = feedUrl(url);
  const key = crypto.createHash('sha256').update(u).digest('hex').slice(0, 16);
  const f = path.join(cacheDir(), `feed-${key}.ics`);
  const fresh = fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < ttlMs;
  if (fresh) return { text: fs.readFileSync(f, 'utf8'), cached: true };
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'claude-secretary' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('response is not an iCalendar file');
    fs.writeFileSync(f, text);
    return { text, cached: false };
  } catch (e) {
    if (fs.existsSync(f)) return { text: fs.readFileSync(f, 'utf8'), cached: true, stale: true, error: e.message };
    throw new Error(`Could not fetch feed ${redact(u)}: ${e.message}`);
  }
}

// Feed URLs often embed private tokens; never print any of the path.
// Keeping the first 24 characters still leaked real secrets — for a secret
// GitHub Gist that is the username plus roughly a third of the gist id. A
// short digest of the full URL distinguishes feeds just as well while
// revealing nothing that can be used to fetch one.
export function redact(u) {
  try {
    const full = feedUrl(u);
    const x = new URL(full);
    const tag = crypto.createHash('sha256').update(full).digest('hex').slice(0, 6);
    return `${x.protocol}//${x.host}#${tag}`;
  } catch { return '(feed)'; }
}

export function appleEnabled(settings) { return String(settings.calendar_apple || 'off').toLowerCase() === 'macos'; }

export async function collectEvents(settings, fromMs, toMs, { feeds = true, main = true, apple = true } = {}) {
  const tz = settings.timezone;
  const all = []; const warnings = [];
  if (main && settings.calendar_backend === 'remote-ics' && settings.calendar_file) {
    const otherSources = (feeds && (settings.calendar_feeds || []).length) || (apple && appleEnabled(settings));
    if (otherSources && !fs.existsSync(calendarFile(settings))) {
      warnings.push(`Calendar file not found: ${calendarFile(settings)} (showing the other calendars only)`);
    } else {
      const { text } = readMain(settings);
      const r = occurrences(parseCalendar(text), fromMs, toMs, tz, { source: 'main' });
      all.push(...r.events); warnings.push(...r.warnings);
    }
  }
  if (feeds) {
    for (const url of settings.calendar_feeds || []) {
      try {
        const { text, stale, error } = await fetchFeed(url);
        if (stale) warnings.push(`Using cached copy of ${redact(url)} (${error})`);
        const r = occurrences(parseCalendar(text), fromMs, toMs, tz, { source: redact(url) });
        all.push(...r.events); warnings.push(...r.warnings);
      } catch (e) { warnings.push(e.message); }
    }
  }
  if (apple && appleEnabled(settings)) {
    try {
      // Calendar.app often subscribes to the same files (our published .ics, a
      // Canvas feed), so drop occurrences we already have from another source.
      const seen = new Set(all.map((e) => `${e.uid}|${e.start}`));
      for (const e of readAppleEvents(fromMs, toMs, { calendars: settings.calendar_apple_names || [] })) {
        if (!seen.has(`${e.uid}|${e.start}`)) all.push(e);
      }
    } catch (e) { warnings.push(`Apple Calendar: ${e.message}`); }
  }
  all.sort((a, b) => a.start - b.start);
  return { events: all, warnings };
}

export function fillTemplate(tpl, vars) {
  return tpl.replace(/\{(file|bucket|key)\}/g, (_, k) => {
    const v = String(vars[k] ?? '');
    if (/["`$\\\n]/.test(v)) throw new Error(`Refusing to substitute {${k}}: contains shell metacharacters`);
    return v;
  });
}

export function publish(settings, { dryRun = false } = {}) {
  const file = calendarFile(settings);
  if (!fs.existsSync(file)) throw new Error(`Calendar file not found: ${file}`);
  const tpl = settings.calendar_publish_command;
  if (!tpl) throw new Error('calendar_publish_command is empty in Settings.md');
  if (tpl.includes('{bucket}') && !settings.calendar_bucket) throw new Error('calendar_bucket is empty in Settings.md');
  if (tpl.includes('{key}') && !settings.calendar_key) throw new Error('calendar_key is empty in Settings.md');
  const cmd = fillTemplate(tpl, { file, bucket: settings.calendar_bucket, key: settings.calendar_key });
  if (dryRun) return { cmd, dryRun: true };
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 180000 });
  return { cmd, status: r.status, stdout: (r.stdout || '').slice(-2000), stderr: (r.stderr || '').slice(-2000) };
}

export async function pull(settings) {
  if (!settings.calendar_public_url) throw new Error('calendar_public_url is not set in Settings.md');
  const u = feedUrl(settings.calendar_public_url);
  const res = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'claude-secretary', 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${redact(u)}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Downloaded file is not an iCalendar file');
  const file = calendarFile(settings);
  let bak = null;
  if (fs.existsSync(file)) bak = backup(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeMain(file, text);
  return { file, backup: bak, events: parseCalendar(text).events.length };
}
