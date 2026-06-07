# Story Fix.594: DT dossier should read the target override-aware (not "Target not set" when it is set)

## Status: review

> **Fixed 2026-06-05.** One-block override-aware seed in `_renderSnapshotTargetIntel` mirroring #586. New spec `tests/fix-594-dossier-target-read.spec.js` — 2/2 pass (player-seeded target shows; ST clear → "Target not set"). ESM parse-check green. Regression run in parallel.

## Metadata
- issue: 594
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/594
- branch: morningstar-issue-594-dossier-target-read
- type: fix
- sibling-of: #586 (target picker pre-population) — this extends the same throughline to the intelligence dossier

---

## Story

**As** an ST resolving an investigate/attack action,
**I want** the "This Cycle" intelligence dossier to recognise the target that's shown in the picker,
**so that** I see the target's intel instead of a wrong "Target not set" message when a target is clearly set.

---

## Background

#586 made the processing target picker **pre-populate from the player's submitted target** (`entry.targetCharKeys`), without writing to `rev` until the ST touches it. But the intelligence dossier still reads the ST-saved `rev` field only, so it reports "Target not set — select a target above" while the picker shows the target (e.g. Ryan Ambrose). The message is both wrong and redundant.

### The exact site

`_renderSnapshotTargetIntel(entry)` (`downtime-views.js:8724-8735`):
```js
const rev = getEntryReview(entry);
const targetName = actionType === 'investigate'
  ? (rev?.investigate_target_char || '')
  : (rev?.attack_target_char || '');
if (!targetName) {
  return '<div class="proc-snap-ti-unset">Target not set — select a target above.</div>';
}
```
`targetName` is a `sortName()` key (lowercase). Downstream (`:8739-8744`) it is matched against `characters` / queue entries to show the target's cycle intel.

### Why the fix is clean

`entry.targetCharKeys` (added by #586 in `buildProcessingQueue`) is **already an array of `sortName` keys** — exactly the format `targetName` expects. So seeding `targetName` from `entry.targetCharKeys[0]` when the ST hasn't set `rev` needs no conversion; the existing match logic just works.

### Override-aware seed (mirror #586)

The picker uses `('field' in rev) ? rev.field : entry.targetCharKeys?.[0]` so the ST value wins once touched (incl. a deliberate clear to null), and the player target only seeds when untouched. The dossier must use the same predicate, NOT `||`/`??` (which would re-show the player target after the ST clears it).

---

## Acceptance Criteria

- [x] **AC1** — Player-seeded target shows in the dossier as "Target: Ryan Ambrose" (no "Target not set"). _(Test: "player-seeded target shows in the dossier".)_
- [x] **AC2 (override-aware)** — `targetName = (field in rev) ? (rev[field] || '') : (entry.targetCharKeys?.[0] || '')` — ST clear (rev field === null) → "Target not set"; player seeds only when the field is absent from rev. _(Test: "ST clear wins".)_
- [x] **AC3** — When neither player target nor ST value is present, the field is absent → seed is `''` → "Target not set" still shows.
- [x] **AC4** — `field` is computed for investigate/attack; the seed is a `sortName` key (`entry.targetCharKeys[0]`), so the downstream match (`:8739-8744`) resolves "Target: <name>" and finds the target's entries (no conversion).
- [x] **AC5** — `tests/fix-594-dossier-target-read.spec.js`, 2 tests pass.

---

## Tasks

### Task 1 — Seed the dossier target override-aware (AC1–AC4) — [x] DONE
In `_renderSnapshotTargetIntel` (`downtime-views.js:8728-8731`), replace the rev-only read with the #586 pattern:
```js
const rev = getEntryReview(entry) || {};
const field = actionType === 'investigate' ? 'investigate_target_char' : 'attack_target_char';
const targetName = (field in rev) ? (rev[field] || '') : (entry.targetCharKeys?.[0] || '');
```
Leave the downstream match (`:8737-8744`) and the "Target not set" empty-branch as-is — `targetName` is the same `sortName`-key shape either way.

### Task 2 — Test (AC5) — [x] DONE
New Playwright spec: investigate action with a player character target, ST untouched → dossier (`.proc-snap-target-intel`) shows "Target: Ryan Ambrose", no `.proc-snap-ti-unset`. With `projects_resolved[0].investigate_target_char = null` (ST cleared) → `.proc-snap-ti-unset` shows. Model the harness on `fix-586-target-prepopulate.spec.js`.

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js:8724-8744` — `_renderSnapshotTargetIntel` (the only edit site).
- `public/js/admin/downtime-views.js:3109`-ish — `entry.targetCharKeys` (sortName keys), added by #586.
- `tests/fix-586-target-prepopulate.spec.js` — harness + the override-aware mechanic to mirror.

### Must preserve / watch-outs
- Use `('field' in rev)`, NOT `||`/`??` — an ST clear must win (AC2). Same trap as #586.
- `entry.targetCharKeys` holds `sortName` keys (lowercase); the dossier's downstream match is lowercase too, so no case conversion is needed. Do not pass a display string or `_id`.
- `getEntryReview(entry)` may be null for a fresh action — default to `{}` before the `in` check.
- Decision (resolved): seed the dossier (preferred — message becomes accurate) rather than dropping the "Target not set" message. The message stays, but only for genuinely-unset targets.
- Investigate uses a flex target; for territory/other targets, `targetCharKeys` is `[]` → dossier shows "Target not set" (acceptable — the dossier is character-intel only; non-character targets surface via the card's "Submitted target" line from #586).

### References
- [Source: downtime-views.js:8724-8735] — dossier target read
- #586 — picker pre-population (`entry.targetCharKeys`, override-aware seed); `tests/fix-586-target-prepopulate.spec.js`
- #587/#595 (sibling smoke-surfaced fixes)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- ESM parse-check `downtime-views.js` — PASS.
- `npx playwright test fix-594-dossier-target-read.spec.js` — 2 passed.
- Regression (`downtime-processing.spec.js` + `fix-586-target-prepopulate.spec.js`) — _result in Change Log._

### Completion Notes List

- One-block change in `_renderSnapshotTargetIntel` (`downtime-views.js:8728-8731`): `rev` defaults to `{}`; `targetName = (field in rev) ? (rev[field] || '') : (entry.targetCharKeys?.[0] || '')` where `field` is `investigate_target_char`/`attack_target_char`. Mirrors #586's override-aware seed (presence check, not `||`/`??`, so an ST clear wins).
- No conversion needed: `entry.targetCharKeys` are `sortName` keys — exactly what the downstream match (`:8739-8744`) expects. The "Target not set" message and match logic are untouched.
- Per the resolved decision, seeded the dossier (message becomes accurate) rather than dropping it.

### File List

- `public/js/admin/downtime-views.js` (modified — `_renderSnapshotTargetIntel` target seed)
- `tests/fix-594-dossier-target-read.spec.js` (new — 2 Playwright tests)
- `specs/stories/fix.594.dossier-target-read.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — DT "This Cycle" dossier now reads the target override-aware (player-seeded via `entry.targetCharKeys`, ST value wins once touched), so it no longer shows "Target not set" when a target is set. New spec, 2 tests passing. Regression: downtime-processing + fix-586 = 19 passed / 0 failed. Status → review.
