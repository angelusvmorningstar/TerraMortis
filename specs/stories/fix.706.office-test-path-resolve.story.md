---
title: 'Fix fs.readFileSync relative paths in office test'
type: 'fix'
issue: 706
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/706
branch: morningstar-issue-706-fix-test-readfile-path
created: '2026-06-16'
status: done
recommended_model: 'haiku — one-liner path fix, no logic'
context:
  - server/tests/feature.691.hos-city-status-power.test.js
---

## Intent

`server/tests/feature.691.hos-city-status-power.test.js` failed to load under
vitest because six `fs.readFileSync` calls used repo-root-relative path strings
(e.g. `'server/routes/office-actions.js'`). Vitest runs with `cwd = server/`,
so each path resolved to `server/server/...` → ENOENT.

Fix: anchor all paths to `import.meta.dirname` using `resolve()`, following
the established pattern in `rule_engine_grep.test.js:17`.

---

## Fix

**File:** `server/tests/feature.691.hos-city-status-power.test.js`

Added `import { resolve } from 'path'` and `const REPO_ROOT = resolve(import.meta.dirname, '../../')`.
Replaced all six bare string paths with `resolve(REPO_ROOT, '<path>')`.

No logic changes. Feature itself (`server/routes/office-actions.js`) untouched.

---

## Dev Agent Record

### Files changed

- `server/tests/feature.691.hos-city-status-power.test.js` — added path import, REPO_ROOT anchor, replaced 6 readFileSync paths

### Completion notes

31/31 tests pass. Pattern matches `rule_engine_grep.test.js:17`.
