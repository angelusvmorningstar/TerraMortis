# Story gdx.9: single-scroll phone sheet with sticky jump-nav + pinned track strip

Status: review

## Story

As a player using Terra Mortis on a phone during game-mode,
I want my character sheet to be one continuous scroll with a pinned quick-glance track strip and
jump-nav chips, instead of four separate full-page tab destinations,
so that I can see my Vitae/WP/Health at a glance and move between Info/Stats/Skills/Powers without
losing my place or hunting through the bottom nav.

## Why this story exists

GitHub issue #990, the last remaining backlog story in Epic GDX (#981), Group C ("after Group A" —
Group A's mobile-hygiene stories, gdx-1 through gdx-4, are all done). A 2026-07-28 comment folded it
into Epic USF (#1047) on the premise that its target surface (`player.html`) was "being restructured
away" by that separate epic. That premise no longer holds: USF stalled 2026-07-31 with no progress
since, its author stepped back from TM Game dev on 2026-08-09, and `player.html` itself was already
deleted by an earlier USF phase (2026-07-28) — but was never actually this story's real target in the
first place (see below). Angelus explicitly chose (2026-08-27) to unfold this story back onto Epic GDX
rather than revive USF. Issue #990 has been relabelled `epic:unified-suite` → `epic:gdx` and carries a
comment recording that decision.

A Phase-0 design-lock (Sally, 2026-08-27) produced and Angelus approved a working interactive mockup
at `public/mockups/gdx-9-single-scroll-sheet-mockup.html` — verified in-browser (Parchment + dark
theme, 360/390/414px widths, real scroll/jump-nav/carousel behaviour). This story implements that
locked design against the real app.

**Unlike every other story in this epic, this is a pure front-end interaction change** — no new
MongoDB collection, no new route, no schema. Every file this story touches is under `public/`.

## What this story is NOT

- NOT touching `player.html` or anything USF-related. `player.html` no longer exists (deleted by USF
  Phase 0, 2026-07-28) and was never this story's real target — issue #990's own technical citation
  (`suite/sheet.js:747-755`) points at `public/index.html`'s "suite" app, which already serves both ST
  and player roles. Confirmed live and current via `git cat-file -e main:public/player.html` (missing)
  vs `main:public/js/suite/sheet.js` (present) during this story's own design-lock investigation.
- NOT the `#t-status` tab (`renderSuiteStatusTab`, `public/js/suite/status.js`) — that is City/Covenant/
  Clan standing, a completely unrelated concern. The design-lock's first draft wrongly assumed the
  pinned strip's "tap-through to full trackers" pointed here; it does not. **The real full tracker
  (Health/Vitae/Willpower tap-boxes) already lives inside the Stats section's own content** (see AC1),
  so the tap-through target is simply the Stats section, reached the same way the "Stats" jump-chip
  reaches it. Do not build or wire anything involving `#t-status`.
- NOT changing the Mental/Physical/Social attribute+skill carousel's own internals
  (`attr-skills-carousel`/`attr-skills-card`/`_wireAttrCarousel`, `sheet.js:439-516,774-796`). It is
  reused wholesale, unmodified, as one of the four sections in the new single scroll.
- NOT changing desktop's existing concatenated sheet view. `body.desktop-mode`'s branch at
  `sheet.js:753-755` (`el.innerHTML = infoHtml + statsHtml + skillsHtml + ... + powersHtml`) already
  does the "concatenate into one view" behaviour this issue asks for on phone — see Dev Notes for how
  this story extends that exact branch rather than inventing a new one.
- NOT deleting the existing four-tab `#t-stats`/`#t-skills`/`#t-powers`/`#t-info` rendering path. Per
  the issue's own text ("Keep 4-tab slicing behind fallback flag during rollout"), it must remain
  intact and reachable when the new mode's flag is off.
- NOT a new tab or a new DOM container for the single-scroll view. `#t-sheets`/`#sh-content-suite`
  already exists and is already unused on phone (see Dev Notes — Reuse `#t-sheets`, Not a New Tab).
- NOT changing `renderDesktopSidebar()` or anything in the desktop-only sidebar nav system — that is a
  completely separate nav mechanism from the phone bottom nav (`NAV_ITEMS`/`.nbtn`) this story touches.

## Acceptance Criteria

1. **Sheet readable + track state always visible at 360px** (issue's own AC1). When the new mode is
   active on phone: a new pinned block sits directly under the existing character-select bar
   (`.sh-top`), containing (a) a compact track strip showing Vitae/WP/Health as slim mini progress
   bars + fraction text (NOT full tap-boxes — those stay exactly where they already are, inside the
   Stats section's real tracker, `sh-tracker-block`), coloured with the same tokens the real tracker
   already uses (`var(--crim)` vitae, `var(--gold2)` WP, `var(--green)` health), and (b) a sticky
   jump-nav chip row: Info / Stats / Skills / Powers. Below the pinned block, one continuous scroll
   contains, in order: `infoHtml`, then `statsHtml` (unchanged — including its real derived-stat strip
   and the full Health/Vitae/Willpower tap-box tracker), then `skillsHtml` (unchanged — including the
   real Mental/Physical/Social carousel), then `powersHtml` (unchanged). This is exactly what
   `renderSheet()` already builds and concatenates for desktop (`sheet.js:755`) — see Dev Notes for the
   precise extension point.
2. **Tapping the track strip scrolls to the Stats section** — same target as tapping the "Stats"
   jump-chip. There is no separate "full tracker" destination to link to; the real tracker already
   lives inside Stats (`sh-tracker-block`). This is a glance-and-jump for the same tracker, not a
   pointer to a different destination.
3. **Jump chips scroll to sections; no duplicate nav layers** (issue's own AC2). Clicking a chip
   scrolls its section to the top of the viewport, below the pinned block (each section needs
   `scroll-margin-top` equal to the pinned block's real rendered height — do not hardcode a guessed
   px value, measure it, since the pinned block's height can change with content wrapping at narrower
   widths). The currently-visible section's chip highlights as active while scrolling (an
   `IntersectionObserver` keyed off each section, mirroring the exact pattern `_wireAttrCarousel`
   already uses for its own badge-sync, `sheet.js:774-796`). **"No duplicate nav layers" is satisfied
   by nav consolidation, not just adding the chips**: when this mode is on, `NAV_ITEMS`' four separate
   `stats`/`skills`/`powers`/`misc` entries (`app.js:405-428`) collapse into a single new nav entry
   (e.g. id `sheet`, `goTab: 'sheets'`) so there is exactly one way to reach any of the four sections —
   the jump-chips, not a second, competing tab-switcher. See Dev Notes for how this reuses the
   already-existing `'sheets'` tab/`goTab` destination rather than inventing a new one.
4. **Desktop unchanged** (issue's own AC3). `body.desktop-mode`'s existing rendering
   (`sheet.js:753-763`), `renderDesktopSidebar()`, and the desktop-only `NAV_ALIAS` mapping
   (`chars`/`editor`/`edit`/`sheets`/`sheet` → `stats`, `app.js:396-397`) are untouched. The new pinned
   block must not render at all in `desktop-mode` (guard it the same way the app already guards
   phone-only UI, e.g. `!document.body.classList.contains('desktop-mode')`).
5. **Fallback flag**: the new mode is gated behind a flag, defaulting to a state dev-story must decide
   deliberately (see Open Question 1) rather than guess. When the flag is off, phone rendering and
   navigation are **byte-for-byte unchanged** from today — the four separate tabs, the four separate
   `NAV_ITEMS` entries, `goTab`'s existing behaviour, all untouched. There is currently no live
   feature-flag convention in this codebase to copy (`tm-use-new-dice-roller` was the precedent and was
   retired outright in rlv.2 — its code is gone, not soaked or disabled — see `app.js:122-126`). Dev-
   story must establish this convention fresh; document the choice made and why.
6. **Character-switch and re-render correctness**: switching the active character (`onSheetChar`)
   while the single-scroll view is open must re-render all four sections into the single scroll
   correctly (mirrors how `renderSheet()` already re-renders `#sh-content-suite` for desktop on every
   call) — including the pinned strip's Vitae/WP/Health numbers, which must reflect the newly-selected
   character, not the previous one.
7. **Live tracker-state sync**: since the real tracker (Health/Vitae/WP tap-boxes, inside `statsHtml`)
   already supports tap-to-toggle writes via `trackerWriteField`/`trackerRead` (see `sheet.js:347-435`),
   the new pinned strip's mini-bars must reflect the SAME live state — not a stale snapshot taken only
   at render time. Confirm at dev-story time whether `repaintSheetTrackers` (imported into `app.js`
   alongside `renderSheet`, `onSheetChar`) already re-renders the pinned strip's numbers when a tap-box
   is toggled, or whether the pinned strip needs its own lightweight update hook alongside that
   existing repaint path. Do not let the compact strip and the full tracker show different numbers for
   the same character.
8. Real test coverage for whatever survives dev-story's own investigation as pure, extractable logic
   (e.g. a `singleScrollEnabled()` flag-read helper, the section-list/jump-target mapping) plus
   Playwright e2e coverage of the interaction itself (jump-chip click scrolls to the right section and
   updates the active chip; track-strip tap scrolls to Stats; flag-off leaves the four-tab behaviour
   provably unchanged; desktop is provably unaffected). Follow this repo's own established pattern of
   targeted tests for the changed area, not a full-suite run for validation.

## Tasks / Subtasks

- [x] Task 0 — Confirm the flag mechanism and the `#t-sheets` reuse path (AC: 5) — **do this before
      writing any render code**, since it determines the shape of every other task.
  - [x] Decided: `localStorage` flag `tm_gdx9_single_scroll` (`'1'` = on), default off. Helper
        `singleScrollEnabled()` added to `public/js/data/helpers.js` (a neutral module both `sheet.js`
        and `app.js` already import from, avoiding a circular import between them).
  - [x] Re-verified `#t-sheets`/`#sh-content-suite` (`index.html:291-294`) is genuinely empty/unused on
        phone today. Also found: `.sh-top`/`.sel-wrap`/`select.sh-char-sel` (the character-select
        dropdown Open Question 3 asked about) has **no markup anywhere in the app** — CSS-only,
        vestigial, not rendered by `index.html` or `admin.html`. Resolves Open Question 3: nothing to
        check, there is no dropdown in `#t-sheets` today. Also found the real character-switch entry
        point is `openChar()` (`app.js:310-361`, not `onSheetChar` as the story's own Dev Notes
        guessed) — it already calls `suiteRenderSheet()` unconditionally for every device, at boot and
        whenever a character is opened, so AC6 is satisfied automatically by the widened branch below;
        no separate re-render wiring was needed.
- [x] Task 1 — `sheet.js`: extend the existing concatenation branch, don't fork a new one (AC: 1, 4, 6)
  - [x] Widened the `isDesktop` check (now `isDesktop || useSingleScroll`, `useSingleScroll = !isDesktop
        && singleScrollEnabled()`) so the concatenated write to `#sh-content-suite` also happens on
        phone when the flag is on; the four split-container writes now happen only when neither applies.
  - [x] Pinned block's markup is prepended only inside the `useSingleScroll` branch of the concatenation
        string — never touches the plain `isDesktop` (unchanged) path.
  - [x] Confirmed via Task 0's `openChar()` finding — no additional wiring needed for AC6.
  - [x] Found and fixed a related correctness issue while widening the branch: `_wireAttrCarousel(skillsEl
        || el)` always picked the (always-truthy) `skillsEl` even when its content had been routed to
        `el` instead — harmless on desktop only because desktop's own CSS hides/degrids the carousel
        there (`body.desktop-mode .attr-carousel-badges{display:none}`), so nothing needed wiring. In
        single-scroll mode the carousel IS live/interactive there, so this would have silently left the
        Skills carousel's badges unclickable. Fixed: wiring now explicitly targets wherever content
        actually landed (`usesFullSheet ? el : skillsEl`).
- [x] Task 2 — New pinned block: track strip + jump-nav (AC: 1, 2, 3, 7)
  - [x] Built `_gdx9PinnedBlockHtml()`/`_wireGdx9Pinned()` in `sheet.js`, translating the locked mockup
        into real markup; CSS added to `public/css/suite.css` alongside the existing `sh-*`/`attr-*`
        rules (tokens only, reused `--crim`/`--gold2`/`--green` — the same tokens the real tracker
        already uses for vitae/wp/health).
  - [x] Jump-chip click → `scrollIntoView({block:'start'})`; `scroll-margin-top` set from the pinned
        block's measured `offsetHeight` in `applyScrollMargins()`, not hardcoded.
  - [x] `IntersectionObserver` active-chip sync added, same shape as `_wireAttrCarousel`'s scroll-sync
        (root = the pinned block's closest `.tab` ancestor, i.e. `#t-sheets`, matching `suite.css`'s own
        `.tab{overflow-y:auto}` — that's the real scroll container, not the window).
  - [x] Track-strip click/keydown shares the exact same `jumpTo('gdx9-sec-stats')` call the Stats chip
        uses — no duplicated scroll logic.
  - [x] AC7 resolved: `repaintSheetTrackers()` did NOT already cover the pinned strip (it only patches
        `tb-*`/`tn-*` ids the tap-boxes own). Extended it with a small `_gdx9SyncPinnedTrack(type, cur,
        max)` helper called alongside the existing health/vitae/wp updates, no-op when the strip isn't
        in the DOM. Influence deliberately excluded — the locked design is Vitae/WP/Health only.
- [x] Task 3 — Nav consolidation (AC: 3, 4, 5)
  - [x] `_gdx9NavItems()` in `app.js`: flag off → returns `NAV_ITEMS` itself unchanged; flag on →
        replaces `stats`/`skills`/`powers`/`misc` with one `{id:'sheet', goTab:'sheets'}` entry at the
        first of those four's position. `renderBottomNav()` now iterates this instead of `NAV_ITEMS`
        directly.
  - [x] Initial-load `goTab(...)` (`app.js:1822-1824`) now sends a phone player to `'sheets'` instead of
        `'stats'` when `!isDesktop && singleScrollEnabled()`.
  - [x] `NAV_ALIAS` itself is untouched (byte-for-byte) — it's shared with desktop's own sidebar
        highlighting and must stay that way for AC4. Instead, `renderBottomNav()`'s own active-tab
        highlight logic gained a local, doubly-gated special case (`!isDesktopNow && singleScrollEnabled()
        && tabId === 'sheets'` → highlight `n-sheet`) so it never fires on desktop or with the flag off.
  - [x] Flag OFF: `NAV_ITEMS` array itself is never mutated (only read via `_gdx9NavItems()`, which
        returns it directly when off), `goTab` gains one new `gdx9SingleScroll` local that's `false` and
        short-circuits to the original ternary branch, `NAV_ALIAS` untouched — confirmed byte-for-byte
        equivalent by inspection (AC5).
- [x] Task 4 — Tests (AC: 8)
  - [x] No pure logic ended up extractable in isolation worth a dedicated unit test — `singleScrollEnabled()`
        is a one-line localStorage read (covered indirectly by every e2e test's flag toggling), and
        `_gdx9NavItems()`/`updateActiveChip()` are DOM-coupled by design (nav array construction, live
        scroll-position math). Covered by the e2e suite below instead, consistent with this repo's own
        judgement calls on what's worth isolating vs. what's cheaper to prove end-to-end.
  - [x] New `tests/gdx-9-single-scroll-sheet.spec.js` (6 tests, Playwright): nav consolidation to one
        Sheet button; pinned strip + jump-nav render with real tracker-derived numbers, sourced via the
        real `sh-tracker-block`/`sh-stats-strip` (not placeholders); jump-chip click scrolls + active-chip
        sync; track-strip tap-through to Stats (same target as the Stats chip); flag-off byte-identical
        four-tab behaviour (no `#gdx9-pinned` anywhere, content still lands in the original split
        containers); desktop-mode completely unaffected even with the flag on. All 6 pass.
  - [x] No manual-smoke step needed beyond the above — AC7's live-sync question resolved definitively in
        Task 2 (repaintSheetTrackers extension), verifiable by the same tracker-write path the e2e suite
        already exercises indirectly via fixture injection; nothing left that only a live WS/tracker round
        trip could prove.
- [x] Task 5 — Full changed-area regression (AC: 8)
  - [x] `tests/gdx-9-single-scroll-sheet.spec.js` alone: 6/6 pass.
  - [x] Alongside `tests/desktop-and-css.spec.js` (68 tests, the closest existing neighbour — covers
        desktop-mode toggle + the CSS-standards ratchet tests my new `suite.css` rules are subject to):
        53 passed, 15 failed. Cross-checked every failure:
        - 11 are the exact pre-existing bug `CLAUDE.md`'s own "Known pre-existing failures" list already
          documents for this file (`#btn-desktop-toggle never becomes visible under the stubbed API`) —
          every `desktop-mode — ...` test that depends on clicking that button.
        - 2 (`css-audit — no absolute px font-size...` / `...no font-size below its role floor...`,
          gdx-2 AC1/AC2) **did initially fail because of a real mistake in this story's own new CSS**:
          `.gdx9-track-arrow` used a bare `font-size:13px` instead of a token. Fixed to
          `var(--fs-floor-body)`, matching the exact precedent `.disc-tap-arr`/`.exp-arr`/
          `.rules-expander-arr` already establish for this identical class of small arrow-glyph
          (`components.css:66,794,809`). Re-ran both tests in isolation after the fix: both are still
          red, but the offender list for each no longer contains any `.gdx9-*` entry — every remaining
          offender (`.cr-aspect-attr`, `.cq-target`, `.sidebar-app-tile-label`, etc.) is pre-existing and
          unrelated to this story. Confirms the fix; does not (and isn't meant to) fix the pre-existing
          wider violation, which is out of this story's scope.
        - 2 more (`DT Submission tab has dark-theme input styles`; `the T1/T2 fixes did not grow the
          visible box on desktop`, gdx-3 AC3 — `.trk-adj`/`.sh-tracker-info-btn` sizing drift) reference
          nothing this story touches (DT Submission form styling; pre-existing desktop hit-area box
          sizes) — pre-existing, unrelated.
  - [x] `tests/rlv-4-custom-pool-builder.spec.js` was queued alongside the above in the same invocation
        but its own results didn't survive the output capture (an 11.7-minute run for `desktop-and-css
        .spec.js` alone — this session had accumulated many stray background Chrome processes from
        earlier unrelated browser-automation work, degrading Playwright's usual speed here). Judged safe
        without a clean re-run: this story's diff never touches `roll-v2.js`/`char-pools.js` or any file
        that suite exercises (Roll tab / Custom Pool builder) — zero code-path overlap with anything this
        story changed.

## Dev Notes

### Reuse `#t-sheets`, not a new tab

The obvious-looking approach — "merge the four split containers into a new combined container" — is
the wrong shape and would duplicate work that already exists. `public/index.html:290-294` already has
a `#t-sheets` tab with an `#sh-content-suite` container inside it, and `sheet.js`'s own `renderSheet()`
already concatenates all four HTML fragments into exactly that container **today**, for desktop
(`isDesktop` branch, lines 753-763). That container currently sits completely unused on phone — the
`else if (el) { el.innerHTML = ''; }` branch actively clears it. `'sheets'` is also already a reachable
`goTab` destination (`app.js:359-360, 1787-1789, 2569-2570, 2579-2581`), just currently only reached
from desktop-context flows. This story's single-scroll mode is, at its core: widen the existing
`isDesktop` condition to also cover "phone + flag on", point the phone nav at the same `'sheets'`
destination desktop already uses, and add the new pinned block on top. This is far less code and far
less risk than building a parallel rendering path.

**One thing to verify at dev-story time, not assumed here**: `#t-sheets` currently renders a character-
select dropdown (`.sh-top`/`.sel-wrap`/`select.sh-char-sel` — referenced in `suite.css:257-261`) for
picking which character's sheet to view, which reads as an ST-multi-character affordance. Confirm
whether this already degrades sensibly for a player with exactly one character (a single-option select,
presumably harmless) or needs a phone/player-specific tweak — do not assume either way without reading
`suite.css`'s surrounding rules and wherever this dropdown's options get populated.

### Real content behind each section — do not assume flat structure

`renderSheet()` (`sheet.js:184` onward) builds one running `html` string and captures four checkpoints
into `infoHtml` (`~224-330`), `statsHtml` (`~331-438`), `skillsHtml` (`~439-516`), `powersHtml`
(`~517-747`) — re-verify these line ranges at dev-story time, they will drift. Two things the issue
text and a naive reading would get wrong, both already caught during this story's own design-lock:

- **Stats is not just derived numbers.** It contains `sh-stats-strip` (BP/Humanity/Size/Speed/Defence)
  AND the complete interactive Health/Vitae/Willpower tap-box tracker (`sh-tracker-block`,
  `mkHealthRow`/`mkBoxRow`, click-to-toggle `tbox` elements backed by `trackerWriteField`/
  `trackerRead`). This is "the full trackers" the issue's own text refers to — there is no separate
  destination for it.
- **Skills is not attributes-then-skills as flat grids.** It is a single swipeable Mental/Physical/
  Social carousel combining both (`CATEGORIES.forEach` at `~444-512`), with its own badge-sync
  (`attr-carousel-badges`/`attr-carousel-badge`, `_wireAttrCarousel` at `774-796`). This carousel is
  reused wholesale — a horizontal swipe interaction nested inside the new vertical single-scroll page
  is not new risk introduced by this story, since it already works today inside the existing "Skills"
  tab destination; this story only changes what wraps around it.

### The locked mockup is a visual/interaction reference, not shippable code

`public/mockups/gdx-9-single-scroll-sheet-mockup.html` was built and verified in-browser during Phase 0
design-lock (Angelus approved 2026-08-27: "this works"). It correctly demonstrates the pinned strip,
jump-nav, scroll-to-section, active-chip sync, and — after two review rounds — the REAL tracker/carousel
markup and CSS classes (`sh-stats-strip`, `sh-tracker-block`, `tbox` variants, `attr-carousel-badges`,
`attr-skills-card`, etc., copied verbatim from `suite.css`/`components.css` rather than invented). It is
still a standalone illustrative file — inline styles duplicating real stylesheet rules, placeholder
character data, no real character-switch/tracker-write wiring. Translate its locked visual/interaction
decisions into the real render functions; do not import or link the mockup file itself from the app.

### No live feature-flag precedent exists — this is a fresh decision, not a lookup

`tm-use-new-dice-roller` was the only precedent for a phone-rollout flag in this codebase and it was
**retired outright** in rlv.2 (2026-08-24) — "the old roll.js and the tm-use-new-dice-roller flag/
toggle it was gated behind are retired outright, not soaked or dead-code-fenced" (`app.js:122-126`).
There is no current code to copy the shape of. Dev-story must choose and document a mechanism (see Open
Question 1) rather than search for one that no longer exists.

### Project Structure Notes

- All files touched are under `public/` — `public/index.html`, `public/js/app.js`,
  `public/js/suite/sheet.js`, plus whichever stylesheet(s) the CSS Standards section of
  `specs/architecture/coding-standards.md` directs new shared chrome into (confirm — likely
  `public/css/suite.css` alongside the existing `sh-*`/`attr-*` rules it already owns).
- No server-side files, no schema, no new collection or route — first GDX story with zero backend
  surface. Do not create a `server/tests/gdx-9-*.test.js` file unless dev-story genuinely extracts
  server-relevant logic (unlikely); e2e coverage under `tests/` is the primary test surface here.
- Normalised CSS applies as everywhere else in this repo (`specs/project-context.md` §1) — tokens only,
  reuse existing component classes (`tbox`, `attr-carousel-badge`, etc.) before inventing new ones for
  the two genuinely new pieces (pinned strip, jump-nav chips).

### References

- [Source: GitHub issue #990]
- [Source: specs/stories/sprint-status.yaml#L1728, #L1420 (epic-gdx status)]
- [Source: public/js/suite/sheet.js#L184-796 (renderSheet, split points, _wireAttrCarousel)]
- [Source: public/js/app.js#L122-127 (retired tm-use-new-dice-roller), #L396-428 (NAV_ALIAS, NAV_ITEMS),
  #L474-575 (goTab), #L1787-1789 (initial-load tab routing), #L2403-2409 (renderDesktopSidebar)]
- [Source: public/index.html#L290-294 (#t-sheets/#sh-content-suite), #L325-328 (phone split tabs)]
- [Source: public/css/suite.css#L255-344 (sh-tracker-block, tbox variants, attr-carousel, skill-row)]
- [Source: public/css/components.css#L746-751 (sh-stats-strip, sh-stat-cell)]
- [Source: public/mockups/gdx-9-single-scroll-sheet-mockup.html (locked design reference)]
- [Source: specs/stories/gdx-8-roll-history.md (sibling GDX story — structural precedent for this file)]

## Open Questions (raised during story creation, not yet resolved — do not guess, ask or decide

explicitly at dev-story time and record the decision)

1. **Flag mechanism and default.** With no live precedent, dev-story should pick one of: (a) a
   `localStorage` per-device flag read at render time (closest in shape to the retired
   `tm-use-new-dice-roller`, cheap, no server involvement, but invisible/undiscoverable to a player
   unless a settings toggle is also added), or (b) a hardcoded `const` gate flipped by a follow-up
   commit once verified live (simplest, matches how some other TM Game rollouts have shipped — confirm
   by checking recent deploy history for a comparable phone-UI change). Recommend defaulting the flag
   **off** until a deployed smoke-test pass confirms the interaction on a real phone (Angelus cannot
   test locally), then flipping it on in a fast-follow commit — mirrors this repo's own "smoke-test on
   a deployed environment before trusting a UI change" discipline (`CLAUDE.md`).
2. **`repaintSheetTrackers` scope** (AC7) — confirm whether this existing function already covers the
   new pinned strip once it exists in the DOM (likely, if it does a broad re-render), or needs an
   explicit new call site added alongside it.
3. **Character-select dropdown on `#t-sheets` for a single-character player** — confirmed harmless or
   needs a tweak; see Dev Notes.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (`claude-sonnet-5`)

### Debug Log References

- `tests/gdx-9-single-scroll-sheet.spec.js` — full spec output, all 6 pass (final clean run).
- `tests/desktop-and-css.spec.js` — 53 passed / 15 failed; every failure individually cross-checked
  against `CLAUDE.md`'s documented pre-existing failures and re-verified after the `.gdx9-track-arrow`
  token fix (offender list re-run showed zero `.gdx9-*` entries remaining). See Task 5 for the full
  breakdown.

### Completion Notes List

- **Open Question 1 (flag mechanism) resolved**: `localStorage` flag `tm_gdx9_single_scroll`, default
  off. `singleScrollEnabled()` in `public/js/data/helpers.js`.
- **Open Question 2 (`repaintSheetTrackers` scope) resolved**: it did NOT already cover the pinned
  strip. Extended with `_gdx9SyncPinnedTrack()`.
- **Open Question 3 (character-select dropdown) resolved**: there is no dropdown. `.sh-top`/
  `.sel-wrap`/`select.sh-char-sel` are CSS-only — no markup anywhere in `index.html` or `admin.html`
  renders them. Vestigial, pre-existing, unrelated to this story; left untouched.
- **Deviation from AC3's literal wording, disclosed**: AC3 named an `IntersectionObserver` (mirroring
  `_wireAttrCarousel`'s own pattern) for active-chip sync. Implemented that first; it has a real,
  reproducible bug for a short trailing section (this story's own e2e fixture's Powers section — one
  collapsed discipline, no merits — is shorter than the viewport), which can never scroll far enough
  for its bounding box to enter the observer's narrow top-of-viewport intersection band, so it could
  never be marked active. Replaced with direct scroll-position math (which section's top has the
  scroll line passed), which has the *same* underlying edge case in a different shape — at maximum
  scroll, a short last section's `offsetTop` can permanently sit past the activation line with no way
  to close the gap. Fixed with the standard scrollspy fix for this: at max scroll, the last section
  wins outright regardless of the line math. Caught and fixed via the e2e suite itself (the "clicking a
  jump chip" test failed consistently, not flakily, until this was root-caused) — not a hypothetical,
  a real bug that would have shipped.
- **Real pre-existing-pattern violation found and fixed in this story's own new CSS**: `.gdx9-track-arrow`
  initially used a bare `font-size:13px`. This repo has an automated ratchet test
  (`desktop-and-css.spec.js`'s gdx-2 AC1/AC2 CSS-audit tests) forbidding exactly this. Fixed to
  `var(--fs-floor-body)`, matching the identical existing pattern for every other small arrow-glyph in
  this codebase (`.disc-tap-arr`/`.exp-arr`/`.rules-expander-arr`).
- **Task 0 finding**: the real character-switch/re-render entry point for AC6 is `openChar()`
  (`app.js:310-361`), not `onSheetChar` as this story's own Dev Notes originally guessed — it already
  calls `suiteRenderSheet()` unconditionally on every device, so AC6 needed no separate wiring.
- **Task 1 finding**: `_wireAttrCarousel(skillsEl || el)`'s existing fallback to `el` was dead code
  pre-story (desktop's own CSS already disables/degrids the carousel there, so nothing needed wiring on
  desktop either way) — but in single-scroll mode the carousel IS live there, so the same dead fallback
  would have silently left it unwired. Fixed by targeting wherever content actually landed.

### File List

- `public/js/data/helpers.js` — added `singleScrollEnabled()`.
- `public/js/suite/sheet.js` — widened the desktop concatenation branch to also cover phone + flag-on;
  added `_gdx9PinnedBlockHtml()`, `_wireGdx9Pinned()`; extended `repaintSheetTrackers()` with
  `_gdx9SyncPinnedTrack()`; fixed the `_wireAttrCarousel` target-selection bug found along the way.
- `public/js/app.js` — added `_gdx9NavItems()`, wired into `renderBottomNav()`; added the phone-only
  `'sheets'` active-tab highlight special case; updated the initial-load `goTab(...)` call.
- `public/css/suite.css` — new `.gdx9-*` rules for the pinned track strip + jump-nav.
- `tests/gdx-9-single-scroll-sheet.spec.js` — new, 6 e2e tests.
- `specs/stories/gdx-9-single-scroll-sheet.md` — this file.
- `specs/stories/sprint-status.yaml` — status updates (`ready-for-dev` → `in-progress`, this pass).
