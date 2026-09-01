---
epic: ADH (Accessor Drift & Data Hygiene Remediation)
epic_file: specs/epic-adh-accessor-drift-hygiene.md
story: ADH.6
source: specs/audit-drift-map-2026-09-02.md — Drift map table, rows "8 (May)", "9 (May)",
  "14 (May)", "31 (May)"
priority: MED / LOW-MED — read-side and mostly display-only; batched per the audit's own recommendation
---

# Story ADH.6: Batch cleanup — ordeals XP display, `xpPT5`, direct `m.rating` reads, `BONUS_SOURCE`

## Status: Draft (scoping only — no code written)

## Story

**As** a developer clearing the remaining MED-and-below drift-map findings,
**I want** the four smallest remaining raw-field reads routed through their canonical accessors in
one batched pass,
**so that** the app stops carrying four independent hand-rolled duplicates of the same
already-solved problem (effective skill/merit/attribute rating), matching the audit's own
recommendation to batch these together rather than open four near-trivial stories.

## Background (source findings, verbatim citations)

`specs/audit-drift-map-2026-09-02.md`, Drift map table:

**Row 8 (May):**
> Ordeals/XP-ledger view re-derives "maxed asset skills" inline for its Professional Training
> sub-row breakdown, missing MCI dot-3 bonus.
> — `tabs/ordeals-view.js:226-232` (moved from May's line 160; same pattern).
> — Canonical: `skTotal`. — **MED**, unchanged. — Refactor target: "Use `skTotal`."

**Row 9 (May):**
> `xp.js`'s `xpPT5` still inlines its own effective-dots calc for the PT5 XP award, missing MCI
> dot-3 bonus.
> — `editor/xp.js:65-75`, `const effective = (s?.dots || 0) + (ptBonus.has(sk) ? 1 : 0);`
> — Canonical: `skTotal`. — "inline duplicate, unchanged (now duplicated a **third** time by item 8
> above)" — **LOW-MED** ("matches skTotal only when no MCI dot-3 grant is in play"). — Refactor
> target: "Use `skTotal` and drop the `>= 5` inline check in favour of it."

**Row 14 (May):**
> Direct `m.rating` reads bypassing `meritEffectiveRating`, missing Herd SSJ/Flock and domain-merit
> capping.
> — `editor/sheet.js:1067,1114,2018,2070,2093,2523`; `admin/downtime-views.js` (9 raw `.rating || 0`
> sites, still present, not individually re-line-numbered this pass).
> — Canonical: `meritEffectiveRating`. — "**MED** mainline / **HIGH** for Herd display specifically,
> same as May." — Refactor target: "Route through `meritEffectiveRating`. **New mitigation, not a
> fix:** `sheet.js:320-329` now renders a live '⚠ Rating mismatch' banner + `console.warn` when
> `m.rating` disagrees with `cp+xp+meritFreeSum` — this surfaces the drift to an ST looking at the
> sheet but does not correct any of the raw-read consumers."

**Row 31 (May):**
> `editor/sheet.js` still inlines `(c.disciplines?.[BONUS_SOURCE[a]]?.dots || 0)` for the attribute
> auto-bonus render, bypassing `discAttrBonus`.
> — `editor/sheet.js:601,620` (moved from May's `:418`).
> — Canonical: `discAttrBonus`. — "duplicate, unchanged, **now also missing the discipline `.bonus`
> channel (NEW-2)**" — **MED**, compounding with NEW-2. — Refactor target: "Use `discAttrBonus`."

## Acceptance Criteria

1. `tabs/ordeals-view.js:226-232`'s inline "maxed asset skills" calc for the Professional Training
   sub-row is replaced with `skTotal(c, skill)`.
2. `editor/xp.js:65-75`'s `xpPT5` inline effective-dots calc is replaced with `skTotal(c, skill)`;
   the redundant `>= 5` inline check is dropped in favour of `skTotal`'s own capped return value.
3. `editor/sheet.js:1067,1114,2018,2070,2093,2523` — all six direct `m.rating` reads are routed
   through `meritEffectiveRating(c, m)`.
4. `admin/downtime-views.js` — locate the "9 raw `.rating || 0` sites" the audit references (its own
   note says these weren't individually re-line-numbered this pass — re-grep for
   `.rating \|\| 0` / `m.rating` in this file as the first task, don't assume the count without
   confirming it live) and route each through `meritEffectiveRating(c, m)`. **Prioritise the Herd
   display specifically** — the audit calls this HIGH severity, not just MED, for that one case; if
   time/scope pressure forces a partial pass, Herd correctness is the one that must not be dropped.
5. `editor/sheet.js:601,620`'s `BONUS_SOURCE`-based inline discipline read is replaced with
   `discAttrBonus(c, attr)`. **Do this after ADH.4 lands** (or as part of the same PR/pass if
   convenient) — the audit notes this finding is "now also missing the discipline `.bonus` channel
   (NEW-2)", so fixing it before ADH.4's `discDots()` propagation would just recreate the same gap
   one call removed. If ADH.4 hasn't landed when this story is worked, sequence after it or route
   through `discDots(c, disc)` directly inside `discAttrBonus` first (ADH.4's own concern) so this
   fix inherits the corrected value automatically.
6. The existing "⚠ Rating mismatch" banner + `console.warn` at `editor/sheet.js:320-329` is left
   in place — it's a useful mitigation independent of this story's fix, not something to remove.
7. **Regression tests added** covering: an ordeals-view PT sub-row with an MCI dot-3 skill grant now
   shows the correct maxed count; an `xpPT5` award for a skill with an MCI dot-3 grant now uses the
   correct effective dots; a merit with Herd SSJ/Flock or domain-merit capping now displays its
   correct capped rating everywhere the six sheet.js sites and the downtime-views.js sites render
   it, instead of the raw uncapped `m.rating`.

## Tasks / Subtasks

- [ ] Read `tabs/ordeals-view.js:226-232` and fix (AC1).
- [ ] Read `editor/xp.js:65-75` and fix (AC2).
- [ ] Read `editor/sheet.js` at each of the six cited lines (`:1067,1114,2018,2070,2093,2523`) and
      confirm each is a genuine raw `m.rating` read (not already fixed since the audit) before
      changing; fix each (AC3).
- [ ] Grep `admin/downtime-views.js` fresh for `.rating` reads to get the current, accurate line
      list (the audit's own note says it didn't re-line-number these this pass); fix each, with
      Herd display prioritised (AC4).
- [ ] Fix `editor/sheet.js:601,620` per AC5, sequenced after or alongside ADH.4.
- [ ] Add regression tests per AC7.
- [ ] Run the touched spec file(s) plus an adjacent regression sweep on ordeals-view/xp/sheet/
      downtime-views-related tests — not the full suite. This story touches the most files of any
      in this epic (ordeals-view.js, xp.js, sheet.js, downtime-views.js); use judgement on
      regression-sweep breadth.

## Dev Notes

### Key files
- `public/js/tabs/ordeals-view.js:226-232`
- `public/js/editor/xp.js:65-75`
- `public/js/editor/sheet.js:1067,1114,2018,2070,2093,2523` (raw `m.rating` reads) and `:601,620`
  (`BONUS_SOURCE` inline read) and `:320-329` (existing mismatch-warning banner, leave in place)
- `public/js/admin/downtime-views.js` — re-grep for current `.rating` read sites before fixing

### Why batched into one story
The audit's own "Recommended sequence" explicitly groups these four rows: "Items 8, 9, 14, 31 —
MED-and-below cleanup, can be batched into one follow-up pass." None of the four individually
justifies its own story-overhead (each is a small number of lines in one file), and three of the
four (8, 9, 14) are literally the same underlying bug — a hand-rolled "effective skill/merit rating"
calc duplicating `skTotal`/`meritEffectiveRating` — so batching also avoids three near-identical
tiny stories.

### Explicitly out of scope
- Items 16-28 (structural duplicates, not re-verified this pass) and items 21-24/29 (schema-shape)
  — see the epic file's "Explicitly not in this epic" section. Not this story, not batched in here
  even though they're also MED-tier — the audit explicitly says they need a dedicated future
  scoping pass, unlike 8/9/14/31 which already have concrete, confirmed refactor targets.

### References
- `specs/audit-drift-map-2026-09-02.md` — rows "8 (May)", "9 (May)", "14 (May)", "31 (May)" in full.
