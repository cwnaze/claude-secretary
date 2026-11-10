# Secretary — a Claude Code plugin

Turns Claude Code (terminal or desktop) into your secretary: daily briefings,
inbox triage, calendar, meetings, follow-ups, contacts and expenses, with
everything stored as plain Markdown in your **Obsidian** vault.

**Nothing goes out in your name unless you allow it.** Sending email, sending
invites and messaging people are **off by default** and Claude drafts instead.
Calendar edits are **ask** by default. A hook enforces these rules on every
MCP tool call, so they don't depend on Claude remembering them.

## Install

From your terminal:

```bash
npx claude-secretary init
```

This installs the plugin with the `claude` CLI and then runs the setup wizard:
vault, organisation mode, profile, calendar, extra feeds and permissions.

Or from inside Claude Code:

```
/plugin marketplace add cwnaze/claude-secretary
/plugin install secretary@cwnaze
/secretary:setup
```

Requires Claude Code, Node 18+ and an Obsidian vault (any version; the vault is
just a folder). In a session that was already running, run `/reload-plugins`.

## Skills

| Command | What it does |
|---|---|
| `/secretary:setup` | First-time setup and reconfiguration, done in the chat |
| `/secretary:secretary` | Core: settings, permissions, routing, "secretary check" |
| `/secretary:briefing` | Daily brief and weekly review/preview, saved to `Briefings/` |
| `/secretary:inbox` | Triage (urgent/reply/delegate/waiting/FYI/archive/suspicious), reply drafts, gatekeeping |
| `/secretary:calendar` | Free-time search, booking/moving/cancelling, conflicts, scheduling drafts |
| `/secretary:meetings` | Prep briefs and agendas, minutes, action items → follow-ups, recap drafts |
| `/secretary:followups` | To-dos, promises you made, things you're waiting on, nudges, weekly review |
| `/secretary:contacts` | Person notes, birthdays, last contact, keep-in-touch reminders |
| `/secretary:expenses` | Receipts, reimbursements, invoices/bills, monthly budget |

You don't have to type the commands: "brief me", "when am I free Thursday?" or
"triage my inbox" load the right skill on their own.

## Permissions

Each is `off` (draft only), `ask` (Claude Code's approval prompt) or `auto`
(your normal Claude Code permission settings apply).

| Setting | Default | Guarded MCP tools (by name) |
|---|---|---|
| `permission_send_email` | off | send / reply / forward on mail servers (Gmail, Outlook, …) |
| `permission_send_invites` | off | calendar writes with attendees, RSVP / respond |
| `permission_contact_people` | off | send / post on Slack, Teams, Discord, SMS, … |
| `permission_manage_calendar` | ask | create / update / delete events; `sec ics` writes |

Change them in `Secretary/Settings.md`, with `/secretary:setup` or with
`npx claude-secretary config`. Every outbound or calendar action, and every
blocked attempt, is written to `Secretary/Log.md`.

The guard (`hooks/guard.mjs`, a `PreToolUse` hook on `mcp__.*`) applies in
**every** Claude Code session once the plugin is enabled and setup has been
run. Before setup it does nothing. Draft, search and read tools are never
blocked. It matches tools by name, so a server with unusual tool names may
slip past it. Please open an issue if you find one.

Email, invites, messages, documents and transcripts are treated as untrusted:
Claude won't follow instructions found inside them and flags likely phishing.

## Calendar

Two backends:

- **remote-ics** — you own an `.ics` file that calendar apps subscribe to (for
  example in a Cloudflare R2 bucket, subscribed in Apple Calendar). Claude edits
  a local master copy and uploads it with
  `wrangler r2 object put … --remote`. The upload command is configurable, so
  rclone, the AWS CLI or anything else works. Edits touch only the events being
  changed (other tools' events stay byte-for-byte identical). Every write is
  backed up, and events Claude didn't create need an extra confirmation.
  Subscribed calendars are read-only in your calendar app, and changes appear
  on its next refresh.
- **connector** — Google Calendar, Outlook and similar, through Claude's
  connectors or MCP servers.

With either backend you can add extra read-only feeds (Canvas, shared iCloud
calendars…) that count as busy time.

## Vault layout

Pick `organize_by: folders` or `tags` in setup:

```
Secretary/                      Secretary/   (tags mode: flat, grouped by
  Settings.md  Log.md             Settings.md   #secretary/<type> tags)
  Briefings/   Inbox/Drafts/      Log.md
  Meetings/    Follow-ups/        Send slides to Jane.md
  People/      Expenses/2026-11/  Jane Doe.md
               Expenses/Invoices/ ...
```

Every note has a `type` property, so you can switch modes at any time and
nothing breaks. Notes are never moved or renamed, so your links keep working.

## Connections

Email, calendar and Slack come from Claude, not from this plugin:

- **claude.ai connectors** you enable at claude.ai/customize/connectors show up
  in Claude Code when you're signed in with a claude.ai account. `/mcp` lists
  them and can turn them off per project.
- **MCP servers** you add with `claude mcp add`.

Ask Claude for a "secretary check" to see what's connected and what's missing.

## The `sec` helper

While the plugin is enabled, `sec` is on Claude's PATH (from `bin/`). It is a
zero-dependency Node CLI (`sec help`) for notes and views (`followups due`,
`people due`, `invoices due`, `expenses summary`, `briefing-data`). It also
handles ICS: RRULE, EXDATE, RECURRENCE-ID, TZID/DST, free-slot search, editing
and publishing.

## Dashboard

`sec ui` serves a read-only dashboard at `http://localhost:7410/` (`--port` to change it,
`--open` to open your browser). The home page is today's briefing: your day ruled by the hour
with the current time marked, drafts held for your OK, blocked send attempts, follow-ups due,
people to reach this week, and this month's spend. Rows open the note in Obsidian. The other
sections aren't built yet.

The server only listens on 127.0.0.1, refuses requests for any other host name, and never writes
to the vault. It follows your system's light or dark setting.

## Development

```bash
npm test
claude plugin validate .
claude --plugin-dir .        # try it without installing
npm run build:ui             # build web/ (Next.js static export) into ui/, which ships
npm run dev:ui               # Next dev server on :7411; proxies /api to a running `sec ui`
```

Next and React are dev dependencies only. The built `ui/` is plain files served by `sec ui`
with Node's `http` module, so the plugin still needs no `npm install`.

## License

MIT
