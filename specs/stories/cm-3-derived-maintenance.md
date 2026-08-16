# Story cm-3: Derived Story-finale classification for PT/MCI maintenance

Status: done

> **Ruling documents:** `D:\Terra Mortis\cycle-model.md` §3 ("the maintenance clock stays tied to
> the Story, always" — ruled 2026-08-17, this session) and §8 ("Maintenance derivation... against
> a golden set of past Stories with the ST's actual historical toggles,
> `derived(isFinalChapterOfStory && !maintained) === ST_dropped`").
> Epic-internal story, tracked in `specs/stories/sprint-status.yaml` under `epic-cm`.
>
> **Sequence position: independently unblocked, unlike cm-2b/CM-4.** This session traced Story
> membership (`downtime_cycles.story_cycle_id`) end to end and confirmed it is an ST-assigned FK,
> untouched by CM-4's planned scope (game_number shift + `game_sessions.chapter_id`). cycle-model.md
> §11a's own sequencing (CM-3 as step 7, after step 6/CM-4) reads as priority ordering, not a
> technical gate — see `sprint-status.yaml`'s own `cm-3` row for the full reasoning. This story does
> not wait on the ~2026-09-12 burn-in.
>
> **Branch from `main`, PR direct to `main`** (project branching convention, cycle-model.md §11).

## Story

As the Storyteller,
I want "is this cycle the final chapter of its Story" to be a computed fact — derived from Story
membership and one ST-set signal at the Story level — instead of a per-chapter checkbox I have to
remember to tick on exactly the right cycle,
so that the maintenance audit panel and the player-facing at-risk warning can never silently
disagree with which chapter is actually the Story's last, the way a per-chapter manual flag can.

## Why this story exists

`cycle-model.md` §3 records the ≈3-vs-exact-3 ruling (this session): the maintenance clock is
Story-scoped, and "the warning, the drop, and the classification all become derived, not toggled —
derived from final-chapter-of-this-story, not from the number three." §8's seam assertion states
the target directly: `derived(isFinalChapterOfStory && !maintained) === ST_dropped`.

**The mechanism this replaces already exists and is fully shipped** — Epic CHM (chm-0 through
chm-3), confirmed via `git merge-base --is-ancestor` this session (all four commits are ancestors
of `origin/main`; `sprint-status.yaml` had them stale at `ready-for-dev` and has been corrected in
the same pass that created this story):

- `downtime_cycles.is_chapter_finale` — a plain boolean, **manually ticked by the ST** via a
  checkbox on the Cycle tab's Prep panel (`public/js/admin/downtime-views.js`, `renderPrepPanel`,
  `#dt-chapter-finale-input`, chm-1).
- `downtime_cycles.maintenance_audit` — `{[character_id]: {pt: bool, mci: bool}}`, an ST tick-box
  table gated on `is_chapter_finale === true` (`renderMaintenanceAuditPanel`, chm-2).
- A player-facing "at risk" warning strip on the DT form, same gate, reading the same audit record
  per-character (`public/js/tabs/downtime-form.js`, `renderMaintenanceWarnings`, chm-3).

**What is genuinely missing, confirmed live this session (read-only queries, 2026-08-17):**

1. **`is_chapter_finale` already drifts in exactly the way §3 warns about.** Live `downtime_cycles`
   today: Story 1 (`_id 6a2a8760...`, Games 1-3) has `is_chapter_finale` unset on Games 1 and 2 and
   `true` on Game 3 (correct, but only because the ST happened to tick the right one). Story 2
   (`_id 6a35cb3d...`, Games 4-6) has it explicitly `false` on Game 4 and unset on Games 5-6 — none
   flagged true yet, which is fine while the Story is still open, but nothing in the data model
   *enforces* that only the Story's actual last chapter can ever be ticked, or that ticking moves
   forward as new chapters join. A per-chapter checkbox has no structural relationship to "which
   chapter is last in this Story" at all; it is pure ST memory, the identical failure shape §3
   diagnosed for the old `chapter === 3` hardcode.
2. **A naive "highest game_number in the Story" derivation is actively wrong today.** Story 3
   (`_id 6a7ff93d...`, created 2026-08-15) currently has exactly **one** member: Game 7. Under a
   derivation that only asks "is this cycle's `game_number` the max among its Story's members," Game
   7 would read as its Story's finale **right now** — trivially true for any single-member Story —
   even though more chapters will almost certainly be added to Story 3 as play continues (Story
   length is an ongoing ST judgement call, not a structural fact: see Angelus's own aside on this
   session's cm-3 ruling, expecting Story 3 to end up 4 chapters rather than close early).
   **Structural membership alone cannot distinguish "this Story has one chapter and is done" from
   "this Story has one chapter so far."** Something has to carry the ST's actual intent that a Story
   is finished — cycle-model.md's own text just doesn't specify where that intent should live.
3. **No real "ST_dropped" precedent exists to validate against.** A live query
   (`characters.merits` with `name` in `['Professional Training', 'Mystery Cult Initiation']` and
   `active: false`) returns **zero** documents. Story 1 / Game 3's own historical
   `maintenance_audit` (21 characters, real mixed `pt`/`mci` ticks, some explicitly `false`) has
   never once been followed by a corresponding merit drop — confirming the audit panel has only
   ever been informational in practice, never enforced. §8's "golden set of past Stories with the
   ST's actual historical toggles" **does not exist as literally worded** — there is no historical
   `ST_dropped` signal on record. This story's own validation must be built from fixtures modelled
   on the real audit shape, not a real historical case; documented as a deliberate deviation from
   §8's literal text, per this project's own "narrow the citation, log the real gap" convention
   (cm-7 precedent).

## What this story IS

> **REVISED 2026-08-17, post-review** (see "Review Findings" below for the finding that prompted
> this). The original design used a `story_cycles.closed` boolean plus a "highest `game_number`
> among the Story's current members" computation to derive the finale. Review found this let the
> finale silently relocate if Story membership changed after closing (a genuinely live risk — Story
> membership is assigned one cycle at a time, and this project's own ST already revises Story length
> mid-stream). **Angelus's own direct instruction, discussing the finding**: "it feels like we need a
> mechanism to manually set a chapter as 'final' for a story." Items 1, 2 and 5 below are rewritten
> to that design; items 3, 4, 6, 7, 8 are otherwise unchanged in intent.

1. Add one ST-set field at the **Story** level — `story_cycles.final_chapter_id` (string, the `_id`
   of one of that Story's member cycles, or absent/`null` if the Story isn't closed yet) — set once,
   naming the *specific* chapter the ST has chosen as the finale. This single field **replaces both**
   the old per-chapter `is_chapter_finale` checkbox **and** any separate "closed" flag: a Story is
   closed exactly when `final_chapter_id` is set, and which chapter is final is never recomputed —
   it's the chapter the ST named, full stop. This is the *only* new manual input this story
   introduces.
2. A new pure function, `isFinalChapterOfStory(cycle, storyCycle)` (two arguments — no `allCycles`,
   no `game_number` comparison needed at all), co-located with this project's other pure
   cycle-derivation helpers (`cyclePhase`, `deriveCycleStatus`, `isFeedingOpen` — all in
   `public/js/downtime/db.js`). Returns `true` iff `storyCycle?.final_chapter_id` is set AND equals
   `String(cycle._id)`. Returns `false` for every other case (no Story assigned, Story unresolved,
   Story has no `final_chapter_id` set yet, or it names a different cycle). Because this is a direct
   pointer rather than a computation over sibling cycles, it cannot be affected by a tied
   `game_number`, a non-numeric `game_number`, or a later Story-membership change to any *other*
   cycle — closing three review findings (the tied-`game_number` double-finale, the `Number()`
   coercion gap, and the "reassignment relocates the finale" decision-needed item) by construction
   rather than by patching each one.
3. Re-point every existing consumer of `is_chapter_finale` at the derived function instead:
   `renderMaintenanceAuditPanel`'s gate (admin), `renderMaintenanceWarnings`'s gate (player). Same
   downstream behaviour (the audit table and the warning strip appear under the same real-world
   condition), different — now drift-proof — source.
4. Remove the Prep panel's "Chapter Finale" checkbox and its write (`updateCycle(cycle._id,
   {is_chapter_finale: val})`). Replace it with a **read-only** derived badge on the same panel
   ("Chapter Finale — Story N" / nothing, if not derived true) so the ST can still see the state at a
   glance without being able to set it in the wrong place.
5. Add the "Final chapter" control where a Story-level decision belongs: the existing Stories table
   (`public/js/admin/cycle-views.js`, `buildStoryCyclesPanel`) gains a column with a `<select>` per
   row, populated with that Story's own member cycles (query `downtime_cycles` by `story_cycle_id`,
   same resolution the admin/player code already does), defaulting to "— not closed —" plus one
   option per member cycle (label by the cycle's own `label`/`game_number`). Choosing a cycle PATCHes
   `story_cycles/:id {final_chapter_id: cycleId}`; choosing "— not closed —" PATCHes
   `{final_chapter_id: null}`. Same interaction shape as every other inline edit already in that
   table, just a `<select>` instead of a checkbox since this is now a pick-one, not a toggle.
5a. **Reassignment guard.** When a cycle's `story_cycle_id` is changed (the existing per-cycle Story
   picker in `cycle-views.js`, `buildStoryCycleSelect`) or when a cycle is deleted, and that cycle is
   currently named as *any* Story's `final_chapter_id`: refuse the change (mirror the existing
   `STORY_CYCLE_IN_USE`-style 409 this router already uses for the Story-delete guard, naming the
   Story and its current finale) rather than silently leaving `final_chapter_id` dangling. The ST
   must first re-point or clear that Story's `final_chapter_id` before moving or deleting its named
   finale chapter.
6. Server: `server/routes/story-cycles.js`'s `PATCH /:id` gains `final_chapter_id` to its
   updatable-fields allowlist — validated as either `null` or a string that resolves to a real
   `downtime_cycles` document whose own `story_cycle_id` equals this Story's `_id` (400 with a named
   reason otherwise — this is the one place a bad pointer could be written, so validate it at the
   write, not just trust the client). No schema file exists for `story_cycles` today (the route
   validates inline) — extend that same inline pattern, do not introduce a new JSON-schema file.
7. Add `getStoryCycles()` to `public/js/downtime/db.js` (`GET /api/story_cycles`, mirroring the
   existing `getCycles()` shape) so player-facing code (`downtime-form.js`) can resolve a cycle's
   Story without a second, ad-hoc fetch pattern.
8. The §8 seam-assertion test, built from fixtures (per the "no real precedent" finding above): seed
   a small multi-chapter Story (`final_chapter_id` set to one specific member) and a single-chapter
   Story (mirroring live Story 3's real shape, `final_chapter_id` absent) and assert
   `isFinalChapterOfStory` returns exactly the expected boolean for each member cycle — including the
   Story-3-shaped negative case as its own named, must-pass test (see AC6), AND a case proving a tied
   `game_number` between two cycles no longer produces a double-finale (only the one actually named
   by `final_chapter_id` reads true).

## What this story is NOT

- **NOT a change to `merit.active` toggle mechanics.** `shToggleMCI`/`shTogglePT`
  (`public/js/editor/edit-domain.js`) stay exactly as they are, still a manual ST action on the
  sheet editor, completely separate from this story's classification work. The ~15 existing
  `m.active !== false` read sites (`sheet.js`, `domain.js`, `audit.js`, `edit.js`,
  `mci-evaluator.js`, `st-mods.js`, `st-mods-panel-logic.js`, `downtime-form.js`,
  `downtime-views.js`) are untouched. **Enforcement stays exactly as manual as it is today** — this
  story only fixes the *signal* (is this chapter really the Story's finale, has this character
  really been ticked), not the *action* an ST takes on seeing it. See Open Question 3.
- **NOT CM-4 or cm-2b.** Confirmed independent this session (see the sequencing note above and
  `sprint-status.yaml`'s own `cm-4` row).
- **NOT a UI/markup redesign of CHM-0..3.** The maintenance audit table, the warning strip's copy
  and styling, `MAINTENANCE_MERITS`, `maintenanceHoldings` — all untouched. Only the *gate condition*
  each reads changes source.
- **NOT a data migration.** `is_chapter_finale` and the existing `maintenance_audit` records on live
  `downtime_cycles` documents are left exactly as they are — `is_chapter_finale` simply becomes a
  dead, unread field (same convention as `chapters` being left as an untouched rollback copy after
  CM-2's live `--apply`); `maintenance_audit` keeps its exact shape and role, still gated on the
  same real-world condition, just sourced from the new derivation. No `--apply` script, no live
  `tm_suite` write beyond the one new `final_chapter_id` field an ST sets by hand per Story, exactly
  the same shape of manual involvement the old checkbox already required. **Deploy note:** live
  Story 1 already has a real, ST-completed `maintenance_audit` for Game 3 under the old
  `is_chapter_finale` flag — an ST needs to set Story 1's `final_chapter_id` to Game 3's `_id` at/after
  deploy for that panel and the player warning to resume behaving as they did before (see Review
  Findings; this was flagged as a gap in the original `closed`-boolean design and applies identically
  here — nothing here auto-migrates it).
- **NOT solving "undo a Story close."** `final_chapter_id` is a plain, freely re-settable pointer
  (including back to `null`), exactly as reversible as the checkbox it replaces, modulo the
  reassignment guard in item 5a (which blocks moving/deleting the *named* cycle out from under an
  active `final_chapter_id`, not re-pointing or clearing the field itself). No confirmation dialog,
  no history/audit trail on the field itself.
- **NOT the actual PT/MCI drop enforcement.** Per Open Question 3 below — recommended out of scope,
  flagged for an explicit decision before dev starts regardless.

## Acceptance Criteria

> **Revised 2026-08-17, post-review** — ACs 1, 2, 3, 6, 7 rewritten for the `final_chapter_id`
> design; AC10 and AC11 are new. ACs 4, 5, 8, 9 are unchanged in intent (only the field/function name
> they reference changed).

1. **`story_cycles.final_chapter_id` exists and is ST-settable, with server-side referential
   validation.** `PATCH /api/story_cycles/:id` accepts `{final_chapter_id: string | null}` (alone or
   combined with `number`/`label`). `null` clears it unconditionally. A non-null value is validated:
   400 if it isn't a string, 400 with a named reason if no `downtime_cycles` document with that `_id`
   exists, 400 with a named reason if that document's `story_cycle_id` doesn't equal this Story's own
   `_id` (a cycle cannot be named finale of a Story it doesn't belong to). Valid writes persist and
   return the updated document. `GET /api/story_cycles` and `GET /api/story_cycles/:id` return it
   unchanged.

2. **`isFinalChapterOfStory(cycle, storyCycle)` is a pure, exported function in
   `public/js/downtime/db.js`, taking exactly two arguments.** No I/O, no mutation, no third
   `allCycles` argument and no `game_number` comparison of any kind. Returns `true` iff
   `storyCycle?.final_chapter_id` is set (non-null, non-empty string) AND
   `String(storyCycle.final_chapter_id) === String(cycle._id)`. Returns `false` for a cycle with no
   `story_cycle_id`, an unresolved `story_cycle_id` (`storyCycle` is `null`/`undefined`), a
   `storyCycle` with `final_chapter_id` unset, or one naming a different cycle's `_id`.

3. **Admin: the Stories table gets a "Final chapter" column.** `buildStoryCyclesPanel`
   (`public/js/admin/cycle-views.js`) renders a `<select>` per row: a "— not closed —" option plus one
   option per that Story's own member `downtime_cycles` (resolved by `story_cycle_id`, labelled by
   the cycle's own `label`/`game_number`), selected value reflecting `story.final_chapter_id`.
   Changing it calls `PATCH /api/story_cycles/:id {final_chapter_id: val || null}` and updates
   `view.storyCycles` in place (matching the existing inline-edit pattern already used for the
   Story-picker dropdown on each cycle row). A 400 from the reassignment/validation guard (AC10)
   surfaces inline and reverts the `<select>` to its prior value.

4. **Admin: the Prep panel's manual checkbox is gone, replaced by a derived, read-only badge.**
   `renderPrepPanel` (`public/js/admin/downtime-views.js`) no longer renders
   `#dt-chapter-finale-input` or writes `is_chapter_finale`. In its place, a plain text/badge element
   shows "Chapter Finale" (with the Story's own label, e.g. "Story 1") when
   `isFinalChapterOfStory(...)` is true for the cycle being viewed, and nothing otherwise.

5. **`renderMaintenanceAuditPanel` and `renderMaintenanceWarnings` gate on the derived function, not
   `cycle.is_chapter_finale`.** Both call sites (`public/js/admin/downtime-views.js`,
   `public/js/tabs/downtime-form.js`) are updated to compute and pass through
   `isFinalChapterOfStory(...)` instead of reading the now-dead field. `downtime-form.js` gains
   whatever fetch (`getStoryCycles()`) it needs to resolve the current cycle's Story document — it
   does not have this today (it only receives one cycle). Both call sites resolve "which
   `story_cycles` document belongs to this cycle" through one shared function (not two independent,
   duplicated `String(s._id) === String(cycle.story_cycle_id)` lookups) — see Task 2's own note.

6. **The Story-3 edge case is a named, must-pass test.** Using a fixture shaped like live Story 3
   (one member cycle, `story_cycle_id` set, `story_cycles.final_chapter_id` absent):
   `isFinalChapterOfStory` returns `false` for that cycle. A second fixture — same Story,
   `final_chapter_id` set to that cycle's own `_id` — returns `true` for the same cycle. This is the
   concrete regression case that motivated the field; the test name should say so explicitly (e.g. "a
   single-chapter Story is not its own finale until named").

7. **A multi-chapter fixture proves the pointer is exact, not positional.** A fixture Story with
   three member cycles, `final_chapter_id` set to the *middle* member's `_id` (deliberately not the
   highest `game_number`, to prove this is a real pointer and not a disguised max-`game_number`
   check): `isFinalChapterOfStory` is `true` for that named member only, `false` for the other two —
   including the one with the higher `game_number`.

7a. **A tied-`game_number` fixture proves no double-finale.** Two cycles in the same Story share an
   identical `game_number` (mirroring the live duplicate-"Game 7" incident on record); one is named
   `final_chapter_id`. `isFinalChapterOfStory` is `true` for the named one only, `false` for its
   `game_number`-twin.

8. **The historical-audit-shaped fixture proves the "who's at risk" read survives real-world data
   noise.** A fixture built from Story 1 / Game 3's real `maintenance_audit` shape (per-character
   mixed `pt`/`mci` booleans, some explicitly `false`, some characters absent from the audit
   entirely) drives `renderMaintenanceWarnings`/the audit panel's own per-character logic and asserts
   the expected set of "still needs a tick" characters — proving the derivation change doesn't alter
   which characters show as at-risk, only what gates the panel's visibility. This must exercise the
   real `renderMaintenanceAuditPanel` eligibility rule too (its `!c.retired` filter and its own PT/MCI
   branches), not only a hand-copied mirror of it — see Review Findings' AC8 finding for why a mirror
   alone doesn't satisfy this.

9. **Changed-area regression stays green.** Targeted vitest + Playwright suites covering
   `downtime-views.js`'s maintenance audit panel, `downtime-form.js`'s warning strip, and
   `story-cycles.js`'s route tests, plus any existing chm-0..3 test files, all pass unmodified in
   behaviour (same real-world gate condition, different source) except for any test that literally
   asserted on the now-removed `#dt-chapter-finale-input` checkbox, which is updated to assert the
   new read-only badge instead.

10. **Reassignment/deletion guard (new).** `PATCH` on a cycle's `story_cycle_id` (the per-cycle Story
   picker) and `DELETE /api/downtime_cycles/:id` both refuse (400/409, naming the Story and its
   current finale label) when the target cycle is currently *any* Story's `final_chapter_id`. The ST
   must clear or re-point that Story's `final_chapter_id` first.

11. **Deploy note recorded, not silently assumed.** The story's own "What this story is NOT" section
   and Dev Agent Record state plainly that live Story 1 needs its `final_chapter_id` set by hand
   (to Game 3's `_id`) post-deploy for the existing, real `maintenance_audit` history to become
   visible again — this AC is satisfied by the documentation existing, not by a script (no
   `--apply`/migration is in scope here).

## Tasks / Subtasks

- [x] **Task 1 — Server: `closed` field (AC1)**
  - [x] Extend `PATCH /api/story_cycles/:id`'s inline validation to accept `closed: boolean`.
  - [x] Route/API tests for the new field (valid boolean, non-boolean 400, combined with
        `number`/`label` in one PATCH).

- [x] **Task 2 — Derivation function + Story fetch (AC2, AC6, AC7)**
  - [x] `isFinalChapterOfStory(cycle, allCycles, storyCycle)` in `public/js/downtime/db.js`.
  - [x] `getStoryCycles()` in the same file, mirroring `getCycles()`.
  - [x] Unit tests: the Story-3 single-member edge case (AC6, both `closed` states), the Story-1
        multi-member case (AC7), a cycle with no `story_cycle_id` at all, an unresolved
        `story_cycle_id` (Story deleted out from under a cycle — confirm this returns `false`, not a
        throw).

- [x] **Task 3 — Admin: Stories table Closed column (AC3)**
  - [x] Checkbox column in `buildStoryCyclesPanel`, PATCH wiring, in-place `view.storyCycles` update.

- [x] **Task 4 — Admin: Prep panel badge replaces the checkbox (AC4, AC5 admin half)**
  - [x] Remove `#dt-chapter-finale-input` and its `updateCycle` write from `renderPrepPanel`.
  - [x] Add the derived read-only badge.
  - [x] `renderMaintenanceAuditPanel`'s gate switches to the derived call.

- [x] **Task 5 — Player: warning strip gate (AC5 player half)**
  - [x] `renderMaintenanceWarnings` (`downtime-form.js`) resolves sibling cycles + Story doc and
        calls the derived function instead of reading `cycle.is_chapter_finale`.
  - [x] Re-check `getAuditMaintained` (dtui-50 chip logic, same file) for any other
        `is_chapter_finale` read that needs the same swap. **Result: it has none** — it reads
        `cycle.maintenance_audit` directly with no finale gate of its own, so nothing to swap.

- [x] **Task 6 — Fixture-based seam-assertion test (AC8)**
  - [x] Build the Story-1/Game-3-shaped `maintenance_audit` fixture from the real live shape
        recorded in this story (21 characters, mixed ticks) — anonymised character IDs, not the
        real ones.
  - [x] Assert the at-risk character set is unchanged by the classification-source change.

- [x] **Task 7 — Changed-area regression (AC9)**
  - [x] Identify and run every existing test file touching `story-cycles.js`, the maintenance audit
        panel, and the warning strip; update any assertion that literally checked for
        `#dt-chapter-finale-input`. **None existed** — the only `is_chapter_finale` occurrences in
        `tests/` are inert `is_chapter_finale: false` fields inside 22 Playwright cycle fixtures,
        which now simply describe a dead field and change no behaviour.
  - [x] Targeted only, per this project's standing instruction — do not run the full suite.

- [x] **Task 8 — `reference-data-ssot.md` entry**
  - [x] Document `story_cycles.closed` alongside the collection's existing `number`/`label` entry
        (CLAUDE.md's "Data Sources of Truth" instruction — every domain's collection/route/UI is
        mapped there before a feature that reads/writes it ships).

- [ ] **Task 9 — PR to `main`.** Only on Angelus's explicit word, per project convention.
      *(Left open deliberately: not committed, not pushed, no PR. The working tree carries the
      change for Angelus's own commit step.)*

- [x] **Task 10 — Redesign `closed` → `final_chapter_id`, and apply the still-valid review findings
      (AC1, AC2, AC3, AC5, AC6, AC7, AC7a, AC8, AC10, AC11)**
  - [x] **Server** (`server/routes/story-cycles.js`): replace the `closed` boolean field with
        `final_chapter_id` on the PATCH allowlist. `null` clears unconditionally. A non-null value
        must resolve to a real `downtime_cycles` document whose `story_cycle_id` equals this Story's
        own `_id` (400, named reason, otherwise) — AC1.
  - [x] **Reassignment/deletion guard** (AC10): the per-cycle Story-picker PATCH path and
        `DELETE /api/downtime_cycles/:id` both refuse when the target cycle is currently named as
        *any* Story's `final_chapter_id` — mirror this router's existing `STORY_CYCLE_IN_USE`-shaped
        409, naming the Story and its finale. **Note:** the per-cycle Story picker writes through
        `PUT /api/downtime_cycles/:id` (`updateCycle`), not a PATCH — the guard is on the PUT, and
        only fires when the FK value actually changes, so the Data Portability importer's
        full-document restore still passes through. Both live in `server/routes/downtime.js`
        (`namedFinaleRefusal`), not `story-cycles.js`, because that is where those two routes live.
  - [x] **`isFinalChapterOfStory(cycle, storyCycle)`** (`public/js/downtime/db.js`): rewrite to the
        2-argument pointer check (AC2) — delete the `allCycles`/`game_number`/max-comparison logic
        entirely, it's no longer needed.
  - [x] **Single shared resolver** — closes the review's "resolver duplicated across two files"
        finding. Export one function (alongside `isFinalChapterOfStory`, in `db.js`) that resolves a
        cycle's own `story_cycles` document from a `storyCycles` list, and have
        `downtime-views.js`/`downtime-form.js` both call it instead of each keeping its own
        `String(s._id) === String(cycle.story_cycle_id)` copy (AC5). Shipped as
        `storyCycleForCycle(cycle, storyCycles)`; the predicate additionally enforces the ownership
        relationship the same finding flagged.
  - [x] **Admin Stories table** (`cycle-views.js`, `buildStoryCyclesPanel`): replace the Closed
        checkbox column with a "Final chapter" `<select>` per Story, populated from that Story's own
        member cycles; PATCH `{final_chapter_id: val || null}` on change; surface a 400 from the new
        guard inline and revert the `<select>` (AC3).
  - [x] **Prep panel badge** (`downtime-views.js`, `renderPrepPanel`): update copy to name the Story
        without the word "closed" (e.g. "Chapter Finale — Story 1") since closure is now implicit in
        `final_chapter_id` being set, not a separate flag (AC4).
  - [x] **Tests**: rewrite the AC6/AC7 fixtures for the pointer design; add AC7a's tied-`game_number`
        case; add coverage for the new referential-validation 400s and the reassignment/deletion
        guard (AC10).
  - [x] **AC8 rework**: stop asserting against the hand-copied `atRiskSet()` mirror alone. Taken via
        the first option — the real per-character eligibility + at-risk logic is now exported and
        driven directly. It was extracted into a new pure module, `public/js/downtime/maintenance.js`
        (`maintenanceHoldings`, `maintenanceEligibleChars`, `maintenanceAtRisk`), which BOTH consumers
        now import instead of each carrying its own copy; the test imports the same module. The
        admin panel's `!c.retired` filter and the asymmetric PT branch are covered as production
        code, not as a reimplementation.
  - [x] **Deploy note**: add a short, explicit note (Dev Agent Record + `reference-data-ssot.md`'s
        `story_cycles` entry) that live Story 1 needs `final_chapter_id` set to Game 3's `_id` by
        hand, post-deploy, for its existing real `maintenance_audit` to become visible again (AC11).
  - [x] **Also apply, unaffected by the redesign** (still-valid Review Findings, listed below):
        silent-failure signal on a `story_cycles` fetch error; the Stories-table in-flight/race guard
        (now on the new `<select>`, not the old checkbox) and the detached-node revert; the Playwright
        PATCH mock's wrong document identity; the ~22 DT-form Playwright specs with zero e2e coverage
        of the player-side gate; the duplicated `.cy-story-closed`/`.dt-maintenance-tick` CSS rule
        (rename/repurpose for the new `<select>` control, don't reintroduce the duplicate); the
        untorn-down global test stubs; the story's own File List record inaccuracies; the duplicate
        test.
  - [x] **No longer applicable, superseded by the redesign** — do not separately patch: the
        tied-`game_number` double-finale finding (AC7a now proves this structurally) and the
        `Number()`-coercion-on-`game_number` finding (the derivation no longer reads `game_number` at
        all).
  - [x] Re-run the full targeted regression (Task 7's own suite list) after the rework; update the
        Dev Agent Record and File List.

### Review Findings

Internal 3-layer review (Blind Hunter, diff-only; Edge Case Hunter, diff + full repo; Acceptance
Auditor, diff + this spec + `cycle-model.md` §3/§8), 2026-08-17. Two of Blind Hunter's own
High-severity claims were checked directly against the code and found false (cross-tab staleness,
an `esc()` crash) — noted below rather than silently dropped, since a reviewer's own errors are
worth recording.

- [x] [Review][Decision][RESOLVED 2026-08-17] Reassigning a cycle's `story_cycle_id` into or within
  an already-`closed` Story silently relocates the derived finale and orphans any recorded
  `maintenance_audit` ticks on the cycle that loses it. **Angelus's ruling: redesign, not a guard
  bolted onto the old shape** — "it feels like we need a mechanism to manually set a chapter as
  'final' for a story." Resolved by replacing `story_cycles.closed` (boolean) +
  max-`game_number`-among-members with `story_cycles.final_chapter_id` (an explicit pointer to one
  specific cycle), plus a reassignment/deletion guard (AC10) refusing to move or delete a cycle
  currently named as a Story's finale. See "What this story IS" items 1, 2, 5, 5a and Task 10. This
  also structurally closes two other findings below (the tied-`game_number` double-finale and the
  `Number()`-coercion gap) rather than needing separate point-fixes for them.

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] AC8's seam-assertion test didn't drive the real functions it claimed to —
  compares two invocations of its own local `atRiskSet()` mirror against the same boolean argument
  (tautological on the gate branch), never imports or calls `renderMaintenanceWarnings` or
  `renderMaintenanceAuditPanel`, and models neither the admin panel's `!c.retired` filter nor its
  real PT rule — so the "audit panel's own per-character logic" half of AC8 has zero coverage. The
  PT-branch source-contract pin is also a weak substring match that a symmetric-rule change would
  pass right through. [server/tests/cm-3-derived-maintenance.test.js]

- [x] [Review][Patch][SUPERSEDED by the `final_chapter_id` redesign] Tied/duplicate `game_number`
  within one closed Story classifies BOTH cycles as the finale — no tiebreak. This project has a live
  precedent for exactly this shape (the duplicate "Game 7" `downtime_cycles` document, on record in
  `sprint-status.yaml`). Structurally closed by the redesign (AC7a proves it): the derivation is now
  a direct pointer, not a computation over `game_number`, so there is nothing left to tie on.
  [public/js/downtime/db.js isFinalChapterOfStory]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] `isFinalChapterOfStory` never verified the `storyCycle` argument actually
  belongs to `cycle` (no `storyCycle._id` vs `cycle.story_cycle_id` check) — latent today since both
  real call sites resolve correctly first, but weaker than AC2's documented contract. Compounding
  this, the Story→cycle resolver (`String(s._id) === String(cycle.story_cycle_id)`) is duplicated
  verbatim in the admin panel and the player form instead of living beside the predicate — exactly
  the "two surfaces can silently disagree" class this story exists to prevent. Fix: move resolution
  inside `isFinalChapterOfStory` (or one shared exported resolver both call), closing the ownership
  gap and the duplication together. [public/js/downtime/db.js; downtime-views.js:1955-1958;
  downtime-form.js:3683-3687]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] Silent `.catch(() => [])` on `GET /api/story_cycles` hides the finale badge,
  the maintenance audit panel, AND the player at-risk warning strip with zero user-facing signal —
  indistinguishable from "Story just isn't closed yet." [downtime-views.js:1205;
  downtime-form.js:1442-1444; badge rendering downtime-views.js:2664-2672]

- [x] [Review][Patch][DOCUMENTED 2026-08-17, Task 10] Deploy-time gap: live Story 1 already carries a real, ST-completed
  `maintenance_audit` for Game 3 under the old `is_chapter_finale` flag, but no live `story_cycles`
  document has `closed` set yet — the panel and warning strip go dark for Story 1 until an ST
  manually ticks Closed, and nothing documents that this manual step is needed at/after deploy.
  [deploy note / Dev Agent Record, not a code line]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] Stories-table control had no in-flight guard — rapid double-toggles can
  resolve out of order and leave the UI disagreeing with the server; the failure-path revert also
  reads a `ch.closed` a concurrent request may already have mutated, and a revert after the row list
  is rebuilt (e.g. another Story deleted mid-flight) writes into a detached node.
  [public/js/admin/cycle-views.js:~231-251]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] Playwright PATCH mock returned the wrong document identity (hardcoded
  `_id: 'sc-002'` regardless of which row was patched) — inert today since the client ignores the
  response body, but would mask a future regression that started trusting it.
  [tests/cycle-tab.spec.js:636-639]

- [x] [Review][Patch][SUPERSEDED by the `final_chapter_id` redesign] `Number(null/''/false)` coerces
  to `0` and slips past the `Number.isFinite` guard on `game_number` — a stub/placeholder cycle with a
  non-numeric `game_number` can misclassify as a Story's finale. Structurally closed: the redesigned
  derivation never reads `game_number` at all, so there's no coercion path left to guard.
  [public/js/downtime/db.js:273-280]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] ~22 existing player-facing DT-form Playwright specs don't mock
  `GET /api/story_cycles`, permanently pinning `_storyCycles = []` for all of them — the player-side
  half of this story's own derivation has zero e2e coverage. [tests/*.spec.js;
  downtime-form.js:1443]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] `.cy-story-closed` was a byte-for-byte duplicate of the existing
  `.dt-maintenance-tick` rule — violates this story's own Dev Notes "reuse, never invent" CSS
  instruction. [public/css/admin-layout.css]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] Global stubs (`localStorage`/`fetch`/`location`) installed in the new test
  file's `beforeAll` are never torn down in `afterAll` — matches this exact project's own documented
  concurrent/leaked-stub-across-suites hazard class. [server/tests/cm-3-derived-maintenance.test.js:728-735]

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] Minor record inaccuracies in this story's own File List: this file listed as
  Modified when it's new; `admin-layout.css` described as "two token-only rules" when it also carries
  literal pixel dimensions.

- [x] [Review][Patch][FIXED 2026-08-17, Task 10] Duplicate test — `'ignores cycles belonging to a DIFFERENT Story...'` is
  byte-identical to the test immediately above it, adding no real coverage.
  [server/tests/cm-3-derived-maintenance.test.js:801-805]

- [x] [Review][Defer] `renderDowntimeTab`'s `_allCycles = []` reset has no render-generation guard
  (this project has an established fix for exactly this class — `_fetchGen`, the oxp-3 precedent —
  not reached for here), but the underlying re-entrancy hazard on this render function predates this
  diff. [downtime-form.js:1423] — deferred, pre-existing.
- [x] [Review][Defer] A Story closing mid-downtime never reaches a player who already has the DT
  form open (no WS push/invalidation) — the same limitation the old `is_chapter_finale` checkbox
  already had, not a regression this diff introduces. [downtime-form.js] — deferred, pre-existing.
- [x] [Review][Defer] `story-cycles.js`'s DELETE guard counts `story_cycle_id` as a string only; an
  ObjectId-typed FK would bypass it. Pre-existing code, untouched by this diff.
  [server/routes/story-cycles.js:104] — deferred, pre-existing.

**Dismissed as noise or verified false (9):** Blind Hunter's cross-tab-staleness High claim
(checked directly against `admin.js:331` → `initDowntimeView` → `loadAllCycles()`: the reload runs
outside the `_shellInited` guard, so it re-fetches on every Downtime-domain tab activation, not
once — the Acceptance Auditor's contradicting finding was correct); Blind Hunter's `esc()` TypeError
claim (`downtime-views.js`'s `esc` does `d.textContent = s`, and the DOM setter coerces numbers to
strings without throwing); the `accent-color: var(--accent)` undefined-token concern (confirmed real
and themed by two layers); the player-auth-403 concern on the `story_cycles` GET (confirmed public,
no `requireRole`); the "`_allCycles` might be filtered/paginated for players some day" concern
(speculative, no corroborating evidence); the `cycle-model.md` §3 "`chapter_ids`" literal-phrasing
divergence (the story's own AC2 deliberately chose max-`game_number` instead — a doc-divergence to
record, not a defect, per the Acceptance Auditor's own framing); source-contract regex
brittleness/CWD-dependent test-helper-path complaints (matches an already-accepted convention in
this exact codebase — `cm-7`'s own review dismissed an identical complaint on the same grounds);
the untested validation-message-text-drift nit (cosmetic, no precedent of testing message text
elsewhere); the dead `data-id` attribute on the new checkbox (harmless, matches existing convention
elsewhere in the same table).

## Open questions for Angelus (flag before dev starts)

1. **Should closing a Story be freely reversible, exactly like the checkbox it replaces?**
   **Recommended: yes**, plain toggle, no confirmation dialog — matches both the existing UI's
   low-ceremony pattern and this session's own evidence that Story length is a live, revisable ST
   judgement call (the Story-3/November aside).
2. **Does a Story marked `closed` while its own top chapter is still mid-`downtime`/`prep` need any
   extra guard or warning?** **Recommended: no** — `isFinalChapterOfStory` is a structural fact
   independent of the chapter's own phase; gating the maintenance audit during the finale chapter's
   own downtime/prep (before its game happens) is exactly CHM-2/CHM-3's existing intended workflow,
   not a new edge case this story introduces.
3. **Should this story also wire the derived classification into actually flipping
   `merit.active = false` when unmaintained, or stay display-only (ST still manually toggles, as
   today)?** **Recommended: display-only, stay manual.** cycle-model.md's "the warning, the drop,
   and the classification all become derived" reads as a target end-state, but auto-flipping a
   character's merit is a materially bigger, riskier change (a background/render-time write to
   player-visible data, on zero real precedent to validate against — see the "no real ST_dropped
   case" finding above) that deserves its own story, its own explicit ST sign-off on the exact
   trigger condition (the instant a Story closes? the next time that character's sheet renders? a
   dedicated ST batch action?), and is not needed to satisfy this session's own maintenance-clock
   ruling, which was about the *classification* rule, not the enforcement mechanism.

## Dev Notes

- **CSS: reuse, never invent.** The Prep panel's new read-only badge (AC4) and the Stories table's
  new checkbox column (AC3) must use existing classes/tokens — `dt-maintenance-*` and `cy-*` already
  cover this exact panel family (`public/js/admin/downtime-views.js`'s `dt-` prefix,
  `cycle-views.js`'s `cy-` prefix). No bare hex, no inline `style="..."`, per
  `specs/project-context.md` (auto-loaded this run) and `specs/architecture/coding-standards.md`.
  Grep both stylesheets for an existing "read-only fact" or "badge" pattern before adding a new
  class.
- **Don't thread a third fetch through `downtime-form.js` if two already cover it.** Task 5's
  sibling-cycles resolution should reuse whatever cycle-list fetch the form already performs on load
  (it already resolves `currentCycle` from somewhere) rather than adding an independent `getCycles()`
  call that could race or double-fetch.

## References

- [Source: D:\Terra Mortis\cycle-model.md §3] — the ≈3-vs-exact-3 ruling (this session,
  2026-08-17) and the "derived, not toggled" instruction this story implements.
- [Source: D:\Terra Mortis\cycle-model.md §8] — the seam assertion,
  `derived(isFinalChapterOfStory && !maintained) === ST_dropped`.
- [Source: specs/stories/sprint-status.yaml, `cm-3-derived-maintenance` row] — the ruling record and
  the cm-4 sequencing independence finding.
- [Source: specs/stories/sprint-status.yaml, `epic-chm`/`chm-0..3` rows] — corrected 2026-08-17 from
  stale `ready-for-dev` to `done`; this story's own "current state" baseline.
- [Source: public/js/admin/downtime-views.js:1911-1980, 2634-2704] — `maintenanceHoldings`,
  `maintenanceEligibleChars`, `setMaintenanceAudit`, `renderMaintenanceAuditPanel`, `renderPrepPanel`
  (the checkbox and its write, to be removed).
- [Source: public/js/tabs/downtime-form.js:3641-3670, 5713-5722] — `maintenanceWarningHtml`,
  `renderMaintenanceWarnings`, `getAuditMaintained` (dtui-50).
- [Source: public/js/editor/edit-domain.js:215-233] — `shToggleMCI`/`shTogglePT`, confirmed
  untouched by this story.
- [Source: server/routes/story-cycles.js] — the five-endpoint `story_cycles` router this story
  extends (PATCH only).
- [Source: public/js/admin/cycle-views.js:184-330] — `buildStoryCyclesPanel`, the Stories table this
  story adds a column to.
- [Source: public/js/downtime/db.js:20-30, 89-238] — `getCycles`, `cyclePhase`, `deriveCycleStatus`,
  `isFeedingOpen` — the existing pure-derivation-function precedent `isFinalChapterOfStory` follows.
- [Source: live `tm_suite` read-only queries, 2026-08-17] — zero characters with an inactive PT/MCI
  merit; `story_cycles` documents confirmed `{_id, number, label, created_at}` only, no `closed`
  field yet; `downtime_cycles` Story-1/2/3 membership and `is_chapter_finale`/`maintenance_audit`
  shapes as quoted in "Why this story exists" above.
- [Source: server/schemas/character.schema.js:435-489] — the `merit` sub-schema, confirming
  `active: {type: 'boolean'}` already exists and is untouched by this story.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Opus 5, 1M context) via the `bmad-dev-story` workflow, 2026-08-17.

### Open Questions — answered as recommended

Angelus was not reachable during this run, so all three open questions were implemented **per the
story's own stated "Recommended" answer**. Each is flagged here so a reviewer can overturn any of
them cheaply.

1. **Closing a Story is freely reversible.** Implemented as a plain checkbox: `PATCH
   {closed: false}` on untick, no confirmation dialog, no history on the toggle. Covered by
   `api-story-cycles.test.js` ("closed is freely reversible") and by the Playwright test
   "un-ticking Closed PATCHes { closed: false } — a plain, reversible toggle".
2. **No extra guard when a Story is closed while its top chapter is still mid-`downtime`/`prep`.**
   `isFinalChapterOfStory` takes no phase input at all, so the classification is structural and
   phase-independent, exactly as CHM-2/CHM-3's existing workflow intends.
3. **Display-only; enforcement stays manual.** Nothing in this change writes `merit.active`.
   `shToggleMCI`/`shTogglePT` in `public/js/editor/edit-domain.js` are untouched, and a test in
   `cm-3-derived-maintenance.test.js` pins that file as containing no reference to the derivation.

### Debug Log References

- `server/tests/api-story-cycles.test.js` — RED: 4 failed / 24 passed. GREEN after the route change:
  28 passed.
- `server/tests/cm-3-derived-maintenance.test.js` — RED: 24 failed / 3 passed. GREEN after the
  db.js, cycle-views.js, downtime-views.js and downtime-form.js changes: 27 passed.
- Two `isFinalChapterOfStory` bugs were caught by the RED tests before the implementation settled:
  an initial `gameNumber >= max` comparison made an absent/empty `allCycles` vacuously true
  (`max` stays `-Infinity`), and returned true for a cycle the caller had not actually included in
  the member list. Tightened to strict `===`, matching AC2's own wording ("equals the maximum").

### Completion Notes List

**All nine ACs satisfied.** AC1 route + tests, AC2 pure function, AC3 Stories-table Closed column,
AC4 Prep-panel badge replacing the checkbox, AC5 both gates re-pointed, AC6 the Story-3 named
regression case, AC7 the Story-1 three-chapter case, AC8 the historical-audit-shaped seam assertion,
AC9 changed-area regression green.

**Design followed the story as written.** No architectural decision was re-litigated. Three
implementation-level judgements are worth flagging:

1. **AC8 drives a mirrored copy of the per-character at-risk rule, not `renderMaintenanceWarnings`
   itself.** That function is not exported, and the one harness in this repo that imports
   `downtime-form.js` (`dt-form-territory-fresh-fetch.test.js`) needs ~150 lines of module mocks and
   stubs `MAINTENANCE_MERITS` to `[]`, so it cannot exercise this path. Extracting the rule into a
   shared pure module would have been the alternative, and the story explicitly forbids it ("only the
   *gate condition* each reads changes source"). The mirror is therefore paired with a source-contract
   block that pins the four production predicates (`m.name === 'Professional Training'`,
   `m.name === 'Mystery Cult Initiation' && m.active !== false`, `audit.pt !== true`,
   `audit.mci !== true`) in BOTH consumers, so the mirror cannot silently drift out of sync. This is
   the repo's own documented convention for browser-coupled internals
   (`derive-cycle-status.test.js:8-12`, `dbo-3-standing-merit-filter.test.js`).
2. **`isFinalChapterOfStory` IS imported and driven directly**, not mirrored — the browser globals
   are stubbed and `db.js` is dynamic-imported, following
   `issue-1003-zero-submission-flip-guard.test.js`. The core derivation is under real test.
3. **Task 8 found no existing `story_cycles` row to sit beside.** The story assumed
   `reference-data-ssot.md` already documented the collection's `number`/`label`; it did not mention
   `story_cycles` at all. A full row was added to the Downtime table (collection, all five endpoints,
   auth split, UI home) plus the `closed` field, the "why not just highest game_number" rationale,
   and an explicit "`is_chapter_finale` is DEAD" note.

**Data threading.** Both consumers needed the Story tier, which neither had:

- Admin (`downtime-views.js`): a module-level `allStoryCycles`, loaded in `loadAllCycles` alongside
  the cycles, with `.catch(() => [])` so a Story-fetch failure degrades to "not a finale" rather than
  taking the Downtime tab down.
- Player (`downtime-form.js`): the form already fetched the whole cycle list at load and threw it
  away after picking `currentCycle`. Per the story's Dev Notes ("don't thread a third fetch through
  `downtime-form.js` if two already cover it"), that list is now kept as `_allCycles`; only the
  genuinely new `GET /api/story_cycles` was added, also in a try/catch.

**CSS.** The Prep-panel badge reuses three existing classes and adds no new CSS at all:
`.dt-prep-field` + `.dt-lbl` (the panel's own field chrome) and `.derived-note` (`components.css`,
the design system's "derived/annotation" class, and `components.css` is loaded by `admin.html`). The
Stories table's checkbox column adds two token-only rules grouped with the existing `.cy-col-*` block
in `admin-layout.css`. Net CSS hygiene improved: the removed checkbox carried an inline
`style="display:flex;align-items:center;gap:.5rem;cursor:pointer;"`, which was a standing violation
of `specs/project-context.md` §1.3.

**No live data was written and no migration was run.** `is_chapter_finale` and `maintenance_audit`
are left exactly as they are on live `downtime_cycles` documents; `is_chapter_finale` is now a dead,
unread field (grep confirms no production read site remains — only explanatory comments).

**Not committed, not pushed, no PR** (Task 9), per the project's hard rule and this run's brief.

---

### Completion Notes — REWORK PASS (Task 10, 2026-08-17)

*The notes above are the first implementation pass and are preserved as written. Everything below
corrects and supersedes them where the two disagree. The headline change: `story_cycles.closed`
(boolean) + a max-`game_number` computation is gone, replaced end to end by
`story_cycles.final_chapter_id` (a pointer at one specific cycle).*

**The redesign, in one line.** `isFinalChapterOfStory` went from
`(cycle, allCycles, storyCycle) → closed && cycle is the max-game_number member` to
`(cycle, storyCycle) → storyCycle.final_chapter_id === String(cycle._id)`. It reads no
`game_number`, needs no sibling-cycle list, and cannot relocate. Three review findings closed by
construction rather than by point-fixes (the tied-`game_number` double-finale, the `Number()`
coercion gap, and the decision-needed reassignment finding).

**Four judgement calls worth flagging for the reviewer:**

1. **The AC10 guard lives on `PUT`, not `PATCH`, and in `downtime.js`, not `story-cycles.js`.**
   Task 10 says "the per-cycle Story-picker PATCH path" — there isn't one. The picker writes through
   `updateCycle`, which is `PUT /api/downtime_cycles/:id`. Both that route and
   `DELETE /api/downtime_cycles/:id` live in `server/routes/downtime.js`, so the shared
   `namedFinaleRefusal` helper does too. It mirrors `story-cycles.js`'s `STORY_CYCLE_IN_USE` shape:
   409, an error code (`CYCLE_IS_STORY_FINALE`), a message naming both the cycle and the Story, and
   the holding Story's `_id` in the body.
   The PUT guard fires **only when the FK value actually changes.** Guarding on "the body mentions
   `story_cycle_id`" would have broken the Data Portability importer, which PUTs whole cycle
   documents back with the FK included — every restore of a finale chapter would have 409'd. Covered
   by its own named test.

2. **AC8 was reworked by extraction, the first of the two options Task 10 offered.** The per-character
   rule now lives in a new pure module, `public/js/downtime/maintenance.js`
   (`maintenanceHoldings`, `maintenanceEligibleChars`, `maintenanceAtRisk`), moved verbatim out of
   `downtime-views.js` and `downtime-form.js`, which had grown independent copies. Both consumers
   import it; the test imports the same module and drives it directly. This closes the finding
   properly — the "audit panel's own per-character logic" half of AC8 now has real coverage,
   including the `!c.retired` filter and the asymmetric PT-vs-MCI `active` rule — and it removes a
   duplication of exactly the "two surfaces can silently disagree" class the story exists to prevent.
   Behaviour of both render functions is unchanged; only the location of the predicates moved. This
   is a deliberate reading of "NOT a UI/markup redesign": no markup changed.

3. **The failed-fetch signal is a third UI state, not just a console warning.** Admin: a
   `storyCyclesLoadFailed` flag makes the Prep panel render "Chapter Finale — Unavailable — the
   Stories list failed to load, so the maintenance audit cannot be shown." Player: a
   `_storyCyclesFailed` flag renders one "Maintenance status unavailable" strip, and only for a
   character who actually holds PT/MCI — a character with neither still sees nothing. Both also
   `console.warn`. The old bare `.catch(() => [])` on both sides is gone.

4. **Two existing tests needed locator/window updates, both for real reasons, neither weakened.**
   - `tests/cycle-tab.spec.js` — two Game-Cycles-panel tests located a row by
     `#cycle-content tr, { hasText: 'DT 1' }`. The Stories table's new "Final chapter" select lists
     each Story's member cycles *by label*, so Story One's row now legitimately contains the text
     "DT 1" and the locator became ambiguous. Narrowed to the row holding a `cy-story-cycle-select`
     (the cycle-row picker; the Stories-table control is `cy-story-final`). Assertions unchanged.
   - `server/tests/issue-918-cycle-tab-management.test.js` — three source-proximity regexes on the
     DELETE handler (`{0,600}` / `{0,800}`) broke once the handler gained the AC10 guard ahead of the
     submission check. Widened to `{0,1200}` / `{0,1400}`. Every assertion still has to find its
     target inside the same route handler.

**CSS: net rules removed, none added.** The first pass added `.cy-col-closed` and `.cy-story-closed`,
the latter a byte-for-byte duplicate of `.dt-maintenance-tick` (a review finding). Both are gone.
The new `<select>` reuses `form-select`, and its two dimensions are folded into the existing rules
rather than duplicated: `.cy-col-story-cycle, .cy-col-final-chapter { width: 220px; }` and
`.cy-story-cycle-select, .cy-story-final { min-width: 180px; }`. The Prep-panel badge still reuses
`.dt-prep-field` + `.dt-lbl` + `.derived-note` and adds nothing.

**Test-stub hygiene.** `cm-3-derived-maintenance.test.js` now snapshots `location`/`localStorage`/
`fetch` in `beforeAll` and restores or deletes them in `afterAll` (the first pass installed all three
and never removed them — this repo's own documented leaked-stub hazard). The duplicate test flagged
in review is gone with the rewrite.

**Deploy note (AC11), restated where it will be found.** Live Story 1 carries a real, ST-completed
`maintenance_audit` on its Game 3 cycle under the old `is_chapter_finale` flag. **Nothing migrates
it.** An ST must open the Cycle tab's Stories table and set Story 1's "Final chapter" to Game 3
at or after deploy, or that audit panel and the matching player warning stay dark. Recorded in
`specs/reference-data-ssot.md` under a "DEPLOY NOTE" heading, pinned by a test, and in the story's
own "What this story is NOT".

**Still not committed, not pushed, no PR.** Task 9 remains open by design.

#### Record corrections to the first pass's own File List

- `specs/stories/cm-3-derived-maintenance.md` was listed under **Modified**; it is a **new** file.
- `public/css/admin-layout.css` was described as "two token-only rules"; they also carried literal
  pixel dimensions (`width: 80px`, `16px`/`16px`). Moot now — both rules were deleted in this pass.
- The first pass's Task 8 note said `reference-data-ssot.md` gained a `closed` field entry; that
  entry has been rewritten for `final_chapter_id` and no longer describes `closed` at all.

#### Test results — rework pass

**vitest (targeted, per CLAUDE.md — not the full sweep). Summary lines read, not exit codes; a
`mongod`/Atlas connection was reachable, so no suite silently skipped.**

| Suite | Result |
|---|---|
| `cm-3-derived-maintenance.test.js` *(rewritten)* | **45 passed** / 0 failed / 0 skipped |
| `cm-3-final-chapter-guard.test.js` *(new, AC10)* | **9 passed** / 0 / 0 |
| `api-story-cycles.test.js` *(cm-3 block rewritten, 6 → 10 tests)* | **32 passed** / 0 / 0 |
| `issue-918-cycle-tab-management.test.js` *(proximity windows widened)* | **21 passed** / 0 / 0 |
| `cm1-cycle-phase`, `cm-2-chapters-to-story-cycles`, `cm-4a-importer-phase-strip`, `cm-4a-phase-transition-enforcement`, `cm5-reset-transition`, `derive-cycle-status`, `issue-1001-game-phase-canonical`, `issue-1003-zero-submission-flip-guard` (with the four above) | **333 passed** / 0 / 0 across 12 files |
| `epic.708.1`, `epic.708.2`, `epic.708.4`, `dbo-3-standing-merit-filter`, `dt-form-territory-fresh-fetch`, `save-draft-indicator`, `detect-merits-retainer`, `oath-b-suspension`, `api-downtime`, `api-publish-cycle` | **168 passed** / 0 / 0 across 10 files |
| `epic.708.3-cycle-phase-controls.test.js` | 11 passed / **3 failed** — **pre-existing**, listed in CLAUDE.md; identical count to the first pass and to base |

**Playwright (targeted; never two invocations concurrently).**

| Spec | Result |
|---|---|
| `cm-3-dt-form-finale-gate.spec.js` *(new — the player-side e2e gap the review found)* | **8 passed** / 0 |
| `cycle-tab.spec.js` *(cm-3 block rewritten, 4 → 6 tests)* | 25 passed / **1 failed** — `shows human-readable phase labels`, the **pre-existing** CM-4a `legacy`-label drift the first pass identified and recommended adding to CLAUDE.md |
| `cycle-prep-access`, `cycle-phase-controls`, `fix-601-maintenance-target-details`, `dt-vitae-projection`, `issue-321-dt-story-cycle-resolver` | 23 passed / **15 failed** — all pre-existing and all accounted for: `cycle-phase-controls` ×11 (documented in CLAUDE.md as asserting the pre-CM-1 tab), `cycle-prep-access` gold-highlight ×1, `dt-vitae-projection` feeding-layout ×3. Same set and same count the first pass measured |
| `dt-form-599-flock-herd`, `dt-form-35-feed-violence-default`, `dt-form-19-influence-tooltip`, `fix-47-minimal-feeding-advanced-hint` *(spot-check that removing `_allCycles` and moving the maintenance rule left the player form intact)* | **14 passed** / 0 |

No test was weakened or deleted to make this change pass. `node --check` clean on every modified
`public/js` and `server/routes` file (the `.githooks` staged-parse gate).

#### Doc drift noticed, deliberately not fixed

- `specs/architecture/adr-010-swear-by-oath-cost-model.md:216` states "`is_chapter_finale` keeps its
  existing job (the CHM-3 at-risk reminder at `downtime-form.js:3673`) and gains no new load." That
  is now false. ADRs are historical records, so it was left alone rather than rewritten; a superseding
  note belongs in whichever story next touches ADR-010's ground.
- `specs/audits/maintenance-action-audit.md:34,96` describe the old `is_chapter_finale` gate. Same
  reasoning — it is a dated audit snapshot, not live guidance.

#### Test results

**vitest (targeted, per CLAUDE.md — not the full sweep). All runs read from the summary line, and a
local `mongod`/Atlas connection was confirmed reachable, so no suite silently skipped.**

| Suite | Result |
|---|---|
| `cm-3-derived-maintenance.test.js` *(new)* | **27 passed** / 0 failed / 0 skipped |
| `api-story-cycles.test.js` *(+6 new tests)* | **28 passed** / 0 / 0 |
| `cm1-cycle-phase.test.js`, `cm-2-chapters-to-story-cycles.test.js`, `cm-4a-importer-phase-strip`, `cm-4a-phase-transition-enforcement`, `cm5-reset-transition`, `derive-cycle-status`, `issue-1001-game-phase-canonical`, `issue-1003-zero-submission-flip-guard`, `issue-918-cycle-tab-management` (with the two above) | **302 passed** / 0 / 0 across 11 files |
| `epic.708.1`, `epic.708.2`, `epic.708.4`, `dbo-3-standing-merit-filter`, `dt-form-territory-fresh-fetch`, `save-draft-indicator`, `detect-merits-retainer`, `oath-b-suspension` | **135 passed** / 0 / 0 across 8 files |
| `epic.708.3-cycle-phase-controls.test.js` | 11 passed / **3 failed** — **pre-existing**, listed in CLAUDE.md. Verified identical (3 failed / 11 passed) with `cycle-views.js` stashed. |

**Playwright (targeted).**

| Spec | Result |
|---|---|
| `cycle-tab.spec.js` *(+4 new cm-3 tests)* | 23 passed / 1 failed. The failure is `shows human-readable phase labels` — **pre-existing**, verified identical with every source change stashed. CM-4a widened `uiPhase` so the `legacy` label it asserts is unreachable; the test was never updated. **Not currently in CLAUDE.md's known-failure list — worth adding.** |
| The 4 new cm-3 Closed-column tests, run alone | **4 passed** |
| `cycle-prep-access.spec.js`, `fix-601-maintenance-target-details.spec.js`, `dt-vitae-projection.spec.js`, `issue-321-dt-story-cycle-resolver.spec.js` | 23 passed / 4 failed — all four **pre-existing**, verified identical at base (`cycle-prep-access` gold-highlight ×1, `dt-vitae-projection` feeding-layout ×3) |

No test anywhere was weakened or deleted to make this change pass. `node --check` clean on all four
modified `public/js` files (the `.githooks` staged-parse gate).

### File List

*Superseded by the rework pass's list below; kept as the record of what the first pass produced.*

**Modified**

- `server/routes/story-cycles.js` — `PATCH /:id` accepts and validates `closed: boolean`; empty-body message updated.
- `public/js/downtime/db.js` — new `getStoryCycles()` and the pure `isFinalChapterOfStory(cycle, allCycles, storyCycle)`.
- `public/js/admin/cycle-views.js` — Stories table gains a "Closed" column (checkbox + `apiPatch` wiring + revert-on-failure); `apiPatch` imported; empty-row colspan 3 → 4.
- `public/js/admin/downtime-views.js` — `allStoryCycles` module state loaded in `loadAllCycles`; new `storyFinaleFor()` resolver; `renderMaintenanceAuditPanel` gate re-pointed; `renderPrepPanel` loses `#dt-chapter-finale-input` and its `updateCycle` write, gains the read-only derived badge; `getStoryCycles`/`isFinalChapterOfStory` imported.
- `public/js/tabs/downtime-form.js` — `_allCycles` (kept from the existing load-time fetch) and `_storyCycles` (new fetch) module state; new `cycleIsStoryFinale()`; `renderMaintenanceWarnings` gate re-pointed; imports extended.
- `public/css/admin-layout.css` — `.cy-col-closed` and `.cy-story-closed`, grouped with the existing `.cy-col-*` rules. *(Described as "token-only" at the time; they also carried literal pixel dimensions. Both rules are deleted in the rework pass.)*
- `specs/reference-data-ssot.md` — `story_cycles` row added to the Downtime table plus four explanatory notes (`closed`, the shape, the "why not membership alone" rationale, and `is_chapter_finale` being dead).
- `server/tests/api-story-cycles.test.js` — six new PATCH `closed` tests.
- `tests/cycle-tab.spec.js` — new `Stories panel Closed column (cm-3)` describe block, four tests.

**Added**

- `server/tests/cm-3-derived-maintenance.test.js` — 27 tests: the derivation's unit matrix (AC2/AC6/AC7), the historical-audit seam assertion (AC8), and the source-contract wiring checks (AC4/AC5/AC3).
- `specs/stories/cm-3-derived-maintenance.md` — this file. *(The first pass listed it under Modified; it is new. Corrected here.)*

**Deleted**

- None.

### File List — REWORK PASS (Task 10, 2026-08-17)

*Cumulative state of the working tree, i.e. what a reviewer will actually see. Where an entry
overlaps the first pass's list above, this one is current.*

**Modified**

- `server/routes/story-cycles.js` — `PATCH /:id` accepts `final_chapter_id` (string `_id` or `null`) in place of `closed`, with referential validation at the write: valid ObjectId format, the cycle must exist, and its `story_cycle_id` must equal this Story's own `_id` (400 with a named reason for each). Empty-body message updated.
- `server/routes/downtime.js` — **new** `namedFinaleRefusal()` helper plus its two call sites (AC10): `PUT /:id` refuses a `story_cycle_id` change on a cycle some Story names as its `final_chapter_id`, and `DELETE /:id` refuses the same cycle. Both 409 `CYCLE_IS_STORY_FINALE`. The PUT guard is change-sensitive so a full-document restore of an unchanged FK still passes.
- `public/js/downtime/db.js` — `isFinalChapterOfStory` rewritten to the two-argument pointer check (all `allCycles`/`game_number`/max logic deleted) with an ownership guard; **new** exported `storyCycleForCycle(cycle, storyCycles)`, the single shared Story resolver. `getStoryCycles()` unchanged from the first pass.
- `public/js/admin/cycle-views.js` — Stories table's "Closed" checkbox column replaced by a "Final chapter" `<select>` (**new** `buildFinalChapterSelect`), populated from that Story's own member cycles, PATCHing `{final_chapter_id}`; disabled in flight, reverts only when still connected, surfaces the server's reason inline. `buildStoryCyclesPanel` takes the cycle list. `buildStoryCycleSelect` (the per-cycle Story picker) now surfaces the AC10 409 inline instead of silently reverting.
- `public/js/admin/downtime-views.js` — `storyFinaleFor` uses the shared `storyCycleForCycle` + two-arg predicate; local `maintenanceHoldings`/eligibility filter replaced by imports from the new shared module; `storyCyclesLoadFailed` flag replaces the silent `.catch(() => [])`, with an "Unavailable" state on the Prep-panel badge; badge copy renamed from "Story N closed" to the Story's own name; now-unused `MAINTENANCE_MERITS` import dropped.
- `public/js/tabs/downtime-form.js` — `_allCycles` removed entirely (the pointer derivation needs no sibling list); `_storyCyclesFailed` flag plus a "Maintenance status unavailable" strip replaces the silent catch; `cycleIsStoryFinale` uses the shared resolver + two-arg predicate; `renderMaintenanceWarnings` applies the shared `maintenanceAtRisk` rule instead of its own inline copy.
- `public/css/admin-layout.css` — `.cy-col-closed` and `.cy-story-closed` **deleted** (the latter was the duplicate of `.dt-maintenance-tick`). The new control's dimensions are folded into the two existing rules: `.cy-col-story-cycle, .cy-col-final-chapter` and `.cy-story-cycle-select, .cy-story-final`. Net: two rules removed, none added.
- `specs/reference-data-ssot.md` — the `story_cycles` notes rewritten for `final_chapter_id` (shape, semantics, the shared resolver, the guards, the "why a pointer" rationale) plus a new **DEPLOY NOTE** block for live Story 1 (AC11).
- `specs/deferred-work.md` — one-line amendment to the deferred `_allCycles` re-entrancy item: that variable no longer exists, so the item is re-pointed at `_storyCycles`/`currentCycle`/`responseDoc`. Scope and recommended fix unchanged.
- `server/tests/api-story-cycles.test.js` — the six `closed` tests replaced by ten `final_chapter_id` tests (set, clear, combined PATCH, non-string 400, malformed-id 400, unknown-cycle 400, wrong-Story 400, no-Story 400, GET readback, player 403), with a `storyWithCycle` fixture helper.
- `server/tests/cm-3-derived-maintenance.test.js` — rewritten: 45 tests. Pointer matrix (AC2/AC6/AC7), AC7a's tied-`game_number` and non-numeric-`game_number` cases, the shared resolver, the shared maintenance rule driven directly as production code, the AC8 seam assertion, wiring contracts, and AC10/AC11 pins. Global stubs now torn down in `afterAll`; the duplicate test is gone.
- `server/tests/issue-918-cycle-tab-management.test.js` — three DELETE-handler source-proximity windows widened (600/800 → 1200/1400) to accommodate the AC10 guard sitting ahead of the submission check.
- `tests/cycle-tab.spec.js` — the `Closed column` describe block replaced by `Final chapter column (cm-3)`, six tests (population from the Story's own members, set, re-point, clear, refusal + revert, in-flight disable). The PATCH mock now echoes the real patched row rather than a hardcoded `sc-002`. Two Game-Cycles-panel locators narrowed, since the new select makes cycle labels appear in Stories rows too.
- `specs/stories/cm-3-derived-maintenance.md` — this file (Status, Task 10, Review Findings, Dev Agent Record, File List, Change Log).

**Added**

- `public/js/downtime/maintenance.js` — the shared pure PT/MCI maintenance rule (`maintenanceHoldings`, `maintenanceEligibleChars`, `maintenanceAtRisk`), extracted from the two consumers so one definition serves both and the AC8 test can drive the real thing.
- `server/tests/cm-3-final-chapter-guard.test.js` — 9 integration tests for AC10 (reassign refused, unassign refused, non-finale sibling allowed, unchanged-FK restore allowed, FK-free PUT allowed, delete refused, non-finale delete allowed, unnamed cycle unaffected, dangling pointer unaffected).
- `tests/cm-3-dt-form-finale-gate.spec.js` — 8 player-side e2e tests closing the review's "~22 DT-form specs give the player gate zero e2e coverage" finding: named-this-cycle, names-a-different-chapter, no-finale-named, single-chapter Story, per-merit audit tick, no-maintenance-merits, and both halves of the fetch-failure notice.

**Deleted**

- No files. Within files: the `closed` field and its route validation, the `allCycles`/`game_number` derivation, the `.cy-story-closed` / `.cy-col-closed` CSS rules, the duplicated Story→cycle resolvers, the duplicated per-character maintenance predicates, and `downtime-form.js`'s `_allCycles` state.

## Change Log

| Date | Change |
|---|---|
| 2026-08-17 | cm-3 implemented end to end. `story_cycles.closed` added (route + Stories-table control); `isFinalChapterOfStory` derivation added to `public/js/downtime/db.js`; the ST maintenance audit panel and the player at-risk warning strip re-pointed onto it; the per-chapter `#dt-chapter-finale-input` checkbox removed and replaced by a read-only derived badge; `downtime_cycles.is_chapter_finale` retired to a dead field with no migration. 37 new tests (27 vitest unit/contract, 6 vitest route, 4 Playwright e2e). Status → review. |
| 2026-08-17 | Internal 3-layer code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 1 decision-needed, 13 patch, 3 defer, 9 dismissed (2 of them Blind Hunter's own High findings, verified false against the code). The decision-needed finding — reassigning a cycle's Story membership after close silently relocates the finale and orphans recorded audit ticks — prompted a design change, not a guard bolted onto the old shape: Angelus's own instruction, "it feels like we need a mechanism to manually set a chapter as 'final' for a story." `story_cycles.closed` (boolean + max-`game_number` derivation) replaced throughout this spec by `story_cycles.final_chapter_id` (an explicit pointer to one specific cycle), with a new reassignment/deletion guard (AC10). This structurally closes two more findings for free (the tied-`game_number` double-finale, the `Number()`-coercion gap on `game_number`) — marked superseded in Review Findings rather than separately patched. ACs 1/2/3/6/7 rewritten, AC7a/AC10/AC11 added, Task 10 written to carry out the rework plus the remaining still-valid findings (AC8's test not driving real functions, the duplicated Story→cycle resolver, silent fetch-failure signal, the deploy note for live Story 1's existing audit history, an in-flight guard on the new control, a Playwright mock fix, missing e2e coverage on the player-side gate, a duplicated CSS rule, untorn-down test stubs, and record-accuracy nits). Status → in-progress pending Task 10. |
| 2026-08-17 | **Task 10 (rework pass) complete.** `story_cycles.closed` + the max-`game_number` computation replaced end to end by `story_cycles.final_chapter_id`, a pointer at one specific cycle: two-argument `isFinalChapterOfStory(cycle, storyCycle)`, referential validation at the PATCH, a "Final chapter" `<select>` on the Stories table (in-flight guard, detached-node-safe revert, inline refusal), and a new 409 `CYCLE_IS_STORY_FINALE` guard refusing to move or delete a cycle a Story names (AC10). All eleven still-open review findings applied: the AC8 seam test now drives real production code via a new shared pure module `public/js/downtime/maintenance.js` (which also de-duplicates the per-character rule across the ST panel and the player form); one shared `storyCycleForCycle` resolver replaces two copies and the predicate gained the ownership guard; a failed `/api/story_cycles` fetch now shows a third "unavailable" state on both surfaces instead of silently reading as "not a finale"; the duplicated `.cy-story-closed` CSS rule deleted with none added; the Playwright PATCH mock echoes the real row; global test stubs torn down; File List record errors corrected; the duplicate test gone. New player-side e2e spec (`tests/cm-3-dt-form-finale-gate.spec.js`, 8 tests) closes the "player gate has zero e2e coverage" finding; new `server/tests/cm-3-final-chapter-guard.test.js` (9 tests) covers AC10. AC11's deploy note recorded in `reference-data-ssot.md` and pinned by a test. Totals for the story: 62 vitest tests across three cm-3 files plus 14 Playwright tests. Two existing tests updated for real, non-weakening reasons (a locator made ambiguous by the new select; three source-proximity windows widened past the new guard). Not committed, not pushed, no PR. Status → review. |
| 2026-08-17 | **Post-rework verification.** Spot-checked the two most load-bearing pieces of the redesign directly against source rather than trusting the rework report alone: `isFinalChapterOfStory(cycle, storyCycle)` (`public/js/downtime/db.js`) matches AC2 exactly, including the ownership guard from the still-open finding; the AC10 guard (`namedFinaleRefusal`, `server/routes/downtime.js`) is change-sensitive (only fires when `story_cycle_id` actually changes on PUT, always on DELETE), returns a named 409, and was built with the Data Portability importer's full-document restore path in mind — a consideration beyond what was asked for. Every review finding accounted for (13 patch resolved/applied, 2 of those superseded by construction, 1 decision-needed resolved via redesign, 3 defer logged separately), full targeted regression green with only pre-existing failures. Status `review` → `done`. |
