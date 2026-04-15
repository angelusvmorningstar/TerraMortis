# Story DT-Fix-16: Rite Selector — Description Leak and Custom Option

## Status: done

## Story

**As an** ST processing sorcery submissions,
**I want** the rite selector to show only the dropdown (not the player's blob text inline), and to support a Custom option for rites not in the database,
**so that** the panel is readable and I can process any rite regardless of whether it's in the rules DB.

## Background

Two distinct bugs in the sorcery card in `renderActionPanel` (`public/js/admin/downtime-views.js`):

**Bug 1 — Description text leaking into the rite selector row**

When the ST overrides the rite (selects a rite from the dropdown that differs from `entry.riteName`), a `proc-recat-original` span renders inside `proc-rite-select-row` showing `entry.riteName`. For DT2 CSV submissions, `entry.riteName` is the player's full submission blob (e.g. "Player: Ritual Name/Level: Blood Witness L2 Caster/s: Ivana Target/s: Court Location...") — potentially hundreds of characters. This blob renders inline next to the dropdown and looks broken. The full text is already visible in the sorcery Details card above; it must not appear here.

**Bug 2 — No Custom rite option**

When a rite is not in the rules DB, the panel shows "Rite not found in rules database." with no way to proceed. The ST cannot compute a pool or roll. A "Custom" option is needed so the ST can specify the rite level manually and still use the tradition's pool formula.

---

## Acceptance Criteria

1. The `proc-rite-select-row` renders only the label, dropdown, and (when overridden and `entry.riteName` is short) the short "Player: [name]" override indicator — never a blob of text.
2. If `entry.riteName` is longer than 60 characters (a submission blob), the override indicator is suppressed entirely in the rite selector row.
3. The rite dropdown includes a "Custom" option as the second entry (after "— Select Rite —").
4. When "Custom" is selected, a number input (min 1, max 5, label "Level") appears inline in the `proc-rite-select-row` for the ST to enter the rite level.
5. With "Custom" + a valid level entered, the pool and target block computes using that level and the tradition pool from `TRADITION_POOL[entry.tradition]`.
6. The custom level is saved to `rev.rite_custom_level` via `saveEntryReview` on input change (debounced or on blur).
7. On re-render, if `rev.rite_override === '__custom__'` and `rev.rite_custom_level` is set, the level input is restored and pool/target display is correct.
8. "Rite not found in rules database." message no longer appears when Custom is selected with a valid level.

---

## Tasks / Subtasks

- [x] Task 1: Fix description leak in `proc-rite-select-row` (Bug 1)
  - [x] 1.1–1.2: `shortRiteName` guard added; override indicator only renders when `entry.riteName.length <= 60`

- [x] Task 2: Add "Custom" option to the rite dropdown (Bug 2)
  - [x] 2.1: `Custom…` option added as second entry (value `__custom__`) after Select Rite
  - [x] 2.2–2.3: Level input (`proc-rite-custom-level-input`) renders inline when `selectedRite === '__custom__'`, pre-populated from `rev.rite_custom_level`
  - [x] 2.4: `resolvedRitInfo` built from `TRADITION_POOL[entry.tradition]` + `rev.rite_custom_level` when no DB match and Custom selected
  - [x] 2.5: "Rite not found" message guarded with `selectedRite !== '__custom__'`

- [x] Task 3: Wire custom level input handler
  - [x] 3.1–3.2: `.proc-rite-custom-level-input` change handler saves `rite_custom_level` and re-renders
  - [x] 3.3: Existing rite selector handler saves `sel.value` unchanged — `__custom__` saves automatically

---

## Dev Notes

### Key file

All changes are in `public/js/admin/downtime-views.js` (single-file codebase — no imports).

### Exact locations

| Change | Location |
|--------|----------|
| Bug 1 fix — override indicator guard | Line ~6349 (`if (overridden)` block) |
| Bug 2 — "Custom" option in dropdown | Line ~6329 (after first `<option>`) |
| Bug 2 — custom level input render | Line ~6326 `proc-rite-select-row` block |
| Bug 2 — pool/target block | Lines ~6352–6381 (`if (ritInfo)` block) |
| Bug 2 — wire custom level handler | Line ~4118 (after rite selector forEach) |

### Bug 1 — exact fix

```js
// BEFORE (line ~6349):
if (overridden) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName || '\u2014')}</span>`;

// AFTER:
const shortRiteName = entry.riteName && entry.riteName.length <= 60;
if (overridden && shortRiteName) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName)}</span>`;
```

The 60-char threshold already exists in the `blobRite` logic at line ~5978 — stay consistent with it.

### Bug 2 — Custom option and level input

The `__custom__` sentinel value is stored in `rev.rite_override` (same field as any other override). The custom level is stored separately in `rev.rite_custom_level` (integer 1–5).

Pool/target derivation for Custom:
```js
// selectedRite === '__custom__' path
const customLevel = rev.rite_custom_level || null;
if (customLevel) {
  const pool = TRADITION_POOL[entry.tradition] || null;
  if (pool) {
    // ritInfo shape: { poolExpr, target, attr, skill, disc }
    const fakeRitInfo = {
      attr: pool.attr, skill: pool.skill, disc: pool.disc,
      poolExpr: [pool.attr, pool.skill, pool.disc].filter(Boolean).join(' + '),
      target: customLevel,
    };
    // then use fakeRitInfo exactly as ritInfo in the pool/target display block
  }
}
```

`TRADITION_POOL` is defined at line ~6525:
```js
const TRADITION_POOL = {
  Cruac:             { attr: 'Intelligence', skill: 'Occult',    disc: 'Cruac' },
  'Theban Sorcery':  { attr: 'Resolve',     skill: 'Academics', disc: 'Theban Sorcery' },
  Theban:            { attr: 'Resolve',     skill: 'Academics', disc: 'Theban Sorcery' },
};
```

### Level input placement

The custom level input renders inside `proc-rite-select-row`, after the `</select>` close tag and before the `</div>`. Only show when `selectedRite === '__custom__'`:

```js
if (selectedRite === '__custom__') {
  const lvl = rev.rite_custom_level || '';
  h += `<label class="proc-rite-custom-lbl">Level <input type="number" class="proc-rite-custom-level-input dt-num-input-sm" min="1" max="5" data-proc-key="${esc(key)}" value="${esc(String(lvl))}"></label>`;
}
```

`dt-num-input-sm` is an existing CSS class used on other small number inputs (e.g. `proc-rite-cost-input` line ~5473).

### No test framework

Manual verification only. Completion Notes should describe what to check.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Bug 1: `shortRiteName` check uses `<= 60` chars consistent with `blobRite` threshold elsewhere in the file.
- Bug 2: Pool/target block refactored to use `resolvedRitInfo` (either DB lookup or custom fake) so all downstream rendering (pool calc, target display, Mandragora Garden, equipment mod) works for custom rites without code duplication.
- Verify: open a DT2 CSV sorcery entry — selector row should show no blob text. Select Custom, enter level 3 — pool and target block should appear. Reload — custom level and pool persist.

### File List
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
