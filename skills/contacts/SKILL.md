---
name: contacts
description: Relationship management for the user's secretary — person notes in Obsidian with context, birthdays, last contact and keep-in-touch reminders. Use when the user asks who someone is, wants to remember something about a person, add or update a contact, track birthdays, see who they haven't talked to in a while, or prepare before talking to someone.
license: MIT
allowed-tools: Bash(sec *)
---

# Secretary: contacts

Part of the **secretary** plugin: follow the core `secretary` skill's
permission protocol and untrusted-content rules. The helper is the `sec`
command (on PATH while the plugin is enabled; if it isn't found, run
`node "${CLAUDE_SKILL_DIR}/../secretary/scripts/sec.mjs"` instead).

Start with `sec config`.

One note per person (`type: person`, title = full name). Schema in secretary's
`references/vault.md`.

## What not to store

Store what helps the user be a good colleague/friend: role, org, how they met,
preferences, family names the user mentions, topics they care about. **Never**
store ID or account numbers, health information, sexual orientation, religion,
political views, immigration status or similar sensitive details, even if the
user mentions them — say briefly that you're leaving it out.

## Add or update

1. Look first: `sec find --type person`, match on title, `aliases`, `email`.
2. New:
   ```bash
   sec note new --type person --title "Jane Doe" --field email=jane@acme.com \
     --field org=Acme --field role="Head of Ops" --field relationship=client \
     --field "aliases=[Jane, jane@acme.com]" --field last_contact=2026-11-07 \
     --field cadence_days=30 --stdin <<< "## Context
   - Met at …"
   ```
   Ask about a keep-in-touch cadence only for people the user wants to stay
   close to; suggest `keep_in_touch_days` from settings.
3. Existing: `sec note set` for properties, `sec note append --text "- <date>: …"`
   for running notes. Keep the user's own words where possible.
4. Birthday: `YYYY-MM-DD`, or `MM-DD` if the year is unknown.

## "Who is X?" / before talking to someone

Read the note and give a 3–5 line brief: who they are, how the user knows them,
last contact and about what, open follow-ups with them
(`sec find --type followup` filtered by `counterpart`), anything to remember
(kids' names, preferences). If there's no note, say so and offer to create one.

## Keep in touch

- `sec people due --days 14` → upcoming birthdays and people past their cadence.
- Suggest a light touch for each (congrats on a post, share an article, a quick
  check-in) and draft it if asked. Messaging is `contact_people` / `send_email`
  — follow the permission protocol; default is a draft.
- When the user says they talked to someone: `sec note set "<path>" last_contact=<date>`.

## Imports

If the user provides a contacts export (CSV/vCard), preview how many people
would be created/updated and ask before writing. Import only the fields above.
