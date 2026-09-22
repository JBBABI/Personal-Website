#!/usr/bin/env node
/* ============================================================================
   Score Jev's decisions against the hand labels in gold.json.

   This is the first number in the project that is not a self-report. Every
   figure produced before this — the topic distributions, the review rates,
   the "20% security" — came from Jev's own output being used to judge Jev's
   own output. Four rounds of tuning ran on that signal. This is the step that
   tells you whether any of it was real.

   What it reports, and why each one is here:

   AGREEMENT is the headline, but on its own it is close to meaningless.
   A facet that is 5% true in the corpus scores 95% by answering "no" every
   time, so the base rate is printed beside every agreement rate. When they
   are the same number, the filter has learned nothing.

   A CONFIDENCE INTERVAL, because n is 60 and "91%" implies a precision that
   sixty papers cannot support — the true value could sit anywhere from about
   81% to 96%. The plan is to publish this figure on the page, and publishing
   a point estimate from n=60 as though it were exact is the same overreach
   the questions were carefully written to avoid. Wilson rather than the
   textbook normal interval: at proportions near 0 or 1, which is exactly
   where these will land, the normal interval runs past 100%.

   CALIBRATION is the one that earns its keep. Jev is documented to return
   calibrated probabilities; this checks whether that survives contact with
   THESE questions. If the papers called 0.9 are true about 90% of the time,
   the thresholds mean what they say and the page can publish them. If the
   0.9 bucket is really 0.6, the sharp bimodality in `releases_code` is
   overconfidence rather than an easy question, and `contribution_type`
   answering 1.00 on seven papers in ten is a model that has no idea it is
   uncertain. Agreement alone cannot tell those apart.

   A THRESHOLD SWEEP, because the probabilities are stored rather than
   booleans — the decision that makes this free. The current bands were set by
   eye against Jev's own output; this shows what they should have been.

   Usage:  node research/score.mjs [--json]
   ========================================================================== */

import { readFile } from 'node:fs/promises';
import { questions } from './questions.ts';
import { PAPERS, GOLD } from './paths.mjs';

/* ----------------------------------------------------------------------------
   Statistics. Small enough to keep honest by reading.
   -------------------------------------------------------------------------- */

/**
 * Wilson score interval for a binomial proportion, 95% by default.
 *
 * Chosen over the normal approximation because these proportions cluster near
 * 1, where the normal interval produces upper bounds above 100% and stops
 * being a statement about anything.
 */
export function wilson(successes, n, z = 1.96) {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** Ranks with ties averaged — required, or tied 0-4 scores bias the result. */
function ranks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

/**
 * Spearman rank correlation.
 *
 * The right measure for the continuous facets. `topic_harness` and
 * `topic_tool_use` have no verdict by design, so there is no yes/no to agree
 * with — what matters is whether Jev ORDERS papers the way a person does,
 * because ordering is all a slider on the page ever uses.
 */
export function spearman(a, b) {
  const n = a.length;
  if (n < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
}

/**
 * Bucket predictions by probability and compare predicted against observed.
 *
 * Returns the per-bucket table plus Expected Calibration Error — the average
 * gap between the two, weighted by how many predictions fall in each bucket.
 * ECE is a summary and hides which direction the error runs, so the table is
 * printed too: being overconfident at the top end and underconfident at the
 * bottom is a different problem from being uniformly off.
 */
export function calibration(pairs, edges = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0001]) {
  const buckets = [];
  let ece = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const inB = pairs.filter(([p]) => p >= edges[i] && p < edges[i + 1]);
    if (inB.length === 0) {
      buckets.push({ lo: edges[i], hi: Math.min(edges[i + 1], 1), n: 0 });
      continue;
    }
    const predicted = inB.reduce((s, [p]) => s + p, 0) / inB.length;
    const hits = inB.filter(([, truth]) => truth).length;
    const observed = hits / inB.length;
    ece += (inB.length / pairs.length) * Math.abs(observed - predicted);
    buckets.push({
      lo: edges[i],
      hi: Math.min(edges[i + 1], 1),
      n: inB.length,
      predicted,
      observed,
      hits,
      ...wilson(hits, inB.length),
    });
  }
  return { buckets, ece };
}

/* ----------------------------------------------------------------------------
   Scoring one question.
   -------------------------------------------------------------------------- */

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x) => `${(x * 100).toFixed(1)}%`;

function scoreNoul(q, rows) {
  /* `unsure` labels are held out of the agreement rate rather than forced to
     a side. Counting them as wrong punishes the model for the papers a person
     could not call either, which is precisely where its own hesitation is
     most likely to be correct. They are reported separately because a high
     unsure count is itself a finding about the question's wording. */
  const unsure = rows.filter((r) => r.gold === 'unsure').length;
  const usable = rows.filter((r) => r.gold === 'yes' || r.gold === 'no');
  if (usable.length === 0) return { id: q.id, n: 0, unsure };

  const pairs = usable.map((r) => [r.probability, r.gold === 'yes']);
  const baseRate = usable.filter((r) => r.gold === 'yes').length / usable.length;

  // Agreement at the thresholds actually in questions.ts. Papers the filter
  // routes to 'review' are not scored as right or wrong — routing to a human
  // is the system working, not a mistake — but the rate is reported, because
  // a filter that reviews everything agrees with nothing.
  const decided = usable.filter((r) => r.verdict !== 'review');
  const agree = decided.filter((r) => (r.verdict === 'yes') === (r.gold === 'yes')).length;

  // What the bands SHOULD have been. Free, because probabilities were stored.
  let best = null;
  for (let lo = 0.05; lo <= 0.55; lo += 0.05) {
    for (let hi = lo + 0.05; hi <= 0.95; hi += 0.05) {
      const dec = usable.filter((r) => r.probability >= hi || r.probability <= lo);
      if (dec.length < usable.length * 0.5) continue;   // a band that reviews half the corpus is not a filter
      const ok = dec.filter((r) => (r.probability >= hi) === (r.gold === 'yes')).length;
      const score = ok / dec.length;
      /* Agreement first, but COVERAGE breaks the tie, and it has to. Narrow
         bands trivially score well by deciding only the easy papers and
         sending everything else to a human — the sweep would otherwise
         recommend a band that is more "accurate" purely by answering less,
         which is a worse filter reported as a better one. Ties are compared
         with a tolerance because two bands differing by a thousandth on n=60
         are not meaningfully different. */
      const better = !best
        || score > best.agreement + 0.005
        || (Math.abs(score - best.agreement) <= 0.005 && dec.length > best.decided);
      if (better) {
        best = { low: +lo.toFixed(2), high: +hi.toFixed(2), agreement: score, decided: dec.length };
      }
    }
  }

  return {
    id: q.id,
    n: usable.length,
    unsure,
    baseRate,
    reviewed: usable.length - decided.length,
    decided: decided.length,
    agree,
    agreement: decided.length ? agree / decided.length : null,
    ci: decided.length ? wilson(agree, decided.length) : null,
    thresholds: q.thresholds,
    best,
    calibration: calibration(pairs),
  };
}

function scoreChoice(q, rows) {
  const usable = rows.filter((r) => r.gold !== 'unsure');
  const unsure = rows.length - usable.length;
  if (usable.length === 0) return { id: q.id, n: 0, unsure };

  const agree = usable.filter((r) => r.choice === r.gold).length;

  // Calibration on a choice uses the confidence it reported for the option it
  // picked: of the papers it called at 1.00, how many were right? This is the
  // direct test of the 70%-at-1.00 result.
  const pairs = usable.map((r) => [r.confidence, r.choice === r.gold]);

  // Which options get confused for which. An overall rate of 80% made up
  // entirely of method-vs-study confusion is a fixable wording problem; the
  // same 80% spread evenly is not.
  const confusion = {};
  for (const r of usable) {
    if (r.choice === r.gold) continue;
    const key = `${r.gold} → ${r.choice}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
  }

  return {
    id: q.id,
    n: usable.length,
    unsure,
    agree,
    agreement: agree / usable.length,
    ci: wilson(agree, usable.length),
    confusion,
    calibration: calibration(pairs),
  };
}

function scoreContinuous(q, rows) {
  const usable = rows.filter((r) => typeof r.gold === 'number');
  if (usable.length < 3) return { id: q.id, n: usable.length, continuous: true };
  return {
    id: q.id,
    n: usable.length,
    continuous: true,
    spearman: spearman(usable.map((r) => r.gold), usable.map((r) => r.probability)),
  };
}

/* ----------------------------------------------------------------------------
   Report.
   -------------------------------------------------------------------------- */

function printNoul(s) {
  console.log(`\n${s.id}`);
  if (s.n === 0) {
    console.log(`  no usable labels (${s.unsure} unsure)`);
    return;
  }
  console.log(`  n=${s.n}  base rate ${pct(s.baseRate)} yes` +
    (s.unsure ? `  (${s.unsure} labelled unsure, held out)` : ''));
  if (s.agreement === null) {
    console.log('  every paper routed to review — no decisions to score');
  } else {
    console.log(`  agreement   ${pct1(s.agreement)}  (${s.agree}/${s.decided})` +
      `   95% CI ${pct(s.ci.low)}–${pct(s.ci.high)}`);
    // The comparison that stops a meaningless number being celebrated.
    const majority = Math.max(s.baseRate, 1 - s.baseRate);
    console.log(`  always-"${s.baseRate >= 0.5 ? 'yes' : 'no'}" would score ${pct1(majority)}` +
      (s.agreement <= majority ? '   ← the filter is not beating the base rate' : ''));
  }
  console.log(`  routed to review  ${s.reviewed}/${s.n} at thresholds ${s.thresholds.low}/${s.thresholds.high}`);
  if (s.best) {
    console.log(`  best bands       ${s.best.low}/${s.best.high} → ${pct1(s.best.agreement)} on ${s.best.decided}/${s.n}`);
  }
  printCalibration(s.calibration);
}

function printChoice(s) {
  console.log(`\n${s.id}`);
  if (s.n === 0) {
    console.log(`  no usable labels (${s.unsure} unsure)`);
    return;
  }
  console.log(`  n=${s.n}` + (s.unsure ? `  (${s.unsure} unsure, held out)` : ''));
  console.log(`  agreement   ${pct1(s.agreement)}  (${s.agree}/${s.n})` +
    `   95% CI ${pct(s.ci.low)}–${pct(s.ci.high)}`);
  const conf = Object.entries(s.confusion).sort((a, b) => b[1] - a[1]);
  if (conf.length) {
    console.log('  confusions (gold → predicted):');
    for (const [k, n] of conf) console.log(`    ${n}x  ${k}`);
  }
  printCalibration(s.calibration, 'confidence');
}

function printCalibration(c, label = 'probability') {
  const filled = c.buckets.filter((b) => b.n > 0);
  if (filled.length === 0) return;
  console.log(`  calibration (ECE ${c.ece.toFixed(3)})`);
  console.log(`    ${label.padEnd(12)}  n   predicted  observed   95% CI`);
  for (const b of filled) {
    const band = `${b.lo.toFixed(2)}–${b.hi.toFixed(2)}`;
    /* Flag a band only when the stated probability falls OUTSIDE the
       confidence interval of what was observed — not merely when the two
       point estimates differ.

       With sixty papers a bucket can hold eight, and eight papers at 16%
       predicted will quite often return zero true by luck alone. Flagging
       that gap sends you rewording a question that was never broken, which
       is the expensive kind of false alarm: it costs a retune AND it teaches
       you to ignore the flag. Requiring the interval to exclude the claim
       means what is marked is a real disagreement. */
    const off = (b.predicted < b.low || b.predicted > b.high) ? '  ← off' : '';
    console.log(`    ${band.padEnd(12)} ${String(b.n).padStart(2)}    ` +
      `${pct(b.predicted).padStart(5)}      ${pct(b.observed).padStart(5)}   ` +
      `${pct(b.low)}–${pct(b.high)}${off}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');

  let papers;
  let gold;
  try {
    papers = JSON.parse(await readFile(PAPERS, 'utf8'));
  } catch (e) {
    console.error(e.code === 'ENOENT' ? 'No corpus. Run the fetch workflow first.' : e.message);
    process.exit(1);
  }
  try {
    gold = JSON.parse(await readFile(GOLD, 'utf8'));
  } catch (e) {
    console.error(e.code === 'ENOENT'
      ? 'No gold set yet. Build one: node research/label.mjs'
      : e.message);
    process.exit(1);
  }

  const byId = new Map(papers.map((p) => [p.arxiv_id, p]));
  const results = [];
  const staleWarnings = [];

  for (const q of questions.filter((x) => gold.questions.includes(x.id))) {
    const rows = [];
    for (const [arxivId, labels] of Object.entries(gold.labels)) {
      const label = labels[q.id];
      if (label === undefined) continue;
      const decision = byId.get(arxivId)?.decisions?.[q.id];
      if (!decision) continue;   // not classified yet — not a disagreement

      /* A label made against one wording scored against another is not
         evidence, and silently counting it would corrupt the one number in
         this project that is supposed to be trustworthy. Dropped, loudly. */
      if (label.question_version !== decision.version) {
        staleWarnings.push(
          `${q.id}: ${arxivId} labelled at v${label.question_version}, classified at v${decision.version}`);
        continue;
      }

      rows.push({
        arxivId,
        gold: label.value,
        probability: decision.probability,
        verdict: decision.verdict,
        choice: decision.choice,
        confidence: decision.confidence,
      });
    }

    if (q.type === 'choice') results.push({ kind: 'choice', ...scoreChoice(q, rows) });
    else if (q.continuous) results.push({ kind: 'continuous', ...scoreContinuous(q, rows) });
    else results.push({ kind: 'noul', ...scoreNoul(q, rows) });
  }

  if (asJson) {
    console.log(JSON.stringify({ cohort: gold.cohort, results, stale: staleWarnings }, null, 2));
    return;
  }

  console.log(`gold cohort seed ${gold.cohort.seed}, ${gold.cohort.arxiv_ids.length} papers, created ${gold.cohort.created}`);
  console.log(`${Object.keys(gold.labels).length} papers carry at least one label`);

  for (const s of results) {
    if (s.kind === 'choice') printChoice(s);
    else if (s.kind === 'continuous') {
      console.log(`\n${s.id}  (continuous — no verdict, so ordering is what is scored)`);
      if (s.spearman === null || s.spearman === undefined) {
        console.log(`  n=${s.n}, too few labels for a rank correlation`);
      } else {
        console.log(`  n=${s.n}  Spearman ${s.spearman.toFixed(2)}`);
      }
    } else printNoul(s);
  }

  if (staleWarnings.length) {
    console.log(`\n${staleWarnings.length} label(s) dropped — question reworded since labelling:`);
    for (const w of staleWarnings.slice(0, 10)) console.log(`  ${w}`);
    if (staleWarnings.length > 10) console.log(`  … and ${staleWarnings.length - 10} more`);
    console.log('  Re-label those papers, or re-classify at the labelled version.');
  }

  const scored = results.filter((r) => r.n > 0);
  if (scored.length === 0) {
    console.log('\nNothing scored yet: label some papers, then classify them (or the reverse).');
  }
}

// Importable for the tests; only runs the report when invoked directly.
if (process.argv[1] && process.argv[1].endsWith('score.mjs')) {
  await main().catch((e) => {
    console.error('score failed:', e.message);
    process.exitCode = 1;
  });
}
