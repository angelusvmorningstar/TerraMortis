# Story fix.56: XP picker — expand multi-instance merits to per-qualifier options

**Story ID:** fix.56
**Epic:** Fixes
**Issue:** 347
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/347
**Branch:** ms/issue-347-xp-spend-multi-instance-merits
**Status:** review
**Date:** 2026-05-18

---

## User Story

As a player filling in the XP Spend section, I want each instance of a multi-qualifier merit (e.g. Allies (Finance) and Allies (Media)) to appear as a separate option in the picker, so I can target the correct instance and the ST knows which one I am raising.

---

## Background

The XP Spend picker is a dropdown inside each project slot when the action is set to "xp_spend". It is rendered by `renderXpPickerItems()` in `downtime-form.js` (the `'merit'` case, lines 3948–4006). For each merit rule, the function calls `currentMeritDots(name)`, which finds all character merits with a matching name and returns the highest effective rating — losing qualifier information. A character with Allies (Finance) ●●● and Allies (Media) ●● sees one option: "Allies (currently 3 dots)".

The fix is entirely inside `renderXpPickerItems()`. No other function needs changing.

---

## Data shapes — read this carefully

### Character merit object

```js
{
  name: 'Allies',
  qualifier: 'Finance',   // or: area: 'Finance' (influence merits use 'area')
  rating: 3,
  bonus: 0,
  category: 'influence',
  // ...
}
```

Both `qualifier` and `area` are used interchangeably in influence merits (legacy). Always check `m.qualifier || m.area`.

### Picker item value format (pipe-delimited)

```
"<name>|<type>|<arg1>|<arg2>"
```

- Flat merit:  `"Common Sense|flat|1|0"` (arg1 = total dots, arg2 = unused)
- Graduated:   `"Allies|grad|3|3"` (arg1 = currentDots, arg2 = maxTarget)

**Critical**: `renderXpRow()` and `getRowCost()` split on `|` and read `parts[1]`, `parts[2]`, `parts[3]`. The name (parts[0]) can contain spaces and parentheses — it is never split further. So encoding the qualifier into the name is safe:

```
"Allies (Finance)|grad|3|3"
→ parts[0] = "Allies (Finance)"
→ parts[1] = "grad"          ← still works in renderXpRow + getRowCost
→ parts[2] = "3"             ← currentDots
→ parts[3] = "3"             ← maxTarget
```

### Persisted row shape (in `project_N_xp_rows` JSON)

```js
{ category: 'merit', item: 'Allies (Finance)|grad|3|3', dotsBuying: 1, xpCost: 1 }
```

The ST processing panel at `downtime-views.js:1583–1586` renders each row as:
```
merit: Allies (Finance)|grad|3|3 (1 dots)
```
That is readable as-is. No change needed in `downtime-views.js`.

### Note on issue body error

The issue body says the qualifier should be encoded in `project_N_xp_trait`. This is wrong — `xp_trait` is the in-character justification textarea (line 4207), completely separate from the picker. The qualifier is encoded in `row.item` within `project_N_xp_rows`. The ST and story builder read the latter.

---

## Acceptance Criteria

- [ ] A character with Allies (Finance) 3 and Allies (Media) 2 sees two separate options in the picker: "Allies — Finance (currently 3 dots)" and "Allies — Media (currently 2 dots)"
- [ ] A character with Status (City) and Status (Covenant) sees both as separate options
- [ ] A "new qualifier" option exists for any multi-instance-eligible merit, labelled "Allies — new qualifier (purchase new instance)"
- [ ] Single-instance merits with no qualifier (e.g. Common Sense, Resources) are unaffected
- [ ] The saved `row.item` in `project_N_xp_rows` encodes the qualifier: `"Allies (Finance)|grad|3|3"`
- [ ] Cost calculation (`getRowCost`) is unchanged — still reads `parts[1]` correctly
- [ ] Dots selector in `renderXpRow` is unchanged — still reads `parts[2]`/`parts[3]` correctly

---

## Implementation

Single location: `renderXpPickerItems()` merit case in `public/js/tabs/downtime-form.js`, lines 3948–4006.

### Step 1 — Remove the `currentMeritDots` inner function (lines 3951–3956)

It is replaced by direct instance lookups below. Delete it entirely.

### Step 2 — Replace the merit loop body

**Current loop** (lines 3977–4005):
```js
for (const rule of meritRules) {
  if (rule.parent && ['Style', 'Invictus Oath', 'Carthian Law'].includes(rule.parent)) continue;
  if (rule.sub_category === 'standing') continue;
  if (!meetsPrereq(c, rule.prereq)) continue;
  const name = rule.name;
  const rr = rule.rating_range;
  const min = rr ? rr[0] : 1;
  const max = rr ? rr[1] : 1;
  const currentDots = currentMeritDots(name);
  if (currentDots >= max) continue;
  if (isMeritExcluded(c, name) && currentDots === 0) continue;

  if (min === max) {
    items.push({
      value: `${name}|flat|${max}|0`,
      label: `${name} (${max} dots, ${max} XP) — all at once`,
    });
  } else {
    const maxTarget = currentDots < 3
      ? Math.min(3, max)
      : Math.min(currentDots + 1, max);
    items.push({
      value: `${name}|grad|${currentDots}|${maxTarget}`,
      label: `${name} (currently ${currentDots} dot${currentDots !== 1 ? 's' : ''})`,
    });
  }
}
```

**Replace with:**
```js
for (const rule of meritRules) {
  if (rule.parent && ['Style', 'Invictus Oath', 'Carthian Law'].includes(rule.parent)) continue;
  if (rule.sub_category === 'standing') continue;
  if (!meetsPrereq(c, rule.prereq)) continue;
  const name = rule.name;
  const rr = rule.rating_range;
  const min = rr ? rr[0] : 1;
  const max = rr ? rr[1] : 1;

  const ownedInstances = charMerits.filter(m =>
    m.name && m.name.toLowerCase() === name.toLowerCase()
  );

  // Multi-instance: character owns >1 instance, OR owns 1 with a qualifier/area
  const isMultiInstance = ownedInstances.length > 1 ||
    (ownedInstances.length === 1 && !!(ownedInstances[0].qualifier || ownedInstances[0].area));

  if (isMultiInstance) {
    for (const m of ownedInstances) {
      const qual = m.qualifier || m.area || '';
      const dots = meritEffectiveRating(c, m);
      if (dots >= max) continue;
      const encodedName = qual ? `${name} (${qual})` : name;
      const maxTarget = dots < 3 ? Math.min(3, max) : Math.min(dots + 1, max);
      items.push({
        value: `${encodedName}|grad|${dots}|${maxTarget}`,
        label: `${name}${qual ? ` — ${qual}` : ''} (currently ${dots} dot${dots !== 1 ? 's' : ''})`,
      });
    }
    if (!isMeritExcluded(c, name)) {
      items.push({
        value: `${name} (new qualifier)|grad|0|${Math.min(3, max)}`,
        label: `${name} — new qualifier (purchase new instance)`,
      });
    }
  } else {
    const currentDots = ownedInstances.length ? meritEffectiveRating(c, ownedInstances[0]) : 0;
    if (currentDots >= max) continue;
    if (isMeritExcluded(c, name) && currentDots === 0) continue;
    if (min === max) {
      items.push({
        value: `${name}|flat|${max}|0`,
        label: `${name} (${max} dots, ${max} XP) — all at once`,
      });
    } else {
      const maxTarget = currentDots < 3
        ? Math.min(3, max)
        : Math.min(currentDots + 1, max);
      items.push({
        value: `${name}|grad|${currentDots}|${maxTarget}`,
        label: `${name} (currently ${currentDots} dot${currentDots !== 1 ? 's' : ''})`,
      });
    }
  }
}
```

---

## What Must Not Change

- `renderXpRow()` — no changes; it reads `parts[1..3]` which still works with `"Allies (Finance)|grad|3|3"`
- `getRowCost()` — no changes; same reason
- `project_N_xp_rows` key name — unchanged
- `project_N_xp_trait` — untouched (this is the justification textarea, not the picker)
- `isMeritExcluded`, `meetsPrereq`, `meritEffectiveRating` — called identically, no signature changes
- All existing comment blocks in the merit case (lines 3958–3974) — leave in place
- The `items.sort()` call at line 4007 — leave in place; multi-instance options sort naturally alongside others

---

## Verification

1. Open the DT form for a character with two Allies instances (e.g. Allies (Finance) 3 and Allies (Media) 2).
2. Set a project slot to "XP Spend" → category "Merit".
3. Confirm the item dropdown shows: "Allies — Finance (currently 3 dots)", "Allies — Media (currently 2 dots)", and "Allies — new qualifier (purchase new instance)".
4. Select one instance, choose dots, save — reload and confirm the selection persists.
5. Open for a character with a single unqualified merit (e.g. Resources ●●) — confirm it shows the single option as before.
6. Open for a character with no Allies — confirm only "Allies — new qualifier" does NOT appear (because `isMeritExcluded` or no owned instance with qualifier means it falls through the single-instance path with currentDots=0).

> Note on step 6: the "new qualifier" option only renders inside the `isMultiInstance` branch, which requires the character to already own at least one qualifier instance. A character with zero Allies still falls through to the single-instance path (currentDots=0, shows generic "Allies (currently 0 dots)" if not excluded). This is correct — the "new instance" affordance is for players who already own one qualifier and want to open a second sphere.

---

## Dev Agent Record

**Implemented:** 2026-05-18

Removed `currentMeritDots` inner function (was keyed on name only, losing qualifier). Replaced single-option-per-rule loop body with two paths: multi-instance (owned >1 or owned 1 with qualifier/area) emits one option per owned instance with qualifier encoded in `parts[0]` of the pipe-delimited value, plus a "new qualifier" sentinel option; single-instance falls through to the original behaviour unchanged. `renderXpRow`, `getRowCost`, and all persistence keys are unaffected.

**Files modified:**
- `public/js/tabs/downtime-form.js` — `renderXpPickerItems()` merit case, lines 3948–4027

---

## Scope Notes

- **In scope**: `renderXpPickerItems()` merit loop only; `currentMeritDots` inner function removal
- **Out of scope**: `renderXpRow()`, `getRowCost()`, `downtime-views.js`, `downtime-story.js`, any processing or display of XP rows on the ST side
