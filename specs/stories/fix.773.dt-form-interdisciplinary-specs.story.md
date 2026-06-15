---
title: 'DT form: interdisciplinary specialisations missing from project dice pool spec chips'
type: 'fix'
issue: 773
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/773
branch: morningstar-issue-773-dt-form-interdisciplinary-specs
created: '2026-06-16'
status: review
recommended_model: 'haiku — one call site, pattern already established in the same file'
context:
  - public/js/tabs/downtime-form.js
  - public/js/data/helpers.js
---

## Intent

When a player adds a project action in the DT form, the spec chip row for the
dice pool only shows specs from the selected skill's `specs[]` array.
Interdisciplinary Specialty merits (e.g. Coward Punch) are silently omitted
because the `isSpecs()` helper is never called at this render site.

Fix: merge native skill specs with interdisciplinary specs at line 3955,
following the identical pattern already used by the feeding pool (line 5453)
and skill-acquisition (line 5164) sections in the same file.

---

## Root cause

`renderProjectPoolBuilder()` at `downtime-form.js:3955`:

```js
const bestSpecs = savedSkill ? (currentChar.skills?.[savedSkill]?.specs || []) : [];
```

`isSpecs(currentChar)` — which resolves Interdisciplinary Specialty merits from
`c.merits[]` — is never called here. Two other spec-chip render sites in the
same file already call it:

| Site | Lines | Pattern |
|------|-------|---------|
| Skill-acquisition pool | 5164–5168 | `isSpecs(c).filter(...)` unconditional |
| Feeding pool | 5453–5454 | `isSpecs(c)` gated on `selSkill` |

`isSpecs` is already imported at line 14. No new import needed.

### `isSpecs()` reference (`public/js/data/helpers.js:249-264`)

```js
export function isSpecs(c) {
  const results = [];
  for (const m of (c.merits || [])) {
    if (m.name?.toLowerCase() !== 'interdisciplinary specialty') continue;
    const q = m.qualifier || '';
    if (!q) continue;
    let fromSkill = null;
    for (const [skillName, so] of Object.entries(c.skills || {})) {
      if ((so.specs || []).some(s => s.toLowerCase() === q.toLowerCase())) {
        fromSkill = skillName;
        break;
      }
    }
    if (fromSkill) results.push({ spec: q, fromSkill });
  }
  return results;
}
```

Returns `{ spec: string, fromSkill: string }[]`.

---

## Fix

### T1 — Merge interdisciplinary specs into `bestSpecs`

**File:** `public/js/tabs/downtime-form.js`

**Line 3955 — BEFORE:**

```js
const bestSpecs  = savedSkill ? (currentChar.skills?.[savedSkill]?.specs || []) : [];
```

**AFTER:**

```js
const nativeSpecs = savedSkill ? (currentChar.skills?.[savedSkill]?.specs || []) : [];
const isSpecsList  = savedSkill ? isSpecs(currentChar).filter(({ spec }) => !nativeSpecs.includes(spec)) : [];
const bestSpecs    = [...nativeSpecs, ...isSpecsList.map(s => s.spec)];
```

**Why gate `isSpecsList` on `savedSkill`?**
The spec bonus only applies when a skill is in the pool — gating matches the
feeding pool precedent (line 5453) and keeps `bestSpecs` empty (and the chip
row hidden) when no skill is selected. The `savedSkill &&` guard on the chip
row display at line 4010 remains valid because `bestSpecs` is empty when
`savedSkill` is falsy.

**No other lines change.** The chip render loop at lines 4013-4016 already
iterates `for (const sp of bestSpecs)` over a string array — this is still
correct. The total calculation at line 3962 (`bestSpecs.includes(savedSpec)`)
is still correct.

---

## Acceptance criteria

- [ ] Charlie adds a project action (Ambience increase) with any skill in the
  dice pool — Coward Punch chip appears in the Specialisation row
- [ ] Coward Punch chip appears regardless of which specific skill is selected
- [ ] Clicking Coward Punch adds +1 to the pool total (or +2 if AoE applies);
  clicking again deselects and removes the bonus
- [ ] Native skill specs (e.g. Light Weapons, Weapon & Shield) still appear
  alongside Coward Punch when Weaponry is selected — no deduplication bug
- [ ] Characters without Interdisciplinary Specialty merits see no change in
  their spec chip behaviour

---

## Guardrails

- Only `public/js/tabs/downtime-form.js` changes. No other files.
- Do NOT refactor the chip render loop at lines 4013-4016 to use the richer
  `{ sp, fromSkill }` object shape (as feeding pool does). Keep `bestSpecs` as
  a flat string array — the loop is clean and the `fromSkill` label is
  unnecessary noise for the project pool.
- Do NOT touch the feeding pool (lines 5450-5465) or skill-acq (lines 5164-5168)
  — they already work correctly and this story is not their scope.
- `isSpecs` is already imported at line 14 — no import change needed.

---

## Dev Agent Record

### Files changed

- `public/js/tabs/downtime-form.js` — line 3955: replaced single-line `bestSpecs` with 3-line merge that calls `isSpecs(currentChar)` and appends interdisciplinary specs to native skill specs
- `tests/fix-773-dt-form-interdisciplinary-specs.spec.js` — 5 Playwright tests, all passing

### Completion notes

Single call-site change at `downtime-form.js:3955`. `isSpecs()` was already imported (line 14) and already used correctly at lines 5164-5168 (skill-acq) and 5453-5454 (feeding pool) — this was purely a missing call at the project pool render site. The fix follows the feeding pool pattern: `isSpecs()` is gated on `savedSkill` so interdisciplinary specs only show when a skill is active in the pool (consistent with other pool sites). The chip render loop at lines 4013-4016 required no changes — `bestSpecs` remains a flat string array. 5/5 Playwright tests passing: IS spec appears with Weaponry, native specs coexist, chip click adds +1 to total, IS spec persists when skill changes to Occult, regression guard for characters without IS merit.
