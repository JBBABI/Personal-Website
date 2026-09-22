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
  instructions: string;
  /**
   * Option name → what that option means. Jev's API takes descriptions rather
   * than bare labels, which is an improvement: an ambiguous option can be
   * disambiguated in words instead of hoping the label carries it.
   */
  criteria: Readonly<Record<string, string>>;
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
    version: 2,
    instructions: 'What kind of contribution does this paper primarily make?',
    criteria: {
      method: 'Introduces a new technique, model, architecture or system.',
      benchmark: 'Introduces a dataset, benchmark or evaluation methodology.',
      survey: 'Reviews or categorises existing work; a survey or taxonomy.',
      position: 'Argues a viewpoint or proposes a research agenda without new experiments.',
      study: 'Measures or analyses existing systems empirically without proposing a new one.',
      other: 'None of the above fit.',
    },
    minConfidence: 0.6,
  },
  /* --------------------------------------------------------------------------
     TOPIC FACETS

     Nouls, not one Choice, because papers genuinely span topics — a paper on
     memory-poisoning defences is both security and memory, and a Choice would
     force it to lie. Each is an independent claim, so overlap is representable
     and every tag stays separately checkable.

     Nearly free to add: Jev answers all questions in one call and the cost is
     dominated by the abstract, which is sent once regardless.
     ------------------------------------------------------------------------ */
  {
    id: 'topic_security',
    type: 'noul',
    version: 1,
    claim:
      'This paper is about the security, safety or governance of agents — ' +
      'adversarial attacks, prompt or memory poisoning, sandboxing, ' +
      'permissions, oversight, or constraining what an agent is allowed to do.',
    thresholds: { low: 0.3, high: 0.7 },
  },
  {
    id: 'topic_harness',
    type: 'noul',
    version: 1,
    // The term the field uses for the scaffolding around the model. It showed
    // up in two papers of the seed cluster and repeatedly in the first fetch,
    // which is why it is a facet rather than a keyword search.
    claim:
      'This paper is about the harness or scaffolding around a model — the ' +
      'external system mediating how an agent perceives and acts, including ' +
      'its action space, context construction or control loop.',
    thresholds: { low: 0.3, high: 0.7 },
  },
  {
    id: 'topic_memory',
    type: 'noul',
    version: 1,
    claim:
      'This paper is about an agent\'s memory or context over time — ' +
      'retaining information across steps or sessions, context management, ' +
      'or retrieval of past state.',
    thresholds: { low: 0.3, high: 0.7 },
  },
  {
    id: 'topic_evaluation',
    type: 'noul',
    version: 1,
    claim:
      'This paper is about how to measure agents — benchmarks, evaluation ' +
      'methodology, metrics, or testing. Not merely that the paper contains ' +
      'an evaluation, but that measurement is a subject of the work.',
    thresholds: { low: 0.3, high: 0.7 },
  },
  {
    id: 'topic_tool_use',
    type: 'noul',
    version: 1,
    claim:
      'This paper is about agents calling tools, APIs or external systems, ' +
      'including tool selection, tool interfaces and protocols such as MCP.',
    thresholds: { low: 0.3, high: 0.7 },
  },
  {
    id: 'topic_multi_agent',
    type: 'noul',
    version: 1,
    // Replaces the single-vs-multi choice that was parked below: as a noul it
    // needs no "not applicable" option and composes with the other topics.
    claim:
      'This paper involves two or more agents interacting with each other — ' +
      'cooperating, competing, negotiating or coordinating.',
    thresholds: { low: 0.3, high: 0.7 },
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
   NOTES

   Nothing here is a gate. Every answer is a facet stored on the paper; no
   paper is ever excluded from the index by a decision made here. `is_relevant`
   is a sort key and a slider, not an admission test — the first batch returned
   8 yes / 2 review / 0 no, which makes it a weak gate but a usable score.

   Adding a question does not invalidate existing work: the cache is keyed per
   question version, so the six topics above will be asked of papers already
   carrying the first three answers, and those three will not be re-paid for.

   LATER
   - reports_failures    noul:  reports negative results or failure modes
   - human_in_loop       noul:  studies or requires human oversight
   - eval_rigour         score: 0 none · 1 qualitative · 2 one benchmark
                                3 two or more public benchmarks
   - reviewer_concerns   noul:  OpenReview only — reviewers raised
                                reproducibility concerns. No other index
                                offers this one.
   -------------------------------------------------------------------------- */
