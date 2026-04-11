# Story fix.25: vmAlliesPool — Remove Stale Legacy Free Field

## Status: done

## Story

**As an** ST,
**I want** the VM Allies pool counter to show the correct available dots,
**so that** the pool doesn't appear inflated by stale data.

## Background

`vmAlliesPool(c)` in `domain.js` summed `cp + xp + free_mci + free` (generic `free`) for each non-VM Allies entry. The generic `free` bucket was removed in Fix.14 from the editor, but existing MongoDB documents still carry stale `free` values from before that fix. This caused the pool to report inflated numbers (e.g. 6/20 instead of 6/6).

## Fix

Remove `(m.free || 0)` from the `vmAlliesPool` summation. The pool now only counts `cp + xp + free_mci`, which are the fields that the editor actually maintains.

## Files Changed

- `public/js/editor/domain.js` — `vmAlliesPool` function

## Dev Notes

The stale `free` field remains on live MongoDB documents but is now ignored in all calculations. A data cleanup script (`server/scripts/zero-free-fields.js`) exists to zero these out if needed.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Implemented | Claude (SM) |
