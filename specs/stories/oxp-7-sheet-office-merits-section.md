# Story oxp.7: Sheet Office Merits section (read-only)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a character sheet viewer,
I want a character who holds an office seat to show that office's permanent merit suite on their
sheet, read-only, the same way Domain Merits already shows a character's own permanent merits,
so that an office's institutional assets are visible without opening the Office tab.

## Why this story exists

`public/js/tabs/office-tab.js` (oxp.3/oxp.11/oxp.6) is the ONE place office merit dots are
purchased and browsed today, but it is a separate admin-style tab a viewer has to navigate to
deliberately. The character SHEET (`public/js/suite/sheet.js`) already shows every OTHER category
of permanent merit a character has (Domain, Influence, General, Standing) inline, but has nothing
for office merits at all — an officeholder's Chains of Office / Government House / Goon Squad /
Elan merit suite is invisible on their own sheet.

oxp.2's own header comment named this story (alongside oxp.6) as the intended first consumer of
`office-xp.js`'s balance functions; **that changed during oxp.6's scoping** — Angelus's direct
ruling (recorded in this story's own prior scoping session, 2026-08-13, before ACs were written)
was that this section is READ-ONLY merit DOTS only, no manoeuvres, no balance line, no steppers.
oxp.6 already shipped the balance/affordability display on the Office tab; this story does not
duplicate it.

## What this story is NOT

- **NOT editable.** `office-tab.js` stays the ONE write path for `office_merit_dots`. This section
  has no `+`/`-` steppers, no ST-only affordance of any kind — a viewing ST sees exactly what a
  player sees. Two write paths to the same collection is exactly the race/drift risk oxp.6's own
  Codex review round found and fixed elsewhere in this app; this story does not reopen it.
- **NOT manoeuvres.** The story's own name scopes it to MERITS. `content/rules/office-powers.md`'s
  own model already splits these two purchase lists conceptually (manoeuvres reset on handover,
  merits persist) — this section shows only the persisting half. `office_manoeuvre_rank` is never
  fetched by this story.
- **NOT a balance or affordability display.** oxp.6 already shipped `officeSeatXp`'s balance line
  and per-dot `title` reasons on the Office tab. This section shows purchased dots only, matching
  Domain Merits' own read-only convention (see AC5) — no "how much is left to spend" information
  belongs on a read-only sheet section.
- **NOT visible for a non-holder, and NOT visible for an unconfirmed seat match.** "Holder-only"
  means exactly that: renders nothing at all unless this specific character's `_id` is CONFIRMED
  (via `office_seats.holder_id`) to hold the seat for their own `court_category`. A character whose
  `court_category` is set but whose holder match cannot be confirmed (the same ambiguity class
  oxp.11 found and oxp.6's own Codex review caught a real information leak from) renders NOTHING —
  see AC3. This is a stricter gate than the Office tab's own reference-browsing mode, which is
  allowed to fall back to a deterministic guess; this section is never allowed to guess.
- **NOT the Administrator office's content.** No manoeuvres or merit suite exist for that office
  yet (`OFFICE_DATA['Administrator']` is absent, oxp.8 not app code) — a character holding
  Administrator renders nothing from this section, same as `office-tab.js`'s own pending-fallback
  branch already handles it.
- **NOT a new seat-resolution implementation duplicated from scratch.** See AC2 — the holder-match
  logic this story needs is the SAME logic `office-tab.js`'s `_wirePurchaseState` already has;
  extract it to a shared, exported, unit-testable function both files import, rather than writing
  a second copy that can silently drift from the first (exactly the drift risk a prior story,
  oxp.6, was reviewed against and had to patch a real bug in).

## Acceptance Criteria

1. **New exported render function**, e.g. `shRenderOfficeMerits(c)` in a sensible home — either
   `public/js/editor/sheet.js` (alongside `shRenderDomainMerits`/`shRenderMeritRow`, for the same
   "suite and editor stay byte-identical" reason `public/js/suite/sheet.js:641-646`'s own comment
   already states for Influence/Domain Merits) or a new small module if the async fetch makes that
   awkward — **decide and document the choice in Dev Notes**, do not silently split the pattern.
   Takes ONLY the character object; no `editMode` parameter exists (this section is never
   editable, unlike `shRenderDomainMerits`).

2. **Seat resolution is a SHARED, exported, unit-tested function — not a second copy of
   `office-tab.js`'s own logic.** Extract the holder-match logic currently inline in
   `office-tab.js`'s `_wirePurchaseState` (`server/routes/office-manoeuvre-rank.js` is unrelated;
   the client logic is `public/js/tabs/office-tab.js:315-364`) into an exported pure function, e.g.
   `resolveHeldSeat(char, seats)` returning the confirmed seat or `null`:
   ```js
   export function resolveHeldSeat(char, seats) {
     if (!char.court_category || !Array.isArray(seats)) return null;
     const forCategory = seats.filter(s => s && s.office_category === char.court_category);
     return forCategory.find(s => s.holder_id != null && String(s.holder_id) === String(char._id)) || null;
   }
   ```
   `office-tab.js`'s own `_wirePurchaseState` is updated to call this shared function for its
   `held` computation (line ~335-337) instead of its current inline `find`, proving the two call
   sites genuinely share one implementation rather than merely looking similar. This is
   DELIBERATELY the confirmed-only half of `office-tab.js`'s resolution (no `_fallbackSeat` call —
   this story's own gate is holder-only, see "What this story is NOT") — `resolveHeldSeat` returning
   `null` means "render nothing", not "fall back to a guess".

3. **The section renders nothing at all** (`return ''` from the synchronous render, and the async
   patch appends nothing) when: `char.court_category` is falsy; `resolveHeldSeat` returns `null`
   (no confirmed seat — the ambiguous-match case this story explicitly refuses to guess at, per
   "What this story is NOT"); `OFFICE_DATA[char.court_category]` is absent (Administrator); the
   `/api/office_seats` or `/api/office_merit_dots` fetch fails; or the resolved office has zero
   merits (impossible today given `OFFICE_DATA`, but do not assume it stays that way — same
   `if (!list.length) return ''` guard `shRenderDomainMerits` already uses for domain merits).

   **Codex review, oxp.7 — literal-wording clarification (not a scope change):** the "`return ''`
   from the synchronous render" clause is satisfied EXACTLY by the two cases the synchronous
   `shRenderOfficeMerits(c)` can itself decide (no `court_category`, no `OFFICE_DATA` entry). The
   other three cases in this list (unconfirmed seat, failed fetch, zero-merit office) cannot be
   known synchronously — AC7 mandates fetching asynchronously via a reserved DOM slot precisely
   because of this — so for those three, `shRenderOfficeMerits` still returns its (invisible,
   content-free) placeholder markup, and the async patcher (`patchOfficeMerits`) simply never fills
   it. The user-visible outcome is identical either way (nothing renders, nothing discloses), but
   "renders nothing" for those three cases means "the reserved placeholder's `innerHTML` stays
   empty", not a literal `return ''` from the render call itself. AC9's matching test wording is
   read the same way.

4. **Data flow.** `public/js/suite/sheet.js` gains `import { apiGet } from '../data/api.js';` (not
   currently imported there). The section fetches `GET /api/office_seats` (array,
   `{_id, office_category, holder_id, created_at, seat_label, notes}[]`) and
   `GET /api/office_merit_dots` (map, `{[seatId]: {[meritName]: number}}` — a seat never purchased
   into has no key, treat as `{}`) — the SAME two endpoints `office-tab.js`'s `_wireMeritDots`
   already reads, in the SAME "missing key means 0" convention. `MERIT_DOT_CAPS`/`OFFICE_DATA` come
   from `public/js/tabs/office-data.js`, already the shared source both this section and the Office
   tab read from — do not duplicate the merit-name-to-cap table.

   **Codex review, oxp.7 — deviation from this AC's literal file, recorded not silently absorbed:**
   AC1 put `shRenderOfficeMerits`/`patchOfficeMerits` in `public/js/editor/sheet.js` (the same home
   `shRenderDomainMerits` lives in), so `apiGet` is imported THERE, not in `public/js/suite/sheet.js`
   as this AC's literal text says. `suite/sheet.js` only imports the two new function names from
   `editor/sheet.js`, same as every other merit-section render function it already re-exports that
   way. This was the right call once AC1's own home decision landed — `editor/sheet.js` is already
   this section's home, so its fetch belongs with it, not bounced through the thin re-export layer —
   but AC1's own "decide and document the choice in Dev Notes" instruction was not actually followed
   at the time; see the Dev Notes entry added during this review for the record that should have
   existed from the start.

5. **Dot display matches Domain Merits' own read-only convention, not the Office tab's editable
   one.** `shRenderDomainMerits`'s read-only path shows `shDots(purchasedDots)` — filled dots only,
   no hollow-to-cap filler — because a read-only sheet section is not a purchase interface and
   showing "room left to buy" belongs to the editable Office tab, not here. Use `shDots(n)` (from
   `public/js/data/helpers.js`, already used throughout `sheet.js`), NOT `office-tab.js`'s
   `_dotsWithReasons`/`shDotsWithBonus` (both of which render unpurchased dots as hollow markers —
   wrong signal for a section that isn't showing affordability). Reuse `shRenderMeritRow`
   (`public/js/editor/sheet.js:2837`, the generic row shell Influence Merits' own read-only path
   already calls) for each row rather than hand-rolling new row markup — it already produces the
   exact `trait-row`/`trait-name`/`trait-dots`/`merit-plain` shape this story wants, with zero
   Domain-Merits-specific baggage (compounds, sharing, MCI pools) to strip out.

6. **Section wrapper matches the sibling sections' own convention**: `<div class="sh-sec"><div
   class="sh-sec-title">Office Merits</div><div class="merit-list">...</div></div>`, inserted
   immediately after the `shRenderDomainMerits(c, false)` call in `public/js/suite/sheet.js`
   (currently line 649), before the `// ── Standing Merits ──` block (currently line 651) — matches
   the existing section ordering; do not insert it elsewhere without a stated reason.

7. **Async fetch-and-patch, following `public/js/suite/status.js`'s established
   `appendOfficeActionsLog` pattern** (`renderSuiteStatusTab` reserves an empty mount div
   synchronously, then a separate un-awaited async function fetches and appends into it) — NOT a
   blocking `await` inside `renderSheet` itself, which stays synchronous.
   - **The synchronous render reserves the slot(s)** using a `data-` attribute keyed to the
     character id, e.g. `data-office-merits-char="${esc(String(c._id))}"`, NOT a single hardcoded
     element id. `renderSheet`'s own header comment (around line 743-744) already warns that
     `toggleExp`/`toggleDisc` break across the desktop-vs-mobile-split render targets because of
     duplicate ids — a single `id="office-merits-slot"` would hit the exact same collision the
     moment mobile-split rendering populates more than one container with the same character's
     sheet. Use `document.querySelectorAll('[data-office-merits-char="..."]')` to find every
     instance (desktop + whichever mobile containers are active) and populate all of them from one
     fetch.
   - **A render-generation guard is mandatory**, mirroring `office-tab.js`'s own
     `el._officeManoeuvreGen` pattern exactly (a counter bumped on every `renderSheet` call,
     captured before the async fetch's first `await`, checked before the DOM write) — without it, a
     late-resolving fetch from a PREVIOUS character's sheet view can paint that character's office
     merits into whatever sheet is on screen by the time it resolves, after the viewer has already
     switched characters. This is not hypothetical: `office-tab.js`'s own review round found and
     fixed exactly this failure mode ("an adjustment resolving after a category switch must not
     repaint the new category").

8. **Design-system compliance.** No bare hex, no `rgba()`, no inline `style="..."` (`specs/project-
   context.md` §1). Every class used (`sh-sec`, `sh-sec-title`, `merit-list`, and whatever
   `shRenderMeritRow` emits) already exists and is reused verbatim — this story should not need to
   add a single new CSS rule.

9. **Tests.**
   - New pure-function tests for `resolveHeldSeat`: confirmed holder match returns the seat;
     `court_category` set but no holder match returns `null` (the ambiguous case, proven to NOT
     fall back to a guess — this is the one property this story exists to get right); no
     `court_category` returns `null`; malformed/missing `seats` array returns `null` rather than
     throwing.
   - `office-tab.js`'s own `_wirePurchaseState` test coverage (`server/tests/issue-1141-office-tab-
     render.test.js`) must still pass unchanged after AC2's extraction — re-run the full targeted
     gate, not just the new tests, since AC2 touches shared logic a prior story's own tests already
     pin.
   - New direct-unit tests for `shRenderOfficeMerits`/the render logic: a holder with a confirmed
     seat and some purchased dots renders the expected `sh-sec`/rows; a non-holder renders `''`; an
     unconfirmed match (court_category set, no holder_id match) renders `''` — this is the
     regression test for the exact bug class oxp.6's review found, proven here too rather than
     assumed inherited; an Administrator holder renders `''`.
   - New wired-integration test (mirroring `issue-1141-office-tab-render.test.js`'s fake-DOM +
     `globalThis.fetch` stub technique, or `suite/sheet.js`'s own equivalent if one already exists
     — confirm which during dev) proving the render-generation guard: two sheet renders for
     different characters in quick succession, the first's fetch resolves LAST, and its office
     merits never appear on the second character's sheet.
   - Run targeted: whatever new test file this story adds, plus
     `issue-1141-office-tab-render.test.js` (AC2's shared-function extraction touches it), plus any
     existing `sheet.js`/`suite/sheet.js` test file found during dev. Live `tm_suite` never
     connected to or written to.

## Tasks / Subtasks

- [x] Task 1 — Extract shared seat resolution (AC: 2)
  - [x] Add exported `resolveHeldSeat(char, seats)` in the chosen home file.
  - [x] Update `office-tab.js`'s `_wirePurchaseState` to call it for its `held` computation.
  - [x] New pure-function tests; confirm `issue-1141-office-tab-render.test.js` still passes
        unchanged.
- [x] Task 2 — New render function and data fetch (AC: 1, 3, 4, 5, 6)
  - [x] `shRenderOfficeMerits(c)` — synchronous shell emitting the reserved slot(s) or `''`.
  - [x] Async patcher fetching seats + merit dots, resolving via `resolveHeldSeat`, rendering rows
        via `shRenderMeritRow` + `shDots`.
  - [x] Wire into `public/js/suite/sheet.js` at the stated insertion point.
- [x] Task 3 — Render-generation guard and multi-container safety (AC: 7)
  - [x] Data-attribute slot keying, not a hardcoded id.
  - [x] Generation counter, captured before the fetch, checked before every DOM write.
- [x] Task 4 — Tests (AC: 9)
  - [x] Pure-function tests for `resolveHeldSeat`.
  - [x] Direct-unit render tests (holder/non-holder/unconfirmed/Administrator).
  - [x] Direct-unit test proving the render-generation-guard MECHANISM (two back-to-back
        `patchOfficeMerits` calls). Codex review, oxp.7: this does NOT drive a real `renderSheet()`
        call for either character and so does not exercise the desktop/mobile container-replacement
        wiring end to end — corrected from an earlier "wired-integration" framing that overstated
        this. See Dev Notes for why a full `renderSheet()` harness was not built.
  - [x] Targeted gate: new file(s) + `issue-1141-office-tab-render.test.js` + any existing sheet
        test file. Prove-discrimination on AC2's shared-extraction and AC3's confirmed-only gate
        (revert each independently, confirm the exact expected tests fail, restore).

## Dev Notes

### Module-home decision (AC1) — recorded during Codex review, oxp.7, not at original dev time

AC1 asked for this decision to be made and documented in Dev Notes at dev time; that step was
skipped, which Codex review, oxp.7 caught (see AC4's own added note). The decision, recorded now:
`shRenderOfficeMerits`/`patchOfficeMerits` live in `public/js/editor/sheet.js`, alongside
`shRenderDomainMerits`/`shRenderMeritRow` — NOT a new small module. Reasoning: `editor/sheet.js` is
already the one place every other merit-section render function lives, `suite/sheet.js` re-exports
by name rather than owning any render logic itself (see its own comment at the Influence/Domain
Merits import line), and `shRenderMeritRow`'s zero-baggage row shell is reused directly with no
adapter needed by keeping both in the same file. The async fetch (`apiGet`) living in `editor/sheet.js`
rather than `suite/sheet.js` is therefore a deliberate consequence of this choice, not a slip against
AC4's literal file name — `suite/sheet.js` was never going to own network I/O for a section it
doesn't render the internals of.

### Known test-coverage limitation (AC7) — recorded during Codex review, oxp.7

The AC9 "wired-integration test" for the render-generation guard calls `patchOfficeMerits` directly
for two characters in quick succession; it does NOT call `renderSheet()` for either one, so it proves
the module-scoped `_officeMeritsGen` counter mechanism itself but not the real desktop/mobile
dual-container replacement wiring in `suite/sheet.js` end to end. Building a full fake-DOM harness for
`renderSheet()` was considered and deliberately not done: that function touches dozens of DOM
elements across the whole sheet (health tracker, attributes, skills, disciplines, equipment, tabs),
this codebase has no jsdom by design, and a harness large enough to drive it correctly would be a
disproportionate undertaking for proving one guard property already covered at the unit level. This
is a disclosed, accepted gap, not a silently-dropped requirement — a future story touching
`renderSheet()`'s own test coverage more broadly is the right place to close it, not a follow-up patch
bolted onto this one.

### Previous story intelligence (oxp.6, this session)

- **oxp.6's own Codex review found a real information-disclosure bug** from EXACTLY this story's
  own risk surface: an unconfirmed own-office view (category matches, no holder_id match) leaked
  another seat's real data as if it were the viewer's own. AC3's "render nothing when unconfirmed"
  rule is this story's own defence against the identical bug class — do not weaken it to "show the
  fallback seat with a disclaimer note" the way `office-tab.js`'s reference-browsing mode does; that
  mode exists for STs/reference browsing, this section does not have that use case.
- **Duplicated logic is exactly what caused a review-round patch cycle before** (oxp.6's own
  `meritDotsBlock`/`seatResolutionBlock` source-contract tests had to be re-scoped when shared logic
  moved between functions). AC2's shared-extraction is deliberately upfront about this risk rather
  than discovering it during review.
- **`office-tab.js`'s render-generation guard (`el._officeManoeuvreGen`) is a proven, load-bearing
  pattern**, not incidental — TWO separate review rounds (oxp.3, oxp.6) found real late-resolving-
  fetch bugs in this exact shape. AC7 mandates the same discipline here rather than treating it as
  optional because this is "just a read-only display."

### Architecture compliance

- **Derived stats are never stored.** Every number/dot this section shows is computed at render
  time from already-fetched documents. Nothing new is written to any collection.
- **Reference data has one home.** `OFFICE_DATA`/`MERIT_DOT_CAPS` are read from
  `public/js/tabs/office-data.js`, never duplicated.
- **CSS tokens only, reuse before inventing.** See AC8.
- **British English, no em-dashes** in any string this story writes.

### Project Structure Notes

- Files touched: `public/js/tabs/office-tab.js` (AC2, extraction only — no behaviour change),
  `public/js/suite/sheet.js` (new import, new call site), and either `public/js/editor/sheet.js`
  (if `shRenderOfficeMerits` lives there per AC1) or a new small module — **decide during dev,
  document the choice**.
- New test file(s) named per this story's key, matching the project's own convention (e.g.
  `oxp-7-sheet-office-merits-section.test.js` for the render/resolution logic).
- Deliberately unchanged: `server/routes/office-merit-dots.js`, `server/routes/office-seats.js`,
  `office-tab.js`'s own rendering functions (only the seat-resolution extraction touches it),
  `office-xp.js` (no balance is computed by this story).

### References

- [Source: `public/js/editor/sheet.js:1113-1750`] — `shRenderDomainMerits`, the read-only-vs-edit
  split, and `shRenderMeritRow` (line 2837), the generic row shell this story reuses.
- [Source: `public/js/suite/sheet.js:641-651`] — the Influence/Domain Merits insertion point and
  its own "suite and editor stay byte-identical" rationale comment.
- [Source: `public/js/tabs/office-tab.js:315-364`] — the holder-match logic AC2 extracts, and the
  render-generation guard pattern AC7 mirrors.
- [Source: `public/js/suite/status.js:262-300, 412, 438`] — `appendOfficeActionsLog`, the async
  fetch-and-patch-a-reserved-slot precedent AC7 follows.
- [Source: `server/routes/office-merit-dots.js:16-33`, `server/routes/office-seats.js:52-84`] —
  the two GET routes' exact response shapes.
- [Source: `public/js/tabs/office-data.js`] — `OFFICE_DATA`/`MERIT_DOT_CAPS`.
- [Source: `specs/stories/sprint-status.yaml`, `oxp-7-sheet-office-merits-section` entry] — the
  2026-08-13 scoping session's own rulings (read-only; holder-only) this story implements.
- [Source: `specs/stories/oxp-6-office-tab-purchase-markers.md`, Senior Developer Review] — the
  unconfirmed-own-office leak this story's AC3 is written specifically to not repeat.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- Home for `shRenderOfficeMerits`/`patchOfficeMerits` decided as `public/js/editor/sheet.js`
  (AC1's "byte-identical suite/editor" rationale), inserted between `shRenderDomainMerits` and
  `shRenderStandingMerits` — no new module needed, the async fetch fit the existing file cleanly.
- Test-setup bug found and fixed during Task 2/4: `server/tests/oxp-7-sheet-office-merits-
  section.test.js` never stubbed `globalThis.localStorage`, so `public/js/data/api.js`'s
  `headers()` (called synchronously before `fetch`) threw a `ReferenceError` that
  `patchOfficeMerits`'s own `catch { return; }` silently swallowed — 3 tests were passing for the
  wrong reason (the AC3-correct empty result, via an unrelated crash rather than a genuine
  unconfirmed/failed-fetch path). Fixed by adding the same Map-backed `localStorage` shim
  `issue-1141-office-tab-render.test.js` already uses. Not a source bug — `patchOfficeMerits`'s
  fail-silent behaviour is exactly what AC3 wants; the test just needed to exercise the real path.
- Prove-discrimination performed with single-line reverts (each applied, tested, reverted,
  re-verified green): AC2's shared extraction (Task 1, prior session — reverting `office-tab.js`'s
  `held` computation to `null` failed 6 tests in `issue-1141-office-tab-render.test.js`); AC7's
  render-generation guard (`if (gen !== _officeMeritsGen) return;` neutralised — failed the
  late-resolving-fetch test); AC3's confirmed-only gate (`if (!seat) return;` neutralised — failed
  the unconfirmed-match test, via the expected downstream `seat._id` TypeError on a null seat).

### Completion Notes List

- AC1: `shRenderOfficeMerits(c)` added to `public/js/editor/sheet.js`, synchronous shell only,
  takes just the character (no `editMode` — this section is never editable).
- AC2: `resolveHeldSeat(char, seats)` extracted to new `public/js/data/office-seat-resolve.js`,
  confirmed-only (no fallback guess). `office-tab.js`'s `_wirePurchaseState` now calls it for its
  own `held` computation, proving one shared implementation.
- AC3: `patchOfficeMerits` renders nothing for no-`court_category`, unconfirmed seat, Administrator
  (no `OFFICE_DATA` entry), a failed fetch, or an empty merit list. Codex review, oxp.7: the original
  wording here ("all four paths covered by direct-unit tests") overclaimed — only the first four were
  directly tested at the time; the empty-merit-list path existed in code but had no test exercising it
  (no current `OFFICE_DATA` entry has an empty list). Closed with a new dedicated test file,
  `oxp-7-office-merits-empty-list-guard.test.js`, using this codebase's own established `vi.mock`
  convention to synthesise a zero-merit office. All five paths are now directly tested and
  prove-discriminated.
- AC4: fetches `GET /api/office_seats` + `GET /api/office_merit_dots` via `apiGet`, same
  missing-key-means-0 convention as `office-tab.js`. `OFFICE_DATA`/`MERIT_DOT_CAPS` read from
  `office-data.js`, not duplicated.
- AC5: uses `shDots(n)` (purchased-only, filled dots), not `office-tab.js`'s hollow-to-cap
  conventions — asserted directly in tests (`.not.toContain('pointed hollow')`).
- AC6: `sh-sec`/`sh-sec-title`/`merit-list` wrapper, inserted in `suite/sheet.js` immediately after
  `shRenderDomainMerits(c, false)`, before Standing Merits.
- AC7: data-attribute slot (`data-office-merits-char`) + `document.querySelectorAll`, not a
  hardcoded id. Module-scoped `_officeMeritsGen` counter mirrors `office-tab.js`'s own per-element
  guard; proven live via a two-`patchOfficeMerits`-call direct-unit test plus a single-line-revert
  prove-discrimination pass. Codex review, oxp.7: two overclaims corrected — (1) that source comment
  said "safe under desktop/mobile dual-container rendering" and that this is proven by a
  "wired-integration test"; in reality `renderSheet()` only ever writes into ONE of its two
  containers per call (never both), and the guard test calls `patchOfficeMerits` directly rather than
  driving `renderSheet()` at all. Both claims corrected in the source comment and this story's own
  Dev Notes/Task 4 checkbox — see the new "Known test-coverage limitation" Dev Note for why a full
  `renderSheet()` test harness was deliberately not built. (2) The whole function body past the fetch
  is now wrapped in try/catch (was previously only the `Promise.all` call) — a throw anywhere after a
  successful fetch would otherwise have escaped as an unhandled promise rejection, since
  `patchOfficeMerits` is called un-awaited with no `.catch()`. New test proves this; prove-discriminated.
- AC8: no new CSS — every class reused verbatim from the existing Domain/Influence Merits sections.
- AC9: 20 tests total across two files — `oxp-7-sheet-office-merits-section.test.js` (7 pure
  `resolveHeldSeat`, 4 synchronous-shell, 7 async-patch, 1 render-generation-guard mechanism) and the
  new `oxp-7-office-merits-empty-list-guard.test.js` (1), all passing for genuine reasons after the
  `localStorage`-shim fix. Full targeted gate: these two files + `issue-1141-office-tab-render.test.js`
  (57 tests) — 77/77 passing. Also ran the broader set of every test file referencing
  `editor/sheet.js`/`suite/sheet.js` (18 files) as an extra regression check beyond the story's own
  AC9 scope; one pre-existing failure (`n7-n9-allocator-readers.test.js`, the documented #1115 issue)
  and two pre-existing broken files (`issue-836-legacy-tracker-cache-removed.test.js` — ENOENT on a
  since-moved `suite/tracker.js`; `n8-mandragora-prereq.test.js` — syntax error) were confirmed
  present on the unmodified tree via `git stash`. Codex review, oxp.7 — wording correction: two of
  those three files DO source-read `public/js/editor/sheet.js`/`suite/sheet.js` via static-contract
  regex (though none reference any symbol this story adds — `resolveHeldSeat`, `shRenderOfficeMerits`,
  `patchOfficeMerits`, or the modified Office-tab function), so the original "does not import,
  reference, or otherwise depend on anything this diff touches" was an overbroad claim; the narrower
  and accurate claim — their failures are unrelated to this diff's own new symbols — was independently
  reproduced by Codex's own review (see its findings file) and stands.

### Senior Developer Review (AI)

**Reviewer:** Codex (external, via the `codex-review` skill — `codex exec`, `gpt-5.6-sol`, high
reasoning effort, 3-pass adversarial protocol: Blind Hunter / Edge Case Hunter / Acceptance Auditor).
**Date:** 2026-08-14. **Outcome:** Changes requested → all findings triaged and closed this session.
Full raw findings: `specs/stories/code-review/oxp-7-sheet-office-merits-section-codex-findings.md`.

No High-severity findings. 5 Medium, all triaged as **patch** and closed:

1. The AC7 "wired-integration" guard test never calls `renderSheet()` — corrected framing (Dev Notes,
   test docstring, Task 4 checkbox) rather than building a disproportionate full-`renderSheet()` test
   harness (see the new "Known test-coverage limitation" Dev Note for the reasoning).
2. The empty-merit-list branch (`if (!meritNames.length) return;`) had no direct test coverage —
   closed with a new file using this codebase's own `vi.mock` convention.
3. AC4's literal "`suite/sheet.js` gains `apiGet`" wording didn't match the AC1-driven module home
   actually chosen, and AC1's own "document the choice in Dev Notes" instruction was never followed —
   both closed: the Dev Notes decision record now exists, and AC4 carries an explanatory note.
4. AC3's literal "`return ''`" wording doesn't hold for the three cases only resolvable async — closed
   with a clarifying note on AC3 reconciling it with AC7's async-slot design; the implementation was
   already correct, only the spec wording was imprecise.
5. `patchOfficeMerits` had an unhandled-promise-rejection hole for any throw after a successful fetch
   (only the `Promise.all` call was wrapped) — widened the `try` to cover the whole function body,
   with a new test and prove-discrimination pass.

11 Low findings, all reviewed: 2 corrected as documentation-accuracy fixes (the multi-container
doc-comment overclaim, and this story's own overbroad "does not reference" wording — see AC7/AC9
notes above); the remaining 9 were the reviewer's own Pass 2/Pass 3b refutations of its own Pass 1
concerns (category-equivalence, resolver-comment parity, the five-dot fallback, the request-failure
UX tradeoff, and the null-character `renderSheet()` path) confirming no further action was needed —
dismissed with evidence, no code or doc change required for those.

Codex independently reproduced all three of this story's own prove-discrimination claims (AC2's
shared extraction, AC7's original render-generation guard, AC3's confirmed-only gate) by making the
same single-line changes itself and confirming the named tests failed exactly as claimed, then
restoring and verifying SHA-256-identical source files. Full targeted gate after all patches: 77/77
(up from 75/75 pre-review, +2 for the new empty-list-guard and post-fetch-throw tests).

### File List

- `public/js/data/office-seat-resolve.js` (new)
- `public/js/tabs/office-tab.js` (modified — AC2 extraction only, no behaviour change)
- `public/js/editor/sheet.js` (modified — AC1/3/4/5/6/7 new functions; Codex review round widened
  the `patchOfficeMerits` try/catch and corrected two doc-comment overclaims)
- `public/js/suite/sheet.js` (modified — AC6/7 wiring)
- `server/tests/oxp-7-sheet-office-merits-section.test.js` (new; Codex review round added a
  post-fetch-throw test and retitled the render-generation-guard describe block)
- `server/tests/oxp-7-office-merits-empty-list-guard.test.js` (new, Codex review round)
