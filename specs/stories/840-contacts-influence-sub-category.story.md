# Story 840: Fix Contacts missing from influence merit dropdown

## Status: Done

## Metadata
- issue: 840
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/840
- branch: piatra/issue-840-contacts-influence-add
- type: data-fix + one-shot script + test
- model: restore-necro-sub-category.js (script pattern); fix.943.retireStripDerived.test.js (test pattern)

---

## Story

**As** an ST editing a character in the admin app,
**I want** Contacts to appear in the influence merit picker,
**so that** I can add or manage a character's Contacts merit without manually patching the database.

---

## Background

`buildSubCategoryMeritOptions(c, 'influence', ...)` in `public/js/editor/merits.js` (line 363) filters the `purchasable_powers` catalog by `rule.sub_category === subCategory`. Contacts currently has `sub_category: null` in prod, so it is silently excluded.

Root cause confirmed by direct MongoDB query on 2026-07-03:
- `Contacts` in `purchasable_powers`: `sub_category: null`
- 10 other influence merits (Allies, Mentor, Resources, Retainer, Staff, Status, and the three Attaché variants) all carry `sub_category: 'influence'`
- Contacts is the sole outlier

The original sub-category migration script (`server/scripts/archive/migrate-merit-sub-category.js`) listed Contacts in `INFLUENCE_NAMES` and should have set it, but the prod document was not updated. No code bug — this is a data correction only.

The reference JSON (`data/reference/TM_rules_merit_2026-04-17.json`) predates the `sub_category` field entirely; that field is absent from all entries in the file. The Contacts entry (line 897) needs `sub_category` added so any future re-seed produces a consistent document.

---

## Scope

| Layer | File | Change |
|-------|------|--------|
| Reference JSON | `data/reference/TM_rules_merit_2026-04-17.json` | Add `"sub_category": "influence"` to the Contacts entry |
| One-shot script | `server/scripts/fix-840-contacts-sub-category.js` | Find Contacts in `purchasable_powers`, `$set sub_category='influence'` |
| Static test | `server/tests/fix.840.contacts-influence-sub-category.test.js` | Assert JSON has the field; assert script file exists and contains the guard pattern |

No editor code changes. No schema changes. Do not touch any Attache variant or any other merit.

---

## Acceptance Criteria

1. `data/reference/TM_rules_merit_2026-04-17.json` Contacts entry has `"sub_category": "influence"`.
2. `server/scripts/fix-840-contacts-sub-category.js` exists, defaults to dry-run, requires `--apply` to write.
3. Script prints the before value (`null`) and after value (`influence`) in dry-run output.
4. `server/tests/fix.840.contacts-influence-sub-category.test.js` passes (`vitest run`).
5. After running the script against prod with `--apply`, querying `purchasable_powers` for `{ name: 'Contacts' }` returns `sub_category: 'influence'`.
6. No other `purchasable_powers` documents are modified by the script.
7. The influence merit picker in the admin editor shows Contacts after the prod script run (smoke-test in browser).

---

## Tasks

- [ ] Update reference JSON (AC1)
  - In `data/reference/TM_rules_merit_2026-04-17.json`, locate the Contacts entry (line 897, key `"contacts"`, `"_id": "69d4e1d6277e2b2144b61632"`) and add `"sub_category": "influence"` as the last field before the closing brace, matching the surrounding field order (after `"bloodline": null`).

- [ ] Write one-shot fix script (AC2, AC3, AC6)
  - New file: `server/scripts/fix-840-contacts-sub-category.js`
  - Pattern: identical to `server/scripts/restore-necro-sub-category.js`
  - `import 'dotenv/config'` first; read `MONGODB_URI` and `MONGODB_DB` from env.
  - `APPLY = process.argv.includes('--apply')` / `DRY_RUN = !APPLY`.
  - Target collection: `purchasable_powers`. Target document: `{ name: 'Contacts' }`.
  - `findOne({ name: 'Contacts' }, { projection: { name: 1, sub_category: 1 } })`:
    - If not found: print `NOT FOUND — aborting` and exit non-zero.
    - If `sub_category === 'influence'`: print `already correct — no-op` and exit zero.
    - Otherwise: print `sub_category=<current> → 'influence'`.
  - On `--apply`: `updateOne({ name: 'Contacts' }, { $set: { sub_category: 'influence' } })`.
  - Print summary: wrote 1 doc (apply) or `[DRY RUN] Pass --apply to write.`

- [ ] Write static test (AC1, AC2, AC4)
  - New file: `server/tests/fix.840.contacts-influence-sub-category.test.js`
  - Pattern: `fix.943.retireStripDerived.test.js` (REPO_ROOT + `fs.readFileSync` helper, vitest)
  - Suite 1 — reference JSON:
    - Parse `data/reference/TM_rules_merit_2026-04-17.json`.
    - Find the entry with `key === 'contacts'`.
    - Assert `entry.sub_category === 'influence'`.
  - Suite 2 — script structure:
    - Read `server/scripts/fix-840-contacts-sub-category.js` as text.
    - Assert it contains `--apply` (dry-run guard present).
    - Assert it contains `$set` and `sub_category` (write logic present).
    - Assert it contains `'Contacts'` (correct target name).

- [ ] Run `vitest run server/tests/fix.840.contacts-influence-sub-category.test.js` and confirm all pass.

---

## Dev Notes

### Reference JSON edit — exact location

The Contacts entry runs from approximately line 897 to 919 in `data/reference/TM_rules_merit_2026-04-17.json`. The final two lines before the closing brace are:

```json
    "bloodline": null
  },
```

Insert `"sub_category": "influence"` between `"bloodline": null` and the closing `}`. Other entries in this file do not have `sub_category` — adding it only to Contacts is intentional; fixing all entries is out of scope for this story.

### Why not re-run the archived migration script

`server/scripts/archive/migrate-merit-sub-category.js` would also fix the field, but it touches 13 documents in a single run. A targeted one-shot script scoped to Contacts alone is safer for a prod correction and easier to audit.

### Script invocation after PR lands on main

An operator (Peter or Angelus) must run the following after the PR is deployed:

```sh
cd server && MONGODB_URI="<prod-uri>" node scripts/fix-840-contacts-sub-category.js
# Verify dry-run output shows: sub_category=null → 'influence'
cd server && MONGODB_URI="<prod-uri>" node scripts/fix-840-contacts-sub-category.js --apply
```

This is a per-message authorised operation. SM will include this as a post-merge action item in the PR description.

### No regression risk

`buildSubCategoryMeritOptions` already works for the 10 other influence merits. Adding Contacts to the filtered set replicates the existing pattern. No other consumer reads `sub_category` in a way that could be broken by this change.

---

## Post-merge operational step

After the PR merges to main and deploys:

1. Run the fix script against prod (commands above).
2. Open admin, edit any character, add an influence merit row — Contacts must appear in the dropdown.
3. Close issue #840.

---

## Dev Agent Record

### Agent Model Used

(fill in on completion)

### Debug Log

### Completion Notes

### File List

- `data/reference/TM_rules_merit_2026-04-17.json`
- `server/scripts/fix-840-contacts-sub-category.js`
- `server/tests/fix.840.contacts-influence-sub-category.test.js`
- `specs/stories/840-contacts-influence-sub-category.story.md`

### Change Log
