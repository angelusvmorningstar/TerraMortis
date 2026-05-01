---
id: dtui.13
epic: dtui
status: review
priority: high
depends_on: [dtui.12, dtui.2]
---

# Story DTUI-13: Player invitee chip grid behaviour

As a player picking which characters to invite into a Joint action,
I want chips for characters who have no free projects this cycle to be greyed with a tooltip explaining why,
So that I don't waste an invitation on someone unable to join.

---

## Context

dtui-12 created the `.dt-joint-panel` shell with two chip-grid containers. This story implements the **Players** grid (first section): the full character roster as `.dt-chip` components (multi-select), with characters who have no free project slots this cycle rendered as disabled chips.

Currently `renderJointInviteeGrid()` (line ~4196) renders a `div.dt-joint-invitee-grid` with `<label><input type="checkbox">` items. This story replaces that renderer (for the non-existingJoint path) with `renderJointInviteeChips()` using the `.dt-chip` / `.dt-chip-grid` pattern from dtui-2.

**Free project detection:** A character has a free project slot if, in the current cycle's downtime submissions, fewer than `maxProjectSlots` project actions are set for that character. The API endpoint `/api/downtime_submissions` returns all submissions for the active cycle; each submission's `responses` object has keys `project_1_action`, `project_2_action`, etc. The current character's own submission is loaded as `responseDoc`. Other characters' submissions are available in `_allSubmissions` (module-level array, loaded alongside the character roster).

The module-level `maxProjectSlots` is already read from the cycle data (or defaults to 4 for the current TM campaign). The character roster is `allCharacters` (module-level array of `{ id, name, ... }`).

**Key code locations:**
- `renderJointInviteeChips()` stub — added in dtui-12, currently returns `''`; implement here
- `_allSubmissions` — check if already loaded; if not, it may need to be fetched alongside `responseDoc`
- `allCharacters` — module-level, line ~50
- `renderJointInviteeGrid()` — line ~4196 (legacy, only used by existingJoint re-invite panel; leave intact)

---

## Files in scope

- `public/js/tabs/downtime-form.js` — implement `renderJointInviteeChips(n, saved)`; add free-slot detection helper `getCharFreeSlotCount(charId)`; wire chip click handler under delegated listener

---

## Out of scope

- Sphere-merit collaborator grid (dtui-14)
- The `existingJoint` path — `renderJointStatusBadges()`, `renderJointReinvitePanel()` etc. unchanged
- The legacy `renderJointInviteeGrid()` function — used by `renderJointReinvitePanel()` (existingJoint); leave it in place

---

## Acceptance Criteria

### AC1 — All characters appear as chips, alphabetical

**Given** the Joint panel renders the player invitee chip-grid (non-existingJoint),
**When** chips populate,
**Then** all characters from `allCharacters` appear as `.dt-chip` elements sorted alphabetically by display name.

### AC2 — Character with free project slots is selectable

**Given** an invitee chip represents a character who has at least one free project slot this cycle,
**When** the chip renders,
**Then** it is in default selectable state (no `disabled` attribute, full opacity).

### AC3 — Character with no free slots is greyed and tooltipped

**Given** an invitee chip represents a character who has NO free project slots this cycle,
**When** the chip renders,
**Then** it carries `disabled` and `aria-disabled="true"`, 50–60% opacity, `cursor: not-allowed`, and `title="This player has no free projects this cycle."`.

### AC4 — Chip selection persists across save/reload

**Given** a player ticks one or more invitee chips,
**When** the form saves,
**Then** `project_N_joint_invited_ids` in responses contains the JSON-encoded array of selected character IDs; on form reload, those chips are pre-selected.

### AC5 — Multi-select: multiple chips can be selected

**Given** the chip-grid is multi-select,
**When** the player clicks multiple chips,
**Then** each click toggles that chip's selected state independently; any combination is valid.

### AC6 — The current character is excluded from the invitee list

**Given** the current character is in `allCharacters`,
**When** the invitee chip-grid renders,
**Then** the current character (`currentChar._id`) does not appear as a chip (a player cannot invite themselves).

---

## Implementation Notes

### Free-slot detection helper

```javascript
function getCharFreeSlotCount(charId) {
  // Find this character's submission for the current cycle
  const sub = (_allSubmissions || []).find(s =>
    String(s.character_id) === String(charId)
  );
  if (!sub) return maxProjectSlots; // no submission = all slots free
  const responses = sub.responses || {};
  let used = 0;
  for (let p = 1; p <= maxProjectSlots; p++) {
    if (responses[`project_${p}_action`]) used++;
  }
  return maxProjectSlots - used;
}
```

`maxProjectSlots` — check whether this constant already exists as a module-level variable (search for `projectSlots` or `maxProjectSlots` in downtime-form.js). If not, derive it from `DOWNTIME_SECTIONS.find(s => s.key === 'projects')?.projectSlots || 4`.

`_allSubmissions` — check if already module-level. If not, load it in the same fetch that loads `responseDoc` (the `/api/downtime_submissions?cycle_id=X` endpoint returns all submissions; the current character's is filtered client-side). Only load non-current-char submissions; or load all and filter here.

### `renderJointInviteeChips(n, saved)`

```javascript
function renderJointInviteeChips(n, saved) {
  const myId = String(currentChar?._id || '');
  const candidates = allCharacters.filter(c => String(c.id) !== myId);
  if (!candidates.length) {
    return '<p class="qf-desc">No other characters available to invite.</p>';
  }

  // Parse existing selections
  let invitedIds = [];
  try { invitedIds = JSON.parse(saved[`project_${n}_joint_invited_ids`] || '[]'); } catch { invitedIds = []; }
  const invitedSet = new Set(invitedIds.map(String));

  // Sort alphabetically by display name
  const sorted = [...candidates].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  );

  let h = '';
  for (const c of sorted) {
    const id = String(c.id);
    const freeSlots = getCharFreeSlotCount(id);
    const isSelected = invitedSet.has(id);
    const isDisabled = freeSlots <= 0;
    const disabledAttr = isDisabled ? ' disabled aria-disabled="true"' : '';
    const title = isDisabled ? ' title="This player has no free projects this cycle."' : '';
    const selectedClass = isSelected ? ' dt-chip--selected' : '';
    const disabledClass = isDisabled ? ' dt-chip--disabled' : '';
    h += `<button type="button" class="dt-chip${selectedClass}${disabledClass}"${disabledAttr}${title}`;
    h += ` data-joint-invitee-slot="${n}" data-char-id="${esc(id)}">`;
    h += `${esc(c.name)}`;
    h += `</button>`;
  }
  return h;
}
```

### Click handler (add to delegated listener)

```javascript
if (target.dataset.jointInviteeSlot !== undefined && !target.disabled) {
  const n = parseInt(target.dataset.jointInviteeSlot);
  const charId = target.dataset.charId;
  target.classList.toggle('dt-chip--selected');
  const selected = document.querySelectorAll(
    `[data-joint-invitee-slot="${n}"].dt-chip--selected`
  );
  const ids = [...selected].map(el => el.dataset.charId);
  saved[`project_${n}_joint_invited_ids`] = JSON.stringify(ids);
  scheduleSave();
}
```

### collectResponses() — no change needed

`collectResponses()` already reads `project_N_joint_invited_ids` via `getElementById`. The click handler writes to `saved` directly and also updates the DOM (chip selected state), so `collectResponses()` will pick up the value on next save cycle. If `collectResponses()` reads this field from DOM (not `saved`), add a hidden `<input id="dt-project_${n}_joint_invited_ids" value="...">` analogous to the maintenance chip pattern from dtui-11.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — implement `renderJointInviteeChips()`; add `getCharFreeSlotCount()`; add delegated click handler for `data-joint-invitee-slot`

---

## Definition of Done

- AC1–AC6 verified
- All characters (excluding current) shown as chips, alphabetical
- Characters with no free slots: disabled chip, correct tooltip
- Chip selection persists across save/reload via `project_N_joint_invited_ids`
- Multi-select works (multiple chips can be selected simultaneously)
- No regression in existingJoint re-invite panel (`renderJointReinvitePanel` still uses `renderJointInviteeGrid`)
- `specs/stories/sprint-status.yaml` updated: dtui-13 → review

---

## Compliance

- CC1 — Effective rating discipline: free-slot check reads actual submission data, never hardcoded assumption
- CC3 — Greyed-with-reason: disabled chips show `cursor: not-allowed` + tooltip; opacity via `.dt-chip--disabled` class from dtui-2 CSS
- CC4 — Token discipline: no bare hex; chip states use `.dt-chip--selected` / `.dt-chip--disabled` class hooks
- CC9 — Uses `.dt-chip` canonical component (dtui-2)

---

## Dependencies and Ordering

- **Depends on:** dtui-12 (`.dt-joint-panel` shell + `renderJointInviteeChips()` stub), dtui-2 (`.dt-chip-grid`/`.dt-chip` CSS)
- **Unblocks:** dtui-14 (sphere-merit chip grid, which shares the panel shell)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

Added `let _allSubmissions = []` module-level variable; populated at form load from the existing `subs` fetch (all cycle submissions were already being fetched — just not stored). `getCharFreeSlotCount()` derives `maxSlots` from `DOWNTIME_SECTIONS` rather than a constant. `renderJointInviteeChips()` includes a hidden input `dt-project_N_joint_invited_ids` for `collectResponses()` to read; `collectResponses()` updated to prefer this hidden input over legacy checkboxes (preserving the existingJoint re-invite checkbox path). Click handler added to delegated listener, toggles `dt-chip--selected` and updates hidden input. `renderJointInviteeGrid()` left intact for `renderJointReinvitePanel`.

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-13 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-13 implemented; status → review. |
