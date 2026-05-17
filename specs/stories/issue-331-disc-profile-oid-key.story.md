# Issue #331: Discipline Profile -- Territory Columns Blank (Slug vs OID Key Mismatch)

Status: review

issue: 331
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/331
branch: morningstar-issue-331-disc-profile-oid-key

## Story

As an ST reviewing a downtime cycle,
I want the Discipline Profile matrix to show per-territory discipline counts,
so that I can see which disciplines were used in each territory across feeding
and ambience actions.

## Acceptance Criteria

1. After Retally with at least one validated feeding submission, territory columns
   appear for every territory where a discipline was used.
2. Discipline count per cell is correct: 1 per validated normal feeding, 1 per
   rote-feed or ambience project (2 if exceptional).
3. A territory with no discipline use has no column.
4. Auto-retally (triggered by feeding validation or ambience project validation)
   produces OID-keyed data matching what the renderer expects.

## Tasks / Subtasks

- [x] Task 1 -- Fix `recomputeDisciplineProfile` to write OID-keyed profile (AC: 1, 2, 3, 4)
  - [x] At the top of the function, call `await ensureTerritories()` then build a
        local `slugToOid` map from `cachedTerritories`
  - [x] In the normal-feeding loop (line 3584), convert each resolved slug to its OID
        via `slugToOid.get(slug)` before using it as the profile key; skip if no OID found
  - [x] In the projects loop (line 3602), convert `_resolveProjectTerritory`'s slug
        return value to OID the same way; skip if no OID found
  - [x] Verify the saved profile object uses string OID keys (matching what the renderer
        reads at line 10794)

## Dev Notes

### File to modify

**Single file: `public/js/admin/downtime-views.js`**

---

### Root Cause

`recomputeDisciplineProfile` (line 3574) builds its profile keyed by **territory slug**
(e.g. `'northshore'`, `'academy'`). The display renderer at line 10786 expects
**MongoDB OID keys** per ADR-002:

```js
// Renderer (line 10789-10800) — reads OID-keyed profile
const slugToOid = new Map();
for (const t of (cachedTerritories || [])) {
  if (t.slug) slugToOid.set(t.slug, String(t._id));
}
for (const [terrOid, discs] of Object.entries(profile)) {
  // terrOid is expected to be an OID string like "66abc123..."
  for (const [disc, count] of Object.entries(discs)) {
    if (count > 0) { discSet.add(disc); terrOidSet.add(terrOid); }
  }
}
const terrList = TERRITORY_DATA.filter(t => terrOidSet.has(slugToOid.get(t.slug)));
// slugToOid.get(t.slug) returns an OID; terrOidSet contains slugs → never matches
```

Because `terrOidSet` is populated with slug strings (what `recomputeDisciplineProfile`
wrote) and the filter checks for OID strings (from `slugToOid`), `terrList` is always
empty. Discipline names DO appear in the left column because `discSet` comes from
profile values (correct), but no territory columns render.

Pressing Retally calls `recomputeDisciplineProfile` again — same bug, no fix.

---

### Task 1 detail -- `recomputeDisciplineProfile` (line 3574)

**Current:**
```js
async function recomputeDisciplineProfile() {
  const profile = {};
  for (const sub of submissions) {
    const rev = sub.feeding_review || {};
    if (rev.pool_status !== 'validated' || !rev.pool_validated) continue;
    let feedTerrs = {};
    try { feedTerrs = JSON.parse(sub.responses?.feeding_territories || '{}'); } catch { feedTerrs = {}; }
    const active = Object.entries(feedTerrs).filter(([, v]) => v && v !== 'none').map(([k]) => resolveTerrId(k)).filter(Boolean);
    if (!active.length) continue;
    const foundDiscs = KNOWN_DISCIPLINES.filter(d => rev.pool_validated.includes(d));
    for (const territory of active) {          // ← territory is a slug
      if (!profile[territory]) profile[territory] = {};
      for (const disc of foundDiscs) {
        profile[territory][disc] = (profile[territory][disc] || 0) + 1;
      }
    }
  }
  // projects loop (lines 3593-3611):
  //   const territory = _resolveProjectTerritory(sub, pIdx);  ← also a slug
  //   if (!profile[territory]) profile[territory] = {};
  //   ...
```

**After:**
```js
async function recomputeDisciplineProfile() {
  await ensureTerritories();
  const slugToOid = new Map();
  for (const t of (cachedTerritories || [])) {
    if (t.slug) slugToOid.set(t.slug, String(t._id));
  }

  const profile = {};
  for (const sub of submissions) {
    const rev = sub.feeding_review || {};
    if (rev.pool_status !== 'validated' || !rev.pool_validated) continue;
    let feedTerrs = {};
    try { feedTerrs = JSON.parse(sub.responses?.feeding_territories || '{}'); } catch { feedTerrs = {}; }
    const active = Object.entries(feedTerrs)
      .filter(([, v]) => v && v !== 'none')
      .map(([k]) => slugToOid.get(resolveTerrId(k)))   // slug → OID
      .filter(Boolean);
    if (!active.length) continue;
    const foundDiscs = KNOWN_DISCIPLINES.filter(d => rev.pool_validated.includes(d));
    for (const terrOid of active) {
      if (!profile[terrOid]) profile[terrOid] = {};
      for (const disc of foundDiscs) {
        profile[terrOid][disc] = (profile[terrOid][disc] || 0) + 1;
      }
    }
  }
  // Projects loop change: convert slug → OID
  for (const sub of submissions) {
    for (const [pIdx, proj] of (sub.projects_resolved || []).entries()) {
      if (!proj?.pool_validated) continue;
      if (proj.pool_status !== 'validated') continue;
      const actionType = proj.action_type_override || proj.action_type;
      const isAmbience = _isAmbienceAction(actionType);
      const isRoteFeed = actionType === 'feed';
      if (!isAmbience && !isRoteFeed) continue;
      const slug = _resolveProjectTerritory(sub, pIdx);   // returns slug
      const terrOid = slug ? slugToOid.get(slug) : null;  // slug → OID
      if (!terrOid) continue;
      const foundDiscs = KNOWN_DISCIPLINES.filter(d => proj.pool_validated.includes(d));
      if (!foundDiscs.length) continue;
      const points = proj.roll?.exceptional ? 2 : 1;
      if (!profile[terrOid]) profile[terrOid] = {};
      for (const disc of foundDiscs) {
        profile[terrOid][disc] = (profile[terrOid][disc] || 0) + points;
      }
    }
  }

  try {
    await updateCycle(selectedCycleId, { discipline_profile: profile });
    ...
  }
}
```

---

### Key functions / constants (do not modify)

- `ensureTerritories()` (line 3714): async, populates `cachedTerritories` from API or
  falls back to `TERRITORY_DATA`. Safe to call multiple times (no-op if already loaded).
- `resolveTerrId(raw)` (defined earlier in file): normalises strings → canonical slug.
  Returns slug, **not** OID. Use it to get the slug, then look up OID via `slugToOid`.
- `_resolveProjectTerritory(sub, pIdx)` (line 10360): returns slug (or null). Same
  treatment — convert to OID after.
- `KNOWN_DISCIPLINES` (line 173): `['Animalism', 'Auspex', 'Celerity', 'Dominate',
  'Majesty', 'Nightmare', 'Obfuscate', 'Resilience', 'Vigor', 'Vigour', 'Protean',
  'Cruac', 'Theban']`. No change needed.
- `cachedTerritories` (line 38): module-level; populated by `ensureTerritories()`.
  Each entry has `.slug` and `._id` (the MongoDB OID as an object or string).

### What NOT to change

- The display renderer (lines 10786-10817) — it is correct; ADR-002 OID-key convention is right
- `_resolveProjectTerritory` — it correctly returns slugs; the fix is in the caller
- `resolveTerrId` — correct slug normaliser; no change
- The `updateCycle` / `allCycles` / `currentCycle` save logic (lines 3614-3621)
- Auto-retally triggers in `saveEntryReview` (lines 3655-3669) — fire-and-forget calls
  are correct; the fix flows through automatically

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Task 1: `recomputeDisciplineProfile` — added `await ensureTerritories()` + local `slugToOid` map at top. Normal-feeding loop now maps resolved slug → OID via `slugToOid.get(...)` before keying profile. Projects loop uses `slug = _resolveProjectTerritory(...)` then `terrOid = slugToOid.get(slug)`, skips if null. Renderer's existing `slugToOid` logic (line 10789) and all save/trigger paths unchanged. Parse check clean.

### File List

- `public/js/admin/downtime-views.js` (modify: `recomputeDisciplineProfile`, lines 3574-3625)
