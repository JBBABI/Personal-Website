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
           node --env-file=.env research/classify-jev.mjs --limit 10

   Env:    JEV_API_KEY   required for a real run
           JEV_ENDPOINT  override the default endpoint
           JEV_MODEL     override the model id (default jev-1.13.0)

   Request shape follows the documented quickstart: a model id, the state as
   text, and questions as an object keyed by id. An earlier guess at
   /v1/decisions with an array of questions returned 404.

   Response shape, confirmed against the cookbook:

     { "answers": {
         "intent":      { "type":"choice", "choice":"bug_frustration",
                          "confidence":0.98, "probabilities":{...} },
         "is_churning": { "type":"noul", "noul":0.95, "confidence":0.95 } } }

   A noul's value lives in `noul`, not `probability`. The first real call still
   prints the raw body once, so a future API change shows up immediately rather
   than as silent undefineds.
   ========================================================================== */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questions } from './questions.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data', 'papers.json');

const ENDPOINT = process.env.JEV_ENDPOINT ?? 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.JEV_MODEL ?? 'jev-1.13.0';
const KEY = process.env.JEV_API_KEY;

/** Which questions does this paper still owe an answer to? */
function pending(paper) {
  return questions.filter((q) => {
    const prior = paper.decisions?.[q.id];
    return !prior || prior.version !== q.version;
  });
}

/* The state is sent as text. Deliberately excludes dates and author names:
   Jev is documented to be weak at date comparison, and author identity is not
   something a filter should be keying off anyway. */
function stateOf(paper) {
  return [
    `Title: ${paper.title}`,
    `Categories: ${(paper.categories ?? []).join(', ')}`,
    paper.comment ? `Author comment: ${paper.comment}` : null,
    ``,
    `Abstract: ${paper.abstract}`,
  ].filter((l) => l !== null).join('\n');
}

/* Jev takes questions as an object keyed by id, not an array, and both kinds
   carry `instructions`. The authored form in questions.ts keeps `claim` for
   nouls because that reads better next to the rule "one claim per noul" —
   this is the only place the two shapes are reconciled. */
function toJevQuestions(qs) {
  return Object.fromEntries(qs.map((q) => [
    q.id,
    q.type === 'noul'
      ? { type: 'noul', instructions: q.claim }
      : { type: 'choice', instructions: q.instructions, criteria: q.criteria },
  ]));
}

/** Turn a raw Jev answer into what gets stored, including the routing band. */
function store(q, answer) {
  if (q.type === 'noul') {
    // `noul` is P(yes). It carries its own confidence, which is a second axis:
    // the value says what, the confidence says whether to act on it.
    const p = answer.noul;
    return {
      version: q.version,
      probability: p,
      confidence: answer.confidence,
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

let rawShapeShown = false;

async function askJev(paper, qs) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      state: stateOf(paper),
      questions: toJevQuestions(qs),
    }),
  });
  if (!res.ok) throw new Error(`Jev returned ${res.status}: ${await res.text()}`);

  const body = await res.json();
  if (!rawShapeShown) {
    // Print the first response verbatim. The response shape was not in the
    // material this was written from, so this is how it gets confirmed rather
    // than assumed a second time.
    console.log('\n--- first raw response (confirming the shape) ---');
    console.log(JSON.stringify(body, null, 2));
    console.log('--- end raw response ---\n');
    rawShapeShown = true;
  }
  return body;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

  if (!KEY && !dryRun) {
    console.error('JEV_API_KEY is not set. Use --dry-run to inspect payloads without calling out.');
    process.exit(1);
  }

  // Catches the classic copy-paste of an example line. Cheaper to check here
  // than to spend a round trip discovering it as a 401.
  if (!dryRun && /\.\.\.|^(your|xxx|placeholder)/i.test(KEY)) {
    console.error(`JEV_API_KEY looks like a placeholder, not a key: "${KEY}"`);
    console.error('Paste the real key from the TypeSafe console, or put it in .env and use:');
    console.error('  node --env-file=.env research/classify-jev.mjs --limit 10');
    process.exit(1);
  }

  const papers = JSON.parse(await readFile(DATA, 'utf8'));
  const todo = papers.filter((p) => pending(p).length > 0).slice(0, limit);
  console.log(`${todo.length} of ${papers.length} papers need classifying`);

  if (dryRun) {
    const sample = todo[0];
    if (sample) {
      console.log('\nfirst payload that would be sent:\n');
      console.log(JSON.stringify({
        model: MODEL,
        state: stateOf(sample),
        questions: toJevQuestions(pending(sample)),
      }, null, 2));
      console.log(`\nwould POST to: ${ENDPOINT}`);
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
