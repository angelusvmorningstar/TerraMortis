---
adr: ADR-010 Rev 3 (D1, D1b, D4, D8)
issue: 1111
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1111
branch: piatra/issue-1111-swear-by-stories
base: origin/dev via piatra/adr-010-swear-by
---

# Story OATH-A (#1111): swear a Swear By oath and pledge merits against it

## Status

Ready for Dev

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

_(Ptah)_

## QA Results

_(Ma'at)_
