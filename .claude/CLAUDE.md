# Secretary plugin — developer guide

This repo is a **Claude Code plugin** (`secretary`, marketplace `cwnaze`) plus an
**npm package** (`claude-secretary`) whose CLI installs that plugin and runs a
setup wizard. The plugin turns Claude Code into a secretary that stores all
state as Markdown in the user's Obsidian vault.

This file lives at `.claude/CLAUDE.md` rather than the repo root on purpose: the
repo root is also the plugin root, and `claude plugin validate` warns about a
root `CLAUDE.md`. Keep it here.

## Commands

```bash
npm test                         # node --test test/*.test.mjs  (must pass before any commit)
claude plugin validate .         # must say "Validation passed" (the ICON_MISSING directory warning is known/ok)
claude --plugin-dir .            # run Claude Code with the working copy loaded, no install
node skills/secretary/scripts/sec.mjs help    # the helper CLI
npm pack --dry-run               # check what ships to npm
```

Try changes against a throwaway vault, never the maintainer's real one:
`HOME=$(mktemp -d) node skills/secretary/scripts/sec.mjs init --non-interactive --vault ~/V ...`
(`HOME` isolates `~/.claude-secretary.json` and `~/.cache/claude-secretary`; tests do the same.)

## Layout

```
.claude-plugin/plugin.json       plugin manifest (name MUST stay "secretary", see Invariants)
.claude-plugin/marketplace.json  marketplace "cwnaze", one plugin, source "./" (repo root)
bin/sec                          sh wrapper → skills/secretary/scripts/sec.mjs; on Claude's PATH while the plugin is enabled
hooks/hooks.json                 PreToolUse hook on matcher "mcp__.*" → hooks/guard.mjs (exec form, ${CLAUDE_PLUGIN_ROOT})
hooks/guard.mjs                  hook entrypoint: stdin JSON → classify → decide → hookSpecificOutput JSON
cli/claude-secretary.mjs         npm bin: init | install | config | check | uninstall (shells out to `claude plugin ...`)
skills/<name>/SKILL.md           9 skills: setup, secretary (core), briefing, inbox, calendar, meetings, followups, contacts, expenses
skills/secretary/references/     settings.md (every setting), vault.md (note schemas), safety.md (permission model)
skills/secretary/scripts/sec.mjs the helper CLI (arg parsing, commands, views, ics subcommands)
skills/secretary/scripts/lib/
  config.mjs    pointer file + Settings.md loading, defaultSettings(), permission(), SETTINGS_BODY
  vault.mjs     createNote / setFields / appendToNote / findNotes / logAction / ensureLayout, TYPE_FOLDERS
  yaml.mjs      minimal frontmatter parser/serializer (flat keys, scalars, lists) that preserves unknown keys
  tz.mjs        Intl-based zone math: zonedToUtc, partsInTz, parseWhen ("today", "+3d", "2026-11-10T14:00")
  ics.mjs       RFC 5545 parse, RRULE expansion, freeSlots, byte-preserving add/rewrite/patch of VEVENTs
  calendar.mjs  remote-ics backend: read/write master file, backups, feed fetch+cache, publish, pull
  wizard.mjs    interactive (readline) or --set driven setup; discovers vaults from Obsidian's obsidian.json
  guard.mjs     pure classify(toolName, toolInput) → gated action, decide(action, level) → hook decision
  views.mjs     read-only views (followupsDue, peopleDue, invoicesDue, expenseSummary, fmtEvents, logRows, dayRecap) for sec + dashboard
  settings-api.mjs  Settings page: settingsView (redacted feeds, read-only keys), saveSettings (patch changed keys, validateSettings, version check)
  schedule.mjs  automatic briefings: launchd plists / crontab lines running `claude -p "/secretary:briefing <kind> scheduled"`
  dashboard.mjs homeData() for GET /api/home: events, briefing lead, drafts, blocked log rows, follow-ups, spend
  server.mjs    `sec ui`: 127.0.0.1-only http server, Host check, GET/HEAD except POST /api/settings (localhost Origin + JSON), serves ui/ + /api/*
web/                             Next.js (app router, TS) source of the dashboard; static export, dev deps only
ui/                              built dashboard (`npm run build:ui`), shipped in the package; commit it after UI changes
test/sec.test.mjs                all tests (unit + CLI end-to-end in temp HOMEs)
```

## How it fits together

- **State**: `~/.claude-secretary.json` (or `$SECRETARY_CONFIG`) holds only `{vault, root}`.
  Everything else is frontmatter in `<vault>/<root>/Settings.md` (default root `Secretary`).
  `loadConfig()` = `defaultSettings()` overlaid with Settings.md frontmatter.
- **Skills** never touch the vault directly; they call `sec` (`sec note new|set|append`,
  `sec find`, views, `sec ics ...`). Skill bodies say: use `sec`, else
  `node "${CLAUDE_SKILL_DIR}/../secretary/scripts/sec.mjs"`. Each skill has
  `allowed-tools: Bash(sec *)` so helper calls don't prompt.
- **`sec` contract**: JSON on stdout for data commands; errors on stderr.
  Exit codes: `0` ok, `1` error, `3` permission is `off`, `4` needs the user's confirmation
  (`--confirmed`) or a `--force` for risky edits. Skills rely on these codes. Don't change them.
- **Notes**: every note gets `type`, `tags: [<tag_prefix>/<type>]`, `created`. Placement depends on
  `organize_by`: `folders` → `TYPE_FOLDERS[type]` (expenses under `Expenses/YYYY-MM`), `tags` →
  flat in the root. Queries always go by the `type` property (`findNotes`), never by folder, which
  is why switching modes is safe. Duplicate titles get ` 2`, ` 3`.
- **Permissions**: `permission_{send_email,send_invites,contact_people,manage_calendar}` ∈ `off|ask|auto`.
  Defaults off/off/off/ask. Unknown values → `off`. Enforced in three places:
  1. `sec ics add|update|delete|publish` → `gate()` in sec.mjs (exit 3/4).
  2. `hooks/guard.mjs` on every MCP tool call: deny (off), Claude Code approval prompt (ask),
     no output (auto / unclassified / secretary not set up). Unreadable config → deny gated calls.
  3. Skill instructions (`sec can <action>` before acting) for anything the hook can't see.
- **Calendar**: `calendar_backend` is `remote-ics` (local master `.ics` → `calendar_publish_command`,
  default `npx --yes wrangler r2 object put "{bucket}/{key}" ... --remote`) or `connector`
  (MCP calendar tools; `sec ics` write commands refuse). `calendar_feeds` are read-only extra
  calendars counted as busy in `ics list/free` for both backends.

## Invariants: don't break these

1. **Plugin name** must not start with `claude-`/`anthropic-` (reserved; the plugin fails to load).
   It is `secretary`; skills are invoked as `/secretary:<skill>`. Renaming it renames every
   command and the install id `secretary@cwnaze`. Grep and update docs if you ever do.
2. **Versions** in `package.json` and `.claude-plugin/plugin.json` must match (a test checks).
   Claude Code pins users to `plugin.json`'s `version`, so bump it or users won't get updates.
3. **Zero runtime dependencies**, Node ≥ 18.17, ESM (`.mjs`). Don't add npm deps. `bin/` and the
   hook run straight from the plugin cache with no `npm install`.
4. **ICS edits are surgical**: `addEvent`/`rewriteEvent` only replace the targeted VEVENT lines.
   Every other byte (other events, VTIMEZONE, X- props, CRLF line endings) is preserved. Other
   tools (e.g. a study-scheduler) write to the same file. New events are written in UTC with
   `X-CLAUDE-SECRETARY:1`; that marker is how "ours" is detected. Foreign or recurring events need
   `--force`. Always `backup()` before `writeMain()`. `writeMain` writes tmp + rename.
5. **Never move, rename or delete vault notes** from code or skills. Edit in place, so the user's
   wikilinks keep working.
   The one exception is `claude-secretary uninstall --remove-vault`. It deletes only `<vault>/<root>`
   (never the vault itself), only when the user explicitly asks, and only after confirmation.
6. **The guard fails safe without blocking unrelated work**: no config → silent; classified +
   unreadable config → deny; unclassified → silent. Never let it throw (top-level catch). Draft,
   read and search tools must never be classified as gated.
7. **Shell safety**: `fillTemplate` refuses `"` `` ` `` `$` `\` and newlines in substituted values.
   The publish command template itself is user-owned config. `resolveNotePath` refuses paths
   outside the vault.
8. **Privacy**: no secrets, account/card numbers or tokens in the vault. Feed URLs are redacted
   (`redact()`) in all output because they often embed private tokens.
9. **SKILL.md rules** (tested): `name` == folder name, kebab-case, ≤64 chars; `description`
   ≤1024 chars and says *when* to use it; body <500 lines; every `references/...` link exists.

## Common changes, step by step

**Add a setting**
1. Default in `defaultSettings()` (config.mjs). The type of the default decides `--set` coercion.
2. Validation in `validateSettings()` (wizard.mjs) if it has a constrained value.
3. Prompt in `runWizard()` if users should be asked (optional), and in `skills/setup/SKILL.md`.
4. Document in `skills/secretary/references/settings.md` (and `SETTINGS_BODY` if user-facing).
5. Test it.

**Add a note type**
1. `TYPE_FOLDERS` in vault.mjs (folder for `organize_by: folders`).
2. Schema in `skills/secretary/references/vault.md`.
3. A view in sec.mjs if skills need one (follow `followupsDue` / `peopleDue`), plus help text.

**Add a `sec` command**: add a case in `main()` (or `icsCommand`), add a `HELP` line, keep JSON output
and the exit codes, add a CLI test using `sandbox()`.

**Add a skill**
1. `skills/<name>/SKILL.md` with frontmatter `name`, `description`, `license: MIT`,
   `allowed-tools: Bash(sec *)`.
2. Start the body with the standard header (copy from `skills/briefing/SKILL.md`: follow the core
   skill's permission protocol, `sec` on PATH or the `${CLAUDE_SKILL_DIR}` fallback).
3. Add it to the routing table in `skills/secretary/SKILL.md` and the README skills table.
4. `npm test && claude plugin validate .` and check `claude plugin details secretary` after a
   local install for the token cost.

**Teach the guard a new tool**: extend the regexes in `lib/guard.mjs` and add rows to the
`guard: classifies MCP tool calls` test, both positives and the read/draft negatives. Prefer
false negatives over blocking read-only tools.

**Change a permission default**: don't loosen `off` defaults for send_email / send_invites /
contact_people. That is the product's core promise. Update README, safety.md, settings.md and tests together.

## Dashboard

- Design direction lives in `.impeccable/surfaces/web-app-page-tsx.md` (day-to-a-page diary: navy
  cloth bar, ivory page, blue hour rules, red ribbon at now). Tokens are in `web/app/globals.css`.
- The UI is read-only except the Settings page (`POST /api/settings`, `lib/settings-api.mjs`). Never
  add a write endpoint that touches anything but `Settings.md`, and route settings writes through
  `validateSettings()`. Keys a shell or an unattended run uses (`calendar_publish_command`,
  `briefing_allowed_tools`) stay in `READ_ONLY`; feed URLs only leave the server redacted.
- Vault text (email subjects, briefing prose, names) is untrusted: render it as React text, never
  `dangerouslySetInnerHTML`.
- After changing `web/`, run `npm run build:ui` and commit `ui/` so plugin users get it.

## Release

1. Bump `version` in **both** `package.json` and `.claude-plugin/plugin.json`; add a CHANGELOG entry.
2. `npm test && claude plugin validate . && npm pack --dry-run`
3. Open a PR and merge it to `main`. `.github/workflows/release.yml` runs the tests and, if
   that version isn't on npm yet, runs `npm publish --provenance` (trusted publishing, no
   token) and creates the `vX.Y.Z` tag and GitHub release. Merges without a bump only test.
4. Plugin users update with `/plugin marketplace update cwnaze`, then
   `/plugin update secretary@cwnaze` (or `claude plugin update ...`).

## Testing locally end to end

```bash
H=$(mktemp -d); export HOME=$H
claude plugin marketplace add ./ && claude plugin install secretary@cwnaze
claude plugin details secretary          # 9 skills, 1 PreToolUse hook, token cost
node skills/secretary/scripts/sec.mjs init --non-interactive --vault "$H/V"
echo '{"tool_name":"mcp__claude_ai_Gmail__send_email","tool_input":{}}' | node hooks/guard.mjs   # → deny
```

## Known limits (good first issues)

- Editing a single occurrence of a recurring event (would need RECURRENCE-ID overrides).
- RRULE parts BYSETPOS / BYWEEKNO / BYYEARDAY are ignored (with a warning).
- The guard classifies tools by name; servers with unusual tool names may slip past it.
- No plugin icon yet (needed only for Anthropic's plugin directory: square PNG, 512–2048 px).
