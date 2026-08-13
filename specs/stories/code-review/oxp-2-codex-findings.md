# Adversarial review findings — oxp-2

## High

- None found.

## Medium

### [Pass 1] The ISO-date parser accepts malformed prefixes as authoritative dates

- **Severity**: Medium
- **File:line**: `public/js/data/office-xp.js:69`
- **Triggering input or sequence**: Call `officeMonthsAccrued` (directly or through `officeXpEarned`/`officeSeatXp`) with a string such as `2026-02garbage`, `2026-02-99`, `2026-02-21junk`, or `2026-02Tnot-a-date` for either positional date argument. The regex `/^(\d{4})-(0[1-9]|1[0-2])/` accepts the valid-looking prefix and ignores the rest. A bare `2026-02` also matches, but is internally safe because all downstream arithmetic uses only the extracted year and month.
- **Observable consequence**: Inputs the JSDoc says will throw instead produce a plausible calendar-month accrual. A malformed `created_at` can therefore become an authoritative-looking earned/left balance rather than a visible data error.
- **Confidence**: High; this follows directly from the unanchored regex and the subsequent year/month-only arithmetic.

### [Pass 2] Omitting the evaluated seat from `allSeats` can falsely mark shared spend as known

- **Severity**: Medium
- **File:line**: `public/js/data/office-xp.js:249`
- **Triggering input or sequence**: Evaluate one Socialite seat while passing an `allSeats` array containing only its Socialite sibling (for example, a stale/filtered array that omitted the evaluated seat). The live category has two seats, but the recount sees exactly one. The actual probe changed `{ earned: 7, spent: 2, left: 5, spendKnown: false }` with both seats present to the same numbers with `spendKnown: true` when the target was omitted.
- **Observable consequence**: A future oxp.6/oxp.7 consumer can display category-level spend and balance as authoritative for one seat, precisely the false-trust state the flag exists to prevent. The JSDoc says `allSeats` must contain every seat, but the helper neither verifies that its separately supplied `seat` is present nor fails safely when it is not.
- **Confidence**: High; reproduced against the real module and the real two-seat Socialite shape.

### [Pass 2] The player-readable route exposes a field explicitly intended for ST caveats

- **Severity**: Medium
- **File:line**: `server/routes/office-seats.js:28` (field contract at `server/schemas/office_seat.schema.js:119`)
- **Triggering input or sequence**: An ST or manual writer places provenance, a caveat, or other free text in `office_seats.notes`, then any authenticated player calls `GET /api/office_seats`. The route spreads the complete document into the response, and the new suite explicitly requires player access.
- **Observable consequence**: Text the schema expressly describes as “Provenance notes, ST caveats, anything that would otherwise be lost” is disclosed to players. The initial seed uses `notes: null`, so there is no seeded secret today, but the seed deliberately preserves later ST-edited notes and the route makes any such future content public by default.
- **Confidence**: High on the exposure path and field intent; medium on current impact because the seeded values are null and there is no application writer yet.

### [Pass 3a] The combined helper relies on a precondition instead of enforcing the story’s fail-safe intent

- **Severity**: Medium
- **File:line**: `public/js/data/office-xp.js:249`
- **Triggering input or sequence**: A consumer supplies an incomplete `allSeats` array that excludes the evaluated member of a real two-seat category but still includes its sibling. The JSDoc calls for every seat, yet the function accepts the separate `seat` and array without checking their consistency and derives `spendKnown: true`.
- **Observable consequence**: Although AC4 is arithmetically correct for the set it is handed, the combined API violates the story’s load-bearing intent that no caller can mistake a shared ambiguous total for a per-seat figure. The safe failure for a missing target would be `spendKnown: false` or an exception, not authoritative `true`.
- **Confidence**: High; this is the Pass 2 reproduction assessed against the Story/AC4/AC5/Dev Notes wording.

## Low

### [Pass 1] A malformed raw merit document can be mistaken for a merit-dot map

- **Severity**: Low
- **File:line**: `public/js/data/office-xp.js:157`
- **Triggering input or sequence**: `undefined` and `null` correctly produce zero; the API map `{ 'Safe Place': 2, Haven: 1 }` correctly totals 3; and `{ _id: 'Enforcer', dots: { 'Safe Place': 2 }, updated_at: '...' }` correctly totals 2. However, a raw-looking document with missing/null `dots`, such as `{ _id: 'Enforcer', updated_at: '...', schemaVersion: 2 }`, falls back to treating the entire document as the dots map. String metadata is neutralised by the finite-number guard, but any numeric metadata is silently added to spend.
- **Observable consequence**: If such a malformed or legacy raw document can reach the helper, numeric metadata inflates `spent` and reduces `left`. Whether the actual write route can produce this shape remains deliberately unresolved until Pass 2.
- **Confidence**: Medium on the behaviour, low on practical reachability before repository context is permitted.

### [Pass 2] Raw-document fallback remains unsafe for malformed/legacy records, though normal writes cannot create them

- **Severity**: Low
- **File:line**: `public/js/data/office-xp.js:157`
- **Triggering input or sequence**: The real `PUT /api/office_merit_dots/:category` always uses `$set: { 'dots.<merit>': n, updated_at: ... }`, so a normal upsert creates a `dots` object and cannot generate the missing-`dots` shape. A directly read malformed/legacy document such as `{ _id: 'Enforcer', updated_at: 'x', schemaVersion: 2 }` nevertheless returns spend 2 because the helper treats the whole document as the dot map.
- **Observable consequence**: Ordinary route-written records and the actual GET response are safe, but the advertised raw-Mongo compatibility can silently turn numeric metadata in a drifted document into spent XP. This is a robustness gap rather than a currently reachable normal-write bug.
- **Confidence**: High; hand-traced against the full write route and reproduced against the module.

### [Pass 3a] The DB-backed test does not prove AC7’s exact-response requirement

- **Severity**: Low
- **File:line**: `server/tests/oxp-2-derived-office-xp-calculation.test.js:457`
- **Triggering input or sequence**: Introduce a route regression that preserves each document’s keys and category/holder pair but changes, drops the value of, or swaps `created_at`, `seat_label`, or `notes` on any seat other than the one Carver spot-check. The main “field for field” test checks the seven category/holder pairs, the key set, and only Carver’s date/label; it never deep-compares all returned documents with all inserted documents.
- **Observable consequence**: The suite can remain green while `GET /api/office_seats` violates AC6/AC7’s “full array ... exactly as stored” contract for fields feeding accrual or carrying seat metadata.
- **Confidence**: High on the coverage gap; low-to-medium severity because the current spread implementation is correct and the issue is inadequate discrimination rather than a present bad response.

### [Pass 3b] The Dev Agent Record overstates the route test as field-for-field proof

- **Severity**: Low
- **File:line**: `specs/stories/oxp-2-derived-office-xp-calculation.md:391` (test at `server/tests/oxp-2-derived-office-xp-calculation.test.js:457`)
- **Triggering input or sequence**: Compare the record’s claim that the returned array “matches the seven seeded seats field for field” with the assertions actually executed. They verify category/holder pairs, the key set, and two Carver values, not every stored value for every fixture.
- **Observable consequence**: Reviewers are told AC7 has stronger mutation discrimination than it does; regressions to most `created_at`, `seat_label`, or `notes` values can escape the claimed proof.
- **Confidence**: High; this is a direct assertion-by-assertion comparison.

### [Pass 3b] DB-dependent pass totals and exact mutation counts are not reproducible in the current environment

- **Severity**: Low
- **File:line**: `specs/stories/oxp-2-derived-office-xp-calculation.md:296`, `:299`, `:302`, `:340`, `:342`
- **Triggering input or sequence**: Run the exact gate and the record’s targeted/regression commands while Mongo reachability fails with `connect EACCES 159.143.141.178:27017`. The required four-suite gate produced 55 passed, 1 failed, 50 skipped. The targeted baseline produced 34 passed and 9 skipped, not an observable 43/43. Removing `+1` produced 14 failed/20 passed/9 skipped rather than an observable 16/27; forcing `spendKnown = true` produced 3 failed/31 passed/9 skipped rather than 4/39. The missing differences are consistent with assertions in the skipped DB block, but they did not run.
- **Observable consequence**: The historical 43/43, 181/182, 96/96, 16-failure, and 4-failure claims cannot be independently attested today. They are not disproved—the totals line up with the skipped cases—but must be labelled unverifiable-as-stated in this review. The historical assertion that live `tm_suite` was never connected to or written is likewise not independently provable from a later checkout; current vitest runs were forced to `tm_suite_test` and failed before connecting.
- **Confidence**: High on the current results and test-DB guards; appropriately limited on historical events.

### [Pass 1] Reversed accrual arguments fail closed to a plausible zero instead of failing loudly

- **Severity**: Low
- **File:line**: `public/js/data/office-xp.js:106`
- **Triggering input or sequence**: A future positional caller accidentally invokes `officeMonthsAccrued(now, createdAt)`, for example `officeMonthsAccrued('2026-08-13', '2026-02-21')`.
- **Observable consequence**: `Math.max(0, months)` converts the negative result to `0`, making the transposition look like a valid not-yet-created office. There is no argument-order defence; same-month transpositions are even less detectable because they still return 1.
- **Confidence**: High on behaviour; medium on likelihood because no consumer exists in this diff.

### [Pass 1] Per-seat aggregation invites repeated category recounting

- **Severity**: Low
- **File:line**: `public/js/data/office-xp.js:249`
- **Triggering input or sequence**: The obvious future consumer maps over every seat and calls `officeSeatXp` once for each. Every call rebuilds the complete category-count map through `officeSpendKnownByCategory(allSeats)`.
- **Observable consequence**: Rendering all seats is O(n²) rather than O(n). With the claimed seven seats this is immaterial, but the consumer-facing API should at least note the repeated-work pattern or let the consumer precompute the map.
- **Confidence**: High on complexity, low on present impact.

### [Pass 1] The authenticated read route may disclose storyteller free text to players

- **Severity**: Low
- **File:line**: `server/routes/office-seats.js:28`
- **Triggering input or sequence**: Any authenticated player requests `GET /api/office_seats`; the spread operator returns every stored field, including `notes`, without an ST role gate.
- **Observable consequence**: If `notes` can contain private Storyteller context, it is exposed to players. The diff establishes only that sibling numeric routes have open reads; it does not establish that this free-text field is player-safe. Repository evidence is required in Pass 2 before treating this as a confirmed exposure.
- **Confidence**: High that the route returns the field to players; low on sensitivity until surrounding documentation and usage are checked.

## Ship assessment

Needs patches before shipping; no High/blocking defect was found. At minimum, anchor/validate the date input contract and make `officeSeatXp` fail safely when `seat` is absent from `allSeats`. The `notes` exposure also needs an explicit product decision because the current AC6 deliberately requires both a full-document response and player-readable access. Strengthen AC7’s route comparison while touching the suite.

## Validation notes

### Pass boundaries and files opened

- **Pass 1**: Opened only `specs/stories/code-review/oxp-2-diff.txt`, in two reads because the first output was truncated. Wrote Pass 1 in full before opening repository context. I did not open the story or any surrounding source in this pass.
- **Pass 2**: Opened `server/routes/office-merit-dots.js`, `server/routes/office-manoeuvre-rank.js`, `server/schemas/office_seat.schema.js`, `server/tests/helpers/db-setup.js`, root `package.json`, `server/package.json`, `server/tests/helpers/setup-env.js`, `server/index.js`, `server/scripts/seed-office-seats.mjs` (read only; never executed), `server/db.js`, and `server/vitest.config.js`. I executed the real `public/js/data/office-xp.js` through Node. A broad `rg` under `server/` searched usages of `notes`/`office_seats` and timed out; it did not search or open the oxp-2 story. The referenced umbrella-root `content/rules/office-powers.md` does not exist inside this repo, and I did not leave `D:\Terra Mortis\TM Suite` to look for it. Pass 2 was written before the story was opened.
- **Pass 3a**: Streamed `specs/stories/oxp-2-derived-office-xp-calculation.md` only from its beginning through Story, Acceptance Criteria, Tasks/Subtasks, Dev Notes, Project Structure Notes, and References, stopping before `## Dev Agent Record`. Wrote Pass 3a before advancing.
- **Pass 3b**: Streamed only `## Dev Agent Record` through its end, stopping before any `## Senior Developer Review`; no Senior Developer Review section was read. Then ran the author-claim checks.

### Commands and real results

1. `Get-Content -Raw specs/stories/code-review/oxp-2-diff.txt` — succeeded, but tool output truncated (820 displayed lines / 926 total); no other file was read.
2. `Get-Content ...; $lines[250..619]` on the same diff — succeeded and supplied the omitted test/module portion.
3. Parallel full reads of the two purchase routes, seat schema, and DB setup helper — all succeeded.
4. Parallel full reads of root/server package files, setup-env, and `server/index.js` — all succeeded. Confirmed Express 5.2.1 (async rejection forwarding), no route-shadowing wildcard, and the vitest DB override.
5. Attempted parallel reads of the seed, DB module, vitest config, and repo-relative `content/rules/office-powers.md` — the batch reported failure because the last path does not exist in this repo; the first three were then re-read successfully in a separate command.
6. `rg --files | rg 'office-powers...'` — exit 1/no match. No umbrella/sibling path was accessed.
7. Inline `node --input-type=module` probe of the real XP module — succeeded: every malformed date prefix and bare `2026-02` returned 7; exact API/raw shapes returned 5/4; missing raw `dots` plus numeric metadata returned 2; omitting the target seat flipped `spendKnown` false → true.
8. Created temporary `server/tests/tmp-oxp2-nonexistent-collection.test.js`, then ran `npx vitest run tests/tmp-oxp2-nonexistent-collection.test.js` — 1 test skipped because DB connectivity was unavailable; therefore the nonexistent-collection path was not empirically proved. The temporary file was deleted immediately.
9. `rg -n "notes|office_seats" server ...` — timed out (exit 124) after producing many matches. It confirmed the relevant office-seat tests/usages but was broader/noisier than intended; no mutation resulted.
10. One compound `rg` for source line locations — exit 1/no match due quoting/pattern mismatch. A subsequent set of per-file `rg -n` calls succeeded and established the cited lines and DB guards.
11. Streamed the pre-record story portion — succeeded and stopped at the required boundary.
12. Streamed the Dev Agent Record only — succeeded and stopped before Senior Developer Review.
13. Required gate: `npx vitest run tests/oxp-2-derived-office-xp-calculation.test.js tests/office-merit-dots.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js` — **4 files: 3 passed, 1 failed; 106 tests: 55 passed, 1 failed, 50 skipped**. The one assertion failure was the known pre-existing oxp-4 source-slice failure. Mongo failed with `EACCES`; all 50 DB-backed tests skipped.
14. Baseline worktree/hash check — relevant source file SHA-256 was `8F5971F8C18450FAD77EC085BCBA6CC8F14489691D9CA6B2D2C816C1232EAB62`; `git diff --check` reported no content error. The unrestricted status listing was extremely noisy with pre-existing untracked workspace files; no such file was touched.
15. Mutation 1: removed the inclusive `+1`, ran the targeted oxp-2 suite — **14 failed, 20 passed, 9 skipped** (43 total), with Mongo `EACCES`. Restored the line; SHA-256 returned exactly to the baseline value and `git diff --check -- public/js/data/office-xp.js` passed (line-ending warning only).
16. Mutation 2: replaced the computed flag with `const spendKnown = true`, ran the targeted suite — **3 failed, 31 passed, 9 skipped** (43 total), with Mongo `EACCES`. Restored the line; SHA-256 again returned exactly to baseline.
17. `rg --files tests | rg ...` for the author-listed regression suites — succeeded and identified the nine office-domain and five shared-helper files.
18. Nine-file office-domain regression — **9 files: 6 passed, 2 failed, 1 skipped; 182 tests: 110 passed, 1 failed, 71 skipped**, plus a suite-level setup/cleanup failure in `otc-2-office-actions-api` from Mongo `EACCES`. The single assertion failure was the documented pre-existing oxp-4 failure.
19. Five shared-helper suites — **5 files: 4 failed, 1 skipped; 96 tests skipped**. Four suite-level setup failures were Mongo `EACCES`; 96/96 could not be reproduced.
20. `npx vitest run tests/issue-823-test-db-guard.test.js` — **1 failed suite, 7 skipped tests**, because setup hit Mongo `EACCES`; the historical 7/7 result could not be reproduced.
21. Restored targeted baseline: `npx vitest run tests/oxp-2-derived-office-xp-calculation.test.js` — **1 file passed; 34 passed, 9 skipped (43 total)**. This proves every pure test passed after restoration but is not 43 executed passes.
22. `rg -n` over the Dev Agent Record for claimed totals/lines — succeeded and produced the cited story line numbers.
23. Direct Node execution of the two real Socialite dates — succeeded and printed **7** and **2**.
24. Final source-line `rg` — succeeded (`yearMonthOf` regex line 69, clamp line 106, dot fallback line 157, `spendKnown` line 249).
25. `Get-Content -Tail 100` on this findings file — succeeded; used only to append the final frozen Pass 3b/validation material.
26. Final scoped restoration check: `git diff --check` on the reviewed source, temporary test path, and findings file exited 0 (only the existing LF→CRLF advisory); the source SHA-256 remained `8F5971F8C18450FAD77EC085BCBA6CC8F14489691D9CA6B2D2C816C1232EAB62`; `Test-Path` confirmed the temporary test is absent; scoped `git status --short` showed only `?? specs/stories/code-review/oxp-2-codex-findings.md`.

### What could not be run or proved

- Mongo-backed assertions did not run because every connection attempt failed with the warned-about transient `EACCES` to `159.143.141.178:27017`. Some suites skipped cleanly; older suites failed setup/cleanup. None is reported as passed.
- The temporary nonexistent-collection probe skipped, so that Mongo-driver behavior was not empirically verified here. By driver semantics `find({}).toArray()` on a nonexistent collection should return `[]`, but this review does not claim an observed pass.
- The 30-day-bucket and unconditional-`holder_id` mutations were not run; the instructions required at least two of four, and the two pure-relevant mutations above were run. The unconditional-holder assertion was DB-backed and unavailable.
- Historical facts—especially whether the author’s earlier session ever connected to/wrote live `tm_suite`—cannot be proved from this later session. Current test configuration was independently verified to set `MONGODB_DB=tm_suite_test`, `db.js` refuses any non-`*_test` name under vitest, and `setupDb` rechecks the connected DB name. No connection succeeded in this review.

### Restoration and attestation

- The temporary test file was removed. Both source mutations were restored byte-for-byte: the final `public/js/data/office-xp.js` SHA-256 matches the pre-mutation hash. The only relevant status entry is the requested output file; the worktree already contained a very large set of unrelated untracked files, all preserved and untouched.
- **Attestation**: I performed the passes in the required order, wrote and froze each pass before reading material allowed only in the next, did not read ahead into the Dev Agent Record or Senior Developer Review, never left `D:\Terra Mortis\TM Suite`, never opened the root `.env`, never executed anything under `server/scripts/`, and made no persistent source/tooling change. Vitest attempted only the project-configured `tm_suite_test` path and never established a Mongo connection.
