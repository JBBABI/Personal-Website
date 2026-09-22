#!/usr/bin/env node
/* ============================================================================
   Print what the filter decided, so it can be eyeballed against the papers.

   Reading the output is the point. Agreement rates come later from a gold
   set, but before that is worth building it is worth knowing whether the
   answers look sane at all.

   Usage:  node research/report.mjs [--review] [--relevant] [--all]
   ========================================================================== */

import { readFile } from 'node:fs/promises';
import { PAPERS as DATA } from './paths.mjs';
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
const SCORED = ['harness', 'tool_use'];   // continuous: shown as values, never tagged

/** Topics a paper carries, as short tags. Overlap is expected and kept. */
const topicsOf = (d) => TOPICS
  .filter((t) => !SCORED.includes(t) && d[`topic_${t}`]?.verdict === 'yes')
  .map((t) => t.replace('_', '-'));

/** Continuous topics print as numbers — there is no yes/no to print. */
const scoresOf = (d) => SCORED
  .map((t) => [t, d[`topic_${t}`]?.probability])
  .filter(([, v]) => v !== undefined)
  .map(([t, v]) => `${t.replace('_', '-')} ${v.toFixed(2)}`);

for (const p of shown) {
  const d = p.decisions;
  const rel = d.is_relevant ?? {};
  const type = d.contribution_type ?? {};
  const code = d.releases_code ?? {};
  const tags = topicsOf(d);
  const unsure = TOPICS.filter((t) => !SCORED.includes(t) && d[`topic_${t}`]?.verdict === 'review');
  const scores = scoresOf(d);
  const asked = TOPICS.some((t) => d[`topic_${t}`] !== undefined);

  console.log(`\n${p.title}`);
  console.log(`  ${p.url}  ${p.published}`);
  console.log(`  relevant  ${bar(rel.probability)} ${String(rel.probability ?? '?').padEnd(5)} ${rel.verdict ?? ''}`);
  console.log(`  type      ${String(type.choice ?? '?').padEnd(10)} @${type.confidence ?? '?'} ${type.verdict === 'review' ? 'REVIEW' : ''}`);
  console.log(`  code      ${bar(code.probability)} ${String(code.probability ?? '?').padEnd(5)} ${code.verdict ?? ''}`);
  const topicLine = !asked ? 'not asked yet' : tags.length ? tags.join(' · ') : 'none';
  console.log(`  topics    ${topicLine}${unsure.length ? `   unsure: ${unsure.join(' ')}` : ''}`);
  if (scores.length) console.log(`  scores    ${scores.join('   ')}`);
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
for (const t of TOPICS.filter((x) => !SCORED.includes(x))) {
  const c = counts(`topic_${t}`);
  const yes = c.yes ?? 0;
  const review = c.review ?? 0;
  // Percentages are of papers actually ASKED, not of the whole file, or every
  // rate is diluted by papers that predate the question.
  const answered = papers.length - (c.missing ?? 0);
  const pct = answered ? Math.round((yes / answered) * 100) : 0;
  const reviewPct = answered ? Math.round((review / answered) * 100) : 0;
  // A review rate this high means the claim is ambiguous, not that the papers
  // are borderline — it is the signal that a question needs rewording.
  const flag = reviewPct >= 25 ? '  ← claim too vague' : '';
  console.log(
    `  topic ${t.padEnd(12)} ${String(yes).padStart(3)}/${String(answered).padEnd(3)} ${String(pct).padStart(3)}% yes` +
    `   ${String(reviewPct).padStart(3)}% unsure${flag}`);
}

/* Scored topics get a distribution instead of a rate: the shape of the
   spread is what says whether the score discriminates at all. */
for (const t of SCORED) {
  const vals = papers.map((p) => p.decisions[`topic_${t}`]?.probability)
    .filter((v) => v !== undefined).sort((a, b) => a - b);
  if (!vals.length) continue;
  const at = (q) => vals[Math.floor((vals.length - 1) * q)].toFixed(2);
  const bins = [0, 0, 0, 0, 0];
  for (const v of vals) bins[Math.min(4, Math.floor(v * 5))]++;
  const spark = bins.map((n) => '▁▂▄▆█'[Math.min(4, Math.round((n / Math.max(...bins)) * 4))]).join('');
  console.log(`  score ${t.padEnd(12)} ${vals.length} values  ${spark}  ` +
    `p25 ${at(0.25)}  median ${at(0.5)}  p75 ${at(0.75)}`);
}

const asked = papers.filter((p) => TOPICS.some((t) => p.decisions[`topic_${t}`] !== undefined));
const untagged = asked.filter((p) => topicsOf(p.decisions).length === 0).length;
const multi = asked.filter((p) => topicsOf(p.decisions).length > 1).length;
console.log(`\n  of ${asked.length} papers asked about topics: ${untagged} carry none, ${multi} carry more than one`);
if (papers.length > asked.length) {
  console.log(`  ${papers.length - asked.length} classified before topics existed — re-run classify to fill them in`);
}

const types = papers.reduce((acc, p) => {
  const c = p.decisions.contribution_type?.choice;
  if (c) acc[c] = (acc[c] ?? 0) + 1;
  return acc;
}, {});
console.log(`\n  contribution types ${JSON.stringify(types)}`);
