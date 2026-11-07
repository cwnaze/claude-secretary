---
name: followups
description: Tracks the user's to-dos, promises they've made to others, and things they're waiting on from others, as notes in their Obsidian vault, and drafts nudges when replies are overdue. Use when the user says "remind me", "add a to-do", "I told X I'd…", "I'm waiting on…", asks what's due/overdue or what they owe people, wants to chase someone, mark something done, or do a weekly review.
license: MIT
allowed-tools: Bash(sec *)
---

# Secretary: follow-ups

Part of the **secretary** plugin: follow the core `secretary` skill's
permission protocol and untrusted-content rules. The helper is the `sec`
command (on PATH while the plugin is enabled; if it isn't found, run
`node "${CLAUDE_SKILL_DIR}/../secretary/scripts/sec.mjs"` instead).

Start with `sec config`.

One note per item (`type: followup`). Three kinds:

| kind | Meaning | Example title |
|---|---|---|
| `todo` | Something the user needs to do | Renew passport |
| `promise` | The user owes someone | Send slides to Jane |
| `waiting_on` | Someone owes the user | Contract from Acme |

Status: `open` → (`waiting`) → `done` or `dropped`. Schema: secretary's
`references/vault.md`.

## Capture

From chat, email (the inbox skill), or meetings (the meetings skill):
1. Check for duplicates: `sec find --type followup --where status=open|waiting`.
2. Create:
   ```bash
   sec note new --type followup --title "Send slides to Jane" \
     --field kind=promise --field status=open --field due=2026-11-12 \
     --field 'counterpart=[[Jane Doe]]' --field "source=email: Re: Q3 plan"
   ```
   - Short imperative titles. Resolve "Friday", "next week", "end of month" to
     a date in the user's timezone and say the date back.
   - No due date given: ask once for a date; if they don't care, leave it out.
   - Put context (links, what exactly was promised) in the body.
3. Confirm in one line: "Added: Send slides to Jane — due Thu Nov 12."

## Review

- Due/overdue: `sec followups due` (today) or `--days 7`.
- Everything open: `sec find --type followup --where status=open|waiting`.
- Present grouped: **Overdue**, **Due soon**, **You owe** (promises),
  **Waiting on others**, **No date**. Oldest first. Suggest dropping stale items
  rather than letting the list rot.

## Updating

- Done: `sec note set "<path>" status=done` (also `completed=<date>`).
- Snooze: `sec note set "<path>" due=<new date>`.
- Add context: `sec note append "<path>" --text "- 2026-11-08: Jane said Monday is fine"`.
Never delete follow-up notes; `dropped` keeps the history.

## Nudges (waiting_on)

When a `waiting_on` item is overdue (or ≥ 3 working days with no reply):
1. Draft a short, friendly nudge: reference the original ask and date, make it
   easy to answer, no guilt-tripping.
2. Channel: email → `send_email`; Slack/SMS etc. → `contact_people`. Follow the
   permission protocol — the default is a draft only.
3. After sending (or the user says they sent it):
   `sec note set "<path>" last_nudged=<date> due=<date + 3 working days>`.
Don't nudge the same person more than once every few working days unless the
user asks.

## Weekly review

Run through: overdue → this week → waiting on others (nudge candidates) → no
date (date it or drop it) → done this week (a quick win list). Offer to put
time for big items on the calendar (the calendar skill).
