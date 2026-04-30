---
title: 'Bonus-success mechanic — Stronger Than You'
type: 'feat'
created: '2026-04-30'
status: 'backlog'
descoped_from: 'epic-dtlt-dt2-live-form-triage (2026-04-30) — confirmed rules-engine work, not downtime UI; awaiting prioritisation against the rules engine workstream'
recommended_model: 'sonnet — net-new typed-per-family rule collection, predicate vocabulary design, 7 dice surfaces, evaluator tests. No legacy migration; purely additive.'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
  - specs/epic-dtlt-dt2-live-form-triage.md
  - docs/merits/Merits Errata.md
  - public/data/man_db.json
---

## Intent

**Problem:** No bonus-success mechanic exists in the codebase. All seven dice surfaces (`shared/dice.js`, `admin/dice-engine.js`, `admin/feeding-engine.js`, `tabs/feeding-tab.js`, `suite/dice-modal.js`, `suite/roll.js`, `suite/tracker-feed.js`) build a pool, roll N d10s, call `cntSuc(cols)`, and report rolled successes. There is no post-roll step that adds N automatic/bonus successes. So **Stronger Than You** (Strength Performance rank 4, `public/data/man_db.json:1108-1113`) — "Successful Strength rolls add an additional free success" — is defined in data but never enforced. This is the bug from the live-form review 2026-04-30 ("Strength Style bonus success not factored").

**Approach:** New typed-per-family collection `rule_bonus_success` per ADR-001 Option B. Dedicated roll-time evaluator (not a phase in `applyDerivedMerits` — bonus successes are a roll-time concept, not a character-render concept). Replaces `cntSuc(cols)` calls with `resolveSuccesses(cols, character, rollContext)` returning `{rolled, bonus, total}`. Each dice surface displays the breakdown so STs can verify and so future rules referencing rolled-only successes (e.g. Street Fighting "Kick 'Em While They're Down" — Knocked Down threshold uses ROLLED only) can enforce the distinction.

**Out of scope:** Vigour and Resilience stay in `rule_disc_attr` (RDE-14). They are flat passive bonuses to Strength and Stamina dots per RAW; the Merits Errata reference to "bonus successes such as those granted by Vigour" appears in an exclusion clause for Street Fighting "Kick 'em While They're Down" as an *example* of a bonus-success source, not as a definition of how Vigour works in TM. See `memory/feedback_errata_vigour_example.md`.

## Boundaries & Constraints

**Always:**
- Bonus successes apply only when **rolled successes ≥ 1** (the "successful roll" gate). Failed rolls remain failed; bonus successes never rescue a failure.
- Chance dies count as rolled successes when they show 10 — bonus successes apply on a chance-die success.
- Rolled vs bonus successes are tracked separately in the roll result so future rules can reference one or the other (Street Fighting errata exclusion).
- Stacking: multiple sources stack additively (a future "+N successes when X" rule + Stronger Than You both granting on the same pool stack additively).
- Display shows the breakdown: `"4 rolled + 1 (Stronger Than You) = 5 successes"`.
- `cntSuc(cols)` continues to exist as a primitive (rolled-only); `resolveSuccesses` builds on it. Don't remove `cntSuc` — non-roll callers (e.g. comparing two rolls in `feeding-tab.js:976` to pick the better one) still want rolled-only counts.
- Effective rating used wherever a rule references a merit's rating: a rule keyed on Strength Performance rank reads the merit's effective rating per the ADR-001 effective-rating contract.
- Parallel-write contract per ADR-001 (lite version): capture current behaviour first (zero bonus successes anywhere), write rule docs + evaluator, deep-clone fixtures, normalise snapshots. Lower-risk than RDE migrations because no existing rule docs are being replaced — this is purely additive.

**Ask First:**
- **Predicate vocabulary scope.** Initial vocabulary covers `roll_attr`, `roll_skill`, and `merit_present` (with `min_rating`). That covers Stronger Than You and any future "+N successes when X attribute/skill/merit is in the pool". Don't speculate further — add predicate kinds as new rules need them. **Confirm: are there immediate house rules beyond Stronger Than You that should ship in the v1 seed?** If yes, scope predicates and seed accordingly.
- **Detection of Stronger Than You.** The manoeuvre is encoded in `man_db.json` as Strength Performance rank 4. Per `chars_v3.json` data, Strength Performance is stored as a general merit with `rating: N` (not as a `fighting_styles[]` entry; `fighting_styles[]` is for "merit"/"style" type styles). So detection is `merits.find(m => m.name === 'Strength Performance' && m.rating >= 4)`. Confirm this — if Strength Performance can be in either location depending on the character, the rule's predicate needs to handle both.

**Never:**
- Do not modify `cntSuc` itself. Add `resolveSuccesses` alongside it.
- Do not put bonus-success rules into `rule_grant`, `rule_skill_bonus`, or any existing collection. Per ADR-001 Option B, dedicated typed collection.
- Do not run the bonus-success evaluator in `applyDerivedMerits`. It is roll-time, not render-time.
- Do not couple bonus-success grants to character render-time `free_*` channels. The grant produces successes, not dots.
- Do not break the "best-of-two" rote-roll comparison in `feeding-tab.js:976`. That compares rolled successes only (which roll's dice came up better); bonus successes are added once a winner is chosen.
- **Do not migrate Vigour or Resilience out of `rule_disc_attr`.** RAW Vigour = flat Strength dots; the errata line citing "bonus successes such as those granted by Vigour" is an example-in-exclusion for Street Fighting "Kick 'Em While They're Down", not a Vigour definition. RDE-14 stays as the source of truth for Vigour→Strength and Resilience→Stamina.

## I/O & Edge-Case Matrix

| Scenario | Pool | Rolled | Bonus | Total | Notes |
|---|---|---|---|---|---|
| Char with Strength Performance 4 (STY), rolls Strength + Crafts, gets 4 successes | Strength + Crafts | 4 | 1 (STY) | 5 | Predicate matches: Strength in pool, merit rating ≥ 4 |
| Same char, rolls Strength + Brawl, gets 0 successes | Strength + Brawl | 0 | 0 | 0 | Failed roll gate — no bonus |
| Same char, rolls Dex + Athletics, gets 5 successes | Dex + Athletics | 5 | 0 | 5 | Predicate doesn't match (no Strength in pool) |
| Char with Strength Performance rating 3, rolls Strength + Brawl, gets 4 successes | Strength + Brawl | 4 | 0 | 4 | Min-rating gate not met (need 4) |
| Char rolls a chance die that comes up 10, has STY on Strength pool | 1d10 chance | 1 | 1 | 2 | Chance-die success counts as rolled success |
| Rote roll: Roll A = 0 rolled, Roll B = 4 rolled, char has STY on Strength pool | Strength + skill (rote) | 4 (Roll B wins) | 1 (STY) | 5 | Choose better-rolled first, then add bonus once |
| Two rules with same `source` and overlapping predicate (ST adds homebrew dup) | — | — | — | — | Both apply (additive). Editor surfaces dup-source warning per ADR-001. |
| Char's Strength Performance rating changes mid-session (XP spend) | — | — | — | — | Next roll picks up new rating via `m.rating`. No cache invalidation needed since evaluator runs at roll-time. |
| Pool size 0 (chance die scenario where char has 0 dice) | 1d10 chance | 0 or 1 | 0 or matching | 0 or 1+? | Bonus successes apply if rolled success on chance die (predicate must still match). |
| Vigour 2 char rolls Strength + Brawl (regression check) | (Strength inherent + 2 Vigour dots) + Brawl | normal | 0 | normal | Vigour stays as `rule_disc_attr` dot-injection — no bonus successes added by this story |

## Code Map

**Sources of truth for rule docs (new):**
- `server/schemas/rule_bonus_success.schema.js` — Ajv schema (NEW).
- `server/scripts/seed-rules-bonus-successes.js` — initial seed (NEW). One doc: Stronger Than You. (Scope expands per Ask First.)
- `server/routes/rules-engine.js` — add `bonusSuccessRouter` (line 83 area, mirror `discAttrRouter`).
- `server/index.js` — mount `/api/rules/bonus_success` (line 94 area).

**Rules cache + evaluator (new):**
- `public/js/editor/rule_engine/load-rules.js` — extend `preloadRules`, `getRulesCache`, `getRulesBySource` to include `rule_bonus_success`.
- `public/js/editor/rule_engine/bonus-success-evaluator.js` (NEW). Exports `resolveBonusSuccesses(c, rollContext) → [{source, count}]`. Runs at roll time.

**Roll engine (replace `cntSuc` callers with `resolveSuccesses`):**
- `public/js/shared/dice.js:32` — keep `cntSuc` (rolled-only primitive). Add `resolveSuccesses(cols, character, rollContext) → {rolled, bonus, total}` that calls `cntSuc` then `resolveBonusSuccesses`.
- `public/js/admin/dice-engine.js:24` — local `cntSuc` duplicate. Standardise on shared import OR add local `resolveSuccesses`. Caller sites: lines 403, 404 (rote A/B).
- `public/js/admin/feeding-engine.js:20` — local duplicate. Caller: line 287.
- `public/js/tabs/feeding-tab.js:30` — local duplicate. Callers: lines 976 (rote-comparison; KEEP `cntSuc` here, see Boundaries), 983 (final roll resolution; use `resolveSuccesses`).
- `public/js/suite/dice-modal.js:490, 491, 499` — three callers (rote A, rote B, second roll).
- `public/js/suite/roll.js:246, 247, 277` — three callers (parallel structure to dice-modal).
- `public/js/suite/tracker-feed.js:135` — single caller.

**Display surfaces (show breakdown):**
Each roll-result renderer needs to surface `{rolled, bonus[], total}` rather than a single number. Affected:
- `public/js/admin/dice-engine.js:420-424` — `wS` becomes `total`; verdict line includes breakdown when `bonus.length > 0`.
- `public/js/suite/dice-modal.js:493-496` (and similar) — same shape.
- `public/js/suite/roll.js:250-256` — same shape.
- `public/js/tabs/feeding-tab.js:983-1000` — feeding result panel; show `"X rolled + Y (STY) = Z"`.
- `public/js/suite/tracker-feed.js:140-145` — same.
- `public/js/admin/feeding-engine.js:290-300` — same.

**Manoeuvre detection:**
- `c.merits.find(m => m.name === 'Strength Performance' && m.rating >= 4)` for Stronger Than You. Confirm during implementation (see "Ask First").

**Errata-driven exclusions (data captured but enforcement deferred):**
- `docs/merits/Merits Errata.md:693` — Street Fighting "Kick 'Em While They're Down": "Successes does not include any bonus successes such as those granted by Vigour." Capture as `excludes_from_threshold: ['knocked_down']` or similar metadata on the rule doc. Enforcement is downstream; this story only ensures the data is available on the result object so future rules can read `result.rolled` (excluding bonus).

**Out of scope (do not touch):**
- `public/js/admin/dice-engine.js:67-73` — `_DISC_ATTR` hardcoded mapping. Likely candidate for cleanup as a follow-up to RDE-14 (since `rule_disc_attr` should be authoritative), but irrelevant to this story.
- `public/js/data/accessors.js:36-46` — `discAttrBonus(c, attr)`. Continues to surface Vigour/Resilience contributions to attribute effective rating — that is correct per RDE-14.
- `seed-rules-disc-attr.js` — leave Vigour, Resilience, Celerity entries intact.

## Tasks & Acceptance

**Execution:**

- [ ] Schema — `server/schemas/rule_bonus_success.schema.js`. Required fields: `source`, `predicate` (object: `kind`, `name`, optional `min_rating`), `count_basis` (`'flat'` | `'rating'`), optional `flat_amount`, optional `also_requires` (array of additional predicates that must all match), optional `notes`. Cyclic-reference check: a rule whose `source` is a merit that is itself the `predicate.name` is rejected.
- [ ] Server route — `server/routes/rules-engine.js` add `bonusSuccessRouter`. `server/index.js` mount `/api/rules/bonus_success` with ST role gate.
- [ ] Seed — `server/scripts/seed-rules-bonus-successes.js`. One doc:
  - Stronger Than You: `predicate: {kind: 'merit_present', name: 'Strength Performance', min_rating: 4}`, `also_requires: [{kind: 'roll_attr', name: 'Strength'}]`, `count_basis: 'flat'`, `flat_amount: 1`, `source: 'Stronger Than You'`.
- [ ] Evaluator — `public/js/editor/rule_engine/bonus-success-evaluator.js`. Pure function `resolveBonusSuccesses(c, rollContext)`. `rollContext = {attr, skill, disc, spec, rolledSuccesses}`. Returns `[{source, count}]` (empty if no rules fire or `rolledSuccesses === 0`).
- [ ] Roll-time helper — `resolveSuccesses(cols, c, rollContext)` in `shared/dice.js`. Returns `{rolled, bonus: [{source, count}], total}`.
- [ ] Cache extension — `load-rules.js` fetches `/api/rules/bonus_success`, exposes via `getRulesCache().rule_bonus_success`.
- [ ] Roll engine integration — replace `cntSuc(cols)` with `resolveSuccesses(cols, c, rollContext)` at every caller site listed in Code Map. Display the breakdown.
- [ ] Test harness — `server/tests/bonus-success.test.js`. Run every I/O Matrix row through the new evaluator. Snapshot character not mutated; deep-clone fixtures. Includes the Vigour-2 regression row (confirm `rule_disc_attr` still produces Vigour's Strength-dot contribution; this story does not touch it).

**Acceptance Criteria:**

- Given a character with Strength Performance rating 4 (Stronger Than You unlocked), when they roll a Strength-based pool with at least 1 rolled success, then `bonus` includes `{source: 'Stronger Than You', count: 1}`.
- Given a character with Strength Performance rating 3, when they roll a Strength-based pool, then no Stronger Than You bonus applies.
- Given a character with Strength Performance rating 4 rolls a Strength pool with 0 rolled successes, then `bonus === []` and `total === 0` (the failed-roll gate).
- Given a character with Strength Performance rating 4 rolls a Dex + Athletics pool, then no Stronger Than You bonus applies (predicate `roll_attr === 'Strength'` doesn't match).
- Given an ST adds a homebrew rule via the editor (e.g. `source: 'Iron Stamina', predicate: {kind: 'roll_attr', name: 'Stamina'}, count_basis: 'flat', flat_amount: 1`), when a character with Iron Stamina rolls a Stamina pool with successes, then the bonus is applied without a code change.
- Given the rule docs collection is empty, when any roll resolves, then `total === rolled` and `bonus === []`. (Defensive: empty rules cache must not break rolls.)
- Given roll display rendering, when bonus successes are present, then the verdict line shows the breakdown (e.g. `"3 rolled + 1 (Stronger Than You) = 4 successes"`); when bonus is empty, the line is unchanged from current display.
- Given a Vigour 2 character rolls Strength + Brawl (regression check), when the pool builds, then it includes the +2 Vigour Strength-dot contribution from `rule_disc_attr` exactly as today; bonus successes are not added by this story for Vigour.

## Verification

**Commands:**
- `cd server && npx vitest run bonus-success` — green.
- `cd server && npx vitest run rule_engine_grep` — passes.
- `cd server && npx vitest run rule_engine_effective_contract` — passes.

**Manual checks:**

1. Pick a character with Strength Performance rating 4. Roll Strength + Crafts via the admin dice engine; verdict shows `"+ 1 (Stronger Than You)"` when rolled successes ≥ 1.
2. Pick a character with Strength Performance rating 3. Roll Strength + Crafts; no Stronger Than You bonus.
3. Roll a Strength pool that yields 0 rolled successes for an STY character. Result is 0 (no rescue).
4. Roll a chance die that comes up 10 for an STY character on a Strength pool. Bonus success applies.
5. Try a rote roll where Roll A has 0 rolled, Roll B has 3 rolled, char has STY on Strength: best-rolled selection picks Roll B; bonus applied once = total 4.
6. Pick a Vigour 2 character. Roll Strength + Brawl. Confirm pool size is unchanged from current behaviour (Strength dots include the +Vigour bump from RDE-14). This story is non-regressive for `rule_disc_attr`.
7. Add a homebrew rule via the admin Engine panel (after editor UI ships in a follow-up; for this story, manual Mongo insert is fine). Confirm it fires without code change.

## Final consequence

A new typed-per-family collection (`rule_bonus_success`) joins the rules engine catalogue. Stronger Than You — defined in data since project inception, never enforced — becomes the first rule using the new collection. The rules engine catalogue grows from eight collections to nine. The dice engine gains a roll-time evaluator hook. Future house rules of the form "+N successes when [condition]" become Mongo doc edits via the admin Engine panel (editor UI ships in a follow-up story; this story is engine + seed only). Roll cards display rolled vs bonus separately, opening the door for future rules that reference rolled-only successes (Street Fighting "Kick 'Em While They're Down" Knocked Down threshold) without a parallel-tracking refactor. Vigour and Resilience are unchanged — they remain in `rule_disc_attr` per RDE-14.
