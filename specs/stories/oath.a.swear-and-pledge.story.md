---
adr: ADR-010 Rev 3 (D1, D1b, D4, D8)
issue: 1111
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1111
branch: piatra/issue-1111-swear-by-stories
base: origin/dev via piatra/adr-010-swear-by
---

# Story OATH-A (#1111): swear a Swear By oath and pledge merits against it

## Status

Ready for Review

## Story

**As an** Invictus player taking a reworked oath,
**I want** to swear a Swear By oath at no XP cost by pledging an equal number of dots from merits I already own,
**so that** the sheet records what I have staked, and the oath stops being a zero-cost row that means nothing.

This story ships the **purchase flow only**. Nothing about breaking an oath is in scope — that is Story B.

## Context you need before reading the ACs

The five Swear By oaths are **live and buyable today at zero cost, doing nothing.** `cost_model: 'swear_by'` is read by no code.

Two facts change how you should approach this:

1. **Greenfield.** Zero characters hold any of the five oaths. No backfill, no migration, nothing live to preserve. Spend that.
2. **The rows are currently unreachable through the API.** `POST /api/rules` validates against `purchasablePowerSchema`, which is `additionalProperties: false` and does not declare `cost_model`. `PUT /api/rules/:key` filters through `UPDATABLE_FIELDS` (`server/routes/rules.js:70-76`), which omits it. The five rows exist only because they were written straight to Atlas, and **they currently fail their own validator.** Every field this story adds inherits that problem unless D8 ships with it.

## Acceptance Criteria

1. **Pledge on swear.** When a Swear By oath is added to a character, the player nominates merits to pledge. The pledge persists on the **oath merit row** as `m.sworn_by` per ADR-010 D1:
   ```js
   sworn_by: {
     dots_required: <int>,
     attachments: [{ name, qualifier, dots }],
     sworn_at: <iso>,
     history: []
   }
   ```
2. **References are by name + qualifier, never by array index.** `c.merits` is array-indexed and indices move under splice. Name-based referencing is the existing house convention (`shared_with`, `attached_to`). An index-based reference is a defect even if it passes every test.
3. **Parity is enforced, and it is dot count.** Merits are 1 XP/dot (`xpSpentMerits` sums `m.xp` with no multiplier, `xp.js:119`), so "an equal number of xp worth of merits" reduces to **equal dot count**. A pledge that does not total `dots_required` is rejected with a message naming the shortfall or excess. No cost table, no XP lookup.
4. **`dots_required` is snapshotted at swear time, not recomputed.** Otherwise a rising Blood Potency silently invalidates a standing Oath of Abstinence's parity every time it moves.
5. **Derived rating bases resolve at render time.** `rating_basis` on the rule, discriminator-typed per ADR-010 D4:
   - `{ type: 'blood_potency_multiple', factor: 2 }` — Oath of Abstinence
   - `{ type: 'highest_status', pools: ['covenant', 'clan'] }` — Oath of the Model Prisoner

   Never stored on the character (the project rule that derived stats are never stored). `rating_range` is **already `null`** on both of these rows, so nothing wrong needs displacing — the basis is missing, not incorrect.
6. **Encumbrance is display + edit gate, zero accessor changes.** Pledged dots remain **fully usable**. Every sum in the codebase must continue to return exactly what it returns today. The sheet badges pledged merits, and the editor refuses to sell or reallocate dots pledged to a standing oath. Both read a **render-time reverse index** built from D1 — the merit-to-oath direction is never persisted.

   **If you find yourself editing a dot-sum helper in this story, stop.** That is Story B's territory and it is the single most expensive mistake available here.
7. **D8 — schema and route reachability ship in this PR, not after.** All of:
   - `server/schemas/purchasable_power.schema.js` declares `cost_model` and `rating_basis`
   - `UPDATABLE_FIELDS` in `server/routes/rules.js` includes them
   - `server/schemas/character.schema.js` declares `sworn_by`

   Verify by round-trip: create and edit a Swear By oath **through the API**, not by writing to the collection.
8. **The five live rows validate.** They currently fail their own schema and carry stray `selected: true` / `special: null`. After this story they pass. Fix the rows; do not loosen the validator to accommodate them.
9. **Suite unchanged, not green.** `origin/dev` carries pre-existing failures. The criterion is a named-set comparison — same failing test names before and after, none of them an OATH-A surface. **Preconditions: `ls markdown | wc -l` returns 10, and MongoDB is reachable via `MONGODB_URI`** (a local `mongod` cannot work — `db.js:31` sets `tls: true` unconditionally). A run with 1074 skips proves nothing. See #1117.

## Explicitly NOT in this story

- **Uniqueness enforcement.** ADR-010 D5 was **withdrawn** on Peter's ruling: STs coordinate and check this, it is not enforced in code. A character can hold two Oaths of Burning Blood and nothing stops them. **This is a product decision, not an oversight** — do not add a check, and do not file the gap as a bug.
- Breaking, suspension, exit events, forfeiture, restoration — all Story B.
- The `sub_category` inconsistency across the family (three rows `null`, two `'oath'`). Real, but not this story. Note that any picker keyed on `sub_category === 'oath'` sees two of five.

## Dev Notes

### Why the pledge lives on the oath, not the merit
Both ends are on the same character document, so one end must own it or they desync. The oath owns it because every write is oath-triggered and parity is a property of the oath. The reverse direction is a render-time index, never stored.

### Why not `free_grants`
It is source-keyed with `minimum: 0` and means **dots given** — the inverse of dots owed. Reusing it would put pledged dots into every free-dot sum in the codebase.

### Test obligations
- Parity rejection must be **demonstrated failing**, not merely passing on a correct pledge.
- Round-trip the API path for D8. A schema change verified only by unit test does not prove an ST can edit the row.

## Dev Agent Record

### Agent Model Used

Ptah (DEV) — claude-opus-5

### Three live-data findings that changed the design (all ruled by SM)

Verified read-only against live `tm_suite`, 2026-08-07.

**1. Greenfield confirmed, wider than briefed.** 0 characters hold ANY of the 21 oath-family merits (not just the five), and 0 character merits carry `sworn_by`. No backfill, no migration.

**2. Ten rows carry `cost_model`, not five — and the other five are a different value.** `distinct(cost_model)` = `['free','swear_by']`.

| value | rows |
|---|---|
| `swear_by` | oath-of-abstinence, oath-of-the-model-prisoner, oath-of-action, oath-of-burning-blood, oath-of-the-bloody-hand |
| `free` | oath-of-penance, oath-of-the-handshake-deal, oath-of-running-blood, blood-tell-oath, oath-of-blood-knives |

Declaring `enum: ['swear_by']` — the obvious reading of the story, which says "five rows" throughout — would have made five OTHER live rows newly invalid while fixing five. The enum is `['swear_by','free',null]`. *(The ADR §2 had this right; the story narrowed it. SM ruling: read the ADR as authoritative where they disagree.)* The `sub_category` split is likewise 5/5 across the family, not 2/5 — the story's line was scoped to the `swear_by` five without saying so.

**3. AC8's premise was wrong, and it is worth stating precisely.** The ADR frames the stray `selected` / `special` keys as oath-row hygiene. They are collection-wide debt. Compiling `purchasablePowerSchema` with ajv and running it over the whole collection:

```
673 rows total, 666 FAIL the current schema. Only 7 pass.
undeclared-property tally repo-wide:  selected 666,  special 527,  cost_model 10
```

So "the rows fail their own validator" is true of essentially the entire collection, not distinctively of the oaths. **SM ruling: strip the two keys from the ten `cost_model` rows only; file the remaining ~656 separately.** A 666-row migration does not belong inside a purchase-flow story.

Related, and corrected after I got it wrong first: I initially reported the cleanup script as missing, because `ls server/scripts/` does not recurse. It exists at **`server/scripts/archive/strip-selected-from-purchasable-powers.js`** — archived by f07887fc, dry-run by default, backs up on `--apply`, filter `{ selected: { $exists: true } }` (collection-wide). The stale part of the schema comment was the PATH. The real finding is sharper: **a purpose-built, backup-taking script exists and `selected` is still on 666 rows**, so either it never ran or something re-seeds the field. That distinction decides whether the follow-up is "run the existing script" or "find what puts it back", and it must be answered before anyone writes a new one. The schema comment now says exactly that.

### What shipped

**D8 — schema and route reachability (AC 7).** `purchasable_power.schema.js` declares `cost_model`, `rating_basis` (discriminator-typed, two variants, each `additionalProperties: false` so one variant cannot borrow the other's fields) and `forfeiture`. `UPDATABLE_FIELDS` gains all three — including `forfeiture`, whose consumer is OATH-B, precisely because a forward-declared field STs cannot edit is the `cost_model` failure repeating. `character.schema.js` declares `sworn_by`.

**D1 / D1b / D4 — the pure helpers**, in `public/js/data/rules-helpers.js` (the no-browser-imports module, so vitest and server code can import them): `resolveRatingBasis`, `meritMatchesRef`, `resolveAttachment`, `swornOaths`, `pledgeKeyFor`, `buildPledgeIndex`, `pledgedDots`, `pledgeableDots`, `validatePledge`, `buildSwornBy`.

**The write path**: `shSwearOath` / `shReleaseOath` / `shSetPledgeDots` / `shCommitOath` in `edit-domain.js`, exported through `edit.js` and bound in `admin.js` alongside the sibling handlers.

**The UI**: a pledge editor under each Swear By oath row in edit mode (one stepper per eligible merit, a live parity total, Swear / Re-swear / release), and a "Pledged N" badge on every encumbered merit plus a "Sworn N" note on the oath row — in **both** renderers.

### Decisions worth recording

**`ratingOf` is injected, with no default.** `pledgeableDots` and `validatePledge` take the owned-dots function as a parameter. The formula lives in `meritRating` (`xp.js:190`), which sits behind the browser import chain `rules-helpers.js` must stay clear of. Re-implementing it locally would have created a **sixth fork of merit-dot arithmetic** in a codebase where the existing five already disagree, so there is deliberately no fallback — a caller that forgets it gets 0, not a second opinion. Pinned by a test.

**The edit gate is a clamp on the write, and touches no sum.** In `shEditMeritPt`, a merit with pledged dots gets a floor: the field cannot be reduced past the point where owned dots would fall below what is pledged. Computed against what *that field* contributes, so reducing an unrelated channel on the same merit is unaffected, and fields outside `meritRating`'s channel list contribute 0 and never clamp spuriously. **No accessor was modified.** Pinned two ways: a source assertion that `xp.js` and `domain.js` contain no OATH-A symbol, and a behavioural assertion that `meritRating` returns the identical value with and without a pledge.

**`pledgeKeyFor` joins on NUL, not a space.** A space join makes `{ name: 'Safe', qualifier: 'Place' }` collide with `{ name: 'Safe Place', qualifier: null }` — a real collision given merit names contain spaces. There is a test for exactly that pair.

**Drafts are `_`-prefixed.** `shSetPledgeDots` stages into `m._pledge_draft` and only `shCommitOath` promotes it to `sworn_by`, after validation. The underscore means both existing save paths strip it, so a half-built pledge cannot reach a persisted document or the localStorage mirror.

**`sworn_at.chapter_number` is captured although nothing in OATH-A reads it.** ADR-010 Risk 2: it is unrecoverable after the fact and OATH-B's deferred restoration is uncomputable without it. Asserted on the written object, not the render. It records `null` rather than inventing an ordinal when no chapter context is loaded — a wrong ordinal is worse than an absent one.

**No uniqueness enforcement**, per D5 withdrawn. Not added, not filed as a bug.

### A bug my own test caught, worth recording

The badge helpers were first defined inside the edit-mode branch of `shRenderGeneralMerits`, so view mode threw `_pledgeBadge is not defined` — the exact single-renderer blind spot the story warns about, reproduced on the first attempt. It was caught because the badge assertions were written against **both** renderers from the start rather than added after the edit-mode path worked. Definitions are now hoisted to function scope.

### Test results

| suite | tests | needs Mongo? |
|---|---|---|
| `oath-a-pledge-helpers.test.js` | 29 | no — **verified here** |
| `oath-a-render-and-gate.test.js` | 17 | no — **verified here** |
| `oath-a-d8-api-roundtrip.test.js` | 12 | **yes — SKIPPED in my environment, unverified** |

Parity rejection is **demonstrated failing**, per the story's explicit obligation: short, over, over-pledge-beyond-owned, unowned merit, duplicate reference and zero-dot are each asserted to be rejected with their message, not merely that a correct pledge passes.

Full suite: **4 failed → 4 failed, the same four canonical names, none of them an OATH-A surface.** 2120 tests, 1032 passed.

### AC 8 — prod write, HELD pending Peter's ruling

`server/scripts/fix-1111-oath-row-hygiene.js` — dry-run by default, backs up every targeted document to `server/scripts/_backups/` before writing, `--apply` to write. **It has not been applied.** Dry-run output against live `tm_suite`:

```
Matched: 10 rows carrying cost_model
  every row:  $unset selected, special      validates: FAIL -> PASS
  oath-of-abstinence         + $set rating_basis {blood_potency_multiple, factor 2}
  oath-of-the-model-prisoner + $set rating_basis {highest_status, pools [covenant, clan]}
Summary: 10/10 rows validate after this change.
Out of scope (filed separately): 656 rows keep `selected` and 517 keep `special`, of 673 total.
```

Per the SM's adopted separation: **AC 7's D8 round-trip proof runs entirely on `tm_suite_test` and needs no production write.** Only AC 8 does. If the write is deferred, AC 8 carries forward as a follow-up and the story still delivers a working purchase flow.

### Environment limitation — the same one as #1110, pre-escalated

Preconditions: `ls markdown | wc -l` → **10** (satisfied). **MongoDB NOT reachable** — no `mongod`, `db.js:31` sets `tls: true` unconditionally over `config.js:9`'s plain localhost default so a local daemon can never connect, and `server/.env` is blocked by a security hook. **1084 tests skipped**, including this story's own D8 round-trip suite.

**Ma'at must run `oath-a-d8-api-roundtrip.test.js` with Mongo up.** It is the AC 7 proof and I have not executed it. The other 46 OATH-A tests need no DB and are verified here.

### File List

**Modified — server:**
- `server/schemas/purchasable_power.schema.js` — `cost_model`, `rating_basis`, `forfeiture`; corrected the stale `selected` comment
- `server/routes/rules.js` — `UPDATABLE_FIELDS` += the three
- `server/schemas/character.schema.js` — merit `sworn_by`

**Modified — client:**
- `public/js/data/rules-helpers.js` — the ten pure helpers
- `public/js/editor/edit-domain.js` — swear / release / draft handlers, `isSwearByOath`, `oathDotsRequired`
- `public/js/editor/edit.js` — pledged-dot edit gate in `shEditMeritPt`; handler re-exports
- `public/js/editor/sheet.js` — pledge editor, badge + sworn note in both renderers
- `public/js/admin.js` — window bindings

**Added:**
- `server/scripts/fix-1111-oath-row-hygiene.js` (AC 8, **not applied**)
- `server/tests/oath-a-pledge-helpers.test.js`, `oath-a-render-and-gate.test.js`, `oath-a-d8-api-roundtrip.test.js`

### Change Log

| Date | Change |
|---|---|
| 2026-08-07 | Live survey: greenfield confirmed; ten `cost_model` rows across two values; 666/673 rows fail the schema |
| 2026-08-07 | D8 schema + allowlist + character schema; pure helpers; swear write path; pledge editor and badge in both renderers; edit gate |
| 2026-08-07 | 46 non-DB tests green; AC8 script dry-run 10/10 FAIL→PASS, write held for Peter |

## QA Results

_(Ma'at)_
