#!/usr/bin/env node
// npx claude-secretary <command>
// Installs the `secretary` Claude Code plugin (via the `claude` CLI) and runs the setup wizard.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  uninstall   Uninstall the plugin (your vault notes and settings are kept)

Options
  --scope user|project|local   Where Claude Code installs the plugin (default: user)
  --source <owner/repo|path>   Marketplace to install from (default: ${DEFAULT_SOURCE})
  --skip-plugin                init: only run the wizard

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
      else if (['scope', 'source'].includes(k)) flags[k] = argv[++i];
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
    case 'uninstall': {
      if (!claudeAvailable()) { console.error('`claude` not found. Inside Claude Code run: /plugin uninstall ' + PLUGIN_ID); process.exit(1); }
      const code = claude(['plugin', 'uninstall', PLUGIN_ID, '--scope', flags.scope || 'user']);
      if (code === 0) console.log('Your vault notes and ~/.claude-secretary.json were left in place.');
      process.exit(code);
    }
    default:
      console.error(`Unknown command "${cmd}".\n`); console.log(HELP); process.exit(1);
  }
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
