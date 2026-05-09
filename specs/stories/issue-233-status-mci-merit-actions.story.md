# Story issue-233: Wire Status/MCI actions into buildMeritActions so DT Story Status section renders

Status: review

issue: 233
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/233
branch: morningstar-issue-233-status-mci-merit-actions

---

## Story

As an ST processing downtimes,
When a character with Status influence merits or MCI standing merits submits `status_${n}_*` actions in the form,
I want those actions to appear in the DT Story tab Status Actions section,
So that I can write narrative responses to status/MCI actions in the same workflow as sphere/contact/retainer actions.

This is **B1** from `specs/downtime-data-flow-audit.md` (2026-05-09): the form has been writing `status_${n}_*` for some time, but admin processing never normalised those keys into `merit_actions`. As a result, `renderStatusSection()` always renders "No actions for this section." for affected characters.

Scope is the form → admin pipeline only (the focus the user named at story-creation time). The player-side gap in `public/js/tabs/story-tab.js` is documented as a follow-up below — separate issue when v2 player report work is picked up.

---

## Acceptance Criteria

**AC-1 — `buildMeritActions(sub)` reads status slots**
Given a submission has `status_${n}_merit` set and `status_${n}_action` non-empty (n=1..5),
When `buildMeritActions(sub)` runs in `public/js/admin/downtime-story.js`,
Then for each non-empty slot it pushes `{ merit_type, action_type, desired_outcome, description }` mirroring the sphere fallback loop pattern at `:1659-1668`. Empty slots are skipped.

**AC-2 — Status Actions section renders cards in DT Story tab**
Given a test submission with `status_1_merit = "Status (Carthian Movement) ●●"`, `status_1_action = "investigate"`, populated outcome/description,
When the ST loads the DT Story tab for that character,
Then the Status Actions section renders one action card with the merit label, action type, outcome, and description — no longer "No actions for this section."

**AC-3 — MCI actions promoted to Status Actions section**
Given a character is an MCI bearer (Livia, Mammon, Ludica, Charles Mercer-Willows) with a merit labelled "Mystery Cult Initiate ●●●(...)" and submits status slots in the form,
When the DT Story tab renders,
Then the MCI actions appear in the **Status Actions** section (not Misc Influence Actions). This requires adding a regex match for "Mystery Cult Initiate" → `'status'` in both `deriveMeritCategory` (downtime-story.js:1784) and `_parseMeritType` (downtime-views.js:190) — the comment at downtime-story.js:1782 explicitly flags these two functions as duplicated and intended to mirror.

**AC-4 — Index alignment preserved for existing categories**
Given a submission with both sphere and status actions,
When `buildMeritActions` runs,
Then sphere/contact/retainer/acquisition entries appear in flat indices 0..N-1 unchanged; status entries are appended **after** acquisitions. `merit_actions_resolved` parallel-array indices for sphere/contact/retainer/acquisition are not disturbed.

**AC-5 — No regression in existing rendering**
Given submissions with sphere/contact/retainer/acquisition actions but no status actions,
When the DT Story tab renders,
Then sphere/contact/retainer/acquisition cards render exactly as before. Adding status entries must not shift any existing index they read by name.

**AC-6 — Manual verification with at least one Status-bearing character and one MCI-bearer**
- **Status influence merit:** any character with a "Status (X)" merit on file. Submit a synthetic downtime via local dev with `status_1_action`, `_outcome`, `_description` populated. Confirm Status Actions section renders the card.
- **MCI standing merit:** Livia, Mammon, Ludica, or Charles Mercer-Willows. Submit synthetic downtime with `status_1_*` populated. Confirm MCI action also lands in Status Actions section (per AC-3).
- Existing submissions with no status actions render unchanged.

---

## Tasks

- [x] **Task 1 — Add status loop to `buildMeritActions` (AC-1, AC-4)**
  - [x] In `public/js/admin/downtime-story.js`, in `buildMeritActions(sub)` (~line 1641), after the resource/skill acquisitions block (ends ~line 1745, just before `return actions;`), add a status loop. *Implemented at `:1777-1791` — appended after the Skill Acquisition block, before `return actions;`. Comment cites #233 + form line range.*
  - [x] Read `status_${n}_merit`, `status_${n}_action`, `status_${n}_outcome`, `status_${n}_description` for n=1..5.
  - [x] Push `{ merit_type, action_type: action || 'misc', desired_outcome, description }` only when `merit` is truthy. Mirrors the sphere fallback loop at `:1659-1668`.
  - [x] Status entries append AFTER spheres/contacts/retainers/acquisitions to keep existing flat indices stable (AC-4).

- [x] **Task 2 — Promote MCI to `'status'` category (AC-3)**
  - [x] In `public/js/admin/downtime-story.js`, in `deriveMeritCategory(meritTypeStr)` at `:1784-1794`, add `if (/mystery cult initiate/.test(s)) return 'status';` before the existing `/status/` check (or after — both work since MCI doesn't contain "status"; placing it adjacent to the status branch is most readable). *Implemented adjacent to (immediately after) the `/status/` branch, with `// #233 — MCI grouped with Status` inline comment.*
  - [x] In `public/js/admin/downtime-views.js`, in `_parseMeritType(str)` at `:190-219`, mirror the change: add `else if (/mystery cult initiate/.test(categoryRaw)) category = 'status';` adjacent to the existing status branch at `:212`. The comment at downtime-story.js:1782 explicitly notes these two functions must stay in sync per NFR-DS-01. *Implemented identically — same regex, same comment, same position relative to the status branch.*

- [ ] **Task 3 — Manual verification (AC-2, AC-3, AC-5, AC-6)** *(deferred to QA / user)*
  - [ ] Local dev (`node index.js` API + `npx http-server public`): pick a character with a `Status (...)` merit. Submit a downtime via `/player.html` with `status_1_action = 'investigate'`, populated outcome + description. Confirm:
    - Admin DT Story tab → **Status Actions** section renders one action card with merit label, action type, outcome, description.
  - [ ] Repeat with an MCI character (Livia / Mammon / Ludica / Charles Mercer-Willows). Confirm MCI action also lands in **Status Actions** (not Misc Influence Actions) — verifies AC-3.
  - [ ] Regression: pick an existing submission (any cycle) with sphere/contact/retainer actions and no status actions. Confirm those cards render unchanged. Verify the section dot indicators (complete/pending) for sphere-only sections look the same.

- [x] **Task 4 — Optional: extend tests if dtq.2 pattern is unit-testable** *(skipped — Playwright-only)*
  - [x] If `tests/downtime-story.spec.js` (referenced in dtq.2 dev notes — "10 E2E tests added, all passing") is unit/integration-style and reachable from Vitest, extend it with two cases. *Verified: project has no Vitest setup (`package.json` has placeholder `"test"` script, only `playwright.config.js` exists). `tests/downtime-story.spec.js` is `@playwright/test` — full browser rig. No unit-test surface to extend.*
  - [x] Skip if the existing tests are Playwright (browser-only) and not extensible without a full E2E rig — manual verification (Task 3) covers it per the project's testing standard. *Skipping per story guidance.*

---

## Dev Notes

### Files in scope

| File | Action |
|---|---|
| `public/js/admin/downtime-story.js` | UPDATE — add status loop in `buildMeritActions` (Task 1); MCI regex in `deriveMeritCategory` (Task 2) |
| `public/js/admin/downtime-views.js` | UPDATE — MCI regex in `_parseMeritType` (Task 2) — mirror of the deriveMeritCategory change |
| `tests/downtime-story.spec.js` | UPDATE (optional) — extend coverage for status case + MCI promotion if existing pattern is extensible |

### Files NOT to touch in this story

- `public/js/tabs/downtime-form.js` — form already writes `status_${n}_*` correctly per audit. Don't touch.
- `public/js/tabs/story-tab.js` — player-facing report has the same gap (`buildPlayerMeritActions` doesn't read status). Out of scope per user direction at story-creation time. See "Out-of-scope follow-ups" below.
- `public/js/admin/downtime-views.js` queue/processing pipeline — does **not** read `status_${n}_*` for dice rolling or response generation either, but bringing status into the queue is materially more work. Out of scope. See follow-ups.
- `server/schemas/downtime_submission.schema.js` — schema is permissive (`additionalProperties: true`); status keys save fine. Schema-declaration cleanup is D1/D2 from the audit, separate work.
- `server/routes/downtime.js` — no server change.

### Why append instead of insert in flat order

`merit_actions_resolved` is a parallel array — index N in `merit_actions` corresponds to index N in `merit_actions_resolved`. Existing submissions in the database have resolved arrays sized to the current spheres+contacts+retainers+acquisitions count. If status entries were inserted *between* (e.g., spheres → status → contacts) it would shift downstream indices and break already-resolved submissions on render. Appending after acquisitions adds new indices at the tail without disturbing existing alignment.

For submissions where ST has not yet resolved the status entries, `projects_resolved[index]` will be undefined, which `renderMeritSection` already handles via the existing `resolved[i] || {}` pattern at `:2310`.

### Why MCI is being promoted

Per user direction at story-creation time, MCI standing merits should appear alongside Status influence merits in the **Status Actions** section, not in Misc Influence Actions. Functional reasoning:

- MCI actions are mechanically status-flavoured (cult standing, intra-cult favours, ranks).
- Visually grouping them with Status influence merits matches how STs already think about them in narrative processing.
- Misc Influence Actions becomes a smaller, more focused bucket (just truly miscellaneous influence things).

The change is two regex insertions — one per duplicated category function — and is reversible if it doesn't feel right after smoke-testing. Original behaviour preserved by removing the regex from both files.

### Out-of-scope follow-ups (separate stories if needed)

- **Player Story tab status gap.** `public/js/tabs/story-tab.js` `buildPlayerMeritActions(sub)` (~`:586`) has the same gap — doesn't read `status_${n}_*`. After this story lands, ST sees status actions but player still doesn't in their final report. File a separate issue when v2 player report work is prioritised. The fix is structurally identical: ~5-line status loop after the retainers block at `:624-632`.
- **Status processing queue.** `admin/downtime-views.js` builds the ST processing queue (dice rolls, responses) from spheres/contacts/retainers — status actions are not currently dice-rolled or response-resolved by the queue. Wiring them through (with pool composition, target validation, response generation) is materially more work and belongs to its own story. This story only makes status actions *visible* in the narrative section.
- **Schema declaration cleanup.** Audit D1/D2 — `status_${n}_*` should be declared as proper schema properties (currently hidden under `additionalProperties: true`). Separate sweep, post-B-blockers.

### Testing standard

Single-purpose data-shape change. Two parallel pieces (status loop in `buildMeritActions`; MCI regex in two duplicated category functions). Manual verification covers it. Optional unit test extension if the existing dtq.2 test pattern is reachable.

### British English

No user-visible string additions in this story (the section labels "Status Actions", "Status" are pre-existing). Nothing to translate.

---

## Dev Agent Record

### Debug Log

- `node --input-type=module --check` against both modified files passes.
- Confirmed via grep that no unit-test files reference `buildMeritActions`, `deriveMeritCategory`, or `_parseMeritType`. Only `tests/downtime-story.spec.js` mentions buildMeritActions in a comment header — that file is Playwright E2E (`require('@playwright/test')`). Project's `package.json` has no Vitest; only `playwright.config.js` exists. Per story Task 4 guidance, optional unit-test extension is skipped.
- No regression run performed beyond parse-check — there's no unit suite to run, and Playwright E2E requires the dev server + browser rig (out of scope for the dev agent; user runs in browser).

### Completion Notes

**Implemented (Tasks 1, 2):**

- **Task 1 (status loop):** Added a status fallback loop in `buildMeritActions` at `public/js/admin/downtime-story.js:1777-1791`, immediately after the Skill Acquisition block and before `return actions;`. The loop reads `status_${n}_merit/_action/_outcome/_description` for n=1..5, pushes a normalised entry when `_merit` is truthy, mirroring the sphere fallback loop pattern. Empty slots are skipped. Status entries append at the tail of the array to preserve existing flat-index alignment with `merit_actions_resolved` (AC-4).
- **Task 2 (MCI promotion):** Added `if (/mystery cult initiate/.test(s)) return 'status';` to `deriveMeritCategory` in `public/js/admin/downtime-story.js`, immediately after the `/status/` branch. Mirrored the change in `_parseMeritType` in `public/js/admin/downtime-views.js` with the equivalent `else if` branch. Both functions now route MCI labels (e.g. "Mystery Cult Initiate ●●●(Bahari)") to category `'status'`, so MCI actions surface in the **Status Actions** section alongside Status influence merits. The two functions must stay in sync per the NFR-DS-01 comment at downtime-story.js:1782.

**Skipped (Task 4):** Project has no unit-test infrastructure for these functions. Only Playwright E2E exists (`tests/downtime-story.spec.js`), which is browser-rig only and not where the audit-driven data-shape change is profitably exercised. Manual verification (Task 3) covers it per the project's testing standard.

**Deferred to QA / user (Task 3):** Manual browser verification — Status section card render, MCI promotion, regression on sphere/contact/retainer-only submissions. Listed in story Task 3.

**No security boundary, no schema change, no server change.** Pure data-shape normalisation on the admin client. Out-of-scope follow-ups (player Story tab, status processing queue, schema declaration cleanup) noted under Dev Notes; no work taken on those in this story.

**British English** preserved (no user-visible string additions; section labels were pre-existing).

### File List

Modified:
- `public/js/admin/downtime-story.js` — added status loop in `buildMeritActions` (Task 1); added MCI regex branch in `deriveMeritCategory` (Task 2)
- `public/js/admin/downtime-views.js` — added MCI regex branch in `_parseMeritType` (Task 2, mirror of downtime-story.js change per NFR-DS-01)
- `specs/stories/sprint-status.yaml` — entry for `issue-233-status-mci-merit-actions` set to `review`
- `specs/stories/issue-233-status-mci-merit-actions.story.md` — this story file (task checkboxes + dev record)

No files added. No files deleted.

### Change Log

- 2026-05-09 — Implemented #233 per story scope: status loop appended to `buildMeritActions` (admin DT Story tab) so `status_${n}_*` form fields surface as merit actions; MCI promoted to `'status'` category in both duplicated category functions (`deriveMeritCategory` + `_parseMeritType`) so MCI actions render in the Status Actions section. Two-file change (admin only); player Story tab gap and processing queue gap noted as out-of-scope follow-ups. No tests added (Playwright-only project, no unit-test surface). Manual browser verification deferred to QA / user. (Tasks 1, 2; Task 4 skipped per story guidance)
- 2026-05-09 — QA review (Quinn): **Approve with notes**. 0 blockers, 0 high, 0 medium, 2 low. ACs satisfied at code level; manual browser smoke (Task 3) is the only outstanding check. Action items below.

---

## Senior Developer Review (AI)

**Reviewer:** Quinn (bmad-agent-qa)
**Date:** 2026-05-09
**Outcome:** ✅ **Approve with notes** — no blockers; the action items are low-priority observations that don't gate the merge. Manual browser verification (Task 3) is the only thing standing between this and "done".

### Summary

Two-file change, both small and parallel. The `buildMeritActions` status loop is a literal mirror of the sphere fallback loop pattern at `:1659-1668`, appended after acquisitions to keep the existing flat-index alignment with `merit_actions_resolved`. The MCI regex in `deriveMeritCategory` and `_parseMeritType` is a one-line addition each, both placed adjacent to the existing `/status/` branch and tagged with `// #233`. Both files parse-check clean.

I traced the regression surface for the MCI promotion specifically — what consumers branch on the category value:

- `_parseMeritType` is called at three sites in downtime-views.js: `:3068` (sphere-action processing loop, gates phase ordering on `meritCategory === 'allies'`); `:3739` (ambience-direction loop, gates territory ambience updates on `category === 'allies'/'status'/'retainer'`); `:9384` (`_buildMeritSlotMap`, partitions actions by category for the slot map).
- `deriveMeritCategory` is called at eight sites in downtime-story.js, all of which use it for section-routing or completeness gates.

The critical question for regression: **is MCI ever in `raw.sphere_actions`?** Answer: **no, in normal data**. `downtime-form.js:286-288` filters MCI into `detectedMerits.status` and writes to `status_${n}_*` — it never lands in sphere slots. DT1 CSV imports also wouldn't populate `raw.sphere_actions` (no `_raw` field per dtq.2). So the call sites that previously got MCI as `'misc'` simply don't see MCI labels.

The one place MCI labels DO flow through `_parseMeritType` post-fix is `_buildMeritSlotMap` (when iterating `_getSubMeritActions(sub)`, which now includes status-loop entries) — and that's exactly what we want: MCI entries land in `map.status`, available for ST processing UI to find them.

Verdict: the MCI promotion is constrained to where you intended it (Status section visibility) and doesn't ripple into pool calculations, phase ordering, or queue processing for actions that previously didn't exist there.

The outstanding gap is **manual smoke**. The data shape change can't be exercised without a real submission (or a fixture rig that the project doesn't have). Run Task 3 before merging.

### Action items

**[LOW] Sparse-slot collapse — pre-existing pattern, worth noting**

The status loop uses `for (n = 1..5) { if (!mt) continue; push; }` — same as the sphere fallback. If a character has merits detected in slots [1, 3, 5] (or any sparse layout), the array indices 0..2 in `merit_actions` won't correspond to status slot numbers 1, 3, 5. They'll be packed contiguously.

This matches the sphere fallback loop's existing behaviour, so it's consistent — but if any future ST processing code needs to *recover the original slot number* from a merit_actions entry (e.g., to read the matching `status_${n}_target_value`), there's no inverse map. Same constraint as spheres today.

**Recommend:** leave as-is for #233 (matches existing pattern). If a future story needs slot-number recovery, add `slot: n` to the pushed object as an additional field. Out of scope here.

**[LOW] `action_type` defaults to `'misc'` when status action is empty**

The loop at `:1788`: `action_type: resp[\`status_${n}_action\`] || 'misc'`. If a player wrote a status_1_outcome and description but never picked an action enum, the card surfaces `action_type: 'misc'`. The render layer presumably labels that as "Misc" — visually correct but the card might look mismatched ("Status (Carthian) ●● — Misc — investigate the carthians..."). Same defaulting pattern as spheres at `:1664`, so this is consistent.

**Recommend:** leave as-is. If this turns up as a UX issue in the smoke test, the fix is the same surface for spheres + status (a separate UX story).

### Tests added by Quinn

**None this pass.** The project has no Vitest, only Playwright E2E. Adding Playwright coverage for this would mean:

1. Spinning up a synthetic submission with `status_1_*` populated (currently no fixture for this).
2. Mocking the API responses for cycles/territories/characters (the existing spec does this via `page.route` patterns).
3. Asserting the Status Actions section renders the card.

That's a real piece of work — probably more code than the implementation it covers. Per the story testing standard ("UI gating change with no business logic surface, follows feeding-grounds-double-free.test.js precedent"), a Playwright spec is **optional follow-up**, not blocking. Same offer as #232 item 5 / #231: say the word and I'll write it.

### What I verified

- ✅ Status loop emits when `status_${n}_merit` is truthy; skips when empty (`:1783-1791`)
- ✅ Status loop appends after acquisitions, preserving flat indices for sphere/contact/retainer/acquisition (`:1777` placement)
- ✅ `merit_type` field carries the form's `meritLabel(sm)` output verbatim — so `deriveMeritCategory` sees the full label including dots/qualifier
- ✅ MCI regex matches both "Mystery Cult Initiate" and "Mystery Cult Initiation" (the project uses "Initiation" per `downtime-form.js:280-288` comment + filter at `:288`; "initiate" is a substring of "initiation" so the regex matches both)
- ✅ MCI regex placement: in `deriveMeritCategory` at downtime-story.js, immediately after `/status/` branch — order doesn't matter since MCI labels don't contain "status", but adjacency is the readability choice
- ✅ MCI regex placement: in `_parseMeritType` at downtime-views.js:213 — same position relative to `/status/` branch, mirror per NFR-DS-01
- ✅ Both files parse-check clean (`node --input-type=module --check`)
- ✅ `_parseMeritType` call sites traced — `:3068` (spheres only, MCI never lands here from form), `:3739` (sphere ambience direction, same), `:9384` (`_buildMeritSlotMap`, post-fix MCI lands in `map.status` correctly)
- ✅ `deriveMeritCategory` call sites traced — all eight are section-routing or completeness gates; MCI now lands in `'status'` everywhere consistently
- ✅ Misc Influence Actions section (`renderMiscMeritSection`, filter `['misc']`) — no longer surfaces MCI labels (was previously the catch-all bucket; now MCI routes to status). This is the deliberate behaviour change per the user's choice at story-creation time.
- ✅ `tests/downtime-story.spec.js` does not reference MCI or status_${n}_* — existing E2E coverage isn't broken by this change
- ✅ No schema change, no server change, no form change — surface area is admin client only, two files

### What I did NOT verify (out of Quinn's static reach)

- ❌ Status Actions section actually renders the card cleanly in a real browser (no leftover empty-section state, no margin/padding regression)
- ❌ Section dot indicator (complete/pending) on Status Actions correctly tracks the new entries (the dot pulls from `actionResponsesComplete(sub, ['status'])` — should work, but visual confirmation needed)
- ❌ MCI label display in the action card header — verify the card title shows the full merit label cleanly (e.g. "Mystery Cult Initiation ●●●(Bahari)")
- ❌ Two characters with both Status influence merits AND MCI — verify they both appear in Status Actions, separately, with correct labels
- ❌ Regression: an existing submission (any cycle) with sphere/contact/retainer actions and zero status — confirm those cards render unchanged, no shift in card order, no extra empty Status section behaviour
- ❌ Misc Influence Actions section for a character that had MCI rendering pre-fix (if any) — confirm the section is now empty / collapses cleanly. Most likely no submission was actually surfacing MCI in misc pre-fix (buildMeritActions never emitted from status_*), so this is theoretical.

These are all in Task 3's manual smoke checklist. **Run them on a local dev server before merging.**

### Recommended next steps

1. Run Task 3 manually in the browser (local dev: `node index.js` + `npx http-server public`).
2. If smoke passes: commit + open PR for #233.
3. After merge: pick up #234 (B2, `_feed_rote` dead read) — small, similar shape.
4. After #234: pick up #235 (B3, `'maintenance'` enum).
