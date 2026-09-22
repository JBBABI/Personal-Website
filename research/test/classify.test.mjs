/* Exercises the classify step against a stubbed Jev: checks the caching rule,
   the threshold bands, and that nothing is re-sent that was already paid for. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data', 'papers.json');

await writeFile(DATA, JSON.stringify([
  // Nothing classified yet — all three questions due.
  { arxiv_id: '2606.05608', version: 1, published: '2026-06-04',
    title: 'Agentic Software', abstract: 'Agents as software.',
    categories: ['cs.SE'], comment: 'ICSE 2026', decisions: {} },
  // Already answered at the CURRENT version — must not be sent again.
  { arxiv_id: '2602.14690', version: 3, published: '2026-02-20',
    title: 'Harness Engineering', abstract: 'Harness study.',
    categories: ['cs.SE'], comment: '',
    decisions: {
      is_relevant:       { version: 1, probability: 0.91, verdict: 'yes' },
      contribution_type: { version: 2, choice: 'study', confidence: 0.8, verdict: 'ok' },
      releases_code:     { version: 1, probability: 0.1,  verdict: 'no' },
    } },
], null, 2));

const sent = [];
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  sent.push(body);
  assert.equal(opts.headers.Authorization, 'Bearer test-key');
  assert.equal(body.model, 'jev-1.13.0', 'model id sent');
  assert.equal(typeof body.state, 'string', 'state is text, per the API');
  assert.ok(!/published|2026-0/.test(body.state), 'dates excluded — Jev is weak at them');
  assert.ok(!/authors/i.test(body.state), 'authors excluded from the decision state');
  assert.ok(!Array.isArray(body.questions), 'questions is an object keyed by id, not an array');
  return {
    ok: true, status: 200,
    json: async () => ({ answers: {
      // Mid-band on purpose: must be routed to review, not silently guessed.
      is_relevant:       { type: 'noul', noul: 0.55 },
      contribution_type: { type: 'choice', choice: 'position', confidence: 0.41,
                           probabilities: { position: 0.41, method: 0.3 } },
      releases_code:     { type: 'noul', noul: 0.95 },
    } }),
  };
};

process.env.JEV_API_KEY = 'test-key';
process.argv = [process.argv[0], 'classify-jev.mjs'];
await import('../classify-jev.mjs');
await new Promise((r) => setTimeout(r, 400));

assert.equal(sent.length, 1, 'only the unclassified paper was sent — caching holds');
assert.equal(Object.keys(sent[0].questions).length, 3);
assert.equal(sent[0].questions.is_relevant.type, 'noul');
assert.ok(sent[0].questions.is_relevant.instructions, 'nouls carry instructions');
assert.ok(sent[0].questions.contribution_type.criteria.other,
  'choice criteria include an escape option');

const out = JSON.parse(await readFile(DATA, 'utf8'));
const p = out.find((x) => x.arxiv_id === '2606.05608');

assert.equal(p.decisions.is_relevant.probability, 0.55, 'probability stored, not a boolean');
assert.equal(p.decisions.is_relevant.verdict, 'review', '0.55 sits mid-band → human decides');
assert.equal(p.decisions.releases_code.verdict, 'yes', '0.95 clears the high threshold');
assert.equal(p.decisions.contribution_type.verdict, 'review', 'confidence 0.41 below 0.6 → review');
assert.ok(!('confidence' in p.decisions.is_relevant),
  'nouls carry no confidence field — the live API returns {type, noul} only');
assert.equal(p.decisions.is_relevant.version, 1, 'question version recorded for cache invalidation');

const untouched = out.find((x) => x.arxiv_id === '2602.14690');
assert.equal(untouched.decisions.is_relevant.probability, 0.91, 'already-paid-for answers kept');

console.log('PASS — caching, thresholds and review routing all behave');
