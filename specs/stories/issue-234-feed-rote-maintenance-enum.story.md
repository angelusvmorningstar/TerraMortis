# Story issue-234 + issue-235: DT audit B2 (dead `_feed_rote` read) + B3 (`maintenance` enum)

Status: review

issue: 234
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/234
also_closes: 235
also_closes_url: https://github.com/angelusvmorningstar/TerraMortis/issues/235
branch: morningstar-issue-234-feed-rote-maintenance-enum

---

## Story

As an ST and as a player using the DT system,
I want the player Feeding tab and the server-side schema to align with the post-redesign form contract,
So that the rote-feeding readout actually appears for current submissions and the schema doesn't reject `'maintenance'` project actions on save.

This story bundles **B2** and **B3** from `specs/downtime-data-flow-audit.md` (2026-05-09). Both are tiny independent fixes (one file each, one or two lines each) clearing the audit's blocker queue post-#233.

---

## Acceptance Criteria

### B2 — `_feed_rote` dead read

**AC-B2.1 — Player Feeding tab no longer reads `_feed_rote`**
Given a downtime submission saved by the post-dt-form.22 form (no `_feed_rote` key in responses),
When `feeding-tab.js` renders the Rote section,
Then the section's visibility is determined by scanning `project_${n}_action` for `'rote'` or `'feed'` across slots 1..4 — same predicate the admin uses at `downtime-views.js:2775-2780`.

**AC-B2.2 — Rote section appears when a project slot has rote/feed action**
Given a submission with `project_1_action = 'rote'` (or any slot 1..4 set to `'rote'` / `'feed'`),
When the player opens the Feeding tab,
Then the "Rote: Project action dedicated to feeding" readout renders, with secondary method / territory / description from that slot.

**AC-B2.3 — Rote section hidden when no slot is rote/feed**
Given a submission with no project slot using `'rote'` or `'feed'`,
When the player opens the Feeding tab,
Then the Rote readout is NOT shown.

### B3 — `'maintenance'` schema enum

**AC-B3.1 — Schema accepts `'maintenance'`**
Given a submission has any `project_${n}_action: 'maintenance'`,
When the API validates the submission against `downtime_submission.schema.js`,
Then validation passes (no enum violation).

**AC-B3.2 — No other enum changes**
Given the schema's `sphereActionEnum` and other enums,
When this story lands,
Then those arrays are unchanged. Only `projectActionEnum` gains `'maintenance'`.

### Bundle-level

**AC-bundle.1 — Parse-check passes**
`node --input-type=module --check < public/js/tabs/feeding-tab.js` and `node --input-type=module --check < server/schemas/downtime_submission.schema.js` both return clean.

---

## Tasks

### B2 — `_feed_rote` dead read

- [x] **Task B2.1 — Replace outer gate in `feeding-tab.js`**
  - [x] In `public/js/tabs/feeding-tab.js:344`, replace `if (r['_feed_rote'] === 'yes') {` with the project-slot scan. Mirror the admin pattern at `downtime-views.js:2775-2780`. *Implemented: introduced `const feedRote = [1,2,3,4].some(...)` derivation just above the section, with a code comment citing #234 + the dt-form.22 history.*
  - [x] Note: this is the player-facing Feeding tab — there is no `st_review` override in this surface (that lives on the admin side). Just the project-slot scan is enough.

- [x] **Task B2.2 — Update inner slot scan to also match `'rote'`**
  - [x] In the existing inner loop at `:348-366`, change `if (r[\`project_${n}_action\`] === 'feed') {` to `if (r[\`project_${n}_action\`] === 'rote' || r[\`project_${n}_action\`] === 'feed') {`. *Implemented: extracted `const a = r[\`project_${n}_action\`];` to a single read, then matched on `a === 'rote' || a === 'feed'`. Loop body unchanged.*
  - [x] Reason: post-dt-form.22, the rote slot's action is `'rote'`, not `'feed'`. The legacy `'feed'` check is preserved for back-compat with pre-dt-form.22 submissions where the rote info lived in a `'feed'`-action project slot.

### B3 — `'maintenance'` schema enum

- [x] **Task B3.1 — Add `'maintenance'` to `projectActionEnum`**
  - [x] In `server/schemas/downtime_submission.schema.js`, add `'maintenance'` to the `projectActionEnum` array at `:27-39`. Place it adjacent to the other action-types. *Implemented: added `'maintenance'` after `'ambience_change'` at the array tail, with a comment citing dt-form.28 / #146 / #235 and pointing to the form's `PROJECT_ACTIONS` write site.*

### Bundle-level

- [x] **Task X.1 — Parse-check both files (AC-bundle.1)**
  - [x] `node --input-type=module --check < public/js/tabs/feeding-tab.js` — clean.
  - [x] `node --check server/schemas/downtime_submission.schema.js` — clean. (Schema file is CommonJS, so `--input-type=module` is not used; plain `--check` against the file path is the right invocation.)

- [ ] **Task X.2 — Manual verification (AC-B2.2, AC-B2.3, AC-B3.1)** *(deferred to QA / user)*
  - [ ] Local dev (`node index.js` + `npx http-server public -p 8080`): submit a synthetic downtime with `project_1_action = 'rote'` (or `'feed'`) populated. Open Feeding tab as the player → confirm Rote readout renders with the slot's `_feed_method2` / territory / description.
  - [ ] Submit another with no project slot in rote/feed → confirm Rote readout is hidden.
  - [ ] Submit one with `project_1_action = 'maintenance'` → confirm POST/PUT to the API does not return a 400 schema-validation error. (Verify against `tm_suite_test` if you'd rather not write live data.)

---

## Dev Notes

### Files in scope

| File | Action | Issue |
|---|---|---|
| `public/js/tabs/feeding-tab.js` | UPDATE — replace `_feed_rote` outer gate with project-slot scan; update inner slot match to `'rote' \|\| 'feed'` | #234 |
| `server/schemas/downtime_submission.schema.js` | UPDATE — add `'maintenance'` to `projectActionEnum` | #235 |

That's it. Two files. No CSS, no tests added (no unit-test infrastructure for these — Playwright E2E only).

### Files NOT to touch in this story

- `public/js/tabs/downtime-form.js` — already correctly omits `_feed_rote` writes per dt-form.22.
- `public/js/admin/downtime-views.js` — admin-side rote detection is the canonical pattern we're mirroring; do not change.
- `public/js/tabs/downtime-data.js` — form's `PROJECT_ACTIONS` dropdown already includes `'maintenance'` (`:20`). No client change needed for B3.
- Any other schema enums (`sphereActionEnum`, `feedMethodEnum`, etc.) — out of scope. The audit's D1 schema sweep is a separate piece of work.

### Why bundle B2 + B3

Both are audit-driven, both small (one or two lines each), both target distinct file surfaces with no overlap, and both unblock the audit's TL;DR queue. Splitting into two PRs would be ceremony for ceremony's sake. One story, one commit, two issue closes.

### Why B2 needs both an outer-gate fix AND an inner-slot fix

The outer gate (`if (r['_feed_rote'] === 'yes')`) is the dead read — the audit's primary finding. Replacing it surfaces the section.

But the existing inner scan at `:348-366` only matches `'feed'` — the legacy primary-feed-as-project-slot shape. Post-dt-form.22, the rote slot is `'rote'`, so the inner scan would not find any matching slot and the rendered section would be empty (or just show the "Rote: Project action dedicated to feeding" header with no detail). That's worse than today's silent-hide behaviour.

So the inner scan needs the same `'rote' || 'feed'` predicate as the outer gate. The sphere fallback / admin patterns already do this consistently.

### Reference patterns

- **Admin canonical (rote detection with ST override):** `public/js/admin/downtime-views.js:2775-2780`
- **Admin canonical (rote detection without override):** `public/js/admin/downtime-views.js:1345-1351` and `:1422-1424`
- **Form drop docs:** `public/js/tabs/downtime-form.js:426-429` (the dt-form.22 ROTE-moves-to-per-slot-action note)
- **Schema enum definition:** `server/schemas/downtime_submission.schema.js:27-39`
- **Schema strict enforcement:** `server/schemas/downtime_submission.schema.js:64`
- **Form writes 'maintenance':** `public/js/tabs/downtime-data.js:20` (not `public/js/player/downtime-data.js` — audit had a stale path)

### Out-of-scope follow-ups

- **D1 schema sweep** — drop `_feed_rote` from `downtime_submission.schema.js:242` (per audit D1) and other legacy fields. Bundle into a single schema-cleanup story when B-blockers are clear.
- **Verify any past `'maintenance'` submission state** — audit suggested checking whether any past submissions with `'maintenance'` actions slipped through validation in some other form. Useful diligence but not required by the AC.

### Testing standard

Two single-purpose data-shape changes. No unit-test infrastructure (Playwright-only project). Manual verification covers it per project precedent (#232 / #233 / #236, `feeding-grounds-double-free.test.js`).

### British English

No user-visible string additions in this story. Existing copy ("Rote: Project action dedicated to feeding", "Maintenance: Upkeep of professional or cult relationships") is pre-existing.

---

## Dev Agent Record

### Debug Log

- `node --input-type=module --check < public/js/tabs/feeding-tab.js` passes.
- `node --check server/schemas/downtime_submission.schema.js` passes (schema is CommonJS — used the file-path invocation rather than the ESM stdin pipe).
- No unit tests touch `feeding-tab.js`'s rote-feed gate or the schema's `projectActionEnum`. Confirmed via grep across `tests/` and `server/tests/`. No regression run needed (project has no Vitest, only Playwright E2E).

### Completion Notes

**Implemented (Tasks B2.1, B2.2, B3.1, X.1):**

- **Task B2.1 — outer gate (feeding-tab.js):** Replaced the dead `if (r['_feed_rote'] === 'yes') {` outer gate with `const feedRote = [1,2,3,4].some(n => { const a = r[\`project_${n}_action\`]; return a === 'rote' || a === 'feed'; });` followed by `if (feedRote) {`. Inline comment cites #234 + dt-form.22 history + the canonical admin pattern at `downtime-views.js:2775-2780`. Mirrors player-facing variant of the admin detection (no `st_review` override since this surface doesn't have one).
- **Task B2.2 — inner slot match:** The existing inner loop at `:348-366` was scanning `=== 'feed'` only. Updated to `=== 'rote' || === 'feed'` so that post-dt-form.22 rote slots (`action === 'rote'`) actually match. Refactored the per-iteration read into a single `const a = r[\`project_${n}_action\`]` to avoid repeated index access. Loop body (which reads `_feed_method2` / `_territory` / `_description`) unchanged.
- **Task B3.1 — schema enum:** Added `'maintenance'` to `projectActionEnum` in `server/schemas/downtime_submission.schema.js`, placed at the array tail after `'ambience_change'`, with a comment citing dt-form.28 / #146 / #235 and pointing at the form's `PROJECT_ACTIONS` write site (`public/js/tabs/downtime-data.js:20`). One-line array addition matching the schema's existing comment style.
- **Task X.1 — parse-check:** Both files clean.

**Skipped:** No tests added — project has no Vitest, only Playwright E2E. Adding Playwright coverage for either change would require a fixture rig disproportionate to the lines changed. Manual verification (Task X.2) covers it per project standard (#232 / #233 / #236 precedent).

**Deferred to QA / user (Task X.2):** Manual browser verification — synthetic submission with `project_1_action = 'rote'` confirms Rote readout renders with slot details; submission with no rote/feed slot confirms readout hidden; submission with `project_1_action = 'maintenance'` confirms API does not 400 on schema validation.

**No security boundary, no client-server contract change beyond the schema enum widening.** B2 is a pure client read fix. B3 is a strict-enum loosening (accepting more values, not fewer) — backwards-compatible with all existing submissions.

**British English** preserved (no user-visible string additions or deletions; "Rote: Project action dedicated to feeding" and the `'maintenance'` action label "Upkeep of professional or cult relationships" are pre-existing).

### File List

Modified:
- `public/js/tabs/feeding-tab.js` — replaced dead `_feed_rote` outer gate with `[1,2,3,4].some(...)` project-slot scan; updated inner slot match from `=== 'feed'` to `=== 'rote' || === 'feed'` (B2)
- `server/schemas/downtime_submission.schema.js` — added `'maintenance'` to `projectActionEnum` array (B3)
- `specs/stories/sprint-status.yaml` — entry for `issue-234-feed-rote-maintenance-enum` set to `review`
- `specs/stories/issue-234-feed-rote-maintenance-enum.story.md` — this story file (task checkboxes + dev record)

No files added. No files deleted.

### Change Log

- 2026-05-09 — Implemented bundled #234 + #235 per story scope. B2: feeding-tab.js outer gate now derives from project-slot scan (mirrors admin canonical at downtime-views.js:2775-2780); inner slot loop matches `'rote' || 'feed'` so post-dt-form.22 rote slots are visible. B3: schema's `projectActionEnum` accepts `'maintenance'` — closes the latent validation landmine for `dt-form.28` submissions. Two-file change. Both files parse-check clean. No tests (Playwright-only project, no unit-test surface). Manual browser verification deferred to QA / user. (Tasks B2.1, B2.2, B3.1, X.1; X.2 deferred)
- 2026-05-09 — QA review (Quinn): **Approve with notes**. 0 blockers, 0 high, 0 medium, 1 low. Predicates correct. One LOW: code-comment in feeding-tab.js mischaracterises `'feed'` as legacy when it is in fact the current canonical value written by the form's rote-lock auto-write at downtime-form.js:620. Cheap copy-edit; not blocking.

---

## Senior Developer Review (AI)

**Reviewer:** Quinn (bmad-agent-qa)
**Date:** 2026-05-09
**Outcome:** ✅ **Approve with notes** — no blockers; one LOW comment-accuracy note. Predicates are correct, regression risk is zero, schema change is a strict superset (backwards-compatible). Manual browser verification (Task X.2) is the only outstanding check.

### Summary

Two-file diff, both parallel to the audit's recommendations. Both parse-check clean.

**B2 (feeding-tab.js):** Outer gate replaced from dead `r['_feed_rote'] === 'yes'` to the project-slot scan `[1,2,3,4].some(n => { const a = r[\`project_${n}_action\`]; return a === 'rote' || a === 'feed'; })`. Inner slot loop's match predicate widened from `=== 'feed'` to `=== 'rote' || === 'feed'`, with a small refactor extracting `const a = r[\`project_${n}_action\`]` to a single per-iteration read.

**B3 (schema):** `'maintenance'` added to `projectActionEnum` at the array tail, with a comment citing dt-form.28 / #146 / #235 and pointing at the form's `PROJECT_ACTIONS` write site. Adjacent enums (`sphereActionEnum`, `feedMethodEnum`, etc.) are untouched.

I traced the regression surface and there's nothing to worry about:

- **Where `r` comes from in feeding-tab.js:** `r = currentSub.responses` (`:314`), where `currentSub = mySub` is set in `renderFeedingTab` to the player's CURRENT submission for the active cycle. The Feeding tab's summary is current-cycle-only — it does NOT iterate historical submissions. So pre-dt-form.22 / DT 1 submissions (which had `_feed_rote === 'yes'` but no project-slot rote info) are never rendered through this path. The `_feed_rote === 'yes'` history pane (`renderFeedingHistoryPane`, `:249`) renders parsed text from `published_outcome`, not `responses` — unaffected by this change.
- **`renderFeedingTab` only fires for submitted submissions** (`if (!currentSub || currentSub.status !== 'submitted') return ''` at `:313`) — drafts don't trigger the rote section render either.
- **Schema change is a strict superset:** old submissions without `'maintenance'` actions still validate. New submissions with `'maintenance'` now pass. No backwards-incompatible behaviour.
- **No other consumer of `_feed_rote`:** confirmed via grep. The dead read removal is complete; this story doesn't leave any orphan readers behind. (The schema still declares `_feed_rote` as a property at `:242` — that's audit D1 cleanup, out of scope here.)

### Action items

**[LOW] Code comment overstates `'feed'` as legacy**

The new comment in `feeding-tab.js:344-347` says:

> "Issue #234 — `_feed_rote` was dropped by dt-form.22; rote is now a per-slot project action. Detect via project-slot scan, mirroring the admin pattern at downtime-views.js:2775-2780. **Legacy `'feed'` retained for back-compat with pre-dt-form.22 submissions where rote info lived in a feed-action slot.**"

The bolded sentence is misleading. `'feed'` is **NOT legacy** — the form CURRENTLY writes `project_${n}_action = 'feed'` for the rote-locked slot at `downtime-form.js:620`, `:2105`, `:3381`. The user-facing PROJECT_ACTIONS dropdown shows `'rote'` as the label, but the rote-lock mechanism (`feedRoteAction && n === feedRoteSlot`) auto-writes `'feed'` rather than `'rote'`. The icons map at `downtime-form.js:159` literally labels `'feed'` as `'Feed (Rote)'`.

So in practice, **most current submissions will have `'feed'` (not `'rote'`) on the rote-locked slot**. The predicate `'rote' || 'feed'` is correct — it handles both — but the comment frames `'feed'` as a back-compat carry-over when it's actually the dominant current value.

**Recommend:** simple copy-edit. Change the third sentence to something like "Match both `'rote'` and `'feed'` because the rote-lock mechanism (`downtime-form.js:620`) auto-writes `'feed'` for the rote-locked slot, while users selecting Rote Hunt manually from the dropdown write `'rote'`." Same effect on code, just accurate framing for future maintainers.

Out of strict scope for this story (no AC mentions code comments). Optional housekeeping; merge without it if you'd rather.

### Tests added by Quinn

**None this pass.** Same standard as #232 / #233 / #236: project has no Vitest, only Playwright E2E. Playwright fixtures for either change would be a 30-line setup for a 1-2 line code change. Not worth it.

If a regression guard is wanted later for B2, the spec would: seed a player session with a synthetic submission having `project_1_action = 'rote'` (or `'feed'`) populated, navigate to the Feeding tab, assert the `.feeding-sum-rote` div is rendered with the slot's territory + description. Say the word and I'll write it.

For B3, the right test surface is the schema validator itself — but the project doesn't run schema unit tests, so this would mean exercising the API endpoint with a synthetic POST. Heavier than warranted.

### What I verified

- ✅ `feeding-tab.js:348-351` — outer gate uses `[1,2,3,4].some(...)` over `project_${n}_action`, predicate matches `'rote' || 'feed'`, derives a `feedRote` const before the `if (feedRote)`
- ✅ `feeding-tab.js:356-358` — inner loop refactored to single `const a = r[\`project_${n}_action\`]`, matches on `a === 'rote' || a === 'feed'`, `break` after first match (prevents double-render if multiple slots qualify)
- ✅ `feeding-tab.js:373` — `break` preserves first-match semantics; if both `project_1_action === 'rote'` AND `project_2_action === 'feed'`, slot 1 renders, slot 2 is skipped (matches pre-fix behaviour for the multi-slot case)
- ✅ Inner loop body unchanged — `_feed_method2` / `_territory` / `_description` reads intact
- ✅ `renderFeedingSummary` only fires on `currentSub.status === 'submitted'` — drafts don't render
- ✅ `renderFeedingHistoryPane` reads `published_outcome` (parsed text), not `responses` — unaffected by this change; legacy DT 1 / pre-dt-form.22 submissions render their text without going through the predicate
- ✅ `_feed_rote` has no other live readers in the codebase (grep across `public/`, `server/`, `tests/` — only the schema declaration at `downtime_submission.schema.js:242` remains, which is audit D1 cleanup, out of scope)
- ✅ Schema diff: `'maintenance'` added to `projectActionEnum` at `:42`, with inline comment in same style as adjacent entries; placed at array tail after `'ambience_change'`
- ✅ Schema diff: `sphereActionEnum`, `feedMethodEnum`, `territoryEnum`, `bloodTypeEnum`, `yesNoGate` are all untouched
- ✅ Schema strict per-slot enforcement at `:64` (`[\`project_${n}_action\`]: { type: 'string', enum: projectActionEnum }`) now accepts `'maintenance'` cleanly
- ✅ `node --input-type=module --check < public/js/tabs/feeding-tab.js` passes
- ✅ `node --check server/schemas/downtime_submission.schema.js` passes (CommonJS — file-path invocation correct)
- ✅ No new dependencies, no CSS, no test infrastructure added
- ✅ British English: zero string additions or deletions

### What I did NOT verify (out of Quinn's static reach)

- ❌ Real player Feeding tab in a browser actually renders the Rote section for a synthetic submission with `project_1_action = 'rote'` populated
- ❌ Same for `project_1_action = 'feed'` (rote-lock auto-write path)
- ❌ Submission with no rote/feed slot — Rote section confirmed hidden
- ❌ Live API actually accepts a POST with `project_1_action: 'maintenance'` without a 400 schema-validation error (the schema CHANGE is verified statically; the runtime ajv compile + validate behaviour requires hitting the endpoint)
- ❌ Existing submissions in `tm_suite` (live) with `'maintenance'` actions — were any saved despite the missing enum, and what state are they in? (Audit suggested verifying this; out of strict AC.)

These are all in Task X.2's manual smoke checklist. **Run them on a local dev server before merging.** The diff itself has only the one cosmetic comment-accuracy note.

### Recommended next steps

1. **Optional:** apply the LOW comment correction (4-line copy-edit), then commit + PR. OR commit as-is and note the comment correction as a follow-up.
2. Run Task X.2 manually in the browser.
3. If smoke passes: PR closes #234 + #235 simultaneously.
4. After merge: the audit's B-blocker queue is fully cleared. Next audit work (D1/D2 schema sweep, D3 fallback chains) is lower priority — cosmetic cleanup, not behavioural fixes.
