#!/usr/bin/env node
// Builds the web dashboard (web/) as a static export and copies it to ui/, which ships in the
// plugin and npm package. `sec ui` serves ui/ with Node's http module; no npm install at runtime.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const r = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', web], { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
if (r.status !== 0) process.exit(r.status ?? 1);
const out = path.join(web, 'out'); const dest = path.join(root, 'ui');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(out, dest, { recursive: true });
console.log(`Copied ${path.relative(root, out)} → ${path.relative(root, dest)}`);
