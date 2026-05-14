# Story issue-216: DT form shows Alice as regent of Dockyards instead of North Shore

Status: review

issue: 216
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/216
branch: morningstar-issue-216-alice-regent-territory

---

## Story

As Alice (a regent player),
When I open my advanced downtime form,
I should see "I am acting as Regent of **The North Shore**" in the Regency section,
so that my feeding-rights confirmation applies to the correct territory.

---

## Background and Current State

**What the regency display code does today:**

`findRegentTerritory(territories, c)` in `public/js/data/helpers.js:153` determines which territory
a character is regent of:

```js
export function findRegentTerritory(territories, c) {
  if (!territories || !c) return null;
  const cid = String(c._id);
  const t = territories.find(t => t.regent_id === cid);
  if (!t) return null;
  return {
    territory: t.name || t.slug,
    territoryId: String(t._id),
    slug: t.slug || null,
    lieutenantId: t.lieutenant_id || null,
    ambience: t.ambience || null,
  };
}
```

The `territories` array is freshly fetched from `/api/territories` on every DT form render
(fix for issue #153 — `downtime-form.js:1200–1205`). The API does a plain `col().find().toArray()`
with **no sorting** — results return in MongoDB natural (insertion) order.

**The Admin City view uses the opposite lookup direction:**

`public/js/admin/city-views.js:321–323`:
```js
function _terrDoc(terrId) {
  return terrDocs.find(d => d.slug === terrId); // slug-keyed; finds first match
}
```

For each canonical territory slug from `TERRITORY_DATA` (downtime-data.js), the city view finds
the first document whose `slug` matches and then resolves `regent_id` → character name.
These are two separate lookup directions that can diverge when duplicate territory documents exist.

**Root cause hypothesis — duplicate territory documents:**

On 2026-05-05 a stale browser session posted bodies with the retired `id` field, creating
**5 duplicate territories** (noted in `territory.schema.js` header and fixed by issue #33).
If a duplicate Dockyards document exists with `regent_id = alice_id`:

- City view: `_terrDoc("dockyards")` returns the FIRST doc with `slug === "dockyards"`.
  If the correct doc (regent_id = rene_id) appears first in insertion order → Rene shown ✓
- DT form: `territories.find(t => t.regent_id === alice_id)` scans ALL docs and may hit the
  stale Dockyards duplicate before it reaches the North Shore document → Dockyards shown ✗

All other regents display correctly because they have no stale duplicates.

---

## Files in Scope

**Investigation (run + delete):**
- `server/scripts/diagnose-regent-216.js` — one-shot diagnostic; query and print territory docs

**Data fix (the actual repair):**
- MongoDB: delete the stale territory document (identified by the diagnostic)

**Code guard (apply after data fix to prevent recurrence):**
- `public/js/data/helpers.js` — tighten `findRegentTerritory` to prefer canonical slugs

---

## Files NOT in Scope

- `public/js/tabs/downtime-form.js` — no change needed; territories are already refreshed on render
- `public/js/admin/city-views.js` — display is correct; do not change
- `server/routes/territories.js` — no change needed; deduplication is a data fix, not API-level
- Any server schema — territory.schema.js already has `additionalProperties: false` to block future duplicates

---

## Dev Tasks

### Step 1 — Diagnose (mandatory before data fix)

Write and run `server/scripts/diagnose-regent-216.js` as a one-shot Node script.
The script must:

1. Connect to MongoDB `tm_suite` (reuse the existing `server/db.js` connection helper)
2. Find Alice's character by name (search characters collection for `name: /Alice/i` or moniker)
3. Print Alice's `_id` string
4. Query ALL territory documents: `db.territories.find({}).toArray()`
5. Print each territory doc's `{ _id, slug, name, regent_id }` — flagging any where `regent_id === alice._id`
6. Flag any slug that appears more than once (duplicates)

Run the script, capture output, and decide which fix path applies:
- **Path A (data)**: One or more territory documents have `regent_id = alice_id` AND should not
  (name/slug is Dockyards or a stale orphan) → delete those documents
- **Path B (code)**: Data is unexpectedly correct and there's a type mismatch or ordering issue →
  see code guard below

### Step 2 — Data fix (Path A — expected)

If the diagnostic reveals stale/duplicate territory documents:

Write a second script `server/scripts/fix-regent-216.js` that:
1. Identifies the stale document(s) by `_id` (printed in Step 1 output)
2. Deletes them with `deleteOne({ _id: ObjectId(staleId) })`
3. Prints confirmation

**The user runs both scripts manually.** Do not automate execution in the story implementation.

After running the fix, re-run the diagnostic to confirm zero territory docs have `regent_id = alice_id`
except the canonical North Shore document.

### Step 3 — Code guard (apply regardless of fix path)

Harden `findRegentTerritory` in `public/js/data/helpers.js` to prefer territories that have
a canonical slug when multiple docs match the same regent_id.

Import `TERRITORY_DATA` from `../tabs/downtime-data.js` at the top of `helpers.js`:

```js
import { TERRITORY_DATA } from '../tabs/downtime-data.js';
```

Update `findRegentTerritory`:

```js
export function findRegentTerritory(territories, c) {
  if (!territories || !c) return null;
  const cid = String(c._id);
  const canonicalSlugs = new Set(TERRITORY_DATA.map(td => td.slug));
  // Prefer canonical territories over stale/orphaned duplicates.
  const matches = territories.filter(t => t.regent_id === cid);
  if (!matches.length) return null;
  const t = matches.find(m => canonicalSlugs.has(m.slug)) || matches[0];
  return {
    territory: t.name || t.slug,
    territoryId: String(t._id),
    slug: t.slug || null,
    lieutenantId: t.lieutenant_id || null,
    ambience: t.ambience || null,
  };
}
```

This means even if a stale duplicate doc (non-canonical slug) appears first in the API response,
the canonical territory always wins.

### Step 4 — Delete diagnostic scripts

After the data fix is confirmed, delete:
- `server/scripts/diagnose-regent-216.js`
- `server/scripts/fix-regent-216.js`

Do not commit these to main.

---

## Acceptance Criteria

**AC-1 — Alice's DT form shows North Shore**
Given Alice's player opens the advanced downtime form for the current cycle,
When the Regency section renders,
Then it reads "I am acting as Regent of **The North Shore** for this cycle."

**AC-2 — Rene's DT form unchanged**
Given Rene ST Dominique's player opens the advanced downtime form,
When the Regency section renders,
Then it continues to read "I am acting as Regent of **The Dockyards** for this cycle."

**AC-3 — No other regents affected**
Given all other regent characters open their DT forms,
When the Regency section renders,
Then all display the same territory they displayed before this fix.

**AC-4 — `findRegentTerritory` code guard in place**
Given `helpers.js` is patched with the canonical-slug preference,
When `findRegentTerritory` is called with a territories array containing both a canonical
and a non-canonical doc sharing the same regent_id,
Then it returns the canonical doc.

---

## Key Code Locations

| Symbol | File | Line |
|--------|------|------|
| `findRegentTerritory` | `public/js/data/helpers.js` | 153 |
| `TERRITORY_DATA` | `public/js/tabs/downtime-data.js` | 92 |
| `_territories` freshened on render | `public/js/tabs/downtime-form.js` | 1200 |
| `renderRegencySection` (uses `findRegentTerritory`) | `public/js/tabs/downtime-form.js` | 4140 |
| `_terrDoc` (city view; slug-keyed) | `public/js/admin/city-views.js` | 321 |
| Territory schema (duplicate-prevention note) | `server/schemas/territory.schema.js` | 1 |

---

## Scope Notes

- **In scope**: Stale data diagnosis + deletion; `findRegentTerritory` canonical-slug guard
- **Out of scope**: Changes to the territories API; changes to how the city view resolves regents;
  any other regent display issues (all other regents confirmed correct)
- **Do not**: Modify the territory documents' `regent_id` directly in the scripts — only delete
  stale duplicate documents. The correct regent assignments are already in place.

---

## Dev Agent Record

### Diagnostic findings (2026-05-08)

Ran `diagnose-regent-216.js` against production `tm_suite`. Results:

- Alice `_id`: `69d73ea49162ece35897a47c`
- North Shore `regent_id = 69d73ea49162ece35897a47c` — **correct match**
- Dockyards `regent_id = 69d73ea49162ece35897a496` — different character (Rene)
- **Zero duplicate slugs** — the 2026-05-05 `cleanup-territory-id-dupes.js` run already resolved all 5 duplicates
- All regent_id values are strings — no type mismatch

The territory data was correct at the time of the diagnostic. The screenshot-visible bug was likely caused by a data state between the 2026-05-05 duplicate cleanup and the subsequent admin correction of regent assignments through the City view.

**Steps taken:**
- Step 1 (Diagnose): Run — data already correct, no stale documents
- Step 2 (Data fix): Skipped — not needed
- Step 3 (Code guard): Applied — `findRegentTerritory` in `public/js/data/helpers.js` now prefers canonical slugs over any stale/orphaned duplicates if they reappear
- Step 4 (Cleanup): Diagnostic script deleted

### Files changed

- `public/js/data/helpers.js` — `findRegentTerritory` hardened with canonical-slug preference; `TERRITORY_DATA` import added
