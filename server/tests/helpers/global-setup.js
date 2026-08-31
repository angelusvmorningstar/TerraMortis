/**
 * Vitest global setup — #1117 infrastructure precondition, fail-fast.
 *
 * Runs exactly ONCE, before any worker spins up (distinct from `setupFiles`,
 * which re-runs per test file — see setup-env.js's own note on why that
 * distinction matters here). This is what "the run refuses to start" means
 * in practice: nothing else happens if this throws.
 *
 * Without this, missing local infrastructure produces misleading output
 * instead of an honest abort:
 *   - mongod down: ~38 DB-backed files skip wholesale (over half the suite
 *     becomes inert). A skipped test cannot fail, so a real regression
 *     passes in silence.
 *   - the untracked markdown/ corpus absent: uplift-power-rules-text.js's
 *     loadAllBlocks() guards each book with existsSync and continues rather
 *     than throwing, so the affected tests fail individually with
 *     content-shaped messages ("expected [] to equal [...]") that read as a
 *     real content bug, not a missing local artefact.
 *
 * Both failure modes are worse than an honest abort: "the gate proves
 * nothing" looks identical to "the gate passed". This makes the run refuse
 * to start instead, with one message naming exactly what's missing — the
 * only version that cannot be misread.
 *
 * markdown/ tracking decision (the issue's own open question): left
 * untracked deliberately, not resolved here. It may be licensed rulebook
 * text that cannot be committed — that's Angelus's call, not a dev-story
 * one. This precondition converts the absence from silent to loud either
 * way, which is the whole fix regardless of that answer.
 */

import { MongoClient } from 'mongodb';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MARKDOWN_DIR = path.join(REPO_ROOT, 'markdown');

// globalSetup runs outside the worker context setupFiles/dotenv normally
// populate — load server/.env explicitly rather than assuming it's already
// in process.env.
dotenv.config({ path: path.join(REPO_ROOT, 'server', '.env') });

async function checkMongoReachable() {
  const uri = (process.env.MONGODB_URI || '').replace(/[&?]ssl=[^&]*/g, '');
  if (!uri) return 'MONGODB_URI is not set (check server/.env)';
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  try {
    await client.connect();
    await client.db('tm_game_test').admin().ping();
    return null;
  } catch (err) {
    return `mongod unreachable at the configured MONGODB_URI (${err.message})`;
  } finally {
    await client.close().catch(() => {});
  }
}

function checkMarkdownCorpus() {
  if (!existsSync(MARKDOWN_DIR)) {
    return `markdown/ not found at ${MARKDOWN_DIR} (untracked local artefact — see server/scripts/uplift-power-rules-text.js)`;
  }
  const entries = readdirSync(MARKDOWN_DIR).filter(f => !f.startsWith('.'));
  if (entries.length === 0) {
    return `markdown/ exists at ${MARKDOWN_DIR} but is empty`;
  }
  return null;
}

export default async function globalSetup() {
  const [mongoProblem, markdownProblem] = await Promise.all([
    checkMongoReachable(),
    Promise.resolve(checkMarkdownCorpus()),
  ]);
  const problems = [mongoProblem, markdownProblem].filter(Boolean);

  if (problems.length > 0) {
    const message = [
      '',
      '✖ Test suite infrastructure precondition failed — refusing to start (#1117):',
      '',
      ...problems.map(p => `  - ${p}`),
      '',
      'Both mongod and the local markdown/ corpus must be present before running the server suite.'
        + ' Without this check, missing infrastructure produces misleading test failures instead of'
        + ' an honest abort. See #1117 for the full reasoning.',
      '',
    ].join('\n');
    console.error(message);
    throw new Error('Infrastructure precondition failed — see above.');
  }
}
