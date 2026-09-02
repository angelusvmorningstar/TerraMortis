---
epic: ADH (Accessor Drift & Data Hygiene Remediation)
epic_file: specs/epic-adh-accessor-drift-hygiene.md
story: ADH.5
source: specs/audit-drift-map-2026-09-02.md — Drift map table, rows "5 (May)" and "6 (May)"
priority: HIGH — both are live/consumer-facing paths, unchanged since May
---

# Story ADH.5: Fix `contested-roll.js`'s double-count and `prereq.js`'s base-only reads

## Status: Draft (scoping only — no code written)

## Story

**As** a Storyteller running a live Social Manoeuvre or Resistance Check, or a player attempting an
XP purchase gated by a prerequisite,
**I want** both the ST-tool contested-roll pool calculation and the structured prerequisite engine
to read effective (not base) ratings, without double-counting any channel,
**so that** rolled pools and purchase gates match a character's true, current effective ratings.

## Background (source findings, verbatim citations)

`specs/audit-drift-map-2026-09-02.md`, Drift map table:

**Row 5 (May):**
> `game/contested-roll.js`'s `aval`/`sk` helpers double-count attribute bonus and skip PT/MCI on
> skill.
> — `contested-roll.js:32-33`: `const aval = (c,attr) => getAttrEffective(c,attr) +
> getAttrBonus(c,attr); const sk = (c,skill) => skDots(c,skill) + skBonus(c,skill);`
> — Canonical: `getAttrEffective`, `skTotal`.
> — "call-pattern bug, byte-for-byte unchanged since May" — **HIGH** — "used live for every Social
> Manoeuvre and Resistance Check contested roll in this ST-only tool."
> — Refactor target: `aval = (c,attr) => getAttrEffective(c,attr)`; `sk = (c,skill) =>
> skTotal(c,skill)`. Note: Epic RLV's own D4 (2026-08-24) explicitly kept this file separate from
> the roller consolidation — "this bug was not in scope there and was not touched."

**Row 6 (May):**
> Structured prereq engine reads attribute/skill/discipline/merit at base ratings.
> — `data/prereq.js:50` (`getAttrVal`), `:53` (`skDots`), `:57-62` (raw disc `.dots`), `:79,84`
> (`m.rating || 0`).
> — Canonical: `getAttrEffective`, `skTotal`, `discDots`, `meritEffectiveRating`.
> — "engine-level under-count, unchanged" — **HIGH** — "for any prereq gated on an enhanced rating
> (this is the live XP-purchase gate, `meetsPrereq` is the engine `merits.js` now delegates to as
> canonical)."
> — Refactor target: "Switch leaf-evaluators to the effective-reading equivalents."

**Overlap note with ADH.4:** `data/prereq.js:57,60` (the raw discipline `.dots` reads) are already
on ADH.4/NEW-2's own call-site list — **do not duplicate that fix here.** This story covers
`prereq.js`'s **attribute** (`:50`), **skill** (`:53`), and **merit** (`:79,84`) leaf-evaluators
only. If ADH.4 hasn't landed yet when this story is worked, either sequence after it or coordinate
so `prereq.js`'s discipline lines aren't fixed twice in diverging ways.

## Acceptance Criteria

1. `game/contested-roll.js:32-33`'s `aval` helper reads `getAttrEffective(c, attr)` only — remove
   the `+ getAttrBonus(c, attr)` double-add.
2. `game/contested-roll.js:32-33`'s `sk` helper reads `skTotal(c, skill)` instead of
   `skDots(c, skill) + skBonus(c, skill)` — this also picks up PT/MCI dot-bonus contributions that
   the old pattern skipped entirely (not just a double-count fix; a genuine undercount fix for the
   PT/MCI case).
3. `data/prereq.js:50`'s attribute leaf-evaluator reads `getAttrEffective` instead of `getAttrVal`.
4. `data/prereq.js:53`'s skill leaf-evaluator reads `skTotal` instead of base-only `skDots`.
5. `data/prereq.js:79,84`'s merit leaf-evaluator reads `meritEffectiveRating` instead of
   `m.rating || 0`/`|| 1`.
6. `data/prereq.js:57,60`'s discipline leaf-evaluator is **left to ADH.4** — confirm at
   implementation time whether ADH.4 has already landed; if not, either sequence this story after
   it or apply the identical `discDots(c, disc)` fix here and flag it in ADH.4's own story so that
   story doesn't re-touch the same lines.
7. **Regression tests added** for both files: `contested-roll.js` — confirm a character with a
   PT/MCI dot-3+ skill grant now rolls the correct (higher) pool, and confirm no double-counted
   attribute bonus inflates the pool beyond `getAttrEffective`'s own value. `prereq.js` — confirm a
   character whose prereq depends on an enhanced attribute/skill/merit rating now correctly passes
   (or fails) a gate that the base-only read got wrong before.
8. **Live-data check recommended, not mandatory**: since `prereq.js`'s `meetsPrereq` gates real XP
   purchases, consider (at implementation time) whether any live character currently has a
   purchase blocked or wrongly allowed by this undercount. Not a hard AC — the audit doesn't flag a
   confirmed live-wrong case here the way NEW-3 does — but worth a quick sanity check given this is
   a purchase gate, not just a display value.

## Tasks / Subtasks

- [ ] Read `game/contested-roll.js` in full around `:32-33` and confirm no other helper in the file
      has the same double-count/undercount pattern before fixing just these two lines.
- [ ] Fix `aval`/`sk` per AC1/AC2.
- [ ] Read `data/prereq.js` in full — the leaf-evaluator structure around `:50-84` — to confirm the
      exact call shape for each of `getAttrVal`, `skDots`, and `m.rating` reads before swapping.
- [ ] Fix the attribute/skill/merit leaf-evaluators per AC3-AC5. Coordinate the discipline
      leaf-evaluator with ADH.4 per AC6.
- [ ] Add regression tests per AC7.
- [ ] Run the touched spec file(s) plus an adjacent regression sweep on contested-roll/prereq/
      merits.js (`meetsPrereq`'s caller)-related tests — not the full suite.
- [ ] Optionally run the live-data sanity check per AC8; report findings even if none are found.

## Dev Notes

### Key files
- `public/js/game/contested-roll.js:32-33` — `aval`/`sk` helpers.
- `public/js/data/prereq.js:50,53,57-62,79,84` — leaf-evaluators; `:57-62` shared with ADH.4.
- `public/js/editor/merits.js` — confirmed by the audit as the current delegate to `prereq.js`'s
  `meetsPrereq` (the live XP-purchase gate this story's `prereq.js` fix affects).

### Why sequenced fourth (after ADH.2/NEW-1, ADH.3/NEW-3, ADH.4/NEW-2) in the drift-map set
The audit's own "Recommended sequence" names items 5 and 6 together, fourth: "both HIGH, both
unchanged since May, both small and isolated."

### Explicitly out of scope
- `data/prereq.js:57,60`'s discipline reads — ADH.4's scope (NEW-2's own call-site list already
  includes these lines). See AC6's coordination note.
- Any change to `editor/merits.js`'s dead legacy regex prereq path (`meritQualifies` and its
  `_getAttrDots`/`_getSkillDots`/`_getDiscDots`/`_getMeritRating` helpers) — the audit confirms
  these are orphaned (item 7, downgraded to no-risk, nothing calls `meritQualifies`). Do not revive
  or fix dead code.

### References
- `specs/audit-drift-map-2026-09-02.md` — rows "5 (May)" and "6 (May)" in full.
- Epic RLV (`specs/epic-rlv-roller-harmonisation.md`) — D4's ruling on why `contested-roll.js` stays
  a separate engine; this story fixes a bug within that engine, it does not fold it into anything.
