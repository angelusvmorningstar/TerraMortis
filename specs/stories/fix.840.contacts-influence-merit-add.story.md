---
title: 'Cannot add Contacts influence merit — absent from editor dropdown'
type: 'fix'
issue: 840
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/840
branch: ms/issue-840-contacts-influence-merit-add
created: '2026-06-17'
status: review
recommended_model: 'sonnet — root cause is a one-field data fix + a small user-run script + a light code/regression check'
context:
  - server/scripts/ (new data-fix script)
  - public/js/editor/sheet.js
  - public/js/editor/merits.js
  - public/js/data/constants.js
---

## Intent

Contacts is a first-class influence merit (in `INFLUENCE_MERIT_TYPES`, with a full
dedicated sphere-per-dot editor UI and `calcContactsInfluence`), but the ST cannot
**add** one: it is absent from the influence-merit type dropdown, and the only add
button creates an Allies row. An entire merit type is unaddable.

## Root cause — RESOLVED (do NOT re-investigate)

Confirmed by a read-only query of live `tm_suite.purchasable_powers` (the merit
catalog; `category: 'merit'` docs, served by `/api/rules`, consumed client-side by
`getRulesByCategory('merit')`):

- The Contacts rule doc is `{ key: 'contacts', name: 'Contacts', category: 'merit',
  sub_category: null }` — **`sub_category` is null**.
- Every OTHER influence merit has `sub_category: 'influence'` (Resources, Retainer,
  Staff, Allies, Mentor, Status, Attaché variants).
- `buildSubCategoryMeritOptions(c, 'influence', ...)` (`public/js/editor/merits.js:347`)
  builds the dropdown from rules where `rule.sub_category === 'influence'`. Contacts
  has `null`, so it is the ONLY influence merit excluded.

**This is a DATA fix, not a code logic bug.** The client code is correct.

## Fix specification

### T1 — Data fix (PRIMARY): set `sub_category: 'influence'` on the Contacts rule

Deliver as a small **idempotent** script under `server/scripts/` (e.g.
`set-contacts-influence-subcategory.js`), following the existing
`seed-rules-*.js` / `cleanup-m-free-deprecation.js` pattern:
- `import 'dotenv/config'`, `MongoClient`; `DB_NAME = process.env.MONGODB_DB || 'tm_suite'`.
- `--dry-run` default, `--apply` to write. `main()` exported + direct-invocation
  guard (`import.meta.url === ...`).
- **NO shebang line** (the `#!/usr/bin/env node` shebang breaks vitest 4 if the
  script is ever imported by a test — see #842).
- Write: `purchasable_powers.updateOne({ key: 'contacts' }, { $set: { sub_category: 'influence' } })`.
  Idempotent (re-run touches 0 docs once set). Log before/after.
- **The USER runs this** against live `tm_suite` (import-responsibility convention).
  The dev does NOT execute writes against live; the script may be exercised against
  `tm_suite_test` in the regression test (T3).

### T2 — Code verification (read `public/js/editor/sheet.js`), fix only if a gap exists

Once Contacts is in the dropdown, the existing add path should work:
1. ST clicks **"+ Add Allies / Other"** (`sheet.js:933`) → adds an Allies row.
2. ST switches that row's type dropdown to **Contacts** (now offered) →
   `shEditInflMerit(idx, 'name', 'Contacts')` sets the merit name.
3. On re-render, the entry is filtered out of the per-row loop (`nonContacts`,
   `sheet.js:880`) and rendered in the dedicated Contacts sphere-per-dot block
   (`sheet.js:906-932`).

Verify a freshly-converted Contacts entry (rating 1, no `spheres[]` yet) renders
correctly — the block iterates `for (d = 0; d < rating; d++)` using `spheres[d] || ''`,
so an empty spheres array should render one empty sphere picker. Confirm
`shEditInflMerit` does not block the name change and `calcContactsInfluence` tolerates
an entry with no spheres set yet. **If, and only if, a real gap is found, fix it
minimally.** Do not refactor the Contacts UI.

OPTIONAL (nice-to-have, NOT required this story): a dedicated "+ Add Contacts"
button for discoverability. The data fix + existing convert path is the minimal
complete fix; only add the button if trivial and you reuse existing button classes.

### T3 — Regression guard (recommended, light)

A small vitest test asserting every `INFLUENCE_MERIT_TYPES` name
(`public/js/data/constants.js:124`, includes Contacts) has a corresponding
`purchasable_powers` rule with `category:'merit'` and `sub_category:'influence'` —
so a catalog row can never again silently drop out of the influence dropdown. Keep
it light; seed against `tm_suite_test` or assert structurally. (Note: Attaché
appears in `INFLUENCE_MERIT_TYPES` and the catalog has variant rows + a
`Attaché (depreicated)` [sic] entry — scope the assertion so these known variants
don't cause a false failure; assert the base names that must be addable.)

## Acceptance criteria

- [~] **AC-1** After the T1 script is applied, the Contacts rule has
      `sub_category: 'influence'` and Contacts appears in the dropdown. _(Script
      ready + dry-run verified against live: found `Contacts (sub_category=null)`,
      would set 'influence'. **Pending user `--apply` + smoke.**)_
- [x] **AC-2** Add path works once Contacts is in the dropdown — verified by code:
      `shEditInflMerit(idx,'name','Contacts')` (edit-domain.js:45) sets name +
      rule_key; `pruneContactsSpheres` is a safe no-op with no spheres; the Contacts
      block (sheet.js:906-932) renders `rating` sphere pickers via `spheres[d]||''`;
      `shEditContactSphere` lazily inits `m.spheres`. **No code change needed.**
      (Live render confirmation = smoke.)
- [x] **AC-3** No other influence merit changes — the script `$set`s a single field
      on the `key:'contacts'` doc only.
- [x] **AC-4** Idempotent (`if sub_category==='influence'` → no-op branch + targeted
      `updateOne`) and `--dry-run` by default (verified).
- [x] **AC-5** `node --check` clean on the script. _(T3 regression test deferred —
      see notes.)_

## Dev notes

### This is data-first
The headline deliverable is the one-field data correction. The client already
handles Contacts everywhere else (dedicated block, `calcContactsInfluence`,
`INFLUENCE_MERIT_TYPES`). Resist over-building.

### Import-responsibility
The data script is **user-run** against live `tm_suite`. Do NOT run live writes in
the dev cycle. State clearly in the PR that the user must run
`cd server && node scripts/<name>.js --apply`.

### Catalog hygiene (note, out of scope)
The influence catalog has `Attaché (depreicated)` [sic, misspelled] plus several
`Attaché (...)` variant rows. Not this story — flag only.

### CSS
Editor UI. If a button is added, reuse existing influence/merit button classes and
`theme.css` tokens — no inline `style=` / bare hex (`specs/project-context.md`,
`specs/architecture/coding-standards.md`). The Contacts block already has its classes.

### Testing
No client test framework for the render path — **manual smoke on dev** after the
script runs (add a Contacts merit on a character with none; confirm spheres +
influence). The optional regression guard is server vitest. `node --check` changed JS.

## Dev Agent Record

### Files to change
- `server/scripts/set-contacts-influence-subcategory.js` (NEW — user-run data fix)
- `public/js/editor/sheet.js` (ONLY if T2 finds a real convert-path gap)
- `server/tests/...` (optional regression guard)

### Files changed
- `server/scripts/set-contacts-influence-subcategory.js` (NEW — user-run data fix)

### Completion notes
- **T1 (data script):** created. Idempotent, `--dry-run` default / `--apply` to
  write, no shebang, `main()` + cross-platform direct-invocation guard. Dry-run
  verified against live `tm_suite`: `Contacts (category=merit, sub_category=null)`
  → would set `'influence'`. **User runs `cd server && node
  scripts/set-contacts-influence-subcategory.js --apply`** (import-responsibility;
  no live writes performed here).
  - **Gotcha fixed:** the direct-invocation guard copied from
    `cleanup-m-free-deprecation.js` (`import.meta.url === \`file://${process.argv[1]}\``)
    silently no-ops on Windows / paths with spaces, so `main()` never ran. Switched
    to `pathToFileURL(process.argv[1]).href`. (The precedent script likely has the
    same latent bug — flag to Peter.)
- **T2 (code verify):** NO code change needed. The add-Allies-then-switch-to-Contacts
  path works end-to-end once Contacts is in the dropdown (verified via
  `shEditInflMerit`, `pruneContactsSpheres`, the Contacts render block, and
  `shEditContactSphere`).
- **T3 (regression guard):** deferred deliberately. A meaningful guard needs the
  full merit catalog seeded in `tm_suite_test` (not currently done) — there is no
  cheap source-of-truth file to assert against since the catalog lives in the DB.
  Disproportionate setup for a one-time data correction on a solo project; the
  idempotent, re-runnable script + this story are the durable record. Flag if you
  want it built.

### Change Log

| Date | Description |
|------|-------------|
| 2026-06-17 | Implemented: user-run data-fix script for Contacts sub_category; convert path verified (no code change); T3 deferred. Status → review. |
