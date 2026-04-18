# Story feat.10: Covenant Standings Fix

**Story ID:** feat.10
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST viewing a character sheet in the game app, I want the covenant strip to show only the character's standing with *other* covenants, so that characters with Circle of the Crone (or any other covenant) don't display a spurious entry for their own covenant.

---

## Background & Data Model

### Schema intent

`covenant_standings` (`schemas/schema_v2_proposal.md` lines 52–62) is an object keyed by short label:

```
{ "Carthian": 0, "Crone": 0, "Lance": 0 }   // example for an Invictus character
```

It holds the character's standing with **other** covenants only. The character's own covenant standing is stored in `status.covenant` and must **never** appear in `covenant_standings`.

### Short label mapping (defined in `editor/sheet.js` line 1553)

```js
const covSM = {
  'Carthian Movement':  'Carthian',
  'Circle of the Crone': 'Crone',
  'Invictus':            'Invictus',
  'Lancea et Sanctum':   'Lance',
};
```

Ordo Dracul has no short label in this map and is excluded from the cov-strip entirely — this is correct and must not be changed.

### Confirmed data error

Alice Vunder (`covenant: "Circle of the Crone"`, `status.covenant: 2`) has:
```json
"covenant_standings": { "Crone": 2 }
```
The "Crone" key should not exist. This is confirmed widespread across the character set — original data entry did not exclude the own-covenant label from `covenant_standings`.

### Why the editor doesn't reproduce this

`editor/sheet.js` line 1554 correctly filters the own covenant from the cov-strip:
```js
const covS = covLbls.filter(l => l !== pLbl).map(l => ({ ... }));
```
The edit buttons (`shCovStandingUp/Down` in `editor/edit.js`) are only rendered for labels that pass this filter, so the admin editor cannot re-introduce the bug. The dirty data is legacy from original import/data entry.

### The render bug

`public/js/suite/sheet.js` lines 168–180 renders every entry in `c.covenant_standings` with no filter:
```js
const covStandings = c.covenant_standings || {};
const covSEntries = Object.entries(covStandings).filter(([, v]) => v !== undefined);
```
This faithfully renders the erroneous "Crone: 2" entry as "Crone ○".

---

## Implementation Plan

### Task 1 — Defensive render filter in the game app sheet

**File:** `public/js/suite/sheet.js` — cov-strip block (~line 168)

Derive the own-covenant short label from `c.covenant` using the same `covSM` map as the editor, then exclude it from `covSEntries`:

```js
const covStandings = c.covenant_standings || {};
const COV_SHORT = {
  'Carthian Movement': 'Carthian',
  'Circle of the Crone': 'Crone',
  'Invictus': 'Invictus',
  'Lancea et Sanctum': 'Lance',
};
const ownLabel = COV_SHORT[c.covenant] || null;
const covSEntries = Object.entries(covStandings)
  .filter(([label, v]) => v !== undefined && label !== ownLabel);
if (covSEntries.length) {
  // ... existing render loop unchanged
}
```

No other changes to the render block.

### Task 2 — One-shot data migration script

**New file:** `server/scripts/fix-covenant-standings.js`

Script removes the own-covenant key from `covenant_standings` for every affected character. The user runs this manually.

```js
// server/scripts/fix-covenant-standings.js
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const COV_SHORT = {
  'Carthian Movement':   'Carthian',
  'Circle of the Crone': 'Crone',
  'Invictus':            'Invictus',
  'Lancea et Sanctum':   'Lance',
  'Ordo Dracul':         'Ordo',
};

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const chars = db.collection('characters');

const all = await chars.find({}).toArray();
let fixed = 0;

for (const c of all) {
  const ownLabel = COV_SHORT[c.covenant];
  if (!ownLabel) continue;
  if (c.covenant_standings && ownLabel in c.covenant_standings) {
    await chars.updateOne(
      { _id: c._id },
      { $unset: { [`covenant_standings.${ownLabel}`]: '' } }
    );
    console.log(`Fixed: ${c.name} — removed covenant_standings.${ownLabel}`);
    fixed++;
  }
}

console.log(`\nDone. ${fixed} character(s) updated.`);
await client.disconnect();
```

Run with: `node server/scripts/fix-covenant-standings.js`

---

## Acceptance Criteria

- [ ] Alice Vunder's character sheet in the game app shows no "Crone" entry in the cov-strip
- [ ] Characters with legitimate cross-covenant standings (standing with other covenants) continue to display correctly
- [ ] Ordo Dracul characters are unaffected (no cov-strip, no regression)
- [ ] Migration script runs without error and reports the number of characters fixed
- [ ] After migration: `db.characters.findOne({name: "Alice Vunder"}).covenant_standings` has no "Crone" key; `status.covenant` is unchanged at 2

---

## Files to Change

| File | Change |
|---|---|
| `public/js/suite/sheet.js` | Add `COV_SHORT` map + filter `ownLabel` from `covSEntries` in cov-strip block (~line 168) |
| `server/scripts/fix-covenant-standings.js` | **New** — one-shot migration to unset own-covenant key from all affected documents |

**Do not touch:**
- `public/js/editor/sheet.js` — already filters correctly at line 1554
- `public/js/editor/edit.js` — `shCovStandingUp/Down` are safe; UI never renders buttons for own covenant
- Any player portal files

---

## Critical Constraints

- The `COV_SHORT` map in `suite/sheet.js` must be consistent with the one in `editor/sheet.js` line 1553 — same four covenants, same labels
- Ordo Dracul is intentionally absent from the short-label map in both files — do not add it
- Migration script uses `$unset` not `$set` — it must not touch `status.covenant`
- The user runs the migration script themselves; do not auto-run it

---

## Reference

- Schema: `schemas/schema_v2_proposal.md` lines 52–62
- Existing cov-strip render (buggy): `public/js/suite/sheet.js` lines 168–180
- Correct filter pattern to mirror: `public/js/editor/sheet.js` line 1553–1554
- `shCovStandingUp/Down`: `public/js/editor/edit.js` lines 265–280
- Data: MongoDB `tm_suite.characters` — `covenant_standings` field; confirmed dirty on Alice Vunder and widespread
