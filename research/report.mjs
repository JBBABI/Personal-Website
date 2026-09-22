#!/usr/bin/env node
/* ============================================================================
   Print what the filter decided, so it can be eyeballed against the papers.

   Reading the output is the point. Agreement rates come later from a gold
   set, but before that is worth building it is worth knowing whether the
   answers look sane at all.

   Usage:  node research/report.mjs [--review] [--relevant] [--all]
   ========================================================================== */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data', 'papers.json');
const args = process.argv.slice(2);

const bar = (p) => {
  if (p === undefined) return '·'.repeat(10);
  const n = Math.round(p * 10);
  return '█'.repeat(n) + '·'.repeat(10 - n);
};

const papers = JSON.parse(await readFile(DATA, 'utf8'))
  .filter((p) => Object.keys(p.decisions ?? {}).length);

if (papers.length === 0) {
  console.log('Nothing classified yet. Run classify-jev.mjs first.');
  process.exit(0);
}

const needsReview = (p) => Object.values(p.decisions).some((d) => d.verdict === 'review');

let shown = papers;
if (args.includes('--review')) shown = papers.filter(needsReview);
if (args.includes('--relevant')) shown = papers.filter((p) => p.decisions.is_relevant?.verdict === 'yes');

for (const p of shown) {
  const d = p.decisions;
  const rel = d.is_relevant ?? {};
  const type = d.contribution_type ?? {};
  const code = d.releases_code ?? {};

  console.log(`\n${p.title}`);
  console.log(`  ${p.url}  ${p.published}`);
  console.log(`  relevant  ${bar(rel.probability)} ${String(rel.probability ?? '?').padEnd(5)} ${rel.verdict ?? ''}`);
  console.log(`  type      ${String(type.choice ?? '?').padEnd(10)} @${type.confidence ?? '?'} ${type.verdict === 'review' ? 'REVIEW' : ''}`);
  console.log(`  code      ${bar(code.probability)} ${String(code.probability ?? '?').padEnd(5)} ${code.verdict ?? ''}`);
}

/* The distributions matter more than any single row: they say whether the
   thresholds are placed sensibly or whether everything is piling into one
   band. */
const counts = (id) => papers.reduce((acc, p) => {
  const v = p.decisions[id]?.verdict ?? 'missing';
  acc[v] = (acc[v] ?? 0) + 1;
  return acc;
}, {});

console.log(`\n${'─'.repeat(60)}`);
console.log(`${papers.length} classified, ${papers.filter(needsReview).length} needing review\n`);
for (const id of ['is_relevant', 'contribution_type', 'releases_code']) {
  console.log(`  ${id.padEnd(18)} ${JSON.stringify(counts(id))}`);
}

const types = papers.reduce((acc, p) => {
  const c = p.decisions.contribution_type?.choice;
  if (c) acc[c] = (acc[c] ?? 0) + 1;
  return acc;
}, {});
console.log(`\n  contribution types ${JSON.stringify(types)}`);
