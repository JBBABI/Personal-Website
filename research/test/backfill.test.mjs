/* Papers already stored must survive a fetch that does not mention them.

   This became load-bearing when the fetch workflow started choosing its own
   depth: it backfills the whole field once (~4,700 papers), then every later
   run asks arXiv for only the newest 400. If a fetch kept just what the feed
   returned, that second run would silently discard about 4,300 papers —
   including every decision paid for on them — and the corpus would look
   healthy at 400 while the index quietly shrank back to one month.

   merge.test.mjs cannot catch this: it seeds exactly the two papers the
   fixture returns, so "kept what the feed returned" and "kept everything"
   are the same answer there. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { PAPERS as DATA } from '../paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/* An older paper carrying a decision, plus one the feed will also return.
   The old one stands in for the ~4,300 that a newest-400 fetch never sees. */
await mkdir(dirname(DATA), { recursive: true });
await writeFile(DATA, JSON.stringify([
  { arxiv_id: '2501.00001', version: 1, published: '2025-01-02', title: 'An Older Paper',
    abstract: 'older', categories: ['cs.AI'],
    decisions: { is_relevant: { version: 1, probability: 0.91, verdict: 'yes' } } },
  { arxiv_id: '2606.05608', version: 1, published: '2026-06-04', title: 'Agentic Software',
    abstract: 'newer', categories: ['cs.AI'], decisions: {} },
], null, 2));

// The feed returns only the recent papers — the old one is off the end.
const xml = await readFile(join(HERE, 'fixture.xml'), 'utf8');
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return { ok: true, status: 200, text: async () => (calls === 1 ? xml : '<feed></feed>') };
};

process.argv = [process.argv[0], 'fetch-arxiv.mjs', '--max', '100'];
await import('../fetch-arxiv.mjs');

const papers = JSON.parse(await readFile(DATA, 'utf8'));

const old = papers.find((p) => p.arxiv_id === '2501.00001');
assert.ok(old, 'a stored paper absent from the feed must not be dropped');
assert.deepEqual(
  old.decisions,
  { is_relevant: { version: 1, probability: 0.91, verdict: 'yes' } },
  'and it must keep the decisions already paid for',
);

// The feed's papers are still merged in alongside it.
assert.ok(papers.find((p) => p.arxiv_id === '2602.14690'), 'new papers from the feed are added');
assert.ok(papers.length >= 3, `corpus grew rather than being replaced (got ${papers.length})`);

// Sorted newest first, which is what the corpus order is assumed to be
// everywhere else — including by the thing that used to sample on position.
const dates = papers.map((p) => p.published);
assert.deepEqual([...dates].sort().reverse(), dates, 'corpus stays sorted newest first');

console.log('PASS — an incremental fetch grows the corpus rather than truncating it');
