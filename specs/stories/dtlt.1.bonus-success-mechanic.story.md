---
title: 'Bonus-success mechanic — Stronger Than You'
type: 'feat'
created: '2026-04-30'
status: 'review'
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
- Effective rating used wherever a `merit_present` rule references a merit's rating, per the ADR-001 effective-rating contract. `manoeuvre_present` rules (Stronger Than You included) have no rating to resolve — they're boolean presence in `fighting_picks`.
- Parallel-write contract per ADR-001 (lite version): capture current behaviour first (zero bonus successes anywhere), write rule docs + evaluator, deep-clone fixtures, normalise snapshots. Lower-risk than RDE migrations because no existing rule docs are being replaced — this is purely additive.

**Ask First:**
- **Predicate vocabulary scope.** Initial vocabulary covers `roll_attr`, `roll_skill`, `merit_present` (with `min_rating`), and `manoeuvre_present` (boolean, by name, against `fighting_picks[]` — no `min_rating`, see the resolved detection note below). That covers Stronger Than You and any future "+N successes when X attribute/skill/merit/manoeuvre is in the pool". Don't speculate further — add predicate kinds as new rules need them. ~~Confirm: are there immediate house rules beyond Stronger Than You that should ship in the v1 seed?~~ — **RESOLVED 2026-08-31 (Angelus: "I don't know").** Ship v1 with Stronger Than You only. Any other bonus-success source is a future one-off Mongo doc edit via the admin Engine panel once identified — no code change needed, per this story's own "Final consequence" section.
- ~~Detection of Stronger Than You~~ — **RESOLVED 2026-08-31, was wrong in the original draft.** Strength Performance is a **fighting style** (`man_db.json:1087-1114` — Strength Tricks/Lifting/Push-Pull/Stronger Than You are ranks 1-4 of the "Strength Performance" style), stored in `fighting_styles[]`, not `merits[]` (`character.schema.js:280-283`, distinct top-level array). Manoeuvre possession is v3's flat `fighting_picks[]` list keyed by manoeuvre name, not a style-rating threshold — mirrors the existing pattern at `rules-view.js:99-102` (`(c.fighting_picks || []).some(pk => (typeof pk === 'string' ? pk : pk?.manoeuvre) === 'Stronger Than You')`). There is no per-manoeuvre "rating" to gate on; a character either has picked it or hasn't. The predicate vocabulary needs a new `manoeuvre_present` kind (boolean presence by name, no `min_rating`) alongside `merit_present`, not a reuse of it.

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
| Char has picked Stronger Than You (in `fighting_picks`), rolls Strength + Crafts, gets 4 successes | Strength + Crafts | 4 | 1 (STY) | 5 | Predicate matches: Strength in pool, manoeuvre present |
| Same char, rolls Strength + Brawl, gets 0 successes | Strength + Brawl | 0 | 0 | 0 | Failed roll gate — no bonus |
| Same char, rolls Dex + Athletics, gets 5 successes | Dex + Athletics | 5 | 0 | 5 | Predicate doesn't match (no Strength in pool) |
| Char has Strength Performance style dots but has NOT picked Stronger Than You, rolls Strength + Brawl, gets 4 successes | Strength + Brawl | 4 | 0 | 4 | Manoeuvre-presence gate not met — style dots alone don't grant it, only an explicit `fighting_picks` entry does |
| Char rolls a chance die that comes up 10, has STY on Strength pool | 1d10 chance | 1 | 1 | 2 | Chance-die success counts as rolled success |
| Rote roll: Roll A = 0 rolled, Roll B = 4 rolled, char has STY on Strength pool | Strength + skill (rote) | 4 (Roll B wins) | 1 (STY) | 5 | Choose better-rolled first, then add bonus once |
| Two rules with same `source` and overlapping predicate (ST adds homebrew dup) | — | — | — | — | Both apply (additive). Editor surfaces dup-source warning per ADR-001. |
| Char picks up Stronger Than You mid-session (XP spend adds a `fighting_picks` entry) | — | — | — | — | Next roll picks up the new pick via `fighting_picks`. No cache invalidation needed since evaluator runs at roll-time. |
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
- `(c.fighting_picks || []).some(pk => (typeof pk === 'string' ? pk : pk?.manoeuvre) === 'Stronger Than You')` — same pattern as `rules-view.js:99-102`'s existing `_isPowerHeld` 'manoeuvre' case. Not a merit-rating check (see resolved "Ask First" note above).

**Errata-driven exclusions (data captured but enforcement deferred):**
- `docs/merits/Merits Errata.md:693` — Street Fighting "Kick 'Em While They're Down": "Successes does not include any bonus successes such as those granted by Vigour." Capture as `excludes_from_threshold: ['knocked_down']` or similar metadata on the rule doc. Enforcement is downstream; this story only ensures the data is available on the result object so future rules can read `result.rolled` (excluding bonus).

**Out of scope (do not touch):**
- `public/js/admin/dice-engine.js:67-73` — `_DISC_ATTR` hardcoded mapping. Likely candidate for cleanup as a follow-up to RDE-14 (since `rule_disc_attr` should be authoritative), but irrelevant to this story.
- `public/js/data/accessors.js:36-46` — `discAttrBonus(c, attr)`. Continues to surface Vigour/Resilience contributions to attribute effective rating — that is correct per RDE-14.
- `seed-rules-disc-attr.js` — leave Vigour, Resilience, Celerity entries intact.

## Tasks & Acceptance

**Execution:**

- [x] Schema — `server/schemas/rule_bonus_success.schema.js`. Required fields: `source`, `predicate` (object: `kind` [`'roll_attr'` | `'roll_skill'` | `'merit_present'` | `'manoeuvre_present'`], `name`, optional `min_rating` — `merit_present` only, `manoeuvre_present` is boolean presence and never carries it), `count_basis` (`'flat'` | `'rating'`), optional `flat_amount`, optional `also_requires` (array of additional predicates that must all match), optional `notes`. Cyclic-reference check: a rule whose `source` is a merit or manoeuvre that is itself the `predicate.name` is rejected.
- [x] Server route — `server/routes/rules-engine.js` add `bonusSuccessRouter`. `server/index.js` mount `/api/rules/bonus_success` with ST role gate.
- [x] Seed — `server/scripts/seed-rules-bonus-successes.js`. One doc:
  - Stronger Than You: `predicate: {kind: 'manoeuvre_present', name: 'Stronger Than You'}`, `also_requires: [{kind: 'roll_attr', name: 'Strength'}]`, `count_basis: 'flat'`, `flat_amount: 1`, `source: 'Stronger Than You'`.
- [x] Evaluator — `public/js/editor/rule_engine/bonus-success-evaluator.js`. Pure function `resolveBonusSuccesses(c, rollContext)`. `rollContext = {attr, skill, disc, spec, rolledSuccesses}`. Returns `[{source, count}]` (empty if no rules fire or `rolledSuccesses === 0`).
- [x] Roll-time helper — `resolveSuccesses(cols, c, rollContext)` in `shared/dice.js`. Returns `{rolled, bonus: [{source, count}], total}`.
- [x] Cache extension — `load-rules.js` fetches `/api/rules/bonus_success`, exposes via `getRulesCache().rule_bonus_success`.
- [x] Roll engine integration — replace `cntSuc(cols)` with `resolveSuccesses(cols, c, rollContext)` at every caller site listed in Code Map. Display the breakdown.
- [x] Test harness — `server/tests/bonus-success.test.js`. Run every I/O Matrix row through the new evaluator. Snapshot character not mutated; deep-clone fixtures. Includes the Vigour-2 regression row (confirm `rule_disc_attr` still produces Vigour's Strength-dot contribution; this story does not touch it).

**Acceptance Criteria:**

- Given a character with Stronger Than You in `fighting_picks`, when they roll a Strength-based pool with at least 1 rolled success, then `bonus` includes `{source: 'Stronger Than You', count: 1}`.
- Given a character with Strength Performance style dots but no `fighting_picks` entry for Stronger Than You, when they roll a Strength-based pool, then no Stronger Than You bonus applies.
- Given a character with Stronger Than You in `fighting_picks` rolls a Strength pool with 0 rolled successes, then `bonus === []` and `total === 0` (the failed-roll gate).
- Given a character with Stronger Than You in `fighting_picks` rolls a Dex + Athletics pool, then no Stronger Than You bonus applies (predicate `roll_attr === 'Strength'` doesn't match).
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

1. Pick a character with Stronger Than You in `fighting_picks`. Roll Strength + Crafts via the admin dice engine; verdict shows `"+ 1 (Stronger Than You)"` when rolled successes ≥ 1.
2. Pick a character with Strength Performance style dots but no Stronger Than You pick. Roll Strength + Crafts; no Stronger Than You bonus.
3. Roll a Strength pool that yields 0 rolled successes for an STY character. Result is 0 (no rescue).
4. Roll a chance die that comes up 10 for an STY character on a Strength pool. Bonus success applies.
5. Try a rote roll where Roll A has 0 rolled, Roll B has 3 rolled, char has STY on Strength: best-rolled selection picks Roll B; bonus applied once = total 4.
6. Pick a Vigour 2 character. Roll Strength + Brawl. Confirm pool size is unchanged from current behaviour (Strength dots include the +Vigour bump from RDE-14). This story is non-regressive for `rule_disc_attr`.
7. Add a homebrew rule via the admin Engine panel (after editor UI ships in a follow-up; for this story, manual Mongo insert is fine). Confirm it fires without code change.

## Final consequence

A new typed-per-family collection (`rule_bonus_success`) joins the rules engine catalogue. Stronger Than You — defined in data since project inception, never enforced — becomes the first rule using the new collection. The rules engine catalogue grows from eight collections to nine. The dice engine gains a roll-time evaluator hook. Future house rules of the form "+N successes when [condition]" become Mongo doc edits via the admin Engine panel (editor UI ships in a follow-up story; this story is engine + seed only). Roll cards display rolled vs bonus separately, opening the door for future rules that reference rolled-only successes (Street Fighting "Kick 'Em While They're Down" Knocked Down threshold) without a parallel-tracking refactor. Vigour and Resilience are unchanged — they remain in `rule_disc_attr` per RDE-14.

---

## Status

**done** (implementation complete, externally reviewed, four review findings patched and
prove-discriminated. Angelus ruled 2026-08-31: ship as-is — correct for ST-run/ST-confirmed rolls now,
degraded for a player's own direct roll until the rules-engine's player-auth boundary is addressed
separately, in its own future story. Nothing committed yet — commit is the next gate.)

## Dev Agent Record

### Implementation plan (as executed)

Red-green per task, in the story's own Execution order: schema, route/mounts, seed, evaluator,
roll-time helper, cache extension, roll-engine integration, tests. The full test file was written
first and confirmed RED (module-not-found) before any implementation landed.

### Deviations from the Code Map, and why

The story was written 2026-04-30. Four of the seven dice surfaces it names **no longer exist**; this
was verified against the working tree, not assumed:

| Story's Code Map entry | Reality on this branch |
|---|---|
| `public/js/admin/dice-engine.js` | Deleted by rlv.6. `server/tests/rlv-6-dice-engine-removed.test.js` guards its absence. |
| `public/js/admin/feeding-engine.js` | Does not exist anywhere in the repo. |
| `public/js/suite/dice-modal.js` | Does not exist. |
| `public/js/suite/roll.js` | Deleted by rlv.2; `public/js/suite/roll-v2.js` replaced it. Wired here instead. |
| `public/js/suite/tracker-feed.js` | Still on disk but **unrouted** - `public/js/app.js:147` records its removal ("feeding consolidated to More grid"). Left untouched: modifying unreachable code adds risk with no behavioural gain. |
| `public/js/tabs/feeding-tab.js` | Live and routed. Wired. |

So the live surfaces wired are **two**, not seven: `suite/roll-v2.js` (the sole player/ST roller) and
`tabs/feeding-tab.js`. Line numbers in the Code Map are likewise stale throughout (e.g. the
feeding-tab rote comparison the story calls `:976` is now `:1048`); the named call sites were located
by shape, not by number.

Two further judgement calls, both flagged for review:

1. **Schema file path.** The story says `server/schemas/rule_bonus_success.schema.js`. Every one of
   the eight existing rule schemas lives at `server/schemas/rules/rule-<family>.schema.js`, and
   `server/routes/rules-engine.js` imports them from there. The new file follows the existing
   convention: `server/schemas/rules/rule-bonus-success.schema.js`.

2. **The "cyclic-reference check" is unimplementable as written, and was deliberately not
   implemented.** The Schema task says "a rule whose `source` is a merit or manoeuvre that is itself
   the `predicate.name` is rejected". The story's own v1 seed is exactly that shape
   (`source: 'Stronger Than You'` gated on `predicate: {kind: 'manoeuvre_present', name: 'Stronger
   Than You'}`), as is AC-1. ADR-001 also explicitly *permits* a rule referencing its own source in a
   condition ("PT references its own rating"); what it forbids is a grant whose **target** is its own
   source. `rule_bonus_success` has no target - the output is successes, not a trait - so no cycle is
   constructible here. Implementing the sentence literally would reject the story's own seed and fail
   its own first acceptance criterion. Instead the route's `postCheck` carries the two structural
   guards that *are* real, both tested at HTTP level:
   - `min_rating` is rejected on any predicate that is not `merit_present` (per the resolved Ask-First
     note: a manoeuvre has no rating).
   - `count_basis: 'rating'` is rejected unless the predicate is `merit_present` (nothing to read a
     rating from otherwise), and `count_basis: 'flat'` requires `flat_amount`.

   `server/tests/api-rules-engine.test.js` asserts positively that a self-referencing source/predicate
   pair is **accepted**, so the reasoning is pinned in a test rather than only in prose.

### Design notes

- **`combineSuccesses` alongside `resolveSuccesses`.** The story specifies
  `resolveSuccesses(cols, character, rollContext)`; it exists and does exactly that. But the rote path
  has already reduced two pools to one winning **rolled** count by the time the bonus is due, and the
  bonus must be added once, to the winner - so `shared/dice.js` also exports
  `addBonusSuccesses(rolled, character, rollContext)`, and `resolveSuccesses` is a one-line wrapper
  over it. This is what keeps the "never break the best-of-two comparison" boundary honest.
- **The evaluator stays pure and import-free**, like every sibling in `public/js/editor/rule_engine/`.
  It takes the rule docs as an argument; the cache lookup (`getRulesCache().rule_bonus_success`) lives
  in `shared/dice.js`. That is what lets the whole I/O matrix run in vitest with no DB and no browser.
- **`formatSuccessBreakdown` lives in the evaluator module** so the breakdown string has one source of
  truth across every display surface, and is unit-testable without the browser data layer. It returns
  an empty string when no bonus fired, so each surface appends it unconditionally and a normal roll
  renders byte-identically to before.
- **`wTotal === wS` whenever nothing fires**, so the Roll tab's headline count, exceptional-success
  threshold, stake note, history entry and `roll_log` payload are all unchanged on a normal roll.
- **Contested rolls** use the attacker's total against the resistance roll. The resistance roll itself
  stays rolled-only: resolving bonus rules for the *resisting* character would need that character's
  own pool context, which this surface does not have. Noted inline in `roll-v2.js`.
- **feeding-tab's `bestTraitsFor`** was extracted out of `buildPool` because the two ST-confirmed pool
  paths take the pool size straight off the submission and never call `buildPool` - without the
  extraction, a `roll_attr` predicate could not fire on an ST-confirmed feeding pool at all.
- **Persisted feeding rolls** now also carry `rolledSuccesses`, `bonusSuccesses` and
  `successBreakdown`. `downtime_submission.schema.js`'s `rollResult` definition is
  `additionalProperties: true`, so no schema change was needed; rolls persisted before this story have
  no `successBreakdown` and render exactly as they did.

### Findings for review (not fixed here - outside this story's scope)

1. **Players cannot load the rules cache at all, so Stronger Than You will not fire for a player.**
   `/api/rules/aggregate` (and every per-family rules-engine endpoint) is `requireRole('st')`.
   `public/js/app.js:750-758` documents this as an accepted pre-existing degradation ("preloadRules
   403 for a player against the ST-only rules-engine endpoint"), and `applyDerivedMerits` has a
   null-cache guard for it. The new evaluator inherits the same behaviour: cold cache gives
   `bonus === []` and `total === rolled`, which is the story's own defensive AC. But it means the
   mechanic is ST/dev-only in practice until the rules-engine read is opened to players. This is a
   genuine functional gap, it predates this story, and closing it is an auth-boundary decision, not a
   dev-story call.
2. **`public/js/downtime/roller.js`** is a fourth, structurally different dice implementation (its
   `rollPool` returns a result object, never calls `cntSuc`). It is reached only through
   `public/js/admin/downtime-views.js`, which `public/js/admin.js:45` records as unrouted. Not in the
   story's Code Map, not wired, flagged as a follow-up candidate if that surface is ever revived.
3. **The seed has not been run.** `node server/scripts/seed-rules-bonus-successes.js --apply` is a
   live-DB write; per this project's standing rule those are run by Angelus, not by the agent. Until
   it runs, `rule_bonus_success` is empty and every roll resolves exactly as it does today.
4. **No admin editor UI** for the new collection. The story's "Final consequence" explicitly defers
   that ("editor UI ships in a follow-up story; this story is engine + seed only"). A new rule is a
   Mongo insert or a `POST /api/rules/bonus_success` until then.

### Verification run

Story-named commands, all green:

| Command | Result |
|---|---|
| `cd server && npx vitest run bonus-success` | **40/40 passed** |
| `cd server && npx vitest run rule_engine_grep` | **2/2 passed** |
| `cd server && npx vitest run rule_engine_effective_contract` | **11/11 passed** (6 pre-existing PT + 5 new) |

Additional new coverage: `api-rules-engine` **+10** (`rule_bonus_success` CRUD, auth, and each
postCheck rejection), `api-rules-aggregate` **+1** and one existing test widened to 8 categories.

Regression sweep (every suite importing a changed module, plus the roll/feeding Playwright specs):

- `npx vitest run rule-engine-integration applyDerivedMerits-null-cache-guard gdx-7-apply-costs-on-roll
  gdx-8-roll-history rlv-1-combat-tab-quick-roll rlv-6-dice-engine-removed feeding-pool-ambience-vitae
  feeding-grounds-double-free` gives 95 passed, 5 failed. The 5 are all in
  `rule-engine-integration.test.js` and were **confirmed identical at base** via `git stash` A/B
  (5 failed / 2 passed with the changes stashed).
- The 20-suite sweep over every `shared/dice.js` / `load-rules.js` / `roll-v2.js` / `feeding-tab.js`
  importer gives **287 passed, 76 skipped, 9 suite-level failures**, measured **byte-identical at
  base** via `git stash` A/B. All nine fail at import time with "rule docs not found in
  `tm_suite_test`" - they need seeded rule docs in a stale-named test DB, an environment gap, not a
  code defect.
- `npx playwright test tests/issue-1024-roll-v2-anchor-and-again-seg.spec.js
  tests/rlv-2-single-roller-retirement.spec.js` gives **13/13 passed**.

### Visual verification

Angelus cannot run the app locally, so the breakdown display was verified with a throwaway Playwright
script (booted `/`, stubbed `Math.random` to a non-exploding success, stubbed
`/api/rules/aggregate` to serve the seed doc, injected a character with the `fighting_picks` entry and
a Strength/Crafts `POOL_INFO`, then called the real `doRoll()`). Live DOM read back:

    count:      "8"
    label:      "Exceptional Success"
    verdict:    "Strength 4 + Crafts 3 · 10-again · 7 rolled + 1 (Stronger Than You) = 8 successes"
    pageerrors: []

That is the story's specified breakdown shape, rendered by the real code path through the real rules
cache. The script and its artefacts were deleted afterwards (`git status` is clean of them).

### Completion notes

All eight Execution tasks are done. Every acceptance criterion has at least one test:

| AC | Covered by |
|---|---|
| STY in `fighting_picks` + Strength pool + at least 1 rolled gives `{source, count: 1}` | `bonus-success.test.js` row 1, plus the seed-doc round-trip test |
| Style dots but no pick gives no bonus | row 4 |
| 0 rolled gives `bonus === []`, `total === 0` | rows 2 and 9, plus "never rescue a failure" |
| Dex + Athletics gives no bonus | row 3 |
| ST homebrew rule fires with no code change | "an ST homebrew roll_attr rule fires with no code change" plus the HTTP CRUD tests |
| Empty rules collection gives `total === rolled` | "an empty rules collection leaves the roll untouched", plus null/undefined tolerance |
| Display shows the breakdown; unchanged when empty | `formatSuccessBreakdown` block (4 tests) plus the live-DOM visual verification |
| Vigour-2 regression, `rule_disc_attr` untouched | row 10 plus the "Vigour and Resilience stay in `rule_disc_attr`" boundary guard |

The story's "Never" list is additionally pinned by seven source-level boundary guards at the foot of
`bonus-success.test.js` (cntSuc unmodified, `resolveSuccesses` added alongside it, feeding-tab's rote
comparison still rolled-only, roll-v2's rote winner still chosen on rolled successes, the evaluator
absent from `applyDerivedMerits`, Vigour/Resilience untouched, and no reuse of an existing rule
collection).

## Senior Developer Review (AI)

**External review, three isolated Codex passes against base commit `0299d515` (Blind Hunter, Edge Case
Hunter, Acceptance Auditor).** Pass 3 hit a ChatGPT usage limit after completing only its blind
sub-pass (3a); Passes 1 and 2 completed in full. All raw findings preserved at
`specs/stories/code-review/dtlt-1-codex-findings-pass{1,2,3}.md`. Every finding below was independently
reproduced by the orchestrator (not accepted on the reviewer's word) before triage, per this project's
own return-protocol.

**What good review convergence looks like:** Passes 1 and 2 independently found the *same* stored-XSS
defect and the *same* player-auth-boundary fact from different angles, with zero shared context between
sessions — real signal, not noise from either pass alone.

### Patched (4)

1. **[Medium, High confidence — converged in Pass 1, Pass 2, and Pass 3a independently] Rule `source`
   flowed unescaped into `innerHTML` on all three Roll-tab result paths (chance, standard, contested)
   plus the persisted history rerender.** `formatSuccessBreakdown()` interpolates the rule doc's
   `source` field verbatim; Feeding's own call site already wraps it in `esc()`, Roll-tab's did not.
   Reproduced: a rule with `source: '<img src=x onerror=alert(1)>'` renders that markup live.
   **Fix:** wrap both breakdown computations (`chanceBreakdown`, `bonusLine`) in the already-imported
   `esc()` at the point they're computed in `roll-v2.js`, so every downstream consumer (immediate
   render + history rerender) inherits the escaped string. Prove-discriminated: confirmed the exact
   payload from both findings is neutralised (`&lt;img...&gt;`) post-fix via direct function
   composition, since this file has no existing DOM-level test harness. Reachability today is ST/dev
   only (rule authoring is ST-gated) — this does not make the sink acceptable, and would become
   player-reachable the moment the High finding below is ever addressed.
2. **[Medium, High confidence — Pass 2] ST-confirmed Feeding pools evaluated bonus-success predicates
   against the player's stale *declared* method, not what the ST actually confirmed.** `doFeedingRoll()`
   called `bestTraitsFor(currentChar, method)` where `method` falls back to `declaredMethod` — but
   neither ST-confirmed pool path (`feeding_roll.params`, `feeding_review.pool_validated`) ever updates
   `declaredMethod`'s attribute/skill to match what was actually confirmed. A player declaring "Force"
   (Strength-based) whose ST corrects the pool to something else entirely could still get Stronger Than
   You fired on a non-Strength roll. **Fix:** new `poolTraitsTrusted` flag, true only when `poolTotal`
   was actually built from `declaredMethod`'s own attrs/skills via `buildPool()`; an ST-confirmed pool
   (which carries no reliable trait names at all — `feeding_roll.params` has none, `pool_validated` is
   unparsed free text) now resolves with an empty rollContext, matching no predicate — the safe default
   (no bonus, same as before this story) rather than a wrong one. Prove-discriminated by direct
   reasoning check (before/after context on the same evaluator call) rather than a new automated test —
   `feeding-tab.js` has no existing unit-test harness for its DOM-coupled functions, and building one is
   out of proportion for a one-flag gating fix.
3. **[Medium, High confidence — Pass 2] `count_basis: 'rating'` could read the wrong same-named merit's
   rating.** `_matches()`'s `merit_present` case correctly finds ANY entry satisfying `name` + `min_rating`
   via `.some()`, but `_count()`'s `'rating'` branch independently `.find()`s the *first* same-named
   entry regardless of whether it's the one that actually satisfied the gate. Real characters carry
   several same-named repeatable merits distinguished only by a `qualifier` field (confirmed live in
   `public/data/chars_v3.json:319,336,353,370` — four "Allies" entries on one character alone), so this
   is a realistic shape, not a contrived edge case. Currently dormant (the v1 seed is `flat`, not
   `rating`) but a real bug in shipped code. **Fix:** `_count()`'s `'rating'` branch now applies the
   same `min_rating` gate `_matches()` uses and reads the entry that actually satisfies it. New test
   added (`bonus-success.test.js`, two same-named merits at ratings 1 and 3, gated on `min_rating: 3`);
   prove-discriminated by reverting the fix and confirming that exact test fails (`count: 1` instead of
   `3`), then restoring and confirming green (41/41).
4. **[Low, Pass 3a] `getRulesBySource()` was not extended per the story's own Code Map**, though the
   shipped evaluator deliberately bypasses it (reads `getRulesCache().rule_bonus_success` directly, to
   stay pure/import-free — a documented, correct design choice, not the gap). No current caller is
   affected, but the story's own "Final consequence" section commits to an eventual admin editor UI for
   this collection, and that UI's natural entry point would expect this function to behave like every
   other family. Added a `bonusSuccess` key, filtered the same way as its seven siblings. No behaviour
   change for any existing caller (verified: no test or production code destructures this return value
   exhaustively — every consumer reads specific named keys).

### Deferred, not patched (6)

Full detail in `specs/deferred-work.md` under "Deferred from: dtlt-1-bonus-success-mechanic code review
(2026-08-31)". Summary:

- **[High, converged in Pass 1 AND Pass 2, RULED ON by Angelus 2026-08-31: ship as-is.] The entire
  rules-engine (all nine families) is `requireRole('st')`-gated, so no real player's client can ever
  load `rule_bonus_success` — Stronger Than You is ST/dev-only in practice.** Confirmed pre-existing
  and already gracefully degraded around elsewhere (issue #249's null-cache guard, the issue #256
  comment) — not introduced by this story. Both reviewers independently made the same sharper point:
  ST/dev testing can look correct while masking that no actual player ever receives the mechanic.
  **Further investigation before the ruling refined this**, correcting the review's own first framing:
  this is NOT "identical to every other rule family" — Vigour/Resilience (`discAttrBonus()`,
  `accessors.js:122`) has a deliberate legacy fallback that works with no cache at all, and MCI/PT
  grants persist to merit dots a player's own already-saved character carries regardless of live cache
  access. A bonus success has no persisted equivalent — it only exists at roll time — so this is the
  first rule family with no possible escape hatch, not just another instance of an already-handled gap.
  **Decision:** ship dtlt-1 now — correct for ST-run/ST-confirmed rolls and downtime processing,
  degraded for a player's own direct live roll — and track the rules-engine's player-auth boundary as
  a separate, future story rather than block on it here.
- [Low] Whitespace-only predicate names pass schema validation and can false-match a contextless roll's
  empty-string trait normalisation. Authoring-discipline gap, not player-reachable.
- [Low] A route-bypassing malformed doc (`count_basis: 'flat'`, no `flat_amount`) defaults to `+1`
  instead of failing closed. Only reachable via a direct DB write bypassing the API.
- [Low] `_int()` throws on exotic non-numeric input (`Symbol`, null-prototype object) instead of
  returning 0. No current call site can reach this.
- [Low, test-coverage only] The Vigour-2 regression test proves Stronger Than You doesn't fire for a
  Vigour character; it doesn't independently prove Vigour's own pool contribution is unaffected (the
  production code is untouched, confirmed by diff — this is a proof-method gap, not a functional risk).
- [Dismissed, not a defect] Test fixtures carry a `rating` field the real `fightingStyle` schema
  doesn't have. Harmless — the evaluator only ever reads `fighting_picks`, never `fighting_styles`.
  Already disclosed in this story's own Dev Agent Record before external review ran.

### Findings the review raised but investigation confirmed are non-issues

- **[Pass 1, Medium confidence, self-flagged as unverified] "The roll snapshot mixes pre-await and live
  state."** Checked against the pre-existing code: `_rollChar`/`eff` were already captured
  pre-`await ensureTrackerLoaded()` for the exact same documented reason (a prior review fix, gdx.8) —
  `_bonusCtx` follows the identical, already-established precedent, not a new inconsistency. The fields
  Pass 1 flagged as "live-read after the await" (`state.ROTE`, `state.POOL_INFO`, `state.AGAIN`) were
  already read live post-await before this story touched the file. No change in risk shape.
- **[Pass 3a, Low, dismissed] The "cyclic-reference check" Execution task was not implemented as
  literally worded.** Independently re-read `specs/architecture/adr-001-rules-engine-schema.md:143`
  directly (not the Dev Agent Record's paraphrase, per the reviewer's own instruction) — confirms the
  Dev Agent Record's reasoning word for word: a rule referencing its own source is explicitly permitted
  ("PT references its own rating"); what's forbidden is a `target` equal to `source`, and
  `rule_bonus_success` has no `target` field at all. No cycle is constructible. Pass 3a itself reached
  the same conclusion independently before this cross-check.

### Verification after patches

- Story gate suites: `bonus-success rule_engine_grep rule_engine_effective_contract api-rules-engine
  api-rules-aggregate` — **125/125 passed** (124 + 1 new regression test for the rating-undercount fix).
- Regression sweep (same suites the dev-story phase used): **95 passed, 5 failed** — identical counts to
  the pre-patch run; all 5 remain in `rule-engine-integration.test.js`, already confirmed pre-existing.
- Playwright (`issue-1024-roll-v2-anchor-and-again-seg`, `rlv-2-single-roller-retirement`): **13/13
  passed**, no new console errors.
- `git status`/`git diff --stat` re-checked clean of anything outside this story's own scope after
  three external Codex sessions ran against the working tree (one prior incident in this project's own
  history had an external review make an unauthorised `server/db.js` change — checked for and ruled out
  this time).

## File List

**New**

- `server/schemas/rules/rule-bonus-success.schema.js`
- `server/scripts/seed-rules-bonus-successes.js`
- `public/js/editor/rule_engine/bonus-success-evaluator.js`
- `server/tests/bonus-success.test.js`

**Modified**

- `server/routes/rules-engine.js` - `bonusSuccessRouter`; `bonus_success` added to the aggregate allow-list
- `server/index.js` - mount `/api/rules/bonus_success` behind the ST gate
- `server/tests/helpers/test-app.js` - same mount for the test app
- `public/js/editor/rule_engine/load-rules.js` - `bonus_success` category and `rule_bonus_success` cache slot
- `public/js/shared/dice.js` - `resolveSuccesses`, `addBonusSuccesses`, re-exported `formatSuccessBreakdown` (`cntSuc` unchanged)
- `public/js/suite/roll-v2.js` - bonus applied on the chance-die, standard and contested paths; breakdown in the verdict line
- `public/js/tabs/feeding-tab.js` - `bestTraitsFor` extraction, bonus applied to the final feeding roll, breakdown in the result panel
- `server/tests/api-rules-engine.test.js` - `rule_bonus_success` CRUD/auth/postCheck block
- `server/tests/api-rules-aggregate.test.js` - `bonus_success` category coverage
- `server/tests/rule_engine_effective_contract.test.js` - paired ADR-001 contract coverage for `merit_present`
- `specs/stories/dtlt.1.bonus-success-mechanic.story.md` - this record
- `specs/stories/sprint-status.yaml` - `dtlt-1-bonus-success-mechanic` status line only
- `specs/deferred-work.md` - new "Deferred from: dtlt-1-bonus-success-mechanic code review" section
- `specs/stories/code-review/dtlt-1-diff.txt`, `dtlt-1-codex-review-pass{1,2,3}-*.md`,
  `dtlt-1-codex-findings-pass{1,2,3}.md`, `dtlt-1-codex-run-pass{1,2,3}.log` - review artefacts

## Change Log

| Date | Change |
|---|---|
| 2026-08-31 | dtlt.1 implemented on `ms/dtlt-1-bonus-success-mechanic`. New `rule_bonus_success` collection (the rules-engine catalogue's ninth family), roll-time evaluator, `resolveSuccesses` in the shared dice engine, and breakdown display on both surviving dice surfaces. 57 new tests (40 evaluator/schema/boundary + 11 HTTP route + 5 ADR-001 contract + 1 aggregate); regression deltas all confirmed pre-existing by `git stash` A/B. Status set to review. Nothing committed, pushed or merged. |
| 2026-08-31 | External Codex review (3 isolated passes; Pass 3 partial, ChatGPT usage limit). 4 findings patched (stored-XSS escaping, Feeding ST-confirmed-pool stale-trait context, repeatable-merit rating-undercount, `getRulesBySource` consistency), each prove-discriminated. 6 findings deferred to `deferred-work.md`, including one High (players cannot reach any rule family, pre-existing, Angelus's ruling needed on whether it blocks shipping). 2 findings investigated and confirmed non-issues. 1 new regression test added (125/125 gate suites, 95/5 regression sweep identical to pre-patch, 13/13 Playwright). Status remains review pending Angelus's ship/hold call. Nothing committed. |
