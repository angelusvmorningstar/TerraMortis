---
epic: ADH (Accessor Drift & Data Hygiene Remediation)
epic_file: specs/epic-adh-accessor-drift-hygiene.md
story: ADH.3
source: specs/audit-drift-map-2026-09-02.md — Drift map table, row "NEW-3"
priority: HIGH — live, currently-wrong gameplay path (Challenge/Duel)
---

# Story ADH.3: `contested-rolls.js` — give `_attrEffective` its full, promised formula

## Status: Draft (scoping only — no code written)

## Story

**As** a Storyteller resolving a Challenge/Duel contested roll,
**I want** the server's resistance-attribute calculation to include discipline-donated attribute
enhancement (e.g. Resilience → Stamina), exactly as its own name promises,
**so that** a defending character with a relevant discipline gets the benefit they're supposed to
on the `physical` aspect's resistance check, instead of silently losing it.

## Background (source finding, verbatim citation)

`specs/audit-drift-map-2026-09-02.md`, Drift map table, row **NEW-3**:

> `server/routes/contested-rolls.js`'s own `_attrEffective(character, attrName)` — despite the name
> — reimplements `getAttrTotal` (dots+bonus), **not** `getAttrEffective` (dots+bonus+discipline
> enhancement). Feeds `_willpowerMax` and the crd.3a Resistance Attribute check for the
> Challenge/Duel contested-roll system. A character with Resilience (discipline→Stamina) gets no
> benefit on the `physical` aspect's server-computed resistance rating.
> — Location: `server/routes/contested-rolls.js:106-109`, consumed by `_willpowerMax` (`:111-113`)
> and the aspect-resistance check (`ASPECT_ATTR` includes `Stamina`).
> — Severity: **HIGH** — "real, live gameplay path (Challenge/Duel), wrong today for any
> Resilience-holding defender, not merely dormant."
> — Refactor target: "Reimplement the full `getAttrEffective` formula server-side (dots+bonus+
> `rule_disc_attr`-driven discipline donation) — the file already accepts the 'no client import'
> constraint, it just needs the complete formula, not a reduced one."

**Why the file doesn't just import the client accessor:** per the audit's own "What this is"
section, `contested-rolls.js` explicitly declines to import `data/accessors.js` because that module
is browser-coupled (bloodlines cache, rule-engine cache). This story does not change that decision
— it reimplements the missing piece of the formula server-side, matching the same constraint the
file already works under.

## Acceptance Criteria

1. `_attrEffective(character, attrName)` (`server/routes/contested-rolls.js:106-109`) computes
   dots + bonus + discipline-donated attribute enhancement — the same three-term formula as the
   client's `getAttrEffective` (`public/js/data/accessors.js:161`) — not just dots + bonus.
2. Discipline donation is resolved server-side from `rule_disc_attr` data (the same data source
   `discAttrBonus`/`_discDerivedBonus` use client-side, `accessors.js:122/135`), fetched or cached
   in whatever way is idiomatic for this route file already (check how the file already accesses
   rule-engine data server-side for other calculations before inventing a new access pattern).
3. `_willpowerMax` (`:111-113`) and the `physical`-aspect Resistance Attribute check (wherever
   `ASPECT_ATTR`'s `Stamina` entry is consumed) both pick up the corrected value automatically,
   since both consume `_attrEffective`'s return value — no separate fix needed at either call site
   unless the implementation reveals otherwise.
4. **Regression test added**: a character with a Resilience-granting discipline (or whichever
   discipline the live `rule_disc_attr` data maps to Stamina) resolves a `physical`-aspect
   Challenge/Duel resistance check with the discipline's donation included, where before the fix it
   was silently dropped. A second test confirms a character with no discipline donation is
   unaffected (no regression on the common case).
5. No change to any client-side file. This is a server-only fix, matching the file's existing
   architectural boundary.

## Tasks / Subtasks

- [ ] Read `server/routes/contested-rolls.js` in full, focusing on `_attrEffective` (`:106-109`),
      `_willpowerMax` (`:111-113`), and how `ASPECT_ATTR`/the aspect-resistance check consumes
      `_attrEffective`'s output.
- [ ] Read `public/js/data/accessors.js:122-165` (`discAttrBonus`, `_discDerivedBonus`,
      `getAttrEffective`) to confirm the exact formula and donor-resolution logic to port
      server-side.
- [ ] Confirm how (or whether) `contested-rolls.js` already has server-side access to
      `rule_disc_attr` data (grep the file and its imports for any existing rule-engine data access
      before assuming a new fetch/cache is needed).
- [ ] Implement the corrected formula.
- [ ] Add the regression test(s) per AC4.
- [ ] Run the touched spec file(s) plus an adjacent regression sweep on
      contested-rolls/Challenge-Duel-related tests — not the full suite.
- [ ] Live-verify (or note if not feasible without a browser session) that a real character with a
      Resilience-family discipline resolves correctly through the Challenge/Duel UI post-fix.

## Dev Notes

### Key files
- `server/routes/contested-rolls.js:106-113` — the function to fix and its direct consumer.
- `public/js/data/accessors.js:122,135,161` — the canonical formula to match (donor read, derived-
  stat donation, and the full effective-attribute composition respectively).

### Why sequenced second (after ADH.2/NEW-1) in the drift-map set
The audit's own "Recommended sequence" names NEW-3 second: "narrow, one function, live
gameplay-facing (Challenge/Duel), already isolated behind a documented seam (`_attrEffective`)."

### Explicitly out of scope
- Folding `contested-rolls.js` into the unified roller or importing `data/accessors.js` directly —
  Epic RLV's own D4 decision (2026-08-24) ruled `contested-rolls.js` stays a deliberately-simplified
  separate engine; this story does not revisit that ruling, it just corrects the formula within the
  file's existing architecture.
- `discAttrBonus`'s own donor-read question (NEW-2, "should a bonus-boosted donor discipline donate
  its full rating too") — that's ADH.4's scope, not this one. This story ports whatever the CURRENT
  client formula does; if ADH.4 changes that formula, this story's server-side port should be
  re-checked for drift afterward (note this as a follow-up dependency, don't block on it).

### References
- `specs/audit-drift-map-2026-09-02.md` — NEW-3 row in full.
- Epic RLV (`specs/epic-rlv-roller-harmonisation.md`) — D4's own ruling on why `contested-roll.js`
  (client) and `contested-rolls.js` (server route) both stay separate, simplified engines. Read
  before assuming this story should consolidate anything.
