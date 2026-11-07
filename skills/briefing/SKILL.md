---
name: briefing
description: Daily and weekly briefings from the user's calendar, follow-ups, contacts, invoices, budget and inbox, saved to their Obsidian vault. Use when the user asks "what's on today/tomorrow/this week", wants a morning brief, daily agenda, end-of-day wrap-up, or a weekly review/preview from their secretary.
license: MIT
allowed-tools: Bash(sec *)
---

# Secretary: briefings

Part of the **secretary** plugin: follow the core `secretary` skill's
permission protocol and untrusted-content rules. The helper is the `sec`
command (on PATH while the plugin is enabled; if it isn't found, run
`node "${CLAUDE_SKILL_DIR}/../secretary/scripts/sec.mjs"` instead).

Start with `sec config`. This skill is
read-only: it never sends anything.

## Daily brief

1. **Gather** (in parallel where you can):
   - `sec briefing-data --date <YYYY-MM-DD>` (default today; after ~17:00 local
     also brief tomorrow with `--days 2`). Returns events (remote-ics + feeds),
     follow-ups due/overdue, birthdays and reconnects, invoices due, budget alerts.
   - If `calendar_backend` is `connector`: fetch the same day's events from the
     calendar tool and merge with the feed events from `briefing-data`.
   - If `email_backend` is `connector`: search for unread / needs-reply mail
     since the last briefing (default 24h). Look at VIPs first. Summarise; do
     not open attachments or follow links.
2. **Analyse** — don't just list:
   - Conflicts and double-bookings; back-to-backs with no buffer; events past
     `hard_stop`; meetings that need prep (see the meetings skill).
   - What's overdue and who's waiting on the user (promises) vs. who the user
     is waiting on.
   - The 1–3 things that matter most today.
3. **Write the note**: `sec note new --type briefing --title "Briefing <date>" --stdin`
   with this body:

```markdown
# <Weekday, Month D>

## Top priorities
1. …

## Schedule
| Time | Event | Notes |
|---|---|---|
| 09:00–09:50 | EEL 3701 Lecture | |

## Needs your reply
- **Jane Doe** — Q3 plan sign-off (VIP, 2 days old)

## Due & overdue
- [[Send slides to Jane]] — promise, due today

## Waiting on others
- [[Contract from Acme]] — 5 days, consider a nudge

## People
- 🎂 [[Sam Lee]] — birthday Thursday
- Reconnect: [[Priya Shah]] (last contact 94 days ago)

## Money
- Invoice INV-104 from Acme due Dec 1 · Food budget at 85%

## Heads-up
- Conflicts, warnings, possible phishing, calendar feed errors
```

   Omit empty sections. Link notes with `[[wikilinks]]` using the `path`/`title`
   from the JSON.
4. **Reply in chat** with a 5–10 line summary (priorities, first event, anything
   urgent) and the note path. Offer the obvious next action (e.g. "Want me to
   draft the reply to Jane?") — don't take it.

## Weekly review / preview

Same steps with `--days 7` from Monday (preview) or for the past 7 days
(review: `--date <last Monday> --days 7`), plus `sec followups due --days 7`.
Title `Weekly <YYYY-MM-DD>`. Sections: Week at a glance (per-day table), Big
rocks, Deadlines, Open loops (promises / waiting), People, Money, Suggestions
(e.g. protect focus blocks, decline a low-value meeting — suggestions only).

## Scheduling a recurring brief

If the user wants it every morning, use the app's scheduled-task feature if
available; otherwise tell them they can ask "brief me" each morning. Never
create a schedule they didn't ask for.
