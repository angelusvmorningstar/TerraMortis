# Code Audit — Drift Map Refresh — 2026-09-02

**Status:** findings only — no code changed in this pass
**Owner:** Angelus
**Supersedes (does not overwrite):** `specs/audit-drift-map.md` (2026-05-01, kept as the historical
record) and its companion `specs/audit-derivations-matrix.md` (2026-05-01)
**Related, scoped around, not duplicated:** `specs/dice-roller-harmonisation-audit.md`
(2026-08-22/24) — covers the *five dice-resolution engines* as an architecture question
(which roller is canonical, DOM-contract cleanup, staged rollout). This doc only reaches into
that territory where a roller/pool-builder reads a raw field instead of a canonical accessor —
the narrower duplicate-computation bug class the May doc defined.

## What this is

A four-months-later re-run of `specs/audit-drift-map.md`'s own methodology, using
`specs/audit-drift-map.md` (findings + canonical accessor set) and
`specs/audit-derivations-matrix.md` (per-value routing map) as the baseline, and TM Story's own
fresh 2026-09-01 re-run of the identical exercise (`../TM Story/specs/audit-drift-map.md`) as the
structural template. The bug class is unchanged from May: **the same logical computation (a
character stat, a merit rating, a derived total) is duplicated or reimplemented by hand instead of
routed through a single canonical accessor function.**

**Method:** every canonical accessor the May doc named was re-located in the current tree (files
move; line numbers are current as of this doc's own read, not May's). Every call site of the
underlying raw fields (`.dots`, `.bonus`, `.rating`, `blood_potency`) was re-grepped across
`public/js/**` and `server/**`. Each of May's 33 numbered findings was individually checked against
current code (not assumed stale or assumed still-open). `git log`/`git blame` were used to find what
changed the state of a finding and when. New drift was hunted preferentially in files with recent
commits (the "one true rating" merit-rating fix, 2026-08-31; the roller-consolidation epic, through
early September; the Sway merge, 2026-08-26).

**Server-side re-derivation — TM Game differs from TM Story here.** TM Story's own fresh audit
states its bug class "is entirely client-side — no server code re-derives a character stat." That is
**not true of TM Game.** Three real server-side re-derivation paths exist and were audited alongside
the client:
1. `server/lib/normalize-character.js` — runs on every character POST/PUT, recomputes each merit's
   channel-sum and **overwrites `m.rating`** if it disagrees (`normalizeMerit`). This is a genuine
   write-time derivation, not a read-time convenience.
2. `public/js/data/city-status-calc.js` — a deliberately server-importable pure module, used by both
   the client and three server routes (`praxis-sessions.js`, `office-actions.js`,
   `contested-rolls.js`) for the City Status budget calc. Confirmed still the single shared
   implementation (no drift found here).
3. `server/routes/contested-rolls.js` — has its **own, independent, server-local** reimplementation
   of "effective attribute rating" for the Challenge/Duel system (`_attrEffective`, see NEW-3
   below), explicitly declining to import the client accessor because `data/accessors.js` is
   browser-coupled (bloodlines cache, rule-engine cache).

---

## Canonical accessors (re-verified locations, 2026-09-02)

| Accessor | File:line | Computes |
|---|---|---|
| `getAttrVal(c, attr)` | `public/js/data/accessors.js:147` | Raw attribute dots only |
| `getAttrBonus(c, attr)` | `accessors.js:151` | Raw attribute `.bonus` channel only |
| `getAttrTotal(c, attr)` | `accessors.js:156` | dots + bonus, **no** discipline enhancement |
| `getAttrEffective(c, attr)` | `accessors.js:161` | dots + bonus + `discAttrBonus` (discipline-donated, e.g. Vigour→Strength) — **the one to use for pools/derived stats** |
| `discAttrBonus(c, attr)` / `_discDerivedBonus(c, stat)` | `accessors.js:122` / `:135` | How much a discipline donates to an attribute / derived stat, from `rule_disc_attr` |
| `skDots`/`skBonus`/`skTotal(c, skill)` | `accessors.js:215-222` | `skTotal` = base+bonus+PT-dot4+MCI-dot3, capped at 5 — the effective skill rating |
| `skNineAgain(c, skill)` | `accessors.js:225` | Stored OR PT/MCI/OHM-granted 9-again |
| `discDots(c, disc)` | `accessors.js:197` | **Changed 2026-08-31** ("one true rating"): now `dots + bonus`. Previously `dots` only, and a direct `.disciplines[x]?.dots` read was documented as an acceptable equivalent (May derivations matrix: "50+ sites... match the canonical contract"). That equivalence is now false — see NEW-2. |
| `meritEffectiveRating(c, m)` | `public/js/editor/domain.js:363` | Canonical merit rating: `cp+xp+meritFreeSum(m)` (+ domain caps / Herd SSJ+Flock / pledge suspension as applicable) |
| `meritFreeSum(m)` | `domain.js:293` → `_meritFreeSumHelper` in `data/rules-helpers.js` | Union of `free_grants.*` map + all 14 legacy `free_<slug>` fields (Necropolis-target categorical gate applied first) |
| `meritRating(c, m)` (xp.js) | `public/js/editor/xp.js:199` | **Changed 2026-08-31**: now delegates to `meritFreeSum` instead of its own hardcoded slug list — see FIXED-1 below |
| `calcTotalInfluence`/`calcMeritInfluence`/`calcContactsInfluence`/`hasHoneyWithVinegar` | `domain.js:637/458/487/505` | City Influence budget, canonical |
| `calcSize`/`calcSpeed`/`calcDefence`/`calcHealth`/`calcWillpowerMax`/`calcVitaeMax` | `accessors.js:313-393` | Derived stats — all still clean, all still the sole implementations |
| `xpEarned`/`xpSpent`/`xpLeft` | `xp.js:83/179/188` | XP ledger, dynamic — still the sole client implementations |
| `getPool(char, raw)` | `public/js/shared/pools.js:29` | THE canonical pool-builder — resolves attr+skill+disc from a rules-cache entry. Confirmed (per the roller-harmonisation audit's D5) as the model the whole app is converging on. **Has its own drift — see NEW-2.** |

---

## Drift map

| # | Concern | Location(s) | Canonical | Drift type | Severity | Refactor target |
|---|---|---|---|---|---|---|
| **NEW-1** | `server/lib/normalize-character.js` carries **two different merit-channel-sum implementations in the same file.** `sumChannels()` (the one that actually runs, on every character save, and can overwrite `m.rating`) uses a 15-entry `MERIT_CHANNELS` list that is **missing `free_retainer` and `free_fwb`** — both real schema fields (`server/schemas/character.schema.js:613,616`) that the client's own canonical `meritFreeSum`/`LEGACY_FREE_SLUGS` (`data/rules-helpers.js:71-73`) already includes. `_effectiveMeritRating()` in the *same file* (used only by the White Ants territory-count validator) has the correct, complete 14-slug list. | `server/lib/normalize-character.js:31-36` (`MERIT_CHANNELS`, stale) vs. `:283-296` (`_effectiveMeritRating`, correct) | `_effectiveMeritRating`'s own list / client `meritFreeSum` | two hand-rolled sums, one stale, in one file — the textbook case this audit hunts, escalated to a **write path** | **HIGH** | Point `sumChannels()` at the same slug list `_effectiveMeritRating` (or the client) already uses; or better, export one shared list both functions read |
| **NEW-2** | `discDots()` was corrected 2026-08-31 to include the discipline's `.bonus` channel, but ~12 real call sites still read `c.disciplines[x]?.dots` raw, silently dropping that channel — including `shared/pools.js:60`'s `getPool()`, the single most-consumed pool builder in the app (feeds `char-pools.js`, `downtime-form.js`, the live roller, per the roller-harmonisation audit's own D5 conclusion) | `shared/pools.js:60` (`discV`); `data/accessors.js:127,131,142` (discAttrBonus/_discDerivedBonus's own donor reads); `shared/resist.js:135`; `admin/downtime-views.js:1027,1030`; `tabs/feeding-tab.js:512,690`; `suite/tracker-feed.js:106,116`; `editor/sheet.js:601,620,2520`; `data/prereq.js:57,60`; `game/char-pools.js:221` (Nightmare) | `discDots(c, disc)` (`accessors.js:197`) | direct-field read, contract changed under it | **HIGH** — dormant today (every live discipline has `bonus:0`, matching `accessors.js`'s own code comment) but is exactly the "correct until real data exercises it, then wrong everywhere at once" class; it sits on the canonical pool builder itself, one data-shape away from every discipline dice pool in the game being wrong | Route all listed sites through `discDots(c, disc)`; decide deliberately whether `discAttrBonus`'s own donor-read should also use `discDots` (a bonus-boosted donor discipline arguably should donate its full rating too) |
| **NEW-3** | `server/routes/contested-rolls.js`'s own `_attrEffective(character, attrName)` — despite the name — reimplements `getAttrTotal` (dots+bonus), **not** `getAttrEffective` (dots+bonus+discipline enhancement). Feeds `_willpowerMax` and the crd.3a Resistance Attribute check for the Challenge/Duel contested-roll system. A character with Resilience (discipline→Stamina) gets no benefit on the `physical` aspect's server-computed resistance rating. | `server/routes/contested-rolls.js:106-109`, consumed by `_willpowerMax` (`:111-113`) and the aspect-resistance check (ASPECT_ATTR includes `Stamina`) | client `getAttrEffective` (deliberately not imported — comment explains the browser-coupling reason, but the fallback silently reduced scope rather than reimplementing the full formula) | independent reimplementation, mis-scoped despite its own name asserting parity | **HIGH** — real, live gameplay path (Challenge/Duel), wrong today for any Resilience-holding defender, not merely dormant | Reimplement the full `getAttrEffective` formula server-side (dots+bonus+`rule_disc_attr`-driven discipline donation) — the file already accepts the "no client import" constraint, it just needs the complete formula, not a reduced one |
| 1 (May) | ST Engine roll pool builder (`admin/dice-engine.js`) had its own `getAttrVal`/`getSkillVal`/`getDiscVal` and a hardcoded `_DISC_ATTR` map | — | — | — | — | **FIXED — file deleted.** `git log --diff-filter=D` confirms commit `23f443d1` "fix(rlv-6): delete dice-engine.js and its dead sidecar wiring." Matches the roller-harmonisation audit's D5 recommendation (standardise on `char-pools.js`/`shared/pools.js`). |
| 2 (May) | Combat tab attack pools used a local base-only `skDots(c, skill)` shortcut | — | — | — | — | **FIXED.** `combat-tab.js:15-17`'s own comment: "cmb.3a: the real, bonus-inclusive skill accessor... the retired preset-pool system used a local skDots shortcut." `_atkPoolFor` now imports `skTotal`. |
| 3 (May) | Equipment weapon-attack pool read base skill dots via `attack_skill` | — | — | — | — | **FIXED/MOOT.** `attack_skill` field and the old `equipment.js` no longer exist (repo grep: zero hits). Attack-pool building consolidated into `combat-tab.js`'s `_atkPoolFor`, which is fix #2 above and already correct. |
| 4 (May) | `shared/resist.js` resolves resistance-string skill tokens via base-only `skDots`; disc tokens via raw `.dots` | `resist.js:134` (skill), `:135` (disc) | `skTotal`, `discDots` | inline duplicate, unchanged | **HIGH** (skill: undercounts PT/MCI on any resistance check with a skill term) / folds into NEW-2 (disc) | Use `skTotal` for the skill branch; `discDots` for the disc branch |
| 5 (May) | `game/contested-roll.js`'s `aval`/`sk` helpers double-count attribute bonus and skip PT/MCI on skill | `contested-roll.js:32-33`, `const aval = (c,attr) => getAttrEffective(c,attr) + getAttrBonus(c,attr); const sk = (c,skill) => skDots(c,skill) + skBonus(c,skill);` | `getAttrEffective`, `skTotal` | call-pattern bug, byte-for-byte unchanged since May | **HIGH** — used live for every Social Manoeuvre and Resistance Check contested roll in this ST-only tool | `aval = (c,attr) => getAttrEffective(c,attr)`; `sk = (c,skill) => skTotal(c,skill)`. Note: the roller-harmonisation audit's D4 (2026-08-24) explicitly kept this file separate from the roller consolidation — this bug was not in scope there and was not touched |
| 6 (May) | Structured prereq engine reads attribute/skill/discipline/merit at base ratings | `data/prereq.js:50` (`getAttrVal`), `:53` (`skDots`), `:57-62` (raw disc `.dots`), `:79,84` (`m.rating \|\| 0`) | `getAttrEffective`, `skTotal`, `discDots`, `meritEffectiveRating` | engine-level under-count, unchanged | **HIGH** for any prereq gated on an enhanced rating (this is the live XP-purchase gate, `meetsPrereq` is the engine `merits.js` now delegates to as canonical) | Switch leaf-evaluators to the effective-reading equivalents |
| 7 (May) | Legacy regex prereq engine `_getAttrDots`/`_getSkillDots`/`_getDiscDots`/`_getMeritRating` (base-only / `m.rating \|\| 1`) | `editor/merits.js:189-209`, consumed only by `meritQualifies` (`:294`) | `data/prereq.js`'s `meetsPrereq` (already the delegate for every other caller) | duplicate, base-only | **Downgraded to n/a — orphaned.** Repo-wide grep for `meritQualifies(` finds only its own definition; nothing calls it. It is dead code, not a live drift risk. (Was MED in May.) |
| 8 (May) | Ordeals/XP-ledger view re-derives "maxed asset skills" inline for its Professional Training sub-row breakdown, missing MCI dot-3 bonus | `tabs/ordeals-view.js:226-232` (moved from May's line 160; same pattern) | `skTotal` | inline duplicate (display-only) | **MED**, unchanged | Use `skTotal` |
| 9 (May) | `xp.js`'s `xpPT5` still inlines its own effective-dots calc for the PT5 XP award, missing MCI dot-3 bonus | `editor/xp.js:65-75`, `const effective = (s?.dots \|\| 0) + (ptBonus.has(sk) ? 1 : 0);` | `skTotal` | inline duplicate, unchanged (now duplicated a **third** time by item 8 above) | **LOW-MED** (matches skTotal only when no MCI dot-3 grant is in play) | Use `skTotal` and drop the `>= 5` inline check in favour of it |
| 10 (May) | Three hardcoded discipline→attribute maps | was: `dice-engine.js:67`, `sheet.js:418` (BONUS_SOURCE), `accessors.js:41` (legacy fallback) | `rule_disc_attr` via `discAttrBonus` | duplicate ref data | **One of three fixed** (dice-engine.js deleted, see fix #1). `editor/sheet.js`'s `BONUS_SOURCE` map still exists (now at `:601,620`, see item 31) and now also carries NEW-2's bonus-channel gap. `accessors.js`'s own legacy fallback (`:125`, used only when `rule_disc_attr` cache is unloaded) is an intentional degrade path, not drift. | see item 31 |
| 11-13 (May) | Three competing "effective merit rating" definitions across `domain.js`, `xp.js`, `normalize-character.js` | — | — | — | — | **Mostly FIXED, client-side.** 2026-08-31 "one true rating" Stage 1 (`823bf2a9`) + follow-up (`db454b42`) made `xp.js`'s `meritRating` delegate to `domain.js`'s `meritFreeSum` instead of its own 10-slug hardcoded list — the commit message names this exact gap ("meritRating hardcoded a free-dot channel list missing free_fwb/free_retainer/free_carthian... live-verified impact... Yusuf's Caldarium and Xavier's Labyrinth Guardians... computing 0 for both on real, current data"). Client-side convergence is real. **Server-side divergence re-opened under a new shape — see NEW-1.** |
| 14 (May) | Direct `m.rating` reads bypassing `meritEffectiveRating`, missing Herd SSJ/Flock and domain-merit capping | `editor/sheet.js:1067,1114,2018,2070,2093,2523`; `admin/downtime-views.js` (9 raw `.rating \|\| 0` sites, still present, not individually re-line-numbered this pass) | `meritEffectiveRating` | read-side drift, unchanged in substance | **MED** mainline / **HIGH** for Herd display specifically, same as May | Route through `meritEffectiveRating`. **New mitigation, not a fix:** `sheet.js:320-329` now renders a live "⚠ Rating mismatch" banner + `console.warn` when `m.rating` disagrees with `cp+xp+meritFreeSum` — this surfaces the drift to an ST looking at the sheet but does not correct any of the raw-read consumers |
| 15 (May) | `accessors.js:influenceTotal` — raw-rating duplicate of `calcTotalInfluence` | — | — | — | — | **FIXED — function deleted.** `accessors.js:244-248`'s own comment: "influenceTotal removed... Both [trackers] now use calcTotalInfluence from editor/domain.js... (May 2026)." |
| 16-20, 25-28 (May) | Structural duplicates (two tracker clients, two editor-handler importers, two merit-string parsers, sheet.js hollow-dot render duplicating `skTotal`, `BONUS_SOURCE` duplicating `discAttrBonus`, tolerated-legacy schema fields, ephemeral underscore-field inventory) | unchanged locations, not individually re-audited line-by-line this pass | various | not re-verified beyond a targeted spot-check | not reassessed | `editor/sheet.js`'s `BONUS_SOURCE` (item 31, below) was spot-checked and is confirmed still open, now compounded by NEW-2. The rest are carried forward from May unchanged — out of this pass's time budget; flag for a future targeted pass |
| 31 (May) | `editor/sheet.js` still inlines `(c.disciplines?.[BONUS_SOURCE[a]]?.dots \|\| 0)` for the attribute auto-bonus render, bypassing `discAttrBonus` | `editor/sheet.js:601,620` (moved from May's `:418`) | `discAttrBonus` | duplicate, unchanged, **now also missing the discipline `.bonus` channel (NEW-2)** | **MED**, compounding with NEW-2 | Use `discAttrBonus` |
| 21-24, 29 (May, SCHEMA-SHAPE) | Design-of-record schema doc (`schema_v2_proposal.md`) vs. operative server JSON Schema; live-data delta | not re-audited this pass | server schema | out of scope for this pass (schema-shape, not accessor-drift; the May doc itself scoped this as a joint decision item, not a mechanical fix) | not reassessed | Carry forward; a live Mongo sample is still the documented blocker (unchanged from May, per this task's own read-only/no-Mongo constraint) |
| 30 (May) | NPCR-14 API scoping sweep | not re-audited this pass | — | out of scope — this repo currently has an active security-focused branch (`ms/p0-coordinator-role-ownership-bypass`) covering adjacent ground | not reassessed | Defer to that branch's own findings |

---

## Checked clean — no drift found

- `public/js/tabs/downtime-form.js` — still the reference exemplar (May item 32). 51 call sites into
  `getAttrEffective`/`skTotal`/`skNineAgain`/`meritEffectiveRating`/`calcTotalInfluence`-family
  accessors, zero raw-field reads found in a targeted grep.
- `public/js/editor/xp.js`'s `xpEarned`/`xpSpent`/`xpLeft` family — still the sole implementations,
  no inline duplicates found (matches May).
- `data/accessors.js`'s `calcSize`/`calcSpeed`/`calcDefence`/`calcHealth`/`calcWillpowerMax`/
  `calcVitaeMax` — still the sole implementations (matches May).
- `public/js/data/city-status-calc.js` — confirmed still the single shared client+server
  implementation for City Status, used identically by `praxis-sessions.js`, `office-actions.js`,
  `contested-rolls.js`, and the client. No divergence found.
- `public/js/game/combat-tab.js` — its old base-only `skDots` shortcut is gone (fix #2); its attack
  pools now route through `skTotal`.
- `editor/merits.js`'s legacy regex prereq path — confirmed dead code (orphaned export, see item 7).

---

## Changed since May — summary

**Fixed:**
- Item 1 — `admin/dice-engine.js` deleted outright (its hardcoded accessors and `_DISC_ATTR` map
  went with it).
- Item 2 — `combat-tab.js`'s local `skDots` shortcut replaced with `skTotal`.
- Item 3 — moot; the underlying field/file no longer exists, and the real successor
  (`combat-tab.js`'s attack pools) is already correct via fix #2.
- Items 11 & 13 — client-side three-way merit-rating divergence resolved by the 2026-08-31 "one true
  rating" fix (`xp.js`'s `meritRating` now delegates to `domain.js`'s `meritFreeSum`).
- Item 15 — `accessors.js`'s duplicate `influenceTotal` deleted.
- Item 7 — downgraded to no-risk; its only caller was itself never called (orphaned).

**Still open, unchanged:**
- Items 4, 5, 6, 8, 9, 14, 31 — all re-confirmed present, same shape as May.

**Worse / newly exposed:**
- Item 10/31 — the discipline→attribute hardcoded-map problem is now entangled with NEW-2 (the
  BONUS_SOURCE render path is missing both the intended `rule_disc_attr` routing *and* the new
  bonus channel).
- Item 12 (`free_retainer` schema/normalize mismatch) — the May finding was framed as a *read-side*
  divergence between four files. The 2026-08-31 "one true rating" fix converged three of those four
  (client-side) but the **fourth, `normalize-character.js`, still has the gap** — and because that
  file is the one that runs on every save and can overwrite `m.rating`, the same underlying gap is
  now a **write-time** risk rather than a read-time one. Recorded fresh as NEW-1 because the
  mechanism changed even though the root channel-list gap is the same one May named.

**New, not present or not yet introduced in May:**
- NEW-1 — server-side merit-channel-sum mismatch in `normalize-character.js` (write-path).
- NEW-2 — `discDots()`'s 2026-08-31 correction (dots+bonus) not propagated to ~12 raw `.dots` call
  sites, including the app's own canonical pool builder (`shared/pools.js:getPool`).
- NEW-3 — `server/routes/contested-rolls.js`'s own `_attrEffective` silently reimplements
  `getAttrTotal` instead of the full `getAttrEffective` formula, live-wrong today for
  Resilience-holding characters in the Challenge/Duel system.

---

## Recommended sequence

1. **NEW-1** first — it is a live write-path that can silently truncate persisted data on ordinary
   character saves, the same failure class the "one true rating" fix was created to close, and the
   fix is a one-line channel-list alignment (point `sumChannels()` at the same list
   `_effectiveMeritRating()`/the client already use).
2. **NEW-3** — narrow, one function, live gameplay-facing (Challenge/Duel), already isolated behind
   a documented seam (`_attrEffective`).
3. **NEW-2** — larger surface (12 call sites) but each fix is mechanical (swap a raw `.dots` read for
   `discDots(c, disc)`); prioritise `shared/pools.js:60` first since it is the highest-traffic site.
4. **Items 5 and 6** (contested-roll.js double-count; prereq.js base-only reads) — both HIGH, both
   unchanged since May, both small and isolated.
5. **Item 4** (resist.js skill branch) — HIGH, one-line fix once NEW-2's disc branch is also handled
   in the same file.
6. **Items 8, 9, 14, 31** — MED-and-below cleanup, can be batched into one follow-up pass.
7. Items 16-28 (structural duplicates, schema-shape) — not re-verified in enough depth this pass to
   sequence confidently; scope a dedicated follow-up before acting on them.

---

## Updates

- 2026-09-02 — v1 drafted. Read-only pass, no application code changed. No live Mongo query run (out
  of scope for this half of the audit per the task brief).
