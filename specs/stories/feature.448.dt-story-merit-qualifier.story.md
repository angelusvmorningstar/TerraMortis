---
id: feature.448
title: "DT Story: Allies & Asset Summary rows should show merit qualifier"
status: review
issue: 448
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/448
branch: ms/issue-448-dt-story-merit-qualifier
type: feature
---

## Story

As an ST processing downtimes, I want each row in the Allies & Asset Summary table to show the merit qualifier (e.g. "Allies (Police)", "Contacts (Media)") so that I can identify which specific ally or contact is being reported without cross-referencing the action cards above.

## Background

The "Allies & Asset Summary" section in the DT Story panel groups all merit actions into a compact table for quick outcome entry. The label column currently shows only the bare merit type ("Allies", "Contacts"), making all rows of the same type indistinguishable when a character has multiple Allies or Contacts with different qualifiers (e.g. Police, Media, Underworld).

This was observed in DT3: four identical "Allies" rows and five identical "Contacts" rows.

## Acceptance Criteria

- [ ] When a character has multiple Allies with different qualifiers, each summary row label shows the qualifier: "Allies (Police)", "Allies (Media)", etc.
- [ ] When a merit has no qualifier, the label shows the base name only — no empty parens appended.
- [ ] Contacts, Retainer, Staff, Status, and Misc rows follow the same rule.
- [ ] Action card sections (allies_actions, contact_requests, etc.) are unchanged — those already display qualifiers correctly.

## Scope

- **In scope**: `renderMeritSummary` label column only — the `meritLabel` stored in each group entry.
- **Out of scope**: dot count display in summary rows; action card rendering; schema changes.

---

## Dev Notes

### Root cause (already diagnosed)

`renderMeritSummary` in `public/js/admin/downtime-story.js:2283` calls `getMeritDetails(char, a)` which correctly returns `{ dots, qualifier, label }`. Only `label` is destructured; `qualifier` is silently discarded. The `label` value is the bare merit name with no qualifier.

```js
// CURRENT — line 2283
const { label: meritLabel } = getMeritDetails(char, a);
groups[cat].push({
  meritLabel: meritLabel || a.merit_type || 'Merit',  // "Allies"
  ...
});
```

### Fix — one change site only

Capture `qualifier` from `getMeritDetails` and build a display label that appends `(qualifier)` when one exists:

```js
// AFTER
const { label: meritLabel, qualifier } = getMeritDetails(char, a);
const displayLabel = qualifier ? `${meritLabel} (${qualifier})` : meritLabel;
groups[cat].push({
  meritLabel: displayLabel || a.merit_type || 'Merit',
  ...
});
```

No other change is needed. The render site at line 2309 already uses `entry.meritLabel` directly via `esc()`.

### `getMeritDetails` — read before touching

`getMeritDetails` (line 2182) already extracts qualifier correctly from three sources in priority order:
1. Inline qualifier in `action.merit_type` string: `"Allies ●●● (Police)"` → `"Police"`
2. `merit.qualifier` from the character's merits array
3. `action.qualifier` directly on the action object

Do **not** modify `getMeritDetails`. The fix is entirely in the call site inside `renderMeritSummary`.

### What must not break

- Action card sections (`renderMeritSection` / `renderMeritCard`) — they call `getMeritDetails` independently and already show qualifiers via `qualStr` at line 2627. No change there.
- The `meritLabel` fallback chain (`|| a.merit_type || 'Merit'`) must be preserved — it handles actions where `getMeritDetails` returns an empty label (e.g. an unrecognised merit type).
- `_isDeletedMeritAction` and `pool_status === 'skipped'` guards on lines 2278–2280 must remain untouched.

### File to modify

- `public/js/admin/downtime-story.js` — lines 2283–2285 only.

No CSS, no other JS files, no schema changes.

### Verification

Load the DT Story panel for a character with multiple Allies/Contacts (e.g. DT3 submission with 4 Allies actions). Confirm:
- Label column now reads "Allies (Police)", "Allies (Media)", etc.
- A Resources row (no qualifier) still reads just "Resources".
- Action cards above are unchanged.

---

## Dev Agent Record

### Implementation Notes

Single-site fix at `downtime-story.js:2283`. Captured `qualifier` alongside `label` from the existing `getMeritDetails` call; built `displayLabel` with `(qualifier)` suffix when qualifier is non-empty; used `displayLabel` in the group-entry push. No other files changed. `getMeritDetails` was not modified — it already extracts qualifier correctly from three sources (inline parens in `merit_type`, `merit.qualifier`, `action.qualifier`). All guards (`_isDeletedMeritAction`, `pool_status === 'skipped'`) and the fallback chain (`|| a.merit_type || 'Merit'`) preserved.

### Files Changed

- `public/js/admin/downtime-story.js` — lines 2283–2286 (3 lines added/changed)

### Change Log

- 2026-05-21: Capture qualifier from getMeritDetails in renderMeritSummary; build displayLabel with "(qualifier)" suffix; resolves issue #448
