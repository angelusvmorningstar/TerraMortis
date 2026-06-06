# Story Fix.617: Re-enable 46 DT-processing spec tests deferred as product drift

## Status: in-progress

> **UNBLOCKED 2026-06-06.** The audit (Dev Agent Record) found ~44/46 tests assert behaviour the product no longer has. Angelus ruled per cluster — ALL intended, zero regressions. Rulings:
> - **Committed pool status (~19)** — INTENDED removal. Retire tests of the removed badge/lock/committed-button; rewrite any salvageable to the current "No Roll Needed / Roll" model.
> - **Block Confirm panel (4, C4)** — auto-render is correct; retire the Confirm-Block tests. **Additive follow-up (raise separate issue):** a player block must surface in any relevant intelligence (cross-reference views) with STs always able to override.
> - **Second Opinion button (3, DT-Fix-25)** — INTENDED removal. Retire.
> - **Secrecy/Lead on merit+project investigate (4: DT-Fix-23 ×2, DTQ-3 ×2)** — INTENDED on both. Rewrite to assert presence on both (drop the project-only distinction).
> - **Sorcery panel (~7: B2 ×3, DTS-1 ×2, DTS-2 ×2)** — INTENDED consolidation. Rewrite to the single Rite-select + Connected-Characters picker.
> - **Character-target picker (4, DT-Fix-19)** — INTENDED. Rewrite to the unified Connected-Characters picker.
> - **Remaining ~10 (contacts Subject→Target, F312-4 mod-total, DTX-1/2/3, DTR-2 contested #608, DT-Fix-21)** — markup/new-feature alignment. Rewrite to current DOM; escalate any that reveals a real gap.
>
> Net: this becomes a test-rewrite (no product changes, AC5 holds) — rewrite redesigned-panel tests to the new DOM, delete tests of genuinely-removed features, and raise ONE additive product issue for block intelligence+override.

## Metadata
- issue: 617
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/617
- branch: morningstar-issue-617-dt-spec-drift-tests
- type: test maintenance
- predecessor: fix.614 (flat-wall navigation repair; deferred these 46 via `test.fixme`)

---

## Story

**As a** developer relying on the DT-processing E2E suite for real coverage,
**I want** the 46 tests deferred during fix.614 re-aligned to the current product DOM and un-skipped,
**so that** the committed-status, sorcery, block, character-target, contested-roll and related features regain live test coverage instead of silently sitting as `test.fixme`.

---

## Background

fix.614 repaired the flat-card-wall (#581/#585) navigation breakage across 6 DT specs. During that work, 46 tests were found to be failing for a **different** reason: they assert against DT-processing UI selectors/labels that drifted in *unrelated* product work (DTQ epic, #608 contested roll, committed-status feature, etc.). The flat-wall navigation conversion is correct — the right action cards open — but the inner assertions are stale.

Per the fix.614 scope decision (2026-06-06, Angelus), those 46 were marked `test.fixme` with inline `// DEFERRED (fix.614 out-of-scope)` comments and tracked here. **The product is believed correct; the tests are stale.** This story re-aligns each stale assertion to the current DOM and removes the `.fixme`.

### Guiding rule (same as fix.614 AC7)

**Test-only changes.** Do NOT modify product code. If a test reveals what looks like a genuine product regression (not just a renamed selector), STOP and raise it as a separate issue rather than patching product to make the test pass.

### Where the 46 live (verify counts before starting)

```
grep -c "test.fixme(" tests/downtime-processing-consistency.spec.js   # 11 individual + 1 describe.fixme (5 tests) = 16
grep -c "test.fixme(" tests/downtime-processing-dt-fixes.spec.js      # 29
grep -c "test.fixme(" tests/downtime-processing-feature312.spec.js    # 1
```
Every deferred test carries a `// DEFERRED (fix.614 out-of-scope)` comment naming the drift. Use those comments as the work-list.

### Method for each test (the loop)

1. Open the relevant action card via the existing `openActionInPhase(page, <key>)` helper (already correct from fix.614).
2. From the captured DOM (or by reading the render in `public/js/admin/downtime-views.js`), find the **current** selector/label for the thing the test asserts.
3. Update the test's locator/assertion to match. Remove the `// DEFERRED ...` comment and the `.fixme` (restore plain `test(` / `test.describe(`).
4. Run just that spec; confirm the un-skipped test passes and nothing else regressed.

---

## Acceptance Criteria

- [ ] **AC1** — All 46 deferred tests re-enabled (no `test.fixme` / `test.describe.fixme` referencing fix.614 drift remain in the 3 specs) OR, for any test that exposes a real product regression, that test is documented + a separate issue raised and the test left skipped with a comment pointing at the new issue.
- [ ] **AC2** — `tests/downtime-processing-consistency.spec.js` fully green (all 38 run, 0 skipped for drift).
- [ ] **AC3** — `tests/downtime-processing-dt-fixes.spec.js` fully green.
- [ ] **AC4** — `tests/downtime-processing-feature312.spec.js` fully green.
- [ ] **AC5** — No product code changes (only `tests/**` modified). Any suspected regression is escalated, not patched.
- [ ] **AC6** — The 6-file DT suite still passes together (no cross-file regression).

---

## Tasks (grouped by feature area — tackle incrementally)

> Order is easiest-first: confirmed-simple renames before the investigate-needed ones. Each task ends by removing the `.fixme` and running the file.

### Task 1 — Contacts "Subject" → "Target" rename (consistency B3, 1 test) — SIMPLE

The field was renamed in the DTQ epic (`dd1ce56f`). Product renders `.proc-contacts-target-input` (a "Target" field) at `downtime-views.js:~7414`; the old `.proc-contacts-subject-input` no longer exists.
- Test: `subject field is a text input` (`downtime-processing-consistency.spec.js`, B3).
- Update `.proc-contacts-subject-input` → `.proc-contacts-target-input`; the rest of the assertion (is an `<input>`) holds. Consider renaming the test title to "target field".

### Task 2 — Character target selectors → "Connected Characters" UI (dt-fixes DT-Fix-19, 4 tests; consistency B2 targets) — RESTRUCTURE

The radio/checkbox target lists (`.proc-inv-target-radio`, `.proc-sorc-target-chk`) were replaced by a "Connected Characters" picker (seen in the fix.614 DOM capture: the investigate card shows "Connected Characters" + "Target / Secrecy"). 
- Read the current investigate + sorcery target render in `downtime-views.js` (search `Connected Characters`, `proc-conn`, target-picker classes).
- Re-point: "renders as radio list" / "renders as checkboxes" / "contains all non-retired characters" tests to the current picker element + option source. The "does NOT contain retired" siblings currently pass vacuously — confirm they still hold against the real picker.

### Task 3 — Committed pool status feature (consistency E2 = 16 incl. the `describe.fixme`; dt-fixes DT-Fix-17 = 4, DT-Fix-22 = 2) — INVESTIGATE

The committed-status surface drifted: `.proc-pool-committed-badge`, `.proc-row-status.committed`, `.proc-val-btn[data-status="committed"]`, `.proc-row-validator`, `.proc-proj-roll-btn`, and the pool-builder locked state (`[Committed]` badge, disabled selects, `.proc-feed-mod-panel.proc-pool-committed`).
- Read how committed status renders now (search `committed`, `proc-pool-committed`, `proc-val-btn` in `downtime-views.js`). Note `feature.96` changed the Roll button to no longer require Committed first — DT-Fix-22's premise may have shifted.
- Re-point each assertion; restore the `test.describe.fixme('E2 — Committed pool status — pool builder locked', …)` to `test.describe(` once its 5 tests align.

### Task 4 — Block resolution panel (consistency C4, 4 tests) — INVESTIGATE

The block card renders via the auto/rolled branch, not the `actionType==='block'` "Block Resolution" branch (`downtime-views.js:~7546`, which has `.proc-block-confirm-btn` + the "Auto-blocks" label). The fix.614 capture showed a `block` merit action rendering "Automatic Successes" instead of the Block Resolution panel.
- Trace why `makeMeritSubmission('block')` lands on the auto branch — check `buildProcessingQueue` mode derivation for block actions and what `actionType`/`mode` the card sees. If blocks legitimately render differently now, update the test to the current block UI. **If blocks should reach the block branch and do not, that is a candidate real regression — escalate per AC5.**

### Task 5 — Sorcery edit-panel selectors (consistency B2, 3 tests; dt-fixes DTS-1 = 2, DTS-2 = 2) — INVESTIGATE

`.proc-sorc-tradition-sel` / `.proc-sorc-rite-sel` are referenced in handlers (`downtime-views.js:4884-4885`) but the B2 tests open the card, click `openDetailsEdit`, and don't find them. The ST-sorcery panel (DTS-1) and duplicate-action (DTS-2) tests are in the same family.
- Read the current sorcery detail/edit render; confirm whether the tradition/rite selects render only in a specific edit state or were renamed. Re-point assertions; align DTS-2 duplicate flow (`.proc-duplicate-btn`, `.proc-row-st-badge`) to current markup.

### Task 6 — Remaining feature-specific drift (dt-fixes) — RE-ALIGN

One test cluster each; read current DOM and re-point:
- **DT-Fix-21** territory pills default (1) — `.proc-terr-pill[data-terr-id=""]`.
- **DT-Fix-23** merit auto-successes "does NOT have" secrecy/lead (2) — these moved to the project panel; confirm absence assertion against current merit card.
- **DT-Fix-25** Second Opinion button relocation (3) — find the button's current home in the right-panel status section.
- **DTQ-3** lead ticker absence on merit investigate (2).
- **DTX-1** cross-reference callouts (2) — `proc-xref` / callout class.
- **DTX-2** compact panel for binary merit actions (1).
- **DTX-3** notes/feedback hierarchy (2) — `.proc-feedback-section`, ST-Notes ordering.
- **DTR-2** contested roll (2) — the contested widget shipped in #608 (just merged); align to the current `contested` toggle + char selector + `att − def = net` roll-card format.

### Task 7 — feature312 F312-4 mod-total (1) — SIMPLE/INVESTIGATE

`.proc-mod-total-row` / `.proc-mod-total-val` timed out (element absent). Find the current mod-total markup in the feeding right panel and re-point; the sibling F312-4 test (`data-fg` at most +5) already passes, so the FG-cap value is computed correctly.

### Task 8 — Final pass

Run the 3 specs, then the full 6-file DT suite:
```
npx http-server public -p 8080 -s   # one persistent server (see memory: never run concurrent Playwright)
npx playwright test tests/downtime-processing-consistency.spec.js tests/downtime-processing-dt-fixes.spec.js \
  tests/downtime-processing-feature312.spec.js --reporter=line --workers=4
# then the full set incl. fix-491, dt-form-34, admin-smoke
```
Record the final pass/skip/fail tally in the Dev Agent Record. Target: 0 drift-skips.

---

## Dev Notes

### Key files
- `public/js/admin/downtime-views.js` — all DT-processing render + queue logic. Phase keys/labels at lines 107–153. Contacts render ~7405–7419; block branch ~7546; sorcery handlers ~4884; filter bar ~4553; `_procFilters` default (empty phases = show all rows) at line 71.
- `tests/downtime-processing.spec.js` — the reference spec with the canonical `openActionInPhase(page, phaseKey)` helper (already copied into the 3 target specs by fix.614).
- `specs/stories/fix.614.repair-flat-wall-broken-specs.story.md` — predecessor; its Dev Agent Record documents the architecture findings and which selectors drifted.

### Architecture facts carried from fix.614
- The main processing queue is a **flat `.proc-action-row` list** driven by filter pills; `.proc-phase-section`/`.proc-phase-header` survive only for the XP-Review / Deleted / Add-ST special sections. Do not reintroduce accordion navigation.
- Filter pills: `.proc-filter-pill[data-filter-dim="phases"][data-filter-val="<key>"]`. Keys: feeding, resolve_first, support, ambience, hide_protect, investigate, attack, patrol, misc, contacts, acquisition. Pills only render for **populated** phases (clicking a pill for an empty phase hangs — see the DTQ-1 fix in fix.614).
- `openActionInPhase` clicks a pill (re-rendering to just that phase) then `.proc-action-row.first()`. With one submission per test this is deterministic.

### Testing infra (carry from memory)
- **Never run concurrent Playwright processes** — they share one port-8080 `http-server` (`reuseExistingServer: true`); a second run tears the server down mid-suite and yields fake `ERR_CONNECTION_REFUSED`. Stand up ONE persistent server first; kill stray `node…playwright`/`http-server` before a clean run.
- Each full DT spec run is ~7–8 min single-worker (~2.5 min with `--workers=4` against a stable server and most tests skipped). Capture to a file (`> out.txt 2>&1`), grep the summary block, batch fixes — do not iterate per-test.
- `consistency` uses `fake-test-token` + cycle `status: 'active'`; `dt-fixes`/`feature312`/reference use `local-test-token`. Cycle status must resolve to the `projects` tab (`_initialDtuxTab`, downtime-views.js:309) or the queue panel is hidden — `'active'`/`'open'` both fine here since the specs already handle the tab.

### Escalation
This is test-maintenance: every change re-aligns a stale assertion. The moment a "stale selector" turns out to be a genuine missing feature/regression in the product, STOP, leave that test skipped with a comment naming a NEW issue, and report it. Do not patch product code under this story (AC5).

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Debug Log References
Un-skipped all 46 (sed strip of `.fixme`), ran the 3 specs against current `dev` (`--workers=4`, 7.4 min): **73 passed, 45 failed**. Captured Playwright `error-context.md` ARIA snapshots per failure to read the real current DOM. Then reverted the 3 specs to the committed (green, all-skipped) state — branch left untouched.

### Completion Notes List — AUDIT (the real finding)

The premise of fix.617 ("stale selectors, re-align to current DOM, test-only") is **only true for 1–2 of the 46**. The rest assert behaviour the product no longer exposes — these are UI redesigns (intended) or removals (possibly regressions) from product work that post-dates the specs. Classification from the ARIA snapshots:

| Cluster | Tests | Current DOM (from ARIA snapshot) | Likely nature |
|---|---|---|---|
| Contacts Subject→Target (consistency B3) | 1 | `.proc-contacts-target-input` ("Target" field) | **Mechanical rename — safe to rewrite** |
| Sorcery panel (consistency B2; dt-fixes DTS-1/2) | ~7 | Single "Rite" select (`Select Rite`/`Custom…`) + "Connected Characters"; no `.proc-sorc-tradition-sel`/`-rite-sel`/`-targets-sel` | Redesign — likely intended; rewrite to new UI |
| Investigate char target (dt-fixes DT-Fix-19) | ~4 | "Connected Characters" picker + Target/Secrecy/Lead; no `.proc-inv-target-radio`/`.proc-sorc-target-chk` | Redesign — likely intended; rewrite |
| Merit investigate secrecy/lead (dt-fixes DT-Fix-23) | 2 | Card **shows** Secrecy + Lead/No-Lead | Premise FLIPPED ("moved to project panel" reverted?) — **ruling needed** |
| Committed pool status (consistency E2; dt-fixes DT-Fix-17, DT-Fix-22) | ~19 | No `[Committed]` badge / committed `.proc-val-btn` / `.proc-pool-committed-badge` / `.proc-row-status.committed`; row shows "No Roll Needed"/"Roll" | Feature appears REMOVED/restructured — **ruling needed (regression?)** |
| Block Confirm panel (consistency C4) | ~4 | Renders auto/effect branch ("Auto blocks merit of same level or lower"); no "Block Resolution" panel or `.proc-block-confirm-btn` | **ruling needed (regression?)** |
| Second Opinion button (dt-fixes DT-Fix-25) | ~3 | Not present in the action card | **ruling needed (removed/relocated?)** |
| DTX-1 xref / DTX-2 compact / DTX-3 notes / DTR-2 contested(#608) / DTQ-3 / DT-Fix-21 terr pills / F312-4 mod-total | ~6 | Feature-specific markup changes | Per-area rewrite |

### Recommendation for re-scoping
1. **Split the 4 "ruling needed" clusters into their own audit/issues** — committed-status (~19 tests is the big one), Second Opinion, block Confirm, merit secrecy/lead. For each: confirm with Angelus whether the current behaviour is intended; if a regression, raise a product issue and keep the test skipped pointing at it; if intended, rewrite the test.
2. **The redesign clusters (sorcery, investigate, contacts) can be a small test-only PR** once someone confirms the new panels are the intended design — ~12 tests, no rulings beyond "is this the design now?".
3. Do NOT bulk-rewrite to "match current DOM" (the rejected option) — it would convert any genuine regression into a green, expected-behaviour test.

### Execution progress (2026-06-06) — 33 of 46 done, all green

After the per-cluster rulings, implementation began. Done (verified green):
- **consistency.spec.js — fully green (24 pass, 0 skip).** B2 sorcery rewritten to `.proc-rite-select` + Connected-Characters picker (tradition-optgroups assertion retired — rites data not mocked in harness). B3 contacts subject→`.proc-contacts-target-input`. C4 Confirm-Block tests retired (auto now). E2 committed-status describes deleted (feature removed); kept the block-has-no-pool-builder test.
- **dt-fixes.spec.js — green (42 pass, 12 skip).** DT-Fix-17 (committed) retired; DT-Fix-19 → Connected-Characters picker presence (static-list content tests retired); DT-Fix-22 committed-Roll cases retired; DT-Fix-23 + DTQ-3 secrecy/lead flipped absent→present; DT-Fix-25 (Second Opinion) retired.

**Remaining 13 (still `test.fixme`, suite stays green) — DOM-investigation clusters for a focused follow-up:**
- dt-fixes: DT-Fix-21 territory pills (1); DTX-3 notes/feedback hierarchy (2); DTX-2 compact panel (1); DTX-1 xref callouts (2); DTR-2 contested roll → align to #608 widget (2); DTS-1 ST sorcery panel (2, reuse the consistency-B2 Rite/Connected-Characters approach); DTS-2 duplicate action (2).
- feature312: F312-4 mod-total markup (1).

### Selector map for the remaining 13 (captured 2026-06-06 via un-skip + ARIA-snapshot run; 12 fail / 1 already passes)

A second dev-story pass un-skipped all 13 and captured the live DOM. Apply this map next time (read → rewrite → one verify run); branch was reverted to green afterward (no commit). The subtle ones are flagged.

- **DT-Fix-21 territory pills (`bf607`)** — `.proc-terr-pill[data-terr-id]` exists (render `downtime-views.js:6752`, handler `:4909`). Test wants the no-territory pill `[data-terr-id=""].active` by default. Verify the default-active pill's `data-terr-id` (the "N/A" pill) — likely a non-empty id or not active by default; adjust the assertion.
- **DTX-1 xref callouts (`a4128`, `df89a`)** — class is `.proc-xref-callout` / `.proc-xref-line` (render `:9181`, also `:9948`). Driven by `_xrefIndex` (built `:4669`). Needs ≥2 submissions sharing `terr:<territory>` or `inv-target:<name>`. Tests already set up two chars — check whether the fixtures actually populate the index (territory string must match canonical) and whether the callout renders in the opened card vs the snapshot panel.
- **DTX-2 compact panel (`155a3`)** — compact = `.proc-compact-merit-panel` (`:7385`); full-mode uses `.proc-val-status`. The 3 compact tests pass; the "full-mode (allies investigate) not compact" one fails — confirm `.proc-val-status` still renders for merit investigate (it gained secrecy/lead, so it's full, not compact).
- **DTX-3 notes/feedback (`0565e`, `1d77a`)** — `.proc-notes-panel` exists (`:9130`, "ST Notes"). **`.proc-feedback-section` does NOT exist** — Player Feedback section is at `:9159-9161` (title "Player Feedback — sent to player") with textarea `.proc-feedback-input` (`:5383`); find that section's container class and re-point. The "ST Notes above Player Feedback" test may be hitting a compact entry (notes move to `.proc-compact-notes-panel` `:7445`) — check the fixture's action mode.
- **DTR-2 contested roll → #608 widget (`f0e69`, `aeddd`)** — toggle `.proc-contested-toggle` (`:6252`) exists. Char picker is **`.proc-conn-typeahead[data-ta-save="contested_char"]`** (NOT `.proc-contested-char-sel`); resistance pool is **trait chips `.proc-contested-trait` / `.proc-contested-bp`** (NOT `.proc-contested-pool-input`); roll btn `.proc-contested-roll-btn` (`:6294`). Rewrite 1282 (on shows picker+chips) and 1303 (off hides them) to these. 1290 (att−def=net) — inspect the contested roll-result format in `.proc-proj-roll-card .proc-proj-roll-result`; DTR-1 (passing) shows `.proc-proj-roll-result` carries "net" for modified rolls.
- **DTS-1 ST sorcery (`1455c`, `3e0b0`)** — reuse the consistency-B2 fix: rite is `.proc-rite-select` (`:9296`), no separate **Tradition** field (consolidated), so 1402's "Tradition" assertion is obsolete → assert the Rite field / `.proc-feed-desc-card`. 1423 (status incl. "Resolved"/"No Effect") — check the sorcery action-ribbon status set (`_renderActionRibbon`).
- **DTS-2 duplicate (`baa65`)** — `.proc-duplicate-btn` + `.proc-row-st-badge` exist (the "button present" tests pass). 1482 (click adds an ST row) fails — verify the duplicate click path adds a `.proc-action-row` in the test harness (may need the rules/save mock or a re-render wait).
- **F312-4 mod-total (`ed1fc`)** — `.proc-mod-total-row` / `.proc-mod-total-val` exist, but the **feeding** mod-total-val is `display:none` (`:7273`/`:7283`). Read its `textContent` (works on hidden) rather than asserting visibility, or assert against a visible element.

**Block follow-up (additive product issue):** raised as **#619** — player block must surface in relevant intelligence with ST override.

### File List
- tests/downtime-processing-consistency.spec.js (rewrites + deletions — fully green)
- tests/downtime-processing-dt-fixes.spec.js (partial — DT-Fix-17/19/22/23/25 + DTQ-3 done; DT-Fix-21, DTX-1/2/3, DTR-2, DTS-1/2 still fixme)
- specs/stories/fix.617.dt-spec-drift-tests.story.md (this story)
- specs/stories/sprint-status.yaml (last_updated log)

### Second execution pass (2026-06-06) — 42 of 46 done

Applied the selector map to the 13 remaining; **9 more re-aligned and green**, 4 deferred:
- Fixed: DT-Fix-21 (`.active`→`.is-active`), DTX-2 (full-vs-compact via secrecy control, `.proc-val-status` removed), DTX-3 (`.proc-feedback-section`→`.proc-player-note-section`), DTR-2 toggle on/off (#608 typeahead `[data-ta-save="contested_char"]` + `.proc-contested-trait` chips), DTS-1 (Rite selector + unified Pending/Valid/Complete ribbon — "Tradition"/"Resolved"/"No Effect" removed), F312-4 (hidden `.proc-mod-total-val` via textContent).
- **Deferred (3, `test.fixme` with inline notes):** DTX-1 territory-shared xref ×2 — **CONFIRMED product bug, raised as #621:** the territory xref lookup at `downtime-views.js:9169` (Block A) uses the raw territory key while the index (`:4672`) and the sibling path (`:9961`, fixed in 496.2) use the canonical `resolveTerrId` key, so the territory cross-reference callout silently never renders on that card path (production too) — un-skip once #621 lands; DTS-2 duplicate-creates-entry — **confirmed** harness limit (the action-row count stays 1 in-test because the stateless route-mock doesn't reflect the duplicate's persistence; needs a stateful submissions mock).

**Pass 3 (2026-06-06):** DTR-2 att−def-net **fixed** — the format IS "N att − M def = K net" (`:8088`); the locator just needed scoping to the `net` line (`.first()` was grabbing the separate defence-successes line). DTS-2 verified to be a genuine harness limit (not a quick fix).

dt-fixes + feature312: **63 pass, 3 skip, 0 fail.** consistency: 24 pass. Net **43/46 done**.

### Change Log
- 2026-06-06 — Story created (ready-for-dev) → dev-story audit re-scoped it (needs-decision) → Angelus ruled all 7 clusters intended → implementation pass 1: 33/46 re-aligned/retired (merged to dev via PR #620). Pass 2: +9 re-aligned (42/46 green); 4 deferred as documented hard cases (1 possible xref gap flagged per AC5). Block intelligence+override raised as #619.
