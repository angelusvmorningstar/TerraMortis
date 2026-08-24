# Story gdx.3: 44px effective hit areas on the player game-night surfaces

Status: done

> **Blocked on one decision, 2026-08-20.** The external code review is complete and every patch is
> applied and prove-discriminated, but one item genuinely needs Angelus's call before this can go to
> `done`: thirteen Technique T2 selectors now expand horizontally only, because a full 44px vertical
> expansion demonstrably reached into their own stacked or wrapped siblings and stole their taps.
> Accepting that as AC2's evidenced exception list closes the story; reaching a genuine 44px means a
> visible phone-tier row growth (Technique T3) on all thirteen, which AC4 requires signing off by
> name. See "Review Findings (AI)" below and `specs/deferred-work.md`.

## Story

As a player (or an ST) using the app on a phone at a live game,
I want every control I have to tap to have a finger-sized hit area,
so that I can spend Vitae, mark damage, flip a toggle or pick a modifier in a dim room without
mis-tapping the control next to the one I meant.

## Why this story exists

GitHub issue #984, Epic GDX Group A (mobile hygiene, independent of Groups B and C). The issue's own
wording is short:

> Pad hit areas (not visual size) to >=44px: tappable rating dots (`components.css:48`, 18px today),
> `.edit-tab` strip (`components.css:174`, ~30px), `.svt-btn` toggles (`suite.css:730`, ~26px),
> tracker tap zones.
> AC: (1) All interactive player-surface controls have >=44px hit areas. (2) Desktop visual design
> unchanged.

44px is the WCAG 2.5.5 (Target Size, AAA) figure and the number this repo has already standardised on
in five earlier stories (see "Existing convention" in Dev Notes). It is not a new introduction here.

## Measured baseline (verified during story creation, 2026-08-20)

Every figure and line reference below was re-derived from the current tree. **Do not trust issue
#984's own numbers** without checking; one of its four is stale and one of its four points at the
wrong element. gdx-2 hit the same problem with issue #983.

**Audit method.** Every rule in `public/css/suite.css` and `public/css/components.css` carrying
`cursor:pointer` was extracted and its box height derived from `height` / `min-height`, or from
`padding` plus `line-height` (falling back to `font-size` x 1.2). Result:

| Bucket | Count |
|---|---|
| `cursor:pointer` rules, both files | **218** |
| already >= 44px | 24 |
| below 44px (derived) | 140 |
| not statically derivable (no height, no padding, or content-sized) | 54 |

Each selector was then mapped to the JS module or HTML file that emits it, so player surfaces could
be separated from ST-only ones. `public/js/app.js`'s `NAV_ITEMS` and `MORE_APPS` carry the
`stOnly` / `coordinatorOnly` flags that decide this; the ST-only tabs are `territory`,
`office-approvals`, `tracker`, `combat`, `spheres`, `signin` and `emergency`.

### The issue's four named targets, as they actually are

| Issue says | Reality | Verdict |
|---|---|---|
| "tappable rating dots (`components.css:48`, 18px today)" | `.dot{width:18px;height:18px}` is at **`components.css:48`** and is **18px** - both correct. But `.dot` is emitted **only** by `public/js/editor/attrs-tab.js` (the ST character editor's Attributes and Skills panes). A player never renders it. The genuinely player-facing tappable rating dot is **`.pref-dot`** (`components.css:6081`, **38x38**), the Chronicle Preferences stepper on the Ordeals/XP tab, emitted by `public/js/tabs/ordeals-view.js:125`. | `.dot` **carved out** (see the scoping call below). `.pref-dot` **in scope** - it is the control the bullet was reaching for. |
| "`.edit-tab` strip (`components.css:174`, ~30px)" | `.edit-tab{padding:8px 14px;font-size:0.625rem}` is at **`components.css:174`**. Derived height **28px** (8 + 8 + a ~12px line box at 10px). Width is already comfortable (roughly 108px for "ATTRIBUTES"), so this is a **height-only** problem. | **In scope.** See the scoping call. |
| "`.svt-btn` toggles (`suite.css:730`, ~26px)" | Real line is **`suite.css:750`**, not 730. Derived height **23.2px** (`padding:5px 12px`, `font-size:var(--fs-floor-micro)` = 11px). Note the font-size is a `var()` because gdx-2 raised it from a literal 10px; before gdx-2 this rule derived to 22.4px. | **In scope.** |
| "tracker tap zones" | Unspecified in the issue. Resolves to **two different things**: (a) the **player's** tracker, `.tbox` (`suite.css:243`, **34x30**), the health/vitae/willpower/influence boxes on the sheet, emitted by `public/js/suite/sheet.js:148/403/888`, plus `.sh-tracker-info-btn` (`suite.css:2269`, **16x16**); and (b) the **ST Tracker tab** (`#t-tracker`, `stOnly:true`), whose `.trk-adj` is **28x28** and `.trk-adj.sm` **24x24** (`suite.css:640-641`). | **Both in scope.** (a) is player-facing. (b) is ST-only but the issue names it by name and it is the ST's most-tapped screen at a live game; it costs one rule. |

## Scoping call on `.edit-tab` (read gdx-2's precedent before this section makes sense)

gdx-2 raised the same question and Angelus ruled on it. From
`specs/stories/gdx-2-mobile-type-scale.md`'s Review Findings section:

> **Resolved by Angelus 2026-08-20 ... `.edit-tab`/`.edit-dirty` stay unraised - they are ST-only
> tooling chrome a player never sees, not player content, so AC2's floor doesn't need to reach them.**

That ruling is about a **text-size floor**. It was re-examined here rather than inherited, because
touch targets are a different concern, and the re-examination reaches a **different conclusion for
`.edit-tab` and the same conclusion for `.dot`**. The reasoning, explicitly:

**Why gdx-2's logic does not transfer to `.edit-tab`.**
1. gdx-2's ruling turned on *cost versus benefit for legibility*: an ST does not need a 10px tab
   label enlarged, and enlarging it would cost editor density. Touch targets have a different
   benefit profile. `public/index.html` hosts the full ST editor (`editorRenderSheet` is called into
   it whenever `getRole()==='st'`, established as fact by gdx-2's own Acceptance Auditor layer), so
   an ST editing a sheet from their phone mid-session really does tap `.edit-tab`. It is the **only**
   control that moves between editor panes, so a missed tap is a hard block, not a comfort issue.
2. The objection that decided gdx-2 does not exist here. gdx-2's change was visible; this story's is
   not. `.edit-tab` takes **Technique T2** (a transparent hit-area pseudo-element, see Dev Notes), so
   the admin editor renders pixel-identically before and after. The density argument has nothing to
   bite on.
3. It is geometrically clean. `.edit-header` has `padding:12px 24px`, so an 8px vertical expansion on
   each side of a 28px control lands at 44px and still sits inside the header's own padding. Nothing
   overlaps.

**Why `.dot` is nonetheless carved out, on evidence rather than by inheritance.** Same family (ST
editor chrome), different physics, and the fix would make the app worse rather than better:
- `.attr-row`/`.skill-row` are `padding:5px 0` with an 18px dot, so the **row pitch is about 29px**.
  A 44px vertical hit area would overlap the rows above and below by roughly 7px each. A mis-tap
  would then set a *different attribute's* dots. That is a regression, not an improvement.
- `.dot-stepper{gap:2px}` gives a **20px horizontal pitch**. A 44px horizontal hit area would overlap
  each neighbouring dot by 24px, i.e. every dot's hit area would cover more of its neighbours than of
  itself. WCAG 2.5.8's spacing exception exists for exactly this case.
- The only real fix is to re-lay-out the editor's Attribute and Skill grids for phone widths, which
  is a redesign, is explicitly excluded below, and is constrained by AC3 ("desktop visual design
  unchanged") anyway.

So `.dot` goes to carve-out **B3** with its measurements recorded, and the player-facing rating dot
the issue was actually describing (`.pref-dot`) is fixed instead.

## What this story is NOT

- **Not a redesign.** No control changes colour, border, radius, font or label. Where a visual box
  does grow (Technique T3 only), it grows **only below 600px** and only where T1 and T2 are proven
  unsafe, and each such case is listed by name in the Completion Notes.
- **Not a visual-size change on desktop, and not one on phone either, except by the explicit T3
  list.** Issue #984's own framing is "pad hit areas (not visual size)". AC3 states the desktop half;
  AC4 states the phone half, which the issue leaves implicit. Reinforce both.
- **Not gdx-4 (mobile CSS cleanup).** Dead rules, duplicated chrome, selector consolidation, the
  inline `style="font-size:Npx"` sites gdx-2 deferred, and the now-dead `.cc-alert.yellow`
  declaration all belong to **gdx-4-mobile-css-cleanup**.
- **Not gdx-9 (single-scroll sheet).** Sheet relayout is **gdx-9-single-scroll-sheet**, Group C.
- **Not a re-do of gdx-2.** `suite.css` and `components.css` are the same two files gdx-2 converted
  to `rem`. Do **not** reconvert, do not touch any `font-size`, and do not touch the
  `--fs-floor-body` / `--fs-floor-micro` tokens or the player-scoped floor-override block gdx-2
  appended to the end of `suite.css`. This story changes box geometry only.
- **Not a re-do of CSS-4.** `specs/stories/css-audit/css-4-tap-targets-padding.story.md` (status
  `review`) already brought the Territory tracker and several tab containers to 44px. Its results are
  live in the tree (`#t-territory button`, `#t-territory .adj`, `#t-territory .back-del` are all at
  44px today). Leave them alone.
- **Not a tab-container padding pass.** CSS-4's ACs 3 to 5 (outer padding, section spacing) are a
  different concern and are not revisited here.
- **Not a new breakpoint tier.** Where T3 needs a media query, use the repo's established phone tier
  `@media (max-width: 599px)` (`suite.css:88`, `suite.css:2003`) or gdx-2's narrow tier
  `@media (max-width: 480px)` (`suite.css:1201`), whichever the measurement actually justifies. Do
  not invent a third.
- **Not an ARIA or keyboard-accessibility pass.** WCAG 2.5.5 target size only.
- **No JS, no HTML, no server, no schema, no MongoDB.** This is a CSS-only story plus a test file.
  If a fix appears to need a class added in JS, it is the wrong fix: use a comma-separated selector
  list in CSS instead.

## Carve-outs (deliberate, with reasons)

Each is a real gap, each is recorded, none is silently dropped. Log all three to
`specs/deferred-work.md` as part of Task 7. Opening GitHub issues for them is Angelus's call, not
the dev agent's.

- **B1 - the Downtime form's own `.dt-` prefixed controls** (roughly 45 selectors from
  `components.css:1422` onward, plus `#t-downtime .qf-carthian-remove` at `suite.css:1699`,
  `.raw-toggle-btn` at `suite.css:1734`, `.dt-history-summary` at `suite.css:1723` and
  `.dt-mobile-show-anyway` at `suite.css:1452`). **Reason: another epic has already ratified a
  conflicting target size for this surface.** `specs/epic-dtui-downtime-form-ux-refactor.md`'s NFR9
  says "Touch targets >= 32px for tickers and chips; >= 36px for buttons", and
  `specs/stories/dtui-2-dt-chip-and-chip-grid.story.md`'s CC6 shipped `min-height:32px` on `.dt-chip`
  as a deliberate design decision. `.dt-chip` measures exactly 32px today, i.e. it is *at* its own
  ratified floor. Overriding another epic's accepted criterion is a product decision for Angelus, and
  the DT form's dense chip grids would re-flow. Note the boundary is the **`.dt-` prefix**, not the
  file section: the `.qf-` shared form primitives live in the same section but also render on
  Ordeals, Archive, Feeding and the questionnaire, so they stay **in scope**. Raising them to 44px
  exceeds DTUI's own ">= 36px for buttons" rather than contradicting it.
- **B2 - ST-only surfaces other than the Tracker tab.** `.cbt-*` (Combat tab,
  `public/js/game/combat-tab.js`), `#t-territory .regent-sel` (24.4px) and
  `#t-territory .peek-toggle-label` (14.4px) - the two stragglers CSS-4 missed - `.stm-*` (ST mods
  panel and audit), `.si-*` (Check-In, coordinator-only), `.city-map-*` / `.city-section-hd`,
  `.sidebar-st-btn`, and `#desktop-sidebar .sidebar-btn`. **Reason:** the issue's AC1 says
  "player-surface controls" and names none of these. The Tracker tab is the one ST-only surface the
  issue does name, so it is in and these are out. Measurements are in the audit table below so a
  follow-up story does not have to re-derive them.
- **B3 - the ST character editor's own chrome**, i.e. `components.css` lines 143 to 511 (`.dot`,
  `.skill-flag`, `.cap-btn`, `.mci-*`, `.infl-*`, `.dev-*`, `.sk-spec-*`, `.sh-bane-*`,
  `.sh-attr-pri select`, `.sh-edit-select`, `.topbar-btn`, `.topbar-action`, `.edit-back`) plus the
  edit-mode-only selectors that live in the SHEET VIEW section (`.sh-stat-adj`, `.sh-stat-lr`,
  `.sh-ts-slot-add`, `.sh-ts-slot-btn`, `.rel-edit-btn`, `.rite-free-badge`, `.rite-xp-badge`).
  **This is the same carve-out boundary gdx-2 used**, for the same shared-stylesheet reason, with
  `.edit-tab` explicitly pulled out of it per the scoping call above. `.dot`'s specific
  row-pitch-overlap evidence is recorded there too.

## Acceptance Criteria

1. **Every selector in the in-scope inventory (the "Files to touch" table) has an effective hit area
   of at least 44px by 44px at a 360px viewport.** "Effective hit area" means the larger of the
   element's own `getBoundingClientRect()` and the used box of any hit-area pseudo-element on it, and
   that area must be genuinely tappable (the pseudo-element must **not** carry `pointer-events:none`).

2. **No two in-scope hit areas overlap.** Expanding a hit area into a neighbouring control's hit area
   trades one mis-tap for another. Where the measured geometry does not allow 44px without overlap,
   the dev agent expands as far as the midpoint of the gap to the nearest interactive neighbour,
   records the selector and the achieved size in the Completion Notes, and does **not** claim AC1 for
   it. A short, evidenced exception list is an acceptable outcome; a silent overlap is not.

3. **Desktop visual design is unchanged.** At viewport widths of 600px and above, every in-scope
   element's `getBoundingClientRect()`, and its computed `padding`, `border-width`, `font-size`,
   `background-color` and `border-radius`, are identical before and after this story. Technique T2
   satisfies this by construction; Technique T1 satisfies it only where the box is genuinely
   invisible; Technique T3 satisfies it because its rules live inside a `max-width` media query.

4. **Phone visual design is unchanged too, except for an explicit, listed set.** The default is
   invisible expansion. Any selector that takes Technique T3 (a real box growth inside a phone-tier
   media query) is named in the Completion Notes with a one-line reason why T1 and T2 were both
   unsafe for it. An unlisted visual change on phone is an AC4 failure.

5. **A `--tap-min` token is declared in `public/css/theme.css`'s `:root` block** and is used at every
   site this story touches, so the floor is greppable and the regression test has a hook:
   - `--tap-min: 44px;`
   It goes in `theme.css` because that is the declared token SSOT
   (`specs/architecture/coding-standards.md` -> CSS Standards, `specs/project-context.md` section 1),
   next to gdx-2's `--fs-floor-body` / `--fs-floor-micro` at `theme.css:180`. It is
   **theme-invariant**, so `:root` only, never duplicated into `[data-theme="dark"]`.
   **Declare it in `px`, deliberately, not `rem`.** gdx-2's floors are `rem` because text must scale
   with the OS text-size preference. A touch target is a physical finger, not text: it must not
   shrink when a user lowers their text size. Add a comment saying so, because the unit difference
   from its two neighbours otherwise looks like an oversight.

6. **The three carve-outs (B1, B2, B3) are recorded in `specs/deferred-work.md`** with their measured
   selector lists and the reason for each, in the style that file already uses.

7. **A checked-in regression test enforces AC1 and AC3 and ratchets against reintroduction.** See the
   Testing section for the required mechanism, the real-DOM mounting requirement, and the
   pre-existing-failure baseline.

## Tasks / Subtasks

- [x] **Task 1 (AC5)** - `public/css/theme.css`: add `--tap-min:44px` to the `:root` block, directly
  under the gdx-2 type-floor comment at `theme.css:174-180`, with its own short comment naming this
  story and the px-not-rem rationale. Do **not** add it to `[data-theme="dark"]`. Do not touch the
  two `--fs-floor-*` tokens.

- [x] **Task 2 (AC1, AC2, AC3, AC4)** - Introduce the hit-area technique block. Add **one** clearly
  commented block near the end of `public/css/suite.css` (the file `index.html` loads and
  `admin.html` does not) holding the Technique T2 rule as a single comma-separated selector list plus
  its `::after` companion. Do not repeat the pseudo-element boilerplate per selector, and do not add
  a class in JS. See "The three techniques" in Dev Notes for the exact rule shape and its four traps.
  - [x] For any T2 selector that lives in `components.css` **and must also apply on `admin.html`**
        (`.edit-tab` is the only one), put that rule in `components.css` next to its own base rule
        instead, so the admin editor gets it too.

- [x] **Task 3 (AC1)** - Work the in-scope inventory (the "Files to touch" table). For each selector:
  measure it live at 360px, pick T1, T2 or T3 by the decision procedure in Dev Notes, apply it, and
  re-measure. Record the before size, the technique and the after size. Selectors marked `?` in the
  table could not be sized statically (content-sized or no padding declared) and **must** be measured
  before being classified.

- [x] **Task 4 (AC1, AC2)** - The two dot steppers, which need their own attention because they sit
  in tight runs:
  - [x] `.pref-dot` (`components.css:6081`, 38x38). The visual glyph is the 30px `●`; the 38x38 box
        is already an invisible padded hit area, so T1 applies and growing it to 44x44 changes
        nothing visible. **But check the row width first:** `.pref-axis-lbl{width:170px}` plus
        5 x 44px plus 4 x 8px gap is 422px, over a 360px viewport. `width` on a `<td>` is a hint
        rather than a hard constraint so the table may already shrink it, and the panel may already
        be over at 38px (392px). Measure at 360px; if the row is over, reduce
        `.pref-dot`'s horizontal footprint or `.pref-axis-lbl`'s width inside the phone tier rather
        than letting `.tab{overflow-x:hidden}` clip it. gdx-2's AC3 forbids clipping.
  - [x] `.tbox` (`suite.css:243`, 34x30, inside `.sh-tracker-boxes{gap:5px;flex-wrap:wrap}`). T2 is
        unsafe here: a 44px box on a 39px horizontal pitch and a 35px vertical pitch overlaps its
        neighbours in both axes, and the neighbours are other tracker boxes, so a mis-tap marks the
        wrong point of damage. Use **T3**: grow `.tbox` to 44x44 inside the phone tier only. Then
        re-check wrap behaviour at 360px, since the per-row count drops from 9 to 7 and a
        high-Blood-Potency character can have 15 Vitae boxes.

- [x] **Task 5 (AC1)** - `.svt-btn` (`suite.css:750`). **T2 will not work here** and the reason is a
  trap worth stating: its parent `.svt-toggle` (`suite.css:749`) carries `overflow:hidden` (it is
  there to clip the segmented control's `border-radius:4px` corners), which clips any pseudo-element
  that extends beyond the child's own box. Use **T3**, or relax the parent to `overflow:visible` plus
  per-child radius, whichever measures cleaner. Do not silently remove `overflow:hidden` without
  checking the corners still clip.

- [x] **Task 6 (AC1, AC3)** - `.edit-tab` (`components.css:174`), per the scoping call. T2, expanding
  8px above and below into `.edit-header`'s own `padding:12px 24px`. The rule goes in
  `components.css` so it applies on `admin.html` as well as inside `index.html`'s ST editor. Verify
  the admin editor header renders pixel-identically at 1280px, and that the expanded areas of two
  adjacent `.edit-tab`s do not overlap (`.edit-tabs{gap:2px}`; the expansion here is vertical only,
  so they should not, but measure rather than assume).

- [x] **Task 7 (AC6)** - Record carve-outs B1, B2 and B3 in `specs/deferred-work.md`, each with its
  selector list, measured sizes and reason, matching that file's existing entry style.

- [x] **Task 8 (AC7)** - Regression test. Add to the **existing `css-audit` group** in
  `tests/desktop-and-css.spec.js`. See the Testing section for the required mechanism and the two
  traps gdx-2 paid for. Prove-discriminate it: confirm it goes red against the pre-change CSS and
  green after, per selector group and not just in aggregate.

- [x] **Task 9 (AC1, AC2, AC3, AC4)** - Manual/live 360px sweep across every tab that owns an
  in-scope selector, matching this project's established manual-verification convention (gdx-1's
  Task 3, gdx-2's Task 8, gdx-11's and gdx-12's Task 8s). **Read the viewport-emulation gotcha in Dev
  Notes before starting.**
  - [x] Sweep as **player** and again as **ST** (the ST run is what exercises `.edit-tab`, the
        Tracker tab and the editor reachable inside `index.html`).
  - [x] Confirm at 1280px that nothing moved on desktop, in both themes.
  - [x] Record which selectors took T1, which T2 and which T3, with before and after measurements.
  - [x] If the sweep finds an in-scope control that cannot reach 44px without overlapping a
        neighbour, apply AC2's rule: expand to the gap midpoint, record it, do not claim AC1 for it.
  - [x] If the sweep finds a *new* offender not in the table, add it if the fix is this story's shape
        (a hit-area expansion). If it needs a layout rework, log it to `specs/deferred-work.md`
        rather than scope-creeping, following gdx-1's handling of #1191.

### Review Findings (AI)

External adversarial review by Codex (three ordered blinded passes: Pass 1 diff-only, Pass 2
diff+repo, Pass 3a spec-blind-then-informed), 2026-08-20, returned 5 High, 8 Medium, 7 Low. Codex's
own Pass 3b verification was cut short by a timeout, so **every** finding was treated as an
unverified claim and re-checked here against the real served page in headless Chromium - real tab
ancestor chains, real render markup taken from the emitting modules, `getBoundingClientRect()` and
`document.elementFromPoint` rather than reasoning from the diff. That re-check confirmed three of
the five Highs, disconfirmed one Medium outright, and turned up a considerably larger version of one
High that Codex had only seen a corner of.

Findings are tagged `[Codex]` where they came from the external review and `[Verification]` where
they are this round's own independent finds.

**Patched.**

- [x] [Codex][Patch] **`.pref-dot` fails AC3's literal bounding-box requirement.** True, and the
      story's own Completion Notes recorded it as "AC3's single, deliberate exception". AC3 has no
      exception clause, so rather than document the gap away the review checked whether Technique T2
      was available - it is. `.pref-dot`'s ancestor chain has no clipping ancestor tight enough to
      matter (`.xpl-panel` is `overflow:auto` but the dots sit well inside it), it owns neither
      pseudo-element, and it is a `<span>` not a form control. Switched T1 -> T2. Measured after the
      swap at 360px and 1280px: own box back to **38x38** (the pre-gdx-3 value, so AC3 now holds by
      construction with no exception at all), hit area a true **44x44**, glyph pitch 46px,
      first-glyph inset 19px, dot run 222px, row height 66px - every one identical to both the
      pre-gdx-3 values and the T1 version's. Adjacent hit areas end 2px apart across a row and
      between rows, so AC2 still holds. [`components.css`, `.pref-dot`]
- [x] [Codex][Patch] **The Office `.cs-step-btn` steppers overlap by 12px.** Confirmed by
      arithmetic and then by measurement, and it is worse than Codex found: with the real
      `.office-merit-list` markup from `office-tab.js` (four rows), the 44px overlays overlap **12px
      horizontally within each row AND 4px vertically between rows** - 16 overlapping pairs across
      eight buttons, with ten edge samples resolving to a different `.cs-step-btn`. Both Office
      steppers have a pitch that is DECLARED in CSS rather than derived from content height, so
      AC2's midpoint rule gives an exact answer: 26px button + 6px `.cs-edit-stepper` gap = **32px**
      across, 26px + `.office-merit-row{padding:4px 0}` + `.office-merit-list{gap:6px}` = **40px**
      down. The overlay is capped to 32x40. **Recorded as AC2's evidenced exception: AC1 is not
      claimed for `.cs-step-btn` on the Office tab.** The base `.cs-edit-stepper` in
      `suite/status.js` is fine and needed no cap - it puts a `.cs-edit-val` between its two
      buttons, giving a 76px pitch; the shipped test missed the real case because its fixture used
      an invented `.cs-step-row` class that matches no CSS at all. [`suite.css`, `.cs-step-btn`]
- [x] [Codex][Patch] **Collapsed desktop-sidebar tiles get no expansion at all.** Confirmed, with a
      different root cause than Codex proposed: not `#desktop-sidebar{overflow:hidden}` but
      `.sidebar-app-tile`'s **own** `overflow:hidden` (it is there for the label ellipsis), which
      clips the overlay to the tile's own box - trap 1 turned inward, the same shape as
      `.hdr-char-menu-item`, which the dev-story did catch. Measured collapsed: box 40x40, overlay
      computes 44x44, all four edge samples resolve to `.sidebar-app-grid`. In the collapsed strip
      the label is `display:none`, so there is nothing left to clip and the property can be relaxed
      there only. After: 44x44 tappable, 44px pitch, zero overlap, tile renders identically.
      [`suite.css`, collapsed-sidebar block]
- [x] [Verification][Patch] **The same defect is systemic, and it is a functional REGRESSION, not
      just a missed improvement.** Codex found the wrapped `.rank-pill` case (confirmed: with the
      real five clan names at 360px the row wraps at three, giving a 31px row pitch and a 13px
      overlay overlap, with the bottom edge of pills 0-2 resolving to a different `.rank-pill`).
      Mounting realistic sibling runs for every T2 selector found **thirteen more**:
      `.effpool-spec` (17px), `.qf-checkbox-label` (12), `.status-chip-st` (16),
      `.settings-checkbox-row` (26), `.rules-expander-toggle` (16), `.trk-chip-rm` (12),
      `.sh-tracker-info-btn` (18), `.char-picker__chip-remove` (10.7), `.trk-adj.sm` (14),
      `.trk-card-hd` (5), `.rl-sec-hd` (3), `.settings-btn` (2), plus `.rank-pill` itself. Because
      an `::after` is a positioned descendant, it paints ABOVE in-flow content, so the later
      sibling's overlay covers part of the earlier sibling's own visible box: a tap on the label you
      can see activates the control below it. That is strictly worse than the small target it
      replaced. Fixed by dropping the vertical expansion for those thirteen (`min-height:0`, so the
      overlay is exactly the element's own box tall) - provably regression-free, no magic pitch
      constants, horizontal gain retained. **AC1 is not claimed for them**; see the decision item
      below. [`suite.css`, AC2 overlap-correction block]
- [x] [Codex][Patch] **An out-of-scope selector rewrite mangled the downtime label-colour rule.**
      `#t-downtime .qf-radio-label, #t-downtime .qf-checkbox-label{color:var(--txt)}` had become
      `#t-downtime #t-downtime .qf-checkbox-label{...}`, which matches nothing and drops the radio
      selector entirely. Codex's Pass 1 called it a visible colour regression (Medium) and its own
      Pass 2 corrected that to no visible effect (Low); **the Pass 2 correction is right** -
      verified at `components.css:1807` and `:1839`, where both base rules already declare
      `color:var(--txt)`, so the scoped rule was redundant anyway. The rewrite is still unjustified
      out-of-scope churn against the story's own "no control changes colour", so it is reverted
      verbatim. [`suite.css:1702`]
- [x] [Verification][Patch] **`.qf-radio-label` carries a dead `position:relative`.** It is in the
      T2 `position:relative` list but not in the `::after` overlay list, because it takes T3.
      Measured: `getComputedStyle(el).position === 'relative'` with
      `getComputedStyle(el,'::after').content === 'none'`. Harmless (it has no absolutely-positioned
      descendants) but it is a leftover that misreports the technique. Removed from the list.
      [`suite.css`, T2 position:relative list]
- [x] [Codex][Patch] **`.status-summary--toggle` is a live changed target with no probe.** True and
      verified: `suite/status.js:452` adds the class, the diff gives it a `::before` overlay, and
      `GDX3_PROBES` had no entry for it. Probe added. The rule itself turns out to be inert but
      harmless - the summary pips row measures 360x85 at 360px and 900x85 at 1280px, so it is
      already far over the floor. [`tests/desktop-and-css.spec.js`]
- [x] [Codex][Patch] **The sidebar test never hit-tested and never entered the collapsed state.**
      True. Rewritten to run both states, to mount into the real `#desktop-sidebar-nav` (and to use
      the real static `#sb-collapse-btn` node rather than a fixture), and to hit-test five points.
      It is the test that now catches the tile-clipping defect above. Samples are inset 2px rather
      than 1px in this test only, because the collapsed strip is exactly 56px wide and the collapse
      button's overlay ends flush with `#desktop-sidebar`'s clip edge; measured, the button is hit
      continuously from x=12 to x=54 inside a 12..56 overlay.
      [`tests/desktop-and-css.spec.js`]
- [x] [Verification][Patch] **AC2 had no ratchet at all.** Every shipped fixture mounted a single
      control or one short un-wrapped row, which is structurally incapable of seeing the failure
      mode AC2 is about. A `no two sibling hit areas overlap at 360px` test was added, driven by 27
      realistic sibling-run fixtures, asserting both zero pairwise intersection of effective hit
      areas and that every sibling's own four edge midpoints still resolve to itself.
      [`tests/desktop-and-css.spec.js`]

**Decision resolved - Angelus, 2026-08-20.**

- [x] [Verification][Decision] **The thirteen capped selectors above now expand horizontally only
      and do not reach 44px vertically.** The correct fix is a phone-tier row growth (Technique T3),
      which is exactly what gdx-3 already did for `.arc-doc-item`, `.char-picker__option`,
      `.hdr-menu-item` and `.qf-radio-label` when its own hit test caught them. It was not applied
      here in the review round because T3 is a **visible** change on phone and AC4 requires every
      such selector to be named and signed off, and because Angelus cannot smoke-test locally, so a
      thirteen-selector visual change should not land unseen.
      **Resolved: option (b) - a follow-up is authorised** that grows these thirteen rows inside
      `@media (max-width:599px)` to reach a genuine 44px everywhere and remove the exception list.
      Filed as [GitHub issue #1192](https://github.com/angelusvmorningstar/TerraMortis/issues/1192)
      rather than done in this review round, on the same
      reasoning that kept it out of scope here: it is a real, visible phone-layout change across
      thirteen rows that needs a deploy-then-look verification pass, not a blind land. gdx-3 itself
      closes now with the capped 32x40/min-height:0 state as AC2's evidenced exception list, exactly
      as it stands in this diff; the follow-up removes that exception list when it lands, it does not
      block gdx-3 being `done` today. Recorded in `specs/deferred-work.md`.

**Dismissed, with evidence.**

- [x] [Codex][Dismiss] **"The gdx-3 test group is red: 5 passed / 1 failed, `.edit-tab` renders at
      29px but `GDX3_UNCHANGED_AT_DESKTOP` hard-codes 30px."** Not reproducible. The group was run
      twice in this exact tree state before any change was made: **6 passed / 0 failed** both times.
      A Codex-environment artefact (most likely a font that had not loaded, since the assertion is
      font-dependent) or a reviewer transcription error. The underlying observation that a
      font-dependent border-box expectation is brittle is fair, and this round avoided repeating it
      - the new AC2 exception assertions compare against the element's own measured box rather than
      a literal.
- [x] [Codex][Dismiss] **"Pass 1: the downtime selector rewrite removes the radio/checkbox text
      colour, creating a visible regression."** Superseded by Codex's own Pass 2 Low, which is the
      correct reading; verified independently at `components.css:1807` / `:1839`. The malformed
      selector is still reverted (above), but as out-of-scope churn, not as a colour bug.
- [x] [Codex][Dismiss] **"`.svt-btn` is only 24px tall at desktop widths"** as an in-scope defect.
      The measurement is real and was reproduced exactly (1280px: box 62.19x24, overlay 62.19x44,
      both vertical edge samples resolve to `div.sheet-topbar`, because `.svt-toggle{overflow:hidden}`
      swallows it and the T3 fix is scoped to `max-width:599px`). But Codex's own Pass 3a correctly
      qualifies it: **AC1 is written for a 360px viewport**, where T3 does apply and the control
      measures 62x44 (verified), and AC3 constrains desktop visuals rather than desktop hit size.
      Real quality gap, not an AC breach; deferred rather than patched, because both available fixes
      (relaxing the parent's `overflow`, or lifting the `min-height` out of the media query) carry
      visible risk the story explicitly declined to take blind.
- [x] [Codex][Dismiss] **Five dead/unserved selectors carry rules and fixtures** (`.prestige-toggle`,
      `.st-char-dismiss`, `.hdr-profile`, `.hdr-menu-item`, `.feed-toggle`). The factual claim is
      confirmed and is in fact stronger than Codex stated - `.feed-toggle` has no live emitter at
      all, the only grep hits being the substring inside `proc-feed-toggles-row` in
      `public/js/admin/downtime-views.js`, so Codex's "emitted by admin `downtime-views.js`" is a
      false attribution. But the story's own in-scope inventory names all five, its "What this story
      is NOT" assigns dead-rule deletion to gdx-4, and the dev-story already logged
      `.hdr-profile`/`.hdr-menu-item` as gdx-4 candidates. Deleting them here would be the scope
      expansion, not keeping them. Extended to all five in `specs/deferred-work.md`.
- [x] [Codex][Dismiss] **"Checked Tasks 2 and 6 require an admin `.edit-tab` verification against
      nonexistent markup" / "the `.edit-tab` comment claims an admin render site that does not
      exist."** Confirmed as fact (`admin.html` loads `components.css` but emits no `.edit-tab`).
      Cosmetic accuracy of a comment about a rule that is correct either way: `.edit-tab`'s rule
      genuinely does have to live in `components.css`, because `admin.html` does not load
      `suite.css` and the ST editor reachable inside `index.html` renders it. No behaviour or AC
      turns on it. Not worth a patch; noted here so the next reader does not re-derive it.
- [x] [Codex][Dismiss] **"Midpoint-only hit probes do not establish that the full overlay is
      unobstructed"** (Low). Correct as a coverage limitation and correctly self-rated Low: corner
      samples on a rounded box resolve to the parent and would report false failures, which is why
      edge midpoints were chosen. No current layout has a corner-only obstruction; the new
      sibling-overlap test additionally checks pairwise rectangle intersection, which does catch
      diagonal neighbours that a midpoint sweep alone would miss.
- [x] [Codex][Dismiss] **"Real ancestor chain tests replace each component subtree with synthetic
      markup" / "the real-ancestor claim is materially broader than what the helper mounts"** (two
      Mediums, same substance). The factual critique is right and it is the reason two real defects
      got through, so it is not idle - but it is a test-infrastructure limitation rather than a
      defect in this change, and the specific hole it left has been closed by the added
      multi-sibling test. All probe tab ids were verified to exist in `public/index.html` (including
      `#t-edit` and `#t-sheets`), so the `.tab`-and-above chain really is the shipped one. Logged to
      `specs/deferred-work.md` as its own test-infrastructure story.

**Regression suite.** `npx playwright test tests/desktop-and-css.spec.js` -> **36 passed / 12
failed**, against gdx-2's 29/12 baseline. The 12 are the documented pre-existing failures, confirmed
by name: the 11 `setupSuite()`-dependent `desktop-mode --` tests plus
`css-audit -- DT Submission tab has dark-theme input styles`. `desktop-mode -- preference restored
on page load` passes, exactly as gdx-1 established. Zero new failures. The gdx-3 group is 7/7 green
(the six the dev-story added plus the AC2 sibling-overlap test).

**Prove-discriminate, one single change at a time, rest of the change in place.**

| Neutralised | Result |
|---|---|
| `.pref-dot::after` -> `content:none` | AC1 hit-area test red, other 6 green |
| `.pref-dot` back to the T1 44px box + margin | `.pref-dot` box/pitch test red, other 6 green |
| Office `.cs-step-btn` 32x40 cap removed | tappability AND sibling-overlap tests red, other 5 green |
| The `min-height:0` cap block -> `min-height:var(--tap-min)` | sibling-overlap test red with all 13 selectors named, other 6 green |
| `.sidebar-app-tile{overflow:visible}` removed | sidebar test red on the collapsed tile, other 6 green |

The two hygiene reverts (the `#t-downtime` selector and `.qf-radio-label`'s dead
`position:relative`) have no test hook by design - the first restores a rule that was redundant in
the live cascade, the second removes a declaration proven inert by direct
`getComputedStyle` measurement. Both were verified by inspection rather than by a test, and neither
is worth a checked-in assertion.

## Dev Notes

### Existing convention: 44px is already this repo's number, and box growth is already its method

Do not present 44px as a new idea, and check the existing sites before inventing anything:

- `specs/epic-unified-nav.md` NFR2 and UX-DR8: "All interactive tap targets must be >=44px".
- `specs/stories/css-audit/css-4-tap-targets-padding.story.md` (status `review`) - Territory tracker
  and tab padding. Its results are already in the tree.
- `specs/stories/post-game-1/epb-4-sidebar-mobile.story.md`, `.../epc-4-sign-in-tab.story.md`,
  `specs/stories/unified-nav/nav-1-2-four-tab-nav.story.md`, `.../nav-1-3b-more-grid-layout.story.md`,
  `specs/stories/fin.3.checkin-tab.story.md`.

Live sites that already do it, and are the pattern to match for T1:
`components.css:11` (`.char-chip{min-height:44px}`), `components.css:61`
(`.exp-row{min-height:44px}`), `components.css:727` (`.sh-stat-icon{width:44px;height:44px}`),
`suite.css:378` / `:382` / `:479` (`#t-territory` buttons), `suite.css:485`
(`#t-territory .adj{width:44px;height:44px}`), `suite.css:545` (`.feed-reset-btn`), `suite.css:554`
(`.feed-adj`), `suite.css:653` (`.trk-dmg-col{min-width:44px}`), `suite.css:1163` (`.si-pay-sel`),
`suite.css:1173` (`#roll-char-pools .gcp-pool-chip{min-height:44px}`),
`admin-layout.css:150-152`, `admin-spheres.css:48` / `:70`.

**There is no existing hit-area pseudo-element or negative-margin expansion technique in this
codebase.** This was checked, not assumed: `public/css/suite.css` and `public/css/components.css`
contain **zero** `::after{content:''}` / `::before{content:''}` overlay rules used for hit areas
(the only `content:''` in `suite.css` is a decorative badge dot at `:31`), and the only
`position:absolute;inset:...` uses are full-bleed overlays and SVG backdrops. So **Technique T2 below
is new to this repo** and must be introduced as one documented, commented, reusable block rather than
sprinkled per selector.

### The three techniques, and how to choose

Apply in this order of preference. Measure, then choose; do not choose then measure.

**T1 - direct box growth (`min-height` / `min-width` / `width` / `height`).** The repo's existing
convention. Use when the element's box is genuinely invisible, so growing it changes nothing a user
sees: no `background`, no `border`, no `box-shadow`, no `border-radius` that shows, **and** no state
variant (`.on`, `:hover`, `:focus`, `.filled`) that paints one. Cheapest and most robust. Example:
`.pref-dot` has none of those, so T1 is right for it.

**T2 - transparent hit-area pseudo-element.** New to this codebase; introduced by this story. Use
when the visual box must not grow (painted background, visible border, segmented control, a tab with
an `.on` background). Zero visual change at every width, so it satisfies AC3 and AC4 by construction.

```css
/* gdx-3: hit-area expansion. The visible box is unchanged; the ::after is an
   invisible, TAPPABLE overlay centred on it that is never smaller than --tap-min.
   Do not add pointer-events:none - that would defeat the entire point. */
.sel-a, .sel-b { position: relative; }
.sel-a::after, .sel-b::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
}
```

Four traps, all real in this tree:
1. **`overflow:hidden` on an ancestor clips it.** `.svt-toggle` (`suite.css:749`) has
   `overflow:hidden`, which is exactly why `.svt-btn` cannot use T2 (Task 5).
2. **`.tab{overflow-x:hidden}` (`suite.css:75`) clips horizontal expansion at the tab edge**, so a
   control flush to the left or right edge of a tab gains nothing horizontally. `.tab` is also
   `position:absolute;inset:0`, so vertical expansion is fine.
3. **The element must not already have a `::after`.** Grep before adding. If it does, use `::before`,
   or T3. Concrete case in this tree: `.rv2-breakdown summary` already declares
   `::-webkit-details-marker` (`suite.css:2597`) and `::before` (`suite.css:2598`), so `::after` is
   free there but `::before` is not.
4. **The overlay can cover a *sibling* control.** It never steals clicks from its own element (the
   handler is on the element), but it will sit over whatever is next to it. This is AC2's whole
   point: check the neighbour's geometry before applying.

**T3 - phone-scoped box growth inside a media query.** Use only when T1 and T2 are both unsafe: the
box must grow, and the growth is visible. Put it in `@media (max-width: 599px)` (the repo's phone
tier, `suite.css:88` and `suite.css:2003`) or gdx-2's `@media (max-width: 480px)`
(`suite.css:1201`), whichever the measurement justifies. Desktop is untouched by construction, so
AC3 holds; AC4 requires each T3 selector to be named in the Completion Notes. Known T3 cases:
`.tbox` (Task 4) and `.svt-btn` (Task 5). Beware specificity, which bit gdx-2: a
`body.desktop-mode .x` rule (0,2,0) outranks a plain `.x` inside a media query (0,1,0). Check for a
`body.desktop-mode` variant of anything you put in a media query, and match its specificity rather
than reaching for `!important`.

### Viewport emulation gotcha, carried forward from gdx-1 and gdx-2

**`mcp__claude-in-chrome__resize_window` does not actually resize the rendered viewport.** It reports
success while `window.innerWidth` stays at the browser's real width, confirmed directly via
`javascript_tool` in gdx-1's session. **Do not spend time rediscovering this.** Use one of:
- **Playwright's `page.setViewportSize({width:360,height:800})`**, which is real browser-engine
  emulation and is already used by several tests in `desktop-and-css.spec.js`. This is the right tool
  for touch-target sizing, because it lets you read `getBoundingClientRect()` off the real rendered
  DOM at a known width.
- Real Chrome DevTools device toolbar (Ctrl+Shift+M) against a locally served build using the
  `local-test-token` auth bypass, which is how Angelus completed gdx-1's own sweep.

### Port 8080 gotcha, also carried forward

An unrelated `python -m http.server 8080` process, not started by the agent session and observed to
respawn under a new PID after being stopped, has intermittently shadowed port 8080 and served
different content than this project's own `http-server`. It produced a **false-positive green** on
gdx-1's regression test. gdx-1 routed around it by serving on 8081. If an assertion passes
suspiciously early, check what is actually answering on the port before trusting it.

### CSS standards apply in full

Per `specs/project-context.md` section 1 and `specs/architecture/coding-standards.md` -> CSS
Standards: tokens not literals, no bare hex, no inline `style="..."`, reuse before invent, no
`!important`. Use `var(--tap-min)` at every site, never a bare `44px`. Neither
`coding-standards.md` nor `project-context.md` currently documents a touch-target convention - the
44px figure lives only in the epic and story files listed above - so consider adding a one-line
"Touch targets" entry to `coding-standards.md`'s CSS Standards section pointing at `--tap-min`.
That is optional housekeeping, not a task.

### No database involvement

Pure static-asset story. No server route, no schema, no MongoDB collection, no `tm_suite` write is
possible from this change. No data-lock or data-steward check applies.

### Role and tab map, so "player surface" is not guessed

From `public/js/app.js`'s `NAV_ITEMS` (line 405) and `MORE_APPS` (line ~1900):
- **Player tabs:** `dice`, `roll`, `stats`, `skills`, `powers`, `status`, `misc`/`info`, `feeding`,
  `downtime`, `ordeals`, `regency`, `office`, `settings`, `archive`, plus `#t-sheets`.
- **ST-only (`stOnly:true`):** `territory`, `office-approvals`, `tracker`, `combat`, `spheres`.
- **Coordinator-only:** `signin`, `emergency`.
- **Reachable inside `index.html` when `getRole()==='st'`:** the full character editor, via
  `editorRenderSheet`. This is what puts `.edit-tab` and `.dot` on the page at all.

## Files to touch

| File | Nature of change |
|---|---|
| `public/css/theme.css` | **Add** `--tap-min:44px` to the `:root` block only, under a labelled comment. Purely additive. |
| `public/css/suite.css` | One new commented Technique T2 block near the end of the file; T1 and T3 edits in place on the selectors listed below. No `font-size` touched. |
| `public/css/components.css` | `.edit-tab`'s own T2 rule (must reach `admin.html`), plus the in-scope `.qf-*`, `.feed*`, `.pref-dot`, `.form-select`, `.sheet-topbar button`, `.rules-expander-toggle`, `.char-picker__*` and `.list-filter` edits. No `font-size` touched. |
| `tests/desktop-and-css.spec.js` | **Add** tests to the existing `css-audit` group. Do not modify any existing test. |
| `specs/deferred-work.md` | **Add** the three carve-out entries (B1, B2, B3). |

No server files. No schema files. No JS. No HTML. No new files.

### In-scope inventory

Sizes are the derived heights from the audit; `?` means content-sized or no padding declared, so it
**must be measured live before it is classified**. Widths are given only where the rule sets one.

**Group 1 - the issue's own named targets**

| Selector | Location | Now | Owner |
|---|---|---|---|
| `.svt-btn` | `suite.css:750` | 23.2px | `public/index.html` (Sheet/DT toggle) |
| `.edit-tab` | `components.css:174` | 28px | `index.html` ST editor + `admin.html` |
| `.pref-dot` | `components.css:6081` | 38x38 | `tabs/ordeals-view.js` |
| `.tbox` | `suite.css:243` | 34x30 | `suite/sheet.js` |
| `.sh-tracker-info-btn` | `suite.css:2269` | 16x16 | `suite/sheet.js` |
| `.trk-adj` | `suite.css:640` | 28x28 | `game/tracker.js` |
| `.trk-adj.sm` | `suite.css:641` | 24x24 | `game/tracker.js` |
| `.trk-card-hd` | `suite.css:626` | ? | `game/tracker.js` |
| `.trk-chip-rm` | `suite.css:663` | ? | `game/tracker.js` |
| `.trk-cond-sel` | `suite.css:671` | 28.4px | `game/tracker.js` |
| `.trk-cond-add` | `suite.css:675` | 28.4px | `game/tracker.js` |
| `.trk-reset-btn` | `suite.css:621` | 29.2px | `game/tracker.js` |

**Group 2 - Dice / Roll tabs**

| Selector | Location | Now | Owner |
|---|---|---|---|
| `.effpool-seg--rote` | `suite.css:158` | 14.4px | `suite/roll-v2.js`, `suite/roll.js` |
| `.effpool-spec` | `suite.css:150` | 18.4px | same |
| `.resist-sel` | `suite.css:163` | 27.6px | `shared/resist.js`, `index.html` |
| `.attr-carousel-badge` | `suite.css:299` | 21.2px | `suite/sheet.js`, `suite/status.js` |
| `.panel-close` | `suite.css:342` | 30.4px | `game/rules.js`, `index.html` |
| `.panel-section .cp-showall-btn` | `suite.css:356` | ? | `app.js` |
| `.auspex-insight-btn` | `suite.css:362` | 34.4px | `suite/sheet.js` |
| `.rl-sec-hd` | `suite.css:696` | ? | `game/rules.js` |
| `.rules-panel-close` | `suite.css:712` | 24.4px | `game/rules.js` |
| `#btn-contested` | `suite.css:717` | 42.4px | `index.html` |
| `.cr-close` | `suite.css:725` | 29.6px | `game/contested-roll.js` |
| `.cr-type-btn` | `suite.css:727` | 29.2px | `game/contested-roll.js` |
| `.cr-adj` | `suite.css:735` | 32x32 | `game/contested-roll.js` |
| `.gcp-collapse-btn` | `suite.css:841` | ? | `game/char-pools.js` |
| `.gcp-pool-btn` | `suite.css:845` | ? | `game/char-pools.js` |
| `.hist-clr` | `suite.css:217` | 35.6px | `index.html` |
| `.rv2-adj` | `suite.css:2507` | 36x36 | `index.html` |
| `.rv2-again-seg button` | `suite.css:2553` | 30.4px | `index.html` |
| `.rv2-breakdown summary` | `suite.css:2586` | ? | `index.html` |
| `.rv2-stake-btn` | `suite.css:2646` | 33.2px | `suite/roll-v2.js` |
| `.ch-btn` | `suite.css:1969` | 34.4px | `game/challenge-*.js`, `game/humanity-check.js` |

**Group 3 - Sheet tabs**

| Selector | Location | Now | Owner |
|---|---|---|---|
| `.sheet-topbar button` | `components.css:515` | 25.2px | `app.js`, `index.html` |
| `.sheet-char-chip` | `suite.css:1220` | ? | `app.js` |
| `.rules-expander-toggle` | `components.css:786` | ? | `shared/rules-text.js`, `suite/status.js` |

**Group 4 - Status tab**

| Selector | Location | Now | Owner |
|---|---|---|---|
| `.prestige-toggle` | `suite.css:578` | ? | `suite/status.js` |
| `.st-char-dismiss` | `suite.css:590` | ? | `suite/status.js` |
| `.cs-edit-close` | `suite.css:1062` | 22px | `suite/status.js` |
| `.cs-step-btn` | `suite.css:1099` | 28x36 | `suite/status.js`, `tabs/office-tab.js` |
| `.status-chip-st` | `suite.css:1141` | ? | `suite/status.js` |
| `.status-summary--toggle` | `suite.css:2048` | ? | `suite/status.js` |
| `.status-ranking-sel` | `suite.css:2111` | 27.6px | `tabs/status-ranking.js` |
| `.status-ranking-save` | `suite.css:2133` | 29.2px | `tabs/status-ranking.js` |
| `.rank-mode-btn` | `suite.css:2155` | 19.2px | `tabs/status-ranking.js` |
| `.rank-pill` | `suite.css:2169` | 22.4px | `tabs/status-ranking.js` |

**Group 5 - Feeding tab**

| Selector | Location | Now | Owner |
|---|---|---|---|
| `.feed-toggle` | `suite.css:514` | ? | `suite/tracker-feed.js` |
| `.feed-method-card` | `suite.css:520` | ? | `suite/tracker-feed.js` |
| `.feed-confirm-btn` | `components.css:4264` | 39.6px | `tabs/feeding-tab.js` |
| `.feed-reconfirm-btn` | `components.css:4274` | 21.2px | `tabs/feeding-tab.js` |
| `.feeding-defer-btn` | `components.css:4286` | 24.4px | `tabs/feeding-tab.js` |

**Group 6 - Ordeals / XP, Archive, and the shared `.qf-` form primitives**

| Selector | Location | Now | Owner |
|---|---|---|---|
| `.ordeal-card[data-form]` | `suite.css:2289` | ? | `tabs/ordeals-view.js` |
| `.archive-card` | `suite.css:1566` | ? | `tabs/archive-tab.js` |
| `.arc-doc-item` | `suite.css:1576` | ? | `tabs/archive-tab.js` |
| `.qf-section-title` | `components.css:1659` | 20.4px | shared form primitive |
| `.qf-select` | `components.css:1775` | ? | shared form primitive |
| `.qf-radio-label` | `components.css:1786` | 35.6px | shared form primitive |
| `.qf-checkbox-label` | `components.css:1818` | 24.8px | shared form primitive |
| `.qf-btn` | `components.css:1871` | 35.6px | shared form primitive |
| `.qf-back-btn` | `components.css:2098` | ? | shared form primitive |
| `.qf-dynlist-add` | `components.css:2238` | 27.6px | shared form primitive |
| `.qf-dynlist-remove` | `components.css:2207` | ? | shared form primitive |
| `.char-picker__option` | `components.css:5541` | 30.2px | `components/character-picker.js` |
| `.char-picker__chip-remove`, `.char-picker__pill-clear` | `components.css:5485` | ? | same |

**Group 7 - App chrome (header, More grid, Settings, login, banners)**

| Selector | Location | Now | Owner |
|---|---|---|---|
| `.login-crim-btn` | `suite.css:18` | 39.6px | `index.html` |
| `.hdr-icon-wrap.has-menu` | `suite.css:26` | ? | `app.js`, `index.html` |
| `.hdr-char-menu-item` | `suite.css:43` | 31.6px | `app.js` |
| `.hdr-profile` | `suite.css:59` | ? | `app.js` |
| `.hdr-menu-item` | `suite.css:65` | 31.6px | `index.html` |
| `.pnl-confirm-btn` | `suite.css:359` | 42.4px | `app.js` |
| `.import-banner-clr` | `suite.css:564` | ? | `app.js` |
| `.more-app-icon` | `suite.css:1186` | ? | `app.js` |
| `.lifecycle-card` | `suite.css:1429` | ? | `app.js`, `index.html` |
| `.sidebar-app-tile` | `suite.css:1888` | ? | `app.js` |
| `.sidebar-collapse-btn` | `suite.css:1935` | ? | `index.html` |
| `.settings-toggle-btn` | `suite.css:2316` | 34.4px | `app.js` |
| `.settings-btn` | `suite.css:2318` | 39.6px | `app.js` |
| `.settings-checkbox-row` | `suite.css:2322` | 15.6px | `app.js` |
| `.list-filter` | `components.css:99` | 31.6px | `index.html` |
| `.form-select` | `components.css:42` | 32.8px | `tabs/office-tab.js`, `suite/office-approvals.js` |

Line numbers will drift as the file is edited. Anchor on the selector text, not the number.

### Project Structure Notes

- Three CSS files, one existing spec file, one deferred-work log. No new files, no new directories,
  no server change, no JS change.
- `components.css` is shared with `admin.html` and `dt-proto.html`, `suite.css` is loaded by
  `index.html` only. That is why the shared T2 block goes in `suite.css` and only `.edit-tab`'s rule
  goes in `components.css`: `.edit-tab` is the one in-scope selector that deliberately must reach the
  admin app too.
- No conflict with in-flight epic-gdx siblings. gdx-1, gdx-2, gdx-5, gdx-6, gdx-7, gdx-10 and gdx-12
  are done. gdx-4 (CSS cleanup), gdx-8 (roll history) and gdx-9 (single-scroll sheet) are backlog and
  unstoried; gdx-9 will relayout the sheet and should be sequenced after this, not concurrently.
- gdx-2 touched the same two stylesheets and appended a player-scoped floor-override block to the end
  of `suite.css`. Put the new T2 block **after** it, and do not modify it.
- **Commit-message convention**, from `git log --oneline -10`: `feat(gdx-2): rem type scale with 12px
  floor...`, `fix(gdx-1): re-enable pinch-zoom on player app (WCAG 1.4.4)`,
  `docs(gdx-12): add story - ...`. This story's implementation commit is therefore
  `feat(gdx-3): ...`, and it closes GitHub issue #984 - reference it in the message.
  **Do not push, merge or open a PR** unless Angelus's current message says so; see `CLAUDE.md`'s
  hard rule.

### References

- **GitHub issue #984** (source of truth for scope and ACs; no local epic doc exists for Epic GDX -
  `specs/epic-gdx-gameday-experience.md` is referenced by the issue but is not in this tree, and
  `sprint-status.yaml`'s own `epic-gdx` row confirms it). The "Measured baseline" section above
  supersedes its `suite.css:730` line reference and its "18px rating dots" attribution.
- **Issue #984's one comment** (pkalt): folds it from Epic GDX into Epic USF (#1047), saying it
  should target "the unified role-gated app", not `player.html`. **Already fully resolved, do not
  re-litigate.** `player.html` was deleted 2026-07-28 by Epic USF Phase 0 Stage B (commit
  `5fdaa032`, the same commit that satisfied gdx-10), and its surface merged into
  `public/index.html`. The issue's own scope already named `suite.css` and `components.css`, which
  are `index.html`'s stylesheets. **Target surface is `public/index.html`, full stop.**
- `specs/stories/gdx-2-mobile-type-scale.md` - previous Group A story on the same two files. Source
  of the `resize_window` and port-8080 gotchas, the `setupSuite()` avoidance pattern, the
  `desktop-and-css.spec.js` 12-failure baseline, the CSS-Nesting CSSOM walk trap, the
  `body.desktop-mode` specificity trap, and the `.edit-tab` ruling this story re-examines.
- `specs/stories/gdx-1-mobile-zoom.md` - origin of the two gotchas above.
- `specs/stories/css-audit/css-4-tap-targets-padding.story.md` - the earlier 44px pass whose results
  are already live. Do not redo it.
- `specs/epic-unified-nav.md` NFR2 / UX-DR8 - where the 44px figure was first ratified in this repo.
- `specs/epic-dtui-downtime-form-ux-refactor.md` NFR9 and
  `specs/stories/dtui-2-dt-chip-and-chip-grid.story.md` CC6 - the conflicting 32px/36px targets that
  justify carve-out B1.
- `specs/architecture/adr-007-unified-suite-topology.md:395` - sequences #984 after USF Phase 1.
- `public/css/theme.css:174-181` - gdx-2's token block, where `--tap-min` joins.
- `public/js/app.js:405` (`NAV_ITEMS`) and `~1900` (`MORE_APPS`) - the `stOnly` flags that decide
  what "player surface" means.
- `CLAUDE.md` -> "Tests" - the documented pre-existing failure list, including
  `tests/desktop-and-css.spec.js (12)`.

## Testing

**No server-side change, so `server/tests/` (vitest) is not the relevant regression surface.** Do not
run the full vitest suite for this story. The relevant surface is Playwright plus a manual 360px
sweep.

### Task 8 regression test, required mechanism

Add to the **existing `css-audit` group** in `tests/desktop-and-css.spec.js` rather than creating a
new spec file, per `specs/project-context.md`'s reuse-over-duplicate convention and following gdx-1's
and gdx-2's precedent in the same group.

- **Do NOT use `setupSuite()`.** That helper (line 26) waits on `#app` becoming visible and is
  currently broken in this environment; it is the root cause of the 12 pre-existing failures
  `CLAUDE.md` documents for this exact file. Use a bare `await page.goto('/')`.
- **Mount in the real ancestor chain, not on `document.body`.** gdx-2's own review flagged its
  AC3/AC4 helpers for building a synthetic `<div class="tab active">` appended to `document.body`,
  which cannot catch an ancestor's width cap or padding. This story's assertions are geometric, so
  that weakness matters more here. Two better routes, in order:
  1. **Measure the real element.** Many in-scope selectors exist in `index.html`'s **static** markup
     and need no fixture at all: `.svt-btn`, `.edit-tab`, `.edit-back`, `.resist-sel`, `.hist-clr`,
     `.panel-close`, `.rv2-adj`, `.rv2-again-seg button`, `.rv2-breakdown summary`, `#btn-contested`,
     `.sheet-topbar button`, `.login-crim-btn`, `.sidebar-collapse-btn`, `.lifecycle-card`,
     `.list-filter`. Force the owning tab active and read `getBoundingClientRect()` off the real node.
  2. **For JS-rendered controls, mount the fixture inside the real `#t-<tab>` element** that already
     exists in `index.html`, rather than creating a new `<div>` on `body`, so the tab's own padding,
     `overflow-x:hidden` and width cap all apply.
- **Assert the effective hit area, not the visible box.** For each probe, take the larger of
  `el.getBoundingClientRect()` and the used box of the pseudo-element, read via
  `getComputedStyle(el, '::after')`'s `width` / `height` (Chromium returns used px values). Assert
  both dimensions are `>= 44`. A test that only measures the visible box would fail every T2 fix and
  pass every no-op, i.e. it would be exactly backwards.
- **Assert the pseudo-element is tappable.** `getComputedStyle(el,'::after').pointerEvents` must not
  be `none`. Without this, an invisible non-tappable overlay would pass the size assertion while
  fixing nothing.
- **Assert AC3 at 1280px.** For a representative sample, snapshot `getBoundingClientRect()` plus
  computed `padding`, `border-width`, `background-color` and `border-radius`, and assert the values
  the story did not intend to change. The strongest form of this is to run the same measurement
  against `git stash`ed CSS and diff, which is a manual prove-discriminate step rather than a
  checked-in test.
- **Add a token ratchet:** `--tap-min` resolves off `:root` to exactly `44px`, mirroring gdx-2's own
  AC5 test at line 643.
- **CSSOM walk trap, if you write one** (gdx-2 paid a debugging cycle for this): with CSS Nesting, a
  plain `CSSStyleRule` also exposes an empty `cssRules` list, so the obvious
  `if (rule.cssRules) { recurse; continue; }` shape silently skips every style rule in the sheet.
  Read the declaration **first**, then recurse only when `rule.cssRules.length` is non-zero. Also
  recurse into `CSSMediaRule` - `suite.css` has 11 media blocks and `components.css` 8, and this
  story's T3 fixes live inside them.
- **Prove-discriminate per group, not in aggregate.** Revert each technique block in turn and confirm
  the matching tests go red. gdx-2 found one of its nine assertions passed against reverted CSS for a
  `box-sizing` reason it had not anticipated; assume the same can happen here.

### Known pre-existing failures, do not be surprised

`CLAUDE.md` documents `tests/desktop-and-css.spec.js` as having **12 pre-existing failures** at base:
11 `desktop-mode --` tests plus `css-audit -- DT Submission tab has dark-theme input styles`, all
`setupSuite()`-dependent and unrelated to this story. gdx-1 measured **8 passed, 12 failed**; gdx-2
finished at **29 passed, 12 failed**, the same 12 confirmed by name rather than by count. Expect
29/12 as your baseline. Note the subtlety gdx-1 established: only 11 of the 12 `desktop-mode --`
tests actually call `setupSuite()`; `desktop-mode -- preference restored on page load` (line 138) has
independent inline setup and passes. Do not "fix" any of these here.

**The file now takes roughly 16 minutes end to end**, because each of the 11 `setupSuite()` failures
burns its own timeout. Budget for that; do not assume a hang.

### Commands

- Targeted: `npx playwright test tests/desktop-and-css.spec.js`
- **Never run two Playwright invocations concurrently**; they share port 8080 with
  `reuseExistingServer`.
- Chromium may need installing in a fresh checkout: `npx playwright install chromium`.

### Manual sweep (Task 9)

Real Chrome DevTools device toolbar (Ctrl+Shift+M) at **360px**, against a locally served build using
the `local-test-token` auth bypass, or Playwright's `setViewportSize`. Confirm 1280px separately for
AC3, in both themes. Angelus cannot run the app locally to smoke-test, so anything needing a human
look must reach a deployed environment first.

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (bmad-dev-story, headless)

### Debug Log References

- `npx playwright test tests/desktop-and-css.spec.js -g "gdx-3"` - 6/6 green.
- `npx playwright test tests/desktop-and-css.spec.js` - full-file regression, diffed against the
  29-passed/12-failed baseline gdx-2 left behind.
- Prove-discriminate: six separate one-line neutralisations of the shipped CSS (T2 `::after` block,
  T2 `::before` variant, the T3 media block, `.edit-tab`'s own rule in `components.css`,
  `.pref-dot`'s T1, and the `--tap-min` token itself), each run in isolation with the rest of the
  change in place. Every one turned the matching test red. Detail in the Completion Notes.
- Task 9 sweep: a temporary spec dumped every probe's visible box, offset, padding, border, radius,
  background, font-size and margin at 360px and 1280px in BOTH themes, once against the changed CSS
  and once against `git stash push -- public/css`, and the two dumps were diffed. Numbers below.
  The temporary spec and its JSON output were deleted afterwards; nothing extra is left in the tree.

### Completion Notes List

> **Superseded in three places by the 2026-08-20 code review** (see "Review Findings (AI)" above,
> which is the current record): `.pref-dot` is now T2, not T1, so the "AC3's single, deliberate
> exception" line below no longer applies and AC3 holds with no exception at all; the Office
> `.cs-step-btn` overlay is capped to 32x40 as an AC2 evidenced exception; and thirteen further T2
> selectors expand horizontally only, so the "55 selectors" T2 list below overstates what is
> actually delivered vertically. Everything else stands as written.

**Task 1 (AC5).** `--tap-min:44px` added to `public/css/theme.css`'s `:root`, directly under gdx-2's
type-floor block, with a comment naming this story and the px-not-rem rationale (a fingertip is not
text and must not shrink with the OS text-size preference). Not added to `[data-theme="dark"]`. The
two `--fs-floor-*` tokens are untouched.

**Task 2 (AC1-AC4).** One commented "TOUCH TARGETS" block at the very end of `public/css/suite.css`,
after gdx-2's floor-override block and not modifying it. It documents all three techniques and all
four traps, then declares the T2 rule as three comma-separated lists: the selectors that need
`position:relative`, the selectors that are already positioned and only take the overlay, and the
overlay itself. A separate `::before` variant handles the two selectors that already own an
`::after`. No pseudo-element boilerplate is repeated per selector and no class was added in JS.
`.edit-tab`'s own T2 rule lives in `components.css` next to its base rule, because `admin.html` does
not load `suite.css`.

**Which selector took which technique, and why.**

*T1 - direct box growth (1 selector).* `.pref-dot` only. Its box is genuinely invisible (no
background, border, shadow or radius; `.filled` only recolours the 30px glyph), so 44x44 shows
nothing new by itself. The knock-on WOULD show, so it is compensated:
`margin:calc((38px - var(--tap-min)) / 2)` (= -3px) gives the six extra pixels back to the layout.
Measured result: glyph pitch still 46px, first-glyph inset still 19px, preference row still 66px,
adjacent hit areas 2px apart with zero overlap. `.pref-axis-lbl` keeps its 170px hint and the row
still fits 360px, so the phone-tier fallback Task 4 allowed for was not needed. This is the one
selector whose `getBoundingClientRect()` differs on desktop (38 -> 44); everything it renders and
every neighbour is pixel-identical. Recorded as AC3's single, deliberate exception.

*T2 - transparent tappable `::after` overlay (55 selectors).* `.trk-adj`, `.trk-card-hd`,
`.trk-chip-rm`, `.trk-cond-add`, `.trk-reset-btn`, `.sh-tracker-info-btn`, `.effpool-seg--rote`,
`.effpool-spec`, `.attr-carousel-badge`, `.panel-close`, `.panel-section .cp-showall-btn`,
`.auspex-insight-btn`, `.rl-sec-hd`, `#btn-contested`, `.cr-type-btn`, `.gcp-collapse-btn`,
`.hist-clr`, `.rv2-adj`, `.rv2-again-seg button`, `.rv2-breakdown summary`, `.rv2-stake-btn`,
`.ch-btn`, `.sheet-char-chip`, `.cs-edit-close`, `.cs-step-btn`, `.status-chip-st`,
`.status-ranking-save`, `.rank-mode-btn`, `.rank-pill`, `.feed-toggle`, `.feed-method-card`,
`.ordeal-card[data-form]`, `.archive-card`, `.qf-section-title`, `.qf-checkbox-label`, `.qf-btn`,
`.qf-back-btn`, `.qf-dynlist-add`, `.qf-dynlist-remove`, `.char-picker__chip-remove`,
`.char-picker__pill-clear`, `.login-crim-btn`, `.hdr-profile`, `.pnl-confirm-btn`,
`.import-banner-clr`, `.more-app-icon`, `.lifecycle-card`, `.sidebar-app-tile`,
`.sidebar-collapse-btn`, `.settings-toggle-btn`, `.settings-btn`, `.settings-checkbox-row`,
`.sheet-topbar button`, `.rules-expander-toggle`, `.feed-confirm-btn`, `.feed-reconfirm-btn`,
`.feeding-defer-btn`, plus `.edit-tab` in `components.css`. Zero visual change at every width and in
both themes, confirmed by the before/after sweep.

*T2 via `::before` (2 selectors).* `.hdr-icon-wrap.has-menu` and `.status-summary--toggle` already
own an `::after` (the header chevron badge and the phone status-drawer chevron respectively), which
is trap 3. Neither declares a `::before`. `.qf-section-title` is the mirror case - it owns a
`::before` caret and `::after` is free - which is why `::after` is the default variant here.

*T3 - phone-tier box growth, `@media (max-width:599px)` (18 selectors, each listed per AC4).*
- `.tbox` - `.sh-tracker-boxes` is a 5px-gap wrap grid, so a 44px overlay on a 34x30 box overlaps
  its neighbours on BOTH axes and every neighbour is another tracker box. A mis-tap would mark the
  wrong point of damage. Grows to 44x44.
- `.svt-btn` - parent `.svt-toggle` is `overflow:hidden` (trap 1, exactly as the story predicted).
  The parent is left alone so the segmented control's 4px corners still clip. `min-height`.
- `.hdr-char-menu-item` - carries its OWN `overflow:hidden` for the name ellipsis, so its overlay is
  clipped to its own box. `min-height`.
- The six `<select>` controls: `.resist-sel`, `.trk-cond-sel`, `.status-ranking-sel`, `.qf-select`,
  `.list-filter`, `.form-select`. **T2 is silently inert on a form control** - Chromium generates no
  pseudo-element box at all. Measured, not assumed: `getComputedStyle(el,'::after').width` came back
  as the literal string `"100%"` rather than a used px value, and the hit test at the overlay's
  edges resolved to the container. This is a fifth trap the story did not record; it is written into
  the block's comments. Each is 33-43px today, so this is a 1 to 11px growth on phone only.
- The four stacked list rows: `.arc-doc-item`, `.char-picker__option`, `.hdr-menu-item`,
  `.qf-radio-label`. Consecutive siblings on a pitch shorter than 44px, so a T2 overlay reached into
  the row above and below - detected by the hit test, not by inspection (`.arc-doc-item`'s overlap
  was 0.5px and would never have been spotted by eye). That is the exact trade AC2 forbids, and the
  neighbour is another live control, so the row grows instead. `.char-picker__option` and
  `.hdr-menu-item` also become `display:flex;align-items:center` inside the media query, or their
  label would sit against the top of the taller box.
- The five clipped-ancestor cases, each with a DIFFERENT clipping ancestor, all found by hit test:
  `.prestige-toggle` inside `.prestige-board{overflow:hidden}`, `.st-char-dismiss` inside
  `.st-char-row{overflow:hidden}`, `.rules-panel-close` inside `.rules-panel{overflow:hidden}`, and
  `.cr-close` / `.cr-adj` inside `.cr-box{overflow-y:auto}` - a scroll container, which clips its
  overflow just as `hidden` does. All five ancestors are load-bearing (three clip a rounded corner,
  one is the contested-roll sheet's own scroller), so none was relaxed.

*Not touched, because they already pass.* `.gcp-pool-btn` measures 320x64 at 360px. It was
deliberately kept OUT of the T2 list as well: giving it `position:relative` would make it the
containing block for `.gcp-rote-badge`, which today anchors to `.tab` because only the `.gcp-9a`
variant declares `position:relative`. Moving that badge is a visual change gdx-3 has no mandate for.
Logged to `deferred-work.md` as a gdx-4 candidate.

**Task 3 / Task 9 (AC1, AC2, AC3, AC4) - measured before/after, 360px and 1280px, both themes.**
The `git stash` diff is the evidence:

- **1280px, dark AND light: exactly ONE element differs**, `.pref-dot` (38 -> 44 with the
  compensating -3px margin). Every other in-scope selector is byte-identical on width, height,
  offset, padding, border-width, border-radius, background-colour, font-size and margin. AC3 holds.
- **360px, dark AND light: 20 elements differ**, and all 20 are accounted for. Eighteen are the T3
  set above plus `.pref-dot`. The twentieth pair are two INDIRECT consequences that AC4 requires
  naming even though no rule targets them:
  - `.trk-cond-add` 33 -> 44px tall. It is a flex sibling of `.trk-cond-sel` in
    `.trk-cond-row{display:flex}`, so it stretches to match the select's new height. Benign - it
    already matched the select's height before, and still does.
  - `.status-ranking-save` shifts down 5.5px (its own box is unchanged) because
    `.status-ranking-sel` beside it grew and the row re-centres.
- Every selector marked `?` in the story's inventory was measured live rather than guessed. Two of
  the story's own derived figures were slightly out and are corrected here, both harmless: `.svt-btn`
  is **24px** tall, not the derived 23.2px, and `.edit-tab` is **30px** (28px box plus the 2px
  `border-bottom` the `.on` variant carries), not the derived 28px. The regression test asserts the
  measured values.

**Task 4 (AC1, AC2).** `.pref-dot` and `.tbox` as described above. The `.pref-axis-lbl` width check
the story asked for was done: with the compensating margin the five-dot run still occupies 222px, so
the row is unchanged and nothing is clipped. `.tbox`'s wrap behaviour at 360px was re-checked with a
nine-box fixture and the row wraps rather than clipping.

**Task 5 (AC1).** `.svt-btn` takes T3. `.svt-toggle{overflow:hidden}` was verified to be the cause
rather than assumed: the T2 overlay's computed size was correct while the hit test at its edges
resolved to the parent. The parent's `overflow:hidden` was NOT removed, so the segmented control's
`border-radius:4px` corners still clip.

**Task 6 (AC1, AC3).** `.edit-tab` takes T2, in `components.css` so `admin.html` gets it. Verified
at 1280px in both themes that the visible box is still exactly 30px and the header renders
identically. The two adjacent `.edit-tab`s were hit-tested at all four edge midpoints of their
expanded areas and do not overlap (the expansion is vertical only; `.edit-tabs{gap:2px}` is
horizontal). Finding while testing: the overlay is `top:50%/left:50%` + `translate(-50%,-50%)`, so
it centres on the PADDING box, and `.edit-tab.on`'s 2px `border-bottom` puts the border-box centre
1px below the overlay's. The test now computes its sample points from the padding-box centre; the
1px offset is real but immaterial in use.

**Task 7 (AC6).** Carve-outs B1, B2 and B3 recorded in `specs/deferred-work.md` with their selector
lists, measured sizes and reasons, in that file's existing style, plus the two incidental gdx-4
candidates found while measuring (`.gcp-rote-badge`'s missing positioned ancestor, and
`.hdr-profile` / `.hdr-profile-menu` / `.hdr-menu-item` appearing to be dead CSS - a full grep of
`public/` finds no markup emitting them, although `app.js` still queries `#hdr-profile-menu`).

**Task 8 (AC7).** Six tests added to the existing `css-audit` group in
`tests/desktop-and-css.spec.js`. No existing test was modified. They do not use `setupSuite()`.
Mechanism:
1. Fixtures mount inside the REAL `#t-<tab>` element index.html ships, not a synthetic
   `<div class="tab active">` on `document.body` - the specific weakness gdx-2's review flagged in
   its own AC3/AC4 helpers.
2. The assertion is the EFFECTIVE hit area: the larger of the element's own border box and the used
   box of a **generated and tappable** pseudo-element. `pointer-events:none` disqualifies the
   overlay, so an invisible non-tappable overlay cannot pass the size check while fixing nothing.
3. A second test HIT-TESTS the four edge midpoints plus the centre of the intended 44px area with
   `document.elementFromPoint` and requires the result to be the element or a descendant. This is
   what actually proves AC1 and AC2 together: `elementFromPoint` respects ancestor clipping (so a
   T2 overlay swallowed by an `overflow:hidden` parent fails even though its computed size says
   44px) and respects paint order (so an overlay covered by a neighbouring control fails too). Edge
   midpoints rather than corners, deliberately, so a rounded corner cannot report a false failure.
   Every one of the eleven selectors moved from T2 to T3 was moved because THIS test caught it.
4. An AC3 ratchet at 1280px pins the visible box of a representative T1/T2 sample to its authored
   size, so a future "simplification" that swaps an overlay for a `min-height` turns red.
5. A `.pref-dot` layout test pins the pitch, the first-glyph inset and the row height to their
   pre-gdx-3 values and asserts zero overlap between adjacent hit areas.
6. A token ratchet asserting `--tap-min` resolves off `:root` to exactly `44px`.

Three harness traps were paid for and are written into the comments so the next story does not
repeat them: (a) `app.js` paints the login overlay over everything on an unauthenticated boot, so
the shell has to be revealed first; (b) `app.js:1670` removes whichever of `#t-dice` / `#t-roll` the
`tm-use-new-dice-roller` preference is not using, so one of the two is always absent and has to be
recreated inside the real `.tab-wrap`; (c) **index.html ships `#t-stats` with `class="tab active"`
already on it**, and since every `.tab` is `position:absolute;inset:0`, that one tab silently
swallowed the hit test for every probe mounted in an earlier tab. All `.tab.active` are now parked
and restored around the sweep.

**Prove-discriminate (per group, not in aggregate).** Six independent neutralisations, each run with
the rest of the change in place:

| Neutralised | Result |
|---|---|
| T2 `::after` overlay (`content:none`) | 2 failed / 4 passed |
| T2 `::before` variant (`content:none`) | 1 failed / 5 passed |
| T3 media block (breakpoint moved to `max-width:0`) | 2 failed / 4 passed |
| `.edit-tab`'s own rule in `components.css` | 1 failed / 5 passed |
| `.pref-dot`'s T1 (back to 38x38, no margin) | 1 failed / 5 passed |
| `--tap-min` (44px -> 20px) | 3 failed / 3 passed |

The `.pref-dot` revert turning only the AC1 test red, and leaving the layout test green, is correct
and was checked rather than assumed: that test asserts "the layout is unchanged", which is true of
both the original 38px box and the compensated 44px one. That is exactly its job.

### File List

(Updated by the 2026-08-20 code review; see Review Findings above.)

- `public/css/theme.css` - modified. `--tap-min:44px` added to `:root`.
- `public/css/suite.css` - modified. One new "TOUCH TARGETS" block at the end of the file: the T2
  `position:relative` lists, the T2 `::after` overlay, the T2 `::before` variant, and the T3
  `@media (max-width:599px)` block. gdx-2's floor-override block above it is untouched, and no
  `font-size` was touched anywhere. **Review round:** a second "AC2 overlap corrections" block after
  it (the Office `.cs-step-btn` 32x40 cap, the thirteen `min-height:0` caps, and the collapsed
  `.sidebar-app-tile{overflow:visible}` relaxation); `.qf-radio-label` removed from the T2
  `position:relative` list; the mangled `#t-downtime` label-colour selector reverted.
- `public/css/components.css` - modified. `.edit-tab`'s own T2 rule (so `admin.html` gets it), and
  `.pref-dot`. No `font-size` touched. **Review round:** `.pref-dot` moved from T1 (44px box plus a
  compensating negative margin) to T2 (38px box plus a transparent `::after` overlay), which is what
  AC3 literally asks for.
- `tests/desktop-and-css.spec.js` - modified. Six tests added to the existing `css-audit` group. No
  existing test changed. **Review round:** a seventh test (the AC2 sibling-overlap ratchet, 27
  realistic sibling-run fixtures); the sidebar test rewritten to cover both sidebar states, mount in
  the real containers and hit-test; a `.status-summary--toggle` probe added; the `.cs-step-btn`
  probes replaced with the real `office-tab.js` / `status.js` markup; a `GDX3_AC2_EXCEPTIONS` map so
  AC2's evidenced exceptions are machine-readable rather than prose; `.pref-dot`'s own box pinned to
  38x38.
- `specs/deferred-work.md` - modified. Carve-outs B1, B2, B3 plus two gdx-4 candidates. **Review round:** a `## Deferred from: code review of gdx-3-mobile-touch-targets` section with the thirteen capped selectors (the open decision), `.svt-btn`'s desktop hit area, the five dead/unserved selectors, and the synthetic-fixture test-infrastructure gap.
- `specs/architecture/coding-standards.md` - modified. A four-line "Touch targets" entry in the CSS
  Standards section pointing at `--tap-min` and at the technique block. This is the optional
  housekeeping the story's Dev Notes suggested, not a task.
- `specs/stories/sprint-status.yaml` - modified. Status ready-for-dev -> in-progress -> review.
- `specs/stories/gdx-3-mobile-touch-targets.md` - this file.

No server file, no schema, no JS, no HTML, no new file in the shipped tree.

## Change Log

| Date | Change |
|---|---|
| 2026-08-20 | bmad-create-story: story created from GitHub issue #984. Full `cursor:pointer` audit of both player stylesheets (218 rules, 24 already >=44px, 140 below, 54 undeterminable), each mapped to its emitting module and to the `stOnly` tab map. Two of the issue's four named targets corrected: `suite.css:730` is really `:750`, and the "18px tappable rating dots" at `components.css:48` are ST-editor-only, with the real player rating dot being `.pref-dot` at 38x38. "Tracker tap zones" resolved to `.tbox` (34x30, player sheet) plus the ST Tracker tab's `.trk-adj` (28x28). `.edit-tab` scoped IN with reasoning, `.dot` scoped OUT with row-pitch-overlap evidence. Three carve-outs defined (DTUI's conflicting 32/36px NFR, other ST-only surfaces, the ST editor section). Status ready-for-dev. |
| 2026-08-20 | bmad-dev-story: implemented, Tasks 1 to 9 all done, Status ready-for-dev -> review. `--tap-min:44px` added to `theme.css` `:root` (px not rem, per AC5). One commented "TOUCH TARGETS" technique block at the end of `suite.css` introducing Technique T2 to this codebase; `.edit-tab`'s own T2 rule in `components.css` so `admin.html` gets it. Final split: 1 selector on T1 (`.pref-dot`, with a compensating negative margin so its rendered layout is pixel-identical), 57 on T2 (55 `::after` + 2 `::before` for the two selectors that already own an `::after`), 18 on T3. Eleven of those 18 were moved from T2 to T3 **because the new hit test caught them**, not by inspection: six `<select>` controls (Chromium generates no pseudo-element box on a form control at all - a fifth trap the story had not recorded), four stacked list rows whose overlays reached into their neighbours (`.arc-doc-item`'s overlap was 0.5px), and five clipped-ancestor cases with five different clipping ancestors. `.gcp-pool-btn` kept out of T2 entirely: it already measures 320x64, and `position:relative` would have relocated `.gcp-rote-badge`. 6 new tests in the existing `css-audit` group, all 6 green, each of the six technique groups prove-discriminated separately. Full-file regression 35 passed / 12 failed, i.e. gdx-2's 29 plus these 6, with the same documented 12 pre-existing failures and zero regressions. Before/after `git stash` sweep at 360px and 1280px in both themes: exactly ONE element differs on desktop (`.pref-dot`, AC3's single documented exception) and 20 on phone, all named. Two of the story's own derived figures corrected by live measurement: `.svt-btn` is 24px not 23.2px, `.edit-tab` is 30px not 28px. Carve-outs B1/B2/B3 logged to `deferred-work.md` with two incidental gdx-4 candidates. |
| 2026-08-20 | code review (EXTERNAL, Codex 3-pass adversarial, then independently re-verified in headless Chromium; every finding treated as an unverified claim). 5 High / 8 Medium / 7 Low returned; 9 patched, 1 decision-needed, 7 dismissed with evidence. `.pref-dot` moved T1 -> T2, so its own box is back to 38x38 and AC3 holds literally with no exception at all. The two Office `.cs-step-btn` steppers capped to 32x40 per AC2's midpoint rule (12px horizontal and 4px vertical overlap measured on the real merit rows, ten edge samples resolving to the wrong button). `.sidebar-app-tile`'s OWN `overflow:hidden` relaxed in the collapsed strip, where it was swallowing the entire overlay. The round's own biggest find, beyond anything Codex saw: the T2 centred overlay is a functional REGRESSION on any stacked or wrapped sibling run, because an `::after` paints above in-flow content, so the later sibling's overlay covers part of the earlier sibling's visible box and a tap on the row you can see fires the row below it. Codex found one case (`.rank-pill`); realistic sibling runs found thirteen more, overlaps 2px to 26px. Regression removed by dropping the vertical expansion for all thirteen; AC1 is not claimed for them and the T3 alternative is an open decision for Angelus. Out-of-scope `#t-downtime` selector mangling reverted; `.qf-radio-label`'s dead `position:relative` removed. New checked-in AC2 sibling-overlap ratchet plus a collapsed-state sidebar hit test; gdx-3 group 7/7, full file 36 passed / 12 failed against gdx-2's 29/12 baseline with the same twelve documented failures confirmed by name and zero new. Five patches each prove-discriminated by a single-change revert. Status stays `review` on the one open decision. |
