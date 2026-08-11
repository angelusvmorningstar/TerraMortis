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

### AC 8 — prod write, APPLIED 2026-08-07 (Peter approved on the dry-run numbers)

`server/scripts/fix-1111-oath-row-hygiene.js` — dry-run by default, backs up every targeted document to `server/scripts/_backups/` before writing, `--apply` to write. **It has not been applied.** Dry-run output against live `tm_suite`:

```
Matched: 10 rows carrying cost_model
  every row:  $unset selected, special      validates: FAIL -> PASS
  oath-of-abstinence         + $set rating_basis {blood_potency_multiple, factor 2}
  oath-of-the-model-prisoner + $set rating_basis {highest_status, pools [covenant, clan]}
Summary: 10/10 rows validate after this change.
Out of scope (filed separately): 656 rows keep `selected` and 517 keep `special`, of 673 total.
```

Per the SM's adopted separation: **AC 7's D8 round-trip proof runs entirely on `tm_suite_test` and needs no production write.** Only AC 8 does.

#### Applied — before/after, verified INDEPENDENTLY of the script

The script's own summary is not evidence that the script worked; that is the ECM failure shape and the reason this was held. A separate probe compiled `purchasablePowerSchema` with ajv and counted the collection directly, before and after.

| measure | before | after | required |
|---|---|---|---|
| oath rows passing the schema | 0 / 10 | **10 / 10** | all pass |
| total rows failing the schema | 666 | **656** | drop by exactly 10 |
| out-of-scope rows keeping `selected` | 656 | **656** | unchanged |
| out-of-scope rows keeping `special` | 517 | **517** | unchanged |
| total rows in collection | 673 | **673** | unchanged |
| oath rows carrying `selected` / `special` | 10 / 10 | **0 / 0** | stripped |
| `rating_basis` on the two D4 targets | null, null | **both seeded** | seeded |

All seven checks pass. The delta is exactly 10 and nothing outside the ten rows moved, so the write did what the approved diff said and no more.

Sequence followed, per the SM's four conditions: before-state captured as evidence independently of the backup; dry run re-run immediately pre-apply and confirmed still `Matched: 10` with the out-of-scope line still 656/517/673, so the approved diff was still the applicable diff; applied; postcondition verified by the independent probe.

Rollback artefact: `fix-1111-oath-rows-2026-08-07T09-46-30-245Z.json`, 10 full pre-change documents (all 10 carry `selected` and `special` as they were). `server/scripts/_backups/` is gitignored and the worktree is disposable, so the file was **copied to the main repository's `server/scripts/_backups/`** — a recovery artefact that only exists inside a temporary worktree is not a recovery artefact.

### Environment limitation — the same one as #1110, pre-escalated

Preconditions: `ls markdown | wc -l` → **10** (satisfied). **MongoDB NOT reachable** — no `mongod`, `db.js:31` sets `tls: true` unconditionally over `config.js:9`'s plain localhost default so a local daemon can never connect, and `server/.env` is blocked by a security hook. **1084 tests skipped**, including this story's own D8 round-trip suite.

**Ma'at must run `oath-a-d8-api-roundtrip.test.js` with Mongo up.** It is the AC 7 proof and I have not executed it. The other 46 OATH-A tests need no DB and are verified here.

### QA round 1 — two fixes (2026-08-07)

**Fix 1 — the edit gate had a reachable bypass. AC 6 was not met.** The clamp exempted every `free_grants.*` field, but `meritRating` SUMS ten of those channels and `pledgeableDots` measures pledges in `meritRating` terms — so the dots that *can* be pledged were exactly the ones exempt from the floor protecting them, and `xp.js` emits `shEditMeritPt(idx, 'free_grants.mci', …)` straight from the bd-row, making it reachable from the UI.

The part I got wrong is the direction. My comment claimed fields outside `meritRating`'s channel list contribute 0 and so never clamp spuriously — true, and not the gap. The gap was the inverse: fields *inside* the list written by a dotted path were skipped by the prefix guard and never clamped **at all**. I reasoned carefully about over-clamping and shipped under-clamping, then wrote a comment asserting the safety of the case that was broken. A guard justified by one direction of failure needs the other direction tested, not argued.

Fixed per QA: drop the `startsWith` exemption, measure the field's contribution as `meritRating(c, <merit with the field cleared>)`. Handles dotted and flat paths with no per-slug allowlist, and the property the guard used to provide now falls out of the measurement rather than depending on it — `free_grants.necro` is absent from `meritRating`'s sum, so it measures a 0 contribution and still never clamps. Both directions are pinned by regression tests; the first was confirmed **failing before the fix** (`expected 2 to be greater than or equal to 4`).

**Fix 2 — the D8 proof suite had never passed anywhere.** Skipped under Mongo-down, and under Mongo-up all 10 tests died on `TypeError: Header name must be a valid HTTP token`: `.set(stUser())` with one argument, where the repo convention is `.set('X-Test-User', stUser())`. Nine call sites corrected. QA confirmed a patched copy gives 10/10, so D8 itself is sound and only its proof was broken — but a proof that has never executed is not weaker evidence than a passing one, it is none.

### QA round 2 — the enforcement was non-uniform under the measurement

Round 1 fixed **how** the floor was measured. Round 2 found the floor was measured correctly and then **applied in the wrong place**: it ran before the pool caps, and each cap does `val = Math.min(val, available)`, so a cap could push the value straight back under the floor that had just been computed. `free_inv` was where it bit in QA's rig; `free_mci` also bit in mine. The channels that passed did so by accident of whether their pool's "used" helper counts the merit being edited — the measurement was uniform across the class and the enforcement was not.

**Fix (Ma'at's, tested rather than suggested):** hoist `_floor` out of the if-block and re-apply it after the whole cap block — on both the flat-field path and the `free_grants.*` early-return path. A class-wide ordering fix, not a per-channel patch.

**Floor-vs-cap ruling (SM): floor wins on reductions.** When a cap sits below the floor, the merit already holds more dots than the pool can fund; that over-commitment predates the edit and a reduction does not worsen it (5 → 4 leaves the pool no worse off than 5 did). Letting the cap win would silently void part of a standing pledge and leave the oath claiming dots the merit no longer has. Caps still bind as **upper** bounds — `_applyPledgeFloor` only ever raises the value, so it cannot license allocating dots a pool does not have. Asserted in both directions.

**The override is reported, not silent.** When the floor beats a cap, a `_pledgeFloorNote` naming the oath and the pledged count renders on the merit row.

It is **edit-time feedback** — *"the change you just made was overridden, and here is why"* — and nothing more. It is set as a side effect of an edit, so a freshly loaded over-committed character shows nothing, and it does not appear in the read-only renderer. Both are **correct for what it is**: an override notice has nothing to report when no edit happened, and no business in a renderer with no edits. This is deliberately *not* the dual-renderer blind spot.

A standing "this character is over-committed" indicator is a **different feature**: derived at render time from pledges versus pool capacity, independent of any edit, surfacing in both renderers. Filed as **#1122** and deliberately not built here — folding it in would smuggle a feature into a bug fix.

*(The original rationale claimed the note stops an ST "discovering it later". It does not, and cannot: it only fires on an edit. The implementation was the brief thing asked for; the claim attached to it was not achievable by it, and has been dropped rather than left to read as delivered.)*

The note is `_`-prefixed. **Verified behaviourally by QA** rather than asserted: setting `_pledgeFloorNote` and `_pledge_draft` on a merit and running `charsForSave` leaves zero `_`-prefixed keys on the saved copy while the in-memory object keeps them, so the strip is copy-only as it must be. `admin.js` runs the same per-merit loop.

#### QA round 3 — the converse assertion was vacuous

The guard I added in round 2 to pay the "fixed one direction, shipped the other" debt — *caps still bind as UPPER bounds* — **passed with `_applyPledgeFloor` disabled entirely.**

Its fixture edited `free_grants.necro`, a channel `meritRating` does not sum. So `_ownedWithoutField` always equalled `_ownedNow`, `_floor` was structurally `<= 0`, and **no floor was ever present to misbehave**. The test proved the pool cap works in isolation — true, and not what it was named for. It was structurally incapable of detecting the thing it claimed to guard.

That is the same species as the defect it was written against, one level up: I picked the channel that made the test easy to write rather than the one that makes it capable of failing. The debt was real and the payment landed in the wrong account. **A vacuous test is worse than a missing one, because it reads as coverage** — which is why it had to be fixed before merge rather than filed.

Rewritten against a **summed** channel (`free_grants.mci`) with a real MCI pool and the pledge sized so `_floor > 0`, so both bounds are live simultaneously and each is asserted separately. Verified by mutation in both directions: with `_applyPledgeFloor` disabled the test now **fails** (`expected undefined to be 2`), and restored it passes — where the old version passed under the same mutation.

#### What I changed about how I tested it

Both rounds, the per-case reasoning was sound and the gap sat one layer below where I was aiming. So round 2's test is a **property test, not a mechanism test**: assert the invariant — *after any `shEditMeritPt` on a pledged merit, `meritRating >= pledgedDots`* — and enumerate all thirteen fields the UI can emit. It does not care which mechanism leaks, only that none does, which is precisely what a per-field test cannot give: a change to any channel's pool maths would move the failure without touching this code, and the invariant would still catch it.

Writing it that way immediately found `free_mci` alongside the `free_inv` QA reported. It also flagged two of my own fixtures as ill-formed (they pledged more than the merit owned *before* any edit, so they started already-violating) — the pledge is now sized from the merit's actual owned rating, so channels `meritRating` does not count leave owned unmoved and the invariant holds trivially for them, which is the correct expectation rather than a loophole.

### Rebase onto dev — DONE (2026-08-07)

The rebase was initially **held**: the instruction assumed #1110 had landed, but `origin/dev` was still at `b44afc1a` with PR #1121 open and unmerged. Rebasing onto the unmerged branch would have folded all of COLLECTIVE-2's commits into OATH-A's diff and duplicated them on a squash merge. Checking the premise rather than executing the instruction is what avoided that.

Both PRs have since merged. Rebased onto `origin/dev` @ `c5693580`, verified independently before starting (`getCollectiveCompounds` present in dev's `rules-helpers.js`; the map fixture at 74 entries with the renamed HQs).

The conflict had been characterised in advance via a test merge in a throwaway worktree (removed afterwards; no HEAD leaked into a shared tree). The prediction held exactly — **7 hunks across 3 files, all mechanical "both sides added here"**:

| file | hunks | nature |
|---|---|---|
| `public/js/admin.js` | 2 | my handler exports beside #1110's `shAllocateNecroVirtual` → `shAllocateCompoundVirtual` rename |
| `public/js/editor/edit.js` | 2 | same, in the import list and the re-export block |
| `public/js/editor/sheet.js` | 3 | the rules-helpers import line, and two `meritBdRow` call sites where OATH-A appends `_oathPledgeEditor(c, m, rIdx)` and #1110 replaces `showNECRO` with `compoundPools` / `compoundSlugs` |

Resolution was **take both sides** in every hunk — the two stories touch adjacent concerns on the same lines and neither supersedes the other. `rules-helpers.js` and `edit-domain.js` auto-merged cleanly.

Verified after resolving that none of COLLECTIVE-2's retired symbols were reintroduced by the take-both merge — `hasNecropolisSepulcher`, `getNecropolisTargets`, `collectiveNecroDots`, `synthesiseCollectiveNecroNames` and `shAllocateNecroVirtual` are all at **0 occurrences** across the three resolved files, and the single surviving `showNECRO` is a historical comment, not a call site. A take-both resolution can silently resurrect a renamed symbol, so that check is the point rather than a formality.

`git diff --name-only origin/dev HEAD` contains **no COLLECTIVE-2 files**, confirming the rebase did not absorb #1110's work.

Post-rebase full suite: **2160 tests, 1072 passed, 4 failed, 1084 skipped — the same four canonical names, none an OATH-A surface.**

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
| 2026-08-07 | AC8 APPLIED to production on Peter's approval; 10/10 rows validate, verified independently of the script |
| 2026-08-07 | QA round 1: edit-gate bypass closed (regression test confirmed failing first); D8 proof suite header call fixed at 9 sites; 48 non-DB tests green |
| 2026-08-07 | Rebased onto dev c5693580; 7 conflict hunks resolved take-both; no retired #1110 symbol resurrected |
| 2026-08-07 | QA round 2: floor re-applied AFTER the pool caps (ordering, class-wide); floor-over-cap surfaced via transient `_pledgeFloorNote`; invariant probe across all 13 emittable fields |

## QA Results

## Round 4 — final re-gate at 16f60950

**Gate: PASS.** One comment-level nit, non-blocking.

- **The converse assertion now bites.** Independent confirmation run: disabling `_applyPledgeFloor` to a pass-through makes *"caps still bind as UPPER bounds, with the floor simultaneously live"* **FAIL**. The same mutation left the previous version passing. Verified from a second rig.
- **The two bounds are distinct values**, so neither assertion is satisfied by the other's arithmetic: the floor lands at exactly **2**, the cap lands strictly above it. Checked both in isolation and in the sequential order the shipped test actually uses (99 first, then 0) — the second call lands on the floor, not on a residue of the first.
- **The story states the edit-only reading affirmatively**, not by omission: *"Both are correct for what it is — an override notice has nothing to report when no edit happened, and no business in a renderer with no edits. This is deliberately not the dual-renderer blind spot."* A future reader cannot mistake it for a defect. The retired claim is recorded as retired rather than quietly deleted.
- **#1122 is referenced and not built.** `edit.js:1079` and `sheet.js:1848` both name it as deliberately out of scope; no state-derived indicator exists in the tree.

### Nit — one stale site the reword missed

`server/tests/oath-a-render-and-gate.test.js:551` still reads *"an ST should be told rather than discover it later"* — the exact claim the reword dropped from `edit.js`, `sheet.js` and the story. Comment-only, no behaviour, but it sits in the test named *"surfaces a warning when the floor has to override a cap"*, which is precisely where the next reader goes to learn what the note is for. Worth one line before merge.

**Resolved (Ptah, 2026-08-07).** Retired the same way as the other three sites — **recorded as retracted, not quietly deleted** — because this test is the first place a reader looks to learn what the note is for, so the correction has to be legible exactly there. The test is renamed *"reports the override on the edit that triggered it"*, its comment states the edit-time-feedback reading affirmatively, carries the retracted claim explicitly marked as false, says that absence on load and from the read-only renderer is correct rather than the dual-renderer blind spot, and points at #1122 for the standing indicator.

## Round 3 — AC6 re-gate at 1bbcdf52

**AC6's mechanism is correct and I could not break it.** Two findings remain, both in the *tests and the override surface*, not the clamp.

### The mechanism — PASS, across a third configuration

Khepri's point stands that my round-2 rig and Ptah's were two samples of a space: the same defect surfaced on `free_inv` in mine and `free_mci` in his purely from pool configuration. So I built the **opposite corner** — every pool *source* merit present and generously rated (MCI, Invested, Lorekeeper, Viral Mythology all at 5), so no cap binds — and re-ran the invariant across all 13 emitted fields.

**All 13 hold.** No third channel leaks. Combined with the two empty-pool rigs, the fix behaves across the configuration space rather than at one point. `_applyPledgeFloor` is reached on both write paths (`:1132` inside the `free_grants.*` branch before its early return, `:1142` on the flat tail) and the probe exercises both.

Fixtures are **not** weakened into triviality: `pledge = ownedBefore - 1` leaves the clamp load-bearing for every summed channel (base 2 against a pledge of 4). For `free_grants.necro`, which `meritRating` does not sum, the invariant holds trivially — which is the correct expectation there, not a loophole.

### Finding 1 — the converse assertion is vacuous (required fix)

*"caps still bind as UPPER bounds — the floor does not license over-allocation"* **passes with `_applyPledgeFloor` disabled entirely.** I ran that mutation.

Its fixture edits `free_grants.necro` — a channel `meritRating` does not sum — so `_ownedWithoutField` always equals `_ownedNow` and `_floor` is structurally `≤ 0`. The floor never engages, and the test verifies only that the pool cap works in isolation. It cannot detect the thing it is named for.

Fix: use a **summed** channel with a binding pool cap — e.g. `free_grants.mci` against a small MCI pool, with a pledge large enough that `_floor > 0` — so both bounds are live at once.

For completeness: mutating `_applyPledgeFloor` to also *lower* `val` does fail a test — **"allows an increase freely"**. So increases are protected; they are just protected somewhere else, and the assertion written for the purpose is not the one doing the work.

### Finding 2 — `_pledgeFloorNote` is edit-only, and transient by construction (SM judgement)

Edit mode renders it; **view mode does not**. But the sharper problem is upstream of the renderer: the note is set only as a *side effect of an edit*. A fresh load of the same over-committed character shows nothing in either mode, because nothing set the key.

That defeats the stated rationale — *"doing it silently leaves an ST to discover the over-commitment later; the visible failure mode is the better one"*. An ST who never touches the stepper never sees it.

Two coherent resolutions, and this is the SM's call:
- **Accept it as edit-time feedback** and reword the rationale to drop the "discover later" claim; then view-mode absence is correct and no code changes.
- **Derive the condition from state at render time** (pledged dots exceed what the pools can fund) so it surfaces in both renderers regardless of whether an edit happened. More work, and arguably Story B territory.

### Verified clean

- **`_`-prefixed keys are stripped PER MERIT, behaviourally.** Set `_pledgeFloorNote` and `_pledge_draft` on a merit, ran `charsForSave`: both gone from the saved copy, no `_`-prefixed keys survive on that merit, and the live in-memory object still carries them (the strip is copy-only, as it must be). `admin.js` `buildSaveBody` runs the same per-merit loop. Neither the note nor the draft can reach a persisted document or the localStorage mirror.

## Round 2 — re-gate at dc010204 (rebased onto dev c5693580)

**Gate: CHANGES REQUESTED.** AC7 and AC8 now PASS and are verified independently. **AC6 still fails** — the measurement fix is correct and closes the class I reported, but it exposed a *second, distinct* defect underneath it.

### AC7 — PASS, executed for the first time

Verified the committed test file is exactly the file I patched: reverse-applying my `sed` to `HEAD` and diffing against `5429c16c` is byte-identical, so the only change is the header-argument fix. Then ran it on the committed branch against Atlas `tm_suite_test`: **10 tests, 10 passed.** D8's fields are genuinely reachable — POST accepts them, the PUT allowlist passes them, persistence is verified rather than echoed, and every rejection case bites.

### AC6 — the measurement is fixed; the ORDERING is not

`_meritWithFieldCleared` + `meritRating` is the right fix and it mirrors the write's `delete` semantics exactly, which also makes it correct for the 36 merit-slug pairs in live data that carry **both** a `free_grants.<slug>` map entry and a legacy `free_<slug>` key.

But the floor is applied at `edit.js:1043-1048`, and the pool caps run **after** it at `:1050+`, each doing `val = Math.min(val, available)`. A cap can therefore push the value back below the floor that was just computed.

Probed every field the UI can emit — `cp`, `xp`, `free_grants.mci`, `free_grants.<compound slug>`, `free_inv`, `free_lk`, `free_ohm`, `free_vm` — asserting one invariant: *after any `shEditMeritPt` on a pledged merit, `meritRating >= pledgedDots`.* Nine hold. One does not:

```
free_inv (flat, summed)   owned 5 -> 2   (pledged 4)   UNCLAMPED
```

Same shape as the original bug. `free_vm`, `free_lk`, `free_ohm` and `free_grants.mci` escape only by accident of their pool accounting — whether the channel's "used" helper counts the merit being edited — not by design. So the class is *measured* correctly now but still not *enforced* uniformly.

**Fix verified, not just suggested:** re-applying the floor after the cap block (`if (val < _floor) val = _floor;` immediately before `m[field] = val`) makes all 10 cases pass. I ran that experiment and restored the file.

One judgement call for the SM, flagged not decided: if a pool genuinely cannot fund the dots, floor and cap conflict. For a *reduction* the floor should win; refusing the edit outright is better than silently dropping pledged dots.

### AC8 — PASS, verified independently against live data

Compiled the post-story schema and ran it over the whole collection myself. Every reported figure reproduces:

| | measured |
|---|---|
| total rows | 673 (unchanged) |
| failing schema | **656** (was 666 — delta exactly 10) |
| rows with `selected` | 656 (out-of-scope debt untouched) |
| rows with `special` | 517 (untouched) |
| rows with `cost_model` | 10, **all PASS**, no stray `selected`/`special` |

`rating_basis` is correctly typed where required — `blood_potency_multiple` on Oath of Abstinence, `highest_status` on Oath of the Model Prisoner, absent elsewhere. **0 characters carry `sworn_by`**, so the prod write touched only the 10 rule rows and greenfield is intact.

### Rebase resolution — PASS

Both general-merit call sites carry both feature sets: `:1972` (the `granted_by` branch) and `:1990-1991` (the main branch) each pass `compoundPools` / `compoundSlugs` to `meritBdRow` *and* call `_oathPledgeEditor`. Behaviourally, the six interacting suites run together give **135/136**, the single failure being the pre-existing ring-fenced `meritPrereqOK` assertion — untouched, as required.

Round-1 mutation results (dual-renderer badge, parity rejection) were not disturbed by the rebase and are not re-litigated.

---

## Round 1 — gate at 5429c16c

**Gate: CHANGES REQUESTED** (Ma'at, 2026-08-07, commit 5429c16c). **AC6 is not met** — the edit gate has a reachable bypass. AC7's proof suite has never executed anywhere; after a one-line harness fix it passes 10/10, so the D8 implementation itself is sound.

### AC6 — the edit gate does NOT hold. Reachable bypass, measured.

The clamp exempts every `free_grants.*` field:

```js
if (_pledgedHere > 0 && typeof field === 'string' && !field.startsWith('free_grants.')) {
```

But `meritRating` (`xp.js:190`) *counts* ten of those channels — `bloodline, pet, mci, vm, lk, ohm, inv, pt, mdb, sw` — and `pledgeableDots` measures pledges in `meritRating` terms. So dots that can be pledged are exempt from the floor that protects them.

Reachable through the editor: `xp.js` emits `shEditMeritPt(i, 'free_grants.mci', v)` from the merit breakdown row.

Measured on a fixture — Resources at cp 2 + `free_grants.mci` 3 = 5 owned, **4 dots sworn**:

```
shEditMeritPt(1, 'free_grants.mci', 0)
  →  meritRating 5 → 2, unclamped, against a standing 4-dot pledge
```

The failure is the opposite of the one anticipated: **under-clamping, not over-clamping.** No warning, no refusal; the oath keeps claiming 4 dots on a merit that now rates 2.

The other four negative-space cases all behave correctly: a field outside the channel list never clamps; unpledging releases the clamp; an unrelated merit on a sworn character is untouched; and the flat legacy `free_mci` path leaves `free_grants.mci` alone.

Suggested fix — drop the `startsWith` exemption and compute the field's contribution generically rather than by flat-key lookup, e.g. `_ownedNow - meritRating(c, {…m, <field cleared>})`. That handles dotted and flat paths alike and needs no per-slug allowlist. `free_grants.necro` (and the COLLECTIVE-2 slugs) are genuinely not in `meritRating`'s sum, so they will continue to contribute 0 and never clamp spuriously — which is what the current comment claims for all of them.

### AC7 — the D8 suite has never run. Implementation sound; artefact broken.

Executed with Mongo up (Atlas, `tm_suite_test`). **10 tests, 10 failed** — every one on `TypeError: Header name must be a valid HTTP token`. Cause: `.set(stUser())` with a single argument, where `stUser()` returns a JSON *value*. Every working API suite in the repo uses `.set('X-Test-User', stUser())`.

The suite was skipped under Mongo-down and fails under Mongo-up, so it has never passed in any environment.

Patching the 9 call sites in a scratch copy: **10/10 pass.** So D8 genuinely works — POST accepts `cost_model`/`rating_basis`/`forfeiture`, the PUT allowlist passes them, persistence is verified rather than echoed, and the rejection cases all bite (unknown `cost_model`, cross-variant `rating_basis`, merit-by-array-index attachment, zero-dot attachment). The fields are **not** left as unreachable as `cost_model` was. Fix is mechanical.

### Verified by mutation, not by reading the report

- **Parity rejection bites.** Disabling `validatePledge` fails 10 rejection tests. They do not pass vacuously on a correct pledge.
- **Dual-renderer badge holds.** `_pledgeBadge` (1832) and `_oathPledgeNote` (1841) sit at function scope, above `if (editMode)` at 1851. Blanking `_pledgeBadge` fails **both** the EDIT MODE and VIEW MODE assertions — the view-mode test asserts on real badge output.
- **Name+qualifier, never index** — confirmed on the *persisted* shape, not the helper signature: the D8 round-trip's "REJECTS an attachment referencing a merit by array index" passes against the live API, and the helper suite's splice-survival test passes.
- No uniqueness enforcement: agreed, correct per Peter's withdrawal of D5. Not flagged.

### Not gated

AC8 (prod write) is held for Peter. Untouched here.

### Forward note, not a finding

This branch is based on dev, so `shRenderGeneralMerits` still carries the pre-#1110 `showNECRO: _hasNecroSep && _necroTargets.includes(m.name)` shape at `sheet.js:1888`. COLLECTIVE-2 rewrites that same region. The two will conflict on merge — sequencing is worth deciding before either lands.
