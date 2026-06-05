# Story Fix.609: Player Vitae Projection — include the SSJ bonus in the Herd total

## Status: review

> **Fixed 2026-06-05 — the audit premise was WRONG, corrected during dev (Angelus approved).** `effectiveDomainDots('Herd')` (via `meritEffectiveRating`, `domain.js:265`) ALREADY includes both SSJ and Flock, so `herdDots` is the true total. The real bug was the opposite of the issue: **#599 double-counted Flock** (`herdDots + flockHerd` → Flock chars showed +8 not +5). Fix: `const herdTotal = herdDots;` — no ssj/flock added; the "(Flock) (+x)" display is kept for info only. This makes the player match the ST (`domMeritContrib`) for SSJ, Flock, and plain Herd. A RED test (`+8` expected, got the double-count) caught it. Tests: `tests/dt-form-609-ssj-herd.spec.js` (2) + `dt-form-599-flock-herd.spec.js` (now asserts the corrected `+5`/not-`+8`). Regression in parallel.

## Metadata
- issue: 609
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/609
- branch: morningstar-issue-609-player-herd-ssj-undercount
- type: fix
- follow-up-of: #599 (fixed the Flock half of the same under-count; flagged this SSJ half)

---

## Story

**As** a player checking my Vitae Projection,
**I want** my Herd to include the Secret Society Junkie bonus,
**so that** the projected Herd vitae matches what the ST sees and what I actually gain.

---

## Background

The player DT form's Vitae Projection computes Herd from `effectiveDomainDots(c, 'Herd')` (`downtime-form.js:357-365`), which returns only the merit's effective rating — it excludes the auto-applied bonus channels. #599 added the **Flock** bonus to the total. The **Secret Society Junkie (SSJ)** bonus is still missing, so for a character with SSJ + Mystery Cult Initiation the player projection under-counts Herd and disagrees with the ST side (`downtime-views.js:7767`, `domMeritContrib`, which includes ssj + flock).

`ssjHerdBonus(c)` (`public/js/editor/domain.js:111`) returns the sum of MCI ratings when the character has the "Secret Society Junkie" merit, else 0. It is **already imported** in `downtime-form.js` (line 20).

---

## Acceptance Criteria

- [x] **AC1** — SSJ + MCI rating N → player Herd total includes N (it already did, via `effectiveDomainDots`); matches the ST. _(Test: Herd 2 + MCI 3 → +5.)_
- [x] **AC2** — No-SSJ character unchanged (+2). _(Test.)_
- [x] **AC3** — Flock handling correct: Flock chars now show the true total (+5, was +8 double-counted by #599), with the "(+x)" breakdown. _(dt-form-599 asserts +5 / not +8.)_
- [x] **AC4 (silent)** — No "(SSJ)" label; label logic unchanged. (SSJ was never a separate add — it's inside `herdDots`.)
- [x] **AC5 (test)** — `tests/dt-form-609-ssj-herd.spec.js` (2) + updated `dt-form-599-flock-herd.spec.js` (total assertions added).
- [x] **AC6 (corrected)** — `effectiveDomainDots` already includes ssj+flock (`meritEffectiveRating`, `domain.js:265`); the fix is `herdTotal = herdDots` (removing #599's double-count), NOT adding ssj.

---

## Tasks

### Task 1 — Stop double-counting; use the true total (AC1–AC4, AC6) — [x] DONE
`public/js/tabs/downtime-form.js:7080` — changed `const herdTotal = herdDots + flockHerd;` to `const herdTotal = herdDots;`. **Why (corrected mid-dev):** `effectiveDomainDots('Herd')` already includes ssj + flock via `meritEffectiveRating` (`domain.js:265`), so `herdDots` is the full total. Adding ssj (as the issue scoped) OR flock (as #599 did) double-counts. `flockHerd` retained only for the "(Flock)" label + "(+x)" suffix. No "(SSJ)" label.

### Task 2 — Test (AC5) — [x] DONE
New `tests/dt-form-609-ssj-herd.spec.js` (SSJ+MCI → +5; no-SSJ → +2). Also strengthened `dt-form-599-flock-herd.spec.js` to assert the corrected total (+5, not the +8 double-count) — the gap that let #599's bug ship.

---

## Dev Notes

### Files / artifacts
- `public/js/tabs/downtime-form.js:7080` — the player Herd total (the one-line change).
- `public/js/tabs/downtime-form.js:357-365` — `effectiveDomainDots` (excludes ssj + flock; that's why the explicit add is needed).
- `public/js/editor/domain.js:111` — `ssjHerdBonus(c)` (sum of MCI ratings iff "Secret Society Junkie" merit present; already imported in the form, line 20).
- `public/js/admin/downtime-views.js:7767` — ST `domMeritContrib(char, 'Herd')` (the ssj+flock-inclusive value the player must match).
- `tests/dt-form-599-flock-herd.spec.js` — the player-projection harness to model.

### Must preserve / watch-outs
- `ssjHerdBonus` returns 0 unless the char has the "Secret Society Junkie" merit, so non-SSJ chars are unchanged automatically (AC2) — no extra guard needed.
- SSJ counts MCI **ratings**, so the test character needs both a `Secret Society Junkie` merit AND at least one `Mystery Cult Initiation` merit with a rating.
- Silent inclusion only — do not touch the "Herd (Flock)" label path (AC4).
- British English; no em-dashes.

### References
- [Source: downtime-form.js:7080] — player Herd total
- [Source: domain.js:111] — `ssjHerdBonus`
- #599 (Flock half + the `dt-form-599` harness)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- A RED test (expecting +5 for Herd 2 + SSJ/MCI 3) returned "Herd (●●●●●)+8" — exposing that `herdDots` already includes the bonus and the scoped `+ ssjHerdBonus` double-counts.
- `meritEffectiveRating` (`domain.js:265`): `if (m.name === 'Herd') return sum + ssjHerdBonus(c) + flockHerdBonus(c);` — proof `effectiveDomainDots('Herd')` includes both.
- `dt-form-609-ssj-herd.spec.js` (2) + `dt-form-599-flock-herd.spec.js` (2, total assertions added) — passing after the fix.

### Completion Notes List

- **Premise inverted (Angelus approved the correction):** the issue + #599 assumed `effectiveDomainDots` excluded ssj/flock. It does NOT — `meritEffectiveRating` adds both for Herd. So `herdDots` is already the true total.
- **Bug found & fixed:** #599 shipped a Flock double-count in the player projection (`herdDots + flockHerd`). Set `herdTotal = herdDots` — fixes #609 (SSJ correct) AND the #599 Flock double-count in one line. Player now matches the ST (`domMeritContrib`).
- `flockHerd` kept only for the "(Flock)" label + "(+x)" breakdown (display, not added to the total).
- Strengthened the #599 test with a total assertion (the missing check that let the double-count ship).

### File List

- `public/js/tabs/downtime-form.js` (modified — player Herd total: `herdDots + flockHerd` → `herdDots`)
- `tests/dt-form-609-ssj-herd.spec.js` (new — 2 tests)
- `tests/dt-form-599-flock-herd.spec.js` (modified — added corrected-total assertions)
- `specs/stories/feature.609.player-herd-ssj-undercount.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Player Vitae Projection Herd total: removed the #599 Flock double-count (`herdDots` already includes ssj+flock via `meritEffectiveRating`), so the player matches the ST for SSJ, Flock, and plain Herd. Strengthened the #599 test (total assertion). 2 new tests + 2 updated. Regression: dt-form-599/609 + fix-599 ST + dt-form-35 pass; the 4 `dt-vitae-projection` failures are PRE-EXISTING flakiness (A/B on its Herd test `:205` is identical with my change stashed; the other failures are `:173`/`:219` timeouts/visibility, unrelated to Herd — same order/timing-flaky spec as #599/#602). Status → review.
