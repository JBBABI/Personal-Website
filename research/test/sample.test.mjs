/* The property the gold set depends on: a seeded sample must name the same
   papers no matter what else has happened to the corpus.

   This suite exists because the previous implementation looked deterministic
   and was not. It seeded an LCG and shuffled, which is reproducible for a
   fixed input — so it passed every test anyone thought to write — but it
   assigned each paper a key by calling rand() in array order, binding the key
   to the paper's INDEX. The corpus is sorted by publication date descending,
   so new papers land at the front and renumber everything behind them.

   The regression test is the third one: prepend twelve papers and check the
   sample is unmoved. Against the old implementation it returned 1/20. */
import assert from 'node:assert/strict';
import { stableSample, stableOrder, sampleKey } from '../sample.mjs';

const corpus = (ids) => ids.map((id) => ({ arxiv_id: id, published: '2026-01-01' }));
const ids = (ps) => ps.map((p) => p.arxiv_id);

const base = corpus(Array.from({ length: 400 }, (_, i) => `2601.${String(i).padStart(5, '0')}`));

/* 1. The baseline anyone would test: same input, same seed, same answer. */
assert.deepEqual(
  ids(stableSample(base, 7, 20)),
  ids(stableSample(base, 7, 20)),
  'identical inputs give an identical sample',
);

/* 2. Different seeds must actually disagree, or "seeded" means "constant". */
assert.notDeepEqual(
  ids(stableSample(base, 7, 20)),
  ids(stableSample(base, 8, 20)),
  'a different seed draws a different sample',
);

/* 3. THE REGRESSION. Newer papers arrive at the front of a date-sorted
      corpus. Roughly two days of arXiv at the observed ~200/month. */
const withNewer = [...corpus(['2699.00001', '2699.00002', '2699.00003', '2699.00004',
  '2699.00005', '2699.00006', '2699.00007', '2699.00008', '2699.00009', '2699.00010',
  '2699.00011', '2699.00012']), ...base];

const before = ids(stableSample(base, 7, 20));
const after = ids(stableSample(withNewer, 7, 20)).filter((id) => !id.startsWith('2699'));
const kept = before.filter((id) => after.includes(id));
assert.ok(
  kept.length >= 19,
  `newer papers must not displace the cohort — kept ${kept.length}/20 of the original sample`,
);

/* 4. Corpus ORDER must not matter at all. A re-fetch, a re-sort, a different
      arXiv page size: none of them may move the sample. */
assert.deepEqual(
  ids(stableSample(base, 7, 20)).sort(),
  ids(stableSample([...base].reverse(), 7, 20)).sort(),
  'sample is independent of the order papers arrive in',
);

/* 5. The second failure mode, which bit the gold set specifically: the old
      code shuffled only the papers with unanswered questions, so the pool
      shrank as work progressed. Removing papers must not renumber the rest —
      the survivors keep their relative order. */
const drawn = new Set(ids(stableSample(base, 7, 20)));
const remaining = base.filter((p) => !drawn.has(p.arxiv_id));
const fullOrder = ids(stableOrder(base, 7));
const remainingOrder = ids(stableOrder(remaining, 7));
assert.deepEqual(
  remainingOrder,
  fullOrder.filter((id) => !drawn.has(id)),
  'classifying papers must not reshuffle the ones left',
);

/* 6. The key is a pure function of seed and identity. This is what makes a
      cohort portable between machines and stable across Node versions. */
assert.equal(sampleKey('2606.05608', 7), sampleKey('2606.05608', 7));
assert.notEqual(sampleKey('2606.05608', 7), sampleKey('2606.05608', 8));
assert.equal(
  sampleKey('2606.05608', 7),
  // Pinned literal: if this ever changes, every existing gold cohort silently
  // refers to different papers. It must fail loudly instead.
  '1b1bf092b8c4ce343c7d148cdef58ad16499bc7e',
  'the hash must not drift — gold cohorts are keyed on it',
);

/* 7. Asking for more than exists returns everything, not undefined padding. */
assert.equal(stableSample(corpus(['a', 'b']), 7, 10).length, 2);

console.log('PASS — sampling is keyed on identity, not position');
