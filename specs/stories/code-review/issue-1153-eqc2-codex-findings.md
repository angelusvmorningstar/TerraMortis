# Adversarial review — EQC-2 (issue #1153)

## High

### Pass 1 — Blind hunter

- None found.

### Pass 2 — Edge case hunter

- None found.

### Pass 3a — Acceptance auditor before Dev Agent Record

- None found.

### Pass 3b — Dev Agent Record audit

- None found.

## Medium

### Pass 1 — Blind hunter

- None found.

### Pass 2 — Edge case hunter

- None found.

### Pass 3a — Acceptance auditor before Dev Agent Record

- None found.

### Pass 3b — Dev Agent Record audit

- None found.

## Low

### Pass 1 — Blind hunter

- None found.

### Pass 2 — Edge case hunter

- **Malformed equipment states are presented as a known location — “Stored elsewhere.”**
  - **Severity**: Low
  - **File:line**: `public/js/editor/sheet.js:2597`
  - **Triggering input or sequence**: A character document reaches the sheet renderer with an equipment row whose `state` is absent or outside the schema enum, for example `{ catalogue_id: "…" }` or `{ catalogue_id: "…", state: "teleported" }`. `isEquipmentOnMe(item)` returns `false`; because the value is not exactly `lost`, `locationLabel` returns `Stored elsewhere`.
  - **Observable consequence**: The sheet makes a positive but unsupported player-facing location claim for malformed/legacy data (and the adjacent state chip shows `undefined` or the unknown raw value). Normal POST/schema validation rejects this input, so the impact is limited to pre-existing, imported, or directly written bad records; returning no location label for unknown states would fail more safely.
  - **Confidence**: High for the rendered behavior; medium for production reachability because supported writes require one of the five enum values.

### Pass 3a — Acceptance auditor before Dev Agent Record

- None found.

### Pass 3b — Dev Agent Record audit

- **The completion record says “THREE” consolidations while immediately enumerating four.**
  - **Severity**: Low
  - **File:line**: `specs/stories/feature.1153.eqc2-onme-elsewhere-display.story.md:162`
  - **Triggering input or sequence**: An auditor reads the completion note stating that `isEquipmentOnMe` consolidated “THREE” checks, then follows its parenthetical list (“roll.js's two filters, roll-v2.js's two filters — four call sites”). Independent grep finds calls at `roll.js:151`, `roll.js:244`, `roll-v2.js:226`, and `roll-v2.js:319`.
  - **Observable consequence**: The implementation is correct, but the permanent audit record is internally contradictory and understates the completed consolidation count.
  - **Confidence**: High.

- **The sibling-repository cleanliness claim is not independently verifiable within this review’s permitted scope.**
  - **Severity**: Low
  - **File:line**: `specs/stories/feature.1153.eqc2-onme-elsewhere-display.story.md:174`
  - **Triggering input or sequence**: The Dev Agent Record claims zero diff and only read operations in TM Wiki, TM Cockpit, and TM Herald. This review’s ground rules expressly prohibit reading or operating in those sibling repositories, and TM Suite contains no evidence that can prove their worktree state or the historical commands used there.
  - **Observable consequence**: AC #6 is consistent with the supplied TM Suite story diff, but the stronger historical “zero diff / Read-Grep only” assertion remains author-attested rather than independently audited here. This is not evidence that the claim is false.
  - **Confidence**: High that the claim is unverified-as-stated; no conclusion about whether it is factually false.

## Ship assessment

Ready to ship as-is. No High or Medium defect was found, the valid-state behavior and four roll gates are unchanged, all 181 named tests passed when pointed at the healthy local test database with the client’s TLS option temporarily made compatible, and mutation testing discriminated `active` exactly as claimed. The malformed-state display fallback and the two record-quality issues above are low-risk follow-ups, not blockers.

## Validation notes

### Pass boundaries and files opened

- **Pass 1**: Opened only `specs/stories/code-review/issue-1153-eqc2-diff.txt`. I did not inspect repository source, the story, or the Dev Agent Record before freezing Pass 1.
- **Pass 2**: Directly opened `public/js/data/equipment-derivation.js`, `public/js/editor/sheet.js`, `public/js/suite/roll.js`, `public/js/suite/roll-v2.js`, `server/schemas/character.schema.js`, and `server/routes/characters.js`. Repository searches covered `public`, `server`, and `scripts`; one over-broad recursive search timed out after also scanning/matching `.claude`, `archive`, `data`, and the issue-1153 code-review prompt/raw-output files. It explicitly excluded `feature.1153.eqc2-onme-elsewhere-display.story.md`; I did not read the story in this pass. No `AGENTS.md` was found.
- **Pass 3a**: Opened only lines 15–91 of `specs/stories/feature.1153.eqc2-onme-elsewhere-display.story.md` after locating headings. This included Story, Background, Explicitly NOT this story, and Acceptance Criteria 1–6, and stopped before Tasks, Dev Notes, and the Dev Agent Record. I froze Pass 3a before continuing.
- **Pass 3b**: Opened the story from line 138 through EOF (the complete Dev Agent Record), plus `package.json`, `server/package.json`, `server/vitest.config.js`, `server/db.js`, and searched `server/config.js`, `server/tests/helpers/setup-env.js`, and `server/tests/helpers/db-setup.js`. Vitest opened each of the nine named test files and their imports.
- I did not open, modify, commit, or push anything in TM Wiki, TM Cockpit, or TM Herald.

### Behavioral traces and claim checks

- Direct execution with the same `globalThis.location` shim used by the tests produced `active: old=true new=true` and `stashed: old=false new=false`. Therefore all four roll filters preserve the removed predicate for both requested traces: an otherwise-eligible active item remains included; an otherwise-eligible stashed item remains excluded.
- Valid display pairs are non-contradictory: `Carried/Worn/Active` pair with `On you`; `Stashed` pairs with `Stored elsewhere`; `Lost` has no location label. Every one of the six call sites filters or conditionally omits the lost-state `null`.
- The Container render block contains zero `locationLabel` occurrences. The full file contains seven: one definition and six calls.
- Source search found no other code copy of the exact `carried || worn || active` item-state predicate outside `isEquipmentOnMe`; armour’s intentionally narrower `state === 'worn'` logic remains separate.
- Missing and unknown states executed as `predicate=false` and `label=Stored elsewhere`, producing the Pass 2 Low finding. Supported writes/schema validation require one of the five known states.
- Grep found exactly four roll consumer calls: two in each roll file. The Dev Agent Record’s word “THREE” is false; its parenthetical “four call sites” is correct.
- The Container-count claim is true: seven total `locationLabel` occurrences, zero within the Container block.
- The mutation claim is true. Temporarily removing only the `active` clause and running `issue-879-defence-penalty-wirein.test.js` yielded exactly `1 failed | 43 passed (44)`, at the active-state expectation. The source was restored byte-for-byte afterward.
- The branch correction is substantially corroborated by reflog. The EQC-2 branch first appeared at `ddf059f8`, which is current `origin/main`; it was then left for EQC-1 and recreated at `cb863812`. Current branch, HEAD, and merge-base are all the requested EQC-1 tip `cb863812`. The reflog cannot independently prove the subjective timing phrase “before any EQC-2 code was written,” but the resulting branch base is fully corrected and the reviewed diff contains no taxonomy-reversion residue.

### Exact vitest gate results

Each named file was invoked separately.

- `equipment.test.js`: 14/14 passed with the local-compatible test connection.
- `equipment-client-fixes.test.js`: 6/6 passed.
- `issue-868-ecm-1-equipment-catalogue-api.test.js`: 28/28 passed with the local-compatible test connection.
- `issue-871-876-ecm-4-9-bundle.test.js`: 19/19 passed.
- `issue-872-ecm-5-editor-cache.test.js`: 14/14 passed.
- `issue-896-availability-filter.test.js`: 28/28 passed.
- `issue-879-defence-penalty-wirein.test.js`: 44/44 passed in the unmutated run.
- `issue-1152-eqc1-bucket-migration.test.js`: 14/14 passed with the local-compatible test connection.
- `issue-873-ecm-6-admin-sidebar.test.js`: 14/14 passed.
- Aggregate with the local test database reachable: **9 files, 181/181 passed**, matching the Dev Agent Record.

The first as-is run inherited the restricted remote URI and failed `equipment.test.js` with 14 skipped. A second full nine-file run explicitly targeted the healthy local `mongod`, but the application client’s pre-existing unconditional `tls: true` caused localhost resets: six files passed outright; `issue-1152` ran 11 static tests and skipped 3 integration tests before its suite-level connection failure; `equipment` skipped 14 and failed; `issue-868` skipped 28 and failed. That run’s exact aggregate was **136 passed, 45 skipped, 3 failed files**. A direct non-TLS driver ping to `tm_suite_test` returned `{ ok: 1 }`, proving the daemon itself was healthy. With only `server/db.js`'s TLS option temporarily changed to `false`, the three affected files passed 14/14, 28/28, and 14/14. Thus no named test remained unrun, but the 181/181 verification required that disclosed temporary environment-compatibility edit.

Vitest also emitted a pre-existing deprecation warning that `test.poolOptions` was removed in Vitest 4. No test was omitted because of it.

### Command log

All shell commands included the quoted repository root. Commands issued concurrently are listed separately here.

1. `Get-Content -Raw "D:\Terra Mortis\TM Suite\specs\stories\code-review\issue-1153-eqc2-diff.txt"` — success; Pass 1 input.
2. `Test-Path "D:\Terra Mortis\TM Suite\specs\stories\code-review\issue-1153-eqc2-codex-findings.md"` — `False` before creating the report.
3. `rg --files "D:\Terra Mortis\TM Suite" -g "AGENTS.md" -g "!specs/stories/feature.1153.eqc2-onme-elsewhere-display.story.md"` — exit 1, no `AGENTS.md` found.
4. `Get-Content "D:\Terra Mortis\TM Suite\public\js\data\equipment-derivation.js"` — success.
5. `$p = "D:\Terra Mortis\TM Suite\public\js\editor\sheet.js"; $lines = Get-Content $p; $lines[2550..2785]` — success; display was truncated, so a narrower read was later used.
6. `$p = "D:\Terra Mortis\TM Suite\public\js\suite\roll.js"; $lines = Get-Content $p; $lines[115..270]` — success.
7. `$p = "D:\Terra Mortis\TM Suite\public\js\suite\roll-v2.js"; $lines = Get-Content $p; $lines[190..345]` — success.
8. `rg -n --hidden ... "carried|worn|active" "D:\Terra Mortis\TM Suite"` with exclusions for `.git`, `node_modules`, the story, supplied diff, and findings — timed out (exit 124) after over-broad matches; no forbidden story content was read.
9. `rg -n --hidden --type-add "code:*.{js,mjs,cjs,ts,tsx,html}" -tcode ... "item\.state\s*===\s*'(carried|worn|active)'" "D:\Terra Mortis\TM Suite"` — issued in a three-search batch that timed out.
10. `rg -n --hidden --type-add "code:*.{js,mjs,cjs,ts,tsx,html}" -tcode ... "carried.{0,160}worn.{0,160}active|active.{0,160}worn.{0,160}carried" "D:\Terra Mortis\TM Suite"` — same timed-out batch.
11. `rg -n --hidden ... "isEquipmentOnMe|locationLabel" "D:\Terra Mortis\TM Suite"` — produced the relevant source/test occurrence list; the enclosing batch timed out after also matching issue-1153 review artifacts.
12. `rg -n "item\.state\s*===\s*'(carried|worn|active)'" "D:\Terra Mortis\TM Suite\public" "D:\Terra Mortis\TM Suite\server" "D:\Terra Mortis\TM Suite\scripts"` — success; only the shared predicate plus a test comment.
13. `rg -n "carried.{0,160}worn.{0,160}active|active.{0,160}worn.{0,160}carried" ...` over the same three quoted trees — success; no other three-state derivation.
14. `rg -n "state.*(carried|worn|stashed|lost|active)|(carried|worn|stashed|lost|active).*state" ...` over server/public/scripts — success but noisy because generated fixtures matched.
15. Reads of `character.schema.js[330..375]`, `characters.js[825..880]`, and `sheet.js[2600..2768]` — first issued alongside the initial Node probe; the probe failed before useful combined output was returned, then all three reads were rerun successfully.
16. Initial inline Node import/trace of `equipment-derivation.js` — failed with `ReferenceError: location is not defined`.
17. The same Node trace with `globalThis.location = { hostname: '' }` — success: old/new matched for active and stashed; missing/unknown states mapped to `Stored elsewhere`.
18. `rg -n "^#{1,3} " "D:\Terra Mortis\TM Suite\specs\stories\feature.1153.eqc2-onme-elsewhere-display.story.md"` — success; used only to locate section boundaries.
19. `$p = "...feature.1153...story.md"; $lines = Get-Content $p; $lines[14..90]` — success; Pass 3a sections only.
20. `git -C "D:\Terra Mortis\TM Suite" diff --name-only cb863812 --` — success; showed the story files plus unrelated tracked workspace changes.
21. `git -C "D:\Terra Mortis\TM Suite" status --short` — success but very large; confirmed the pre-existing dirty umbrella worktree and the new intended findings file.
22. `git -C "D:\Terra Mortis\TM Suite" diff --unified=0 cb863812 -- "server/schemas" "server/routes" "public/js/downtime" "public/js/dt"` — empty; no excluded schema/route/DT changes in the tracked diff.
23. `$p = "...feature.1153...story.md"; $lines = Get-Content $p; $lines[137..($lines.Length - 1)]` — success; complete Dev Agent Record in Pass 3b.
24. Reads/searches of root `package.json`, `server/package.json`, `server/vitest.config.js`, plus `rg --files ... -g "vitest.config.*" -g "package.json"` — success; established the server test command.
25. `rg -n "isEquipmentOnMe\(item\)"` over both roll files — four calls.
26. PowerShell count of `locationLabel` in the full sheet and the bounded Container block — seven total, zero in Container.
27. First three-file vitest loop — stopped at `equipment.test.js`; 14 skipped and file failed because the inherited remote Mongo connection was denied (`EACCES`).
28. `Set-Location "D:\Terra Mortis\TM Suite"; Get-Process mongod ...` — success; local `mongod` PID 6436 running.
29. Nine-file `npm --prefix "D:\Terra Mortis\TM Suite\server" test -- "tests/<file>"` loop with `MONGODB_URI=127.0.0.1` — exact 136 passed / 45 skipped / three failed files because `server/db.js` forced TLS.
30. `rg -n "process\.env|MongoClient"` over `server/db.js` and test setup helpers, then reads/searches of `server/db.js` and `server/config.js` — success; identified the unconditional TLS option.
31. `Get-CimInstance Win32_Process ... mongod.exe` after setting the quoted root — failed with access denied; process command line could not be inspected.
32. `Set-Location "D:\Terra Mortis\TM Suite"; netstat -ano | Select-String "6436"` — success; local listener at `127.0.0.1:27017`.
33. Inline Node `MongoClient('mongodb://127.0.0.1:27017')` ping from the quoted server directory — success, `{ ok: 1 }`.
34. SHA-256 reads for `server/db.js` and `equipment-derivation.js` — success; used as restoration baselines.
35. Three-file integration rerun after the temporary TLS edit — 14/14, 28/28, and 14/14 passed.
36. Mutated `issue-879-defence-penalty-wirein.test.js` run — expected exit 1 with exactly 1 failed and 43 passed.
37. Git branch/HEAD/merge-base, 30-entry HEAD reflog, branch list, branch reflog, `origin/main`, and commit-show commands using `git -C "D:\Terra Mortis\TM Suite"` — success; results described above.
38. `rg -n "THREE previously|Full equipment suite|Prove-discriminated|Zero diff" "...feature.1153...story.md"` — success; record claims at lines 162, 171, 172, and 174.
39. Final normalized comparison of the six-file live Git diff to `issue-1153-eqc2-diff.txt`, SHA-256 checks, scoped status, and `server/db.js` diff count — story diff `True`, DB hash restored, DB diff zero. It also detected the predicate file’s edited line had one LF among CRLF lines despite semantic equality.
40. Byte newline count and inline Node lone-LF locator — found only line 105 affected by patch-tool newline normalization.
41. `Get-Command unix2dos` — found Git’s formatter; `unix2dos "D:\Terra Mortis\TM Suite\public\js\data\equipment-derivation.js"` restored CRLF; final SHA-256 returned to the captured original `19B8E66C5715EC6929CEED12CAF203F6DF568D0C625F8C53D184EBAA99E2EFDC`.
42. Final report-heading scan, normalized six-file diff comparison, both restoration hashes, and scoped `git status --short` — all report sections present; story diff still equal to the supplied diff; both hashes still exact; status contained the six expected story modifications plus this intended untracked findings file, and no `server/db.js` change.

### Modification/restoration attestation and gaps

- Intended persistent modification: this findings file only.
- Temporary modification 1: `server/db.js`, `tls: true` → `false` solely to run the three integration-bearing suites against `tm_suite_test`; restored to SHA-256 `8E7BD3C2BDCD0D74D6BF7E36C7428C6BCDAE44D2D98D73605AEED3540ACB22F2`, with zero Git diff.
- Temporary modification 2: removed the `active` disjunct from `isEquipmentOnMe`; restored to the captured original SHA-256 `19B8E66C5715EC6929CEED12CAF203F6DF568D0C625F8C53D184EBAA99E2EFDC`. The patch tool initially left that restored line with LF in an otherwise CRLF file; `unix2dos` restored the original byte content.
- Final six-file source/test diff compared equal to the supplied `issue-1153-eqc2-diff.txt`. Scoped `git status --short` showed only the six expected story files modified and this findings file untracked; `server/db.js` was absent. The wider worktree contains many pre-existing unrelated changes/untracked files, which I did not alter.
- Nothing requested remained unrun. The only verification gap is the sibling-repository historical cleanliness claim, because the ground rules prohibited inspecting those repositories. The first database attempts and process-command-line inspection failures are disclosed above rather than omitted.
