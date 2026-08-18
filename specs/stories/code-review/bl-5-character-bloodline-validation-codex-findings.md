# Adversarial review findings — BL-5 character bloodline validation

## High

- None found.

## Medium

### [Pass 1] Malformed stored lineage values are treated as absent, allowing them to be overwritten

- **Severity:** Medium
- **File:line:** `server/lib/character-write-once.js:69`
- **Triggering input or sequence:** A legacy or directly edited character has a non-null, non-string stored `clan` or `bloodline` (for example `{ bloodline: 7 }`), then an otherwise schema-valid PUT supplies a string value for that field.
- **Observable consequence:** `hasNoValue(current)` returns true for every non-string, so the route classifies the write as a first acquisition and replaces an already-present malformed value. The write-once invariant fails open precisely on corrupt/legacy data instead of forcing an explicit data correction.
- **Confidence:** High from the pure transition code in the diff; reachability depends on malformed data entering MongoDB outside the current request schema.

### [Pass 3a] The implementation broadens AC 2’s exhaustive “no value” definition

- **Severity:** Medium
- **File:line:** `server/lib/character-write-once.js:69`
- **Triggering input or sequence:** The stored character contains any non-string `clan` or `bloodline`, then a PUT supplies a valid string for that field.
- **Observable consequence:** AC 2 defines no value as `null`, `undefined`, absent, empty string, or whitespace-only; the implementation additionally classifies numbers, booleans, arrays, and objects as no value. That undocumented state transition permits the overwrite described in the Pass 1 finding instead of rejecting unexpected stored state for deliberate correction. The story’s live-data notes say no current production row has this shape, limiting immediate exposure but not the invariant violation.
- **Confidence:** High; the mismatch is literal between AC 2 and `hasNoValue`.

## Low

### [Pass 1] A two-field compare-and-set miss reports both fields as raced even when only one changed

- **Severity:** Low
- **File:line:** `server/routes/characters.js:604`
- **Triggering input or sequence:** One PUT acquires both `clan` and `bloodline` from empty values; between its read and update, another request sets only one of them.
- **Observable consequence:** The ANDed update filter correctly prevents every write and returns 409, but `writeOnceRaceMessage(Object.keys(acquisitions))` says both fields were set by another save. The ST may investigate the wrong field, although the reload remedy and data safety remain correct.
- **Confidence:** High; this follows directly from the filter and message inputs in the diff.

### [Pass 1] The parity matrix omits the non-string edge cases both modules explicitly claim to support

- **Severity:** Low
- **File:line:** `server/tests/bl5-write-once.test.js:644`
- **Triggering input or sequence:** A future edit makes the server and client disagree for a numeric, boolean, array, or object current/incoming value while they continue agreeing for the `VALUES` array of nullish and string inputs.
- **Observable consequence:** The test titled “the server and client rules cannot drift apart” still passes despite a real edge-case divergence. The current implementations shown in the diff agree, but the claimed parity protection is incomplete.
- **Confidence:** High; neither parity loop includes a non-string value even though the server-only predicate test does.

### [Pass 3b] The record falsely says identical concurrent acquisitions both succeed

- **Severity:** Low
- **File:line:** `specs/stories/bl-5-character-bloodline-validation.story.md:604`
- **Triggering input or sequence:** Two requests both read `bloodline: null` and both attempt to acquire the same value. The first update succeeds; the second runs with `{ _id, bloodline: null }` after the stored value has become that same name.
- **Observable consequence:** Contrary to Completion Note 5, the second update cannot match. The existence re-read at `server/routes/characters.js:602-604` returns 409, so the two requests do not both succeed. Data remains correct and the behavior satisfies AC 6, but one caller receives a conflict the record explicitly says cannot occur.
- **Confidence:** High from the current filter and recovery branch.

### [Pass 3b] The 41-file / 811-test regression claim is not reproducible and overstates its scope

- **Severity:** Low
- **File:line:** `specs/stories/bl-5-character-bloodline-validation.story.md:528`
- **Triggering input or sequence:** A reviewer follows “the 41-file list below” or derives the promised set by grepping for specs that read `editor/edit.js`, `editor/identity.js`, `editor/sheet.js`, or `/api/characters`.
- **Observable consequence:** No 41-file command or list exists anywhere in the story. The direct grep currently finds 34 readers before adding extra BL suites and the NUL guard, and it includes explicitly known-red readers such as `n8-mandragora-prereq.test.js`; a focused re-run of that reader still fails at collection with `SyntaxError: Invalid or unexpected token`. Therefore “every spec that reads … 41 files, 811 tests, green” cannot be independently reproduced and is literally false unless undocumented exclusions were applied.
- **Confidence:** High for the missing list and contradiction; the original private command/count cannot be reconstructed from the record.

### [Pass 3b] Live-browser and production-unchanged assertions are unverifiable by this review

- **Severity:** Low
- **File:line:** `specs/stories/bl-5-character-bloodline-validation.story.md:636`
- **Triggering input or sequence:** The record asserts specific Chrome observations against Carver and Yusuf, followed by a production re-read proving their stored lineage remained unchanged.
- **Observable consequence:** The code and tests make the UI/handler observations plausible, including the sixth warning after the in-memory acquisition, but there is no replayable browser artifact in scope and this review is expressly forbidden from querying production. The production-unchanged statement must remain an author attestation, not independently verified evidence. This is a verification limitation, not a product defect.
- **Confidence:** High that it is unverifiable in this review; no claim that the observations are false.

## Pass 2 disposition

- No new findings. The repository trace and focused route test disproved the suggested missing-character crash: middleware does not pre-404, but `server/routes/characters.js` guards the transition loop with `if (existingChar)`, and the request reaches the ordinary 404 path. The focused test passed (1 passed, 89 skipped).

## Readiness

**Needs patches before shipping, but no blocking architectural problem.** The normal request paths, compare-and-set, UI locks, and scoped regression gate are sound. The medium issue is narrow but violates the specified transition domain and should be fixed by failing closed on unexpected stored non-string lineage values; the parity matrix should then include those shapes. The remaining findings are message/record/test-strength corrections.

## Validation notes

### Pass boundaries and files opened

- **Before Pass 1:** Opened this review brief, `specs/stories/code-review/bl-5-character-bloodline-validation-codex-review.md`, as instructed. It necessarily described all three passes; no later-pass target file was opened.
- **Pass 1:** Opened only `specs/stories/code-review/bl-5-character-bloodline-validation-diff.txt` (in four non-overlapping chunks after the initial display truncated). No repository source, story, or sibling repo was opened. Created this findings file to freeze the pass.
- **Pass 2:** Opened `server/routes/characters.js`, `server/middleware/validateCharacter.js`, `server/lib/normalize-character.js`, `server/schemas/character.schema.js`, `server/lib/character-write-once.js`, `server/lib/bloodline-key.js`, `server/lib/bloodline-name-index.js`, `public/js/data/write-once.js`, `public/js/editor/edit.js`, `public/js/editor/identity.js`, relevant ranges of `public/js/admin.js` and `public/js/app.js`, `server/vitest.config.js`, `server/tests/helpers/db-setup.js`, `server/tests/bl5-write-once.test.js`, and `server/tests/bl5-lineage-lock-client.test.js`. Grep searches also inspected call-site matches across `public/js` and `server/tests`. The story spec remained unopened.
- **Pass 3a:** Opened only lines 41-472 of `specs/stories/bl-5-character-bloodline-validation.story.md` covering Story, Why, Acceptance Criteria, “What this story is NOT”, Tasks/Subtasks, and Dev Notes. I used a heading-only grep first to locate the boundary and did not read the Dev Agent Record before freezing Pass 3a.
- **Pass 3b:** Opened the Dev Agent Record (lines 514-731), then re-opened only source/test snippets needed to audit its claims, including the duplicate `normKey` bodies and grep-selected regression readers. I did not open any sibling workspace.

### Commands run and observed results

- `Get-Content -Raw ...bl-5-character-bloodline-validation-codex-review.md` — succeeded.
- `Get-Content -Raw ...bl-5-character-bloodline-validation-diff.txt` — succeeded but display truncated; four subsequent `Get-Content` range commands (`0..499`, `500..999`, `1000..1499`, `1500..1912`) all succeeded and covered the complete 1,913-line diff.
- One initial parallel Pass 2 search invocation failed with exit 1 and returned no usable output. `rg --files -g AGENTS.md` then returned exit 1/no matches: no `AGENTS.md` exists in scope.
- `rg -n` searches for the PUT handler/middleware/normalization symbols across `server` — succeeded and located the route at `server/routes/characters.js:494` and middleware at the expected files.
- `rg -n` searches for `shEdit`, `updField`, editor imports, save paths, and lineage call sites across the relevant `public/js` files — succeeded; both `admin.js` and `app.js` import, register, and expose the guarded handlers, and no separate lineage editor write path was found.
- `Get-Content` range/raw reads for the Pass 2 files listed above — all succeeded.
- `rg -n "req\\.body|clan|bloodline" ...normalize-character.js ...` — succeeded; no middleware mutation of `updates.clan`/`updates.bloodline` was found.
- `rg -n "apiPut\\('/api/characters|..." public/js -g '*.js'` — succeeded and enumerated the wider PUT call sites.
- `rg` checks around bloodline test setup and `server/vitest.config.js` — succeeded; Vitest is configured serially and the setup enforces a `_test` database.
- Focused 404 test, `npx vitest run tests/bl5-write-once.test.js -t "a non-existent character still returns 404, not 409"`: first sandboxed run failed before tests with Mongo `connect EACCES`; the approved retry reached `tm_suite_test` and passed **1 test, 89 skipped, 1 file**.
- Story heading grep and the three allowed Pass 3a `Get-Content` ranges — succeeded.
- `rg "^diff --git a/" ...diff.txt` — succeeded and identified 10 changed JavaScript files.
- Two Pass 3b `Get-Content` ranges for the Dev Agent Record — succeeded.
- Mandated gate: `npx vitest run tests/bl5-write-once.test.js tests/bl5-lineage-lock-client.test.js tests/api-characters-crud.test.js tests/bl3a-one-inclan-implementation.test.js tests/repo-no-nul-bytes.test.js` — **5 files passed, 208 tests passed, exit 0**.
- Story-only count: `npx vitest run tests/bl5-write-once.test.js tests/bl5-lineage-lock-client.test.js` — **2 files passed, 150 tests passed (90 + 60), exit 0**.
- `rg` audits for `811`, `41-file`, referenced editor files/API paths, BL suites, and known-red readers — succeeded. The promised 41-file list was absent; the direct reader grep returned 34 files and included known-red specs.
- `npx vitest run tests/n8-mandragora-prereq.test.js` — **failed as expected**, 1 failed file / 0 collected tests, `SyntaxError: Invalid or unexpected token`, confirming a literal editor-reader cannot belong to an all-green “every reader” batch.
- `node --check` loop over all 10 JavaScript files named in the diff — **10 passed, 0 failed**: `public/js/editor/edit.js`, `identity.js`, `sheet.js`, `public/js/data/write-once.js`, `server/routes/characters.js`, `server/lib/bloodline-key.js`, `server/lib/character-write-once.js`, `server/tests/bl3a-one-inclan-implementation.test.js`, `server/tests/bl5-write-once.test.js`, and `server/tests/bl5-lineage-lock-client.test.js`.
- `rg`/`Get-Content` comparison of `server/lib/bloodline-name-index.js:45` and `server/lib/bloodline-key.js` — succeeded; the private `normKey` duplication is real, byte-equivalent in behavior, and pre-existing in the excluded BL-4 module as claimed.
- Broad `git status --short` — succeeded but produced 1,517 lines of pre-existing debris and was display-truncated. Scoped `git status --short -- <10 implementation files> <findings file>` succeeded and showed exactly the five tracked implementation modifications, five expected untracked implementation/test files, and this requested findings file.
- `Get-Content -Raw` on this completed findings report — succeeded; the final scoped `git status` was then repeated with the same implementation-file result.

### Could not run or independently verify

- I could not run the claimed **41-file / 811-test command** because the story says the list is “below” but does not provide it. The literal derivation contradicts the all-green claim as described above.
- I did not run the full suite, per the review brief’s explicit warning that its known failures are not a trustworthy gate.
- I could not replay the claimed Chrome session or independently verify screenshots/DOM observations because no browser artifact or replay instructions were provided in scope.
- I did not query production and therefore could not verify the claim that Yusuf and Carver remained unchanged. This was prohibited by the brief.

### Workspace and safety attestation

- I modified no implementation, test, story, tracking, or sibling-repo file. The only file created/edited was this requested findings report. No temporary source edit was made, so no restoration was necessary.
- The scoped status confirms the reviewed implementation files remain in their expected pre-review modified/untracked state; no unintended change from this review appears among them. The broad worktree contains substantial pre-existing unrelated debris beyond the brief’s abbreviated examples; none was touched.
- I did **not** start the API server (`npm run dev` was never run).
- I made **no manual MongoDB connection**. Only the scoped Vitest commands connected, through the repository setup that enforced `tm_suite_test`; the first sandboxed attempt was blocked before connecting.
- I did not commit, push, merge, deploy, delete, or alter production data.
