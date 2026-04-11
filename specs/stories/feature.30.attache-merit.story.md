# Story feature.30: Attaché Merit — Per-Retainer Invictus Status Grant Pools

## Status: ready-for-dev

## Story

**As an** ST,
**I want** each Retainer belonging to a character with the Attaché merit to independently grant free dots in Contacts, Resources, or Safe Place equal to the character's Invictus Status,
**so that** Invictus characters with multiple retainers can accurately track which merits each retainer is funding.

## Background

The Attaché merit is an Invictus benefit. When the character holds it, each of their purchased Retainers gains an independent grant pool equal to the character's Invictus Status rating. The ST allocates those dots — per retainer — across new or existing Contacts, Resources, and Safe Place entries.

This is distinct from the Invested grant pool (`free_inv`) which is a single global pool across Herd/Mentor/Resources/Retainer. Attaché is granular: each Retainer has its own pool, each child merit entry can only be funded by one retainer, and the ST must see clearly which retainer funds which merit.

**Reference character: René St. Dominique** (hypothetical state post-implementation)
- Invictus Status 4, Attaché merit
- 4 × 1-dot Retainers (labelled A1, A2, A3, A4)
- Each retainer pool = 4 dots
- A1 → 1 × Safe Place (rating 4)
- A2 → 4 × Safe Place (rating 1 each)
- A3 → 4 × Safe Place (rating 1 each)
- A4 → 4 × Safe Place (rating 1 each)
- Total: 13 new merit entries, all with `free_attache: N` and `retainer_source: 'A1'|'A2'|'A3'|'A4'`

---

## Design Decisions (resolved)

1. **Trigger**: Attaché is a distinct buyable merit (`name: 'Attaché'`, `category: 'general'`). Not automatic — same pattern as Invested / Lorekeeper.
2. **New field `free_attache`** (not overloading `free_pet`): K-9/Falconry already use `free_pet` to grant +1 dot to a Retainer merit itself. Attaché grants go to *child* merits (Contacts/Resources/Safe Place). A distinct field avoids semantic confusion and total-calc surprises.
3. **Per-retainer stable keys**: Each purchased Retainer (no `granted_by`) gets an `attache_key` (e.g. `'A1'`, `'A2'`) assigned at first `applyDerivedMerits` run after Attaché is added. Keys are stable: adding/reordering merits does not reassign them.
4. **`retainer_source` on child merits**: Each Contacts/Resources/Safe Place merit that receives Attaché dots stores `retainer_source: 'A1'` alongside `free_attache: N`.
5. **Partial spend allowed**: Pool can be partially spent. No error for unspent dots — only a yellow warning badge on over-spent pools.
6. **No per-merit cap**: All pool dots may go to a single merit (e.g. a 4-dot Safe Place from one retainer with Invictus Status 4).
7. **Only purchased Retainers**: Retainers with a `granted_by` value (K-9, Falconry) do NOT receive an `attache_key`. Only `m.name === 'Retainer' && !m.granted_by`.

---

## Data Model

### New field: `free_attache` (number, default 0)
Sits alongside `cp`, `xp`, `free_mci`, `free_inv`, etc. on a merit object.
Added to the total calculation wherever all free_* fields are summed.

### New field: `retainer_source` (string | undefined)
Set on a child merit (Contacts, Resources, Safe Place) to record which `attache_key` is funding its `free_attache` dots. Cleared when `free_attache` is set to 0.

### New field: `attache_key` (string | undefined)
Set on a Retainer merit. Auto-assigned in `applyDerivedMerits` when Attaché is present. Format: `'A1'`, `'A2'`, `'A3'`, etc. Assigned in order of position among purchased Retainers (those without `granted_by`). Keys persist; a Retainer that already has one keeps it.

### Schema additions (if `character.schema.js` is validated server-side):
Add `free_attache`, `retainer_source`, and `attache_key` as allowed optional fields. Flag for Peter to approve.

---

## Files to Change

### 1. `public/js/editor/domain.js`

Add three new exported helpers after `investedUsed`:

```js
/** Check if character has the Attaché merit. */
export function hasAttache(c) {
  return (c.merits || []).some(m => m.name === 'Attaché');
}

/** Attaché pool per retainer = Invictus Status. */
export function attachePool(c) {
  if (!hasAttache(c)) return 0;
  return (c.status || {}).covenant || 0;
}

/** Count Attaché free_attache dots allocated from a specific retainer key. */
export function attacheUsed(c, attacheKey) {
  let total = 0;
  (c.merits || []).forEach(m => {
    if (m.retainer_source === attacheKey) total += (m.free_attache || 0);
  });
  return total;
}
```

Note: `c.status.covenant` is the Invictus Status numeric rating (same source as `investedPool`).

---

### 2. `public/js/editor/mci.js`

**Import** `hasAttache`, `attachePool` from `./domain.js`.

**Add clear pass** at the start of `applyDerivedMerits` (alongside the existing `free_mdb = 0` clear):
```js
// ── Attaché: clear stale free_attache before re-applying ──
(c.merits || []).forEach(m => { m.free_attache = 0; });
```

Wait — actually `free_attache` should NOT be cleared and re-applied automatically. Unlike MDB or bloodline grants (which are fully automatic), Attaché grants are ST-allocated. `applyDerivedMerits` should only:
1. Assign `attache_key` to any Retainer that lacks one (auto-numbering)
2. NOT clear or overwrite `free_attache` values the ST has set

**Add attache_key assignment block** (after the K-9/Falconry block, before PT grants):
```js
// ── Attaché: assign stable attache_key to purchased Retainers ──
if (hasAttache(c)) {
  let keyIdx = 1;
  (c.merits || []).forEach(m => {
    if (m.name !== 'Retainer' || m.granted_by) return;
    if (!m.attache_key) m.attache_key = 'A' + keyIdx;
    keyIdx++;
  });
} else {
  // Attaché removed — clear all attache keys and free_attache allocations
  (c.merits || []).forEach(m => {
    delete m.attache_key;
    m.free_attache = 0;
    delete m.retainer_source;
  });
}
```

The "else" cleanup ensures that if Attaché merit is removed, all derived state is cleaned up.

---

### 3. `public/js/editor/xp.js` — `meritBdRow`

**Add `free_attache`** to the running total in `meritBdRow`:
```js
const fsw = mc.free_sw || 0, fatt = mc.free_attache || 0;
const total = cp + xp + fbl + fret + fmci + fvm + flk + fohm + finv + fpt + fmdb + fsw + fatt;
```

Note: `free_sw` may already be in this line (check current state). Add `fatt` the same way.

**Add `showAttache` rendering** in `meritBdRow` opts:
```js
// opts.showAttache = { keys: ['A1','A2','A3'], pool: 4 }
if (opts.showAttache) {
  const { keys } = opts.showAttache;
  const curKey = mc.retainer_source || '';
  const curDots = mc.free_attache || 0;
  h += '<div class="bd-grp bd-attache-grp">'
    + '<span class="bd-lbl bd-bonus-lbl">Att</span>'
    + '<select class="merit-bd-select" onchange="shEditMeritAttache(' + realIdx + ',this.value,' + curDots + ')">'
    + '<option value="">—</option>'
    + keys.map(k => '<option value="' + k + '"' + (curKey === k ? ' selected' : '') + '>' + k + '</option>').join('')
    + '</select>'
    + '<input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + curDots + '" onchange="shEditMeritAttache(' + realIdx + ',\'' + (curKey || '') + '\',+this.value)">'
    + '</div>';
}
```

The `shEditMeritAttache(realIdx, key, dots)` function sets both `free_attache` and `retainer_source` atomically (see edit-domain.js below). Changing the dropdown with 0 dots is fine — changing to empty key clears both fields.

---

### 4. `public/js/editor/edit-domain.js`

Add new exported function after `shEditMCIDot`:

```js
export function shEditMeritAttache(realIdx, retainerKey, dots) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const m = (c.merits || [])[realIdx];
  if (!m) return;
  m.free_attache = dots || 0;
  if (!retainerKey || dots <= 0) {
    m.free_attache = 0;
    delete m.retainer_source;
  } else {
    m.retainer_source = retainerKey;
  }
  _markDirty();
  _renderSheet(c);
}
```

Wire through `edit.js` (import + re-export) and both `app.js` and `admin.js` (import + window assignment), following the exact same pattern as `shEditMCIDot`.

---

### 5. `public/js/editor/sheet.js`

#### A. `_derivedNotes(m)` — add `free_attache` line

Current last line of `_n(...)` calls:
```js
+ _n(m.free_sw, 'Safe Word', 'removed if oath is removed');
```

Add after:
```js
+ (m.free_attache ? '<div style="' + _DN + '">Attaché (' + (m.retainer_source || '?') + '): +' + m.free_attache + ' dot' + (m.free_attache !== 1 ? 's' : '') + ' (auto) \u2014 removed if retainer removed</div>' : '');
```

This intentionally does NOT use the generic `_n()` helper because the label must include the retainer key (A1, A2, etc).

#### B. Influence merits section (`shRenderInfluenceMerits`) — show Attaché pool on Retainer, and Attaché input on Contacts/Resources

Import `hasAttache`, `attachePool`, `attacheUsed` from `./domain.js` (add to existing domain.js import at top of sheet.js).

In the influence edit block, before the `nonContacts.forEach` loop, add:
```js
const _hasAttache = hasAttache(c);
const _attachePool = attachePool(c);
const _attacheKeys = _hasAttache
  ? (c.merits || []).filter(m => m.name === 'Retainer' && !m.granted_by && m.attache_key).map(m => m.attache_key)
  : [];
```

**Retainer edit block** — after `meritBdRow`, if this Retainer has an `attache_key`:
```js
if (_hasAttache && m.attache_key) {
  const used = attacheUsed(c, m.attache_key);
  const over = used > _attachePool;
  h += '<div class="attache-pool-row"'
    + (over ? ' style="color:var(--crim)"' : ' style="color:var(--gold2)"')
    + '>Attaché (' + m.attache_key + '): '
    + used + ' / ' + _attachePool + ' dots</div>';
}
```

**Contacts edit block** — pass `showAttache` to meritBdRow:
```js
meritBdRow(cIdx, contactsEntry, meritFixedRating(contactsEntry.name), {
  showMCI: _inflMciPool > 0,
  showAttache: _hasAttache && _attacheKeys.length ? { keys: _attacheKeys } : null,
})
```

**Resources + other eligible influence merits** (within `nonContacts.forEach`):
```js
const _attacheEligible = _hasAttache && _attacheKeys.length && m.name === 'Resources';
meritBdRow(rIdx, m, meritFixedRating(m.name), {
  showMCI: _inflMciPool > 0,
  showVM: ...,
  showLK: ...,
  showINV: ...,
  showAttache: _attacheEligible ? { keys: _attacheKeys } : null,
})
```

#### C. General merits section (`shRenderGeneralMerits`) — Attaché input on Safe Place

Import `hasAttache`, `attachePool`, `attacheUsed` already imported (shared with influence section).

In the general merits `oM.forEach` block, identify Safe Place:
```js
const _isSafePlaceAttache = _hasAttache && _attacheKeys.length && m.name === 'Safe Place';
```

Pass to `meritBdRow`:
```js
meritBdRow(rIdx, m, meritFixedRating(m.name), {
  showMCI: _genMciPool > 0,
  showAttache: _isSafePlaceAttache ? { keys: _attacheKeys } : null,
})
```

Where `_hasAttache` and `_attacheKeys` are computed once above the `oM.forEach` loop (same pattern as the influence section).

#### D. `dd` calculations — add `free_attache`

Every place in `sheet.js` that computes `dd` (the total dot count for a merit) sums all `free_*` fields:
```js
const dd = (m.cp||0) + (m.free_bloodline||0) + (m.free_pet||0) + ... + (m.free_sw||0)
```

Add `+ (m.free_attache||0)` to ALL such sums. There are approximately 4-5 locations:
- Line ~657: influence merit dd
- Line ~955: general merit dd
- Line ~688: influence view-mode `iBon`
- Line ~958: general view-mode `bon`
- Any others — grep for `free_sw` to find all dd computations

---

### 6. `public/js/data/audit.js`

Add a per-retainer pool validation block after the PT block:

```js
// ── Attaché per-retainer pool validation ──
if ((c.merits || []).some(m => m.name === 'Attaché')) {
  const statusDots = (c.status || {}).covenant || 0;
  const purchasedRetainers = (c.merits || []).filter(m => m.name === 'Retainer' && !m.granted_by && m.attache_key);
  for (const ret of purchasedRetainers) {
    const used = (c.merits || []).filter(m => m.retainer_source === ret.attache_key).reduce((s, m) => s + (m.free_attache || 0), 0);
    if (used > statusDots) {
      errors.push({
        gate: 'attache_over',
        message: `Retainer ${ret.attache_key} (Attaché) over-allocated: ${used} / ${statusDots} dots`,
        detail: { key: ret.attache_key, used, pool: statusDots },
      });
    }
  }
}
```

---

### 7. `public/js/data/constants.js` — MERITS_DB

Check if `'Attaché'` already has an entry. If not, add it (find the right alphabetical position in the general merits block):

```js
{ name: 'Attaché', category: 'general', type: 'Invictus Oath',
  description: 'Each of your Retainers gains a number of free dots in Contacts, Resources, or Safe Place equal to your Invictus Status rating.',
  min: 1, max: 1, fixed: true },
```

Attaché is a fixed 1-dot merit — `fixed: true, min: 1, max: 1`. You either have it or you don't. The Retainer merit itself remains a standard variable 1–5 dot merit; Attaché unlocks a secondary benefit from each Retainer entry the character holds.

---

## Acceptance Criteria

1. Character with Attaché merit + 3 Retainers (no `granted_by`) + Invictus Status 3: each Retainer gets `attache_key` A1/A2/A3 after save.
2. In edit mode, each Retainer's row shows "Attaché (A1): 0 / 3 dots" in gold.
3. In edit mode, a Contacts, Resources, or Safe Place merit shows an "Att" dropdown (A1/A2/A3) + dots input in its `meritBdRow`.
4. Setting A1 + 3 dots on a Safe Place: `free_attache: 3`, `retainer_source: 'A1'`; Retainer A1 row shows "3 / 3 dots".
5. Setting 4 dots on A1 when pool is 3: audit error "Retainer A1 (Attaché) over-allocated: 4 / 3 dots".
6. `_derivedNotes` under the Safe Place shows: "Attaché (A1): +3 dots (auto) — removed if retainer removed" in gold.
7. View mode `shDotsMixed`: a Safe Place with `cp: 0, free_attache: 3` displays `○○○`.
8. Removing the Attaché merit: all `attache_key`, `free_attache`, `retainer_source` fields are cleared.
9. K-9-granted Retainers are NOT assigned `attache_key` and do NOT show Attaché pool rows.

---

## Rollout Note

René St. Dominique does not currently have Attaché in the DB. Once implemented, the ST will add the merit via the sheet editor and manually configure allocations. No data migration needed.

---

## Open Questions

- **Attaché merit rating**: Confirmed fixed at 1 dot. Retainer itself stays 1–5 as normal.
- **server/models/character.schema.js**: Peter to confirm whether `free_attache`, `retainer_source`, `attache_key` need to be added to the Mongoose schema to avoid "additional properties" save errors.

---

## Files Changed

- `public/js/editor/domain.js` — `hasAttache`, `attachePool`, `attacheUsed`
- `public/js/editor/mci.js` — `attache_key` assignment in `applyDerivedMerits`
- `public/js/editor/xp.js` — `free_attache` in `meritBdRow` total + `showAttache` opt
- `public/js/editor/edit-domain.js` — `shEditMeritAttache`
- `public/js/editor/edit.js` — import + re-export `shEditMeritAttache`
- `public/js/editor/sheet.js` — `_derivedNotes`, influence + general merit edit UI, `dd` sums
- `public/js/app.js` — import + window `shEditMeritAttache`
- `public/js/admin.js` — import + window `shEditMeritAttache`
- `public/js/data/audit.js` — per-retainer pool validation
- `public/js/data/constants.js` — MERITS_DB entry for Attaché (if not present)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored | Claude (SM) |
