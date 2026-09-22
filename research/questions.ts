/* ============================================================================
   THE FILTER DEFINITIONS. THIS FILE IS THE PRODUCT.
   ----------------------------------------------------------------------------
   Every question here is an EXTRACTION, not a rating: a fact a reader could
   check against the paper and agree or disagree with. That is what makes the
   index defensible — "every paper matching X, tagged by Y" is verifiable,
   "my favourites" is taste.

   Rules, learned the hard way:
   - One claim per noul. "Has code AND an eval" is two questions, or you
     cannot tell which half was wrong.
   - Choice options must be exhaustive. Always include an escape hatch, or
     you force a wrong answer on papers that fit nothing.
   - Score levels must be testable. "≥2 public benchmarks", not "solid".
   - Nothing literal, numeric or date-based. Those are Jev's documented weak
     spots (literal reading, arithmetic, date comparison). Exact phrase
     matching, task counts and date ranges are done in plain code instead.

   Changing a question's wording means bumping its `version`. The pipeline
   re-runs only the questions whose version changed, so retuning is cheap.
   ========================================================================== */

export type QuestionId = (typeof questions)[number]['id'];

/** A yes/no claim. Jev returns the calibrated probability that it is true. */
interface Noul {
  id: string;
  type: 'noul';
  version: number;
  /** Stated as a claim about the paper, not as a question. */
  claim: string;
  /** Above `high` is auto-yes, below `low` is auto-no, between routes to a human. */
  thresholds: { low: number; high: number };
}

/** Pick one option. Jev returns the choice plus a probability per option. */
interface Choice {
  id: string;
  type: 'choice';
  version: number;
  prompt: string;
  options: readonly string[];
  /** Below this, the paper is queued for manual review rather than tagged. */
  minConfidence: number;
}

export type Question = Noul | Choice;

/* ----------------------------------------------------------------------------
   V1 — three questions, deliberately.

   The point of v1 is to find out whether the filter agrees with hand labels
   at all. Three questions over 50 papers is enough to answer that and cheap
   enough to throw away. Everything in LATER stays commented out until the
   agreement rates on these three are known.
   -------------------------------------------------------------------------- */

export const questions = [
  {
    id: 'is_relevant',
    type: 'noul',
    version: 1,
    // The load-bearing filter. Everything else is conditional on this being
    // true, so its agreement rate is the one that decides whether the index
    // is worth publishing.
    claim:
      'This paper is about AI agents that decide and act at runtime — planning, ' +
      'calling tools, or executing multi-step tasks — rather than only about ' +
      'language model capabilities such as reasoning, alignment or pretraining.',
    thresholds: { low: 0.25, high: 0.75 },
  },
  {
    id: 'contribution_type',
    type: 'choice',
    version: 1,
    prompt: 'What kind of contribution does this paper primarily make?',
    options: [
      'method or system',
      'benchmark or evaluation',
      'survey or taxonomy',
      'position or vision',
      'empirical study',
      'none of these',
    ],
    minConfidence: 0.6,
  },
  {
    id: 'releases_code',
    type: 'noul',
    version: 1,
    // Kept deliberately narrow: the claim is about what the paper STATES,
    // not about whether a repo actually exists and runs. The second is not
    // checkable from an abstract, and a filter that overreaches is a filter
    // that gets caught being wrong.
    claim:
      'The paper states that source code, an implementation, or a dataset is ' +
      'publicly available.',
    thresholds: { low: 0.3, high: 0.8 },
  },
] as const satisfies readonly Question[];

/* ----------------------------------------------------------------------------
   LATER — do not enable until v1 has measured agreement rates.

   - agent_topology      choice: single-agent / multi-agent / not applicable
   - reports_failures    noul:   reports negative results or failure modes
   - human_in_loop       noul:   studies or requires human oversight
   - eval_rigour         score:  0 none · 1 qualitative · 2 one benchmark
                                 3 two or more public benchmarks
   - reviewer_concerns   noul:   OpenReview only — reviewers raised
                                 reproducibility concerns. No other index
                                 offers this one.
   -------------------------------------------------------------------------- */
