---
epic: ADH (Accessor Drift & Data Hygiene Remediation)
epic_file: specs/epic-adh-accessor-drift-hygiene.md
story: ADH.4
source: specs/audit-drift-map-2026-09-02.md — Drift map table, row "NEW-2" (folds in row "4 (May)"'s
  resist.js skill branch, same file, sequenced together per the audit's own note)
priority: HIGH but dormant — canonical pool-builder is on the call-site list, not merely display code
---

# Story ADH.4: Propagate `discDots()`'s bonus-channel fix to its real call sites

## Status: Draft (scoping only — no code written)

## Story

**As** a developer maintaining the character rules engine,
**I want** every call site that reads a discipline's rating for pool-building or display to go
through the canonical `discDots(c, disc)` accessor instead of a raw `c.disciplines[x]?.dots` read,
**so that** the 2026-08-31 "one true rating" correction to `discDots()` (now `dots + bonus`)
actually applies everywhere a discipline rating is used, not just at its own definition site.

## Background (source finding, verbatim citation)

`specs/audit-drift-map-2026-09-02.md`, Drift map table, row **NEW-2**:

> `discDots()` was corrected 2026-08-31 to include the discipline's `.bonus` channel, but ~12 real
> call sites still read `c.disciplines[x]?.dots` raw, silently dropping that channel — including
> `shared/pools.js:60`'s `getPool()`, the single most-consumed pool builder in the app.
> — Severity: **HIGH** — "dormant today (every live discipline has `bonus:0`, matching
> `accessors.js`'s own code comment) but is exactly the 'correct until real data exercises it, then
> wrong everywhere at once' class; it sits on the canonical pool builder itself, one data-shape away
> from every discipline dice pool in the game being wrong."
> — Refactor target: "Route all listed sites through `discDots(c, disc)`; decide deliberately
> whether `discAttrBonus`'s own donor-read should also use `discDots` (a bonus-boosted donor
> discipline arguably should donate its full rating too)."

**Full call-site list (from the audit):**
- `shared/pools.js:60` (`discV`) — **highest priority**, per the audit's own recommended sequence:
  "prioritise `shared/pools.js:60` first since it is the highest-traffic site."
- `data/accessors.js:127,131,142` (`discAttrBonus`/`_discDerivedBonus`'s own donor reads)
- `shared/resist.js:135` (disc-token branch)
- `admin/downtime-views.js:1027,1030`
- `tabs/feeding-tab.js:512,690`
- `suite/tracker-feed.js:106,116`
- `editor/sheet.js:601,620,2520`
- `data/prereq.js:57,60`
- `game/char-pools.js:221` (Nightmare)

**Folded in from row 4 (May):** `shared/resist.js`'s **skill-branch** raw `skDots` read (`:134`) is
in the same file as this row's disc-branch fix (`:135`); the audit's own recommended sequence notes
item 4 is "one-line fix once NEW-2's disc branch is also handled in the same file" — doing both in
one pass on one file avoids two stories touching the same lines. `resist.js:134`'s fix is: route
through `skTotal(c, skill)` instead of base-only `skDots`.

## Acceptance Criteria

1. `shared/pools.js:60` (`discV` in `getPool()`) reads discipline rating via `discDots(c, disc)`
   instead of raw `c.disciplines[x]?.dots`. **Do this one first and verify it in isolation** before
   moving to the rest — it's the highest-traffic site and the one most worth a standalone smoke
   test.
2. All remaining listed call sites (`accessors.js:127,131,142`; `resist.js:135`;
   `admin/downtime-views.js:1027,1030`; `tabs/feeding-tab.js:512,690`;
   `suite/tracker-feed.js:106,116`; `editor/sheet.js:601,620,2520`; `data/prereq.js:57,60`;
   `game/char-pools.js:221`) are routed through `discDots(c, disc)`.
3. `shared/resist.js:134` (skill branch, folded in from item 4) is routed through `skTotal(c, skill)`
   instead of base-only `skDots` — same file, same pass.
4. **The `discAttrBonus`/`_discDerivedBonus` donor-read question is decided deliberately, not
   defaulted.** The audit flags this explicitly: should a bonus-boosted donor discipline (e.g. a
   Resilience with a non-zero `.bonus` from some future grant) donate its *full* `discDots()` rating
   to the attribute it enhances, or just its base `dots`? Since every live discipline currently has
   `bonus:0` (per the audit), this decision has no live-data impact today — but it must be made
   explicitly and recorded here, not left as an accidental side effect of a mechanical find-replace.
   Default recommendation if no stronger reason emerges during implementation: yes, route through
   `discDots()` for consistency with every other consumer — but this is a judgement call for
   whoever implements the story, and should be confirmed with Angelus if there's any doubt, since it
   changes the donation formula's shape (dormant now, live the moment `.bonus` is ever non-zero on a
   discipline).
5. **Regression test added**: construct a character with a discipline that has a non-zero `.bonus`
   channel (synthetic test data — none exists live per the audit) and confirm `getPool()`,
   `resist.js`, and at least one other representative call site (e.g. `feeding-tab.js` or
   `char-pools.js`) all now include that bonus in their computed value, where before the fix it was
   silently dropped.
6. **No live-data risk** — the audit confirms every live discipline has `bonus:0` today, so this
   fix is provably a no-op on current production behaviour; it's purely defensive against future
   data. No live-data migration or check needed for this story (contrast with ADH.2, which does need
   one).

## Tasks / Subtasks

- [ ] Read `public/js/data/accessors.js:197` (`discDots`) to confirm its exact current formula
      before propagating it anywhere.
- [ ] Fix `shared/pools.js:60` first (AC1); smoke-test in isolation if feasible.
- [ ] Fix the remaining 11 call sites (AC2), one file at a time, confirming each site's local
      variable naming/shape doesn't need adjustment beyond the raw-read swap.
- [ ] Fix `shared/resist.js:134`'s skill branch alongside `:135`'s disc branch (AC3) — same file,
      same commit/pass.
- [ ] Decide and record the `discAttrBonus` donor-read question (AC4) — read `accessors.js:122-142`
      in full to understand the current donor-read shape before deciding.
- [ ] Add the regression test(s) per AC5.
- [ ] Run the touched spec file(s) plus an adjacent regression sweep covering pools/resist/
      feeding-tab/prereq/char-pools tests — not the full suite. This touches 12+ files across
      client and server-importable modules, so the regression sweep should be broader than a
      single-file story; use judgement on breadth vs. the "targeted, not full suite" convention.

## Dev Notes

### Key files
See the full call-site list above, taken verbatim from the audit's NEW-2 row.

### Why sequenced third (after ADH.2/NEW-1, ADH.3/NEW-3) in the drift-map set
The audit's own "Recommended sequence" names NEW-2 third: "larger surface (12 call sites) but each
fix is mechanical (swap a raw `.dots` read for `discDots(c, disc)`); prioritise `shared/pools.js:60`
first since it is the highest-traffic site."

### Why item 4's resist.js skill-branch is folded in here rather than a separate story
Same file, adjacent lines (`:134` skill / `:135` disc), and the audit's own sequencing note says the
skill-branch fix naturally follows once the disc-branch (NEW-2) work touches the same file. Splitting
this into two stories would mean two PRs editing the same three lines of context.

### Explicitly out of scope
- `data/accessors.js`'s own legacy fallback (used only when the `rule_disc_attr` cache is unloaded)
  — the audit calls this "an intentional degrade path, not drift." Do not touch.
- `editor/sheet.js`'s `BONUS_SOURCE` hardcoded discipline→attribute map (item 31/10) — that's
  ADH.6's scope (batched MED cleanup), not this story, even though it's in the same file family and
  "now also missing the discipline `.bonus` channel" per the audit. Keep this story to the raw
  `.dots` read swap only; the hardcoded-map replacement is a separate, larger change.

### References
- `specs/audit-drift-map-2026-09-02.md` — NEW-2 row in full, plus row 4 (May) for the folded-in
  resist.js skill branch, plus the Canonical Accessors table's `discDots` entry (row explaining the
  2026-08-31 change).
