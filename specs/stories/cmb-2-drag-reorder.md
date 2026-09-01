---
id: cmb.2
epic: cmb
epic_file: specs/epic-cmb-combat-panel.md
status: done
priority: high
type: feature
depends_on: [cmb.1]
branch: ms/epic-cmb-combat-panel
---

# Story CMB.2: Drag-to-reorder turn order + Reset to Rolled Order

## Story

As the ST running combat,
I want to freely drag a combatant card to a new spot in the turn order, and a way to snap everyone
back to the order the dice actually gave,
so that I can handle a temporary initiative bump (a Celerity-style effect, a delayed action, or
anything else that doesn't fit a rule cleanly) without losing track of what was actually rolled.

## Why this story exists

The card's own rolled initiative number is a fact; who acts next is the ST's call, and the two must
never be the same field. Epic CMB's own validated mockup proved this pattern out: dragging a card
changes its position in the turn line only, never its `rolledInitiative` value, and a "Reset to
Rolled Order" control re-sorts by that untouched value at any time. This is the epic's clearest
instance of "support rails, not handcuffs" — the tool remembers what the dice said; the ST decides
what happens; the dice result stays retrievable forever.

## Decisions already made (do not re-litigate)

- **Scene state stays sessionStorage-only.** Angelus's explicit call (bmad-epic-loop, 2026-09-01,
  asked directly as a risk gate): if the tab reloads or crashes mid-encounter, the parked roster,
  rolled initiative, and any manual reorder are lost — re-park and re-roll. This is an accepted cost,
  not an oversight. Health/Vitae/Willpower are never at risk either way (persisted separately in
  `tracker_state`). Do not add `localStorage` mirroring or a server-side scene collection as part of
  this story.
- **Position and rolled value are two distinct fields, and only one of them is ever written by a
  drag.** `rolledInitiative` (already a field on the combatant object per `combat-tab.js`'s current
  shape) is set once, at roll time, in `rollInitiative()`, and this story must not add any code path
  that writes it again. Turn order is simply array order (matching this file's existing convention —
  `_scene.combatants` is already iterated in display/turn order, nothing new to introduce there).
  Dragging is an array splice-and-reinsert; nothing else.
- **`cmb.1`'s `_drag` gesture state must not be built on directly, per that story's own Senior
  Developer Review finding.** Its `pointerdown`/`pointerup`/`pointercancel` listeners are scoped to
  the grip element only. A real drag ends with the pointer released somewhere else entirely (that's
  the whole point of a reorder drag) — this story must add a document-level (or Pointer Events'
  `setPointerCapture`/`releasePointerCapture`) release path so an abandoned or completed drag always
  clears `_drag`, never leaving it stuck `active: true`.
- **Collapsed rows being passed over during a drag keep their full collapsed height and legibility**
  (this session's party-mode roundtable, Sally) — the dragged card is the only one that gets a
  lift/shadow treatment. A row that compresses to a sliver while being dragged over defeats the whole
  point of precise manual reordering (dropping exactly between two named combatants).
- **Drag must work via touch/pointer events, not a mouse-only drag handler.** This is a literal,
  testable AC (below), not an assumption — HTML5's native `draggable`/`dragstart`/`dragover`/`drop`
  API is desktop-mouse-oriented and does not fire reliably from a touchscreen; use Pointer Events
  (`pointerdown`/`pointermove`/`pointerup`) directly, consistent with `cmb.1`'s own grip listeners.

## Acceptance Criteria

1. Dragging a card's rail handle to a new position in the list reorders `_scene.combatants` to match,
   and this alone — no other combatant's `rolledInitiative`, `expanded`, `defenceUsed`, or any other
   field changes as a side effect of the reorder.
2. `rolledInitiative` is never mutated by a drag, verified by reading its value before and after a
   reorder for every combatant, not just the one moved.
3. The dragged card visibly lifts (shadow/opacity treatment); every other card passed over during the
   drag stays at its normal collapsed height and full legibility — no compression, no truncation, no
   reflow that hides the Name/Initiative/Health a drop decision depends on.
4. The drag gesture is implemented with Pointer Events (`pointerdown`/`pointermove`/`pointerup`/
   `pointercancel`), tested by dispatching those events directly in Playwright rather than a
   mouse-only `dragstart`/`drop` sequence, matching this story's AC that touch is the primary input.
5. A drag that ends with the pointer released outside any card (dropped in empty space, or the
   gesture is cancelled) leaves the order unchanged and resets `_drag` to inactive — this must be
   tested explicitly, since it's the exact gap `cmb.1`'s review flagged as unresolved in the
   grip's own element-scoped listeners.
6. Expanding a card (per `cmb.1`'s existing single-expanded-card behaviour) still works correctly
   after a reorder — the expanded state travels with the combatant object, not with a list index.
7. A new "Reset to Rolled Order" control re-sorts every parked combatant by `rolledInitiative`
   descending (ties broken by `initBase` descending, matching `rollInitiative()`'s own existing
   comparator — reuse it, don't re-derive it), restoring the original dice-rolled order regardless of
   how many drags happened since. Tested against a scenario where at least one card has actually been
   dragged out of rolled order first, not an already-sorted list.
8. Explicitly demonstrates the motivating use case end to end: roll initiative, drag a card up to
   simulate a temporary bump, confirm the bumped position holds through a `Next Turn`/`Next Round`
   cycle, then Reset to Rolled Order and confirm the bump is gone and the original roll order is
   exactly restored.
9. Every new/changed interactive control (the Reset button, the drag handle itself) meets the same
   real ≥44×44px AC `cmb.1` established — no regression on that front.

## What this story is NOT

- Not a change to how initiative is rolled, or to the roll formula/tie-break — `rollInitiative()` is
  read from, not modified, except to expose its comparator for reuse by Reset.
- Not scene persistence beyond sessionStorage — see Decisions above.
- Not the Attack modal (`cmb.3a`/`3b`) or the damage-split math (`cmb.3c`).

## Tasks / Subtasks

1. Add a document-level pointerup/pointercancel listener (or adopt `setPointerCapture` on the grip
   at `pointerdown` so the browser itself routes the eventual release back to the grip regardless of
   where the finger lifts) — fixing `cmb.1`'s flagged gap as part of building real drag, not as an
   afterthought.
2. Implement drag-to-reorder via Pointer Events: track the dragged card's `charId`, compute the
   drop target from `pointermove` position against the other cards' `getBoundingClientRect()`s, splice
   `_scene.combatants` on `pointerup` over a valid target.
3. Add the lifted/dragging visual state (opacity/shadow) to the dragged card only; confirm via the
   AC3 test that sibling cards never shrink or reflow during the drag.
4. Add a `resetToRolled()` function reusing `rollInitiative()`'s existing sort comparator (extract it
   to a small shared helper if it's currently inline, rather than duplicating the tie-break logic),
   wired to a new toolbar button alongside Next Turn/Next Round/End Combat.
5. Persist the reordered array to `sessionStorage` via the existing `_save()` call, unchanged
   mechanism, just called after a successful drop (matching how every other mutation in this file
   already saves).
6. Write the Pointer Events-based Playwright coverage for AC1-AC9, following
   `tests/cmb-1-combat-card-touch-targets.spec.js`'s own house style (real dispatched events, real
   measured boxes, service workers blocked, stubbed API).

## Dev Notes

- Real file this story touches: `public/js/game/combat-tab.js` (primary), `public/css/suite.css`
  (drag visual state only).
- `cmb.1` added `.cbt-grip` (`min-width`/`min-height: var(--tap-min)`, `touch-action: none` already
  set — good, that's required for Pointer Events drag to work without the browser's own touch
  scrolling stealing the gesture) and the inert `_drag` state this story now makes real.
- Angelus cannot smoke-test locally — the Pointer Events drag sequence (AC4/AC5 especially) needs to
  be verified by dispatching real pointer events in a real browser (Playwright), not asserted from
  reading the code.

## Dev Agent Record

Implemented by an Opus subagent (bmad-epic-loop Phase 2), 2026-09-01. Real Pointer Events
drag-to-reorder: `moveCombatant` splices `_scene.combatants` and nothing else; `_reorderPreservingActive`
re-finds the active combatant by object identity after any mutation so the turn cursor follows the
combatant, not the array slot; `_byRolledInitiative` extracted as the one shared comparator both
`rollInitiative` and the new `resetToRolled` use, so the tie-break can never drift between the two
call sites. New toolbar button "Reset to Rolled Order" wired to `combatResetOrder`.

**Correction to this story's own spec, caught by the implementer, not introduced by them:** this
story's Decisions section (written by the orchestrator at Phase 1) names the rolled-value field as
`rolledInitiative`. That field does not exist — the real field, confirmed directly in
`combat-tab.js`, is `cb.initiative`, set once in `rollInitiative()` and read (never rewritten) by
`render()`'s own pre-roll/round-view dispatch. The implementer correctly built against the real field
rather than adding a second parallel one to match the spec's wrong name, which would have been exactly
the kind of drift this story exists to prevent. Confirmed directly against the file during review
below — this was the orchestrator's own error at story-creation time, not the subagent's.

**The gesture-lifecycle fix cmb.1's review called for:** `cmb.1`'s Senior Developer Review flagged
that the drag handle's own `pointerup`/`pointercancel` listeners (scoped to the grip element) could
never fire if the gesture ended anywhere else, leaving `_drag.active` stuck `true`. Fixed with both
`setPointerCapture` at `pointerdown` (the courtesy — stops the browser handing a half-finished
gesture to scroll/selection) and a document-level `pointermove`/`pointerup`/`pointercancel` listener
bound once at module scope (the actual authority — survives `render()` replacing the grip element
mid-gesture, which capture alone cannot). `cmb.1`'s original grip-scoped `pointerup`/`pointercancel`
listeners were removed; they fired first and cleared `_drag` before the document handler could
complete the drop.

New test: `tests/cmb-2-drag-reorder.spec.js` (13 tests, AC1-AC9), including a test that reproduces
`cmb.1`'s exact flagged failure mode (a `pointerup` dispatched on `document.body`, nowhere near the
grip or card) and confirms the drop still completes and the gesture still clears. A genuine
test-infrastructure finding along the way: cards measured 106px on first render and settled to 102px
about a second later from a web-font swap, unrelated to any drag — a `settle()` helper now waits on
`document.fonts.ready` plus a stability check before any AC3 height comparison, so the test cannot
mistake a font reflow for a drag-induced compression.

## Senior Developer Review

**Independently re-verified, not trusted on the subagent's report alone** (bmad-epic-loop Phase 3,
orchestrator inline, 2026-09-01):
- Confirmed the field-name correction directly: `grep` of `combat-tab.js` shows `cb.initiative` used
  throughout (set in `rollInitiative`, read in `render`/`renderRound`/the card rail), and
  `rolledInitiative` appears only inside a code comment explaining why it was deliberately not added.
  This was the orchestrator's own mistake in both `cmb.1`'s and `cmb.2`'s story text — recorded here
  plainly rather than left implicit.
- Re-read the full diff of both changed files directly. Confirmed the drag implementation touches only
  array position and `activeIdx` (via `_reorderPreservingActive`) — no combatant's `initiative`,
  `initBase`, `expanded`, or `defenceUsed` field is written anywhere on the drag or reset path.
  Confirmed the CSS drag/drop states (`.cbt-card-dragging`, `.cbt-drop-target`) paint only
  `opacity`/`box-shadow`/`cursor`, with the drop ring deliberately `inset` to avoid a border-width
  reflow — matches AC3's letter, not just its spirit.
- Re-ran every claimed suite myself: `tests/cmb-2-drag-reorder.spec.js` (13/13) and
  `tests/cmb-1-combat-card-touch-targets.spec.js` (10/10) together, plus the four relevant vitest
  suites (135/135, unchanged from `cmb.1`) — all pass, matching the reported counts exactly.
- Read `tests/cmb-2-drag-reorder.spec.js` in full to confirm the coverage is genuinely discriminating,
  not just green: AC2 asserts a hard-coded expected initiative set so a fixture change can't make the
  test vacuously pass; AC4 includes a negative control (a complete HTML5 `dragstart`/`dragover`/`drop`
  sequence that must do nothing, proving the real implementation isn't accidentally reachable through
  the API this story explicitly rules out); AC7's second test forces a tied rolled total specifically
  so only the `initBase` tie-break can separate two combatants, which would silently fail if Reset used
  a naive re-sort instead of reusing `rollInitiative`'s real comparator; AC5 has four separate tests
  covering empty-space release, cancellation, an off-element release (the exact gap from `cmb.1`'s own
  review), and a second drag succeeding after an abandoned one.
- **Visually verified directly**: a throwaway Playwright harness (matching this story's own test
  mounting technique) dragged one card onto another's slot and screenshotted mid-drag and after-drop
  at a real phone viewport. Confirmed the dragged card visibly dims with a shadow, the drop target
  shows a clear gold ring, every card keeps its own rolled Init number through the move, and the
  active-turn highlight correctly followed the combatant rather than staying on the vacated slot —
  then deleted the harness and its screenshots per this repo's own convention.

**Three-lens findings:** none blocking. Noted for the record, not defects: the multi-touch guard
(`_wrongPointer`, ignoring a second finger's events during an active gesture) and the
identity-preserving active-turn tracking are both beyond the letter of the ACs but directly serve
their intent, not scope creep. No new entries needed in `deferred-work.md` — `cmb.1`'s own flagged gap
is now closed, not just deferred further.

**Verdict: done.** No changes needed before `cmb.3a`.

## Change Log

- 2026-09-01: Story created (bmad-epic-loop, Phase 1), ready-for-dev. Scene-persistence risk gate
  resolved by Angelus directly: sessionStorage-only, no change.
- 2026-09-01: Dev-story complete (Phase 2, Opus subagent). Real Pointer Events drag-to-reorder,
  `cmb.1`'s flagged gesture-lifecycle gap closed, one story-spec field-name error self-caught and
  corrected.
- 2026-09-01: Independently re-verified + 3-lens reviewed (Phase 3, orchestrator inline). No findings.
  Status → done.
