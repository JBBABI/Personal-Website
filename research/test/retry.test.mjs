/* Transient failures must not end an unattended run.

   This matters because of scale, not because of any one request. A single
   classification has a small chance of a 429 or a gateway blip. Across 4,683
   sequential requests on a weekly cron, "small chance" becomes "expected at
   least once", and the old code threw on the first one — checkpointing meant
   no money was lost, but the job still stopped partway and waited for a human
   to notice, which is precisely what automating it is meant to remove.

   The other half is knowing what NOT to retry. A 401 is a bad key: retrying it
   five times with backoff means the real error arrives half a minute late,
   buried under warnings, in a log nobody is watching. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';
import { PAPERS as DATA } from '../paths.mjs';

await mkdir(dirname(DATA), { recursive: true });
await writeFile(DATA, JSON.stringify([
  { arxiv_id: '2606.05608', version: 1, published: '2026-06-04', title: 'A',
    abstract: 'a', categories: ['cs.AI'], decisions: {} },
  { arxiv_id: '2602.14690', version: 1, published: '2026-02-20', title: 'B',
    abstract: 'b', categories: ['cs.AI'], decisions: {} },
], null, 2));

const answers = {
  is_relevant: { type: 'noul', noul: 0.9 },
  contribution_type: { type: 'choice', choice: 'method', confidence: 0.9, probabilities: {} },
  topic_security: { type: 'noul', noul: 0.1 },
  topic_harness: { type: 'noul', noul: 0.4 },
  topic_memory: { type: 'noul', noul: 0.1 },
  topic_evaluation: { type: 'noul', noul: 0.2 },
  topic_tool_use: { type: 'noul', noul: 0.3 },
  topic_multi_agent: { type: 'noul', noul: 0.1 },
  releases_code: { type: 'noul', noul: 0.95 },
};
const ok = () => ({
  ok: true, status: 200,
  json: async () => ({ answers, usage: { input_tokens: 900 } }),
});
const fail = (status, headers = {}) => ({
  ok: false, status,
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  text: async () => `error ${status}`,
});

/* Papers 1 and 2 each fail transiently before succeeding. 429 with an explicit
   Retry-After, then a 503 without one, so both the honoured-header path and
   the exponential-backoff path are exercised. */
const script = [
  fail(429, { 'retry-after': '0' }),
  ok(),
  fail(503),
  ok(),
];
let calls = 0;
globalThis.fetch = async () => {
  const r = script[calls] ?? ok();
  calls++;
  return r;
};

process.env.JEV_API_KEY = 'test-key-not-a-placeholder';
process.env.JEV_RETRY_BASE_MS = '1';      // keep the suite fast
process.argv = [process.argv[0], 'classify-jev.mjs'];

await import('../classify-jev.mjs');

assert.equal(calls, 4, `expected 2 failures + 2 successes, got ${calls} calls`);

const papers = JSON.parse(await readFile(DATA, 'utf8'));
assert.equal(papers.length, 2);
for (const p of papers) {
  assert.ok(p.decisions.is_relevant, `${p.arxiv_id} classified despite a transient failure`);
  assert.equal(p.decisions.is_relevant.verdict, 'yes');
  assert.equal(p.decisions.releases_code.verdict, 'yes');
  // The continuous facets are stored as bare scores with no verdict.
  assert.equal(p.decisions.topic_harness.continuous, true);
  assert.equal(p.decisions.topic_harness.verdict, undefined);
}

console.log('PASS — transient failures are retried, the run completes');
