# crd.3b adversarial review findings

## High

- None found in Pass 1.
- None found in Pass 2.
- None found in Pass 3a.
- None found in Pass 3b.

## Medium

### [Pass 1] In-flight resolve and accept completions can corrupt a later mount

- **Severity**: Medium
- **File:line**: `public/js/game/contested-resolve.js:69`, `public/js/game/contested-resolve.js:153`, `public/js/game/contested-resolve.js:180`
- **Triggering input or sequence**: Mount challenge A, start `/resolve` or `/accept`, then call `initContestedResolve` for challenge B before the first request settles. `_resetState` does not invalidate `_resolveGen`; `_resolve` checks only that global generation, and `_accept` has no generation/mount check at all. The same defect occurs on a remount of the same challenge ID, for which even the `ensureLoaded(...).then(...)` ID check cannot distinguish mount generations.
- **Observable consequence**: A completion belonging to challenge A writes its pool, error, or rolled outcome into the module-level state now describing challenge B. On the stable app root it can replace the new screen with the old challenge's data; an accept completion can display A's dice result while the user is looking at B.
- **Confidence**: High. This follows directly from the module-global mutable state and the absence of mount invalidation around both awaited calls.

### [Pass 1] Rejected network promises leave operation state latched with no error recovery

- **Severity**: Medium
- **File:line**: `public/js/game/contested-resolve.js:153`, `public/js/game/contested-resolve.js:160`, `public/js/game/contested-resolve.js:180`, `public/js/game/contested-resolve.js:185`
- **Triggering input or sequence**: `apiRaw` rejects instead of returning a non-OK response, for example on loss of connectivity or a thrown fetch-layer failure during `/resolve` or `/accept`.
- **Observable consequence**: There is no `try/finally` or `catch`: the rejection is unhandled, `resolving` or `accepting` remains true, and no visible error is rendered. A rejected accept makes all pool controls inert for the rest of that mount (the Back handler remains reachable because it is deliberately checked before the `accepting` guard).
- **Confidence**: High that the cleanup is absent; whether `apiRaw` can reject will be checked against repository context in Pass 2.

### [Pass 1] Multiple server/character values reach `innerHTML` without escaping

- **Severity**: Medium
- **File:line**: `public/js/game/contested-resolve.js:229`, `public/js/game/contested-resolve.js:230`, `public/js/game/contested-resolve.js:233`, `public/js/game/contested-resolve.js:281`, `public/js/game/contested-resolve.js:288`, `public/js/game/contested-resolve.js:300`, `public/js/game/contested-resolve.js:325`
- **Triggering input or sequence**: A character merit supplies a non-numeric `rating`, or a server response/challenge object supplies markup-bearing `margin`, `successes`, `defender_pool`, or `challenger_pool`; these values are interpolated into the HTML template without `esc()`.
- **Observable consequence**: Markup is parsed into the resolution screen and could become DOM XSS if any upstream validation/storage path permits a crafted value. Even if current server schemas constrain these fields numerically, this template violates the diff's stated complete escaping boundary and is brittle to malformed responses.
- **Confidence**: Medium pending Pass 2 verification of upstream schemas. The unescaped sinks themselves are certain.

- No additional Medium findings were found in Pass 2.

### [Pass 3a] Willpower and merit changes before aspect selection do not call `/resolve`

- **Severity**: Medium
- **File:line**: `public/js/game/contested-resolve.js:128`, `public/js/game/contested-resolve.js:135`, `public/js/game/contested-resolve.js:154`
- **Triggering input or sequence**: On a fresh screen, toggle an available Willpower chip or qualifying merit before choosing Mental/Social/Physical. The handler changes state and invokes `_resolve`, but `_resolve` returns early when `state.aspect` is unset.
- **Observable consequence**: No `PUT .../resolve` is made for that selection change, contrary to AC6's literal “On every change to ... the Willpower toggle, or the merit selection” rule. The UI shows the choice as selected while the promised server-owned live preview has not evaluated it. The tests conceal this branch by always selecting an aspect first.
- **Confidence**: High.

### [Pass 3a] The primary action duplicates the server's null-pool gate despite AC7 forbidding that client gate

- **Severity**: Medium
- **File:line**: `public/js/game/contested-resolve.js:290`, `public/js/game/contested-resolve.js:324`
- **Triggering input or sequence**: Open a fresh challenge, or have the latest `/resolve` fail so `state.pool` is null.
- **Observable consequence**: The client disables the accept action via `state.pool != null`, making the pre-existing `/accept` guard and its 409 unreachable from this screen. AC7 explicitly says the route's own `defender_pool == null` guard is what protects the action and “this story adds no client-side gating duplicate of that guard”; the implementation does exactly the excluded thing.
- **Confidence**: High; this is a direct literal contradiction between the AC and the `canAccept` expression.

### [Pass 3a] Returning after accept briefly, or indefinitely on fetch failure, restores a tappable stale pending row

- **Severity**: Medium
- **File:line**: `public/js/game/pending-queue.js:97`, `public/js/game/pending-queue.js:216`, `public/js/game/pending-queue.js:285`
- **Triggering input or sequence**: Successfully accept a challenge and press Back. `initPendingQueue` starts its refresh with the old challenge still in `state.rows`; `_renderBody` renders nonempty cached rows even while `state.loading` is true. If the refresh fails, the old rows are deliberately retained.
- **Observable consequence**: The just-resolved challenge reappears as a normal tappable pending row until the GET completes, violating AC8's literal no-stale-row requirement. On a network failure it remains pending/tappable indefinitely; reopening it reaches a builder backed by a now-resolved server record and produces 409 errors.
- **Confidence**: High. This is the queue's explicit loading/failure behavior applied to the successful-accept sequence.

### [Pass 3b] The Dev Agent Record's “AC8 verified” claim is false

- **Severity**: Medium
- **File:line**: `specs/stories/crd-3b-client-resolution-screen.md:310`, `public/js/game/pending-queue.js:216`
- **Triggering input or sequence**: Successfully accept, press Back, and observe the queue before its new GET settles or while that GET fails.
- **Observable consequence**: The record says the no-stale-row behavior is an already-verified emergent property and “there is nothing new to test,” but the queue first re-renders its cached pending row and preserves it on failure. This confirmed label would let the real AC8 defect in the Pass 3a finding ship without a regression test.
- **Confidence**: High.

## Low

### [Pass 1] Willpower availability is a one-shot snapshot and can become stale

- **Severity**: Low
- **File:line**: `public/js/game/contested-resolve.js:99`
- **Triggering input or sequence**: Leave the resolution screen mounted while the character's Willpower changes through another action/session after `ensureLoaded(character)` has completed.
- **Observable consequence**: The toggle can remain enabled after Willpower reaches zero or remain disabled after it is restored. The server may reject an invalid spend, but the screen presents stale availability until remounted.
- **Confidence**: Medium. The one-shot read is certain; Pass 2 will determine whether another in-screen update path can affect the tracker while this tab stays mounted.

### [Pass 1] Missing-context test can pass for any nonempty markup

- **Severity**: Low
- **File:line**: `server/tests/crd-3b-resolution-screen.test.js:138`
- **Triggering input or sequence**: Replace the intended graceful missing-data state with any nonempty HTML, including an unrelated spinner, blank wrapper, or error dump.
- **Observable consequence**: The test named as proving a graceful non-crashing state still passes because it asserts only `innerHTML.length > 0`; it does not assert the recovery message or Back action that make the state useful.
- **Confidence**: High.

### [Pass 1] Import documentation names a helper the module does not import

- **Severity**: Low
- **File:line**: `public/js/game/contested-resolve.js:21`
- **Triggering input or sequence**: A maintainer relies on the module's trust-boundary comment when changing outcome rendering.
- **Observable consequence**: The comment says both `mkDieEl` and `mkColsEl` are imported, but only `mkColsEl` is imported and used, making the security-sensitive explanation factually inconsistent with the adjacent code.
- **Confidence**: High.

### [Pass 2] Schema-valid duplicate merit keys produce duplicate, contradictory controls

- **Severity**: Low
- **File:line**: `public/js/game/contested-resolve.js:276`, `server/routes/contested-rolls.js:188`
- **Triggering input or sequence**: A schema-valid character has two merit rows with the same resolvable `rule_key` (the server explicitly documents that cross-row uniqueness is not enforced), especially two `closed-book` rows with different ratings.
- **Observable consequence**: The client renders one chip per row but stores selection in a Set keyed only by `rule_key`, so clicking either chip visually selects both and submits one key. The chips can advertise different bonuses while the server deliberately uses only the first matching row, leaving the player unable to tell which displayed bonus actually contributed.
- **Confidence**: High. Both the permitted duplicate shape and the server's first-match semantics are explicit in the current code.

### [Pass 2] Context correction: Pass 1's unescaped numeric sinks are constrained on current production paths

- **Severity**: Low
- **File:line**: `server/schemas/character.schema.js:402`, `server/schemas/character.schema.js:445`, `server/schemas/contested_roll_request.schema.js:43`, `server/routes/contested-rolls.js:195`, `server/routes/contested-rolls.js:256`
- **Triggering input or sequence**: Normal production character writes, challenge creation, `/resolve`, and `/accept` produce the values identified in Pass 1.
- **Observable consequence**: Contrary to the broader Pass 1 threat assessment, these paths constrain merit ratings and attributes to integers, challenge pools to integers, clamp the defender pool to 0–30, and compute successes/margin server-side. Therefore the unescaped sinks remain an escaping-completeness defect but are not a demonstrated XSS vector through the current validated routes; exploitation would require malformed legacy/directly-written data or a future contract regression.
- **Confidence**: High for the current routes and schemas. The original Pass 1 finding remains unchanged as required.

### [Pass 3a] AC7 repeatedly requires two renderer imports, but only one is imported

- **Severity**: Low
- **File:line**: `public/js/game/contested-resolve.js:33`
- **Triggering input or sequence**: Audit the shipped module against AC7, Task 7, the locked decision, “What this story is NOT,” and Dev Notes, all of which name `mkDieEl` and `mkColsEl` as the two imported DOM builders.
- **Observable consequence**: The module imports only `mkColsEl` (which internally calls `mkDieEl`). Rendering works, but the completed change does not meet the specification's literal two-export import contract and its own header comment falsely says both are imported.
- **Confidence**: High.

### [Pass 3a] New CSS uses literal spacing and font sizes despite AC11's token-only wording

- **Severity**: Low
- **File:line**: `public/css/suite.css:2408`, `public/css/suite.css:2426`, `public/css/suite.css:2429`, `public/css/suite.css:2448`, `public/css/suite.css:2465`, `public/css/suite.css:2482`
- **Triggering input or sequence**: Compare the new rules literally with AC11's requirement that every colour, spacing, and font value be an existing `theme.css` token.
- **Observable consequence**: The rules contain many raw spacing/font values (`gap: 8px`, `padding: 8px 12px`, `font-size: 12px`, `padding: 3px`, `min-height: 44px`, and others). Colours, font families, and radii use tokens and no forbidden hex/rgba was added, but the broader token-only statement is not satisfied; `theme.css` explicitly says this project has no spacing scale.
- **Confidence**: High on the literal mismatch; Low impact because the stylesheet follows the repository's existing numeric-value convention and the AC is stricter than the available token system.

### [Pass 3b] The claimed 229/229 clean regression could not be reproduced in this environment

- **Severity**: Low
- **File:line**: `specs/stories/crd-3b-client-resolution-screen.md:345`
- **Triggering input or sequence**: Run the exact eight-file gate command required by this review.
- **Observable consequence**: Vitest counted 229 tests but reported **112 passed, 117 skipped, one failed suite, exit 1**. `api-tracker-state.test.js` attempted MongoDB and failed with `connect EACCES 159.143.141.178:27017`; this is an environment/database failure, not a crd.3b assertion failure, but the record's clean 229/229 result is unverified here. The dedicated crd.3b gate is independently confirmed at 19/19, and the crd.2 blast-radius file independently reports 55 passed / 2 DB-skipped.
- **Confidence**: High about this session's real result; no claim that the author's earlier clean run was fabricated.

### [Pass 3b] Historical screenshot and em-dash-removal actions leave no retained evidence

- **Severity**: Low
- **File:line**: `specs/stories/crd-3b-client-resolution-screen.md:277`, `specs/stories/crd-3b-client-resolution-screen.md:286`
- **Triggering input or sequence**: Attempt to audit the record's assertions that temporary rendered strings contained em-dashes and that a temporary real-CSS harness was screenshotted in both themes.
- **Observable consequence**: The current working tree contains no crd.3b screenshot or static-harness artifact, and neither the base nor supplied diff contains the claimed pre-fix rendered strings, so those historical actions are unverifiable as stated. Current outcomes do check out: rendered template strings contain no em-dash, the documented wrapper-class substitutions are present, and an independent temporary Playwright render against the real three stylesheets succeeded in both themes before its artifacts were removed.
- **Confidence**: High on the absence of retained evidence and current-state checks; deliberately no conclusion about whether the historical actions occurred.

### [Pass 3b] “Exact await sequence” overstates the implementation, though the ordering is correct

- **Severity**: Low
- **File:line**: `specs/stories/crd-3b-client-resolution-screen.md:307`, `public/js/game/contested-resolve.js:99`
- **Triggering input or sequence**: Compare the record's claimed exact `await ensureLoaded(character) → trackerRead(charId)` sequence to the implemented load callback.
- **Observable consequence**: The implementation uses an unreturned `ensureLoaded(character).then(...)`, not `await`. `trackerRead` is still correctly sequenced after successful loading, so the prior seeded-default bug is not reintroduced, but rejection/lifecycle behavior differs and contributes to the unhandled/cross-mount findings from Pass 1.
- **Confidence**: High.

### [Pass 3b] The mock rationale inaccurately says roll-v2 declares browser globals at module scope

- **Severity**: Low
- **File:line**: `specs/stories/crd-3b-client-resolution-screen.md:319`, `server/tests/crd-2-pending-queue.test.js:76`
- **Triggering input or sequence**: Read the imported `roll-v2.js` module and compare it with the record's explanation for mocking both tracker and roll-v2.
- **Observable consequence**: `tracker.js` really does evaluate `location` at module scope, but roll-v2's direct `document` uses are inside functions, not top-level declarations. Mocking roll-v2 is still appropriate to isolate `mkColsEl` and avoid needing a real DOM/transitive browser graph; the stated “both declare browser globals at module scope” reason is factually overstated.
- **Confidence**: High for roll-v2's direct source; transitive imports may have their own browser coupling.

## Ship assessment

**Needs patches before shipping.** There is no blocking/high-severity problem, but AC6, AC7, and AC8 are literal behavioral failures, and the remount/request-rejection races can present the wrong challenge state or latch the UI. The dedicated tests passing 19/19 does not cover those branches.

## Validation notes

### Pass isolation and files opened

- **Pass 1**: Opened only `specs/stories/code-review/crd-3b-diff.txt` (full read plus bounded rereads/source-line reconstruction from that same file). I did not open the story, production files, tests, tracking files, mockup, or other repository context before freezing Pass 1.
- **Pass 2**: Directly opened/read all or relevant bounded sections of `public/js/game/pending-queue.js`, `public/js/game/tracker.js`, `public/js/suite/roll-v2.js`, `public/js/data/api.js`, `public/js/data/ws.js`, `public/js/app.js`, `public/index.html`, `public/css/suite.css`, `public/css/components.css`, `server/routes/contested-rolls.js`, `server/routes/characters.js`, `server/schemas/character.schema.js`, `server/schemas/contested_roll_request.schema.js`, and the whole `server/tests/crd-2-pending-queue.test.js`. Repository-wide `rg` searches also read/matched nearby client/test files for `ensureLoaded`, `rollChar`, selectors, schemas, tracker updates, and server parity; the exact scopes are in the command inventory below. I did not open the story in Pass 2. A selector search incidentally returned one matching line from the excluded standalone mockup; I did not intentionally inspect the mockup until Pass 3b, but this incidental match is disclosed.
- **Pass 3a**: Opened `specs/stories/crd-3b-client-resolution-screen.md` lines 12–266 only for the permitted story/decision/AC/task/dev-note material, plus relevant current code/tests/styles. **Blinding breach**: before Pass 3a was frozen, a broad `rg` intended to compare AC phrases across the story and tests also returned isolated later lines 304, 310, and 345 from the Dev Agent Record/Change Log (CSS/screenshot, AC8, em-dash, retired-tests, and gate-count claims). I did not open the full record until Pass 3b, but I cannot truthfully attest that Pass 3a saw none of it. The AC6/AC7/AC8 findings had already been derived from permitted AC text and code before that search.
- **Pass 3b**: Opened the full Dev Agent Record (story lines 267–340), the current and base resolution module/diff, the mockup's named wrapper-class occurrences, Playwright config/package references, current style definitions, and roll-v2's DOM-helper area. I did not open or use the existing untracked `crd-3b-codex-review.md` or `crd-3b-codex-run.log` files.

### Commands run and real results

Pass 1 commands:

1. `Get-Content -LiteralPath 'specs/stories/code-review/crd-3b-diff.txt'` — succeeded; output was long and initially truncated by the tool.
2. `Select-String -LiteralPath 'specs/stories/code-review/crd-3b-diff.txt' -Pattern '^diff --git'` — succeeded; established the five diff-file boundaries.
3. `$lines = Get-Content ...; $lines[121..511]` — succeeded; reread the complete contested-resolve hunk from the diff only.
4. A PowerShell loop over that hunk reconstructing target source line numbers for `_resetState`, `ensureLoaded`, `_resolve`, `_accept`, and dynamic HTML sinks — succeeded.

Pass 2 commands (parallel invocations are listed as their individual shell commands):

1. Full `Get-Content` reads of `pending-queue.js` and `tracker.js` — succeeded (the combined display truncated part of tracker, followed by bounded rereads).
2. `rg -n "ensureLoaded|rollChar" public/js server/tests -g "*.js" -g "!crd-3b-resolution-screen.test.js"` — succeeded.
3. `rg -n "initContestedResolve|data-cr-(...)" public server/tests -g "*.js" -g "*.html"` — succeeded; incidentally matched the mockup once.
4. Bounded `Get-Content` reads of tracker lines 86–181 and roll-v2 lines 111–181, 541–591, and 581–661 — succeeded.
5. `rg` searches for `mkDieEl`/`mkColsEl`, module state, resolvable merit keys, defender fields, schemas, character validation, goTab activation, WebSocket tracker updates, route helpers, selectors, CSS classes, and all client `initContestedResolve` call sites — succeeded.
6. Bounded/full reads of `server/routes/contested-rolls.js`, `public/js/data/api.js`, `server/schemas/character.schema.js`, `server/schemas/contested_roll_request.schema.js`, `server/routes/characters.js`, `public/js/app.js`, and `public/js/data/ws.js` — succeeded.
7. `Get-Content -LiteralPath 'server/tests/crd-2-pending-queue.test.js'` plus bounded rereads `[160..430]`, `[430..650]`, `[650..780]` and describe/count indexing — succeeded; confirmed all 745 lines were covered despite the first display truncating.
8. `git diff --no-ext-diff --unified=80 3f3e739d -- 'server/tests/crd-2-pending-queue.test.js'` — succeeded; showed the three retired tests and new mocks. Git emitted only config/line-ending warnings.
9. One combined four-command orchestration for route/schema/app/test-diff reads exited 1 and returned no usable combined output; the same four commands were immediately rerun with per-command error capture and succeeded. This failed invocation is not omitted from the audit.

Pass 3a commands:

1. `Select-String ... crd-3b-client-resolution-screen.md -Pattern '^#{1,3} '` — succeeded; located section boundaries without opening record prose.
2. `$lines = Get-Content ...; $lines[11..265]` — succeeded; read only the permitted pre-record portion.
3. `rg`/bounded reads over `theme.css`, the new `suite.css` block, resolve/queue branch lines, and AC/test phrases — succeeded. The AC/test phrase search was the disclosed read-ahead breach because it was not bounded before the record.

Pass 3b commands and results:

1. `$lines = Get-Content ...; $lines[266..340]` — succeeded; read the Dev Agent Record in full.
2. `cd server && npx vitest run tests/crd-3b-resolution-screen.test.js` — **exit 0: 1 file passed; 19 passed / 19 total**.
3. `cd server && npx vitest run tests/crd-1-contested-roll-request-shape.test.js tests/crd-2-pending-queue.test.js tests/crd-3a-resolve-endpoint.test.js tests/crd-3b-resolution-screen.test.js tests/api-tracker-state.test.js tests/oaq-2-pending-status-actions.test.js tests/oaq-3-approval-queue.test.js tests/gdx-7-apply-costs-on-roll.test.js` — **exit 1: 1 file failed, 4 passed, 3 skipped; 112 tests passed, 117 skipped, 229 total**. `api-tracker-state.test.js` failed suite setup on MongoDB `connect EACCES 159.143.141.178:27017`, then teardown reported “Database not connected.” No crd.3b assertion failed.
4. `cd server && npx vitest run tests/crd-2-pending-queue.test.js` — **exit 0: 55 passed, 2 skipped, 57 total**. The two skips are its DB-backed GET `/mine` server block; the client routing/import/blast-radius describes passed.
5. The same seven-file regression without `api-tracker-state.test.js` — **exit 0: 4 files passed, 3 skipped; 112 passed, 109 skipped, 221 total**. `rg` confirmed the skips are Mongo-guarded blocks across the older DB-backed files; crd.3b itself has no skips.
6. `rg -n "—" public/js/game/contested-resolve.js` — succeeded with matches only in comments, none in rendered template strings. Searches of the base file and current diff could not show the claimed temporary pre-fix rendered strings.
7. Wrapper-class `rg` across the mockup, `contested-resolve.js`, `suite.css`, and `components.css` — succeeded: the mockup uses `.cr-screen/.cr-head/.cr-summary/.cr-section-label/.cr-actions`; shipped code instead uses the named existing `.stm-*`, `.cq-*`, `.ch-pools/.ch-pool-row`, and `.form-section-title` classes. A shipped-file-only search returned `NO_RETIRED_WRAPPER_MATCHES_IN_SHIPPED_FILES`.
8. Artifact search `rg --files | rg -i '(crd-3b.*image|playwright|screenshot|...harness)'` — found Playwright config/story references but no retained crd.3b screenshot or harness.
9. `npx playwright --version` — exit 0, Playwright 1.58.2. Reads/searches of `playwright.config.js`, package manifests, theme selectors, relevant component styles, and roll-v2 DOM references succeeded.
10. Temporary independent Chromium check: an `apply_patch`-created `D:\tmp\crd3b-visual-check.mjs` loaded the exact current builder markup and real `theme.css`, `components.css`, and `suite.css`. First run failed `ERR_MODULE_NOT_FOUND` from the temp script location; after using `createRequire` it launched Chromium but PNG output to `D:\tmp` failed `EPERM`; after redirecting PNGs into the workspace it succeeded. A first screenshot was captured mid-transition, so the script was rerun after a 350ms settle. Final metrics: light selected foreground `rgb(122, 0, 0)`, background `rgba(122, 0, 0, 0.25)`; dark selected foreground `rgb(224, 196, 122)`, background `rgba(224, 196, 122, 0.25)`; body width 884 at viewport 900 in both. Both final PNGs were visually inspected. The script and PNGs were then removed.
11. Git/status commands: `git diff` against base/current files, `git show 3f3e739d:public/js/game/contested-resolve.js`, `git status --short`, `git diff --stat`, and report count/diff checks — succeeded with only Git config/line-ending warnings.

`apply_patch` was used only to create/append this required findings report and to create/update/delete the temporary visual-check script. No production, test, spec, tracking, mockup, or configuration file was edited by this review.

### Could not run / limitations

- I could not obtain the requested **clean** 229/229 eight-file gate because outbound MongoDB access is denied in this environment (`EACCES`). The real observed aggregate is reported above; it is not relabeled as passing.
- I did not run a full authenticated live app with Discord OAuth/test token, real Mongo fixtures, and WebSocket. The current static CSS composition was independently run in Chromium in both themes, but that does not substitute for the unavailable DB-backed/full-session path.
- I could not verify that the author's historical temporary screenshot/em-dash edits actually occurred because no before-state, harness, command log, or screenshot artifact is retained. I verified the current outcomes only.
- No jsdom was added or attempted.

### Modification/restore attestation

The only lasting file created/modified by this review is `specs/stories/code-review/crd-3b-codex-findings.md`, as explicitly required by the review instructions. The temporary Playwright script and both generated PNGs were deleted. Final `git status --short` was checked for those names and for unintended changes; the repository still contains the story's pre-existing uncommitted source/tracking/mockup/test changes and other pre-existing untracked review artifacts, but no unintended production/test change from this review.
