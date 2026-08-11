# Adversarial review findings — BL-3b delete constants and seed

## High

### [Pass 3a] AC 9 is still open and blocks merge/deploy

- **Severity:** High
- **File:line:** `specs/stories/bl-3b-delete-constants-and-seed.story.md:176`
- **Triggering input or sequence:** This branch is merged/deployed while production still has zero `bloodlines` documents, before Angelus performs the required seed operation. The story's own pre-record “Open question” says the production count remained zero after implementation.
- **Observable consequence:** All 13 characters carrying a bloodline enter BL-2's loud-miss path at once; bloodline disciplines stop resolving for live costing and the warning banner appears until production is populated. The code may be merge-ready, but the change is not ship-ready until this operational prerequisite is completed and verified.
- **Confidence:** High that the prerequisite is explicitly unmet in the story; the live count itself cannot be independently queried under this review's safety rules.

## Medium

### [Pass 1] Comment stripping can erase executable code and make deletion guards pass falsely

- **Severity:** Medium
- **File:line:** `server/tests/bl3b-constants-deleted.test.js:36-38`
- **Triggering input or sequence:** A scanned JavaScript line contains a string or template-literal fragment such as `const marker = '//'; use(BLOODLINE_DISCS);`, or a string containing `/* ... */`, before a deleted-constant reference. The regex-only `code()` helper treats the comment-like characters inside the literal as a real comment and removes the remainder or block.
- **Observable consequence:** AC 1/2 and the importer/caller source-grep assertions can report no offender even though executable code still imports or calls a deleted symbol. The same helper therefore cannot provide the repo-wide absence proof its tests claim.
- **Confidence:** High; the regular expressions do not lex JavaScript strings, templates, or regex literals.

### [Pass 1] The unique-index ordering test does not test ordering

- **Severity:** Medium
- **File:line:** `server/tests/bl3b-constants-deleted.test.js:251-255`
- **Triggering input or sequence:** `server/routes/bloodlines.js` still contains both `ensureBloodlineNameIndex(` and `await ensureNameIndex()`, but a future edit moves the await after the first insert/update, into an unrelated handler, or into unreachable code.
- **Observable consequence:** The test named “ensures the index before the first write” remains green while the first write can occur without the case-insensitive unique-name index, allowing duplicate names or surfacing a later index-creation failure.
- **Confidence:** High; the assertions only prove two text fragments occur somewhere in the file and establish no control-flow or source-order relationship.

### [Pass 1] Importer guards ignore ordinary double-quoted module specifiers

- **Severity:** Medium
- **File:line:** `server/tests/bl3b-constants-deleted.test.js:199,220`
- **Triggering input or sequence:** A live server file adds `import "../scripts/archive/seed-bloodlines.js"` or imports `bloodline-name-index.js` with double quotes (or another valid syntax outside the single-quote regex).
- **Observable consequence:** The “nothing outside scripts/archive imports it” and live-owner importer scans omit the file, so a retired migration can regain a live dependency or the asserted owner set can be misreported without failing the guard.
- **Confidence:** High; both regular expressions accept only `'`-quoted specifiers.

### [Pass 2] The only retained bulk migration lost nearly all of its executable safety coverage

- **Severity:** Medium
- **File:line:** `server/tests/bl1-seed-bloodlines.test.js:1` (deleted)
- **Triggering input or sequence:** An operator runs the deliberately runnable archived seed, especially `--apply`, after any later change to its integrity gate, document builder, reconciliation logic, or main flow. The deleted suite contained 35 tests; only the five `deriveSlug` cases were relocated. No surviving test calls `checkIntegrity`, `buildSeedDocs`, `crossCheckHolders`, or the archived `main()`.
- **Observable consequence:** Regressions in dry-run safety, idempotency, partial-seed reconciliation, duplicate-name refusal, malformed-source rejection, or holder cross-checking can ship undetected in the repository's stated only bulk path for a collection that the archive comments say has never been seeded in production. The surviving BL-4 route tests do verify live-route index creation, but they do not exercise the archived migration.
- **Confidence:** High; the base suite has 35 test cases, the replacement relocates five slug cases, and a repository search finds no surviving invocation of the four migration functions.

## Low

### [Pass 3b] The fixture is not literally the field shape served by GET `/api/bloodlines`

- **Severity:** Low
- **File:line:** `server/tests/bl3b-constants-deleted.test.js:162`
- **Triggering input or sequence:** Production or a test consumer reads a seeded bloodline through `GET /api/bloodlines`. `buildSeedDocs` writes `created_at` and `updated_at`, while the public route projects out only `notes`; the frozen fixture and its equality guard instead require exactly `_id`, `name`, `slug`, `clan`, and `disciplines`.
- **Observable consequence:** `local-test-token` and server fixture responses omit two fields that the real endpoint returns, and the test titled “exactly the fields GET ... serves” locks in that difference. Current cache/accessor behavior is unaffected because neither timestamp is read, and the author accurately declared the deviation, but the comments and equality assertion overstate response-shape fidelity.
- **Confidence:** High; `server/scripts/archive/seed-bloodlines.js:269-270` emits both timestamps and `server/routes/bloodlines.js` excludes only `notes` from the public response.

### [Pass 3b] The archived seed's end-to-end dry-run claim cannot be independently verified safely

- **Severity:** Low
- **File:line:** `specs/stories/bl-3b-delete-constants-and-seed.story.md:390`
- **Triggering input or sequence:** Re-running `node scripts/archive/seed-bloodlines.js` from `server/` loads `server/.env` and connects to the live Atlas deployment even in dry-run mode in order to report collection and character counts. The review brief expressly prohibits any manual MongoDB connection beyond Vitest.
- **Observable consequence:** This review can verify syntax, import resolution, exact copied constants, and fixture equivalence, but cannot independently substantiate the record's “byte-for-byte same table”, `0 already present`, or `13/13` live-report claims. AC 5's runtime proof therefore remains dependent on the author's recorded run.
- **Confidence:** High about the verification gap; this is not evidence that the recorded run is false.

### [Pass 1] The archived-seed integrity claim cannot be established from this diff alone

- **Severity:** Low
- **File:line:** `server/scripts/archive/seed-bloodlines.js:7-68`
- **Triggering input or sequence:** Any bloodline discipline or clan entry was mistyped, dropped, or transposed while the deleted constants were copied into the archived seed.
- **Observable consequence:** A later rerun of the only retained bulk migration could create incorrect documents, and the diff-local tests compare fixture copies rather than prove the inlined literals match the pre-change source.
- **Confidence:** High that a full comparison is required; no claim is made yet that the copy actually differs. Pass 2 will compare it entry by entry against commit `70e1c02c`.

### [Pass 1] The JavaScript walker silently omits symlinked source directories

- **Severity:** Low
- **File:line:** `server/tests/bl3b-constants-deleted.test.js:40-46`
- **Triggering input or sequence:** A `.js` source subtree is linked into `public/js` or `server` through a directory symlink/junction. `Dirent.isDirectory()` is false for the link itself, and its name normally does not end in `.js`, so the walker neither recurses nor reports it.
- **Observable consequence:** Repo-wide absence/importer checks can omit executable linked code and return an empty offender list. Permission and read errors, by contrast, throw and fail loudly rather than falsely passing.
- **Confidence:** High about the walker behavior; low likelihood until this repository actually uses a linked source subtree, which Pass 2 can establish.

## Readiness

**Not ready to ship as-is.** The implementation itself passes the scoped gates, but AC 9 is a blocking operational prerequisite: production must be seeded and the resulting count verified before merge/deploy. I also recommend patching the regex-based source guards and retaining executable coverage for the still-runnable archived migration. The fixture timestamp mismatch is low-risk because current consumers ignore those fields.

## Validation notes

### Pass discipline and files opened

- **Pass 1 (blind):** I opened only this review brief and `specs/stories/code-review/bl-3b-delete-constants-and-seed-diff.txt`. I did not open repository source, the story spec, or the Dev Agent Record. I froze all Pass 1 findings into this file before advancing.
- **Pass 2 (repository, no story):** I directly opened `CLAUDE.md`, `public/js/data/constants.js`, `public/js/dev-fixtures.js` (raw text through the CRLF/extraction probes), `public/js/tabs/wizard.js`, `public/js/data/bloodlines-cache.js`, `public/js/data/accessors.js`, `server/routes/bloodlines.js`, `server/scripts/archive/seed-bloodlines.js`, `server/lib/bloodline-slug.js` (through the fixture comparison import), `server/tests/bl2-clandisclist-miss-path.test.js`, `server/tests/bl3a-one-inclan-implementation.test.js`, `server/tests/bl4-bloodlines-write-api.test.js`, `server/tests/helpers/bloodline-fixtures.js`, and the base-commit versions of `public/js/data/constants.js` and `server/tests/bl1-seed-bloodlines.test.js`. Repository-wide `rg` searches inspected names/import references under `public/js` and `server`. I did not open the BL-3b story in this pass. I froze Pass 2 before advancing.
- **Pass 3a (story without record):** I first listed headings to locate the boundary, then read only lines 1-361 of `specs/stories/bl-3b-delete-constants-and-seed.story.md` (through “Open question for Angelus”). I did not read line 362 onward or the Dev Agent Record until the Pass 3a finding was frozen.
- **Pass 3b:** I read line 362 onward of the story. I then opened `server/tests/epic.708.3-cycle-phase-controls.test.js`, `server/tests/n7-n9-allocator-readers.test.js`, `public/js/data/ws.js`, the relevant boot/WS block of `public/js/app.js`, `server/ws.js`, the bloodline cache/accessor paths, the archived seed builder, and the fixture/guard files needed to check the author's claims. Vitest loaded the files in the scoped suites through the repository's normal test setup.
- I did not read ahead between passes. Earlier findings were not revised after later context; later evidence that mitigates or contradicts an earlier concern is recorded separately here rather than rewriting the frozen finding.

### Commands run and actual results

- `Get-Content -LiteralPath specs/stories/code-review/bl-3b-delete-constants-and-seed-codex-review.md -Raw` — succeeded; loaded the review instructions.
- `[IO.File]::ReadAllText(...)` plus `Get-Content(...).Count` on the supplied diff — succeeded; **102,902 characters / 1,507 lines**.
- `Get-Content ... | Select-Object -Skip ... -First ...` over diff ranges `0/400`, `400/400`, `800/400`, `1200/400`, then `90/235`, `770/210`, `980/195`, `1240/300`, and `1440/120` — all commands succeeded; the two large batched outputs were display-truncated, so the relevant ranges were reread in smaller sections.
- `Select-String ... -Pattern '^diff --git|^@@'` on the supplied diff — succeeded; enumerated all diff files and hunks.
- `rg --files -g 'AGENTS.md' ...` — exit 1 with no output; no `AGENTS.md` exists in this workspace scope.
- `git show 70e1c02c:public/js/data/constants.js | Select-Object -Skip 45 -First 55` — succeeded; exposed the original constant blocks.
- Direct `Get-Content` reads of the archived seed, current constants, wizard, BL-2/BL-3a/BL-4 tests, `CLAUDE.md`, route, cache, accessors, slug module, WS modules, app boot block, dev-fixture branch, and archived builder sections — succeeded. One initial parallel inspection batch returned exit 1/no usable aggregate output because one no-match search failed; every intended read/search was rerun individually and succeeded.
- PowerShell regex comparison of base `BLOODLINE_DISCS` / `BLOODLINE_CLANS` against the archived literals — succeeded: `BLOODLINE_DISCS match=True` (**1,435 chars each**) and `BLOODLINE_CLANS match=True` (**364 chars each**) after CRLF normalization.
- Node CRLF/extraction probe using the exact `/^var BLOODLINES=(\[.*\]);$/m` regex — succeeded: `fileHasCRLF=true`, `lineEndsCR=true`, `matched=true`, `captureEndsCR=false`, `count=23`, `cleanEqual=true`.
- Node fixture comparison against the base constants plus live `deriveSlug` — succeeded: **23 fixtures, 23 source names, 23 clan claims, exact equality true**.
- `git show 70e1c02c:server/tests/bl1-seed-bloodlines.test.js | Select-String ...` — succeeded; enumerated all deleted describe/test names.
- The first PowerShell attempt to count deleted tests had a syntax error and exited 1. The corrected count command succeeded: **35 tests across 7 describe blocks**.
- `rg -n 'checkIntegrity|buildSeedDocs|crossCheckHolders|seed-bloodlines' ...` — succeeded; no surviving test invokes the archived migration functions.
- `rg` searches for the three deleted constant names under `public/js` and `server` — succeeded; current non-archive occurrences are comments/tests, with the actual local literal definitions only in the archived seed.
- `rg` searches for `wizard.js`, `startWizard`, and `tabs/wizard` — succeeded; no static or dynamic importer was found. Two tests read the file as source text, and `wizard.js` itself exports `startWizard`.
- `Get-ChildItem public/js,server -Recurse -Attributes ReparsePoint` — succeeded with no results; no current linked source subtree triggers the Pass 1 walker concern.
- `Test-Path` checks for every path documented in the `CLAUDE.md` addition — all returned `True`.
- `rg` for unique-index coverage — succeeded; confirmed the dynamic BL-4 tests drop and recreate `bloodline_name_unique`, assert `unique`, and assert collation strength 2.
- `git diff --name-status 70e1c02c -- public/js server/routes server/schemas server/scripts server/lib server/tests server/ws.js CLAUDE.md` — succeeded; showed only the scoped implementation changes (plus Git line-ending/config warnings).
- Base/current regex comparison of `CLAN_DISCS` — succeeded: `CLAN_DISCS unchanged=True`.
- `rg` for cache/accessor calls in `bloodlines-cache.js`, `accessors.js`, and `wizard.js` — succeeded; confirmed the documented live APIs and wizard rewire.
- **Exact required scoped gate, first sandboxed run:** `npx vitest run` with the 11 files named in the review brief — exit 1 because network sandboxing denied MongoDB (`connect EACCES ...:27017`): **8 files passed, 3 suites failed during setup, 148 tests passed, 71 skipped**. The three affected suites were `bl1-bloodlines-api`, `bl4-bloodlines-write-api`, and `bloodline-parallel-write`.
- **Exact required scoped gate, authorized Vitest-only rerun:** same command, allowed to reach the configured `tm_suite_test` database — exit 0: **11 files passed, 219 tests passed**.
- `node --check` on every existing JavaScript file named in the diff — exit 0 for all **9**: `public/js/data/constants.js`, `public/js/dev-fixtures.js`, `public/js/tabs/wizard.js`, `server/scripts/archive/seed-bloodlines.js`, `server/tests/bl2-clandisclist-miss-path.test.js`, `server/tests/bl3a-one-inclan-implementation.test.js`, `server/tests/bl4-bloodlines-write-api.test.js`, `server/tests/helpers/bloodline-fixtures.js`, and `server/tests/bl3b-constants-deleted.test.js`. The deleted old test path does not exist and therefore cannot be syntax-checked.
- Author-count verification, 9-suite command — exit 0: **9 files / 160 tests passed**.
- Author-count verification, 5-suite command — exit 0: **5 files / 117 tests passed**.
- New guard suite alone — exit 0: **1 file / 19 tests passed**.
- NUL guard alone — exit 0: **1 file / 1 test passed**.
- Author's combined 15-suite command — exit 0: **15 files / 278 tests passed**.
- `rg --files server/tests | rg 'epic\.708\.3-cycle-phase-controls|n7-n9-allocator-readers'` — succeeded; located both claimed extra-red suites.
- Direct reads of both extra-red suites plus `git diff 70e1c02c --` over those suites and their asserted source files — succeeded; the diff was empty, confirming this change does not touch them or their targets.
- `npx vitest run tests/epic.708.3-cycle-phase-controls.test.js tests/n7-n9-allocator-readers.test.js` — exit 1 exactly as recorded: **2 files failed; 4 tests failed / 35 passed**. Cycle controls had 3 failures (`setGamePhase`, `data-phase`, `gold2`); allocator readers had 1 (`meritPrereqOK` proximity grep).
- Node parse/count of `CHARS` and `BLOODLINES` in `dev-fixtures.js` — succeeded: **31 characters, 11 non-empty bloodline holders, zero unresolved fixture values**. Actaeon resolves to `Animalism/Obfuscate/Protean/Resilience`; Malkovians resolves with `Animalism=false`, `Auspex=true`.
- `rg` and direct reads tracing `broadcastBloodlineUpdate` → client WS `bloodline` handler → `refetchBloodlines()` → `apiGet('/api/bloodlines')` → the dev-fixture `GET bloodlines` interceptor — succeeded; boot and refetch share the intercepted fetch path exactly as the record says.
- `rg` for timestamp fields and the “exactly the fields GET serves” assertion — succeeded; confirmed the fixture shape discrepancy in the Pass 3b Low finding.
- Final scoped `git status --short` — succeeded. It shows the pre-existing implementation changes, the two untracked implementation test files named by the brief, and this new findings file. No implementation file was modified by this review.
- Final findings-file self-checks (`Select-String` for headings, `Get-Content ... | Select-Object -Last 45`, and line/character count) — succeeded; all required severity/pass/validation sections are present, the attestation closes the file, and the artifact is **148 lines / 20,113 characters** before this final command-log bullet was appended.

Every Vitest invocation printed the existing Vitest 4 deprecation warning for `test.poolOptions`; it did not affect results.

### Could not run or independently verify

- I did **not** run the full 174-file suite, because the review brief explicitly says it is not a trustworthy gate. I reproduced the two newly reported red suites directly and verified their asserted files are outside this diff.
- I did **not** run `node scripts/archive/seed-bloodlines.js`, because even its dry-run connects using the live credentials in `server/.env`, and this review expressly prohibits manual MongoDB connections. Therefore the author's byte-identical dry-run report and live `0 / 13 / 13` counts remain unverifiable by me.
- I did **not** query production. The claims that production has zero bloodline documents and 13/13 holders resolve are recorded but not independently verified, as required by the brief.
- I did **not** rerun the browser session. Static fixture parsing and the scoped behavior suites support the 11-holder/zero-miss/costing claim, but the literal observations about the DOM, banner, console, and browser network panel remain the author's observations.

### Safety and worktree attestation

- I modified exactly one file: this required review output, `specs/stories/code-review/bl-3b-delete-constants-and-seed-codex-findings.md`. I did not edit, restore, stage, commit, push, move, or delete any implementation file.
- The final scoped status contains no unintended review changes. Existing source/test modifications and untracked implementation fixtures remain as supplied; unrelated debris described in the brief was not opened or altered.
- I did **not** start the API server (`npm run dev` was never run).
- I made **no manual MongoDB connection**. MongoDB access occurred only through the repository's scoped Vitest setup, which targets `tm_suite_test`; the first sandboxed attempt was denied before connecting, and the authorized reruns were limited to `npx vitest run`.
