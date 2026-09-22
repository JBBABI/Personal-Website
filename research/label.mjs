#!/usr/bin/env node
/* ============================================================================
   Hand-label a sample of papers into research/data/gold.json.

   This is the tool that makes every other number in the project mean
   something. Until it has been run, every reported figure — "20% security",
   "70% at confidence 1.00" — is Jev's own output being used to grade Jev's
   own output. That is circular, and a circular 60% and a circular 95% look
   exactly alike from the outside.

   BLIND BY CONSTRUCTION, NOT BY DISCIPLINE.

   The one rule a gold set has is that the label comes before the prediction.
   Seeing Jev's answer first does not merely bias the label, it destroys it:
   agreement then measures how persuasive the model is, which is a number
   nobody wants. So this tool does not ask you to avoid looking. It strips
   `decisions` off every paper as it loads them, and the rendering code is
   never handed the object at all. You could not peek from in here if you
   tried, which means there is nothing to remember not to do at 1am on the
   fortieth paper.

   Usage:
     node research/label.mjs                      # resume, or start seed 7 x 60
     node research/label.mjs --seed 7 --size 60   # define a cohort explicitly
     node research/label.mjs --questions is_relevant,releases_code
     node research/label.mjs --status             # progress, writes nothing

   Resumable by design. Sixty papers across three facets is a couple of hours
   and nobody does that in one sitting, so every answer is written through to
   disk as it is given. Killing the process loses at most the paper on screen.
   ========================================================================== */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { questions } from './questions.ts';
import { stableSample } from './sample.mjs';
import { PAPERS, GOLD } from './paths.mjs';

/* The first batch. Chosen because these three are where the doubt is:
   `is_relevant` is load-bearing — every other facet is conditional on it, so
   if it is wrong nothing downstream can be right. `releases_code` came back
   suspiciously bimodal (almost nothing between 0.25 and 0.85), which is
   either a genuinely easy question or pattern-matching on the presence of a
   URL, and those two have very different consequences. `contribution_type`
   returned confidence 1.00 on roughly seven papers in ten; a classifier that
   is never unsure is the exact thing calibration testing exists to catch.

   Override with --questions to widen to the topic facets later. The cohort
   does not change when you do, so the extra labels join the same sample
   rather than starting a second one. */
const DEFAULT_QUESTIONS = ['is_relevant', 'releases_code', 'contribution_type'];

const DEFAULT_SEED = 7;
const DEFAULT_SIZE = 60;

/* ----------------------------------------------------------------------------
   Loading. This is the blind-by-construction boundary.
   -------------------------------------------------------------------------- */

/**
 * Load the corpus with every prediction removed.
 *
 * The delete is the whole safety property, so it happens here, once, at the
 * edge — not at each render site where a later edit could forget one.
 */
async function loadPapersBlind() {
  let raw;
  try {
    raw = await readFile(PAPERS, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('No corpus yet. Run the research-fetch workflow, or:');
      console.error('  node research/fetch-arxiv.mjs --max 400');
      process.exit(1);
    }
    throw e;
  }
  const papers = JSON.parse(raw);
  if (!Array.isArray(papers)) throw new Error(`${PAPERS} is not an array`);
  return papers.map(({ decisions, ...blind }) => blind);
}

async function loadGold() {
  try {
    return JSON.parse(await readFile(GOLD, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    // Same reasoning as the corpus loader: a half-written file must not read
    // as "no labels yet" and get silently overwritten. These are hours of
    // work and they are not regenerable at any price.
    throw new Error(
      `${GOLD} exists but could not be parsed (${e.message}). ` +
      'Refusing to overwrite it — move it aside if you meant to start over.',
    );
  }
}

/* ----------------------------------------------------------------------------
   The answer types a facet can take.
   -------------------------------------------------------------------------- */

/**
 * What keys a question accepts, and what each one stores.
 *
 * `unsure` is a first-class answer everywhere, not an absence. A gold set
 * without it quietly forces a coin-flip on the hard papers and then reports
 * the coin-flips as ground truth — which inflates disagreement on exactly the
 * papers where the model's own uncertainty was probably correct. Scoring
 * excludes them from the agreement rate and reports the count separately.
 */
function optionsFor(q) {
  if (q.type === 'choice') {
    const keys = Object.keys(q.criteria);
    return {
      prompt: keys.map((k, i) => `${i + 1}) ${k}`).join('  ') + '  u) unsure  s) skip',
      parse: (raw) => {
        const s = raw.trim().toLowerCase();
        if (s === 'u') return { value: 'unsure' };
        if (s === 's') return { skip: true };
        const n = Number(s);
        if (Number.isInteger(n) && n >= 1 && n <= keys.length) return { value: keys[n - 1] };
        // Typing the name works too — after twenty papers the numbers stop
        // being the thing you reach for.
        if (keys.includes(s)) return { value: s };
        return null;
      },
      help: keys.map((k) => `     ${k}: ${q.criteria[k]}`).join('\n'),
    };
  }

  if (q.continuous) {
    /* Scored 0-4, not yes/no. These facets are continuous precisely because
       nearly every agent paper touches its harness and calls tools to some
       degree, so a binary gold label would be inventing a boundary the
       question was written to avoid. Scoring compares the ORDER of these
       against the order of Jev's probabilities (Spearman), which is what a
       slider on the page actually depends on — not whether some threshold
       was cleared. */
    return {
      prompt: '0) not at all  1) incidental  2) some  3) substantial  4) the point of the paper  s) skip',
      parse: (raw) => {
        const s = raw.trim().toLowerCase();
        if (s === 's') return { skip: true };
        const n = Number(s);
        return Number.isInteger(n) && n >= 0 && n <= 4 ? { value: n } : null;
      },
      help: null,
    };
  }

  return {
    prompt: 'y) yes  n) no  u) unsure  s) skip',
    parse: (raw) => {
      const s = raw.trim().toLowerCase();
      if (s === 'y') return { value: 'yes' };
      if (s === 'n') return { value: 'no' };
      if (s === 'u') return { value: 'unsure' };
      if (s === 's') return { skip: true };
      return null;
    },
    help: null,
  };
}

/* ----------------------------------------------------------------------------
   Rendering. Only ever receives a blinded paper.
   -------------------------------------------------------------------------- */

const RULE = '─'.repeat(72);

/** Wrap to 72 columns. Abstracts are one long line and unreadable raw. */
function wrap(text, width = 72) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.join('\n');
}

function renderPaper(paper, index, total) {
  console.log(`\n${RULE}`);
  console.log(`${index}/${total}  ${paper.arxiv_id}  ${paper.published}`);
  console.log(RULE);
  console.log(wrap(paper.title));
  console.log();
  console.log(wrap(paper.abstract));
  if (paper.comment) {
    // Kept because it is often where authors mention a repo or a venue, and
    // `releases_code` is one of the facets being judged. Withholding it would
    // hand the label a harder problem than the model was given, which would
    // show up as disagreement and get misread as the model being wrong.
    console.log(`\n  author comment: ${wrap(paper.comment, 66).replace(/\n/g, '\n  ')}`);
  }
  console.log(`  categories: ${(paper.categories ?? []).join(', ')}`);
  console.log(`  ${paper.url}`);
}

/* ----------------------------------------------------------------------------
   Main.
   -------------------------------------------------------------------------- */

function numArg(args, flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const raw = args[i + 1];
  const n = Number(raw);
  if (raw === undefined || raw.startsWith('--') || !Number.isFinite(n) || n <= 0) {
    console.error(`${flag} needs a positive number, got ${raw === undefined ? 'nothing' : `"${raw}"`}`);
    process.exit(1);
  }
  return n;
}

function listArg(args, flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const raw = args[i + 1];
  if (raw === undefined || raw.startsWith('--')) {
    console.error(`${flag} needs a comma-separated list`);
    process.exit(1);
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const statusOnly = args.includes('--status');

  const papers = await loadPapersBlind();
  let gold = await loadGold();

  const seed = numArg(args, '--seed', gold?.cohort.seed ?? DEFAULT_SEED);
  const size = numArg(args, '--size', gold?.cohort.size ?? DEFAULT_SIZE);
  const wanted = listArg(args, '--questions', gold?.questions ?? DEFAULT_QUESTIONS);

  const unknown = wanted.filter((id) => !questions.some((q) => q.id === id));
  if (unknown.length) {
    console.error(`unknown question id(s): ${unknown.join(', ')}`);
    console.error(`known: ${questions.map((q) => q.id).join(', ')}`);
    process.exit(1);
  }
  const asking = questions.filter((q) => wanted.includes(q.id));

  if (gold && (gold.cohort.seed !== seed || gold.cohort.size !== size)) {
    // Refusing rather than silently re-drawing. Merging labels from two
    // different samples produces a file that looks like one gold set and is
    // not, and the resulting agreement rate is not a number about anything.
    console.error(
      `${GOLD} holds cohort seed ${gold.cohort.seed} size ${gold.cohort.size}, ` +
      `but you asked for seed ${seed} size ${size}.`);
    console.error('Labels from two different samples must not be merged.');
    console.error('Move the existing file aside to start a new cohort.');
    process.exit(1);
  }

  if (!gold) {
    /* The cohort is frozen as an explicit list of ids at creation, and every
       later run reads that list rather than re-drawing it.

       Belt and braces on top of the stable sampler: even if the seed changed,
       the hash changed, or the corpus were rebuilt from a different arXiv
       query, the papers already labelled stay the papers being labelled.
       Re-deriving a sample you have already spent hours on is a class of
       mistake worth making structurally impossible rather than merely
       unlikely. */
    const cohort = stableSample(papers, seed, size);
    if (cohort.length < size) {
      console.log(`corpus holds ${cohort.length} papers, fewer than the ${size} asked for; using all of them`);
    }
    gold = {
      cohort: {
        seed,
        size,
        created: new Date().toISOString().slice(0, 10),
        // Frozen at creation. Never re-derived.
        arxiv_ids: cohort.map((p) => p.arxiv_id),
      },
      questions: wanted,
      labels: {},
    };
  } else if (wanted.some((id) => !gold.questions.includes(id))) {
    // Widening to more facets on the SAME cohort is fine and expected — the
    // expensive part is reading the abstract, and the marginal facet is
    // nearly free once you have.
    gold.questions = [...new Set([...gold.questions, ...wanted])];
  }

  const byId = new Map(papers.map((p) => [p.arxiv_id, p]));
  const missing = gold.cohort.arxiv_ids.filter((id) => !byId.has(id));
  if (missing.length) {
    console.log(`note: ${missing.length} cohort paper(s) are not in the current corpus and will be skipped`);
  }
  const cohort = gold.cohort.arxiv_ids.map((id) => byId.get(id)).filter(Boolean);

  const isDone = (p) => asking.every((q) => gold.labels[p.arxiv_id]?.[q.id] !== undefined);
  const todo = cohort.filter((p) => !isDone(p));

  console.log(`gold cohort: seed ${gold.cohort.seed}, ${gold.cohort.arxiv_ids.length} papers, created ${gold.cohort.created}`);
  console.log(`facets: ${asking.map((q) => q.id).join(', ')}`);
  console.log(`${cohort.length - todo.length}/${cohort.length} papers fully labelled, ${todo.length} to go`);

  if (statusOnly) return;
  if (todo.length === 0) {
    console.log('\nNothing left to label. Score it with: npm run research:score');
    return;
  }

  console.log('\nLabel each facet before you look at any prediction — that is the whole point.');
  console.log('Predictions are stripped from the data this tool loads, so there is nothing to resist.');
  console.log('Ctrl-C is safe: every answer is saved as you give it.\n');

  /* Lines are pulled on demand from readline's async iterator rather than
     through rl.question, and the prompt is written directly.

     rl.question is the obvious choice and it is wrong here. It reads one line
     per call, but readline drains the input stream as fast as it arrives and
     emits 'close' at the end — so against a pipe the whole input is consumed
     and the interface closed before the second question is ever asked, and
     that call throws ERR_USE_AFTER_CLOSE. Adding a 'close' handler to resolve
     early does not fix it either: it turns a six-answer session into a
     one-answer session that reports success.

     The iterator buffers instead, yielding a line each time one is asked for
     and reporting done when the input ends. Identical behaviour on a terminal
     and on a pipe, which is also what makes the tool testable. */
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  /** The line typed, or null when input ends (Ctrl-D, or a pipe running dry). */
  const ask = async (prompt) => {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    return done ? null : value;
  };

  await mkdir(dirname(GOLD), { recursive: true });

  /* Written to a sibling file and renamed, rather than written in place.
     rename is atomic within a filesystem, so gold.json is always either the
     previous complete version or the new complete one — never half of either.

     In-place writes are fine for data you can regenerate. These labels are
     hours of a person's attention and cannot be rebuilt at any price, and the
     save runs after every single answer, which is the worst possible exposure
     to a Ctrl-C landing mid-write. loadGold refuses to overwrite a file it
     cannot parse, so a truncated write would not silently lose the labels —
     it would just leave them unreadable, which is not much better. */
  const save = async () => {
    const tmp = `${GOLD}.tmp`;
    await writeFile(tmp, JSON.stringify(gold, null, 2) + '\n');
    await rename(tmp, GOLD);
  };

  let labelled = 0;
  let stopped = false;
  try {
    for (const [i, paper] of todo.entries()) {
      if (stopped) break;
      renderPaper(paper, i + 1, todo.length);

      for (const q of asking) {
        if (gold.labels[paper.arxiv_id]?.[q.id] !== undefined) continue;

        const opts = optionsFor(q);
        console.log(`\n  ${q.id}`);
        console.log(`  ${wrap(q.type === 'noul' ? q.claim : q.instructions, 68).replace(/\n/g, '\n  ')}`);
        if (opts.help) console.log(opts.help);

        let answer = null;
        while (answer === null) {
          const raw = await ask(`  ${opts.prompt}\n  > `);
          if (raw === null) {           // Ctrl-D, or piped input ran out
            stopped = true;
            break;
          }
          answer = opts.parse(raw);
          if (answer === null) console.log('  not one of the options');
        }
        if (stopped) break;
        if (answer.skip) {
          console.log('  skipped');
          continue;
        }

        gold.labels[paper.arxiv_id] ??= {};
        gold.labels[paper.arxiv_id][q.id] = {
          value: answer.value,
          // Stamped with the question version the label was made against. A
          // reworded question can change what a correct label even is, and a
          // stale label scored against new wording is worse than no label:
          // it looks like data.
          question_version: q.version,
          at: new Date().toISOString(),
        };
        // Written through on every answer, not at the end. Two hours of
        // labelling must not be one Ctrl-C away from nothing.
        await save();
      }
      if (!stopped) labelled++;
    }
  } finally {
    rl.close();
    await save();
  }

  console.log(`\n${RULE}`);
  if (stopped) console.log('stopped early — everything answered so far is saved');
  console.log(`${labelled} paper(s) labelled this session → ${GOLD}`);
  console.log('Score it with: npm run research:score');
}

await main().catch((e) => {
  console.error('label failed:', e.message);
  process.exitCode = 1;
});
