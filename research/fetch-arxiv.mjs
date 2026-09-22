#!/usr/bin/env node
/* ============================================================================
   Fetch candidate papers from the arXiv API into research/data/papers.json.

   Gathering only. Nothing here judges a paper — that is Jev's job, and it
   runs as a separate step so that re-tuning the filters never means
   re-downloading the corpus.

   Deterministic work stays here on purpose: exact phrase matching, dates and
   counts are all things Jev is documented to be bad at, and they are trivial
   in plain code.

   Usage:  node research/fetch-arxiv.mjs [--since YYYY-MM-DD] [--max N]

   No dependencies and no API key: arXiv is open. It asks for one request
   every three seconds, which RATE_LIMIT_MS honours. Do not lower it.
   ========================================================================== */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'data', 'papers.json');

const API = 'http://export.arxiv.org/api/query';
const RATE_LIMIT_MS = 3000;
const PAGE_SIZE = 100;

/* The seed terms, taken from the cluster around 2606.05608 (Agentic Software)
   rather than invented. "harness engineering" earns its place because it
   appears in two separate papers in that cluster and is not a term an
   outsider would guess. Widen this list only with evidence — every term
   added is noise the filter then has to remove. */
const TERMS = [
  'agentic software',
  'agentic engineering',
  'harness engineering',
  'agent harness',
  'agentic AI',
  'LLM agent',
];

const CATEGORIES = ['cs.AI', 'cs.MA', 'cs.CL', 'cs.SE'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildQuery() {
  const terms = TERMS.map((t) => `abs:"${t}"`).join(' OR ');
  const cats = CATEGORIES.map((c) => `cat:${c}`).join(' OR ');
  return `(${terms}) AND (${cats})`;
}

/* arXiv's Atom is consistent enough to pull apart without an XML dependency.
   If they ever change the shape this breaks loudly rather than silently —
   parseEntry returns null and the run reports a count of zero. */
const decode = (s) =>
  s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

function parseEntry(xml) {
  const idUrl = tag(xml, 'id');
  const m = idUrl.match(/abs\/(.+?)(?:v(\d+))?$/);
  if (!m) return null;

  return {
    // Version stripped so v1 and v3 of a paper are one record. The version
    // actually seen is kept separately, so a revision can be detected later.
    arxiv_id: m[1],
    version: m[2] ? Number(m[2]) : 1,
    title: tag(xml, 'title'),
    abstract: tag(xml, 'summary'),
    authors: [...xml.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((a) => decode(a[1])),
    published: tag(xml, 'published').slice(0, 10),
    updated: tag(xml, 'updated').slice(0, 10),
    categories: [...xml.matchAll(/<category[^>]*term="([^"]+)"/g)].map((c) => c[1]),
    // arXiv's free-text comment field is where authors mention acceptance and
    // repo links. Worth keeping: it is often the only place a venue appears.
    comment: tag(xml, 'arxiv:comment'),
    url: `https://arxiv.org/abs/${m[1]}`,
    source: 'arxiv',
    fetched_at: new Date().toISOString().slice(0, 10),
    // Populated by the Jev step, deliberately left empty here.
    decisions: {},
  };
}

async function fetchPage(start, max) {
  const url =
    `${API}?search_query=${encodeURIComponent(buildQuery())}` +
    `&start=${start}&max_results=${max}` +
    `&sortBy=submittedDate&sortOrder=descending`;

  const res = await fetch(url, {
    // arXiv asks callers to identify themselves.
    headers: { 'User-Agent': 'jeanbaptistebonvarlet.com research index (contact via site)' },
  });
  if (!res.ok) throw new Error(`arXiv returned ${res.status} ${res.statusText}`);

  const xml = await res.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((m) => parseEntry(m[1]))
    .filter(Boolean);
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;
  const max = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) : 200;

  const existing = await loadExisting();
  const seen = new Map(existing.map((p) => [p.arxiv_id, p]));
  console.log(`corpus: ${existing.length} papers already stored`);

  let added = 0;
  let revised = 0;

  for (let start = 0; start < max; start += PAGE_SIZE) {
    const batch = await fetchPage(start, Math.min(PAGE_SIZE, max - start));
    if (batch.length === 0) break;

    for (const paper of batch) {
      if (since && paper.published < since) continue;

      const prior = seen.get(paper.arxiv_id);
      if (!prior) {
        seen.set(paper.arxiv_id, paper);
        added++;
      } else if (paper.version > prior.version) {
        // A revision invalidates the stored decisions: the abstract may have
        // changed, so anything Jev concluded from the old one is stale.
        seen.set(paper.arxiv_id, { ...paper, decisions: {} });
        revised++;
      }
    }

    console.log(`  fetched ${start + batch.length} …`);
    if (batch.length < PAGE_SIZE) break;
    await sleep(RATE_LIMIT_MS);
  }

  const all = [...seen.values()].sort((a, b) => b.published.localeCompare(a.published));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(all, null, 2) + '\n');

  console.log(`\n${added} new, ${revised} revised, ${all.length} total → ${OUT}`);
  if (added === 0 && existing.length === 0) {
    console.log('\nNothing matched. Check the TERMS list before assuming the field is empty.');
  }
}

main().catch((e) => {
  console.error('fetch failed:', e.message);
  process.exit(1);
});
