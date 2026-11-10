---
version: 1
slug: "web-app-page-tsx"
primary_target: "web/app/page.tsx"
related_targets: []
---

# Briefing (dashboard home)

Mode: Operate. Local dashboard, opened for a morning scan and kept as a pinned tab all day. Theme follows the system (light and dark both first-class). Avoid: generic SaaS card grid, terminal/techy density, dark-by-default.

Job: see today at a glance (agenda, drafts held for your OK, follow-ups due, inbox summary, spend), then jump to the section that owns it. Read-only; only Settings writes. Chat launcher bottom-right.

## Direction contract

THESIS: Today opens like a desk diary's day page, hours ruled down the left, a red ribbon at now. Refuses the stat-tile card grid.
OWN-WORLD: Navy cloth shell (#1E2A4A), page ivory ground (#FBF8F1), pale blue hour rules (#A9C1DA) with darker blue hour labels, red ribbon/margin (#C8402F) for now and attention, ink #222. Dark theme: navy-black page, ivory ink, same ribbon.
STORY: The user sees where they are in the day, what is waiting on their OK, and who to follow up with, then opens the owning section or asks Claude.
FIRST VIEWPORT: Navy cloth nav bar across the top (Briefing, Schedule, Inbox, Follow-ups, Contacts, Expenses, Settings). Left half: hour-ruled day page with events in place; past hours dimmed; red ribbon across the now line. Right half: the day's notes column with held drafts, follow-ups due, inbox summary, spend. Circular chat launcher bottom-right.
FORM: Day-to-a-Page Diary, #1 on the grounded list (IMPECCABLE'S PICK). seed:23af01e7b49641dc
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: route/file layout of the Next.js app; chat streaming; server port.
