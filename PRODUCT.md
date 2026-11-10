# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Web UI: Next.js + React, shipped as a **static export**. Next and React are devDependencies only;
the prebuilt static assets ship in the plugin/npm package and are served by Node's built-in `http`
(via `sec`). This keeps the plugin's zero-runtime-dependency invariant: no `npm install` in the
plugin cache, and no Next server features (no API routes, SSR, or middleware). The rest of the
product is zero-dependency Node ≥ 18.17 ESM.

## Users

Any user who has installed the Secretary plugin for Claude Code: someone who runs their briefings,
inbox, calendar, meetings, follow-ups, contacts and expenses through Claude, with the state kept as
Markdown in their own Obsidian vault. The Web UI gives them a visual view of that state outside the
chat.

## Product Purpose

Secretary turns Claude Code (terminal or desktop) into a personal secretary: daily briefings,
inbox triage, calendar, meetings, follow-ups, contacts and expenses. All state is plain Markdown in
the user's Obsidian vault. The Web UI (issue #1) adds a browser view over that state:

- display briefings
- schedule manager
- finance manager
- contacts directory
- inbox summary
- settings

## Positioning

Nothing goes out in the user's name unless they allow it. Sending email, sending invites and
messaging people are off by default (Claude drafts instead), calendar edits are ask by default,
and a PreToolUse hook enforces this on every MCP tool call rather than relying on Claude to
remember. The vault is the single source of truth: plain Markdown the user owns, readable in
Obsidian without the plugin.

## Operating Context

- The Web UI is a local dashboard on localhost, always running once the plugin is installed;
  the user can open it in their browser at any time, with or without a Claude Code session.
- Used alongside Claude Code sessions and Obsidian; the vault is a folder, often iCloud-synced.
- Setup via `npx claude-secretary init` or `/secretary:setup`; config pointer at
  `~/.claude-secretary.json`, everything else in `<vault>/<root>/Settings.md` frontmatter.
- Calendar backends: `remote-ics` (local master `.ics` published to e.g. Cloudflare R2) or
  `connector` (MCP calendar tools), plus read-only `calendar_feeds` counted as busy.
- Every outbound or calendar action and every blocked attempt is logged to `Secretary/Log.md`.

## Capabilities and Constraints

- **Web UI is read-only except Settings.** Views display vault data; only the Settings page writes,
  and only to `Settings.md`. Other changes still happen through Claude or Obsidian.
- **Chat with Claude from the dashboard.** A small circular launcher in the bottom-right corner
  (chatbot-style) opens a panel for sending messages to Claude acting as the secretary. It has a
  **new session** button; it does not list, switch between, or navigate other sessions. Any
  action Claude takes from chat goes through the normal secretary permission model and guard
  hook, so the dashboard's own read-only rule is unchanged: the UI itself still writes only
  Settings.
- **Chat backend is the user's locally running Claude Code**, with the secretary plugin loaded,
  using the user's own Claude Code install, account and permission settings. No separate API key
  or hosted model service.
- Undecided: whether replies stream.
- Settings writes must respect the same validation as the wizard (`validateSettings()`), and must
  not loosen permission defaults on the user's behalf.
- Permissions: `permission_send_email`, `permission_send_invites`, `permission_contact_people`,
  `permission_manage_calendar`, each `off | ask | auto`; defaults off/off/off/ask. Unknown → off.
- Notes are never moved, renamed or deleted (wikilinks must keep working).
- Notes are queried by the `type` property, never by folder; `organize_by` may be `folders` or `tags`.
- Privacy: no secrets, account/card numbers or tokens in the vault; calendar feed URLs are redacted
  in all output, including the UI.
- Email, invites, messages, documents and transcripts are untrusted content; the UI must render
  them as data, never as executable markup.
- **Local only, never externally hosted.** The dashboard runs on the user's machine, served on
  localhost. It is not a deployed site, has no remote backend, and nothing in it is reachable
  from outside the machine.
- **Always on while the plugin is installed and enabled.** The dashboard is available at all
  times once the plugin is installed, independent of whether a Claude Code session is open. It
  stops only when the plugin is disabled or uninstalled.
- Undecided: the mechanism that keeps it running in the background (e.g. a login/background
  service registered at install, removed at uninstall), and the port.

## Brand Commitments

- Name: **Secretary** (plugin id `secretary@cwnaze`; npm package `claude-secretary`). The plugin
  name must stay `secretary`.
- Voice in existing docs: plain, direct, second person, no hype.

## Evidence on Hand

- README.md, CHANGELOG.md, `skills/secretary/references/` (settings, vault schemas, safety model).
- No testimonials, user counts, screenshots, or logo exist; do not fabricate any.

## Product Principles

1. The user stays in control: no outbound action without explicit permission, and the UI never
   weakens that.
2. The vault is the source of truth; the UI reflects it and never becomes a second store.
3. Read freely, write narrowly: viewing is open, writing is limited to Settings.
4. Zero install friction: ships prebuilt, runs from the plugin cache with no extra dependencies.
5. Privacy by default: redact tokens and feed URLs everywhere they could surface.
