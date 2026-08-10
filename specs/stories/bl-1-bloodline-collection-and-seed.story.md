# Story BL-1: The `bloodlines` collection, its schema, and a seed from the constants

Status: ready-for-dev

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

- [ ] Task 1 (AC 1, 2): `server/schemas/bloodline.schema.js`, reusing the clan enum from
      `character.schema.js:62` by import rather than by copy if that file exports it; if it does
      not, note that in the Dev Agent Record rather than duplicating silently.
- [ ] Task 2 (AC 4, 5, 6): `server/scripts/seed-bloodlines.js`, dry-run default, integrity
      assertions first, live cross-check reported.
- [ ] Task 3 (AC 3): unique index on `name`.
- [ ] Task 4 (AC 7): read-only route + mount in `server/index.js`.
- [ ] Task 5 (AC 9): tests, including a real `main()` run against `tm_suite_test`.
- [ ] Task 6: dry-run the seed against `tm_suite_test`, then against live **read-only** (dry-run
      makes no writes), and paste both summaries into the Dev Agent Record.
- [ ] Task 7: PR to `main` (Angelus's word). *(GATED.)*

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

### Debug Log References

### Completion Notes List

### File List
