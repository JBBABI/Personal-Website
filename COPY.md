# Copy brief

Guidelines for anyone — human or agent — writing copy for this site.

## The one rule

**The design does the impressing. The words must not try to.**

This page is deliberately restrained: hairlines, monospace labels, three
greys and a single amber signal. That aesthetic reads as confidence
*because* it under-claims. Copy that oversells fights the design and both
lose. When in doubt, say less.

The previous draft of this site led with "I build agentic systems that ship
business outcomes." It was cut for exactly this reason.

## Voice

- **First person, present tense, active.** "I build agents" not "Building
  agents" and not "Jean-Baptiste builds agents."
- **Short declaratives.** One idea per sentence. No subordinate clause
  pile-ups.
- **Plain words.** If a shorter word works, use it.
- **Understate.** "Learning evals" is stronger than "Mastering advanced
  evaluation frameworks" — it is more credible and more interesting.
- **No hedging either.** "I think I might be exploring…" is as bad as
  overselling. State things plainly.

## Banned

These read as filler and will be rejected:

> passionate · cutting-edge · leverage · seamless · innovative ·
> results-driven · journey · transform · empower · unlock · game-changing ·
> synergy · best-in-class · I'm excited to · deep dive · robust ·
> state-of-the-art · revolutionise · next-generation

Also avoid: exclamation marks, rhetorical questions, and any sentence that
would work equally well on someone else's site.

## Punctuation

**No em dashes.** Use a full stop, a colon or a comma.

Two reasons, and the first is the one that matters. The em dash is the
clearest surviving tell of machine-written copy, and a site whose subject
is agentic AI cannot afford to read as though an agent wrote it. The
second: the em dash is the one mark that lets two half-thoughts pass as a
single sentence, which is precisely the pile-up the voice rules above
rule out. Pick the real punctuation and the sentence gets shorter.

| Weak                                      | Strong                                    |
| ----------------------------------------- | ----------------------------------------- |
| I build agents — and I measure them.      | I build agents. I measure them.           |
| My work in agentic AI — what I build.     | My work in agentic AI: what I build.      |
| Power Scout — grid analysis for a site.   | Power Scout: grid analysis for a site.    |

This governs **copy**, not code comments, and not the `—` separator in the
page-title template. In French the colon takes a non-breaking space before
it (`agentique : ce que`, U+00A0), so check both locales.

## Specific beats vague

| Weak                          | Strong                                        |
| ----------------------------- | --------------------------------------------- |
| Exploring AI technologies     | Building agents with Claude Code              |
| Passionate about automation   | Writing scrapers that run without me          |
| Leveraging LLMs for growth    | Learning evals — how you tell if an agent works |

A named tool, a named problem or a named constraint is always better than
an adjective.

## Honesty

**Only claims that can be backed.** No numbers that have not been verified,
no projects that do not exist, no skills not actually held. This site is
small precisely so it can be entirely true. A visitor who catches one
inflated claim discounts everything else on the page.

If something is aspirational, say so: "learning", "starting on", "reading
about" are all fine and cost nothing.

## What to write

### `src/data/now.ts` — the main content
Three or four lines on current work. Each line:
- **60–70 characters max.** Longer wraps to two lines and breaks the
  rhythm of the block. Check this; it is a hard layout constraint.
- Ends with a full stop.
- Starts with a verb where possible.
- Describes something happening *now*. Delete lines that go stale, and bump
  the `updated` stamp when you do.

### `src/i18n/ui.ts` — the frame
- `hero.welcome` — the single word the page opens on, written out by the
  animated dots beside it. One word. It is a prompt, not a headline, so it
  does not take the name or a tagline.
- `hero.intro` — one or two sentences on what the site is for. Matter of
  fact, not apologetic. Do not say "under construction".
- `meta.title` — the name is enough. Avoid keyword stuffing.
- `meta.description` — 150–160 characters, written for a human reading a
  search result, not for a crawler.
- Labels (`now.label`, `contact.label`) — one or two words. These render as
  instrument labels in uppercase mono, not as headings. "Now" and
  "Elsewhere" work; "My Current Focus Areas" does not.

## French

**Write French, do not translate English.** The FR page is a peer of the EN
one, not a derivative. Specifically:

- Avoid anglicisms where a normal French term exists.
- French sentences run ~15–20% longer than English. Check the 60–70
  character limit in `now.ts` *in French*, not just in English.
- Keep the same register: plain, direct, first person.
- Both locales live in the same files, side by side. Update them together
  or the pages drift apart.

## Do not touch

- Anything in `src/styles/tokens.css` — that is the design system.
- The `.astro` components. Copy lives in `src/data/now.ts` and
  `src/i18n/ui.ts` only.
- Contact details in `src/components/Home.astro` unless they are wrong.

## Before you finish

1. `npm run build` — it must pass. A missing translation key fails the build.
2. Check the Now lines do not wrap, in **both** languages, at 720px.
3. Read the page aloud. Anything that sounds like a LinkedIn post, cut.
