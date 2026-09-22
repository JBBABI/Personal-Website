/* ============================================================================
   Where the data lives.

   Centralised for one specific reason: the corpus is now a COMMITTED file,
   and the test suites delete it between runs to keep one suite from masking a
   bug in the next. Those two facts together mean `npm run research:test`
   would destroy real classifications — hundreds of papers and every hand
   label — as a side effect of running the tests. Nobody would suspect the
   test command.

   So the tests redirect these paths to a throwaway directory instead, and the
   deletion they do is deletion of their own fixtures.
   ========================================================================== */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Overridden by the test runner. Nothing else should set it. */
export const DATA_DIR = process.env.RESEARCH_DATA_DIR || join(HERE, 'data');

export const PAPERS = join(DATA_DIR, 'papers.json');
export const GOLD = join(DATA_DIR, 'gold.json');
