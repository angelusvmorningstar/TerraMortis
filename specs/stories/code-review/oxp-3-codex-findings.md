# Adversarial review findings — oxp-3

> Review-integrity disclosure: another writer changed this shared output file after my passes were frozen and also performed overlapping source mutations during Pass 3b. I discovered the output-file replacement only after completing Pass 3b, so I did not see later-pass material early. This final report contains only findings and commands I independently produced. The source-restoration details are disclosed in Validation notes.

## High

- None found.

## Medium

### [Pass 1] A rank-fetch failure leaves the holder's list looking fully purchased

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:128`, `public/js/tabs/office-tab.js:262`
- **Triggering input or sequence:** Render a character's own office, then have `GET /api/office_manoeuvre_rank` reject. The synchronous render passes `null` to `manoeuvreListHtml`, so all rows begin unmuted; the catch writes an error only into the rank mount and returns.
- **Observable consequence:** The holder sees all five manoeuvres with active styling even though the purchase rank is unknown and may be below five. The fail-open list remains indefinitely.
- **Confidence:** High.

### [Pass 1] An in-flight adjustment can repaint a newly selected category with the old category's state

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:289`, `public/js/tabs/office-tab.js:304`
- **Triggering input or sequence:** An ST clicks a category-A rank button, then switches to B before `_adjustManoeuvreRank` finishes. After A's PUT, it calls `_wireManoeuvreRank(el, categoryA, manoeuvresA, isOwnOfficeA)`. That new call captures B's current DOM nodes and later fills them with A's data.
- **Observable consequence:** Category B can show category A's dots, controls, and potentially manoeuvre rows until another render repairs it. Two ordinary `_wireManoeuvreRank` calls do not cross-write because each captures its old nodes before awaiting; the unsafe path is the post-adjustment re-entry.
- **Confidence:** High from the async ordering; no browser harness was available for end-to-end reproduction.

### [Pass 2] Concurrent stepper clicks lose rank changes

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:289`, `server/routes/office-manoeuvre-rank.js:55`
- **Triggering input or sequence:** Starting at rank 2, two STs click increment together, or one ST double-clicks before the first re-render. Both calls can GET 2, compute 3, and PUT `{ rank: 3 }`. The route applies an unconditional `$set`.
- **Observable consequence:** Two requested advances produce only one rank increase. `findOneAndUpdate` is atomic per write, but the separate client-side read/modify/write sequences are not serialized.
- **Confidence:** High.

### [Pass 3a] The viewer gate cannot satisfy AC2 and AC6 as literally written

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:253`, `public/js/tabs/office-tab.js:278`
- **Triggering input or sequence:** Trace a populated reference category. ST/dev passes the early guard and receives the stored rank readout plus controls; non-ST returns early and keeps an empty hidden mount. Own-office ST/dev and non-ST both receive the readout, with controls only for ST/dev.
- **Observable consequence:** An ST/dev reference viewer can infer exactly which fixed-order manoeuvres are purchased, despite AC2 saying reference view reveals or implies no purchase state. A non-ST reference viewer gets no readout, despite AC6's literal “shown regardless of `isOwnOffice`.” The implementation is a defensible compromise, but both literal criteria cannot be claimed without clarification.
- **Confidence:** High.

### [Pass 3b] “All 8 ACs satisfied” is false because AC7's concurrency outcome is absent

- **Severity:** Medium
- **File:line:** `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md:96`, `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md:335`
- **Triggering input or sequence:** Two adjustments overlap after reading the same current rank; each sends the same absolute next value.
- **Observable consequence:** One change is lost, directly contradicting AC7's promised “converge rather than clobber” outcome. No test sends concurrent adjustments, so the record's blanket claim is overstated. The AC2/AC6 conflict above independently prevents an unqualified all-eight claim.
- **Confidence:** High.

## Low

### [Pass 1] The exported rank markup builder throws on a negative rank

- **Severity:** Low
- **File:line:** `public/js/tabs/office-tab.js:57`
- **Triggering input or sequence:** Call exported `manoeuvreRankHtml(-1, 5, false)`, or add a caller that does not duplicate `_wireManoeuvreRank`'s clamp.
- **Observable consequence:** `'●'.repeat(-1)` throws `RangeError`; `NaN` silently renders zero filled dots and fractional values are truncated. The current internal caller clamps, so this is an exported-boundary robustness defect rather than a current UI path.
- **Confidence:** High for the behavior; medium that another caller will supply it.

### [Pass 1] Source-regex tests do not prove several behaviors named by their titles

- **Severity:** Low
- **File:line:** `server/tests/oxp-3-office-manoeuvre-rank.test.js:204`, `server/tests/oxp-3-office-manoeuvre-rank.test.js:232`
- **Triggering input or sequence:** Leave role/data-attribute strings disconnected in `office-tab.js`, or let the production and test mount surfaces diverge while the production mount remains textually correct.
- **Observable consequence:** Whole-file regex checks can remain green without exercising role-specific wiring or production middleware behavior. Pure builder tests cover markup conditionality, but not `_wireManoeuvreRank`'s viewer branches.
- **Confidence:** High.

### [Pass 3b] The claimed 171/171, 10-file, zero-skipped gate is not reproducible as stated

- **Severity:** Low
- **File:line:** `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md:335`, `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md:429`
- **Triggering input or sequence:** Run the mandated ten-path gate. `tests/oaq-2-pending-status-actions-accept-decline.test.js` does not exist; the repository has `tests/oaq-2-pending-status-actions.test.js`. Mongo access also fails with `EACCES` to `159.143.141.178:27017`.
- **Observable consequence:** The stable result is 9 files discovered, exit 1: 1 failed, 7 passed, 1 skipped file; 107 passed and 49 skipped tests (156 total). The historical claim may have been genuine elsewhere, but it is unverified-as-stated against the current mandated gate.
- **Confidence:** High for the current result; no claim that the historical run was fabricated.

### [Pass 3b] The “five existing tests” justification miscounts the synchronous guards

- **Severity:** Low
- **File:line:** `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md:361`, `server/tests/issue-1141-office-tab-render.test.js:57`
- **Triggering input or sequence:** Count pre-oxp.3 test cases that positively assert manoeuvre names in synchronous `innerHTML`.
- **Observable consequence:** There are four such test cases: the two-Socialite render, reference security boundary, own-office regression, and picker re-render. The rationale is directionally valid, but the specific evidence count is inaccurate.
- **Confidence:** High.

- No additional Low findings were produced in Pass 2 or Pass 3a.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/oxp-3-diff.txt`. I did not open repository source, the story, or the pre-existing output file; I checked only whether the output path existed before replacing it. Pass 1 was written before advancing.
- **Pass 2:** Opened `public/js/tabs/office-tab.js` in full; `public/js/data/api.js`; `public/js/tabs/office-data.js`; `server/routes/office-merit-dots.js`; `server/routes/office-manoeuvre-rank.js`; `server/middleware/auth.js` in full; `server/index.js`; `server/tests/helpers/test-app.js`; `server/tests/issue-1141-office-tab-render.test.js`; `server/tests/oxp-3-office-manoeuvre-rank.test.js`; and the `tls` line in `server/db.js`. I did not open the story. Pass 2 was written before advancing.
- **Pass 3a:** Opened `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md` only from the beginning through Dev Notes/References; the command stopped before `## Dev Agent Record`. Pass 3a was written before advancing.
- **Pass 3b:** Opened the story from `## Dev Agent Record` to EOF. No Senior Developer Review section exists. I opened the findings file only after completing Pass 3b, when a failed patch revealed that another writer had replaced it.
- I stayed inside `D:\Terra Mortis\TM Suite` and did not read sibling repositories.

### Commands and actual results

- Pass 1: `Get-Content -Raw` on the diff; a read-only Python line mapper over that diff; `node -e` probing `String.repeat`; and `Test-Path` on the report. `repeat(-1)` threw `RangeError`, `repeat(NaN)` returned `""`, and `repeat(2.5)` repeated twice. Pass freezes used `apply_patch`.
- Pass 2 reads used `Get-Content -Raw`, `Select-String` for route mounts, and `Get-Content -TotalCount 90` for the render-test preamble. `npx vitest run tests/issue-1141-office-tab-render.test.js` passed 22/22. `git status --short` showed a very large pre-existing dirty/untracked tree. `git diff -- server/db.js` was empty; `Select-String` showed `tls: true` at line 31.
- A Supertest probe sent encoded `__proto__`, `constructor`, `../office_merit_dots`, and `$where` categories; all returned 400 `Unknown office category`. A role probe showed `st` and `dev` pass the role middleware (then hit expected unknown-category validation), while `coordinator` and `player` receive 403.
- Pass 3 used two bounded `Get-Content` loops for the story prefix/suffix; `Select-String` located record claims; `rg` and numbered `Get-Content` counted synchronous assertions. `Test-Path` over all ten gate inputs found only `tests/oaq-2-pending-status-actions-accept-decline.test.js` missing; `rg --files tests | rg 'oaq-2|pending-status-actions|accept-decline'` found `tests/oaq-2-pending-status-actions.test.js`.
- Exact gate command, run from `server`: `npx vitest run tests/oxp-3-office-manoeuvre-rank.test.js tests/issue-1141-office-tab-render.test.js tests/office-merit-dots.test.js tests/otc-3-office-nav-unconditional.test.js tests/feature.691.hos-city-status-power.test.js tests/issue-1141-office-data-sync.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/oaq-2-pending-status-actions-accept-decline.test.js tests/otc-2-office-actions-api.test.js tests/otc-2-city-status-calc.test.js`.
- That exact gate was invoked five times: (1) initial unmutated: 1 failed, 7 passed, 1 skipped files; 107 passed, 49 skipped tests; (2) repeat during concurrent mutation: the same DB failure plus AC2, yielding 2 failed, 6 passed, 1 skipped files and 1 failed, 106 passed, 49 skipped tests; (3) my first controlled mutation run timed out after 182.6 seconds with no totals, and its surviving Node process was stopped; (4) controlled stepper mutation: the DB failure plus exactly AC6, with 1 failed, 106 passed, 49 skipped tests; (5) final unmutated: the stable initial result again, 1 failed, 7 passed, 1 skipped files and 107 passed, 49 skipped tests.
- Mutation 1 removed `isOwnOffice &&`. Because its full gate timed out, I also ran `npx vitest run tests/issue-1141-office-tab-render.test.js`: exactly AC2 failed, 21/22 passed. Mutation 2 changed `manoeuvreRankHtml`'s `if (isST)` to `if (true)`; the exact gate added exactly AC6 to the DB-failing baseline. A post-restore focused run passed 22/22.
- Integrity/restoration commands included `Get-FileHash`, `git diff --numstat`, `git diff --check`, complete comparisons of the current `office-tab.js` diff with its section in `oxp-3-diff.txt`, `rg` checks for the guard lines, CRLF/LF byte counts, six timed stability samples, `Get-Process node`, and stopping the timed-out Node PID. One PowerShell hash helper accidentally resolved `H` as `Get-History`, and a later quoting attempt failed to parse; neither modified files. A read-only Node brute-force hash probe determined the pre-mutation byte hash differed only because line 41 alone originally ended LF while the remaining file used CRLF.
- A final Node validation table confirmed `" 3 "` becomes integer 3; `"3abc"`, arrays, objects, null, booleans, and `"1e309"` are rejected; `"0x3"` is accepted as 3; JSON serializes `NaN` and `Infinity` as `null`, which the route rejects.

### Gaps, database status, and restoration

- No DB-backed assertion genuinely ran. MongoDB access failed with `EACCES`, so DB-gated suites skipped; `otc-2-office-actions-api.test.js` failed setup/cleanup rather than cleanly skipping. The disclosed `server/db.js` hazard did **not** cause this run: the current file has `tls: true` and no Git diff. I do not report any DB-backed suite as green.
- I could not run the category-switch race in a browser/jsdom environment because the repository has no such harness; that finding is a static async trace.
- Both temporary source expressions were restored, and the complete current `office-tab.js` semantic Git diff matches the supplied story diff with zero differing lines. However, `apply_patch` normalized line 41's pre-existing lone LF to CRLF, so its final byte hash differs from my pre-mutation hash despite identical source and Git diff. I could not restore that one byte through the mandated patching mechanism without using a prohibited shell-write workaround; this is disclosed rather than described as byte-identical restoration.
- Final path-scoped status shows the expected uncommitted story modification to `public/js/tabs/office-tab.js` and this untracked report; `server/db.js` has no diff. The broader workspace remains heavily dirty from pre-existing user content. No unrelated file was cleaned, reverted, committed, or pushed.

## Ship assessment

Needs patches before shipping. Fix the lost-update and stale-category races, avoid the fail-open list on rank-fetch failure, and obtain an explicit AC2/AC6 product ruling before claiming all eight criteria.
