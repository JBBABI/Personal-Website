/* Runs the suites one at a time. They share a corpus file, so running them
   concurrently (which `node --test` does by default) makes them race.

   Everything runs against a THROWAWAY data directory, never research/data.
   That directory now holds committed work — the corpus and, more importantly,
   the hand labels — and the suites delete their fixtures between runs so one
   cannot mask a bug in the next. Pointed at the real directory, `npm run
   research:test` would quietly destroy hours of labelling, and nobody would
   think to suspect the test command. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITES = [
  'parse.test.mjs',
  'merge.test.mjs',
  'classify.test.mjs',
  'sample.test.mjs',
  'label.test.mjs',
  'score.test.mjs',
];

const sandbox = mkdtempSync(join(tmpdir(), 'research-test-'));

let failed = 0;
for (const suite of SUITES) {
  // Each suite seeds its own fixtures; start from nothing.
  rmSync(join(sandbox, 'papers.json'), { force: true });
  rmSync(join(sandbox, 'gold.json'), { force: true });

  const r = spawnSync(process.execPath, [join(HERE, suite)], {
    encoding: 'utf8',
    env: { ...process.env, RESEARCH_DATA_DIR: sandbox },
  });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${suite}`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').map((l) => `      ${l}`).join('\n'));
}

rmSync(sandbox, { recursive: true, force: true });
console.log(failed ? `\n${failed} suite(s) failed` : `\n${SUITES.length} suites passed`);
process.exit(failed ? 1 : 0);
