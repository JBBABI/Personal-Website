#!/usr/bin/env node
/* ============================================================================
   Turn the classified corpus into something a browser can hold.

   papers.json is 11.6MB, most of it abstracts. The list view shows a title,
   a few authors, a date and some tags — none of which need the abstract — so
   dropping it takes the payload to under 1MB, about 8% of the original.
   Shipping the full file instead would mean a phone parsing eleven megabytes
   of JSON before the first paper appears.

   Runs at build time, not in CI, so the page always reflects whatever
   papers.json is committed. The weekly classification run therefore updates
   the site with no extra step.

   Usage:  node research/build-index.mjs
   ========================================================================== */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questions } from './questions.ts';
import { PAPERS } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/* Written into public/ rather than src/data/, and read from there by the page
   at build time too. The browser needs it as a fetchable static asset, and
   keeping a second copy under src/ for the server render would be two files
   that must agree and eventually would not. */
const OUT = join(HERE, '..', 'public', 'research-index.json');

/* Which facets become clickable filters, and what they are called on the page.

   Deliberately not derived from questions.ts. The question ids are written for
   whoever is tuning the filter — `topic_multi_agent` says exactly what it
   tests — and the labels are written for whoever is reading the index. Those
   are different audiences and the words should be allowed to differ.

   is_relevant is absent on purpose: it is a property of the whole index rather
   than a facet to slice by, and offering "show me irrelevant papers" as a
   filter would be strange. It surfaces as the UNSURE marker instead. */
const FILTERS = [
  { id: 'topic_security',    label: 'security' },
  { id: 'topic_memory',      label: 'memory' },
  { id: 'topic_evaluation',  label: 'evaluation' },
  { id: 'topic_multi_agent', label: 'multi-agent' },
  { id: 'releases_code',     label: 'code released' },
];

/* The two continuous facets have no verdict by design — nearly every agent
   paper touches its harness and calls tools to some degree, so there is no
   honest yes/no. They become filters only above a high score, and the label
   says "mostly" to avoid implying a clean boundary that does not exist. */
const SCORED = [
  { id: 'topic_harness',  label: 'harness', min: 0.75 },
  { id: 'topic_tool_use', label: 'tool use', min: 0.75 },
];

const CONTRIBUTION_LABELS = {
  method: 'method',
  benchmark: 'benchmark',
  survey: 'survey',
  position: 'position',
  study: 'study',
  other: 'other',
};

function main(papers) {
  const rows = papers.map((p) => {
    const d = p.decisions ?? {};

    const tags = [];
    for (const f of FILTERS) if (d[f.id]?.verdict === 'yes') tags.push(f.label);
    for (const s of SCORED) if ((d[s.id]?.probability ?? 0) >= s.min) tags.push(s.label);

    /* The contribution type is shown only when the model was confident enough
       to have committed to it. A 'review' verdict means it was not, and
       printing the guess anyway would present a coin-flip as a fact — the one
       thing this index is supposed not to do. */
    const ct = d.contribution_type;
    const type = ct && ct.verdict !== 'review' ? CONTRIBUTION_LABELS[ct.choice] : null;

    return {
      id: p.arxiv_id,
      title: p.title,
      /* Six authors on average, and a long byline pushes the date off a phone
         screen. Three plus a count reads better and stays honest about how
         many were dropped. */
      authors: (p.authors ?? []).slice(0, 3),
      more: Math.max(0, (p.authors ?? []).length - 3),
      date: p.published,
      tags,
      type,
      /* Jev could not confidently place this paper in or out of scope. Shown
         rather than hidden: the index says "no judgment, just filters", and
         silently dropping a fifth of the corpus would be a judgment. */
      unsure: d.is_relevant?.verdict === 'review',
    };
  });

  // Newest first. The corpus is already sorted this way, but the page should
  // not depend on an invariant maintained somewhere else.
  rows.sort((a, b) => b.date.localeCompare(a.date));

  return {
    generated: new Date().toISOString().slice(0, 10),
    total: rows.length,
    filters: [...FILTERS.map((f) => f.label), ...SCORED.map((s) => s.label)],
    papers: rows,
  };
}

const papers = JSON.parse(await readFile(PAPERS, 'utf8'));
const index = main(papers);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(index) + '\n');

const bytes = JSON.stringify(index).length;
console.log(`${index.total} papers → ${OUT}`);
console.log(`${(bytes / 1048576).toFixed(2)}MB, ${index.filters.length} filters`);
console.log(`${index.papers.filter((p) => p.unsure).length} marked unsure`);
