---
name: briefing
description: Morning, evening and weekly briefings from the user's calendar, follow-ups, contacts, invoices, budget and inbox, saved to their Obsidian vault, and the schedule that runs them automatically. Use when the user asks "what's on today/tomorrow/this week", wants a morning brief, daily agenda, evening recap or end-of-day wrap-up, a weekly review/preview, or wants briefs generated automatically every morning/evening.
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

**Arguments.** `morning` → morning brief, `evening` → evening recap. With
neither, pick by local time: before 15:00 morning, otherwise evening.
`scheduled` means an unattended run (see the end of this file).

## Morning brief: what to do today

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
3. **Write the note**: `sec note new --type briefing --title "Briefing <date>" --field date=<date> --field kind=morning --stdin`
   with this body. Right under the `#` heading, write one plain sentence (no list) that says
   what the day is about: the dashboard shows it as the brief's summary.

```markdown
# <Weekday, Month D>

Two things need you today: the Q3 sign-off and slides for Jane by 3.

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

## Evening recap: what got done, what's left

1. **Gather**:
   - `sec briefing-data --recap` — today's data plus `recap`: `log` (actions
     taken today), `completed` (follow-ups marked done/dropped today), `created`
     (meetings, drafts, expenses, follow-ups added today).
   - `sec briefing-data --date <next day in briefing_days, else work_days>` for
     the preview (Friday evening previews Monday).
   - This morning's brief, if any: `sec find --type briefing --where date=<today> --where kind=morning`.
     Compare its Top priorities with what actually happened.
   - Connectors as in the morning brief (today's events; mail that arrived
     today and still needs a reply).
2. **Analyse**: what got done; what slipped (morning priorities not done,
   follow-ups due today still open, unanswered mail, drafts still waiting for
   the user's OK); what that pushes onto tomorrow.
3. **Write the note**: `sec note new --type briefing --title "Briefing <date> evening" --field date=<date> --field kind=evening --stdin`:

```markdown
# <Weekday, Month D> — evening

Most of today landed; the Acme contract is the one thing that carries over.

## Done today
- Met with [[2026-11-12 Design review|design review]] · sent recap
- [[Send slides to Jane]] ✓

## Left over
- [[Contract from Acme]] — still waiting, 6 days; nudge tomorrow?
- Reply to Sam (arrived 14:10)

## Drafts waiting for you
- [[Re lease]] — to the landlord

## Tomorrow
| Time | Event | Notes |
|---|---|---|
| 09:00–09:50 | EEL 3701 Lecture | |

- First thing: …
```

   Omit empty sections. If nothing is left over, say so in one line; that's
   the good news.
4. **Reply in chat** with 3–6 lines: what's left and tomorrow's first thing.

## Weekly review / preview

Same steps with `--days 7` from Monday (preview) or for the past 7 days
(review: `--date <last Monday> --days 7`), plus `sec followups due --days 7`.
Title `Weekly <YYYY-MM-DD>`. Sections: Week at a glance (per-day table), Big
rocks, Deadlines, Open loops (promises / waiting), People, Money, Suggestions
(e.g. protect focus blocks, decline a low-value meeting — suggestions only).

## Automatic briefs (scheduled runs)

`sec schedule install` makes the system scheduler (launchd on macOS, crontab on
Linux) run `claude -p "/secretary:briefing morning scheduled"` at
`briefing_morning` and `... evening scheduled` at `briefing_evening`, on
`briefing_days`. Only tools in `briefing_allowed_tools` are allowed (default
`Bash(sec *)`); add the connector's *read* tools there to include mail and
connector calendars. `sec schedule` shows what's wanted and what's installed;
`sec schedule remove` turns it off. Only install or change the schedule when
the user asks; settings changes need `sec schedule install` again.

When the arguments include `scheduled`, nobody is watching:
- First `sec find --type briefing --where date=<today> --where kind=<kind>`. If
  one exists, stop: say so in one line and write nothing.
- Don't ask questions or offer next actions; use only the tools you're allowed
  and note in Heads-up what you couldn't check (e.g. "Email not checked:
  connector tools not allowed in scheduled runs").
- Write the note as usual, passing the body as a heredoc on the `sec` command
  itself (`sec note new ... --stdin <<'EOF'`) so it matches `Bash(sec *)`.
  The chat reply is one line with the note path.

## Turning automatic briefs on

If the user wants briefs every morning/evening: confirm the times and days
(`sec config` → `briefing_*`), change them with
`sec init --non-interactive --set briefing_morning=07:00` etc. (blank turns
one off), then `sec schedule install` and report what it installed and where
the run logs go (`~/.cache/claude-secretary/briefing-<kind>.log`). Mention that
each run uses Claude usage like a normal chat, and the computer must be on (a
Mac that was asleep runs the missed brief when it wakes). Never create a
schedule they didn't ask for.
