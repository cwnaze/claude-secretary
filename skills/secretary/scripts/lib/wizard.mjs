// Setup wizard: interactive in a terminal, or non-interactive with --set flags
// (used when Claude runs setup inside a chat, where stdin prompts are impossible).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  defaultSettings, readPointer, writePointer, settingsPath, writeSettings, loadConfig,
  expandHome, ACTIONS, LEVELS, DEFAULT_PUBLISH_COMMAND,
} from './config.mjs';
import { readNoteText } from './yaml.mjs';
import { isValidTz } from './tz.mjs';
import { ensureLayout } from './vault.mjs';
import { appleSupported, appleAccess, appleCalendars } from './apple.mjs';
import { unsafeValue } from './schedule.mjs';

export function obsidianConfigPaths() {
  const h = os.homedir();
  const xdg = process.env.XDG_CONFIG_HOME || path.join(h, '.config');
  return [
    path.join(h, 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
    path.join(xdg, 'obsidian', 'obsidian.json'),
    path.join(h, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian', 'obsidian.json'), // Flatpak
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Obsidian', 'obsidian.json') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'obsidian', 'obsidian.json') : null,
  ].filter(Boolean);
}

// iCloud Drive locations. Obsidian's own iCloud container holds one vault per
// sub-folder; vaults kept elsewhere in iCloud Drive are found by their .obsidian folder.
// macOS: ~/Library/Mobile Documents. Windows (iCloud for Windows): ~/iCloudDrive.
export function icloudRoots() {
  const h = os.homedir();
  const mac = path.join(h, 'Library', 'Mobile Documents');
  const win = path.join(process.env.USERPROFILE || h, 'iCloudDrive');
  return {
    obsidian: [path.join(mac, 'iCloud~md~obsidian', 'Documents'), path.join(win, 'iCloud~md~obsidian')],
    drive: [path.join(mac, 'com~apple~CloudDocs'), win],
  };
}

function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.includes('~'))
      .map((d) => path.join(dir, d.name));
  } catch { return []; }
}

const isVault = (dir) => fs.existsSync(path.join(dir, '.obsidian'));

export function discoverICloudVaults({ depth = 3, maxDirs = 2000 } = {}) {
  const { obsidian, drive } = icloudRoots();
  const out = [];
  for (const root of obsidian) out.push(...subdirs(root));
  let budget = maxDirs; // iCloud folders can be huge; never stall setup on a big tree
  const walk = (dir, d) => {
    for (const sub of subdirs(dir)) {
      if (--budget < 0) return;
      if (isVault(sub)) out.push(sub);
      else if (d > 1) walk(sub, d - 1);
    }
  };
  for (const root of drive) walk(root, depth);
  return [...new Set(out)];
}

export function isICloudPath(p) {
  const { obsidian, drive } = icloudRoots();
  return [...obsidian, ...drive].some((r) => p === r || p.startsWith(r + path.sep));
}

export function discoverVaults() {
  const out = [];
  for (const p of obsidianConfigPaths()) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const v of Object.values(j.vaults || {})) if (v.path && fs.existsSync(v.path)) out.push(path.resolve(v.path));
    } catch { /* not present */ }
  }
  out.push(...discoverICloudVaults());
  return [...new Set(out)];
}

const list = (s) => (Array.isArray(s) ? s : String(s || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function validateSettings(s) {
  const errs = [];
  if (!isValidTz(s.timezone)) errs.push(`timezone "${s.timezone}" is not a valid IANA zone`);
  for (const k of ['work_start', 'work_end', 'hard_stop']) if (!TIME.test(String(s[k]))) errs.push(`${k} must be HH:MM`);
  for (const d of list(s.work_days)) if (!DAYS.includes(d.toLowerCase())) errs.push(`work_days: "${d}" is not one of ${DAYS.join(', ')}`);
  for (const k of ['meeting_buffer_min', 'default_meeting_min', 'keep_in_touch_days']) {
    const n = Number(s[k]);
    if (!Number.isInteger(n) || n < 0 || (k === 'default_meeting_min' && n === 0)) errs.push(`${k} must be a whole number${k === 'default_meeting_min' ? ' above 0' : ', 0 or more'}`);
  }
  for (const k of ['email_backend', 'messaging_backend']) if (!['connector', 'none'].includes(s[k])) errs.push(`${k} must be connector or none`);
  if (!['folders', 'tags'].includes(s.organize_by)) errs.push('organize_by must be folders or tags');
  if (!/^[A-Za-z0-9_\-/]+$/.test(String(s.tag_prefix))) errs.push('tag_prefix may only contain letters, numbers, _ - /');
  if (!['remote-ics', 'connector'].includes(s.calendar_backend)) errs.push('calendar_backend must be remote-ics or connector');
  // not tied to this machine's OS: Settings.md may sync to a Mac and a PC; non-Macs warn at read time
  if (!['off', 'macos'].includes(s.calendar_apple)) errs.push('calendar_apple must be off or macos');
  for (const a of ACTIONS) if (!LEVELS.includes(String(s[`permission_${a}`]))) errs.push(`permission_${a} must be off, ask or auto`);
  for (const k of ['briefing_morning', 'briefing_evening']) {
    const v = String(s[k] ?? '').trim();
    if (v && v !== 'off' && !TIME.test(v)) errs.push(`${k} must be HH:MM, or blank to turn it off`);
  }
  for (const d of list(s.briefing_days)) if (!DAYS.includes(d.toLowerCase())) errs.push(`briefing_days: "${d}" is not one of ${DAYS.join(', ')}`);
  for (const t of list(s.briefing_allowed_tools)) if (unsafeValue(t)) errs.push(`briefing_allowed_tools: "${t}" contains quotes or shell characters`);
  return errs;
}

function coerce(key, value, defaults) {
  const d = defaults[key];
  if (Array.isArray(d)) return list(value);
  if (typeof d === 'number') { const n = Number(value); if (Number.isNaN(n)) throw new Error(`${key} must be a number`); return n; }
  if (typeof d === 'boolean') return /^(true|yes|1)$/i.test(String(value));
  return String(value);
}

export async function runWizard({ interactive = true, sets = {}, vault = null, root = null, log = console.log } = {}) {
  const defaults = defaultSettings();
  const prevPtr = readPointer();
  let prev = {};
  if (prevPtr?.vault && fs.existsSync(settingsPath(prevPtr))) {
    prev = readNoteText(fs.readFileSync(settingsPath(prevPtr), 'utf8')).data;
  }
  const s = { ...defaults, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v !== null)) };
  let rl = null;
  const ask = async (q, def = '') => {
    if (!interactive) return def;
    const a = (await rl.question(`${q}${def !== '' ? ` [${def}]` : ''}: `)).trim();
    return a === '' ? def : a;
  };
  const choose = async (q, options, def) => {
    if (!interactive) return def;
    while (true) {
      const a = await ask(`${q} (${options.join('/')})`, def);
      if (options.includes(a)) return a;
      log(`  Please answer one of: ${options.join(', ')}`);
    }
  };

  if (interactive) {
    rl = readline.createInterface({ input: stdin, output: stdout });
    log('\nClaude Secretary setup\n======================\nPress Enter to accept the value in [brackets].\n');
  }
  try {
    // 1. Vault
    let vaultPath = vault || prevPtr?.vault || '';
    if (interactive && !vault) {
      const found = discoverVaults();
      if (found.length) {
        log('Obsidian vaults found:');
        found.forEach((v, i) => log(`  ${i + 1}. ${v}${isICloudPath(v) ? '  (iCloud)' : ''}`));
        const a = await ask('Pick a number or type a path', vaultPath || '1');
        vaultPath = /^\d+$/.test(a) && found[+a - 1] ? found[+a - 1] : a;
      } else {
        vaultPath = await ask('Path to your Obsidian vault', vaultPath || path.join(os.homedir(), 'Obsidian'));
      }
    }
    if (!vaultPath) throw new Error('A vault path is required. Pass --vault PATH, run `npx claude-secretary config` in an interactive terminal, or run /secretary:setup inside Claude Code.');
    vaultPath = path.resolve(expandHome(vaultPath));
    if (!fs.existsSync(vaultPath)) {
      const mk = interactive ? await choose(`${vaultPath} does not exist. Create it?`, ['y', 'n'], 'y') : 'y';
      if (mk !== 'y') throw new Error('Vault folder does not exist');
      fs.mkdirSync(vaultPath, { recursive: true });
    }
    const rootFolder = root || (interactive ? await ask('Folder inside the vault for secretary notes', prevPtr?.root || 'Secretary') : (prevPtr?.root || 'Secretary'));

    // 2. Organisation
    s.organize_by = await choose('Organise notes by', ['folders', 'tags'], s.organize_by);
    s.tag_prefix = await ask('Tag prefix (notes get tags like <prefix>/followup)', s.tag_prefix);

    // 3. Profile
    if (interactive) log('\n-- About you --');
    s.name = await ask('Your name', s.name);
    s.timezone = await ask('Time zone (IANA, e.g. America/New_York)', s.timezone);
    s.work_days = list(await ask('Working days', s.work_days.join(',')));
    s.work_start = await ask('Work day starts (HH:MM)', s.work_start);
    s.work_end = await ask('Work day ends (HH:MM)', s.work_end);
    s.hard_stop = await ask('Hard stop — never schedule after (HH:MM)', s.hard_stop);
    s.tone = await ask('Writing tone for drafts', s.tone);
    s.vips = list(await ask('VIPs whose messages always come first (names/emails, comma-separated)', s.vips.join(', ')));

    // 4. Calendar
    if (interactive) log('\n-- Calendar --\n  remote-ics: Claude edits a local .ics and uploads it (e.g. to Cloudflare R2) for subscriptions like Apple Calendar\n  connector:  Claude uses a connected calendar tool (Google Calendar, Outlook)');
    s.calendar_backend = await choose('Calendar backend', ['remote-ics', 'connector'], s.calendar_backend);
    if (s.calendar_backend === 'remote-ics') {
      s.calendar_file = await ask('Local master .ics file', s.calendar_file || path.join(vaultPath, rootFolder, 'calendar.ics'));
      s.calendar_public_url = await ask('Public URL you subscribe to (optional, used to download/verify)', s.calendar_public_url);
      s.calendar_bucket = await ask('R2 bucket name', s.calendar_bucket);
      s.calendar_key = await ask('Object key in the bucket (e.g. calendar.ics)', s.calendar_key || path.basename(s.calendar_file));
      const custom = await choose('Upload with the default wrangler command?', ['y', 'n'], s.calendar_publish_command === DEFAULT_PUBLISH_COMMAND ? 'y' : 'n');
      if (custom === 'n') s.calendar_publish_command = await ask('Upload command ({file}, {bucket}, {key} are filled in)', s.calendar_publish_command);
      else s.calendar_publish_command = DEFAULT_PUBLISH_COMMAND;
    }
    if (appleSupported()) {
      if (interactive) log('\n  Apple Calendar: on this Mac the secretary can read Calendar.app directly (every account in it) as busy time.');
      s.calendar_apple = await choose('Read Apple Calendar?', ['macos', 'off'], s.calendar_apple);
      if (s.calendar_apple === 'macos' && interactive) {
        let cals = [];
        try { if (appleAccess({ request: true }) === 'granted') cals = appleCalendars(); } catch (e) { log(`  ${e.message}`); }
        if (cals.length) log(`  Calendars: ${cals.map((c) => c.title).join(', ')}`);
        s.calendar_apple_names = list(await ask('Only these calendars (comma-separated, blank = all)', s.calendar_apple_names.join(', ')));
      }
    } else if (interactive) {
      log('\n  Apple / iCloud calendars: on icloud.com/calendar, share a calendar as "Public Calendar" and paste\n  its webcal:// link below. Anyone with the link can read that calendar.');
    }
    s.calendar_feeds = list(await ask('Extra read-only calendar feeds counted as busy (URLs, comma-separated, optional)', s.calendar_feeds.join(', ')));

    // 5. Email / messaging
    if (interactive) log('\n-- Email & messaging --\n  These are connected inside Claude, not here. See the README for connector setup.');
    s.email_backend = await choose('Email', ['connector', 'none'], s.email_backend);
    s.messaging_backend = await choose('Messaging (Slack etc.)', ['connector', 'none'], s.messaging_backend);

    // 6. Permissions
    if (interactive) log('\n-- Permissions --\n  off = never, only drafts   ask = show it and wait for your yes   auto = just do it (logged)');
    for (const a of ACTIONS) s[`permission_${a}`] = await choose(`  ${a}`, LEVELS, s[`permission_${a}`]);

    s.currency = await ask('Currency for expenses', s.currency);

    // 7. Automatic briefings (installed separately with `sec schedule install`)
    if (interactive) log('\n-- Automatic briefings --\n  A morning brief (what to do today) and an evening recap (what got done, what is left).\n  Type "off" to skip one.');
    s.briefing_morning = await ask('Morning brief at (HH:MM)', s.briefing_morning || 'off');
    s.briefing_evening = await ask('Evening recap at (HH:MM)', s.briefing_evening || 'off');
    s.briefing_days = list(await ask('On which days', s.briefing_days.join(',')));

    // apply --set overrides last
    for (const [k, v] of Object.entries(sets)) {
      if (!(k in defaults)) throw new Error(`Unknown setting "${k}"`);
      s[k] = coerce(k, v, defaults);
    }
    for (const k of ['work_days', 'vips', 'calendar_feeds', 'calendar_apple_names']) s[k] = list(s[k]);
    for (const k of ['work_days', 'vips', 'calendar_feeds', 'briefing_days', 'briefing_allowed_tools']) s[k] = list(s[k]);
    for (const k of ['briefing_morning', 'briefing_evening']) if (String(s[k]).trim() === 'off') s[k] = '';
    s.tags = [`${s.tag_prefix}/settings`];
    const errs = validateSettings(s);
    if (errs.length) throw new Error(`Invalid settings:\n  - ${errs.join('\n  - ')}`);

    const ptr = { vault: vaultPath, root: rootFolder };
    writePointer(ptr);
    const { type, tags, ...rest } = s;
    const sp = writeSettings(ptr, { type: 'settings', tags, ...rest });
    const cfg = loadConfig();
    ensureLayout(cfg);
    return { pointer: ptr, settingsPath: sp, settings: cfg.settings };
  } finally {
    rl?.close();
  }
}
