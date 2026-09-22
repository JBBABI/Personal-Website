/* The one property that makes a gold set worth building: the labeller must
   never be able to show you Jev's answer.

   If a prediction reaches the screen before the label is given, agreement
   stops measuring accuracy and starts measuring how persuasive the model is.
   That failure is invisible afterwards — a contaminated 95% and an honest 95%
   are the same string — so it has to be caught here, mechanically, rather
   than trusted to whoever is labelling at midnight.

   The test drives the real tool over a real corpus whose decisions are
   deliberately distinctive, then greps the entire transcript for them. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { PAPERS as DATA, GOLD } from '../paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, '..', 'label.mjs');

await mkdir(dirname(DATA), { recursive: true });
await rm(GOLD, { force: true });

/* Decision values chosen so they cannot appear by accident: no real abstract
   contains "0.8237", and "benchmark" is a contribution_type the labeller will
   not be told about. If any of these reach stdout, blinding has failed. */
await writeFile(DATA, JSON.stringify([
  {
    arxiv_id: '2606.05608', version: 1, published: '2026-06-04',
    title: 'Agentic Software: How AI Agents Are Restructuring the Software Paradigm',
    abstract: 'We describe how agents restructure software. Code is at example.org/repo.',
    categories: ['cs.AI'], url: 'https://arxiv.org/abs/2606.05608',
    decisions: {
      is_relevant: { version: 1, probability: 0.8237, verdict: 'yes' },
      releases_code: { version: 1, probability: 0.9418, verdict: 'yes' },
      contribution_type: { version: 2, choice: 'benchmark', confidence: 0.7391, verdict: 'ok' },
    },
  },
  {
    arxiv_id: '2602.14690', version: 1, published: '2026-02-20',
    title: 'Harness Engineering for Long-Running Agents',
    abstract: 'A study of control loops in agent harnesses.',
    categories: ['cs.SE'], url: 'https://arxiv.org/abs/2602.14690',
    decisions: {
      is_relevant: { version: 1, probability: 0.6152, verdict: 'review' },
      releases_code: { version: 1, probability: 0.1073, verdict: 'no' },
      contribution_type: { version: 2, choice: 'study', confidence: 0.8864, verdict: 'ok' },
    },
  },
], null, 2));

/* Two papers, three facets. The tool asks in the order the facets are
   AUTHORED in questions.ts, not the order they are named on the command
   line — one canonical sequence, so a session interrupted and resumed with a
   different --questions list still asks the same thing in the same place.
   That order is: is_relevant, contribution_type, releases_code. */
const answers = ['y', '1', 'y', 'n', '5', 'n'].join('\n') + '\n';

const run = spawnSync(process.execPath, [TOOL], { input: answers, encoding: 'utf8' });
const transcript = run.stdout + run.stderr;
assert.equal(run.status, 0, `label.mjs exited ${run.status}\n${transcript}`);

/* THE ASSERTION THIS FILE EXISTS FOR. */
for (const leak of ['0.8237', '0.9418', '0.7391', '0.6152', '0.1073', '0.8864']) {
  assert.ok(!transcript.includes(leak), `prediction ${leak} leaked into the labelling transcript`);
}
/* The predicted CHOICE cannot be used as a canary: every option name is
   necessarily printed as part of the answer menu, so "benchmark" appearing
   proves nothing either way. The structural markers can be, though — nothing
   from a stored decision object has any business reaching the screen. */
for (const marker of ['verdict', 'probability', 'confidence', 'decisions']) {
  assert.ok(!transcript.includes(marker), `decision field "${marker}" leaked into the transcript`);
}

// And the abstract must still be there, or the tool shows nothing to judge.
assert.ok(transcript.includes('restructure software'), 'abstract is rendered');
assert.ok(transcript.includes('2606.05608'), 'paper id is rendered');

/* ---- what got written -------------------------------------------------- */

const gold = JSON.parse(await readFile(GOLD, 'utf8'));
assert.equal(gold.cohort.arxiv_ids.length, 2, 'cohort frozen as an explicit id list');
assert.deepEqual(gold.questions, ['is_relevant', 'releases_code', 'contribution_type']);

const first = gold.labels['2606.05608'];
const second = gold.labels['2602.14690'];
assert.ok(first && second, 'both papers labelled');

// The cohort order is the stable sample order, not corpus order, so find the
// labels by what was answered rather than assuming which paper came first.
const yesPaper = first.is_relevant.value === 'yes' ? first : second;
const noPaper = first.is_relevant.value === 'yes' ? second : first;
assert.equal(yesPaper.releases_code.value, 'yes');
assert.equal(yesPaper.contribution_type.value, 'method', '1 maps to the first criterion');
assert.equal(noPaper.releases_code.value, 'no');
assert.equal(noPaper.contribution_type.value, 'study', '5 maps to the fifth criterion');

/* The label records the question version it was made against. Without it, a
   reworded question silently rescores old labels against new wording, which
   is a corrupt number that still looks like a number. */
assert.equal(yesPaper.is_relevant.question_version, 1);
assert.equal(yesPaper.contribution_type.question_version, 2);

/* ---- resuming ----------------------------------------------------------- */

/* Sixty papers is several sittings, so a second run must find nothing left to
   do and must not re-ask or overwrite. Empty stdin: if it asks anything, it
   gets EOF and fails rather than hanging. */
const again = spawnSync(process.execPath, [TOOL], { input: '', encoding: 'utf8' });
assert.equal(again.status, 0, `resume run exited ${again.status}\n${again.stdout}${again.stderr}`);
assert.ok(/2\/2 papers fully labelled/.test(again.stdout), `resume did not see prior work:\n${again.stdout}`);

const unchanged = JSON.parse(await readFile(GOLD, 'utf8'));
assert.deepEqual(unchanged.labels, gold.labels, 'resuming must not disturb existing labels');

/* ---- refusing to merge two different samples ---------------------------- */

/* Relabelling under a different seed would quietly mix papers from two
   samples into one file that still looks like a single gold set. */
const wrongSeed = spawnSync(process.execPath, [TOOL, '--seed', '99'], { input: '', encoding: 'utf8' });
assert.notEqual(wrongSeed.status, 0, 'a mismatched cohort must be refused, not merged');
assert.ok(/must not be merged/.test(wrongSeed.stderr), wrongSeed.stderr);

/* ---- input ending mid-session ------------------------------------------ */

/* Ctrl-D, or a pipe running dry, must save and exit cleanly. Before the
   'close' handler existed this left rl.question's promise pending forever and
   Node exited 13 on the unsettled await, printing a stack trace over the
   transcript. The labels happened to survive because each answer is written
   through as it is given — but "the bug was harmless because of an unrelated
   decision" is not a property to rely on. */
await rm(GOLD, { force: true });
const partial = spawnSync(process.execPath, [TOOL], { input: 'y\n1\n', encoding: 'utf8' });
assert.equal(partial.status, 0, `ending input must exit cleanly, got ${partial.status}\n${partial.stderr}`);
assert.ok(/stopped early/.test(partial.stdout), 'early stop is reported');

const saved = JSON.parse(await readFile(GOLD, 'utf8'));
const answered = Object.values(saved.labels)[0];
assert.equal(answered.is_relevant.value, 'yes', 'answers given before EOF are kept');
assert.equal(answered.contribution_type.value, 'method');
assert.equal(answered.releases_code, undefined, 'the unanswered facet is absent, not guessed');

/* And that partial work resumes rather than restarting. */
const resumed = spawnSync(process.execPath, [TOOL, '--status'], { input: '', encoding: 'utf8' });
assert.ok(/0\/2 papers fully labelled/.test(resumed.stdout), resumed.stdout);

await rm(GOLD, { force: true });
console.log('PASS — labelling is blind by construction, resumable, and cohort-safe');
