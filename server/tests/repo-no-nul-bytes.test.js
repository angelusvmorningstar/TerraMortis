/**
 * Repo hygiene: no source or spec file may contain a NUL byte.
 *
 * Added by BL-2's code review (2026-08-10) after the same defect appeared
 * THREE times in one session — a string literal intended to hold a separator
 * being written as a raw NUL character instead.
 *
 * Why it matters more than it sounds. Git classifies any file containing a NUL
 * as BINARY. The file still parses, the tests still pass, and the repo's
 * pre-commit hook only parse-checks staged JS — so nothing catches it. What
 * you get is a source file that renders as "Binary file not shown" in every
 * pull request, never produces a readable diff, and cannot merge cleanly. In
 * BL-2 the affected file was `bloodlines-cache.js`, the module at the centre of
 * the epic, and it was caught only because a reviewer noticed the diff was
 * missing.
 *
 * Cheap to run, and it fails loudly on exactly the thing that is otherwise
 * invisible until review.
 *
 * The explicit timeout is not decoration. This is a synchronous walk over
 * several thousand files, and on a cold filesystem cache under a parallel run
 * it takes 9-16 seconds where the same scan takes 165ms warm and alone. At
 * vitest's 5s default it therefore went red on the FIRST file of a batch and
 * green on every run after, which BL-4's record wrote down as "a false alarm
 * from a file mid-write" — a plausible explanation for the wrong cause.
 * Reproduced and diagnosed by BL-4's review; a NUL byte is a fact about a
 * file, so this test must only ever be red for that reason.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SCAN_DIRS = ['public/js', 'public/css', 'server/routes', 'server/schemas', 'server/lib', 'server/tests', 'specs/stories'];
const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.md', '.yaml', '.yml', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'archive']);

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (SCAN_EXT.has(path.extname(e.name))) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

describe('repo hygiene — no NUL bytes in text files', () => {
  it('every source and spec file is text as far as git is concerned', () => {
    const offenders = [];
    for (const rel of SCAN_DIRS) {
      for (const file of walk(path.join(REPO_ROOT, rel))) {
        const buf = fs.readFileSync(file);
        const at = buf.indexOf(0);
        if (at >= 0) {
          offenders.push(`${path.relative(REPO_ROOT, file).replace(/\\/g, '/')} (byte ${at})`);
        }
      }
    }
    expect(offenders, 'a NUL byte makes git treat the file as binary: no diff, no clean merge').toEqual([]);
  }, 60_000);
});
