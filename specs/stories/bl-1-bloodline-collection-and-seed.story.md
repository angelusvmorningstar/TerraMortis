# Story BL-1: The `bloodlines` collection, its schema, and a seed from the constants

Status: done

> **Epic BL** — issue **#1008**, "Migrate bloodlines to MongoDB so they can be added without a
> deploy". First of five stories. Design decisions were ruled by Angelus on 2026-08-10 following a
> data-steward consult; they are recorded in `D:\Terra Mortis\data-map.md` (TM Suite section,
> "Bloodlines", plus **drift pattern #15**) and restated below. **Do not re-decide them.**
>
> **Deploy:** branch from `main`, PR direct to `main`, never through `dev` (which carries the oath
> work behind #1128). No push or merge without Angelus's explicit word in his current message.
>
> **Timing:** Epic BL is agreed for **after Game 7 (Sat 2026-08-15)**. This story writes no client
> code and changes no rendering, so landing it early is low-risk — but BL-2 is the one that must
> not be rushed, and BL-1 exists to make BL-2 safe.

## Story

As the Storyteller,
I want bloodline reference data to live in a MongoDB collection, seeded from the current constants
and readable over the API,
so that a later story can make the app read bloodlines from the database instead of a code-baked
enum, and adding a bloodline stops requiring a Netlify deploy.

## Why this story exists (the defect it is the first step in fixing)

Bloodlines are a static JS enum (`public/js/data/constants.js`). Adding one is a code change, which
produced a live defect this epic was filed from: Ocka Keats carried
`bloodline: "Hounds of Actaeon"` in production for two weeks while the constant defining it sat
unmerged, so `clanDiscList` silently fell through to the plain Gangrel list and her disciplines
cost 4 XP/dot instead of 3. That specific character is now fixed (hotfix `4726a1bf`, merged and
verified live 2026-08-10) — **this epic stops it recurring.**

## Acceptance Criteria

1. **Collection + schema.** A `bloodlines` collection with a Draft-07 schema at
   `server/schemas/bloodline.schema.js`, following the shape of
   `server/schemas/equipment_catalogue.schema.js`:
   - `_id: {}` (ObjectId, injected on insert)
   - `name: { type: 'string', minLength: 1 }` — the display name, and **the canonical key**
   - `slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' }` — stable kebab id for future
     internal joins; **nothing references it yet and nothing may start to in this story**
   - `clan: { type: 'string', enum: [...the five clans..., ] }` — reuse the exact enum from
     `character.schema.js:62` so the two cannot drift
   - `disciplines: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } }`
   - `active: { type: 'boolean' }` — soft-retire rather than delete
   - `notes: { type: ['string','null'] }`
   - `created_at` / `updated_at` strings, as ECM does
   - `additionalProperties: false`
2. **The four-discipline constraint is deliberate and must be enforced.** Angelus: four
   disciplines is *a rule of the game*, not an artefact of the current data. All 23 current
   entries comply (verified 2026-08-10). A schema that permits three would be describing the data
   rather than the rules.
3. **Unique index on `name`.** Created by the seed script (or a companion migration in the same
   PR), case-sensitive, so a duplicate cannot be inserted. `name` is the key that
   `characters.bloodline` matches against in BL-5.
4. **Seed script** at `server/scripts/seed-bloodlines.js`, following
   `server/scripts/backfill-free-grants.js` — the repo's #826-hardened pattern:
   - **`--dry-run` is the DEFAULT**; `--apply` is required to write. Print
     `Mode: DRY RUN (read only; pass --apply to write)` exactly as that script does.
   - **Idempotent**: a second `--apply` run matches zero documents to insert and reports so.
   - Reads `BLOODLINE_DISCS` and `BLOODLINE_CLANS` from `public/js/data/constants.js` as its
     source. `slug` is derived from `name` (lowercase, non-alphanumerics to hyphens).
   - Reports a per-bloodline table and a summary count in both modes.
   - Uses `MONGODB_URI` via the repo's dotenv-first convention; honours `MONGODB_DB` so it can be
     pointed at `tm_suite_test`.
5. **Seed integrity assertions — the script fails loudly rather than writing a partial truth.**
   Before inserting anything, in dry-run and apply alike, it must verify and report:
   - every bloodline in `BLOODLINE_DISCS` has exactly 4 disciplines (**expect 23**);
   - every name in `BLOODLINE_CLANS` has a `BLOODLINE_DISCS` entry, and vice versa — these are two
     hand-maintained structures that can disagree, and a name in one but not the other is the
     exact drift that produced this epic;
   - every `clan` key in `BLOODLINE_CLANS` is one of the five in `character.schema.js:62`.
   Any failure aborts with a non-zero exit and writes nothing.
6. **Live-value cross-check (read-only, reported not enforced).** The script reports how many
   distinct `characters.bloodline` values exist and how many resolve against the seed set.
   **Expected today: 13 holders, 13/13 resolving.** A non-resolving value is printed by character
   name. This does not block the seed — it is the evidence BL-5 will need before it can turn on
   validation, captured while someone is looking.
7. **Read-only route.** `GET /api/bloodlines` (list) and `GET /api/bloodlines/:id` (single),
   mounted in `server/index.js`. Reads may be public in the ECM manner (the player app will need
   them in BL-2 without a token); **no POST, PATCH or DELETE in this story** — writes are BL-4.
8. **Nothing reads the collection yet.** No client file changes. `clanDiscList` and every consumer
   of `BLOODLINE_DISCS`/`BLOODLINE_CLANS`/`APPROVED_BLOODLINES` are untouched and still read the
   constants. This story is additive and inert by design; the app behaves identically before and
   after.
9. **Tests** (targeted vitest, `server/tests/`; the full suite is NOT a gate — see Dev Notes):
   - schema accept/reject matrix: 4 disciplines accepted, 3 and 5 rejected, unknown clan rejected,
     unknown top-level property rejected, missing `name` rejected;
   - the seed's derivation and integrity checks as pure functions where possible (extract
     `deriveSlug` and the cross-check so they are testable without a database);
   - route tests following the existing pattern for `GET` list/single including a 404 on a
     malformed id;
   - per the **#826 post-mortem**: at least one test that runs the script's actual `main()`
     against `tm_suite_test`, not merely its helpers.

## What this story is NOT

Each is a named later story; do not absorb any of them.

- **No cache module, and no change to `clanDiscList`** — that is **BL-2**, and it carries a
  data-lock because its failure mode is silently-wrong XP.
- **No retirement of the constants** and no rewiring of the five remaining readers — **BL-3**.
- **No admin CRUD, no write endpoints, no WS broadcast** — **BL-4**. (ECM wired its broadcast in
  its first story; do **not** copy that here. There is no consumer until BL-2, and an unused
  broadcast is a claim the code makes and cannot keep.)
- **No validation of `characters.bloodline`** — **BL-5**, and only after AC 6's cross-check has
  been seen to pass.
- **No `wizard.js` work.** It reads `BLOODLINE_CLANS` at `:118` but has **zero importers**
  (verified 2026-08-10) — it is dead. Do not wire it, do not migrate it; it belongs to #1095.
- **No bane/gift modelling.** Deferred by ruling until a bloodline actually has one.
- **No running of `--apply` against live data as part of this story's implementation.** Building
  and dry-running the script is in scope; the real seed is an operational act for Angelus.

## Tasks / Subtasks

- [x] Task 1 (AC 1, 2): `server/schemas/bloodline.schema.js`, reusing the clan enum from
      `character.schema.js:62` by import rather than by copy if that file exports it; if it does
      not, note that in the Dev Agent Record rather than duplicating silently.
- [x] Task 2 (AC 4, 5, 6): `server/scripts/seed-bloodlines.js`, dry-run default, integrity
      assertions first, live cross-check reported.
- [x] Task 3 (AC 3): unique index on `name`.
- [x] Task 4 (AC 7): read-only route + mount in `server/index.js`.
- [x] Task 5 (AC 9): tests, including a real `main()` run against `tm_suite_test`.
- [x] Task 6: dry-run the seed against `tm_suite_test`, then against live **read-only** (dry-run
      makes no writes), and paste both summaries into the Dev Agent Record.
- [ ] Task 7: PR to `main` (Angelus's word). *(GATED — not started; awaiting explicit instruction.)*

## Dev Notes

### The rulings, restated so they are not re-litigated

| Decision | Ruling | Why |
|---|---|---|
| `characters.bloodline` type | **Stays a plain name string.** NOT an ObjectId FK. | Drift pattern #2 (ObjectId-vs-string fragmentation) has bitten this ecosystem **four times**. Converting 13 live string values invites the fifth. Names stay human-readable in exports, backups and the PDF generator. |
| `BLOODLINE_CLANS`, `APPROVED_BLOODLINES` | **Derived reads, never stored.** | They are currently two hand-maintained structures that can disagree with `BLOODLINE_DISCS`; the Actaeon commit had to edit both. Deriving deletes the drift class. |
| `disciplines` length | **Exactly 4, enforced.** | A rule of the game (Angelus). |
| Banes / gifts | **Deferred.** | No bloodline has one; a field with no data rots. |

### The precedents, verified

- **Schema**: `server/schemas/equipment_catalogue.schema.js` — Draft-07, `_id: {}`, `required`,
  `additionalProperties: false`, an `UPDATABLE_FIELDS` allowlist exported alongside (BL-4 will
  need that; BL-1 does not).
- **Route**: `server/routes/equipment-catalogue.js` — built by a **factory taking `requireAuth`**
  so the test app can inject mock auth, mounted at `server/index.js:87` as
  `app.use('/api/equipment_catalogue', buildEquipmentCatalogueRouter(requireAuth))`. Note this
  differs from the parent-mount pattern used by most routes (`index.js:97-102`) precisely because
  reads are public and writes are gated. BL-1 is reads-only, so a plain router is acceptable — but
  if you choose the plain form, BL-4 will have to convert it. **Prefer the factory now.**
  Its `:id` handler 404s on a malformed ObjectId rather than 400ing, so a prober cannot
  distinguish "bad id" from "no such id"; copy that.
- **Seed/migration script**: `server/scripts/backfill-free-grants.js` — dry-run default,
  `--apply` to write, idempotent, dotenv-first, usage block in the header comment, `main()` at the
  bottom with `.catch(err => { console.error(err); process.exit(1); })`.

### Current state of the data (measured 2026-08-10, re-verify before seeding)

- 23 bloodlines in `BLOODLINE_DISCS` after the Actaeon hotfix; **all carry exactly 4 disciplines**.
- `BLOODLINE_CLANS` has no name lacking a `BLOODLINE_DISCS` entry.
- 13 characters carry a non-empty `bloodline`, each a distinct value; **13/13 resolve** post-hotfix.
- `characters.bloodline` is declared `{ type: ['string','null'] }` at `character.schema.js:64` —
  unconstrained, in contrast to `clan` at `:62` which has a proper five-value enum.

### Environment and hard rules

- **The full test suite is not a gate** — 4 permanent reds (#1116, #1115), a collection error
  (#1125), and with mongod absent **1074 tests silently skip** and the run reports success
  (#1117). Run only your own specs plus any you touch: `cd server && npx vitest run <files>`.
  Never pipe through `tail` (it masks the exit code).
- Server is ESM (`"type": "module"`). Local dev: root `.env` is active, `node index.js` from
  `server/`.
- **Never point the seed at live with `--apply`** during implementation. `MONGODB_URI` is live;
  `MONGODB_DB=tm_suite_test` redirects. There is no `SANDBOX_URI` in this path.
- British English, no em-dashes in any string the app or a script prints.
- Branch from `main`; PR to `main`; no push or merge without Angelus's explicit word.

### References

- Issue **#1008**; epic registered in `specs/stories/sprint-status.yaml` under `epic-bl`
- `D:\Terra Mortis\data-map.md` — TM Suite section "Bloodlines"; **drift pattern #15** (a missing
  lookup degrading to a plausible neighbouring value); drift pattern #2 (ObjectId-vs-string)
- `public/js/data/constants.js:50` (`BLOODLINE_DISCS`), `:83` (`APPROVED_BLOODLINES`), `:85`
  (`BLOODLINE_CLANS`)
- `public/js/data/accessors.js:14-25` (`clanDiscList`, `isInClanDisc` — **read for context, do not
  modify**), `public/js/editor/edit.js:654` (the XP multiplier this eventually protects)
- `server/schemas/character.schema.js:62` (clan enum), `:64` (bloodline, unconstrained)
- Precedents: `server/schemas/equipment_catalogue.schema.js`,
  `server/routes/equipment-catalogue.js`, `server/index.js:81-87`,
  `server/scripts/backfill-free-grants.js`
- Hotfix that unblocked this story: `4726a1bf` (PR #1131)

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5`), via `bmad-dev-story` inside `bmad-loop`. 2026-08-10.

### Debug Log References

**Seed dry-run against `tm_suite_test`** (`MONGODB_DB=tm_suite_test node scripts/seed-bloodlines.js`,
run from `server/`; per-bloodline table elided, all 23 rows read "would insert"):

```
Mode: DRY RUN (read only; pass --apply to write)
Target DB: tm_suite_test
Integrity: 23 bloodline(s) in BLOODLINE_DISCS.
Integrity: OK (4 disciplines each, both structures agree, clans valid, slugs unique).
Summary: 23 bloodline(s) in source; 0 already present; would insert 23.
Live cross-check: 0 character(s) carry a bloodline across 0 distinct value(s); 0/0 resolve against the seed set.
```

**Apply, then re-apply, against `tm_suite_test`** — the idempotency proof outside the test harness:

```
[first]  Summary: 23 bloodline(s) in source; 0 already present; inserted 23.
[second] Summary: 23 bloodline(s) in source; 23 already present; inserted 0.
```

**Seed dry-run against live `tm_suite`** (read-only; no `--apply`, nothing written):

```
Mode: DRY RUN (read only; pass --apply to write)
Target DB: tm_suite
Integrity: 23 bloodline(s) in BLOODLINE_DISCS.
Integrity: OK (4 disciplines each, both structures agree, clans valid, slugs unique).
Summary: 23 bloodline(s) in source; 0 already present; would insert 23.
Live cross-check: 13 character(s) carry a bloodline across 13 distinct value(s); 13/13 resolve against the seed set.
```

AC 6's expectation — 13 holders, 13/13 resolving — is met exactly. No non-resolving values, so BL-5
has a clean slate to validate against whenever it runs.

**Boot smoke** (`node index.js`, live DB, read-only): `/api/health` 200, `GET /api/bloodlines` 200
returning `[]` (the live collection does not exist yet — the seed is an operational act, not part of
this story), `GET /api/bloodlines/nope` 404 `NOT_FOUND`. The local server processes were stopped
afterwards.

**Tests** (targeted, per the story's Environment note — the full suite is not a gate):

```
npx vitest run tests/bl1-bloodline-schema.test.js tests/bl1-seed-bloodlines.test.js \
  tests/bl1-bloodlines-api.test.js tests/api-characters.test.js tests/api-characters-crud.test.js \
  tests/api-characters-public-fields.test.js tests/issue-868-ecm-1-equipment-catalogue-api.test.js
→ Test Files 7 passed (7) · Tests 134 passed (134)
```

The regression selection is the touched surface: `character.schema.js` (the CLAN_NAMES extraction),
`tests/helpers/test-app.js` (the new mount, which every API suite imports), and the ECM suite as the
neighbour of the mount that was edited.

**One pre-existing red, confirmed unrelated.** `tests/issue-837-xp-totals-deprecation.test.js` fails
to parse with `SyntaxError: Invalid or unexpected token` before it runs a single test. Verified not
mine: with `schemas/character.schema.js` stashed back to HEAD the failure is byte-identical. It is
one of the known permanent reds this story's Environment note warns about. Not fixed here; out of
scope.

### Completion Notes List

**Deviations and judgement calls, each deliberate:**

1. **`character.schema.js` did not export its clan enum**, so Task 1's preferred branch was not
   available as written. Rather than duplicate the five clans silently (the outcome the task told me
   to avoid), I extracted `export const CLAN_NAMES` and rebuilt the character enum as
   `[...CLAN_NAMES, '', null]`. Behaviour is byte-identical — same five values, same order, same
   tolerance of `''`/`null` on a character. `bloodline.schema.js` imports `CLAN_NAMES` unmodified,
   because a bloodline always belongs to a real clan. A test pins all three facts so the two schemas
   cannot drift apart later.

2. **`deriveSlug` strips diacritics instead of hyphenating through them.** AC 4 says "lowercase,
   non-alphanumerics to hyphens", which taken literally makes `Lidérc` → `lid-rc`. That is a legal
   kebab string and a nonsense identifier. The implementation does NFD-normalise, drop `\p{Mn}`
   combining marks, then hyphenate — giving `liderc`. A test asserts every one of the 23 real names
   derives a slug matching the schema's own pattern.

3. **Two integrity checks beyond AC 5's three.** A name claimed by two clans, and two names that
   collapse to the same slug. Both are the same class of failure AC 5 exists to catch (a hand-
   maintained structure quietly disagreeing with itself), both are cheap, and both abort before any
   write. AC 5's own three are implemented as specified.

4. **The seed validates every built document against `bloodline.schema.js` before inserting.** BL-1
   has no write route, so without this the schema would be inert decoration that nothing exercises
   in production code. This makes it load-bearing on the one path that does write.

5. **`main(argv, opts)` takes `{ closeConnection }`.** AC 9 requires a test that runs the real
   `main()`, but vitest runs every server suite in one fork sharing one Mongo connection, and
   `main()` closes the connection in its `finally`. Default is `true` (the CLI behaviour is
   unchanged); the test passes `false`. Without this the AC-9 test would close the connection out
   from under every suite that ran after it.

6. **The route is a factory taking an `authMiddleware` it does not use**, per the story's explicit
   "Prefer the factory now" — BL-4 adds write handlers in place rather than converting the mount in
   both `index.js` and `test-app.js`. This is a deliberate exception to the same reasoning that
   rules out the WS broadcast: an unused parameter costs one line and one comment, whereas an unused
   broadcast fires events at listeners that will never exist.

7. **No cache-control middleware on the mount.** `index.js` has a Cache-Control discipline for
   slowly-changing read endpoints, and bloodlines qualify, but the ECM precedent this story names —
   the only other public-read collection mount — has none. Matched the precedent rather than
   inventing a difference. If BL-2 wants `private, max-age=300` it can add it with a consumer in
   hand to measure.

8. **`required` is `['name', 'slug', 'clan', 'disciplines']`.** `active`, `notes`, `created_at` and
   `updated_at` are optional. The seed always writes `active: true`, but requiring it would
   pre-constrain BL-4's PATCH shape for no benefit today.

**Scope held.** No client file was touched. `clanDiscList`, `BLOODLINE_DISCS`, `BLOODLINE_CLANS`,
`APPROVED_BLOODLINES` and all their readers are untouched and still authoritative — the app behaves
identically before and after. No write endpoints, no cache module, no WS broadcast, no
`characters.bloodline` validation, no `wizard.js`. `--apply` was never pointed at live; the live run
was dry-run only, and the live `bloodlines` collection does not exist yet.

**The operational act that remains** (not part of this story, and not to be done before the PR is
merged): `node server/scripts/seed-bloodlines.js --apply` against live, run from `server/` with
`MONGODB_DB` unset.

### File List

New:

- `server/schemas/bloodline.schema.js`
- `server/scripts/seed-bloodlines.js`
- `server/routes/bloodlines.js`
- `server/tests/bl1-bloodline-schema.test.js`
- `server/tests/bl1-seed-bloodlines.test.js`
- `server/tests/bl1-bloodlines-api.test.js`

Modified:

- `server/schemas/character.schema.js` — extracted and exported `CLAN_NAMES`; `clan` enum now built
  from it
- `server/index.js` — import + mount `/api/bloodlines`
- `server/tests/helpers/test-app.js` — same mount for the test app
- `specs/stories/bl-1-bloodline-collection-and-seed.story.md` — this record
- `specs/stories/sprint-status.yaml` — status transitions

## Senior Developer Review (AI)

**Reviewer:** internal 3-layer adversarial review, run in-session as parallel Opus subagents.
Angelus chose internal over Codex because he is remote and cannot do the paste round-trip.
**Date:** 2026-08-10. **Outcome:** Changes Requested → all requested changes applied → **Approve**.

**Layers**

| Layer | Inputs | Raised |
|---|---|---|
| Blind Hunter | the diff only — no spec, no repo access | 19 |
| Edge Case Hunter | the diff + full repo read access, no spec | 15 |
| Acceptance Auditor | the diff + the story + project standards | 7, all Low, all disclosed deviations |

**Verification before triage.** Three of the most severe findings were wrong, and would have led to
bad patches if taken at face value:

- *"`withObjectId` throws a BSONError on a 12-character id, giving 500 instead of 404."* **False on
  this driver.** Checked directly: `ObjectId.isValid('abcdefghijkl')` returns `false` on mongodb
  7.1.1, so the `||` short-circuits and the constructor is never reached. The reviewer flagged its
  own uncertainty about the driver major; the check settled it.
- *"Async handlers have no error path — a DB failure hangs the request."* **Moot.** Express 5.2.1
  auto-forwards rejected promises from handlers.
- *"The integrity gate covers two of the three hand-maintained constants; `APPROVED_BLOODLINES` is
  unchecked."* **False.** `constants.js:84` defines it as `Object.keys(BLOODLINE_DISCS).sort()` — it
  is derived, and cannot disagree with the map it is derived from.

Two other claims were verified as **real** by the same check: an UPPERCASE hex ObjectId does 404 for
a document that exists, and `CORE_DISCS` / `RITUAL_DISCS` do exist and can back a discipline-name
check.

### Findings patched

Each has a test, and each test was proved to discriminate — the fix was reverted, the named test
was run, it failed, and the fix was restored. All eleven reverts failed their target test.

1. **[High] A pre-existing document with the same name but different content was never reconciled or
   reported.** `seedBloodlines` keyed idempotency on `name` alone, so a document already in Mongo
   with the wrong clan or discipline list printed as `present`, the summary said `inserted 0`, and
   the runbook's own idempotency check ("confirm inserted 0") read as confirmation that everything
   was correct. That is the #1008 defect living in the database instead of in the constants, wearing
   the seed script's green tick. The gates protected the source and could not see it. Now the script
   reads full documents and reports three states the name check missed: `DIFFERS` (present but
   disagreeing, listed field by field), `orphans` (in the collection, not in the source, and still
   served by the public route), and `duplicateNames` (which would make `createIndex` fail). Nothing
   is silently overwritten — which side is right is a human call and BL-4 owns edits.
2. **[Medium] `--apply` could fail on a `createIndex` that dry-run had reported as clean.** Duplicate
   names already in the collection are now detected in both modes and abort `--apply` by name,
   before any write, instead of surfacing as a raw E11000.
3. **[Medium] Discipline *values* were unchecked.** The gate enforced the count; `['Celerity',
   'Celerity', 'Auspex', 'Vigor']` passed both gates. A `Vigor`-for-`Vigour` typo is drift pattern
   #15 arriving through the discipline field and degrading exactly as quietly. The gate now checks
   every entry against `CORE_DISCS + RITUAL_DISCS`, rejects repeats and empty strings. Deliberately
   **not** an enum in the JSON schema: this epic exists so reference data stops needing a deploy,
   and an enum would put the discipline list back behind one. The schema gained the parts that carry
   no such cost — `uniqueItems: true` and `items.minLength: 1`.
4. **[Medium] The status table promised insertions before making them, and a partial insert was
   silent.** `insertMany` is ordered by default, so a mid-batch failure leaves the collection partly
   written; the table had already printed `insert` for all 23 and the throw skipped the summary. The
   insert is now wrapped to report how many landed before rethrowing, and the table says `inserting`
   rather than asserting a completed write.
5. **[Medium] The AC-6 cross-check test asserted nothing that could fail.** It called `main()` once,
   in dry-run, against a test DB with no bloodline-carrying characters, and asserted `typeof ===
   'number'`. Pointing the query at a non-existent collection would have kept it green. It now seeds
   six characters — two sharing a resolving value, one non-resolving, and one each of `''`, `null`
   and field-absent — and asserts the exact counts in both modes. The `''`/`null`/absent trio pins
   the `$nin` filter, which was the one part with real semantics.
6. **[Medium] Idempotency was only tested for the identical-re-run case.** Added: resume from a
   partially seeded collection (10 present → 13 inserted → 23 total), a divergent same-name document,
   an orphan, and a pre-existing duplicate.
7. **[Low] An UPPERCASE hex ObjectId 404'd for a document that exists.** Round-trip comparison is now
   case-insensitive. The identical bug in the ECM router it was copied from is deferred, not fixed
   here.
8. **[Low] `buildSeedDocs` discarded the integrity errors it computed** and silently filtered out
   unclaimed names — a partial truth from an exported helper. It now throws.
9. **[Low] `checkIntegrity` mishandled malformed source structures.** A non-array clan list iterated
   its characters and emitted one bogus error per letter (or threw a raw TypeError on a number); a
   name listed twice under one clan reported "claimed by more than one clan: Gangrel and Gangrel";
   a non-array discipline value reported "0 disciplines" rather than a type error.
10. **[Low] AC 6's distinct-value resolution was counted per holder.** They coincide today (13/13
    either way) and diverge the moment two characters share a bloodline. Both are now reported.
11. **[Low] The API test fixtures carried a `_bl1_test` marker the collection's own schema forbids**,
    tracked cleanup in a `seeded[]` array that was written and never read, and used real bloodline
    names that collide with the seed suite's unique index. Fixtures are now schema-valid, cleaned up
    by tracked id, and named so they cannot collide.
12. **[Low] The usage block told the operator to run from two different directories** — the examples
    were repo-root paths, the note below said run from `server/`. On a script whose header warns
    never to point `--apply` at live, that is the wrong line to be ambiguous.

### Deferred (7)

Registered in `specs/stories/deferred-work.md` under this story: the ECM router's uppercase-id twin,
DB-level slug uniqueness, a `collMod` `$jsonSchema` validator, `deriveSlug`'s non-decomposable
letters, retired characters in the cross-check, the untested production mount, and whether the list
endpoint should filter `active`. Each is either pre-existing, or BL-2/BL-4's call to make with a
consumer in hand.

### Dismissed (5)

The three verified-false claims above, plus: "Target DB is printed from a variable the connection may
not use" (`db.js:25` resolves the name with exactly the same expression), and "`wouldInsert` is
populated in apply mode too" (it is accurate as *the number that needed inserting*; no consumer
reads it as a to-do count).

### One decision for Angelus — RESOLVED 2026-08-10

**Should `notes` be public?** `GET /api/bloodlines` is unauthenticated and returned every field.
Nothing was exposed yet (every `notes` is `null`), but BL-4 lets an ST write them.

Grounding offered before the call: the eight `rule_*` reference collections all carry a free-text
`notes` and all sit behind `requireAuth` at `/api/rules`, so the repo has **no** precedent for an ST
note on an unauthenticated endpoint. The ECM precedent this route was modelled on has a player-facing
`description` and no ST-notes field at all, so "same as ECM" did not cover the case.

**Ruled: `notes` is ST bookkeeping, not player-facing flavour.** Both public reads now project it
out at the query — the same shape as `st_hidden` filtering on relationships, and per the standing
rule that role scoping belongs in the Mongo query rather than a post-fetch strip. The document still
stores it; BL-4 adds an ST-gated read to surface it in the admin UI, and that requirement is recorded
on BL-4's sprint-status line so it is not lost. If bloodlines ever want player-visible flavour text,
that is a separate `description` field, as the equipment catalogue has.

Covered by a test asserting `notes` is absent from both the list and the single read while still
present in the stored document; proved to discriminate by reverting the projection.

### A second ruling, and a field removed — 2026-08-10, after the review

While answering BL-2's open question about whether an `active: false` bloodline should still resolve
for costing, Angelus ruled the premise away: **a bloodline cannot be retired. They are permanent.**

That makes `active` a boolean that can only ever hold one value — a claim the code makes and cannot
keep, which is the same reasoning that deferred banes and kept the WS broadcast out of this story.
So it is **removed**: from the schema, from the seed's built documents, and from every fixture. BL-1
was committed but unmerged and unseeded, so this cost nothing; a week later it would have cost a
migration. A test now asserts `active` is *rejected* as an unknown property, so it cannot drift back
in as a BL-4 convenience.

The BL-1 deferral "GET /api/bloodlines returns soft-retired entries with no filter" is void with it,
and BL-2's open question is answered by deletion rather than by a rule.

Note the knock-on for AC 1: the schema no longer matches the story's own AC-1 field list, which
included `active`. That is deliberate and ruled, not an omission.

### Regression after patching

`Test Files 7 passed (7) · Tests 147 passed (147)` — the three BL-1 suites (65 tests, up from 52)
plus the character and ECM suites. Live dry-run re-run after the patches: unchanged at 13/13 holders
and 13/13 distinct values resolving, no DIFFERS, no orphans. The pre-existing red
(`issue-837-xp-totals-deprecation.test.js`) is untouched and still unrelated.

**No unresolved High or Medium findings remain.**

## Change Log

| Date | Change |
|---|---|
| 2026-08-10 | Internal 3-layer code review. 12 findings patched (1 High, 5 Medium, 6 Low), 7 deferred, 5 dismissed as verified-false or noise. 13 new tests; all 11 code fixes proved to discriminate by single-change revert. 147 green. |
| 2026-08-10 | BL-1 implemented. `bloodlines` collection schema (4-discipline constraint enforced, clan enum shared with the character schema by import), seed script with a pre-write integrity gate and a read-only live cross-check, unique index on `name`, read-only `GET /api/bloodlines` + `/:id`. 52 new tests; 134 green across the touched surface. Status → review. |
