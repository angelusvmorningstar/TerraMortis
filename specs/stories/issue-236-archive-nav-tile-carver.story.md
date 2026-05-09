# Story issue-236: Archive nav tile missing for player Carver

Status: review

issue: 236
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/236
branch: morningstar-issue-236-archive-nav-tile-carver

---

## Story

As a player using the Player Portal sidebar more-grid,
I want the **Archive** tile to appear in the Player section,
So that I can open the Archive tab and review my dossier, published downtime outcomes, and retired-character history — the same content the ST already sees when reviewing my view.

The reported trigger: player Carver cannot see the Archive tile; ST sees it (and Carver's archive content) directly.

---

## Diagnosis

The Archive tile at `public/js/app.js:1423` is registered with `condition: 'hasArchive'`. The `_moreGridCondition` evaluator at `:1449-1452` resolves `hasArchive` as `!!(myChar && myChar._has_archive)`.

A grep across `server/` and `public/` shows `_has_archive` is **read at exactly one site (app.js:1451) and set nowhere**. Neither the API enriches it onto character payloads, nor does any client-side code populate it. So the gate evaluates to `false` for every player session, every character.

ST sessions bypass via the unconditional override at `app.js:1437`:
```js
// STs see all conditional apps — conditions only gate player view
if (getRole() === 'st') return true;
```

That's why ST sees the tile and players don't, regardless of who the character is.

**Compounding:** per the DTLT-9 work (mentioned in sprint-status notes), the Archive tab now reads from three sources: `archive_documents`, published `downtime_submissions`, and `retiredChars`. The `_has_archive` flag was designed when only `archive_documents` was the data source. Even if the flag had ever been populated, it would now miss most of what the tab actually shows.

**Tab empty-state already exists.** `public/js/tabs/archive-tab.js:101-103` renders `<p class="placeholder-msg">Nothing archived yet.</p>` when the three sources return zero content. So an unconditionally-shown tile gracefully self-handles the no-content case.

---

## Acceptance Criteria

**AC-1 — Player Carver sees the Archive tile**
Given player Carver is logged in directly,
When the Player Portal sidebar more-grid renders,
Then the **Archive** tile appears in the Player section.

**AC-2 — Archive tile opens the tab and renders Carver's content**
Given the Archive tile is visible to Carver,
When Carver clicks it,
Then the Archive tab loads and renders Carver's content — dossier (if any) + published downtime outcomes + retired peers.

**AC-3 — All players see the tile, regardless of content**
Given any player session (not just Carver),
When the sidebar more-grid renders,
Then the Archive tile is visible. Players with no archive content (no dossier, no published outcomes, no retired peers) see the existing "Nothing archived yet." placeholder when they open the tab.

**AC-4 — ST view unchanged**
Given an ST is viewing player.html (their own player session, or another character via ST tooling),
When the sidebar more-grid renders,
Then the Archive tile is still visible (ST has always seen it via the role bypass at `app.js:1437`).

**AC-5 — Other conditional tiles still gate correctly**
Given a player has no Regency (no territory regent_id matches their character) and no court office (no `court_category`),
When the sidebar more-grid renders,
Then the Regency and Office tiles remain hidden as before. Only the Archive tile's gating changes.

**AC-6 — Parse-check passes**
`node --input-type=module --check < public/js/app.js` returns no errors.

---

## Tasks

- [x] **Task 1 — Remove the `hasArchive` condition from the tile registration**
  - [x] In `public/js/app.js:1423`, remove `, condition: 'hasArchive'` from the Archive tile entry. The tile remains registered with `id: 'archive', label: 'Archive', icon: ..., section: 'player'`. *Implemented: tile entry now has only `id`, `label`, `icon`, `section`.*

- [x] **Task 2 — Remove the `hasArchive` branch from `_moreGridCondition`**
  - [x] In `public/js/app.js:1449-1452`, delete the `if (app.condition === 'hasArchive') { ... }` block. The function falls through to `return true` for any tile without a condition (existing pattern). *Implemented: the four-line block removed; `_moreGridCondition` now ends with the `hasOffice` branch followed by the catch-all `return true`.*

- [x] **Task 3 — Parse-check (AC-6)**
  - [x] `node --input-type=module --check < public/js/app.js` — confirm clean parse. *Verified: parse OK.*

- [ ] **Task 4 — Manual verification (AC-1, AC-2, AC-3, AC-4, AC-5)** *(deferred to QA / user)*
  - [ ] As a logged-in player (or via ST `localTestLogin('player')` emulation), open the sidebar more-grid → confirm Archive tile is visible in the Player section. Click it → confirm the Archive tab renders content.
  - [ ] As a player with no archive content (if any test fixture available — otherwise skip): confirm tile is still visible and tab shows "Nothing archived yet." placeholder.
  - [ ] As an ST: confirm Archive tile still visible (regression check on the role bypass).
  - [ ] Verify Regency and Office tiles still gate correctly: as a player who is NOT a regent and has NO `court_category`, confirm those two tiles remain hidden.

---

## Dev Notes

### Files in scope

| File | Action |
|---|---|
| `public/js/app.js` | UPDATE — remove `condition: 'hasArchive'` from tile registration (Task 1); remove `hasArchive` branch from `_moreGridCondition` (Task 2) |

That's it. Single file. No CSS, no schema, no server, no test changes.

### Files NOT to touch

- `public/js/tabs/archive-tab.js` — tab already handles empty state correctly; no changes needed.
- `server/routes/archive-documents.js` — no server-side enrichment work in this story.
- `public/js/admin/archive-admin.js` — ST-only admin path; unchanged.
- `server/routes/characters.js` (or wherever the character GET enrichment happens) — we're explicitly NOT going down the "populate `_has_archive` server-side" path. See "Why drop the gate" below.

### Why drop the gate (vs. fix it)

The alternative — populate `_has_archive` server-side by querying `archive_documents` + `downtime_submissions` + retired-peer presence on every character GET — is materially more code for a cosmetic gate on a feature that already gracefully handles empty state. Per the project's calibrate-to-scale principle (solo hobby, not enterprise), the simpler fix is correct.

The deleted condition has been broken since it was written (no setter has ever existed). Removing it is reverting to the implicit-default-show behaviour that all other unconditional player tiles use (Downtime, Ordeals, Challenge).

### Why the ST view "works" today

The ST bypass at `app.js:1437` is intentional and pre-existing — it lets STs see all conditional apps regardless of player gating, so they can review feature visibility from the player's perspective without role-switching. That bypass is unaffected by this story; we're only changing the player-side branch.

### Empty-state behaviour after the fix

Players whose character has no archive content will see the Archive tile, click it, and get `<p class="placeholder-msg">Nothing archived yet.</p>` (archive-tab.js:101-103). This is the same placeholder behaviour every other empty-tab presents in the project. No new copy needed.

### Out-of-scope follow-ups

- **Server-side enrichment of `_has_archive`** — not warranted. Documented here so a future maintainer doesn't think "we should fix this properly".
- **Sweep dead `_has_archive` references** — there's only one (the gate we're removing). Nothing to sweep.
- **Audit the other conditions** (`hasRegency`, `hasOffice`) — both correctly read existing character/territory fields. Working. No change.

### Testing standard

UI-only single-file change with no business-logic surface. Per project precedent (`feeding-grounds-double-free.test.js`, #232 / #231 testing standards), no unit test is warranted. Manual verification covers it.

A Playwright E2E spec would be feasible (assert Archive tile present in player session DOM) but disproportionate to the change. Optional follow-up if regression guard is wanted later.

### British English

No user-visible string additions in this story. The "Archive" label and the "Nothing archived yet." placeholder are pre-existing.

---

## Dev Agent Record

### Debug Log

- `node --input-type=module --check < public/js/app.js` passes.
- No unit tests touch `_moreGridCondition` or any tile registration list — confirmed via grep across `tests/`. No regression run needed.
- Per story testing standard (UI gating change, no business-logic surface, follows #232 / `feeding-grounds-double-free.test.js` precedent): no unit test added.

### Completion Notes

**Implemented (Tasks 1, 2, 3):**

- **Task 1:** Removed `, condition: 'hasArchive'` from the Archive tile registration at `public/js/app.js:1423`. The tile entry now matches the unconditional player tiles (Downtime, Ordeals) with only `id`, `label`, `icon`, `section: 'player'`.
- **Task 2:** Removed the four-line `if (app.condition === 'hasArchive') { ... return !!(myChar && myChar._has_archive); }` block from `_moreGridCondition` at `app.js:1449-1452`. Function now ends with the `hasOffice` branch followed by the catch-all `return true`. Tile without a condition falls through to `return true` for player sessions, just like the other unconditional tiles.

**Skipped:** No tests added — project has no Vitest, only Playwright E2E. Adding Playwright coverage for a sidebar tile visibility change would require a fixture rig disproportionate to a 2-edit change. Manual verification (Task 4) covers it per project standard.

**Deferred to QA / user (Task 4):** Manual browser verification of Archive tile presence for a player session, click-through to the tab, and Regency/Office regression check.

**No security boundary, no schema change, no server change.** Pure UI-gate removal on a flag that was never set. Out-of-scope follow-ups (server-side enrichment route) explicitly documented as not warranted in Dev Notes.

**British English** preserved (no user-visible string additions or deletions; "Archive" label and "Nothing archived yet." placeholder are pre-existing).

### File List

Modified:
- `public/js/app.js` — removed `condition: 'hasArchive'` from Archive tile entry; removed `hasArchive` branch from `_moreGridCondition`
- `specs/stories/sprint-status.yaml` — entry for `issue-236-archive-nav-tile-carver` set to `review`
- `specs/stories/issue-236-archive-nav-tile-carver.story.md` — this story file (task checkboxes + dev record)

No files added. No files deleted.

### Change Log

- 2026-05-09 — Implemented #236 per story scope: removed dead `hasArchive` gate from `_moreGridCondition` so the Archive tile shows unconditionally for player sessions. ST view unchanged via the existing role bypass at `app.js:1437`. Empty-archive players see the existing "Nothing archived yet." placeholder in the tab. Two-edit change in `public/js/app.js`. No tests (UI-gating change, no business-logic surface). Manual browser verification deferred to QA / user. (Tasks 1, 2, 3)
- 2026-05-09 — QA review (Quinn): **Approve**. 0 blockers, 0 high, 0 medium, 0 low. Cleanest possible diff — by dropping the `condition` field, the `app.condition && _moreGridCondition(app)` guard at the three call sites short-circuits the condition function entirely for Archive. No leftover references anywhere in `public/` `server/` `tests/`. Manual smoke (Task 4) remains the only unverified item.

---

## Senior Developer Review (AI)

**Reviewer:** Quinn (bmad-agent-qa)
**Date:** 2026-05-09
**Outcome:** ✅ **Approve** — no notes, no action items. Cleanest one-shot diff I've reviewed in this session. Manual browser verification (Task 4) is the only outstanding check.

### Summary

Two subtractions in a single file:

1. `app.js:1423` — `, condition: 'hasArchive'` removed from the Archive tile registration.
2. `app.js:1449-1452` — the four-line `if (app.condition === 'hasArchive') { ... return !!(myChar && myChar._has_archive); }` block deleted from `_moreGridCondition`.

The function now ends with the `hasOffice` branch followed by the catch-all `return true`. Parse-check clean.

The elegant property of this fix: at the **three call sites** of `_moreGridCondition` (`app.js:297`, `:1708`, `:1895`), the call is guarded by `if (app.condition && !_moreGridCondition(app))`. Since the Archive tile no longer has a `condition` field, the `app.condition &&` short-circuits — `_moreGridCondition` is **never called for Archive at all**. Archive falls through every render path unconditionally. This is structurally tidier than special-casing Archive inside the function.

I traced the broader regression surface and there's nothing to worry about:

- `hasRegency` and `hasOffice` branches in `_moreGridCondition` are untouched and still evaluate correctly — Regency tile still gates on `findRegentTerritory(terrs, myChar)`; Office tile still gates on `myChar.court_category`.
- ST role bypass at `:1437` is untouched. STs continue to see all conditional tiles regardless of player gating.
- No leftover `hasArchive` or `_has_archive` references anywhere in `public/`, `server/`, or `tests/` — confirmed via grep. Clean removal, no orphans.
- No unit tests touch `_moreGridCondition` or the Archive tile entry — no test breakage possible.

### Edge case I checked

**Player with no character at all** (e.g., Discord-auth'd but `character_ids` is empty): pre-fix, `myChar` was undefined → `myChar && myChar._has_archive` was false → tile hidden. Post-fix, tile shows. They click it → the click handler at `app.js:418` has an `if (el && char)` guard, so `initArchiveTab` is not called and the click is a no-op.

This is the **same behaviour as the other unconditional player tiles** (Downtime, Ordeals, Challenge) in the same situation. Not a #236 regression — just the existing pattern. Acceptable. If "no-character players see broken-looking tiles" ever becomes a real concern, that's a separate cross-cutting story for the whole Player section, not this one.

The other player.js call site at `:278` (`initArchiveTab(document.getElementById('tab-archive'), activeChar, retiredChars)`) was always called regardless of the nav tile gating — it initialises the tab DOM even before the user clicks. So my change doesn't shift this code path at all.

### Tests added by Quinn

**None this pass.** Same standard as #233 / #232: project has no Vitest, only Playwright E2E. A Playwright spec for "player session shows Archive tile in more-grid" would be a 30-line fixture for a 2-line code change. Not worth it.

If a regression guard is wanted later, the spec would: seed a player session via `localTestLogin('player')` (or fixture mock), navigate to the more-grid sidebar, assert `[data-app-id="archive"]` is present in `.player-section` of `.more-grid`. Say the word and I'll write it.

### What I verified

- ✅ `app.js:1423` — Archive tile now has `id`, `label`, `icon`, `section: 'player'` only — no `condition` field
- ✅ `app.js:1433-1450` — `_moreGridCondition` cleaned up; ends with `hasRegency` (`:1441`), `hasOffice` (`:1446`), catch-all `return true` (`:1449`); no Archive special-case
- ✅ Three call sites of `_moreGridCondition` (`:297`, `:1708`, `:1895`) all guarded by `if (app.condition && !_moreGridCondition(app))` — Archive (no `condition`) short-circuits at every site
- ✅ ST role bypass at `:1437` untouched — STs still see all conditional tiles
- ✅ Regency tile gating unchanged — `findRegentTerritory(terrs, myChar)` branch intact at `:1441-1444`
- ✅ Office tile gating unchanged — `myChar.court_category` branch intact at `:1446-1448`
- ✅ Grep confirms zero leftover references to `hasArchive` or `_has_archive` in `public/`, `server/`, `tests/`
- ✅ Click handlers at `app.js:418` (more-grid tab dispatch) and `player.js:278` (player.html shell) are unaffected — both pre-existing code paths, neither triggered by tile visibility
- ✅ Archive tab empty state at `archive-tab.js:101-103` ("Nothing archived yet." placeholder) handles zero-content players cleanly — no UX cliff
- ✅ Parse-check clean (`node --input-type=module --check`)
- ✅ No new dependencies, no schema change, no server change, no CSS change
- ✅ British English: zero string additions or deletions

### What I did NOT verify (out of Quinn's static reach)

- ❌ Archive tile actually appears in the rendered more-grid sidebar for a player session in a real browser (no padding regression, no aria oddity)
- ❌ Click on Archive tile actually loads the tab and renders Carver's content (dossier + published outcomes + retired peers)
- ❌ Empty-archive player sees the "Nothing archived yet." placeholder cleanly
- ❌ Regency and Office tiles still hide correctly for a player who is neither a regent nor in office (the gates are statically the same code, but visual confirmation is still your turn)

These are all in Task 4's manual smoke checklist. **Run them on a local dev server before merging.** The diff itself has no defects I can find.

### Recommended next steps

1. Run Task 4 manually in the browser (local dev: `node index.js` + `npx http-server public -p 8080`).
2. If smoke passes: commit + open PR for #236.
3. After merge: pick up #234 (B2) or #235 (B3) — both still untouched.
