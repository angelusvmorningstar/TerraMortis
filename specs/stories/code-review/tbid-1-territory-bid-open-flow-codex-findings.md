# TBID.1 adversarial review findings

## High

- None found.

## Medium

### [Pass 1] Regent option values are not proven safe for quoted HTML attributes

- **Severity**: Medium
- **File:line**: `public/js/suite/territory.js:119-130` (new-file line range inferred from the diff)
- **Triggering input or sequence**: A free-text/default/prior-winner Regent name containing a double quote reaches `regentOpts(sel)`, which interpolates `esc(sel)` into `value="..."`. The diff's test harness says its `escapeText` implementation precisely models `esc()` and escapes only `&`, `<`, and `>`; the actual unchanged `esc()` body is not included in the permitted Pass 1 diff, so its exact behaviour is worth checking in Pass 2.
- **Observable consequence**: If the real helper likewise leaves `"` untouched, the browser parses part of an ST-authored character name as option attributes. The selected value is corrupted and attacker-chosen attributes can be injected into the option. The same pattern already exists in `nameOpts`, but this change adds another live path for default/prior Regent names.
- **Confidence**: Medium pending the real `esc()` implementation and upstream character-name validation, neither of which Pass 1 permits reading.

### [Pass 2] Confirming a catalogue Regent can leave the card's Regent select visibly blank

- **Severity**: Medium
- **File:line**: `public/js/suite/territory.js:117-132`, `public/js/suite/territory.js:427-432`
- **Triggering input or sequence**: Open The Academy, The Dockyards, or The Second City and accept its default Regent while that catalogue-only name is absent from `window._charNames` (the real browser test fixture itself models this for Jack Fallow, René St. Dominique, and René Meyer). `regentOpts()` carries the extra name through the confirmation modal, but the subsequently rendered card uses only `nameOpts()`.
- **Observable consequence**: State and the card tag say, for example, `Regent: Jack Fallow`, while the adjacent Regent `<select>` has no `Jack Fallow` option and therefore displays its first `— none —` option. Three of the five ordinary default-confirm flows present contradictory controls immediately after success, inviting the ST to believe no Regent was retained even though defence scoring still uses the hidden stored name.
- **Confidence**: High.

### [Pass 2] Quoted character names are truncated by the browser in every affected option value

- **Severity**: Medium
- **File:line**: `public/js/suite/territory.js:111-132`; `server/schemas/character.schema.js:46-57`
- **Triggering input or sequence**: A valid character such as `Jane "JJ" Doe` is loaded into `_charNames`, selected as a Regent or previous winning Regent, and interpolated into `<option value="${esc(name)}">`. The real `esc()` uses a div's `textContent`/`innerHTML`, which escapes text markup but not double quotes; the character schema permits every non-empty string and has no quote restriction.
- **Observable consequence**: Chromium parses the example as value `Jane ` plus stray `jj"` and `doe"` attributes; submitting the option persists `Jane` rather than the actual character name. This breaks Regent identity/automatic-defence matching for valid ST-authored names and creates an attribute-injection surface. A direct headless-Chromium probe reproduced the parsed attributes and truncated value.
- **Confidence**: High.

### [Pass 3b] The claimed NPC-prefill fix stops at the modal and leaves the resulting card inconsistent

- **Severity**: Medium
- **File:line**: `specs/stories/tbid-1-territory-bid-open-flow.md:335-340`; `public/js/suite/territory.js:128-132`, `public/js/suite/territory.js:427-432`
- **Triggering input or sequence**: In a real browser with the same four-name fixture used by the committed tests, open The Academy and accept its pre-filled `Jack Fallow` Regent.
- **Observable consequence**: Completion Note 4 correctly says `regentOpts()` prevents the confirmation modal from falling back to `(none)`, but it overstates the fix as complete. Immediately after confirmation, the tag reads `Regent: Jack Fallow` while `.regent-sel.value` is empty and its options contain only `— none —` plus `_charNames`. A focused Playwright probe reproduced this exact result. The same ordinary flow affects three catalogue NPC Regents.
- **Confidence**: High.

### [Pass 3b] The screenshot driver captures an app that is still booting, so the visual-verification claim is overstated

- **Severity**: Medium
- **File:line**: `tests/tbid-1-territory-bid-open-flow.spec.js:21-25`, `tests/tbid-1-territory-bid-open-flow.spec.js:34-69`; `public/index.html:34-43`; `specs/stories/tbid-1-territory-bid-open-flow.md:303-306`, `specs/stories/tbid-1-territory-bid-open-flow.md:353-360`
- **Triggering input or sequence**: Set `TBID_SHOT_DIR` and run the committed Playwright spec exactly as the record instructs.
- **Observable consequence**: All 14 screenshots are real files, but the helper waits only for `_mountTerr` to be defined, tries to hide nonexistent `#auth-gate`, and never hides the real `#login-screen`. The captured full-board images visibly retain the large Terra Mortis `Loading…` screen and keep the Stats nav highlighted; `04-card-added.png` and `10-grandfathered-board.png` do not even show their named cards in the viewport. This does not invalidate the passing DOM assertions or the two-theme computed-colour assertions, but it does invalidate the record's claim that these screenshots demonstrate the surfaces rendering correctly in the actual completed app state and introduces a race with the still-running app bootstrap.
- **Confidence**: High; reproduced twice through the committed five-test driver, once with 14 screenshots captured and visually inspected.

## Low

### [Pass 1] Regent confirmation ignores the modal mode and can silently clear an active contest

- **Severity**: Low
- **File:line**: `public/js/suite/territory.js:198-216`
- **Triggering input or sequence**: `terrConfirmRegent(tid, name)` is called for a `tid` already present in `state.territories`, even if the current Regent modal was opened with `mode: 'open'` (or if the exported handler is called directly). The function chooses the reopen branch solely from array membership.
- **Observable consequence**: The existing entry is replaced in place with empty `bids`, `resolved: false`, and `winnerId: null`, with no warning that a live contest was discarded. The current UI constructors appear to keep `mode` and membership aligned, so this is primarily an exposed-handler/invariant-hardening defect rather than a demonstrated ordinary-click path.
- **Confidence**: High for the behaviour; medium that it is user-reachable without console/future code.

### [Pass 1] Version detection accepts every non-null schema marker as current

- **Severity**: Low
- **File:line**: `public/js/suite/territory.js:59-72`
- **Triggering input or sequence**: Load a syntactically valid payload such as `{ "schemaVersion": 0, "territories": [...] }`, `{ "schemaVersion": false, "territories": [...] }`, or a future-version payload whose territory shape is incompatible.
- **Observable consequence**: `s.schemaVersion != null` treats the payload as “Already on the current model” and merges it into defaults without validation or migration. This contradicts the nearby current-model comment and can retain malformed or forward-incompatible state instead of degrading to `dflt()`. A non-array `territories` value and invalid JSON do fall through to `dflt()` as intended.
- **Confidence**: High.

### [Pass 1] Invalid exported actions fail silently, and the tests normalize that contract

- **Severity**: Low
- **File:line**: `public/js/suite/territory.js:185-216`; `server/tests/tbid-1-territory-bid-open-flow.test.js:250-265`
- **Triggering input or sequence**: Call `terrPickTerritory` for an already-open/unknown id, `terrReopen` for an absent id, or `terrConfirmRegent` for an unknown id or blank name. These handlers are assigned to `window`, not private to the inline UI.
- **Observable consequence**: Nothing changes and no error is rendered. The ordinary picker/reopen controls appear to supply valid ids, but other callers and stale/custom calls get no diagnostic. The new duplicate-pick test explicitly expects the silent stay-on-step-1 result, so it would not catch a missing user-facing explanation.
- **Confidence**: High for direct calls; low-to-medium for an ordinary UI sequence until surrounding code is inspected.

### [Pass 1] Several static checks claim a broader guarantee than they establish

- **Severity**: Low
- **File:line**: `server/tests/tbid-1-territory-bid-open-flow.test.js:599-655`; `tests/tbid-1-territory-bid-open-flow.spec.js:18-23`
- **Triggering input or sequence**: Run the suites with their default environment and later introduce a multiline `#t-territory` declaration whose `var(...)`, hex, or `rgba(...)` value is on a continuation line; or leave `SHOTS` unset.
- **Observable consequence**: The token check only keeps lines containing the literal selector, so it can miss values on continuation lines while reporting that “every #t-territory value” resolves. The “whole repo-facing surface” phantom-token check reads only two files. The Playwright `shot()` helper silently skips every screenshot when `TBID_SHOT_DIR` is unset, so a green browser run alone does not prove screenshots were captured or inspected.
- **Confidence**: High.

### [Pass 2] Shared form classes materially change the existing modal typography and spacing

- **Severity**: Low
- **File:line**: `public/css/components.css:40-44`; `public/css/suite.css:574-586`; `public/index.html:19-22`
- **Triggering input or sequence**: Open any claimant, seconder, backing, or new Regent modal after the inline `selStyle` is replaced by `class="form-select"` / `class="form-input"`.
- **Observable consequence**: This is not a like-for-like CSS extraction. Existing selects change from `var(--fh)` (Cinzel), `12px`, `6px 8px`, and `var(--txt2)` to `var(--ft)` (Libre Baskerville), `14px`, `8px 12px`, and `var(--txt)`. The stylesheets load `components.css` before `suite.css`; the new high-specificity territory rule wins only for `width`, so those component declarations genuinely render. The number input is instead mostly restyled by the pre-existing, more-specific `#t-territory .field input` rule. Whether the select redesign is desirable is worth checking against intent, but it is a real visual change beyond merely removing inline styles.
- **Confidence**: High on the computed cascade; medium on whether the visual change is unacceptable without the spec.

### [Pass 2] The stand-in DOM preserves broken option markup instead of exercising browser parsing

- **Severity**: Low
- **File:line**: `server/tests/tbid-1-territory-bid-open-flow.test.js:47-75`, `server/tests/tbid-1-territory-bid-open-flow.test.js:319-324`
- **Triggering input or sequence**: Add a quote-containing name to `CHAR_NAMES` or use it as a prior winner, then assert only against the fake root's stored `innerHTML` string.
- **Observable consequence**: The fake root never parses assigned HTML, so an assertion can see the full source spelling while a browser has already truncated the option's `.value` and split the remainder into attributes. The harness accurately models `esc()` itself, but under-models the consumer that makes this bug observable. The Playwright fixture uses only quote-free names, so the real-browser suite does not close the gap.
- **Confidence**: High.

### [Pass 3a] The new UI is not literally built entirely from theme tokens as AC12 and the Dev Notes require

- **Severity**: Low
- **File:line**: `specs/stories/tbid-1-territory-bid-open-flow.md:150-160`, `specs/stories/tbid-1-territory-bid-open-flow.md:247-252`; `public/css/suite.css:551-572`
- **Triggering input or sequence**: Audit the newly introduced empty-board, resolved-row, and picker declarations against AC12's literal “built entirely from existing theme.css tokens” wording and the Dev Notes' requirement that every added colour/font/spacing value be a `var(--token)`.
- **Observable consequence**: The new rules contain raw spacing and font values such as `28px`, `16px`, `10px`, `8px`, `4px`, `3px`, `2px`, `0.75rem`, `0.8125rem`, and `0.875rem`. The UI renders, and all colour variables appear valid, but the implementation and its test reduce the written token-only rule to “no unknown colour token / no hex / no rgba.” This is partly a specification contradiction: `theme.css` explicitly says this app has no spacing scale, and AC11 itself prescribes raw pixel values, so literal compliance is impossible without changing the agreed examples or adding tokens.
- **Confidence**: High on the literal mismatch; medium on intended enforcement because the spec contradicts itself.

### [Pass 3b] The changed-area regression count labels skipped tests as passed

- **Severity**: Low
- **File:line**: `specs/stories/tbid-1-territory-bid-open-flow.md:291-302`
- **Triggering input or sequence**: Run the seven named changed-area Vitest files together on current HEAD.
- **Observable consequence**: Vitest reports `205 passed | 29 skipped | 3 failed (237)`, not “234 pass, 3 failures.” The three failures are indeed pre-existing: evaluating their exact predicates against base commit `34759457...` and current HEAD produced the same failure inputs (10 fallback sites versus the asserted 11, and the same two `0.625rem` rules rejected by literal `10px`/`11px` regexes). The regression conclusion is sound, but the exact pass count in the record is false because it counts 29 skipped cases as passes.
- **Confidence**: High.

## Pass 1 freeze note

Pass 1 was formed from `specs/stories/code-review/tbid-1-territory-bid-open-flow-diff.txt` only. The supplied diff did not contain the unchanged body of `esc()`, so that part is explicitly provisional. No story/spec, source file, stylesheet, configuration, tracking file, or author record was opened before this freeze.

## Pass 2 freeze note

The ordinary click sequence is internally consistent: picker selection does not mutate the array; confirmation appends once; the first different claimant causes the Regent defence bid to be appended; resolve mutates the same entry; reopen reads the winner; and confirmation uses `.map()` to clear that same entry without reordering it. The `renderRegentStep()` catalogue/state fallback is reachable for a structurally valid persisted non-catalogue territory, because `load()` admits arbitrary array entries, so it is not strictly dead code. `terrResetAll`/`terrUnres` have no remaining runtime callers in `public`, `tests`, or `server` outside the intentional undefined-handler assertion. `_charNames` is assigned after character loading and before the app is revealed, so no normal mount-order race was found. The `width:100%` territory selector has higher specificity than the shared classes and suite.css loads later, so its width wins reliably. These Pass 2 conclusions were frozen before opening the story spec.

## Pass 3a freeze note

Pass 3a read only lines 12-282 of the story: Story, rationale/locked decisions, Acceptance Criteria, “What this story is NOT,” Tasks/Subtasks, Dev Notes, Project Structure Notes, and References. It stopped before the `## Dev Agent Record` heading at line 283. Aside from the token-language mismatch above, the changed code matches the literal functional ACs: empty start, unconditional opener, disabled in-contest tiles, confirm-before-add, populated-save migration, versioned persistence, resolved collapse, reopen-in-place by array position, confirm-gated wipe, inline-style removal, and no DB/API or scoring change. The Pass 2 catalogue-Regent select defect also conflicts with the locked intent that the unchanged in-card select remain a usable post-open override, but its original Pass 2 finding remains unchanged rather than being duplicated here.

## Pass 3b conclusion

**Ship assessment: needs patches before shipping.** The core state transition works and both required gates pass, but the catalogue-only Regent select and quoted-name truncation are real standard-flow/data-integrity defects. The Playwright helper should also wait for or explicitly establish a completed app state before its screenshots can support the visual claims. There is no blocking cross-app/server blast radius, and no High-severity finding.

## Validation notes

### Files opened and blinding attestation

- **Pass 1:** Opened only `specs/stories/code-review/tbid-1-territory-bid-open-flow-diff.txt`. The first raw read was tool-truncated, so the same file was re-read in four bounded line ranges. I checked only whether the requested findings path existed, then created it. I did not open the story, source files, stylesheets, project context, tracking files, or author record before freezing Pass 1.
- **Pass 2:** Opened `public/js/suite/territory.js`, `public/js/app.js`, `public/css/components.css`, `public/css/suite.css`, `public/css/theme.css`, `public/index.html`, `server/schemas/character.schema.js`, `server/routes/characters.js`, `server/tests/tbid-1-territory-bid-open-flow.test.js`, and `tests/tbid-1-territory-bid-open-flow.spec.js`. Repo-wide searches explicitly excluded the target story, supplied diff, and findings file until Pass 3; one broad search returned a very large, truncated set of matching lines from other repo files, but did not search the excluded target story. I did not open the target story or its Dev Agent Record before freezing Pass 2.
- **Pass 3a:** Opened the heading map and then exactly lines 12-282 of `specs/stories/tbid-1-territory-bid-open-flow.md`, stopping before `## Dev Agent Record` at line 283. Also re-queried the relevant `theme.css` token declarations. Pass 3a was written before opening line 283 onward.
- **Pass 3b:** Opened story lines 283-end, the relevant broader-regression test predicates, base-commit/current CSS through a read-only `git show` comparison, and the 14 temporary screenshots listed below. Also queried `public/index.html` for the actual boot/app element ids. No file outside `D:\Terra Mortis\TM Game` was read.

### Commands and real results

1. `Get-Content -Raw ...tbid-1-territory-bid-open-flow-diff.txt` — succeeded, but the tool truncated the 1,379-line output; four `Get-Content` slice commands (`0..359`, `360..719`, `720..1079`, `1080..end`) then succeeded and completed the Pass 1 read.
2. `Test-Path ...tbid-1-territory-bid-open-flow-codex-findings.md` — `False` before the requested report was created.
3. Pass 2 broad `rg` for `terrResetAll|terrUnres|_charNames|function esc|const esc|components.css|suite.css|territory.js`, excluding the target story/diff/findings — completed with 5,036 output lines and was tool-truncated. A later parallel four-command batch returned exit 1 without individual output because one no-match `rg` propagated failure; each relevant query was rerun separately.
4. Two numbered `Get-Content` commands read `public/js/suite/territory.js` lines 1-330 and 331-end — succeeded.
5. `rg`/numbered `Get-Content` queries over `public/js/app.js` for `_charNames`, `mountTerr`, `goTab`, and boot order — succeeded; `_charNames` is assigned at lines 861/900 after data load, and normal app reveal occurs afterward.
6. `rg -n "terrResetAll|terrUnres" public tests server ...` — no runtime callers; the only intentional target-suite occurrence is the assertion that `window.terrResetAll` is undefined. A hidden repo-wide filename grep (excluding the target story/diff/findings) also found only that test plus non-runtime tracking/code-review artifacts.
7. `rg`/`Get-Content` over `.form-select`/`.form-input`, the territory CSS block, stylesheet order, font tokens, and `box-sizing` — succeeded. One initial `rg -n "--f[hlt]:"` failed because the pattern was parsed as a flag; rerunning with `rg -n -- "--f[hlt]:"` succeeded.
8. `rg`/`Get-Content` over the character schema and character route — succeeded; `name` is any string with `minLength: 1`, with no quote restriction.
9. Headless-Chromium option-parser probe (`@' ... '@ | node`) — succeeded. `Jane "JJ" Doe` parsed to value `Jane ` plus stray `jj"`/`doe"` attributes.
10. Targeted reads of the real Vitest harness and Playwright spec — succeeded and confirmed the fake root stores unparsed markup and the browser fixture contains only quote-free names.
11. Story heading query, then numbered reads of lines 12-179 and 180-282 — succeeded; no Dev Agent Record content was read before the Pass 3a freeze.
12. `rg` for spacing/radius/font/control tokens in `theme.css` — succeeded and confirmed its explicit “No `--space-*` scale exists” note.
13. Numbered read of story lines 283-end — succeeded after the Pass 3a freeze.
14. `cd server && npx vitest run tests/tbid-1-territory-bid-open-flow.test.js` — **1 file passed; 48 passed (48); exit 0**.
15. `npx playwright test tests/tbid-1-territory-bid-open-flow.spec.js` — **5 passed (5); exit 0**. Chromium was already installed; no port-8080 conflict occurred.
16. `rg --files server/tests | rg "(seven named changed-area suites)"` — found all seven named files.
17. The seven-file `npx vitest run ...` changed-area command — **2 files failed, 5 passed; 205 tests passed, 29 skipped, 3 failed (237); exit 1**. It completed in 36.11s and did not wedge.
18. Targeted reads of `gdx-4-css-standards-grep.test.js:421-434` and `issue-830-inherited-card-css.test.js:29-51` — succeeded.
19. Read-only Node/`git show 34759457...` predicate comparison — succeeded. Base and current both had 10 matching fallback sites and the identical two `0.625rem` component rules, so all three failures are pre-existing even though the record's pass count is wrong. An initial comparison accidentally inspected the similarly named `suite.css` selectors for the #830 rules; the corrected command inspected `components.css` and produced the result above.
20. Parallel verification: runtime-caller grep — none; inline-`style` grep in `territory.js` — none; token audit — 33 used tokens, zero missing; focused empty-Regent Vitest — **1 passed, 47 skipped (48)**.
21. Screenshot-artifact search — no recorded TBID screenshots in the repo.
22. `New-Item ...tbid-1-codex-shots-temp` — created a temporary in-repo directory. With `TBID_SHOT_DIR` set to it, the committed Playwright spec reran **5/5 passed** and produced 14 PNGs: `01` through `12`, including dark/light variants. `Get-ChildItem` confirmed all 14 non-empty files; all 14 were opened with the image viewer and inspected.
23. A temporary `tests/tbid-1-codex-probe.spec.js` was created with the patch tool, run once, and deleted with the patch tool. `npx playwright test tests/tbid-1-codex-probe.spec.js` — **1 passed** and printed: catalogue tag `Regent: Jack Fallow` with card select value `""`; quoted option value `Jane ` before submit; final tag `Regent: Jane` and blank card select after submit.
24. `Resolve-Path` verified the screenshot temp directory as exactly `D:\Terra Mortis\TM Game\specs\stories\code-review\tbid-1-codex-shots-temp`. Native `Remove-Item -Recurse` was rejected by tool policy; `[System.IO.Directory]::Delete(<that exact verified path>, $true)` then succeeded. These were generated, disposable screenshots and are not recoverable from the workspace, but can be recreated by the documented Playwright command.
25. `git diff --name-only 34759457... HEAD` — listed only the two production files, two new test files, story, and sprint-status file; no DB route. Territory network-call grep returned `NO_NETWORK_CALLS`. `git diff --check` succeeded.
26. One PowerShell-quoted `rg` for `auth-gate|login-screen|app` failed because the shell interpreted the alternation; the single-quoted retry succeeded and showed `#login-screen` and `#app`, with no `#auth-gate`.
27. Final cleanup checks: `Test-Path` for the temporary probe and screenshot directory returned `False`; `git status --short` showed no modified tracked source and no temporary probe/screenshots. It showed the intended new findings file plus pre-existing/unrelated untracked review artifacts (`...-diff.txt`, `...-codex-review.md`, `...-codex-run.log`) that I did not modify. Git also warned that the user-level ignore file was unreadable; this did not affect the scoped status output.

### Could not run

- Nothing required was skipped. Both mandated gates, the seven-file changed-area regression set, screenshot capture, computed-style checks, and focused browser probes ran. I did not run the known-wedging `tests/suite.spec.js`, because neither the story record nor the requested exact gates relies on it.

### Workspace integrity

I modified no production, test, story, tracking, or configuration file. The only lasting change is this requested findings report. The temporary probe spec and 14 generated screenshots were removed after use, and final path/status checks confirmed their removal. `git status --short` is clean of unintended changes; the other untracked review artifacts shown by Git were present in the workspace and were not touched by this review.
