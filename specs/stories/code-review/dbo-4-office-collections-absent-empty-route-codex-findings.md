# DBO-4 adversarial fact-check findings

## High

### Claim 3 — PARTIALLY CONFIRMED

The category-classification logic is real: `planMigration` builds a map from
`office_seats.office_category`, emits `refused-no-seat` for zero candidates,
`refused-ambiguous` for multiple candidates, and `will-migrate` only for exactly one candidate
([`server/scripts/migrate-office-purchases-to-seats.mjs:145`](../../../server/scripts/migrate-office-purchases-to-seats.mjs#L145)).

The claimed compounding behaviour is not real as described. If both a current seat-keyed document
and its old category-keyed document exist, `planMigration` emits two independent rows: an
`already-seat-keyed` row for the former and a `will-migrate` row for the latter. `applyMigration`
skips only the former. For the category row, its `$setOnInsert` finds the existing seat document,
counts the row as `recovered`, preserves the seat document, and then deletes the category document
([`server/scripts/migrate-office-purchases-to-seats.mjs:227`](../../../server/scripts/migrate-office-purchases-to-seats.mjs#L227),
[`server/scripts/migrate-office-purchases-to-seats.mjs:267`](../../../server/scripts/migrate-office-purchases-to-seats.mjs#L267)).

Therefore the old document is not “left untouched forever.” The actual hazard is worse in one
respect: any fields that exist only in the old document are deleted rather than orphaned. The
existing test at `server/tests/oxp-11-office-purchase-seat-keying.test.js:460-476` codifies this
seat-wins/delete-old behaviour, but assumes that the two-document state can only mean an interrupted
earlier migration. The current seat-keyed route can create the indistinguishable state too.

### Claim 6 — REFUTED

The “no code defect, Task 6 N/A” conclusion does not survive the active hunt. The migration has a
production-data-loss path under the story's own warned sequence, and the merit-dot write route has a
separate type-validation hole. Both are detailed as standalone findings below.

### Existing seat document is mistaken for an interrupted migration and old purchase fields are deleted

- **Severity**: High
- **File:line**: `server/scripts/migrate-office-purchases-to-seats.mjs:160-187, 227-230, 267-307`
- **Triggering input or sequence**: A category-keyed document exists for a uniquely resolved category;
  before migration, an ST uses the current route for that seat, creating a seat-keyed document. The
  two documents contain different merit keys or values. `planMigration` and then `applyMigration`
  are run.
- **Observable consequence**: The seat-keyed document wins without a merge or refusal; the old
  category-keyed document is deleted. Purchase fields present only in the old document are lost. The
  log calls this `recovered` and says “interrupted earlier run,” even though the same shape can be
  created by normal post-deployment application traffic.
- **Confidence**: High. This follows directly from the two independently emitted plan rows, the
  `$setOnInsert` match branch, and the unconditional guarded delete. No database execution is needed
  to establish it.

## Medium

### Claim 4 — PARTIALLY CONFIRMED

Against the repository's stored `origin/main` (`2534c559c96917e1970530e1106b4f25e75166a0`), the
implementation commits for `oxp-1` through `oxp-5` and `oxp-11` are ancestors. `oxp-6` commit
`a358d180ed5c499c2b08077cff2025e9c11cf8ec` is **not** an ancestor (`git merge-base
--is-ancestor` exited 1), and `git log origin/main` produced no `oxp-6` match. It exists on local
branch `ms/oxp-6-office-tab-purchase-markers`, whose parent is the `oxp-5` merge.

Accordingly, the story, epic correction, and `sprint-status.yaml:975` overstate the merge state when
they say `oxp-1` through `oxp-6` are all reachable from `origin/main`. `sprint-status.yaml:982` also
still labels `oxp-6-office-tab-purchase-markers` as `backlog`, exposing the internal contradiction.

I could not refresh the remote-tracking ref: `git fetch origin main` was denied write access to
`.git/FETCH_HEAD`, and the read-only fallback `git ls-remote` could not reach GitHub. Thus the result
is conclusive for the `origin/main` ref available in this review workspace, but the current GitHub
head could not be independently checked.

### Merit-dot validation coerces non-numeric JSON values to zero

- **Severity**: Medium
- **File:line**: `server/routes/office-merit-dots.js:56-64, 78-82`
- **Triggering input or sequence**: An ST sends a valid seat and merit with, for example,
  `{"merit":"Safe Place","dots":null}`. `false`, `""`, whitespace-only strings, and `[]` have the
  same issue.
- **Observable consequence**: `Number(dots)` converts the value to `0`; integer/range validation
  passes; the endpoint returns success and writes `dots.Safe Place: 0` instead of rejecting malformed
  input. This can silently clear a purchase. The neighbouring manoeuvre-rank route explicitly avoids
  this coercion class at `office-manoeuvre-rank.js:56-61`, making the inconsistency especially clear.
- **Confidence**: High. These are standard JavaScript conversions and the write follows immediately
  after the check.

## Low

### Claim 1 — PARTIALLY CONFIRMED

All four write call sites match the claimed upsert convention:

- `office-manoeuvre-rank.js:63-67`: absolute set uses `upsert: true`.
- `office-manoeuvre-rank.js:113-124`: relative step uses `upsert: true`.
- `office-merit-dots.js:78-82`: merit set uses `upsert: true`.
- `office-seats.js:508-547`: `resetManoeuvreRank` uses `upsert: false`; lines 537-541 explicitly say
  that no document means rank zero and no zero row should be minted.

Both GET handlers also degrade to `{}` when `find({}).toArray()` returns no documents. The exact
claim that the handlers “default a missing key to `0`/`{}`” is imprecise, however. The handlers emit
no key for a missing seat; their `doc.rank || 0` / `doc.dots || {}` expressions default a missing
field on an existing document. The client supplies the missing-seat defaults at
`public/js/tabs/office-tab.js:344,348,458`. The overall “no document = zero” convention is confirmed;
the attribution of that default to the GET handlers is not literal.

### Claim 2 — CONFIRMED

The full accept handler supports the claim. `PUT /:id/accept` starts a session and places the pending
claim, budget update, character CAS, `office_actions.insertOne`, and pending resolution inside one
`dbSession.withTransaction` callback. The log insert receives `{ session: dbSession }` at
`office-actions.js:356`. The catch at lines 365-381 converts only the file-local `RouteResponse` into
an HTTP response; every other error is re-thrown. An `insertOne` failure is therefore neither
swallowed nor converted to a success, and the transaction does not leave its preceding writes
committed. No silent write-failure branch was found in this handler.

### Claim 5 — PARTIALLY CONFIRMED

The main Office table's auth descriptions match the code and the authenticated mounts in
`server/index.js:188-193`:

- seat/rank/merit GETs are authenticated reads; their writes carry `requireRole('st')`;
- action-log and latest-session GETs are authenticated reads;
- `POST /api/office_actions` is authenticated and enforces actor ownership unless the caller is ST;
- pending GET, accept, and decline carry `requireRole('st')`.

Two documentation statements are wrong:

1. `reference-data-ssot.md:132` says `GET/PUT /api/office_actions/pending`. Only
   `GET /api/office_actions/pending` exists. The PUT routes are
   `/:id/accept` and `/:id/decline`.
2. `reference-data-ssot.md:49` says all four `office_*` collections use seat-keyed `_id`s. That is
   false: `office_actions` log rows use MongoDB-generated IDs, and `office_action_budgets` uses the
   composite string `${game_session_id}:${actor_id}`. Only `office_seats` and the two purchase-state
   collections participate in the seat-key scheme.

## Validation notes

### Safety boundaries

- I did not connect to or query `tm_suite` or any other database.
- I did not execute, import, or call `migrate-office-purchases-to-seats.mjs`, `planMigration`, or
  `applyMigration`. Review of that file was static only.
- I did not run DB-backed tests because that was unnecessary for these static claims and would create
  avoidable database-target risk. I ran syntax-only `node --check`, which does not execute modules.
- I did not open or reference any sibling repository.
- Exact live counts, the reported `_id` values `Enforcer` / `Head of State`, and their reported
  `dots` contents are deliberately **unverified reports**, neither accepted nor rejected by this
  review.

### Commands and real results

All commands ran from `D:\Terra Mortis\TM Suite`.

1. Initial instruction/worktree discovery:

   ```powershell
   $files = rg --files -g 'AGENTS.md' -g '!../*'; Write-Output 'AGENTS_FILES'; $files; Write-Output 'GIT_STATUS'; git status --short; Write-Output 'TOP_LEVEL'; Get-ChildItem -Force | Select-Object Name,Mode
   ```

   Exit 0. `AGENTS_FILES` was empty. `git status --short` reported a very large pre-existing set of
   untracked files, including the supplied DBO-4 diff and earlier DBO-4 review/log files; the tool
   truncated the display (`original token count: 10024`, `Total output lines: 1037`; underlying shell
   reported 1608 output lines). The top-level listing confirmed this repository root. Git also warned
   that `C:\Users\angel/.config/git/ignore` was inaccessible.

2. Required fetch attempt:

   ```powershell
   git fetch origin main; Write-Output "FETCH_EXIT=$LASTEXITCODE"; git rev-parse origin/main; Write-Output "REV_PARSE_EXIT=$LASTEXITCODE"
   ```

   Real output:

   ```text
   FETCH_EXIT=255
   2534c559c96917e1970530e1106b4f25e75166a0
   REV_PARSE_EXIT=0
   error: cannot open '.git/FETCH_HEAD': Permission denied
   ```

3. Read-only remote fallback:

   ```powershell
   git ls-remote origin refs/heads/main; Write-Output "LS_REMOTE_EXIT=$LASTEXITCODE"; git rev-parse origin/main; Write-Output "REV_PARSE_EXIT=$LASTEXITCODE"
   ```

   Real output:

   ```text
   LS_REMOTE_EXIT=128
   2534c559c96917e1970530e1106b4f25e75166a0
   REV_PARSE_EXIT=0
   fatal: unable to access 'https://github.com/angelusvmorningstar/TerraMortis.git/': Failed to connect to github.com port 443 after 80 ms: Could not connect to server
   ```

4. Target-file inventory:

   ```powershell
   $paths = @('specs/stories/code-review/dbo-4-office-collections-absent-empty-route-diff.txt','specs/stories/dbo-4-office-collections-absent-empty-route.md','specs/epic-dbo-database-ownership.md','specs/reference-data-ssot.md','specs/deferred-work.md','specs/stories/sprint-status.yaml','server/routes/office-manoeuvre-rank.js','server/routes/office-merit-dots.js','server/routes/office-actions.js','server/routes/office-seats.js','server/scripts/migrate-office-purchases-to-seats.mjs'); foreach ($p in $paths) { $item = Get-Item -LiteralPath $p; $count = (Get-Content -LiteralPath $p).Count; $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash; "$p`t$count lines`t$($item.Length) bytes`t$hash" }
   ```

   Exit 0. The significant full-read targets were: story 293 lines / SHA-256
   `7063246325CC8E5F85FFE8DF127E218D640DEE6F846B661F557044BB907FF944`; manoeuvre route 128
   lines / `1377F8CACD72B96BD0B48DF449FE0E26806D859C28D24114C12925AD3AF1C566`; merit route 86
   lines / `3574AB1B6FF5552EA4159178099260F9AC48A05600DCD81DE98454BB29625C0B`; actions route 414
   lines / `DD51B3EBB665E2A5B82588DD50C45C3988F15B321B7E54802DB52A70B8FC8B72`; seats route 558
   lines / `BF372C3A86A5018FD57853BC50CDCEF39C80B7671A4309D37A0D51381007646E`; migration 376
   lines / `9A673AC7B04A019F78C0335AC3FBF161B44EB61299AE0E3DDCCDE184A95751E8`.

5. Full numbered reads (all exit 0 and printed the complete indicated ranges):

   ```powershell
   $n=0; Get-Content -LiteralPath 'specs/stories/dbo-4-office-collections-absent-empty-route.md' | ForEach-Object { $n++; '{0,4}: {1}' -f $n, $_ }
   ```

   Printed all 293 story lines.

   ```powershell
   Write-Output '=== office-manoeuvre-rank.js ==='; $n=0; Get-Content -LiteralPath 'server/routes/office-manoeuvre-rank.js' | ForEach-Object { $n++; '{0,4}: {1}' -f $n, $_ }; Write-Output '=== office-merit-dots.js ==='; $n=0; Get-Content -LiteralPath 'server/routes/office-merit-dots.js' | ForEach-Object { $n++; '{0,4}: {1}' -f $n, $_ }
   ```

   Printed all 128 and 86 lines.

   ```powershell
   $n=0; Get-Content -LiteralPath 'server/routes/office-actions.js' | ForEach-Object { $n++; '{0,4}: {1}' -f $n, $_ }
   ```

   Printed all 414 lines.

   ```powershell
   $lines = Get-Content -LiteralPath 'server/routes/office-seats.js'; for ($i=0; $i -lt [Math]::Min(280,$lines.Count); $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
   $lines = Get-Content -LiteralPath 'server/routes/office-seats.js'; for ($i=280; $i -lt $lines.Count; $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
   ```

   Printed lines 1-280 and 281-558.

   ```powershell
   $lines = Get-Content -LiteralPath 'server/scripts/migrate-office-purchases-to-seats.mjs'; for ($i=0; $i -lt [Math]::Min(210,$lines.Count); $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
   $lines = Get-Content -LiteralPath 'server/scripts/migrate-office-purchases-to-seats.mjs'; for ($i=210; $i -lt $lines.Count; $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
   ```

   Printed lines 1-210 and 211-376. The script was not executed.

6. Documentation excerpts and diff structure:

   ```powershell
   $lines = Get-Content -LiteralPath 'specs/reference-data-ssot.md'; for ($i=0; $i -lt $lines.Count; $i++) { if ($i -ge 75 -and $i -le 135) { '{0,4}: {1}' -f ($i+1), $lines[$i] } }; Write-Output '=== office diff hunks ==='; Select-String -LiteralPath 'specs/stories/code-review/dbo-4-office-collections-absent-empty-route-diff.txt' -Pattern '^diff --git','^@@','^\+## Office','^\+\|.*office_' | ForEach-Object { $_.Line }
   $lines = Get-Content -LiteralPath 'specs/reference-data-ssot.md'; for ($i=30; $i -le 74; $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
   ```

   Both exited 0. They printed the Office section at lines 38-53 and Auth Boundaries at 125-135;
   the diff headers named only the five documentation/spec/tracking files stated in the prompt.

7. Broad auth/mount search:

   ```powershell
   rg -n -C 3 "office(_|-)manoeuvre|office(_|-)merit|office_actions|office_seats|app\.use\(.+auth|requireAuth|authenticate" server --glob '!scripts/**' --glob '!tests/**'
   ```

   Could not complete: exit 124 after 12.5 seconds. The tool truncated 3185 lines of output. Before
   timeout it printed the relevant `server/index.js:188-193` authenticated mounts and route matches.
   No conclusion depends on omitted tail output; the four route files had already been read in full.

8. OXP history searches:

   ```powershell
   foreach ($story in @('1','2','3','4','5','6','11')) { Write-Output "=== oxp-$story ==="; git log origin/main --format='%H%x09%s' --extended-regexp --regexp-ignore-case --grep="oxp[.-]?$story([^0-9]|$)" -n 20; Write-Output "LOG_EXIT=$LASTEXITCODE" }
   ```

   Exit 0 for every log. `oxp-1` through `oxp-5` and `oxp-11` produced matching commits/merges;
   `oxp-6` produced no commits.

   ```powershell
   Write-Output 'OXP_FILES'; rg --files specs/stories | rg '(^|[/\\])oxp-(1|2|3|4|5|6|11)[^/\\]*\.md$'; Write-Output 'SPRINT_ROWS'; rg -n -i 'oxp-(1|2|3|4|5|6|11)(:|\b)|epic-oxp' specs/stories/sprint-status.yaml; Write-Output 'OXP6_HISTORY'; $oxp6 = rg --files specs/stories | rg '(^|[/\\])oxp-6[^/\\]*\.md$'; if ($oxp6) { git log origin/main --format='%H%x09%s' -- $oxp6 } else { Write-Output 'NO_OXP6_STORY_FILE' }; Write-Output "COMMAND_EXIT=$LASTEXITCODE"
   ```

   The tool truncated the large sprint-row output. Relevant real output: no tracked oxp-6 story file
   was found by that pattern, `OXP6_HISTORY` printed `NO_OXP6_STORY_FILE`, and `COMMAND_EXIT=1` because
   the final `rg` did not match.

   ```powershell
   $lines = Get-Content -LiteralPath 'specs/stories/sprint-status.yaml'; for ($i=968; $i -le 989; $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
   ```

   Exit 0; tool output was truncated because the individual YAML lines are extremely long. It showed
   line 975 claiming oxp-6 commit `a358d180` is on origin/main and line 982 marking oxp-6 backlog.

   ```powershell
   git show --no-patch --format='%H%n%P%n%s%n%b' a358d180; Write-Output "SHOW_EXIT=$LASTEXITCODE"; git merge-base --is-ancestor a358d180 origin/main; Write-Output "ANCESTOR_EXIT=$LASTEXITCODE"; git show --stat --oneline --decorate --no-renames a358d180
   ```

   Exit 0 overall. `SHOW_EXIT=0`; subject was `feat(office-tab): oxp-6 purchase and affordability
   markers`; parent was `1063787b...`; `ANCESTOR_EXIT=1`; decoration showed local branch
   `ms/oxp-6-office-tab-purchase-markers`.

   ```powershell
   $checks = [ordered]@{'oxp-1'='6e7864e5a91279cd00f5799a3530729977d2666a';'oxp-2'='c0838f9bc1d129e25509bb38e399ac4a7c1d8fff';'oxp-3'='272e8e07bf416754ffa01ac3dfd3b9e1ee402ad1';'oxp-4'='9c30420bde82f54940d77478b3aca3b816ab9647';'oxp-5'='4d93874045f78b068a964e7845e63d6d4ed3b924';'oxp-6'='a358d180ed5c499c2b08077cff2025e9c11cf8ec';'oxp-11'='3821ecdb5921eb6558927f8ca24b65b3cedd31ba'}; foreach ($entry in $checks.GetEnumerator()) { git merge-base --is-ancestor $entry.Value origin/main; "$($entry.Key)`t$($entry.Value)`tancestor_exit=$LASTEXITCODE" }; Write-Output 'ORIGIN_MAIN'; git show -s --format='%H%x09%s' origin/main
   ```

   Real result: ancestor exit 0 for oxp-1, 2, 3, 4, 5, and 11; ancestor exit 1 for oxp-6.
   `origin/main` was `2534c559... Merge pull request #1166 ... dbo-3...`.

9. Epic/deferred documentation read:

   ```powershell
   Write-Output '=== epic DBO-4 section ==='; $lines = Get-Content -LiteralPath 'specs/epic-dbo-database-ownership.md'; for ($i=160; $i -le 221; $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }; Write-Output '=== deferred DBO-4 entry ==='; $lines = Get-Content -LiteralPath 'specs/deferred-work.md'; for ($i=285; $i -lt $lines.Count; $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
   ```

   Exit 0; printed epic lines 161-222 and deferred-work lines 286-314, including the incorrect
   oxp-6 and “left untouched forever” claims.

10. Client defaults and migration-test intent:

    ```powershell
    rg -n -C 5 "meritDots\[|manoeuvreRanks\[|rankData\[|dotData\[|dotsBySeat|rankBySeat|seatId.*\?\?|\?\? 0|\|\| 0" public/js/tabs/office-tab.js public/js/data/office-xp.js
    rg -n -C 8 "recovered|already-seat-keyed|interrupted|stale category|already held" server/tests/oxp-11-office-purchase-seat-keying.test.js
    ```

    Both exited 0. The first showed missing-seat defaults at office-tab lines 344, 348, and 458. The
    second showed the already-seat-keyed test and the lines 460-476 recovery test that preserves the
    seat document and deletes the category document.

11. Diff numstat:

    ```powershell
    git apply --numstat -- 'specs/stories/code-review/dbo-4-office-collections-absent-empty-route-diff.txt'; Write-Output "NUMSTAT_EXIT=$LASTEXITCODE"
    ```

    Real output:

    ```text
    23  0  specs/deferred-work.md
    31  1  specs/epic-dbo-database-ownership.md
    21  0  specs/reference-data-ssot.md
    5   3  specs/stories/sprint-status.yaml
    293 0  specs/stories/dbo-4-office-collections-absent-empty-route.md
    NUMSTAT_EXIT=0
    ```

12. Syntax-only checks:

    ```powershell
    $files = @('server/routes/office-manoeuvre-rank.js','server/routes/office-merit-dots.js','server/routes/office-actions.js','server/routes/office-seats.js','server/scripts/migrate-office-purchases-to-seats.mjs'); foreach ($f in $files) { node --check $f; "$f`tNODE_CHECK_EXIT=$LASTEXITCODE" }
    ```

    All five printed `NODE_CHECK_EXIT=0`.

13. Output-target collision check:

    ```powershell
    $target = 'specs/stories/code-review/dbo-4-office-collections-absent-empty-route-codex-findings.md'; "TARGET_EXISTS=$(Test-Path -LiteralPath $target)"; git status --short -- $target; Write-Output "STATUS_EXIT=$LASTEXITCODE"
    ```

    Real output was `TARGET_EXISTS=False`, `STATUS_EXIT=0`, plus the same inaccessible global-ignore
    warning. The target did not pre-exist.

14. Findings-file verification (before appending this command record):

    ```powershell
    $target = 'specs/stories/code-review/dbo-4-office-collections-absent-empty-route-codex-findings.md'; Get-Item -LiteralPath $target | Select-Object FullName,Length; "LINES=$((Get-Content -LiteralPath $target).Count)"; "SHA256=$((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash)"; rg -n '^## |^### Claim [1-6]|^### Existing|^### Merit' $target; git status --short -- $target; Write-Output "VERIFY_EXIT=$LASTEXITCODE"
    ```

    Exit 0. It reported 20,363 bytes, 353 lines, SHA-256
    `3F1DF3210678FA9293C1206E09E27F4DAB23671E26A5FD80E6313AC32AB0C296`, all six claim headings,
    both standalone additional findings, and exactly one target status line:
    `?? specs/stories/code-review/dbo-4-office-collections-absent-empty-route-codex-findings.md`.
    Git also repeated the inaccessible global-ignore warning.

No reviewed source, story, epic, reference, deferred-work, or sprint-status file was modified. No
commit or push was performed. The only workspace change made by this review is creation of this
explicitly requested findings file.
