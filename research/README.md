# Research index — pipeline

An index of papers on agentic software and agentic engineering: everything
matching the seed terms, tagged by filters you can check. Not a "best papers"
list. The distinction matters — "every paper matching X, tagged by Y" is
falsifiable, "my favourites" is taste, and only the first can be a reference.

## Status

**One source, nine facets, and no measured accuracy yet.** Everything reported
so far — the topic distributions, the review rates — came from Jev's own output
being used to judge Jev's own output. Four rounds of tuning ran on that signal,
which means none of those numbers are evidence of anything. `label.mjs` and
`score.mjs` exist to replace them with a measurement. Until that has been run,
treat every figure in this project as unverified. Nothing is wired to the
website yet.

## Shape

```
fetch-arxiv.mjs   gathers candidates          → data/papers.json
questions.ts      the filter definitions        (this file is the product)
classify-jev.mjs  adds typed decisions        → data/papers.json
sample.mjs        stable cohort selection       (shared by classify + label)
label.mjs         hand-labelling, blinded     → data/gold.json
score.mjs         agreement + calibration       (reads both, writes nothing)
report.mjs        prints decisions and spreads
paths.mjs         where the data lives
test/             stubbed end-to-end tests      (no network, no API key)
```

Two JSON files, both committed to the repo. No database: at this scale git *is*
the database, and it gives a free audit trail — every classification change
shows up as a reviewable diff.

Committing them is not incidental. They were previously written only as CI
artifacts with 30-day retention, so a decision could not outlive the run that
paid for it and the per-question cache never had a file to cache into. Every
classify run silently re-bought the whole corpus.

## Running it

```bash
node research/fetch-arxiv.mjs --max 400      # no key needed, arXiv is open
node research/classify-jev.mjs --dry-run     # inspect payloads, send nothing
node --env-file=.env research/classify-jev.mjs --limit 50 --sample 7
npm run research:label                       # hand-label the gold cohort
npm run research:score                       # agreement + calibration
npm run research:test                        # all six suites, offline
```

The tests run against a throwaway directory, never `research/data`. They delete
their fixtures between suites, and pointed at the real directory `npm run
research:test` would destroy the corpus and every hand label as a side effect
of running the tests — which is not a thing anyone would think to suspect.

`fetch` and `classify` are both idempotent: re-running adds new papers and
leaves paid-for decisions alone. A paper revised on arXiv drops its stale
decisions and gets re-classified, because a changed abstract can change the
answer.

## The two rules that keep retuning cheap

**Probabilities are stored, not booleans.** `has_code: 0.94`, never
`has_code: true`. Thresholds are applied at display time, so moving one costs
nothing. Store the boolean and every change of mind means re-paying for the
whole corpus.

**Decisions are cached per question version.** Bump a question's `version`
when you reword it and only that question re-runs. Gold labels carry the
version they were made against too, and `score.mjs` drops any label whose
version no longer matches rather than scoring it against wording it never saw.

**Samples are keyed on identity, not position.** `--sample 7` names the same
papers whatever else has changed. The first implementation looked deterministic
and was not: it assigned each paper a sort key by calling a seeded PRNG in
array order, binding the key to the paper's *index*. Since the corpus is sorted
by date descending, every new paper shifted everything behind it — measured,
twelve new papers moved the overlap of a 20-paper sample from 20/20 to 1/20.
A gold set on that footing cannot be re-measured after a retune, which is the
only thing a gold set is for. See the header of `sample.mjs`.

## Division of labour

Jev handles classification. Plain code handles everything Jev is documented to
be bad at — literal reading, arithmetic, date comparison. So exact phrase
matching, task counts and date ranges never go to the model. This is not
caution for its own sake: those are the failure modes TypeSafe publishes.

## Verification — do this before publishing anything

The index is only worth as much as its measured error rate.

1. **Build a gold set.** `npm run research:label`. Sixty papers drawn across
   the corpus, labelled *before* looking at Jev's answers. Order matters:
   seeing the model's answer first does not merely bias the label, it destroys
   it — agreement then measures how persuasive the model is.

   The tool does not ask you to resist looking. It strips `decisions` off
   every paper as it loads them, so there is nothing on screen to resist at
   1am on the fortieth paper. A test greps the whole transcript for planted
   prediction values and fails if any reaches stdout.

   It is resumable and writes through on every answer, because sixty papers
   across three facets is several sittings and none of them should be one
   Ctrl-C away from nothing.

2. **Agreement rate per question.** `npm run research:score`. `is_relevant` is
   load-bearing — everything else is conditional on it — so its number is the
   one that decides whether to publish.

   Read it next to the base rate printed beside it. A facet that is 5% true
   scores 95% by answering "no" every time; when agreement and base rate are
   the same number the filter has learned nothing. The report says so
   explicitly rather than leaving it to be noticed.

3. **Calibration.** Bucket predictions by probability and check that ~90% of
   the things called 0.9 are actually true. Jev returns calibrated
   probabilities; this is the test of whether that holds on *your* questions.
   If it does, the thresholds are trustworthy. If it does not, you will see
   exactly which band is off and can move it.

   A band is only flagged when the stated probability falls outside the
   confidence interval of what was observed, not merely when the two point
   estimates differ. On sixty papers a bucket holds eight, and eight papers at
   16% predicted will often return zero true by luck — flagging that sends you
   rewording a question that was never broken, and teaches you to ignore the
   flag.

4. **Spot-check ~10 random papers per run**, forever. Drift is real.

5. **Publish the numbers on the page, with their interval.** "Agrees with my
   hand labels 91% of the time, n=60" is a claim no competing feed makes. But
   sixty papers cannot support three significant figures: that 91% is really
   81–96%, and `score.mjs` prints the interval for exactly that reason.
   Publishing the point estimate alone would be the same overreach the
   questions were carefully written to avoid.

The middle band is the quality gate. Anything Jev is unsure about lands as
`verdict: 'review'` and waits for a person, rather than being guessed at
confidently.

## Next, in order

1. Rebuild the corpus (the fetch workflow) and classify a batch.
2. Label the gold cohort and run `score.mjs`. Two things it should settle
   first: whether `releases_code` is genuinely easy or just pattern-matching
   on the presence of a URL — it came back almost perfectly bimodal — and
   whether `contribution_type` returning confidence 1.00 on roughly seven
   papers in ten is real confidence or a model with no sense of its own
   uncertainty. A classifier that is never unsure is precisely what
   calibration testing exists to catch.
3. Widen the gold set to the topic facets on the same cohort. The expensive
   part is reading the abstract; the marginal facet is nearly free.
4. Enable the questions parked at the bottom of `questions.ts`.
5. Add OpenReview — highest marginal value, because its public reviews unlock
   a filter nobody else has ("did reviewers raise reproducibility concerns?").
6. Then ACL Anthology and OpenAlex. Deduplication is the real cost of going
   multi-source: the same paper appears under four IDs with slightly different
   titles. `source` is already a field so the schema will not need rewriting.

## Seed terms

Taken from the cluster around [2606.05608](https://arxiv.org/abs/2606.05608)
(*Agentic Software: How AI Agents Are Restructuring the Software Paradigm*),
not invented. `harness engineering` earns its place by appearing in two
separate papers in that cluster — it is not a term an outsider would guess.

Widen the list only with evidence. Every term added is noise the filter then
has to remove.

## The Jev API

Confirmed against the quickstart and cookbook after a first guess returned 404.

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $JEV_API_KEY

{ "model": "jev-1.13.0",
  "state": "…text…",
  "questions": {
    "is_relevant":       { "type": "noul",   "instructions": "…" },
    "contribution_type": { "type": "choice", "instructions": "…",
                           "criteria": { "method": "…", "other": "…" } } } }
```

```
{ "answers": {
    "is_relevant":       { "type": "noul",   "noul": 0.95 },
    "contribution_type": { "type": "choice", "choice": "method",
                           "confidence": 0.98, "probabilities": { … } } } }
```

Three things that are easy to get wrong: `questions` is an **object keyed by
id**, not an array; a noul's value is in **`noul`**, not `probability`, and
carries **no confidence field** (only choices do); and
choice options are a **`criteria` map of name → description**, not a list of
labels. The last is an improvement — an ambiguous option can be disambiguated
in words rather than hoping the label carries it.

Override with `JEV_ENDPOINT` and `JEV_MODEL` if either moves.

Jev is also served through OpenRouter, Cloudflare Workers AI, Vercel and
Netlify gateways, each with its own endpoint.
