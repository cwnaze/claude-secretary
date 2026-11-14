# Changelog

## Unreleased
- Dashboard Settings page (#14): edit permissions, profile, working hours, calendar (backend, file, feeds, Apple Calendar), briefing times and vault options from `sec ui`. `POST /api/settings` patches only the changed keys in `Settings.md` (body and unknown keys kept), runs `validateSettings()`, refuses a save if the note changed since the page loaded, and needs a localhost Origin and a JSON body. The upload command and `briefing_allowed_tools` stay read-only there; feed links are shown redacted and edited by add/remove.
- `validateSettings()` also checks `work_days`, the minute/day numbers, and `email_backend`/`messaging_backend`.
- Setup finds Obsidian vaults in iCloud Drive automatically: Obsidian's iCloud folder and any vault elsewhere in iCloud Drive, on macOS and with iCloud for Windows. `sec vaults` now returns `[{path, icloud}]`.
- Apple Calendar: on macOS, `calendar_apple: macos` reads Calendar.app through EventKit (via `osascript`, no dependencies) as busy time in `ics list`, `ics free`, briefings and the dashboard; `calendar_apple_names` limits which calendars. New `sec apple status|access|calendars`; `sec check` reports access. On other systems, iCloud calendars are added as public `webcal://` feeds.
- `ics list` / `ics free` no longer fail when the local calendar file is missing but feeds or Apple Calendar are configured; they warn and show the other calendars.
- Automatic briefings (#16): a morning brief (what to do today) and an evening recap (done today, left over, tomorrow) on a schedule. New settings `briefing_morning`, `briefing_evening`, `briefing_days`, `briefing_allowed_tools`; `sec schedule [show|install|remove]` manages launchd agents (macOS) or crontab lines (Linux) that run `claude -p "/secretary:briefing <kind> scheduled"`. Scheduled runs skip a day that already has its brief. `uninstall` removes the jobs.
- `sec briefing-data --recap` adds the day's log, completed follow-ups and new notes; `--date` accepts `tomorrow`/`+1d`.
- `npx claude-secretary uninstall` now also removes the `cwnaze` marketplace (`--keep-marketplace` to skip). Opt-in deletes, each listed and confirmed first (`--yes` to skip the prompt): `--purge` (`~/.claude-secretary.json` and the cache), `--remove-vault` (the `Secretary/` folder in the vault, recursively) and `--remove-ics` (the local calendar file).
- Web dashboard (`sec ui`): read-only briefing page on localhost with today's hours, drafts held for your OK, blocked attempts, follow-ups due, people this week and month-to-date spend. Light and dark follow the system. Other sections are placeholders.
- Dashboard home page (#8): the full briefing (first section shown, the rest folded), the latest inbox triage (counts per bucket, urgent and reply threads), and assignment due times. Canvas assignments show in a "Due" list with their times (all-day ones are due 11:59 pm) and as markers on the hour grid, and no longer count as busy. Clicking any event opens its details: location, join-call and event links, description, the meeting note and its open follow-ups. The Schedule and Follow-ups placeholder pages are gone.
- `lib/views.mjs` holds the read-only views shared by `sec` and the dashboard; `lib/dashboard.mjs` and `lib/server.mjs` are new.

## 1.0.0 — 2026-11-07
First release.
- Claude Code plugin `secretary` (marketplace `cwnaze`): skills setup, secretary, briefing, inbox, calendar, meetings, followups, contacts, expenses; `sec` helper on PATH via `bin/`.
- PreToolUse guard hook enforcing the outbound permissions on MCP tools (deny for off, Claude Code approval prompt for ask).
- `npx claude-secretary init` installs the plugin through the `claude` CLI and runs the setup wizard (interactive, or `--set` flags; `/secretary:setup` does it in chat).
- Obsidian storage with `organize_by: folders | tags`; every note carries a `type` property.
- Permissions `off | ask | auto` for send_email, send_invites, contact_people (default off) and manage_calendar (default ask).
- Calendar backends: remote-ics (local master file + configurable upload, default Cloudflare R2 via wrangler) and connector; extra read-only feeds.
- ICS engine: RRULE (DAILY/WEEKLY/MONTHLY/YEARLY, BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL), EXDATE, RECURRENCE-ID, TZID with DST; byte-preserving edits; backups.

Known limits: the guard matches MCP tools by name; editing a single occurrence of a recurring event isn't supported; BYSETPOS/BYWEEKNO/BYYEARDAY are ignored.
