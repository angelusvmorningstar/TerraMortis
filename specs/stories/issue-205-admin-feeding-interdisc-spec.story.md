# Story issue-205: Admin feeding-detail spec-validity narrower than canonical (interdisciplinary specs not honoured)

Status: review

issue: 205
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/205
branch: morningstar-issue-205-admin-feeding-interdisc-spec

---

## Story

As the ST reviewing a player's submitted feeding action in the admin downtime panel,
I want the spec bonus in the feeding-detail breakdown to honour interdisciplinary specs
(specs from a different skill that the player legally applies to the feeding skill),
So that the admin pool total matches the player-side advanced feeding view and I can
trust the displayed dice count without doing the adjustment in my head.

---

## Diagnosis

`public/js/admin/downtime-views.js` lines 949-956 compute the spec bonus for the
admin feeding-detail breakdown (the `buildFeedingPool` helper, called from
`renderFeedingDetail`):

```js
// CURRENT (buggy)
let specBonus = 0;
const playerSpec = picks.spec || '';
if (playerSpec && bestSkillName) {
  const sk = char.skills?.[bestSkillName];
  if (sk?.specs?.includes(playerSpec)) {
    specBonus = (sk.nine_again || hasAoE(char, playerSpec)) ? 2 : 1;
  }
}
```

The condition `sk?.specs?.includes(playerSpec)` only matches if the spec lives on
the same skill as `bestSkillName`. An interdisciplinary spec (one from a different
skill, granted via the Interdisciplinary merit or a speciality on another skill) is
never in `sk.specs`, so `specBonus` stays 0 even though the player legitimately
earns the bonus.

The canonical implementation in `public/js/data/feeding-pool.js` (post-PR #191,
lines 117-127) correctly widens the guard:

```js
const interdisciplinary = isSpecs(char).some(({ spec: s }) =>
  String(s).toLowerCase() === String(spec).toLowerCase()
);
if (skillSpecs.includes(spec) || interdisciplinary || hasAoE(char, spec)) {
  specBonus = hasAoE(char, spec) ? 2 : 1;   // post-PR #267: AoE-only predicate
}
```

`isSpecs` is already imported at `downtime-views.js:12`. The predicate also still
carries the stale `sk.nine_again` term; post-PR #267 that was removed from
feeding-pool.js — this fix brings admin into alignment.

---

## Acceptance Criteria

**AC-1 — Native spec still awards bonus**
Given a character whose feeding skill has the submitted spec in its own `specs` array,
When the admin feeding-detail panel renders,
Then the spec bonus (+1 or +2) is shown and the pool total includes it.

**AC-2 — Interdisciplinary spec awards bonus**
Given a character with an interdisciplinary spec (spec resides on a different skill)
that they submitted for the feeding action,
When the admin feeding-detail panel renders,
Then the spec bonus (+1 or +2) is shown, matching the player-side advanced feeding view.

**AC-3 — AoE spec awards +2, non-AoE awards +1**
Given a character with a valid spec (native or interdisciplinary),
When the spec is an Area-of-Expertise spec (`hasAoE` returns true), Then specBonus = 2.
When the spec is not AoE, Then specBonus = 1.
(Consistent with post-PR #267 AoE-only predicate; `nine_again` no longer a factor.)

**AC-4 — No valid spec: bonus stays 0**
Given a character where the submitted spec is neither native, interdisciplinary,
nor AoE,
When the admin feeding-detail panel renders,
Then specBonus = 0 (no spurious bonus).

**AC-5 — Player and admin pool totals match**
Given any character/spec combination,
The pool total in the admin feeding-detail panel equals what
`renderFeedPoolSelector` shows for the same character and spec in the player view.

---

## Tasks / Subtasks

- [x] T1 — Update `buildFeedingPool` in `downtime-views.js` (lines 949-956)
  - [x] Add `interdisc` guard using `isSpecs(char)`
  - [x] Expand `if` condition to include `interdisc || hasAoE(char, playerSpec)`
  - [x] Remove stale `sk.nine_again` term from spec-bonus predicate
  - [x] Update stale comment at line 946-948 to reflect new logic

---

## Dev Notes

### Single change site

Only `public/js/admin/downtime-views.js` lines 949-956. `isSpecs` is already imported
at line 12 — no import changes needed.

### Before → After

```js
// BEFORE (lines 949-956)
let specBonus = 0;
const playerSpec = picks.spec || '';
if (playerSpec && bestSkillName) {
  const sk = char.skills?.[bestSkillName];
  if (sk?.specs?.includes(playerSpec)) {
    specBonus = (sk.nine_again || hasAoE(char, playerSpec)) ? 2 : 1;
  }
}

// AFTER
let specBonus = 0;
const playerSpec = picks.spec || '';
if (playerSpec && bestSkillName) {
  const sk = char.skills?.[bestSkillName];
  const interdisc = isSpecs(char).some(({ spec: s }) =>
    String(s).toLowerCase() === String(playerSpec).toLowerCase()
  );
  if (sk?.specs?.includes(playerSpec) || interdisc || hasAoE(char, playerSpec)) {
    specBonus = hasAoE(char, playerSpec) ? 2 : 1;
  }
}
```

Also update the comment block above this section (lines 946-948):
```js
// BEFORE:
// Spec bonus: +2 if Area-of-Expertise / nine-again, +1 otherwise. Only
// counts when the player's picked spec is on the method-derived best
// skill (matches feeding-pool.js).

// AFTER:
// Spec bonus: +2 if Area-of-Expertise spec, +1 otherwise. Accepts native,
// interdisciplinary, or AoE specs (mirrors feeding-pool.js post-PR #267).
```

### Canonical reference

`public/js/data/feeding-pool.js` lines 117-127 — authoritative implementation.
`isSpecs(c)` returns `Array<{ skill, spec }>` for all interdisciplinary specs the
character owns. Defined in `public/js/data/helpers.js`.

### Nine-again removal

The `sk.nine_again` term was already removed from `feeding-pool.js` in PR #267.
This fix brings `downtime-views.js` into parity. `nine_again` on a skill grants
nine-again to the roll, not an extra die to the pool — it was never a valid
spec-bonus trigger.

### Scope

Admin `downtime-views.js` only. Player-side `renderFeedPoolSelector` is already
correct (uses `feeding-pool.js`). No API, schema, or test-framework changes needed.

---

## Verification

### Commands

```
node --input-type=module --check < public/js/admin/downtime-views.js
```

### Manual

1. In admin downtime panel, open a submitted feeding action where the player picked
   a spec that is on a different skill (interdisciplinary).
2. Confirm the spec bonus row in the pool breakdown shows +1 or +2 (not 0).
3. Compare with the player-side advanced feeding view for the same submission —
   totals must match.
4. Repeat with a character that has only native specs — confirm those still show
   the correct bonus (regression guard).

---

## Dev Agent Record

### Completion Notes

T1 complete. Added `interdisc` check via `isSpecs(char)` (already imported); widened
the `if` guard to `sk?.specs?.includes || interdisc || hasAoE`; removed stale
`sk.nine_again` term from predicate (AoE-only post-PR #267); updated comment block.
Single change site: `downtime-views.js` lines 946-958. Syntax check clean.

### File List

- public/js/admin/downtime-views.js

### Change Log

- 2026-05-12 — Implemented fix for issue #205: widened spec-validity guard to include
  interdisciplinary specs; removed nine_again predicate; updated comment.
