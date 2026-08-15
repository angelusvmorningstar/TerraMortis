# Story oxp.6: Office-tab purchase and affordability markers

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST or officeholder viewing the Office tab,
I want purchased and unpurchased merit/manoeuvre dots to render with the app's real dot system and to
show WHY an unpurchased dot isn't bought yet (on tap/hover, not as a second visual state),
so that office progress reads consistently with the rest of the sheet and a viewer can tell "not enough
XP" apart from "haven't reached that rank yet" without guessing.

## Why this story exists

Two real gaps, both already flagged by name in prior stories' own Dev Notes, converge here:

1. **`office-tab.js` still hand-builds raw Unicode dots.** `manoeuvreRankHtml` (`public/js/tabs/office-tab.js:62-74`)
   does `'●'.repeat(n) + '○'.repeat(...)`; `_wireMeritDots` (lines 347-362) does the identical thing
   inline for merits. The rest of the app abandoned this pattern for `.pointed`/`.pointed.hollow`
   CSS-rendered dots (`public/css/components.css:53-56`) specifically because Unicode ●/○ render at
   different sizes per platform, iOS Safari included — that comment is on the CSS rule itself. A
   ready-made helper already exists and is used everywhere else: `shDots`/`shDotsWithBonus` in
   `public/js/data/helpers.js:98-149`.
2. **Nothing consumes `office-xp.js`'s balance functions.** `officeSeatXp`/`officeXpSpentForCategory`/
   `officeMonthsAccrued` (`public/js/data/office-xp.js`) have existed since oxp.2 (2026-08-13) with zero
   callers — the module's own header comment says so explicitly: "nothing consumes these numbers until
   oxp.6 (purchase markers) or oxp.7 (sheet section)". This is that first consumer.

oxp.5 (handover logic, merged to `main` 2026-08-14) left a **hard, explicit dependency** on this story,
recorded in its own sprint-status entry and repeated in `office-xp.js`'s own doc comment on
`officeXpSpentForCategory`: office spend is DERIVED from current state (merit dots + manoeuvre rank), so
when oxp.5's handover route resets a manoeuvre rank to 0, the derived spend total silently DROPS and the
balance RISES by exactly the amount `content/rules/office-powers.md`'s own ruling says must be destroyed
— a refund, which the ruling forbids in as many words ("the running balance is total accrued since
creation, minus everything ever spent, **INCLUDING THE SPEND THAT HAS SINCE BEEN LOST**"). oxp.5 captures
a cumulative `manoeuvre_xp_destroyed` counter on the seat's `office_manoeuvre_ranks` document at reset
time specifically so this story could fold it back in — and does not consume it itself. **If this story
ships a balance without adding that counter to spend, the balance is simply wrong, silently, with no way
to detect it after the fact** (the destroyed XP is gone from everywhere else once reset happens).

## What this story is NOT

- **NOT seat CRUD.** Office seats are still created/deleted only by oxp.1's manual seed script. oxp.5
  removed the admin panel's old Add/remove-slot buttons because they wrote broken data; nothing here
  reinstates them. Flagged, storyless gap, unchanged.
- **NOT oxp.9's spend-approval routing.** Merit-dot and manoeuvre-rank purchases stay direct ST-set state
  through the existing `+`/`-` steppers. No OAQ approval gate is added to office purchases by this story.
- **NOT oxp.7's sheet section.** That is a separate, holder-only, **read-only** summary elsewhere in the
  app (`public/js/suite/sheet.js`, parallel to the existing Domain Merits pattern). This story only
  touches the Office tab itself (`public/js/tabs/office-tab.js`), the one surface with the `+`/`-`
  steppers.
- **NOT the Administrator's content.** No manoeuvres or merit suite have been written for that office yet
  (oxp.8, not app code). This story's markers render nothing extra for Administrator, exactly as today —
  `OFFICE_DATA['Administrator']` is still absent and `renderOfficeTab` already handles that branch.
- **NOT a change to who can purchase or who can see purchase state.** The existing `_isST()` stepper gate
  and the holder-or-ST-only visibility Angelus ruled on directly during oxp.6's own 2026-08-13 scoping
  session (real balance/affordability numbers stay off a reference viewer's DOM, exactly as otc.3 already
  keeps existing purchase state off it) are both unchanged and reused as-is.
- **NOT a new write path.** `PUT /api/office_merit_dots/:seatId` and `PUT /api/office_manoeuvre_rank/:seatId/step`
  are reused exactly as they are. The one write-shaped change in this story is a **read**-route response
  shape (AC1), not a new write.
- **NOT a seat picker.** oxp.11's disclosure note (`_seatNote`, `office-tab.js:293-300`) already names
  which seat is on screen for a multi-seat category; oxp.6's own prior scoping note flagged that "a real
  seat picker belongs here" as future work, but building one is out of scope for THIS story — it touches
  purchase markers, not seat resolution. `_wirePurchaseState`'s existing seat-resolution logic
  (`office-tab.js:217-265`) is read, not rewritten.

## Acceptance Criteria

1. **`GET /api/office_manoeuvre_rank`'s response shape changes to carry `manoeuvre_xp_destroyed`.**
   Today (`server/routes/office-manoeuvre-rank.js:15-21`) the route returns `{ [seatId]: rank }` — a bare
   integer per seat — and `manoeuvre_xp_destroyed` (written by oxp.5's reset, in the same document) is
   never read back anywhere. Change the route's per-seat value from a bare number to
   `{ rank, manoeuvre_xp_destroyed }`:
   ```js
   for (const doc of docs) out[doc._id] = { rank: doc.rank || 0, manoeuvre_xp_destroyed: doc.manoeuvre_xp_destroyed || 0 };
   ```
   This is the one existing endpoint the destroyed counter can reach the client through — no new route.
   **This is a breaking shape change for the route's one existing consumer** (`office-tab.js`'s
   `_wireManoeuvreRank`, AC2) and for **four existing test assertions** in
   `server/tests/oxp-3-office-manoeuvre-rank.test.js` that currently read the value as a bare number:
   lines 106 (`expect(res.body[ENFORCER]).toBe(3)`), 116, 163-164, and 245. Update all four to read
   `.rank` off the object instead. The `PUT /:seatId` and `PUT /:seatId/step` routes' own response bodies
   (`res.body.rank` at lines 133, 242, 291 etc.) are a **different, unrelated response shape** (the
   updated document itself) and are NOT touched by this AC.

2. **`office-xp.js`'s `officeXpSpentForCategory` folds `manoeuvre_xp_destroyed` into spend.** Its raw-
   document branch (`public/js/data/office-xp.js:180-185`) currently reads only `manoeuvreRankDoc.rank`.
   Add: `rankXp = (manoeuvreRankDoc.rank || 0) + (manoeuvreRankDoc.manoeuvre_xp_destroyed || 0)` on that
   branch only. **Do not touch the bare-number branch** (`typeof manoeuvreRankDoc === 'number'`) — a
   caller passing a bare rank has no way to also supply a destroyed count, and that branch's existing
   callers/tests must be unaffected. This is oxp.5 Finding 1's hard requirement, closed. Existing
   `oxp-2-derived-office-xp-calculation.test.js` AC8 tests (Primogen/Socialite `spendKnown: false`) must
   stay green unchanged — this AC only changes what a raw-document `manoeuvreRankDoc` sums to, not the
   `spendKnown` logic in `officeSeatXp`/`officeSpendKnownByCategory` (untouched by this AC; see AC5 for
   why `spendKnown` itself is in scope elsewhere in this story).

3. **`office-tab.js` consumes the new shape (AC1) and calls the balance functions (AC2's output).**
   `_wireManoeuvreRank`'s read of `ranksBySeat[outcome.seatId]` changes from `Number(...)` on the whole
   value to reading `.rank` off it (`server/routes/office-manoeuvre-rank.js` AC1's new shape). Add a
   sibling fetch — inside `_wirePurchaseState` (`office-tab.js:217-265`, which already fetches seats once
   per render pass and hands the resolved `outcome` to both `_wireMeritDots` and `_wireManoeuvreRank`) —
   for this seat's `office_merit_dots` and `office_manoeuvre_rank` documents TOGETHER, and call
   `officeSeatXp(seat, seats, meritDotsDoc, manoeuvreRankDoc, now)` (imported from `../data/office-xp.js`)
   to get `{ earned, spent, left, spendKnown }`. `now` = `new Date()` read ONCE per render pass, not
   inside a loop or a sub-function — this is the one place in this render path allowed to read the clock
   (`office-xp.js` itself never does, by design; see its header comment). The render-generation guard
   (`el._officeManoeuvreGen`, already threaded through every async step in this file) applies to this new
   fetch exactly as it does to the seats/merit-dots/rank fetches already there — a stale `gen` abandons
   the write, same as every other guarded write in this file.

4. **Raw Unicode dot-building is replaced by `shDots`/`shDotsWithBonus`.** Both `manoeuvreRankHtml`
   (`office-tab.js:62-74`) and `_wireMeritDots`'s inline dot string (lines 347-362) stop hand-building
   `'●'.repeat(n) + '○'.repeat(...)` and instead call `shDotsWithBonus(n, capOrCount - n)` from
   `public/js/data/helpers.js` (already imported nowhere in this file — add the import). No new dot-
   rendering code is written; this is a straight swap onto the existing helper the rest of the app already
   uses for exactly this shape (filled dots followed by hollow dots).

5. **Unpurchased dots render as `.pointed.hollow` — one muted visual state, never two.** Whether a dot is
   unbought because the seat's `left` (from AC3's `officeSeatXp` call) can't cover its cost, or because a
   manoeuvre's rank order hasn't been reached yet (the existing `office-manoeuvre-unpurchased` muting —
   `office-tab.js:41-42` — stays as the class that hides the manoeuvre's name/effect text; the DOT itself
   for an unpurchased manoeuvre or merit is what this AC scopes), the dot is visually identical: hollow. Do
   **not** invent a second colour, opacity tier, or shape to distinguish "can't afford" from "rank not
   reached" — `shDotsWithBonus` already renders exactly two dot states (filled/hollow) and this story does
   not add a third.

6. **The reason is a tap/hover disclosure on the dot itself, not a new visual state.** Reuse the existing
   `opts.hollowMod`/`title` mechanism `shDotsWithBonus` already supports (`helpers.js:124-149`, the same
   convention `stm-modded-dot`+`title` already establishes for a different purpose) to attach a `title`
   attribute per unpurchased dot naming why it isn't bought:
   - **Manoeuvres**: a dot beyond the office's current rank gets `title="Reach rank N first"` (N = the
     rank immediately below this dot's own rank) when rank order is the blocker; a dot AT the reachable
     rank but beyond `left` gets `title="Not enough office XP (N short)"` when affordability is the
     blocker. A dot can only be blocked by one reason at a time — rank order is checked first, since an
     unreached rank cannot be bought regardless of balance.
   - **Merits**: no rank-order gate exists (merit dots are independently settable), so every unpurchased
     merit dot beyond `left` gets `title="Not enough office XP (N short)"`; one within `left` gets no
     title at all (a plain hollow dot the ST could buy right now).
   This is server-XP-derived text rendered client-side from AC3's already-fetched numbers — no new
   endpoint, no new stored field.

7. **A balance line renders per office section**, using AC3's `officeSeatXp` output: e.g.
   `"7 of 14 XP spent — 7 remaining"` (earned/spent/left). Placed once, near the Manoeuvres section header
   (both the Manoeuvre and Merit sections draw from the SAME seat balance — `office-xp.js`'s ruling is
   explicit that the holder decides the split between the two, there is no separate manoeuvre-only or
   merit-only budget). Rendered **holder-or-ST-only** (Angelus's ruling, this story's own 2026-08-13
   scoping session): a reference viewer (`!isOwnOffice && !_isST()`) sees NOTHING from this AC at all —
   `_wireManoeuvreRank`'s existing early return for that case (`office-tab.js:426`) already sits above
   every purchase-state write in the function; this story's balance write must sit below that same guard,
   not introduce a second one.
   - **`spendKnown` from `officeSeatXp` is superseded for display purposes by this story.** `officeSeatXp`
     still reports `spendKnown: false` for Primogen/Socialite (any category with >1 seat) — a flag
     deliberately RETAINED, unchanged, by oxp.2 and oxp.11 specifically for "the first real consumer" to
     decide what to do with (`office-xp.js:204-211`, `259-263`). Since oxp.11 (2026-08-13) both purchase
     collections ARE seat-keyed, so `earned`/`spent`/`left` for the SEAT this story resolves (via
     `_wirePurchaseState`'s existing `outcome.seatId`) are real, attributable numbers regardless of how
     many seats share the category. **Render the balance line unconditionally whenever a seat is
     resolved** (`outcome.status === 'ok'`), ignoring `spendKnown` — do not gate the line on it. Retiring
     the flag's OWN behaviour (making `officeSpendKnownByCategory` return `true` for every category, since
     the structural reason for `false` no longer exists) is explicitly **NOT** done in this AC — that
     would rewrite oxp.2's own AC8 assertions from inside this story, the exact thing oxp.2's and oxp.11's
     own comments warn against. This AC only changes what THIS story's rendering does with the number,
     leaving the function's return value untouched. **Flagged for Angelus at review time — see Dev Notes,
     "Open question".**

8. **Design-system compliance.** No bare hex, no `rgba()`, no inline `style="..."` anywhere touched by
   this story (`specs/project-context.md` §1, hard rule). The balance line and disclosure titles reuse
   existing classes (`.office-section-hd`, `.derived-note` for the balance line — matches its existing use
   elsewhere in this app for a derived, non-editable annotation) rather than inventing new ones. If no
   existing class fits a specific new element, add ONE new class to `public/css/components.css` using
   `:root` tokens, following the file's existing pattern for the `.office-*` classes already there.

9. **Tests.** Both server and client sides:
   - `server/tests/oxp-3-office-manoeuvre-rank.test.js`: the four GET-shape assertions named in AC1,
     updated to the new shape. Re-run this file's full suite after the change — nothing else in it reads
     the GET response as a bare number, but confirm by grepping `res.body[` occurrences against this
     file before declaring done.
   - `server/tests/oxp-2-derived-office-xp-calculation.test.js`: new pure-function tests for AC2's
     `officeXpSpentForCategory` change — a raw `manoeuvreRankDoc` with both `rank` and
     `manoeuvre_xp_destroyed` sums both; one with only `rank` (no `manoeuvre_xp_destroyed` key at all, the
     shape every existing rank document that predates oxp.5 still has) is unaffected — this is the
     regression case that matters most, since it's the shape of every real document in `tm_suite` today.
     A bare-number `manoeuvreRankDoc` (the OTHER accepted input shape) is provably unaffected — assert
     this explicitly, not just leave it untested.
   - **New direct unit suite for `office-tab.js`'s own pure/exported logic** — `manoeuvreRankHtml` (still
     exported, now delegating to `shDotsWithBonus`), and whatever new pure function this story factors out
     for the AC6 title-reason logic (do not inline that decision directly into a DOM-writing function; it
     is a plain `(rank, count, left, cost) -> reason|null` decision with no DOM dependency and belongs in
     its own exported, directly-testable function, mirroring `city-views.js`'s `computeCourtChanges` — see
     Dev Notes, "Previous story intelligence"). Use the SAME browser-shim + dynamic-`import()` technique
     `server/tests/oxp-5-city-views-seat-holder.test.js` established for `city-views.js` (stub
     `location`/`localStorage`/`window`/`document`, dynamic-import the real file) — this is now the second
     file in this codebase to need it, so it is an established pattern, not a one-off.
   - Live `tm_suite` is never connected to or written to by any test in this story (DB-backed tests target
     `tm_suite_test` only, per this repo's standing convention).
   - Run targeted, never the full suite: the new office-tab suite, `oxp-3-office-manoeuvre-rank`,
     `oxp-2-derived-office-xp-calculation`, and (unaffected but adjacent, confirm rather than assume)
     `office-merit-dots`, `oxp-11-office-purchase-seat-keying`.

## Tasks / Subtasks

- [x] Task 1 — Server: expose `manoeuvre_xp_destroyed` (AC: 1)
  - [x] Change `server/routes/office-manoeuvre-rank.js`'s `GET /` handler to return
        `{ rank, manoeuvre_xp_destroyed }` per seat instead of a bare rank number.
  - [x] Update the four existing GET-shape assertions in `server/tests/oxp-3-office-manoeuvre-rank.test.js`
        (lines 106, 116, 163-164, 245) to read `.rank` off the new object shape.
  - [x] Grep the rest of that file (and `oxp-2-derived-office-xp-calculation.test.js`, which also fetches
        this route per its own header comment) for any other `res.body[SEAT_ID]` read as a bare number
        against THIS route specifically. Found THREE more in `oxp-11-office-purchase-seat-keying.test.js`
        (not named in the story — a real gap in its own research), fixed the same way.
- [x] Task 2 — Client: `office-xp.js` folds destroyed XP into spend (AC: 2)
  - [x] Extend `officeXpSpentForCategory`'s raw-document branch only, per AC2's exact formula.
  - [x] New pure-function tests in `oxp-2-derived-office-xp-calculation.test.js` per AC9, including the
        "document predates oxp.5, has no `manoeuvre_xp_destroyed` key at all" regression case.
- [x] Task 3 — Client: `office-tab.js` fetches and computes the seat balance (AC: 3)
  - [x] Update `_wireManoeuvreRank`'s `ranksBySeat[...]` read for the new shape (AC1/AC3).
  - [x] Add the merit-dots + manoeuvre-rank sibling fetch — landed in a new shared `_refreshPurchaseState`
        (not literally inside `_wirePurchaseState`, which now just resolves the seat and delegates), so
        both purchase sections and every post-stepper refresh draw from ONE fetch, gated by the same `gen`
        gate already threaded through this file.
  - [x] Import and call `officeSeatXp` from `../data/office-xp.js`.
- [x] Task 4 — Client: dot rendering (AC: 4, 5)
  - [x] Import `shDots`/`shDotsWithBonus` from `../data/helpers.js` into `office-tab.js`.
  - [x] Replace `manoeuvreRankHtml`'s and `_wireMeritDots`'s hand-built dot strings.
- [x] Task 5 — Client: affordability reason + balance line (AC: 6, 7, 8)
  - [x] Write the new pure `(rank, count, left) -> reasons[]`-shaped functions — `manoeuvreDotReasons` and
        `meritDotReasons`, exported, DOM-free, per AC9's testing note.
  - [x] Per-dot `title` attributes — via a NEW local `_dotsWithReasons` helper, **not**
        `shDotsWithBonus`'s `opts.hollowMod` as this story originally planned. See Dev Agent Record: that
        mechanism is the ST-mod-overlay's own convention (`stm-modded-dot` class, gold-tinted styling) and
        reusing it would have visually presented an unaffordable dot as an ST override.
  - [x] Render the balance line, holder-or-ST-only, using existing classes per AC8 (`.derived-note`).
- [x] Task 6 — Tests and regression (AC: 9)
  - [x] Direct-unit tests for `office-tab.js`'s new exported pure functions — added to the EXISTING
        `issue-1141-office-tab-render.test.js` (the established browser-shim + fake-DOM suite for this
        file) rather than a new file, once discovered mid-implementation. See Dev Agent Record.
  - [x] Targeted gate, widened past the story's own list once the real blast radius was found:
        `issue-1141-office-tab-render`, `oxp-3-office-manoeuvre-rank`, `oxp-2-derived-office-xp-calculation`,
        `office-merit-dots`, `oxp-11-office-purchase-seat-keying`, `oxp-5-handover-logic`,
        `oxp-5-city-views-seat-holder`, `oxp-4-merit-persistence-handover`, `feature.691.hos-city-status-power`,
        `issue-1141-office-data-sync`, `oaq-2-pending-status-actions`. 11 files, 339 tests, all green.
  - [x] Prove-discrimination: AC1's shape change (8 tests failed exactly as expected across two files),
        AC2's destroyed-XP fold-in (1 test failed exactly as expected), and the manoeuvre rank-order-first
        safety property (2 tests failed exactly as expected) — each reverted and re-confirmed green.

## Dev Notes

### Previous story intelligence (oxp.5, merged 2026-08-14)

- **oxp.5's own code review found a real High-severity bug from exactly this codebase's pattern**: a pure,
  exported, DOM-free function (`courtSlotOptions` in `city-views.js`) had NO direct test, only source-
  contract regex pinning, and a real logic bug went undetected until external review. This story
  deliberately writes direct unit tests for its own new pure functions from the start (AC9) rather than
  relying on source-contract tests alone, the lesson oxp.5's review round had to learn the expensive way.
- **The render-generation guard pattern (`el._officeManoeuvreGen`) already exists in `office-tab.js`
  itself** (not borrowed from elsewhere) — every async write in this file already checks it before writing
  DOM. This story's new fetch (AC3) MUST follow the same convention; it is not optional or story-specific,
  it is this file's own established invariant.
- **`officeSeatXp`'s `spendKnown` flag is a known, named point of future decision** — both oxp.2's and
  oxp.11's own comments in `office-xp.js` name oxp.6/oxp.7 as the story that decides what to do with it.
  AC7 makes that decision for THIS story's own rendering (ignore it, render unconditionally) without
  touching the function itself. See "Open question" below — this is a judgement call, not a certainty,
  and Angelus should confirm it at review time the same way prior oxp stories' genuine judgement calls
  were confirmed directly rather than assumed.

### Architecture compliance

- **Derived stats are never stored** (`specs/project-context.md` — this file, and the umbrella CLAUDE.md).
  Every number this story renders (`earned`/`spent`/`left`, the affordability reasons) is computed at
  render time from already-fetched documents. Nothing new is written to any collection by this story.
- **CSS tokens only, reuse before inventing** — see AC8. `specs/architecture/coding-standards.md` → "CSS
  Standards" is the authoritative reference if a genuinely new class is needed.
- **British English, no em-dashes** in any string this story writes (button labels, disclosure titles,
  the balance line).

### Project Structure Notes

- Files touched: `server/routes/office-manoeuvre-rank.js` (AC1), `public/js/data/office-xp.js` (AC2),
  `public/js/tabs/office-tab.js` (AC3-7), `public/css/components.css` (AC8, only if a genuinely new class
  is needed), `server/tests/oxp-3-office-manoeuvre-rank.test.js`,
  `server/tests/oxp-2-derived-office-xp-calculation.test.js`, and a new
  `server/tests/oxp-6-office-tab-purchase-markers.test.js` (or similarly named — matches this story's key,
  per this project's own file-naming convention, e.g. `oxp-5-city-views-seat-holder.test.js`).
- Deliberately unchanged: `server/routes/office-merit-dots.js`, `server/lib/office-seat-resolve.js`,
  `server/schemas/office_seat.schema.js`, `public/js/tabs/office-data.js`, `public/js/admin/city-views.js`
  (oxp.5's own surface, not this story's).
- No new collection, no new route, no new schema file.

### References

- [Source: `content/rules/office-powers.md` §"Office XP" and §"Manoeuvres are a graduated merit"] — the
  ruling AC6/AC7 implement.
- [Source: `public/js/data/office-xp.js` header comment] — explicitly names this story as the first
  intended consumer.
- [Source: `public/js/data/helpers.js:98-149`] — `shDots`/`shDotsWithBonus`, the dot-rendering functions
  AC4 reuses.
- [Source: `public/css/components.css:53-56`] — `.pointed`/`.pointed.hollow`, and the cross-platform
  Unicode-dot bug comment explaining why they exist.
- [Source: `server/routes/office-manoeuvre-rank.js:15-21`] — the current GET route AC1 changes.
- [Source: `specs/stories/sprint-status.yaml`, `oxp-6-office-tab-purchase-markers` entry] — the 2026-08-13
  scoping session's own rulings (holder-or-ST-only visibility; reuse `.pointed.hollow`; one visual state,
  reason on tap/hover) that this story's ACs implement directly.
- [Source: `specs/stories/oxp-5-handover-logic.md`, Dev Notes / AC6] — Finding 1, the
  `manoeuvre_xp_destroyed` hard dependency this story closes.

## Open question for Angelus (flagged, not assumed — confirm before or during dev-story)

**AC7's `spendKnown` decision.** `officeSeatXp` still reports `spendKnown: false` for any office with more
than one seat (Primogen, Socialite) — a flag that predates oxp.11's seat-keying migration and, on a literal
reading of its own doc comment, was left exactly for this story to retire or keep. This story's draft
scoping (AC7) renders the balance regardless of `spendKnown`, on the reasoning that oxp.11 already made
spend genuinely attributable per seat and the flag's `false` is now stale rather than meaningful. **This is
a judgement call, not a certainty** — if Angelus would rather the balance line stay hidden (or show a
"spend uncertain" caveat) for Primogen/Socialite specifically until `officeSpendKnownByCategory` itself is
formally retired, AC7 needs to change before dev-story starts on it. Asked directly, matching how every
prior oxp story's genuine judgement calls were resolved.

## Dev Agent Record

### Agent Model Used

Claude Opus (via bmad-dev-story, 2026-08-14).

### Debug Log References

None — no failing gate needed a separate debug pass; RED→GREEN cycles and prove-discrimination reverts
are recorded inline in Task 6 above and the Completion Notes below.

### Completion Notes List

**AC7's open question, resolved as drafted.** The story's own closing section flagged `officeSeatXp`'s
stale `spendKnown: false` for multi-seat categories as a judgement call needing Angelus's confirmation.
Implemented per the draft default (render the balance line unconditionally, ignoring `spendKnown`) after
the user picked "dev-story" directly over "resolve the open question first" when offered both — read as
acceptance of the documented default. Flagging again here for visibility at review: if Angelus would
rather the balance stay hidden for Primogen/Socialite, `_refreshPurchaseState`'s balance computation
needs a `spendKnown` gate added (currently only checks `outcome.status === 'ok' && !fetchFailed`).

**Two real deviations from the story's own plan, both found during implementation, both documented
inline where they happen:**

1. **AC6's per-dot titles do NOT use `shDotsWithBonus`'s `opts.hollowMod`, contrary to the story's own
   text.** Tracing that mechanism's actual behaviour (not just its signature) showed it also emits an
   `stm-modded-dot` class and gold-tinted styling — the ST-mod-overlay's own visual convention
   (`components.css` lines ~5472-5494). Reusing it for an unaffordable/order-blocked dot would have
   visually presented an ordinary purchase gap as an ST override, which it is not. Built a new local
   `_dotsWithReasons` helper instead: same bare `.pointed`/`.pointed.hollow` markup, a plain `title`
   attribute, no borrowed class. `manoeuvreRankHtml` gained an optional 4th `reasons` param that switches
   between the two paths — `shDotsWithBonus` when omitted (the plain, no-balance-yet case), the new helper
   when supplied — so the function stays the ONE real call site AC9 expects it to be, rather than becoming
   dead code superseded by an inlined duplicate.
2. **The balance/purchase-state fetch is not literally "added inside `_wirePurchaseState`."** It landed in
   a new sibling function, `_refreshPurchaseState`, called once from `_wirePurchaseState` (the initial
   render) and again from both `_adjustMeritDots` and `_adjustManoeuvreRank` after a successful stepper
   click. This was necessary, not optional: AC7 states both purchase sections draw from the SAME seat
   balance, so a merit purchase has to refresh the manoeuvre section's affordability markers too (and vice
   versa) — re-calling only the clicked section's own wire function, as the story's literal task text
   implied, would have left the OTHER section's markers stale until the next full render. `_wireMeritDots`
   and `_wireManoeuvreRank` are consequently no longer independently-fetching `async` functions; they are
   now synchronous renderers of data `_refreshPurchaseState` already fetched once. `_adjustMeritDots` and
   `_adjustManoeuvreRank` gained a `data`/`isOwnOffice` parameter each so they can call it.

**A significant blast-radius gap in the story's own research, found and closed during implementation.**
The story's Dev Notes claimed `city-views.js`'s browser-shim + dynamic-`import()` technique
(`oxp-5-city-views-seat-holder.test.js`) would be "the second file in this codebase to need it" for
`office-tab.js`. This was wrong: `server/tests/issue-1141-office-tab-render.test.js` already exists — an
824-line suite doing exactly that (plus a hand-rolled fake DOM) for `office-tab.js` specifically, predating
this story. Discovered only because Task 4's dot-swap (AC4) needed `manoeuvre_xp_destroyed`'s new GET
shape, which led to grepping for every consumer of that route and turning up this file's `RANKS` fixture
and sixteen literal Unicode dot assertions (`●●○○○` etc.) that AC4's change would silently break. All were
converted to structural checks (`pointedCounts()` for single-dot-run contexts, a `dotsSpan()` substring
helper for multi-row merit-mount contexts, matching the ORIGINAL substring-match semantics exactly rather
than a stricter aggregate count that would have miscounted across sibling merit rows) — see that file's
own new header comment additions. The story's planned "new suite" (Task 6) became additions to this
existing one instead, which is the more correct outcome regardless of the story's own miscount.

**A second, unrelated existing test file broke from the SAME shape change** —
`oxp-11-office-purchase-seat-keying.test.js` (three bare-number GET assertions, not named in the story) —
found by grepping the whole test suite for the route's response pattern rather than trusting the story's
named list. Fixed the same way as the two files the story did name.

**A third, unrelated existing test file broke from the `_wireMeritDots`/`_adjustMeritDots` signature and
`async`-keyword changes** — `oxp-4-merit-persistence-handover.test.js`'s source-contract suite, which
slices `office-tab.js`'s own source text by literal anchors (`'async function _wireMeritDots'` etc.) to
prove oxp.4/oxp.11's "no character id ever reaches the merit-dots API" guarantee still holds. Updated the
anchors and signatures to match the real current source, and split its single `meritDotsBlock()` into two
narrower blocks (`meritDotsBlock` for the two functions themselves, a new `refreshPurchaseStateBlock` for
the fetch that moved out of them) rather than widening one block to cover both — widening would have swept
in `_wirePurchaseState`'s legitimate `char._id` read and the pre-existing `_fallbackSeat`/`_seatNote`
helpers' equally legitimate prose use of the word "holder", both of which would have broken the suite's
"never references character/holder" check for reasons that have nothing to do with the guarantee it
actually exists to prove. Reworded two of THIS story's own new code comments (from "holder-or-ST-only" to
"owner-or-ST-only") specifically so they would not trip that same crude case-insensitive check once they
fell inside the narrower block — a cosmetic fix, not a scope change, made because the check itself bans
the literal substring in prose as well as in code.

**A genuine, low-risk async-timing bug found and fixed along the way, unrelated to any AC.** The first
`_refreshPurchaseState` draft called `_isST()` once for itself (to decide whether to compute the balance)
in addition to the two existing calls already inside `_wireMeritDots` and `_wireManoeuvreRank` — a
redundant third call, not merely inefficient: it produced an intermittent Vitest "unhandled rejection"
(`ReferenceError: localStorage is not defined`) in `issue-1141-office-tab-render.test.js`, surfacing after
the whole file's tests had already reported passing. Removed the redundant call (balance is now always
computed once the seat resolves; each child gates its OWN use of it via its own existing `_isST()` call,
exactly as before this story). Confirmed clean across three consecutive full runs of that file afterward.

**Re-verified test counts, not assumed.** Full targeted gate across every file this story touched or
discovered touching it: 11 files, 339 tests, all passing, zero unexplained skips. Prove-discrimination run
on AC1's shape change, AC2's destroyed-XP formula, and the manoeuvre rank-order-first safety property,
each as an isolated single-line revert, each caught by exactly the tests that should catch it and nothing
else.

Live `tm_suite` was never connected to or written to at any point in this story.

### File List

- `server/routes/office-manoeuvre-rank.js` — GET `/` response shape (AC1).
- `public/js/data/office-xp.js` — `officeXpSpentForCategory` folds `manoeuvre_xp_destroyed` (AC2).
- `public/js/tabs/office-tab.js` — new imports (`shDotsWithBonus`, `officeSeatXp`); new exported
  `manoeuvreDotReasons`, `meritDotReasons`; new local `_dotsWithReasons`, `_balanceLineHtml`,
  `_refreshPurchaseState`; `manoeuvreRankHtml` gained an optional `reasons` param; `_wireMeritDots` and
  `_wireManoeuvreRank` de-asynced and re-signatured to consume pre-fetched data; `_adjustMeritDots` and
  `_adjustManoeuvreRank` now refresh both purchase sections via `_refreshPurchaseState`, not just their
  own.
- `server/tests/oxp-3-office-manoeuvre-rank.test.js` — 4 GET-shape assertions updated to the new object
  shape, plus 1 new test proving a non-zero `manoeuvre_xp_destroyed` round-trips.
- `server/tests/oxp-11-office-purchase-seat-keying.test.js` — 3 GET-shape assertions updated (found during
  this story, not named in it).
- `server/tests/oxp-2-derived-office-xp-calculation.test.js` — 3 new tests for `officeXpSpentForCategory`'s
  destroyed-XP fold-in and its explicit non-effect on the bare-number branch.
- `server/tests/issue-1141-office-tab-render.test.js` — extended (not replaced): `pointedCounts`/`dotsSpan`
  helpers added; 16 literal-Unicode-dot assertions converted to structural ones; `RANKS` fixture updated to
  the new object shape; new `describe` blocks for `manoeuvreDotReasons`, `meritDotReasons`, and
  `manoeuvreRankHtml`'s reasons-aware path; 2 new wired-integration tests for the balance line's
  presence/absence (AC7).
- `server/tests/oxp-4-merit-persistence-handover.test.js` — `meritDotsBlock`/`seatResolutionBlock` anchors
  and signature assertions updated; new `refreshPurchaseStateBlock` helper and its own test, splitting what
  the fetch-location change would otherwise have conflated.
- `specs/stories/oxp-6-office-tab-purchase-markers.md` — this record.
- `specs/stories/sprint-status.yaml` — status and narrative entry.

## Senior Developer Review

External Codex review (`codex-review` skill, single-session 3-pass — Blind Hunter / Edge Case Hunter /
Acceptance Auditor, high effort via `codex exec`), against `specs/stories/code-review/oxp-6-diff.txt`
(base `1063787b`, the oxp-5 merge this branch was cut from). Findings at
`specs/stories/code-review/oxp-6-codex-findings.md`: 0 High, 3 Medium, 3 Low.

**The `codex exec` process crashed with an internal error** (`failed to renew cache TTL: missing field
'base_instructions'`) immediately after freezing Pass 3a — Pass 3b (independent verification of this
story's own Dev Agent Record claims) never ran. Pass 1, Pass 2 and Pass 3a all completed and froze real
findings before the crash. This session performed the Pass-3b-equivalent verification itself — every
finding traced against the running code, per this project's `codex-review` skill (an unverified external
review carries borrowed authority and is worse than none; the missing Pass 3b makes that verification
step load-bearing rather than a formality here).

**1 real bug, found independently by two passes, PATCHED — the most severe finding in this review despite
scoring Medium rather than High.** An unconfirmed own-office view (a multi-seat category — Primogen or
Socialite — where the viewer's `court_category` matches but their character `_id` doesn't match either
seat's `holder_id`, so seat resolution fell back to a deterministic guess) leaked that FALLBACK seat's real
office-XP balance and per-dot affordability reasons to the viewer, presented as if it were their own. Pass
2 reproduced this dynamically against the real module (`3 of 7 office XP spent, 4 remaining` rendered for
a mismatched holder); Pass 3a caught the same gap independently by reading AC7's literal wording. Root
cause: `isOwnOffice` is plain category equality (`category === char.court_category`), and this story's new
`showReasons`/`showBalance` gates checked only `isOwnOffice || isST` — never `outcome.confirmed`, unlike
the PRE-EXISTING manoeuvre-list muting guard three lines away in the same function, which already got this
right (`isOwnOffice && outcome.confirmed`). Fixed by adding the same `outcome.confirmed` requirement to
both new gates; an ST still sees everything regardless of confirmation, matching every other purchase-state
control in this file. New test reproduces the exact leak scenario and is prove-discriminated: reverting
either gate reproduces the leak (verified against the actual rendered HTML) and fails exactly the one
targeted test.

**1 Medium, PATCHED.** `_refreshPurchaseState`'s `Promise.all` over both purchase-collection fetches coupled
their failure states through one shared `fetchFailed` flag — a transient failure on EITHER endpoint blanked
BOTH sections, where before this story they fetched and failed independently. Replaced with
`Promise.allSettled`, tracking `meritFailed`/`rankFailed` separately; the balance itself still requires both
to succeed (it needs both collections), but each section's own error rendering is independent again. Two
new tests (one per failure direction), prove-discriminated.

**1 Medium, DISMISSED with evidence, strengthened with a new test.** Pass 3a correctly flagged that the
per-dot reason implementation (`_dotsWithReasons`) is a new local helper, not the `shDotsWithBonus`
`opts.hollowMod` mechanism AC4/AC6 literally specify — Pass 3a is deliberately blind to the Dev Agent
Record by the review's own protocol, which is exactly where this deviation was already justified during
dev, before this review ran: `opts.hollowMod` also emits an `stm-modded-dot` class with gold-tinted
ST-mod-overlay styling, and reusing it here would have visually misrepresented an ordinary unaffordable dot
as an ST override. Re-verified directly against `components.css` during this triage rather than just
trusted from the dev record. The finding's own secondary point — the new helper "will not inherit future
markup changes" to the shared one — is legitimate and is now closed with a real test rather than argued
away: a new parity test proves `manoeuvreRankHtml` with an all-null reasons array is byte-identical to
omitting reasons entirely (the plain `shDotsWithBonus` path), so any future divergence between the two
fails a test instead of drifting silently.

**3 Low, PATCHED or DISMISSED with evidence:**
- Reference-view privacy coverage gap (the existing test only checked the manoeuvre mount, not the
  always-visible merit mount) — PATCHED, new test confirms merit dots render but carry no `title=`.
- Route-exclusivity claim ("the ONLY route `manoeuvre_xp_destroyed` can reach the client through") —
  DISMISSED with evidence: grepped the whole repo, the only other reference is a differently-shaped,
  differently-purposed derived field in the handover route's own one-shot response, not a general read
  path.
- The updated oxp.4 source-contract test's structural guarantee weakened in principle (the wider `outcome`
  object now carries `seat`/`allSeats`, which contain `holder_id`, even though nothing sends it anywhere) —
  PATCHED with the finding's own suggested stronger form: a new positive-proof test confirms neither
  function's source references `outcome.seat` or `outcome.allSeats` at all, not just that the word
  "holder" is absent.

**A real process gap found and corrected during this triage, unrelated to any finding.** Several
verification commands were run from the wrong working directory (the umbrella repo root rather than
`server/`), which silently picked up a different `vitest`/config and produced a false "1 passed" for a
test that, run from the correct directory, actually failed (a new comment this session added for the
confirmed-gate fix contained the literal word "holder", tripping `oxp-4-merit-persistence-handover.test.js`'s
strict `/holder/i` ban within `meritDotsBlock()`'s range). Caught by re-running explicitly from `server/`
with an absolute path before trusting the result; fixed by rewording the comment. All commands in this
triage were subsequently re-run from the confirmed-correct directory.

**Re-verified with real DB access**: full eleven-file targeted gate — the original list plus every file
this triage's own fixes touched — **345/345, 0 failed, 0 skipped** (up from 339 before this review round).
Live `tm_suite` never connected to or written to.

**Ship assessment: accepted.** The one real information-disclosure bug is patched and has its own direct
regression coverage, prove-discriminated by single-change revert. No unresolved High or Medium.
