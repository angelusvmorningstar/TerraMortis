---
title: 'DT Processing: feeding territory shows raw ObjectID instead of name'
type: 'fix'
issue: 733
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/733
branch: ms/issue-733-feeding-territory-name
created: '2026-06-15'
status: review
recommended_model: 'sonnet — two-line change, duplicate in two branches'
context:
  - public/js/admin/downtime-views.js
---

## Intent

Fix the Feeding Intelligence panel in DT Processing so territory rows display
the human-readable territory name (e.g. "The Academy") instead of the raw
MongoDB ObjectID string (e.g. `69D9E54C00815D471503BEA9`).

---

## Root cause

`feeding_territories` in DT submissions is stored as a JSON object keyed by
MongoDB ObjectID strings (e.g. `{ "69D9E54C...": "feeding_rights" }`).

`_renderSnapshotFeedingPanel()` iterates those entries and tries to resolve the
key to a territory record with:

```js
terrList.find(t => t.slug === slug || t.name?.toLowerCase().replace(/\s+/g, '_') === slug)
```

Neither branch matches an ObjectID. The fallback `terrName = terrRec?.name || slug.replace(/_/g, ' ')` then displays the formatted ObjectID as the territory name.

`resolveTerrId()` (line 3799) already solves the conversion:

```js
function resolveTerrId(raw) {
  if (!raw) return null;
  const t = (cachedTerritories || []).find(td => String(td._id) === raw);
  return t?.slug || null;
}
```

It is already used correctly in `_entryTerritories()` (line 4454) and throughout
the queue-building code. The snapshot rendering function simply doesn't call it.

**Secondary impact:** when `terrRec` is `undefined` due to the lookup failure,
`_terrRow` also silently skips the ambience label and Regent badge for affected
rows. The fix restores those too at no extra cost.

### File locations

| File | Lines | Notes |
|------|-------|-------|
| `public/js/admin/downtime-views.js` | 8609–8610 | Rote-feed branch — slug lookup without `resolveTerrId` |
| `public/js/admin/downtime-views.js` | 8633–8635 | Regular-feed branch — same slug lookup, same bug |
| `public/js/admin/downtime-views.js` | 3799–3803 | `resolveTerrId()` — existing helper that handles ObjectID → slug |
| `public/js/admin/downtime-views.js` | 8588–8600 | `_terrRow()` — uses `terrRec?._id` for ambience + regent; broken when `terrRec` is `undefined` |
| `public/js/admin/downtime-views.js` | 4451–4469 | `_entryTerritories()` — uses `resolveTerrId` correctly; reference for the pattern |

---

## Fix

### T1 — Add `resolveTerrId` call before the slug lookup in both branches

**File:** `public/js/admin/downtime-views.js`

There are two identical loops inside `_renderSnapshotFeedingPanel()` — one for
rote feed entries (around line 8609) and one for regular feed entries (around
line 8633). Apply the same change to both.

**Rote feed branch (around line 8609):**

```js
// BEFORE:
for (const [slug, status] of activeTerrs) {
  const terrRec = terrList.find(t => t.slug === slug || t.name?.toLowerCase().replace(/\s+/g, '_') === slug);
  const terrName = terrRec?.name || slug.replace(/_/g, ' ');
```

```js
// AFTER:
for (const [slug, status] of activeTerrs) {
  const resolvedSlug = resolveTerrId(slug) || slug;
  const terrRec = terrList.find(t => t.slug === resolvedSlug || t.name?.toLowerCase().replace(/\s+/g, '_') === resolvedSlug);
  const terrName = terrRec?.name || resolvedSlug.replace(/_/g, ' ');
```

**Regular feed branch (around line 8633) — identical change:**

```js
// BEFORE:
for (const [slug, status] of activeTerrs) {
  const terrRec = terrList.find(t => t.slug === slug || t.name?.toLowerCase().replace(/\s+/g, '_') === slug);
  const terrName = terrRec?.name || slug.replace(/_/g, ' ');
```

```js
// AFTER:
for (const [slug, status] of activeTerrs) {
  const resolvedSlug = resolveTerrId(slug) || slug;
  const terrRec = terrList.find(t => t.slug === resolvedSlug || t.name?.toLowerCase().replace(/\s+/g, '_') === resolvedSlug);
  const terrName = terrRec?.name || resolvedSlug.replace(/_/g, ' ');
```

**What each line does:**
- `resolveTerrId(slug)` — if `slug` is an ObjectID, returns the canonical slug;
  if `slug` is already a slug, returns `null` (no match by `_id`)
- `|| slug` — fallback: keeps the original value if it was already a slug
- The existing `terrList.find(...)` logic is unchanged — it now runs against the
  resolved slug instead of the raw ObjectID

**The "Also feeding" peer filter** at lines 8619–8621 and 8644–8646 uses `slug`
(the raw ObjectID key) to match against `r.feedTerrs?.[slug]`. This is correct
— both sides are ObjectID keys, so the comparison works. Do NOT change it.

---

## Acceptance criteria

- [ ] Tegan Groves (Rote Action feed) in DT 4: TERRITORIES row shows territory name, not ObjectID
- [ ] Aleksei Romanov (main feed) in DT 4: TERRITORIES row shows territory name, not ObjectID
- [ ] Rights / Poaching / Resident badge renders correctly alongside the name
- [ ] "Also feeding" peer list still appears for shared territories
- [ ] Ambience label and Regent badge in `_terrRow` now display correctly for
  feeding rows (previously silently omitted when `terrRec` was undefined)

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes. No other files.
- No schema change. `resolveTerrId` is module-scoped and already available in
  `_renderSnapshotFeedingPanel` — no import or parameter change needed.
- Do NOT change the "Also feeding" peer filter (`r.feedTerrs?.[slug]`) — it
  correctly uses the raw ObjectID key for map lookup.
- Do NOT change `_entryTerritories()` — it already uses `resolveTerrId`
  correctly.
- The fix is additive: if a key was already a slug (legacy data), `resolveTerrId`
  returns `null`, the fallback `|| slug` preserves it, and the existing lookup
  continues to work.

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: added `resolveTerrId(slug) || slug` before territory lookup in both the rote-feed and regular-feed branches of `_renderSnapshotFeedingPanel()` (lines 8610–8612 and 8635–8637)
- `tests/fix-733-feeding-territory-name.spec.js` — 5 Playwright tests, all passing

### Completion notes

One-line addition in each of the two parallel loops inside `_renderSnapshotFeedingPanel()`. Both loops now call `resolveTerrId(slug)` first to convert any ObjectID key to its canonical slug before the `terrList.find()` lookup. If the key was already a slug, `resolveTerrId` returns `null` and the `|| slug` fallback preserves it — no regression for legacy data. The "Also feeding" peer filter retains the raw ObjectID key throughout (correct — both sides of that comparison are ObjectIDs). 5/5 Playwright tests passing: ObjectID→name for regular feed, Rights badge, rote feed, legacy slug (no regression), multiple territories.
