# Story fix.28: OTS Dots Count Toward Manoeuvre Qualification

## Status: done

## Story

**As an** ST,
**I want** manoeuvre slots to unlock when OTS dots are allocated to a fighting style,
**so that** characters with OTS-funded styles can pick manoeuvres.

## Background

`_qualifiesForManoeuvre` and `_tagCounts` in `sheet.js` computed style dot totals as `cp + free_mci + xp` — missing `free_ots`. A character like Keeper with Courtoisie funded entirely by OTS (2 `free_ots` dots, 0 cp/xp) would have 0 qualifying dots according to these functions, returning "no qualifying manoeuvres yet" despite the style showing 2 dots.

Additionally all MCI and OTS labels across both fighting styles and fighting merit blocks were colour-inconsistent (crimson/purple rather than gold).

## Fix

- `_tagCounts`: add `free_ots` to per-style dot count
- `_qualifiesForManoeuvre`: add `free_ots` to both the fighting-style and Fighting-Merit dot paths
- All MCI/OTS input labels in the fighting section changed to `var(--gold2)`
- OTS pool counter row and the merit note under Oath of the Scapegoat also updated to gold
- Counter label updated to "free style/merit dots"

## Files Changed

- `public/js/editor/sheet.js` — `_tagCounts`, `_qualifiesForManoeuvre`, fighting section colour strings

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Implemented | Claude (SM) |
