#!/usr/bin/env node
/* ============================================================================
   Send unclassified papers to Jev and store the typed decisions.

   Two rules make retuning cheap, and both matter more than they look:

   1. PROBABILITIES ARE STORED, NOT BOOLEANS. If this wrote `has_code: true`
      the threshold could never be moved without re-running the whole corpus.
      Storing 0.94 means changing your mind costs nothing.

   2. DECISIONS ARE CACHED PER QUESTION VERSION. Rewording one question
      re-runs that question only, not the other five.

   Usage:  JEV_API_KEY=… node research/classify-jev.mjs [--limit N] [--dry-run]

   ⚠  The endpoint and request shape below are UNVERIFIED — they came from
      secondary coverage, because docs.typesafe.ai could not be reached from
      the machine this was written on. Check both against the real docs before
      the first paid run, and never send a key to a host you have not checked.
   ========================================================================== */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questions } from './questions.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data', 'papers.json');

const ENDPOINT = process.env.JEV_ENDPOINT ?? 'https://api.typesafe.ai/v1/decisions';
const KEY = process.env.JEV_API_KEY;

/** Which questions does this paper still owe an answer to? */
function pending(paper) {
  return questions.filter((q) => {
    const prior = paper.decisions?.[q.id];
    return !prior || prior.version !== q.version;
  });
}

/* Only the fields a decision should rest on. Deliberately excludes dates and
   author names: Jev is documented to be weak at date comparison, and author
   identity is not something a filter should be keying off anyway. */
function stateOf(paper) {
  return {
    title: paper.title,
    abstract: paper.abstract,
    categories: paper.categories,
    comment: paper.comment,
  };
}

function toJevQuestions(qs) {
  return qs.map((q) =>
    q.type === 'noul'
      ? { id: q.id, type: 'noul', claim: q.claim }
      : { id: q.id, type: 'choice', prompt: q.prompt, options: q.options },
  );
}

/** Turn a raw Jev answer into what gets stored, including the routing band. */
function store(q, answer) {
  if (q.type === 'noul') {
    const p = answer.probability;
    return {
      version: q.version,
      probability: p,
      // 'review' is the quality gate: anything Jev is unsure about becomes a
      // human decision instead of a confident guess.
      verdict: p >= q.thresholds.high ? 'yes' : p <= q.thresholds.low ? 'no' : 'review',
    };
  }
  return {
    version: q.version,
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    verdict: answer.confidence >= q.minConfidence ? 'ok' : 'review',
  };
}

async function askJev(paper, qs) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: stateOf(paper), questions: toJevQuestions(qs) }),
  });
  if (!res.ok) throw new Error(`Jev returned ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

  if (!KEY && !dryRun) {
    console.error('JEV_API_KEY is not set. Use --dry-run to inspect payloads without calling out.');
    process.exit(1);
  }

  const papers = JSON.parse(await readFile(DATA, 'utf8'));
  const todo = papers.filter((p) => pending(p).length > 0).slice(0, limit);
  console.log(`${todo.length} of ${papers.length} papers need classifying`);

  if (dryRun) {
    const sample = todo[0];
    if (sample) {
      console.log('\nfirst payload that would be sent:\n');
      console.log(JSON.stringify(
        { state: stateOf(sample), questions: toJevQuestions(pending(sample)) }, null, 2));
    }
    console.log('\n--dry-run: nothing sent, nothing written.');
    return;
  }

  let done = 0;
  let review = 0;

  for (const paper of todo) {
    const qs = pending(paper);
    const result = await askJev(paper, qs);

    paper.decisions ??= {};
    for (const q of qs) {
      const answer = result.answers?.[q.id];
      if (!answer) {
        console.warn(`  ${paper.arxiv_id}: no answer for ${q.id}, left unclassified`);
        continue;
      }
      paper.decisions[q.id] = store(q, answer);
      if (paper.decisions[q.id].verdict === 'review') review++;
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${todo.length} …`);
  }

  await writeFile(DATA, JSON.stringify(papers, null, 2) + '\n');
  console.log(`\nclassified ${done} papers. ${review} answers need your review.`);
}

main().catch((e) => {
  console.error('classify failed:', e.message);
  process.exit(1);
});
