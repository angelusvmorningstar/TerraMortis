# Issue #1143 — Edge Case Hunter findings (Pass 2)

Reviewed the CURRENT on-disk `server/routes/office-actions.js` (post-fix, rank-based budget
check — not the stale `countDocuments() > budget` version in
`specs/stories/code-review/issue-1143-diff.txt`), plus its supporting index creation in
`server/index.js`, the new/changed test files, and the wider codebase for the data-model
question in hunt item 2. Diff used only for orientation, per the brief.

## High

### 1. The rank-based budget fix still over-accepts under a real write-visibility race (reproduced)

- **Severity**: High
- **File:line**: `server/routes/office-actions.js:186-205` (insert → recount-by-rank → conditional
  delete block)
- **The triggering input or sequence**: Two concurrent `POST /` requests, same actor, same
  session, different `target_id`s, at the actor's last remaining budget slot (e.g. budget=1,
  0 prior actions this session). Both pass every earlier gate independently. The fix's own code
  comment argues correctness from "the ordering, not the count, is what breaks the tie" — that
  argument implicitly assumes each request's recount `find()` sees every concurrently-inserted
  document with a smaller `_id`. It does not: a recount is a plain, unsynchronised read. If
  request A calls `insertOne()` first (and therefore is assigned the smaller `ObjectId`, since
  the Node driver assigns `_id` synchronously at call time and a single Node process's ObjectId
  counter is strictly increasing) but A's write takes longer to become visible than B's — B's
  insert and B's own recount both complete **before A's insert has landed** — B's recount `find()`
  simply does not see A's document yet. B computes `rank(B) = 0` (only itself visible) and is
  kept. When A's insert finally lands and A recounts, A now sees `[A, B]` sorted by `_id`, giving
  `rank(A) = 0` (A sorts before B) — also kept. Both survive against a budget of 1.
- **The observable consequence**: Budget over-acceptance — the exact failure mode issue #1143's
  fix was written to close, just via a different interleaving than the one the fix's comment
  reasons about (which only covers "both inserts complete before either recount runs"; it does
  not cover "one recount runs before the other's insert is visible"). In production this
  translates to a Head-of-State-tier actor being able to raise/lower more targets in a session
  than their City Status budget permits, whenever two requests from that actor race and one
  request's write happens to be slower than the other's full insert+recount+decide round trip —
  entirely plausible on a real network (the project's actual `MONGODB_URI`, resolved from
  `TM Suite/.env`, points at a 3-node **Atlas replica set**, not a local loopback connection — see
  Medium finding #4 below — so real WAN jitter between the API server and the DB is the normal
  case, not a contrived one).
- **Confidence**: High — reproduced empirically. I wrote a standalone script
  (`server/_edge-case-tmp-race.mjs`, deleted after use — see Validation notes) against the live
  `tm_suite_test` database that replicates the route's exact insert→find(sort `_id`)→rank→delete
  algorithm verbatim, with a controlled artificial delay on request A's `insertOne` call to force
  the interleaving above. Result: both A and B were kept (`rank: 0` for each), and the collection
  ended with **2 surviving documents against a budget of 1**. I did not additionally reproduce
  this through the live Express route/HTTP layer (would require temporarily instrumenting
  `office-actions.js` itself); the algorithm reproduced is character-for-character the same
  read/write sequence the route executes, so I'm confident the route inherits the same flaw, but
  flagging the HTTP-layer gap honestly rather than overclaiming.

### 2. Two different court officers acting on the SAME target lose an update (not race-contrived — reachable by design)

- **Severity**: High
- **File:line**: `server/routes/office-actions.js:104-116` (actor/target load and `old_status`
  read) and `:207-210` / `:220-223` (the `$set: {'status.city': new_status}` writes)
- **The triggering input or sequence**: The route's authorization gate is
  `if (!actor.court_category) return 403` — it does **not** restrict the actor to
  `court_category === 'Head of State'`. Any of the five court categories qualifies. The admin UI
  itself (`public/js/admin/city-views.js:133`, `const multiOk = cat !== 'Head of State';`)
  documents that **four of the five categories (Primogen, Administrator, Socialite, Enforcer)
  explicitly permit multiple simultaneous holders by design** — this is not a data-integrity bug
  to guard against, it's the intended court model. Separately, `public/js/editor/identity.js:84`
  exposes a plain `<select>` on every character's sheet editor that lets an ST set `court_category`
  to any value including `'Head of State'` directly, with **no cross-character uniqueness check
  anywhere** — not in `server/schemas/character.schema.js` (enum-only, no uniqueness), not in
  `server/routes/characters.js`'s `PUT /:id` handler, not as a Mongo index (checked
  `server/index.js` — no `court_category` index exists at all) — so even "only one Head of State"
  is a UI convention (`city-views.js`'s single-slot edit grid) with no server-side enforcement, let
  alone the four categories that don't even have that UI convention. So: any two officers (even of
  different categories, e.g. a Socialite and an Enforcer) can both hold office concurrently by
  design, and both can call this route. When two such officers both `raise`/`lower` the **same**
  `target_id` at close to the same time: each loads the target independently
  (`target = await getCollection('characters').findOne(...)`, `old_status = target.status?.city`)
  *before* either has written anything; each computes `new_status = old_status + 1` from that same
  stale read; each writes with `$set: {'status.city': new_status}` (not `$inc`, no optimistic
  version check, no `findOneAndUpdate` filtering on the read `old_status`). The new
  partial-unique index on `{game_session_id, actor_id, target_id}` does **not** prevent this — it
  is keyed on `actor_id`, so two different actors racing the same target simply produce two
  different index keys and both inserts succeed unconditionally.
- **The observable consequence**: A lost update. Two officers each intending a +1 raise on the
  same target net the target only +1 total instead of +2, with **two** `office_actions` log
  entries recorded (both claiming a valid `old_status`/`new_status` transition) that together
  misrepresent what `characters.status.city` actually ended up as — the audit log and the actual
  character state silently diverge. This is explicitly the scenario the review brief's hunt list
  named ("Multi-actor race on the SAME target") and asked to confirm as reachable vs.
  theoretical; it is reachable, and not even a rare one — the game's court model explicitly
  produces multiple concurrent officers as the normal case, and a live LARP session (per project
  notes: 35+ players, multiple ST-operated devices/iPads moving through the venue) is exactly the
  kind of environment where two officers acting on a popular target within the same few seconds is
  ordinary operational tempo, not an adversarial edge case.
- **Confidence**: High for reachability (confirmed via direct code/schema reading — no
  restriction, no index, UI explicitly documents multi-holder categories). Not independently
  reproduced live (would require seeding two officers and racing two `POST /` requests against
  the same target with two different actors — the existing AC3 test suite only covers
  same-actor-different-target and same-actor-same-target dedupe, never different-actor-same-target,
  confirming this path has no test coverage either). The mechanism (unsynchronised
  read-modify-write via `$set` on a pre-computed value) is unambiguous from the code, so I'm
  confident in the bug even without a live race reproduction.

## Medium

### 3. `findLatestSession()` has no tiebreak for two `game_sessions` docs sharing a date

- **Severity**: Medium
- **File:line**: `server/routes/office-actions.js:22-28` (`findLatestSession`) and
  `server/routes/game-sessions.js:66-78` (`POST /` — session creation)
- **The triggering input or sequence**: `findLatestSession()` sorts only by
  `{ session_date: -1 }`, with no secondary sort key (e.g. `_id`). `POST /api/game_sessions`
  has no uniqueness constraint on `session_date` — no schema-level check, no Mongo index (checked
  `server/schemas/game_session.schema.js` shape via the route; confirmed no unique index exists
  in `server/index.js`'s startup index-creation block for `game_sessions`). If an ST creates a
  second session doc for the same date mid-session (the hunt brief's own example: correcting a
  session record, or a new date rolling over while old requests are still in flight), two
  `game_sessions` documents can legitimately share `session_date === today`. Which one
  `findOne({session_date:{$lte:today}}, {sort:{session_date:-1}})` returns for a tie is
  implementation-defined (natural/insertion order on this query shape, not a documented Mongo
  guarantee), and — more importantly — is not required to be *stable across requests*: two
  `POST /api/office_actions` calls submitted moments apart, straddling the creation of the second
  record, are not guaranteed to resolve to the same `_id`.
- **The observable consequence**: If two requests resolve to different `game_session_id`s despite
  both being "the current session" from the caller's point of view, the budget and per-target
  dedupe checks (both scoped by `game_session_id`) silently split across two session buckets —
  an actor could get a fresh budget allotment in the second bucket, effectively doubling their
  budget for that boundary window. This is the exact scenario hunt item 3 asked about.
- **Confidence**: Medium — the missing-uniqueness and missing-tiebreak facts are directly verified
  by reading `game-sessions.js` and `office-actions.js`; I did not create a live duplicate-date
  session and race two `POST /api/office_actions` calls across the split to observe the doubled
  budget end-to-end (time-boxed out of this pass), so the "double budget" consequence is reasoned
  from the code rather than empirically confirmed the way finding #1 was.

### 4. Code's stated concurrency rationale ("local dev/test MongoDB is a standalone instance") does not hold for how tests actually run here

- **Severity**: Medium
- **File:line**: `server/routes/office-actions.js:155-159` (comment block introducing the
  insert-then-rank pattern)
- **The triggering input or sequence**: N/A (a factual/design-rationale check, not a runtime
  input). The comment states plainly: "This project's local dev/test MongoDB runs as a
  STANDALONE instance (confirmed live via `hello`), not a replica set — multi-document
  transactions are unavailable there... Using `session.withTransaction` would make this route
  untestable in this project's actual dev environment."
- **The observable consequence**: I ran the same `hello` check the comment claims, against the
  exact connection this project's own `npx vitest run` resolves via
  `server/config.js` → `TM Suite/.env` → `tests/helpers/setup-env.js` (which only overrides the DB
  *name* to `tm_suite_test`, not the URI/host). Result:
  `setName: atlas-k6izx0-shard-0`, three `ac-lt09h9m-shard-00-0{0,1,2}.wbdawii.mongodb.net` hosts —
  this is a **3-node Atlas replica set**, not a standalone instance. I confirmed a local mongod
  *is* separately reachable on `127.0.0.1:27017` (matching the review brief's ground-rules
  description of a Windows service), but nothing in this repo's config wires `MONGODB_URI` to it —
  `TM Suite/.env` (which `server/config.js` reads, since `config.js` resolves the env path as
  `resolve(__dirname, '..', '.env')` from `server/`, i.e. the *root* `.env`, not `server/.env`)
  hard-codes the Atlas connection string, and no OS-level environment variable overrides it (I
  checked — `MONGODB_URI` is unset in the parent shell before `dotenv` loads). So in this
  environment, `npx vitest run` — including the gate command this pass was asked to run — was
  provably exercising Atlas's `tm_suite_test`, a real replica set where `session.withTransaction`
  is available, not the standalone instance the code comment gives as the reason a transaction
  couldn't be used. This doesn't mean transactions were definitely the better choice (the
  insert-then-rank approach could still be preferred for other reasons, e.g. it also needs to
  work against a genuinely standalone deployment if one is ever used), but the stated justification
  is not accurate for the environment its own tests actually run against, and that same
  replica-set-over-WAN environment is exactly what makes finding #1's write-visibility race
  realistic rather than contrived.
- **Confidence**: High that the environment is a replica set as stated (directly verified,
  command output quoted above). Medium on how much this should move severity — it's a
  documentation/rationale accuracy issue more than a functional bug in isolation, but it directly
  undercuts the argument used to justify not closing finding #1's gap with a transaction.

## Low

- **`game_session_id` remains a required schema field the server now ignores.**
  `server/schemas/office_action.schema.js:3,6` still requires `game_session_id` as a string on
  every `POST /api/office_actions`, and `otc-2-office-actions-api.test.js`'s updated comment
  confirms this is understood ("Kept only as a placeholder value now"). Not a bug — just a
  slightly confusing contract (client must send a value that is validated for shape but then
  entirely discarded server-side). [Pass 2]

- **`isDbAvailable()`'s mock shape (item 5 of the hunt list): no gap found.** Read
  `server/tests/issue-1143-db-setup-skip.test.js`'s mock of `../db.js`
  (`connectDb`, `closeDb`, `getCollection`, `getDb`) against what
  `server/tests/helpers/db-setup.js`'s `setupDb()` actually calls
  (`connectDb()` and `getDb()` only — `closeDb`/`getCollection` aren't invoked by `setupDb()`
  itself, `getCollection` is simply part of the real module's shape). The real `db.js` also
  exports `isConnected` and `assertTestDbSafety`, which the mock omits, but neither is called by
  `db-setup.js`'s `setupDb()`/`isDbAvailable()`, so the omission doesn't create a
  mock/real divergence for the code path under test. [Pass 2]

- **Module-load-once `dbAvailable` staleness (item 6 of the hunt list): real but by-design, not a
  defect.** `issue-1143-office-actions-auth-safety.test.js`'s top-level
  `const dbAvailable = await isDbAvailable();` is a point-in-time probe; if the DB connection were
  to drop mid-file (e.g. a transient Atlas network blip during a long sequential run — plausible
  given finding #4 confirms this environment is a WAN-connected Atlas cluster, not local
  loopback), later tests in an already-`skipIf(false)`-committed `describe` block would fail
  messily rather than skip. This is consistent with how most `describe.skipIf` gating patterns
  work (point-in-time, not continuously re-evaluated) and isn't something this diff introduced
  worse than the alternative — flagging for completeness per the hunt list, not as an actionable
  defect. [Pass 2]

- **Route/matcher order and client status-code handling (item 7 of the hunt list): no gap found.**
  `public/js/tabs/office-tab.js:248-250`'s `doAction()` catch block does not branch on HTTP status
  code at all — it unconditionally displays `err.message || 'Action failed.'`. Reordering which
  check fires first (auth check now ahead of the game-phase gate, ahead of id/actor/target
  resolution) changes *which* message a malformed request receives, but nothing in the client
  reads or branches on the status code itself, so there is no reachable "broken client
  expectation" from the reordering. [Pass 2]

## Validation notes

**Files opened**: `server/routes/office-actions.js` (current on-disk version — see note below),
`specs/stories/code-review/issue-1143-diff.txt`, `server/index.js` (index-creation block only, via
grep), `server/tests/helpers/db-setup.js`, `server/tests/helpers/setup-env.js`,
`server/vitest.config.js`, `server/db.js`, `server/config.js`, `server/.env`, `TM Suite/.env`
(root), `server/package.json`, `server/schemas/character.schema.js`,
`server/schemas/player.schema.js`, `server/schemas/office_action.schema.js`,
`server/schemas/game_session.schema.js` (existence only, via glob — not opened in full),
`server/middleware/auth.js`, `server/routes/characters.js` (grep for `court_category` and the
`PUT /:id` handler), `server/routes/game-sessions.js`, `public/js/admin/city-views.js`,
`public/js/editor/identity.js`, `public/js/tabs/office-tab.js`. I did **not** open
`specs/stories/issue-1143-status-actions-auth-safety.md` or `specs/stories/sprint-status.yaml` —
confirmed absent from the diff and did not seek them out, staying within Pass 2's no-story-spec
scope.

**Note on "the diff" vs. the live file**: the on-disk `server/routes/office-actions.js` already
differed from `specs/stories/code-review/issue-1143-diff.txt` *before I touched anything* — a
`git status --short` at the start of this pass showed `M server/routes/office-actions.js`
uncommitted against the diff's post-image, and `git diff server/routes/office-actions.js` showed
exactly the countDocuments→rank rewrite described in this pass's briefing (the author's post-diff
concurrency fix). I reviewed the rank-based version that was already sitting in the working tree;
I did not create that change.

**Commands run, with real results**:

- `npx vitest run tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`
  → `Test Files 4 passed (4)`, `Tests 53 passed (53)`, 15.37s. No skips (DB was reachable this
  run).
- A standalone connectivity script (`node _edge-case-tmp-check.mjs`, written to `server/`,
  deleted after use) ran `db.command({hello:1})` against the exact connection the test suite
  resolves. Result: `setName: atlas-k6izx0-shard-0`, three `wbdawii.mongodb.net` hosts,
  `isWritablePrimary: true` — a replica set, not standalone (finding #4).
- A raw TCP probe (`node -e "net.createConnection({host:'127.0.0.1',port:27017},...)"`) confirmed
  a local mongod **is** separately reachable, but nothing in this repo's env config points at it.
- `node -e "console.log(process.env.MONGODB_URI)"` (pre-dotenv) confirmed no OS-level env var
  overrides the `.env`-sourced Atlas URI.
- A race-reproduction script (`node _edge-case-tmp-race.mjs`, written to `server/`, deleted after
  use) replicated the route's exact insert→find(sort `_id`)→rank→delete algorithm against the
  live `tm_suite_test` collection with an artificial 40ms delay on one request's `insertOne` call,
  budget=1. Result: both requests kept (`rank: 0` each), 2 documents survived against budget 1 —
  the over-accept finding #1 describes.

**Anything I could not run, and why**: I did not reproduce finding #1 through the actual Express
route over HTTP (would require temporarily instrumenting `office-actions.js` with a delay hook,
which felt like a heavier intrusion than the ground rules' "revert one line" allowance
contemplated for a pass whose job is to find bugs, not patch them) — I reproduced the identical
algorithm directly against MongoDB instead, which isolates the actual mechanism (write-visibility
timing) from Express/Supertest plumbing that isn't relevant to it. I did not live-reproduce finding
#2 (different-actor-same-target lost update) or finding #3 (duplicate-date session split) end to
end — both are reasoned from direct code/schema/index reading rather than empirical race
reproduction, and I've marked their confidence accordingly. I did not attempt multi-document
transactions against either the local standalone mongod or Atlas — not needed for any finding
here.

**Modifications**: Two temporary scratch scripts were written directly under `server/` (not
`TM Suite/` root, not sibling repos) to get real Mongo connections without wrestling with
cross-directory ESM resolution from the scratchpad path: `server/_edge-case-tmp-check.mjs` and
`server/_edge-case-tmp-race.mjs`. Both were deleted after use. `git status --short` confirms
`server/` is clean of them:

```
$ git status --short | grep -i edge-case-tmp
(no output)
```

I did not edit any tracked file. The one tracked-file diff visible in `git status` for
`server/routes/office-actions.js` throughout this pass was the pre-existing, not-mine, post-diff
concurrency fix described above — untouched by me, left exactly as found.
