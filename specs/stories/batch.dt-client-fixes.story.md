---
issues: [512, 463, 248]
also_closes: []
branch: morningstar-batch-dt-client-fixes
---

# Story batch.dt-client-fixes: client-side DT cluster (#512, #463, #248)

**Status:** review
**Date:** 2026-06-01
**Branch:** morningstar-batch-dt-client-fixes
**Issues:** [#512](https://github.com/angelusvmorningstar/TerraMortis/issues/512), [#463](https://github.com/angelusvmorningstar/TerraMortis/issues/463), [#248](https://github.com/angelusvmorningstar/TerraMortis/issues/248)

---

## Summary

A batch of three small, independent client-side fixes, done on one branch with one PR. (A fourth candidate, #473, was found already fixed — see below.)

---

## #512 — Carthian Pull write failure no longer snaps to Contacts

**Problem:** when a Herd/Haven allocation write failed (e.g. a 404 in an environment whose API lacks the endpoint), `renderCarthianPullSection` fell back to a stale `saved['carthian_pull_target']` left by an earlier *deferred* Contacts selection — so the dropdown silently "reverted to Contacts", masking the failure.

**Fix (`public/js/tabs/downtime-form.js`, `_writeCarthianAllocation`):**
- On write failure, `showToast(...)` surfaces the error instead of failing silently.
- After **any** write attempt (success or failure), the pending-defer marker (`responses.carthian_pull_target`/`_sphere`) is cleared, so the section reflects the character's actual state — the bonus merit on success, or **None** on failure — never a stale saved target.

**Note:** the underlying write failure on the dev site is a deploy-topology matter (the dev frontend proxies `/api/*` to the production API, which lacks the endpoint until `main` is deployed). This story fixes the client robustness only; reachability is a deploy decision.

## #463 — rename Archive nav tab → Story + new icon

**Fix (`public/js/app.js`, `NAV_ITEMS`):** label `Archive` → `Story`; icon swapped to an open-book SVG. `id` stays `archive` (no routing/DOM/API change), per the issue scope.

## #248 — rename `buildFeedingPool` third parameter `ambienceMod` → `stMod`

**Fix (`public/js/admin/downtime-views.js`):** the parameter is the ST manual feeding modifier (a dice-pool adjustment), never territory ambience. Renamed the parameter + its body use (`const amb = stMod || 0`) and rewrote the explanatory comment. Pure rename — no behaviour change; the dice math is unchanged. The remaining `ambienceMod` identifiers in the file are unrelated territory-data fields.

---

## #473 — found ALREADY FIXED (do not re-dev)

While scoping the batch I found #473 ("Feeding custom pool leaves roll area blank") is already implemented by commit `ec70285 fix(#473): custom pool feeding submission renders roll area correctly`:
- Write-side: `downtime-form.js:435` sets `_feed_method = feedCustomAttr ? 'other' : ''`.
- Read-side: `feeding-tab.js:189-200` builds a synthetic "Custom Pool" method when `_feed_method` is absent/`'other'` but `_feed_custom_attr` is set, so the roll area renders.

**Recommendation:** verify in-app and close #473; it needs no new code. (On `dev`; live once `main` deploys.)

---

## Acceptance Criteria

- [x] #512: a failed Carthian Pull write surfaces a toast and reverts the dropdown to the character's actual state (None), never a stale saved target.
- [x] #463: the player nav tab reads "Story" with a narrative icon; `id` remains `archive`.
- [x] #248: `buildFeedingPool`'s parameter is `stMod`; no behaviour change; no stray `ambienceMod` parameter references remain.

## Tasks / Subtasks

- [x] **#512** — `_writeCarthianAllocation`: toast on failure + clear pending-defer marker after any write attempt.
- [x] **#463** — `NAV_ITEMS` archive entry: label → Story, icon → open book.
- [x] **#248** — rename `ambienceMod` → `stMod` (signature, body, comment).
- [x] **Tests** — `tests/issue-512-carthian-write-failure.spec.js` (failed write → None + toast). #463/#248 are label/rename changes verified by parse-check + grep; carthian (8) + DT smoke (16) regression green.

## Dev Agent Record

### File List
- `public/js/tabs/downtime-form.js` — #512 robustness in `_writeCarthianAllocation`
- `public/js/app.js` — #463 nav label + icon
- `public/js/admin/downtime-views.js` — #248 parameter rename + comment
- `tests/issue-512-carthian-write-failure.spec.js` — new, 1 Playwright test
- `specs/stories/sprint-status.yaml` — registration

### Change Log
- 2026-06-01 — Batch dev of #512 (carthian write robustness), #463 (Archive→Story), #248 (param rename). #473 found already fixed (ec70285) — recommend close, no code. 1 new Playwright test; carthian (8) + DT smoke (16) regression green. Status → review.

---

## QA Results (Quinn, claude-opus-4-8)

**Verdict: PASS** — all three fixes verified against the shipped diff; #473 confirmed already fixed.

### #512 — write-failure robustness
- The defer branch `return`s **before** the new clear block, so deferring Allies/Contacts still persists its pending target (sphere dropdown stays). ✓
- On **success**, the section derives `curTarget` from the bonus merit (`find(free_carthian)`), so clearing the `saved` audit copy loses nothing; the next `collectResponses` repopulates it from the DOM. Carthian happy-path regression (8/8) confirms no breakage. ✓
- On **failure**, `showToast` surfaces the error and the cleared marker makes the dropdown revert to the character's actual state (None) — not stale Contacts. New `issue-512-…spec.js` proves it (simulates a 404). ✓
- Minor (non-blocking): if the server returned a non-array `merits`, the guard skips the update; only matters for a malformed response, which the real endpoint never sends.

### #248 — parameter rename
Pure rename: signature `ambienceMod`→`stMod`, the single body use (`const amb = stMod || 0`), and the comment. `amb` drives all downstream math unchanged → byte-identical behaviour. The remaining `ambienceMod` identifiers in the file are unrelated territory-data fields (`td.ambienceMod`, `terrRec.ambienceMod`, `confirmed_ambience`), not the parameter. ✓ (`buildFeedingPool` is not exported, so no dedicated test — review + parse-check suffice for a no-op rename.)

### #463 — Archive → Story
Only `label` and `icon` changed; `id: 'archive'` and `section: 'player'` are intact, so routing, DOM IDs, and `archive-tab.js`/API are untouched (per the issue's explicit scope). ✓

### #473 — already fixed
`git merge-base --is-ancestor ec70285 HEAD` ✓ — the fix is on this branch (write-side `_feed_method` sentinel + read-side synthetic "Custom Pool" fallback). **No code needed; recommend verifying in-app and closing #473.**

### Findings (non-blocking)
1. **[Low/coverage]** #463/#248 have no dedicated automated tests (a label string and a non-exported pure rename); covered by diff review + parse-check.

### Test coverage
- `tests/issue-512-carthian-write-failure.spec.js` — **1/1**.
- Regression: carthian #508/#510 (8) + DT player smoke (16) green.
