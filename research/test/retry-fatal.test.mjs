/* The counterpart to retry.test.mjs: failures that will never succeed must
   fail immediately.

   A 401 is a bad key and a 400 is a malformed question. Retrying either just
   spends the backoff schedule before failing with the identical message, so
   the real error surfaces half a minute late and buried under retry warnings —
   in a cron log nobody is watching. Retrying everything is the easy mistake
   here, and it is worse than not retrying at all, because it makes a
   configuration error look like a flaky network. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';
import { PAPERS as DATA } from '../paths.mjs';

await mkdir(dirname(DATA), { recursive: true });
await writeFile(DATA, JSON.stringify([
  { arxiv_id: '2606.05608', version: 1, published: '2026-06-04', title: 'A',
    abstract: 'a', categories: ['cs.AI'], decisions: {} },
], null, 2));

let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return {
    ok: false, status: 401,
    headers: { get: () => null },
    text: async () => 'unauthorized',
  };
};

process.env.JEV_API_KEY = 'test-key-not-a-placeholder';
process.env.JEV_RETRY_BASE_MS = '1';
process.argv = [process.argv[0], 'classify-jev.mjs'];

await import('../classify-jev.mjs');

assert.equal(calls, 1, `a 401 must not be retried — it was attempted ${calls} times`);
assert.equal(process.exitCode, 1, 'an auth failure must exit non-zero so the cron reports it');

// Nothing was bought, so nothing should have been invented.
const papers = JSON.parse(await readFile(DATA, 'utf8'));
assert.deepEqual(papers[0].decisions, {}, 'a failed run must not leave partial decisions');

// The suite itself succeeded; clear the exit code the tool deliberately set.
process.exitCode = 0;
console.log('PASS — unrecoverable failures fail fast and leave nothing behind');
