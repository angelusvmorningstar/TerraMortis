---
id: issue-3-rfr-cleanup
issue: 3
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/3
branch: issue-3-rfr-residue-cleanup
status: ready-for-review
priority: high
depends_on: []
parent: issue-3
---

# Story #3 (β): Delete the four RFR-Test residue documents from `tm_suite.territories`

As an ST relying on territory lookups (regent ambience bonus, downtime form, regency tab) to resolve the right document by slug,
I should not have four duplicate `id: 'secondcity'` test-residue documents polluting `territories.find(t => t.id === 'secondcity')`,
So that production code that assumes slug uniqueness behaves predictably while the larger `_id`-as-FK refactor (story α / #3a) is being designed.

This is the **data hygiene precursor** to the territory FK refactor. Doing it now means the design phase reasons against a clean dataset, not a polluted one.

---

## Context

A read-only audit of `tm_suite.territories` (run from a temp script in `server/scripts/`, since deleted) returned 9 documents. Five share `id: 'secondcity'`. Four of those five have:

- `name: 'RFR Test'`
- `ambience: 'Tended'`
- `regent_id ∈ {'regent-lock', 'regent-override', 'regent-noscope', 'regent-clean'}` — names matching test fixtures from `server/tests/api-territories-regent-write.test.js`

The fifth `secondcity` document is the legitimate one (`name: 'The Second City'`, real ObjectId regent_id).

The four residues are obvious test artefacts that escaped cleanup at some point — the test file uses `id: 'rfr_test_*'` slugs but these documents have `id: 'secondcity'`, so something somewhere wrote them with the wrong slug. Root cause is out of scope for this cleanup; the existing data is the problem to fix.

### The four documents to delete

| `_id` | `id` | `name` | `regent_id` |
|---|---|---|---|
| `69e997e6dca10b9a697c6817` | secondcity | RFR Test | regent-lock |
| `69e997e6dca10b9a697c6819` | secondcity | RFR Test | regent-override |
| `69e997e6dca10b9a697c681b` | secondcity | RFR Test | regent-noscope |
| `69e997e7dca10b9a697c681d` | secondcity | RFR Test | regent-clean |

After cleanup, `territories.count` should be 5 (one per real territory, all unique `id`s).

### Why this matters operationally

`territories.find(t => t.id === 'secondcity')` on the client returns whichever document Mongo's cursor surfaces first. If a residue doc happens to surface, downstream code reads `name: 'RFR Test'`, `ambience: 'Tended'`, `regent_id: 'regent-lock'` — all wrong. The blast radius covers regent ambience bonus calculation, downtime form territory selection, regency tab rendering, and feeding-rights resolution.

### Files in scope

- `server/scripts/cleanup-rfr-territory-residue.js` (new) — one-off audit-trail script. Dry-run by default; `--apply` for actual delete; captures backup of deleted docs to `server/scripts/_backups/rfr-territory-residue-<timestamp>.json` before deletion.

### Files NOT in scope

- The schema (`server/schemas/territory.schema.js`) — the slug-uniqueness contract is broken by design and will be addressed in story α (#3a, ADR + refactor).
- Any client-side `territories.find(t => t.id === …)` site — those become correct *automatically* once the duplicate residue is gone.
- Test fixture cleanup paths — root-cause investigation of how residue escaped is deferred.
- Any other collection. The audit script in α scope will identify cross-doc FK pollution from these specific residue rows; for now, regent_ids like `'regent-lock'` are sentinel strings that don't reference any real character, so they leave nothing behind on delete.

---

## Acceptance Criteria

**Given** the script is invoked without `--apply`
**When** it runs against the live MongoDB
**Then** it prints a summary listing the four `_id`s targeted for deletion, prints the full document content of each (so the QA reviewer and SM can sanity-check before authorising), and **does not modify anything**.

**Given** the script is invoked with `--apply`
**When** it runs against the live MongoDB
**Then** it writes a backup file `server/scripts/_backups/rfr-territory-residue-<ISO-timestamp>.json` containing all four documents, then issues a `deleteMany({ _id: { $in: [<the 4 ObjectIds>] } })`, then prints the result count and the new `territories.count`.

**Given** the script is invoked with `--apply` against a database that already had cleanup applied (re-run scenario)
**When** it runs
**Then** the targeted `_id`s no longer exist; the script reports `deleted: 0, already-clean: true` and exits 0 without writing an empty backup file.

**Given** the script is run against a database where the targeted `_id`s exist but unexpected fields differ (e.g. someone reused one of those `_id`s for a real document)
**When** it runs in either mode
**Then** the script aborts with a clear safety error before any delete, citing the field mismatch. Match guard: `name === 'RFR Test'` AND `regent_id ∈ {regent-lock, regent-override, regent-noscope, regent-clean}` AND `id === 'secondcity'`. If any document fails the guard, abort the whole run.

**Given** the cleanup completes successfully
**When** the audit script (re-run from earlier — `node` snippet querying territories) is repeated
**Then** `territories.count == 5`, `id` cardinality `secondcity × 1, northshore × 1, dockyards × 1, academy × 1, harbour × 1` — all unique.

**Given** the cleanup script lands in the repo
**When** a future operator wants to repeat the operation (or audit the historical record)
**Then** the script is committed under `server/scripts/cleanup-rfr-territory-residue.js` with a docstring explaining the one-time nature, the four target IDs, and the date/SHA of when it was first run in production.

---

## Implementation Notes

### Script shape

```js
#!/usr/bin/env node
/**
 * One-off cleanup: delete the four RFR-Test residue documents from
 * tm_suite.territories that share id='secondcity' with the legitimate
 * 'The Second City' record.
 *
 * Targets (verified by audit on 2026-05-05):
 *   69e997e6dca10b9a697c6817 — regent-lock
 *   69e997e6dca10b9a697c6819 — regent-override
 *   69e997e6dca10b9a697c681b — regent-noscope
 *   69e997e7dca10b9a697c681d — regent-clean
 *
 * Usage:
 *   cd server && node scripts/cleanup-rfr-territory-residue.js          # dry-run
 *   cd server && node scripts/cleanup-rfr-territory-residue.js --apply  # actual delete
 *
 * Always writes a backup before applying. Idempotent re-runs return 0.
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_IDS = [
  '69e997e6dca10b9a697c6817',
  '69e997e6dca10b9a697c6819',
  '69e997e6dca10b9a697c681b',
  '69e997e7dca10b9a697c681d',
];
const ALLOWED_REGENTS = new Set(['regent-lock', 'regent-override', 'regent-noscope', 'regent-clean']);

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI missing'); process.exit(1); }

const client = new MongoClient(URI);
await client.connect();
const col = client.db('tm_suite').collection('territories');

const oids = TARGET_IDS.map(s => new ObjectId(s));
const docs = await col.find({ _id: { $in: oids } }).toArray();

if (docs.length === 0) {
  console.log('already-clean: true   deleted: 0');
  await client.close();
  process.exit(0);
}

// Safety guard — abort if anything looks wrong
for (const d of docs) {
  if (d.id !== 'secondcity' || d.name !== 'RFR Test' || !ALLOWED_REGENTS.has(d.regent_id)) {
    console.error('SAFETY ABORT: doc shape changed since audit:');
    console.error(JSON.stringify(d, null, 2));
    await client.close();
    process.exit(2);
  }
}

console.log(`Found ${docs.length}/${TARGET_IDS.length} targeted residue docs:\n`);
for (const d of docs) {
  console.log(`  _id=${d._id}  regent_id=${d.regent_id}  name=${d.name}  ambience=${d.ambience}`);
}

if (!APPLY) {
  console.log('\nDRY-RUN — re-run with --apply to execute.');
  await client.close();
  process.exit(0);
}

// Apply: backup first
const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, '_backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `rfr-territory-residue-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(docs, null, 2));
console.log(`\nBackup → ${backupPath}`);

const result = await col.deleteMany({ _id: { $in: oids } });
console.log(`Deleted: ${result.deletedCount}`);

const newCount = await col.countDocuments();
console.log(`territories.count now: ${newCount}`);

await client.close();
```

### Backup directory

`server/scripts/_backups/` should be **gitignored** (one-off backups, not source). Add to `.gitignore` if not already covered. The script always writes the backup *before* deleting; if the write fails, the delete must not run (this is built into the sequential `await` chain — no try/catch needed, an uncaught throw aborts the process before delete).

### Idempotency

The first thing the script does after fetching docs is check `docs.length === 0`. If so, exit 0 with `already-clean: true` and no backup file. Re-running on a clean DB is safe.

### Why match by `_id` and not by name pattern

Match by exact ObjectId list, then *guard* with name/regent shape. This makes the script's blast radius bounded — even if someone added another RFR-Test document tomorrow, this script will not touch it because the `_id` isn't on the list. A future cleanup gets its own script.

---

## Test Plan

This is destructive prod-data work. The plan is layered:

1. **Static review (Ma'at)** — read the script. Confirm: target list matches the four `_id`s I cited, safety guard is correct, dry-run is the default, backup happens before delete, idempotency check on re-run.
2. **Dry-run (Ptah, then Ma'at, then SM)** — `node scripts/cleanup-rfr-territory-residue.js` (no `--apply`). Each reviewer confirms the four documents printed look like exactly the expected residues — `name: 'RFR Test'`, the four regent_ids, `id: 'secondcity'`, all four ObjectIds match the audit. **No surprises.**
3. **User authorisation step** — explicit go-ahead from the user (Angelus / Peter) before `--apply` runs. This is the gate; SM does not press the button without it.
4. **Apply (SM)** — `node scripts/cleanup-rfr-territory-residue.js --apply`. Verify: backup file written, `Deleted: 4`, `territories.count: 5`.
5. **Re-audit (Ma'at)** — re-run the audit snippet from earlier. Confirm `count = 5`, all `id` values unique.
6. **Idempotency check** — re-run `--apply`. Confirm `already-clean: true, deleted: 0`. Exit 0.

---

## Definition of Done

- [x] Script lives at `server/scripts/cleanup-rfr-territory-residue.js`, exec bit set, docstring complete *(run-history line is a placeholder for SM to update post-apply with the date + SHA)*
- [x] `_backups/` directory excluded from git *(`server/scripts/_backups/` added to top-level `.gitignore`)*
- [x] Dry-run output reviewed by Ma'at and SM *(dry-run executed locally; output captured in Dev Agent Record below)*
- [ ] User explicitly authorises `--apply` *(SM gate, after QA)*
- [ ] `--apply` run completed; backup file present locally; deleted count = 4 *(SM step)*
- [ ] Re-audit confirms `territories.count = 5` with all unique `id`s *(QA after SM apply)*
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body closes nothing (issue #3 stays open for α work) but cross-references the parent issue #3 in the description *(SM step)*

---

## Note for Ptah

You're writing a one-off cleanup script — not a feature. The shape is fully specified above; pick up the sketch, polish it (e.g. add a `--help` flag if you like, but don't expand scope), make sure the docstring captures the date and the cited audit. Run it once in dry-run mode locally and paste the output into your Dev Agent Record so SM and QA can compare against expected output before authorising apply.

**Do NOT run with `--apply`.** That's SM's step after user authorisation.

## Note for Ma'at

This story's risk is operational, not algorithmic. Your QA value is highest at:
- Static review of the script (target list, guard, dry-run default, backup-before-delete sequencing)
- Mental walkthrough of failure modes: backup write fails / partial match / re-run / unrelated future doc with one of the target `_id`s
- Verification of the dry-run output Ptah pastes into his Dev Agent Record

Append your QA Results as a commit on this branch BEFORE the apply step (so the QA artefact ships in the PR even if --apply itself happens after merge).

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed:**
- `server/scripts/cleanup-rfr-territory-residue.js` (new, exec bit set) — one-off cleanup script per the story sketch, with a `--help` flag added for ergonomics
- `.gitignore` (+3) — added `server/scripts/_backups/` exclusion under existing "Scratch / one-off" section

**Dry-run output (from local terminal, no `--apply`, no DB mutation):**

```
Found 4/4 targeted residue docs:

  _id=69e997e6dca10b9a697c6817  id=secondcity  regent_id=regent-lock       name=RFR Test  ambience=Tended
  _id=69e997e6dca10b9a697c6819  id=secondcity  regent_id=regent-override   name=RFR Test  ambience=Tended
  _id=69e997e6dca10b9a697c681b  id=secondcity  regent_id=regent-noscope    name=RFR Test  ambience=Tended
  _id=69e997e7dca10b9a697c681d  id=secondcity  regent_id=regent-clean      name=RFR Test  ambience=Tended

Full document content:
  (each doc printed; identical shape — id=secondcity, name='RFR Test',
   ambience='Tended', lieutenant_id=null, feeding_rights=[sentinel test
   character names: 'fed-char', 'safe-char', 'char-a', 'char-b' — none
   reference real Mongo characters])

DRY-RUN — re-run with --apply to execute deletion.
```

All four targeted `_id`s are present, all four pass the safety guard (id+name+regent_id), exit 0.

**Completion Notes:**
- Script is a faithful implementation of the sketch in the story. Two minor additions: a `--help` flag (described in story note allowing this) and a "Run history" line in the docstring as a placeholder SM updates after `--apply` runs. Everything else is verbatim.
- Match strategy: exact ObjectId list (`$in: [4 oids]`), then field-shape guard (id, name, regent_id). Bounded blast radius — even if a future operator inserts another RFR-Test row tomorrow, this script ignores it because the `_id` isn't on the list.
- Backup-before-delete safety is achieved by sequential `await`: `mkdirSync` → `writeFileSync` → `deleteMany`. If the write throws, the await chain unwinds before `deleteMany` is ever called. No try/catch needed (and adding one would obscure the safety property).
- Idempotency: `docs.length === 0` short-circuit emits `already-clean: true` and exits 0 *before* opening the backup directory. Re-runs on a clean DB write nothing.
- Safety abort exit code is 2 (distinct from generic exit 1 for missing env), so SM can distinguish "config issue, fix and rerun" from "data shape drift, escalate".
- Notable observation in the dry-run output: each doc has a non-empty `feeding_rights` array containing sentinel test names (`'fed-char'`, `'safe-char'`, `'char-a'`, `'char-b'`). These are not real character IDs, so deleting these docs leaves no dangling references in any other collection. Worth recording but not actionable here.
- The `--apply` path was **NOT executed** — per the SM hard rule, that's the SM's step after user authorisation.

**Change Log:**
- 2026-05-05 — Implemented per Story #3 (β). Single commit on `issue-3-rfr-residue-cleanup` (script + .gitignore + this Dev Agent Record together, per SM standing instruction). `--apply` not executed.

---

## Note for SM (me)

After Ma'at gates PASS:
1. Get the user's explicit "apply" command in chat.
2. Run `--apply` locally.
3. Capture the output (deleted count, backup path, new count) and post it back to the user.
4. Run the re-audit, post that too.
5. Open PR to dev. PR body summarises the operational record.

---

## QA Results

**Reviewer:** Quinn (Ma'at / QA), claude-opus-4-7
**Date:** 2026-05-05
**Commit reviewed:** 95a7ad1
**Method:** Static review of the script against the story sketch + Khepri's destructive-data checklist; cross-check of sentinel regent_id strings against the test fixture file; independent dry-run from this terminal to verify reproducibility against the live MongoDB.

### Gate decision: **PASS** — recommend AUTHORISE-APPLY (subject to user's explicit go-ahead per the standing rule).

### Static review (Khepri's destructive-data checklist)

| Item | Verdict | Evidence |
|---|---|---|
| `TARGET_IDS` matches the four ObjectIds in the story | PASS | Lines 39-44: `69e997e6dca10b9a697c6817 / 6819 / 681b / 681d`. Identical to the table at story:34-42 and to my live dry-run output. |
| Safety guard checks all three fields (id + name + regent_id) | PASS | Lines 76-83: `d.id !== 'secondcity' || d.name !== 'RFR Test' || !ALLOWED_REGENTS.has(d.regent_id)`. All three required to match. |
| Dry-run is the default (no --apply ⇒ no mutation) | PASS | Line 47: `APPLY = process.argv.includes('--apply')`. Line 94: `if (!APPLY) { ... process.exit(0) }` exits before mkdir/write/deleteMany. Verified by independent dry-run: backup directory was not created. |
| Backup write happens BEFORE deleteMany (sequential await chain) | PASS | Lines 102-110: `mkdirSync` → `writeFileSync` → `deleteMany`. Synchronous mkdir+write throw uncaught, aborting the process before line 110. No try/catch — adding one would obscure the safety property. |
| Idempotent: docs.length === 0 ⇒ exit 0, already-clean message, no backup | PASS | Lines 69-73: short-circuits before line 102's mkdir, so re-run on a clean DB writes nothing. |
| Backup path uses ISO timestamp (collision-safe) | PASS | Lines 105-106: `new Date().toISOString().replace(/[:.]/g, '-')` → e.g. `2026-05-05T12-34-56-789Z`. Even sub-second re-invocations would collide only if run twice in <1ms. |
| Distinct exit codes (success / config / safety-abort) | PASS | 0 = success / dry-run / already-clean (lines 53, 72, 97, end-of-file). 1 = config (URI missing, line 59). 2 = safety abort (line 81). Matches Ptah's spec. |
| Bounded blast radius via `_id` list, not field-shape | PASS | Match strategy is `{ _id: { $in: oids } }` (line 67). Field guard is a sanity check, not the primary filter. A future RFR-Test row with a different `_id` is invisible to this script. |
| `_backups/` dir gitignored | PASS | `.gitignore` adds `server/scripts/_backups/` under "Scratch / one-off". |
| Exec bit on script | PASS | `test -x server/scripts/cleanup-rfr-territory-residue.js` → true. |

### Sentinel regent_id cross-check

The four `regent_id` values in `ALLOWED_REGENTS` (line 45) match the test fixture file `server/tests/api-territories-regent-write.test.js` exactly:

| Regent | Test fixture line | In ALLOWED_REGENTS? |
|---|---|---|
| `regent-lock` | 177 | yes |
| `regent-override` | 199 | yes |
| `regent-noscope` | 216 | yes |
| `regent-clean` | 231 | yes |

The test seeds territories with `id: 'rfr_test_sc'`, but the four residue docs have `id: 'secondcity'`. Root-cause investigation (how the slug got rewritten) is explicitly out-of-scope per the story; the cleanup deletes the residue regardless.

### Independent dry-run from this terminal

`node scripts/cleanup-rfr-territory-residue.js` (no flag) reproduces Ptah's pasted output. All four targeted documents found, all match the safety guard:

- `_id=69e997e6dca10b9a697c6817  regent_id=regent-lock      feeding_rights=['fed-char','safe-char']`
- `_id=69e997e6dca10b9a697c6819  regent_id=regent-override  feeding_rights=['fed-char','safe-char']`
- `_id=69e997e6dca10b9a697c681b  regent_id=regent-noscope   feeding_rights=['char-a']`
- `_id=69e997e7dca10b9a697c681d  regent_id=regent-clean     feeding_rights=['char-a','char-b']`

All four: `id='secondcity'`, `name='RFR Test'`, `ambience='Tended'`, `lieutenant_id=null`. Exit 0. No backup directory created (verified by `ls scripts/_backups/` → `No such file or directory`).

`feeding_rights` arrays contain only sentinel test character names (`fed-char`, `safe-char`, `char-a`, `char-b`) — none are real Mongo ObjectIds, so deleting these docs leaves no dangling cross-collection references. Ptah's observation in the Dev Agent Record is accurate.

### Failure-mode walkthrough (Khepri's six)

| Scenario | Outcome | Verdict |
|---|---|---|
| Mongo connection fails | `await client.connect()` (line 63) throws; process exits non-zero before any read/write. | PASS — no mutation. |
| Backup `mkdir` fails (permission) | Line 104 throws; process aborts. `deleteMany` at line 110 not reached. (Note: `recursive: true` makes mkdir idempotent, won't throw on existing dir.) | PASS — no mutation. |
| Backup `write` fails (disk full) | Line 107 throws; process aborts. `deleteMany` not reached. | PASS — no mutation. |
| Targeted `_id` reused for an unrelated doc | Safety guard at lines 76-83 fires on first mismatch, prints `SAFETY ABORT`, closes client, `process.exit(2)`. Apply branch never reached. | PASS — exit 2, no mutation. |
| Re-run after successful apply | `find($in: oids)` returns `[]`, lines 69-73 short-circuit with `already-clean: true   deleted: 0`, exit 0. No backup written. | PASS by code path; cannot exercise pre-apply. |
| `--apply` run twice in close succession | First run deletes 4, second run hits the already-clean short-circuit. ISO-timestamp backup paths collision-safe at second-grade resolution. | PASS by code path; cannot exercise pre-apply. |

### AC verdicts

| AC | Verdict | Notes |
|---|---|---|
| 1. Dry-run lists 4 IDs and full content, no mutation | PASS | Verified by independent run. |
| 2. `--apply` writes backup then deleteMany, prints counts | PASS-by-static | Sequential await chain confirmed; cannot exercise pre-authorisation. |
| 3. Re-run after apply: `already-clean: true, deleted: 0`, exit 0, no backup | PASS-by-static | Code path lines 69-73 verified; deferred to post-apply re-verify. |
| 4. Safety guard fires on field-shape drift, exit 2 | PASS | Lines 76-83 implement the exact match policy specified (id + name + regent_id). |
| 5. Post-cleanup audit: `territories.count == 5`, all unique IDs | DEFERRED | Cannot verify pre-apply. SM should re-run audit snippet after apply. |
| 6. Script committed at `server/scripts/cleanup-rfr-territory-residue.js` with docstring including target IDs and run-history line | PASS | Lines 1-32 of the script. Run-history line is a `<yet to run>` placeholder for SM to update post-apply. |

### Lint / parse

`node --input-type=module --check < server/scripts/cleanup-rfr-territory-residue.js` — clean (file imports run from disk; the live dry-run already exercised parsing).

### Notes for SM

- The script is safe to authorise. Bounded blast radius (`_id` list), defensive guard (id+name+regent_id), backup-before-delete sequencing, idempotent re-run, distinct exit codes.
- Post-apply, please update the docstring's "Run history" line at `cleanup-rfr-territory-residue.js:30` with the date and apply-commit SHA, and re-run the audit snippet to confirm AC #5 (`territories.count == 5`, all `id` values unique). Both can be a single small follow-up commit.
- Backup file location after apply: `server/scripts/_backups/rfr-territory-residue-<ISO>.json`. Worth retaining locally until the parent issue #3 (α refactor) lands.

### Recommendation

**AUTHORISE-APPLY.** Standing by for SM to capture the user's explicit go-ahead and run `--apply`. Will re-verify the post-state (count=5, all unique IDs, backup file present) on your reply.

### Post-apply re-verify (after 229d717)

Independent audit run from this terminal against the live DB:

```
territories.count = 5
id cardinality:
  academy x 1
  dockyards x 1
  harbour x 1
  northshore x 1
  secondcity x 1
all unique: true
residue _ids still present: 0
secondcity records: 1 [ 'The Second City' ]
```

- **AC #5** (post-cleanup audit: count=5, all unique IDs) — PASS. Independently verified.
- **AC #3** (idempotent re-run) — PASS. SM's second `--apply` returned `already-clean: true   deleted: 0`.
- **AC #2** (apply writes backup then deleteMany) — PASS. Backup present locally at `server/scripts/_backups/rfr-territory-residue-2026-05-05T02-46-45-155Z.json`.
- **Docstring update at 229d717** — PASS. Date `2026-05-05`, source commit `95a7ad1`, deleted count, backup path, post-state, idempotency all recorded.
- The remaining `secondcity` record is the legitimate `'The Second City'` — bug surface (`territories.find(t => t.id === 'secondcity')` ambiguity) eliminated.

**Final gate: PASS.** All ACs closed. Branch ready for PR.
