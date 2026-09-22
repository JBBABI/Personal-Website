/* The statistics behind the number that goes on the page.

   These are worth testing properly rather than eyeballing, because a wrong
   agreement rate does not look wrong — it looks like a result. Every case
   here is hand-checkable. */
import assert from 'node:assert/strict';
import { wilson, spearman, calibration } from '../score.mjs';

/* ---- Wilson interval ---------------------------------------------------- */

/* The reason this interval was chosen over the textbook normal one. At 60/60
   the normal approximation gives 100% ± 0, claiming certainty from sixty
   papers. Wilson keeps a floor below 1 and never runs past it. */
const perfect = wilson(60, 60);
assert.ok(perfect.high <= 1, 'interval cannot exceed 100%');
assert.ok(perfect.low > 0.9 && perfect.low < 1, `60/60 should not read as certain, got ${perfect.low}`);

/* The published headline case: 91% of 60. Should land near 81–96%. */
const headline = wilson(55, 60);
assert.ok(headline.low > 0.80 && headline.low < 0.84, `low was ${headline.low}`);
assert.ok(headline.high > 0.95 && headline.high < 0.98, `high was ${headline.high}`);

/* Symmetric case, and the one that catches an inverted sign. */
const half = wilson(30, 60);
assert.ok(Math.abs((half.low + half.high) / 2 - 0.5) < 0.001, 'interval centred at 50%');

/* Small n must produce a wide interval, not a confident one. This is the
   guard against publishing "100%, n=3". */
const tiny = wilson(3, 3);
assert.ok(tiny.low < 0.5, `n=3 must stay humble, got low=${tiny.low}`);

assert.deepEqual(wilson(0, 0), { low: 0, high: 1 }, 'no data means no claim');

/* ---- Spearman ----------------------------------------------------------- */

/* Perfect agreement in ORDER, deliberately on different scales: the gold
   labels are 0-4 integers and Jev returns probabilities. Rank correlation is
   used precisely so the two never need to be on the same scale. */
assert.equal(
  spearman([0, 1, 2, 3, 4], [0.05, 0.2, 0.5, 0.8, 0.99]),
  1,
  'monotonic agreement scores 1 regardless of scale',
);
assert.equal(
  spearman([0, 1, 2, 3, 4], [0.99, 0.8, 0.5, 0.2, 0.05]),
  -1,
  'perfectly inverted scores -1',
);

/* Ties are the normal case for a 0-4 scale — most papers will be 0 or 1 —
   so averaged ranks have to be right or every continuous facet is mismeasured. */
const tied = spearman([1, 1, 1, 3, 4], [0.1, 0.2, 0.3, 0.8, 0.9]);
assert.ok(tied > 0.8 && tied <= 1, `ties must not break the correlation, got ${tied}`);

/* A constant gold column has no order to correlate with. Returning null
   rather than NaN keeps it out of the report instead of printing "NaN". */
assert.equal(spearman([2, 2, 2, 2], [0.1, 0.5, 0.7, 0.9]), null);
assert.equal(spearman([1, 2], [0.1, 0.9]), null, 'n<3 is not a correlation');

/* ---- Calibration -------------------------------------------------------- */

/* A perfectly calibrated facet: of ten papers called 0.9, nine are true.
   ECE should be ~0 and nothing should be flagged. */
const good = calibration([
  ...Array(9).fill([0.9, true]),
  [0.9, false],
]);
const b90 = good.buckets.find((b) => b.lo === 0.9);
assert.equal(b90.n, 10);
assert.ok(Math.abs(b90.observed - 0.9) < 0.001, 'observed matches predicted');
assert.ok(good.ece < 0.01, `well-calibrated ECE should be ~0, got ${good.ece}`);

/* The failure this whole script exists to detect: confident and wrong.
   Ten papers called 0.95, half of them false. This is what `contribution_type`
   returning confidence 1.00 on seven papers in ten would look like if that
   confidence were not real. */
const overconfident = calibration([
  ...Array(5).fill([0.95, true]),
  ...Array(5).fill([0.95, false]),
]);
assert.ok(overconfident.ece > 0.4, `overconfidence must show up large, got ${overconfident.ece}`);
const bad = overconfident.buckets.find((b) => b.lo === 0.9);
assert.ok(Math.abs(bad.observed - bad.predicted) > 0.15, 'gap must exceed the report threshold');

/* Empty buckets must survive as zero-count entries rather than vanishing or
   contributing NaN to the ECE. */
const sparse = calibration([[0.95, true], [0.95, true]]);
assert.ok(sparse.buckets.some((b) => b.n === 0), 'empty bands are kept');
assert.ok(Number.isFinite(sparse.ece), 'empty bands do not poison the ECE');

/* Every prediction must land in exactly one bucket, including 1.0 — an
   endpoint dropped on the floor would silently omit the most confident
   answers, which are the ones under suspicion. */
const total = calibration([[0, false], [0.5, true], [1, true]])
  .buckets.reduce((s, b) => s + b.n, 0);
assert.equal(total, 3, 'probabilities 0 and 1 are both counted');

console.log('PASS — agreement, calibration and rank correlation are sound');
