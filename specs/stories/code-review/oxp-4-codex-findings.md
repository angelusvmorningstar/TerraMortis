# Adversarial review — oxp-4

## High

- None found.

## Medium

- **[Pass 3b] Required DB-backed gate did not run, so the recorded 38/38 result and server mutation claim are not reproducible in this review** — Medium validation blocker; `specs/stories/oxp-4-merit-purchase-persists-handover.md:260` and `:288`; triggering sequence: run the mandated three-file gate in the current environment, then repeat with the temporary character-update sabotage; observable consequence: both runs report `20 passed | 18 skipped (38)`, with all five new DB-backed OXP-4 tests and 13 sibling DB tests skipped, so the sabotage cannot produce the recorded three failures and this review has no executed DB evidence for AC1/AC2; confidence: High. The failure log shows the configured Mongo connection is blocked with `EACCES`; an explicit loopback URI also leaves the same 18 tests skipped. This does not prove the author’s historical run was false, but it is unverifiable-as-stated now and must not be treated as a current green gate.

## Low

- **[Pass 1] Client “never references a character” assertion is name-pattern based, not semantic** — Low; `server/tests/oxp-4-merit-persistence-handover.test.js:234`; triggering sequence: a future implementation obtains a character identifier under an unanticipated spelling such as `currentCharacterId`, `selectedActor`, or `el.dataset.characterId` while retaining the exact function signatures and required category-only API call; observable consequence: the negative regex checks can remain green even though the test title’s structural guarantee has been violated (conversely, an unrelated standalone `_id` reference would fail the test); confidence: High.
- **[Pass 1] Fixture cleanup constructs a Mongo regex from an unescaped string** — Low; `server/tests/oxp-4-merit-persistence-handover.test.js:66`; triggering sequence: `FIXTURE_PREFIX` is later edited to contain a regex metacharacter such as `.` or parentheses; observable consequence: `beforeEach`/`afterAll` can match and delete a broader or different set of character fixtures than the literal prefix suggests; confidence: High. The current constant (`OXP4 Handover `) contains no metacharacters, so this is latent fragility rather than a present failure.

## Validation notes

### Pass 1 — Blind Hunter

- Opened only `specs/stories/code-review/oxp-4-diff.txt`, as required. I did not open repository source, configuration, story/spec, status, or author-record files.
- Command run: `Get-Content -Raw -LiteralPath 'specs/stories/code-review/oxp-4-diff.txt'` — succeeded.
- The GET/PUT context shown by the diff is consistent with the comments: GET indexes output by `doc._id`; PUT upserts by `{ _id: category }` and writes only `dots.<merit>` plus `updated_at`. Full-file claims remain for Pass 2 because Pass 1 prohibited opening the source file.
- The hard-delete test awaits `DELETE`, requires HTTP 204, then performs and checks a subsequent GET, so it would fail if the cascade removed the Enforcer document or its sole `Safe Place` value. I found no timing/wrong-collection loophole in the test itself. Its title says the “suite” is intact, while it checks the persisted merit value rather than byte-identical document metadata; this is not a functional gap for the claimed behaviour.
- AC-numbered test titles visible in the diff match their bodies: AC1 checks vacating plus byte-identical persistence; AC2 performs a full A-to-B handover and confirms the category dots remain visible. The non-AC tests add structural coverage.
- Pass 1 found no High or Medium issue.

### Pass 2 — Edge Case Hunter

- No additional findings. The Pass 1 concurrency candidate is dismissed: `server/vitest.config.js` sets `fileParallelism: false`, `pool: 'forks'`, and `singleFork: true`, so the new file and `office-merit-dots.test.js` cannot interleave their blanket `office_merit_dots.deleteMany({})` hooks under the project configuration.
- Opened in full: `server/vitest.config.js`, `server/package.json`, `server/routes/office-merit-dots.js`, `server/tests/helpers/test-app.js`, `server/routes/characters.js` (all 929 lines, in three chunks), `server/middleware/validateCharacter.js`, `server/schemas/character.schema.js`, `public/js/tabs/office-tab.js` (all 324 lines), `server/index.js` (all 268 lines), and `server/tests/office-merit-dots.test.js`. No `AGENTS.md` exists in the repository file list.
- `server/routes/office-merit-dots.js` confirms the added comments literally: the only collection accessor is `getCollection('office_merit_dots')`; GET reads every document and maps `doc._id` to `doc.dots`; PUT filters/upserts solely on `{ _id: category }` and sets only the named dot plus `updated_at`; there is no character/holder field or reference anywhere in the file.
- `server/routes/characters.js` confirms all three route assumptions: POST `/` inserts the schema-validated request body; the schema permits `court_category` (including `null`) and requires only `name`; PUT `/:id` uses the derived partial schema and `$set: updates`, so `{ court_category: ... }` is valid and persisted; DELETE `/:id` awaits its cascades, does not access `office_merit_dots`, deletes the character last, and emits 204 only after a successful character deletion.
- Manual inspection of `_wireMeritDots` and `_adjustMeritDots` confirms no current character/holder value reaches the merit GET or PUT. Their inputs and API calls are category-based. The Pass 1 regex finding remains valid as a future-proofing limitation because static name-pattern checks cannot prove arbitrary data flow through `el` or a newly introduced differently named local.
- `server/tests/helpers/test-app.js` and `server/index.js` import and mount the same `charactersRouter` and `officeMeritDotsRouter` at the same paths. Production uses `requireAuth`; tests substitute `mockAuth` to populate `req.user`, after which the identical router-level `requireRole('st')` checks protect character writes/deletes and merit PUTs. There is no test-only implementation shortcut.
- Commands run in Pass 2:
  - `rg --files -g 'AGENTS.md' -g 'vitest.config.*' -g 'vite.config.*' -g 'package.json' -g 'characters.js' -g 'office-merit-dots.js' -g 'office-tab.js' -g 'test-app.js' -g 'index.js'` — succeeded; located the listed targets and no `AGENTS.md`.
  - Combined `Get-Content -Raw` for Vitest config, server package, merit route, and test app, plus line counts for character route, office tab, and index — succeeded; counts were 929, 324, and 268 respectively.
  - Three numbered `Get-Content` chunks for `server/routes/characters.js` (lines 1–350, 351–700, 701–929) — all succeeded.
  - `rg -n "court_category|validateCharacterPartial|validateCharacter" server/middleware server public -g '*.js' -g '*.json'` — timed out after about 13 seconds because it encountered the very large `public/js/dev-fixtures.js`; useful matches were returned before timeout, but I did not treat the command as successful.
  - Combined `Get-Content` of `server/middleware/validateCharacter.js` and scoped `rg` for `court_category` — timed out after about 13 seconds after returning the complete middleware and relevant schema/route matches.
  - `Get-Content -Raw -LiteralPath 'server/schemas/character.schema.js'` — succeeded.
  - Numbered full reads of `public/js/tabs/office-tab.js` and `server/index.js` — succeeded.
  - Combined full read of `server/tests/office-merit-dots.test.js`, `git status --short`, and `git branch --show-current` — succeeded, although displayed output was truncated because the pre-existing working tree contains hundreds of unrelated untracked files. Branch was `ms/oxp-4-merit-purchase-persists-handover`. Tracked status relevant to this review showed `server/routes/office-merit-dots.js` modified and `specs/stories/sprint-status.yaml` modified; the new OXP-4 test/spec/review files were untracked. This is recorded as the shared-tree baseline, not attributed to this review.
- Pass 2 found no High or Medium issue and added no Low issue.

### Pass 3a — Acceptance Auditor before author record

- No additional findings.
- Opened `specs/stories/oxp-4-merit-purchase-persists-handover.md` only from the start through the end of Dev Notes/References, stopping before the `## Dev Agent Record` heading. I did not read the Dev Agent Record or any later review section before freezing Pass 3a.
- Acceptance-criteria audit:
  - AC1 is met: the new DB-backed test creates the holder via POST, writes three merit values via PUT, captures both the full GET response and stored document, changes `court_category` via the normal character PUT, then proves both representations are identical and `updated_at` did not change.
  - AC2 is met in a fresh sibling test: character A vacates, distinct character B takes the same category, the category response remains identical, and an authenticated player associated with B can read the inherited dots.
  - AC3 is met by the current call-site assertions and manual source inspection: GET is the unparameterised collection endpoint; PUT interpolates only encoded `category` and sends exactly `merit`/`dots`. The Pass 1 Low finding concerns the broader test titled “never references a character”, not the presently correct API call shapes.
  - AC4 is met: short `oxp.4` comments sit adjacent to both the GET `doc._id` mapping and PUT `{ _id: category }` filter and explain why character re-keying would break handover persistence.
  - AC5 is met: the supplied diff changes no executable logic. `_adjustMeritDots` and handover/reset mechanisms are untouched; the PUT route receives comments only.
- The load-bearing exclusions are respected. The diff adds no persistence/holder plumbing, makes no change to the deferred lost-update race, adds no manoeuvre reset, adds no XP/approval economy, and makes no UI/copy change.
- Task/title audit found no appearance-only implementation: the route comments and end-to-end tests implement the checked tasks, while UI clarity was correctly handled by making no speculative copy change.
- Command run in Pass 3a: a PowerShell bounded read of `specs/stories/oxp-4-merit-purchase-persists-handover.md` that located `## Dev Agent Record` and emitted only preceding lines — succeeded.
- Pass 3a found no High, Medium, or additional Low issue.

### Pass 3b — Author record and mutation verification

- Opened the Dev Agent Record in full only after Pass 3a was written. There was no subsequent Senior Developer Review section in the bounded output.
- The exact mandated baseline gate, run twice without mutations (initial and final restored states), produced the same real result each time: **3 test files passed; 20 tests passed; 18 tests skipped; 38 total; 0 failed**. This disagrees with the author record’s historical “38/38 passed, 0 skipped”. The DB-backed tests were not exercised and are not reported green here.
- Server sabotage reproduction: temporarily added a `court_category` presence check immediately after the update-body destructure in `PUT /api/characters/:id` and deleted all `office_merit_dots`, then ran the exact gate. Result: **3 files passed; 20 tests passed; 18 skipped; 0 failed**. Because the relevant DB tests skipped, the claimed “3 failed / 7 passed” OXP-4 subset could not be verified. The sabotage was removed, then the file was restored exactly from the index after patching caused line-ending/stat churn; `git diff --exit-code -- server/routes/characters.js` and final scoped status were clean.
- Client sabotage reproduction: temporarily added a sixth `char` parameter to `_adjustMeritDots`, then ran the exact gate. Result: **1 file failed, 2 passed; 2 tests failed, 18 passed, 18 skipped (38 total)**. The exact two claimed tests failed: “never references a character, a character id, or a holder in either function” and “takes no character argument in either function signature”. The sabotage was removed, the file was restored exactly from the index after the same line-ending/stat churn, and `git diff --exit-code -- public/js/tabs/office-tab.js` plus final scoped status were clean.
- Mongo availability: `isDbAvailable()` did not establish a usable connection. The client-mutation run exposed `[setupDb] connectDb() failed: connect EACCES 159.143.141.178:27017`. A `mongod` process with PID 6436 was visible, but the normal connection was not to loopback. Re-running the full gate with `MONGODB_URI=mongodb://127.0.0.1:27017/tm_suite_test` still yielded 20 passed / 18 skipped. I could not genuinely exercise the DB-backed tests.
- The gate also emits a Vitest 4 deprecation warning that `test.poolOptions` was removed. This does not revive the cleanup race because the independently configured `fileParallelism: false` remains the controlling serial-file setting, but `singleFork` under `poolOptions` is no longer effective configuration.
- Author-record verdicts: the client mutation’s exact failure subset is confirmed; the current source/diff and route-analysis claims are confirmed; the historical all-green gate and server-mutation failure subset are not reproducible in this environment rather than proven false.
- Ship assessment: **no code patch was identified, but release sign-off is blocked on rerunning the exact gate with a reachable test MongoDB and observing zero skips**. Subject to that validation, the small comment-plus-test change appears ready as-is.
- Commands run in Pass 3b:
  - Bounded PowerShell read from `## Dev Agent Record` to the next level-two heading/EOF — succeeded.
  - `npx vitest run tests/oxp-4-merit-persistence-handover.test.js tests/office-merit-dots.test.js tests/issue-1141-office-tab-render.test.js` (initial baseline) — exit 0; 3 files passed; 20 passed, 18 skipped, 38 total; duration 30.28s.
  - Full reads of `tests/helpers/db-setup.js`, process lookup for `mongod`, and Mongo service lookup — command succeeded; PID 6436 was present; no Mongo service row was returned.
  - Full read of `tests/helpers/setup-env.js` plus TCP-listener lookups — exit 1; setup file was read, but no listener result was returned.
  - `git diff -- server/routes/characters.js public/js/tabs/office-tab.js` before mutation — succeeded with empty output.
  - Temporary `apply_patch` to add the server sabotage — succeeded.
  - Exact three-file gate with server sabotage — exit 0; 3 files passed; 20 passed, 18 skipped, 38 total; duration 15.69s.
  - Reverse `apply_patch` for server sabotage — succeeded; immediate `git diff -- server/routes/characters.js` emitted no patch but warned about LF/CRLF conversion.
  - Temporary `apply_patch` adding the sixth `char` parameter — succeeded.
  - Exact three-file gate with client sabotage — exit 1; 1 file failed and 2 passed; 2 failed, 18 passed, 18 skipped, 38 total; duration 16.06s. Both failures were the exact source-contract tests claimed by the author.
  - Reverse `apply_patch` for client sabotage — succeeded.
  - Scoped diff/branch/status check — branch remained `ms/oxp-4-merit-purchase-persists-handover`; text diff was empty, but status showed both temporarily edited files modified due to working-tree line-ending/stat churn.
  - Scoped raw/numstat/check/porcelain and `git update-index --refresh` diagnostics — textual diff remained empty; refresh failed because this sandbox cannot write `.git/objects` and confirmed the two worktree files needed refresh.
  - `git checkout-index --force -- public/js/tabs/office-tab.js server/routes/characters.js`, followed by scoped `git diff --exit-code` and status — exit 0; both temporary targets restored with no diff/status entry.
  - Exact three-file gate after restoration — exit 0; 3 files passed; **20 passed, 18 skipped, 38 total**; duration 15.42s.
  - Full reads of `server/db.js` and `server/config.js` — succeeded; confirmed the connection key is `MONGODB_URI`, test DB safety requires an `_test` database, and the Mongo client forces TLS.
  - Gate with a process-local loopback override: `$env:MONGODB_URI='mongodb://127.0.0.1:27017/tm_suite_test'; npx vitest run ...` — exit 0; unchanged result of 3 files passed, 20 passed, 18 skipped, 38 total; duration 15.19s.
  - `rg -n` lookups for author claims and finding line references, plus final mutation-target diff/status checks — succeeded; both mutation-target files were clean.
  - Final full report read plus scoped mutation-target diff/status and branch check — exit 0; the two temporary targets remained clean, only this required findings report appeared in the scoped status, and the branch was unchanged.

### Attestation

- I performed Pass 1, Pass 2, Pass 3a, and Pass 3b in the required order and wrote each pass to this file before opening material allowed only in the next pass. I did not inspect the story before Pass 3, and I did not inspect the Dev Agent Record before freezing Pass 3a.
- I created/updated only this required findings report as a lasting review change. I temporarily edited `server/routes/characters.js` and `public/js/tabs/office-tab.js` solely for the requested mutation tests, restored both exactly, and verified both with an empty scoped `git diff --exit-code` and no scoped status entry.
- I did not modify, commit, push, or operate outside `D:\Terra Mortis\TM Suite` other than reading the process/service state exposed by the local shell. Existing unrelated working-tree changes and untracked files were left untouched.
- The branch stayed `ms/oxp-4-merit-purchase-persists-handover` throughout the checks. I observed the large pre-existing dirty tree described in Pass 2, but no mid-review branch collision or unexpected source change.
