# Adversarial review findings — issue #1154 / EQC-3

## High

- [Pass 1] None found.

## Medium

### [Pass 1] Uppercase 24-hex `container_id` values are rejected despite satisfying the stated shape

- **Severity:** Medium
- **File:line:** `server/routes/characters.js:879`
- **Triggering input or sequence:** Send an otherwise-valid equipment-add request with `container_id` equal to an already-owned container catalogue ID rendered in uppercase hexadecimal, for example `ABCDEF0123456789ABCDEF01`.
- **Observable consequence:** `ObjectId.isValid()` accepts the value, but `String(new ObjectId(value))` canonicalizes it to lowercase, so the strict equality check returns 400. That conflicts with the diff's stated contract of accepting a “24-hex ObjectId-shaped string,” for which uppercase hex is ordinarily shape-valid.
- **Confidence:** Medium-high from the diff alone; Pass 2 must check whether the schema deliberately narrows the field to lowercase.

### [Pass 2] Full-character create/replace paths bypass container ownership and bucket validation

- **Severity:** Medium
- **File:line:** `server/routes/characters.js:412`, `server/routes/characters.js:439`, `server/routes/characters.js:451`
- **Triggering input or sequence:** Submit `equipment[]` through `POST /api/characters/wizard`, `POST /api/characters`, or especially the live full-document `PUT /api/characters/:id` path with a lowercase 24-hex `container_id` that is dangling or points to a non-container catalogue row. The normal admin Save-to-DB flow includes the complete `equipment` array in that PUT (`public/js/admin.js:964-990`).
- **Observable consequence:** Schema validation checks only the string pattern and the PUT hydration loop checks only each row's `catalogue_id`; none of these paths performs the new same-character ownership or container-bucket checks. Invalid containment rejected by `POST /:id/equipment` can therefore be persisted through other real write paths, leaving enforcement dependent on which endpoint the caller used.
- **Confidence:** High.

### [Pass 2] Container-inside-container assignments are accepted but hidden in the Containers section

- **Severity:** Medium
- **File:line:** `public/js/editor/sheet.js:2755`, `public/js/editor/sheet.js:2799`; `server/routes/characters.js:905`
- **Triggering input or sequence:** Own a Haven container, choose a Safe from the add form's Container bucket, select the Haven in “Place inside,” and add it. The picker is independent of the selected item bucket and the route validates only the target bucket, so this succeeds.
- **Observable consequence:** The Safe's `container_id` is persisted, but the Containers renderer never calls `containedLabel(item)`, unlike the other six rendered sections. The sheet therefore gives no visible indication that the Safe is inside the Haven even though the UI offered and stored exactly that assignment.
- **Confidence:** High.

### [Pass 3a] The annotation violates AC #4's literal parenthesized display text

- **Severity:** Medium
- **File:line:** `public/js/data/equipment-derivation.js:158`; story AC #4 at `specs/stories/feature.1154.eqc3-container-assignment.story.md:91`
- **Triggering input or sequence:** Render any valid contained item whose container catalogue name is `Haven`.
- **Observable consequence:** The helper returns and the sheet renders `in: Haven`; AC #4 explicitly requires `(in: Haven)`. This is a visible acceptance-criteria mismatch in every successful use of the feature.
- **Confidence:** High.

### [Pass 3a] AC #4 applies to contained items generally, but contained container rows get no annotation

- **Severity:** Medium
- **File:line:** `public/js/editor/sheet.js:2755`; story AC #4 at `specs/stories/feature.1154.eqc3-container-assignment.story.md:91`
- **Triggering input or sequence:** Add one container catalogue item inside an already-owned container through the provided add form.
- **Observable consequence:** The server stores a valid containment relationship, yet the contained container's row omits the required `(in: <container name>)` qual fragment. This confirms the Pass 2 behavioral finding as a literal AC #4 failure; single-level containment does not prohibit a container from being the contained item.
- **Confidence:** High.

### [Pass 3a] The story's “only write path” premise is false and masks inconsistent enforcement

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1154.eqc3-container-assignment.story.md:36`; `server/routes/characters.js:412`, `server/routes/characters.js:439`, `server/routes/characters.js:451`
- **Triggering input or sequence:** Supply a character document containing `equipment[]` to either character-create route or the full character PUT route.
- **Observable consequence:** Those routes add or replace equipment and validate only schema shape, contradicting the Background's assertion that `POST /:id/equipment` is the only equipment-adding write path. The false premise explains the Pass 2 validation bypass and means the story does not make `container_id` reference validity a write-path invariant.
- **Confidence:** High.

## Low

### [Pass 1] The self-reference guard relies on object identity and its test only exercises the favorable identity case

- **Severity:** Low
- **File:line:** `public/js/data/equipment-derivation.js:148`; `server/tests/issue-879-defence-penalty-wirein.test.js:578`
- **Triggering input or sequence:** Call `equipmentContainerLabel()` with `item` as a clone/rebuilt object while `allEquipment` contains the original row with the same `catalogue_id`, where that ID also equals `item.container_id`.
- **Observable consequence:** `e !== item` is true for the distinct objects, so the only row can be treated as “another” owned row and the item can be labelled as contained in itself. The new test uses `[item]`, so it cannot discriminate reference identity from stable row identity. Whether the production call can supply clones is deferred to Pass 2 repository tracing.
- **Confidence:** High that the helper has this behavior; confidence that the current UI can trigger it is intentionally deferred until Pass 2.

### [Pass 1] Rejection tests do not prove the advertised all-before-write behavior

- **Severity:** Low
- **File:line:** `server/tests/equipment.test.js:266`
- **Triggering input or sequence:** Introduce a regression that pushes the requested equipment row and then returns one of the tested 400 responses for malformed, unowned, or non-container `container_id`.
- **Observable consequence:** All three new rejection tests still pass because they assert only status/error/message and never reread the character to prove its equipment array stayed unchanged. The displayed route implementation writes only after validation, but the tests do not protect that load-bearing property against later refactoring.
- **Confidence:** High.

### [Pass 2] Pass 1's uppercase-ID finding is contradicted by the repository schema

- **Severity:** Low
- **File:line:** `server/schemas/character.schema.js:362`
- **Triggering input or sequence:** Compare the route's lowercase-canonical ObjectId check with the pre-existing `container_id` schema pattern.
- **Observable consequence:** The schema explicitly permits only `^[a-f0-9]{24}$`, so rejecting uppercase is consistent with the repository's actual field contract. This removes the practical defect asserted in Pass 1, although that frozen finding remains above as required by the review protocol; the route/error wording “24-hex” is merely less precise than the schema.
- **Confidence:** High.

### [Pass 2] Pass 1's cloned-object self-reference concern is not reachable from the current renderer

- **Severity:** Low
- **File:line:** `public/js/editor/sheet.js:2582`, `public/js/editor/sheet.js:2610`, `public/js/editor/sheet.js:2604`
- **Triggering input or sequence:** Trace an equipment row from `equip = c.equipment || []`, through `item = equip[i]`, into `byBucket[bucket].push({ item, ... })`, and then into `containedLabel(item)`.
- **Observable consequence:** The production call retains the exact same object reference, so `e !== item` correctly excludes the row itself. A direct probe still returned `in: Self` for a cloned `item`, leaving the exported helper brittle for future callers, but the only current non-test caller cannot trigger it.
- **Confidence:** High.

### [Pass 2] “Lost” containers remain selectable and continue to count as owned

- **Severity:** Low
- **File:line:** `public/js/editor/sheet.js:2799`; `public/js/data/equipment-derivation.js:103`, `public/js/data/equipment-derivation.js:155`; `server/routes/characters.js:912`
- **Triggering input or sequence:** Keep or add a container row with `state: 'lost'`, then use it as the “Place inside” target, or render an existing item whose `container_id` points to that lost row.
- **Observable consequence:** Repository semantics explicitly describe `lost` as “the item is gone,” but the picker includes every container-bucket row and both server and label ownership checks ignore state. Users can place new items inside a gone container and existing contents continue to display as inside it.
- **Confidence:** Medium-high; the code behavior and existing state semantics are clear, while the story may define “owns” structurally as row presence rather than possession state.

### [Pass 2] Validation and mutation are vulnerable to a narrow delete race

- **Severity:** Low
- **File:line:** `server/routes/characters.js:902`, `server/routes/characters.js:946`, `server/routes/characters.js:962`
- **Triggering input or sequence:** An add request reads a character that owns the target container and passes validation; before its `$push`, a concurrent request removes that container row.
- **Observable consequence:** The add can persist an immediately dangling `container_id`. Conversely, the prompt's simultaneous “first request adds the container” scenario cannot incorrectly pass on a stale read—it can only reject until the first write becomes visible. This race is narrow for a single-ST-admin tool, but the validation and write are not atomic.
- **Confidence:** High on the race mechanics; low-to-medium on operational likelihood.

### [Pass 3b] The record's “owns at least one container” picker claim overstates its state handling

- **Severity:** Low
- **File:line:** Dev Agent Record at `specs/stories/feature.1154.eqc3-container-assignment.story.md:192`; `public/js/editor/sheet.js:2799`
- **Triggering input or sequence:** A character's only container-bucket row has `state: 'lost'`.
- **Observable consequence:** The Dev Agent Record says the dropdown appears only when the character owns a container, but it still appears and offers that lost row even though the repository's equipment-state helper defines `lost` as gone. This is the record-level version of the Pass 2 state-semantics finding.
- **Confidence:** Medium-high for the same reason as the underlying Pass 2 finding.

### [Pass 3b] Historical worktree collision and external-repository untouched claims are not independently verifiable within scope

- **Severity:** Low
- **File:line:** Dev Agent Record at `specs/stories/feature.1154.eqc3-container-assignment.story.md:168`; AC #6 at line 104
- **Triggering input or sequence:** Attempt to independently attest the claimed prior branch-collision incident and the state of TM Wiki, TM Cockpit, and TM Herald while obeying the instruction never to read or touch sibling directories.
- **Observable consequence:** Current evidence corroborates the safe end state—the branch is `ms/issue-1154-eqc3-container-assignment`, HEAD is `de5d5278`, merge-base with the prerequisite is `f13c21cb`, the six changed source/test files contain no `D:\Terra Mortis\TM Suite` path, and the reviewed commit lists only TM Suite files—but the historical incident and external repositories' working-tree states remain unverifiable as stated.
- **Confidence:** High that this is a review-scope limitation, not evidence the claims are false.

## Ship assessment

**Needs patches before shipping.** There is no blocking/High problem: the primary add endpoint preserves the absent-field path, validates in the required order before its write, and its tests pass. The literal AC #4 display defects and inconsistent validation through full-character writes are Medium findings and should be fixed before acceptance. The lost-container semantics and concurrency/test-hardening items are lower-risk follow-ups.

## Validation notes

### Information-barrier attestation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/issue-1154-eqc3-diff.txt`. I did not explore the repository or open the story. I created this findings file and froze Pass 1 before advancing.
- **Pass 2:** Opened repository context only: `server/routes/characters.js`, `server/schemas/character.schema.js`, `public/js/data/equipment-derivation.js`, `public/js/editor/sheet.js`, `public/js/editor/edit.js`, and relevant excerpts of `public/js/admin.js`; repository-wide searches covered `server/`, `public/`, and `scripts/` while excluding the story intentionally. I froze Pass 2 before opening the story.
- **Pass 3a:** First searched only the story's headings to locate section boundaries, then opened only lines 14-105 of `specs/stories/feature.1154.eqc3-container-assignment.story.md` (Story, Background, Explicitly NOT this story, and AC 1-6). I did not open the Dev Agent Record until after freezing Pass 3a.
- **Pass 3b:** Opened story lines 160-216 (Dev Agent Record), then lines 106-159 (Tasks/Dev Notes); `server/routes/equipment-catalogue.js`; `server/db.js`; `server/tests/helpers/db-setup.js`; historical EQC-2 verification excerpts in `specs/stories/feature.1153.eqc2-onme-elsewhere-display.story.md` and `specs/stories/code-review/issue-1153-eqc2-codex-findings.md`; and metadata/search results for the six changed files and test files. One broad story search unintentionally matched lines in the already-present `issue-1154-eqc3-codex-raw-output.txt` and `issue-1154-eqc3-codex-review.md` because the absolute-path glob exclusion did not take effect; this happened only in Pass 3b, after all earlier passes were frozen, and I did not use those files as evidence.

### Commands run and real results

All shell commands began by setting location to a quoted path under `D:\Terra Mortis\TM Suite-eqc`; no shell command targeted the sibling checkout.

1. `Get-Content ...issue-1154-eqc3-diff.txt -Raw` — succeeded; sole Pass 1 input.
2. `git status --short` — showed only pre-existing untracked review inputs/outputs plus this new report; Git also warned that the user-level global ignore file was inaccessible.
3. Numbered `Get-Content`/`rg` inspections of `characters.js`, `character.schema.js`, `equipment-derivation.js`, `sheet.js`, and `edit.js` — succeeded. They established the POST branch/order, lowercase schema pattern, same-reference renderer flow, option values, and null/absent DOM behavior.
4. Repository searches for equipment/container writes and uses — succeeded. They found full character create/PUT paths plus the POST/DELETE equipment routes; no other `container_id` consumer was found.
5. Numbered inspections of the full-character PUT/create routes and `admin.js`'s `buildSaveBody()` — succeeded and confirmed full equipment arrays reach the PUT route.
6. Direct Node helper probe — succeeded; a cloned self-row returned `in: Self`, and an empty catalogue name fell back to `in: c`.
7. Story heading search, followed by `Get-Content` lines 14-105 — succeeded; Pass 3a input only.
8. `Get-Content` lines 160-end of the story — succeeded; first opening of the Dev Agent Record. Later opening of lines 106-159 also succeeded.
9. Numbered inspection of `server/routes/equipment-catalogue.js` — succeeded; DELETE queries only `equipment.catalogue_id`, not `container_id`.
10. `git diff --name-only f13c21cb de5d5278` with the story excluded — exactly six changed source/test files. Fixed-string search of those six files for `D:\Terra Mortis\TM Suite` returned `NO_MATCHES`.
11. Environment checks — `server/.env` exists; root and server `node_modules` are junctions to the sibling install; local `mongod` PID 6436 was running. I inspected junction metadata only, not sibling files.
12. Test-file/story-history searches — identified the established nine-file equipment gate and its prior 185-test baseline. The current diff adds exactly six tests to `equipment.test.js` and five to `issue-879-defence-penalty-wirein.test.js`.
13. Exact required `npx vitest run tests/equipment.test.js` — could not start: Vite received `EPERM` trying to write `.vite-temp` through the read-only `node_modules` junction into the forbidden sibling checkout.
14. `npx vitest run tests/equipment.test.js --configLoader runner` — bypassed the Vite temp write, but the copied `.env` selected a remote MongoDB endpoint blocked by sandbox networking; result was 1 failed file, 20 skipped tests, `connect EACCES ...:27017`.
15. Exact required `npx vitest run tests/issue-879-defence-penalty-wirein.test.js` — likewise could not start because of the same `.vite-temp` `EPERM`.
16. `npx vitest run tests/issue-879-defence-penalty-wirein.test.js --configLoader runner` — **1 file passed, 53/53 tests passed**. Repeated after the discrimination restore with the same **53/53** result.
17. After hashing and proving `server/db.js` clean, temporarily changed only `tls: true` to `tls: false`, set per-process `MONGODB_URI=mongodb://127.0.0.1:27017` and `MONGODB_DB=tm_suite_test`, and ran `npx vitest run tests/equipment.test.js --configLoader runner` — **1 file passed, 20/20 tests passed**. Restored the line immediately; the Git blob hash returned to `c45f6a1f38dab9deb3c0b260f9cc5ce2ba91c4a6`.
18. Repeated that disclosed one-line TLS compatibility edit and ran the established nine named equipment files with `--configLoader runner` — **9 files passed, 196/196 tests passed**. Restored immediately.
19. Prove-discrimination: hashed and proved `equipment-derivation.js` clean, temporarily replaced its ownership predicate with `const stillOwned = true`, and reran the helper gate — exactly **2 failed, 51 passed (53)**, specifically the character-dangling and self-reference tests. Restored the original predicate, with blob hash `73e4bee75fe4f86cbaa5639d218a99575aa42fd9`, then reconfirmed **53/53 passed**.
20. `git branch --show-current`, `git rev-parse HEAD`, and `git merge-base HEAD f13c21cb` — returned `ms/issue-1154-eqc3-container-assignment`, `de5d527815820c11b68042187a0cd180e9ced54d`, and `f13c21cbc975cb7b6464f4a3031ca95a03722576`.
21. `node --check` on all four changed production JavaScript files — all succeeded with no output.
22. Restore verification initially exposed one LF-only line left by each `apply_patch` temporary edit under this CRLF worktree. `git diff` showed no semantic/content diff and the blob hashes matched, but `git status` still marked the files modified. `git update-index --refresh` and targeted `git checkout --` could not acquire/write the shared Git metadata because it is read-only in this sandbox; neither changed the files or index. I used the installed `unix2dos --keepdate` formatter on exactly those two verified workspace files, after which `git diff --exit-code` succeeded and `git status --short` showed no tracked modifications.

### Could not run / scope limitations

- The two exact bare Vitest commands could not get past Vite startup because the junction target is read-only; their real gate counts were obtained with Vite's `--configLoader runner` instead. The integration file additionally required the disclosed, restored TLS compatibility edit to use the available local non-TLS `mongod` rather than the sandbox-blocked remote URI.
- I did not run the entire repository-wide Vitest suite; AC #5 and the Dev Agent Record specifically claim the nine equipment-related files, and all nine ran green at 196/196.
- I could not independently inspect TM Wiki, TM Cockpit, TM Herald, or the sibling `D:\Terra Mortis\TM Suite` working tree because the ground rules prohibit it. I therefore cannot prove their external working-tree states or the historical collision narrative.

### Final workspace attestation

- Temporary edits to `server/db.js` and `public/js/data/equipment-derivation.js` were restored. Final `git diff --exit-code` for both succeeded, their original Git blob hashes match, and the final tracked worktree is clean.
- The only file I intentionally created is this requested findings report. The other untracked `issue-1154` review/diff files were already present and were not modified.
- I never read, wrote, or ran a command against `D:\Terra Mortis\TM Suite`. Test stack traces and junction metadata displayed that path because dependencies resolve through the provided junction, but I did not directly inspect or mutate the target.
