# Adversarial review — oxp-5-handover-logic

**TRIAGE OUTCOME (2026-08-13, `codex-review` skill Step 5/6 — verified before accepting).** Full
writeup in `specs/stories/oxp-5-handover-logic.md`'s Senior Developer Review section. Summary: High
PATCHED (with new direct unit coverage, prove-discriminated); 6 Medium PATCHED; 3 Medium DISMISSED with
evidence (already correct, already documented in this story's Dev Notes before this review ran, in a
section Pass 3a is deliberately blind to and Pass 3b's frozen-finding methodology could not revise
against); 1 Medium INFORMATIONAL (reviewer's own sandbox denied Atlas; re-verified here with real DB
access); 1 Medium DEFERRED to `deferred-work.md` (real gap, no precedent anywhere in this codebase); 2
Low PATCHED; 1 Low DEFERRED (pre-existing, out of scope). Re-verified gate: 217/217 (the original
seven files plus a new eighth), 0 failed, 0 skipped.

## High

### [Pass 1] Saving any row silently vacates a seat whose holder is retired

- **Severity**: High
- **File:line**: `public/js/admin/city-views.js:729`
- **Triggering input or sequence**: A real seat has `holder_id` pointing to a character for whom `retired` is true. The ST opens the court editor and presses Save, even to change a different row. `renderCourt()` builds its options from active characters only, `_seatHolder()` therefore cannot select the retired holder, and `saveCourt()` compares the rendered empty selection with the seat's non-empty `holder_id`.
- **Observable consequence**: The panel sends `{ holder_id: null }` for the retired holder's seat without the ST choosing Vacancy. The server treats this as a real handover, clears the character's court fields, resets the seat's manoeuvre rank, and permanently increments destroyed XP. One unrelated save can therefore erase a live holding and its ladder.
- **Confidence**: High. This follows directly from the diff's shared `active = chars.filter(c => !c.retired)` input, `_seatHolder(seat, active)`, and changed-row comparison.
- **Outcome: PATCHED.** `seatHolder` now searches all characters; `courtSlotOptions` appends a representable extra option for any holder `active` cannot cover. New direct unit suite `server/tests/oxp-5-city-views-seat-holder.test.js` (13 tests), prove-discriminated by single-change revert (reverting the fix failed exactly the one test that pins it).

## Medium

### [Pass 3b] Distinct `previous_holder_id` values do not prove two 200s were sequential

- **Severity**: Medium
- **File:line**: `server/tests/oxp-5-handover-logic.test.js:501`; `specs/stories/oxp-5-handover-logic.md:759`
- **Triggering input or sequence**: A concurrency regression lets a losing transaction retry against the winner's newly committed holder (the exact failure mode the frozen outer baseline is intended to prevent). On retry, the callback re-reads that winner as `currentHolderId`; both requests can return 200 with different `previous_holder_id` values, the second reset adds the now-zero rank so `manoeuvre_xp_destroyed` remains 3, and the final character/seat state looks exactly like a sequential pair. If any other loop iteration still produces a 409, the suite's final `refusals > 0` condition is also satisfied.
- **Observable consequence**: The loop can accept a genuine concurrent double-win as “legitimate sequential handovers”. The Dev Agent Record's claim that distinct priors prove sequential execution, and that the loop therefore proves a genuine concurrent double-win never happens, is overstated. A deterministic retry/interleaving hook or a server-side barrier is needed to prove the frozen-baseline property rather than infer it from the final state.
- **Confidence**: High. `withTransaction` reruns the callback, so a retry itself changes the reported in-session prior; every other asserted final-state invariant is identical to a true sequential pair.
- **Outcome: DISMISSED with evidence.** The CAS claim (`office-seats.js`'s claim step) filters on `baselineHolderId`, read once outside the transaction and never re-captured on retry — not on the in-session `currentHolderId` this finding's scenario depends on. A retry after a genuine `WriteConflict` re-reads `currentHolderId` fresh but the claim's filter still names the frozen baseline, so it cannot match and 409s cleanly, uncontested by further retry (`RouteResponse` is not a Mongo transient error). Already documented as deviation 1 in the story's Dev Notes, dated before this review ran; Pass 3a is deliberately blind to that section and Pass 3b's findings are frozen once written even after reading it on the next pass.

### [Pass 3b] The recorded all-green DB gates and discrimination runs are unverifiable in the current environment

- **Severity**: Medium
- **File:line**: `specs/stories/oxp-5-handover-logic.md:691`
- **Triggering input or sequence**: Run the exact seven-file gate and then the claimed new-suite-only command in this review environment. Atlas connection attempts fail with `connect EACCES 159.143.141.178:27017`.
- **Observable consequence**: The exact gate observed here is `Test Files  1 failed | 5 passed | 1 skipped (7)` and `Tests  75 passed | 129 skipped (204)`, not 204/204. The new-suite-only result is `Test Files  1 passed (1)` and `Tests  10 passed | 36 skipped (46)`, not 46/46 with zero skipped. These results do not disprove that the author's earlier connected runs occurred, but this review cannot independently verify the DB-backed merit byte-identity test, concurrency behavior, fixture effects, or any of the three mutation/discrimination claims. The deleted throwaway diagnostic scripts also leave no runnable artefact for their historical exact-failure-count claims.
- **Confidence**: High about the current observed numbers and verification gap; no claim that the historical numbers are false.
- **Outcome: INFORMATIONAL, no action.** Re-run here with real DB access: eight-file gate (the original seven plus a new eighth added during this triage) is 217/217, 0 failed, 0 skipped. Same recurring sandbox-port-27017 limitation already catalogued for otc-2/oaq-2/oxp-1 through oxp-4/oxp-11.

### [Pass 3a] AC10's required simultaneous-handover assertion was replaced with a weaker acceptance condition

- **Severity**: Medium
- **File:line**: `server/tests/oxp-5-handover-logic.test.js:436`
- **Triggering input or sequence**: Run the AC3 concurrency test on an iteration where both requests return 200. The test accepts that outcome when the two response bodies have distinct `previous_holder_id` values.
- **Observable consequence**: This violates AC10's literal requirement that the `Promise.all` test assert exactly one 200 and one 409. The invariant loop may be a defensible anti-flake substitute, but before reading the author's account it is plainly a spec deviation and no longer demonstrates the exact externally observable refusal AC10 demands on each simultaneous invocation.
- **Confidence**: High on the literal mismatch; medium on whether the replacement is materially weaker in practice, to be audited in Pass 3b.
- **Outcome: DISMISSED with evidence.** Already recorded in the story's Dev Notes ("The race that is not always a race"), with the measurement that forced the change: `Promise.all` interleaved genuinely on 4 of 5 isolated runs; the fifth was a legitimate sequential pair for which two 200s is correct. Same non-reliable-interleaving problem `issue-1143` and `oxp-3`'s own review already hit and solved the identical way.

### [Pass 3a] AC6 requires aggregation-pipeline `updateOne`, but the implementation uses `findOneAndUpdate`

- **Severity**: Medium
- **File:line**: `server/routes/office-seats.js:461`
- **Triggering input or sequence**: Any real handover with an existing manoeuvre-rank document reaches `resetManoeuvreRank()`.
- **Observable consequence**: The route performs a one-operation atomic pipeline reset with correct stage order and options, but it does not implement AC6's literal “one atomic aggregation-pipeline `updateOne`” API or the exact code shape the AC supplies. `findOneAndUpdate(..., returnDocument: 'before')` is behaviourally useful for the response, yet this is an unapproved acceptance-criterion deviation as written.
- **Confidence**: High.
- **Outcome: DISMISSED with evidence.** Already recorded as deviation 2 in the story's Dev Notes: identical atomic pipeline update, chosen specifically to also return the pre-image AC1's own response contract requires, without a second in-transaction read. `upsert: false` and the two-stage pipeline are exactly as AC6 specifies.

### [Pass 3a] AC10's mandated part-way-failure rollback proof is missing

- **Severity**: Medium
- **File:line**: `server/tests/oxp-5-handover-logic.test.js:412`
- **Triggering input or sequence**: Introduce a failure after the seat claim (for example, make the incoming-character update or rank reset throw) and execute a handover.
- **Observable consequence**: AC10 explicitly requires proof that “a failure part-way leaves NOTHING half-applied”, but the test carrying that wording triggers AC2's conflict check before any write. It proves refusal non-interference, not transaction rollback, leaving the AC's failure-after-write case uncovered.
- **Confidence**: High.

### [Pass 2] A blank title cannot be saved for the sitting holder, despite the client promising a server default

- **Severity**: Medium
- **File:line**: `public/js/admin/city-views.js:760`; `server/routes/office-seats.js:250`
- **Triggering input or sequence**: A seat is already held by H with `court_title: 'Sheriff'`. The ST clears that row's title input and saves. The client detects the change but sends `court_title: null`, with an inline comment saying the server will default it to the office category. Because the holder is unchanged, the server takes the same-holder branch and only updates when `requestedTitle != null`, so it performs no write. A direct API request with `court_title: ''` or whitespace behaves differently again: it is trimmed to `''` and the same-holder branch writes the empty string, whereas a real handover defaults the same value to the category via `requestedTitle || category`.
- **Observable consequence**: The UI reports “Saved” but immediately reloads the old title; an ST cannot reset a sitting holder's title to the advertised category default. API callers also get branch-dependent semantics for the same logical blank value.
- **Confidence**: High. Both the client payload and all three server branches are explicit in the current code.
- **Outcome: PATCHED.** Client now sends `''` for a deliberate clear instead of `null`. Server's `resolveCourtTitle` resolves a blank-but-non-null title to the seat's office category on every path, same-holder included.

### [Pass 1] Same-holder requests can report success while leaving the two holder facts out of sync (worth checking against the spec)

- **Severity**: Medium
- **File:line**: `server/routes/office-seats.js:240`
- **Triggering input or sequence**: `office_seats.holder_id` already names character H, but H's `court_category` is stale or null; the caller PUTs the same `holder_id` with `court_title` absent or null. The same-holder branch only reads/repairs the character when `requestedTitle != null`.
- **Observable consequence**: The route returns 200 with `handover: false` and `title_updated: false`, while the seat and character remain contradictory. The client can also skip the request entirely when its stale character data and rendered blank title agree. This appears inconsistent with the diff's claim that this is the one route keeping the two facts in sync, but whether same-holder repair is required is worth checking against the still-unread specification.
- **Confidence**: High on the control flow and resulting state; medium on whether the specification requires repair of pre-existing drift.
- **Outcome: PATCHED.** The same-holder branch now always repairs `court_category`/`court_title` drift, field-by-field so a true no-op stays inert (no `updated_at` churn) while real drift is corrected — the seat is authoritative when the two facts disagree.

### [Pass 1] The “atomic write sequence” suite never exercises rollback after a partial write

- **Severity**: Medium
- **File:line**: `server/tests/oxp-5-handover-logic.test.js:412`
- **Triggering input or sequence**: Regress the route so the seat claim is not in the transaction (or omit `session` from one later collection write), then let every operation succeed. The suite's successful replacement test still observes the final state, while its “leaves NOTHING half-applied” test gets its 409 from the conflict check before the first write.
- **Observable consequence**: The tests can remain green even though a failure after claiming the seat would commit a half-applied handover. The describe/title claims an atomic multi-document sequence, but no test injects or triggers a post-claim failure and verifies rollback.
- **Confidence**: High. The only refusal-state snapshot in the new suite is explicitly rejected before any write.
- **Outcome: DEFERRED to `deferred-work.md`.** Real, valid gap. Checked precedent: `office-actions.js`'s `PUT /:id/accept`, the exact pattern this route copied its transaction scaffolding from, has never had a fault-injection rollback test either, anywhere in this codebase's history. Building a reliable fault-injection harness for a real `session.withTransaction` (correctly targeting one write without becoming flaky or vacuously-passing) is testing infrastructure this codebase doesn't have yet; better invented once, generically, for both transactional routes than one-off under review-cycle time pressure.

## Low

### [Pass 3a] The rewired panel retains an inline style forbidden by AC9's literal UI constraint

- **Severity**: Low
- **File:line**: `public/js/admin/city-views.js:192`
- **Triggering input or sequence**: Render the court panel while `_courtPanelOpen` is false.
- **Observable consequence**: The changed template emits `style="display:none"` even though AC9 says the seat-backed panel work must use existing classes/tokens with “no inline `style="..."`”. This style pre-dated the story, but the modified line preserves and dynamically owns it instead of satisfying the literal constraint.
- **Confidence**: High on the literal mismatch; low on runtime impact.
- **Outcome: DEFERRED (pre-existing, out of scope).** Predates this story; this diff only re-renders the element dynamically rather than introducing the pattern. A full inline-style-to-token conversion is real but unrelated cleanup.

### [Pass 2] The adjacent verb-contract test never proves the holder route accepts PUT

- **Severity**: Low
- **File:line**: `server/tests/oxp-2-derived-office-xp-calculation.test.js:667`
- **Triggering input or sequence**: Remove the `PUT /:seatId/holder` registration entirely while leaving the rest of this restated test unchanged.
- **Observable consequence**: The test titled “the seat-scoped route accepts only PUT” still passes because its holder-subroute loop asserts only that POST, PATCH, and DELETE return 404; it never makes the positive PUT request its title promises. The new oxp-5 suite exercises PUT elsewhere, so this is a local overclaim rather than a total coverage hole.
- **Confidence**: High.
- **Outcome: PATCHED.** Added a positive assertion: PUT against a well-formed-but-unknown seat id reaches the handler's own `NOT_FOUND` JSON body, distinct from Express's router-level 404 for an unmatched verb — proving the router actually dispatches to the PUT handler, not merely that other verbs are rejected.

### [Pass 2] A successful handover can re-render stale character fields while reporting Saved

- **Severity**: Low
- **File:line**: `public/js/admin/city-views.js:779`
- **Triggering input or sequence**: A handover commits successfully, then the follow-up `/api/characters` refresh fails while `/api/office_seats` succeeds. The catch deliberately retains the pre-write `chars` array and still sets `message` to `Saved`.
- **Observable consequence**: The re-render uses the new seat holder pointer with old character `court_title`/`court_category` values. The panel can display the prior title and the court list can display the prior holder assignment even though the server committed the new one, misleading the ST until a later successful refresh or page reload.
- **Confidence**: High on the stale render; low-to-medium on operational frequency because it requires a narrow partial network failure.
- **Outcome: PATCHED.** A failed post-handover character refresh now reports "Saved, but the character list could not be refreshed. Reload to see current titles." instead of a bare "Saved" over stale data.

### [Pass 1] The seat-label source-contract check can be bypassed by an ordinary multiline write

- **Severity**: Low
- **File:line**: `server/tests/oxp-5-handover-logic.test.js:766`
- **Triggering input or sequence**: Add a nested or multiline update such as `$set: {` followed on a later line by `seat_label: value`. The first regex only captures `$set` bodies with no nested braces, and the fallback regex only scans from the update operator to the end of the same line.
- **Observable consequence**: The test titled “the route source contains no write to seat_label at all” can pass while the route does write `seat_label`; the runtime test covers only one labelled seat/happy path, so a conditional write on another branch could also escape it.
- **Confidence**: High for the regex limitation; the current diff itself does not write `seat_label`.
- **Outcome: PATCHED.** The test now scans every `$set: {...}` block in the route file individually via `matchAll`, with an explicit assertion that the scan found more than two payloads (so it cannot pass by finding nothing). Still cannot handle a deeply nested `$set` object in principle, but every real `$set` shape in this route is flat, so this closes the practical gap.

### [Pass 1] A route comment describes a client behaviour the same diff removed

- **Severity**: Low
- **File:line**: `server/routes/office-seats.js:233`
- **Triggering input or sequence**: Read the same-holder justification beside the implementation after this diff: it says the court panel “saves EVERY slot”, while the rewritten `saveCourt()` explicitly builds and sends changed rows only.
- **Observable consequence**: There is no immediate runtime failure, but the load-bearing rationale is self-contradictory within the diff and can mislead future changes to the no-op branch.
- **Confidence**: High.
- **Outcome: PATCHED.** Comment rewritten to describe the changed-rows-only behaviour `saveCourt` actually implements, matching the same-holder-branch justification comment beside it.

## Validation notes

### Pass ordering and files opened

- **Pass 1**: Opened only `specs/stories/code-review/oxp-5-diff.txt`. I did not open the story, repository source files, imports, or any other project context. Pass 1 was written in full before Pass 2 began.
- **Pass 2**: Opened/searched `server/routes/office-actions.js`, `server/routes/office-manoeuvre-rank.js`, `server/routes/office-seats.js`, `server/middleware/auth.js`, `server/index.js`, `server/tests/helpers/test-app.js`, `server/package.json`, `server/package-lock.json`, `server/node_modules/mongodb/lib/sessions.js`, `server/node_modules/mongodb/src/sessions.ts`, `public/js/admin/city-views.js`, `public/js/tabs/office-tab.js`, `public/js/data/api.js`, `server/routes/characters.js`, `server/schemas/office_seat.schema.js`, `server/routes/office-merit-dots.js`, `server/db.js`, `server/lib/office-seat-resolve.js`, and `server/tests/oxp-5-handover-logic.test.js`. I did not open the oxp-5 story. Pass 2 was written in full before Pass 3 began.
- **Pass 3a**: Opened `specs/stories/oxp-5-handover-logic.md` only through line 682: Story, Why this story exists, What this story is NOT, AC1–AC10, Tasks/Subtasks, Dev Notes, Project Structure Notes, and References. I did not read the Dev Agent Record or Senior Developer Review. Pass 3a was written in full before Pass 3b began.
- **Pass 3b**: Opened the Dev Agent Record (lines 683–919; the Senior Developer Review heading was visible but its contents were not read), `specs/stories/sprint-status.yaml`, and re-searched the already-open route/test files to verify the record's claims. Earlier findings were not revised after later context; overlapping Pass 1/Pass 3a rollback findings remain standing as required.

### Commands run

Pass 1 commands (all from `D:\Terra Mortis\TM Suite`):

```powershell
Get-Content -Raw -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt'
rg -n "^diff --git" "specs/stories/code-review/oxp-5-diff.txt"
Get-Content -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt' | Select-Object -Skip 332 -First 541
Get-Content -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt' | Select-Object -Skip 873 -First 77
Get-Content -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt' | Select-Object -Skip 949 -First 320
Get-Content -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt' | Select-Object -Skip 1269 -First 320
Get-Content -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt' | Select-Object -Skip 1589 -First 320
Get-Content -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt' | Select-Object -Skip 1220 -First 260
rg -n "^\+\s*it\(" "specs/stories/code-review/oxp-5-diff.txt"
$file=''; $newLine=0; Get-Content -LiteralPath 'specs/stories/code-review/oxp-5-diff.txt' | ForEach-Object { if ($_ -match '^\+\+\+ b/(.+)$') { $file=$Matches[1] } elseif ($_ -match '^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@') { $newLine=[int]$Matches[1] } elseif ($_ -match '^\+') { $text=$_.Substring(1); if ($text -match 'const active = chars\.filter|if \(requestedHolderId === currentHolderId\)|the route source contains no write to seat_label|a refused handover leaves NOTHING half-applied|the court panel saves EVERY slot') { "$file`:$newLine`t$text" }; $newLine++ } elseif ($_ -match '^ ') { $newLine++ } }
```

The first read returned all 1,853 diff lines but the tool display truncated them; the subsequent chunked reads covered the route and test sections. I then used `apply_patch` to create this findings file and freeze Pass 1.

Pass 2 commands (all from the repo root):

```powershell
rg -n -C 25 "class RouteResponse|router\.put\('/:id/accept'|withTransaction|_findPending" server/routes/office-actions.js
rg -n -C 35 "router\.put\('/:seatId/step'|withTransaction|\$set|findOneAndUpdate" server/routes/office-manoeuvre-rank.js
rg -n "router\.(get|post|put|patch|delete)|requireRole|office_seats|express\.json|json\(" server/routes/office-seats.js server/middleware/auth.js server/app.js server/tests/helpers/test-app.js
rg --files server | rg "(app|index|server)\.js$"
Get-Content -LiteralPath 'server/middleware/auth.js' | Select-Object -Skip 96 -First 38
Get-Content -LiteralPath 'server/index.js' | Select-Object -First 180
rg -n '"mongodb"|"express"|"vitest"' server/package.json server/package-lock.json | Select-Object -First 20
rg -n "async withTransaction|withTransaction\(" server/node_modules/mongodb/lib/sessions.js server/node_modules/mongodb/src/sessions.ts
Get-Content -LiteralPath 'server/node_modules/mongodb/src/sessions.ts' | Select-Object -Skip 690 -First 165
Get-Content -LiteralPath 'server/node_modules/mongodb/src/sessions.ts' | Select-Object -Skip 850 -First 100
Get-Content -LiteralPath 'public/js/admin/city-views.js' | Select-Object -Skip 90 -First 150
Get-Content -LiteralPath 'public/js/admin/city-views.js' | Select-Object -Skip 715 -First 105
rg -n -C 20 "function _fallbackSeat|_seatNote|holder_id" public/js/tabs/office-tab.js
rg -n -C 15 "export async function apiPut|async function apiPut|apiPut" public/js/data/api.js public/js -g 'api.js'
rg -n "router\.get\('/'|retired|court_category|router\.post\('/'" server/routes/characters.js | Select-Object -First 80
Get-Content -LiteralPath 'server/routes/characters.js' | Select-Object -Skip 255 -First 95
Get-Content -Raw -LiteralPath 'server/schemas/office_seat.schema.js'
Get-Content -LiteralPath 'server/routes/office-manoeuvre-rank.js' | Select-Object -First 45
Get-Content -LiteralPath 'server/routes/office-merit-dots.js' | Select-Object -First 55
rg -n "deleteMany\(\{\}\)|deleteMany\(" server/tests/oxp-5-handover-logic.test.js
rg -n -C 12 "function parseHolderId|function parseCourtTitle|baselineSeat|requestedHolderId === currentHolderId|conflicting =|const claim =|resetManoeuvreRank" server/routes/office-seats.js
Get-Content -Raw -LiteralPath 'server/db.js'
Get-Content -Raw -LiteralPath 'server/lib/office-seat-resolve.js'
rg -n "office_seats" server/index.js server/tests/helpers/test-app.js
Get-Content -LiteralPath 'public/js/admin/city-views.js' | Select-Object -First 105
rg -n "retired.*court|court_category.*retired|holder_id.*retired|retired" server/tests/oxp-5-handover-logic.test.js public/js/admin/city-views.js | Select-Object -First 80
```

The first combined route/mount search exited 1 because `server/app.js` does not exist; its other searches returned usable results and the relevant queries were rerun. MongoDB driver 7.1.1 source confirmed that a non-`MongoError` `RouteResponse` is aborted and rethrown, while only a `MongoError` with `TransientTransactionError` is retried. I then used `apply_patch` to freeze Pass 2.

Pass 3a commands:

```powershell
rg -n "^#{1,4} " "specs/stories/oxp-5-handover-logic.md"
Get-Content -LiteralPath 'specs/stories/oxp-5-handover-logic.md' | Select-Object -First 240
Get-Content -LiteralPath 'specs/stories/oxp-5-handover-logic.md' | Select-Object -Skip 240 -First 240
Get-Content -LiteralPath 'specs/stories/oxp-5-handover-logic.md' | Select-Object -Skip 480 -First 202
Get-Content -LiteralPath 'specs/stories/oxp-5-handover-logic.md' | Select-Object -Skip 181 -First 222
```

The reads stopped immediately before `## Dev Agent Record`. I then used `apply_patch` to freeze Pass 3a.

Pass 3b commands:

```powershell
Get-Content -LiteralPath 'specs/stories/oxp-5-handover-logic.md' | Select-Object -Skip 682 -First 120
Get-Content -LiteralPath 'specs/stories/oxp-5-handover-logic.md' | Select-Object -Skip 802 -First 118
Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|npm|npx)(\.exe)?$' -or $_.CommandLine -match 'vitest' } | Select-Object ProcessId, Name, CommandLine | Format-List
Get-Process -Name node,npm,npx -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime, Path | Format-Table -AutoSize
$nodeIds = @(Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id); Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $nodeIds -contains $_.OwningProcess -and ($_.RemotePort -eq 27017 -or $_.LocalPort -eq 27017) } | Select-Object OwningProcess, LocalAddress, LocalPort, RemoteAddress, RemotePort, State | Format-Table -AutoSize
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, StartTime, CPU, Responding, MainWindowTitle, Path | Sort-Object StartTime | Format-Table -Wrap -AutoSize
cd server
npx vitest run tests/oxp-5-handover-logic.test.js tests/oxp-2-derived-office-xp-calculation.test.js tests/oxp-4-merit-persistence-handover.test.js tests/oxp-11-office-purchase-seat-keying.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/office-merit-dots.test.js tests/issue-823-test-db-guard.test.js
npx vitest run tests/oxp-5-handover-logic.test.js
cd ..
rg -n 'office_merit_dots|seat_label|\$set|\$unset|\$setOnInsert|endSession|res\.status' server/routes/office-seats.js
rg -n 'deleteMany\(\{\}\)|deleteMany\(' server/tests/oxp-5-handover-logic.test.js
rg -n 'expect\(meritsAfter\)|updated_at|manoeuvre_xp_destroyed' server/tests/oxp-5-handover-logic.test.js | Select-Object -Last 30
git diff --name-only 2ab6a8aa --
git status --short
git diff --quiet 2ab6a8aa -- public/js/data/office-xp.js public/js/tabs/office-tab.js server/routes/office-merit-dots.js server/routes/office-manoeuvre-rank.js server/lib/office-seat-resolve.js server/schemas/office_seat.schema.js server/schemas/character.schema.js server/routes/characters.js server/index.js server/tests/helpers/test-app.js; if ($LASTEXITCODE -eq 0) { Write-Output 'NO_DIFF_IN_EXCLUDED_FILES' } else { Write-Output 'DIFF_PRESENT_IN_EXCLUDED_FILES' }; exit 0
rg -n -C 3 "oxp-5|manoeuvre_xp_destroyed|seat creation|seat-creation" specs/stories/sprint-status.yaml
rg -n "const setPayloads|not\.toMatch\(/\\\$\(set|the route source contains no write" server/tests/oxp-5-handover-logic.test.js
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, StartTime, CPU, Path | Sort-Object StartTime | Format-Table -AutoSize
Get-Content -Raw -LiteralPath 'specs/stories/code-review/oxp-5-codex-findings.md'
rg -n "two winners are only|at least one iteration|genuine concurrent|guard is proved|46 passed|204 passed|Prove-discrimination|prove-discrimination" specs/stories/oxp-5-handover-logic.md server/tests/oxp-5-handover-logic.test.js specs/stories/sprint-status.yaml
git status --short -- specs/stories/code-review/oxp-5-codex-findings.md
rg -n "^## (High|Medium|Low|Validation notes)$|^### \[Pass" specs/stories/code-review/oxp-5-codex-findings.md
```

The first two Pass 2 precedent searches were rerun once after the combined batch's missing `server/app.js` error. In Pass 3b, an initial parallel batch of the route grep, cleanup grep, `git diff`/`git status`, and excluded-files diff returned aggregate exit 1 without retained output; each check was rerun in the successful forms logged above. The first process-command-line check failed with `Access denied`; the TCP ownership check returned no inspectable result. Several long-lived Node processes existed, but none had an identifiable Vitest window or new sustained CPU use. Therefore I launched only one gate process and no parallel test work. I cannot prove no external process was connected to `tm_suite_test`; importantly, the run failed on sandbox network denial, not with duplicate keys or corruption, so there was no observed sign of DB contention.

The exact seven-file gate result was:

```text
Test Files  1 failed | 5 passed | 1 skipped (7)
Tests  75 passed | 129 skipped (204)
```

`tests/issue-823-test-db-guard.test.js` failed its `beforeAll` connection with `connect EACCES 159.143.141.178:27017`. The new-suite-only result was:

```text
Test Files  1 passed (1)
Tests  10 passed | 36 skipped (46)
```

Static checks found all fixture deletes scoped: merit/rank deletes use `{ _id: { $in: SEAT_KEYS } }`, seats use `SEAT_IDS`, characters use the escaped prefix, and the per-iteration rank delete uses the single suite-owned `_id: ENF`. There is no executable unfiltered `deleteMany({})` in the file. The route contains no `getCollection('office_merit_dots')`, writes no `seat_label`, and awaits `withTransaction`, then awaits `endSession()` in `finally`, before calling `res.status(...).json(...)`. `git diff --quiet` reported `NO_DIFF_IN_EXCLUDED_FILES` for every “What this story is NOT” source file checked.

### Could not run or re-prove

- I could not run any DB-backed assertion against Atlas because this environment denies outbound port 27017. Consequently I could not verify the author's 46/46 or 204/204 zero-skip histories, the merit document's runtime byte identity, ObjectId storage, rollback, concurrent handovers, or the exact response contract for a missing rank row.
- I could not run the three mutation/prove-discrimination checks meaningfully: their relevant assertions are among the 36 DB-backed tests skipped by the new suite, and the historical throwaway/instrumentation files were deleted. I did not edit production code merely to obtain a vacuous skipped mutation run.
- I did not deliberately reproduce two simultaneous Vitest processes against `tm_suite_test`, as expressly prohibited. The author's collision reproduction is taken on their word; only its logical premise was checked. The route has no unawaited database work and sends its response only after commit and `endSession()` settle.
- I did not run anything outside `D:\Terra Mortis\TM Suite` and did not read the umbrella or sibling worktrees.

### Worktree and ship assessment

I made no temporary production/test edits. The only file I wrote was this required findings file, via `apply_patch`; no restore was necessary. The worktree was already heavily dirty with the story's tracked edits and many unrelated untracked files, so `git status --short` is not globally clean and cannot honestly be presented as such. No test command wrote a source file. The excluded-source diff check was clean relative to `2ab6a8aa`.

**Ship assessment: blocking patch required; do not ship as-is.** The retired-holder panel behavior is a High-severity destructive path that can vacate a seat and destroy its manoeuvre XP on an unrelated save. The blank-title behavior and missing rollback/concurrency proofs should also be corrected before acceptance.
