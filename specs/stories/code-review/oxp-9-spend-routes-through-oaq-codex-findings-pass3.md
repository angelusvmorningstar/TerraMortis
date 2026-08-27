# Acceptance audit — oxp-9-spend-routes-through-oaq

## High

- None found.

## Medium

### [Pass 3a] [Pass 3b] An intervening below-cap purchase is silently applied a second time, and the Dev Agent Record incorrectly says it is caught

- **Severity**: Medium
- **File:line**: `server/routes/office-purchase.js:325` (re-validation), `server/routes/office-purchase.js:376` (merit apply), `server/routes/office-purchase.js:393` (manoeuvre apply); contradicted claim at `specs/stories/oxp-9-spend-routes-through-oaq.md:609`
- **The triggering input or sequence**: A holder submits a request when a merit has 0 dots (or manoeuvre rank is 0). Before approval, an ST direct-stepper changes that same merit/rank to 1, still below its cap/ceiling. The ST then accepts the pending request.
- **The observable consequence**: Accept returns 200 and advances the live value from 1 to 2. AC5 requires a 409 when the ST stepper moved the same value after submission. I reproduced this by changing the existing stale-merit fixture from `Haven: 5` to `Haven: 1`: the original 409 assertion failed with received status 200; an observational assertion then confirmed `Haven: 2` and request status `resolved`. The existing regression tests only cover movement all the way to the cap/ceiling, so they miss this case. The Dev Agent Record's rationale for not storing/rendering a requested manoeuvre rank says the intervening move is “caught as a 409”; that statement is false.
- **Confidence**: High — reproduced against a real replica-set MongoDB transaction.

## Low

### [Pass 3a] `merit: null` is accepted for a manoeuvre request despite AC1's unconditional supplied-field rejection

- **Severity**: Low
- **File:line**: `server/routes/office-purchase.js:178`
- **The triggering input or sequence**: An authorised holder POSTs `{ seat_id, purchase_kind: "manoeuvre", merit: null }`.
- **The observable consequence**: The route returns 201 and queues the request. AC1 says `merit` is to be rejected as 400 when supplied for a manoeuvre request; it does not exempt `null`. I temporarily changed the existing non-null rejection test to send `null`; it failed with received status 201 versus expected 400. The Dev Agent Record discloses this deviation accurately, but disclosure does not satisfy the literal AC.
- **Confidence**: High — reproduced through Supertest and the real database.

### [Pass 3a] [Pass 3b] The accept transaction does not follow AC5's mandated claim/re-read/apply/outcome order

- **Severity**: Low
- **File:line**: `server/routes/office-purchase.js:306`
- **The triggering input or sequence**: Any ST accept executes the transaction callback.
- **The observable consequence**: The callback re-reads the seat and purchase documents, re-validates, re-checks the requester, and checks the budget before claiming at line 368; the claim also records `outcome` before the purchase write. AC5's literal order is resolve pending → claim → live re-read → re-validate → requester check → budget check → apply → record outcome. The current static test only proves the claim precedes the two purchase writes, not that it precedes the live reads or that outcome is recorded after apply. Mongo transaction retry kept the behavioural concurrency tests green in my moved-claim experiment, so I found no additional runtime failure from this ordering alone; it remains an explicit acceptance mismatch. The Dev Agent Record's statement that its read/validate/budget/claim/apply sequence is “the order the story specified” is also false.
- **Confidence**: High on the ordering mismatch; medium on practical risk because the transaction currently preserves atomic external behaviour.

### [Pass 3b] Browser-only live-verification claims are not independently verifiable from this commit

- **Severity**: Low
- **File:line**: `specs/stories/oxp-9-spend-routes-through-oaq.md:553`
- **The triggering input or sequence**: Attempt to independently verify the historical Chrome session claims: exact rendered controls, zero console errors, and the abandoned player-role/blank-tab pass.
- **The observable consequence**: No screenshot, console capture, browser trace, or runnable browser test is committed, and this workspace has no Playwright, Puppeteer, or jsdom dependency. I corroborated the underlying API effects with the real DB suites (exactly one balance point spent; decline writes nothing), confirmed the unaffordable title string and holder gate in source, found zero added inline styles, and confirmed the local bypass hardcodes `role: 'st'` with `character_ids: []`. I could not independently establish that the historical browser session itself had zero console errors or exactly the stated live DOM. Those claims are therefore unverifiable-as-stated, not shown false.
- **Confidence**: High that the historical eyeballing claim lacks a reproducible artefact; no adverse code behaviour inferred from that alone.

## Validation notes

I read the Story, Why this story exists, budget-scope decision, What this story is NOT, all 11 Acceptance Criteria, and Tasks/Subtasks first (story lines 1–390). I recorded the Pass 3a findings before opening the Dev Agent Record (lines 469 onward), then audited the record.

The record's checkable regression totals were corroborated when a replica-set-capable database was actually available:

- Initial command, before setting up a replica set: `cd server && npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js` → **1 file passed; 24 passed, 51 skipped**. This was not treated as a pass of the DB-backed behaviour.
- A pre-existing local `mongod` on port 27017 answered `hello` but returned no `setName`; it was standalone and unsuitable for the accept transaction.
- I started an isolated MongoDB 8.3 replica set named `oxp9pass3` on **127.0.0.1:27018**, using a repository-local temporary dbpath. `replSetInitiate` returned `ok: 1`. Because `server/db.js` forces TLS for its normal configured database, I temporarily made that option conditional on `CODEX_OXP9_LOCAL_MONGO=1`, supplied `MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=oxp9pass3`, and restored `server/db.js` afterward.
- `cd server && npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js` with that replica set → **1 file passed; 75 passed, 0 failed, 0 skipped**. Both simultaneous-accept tests genuinely ran.
- Required gate, run twice after the replica set was available and again after all experiments were restored:

  `cd server && npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js tests/issue-1141-office-tab-render.test.js tests/oxp-2-derived-office-xp-calculation.test.js tests/oaq-2-pending-status-actions.test.js tests/oaq-3-approval-queue.test.js tests/gdx-12-humanity-check-oaq-submit-approve.test.js`

  → **8 files passed; 321 passed, 0 failed, 0 skipped** on each run.
- Wider sweep command:

  `cd server && npx vitest run tests/crd-1-contested-roll-request-shape.test.js tests/crd-2-pending-queue.test.js tests/crd-3a-resolve-endpoint.test.js tests/crd-3b-resolution-screen.test.js tests/crd-4a-defensive-status-choice.test.js tests/issue-1141-office-data-sync.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/office-merit-dots.test.js tests/otc-2-office-actions-api.test.js tests/otc-3-office-nav-unconditional.test.js tests/oxp-1-office-seats.test.js tests/oxp-5-handover-logic.test.js tests/oxp-5-city-views-seat-holder.test.js tests/oxp-7-office-merits-empty-list-guard.test.js tests/oxp-7-sheet-office-merits-section.test.js tests/oxp-11-office-purchase-seat-keying.test.js`

  → **16 files passed; 419 passed, 0 failed, 0 skipped**. I did not reproduce the record's historical two-of-four `crd-2` timeout; this sweep passed.

Prove-discrimination commands/results (all temporary edits restored):

- Reverted the one `$in` and two `$nin` widenings, then ran the new suite with the replica set → **1 file failed; 4 failed, 71 passed, 0 skipped**. The four failures were exactly GET `/pending`, void, challenge accept, and challenge decline. An earlier attempt during a concurrent restoration of the temporary DB hook produced **24 passed, 51 skipped** and was discarded rather than misreported.
- Replaced the accept-time `if (balance.left < 1)` with `if (false)`, then ran `npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js -t "authoritative budget check"` → **1 failed, 74 skipped**; received 200 instead of expected 403.
- Moved the claim below the purchase writes, then ran `npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js -t "accept race safety"` → **4 passed, 1 failed, 70 skipped**. Both behavioural concurrent-accept tests passed; only the static ordering assertion failed. The Dev Agent Record's caveat is accurate.
- Changed the stale-merit fixture from 5 to 1 while retaining its 409 expectation, then ran its focused test → **1 failed, 74 skipped**, received 200 instead of 409. A follow-up observational version expecting 200, `Haven: 2`, and `resolved` → **1 passed, 74 skipped**.
- Changed the manoeuvre supplied-merit test to send `merit: null` → **1 failed, 74 skipped**, received 201 instead of 400.

Other commands/checks run:

- `git rev-parse --short HEAD` → `c9134abd`; `git show --stat --oneline c9134abd` confirmed the 14-file commit; `git diff --check 5eecf69f..c9134abd` reported no whitespace errors.
- `rg -F '$jsonSchema' server` found only comments/docstrings, no collection validator.
- `git diff --name-only 5eecf69f..c9134abd` and scoped diffs confirmed no changes to the excluded ST PUT routes or Humanity Check resolution, and only comment changes in `public/js/data/office-xp.js`.
- Base/current extraction of `_renderRow` was identical after newline normalisation (`True`, length 1245 both); `GET /mine` remains `$in: [null, 'contested_roll']`, and its hostile `office_purchase` fixture ran in the 75-test suite.
- `rg --files server/tests` confirmed no `oxp-6-*` suite and the real oxp-4 filename. The oxp-4 diff changes one pinned signature assertion only, as disclosed.
- Source/diff scans found **0 added inline `style=` attributes, 0 added bare hex colours, and 0 added console calls**. `server/middleware/auth.js` confirms the local bypass is ST with an empty character list.
- `npm ls playwright playwright-core puppeteer jsdom --depth=0` returned an empty dependency tree, so I could not replay the historical browser session. No browser/live console verification was run in this pass.

I temporarily edited `server/db.js`, the three shared guards, `server/routes/office-purchase.js`, and the oxp-9 test file for the experiments above. Every tracked file was restored exactly: `git diff` is empty for all five and `git hash-object --path=<file> <file>` equals the index blob for each. I ran `unix2dos` over those five files to restore their original working-tree line endings; `git status --short` is now clean of tracked changes. The isolated port-27018 `mongod` was stopped and its `.codex-tmp/oxp9-pass3-rs` dbpath was deleted. The only file intentionally added by this pass is this findings report. Other untracked pass logs/prompts/findings were present initially or appeared from concurrent review passes and were not touched.

**Final verdict: needs patches.** The intervening below-cap state change must be made a 409 (and covered by a regression test) before shipping. The null-field and AC5 ordering differences also need either code changes or explicit acceptance-criteria amendments; the current Dev Agent Record should not claim the stale stepper case is caught or that the implemented order is the story's specified order.
