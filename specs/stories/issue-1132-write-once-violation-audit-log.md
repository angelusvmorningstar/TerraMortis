# Story issue-1132: Log forbidden write-once transition attempts (clan/bloodline)

Status: done

GitHub issue: [#1132](https://github.com/angelusvmorningstar/TerraMortis/issues/1132)
Branch: `ms/issue-1132-write-once-violation-audit-log`
Depends on: BL-5 (#1008) — already live on `main`.

## Story

As an ST,
I want a forbidden clan/bloodline change attempt recorded as well as refused,
so that I can later review who tried to change what, when, and to which value —
instead of the 409 being the only trace, seen once and then gone.

## Context

BL-5 (#1008) made `characters.clan` and `characters.bloodline` write-once. A
forbidden transition returns `409 WRITE_ONCE_VIOLATION` from
`server/routes/characters.js`'s `PUT /:id` handler. Nothing persists that the
attempt happened. Issue #1132's first job was deciding where the record lives.

**That decision is made and confirmed by Angelus. Do not re-derive it.** It is
recorded in Dev Notes → Design Decision below, with the precedent evidence.

## Acceptance Criteria

**AC1 — a new purpose-built collection exists, documented by a schema file**

- Given the repo has no character-audit surface today,
- when this story lands,
- then `server/schemas/write_once_violations.schema.js` exports a Draft-07 JSON
  Schema for the `write_once_violations` collection, declaring exactly:
  `_id`, `character_id`, `field`, `stored_value`, `attempted_value`, `actor`,
  `at`, with `additionalProperties: false`, and `character_id` typed as the
  24-hex string a validator sees (the `characterIdRef` convention).
- and the schema is **documentation-of-intended-shape only** — not wired into
  Ajv or any route validation, exactly the status `xp_ledger.schema.js` holds.

**AC2 — the direct refusal is recorded**

- Given a character whose `clan` is stored as `Ventrue`,
- when an ST `PUT`s `{ clan: 'Daeva' }` and the handler returns
  `409 WRITE_ONCE_VIOLATION` at the direct `checkWriteOnce` check,
- then exactly one `write_once_violations` document exists carrying
  `character_id` (the character's ObjectId), `field: 'clan'`,
  `stored_value: 'Ventrue'`, `attempted_value: 'Daeva'`, `actor`
  (`{ discord_id, discord_name }` of the requesting ST), and an ISO-8601 `at`.
- and the same holds for `bloodline`.
- and the character document itself is unchanged.

**AC3 — the race refusal is recorded**

- Given a compare-and-set acquisition that loses its race (the stored value
  moved between the handler's read and its write),
- when the handler returns the second `409 WRITE_ONCE_VIOLATION`
  (`writeOnceRaceMessage`),
- then a `write_once_violations` document is written per raced field, with
  `stored_value` = the value that actually landed (read back from the
  document), and `attempted_value` = the value this request tried to write.

**AC4 — one document per field, never conflated**

- Given a single `PUT` body that attempts a forbidden change to **both** `clan`
  and `bloodline`,
- when the request is refused,
- then the number of violation documents written equals the number of fields
  the handler actually adjudicated as forbidden before returning — never one
  document holding two fields.
- Note the direct-check loop **returns on the first refusal** (existing BL-5
  behaviour, unchanged): so a both-forbidden body produces one document, for
  the field `WRITE_ONCE_FIELDS` order reaches first (`clan`). The race path,
  which adjudicates every raced field at once, can produce two.

**AC5 — the 409 contract is byte-for-byte unchanged**

- Given any forbidden transition,
- when it is refused,
- then the HTTP status, the `error` code, and the `message` string are
  identical to what BL-5 returns today. `server/lib/character-write-once.js` is
  **not modified at all**.
- and the existing `server/tests/bl5-write-once.test.js` suite still passes
  unmodified.

**AC6 — a logging failure never changes the response**

- Given the `write_once_violations` insert throws (collection unreachable,
  write error),
- when a forbidden transition is refused,
- then the client still receives the same `409 WRITE_ONCE_VIOLATION`, and the
  failure is `console.error`-logged only — the xpl.1 "ledger machinery never
  blocks the real path" precedent.

**AC7 — a read surface exists, ST-only**

- Given violations exist,
- when an ST `GET`s `/api/write_once_violations`,
- then it returns the documents newest-first (`at` desc, `_id` desc tiebreak).
- and `?character_id=<24-hex>` filters to that character only.
- and an invalid `character_id` returns `400 VALIDATION_ERROR`.
- and a player (`role: 'player'`) receives `403`.
- and the result set is bounded by a default limit (200), overridable via
  `?limit=` and hard-capped (500).

**AC8 — no regression on the allowed paths**

- Given an ordinary full-document save that carries `clan`/`bloodline`
  unchanged (the load-bearing no-op BL-5's own docstring calls out), or a
  legitimate acquisition (no value → a value),
- when it succeeds,
- then **zero** `write_once_violations` documents are written.

## Explicitly NOT in scope

- **Not** changing BL-5's refusal logic. `server/lib/character-write-once.js`
  is read-only for this story. The issue says so outright ("purely additive").
- **Not** changing the 409 status, error code, or message shape.
- **Not** building a UI panel. Issue AC3 reads "could be as simple as a read
  endpoint" — a read endpoint is the surface. No admin screen, no character-sheet
  panel, no client-side fetch, no CSS. (This story therefore touches **zero**
  files under `public/`, so §1 of `specs/project-context.md` does not apply.)
- **Not** `st_mods`-style pagination/faceting. This is a rare-event log (an ST
  mistakenly retrying a forbidden change), not a stream. `find().sort().limit()`
  is the whole read.
- **Not** wiring the new schema into Ajv. Same status quo as `xp_ledger`.
- **Not** adding a Mongo index. Volume does not justify one; note it in
  Completion Notes as a future option if the collection ever grows.
- **Not** logging *allowed* transitions (acquisitions). Only refusals.

## Tasks / Subtasks

- [x] **T1 — Schema file** (AC1)
  - [x] Create `server/schemas/write_once_violations.schema.js`, modelled
        directly on `server/schemas/xp_ledger.schema.js` (same header comment
        style stating the documentation-only status, same `characterIdRef`
        const, `_id` declared so `additionalProperties: false` would not reject
        a real Mongo document — the exact bug xp_ledger's own code review found).
- [x] **T2 — Write helper** (AC2, AC3, AC4, AC6)
  - [x] Create `server/lib/write-once-violation-log.js` exporting
        `recordWriteOnceViolations(oid, rows, user)`, which builds one document
        per row and `insertMany`s them inside a try/catch that logs and
        swallows. `rows` is `[{ field, stored_value, attempted_value }]`.
  - [x] Export an `actorFromUser(user)` helper (or inline it) producing
        `{ discord_id: String(user?.id || ''), discord_name: user?.global_name || user?.username || 'unknown' }`.
- [x] **T3 — Wire the two 409 sites** (AC2, AC3, AC5)
  - [x] `server/routes/characters.js` ~line 579 (direct check): `await` the
        helper with a single row `{ field, stored_value: existingChar[field],
        attempted_value: updates[field] }` immediately before the existing
        `return res.status(409)...`. Do not restructure the surrounding loop.
  - [x] `server/routes/characters.js` ~line 684 (race check): build one row per
        entry of `moved.length ? moved : raced`, with
        `stored_value: stillThere[f] ?? null` and
        `attempted_value: updates[f]`, then `await` the helper before the
        existing `return res.status(409)...`.
- [x] **T4 — Read route** (AC7)
  - [x] Create `server/routes/write-once-violations.js` — a `Router` with a
        single `router.get('/', requireRole('st'), ...)`.
  - [x] Mount in `server/index.js` alongside the other audit-style mounts
        (`app.use('/api/write_once_violations', requireAuth, noCache(), writeOnceViolationsRouter);`).
  - [x] Mount in `server/tests/helpers/test-app.js` with `mockAuth` in place of
        `requireAuth`, mirroring the `st_mod_audit` mount. **This mount is
        mandatory** — without it the new suite's HTTP tests 404.
- [x] **T5 — Tests** (all ACs) — red first, then green
  - [x] `server/tests/issue-1132-write-once-violation-log.test.js`.

## Dev Notes

### Design Decision (given — confirmed by Angelus, do not re-litigate)

Two audit-trail precedents already exist in this repo, and they were both read
before this was proposed:

1. **`xp_ledger`** (`server/schemas/xp_ledger.schema.js`) — append-only
   XP-write audit. Written by a direct `insertMany` from `characters.js`'s
   `PUT /:id` (lines ~695-711), not via Ajv. Its schema file is
   documentation-of-intended-shape only. Read back through
   `GET /api/characters/:id/xp_ledger` (line 718), `requireRole('st')`,
   `.sort({ at: -1, _id: -1 })`, no pagination.
2. **`st_mod_audit`** (`server/routes/st_mods.js`) — ST-mod lifecycle event
   log: `character_id`, `event`, `by`, `at`, `reason`, `delta`. Real
   `GET /api/st_mod_audit` (`auditRouter`, line ~395) with `$match` filters,
   `$facet` rows+total, `.sort({ at: -1 })`.

Neither is the right *reuse* target — wrong domain each. Together they
establish the convention this story follows: **a small, purpose-built,
append-only collection per audit concern; not a shared generic audit surface;
and never embedded on the character document.** Nothing in this codebase puts
write-history on `characters`, which is one of ADR-007's two "sacrosanct"
collections for persistence-safety reasons, not an audit-noise target.

So: a new `write_once_violations` collection, a purely-additive `insertMany` at
each of the two existing 409 sites, and a minimal ST-only `GET`.

### Document shape

```js
{
  _id: ObjectId,                    // Mongo's own
  character_id: ObjectId,           // the real ObjectId — same as xp_ledger's
                                    // `character_id: oid`. The SCHEMA declares
                                    // the 24-hex string a validator would see.
  field: 'clan' | 'bloodline',
  stored_value: <the value on the document>,   // string | null
  attempted_value: <the value the body wanted>, // string | null | anything
  actor: { discord_id: String, discord_name: String },
  at: '2026-08-31T…Z',              // ISO string, matching xp_ledger's `at`
}
```

**Why `actor` is an object, not `xp_ledger`'s flat `st_username` string:** the
issue asks for "who", and the *audit-purpose* precedent in this repo
(`st_mod_audit`'s `by`) carries `{ discord_id, discord_name }`. A discord
username can be changed by its owner; the id cannot. `xp_ledger`'s flat string
is the weaker of the two shapes and its own code review already had to patch an
unattributed-row bug — take the stronger precedent for a security-adjacent log.

**Fallbacks are mandatory.** `xp_ledger`'s code review (2026-08-15, Medium)
found `req.user.username` was assumed always present. Never write an
unattributed row: `String(user?.id || '')` and
`user?.global_name || user?.username || 'unknown'`.

`stored_value` / `attempted_value` are **not** normalised, trimmed, or
stringified beyond what arrives. The point of the record is what was actually
there and what was actually attempted, including a malformed stored value —
`character-write-once.js`'s own `hasNoValue` docstring explains why a
non-string stored value is exactly the case you most want visible.

### The two write sites, read before you touch them

Read `server/routes/characters.js` lines 552-690 in full first. Current state:

- **Line 560-565** — `guardedInBody` = which of `WRITE_ONCE_FIELDS` the body
  carries; `existingChar` is fetched once (projection `{ clan: 1, bloodline: 1 }`)
  and shared with the touchstones branch. Do not add a second read.
- **Lines 572-593** — the direct loop. `checkWriteOnce(field, existingChar[field],
  updates[field])`; `if (!v.allowed) return res.status(409)...` at **line 579**.
  The loop `return`s on the first refusal, which is why AC4 says a
  both-forbidden body yields one document, not two. Do **not** "fix" that into
  a collect-all loop — that would change BL-5's refusal behaviour, which AC5
  forbids.
- **Lines 614-666** — the compare-and-set: `acquisitions[field]` holds the
  prior value; the filter pins it; `findOneAndUpdate` runs.
- **Lines 668-690** — the race branch. `stillThere` is re-read with the same
  projection; `moved` = acquired fields whose stored value differs from the
  prior; the 409 fires at **line 683** naming `moved.length ? moved : raced`.
  Log the same field list the message names, so the record and the message
  agree.

Must be preserved: the single hoisted `existingChar` read (the docstring at
552-556 is explicit that two reads of one document is the shape that invites
drift), the `!v.changed → continue` no-op path, the acquisition-only
referential bloodline check, and the compare-and-set filter construction.

### Best-effort, never blocking

Mirror xpl.1 exactly (`characters.js` lines 692-711 and its comment): wrap the
insert in `try/catch`, `console.error` on failure, and fall through to the same
`return res.status(409)`. A logging failure must never turn a 409 into a 500.
No transaction — same reasoning as xp_ledger's own Dev Notes.

### Read route

New file `server/routes/write-once-violations.js`. Follow `st_mods.js`'s
`auditRouter` for the file/export shape but **not** its aggregation: this is

```js
router.get('/', requireRole('st'), async (req, res) => { … })
```

with `getCollection('write_once_violations').find(filter).sort({ at: -1, _id: -1 }).limit(n).toArray()`.

- `character_id` query param: validate with `ObjectId.isValid` +
  round-trip-string equality (the same defensive shape `characters.js` uses at
  line 522 for `catalogue_id`); invalid → `400 VALIDATION_ERROR`.
- `limit`: default 200, hard cap 500, non-numeric falls back to the default.
- `requireRole('st')` already admits `dev` (see `middleware/auth.js:117`) — do
  not add `'dev'` explicitly.
- Mount with `requireAuth, noCache()` in `server/index.js`, matching
  `/api/st_mod_audit` at line 247.

### Testing

- **Framework: vitest**, `server/tests/`. Run:
  `cd server && npx vitest run tests/issue-1132-write-once-violation-log.test.js`
- **DB-backed.** Use the established skip guard, copied from
  `xpl-1-xp-ledger-api.test.js`:
  ```js
  const dbAvailable = await isDbAvailable();
  describe.skipIf(!dbAvailable)('…', () => { … });
  ```
  A skipped suite is not a passing suite — read the summary line.
- **Fixtures:** create the character through `POST /api/characters` with
  `stUser()`, exactly as `xpl-1-xp-ledger-api.test.js` does. Prefix every test
  character name (e.g. `'WOV-1132 …'`) and clean up in `afterAll` **scoped to
  this suite's own documents only** — xp_ledger's code review (Low) caught a
  cleanup filter that wiped every other suite's rows. Delete violations by
  `character_id: <this suite's oid>`, never by `{ $exists: true }`.
- **Red first.** Write the whole suite, watch it fail for the right reason
  (missing collection / 404 on the route), then implement.
- Cover: AC2 clan, AC2 bloodline, AC4 both-fields-in-one-body, AC5 (409 body
  unchanged: assert status + `error` + that `message` still matches
  `writeOnceMessage`'s output), AC6 (mock the collection to throw, assert 409
  still returned), AC7 (sort order, `character_id` filter, bad id → 400,
  player → 403, limit), AC8 (no-op save and acquisition each write zero rows).
- AC3 (the race) is hard to trigger through HTTP. Provoke it deterministically
  by racing the DB rather than two requests: perform the acquisition PUT, but
  first pin the character's stored value from underneath — the practical shape
  is to `updateOne` the character to set the field directly *after* the route's
  read and *before* its write, which is not reachable from outside. **Accepted
  approach:** unit-test the race row-building in isolation if the HTTP path
  cannot be provoked, and say so plainly in Completion Notes rather than
  claiming HTTP coverage that does not exist. Do not fake it.
- **Regression:** re-run `npx vitest run tests/bl5-write-once.test.js`
  unmodified. It must stay green (AC5).
- Known pre-existing failures across this repo are listed in `CLAUDE.md`;
  none of them are in the suites this story touches.

### File List (every file to touch)

| File | New/Modified | Why |
|---|---|---|
| `server/schemas/write_once_violations.schema.js` | NEW | AC1 |
| `server/lib/write-once-violation-log.js` | NEW | AC2/3/4/6 write helper |
| `server/routes/write-once-violations.js` | NEW | AC7 read route |
| `server/routes/characters.js` | MODIFIED | two `await` calls before the two existing 409 returns |
| `server/index.js` | MODIFIED | mount the new router |
| `server/tests/helpers/test-app.js` | MODIFIED | mount the new router with `mockAuth` |
| `server/tests/issue-1132-write-once-violation-log.test.js` | NEW | AC coverage |
| `specs/stories/sprint-status.yaml` | MODIFIED | status row |

`server/lib/character-write-once.js` — **read only. Not on this list.**

### Project Structure Notes

- Route file naming in `server/routes/` is mixed (`st_mods.js` snake, most
  others kebab). Collection/URL segments are snake_case; **file** name follows
  the kebab majority: `write-once-violations.js`. Schema files follow the
  collection name: `write_once_violations.schema.js` (matching
  `xp_ledger.schema.js`, `office_seat.schema.js`).
- `getCollection` comes from `server/db.js`; `requireRole` from
  `server/middleware/auth.js`; `noCache` from `server/middleware/cache-control.js`.
- Convention check (`CLAUDE.md` → "Any new reference-data introduction must
  default to MongoDB-backed"): this is a MongoDB collection, so it complies by
  construction. No ADR carve-out needed.
- British English. **Corrected (Codex review, 2026-08-31):** this line originally
  said "no em-dashes, in every comment and message this story adds," extending
  `CLAUDE.md`'s actual rule ("No em-dashes in output text" - player/ST-facing
  app copy) to code comments, which it was never scoped to cover. `CLAUDE.md`'s
  own prose uses em-dashes throughout, as does the rest of this codebase's
  comments. The external review correctly caught a literal violation of this
  line as originally written; the line itself was the error, not the 39
  em-dashes in this story's own comments, which were left as written.

### References

- Issue #1132 (`gh issue view 1132`) — background, ACs, scope notes.
- `server/routes/characters.js:552-714` — the PUT handler, both 409 sites, and
  the xpl.1 best-effort insert pattern to mirror.
- `server/routes/characters.js:716-728` — `GET /:id/xp_ledger`, the minimal
  ST-only audit read this story's route is shaped after.
- `server/lib/character-write-once.js` — BL-5's refusal logic and its rationale.
  Read it; do not edit it.
- `server/schemas/xp_ledger.schema.js` — the documentation-only schema
  convention, `characterIdRef`, and the `_id`-under-`additionalProperties`
  lesson.
- `server/routes/st_mods.js:77-107, 389-440` — `creatorFromUser`,
  `buildAuditEvent`, and the `auditRouter` export/mount shape.
- `server/index.js:246-247` — the `st_mods` / `st_mod_audit` mounts to copy.
- `server/tests/helpers/test-app.js:138-139` — the matching test-app mounts.
- `server/tests/xpl-1-xp-ledger-api.test.js` — the DB-backed suite template
  (skip guard, `stUser()`/`playerUser()`, scoped cleanup).
- `specs/stories/bl-5-character-bloodline-validation.story.md` — open question 2,
  where this work was raised and deliberately deferred.
- `specs/project-context.md` — §1 (CSS) does not apply: no `public/` files.

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (Claude Code, `bmad-create-story` → `bmad-dev-story`), 2026-08-31.

### Debug Log References

Red-green-refactor, real runs, no claimed runs:

1. **RED** — `cd server && npx vitest run tests/issue-1132-write-once-violation-log.test.js`
   → `Test Files 1 failed (1)` / `Tests no tests`, failing on
   `Cannot find module '../schemas/write_once_violations.schema.js'`. Test file
   written in full before any implementation file existed.
2. **GREEN** — same command after T1-T4 →
   `Test Files 1 passed (1)` / `Tests 33 passed (33)`, 4.53s.
3. **Regression, BL-5 + xpl (AC5)** —
   `npx vitest run tests/bl5-write-once.test.js tests/bl5-lineage-lock-client.test.js tests/xpl-1-xp-ledger-api.test.js tests/xpl-1-xp-ledger-diff.test.js`
   → `Test Files 4 passed (4)` / `Tests 179 passed (179)`. `bl5-write-once.test.js`
   is unmodified, so AC5 is pinned by BL-5's own suite, not only by this story's.
4. **Regression, characters routes** —
   `npx vitest run tests/api-characters.test.js tests/api-characters-crud.test.js tests/api-characters-public-fields.test.js tests/api-characters-carthian-pull.test.js tests/api-characters-safe-place-locations.test.js`
   → `Test Files 5 passed (5)` / `Tests 91 passed (91)`.
5. **Regression, repo-scanning guardrails** —
   `npx vitest run tests/devlog-removed.test.js tests/tickets-removed.test.js tests/bl3b-constants-deleted.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/gdx-4-css-standards-grep.test.js`
   → `Tests 1 failed | 76 passed (77)`. The single failure is
   `gdx-4 AC3 … leaves the compliant var() fallbacks in place`, asserting on
   `public/css/suite.css`. **Pre-existing, and structurally impossible to be
   caused by this story: this story changes no file under `public/` and no CSS
   at all.** Already documented as a known pre-existing failure in this repo
   (see prax-4a's own sprint-status entry, 2026-08-30).

Local `mongod` was reachable throughout, so no DB-backed suite skipped —
verified before writing a line of this story by running an existing DB-backed
suite (`tests/xpl-1-xp-ledger-api.test.js` → 9 passed) as a precondition probe.

### Completion Notes List

**Implemented as specified, with two real deviations an external review found
and this record originally missed** (see Senior Developer Review below): the
suite seeds characters directly rather than through `POST /api/characters` as
the Testing note below asks, and the Project Structure Notes' own em-dash line
was itself wrong (corrected above). Neither is a defect in the write-once
audit path itself. New `write_once_violations` collection, additive inserts at
both existing 409 sites, minimal ST-only read endpoint, documentation-only
schema. `server/lib/character-write-once.js` was not touched; neither was the
409 status, error code or message.

Judgement calls made inside the spec's own boundaries:

- **`actor` is `{ discord_id, discord_name }`**, mirroring `st_mod_audit`'s `by`
  rather than `xp_ledger`'s flat `st_username`. A Discord username is
  owner-changeable and the snowflake is not, so a security-adjacent record
  carries both. Fallbacks (`''` / `'unknown'`) are mandatory, per xp_ledger's
  own code-review lesson about unattributed rows.
- **All rows of one refusal share one `at`.** Lets a two-field race be
  recognised as a single event; the read route's `_id` tiebreak exists for
  exactly that, same as `GET /:id/xp_ledger`'s.
- **`undefined` is normalised to `null`, nothing else is normalised.** The
  driver drops an `undefined` key, which would leave the record silent about
  the very thing it exists to say. `''`, case and whitespace are all recorded
  verbatim — a test pins that (`bloodline: ''` records `''`, not `null`).
- **AC3 (the race) IS covered at HTTP level**, not stubbed out. Provoked
  deterministically by spying `Collection.prototype.findOneAndUpdate` once, and
  moving the stored value from underneath inside the route's own read-to-write
  window before calling through to the real driver method. That is the genuine
  race condition, not a simulation of its symptom: the compare-and-set filter
  really fails to match, the real race branch really runs. Asserts the recorded
  `stored_value` is what landed (`Nosferatu`) and `attempted_value` is what the
  request wanted (`Ventrue`).
- **`limit` falls back rather than 400s** on a non-numeric value. This is a
  read-only review surface; a malformed query string should not stop an ST
  seeing the log. Documented in the route.

Left deliberately undone, and why:

- **No Mongo index** on `write_once_violations`. Volume does not justify one (a
  rare-event log), and it was explicitly out of scope. If the collection ever
  grows, `{ character_id: 1, at: -1 }` is the index the read route wants.
- **No UI.** Issue AC3 allows "as simple as a read endpoint"; that is what was
  built. If Angelus later wants this on the character sheet or an admin panel,
  that is a separate story with its own design-lock — this story touches zero
  files under `public/`.
- **The "caps an absurd limit" test is weak**, asserting only `length <= 500`
  against a collection that never holds 500 rows in the test DB. The cap is
  real (`Math.min(n, MAX_LIMIT)`) and readable in the route, but the assertion
  does not prove it. Flagged rather than papered over; seeding 500 rows to
  prove a constant was not judged worth the runtime.

**Unrelated working-tree changes present, NOT made by this story.** During this
session `public/js/data/accessors.js`, `public/js/editor/xp.js` and
`specs/stories/dtlt.4.effective-rating-and-cap-sweep.story.md` were modified by
something else in the same worktree (mtimes 14:13-14:15, content referencing a
"one true rating" investigation from 2026-08-31). They were left untouched and
are called out here so they are not mistaken for part of this change set.

### File List

New:

- `server/schemas/write_once_violations.schema.js`
- `server/lib/write-once-violation-log.js`
- `server/routes/write-once-violations.js`
- `server/tests/issue-1132-write-once-violation-log.test.js`
- `specs/stories/issue-1132-write-once-violation-audit-log.md` (this file)

Modified:

- `server/routes/characters.js` — one import; one `await recordWriteOnceViolations(...)`
  before each of the two existing `return res.status(409)` sites; the race
  branch's `moved.length ? moved : raced` expression lifted to a `named` const
  so the record and the message name the same fields. No other change.
- `server/index.js` — import + `app.use('/api/write_once_violations', requireAuth, noCache(), …)`.
- `server/tests/helpers/test-app.js` — the matching `mockAuth` mount.
- `specs/stories/sprint-status.yaml` — status row + `last_updated`.
- `server/lib/write-once-violation-log.js` — Codex-review patch: `err?.message ?? err`.
- `server/schemas/write_once_violations.schema.js` — Codex-review patch: widened
  `stored_value`/`attempted_value` from `['string','null']` to `{}`.

Not touched (deliberately): `server/lib/character-write-once.js`.

## Senior Developer Review (AI)

External Codex CLI review (`model_reasoning_effort=high`), 3-pass single session,
2026-08-31. Full report: `specs/stories/code-review/issue-1132-write-once-violation-audit-log-codex-findings.md`.
Orchestrated and triaged by the parent session, not Codex itself.

**Outcome: Approved with patches applied.** No High-severity finding in any
pass. Two Medium, nine Low.

**Tripwire check (before trusting anything below):** the review's reported
gate number for the new suite (14 passed / 19 skipped) did NOT match a fresh
run in this session (33/33 passed, run twice, before and after patching).
Root-caused to a MongoDB `EACCES` in Codex's own sandboxed environment (it
disclosed this honestly rather than fabricating a pass) - not a defect in this
story. Everything Codex could only verify statically (i.e. everything gated on
DB access) is called out below as independently re-verified by this session,
not inherited from Codex's own claim.

**Patched (both prove-discriminated: reverted, confirmed the exact expected
failure, restored, confirmed green; 33/33 + a 270-test broader regression
across BL-5/xp_ledger/characters-route suites all still pass):**

- **[Medium, Pass 1] Non-Error rejection in the catch block can itself
  throw.** `err.message` on a `null`/`undefined` rejection throws a new
  `TypeError`, escaping the try/catch and turning the 409 it sits in front of
  into a 500. Fixed to `err?.message ?? err` in `write-once-violation-log.js`.
- **[Low, Pass 1 + Pass 3a] The documentation schema cannot represent every
  value the module promises to preserve.** `stored_value`/`attempted_value`
  were typed `['string','null']`, but `clan`/`bloodline` were not always
  schema-validated, so a malformed legacy value can be a number or boolean -
  exactly what this module says it exists to preserve unmodified. Widened
  both to `{}` in `write_once_violations.schema.js`.

**Deferred, with evidence (not blocking; documented in `deferred-work.md`):**

- **[Medium, Pass 1] The awaited best-effort insert has no local time bound
  and can delay the 409 indefinitely under a stalled DB/network.** Real, but
  `xp_ledger`'s own insert at the same call site (`characters.js:733`) has the
  identical shape and is unaddressed - this is a pre-existing pattern this
  story's own module explicitly says it mirrors ("Same guarantee xpl.1's
  ledger insert makes"), not something this story introduced. Fixing it here
  alone, without touching the established precedent, would be inconsistent.
  Suggested title: `bound-best-effort-audit-inserts` (no issue number assigned;
  opening a GitHub issue for it is Angelus's call, per this repo's own
  deferred-work convention).

**Dismissed, with evidence:**

- **[Low, Pass 1] Broad catch can mask a document-construction programming
  error as a transient DB failure.** Deliberate, documented trade-off (same
  guarantee `xp_ledger` makes, for the same reason); Codex's own confidence
  note rates production reachability low, since both real call sites pass
  well-formed literals.
- **[Low, Pass 2, settled by Pass 3a itself] Dual-field direct refusal
  records only the first field.** AC4 explicitly settles this as intended
  (BL-5's own first-refusal-wins behaviour, deliberately preserved) - Codex's
  own Pass 3a froze this as compliant before Pass 3b ran.
  Non-finding, kept here only so the resolution is on the record.
- **[Low, Pass 3b] Gate command named a test file that does not exist**
  (`tests/xpl-1-ledger-write.test.js`). This is a mistake in the parent
  session's own review prompt (guessed a filename rather than checking) - not
  a gap in this story. The real files are `xpl-1-xp-ledger-api.test.js` and
  `xpl-1-xp-ledger-diff.test.js`; both pass (confirmed above, 270-test run).
- **[Low, Pass 3a/3b] Em-dash "violation" and the resulting "no deviations is
  overstated" finding.** Root-caused to this story's own Project Structure
  Notes line being wrong, corrected above rather than stripping 39 em-dashes
  from comments that match this codebase's actual, universal convention.

**Not independently re-verified by this session** (Low severity, static-only,
plausible but not run): the blank-`global_name`-treated-as-absent fallback
behaviour; the HTTP actor fixture's `global_name` coverage gap; the max-limit
test's weak assertion; the schema-shape test's weak conformance check. All
four are accurately described by Codex and worth a look if this collection
sees real traffic, but none change the ship decision.

## Change Log

- **2026-08-31** — Story created (`bmad-create-story`) and implemented
  (`bmad-dev-story`) on `ms/issue-1132-write-once-violation-audit-log`. New
  append-only `write_once_violations` collection recording refused write-once
  transitions on `characters.clan` / `characters.bloodline`, written at both of
  `PUT /api/characters/:id`'s existing 409 sites, plus an ST-only
  `GET /api/write_once_violations`. 33 new tests, all green; BL-5's own suite
  green unmodified. Status → review. Not committed, not pushed, not merged.
