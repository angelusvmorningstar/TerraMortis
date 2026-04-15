# Story DT-Fix-20: Feeding Ambience Defaults to −4 When No Territory Selected

## Status: ready-for-dev

## Story

**As an** ST processing feeding actions,
**I want** the ambience modifier to show −4 (Barrens) when no territory is selected,
**so that** the vitae tally reflects the correct penalty for feeding without a territory rather than silently contributing 0.

## Background

The vitae tally Ambience row currently shows `—` and contributes `0` to Final Vitae when no territory is active (the `—` pill is selected). Per Damnation City rules, feeding outside any named territory means feeding in the Barrens, which carries a −4 ambience modifier.

The `_renderFeedRightPanel` function computes `ambienceVitae` by iterating `fedTerrKeys` (territories the character fed in this cycle). If the set is empty and `entry.primaryTerr` is also unset, `ambienceVitae` stays `null`, and the `autoSum` calculation uses `(ambienceVitae ?? 0)` — effectively 0. The fix: when both resolvers produce no result, set `ambienceVitae = -4` with label `"Barrens"`.

---

## Acceptance Criteria

1. When no territory is selected (the `—` pill is active and no `entry.primaryTerr`), the Ambience row shows `−4` with label `Ambience (Barrens)` and class `proc-mod-neg`.
2. Final Vitae decreases by 4 in this case (same maths as any other negative ambience).
3. If any territory is resolved (even via `primaryTerr` fallback), the Barrens default does not apply.
4. No change to the existing display logic for positive or named-territory ambience.

---

## Tasks / Subtasks

- [ ] Task 1: Apply Barrens default in `_renderFeedRightPanel` (`downtime-views.js`)
  - [ ] 1.1: After the `primaryTerr` fallback block (line ~5604), add:
    ```js
    // No territory resolved = Barrens: −4 ambience
    if (ambienceVitae === null) {
      ambienceVitae = -4;
      bestTerrLabel = 'Barrens';
    }
    ```
  - [ ] 1.2: The existing `autoSum` at line ~5617 already uses `(ambienceVitae ?? 0)` — with the fix, `ambienceVitae` will always be a number, so `?? 0` becomes a no-op. No further changes to the sum or finalVitae calculation.

---

## Dev Notes

### Key file

`public/js/admin/downtime-views.js` — single insertion of 4 lines.

### Exact insertion point

```js
// line ~5594 — primaryTerr fallback block (existing):
if (ambienceVitae === null && entry.primaryTerr) {
  // ... resolve from terrList / confirmedAmb ...
  ambienceVitae = ...;
  bestTerrLabel = ...;
}

// ADD IMMEDIATELY AFTER (new lines):
if (ambienceVitae === null) {
  ambienceVitae = -4;
  bestTerrLabel = 'Barrens';
}
```

### Display — existing render logic already handles this correctly

Line ~5641:
```js
const ambLabel = bestTerrLabel ? `Ambience (${bestTerrLabel})` : 'Ambience';
if (ambienceVitae === null) {
  h += `<div class="proc-mod-row">...—...</div>`;
} else {
  const ambSign = ambienceVitae > 0 ? '+' : '';
  h += `<div class="proc-mod-row"><span class="proc-mod-label">${esc(ambLabel)}</span>
    <span class="proc-mod-val ${ambienceVitae > 0 ? 'proc-mod-pos' : ambienceVitae < 0 ? 'proc-mod-neg' : ''}">${ambSign}${ambienceVitae}</span></div>`;
}
```

With `ambienceVitae = -4` and `bestTerrLabel = 'Barrens'`, this renders:
- Label: `Ambience (Barrens)`
- Value: `−4` with class `proc-mod-neg`

The `null` branch (which shows `—`) will now only be unreachable — it can be left in place as dead code or removed at author's discretion. Do not remove it in this story.

### No CSS changes needed

All required CSS classes (`proc-mod-neg`, `proc-mod-row`, `proc-mod-label`, `proc-mod-val`) already exist.

### No test framework

Manual verification: open a feeding action panel with the `—` pill active — Ambience row should show `−4 (Barrens)` and Final Vitae should decrease accordingly. Select a territory — Ambience should switch to the territory's value. Clear territory — returns to Barrens −4.

---

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
