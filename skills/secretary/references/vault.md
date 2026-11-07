# Vault conventions and note schemas

Every note the secretary creates has:

```yaml
type: <type>                 # what the scripts query on
tags: [<prefix>/<type>, ...] # e.g. secretary/followup
created: 2026-11-07T16:50
```

`sec note new --type <type> --title "<title>" --field k=v ...` adds these for you.
Field values: numbers and `true`/`false` are typed automatically; `[a, b]` makes
a list; `key+=value` (repeatable) builds a list item by item, which is the way
to make a list of wikilinks: `--field 'attendees+=[[Jane Doe]]' --field 'attendees+=[[Sam Lee]]'`.
Quote wikilinks in the shell: `--field 'counterpart=[[Jane Doe]]'`.

`sec find --where k=v` matches exact values; `a|b` means either; a property
that is missing matches `false` or an empty alternative (`status=open|`).

## Where notes go

| type | organize_by: folders | organize_by: tags |
|---|---|---|
| briefing | `Briefings/` | root |
| triage | `Inbox/` | root |
| draft | `Inbox/Drafts/` | root |
| meeting | `Meetings/` | root |
| followup | `Follow-ups/` | root |
| person | `People/` | root |
| expense | `Expenses/YYYY-MM/` | root |
| invoice | `Expenses/Invoices/` | root |
| budget | `Expenses/` | root |
| note | `Notes/` | root |

Attachments (receipts): `Expenses/Receipts/` (folders) or `Attachments/` (tags).
`Settings.md` and `Log.md` are always at the root.

Titles become file names; duplicates get ` 2`, ` 3`…

## Schemas

**followup**
```yaml
kind: todo | promise | waiting_on   # promise = user owes someone; waiting_on = someone owes the user
status: open | waiting | done | dropped
due: 2026-11-12
counterpart: "[[Jane Doe]]"         # who it's for / from
source: "[[2026-11-07 Standup]]"    # or "email: Re: Q3 plan"
last_nudged: 2026-11-10             # waiting_on only
```

**person** (title = full name)
```yaml
aliases: [Jane, jane@acme.com]
email: jane@acme.com
org: Acme
role: Head of Ops
relationship: client | colleague | friend | family | vendor | ...
birthday: 1990-05-04        # or 05-04 if year unknown
last_contact: 2026-10-30
cadence_days: 30            # omit for no keep-in-touch reminders
```
Body: how you know them, preferences, running notes (append dated bullets).
Never store ID numbers, account numbers, health or other sensitive personal details.

**meeting** (title = `YYYY-MM-DD <name>`)
```yaml
date: 2026-11-10T14:00
attendees: ["[[Jane Doe]]", "[[Sam Lee]]"]
event_uid: abc@claude-secretary   # if from the calendar
status: prep | held
```
Body sections: Agenda, Brief, Notes, Decisions, Action items.

**expense**
```yaml
date: 2026-11-05
vendor: Blue Bottle
amount: 12.50
currency: USD
category: food
payment: personal card | company card | cash   # never the card number
reimbursable: true
reimbursed: false
attachment: "[[Blue Bottle 2026-11-05.jpg]]"
```

**invoice**
```yaml
direction: payable | receivable
counterparty: "[[Acme]]"
number: INV-104
amount: 1200
currency: USD
issued: 2026-11-01
due: 2026-12-01
status: draft | sent | open | paid | overdue | void
```

**budget** — one note; properties `limit_<category>: <monthly amount>`.

**briefing** (title = `Briefing YYYY-MM-DD`), **triage** (title = `Triage YYYY-MM-DDTHHMM`),
**draft** (fields: `to`, `cc`, `subject`, `channel: email|slack|sms`, `status: draft|sent|discarded`, `in_reply_to`).
