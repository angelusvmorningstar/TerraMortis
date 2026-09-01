# Pass 3 — Acceptance Auditor Findings

## High

- None found.

## Medium

### [Pass 3] The claimed no-infrastructure static gate cannot run through the repository's standard Vitest command

- **Severity**: Medium
- **File:line**: `server/tests/p0-coordinator-role-ownership-bypass.test.js:18`; `server/vitest.config.js:12`
- **The triggering input or sequence**: From `server/`, run the prescribed `npx vitest run tests/p0-coordinator-role-ownership-bypass.test.js tests/p0-coordinator-role-ownership-bypass-http.test.js` in this checkout. `vitest.config.js` runs `tests/helpers/global-setup.js` before file collection. With the configured Atlas host inaccessible, it aborts with `EACCES`; pointing `MONGODB_URI` at the listening local `mongod` also aborts because both global setup and `db.js` force TLS and the local daemon resets that handshake.
- **The observable consequence**: The real prescribed result is **0 tests executed** (exit 1), not 23 passed. In particular, the source-scan suite's explicit promise that it “needs neither mongod nor markdown/, so it runs everywhere, including this environment” is false under the checked-in test configuration. An isolated Vitest run with only `globalSetup` disabled proved its 12 tests pass, but that is not the normal or claimed gate; the sole portable regression guard is unavailable through `npm test`/the documented command whenever the integration prerequisites are absent.
- **Confidence**: High — reproduced twice through the standard command (Atlas `EACCES`, then local MongoDB `ECONNRESET`) and once through a supplemental run that isolated the static file at 12/12.

### [Pass 3] The claimed coordinator-own-data regression coverage exists only for character-sheet GET

- **Severity**: Medium
- **File:line**: `server/tests/p0-coordinator-role-ownership-bypass-http.test.js:203`
- **The triggering input or sequence**: Introduce an over-restrictive route/mount gate such as `requireRole('st')` on `GET /api/history`, `GET /api/questionnaire`, or `GET /api/downtime_submissions`, then run both new suites with working integration infrastructure. The static suite's literal-pattern and occurrence-count assertions remain satisfied, and the HTTP suite's other-character requests still receive the expected 403. The only coordinator-own-data positive case is `GET /api/characters/:id`; ST positive cases exist only for character GET and game-session DELETE.
- **The observable consequence**: A coordinator who also owns a character can lose access to their own history, questionnaire, or downtime data while both new suites remain green, despite the commit/tracking claim that regression guards prove “coordinator-on-own-data” still works. The HTTP suite also never reaches several changed handler-level gates because the always-true retirement middleware returns first, so it does not dynamically prove the direct history/ordeal PUT ownership checks or downtime PUT ownership/redaction behavior.
- **Confidence**: High — the full 219-line HTTP suite contains exactly one own-data test (characters) and two ST-positive tests (characters and game-session DELETE); the omitted surfaces are directly visible from the route list and test descriptions.

## Low

### [Pass 3] Downtime POST behavior changed outside the claimed GET+PUT scope

- **Severity**: Low
- **File:line**: `server/routes/downtime.js:66`; `server/routes/downtime.js:190`
- **The triggering input or sequence**: A coordinator submits a valid `POST /api/downtime_submissions` request while `FORM_RETIRED` is true. POST already uses the shared `requireFormNotRetiredForPlayers` function, and this diff changes that function from blocking only literal players to blocking every non-ST role.
- **The observable consequence**: The coordinator now receives `403 FORM_RETIRED` before the POST handler, whereas the pre-change code allowed the request through. This is policy-consistent and appears desirable, but the deferred-work entry and commit describe downtime as “GET+PUT” and enumerate exactly two additional discoveries (ordeal retirement and character GET), so this additional POST behavior change is not accurately accounted for in the acceptance narrative.
- **Confidence**: High — `FORM_RETIRED` is currently the literal `true`, POST is wired to the changed middleware at line 190, and middleware ordering makes the 403 deterministic.

## Validation notes

**Ship judgement:** Needs patches first. The production authorization changes themselves match the claimed fixes and I found no remaining High-severity bypass in the reviewed scope. However, the standard two-suite gate executes zero tests in the claimed degraded environment, and the stated own-data regression coverage is materially narrower than claimed. I would make the static suite genuinely runnable without integration prerequisites and add positive own-data coverage for the other affected data surfaces before treating the acceptance account as satisfied. The Low POST scope-accounting issue can be resolved by documenting the behavior or narrowing the implementation if that was not intended.

### Files opened

- Claim/diff inputs: `specs/stories/deferred-work.md` (only the requested 2026-09-01/02 first bullet), `specs/stories/sprint-status.yaml` (the requested `last_updated:` entry), and `specs/stories/code-review/p0-coordinator-role-ownership-bypass-diff.txt`.
- Changed production/test files: `server/middleware/ordeal-retirement.js`; `server/routes/characters.js`; `server/routes/downtime.js`; `server/routes/game-sessions.js`; `server/routes/history.js`; `server/routes/ordeal-responses.js`; `server/routes/questionnaire.js`; `server/tests/p0-coordinator-role-ownership-bypass.test.js`; `server/tests/p0-coordinator-role-ownership-bypass-http.test.js`.
- Supporting authorization/mount/exclusion files: `server/routes/attendance.js`, `server/middleware/auth.js`, and the relevant `server/index.js` mount lines.
- Test-infrastructure files: `server/vitest.config.js`, `server/tests/helpers/global-setup.js`, `server/tests/helpers/setup-env.js`, `server/tests/helpers/db-setup.js`, `server/db.js`, and `server/package.json`.
- Retirement constants: `public/js/ordeals/ordeal-retirement.js` and `public/js/downtime/form-retirement.js`.
- Installed Vitest API/help metadata was inspected under `server/node_modules/vitest/dist/` only to perform non-writing supplemental runs without the global setup. No sibling repository and none of the concurrent data-hygiene audit documents were opened.

### Commands and real results

1. `rg -n -A 25 -m 1 '^## Deferred from: 2026-09-01/02 general-audit day|^last_updated:' specs/stories/deferred-work.md specs/stories/sprint-status.yaml` — found the requested deferred-work bullet at lines 690–712 and the 2026-09-02 `last_updated:` entry at line 49. The long YAML scalar caused `rg -A` to print following physical lines too; I did not use those unrelated lines in the audit.
2. `Get-Content -Raw specs/stories/code-review/p0-coordinator-role-ownership-bypass-diff.txt` — read the supplied server diff in full: seven production files and two new test files.
3. Targeted `rg -n -C 8` searches over the seven changed production files plus `attendance.js`, `auth.js`, and `index.js`, followed by full/ranged `Get-Content` reads of the relevant handlers — confirmed every claimed hunk, `isStRole()` semantics, the game-session coordinator mount, and the attendance exclusion's actual behavior.
4. `rg -n "req\.user\.role\s*(===|!==)\s*'player'|!isStRole\(req\.user\)" server/routes server/middleware` — the only remaining literal `=== 'player'` ownership-like check is `attendance.js:123`; inspection showed it changes one attendance entry's downtime/check-in flag, consistent with the coordinator role's documented job. The two `!== 'player'` downtime checks grant player-only flag/recall actions and are not ownership bypasses.
5. `npx vitest run tests/p0-coordinator-role-ownership-bypass.test.js tests/p0-coordinator-role-ownership-bypass-http.test.js` — **exit 1; 0 passed, 0 failed, 0 skipped, 0 files collected**. Global setup aborted on `connect EACCES 159.143.141.178:27017`.
6. `rg --files tests | rg '(characters|downtime|history|ordeal|questionnaire|game-session).*\.(test|spec)\.[cm]?[jt]sx?$'` — enumerated 20 wider-regression files: `api-history-retirement`, `api-game-sessions`, `api-game-sessions-next`, `api-game-sessions-delete`, `api-downtime`, `api-downtime-story-moment`, `api-questionnaire-retirement`, `api-downtime-regent-gate`, `api-downtime-personal-story-freetext`, `api-ordeal-submissions`, `api-downtime-hold-flags`, `api-ordeal-responses`, `api-characters`, `api-characters-safe-place-locations`, `api-characters-public-fields`, `api-characters-crud`, `api-characters-carthian-pull`, `cm-2b-downtime-cycles-to-chapters`, `ordeal-cascade`, and `gdx-8-roll-history`.
7. One `npx vitest run` invocation containing all 20 files above — **exit 1; 0 passed, 0 failed, 0 skipped, 0 files collected**, with the same global-setup `EACCES` abort. Thus there is no per-file pass result from the prescribed configuration and “zero regressions” could not be verified.
8. `Get-Content` of `vitest.config.js`, `tests/helpers/global-setup.js`, and `package.json`, plus `npx vitest --help --expand-help | Select-String ...` — confirmed every run has an unconditional global setup and there is no CLI `globalSetup` override. The source-scan file is therefore not normally infrastructure-independent.
9. `git log --oneline -1; git show --stat --format=fuller HEAD; git show --stat --format=fuller 1b241614; git status --short` — HEAD is `1b241614 fix(security): close coordinator-role ownership bypass across 7 routes`; both show commands reported the same 11 committed files, 474 insertions/28 deletions, including `deferred-work.md` and `sprint-status.yaml`. The full working tree is not clean because of explicitly out-of-scope concurrent audit/review artifacts; none is evidence of an omitted file from this commit.
10. A combined command attempted to read `public/js/...` from inside `server/` using an incorrect relative path and then ran `node --check` over all nine changed JavaScript files — the two `Get-Content` operations reported “path does not exist”; `node --check` still parsed **9/9** files successfully. A corrected `Get-Content ..\public\js\...` command then read both retirement modules and confirmed `ORDEALS_RETIRED = true` and `FORM_RETIRED = true`.
11. `rg -c '^\s*it\('` on the two new test files — 12 static test definitions plus 11 HTTP test definitions, 23 total definitions (not 23 executed by the prescribed command).
12. A PowerShell reproduction of the static suite's source predicates — downtime `vulnerable=0 fixed=6`, history `0/3`, questionnaire `0/4`, ordeal responses `0/1`, game sessions `0/0`; game-session ST DELETE gate `True`; coordinator mount `True`.
13. `Get-Command mongod`, `Get-Process mongod`, and `Test-NetConnection 127.0.0.1 -Port 27017` — `mongod` is not on PATH, but process 6744 is running and the local port is reachable.
14. `Get-Content tests/helpers/setup-env.js` and targeted `rg` over `db.js`/`db-setup.js` — confirmed Vitest forces `MONGODB_DB=tm_game_test` and both connection layers refuse a non-`*_test` database.
15. `$env:MONGODB_URI='mongodb://127.0.0.1:27017'; npx vitest run <the two new suites>` — **exit 1; 0 executed** with `read ECONNRESET`; inspection of `global-setup.js` and `db.js` showed both construct `MongoClient(..., { tls: true })`, incompatible with the listening local non-TLS daemon.
16. `node --input-type=module -e "import { startVitest } from 'vitest/node'; await startVitest(..., { run:true, globalSetup:[] })"` for only the static suite — **1 file passed, 12/12 tests passed** in 268 ms. This supplemental run isolates test content; it is not the prescribed repository gate.
17. A supplemental programmatic Vitest run of the two new suites with `globalSetup:[]` and local MongoDB selected — static module **12 passed**; HTTP module **11 skipped with a module-level failure** from the forced-TLS connection; exit 1.
18. A supplemental programmatic Vitest run of all 20 wider files with `globalSetup:[]` and local MongoDB selected — exit 1 after 125.8 s. Compact per-file result:

    | File | Pass | Skip | Module result |
    |---|---:|---:|---|
    | `api-characters-carthian-pull.test.js` | 0 | 26 | fail (DB setup) |
    | `api-characters-crud.test.js` | 0 | 34 | fail (DB setup) |
    | `api-characters-public-fields.test.js` | 0 | 5 | fail (DB setup) |
    | `api-characters-safe-place-locations.test.js` | 0 | 11 | fail (DB setup) |
    | `api-characters.test.js` | 0 | 15 | fail (DB setup) |
    | `api-downtime-hold-flags.test.js` | 0 | 9 | fail (DB setup) |
    | `api-downtime-personal-story-freetext.test.js` | 0 | 3 | fail (DB setup) |
    | `api-downtime-regent-gate.test.js` | 0 | 12 | fail (DB setup) |
    | `api-downtime-story-moment.test.js` | 0 | 2 | fail (DB setup) |
    | `api-downtime.test.js` | 0 | 20 | fail (DB setup) |
    | `api-game-sessions-delete.test.js` | 0 | 4 | fail (DB setup) |
    | `api-game-sessions-next.test.js` | 0 | 5 | fail (DB setup) |
    | `api-game-sessions.test.js` | 0 | 17 | fail (DB setup) |
    | `api-history-retirement.test.js` | 0 | 3 | fail (DB setup) |
    | `api-ordeal-responses.test.js` | 0 | 17 | fail (DB setup) |
    | `api-ordeal-submissions.test.js` | 0 | 10 | fail (DB setup) |
    | `api-questionnaire-retirement.test.js` | 0 | 3 | fail (DB setup) |
    | `cm-2b-downtime-cycles-to-chapters.test.js` | 0 | 72 | fail (DB setup/cleanup) |
    | `gdx-8-roll-history.test.js` | 17 | 15 | pass |
    | `ordeal-cascade.test.js` | 0 | 6 | skip |

    Supplemental aggregate: **17 passed, 289 skipped, 18 module-level DB failures**. These are infrastructure outcomes, not evidence of 18 code regressions.
19. Vitest programmatic-reporter/API probes (`import('vitest/node')`, `rg`/`Get-Content` for `startVitest`, reporter prototype inspection, and small `node --input-type=module -e` runs) — established the non-writing `globalSetup:[]` supplemental method and compact per-file reporting. Two reporter snippets had JavaScript syntax errors, one used the obsolete `onFinished` hook and emitted no summary, and two initially inspected the v4 task API incorrectly (`undefined`/`t.state is not a function`); all were diagnostic-only and wrote no files.
20. A first all-20 programmatic command was malformed by PowerShell quoting and exited immediately with a JavaScript syntax error. The corrected verbose run exited 1 after 128.7 s with the same TLS/DB failures; the later compact run in item 18 supplied the exact per-file breakdown.
21. `$actual = git diff e99b6c13..1b241614 -- server/; ...` in-memory comparison — `supplied server diff matches commit=True`. Targeted `git status --short --` over all 11 committed paths produced no entries.
22. Final targeted `rg -n` commands recorded the finding line numbers and confirmed the static/HTTP test descriptions cited above.

### Could not run

- The two new suites could not be run together through the prescribed standard command: global setup aborted before collection. Real standard-command result: **0 pass / 0 fail / 0 skip**, not 23 passed.
- The HTTP suite's 11 tests could not execute against MongoDB. Atlas access is denied in this sandbox (`EACCES`), while the reachable local daemon is non-TLS and the checked-in test connection forces TLS (`ECONNRESET`). I did not start the server and did not connect to or mutate production.
- The 20-file wider regression set likewise could not produce a valid integration result. The standard run collected nothing; the supplemental run's 289 skips and 18 module failures were infrastructure-caused. Therefore the commit's **209 tests across 15 files, zero regressions** claim is not independently verified by this pass.

### Workspace integrity

I modified no source, test, tracking, or concurrent-audit file. I created only this requested findings file. The supplied server diff is byte-for-byte equivalent (after trailing-newline normalization) to `git diff e99b6c13..1b241614 -- server/`, and all 11 paths in commit `1b241614` are clean in targeted `git status`. The repository-wide status remains dirty solely with pre-existing concurrent-session artifacts plus this findings file; I did not open, modify, restore, stage, commit, or push those artifacts.
