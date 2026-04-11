# Story fix.26: OTS Free Dots — Look in Powers Not Merits

## Status: done

## Story

**As an** ST,
**I want** Oath of the Scapegoat to correctly grant free style/merit dots,
**so that** the OTS pool counter appears and the ST can allocate the dots.

## Background

`applyDerivedMerits` in `mci.js` was looking for OTS in `c.merits` (with `m.category === 'pact'`) and reading `otsOath.rating` for the dot count. Both were wrong:

1. All oaths (OHM, OTS, Safe Word, Carthian Laws) are stored in `c.powers`, not `c.merits`
2. OTS dot count is stored as `cp + xp` on the power entry, not `rating`

The result: `_ots_free_dots` was always 0, so the pool counter never appeared and the OTS input never showed on fighting styles.

## Fix

- Changed lookup from `c.merits` to `c.powers`
- Changed dot calc from `otsOath.rating` to `(otsOath.cp || 0) + (otsOath.xp || 0)`

## Files Changed

- `public/js/editor/mci.js` — OTS block in `applyDerivedMerits`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Implemented | Claude (SM) |
