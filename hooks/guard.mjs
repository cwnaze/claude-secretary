#!/usr/bin/env node
// PreToolUse hook: enforces the secretary's outbound permissions on MCP tools.
// Silent (no decision) for anything it doesn't classify, or when the user has
// no secretary config, so it never gets in the way of unrelated work.

import { classify, decide } from '../skills/secretary/scripts/lib/guard.mjs';
import { loadConfig, permission } from '../skills/secretary/scripts/lib/config.mjs';
import { logAction } from '../skills/secretary/scripts/lib/vault.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function main() {
  let input;
  try { input = JSON.parse(await readStdin()); } catch { return; }
  const action = classify(input.tool_name, input.tool_input);
  if (!action) return;

  let cfg = null; let level = null;
  try {
    cfg = loadConfig({ required: false });
    if (!cfg) return; // secretary not set up: stay out of the way
    level = permission(cfg.settings, action);
  } catch {
    level = null; // config exists but is unreadable: fail closed for gated actions
  }
  const decision = decide(action, level);
  if (!decision) return;
  if (cfg && decision.permissionDecision === 'deny') {
    try { logAction(cfg, { action, target: input.tool_name, summary: 'blocked by guard', status: 'blocked' }); } catch { /* best effort */ }
  }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision } }));
}

main().catch(() => { /* never crash the session */ });
