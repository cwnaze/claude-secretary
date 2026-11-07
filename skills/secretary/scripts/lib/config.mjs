// Locating and loading secretary settings.
// Pointer file (~/.claude-secretary.json, or $SECRETARY_CONFIG) holds only the
// vault path and root folder. Everything else lives in <vault>/<root>/Settings.md
// so the user can read and edit it in Obsidian.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readNoteText, buildNote } from './yaml.mjs';
import { localTz } from './tz.mjs';

export const ACTIONS = ['send_email', 'send_invites', 'contact_people', 'manage_calendar'];
export const LEVELS = ['off', 'ask', 'auto'];

export const DEFAULT_PUBLISH_COMMAND =
  'npx --yes wrangler r2 object put "{bucket}/{key}" --file "{file}" --content-type "text/calendar; charset=utf-8" --remote';

export function defaultSettings() {
  return {
    type: 'settings',
    name: '',
    timezone: localTz(),
    work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    work_start: '09:00',
    work_end: '17:00',
    hard_stop: '21:30',
    meeting_buffer_min: 10,
    default_meeting_min: 30,
    tone: 'concise, warm, professional',
    signature: '',
    vips: [],
    organize_by: 'folders',
    tag_prefix: 'secretary',
    calendar_backend: 'remote-ics',
    calendar_file: '',
    calendar_bucket: '',
    calendar_key: '',
    calendar_public_url: '',
    calendar_publish_command: DEFAULT_PUBLISH_COMMAND,
    calendar_feeds: [],
    all_day_is_busy: false,
    email_backend: 'connector',
    messaging_backend: 'none',
    permission_send_email: 'off',
    permission_send_invites: 'off',
    permission_contact_people: 'off',
    permission_manage_calendar: 'ask',
    currency: 'USD',
    keep_in_touch_days: 90,
  };
}

export function pointerPath() {
  return process.env.SECRETARY_CONFIG || path.join(os.homedir(), '.claude-secretary.json');
}

export function readPointer() {
  const p = pointerPath();
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    throw new Error(`Could not parse ${p}: ${e.message}`);
  }
}

export function writePointer(obj) {
  const p = pointerPath();
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  return p;
}

export function expandHome(p) {
  if (!p) return p;
  return p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

export function settingsPath(ptr) {
  return path.join(expandHome(ptr.vault), ptr.root || 'Secretary', 'Settings.md');
}

export function loadConfig({ required = true } = {}) {
  const ptr = readPointer();
  if (!ptr || !ptr.vault) {
    if (!required) return null;
    const err = new Error(
      `No secretary config found at ${pointerPath()}.\n` +
      'Run the setup wizard: `npx claude-secretary init` (or `node <secretary skill>/scripts/sec.mjs init`).');
    err.code = 'NO_CONFIG';
    throw err;
  }
  const vault = path.resolve(expandHome(ptr.vault));
  const root = ptr.root || 'Secretary';
  const sp = settingsPath(ptr);
  let settings = defaultSettings();
  let settingsFound = false;
  if (fs.existsSync(sp)) {
    settingsFound = true;
    const { data } = readNoteText(fs.readFileSync(sp, 'utf8'));
    settings = { ...settings, ...stripNulls(data) };
  }
  return { vault, root, rootDir: path.join(vault, root), settingsPath: sp, settingsFound, settings, pointer: ptr };
}

function stripNulls(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

export function permission(settings, action) {
  if (!ACTIONS.includes(action)) throw new Error(`Unknown action "${action}". Known: ${ACTIONS.join(', ')}`);
  const v = String(settings[`permission_${action}`] ?? 'off').toLowerCase();
  return LEVELS.includes(v) ? v : 'off'; // anything unrecognised fails closed
}

export const SETTINGS_BODY = `
# Secretary settings

Edit the properties above to change how your secretary behaves. Claude reads this
note at the start of every secretary task.

## Permissions (\`permission_*\`)
Each outbound action is one of:
- **off** — Claude never does it. It drafts instead and tells you where the draft is.
- **ask** — Claude shows you exactly what it will do and waits for an explicit yes.
- **auto** — Claude may do it without asking. Every action is still written to [[Log]].

| Property | Controls |
|---|---|
| permission_send_email | Sending email (replies, recaps, nudges) |
| permission_send_invites | Sending calendar invitations to other people |
| permission_contact_people | Messaging people on other channels (Slack, SMS, …) |
| permission_manage_calendar | Creating, moving or deleting events on your own calendar |

## Organisation
- **organize_by: folders** — notes go in sub-folders (Follow-ups/, People/, …).
- **organize_by: tags** — notes sit flat in this folder and are grouped by tags
  like \`#${'secretary'}/followup\`. Every note also has a \`type\` property, so you can switch
  modes at any time without breaking anything.

## Calendar
- **calendar_backend: remote-ics** — Claude edits \`calendar_file\` and runs
  \`calendar_publish_command\` to upload it (default: Cloudflare R2 via wrangler).
  Placeholders: \`{file}\`, \`{bucket}\`, \`{key}\`.
- **calendar_backend: connector** — Claude uses a connected calendar tool (Google, Outlook).
- **calendar_feeds** — extra read-only ICS URLs (e.g. Canvas) counted as busy time.

Never put passwords, API keys or account numbers in this note.
`;

export function writeSettings(cfgPathOrPtr, settings) {
  const sp = typeof cfgPathOrPtr === 'string' ? cfgPathOrPtr : settingsPath(cfgPathOrPtr);
  fs.mkdirSync(path.dirname(sp), { recursive: true });
  fs.writeFileSync(sp, buildNote(settings, SETTINGS_BODY));
  return sp;
}
