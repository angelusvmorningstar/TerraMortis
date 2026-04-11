# Story feature.45: Processing Mode — Phase 1: Feeding Review

## Status: Approved

## Story

**As an** ST processing feeding submissions,
**I want** all characters' feeding declarations shown in one cross-character view with pool validation tools,
**so that** I can validate every character's pool in one pass, catch errors, correct them, and roll — without opening each submission individually.

## Background

The existing DT tab has a "Feeding Scene Summary" table (per cycle, collapsible) that shows character, method, territory, ambience mod, pool, and rote toggle. This is a read display only — it does not support ST annotation, pool correction, or rolling. The per-character submission panel has a full feeding pool builder, but it requires opening each submission individually.

The Downtime 2 Feeding Matrix document shows the actual workflow: STs review each character's described method, validate or correct the pool, add notes (AM Note, KW Note), and write player-facing feedback — all in one reference table. This story moves that workflow into the processing queue.

This story depends on **feature.43** (backbone) for the notes thread and validation state infrastructure.

### Discipline × territory tracking

When a character uses a discipline in their feeding pool in a specific territory, that discipline is recorded as having a sustained impact on that territory. This is the data source for the Discipline Profile Matrix (feature.47). The record is made at the point the feeding pool is validated (not just submitted — the validated pool is authoritative).

---

## Acceptance Criteria

1. The Feeding phase section shows one entry per submission that has a feeding declaration (submitted method or a character with feeding rights in at least one territory).
2. Characters with no feeding submission (no `responses._feed_method`) still appear if the cycle has them in the submission list — they show as "No feeding method declared."
3. Each feeding entry shows (collapsed): character name, submitted method name, primary territory, current validation status badge.
4. Expanded feeding entry shows:
   - **Submitted method** — from `responses._feed_method` (display name)
   - **Discipline add-on** — from `responses._feed_disc`
   - **Specialisation** — from `responses._feed_spec`
   - **Rote quality** — from `responses._feed_rote` and/or `st_review.feeding_rote`
   - **Territories** — from `responses.feeding_territories` (resident/poaching/none per territory)
   - **Player's pool expression** — constructed from submitted fields or `responses.project_N_pool_expr` if feeding is a project action; displayed read-only
   - **ST validated pool** — editable text field (from `feeding_review.pool_validated`)
   - **Validation status** — `Pending / Validated / No Roll Needed` (from `feeding_review.pool_status`)
   - **ST notes thread** — from `feeding_review.notes_thread`
   - **Player feedback** — from `feeding_review.player_feedback`
   - **Reminder badges** — from cycle `processing_reminders` (feature.44)
   - **Roll button** — enabled when `pool_status === 'validated'`
5. The roll button uses the existing feeding roll mechanism (`feeding-engine.js` logic or equivalent) with the **validated pool size** (not the player-submitted size).
6. After rolling, the result is stored in the submission as `feeding_roll` (existing field) alongside the validated pool.
7. Ambience modifier for the character's primary feeding territory is shown alongside the pool (informational).
8. **Discipline × territory recording**: when the ST saves a validated pool that includes a discipline (i.e. `pool_validated` contains a discipline name AND the submission has a feeding territory), record the discipline against that territory in the cycle's discipline profile (see data model below).
9. Re-tagging (from feature.43) applies — the ST can retag a feeding-as-project action from `feed` to any other type if miscategorised.

---

## Data Model Changes

### `feeding_review` on submission document (defined in feature.43)

```js
feeding_review: {
  pool_player: string,    // auto-populated on first save: "Wits 3 + Stealth 2 + Auspex 1 = 6"
  pool_validated: string,
  pool_status: 'pending' | 'validated' | 'no_roll',
  notes_thread: [...],
  player_feedback: string,
}
```

### Discipline profile on cycle document

```js
discipline_profile: {
  [territory_id]: {
    [discipline_name]: number  // count of validated uses in this territory this cycle
  }
}
```

Example:
```js
discipline_profile: {
  academy:    { Obfuscate: 2, Auspex: 2, Dominate: 1 },
  harbour:    { Dominate: 1, Nightmare: 1 },
  secondcity: { Dominate: 1 },
}
```

Updated when a feeding pool is saved as `Validated` and a discipline is detected in `pool_validated`.

Discipline detection: simple string match — does `pool_validated` contain a known discipline name? Use the same `DISCIPLINES` list available elsewhere in the app. If the ST's validated pool text mentions "Obfuscate", record Obfuscate for each territory where the character has `resident` or `poach` feeding status.

---

## Tasks / Subtasks

- [ ] Task 1: Build Feeding section of processing queue (AC: 1, 2, 3)
  - [ ] In `buildProcessingQueue()`, add feeding entries: one per submission with any feeding data
  - [ ] For characters with no declared method: create entry flagged `no_method: true`
  - [ ] Collapsed row: character name, method display name, primary territory name, validation badge

- [ ] Task 2: Expanded feeding panel (AC: 4, 7)
  - [ ] Read and display all submitted feeding fields from `responses`
  - [ ] Auto-populate `feeding_review.pool_player` on first expansion if not already set: construct from submitted method/disc/spec (same logic as existing feeding summary in per-character view)
  - [ ] Show ambience mod for primary territory: look up territory from `responses.feeding_territories`, get `ambienceMod` from `TERRITORY_DATA`
  - [ ] Show reminder badges (from `cycleReminders` — feature.44)
  - [ ] Render notes thread, validated pool, validation status, player feedback (from feature.43 shared infrastructure)

- [ ] Task 3: Roll from processing queue (AC: 5, 6)
  - [ ] Roll button reads `feeding_review.pool_validated` — parse the total dice count from the expression (last number before `=`, or the full string if it's just a number)
  - [ ] On roll: use the same dice engine as existing feeding roll (10-again, rote if `st_review.feeding_rote`)
  - [ ] Store result in `sub.feeding_roll` (existing field: `{ successes, exceptional, dice_string, params: { size, rote } }`)
  - [ ] Show result inline in the processing panel

- [ ] Task 4: Discipline × territory recording (AC: 8)
  - [ ] When ST saves `pool_status = 'validated'` on a feeding entry:
    - Extract discipline names from `pool_validated` text (scan for known discipline names)
    - Get territories where character has `resident` or `poach` status from `responses.feeding_territories`
    - For each discipline × territory combination: increment `cycle.discipline_profile[territory_id][discipline_name]`
    - Save updated `discipline_profile` to cycle via `apiPut('/api/downtime_cycles/' + selectedCycleId, { discipline_profile: ... })`
  - [ ] If pool is later re-saved (pool_validated changes), recompute — do not double-count. Store a `feeding_review.discipline_recorded: true` flag; on re-save, subtract old counts before adding new.

- [ ] Task 5: Discipline list for detection

  The known disciplines list should come from character data or a constant. Use the discipline keys from the characters in the cycle (e.g., scan `characters` array for discipline names). Fallback: a hardcoded list of known VtR disciplines (`Animalism`, `Auspex`, `Celerity`, `Dominate`, `Majesty`, `Nightmare`, `Obfuscate`, `Resilience`, `Vigor`, `Cruac`, `Theban Sorcery`, `Protean`, `Mekhet Disciplines`, etc.).

---

## Dev Notes

### Key files

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Feeding section of processing queue, expanded panel, roll handler, discipline recording |
| `server/schemas/downtime_cycle.schema.js` | Add `discipline_profile` field |

### Existing feeding summary table

The existing "Feeding Scene Summary" collapsible table is NOT removed — it remains in the normal (per-character) view. The processing mode feeding section is in addition to it.

### Rote quality source of truth

Rote is confirmed via `st_review.feeding_rote` (set in the per-character panel or from `responses._feed_rote === 'yes'`). The processing queue feeding panel reads and respects this existing field — it does not introduce a new rote flag.

### Pool expression format

`pool_validated` is a free-text expression (e.g., "Wits 3 + Stealth 2 + Obfuscate 1 = 6"). To roll, extract the last integer from the string:
```js
const match = pool_validated.match(/(\d+)\s*$/);
const diceCount = match ? parseInt(match[1], 10) : 0;
```

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Claude (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
