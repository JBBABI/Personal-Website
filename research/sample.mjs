/* ============================================================================
   Stable sampling across the corpus.

   Split out of classify-jev.mjs because the gold set and the classifier have
   to agree on what "sample 7" means. If they disagree, the labels and the
   predictions are about different papers and every agreement rate is fiction.

   THE BUG THIS REPLACES, because it is subtle and will be reinvented:

     candidates.map((p) => ({ p, k: rand() })).sort((a, b) => a.k - b.k)

   That looks seeded and deterministic, and it is — but the key comes from
   calling rand() in ARRAY ORDER, so a paper's key is bound to its INDEX, not
   to the paper. The corpus is sorted by published date descending, so every
   new paper arrives at the front and shifts every index behind it. Measured
   on a 400-paper corpus: prepending twelve newer papers moved the overlap of
   `--sample 7 --limit 20` from 20/20 to 1/20. Two days of arXiv silently
   replaced the entire sample.

   Worse for the gold set specifically: it shuffled `candidates` — the papers
   with unanswered questions — so the pool shrank as work progressed and the
   same seed drew a different population on every subsequent run. The whole
   point of seeding is that the sample holds still while the filter changes.

   The fix is to key on identity instead of position. sha1(seed:arxiv_id) does
   not care where the paper sits in the array, how many papers arrived after
   it, or whether it has been classified already.
   ========================================================================== */

import { createHash } from 'node:crypto';

/**
 * A paper's sort key for a given seed. Depends only on the seed and the
 * paper's identity — never on corpus order, corpus size, or what has already
 * been classified.
 *
 * sha1 rather than a hand-rolled PRNG: not for cryptographic strength, which
 * is irrelevant here, but because it is specified. A Math.random-style LCG
 * would be another thing to get subtly wrong, and this has to stay identical
 * across Node versions and across machines or the gold cohort is not portable.
 */
export function sampleKey(arxivId, seed) {
  return createHash('sha1').update(`${seed}:${arxivId}`).digest('hex');
}

/**
 * The whole corpus in a stable, seed-determined order.
 *
 * Deliberately takes the FULL corpus, not a filtered subset. Callers filter
 * AFTER ordering, so the order is a fixed global ranking that any filter walks
 * down in the same sequence. Filtering first is what made the old sample move
 * as papers got classified.
 */
export function stableOrder(papers, seed) {
  return [...papers]
    .map((p) => ({ p, k: sampleKey(p.arxiv_id, seed) }))
    // Ties would need a deterministic fallback, but a sha1 collision on an
    // arXiv id is not a thing that is going to happen.
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.p);
}

/** The first `n` papers of the stable order. */
export function stableSample(papers, seed, n) {
  return stableOrder(papers, seed).slice(0, n);
}
