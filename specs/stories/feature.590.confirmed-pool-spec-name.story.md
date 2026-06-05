# Story Feature.590: Confirmed pool states the specialisation by name

## Status: review

> **Implemented 2026-06-05.** (1) `_augmentPoolWithSpecs` now qualifies cross-skill specs with `(Skill)` via `isSpecs(char)`; (2) the three `.proc-pool-total` initial renders (feeding + project) wrap `initTotalStr` with the helper, so a confirmed/disabled pool shows the named spec without a recalc. New spec `tests/fix-590-confirmed-pool-spec-name.spec.js` — 2/2 pass. ESM parse-check green. Regression in parallel.

## Metadata
- issue: 590
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/590
- branch: morningstar-issue-590-confirmed-pool-spec-name
- type: feature (display fix)
- surfaced-by: #585 (retired the old committed-pool spec-name test)

---

## Story

**As** an ST resolving a downtime,
**I want** a confirmed dice pool to spell out the active specialisation by name (e.g. "Coward Punch (Stealth)"),
**so that** I can see exactly which spec is in play without decoding a bare total.

---

## Background & audit (mechanism confirmed)

The pool expression is shown in `.proc-pool-total` (`downtime-views.js`). Two facts:

1. **Initial render uses the bare base.** `.proc-pool-total` is rendered with `initTotalStr` (the base expression, NO spec names) at the feeding + project pool-builder sites (`:9078`, `:9724`, `:9819`). The runtime recalc (`:6973`) DOES augment it with spec names via `_augmentPoolWithSpecs(baseDisplay, activeSpecs, char)` — but a **confirmed pool is disabled and never recalcs**, so it stays on the bare base. That is the bug the flat-card redesign (#581) introduced.
2. **The augment helper lacks the skill qualifier.** `_augmentPoolWithSpecs` (`:795-804`) maps each active spec to `` `${sp} +${aoe?2:1}` `` — it names the spec but NOT the source skill. The issue wants "Coward Punch (Stealth)" for cross-skill specs. `_buildSpecTogglesHtml` (`:6614-6623`) already renders cross-skill IS specs as `` `${isSp} (${fromSkill})` `` via `isSpecs(char)`.

**Spec source (resolves the issue's open question):** `rev.active_feed_specs` — an array of spec **name strings**. `isSpecs(char)` (`public/js/data/helpers.js:249`) returns `[{spec, fromSkill}]` for the skill qualifier; `hasAoE(char, sp)` gives +2 vs +1.

---

## Acceptance Criteria

- [x] **AC1 (named spec in confirmed pool)** — confirmed feeding pool shows the spec in `.proc-pool-total` on first render. _(Test: cross-skill spec.)_
- [x] **AC2 (skill qualifier)** — `fromSkillMap` from `isSpecs(char)` → "Coward Punch (Stealth)"; native specs keep just their name. _(Test asserts "(Stealth)".)_
- [x] **AC3 (no generic placeholder)** — the named, augmented expression replaces the bare base.
- [x] **AC4 (project consistent)** — all three `.proc-pool-total` sites (1 feeding + 2 project) wrap `initTotalStr`.
- [x] **AC5 (no-spec unchanged)** — helper early-returns the input when `activeSpecs` empty; `|| initTotalStr` fallback. _(Test: no-spec pool.)_
- [x] **AC6 (total correct)** — the helper recomputes `tot + specTotal`; call sites pass the base, no double-count.
- [x] **AC7 (test)** — `tests/fix-590-confirmed-pool-spec-name.spec.js`, 2 tests pass.

---

## Tasks

### Task 1 — Add the skill qualifier to `_augmentPoolWithSpecs` (AC2) — [x] DONE
`downtime-views.js:795-804`. Build a lookup from `isSpecs(char)` (`spec → fromSkill`). For each active spec `sp`, render `` `${fromSkill ? `${sp} (${fromSkill})` : sp} +${hasAoE(char, sp) ? 2 : 1}` ``. Keep the empty-specs early return and the total recompute. (This also upgrades the runtime recalc display for free — same helper.)

### Task 2 — Augment the initial `.proc-pool-total` render (AC1, AC3, AC4, AC5) — [x] DONE
At the feeding (`:9724`) and project (`:9078`, `:9819`) pool-builder render sites, wrap the initial total: replace `${esc(initTotalStr)}` with `${esc(_augmentPoolWithSpecs(initTotalStr, rev.active_feed_specs || [], char) || initTotalStr)}`. `rev` and `char` are in scope at these sites (cf. `:9069`, `:9715`). Confirm `initTotalStr` contains a trailing "= N" (the helper requires `=`). Do NOT touch the sorcery total (`:7619`) — out of scope (feeding + project only).

### Task 3 — Test (AC7) — [x] DONE
Playwright spec (model `tests/fix-601-maintenance-target-details.spec.js`): a feeding submission whose `feeding_review` is confirmed (`pool_status: 'confirmed'`, `pool_validated` with `= N`, `active_feed_specs: ['<cross-skill spec>']`) and a character whose `isSpecs` yields that spec from a skill → open the feeding action → `.proc-pool-total` contains "X (Skill)". A confirmed pool with `active_feed_specs: []` → `.proc-pool-total` unchanged (no "(" spec suffix).

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js:795-804` — `_augmentPoolWithSpecs` (Task 1).
- `public/js/admin/downtime-views.js:9078, 9724, 9819` — `.proc-pool-total` initial render (Task 2).
- `public/js/admin/downtime-views.js:6614-6623` — `_buildSpecTogglesHtml` (the "(fromSkill)" format to mirror).
- `public/js/admin/downtime-views.js:6973` — runtime recalc (already augments; same helper, upgraded for free).
- `public/js/data/helpers.js:249` — `isSpecs(c)` → `[{spec, fromSkill}]`.

### Must preserve / watch-outs
- `_augmentPoolWithSpecs` early-returns the input unchanged when no active specs — preserve (AC5).
- It recomputes the total from base + spec bonuses — do NOT add the bonus again at the call sites (AC6).
- The qualifier rule mirrors the toggles: native spec on the selected skill → no "(Skill)"; cross-skill IS spec → "(fromSkill)". A simple `isSpecs` lookup gives the cross-skill ones; native specs won't be in that map → no suffix. Good enough and matches the chips.
- `char` may be null (character not loaded) — `_augmentPoolWithSpecs` already guards `char` for `hasAoE`; the `isSpecs(char)` lookup must also guard null (empty map).
- Confirmed pools are `disabled` and do not recalc — that is why the INITIAL render must carry the names (Task 2).
- British English; no em-dashes.

### References
- [Source: downtime-views.js:795-804] `_augmentPoolWithSpecs`
- [Source: downtime-views.js:6614-6623] `_buildSpecTogglesHtml` "(fromSkill)" format
- [Source: downtime-views.js:9078,9724,9819] `.proc-pool-total` initial render
- #585 (retired the old committed-pool spec-name test), #581 (flat-card redesign that dropped it)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- ESM parse-check `downtime-views.js` — PASS.
- `npx playwright test fix-590-confirmed-pool-spec-name.spec.js` — 2 passed.
- Regression (pool/processing specs) — _result in Change Log._

### Completion Notes List

- `_augmentPoolWithSpecs` (`downtime-views.js:795`): built `fromSkillMap` from `isSpecs(char)`; each active spec renders `"Name (Skill)"` for cross-skill (IS) specs, plain `"Name"` for native. Early-return + total recompute preserved. `isSpecs`/`hasAoE` already imported (line 12).
- The three `.proc-pool-total` initial renders wrap `initTotalStr` with `_augmentPoolWithSpecs(initTotalStr, rev.active_feed_specs || [], char) || initTotalStr` (feeding + 2 project sites; `rev`/`char` in scope). Confirmed/disabled pools now show the named spec without a recalc.
- Sorcery total (`:7619`) left untouched (out of scope).
- Side benefit: the runtime recalc (`:6973`, same helper) now also shows the skill-qualified spec name.

### File List

- `public/js/admin/downtime-views.js` (modified — `_augmentPoolWithSpecs` qualifier; 3 `.proc-pool-total` initial renders)
- `tests/fix-590-confirmed-pool-spec-name.spec.js` (new — 2 Playwright tests)
- `specs/stories/feature.590.confirmed-pool-spec-name.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Confirmed dice pools now name the active specialisation (e.g. "Coward Punch (Stealth)") in `.proc-pool-total`: `_augmentPoolWithSpecs` gained the cross-skill `(Skill)` qualifier, and the initial pool-total render augments with `active_feed_specs` (so confirmed/disabled pools carry the names). New spec, 3 tests passing (cross-skill qualifier, no-spec unchanged, native-no-qualifier). Regression: pool/processing specs = 22 passed / 0 failed. Status → review.
