---
id: dtui.16
epic: dtui
status: review
priority: high
depends_on: [dtui.15, dtui.8, dtui.11]
---

# Story DTUI-16: Allies target scoping parity (with Block exception)

As a player configuring an Allies action,
I want Allies' targeting to use the same per-action scoping as Personal Projects, with Block also retaining a freetext field for which merit is targeted,
So that targeting feels consistent and Block keeps its specific semantics.

---

## Context

`renderSphereFields()` (line ~4578–4693) handles field rendering for all sphere (Allies) action slots. It reads `fields` from `SPHERE_ACTION_FIELDS[actionVal]` (updated in dtui-15) and renders the appropriate widgets.

Currently the sphere fields render legacy input patterns (checkboxes for target_char, select for target_own_merit, etc.). This story upgrades the targeting fields to match the `.dt-chip-grid` and `.dt-ticker` patterns established in dtui-8 (Personal Projects) — specifically:

- `'attack'` → Character chip grid (single-select) OR Other freetext (no territory)
- `'block'` → Character chip grid (single-select) + freetext "which merit" (Block exception)
- `'hide_protect'` → Character chip grid (single-select) OR Other freetext (no territory)
- `'investigate'` → Character/Territory/Other chip+ticker combo (full three-way)
- `'patrol_scout'` → Territory chip grid only (no Character/Other)
- `'misc'` → Character/Territory/Other (full three-way)
- `'maintenance'` → Maintenance chip grid (character's own merits) — same pattern as dtui-11
- `'ambience_increase'` / `'ambience_decrease'` → Territory chip grid (handled by dtui-17 context; leave this story's implementation to the existing `territory` field widget unless dtui-17 provides a new one)
- `'grow'` → No target zone (dtui-19 scope)

**Current sphere field widgets:**
- `target_char` → checkbox grid (`dt-shoutout-grid`) — replace with `.dt-chip-grid` single-select
- `block_merit` → freetext input — RETAIN, renamed to "Which merit are you targeting on this character?" (already correct)
- `target_own_merit` → select dropdown — retain for `hide_protect` (protecting own merits is a dropdown of own merits; this is correct — no chip needed for this case)
- `target_flex` → calls `renderTargetPicker()` — keep for `investigate` and `misc` where full three-way is needed
- `territory` → calls `renderTerritoryPills()` — keep for ambience and patrol_scout

**The key change in `renderSphereFields()`:** Replace the `target_char` branch (lines ~4589–4607, `div.dt-shoutout-grid` with `dt-target-char-sphere-cb` checkboxes) with the `.dt-chip-grid--single` pattern using `.dt-chip` buttons with `data-sphere-char-target` attributes.

**Block exception:** Block currently renders `['target_char', 'block_merit', 'outcome']`. After this story it renders Character chip (single-select) + freetext "Which merit are you targeting on this character?" — both already in the field list; the change is only to the `target_char` rendering (checkbox → chip).

**New `maintenance_target` field:** dtui-15 added `'maintenance': ['maintenance_target']` to SPHERE_ACTION_FIELDS. This story adds the `maintenance_target` branch in `renderSphereFields()` — uses the same `renderMaintenanceChips()` helper from dtui-11, but with `prefix` set to `'sphere'` instead of `'project'`.

---

## Files in scope

- `public/js/tabs/downtime-form.js` — replace `target_char` branch in `renderSphereFields()` with `.dt-chip-grid` single-select; add `maintenance_target` branch; add `data-sphere-char-target` click handler in delegated listener

---

## Out of scope

- `hide_protect` `target_own_merit` (own-merit select dropdown) — retain as-is
- `target_flex` and `territory` widgets — retain as-is (renderTargetPicker and renderTerritoryPills are already correct)
- `block_merit` freetext — retain as-is
- Allies Ambience target zone — dtui-17 scope (currently `territory` field handles it)
- Allies Grow — dtui-19 scope

---

## Acceptance Criteria

### AC1 — Attack/Hide-Protect: Character chip grid (single-select)

**Given** an Allies merit with Attack or Hide/Protect action selected,
**When** the target zone renders,
**Then** the `target_char` zone shows a `.dt-chip-grid--single` (single-select) of all characters as `.dt-chip` buttons, replacing the legacy `dt-shoutout-grid` checkboxes.

### AC2 — Block: Character chip grid + freetext merit field (retained)

**Given** an Allies merit with Block action selected,
**When** the target zone renders,
**Then** it shows a character `.dt-chip-grid--single` (single-select) AND the existing "Which merit are you targeting on this character?" freetext input below it.

### AC3 — No Territory or Other variant for Block

**Given** an Allies Block action is selected,
**When** the Target zone renders,
**Then** Territory and Other variants are NOT available (Block is character-only targeting).

### AC4 — Maintenance: Maintenance chip grid from own merits

**Given** an Allies merit with Maintenance action selected,
**When** the target zone renders,
**Then** a `.dt-chip-grid` appears showing the character's merits from `MAINTENANCE_MERITS` (same as dtui-11, but using sphere prefix). Disabled chips for already-maintained merits (same logic as dtui-11).

### AC5 — Chip selection for sphere character target persists

**Given** a player selects a character chip in an Allies attack/block/hide target zone,
**When** the form saves,
**Then** `sphere_N_target_value` contains the selected character's ID; on reload the chip is pre-selected.

### AC6 — Investigate and Misc: full three-way target picker (unchanged)

**Given** an Allies merit with Investigate or Misc action selected,
**When** the target zone renders,
**Then** `renderTargetPicker()` renders as before (no change to `target_flex` branch).

---

## Implementation Notes

### Replace `target_char` branch in `renderSphereFields()`

Remove lines ~4589–4607 (the `dt-shoutout-grid` implementation) and replace with:

```javascript
if (fields.includes('target_char')) {
  const savedTarget = saved[`${prefix}_${n}_target_value`] || '';
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Target Character</label>';
  h += `<div class="dt-chip-grid dt-chip-grid--single" data-sphere-char-grid="${prefix}_${n}">`;
  for (const c of allCharacters) {
    const id = String(c.id);
    const isSelected = savedTarget === id;
    const selectedClass = isSelected ? ' dt-chip--selected' : '';
    h += `<button type="button" class="dt-chip${selectedClass}"`;
    h += ` data-sphere-char-target="${prefix}_${n}" data-char-id="${esc(id)}">`;
    h += `${esc(c.name)}`;
    h += `</button>`;
  }
  h += `</div>`;
  h += '</div>';
}
```

### Add `maintenance_target` branch in `renderSphereFields()`

```javascript
if (fields.includes('maintenance_target')) {
  const alreadyMaintained = getAlreadyMaintainedTargets(n, saved, maxProjectSlots); // reuse from dtui-11
  // Analogous helper for sphere slots:
  const alreadyMaintainedSphere = getSphereAlreadyMaintainedTargets(prefix, n, saved, detectedMerits.spheres.length);
  h += '<div class="qf-field">';
  h += '<label class="qf-label">What are you maintaining?</label>';
  h += renderMaintenanceChips(n, saved, currentChar, alreadyMaintainedSphere); // dtui-11 helper, reused here
  h += '</div>';
}
```

Add `getSphereAlreadyMaintainedTargets()` — mirrors `getAlreadyMaintainedTargets()` from dtui-11 but scans `sphere_K_action === 'maintenance'` and `sphere_K_target_value` instead of `project_K_action`.

### Click handler for `data-sphere-char-target`

```javascript
if (target.dataset.sphereCharTarget !== undefined && !target.disabled) {
  const prefixN = target.dataset.sphereCharTarget; // e.g. 'sphere_2'
  const id = target.dataset.charId;
  // Single-select: deselect others in grid
  document.querySelectorAll(`[data-sphere-char-target="${prefixN}"]`).forEach(el => {
    el.classList.remove('dt-chip--selected');
  });
  // Toggle
  const wasSelected = target.classList.contains('dt-chip--selected');
  if (!wasSelected) {
    target.classList.add('dt-chip--selected');
    saved[`${prefixN}_target_value`] = id;
  } else {
    saved[`${prefixN}_target_value`] = '';
  }
  scheduleSave();
}
```

Note: `prefixN` encodes both prefix and slot (`'sphere_2'`), so `saved['sphere_2_target_value'] = id` writes to the correct key.

### Existing `dt-target-char-sphere-cb` handler

Search for `dt-target-char-sphere-cb` in the event delegation block and **remove** or guard it so the old checkbox handler no longer fires for the sphere char target. The new `data-sphere-char-target` handler replaces it.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — replace `target_char` branch in `renderSphereFields()`; add `maintenance_target` branch; add `getSphereAlreadyMaintainedTargets()`; add `data-sphere-char-target` click handler; remove/guard legacy `dt-target-char-sphere-cb` handler

---

## Definition of Done

- AC1–AC6 verified
- Attack / Hide/Protect: character chip grid (single-select) replaces checkbox grid
- Block: character chip + freetext "which merit" (two fields, both present)
- Maintenance: maintenance chip grid from own merits (reusing dtui-11 helper)
- Investigate / Misc: unchanged `renderTargetPicker()` path
- Legacy `dt-target-char-sphere-cb` handler removed/guarded
- `specs/stories/sprint-status.yaml` updated: dtui-16 → review

---

## Compliance

- CC1 — Effective rating discipline: maintenance chip effective dots via `(m.dots || m.rating || 0) + (m.bonus || 0)`
- CC3 — Greyed-with-reason: disabled maintenance chips have tooltip
- CC4 — Token discipline: no bare hex
- CC9 — Uses `.dt-chip-grid` / `.dt-chip` canonical components (dtui-2)

---

## Dependencies and Ordering

- **Depends on:** dtui-15 (SPHERE_ACTION_FIELDS updated, maintenance entry added), dtui-8 (target zone patterns), dtui-11 (renderMaintenanceChips helper)
- **Unblocks:** dtui-17 (Ambience eligibility builds on this target zone foundation)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

`renderSphereFields()` `target_char` branch replaced: `dt-shoutout-grid` checkboxes removed; `.dt-chip-grid--single` with `data-sphere-char-target` buttons added. Hidden `id="dt-${prefix}_${n}_target_value"` input added so `collectResponses()` else-branch can read it without changes. Legacy JSON array saved values from old checkbox approach handled via try/parse in the render. `maintenance_target` branch added, calling `renderMaintenanceChips()` with new `prefix` param (default 'project' preserves all existing project-slot calls). `getSphereAlreadyMaintainedTargets()` helper added. Maintenance chip click handler updated to read `data-maintenance-prefix` attribute. `data-sphere-char-target` click handler added to delegated listener (single-select, clears grid then sets one chip). `collectResponses()` sphere checkbox path left as-is — falls through to hidden-input else branch when no checkboxes found (which is always, since they're gone).

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-16 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-16 implemented; status → review. |
