---
id: fix.452
title: "DT Story: merit summary shows unchosen merits — missing actionVal guard in buildMeritActions"
status: review
issue: 452
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/452
branch: ms/issue-452-dt-story-actionval-guard
type: bug
---

## Story

As an ST reviewing a player's Allies & Asset Summary, I only want to see the merit actions the player explicitly chose to activate this cycle, not every merit on their sheet.

## Background

The DT form pre-populates sphere slot names with all of a character's merits. When a player leaves a slot without selecting an action (`sphere_N_action` stays empty), that slot was never activated. `buildMeritActions` in `downtime-story.js` currently only checks that the merit name is non-empty before pushing an action entry, so phantom slots appear in the summary as "No desired outcome stated" rows.

Surfaced after PR #451 added qualifiers to the summary labels, making all five identical "Allies" rows visibly distinct and obviously wrong.

## Acceptance Criteria

- [x] A character with 5 Allies merits whose player only set `sphere_N_action` for 2 shows only 2 rows in the Allies & Asset Summary.
- [x] Slots where `sphere_N_merit` is set but `sphere_N_action` is blank/empty are silently excluded from `buildMeritActions` output.
- [x] The `_raw.sphere_actions` path (DT2+ submissions) is unaffected.
- [x] No regression for submissions where all sphere slots were legitimately activated.

## Scope

- **In scope**: `buildMeritActions` flat-response sphere loop (`downtime-story.js:1993-2002`) only — one guard condition added.
- **Out of scope**: `_raw.sphere_actions` path; Contacts and Retainer paths (already guarded on non-empty `contact_N_request` / `retainer_N_task`).

---

## Dev Notes

### Root cause

`buildMeritActions` in `public/js/admin/downtime-story.js:1993-2002`:

```js
// CURRENT — missing actionVal guard
for (let n = 1; n <= 5; n++) {
  const mt = resp[`sphere_${n}_merit`];
  if (!mt) continue;                          // ← only checks merit name
  actions.push({
    merit_type:      mt,
    action_type:     resp[`sphere_${n}_action`] || 'misc',
    desired_outcome: resp[`sphere_${n}_outcome`]     || '',
    description:     resp[`sphere_${n}_description`] || '',
  });
}
```

When `sphere_N_merit` is set but `sphere_N_action` is empty, the slot is pushed with `action_type: 'misc'` — as if the player chose it.

### Reference fix in downtime-views.js

`public/js/admin/downtime-views.js:3154-3159` already has the correct guard with an explanatory comment:

```js
// Guard: require both merit label AND a non-empty action so existing submissions
// with phantom labels (player never toggled gate) are retroactively suppressed.
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`sphere_${n}_merit`];
  const actionVal = resp[`sphere_${n}_action`];
  if (!meritType || !actionVal) continue;      // ← correct: both required
  ...
}
```

### Fix — one change site

Add `actionVal` extraction and extend the continue condition:

```js
// AFTER
for (let n = 1; n <= 5; n++) {
  const mt        = resp[`sphere_${n}_merit`];
  const actionVal = resp[`sphere_${n}_action`];
  if (!mt || !actionVal) continue;             // skip phantom slots
  actions.push({
    merit_type:      mt,
    action_type:     actionVal,                // use actionVal directly — already validated non-empty
    desired_outcome: resp[`sphere_${n}_outcome`]     || '',
    description:     resp[`sphere_${n}_description`] || '',
  });
}
```

Note: use `actionVal` directly in the push (not `resp[...]  || 'misc'`) — it's already validated non-empty, and the `|| 'misc'` fallback is what was creating phantom entries.

### What must not break

- `_raw.sphere_actions` branch (lines 1980-1991, the `if (sphereRaw.length)` block) — do not touch.
- Contacts flat-response loop (lines 2015-2026) — already correctly guarded on `req` being non-empty.
- Retainer flat-response loop — already correctly guarded on `task || type`.
- `buildMeritActions` is called at load time (line 172: `merit_actions: buildMeritActions(sub)`) and its output is the sole source of truth for all merit rendering in `downtime-story.js`. Changing it retroactively affects DT3 live data — which is the intent.

### File to modify

- `public/js/admin/downtime-story.js` — lines 1993–2002 only. No CSS, no other files, no schema changes.

### Verification

Load the DT Story panel for a character whose submission has some sphere slots with a merit name but no action selected. Confirm:
- Only the activated slots (with `sphere_N_action` set) appear in Allies & Asset Summary.
- A submission where the player set all sphere actions still shows all rows.

---

## File List

- `public/js/admin/downtime-story.js` — modified (lines 1993-2004: added actionVal extraction and dual-field guard)
- `tests/fix-452-dt-story-actionval-guard.spec.js` — created (4 Playwright tests)
- `specs/stories/fix.452.dt-story-actionval-guard.story.md` — this file

## Change Log

- 2026-05-21: Implemented actionVal guard in `buildMeritActions` flat-response sphere loop; 4 Playwright tests added and passing; parse check clean.

## Dev Agent Record

### Completion Notes

**One-line fix, zero scope creep.** Added `const actionVal = resp[\`sphere_\${n}_action\`]` extraction and extended the `if (!mt) continue` guard to `if (!mt || !actionVal) continue` at `downtime-story.js:1993-2002`. Also changed the push to use `actionVal` directly instead of `resp[...] || 'misc'` — the validated value is already non-empty, and the `|| 'misc'` fallback was exactly the mechanism that fabricated phantom entries.

The `_raw.sphere_actions` branch (lines 1980-1991, the `if (sphereRaw.length)` block) was not touched. Contacts and Retainer flat-response loops were not touched (already guarded).

**Tests:** 4 Playwright tests in `tests/fix-452-dt-story-actionval-guard.spec.js` — all pass in ~24s:
- AC-1: 5 pre-populated merits, 2 activated → 2 rows rendered
- AC-2: phantom-only slot → merit_summary section not rendered
- AC-3: `_raw.sphere_actions` path unaffected (2 raw entries → 2 rows)
- AC-4: all 5 slots activated → 5 rows (regression guard)

**Pre-existing regression noted:** `fix-429-dt-story-skip-deleted-actions.spec.js` had 7/8 tests failing before and after this change (confirmed by stash test). Not introduced by fix-452.
