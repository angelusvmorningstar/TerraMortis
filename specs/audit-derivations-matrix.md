# Audit Derivations Matrix — Phase 1

**Status:** Phase 1 deliverable per `architectural-reset-charter.md` Part 1
**Owner:** Angelus
**Date:** 2026-05-01
**Companion document:** `audit-drift-map.md` (rows in this matrix cross-reference there).

## How to read this document

One row per derived value identified in the charter Part 1 derivation sweep. Columns:

- **Value** — the derived quantity.
- **Helper exists?** — yes / partial / no, with the canonical definition.
- **Consumers routed** — call sites that go through the helper.
- **Consumers inline** — call sites that re-derive the value locally (the drift surface).
- **Tag** — `v0.1.0-blocker` or `post-v0.1.0`, against `v0.1.0-acceptance-criteria.md`.

Routing was sampled across `public/js/**` and `server/**`. "Consumers inline" lists the highest-signal sites; the drift map (`audit-drift-map.md`) carries severity and refactor target per row.

---

## Matrix

| Value | Helper exists? | Consumers routed | Consumers inline | Tag |
|-------|----------------|------------------|------------------|-----|
| **Effective attribute rating** (base + bonus + discipline-targeted attribute rule, e.g. Vigour→Strength) | **partial** — `getAttrEffective(c, attr)` in `data/accessors.js:77` covers base + bonus + `discAttrBonus`; rule_disc_attr-aware. Not enforced | tabs/downtime-form.js (multiple), suite/dice-modal.js, game/combat-tab.js, editor/export-character.js, data/equipment.js, shared/resist.js (attr branch), data/accessors.js internal (calcSpeed, calcDefence, calcHealth) | admin/dice-engine.js:67-74 (own getAttrVal); editor/sheet.js:441-455 inline base + bonus + BONUS_SOURCE map; editor/merits.js:146-148 `_getAttrDots` reads base; data/prereq.js:50 `getAttrVal` reads base; game/contested-roll.js:36 double-counts bonus | **v0.1.0-blocker** (§3) — items 1, 5, 6, 7, 31 in drift map |
| **Effective skill rating** (base + bonus + PT dot-4 grant + MCI dot-3 grant, capped at 5) | **yes** — `skTotal(c, skill)` in `data/accessors.js:109`. Includes `_pt_dot4_bonus_skills` and `_mci_dot3_skills` | tabs/downtime-form.js (multiple), admin/downtime-views.js (multiple), admin/feeding-engine.js:87, suite/dice-modal.js, game/char-pools.js:80, editor/export-character.js:126, suite/sheet-helpers.js (via getAttrBonus pattern) | admin/dice-engine.js:75-79 (own getSkillVal, base+bonus only); game/combat-tab.js:36-38 (own skDots, base only); data/equipment.js:26 (base only); shared/resist.js:53 (base only via skDots); editor/merits.js:151-153 (`_getSkillDots`, base only); data/prereq.js:53 (skDots, base only); editor/sheet.js:507, 520 (inline reconstructs the same logic for hollow-dot rendering); editor/xp.js:60 (xpPT5 inlines the calc); tabs/ordeals-view.js:160 (inline PT-bonus add); game/contested-roll.js:37 (`skDots + skBonus`, no PT/MCI) | **v0.1.0-blocker** (§3) — items 2, 3, 4, 5, 6, 7, 8, 9, 19 |
| **9-Again on a skill** (stored OR PT-granted OR MCI-dot-3 OR OHM-granted) | **yes** — `skNineAgain(c, skill)` in `data/accessors.js:117` | tabs/downtime-form.js, admin/downtime-views.js (multiple), suite/dice-modal.js, game/char-pools.js:86, editor/export-character.js:128 | none significant found inline outside of editor/sheet.js's hollow-dot render block where 9-Again labels are inlined alongside skTotal duplication (same drift, item 19) | post-v0.1.0 (mostly clean) |
| **Discipline rating** (effective; disciplines have no bonus channel) | **yes** — `discDots(c, disc)` in `data/accessors.js:105`; equivalent direct read of `c.disciplines[d]?.dots` is canonical | accessors.js (calcSpeed, calcDefence) via `_discDerivedBonus`, tabs/downtime-form.js, suite/sheet.js, suite/sheet-helpers.js, suite/tracker-feed.js, tabs/feeding-tab.js, admin/feeding-engine.js, editor/sheet.js, shared/resist.js (via direct `.dots` read — fine), editor/edit.js | direct `.disciplines[name]?.dots` reads are widespread (50+ sites) but match the canonical contract; only the Engine roller's `_DISC_ATTR` map (item 10) and editor/sheet.js's `BONUS_SOURCE` (item 10/31) duplicate the discipline→attribute mapping rather than the rating | post-v0.1.0 (rating reads OK; mapping copies need consolidating) |
| **Effective merit rating** | **partial — three competing definitions** | downtime-form.js routes through `meritEffectiveRating` (~12 call sites); domain.js's own `calcMeritInfluence`, `calcContactsInfluence`, `calcTotalInfluence` route through it | `editor/domain.js:meritEffectiveRating` (excludes free_attache, free_retainer); `editor/xp.js:meritRating:188` (excludes m.free, free_attache, free_retainer); `server/lib/normalize-character.js:MERIT_CHANNELS` (includes free_attache, excludes free_retainer); read sites that bypass entirely: editor/sheet.js:884, 1294; data/prereq.js:70; suite/sheet.js:552, 600, 655, 723; admin/downtime-views.js:4884, 7017, 7057, 7088, 8004; editor/csv-format.js:243, 256; editor/export-character.js:195, 234; admin/spheres-view.js:74; admin/downtime-story.js:1756, 2805; game/char-pools.js:91 — all read raw `m.rating` | **v0.1.0-blocker** (§3, §4) — items 11, 12, 13, 14 |
| **XP earned** (starting + humanity drops + ordeals + game attendance + PT5) | **yes** — `xpEarned(c)` in `editor/xp.js:72`; sub-helpers `xpStarting`, `xpHumanityDrop`, `xpOrdeals`, `xpGame`, `xpPT5` | editor/sheet.js, suite/sheet.js, editor/export-character.js — all routed | none found outside the helper file | post-v0.1.0 (clean) |
| **XP spent** (attrs + skills + merits + powers + special) | **yes** — `xpSpent(c)` in `editor/xp.js:168`; sub-helpers `xpSpentAttrs`, `xpSpentSkills`, `xpSpentMerits`, `xpSpentPowers`, `xpSpentSpecial` | editor/sheet.js, suite/sheet.js, editor/export-character.js | none found inline | post-v0.1.0 (clean) |
| **XP remaining** | **yes — but two definitions** | `editor/xp.js:177`: `xpEarned(c) - xpSpent(c)` (canonical, dynamic); `data/accessors.js:268`: `(c.xp_total \|\| 0) - (c.xp_spent \|\| 0)` (raw stored fields) | the stored-fields version persists as a legacy duplicate in accessors.js; editor consumers use the dynamic one. Risk: if any caller imports xpLeft from accessors thinking it's the canonical, the answer is the stored-field delta which has known gaps in xp_log (per CLAUDE.md "Game 2 XP: attendance data partially entered") | **v0.1.0-blocker** (§1 — XP block internally consistent) — see drift map item 14-related; consolidate to one xpLeft |
| **Health max** (effective Stamina + size) | **yes** — `calcHealth(c)` in `data/accessors.js:260` | suite/sheet.js, csv-format.js, char-pools.js, combat-tab.js, export-character.js, tracker.js (game and suite) | none found inline | post-v0.1.0 (clean) |
| **Vitae max** (BP_TABLE lookup) | **yes** — `calcVitaeMax(c)` in `data/accessors.js:289` | suite/sheet.js, signin-tab.js, tracker.js (game), tabs/downtime-form.js:6049, csv-format.js, export-character.js, admin/feeding-engine.js | none significant inline | post-v0.1.0 (clean) |
| **Willpower max** (Resolve dots + Composure dots) | **yes** — `calcWillpowerMax(c)` in `data/accessors.js:264` | suite/sheet.js, signin-tab.js, tracker.js, csv-format.js, export-character.js | accessors.js itself uses `getAttrVal` (base) per the formula (no bonus); shared/resist.js sums attr tokens through getResistTokenVal which uses `getAttrEffective` — different surfaces, intentionally different | post-v0.1.0 (clean by design) |
| **Defence** (min(Dex, Wits) + Athletics-or-DefensiveCombatSkill + Celerity-derived bonus) | **yes** — `calcDefence(c)` in `data/accessors.js:227`; reads rule_derived_stat_modifier when loaded, falls back to Defensive Combat merit | suite/sheet.js, char-pools.js, combat-tab.js, csv-format.js, export-character.js, equipment.js (`effectiveDefence`) | none found inline | post-v0.1.0 (clean) |
| **Size** (5 + Giant + rule_derived_stat_modifier) | **yes** — `calcSize(c)` in `data/accessors.js:207` | suite/sheet.js, calcSpeed, calcHealth, csv-format.js, char-pools.js, export-character.js | none inline | post-v0.1.0 (clean) |
| **Speed** (Strength + Dexterity + size + Celerity-derived bonus + Fleet-of-Foot/rule_derived_stat_modifier) | **yes** — `calcSpeed(c)` in `data/accessors.js:216` | suite/sheet.js, char-pools.js, csv-format.js, export-character.js | none inline | post-v0.1.0 (clean) |
| **Influence total** (status + influence-merit thresholds + Contacts threshold + MCI 5 + HWV) | **yes — but two competing functions** | `editor/domain.js:calcTotalInfluence` is the canonical — used by city-views, downtime-views, signin-tab, game/tracker.js, suite/sheet.js, editor/sheet.js, feeding-tab, influence-tab, downtime-form, export-character | `data/accessors.js:influenceTotal` (line 138) is a stripped-down duplicate that sums raw `m.rating` for influence-category merits only — used by `admin/session-tracker.js:20` and the legacy `suite/tracker.js:21,118`. Returns different numbers from `calcTotalInfluence` for any character with status > 0 or Contacts > 0 | **post-v0.1.0** — drift map item 15. Suite tracker is being retired; admin/session-tracker is internal ST surface |
| **Vitae deficit** (BP-driven feeding requirements; ghoul retainer / Cruac rite levels / Mandragora cost) | **no canonical helper** — formula scattered across DT processing | downtime-views.js inlines vitae-cost arithmetic in compile/push routines | downtime-form.js feeding section computes per-method deficits inline; admin/downtime-views.js compile-push routines compute vitae effects per power per submission | **v0.1.0-blocker** (§3 — vitae deficit must compute against effective rating) — adjacent to item 11 in drift map; Cruac rite vitae cost depends on rite level which is on `c.powers[].level/rank` directly so the read is canonical, but the deficit-summing layer has no helper |
| **Pool total** (attr + skill + disc + spec + unskilled penalty) | **yes — for rules-cache pools** — `shared/pools.js:getPool(char, raw)` resolves a pool string to `{ total, attr, attrV, skill, skillV, discName, discV, ... }` using `getAttrEffective`, `skTotal`, `skNineAgain` | tabs/downtime-form.js, admin/downtime-views.js, suite/dice-modal.js, game/char-pools.js (different shape but same accessors), suite/sheet.js (`getPool` used for resistance) | admin/dice-engine.js implements its own pool builder (item 1 in drift map); game/contested-roll.js implements its own (item 5); game/combat-tab.js builds attack pools inline (item 2). DT roller (`public/js/downtime/roller.js`) — not yet audited; flagged as a follow-up | **v0.1.0-blocker** (§3) — items 1, 2, 5 |
| **Display name / sort name** | **yes** — `displayName(c)` and `sortName(c)` in `data/helpers.js:114, 130`; `displayNameRaw(c)` for non-redacted use | widespread; clean | none inline | post-v0.1.0 (clean) |
| **Honey-with-Vinegar threshold modifier** | **yes** — `hasHoneyWithVinegar(c)` in `editor/domain.js:177`, applied inside `calcMeritInfluence` and `calcContactsInfluence` | calcTotalInfluence consumers route through it | none significant inline; consumers correctly delegate to the influence helpers | post-v0.1.0 (clean) |
| **Effective Invictus covenant status** (status.covenant.Invictus OR Oath of the Scapegoat floor) | **yes** — `effectiveInvictusStatus(c)` in `editor/domain.js:268` | downtime-form.js, feeding-tab.js, admin/downtime-views.js | `c._ots_covenant_bonus` is computed in the `/api/characters/status` endpoint server-side and stamped on the character (server/routes/characters.js:308). The frontend then reads it back through `effectiveInvictusStatus`. **Cross-tier coupling**: server stamps `_ots_covenant_bonus` for the Status surface; other surfaces compute it client-side. Two paths to the same number. | **post-v0.1.0** — works today, but coupling is a Phase 3 concern |

---

## Coverage notes

- **Audited:** every value listed in the charter Part 1 sweep (effective dots, XP earned/spent, health/vitae/WP/defence/size/speed, influence total, vitae deficit, pool totals) plus three I picked up during the walk: 9-Again, Honey-with-Vinegar threshold, effective Invictus status.
- **Not audited in this pass (held over for the post-audit report):**
  - `public/js/downtime/roller.js` and `public/js/downtime/parser.js` (a Peter-branch leftover per `reference_downtime_helper.md` memory — confirm whether shipped).
  - `public/js/admin/data-portability*.js` (export/import — uses raw fields, but export semantics may justify it; same as item 33 in drift map).
  - Server-side `server/lib/rule_engine/_legacy-bridge.js` and the parallel-write evaluators in `public/js/editor/rule_engine/` — these *write* derived dots into channel fields rather than read derived values, so they're upstream of the read drift this matrix catalogues.
- **Live MongoDB sample** for live-data delta is held over per the drift map item 29 escalation.

---

## What this matrix tells the post-audit report

1. **The "no canonical effective-rating helper" framing in `architectural-reset-charter.md` is partially wrong** — partial helpers exist for attributes (`getAttrEffective`), skills (`skTotal`, including PT/MCI grants), 9-Again (`skNineAgain`), merits (`meritEffectiveRating`), and influence (`calcTotalInfluence`). Derived stats are well-served by `calc*` helpers and they're routed cleanly. The actual problem is **routing enforcement**, not absence of helpers.

2. **The discipline of the DT form (`tabs/downtime-form.js`) is the reference pattern.** It consistently routes through accessors and domain helpers. Other surfaces — admin/dice-engine.js, game/combat-tab.js, game/contested-roll.js, the prereq engines, equipment.js, resist.js — predate the helper layer or were authored in isolation. Bringing them onto the same path is bounded scope.

3. **The merit-rating layer has the worst drift**: three definitions of which channels count, with the schema knowing about a fourth (`free_retainer`) that nobody sums. This is the only surface with a true canonicity gap, and it's the one that interacts with §4 of the acceptance criteria. Drift map items 11–14.

4. **There is no helper for the vitae-deficit / DT-feeding-cost layer.** That layer ought to live near `editor/domain.js` or in a new `feeding.js` module; current arithmetic is split between the player form and the ST processing panel. Adjacent to item 11; will surface in any deeper feeding-flow audit.

5. **Two canonical helpers compete for the same name:** `xpLeft` exists in both `editor/xp.js` (dynamic) and `data/accessors.js` (stored-fields). Same risk pattern as `influenceTotal`. Both are silent if called against the wrong character shape — a simple test would catch it but there's no test framework yet (charter Phase 3 concern).

---

## Updates

- 2026-05-01 — v1 drafted from Phase 1 walk-through.
