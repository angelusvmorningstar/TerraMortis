---
id: issue-4
issue: 4
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/4
branch: issue-4-rules-grant-ajv
status: ready-for-review
priority: high
depends_on: []
---

# Story #4: Rules Engine — reconcile rule_grant schema with the live form

As an ST creating new merit grant rules via the Rule Data admin tab,
I should be able to save any valid grant configuration the form lets me build,
So that the schema stops blocking work that the client UI considers legitimate.

This is currently the **highest-friction blocker** in the rules engine — every attempt to add a new grant rule fails with Ajv validation errors, regardless of grant type.

---

## Context

The issue body describes a 4-error Ajv rejection on `POST /api/rules/grant`:

```
must NOT have additional properties: pool_targets
must NOT have additional properties: partner_merit_name
/target must be string
/amount must be integer
```

A code re-read against the current `dev` branch reveals the drift is **wider than the issue describes**. The form (`_fieldsGrant` and `_readFormData` in `public/js/admin/rules-data-view.js`) emits a richer payload than the schema knows about:

| Field / value | Form emits | Schema accepts |
|---|---|---|
| `pool_targets` (array) | yes (`:316, 661-662`) | NO |
| `target_field` | yes (`:312, 667-668`) | NO |
| `partner_merit_names` (array) | yes (`:324, 663-664`) | NO |
| `partner_status_names` (array) | yes (`:329, 665-666`) | NO |
| `grant_type = "auto_bonus"` | yes (`:298`) | NO (enum: merit/pool/speciality) |
| `grant_type = "status_floor"` | yes (`:298`) | NO |
| `grant_type = "style_pool"` | yes (`:298`) | NO |
| `amount_basis = "rating_of_status"` | yes (`:299`) | NO (enum: flat/rating_of_source/rating_of_partner_merit) |

Required fields in the schema (`required: ['source', 'grant_type', 'target', 'amount', 'amount_basis']`) are unconditional — but `pool` grants legitimately have no `target` or `amount`, and `auto_bonus` grants have `target` + `target_field` without `amount`. Client validation already handles this correctly per-`grant_type` (`_validate`, `:550-572`); the server schema does not, so client/server disagree.

### Files in scope

- `server/schemas/rules/rule-grant.schema.js` — the Ajv schema (entire file, ~44 lines). Bug surface.
- (Verify only) `public/js/admin/rules-data-view.js` — read `_validate` (`:545-627`), `_readFormData` (`:644-670`), `_fieldsGrant` (`:296-332`) to confirm the field/grant-type/amount-basis catalogue is captured.
- (Verify only) `server/routes/rules.js` (or wherever `POST /api/rules/grant` lives) — confirm the schema is the only validation gate. If the route does additional shape massaging, document it; do not refactor.

### Files NOT in scope

- The other rule families (`rule_speciality_grant`, `rule_skill_bonus`, `rule_nine_again`, `rule_disc_attr`, `rule_derived_stat_modifier`, `rule_tier_budget`, `rule_status_floor`). The issue notes the same audit pattern likely applies to all, but defer until this one is the resolved template.
- Any change to `_validate` on the client. Client validation already matches the per-grant_type semantics; server is what needs to catch up.
- Any data migration of existing rules in MongoDB.

### Decisions to make explicit before code

1. **Direction of reconciliation.** The schema is behind the client. The fix is to **expand the schema to cover what the client legitimately sends** — not to retract the client. Rationale: the new `grant_type` values (`auto_bonus`, `status_floor`, `style_pool`) and `amount_basis = rating_of_status` are real features in the rules engine, in active use; rolling them back would regress the engine. The issue's "client validation either matches or is a strict subset" guidance still applies — server becomes the authoritative shape, client validation matches.
2. **Conditional requirements.** Use Draft-07 `if`/`then`/`else` (or `allOf` with conditionals) so:
   - `grant_type === 'pool'` → require `pool_targets`; do **not** require `target` or `amount`.
   - `grant_type === 'auto_bonus'` → require `target`, `target_field`; do **not** require `amount`.
   - `grant_type ∈ {merit, speciality, status_floor, style_pool}` → require `target`, `amount`.
   All cases require `source`, `grant_type`, `amount_basis`.

---

## Acceptance Criteria

**Given** an ST opens the Rule Data admin tab and clicks New → Grant
**When** they fill in `source = "Library"`, `grant_type = "merit"`, `target = "Resources"`, `amount = 2`, `amount_basis = "flat"` and click Save
**Then** `POST /api/rules/grant` returns 200/201 and the rule persists.

**Given** an ST creating a pool grant
**When** they set `grant_type = "pool"`, `pool_targets = "Herd, Mentor, Resources, Retainer"`, `source = "Mystery Cult Initiation"`, `amount_basis = "rating_of_partner_merit"` and click Save (no `target`, no `amount`)
**Then** the POST succeeds and the rule persists.

**Given** an ST creating an auto_bonus grant
**When** they set `grant_type = "auto_bonus"`, `source = "Friend With Benefits"`, `target = "Allies"`, `target_field = "free_fwb"`, `amount_basis = "rating_of_partner_merit"` and click Save
**Then** the POST succeeds and the rule persists.

**Given** an ST creating a status_floor or style_pool grant via this form
**When** they fill in the per-type required fields and click Save
**Then** the POST succeeds — `grant_type` enum accepts both values.

**Given** an ST creating a merit grant where amount basis is `rating_of_status`
**When** they set `partner_status_names = "city"` (or "covenant", etc.) and `amount_basis = "rating_of_status"`
**Then** the POST succeeds.

**Given** an ST submitting a grant with empty optional fields
**When** the request body is built
**Then** the body contains no `null` values and no keys not in the server schema. (Already true — `_readFormData` only adds fields when truthy. Verify-only.)

**Given** an ST submitting a grant whose `target` references a merit not in `MERITS_DB`
**When** the form validates
**Then** client validation rejects it before POST (existing behaviour, must not regress).

**Given** the schema is reconciled
**When** a developer reads `server/schemas/rules/rule-grant.schema.js`
**Then** every field the client form can emit is listed under `properties`, and `required` is conditional on `grant_type` so no valid form configuration is rejected.

---

## Implementation Notes

### Schema rewrite shape

```js
export const ruleGrantSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Grant',
  type: 'object',
  required: ['source', 'grant_type', 'amount_basis'],
  additionalProperties: false,

  properties: {
    source:                { type: 'string', minLength: 1 },
    tier:                  { type: 'integer', minimum: 1, maximum: 5 },
    condition:             { type: 'string', enum: ['always', 'tier', 'choice', 'pact_present', 'bloodline', 'fighting_style_present'] },
    grant_type:            { type: 'string', enum: ['merit', 'pool', 'speciality', 'auto_bonus', 'status_floor', 'style_pool'] },
    target:                { type: 'string', minLength: 1 },
    target_field:          { type: 'string', minLength: 1 },
    target_qualifier:      { type: 'string' },
    target_category:       { type: 'string' },
    bloodline_name:        { type: 'string' },
    amount:                { type: 'integer', minimum: 0 },
    amount_basis:          { type: 'string', enum: ['flat', 'rating_of_source', 'rating_of_partner_merit', 'rating_of_status'] },
    pool_targets:          { type: 'array', items: { type: 'string', minLength: 1 } },
    partner_merit_names:   { type: 'array', items: { type: 'string', minLength: 1 } },
    partner_status_names:  { type: 'array', items: { type: 'string', minLength: 1 } },
    auto_create:           { type: 'boolean' },
    sphere_source:         { type: 'string' },
    choice_field:          { type: 'string' },
    excluded_choice:       { type: 'string' },
    read_refs:             { /* unchanged */ },
    notes:                 { type: 'string' },
    created_at:            { type: 'string' },
    updated_at:            { type: 'string' },
  },

  allOf: [
    {
      if:   { properties: { grant_type: { const: 'pool' } }, required: ['grant_type'] },
      then: { required: ['pool_targets'] },
    },
    {
      if:   { properties: { grant_type: { const: 'auto_bonus' } }, required: ['grant_type'] },
      then: { required: ['target', 'target_field'] },
    },
    {
      if:   { properties: { grant_type: { enum: ['merit', 'speciality', 'status_floor', 'style_pool'] } }, required: ['grant_type'] },
      then: { required: ['target', 'amount'] },
    },
  ],
};
```

Notes:
- `condition` enum picks up `fighting_style_present` from the form (`:297`).
- `grant_type` and `amount_basis` enums broadened to match the form's option lists.
- New properties: `target_field`, `pool_targets`, `partner_merit_names`, `partner_status_names`.
- Conditional `required` via `allOf` of `if/then` blocks (Ajv default supports this with no extra config).
- Top-level `required` now has only what is universally required: `source`, `grant_type`, `amount_basis`.

### Verification path

`server/scripts/` likely has a smoke runner or you can invoke directly:

```js
import Ajv from 'ajv';
import { ruleGrantSchema } from '../schemas/rules/rule-grant.schema.js';
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(ruleGrantSchema);

// Case A: merit grant
console.log('merit', validate({ source: 'Library', grant_type: 'merit', target: 'Resources', amount: 2, amount_basis: 'flat' }), validate.errors);
// Case B: pool grant
console.log('pool', validate({ source: 'MCI', grant_type: 'pool', pool_targets: ['Herd','Mentor'], amount_basis: 'rating_of_partner_merit' }), validate.errors);
// Case C: auto_bonus
console.log('auto', validate({ source: 'FWB', grant_type: 'auto_bonus', target: 'Allies', target_field: 'free_fwb', amount_basis: 'rating_of_partner_merit' }), validate.errors);
// Case D: status_floor
console.log('sfloor', validate({ source: 'Whatever', grant_type: 'status_floor', target: 'invictus', amount: 1, amount_basis: 'flat' }), validate.errors);
// Negative: pool grant missing pool_targets → must fail
console.log('neg', validate({ source: 'X', grant_type: 'pool', amount_basis: 'flat' }), validate.errors);
```

All positive cases must return `true`; the negative case must return `false` with a clear error.

---

## Test Plan

Manual verification (project has no test framework):

1. **Server smoke** — drop the verification snippet above into a temp script under `server/scripts/_smoke-rule-grant.js`, run it, confirm the 4 positive cases pass and the negative case fails with a `pool_targets`-required error. Delete the temp script.
2. **Live merit grant** — start `cd server && npm run dev` and `npx http-server public -p 8080`. Open admin → Rule Data → Grants → New. Fill: source=`Library`, grant_type=`merit`, target=`Resources`, amount=`2`, amount_basis=`flat`. Save. Confirm rule persists and re-renders.
3. **Live pool grant** — New. source=`Mystery Cult Initiation`, grant_type=`pool`, pool_targets=`Herd, Mentor, Resources, Retainer`, amount_basis=`rating_of_partner_merit`, partner_merit_names=`Library`. Save. No 400.
4. **Live auto_bonus grant** — New. source=`Friend With Benefits`, grant_type=`auto_bonus`, target=`Allies`, target_field=`free_fwb`, amount_basis=`rating_of_partner_merit`. Save. No 400.
5. **Negative path — bad target merit** — try a merit grant with target=`Notamerit`. Client validation should block before POST (existing behaviour). Confirm.
6. **Edit + re-save** — open an existing grant rule, modify `notes`, save. Confirm round-trip is clean.

---

## Definition of Done

- [ ] All ACs pass manual verification *(QA — requires running server + admin UI)*
- [x] `git diff` is limited to `server/schemas/rules/rule-grant.schema.js` (no spillover edits to client validation; no migration script)
- [x] No regression in other rule families — `_activeFamily !== 'grant'` paths untouched *(only the grant schema file changed)*
- [x] Client `_validate` continues to gate before POST (no double-error UX) *(client unchanged)*
- [ ] PR opened by `tm-gh-pr-for-branch` into **`dev`** (not `main` — let `dev` accumulate before next prod sync), body closes #4 *(SM step after QA)*

---

## Note for QA (Ma'at)

After Ptah commits the schema fix, please **append your QA Results section to this story file as a new commit on `issue-4-rules-grant-ajv`** (not as a working-tree edit). That way the QA record ships in the PR diff. Lesson learned from the issue-14 trial.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed:**
- `server/schemas/rules/rule-grant.schema.js` (+35/-18) — schema rewrite per the story sketch:
  - `required` reduced to universal `['source', 'grant_type', 'amount_basis']`
  - `condition` enum gains `fighting_style_present`
  - `grant_type` enum gains `auto_bonus`, `status_floor`, `style_pool`
  - `amount_basis` enum gains `rating_of_status`
  - New properties: `target_field`, `pool_targets`, `partner_merit_names`, `partner_status_names`
  - `read_refs` shape preserved verbatim
  - `allOf` block adds Draft-07 `if/then` conditional requireds: `pool` ⇒ `pool_targets`; `auto_bonus` ⇒ `target` + `target_field`; `merit | speciality | status_floor | style_pool` ⇒ `target` + `amount`

**Verification (server smoke):**
Temporary smoke script `server/scripts/_smoke-rule-grant.js` was created, run, and deleted (working tree clean of it; no file in this commit). Output:

```
PASS  A merit         expect=true  got=true
PASS  B pool          expect=true  got=true
PASS  C auto_bonus    expect=true  got=true
PASS  D status_floor  expect=true  got=true
PASS  NEG pool-no-targets  expect=false  got=false
        → required: pool_targets   (allOf/0/then)
5/5 expected outcomes met (0 mismatches)
```

**Completion Notes:**
- Single-file change. No client edits, no migration, no route changes.
- `additionalProperties: false` retained — anything the form doesn't list explicitly is still rejected, which is intentional belt-and-braces against future drift.
- Conditional `required` uses `allOf` of `if/then` blocks; Ajv default config (no extra options) supports this without `useDefaults` or `coerceTypes`.
- Each `if` clause includes `required: ['grant_type']` so a body missing `grant_type` is caught by top-level `required` rather than producing a confusing conditional-required error path.
- The negative smoke case correctly trips on the missing `pool_targets`, confirming the `if/then` is wired up.

**Change Log:**
- 2026-05-04 — Implemented per Story #4. Single commit on `issue-4-rules-grant-ajv` (schema + this Dev Agent Record together, as instructed by SM).
