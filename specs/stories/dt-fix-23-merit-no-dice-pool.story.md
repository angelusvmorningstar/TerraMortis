# Story DT-Fix-23: Merit Actions — Remove Dice Pool and Roll for Roll-Formula Merits

## Status: done

## Story

**As an** ST processing merit-based actions,
**I want** merit actions to never show a dice pool or roll button,
**so that** the panel reflects the correct mechanic (automatic successes = dot level) rather than misleading me with a roll workflow that doesn't apply.

## Background

Merit-based actions use automatic successes equal to the merit's dot level — they do not involve dice rolls. However, when a merit's `formula` field is `'dots2plus2'` (used for investigation-type merits such as Allies), the `_renderMeritRightPanel` function renders a full dice pool section including:

- Dice Pool Modifiers panel with Base pool `(dots × 2) + 2 = N dice`
- Equipment/other ticker
- Target Secrecy selector and Lead toggle (for Investigate actions)
- Total dice count
- ROLL – N DICE section with Roll button

This is triggered by `isRolled = (formula === 'dots2plus2')` (line ~5189), which is true for Allies and similar merits. The CONTESTED mode label (Action Mode row) correctly identifies the investigation as contested, but the dice mechanic is wrong.

The correct behaviour: show the dot level as automatic successes. The investigation matrix modifiers (Target Secrecy, Lead) still apply as modifiers to the automatic success count — they reduce the net successes, they do not modify a dice pool.

---

## Acceptance Criteria

1. Merit-based action panels never show a dice pool, pool builder, or Roll button, regardless of `formula` or `mode`.
2. When `formula === 'dots2plus2'` (i.e. currently `isRolled` is true), the right panel instead shows: "Automatic successes: [dots]".
3. For Investigate-type merit actions, the Target Secrecy and Lead modifiers continue to display as modifiers to the automatic success count (not a pool), showing net successes.
4. The Action Mode section (AUTOMATIC / CONTESTED / BLOCKED labels and effect text) is unaffected.
5. The STATUS section and its button set are unaffected.
6. Project-based actions (non-merit) are completely unaffected — their dice pool rendering is unchanged.

---

## Tasks / Subtasks

- [x] Task 1: Remove dice pool section for merit roll-formula actions (`downtime-views.js`)
  - [x] 1.1: In `_renderMeritRightPanel` (line ~5165), find the `else if (isRolled)` block (line ~5246). This is the condition that currently renders the full dice pool section.
  - [x] 1.2: Replace the entire `else if (isRolled) { ... }` block (lines ~5246–5290) with an auto-successes display:
    ```js
    } else if (isRolled) {
      // Merit actions do not use dice pools — show automatic successes instead
      const autoSucc = dots != null ? dots : 0;
      h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
      h += `<div class="proc-mod-panel-title">Automatic Successes</div>`;
      h += `<div class="proc-mod-row"><span class="proc-mod-label">Base successes</span><span class="proc-mod-static">${autoSucc}</span></div>`;
      if (actionType === 'investigate') {
        // Keep secrecy/lead modifiers — they reduce net successes, not a pool
        h += _renderEquipModRow(key, eqMod, eqStr);   // if this helper exists; else inline ticker
        // Target Secrecy
        h += `<div class="proc-mod-row">`;
        h += `<span class="proc-mod-label">Target Secrecy</span>`;
        h += `<select class="proc-recat-select proc-inv-secrecy-sel" data-proc-key="${esc(key)}">`;
        h += `<option value="">\u2014 Not set \u2014</option>`;
        for (const r of INVESTIGATION_MATRIX) {
          h += `<option value="${esc(r.type)}"${r.type === invSecrecy ? ' selected' : ''}>${esc(r.type)}</option>`;
        }
        h += `</select>`;
        const innateStr = innateMod !== 0 ? (innateMod > 0 ? `+${innateMod}` : String(innateMod)) : '';
        const innateCls = innateMod > 0 ? ' proc-mod-pos' : innateMod < 0 ? ' proc-mod-neg' : ' proc-mod-muted';
        if (innateStr) h += `<span class="proc-mod-val${innateCls}">${innateStr}</span>`;
        h += `</div>`;
        // Lead toggle
        const noLeadStr = noLeadMod < 0 ? String(noLeadMod) : '';
        h += `<div class="proc-mod-row"><span class="proc-mod-label">Lead</span>`;
        h += `<div class="proc-inv-lead-btns">`;
        h += `<button class="proc-inv-lead-btn${invHasLead === true ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="true">Lead</button>`;
        h += `<button class="proc-inv-lead-btn${invHasLead === false ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="false">No Lead</button>`;
        h += `</div>`;
        if (noLeadStr) h += `<span class="proc-mod-val proc-mod-neg">${noLeadStr}</span>`;
        h += `</div>`;
        // Net successes = dots + innateMod + noLeadMod (+ equipment if applicable)
        const netSucc = autoSucc + eqMod + innateMod + noLeadMod;
        h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Net successes</span><span class="proc-mod-total-val">${netSucc}</span></div>`;
      }
      h += `</div>`;
    }
    ```

- [x] Task 2: Confirm Roll section is gated by `isRolled` and remove for merit
  - [x] 2.1: Locate where the ROLL – N DICE section renders in `_renderMeritRightPanel` — verify it is inside the `isRolled` block or gated by it
  - [x] 2.2: If the Roll section renders outside the `isRolled` block, wrap it in `if (isRolled && !isMerit)` — but prefer keeping it inside the replaced block from Task 1

---

## Dev Notes

### Key file

`public/js/admin/downtime-views.js` — modifications within `_renderMeritRightPanel`.

### Variables already in scope (confirmed from code, line ~5174–5189)

| Variable | Value |
|----------|-------|
| `dots` | merit dot level (e.g. 3 for Allies 3) |
| `formula` | `'dots2plus2'` for Allies/investigation merits |
| `mode` | `'contested'` for investigation merits |
| `isRolled` | `formula === 'dots2plus2'` (line ~5189) |
| `isAuto` | `mode === 'auto'` |
| `basePool` | `(dots * 2) + 2` when `formula === 'dots2plus2'` |
| `invSecrecy` | `rev.inv_secrecy` (investigate only) |
| `invHasLead` | `rev.inv_has_lead` |
| `invRow` | row from `INVESTIGATION_MATRIX` matching secrecy type |
| `innateMod` | secrecy modifier from investigation matrix |
| `noLeadMod` | lead modifier from investigation matrix |
| `eqMod` | equipment modifier |
| `eqStr` | equipment modifier display string |

### Equipment row helper

Check whether `_renderEquipModRow` or `_renderTickerRow` is the correct helper for rendering the Equipment/other ticker row. The original `isRolled` block uses `_renderTickerRow(key, 'Equipment / other', 'proc-equip-mod', eqStr, eqMod)` — use the same call.

### Net successes formula

For merit investigate: `netSucc = dots + eqMod + innateMod + noLeadMod`

`eqMod` represents any additional equipment bonus. Include it in the net successes even though it was part of the pool in the old formula.

### Roll section location

The Roll button (`proc-proj-roll-btn`) for merit actions is rendered after the mod panel inside the `isRolled` block. Replacing the `isRolled` block as in Task 1 removes it automatically. If a separate roll section exists outside the block, gate it: `if (isRolled && !isMerit)`.

### No CSS changes

All classes used (`proc-feed-mod-panel`, `proc-mod-row`, `proc-mod-label`, `proc-mod-static`, `proc-mod-total-row`, `proc-mod-total-val`, `proc-inv-lead-btns`, `proc-inv-lead-btn`, `proc-inv-secrecy-sel`) already exist.

### No test framework

Manual verification: open an Allies (Bureaucracy) Investigate action — confirm no dice pool section, no Roll button; instead shows "Automatic successes: 3" (or appropriate dot count). Set Target Secrecy — confirm net successes update. Open a project-based Investigate action — confirm dice pool and Roll button still present and unchanged.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Replaced `else if (isRolled)` block in `_renderMeritRightPanel` (line ~5252): removed "Dice Pool Modifiers" panel, removed `_renderRollCard` call entirely
- New block shows "Automatic Successes" panel with base successes = dots
- For `investigate` actionType: Equipment ticker, Target Secrecy selector, Lead toggle, and Net successes total row all preserved; net formula is `dots + eqMod + innateMod + noLeadMod`
- Roll section was already inside the replaced block — removed automatically, no extra gating needed
- Success Modifier section (`if (isRolled)` at line ~5297) intentionally retained — manual ST adjustment still applies to auto successes

### File List
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
