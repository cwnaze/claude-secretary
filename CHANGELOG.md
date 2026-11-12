# Changelog

## Unreleased
- `npx claude-secretary uninstall` now also removes the `cwnaze` marketplace (`--keep-marketplace` to skip). Opt-in deletes, each listed and confirmed first (`--yes` to skip the prompt): `--purge` (`~/.claude-secretary.json` and the cache), `--remove-vault` (the `Secretary/` folder in the vault, recursively) and `--remove-ics` (the local calendar file).
- Web dashboard (`sec ui`): read-only briefing page on localhost with today's hours, drafts held for your OK, blocked attempts, follow-ups due, people this week and month-to-date spend. Light and dark follow the system. Other sections are placeholders.
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
