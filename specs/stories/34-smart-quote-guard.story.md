---
id: issue-34
issue: 34
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/34
branch: issue-34-smart-quote-guard
status: ready-for-review
priority: medium
depends_on: []
---

# Story #34: Pre-tool-use guard against smart-quote-as-syntax in `public/js/`

As a developer about to land a JS edit on this codebase,
I should have an automated guard that fails my workflow when typographic quotes (U+2018 `'`, U+2019 `'`, U+201C `"`, U+201D `"`) are used as JavaScript syntax (string delimiters) rather than string content,
So that the class of regression from PR #28 / hotfix PR #32 cannot recur.

This is permitted under the architectural-reset freeze as audit-finding cleanup tied to the post-mortem on PR #32.

---

## Context

PR #28 (issue #24, story free-text NPC fields) introduced `renderPersonalStorySection` in `public/js/tabs/downtime-form.js:3745-3777` with smart quotes (likely an editor auto-conversion) as string delimiters. JavaScript can't parse these as quotes; the entire module threw `Invalid or unexpected token` on import. Production was unusable for the player downtime form until PR #32 hotfixed it.

The fix is a parse-only check: if a JS file fails `node --input-type=module --check`, the developer is told before the bad commit lands. Smart quotes inside string content are syntactically valid (e.g. body text in HTML templates that legitimately uses `'` in user-facing copy) and naturally pass the check. Only smart quotes used as **string delimiters** are caught.

### Files in scope

1. **`.githooks/pre-commit`** (new) — shell script that runs `node --input-type=module --check` on every staged `public/js/**/*.js` file. Fails with a clear error if any file errors.
2. **`.githooks/README.md`** (new) — documents what the hook does and how to enable it (`git config core.hooksPath .githooks` after cloning).
3. **`.github/workflows/check-js-parse.yml`** (new) — CI mirror of the same check; runs on `push` and `pull_request`. Belt-and-braces in case a developer hasn't enabled the local hook.
4. **`CLAUDE.md`** — one new sentence in a "Local setup" section pointing at the hook setup. Or under an existing "Running & Testing" / "Conventions" subsection — Ptah picks the most natural home.

### Files NOT in scope

- **Husky / npm-based hook tooling.** Adds dependencies; not in keeping with the project's vanilla-JS / minimal-deps style. Plain shell + `git config core.hooksPath` is the lighter approach.
- **ESLint or any wider lint setup.** The issue body explicitly carves this out as deferred to a future architecture-reset milestone. This story is parse-only.
- **Reformatting existing files.** No rewrite of legitimate-string smart quotes elsewhere in the codebase (e.g. `dev-fixtures.js` data, `game/rules.js` rules text). Those parse cleanly; the hook is happy.
- **Server-side files.** Server JS is already unit-tested via vitest; if a syntax error landed there the test runner would catch it. The hook scope is `public/js/**/*.js` only — that's the surface that today has no parse-time CI.
- **Pre-existing `.claude/hooks/` infrastructure.** Don't touch; that's project-level (Claude session) hooks, not git hooks.

---

## Acceptance Criteria

**Given** a developer has enabled the hook (`git config core.hooksPath .githooks`)
**When** they stage a JS file under `public/js/` containing smart quotes used as string delimiters and attempt to commit
**Then** the commit aborts with a clear error message identifying the file and the parse error.

**Given** a developer has enabled the hook
**When** they stage a JS file under `public/js/` whose body text content includes smart quotes (e.g. HTML template text with `'`) but whose code parses correctly
**Then** the commit succeeds. The hook does not falsely block on smart quotes in string content.

**Given** a developer has enabled the hook
**When** they stage a non-JS file or a JS file outside `public/js/` (e.g. `server/`, `specs/`, `data/`)
**Then** the hook does not run on it; commit proceeds normally.

**Given** the CI workflow exists
**When** a PR opens against `main` or `dev`
**Then** the workflow runs `node --input-type=module --check` on every `public/js/**/*.js` file in the repo (or the diff, implementer's call) and fails the workflow if any file errors. Status check appears on the PR.

**Given** a developer just cloned the repo
**When** they read `CLAUDE.md` (or `.githooks/README.md` linked from it)
**Then** they see a one-line instruction `git config core.hooksPath .githooks` to enable the hook locally. The setup is documented; it is not auto-applied.

**Given** the hook is enabled and a clean working tree
**When** the developer runs `git commit` on a routine change
**Then** the hook completes in <2 seconds for a typical staged set; latency is not friction-cost.

**Given** the hotfix's specific symptom (PR #32 line 3746 smart quotes)
**When** the hook is run against a recreation of that pre-fix state (deliberately introduce a single `'` as a string delimiter into any `public/js/**/*.js` file, stage, attempt commit)
**Then** the hook catches it with a parse error referencing the line.

---

## Implementation Notes

### `.githooks/pre-commit` shape

```bash
#!/usr/bin/env bash
# .githooks/pre-commit
# Parse-check every staged public/js/**/*.js file as an ES module.
# Catches smart-quote-as-syntax regressions per issue #34.

set -e

# Find staged JS files under public/js/ (added or modified, not deleted).
staged=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^public/js/.*\.js$' || true)
if [ -z "$staged" ]; then
  exit 0
fi

failed=0
errfile=$(mktemp)
trap 'rm -f "$errfile"' EXIT

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! node --input-type=module --check < "$f" >"$errfile" 2>&1; then
    echo "✗ Parse error in $f:"
    cat "$errfile"
    echo
    failed=1
  fi
done <<< "$staged"

if [ $failed -ne 0 ]; then
  echo "Pre-tool-use aborted: staged JS files do not parse as ES modules."
  echo "Often caused by smart quotes (U+2018 / U+2019) used as string delimiters."
  echo "See .githooks/README.md for context."
  exit 1
fi

exit 0
```

### `.githooks/README.md` shape

A short readme documenting:
1. What the hook does (parse-check staged JS).
2. The one-time enable: `git config core.hooksPath .githooks`.
3. The "audit findings" framing — references PR #32 and issue #34.
4. How to bypass for a one-off (`git commit --no-verify`) and when that's appropriate (almost never; only for genuine bypass cases like a deliberate WIP commit on a personal branch).

### `.github/workflows/check-js-parse.yml` shape

Modelled on `verify-rules-engine.yml`. Runs on `push` to any branch and `pull_request` to `main` / `dev`. Step:

```yaml
- name: Parse-check public/js JS modules
  run: |
    set -e
    failed=0
    while IFS= read -r f; do
      if ! node --input-type=module --check < "$f"; then
        echo "Parse error in $f"
        failed=1
      fi
    done < <(find public/js -name '*.js' -type f)
    [ $failed -eq 0 ]
```

### `CLAUDE.md` addition

A single sentence in the "Running & Testing" or "Conventions" section:

> **Local hooks (recommended):** `git config core.hooksPath .githooks` after cloning. Enables a parse-check on staged `public/js/**/*.js` files; catches smart-quote-as-syntax and other parse-time errors before they reach `dev` / `main`. See `.githooks/README.md`.

---

## Test Plan

1. **Reproduction test (Ptah)** — manually introduce a smart quote as a string delimiter into any JS file under `public/js/` (e.g. add `const x = 'test';` somewhere with smart quotes). `git add`, `git commit`. Confirm the hook catches it with the expected error and exits non-zero. Revert the deliberate corruption.

2. **Negative test — smart quotes in string content** — add a deliberate `const x = "She said 'hello'";` (smart quotes inside double-quoted string). Confirm the hook passes (the JS is syntactically valid). Revert.

3. **Negative test — non-JS file** — stage a `specs/*.md` or `server/*.js` file. Confirm the hook ignores it.

4. **Latency test** — time the hook on a typical 5-file commit. Should be <2 seconds.

5. **CI workflow test** — push the branch; confirm the workflow runs and reports on the PR. Manually break a file (smart quote on a temp branch), push, confirm the workflow fails. Don't merge the broken commit.

6. **Static review (Ma'at)** — confirm hook script handles edge cases: empty staged set, deleted files (D in diff filter), files with spaces in names (probably not a thing in this repo, but worth a thought), files outside `public/js/` (excluded).

---

## Definition of Done

- [ ] `.githooks/pre-commit` exists, exec bit set, runs the parse-check correctly
- [ ] `.githooks/README.md` documents purpose + setup + bypass guidance
- [ ] `.github/workflows/check-js-parse.yml` exists and runs on `push` + `pull_request`
- [ ] `CLAUDE.md` updated with the one-line enable instruction
- [ ] Reproduction test passes (hook catches smart quotes in code)
- [ ] Negative tests pass (hook ignores smart quotes in string content; ignores non-JS files; ignores files outside `public/js/`)
- [ ] CI workflow runs successfully on this PR (confirms the workflow itself is syntactically valid YAML and the parse-check works on the current `public/js/` tree — should be all-green since #32 hotfixed the only known parse error)
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body closes #34

---

## Note for Ptah

This is a small story with a clean scope. Don't expand it. Three targets to ship:

1. **`.githooks/pre-commit`** — the shell script. Test by deliberately corrupting a JS file with a smart quote, staging, attempting to commit, confirming abort. Then revert the corruption.
2. **`.github/workflows/check-js-parse.yml`** — the CI mirror. Should be green on this PR since the codebase's known parse error is already fixed.
3. **`CLAUDE.md` + `.githooks/README.md`** — the docs.

Single semantic commit. Dev Agent Record with reproduction-test output.

If you find yourself wanting to add ESLint, husky, or any npm dep, **stop**. The issue and this story explicitly carve those out.

## Note for Ma'at

Your QA targets:

1. **Static review of the hook script** — handles empty staged set, deletes, spaces in filenames (unlikely but easy to handle), exits cleanly with non-zero on failure.
2. **Independent reproduction** — pull the branch, run `git config core.hooksPath .githooks` locally, attempt to commit a deliberate smart-quote regression, confirm caught.
3. **Independent negative test** — confirm smart quotes in body text don't trigger a false positive.
4. **CI workflow YAML** — valid YAML, references the right job and event triggers.

Append QA Results commit before PR.

---

After this PR's merge, the next time someone (Angelus, or anyone) attempts to land a smart-quote-as-syntax regression, the hook catches it before commit. PR #32's class of incident becomes structurally impossible without an explicit `--no-verify` bypass.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (4):**
- `.githooks/pre-commit` (new, exec bit set, +50) — shell script with bash shebang, `set -e`, NUL-safe staged-file enumeration via `git diff --cached --diff-filter=ACM -z`, per-file `node --input-type=module --check` via stdin pipe, mktemp-managed error buffer with EXIT trap cleanup, exit 1 on any failure with clear error message naming each broken file
- `.githooks/README.md` (new, +43) — documents purpose, scope, enable instruction (`git config core.hooksPath .githooks`), bypass guidance, link to CI mirror
- `.github/workflows/check-js-parse.yml` (new, +35) — CI mirror, runs on `push: ['**']` and `pull_request: [main, dev]`. Uses Node 24 (matches `verify-rules-engine.yml`). Iterates `find public/js -name '*.js' -type f` and emits `::error file=$f::` annotations on parse failure
- `CLAUDE.md` (+1) — single-sentence "Local hooks (recommended)" line under "Running & Testing"

**Reproduction test (verbatim, ran locally with hook enabled via `git config core.hooksPath .githooks`):**

```
$ cat > public/js/_smart-quote-test.js <<'EOF'
const x = ‘hello world’;
export default x;
EOF
$ git add public/js/_smart-quote-test.js
$ time git commit -m "TEST: smart-quote regression (will be reverted)"

✗ Parse error in public/js/_smart-quote-test.js:
[stdin]:2
const x = ‘hello world’;
          (smart quote)

SyntaxError: Invalid or unexpected token
    at checkSyntax (node:internal/main/check_syntax:72:5)
    at node:internal/main/check_syntax:45:5
    ...

Pre-commit aborted: staged JS files do not parse as ES modules.
Often caused by smart quotes (U+2018 / U+2019) used as string delimiters.
See .githooks/README.md for context. Bypass with --no-verify only when intentional.

real    0m0.468s   (= 0.47s)
exit=1
```

Hook caught the regression cleanly. Exit code 1. Error message names the file and points at the line. **0.47s total** for the single-file commit.

**Negative tests (verbatim):**

1. **Smart quotes in string content** — created `_smart-quote-content-test.js` with `const x = "She said 'hello'";` and a template literal containing the same. Hook passed; commit succeeded with exit 0. Reverted.
2. **Non-JS file** — staged `specs/_test-smart-quote.md` containing the same UTF-8 smart quotes. Hook ignored; commit succeeded with exit 0. Reverted.
3. **Server-side JS** — staged `server/_test-smart-quote.js` with deliberately broken syntax. Hook ignored (out of scope per `^public/js/` regex); commit succeeded with exit 0. Reverted.

**Latency test:** 5 stub JS files staged → commit completed in 0.24s. Well under the <2s target.

**CI smoke (manual, the workflow's exact step):**

```
$ time (failed=0; while IFS= read -r f; do
    node --input-type=module --check < "$f" 2>/dev/null || { echo "Parse error in $f"; failed=1; }
  done < <(find public/js -name '*.js' -type f); echo "Total: failed=$failed")
Total: failed=0
real    0m5.70s   (entire public/js tree)
```

CI would be all-green on this branch (PR #32 hotfixed the only known parse error in `tabs/downtime-form.js`).

**Implementation notes (anything surprising):**

1. **Local `core.hooksPath` was set during testing** (`git config core.hooksPath .githooks`) — this is per-repo config, doesn't propagate to other clones. Per CLAUDE.md addition, this is the recommended one-time setup; the test setup is the production setup. No cleanup needed.
2. **NUL-safe staged-file enumeration** (`--diff-filter=ACM -z | tr '\0' '\n' | grep`) handles potential filenames with spaces. Unlikely in this repo but cheap insurance against future surprise.
3. **Pipe via stdin** rather than `node --input-type=module --check <file>` — the file-path form rejects on the lack of `.mjs` extension or `package.json` `type: module`, but stdin form respects `--input-type=module` cleanly. Same approach used in the CI workflow.
4. **CI workflow trigger** is `push: ['**']` (all branches) + `pull_request: [main, dev]` — broader than the rules-engine workflow's `push: [main]` because the parse-check is cheap and useful on every branch. Modeled the syntax on `verify-rules-engine.yml`.
5. **Node 24** matches the existing rules-engine workflow.
6. **`exit 1` on failure** is the only meaningful exit signal pre-commit hooks honour — git aborts the commit; the user sees the captured stderr.

**Resisted scope creep:**
- No husky.
- No npm dependency.
- No ESLint or wider lint setup.
- No reformatting of existing files (smart quotes inside string content in `dev-fixtures.js`, `game/rules.js`, etc. left untouched per scope).
- No server-side scope.
- No touching `.claude/hooks/`.
- No bypass-policing logic — `--no-verify` continues to work as git intends.

**Change Log:**
- 2026-05-05 — Implemented per Story #34 on `issue-34-smart-quote-guard`. Single semantic commit (3 new files + CLAUDE.md update + this Dev Agent Record). Reproduction test caught smart-quote regression in 0.47s with exit 1 + clear error. Three negative tests passed. Latency 0.24s for 5 staged files. CI smoke against entire public/js tree: all-green.

---

## QA Results

**Reviewer:** Quinn (Ma'at / QA), claude-opus-4-7
**Date:** 2026-05-05
**Commit reviewed:** 8987b3c
**Method:** Static review of hook + CI workflow + CLAUDE update + README; independent reproduction of the smart-quote regression after enabling the hook locally; three independent negative tests; latency timing.

### Gate decision: **PASS** — recommend ship into `dev`.

### Static review of `.githooks/pre-commit`

| Item | Verdict | Evidence |
|---|---|---|
| Empty staged set → exit 0 | PASS | `if [ -z "$staged" ]; then exit 0; fi` at lines 22-24. |
| `--diff-filter=ACM` excludes deletes | PASS | Line 21. |
| Tempfile cleanup via trap | PASS | `trap 'rm -f "$errfile"' EXIT` at line 28. |
| Exit codes 0/1 | PASS | 0 at lines 23, 49; 1 at line 46. |
| NUL-safe staged enumeration | PASS | `--name-only -z \| tr '\0' '\n' \| grep` at line 21 — handles filenames with spaces. |
| stdin pipe avoids `.mjs` / `package.json type:module` requirement | PASS | `node --input-type=module --check < "$f"` at line 34. Same shape used in CI workflow at `:30`. |
| `set -e` + `\|\| true` interaction | PASS | The `\|\| true` only silences grep's exit 1 on no matches (handled by the empty-staged check next); other failures still abort. |

### Independent reproduction — confirmed YES, latency 0.07s

```
$ git config core.hooksPath .githooks
$ cat public/js/_qa_smartquote_test.js
const x = 'hello world';   # U+2018 / U+2019 smart quotes as string delimiters
console.log(x);
$ git add public/js/_qa_smartquote_test.js
$ time git commit -m 'qa-test: deliberate smart-quote regression'
✗ Parse error in public/js/_qa_smartquote_test.js:
[stdin]:1
const x = 'hello world';
          
SyntaxError: Invalid or unexpected token
    ...

Pre-commit aborted: staged JS files do not parse as ES modules.
Often caused by smart quotes (U+2018 / U+2019) used as string delimiters.
See .githooks/README.md for context. Bypass with --no-verify only when intentional.

real  0.071s   exit=1
```

Faster than Ptah's 0.47s (single-file staged set vs his 5). Comfortably under the <2s AC threshold. Test artefact removed cleanly post-test.

### Independent negative tests — all PASS

| # | Scenario | Expected | Got |
|---|---|---|---|
| 1 | `public/js/_qa_neg1.js` with smart quotes inside a normal-quoted string (`const greeting = "'hello' said the cat";`) | commit succeeds | exit 0, commit landed |
| 2 | `public/js/_qa_neg2.md` (non-JS file inside `public/js`) | commit succeeds (filtered by `^public/js/.*\.js$` grep) | exit 0, commit landed |
| 3 | `server/_qa_neg3.js` with smart-quote regression (out of hook scope) | commit succeeds (server/ not in hook's grep) | exit 0, commit landed despite the broken syntax |

Test 3 confirms the deliberate carve-out: server JS is covered by `vitest` parse-on-import already; the hook only watches `public/js/`. Each test commit was reset (`git reset --soft HEAD~1`) and the artefact removed; final state matches `8987b3c` exactly.

### CI workflow YAML (`.github/workflows/check-js-parse.yml`)

- Triggers: `push: ['**']` (all branches) and `pull_request: [main, dev]`. Status check will appear on PRs against `main` or `dev`. ✓
- Node 24 via `actions/setup-node@v4`. ✓
- Same `node --input-type=module --check < "$f"` parse-check shape as the local hook (mirror principle holds). ✓
- Uses `::error file=$f::...` GitHub annotations for machine-readable failure surfacing.
- Scans the full `public/js` tree (not just diff) — appropriate for CI as belt-and-braces against developers who haven't enabled the local hook.

### CLAUDE.md update

One sentence added at the end of the **Running & Testing** section:

> **Local hooks (recommended):** `git config core.hooksPath .githooks` after cloning. Enables a parse-check on staged `public/js/**/*.js` files; catches smart-quote-as-syntax and other parse-time errors before they reach `dev` / `main`. See `.githooks/README.md`.

Sensible location, points at the README, no auto-application (per AC #5 explicit non-requirement). ✓

### `.githooks/README.md`

Short and complete. Covers:
- Purpose (parse-check; class of incident from PR #28 / hotfix PR #32).
- Scope (in: `public/js/**/*.js`; out: server, data, specs).
- Smart-quotes-in-string-content explicitly called out as passing.
- Enable instruction (one command, per-clone).
- Bypass guidance (`--no-verify` reserved for genuine WIP).
- CI mirror reference.

References issue #34 / PR #32 / PR #28 for incident context. ✓

### Per-AC verdict (7/7 PASS)

| # | AC | Verdict | Evidence |
|---|---|---|---|
| 1 | Smart-quote-as-delimiter aborts with clear error | PASS | Independent reproduction. |
| 2 | Smart quotes in string content commit cleanly | PASS | Negative test 1. |
| 3 | Non-JS / non-public/js files unaffected | PASS | Negative tests 2 and 3. |
| 4 | CI workflow runs on push and PR to main/dev | PASS-by-static | Triggers and parse-check shape verified. |
| 5 | CLAUDE.md has one-line setup instruction | PASS | Verified in diff + section placement. |
| 6 | Hook completes in <2s | PASS | 0.07s in my run; 0.24s/0.47s in Ptah's. Comfortably under threshold. |
| 7 | PR #32 specific symptom recreation caught | PASS | Reproduction is exactly this scenario; parse error references the offending line. |

### Recommendation

**Ship into `dev`.** The hook is narrow, fast, mirror-equivalent to CI, well-documented, opt-in (not auto-applied), and structurally prevents the class of regression from PR #28. Negative tests confirm no false positives on legitimate smart-quote-in-prose code paths. Latency is not friction-cost.
