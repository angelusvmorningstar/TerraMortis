# Story issue-269: Cleanup stale benefit_grants on MCI merits that have tier_grants

Status: review

issue: 269
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/269
branch: morningstar-issue-269-cleanup-stale-benefit-grants

---

## Story

MCI merits can end up with both `benefit_grants` (legacy positional format) and `tier_grants` (current canonical format). The migration script has a guard that skips characters already having `tier_grants`, leaving stale `benefit_grants` behind after re-edits. This story cleans that divergence by:

1. Updating `detectMerits()` in `downtime-form.js` to prefer `tier_grants` over `benefit_grants`
2. Writing and running a DB script that removes `benefit_grants` from MCI merits that already have `tier_grants`
3. Updating the test mirror to cover the `tier_grants` expansion path

---

## Background: the two MCI grant arrays

| Field | Format | Status |
|---|---|---|
| `merits[].benefit_grants` | Positional array, 5 slots (index = dot - 1), items: `{ name, category, rating, qualifier?, area? }` | Legacy — written by `enrich-mci.js` and old `migrate-chars.js` |
| `merits[].tier_grants` | Variable-length, items: `{ tier, name, category, rating, qualifier }` | Canonical — written by current editor; drives `free_mci` dot pool |

The migration function `migrateBenefitGrantsToTierGrants()` (line 87–99) converts `benefit_grants → tier_grants` but only when `tier_grants` is absent:

```js
if (m.tier_grants || !m.benefit_grants || !m.benefit_grants.length) return;  // line 91 — skips if tier_grants exists
```

Characters who had old grants and were later re-edited now have both fields. `tier_grants` is up-to-date; `benefit_grants` reflects the old allocation.

---

## Concrete divergence: Yusuf Kalusicj

```
benefit_grants (STALE):
  [Contacts/1, Allies/Underworld/1, Air of Menace/2, Allies/Finance/3, Resources/3]

tier_grants (CANONICAL):
  [T1:Contacts/1, T4:Allies/Finance/3, T5:Resources/3, T3:Allies/Politics/2, T2:Allies/Bureaucracy/1]
```

Player reconfigured T2 and T3 grants; `tier_grants` updated; `benefit_grants` left behind.

---

## Runtime read path — what actually uses benefit_grants

`public/js/tabs/downtime-form.js:267–274` (the `detectMerits()` expansion loop):

```js
for (const m of merits) {
  if (m.category === 'standing' && Array.isArray(m.benefit_grants)) {
    for (const g of m.benefit_grants) {
      if (g.category !== 'influence') continue;
      if (directInfluenceNames.has(g.name)) continue;           // suppression guard
      expandedInfluence.push({ ...g, _from_mci: m.cult_name || m.name });
    }
  }
}
```

The suppression guard (`directInfluenceNames.has(g.name)`) means stale `benefit_grants` are **already inert** for Yusuf (he has direct Contacts/Allies/Resources). But a character who has a `benefit_grants`-sourced influence merit with **no direct counterpart** (e.g. Charlie Ballsack's Retainer-via-MCI) would lose it in the DT form if `benefit_grants` is simply deleted without updating this loop.

**The fix is to update the loop to prefer `tier_grants`, then delete `benefit_grants`.**

---

## Part A — Update detectMerits() in downtime-form.js

### File

- `public/js/tabs/downtime-form.js`

### Change

Lines 266–273 — replace the expansion loop to prefer `tier_grants`, fall back to `benefit_grants`:

```js
// BEFORE
for (const m of merits) {
  if (m.category === 'standing' && Array.isArray(m.benefit_grants)) {
    for (const g of m.benefit_grants) {
      if (g.category !== 'influence') continue;
      if (directInfluenceNames.has(g.name)) continue;
      expandedInfluence.push({ ...g, _from_mci: m.cult_name || m.name });
    }
  }
}

// AFTER
for (const m of merits) {
  if (m.category !== 'standing') continue;
  const grants = Array.isArray(m.tier_grants) ? m.tier_grants
               : Array.isArray(m.benefit_grants) ? m.benefit_grants
               : [];
  for (const g of grants) {
    if (g.category !== 'influence') continue;
    if (directInfluenceNames.has(g.name)) continue;
    expandedInfluence.push({ ...g, _from_mci: m.cult_name || m.name });
  }
}
```

**Why this works:** both grant formats share the same relevant fields (`name`, `category`, `rating`, `qualifier`). The extra `tier` field on `tier_grants` items is spread into the push but ignored by all downstream consumers.

**Fallback preserved:** characters that only have `benefit_grants` (untouched legacy) still work correctly.

---

## Part B — Update detect-merits-retainer.test.js

### File

- `server/tests/detect-merits-retainer.test.js`

The test file says: *"Update this if the algorithm changes."* (line 13)

### Change

1. Update the `detectRetainers()` re-implementation in the test to mirror the new loop logic (prefer `tier_grants`, fall back to `benefit_grants`).

2. Add a test case for the `tier_grants` expansion path:

```js
it('detects Retainer sourced from a standing-merit tier_grants chain', () => {
  const c = {
    merits: [
      {
        category: 'standing',
        name: 'Mystery Cult Initiation',
        cult_name: 'The Test Cult',
        tier_grants: [
          { tier: 1, name: 'Retainer', category: 'influence', rating: 1, qualifier: null }
        ]
      }
    ]
  };
  const result = detectRetainers(c);
  expect(result).toHaveLength(1);
  expect(result[0].name).toBe('Retainer');
  expect(result[0]._from_mci).toBe('The Test Cult');
});
```

3. Keep all existing tests — they must continue to pass. The `benefit_grants` path still works under the new fallback logic.

---

## Part C — Write and run the DB cleanup script

### File to create

`server/scripts/clean-mci-benefit-grants.js`

### Script behaviour

- Scans all characters in `tm_suite.characters`
- For each MCI merit with **both** `tier_grants` (non-empty array) **and** `benefit_grants` (non-empty array):
  - In dry-run: logs the character name, MCI cult name, and both arrays side by side
  - In apply: `$unset`s `benefit_grants` from that MCI merit (writes updated `merits` array)
- Does NOT touch MCI merits that have **only** `benefit_grants` (untouched legacy characters)
- Does NOT modify `tier_grants`
- Usage: `node server/scripts/clean-mci-benefit-grants.js --dry-run` then `--apply`

### Script skeleton

```js
#!/usr/bin/env node
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, tls: true });
  await client.connect();
  const col = client.db(process.env.MONGODB_DB || 'tm_suite').collection('characters');

  const characters = await col.find({}).toArray();
  const toUpdate = [];

  for (const c of characters) {
    const merits = c.merits || [];
    let changed = false;
    for (const m of merits) {
      if (m.name !== 'Mystery Cult Initiation') continue;
      if (!Array.isArray(m.tier_grants) || !m.tier_grants.length) continue;
      if (!Array.isArray(m.benefit_grants) || !m.benefit_grants.filter(Boolean).length) continue;

      console.log(`${c._id} (${c.name}) — MCI "${m.cult_name || '(no cult name)'}"`);
      console.log(`  benefit_grants (stale): ${JSON.stringify(m.benefit_grants)}`);
      console.log(`  tier_grants (canonical): ${JSON.stringify(m.tier_grants)}`);
      delete m.benefit_grants;
      changed = true;
    }
    if (changed) toUpdate.push(c);
  }

  console.log(`\nCharacters to update: ${toUpdate.length}`);
  if (DRY_RUN) { console.log('DRY RUN — re-run with --apply to commit.'); await client.close(); return; }

  for (const c of toUpdate) {
    await col.updateOne({ _id: c._id }, { $set: { merits: c.merits } });
  }
  console.log(`Wrote ${toUpdate.length} characters.`);
  await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
```

### Run order (user runs these themselves)

```
node server/scripts/clean-mci-benefit-grants.js --dry-run
# Inspect output — verify affected characters are as expected (Yusuf + any others)
node server/scripts/clean-mci-benefit-grants.js --apply
```

---

## Acceptance Criteria

**AC-1 — Code: tier_grants expansion path works**
Given an MCI merit with `tier_grants` containing an influence grant and no direct merit of that name,
When `detectMerits()` runs for that character,
Then the tier_grants grant appears in the expanded influence pool with `_from_mci` set.

**AC-2 — Code: benefit_grants fallback preserved**
Given an MCI merit with only `benefit_grants` (no `tier_grants`),
When `detectMerits()` runs,
Then the benefit_grants influence grants still appear (no regression for legacy-only characters).

**AC-3 — Code: suppression guard unchanged**
Given an MCI merit (via either grants field) listing an influence merit whose name already has a direct merit,
When `detectMerits()` runs,
Then the grant is suppressed (no double-count).

**AC-4 — Test: detect-merits-retainer.test.js**
All existing tests pass. A new test for `tier_grants` sourced retainer detection passes.

**AC-5 — DB: affected characters cleaned**
After running `--apply`, re-running `--dry-run` shows 0 characters to update.

**AC-6 — DB: legacy-only characters untouched**
Any MCI merit with `benefit_grants` but no `tier_grants` is not modified by the script.

---

## Implementation Notes

- **Do not modify the migration script** `server/scripts/migrate-legacy-character-fields.js`. The issue with its guard is that it was correct for its original job (convert-if-absent). This story handles the case it couldn't: characters with both fields.
- **Do not change `tier_grants` data** — it is canonical and correct.
- **Do not change `character.schema.js`** — `benefit_grants` stays in the schema as a tolerated legacy field (some characters may still have it legitimately until all are migrated through the editor).
- The new script belongs in `server/scripts/` alongside `migrate-legacy-character-fields.js`, following the same `--dry-run` / `--apply` CLI pattern.
- After the code changes, run: `node --input-type=module < public/js/tabs/downtime-form.js` to confirm no parse errors.
- After the code and test changes, run the test: `npx vitest run server/tests/detect-merits-retainer.test.js`

---

## Dev Agent Record

### Files Modified
- `public/js/tabs/downtime-form.js` — expansion loop prefers `tier_grants` over `benefit_grants` (prefer canonical, fall back to legacy)
- `server/tests/detect-merits-retainer.test.js` — mirrored new algorithm; added `tier_grants` sourced retainer test case (7/7 pass)
- `server/scripts/clean-mci-benefit-grants.js` — new DB cleanup script (user runs `--dry-run` then `--apply`)

### Completion Notes
Part A: surgical swap in `detectMerits()` expansion loop — one `if` replaced with a `const grants` picker. Both grant formats expose the same `name/category/rating` fields; the `tier` field on `tier_grants` items is harmlessly spread and ignored. Fallback to `benefit_grants` preserved for untouched legacy characters.

Part B: test mirror updated to match new loop logic; new test validates `tier_grants` path. All 7 tests green including 6 pre-existing cases.

Part C: new script follows identical `--dry-run / --apply` CLI convention as `migrate-legacy-character-fields.js`. Targets only MCI merits with both fields populated (intersection of stale+migrated); legacy-only merits untouched.

---

## Out of Scope

- Issue #268 (remove dead `benefits` 5-element array + orphan writer in `edit-domain.js`) — related family, separate story.
- Updating `validate-chars.js` — its `benefit_grants` checks are still valid (they detect the legacy-only-format case, which still exists for untouched characters).
- Updating `migrate-legacy-character-fields.js` guard — the guard's original semantics remain correct; this story handles the residual case through a dedicated cleanup script.
- Removing `benefit_grants` from the character schema — keep it tolerated; not all legacy characters have been re-edited yet.
