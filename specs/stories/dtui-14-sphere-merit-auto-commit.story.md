---
id: dtui.14
epic: dtui
status: review
priority: high
depends_on: [dtui.12, dtui.13]
---

# Story DTUI-14: Sphere-merit collaborator chip grid + auto-commit Support

As a player using my own Allies or Retainers as Support on my own action,
I want ticking a sphere-merit chip in the Joint panel to automatically commit that merit's Support action to this project,
So that I don't have to fill out a separate merit-action form for the same support.

---

## Context

dtui-12 created the `.dt-joint-panel` shell with two chip-grid sections. This story implements the **Your Allies and Retainers** grid (second section in the panel): the player's own sphere merits as `.dt-chip` components (multi-select), with merits already used this cycle rendered as disabled.

When a sphere-merit chip is selected, a Support action entry is auto-committed to that merit's slot in the merit-action section — mirroring the pattern where ticking "Rote quality" in Feeding auto-commits a project slot (DTFC-7). The player never manually sets `sphere_N_action = 'support'`; the chip does it silently.

**What counts as "sphere merits" for this grid:**
- `detectedMerits.spheres` — Allies merits (line ~211; `m.category === 'influence' && m.name === 'Allies'`)
- `detectedMerits.retainers` — Retainer merits (line ~242; `m.category === 'influence' && m.name === 'Retainer'`)
- Status and Contacts are NOT included in this grid

Each merit chip displays its label (e.g. `meritLabel(m)`) and effective rating dots (`●` repeated).

**Already-used detection:** A sphere merit is "used elsewhere this cycle" if, in the current submission's `saved` responses:
- For sphere merits (Allies): `sphere_K_action` is non-empty for some slot K (0-indexed from the matching detectedMerits.spheres entry)
- For retainer merits: `retainer_K_type` or `retainer_K_task` is non-empty

The auto-commit pattern:
- When a chip is ticked: set `saved['sphere_N_action'] = 'support'` (or `retainer_N_task = 'supporting project'`) and write `saved['project_SLOT_joint_sphere_support_ids']` with the selection list
- When a chip is unticked: clear the sphere slot's action back to `''`

**Key code locations:**
- `renderJointSphereChips()` stub — added in dtui-12, returns `''`; implement here
- `detectedMerits.spheres` — line ~211; array of Allies merit objects
- `detectedMerits.retainers` — line ~242; array of Retainer merit objects
- `meritLabel(m)` helper — used at lines ~4726, 4742 for display; locate its definition (likely near line 200 or in a helper section)
- `meritKey(m)` helper — used at line ~4745 for merit identification

---

## Files in scope

- `public/js/tabs/downtime-form.js` — implement `renderJointSphereChips(n, saved)`; add delegated click handler for `data-joint-sphere-slot`; implement auto-commit write to sphere slot action

---

## Out of scope

- Changes to `renderSphereFields()` or the sphere action forms — those remain user-authored
- Retainer action forms — unchanged; retainer chip only sets a scratch flag
- Status merit chips — Status merits are not sphere collaborators in this model
- Any server-side changes — auto-commit writes only to `saved` (client-side form state)

---

## Acceptance Criteria

### AC1 — Sphere-merit chip grid populated from own merits

**Given** the Joint panel renders the sphere-merit chip-grid (non-existingJoint),
**When** chips populate,
**Then** each of the player's Allies and Retainer merits appears as a `.dt-chip`, labelled with `meritLabel(m)` and effective rating dots (`●` × effectiveDots).

### AC2 — Unused merit chip is selectable

**Given** a sphere-merit chip represents a merit not yet used this cycle (no action set in its sphere/retainer slot),
**When** the chip renders,
**Then** it is in default selectable state.

### AC3 — Already-used merit chip is greyed and tooltipped

**Given** a sphere-merit chip represents a merit whose slot already has an action set,
**When** the chip renders,
**Then** it carries `disabled`, `aria-disabled="true"`, 50–60% opacity, `cursor: not-allowed`, and `title="This merit's action is already committed elsewhere."`.

### AC4 — Ticking a chip auto-commits Support to that merit's slot

**Given** a player ticks a sphere-merit chip for slot K (e.g. sphere slot 2),
**When** the chip is selected,
**Then** `saved['sphere_2_action']` is set to `'support'` AND `saved['project_N_joint_sphere_chips']` is updated with the selected chip key, AND `scheduleSave()` is called.

### AC5 — Unticking a chip clears the auto-committed Support

**Given** a player had ticked a sphere-merit chip (auto-committing Support),
**When** they untick that chip,
**Then** `saved['sphere_K_action']` is cleared back to `''` and `scheduleSave()` is called.

### AC6 — Multi-select: multiple merits can be selected

**Given** the chip-grid is multi-select,
**When** the player ticks multiple chips,
**Then** each ticked merit auto-commits its Support independently; any combination is valid.

---

## Implementation Notes

### Building the chip list

```javascript
function renderJointSphereChips(n, saved) {
  const spheres = (detectedMerits.spheres || []).map((m, i) => ({ m, slotKey: `sphere_${i + 1}`, type: 'sphere' }));
  const retainers = (detectedMerits.retainers || []).map((m, i) => ({ m, slotKey: `retainer_${i + 1}`, type: 'retainer' }));
  const all = [...spheres, ...retainers];

  if (!all.length) {
    return '<p class="qf-desc">You have no Allies or Retainer merits to contribute.</p>';
  }

  // Parse which chips are already selected for this project slot
  let selectedKeys = [];
  try { selectedKeys = JSON.parse(saved[`project_${n}_joint_sphere_chips`] || '[]'); } catch { selectedKeys = []; }
  const selectedSet = new Set(selectedKeys);

  let h = '';
  for (const { m, slotKey, type } of all) {
    const isUsed = isSphereMeritUsed(slotKey, type, saved);
    const isSelected = selectedSet.has(slotKey);
    const effectiveDots = (m.dots || m.rating || 0) + (m.bonus || 0);
    const dots = '●'.repeat(effectiveDots);
    const label = (typeof meritLabel === 'function' ? meritLabel(m) : m.name) +
      (dots ? ` ${dots}` : '');
    const isDisabled = isUsed && !isSelected; // can't grey something already used by THIS project
    const disabledAttr = isDisabled ? ' disabled aria-disabled="true"' : '';
    const title = isDisabled ? ' title="This merit\'s action is already committed elsewhere."' : '';
    const selectedClass = isSelected ? ' dt-chip--selected' : '';
    const disabledClass = isDisabled ? ' dt-chip--disabled' : '';
    h += `<button type="button" class="dt-chip${selectedClass}${disabledClass}"${disabledAttr}${title}`;
    h += ` data-joint-sphere-slot="${n}" data-sphere-key="${esc(slotKey)}" data-sphere-type="${type}">`;
    h += esc(label);
    h += `</button>`;
  }
  return h;
}
```

### Already-used detection

```javascript
function isSphereMeritUsed(slotKey, type, saved) {
  if (type === 'sphere') {
    return !!(saved[`${slotKey}_action`]);
  }
  if (type === 'retainer') {
    return !!(saved[`${slotKey}_type`] || saved[`${slotKey}_task`]);
  }
  return false;
}
```

### Click handler (add to delegated listener)

```javascript
if (target.dataset.jointSphereSlot !== undefined && !target.disabled) {
  const n = parseInt(target.dataset.jointSphereSlot);
  const slotKey = target.dataset.sphereKey;   // e.g. 'sphere_2'
  const type = target.dataset.sphereType;     // 'sphere' | 'retainer'
  const willSelect = !target.classList.contains('dt-chip--selected');

  target.classList.toggle('dt-chip--selected', willSelect);

  // Auto-commit or clear
  if (type === 'sphere') {
    saved[`${slotKey}_action`] = willSelect ? 'support' : '';
  }
  // Retainer: mark a scratch flag (no 'action' field in retainer schema)
  // saved[`${slotKey}_joint_support`] = willSelect ? '1' : '';

  // Update selection list for this project slot
  const allChips = document.querySelectorAll(`[data-joint-sphere-slot="${n}"]`);
  const keys = [...allChips]
    .filter(el => el.classList.contains('dt-chip--selected'))
    .map(el => el.dataset.sphereKey);
  saved[`project_${n}_joint_sphere_chips`] = JSON.stringify(keys);
  scheduleSave();
}
```

### Effective dots

Use `(m.dots || m.rating || 0) + (m.bonus || 0)` — consistent with CC1 (effective rating discipline). The `m.rating` field is what the domain.js influence calculation uses; `m.dots` is the schema v2 field. Check which field the merit object actually carries (inspect `detectedMerits.spheres[0]` in a real session) and use the live field. The `|| m.rating` fallback is safe.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — implement `renderJointSphereChips()`; add `isSphereMeritUsed()`; add `data-joint-sphere-slot` click handler

---

## Definition of Done

- AC1–AC6 verified
- Sphere-merit chips populate from `detectedMerits.spheres` + `detectedMerits.retainers`
- Already-used merits: disabled chip with tooltip
- Ticking a chip: auto-commits `sphere_K_action = 'support'` and calls `scheduleSave()`
- Unticking: clears `sphere_K_action`
- Multi-select works
- `specs/stories/sprint-status.yaml` updated: dtui-14 → review

---

## Compliance

- CC1 — Effective rating discipline: dots display uses `(m.dots || m.rating || 0) + (m.bonus || 0)`
- CC3 — Greyed-with-reason: disabled chips show `cursor: not-allowed` + tooltip
- CC4 — Token discipline: no bare hex; chip states via class hooks
- CC9 — Uses `.dt-chip` canonical component (dtui-2)

---

## Dependencies and Ordering

- **Depends on:** dtui-12 (`.dt-joint-panel` shell + `renderJointSphereChips()` stub), dtui-13 (implemented first to confirm chip click handler pattern)
- **Unblocks:** dtui-15 (Allies actions parity — distinct concern, but confirms the sphere-merit model)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

`isSphereMeritUsed()` added. `renderJointSphereChips()` builds effective-dot label manually (using `(m.dots || m.rating || 0) + (m.bonus || 0)`) rather than calling `meritLabel()` (which uses inherent `rating` only). Greying: `isDisabled = isUsed && !isSelected` — a chip already selected for this project is not greyed even if the slot is set. Click handler auto-commits `sphere_K_action = 'support'` on select and clears on deselect; retainer type sets no action field (retainer schema has no `_action` key). Selection list stored to `project_N_joint_sphere_chips`.

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-14 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-14 implemented; status → review. |
