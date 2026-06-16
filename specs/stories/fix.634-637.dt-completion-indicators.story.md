# Story Fix.634+637: DT/City completion-indicator fixes

## Status: review (both fixes + tests done; issue-24 + feat-16-17 41/0)

## Metadata
- issue: 634
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/634
- also_closes: 637 (https://github.com/angelusvmorningstar/TerraMortis/issues/637)
- branch: morningstar-issue-634-637-completion-indicators
- type: fix (PRODUCT — two small completion/feedback-indicator bugs found this session)

---

## Story

Two tiny, related "the indicator doesn't match reality" product bugs, both found while
working the test suite this session. Both have written fix directions.

---

## Fix A — #634: admin City "Saved" ambience feedback is wiped instantly

`saveTerrAmbience` (public/js/admin/city-views.js:686) sets `status.textContent = 'Saved'`
(:706) then immediately calls `patchTerritories(...)` (:707), which re-renders `#city-content`
from the template — recreating the `.city-save-status` span **empty** in the same tick. So the
"Saved" confirmation never becomes visible.

**Fix:** run `patchTerritories` FIRST, then re-query the (freshly-rendered) status span and set
"Saved" on it (with the existing 2s auto-clear, also re-querying on clear since the node may be
replaced again). Keep the re-render (it refreshes derived City displays).

**Test:** restore the feedback assertion in `tests/feat-16-17-fix44-tracker-feeding.spec.js`
(the dockyards Save test) — after clicking Save, assert `#terr-amb-status-dockyards` shows "Saved".

---

## Fix B — #637: personal_story completion tick requires the optional NPC name

`updateSectionTicks` (public/js/tabs/downtime-form.js:6560) has **no** `personal_story` rule, so
it uses the generic "all `.qf-field`s filled" fallback (:6688), which counts the
`#dt-personal_story_npc_name` field — labelled "**(optional)**". So a player who selects a kind
and fills the text (the real requirement) but leaves the name blank gets **no** completion tick,
even though the submit gate (`_hasPersonalStory` = `kind && text`, dt-completeness.js:38-54) is met.

**Fix:** add a `personal_story` branch to `updateSectionTicks` (alongside the other per-section
rules, before the fallback) mirroring `_hasPersonalStory`:
```js
if (key === 'personal_story') {
  const kindChecked = !!body.querySelector('input[name="dt-personal_story_kind"]:checked');
  const textEl = document.getElementById('dt-personal_story_text');
  tick.classList.toggle('visible', kindChecked && !!(textEl && textEl.value.trim()));
  return;
}
```

**Test:** update the #628 tick test in `tests/issue-24-story-freetext.spec.js`
("filling the personal-story section marks the tick visible") to fill **kind + text only**
(NOT the name), and rename to reflect kind+text suffices.

---

## Acceptance Criteria

- [ ] **AC1 (#634)** — After clicking a City "Save Ambience", `.city-save-status` shows "Saved" (visible), then clears after ~2s. Test asserts it.
- [ ] **AC2 (#637)** — Selecting a kind + filling the personal_story text shows the section tick with the name blank. Test asserts it (name not filled).
- [ ] **AC3** — `feat-16-17` and `issue-24` specs green; no other spec regresses.
- [ ] **AC4** — Product changes confined to the two indicator paths (city-views.js save handler; downtime-form.js updateSectionTicks). Nothing else.

---

## Tasks
1. **#634 product:** reorder `saveTerrAmbience` (patch → re-query status → set "Saved").
2. **#634 test:** add the `#terr-amb-status-dockyards` "Saved" assertion to the feat-16-17 dockyards Save test.
3. **#637 product:** add the `personal_story` branch to `updateSectionTicks`.
4. **#637 test:** update the issue-24 tick test to fill kind+text only (drop the name) + rename.
5. **Verify:** run feat-16-17 + issue-24 green.

## Dev Notes
- `public/js/admin/city-views.js:686-712` (`saveTerrAmbience`; status `:687/706`, patch `:707`).
- `public/js/tabs/downtime-form.js:6560` (`updateSectionTicks`; per-section branches + fallback `:6688`).
- `public/js/data/dt-completeness.js:38-54` (`_hasPersonalStory` = `kind && text`).
- British English. One Playwright run at a time. Two issues, one PR (Closes #634, #637).

---

## Dev Agent Record
### Agent Model Used
claude-opus-4-8

### Debug Log References
- `npx playwright test tests/issue-24-story-freetext.spec.js tests/feat-16-17-fix44-tracker-feeding.spec.js` → **41 passed / 0 failed** (5 + 36).

### Completion Notes List
- **#634 — done.** `saveTerrAmbience` (city-views.js): re-render via `patchTerritories` FIRST, then re-query `#terr-amb-status-<id>` and set "Saved" (2s clear re-queries the node). Feedback now persists. Error path untouched (it runs before the re-render). Test: the feat-16-17 dockyards Save test asserts `#terr-amb-status-dockyards` shows "Saved".
- **#637 — done.** Added a `personal_story` branch to `updateSectionTicks` (downtime-form.js) mirroring `_hasPersonalStory` (`kind && text`), before the generic fallback — so the tick no longer requires the optional NPC name. Test: the issue-24 tick test now fills kind+text only (name blank) and still ticks.
- **AC1-AC4 ✅.** Two indicator paths only; both specs green; no regression.

### File List
- public/js/admin/city-views.js (#634 — re-render then set "Saved")
- public/js/tabs/downtime-form.js (#637 — personal_story tick rule)
- tests/feat-16-17-fix44-tracker-feeding.spec.js (#634 feedback assertion)
- tests/issue-24-story-freetext.spec.js (#637 tick test — name optional)
- specs/stories/fix.634-637.dt-completion-indicators.story.md (this story)

### Change Log
- 2026-06-06 — fix.634+637: City "Saved" feedback now persists (re-render before status set); personal_story tick matches the submit gate (kind && text, not the optional name). 41/0 green.
