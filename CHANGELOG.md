# Changelog

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
