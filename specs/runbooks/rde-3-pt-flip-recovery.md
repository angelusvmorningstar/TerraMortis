# RDE-3 PT Flip — Recovery Runbook

**Purpose:** If the PT evaluator flip introduces a regression, this runbook restores the character data and code to pre-flip state.

**Scope:** Professional Training only. Other rule families are unaffected.

---

## When to use this runbook

- PT grants (`free_pt`, Contacts auto-creation, `_pt_nine_again_skills`, `_pt_dot4_bonus_skills`) produce wrong values after the flip commit lands on main.
- Character sheets show incorrect Contacts dots or missing 9-again underlines.
- The flip commit's parallel-write tests pass but a live production character fails the manual check.

---

## Step 1 — Revert the flip commit

```
git revert <flip-commit-hash>
git push origin main
```

Render redeploys automatically. The legacy PT block is restored.

The evaluator files (`public/js/editor/rule_engine/pt-evaluator.js`, `load-rules.js`) remain in the codebase but are no longer called — no need to delete them.

---

## Step 2 — Clear `free_pt` fields in the database

After revert, the legacy code will recompute `free_pt` correctly on the next character render. However, any `free_pt` values written to DB between flip and revert should be cleared so they do not corrupt the legacy calculation.

**Against `tm_suite_test` (verify first):**

```js
// Run via MongoDB Compass or mongosh
use tm_suite_test
db.characters.updateMany(
  { "merits.free_pt": { $gt: 0 } },
  { $set: { "merits.$[elem].free_pt": 0 } },
  { arrayFilters: [{ "elem.free_pt": { $gt: 0 } }] }
)
```

**Against `tm_suite` (production — confirm with team before running):**

```js
use tm_suite
db.characters.updateMany(
  { "merits.free_pt": { $gt: 0 } },
  { $set: { "merits.$[elem].free_pt": 0 } },
  { arrayFilters: [{ "elem.free_pt": { $gt: 0 } }] }
)
```

`free_pt` is an ephemeral render-time field — clearing it to 0 is safe. The legacy evaluator will re-set it to the correct value (2) on the next character load.

---

## Step 3 — Optionally drop the seeded PT rule docs

The seeded rule docs in `rule_grant`, `rule_nine_again`, and `rule_skill_bonus` are inert after the revert (nothing calls the evaluator). They can remain without harm, or be dropped:

```js
use tm_suite_test // or tm_suite
db.rule_grant.deleteMany({ source: 'Professional Training' })
db.rule_nine_again.deleteMany({ source: 'Professional Training' })
db.rule_skill_bonus.deleteMany({ source: 'Professional Training' })
```

Re-seed with `seed-rules-pt.js --apply` before re-attempting the flip.

---

## Step 4 — Verify recovery

1. Open admin sheet for three PT-bearing characters.
2. Confirm `free_pt: 2` is shown on Contacts.
3. Confirm 9-again underlines appear on asset skills for PT rating ≥ 2.
4. Confirm the Contacts merit rating is correct (cp + free_pt).

---

## Runbook exercise log

Run this against `tm_suite_test` before the flip PR. Record output below.

| Date | Operator | DB | Outcome |
|------|----------|----|---------|
| (fill in before flip) | | tm_suite_test | |
