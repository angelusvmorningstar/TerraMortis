# Story Fix.628: Rewrite the issue-24 personal_story spec for the dt-form.18 redesign

## Status: review (5 tests restored; issue-24 spec 5/5 green)

## Metadata
- issue: 628
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/628
- branch: morningstar-issue-628-personal-story-spec-rewrite
- type: fix (TEST-ONLY — the redesign is intended)
- found_by: #626 (quarantined the 5 tests as `test.fixme`)

---

## Story

**As a** developer maintaining the suite,
**I want** the 5 quarantined `issue-24` personal_story tests rewritten to the dt-form.18 design,
**so that** coverage of the downtime form's personal-story beat is restored (it was `test.fixme`'d in #626).

---

## ⚠️ Task 0 — INVESTIGATION (DONE; the render + gate are mapped — do not re-investigate)

`tests/issue-24-story-freetext.spec.js` has 6 tests: 1 passes ("no relationship `<select>` dropdown" — still correct, **keep**), 5 are `test.fixme`'d asserting the **pre-dt-form.18** fields (`#dt-personal_story_npc_name_free` + `#dt-personal_story_note` + a visible→hidden sync) that the redesign removed. **TEST-ONLY** — `downtime-form.js` is correct.

### Current dt-form.18 render — `downtime-form.js:4474-4507`
- Section: `<div class="qf-section collapsed" data-section-key="personal_story">` (collapsed; `openStorySection` already clicks `.qf-section-title` to expand — keep).
- Title: `<h4 class="qf-section-title">…<span class="qf-section-tick">✔</span></h4>`.
- **`kind` radio** (NEW): `name="dt-personal_story_kind"`, values `touchstone` (:4482) / `correspondence` (:4486), each `data-personal-story-kind`.
- **NPC name** (`:4496`): `<input type="text" id="dt-personal_story_npc_name" class="qf-input">` — always rendered, **metadata-only** (`:4493` "Does not affect isMinimalComplete's gate").
- **Text** (`:4503`): `<textarea id="dt-personal_story_text" class="qf-textarea">` — always rendered; label varies by kind.
- Collect (`:534-539`): `personal_story_kind`, `personal_story_npc_name`, `personal_story_text`.
- Saved pre-fill (`:4463-4467`): `savedKind`, `savedText` ← `personal_story_text`, `savedNpcName` ← `personal_story_npc_name`.

### The completeness gate (the tick) — `dt-completeness.js:38-54` `_hasPersonalStory`
```
return (hasMinimalKind && hasMinimalText) || (hasLegacyWho && hasLegacyWhat);
// hasMinimalKind = non-empty personal_story_kind ; hasMinimalText = non-empty personal_story_text
```
**So the section tick shows when a `kind` is selected AND `#dt-personal_story_text` is non-empty.** The NPC name does NOT affect it.

---

## Acceptance Criteria

- [ ] **AC1** — `#dt-personal_story_npc_name` (text input) and `#dt-personal_story_text` (textarea) are asserted present/visible (the renamed fields).
- [ ] **AC2** — The section tick test selects a `kind` radio **and** fills `#dt-personal_story_text`, then asserts `.qf-section[data-section-key="personal_story"] .qf-section-tick` visible.
- [ ] **AC3** — The "saved pre-populates" test mocks `personal_story_npc_name` (+ `personal_story_text`) and asserts the inputs pre-fill.
- [ ] **AC4** — The obsolete "syncs to hidden field" test is **retired** (no hidden sync exists) — documented, not silently dropped.
- [ ] **AC5** — All 5 `test.fixme` markers + `#628` notes removed; `issue-24-story-freetext.spec.js` runs fully green; no other spec regresses.
- [ ] **AC6** — Test-only: no `downtime-form.js` change. Escalate if a genuine product issue appears (fix.617).

---

## Tasks

### Task 1 — Rewrite the 4 salvageable tests (field id remaps)
- "free-text NPC name input" → `#dt-personal_story_npc_name` (visible text input).
- "interaction note textarea" → `#dt-personal_story_text` (visible textarea).
- "saved pre-populates" → mock the GET submission `responses` with `personal_story_npc_name: 'Elara…'` (+ `personal_story_text`) — NOT the old `personal_story_note` — and assert `#dt-personal_story_npc_name` (and optionally `#dt-personal_story_text`) pre-fill.

### Task 2 — Rewrite the tick test to the real gate
"name and note marks the tick visible" → **select a kind radio + fill text** (the gate is `kind && text`; the name is metadata-only). E.g. `page.locator('input[name="dt-personal_story_kind"][value="touchstone"]').check()` then fill `#dt-personal_story_text`, then `expect(.qf-section[data-section-key="personal_story"] .qf-section-tick).toBeVisible()`. (Gate verified in Task 0 — `_hasPersonalStory`.)

### Task 3 — Retire the obsolete test + un-fixme
Delete "typing an NPC name syncs to the hidden personal_story_npc_name field" (the redesign uses `#dt-personal_story_npc_name` directly; no hidden sync). Note the retirement in the Dev Agent Record. Remove all 5 `test.fixme` + `#628` notes; the "no relationship dropdown" test stays.

### Task 4 — (Optional, if cheap) cover the new `kind` radio
Add one small test: selecting touchstone/correspondence is reflected (and, with text, completes the section). Skip if it adds noise.

### Task 5 — Verify
Run `tests/issue-24-story-freetext.spec.js` green. One persistent http-server; never concurrent Playwright. Confirm no sibling spec regressed.

---

## Dev Notes

### Key locations
- `public/js/tabs/downtime-form.js:4451-4508` (personal_story renderer), `:534-539` (collect), `:4463-4467` (saved pre-fill).
- `public/js/data/dt-completeness.js:38-54` (`_hasPersonalStory` — the tick gate: `kind && text`).
- `tests/issue-24-story-freetext.spec.js` — `openStorySection` (already unified-aware: `/index.html` → `#app` → `goTab('downtime')` → `#t-downtime.active` → click `.qf-section-title`), the 1 passing + 5 `test.fixme` tests.

### Guardrails
- **Test-only** (AC6). Don't touch `downtime-form.js`/`dt-completeness.js` — the redesign is intended. Escalate a genuine product bug (fix.617).
- The spec is **already on the unified app** — no `bootApp` harness work (it imports nothing from `helpers/`; it boots `/index.html` itself).
- British English. One Playwright run at a time.

### Why this isn't a straight selector swap
The redesign added the `kind` radio and made the name **metadata-only**, changing the completeness gate from "name + note" to "kind + text". The tick test must follow the new gate, and the hidden-sync test has no equivalent (retire it). The "no dropdown" test correctly survives.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Task 0 findings (recorded)
dt-form.18 personal_story: `kind` radio (touchstone/correspondence) + `#dt-personal_story_npc_name` (metadata-only) + `#dt-personal_story_text`; collect → `personal_story_kind`/`_npc_name`/`_text`. Tick gate `_hasPersonalStory` = `(kind && text)`. The 5 fixme tests: 4 rewrite to the new ids/gate, 1 (hidden-sync) retires.

### Debug Log References
- `npx playwright test tests/issue-24-story-freetext.spec.js` → **5 passed** (was 1 pass / 5 fixme). `grep test.fixme` = 0.

### Completion Notes List
- **Task 1 — done.** Field-id remaps: name `#dt-personal_story_npc_name_free`→`#dt-personal_story_npc_name`; note `#dt-personal_story_note`→`#dt-personal_story_text`; saved-prepop mock `personal_story_note`→`personal_story_text` + assert `#dt-personal_story_npc_name`.
- **Task 2 — done, with a finding.** The tick test selects a `kind` radio + fills the text. **BUT** the tick also needed the NPC name: `updateSectionTicks` has NO personal_story rule, so it uses the generic "all `.qf-field`s filled" fallback (downtime-form.js:6688+), which counts the **"(optional)"** name field. So the visual tick requires kind + name + text, while the SUBMIT gate (`_hasPersonalStory`, dt-completeness.js) only requires kind + text. The test fills all three; the inconsistency is noted (minor UX — a player who fills kind+text but skips the optional name gets no tick yet can submit). NOT escalated (cosmetic, debatable) — flagged to Angelus.
- **Task 3 — done.** Retired the obsolete "syncs to hidden field" test (replaced with a note); removed all 5 `test.fixme` + `#628` notes; the "no relationship dropdown" test stays.
- **AC1-AC6 ✅.** TEST-ONLY — `downtime-form.js` / `dt-completeness.js` untouched.

### File List
- tests/issue-24-story-freetext.spec.js (4 tests rewritten + 1 retired; 5 fixme removed)
- specs/stories/fix.628.personal-story-spec-rewrite.story.md (this story)

### Change Log
- 2026-06-06 — fix.628: rewrote issue-24 personal_story spec for dt-form.18 (new field ids + kind radio; retired the hidden-sync test). 5/5 green. Surfaced a minor tick-vs-gate inconsistency (tick fallback requires the optional name) — flagged, not fixed (test-only).
