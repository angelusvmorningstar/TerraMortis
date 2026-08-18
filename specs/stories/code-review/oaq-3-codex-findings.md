# Adversarial review findings — oaq.3

## High

### [Pass 2] The queue bypasses mandatory dev-role name redaction

- **Severity:** High
- **File:line:** `public/js/admin/office-approvals.js:26` and `public/js/admin/office-approvals.js:169` (redaction contract in `public/js/data/helpers.js:7`)
- **Triggering input or sequence:** A user whose effective role is `dev` opens the admin Approval Queue. `requireRole('st')` deliberately admits that role, the endpoint returns the stored `actor_name` and `target_name`, and the module renders both through `esc()` alone.
- **Observable consequence:** Real character names are shown to a privacy-redacted developer. The repository’s display-helper contract says every character/player name in dev mode must be replaced with blocks, and provides `redactCharName()` for raw name strings exactly like these; this module never imports or calls it. A stale conflict can likewise render another ST’s raw username from the server message. This defeats the privacy purpose of the `dev` role on the new tab.
- **Confidence:** High; role admission, the explicit repository-wide redaction contract, and the raw render path are all directly traceable.

## Medium

### [Pass 1] An initial fetch failure is rendered as a false empty queue

- **Severity:** Medium
- **File:line:** `public/js/admin/office-approvals.js:107` (failure handling through line 150)
- **Triggering input or sequence:** An ST opens Approval Queue and the first `GET /api/office_actions/pending` rejects because of a transient network, server, or authentication failure while `state.rows` is still empty.
- **Observable consequence:** The catch logs only to the developer console; after `loading` is cleared, `_renderBody()` renders “Nothing pending.” An ST is therefore told there are no approvals when the queue is actually unknown and may contain work. A later active-tab poll can recover after up to ten seconds, but there is no visible indication that the initial result was invalid.
- **Confidence:** High; this follows directly from the catch path and empty-state branch in the supplied diff.

### [Pass 1] An older poll response can resurrect a row after a successful action

- **Severity:** Medium
- **File:line:** `public/js/admin/office-approvals.js:107` and `public/js/admin/office-approvals.js:123`
- **Triggering input or sequence:** A ten-second poll begins and obtains a response snapshot containing row A; before that fetch promise settles in the browser, the ST accepts or declines row A and the PUT succeeds, so `_resolve()` filters A out locally; the older GET then settles and `_refetchAndRender()` assigns its stale snapshot back to `state.rows`.
- **Observable consequence:** A successfully resolved request can reappear as actionable until the next poll. Clicking it produces a stale 409 rather than performing a duplicate server mutation, but the queue visibly contradicts the successful action and needlessly invites another click. There is no request generation/order guard or post-mutation refetch to prevent an older read from overwriting the newer local state.
- **Confidence:** High that the client-side ordering is possible from the supplied code; the server-side mutation itself still appears to leave the pending set on every shown 2xx path.

### [Pass 2] The conflict enrichment is bypassed by the real concurrent-action race

- **Severity:** Medium
- **File:line:** `server/routes/office-actions.js:334` and `server/routes/office-actions.js:370`
- **Triggering input or sequence:** Two ST requests overlap while the record is pending, so both pass `_findPending()`. One accept/decline changes the record first. The loser then reaches the accept transaction’s `matchedCount === 0` branch or decline’s equivalent branch rather than re-entering `_findPending()` after the winner commits.
- **Observable consequence:** The losing ST receives the old generic 409, “Request is no longer pending,” with no `resolved_by`/`declined_by` and no actor name. The enrichment works only when the losing request starts late enough to observe the completed action in the initial lookup; it does not cover the multi-ST overlap that the atomic pending guard is specifically designed to handle.
- **Confidence:** High from the distinct generic post-update conflict branches. A live simultaneous reproduction is deferred to Pass 3b’s requested AC4/AC5 verification.

### [Pass 3a] The display layer is still a single Status Action template, contrary to the required forward shape

- **Severity:** Medium
- **File:line:** `public/js/admin/office-approvals.js:157`
- **Triggering input or sequence:** A future pending item with `request_type !== 'status_action'` is included in this queue, as anticipated by the story’s explicit Epic OXP forward-shape decision.
- **Observable consequence:** The ternary changes only the badge text. The same template still reads Status Action-specific `actor_name`, `target_name`, and `action_type` fields and both buttons still call the Status Action-specific `/api/office_actions/:id/:action` routes. Such an item renders as “Unknown → Unknown” (with a raw request-type badge) and is sent to the wrong resolver. Adding the second type therefore requires restructuring the renderer/action dispatch, despite the story requiring the display layer not to assume Status Action is the only shape. This finding is about the required extensibility seam, not about implementing Epic OXP now.
- **Confidence:** High; the Story/“What this story is NOT” section explicitly makes request-type-shaped display a requirement, while `_renderRow()` and `_resolve()` expose only a label-level fallback.

### [Pass 3b] The claimed green regression evidence is not reproducible in the current review environment

- **Severity:** Medium
- **File:line:** `specs/stories/oaq-3-st-tab-approval-queue-view.md:297`
- **Triggering input or sequence:** Run the mandated six-file gate exactly as documented in this review environment, then run the unfiltered suite.
- **Observable consequence:** The gate’s actual result is **57 passed, 43 skipped; 3 files passed, 2 skipped, 1 failed**, not 100/100 pass. `otc-2-office-actions-api.test.js` fails in setup/cleanup because Atlas TCP access is denied with `connect EACCES 159.143.141.178:27017`. The unfiltered run then times out after 602.2 seconds while serial DB files incur the same denial, so the claimed 2422/2427 byte-identical baseline cannot be verified here. The three named assertion-level baseline files were independently run and do reproduce exactly 5 failures/63 passes, with no changed-area references, so this is a validation gap caused by the environment rather than evidence of a new product regression. AC4/AC5’s claimed live reproduction is likewise unverified in this session.
- **Confidence:** High for the observed current results and inability to verify; no claim is made that the author’s historical run was fabricated or that Atlas-access failure is caused by this diff.

## Low

### [Pass 2] Reusing the ordeal list-row class gives non-clickable rows a click affordance

- **Severity:** Low
- **File:line:** `public/js/admin/office-approvals.js:168` and `public/css/admin-layout.css:3444`
- **Triggering input or sequence:** An ST hovers or clicks the actor/target or blank area of an approval row instead of one of its two buttons.
- **Observable consequence:** The entire row shows `cursor: pointer` and a hover highlight inherited from the selectable Ordeals list, but clicking it does nothing. There is no cross-module click-handler collision because the Ordeals listener is scoped to its own container; the defect is the misleading inherited interaction styling.
- **Confidence:** High; the selector and scoped event consumers were checked across the source tree and at the base commit.

### [Pass 3a] The AC1 test does not prove that unrelated pending request types are excluded

- **Severity:** Low
- **File:line:** `server/tests/oaq-3-approval-queue.test.js:106`
- **Triggering input or sequence:** The endpoint regresses to return pending documents of every `request_type`, while still returning the two Status Action fixtures created by this test.
- **Observable consequence:** The test continues to pass because it filters the response down to rows whose `actor_name` has its fixture prefix before asserting type/status and never inserts an irrelevant pending contested-roll document. Its title and AC1 commentary claim “only”/“nothing else,” but the key negative filter is untested.
- **Confidence:** High; lines 119–121 discard all unrelated response rows before assertions.

### [Pass 3a] The story reverses the DB-backed and static test counts

- **Severity:** Low
- **File:line:** `specs/stories/oaq-3-st-tab-approval-queue-view.md:173`
- **Triggering input or sequence:** A reviewer relies on Task 4’s stated coverage breakdown when assessing AC9.
- **Observable consequence:** The file contains 7 DB-backed `it()` cases (3 for AC1 and 4 for AC4/AC5) and 11 static wiring/file-shape cases, while the story says “11 DB-backed” and then “7 tests” for static coverage. The 18-test total is correct, but the nature of that evidence is reported backwards.
- **Confidence:** High; the test cases were counted directly before reading any Dev Agent Record material.

### [Pass 3b] The Dev Agent Record repeats the reversed coverage breakdown

- **Severity:** Low
- **File:line:** `specs/stories/oaq-3-st-tab-approval-queue-view.md:298`
- **Triggering input or sequence:** Read the Regression evidence as an account of how the 18 new tests are split, then run the new file with Atlas unavailable.
- **Observable consequence:** The record again says “11 DB-backed + 7 wiring,” but Vitest reports **11 passed and 7 skipped** when DB access is unavailable, independently proving the opposite split: 7 DB-backed and 11 static. The total remains 18.
- **Confidence:** High; the describe blocks and the isolated Vitest result agree.

### [Pass 3b] The claimed existing `.dt-appr-*` call sites do not exist

- **Severity:** Low
- **File:line:** `specs/stories/oaq-3-st-tab-approval-queue-view.md:266`
- **Triggering input or sequence:** Search the source tree for `.dt-appr-approved`, `.dt-appr-rejected`, `.dt-approval-btn`, and the `dt-appr` prefix while checking the CSS-deviation rationale.
- **Observable consequence:** Only the definitions in `public/css/admin-layout.css` are present; there are no HTML/JS call sites “used elsewhere for a persistent approved/rejected/modified/pending selector.” The selectors are indeed `.active`-gated and therefore still a poor direct fit for an ordinary one-shot button, but the claimed usage evidence is false.
- **Confidence:** High; repeated source-tree searches returned only CSS definitions.

## Ship assessment

**Blocking problem — not ready to ship.** The dev-role PII leak is release-blocking. The fetch/error state, stale-response ordering, concurrent 409 enrichment, and request-type dispatch seam also need patches before approval; the DB-backed gate must then be rerun in an environment with Atlas access.

## Validation notes

### Pass boundaries and files opened

- **Pass 1:** Opened only `specs/stories/code-review/oaq-3-diff.txt` and the report being written, `specs/stories/code-review/oaq-3-codex-findings.md`. I did not open source files, repository context, the story, its Dev Agent Record, or its Senior Developer Review. Questions requiring whole-file/theme context were deliberately left for Pass 2. Pass 1 was written in full before proceeding.
- **Pass 2:** After Pass 1 was frozen, directly opened `public/js/admin.js`, `public/js/game/challenge-notification.js`, `server/middleware/auth.js`, `public/js/data/api.js`, `server/routes/office-actions.js`, `public/js/admin/ordeals-admin.js`, `server/routes/contested-rolls.js`, `public/admin.html`, `public/css/admin-layout.css`, `public/js/data/helpers.js`, `server/tests/helpers/test-app.js`, and `public/js/admin/office-approvals.js`. Scoped searches covered `public/` and `server/` source/tests plus the same paths at base commit `ab8145ad`; returned snippets also covered `public/css/theme.css`, `public/css/components.css`, `public/css/suite.css`, `public/mockups/font-test.html`, `public/js/app.js`, `server/index.js`, and named test files. I did not open the oaq.3 story in this pass. Pass 2 was written before proceeding.
- **Pass 3a:** After Pass 2 was frozen, opened only the story header/Story/Why, Decisions, What this story is NOT, Acceptance Criteria, and Tasks/Subtasks portions of `specs/stories/oaq-3-st-tab-approval-queue-view.md`, stopping before `## Dev Agent Record`; also inspected `server/tests/oaq-3-approval-queue.test.js`. I did not read the Dev Agent Record or Senior Developer Review. Pass 3a was written before proceeding.
- **Pass 3b:** After Pass 3a was frozen, opened the Dev Agent Record in full. I subsequently opened the Senior Developer Review, which contains only the placeholder “populated during code-review.” Verification opened/searched `public/admin.html`, the relevant CSS files, `public/js/admin/office-approvals.js`, and the named regression tests. Vitest loaded the test files and their dependencies. I did not read or touch any sibling repository.

### Commands run and observed results

#### Pass 1 commands

- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/oaq-3-diff.txt'` — exit 0; supplied diff read.
- `Select-String -LiteralPath 'specs/stories/code-review/oaq-3-diff.txt' -Pattern 'router\.(get|put|post|delete|patch)\(','broadcast|ws\.js|addEventListener\(','crim-a15|_refetchAndRender|_resolve\(' -AllMatches | ForEach-Object { '{0}:{1}: {2}' -f $_.Path,$_.LineNumber,$_.Line.Trim() }` — exit 0; confirmed the relevant diff-contained route, listener, token, and refresh occurrences and no broadcast occurrence.
- A PowerShell line-counter over only `oaq-3-diff.txt` (starting `$lines = Get-Content ...` and matching `_refetchAndRender|async function _resolve|state.rows = state.rows.filter|catch (err)|Nothing pending`) — exit 0; produced source lines 64, 89, 107, 115, 123, 131, 132, and 150.
- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/oaq-3-codex-findings.md'` — exit 0; verified the frozen Pass 1 write.

#### Pass 2 commands

- `Get-Content -Raw` for each of `public/js/admin.js`, `public/js/game/challenge-notification.js`, `server/middleware/auth.js`, `public/js/data/api.js`, and `server/routes/office-actions.js` — all exit 0; the combined first output was truncated, so the poller/auth and focused admin sections were reread separately.
- `Get-Content -Raw -LiteralPath 'public/js/game/challenge-notification.js'`; `Get-Content -Raw -LiteralPath 'server/middleware/auth.js'`; `Select-String -LiteralPath 'public/js/admin.js' -Pattern '^function switchDomain\(' -Context 0,70`; and `Select-String -LiteralPath 'public/js/admin.js' -Pattern '^async function init\(' -Context 0,100` — all exit 0.
- Two initial parallel `rg` orchestration attempts covering `switchDomain`, the three new class names, `or-list-item`, poller identifiers, crimson tokens, router declarations, and status values returned orchestration exit 1/no usable combined output (one later broad `switchDomain` retry also timed out after about 12 seconds while still returning the two expected matches). Every check was rerun below with narrower paths.
- `rg --version` — exit 0; ripgrep 15.2.0.
- `rg -n 'switchDomain\(' public server` — timed out after about 12 seconds, but returned `public/js/admin.js:306` and `:365` before timeout.
- `rg -n 'dt-btn-danger|oaq-row-actions|oaq-row-error' public server` — exit 0; occurrences were confined to the new CSS/module/test.
- `rg -n 'or-list-item' public server` — exit 0; found the Ordeals implementation, CSS, mockup, new module, and test.
- `Get-Content -LiteralPath 'public/js/admin/ordeals-admin.js' | Select-Object -Skip 330 -First 55` — exit 0; confirmed the Ordeals row listeners are scoped to that module’s container.
- `rg -n -- '--crim-a15|--crim2' public/css` — exit 0; `--crim-a15` and `--crim2` are defined in both theme blocks in `theme.css` and widely used.
- `rg -n 'router\.(get|put|post|patch|delete)\(' server/routes/office-actions.js` — exit 0; six route declarations, with no `GET /:id` collision.
- `rg -n 'status_action|contested_roll_requests' server public` — exit 0; traced the record family and guards.
- `Get-Content -Raw -LiteralPath 'server/routes/contested-rolls.js'` — exit 0; confirmed the `status_action` exclusion and reachable shared-collection statuses.
- `Get-Content -Raw -LiteralPath 'public/admin.html'` — exit 0; confirmed mounted section, initial active domain, and stylesheets.
- `rg -n -C 3 '^\.domain|\.domain\.active|\.domain\s*\{' public/css/admin-layout.css public/css/components.css public/css/theme.css` — exit 0; `.domain` is hidden and `.domain.active` displayed.
- `rg -n 'more-badge|_pollTimer|POLL_MS|data-oaq|office-approvals' public/js public/admin.html` — exit 0; separate timers/module state and no `#more-badge` use by office approvals.
- `rg -n 'isRedactMode|redactPlayer|displayName\(' public/js/admin public/js/data public/js/admin.js`; `rg -n 'devUser|role.*dev|privacy-redact|redact' server/tests public/js/admin`; `rg -n -C 3 'office_actions' server/index.js server/tests/helpers/test-app.js`; and a numbered `Get-Content` of `public/js/admin/office-approvals.js` — all exit 0; established the dev-redaction contract, route mount, and exact module lines.
- `Get-Content -LiteralPath 'public/js/data/helpers.js' | Select-Object -First 185` — exit 0; read `isRedactMode`, `redactCharName`, and name helpers.
- `git grep -n -E 'dt-btn-danger|oaq-row-actions|oaq-row-error' ab8145ad -- public server` — exit 1/no matches, confirming the names were new at the base commit.
- `git grep -n 'or-list-item' ab8145ad -- public server` — exit 0; confirmed the pre-existing Ordeals selector and CSS.
- `rg -n 'broadcast|ws\.js' public/js/admin/office-approvals.js server/routes/office-actions.js` — exit 1/no matches.
- `rg -n 'addEventListener\(' public/js/admin/office-approvals.js` — exit 0; exactly one call at line 95.
- `Get-Content -LiteralPath 'server/tests/helpers/test-app.js' | Select-Object -First 95` — exit 0; inspected mock-auth setup.
- `Get-Content -LiteralPath 'public/css/admin-layout.css' | Select-Object -Skip 3438 -First 30` — exit 0; confirmed the inherited pointer/hover rules.
- `rg -n -C 4 '^\.dt-btn|\.dt-btn:disabled|button:disabled' public/css/admin-layout.css public/css/components.css` — exit 0; inspected button family/disabled styling.
- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/oaq-3-codex-findings.md'` — exit 0; verified the frozen Pass 2 write.

#### Pass 3a commands

- A PowerShell section extractor over `specs/stories/oaq-3-st-tab-approval-queue-view.md` that emitted only the allowed `Story|Decisions already made|What this story is NOT|Acceptance Criteria|Tasks/Subtasks` sections and stopped at `## Dev Agent Record` — exit 0.
- `Get-Content -LiteralPath 'specs/stories/oaq-3-st-tab-approval-queue-view.md' | Select-Object -First 45` — exit 0; captured the title/Story/Why text omitted by the heading extractor, still before the Dev Agent Record.
- A numbered pre-Dev-record story/test search for `does not hardcode`, request-type keyed shaping, and the stated test counts — exit 0; located story lines 73–74 and 173/177.
- A numbered `Get-Content` search over `server/tests/oaq-3-approval-queue.test.js` for every `it()` and AC1’s `ours` assertions — exit 0; counted 7 DB-backed and 11 static cases and exposed the negative-filter test gap.

#### Pass 3b commands

- A PowerShell extractor from `## Dev Agent Record` up to `## Senior Developer Review` — exit 0; read the author record in full.
- Exact required gate: `npx vitest run tests/oaq-3-approval-queue.test.js tests/oaq-2-pending-status-actions.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js tests/issue-873-ecm-6-admin-sidebar.test.js` from `server/` — exit 1 after 39.12 seconds: **57 passed, 43 skipped (100 tests); 3 files passed, 2 skipped, 1 failed**. Failure: `connect EACCES 159.143.141.178:27017` in `otc-2-office-actions-api.test.js` setup, followed by cleanup’s “Database not connected.”
- `rg --files server/tests | rg 'n7-n9-allocator-readers\.test\.js|oath-a-pledge-helpers\.test\.js|epic\.708\.3-cycle-phase-controls\.test\.js'` — exit 0; found all three named files.
- `rg -n -i 'office-actions|office_actions|admin\.html|admin\.js|office-approvals|admin-layout'` against those three files — exit 1/no matches, confirming no changed-area references.
- `npx vitest run tests/n7-n9-allocator-readers.test.js tests/oath-a-pledge-helpers.test.js tests/epic.708.3-cycle-phase-controls.test.js` — exit 1: **63 passed, 5 failed; 3 files failed**, exactly the three named assertion groups (1 + 1 + 3).
- `npx vitest run` — timed out at 602.2 seconds (exit 124), before final totals. Partial output reproduced the five named failures and showed many DB suites skipping after Atlas `EACCES`; therefore 2422/2427 and the seven claimed file-level errors were not verified.
- `rg -n '^\.ch-btn|\.ch-btn-accept|\.ch-btn-decline' public/css/suite.css public/css/components.css public/css/admin-layout.css` — exit 0; all challenge-button rules are in `suite.css`.
- `rg -n -C 3 'dt-appr-approved|dt-appr-rejected' public/css public/js` — exit 0; found only `.active`-gated CSS definitions.
- `rg -n '<link[^>]+stylesheet' public/admin.html` — exit 0; confirmed `suite.css` is not loaded.
- `rg -n 'addEventListener\(' public/js/admin/office-approvals.js` — exit 0; independently confirmed one listener.
- `rg -n '^\s*it\(' server/tests/oaq-3-approval-queue.test.js` — exit 0; listed all 18 cases.
- `rg -n 'dt-appr-' public --glob '!css/admin-layout.css'` — exit 0 but the Windows glob did not exclude the CSS path; output still contained only the four CSS definitions and no call sites.
- `rg -n 'dt-approval-btn|appr-approved|appr-rejected|appr-\$|dt-appr' public/js public/*.html` — exit 1 because Windows rejected the `public/*.html` path argument; rerun against `public/js` returned exit 1/no matches.
- `rg -n 'dt-approval|dt-appr' public server scripts package.json` — exit 0; returned only definitions in `public/css/admin-layout.css`, confirming no source call sites.
- `npx vitest run tests/tickets-removed.test.js` — exit 0, **3/3 passed**; this ruled out the one transient partial full-run failure seen before timeout.
- `npx vitest run tests/oaq-3-approval-queue.test.js` — exit 0, **11 passed, 7 skipped (18 total)**; DB-backed cases skipped, proving the coverage split is 7 DB + 11 static.
- `node --check public/js/admin/office-approvals.js`, `node --check public/js/admin.js`, and `node --check server/routes/office-actions.js` — all exit 0. These were issued in one PowerShell line with exit guards.
- A PowerShell extractor from `## Senior Developer Review` to EOF — exit 0; section contained only its placeholder.
- A numbered story search for regression/CSS claim lines — exit 0; located lines 265–266, 297–298, 305–306, and 327.
- `git status --short` — exit 0 but output was truncated because this worktree already contains more than a thousand unrelated modified/untracked entries; warning: global git ignore was unreadable under sandbox permissions.
- `git status --short -- public/admin.html public/css/admin-layout.css public/js/admin.js public/js/admin/office-approvals.js server/routes/office-actions.js server/tests/oaq-3-approval-queue.test.js specs/stories/code-review/oaq-3-codex-findings.md` — exit 0; showed exactly the six implementation paths from the supplied diff plus this requested report.
- `rg -n '^## |^### \[Pass|^\*\*Blocking problem' specs/stories/code-review/oaq-3-codex-findings.md` — exit 0; final structural check confirmed all severity headings, pass-tagged findings, ship assessment, and validation section are present.

### What could not be run or verified

- I could not execute any Atlas-backed test or the requested live AC4/AC5 accept/decline/stale-conflict reproduction. Every connection attempt was denied by the execution environment with `connect EACCES 159.143.141.178:27017`; approval escalation is unavailable. The new file’s 7 DB cases therefore skipped, and one older suite’s setup/cleanup made the exact gate fail.
- I could not obtain a completed unfiltered-suite result: serial DB selection failures caused `npx vitest run` to exceed the 600-second command limit. The author’s 2422/2427, 10 failed files, seven file-level errors, and “byte-identical” wording remain unverified as stated. The three named assertion-level files were verified separately.
- I did not drive `public/js/admin/office-approvals.js` in a browser because the repository has no admin browser harness, as the review brief warned. Client behavior was checked by source reasoning, static tests, CSS/source searches, and syntax checks.

### Modification attestation

I made no source, test, configuration, database, commit, or sibling-repository changes and performed no temporary source edits. The only file I created/updated is this requested report. The full worktree was already heavily dirty; the final scoped status contains the six story implementation paths captured by the supplied diff plus `specs/stories/code-review/oaq-3-codex-findings.md`, with no additional review-created path.
