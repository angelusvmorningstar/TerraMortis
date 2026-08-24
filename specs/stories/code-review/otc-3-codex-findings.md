## Pass 1 — Blind Hunter

### High

- None found.

### Medium

- **[Pass 1] The security-boundary source assertion proves only one of the two required gates**
  - **Severity:** Medium
  - **File:line:** `server/tests/feature.691.hos-city-status-power.test.js:88`
  - **Triggering input or sequence:** Remove `&& isOwnOffice` from only the second condition at `public/js/tabs/office-tab.js:100`, leaving the HTML-shell condition at line 65 correct. The regex still finds the first correct condition, while the render tests use `{ innerHTML: '' }`, so `_wireCategoryPicker` returns at its no-`querySelector` guard and no test observes whether `_wireHosActions` was called.
  - **Observable consequence:** CI remains green with a half-applied mode boundary: the Status Actions shell stays hidden in reference view, but the interactive wiring path is invoked for a player browsing Head of State. This defeats the stated requirement that both sites be independently protected and can turn a later wiring implementation change into an unguarded game-state path without a failing regression test.
  - **Confidence:** High; the diff contains two production conditions but the assertion is an unanchored one-match regex, and the supplied render mock cannot exercise wiring.

### Low

- **[Pass 1] The picker silently becomes inert when the render target is not a real DOM element**
  - **Severity:** Low
  - **File:line:** `public/js/tabs/office-tab.js:108`
  - **Triggering input or sequence:** A production caller accidentally passes an element-like object that accepts `innerHTML` but has no callable `querySelector` (the same shape used by the render tests).
  - **Observable consequence:** The Office tab renders a visible category selector, but changing it does nothing and no error identifies the broken render-target contract. This is not a privilege-boundary bypass with the current browser call path, but the test-mock accommodation also masks a real integration failure.
  - **Confidence:** High about the silent inert behavior; medium that a non-DOM target can occur outside tests.

### Validation notes

- Opened only `specs/stories/code-review/otc-3-diff.txt`. I did not open the story/spec, repository source files outside the supplied diff, or any Pass 2/Pass 3 file. No import target was ambiguous enough to require resolution.
- Commands run:
  - `Get-Content -Raw -LiteralPath 'specs/stories/code-review/otc-3-diff.txt'` from the repo root — succeeded and returned the supplied source/tooling diff.
  - `cd server && npx vitest run tests/issue-1141-office-tab-render.test.js tests/feature.691.hos-city-status-power.test.js tests/otc-3-office-nav-unconditional.test.js` — exit 0; **3 test files passed, 44 tests passed**; Vitest 4.1.2 also emitted the existing `test.poolOptions` deprecation warning.
  - `git status --short` — exit 0, with Git warnings that `C:\Users\angel/.config/git/ignore` was inaccessible; the repo was already heavily dirty with the reviewed changes and many unrelated modified/untracked files before this report was created.
  - `Test-Path -LiteralPath 'specs/stories/code-review/otc-3-codex-findings.md'` — exit 0 and returned `False`, so there was no existing combined findings file or later-pass content to preserve.
  - A read-only PowerShell unified-diff line-number parser over `specs/stories/code-review/otc-3-diff.txt` — exit 0; confirmed the two production gates at `public/js/tabs/office-tab.js:65` and `:100`, the picker guard at `:108`, and the single regex assertion at `server/tests/feature.691.hos-city-status-power.test.js:88`.
  - `git status --short -- 'public/css/suite.css' 'public/js/app.js' 'public/js/tabs/office-tab.js' 'server/tests/feature.691.hos-city-status-power.test.js' 'server/tests/issue-1141-office-tab-render.test.js' 'server/tests/otc-3-office-nav-unconditional.test.js' 'specs/stories/code-review/otc-3-codex-findings.md'` — exit 0; showed the six reviewed source/test paths already modified or untracked and this newly created findings report, with the same inaccessible-global-ignore warning. No other scoped path was introduced by the review.
- Nothing requested was unable to run.
- I did not temporarily edit production or test code. The only file created is this requested findings report; the final scoped status check is recorded below and confirms no additional review-induced path change.

## Pass 2 — Edge Case Hunter

### High

- **[Pass 2] The client-only ownership gate is bypassable at the real POST boundary**
  - **Severity**: High
  - **File:line**: `server/routes/office-actions.js:41`
  - **The triggering input or sequence**: Any authenticated player, including one with no linked character and no office, sends `POST /api/office_actions` with a valid live-phase payload but supplies another character's `actor_id`. The route never compares `actor_id` with `req.user.character_ids`; at lines 67–74 it only loads that character and checks that `court_category` is truthy. It also accepts any office category rather than requiring `Head of State`. An isolated route probe used `req.user = { role: 'player', character_ids: [] }`, an unlinked actor whose category was `Primogen`, and a `raise` request.
  - **The observable consequence**: The probe returned HTTP 201 and changed the target from City Status 1 to 2. In production, a browsing player can bypass the correctly hidden/unwired panel, impersonate any known officeholder (or use their own non-HoS office character), mutate another character's City Status, and create an action log attributed to the supplied actor.
  - **Confidence**: High. The route does not read `req.user` anywhere, and the isolated Vitest/Supertest probe reproduced the accepted write. A second Mongo-backed probe could not connect because this environment denied the external Mongo connection, so it did not execute the request.

### Medium

- None found.

### Low

- None found.

### Validation notes

- Files opened in full: `specs/stories/code-review/otc-3-diff.txt`, `specs/stories/otc-3-office-tab-browsable-reference.md`, `public/js/tabs/office-tab.js`, `public/js/tabs/office-data.js`, `public/js/components/character-picker.js`, `server/routes/office-actions.js`, `server/schemas/office_action.schema.js`, `server/middleware/auth.js`, `server/tests/feature.691.hos-city-status-power.test.js`, and `server/tests/helpers/test-app.js`. I opened only relevant ranges/search hits from `public/js/app.js`, `public/css/suite.css`, `public/css/components.css`, `server/index.js`, `server/tests/issue-1141-office-tab-render.test.js`, `server/tests/otc-2-office-actions-api.test.js`, `server/tests/otc-3-office-nav-unconditional.test.js`, `server/vitest.config.js`, and the test setup/helper paths. I did not open any Pass 1 review or any prior contents of this findings file.
- Full UI chain checked: `goTab('office')` obtains `_activeMoreChar()` and calls `renderOfficeTab(el, char, suiteState.chars || [])`. Both panel markup and `_wireHosActions(el, char, chars)` are gated by the identical expression `category === 'Head of State' && isOwnOffice`; therefore a normal non-owner render neither emits the action elements nor invokes the wiring function. `doAction()` is nested inside `_wireHosActions`, and its only event hookup is created by that wiring path.
- Stale-render branch checked: `_wireHosActions` captures element references before its awaits and has no current-render/connection check. A category switch can therefore let the old async initialization finish against detached nodes, but those nodes are no longer reachable from the displayed tab. The shared character-picker source write is equivalent data, existing pickers snapshot their source array, and an already-started POST correctly updates the shared character object after the server write. I found no user-visible or privilege-crossing failure from this race.
- Default/malformed inputs checked with a real Node render: `court_category` values `undefined`, `null`, and `''` each selected `Head of State`, showed the reference banner, and emitted no Status Actions markup. The string `tampered-category` reached the pending-details fallback, showed the reference banner, and emitted no action markup; it did not throw.
- Category/data correspondence checked: `OFFICE_CATEGORIES` contains `Head of State`, `Primogen`, `Enforcer`, `Socialite`, and `Administrator`; `OFFICE_DATA` has the first four with exact spelling, while `Administrator` is deliberately absent and reaches the pending fallback.
- Navigation/CSS checked: `public/js/app.js` has exactly two `id: 'office'` registrations, retains each entry's icon/navigation or section properties, and has zero `hasOffice` occurrences. With no `condition`, `_moreGridCondition` returns `true` at line 1668 for players and STs before role-specific conditional logic. The new CSS selectors occur once in `suite.css`, use the same tokens as `.office-status-power`, and do not collide with another Office selector; `.form-select` supplies the existing generic select styling.
- Required gate command: `cd server && npx vitest run tests/issue-1141-office-tab-render.test.js tests/feature.691.hos-city-status-power.test.js tests/otc-3-office-nav-unconditional.test.js` — exit 0; **3 test files passed, 44 tests passed**.
- Other commands run, with their real results:
  - `Get-Location; git status --short; rg --files -g 'AGENTS.md' -g '!specs/stories/code-review/otc-3-codex-findings.md'; Get-Item 'specs/stories/code-review/otc-3-diff.txt'` — exit 0; confirmed the repo root, showed a heavily pre-existing dirty worktree, and located the diff. Output was truncated because the initial status contained over a thousand entries.
  - `rg --files | rg '(^|[\\/])AGENTS\.md$'; Get-Content specs/stories/code-review/otc-3-diff.txt` — exit 0; no `AGENTS.md` found and the scoped diff was read.
  - `rg -n --glob '!specs/stories/code-review/otc-3-codex-findings.md' "renderOfficeTab|_wireHosActions|doAction|office_actions|OFFICE_DATA|OFFICE_CATEGORIES|hasOffice|_moreGridCondition|office-reference-banner|office-category-picker|office-status-power" public server | Select-Object -First 500` — timed out with exit 124 after about 13 seconds; it still returned the relevant Office hits before timeout.
  - Numbered `Get-Content` reads of `office-tab.js`, `office-data.js`, `office-actions.js`, and relevant `app.js` ranges — exit 0; output was partly truncated, so narrower reads followed.
  - `rg -n -C 12 "renderOfficeTab|case 'office'|tab === 'office'|office:" public/js/app.js` plus numbered reads of the Office route/schema and `rg -n -C 3 "\.office" public/css/suite.css` — exit 0; confirmed the call site, POST handler, schema, and CSS rules.
  - Office-selector searches across CSS, a numbered full read of `character-picker.js`, and `rg` around `goTab`/`_activeMoreChar` — exit 0; no duplicate new selectors found and the active-character path was traced.
  - Numbered read of `feature.691.hos-city-status-power.test.js`, targeted `rg` in `otc-2-office-actions-api.test.js`, and auth-context searches — exit 0; existing route tests use ST users and do not assert player ownership.
  - Numbered reads requested for `test-app.js`, `auth.js`, `server/tests/setup-env.js`, and `db-setup.js` — exit 1 after successfully reading the first two because the requested setup path was wrong (`server/tests/setup-env.js` does not exist). A follow-up `rg` found the actual path `server/tests/helpers/setup-env.js` and the Vitest setup reference; exit 0.
  - `npx vitest run tests/_tmp-otc3-auth-probe.test.js` — exit 1; the Mongo-backed temporary probe was skipped and suite setup failed because Mongo connection `159.143.141.178:27017` was denied with `EACCES`.
  - Story/default/key/static checks using numbered `Get-Content`, `rg -n "hasOffice"`, `rg -n "id: 'office'"`, and top-level `OFFICE_DATA` key matching — exit 0; zero `hasOffice` hits, two Office registrations, four exact data keys, and the first temporary probe was absent.
  - `npx vitest run tests/_tmp-otc3-auth-unit-probe.test.js` — exit 0; **1 test file passed, 1 test passed**, reproducing HTTP 201 and the City Status mutation for a no-office player using an unlinked Primogen actor.
  - `npm ls jsdom happy-dom --depth=0` — exit 1 with an empty dependency tree; neither DOM package is installed.
  - A Node `--input-type=module` render probe for the three falsy `court_category` values, a malformed `viewCategory`, and category/data keys — exit 0; results are recorded above.
  - A temporary `apply_patch` append-semantics probe was read once with `Get-Content`; exit 0 and content was exactly `first` then `second`.
  - `(Get-Item specs/stories/code-review/otc-3-codex-findings.md).Length; git status --short -- <temporary paths> <findings path>` — exit 0; pre-append length was 4384 bytes, all temporary probe paths were absent, and only the pre-existing untracked findings file appeared.
- Temporary modifications: I created two temporary test files and one append-semantics probe with `apply_patch`, then deleted all three with `apply_patch`. The Mongo probe made no database writes because connection failed before setup. The isolated authorization probe used mocked in-memory collections only. No source, tooling, test, or data file remains modified by this pass; the only intentional persistent change is this appended Pass 2 section.
- Could not run the Mongo-backed authorization probe because network access to MongoDB was denied (`EACCES`). The exact required three-file gate and the isolated route probe both ran successfully.
- Final scoped verification (`Get-Item` length, `rg -c` for the Pass 2 heading, `Get-Content -Tail 1`, `Test-Path` for all temporary files, and scoped `git status --short`) — exit 0; the file grew from 4384 to 13584 bytes, exactly one Pass 2 heading exists, all three temporary paths are absent, and scoped status contains only the pre-existing story changes plus this intentionally appended untracked findings file. Git also repeated its pre-existing warning that the user-level ignore file was inaccessible.

## Pass 3 — Acceptance Auditor

### 3a

#### High

- None found.

#### Medium

- None found.

#### Low

- **[Pass 3a] New reference-view copy violates the story's explicit no-em-dash rule**
  - **Severity:** Low
  - **File:line:** `public/js/tabs/office-tab.js:41`
  - **Triggering input or sequence:** A player selects any office other than the one held by their active character, or a player with no held office opens the Office tab and receives the Head of State default.
  - **Observable consequence:** The reference banner renders `Reference view — showing what this office grants, not your own.`, despite the Dev Notes requiring British English and no em dashes in new player-facing copy. Functionality is unaffected, but the implementation contradicts an explicit story constraint.
  - **Confidence:** High; the literal U+2014 character is present in the rendered string at line 41.

### 3b

#### High

- None found.

#### Medium

- **[Pass 3b] The claimed "picker path" coverage bypasses the picker event entirely**
  - **Severity:** Medium
  - **File:line:** `server/tests/issue-1141-office-tab-render.test.js:48`, `server/tests/issue-1141-office-tab-render.test.js:170`
  - **Triggering input or sequence:** Remove the `select.addEventListener('change', ...)` block from `_wireCategoryPicker`, then run `npx vitest run tests/issue-1141-office-tab-render.test.js tests/feature.691.hos-city-status-power.test.js`. The tests still report 40/40 passed because the helper passes `viewCategory` directly and the Administrator test calls `render(..., 'Administrator')` instead of dispatching a picker change.
  - **Observable consequence:** The committed suite stays green even when players can no longer change offices through the UI. The Dev Agent Record's Task 4 statement that Administrator is covered "via the picker path" is overstated, and the core AC2/AC6 interaction has no committed regression protection. The current production handler does work; this is a coverage and claim-accuracy defect.
  - **Confidence:** High; the mutation was run and produced 40/40 passing tests, then was restored byte-for-byte.

#### Low

- **[Pass 3b] The claimed 147/147 gate is unverifiable as stated in this audit environment**
  - **Severity:** Low
  - **File:line:** `specs/stories/otc-3-office-tab-browsable-reference.md:88`
  - **Triggering input or sequence:** Run the exact seven-file command required by the story and this audit after restoring the guard.
  - **Observable consequence:** The real result here is 139 passed and 8 skipped out of 147 tests, with 6 test files passed and `otc-2-office-actions-api.test.js` failed during setup because the sandbox denied its MongoDB connection (`connect EACCES 159.143.141.178:27017`). The six runnable files pass 139/139. This does not prove the author's prior 147/147 result false, but it means that claim cannot be independently confirmed as stated.
  - **Confidence:** High about the current result and its cause; no conclusion is drawn about the author's original network-enabled run.

### Validation notes

- **3a files opened:** the Story, What this story is NOT, Acceptance Criteria, and Dev Notes sections only of `specs/stories/otc-3-office-tab-browsable-reference.md`; all of `specs/stories/code-review/otc-3-diff.txt`; `public/js/tabs/office-tab.js`; the relevant navigation/caller regions of `public/js/app.js`; content anchors in `public/js/tabs/office-data.js`; relevant rules in `public/css/components.css` and `public/css/suite.css`; and `server/package.json`. No `AGENTS.md` exists in the repo. I did not read the Dev Agent Record, Tasks/Subtasks, or any Pass 1/Pass 2 review file before writing 3a into this findings file.
- **3b files opened:** Tasks/Subtasks and the complete Dev Agent Record in `specs/stories/otc-3-office-tab-browsable-reference.md`, plus the relevant implementation/test lines in `public/js/tabs/office-tab.js`, `public/js/tabs/office-data.js`, and `server/tests/issue-1141-office-tab-render.test.js`. Pass 1 and Pass 2 findings/review files were never opened; this pass was appended using an EOF-context operation.
- **Initial inventory commands:** `rg --files -g AGENTS.md` found no instructions file; `git status --short` showed a heavily dirty pre-existing worktree, including the staged story source/test edits, an unstaged `sprint-status.yaml`, and many unrelated untracked files; heading/diff-header `rg` commands located the spec boundaries and six-file scoped diff. A section-selecting PowerShell read then printed only the permitted 3a spec sections and the supplied diff successfully.
- **3a inspection/test commands:** numbered reads of `office-tab.js`, the relevant `app.js` regions, and `server/package.json` succeeded. My first compound scope command was run from `server`, so its three repo-relative `rg` checks failed with file-not-found, while its Vitest portion passed 13/13 across `issue-1141-office-tab-render` and `otc-3-office-nav-unconditional`. I reran the three `rg` checks from the repo root successfully. A Node fake-DOM picker-change trace from Primogen to Head of State exited 0: only `#office-category-select` was queried, the reference banner, Due Diligence, and merit markup were present, and Status Actions markup was absent.
- **3a recording commands:** an initial line-count PowerShell probe had a parser error; the corrected metadata-only probe reported the existing findings file as 14,096 bytes with a trailing newline. One context-free `apply_patch` append attempt failed without modifying the file, and one internal base64-tail attempt failed because `atob` is unavailable. The subsequent EOF-context `apply_patch` appended 3a without exposing or reading prior-pass content.
- **Guard mutation command and result:** after recording pre-mutation SHA-256 `715EEF2192481AD04AE30FC9A7FB3C03A6A44EAD3D60A0D21F263EB6299304C2` and an empty unstaged diff, I removed only `typeof el.querySelector !== 'function'` and ran the exact seven-file command. Result: 9/9 `issue-1141-office-tab-render` tests failed at `_wireCategoryPicker` with `TypeError: el.querySelector is not a function`; overall 130 passed, 9 failed, 8 skipped (147), 5 files passed and 2 failed. The second failed file was independently caused by MongoDB `EACCES`. This confirms the guard-regression claim exactly for every plain-object render test in the file.
- **Guard restore and gate commands:** I restored the guard, normalised the six patch-local line endings back to the original CRLF form, recovered the exact pre-mutation SHA-256, and confirmed `git diff -- public/js/tabs/office-tab.js` was empty. The exact seven-file rerun then reported 139 passed and 8 skipped (147), 6 files passed and 1 setup-failed on MongoDB `EACCES`. Running the six non-database files separately passed 139/139.
- **Node render claim command:** a Node render of Brandy (Socialite) browsing Enforcer exited 0 with picker and banner present, real Enforcer manoeuvre `Perimeter` present, and no Status Actions markup. Equivalent committed render assertions exist for picker markup, the reference banner, real cross-category manoeuvre/merit content, and absent panel markup, but not for dispatching the picker change itself (the Medium finding above).
- **AC3 second-site mutation command:** I temporarily weakened only the post-render `_wireHosActions` condition to raw Head of State and ran the two Office render/contract files. All 40 individual assertions passed, but Vitest exited 1 with two unhandled `_wireHosActions` rejections at its first `el.querySelector`, proving the committed gate catches the second-site regression indirectly. After restoration and exact hash recovery, the same two files passed 40/40. Together with the direct fake-DOM trace and both literal code gates at `office-tab.js:65` and `office-tab.js:100`, AC3's two-site boundary is genuinely and verifiably closed, not merely visually closed.
- **Picker-wiring mutation command:** I removed only the `addEventListener('change', ...)` block and reran the same two files; they remained green at 40/40, establishing the missing interaction coverage. I restored the block, converted seven patch-local lone-LF endings back to CRLF, recovered the exact original SHA-256 again, confirmed an empty unstaged source diff, and reran the two files green at 40/40.
- **Final integrity commands:** scoped `git status --short` matches the pre-existing story state plus this intentionally appended untracked findings file; `git diff` over all story source/test paths is empty (no unstaged mutation remains); and `git diff --cached --check` exits 0. No source, test, spec, or sprint-status change was left by this audit other than the requested append to `otc-3-codex-findings.md`.
- **Could not run:** the 8 tests in `tests/otc-2-office-actions-api.test.js` could not execute because this sandbox blocks the configured external MongoDB connection. Everything else requested was run.
- **Verdict:** Needs patches, not blocked. The functional implementation satisfies all six ACs, the out-of-scope boundaries are respected, and AC3 is genuinely closed at both the HTML-shell and wiring sites. Before shipping as-is, replace the forbidden em dash in the player-facing banner and add a committed DOM-capable picker-change test so AC2/AC6 are protected through the real interaction path. The unavailable database gate should also be rerun in an environment with MongoDB access to reconfirm the author's 147/147 claim.
