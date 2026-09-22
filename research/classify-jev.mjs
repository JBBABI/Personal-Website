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
           node --env-file=.env research/classify-jev.mjs --limit 50 --sample 7

   --sample orders the corpus by a seeded hash of each paper's id, so the
   papers picked are spread across the corpus rather than all from the newest
   day. A gold set built from one day's papers measures agreement on one day's
   topics. The order is keyed on identity, not position, so it survives new
   papers arriving and papers already being classified — see sample.mjs for
   why that distinction cost a sample.

   Env:    JEV_API_KEY   required for a real run
           JEV_ENDPOINT  override the default endpoint
           JEV_MODEL     override the model id (default jev-1.13.0)

   Request shape follows the documented quickstart: a model id, the state as
   text, and questions as an object keyed by id. An earlier guess at
   /v1/decisions with an array of questions returned 404.

   Response shape, confirmed against a live call:

     { "model": "jev-1.13.0",
       "answers": {
         "contribution_type": { "type":"choice", "choice":"method",
                                "confidence":1, "probabilities":{...} },
         "is_relevant":       { "type":"noul", "noul":0.92 } },
       "usage": { "input_tokens":895, "output_tokens":101 } }

   A noul's value lives in `noul` and there is NO confidence field on it —
   only choices carry one. The first real call still prints the raw body once,
   so a future API change shows up immediately rather than as silent
   undefineds.
   ========================================================================== */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { questions } from './questions.ts';
import { stableOrder } from './sample.mjs';
import { PAPERS as DATA } from './paths.mjs';

/* `??` is wrong for env vars: an unset variable and one set to the empty
   string both reach here, and .env.example plus an unset Actions variable
   both produce the latter. Empty must fall back, or every call dies with
   "Failed to parse URL". */
const envOr = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
};

/* $0.042 per million input tokens; output is free. Named because the spend
   guard and the run summary must never drift apart — a ceiling computed from
   a stale price is a ceiling that does not hold. */
const USD_PER_INPUT_TOKEN = 0.042 / 1e6;

const ENDPOINT = envOr('JEV_ENDPOINT', 'https://api.typesafe.ai/v1/systemone');
const MODEL = envOr('JEV_MODEL', 'jev-1.13.0');
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
  if (q.type === 'noul' && q.continuous) {
    // No verdict by design. The value is the answer; bucketing a continuous
    // property invents an "unsure" band out of a perfectly good number and
    // throws away the ordering the page wants for its slider.
    return { version: q.version, probability: answer.noul, continuous: true };
  }

  if (q.type === 'noul') {
    // `noul` is P(yes). Unlike a choice it carries no confidence field — the
    // live API returns {type, noul} only, whatever the third-party cookbook
    // shows — so the probability's own distance from the thresholds is the
    // only uncertainty signal available here.
    const p = answer.noul;
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

let rawShapeShown = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Base backoff delay. Overridable so the tests can exercise the retry path
   without actually waiting half a minute. */
const RETRY_BASE_MS = Number(envOr('JEV_RETRY_BASE_MS', '1000'));
const MAX_ATTEMPTS = Number(envOr('JEV_MAX_ATTEMPTS', '5'));

/* Which failures are worth trying again.

   429 and 5xx are transient by definition — the server is telling you to come
   back, not that the request was wrong. Everything else is not: a 401 is a bad
   key and a 400 is a malformed question, and retrying either just burns the
   run's time before failing with the same message. Distinguishing them matters
   more than it looks, because a retried 401 five times over means the real
   error arrives half a minute late and buried. */
const isRetryable = (status) => status === 429 || (status >= 500 && status < 600);

/** Honour Retry-After when the server sends one; it knows better than we do. */
function retryAfterMs(res) {
  const raw = res.headers?.get?.('retry-after');
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const when = Date.parse(raw);              // the header may be an HTTP date
  return Number.isNaN(when) ? null : Math.max(0, when - Date.now());
}

/**
 * One classification request, retried on transient failures.
 *
 * This exists because the corpus is 4,683 papers and the run is unattended.
 * A single request has a small chance of a 429 or a gateway blip; across
 * thousands of sequential requests that stops being unlikely and becomes
 * expected. Before this, any one of them threw and ended the run — the
 * checkpointing meant no money was lost, but the job still died partway and
 * needed a person to notice and restart it, which is exactly what automating
 * this is supposed to remove.
 */
async function askJev(paper, qs) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          state: stateOf(paper),
          questions: toJevQuestions(qs),
        }),
      });
    } catch (e) {
      // A dropped connection is as transient as a 503 and must be retried the
      // same way, or a single network hiccup ends a two-hour run.
      lastError = e;
      if (attempt === MAX_ATTEMPTS) throw e;
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      continue;
    }

    if (res.ok) {
      const body = await res.json();
      if (!rawShapeShown) {
        // Print the first response verbatim. The response shape was not in the
        // material this was written from, so this is how it gets confirmed
        // rather than assumed a second time.
        console.log('\n--- first raw response (confirming the shape) ---');
        console.log(JSON.stringify(body, null, 2));
        console.log('--- end raw response ---\n');
        rawShapeShown = true;
      }
      return body;
    }

    const text = await res.text();
    lastError = new Error(`Jev returned ${res.status}: ${text}`);
    if (!isRetryable(res.status) || attempt === MAX_ATTEMPTS) throw lastError;

    const wait = retryAfterMs(res) ?? RETRY_BASE_MS * 2 ** (attempt - 1);
    console.warn(`  ${paper.arxiv_id}: ${res.status}, retrying in ${Math.round(wait / 1000)}s ` +
      `(attempt ${attempt}/${MAX_ATTEMPTS})`);
    await sleep(wait);
  }

  throw lastError;
}

/* A missing or non-numeric value silently became NaN, which classified
   nothing and still exited 0 — a no-op that looks like success. */
function numArg(args, flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const raw = args[i + 1];
  const n = Number(raw);
  if (raw === undefined || raw.startsWith('--') || !Number.isFinite(n)) {
    console.error(`${flag} needs a number, got ${raw === undefined ? 'nothing' : `"${raw}"`}`);
    process.exit(1);
  }
  return n;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = numArg(args, '--limit', Infinity);
  const sample = numArg(args, '--sample', null);
  /* A ceiling, not a budget. The whole 4,683-paper corpus costs about $0.20,
     so $5 is twenty-five times the largest legitimate run — high enough never
     to interrupt real work, low enough that a loop caused by a bad version
     bump or a corrupted cache stops on its own rather than billing all night
     against an unattended cron. */
  const maxSpend = numArg(args, '--max-spend', 5);

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

  await mkdir(dirname(DATA), { recursive: true });

  let papers;
  try {
    papers = JSON.parse(await readFile(DATA, 'utf8'));
  } catch (e) {
    console.error(e.code === 'ENOENT'
      ? 'No corpus yet. Run: node research/fetch-arxiv.mjs --max 400'
      : `Could not read ${DATA}: ${e.message}`);
    process.exit(1);
  }

  // Order the WHOLE corpus first, then filter. Ordering the candidates instead
  // makes the sample depend on how much has already been classified, so the
  // same seed drew a different population on every run. See sample.mjs.
  const ordered = sample === null ? papers : stableOrder(papers, sample);
  const candidates = ordered.filter((p) => pending(p).length > 0);

  if (sample !== null) {
    console.log(`sampling across the corpus with seed ${sample}`);
  }

  const todo = candidates.slice(0, limit);
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
  let scored = 0;
  let inputTokens = 0;

  const save = () => writeFile(DATA, JSON.stringify(papers, null, 2) + '\n');

  try {
    for (const paper of todo) {
      const spent = inputTokens * USD_PER_INPUT_TOKEN;
      if (spent >= maxSpend) {
        console.warn(`\nstopping: spent about $${spent.toFixed(2)}, at the $${maxSpend} ceiling.`);
        console.warn('Everything bought so far is saved. Raise --max-spend if this was expected.');
        break;
      }

      const qs = pending(paper);
      const result = await askJev(paper, qs);
      inputTokens += result.usage?.input_tokens ?? 0;

      paper.decisions ??= {};
      for (const q of qs) {
        const answer = result.answers?.[q.id];
        if (!answer) {
          console.warn(`  ${paper.arxiv_id}: no answer for ${q.id}, left unclassified`);
          // A version bump with no answer must not leave the OLD answer in
          // place looking current — drop it so it is retried, not reported.
          delete paper.decisions[q.id];
          continue;
        }
        paper.decisions[q.id] = store(q, answer);
        if (paper.decisions[q.id].verdict === 'review') review++;
        if (paper.decisions[q.id].continuous) scored++;
      }
      done++;
      // Checkpoint as we go. One 429 mid-run used to discard everything
      // already paid for.
      if (done % 10 === 0) {
        await save();
        console.log(`  ${done}/${todo.length} …`);
      }
    }
  } finally {
    // Runs on the error path too, so a failed run keeps what it bought.
    await save();
  }
  console.log(`\nclassified ${done} papers. ${review} answers need your review` +
    `${scored ? `, ${scored} kept as scores` : ''}.`);
  if (inputTokens) {
    // $0.042 per million input tokens, output free.
    const cost = inputTokens * USD_PER_INPUT_TOKEN;
    console.log(`${inputTokens.toLocaleString()} input tokens · about $${cost.toFixed(4)}`);
  }
}

// Top-level await so `await import(...)` in the tests waits for the run to
// finish, rather than racing it with a fixed sleep.
await main().catch((e) => {
  console.error('classify failed:', e.message);
  process.exitCode = 1;
});
