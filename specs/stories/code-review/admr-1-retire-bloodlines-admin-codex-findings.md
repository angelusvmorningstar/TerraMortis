# Adversarial review: admr-1-retire-bloodlines-admin

## High

### Pass 1

- None found.

### Pass 2

- None found.

### Pass 3a

- None found.

### Pass 3b

- None found.

## Medium

### Pass 1

- None found.

### Pass 2

- **[Pass 2] The retired delete route's implementation module was left behind after its only caller and all of its tests were removed**
  - **Severity**: Medium
  - **File:line**: `server/lib/bloodline-delete-guard.js:1`
  - **Triggering input or sequence**: Apply this change, then search the whole repository for `deleteBloodlineGuarded` or `bloodline-delete-guard.js`. The only executable definition is still present, while the route import and the five behavioral tests that exercised it were deleted; remaining matches merely cite it as historical precedent.
  - **Observable consequence**: The authoring retirement is incomplete: a 61-line route-specific delete implementation remains as uncalled, untested production source. It cannot affect today's runtime, but it can silently drift or be mistaken for supported policy and reused later even though its owning route and contract suite no longer exist.
  - **Confidence**: High. The whole-repository caller search found no executable importer.

- **[Pass 2] The retained unique-index helper lost its only behavioral test, and the surviving smoke suite still points to the deleted proof**
  - **Severity**: Medium
  - **File:line**: `server/tests/bl3b-archived-seed-smoke.test.js:29`
  - **Triggering input or sequence**: Regress `ensureBloodlineNameIndex()` (for example, omit `unique`, lose `collation.strength === 2`, or mishandle replacement of the old index), then run all surviving bloodline tests or later run `server/scripts/archive/seed-bloodlines.js --apply` against a collection whose index is absent or stale.
  - **Observable consequence**: The tests remain green because `bl3b-constants-deleted.test.js` checks only that the archived seed imports and calls the helper, while the smoke suite explicitly delegates behavioral proof to `bl4-bloodlines-write-api.test.js:275-294`—a file this change deletes. The archived script is still runnable and awaits this helper on its real `--apply` path, so an index regression would first surface during the operational seed or could leave later shared-collection writes without the case-insensitive uniqueness guarantee.
  - **Confidence**: High. The old test was inspected in full, and a whole-repository test search found no surviving executable assertion of the index options or helper behavior.

- **[Pass 2] Deleting the admin-view suite also deletes the only regression test for still-live shared WebSocket fan-out and bloodline listener wiring**
  - **Severity**: Medium
  - **File:line**: `server/ws.js:71`
  - **Triggering input or sequence**: A later change removes `_fanOut`'s per-client `try/catch`, adds a broadcaster with its own unguarded send loop, or disconnects the retained `bloodline` frame handler/callback wiring in either client entry point.
  - **Observable consequence**: No surviving test fails. The deleted `bl4-bloodlines-admin-view.test.js` was not limited to the retired screen: it uniquely asserted the shared fan-out fault isolation used by tracker, ST-mod, catalogue, and settings writes, plus the retained client frame handling in `public/js/data/ws.js`, `public/js/admin.js`, and `public/js/app.js`. A bad socket can then make an already-committed live write return 500 and skip later clients, or retained bloodline frames can stop refreshing open tabs without a regression signal.
  - **Confidence**: High that coverage was lost and current production code is still live; high that current behavior itself remains correct.

### Pass 3a

- **[Pass 3a] AC 2 literally requires every route-only helper to be removed, but the route-only delete guard survives**
  - **Severity**: Medium
  - **File:line**: `server/lib/bloodline-delete-guard.js:1`
  - **Triggering input or sequence**: Evaluate the shipped tree against AC 2's wording, “every helper/import those handlers alone required.” `deleteBloodlineGuarded` was required only by the removed `DELETE /:id` handler, has no remaining executable caller, and its complete module remains present.
  - **Observable consequence**: AC 2 is not literally satisfied and the repository continues to carry part of the retired authoring implementation. This confirms, rather than supersedes, the Pass 2 dead-module finding.
  - **Confidence**: High.

- **[Pass 3a] The story's own “fully green” acceptance gates are admitted unmet in its permitted task section**
  - **Severity**: Medium
  - **File:line**: `specs/stories/admr-1-retire-bloodlines-admin.md:137`; `specs/stories/admr-1-retire-bloodlines-admin.md:147`
  - **Triggering input or sequence**: Apply AC 5 (“the suite is fully green afterward”) and AC 7 (“the full `server/` test suite ... [is] green”) literally, then compare them with Task 7, which says the full suite was run twice and was “NOT fully green.”
  - **Observable consequence**: Regardless of whether every failure is pre-existing, the completion evidence does not meet the acceptance criteria as written. Reviewers have no green full-suite gate matching the story's literal contract; the ACs need either an explicit baseline-failure exception or a genuinely green run.
  - **Confidence**: High that the spec contradicts itself. The actual current failure set is deferred to Pass 3b's required execution.

- **[Pass 3a] Task 4 falsely says both deleted suites exercised only removed code**
  - **Severity**: Medium
  - **File:line**: `specs/stories/admr-1-retire-bloodlines-admin.md:211`
  - **Triggering input or sequence**: Read every test in the deleted `bl4-bloodlines-admin-view.test.js`, as Task 4 says was done, and classify its WebSocket block rather than classifying the file by its import of the deleted view.
  - **Observable consequence**: The wholesale-deletion rationale is false. That suite also tested still-live shared `_fanOut` fault isolation and retained client WS callback wiring, so the change loses relevant coverage even though the task records zero such loss. This confirms the Pass 2 coverage finding against the acceptance record.
  - **Confidence**: High.

### Pass 3b

- **[Pass 3b] The claimed 85/85 gate is not reproducible in the current review environment**
  - **Severity**: Medium
  - **File:line**: `specs/stories/admr-1-retire-bloodlines-admin.md:351`
  - **Triggering input or sequence**: Run the exact mandated command twice from `server/`: `npx vitest run tests/bl1-bloodlines-api.test.js tests/bl3b-constants-deleted.test.js tests/bl3b-archived-seed-smoke.test.js tests/bl1-bloodline-schema.test.js tests/bloodline-slug.test.js`.
  - **Observable consequence**: Both runs reported **5 files total: 4 passed, 1 failed; 85 tests total: 75 passed, 10 skipped**. `bl1-bloodlines-api.test.js` failed suite setup because the sandbox denied the Atlas socket (`connect EACCES 159.143.141.178:27017`), so its ten tests never executed. This does not prove the author's earlier 85/85 result false on a network-capable machine, but it makes that ship gate **unverifiable as stated in this review**; skipped tests must not be reported as current passes.
  - **Confidence**: High on the observed current numbers and cause; no conclusion about the network-capable result.

- **[Pass 3b] The “representative sample of 8” stash A/B claim is not reproducible as recorded**
  - **Severity**: Medium
  - **File:line**: `specs/stories/admr-1-retire-bloodlines-admin.md:345`
  - **Triggering input or sequence**: Attempt to repeat the claimed eight individual baseline comparisons from the Dev Agent Record.
  - **Observable consequence**: The record names a pool of roughly twenty files but never identifies the eight selected, records no per-file commands/results, and leaves no dedicated stash snapshot attributable to this story. A reviewer therefore cannot repeat the asserted sample. I selected eight named files and ran the current side: **8 files total, 6 failed and 2 passed; 283 tests total, 4 failed, 67 passed, 212 skipped**. Four suites were blocked by the same Atlas `EACCES`; the other failures were the stated stale CSS assertions/time-out class. I could not perform the baseline half without modifying git/worktree state, which this review forbids. The claim is not shown false, but it is unverifiable as stated.
  - **Confidence**: High that the audit trail is insufficient; no conclusion about the author's unrecorded historical A/B runs.

## Low

### Pass 1

- **[Pass 1] The negative live-importer assertion has no positive control**
  - **Severity**: Low
  - **File:line**: `server/tests/bl3b-constants-deleted.test.js:300`
  - **Triggering input or sequence**: A future change breaks the `importers()` walker or its import-matching regex so that it returns an empty array even when a non-archive file imports `bloodline-name-index.js`.
  - **Observable consequence**: The new `toEqual([])` assertion remains green and fails to enforce its stated purpose. The following test directly reads the archived seed and proves that one known import exists, but because archive paths are intentionally excluded from `importers()`, it does not prove that the negative scanner can detect an included import. A small positive-control fixture or assertion against a known included match would make this regression guard non-vacuous.
  - **Confidence**: Medium. This is a concrete weakness in the test structure visible from the diff; whether the unchanged walker currently has a defect cannot be established in the blind pass.

### Pass 2

- **[Pass 2] Authoring-only CSS, a PATCH allowlist, and an unused test import remain after the screen and routes are gone**
  - **Severity**: Low
  - **File:line**: `public/css/admin-layout.css:10006`; `server/schemas/bloodline.schema.js:113`; `server/tests/bl1-bloodlines-api.test.js:24`
  - **Triggering input or sequence**: Load the post-change admin bundle or maintain the bloodline contract after retirement. The deleted view is the only former consumer of `.bl-disc-tag`, `.bl-disc-cell`, and `.bl-disc-grid`; the deleted PATCH route is the only former consumer of `BLOODLINE_UPDATABLE_FIELDS`; and the rewritten API suite no longer uses `playerUser`.
  - **Observable consequence**: Nothing fails at runtime, but the retirement leaves dead source and styling behind and keeps an exported write contract that no production or test code consumes. This increases ambiguity about whether TM Game still supports bloodline authoring and leaves avoidable stale surface in future searches.
  - **Confidence**: High. Whole-repository searches found definitions/import residue but no surviving consumers.

- **[Pass 2] Retained mount and helper documentation still describes a live BL-4 write route, reinforcing the misleading unused auth parameter**
  - **Severity**: Low
  - **File:line**: `server/index.js:95`; `server/tests/helpers/test-app.js:77`; `server/lib/bloodline-name-index.js:4`; `server/lib/bloodline-slug.js:7`; `server/schemas/bloodline.schema.js:72`; `server/ws.js:156`
  - **Triggering input or sequence**: A maintainer traces `buildBloodlinesRouter(requireAuth)` or consults the retained schema/helper/WebSocket headers to understand ownership after this retirement.
  - **Observable consequence**: Several comments still state that writes “arrive in BL-4,” that the helpers are shared with “the write route,” or that BL-4 makes the broadcaster's existence valid, while the factory accepts but ignores an auth middleware named as though it gates something. The route's own new header is accurate, but surrounding code can lead a future change to assume this router remains protected or that TM Game still owns write behavior.
  - **Confidence**: High that the statements are stale; Medium on downstream impact because the executable route is short and explicitly public.

### Pass 3a

- **[Pass 3a] Task 3 mislabels the schema as documentation-only even though the runnable archived seed compiles it**
  - **Severity**: Low
  - **File:line**: `specs/stories/admr-1-retire-bloodlines-admin.md:193`
  - **Triggering input or sequence**: Run or import `server/scripts/archive/seed-bloodlines.js` and follow `seedBloodlines()`: it constructs Ajv and calls `ajv.compile(bloodlineSchema)` before building/writing documents.
  - **Observable consequence**: The schema was correctly retained, but the stated reason is materially incomplete. A future maintainer trusting “documentation-only shape contract” could remove or relax it without recognizing that the still-runnable migration uses it as an executable pre-write gate.
  - **Confidence**: High.

- **[Pass 3a] AC 7's literal diff-shape wording excludes the new test file that the story itself adds**
  - **Severity**: Low
  - **File:line**: `specs/stories/admr-1-retire-bloodlines-admin.md:147`
  - **Triggering input or sequence**: Compare AC 7's allowed shape—“only this story's deliberate removals plus the two documentation corrections”—with `server/tests/bloodline-slug.test.js`, a new 106-line executable test file called out in Project Structure Notes.
  - **Observable consequence**: The addition is sensible and preserves coverage, but the acceptance criterion's exception is narrower than the delivered diff. The change therefore violates the literal gate unless the AC is amended to permit the test relocation.
  - **Confidence**: High on the textual mismatch; Low concern for product behavior because the added test is beneficial.

### Pass 3b

- None found.

## Ship assessment

**Needs patches; no blocking runtime defect was found in the retained public read itself.** The kept `GET /` projection, sort, and response call are byte-identical between `d581550d` and `6e925f29`, and a DB-free router execution confirmed that the six retired surfaces return 404. Before shipping, remove the orphaned delete-guard and other authoring residue, restore behavioral coverage for the retained unique-index helper and still-live shared WebSocket contracts, and obtain a real network-capable pass for the ten database-backed API tests. The full-suite-green ACs also need to be made honest about accepted baseline failures or actually met.

## Validation notes

### Pass discipline and files opened

- **Pass 1:** Opened only `specs/stories/code-review/admr-1-retire-bloodlines-admin-diff.txt`. I did not open repository source, the story, or the author record. I used `Test-Path` only to confirm that the new test's three relative import targets existed; that did not read their contents. Pass 1 was written to this report before proceeding.
- **Pass 2:** Kept `specs/stories/admr-1-retire-bloodlines-admin.md` closed. Explicitly opened current `server/scripts/archive/seed-bloodlines.js`, `server/tests/bl3b-constants-deleted.test.js`, `server/tests/helpers/bloodline-fixtures.js`, `server/index.js`, `server/tests/helpers/test-app.js`, `server/routes/bloodlines.js`, `server/db.js`, `public/js/data/bloodlines-cache.js`, `public/js/data/api.js`, selected regions of `public/js/admin.js` and `public/js/app.js`, `server/schemas/bloodline.schema.js`, `server/tests/bl1-bloodline-schema.test.js`, `server/tests/bloodline-slug.test.js`, `server/lib/bloodline-slug.js`, `server/lib/bloodline-name-index.js`, `public/admin.html`, `server/lib/bloodline-delete-guard.js`, `server/tests/bl3b-archived-seed-smoke.test.js`, `server/ws.js`, `public/js/data/ws.js`, and `server/tests/bl1-bloodlines-api.test.js`. Opened the complete pre-change `server/tests/bl4-bloodlines-admin-view.test.js` and `server/tests/bl4-bloodlines-write-api.test.js` via `git show d581550d:...`, in chunks, and compared both commit versions of the retained route handler. Repo-wide `rg` searches also read matching lines in source/test files, notably `public/css/admin-layout.css`. Pass 2 was written before opening the story.
- **Pass 3a:** Opened only lines 1-280 of `specs/stories/admr-1-retire-bloodlines-admin.md` after first locating its headings. This covered Story, Context, Acceptance Criteria, Tasks/Subtasks, Dev Notes, Project Structure Notes, and References. I did not read line 281 onward (the Dev Agent Record) until Pass 3a was written.
- **Pass 3b:** Opened line 281 onward of the story (the complete Dev Agent Record), the known-failures portion of `CLAUDE.md`, and `server/lib/bloodline-key.js` after a broad grep hit its comment. Test runs loaded the named suites and their imports. There is no Senior Developer Review section in this story.

### Commands run and real results

**Pass 1 commands**

- `Get-Content -Raw specs/stories/code-review/admr-1-retire-bloodlines-admin-diff.txt` — exit 0; tool output was truncated, so all relevant portions were subsequently read by line range.
- `rg -n "^diff --git" ...-diff.txt` — exit 0; identified 10 changed source/test/doc files in the scoped diff.
- PowerShell line-range reads of diff lines `563..1057`, `1057..1303`, and numbered `1211..1303` — exit 0; inspected the full route change and both edited test sections.
- `rg -n "initBloodlinesAdmin|bloodlines-admin\.js|d-bloodlines|bloodlines-content|broadcastBloodlineUpdate|ensureBloodlineNameIndex|deriveSlug" ...-diff.txt` — exit 0; found only deleted call sites plus new explanatory/test references.
- `Test-Path` for `server/lib/bloodline-slug.js`, `server/schemas/bloodline.schema.js`, and `server/tests/helpers/bloodline-fixtures.js` — all `True`.
- PowerShell extraction of every deleted `describe(`/`it(` line from diff lines 1303-2463 — exit 0; enumerated all tests in both removed suites.

**Pass 2 commands**

- `git status --short` — exit 0; showed the requested findings report plus pre-existing untracked `...-codex-review.md` and supplied `...-diff.txt`.
- Full `Get-Content -Raw` reads for the Pass 2 files listed above — all exit 0.
- `rg -n --hidden --glob '!server/node_modules/**' --glob '!.git/**' --glob '!specs/**' "\b(deriveSlug|ensureBloodlineNameIndex)\b" .` — exit 0; the archived seed was the only non-test importer/caller of both helpers.
- Repo-wide `rg` for `loadBloodlines|refetchBloodlines|broadcastBloodlineUpdate` — exit 0; found both boot loads and both retained WS refetch callbacks, with no executable caller of `broadcastBloodlineUpdate`.
- `git diff --exit-code d581550d 6e925f29 -- server/db.js server/index.js server/tests/helpers/test-app.js public/js/data/bloodlines-cache.js public/js/data/api.js public/js/app.js` — exit 0 and printed `UNCHANGED_ACROSS_COMMITS`.
- PowerShell `git show`/regex comparison of the pre/post `router.get('/')` handler and `PUBLIC_PROJECTION` — both handlers found; `HANDLERS_IDENTICAL=True`, `PROJECTIONS_IDENTICAL=True`; printed the unchanged `find({}, PUBLIC_PROJECTION).sort({ name: 1 }).toArray(); res.json(docs);` body.
- `rg` for `BLOODLINE_UPDATABLE_FIELDS|bloodlineSchema` — exit 0; schema retained by archived seed/tests, allowlist declaration had no consumer.
- One combined `Get-Content public/admin.html; rg ...` command failed with exit 1 and no output because of PowerShell quoting. I reran the file read and search separately.
- `Get-Content -Raw public/admin.html` — exit 0.
- Corrected repo-wide `rg` for deleted admin names/ids — exit 0; only explanatory/history mentions remained, no live markup/call site.
- `rg` for `.bl-`/`bl-disc`/`bl-impact` and then exact `bl-disc-tag|bl-disc-cell|bl-disc-grid` — exit 0; the three authoring-only selectors remained only in `public/css/admin-layout.css`.
- `rg` for `bloodline-delete-guard|deleteBloodlineGuarded` plus full file read — exit 0; definition remained with no executable importer.
- `git show` line counts for the deleted suites — exit 0: admin-view 419 lines, write-API 729 lines.
- Four chunked `git show` reads covering all 729 write-API lines and two covering all 419 admin-view lines — all exit 0.
- `rg` for `_fanOut`, broadcaster fault-isolation wording, and broadcaster names in surviving tests — exit 0; no surviving test covers `_fanOut`; route-specific broadcaster spy tests remain for settings/ST mods only.
- An `rg` command using PowerShell-expanded `server/tests/*.test.js server/tests/**/*.test.js` failed with exit 1 / Windows invalid-path errors. The corrected `rg --glob '*.test.js' ... server/tests` exited 0 and printed `NO_MATCHES` for bloodline WS/fan-out coverage.
- `rg` for stale BL-4/write-route comments and dead symbols — exit 0; located the lines reported above.

**Pass 3a commands**

- `rg -n '^#{1,6} ' specs/stories/admr-1-retire-bloodlines-admin.md` — exit 0; located the Dev Agent Record at line 281 without reading its content.
- `Get-Content ... | Select-Object -First 280` — exit 0; read only the permitted pre-record sections.

**Pass 3b commands**

- `Get-Content ... | Select-Object -Skip 280` — exit 0; read the full Dev Agent Record.
- Required five-file Vitest command, first run — exit 1: **Test Files 1 failed / 4 passed (5); Tests 75 passed / 10 skipped (85)**; `bl1-bloodlines-api.test.js` setup failed with Atlas `connect EACCES 159.143.141.178:27017`.
- The exact same required five-file command, second run — exit 1 with the same **1 failed / 4 passed; 75 passed / 10 skipped** and the same Atlas `EACCES`.
- `git diff --stat d581550d 6e925f29; git diff --name-status d581550d 6e925f29` — exit 0: 12 files, 582 insertions, 2201 deletions; names/statuses match the Dev Agent Record File List exactly.
- Playwright discovery plus Bloodlines grep (`rg` for `@playwright/test|playwright.config`, then `rg -ni --glob '*.spec.js' --glob '*.spec.ts' bloodlines`) — exit 0; many Playwright specs exist, **no Playwright Bloodlines matches**.
- `node --check` on `public/js/admin.js`, `server/routes/bloodlines.js`, `server/tests/bl1-bloodlines-api.test.js`, `server/tests/bl3b-constants-deleted.test.js`, and `server/tests/bloodline-slug.test.js` — exit 0, no output.
- First exact-importer `rg` attempt had two regex parse errors (`unclosed character class`); its later broad call-site grep still ran and showed only definitions, tests, and archived-seed calls. This failed attempt was not used as evidence.
- Corrected broad importer/call-site grep — exit 0; one comment-only hit in `server/lib/bloodline-key.js` plus the archived seed. The file was opened and confirmed comment-only.
- Corrected anchored import-statement greps for `bloodline-slug.js` and `bloodline-name-index.js` outside tests — exit 0; each returned only `server/scripts/archive/seed-bloodlines.js`.
- `git stash list; git rev-parse --short HEAD; ... d581550d; ... 6e925f29` — exit 0; HEAD is `6e925f29`; three unrelated stash entries exist, none identifies this story's claimed eight-file baseline sample.
- `rg --files server/tests | rg '(cm-2...|...gdx-4...)'` — exit 0; resolved the eight selected current-side sample paths.
- Selected eight-file Vitest command — exit 1 after 70.75s: **Test Files 6 failed / 2 passed (8); Tests 4 failed / 67 passed / 212 skipped (283)**. Four suites failed setup on Atlas `EACCES`; `gdx-4-css-standards-grep` had one timeout and one stale fallback-count assertion; `issue-830-inherited-card-css` had two stale pixel-literal assertions.
- `rg -n 'Known pre-existing failures' CLAUDE.md` and a line-range read of that section — exit 0; confirmed the six specifically named files/classes cited by the record are documented there.
- `node --input-type=module -e` router-stack inspection — exit 0; printed exactly `[{'path':'/','methods':['get']}]` (JSON formatting used double quotes).
- DB-free Supertest harness over the trimmed router — exit 0; `GET /admin`, `GET /:id/impact`, `GET /:id`, `POST /`, `PATCH /:id`, and `DELETE /:id` each returned 404.
- `git diff --check d581550d 6e925f29; git status --short` — exit 0; no diff-check errors. Status shows only the requested findings report and the two pre-existing untracked review inputs; Git also warned that the user-level global ignore file was permission-denied.
- Report self-check `rg -n '^## |^### Pass|^- \*\*' ...-codex-findings.md` plus line count — exit 0; exposed one misplaced Pass 3b subsection, which was moved without changing any frozen finding's substance; report was 214 lines at that point.
- PowerShell read of report lines 46-91 — exit 0; confirmed the exact misplaced block before the mechanical heading reorder.

### Could not run or verify

- I could not execute the ten database-backed assertions in `bl1-bloodlines-api.test.js`, or any meaningful full `cd server && npm test`, because this sandbox denied the MongoDB Atlas connection with `EACCES` on both required attempts. The exact current five-file gate is therefore **75 passed, 10 skipped; 4 files passed, 1 failed**, not a verified 85/85.
- I did not run the full suite after the targeted Atlas denial; it would exercise the same unavailable network dependency and could not verify the author's historical 17-vs-83 counts. This is an explicit validation gap.
- I could not reproduce the author's exact eight-file `git stash` A/B because the eight files were not named and altering/stashing/checking out this shared worktree is forbidden by the review instructions. I ran one disclosed eight-file current-side sample instead; no baseline equivalence is claimed.
- I did not run Playwright because the repository grep found zero Bloodlines Playwright specs, matching the story's claim that there was no affected spec to run.
- I did not access TM Admin or any sibling repository, as explicitly prohibited.

### Modification attestation

No product source, tests, configuration, commits, stashes, branches, or sibling files were modified. The only file I created/updated is this requested report: `specs/stories/code-review/admr-1-retire-bloodlines-admin-codex-findings.md`. The final `git status --short` also shows two untracked files that pre-dated this review (`admr-1-retire-bloodlines-admin-codex-review.md` and the supplied diff); I did not open or alter the former and did not alter the latter.
