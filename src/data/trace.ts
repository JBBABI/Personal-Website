/* ============================================================================
   EXECUTION TRACE
   ----------------------------------------------------------------------------
   ⚠  `sample: true` means this is STRUCTURAL PLACEHOLDER DATA, not a real run.
      While the flag is true the site renders a visible "sample" notice so
      nothing fabricated can ship by accident.

      To go live: paste a real run's numbers below and set `sample: false`.
      The notice disappears on its own.
   ========================================================================== */

export type StepKind = 'reason' | 'tool' | 'result';

export interface TraceStep {
  n: number;
  kind: StepKind;
  label: string;
  detail: string;
  ms: number;
  tokens: number;
}

export interface Trace {
  sample: boolean;
  runId: string;
  model: string;
  wallMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  status: 'ok' | 'partial' | 'failed';
  steps: TraceStep[];
}

export const trace: Trace = {
  sample: true,
  runId: 'run_0000000000000000',
  model: 'claude-sonnet-4-5',
  wallMs: 47320,
  tokensIn: 128400,
  tokensOut: 6180,
  costUsd: 0.4832,
  status: 'ok',
  steps: [
    { n: 1, kind: 'reason', label: 'Plan',            detail: 'Decomposed the goal into four checks and decided the crawl had to run before the diff.', ms: 3120,  tokens: 412 },
    { n: 2, kind: 'tool',   label: 'fetch_sitemap',   detail: 'GET /sitemap.xml — 1,284 URLs returned, filtered to 212 product pages.',                 ms: 1840,  tokens: 96  },
    { n: 3, kind: 'tool',   label: 'crawl_batch',     detail: 'Fetched 212 pages at concurrency 8. 4 timeouts, retried, all recovered.',                ms: 21400, tokens: 2240 },
    { n: 4, kind: 'reason', label: 'Classify',        detail: 'Flagged 17 pages with thin metadata. Chose to fix titles before descriptions.',          ms: 5880,  tokens: 1310 },
    { n: 5, kind: 'tool',   label: 'write_patch',     detail: 'Generated 17 title tags, validated each under 60 chars, wrote to a branch.',             ms: 9240,  tokens: 1680 },
    { n: 6, kind: 'result', label: 'Done',            detail: 'Opened PR with 17 files changed. No human input required end to end.',                   ms: 5840,  tokens: 442 },
  ],
};
