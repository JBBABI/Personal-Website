/* Runs the suites one at a time. They share data/papers.json, so running them
   concurrently (which `node --test` does by default) makes them race. */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITES = ['parse.test.mjs', 'merge.test.mjs', 'classify.test.mjs'];

let failed = 0;
for (const suite of SUITES) {
  // Each suite seeds its own corpus; start from nothing so one cannot mask
  // a bug in the next.
  rmSync(join(HERE, '..', 'data', 'papers.json'), { force: true });

  const r = spawnSync(process.execPath, [join(HERE, suite)], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${suite}`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').map((l) => `      ${l}`).join('\n'));
}

rmSync(join(HERE, '..', 'data', 'papers.json'), { force: true });
console.log(failed ? `\n${failed} suite(s) failed` : `\n${SUITES.length} suites passed`);
process.exit(failed ? 1 : 0);
