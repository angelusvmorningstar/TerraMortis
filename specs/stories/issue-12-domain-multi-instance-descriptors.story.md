# Story issue-12: Domain Merits — Multi-instance Safe Place / Feeding Grounds, Haven + Mandragora Garden cap system

Status: review

issue: 12
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/12
branch: morningstar-issue-12-domain-multi-instance-descriptors

---

## Story

As a Storyteller editing a character's domain section,
I want Safe Place and Feeding Grounds to support multiple instances with distinct free-text descriptors,
and Haven and Mandragora Garden to be capped by their attached Safe Place's effective rating,
so that the domain model accurately reflects multi-property coterie resources and architectural constraints.

---

## Background and Current State

**What the domain system does today (read before touching anything):**

Domain merits (`category: 'domain'`) are stored in `c.merits[]` alongside influence, general, and standing merits. The five domain types are `['Safe Place','Haven','Feeding Grounds','Herd','Mandragora Garden']` (`constants.js:125`).

**Current singleton assumption:**
Every helper in `public/js/editor/domain.js` finds a merit with `Array.find()` by name:
```js
const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
```
This means if a character has two `Safe Place` entries, the second is silently invisible to all helpers.

**Key helpers to understand:**
- `domMeritContrib(c, name)` → this char's own dots on one domain merit (cp + free_* + xp)
- `domMeritShareable(c, name)` → dots this char contributes to a shared pool (cp + free + xp, no auto-bonuses)
- `domMeritTotal(c, name)` → effective total = own + partners' dots, capped at 5 (Herd can exceed 5 via Flock)
- `domMeritAccess(c, name)` → prereq check helper — own total or any partner who shares with this char
- `meritEffectiveRating(c, m)` → canonical effective rating for a merit instance; for shared domain merits delegates to `domMeritTotal(c, m.name)`

**Existing patterns to reuse (DO NOT reinvent):**
- `attached_to` field on influence merits (Attaché linking to Contacts/Resources/Safe Place) — `edit-domain.js:48`, `sheet.js:813–818`
- `qualifier` field on merit objects — set by `shEditDomMerit(idx, 'qualifier', val)` in `edit-domain.js:299`; also used by general merits in the `_FREE_TEXT_QUAL` set (`sheet.js:1173`)
- Partner sharing via `m.shared_with = [characterName, ...]` — see `shAddDomainPartner` in `edit-domain.js:324–363`
- `_attKey(m2)` pattern for generating a "Name (descriptor)" key: `m.name + (m.area ? ' (' + m.area + ')' : '')` at `sheet.js:814` — use the same shape for domain merits: `m.name + (m.qualifier ? ' (' + m.qualifier + ')' : '')`

**External callers of domain helpers (must not break):**
- `downtime-views.js:13` — imports `domMeritContrib` (used for Herd feeding at line 6701)
- `downtime-form.js:332` — `effectiveDomainDots(c, name)` uses `find()` then `meritEffectiveRating` (touched in Task 6)
- `feeding-tab.js:444` — `domMeritContrib(char, 'Herd')` — Herd is singleton; no change needed
- `export-character.js:189–190` — `domMeritTotal(c, m.name)` / `domMeritContrib(c, m.name)` per-instance on `m`, so already instance-aware
- `audit.js:227` — `domMeritAccess(c, name)` for prereq checking
- `accessors.js:144–146` — `domainRating(c, name)` — touched in Task 5

**Data model today:** No `qualifier` on most domain merits. No `attached_to` on Haven/Mandragora Garden. Both fields are accepted by `shEditDomMerit` but never set by the UI.

**Legacy backwards-compat rule:** Characters already in MongoDB with empty/missing `qualifier` on Safe Place and Feeding Grounds are valid. Helpers must not break on `m.qualifier === undefined`. The editor should surface a one-click affordance to add a descriptor, but it must not block reading or rendering.

---

## Acceptance Criteria

1. A character can have multiple `Safe Place` entries as long as qualifiers (descriptors) differ case-insensitively; both instances render and contribute independently.
2. A character can have multiple `Feeding Grounds` entries with distinct qualifiers; both contribute independently.
3. Adding a second Safe Place with the same descriptor (case-insensitive, including empty) is rejected with an inline UI message.
4. Adding a second Feeding Grounds with the same descriptor is rejected the same way.
5. Each `Haven` entry has an `Attached to:` dropdown listing the character's Safe Place instances in `"Safe Place (qualifier)"` or `"Safe Place"` format.
6. Each `Mandragora Garden` entry has the same `Attached to:` dropdown.
7. Haven effective rating shown on sheet ≤ attached Safe Place's effective rating; over-allocated dots render hollow with a tooltip indicating the cap.
8. Mandragora Garden effective rating capped the same way.
9. If a Haven or Mandragora Garden has no `attached_to`, it contributes 0 effective dots and the editor shows a clear "needs attached Safe Place" warning.
10. Removing a Safe Place that is referenced by a Haven/Mandragora Garden either prompts the user or auto-detaches and re-caps immediately.
11. Existing characters without qualifiers continue to work — legacy Safe Place and Feeding Grounds with empty qualifiers render and contribute correctly; the editor shows a passive hint to add a descriptor.
12. All callers of `domMeritContrib`, `domMeritTotal`, `domMeritAccess` produce correct sums when multiple Safe Place / Feeding Grounds instances exist.
13. CSV export (`csv-format.js`) handles multiple Safe Place / Feeding Grounds by summing all instances into the single column (document this in code comment).
14. `downtime-form.js` `effectiveDomainDots` returns cap-capped values for Haven and Mandragora Garden.
15. Downtime-views Cruac pool calc (`downtime-views.js:6419`) continues to work — it already uses a flat +3 bonus independent of dot count, so no change needed there; verify it is not accidentally broken.

---

## Tasks

### Task 1 — Refactor `domain.js` helpers for multi-instance + cap logic

**File:** `public/js/editor/domain.js`

**Design rule:** Safe Place and Feeding Grounds are multi-instance. Herd, Haven, and Mandragora Garden remain singleton (at most one of each). Cap applies to Haven and Mandragora Garden only.

#### 1a. Add `MULTI_INSTANCE_DOMAIN` and `CAP_DOMAIN` constants (local to domain.js)

```js
const MULTI_INSTANCE_DOMAIN = new Set(['Safe Place', 'Feeding Grounds']);
const CAP_DOMAIN = new Set(['Haven', 'Mandragora Garden']);
```

#### 1b. Add domain key helper

```js
function domKey(m) {
  return m.name + (m.qualifier ? ' (' + m.qualifier + ')' : '');
}
```
This mirrors the `_attKey` pattern at `sheet.js:814` for domain merits.

#### 1c. Add `_havenCap(c, m)` — cap lookup for Haven / Mandragora Garden

```js
function _havenCap(c, m) {
  // If no attached_to, cap is 0.
  if (!m.attached_to) return 0;
  // Find the Safe Place instance matching the key.
  const sp = (c.merits || []).find(sp2 =>
    sp2.category === 'domain' && sp2.name === 'Safe Place' && domKey(sp2) === m.attached_to
  );
  if (!sp) return 0;
  // Use the Safe Place's own contribution + partner dots (full effective rating).
  return domMeritTotal_SP(c, sp);
}
```

#### 1d. Add `domMeritTotal_SP(c, spInstance)` — total for one specific SP instance

This is an internal helper called only for cap computation. It mirrors `domMeritTotal` but operates on a specific instance rather than the first-found-by-name:

```js
function domMeritTotal_SP(c, m) {
  const own = domMeritContribSingle(c, m);
  const partners = m.shared_with || [];
  let partnerTotal = 0;
  for (const pName of partners) {
    const p = (state.chars || []).find(ch => ch.name === pName);
    if (p) {
      const pm = (p.merits || []).find(pm2 =>
        pm2.category === 'domain' && pm2.name === 'Safe Place' && domKey(pm2) === domKey(m)
      );
      if (pm) partnerTotal += domMeritShareableSingle(p, pm);
    }
  }
  if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
    partnerTotal = m._partner_dots;
  }
  return Math.min(5, own + partnerTotal);
}
```

#### 1e. Update `domMeritContrib(c, name)` — sum all instances for multi-instance types

```js
export function domMeritContrib(c, name) {
  if (MULTI_INSTANCE_DOMAIN.has(name)) {
    return (c.merits || [])
      .filter(m => m.category === 'domain' && m.name === name)
      .reduce((s, m) => s + domMeritContribSingle(c, m), 0);
  }
  // Singleton path (Herd, Haven, Mandragora Garden)
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  return domMeritContribSingle(c, m);
}
```

Add the per-instance helper (not exported; used internally and by Task 2/3):
```js
export function domMeritContribSingle(c, m) {
  // m is a specific merit object, not looked up by name.
  const purchased = (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0);
  return purchased
    + (m.name === 'Herd' ? ssjHerdBonus(c) + flockHerdBonus(c) : 0)
    + (m.free_fwb || 0) + (m.free_attache || 0);
}
```

Also add:
```js
function domMeritShareableSingle(c, m) {
  return (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0);
}
```

#### 1f. Update `domMeritShareable(c, name)` — sum all instances for multi-instance types

```js
export function domMeritShareable(c, name) {
  if (MULTI_INSTANCE_DOMAIN.has(name)) {
    return (c.merits || [])
      .filter(m => m.category === 'domain' && m.name === name)
      .reduce((s, m) => s + domMeritShareableSingle(c, m), 0);
  }
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  return domMeritShareableSingle(c, m);
}
```

#### 1g. Update `domMeritTotal(c, name)` — sum all instances for multi-instance types

```js
export function domMeritTotal(c, name) {
  if (MULTI_INSTANCE_DOMAIN.has(name)) {
    // Sum across all instances; each instance is independently capped at 5 by its own sharing group.
    return (c.merits || [])
      .filter(m => m.category === 'domain' && m.name === name)
      .reduce((s, m) => s + domMeritTotal_SP(c, m), 0);
  }
  // Singleton path (unchanged logic)
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  const own = domMeritContribSingle(c, m);
  const partners = m.shared_with || [];
  let partnerTotal = 0;
  for (const pName of partners) {
    const p = (state.chars || []).find(ch => ch.name === pName);
    if (p) partnerTotal += domMeritShareable(p, name);
  }
  if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
    partnerTotal = m._partner_dots;
  }
  const total = own + partnerTotal;
  const cap = (name === 'Herd' && flockHerdBonus(c) > 0) ? Infinity : 5;
  return Math.min(cap, total);
}
```

#### 1h. Update `meritEffectiveRating(c, m)` — cap for Haven / Mandragora Garden

```js
export function meritEffectiveRating(c, m) {
  if (!c || !m) return 0;
  if (m.category === 'domain') {
    if (CAP_DOMAIN.has(m.name)) {
      const stored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
      return Math.min(stored, _havenCap(c, m));
    }
    if (MULTI_INSTANCE_DOMAIN.has(m.name)) {
      // Return this instance's effective total (own + partner for this specific instance).
      return domMeritTotal_SP(c, m);
    }
    if ((m.shared_with || []).length > 0) {
      return domMeritTotal(c, m.name);
    }
  }
  // ... (existing non-domain logic unchanged)
}
```

#### 1i. `domMeritAccess(c, name)` — unchanged logic, but now correctly sums for multi-instance

`domMeritAccess` calls `domMeritTotal`, which is already updated. No code change needed here — but verify it still works correctly for the prereq checker.

---

### Task 2 — Editor handler: qualifier, attached_to, uniqueness, partner sharing

**File:** `public/js/editor/edit-domain.js`

#### 2a. Add `shEditDomMerit` handler for `attached_to` field

`shEditDomMerit` already handles `qualifier`. Add:
```js
else if (field === 'attached_to') { if (val) m.attached_to = val; else delete m.attached_to; }
```
When `attached_to` changes, the cap re-evaluates automatically on `_renderSheet(c)`.

#### 2b. Uniqueness check in `shAddDomMerit`

Change `shAddDomMerit` to accept an optional `name` parameter and perform no uniqueness enforcement at add time — Safe Place and Feeding Grounds can have multiple instances. Only same-qualifier entries are rejected (see Task 3 for the UI-level validation).

The add handler should still default-create with an empty qualifier:
```js
export function shAddDomMerit(name = 'Safe Place') {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'domain', name, rating: 0 });
  _markDirty();
  _renderSheet(c);
}
```
Uniqueness rejection happens in `shEditDomMerit` when setting `qualifier` — see Task 3.

#### 2c. Qualifier uniqueness check in `shEditDomMerit`

When `field === 'qualifier'` for Safe Place or Feeding Grounds:
```js
else if (field === 'qualifier') {
  if (['Safe Place', 'Feeding Grounds'].includes(m.name)) {
    // Reject if another instance of the same name already has this qualifier (case-insensitive).
    const dupExists = (c.merits || []).some((other, i2) =>
      i2 !== realIdx &&
      other.category === 'domain' &&
      other.name === m.name &&
      (other.qualifier || '').toLowerCase() === (val || '').toLowerCase()
    );
    if (dupExists) {
      // Surface the error to the caller via a global or return value.
      // Use a data attribute on the input, or emit a custom event.
      // Convention: set a window._domQualError = message; renderSheet re-renders with it.
      window._domQualError = `A ${m.name} with this descriptor already exists.`;
      _renderSheet(c);
      return; // Do NOT apply the change.
    }
    window._domQualError = null;
  }
  if (val) m.qualifier = val; else delete m.qualifier;
  _markDirty();
  _renderSheet(c);
}
```

**Implementation note:** The error surface mechanism (global variable, data attribute, etc.) is the implementer's call. Use whatever is lightest — a module-level variable `let _lastDomQualError = null;` exported from `edit-domain.js` is sufficient. `shRenderDomainMerits` in `sheet.js` reads it after the re-render.

#### 2d. Remove handler cascade for Haven / Mandragora Garden when Safe Place removed

In `shRemoveDomMerit(idx)`, after removing the merit, check if it was a Safe Place. If so, find any Haven or Mandragora Garden that had `attached_to === domKey(removedMerit)` and clear their `attached_to`:
```js
export function shRemoveDomMerit(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { realIdx, merit: removed } = meritByCategory(c, 'domain', idx);
  if (realIdx >= 0) {
    if (removed.name === 'Safe Place') {
      const key = domKey(removed); // name + optional qualifier
      // Auto-detach any Haven / Mandragora Garden referencing this Safe Place.
      (c.merits || []).forEach(m2 => {
        if (['Haven', 'Mandragora Garden'].includes(m2.name) && m2.attached_to === key) {
          delete m2.attached_to;
        }
      });
    }
    removeMerit(c, realIdx);
  }
  _markDirty();
  _renderSheet(c);
}
```
No user prompt needed — auto-detach is simpler and the cap-0 warning in the UI makes the state visible.

#### 2e. Partner sharing keyed by (name, qualifier)

In `shAddDomainPartner` and `shRemoveDomainPartner`, the partner-merit lookup currently uses `m.name` alone to find the matching merit on the partner:
```js
const pm = (partner.merits || []).find(x => x.category === 'domain' && x.name === meritName);
```
Update to include qualifier:
```js
const myQualifier = m.qualifier || undefined;
const pm = (partner.merits || []).find(x =>
  x.category === 'domain' && x.name === meritName && (x.qualifier || undefined) === myQualifier
);
```
When creating a missing partner merit, include `qualifier: m.qualifier || undefined` (omit the field if falsy to avoid polluting legacy documents with `qualifier: undefined`).

**Caution:** `shAddDomainPartner` also syncs the `shared_with` array across all group members. The logic remains the same — just ensure every `find()` call for domain merit matching uses the (name, qualifier) pair.

---

### Task 3 — Sheet render: editor UI

**File:** `public/js/editor/sheet.js` — `shRenderDomainMerits(c, editMode)` function (line 911)

#### 3a. Qualifier input for Safe Place and Feeding Grounds

Inside the `domM.forEach((m, di) => { ... })` edit loop, after the name select, add a qualifier input for Safe Place and Feeding Grounds instances:

```js
if (['Safe Place', 'Feeding Grounds'].includes(m.name)) {
  const qualErr = (window._domQualError && /* check it applies to this row */ )
    ? '<span class="dom-qual-error">' + esc(window._domQualError) + '</span>'
    : '';
  h += '<input type="text" class="dom-qual-input" value="' + esc(m.qualifier || '') + '" '
     + 'placeholder="Descriptor (e.g. Penthouse)" '
     + 'onchange="shEditDomMerit(' + di + ',\'qualifier\',this.value.trim())">'
     + qualErr;
  // Legacy hint: if no qualifier, show passive notice (not blocking)
  if (!m.qualifier) {
    h += '<span class="dom-qual-hint">Add a descriptor to support multiple instances</span>';
  }
}
```

#### 3b. Attached-to selector for Haven and Mandragora Garden

In the same edit loop, for Haven and Mandragora Garden:
```js
if (['Haven', 'Mandragora Garden'].includes(m.name)) {
  const spInstances = (c.merits || []).filter(sp => sp.category === 'domain' && sp.name === 'Safe Place');
  const spOpts = ['<option value="">(select Safe Place)</option>']
    .concat(spInstances.map(sp => {
      const key = 'Safe Place' + (sp.qualifier ? ' (' + sp.qualifier + ')' : '');
      return '<option value="' + esc(key) + '"' + (m.attached_to === key ? ' selected' : '') + '>'
           + esc(key) + '</option>';
    }))
    .join('');
  h += '<div class="dom-attach-row"><label class="dom-attach-lbl">Attached to:</label>'
     + '<select class="dom-attach-sel" onchange="shEditDomMerit(' + di + ',\'attached_to\',this.value||null)">'
     + spOpts + '</select></div>';

  // Cap warning if no Safe Place linked or effective rating exceeds cap
  if (!m.attached_to || spInstances.length === 0) {
    h += '<div class="dom-cap-warn">Needs an attached Safe Place — contributes 0 dots until linked.</div>';
  } else {
    // Cap indicator: show stored vs effective
    const stored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
    const eff = meritEffectiveRating(c, m);
    if (stored > eff) {
      h += '<div class="dom-cap-warn">Capped at ' + eff + ' (Safe Place is ' + eff + ' — '
         + (stored - eff) + ' dot' + (stored - eff !== 1 ? 's' : '') + ' over-allocated, will come back if Safe Place upgraded)</div>';
    }
  }
}
```

#### 3c. Dot display for Haven and Mandragora Garden (capped dots as hollow)

For the dot display row when Haven/MG have a cap:
- Dots up to `eff` = solid (●)
- Dots from `eff+1` to `stored` = hollow (○) with title/tooltip "Over Safe Place cap"

Use the existing `shDotsMixed(solid, hollow)` helper.

#### 3d. Partner sharing: exclude Feeding Grounds from shared UI (preserve existing exclusion)

Line 952 already excludes Herd and Feeding Grounds:
```js
if (!['Herd', 'Feeding Grounds'].includes(m.name) && parts.length)
```
Also ensure Haven and Mandragora Garden are excluded from partner sharing (they don't share — only the Safe Place they're attached to shares):
```js
if (!['Herd', 'Feeding Grounds', 'Haven', 'Mandragora Garden'].includes(m.name) && parts.length)
```
Same for the "Add shared partner" dropdown on line 953.

---

### Task 4 — Sheet render: view mode

**File:** `public/js/editor/sheet.js` — view mode block of `shRenderDomainMerits` (line 957–971)

#### 4a. Show qualifier in display name

Currently: `esc(m.name)`. Update to include qualifier when present:
```js
const displayLabel = m.qualifier ? esc(m.name) + ' <span class="trait-qual">(' + esc(m.qualifier) + ')</span>' : esc(m.name);
```

#### 4b. Show cap indicator in view mode

For Haven and Mandragora Garden with a cap:
```js
if (['Haven', 'Mandragora Garden'].includes(m.name)) {
  const stored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
  const eff = meritEffectiveRating(c, m);
  // Render: solid up to eff, hollow from eff+1 to stored
  dotHtml = shDotsMixed(eff, Math.max(0, stored - eff));
  if (!m.attached_to) {
    h += '<div class="derived-note dom-cap-warn">Haven needs an attached Safe Place (0 effective dots)</div>';
  } else if (stored > eff) {
    h += '<div class="derived-note">Capped at ' + eff + ' — Safe Place limits effective dots</div>';
  }
  if (m.attached_to) {
    h += '<div class="trait-sub"><span class="trait-qual">Attached: ' + esc(m.attached_to) + '</span></div>';
  }
}
```

---

### Task 5 — Update `accessors.js` `domainRating`

**File:** `public/js/data/accessors.js`

`domainRating(c, name)` currently returns `m.rating` from the first-found instance. With multi-instance types:

```js
export function domainRating(c, name) {
  const matches = domainMerits(c).filter(dm => dm.name === name);
  if (!matches.length) return 0;
  // For singleton types, return first match's rating.
  // For multi-instance (SP, FG), sum all instances' cp+xp (raw stored, not effective).
  if (matches.length === 1) return matches[0].rating || 0;
  return matches.reduce((s, dm) => s + (dm.rating || 0), 0);
}
```

**CSV impact (line 202–205 in csv-format.js):** The CSV columns `'Safe Place'` and `'Feeding Grounds'` will now reflect the summed total of all instances. Add a comment:
```js
// Multiple Safe Place / Feeding Grounds instances are summed into one column.
// Individual descriptors are not exported (no column for them in the merge template).
```

---

### Task 6 — Update `downtime-form.js` `effectiveDomainDots`

**File:** `public/js/tabs/downtime-form.js:332`

```js
function effectiveDomainDots(c, name) {
  if (['Haven', 'Mandragora Garden'].includes(name)) {
    // Return cap-capped effective rating for the single instance (singleton types).
    const m = (c.merits || []).find(merit => merit.category === 'domain' && merit.name === name);
    return meritEffectiveRating(c, m); // meritEffectiveRating now applies cap for CAP_DOMAIN types
  }
  if (['Safe Place', 'Feeding Grounds'].includes(name)) {
    // Sum effective ratings across all instances.
    return (c.merits || [])
      .filter(merit => merit.category === 'domain' && merit.name === name)
      .reduce((s, m) => s + meritEffectiveRating(c, m), 0);
  }
  // Herd: singleton as before
  const m = (c.merits || []).find(merit => merit.category === 'domain' && merit.name === name);
  return meritEffectiveRating(c, m);
}
```

---

### Task 7 — Verify downtime-views Cruac pool (no change expected)

**File:** `public/js/admin/downtime-views.js:6419–6420`

```js
const hasMandragora = isCruac && (char?.merits || []).some(m => m.name === 'Mandragora Garden');
const mgDots = hasMandragora ? 3 : 0;
```

This is a flat +3 bonus for having ANY Mandragora Garden, independent of dot count. No change needed here. The issue AC that mentions this file is satisfied by confirming the code is not broken by the domain.js changes — `meritEffectiveRating` changes do not affect `merits.some(m => m.name === 'Mandragora Garden')`.

**Verify by inspection only** — do not change this function.

---

### Task 8 — Export character (verify, no change expected)

**File:** `public/js/editor/export-character.js:189–190`

```js
effectiveRating = domMeritTotal(c, m.name);
ownDots = domMeritContrib(c, m.name);
```

This iterates `c.merits` per instance (the outer loop is over individual merit objects `m`). After the refactor, for a specific Safe Place instance, `domMeritTotal(c, 'Safe Place')` returns the TOTAL across ALL instances, not the one instance `m`. This would be incorrect for per-instance display.

**Fix:** Update to pass the specific instance where per-instance totals are needed:

Check how export-character uses these values — if it produces per-merit rows, it needs `domMeritTotal_SP(c, m)` (export of internal helper) or `meritEffectiveRating(c, m)` for the per-instance effective total.

**Action:** Read `public/js/editor/export-character.js` lines 185–200 before implementing and confirm whether the outer loop is per-instance. Update accordingly. `meritEffectiveRating(c, m)` is the canonical per-instance effective rating and is already exported — prefer it.

---

## Scope Boundaries

**In scope:** Editor UI (descriptor inputs, attached_to selectors, cap display), domain.js helper refactor, Haven/Mandragora cap logic, descriptor uniqueness validation, partner-sharing key update, CSV export handling, downtime-form effectiveDomainDots cap-awareness.

**Out of scope:**
- Backfilling `qualifier` onto existing Safe Place / Feeding Grounds documents in MongoDB — legacy empty qualifiers are valid; the UI shows a passive hint only.
- Changing merit cost rules.
- Redesigning the Domain section layout.
- The sharing-with-partner UX overhaul beyond the (name, qualifier) key fix.
- Multiple Haven instances (Haven remains singleton by design).
- Multiple Mandragora Garden instances (same — singleton).

---

## Implementation Order

1. **Task 1** — `domain.js` helper refactor (foundation; everything else depends on this)
2. **Task 5** — `accessors.js` `domainRating` (simple, no UI)
3. **Task 8** — Read `export-character.js` and fix if needed
4. **Task 2** — `edit-domain.js` handler updates
5. **Task 3** — `sheet.js` edit mode UI
6. **Task 4** — `sheet.js` view mode
7. **Task 6** — `downtime-form.js` `effectiveDomainDots`
8. **Task 7** — Verify `downtime-views.js` (read-only, no change)

---

## Critical Regressions to Prevent

- Characters with a single Safe Place and no qualifier must still render and contribute correctly (legacy compat — AC #11).
- `Herd` singleton behaviour (SSJ bonus, Flock bonus, cap-at-5-override) must be fully preserved — its callers in `downtime-form.js`, `feeding-tab.js`, and `downtime-views.js` must not be broken.
- Partner-sharing (shared coterie Safe Place) must continue to work; only the lookup key changes from name-only to (name, qualifier).
- The `meritBdRow` call at line 948 uses `meritFixedRating(m.name)` for the dot allocation grid — confirm this still works for multi-instance Safe Place (each row renders its own allocation independently, which is correct).
- `_prereqWarn(c, m.name)` at line 948 calls `domMeritAccess` internally — verify Haven prereq ("needs Safe Place X") evaluates correctly after the refactor. Haven's prereq likely checks Safe Place dots ≥ N; after the refactor `domMeritAccess(c, 'Safe Place')` returns the SUM of all Safe Place instances' dots, which is the correct total for prereq evaluation.

---

## Dev Notes

- The `_domQualError` global is a convenience pattern used elsewhere in the codebase (see `window._domQualError` if it already exists, or invent a module-level variable exported from `edit-domain.js`). Keep it minimal.
- Do not add qualifier inputs to Herd — it is singleton and has no descriptor semantics.
- The `domKey(m)` helper defined in domain.js should be exported so sheet.js can use it for generating the attached_to dropdown keys without duplicating the format.
- CSS classes to use: `dom-qual-input`, `dom-qual-hint`, `dom-cap-warn`, `dom-attach-row`, `dom-attach-lbl`, `dom-attach-sel` — these do not exist yet; add minimal scoped rules to `public/css/admin.css` or the existing domain section styles. Follow the project's CSS custom property (`--gold2`, `--crim`, `--surf*`) conventions; no bare hex colours in rule bodies.
- `window.shAddDomMerit` and `window.shEditDomMerit` are registered on `window` in both `admin.js` and `app.js`. If the signature of `shAddDomMerit` changes (optional `name` param), no window registration change is needed — the call in the "Add Domain Merit" button HTML at sheet.js:956 is `onclick="shAddDomMerit()"` with no args, which still defaults correctly.

---

## Code Review Findings (post-story checklist pass)

**Server schema — no change needed:**
`server/schemas/character.schema.js:376` already has `qualifier: { type: 'string' }` and `:433` has `attached_to: { type: ['string', 'null'] }` on merit objects. Zero server-side changes required.

**`export-character.js:187–190` — fix required:**
```js
const isShared = m.category === 'domain' && (m.shared_with || []).length > 0;
if (isShared) {
  effectiveRating = domMeritTotal(c, m.name);   // WRONG after refactor: sums ALL instances
  ownDots = domMeritContrib(c, m.name);          // same problem
}
```
After Task 1, `domMeritTotal(c, 'Safe Place')` returns the total for ALL instances, not this one. Fix:
```js
if (m.category === 'domain') {
  effectiveRating = meritEffectiveRating(c, m);   // per-instance, cap-aware
  ownDots = domMeritContribSingle(c, m);           // per-instance (export this from domain.js)
}
```
This replaces the old `isShared` branch entirely for domain merits. `meritEffectiveRating` handles all cases (multi-instance SP/FG, capped Haven/MG, plain Herd). Make `domMeritContribSingle` a named export from `domain.js`.

**Error surface for qualifier uniqueness — use module variable, not `window`:**
The pattern `c._ts_err` (line 268) stores a temporary error on the character object and is read at render time. Use the same approach: set `c._domQualError = message` in the uniqueness check; render reads it and shows the inline span; clear it at the start of the next `shEditDomMerit` call for that character. Do NOT use a `window` global — it doesn't scope to the character being edited.

**`normalize-character.js:119` already uses `qualifier` for the merit label.** No change needed there.

---

## Files Modified Summary

| File | Change |
|------|--------|
| `public/js/editor/domain.js` | Multi-instance helpers, cap logic, `domKey` export |
| `public/js/editor/edit-domain.js` | Qualifier uniqueness, `attached_to` handler, remove cascade, partner-sharing key fix |
| `public/js/editor/sheet.js` | Edit mode: qualifier input + attached_to selector + cap display; view mode: qualifier label + cap indicator |
| `public/js/data/accessors.js` | `domainRating` summing for multi-instance |
| `public/js/editor/export-character.js` | Per-instance effective rating via `meritEffectiveRating` + `domMeritContribSingle` |
| `public/js/tabs/downtime-form.js` | `effectiveDomainDots` cap-awareness for SP/FG multi-instance and Haven/MG singleton |
| `public/js/admin/downtime-views.js` | Verified only — `.some()` presence check + flat +3 unaffected |
| `public/css/components.css` | Added `dom-qual-*`, `dom-cap-warn`, `dom-cap-info`, `dom-attach-*` CSS rules |

---

## Dev Agent Record

### Completion Notes

All 8 tasks implemented and syntax-verified (`node --input-type=module --check` on all modified JS files).

**Task 1 — domain.js:** Added `MULTI_INSTANCE_DOMAIN` set (SP/FG), `CAP_DOMAIN` set (Haven/MG), exported `domKey(m)` and `domMeritContribSingle(c, m)`. Internal helpers `domMeritTotalSingle`, `domMeritShareableSingle`, `_havenCap` route cap calculation through `domKey`-matched SP lookup. `domMeritContrib`, `domMeritShareable`, `domMeritTotal` all branch on MULTI_INSTANCE_DOMAIN to sum vs. find-first. `meritEffectiveRating` updated: CAP_DOMAIN → `Math.min(stored, _havenCap)`, MULTI_INSTANCE → `domMeritTotalSingle`, shared singleton → `domMeritTotal`.

**Task 2 — edit-domain.js:** `shEditDomMerit` clears `c._domQualError` on entry; `field === 'name'` clears qualifier and attached_to; `field === 'qualifier'` performs case-insensitive dup check for SP/FG, sets `c._domQualError` and early-returns on collision; `field === 'attached_to'` sets or deletes the field. `shRemoveDomMerit` auto-detaches Haven/MG when their referenced SP is removed. `shAddDomMerit` accepts optional `name` parameter. `shAddDomainPartner` and `shRemoveDomainPartner` now key on `(name, qualifier)` pair.

**Task 3 — sheet.js edit mode:** Qualifier text input for SP/FG with `c._domQualError` error display and legacy hint. Attached-to `<select>` for Haven/MG populated from character's SP instances via `domKey`. Cap warning ("Needs SP" or "Capped at N"). Partner-sharing exclusion extended to include Haven and Mandragora Garden.

**Task 4 — sheet.js view mode:** Per-instance effective rating via `meritEffectiveRating(c, m)`. Display name includes qualifier in `trait-qual` span. Haven/MG show solid/hollow dots split at cap, with "Needs SP" or "Capped at N" derived-note, plus "Attached: [key]" sub-line.

**Task 5 — accessors.js:** `domainRating` sums all instances for SP/FG (multiple matches); singleton path unchanged.

**Task 6 — export-character.js:** Replaced `isShared` guard with unified `if (m.category === 'domain')` block using `meritEffectiveRating(c, m)` for effective rating and `domMeritContribSingle(c, m)` for own dots. Handles all domain types correctly per-instance.

**Task 7 — downtime-form.js:** `effectiveDomainDots` now filters+reduces for SP/FG (multi-instance sum), find+`meritEffectiveRating` for Haven/MG/Herd (singleton, cap-aware).

**Task 8 — downtime-views.js:** Verified. `.some(m => m.name === 'Mandragora Garden')` is presence-only; flat `+3` is independent of dot count. Unaffected by domain.js changes.

**CSS:** Added 10 new classes to `public/css/components.css` in the domain merit editing block, all using `--warn-dk`, `--err`, `--surf2`, `--bdr2`, `--gold`, `--ft` tokens — no bare hex.

**Deviation from story spec — error surface:** Story suggested `window._domQualError` but code-review note recommended `c._domQualError` (character-scoped, mirrors `c._ts_err` pattern). Used `c._domQualError`.

---

## File List

- `public/js/editor/domain.js` — modified
- `public/js/editor/edit-domain.js` — modified
- `public/js/editor/sheet.js` — modified
- `public/js/data/accessors.js` — modified
- `public/js/editor/export-character.js` — modified
- `public/js/tabs/downtime-form.js` — modified
- `public/css/components.css` — modified
- `specs/stories/issue-12-domain-multi-instance-descriptors.story.md` — modified (this file)
- `specs/stories/sprint-status.yaml` — modified

---

## Change Log

- 2026-05-07: Implemented domain multi-instance + cap system (all 8 tasks). Branch: morningstar-issue-12-domain-multi-instance-descriptors.
