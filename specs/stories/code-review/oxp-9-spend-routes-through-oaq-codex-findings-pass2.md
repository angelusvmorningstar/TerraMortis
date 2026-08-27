# Pass 2 — Edge Case Hunter

## High

- None found.

## Medium

### [Pass 2] A changed seat category silently retargets the queued purchase

- **Severity**: Medium
- **File:line**: `server/routes/office-purchase.js:309`, `server/routes/office-purchase.js:325`, `server/routes/office-purchase.js:343`, `server/routes/office-purchase.js:380`
- **The triggering input or sequence**: Submit a merit or manoeuvre request while a seat has office category A, then change that same seat's `office_category` to category B before the ST accepts it. For a merit, choose one shared by both categories (for example, `Resources` exists in both Head of State and Primogen); every current category also has a non-empty manoeuvre ladder, so every manoeuvre request is susceptible. The pending document retains category A for the Approval Queue, but accept reads category B and never compares it with `pending.office_category`.
- **The observable consequence**: The ST approves a row labelled for category A, but the route returns 200 and writes the purchase using category B's rules and denormalised category. Runtime reproduction: a Head of State `Resources` request was submitted, the seat was changed to Primogen, and accept returned 200 with `office_merit_dots.office_category: "Primogen"` and `Resources: 1`. A manoeuvre request can therefore advance a completely different named ladder from the one shown when it was queued.
- **Confidence**: High — reproduced against an isolated local replica set through the real Express router and MongoDB transaction.

### [Pass 2] The one-pending-per-seat check races, allowing a click burst to buy multiple dots

- **Severity**: Medium
- **File:line**: `server/routes/office-purchase.js:203`, `server/routes/office-purchase.js:209`, `server/routes/office-purchase.js:246`
- **The triggering input or sequence**: Send two or more near-simultaneous valid `POST /api/office_purchase_requests` calls for the same seat before any insert commits. Each handler performs the same unprotected `findOne` and then an unconditional `insertOne`; there is no partial unique index or atomic claim. The Office tab leaves every purchase button active until a later refresh, so a rapid double-click or clicks on different controls can generate this naturally.
- **The observable consequence**: Multiple pending rows are created for one seat, violating the invariant the client and comments rely on. In a 12-request runtime burst, ten calls returned 201 and ten pending documents existed. Accepting the first two duplicate Haven requests returned 200 and 200 and left Haven at two dots, so an accidental burst becomes multiple purchases whenever the seat has enough XP and the ST approves the rows.
- **Confidence**: High — reproduced end to end against the real route and isolated MongoDB replica set.

## Low

- None found.

## Validation notes

### Files opened

I opened the supplied `specs/stories/code-review/oxp-9-spend-routes-through-oaq-diff.txt` and no other story, story-spec, or tracking content under `specs/stories/`. I did not read any sibling repository.

Repository files inspected were: `server/index.js`, `server/package.json`, `server/db.js`, `server/vitest.config.js`, `server/routes/office-purchase.js`, `server/routes/office-actions.js`, `server/routes/contested-rolls.js`, `server/routes/office-seats.js`, `server/lib/office-seat-resolve.js`, `server/schemas/office_purchase_request.schema.js`, `server/tests/helpers/test-app.js`, `server/tests/helpers/db-setup.js`, `server/tests/oxp-9-spend-routes-through-oaq.test.js`, relevant search excerpts from `server/tests/oxp-5-handover-logic.test.js`, `public/js/tabs/office-tab.js`, `public/js/tabs/office-data.js`, `public/js/suite/office-approvals.js`, and `public/js/data/office-xp.js`. The supplied diff also exposed its changed excerpt from `public/css/suite.css`.

### Commands and results

- Read-only orientation/inspection commands: `Get-Content` (with line numbering) for the files listed above; `Select-String ... -Pattern '^diff --git '` reported the diff's 12 changed paths; `rg` searches traced all relevant mounts, `/:id/accept`, `/:id/decline`, `/void`, discriminator filters, `spendKnown`, handover logic, MongoDB helpers, and test setup. `server/index.js:174` is the production mount: `app.use('/api/office_purchase_requests', requireAuth, noCache(), officePurchaseRouter)`. No competing route shares that mount prefix, and the separately mounted contested-roll, humanity-check, office-action, project-invitation, and relationship `accept`/`decline` patterns cannot match it.
- Initial `git status --short` showed only pre-existing untracked review/diff files under `specs/stories/code-review/`; no source modification was present at that point. `Get-Command mongod`, `Get-Process mongod`, `where.exe mongod`, filesystem lookup under `C:\Program Files\MongoDB`, and port/process checks found MongoDB 8.3 at `C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe`; the already-running process was not reachable from these tests.
- First run, using the repository's configured database: `cd server && npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js` => **1 file passed; 24 tests passed, 51 skipped (75 total)**. `tests/oaq-2-pending-status-actions.test.js` => **1 file skipped; 15 tests skipped**. `tests/oaq-3-approval-queue.test.js` => **1 file passed; 15 passed, 9 skipped (24 total)**. `tests/gdx-12-humanity-check-oaq-submit-approve.test.js` => **1 file passed; 26 passed, 15 skipped (41 total)**. These were not treated as full passes because the DB-backed tests skipped.
- The first attempt to create `D:\tmp\codex-oxp9-pass2-mongo` failed with access denied. An initial `Start-Process mongod` invocation using unquoted space-containing arguments produced no listening server; the connection probe failed with `ECONNREFUSED 127.0.0.1:27129`. I then created a temporary workspace config and started an isolated single-node replica set on alternate port **27129**. The Node MongoDB-driver command `replSetInitiate` returned `{ ok: 1 }`.
- To let this repository's hard-coded `tls: true` test client talk to that plain local replica set, I temporarily changed that one line in `server/db.js` to key off a review-only environment variable. With `MONGODB_URI=mongodb://127.0.0.1:27129/?replicaSet=codexOxp9Pass2`, the four required gates were rerun and fully executed: `tests/oxp-9-spend-routes-through-oaq.test.js` => **75 passed, 0 skipped**; `tests/oaq-2-pending-status-actions.test.js` => **15 passed, 0 skipped**; `tests/oaq-3-approval-queue.test.js` => **24 passed, 0 skipped**; `tests/gdx-12-humanity-check-oaq-submit-approve.test.js` => **41 passed, 0 skipped**.
- A Node/Supertest runtime probe seeded one seat and issued `Promise.all` with two accepts for the same request. Exact observation: **HTTP 200 and 409; Haven dots = 1**. The same required concurrency scenario in the oxp.9 suite also passed for both merit and manoeuvre requests.
- A Node/Supertest probe issued simultaneous merit and manoeuvre submissions for one seat. Exact observation: **HTTP 201 and 201; pending count = 2**. A 12-call identical-Haven burst then observed statuses `[201,201,201,409,409,201,201,201,201,201,201,201]`, **10 created records**, first two accept statuses **200 and 200**, and final **Haven dots = 2**. A separate two-call attempt happened to serialize and returned 201/409, confirming the defect is scheduler-dependent rather than guaranteed on every pair.
- A Node/Supertest stale-category probe submitted `Resources` for Head of State, directly changed the live seat category to Primogen, then accepted. Exact observation: submitted category **Head of State**, accept **HTTP 200**, written category **Primogen**, `Resources` dots **1**.
- A pure `officeSeatXp` probe used identical seat/purchase inputs with one versus two same-category seats. It returned `{earned:7, spent:4, left:3, spendKnown:true}` for the single-seat array and `{earned:7, spent:4, left:3, spendKnown:false}` for the multi-seat array. `rg -n "spendKnown"` confirmed the new route and client path never branch on it.
- Cleanup commands stopped only the review-started `mongod` PID, verified the temporary database directory resolved beneath `D:\Terra Mortis\TM Game`, deleted that directory, and confirmed it no longer existed. The temporary MongoDB config was deleted.

### Restoration and workspace state

The temporary `server/db.js` edit was restored. Immediately after my cleanup, `git hash-object server/db.js` and `git rev-parse :server/db.js` both returned `b8dfa082e07bdcee9544602b913d67a86aa84520`, confirming a byte-for-byte restore to the index blob, and `git diff -- server/db.js` was empty. The isolated database fixtures were cleaned and its process stopped.

During this review, other active sessions created/modified unrelated review artifacts and source files. The final status check showed `server/db.js` had been changed again after the verified restore (to the same review-only TLS toggle), alongside modifications to `server/routes/contested-rolls.js`, `server/routes/office-actions.js`, `server/routes/office-purchase.js`, `.codex-tmp/`, and a Pass 1 findings file. I did not overwrite or remove those concurrent-session changes. My temporary config and replica-set directory are absent; my only intentional persistent change is this requested Pass 2 findings file.
