# Audit — Maintenance Action computation in the DT submission form

> **Conclusion: the inversion Peter observed is real and explainable.** The DT form has *two* Maintenance UIs that consult *two different data sources*. The reminder banner reads `cycle.maintenance_audit[char_id].{pt,mci}` (ST-controlled, past-chapter facts). The chip grid that lets the player pick which merit to maintain reads `getAlreadyMaintainedTargets(...)` — a same-submission deduplication function that ONLY checks "is this merit already selected as a target_value in another project slot of *this* form session". The chip grid never consults `cycle.maintenance_audit`. Therefore: a merit that is genuinely already-maintained-this-chapter (per the audit) is fully clickable in the chip grid, and a merit that is genuinely not-yet-maintained can be greyed if it happens to be selected in a different project slot of the current form. Banner detection is correct; chip-grid affordance is wrong because it consults the wrong data source.

---

## Background

Reported by Peter (Piatra) 2026-05-06 for the live DT form. Yusuf Mammon Kalusicj is the example: the reminder banner correctly fires for Professional Training (PT not yet maintained this chapter) and correctly stays silent on Mystery Cult Initiation (MCI maintained last chapter). But in the chip grid where the player picks a maintenance target, the affordances are **inverted from the detection state** — PT is greyed, MCI is clickable.

In-session task #2 scopes this audit (research only, no rewrite); task #11 / GitHub issue #49 covers the eventual fix once the audit names the cause.

## Methodology

1. Find every site that surfaces "maintenance" in the DT form.
2. For each, identify the data source it consults.
3. Trace the code path that produces the disabled / clickable chip state.
4. Identify the divergence point that produces the inversion.
5. Inventory the fragility surface for the eventual fix story.

All findings verifiable by reading `public/js/tabs/downtime-form.js`, `public/js/tabs/downtime-data.js`, and `public/js/admin/downtime-views.js` at HEAD (`17dd3a5b`).

## Findings

### 1. Two Maintenance UIs, two data sources

There are two distinct UI surfaces for Maintenance in the DT submission form:

| Surface | File:line | Function | Data source consulted |
|---|---|---|---|
| **Reminder banner** at top of Personal Projects | `downtime-form.js:2948` | `renderMaintenanceWarnings(char, cycle)` | `cycle.maintenance_audit[char_id].{pt, mci}` |
| **Chip grid** inside a maintenance project action | `downtime-form.js:4848` | `renderMaintenanceChips(n, saved, charData, alreadyMaintained, prefix)` | `charData.merits` for the chip set, `getAlreadyMaintainedTargets(...)` for the disabled set |

The reminder banner gates on `cycle.is_chapter_finale === true` and renders one strip per merit-type that the audit has not yet ticked:

```js
// downtime-form.js:2948
const audit = cycle.maintenance_audit?.[String(char._id)] || {};
if (hasPT && audit.pt !== true) out.push(maintenanceWarningHtml('Professional Training', null));
if (mciMerits.length && audit.mci !== true) out.push(maintenanceWarningHtml('Mystery Cult Initiation', cults));
```

The chip grid filters the character's merits to `MAINTENANCE_MERITS` and renders one chip per matching merit, with `disabled` driven by an `alreadyMaintained` Set passed in by the caller:

```js
// downtime-form.js:4848
const maintMerits = (charData?.merits || []).filter(m => MAINTENANCE_MERITS.includes(m.name));
// ...
const isDisabled = alreadyMaintained.has(id);
```

The `alreadyMaintained` Set is built by `getAlreadyMaintainedTargets`:

```js
// downtime-form.js:4835
function getAlreadyMaintainedTargets(n, saved, maxSlots) {
  const maintained = new Set();
  for (let k = 1; k <= maxSlots; k++) {
    if (k === n) continue;
    if (saved[`project_${k}_action`] === 'maintenance' && saved[`project_${k}_target_value`]) {
      maintained.add(saved[`project_${k}_target_value`]);
    }
  }
  return maintained;
}
```

This function walks the *current submission's* project slots and returns the Set of `target_value` ids already chosen in *other* slots. It does not consult `cycle.maintenance_audit`. It is purely an anti-double-book guard: "if you're already maintaining this in slot 2, slot 3 should not let you pick it again."

### 2. Why Peter sees the inversion

For Yusuf:

- **Banner: PT reminder fires.** `cycle.maintenance_audit[yusuf_id].pt` is missing or `false` → `audit.pt !== true` → banner renders. Correct.
- **Banner: MCI reminder silent.** `cycle.maintenance_audit[yusuf_id].mci === true` → `audit.mci !== true` is false → banner suppressed. Correct.
- **Chip grid: PT greyed.** Some other project slot in the current form has `action: 'maintenance'` and `target_value: 'Professional Training_<dots>'`. `getAlreadyMaintainedTargets` adds that id to the disabled set → PT chip in the current slot is `disabled`. Anti-double-book working as designed; but unexpectedly hits a merit that the player WANTS to maintain.
- **Chip grid: MCI clickable.** No other slot has `target_value: 'Mystery Cult Initiation_<dots>'` → MCI is not in the disabled set → MCI chip is clickable. The chip grid does not know that `cycle.maintenance_audit.mci === true`, so MCI looks fully available even though no maintenance action is needed for it this chapter.

Both states are *internally consistent* with the chip grid's actual logic. They are *inconsistent with the player's expectation*, which is "the chip grid should show me which merits I should maintain", not "the chip grid should prevent me double-booking the form."

### 3. The audit data source

`cycle.maintenance_audit` is written from the admin side by `setMaintenanceAudit` at `public/js/admin/downtime-views.js:1673`:

```js
async function setMaintenanceAudit(cycle, charId, key, value) {
  const audit = { ...(cycle.maintenance_audit || {}) };
  audit[charId] = { pt: false, mci: false, ...(audit[charId] || {}), [key]: value };
  await updateCycle(cycle._id, { maintenance_audit: audit });
  // ...
}
```

Shape: `cycle.maintenance_audit[char_id] = { pt: boolean, mci: boolean }`. ST flips a checkbox per character per merit-type in the admin Maintenance Audit panel (CHM-2 story); the writer defaults *both* keys to `false` when first touching either, so once the ST has interacted with any cell for a character, both booleans exist on the document.

The admin panel itself (`renderMaintenanceAuditPanel`, `:1682`) gates on `cycle.is_chapter_finale === true` — it only appears at chapter-finale cycles. PT/MCI maintenance is not tracked outside chapter finales.

### 4. Hardcoded merit-type bindings

The audit shape is hardcoded to two specific merits via two specific keys:

- `Professional Training` → `audit.pt`
- `Mystery Cult Initiation` → `audit.mci`

This binding appears in five places:

| File:line | Code |
|---|---|
| `downtime-data.js:110` | `MAINTENANCE_MERITS = ['Professional Training', 'Mystery Cult Initiation']` |
| `downtime-form.js:2955-2963` | Banner branches on PT/MCI by name with separate copy strings |
| `admin/downtime-views.js:1653-1662` | `maintenanceHoldings(c)` returns `{ pt, mci, mciCults }` |
| `admin/downtime-views.js:1675` | `setMaintenanceAudit` defaults `{ pt: false, mci: false, ... }` |
| `admin/downtime-views.js:1698` | Panel renders fixed `<th>PT</th><th>MCI</th>` columns |

Adding a third maintenance-eligible merit type (e.g. *Allies* maintenance per dtui-16; some campaigns track Status maintenance) would require co-ordinated edits at all five sites, plus an audit-shape migration if existing cycle documents need backfilling.

### 5. The MCI cult-name ambiguity

A character can hold multiple Mystery Cult Initiation merits, one per cult, distinguished by `m.cult_name`. The chip grid renders one chip per merit row with id `${m.name}_${dots}`:

```js
// downtime-form.js:4863
const id = `${m.name}_${dots}`;
```

Two MCIs with the same dot rating produce two chips with identical ids. Either:

- The disable-on-already-claimed logic deduplicates them when one is selected (so picking one cult disables the other identically-id'd chip — wrong; they are distinct cults).
- Or both render as separately clickable but the saved `target_value` cannot tell them apart on read-back.

The audit shape compounds this: `audit.mci` is a single boolean for "MCI maintenance done this chapter" — there is no per-cult audit. A character with three MCIs (three cults) cannot record per-cult maintenance.

This is a separable bug from the inversion; flagging here for the eventual fix story to consider scope.

### 6. The fragile-feeling Peter named

Peter's note: *"It seems very fragile."*

The fragility surface, in priority order:

1. **Two data sources for the same concept.** `cycle.maintenance_audit` says "this character has/hasn't maintained X this chapter (per ST)." The chip grid's same-submission dedup says "this character has/hasn't already picked X to maintain in this form session." They do not share a vocabulary. The fix needs to consult both and union them.
2. **Hardcoded `pt`/`mci` keys.** Five sites bind to these specific tokens. Adding any third maintenance merit-type fans out to all five; missing one produces silent wrong behaviour.
3. **`audit` shape lacks per-instance tracking.** A boolean per merit-type per character cannot distinguish per-cult MCI state.
4. **Default-both-false write pattern.** `setMaintenanceAudit` writes `{ pt: false, mci: false, ... }` defaults on first touch. Once the ST clicks any cell, both fields exist on the cycle document for that character. This is benign but means the data shape is non-uniform across characters in a single cycle (touched ones have both keys; untouched ones have no entry).
5. **The chip ID format `${name}_${dots}`** ties chip identity to dot rating. If a character's PT changes dot rating mid-chapter (e.g. xp-spend purchase), an in-flight maintenance selection from before the change has a stale `target_value` that no longer matches any chip. The chip grid would render the new chip as available; the saved selection would be orphaned.

## Recommended fix scope (for issue #49 / task #11)

**Core fix:** the chip grid must consult `cycle.maintenance_audit` and add already-maintained chip ids to the disabled set, in addition to the existing same-submission dedup.

```js
// Sketch — not a final implementation; story #11 owns the actual code
function getAuditMaintained(cycle, char) {
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

// At the call site (line 4960):
const formDedup   = getAlreadyMaintainedTargets(n, saved, 5);
const auditMaint  = getAuditMaintained(currentCycle, currentChar);
const disabled    = new Set([...formDedup, ...auditMaint]);
h += renderMaintenanceChips(n, saved, currentChar, disabled);
```

**Tooltip differentiation:** the existing `title="Maintained this chapter."` should distinguish between the two reasons:
- "Maintained this chapter — no action needed." (audit-derived)
- "Already chosen as a maintenance target in another project slot." (form-dedup)

The existing tooltip text covers neither precisely.

**Out of scope for the fix story:**

- Renaming `pt`/`mci` to per-merit keys.
- Adding per-cult MCI audit tracking.
- Adding new maintenance merit types (e.g. Status maintenance).
- Resolving the dot-rating-changes-mid-chapter chip ID staleness.

These are follow-up issues. The minimal fix to resolve Peter's observed inversion is the audit-set union above; everything else is fragility-reduction that belongs to the per-section epic's Maintenance redesign work.

## References

- `public/js/tabs/downtime-form.js:2948` — `renderMaintenanceWarnings` (banner)
- `public/js/tabs/downtime-form.js:4835` — `getAlreadyMaintainedTargets` (current dedup, source of bug)
- `public/js/tabs/downtime-form.js:4848` — `renderMaintenanceChips` (chip grid)
- `public/js/tabs/downtime-form.js:4960` — chip grid call site
- `public/js/tabs/downtime-data.js:110` — `MAINTENANCE_MERITS` source of truth
- `public/js/admin/downtime-views.js:1649-1705` — admin-side audit panel + writer
- `specs/stories/chm-1-chapter-finale-fields.story.md` — `is_chapter_finale` introduction
- `specs/stories/chm-2-maintenance-audit-panel.story.md` — admin audit panel
- `specs/stories/chm-3-player-at-risk-warning.story.md` — banner introduction
- GitHub issue [#49](https://github.com/angelusvmorningstar/terramortis/issues/49) — fix lives here
- In-session task #11 — pickup ladder
