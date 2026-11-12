---
name: setup
description: First-time setup or reconfiguration of the Secretary plugin — Obsidian vault, organisation mode, profile, calendar backend and feeds, and outbound permissions. Use when the user runs /secretary:setup, asks to set up or reconfigure their secretary, or when `sec config` reports no secretary config.
license: MIT
allowed-tools: Bash(sec *)
---

# Secretary setup

The helper is `sec` (or `node "${CLAUDE_SKILL_DIR}/../secretary/scripts/sec.mjs"`
if `sec` isn't on PATH). Setup writes `~/.claude-secretary.json` (vault
pointer) and `<vault>/<folder>/Settings.md` (everything else), then creates the
folder layout.

If the user prefers a terminal wizard, they can instead run
`npx claude-secretary init` in their own terminal. Otherwise do it here:

## 1. Load what exists

- `sec config` — if it succeeds, this is a reconfigure: use current values as
  defaults and only ask about what the user wants to change.
- `sec vaults` — Obsidian vaults found on this machine (from Obsidian's own
  vault list).

## 2. Ask

Use the AskUserQuestion tool where it fits (multiple choice), plain questions
otherwise. Keep it to as few rounds as possible:

1. **Vault** — which of the found vaults (or a path), and the folder for
   secretary notes (default `Secretary`).
2. **Organise by** — `folders` (sub-folders per type) or `tags` (flat folder,
   grouped by `#secretary/<type>` tags). Switching later is safe.
3. **About you** — name, timezone (default: system zone), working days and
   hours, hard stop time, writing tone, VIPs.
4. **Calendar** — `remote-ics` (Claude edits a local `.ics` and uploads it,
   default via Cloudflare R2 + wrangler, for subscriptions like Apple Calendar)
   or `connector` (Google Calendar / Outlook through Claude's connectors).
   For remote-ics: local master file path, public subscription URL, R2 bucket
   and object key, and whether to use the default wrangler upload command.
5. **Extra feeds** — read-only ICS URLs that count as busy (Canvas, shared
   calendars). Optional.
6. **Email / messaging** — connector or none for each.
7. **Permissions** — present the safe defaults and ask only if they want to
   change any: `send_email: off`, `send_invites: off`, `contact_people: off`,
   `manage_calendar: ask`. Explain off / ask / auto in one line each. Never
   suggest `auto` yourself.
8. **Automatic briefings** — a morning brief and an evening recap, written on
   their own. Ask whether they want them, and at what times / on which days
   (defaults 07:30 and 18:00, Mon–Fri). `--set briefing_morning=` (blank)
   turns one off.

## 3. Write

```bash
sec init --non-interactive --vault "/path/to/vault" --root Secretary \
  --set organize_by=folders --set name="Casey" --set timezone=America/New_York \
  --set work_days=mon,tue,wed,thu,fri --set work_start=09:00 --set work_end=17:00 \
  --set hard_stop=21:30 --set "vips=Jane Doe, boss@example.com" \
  --set calendar_backend=remote-ics --set calendar_file="/path/to/calendar.ics" \
  --set calendar_public_url="https://..." --set calendar_bucket=my-bucket \
  --set calendar_key=calendar.ics --set calendar_feeds="https://...,https://..."
```

Only pass `--set` for values the user gave; omitted keys keep their defaults or
previous values. Feed URLs often contain private tokens: don't echo them back
in full. Every key: `${CLAUDE_SKILL_DIR}/../secretary/references/settings.md`.

If they want automatic briefings, run `sec schedule install` after `sec init`
(details in the briefing skill).

## 4. Verify

1. For remote-ics with a public URL but no local file yet, offer `sec ics pull`
   to download the current calendar (it backs up anything it replaces).
2. Run the **Secretary check** from the core `secretary` skill and report what
   works and what's missing (connectors, `npx wrangler login`, etc.).
3. Finish with two or three things to try, e.g. "brief me", "what's free
   Thursday afternoon?", "triage my inbox".
