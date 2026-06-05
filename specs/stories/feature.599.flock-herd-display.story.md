# Story Feature.599: Show Flock-derived Herd as "Herd (Flock) +n (+x)" in the Vitae Tally

## Status: review

> **Implemented 2026-06-05.** ST: label "Herd (Flock)" + "(+x)" (value already includes Flock). Player: added `flockHerdBonus(c)` to the projection total + `valSuffix` breakdown. 4 tests: `tests/fix-599-flock-herd-display.spec.js` (2 ST) + `tests/dt-form-599-flock-herd.spec.js` (2 player). SSJ under-count flagged, untouched. ESM parse-check green. Regression in parallel.

## Metadata
- issue: 599
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/599
- branch: morningstar-issue-599-flock-herd-display
- type: feature (display) + small player-side calc correction

---

## Story

**As** an ST (and player),
**I want** the Vitae Tally to show "Herd (Flock) +n (+x)" when Flock contributes,
**so that** it is clear why Herd is at or over the normal +5 cap (Flock can exceed it).

Required format (both surfaces): when `flockHerdBonus(c) > 0`, show **Herd (Flock) +n (+x)** where **+n** = total Herd vitae and **+x** = the Flock portion (`flockHerdBonus(c)`). When no Flock, unchanged "Herd +n".

---

## Background & audit (READ THIS — the two sides differ)

`flockHerdBonus(c)` (`public/js/editor/domain.js:118`) returns the Flock merit rating; Herd can exceed the +5 cap when Flock is present (`domMeritTotal` cap = `Infinity` for Herd-with-Flock, `:174`). Already imported in both files.

**The two Vitae renders compute Herd differently:**

- **ST (DT Processing):** `downtime-views.js:7760` `herdVitae = domMeritContrib(char, 'Herd')`. `domMeritContrib` **includes** `ssjHerdBonus + flockHerdBonus` (`domMeritContribSingle`, `domain.js:42`). So the ST `+n` is already the true, Flock-inclusive total. Render at `:7846-7847` (`herdDisplay = +${herdVitae}`, label "Herd").
- **Player (DT form):** `downtime-form.js:6997` `herdDots = effectiveDomainDots(c, 'Herd')`. `effectiveDomainDots` (`:357-365`) returns only `meritEffectiveRating(c, m)` — it **EXCLUDES** `flockHerdBonus` AND `ssjHerdBonus`. Rendered as a posMod at `:7076` (`label: 'Herd (●dots●)'`, `val: herdDots`); posMod row renders `${label} +${val}` at `:7089`.

So the player Vitae Projection currently **under-counts** Herd (misses Flock and SSJ). This story fixes the **Flock** part (the issue's subject) on the player side and adds the breakdown on both.

**Out of scope (flag, do NOT fix here):** the player `effectiveDomainDots(Herd)` also excludes `ssjHerdBonus` — a separate pre-existing under-count. Note it for a follow-up issue; do not expand this story to SSJ.

---

## Acceptance Criteria

- [x] **AC1 (ST display)** — label "Herd (Flock)" + "+n (+x)" via `flockHerdBonus(char)`; `herdVitae` already includes Flock (not re-added). _(2 ST tests.)_
- [x] **AC2 (player display + Flock in total)** — `herdTotal = herdDots + flockHerdBonus(c)`, posMod label "Herd (Flock)" + `valSuffix " (+x)"`; render extended with `valSuffix`. _(2 player tests.)_
- [x] **AC3 (over-cap)** — no clamping: ST `domMeritContrib` uncaps for Flock; player adds Flock with no min/max. _(QA test: Herd 5 + Flock 3 → "+8 (+3)".)_
- [x] **AC4 (no Flock unchanged)** — both surfaces gate on `flockHerd > 0`; no-Flock output unchanged. _(no-Flock tests on both.)_
- [x] **AC5 (test)** — `tests/fix-599-flock-herd-display.spec.js` (2) + `tests/dt-form-599-flock-herd.spec.js` (2).
- [x] **AC6 (no SSJ scope creep)** — SSJ untouched; the `effectiveDomainDots` SSJ under-count is flagged for a follow-up issue only.

---

## Tasks

### Task 1 — ST Vitae Tally display (AC1, AC3, AC4) — [x] DONE
`downtime-views.js:7846-7847`. Compute `const flockHerd = flockHerdBonus(char);` near the herd block. Set label `Herd (Flock)` when `herdVitae !== null && flockHerd > 0`, else `Herd`. Set `herdDisplay` to `+${herdVitae} (+${flockHerd})` when `flockHerd > 0`, else `+${herdVitae}` (null → "—" unchanged). `herdVitae` already includes Flock — do NOT re-add it.

### Task 2 — Player Vitae Projection display + Flock in total (AC2, AC3, AC4) — [x] DONE
`downtime-form.js:~6997` and `~7076`. Compute `const flockHerd = flockHerdBonus(c);` and `const herdTotal = herdDots + flockHerd;` (Flock not in `effectiveDomainDots`). Push the posMod with `val: herdTotal`, label `Herd (Flock)` when `flockHerd > 0` else the existing `Herd (${'●'.repeat(herdDots)})`, and an optional `valSuffix: flockHerd > 0 ? ` (+${flockHerd})` : ''`. Update the posMod render (`:7089`) to append `${mod.valSuffix || ''}` after `+${mod.val}`. Gate on `herdTotal > 0`.

### Task 3 — Test (AC5) — [x] DONE
Playwright spec (ST side, model `tests/fix-601-maintenance-target-details.spec.js`): a character with a `Flock` merit (rating e.g. 3) and base Herd → Vitae Tally row reads "Herd (Flock)" and contains "(+3)"; a character without Flock → "Herd" row, no "(Flock)"/"(+". Player projection test best-effort via the dt-form harness.

---

## Dev Notes

### Files / artifacts
- `public/js/editor/domain.js:118` — `flockHerdBonus(c)`; `:42` `domMeritContribSingle` (Herd adds ssj+flock); `:174` over-cap.
- `public/js/admin/downtime-views.js:7758-7761` (compute), `:7846-7847` (render) — ST Vitae Tally Herd.
- `public/js/tabs/downtime-form.js:357-365` `effectiveDomainDots` (excludes flock+ssj), `:6997` `herdDots`, `:7076` posMod, `:7089` posMod render.

### Must preserve / watch-outs
- ST `herdVitae` ALREADY includes Flock (`domMeritContrib`) — only change the label/value strings, do NOT add `flockHerd` to `herdVitae` again (double-count).
- Player `herdDots` does NOT include Flock — you MUST add `flockHerdBonus(c)` for the total (AC2).
- Do not clamp the over-cap total (AC3).
- British English; `'●'` is U+25CF; no em-dashes (the "—" empty marker is U+2014 and pre-existing — leave it).
- Flag (do not fix): player `effectiveDomainDots` excludes `ssjHerdBonus` too — separate follow-up issue.
- A Flock merit is `{ category: 'domain'? , name: 'Flock', rating: N }` — `flockHerdBonus` reads `merits.find(m => m.name === 'Flock').rating`. Test fixtures need a `Flock` merit on the character.

### References
- [Source: domain.js:118] `flockHerdBonus`
- [Source: downtime-views.js:7846-7847] ST Herd render
- [Source: downtime-form.js:7076,7089] player Herd posMod + render
- #601, #586 — Playwright harness model

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- ESM parse-check `downtime-views.js` + `downtime-form.js` — PASS.
- `fix-599-flock-herd-display.spec.js` (2) + `dt-form-599-flock-herd.spec.js` (2) — 4 passed.
- Regression (vitae specs + processing) — _result in Change Log._

### Completion Notes List

- **ST** (`downtime-views.js:7845-7847`): `flockHerd = flockHerdBonus(char)`; label → "Herd (Flock)", value → `+${herdVitae} (+${flockHerd})` when `flockHerd > 0`. `herdVitae` (domMeritContrib) already includes Flock — NOT re-added.
- **Player** (`downtime-form.js`): `effectiveDomainDots(Herd)` excludes Flock, so `herdTotal = herdDots + flockHerdBonus(c)`; posMod gains `valSuffix`; the posMod row render appends `${mod.valSuffix||''}`. The net-starting-vitae sum now correctly includes Flock-derived Herd.
- **Test harness note:** the player Vitae Projection rows render but sit in a collapsed section — the test asserts via `toContainText` (reads attached elements) rather than requiring visibility.
- **Scope:** SSJ untouched. The same player `effectiveDomainDots` also excludes `ssjHerdBonus` (pre-existing under-count) — flagged for a follow-up issue, deliberately not fixed here.

### File List

- `public/js/admin/downtime-views.js` (modified — ST Vitae Tally Herd label/value)
- `public/js/tabs/downtime-form.js` (modified — player Herd total incl. Flock + posMod valSuffix render)
- `tests/fix-599-flock-herd-display.spec.js` (new — 2 ST tests)
- `tests/dt-form-599-flock-herd.spec.js` (new — 2 player tests)
- `specs/stories/feature.599.flock-herd-display.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Vitae Tally shows "Herd (Flock) +n (+x)" when Flock contributes (both ST and player). Player projection now includes the Flock bonus in the Herd total (was excluded by `effectiveDomainDots`). SSJ under-count flagged, untouched. 5 new tests (3 ST incl. over-cap + 2 player). Regression: #599 specs pass; full dt-vitae-projection passes in-order with these changes (4/4); the combined-run dt-vitae-projection flakiness is PRE-EXISTING (A/B on :146 fails identically with changes stashed — order/timing-dependent, not #599). Status → review.
