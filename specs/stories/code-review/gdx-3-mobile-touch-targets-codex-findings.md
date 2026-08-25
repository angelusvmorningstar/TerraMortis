# Adversarial review — gdx-3-mobile-touch-targets

## High

- None found in Pass 1.

### [Pass 2] Collapsed desktop-sidebar tiles are clipped to a measured 39×39px target while the added test reports 44×44

- **Severity**: High
- **File:line**: `public/css/suite.css:1800`, `public/css/suite.css:1808`, `public/css/suite.css:1887`, `public/css/suite.css:2869`; `tests/desktop-and-css.spec.js:1309`
- **Triggering input or sequence**: Enter desktop mode, collapse the sidebar (the live `_initSidebarCollapse` / `toggleSidebarCollapse` path adds `body.sidebar-collapsed`), then tap 21px above or below the centre of a `.sidebar-app-tile`. The collapsed 56px sidebar minus its grid padding produces a 39px tile in Chromium, and the tile's own `overflow:hidden` clips its 44px `::after` overlay.
- **Observable consequence**: A player or ST using the collapsed desktop sidebar gets only a 39×39px clickable tile. A temporary Playwright probe measured `boxW:39`, `boxH:39`, computed pseudo size `44px` by `44px`, and both top and bottom target-edge points missed. The shipped sidebar test still passes because it neither enables `sidebar-collapsed` nor calls `elementFromPoint`.
- **Confidence**: Very high; reproduced in Chromium against the current CSS and live body/sidebar class chain.

### [Pass 2] Wrapped `.rank-pill` overlays overlap and route the upper pill's edge tap to the pill below

- **Severity**: High
- **File:line**: `public/css/suite.css:2168`, `public/css/suite.css:2169`, `public/css/suite.css:2781`, `public/css/suite.css:2858`; `public/js/tabs/status-ranking.js:172`; `tests/desktop-and-css.spec.js:1066`
- **Triggering input or sequence**: At 360px, render the real five clan names (`Daeva`, `Gangrel`, `Mekhet`, `Nosferatu`, `Ventrue`) in the real `.status-ranking-section > .rank-org-section > .rank-pills` chain. The flex row wraps after the third pill; each visible pill is 24px high on a 30px row pitch, while each T2 overlay is 44px high.
- **Observable consequence**: The expanded zones overlap across rows. A temporary Chromium probe measured overlaps between pill indices `[0,3]` and `[1,4]`; the point 21px below the first pill's centre resolved to another `.rank-pill`, not the first one. On the ST ranking surface, a tap intended for one clan can select a different clan. The shipped fixture contains only three short pills on one row, so its `elementFromPoint` sweep cannot expose the wrap branch.
- **Confidence**: Very high; reproduced with the actual dynamic label set, stylesheet hierarchy, viewport, and hit testing.

### [Pass 3a] The wrapped ranking pills are a literal AC2 failure, not an allowable exception

- **Severity**: High
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:173`; `public/css/suite.css:2168`, `public/css/suite.css:2858`
- **Triggering input or sequence**: Use the five-clan ranking pill set at 360px, which wraps onto two rows and produces the reproduced `[0,3]` and `[1,4]` overlay intersections.
- **Observable consequence**: AC2 says no two in-scope hit areas overlap and permits a smaller, documented midpoint expansion only when 44px cannot fit. The implementation instead leaves silent overlaps and claims the full 44px result, so selecting the wrong clan is both a functional defect and a direct acceptance-criteria breach.
- **Confidence**: Very high.

### [Pass 3a] `.pref-dot` violates AC3's literal desktop bounding-box identity requirement

- **Severity**: High
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:179`; `public/css/components.css:6115`
- **Triggering input or sequence**: At any viewport of 600px or wider, compare `.pref-dot.getBoundingClientRect()` before and after the story. The rule changes its own width and height from 38px to `var(--tap-min)` (44px); negative margins preserve pitch/layout but cannot preserve the element's rectangle.
- **Observable consequence**: AC3 says every in-scope element's `getBoundingClientRect()` is identical before and after at desktop widths, with no stated `.pref-dot` exception. The element becomes 6px wider and taller, so the completed change fails AC3 even if its glyph and surrounding row remain visually aligned.
- **Confidence**: Very high from the base diff, current CSS, and AC's literal wording.

### [Pass 2] The global `.cs-step-btn` overlay makes real office up/down controls overlap by 12px

- **Severity**: High
- **File:line**: `public/css/suite.css:2853`; `public/js/tabs/office-tab.js:168`; `public/js/tabs/office-tab.js:540`; `tests/desktop-and-css.spec.js:1058`
- **Triggering input or sequence**: As an ST in the game app, open an Office manoeuvre-rank or merit row and tap near the facing edge of its adjacent ▲/▼ buttons. Those production steppers render two 26px `.cs-step-btn` siblings with a 6px gap (32px centre pitch), while the new rule centres a 44px overlay on each.
- **Observable consequence**: The two 44px zones overlap by 12px. Chromium measurement returned a 32px centre pitch and `elementFromPoint` in the overlap resolved to the later `down` button, so part of the apparent/intended increment target decrements instead. The new test does not catch this because its invented `.cs-step-row` puts a value between the buttons and queries only the first button.
- **Confidence**: High. Confirmed in Chromium using the shipped CSS and the exact production office stepper classes; the temporary probe was removed after the run.

### [Pass 3a] The office stepper overlap is a literal AC2 failure with no documented exception

- **Severity**: High
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:173`; `public/css/suite.css:2853`; `public/js/tabs/office-tab.js:168`
- **Triggering input or sequence**: Use either adjacent Office ▲/▼ `.cs-step-btn` pair after the story expands both 26px boxes to claimed 44px overlays.
- **Observable consequence**: AC2 says no two in-scope hit areas overlap and permits a smaller target only if it stops at the gap midpoint and is recorded as an exception. The shipped 12px overlap is silent, and tapping its shared region selects the later decrement control. `.cs-step-btn` is explicitly in the in-scope inventory, so the ST-only nature of the affected Office controls does not remove this selector from the AC.
- **Confidence**: High; the geometry and hit winner were measured in Chromium, and the AC wording is unqualified for inventory selectors.

### [Pass 3b] The claimed green gate is reproducibly red at 34 passed / 13 failed

- **Severity**: High
- **File:line**: `tests/desktop-and-css.spec.js:1355`; `tests/desktop-and-css.spec.js:1375`; `specs/stories/gdx-3-mobile-touch-targets.md:686`
- **Triggering input or sequence**: Run `npx playwright test tests/desktop-and-css.spec.js` on the current tree (performed twice, sequentially, after confirming port 8080 was free), or run the six gdx-3 tests with `-g "gdx-3"`.
- **Observable consequence**: Both full runs finished **34 passed / 13 failed** (10.1m and 10.0m), not the recorded 35/12. The targeted suite repeatedly finished **5 passed / 1 failed**, not 6/6. The new failure is `css-audit — the T1/T2 fixes did not grow the visible box on desktop`: Chromium measures `.edit-tab` at 29px while the test hard-codes 30px. The other 12 full-run failure names match the documented baseline, so this story adds one regression to the gate and its “zero regressions” claim is false.
- **Confidence**: High. Reproduced in two full runs and two restored targeted runs, with no competing Playwright process and a free port before each invocation.

## Medium

### [Pass 1] An unrelated selector rewrite removes the downtime radio/checkbox text-colour rule

- **Severity**: Medium
- **File:line**: `public/css/suite.css:1702`
- **Triggering input or sequence**: Render any downtime quick-form radio label, or a checkbox label under the normal single `#t-downtime` container. The diff removes the grouped `.qf-radio-label, .qf-checkbox-label` rule and replaces it with `#t-downtime #t-downtime .qf-checkbox-label`.
- **Observable consequence**: The radio label no longer receives this scoped `color: var(--txt)` declaration at all. The checkbox declaration now requires one `#t-downtime` beneath another identically-ID'd ancestor, so it does not match the normal DOM either. Both controls can inherit a different colour, creating an unrelated visible regression outside the touch-target work.
- **Confidence**: High. This follows directly from selector matching; runtime confirmation is deferred to Pass 2 because Pass 1 may inspect only the diff.

### [Pass 1] “Real ancestor chain” tests replace each component subtree with synthetic markup

- **Severity**: Medium
- **File:line**: `tests/desktop-and-css.spec.js:1217`
- **Triggering input or sequence**: Run either 360px `gdx3Measure` test. For every probe, the helper replaces the selected real tab's entire contents with a new inline-styled `#gdx3-host` and a hand-authored HTML fragment.
- **Observable consequence**: Only the outer tab ancestors are real. Any production clipping ancestor, stacking context, positioning container, or adjacent control omitted from a probe's fragment cannot intercept or clip `elementFromPoint`, so an overlay can pass while failing in the live rendered component. The claim that the fixtures exercise each control's “real ancestor chain” is therefore overstated.
- **Confidence**: High that the oracle is synthetic below the tab; Medium that a specific omitted ancestor causes a current false pass, pending repository tracing in Pass 2.

### [Pass 1] Desktop-sidebar test never hit-tests the claimed effective area

- **Severity**: Medium
- **File:line**: `tests/desktop-and-css.spec.js:1306`
- **Triggering input or sequence**: Run `css-audit — the desktop sidebar chrome has a >=44px hit area`. The test appends synthetic controls to `#desktop-sidebar`, reads the element and `::after` computed sizes, and asserts those dimensions only.
- **Observable consequence**: A 44px pseudo-element that is clipped, painted beneath another element, or otherwise not the `elementFromPoint` result still passes. This test therefore does not establish that `.sidebar-app-tile` and `.sidebar-collapse-btn` have a usable 44px hit area, unlike the stated rendered-hit-area strategy.
- **Confidence**: High; there is no hit-test in this test body.

### [Pass 2] The newly added gdx-3 test group is red in the current environment

- **Severity**: Medium
- **File:line**: `tests/desktop-and-css.spec.js:1353`, `tests/desktop-and-css.spec.js:1363`
- **Triggering input or sequence**: Run `npx playwright test tests/desktop-and-css.spec.js --grep "gdx-3"` in this checkout.
- **Observable consequence**: The focused run reports 5 passed / 1 failed: `.edit-tab` renders at 29px but `GDX3_UNCHANGED_AT_DESKTOP` hard-codes 30px, so the AC3 regression test fails. The hard-coded font-dependent border-box expectation is not stable in the current test environment and the completed change does not have a green added-test group here.
- **Confidence**: Very high; directly observed. The later required full-gate run will establish the complete count.

### [Pass 2] Synthetic fixtures certify four legacy/dead controls while omitting a live changed selector

- **Severity**: Medium
- **File:line**: `tests/desktop-and-css.spec.js:1052`, `tests/desktop-and-css.spec.js:1120`, `tests/desktop-and-css.spec.js:1142`; `public/css/suite.css:2903`; `public/js/suite/status.js:449`; `public/js/suite/toast.js:7`
- **Triggering input or sequence**: Compare every probe selector with the real renderers and static markup. `.prestige-toggle` and `.st-char-dismiss` belong to a status implementation documented as removed wholesale in `toast.js`; `.hdr-profile` and `.hdr-menu-item` have no emitting markup/render path. Conversely, live `status.js` adds `.status-summary--toggle`, and the diff adds its `::before` overlay, but `GDX3_PROBES` contains no probe for it.
- **Observable consequence**: Green tests for the four invented fixtures prove CSS on DOM the application never emits, while regressions in a live changed target can pass completely unmeasured. This also contradicts the stylesheet comment that every selector in the block was hit-tested in its real ancestor chain.
- **Confidence**: High, based on full-file searches across `public/index.html`, `public/admin.html`, and `public/js/`, plus the explicit legacy-removal note.

### [Pass 2] The “real ancestor chain” claim is materially broader than what the helper mounts

- **Severity**: Medium
- **File:line**: `tests/desktop-and-css.spec.js:960`, `tests/desktop-and-css.spec.js:1171`, `tests/desktop-and-css.spec.js:1220`
- **Triggering input or sequence**: Run any probe whose real control is outside a tab or has dynamic inner ancestry—for example the header icon, login button, or collapsed sidebar—or a wrapping collection such as `.rank-pills`. `gdx3Measure` replaces an entire real tab's contents with hand-authored HTML inside a padded `#gdx3-host`; header/login/sidebar probes are relocated, and dynamic collections use reduced example data.
- **Observable consequence**: The helper retains only the `.tab`-and-above chain for its main inventory, not each control's complete live chain and state. Real clipping, wrapping, stacking, and neighbour branches can therefore remain green, as the independently reproduced sidebar and rank-pill failures demonstrate.
- **Confidence**: High.

### [Pass 3a] AC7 is not enforced for every changed live target or every required desktop rectangle

- **Severity**: Medium
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:205`; `tests/desktop-and-css.spec.js:1142`, `tests/desktop-and-css.spec.js:1353`
- **Triggering input or sequence**: Remove or break the live `.status-summary--toggle::before` overlay, or change the desktop rectangle of any in-scope target outside the six-entry `GDX3_UNCHANGED_AT_DESKTOP` array, then run the checked-in gdx-3 tests.
- **Observable consequence**: AC7 requires the regression test to enforce AC1 and AC3. The live status-summary target is absent from `GDX3_PROBES`, and AC3's “every in-scope element” rectangle identity is sampled for only six entries. Those regressions can remain green; the one AC3 test that does run is currently red for a separate hard-coded expectation.
- **Confidence**: High.

### [Pass 3a] The change performs work the story explicitly excludes: a colour rewrite and dead-rule additions

- **Severity**: Medium
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:99`, `specs/stories/gdx-3-mobile-touch-targets.md:107`, `specs/stories/gdx-3-mobile-touch-targets.md:126`; `public/css/suite.css:1702`, `public/css/suite.css:2955`, `public/css/suite.css:2971`
- **Triggering input or sequence**: Inspect the non-geometry selector rewrite at the downtime quick-form rule and trace the new `.prestige-toggle`, `.st-char-dismiss`, `.hdr-profile`, and `.hdr-menu-item` touch rules to live emitters.
- **Observable consequence**: “What this story is NOT” says no control changes colour, the story changes box geometry only, and dead rules belong to gdx-4. The diff nevertheless breaks/removes the scoped downtime text-colour rule and adds touch-target declarations/tests for four controls the app does not emit. This is unauthorized scope expansion as well as avoidable dead code.
- **Confidence**: High.

### [Pass 2] `.svt-btn` remains only 24px tall at desktop widths because the broad overlay is clipped

- **Severity**: Medium
- **File:line**: `public/css/suite.css:749`; `public/css/suite.css:2874`; `public/css/suite.css:2945`
- **Triggering input or sequence**: Use the Sheet/DT Report segmented toggle at a viewport of 600px or wider. `.sheet-topbar button::after` also matches `.svt-btn`, despite the comments saying `.svt-btn` takes T3 rather than T2; its `.svt-toggle` parent has `overflow:hidden`, and the genuine box-growth fallback is restricted to `max-width:599px`.
- **Observable consequence**: At 1280px Chromium measured the live static control as 62.19×24px. `elementFromPoint` 21px above and below its centre returned `div.sheet-topbar`, not the button, so the effective vertical target is still 24px on a wide touch device. The desktop regression test checks only that the visible box stayed 24px and therefore treats this failure as success.
- **Confidence**: High. Verified against the live `public/index.html` control in Chromium.

### [Pass 3a] `.pref-dot` fails AC3’s literal bounding-box equality requirement at desktop widths

- **Severity**: Medium
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:179`; `public/css/components.css:6113`; `tests/desktop-and-css.spec.js:1380`
- **Triggering input or sequence**: Compare a `.pref-dot` at any viewport ≥600px before and after the story. Its authored width/height changes from 38×38px to 44×44px at every width; a negative margin preserves pitch and row layout.
- **Observable consequence**: The visual glyph and surrounding layout can remain identical, but AC3 literally requires every in-scope element's own `getBoundingClientRect()` to be identical before and after. This element's rectangle is 6px larger in both dimensions. The checked-in test deliberately substitutes a layout-only guarantee for the AC's element-box guarantee, so it blesses rather than detects the deviation.
- **Confidence**: High. The before/after declarations are explicit, and the story itself acknowledges the 38→44 growth without writing an AC3 exception.

### [Pass 3a] AC7’s required real-element and complete-inventory ratchet is not implemented

- **Severity**: Medium
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:205`; `specs/stories/gdx-3-mobile-touch-targets.md:614`; `tests/desktop-and-css.spec.js:972`; `tests/desktop-and-css.spec.js:1220`
- **Triggering input or sequence**: Run the checked-in gdx-3 tests, then compare their fixture strategy and selector arrays to the story's required Testing mechanism and 80-selector inventory.
- **Observable consequence**: The story says to measure static controls such as `.svt-btn`, `.edit-tab`, `.resist-sel`, `.hist-clr`, `.panel-close`, `.rv2-*`, `#btn-contested`, `.sheet-topbar button`, `.login-crim-btn`, `.sidebar-collapse-btn`, `.lifecycle-card`, and `.list-filter` on their real nodes. Instead, every main probe replaces the real tab subtree with invented markup. `.status-summary--toggle` is absent from all probe arrays, and the two sidebar selectors are checked only at 1280px even though AC1 literally requires every inventory selector at 360px. The test therefore does not provide the ratchet AC7 specifies.
- **Confidence**: High from a direct inventory-to-test comparison (`80` unique inventory entries and `80` test selector strings, with `.status-summary--toggle` missing and a split `.char-picker__pill-clear` entry accounting for the equal count).

### [Pass 3b] The Dev Agent Record undercounts T2 by three `::after` selectors

- **Severity**: Medium
- **File:line**: `public/css/suite.css:2829`; `public/css/components.css:176`; `specs/stories/gdx-3-mobile-touch-targets.md:726`
- **Triggering input or sequence**: Parse the shipped comma-separated pseudo-element selector lists and count selectors, including `.edit-tab`'s separate components rule.
- **Observable consequence**: `suite.css` contains **57** `::after` selectors by itself, and `.edit-tab::after` makes **58**, plus the two `::before` selectors. The shipped total is therefore **60 T2 selectors (58 after + 2 before)**, not the record's **57 (55 after + 2 before)**. The record's own enumerated `::after` list also contains 58 selector names despite its “55” heading.
- **Confidence**: High; counted directly from the parsed current rule blocks and cross-checked against the record's enumeration.

### [Pass 3b] “Eleven moved from T2 to T3” is arithmetically and substantively false

- **Severity**: Medium
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:841`; `specs/stories/gdx-3-mobile-touch-targets.md:898`; `public/css/suite.css:2943`
- **Triggering input or sequence**: Compare the final 18-selector T3 block with the three initially prescribed T3 cases and the record's claimed moved categories.
- **Observable consequence**: The final T3 block does contain 18 selectors. Three are the separately described `.tbox`, `.svt-btn`, and `.hdr-char-menu-item`; the remaining **15**, not 11, are exactly the six selects + four stacked rows + five clipped-ancestor controls that the record says were moved. The record repeats “eleven” while enumerating 6+4+5, so the causal-history count cannot be true as written.
- **Confidence**: High; both the final CSS and the record's own arithmetic establish 15.

### [Pass 3b] The per-group prove-discriminate table is not reproducible as stated on the current tree

- **Severity**: Medium
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:857`; `tests/desktop-and-css.spec.js:1363`
- **Triggering input or sequence**: Hash the three CSS files, neutralize only the T2 `::before` group (`content:none`), run the six gdx-3 tests, restore; then repeat with only the T3 breakpoint changed to `max-width:0`, restore, and rerun the unchanged tests.
- **Observable consequence**: The causal subsets do discriminate correctly: `::before` adds the predicted AC1 failure, and T3 adds the predicted AC1 plus AC2 failures. But the raw results are **2 failed / 4 passed** and **3 failed / 3 passed**, not the recorded **1/5** and **2/4**, because the untouched baseline already contains the `.edit-tab` failure. After exact restoration, the suite returns to 1/5 rather than green. The record's table and “restoring makes green again” verification are therefore false for the reviewed tree.
- **Confidence**: High. Both perturbations were run; SHA-256 and normalized git-diff hashes matched before and after restoration.

### [Pass 3b] The claimed admin `.edit-tab` visual verification could not have exercised an admin control

- **Severity**: Medium
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:811`; `public/admin.html:12`; `public/index.html:142`
- **Triggering input or sequence**: Attempt to locate or render `.edit-tab` through `admin.html` and its imported admin/editor modules, as the record says was verified at 1280px in both themes.
- **Observable consequence**: No `.edit-tab` is emitted on the admin entrypoint; the only live markup is in `public/index.html`. A sweep can verify the player/ST-editor instance and can verify that admin has no matching node, but it cannot support the record's claim that the admin editor's `.edit-tab` header was rendered and found identical.
- **Confidence**: High from the complete source search; the historical deleted driver is unavailable, so this specific claimed admin measurement is also unverifiable as an artifact.

## Low

### [Pass 1] Midpoint-only hit probes do not establish that the full overlay is unobstructed

- **Severity**: Low
- **File:line**: `tests/desktop-and-css.spec.js:1170`
- **Triggering input or sequence**: Put an overlapping sibling or clipping shape over only a corner/partial edge of a 44px overlay while leaving its centre and four inset edge midpoints unobstructed, then run the tappability test.
- **Observable consequence**: All five samples still resolve to the target and the test passes although part of the claimed rectangular hit area activates something else. This is most relevant for wrapped/dense layouts where neighbours can approach diagonally.
- **Confidence**: High as a test-coverage limitation; Low-to-Medium that the current production layouts contain such a corner-only obstruction, pending Pass 2.

### [Pass 2] The `.edit-tab` admin-surface rationale describes a render path that does not exist

- **Severity**: Low
- **File:line**: `public/css/components.css:175`; `public/index.html:137`
- **Triggering input or sequence**: Search the complete admin markup and `public/js/admin/` / `public/js/editor/` renderers for `.edit-tab`, `.edit-tabs`, or `.edit-header`.
- **Observable consequence**: The selector appears only in `public/index.html` and `app.js`; `admin.html` loads `components.css` but does not render these classes. The comment's claimed need to protect an admin-header instance is false, making future blast-radius reasoning harder (although this specific rule currently has no matching admin element to regress).
- **Confidence**: High.

### [Pass 3a] Checked Tasks 2 and 6 require an admin `.edit-tab` verification against nonexistent markup

- **Severity**: Low
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:221`, `specs/stories/gdx-3-mobile-touch-targets.md:255`; `public/admin.html:11`
- **Triggering input or sequence**: Attempt the checked task's required pixel-identical verification of `.edit-tab` in `admin.html`.
- **Observable consequence**: `admin.html` loads `components.css` but has no `.edit-tab` render path, so the stated cross-entry-point verification cannot actually exercise a target. The player-app ST editor remains testable, but the admin half of the checked task is based on a false premise.
- **Confidence**: High.

### [Pass 2] Five touch-target rules are exercised only by invented fixtures, not by the served app

- **Severity**: Low
- **File:line**: `public/css/suite.css:2787`; `public/css/suite.css:2790`; `public/css/suite.css:2930`; `tests/desktop-and-css.spec.js:1052`; `tests/desktop-and-css.spec.js:1072`; `tests/desktop-and-css.spec.js:1120`
- **Triggering input or sequence**: Search the served `public/index.html` and its player-side modules for `.prestige-toggle`, `.st-char-dismiss`, `.hdr-menu-item`, `.hdr-profile`, and `.feed-toggle`, then run the gdx-3 probes that manufacture those classes.
- **Observable consequence**: The first two occur only in the unserved repository-root legacy `index.html`; the header profile/menu classes are not emitted by the public app; and `.feed-toggle` is emitted by `public/js/admin/downtime-views.js`, but `admin.html` does not load `suite.css`. The new rules therefore improve no live served control while synthetic fixtures report them covered, inflating the inventory and obscuring the actual live targets that need review.
- **Confidence**: High for the current repository and Playwright server (`npx http-server public`); dynamic class construction was checked through the player renderer sources.

### [Pass 2] Pass 1 overstated the visible impact of the malformed downtime colour selector

- **Severity**: Low
- **File:line**: `public/css/components.css:1807`; `public/css/components.css:1839`; `public/css/suite.css:1702`
- **Triggering input or sequence**: Render the same downtime radio/checkbox labels described in the Pass 1 finding and follow the full cascade.
- **Observable consequence**: The duplicated-ID selector remains malformed and the unrelated rewrite remains unjustified, but both base component rules already declare `color:var(--txt)`. Therefore there is no current colour change in the normal cascade; the Pass 1 prediction of an observable colour regression is contradicted by repository context and should not be treated as a present user-visible failure.
- **Confidence**: High from the full stylesheets. The Pass 1 finding is intentionally left unchanged as required by the review protocol.

### [Pass 2] The `.edit-tab` comment claims an admin render site that does not exist

- **Severity**: Low
- **File:line**: `public/css/components.css:175`; `public/index.html:142`; `public/admin.html:12`
- **Triggering input or sequence**: Search `admin.html`, `public/js/admin/`, `public/js/editor/`, and the admin entry module for `.edit-tab`, then compare the sole live markup in `public/index.html`.
- **Observable consequence**: `components.css` is shared, but `.edit-tab` currently renders only in the player/game app. The comment's reason for locating the rule in the shared stylesheet (that it also renders on `admin.html`) is stale or false, which can misdirect future blast-radius analysis; no current admin layout regression was found from either changed `components.css` selector.
- **Confidence**: High for the current source tree.

### [Pass 3a] The change adds rules for dead/unserved selectors despite the story explicitly excluding dead-rule work

- **Severity**: Low
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:107`; `public/css/suite.css:2787`; `public/css/suite.css:2930`
- **Triggering input or sequence**: Apply the T2/T3 lists to the actual `public/` entrypoints and renderer ownership claimed by the in-scope inventory.
- **Observable consequence**: New touch-target declarations are added for five selectors that have no applicable served player surface (`.prestige-toggle`, `.st-char-dismiss`, `.hdr-menu-item`, `.hdr-profile`, `.feed-toggle`). The story says dead rules belong to gdx-4 and identifies `public/index.html` as the target surface “full stop,” so manufacturing fixtures for them quietly performs an excluded dead-selector pass while missing real-context validation.
- **Confidence**: High for the current served entrypoints; this restates the Pass 2 source trace against the now-visible scope constraint.

### [Pass 3a] The wide-viewport `.svt-btn` defect is real but is not a literal AC1 violation

- **Severity**: Low
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:168`; `public/css/suite.css:2945`
- **Triggering input or sequence**: Compare the Pass 2 1280px measurement to AC1's exact viewport clause.
- **Observable consequence**: AC1 requires 44×44 specifically at 360px, where T3 grows `.svt-btn` correctly; AC3 constrains desktop visuals rather than desktop hit size. The 24px effective desktop target remains a real quality gap and contradicts broader comments about universal 44px targets, but it does not breach AC1's literal 360px wording.
- **Confidence**: High. This intentionally qualifies, without revising, the earlier Pass 2 finding.

### [Pass 3b] The visual-diff headline counts reproduce, but the 360px attribution does not

- **Severity**: Low
- **File:line**: `specs/stories/gdx-3-mobile-touch-targets.md:784`
- **Triggering input or sequence**: Independently load the base commit's `theme.css`, `components.css`, and `suite.css` via `git show`, then compare the checked-in probe inventory's width, height, offset, padding, borders, radius, background, font size, and margin at 1280px/360px in both themes.
- **Observable consequence**: The independent run confirms exactly one changed selector at 1280 (`.pref-dot`) and exactly 20 at 360 in both themes. But the 360 list is **17** T3 selectors, `.pref-dot`, `.trk-cond-add`, and `.status-ranking-save`; `.hdr-char-menu-item` is not in the observed diff. Thus the record's attribution to all 18 T3 selectors plus `.pref-dot` plus two indirect effects is internally a 21-item claim and does not match the reproduced 20-item list. The original driver/JSON were deleted, so only the independent reconstruction—not the historical artifact—was runnable.
- **Confidence**: High for the independent current-vs-base measurement and the arithmetic; the missing historical artifact is explicitly noted.

## Ship assessment

**The reviewed snapshot needs patches and was not ready to ship as-is.** It had three blocking acceptance/runtime problems: the live collapsed-sidebar target was only 39×39px, wrapped ranking-pill targets overlapped and could select a different pill, and adjacent Office stepper targets overlapped by 12px and could invert the intended action. Its required Playwright gate was reproducibly red at **34 passed / 13 failed**, with one failure added beyond the documented 12-failure baseline. The AC3 wording or the reviewed `.pref-dot` implementation also contradicted the other. The worktree was edited by another process after all findings were frozen; that newer state is outside the reviewed snapshot and needs its own review, but its stable final gate is still red at **35 passed / 13 failed**.

## Validation notes

### Pass boundaries and files opened

- **Pass 1:** I opened only `specs/stories/code-review/gdx-3-mobile-touch-targets-diff.txt` and the findings file I was creating. I did not open the story, source tree, package/config files, or any sibling repository. I froze all Pass 1 findings before beginning Pass 2.
- **Pass 2:** I opened the full `tests/desktop-and-css.spec.js`; `public/css/suite.css`, `public/css/components.css`, and `public/css/theme.css`; `public/index.html` and `public/admin.html`; `playwright.config.js`; `package.json`; and relevant renderer sections in `public/js/app.js`, `public/js/admin.js`, `public/js/admin/attendance.js`, `public/js/admin/cycle-views.js`, `public/js/admin/devlog-admin.js`, `public/js/admin/dice-engine.js`, `public/js/admin/downtime-views.js`, `public/js/admin/st-mods-panel.js`, `public/js/components/character-picker.js`, `public/js/editor/identity.js`, `public/js/game/challenge-initiation.js`, `public/js/game/challenge-notification.js`, `public/js/game/char-pools.js`, `public/js/game/contested-roll.js`, `public/js/game/humanity-check.js`, `public/js/game/rules.js`, `public/js/game/tracker.js`, `public/js/shared/resist.js`, `public/js/shared/rules-text.js`, `public/js/suite/office-approvals.js`, `public/js/suite/roll.js`, `public/js/suite/roll-v2.js`, `public/js/suite/sheet.js`, `public/js/suite/status.js`, `public/js/suite/toast.js`, `public/js/suite/tracker-feed.js`, `public/js/tabs/archive-tab.js`, `public/js/tabs/downtime-form.js`, `public/js/tabs/feeding-tab.js`, `public/js/tabs/office-tab.js`, `public/js/tabs/ordeal-form.js`, `public/js/tabs/ordeals-view.js`, `public/js/tabs/questionnaire-form.js`, and `public/js/tabs/status-ranking.js`. Searches covered the rest of `public/js/` and the repository-root legacy `index.html` where noted. I did not open the story spec or its Dev Agent Record in this pass. I froze Pass 2 before beginning Pass 3.
- **Pass 3a:** I opened only lines 1–677 of `specs/stories/gdx-3-mobile-touch-targets.md` (Story, Acceptance Criteria, Tasks/Subtasks, and Dev Notes), plus code already permitted in Pass 2. I identified the Dev Agent Record boundary first and did not read line 678 onward. I froze Pass 3a before beginning Pass 3b.
- **Pass 3b:** I then opened the Dev Agent Record from line 678 to EOF, `specs/deferred-work.md`, the relevant current files already listed, and the base versions of the three CSS files through `git show 3f4b2f2a:...`. I did not open, read, or touch any sibling repository.

### Commands and real results

- **Pass 1 inspection:** I used `Get-Content` in bounded chunks to read the 857-line, 50,400-byte diff, `Select-String` to locate the quick-form, fixture-host, and sidebar-test hunks, and `Test-Path`/`Get-Content` to verify the findings file after writing it with `apply_patch`. An initial `Get-Content -Raw` call, two early file-size probes, `Write-Output 'ok'`, and `cmd.exe /d /c echo ok` hung or timed out while the shell was unhealthy; I terminated them. `Get-Date` then succeeded and subsequent PowerShell calls were normal. One early `Select-String` invocation failed because of quoting; the corrected invocation succeeded.
- **Pass 2 source tracing:** I used bounded `Get-Content` reads, `rg`, `Select-String`, and small PowerShell selector-mapping scripts. One initial selector mapper incorrectly indexed a scalar result and produced unusable matches; I corrected it by forcing arrays and reran it. One broad repository `rg` timed out after 60 seconds; narrower searches completed. One combined server-path search referenced nonexistent paths and failed; reading `playwright.config.js` directly confirmed the server command is `npx http-server public -p 8080 -s`. A requested read of nonexistent `public/js/suite/tracker.js` failed; the real tracker renderer is `public/js/game/tracker.js`. A `git show` attempt for nonexistent base `public/css/base.css` failed; the relevant current/base files were then located and read correctly.
- **Pass 2 targeted suite:** `npx playwright test tests/desktop-and-css.spec.js --grep "gdx-3"` completed **5 passed / 1 failed**. The failure was the desktop `.edit-tab` height assertion: actual 29px, expected 30px.
- **Pass 2 runtime probes:** Before Playwright calls I used `Get-NetTCPConnection` checks and observed `PORT_8080_FREE`; I never ran concurrent Playwright invocations. Temporary Playwright probes created with `apply_patch` measured: `.svt-btn` at 62.1875×24px with ±21px vertical points resolving to `div.sheet-topbar`; the Office step buttons at 26px with 32px centre pitch, 12px overlap, and the overlap resolving to the later `down` button; collapsed sidebar tiles at 39×39px with both vertical edge points missing; and wrapped ranking-pill overlaps `[0,3]` and `[1,4]` with the first pill's lower-edge probe resolving to another pill. The retained runner summary for `tests/gdx3-codex-probe.spec.js` was **1 passed (2.9s)**. The second temporary probe completed and yielded the recorded sidebar/rank measurements, but its exact reporter pass-count line was not retained in the session transcript; I do not invent it here. Both temporary probe files were removed.
- **Pass 3a inventory check:** A PowerShell comparison of the story inventory and test selectors reported `INVENTORY_COUNT=80` and `TEST_SELECTOR_COUNT=80`, with `.status-summary--toggle` missing from the tests and the split `.char-picker__pill-clear` entry accounting for the equal count.
- **Pass 3b count checks:** PowerShell parsers reported `SUITE_AFTER=57`; adding `.edit-tab::after` from `components.css` gives **58 `::after` selectors**, with **2 `::before` selectors**. The corrected final-media-block parser reported `FINAL_T3_UNIQUE=18`. The first T3 parser selected the wrong media block and returned 0; I corrected and reran it. Parsing the record's purported selector enumeration exposed 58 selector names (with one additional non-selector `components.css` string in the raw extraction).
- **Required full gate, first run:** After confirming port 8080 was free, `npx playwright test tests/desktop-and-css.spec.js --reporter=line` ran 47 tests and finished **34 passed / 13 failed (10.1m)**.
- **Required targeted gate:** `npx playwright test tests/desktop-and-css.spec.js -g "gdx-3" --reporter=line` finished **5 passed / 1 failed (9.5s)**, again on `.edit-tab` actual 29px versus expected 30px.
- **Required full gate, second run:** After another free-port check, the same full command again finished **34 passed / 13 failed (10.0m)**. The failure set was stable: the documented 12 baseline failures plus the new `.edit-tab` failure.
- **Literal exact-command reruns and concurrent-edit disclosure:** I subsequently ran exactly `npx playwright test tests/desktop-and-css.spec.js`, without a reporter option. During the first exact run another process changed `tests/desktop-and-css.spec.js` (the collected test at line 1363 reappeared at line 1617 in the worker, and two tests reported “Test not found in the worker process”). That contaminated run's real result was **32 passed / 15 failed (9.9m)**; I do not use it as a valid gate. The file then stabilized at 1,658 lines with SHA-256 `A2311F7532EC0AAF18A006F5558EED1FA2E18D93112D1E4CDEBDE087F34AFC96`. After confirming port 8080 was free, I reran the exact command while hashing the test file before and after. It collected 48 tests, finished **35 passed / 13 failed (9.9m)**, and the before/after hashes matched. This is the exact current gate count at final validation. Its 13 failures are the same 12 baseline failures plus `.edit-tab` actual 29px versus expected 30px.
- **Prove-discrimination group 1:** I hashed all CSS files, changed only the T2 `::before` group's `content:''` to `content:none` with `apply_patch`, and ran the targeted gdx-3 suite. Result: **2 failed / 4 passed**—the predicted AC1 failure plus the unchanged `.edit-tab` failure. I restored the declaration. Because `apply_patch` normalized line endings, I mechanically restored CRLF and verified the exact original suite hash and normalized git-diff hash.
- **Prove-discrimination group 2:** I changed only the T3 media query from `max-width:599px` to `max-width:0`, then ran the targeted suite. Result: **3 failed / 3 passed**—the predicted AC1 and AC2 failures plus the unchanged `.edit-tab` failure. I restored the query and CRLF, then reran the unchanged targeted suite: **5 passed / 1 failed (7.7s)**, not green.
- **Restoration hashes:** Immediately after my perturbation experiments, SHA-256 returned exactly to the captured pre-perturbation values: `F81E81B3C02573E2D0CCADEB2A6602739685A0C5CC51342C1D61BC076F1D8C0C` for `public/css/suite.css`, `DB9ED5A5CAB31F9F770684E27FC50075394D99B811604428D2C1BA66631BCAAA` for `public/css/components.css`, and `35B9FC12B30FC82858FEB9F42A4097FAEAEFB3B534ADFAF207427D14695A5D4C` for `public/css/theme.css`. The normalized diff hash likewise returned to its captured value `29f70f83e7cd67031e450185c9166258da2b4a48`. During the later exact gate, another process rewrote `suite.css`, `components.css`, and the test file. Their final hashes are `F3EE0D51C163D3EA8B7A4D4F986846E74DF5FE924F3B00927864BDC5B2050056`, `B2862CF1855A6C7B69226F72EB3A9455E02D88B8E109AE83D6D88F9A3C0CC9A5`, and `A2311F7532EC0AAF18A006F5558EED1FA2E18D93112D1E4CDEBDE087F34AFC96`, respectively; `theme.css` stayed unchanged. I did not make or reverse those concurrent edits.
- **Independent visual comparison:** I created a temporary Playwright driver that loaded the base commit's three CSS files using `git show`, measured the checked-in probe inventory, and compared current versus base at 1280px and 360px in both themes. `npx playwright test tests/gdx3-codex-visual-diff.spec.js --reporter=line` finished **1 passed (8.7s)**. It found exactly one 1280px difference (`.pref-dot`) and exactly 20 360px differences in each theme: `.svt-btn`, `.pref-dot`, `.tbox`, `.trk-cond-sel`, `.trk-cond-add`, `.resist-sel`, `.rules-panel-close`, `.cr-close`, `.cr-adj`, `.prestige-toggle`, `.st-char-dismiss`, `.status-ranking-sel`, `.status-ranking-save`, `.arc-doc-item`, `.qf-select`, `.qf-radio-label`, `.char-picker__option`, `.hdr-menu-item`, `.list-filter`, and `.form-select`. I removed the driver and confirmed it no longer exists.
- **Other validation:** `rg` confirmed the B1/B2/B3 and gdx-4 deferrals in `specs/deferred-work.md`. `git diff --stat`/`--numstat 3f4b2f2a` was used to verify the reviewed change footprint. Repeated `Get-FileHash`, `Test-Path`, `git diff`, and `git status --short` checks verified restoration and removal of temporary files. The final status still shows the story's pre-existing modified/untracked implementation and review artifacts plus this new findings file; no source/test change made by this review remains.

### Could not run or independently reproduce

- The original visual-diff driver and its JSON artifact were deleted before this review, so the historical `git stash` execution itself could not be rerun or authenticated. I ran an independent current-vs-base Playwright reconstruction instead.
- I did not perform the record's manual human Chrome visual sweep; I performed automated rendered geometry/hit-test probes in Chromium and the independent two-theme/two-width comparison.
- I did not perturb all six technique groups. The request required at least two; I ran T2 `::before` and T3, and both were restored exactly.
- I did not run unrelated server or Vitest suites; the story identifies them as unchanged/irrelevant. The specifically required Playwright file was run four times in full: twice against the frozen reviewed snapshot, once during the concurrent edit (contaminated and disclosed), and once against the stable post-edit file.

### Final mutation attestation

I made no persistent source, test, story, tracking, or configuration change. I temporarily created probe files and temporarily altered two CSS declarations for discrimination tests; all were removed or restored, with exact hashes verified before the later external edits occurred. `git status --short` contains no temporary probe/visual-diff file and no unintended change attributable to this review; the only persistent file I created is this requested findings report. The worktree is not globally clean because the reviewed implementation, story/tracking files, and pre-existing review artifacts were already modified or untracked when this review began. During final validation, another process changed `tests/desktop-and-css.spec.js`, `public/css/suite.css`, and `public/css/components.css`; timestamps, changing hashes, and Playwright's collection/worker mismatch establish that this happened while my exact-command gate was running. I preserved those external edits and did not attempt to merge, revert, or review them after the frozen passes.
