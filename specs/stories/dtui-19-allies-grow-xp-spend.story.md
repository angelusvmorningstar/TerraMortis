---
id: dtui.19
epic: dtui
status: review
priority: medium
depends_on: [dtui.15]
---

# Story DTUI-19: Allies Grow action — XP Spend treatment

As a player wanting to grow a specific Allies merit using XP,
I want a "Grow" action under that Allies merit that inherits the XP Spend treatment, scoped to that specific merit,
So that I have a clear path to growing the merit through downtime.

---

## Context

`SPHERE_ACTIONS` currently includes `'grow'` (label: "Grow: Attempt to acquire Allies or Status 4 or 5"). In `renderMeritToggles()` (line ~4751), Grow is explicitly filtered OUT of the sphere action dropdown:

```javascript
for (const opt of SPHERE_ACTIONS.filter(o => o.value !== 'grow')) {
```

This story removes that filter exclusion so Grow appears as a selectable option. The Grow action block then renders the XP picker pattern — same as the project-level `xp_spend` action — but scoped to growing this specific Allies merit instance.

**XP picker for project slots:** In `renderProjectSlots()`, the `xp_spend` action renders a `renderXpPicker()` call (search for `renderXpPicker` in downtime-form.js; it's called from the `fields.includes('xp_picker')` branch in the project slot render around line ~2973). This function renders trait selectors for attribute, skill, discipline, or merit dot purchase.

**Scoping to the specific merit:** The XP picker normally lets the player pick any trait. For Allies Grow, only the specific Allies merit instance should be available. The scope constraint is achieved by:
1. Pre-filtering the XP picker to show only "Merit" purchase type, with the specific merit pre-selected and locked
2. OR rendering a simplified "XP Grow" block with just the dot count selector and the merit name as read-only context

**Recommended approach (simpler):** Render a custom lightweight XP block specific to Grow (not the full `renderXpPicker()`) since the full picker has many options irrelevant to growing a single named merit. The block shows:
- Read-only merit name + current dots
- A "Target dots" selector (dots + 1 to 5)
- XP cost display (calculated inline: Allies = 3 XP/dot for out-of-clan, or 1 XP/dot for merit? — check XP rates)

**XP cost for Allies Grow:** From CLAUDE.md schema: "Merits: 1 XP/dot". So growing Allies from dot N to N+1 = 1 XP. The cost display can be: `(targetDots - currentDots) × 1 XP`.

**SPHERE_ACTION_FIELDS:** dtui-15 updated SPHERE_ACTION_FIELDS but did NOT add a `'grow'` entry (it had `'grow': ['outcome']` previously, which is now `['outcome']` — the `description` was removed). This story adds or confirms a `'grow'` entry: `['grow_xp']` (new field type) or retains `['outcome']` and uses the outcome field as the XP confirmation area.

Actually, looking at this more carefully: `SPHERE_ACTION_FIELDS['grow']` currently has `['outcome']` after dtui-15's removal of `description`. Rather than introducing a new field type `'grow_xp'`, the cleaner approach is:
1. Change `SPHERE_ACTION_FIELDS['grow']` to `['grow_xp']` (a new field token)
2. Add `grow_xp` branch in `renderSphereFields()` that renders the scoped XP block

---

## Files in scope

- `public/js/tabs/downtime-data.js` — update `SPHERE_ACTION_FIELDS['grow']` to `['grow_xp']`
- `public/js/tabs/downtime-form.js` — remove `o.value !== 'grow'` filter from sphere dropdown; add `grow_xp` branch in `renderSphereFields()`; add `renderAlliesGrowXp(n, prefix, m, saved)` helper

---

## Out of scope

- Changes to the project-level XP picker (`renderXpPicker()`) — untouched
- Status merit Grow — Status merits use the same SPHERE_ACTIONS array but Grow applies only to Allies in this story (Status 4/5 acquisition via Grow is a product-level decision; treat it as the same UI for now if it appears)
- Server-side XP validation — this is form-level UI only

---

## Acceptance Criteria

### AC1 — Grow appears in Allies dropdown

**Given** the Allies action-type dropdown renders,
**When** the player browses options,
**Then** "Grow" appears as a selectable option.

### AC2 — Grow block shows the XP Spend pattern: scoped to this merit

**Given** a player picks Grow,
**When** the action block renders,
**Then** the block shows: (a) read-only merit name + current effective dots, (b) a target dots selector (limited to dot values above current up to 5), (c) XP cost display (cost = (target - current) × 1 XP).

### AC3 — No Target zone, no Approach, no Outcome in Grow block

**Given** a player picks Grow,
**When** zones surface,
**Then** no Target zone, no Approach textarea, no Desired Outcome zone are rendered.

### AC4 — Target dots selection persists across save/reload

**Given** a player picks Grow and selects target dots = 4,
**When** the form saves and reloads,
**Then** the target dots selector shows 4 pre-selected and the XP cost reflects (4 - current) × 1.

### AC5 — XP cost uses 1 XP per dot (merit rate)

**Given** a player wants to grow Allies from 3 to 5 (2 dots),
**When** the cost displays,
**Then** it reads "2 XP" (1 XP/dot × 2 dots).

---

## Implementation Notes

### Remove Grow filter

In `renderMeritToggles()` (~line 4751), change:
```javascript
for (const opt of SPHERE_ACTIONS.filter(o => o.value !== 'grow')) {
```
to (after dtui-17 adds the ambience eligibility filter):
```javascript
const filteredActions = SPHERE_ACTIONS.filter(o => {
  if (!ambienceEligible && (o.value === 'ambience_increase' || o.value === 'ambience_decrease')) return false;
  return true; // Grow is now included
});
for (const opt of filteredActions) {
```

Ensure dtui-17's `ambienceEligible` filter and this story's Grow inclusion are combined in one filter pass.

### `SPHERE_ACTION_FIELDS` update

```javascript
'grow': ['grow_xp'],
```

### `renderAlliesGrowXp(n, prefix, m, saved)` helper

```javascript
function renderAlliesGrowXp(n, prefix, m, saved) {
  const currentDots = (m.dots || m.rating || 0) + (m.bonus || 0);
  const savedTarget = parseInt(saved[`${prefix}_${n}_grow_target`] || '0') || 0;
  const meritName = m.area ? `Allies (${m.area})` : (m.qualifier ? `Allies (${m.qualifier})` : 'Allies');

  let h = '<div class="qf-field">';
  h += `<p class="qf-desc">Growing: <strong>${esc(meritName)}</strong> — currently ${currentDots} dot${currentDots !== 1 ? 's' : ''}.</p>`;

  // Target dots selector
  h += `<label class="qf-label" for="dt-${prefix}_${n}_grow_target">Target dots</label>`;
  h += `<select id="dt-${prefix}_${n}_grow_target" class="qf-select" data-grow-target="${prefix}_${n}">`;
  h += '<option value="">— Select target —</option>';
  for (let d = currentDots + 1; d <= 5; d++) {
    const sel = savedTarget === d ? ' selected' : '';
    h += `<option value="${d}"${sel}>${d} dot${d !== 1 ? 's' : ''}</option>`;
  }
  h += '</select>';

  // XP cost display
  if (savedTarget > currentDots) {
    const xpCost = (savedTarget - currentDots) * 1; // 1 XP per merit dot
    h += `<p class="qf-desc dt-grow-xp-cost">${xpCost} XP to reach ${savedTarget} dots.</p>`;
  }
  h += '</div>';

  // Hidden field for collectResponses
  h += `<input type="hidden" id="dt-${prefix}_${n}_grow_target_val" value="${savedTarget || ''}">`;
  return h;
}
```

### `grow_xp` branch in `renderSphereFields()`

```javascript
if (fields.includes('grow_xp')) {
  // sphereMerit must be passed as 6th param (dtui-18 established this)
  h += renderAlliesGrowXp(n, prefix, sphereMerit || {}, saved);
}
```

### Change handler for `data-grow-target`

```javascript
if (target.dataset.growTarget !== undefined) {
  const prefixN = target.dataset.growTarget; // e.g. 'sphere_2'
  const val = target.value;
  saved[`${prefixN}_grow_target`] = val;
  // Update XP cost display (trigger re-render of this pane)
  scheduleSave();
}
```

Since `scheduleSave()` triggers a re-render, the XP cost display updates automatically.

### `collectResponses()` key for grow_target

`collectResponses()` reads `sphere_N_grow_target` via the hidden input `id="dt-sphere_N_grow_target_val"`. Alternatively, read it from the `<select>` directly via `getElementById`. Ensure the key is captured: `sphere_N_grow_target`.

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` — update `SPHERE_ACTION_FIELDS['grow']` to `['grow_xp']`
- `public/js/tabs/downtime-form.js` — remove Grow exclusion filter; add `renderAlliesGrowXp()`; add `grow_xp` branch in `renderSphereFields()`; add `data-grow-target` change handler

---

## Definition of Done

- AC1–AC5 verified
- Grow appears in Allies dropdown
- Grow block: merit name, target dots selector, XP cost display
- No Target/Approach/Outcome zones in Grow block
- Target dots selection persists across save/reload
- XP cost = (target - current) × 1 XP per dot
- `specs/stories/sprint-status.yaml` updated: dtui-19 → review

---

## Compliance

- CC1 — Effective rating discipline: current dots = `(m.dots || m.rating || 0) + (m.bonus || 0)` (effective, not inherent)
- CC4 — Token discipline: no bare hex
- CC5 — British English, no em-dashes
- CC9 — Reuses `.qf-select`, `.qf-desc`, `.qf-field` canonical form components

---

## Dependencies and Ordering

- **Depends on:** dtui-15 (SPHERE_ACTIONS includes Grow; SPHERE_ACTION_FIELDS updated); dtui-18 (established `sphereMerit` 6th param in `renderSphereFields()` — this story uses the same param)
- **Unblocks:** nothing within Wave 3 (Wave 3 complete after this story)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

Grow filter removed from sphere dropdown: `filteredActions` no longer excludes `o.value === 'grow'` (combines with dtui-17's ambience eligibility filter in one pass). `SPHERE_ACTION_FIELDS['grow']` updated to `['grow_xp']`. `renderAlliesGrowXp(n, prefix, m, saved)` added — reads effective dots, builds target dots selector (currentDots+1 to 5), shows XP cost when target selected (1 XP/dot merit rate). `grow_xp` branch added in `renderSphereFields()` calling `renderAlliesGrowXp(n, prefix, sphereMerit || {}, saved)`. `data-grow-target` change handler added to delegated change listener — collects + re-renders so XP cost display updates live. `grow_target` suffix added to sphere suffix collection loop in `collectResponses()` so target dots persist via the select's existing `id`. No Target zone, no Approach, no Outcome rendered for Grow action (field list is `['grow_xp']` only).

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-19 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-19 implemented; status → review. |
