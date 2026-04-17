# Epic DTX: DT Processing Experience

## Motivation

The ST processing tab handles 150+ actions per cycle across 27+ characters. It works — but its UX was built incrementally across multiple epics, optimising for correctness rather than flow. The result is a powerful tool that places equal visual weight on a 5-step project action (pool → modifiers → confirm → roll → record) and a binary merit decision (approve/note/done).

The two core goals identified in the 2026-04-15 UX review session (Winston, Mary, Sally):

1. **Cross-connection visibility** — the ST's primary value-add is identifying overlaps (who else was in that territory, who's investigating the same target). The current UI forces this entirely into the ST's head. It should be surfaced from data that's already in the queue.

2. **Action complexity differentiation** — 58 of 168 actions in a typical cycle are binary merit/contact/retainer decisions. They go through the same full panel anatomy as a project action requiring pool building and dice rolling. Compact rendering for low-complexity actions reduces friction across every cycle.

Phase progress indicators (pool_status badges per phase) and notes visual hierarchy are secondary refinements.

## Design Decisions

### Phase order is immutable

The phase ordering (sorcery → feeding → ambience → hide/protect → investigate → ...) is a game-mechanics dependency chain. No DTX story may reorder phases or change how entries are assigned to phases.

### Cross-reference data is derived, never stored

The cross-reference index is built from the existing queue array after `buildProcessingQueue()` returns. No new fields on submissions, no new DB writes. The index lives only in memory during a processing session.

### Compact mode is source + category driven

An action renders in compact mode when `entry.source === 'merit'` AND `entry.meritCategory` is one of `contacts`, `retainers`, or a category whose MERIT_MATRIX mode is `auto` or `blocked`. Full pool-building panels (dice pool builder, roll card, rote/9-again toggles) never appear in compact mode.

### Backwards compatibility

All changes are additive rendering enhancements. No changes to the queue data model, submission schema, review field names, or save paths.

## Functional Requirements

- FR-DTX-01: When an ST expands a project action with a territory, an inline cross-reference callout shows other characters whose actions intersected that territory in the same cycle.
- FR-DTX-02: When an ST expands an investigate action, an inline callout shows other characters investigating the same target (if any), and whether that target has an active hide/protect action.
- FR-DTX-03: When an ST expands a feeding action, an inline callout shows other characters feeding in the same primary territory.
- FR-DTX-04: Cross-reference callouts are read-only, derived at render time from the queue, and do not appear if no cross-references exist (no empty state noise).
- FR-DTX-05: Merit, contact, and retainer actions render in a compact single-column panel that omits pool builder, roll card, rote/again toggles, and success modifier.
- FR-DTX-06: Compact panel shows: action mode chip, effect text, automatic successes count (if applicable), outcome toggle (approve/partial/fail), and ST notes field.
- FR-DTX-07: The ST notes field is visually prominent — full-width, taller default height, rendered above connected characters.
- FR-DTX-08: Player feedback field is visually distinct from ST notes — labelled clearly as player-facing, rendered below ST notes.

## Non-Functional Requirements

- NFR-DTX-01: Cross-reference index is built in a single O(n) pass over the queue after `buildProcessingQueue()` returns. No additional API calls.
- NFR-DTX-02: Compact panel mode must not regress any existing E2E tests for merit/contact actions.
- NFR-DTX-03: Phase order, action assignment to phases, and all existing save paths are unchanged.
- NFR-DTX-04: British English throughout all new labels and callout text.

## Stories

### DTX-1: Cross-Reference Callouts

After `buildProcessingQueue()` returns the queue array (line ~1805 in `downtime-views.js`), build a derived cross-reference index and pass it into the rendering pipeline. Render inline callouts on expanded action rows when cross-references exist.

**Cross-reference types to implement:**

| Trigger | Index key | Callout shows |
|---------|-----------|---------------|
| Project with `projTerritory` set | territory name | Other chars active in same territory |
| Feeding entry | `primaryTerr` / `feedTerrs` keys | Other chars feeding same territory |
| Investigate action | `investigate_target_char` from review | Other chars investigating same target; hide/protect status |

**Implementation notes:**

- Build index as a `Map` keyed by `[type:value]` string (e.g. `'terr:North Shore'`, `'inv-target:Einar Solveig'`)
- Each map value is an array of `{ charName, label, phase }` objects (exclude self)
- Pass index into `_renderProjRightPanel`, `_renderMeritRightPanel`, and the feeding panel renderer as an additional argument
- Render callout as a `<div class="proc-xref-callout">` block at the bottom of the left panel, only when cross-refs exist
- Format: `"Also in [territory]: Brandy LaRoux (Patrol), Conrad Sondergaard (Ambience +)"`
- Investigate callout also checks for any queue entry with `actionType === 'hide_protect'` whose target matches

**Acceptance Criteria:**
- Project action with a territory shows other characters active in that territory in the callout
- Feeding action shows other characters feeding the same territory
- Investigate action shows other characters investigating the same target
- Investigate callout notes if the target has an active hide/protect action
- No callout renders when no cross-references exist
- Callout is read-only (no interactive elements)
- E2E: 5 tests covering each cross-reference type and the no-callout baseline

### DTX-2: Compact Panel for Binary Actions

Merit, contact, and retainer actions currently render through the full `_renderMeritRightPanel` pipeline — pool panel, success modifier, rote toggles — most of which is irrelevant for auto-mode and fixed-effect actions. Introduce a compact right-panel path for these entries.

**Compact mode triggers** (`entry.source === 'merit'` AND any of):
- `mode === 'auto'` (automatic effect — no roll)
- `mode === 'blocked'` (cannot perform)
- `formula === 'none'` (fixed effect — staff/retainer style)
- `entry.meritCategory === 'contacts'`
- `entry.meritCategory === 'retainers'`

**Compact panel renders:**
1. Action mode chip + effect text (existing `proc-merit-effect-panel` — keep as-is)
2. If `mode === 'auto'`: automatic successes count (existing — keep)
3. Outcome toggle: `Approved` / `Partial` / `Failed` buttons (new — saves to `merit_actions_resolved[actionIdx].outcome`)
4. ST notes textarea (existing field, promoted to this panel)

**What compact panel omits:** dice pool builder, roll card, success modifier ticker, rote/9-again/8-again toggles, second opinion button, validation status buttons.

**Implementation notes:**
- Add `_isCompactMerit(entry, mode, formula)` helper returning boolean
- In `_renderMeritRightPanel`, branch early: `if (_isCompactMerit(...)) return _renderCompactMeritPanel(...)`
- Outcome toggle saves via `saveEntryReview(entry, { merit_outcome: value })` — new field, new handler
- Wire `.proc-merit-outcome-btn` click handler in the event wiring section (~line 4000)

**Acceptance Criteria:**
- Auto-mode merit actions render compact panel (no pool builder, no roll card)
- Contact actions render compact panel
- Retainer actions render compact panel
- Outcome toggle saves to `merit_actions_resolved[actionIdx].merit_outcome`
- Full-mode (investigate, patrol_scout, rumour, support, attack, hide_protect) is unchanged
- E2E: 6 tests

### DTX-3: Notes and Feedback Visual Hierarchy

The ST notes thread and player feedback input are currently rendered with similar visual weight. ST notes are the primary analytical working document (feeds Claude context); player feedback is an outbound message. They need distinct visual treatment.

**Current state (lines ~6692–6718):**
- Player feedback: `<input class="proc-feedback-input">` — single line, low prominence
- ST notes: `proc-notes-thread` with `proc-note-entry` items — threaded, but visually understated

**Target state:**
- ST notes thread: render first (above feedback), full-width textarea for new note entry expanded by default, panel title "ST Notes — visible to Claude"
- Player feedback: render second, clearly labelled "Player Feedback — sent to player", distinct background tint using existing `--surf2` token to differentiate

**Implementation notes:**
- Reorder the two sections in the rendering code (notes above feedback)
- Update panel title strings only — no class renames (avoids breaking tests)
- Add `proc-notes-panel` wrapper with `proc-notes-primary` modifier class for CSS targeting
- Add CSS in `public/css/admin-processing.css` or inline in the existing processing CSS block

**Acceptance Criteria:**
- ST notes section renders above player feedback in the panel
- ST notes panel title reads "ST Notes"
- Player feedback panel title reads "Player Feedback"
- Player feedback section has visually distinct background from ST notes
- No regression on existing notes-thread E2E tests

## Dependencies

- `public/js/admin/downtime-views.js` — all four stories modify this file
- `public/css/` — DTX-3 adds CSS rules
- `tests/downtime-processing-dt-fixes.spec.js` — existing test suite; no regressions permitted
- DTX-2 depends on DTX-3 being complete (compact panel renders notes in-panel, so visual hierarchy must be settled first)
- DTX-1 is independent and can be implemented in any order

---

## Additional Stories (added post-initial spec)

### DTX-9: Published Downtime Email
Story file: `specs/stories/dtx.9.published-downtime-email.story.md`
Status: queued — no code yet

### DTX-10: Vitae Tally Persistence & Player Portal Display
Story file: `specs/stories/dtx.10.vitae-tally-persistence.story.md`
**Status: Done — merged to main 2026-04-17 (280c338)**

Persist `feeding_vitae_tally` at pool commit time (and roll time). Player portal shows vitae breakdown card in both ready and rolled states. Client-side fallback uses `domMeritContrib` for correct effective Herd dots.
