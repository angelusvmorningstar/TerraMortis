# Story gdx.2: rem type scale with a 12px floor, plus surgical narrow-phone fixes

Status: done

## Story

As a player using the app on a phone,
I want text that never renders smaller than a legible floor and that grows when I raise my
operating system's text size,
so that I can actually read the sheet, roll and downtime screens without squinting or zooming, and
so that nothing on any tab is clipped off the edge of a 360px screen where I cannot reach it.

## Why this story exists

GitHub issue #983, Epic GDX Group A (mobile hygiene, independent of Groups B/C). Two defects, one
root cause:

1. **Every font size in the player app is an absolute `px` value.** Absolute `px` font sizes ignore
   the browser and operating system text-scaling preference entirely, so a player who has set a
   larger text size on their phone gets no benefit anywhere in this app. Converting to `rem` makes
   every size compose with the root size the user controls.
2. **A large share of those sizes are below a legible floor.** 491 `font-size` declarations across
   `suite.css` and `components.css` are under 12px, including sizes as small as 7px and 8px.

Verified during story creation, and this substantially reframes the issue's own AC2 (see AC2 below):
`suite.css:8` sets `html,body{overflow:hidden;max-width:100vw}` and `suite.css:75` sets
`.tab{overflow-y:auto;overflow-x:hidden}`. A horizontal *page* scroll is therefore structurally
impossible in this app. When content is too wide for a 360px viewport it does not produce a scroll
bar, it silently **clips** and becomes unreachable. That is exactly the failure mode already filed as
issue #1191. So the honest form of "no horizontal page scroll at 360px" here is "nothing is clipped
or unreachable at 360px".

## Measured baseline (verified during story creation, 2026-08-20)

Do not re-derive these. Issue #983's own figures are stale and undercounted; these are the real
current numbers, and the dev agent should treat any large divergence as a sign the tree moved.

| Metric | `suite.css` | `components.css` | `theme.css` | Total |
|---|---|---|---|---|
| Lines | 2613 | 6131 | 288 | |
| `font-size:<n>px` declarations | 494 | 583 | 1 | **1078** |
| of those, below 12px | 219 | 272 | 0 | **491** |
| `font-size` already in `rem` | 0 | 20 | 0 | 20 |

Sub-floor declarations in `components.css` by section (this file is **shared with `admin.html`**, see
"Shared-stylesheet constraint" below):

| `components.css` line range | Section | Sub-floor count | Player surface? |
|---|---|---|---|
| 1 to 142 | Shared components (char cards, form elements, dot steppers, expandable rows, merit breakdown) | 20 | Yes |
| 143 to 511 | `EDITOR — Editor-specific styles` | 111 | **No, `admin.html` only** |
| 512 to 979 | `SHEET VIEW` | 72 | Yes |
| 980 to 1260 | Parchment theme overrides | 0 | n/a |
| 1261 to 1421 | Long-form markdown / `.reading-pane` | 0 | n/a |
| 1422 to end | `DOWNTIME FORM` (its own header comment says "shared between player.html and index.html") | 69 | Yes |

**Player-surface sub-floor total = 219 (`suite.css`) + 161 (`components.css`) = 380.**
**Admin-editor carve-out = 111.**

Root font size: **no `html{font-size:...}` override exists anywhere in `public/css/`** (verified). So
`1rem` is the browser default 16px and the conversion divisor is 16. The one existing size-ish token
is `:root{--reading-font-size:15px}` at `suite.css:2293`, which is a pre-existing standards deviation
(a `:root` declaration living outside `theme.css`); do not copy that placement, and do not touch it.

## What this story is NOT

- **Not a design-led type scale.** This story defines exactly **two** semantic size tokens, the two
  floors, because the floors are what the acceptance criteria are about and what the regression test
  needs a greppable hook for. Every other size converts to a plain `rem` literal. Inventing a full
  16-step `--fs-*` ladder is a design decision, not a mechanical migration; it belongs to
  **gdx-4-mobile-css-cleanup** or its own design story.
- **Not a touch-target story.** Button and tap-target sizing is **gdx-3-mobile-touch-targets**. Do
  not change `min-height`, `width`, `height` or padding on interactive elements here except where a
  360px sweep proves a specific rule overflows, and then only that rule.
- **Not a general mobile CSS cleanup.** Dead rules, duplicated chrome and selector consolidation are
  **gdx-4-mobile-css-cleanup**.
- **Not a single-scroll sheet relayout.** That is **gdx-9-single-scroll-sheet** (Group C).
- **Not a blanket new breakpoint tier.** See AC4: `@media (max-width: 480px)` is added **only** to
  the specific rules a 360px sweep proves broken. The established phone tier in this repo is
  `max-width: 599px` (`suite.css:88`, `suite.css:2003`), and where that tier already suffices, use
  it rather than adding a second one.
- **NOT raising the floor on the `components.css` editor section (lines 143 to 511, 111
  declarations).** Those selectors render only on `admin.html`'s character editor, which is outside
  Epic GDX's player-facing remit, and several are dense grids deliberately designed around 9px and
  10px labels. They **do** get the mechanical `px` to `rem` conversion (visually identical at the
  default root size, and it makes the admin app OS-scalable as a free side benefit), but their
  *values* are left alone. Carved out for a future admin-side story.
- **Not touching `admin-layout.css`, `admin-shared.css`, `admin-spheres.css` or `layout.css`.**
  `layout.css` is 18 lines and contains no `font-size` at all; the three admin sheets are not loaded
  by `index.html`.
- **Not touching `.tab`'s `overflow-x:hidden` or `html,body{overflow:hidden}`.** Those are the app's
  deliberate fixed-viewport shell. The fix for clipping is to make the *offending child* scroll or
  fit, never to let the page scroll horizontally.

## Scoping call on GitHub issue #1191 (`.shortcut-row` clips on narrow phones)

**Decision: explicitly IN SCOPE for this story, as Task 5. This story closes #1191.**

This was checked against the real CSS rather than assumed, and the "it gets fixed as a free side
effect" theory is **false**, so the dev agent must write the fix deliberately:

- `.shortcut-row` is `display:flex;gap:8px` (`suite.css:120`) with no overflow handling.
- `.sc-btn` is `flex:1` (`suite.css:121`), i.e. `flex:1 1 0%`. A flex item's default `min-width:auto`
  prevents it shrinking below its min-content width, so `flex-shrink` cannot rescue it. Min-content
  here is driven by `.sc-label` (uppercase, `.14em` letter-spacing, 12px) plus `.sc-btn`'s `0 14px`
  padding. With the fourth button present (`#sc-auspex`, shown when the loaded character has Auspex),
  the row exceeds the 320px of content width available inside `#t-dice`'s `20px` side padding at a
  360px viewport, and `.tab{overflow-x:hidden}` clips it silently.
- Neither half of this story's own work changes that. The `rem` conversion is visually neutral at the
  default root size, and the floor raise does not apply, because `.sc-label` is already 12px and
  `.sc-btn` is 13px, both at or above the floor.

It is nonetheless in scope because **AC2 cannot honestly be signed off while `.shortcut-row` clips**,
and because the fix is the identical three-property shape as the `.xpl-table` overflow work that
issue #983 already mandates. Both markup instances (`public/index.html:156` and `:241`) share the one
CSS rule, so a single rule change covers both.

## Acceptance Criteria

1. **No `font-size` in `public/css/suite.css` or `public/css/components.css` is expressed in
   absolute `px`.** All 1078 declarations are `rem`, using divisor 16 (verified: no root
   `html{font-size}` override exists). Values map as `9px -> 0.5625rem`, `10px -> 0.625rem`,
   `12px -> 0.75rem`, `13px -> 0.8125rem`, `15px -> 0.9375rem`, `18px -> 1.125rem`, and so on.
   Non-`font-size` `px` values (padding, border, radius, widths, `gap`) are **unchanged**; this story
   converts type only.

2. **No text rendered on a player surface (`public/index.html`) computes below the floor.** Floor is
   `0.75rem` (12px-equivalent) for body text, values, table cells and button text, and `0.6875rem`
   (11px-equivalent) for badges, chips, pills and uppercase micro-labels. Both floors are expressed
   through the two new tokens from AC5, never as bare `rem` literals at a raised site, so the floor
   stays greppable. This covers all 380 player-surface sub-floor declarations
   (219 in `suite.css`, 161 in `components.css`). The 111 declarations in `components.css` lines 143
   to 511 (`EDITOR` section, `admin.html` only) are the documented carve-out and keep their current
   values.

3. **Nothing is clipped or unreachable at a 360px viewport on any player tab.** Note the reframing:
   `html,body{overflow:hidden;max-width:100vw}` (`suite.css:8`) and `.tab{overflow-x:hidden}`
   (`suite.css:75`) make a horizontal *page* scroll structurally impossible, so issue #983's literal
   "no horizontal page scroll" wording is vacuously true and is not the real test. The real test is
   reachability. Specifically, and each verified at 360px:
   - `.shortcut-row` (`suite.css:120`) scrolls horizontally rather than clipping its fourth button,
     using the same property set as `#bnav` (`suite.css:86`) and `.gcp-stats` (`suite.css:824`):
     `overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none`. Closes #1191.
   - `.xpl-table` (`suite.css:2204`, **not** 2438 to 2441 as issue #983 states; that reference is
     stale) is reachable at 360px via an `overflow-x:auto` scroll container on its wrapper, matching
     the same pattern. `.xpl-panel` at `suite.css:2200` is the natural wrapper. Do not add
     `overflow-x` directly to a `border-collapse` table element; put it on the block wrapper.
   - `.npcr-modal` (`components.css:5328`) has `min-width:360px` with a 1px border, so it exceeds a
     360px viewport. Fix so it fits (its own `width:90%` and `max-width:520px` already do the right
     thing; the `min-width` is the offender).
   - Tabs to sweep, at minimum: Dice/Roll (`#t-dice`, `#t-roll`), Sheet (`#t-stats`, `#t-skills`,
     `#t-powers`, `#t-sheets`), Status (`#t-status`), Downtime (`#t-downtime`), More (`#t-more`),
     Ordeals/XP (`#t-ordeals`, home of `.xpl-table`).

4. **A `@media (max-width: 480px)` block exists only where a 360px sweep proves it necessary.** Not
   a blanket tier. Reuse the established `@media (max-width: 599px)` tier
   (`suite.css:88`, `suite.css:2003`) wherever it already suffices. Known candidates found during
   story creation that the sweep should check first, none yet confirmed broken:
   `.more-section-grid` (`suite.css:1172`, `repeat(4,1fr)`), `.sheet-picker-grid`
   (`suite.css:1195`, `repeat(4,1fr)`), `.prestige-row` (`suite.css:571`,
   `24px 1fr 60px 60px 60px`, leaving the `1fr` roughly 68px at 360px), `.sidebar-app-grid`
   (`suite.css:1835`, `repeat(3,1fr)`). If the sweep
   shows a candidate is fine at 360px, leave it alone and say so in the Completion Notes.

5. **Two floor tokens are declared in `public/css/theme.css`'s `:root` block**, per this project's
   token-source-of-truth rule, and are used at every raised site:
   - `--fs-floor-body: 0.75rem;` (12px-equivalent)
   - `--fs-floor-micro: 0.6875rem;` (11px-equivalent)
   They go in `theme.css` because that is the declared token SSOT
   (`specs/architecture/coding-standards.md` -> CSS Standards, and `specs/project-context.md` §1).
   `theme.css` currently contains **no** type-scale tokens at all, so this is purely additive and
   cannot regress an existing consumer. Add them under a clearly labelled comment. They are
   theme-invariant, so they belong in `:root` only, **not** duplicated in the `[data-theme="dark"]`
   block.

6. **A checked-in regression test enforces AC1 and AC2 and ratchets against reintroduction.** See
   the Testing section for the exact mechanism and the two pre-existing-failure traps.

## Tasks / Subtasks

- [x] **Task 1 (AC5)** - `public/css/theme.css`: add `--fs-floor-body` and `--fs-floor-micro` to the
  `:root` block with a short comment naming this story and the 16px divisor rationale. Do **not**
  add them to `[data-theme="dark"]`. Do not touch `--reading-font-size` in `suite.css`.

- [x] **Task 2 (AC1, AC2)** - `public/css/suite.css`: convert all 494 `font-size` px declarations to
  `rem` (divisor 16), and raise all 219 sub-floor declarations to the appropriate token. Every value
  in this file is player-facing, so there is no carve-out here.
  - [x] Classify each sub-floor site as body or micro before raising it. Rule of thumb, applied to
        this codebase's own conventions: anything with `text-transform:uppercase` plus a
        `letter-spacing` of `.06em` or more is a micro-label or chip and takes `--fs-floor-micro`
        (verified examples, all currently sub-floor: `.nbtn` at `:96` is 11px, `.city-panel-title`
        at `:1228` is 11px, `.xpl-col-head` at `:2203` is 11px, `.rv2-stepper-lbl` at `:2439` is
        10px). Prose, values, table cells and button text take `--fs-floor-body` (verified examples:
        `.xpl-paid` at `:2210` is 9px, `.xpl-dim` at `:2211` is 11px). Note that `.slabel` at `:110`
        is already 13px and is **not** a sub-floor site despite matching the uppercase-plus-tracking
        shape; classify by measured value first, then by role.
  - [x] Convert `font-size` **only**. Leave every other `px` value in the file untouched.
  - [x] Include `font-size` declarations nested inside `@media` blocks (there are 11 media blocks in
        this file) and inside `body.desktop-mode` overrides. Do not miss them.

- [x] **Task 3 (AC1, AC2)** - `public/css/components.css`: convert all 583 `font-size` px
  declarations to `rem`, including the editor section. Raise the floor on the **161 player-surface**
  sub-floor declarations only, i.e. line ranges 1 to 142, 512 to 979 and 1422 to end per the table
  above.
  - [x] **Leave the 111 sub-floor values in lines 143 to 511 (`EDITOR` section) at their current
        size**, converted to `rem` but not raised. This is a deliberate carve-out, not an oversight.
  - [x] Line numbers will shift as you edit. Anchor on the section header comments
        (`/* ══ ... EDITOR — Editor-specific styles ══ */` at 144 and
        `/* ══ ... DOWNTIME FORM ... ══ */` at 1422), not on the numbers.
  - [x] Beware `sh-` prefixed selectors: they appear in **both** the editor section and the shared
        sheet section, so a prefix-based find/replace will cross the carve-out boundary. Work by
        line region, not by selector prefix.
  - [x] The 20 `font-size` declarations already in `rem` and the 3 already using `var()` need no
        conversion; check they are not sub-floor.

- [x] **Task 4 (AC3)** - `.xpl-table` overflow. Add `overflow-x:auto; -webkit-overflow-scrolling:touch`
  to `.xpl-panel` (`suite.css:2200`), the block wrapper, and confirm `.xpl-table{width:100%}` still
  behaves. Do not put `overflow-x` on the `border-collapse` table itself.

- [x] **Task 5 (AC3, closes #1191)** - `.shortcut-row` overflow. Add
  `overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none` to `suite.css:120`,
  copying the exact property set already used by `#bnav` (`:86`) and `.gcp-stats` (`:824`). Per
  #1191's own AC, do **not** invent a new shared "horizontal scroll row" component class; no such
  class exists in `components.css` today, and the two neighbouring precedents both declare the
  properties inline on their own rule. One rule change covers both markup instances
  (`public/index.html:156` and `:241`).

- [x] **Task 6 (AC3)** - `.npcr-modal` (`components.css:5328`): its `min-width:360px` plus a 1px
  border exceeds a 360px viewport. Its own `width:90%` and `max-width:520px` already size it
  correctly, so the `min-width` is the offender. Prefer `min-width:min(360px, 100%)` over deleting
  the rule outright, so the desktop intent is preserved.

- [x] **Task 7 (AC6)** - Regression test. Add to the existing `css-audit` group in
  `tests/desktop-and-css.spec.js`. See the Testing section for the required mechanism, the
  `setupSuite()` trap, and the `@media` recursion trap. Prove-discriminate it: confirm it goes red
  against the pre-change CSS and green after.

- [x] **Task 8 (AC3, AC4)** - Manual/live 360px sweep across every tab listed in AC3, matching this
  project's established manual-verification convention (gdx-1's Task 3, gdx-11's and gdx-12's own
  Task 8s). **Read the viewport-emulation gotcha in Dev Notes before starting this task.**
  - [x] Confirm Tasks 4, 5 and 6 actually resolved their three targets at 360px, rather than
        assuming the CSS change was sufficient.
  - [x] Check each AC4 candidate (`.more-section-grid`, `.sheet-picker-grid`, `.prestige-row`,
        `.sidebar-app-grid`) and **apply a `@media (max-width: 480px)` rule only to those the sweep
        proves broken.** Record in the Completion Notes which candidates were checked and which
        needed no fix, so a later reader can tell "verified fine" from "not looked at".
  - [x] If the sweep finds a *new* offender not listed in AC3 or AC4, apply the fix if it is small
        and clearly this story's shape (an overflow or a width constraint). If it is a layout
        rework, stop and log it to `specs/deferred-work.md` or a GitHub issue rather than
        scope-creeping, following gdx-1's own handling of #1191.
  - [x] Confirm the two floor tokens actually take effect under OS text scaling (AC2's real point):
        set the browser's base font size above the default and check that player text grows
        proportionally rather than staying pinned.

### Review Findings (AI)

Internal 3-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor), 2026-08-20. Edge Case
Hunter and Acceptance Auditor both independently re-measured against the live app (headless Chromium
against the real `/` page, and a real spec run) rather than reasoning from the diff alone; findings
below are triaged accordingly, with corroborating measurement preferred over uncorroborated
speculation.

- [x] [Review][Decision] The player-scoped override block in `suite.css` raises 22 selector names
      wherever they occur, not just where they render for a *player reading a sheet*. Because
      `public/index.html` also hosts the full ST editor (`editorRenderSheet` is called into it when
      `getRole()==='st'`), the same 22 selectors are enlarged when an ST is actively editing via
      `index.html` too, which works against the editor carve-out's own point (keep editor UI dense).
      Separately, `.edit-tab`/`.edit-dirty` (ST tab chrome, literally in `index.html`'s static markup,
      10px) were not raised despite being reachable on the same page by the same reasoning used to
      justify raising the 22.
      **Resolved by Angelus 2026-08-20: leave the override as shipped.** The ST losing a little
      density in that one in-app editing view is an acceptable, minor cosmetic trade-off against
      correctly flooring player-facing text, not worth the extra scoping complexity. `.edit-tab`/
      `.edit-dirty` stay unraised — they are ST-only tooling chrome a player never sees, not player
      content, so AC2's floor doesn't need to reach them.
- [x] [Review][Patch] Issue #1191 is not actually fixed — `#sc-auspex` (the fourth shortcut button) is
      measured 0px visible at 320/360/375px even after Task 5's change; `.shortcut-row` became a
      scroll container but `.sc-btn` still cannot shrink (`flex:1` with default `min-width:auto`,
      exactly as the code's own comment already diagnoses) and the scrollbar is hidden with no visible
      affordance, so nothing brings the fourth button into view. Fix: add `min-width:0` to `.sc-btn`
      (the root-cause fix the comment already names) so all four buttons fit without scrolling; also
      add the missing `.shortcut-row::-webkit-scrollbar{display:none}` for the cross-browser parity
      the comment claims but doesn't implement, as a safety net for any residual overflow.
      [suite.css:120-124]
- [x] [Review][Patch] `body.desktop-mode .sheet-picker-grid` (specificity 0,2,0) outranks the new
      `@media (max-width:480px) .sheet-picker-grid` rule (0,1,0), so a narrow viewport with desktop
      mode toggled on keeps 6 columns and reproduces the exact silent-clip failure mode (measured:
      704px scrollWidth vs 360px clientWidth, 343.9px worst-child overflow) that this story exists to
      remove. Fix: raise the media-query rule's specificity to also beat the desktop-mode variant.
      [suite.css:1201, 1233]
- [x] [Review][Patch] `.pt-skill-tag` (10px, `components.css:430`) renders on the player-facing Archive
      tab (`public/js/tabs/archive-tab.js` imports and calls the editor's whole `renderSheet`, whose
      view-mode `_renderPT` branch emits it) but was not traced into the 22-selector override — the
      method used to find the 22 (checking `suite/sheet.js`'s direct `shRender*` imports) missed this
      second, wider render path via `archive-tab.js`. Add `.pt-skill-tag` to the player-scoped override
      block alongside the other 22. [suite.css, end of file]
- [x] [Review][Patch] The AC2 ratchet test's carve-out allowlist matches on selector text only, not on
      file/`href` — so if the player-scoped override block were deleted entirely, every existing test
      would still pass and the player sheet would silently revert to 9-10px text. Make the allowlist
      href-aware (valid only when `href` ends `/css/components.css`) and add a positive assertion that
      the override selectors resolve to a floor token when queried against the real player DOM.
      [tests/desktop-and-css.spec.js]
- [x] [Review][Patch] The AC2 ratchet only checks the 0.6875rem micro floor (`< 11px`); nothing checks
      the 0.75rem body floor. Current classification is correct (independently audited against the
      story's own uppercase+`.06em` heuristic), but a future body-role declaration authored below
      0.75rem would pass unnoticed. Add a body-floor assertion alongside the existing micro-floor one.
      [tests/desktop-and-css.spec.js]
- [x] [Review][Patch] `gdx2HasAbsolutePx` strips only one leading function name before matching
      `^([\d.]+)px$`, so a `px` value nested inside a second function (e.g.
      `clamp(1rem, calc(1vw + 4px), 2rem)`) is invisible to the AC1 ratchet. No current declaration
      trips this, but it's a latent hole in the exact test meant to prevent regression. Harden the
      match to find any bare `px` token anywhere in the value, not just as the whole top-level term.
      [tests/desktop-and-css.spec.js]
- [x] [Review][Patch] `.more-app-label` overflows its `.more-app-icon` box by 1.2-6.2px at 320-360px
      with the real `MORE_APPS` label set (measured live; "Emergency" is the worst case and is absent
      from the test's own fixture data, which is why the ratchet didn't catch it). The label has no
      `overflow-wrap`/`word-break`, so an unbroken long word can't wrap and spills past the card edge.
      Add `overflow-wrap:break-word` (or `word-break:break-word`) to `.more-app-label`. [suite.css:1191]

- [x] [Review][Defer] Pre-existing inline `style="font-size:Npx"` sites bypass the AC1 audit by
      construction (it only scans the two stylesheets) — `public/js/suite/territory.js:368` (12px),
      `public/js/tabs/downtime-form.js:5662` (12px), `public/js/app.js:2034` (11px). Pre-existing,
      not introduced by this diff, and already against this repo's own "no inline `style=`" CSS
      convention independent of gdx-2. Worth a future sweep (candidate: gdx-4 mobile CSS cleanup).
      — deferred, pre-existing
- [x] [Review][Defer] `.npcr-modal`'s `min-width:min(360px,100%)` fix (exactly what Task 6
      prescribed) makes the modal sit flush to both screen edges with zero gutter below ~400px. This
      satisfies AC3's literal wording (nothing clipped, fits at 360px and narrower) — it's a cosmetic
      polish gap, not a functional violation, since the story's own task named this exact fix. Log for
      a future pass if breathing-room around the modal matters (e.g. padding on the overlay).
      — deferred, real but satisfies the literal AC as the story specified it
- [x] [Review][Defer] 200 literal `0.75rem` and 42 literal `0.6875rem` `font-size` values coexist
      with `var(--fs-floor-body)`/`var(--fs-floor-micro)` at the same values (only *raised*
      declarations were tokenised; declarations already at 12px/11px pre-conversion were left as
      plain rem literals). Retuning either floor token later would not move these. Deliberately not
      swept here — collapsing them requires judging, site by site, whether "already 12px" was
      coincidence or the same floor concept, which is a design call the story's own AC didn't ask for.
      — deferred, design-consistency judgement call, not this story's AC
- [x] [Review][Defer] `.cc-alert.yellow{font-size:var(--fs-floor-body)}` is now identical to its own
      base rule `.cc-alert{...font-size:var(--fs-floor-body)}`, making the modifier's font-size
      declaration dead. `.cc-alert` also has no live reference anywhere in `public/js/` (likely
      already-dead CSS predating this story). Candidate for gdx-4 (mobile CSS cleanup).
      — deferred, dead code, candidate for gdx-4
- [x] [Review][Defer] The AC2 carve-out allowlist has two entries keyed to Chromium's CSSOM selector
      serialisation (`:nth-child(2n+1)` for authored `:nth-child(odd)`; normalised whitespace/quoting
      for an attribute selector) rather than the authored source text. Harmless while Playwright is
      Chromium-only in this repo (per CLAUDE.md); would break for a spurious reason if a
      firefox/webkit project were ever added. — deferred, latent, current config is Chromium-only
- [x] [Review][Defer] The AC3/AC4 Playwright helpers build a synthetic `<div class="tab active">`
      appended to `document.body` rather than mounting inside the real `#app`/tab ancestor chain, so
      an ancestor's own width cap or padding wouldn't be caught by these tests. The specific fixes this
      story shipped were independently re-verified against the real live page during this review
      (Edge Case Hunter), so this is a test-methodology hardening item for a future pass, not a live
      gap right now. — deferred, test-quality hardening, not blocking

**Dismissed (not carried forward):** the `--reading-font-size` custom-property token conversion
(`0.9375rem`) was checked against `public/js/app.js:1973-1993` — the reading-size stepper always
writes literal `'Npx'` strings from its own stored setting and never reads the CSS custom property's
computed value back, so the unit mix across the token's two declaration sites is cosmetically odd but
not a functional bug; the body/micro token categorisation was independently re-audited selector by
selector against the story's own uppercase+`.06em` heuristic and found correct (a Blind Hunter
objection applied a different, unstated heuristic); the `overflow-x:auto` → computed `overflow-y:auto`
side effect on `.shortcut-row`/`.xpl-panel` matches an existing app-wide pattern (`#bnav` already does
the same) and carries the same low real-world risk; several Blind-Hunter-only stylistic nits (two
tokens on one line in `theme.css`, the `>1000`-declaration guard's numeric margin, AC5 only exercising
the dark theme path) are noise-level and not corroborated by either of the two layers that verified
against the live app.

## Dev Notes

### Shared-stylesheet constraint (read before Task 3)

`components.css` is loaded by **`index.html` (line 21), `admin.html` (line 12) and `dt-proto.html`**.
`suite.css` is loaded by `index.html` only. This is why the two halves of the work are scoped
differently:

- The **`px` to `rem` conversion is visually neutral** at the default root size (16px), so it is safe
  to apply to the whole of `components.css` including the admin editor section. It changes only
  behaviour under OS text scaling, which is a benefit on both apps.
- The **floor raise is a visible change**, so it is restricted to the sections that render on
  `index.html`.

Do not "helpfully" raise the editor section's floors. That is a separate surface with its own
density constraints and its own future story.

### Viewport emulation gotcha, carried forward from gdx-1

**`mcp__claude-in-chrome__resize_window` does not actually resize the rendered viewport.** In gdx-1's
own session it reported success while `window.innerWidth` stayed at the browser's real 1920px,
confirmed directly via `javascript_tool`, and no other device-emulation control was available to that
session's tooling. Angelus completed gdx-1's own AC3 sweep directly via real Chrome DevTools device
toolbar (Ctrl+Shift+M) against a locally served build using the `local-test-token` auth bypass.
**Expect to do the same for Task 8. Do not spend time rediscovering this.**

Playwright's `page.setViewportSize({width:360, height:800})` **does** work correctly and is used by
two existing tests in `desktop-and-css.spec.js` (`story-split` and `tab-split`, lines 220 and 236),
so automated width-dependent assertions are viable even though the interactive browser tool is not.

### Port 8080 gotcha, also carried forward from gdx-1

An unrelated `python -m http.server 8080` process, not started by the agent session and observed to
respawn under a new PID after being stopped once, was intermittently shadowing port 8080 and serving
different content than this project's own `http-server`. It produced a **false-positive green** on
gdx-1's regression test before the actual fix was applied. gdx-1 routed around it by serving on 8081
rather than repeatedly killing a process that kept returning. If a CSS assertion passes suspiciously
early, check what is actually answering on the port before trusting it.

### CSS standards apply in full

Per `specs/project-context.md` §1 and `specs/architecture/coding-standards.md` -> CSS Standards:
tokens not literals, no bare hex, no inline `style="..."`, reuse before invent, no `!important`. The
two floor tokens go in `theme.css` because that is the declared token SSOT. There is exactly **one**
inline `font-size` in the player-side JS (`public/js/suite/territory.js:368`, at `12px`, already at
the body floor), so there is no inline-style sub-floor problem to chase; leave it or convert it to
the token at your discretion, but do not go hunting for others.

### Scope note already settled, do not re-litigate

Issue #983 carries one comment (by pkalt) folding it from Epic GDX into Epic USF (#1047) and saying
it should target "the unified role-gated app", not `player.html`. **That fold is already fully
resolved and creates no residual ambiguity.** `player.html` was deleted on 2026-07-28 by Epic USF
Phase 0 Stage B (commit `5fdaa032`, the same commit that satisfied gdx-10) and its surface was merged
into `public/index.html`. The issue's own original scope already named `suite.css` and
`components.css`, which are `index.html`'s stylesheets. **Target surface is `public/index.html`, full
stop.** Note in passing that `components.css:1424`'s own header comment still says "shared between
player.html and index.html"; that comment is stale but harmless, and correcting it is optional
housekeeping, not a task.

### No database involvement

This is a pure static-asset story. It touches no server route, no schema and no MongoDB collection.
No `tm_suite` writes are possible from this change, so no data-lock or data-steward check applies.

### Conversion reference (divisor 16)

`7px` 0.4375 · `8px` 0.5 · `9px` 0.5625 · `10px` 0.625 · `11px` 0.6875 · `11.5px` 0.71875 ·
`12px` 0.75 · `12.5px` 0.78125 · `13px` 0.8125 · `13.5px` 0.84375 · `14px` 0.875 · `15px` 0.9375 ·
`16px` 1 · `17px` 1.0625 · `18px` 1.125 · `20px` 1.25 · `22px` 1.375 · `24px` 1.5 · `26px` 1.625 ·
`28px` 1.75 · `30px` 1.875 · `32px` 2 · `36px` 2.25 · `40px` 2.5 · `48px` 3 · `64px` 4

Leave `clamp()` expressions alone unless every absolute term inside them is a font size.
`suite.css:53`'s `.hdr-char-name{font-size:clamp(16px, 8vw, 28px)}` is the one such case; convert it
to `clamp(1rem, 8vw, 1.75rem)` and leave the `8vw` middle term as is.

## Testing

**No server-side change, so `server/tests/` (vitest) is not the relevant regression surface.** Do not
run the full vitest suite for this story. The relevant surface is Playwright plus a manual 360px
sweep.

### Task 7 regression test, required mechanism

Add to the **existing `css-audit` group** in `tests/desktop-and-css.spec.js` rather than creating a
new spec file, per `specs/project-context.md`'s reuse-over-duplicate convention and following gdx-1's
own precedent in the same group.

- **Do NOT use `setupSuite()`.** That helper (line 26) waits on `#app` becoming visible and is
  **currently broken in this environment**; it is the root cause of the 12 pre-existing failures
  `CLAUDE.md` documents for this exact file. gdx-1 deliberately avoided it and its test passed as a
  result. Use a bare `await page.goto('/')`. Stylesheets are `<link>`ed in `<head>`, so
  `document.styleSheets` is fully populated on raw HTML load with no app boot required. The existing
  `.arc-docs` test (line 185) proves the `document.styleSheets` walk works same-origin here.
- **Recurse into `@media` blocks.** A plain `for (const rule of sheet.cssRules)` walk will silently
  miss every declaration inside a `CSSMediaRule`. `suite.css` has 11 media blocks and
  `components.css` has 8. Recurse into `rule.cssRules` when `rule.cssRules` exists.
- **Read the authored value, not the computed one.** `getComputedStyle` resolves `rem` back to `px`
  and cannot distinguish the two, which would make the test vacuous. Use `rule.style.fontSize` from
  the CSSOM, which returns the authored string (`"0.75rem"`).
- **Filter by `sheet.href`** to attribute each rule to `/css/suite.css` or `/css/components.css`.
- **Assertions:**
  1. Zero `font-size` declarations ending in `px` in either file.
  2. Zero `font-size` declarations below `0.6875rem` in either file, **except** an explicit
     checked-in allowlist of the admin-editor selectors deliberately left un-raised (Task 3's
     carve-out). Generate that allowlist from the selectors you actually skip, and note in a comment
     that it is a ratchet: any *new* sub-floor selector fails the test. A selector-prefix heuristic
     will not work here, because `sh-` prefixed rules exist on both sides of the carve-out boundary.
- **Prove-discriminate.** Confirm the test fails against the pre-change CSS and passes after, not
  just that it passes at the end.

### Known pre-existing failures, do not be surprised

`CLAUDE.md` documents `tests/desktop-and-css.spec.js` as having **12 pre-existing failures** at base:
11 `desktop-mode —` tests plus `css-audit — DT Submission tab has dark-theme input styles`, all of
them `setupSuite()`-dependent and unrelated to this story. gdx-1 measured this file at **8 passed, 12
failed** and confirmed the 12 by name match, not just by count. Expect the same baseline. Note the
subtlety gdx-1's own review established: only 11 of the 12 `desktop-mode —` tests actually call
`setupSuite()`; `desktop-mode — preference restored on page load` (line 138) has independent inline
setup and passes. Do not "fix" any of these as part of this story.

### Commands

- Targeted: `npx playwright test tests/desktop-and-css.spec.js`
- **Never run two Playwright invocations concurrently**; they share port 8080 with
  `reuseExistingServer`.
- Chromium may need installing in a fresh checkout: `npx playwright install chromium`.

### Manual sweep (Task 8)

Real Chrome DevTools device toolbar (Ctrl+Shift+M) at **360px**, against a locally served build using
the `local-test-token` auth bypass. Widths 414px and 768px are worth a confirming glance since the
`rem` conversion touches every width, but 360px is where the ACs bite. Angelus cannot run the app
locally to smoke-test, so anything needing a human look must reach a deployed environment first.

## Files to touch

| File | Nature of change |
|---|---|
| `public/css/theme.css` | **Add** `--fs-floor-body: 0.75rem` and `--fs-floor-micro: 0.6875rem` to the `:root` block only. Purely additive; no existing declaration changes. |
| `public/css/suite.css` | Convert all 494 `font-size` px to `rem`; raise all 219 sub-floor values to a floor token; add `overflow-x:auto` + friends to `.shortcut-row` (`:120`) and `.xpl-panel` (`:2200`); add surgical `@media (max-width:480px)` rules only where the 360px sweep proves them needed. |
| `public/css/components.css` | Convert all 583 `font-size` px to `rem` (whole file, editor section included); raise the 161 player-surface sub-floor values; fix `.npcr-modal`'s `min-width:360px` (`:5329`). Editor section (lines 143 to 511) values left un-raised by design. |
| `tests/desktop-and-css.spec.js` | **Add** one or two tests to the existing `css-audit` group enforcing AC1 and AC2, with the editor-carve-out allowlist. Do not modify existing tests. |

No server files. No schema files. No new files.

### Project Structure Notes

- Three CSS files and one existing spec file. No new files, no new directories, no server change.
- `components.css` is shared with `admin.html` and `dt-proto.html`; the conversion is deliberately
  split so the shared file takes only the visually-neutral half of the change. See
  "Shared-stylesheet constraint".
- No conflict with in-flight epic-gdx siblings. gdx-3 (touch targets) and gdx-4 (CSS cleanup) are
  still backlog and unstoried; gdx-8 (roll history) and gdx-9 (single-scroll sheet) are backlog and
  touch different surfaces. gdx-1 is done and merged, and its one-line `index.html` change does not
  overlap any file here.
- This story closes GitHub issue #1191 alongside #983. Reference both in the eventual commit message.

### References

- **GitHub issue #983** (source of truth for scope and ACs; no local epic doc exists for Epic GDX,
  and `sprint-status.yaml`'s own `epic-gdx` row confirms this). Its own figures ("589 absolute px
  sizes", "~330 rules at 9-11px") and its `.xpl-table` line reference (2438 to 2441) are both stale;
  the "Measured baseline" table above supersedes them.
- **GitHub issue #1191** (`.shortcut-row` clips on narrow phones), filed during gdx-1 and closed by
  this story's Task 5. Its own References section already identifies `suite.css:86` and `:824` as the
  pattern to match.
- `specs/stories/gdx-1-mobile-zoom.md` - previous Group A story on the same surface. Source of the
  `resize_window` and port-8080 gotchas, the `setupSuite()` avoidance pattern, and the
  `desktop-and-css.spec.js` 12-failure baseline.
- `specs/architecture/coding-standards.md` -> "CSS Standards" (tokens, component reuse, naming,
  shared chrome) and -> "Typography" (the `--fh`/`--fl`/`--ft`/`--fh-decorative` family tokens, which
  this story does not change).
- `specs/project-context.md` §1 "Normalised CSS".
- `public/css/theme.css` - token SSOT; currently contains zero type-scale tokens.
- `public/css/suite.css:8` (`html,body{overflow:hidden;max-width:100vw}`), `:75`
  (`.tab{overflow-x:hidden}`) - the structural reason AC3 is about clipping, not scrolling.
- `public/css/suite.css:86` (`#bnav`), `:824` (`.gcp-stats`), `:272` (`.attr-skills-carousel`) - the
  three existing horizontal-scroll-row precedents in this file.
- `CLAUDE.md` -> "Tests" - the documented pre-existing failure list, including
  `tests/desktop-and-css.spec.js (12)`.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, bmad-dev-story), 2026-08-20.

### Debug Log References

- Baseline re-measured before any edit and it matches the story's own table exactly:
  `suite.css` 494 px `font-size` / 219 sub-floor, `components.css` 583 / 272, `theme.css` 1 / 0.
- Baseline Playwright run of `tests/desktop-and-css.spec.js` before any change: **8 passed, 12
  failed**, and the 12 match the documented list by name, not merely by count.
- Final run of the same file after all eight tasks: **19 passed, 12 failed**. Same 12 by name.
  Net +11 passing, zero new failures.
- Final run after the review patch round: **29 passed, 12 failed**. Same 12 by name again, so the
  10 tests the patch round added all pass and nothing new broke. Note the file now takes about 16
  minutes end to end, because each of the 11 `setupSuite()` baseline failures burns its own timeout.

### Completion Notes List

**Conversion (Tasks 2, 3)**

- 1076 plain `px` `font-size` declarations converted to `rem` at divisor 16, plus the one
  `clamp()` (`.hdr-char-name`, now `clamp(1rem, 8vw, 1.75rem)` with the `8vw` middle term left
  alone). Split: `suite.css` 494 (275 plain `rem` + 219 raised to a floor token),
  `components.css` 582 (441 plain `rem` + 161 raised). No other `px` value was touched: a
  set-based diff of both files with every `font-size` value masked out shows only the six
  deliberate structural edits below, so no padding, border, radius, width or `gap` moved.
- Player-surface sub-floor raises came to **380**, exactly the storied figure (219 `suite.css` +
  161 `components.css`), classified **234 body / 146 micro**. Classification used the story's own
  rule of thumb (`text-transform:uppercase` plus letter-spacing of `.06em` or more is micro, with
  `px` tracking normalised against the rule's own font size). All six of the story's verified
  examples land where it says they should: `.nbtn`, `.city-panel-title`, `.xpl-col-head` and
  `.rv2-stepper-lbl` micro; `.xpl-paid` and `.xpl-dim` body.
- **Small correction to the storied baseline.** One of `components.css`'s 583 `px` `font-size`
  matches is inside a *comment* at `:227` (a BL-3a note quoting the inline style it replaced), not
  a live declaration. So the real editor carve-out is **110 declarations, not 111**, and the real
  live total across both files is 1077 (1076 plain + 1 clamp), not 1078. Nothing else diverged.
  The comment was left as authored.
- The editor carve-out (`components.css` lines 143 to 511) was converted to `rem` but its values
  were left alone, as instructed. Region boundaries were anchored on the section header comments,
  not on line numbers.

**Deviation from the story, deliberate and evidenced: the carve-out is not admin-only**

The story's carve-out rests on "those selectors render only on `admin.html`'s character editor".
That premise was checked rather than assumed and it is **not strictly true**.
`public/js/suite/sheet.js` imports `shRenderInfluenceMerits`, `shRenderDomainMerits`,
`shRenderGeneralMerits`, `shRenderManoeuvres`, `shRenderEquipment` and `shRenderOfficeMerits` from
`public/js/editor/sheet.js` and calls all of them to build the **player** sheet, so a subset of the
carved-out rules does render on `index.html` at 9px and 10px. Leaving them would have left AC2
literally unmet.

Resolution chosen so both the AC and the carve-out survive: `components.css` was left exactly as
the story specifies, and a **player-scoped override block was added at the end of `suite.css`**,
which `index.html` loads and `admin.html` does not. Twenty-two selectors are raised there (21 body,
1 micro). The admin editor is untouched, byte for byte. Anything in that block that turns out to be
edit-mode-only is inert on the player app, so over-inclusion costs nothing.

**Narrow-width fixes (Tasks 4, 5, 6)**

- Task 4: `overflow-x:auto; -webkit-overflow-scrolling:touch` on `.xpl-panel`, the block wrapper.
  Nothing added to the `border-collapse` table itself; `.xpl-table{width:100%}` still behaves.
- Task 5 (closes #1191): the three-property set from `#bnav` and `.gcp-stats` added to
  `.shortcut-row`. Verified at 360px, 414px and 768px with all four buttons including `#sc-auspex`:
  `.tab`'s `scrollWidth` never exceeds its `clientWidth`, so nothing is clipped, and the row itself
  takes the overflow.
- Task 6: `.npcr-modal`'s `min-width:360px` is now `min(360px, 100%)`.
  **Worth recording, because the story's stated reason is wrong:** a global `box-sizing:border-box`
  applies here, so the flat `min-width:360px` measured *exactly* 360px at a 360px viewport, border
  included. It fitted at 360px by a hair rather than overflowing. It genuinely overflowed *below*
  360px, so the regression test asserts at 320px as well as 360px; only the 320px case
  discriminates.

**360px sweep (Task 8)**

The `resize_window` browser tool was not used at all, per the carried-forward gotcha. The sweep was
done with Playwright's own `page.setViewportSize`, which is real browser-engine emulation.

- Every one of `index.html`'s 26 `.tab` elements was forced active and measured at 360px against
  the shipped static markup. None clips: no tab's `scrollWidth` exceeds its `clientWidth`, and
  `document.documentElement.scrollWidth` stays at 360.
- Tasks 4, 5 and 6 were each re-measured rather than assumed sufficient. All three resolved.
- AC4 candidates, all four checked, results split:
  - `.more-section-grid` — **broken, fixed.** Needed 428px at a 360px viewport.
  - `.sheet-picker-grid` — **broken, fixed.** Needed 472px.
  - `.prestige-row` — **verified fine at 360px, no rule added.** Fits exactly.
  - `.sidebar-app-grid` — **verified fine at 360px, no rule added.** Fits exactly.
  Both broken grids were already over at base (399px and 442px before this story's floor raise), so
  the clipping is pre-existing rather than introduced; the raise widened it. The cause is that
  `1fr` is `minmax(auto, 1fr)`, so an unbreakable label ("Territories", a two-barrelled character
  name) sets the track's min-content. The fix is a single `@media (max-width: 480px)` block
  swapping both to `repeat(4, minmax(0, 1fr))`, which keeps the four-column design rather than
  reworking the layout. Clean at 320px, 360px and 414px with no element overflowing its own box.
  The established 599px tier was deliberately *not* reused: both grids fit unaided above roughly
  480px, so widening the rule would restyle tablets for nothing.
- No new offender was found beyond the AC3 and AC4 lists, so nothing was deferred to
  `specs/deferred-work.md`.
- OS text-scaling confirmed, which is AC2's real point: with the root font size pushed from 16px to
  24px, `.nbtn` goes 11px to 16.5px and `.xpl-dim` 12px to 18px. Both scale proportionally instead
  of staying pinned, which is what the whole `px` to `rem` migration is for.

**Regression test (Task 7)**

Eleven tests added to the existing `css-audit` group in `tests/desktop-and-css.spec.js`. No
existing test was modified. None of them call `setupSuite()`.

- AC1: zero absolute `px` `font-size` in either sheet. Reads `rule.style.fontSize` from the CSSOM
  (the authored string) rather than `getComputedStyle`, which would resolve `rem` back to `px` and
  make the assertion vacuous. Skips `var()` indirection, so `--reading-font-size`'s `px` fallback
  is correctly out of scope, and skips a bare zero.
- AC2: zero `font-size` below the 11px-equivalent micro floor outside a checked-in 68-selector
  allowlist of the editor carve-out. The allowlist was generated from the selectors actually
  skipped, and is documented in-file as a ratchet: any new sub-floor selector fails. It is 68 and
  not 110 because 11px sites convert to exactly `0.6875rem`, which sits *on* the floor. The check
  reads both `px` and `rem` so it discriminates on its own rather than leaning on AC1.
- AC5: both tokens resolve to their exact values off `:root`.
- AC3: `.shortcut-row` at 360/414/768, `.xpl-panel` at 360, `.npcr-modal` at 320 and 360.
- AC4: `.more-section-grid` and `.sheet-picker-grid` at 360.
- **Prove-discriminated properly**, not just observed green: the CSS was reverted to `HEAD` with
  the new tests in place and **8 of the 9** then-existing new tests went red. The single pass was
  `.npcr-modal` at 360px, for the border-box reason above, which is exactly why the 320px case was
  added. Restored, all 11 pass.

**One CSSOM gotcha worth carrying forward, beyond the two the story already warned about.** The
story's warning to recurse into `@media` blocks is correct but insufficient. With CSS Nesting, a
plain `CSSStyleRule` *also* exposes a `cssRules` property (an empty list), so the obvious
`if (rule.cssRules) { recurse; continue; }` shape silently skips every style rule in the sheet and
reports zero declarations. The walk must read `rule.style.fontSize` **first** and only then recurse
when `rule.cssRules.length` is non-zero. This cost a debugging cycle here; it is commented in the
test.

**Review patch round (2026-08-20, all 7 `[Review][Patch]` findings)**

Six applied exactly as the reviewer specified; one needed a different CSS property than named, and
one new assertion had to be scoped to a narrower width band than first written. Each patch was
prove-discriminated by reverting only that change and confirming the expected test went red.

- **#1191, `.sc-btn`.** `min-width:0` added, plus the missing
  `.shortcut-row::-webkit-scrollbar{display:none}` the original comment claimed parity on but only
  implemented for Firefox. Four new tests assert `#sc-auspex` has non-zero width and sits inside
  the row's *visible* client box at 320/360/375/414px. Reverting `min-width:0` reds all four,
  414px included, so the button was unreachable well above the storied 360px target. The
  no-scrolling-needed assertion is asserted from 360px up only: below that the unbreakable
  `.sc-label` words still overrun their button by about 6px, which is exactly what the row's
  `overflow-x:auto` safety net is for, and 360px is AC3's own target.
- **`desktop-mode` grid specificity.** `body.desktop-mode .sheet-picker-grid` added inside the
  existing `@media (max-width: 480px)` block, so specificity settles it without `!important`. Two
  tests: four columns at 360px with `desktop-mode` on, and six columns still intact at 1280px.
  Removing the rule reds the first and leaves the second green.
- **`.pt-skill-tag`.** Added to the player-scoped override block. Body role, not micro: the rule has
  neither `text-transform:uppercase` nor tracking, so the story's own heuristic puts it on the body
  floor alongside the other tags already in that block.
- **AC2 ratchet made href-aware, plus a positive assertion.** An allowlisted selector now counts as a
  carve-out only when its `href` ends `/css/components.css`; the same selector sub-floor in
  `suite.css` fails. A second new test probes the override block through the real DOM by computed
  style (24 probes, the three compound `.infl-edit-row` selectors built with their real ancestor and
  element type), so deleting the block *or* having it outranked fails loudly. Discriminated both
  ways: appending `.derived-note{font-size:0.5625rem}` to `suite.css` reds the ratchet, and dropping
  `.pt-skill-tag` from the block reds the positive test.
- **Body floor now checked, not just the micro floor.** The floor check is role-aware:
  `gdx2IsMicroRole` applies the story's uppercase-plus-`.06em` heuristic and picks an 11px or 12px
  floor accordingly. Discriminated with a matched pair at 11.5px: the body-role probe is caught,
  the micro-role probe correctly is not. This grew `GDX2_EDITOR_CARVE_OUT` from 68 entries to 110,
  every one re-confirmed to live inside `components.css` lines 143 to 511. `suite.css` contributes
  zero sub-12px literals, which is the override block doing its job.
- **AC1 nested-`px` blind spot.** `gdx2HasAbsolutePx` now strips `var()` references wholesale and
  then looks for any bare `px` token anywhere in the value. Discriminated with three probes:
  `clamp(1rem, calc(1vw + 4px), 2rem)` is caught, `clamp(1rem, 8vw, 1.75rem)` and
  `var(--reading-font-size, 15px)` are correctly still ignored. No live declaration trips it.
- **`.more-app-label` overflow, a deviation: `anywhere` not `break-word`.** The finding named
  `overflow-wrap:break-word`, which was tried first and only cut the spill from 6.2px to 2.2px:
  `break-word` breaks the glyphs but deliberately leaves the box's intrinsic min-content size as if
  the word were unbreakable, so the label box stayed wider than its card. `overflow-wrap:anywhere`
  shrinks the min-content size too and clears it, and it already has precedent in this codebase at
  `components.css:790`. Two fixture corrections went with it: the `.more-section-grid` test now uses
  the real `MORE_APPS` labels from `public/js/app.js` (the invented set omitted "Emergency", the
  worst case) and wraps them in `.more-grid-wrap` with its real 16px side padding, which the earlier
  fixture omitted and which is why 360px looked clean. With both corrections and the fix reverted,
  320px and 360px both red, reproducing the reviewer's own measurement.

**Not done, by design**

- `public/js/suite/territory.js:368`'s single inline `12px` was left as authored. It is already at
  the body floor and the story makes converting it optional.
- `components.css:1424`'s stale "shared between player.html and index.html" comment was left alone;
  the story marks correcting it as optional housekeeping.
- `theme.css`'s own `.app-nav-btn{font-size:12px}` was left as authored: the story's Files-to-touch
  row for `theme.css` says purely additive, no existing declaration changes.
- `--reading-font-size` untouched.
- No `server/` file, schema or MongoDB collection involved.

### File List

- `public/css/theme.css` — added `--fs-floor-body: 0.75rem` and `--fs-floor-micro: 0.6875rem` to
  the `:root` block only, under a labelled comment. Not added to `[data-theme="dark"]`.
- `public/css/suite.css` — 494 `font-size` px converted to `rem`, 219 of them raised to a floor
  token; `overflow-x` set on `.shortcut-row` and `.xpl-panel`; one `@media (max-width: 480px)`
  block for `.more-section-grid` and `.sheet-picker-grid`; one player-scoped floor-override block
  appended for the 22 shared editor selectors that reach the player sheet.
  **Review patch round:** `min-width:0` on `.sc-btn` plus
  `.shortcut-row::-webkit-scrollbar{display:none}`; `body.desktop-mode .sheet-picker-grid` added
  inside the `@media (max-width: 480px)` block; `.pt-skill-tag` added to the override block, now
  23 selectors; `overflow-wrap:anywhere` on `.more-app-label`.
- `public/css/components.css` — 582 `font-size` px converted to `rem`, 161 player-surface values
  raised to a floor token, the 110 editor-section values converted but deliberately not raised;
  `.npcr-modal`'s `min-width` changed to `min(360px, 100%)`. Unchanged by the review patch round.
- `tests/desktop-and-css.spec.js` — 11 tests added to the existing `css-audit` group. No existing
  test modified.
  **Review patch round:** 10 further tests added (4 shortcut-button reachability widths, 2
  `desktop-mode` grid cases, 3 `.more-app-label` widths, 1 positive override-block probe) and the
  gdx-2 helpers hardened in place: `gdx2HasAbsolutePx` finds nested `px`, `gdx2SubFloor` became
  the role-aware `gdx2FloorViolation` plus `gdx2LiteralPx`/`gdx2IsMicroRole`, the carve-out
  allowlist became href-aware via `gdx2Allowed` and grew from 68 entries to 110, and the
  `.more-section-grid` fixture now mirrors what `renderMoreTab` really emits. Still no
  pre-gdx-2 test modified.
- `specs/stories/gdx-2-mobile-type-scale.md` — this record.
- `specs/stories/sprint-status.yaml` — status ready-for-dev to in-progress to review, with dated
  notes.

## Change Log

| Date | Change |
|---|---|
| 2026-08-20 | bmad-dev-story: all 8 tasks implemented. `px` to `rem` across both player stylesheets, two floor tokens added to `theme.css`, the three named 360px offenders fixed, one surgical `@media (max-width: 480px)` rule added where the sweep proved it needed, 11 prove-discriminated regression tests added. Status ready-for-dev to review. |
| 2026-08-20 | Review patch round: all 7 `[Review][Patch]` findings applied and individually prove-discriminated. `.sc-btn{min-width:0}` genuinely closes #1191, the `desktop-mode` grid specificity loss is settled inside the 480px block, `.pt-skill-tag` joins the player-scoped override, `.more-app-label` gets `overflow-wrap:anywhere`, and the AC1/AC2 ratchets became nested-`px`-aware, role-aware (body floor as well as micro) and href-aware, with a positive assertion that the override block is really there. 10 tests added; no status change. |
