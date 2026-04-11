# Story fix.29: PT False Alert and Missing Controls

## Status: done

## Story

**As an** ST,
**I want** PT audit alerts to reflect actual dots (not stale stored rating), and be able to remove or suspend a PT merit,
**so that** characters with multiple PT entries don't trigger false allocation errors, and the ST has the same lifecycle controls as MCI.

## Background

Two independent bugs on the Professional Training block:

1. **False audit alert**: `audit.js` read `m.rating` directly. When a character has a second PT entry with 0 cp/xp, `applyDerivedMerits` has a guard `if (total > 0) m.rating = total` that skips zero-dot merits — leaving the stale MongoDB `rating` (e.g. 4) in place. Audit then checked wrong tiers (3rd Asset Skill, On-the-Job Training) against a character who only had 2 real dots.

2. **No remove or toggle**: `_renderPT` in `sheet.js` had no remove button or active/inactive toggle. `_renderMCI` has both.

## Fix

- `audit.js` line 188: replaced `const rating = m.rating || 0` with bucket-based calculation matching `applyDerivedMerits` logic: `(m.cp||0) + (m.xp||0) + (m.free_bloodline||0) + (m.free_retainer||0) + (m.free_mci||0) + (m.free_vm||0)`
- `edit-domain.js`: added `shTogglePT(standIdx)` — guards on `m.name !== 'Professional Training'`, toggles `m.active`
- `edit.js`: added `shTogglePT` to import and re-export
- `app.js`: added `shTogglePT` to import and window assignment
- `admin.js`: added `shTogglePT` to import and window assignment
- `sheet.js` `_renderPT`: added `inactive` flag, `mci-inactive` class on wrapper, `mci-title`/`mci-header-right` layout, Active/Suspended toggle button, remove ×  button — matching `_renderMCI` pattern exactly

## Files Changed

- `public/js/data/audit.js`
- `public/js/editor/edit-domain.js`
- `public/js/editor/edit.js`
- `public/js/editor/sheet.js`
- `public/js/app.js`
- `public/js/admin.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Implemented | Claude (SM) |
