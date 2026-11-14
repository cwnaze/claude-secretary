// The dashboard's Settings page: what it may show and change in Settings.md.
// Writes patch only the changed frontmatter keys (the body, unknown keys and comments
// stay as the user left them) and always pass validateSettings() first.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defaultSettings, DEFAULT_PUBLISH_COMMAND, SETTINGS_BODY } from './config.mjs';
import { buildNote, setNoteFields } from './yaml.mjs';
import { validateSettings } from './wizard.mjs';
import { redact } from './calendar.mjs';

// The upload command is run by a shell and the tool list decides what an unattended run may do,
// so a page must never be able to change them: a write bug would become code execution.
export const READ_ONLY = ['calendar_publish_command', 'briefing_allowed_tools'];
const INTERNAL = ['type', 'tags'];
// Feeds often embed private tokens, so the page only ever sees them redacted and edits them by index.
const FEEDS = 'calendar_feeds';
export const EDITABLE = Object.keys(defaultSettings()).filter((k) => !READ_ONLY.includes(k) && !INTERNAL.includes(k) && k !== FEEDS);

const MAX_LEN = 500;
const MAX_ITEMS = 100;

export class SettingsError extends Error {
  constructor(status, code, message, errors = []) { super(message); this.status = status; this.code = code; this.errors = errors; }
}

const toList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);

function normalize(key, v) {
  const d = defaultSettings()[key];
  if (Array.isArray(d)) return toList(v);
  if (typeof d === 'number') return Number(v);
  if (typeof d === 'boolean') return v === true || /^(true|yes|1)$/i.test(String(v));
  return v === null || v === undefined ? '' : String(v);
}

function readText(cfg) {
  try { return fs.readFileSync(cfg.settingsPath, 'utf8'); } catch { return null; }
}

// Changes whenever Settings.md does, so a save made over an edit from Obsidian is refused, not merged blind.
export function settingsVersion(text) {
  return text === null ? 'none' : crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function settingsView(cfg) {
  const s = cfg.settings;
  const values = Object.fromEntries(EDITABLE.map((k) => [k, normalize(k, s[k])]));
  for (const k of ['briefing_morning', 'briefing_evening']) if (values[k].trim() === 'off') values[k] = '';
  return {
    vault: path.basename(cfg.vault),
    root: cfg.root,
    settings_path: path.relative(cfg.vault, cfg.settingsPath),
    settings_found: cfg.settingsFound,
    version: settingsVersion(readText(cfg)),
    platform: process.platform,
    values,
    calendar_feeds: toList(s[FEEDS]).map(redact),
    read_only: {
      calendar_publish_command: String(s.calendar_publish_command ?? ''),
      publish_command_is_default: s.calendar_publish_command === DEFAULT_PUBLISH_COMMAND,
      briefing_allowed_tools: toList(s.briefing_allowed_tools),
    },
  };
}

function checkString(key, v) {
  if (typeof v !== 'string') throw new SettingsError(400, 'bad_type', `${key} must be text`);
  if (/[\r\n]/.test(v)) throw new SettingsError(400, 'bad_value', `${key} must be a single line`);
  if (v.length > MAX_LEN) throw new SettingsError(400, 'bad_value', `${key} is too long`);
  return v.trim();
}

function coerceChange(key, v) {
  const d = defaultSettings()[key];
  if (Array.isArray(d)) {
    if (!Array.isArray(v) || v.length > MAX_ITEMS) throw new SettingsError(400, 'bad_type', `${key} must be a list`);
    return v.map((x) => checkString(key, x)).filter(Boolean);
  }
  if (typeof d === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new SettingsError(400, 'bad_type', `${key} must be a number`);
    return v;
  }
  if (typeof d === 'boolean') {
    if (typeof v !== 'boolean') throw new SettingsError(400, 'bad_type', `${key} must be true or false`);
    return v;
  }
  return checkString(key, v);
}

function feedUrlOk(u) {
  try { return ['http:', 'https:', 'webcal:', 'webcals:'].includes(new URL(u).protocol); } catch { return false; }
}

// { keep: [indexes of current feeds], add: [new urls] } → the new list. Kept feeds never leave the server.
function feedsChange(current, v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SettingsError(400, 'bad_type', 'calendar_feeds must be { keep, add }');
  const keep = v.keep ?? current.map((_, i) => i);
  const add = v.add ?? [];
  if (!Array.isArray(keep) || !keep.every((i) => Number.isInteger(i) && i >= 0 && i < current.length)) throw new SettingsError(400, 'bad_value', 'calendar_feeds.keep must list existing feeds');
  if (!Array.isArray(add) || add.length > MAX_ITEMS) throw new SettingsError(400, 'bad_type', 'calendar_feeds.add must be a list');
  const added = add.map((u) => checkString('calendar_feeds', u)).filter(Boolean);
  const bad = added.filter((u) => !feedUrlOk(u));
  if (bad.length) throw new SettingsError(422, 'invalid', 'Invalid settings', bad.map(() => 'calendar_feeds: each feed must be an http(s) or webcal:// URL'));
  return [...new Set(keep)].sort((a, b) => a - b).map((i) => current[i]).concat(added);
}

// body: { version, changes: { key: value } }. Returns { changed, schedule_changed }.
export function saveSettings(cfg, body) {
  if (!body || typeof body !== 'object' || !body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes)) {
    throw new SettingsError(400, 'bad_request', 'Expected { version, changes }');
  }
  const text = readText(cfg);
  if (body.version !== settingsVersion(text)) {
    throw new SettingsError(409, 'changed', 'Settings.md changed since this page loaded. Reload to see the current values.');
  }
  const current = cfg.settings;
  const updates = {};
  for (const [key, v] of Object.entries(body.changes)) {
    if (READ_ONLY.includes(key) || INTERNAL.includes(key)) throw new SettingsError(400, 'read_only', `${key} can only be changed in Settings.md`);
    if (key === FEEDS) { updates[key] = feedsChange(toList(current[FEEDS]), v); continue; }
    if (!EDITABLE.includes(key)) throw new SettingsError(400, 'unknown', `Unknown setting "${key}"`);
    let nv = coerceChange(key, v);
    if ((key === 'briefing_morning' || key === 'briefing_evening') && nv === 'off') nv = '';
    if (key === 'work_days' || key === 'briefing_days') nv = nv.map((d) => d.toLowerCase());
    updates[key] = nv;
  }
  for (const k of Object.keys(updates)) {
    if (JSON.stringify(updates[k]) === JSON.stringify(normalize(k, current[k]))) delete updates[k];
  }
  const changed = Object.keys(updates);
  if (!changed.length) return { changed, schedule_changed: false };

  const merged = { ...current, ...updates };
  const errors = validateSettings(merged);
  if (errors.length) throw new SettingsError(422, 'invalid', 'Invalid settings', errors);
  if (updates.tag_prefix) updates.tags = [`${updates.tag_prefix}/settings`];

  let next;
  if (text === null) {
    const { type, tags, ...rest } = merged;
    next = buildNote({ type: 'settings', tags: [`${merged.tag_prefix}/settings`], ...rest }, SETTINGS_BODY);
  } else {
    next = setNoteFields(text, updates);
  }
  fs.mkdirSync(path.dirname(cfg.settingsPath), { recursive: true });
  const tmp = `${cfg.settingsPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, next, { mode: 0o600 });
  fs.renameSync(tmp, cfg.settingsPath);
  return { changed, schedule_changed: changed.some((k) => k.startsWith('briefing_')) };
}
