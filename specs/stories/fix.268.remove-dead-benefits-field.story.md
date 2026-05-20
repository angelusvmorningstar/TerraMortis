# Story fix.268: Remove dead `benefits` field from standing merits

**Story ID:** fix.268
**Epic:** Tech debt
**Status:** review
**Date:** 2026-05-18
**Issue:** [#268](https://github.com/angelusvmorningstar/TerraMortis/issues/268)
**Branch:** ms/issue-268-remove-dead-benefits-field

---

## User Story

As a developer, I want the dead `benefits` array removed from standing merits (schema, writer, and live data), so that the codebase has no orphan fields that mislead future readers.

---

## Acceptance Criteria

- [x] `shEditStandMerit` no longer has the `field === 'benefit'` branch (lines 183-189 of `edit-domain.js`)
- [x] `character.schema.js` no longer accepts `benefits` on standing merits (line 414 removed)
- [x] A migration script exists at `server/scripts/remove-benefits-from-standing-merits.js` that removes `benefits` from all standing merits in production, following the `--dry-run` / `--apply` pattern
- [ ] No regression — manual sheet edit (stand merit fields: cult_name, role, dot4_skill) still saves correctly

---

## Implementation

### File 1 — `public/js/editor/edit-domain.js`

Remove lines 183-189 (the `field === 'benefit'` branch) from `shEditStandMerit`:

```js
// REMOVE this entire branch:
else if (field === 'benefit') {
  const parts = val.split('|');
  const dotIdx = parseInt(parts[0]);
  const text = parts[1] || '';
  if (!m.benefits) m.benefits = ['', '', '', '', ''];
  m.benefits[dotIdx] = text;
}
```

The resulting function (lines 175-192) will have branches only for `cult_name`, `role`, and `dot4_skill`, followed by `_markDirty()` and `_renderSheet(c)`. No other changes to this file.

### File 2 — `server/schemas/character.schema.js`

Remove line 414 only:

```js
// REMOVE:
benefits:      { type: 'array' },
```

**Critical:** `benefit_grants` on the next line (line 415) is a LIVE field used by the MCI tier system — do NOT remove it. These are two entirely separate fields:
- `benefits` (dead) — was a 5-element string array on Professional Training / standing merits
- `benefit_grants` (live) — array of granted child merits on MCI standing merits

### File 3 — `server/scripts/remove-benefits-from-standing-merits.js` (NEW)

Create following the exact pattern of `server/scripts/clean-mci-benefit-grants.js`:

```js
#!/usr/bin/env node
/**
 * One-shot cleanup: remove stale `benefits` array from all standing merits.
 *
 * The `benefits` field was prototyped to store dot-tier descriptive text per
 * standing merit dot (5 empty strings). No UI ever emitted the 'benefit'
 * field name to shEditStandMerit, so no character ever had non-empty values.
 * The orphan writer in edit-domain.js has been removed (issue #268).
 *
 * Usage:
 *   node server/scripts/remove-benefits-from-standing-merits.js --dry-run
 *   node server/scripts/remove-benefits-from-standing-merits.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);

  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, tls: true });

  try {
    await client.connect();
    const dbName = process.env.MONGODB_DB || 'tm_suite';
    const db = client.db(dbName);
    const col = db.collection('characters');

    const characters = await col.find({}).toArray();
    console.log(`Loaded ${characters.length} characters from ${dbName}.characters\n`);

    const toUpdate = [];

    for (const c of characters) {
      const merits = c.merits || [];
      let changed = false;

      for (const m of merits) {
        if (!Object.prototype.hasOwnProperty.call(m, 'benefits')) continue;
        console.log(`${c._id} (${c.name || '—'}) — merit "${m.name || '(unnamed)'}"`);
        console.log(`  benefits (dead field): ${JSON.stringify(m.benefits)}`);
        delete m.benefits;
        changed = true;
      }

      if (changed) toUpdate.push(c);
    }

    console.log(`\nCharacters to update: ${toUpdate.length}`);

    if (DRY_RUN) {
      console.log('DRY RUN — no writes. Re-run with --apply to commit.');
      return;
    }

    if (toUpdate.length === 0) {
      console.log('0 mutations — nothing to write.');
      return;
    }

    let updated = 0;
    for (const c of toUpdate) {
      const result = await col.updateOne({ _id: c._id }, { $set: { merits: c.merits } });
      updated += result.modifiedCount;
    }
    console.log(`\nWrote ${updated} characters.`);

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

---

## Dev Notes

### What NOT to touch

| File | Why |
|------|-----|
| `server/migrate-yusuf-pt.js` | Historical one-time migration; already ran. Modifying it is pointless — it will never run again. Leave as-is. |
| `server/scripts/clean-mci-benefit-grants.js` | Deals with `benefit_grants` on MCI merits — an entirely different live field. Do not touch. |
| `server/scripts/seed-merit-fwb.js` | Contains `'friends-with-benefits'` as a merit key string — completely unrelated. |
| `public/js/dev-fixtures.js` | Has one `benefits` occurrence in fixture snapshot data. Harmless (frontend ignores unknown fields); leave for now unless specifically asked to clean. |
| `benefit_grants` (schema line 415) | Live MCI field — immediately adjacent to the removed line. Do NOT remove it. |

### Confirmed zero read sites

`grep -rn '\.benefits' public/js server --include="*.js"` returns only:
- `edit-domain.js:187-188` (the orphan writer being removed)

No render, no display, no export, no API response ever reads `.benefits`. Safe to remove entirely.

### Confirmed zero live callers of the writer

`grep -rn "'benefit'" public/js` (looking for `shEditStandMerit(..., 'benefit', ...)`) returns only the writer itself. No HTML `onchange` or JS call ever passes `'benefit'` as the field name.

### Migration run order

1. Run `--dry-run` first, confirm affected character count
2. ST runs `--apply` from server directory (`cd server && node scripts/remove-benefits-from-standing-merits.js --apply`)
3. Only then commit the schema removal — this avoids any window where live data has the field but schema rejects it (schema is `additionalProperties: false`)

Actually: since `benefits` is being REMOVED from the schema (not added), running the migration before or after the deploy doesn't matter for validation. The schema won't reject existing documents that have `benefits` after deploy — AJV validation only fires on save operations, and the save path will no longer write the field. But run dry-run first regardless as good practice.

### No test framework

Per CLAUDE.md: verify manually. After implementing, test by opening the sheet editor, editing a Professional Training standing merit (cult_name field), and confirming save still works. No regression should occur since the benefit branch was unreachable.

---

## Files Changed

| File | Change |
|------|--------|
| `public/js/editor/edit-domain.js` | Removed `field === 'benefit'` branch (was lines 183-189) |
| `server/schemas/character.schema.js` | Removed `benefits: { type: 'array' }` (was line 414) |
| `server/scripts/remove-benefits-from-standing-merits.js` | NEW — migration script |

---

## Dev Agent Record

### Completion Notes

- Removed the 7-line `field === 'benefit'` branch from `shEditStandMerit`. Remaining branches (cult_name, role, dot4_skill) untouched.
- Removed `benefits: { type: 'array' }` line from character schema. The adjacent `benefit_grants` line (live MCI field) confirmed untouched.
- Created migration script following the `clean-mci-benefit-grants.js` pattern exactly: `--dry-run` / `--apply` flags, loads all characters, deletes `benefits` from any merit that has it, writes back via `$set: { merits: c.merits }`.
- Regression AC (manual sheet edit) requires on-dev smoke test by user.

### Change Log

- 2026-05-18: Removed dead `benefits` field — writer in edit-domain.js, schema entry, new migration script created (fix.268)
