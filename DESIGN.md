---
name: Secretary
description: A local dashboard that opens your day like a desk diary's day page.
colors:
  cloth-navy: "#1e2a4a"
  cloth-ink: "#e9edf6"
  cloth-mute: "#b3bed6"
  ribbon-red: "#c8402f"
  ribbon-ink: "#ffffff"
  hour-blue: "#46668c"
  rule-blue: "#a9c1da"
  rule-soft: "#dbe5ef"
  page-ivory: "#fbf8f1"
  page-shade: "#f3eee2"
  ink: "#222222"
  ink-soft: "#57524b"
  ink-faint: "#6f6a62"
  line: "#e2dacb"
  ok-green: "#2f6b4f"
  hold-amber: "#8a5d0c"
  focus-blue: "#2f5ea8"
  cloth-navy-dark: "#141b30"
  cloth-ink-dark: "#e4e8f2"
  cloth-mute-dark: "#9aa6c2"
  ribbon-red-dark: "#e0644f"
  ribbon-ink-dark: "#1a1d24"
  hour-blue-dark: "#93acc8"
  rule-blue-dark: "#4a627c"
  rule-soft-dark: "#2a3442"
  page-ivory-dark: "#1a1d24"
  page-shade-dark: "#22262f"
  ink-dark: "#ece8e0"
  ink-soft-dark: "#b2aca1"
  ink-faint-dark: "#9a9489"
  line-dark: "#333844"
  ok-green-dark: "#7cc29c"
  hold-amber-dark: "#e0b259"
  focus-blue-dark: "#8fb4ff"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
  figure:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "\"tnum\" 1"
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1"
  body-long:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  label-sm:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  ribbon-tag:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.04em"
rounded:
  hairline: "3px"
  sm: "4px"
  md: "6px"
  pill: "10px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "24": "24px"
  "32": "32px"
  "40": "40px"
  "56": "56px"
  "64": "64px"
  "96": "96px"
  hour: "56px"
components:
  nav-bar:
    backgroundColor: "{colors.cloth-navy}"
    textColor: "{colors.cloth-ink}"
    height: "56px"
    padding: "0 32px"
  nav-link:
    textColor: "{colors.cloth-mute}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-link-current:
    backgroundColor: "rgba(233, 237, 246, 0.14)"
    textColor: "{colors.cloth-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  count-badge:
    backgroundColor: "{colors.ribbon-red}"
    textColor: "{colors.ribbon-ink}"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
  day-stepper-button:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    height: "30px"
    padding: "0 10px"
  day-stepper-button-hover:
    backgroundColor: "{colors.page-shade}"
    textColor: "{colors.ink}"
  event-block:
    backgroundColor: "{colors.page-shade}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  event-block-past:
    backgroundColor: "{colors.page-ivory}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  free-slot:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  all-day-chip:
    backgroundColor: "{colors.page-shade}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  status-pill:
    textColor: "{colors.hold-amber}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  section-heading:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "0 0 8px"
---

# Design System: Secretary

## Overview

**Creative North Star: "The Day-to-a-Page Diary"**

The dashboard is a desk diary opened flat: a navy cloth cover across the top, an ivory page beneath it, pale blue rules marking the hours, and a red ribbon laid across the page at the current time. Everything the user reads sits on the page as ink, not in boxes floating above it. Structure comes from ruled lines (hour rules, section underlines, row dividers, the spine down the middle of the spread), and the only saturated color on the page is the ribbon red, which means "now" or "this needs you."

The home spread is two facing pages: the hour-ruled day on the left, the day's notes (briefing, inbox holds, follow-ups, spend, people) on the right, divided by a single hairline spine. Density is calm and legible, a diary rather than a terminal: one 15px sans body, serif only where a diary would print a heading or a figure. Light and dark are both first-class and follow the system setting; dark keeps the same ribbon on a navy-black page with ivory ink.

The world explicitly refuses the stat-tile card grid: figures sit in ruled columns on the page, and no surface lifts off it with a shadow.

**Key Characteristics:**
- Navy cloth shell, ivory page, blue hour rules, red ribbon.
- Depth by rules and tonal page shades, never by shadow.
- Serif for headings and figures, sans for everything read or scanned.
- Tabular numerals everywhere, so times and amounts align.
- Red reserved for now and attention.

## Colors

A paper-and-cloth palette: one deep navy for the shell, warm ivory paper, two blues for ruling, one red for the ribbon, and three steps of warm ink.

### Primary
- **Ribbon Red** (ribbon-red): the bookmark ribbon and now-line, the 2px rule under the day title, alert text (over budget, overdue, blocked), the nav count badges, and the text caret. Text on it uses Ribbon Ink.

### Secondary
- **Cloth Navy** (cloth-navy): the sticky top bar only, also the browser theme color. Text on it is Cloth Ink (current/hover) and Cloth Mute (resting links, vault name). Hover and current states on the cloth are translucent Cloth Ink washes (8% and 14%).
- **Hour Blue** (hour-blue): hour labels in the gutter, "due" pills, all-day tags, section "more" links and inline links on the page. The darker of the two ruling blues; the one that carries text.

### Tertiary
- **Rule Blue** (rule-blue): the underline beneath each notes section heading, the dashed outline of the open free slot, text selection, and scrollbar thumbs.
- **Rule Soft** (rule-soft): the hour rules themselves and row dividers inside lists and figures.

### Neutral
- **Page Ivory** (page-ivory): the page ground for every view, and the fill of past events (they sink back into the paper).
- **Page Shade** (page-shade): the fill of current/future events, all-day chips, inline code, and stepper hover. One step darker than the page, so blocks read as written on, not stacked on.
- **Ink** (ink): primary text and titles.
- **Ink Soft** (ink-soft): metadata lines, section subtitles, row subtext, past event titles.
- **Ink Faint** (ink-faint): past hour labels, cancelled and disabled text. The lowest text tone; never go lighter.
- **Line** (line): the warm hairline for event and chip borders, the stepper outline, and the spread's spine.
- **Hold Amber** (hold-amber) and **OK Green** (ok-green): status pill tones only. Amber means a draft is held for the user; green means it is cleared to send.
- **Focus Blue** (focus-blue): the 2px focus outline on the page. On the cloth, focus uses Cloth Ink instead.

Each color has a `-dark` counterpart in the frontmatter, applied under `prefers-color-scheme: dark` (or `data-theme="dark"`). The roles are identical in both themes.

### Named Rules
**The One Ribbon Rule.** Ribbon Red marks the present moment and things that need the user (alerts, overdue, blocked, unread counts). It never decorates, never fills a panel, and never marks a merely "important" heading.

**The Two Blues Rule.** Rule Blue and Rule Soft draw lines; Hour Blue carries text. Do not set text in the rule blues, and do not draw hour or row rules in Hour Blue.

## Typography

**Display Font:** Source Serif 4 (with Georgia, serif), weights 500 and 600
**Body Font:** Public Sans (with system-ui, sans-serif), weights 400, 500, 600, 700

**Character:** A printed diary's serif for the date, section heads and money figures, set against a plain, sturdy grotesque for everything scanned. The serif is never used for running text.

### Hierarchy
- **Display** (600, 34px, 1.1, -0.01em): the day title ("Tuesday 10 November") and full-page message titles. Drops to 26-28px on phones.
- **Headline** (600, 19px, 1.25): notes section headings (Briefing, Inbox, Follow-ups, Spend, People) and the Secretary wordmark on the cloth.
- **Figure** (600, 21px, 1.2, tabular): spend amounts in the figures strip.
- **Title** (600, 15px; 14px inside event blocks): row titles and event names.
- **Body** (400, 15px, 1.5, tabular numerals): the default for the whole app.
- **Body Long** (400, 16px, 1.6, max 66ch, `text-wrap: pretty`): the briefing paragraph and message bodies.
- **Label** (500, 13px; 12.5px for sub-meta): meta lines, section subtitles, nav links (14px), stepper text.
- **Label Small** (600, 12px): hour labels in the gutter and status pills.
- **Ribbon Tag** (700, 11px/16px, 0.04em, uppercase): the "Now 5:21 pm" tag on the ribbon only.

### Named Rules
**The Printed Heading Rule.** Serif appears only where a diary would print: the date, a section head, a figure. Rows, labels, pills and buttons are sans.

**The Aligned Numbers Rule.** Tabular numerals are on globally; times, counts and amounts must line up down a column. Do not switch them off.

## Layout

The home view is a two-page spread: a grid of two equal columns (max 1600px, centered) with a 1px Line spine at 50%, inset 32px top and bottom. The left page is the day; the right page is the notes column (flex column, 24px gap between sections).

The day page is ruled at a fixed hour height (56px per hour) with a 64px label gutter (52px on phones). Events are absolutely placed by start and duration on those rules, with overlapping events split into equal lanes and a 3-4px breathing gap. The ribbon runs the full width of the page and extends into the left margin (-56px) so its bookmark tail hangs outside the page.

Spacing follows a 4px base with a small set of steps (4, 8, 12, 16, 24, 32, 40, 56, 64, 96). Page padding is 32px top, 40-56px sides; the notes column ends with 96px bottom padding.

Responsive behavior:
- **At 1100px and below:** the vault name leaves the top bar.
- **At 1023px and below:** the spread closes into a single column (day above notes), the spine disappears, padding drops to 24px with a 48px left margin to keep the ribbon tail.
- **At 720px and below:** the top bar stops being sticky and wraps the nav under the wordmark.
- **At 560px and below:** padding drops to 16px, the ribbon tail and event locations hide, short events stack their time beneath the title, and the three spend figures become two over one.

## Elevation & Depth

The system is flat. Nothing casts a shadow. Depth is conveyed by three things only: ruled lines (hour rules, section underlines, row dividers, the spine), one tonal step from Page Ivory to Page Shade for written-on blocks, and the sticky Cloth Navy bar, which separates by color rather than by lift. Stacking order on the day page is rules, then event blocks, then the ribbon on top.

### Named Rules
**The Flat Page Rule.** Surfaces are paper on paper. If an element needs to stand out, give it Page Shade or a rule, not a shadow.

## Shapes

Corners are small and practical, like a printed form: 4px for blocks written on the page (events, free slot, all-day chips, inline code, focus rings), 6px for controls (nav links, the day stepper), 10px for pills and count badges, 3px for the ribbon tag. Borders are 1px hairlines in Line or Rule Soft; the only 2px strokes are the Ribbon Red day-title underline and the ribbon itself.

Two signature silhouettes belong to the world: the **ribbon tail**, a 14 x 34px Ribbon Red bookmark cut with a V notch at the bottom, hanging from the now-line into the left margin; and the **dashed open slot**, a dashed Rule Blue outline marking free time (and a dashed Line border on events marked free).

## Components

### Navigation (cloth bar)
- **Style:** sticky 56px Cloth Navy bar, Secretary wordmark in Headline serif at left, sections as sans 14px/500 links, vault name at far right in 12.5px Cloth Mute.
- **States:** resting Cloth Mute; hover Cloth Ink on an 8% wash; current page Cloth Ink on a 14% wash (`aria-current`). 150ms ease-out color and background transitions. Focus ring switches to Cloth Ink.
- **Count badge:** Ribbon Red pill, Ribbon Ink 11px/700 numeral, min-width 20px, only when the count is above zero.
- **Mobile:** wraps the links onto a second row under the wordmark; not sticky.

### Day Stepper
- **Shape:** one segmented control, 1px Line outline, 6px corners, internal dividers in Line.
- **Buttons:** 30px tall, min 34px wide; previous/next are 16px stroked SVG chevrons, "Today" is text. Ink Soft at rest, Page Shade fill and Ink on hover, Ink Faint when disabled ("Today" on today).

### Event Block (signature)
- **Placement:** absolute on the hour rules, inset from the gutter, split into lanes when overlapping.
- **Style:** Page Shade fill, 1px Line border, 4px corners, 6px 12px padding. Title in 14px/600, time and location in 12.5px Ink Soft, both single-line with ellipsis.
- **Variants:** past (Page Ivory fill, Rule Soft border, softened text); free/transparent (no fill, dashed border); cancelled (struck-through title in Ink Faint); short (under 55 minutes, title and time on one baseline).

### Ribbon (signature)
- A 2px Ribbon Red line across the page at the current minute, above everything else, with the bookmark tail in the margin and a Ribbon Tag reading "Now 5:21 pm" at the right on a Page Ivory backing. Only appears on today, within the shown hours.

### Open Slot
- The longest free stretch in work hours, drawn as a dashed Rule Blue outline with "Open · 2-5 pm" in 13.5px/600 Ink Soft. Never filled.

### Section Heading (notes column)
- Headline serif with an optional 12.5px Ink Soft subtitle on the same baseline and an Hour Blue "more" link pushed right; underlined by a 1px Rule Blue rule.

### List Row
- Two-column grid: title (600) with an Ink Soft subline on the left, a status pill on the right; 8px vertical padding; 1px Rule Soft divider beneath.

### Status Pill
- **Style:** outline only, 1px `currentColor` border, 10px corners, 3px 10px padding, 12px/600 text. No fill.
- **Tones:** Hold Amber (held for your OK / you send it), OK Green (ready to send), Hour Blue (due), Ribbon Red (blocked, late).

### Figures Strip
- Three equal ruled columns, separated by 1px Rule Soft verticals and a bottom rule; the figure in serif above a 12.5px Ink Soft caption. Two over one on phones.

### All-day Chip
- Page Shade fill, 1px Line border, 4px corners; title 13.5px/600 with a 12px Hour Blue "All day" tag.

### Page Message
- Full-page notice for setup needed, server down, or a section not yet built: Display title underlined by the 2px Ribbon Red rule, Body Long text in Ink Soft at max 60ch, Hour Blue links.

## Do's and Don'ts

### Do:
- **Do** rule the page: section underlines in Rule Blue, row and hour dividers in Rule Soft, hairlines in Line.
- **Do** keep Ribbon Red for now and attention (alerts, overdue, blocked, unread counts, the day-title underline).
- **Do** sink the past: past hours and events step down to Ink Faint / Ink Soft and Page Ivory rather than disappearing.
- **Do** set every time, count and amount in tabular numerals.
- **Do** give both themes equal care; every color role has a dark value, and dark keeps the same ribbon.
- **Do** use stroked inline SVG for icons (16px, 1.75 stroke, round caps), as the stepper chevrons do.

### Don't:
- **Don't** lay out summaries as a grid of stat-tile cards; figures sit in ruled columns on the page.
- **Don't** add shadows or raised surfaces; the page is flat.
- **Don't** fill status pills; they are outlined in their tone.
- **Don't** use serif for rows, labels, buttons or running text.
- **Don't** set text in Rule Blue or Rule Soft; they only draw lines.
- **Don't** extend the uppercase, letter-spaced Ribbon Tag style to section labels or kickers above headings; it belongs to the ribbon alone.
