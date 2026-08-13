# EQC-4 adversarial review findings

## High

### [Pass 2] The captured tweak request is invisible in the ST processing UI

- **Severity:** High
- **File:line:** `public/js/admin/downtime-views.js:1647`
- **Triggering input or sequence:** In the supplied diff state, a player selects a tweakable item, checks `equipment_${n}_tweak`, saves/submits, and an ST opens the submission in the normal downtime-processing view.
- **Observable consequence:** The response bag retains `'true'`, but the complete equipment renderer reads only catalogue id/name, quantity, and notes. There is no generic unknown-key fallback. The ST sees an ordinary equipment request and cannot see or adjudicate the tweak.
- **Confidence:** High. A repository-wide JavaScript search found no downstream reader outside the player form/tests. A concurrent process later added an admin renderer patch, but that patch was not in the supplied diff and appeared only after this finding was frozen.

### [Pass 3a] The story's core “ST can see and adjudicate” outcome is missing

- **Severity:** High
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:15`; `public/js/admin/downtime-views.js:1647`
- **Triggering input or sequence:** Submit a checked structured tweak request and review it through the story's existing ST adjudication workflow.
- **Observable consequence:** The Story explicitly promises a request “the ST can see and adjudicate,” while the supplied implementation only stores the response key. Its sole normal ST surface omits that key, so the central user outcome is absent.
- **Confidence:** High.

## Medium

### [Pass 1] A checked tweak request follows the row, not the selected catalogue item

- **Severity:** Medium
- **File:line:** `public/js/tabs/downtime-form.js:2785`; `public/js/tabs/downtime-form.js:5613`
- **Triggering input or sequence:** Select tweakable item A, check the tweak box, then change the same row directly to tweakable item B.
- **Observable consequence:** The change handler collects after the select contains B but while A's checked box remains in the DOM. It saves B's id with `'true'`, then renders B checked. A request made for A silently becomes a request for B.
- **Confidence:** High from the supplied diff's event/data flow.

### [Pass 1] Dual-shaped combat gear is silently and irreversibly treated as a weapon

- **Severity:** Medium
- **File:line:** `public/js/data/equipment-derivation.js:390`
- **Triggering input or sequence:** Pass `combat_gear` with any populated weapon discriminator and any populated armour discriminator.
- **Observable consequence:** Weapon shape is checked first, so the helper returns `damage_mod` with no route to request `armour_value`.
- **Confidence:** Medium in Pass 1 because mutual exclusivity was unknown then; Pass 2 confirmed the supported admin/schema permit both shapes.

### [Pass 2] The supported catalogue model makes the weapon-first ambiguity reachable

- **Severity:** Medium
- **File:line:** `public/js/admin/equipment-catalogue-admin.js:32`; `server/schemas/equipment_catalogue.schema.js:50`; `public/js/data/equipment-derivation.js:390`
- **Triggering input or sequence:** Use catalogue admin to populate weapon and armour fields on the same `combat_gear` row; the admin exposes all five inputs together and explicitly says both are possible.
- **Observable consequence:** A supported catalogue row can request only its weapon tweak even though it is also armour-shaped. No schema or admin validation establishes the “exactly one” premise.
- **Confidence:** High. Direct execution of `{ bucket:'combat_gear', damage_mod:1, armour_value:2 }` returned `damage_mod`.

### [Pass 2] Valid stat-less skill gear is falsely advertised as tweakable

- **Severity:** Medium
- **File:line:** `public/js/data/equipment-derivation.js:395`; `server/schemas/equipment_catalogue.schema.js:47`; `public/js/admin/equipment-catalogue-admin.js:287`
- **Triggering input or sequence:** Create `skill_gear` with blank/null `bonus_dice`, which the schema and admin permit, then select it in downtime.
- **Observable consequence:** The helper checks only the bucket and returns `bonus_dice`, so the UI offers a `+1 bonus_dice` request for a numeric stat the item does not have.
- **Confidence:** High. Direct execution returned `bonus_dice` for `{ bucket:'skill_gear' }`.

### [Pass 2] An availability-5 tweak produces a cost the catalogue cannot represent

- **Severity:** Medium
- **File:line:** `public/js/data/equipment-derivation.js:407`; `public/js/tabs/downtime-form.js:5612`; `server/schemas/equipment_catalogue.schema.js:58`
- **Triggering input or sequence:** Select any tweakable entry with raw `availability: 5`; with Resources 5 plus Fixer, `rawMax` is 6.
- **Observable consequence:** The helper and label produce availability 6, and the maxed Fixer character gets no warning because `6 > 6` is false. Yet the mandated distinct catalogue entry cannot store availability 6 because schema/admin cap it at 5.
- **Confidence:** High about the code/schema mismatch; Medium about intended above-scale adjudication because the story gives no boundary rule.

### [Pass 3a] AC #3/#4 do not permit stale affirmative state, but a new item inherits it

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:73`; `public/js/tabs/downtime-form.js:2785`
- **Triggering input or sequence:** Check item A's request, then select tweakable item B in the same slot.
- **Observable consequence:** AC #3 says the control is unchecked by default and AC #4 says the rerender tracks the current item, but B appears checked without a fresh affirmative action.
- **Confidence:** High. A concurrent patch later cleared the row flag, but it was not part of the reviewed diff.

### [Pass 3a] AC #5 names the effective cap, but the implementation compares a different numeric threshold

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:81`; `public/js/tabs/downtime-form.js:5559`; `public/js/tabs/downtime-form.js:5614`
- **Triggering input or sequence:** Resources 2 plus Fixer, with a tweakable availability-2 item: tweaked cost is 3, `availabilityCap` is 2, and `rawMax` is 3.
- **Observable consequence:** The AC's literal `3 exceeds effective cap 2` condition is true, but `3 > rawMax(3)` is false and no warning appears. `rawMax` is the maximum affordable raw cost, not the numeric value returned by `availabilityCap`.
- **Confidence:** High on the values/result; Medium on terminology because the implemented comparison is algebraically equivalent to the existing Fixer-adjusted `isAffordable` behavior.

### [Pass 3a] The “exactly one stat” premise is not enforced and AC #1 is ambiguous for supported hybrids

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:32`; `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:66`; `public/js/admin/equipment-catalogue-admin.js:32`
- **Triggering input or sequence:** Create a dual-shaped combat row or a stat-less skill row through supported tooling.
- **Observable consequence:** Background says every tweakable item actually has exactly one primary numeric stat. The repository enforces neither half. AC #1 simultaneously requires weapon-shaped rows to return `damage_mod` and armour-shaped rows to return `armour_value`, with no precedence for a row satisfying both; its bucket-only skill wording conflicts with Background for a missing bonus.
- **Confidence:** High.

### [Pass 3b] AC #5's warning is rendered even when no tweak was requested

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:81`; `public/js/tabs/downtime-form.js:5614`
- **Triggering input or sequence:** Select an over-cap tweakable item but leave the newly rendered tweak checkbox unchecked.
- **Observable consequence:** `overCap` and `warning` depend only on selected item/cost, not `tweakChecked`. The row immediately warns that the ST must adjudicate even though the player has not requested the tweak. AC #5 is explicitly conditional on the checkbox being checked.
- **Confidence:** High for the supplied diff.

### [Pass 3b] The record's claim that all 100 failed files are DB-guard trips is false

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:140`
- **Triggering input or sequence:** Run the full suite and inspect the named failures, including a run that reproduces 100 failed / 79 passed files.
- **Observable consequence:** `n7-n9-allocator-readers.test.js` and `oath-a-pledge-helpers.test.js` contain the two ordinary assertion failures. Those files are included among the 100 failed files, so all 100 cannot simultaneously be DB-guard import failures; at most 98 are. The record over-attributes its baseline noise.
- **Confidence:** High. The matching run reported exactly those two failed tests plus 100 failed files.

### [Pass 3b] The merged-import isolation counts are misstated

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:145`; `server/tests/issue-896-availability-filter.test.js:162`
- **Triggering input or sequence:** Temporarily merge the two new names into the original import, run the two touched files, then run issue #896.
- **Observable consequence:** The two touched files pass **88/88 combined** (64 + 24). Issue #896 then passes 27/28 and fails the exact import assertion, making the three-file result 115/116—not “the two touched test files ... 88/88 and 116/116 in isolation.” The technical split-import rationale is sound, but the stated isolation numbers are not.
- **Confidence:** High; reproduced by execution.

### [Pass 3b] AC #6's literal root `npm test` gate does not run tests

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:85`; `package.json:7`
- **Triggering input or sequence:** Run `npm test` from the stated repository root.
- **Observable consequence:** It exits 1 immediately with `Error: no test specified`; no equipment suite runs. The server-local Vitest commands work, but the literal AC gate is not configured at root.
- **Confidence:** High.

## Low

### [Pass 1] Skill gear is declared tweakable even when it has no numeric bonus field

- **Severity:** Low
- **File:line:** `public/js/data/equipment-derivation.js:395`
- **Triggering input or sequence:** Call `equipmentTweakableField({ bucket:'skill_gear' })`.
- **Observable consequence:** It returns `bonus_dice` despite the helper prose saying `null` when there is no tweakable numeric bonus. Pass 2 later confirmed the input is schema/admin-valid; the spec's AC #1, however, uses bucket-only wording.
- **Confidence:** High on behavior; the later spec makes the intended contract internally inconsistent rather than resolving it cleanly.

### [Pass 1] Numeric-string availability is silently treated as zero

- **Severity:** Low
- **File:line:** `public/js/data/equipment-derivation.js:409`
- **Triggering input or sequence:** Call with `availability:'3'`.
- **Observable consequence:** `Number.isInteger('3')` is false, so tweak cost is 1 rather than 4 and a warning may be suppressed.
- **Confidence:** Medium in Pass 1; Pass 2 found normal create/admin paths coerce integers, but PATCH filtering has no schema validation and can still store a string.

### [Pass 1] The “ONLY when tweakable” test does not prove conditional gating

- **Severity:** Low
- **File:line:** `server/tests/issue-871-876-ecm-4-9-bundle.test.js:167`
- **Triggering input or sequence:** Move/duplicate checkbox markup outside `if (tweakField)` while leaving it textually after `equipmentTweakableField(selectedEntry)`.
- **Observable consequence:** The test remains green because it asserts only call-before-substring order, despite claiming “ONLY when.”
- **Confidence:** High.

### [Pass 1] The persistence test proves only that some assignment exists

- **Severity:** Low
- **File:line:** `server/tests/issue-871-876-ecm-4-9-bundle.test.js:184`
- **Triggering input or sequence:** Replace the right-hand side with a constant or inverted state.
- **Observable consequence:** The regex still passes because it checks only `responses[...]=` exists, not that `.checked` is read.
- **Confidence:** High.

### [Pass 1] The availability-unit question could not be resolved from the scoped diff

- **Severity:** Low
- **File:line:** `public/js/tabs/downtime-form.js:5614`
- **Triggering input or sequence:** Review a Fixer character near cap using only the Pass 1 hunk, where `rawMax` is not defined.
- **Observable consequence:** Pass 1 could not establish whether raw tweak cost and the threshold shared units.
- **Confidence:** Low in Pass 1 by design. Pass 2 resolved this concern: `rawMax = cap + fixer`, so the comparison is algebraically equivalent to the canonical affordability check for valid non-negative values.

### [Pass 1] Delegated-class exclusivity could not be established from the diff

- **Severity:** Low
- **File:line:** `public/js/tabs/downtime-form.js:2785`
- **Triggering input or sequence:** Change any element carrying `dt-equip-cat` while reviewing only the supplied hunk.
- **Observable consequence:** Reuse could have caused an unrelated rerender or suppressed a later route.
- **Confidence:** Low in Pass 1. Pass 2 resolved it: the class appears only on the rendered equipment select and matcher, and that select matches none of the later branches.

### [Pass 2] Unit coverage omits both schema-valid ambiguous shapes

- **Severity:** Low
- **File:line:** `server/tests/issue-879-defence-penalty-wirein.test.js:611`
- **Triggering input or sequence:** Regress dual-shaped combat precedence or stat-less skill behavior while preserving weapon-only, armour-only, neither-combat, and populated-skill cases.
- **Observable consequence:** The supplied tests remain green because they cover neither valid ambiguous shape.
- **Confidence:** High.

### [Pass 2] The “missing/non-integer availability” test checks only a missing value

- **Severity:** Low
- **File:line:** `server/tests/issue-879-defence-penalty-wirein.test.js:662`
- **Triggering input or sequence:** Regress explicit null, string, or fractional availability while keeping the missing-property fallback.
- **Observable consequence:** The test still passes despite its title; its only fixture omits `availability`.
- **Confidence:** High.

### [Pass 3b] Historical before/after exact totals are not stable enough to support “confirmed identical”

- **Severity:** Low
- **File:line:** `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md:140`
- **Triggering input or sequence:** Repeat the full suite in the supplied-diff state and run base commit `41dd40ef` from an isolated archive.
- **Observable consequence:** Supplied-diff runs alternated between 101 failed / 78 passed files with 3 failed / 1162 passed tests and the claimed 100/79 with 2/1163; skips stayed 1153. The isolated base produced 90/89 files with 5/1339 twice because DB guard/import ordering differed. One post-fix run does reproduce the claimed totals, but the exact historical baseline and “same two” identity are not independently reproducible as stated.
- **Confidence:** High about observed instability; Low about reconstructing the author's historical environment.

## Ship assessment

The supplied EQC-4 diff **is not ready to ship as-is and needs patches**. The blocking defect is that the ST cannot see the saved request. The stale item-to-item affirmative state, warning shown while unchecked, supported hybrid/stat-less catalogue shapes, and availability-5/cost-6 boundary also need fixes or explicit product decisions.

A concurrent process added review patches to the current worktree after these findings were frozen, including an ST renderer and row-state clearing. Those changes were not part of the supplied diff, were not authored by this review, and do not retroactively erase findings against the delivered change.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/issue-1155-eqc4-diff.txt`; checked whether this report existed. No source, repository context, story, or author record was opened before Pass 1 was written.
- **Pass 2:** Opened `public/js/data/equipment-derivation.js`; the full relevant `collectResponses`, delegated-change, equipment-remove, `renderEquipmentSection`, and `renderEquipmentRow` paths in `public/js/tabs/downtime-form.js`; `public/js/data/equipment-catalogue-cache.js`; `public/js/data/dt-completeness.js`; `public/js/data/dt-action-summary.js`; `public/js/admin/equipment-catalogue-admin.js`; `public/js/admin/downtime-views.js`; `server/schemas/equipment_catalogue.schema.js`; relevant `server/schemas/downtime_submission.schema.js`; `server/routes/equipment-catalogue.js`; `server/scripts/migrate-eqc1-bucket-taxonomy.mjs`; the three relevant tests; and root/server `package.json`. Repository searches covered `public/js` and `server` consumers. The story remained unopened.
- **Pass 3a:** Opened story lines 1–131 only, including Story, Background, Explicitly NOT, Acceptance Criteria, Tasks/Subtasks, Dev Notes, structure notes, and references. The Dev Agent Record remained unopened until Pass 3a was written.
- **Pass 3b:** Opened the Dev Agent Record at lines 132–180, current status/diffs needed to detect concurrent edits, and the later concurrent patch ranges. I never accessed `D:\Terra Mortis\TM Suite` or another sibling under `D:\Terra Mortis`.

### Commands run and real results

- Pass 1: `Resolve-Path`, `Test-Path`, and `Get-Content` on the supplied diff succeeded.
- Pass 2 reads/searches: repeated `Get-Content`/numbered range reads and `rg -n`/`rg --files` searches succeeded except one compound `rg` invocation whose final pattern had no match (exit 1), and probes for nonexistent `server/data/equipment-catalogue.js` and `server/equipment-catalogue.js` failed before the actual paths were located.
- Direct Node ESM fixture execution returned: armour-only `armour_value`; weapon-only `damage_mod`; both `damage_mod`; neither `null`; populated skill `bonus_dice`; stat-less skill `bonus_dice`; tool/narrative/container `null`; availability 5 → 6; string `'2'` → 1.
- The first focused `npx vitest ... -t '#1155 EQC-4'` attempt timed out after ~62.5s; its retry failed after ~74.2s because root `npx` attempted a blocked registry fetch. `Test-Path` then established root Vitest absent and `server/node_modules/.bin/vitest.cmd` present.
- Installed local focused run: `server/node_modules/.bin/vitest.cmd run ...issue-879... ...issue-871... -t '#1155 EQC-4'` → 2 files passed, 14 passed / 74 skipped (88 declarations).
- Required three-file gate in the supplied-diff state, using `npx --offline --prefix server vitest run ...issue-879... ...issue-871... ...issue-896...` → **3 files passed, 116/116 tests passed**. Individual runs were 64/64, 24/24, and 28/28.
- Full-suite supplied-diff runs: one compact run returned 101 failed / 78 passed / 2 skipped files and 3 failed / 1162 passed / 1153 skipped tests; a repeat returned 100/79/2 files and 2/1163/1153 tests. An earlier raw run produced voluminous output and the same baseline class but its final summary was truncated by the tool.
- Controlled merged-import experiment: the two touched files remained **88/88**; issue #896 became **1 failed / 27 passed**. After restoration, normalized `git diff` matched the supplied downtime-form diff exactly (`EXPECTED_DIFF_MATCH=True`). Concurrent edits then changed the file again.
- Base commit verification: `git archive 41dd40ef` was extracted to a temporary workspace directory and run twice through the installed Vitest. Both runs returned 90 failed / 89 passed / 2 skipped files and 5 failed / 1339 passed / 1153 skipped tests; this did not reproduce the author's historical baseline. The first archive setup command timed out after creating the archive; extraction was completed separately. A first base run before copying the current `.env` produced the same totals.
- Root `npm test` → exit 1, `Error: no test specified`.
- After the concurrent patch, the exact three-file gate first failed because the temporary base checkout duplicated the filtered paths and a newly added review test failed; I renamed the temporary checkout's `server` directory to `server-base-disabled` to prevent discovery. The settled current gate then returned **3 files passed, 122/122 tests passed**. This is the exact final current gate observed; 116/116 is the original supplied-diff result.
- Final current full suite after the concurrent patch: **100 failed / 79 passed / 2 skipped files; 2 failed / 1169 passed / 1153 skipped tests (181 files, 2324 tests)**. The two ordinary failures were the N7/N9 allocator regex and OATH-A byte-identity assertions; the remaining baseline failures were DB-guard/import failures.
- Other diagnostics run: `git status --short`, `git diff --name-status`, `git diff --numstat`, `git diff --check`, `Get-FileHash`, line-ending counts, exact normalized diff comparison, file timestamps, `Get-Process`, `Get-Command unix2dos/dos2unix`, and short five-second stability polls. Git repeatedly warned it could not read the user-level ignore file; this did not prevent repository diffs/status.

### Could not run / limitations

- The literal root command `npx vitest ...` could not resolve local Vitest without `--prefix server` and attempted blocked network access. The equivalent installed server-local binary/prefix commands were run and produced the counts above.
- The historical pre-change environment and “first caught by full regression” provenance cannot be reconstructed with certainty. The import failure mechanism was reproduced directly.
- No live browser/DOM test was run because this repository has no browser harness; DOM behavior was assessed from the render/event code as instructed.
- `D:\tmp` rejected creation despite being advertised writable, so base verification used a temporary directory inside the worktree.

### Modification/restoration attestation

- This review intentionally writes only this findings report as its deliverable.
- `public/js/tabs/downtime-form.js` was temporarily changed for the merged-import proof. The first inverse patch normalized line endings and did not match the pre-edit byte hash; restoration continued until the normalized Git diff matched the supplied diff exactly. A concurrent process subsequently edited that file, `public/js/admin/downtime-views.js`, and both touched tests. I did not revert or adopt those external edits.
- I created `.codex-eqc1155-base-review.tar` and `.codex-eqc1155-base-review/` to execute base commit `41dd40ef`. Cleanup was attempted only after resolving and verifying the exact paths, but both `Remove-Item` attempts were blocked by sandbox policy. To stop Vitest discovering duplicate tests, I recoverably renamed its inner `server` directory to `server-base-disabled`. The archive/directory remain untracked and need manual removal.
- The additional untracked `issue-1155-eqc4-codex-raw-output*.txt` and `issue-1155-eqc4-codex-review.md` files, concurrent production/test patches, and a later `specs/deferred-work.md` modification were created by another process while this review was running, not by this review.
- No commit or push was made. Final `git status --short` is not clean because it contains the story changes, the concurrent review patch/artifacts, this report, and the cleanup-blocked temporary base archive/directory; no claim of a clean worktree is made.
