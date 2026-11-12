// Automatic morning/evening briefings: a launchd agent (macOS) or crontab lines
// (Linux) that run `claude -p "/secretary:briefing <kind> scheduled"` at the
// times in Settings.md. The job calls `claude` directly, never a path inside the
// plugin cache, so plugin updates don't break it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const KINDS = ['morning', 'evening'];
export const LABEL = 'com.cwnaze.claude-secretary.briefing';
const CRON_MARK = '# claude-secretary briefing';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function scheduler() {
  const forced = process.env.SECRETARY_SCHEDULER;
  if (forced) return forced;
  if (process.platform === 'darwin') return 'launchd';
  if (process.platform === 'linux' || process.platform.endsWith('bsd')) return 'cron';
  return 'none';
}

// Values that end up in a crontab line or a plist; refuse anything that could break out of quoting.
export function unsafeValue(v) { return /['"`$\\%\n\r<>&]/.test(String(v)); }

// The jobs Settings.md asks for. A blank or "off" time disables that brief.
export function briefingJobs(settings) {
  const days = (settings.briefing_days || []).map((d) => DAYS.indexOf(String(d).toLowerCase().slice(0, 3))).filter((d) => d >= 0);
  const jobs = [];
  for (const kind of KINDS) {
    const t = String(settings[`briefing_${kind}`] ?? '').trim();
    const m = t.match(TIME);
    if (!m || !days.length) continue;
    jobs.push({ kind, time: t, hour: +m[1], minute: +m[2], weekdays: [...new Set(days)].sort() });
  }
  return jobs;
}

export function claudeArgs(kind, settings) {
  const tools = (settings.briefing_allowed_tools || []).map(String).filter(Boolean);
  for (const t of tools) if (unsafeValue(t)) throw new Error(`briefing_allowed_tools entry "${t}" contains characters that aren't allowed`);
  return [
    '-p', `/secretary:briefing ${kind} scheduled`,
    '--permission-mode', 'dontAsk',
    ...(tools.length ? ['--allowedTools', ...tools] : []),
  ];
}

export function findClaude() {
  const r = spawnSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' });
  const p = r.status === 0 ? r.stdout.trim() : '';
  return p && path.isAbsolute(p) ? p : null;
}

function logPath(kind) {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, 'claude-secretary', `briefing-${kind}.log`);
}

// launchd and cron start jobs with a bare PATH; give them node's and claude's dirs.
function jobPath(claude) {
  const dirs = [path.dirname(claude), path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  return [...new Set(dirs)].join(':');
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function launchAgentsDir() { return path.join(os.homedir(), 'Library', 'LaunchAgents'); }
export function plistPath(kind) { return path.join(launchAgentsDir(), `${LABEL}.${kind}.plist`); }

export function plist(job, { claude, cwd, settings }) {
  const args = [claude, ...claudeArgs(job.kind, settings)];
  const intervals = job.weekdays.map((d) => `    <dict><key>Weekday</key><integer>${d}</integer><key>Hour</key><integer>${job.hour}</integer><key>Minute</key><integer>${job.minute}</integer></dict>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}.${job.kind}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${xml(cwd)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(jobPath(claude))}</string>
    <key>HOME</key><string>${xml(os.homedir())}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
${intervals.join('\n')}
  </array>
  <key>StandardOutPath</key><string>${xml(logPath(job.kind))}</string>
  <key>StandardErrorPath</key><string>${xml(logPath(job.kind))}</string>
</dict>
</plist>
`;
}

export function cronLine(job, { claude, cwd, settings }) {
  const q = (s) => `'${s}'`;
  for (const v of [claude, cwd, logPath(job.kind), jobPath(claude)]) {
    if (unsafeValue(v)) throw new Error(`Path "${v}" contains characters that can't go in a crontab line`);
  }
  const cmd = [q(claude), ...claudeArgs(job.kind, settings).map(q)].join(' ');
  return `${job.minute} ${job.hour} * * ${job.weekdays.join(',')} cd ${q(cwd)} && PATH=${q(jobPath(claude))} ${cmd} >> ${q(logPath(job.kind))} 2>&1 ${CRON_MARK} ${job.kind}`;
}

function readCrontab() {
  const r = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}

function writeCrontab(text) {
  const r = spawnSync('crontab', ['-'], { input: text, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`crontab failed: ${(r.stderr || '').trim()}`);
}

const stripOurs = (text) => text.split('\n').filter((l) => !l.includes(CRON_MARK)).join('\n').replace(/\n+$/, '');

function launchctl(...args) {
  return spawnSync('launchctl', args, { encoding: 'utf8' });
}

// What's installed right now, without changing anything.
export function installedJobs() {
  const kind = scheduler();
  if (kind === 'launchd') return KINDS.filter((k) => fs.existsSync(plistPath(k))).map((k) => ({ kind: k, file: plistPath(k) }));
  if (kind === 'cron') {
    return readCrontab().split('\n').filter((l) => l.includes(CRON_MARK)).map((l) => ({ kind: l.split(CRON_MARK).pop().trim(), line: l }));
  }
  return [];
}

// Replace any existing secretary jobs with the ones in Settings.md.
export function installSchedule({ settings, cwd, claude, dryRun = false }) {
  const kind = scheduler();
  const jobs = briefingJobs(settings);
  if (kind === 'none') throw new Error(`Automatic briefings aren't supported on ${process.platform} yet. Use your system's task scheduler to run: claude ${claudeArgs('morning', settings).join(' ')}`);
  if (!claude) throw new Error('Could not find the `claude` command. Pass --claude /path/to/claude.');
  const ctx = { claude, cwd, settings };

  if (kind === 'launchd') {
    const files = jobs.map((j) => ({ kind: j.kind, file: plistPath(j.kind), content: plist(j, ctx) }));
    if (dryRun) return { scheduler: kind, dry_run: true, jobs, files };
    removeSchedule();
    fs.mkdirSync(launchAgentsDir(), { recursive: true });
    fs.mkdirSync(path.dirname(logPath('morning')), { recursive: true });
    const uid = process.getuid();
    for (const f of files) {
      fs.writeFileSync(f.file, f.content);
      const r = launchctl('bootstrap', `gui/${uid}`, f.file);
      if (r.status !== 0) throw new Error(`launchctl bootstrap ${f.file} failed: ${(r.stderr || '').trim()}`);
    }
    return { scheduler: kind, jobs, files: files.map((f) => f.file) };
  }

  const lines = jobs.map((j) => cronLine(j, ctx));
  if (dryRun) return { scheduler: kind, dry_run: true, jobs, lines };
  const rest = stripOurs(readCrontab());
  writeCrontab([rest, ...lines].filter(Boolean).join('\n') + '\n');
  return { scheduler: kind, jobs, lines };
}

// Remove every secretary briefing job. Needs no config, so uninstall can always run it.
export function removeSchedule({ dryRun = false } = {}) {
  const kind = scheduler();
  const found = installedJobs();
  if (dryRun || !found.length) return { scheduler: kind, dry_run: dryRun || undefined, removed: [], found };
  if (kind === 'launchd') {
    const uid = process.getuid();
    for (const j of found) { launchctl('bootout', `gui/${uid}/${LABEL}.${j.kind}`); fs.rmSync(j.file, { force: true }); }
  } else if (kind === 'cron') {
    const rest = stripOurs(readCrontab());
    if (rest.trim()) writeCrontab(`${rest}\n`);
    else spawnSync('crontab', ['-r']);
  }
  return { scheduler: kind, removed: found.map((j) => j.kind) };
}
