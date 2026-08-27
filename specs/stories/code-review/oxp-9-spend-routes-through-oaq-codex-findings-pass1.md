# Adversarial review findings — Pass 1

## High

- None found.

## Medium

### [Pass 1] Concurrent submissions can create multiple pending purchases for one seat

- **Severity**: Medium
- **File:line**: `server/routes/office-purchase.js:209` (also exposed by `public/js/tabs/office-tab.js:853`)
- **The triggering input or sequence**: Send two valid `POST /api/office_purchase_requests` requests for the same seat concurrently. A quick double-click can do this because the new client handler does not mark the button busy before awaiting the POST. Both requests can complete the `findOne({ ..., status: 'pending' })` before either reaches `insertOne`.
- **The observable consequence**: Both calls can return 201 and create two pending queue rows, despite the stated one-pending-per-seat invariant. If only one XP remains, accepting one leaves the other pending but unacceptably unaffordable until an ST declines it. If the seat has at least two XP, an accidental double-click can ultimately spend twice. The sequential test at lines 315-329 does not exercise this race, and there is no unique/partial index or atomic upsert in the diff to arbitrate it.
- **Confidence**: High. The check and insert are separate non-transactional operations, and the client supplies a readily reachable concurrent trigger. The DB-backed suite was unavailable here, so this was not reproduced dynamically.

### [Pass 1] Malformed stored manoeuvre ranks make the accepted outcome disagree with storage or abort with 500

- **Severity**: Medium
- **File:line**: `server/routes/office-purchase.js:128` and `server/routes/office-purchase.js:396`
- **The triggering input or sequence**: Accept a manoeuvre purchase when `office_manoeuvre_ranks.rank` is negative or non-numeric. For example, with `rank: -5`, `checkPurchaseValidity` records `from: -5, to: -4`, while the update pipeline calculates `$min(max, $max(0, -5 + 1))` and stores `0`. With `rank: 'bad'`, the pre-check passes (`'bad' >= max` is false) and constructs `to: 'bad1'`, but MongoDB's `$add` rejects the string operand.
- **The observable consequence**: A negative value can produce a 200 response whose audit outcome (`to`, `left_after`, and one-XP cost) does not match the resulting rank or actual derived balance. A non-numeric value raises a MongoDB error, aborts both transactional writes, returns 500, and leaves the request pending until data is repaired or the request is declined. The ordinary cases do clamp correctly: missing and `0` become `1`, and an existing `max` remains `max`; negative numeric storage is clamped to at least `0`, but the separately computed outcome is not.
- **Confidence**: High for the hand-traced expressions and JavaScript coercions; medium-high overall because the DB-backed suite was skipped and I could not execute the pipeline against MongoDB.

## Low

### [Pass 1] A non-array `character_ids` value fails closed by crashing the request

- **Severity**: Low
- **File:line**: `server/routes/office-purchase.js:148`
- **The triggering input or sequence**: Authenticate as a player whose persisted `character_ids` is unexpectedly a scalar or object, such as a string, then POST a purchase request or GET the seat's pending requests. `(user?.character_ids || []).map(String)` attempts to call a missing `.map` method.
- **The observable consequence**: The authorization check does not fail open and cannot grant seat-holder access, but the async route rejects and Express returns 500 instead of a controlled denial. That player cannot use either office-purchase endpoint until their player record is repaired.
- **Confidence**: High for scalar/object values. An array containing odd elements is merely string-coerced and does not itself throw.

### [Pass 1] The atomicity test can pass without proving its advertised guarantee

- **Severity**: Low
- **File:line**: `server/tests/oxp-9-spend-routes-through-oaq.test.js:998`
- **The triggering input or sequence**: Move either purchase write outside the `withTransaction` callback while leaving any `getClient()`, `dbSession.withTransaction(`, and `session: dbSession` text somewhere in `office-purchase.js`.
- **The observable consequence**: The test named “runs inside a real transaction, so a rejection after the claim leaves nothing half-applied” still passes because it only performs three file-wide regex checks. It neither proves that the claim and purchase write are in the same callback nor injects a rejection after the claim. The current implementation is structured correctly; this finding is about the gate's inability to catch the regression its label promises to catch.
- **Confidence**: High.

## Validation notes

### Targeted conclusions

- `checkPurchaseValidity` checks `Array.isArray(officeEntry.merits)` and `officeEntry.merits.includes(merit)` at lines 111-112 before the first `MERIT_DOT_CAPS[merit]` lookup at line 114. An unapproved merit cannot reach the object-keyed lookup.
- `holderCharacterId` does not fail open for a non-array `character_ids`; it throws and therefore denies access via a 500, as reported under Low.
- I found no update path in the supplied diff that mutates an office-purchase document's `seat_id`, `purchase_kind`, `merit`, or `requested_by_character_id` between `_findPendingPurchase` and the transaction. The changed contested-roll guards explicitly exclude `office_purchase`, and the new accept/decline writes only terminal status/outcome/audit fields. I therefore did not flag reuse of the pre-transaction copy.
- Both the claim and purchase write are awaited inside one `dbSession.withTransaction` callback and every database operation in that callback passes `{ session: dbSession }`. MongoDB driver 7.1.1 aborts when this callback throws and invokes `commitTransaction()` only after it completes. A crash before commit cannot persist just the claim; the two writes are atomic as structured.
- `_needsEnrichment` is set only when the transactional claim matches zero rows. The catch performs the fresh read after `withTransaction` has ended but before the `finally` calls `endSession`; the read is non-transactional because it receives no session option. In this diff, accept/decline states are terminal, so the fresh resolved/declined body has no subsequent route transition that would make it stale. I did not flag it.
- Manoeuvre pipeline trace: missing document -> `1`; `{ rank: 0 }` -> `1`; `{ rank: max }` would be rejected by the pre-check, while the pipeline itself would clamp `max + 1` to `max`; negative numeric -> at least `0`; non-numeric -> `$add` error. The malformed cases are reported under Medium.
- The diff headers do not include `server/routes/office-merit-dots.js` or `server/routes/office-manoeuvre-rank.js`. The header comment's statement that both direct ST routes are untouched is true.
- Once `startSession()` succeeds, the `try/finally` covers every `withTransaction` exit and awaits `endSession()`. A failure in `getClient()` or `startSession()` happens before a session exists to clean up. I found no missing `await` in the new Express routes and no dead import or unreachable branch that warranted a finding.

### Files opened and scope

- Opened the supplied `specs/stories/code-review/oxp-9-spend-routes-through-oaq-diff.txt`, including its patches for all listed `server/` and `public/` files.
- Opened changed files needed for exact line/order checks: `server/routes/office-purchase.js`, `server/schemas/office_purchase_request.schema.js`, `server/tests/oxp-9-spend-routes-through-oaq.test.js`, `server/tests/helpers/test-app.js`, `public/js/tabs/office-tab.js`, and `public/js/data/office-xp.js`.
- Followed ambiguous imports only into `server/middleware/auth.js`, `server/db.js`, and the installed MongoDB driver's `server/node_modules/mongodb/src/sessions.ts`.
- I did not open, glob, or grep any story or tracking file. I did not inspect any sibling repository.

### Commands run and real results

- `Get-Content -LiteralPath 'specs\stories\code-review\oxp-9-spend-routes-through-oaq-diff.txt' -Raw` — exit 0; read 2,088 diff lines. The tool display truncated the first returned rendering, so later reads were narrowed to named sections.
- `Get-Content ...diff.txt | Where-Object { $_ -like 'diff --git *' }` — exit 0; returned 12 changed-path headers. Neither direct ST purchase route was present.
- Numbered `Get-Content` reads of `server/routes/office-purchase.js` and `server/schemas/office_purchase_request.schema.js` — both exit 0; 444 and 45 lines respectively.
- Targeted extraction from the supplied diff for `server/index.js`, `server/routes/contested-rolls.js`, `server/routes/office-actions.js`, `server/tests/helpers/test-app.js`, and `server/tests/oxp-4-merit-persistence-handover.test.js` — exit 0; returned the requested patch sections.
- Numbered `Get-Content` reads of `public/js/tabs/office-tab.js` lines 380-820 and 805-900 — both exit 0; confirmed request rendering, click wiring, and lack of an immediate busy lock.
- `cd server; npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js` — exit 0: **1 test file passed; 24 tests passed, 51 skipped, 75 total**. Because all DB-backed tests skipped, this is not a passing DB suite.
- Filtered numbered read of `server/tests/oxp-9-spend-routes-through-oaq.test.js` for test names/DB guards, followed by exact reads of lines 305-342 and 940-1010 — both exit 0; confirmed the duplicate test is sequential and the transaction claim is regex-only.
- Numbered `Get-Content` reads of `server/middleware/auth.js`, `server/tests/helpers/test-app.js` lines 1-80, and `server/db.js` lines 1-180 — all exit 0; traced production/test user shapes and session creation.
- Three targeted `Get-Content` scans of `public/js/data/office-xp.js` — all exit 0; located and read `officeXpSpentForCategory` and `officeSeatXp`, including their handling of non-finite/non-numeric and negative rank values.
- `Get-Command mongod -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source` — exit 1 with no output; `mongod` is not installed/on PATH, so I could not run the 51 DB-backed tests or dynamically reproduce MongoDB races/pipeline behavior.
- `cd server; npm ls mongodb --depth=0` — exit 0; installed driver is `mongodb@7.1.1`.
- `rg -n -m 8 "async withTransaction|withTransaction<T>" node_modules/mongodb/lib node_modules/mongodb/src` — exit 0; located the implementation at `node_modules/mongodb/src/sessions.ts:706` and compiled implementation at `lib/sessions.js:484`.
- Numbered `Get-Content` reads of MongoDB `sessions.ts` lines 680-835 and 830-895 — both exit 0; confirmed callback abort/retry behavior and commit ordering.
- `git status --short` — exit 0; before creating this report it showed only pre-existing untracked review artifacts and `.codex-oxp9-pass2-mongod.yml`; it did not show this Pass 1 findings file yet. Git also warned that the user-level ignore file was inaccessible.
- `git diff -- server public` — exit 0; showed a pre-existing one-line change in `server/db.js` (`tls: true` to the `CODEX_OXP9_LOCAL_MONGO` conditional). I made no edit to that file or any other source/tooling file and left this other session's change untouched.
- Final `git status --short` after writing this report — exit 0; showed this required report as untracked, the same `server/db.js` modification, and additional `.codex-oxp9-pass2-mongo/` / `.codex-tmp/` artifacts created by another active session. It showed no source change attributable to this pass. Git repeated the inaccessible user-ignore warning.
- Final `git diff -- server public` — exit 0; still showed only the same one-line `server/db.js` change and no change from this pass.
- `Get-Item -LiteralPath 'specs\stories\code-review\oxp-9-spend-routes-through-oaq-codex-findings-pass1.md' | Select-Object FullName,Length,LastWriteTime` — exit 0; confirmed the required report at the requested path (11,300 bytes before this final validation-note addition).

Only this required findings file was created. No source file was temporarily edited, so no restore was necessary.
