# Adversarial review findings — oxp-7 Sheet Office Merits section

## High

- None found in Pass 1.
- None found in Pass 2.
- None found in Pass 3a.
- None found in Pass 3b.

## Medium

- None found in Pass 2.

### [Pass 3b] The claimed “wired-integration” generation test never renders or replaces a sheet

- **Severity**: Medium
- **File:line**: `specs/stories/oxp-7-sheet-office-merits-section.md:169-171,195,302-304`; `server/tests/oxp-7-sheet-office-merits-section.test.js:124-148,289-338`; `public/js/suite/sheet.js:747-759`
- **Triggering input or sequence**: Run the AC7 test. It calls `patchOfficeMerits(YUSUF)` and `patchOfficeMerits(rene)` directly against a fake document that retains both separately-created slots; it never calls `renderSheet()` and therefore never exercises the real branch that replaces one container and clears the other.
- **Observable consequence**: Neutralising the guard does make the test fail, but only because the stale call writes to the still-live Yusuf slot. It does not demonstrate the claimed scenario of a previous character painting into the later character's rendered sheet, nor does it gate the actual `renderSheet` wiring/container replacement required by AC9. The Dev Agent Record's “wired test” and “safe under desktop/mobile dual-container rendering” proof claims are overstated.
- **Confidence**: High. I reproduced the discrimination failure and traced both the fake DOM and real container assignments.

### [Pass 3b] The Dev Agent Record falsely claims the empty-merit-list branch has direct test coverage

- **Severity**: Medium
- **File:line**: `specs/stories/oxp-7-sheet-office-merits-section.md:290-293,306-308`; `public/js/editor/sheet.js:1836-1837`; `server/tests/oxp-7-sheet-office-merits-section.test.js:158-338`
- **Triggering input or sequence**: Inventory the six async-patch tests while comparing the completion claim that no category, unconfirmed seat, Administrator, failed fetch, and empty merit list are all covered. No test supplies or temporarily creates an `OFFICE_DATA` entry with `merits: []`.
- **Observable consequence**: The production guard exists, but a future deletion/inversion of `if (!meritNames.length) return` would leave all 18 tests green. The record enumerates five cases, calls them “all four paths,” and overstates the genuine coverage of the future-proofing branch required by AC3.
- **Confidence**: High; the full 18-test file was inventoried and run.

### [Pass 3a] The chosen async ownership violates AC4 and was never recorded in Dev Notes as AC1 requires

- **Severity**: Medium
- **File:line**: `specs/stories/oxp-7-sheet-office-merits-section.md:65-70,104-108,225-229`; `public/js/editor/sheet.js:43-48`; `public/js/suite/sheet.js:29-32`
- **Triggering input or sequence**: Audit the implemented module boundary against AC1's instruction to decide and document the home in Dev Notes and AC4's literal requirement that `public/js/suite/sheet.js` gain `apiGet`. The implementation instead imports `apiGet` in `editor/sheet.js`, while Dev Notes still say “either ... decide during dev” and never record the final decision.
- **Observable consequence**: The feature works, but two explicit delivery constraints are unmet: the specified data-flow owner is different and the required architectural decision record is absent. A future maintainer reading Dev Notes cannot tell whether putting network I/O into the otherwise shared editor renderer module was intentional or accidental.
- **Confidence**: High. The imports and the pre-record Dev Notes are unambiguous.

### [Pass 3a] AC3's literal empty-string contract and AC9's matching tests are implemented only as visual emptiness

- **Severity**: Medium
- **File:line**: `specs/stories/oxp-7-sheet-office-merits-section.md:91-99,160-168`; `public/js/editor/sheet.js:1785-1787,1814-1834`; `server/tests/oxp-7-sheet-office-merits-section.test.js:231-252`
- **Triggering input or sequence**: Give `shRenderOfficeMerits` a supported-category character whose holder cannot later be confirmed, whose fetch later fails, or whose `OFFICE_DATA` entry has an empty merits array. AC3 explicitly says these cases produce “`return ''` from the synchronous render,” and AC9 separately requires non-holder/unconfirmed direct-unit cases that render `''`.
- **Observable consequence**: The synchronous function actually returns `<div data-office-merits-char="..."></div>` and the async patcher merely leaves its `innerHTML` empty. The UI is correctly invisible and discloses nothing, but the literal return-value/DOM contract is not met; the new tests assert only that the reserved slot stays empty after patching, so they cannot demonstrate the specified `return ''` behavior for an unconfirmed holder.
- **Confidence**: High about the literal mismatch. The spec is internally awkward because AC7 also mandates reserving an async slot, but its parenthetical and test wording are explicit and were not amended to say “visually empty placeholder.”

### [Pass 1] Successful fetches can still become an unhandled promise rejection

- **Severity**: Medium
- **File:line**: `public/js/editor/sheet.js:1797-1813`; `public/js/suite/sheet.js:765`
- **Triggering input or sequence**: Both `apiGet` calls fulfil, the generation is current, and confirmed-seat resolution succeeds, but a later operation throws — for example, a non-array truthy `OFFICE_DATA[category].merits` reaches `.map`, `CSS.escape` is unavailable, or an unexpected value throws during string coercion/rendering. The only `try/catch` ends immediately after `Promise.all`, and `renderSheet()` calls `patchOfficeMerits(c)` without awaiting it or attaching a rejection handler.
- **Observable consequence**: The Office Merits placeholder remains empty and the page emits an unhandled promise rejection. Depending on the application's global rejection handling, this may generate noisy telemetry or disrupt unrelated error handling rather than degrading as quietly as the fetch-failure path does.
- **Confidence**: Medium. The control-flow hole is certain from the diff; whether any supported runtime or real data can trigger it must be checked against repository context in Pass 2.

## Low

### [Pass 3b] The three broader failures are causally unrelated, but their files do reference touched sheet files

- **Severity**: Low
- **File:line**: `server/tests/n7-n9-allocator-readers.test.js:169,181,229`; `server/tests/issue-836-legacy-tracker-cache-removed.test.js:102-165`; `server/tests/n8-mandragora-prereq.test.js:152-165`
- **Triggering input or sequence**: Grep and run the three files the record calls unrelated. Each source-reads `public/js/editor/sheet.js` and/or `public/js/suite/sheet.js`, although none names `resolveHeldSeat`, `shRenderOfficeMerits`, `patchOfficeMerits`, or the modified Office-tab function.
- **Observable consequence**: The requested stronger attestation that these tests do not “import, reference, or otherwise depend on anything this diff touches” cannot be made literally. Their observed failures are nevertheless unrelated: N7/N9 fails a bounded regex against `editor/merits.js`; #836 aborts on missing `suite/tracker.js`; N8 aborts with a syntax error before its sheet source checks execute. The record's causal conclusion is supported, but only with this narrower wording.
- **Confidence**: High; all three were read, grepped, and run independently.

### [Pass 3b] The literal spec refutes Pass 1's concern about distinguishing authentication and request failures

- **Severity**: Low
- **File:line**: `specs/stories/oxp-7-sheet-office-merits-section.md:91-99`; `public/js/editor/sheet.js:1821-1829`; `public/js/data/api.js:15-30`
- **Triggering input or sequence**: Any request-setup, network, malformed-JSON, non-2xx (including 401/403), or other thrown `apiGet` failure reaches the bare catch.
- **Observable consequence**: All such failures leave the placeholder visually empty. Pass 1 correctly identified the loss of diagnostic distinction, but AC3 literally requires the section to render nothing when either fetch fails and specifies no narrower exception, so this is deliberate product behaviour rather than a ship-blocking defect.
- **Confidence**: High after reading the acceptance criteria and `apiGet`.

### [Pass 3a] The generation counter is not bumped on every `renderSheet()` call as AC7 literally mandates

- **Severity**: Low
- **File:line**: `specs/stories/oxp-7-sheet-office-merits-section.md:139-146`; `public/js/suite/sheet.js:178-199,766`; `public/js/editor/sheet.js:1760,1814-1816`
- **Triggering input or sequence**: Start character A's Office Merits request, then invoke `renderSheet()` after `state.sheetChar` becomes null. The null-character branch clears the render containers and returns before calling `patchOfficeMerits`, which is where `_officeMeritsGen` is incremented.
- **Observable consequence**: This contradicts AC7's “counter bumped on every `renderSheet` call” wording. The current UI still avoids a visible stale paint because clearing the containers removes A's query target, but A's request is not logically invalidated and can run through all post-fetch work rather than being rejected by the mandated guard.
- **Confidence**: High about the branch and literal deviation; High that the current container clearing prevents a user-visible cross-character write in this specific sequence.

### [Pass 2] The multiple-live-placeholder documentation does not match either layout branch

- **Severity**: Low
- **File:line**: `public/js/editor/sheet.js:1794-1797`; `public/js/suite/sheet.js:747-759`
- **Triggering input or sequence**: Any `renderSheet()` call in desktop mode writes `powersHtml` only into `#sh-content-suite` and explicitly clears `#powers-content`; any mobile call clears `#sh-content-suite` and writes `powersHtml` only into `#powers-content`.
- **Observable consequence**: There is one Office Merits placeholder, not “more than one live in the DOM at once” as the new doc comment claims. `querySelectorAll` remains harmless defensive code, but the comment overstates the tested/runtime topology and could mislead a future maintainer evaluating whether the module-scoped generation model supports multiple simultaneous sheet mounts.
- **Confidence**: High. Both mutually exclusive assignment branches and all call sites were traced.

### [Pass 2] Current repository inputs do not substantiate Pass 1's post-fetch rejection concern

- **Severity**: Low
- **File:line**: `public/js/editor/sheet.js:1832-1850`; `public/js/tabs/office-data.js:6-95`; `public/js/editor/merits.js:38-89`
- **Triggering input or sequence**: Each current `OFFICE_DATA` category is rendered with the actual API response shapes from `GET /api/office_seats` and `GET /api/office_merit_dots` in a browser providing the already-used `CSS.escape` API.
- **Observable consequence**: No post-fetch operation receives a throwing value: all merit lists are arrays of strings, every cap exists, `shRenderMeritRow` explicitly accepts strings, malformed/non-array seat bodies return `null`, and JSON-safe dot bodies tolerate missing keys. Pass 1's control-flow observation remains true as a hardening concern, but I found no plausible current production input that turns it into an unhandled rejection.
- **Confidence**: High for current repository/API data; supported-browser policy was not independently documented, so absence of `CSS.escape` remains the only environment-dependent edge.

### [Pass 2] Repository context refutes Pass 1's office-tab category-divergence concern

- **Severity**: Low
- **File:line**: `public/js/tabs/office-tab.js:193-197,272,316-371`
- **Triggering input or sequence**: Every `renderOfficeTab` path computes `category = viewCategory || char.court_category || 'Head of State'`, immediately computes `isOwnOffice = category === char.court_category`, and passes those exact values unchanged into `_wirePurchaseState`.
- **Observable consequence**: There is no path where `isOwnOffice === true` and the two categories differ. On owner paths the old `forCategory.find(...)` and new `resolveHeldSeat(char, seats)` search the same category with the same holder comparison; on reference paths both set `held` to `null`. The Pass 1 blast-radius concern is therefore refuted, with no behaviour change found.
- **Confidence**: High.

### [Pass 2] Repository context refutes Pass 1's resolver-comment concern

- **Severity**: Low
- **File:line**: `public/js/data/office-seat-resolve.js:22-28`; `server/lib/office-seat-resolve.js:49-101`
- **Triggering input or sequence**: Compare the modules with Administrator/unknown-category data, missing input, and ordinary known seats.
- **Observable consequence**: The comment is materially accurate. The client helper filters already-fetched seats by a character's category and can return an Administrator/unknown-category held seat or `null` for non-array seats; the server helper validates a 24-hex URL seat id, queries MongoDB, returns structured 400/404 errors, and rejects a found Administrator/unknown-category seat because no `OFFICE_DATA` entry exists. No misleading parity was found.
- **Confidence**: High.

### [Pass 2] The five-dot fallback is dead for all current office content

- **Severity**: Low
- **File:line**: `public/js/editor/sheet.js:1840`; `public/js/tabs/office-data.js:6-95`
- **Triggering input or sequence**: Enumerate every merit in every current `OFFICE_DATA` entry and look it up in `MERIT_DOT_CAPS`.
- **Observable consequence**: All 13 listed occurrences have explicit caps (including the two three-dot exceptions), so no current office/merit combination invokes the fallback. Pass 1's finding is a future configuration-drift risk, not a present rendering defect; the existing Office tab and server write route also use the same fallback convention.
- **Confidence**: High; verified both by inspection and a Node enumeration script.

### [Pass 1] Every request failure is deliberately made indistinguishable from “no confirmed office”

- **Severity**: Low
- **File:line**: `public/js/editor/sheet.js:1786-1795`
- **Triggering input or sequence**: Either endpoint rejects for any reason: network loss, authentication/authorization failure, a non-success HTTP response, malformed JSON, or an exception thrown by request setup.
- **Observable consequence**: The user sees exactly the same empty placeholder as a character who does not hold a confirmed seat. There is no diagnostic, retry affordance, or logged distinction, so a system/authentication regression can silently remove valid Office Merits from sheets.
- **Confidence**: High that all thrown failures are swallowed; Low-to-medium that this violates the intended UX. The diff comment attributes the behaviour to AC3, so the breadth of that exception is explicitly worth checking against the literal spec in Pass 3.

### [Pass 1] Missing cap configuration silently changes into a five-dot rule

- **Severity**: Low
- **File:line**: `public/js/editor/sheet.js:1803`
- **Triggering input or sequence**: `OFFICE_DATA[category].merits` contains a merit name absent from `MERIT_DOT_CAPS` (or mapped to a falsy cap such as `0`).
- **Observable consequence**: The section renders that merit with an invented cap of five rather than exposing the configuration mismatch or omitting invalid content; purchased values above five are silently truncated and a legitimate zero cap would be ignored.
- **Confidence**: High about the fallback behaviour; unknown from the diff whether current `OFFICE_DATA` makes this branch live. Pass 2 must inventory the real configuration.

### [Pass 1] The office-tab refactor's category equivalence is asserted outside the visible evidence

- **Severity**: Low
- **File:line**: `public/js/tabs/office-tab.js:336-350`
- **Triggering input or sequence**: `_wirePurchaseState` is reached with `isOwnOffice === true` while its `category` argument differs from `char.court_category`. The old code searches the already-filtered `forCategory`; the new shared resolver searches the full seat list using `char.court_category`.
- **Observable consequence**: The existing Office tab can resolve a different held seat than before, changing which seat's merit state it displays or edits. This would affect the previously shipped consumer, not merely the new sheet section.
- **Confidence**: Low pending Pass 2. The scoped hunk does not show how `isOwnOffice` is computed, so the diff alone cannot validate its own claim that the values are always identical.

### [Pass 1] Client/server resolver distinction cannot be verified from the diff

- **Severity**: Low
- **File:line**: `public/js/data/office-seat-resolve.js:22-28`
- **Triggering input or sequence**: A maintainer relies on the new module comment's claim that the server resolver accepts a URL office parameter and produces a 400 for unknown offices while the client resolver accepts a character plus fetched seats and returns `null`.
- **Observable consequence**: If the server implementation does not behave as described, the comment becomes misleading design documentation and may encourage incorrect reuse or parity assumptions.
- **Confidence**: Low pending Pass 2; the server module is not present in the permitted Pass 1 material.

## Ship assessment

**Needs patches, but has no blocking runtime problem.** The holder-only behaviour, shared resolver, API shapes, dot rendering, and blast-radius regression gate all work, and the exact targeted gate is green at 75/75. Before calling the story fully complete, reconcile AC4/Dev Notes with the chosen module boundary, correct AC3/AC9's empty-string wording or implementation, and replace/supplement the AC7 test with a real `renderSheet` integration (plus add the missing empty-merit-list test). No High-severity issue was found.

## Validation notes

### Pass boundaries and files opened

- **Pass 1**: Opened only `specs/stories/code-review/oxp-7-sheet-office-merits-section-diff.txt`. I did not explore the repository, story, tracking file, or any imported file before freezing Pass 1 into this document.
- **Pass 2**: After Pass 1 was frozen, opened/searched only repository context (not the oxp.7 story): `public/js/data/office-seat-resolve.js`, `server/lib/office-seat-resolve.js`, `public/js/data/api.js`, `public/js/tabs/office-tab.js`, `public/js/editor/sheet.js`, `public/js/editor/merits.js`, `public/js/tabs/office-data.js`, `public/js/suite/sheet.js`, `public/js/data/loader.js`, `public/js/data/helpers.js`, `public/js/app.js`, `public/index.html`, `server/routes/office-seats.js`, `server/routes/office-merit-dots.js`, `server/routes/characters.js`, `server/schemas/office_seat.schema.js`, and the base/current diff for the five story source/test paths. The new test file was already present verbatim in the permitted Pass 1 diff. I did not open `specs/stories/oxp-7-sheet-office-merits-section.md` or `sprint-status.yaml`.
- **Pass 3a**: First used a heading-only search to locate story boundaries, then opened only lines 1-257 of `specs/stories/oxp-7-sheet-office-merits-section.md` (Story through Dev Notes/References). I stopped before line 258 (`## Dev Agent Record`) and froze Pass 3a before continuing.
- **Pass 3b**: Only after Pass 3a was frozen, opened line 258 through EOF of the story. Also opened `server/tests/n7-n9-allocator-readers.test.js`, `server/tests/issue-836-legacy-tracker-cache-removed.test.js`, and `server/tests/n8-mandragora-prereq.test.js`; exercised the two target test files and inspected their emitted failures. I did not read, run, or modify any sibling repository under `D:\Terra Mortis`.

### Commands run and real results

Pass 1:

- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/oxp-7-sheet-office-merits-section-diff.txt'` — exit 0; supplied diff read in full.

Pass 2 (parallel batches are listed as their individual shell commands):

- `rg -n "function _wirePurchaseState|_wirePurchaseState\(|isOwnOffice|function renderSheet|shRenderMeritRow|OFFICE_DATA|MERIT_DOT_CAPS" public/js/tabs/office-tab.js public/js/suite/sheet.js public/js/editor/sheet.js public/js/tabs/office-data.js` — exit 0.
- `Get-Content -Raw` on each of `public/js/data/office-seat-resolve.js`, `server/lib/office-seat-resolve.js`, and `public/js/data/api.js` — exit 0 for all.
- `$lines = Get-Content 'public/js/tabs/office-tab.js'; $lines[160..380]` and `$lines = Get-Content 'public/js/editor/sheet.js'; $lines[2910..2985]` — exit 0.
- `Get-Content -Raw 'public/js/tabs/office-data.js'` — exit 0 (run twice because the first combined output was truncated).
- `$lines = Get-Content 'public/js/suite/sheet.js'; $lines[150..785]` — exit 0 but combined tool output was truncated; repeated as `[150..350]`, `[351..550]`, and `[551..785]`, all exit 0.
- `rg --files server/routes | rg "office-(seats|merit-dots)\.js$"` — exit 0; found both routes.
- A parallel wrapper containing the `[551..785]` read, both route reads, and an overly-specific merit-helper `rg` returned wrapper exit 1; I repeated every item with `Promise.allSettled`. The repeated `Get-Content -Raw` calls for `server/routes/office-seats.js` and `server/routes/office-merit-dots.js` exited 0, as did `rg -n "meritBase|meritDotCount|meritLookup" public/js/editor/sheet.js`.
- `$lines = Get-Content 'public/js/editor/merits.js'; $lines[0..180]` — exit 0.
- `rg -n "resolveHeldSeat|patchOfficeMerits|shRenderOfficeMerits" public server --glob '!server/tests/oxp-7-sheet-office-merits-section.test.js'` — exit 0; exactly two resolver call sites and one patch call site found.
- `rg -n "state\.chars|/api/characters|sheetChar" public/js/suite public/js --glob '*.js'` — exit 0.
- Node enumeration of every `OFFICE_DATA` merit against `MERIT_DOT_CAPS` — exit 0; all four merit lists were arrays and every merit had an explicit cap.
- `Get-Content -Raw 'public/js/data/loader.js'` — exit 0.
- `rg -n "router\.get\('/?'|res\.json\(|serialize|serialise" server/routes/characters.js`, `rg -n "renderSheet\(|onSheetChar\(" public/js/app.js public/js/suite/sheet.js`, and selected `app.js`/`characters.js` line-range reads — exit 0.
- `rg -n "suiteRenderSheet|onSheetChar|openSheetChar" public/js/app.js` plus `app.js` ranges `[1138..1195]` and `[2228..2260]`, and `characters.js` ranges `[250..290]`/`[450..480]` — exit 0.
- From `server`, a Node `mongodb` JSON round-trip for ObjectId `64b7abdecf2160b649ab6085` — exit 0; parsed `_id` type was `string`.
- `rg` searches for `esc`, office schemas, desktop/mobile containers, and touched call sites — exit 0.
- `$lines = Get-Content 'public/js/data/helpers.js'; $lines[210..230]` and `Get-Content -Raw 'server/schemas/office_seat.schema.js'` — exit 0.
- `git diff --no-ext-diff a358d180 -- public/js/editor/sheet.js public/js/suite/sheet.js public/js/tabs/office-tab.js public/js/data/office-seat-resolve.js server/tests/oxp-7-sheet-office-merits-section.test.js` — exit 0 and matched the supplied tracked diff; Git also warned it could not access the user-level ignore file.

Pass 3a:

- `rg -n "^## " 'specs/stories/oxp-7-sheet-office-merits-section.md'` — exit 0; located Dev Agent Record at line 258 without reading its body.
- `$lines = Get-Content 'specs/stories/oxp-7-sheet-office-merits-section.md'; $lines[0..256]` — exit 0; only the permitted pre-record sections were read.

Pass 3b:

- `$lines = Get-Content 'specs/stories/oxp-7-sheet-office-merits-section.md'; $lines[257..($lines.Length - 1)]` — exit 0; author record read after the 3a freeze.
- From `server`, `npx vitest run tests/oxp-7-sheet-office-merits-section.test.js tests/issue-1141-office-tab-render.test.js` — first run exit 0: **2 files passed, 75/75 tests passed** (6.41 s); final post-restore run exit 0: **2 files passed, 75/75 tests passed** (6.17 s). No database skip occurred.
- From `server`, `npx vitest run tests/oxp-7-sheet-office-merits-section.test.js` — exit 0: **1 file, 18/18 tests passed**.
- `git status --short` — exit 0 but showed a heavily dirty pre-existing workspace (three tracked story source edits, story/tracking edits, and a very large set of unrelated untracked files); it also warned that the user-level Git ignore file was inaccessible. This prevents a truthful claim that the global worktree is clean.
- `Get-FileHash -Algorithm SHA256` and `git diff --no-ext-diff -- public/js/editor/sheet.js` before the first mutation — exit 0; baseline sheet hash `7EC1A9810F182FC8A3E21CFA931EA06B208060DB3347A52DD52A27010CCF01DA` captured and semantic diff matched the story.
- With only `if (gen !== _officeMeritsGen) return;` neutralised, `npx vitest run tests/oxp-7-sheet-office-merits-section.test.js -t "a late-resolving fetch from a PREVIOUS character never paints into a later render's slot"` — exit 1: exactly **1 failed, 17 skipped**; stale Yusuf slot received Office Merits. After restore, the same command exited 0: **1 passed, 17 skipped**.
- Byte/EOL inspections of `public/js/editor/sheet.js` after the patch-tool restore found one bare LF; a context probe located it at the restored guard. A mechanical UTF-8/no-BOM bare-LF-to-CRLF normalization restored the exact baseline hash. Follow-up byte check: 236,200 bytes, 3,236 CRLF, 0 bare LF, no BOM, trailing LF.
- With only `if (!seat) return;` neutralised, `npx vitest run tests/oxp-7-sheet-office-merits-section.test.js -t "AC3: leaves the placeholder empty for an unconfirmed match — never guesses"` — exit 1: exactly **1 failed, 17 skipped**, with `TypeError: Cannot read properties of null (reading '_id')` at `sheet.js:1835`. Restored and normalized; sheet hash again matched the baseline exactly. The final 75/75 gate re-proved green.
- `Get-FileHash` baseline for `public/js/tabs/office-tab.js` — exit 0; hash `62C33A7CFAE51BE54C0C3C3D53B159151DC0682DFD6A606B58514F27B05F7B06`.
- With only the shared `held` computation replaced by `const held = null`, `npx vitest run tests/issue-1141-office-tab-render.test.js` — exit 1: **6 failed, 51 passed (57 total)**, exactly as claimed. Restored and normalized; Office-tab hash matched the baseline exactly. The final 75/75 gate re-proved green.
- `Get-Content -Raw` on each of `server/tests/n7-n9-allocator-readers.test.js`, `server/tests/issue-836-legacy-tracker-cache-removed.test.js`, and `server/tests/n8-mandragora-prereq.test.js` — exit 0.
- `rg -n -i "office-seat-resolve|resolveHeldSeat|patchOfficeMerits|shRenderOfficeMerits|office-tab|editor/sheet|suite/sheet|office_merit|office_seat"` across those three tests — exit 0; no new Office Merits symbol was referenced, but all three source-read a touched sheet file.
- Independent runs: `npx vitest run tests/n7-n9-allocator-readers.test.js` — exit 1, **1 failed/24 passed**, failure against `editor/merits.js` (#1115); `npx vitest run tests/issue-836-legacy-tracker-cache-removed.test.js` — exit 1, **suite failure/0 tests** due ENOENT `public/js/suite/tracker.js`; `npx vitest run tests/n8-mandragora-prereq.test.js` — exit 1, **suite failure/0 tests** due `SyntaxError: Invalid or unexpected token`.
- Final `rg` line-location searches for generation-test claims, empty-merit coverage, real container writes, and localStorage cleanup — exit 0.
- Final `Get-Content -Raw 'specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md'` — exit 0; the complete frozen-pass document was re-read for structure and attestation.
- Final scoped `git status --short -- public/js/editor/sheet.js public/js/suite/sheet.js public/js/tabs/office-tab.js public/js/data/office-seat-resolve.js server/tests/oxp-7-sheet-office-merits-section.test.js specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md` — exit 0; showed only the pre-existing story changes/new files plus this findings file, with the same inaccessible-user-ignore warning.
- Final combined `Get-FileHash -Algorithm SHA256` for `public/js/editor/sheet.js` and `public/js/tabs/office-tab.js` — exit 0; hashes remained exactly `7EC1A9810F182FC8A3E21CFA931EA06B208060DB3347A52DD52A27010CCF01DA` and `62C33A7CFAE51BE54C0C3C3D53B159151DC0682DFD6A606B58514F27B05F7B06`.

All Vitest runs emitted the same non-failing Vitest 4 deprecation warning that `test.poolOptions` was removed.

### Could not run / restoration attestation

- Nothing required by this review was blocked by missing MongoDB; the two target suites are DB-free and ran without skips.
- I did not repeat the author's historical `git stash` experiment, as the instructions explicitly said it was unnecessary. Therefore I independently confirmed the three current failure loci are unrelated, but did not independently prove their presence at base commit/unmodified-tree time.
- I did not run the entire 18-file broader sweep because the task required the exact targeted gate plus independent checks of its three reported failures; those three files were run separately and reproduced.
- I authored only this findings file. I temporarily changed one line at a time in `public/js/editor/sheet.js` (twice) and `public/js/tabs/office-tab.js` (once). Every change was restored; patch-induced lone-LF changes were also repaired. Final SHA-256 values exactly equal the pre-mutation values for both source files, and the final targeted gate is 75/75 green.
- The repository was already heavily dirty, so `git status --short` is not globally clean and I do not claim otherwise. No pre-existing file or unrelated untracked asset was removed or altered. The only intended lasting review change is `specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md`.
