# Research index — pipeline

An index of papers on agentic software and agentic engineering: everything
matching the seed terms, tagged by filters you can check. Not a "best papers"
list. The distinction matters — "every paper matching X, tagged by Y" is
falsifiable, "my favourites" is taste, and only the first can be a reference.

## Status

**v1. Deliberately small: one source, three questions.** The point of v1 is to
find out whether the filter agrees with hand labels at all. If it does not,
that is an afternoon lost instead of a month. Nothing here is wired to the
website yet.

## Shape

```
fetch-arxiv.mjs   gathers candidates          → data/papers.json
questions.ts      the filter definitions        (this file is the product)
classify-jev.mjs  adds typed decisions        → data/papers.json
test/             stubbed end-to-end tests      (no network, no API key)
```

One JSON file, committed to the repo. No database: at this scale git *is* the
database, and it gives a free audit trail — every classification change shows
up as a reviewable diff.

## Running it

```bash
node research/fetch-arxiv.mjs --max 200      # no key needed, arXiv is open
node research/classify-jev.mjs --dry-run     # inspect payloads, send nothing
JEV_API_KEY=… node research/classify-jev.mjs
node --test research/test/                   # all three suites, offline
```

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
when you reword it and only that question re-runs.

## Division of labour

Jev handles classification. Plain code handles everything Jev is documented to
be bad at — literal reading, arithmetic, date comparison. So exact phrase
matching, task counts and date ranges never go to the model. This is not
caution for its own sake: those are the failure modes TypeSafe publishes.

## Verification — do this before publishing anything

The index is only worth as much as its measured error rate.

1. **Build a gold set.** Hand-label 50–100 papers yourself, *before* looking at
   Jev's answers. Order matters: seeing the model's answer first contaminates
   the label, and then you are measuring nothing.
2. **Agreement rate per question.** `is_relevant` is load-bearing — everything
   else is conditional on it — so its number is the one that decides whether
   to publish.
3. **Calibration.** Bucket predictions by probability and check that ~90% of
   the things called 0.9 are actually true. Jev returns calibrated
   probabilities; this is the test of whether that holds on *your* questions.
   If it does, the thresholds are trustworthy. If it does not, you will see
   exactly which band is off and can move it.
4. **Spot-check ~10 random papers per run**, forever. Drift is real.
5. **Publish the numbers on the page.** "Agrees with my hand labels 91% of the
   time, n=100" is a claim no competing feed makes. It is also the only honest
   way to present machine-tagged data.

The middle band is the quality gate. Anything Jev is unsure about lands as
`verdict: 'review'` and waits for a person, rather than being guessed at
confidently.

## Next, in order

1. Measure the three v1 questions against the gold set.
2. Enable the questions parked at the bottom of `questions.ts`.
3. Add OpenReview — highest marginal value, because its public reviews unlock
   a filter nobody else has ("did reviewers raise reproducibility concerns?").
4. Then ACL Anthology and OpenAlex. Deduplication is the real cost of going
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
    "is_relevant":       { "type": "noul",   "noul": 0.95, "confidence": 0.95 },
    "contribution_type": { "type": "choice", "choice": "method",
                           "confidence": 0.98, "probabilities": { … } } } }
```

Three things that are easy to get wrong: `questions` is an **object keyed by
id**, not an array; a noul's value is in **`noul`**, not `probability`; and
choice options are a **`criteria` map of name → description**, not a list of
labels. The last is an improvement — an ambiguous option can be disambiguated
in words rather than hoping the label carries it.

Override with `JEV_ENDPOINT` and `JEV_MODEL` if either moves.

Jev is also served through OpenRouter, Cloudflare Workers AI, Vercel and
Netlify gateways, each with its own endpoint.
