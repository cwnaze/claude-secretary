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
vault (Obsidian's vault list plus any vaults in iCloud Drive), organisation mode,
profile, calendar, Apple Calendar, extra feeds and permissions.

Or from inside Claude Code:

```
/plugin marketplace add cwnaze/claude-secretary
/plugin install secretary@cwnaze
/secretary:setup
```

Requires Claude Code, Node 18+ and an Obsidian vault (any version; the vault is
just a folder). In a session that was already running, run `/reload-plugins`.

### Uninstall

```bash
npx claude-secretary uninstall                 # plugin + the cwnaze marketplace
npx claude-secretary uninstall --purge         # also ~/.claude-secretary.json and the cache
npx claude-secretary uninstall --remove-vault  # also <vault>/Secretary and every note in it
npx claude-secretary uninstall --remove-ics    # also the local calendar file (calendar_file)
```

By default your vault and calendar file are left alone. The flags combine.
`--remove-vault` deletes only the secretary's folder (`Secretary/` and everything
under it, in either organisation mode). The rest of the vault is never touched.
`--remove-ics` deletes the local master `.ics` file but not the published copy
(e.g. on R2). If another tool writes to the same file, it loses it too. The cache
holds feed copies and calendar backups. Any deleting flag lists what it will
remove and asks first (pass `--yes` in scripts). Add `--keep-marketplace` to
leave the marketplace registered, or `--scope` if you installed at project or
local scope. From inside Claude Code: `/plugin uninstall secretary@cwnaze`, then
`/plugin marketplace remove cwnaze`.

## Skills

| Command | What it does |
|---|---|
| `/secretary:setup` | First-time setup and reconfiguration, done in the chat |
| `/secretary:secretary` | Core: settings, permissions, routing, "secretary check" |
| `/secretary:briefing` | Morning brief, evening recap and weekly review/preview, saved to `Briefings/`; can run on a schedule |
| `/secretary:inbox` | Triage (urgent/reply/delegate/waiting/FYI/archive/suspicious), reply drafts, gatekeeping |
| `/secretary:calendar` | Free-time search, booking/moving/cancelling, conflicts, scheduling drafts |
| `/secretary:meetings` | Prep briefs and agendas, minutes, action items → follow-ups, recap drafts |
| `/secretary:followups` | To-dos, promises you made, things you're waiting on, nudges, weekly review |
| `/secretary:contacts` | Person notes, birthdays, last contact, keep-in-touch reminders |
| `/secretary:expenses` | Receipts, reimbursements, invoices/bills, monthly budget |

You don't have to type the commands: "brief me", "when am I free Thursday?" or
"triage my inbox" load the right skill on their own.

## Automatic briefings

Your secretary can write a **morning brief** (what to do today) and an **evening recap** (what got
done, what's left over, tomorrow's first thing) on its own. Set the times in setup or in
`Settings.md` (`briefing_morning: 07:30`, `briefing_evening: 18:00`, `briefing_days`), then turn
them on:

```bash
sec schedule install      # or ask Claude: "brief me automatically every morning and evening"
sec schedule              # what's wanted vs. installed
sec schedule remove
```

On macOS this adds launchd agents (`~/Library/LaunchAgents/com.cwnaze.claude-secretary.briefing.*`);
on Linux, two crontab lines. Each runs `claude -p "/secretary:briefing morning scheduled"` with
only the tools in `briefing_allowed_tools` (default `Bash(sec *)`, so no connectors: add your
mail/calendar connector's read tools there if you want them in the brief). Output goes to
`~/.cache/claude-secretary/briefing-<kind>.log`. A run that finds that day's brief already written
does nothing. Each run uses Claude usage like a normal chat, and the computer has to be on; a
sleeping Mac runs the missed brief when it wakes. Re-run `sec schedule install` after changing the
times. `npx claude-secretary uninstall` removes the jobs.

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

With either backend you can add extra read-only feeds (Canvas, iCloud public
calendar links…) that count as busy time.

**Apple Calendar.** On a Mac, setup can also read Calendar.app directly
(`calendar_apple: macos`), including every account in it (iCloud, Google,
Exchange, subscriptions), with recurring events expanded. macOS asks once for
calendar access. On Windows or Linux, share an iCloud calendar as a Public
Calendar and add its `webcal://` link as a feed. Apple Calendar is read-only
either way.

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
`people due`, `invoices due`, `expenses summary`, `briefing-data`), plus `schedule` for automatic
briefings. It also
handles ICS: RRULE, EXDATE, RECURRENCE-ID, TZID/DST, free-slot search, editing
and publishing.

## Dashboard

`sec ui` serves a dashboard at `http://localhost:7410/` (`--port` to change it,
`--open` to open your browser). Outside Claude Code, run `npx claude-secretary ui`; it reads the
same vault and doesn't need Claude Code running. The home page is today's briefing: your day ruled by the hour
with the current time marked, drafts held for your OK, blocked send attempts, follow-ups due,
people to reach this week, and this month's spend. Rows open the note in Obsidian. The Settings
page edits `Settings.md`: permissions, profile, working hours, calendar, briefing times and vault
options, checked by the same validation as setup. The other sections aren't built yet.

The server only listens on 127.0.0.1 and refuses requests for any other host name. Its one write
is the Settings page: it changes only the keys you edited in `Settings.md` (your own notes and extra
keys stay), and only accepts JSON from a localhost page. The upload command and the tools a
scheduled briefing may use can't be changed from the page; edit those in Obsidian. Calendar feed
links are shown shortened, because they often contain private keys. It follows your system's light or dark setting.

## Development

```bash
npm test
claude plugin validate .
claude --plugin-dir .        # try it without installing
npm run build:ui             # build web/ (Next.js static export) into ui/, which ships
npm run dev:ui               # Next dev server on :7411 plus the vault API on :7410
```

Next and React are dev dependencies only. The built `ui/` is plain files served by `sec ui`
with Node's `http` module, so the plugin still needs no `npm install`.

## License

MIT
