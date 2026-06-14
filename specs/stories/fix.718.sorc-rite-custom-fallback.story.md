---
title: 'Sorcery: rites unknown to rules DB should auto-fallback to Custom in processing'
type: 'fix'
issue: 718
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/718
branch: ms/issue-718-sorc-rite-custom-fallback
created: '2026-06-14'
status: done
recommended_model: 'sonnet — two targeted edits in one file; moderate scope'
context:
  - public/js/admin/downtime-views.js
---

## Intent

**Problem:** When a player's `entry.riteName` is not found in `_getRulesDB()` (e.g. "Mantle of Amorous Fire" — in the character's `powers[]` but absent from `purchasable_powers`), the RITE dropdown in DT processing renders with no `selected` option and shows "— Select Rite —". The ST cannot process the action. Clicking Roll immediately alerts "Rite not found in the rules database" and returns.

**Fix:** Two changes in `public/js/admin/downtime-views.js`:

1. **RITE dropdown** — if the resolved rite name is not in `_allRites`, fall back to `'__custom__'` as the effective selected value. The Custom… option already exists in the dropdown; it just needs to be auto-selected.

2. **Roll button handler** — when `riteName === '__custom__'` (set by ST after seeing the auto-selected dropdown), derive the pool from `TRADITION_POOL[entry.tradition]` and use `rev.rite_custom_level` as the success target instead of hard-alerting.

---

## Root cause file

| File | Lines | Role |
|------|-------|------|
| `public/js/admin/downtime-views.js` | 9264–9289 | RITE dropdown build — `_selectedRite` derivation and `__custom__` level input |
| `public/js/admin/downtime-views.js` | 6077–6128 | Roll button click handler — `_getRiteInfo` lookup and `ritInfo` usage |
| `public/js/admin/downtime-views.js` | 10054–10096 | `TRADITION_POOL` constant and `_getRiteInfo()` function |

---

## Current code (verbatim — read before touching)

### Dropdown build (lines 9264–9289)

```js
// ── Sorcery: rite header row ──
if (isSorcery) {
  const _allRites     = (_getRulesDB() || []).filter(r => r.category === 'rite');
  const _selectedRite = rev.rite_override || entry.riteName || '';          // ← BUG: unknown rite → no option matches
  const _overridden   = rev.rite_override && rev.rite_override !== entry.riteName;
  const _shortRite    = entry.riteName && entry.riteName.length <= 60;
  ...
  let _riteOpts = `<option value="">— Select Rite —</option><option value="__custom__"${_selectedRite === '__custom__' ? ' selected' : ''}>Custom…</option>`;
  for (const trad of _tradKeys) {
    const grp = ...;
    _riteOpts += `<optgroup ...>${grp.map(r => `<option value="${esc(r.name)}"${_selectedRite === r.name ? ' selected' : ''}>${esc(r.name)} ...</option>`).join('')}</optgroup>`;
  }
  h += `<select class="proc-rite-select" ...>${_riteOpts}</select>`;
  if (_selectedRite === '__custom__') {
    h += `<label ...>Level <input type="number" class="proc-rite-custom-level-input" ... value="${esc(String(rev.rite_custom_level || ''))}"></label>`;
  }
  if (_overridden && _shortRite) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName)}</span>`;
  ...
}
```

### Roll button handler (lines 6077–6080)

```js
const riteName = rev.rite_override || entry.riteName || '';
const ritInfo  = riteName ? _getRiteInfo(riteName) : null;
if (!ritInfo) { alert(`Rite "${riteName}" not found in the rules database.`); return; }  // ← BUG: hard-fail for __custom__ too
// ...
const base = _computeRitePool(char, ritInfo.attr, ritInfo.skill, ritInfo.disc);
// ...
showRollModal(
  { size: total, expression: `${riteName}: ${poolExpr}`, existingRoll: rev.ritual_roll || null },
  async result => {
    const hit    = result.successes >= ritInfo.target;
    const status = hit ? 'resolved' : 'no_effect';
    ...
  }
);
```

### TRADITION_POOL constant (lines 10054–10059)

```js
const TRADITION_POOL = {
  Cruac:             { attr: 'Intelligence', skill: 'Occult',    disc: 'Cruac' },
  'Theban Sorcery':  { attr: 'Resolve',     skill: 'Academics', disc: 'Theban Sorcery' },
  Theban:            { attr: 'Resolve',     skill: 'Academics', disc: 'Theban Sorcery' },
};
```

---

## Tasks

### T1 — Auto-select `__custom__` in RITE dropdown when rite not in DB [x]

**Location:** lines 9267–9269 in the `if (isSorcery)` dropdown block.

Replace the `_selectedRite` / `_overridden` declarations:

```js
// BEFORE:
const _selectedRite = rev.rite_override || entry.riteName || '';
const _overridden   = rev.rite_override && rev.rite_override !== entry.riteName;
const _shortRite    = entry.riteName && entry.riteName.length <= 60;
```

```js
// AFTER:
const _selectedRiteRaw = rev.rite_override || entry.riteName || '';
const _riteInDB        = _selectedRiteRaw && _selectedRiteRaw !== '__custom__'
                         && _allRites.some(r => r.name === _selectedRiteRaw);
const _selectedRite    = _riteInDB ? _selectedRiteRaw
                         : (_selectedRiteRaw ? '__custom__' : '');
const _overridden      = rev.rite_override && rev.rite_override !== entry.riteName;
const _autoCustom      = !_riteInDB && !!_selectedRiteRaw && _selectedRiteRaw !== '__custom__';
const _shortRite       = entry.riteName && entry.riteName.length <= 60;
```

And update the "Player: …" label line (currently line 9286) to show the label for auto-custom fallback too:

```js
// BEFORE:
if (_overridden && _shortRite) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName)}</span>`;

// AFTER:
if ((_overridden || _autoCustom) && _shortRite) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName)}</span>`;
```

**Effect:** Unknown rite → dropdown shows Custom… selected + Level input + "Player: <rite name>" label. Known rite or explicit `__custom__` override → unchanged behaviour.

---

### T2 — Handle `__custom__` in Roll button handler [x]

**Location:** lines 6077–6080 (inside the Roll button click listener).

Replace the rigid `_getRiteInfo` / alert block with a branching lookup:

```js
// BEFORE:
const riteName = rev.rite_override || entry.riteName || '';
const ritInfo  = riteName ? _getRiteInfo(riteName) : null;
if (!ritInfo) { alert(`Rite "${riteName}" not found in the rules database.`); return; }

// AFTER:
const riteName = rev.rite_override || entry.riteName || '';
let ritInfo    = riteName ? _getRiteInfo(riteName) : null;
if (!ritInfo) {
  const _isCustom = riteName === '__custom__'
    || (riteName && !(_getRulesDB() || []).some(r => r.category === 'rite' && r.name === riteName));
  if (_isCustom) {
    const _trad    = entry.tradition || rev.sorc_tradition || '';
    const _tradPool = TRADITION_POOL[_trad] || null;
    const _level   = parseInt(rev.rite_custom_level || '0', 10);
    if (!_tradPool) { alert('Select a tradition before rolling a custom rite.'); return; }
    if (!_level)    { alert('Set a rite level before rolling a custom rite.'); return; }
    ritInfo = { attr: _tradPool.attr, skill: _tradPool.skill, disc: _tradPool.disc,
                target: _level, poolExpr: [_tradPool.attr, _tradPool.skill, _tradPool.disc].filter(Boolean).join(' + ') };
  } else {
    alert(`Rite "${riteName}" not found in the rules database.`); return;
  }
}
```

**Effect:** When `__custom__` is set (auto or manually), the Roll handler uses `TRADITION_POOL[entry.tradition]` for pool components and `rev.rite_custom_level` for the success threshold. The informative alerts only fire if the ST hasn't yet selected a tradition or set a level — they don't block the common path.

**Note on `riteName` in the modal expression:** `riteName` will be `'__custom__'` when `rev.rite_override === '__custom__'`. The expression shown in the roll modal will read `"__custom__: Intelligence 3 + Occult 2 + Cruac 3 +3 (downtime) = 11"` — workable for now. If a display alias is needed that's a separate cosmetic story.

---

### T3 — QA: write and run Playwright spec [x]

File: `tests/fix-718-sorc-rite-custom-fallback.spec.js`

Use `setupDowntimeProcessing` pattern from `tests/downtime-processing-dt-fixes.spec.js` (lines 305–337). Seed `localStorage('tm_rules_db')` with a rite for the "known rite" test; omit the submission's rite from the DB for the "unknown rite" test.

Test cases required:

| # | Setup | Assertion |
|---|-------|-----------|
| 1 | Rite name NOT in rules DB | `.proc-rite-select` value === `'__custom__'` |
| 2 | Rite name NOT in rules DB, rite ≤60 chars | `.proc-recat-original` visible, contains player's rite name |
| 3 | Rite name NOT in rules DB | `.proc-rite-custom-level-input` visible |
| 4 | Rite name IS in rules DB | `.proc-rite-select` value === rite name (not `__custom__`) |
| 5 | `rev.rite_override === '__custom__'` already saved | `.proc-rite-select` value === `'__custom__'` (unchanged) |

---

## Acceptance criteria

- [x] Given a sorcery submission where `entry.riteName` is not in `_getRulesDB()`, the RITE dropdown in DT processing opens with `__custom__` pre-selected (not "— Select Rite —")
- [x] The "Player: <rite name>" label appears beneath the dropdown for the auto-custom case (same as when ST manually overrides)
- [x] The Level input (`proc-rite-custom-level-input`) appears when the dropdown is on `__custom__`
- [x] Rites that ARE in the rules DB continue to be pre-selected by name as before
- [x] The Roll button, when `__custom__` is selected with a tradition and level set, opens the roll modal without alerting
- [x] If tradition is unset when rolling custom, the informative alert "Select a tradition before rolling a custom rite." fires (not the old hard-fail)
- [x] If level is unset when rolling custom, the informative alert "Set a rite level before rolling a custom rite." fires

---

## Guardrails

- **Only `downtime-views.js`** — no other files touched.
- `_selectedRiteRaw` must preserve the original resolution logic (`rev.rite_override` wins over `entry.riteName`) — don't change override priority.
- The `__custom__` option already exists in the dropdown HTML (line 9274); do not add another one.
- `TRADITION_POOL` is already declared in the same file — reference it directly, don't redeclare.
- Do not auto-save `rite_override = '__custom__'` on render — visual auto-select only. The save happens when the ST changes the dropdown (existing `change` handler already does this).
- `_autoCustom` is only used to gate the "Player: …" label and the Level input display — it is NOT persisted.

---

## Dev Agent Record

### Files changed
- `public/js/admin/downtime-views.js` — T1: replaced `_selectedRite` declaration with `_selectedRiteRaw`/`_riteInDB`/`_selectedRite`/`_autoCustom`; updated "Player:" label guard to `(_overridden || _autoCustom)`. T2: replaced hard `alert` in Roll button with branching custom-rite logic using `TRADITION_POOL`.
- `tests/fix-718-sorc-rite-custom-fallback.spec.js` — 5 Playwright tests covering all ACs

### Completion notes
T1: `_selectedRiteRaw` resolves the raw value (override or player rite). `_riteInDB` checks whether that value exists as a named rite in `_allRites`. `_selectedRite` is `_riteInDB ? raw : (raw ? '__custom__' : '')` — unknown non-empty rite falls back to Custom. `_autoCustom` gates the "Player:" label without persisting anything. T2: Roll handler now branches on `_isCustom` (true when `__custom__` explicit or rite absent from DB), builds `ritInfo` from `TRADITION_POOL[entry.tradition]` + `rite_custom_level`, and returns informative alerts if either is unset. 5/5 Playwright tests pass.
