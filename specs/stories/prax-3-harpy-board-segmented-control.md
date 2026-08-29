# Story prax.3: Harpy board + segmented control

## Story

As the ST running Praxis night,
I want a Harpy tab reusing the same claim board, with a segmented control and a live summary of
both contests,
So that I can run the Head of State claim and the People's Harpy vote side by side, on one board,
without losing sight of either while working the other.

## Why this story exists

Full epic context: `specs/epic-prax-praxis-claim-harpy-vote.md` (this story's own row is the
authoritative scope statement). Proves the shared-component contract prax-2's own header comment
promised: `praxis-tab.js`'s tally literal was kept as a single module-level constant specifically so
this story could parameterise it instead of duplicating the whole module. This story delivers that
parameterisation, not a second board.

Depends on prax-1 (done). Runs in parallel with prax-2 in principle, but in practice extends prax-2's
already-shipped component directly (branched from `ms/prax-2-praxis-claim-board-ui`, not `main`).

**No server changes.** `server/routes/praxis-sessions.js`'s own `TALLIES = ['praxis', 'harpy']`
already accepts both values on every route (confirmed by reading the file) — prax-1 built the whole
board schema and API dual-tally from day one. This story is pure client work, same posture as prax-2.

### Design-lock (locked 2026-08-29, confirmed by Angelus: "is good")

`specs/mockups/prax-3-harpy-segmented/index.html` — rendered and reviewed before lock. Three new
pieces layered onto prax-2's own untouched components: a segmented Praxis/People's Harpy control, a
sticky summary row showing BOTH contests' current leaders regardless of which tab is active, and a
dual-dot indicator on every pool chip (crimson = has a Praxis assignment, gold = has a Harpy
assignment, independent of the active tab).

**Two things the mockup asked and Angelus did not answer individually before locking the overall
look ("is good") — resolved here, flagged as this story's own call, not re-litigated from a silent
assumption:**

1. **Empty-board state and the segmented control.** `praxis_sessions` is ONE document holding BOTH
   tallies (prax-1's own schema: `{praxis: {...}, harpy: {...}}` on a single doc, opened by ONE
   `POST /api/praxis_sessions` call). There is no such thing as "a Praxis board with no Harpy board" —
   opening the board opens both tallies at once. So: the segmented control does NOT appear in the
   empty state (nothing to switch between before any claim exists in either tally); the empty state
   keeps its single "Open Board" action. **This forces a small, deliberate copy change to prax-2's
   own already-shipped empty-state button**, from "Open Praxis Claim" to "Open Board" — the old
   copy implied a Praxis-only action, which stops being accurate the moment this story ships (the
   same click now also opens the Harpy side). Once the board exists, the segmented control and
   summary row appear immediately, even before either tally has a claimant (see AC9's "No claims
   yet" state).
2. **Tie / zero-claimants summary display.** The summary row's "leader" is cosmetic display only —
   it decides nothing (prax-4a/4b's own resolve routes are the only place a result becomes real). A
   tally with zero claimants shows "No claims yet" in place of a name. A genuine tie (two or more
   claimants sharing the top tally value) is broken for DISPLAY ONLY by name, alphabetically —
   arbitrary but deterministic, carries no implication about how a real tie would resolve.

## Locked rulings this story must honour (see prax-1/prax-2's own stories + the epic doc, do not
re-litigate)

- **Never player-visible.** Same posture as prax-2 — reached only through the existing ST-only admin
  gate.
- **The two tallies are never coupled.** A character may hold an open claim, or a support
  assignment, in both tallies at once — nothing in this story adds a cross-tally exclusivity check.
- **No self-vote auto-add for Harpy claimants** (epic doc's own ruling). A Harpy claimant's own
  tally starts at the count of supporters CURRENTLY assigned to them in `harpy.support` — nothing
  auto-adds the claimant as their own first vote. They CAN be assigned as their own supporter
  through the ordinary assign-support flow (tapping their own pool chip, opening the sheet, tapping
  themselves as claimant) exactly like any other attendee; if they do, that counts as 1 vote for
  themselves like anyone else's. This story adds no special-casing either way — the existing
  `assignSupport` write action already permits `supporter_character_id === claimant_character_id`
  (nothing in prax-1's own route rejects it), so "no auto-add" is achieved simply by NOT baking a
  default self-vote into the tally formula, not by a new guard.
- **Harpy weighting is a plain headcount, unweighted** (epic doc: "1 supporter = 1 vote"). No
  `calcCityStatus()` call anywhere in the Harpy tally path.
- **Praxis/Harpy-specific badges stay Praxis-only.** "Primogen · keeps seat" / "People's Harpy ·
  vacates on win" describe what happens if a character wins PRAXIS — meaningless on the Harpy tally
  itself (a Harpy win doesn't make anyone "keep a seat", and displaying the Praxis-relevant badge on
  a Harpy-tab card would misleadingly suggest it applies there). Render `renderBadge` output only
  when `_activeTally === 'praxis'`.

## What this story is NOT

- **Not** resolve logic for either tally — prax-4a (Harpy resolve) and prax-4b (Praxis resolve) own
  that. No resolve route is called anywhere in this story.
- **Not** a new claim-board component — this story extends `praxis-tab.js` in place. A parallel
  second file (`harpy-tab.js`) would fork the component prax-2's own header comment explicitly said
  not to fork.
- **Not** a change to any prax-1 server route or schema — all already dual-tally-capable.
- **Not** a change to the bottom sheet's own interaction shape (tap → open claim or assign support)
  — unchanged, just now operates against whichever tally is active.
- **Not** a session-live gate or a fuzzed player view — out of scope for the whole epic.

## Acceptance Criteria

**Module state — `TALLY`/`TALLY_LABEL` become live state, not fixed constants**

1. Replace the fixed `const TALLY = 'praxis'` / `const TALLY_LABEL = 'Praxis'` (`praxis-tab.js:48-50`)
   with module state: `_activeTally` (`'praxis'` | `'harpy'`, defaults to `'praxis'` on every fresh
   `initPraxisView()` call — the tab does not remember the last-viewed tally across a full domain
   re-entry), plus two label maps: `TALLY_LABELS = {praxis: 'Praxis', harpy: "People's Harpy"}` and
   `TALLY_UNIT_LABELS = {praxis: 'status', harpy: 'votes'}` (the tally-card's small unit suffix —
   "19 STATUS" vs "3 VOTES").
2. Every existing accessor and write action that referenced the fixed `TALLY` constant
   (`claims()`, `support()`, `openClaim`, `assignSupport`, `unassignSupport`, `withdrawClaim`, the
   sheet renderer, the pool-strip renderer) now reads `_activeTally` instead. No behavioural change
   to any of them beyond that substitution — the whole point of prax-2's own constant-at-the-top
   design was that this substitution is mechanical, not a redesign of any of these functions.

**Tally computation — Harpy is a plain headcount, not a City-Status sum**

3. `tallyFor(claimantId)` branches on `_activeTally`: unchanged Praxis behaviour (claimant's own
   `calcCityStatus()` plus every current supporter's) when `_activeTally === 'praxis'`; for
   `'harpy'`, the count of entries in `_board.harpy.support` whose value equals this claimant's id —
   no `calcCityStatus()` call, no baseline addition for the claimant themselves.
4. `renderBadge()` (the Primogen/People's Harpy secondary line) is called only when
   `_activeTally === 'praxis'`; the Harpy tab's claim cards never show it.

**Segmented control**

5. A new segmented control, rendered in the board header once a board exists (never in the empty
   state — AC's own resolved question 1 above), two buttons reading `Praxis` / `People's Harpy`,
   the active one visually distinguished (locked mockup: filled accent background, the inactive
   button's default surface). Tapping the inactive button sets `_activeTally` and re-renders the
   whole board in place — no refetch (the already-loaded board document has both tallies' data,
   nothing new to fetch).
6. Tapping the ALREADY-active segment is a no-op (does not clear anything, unlike the Cycle tab's
   own phase-toggle "click active to clear" convention — that convention does not apply here, there
   is no "neutral" state for which tally is being viewed).

**Sticky summary row**

7. A new summary row, rendered directly under the board header whenever a board exists (both empty
   and populated tally states — AC9), showing BOTH tallies' current leaders side by side in one row,
   regardless of which tab is active. Each side: a small uppercase label ("PRAXIS LEADER" / "HARPY
   LEADER") and the leading claimant's name plus their live tally value.
8. The leader for a given tally is the claimant with the highest `tallyFor()` value among that
   tally's OWN `claims[]` (computed independently for both tallies on every render — this is NOT
   the same claimant list as whichever tally is currently active in the pool/card section below).
   Ties broken by name, alphabetically, for display determinism only (AC's own resolved question 2).
9. A tally with zero open claims shows "No claims yet" in its half of the summary row instead of a
   name/value.

**Pool strip — dual-dot indicator**

10. Every pool chip (in whichever tally's pool strip is currently rendered — the pool itself stays
    scoped to the ACTIVE tally, exactly as prax-2 already built it: unassigned-in-the-active-tally)
    gets two small dots appended: the first coloured (crimson) if that attendee has ANY assignment
    in Praxis (an open claim in `praxis.claims`, OR present as a key in `praxis.support`), dim/grey
    otherwise; the second (gold) for the equivalent Harpy check. Computed fresh per chip, per
    render, against BOTH `_board.praxis` and `_board.harpy` regardless of which tally is active.

**Copy change to prax-2's own shipped empty state**

11. `renderEmpty()`'s button text changes from `Open ${TALLY_LABEL} Claim` (which prax-2 shipped as
    "Open Praxis Claim") to a fixed, tally-agnostic `Open Board` — resolved question 1 above.
    `openBoard()`'s own request body and behaviour are unchanged (it already opens the one shared
    document; only the button's own label text changes).

**CSS**

12. New classes for the segmented control (`.tally-switch`/`.tally-switch-btn`), the summary row
    (`.tally-summary` and its children), and the dual-dot chip decoration (`.chip-dots`/`.chip-dot`
    plus `.on-praxis`/`.on-harpy` modifiers), added to `public/css/admin-layout.css` alongside
    prax-2's own `.praxis-board`-scoped block (same file, same scoping convention — every new rule
    lives under `.praxis-board`, ported 1:1 from the locked mockup's own inline CSS, translated to
    real `var(--token)` references, no bare hex/rgba/inline style). `.praxis-board`'s own existing
    rules and every class prax-2 already shipped are reused verbatim, not modified.

## Tasks / Subtasks

1. Read `public/js/admin/praxis-tab.js` in full (already ~590 lines after prax-2) before touching
   it — every accessor this story parameterises is named explicitly in the ACs above, but read the
   real current file, not this spec, as the ground truth for exact line numbers and surrounding
   code.
2. Convert the `TALLY`/`TALLY_LABEL` constants to module state (AC1) and thread `_activeTally`
   through every existing accessor/write action (AC2).
3. Branch `tallyFor()` and `renderBadge()` on `_activeTally` (AC3, AC4).
4. Build the segmented control render + click wiring (AC5, AC6).
5. Build the sticky summary row, including its own independent per-tally leader computation (AC7,
   AC8, AC9).
6. Add the dual-dot pool-chip decoration (AC10).
7. Change the empty-state button copy (AC11).
8. Write the new CSS (AC12), matching the locked mockup exactly.
9. Extend `tests/prax-2-claim-board.spec.js` — DO NOT rename or fork this file; this story adds new
   `describe` blocks to it (segmented control, summary row, dual-dot indicator, Harpy-tally write
   actions, the empty-state copy change) rather than creating a parallel `prax-3-*.spec.js`, since
   they exercise the SAME component prax-2's own spec already boots and mocks. Cover: switching
   tabs re-renders without a refetch; a Harpy claim/support write posts `tally: 'harpy'` and updates
   the Harpy card's headcount, not a City-Status sum; the summary row shows both leaders
   independently of the active tab; a pool chip's dots reflect cross-tally membership correctly;
   the empty-state button now reads "Open Board".
10. Run the extended spec, plus a stash A/B against `tests/cm1-cycle-phase.test.js` (no touch
    expected, but the shared `admin-layout.css` file grows again — sanity-check the CSS-standards
    ratchet test the same way prax-2's own review did) and a couple of admin-shell specs for
    regression.

## Dev Notes

### Files this story touches

- `public/js/admin/praxis-tab.js` — the whole extension (AC1-11). No new file.
- `public/css/admin-layout.css` — new classes appended to the existing `.praxis-board` block
  (AC12).
- `tests/prax-2-claim-board.spec.js` — extended in place (Task 9), not forked.

### Reuse precedents (read before writing new code)

- `specs/mockups/prax-3-harpy-segmented/index.html` — the locked design. Build to it. Real class
  names already chosen to match what a straightforward CSS port would produce
  (`.tally-switch`, `.tally-summary`, `.chip-dots`/`.chip-dot`) — reuse them verbatim rather than
  inventing alternatives.
- `public/js/admin/praxis-tab.js` itself (prax-2's own shipped code) — read the WHOLE file, not
  just the accessors named in the ACs. The module-local `_wire()` delegated-listener pattern needs
  one more `data-praxis-action` case (`switch-tally`); the `render()`/`renderHead()`/
  `renderPopulated()` call chain needs the summary row and segmented control woven in without
  breaking the existing empty/populated branch.
- prax-1's own `server/routes/praxis-sessions.js` — read `attendeePool()` and the support/claims
  shape again if anything about the dual-tally document structure is unclear; nothing in it changes,
  but this story's own AC10 (dual-dot check) reads BOTH `_board.praxis` and `_board.harpy`
  simultaneously, a shape this story is the first to need.

### Testing standards summary

- No jsdom in this repo (established precedent, TBID.1 and prax-2 both). Playwright is the real
  coverage — extend the existing `tests/prax-2-claim-board.spec.js`, per Task 9.
- `cd server && npx vitest run` for anything touching `server/tests/gdx-4-css-standards-grep.test.js`
  if the CSS additions trip its ratchet (prax-2's own review found and confirmed a PRE-EXISTING,
  unrelated failure there scoped to `suite.css` only — re-run it and stash-A/B any NEW failure before
  assuming it's the same one).
- `npx playwright test tests/prax-2-claim-board.spec.js` — never run two Playwright invocations
  concurrently (root `CLAUDE.md`).

## Dev Agent Record

*(filled in during dev-story)*

## Senior Developer Review

*(filled in during the independent review pass)*

## Change Log

- 2026-08-29 — Story created (orchestrator, `/bmad-epic-loop`), design-lock done and confirmed by
  Angelus ("is good") first (`specs/mockups/prax-3-harpy-segmented/index.html`). Two design
  questions the lock didn't individually answer resolved here as this story's own call (empty-state
  copy/control visibility; tie/zero-claimant summary display) — see the story's own "Design-lock"
  section above. Depends on prax-1 (done) and prax-2 (done, branched from). Branch
  `ms/prax-3-harpy-board-segmented-control`, cut from `ms/prax-2-praxis-claim-board-ui`.
