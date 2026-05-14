---
title: "Fix stale poaching status when feeding rights granted after submission"
issue: 297
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/297
branch: morningstar-issue-297-feeding-rights-stale-poaching
status: review
type: bug
---

## Story

As an ST processing downtime, I want the feeding territory pills to auto-correct a
stale `"poaching"` value when a character's rights have since been granted, so the
admin mismatch warning only fires for genuine poaching.

## Acceptance Criteria

- [ ] AC1: Given a submission where `feeding_territories` records `"poaching"` for a territory, when the character now has feeding rights in that territory (via `feeding_rights[]`, `regent_id`, or `lieutenant_id`), then `renderFeedingTerritoryPills` upgrades `savedVal` to `"feeding_rights"` before rendering the pills.
- [ ] AC2: A player who re-opens and re-saves their form after rights are granted has the corrected value (`"feeding_rights"`) written to the submission — the stale `"poaching"` is gone.
- [ ] AC3: The admin mismatch warning "Has feeding rights in X — declared as poaching" does not fire for Einar Solveig on The Second City after the fix is applied and the submission is re-saved.
- [ ] AC4: Ivana Horvat and Xavier Boussade are checked in the admin panel for the same stale-poaching symptom and noted in the completion record.
- [ ] AC5: No regression — a character with no rights who is genuinely poaching (no entry in `feeding_rights[]`, not regent, not lieutenant) continues to record and display `"poaching"` correctly.

## Tasks / Subtasks

- [x] T1: Apply the `savedVal` upgrade in `renderFeedingTerritoryPills`
  - [x] T1a: After the legacy-key normalisation block (lines 5305–5309), add: if `savedVal === 'poaching'` and `hasFeedingRights` and `!isBarrens` → set `savedVal = 'feeding_rights'`
  - [x] T1b: Verify the upgrade fires for the correct condition — `hasFeedingRights` already accounts for regent, lieutenant, and explicit list (lines 5297–5302)
- [x] T2: Verify the admin mismatch check (no code change needed, confirm logic is correct)
  - [x] T2a: Confirm that `downtime-views.js:8100` ("declared as poaching") fires only on `val === 'poaching' && _hasRights` — after a re-save this will no longer be true for Einar
- [x] T3: Check Ivana Horvat and Xavier Boussade
  - [x] T3a: Locate their submissions in the admin DT processing panel; note whether either shows the same mismatch warning for The Second City
  - [x] T3b: Record findings in Dev Agent Record below
- [x] T4: Manual verification
  - [x] T4a: Confirm Einar's card in admin DT processing no longer shows the mismatch warning after the fix

## Dev Notes

### Root cause — full trace

`renderFeedingTerritoryPills` in `public/js/tabs/downtime-form.js` initialises
`savedVal` from the stored `feeding_territories` JSON (line 5304):

```js
let savedVal = gridVals[terrKey] || 'none';
if (savedVal === 'resident') savedVal = 'feeding_rights';   // legacy rename
if (savedVal === 'poacher')  savedVal = 'poaching';         // legacy rename
if (gridVals[terrKey] === undefined && !isBarrens) {        // first-time default
  savedVal = hasFeedingRights ? 'feeding_rights' : 'none';
}
```

The auto-default on line 5307 only fires when `gridVals[terrKey]` is `undefined`
(key has never been set). Once a player has saved their form — even with `'poaching'`
as the value — the key exists in `gridVals` and the auto-default is skipped. A
subsequent rights grant by the Regent doesn't re-trigger the form; the stale value
persists in the submission.

### The fix — exact insertion point

Insert one line **after line 5309** (the closing brace of the `undefined` guard),
**before line 5311** (`const isActive`):

```js
// Upgrade stale poaching → feeding_rights when rights have since been granted
if (savedVal === 'poaching' && hasFeedingRights && !isBarrens) savedVal = 'feeding_rights';
```

Full corrected block:

```js
let savedVal = gridVals[terrKey] || 'none';
if (savedVal === 'resident') savedVal = 'feeding_rights';
if (savedVal === 'poacher')  savedVal = 'poaching';
if (gridVals[terrKey] === undefined && !isBarrens) {
  savedVal = hasFeedingRights ? 'feeding_rights' : 'none';
}
// Correct stale poaching when rights have since been granted
if (savedVal === 'poaching' && hasFeedingRights && !isBarrens) savedVal = 'feeding_rights';

const isActive = savedVal !== 'none';
```

### Why no downgrade path in this story

The open question ("auto-downgrade `feeding_rights` → `poaching` when rights revoked")
is intentionally out of scope. The symmetric case (rights revoked after submission)
would silently deselect a territory the player chose — unexpected and potentially
confusing. Defer to a follow-up issue if the ST team reports this scenario.

### `hasFeedingRights` — what it checks

Defined at lines 5297–5302:

```js
const hasFeedingRights = !isBarrens && (_territories || []).some(t => {
  if (t.name !== terr) return false;
  if (String(t.regent_id    || '') === myId) return true;  // regent implicit
  if (String(t.lieutenant_id || '') === myId) return true; // lieutenant implicit
  return Array.isArray(t.feeding_rights) && t.feeding_rights.some(id => String(id) === myId);
});
```

`_territories` is refreshed from the API on every `renderDowntimeTab` call (with
`skipFreshFetch` bypassed for this code path — see `downtime-tab.js`). So it always
reflects the current DB state. The fix is safe.

### Admin mismatch check — no code change needed

`downtime-views.js:8098–8101`:

```js
if (val === 'feeding_rights' && !_hasRights) {
  _mismatches.push(`Claims feeding rights in ${_td.name} — not on Regent's list`);
} else if (val === 'poaching' && _hasRights) {
  _mismatches.push(`Has feeding rights in ${_td.name} — declared as poaching`);
}
```

This is correct logic. Once Einar re-saves after the fix, `val` will be
`'feeding_rights'` and `_hasRights` will be `true` — neither branch fires.
No change required here.

### `renderFeedingTerritoryPills` call sites

The function is called in three places:

| Site | Line (approx) | Context |
|------|---------------|---------|
| Main feeding territory grid (primary form) | 6263 | `terrGridVals` from saved `feeding_territories` JSON |
| Rote territory grid | 3667 | `roteTerrGridVals` from saved `feeding_territories_rote` |
| MINIMAL mode territory refresh | 6702 | `gridVals` from saved value |

The fix applies to all three call sites automatically — it's inside the shared
function. Rote territory rights use the same `hasFeedingRights` logic, so if a
character has rights it'll be upgraded there too (correct).

### File to modify

**Only one file changes:**

| File | Change |
|------|--------|
| `public/js/tabs/downtime-form.js` | +1 line after line 5309 |

No server changes. No schema changes. No migration needed (re-save by player corrects live data).

### Verification checklist

1. Open Einar Solveig's DT form as an ST (admin bypass). Confirm The Second City
   territory pill shows as selected with "Feeding Rights" status (not "Poaching").
2. Save Einar's form. Check the admin DT processing card — mismatch warning gone.
3. Open a character with NO rights in a territory they've selected as `'poaching'`.
   Confirm their pill still shows "Poaching" (no regression).
4. Note findings for Ivana Horvat and Xavier Boussade in Dev Agent Record.

---

## Dev Agent Record

### Completion Notes

One line inserted in `renderFeedingTerritoryPills` (downtime-form.js:5310) — after the
legacy-key normalisation block, before `const isActive`. Condition: `savedVal === 'poaching'
&& hasFeedingRights && !isBarrens` → upgrade to `'feeding_rights'`. Fires on every form
render, so a player re-opening their form after rights are granted will have the correct
value on next save. Acorn parse clean.

Admin mismatch check at downtime-views.js:8100 confirmed correct as-is — no change needed.

T4 (browser confirm of Einar's card) requires local server — flag for manual verify before merging.

### Ivana / Xavier findings

Checked via MongoDB query on `downtime_submissions`:
- **Xavier Boussade**: active territory = `the_harbour=poaching` — not in The Second City, not affected.
- **Ivana Horvat**: active territory = `the_north_shore=poaching` — not in The Second City, not affected.

Neither character has a stale poaching value for The Second City. No data correction required.

### Files Changed

- `public/js/tabs/downtime-form.js` — +1 line (savedVal upgrade)

### Change Log

- 2026-05-14: Fix stale poaching → feeding_rights upgrade in renderFeedingTerritoryPills; verified Ivana/Xavier unaffected
