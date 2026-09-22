/* Feeds a captured arXiv response through the real fetcher with the network
   stubbed out, so the parser is exercised end to end without hitting arXiv. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const xml = await readFile(join(HERE, 'fixture.xml'), 'utf8');

let calls = 0;
globalThis.fetch = async (url, opts) => {
  calls++;
  assert.match(url, /export\.arxiv\.org/, 'hits the arXiv endpoint');
  assert.match(url, /agentic\+software|agentic%20software/, 'sends the seed terms');
  assert.ok(opts?.headers?.['User-Agent'], 'identifies itself as arXiv asks');
  // Second page empty, so the loop terminates.
  return { ok: true, status: 200, text: async () => (calls === 1 ? xml : '<feed></feed>') };
};

process.argv = [process.argv[0], 'fetch-arxiv.mjs', '--max', '100'];
await import('../fetch-arxiv.mjs');  // top-level await inside: completes before returning

const papers = JSON.parse(await readFile(join(HERE, '..', 'data', 'papers.json'), 'utf8'));
assert.equal(papers.length, 2, 'both entries parsed');

const [first, second] = papers;
assert.equal(first.arxiv_id, '2606.05608', 'version suffix stripped from id');
assert.equal(first.version, 1);
assert.equal(first.title, 'Agentic Software: How AI Agents Are Restructuring the Software Paradigm',
  'newlines inside the title collapsed');
assert.match(first.abstract, /^We argue/, 'leading whitespace trimmed');
assert.match(first.abstract, /<systems where LLMs/, 'XML entities decoded');
assert.equal(first.comment, '24 pages, accepted at ICSE 2026', 'comment field kept');
assert.deepEqual(first.categories, ['cs.SE', 'cs.AI']);
assert.deepEqual(first.authors, ['Zhenfeng Cao']);
assert.deepEqual(first.decisions, {}, 'no judgments made at fetch time');

assert.equal(second.version, 3, 'multi-digit version parsed');
assert.deepEqual(second.authors, ['A. Researcher', 'B. Coauthor']);
assert.match(second.abstract, /agents & their failure/, 'ampersand decoded');

assert.ok(first.published > second.published, 'sorted newest first');
console.log('PASS — all parser assertions hold');
