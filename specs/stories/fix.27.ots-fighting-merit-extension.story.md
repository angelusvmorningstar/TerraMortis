# Story fix.27: OTS Free Dots Extend to Fighting Merit

## Status: done

## Story

**As an** ST,
**I want** OTS free dots to be allocatable to Fighting Merit (not just fighting styles),
**so that** the oath benefit applies consistently across both merit types.

## Background

After Fix.26 made OTS work at all, the free-dot input and counter only appeared on fighting styles. The Fighting Merit block had no OTS input, and `otsUsed` didn't count Fighting Merit's `free_ots`. Additionally, the MCI label in the Fighting Merit block was crimson instead of gold.

## Fix

- `otsUsed` counter extended to include `fmEntry.free_ots`
- Fighting Merit dot calc includes `free_ots`
- OTS input added to Fighting Merit block (same style as fighting styles)
- MCI label/input in Fighting Merit block changed from `var(--crim)` to `var(--gold2)`

## Files Changed

- `public/js/editor/sheet.js` — Fighting Merit section

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Implemented | Claude (SM) |
