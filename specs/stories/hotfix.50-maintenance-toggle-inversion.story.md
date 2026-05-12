# Story hotfix.50: DT Form — Maintenance Chip Grid Affordance Inversion

Status: review

issue: 50
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/50
branch: angelus/issue-50-maintenance-toggle-inversion

## Story

As a player at a chapter-finale downtime,
I want the Maintenance Action chip grid to show me which merits actually need maintaining,
so that I select the right merit and do not waste a project slot on one already maintained this chapter.

## Acceptance Criteria

1. Yusuf's PT renders as a clickable Maintenance Action target (PT not yet maintained per `maintenance_audit`).
2. Yusuf's MCI renders as greyed/disabled (MCI already maintained per `maintenance_audit.mci === true`).
3. The toggle state matches the detection state for any character in any combination of maintained/unmaintained merits.
4. The inversion root cause is documented in the story completion notes.

## Tasks / Subtasks

- [x] **Task 1 — Add `getAuditMaintained(cycle, char)` helper** (AC: #1, #2, #3)
  - [x] Insert the new function immediately after `getAlreadyMaintainedTargets` (downtime-form.js line 4831).
  - [x] Function reads `cycle.maintenance_audit?.[char._id].{pt, mci}` and returns a `Set` of `${meritName}_${dots}` ids for merits where the audit flag is `true`.
  - [x] Guards: return empty Set when `cycle` or `char` is null/undefined.
  - [x] For PT: `m.name === 'Professional Training' && audit.pt === true`.
  - [x] For MCI: `m.name === 'Mystery Cult Initiation' && audit.mci === true && m.active !== false` (respect existing active guard).
  - [x] Uses `meritEffectiveRating(currentChar, m)` for dot count — same helper used by `renderMaintenanceChips`.

- [x] **Task 2 — Update `renderMaintenanceChips` to accept audit set** (AC: #1, #2, #3)
  - [x] Add optional 6th parameter `auditMaintained = new Set()`.
  - [x] Change `isDisabled` to: `const isDisabled = alreadyMaintained.has(id) || auditMaintained.has(id);`
  - [x] Differentiate the tooltip:
    - Audit-disabled: `'Maintained this chapter — no action needed.'`
    - Form-dedup-disabled: `'Already chosen as a target in another project slot.'`

- [x] **Task 3 — Update the project maintenance call site** (AC: #1, #2, #3)
  - [x] At `renderTargetZone` line ~4946 where `actionVal === 'maintenance'`:
    - Rename `alreadyMaintained` to `formDedup` for clarity.
    - Add: `const auditMaint = getAuditMaintained(currentCycle, currentChar);`
    - Pass `auditMaint` as the 6th arg: `renderMaintenanceChips(n, saved, currentChar, formDedup, 'project', auditMaint)`.
  - [x] The sphere maintenance call site (line ~5317) does NOT need updating — it uses `getSphereAlreadyMaintainedTargets` for Allies maintenance, not PT/MCI; passing a default empty Set is correct.

- [x] **Task 4 — Verify no regression** (AC: #3, #4)
  - [x] Non-chapter-finale forms: `currentCycle.is_chapter_finale` is false so `maintenance_audit` is absent/empty. `getAuditMaintained` returns empty Set. No change in behaviour for standard cycles.
  - [x] Chapter-finale forms with no ST ticks yet: `maintenance_audit[char_id]` absent → empty Set. Both chips remain enabled. Correct.
  - [x] Chapter-finale with `audit.pt === true, audit.mci === true`: both chips disabled. Correct.

## Dev Notes

### Root cause (named by audit `df340a3`)

Two Maintenance UIs in the DT form consult **different data sources**:

| Surface | Function | Data source |
|---------|----------|-------------|
| Reminder banner (top of Projects) | `renderMaintenanceWarnings` | `cycle.maintenance_audit[char_id].{pt, mci}` |
| Chip grid (maintenance project action) | `renderMaintenanceChips` | `getAlreadyMaintainedTargets` — same-submission dedup only |

`getAlreadyMaintainedTargets` only checks "is this merit already assigned as a target in another project slot of THIS form session". It does NOT consult `maintenance_audit`. Therefore:

- A merit that IS already-maintained-this-chapter (per audit) shows as clickable in the chip grid.
- A merit that is NOT yet maintained can appear disabled if it happens to be selected in another project slot.

For Yusuf: his saved draft has PT in slot 3 (`project_3_target_value = 'Professional Training_5'`). When another maintenance slot renders, PT is in the dedup set (disabled) and MCI is not (enabled) — exactly inverted from what the reminder banner detects.

### Exact changes

**New function (insert after line 4831):**
```js
/** Returns a Set of chip ids that maintenance_audit says are already done this chapter (dtui-50). */
function getAuditMaintained(cycle, char) {
  if (!cycle || !char) return new Set();
  const audit = cycle.maintenance_audit?.[String(char._id)] || {};
  const set = new Set();
  for (const m of (char.merits || [])) {
    if (m.name === 'Professional Training' && audit.pt === true) {
      set.add(`Professional Training_${meritEffectiveRating(char, m)}`);
    }
    if (m.name === 'Mystery Cult Initiation' && audit.mci === true && m.active !== false) {
      set.add(`Mystery Cult Initiation_${meritEffectiveRating(char, m)}`);
    }
  }
  return set;
}
```

**`renderMaintenanceChips` signature + internals:**
```js
// BEFORE:
function renderMaintenanceChips(n, saved, charData, alreadyMaintained, prefix = 'project') {
  // ...
  const isDisabled = alreadyMaintained.has(id);
  const disabledAttr = isDisabled ? ' disabled aria-disabled="true"' : '';
  const titleAttr = isDisabled ? ' title="Maintained this chapter."' : '';

// AFTER:
function renderMaintenanceChips(n, saved, charData, alreadyMaintained, prefix = 'project', auditMaintained = new Set()) {
  // ...
  const isDisabled = alreadyMaintained.has(id) || auditMaintained.has(id);
  const disabledAttr = isDisabled ? ' disabled aria-disabled="true"' : '';
  const titleAttr = auditMaintained.has(id)
    ? ' title="Maintained this chapter — no action needed."'
    : isDisabled
      ? ' title="Already chosen as a target in another project slot."'
      : '';
```

**Project call site:**
```js
// BEFORE:
} else if (actionVal === 'maintenance') {
  const alreadyMaintained = getAlreadyMaintainedTargets(n, saved, 5);
  h += renderMaintenanceChips(n, saved, currentChar, alreadyMaintained);
}

// AFTER:
} else if (actionVal === 'maintenance') {
  const formDedup = getAlreadyMaintainedTargets(n, saved, 5);
  const auditMaint = getAuditMaintained(currentCycle, currentChar);
  h += renderMaintenanceChips(n, saved, currentChar, formDedup, 'project', auditMaint);
}
```

### Files to change

- `public/js/tabs/downtime-form.js` — 3 changes:
  1. New `getAuditMaintained` function after line 4831
  2. Updated `renderMaintenanceChips` signature + tooltip logic (~line 4835)
  3. Updated project call site (~line 4946)

### Things NOT to change

- `getAlreadyMaintainedTargets` — correct for its purpose (same-session dedup); leave as-is.
- Sphere maintenance call site (line ~5317) — no change needed; passes empty default.
- `maintenance_audit` schema — no server changes.
- `renderMaintenanceWarnings` — already correct; not involved in the chip fix.

### Conventions

- No new imports.
- British English in strings.
- `meritEffectiveRating(char, m)` matches the same call already in `renderMaintenanceChips` line 4849.

### References

- `public/js/tabs/downtime-form.js:4822` — `getAlreadyMaintainedTargets` (insert new fn after)
- `public/js/tabs/downtime-form.js:4835` — `renderMaintenanceChips` (update signature + tooltip)
- `public/js/tabs/downtime-form.js:4946` — project maintenance call site (update)
- `public/js/tabs/downtime-form.js:5317` — sphere maintenance call site (no change)
- `public/js/tabs/downtime-form.js:2948` — `renderMaintenanceWarnings` (reference — correct, unchanged)
- `specs/audits/maintenance-action-audit.md` — full audit document naming root cause
- Issue #50: https://github.com/angelusvmorningstar/TerraMortis/issues/50

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Root cause (named in `df340a3` audit): `renderMaintenanceChips` used only `getAlreadyMaintainedTargets` (same-submission dedup) and never consulted `cycle.maintenance_audit`. For Yusuf, PT was already in slot 3 of his draft, so the dedup set contained PT and disabled it; MCI was not in any slot so it appeared fully clickable — exactly inverted from the audit's detection state.
- Fix: added `getAuditMaintained(cycle, char)` which reads `maintenance_audit[char_id].{pt,mci}` and returns chip-id Set. Project call site now unions `formDedup + auditMaint` before passing to `renderMaintenanceChips`. Sphere call site unchanged (no audit data for Allies; defaults to empty Set).
- Tooltip now differentiates: audit-disabled → "Maintained this chapter — no action needed."; slot-dedup-disabled → "Already chosen as a target in another project slot."
- Non-chapter-finale cycles: `getAuditMaintained` returns empty Set (no `maintenance_audit` field). Zero behavioural change for standard cycles.

### File List

- `public/js/tabs/downtime-form.js`
