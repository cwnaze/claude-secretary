#!/usr/bin/env node
// npx claude-secretary <command>
// Installs the `secretary` Claude Code plugin (via the `claude` CLI) and runs the setup wizard.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pointerPath, loadConfig, expandHome } from '../skills/secretary/scripts/lib/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
const MARKET = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
const PLUGIN = MARKET.plugins[0].name;
const PLUGIN_ID = `${PLUGIN}@${MARKET.name}`;
const DEFAULT_SOURCE = 'cwnaze/claude-secretary';
const SEC = path.join(PKG_ROOT, 'skills', 'secretary', 'scripts', 'sec.mjs');

const HELP = `claude-secretary v${pkg.version} — the Secretary plugin for Claude Code

Usage: npx claude-secretary <command> [options]

Commands
  init        Install the plugin into Claude Code, then run the setup wizard (start here)
  install     Install or update the plugin only
  config      Run the setup wizard (vault, profile, calendar, permissions)
  check       Health check of vault, settings and calendar
  ui          Open the read-only web dashboard on http://localhost:7410/ (no Claude Code needed)
  uninstall   Uninstall the plugin and remove its marketplace (vault kept unless --remove-vault)

Options
  --scope user|project|local   Where Claude Code installs the plugin (default: user)
  --source <owner/repo|path>   Marketplace to install from (default: ${DEFAULT_SOURCE})
  --skip-plugin                init: only run the wizard
  --keep-marketplace           uninstall: leave the ${MARKET.name} marketplace registered
  --purge                      uninstall: also delete ~/.claude-secretary.json and the
                               cache (feed copies, calendar backups); asks first
  --remove-vault               uninstall: also delete the secretary folder in your vault
                               (<vault>/Secretary and every note under it); asks first
  --remove-ics                 uninstall: also delete the local calendar file (calendar_file);
                               the published copy is not touched; asks first
  -y, --yes                    uninstall: don't ask before deleting
  --port <n>                   ui: port for the dashboard (default: 7410)

Inside Claude Code you can do the same with:
  /plugin marketplace add ${DEFAULT_SOURCE}
  /plugin install ${PLUGIN_ID}
  /${PLUGIN}:setup`;

function parse(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') flags.help = true;
    else if (a === '-y') flags.yes = true;
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) flags[k] = v;
      else if (['scope', 'source', 'port'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

function claudeAvailable() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function claude(args) {
  console.log(`$ claude ${args.join(' ')}`);
  const r = spawnSync('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status ?? 1;
}

function installPlugin(flags) {
  const version = claudeAvailable();
  if (!version) {
    console.error(`Claude Code's \`claude\` command was not found on PATH.
Install Claude Code, or install the plugin from inside Claude Code:
  /plugin marketplace add ${DEFAULT_SOURCE}
  /plugin install ${PLUGIN_ID}`);
    return false;
  }
  const scope = flags.scope || 'user';
  if (!['user', 'project', 'local'].includes(scope)) throw new Error('--scope must be user, project or local');
  const source = flags.source || DEFAULT_SOURCE;
  // Adding an already-known marketplace is harmless; refresh it so updates are seen.
  if (claude(['plugin', 'marketplace', 'add', source, '--scope', scope]) !== 0) {
    claude(['plugin', 'marketplace', 'update', MARKET.name]);
  }
  if (claude(['plugin', 'install', PLUGIN_ID, '--scope', scope]) !== 0) return false;
  console.log(`\nInstalled ${PLUGIN_ID} (${version}). In a running Claude Code session, run /reload-plugins.`);
  return true;
}

// Local state outside the vault: the pointer file and the cache (feeds, calendar backups).
function localState() {
  const cache = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'claude-secretary');
  return [pointerPath(), cache].filter((p) => fs.existsSync(p));
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await rl.question(question)).trim()); } catch { return false; } finally { rl.close(); }
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  return n;
}

// What --remove-vault / --remove-ics would delete. Read before --purge removes the pointer file.
function vaultTargets(flags) {
  if (!flags['remove-vault'] && !flags['remove-ics']) return [];
  const cfg = loadConfig({ required: false });
  if (!cfg) throw new Error(`No secretary config at ${pointerPath()}, so the vault folder and calendar file can't be found. Delete them by hand.`);
  const out = [];
  if (flags['remove-vault']) {
    // Only ever the secretary's own folder, strictly inside the vault: never the vault itself.
    const rel = path.relative(cfg.vault, cfg.rootDir);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Refusing to delete ${cfg.rootDir}: it is not a folder inside the vault ${cfg.vault}`);
    if (fs.existsSync(cfg.rootDir)) out.push({ path: cfg.rootDir, label: `secretary folder in your vault, ${countFiles(cfg.rootDir)} files` });
  }
  if (flags['remove-ics'] && cfg.settings.calendar_file) {
    const f = path.resolve(expandHome(cfg.settings.calendar_file));
    if (fs.existsSync(f)) out.push({ path: f, label: 'calendar file; other tools that write to it lose it too, the published copy stays' });
  }
  return out;
}

async function uninstall(flags) {
  const scope = flags.scope || 'user';
  if (!['user', 'project', 'local'].includes(scope)) throw new Error('--scope must be user, project or local');
  const targets = [
    ...vaultTargets(flags),
    ...(flags.purge ? localState().map((p) => ({ path: p, label: 'local state' })) : []),
  ];
  if (targets.length && !flags.yes) {
    if (!process.stdin.isTTY) throw new Error('deleting files needs --yes when not run interactively');
    console.log(`This will permanently delete:\n${targets.map((t) => `  ${t.path}\n    ${t.label}`).join('\n')}`);
    if (!(await confirm('Delete these? [y/N] '))) { console.log('Nothing was changed.'); return 1; }
  }

  let code = 0;
  if (!claudeAvailable()) {
    console.error(`\`claude\` not found. Inside Claude Code run:\n  /plugin uninstall ${PLUGIN_ID}\n  /plugin marketplace remove ${MARKET.name}`);
    code = 1;
  } else {
    code = claude(['plugin', 'uninstall', PLUGIN_ID, '--scope', scope]);
    // Only drop the marketplace once the plugin is gone; a failure here (e.g. it was never added) is not fatal.
    if (code === 0 && !flags['keep-marketplace'] && claude(['plugin', 'marketplace', 'remove', MARKET.name, '--scope', scope]) !== 0) {
      console.error(`Could not remove the ${MARKET.name} marketplace; remove it with: claude plugin marketplace remove ${MARKET.name}`);
    }
  }

  for (const t of targets) { fs.rmSync(t.path, { recursive: true, force: true }); console.log(`Deleted ${t.path}`); }
  const kept = localState();
  if (!flags['remove-vault']) console.log('\nYour vault notes were left in place (delete them with --remove-vault).');
  if (kept.length) console.log(`Left in place:\n${kept.map((p) => `  ${p}`).join('\n')}\n(delete them with --purge)`);
  console.log('If you installed this CLI globally, remove it with: npm uninstall -g claude-secretary');
  return code;
}

function runSec(args) {
  const r = spawnSync(process.execPath, [SEC, ...args], { stdio: 'inherit' });
  return r.status ?? 1;
}

async function main() {
  const { flags, pos } = parse(process.argv.slice(2));
  const cmd = pos[0];
  if (!cmd || flags.help || cmd === 'help') { console.log(HELP); return; }
  if (flags.version || cmd === 'version') { console.log(pkg.version); return; }

  switch (cmd) {
    case 'init': {
      if (!flags['skip-plugin'] && !installPlugin(flags)) process.exit(1);
      console.log('');
      const code = runSec(['init', ...(process.stdin.isTTY ? [] : ['--non-interactive'])]);
      if (code !== 0) process.exit(code);
      console.log(`
Connections: email, calendar and Slack come from Claude's connectors (enable them at
claude.ai/customize/connectors; they appear in Claude Code when you're signed in with a
claude.ai account) or from MCP servers you add with \`claude mcp add\`.

Then in Claude Code: "secretary check", or /${PLUGIN}:briefing to get your first brief.`);
      return;
    }
    case 'install': process.exit(installPlugin(flags) ? 0 : 1);
    case 'config': process.exit(runSec(['init']));
    case 'check': process.exit(runSec(['check']));
    case 'ui': process.exit(runSec(['ui', '--open', ...(flags.port ? [`--port=${flags.port}`] : [])]));
    case 'uninstall': process.exit(await uninstall(flags));
    default:
      console.error(`Unknown command "${cmd}".\n`); console.log(HELP); process.exit(1);
  }
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
