/* The re-run behaviour: a second fetch must not duplicate papers, must not
   discard decisions already paid for, and MUST discard them when a paper is
   revised — a new abstract makes the old conclusions stale. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data', 'papers.json');

// Seed a corpus where both papers already carry decisions.
await mkdir(dirname(DATA), { recursive: true });
await writeFile(DATA, JSON.stringify([
  { arxiv_id: '2606.05608', version: 1, published: '2026-06-04', title: 'Agentic Software',
    decisions: { is_relevant: 0.97 } },
  { arxiv_id: '2602.14690', version: 1, published: '2026-02-20', title: 'Harness Engineering',
    decisions: { is_relevant: 0.88 } },
], null, 2));

const xml = await readFile(join(HERE, 'fixture.xml'), 'utf8');
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return { ok: true, status: 200, text: async () => (calls === 1 ? xml : '<feed></feed>') };
};

process.argv = [process.argv[0], 'fetch-arxiv.mjs', '--max', '100'];
await import('../fetch-arxiv.mjs');  // top-level await inside: completes before returning

const papers = JSON.parse(await readFile(DATA, 'utf8'));
assert.equal(papers.length, 2, 'no duplicates on re-run');

const unchanged = papers.find((p) => p.arxiv_id === '2606.05608');
assert.deepEqual(unchanged.decisions, { is_relevant: 0.97 },
  'unchanged paper keeps its decisions — re-running must not re-cost');

const bumped = papers.find((p) => p.arxiv_id === '2602.14690');
assert.equal(bumped.version, 3, 'revision picked up');
assert.deepEqual(bumped.decisions, {},
  'revised paper drops stale decisions so it gets re-classified');
assert.ok(bumped.abstract, 'revised record refreshed from the feed');

console.log('PASS — merge is idempotent, revisions invalidate decisions');
