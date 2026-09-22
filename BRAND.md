# Brand & design system

The visual identity for jeanbaptistebonvarlet.com. Read this before changing
anything visual, or before making something new that has to look like it
belongs — slides, a social image, a README header.

---

## The idea

> **A technology you are not supposed to have access to.**

That is the whole brief, and it is deliberately falsifiable. It means the
site should read as an **instrument** — something built to be used by
someone who already knows what it does — rather than a **brochure**, which
is built to convince a stranger.

The practical consequence: **restraint is the brand.** Confidence here comes
from under-claiming. Every decision below follows from that. If a change
makes the site louder, it is probably wrong.

---

## Colour

Four values. That is the entire palette.

| Token       | Dark (default) | Light     | Role                                 |
| ----------- | -------------- | --------- | ------------------------------------ |
| Matt black  | `#0B0B0C`      | `#EDEDE8` | Page surface                         |
| Graphite    | `#2A2B2E`      | `#D2D2C9` | Structure — hairlines, borders       |
| Off-white   | `#EDEDE8`      | `#0B0B0C` | Text                                 |
| **Amber**   | `#E8A33D`      | `#A66A12` | **Signal. Live state only.**         |

Light mode is the same three neutrals inverted, not a second palette. Amber
darkens to `#A66A12` there so it still clears **AA contrast** on off-white —
`#E8A33D` does not, so never use the dark-mode amber on a light background.

The derived greys (`--surface-1`, `--text-dim`, `--text-faint`, and so on)
are all in `src/styles/tokens.css`. Use the tokens; do not hand-pick new
hex values.

### The amber rule

**Amber marks what is live. Nothing else, ever.**

On the current site it appears exactly twice: the pulsing dot and the word
"NOW". That is roughly 1% of the pixels on the page, and that scarcity is
the entire reason it reads as a status lamp rather than a brand colour.

Amber is **not** for: links, buttons, headings, hover states, emphasis,
decoration, borders, backgrounds, or "making something pop". A monochrome
page with one lit indicator looks like equipment. The same page with amber
accents scattered through it looks like a marketing site.

If you are reaching for amber to create hierarchy, use **brightness**
instead — that is what `--text`, `--text-dim` and `--text-faint` are for.

---

## Typography

Two families, with a strict division of labour.

**Inter Variable** — prose, headings, anything a person reads as language.
Set tight: `-0.028em` tracking on headings, `1.6` line-height on body.

**JetBrains Mono Variable** — labels, metadata, numbers, identifiers,
anything that reads as a *readout*. Always uppercase with `0.12em` letter
spacing when used as a label. Always `tabular-nums` for figures, so columns
of numbers align.

The mono is the single most identity-carrying choice on the site. Readouts
are what restricted systems have; prose is what brochures have. Keep the
split clean — mono for data, Inter for language — and the instrument feel
survives almost any other change.

Both are **self-hosted** via `@fontsource-variable`. Do not swap them for a
Google Fonts `<link>`: it would send every visitor's IP to a third party and
break the "no trackers" claim in the footer, which is a real GDPR point for
a site with a French audience.

---

## Geometry & motion

- **Radius: 2px.** Effectively square. Rounded corners are consumer-friendly;
  classified hardware is not friendly. Never go above 4px.
- **Hairlines: 1px, graphite.** The visible grid of rules is what makes the
  page read as an instrument panel. Do not replace borders with shadows.
- **Shadows: essentially none.** Depth comes from surface steps
  (`--surface-0` → `--surface-1` → `--surface-2`), not from blur.
- **Motion: 90–140ms**, `cubic-bezier(0.2, 0, 0, 1)`. Things snap, like a
  relay closing. No bounce, no spring, no ease-in-out. The one exception is
  the live dot's 2.4s pulse, which is slow on purpose — it reads as a
  heartbeat, not an animation.
- **Reduced motion is honoured** globally. Keep it that way.

## Layout

One measure: **720px**, shared by nav, content and footer. A single narrow
column reads as a considered document. Do not widen the content while
leaving the chrome full-bleed — that mismatch is what made an earlier draft
look lopsided.

Prose caps at `62ch` regardless. Gutters are fluid: `clamp(1.25rem, 4vw, 3rem)`.

---

## Anti-patterns

These are the traps that turn "2030 classified instrument" into "2016
cyberpunk stock template". All of them are banned:

- Neon cyan or magenta, glow effects, `text-shadow` halos
- Matrix rain, particle fields, animated starfields, scanline overlays
- Glassmorphism and heavy background blur
- Gradient text, gradient buttons, gradient anything except the existing
  two-stop greys
- Large centred hero with a floating tagline
- Scroll-jacking, parallax, reveal-on-scroll animations, preloaders
- Skill bars, percentage-rated competencies, star ratings
- Stock photography of circuitry, robots, or glowing brains
- Emoji in the interface

---

## Applying it elsewhere

Making a slide, a social card or a header that should match:

1. Matt black background, off-white text, graphite hairlines.
2. Mono for the label row, Inter for the statement.
3. One amber element maximum, and only if something is genuinely live or
   current. If nothing is, use no amber at all.
4. Hard edges. A single 1px rule does more work than any graphic.
5. Leave it emptier than feels comfortable.

`public/img/og.png` is the reference execution — asset tag top-left, one
statement, a hairline, and a single amber dot. Copy its restraint.

---

## Where things live

| What                        | File                          |
| --------------------------- | ----------------------------- |
| All design tokens           | `src/styles/tokens.css`       |
| Copy guidelines             | `COPY.md`                     |
| Current-focus content       | `src/data/now.ts`             |
| All UI strings, EN + FR     | `src/i18n/ui.ts`              |

**Design tokens are the source of truth.** If a value is not in
`tokens.css`, it should not be in a component. Components may compose
tokens; they may not invent values.
