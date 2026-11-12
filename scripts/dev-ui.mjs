#!/usr/bin/env node
// `npm run dev:ui`: starts the dashboard API (the same server as `sec ui`) and `next dev` together,
// so the dev page can read the vault without a separate `sec ui` or Claude Code running.
// If something already listens on the API port (e.g. your own `sec ui`), that one is used instead.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, listen, DEFAULT_PORT } from '../skills/secretary/scripts/lib/server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = Number(process.env.SECRETARY_PORT || DEFAULT_PORT);
const webPort = process.env.PORT || '7411';

let api = null;
try {
  await listen(api = createServer(), apiPort);
  console.log(`Secretary API: http://localhost:${apiPort}/api/home`);
} catch (e) {
  if (e.code !== 'EADDRINUSE') throw e;
  api = null;
  console.log(`Port ${apiPort} is in use; proxying /api to whatever is running there (expected: sec ui).`);
}

const next = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', path.join(root, 'web'), '--port', webPort], {
  stdio: 'inherit',
  env: { ...process.env, SECRETARY_API: `http://localhost:${apiPort}`, NEXT_TELEMETRY_DISABLED: '1' },
});

const stop = () => { next.kill('SIGINT'); api?.close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
next.on('exit', (code) => { api?.close(); process.exit(code ?? 0); });
