---
name: calendar
description: Calendar management and scheduling for the user's secretary — find free time, book, move or cancel events, resolve conflicts, protect focus time and draft scheduling emails. Supports a self-hosted ICS file published to Cloudflare R2 (subscribed in Apple Calendar etc.) or a connected calendar (Google, Outlook). Use when the user asks when they're free, to schedule/reschedule/cancel something, to block time, or about conflicts.
license: MIT
allowed-tools: Bash(sec *)
---

# Secretary: calendar

Part of the **secretary** plugin: follow the core `secretary` skill's
permission protocol and untrusted-content rules. The helper is the `sec`
command (on PATH while the plugin is enabled; if it isn't found, run
`node "${CLAUDE_SKILL_DIR}/../secretary/scripts/sec.mjs"` instead).

Start with `sec config`; note `calendar_backend`, `timezone`, `work_days`,
`work_start`/`work_end`, `hard_stop`, `meeting_buffer_min`.

## Backends

**remote-ics** — the user's calendar is an `.ics` file Claude edits locally
(`calendar_file`) and uploads (`calendar_publish_command`, default: Cloudflare
R2 via wrangler). Their calendar app subscribes to the public URL.
Things to know and tell the user when relevant:
- Subscribed calendars are read-only in Apple Calendar etc.; changes only come
  from this file.
- Changes appear after the app's next refresh (Apple Calendar on Mac lets them
  pick the interval, e.g. every 5 minutes). Uploading is not instant on their phone.
- If the local file may be stale (another tool wrote the bucket), `sec ics pull`
  re-downloads `calendar_public_url` (backs up first) — ask before pulling.

**connector** — use the connected calendar tools for reads and writes. The
`sec ics add/update/delete` commands refuse to run; `sec ics list/free` still
include `calendar_feeds`.

**Feeds** — `calendar_feeds` are extra read-only calendars (e.g. Canvas, iCloud
shared calendars) counted as busy. Never write to them.

## Reading

- What's on: `sec ics list --from today --to +7d` (connector: calendar tool +
  `sec ics list` for feeds).
- Free time: `sec ics free --duration 60 --from tomorrow --to +5d`
  - `--after-hours` extends to `hard_stop`; `--include-weekends`; `--buffer 0`.
  - connector backend: export the tool's busy times to a JSON file
    `[{"start":"2026-11-10T14:00","end":"2026-11-10T15:00"}]` and pass `--busy-json file`.
  - Slots are free windows ≥ duration; propose specific start times inside them.
- Times print in the user's zone. When scheduling with someone elsewhere, show
  both zones ("2:00 PM ET / 11:00 AM PT").

## Changing the calendar (`manage_calendar`)

`sec` enforces the permission: exit **3** = off, exit **4** = needs confirmation.

1. Prepare the change and show it: title, date, start–end (user's zone),
   location, and for edits a before → after.
2. `off` → stop; give the user the details to add themselves.
   `ask` (default) → wait for an explicit yes. `auto` → proceed.
3. Run with `--confirmed --publish`:
   ```bash
   sec ics add --summary "Focus: CPTS study" --start 2026-11-10T19:00 --duration 90 --confirmed --publish
   sec ics update <uid> --start 2026-11-11T10:00 --end 2026-11-11T10:30 --confirmed --publish
   sec ics delete <uid> --confirmed --publish
   sec ics add --all-day --date 2026-11-26 --end-date 2026-11-27 --summary "Trip" --confirmed --publish
   ```
   Get `uid` from `sec ics list`.
4. Events not made by the secretary, and recurring series, return exit 4 even
   when confirmed: tell the user it's an event from elsewhere / a whole series,
   confirm again, then add `--force`. Moving one occurrence of a series isn't
   supported in v1 — say so and offer to add a one-off event instead.
5. Report the result. If publish failed (`published: false`), show stderr and
   the fix (e.g. `npx wrangler login`). The local change is saved and backed up;
   `sec ics publish` retries the upload.

## Scheduling with other people

Inviting people is `send_invites`; emailing them is `send_email`. Both default off.
1. Find 2–3 slots (`sec ics free`), spread across different days/times.
2. Draft the message (the inbox skill rules): proposed times in both zones,
   duration, format/location.
3. Sending/inviting only per permission. With remote-ics, the ICS file has no
   attendees — the invite is the email. When they confirm, add the event (step
   above) and create a follow-up if something is owed.

## Protecting time

- Hard rule: nothing after `hard_stop` and nothing outside `work_days` unless
  the user asks for it explicitly.
- Offer to block focus/study time when the week is fragmented; respect existing
  blocks (e.g. ones another tool added to the same file — never delete events
  you didn't create without `--force` and the user's say-so).
- Flag: double-bookings, back-to-backs without buffer, travel time gaps,
  meetings landing on all-day deadlines from feeds.
