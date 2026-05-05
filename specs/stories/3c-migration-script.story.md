---
id: issue-3c
issue: 3
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/3
branch: issue-3c-migration-script
status: ready-for-review
priority: high
depends_on: ['issue-3-territory-fk-adr', 'issue-3b']
parent: issue-3
---

# Story #3c: Migration script — slug → `_id` across `tm_suite`

As an ST whose production data still holds slug-keyed cross-document FKs that the new server contract no longer recognises,
I should run a one-shot migration script that rewrites every slug FK to its corresponding territory `_id` and renames the legacy `id` field to `slug`,
So that on-disk data matches the schema/route contract that #3b shipped to `dev`, before #3d's client refactor goes live.

This story implements **migration step 3** from ADR-002. Same shape as `cleanup-rfr-territory-residue.js` (PR #20): dry-run by default, `--apply` for the actual op, backup-before-write, safety guard, idempotent re-runs.

---

## Context

#3b landed on `dev` at commit `e773e2b`. The server now speaks `_id`-as-FK; the slug-keyed contract is gone from the API. But the **on-disk data is still in the old shape**:

- `tm_suite.territories` — 5 docs, each carries an `id` field (the slug). Schema has been renamed `id → slug` but the on-disk field name is still `id`. Data needs `$rename: { id: 'slug' }`.
- `tm_suite.downtime_cycles.regent_confirmations` — empty across all live cycles per ADR-002 audit. Migration touches near-zero data here.
- `tm_suite.downtime_cycles.confirmed_ambience` / `discipline_profile` / `territory_pulse` — slug-keyed objects in some closed cycles. Keys need rekeying from slug → `String(territory._id)`.
- `tm_suite.territory_residency` — 0 docs. Schema-only effectively, but the script should still inspect for any unexpected docs and rename `territory` → `territory_id` if found.
- `tm_suite.downtime_submissions.responses.feeding_territories` — out of scope per Q4. The slug-variant pattern stays as a legacy reader (`TERRITORY_SLUG_MAP`).

### What this script does

1. **Connect** to `tm_suite`.
2. **Build slug → `_id` map** from current territories collection. Each doc currently has both `id` (slug) and `_id` (ObjectId); read `id || slug` for robustness against partial state. The map is `{ secondcity: '<oidstr>', northshore: '<oidstr>', ... }`.
3. **Audit pass (read-only)** — count expected mutations across all four document types. Print summary.
4. **Apply (only with `--apply`)**:
   a. **Backup**: write `_backups/territory-fk-migration-<ISO>.json` with snapshots of `territories` and all `downtime_cycles` and any `territory_residency` documents.
   b. **Rewrite cycles** — for each cycle:
      - `regent_confirmations[i].territory_id`: if slug, replace with `_id`-string from map.
      - Rekey `confirmed_ambience`, `discipline_profile`, `territory_pulse` — for each key that's a slug, replace with `_id`-string. Keys already `_id`-shaped (24 hex chars) are left alone (idempotency).
   c. **Rewrite residency** (if any docs): `$rename` `territory` → `territory_id`; resolve the old `territory` value (a name string) against territories collection, replace with `_id`-string.
   d. **Rename territory field**: for each territory doc, `$rename: { id: 'slug' }`.
5. **Re-audit** — confirm no slug-shaped keys remain in any of the rekeyed objects. Print final state.
6. **Idempotent**: a second `--apply` run detects nothing to migrate (all keys already `_id`-shaped, no `id` field on territories) and exits 0 with `already-migrated: true`.

### Files in scope

- `server/scripts/migrate-territory-fk.js` (new) — the migration script.
- The story file (Dev Agent Record + dry-run output captured before user authorises apply).

### Files NOT in scope

- **Any code change beyond the script.** No client touched (#3d). No reference data alignment (#3e). No removal of the `territory.slug || territory.id` fallback at `routes/territories.js:122` (that stays — `id` field is gone after this script applies, but removing the fallback ships in #3e per ADR-002 Step 6).
- **`downtime_submissions.responses.feeding_territories`** — leave as user-typed slug-variants per Q4.
- **`server/utils/territory-slugs.js`** — demoted to legacy reader in #3e.
- **Dead client block** in `downtime-form.js:73, 1311-1317` — out of scope per user's Q5; file as a separate cleanup issue post-migration.

---

## Acceptance Criteria

**Given** the script is invoked without `--apply`
**When** it runs against the live MongoDB
**Then** it prints the slug→`_id` map, an audit table of expected mutations (per cycle, per object map, plus the territory-rename count), and **does not modify anything**. Exit 0.

**Given** the script is invoked with `--apply`
**When** it runs against the live MongoDB
**Then** it writes a backup file, applies all four mutation types, prints per-mutation counts, and re-audits to confirm the post-state. Exit 0 on success, non-zero on any safety abort.

**Given** the safety guard finds a slug-keyed value in a cycle that doesn't resolve to any territory in the slug→`_id` map
**When** the script runs in either mode
**Then** it aborts with a clear error citing the unresolved slug + the cycle `_id` + the field path. No partial mutations. Exit code distinct from "success" and "config error".

**Given** the script is run twice with `--apply`
**When** the second run executes
**Then** it detects nothing to migrate (`territories` have no `id` field; cycles' object maps have no slug-shaped keys), reports `already-migrated: true`, and exits 0 without writing a backup file.

**Given** the apply completes successfully
**When** an audit query checks the post-state
**Then**:
- Every territory doc has `slug` (renamed from `id`); no doc has `id` field.
- Every `regent_confirmations[i].territory_id` value is a 24-character hex string (no slug strings).
- Every `confirmed_ambience` / `discipline_profile` / `territory_pulse` key is a 24-character hex string (no slug keys).
- Any `territory_residency` doc has `territory_id` (renamed from `territory`), value is a 24-character hex string.

**Given** the apply completes successfully
**When** the running server (`dev` contract) reads territories and cycles
**Then** all routes (POST, PATCH, confirm-feeding) work correctly with the new on-disk shape. Server tests on dev still pass.

**Given** the script is committed to the repo
**When** a future operator wants to read the audit trail
**Then** the script is at `server/scripts/migrate-territory-fk.js` with a docstring covering the scope, the Q1/Q2/Q5 ADR decisions, and the actual production run-history (date, source commit SHA, mutations applied — added by SM after running `--apply`).

---

## Implementation Notes

### Script shape (sketch)

Modelled directly on `cleanup-rfr-territory-residue.js`. Pattern:

```js
#!/usr/bin/env node
/**
 * One-off migration: rewrite slug-keyed FKs across tm_suite to use territory _id strings.
 * Implements ADR-002 step 3 (specs/architecture/adr-002-territory-fk.md).
 *
 * Decisions honoured:
 *   - Q1 retain-as-slug: $rename territories.id → territories.slug (keep field as label).
 *   - Q2 strict cutover: post-apply, no slug FKs anywhere on disk in scope.
 *   - Q5 migrate residency: rename territory_residency.territory → territory_id.
 *   - Q4 leave submissions: feeding_territories keys NOT touched.
 *
 * Targets:
 *   - territories: $rename id → slug
 *   - downtime_cycles.regent_confirmations[].territory_id: slug → _idstr
 *   - downtime_cycles.confirmed_ambience: rekey slug → _idstr
 *   - downtime_cycles.discipline_profile: rekey slug → _idstr
 *   - downtime_cycles.territory_pulse: rekey slug → _idstr
 *   - territory_residency: $rename territory → territory_id, resolve name → _idstr
 *
 * Usage:
 *   cd server && node scripts/migrate-territory-fk.js          # dry-run
 *   cd server && node scripts/migrate-territory-fk.js --apply  # actual mutation
 *
 * Always writes a backup before applying. Idempotent re-runs return 0.
 *
 * Run history:
 *   - <yet to run>
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI missing'); process.exit(1); }

const HEX24 = /^[0-9a-f]{24}$/i;
const isOidShaped = s => typeof s === 'string' && HEX24.test(s);

const client = new MongoClient(URI);
await client.connect();
const db = client.db('tm_suite');

// Step 1: build slug → _idstr map from territories
const territories = await db.collection('territories').find().toArray();
const slugToOid = new Map();
for (const t of territories) {
  const slug = t.id ?? t.slug;
  if (slug) slugToOid.set(slug, String(t._id));
}
console.log('slug → _id map:');
for (const [s, o] of slugToOid) console.log(`  '${s}' → ${o}`);

// Step 2: audit pass
let plan = { cycles: [], terrRename: 0, residencyRename: 0, alreadyMigrated: true };

const cycles = await db.collection('downtime_cycles').find().toArray();
for (const cycle of cycles) {
  const cyclePlan = { _id: String(cycle._id), confirmations: 0, ambience: 0, profile: 0, pulse: 0 };

  for (const c of (cycle.regent_confirmations || [])) {
    if (slugToOid.has(c.territory_id)) cyclePlan.confirmations++;
    else if (!isOidShaped(c.territory_id)) {
      console.error(`SAFETY: cycle ${cycle._id} regent_confirmations has unresolved territory_id="${c.territory_id}"`);
      process.exit(2);
    }
  }
  for (const obj of [['confirmed_ambience','ambience'], ['discipline_profile','profile'], ['territory_pulse','pulse']]) {
    const [field, label] = obj;
    if (!cycle[field]) continue;
    for (const k of Object.keys(cycle[field])) {
      if (slugToOid.has(k)) cyclePlan[label]++;
      else if (!isOidShaped(k)) {
        console.error(`SAFETY: cycle ${cycle._id} ${field} has unresolved key="${k}"`);
        process.exit(2);
      }
    }
  }

  if (cyclePlan.confirmations + cyclePlan.ambience + cyclePlan.profile + cyclePlan.pulse > 0) {
    plan.cycles.push(cyclePlan);
    plan.alreadyMigrated = false;
  }
}

plan.terrRename = territories.filter(t => t.id !== undefined).length;
if (plan.terrRename > 0) plan.alreadyMigrated = false;

const residency = await db.collection('territory_residency').find().toArray();
plan.residencyRename = residency.filter(r => r.territory !== undefined && r.territory_id === undefined).length;
if (plan.residencyRename > 0) plan.alreadyMigrated = false;

console.log('\n--- Audit ---');
console.log(JSON.stringify(plan, null, 2));

if (plan.alreadyMigrated) {
  console.log('\nalready-migrated: true');
  await client.close();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nDRY-RUN — re-run with --apply to execute.');
  await client.close();
  process.exit(0);
}

// Step 3: backup
const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, '_backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `territory-fk-migration-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({
  territories,
  cycles,
  residency,
  capturedAt: stamp,
}, null, 2));
console.log(`\nBackup → ${backupPath}`);

// Step 4: apply mutations
let counts = { confirmations: 0, ambience: 0, profile: 0, pulse: 0, terrRename: 0, residencyRename: 0 };

for (const cycle of cycles) {
  const updates = {};
  let dirty = false;

  // regent_confirmations
  if (cycle.regent_confirmations?.length) {
    const newConfirms = cycle.regent_confirmations.map(c => {
      const oid = slugToOid.get(c.territory_id);
      if (oid && !isOidShaped(c.territory_id)) {
        counts.confirmations++;
        return { ...c, territory_id: oid };
      }
      return c;
    });
    if (newConfirms.some((c, i) => c.territory_id !== cycle.regent_confirmations[i].territory_id)) {
      updates.regent_confirmations = newConfirms;
      dirty = true;
    }
  }

  // object rekeys
  for (const [field, label] of [['confirmed_ambience','ambience'], ['discipline_profile','profile'], ['territory_pulse','pulse']]) {
    if (!cycle[field]) continue;
    const old = cycle[field];
    const next = {};
    let changed = false;
    for (const [k, v] of Object.entries(old)) {
      const oid = slugToOid.get(k);
      if (oid && !isOidShaped(k)) {
        next[oid] = v;
        counts[label]++;
        changed = true;
      } else {
        next[k] = v;
      }
    }
    if (changed) {
      updates[field] = next;
      dirty = true;
    }
  }

  if (dirty) {
    await db.collection('downtime_cycles').updateOne({ _id: cycle._id }, { $set: updates });
  }
}

// Territory $rename id → slug
if (plan.terrRename > 0) {
  const r = await db.collection('territories').updateMany({ id: { $exists: true } }, { $rename: { id: 'slug' } });
  counts.terrRename = r.modifiedCount;
}

// Residency rename territory → territory_id (resolving name → _id)
for (const doc of residency) {
  if (doc.territory_id !== undefined) continue;
  // doc.territory is a NAME string ("The North Shore" etc.). Resolve via territories.find().
  const terr = territories.find(t => t.name === doc.territory);
  if (!terr) {
    console.error(`SAFETY: residency doc ${doc._id} territory='${doc.territory}' has no matching territory by name`);
    process.exit(2);
  }
  await db.collection('territory_residency').updateOne(
    { _id: doc._id },
    { $set: { territory_id: String(terr._id) }, $unset: { territory: '' } }
  );
  counts.residencyRename++;
}

console.log('\n--- Apply counts ---');
console.log(JSON.stringify(counts, null, 2));

// Step 5: re-audit
const postT = await db.collection('territories').find({ id: { $exists: true } }).toArray();
console.log(`\nPost-state: territories with legacy id field = ${postT.length} (expected 0)`);

await client.close();
```

### Critical safety properties

1. **Map is built before any writes.** The slug→`_id` map is captured up-front from `territories` (reading `id || slug` for tolerance). All subsequent rewrites consult the map; no second read of territories.
2. **Backup before any write.** `mkdirSync` → `writeFileSync` → mutations. Sequential await chain — any throw aborts before mutations.
3. **Safety abort on unknown slugs.** If a cycle has `confirmed_ambience['mystery_slug']` and `mystery_slug` isn't in the map, the script aborts with exit 2. No partial writes.
4. **Idempotency by key shape.** The script detects already-migrated state by checking for legacy `id` field on territories AND any non-OID-shaped keys in cycle object maps. If neither exists, exits with `already-migrated: true`.
5. **No data loss.** All operations are `$set` / `$rename` / `$unset`. The backup retains the pre-state regardless.

### What this story does NOT remove

- The `territory.slug || territory.id` fallback at `server/routes/territories.js:122` — Ma'at's #3b QA flagged this as transitional code that becomes dead after this migration runs. **Removal is deferred to #3e** per ADR-002 Step 6 (legacy compatibility removal). Adding it to #3c risks the deploy-window discipline: between this PR's merge and the user running `--apply`, the fallback is still load-bearing.

---

## Test Plan

This is destructive prod-data work, layered like β:

1. **Static review (Ma'at)** — read the script. Confirm: slug→`_id` map building, safety abort on unknown slugs, backup-before-write sequence, idempotency check, exit codes, scope discipline (no other code touched).

2. **Dry-run (Ptah, then Ma'at, then SM)** — `node scripts/migrate-territory-fk.js`. Each reviewer confirms the plan looks reasonable: which cycles touched, how many slugs to rekey, the slug→`_id` map. **Capture Ptah's dry-run verbatim into the Dev Agent Record.**

3. **User authorisation step** — explicit go-ahead in chat before `--apply`.

4. **Apply (SM)** — `node scripts/migrate-territory-fk.js --apply`. Verify: backup file written, per-mutation counts match dry-run plan, post-state audit shows zero legacy slugs.

5. **Post-apply audit (Ma'at)** — independent audit query confirming:
   - All 5 territories have `slug`, none have `id`.
   - All cycle object maps' keys are 24-char hex strings.
   - Server tests still pass against the post-migration data (run `cd server && npm test` and confirm no regression).

6. **Idempotency check** — re-run `--apply`. Confirm `already-migrated: true`, exit 0.

7. **Server smoke** — bring up `cd server && npm run dev` against the migrated data. Exercise a few routes (GET territories, POST update by `_id`, PATCH feeding-rights). Confirm functional.

---

## Definition of Done

- [x] Script lives at `server/scripts/migrate-territory-fk.js`, exec bit set, docstring complete with run-history placeholder
- [x] Dry-run output reviewed by Ptah *(captured in Dev Agent Record below; awaits Maat + SM)*
- [ ] User explicitly authorises `--apply` *(SM gate)*
- [ ] `--apply` executed; backup file present; per-mutation counts captured *(SM step)*
- [ ] Post-apply audit (Ma'at) confirms zero legacy slugs across territories + cycles
- [ ] Idempotency check confirmed (`already-migrated: true` on re-run)
- [ ] Server tests pass against the post-migration data
- [ ] Run history docstring updated post-apply with date + commit SHA + counts
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body cross-references parent issue #3 + ADR-002

---

## Note for Ptah

This is a slightly more complex shape than `cleanup-rfr-territory-residue.js` because:

1. The migration involves **building a map and consulting it across multiple collection reads/writes** rather than just deleting a known set of `_id`s.
2. There are **four distinct mutation types** (regent_confirmations array entry, three object-rekey operations, plus the territory rename).
3. The audit has to count expected mutations per type so the user can see what will happen before authorising.

Take it in steps:

1. Probe the live data first (read-only) to verify the ADR-002 audit's claims still hold (all 5 territories present, regent_confirmations empty, etc.). Build the actual slug→`_id` map.
2. Implement the dry-run path. Run it. Capture output.
3. Implement the apply path. **Do not run it.** That's SM's step after user authorisation.
4. Run the dry-run again at the end to confirm no regressions in the audit logic from your apply-path implementation.

**Hard rule (same as β):** **do NOT run with `--apply`.** Backup → mutate → re-audit only happens via SM after the user's explicit go-ahead.

If anything in the audit is unexpected (a cycle with unresolved keys, an unknown collection field, a residency doc that exists), surface it in your reply rather than fixing it in the script. The user/SM will decide how to handle.

## Note for Ma'at

This is the highest-risk migration in the territory FK refactor — it transforms shape across two collections plus rekeys nested objects. Static review priorities:

1. **Map building** — read `id ?? slug` for tolerance during partial states. The map is an authoritative slug→`_id` resolver; any divergence corrupts.
2. **Safety abort** — unknown slug in a cycle MUST abort, not silently skip. Verify exit codes are non-zero.
3. **Backup completeness** — territories + cycles + residency, all three. If a recovery is needed, the backup is the only ground truth.
4. **Idempotency** — the second `--apply` should detect already-migrated state by checking for both legacy `id` field on territories AND non-OID-shaped keys in cycle object maps. Both checks needed; either alone is incomplete.
5. **Order of operations on disk** — the territory rename can happen at any point because it's independent of the cross-doc rewrites (the script reads from territories before any mutation). But verify the script reads the slug map BEFORE the territory rename, otherwise the second-call lookup would miss.

After Ptah's reply, run your own dry-run and compare output. Append your QA Results commit before the apply gate.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (1):**
- `server/scripts/migrate-territory-fk.js` (new, exec bit set, +218) — modelled directly on `cleanup-rfr-territory-residue.js` (PR #20). Dry-run default, `--apply` for actual op, `--help` flag, backup-before-write, safety guards, idempotent re-run, distinct exit codes (0 success / dry-run / already-migrated; 1 config; 2 safety abort).

**Live data probe (read-only, executed first per Note for Ptah §1):**
A throwaway probe script `server/scripts/_probe-tm-territory-fk.mjs` was written, executed, and deleted before commit. It surfaced one **important deviation from the ADR-002 audit**:

> ADR-002 §Live-data baseline reported `territory_residency.count = 0`. **Live state on 2026-05-05 shows 4 documents** with residents lists of 3, 7, 4, 6.

This means the dead-client-block analysis from ADR-002 Q5 is **only partially correct**: the consumer at `public/js/tabs/downtime-form.js:1311-1317` populates `residencyByTerritory` with documents that *something* has been writing to the collection between the ADR audit and now. Either:
1. There is a write path I missed in the ADR audit, or
2. Someone manually populated these documents in the gap between the ADR and #3b shipping, or
3. The dead client block is actually being read somewhere I missed.

Either way, **the migration script handles all 4 docs correctly**: it resolves the legacy `territory` field (a name string like "The Academy") to the territory's `_id` via `territories.find(t => t.name === doc.territory)`, all 4 names resolve cleanly to 4 of the 5 known territories (only "The Dockyards" has no residency doc).

I did **not** investigate the writer. Per the user's Q5 decision the dead-client question is for a follow-on cleanup story, and the migration script handles the docs as-is regardless of who's writing them.

**slug → _id map (5 entries, all unique):**
```
'secondcity' → 69d9e54c00815d471503bea8
'northshore' → 69d9e54b00815d471503bea6
'dockyards'  → 69d9e54c00815d471503bea9
'academy'    → 69d9e54b00815d471503bea7
'harbour'    → 69d5dc6a00815d47150397c6
```

**Dry-run output (verbatim, executed locally with no `--apply`):**

```
slug → _id map:
  'secondcity' → 69d9e54c00815d471503bea8
  'northshore' → 69d9e54b00815d471503bea6
  'dockyards' → 69d9e54c00815d471503bea9
  'academy' → 69d9e54b00815d471503bea7
  'harbour' → 69d5dc6a00815d47150397c6

--- Audit ---
{
  "territories": {
    "rename": 5
  },
  "cycles": [
    {
      "_id": "69d0a3c5052b57f6be774e69",
      "label": "Downtime 2",
      "confirmations": 0,
      "ambience": 5,
      "profile": 5,
      "pulse": 0
    }
  ],
  "residency": {
    "rename": 4,
    "total": 4
  },
  "alreadyMigrated": false
}

DRY-RUN — re-run with --apply to execute.
```

**Expected mutations on `--apply`: 19 total**
- 5 territory documents `$rename id → slug`
- Downtime 2 cycle: 5 `confirmed_ambience` keys rekeyed (slug → _id) + 5 `discipline_profile` keys rekeyed = 10 in-place rewrites
- 4 territory_residency documents `$rename territory → territory_id` (with name-to-_id resolution)
- 0 `regent_confirmations` rewrites (none are slug-shaped; matches ADR audit)
- 0 `territory_pulse` rewrites (no cycles populate this field)

**Safety guards exercised in dry-run:**
- All cycle keys resolve via the map (no SAFETY ABORT exit 2 triggered).
- All 4 residency `territory` values resolve to a territory `name` (no SAFETY ABORT triggered).
- Idempotency detection: `alreadyMigrated: false` correctly triggered by 5 territories with legacy `id` field + 1 cycle with non-OID-shaped object keys + 4 residency docs with legacy `territory` field. A second `--apply` post-run would return `alreadyMigrated: true` if all three conditions cleared.

**Implementation notes (anything surprising):**

1. **Residency count was 4, not 0.** Filed as the most important note — see live-data probe section above. The migration handles them correctly via name resolution, but the Q5 decision rationale changes: the residency collection is *not* dormant after all. **Recommend the SM/user file an issue post-migration to investigate which writer populated these docs**, given the dead-code analysis flagged the only known consumer as "set, never read".

2. **`territory.slug || territory.id` fallback at routes/territories.js:122 NOT removed** per Khepri's instruction. Once `--apply` runs and the on-disk `id` field becomes `slug`, the `|| territory.id` clause becomes load-bearing-zero (always falsy). Removal is deferred to #3e per ADR-002 Step 6, as flagged in Maat's #3b QA review.

3. **Map building reads `id ?? slug`** for tolerance against partial state (e.g. an interrupted previous attempt). Currently all 5 territories have `id` and no `slug`, but the script tolerates either.

4. **Idempotency check is three-pronged**: (a) territories.id absent, (b) all cycle map keys are 24-char hex, (c) all residency docs have territory_id, none have territory. All three must hold for `alreadyMigrated: true`.

5. **Backup-before-write enforced by sequential await** — `mkdirSync` → `writeFileSync` → first DB mutation. If the write throws, the chain aborts before touching the DB. No try/catch (would obscure the safety property).

6. **POST-AUDIT SAFETY ABORT** in the residency loop is paranoid defensive-programming. The audit pass already validates name resolution; the apply pass re-checks in case territories drift between audit and apply (which they shouldn't in a single process run, but the cost is one comparison and the value is "never half-write a residency doc").

7. **Two pre-existing test failures on dev** (rule_engine_grep contract, api-relationships-player-create NPC directory) are unrelated to this story — already known from #3b.

**Resisted scope creep:**
- Did NOT remove the `territory.slug || territory.id` fallback (deferred to #3e per ADR-002 Step 6).
- Did NOT investigate the residency-docs surprise (Q5 follow-up; user's call).
- Did NOT touch `server/utils/territory-slugs.js` (Q4; #3e).
- Did NOT modify any client file in `public/`.
- Did NOT execute `--apply` (HARD RULE).

**Probe artefact**: `server/scripts/_probe-tm-territory-fk.mjs` was created, run, and deleted before commit. Not in the repo.

**Change Log:**
- 2026-05-05 — Implemented per Story #3c on `issue-3c-migration-script`. Single commit (script + this Dev Agent Record together). Dry-run executed; `--apply` deferred to SM after user authorisation.
