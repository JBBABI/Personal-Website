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

let all;
try {
  all = JSON.parse(await readFile(DATA, 'utf8'));
} catch (e) {
  console.log(e.code === 'ENOENT'
    ? 'No corpus yet. Run: node research/fetch-arxiv.mjs --max 400'
    : `Could not read ${DATA}: ${e.message}`);
  process.exit(e.code === 'ENOENT' ? 0 : 1);
}

const papers = all.filter((p) => Object.keys(p.decisions ?? {}).length);

if (papers.length === 0) {
  console.log(`${all.length} papers fetched, none classified yet. Run classify-jev.mjs.`);
  process.exit(0);
}

const needsReview = (p) => Object.values(p.decisions).some((d) => d.verdict === 'review');

/* Filters compose rather than overwrite each other; --all (the default)
   shows everything. */
let shown = papers;
if (args.includes('--review')) shown = shown.filter(needsReview);
if (args.includes('--relevant')) shown = shown.filter((p) => p.decisions.is_relevant?.verdict === 'yes');
if (shown.length === 0) console.log('No papers match those filters.');

const TOPICS = ['security', 'harness', 'memory', 'evaluation', 'tool_use', 'multi_agent'];

/** Topics a paper carries, as short tags. Overlap is expected and kept. */
const topicsOf = (d) => TOPICS
  .filter((t) => d[`topic_${t}`]?.verdict === 'yes')
  .map((t) => t.replace('_', '-'));

for (const p of shown) {
  const d = p.decisions;
  const rel = d.is_relevant ?? {};
  const type = d.contribution_type ?? {};
  const code = d.releases_code ?? {};
  const tags = topicsOf(d);
  const unsure = TOPICS.filter((t) => d[`topic_${t}`]?.verdict === 'review');

  console.log(`\n${p.title}`);
  console.log(`  ${p.url}  ${p.published}`);
  console.log(`  relevant  ${bar(rel.probability)} ${String(rel.probability ?? '?').padEnd(5)} ${rel.verdict ?? ''}`);
  console.log(`  type      ${String(type.choice ?? '?').padEnd(10)} @${type.confidence ?? '?'} ${type.verdict === 'review' ? 'REVIEW' : ''}`);
  console.log(`  code      ${bar(code.probability)} ${String(code.probability ?? '?').padEnd(5)} ${code.verdict ?? ''}`);
  console.log(`  topics    ${tags.length ? tags.join(' · ') : '(none)'}${unsure.length ? `   unsure: ${unsure.join(' ')}` : ''}`);
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

/* How often each topic fires. A topic that never fires is dead weight; one
   that fires on everything is not discriminating. Both are worth seeing. */
console.log('');
for (const t of TOPICS) {
  const c = counts(`topic_${t}`);
  const yes = c.yes ?? 0;
  const pct = papers.length ? Math.round((yes / papers.length) * 100) : 0;
  console.log(`  topic ${t.padEnd(12)} ${String(yes).padStart(3)}/${papers.length}  ${String(pct).padStart(3)}%  ${JSON.stringify(c)}`);
}

const untagged = papers.filter((p) => topicsOf(p.decisions).length === 0).length;
const multi = papers.filter((p) => topicsOf(p.decisions).length > 1).length;
console.log(`\n  ${untagged} papers carry no topic, ${multi} carry more than one`);

const types = papers.reduce((acc, p) => {
  const c = p.decisions.contribution_type?.choice;
  if (c) acc[c] = (acc[c] ?? 0) + 1;
  return acc;
}, {});
console.log(`\n  contribution types ${JSON.stringify(types)}`);
