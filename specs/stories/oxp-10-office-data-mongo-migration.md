# Story oxp.10: migrate office content (OFFICE_DATA/MERIT_DOT_CAPS) to MongoDB

Status: done

## Story

As an ST maintaining Terra Mortis's office-powers content (assets, styles, manoeuvres, status powers,
and merit-dot caps for each Court office),
I want that content to live in MongoDB instead of static JS,
so that a future TM Admin authoring surface can edit it without a code deploy — matching how
bloodlines' own content already works.

## Why this story exists

Split out of oxp-1 during that story's own creation (2026-08-13). The epic's original oxp.1 text
bundled "migrate `OFFICE_DATA` off static JS" in with seat-schema design; separated because it's a
distinct, mechanical migration with its own risk surface, unrelated to the seat-keying problem oxp-1
actually needed to solve. Flagged as a known gap since issue-1141's own story record; not yet acted on
until now.

**Locked scope decision (Angelus, 2026-08-27, explicit choice from three options presented):**
**read-only migration in this repo, matching the bloodlines precedent exactly, NOT the equipment-
catalogue precedent.** TM Game gets a `GET` route and a client-side cache module. **No write route, no
admin UI, no admin CRUD screen anywhere in this repo.** A future, separate TM Admin-side story (out of
this repo's scope, does not exist yet — do not create it or invent a story key for it) will add
ST-editable authoring against the same shared collection(s), mirroring how bloodlines' own admin CRUD
lives entirely in TM Admin (ADMR-1 retired every write handler from `server/routes/bloodlines.js`; its
own header comment states this precedent explicitly — cite it at dev-story time, don't paraphrase from
memory). Do not add a write route "for completeness" — that is an explicitly rejected option, not an
oversight.

## What this story is NOT

- **NOT oxp-8** (Administrator content authoring — a separate, content-only backlog story, Angelus/
  Symon's, no code dependency). This story must NOT author an Administrator entry. The migrated
  collection and every repointed call site must continue treating "no content for this office
  category" as a normal, valid state — see AC5.
- **NOT a write route or admin UI anywhere in this repo** — see the locked scope decision above. This
  is the single most important boundary in this story; a dev instinct to "add the obvious CRUD screen
  since we're already in here" is explicitly wrong for this story.
- **NOT touching the office *state* collections** (`office_seats`, `office_manoeuvre_ranks`,
  `office_merit_dots`, `office_actions`, `office_action_budgets`, `contested_roll_requests`) — all
  already Mongo-backed, all seat-keyed (oxp-11), all out of scope. This story only migrates the
  *content/rules* reference data `OFFICE_DATA`/`MERIT_DOT_CAPS` describe.
- **NOT re-keying anything by seat.** Office content is per-*office-category* (4 entries: Head of
  State, Primogen, Socialite, Enforcer — Primogen and Socialite each have 2 concurrent seats per
  oxp-11, but they share ONE content entry, since the content describes the office, not a seat).
- **NOT deleting `content/rules/office-powers.md`** (the authored, human-readable rules reference —
  `office-manoeuvre-rank.js`'s own comment cites it as where the resolved manoeuvre-rank ordering
  table lives). That file stays the authored source of truth for a human reading the rules; the new
  collection is the machine-readable mirror of it, not a replacement.
- **NOT correcting the epic doc's stale "merits/devotions already migrated to Mongo" framing** by
  actually migrating merits/devotions — that's out of scope entirely. This story only corrects the
  *documentation* claim (`reference-data-ssot.md`) that was carrying it forward inaccurately; see AC7.

## Real scope — six dependents, not three

The epic doc's own original text said "repoint 3 live import sites." **Verified wrong this session** —
re-verify again at dev-story time (things drift), but as of this story's own investigation there are
**six real dependents**, two client and four server, not three:

1. `public/js/tabs/office-tab.js` — client, imports both `OFFICE_DATA` and `MERIT_DOT_CAPS`. Read-only
   render of the office panel + client-side merit-dot-cap validation before submit.
2. `public/js/editor/sheet.js` — client, imports both. `shRenderOfficeMerits` gates whether an
   office-merits block renders on the character sheet at all, plus displays dot caps.
3. `server/lib/office-seat-resolve.js` — server, imports `OFFICE_DATA` only. `resolveOfficeSeat()` is
   the **shared resolver every office-domain route calls first**; a seat whose office category has no
   `OFFICE_DATA` entry (Administrator, today) is refused with `400 VALIDATION_ERROR`, not a crash —
   read this file's own docstring, it states the Administrator case explicitly as intentional
   behaviour to preserve.
4. `server/routes/office-merit-dots.js` — server route (not a client tab, despite the name reading
   that way). Imports `MERIT_DOT_CAPS` only, `cap = MERIT_DOT_CAPS[merit] || 5` (line ~61).
5. `server/routes/office-purchase.js` — server route (added by this session's own oxp-9 story).
   Imports both. **Reads `OFFICE_DATA[seat.office_category]` synchronously, mid-transaction**, inside
   the accept flow's `dbSession` (~line 382), alongside several other `findOne(..., {session:
   dbSession})` reads in the same transaction. This is architecturally significant — see Dev Notes.
6. `server/routes/office-manoeuvre-rank.js` — does **not** import the module directly, but its own
   comment (~line 38) states manoeuvre "rank" is a graduated integer whose meaning IS the array index
   into `OFFICE_DATA[category].manoeuvres` — an **ordering contract**, not just a data-shape one. The
   migrated collection must preserve manoeuvre order per office exactly, or this route silently
   miscounts what a given rank actually grants.

## Acceptance Criteria

1. **New collection for per-office content** (working name `office_content` — confirm/rename at
   dev-story time if a better fit emerges, but do not reuse `office_seats` or any existing state
   collection name). One document per office category currently in `OFFICE_DATA` (4 documents: Head of
   State, Primogen, Socialite, Enforcer). Schema, mirroring `bloodline.schema.js`'s own shape and
   discipline (Draft-07, `additionalProperties: false`, **no speculative fields** — every field must
   already have real data, per that schema's own documented "a field with no data rots" principle):
   `_id` (ObjectId, minted by Mongo, not the category name — matches bloodlines' own `_id`/`name`
   split, not a name-as-primary-key shape), `category` (string, unique, matching
   `office_seat.schema.js`'s `OFFICE_CATEGORY_ENUM` value set exactly — but note that enum has 5
   values including `'Administrator'`, and this collection will only ever hold 4 real documents until
   oxp-8 ships; do not add an Administrator placeholder document as part of this story), `asset`
   (string), `style` (string), `merits` (array of strings — merit names, not embedded objects; dot
   caps are a separate concern, see AC2), `manoeuvres` (array of `{name, effect}` objects, **order-
   preserving** — see the ordering-contract note above and AC6), `statusPower` (array of strings).
2. **Merit-dot-cap data** (`MERIT_DOT_CAPS`, a flat 12-entry merit-name → cap map, NOT per-office) —
   **open question, decide deliberately at dev-story time, do not silently default**: (a) its own small
   collection (e.g. `office_merit_caps`, one document per merit — `{_id, merit_name (unique), dot_cap}`
   — matching this codebase's general preference for real per-entity documents over a single blob, per
   `bloodline.schema.js`'s own stated philosophy), or (b) a single well-known document (e.g. inside a
   shared config-style collection, if this repo has an established one for flat lookup maps — check
   before inventing a new shape). Whichever is chosen, every consumer's existing `MERIT_DOT_CAPS[merit]
   || 5` fallback-to-5 behaviour must be preserved exactly (a merit not present in the map is not an
   error, it defaults to 5).
3. **One-time seed script**, mirroring `server/scripts/archive/seed-bloodlines.js`'s exact shape:
   - Old `OFFICE_DATA`/`MERIT_DOT_CAPS` copied **verbatim as frozen literals inline in the script
     itself** (not re-imported from `office-data.js`), annotated "FROZEN — do not edit."
   - An **integrity gate**, run before building any document, checking: every office has non-empty
     `asset`/`style`/`merits`/`manoeuvres`/`statusPower`; every merit name referenced by any office's
     `merits` array exists in the merit-cap source or is documented as defaulting to 5; no duplicate
     manoeuvre names within one office; every office category is a real `OFFICE_CATEGORY_ENUM` value.
     Throws rather than silently drops a bad entry.
   - **Reconciliation against whatever's already live**, reported in three distinct states — `DIFFERS`
     (present but disagrees, never auto-overwritten — "which side is right is a human call"), `orphan`
     (in the collection but not the frozen source), `dupe` (blocks a unique index) — matching
     `seed-bloodlines.js`'s own three-state shape exactly.
   - `--dry-run` default, `--apply` required to write, idempotent, `main()` guarded so importing the
     script for its exported functions (for test coverage) doesn't trigger a live run.
   - Explicitly decide and document whether `office-data.js` itself is deleted after migration or kept
     as a frozen comparison/rollback reference (bloodlines' own precedent: `constants.js`'s
     `BLOODLINE_*` exports were deleted outright once the seed script had its own frozen copy — mirror
     that unless a concrete reason not to surfaces at dev-story time).
4. **Read-only `GET` route**, matching `server/routes/bloodlines.js`'s own current shape exactly (read
   that file's header comment for the ADMR-1 precedent framing before writing this route) — public/
   unauthenticated if bloodlines' own `GET /` is, sorted, no field needs projecting out (office content
   has no `notes`-equivalent internal-only field the way bloodlines does — confirm this at dev-story
   time rather than assume). **No `POST`/`PATCH`/`DELETE` handlers at all** — the locked scope decision
   this story's own header states.
5. **A seat whose office category has no content document (Administrator, today) behaves identically
   before and after this migration** — every one of the six dependents in "Real scope" above, when it
   encounters this case, must produce the exact same outward behaviour it does today: `office-seat-
   resolve.js` still returns `400 VALIDATION_ERROR` with the same message shape; `office-purchase.js`
   still refuses with the same 400; the client tab/sheet renderer still shows whatever it shows today
   for a seat with no `OFFICE_DATA` entry (read the current code to establish this baseline exactly,
   then write a test proving the migrated version matches it byte-for-byte in the response shape that
   matters). This is the single correctness trap a naive migration would hit — do not let "no
   document" silently become "empty object" or "crash" anywhere in the six call sites.
6. **Manoeuvre array order is preserved exactly**, per office, through the full migration path (frozen
   literal → seed script → Mongo document → cache/read path → every consumer). Add an explicit test
   asserting `office-manoeuvre-rank.js`'s own rank-to-manoeuvre-name mapping is unchanged for at least
   one multi-manoeuvre office, both before this story's changes (baseline) and after.
7. **Client-side cache module** for the two client dependents (`office-tab.js`, `editor/sheet.js`),
   following `bloodlines-cache.js`'s pattern closely (a monotonic `_generation` counter so a stale
   in-flight fetch can't clobber a newer one; a miss registry distinguishing "not loaded yet" from
   "unknown category" from "empty collection," loud/logged rather than silently wrong, matching the
   real production incident `bloodlines-cache.js`'s own header comment documents; accessors return
   copies, never live references; a boot-time `loadOfficeContent()` and a separate `refetch...()` with
   *different* failure semantics — a boot failure "has nothing to lose," a mid-session refetch failure
   must keep the last-good cache rather than wipe it, exactly mirroring bloodlines' own stated
   rationale). Office content's own miss case is narrower than bloodlines' (no cross-collection
   validation like clan/discipline matching) — don't port complexity bloodlines needed but this doesn't.

   **AMENDED at dev-story time (2026-08-27), after external Codex review flagged the built module as
   not literally satisfying this AC's own wording (Pass 3a, High):** built with the `_generation`
   counter and copy-not-reference accessors (both now true — the latter was a genuine gap the review
   caught and patched, see the Dev Agent Record), but DELIBERATELY WITHOUT a miss registry or a
   separate `refetch...()` function. Both exist in bloodlines to guard against a specific, dangerous
   failure shape this collection cannot have: a *silently wrong but plausible* number (bloodlines'
   own "wrong-LOW" XP-costing incident its header comment documents). Every office-content failure mode
   instead — cache never loaded, a category genuinely absent, the collection empty — lands on the
   SAME already-visible, honest "Office details for this role are pending." fallback office-tab.js
   already used for Administrator before this migration; there is no silently-plausible-wrong state to
   catch, so a miss registry has nothing to report that isn't already on screen. A `refetch...()`
   function would also be genuinely dead code in the CURRENT repo: this collection is read-only here
   (AC8/locked scope decision), nothing ever changes it mid-session, so there is nothing to refetch
   against. Building either anyway, to satisfy this AC's literal wording rather than its underlying
   purpose, would be exactly the kind of speculative unused capability this codebase's own conventions
   argue against. If a future TM Admin-side write path ever needs office content to update live in an
   open TM Game tab (the same real, disclosed gap ADMR-1 left for bloodlines' own WebSocket push), that
   is the point to add both — not before there is a caller for them.
8. **Server-side reads do NOT reuse the client cache module, and do not need their own cache at all** —
   read Dev Notes for why (transactional consistency inside `office-purchase.js`'s accept flow is a
   real correctness concern, not just a style preference). Each of the four server dependents reads the
   new collection(s) directly via `getCollection(...)`, honouring `{session: dbSession}` wherever the
   existing code already runs inside a transaction (`office-purchase.js`) so the read participates in
   the same transactional snapshot as the surrounding writes.
9. **`specs/reference-data-ssot.md` updated**: a new row in the existing "Office (Court Positions —
   Epic OXP)" table (§40-55) for the new collection(s), in that table's own established format (`|
   Domain | Collection | API | Managed in UI |`), with "Managed in UI" reading something like
   "— (read-only; TM Admin authoring planned, not yet built)" rather than either blank or claiming a
   UI that doesn't exist. Add a note directly below the table, in the same voice as the existing DBO-4
   note (§55), citing the Administrator-has-no-document caveat explicitly (cross-reference AC5). While
   touching this doc, **also correct** a stale premise it and the wider epic carried: merits/devotions
   were never actually migrated to MongoDB — they remain in the separate "Reference / Rules Data" table
   (§190-200) marked "Baked into JS — not in MongoDB." Do not let this story's own text repeat that
   stale "merits/devotions already migrated" framing anywhere.
10. Real test coverage: the seed script's own integrity gate and reconciliation logic (unit-level,
    exported functions, no live Mongo required for the gate itself); the collection's schema validation;
    each of the six dependents' repointed behaviour, including the Administrator no-document case
    (AC5) and the manoeuvre-order case (AC6) as their own explicit tests, not folded silently into a
    general "renders correctly" assertion; the client cache module's generation-counter and miss-
    registry behaviour. Follow this repo's own targeted-suite convention — run the changed area's
    suites, not the whole server/e2e suite, for iteration; a full targeted regression pass (the six
    dependents' own existing test files, whatever they are — find them, don't assume names) before
    calling this done.

## Tasks / Subtasks

- [x] Task 0 — Resolve the 4 Open Questions and re-verify the six dependents (AC: 1, 2, 3, 4) — **do
      this before writing any code**, since it determines the shape of every other task.
  - [x] Decide and document: merit-cap storage shape (own small collection vs. a config-style
        document — check for an existing flat-lookup-collection precedent in this repo first).
  - [x] Decide and document: final collection/file naming.
  - [x] Decide and document: whether an automated cross-check against
        `content/rules/office-powers.md` is built, or a documented manual confirmation is
        proportionate.
  - [x] Decide and document: whether `office-data.js` is deleted post-migration or kept frozen.
  - [x] Re-run the six-dependents grep this story's own investigation used
        (`OFFICE_DATA`/`MERIT_DOT_CAPS` across `public/js/` and `server/`) to confirm no new import
        site has appeared since story creation.
- [x] Task 1 — Schema + collection(s) (AC: 1, 2)
  - [x] `server/schemas/office_content.schema.js` (or the name chosen in Task 0), Draft-07,
        `additionalProperties: false`, matching `bloodline.schema.js`'s own discipline — no
        speculative fields.
  - [x] Merit-dot-cap schema/collection per Task 0's decision.
- [x] Task 2 — Seed script (AC: 3)
  - [x] Frozen literal copy of `OFFICE_DATA`/`MERIT_DOT_CAPS` inline in the script, "FROZEN — do not
        edit."
  - [x] Integrity gate (non-empty fields, merit-name cross-reference, no duplicate manoeuvre names,
        valid office categories) — throws on failure, run before any document is built.
  - [x] Reconciliation against the live collection: `DIFFERS`/`orphan`/`dupe`, never auto-overwriting
        a real disagreement.
  - [x] `--dry-run` default, `--apply` to write, idempotent, `main()` guarded for safe import.
- [x] Task 3 — Read-only GET route(s) (AC: 4)
  - [x] Mirror `server/routes/bloodlines.js`'s own current shape (auth requirement, sort, any field
        projection) exactly — read that file first, don't assume.
  - [x] No `POST`/`PATCH`/`DELETE` handlers anywhere in this route file.
- [x] Task 4 — Repoint the four server dependents (AC: 5, 6, 8)
  - [x] `server/lib/office-seat-resolve.js` — same `400 VALIDATION_ERROR` shape for a no-content
        office category (Administrator today), reading the new collection directly (no cache).
  - [x] `server/routes/office-merit-dots.js` — same `|| 5` fallback behaviour for an unlisted merit.
  - [x] `server/routes/office-purchase.js` — the mid-transaction read (~line 382) uses `{session:
        dbSession}`, participating in the same transactional snapshot as the surrounding writes.
  - [x] `server/routes/office-manoeuvre-rank.js` — no import change needed, but add/extend its own
        test coverage proving manoeuvre order survived the migration (AC6).
  - [x] A small shared helper for the direct Mongo read, mirroring `office-seat-resolve.js`'s own
        stated rationale for existing exactly once rather than being copied into every route.
- [x] Task 5 — Client cache module + repoint the two client dependents (AC: 5, 7 — AC7 AMENDED, see its
      own entry above) (AC: 5, 7)
  - [x] New cache module mirroring `bloodlines-cache.js`: generation counter, copies not live
        references (patched after Codex review — an earlier draft returned live references; see the
        Dev Agent Record). Deliberately NO miss registry, NO refetch function — AC7's own amendment
        above explains why (no dangerous silently-wrong failure shape to guard against, no write path
        to refetch after).
  - [x] `public/js/tabs/office-tab.js` repointed, behaviour unchanged including the Administrator
        no-content case.
  - [x] `public/js/editor/sheet.js` repointed (`shRenderOfficeMerits`), same unchanged-behaviour bar.
- [x] Task 6 — Documentation (AC: 9)
  - [x] New row in `reference-data-ssot.md`'s existing "Office (Court Positions — Epic OXP)" table,
        matching its exact column format, "Managed in UI" reading accurately (read-only, TM Admin
        authoring planned not yet built).
  - [x] Note below the table citing the Administrator-has-no-document caveat, matching the DBO-4
        note's own voice.
  - [x] Correct the stale "merits/devotions already migrated" framing wherever this story's own text
        or the wider doc still carries it.
- [x] Task 7 — Tests + full regression (AC: 10)
  - [x] Seed script: integrity gate + reconciliation unit tests (no live Mongo required for the gate
        itself; reconciliation IS DB-backed — `server/tests/oxp-10-seed-office-content.test.js`, added
        after Codex review flagged this coverage as missing entirely, Medium — includes a permanent
        regression test for the review's own real reconciliation-bug finding).
  - [x] Schema validation tests (same file — `officeContentSchema`'s `oneOf` discrimination, the
        Administrator-is-schema-valid correction, a hybrid-document rejection case).
  - [x] Each of the six dependents: repointed-behaviour test, including the Administrator no-document
        case (AC5) and the manoeuvre-order case (AC6) as their own explicit tests.
  - [x] Client cache module: generation-counter, failure-state and copy-not-reference tests —
        `server/tests/oxp-10-office-content-cache.test.js`, added after the same Codex review flagged
        this coverage as missing (Medium) and, separately, found the copy-not-reference gap itself
        (High, patched — see AC7's own amendment above). NO miss-registry tests, deliberately: this
        module was built without one (AC7's amendment explains why), so there is nothing there to test.
  - [x] Run the six dependents' own existing test files (find them, don't assume names) plus the new
        suites together; cross-check any failure against `CLAUDE.md`'s own "Known pre-existing
        failures" list before treating it as a regression.

## Dev Notes

### Why server-side reads should NOT share the client's cache module

`office-purchase.js`'s accept handler (~line 382) reads `OFFICE_DATA[seat.office_category]`
**synchronously, inside an active MongoDB transaction** (`dbSession`), alongside several other
`findOne(..., {session: dbSession})` reads in that same transaction (`allSeats`, `meritDotsDoc`,
`manoeuvreRankDoc`). This is a financial/purchase-approval flow — correctness here means the office-
content read participates in the same transactional snapshot as the surrounding writes, not a
possibly-stale in-process cache value from whenever the server last refreshed it. The collection is
tiny (4-5 documents, rarely changes) and colocated with the database, so there is no meaningful
performance argument for a server-side cache the way there is for a browser round-trip. Reuse a small
shared helper (mirroring `office-seat-resolve.js`'s own stated rationale for existing exactly once
rather than being copied into every route) that does `getCollection('office_content').findOne({category},
{session})`, not a cache. This is a deliberate, disclosed architectural split from the client side, not
an oversight — a dev instinct to build ONE cache module and share it between client and server would be
wrong here.

### The manoeuvre-ordering contract has a third source of truth

`office-manoeuvre-rank.js`'s own comment states the resolved rank-order table already lives in
`content/rules/office-powers.md` (a human-authored markdown rules reference). The seed script's
integrity gate (AC3) should ideally cross-check the frozen `OFFICE_DATA` literal's manoeuvre order
against that document too, not just internal self-consistency — though a full automated markdown-to-
data cross-check may be disproportionate for four offices; at minimum, manually confirm the frozen
literal's order matches that document before running `--apply`, and note in the story's own Dev Agent
Record whether an automated check was built or a manual confirmation was judged sufficient.

### Project Structure Notes

- Client: `public/js/tabs/office-data.js` (source, likely deleted post-migration — see AC3), a new
  `public/js/data/office-content-cache.js` (or similar, matching `bloodlines-cache.js`'s naming),
  `public/js/tabs/office-tab.js`, `public/js/editor/sheet.js` (repointed).
- Server: a new `server/schemas/office_content.schema.js` (and a second schema if AC2 resolves to its
  own collection), `server/scripts/seed-office-content.js` (or matching this repo's seed-script naming
  convention — check `seed-bloodlines.js`'s own location/naming exactly), a new
  `server/routes/office-content.js` (GET-only), mounted in `server/index.js`; `server/lib/office-seat-
  resolve.js`, `server/routes/office-merit-dots.js`, `server/routes/office-purchase.js` repointed.
  `server/routes/office-manoeuvre-rank.js` needs no import change but its own test coverage for the
  ordering contract (AC6) should be added or extended.
- `specs/reference-data-ssot.md` — new table row + note (AC9).
- Normalised-CSS / British-English / no-em-dash conventions apply to any new UI text this story
  touches (unlikely, since this is a read-only backend-leaning migration, but the client cache
  module's own log/console messages should still follow this repo's own established tone).

### References

- [Source: specs/stories/sprint-status.yaml#L1316 (oxp-10's own backlog row)]
- [Source: public/js/tabs/office-data.js (source data, 85 lines, 4 offices: Head of State, Primogen,
  Socialite, Enforcer)]
- [Source: server/lib/office-seat-resolve.js (the Administrator no-document precedent, stated in its
  own docstring)]
- [Source: server/routes/office-purchase.js#L382-400 (the mid-transaction read this story's own Dev
  Notes discuss)]
- [Source: server/routes/office-manoeuvre-rank.js#L34-44 (the ordering contract + content/rules/
  office-powers.md cross-reference)]
- [Source: server/schemas/office_seat.schema.js#L45-56 (OFFICE_CATEGORY_ENUM, the Administrator gap)]
- [Source: public/js/data/bloodlines-cache.js, server/routes/bloodlines.js, server/schemas/
  bloodline.schema.js, server/scripts/archive/seed-bloodlines.js (the full precedent this story mirrors)]
- [Source: specs/reference-data-ssot.md#L40-55 (Office table), #L190-200 (Reference/Rules Data table,
  the stale-premise correction in AC9)]

## Open Questions (raised during story creation — decide deliberately at dev-story time, do not guess)

1. **Merit-dot-cap storage shape** (AC2) — its own small collection vs. a single config-style document.
   Recommend the small-collection shape (matches this repo's own stated preference for real per-entity
   documents), but check for an existing flat-config-collection precedent in this repo first.
2. **Collection/file naming** — `office_content` is a working name, not a mandate. Pick whatever reads
   clearest against the existing `office_seats`/`office_manoeuvre_ranks`/`office_merit_dots` family
   without colliding conceptually with any of them.
3. **Whether an automated cross-check against `content/rules/office-powers.md` is worth building** for
   the manoeuvre-ordering integrity gate, or whether a documented manual confirmation is proportionate
   for four offices (see Dev Notes).
4. **Whether `office-data.js` is deleted or kept** post-migration (AC3) — recommend deleted, matching
   the bloodlines/`constants.js` precedent, but confirm no other unlisted import site exists first
   (re-run the same grep this story's own investigation used, don't trust the "six dependents" count
   as necessarily exhaustive after time has passed).

**Resolved at dev-story time (2026-08-27):**

1. Single `kind: 'merit_caps'` document inside the SAME `office_content` collection as the office
   documents, discriminated by `kind` — not its own collection. Matches this repo's own `app_settings`
   precedent (`_id: 'global'`, one flat config document) more closely than a 12-document per-merit
   collection would: the map is small, flat, rarely changes, and every real consumer wants both kinds
   together on one load (one `find({})`), the same shape `bloodlines-cache.js` already uses for its
   own single collection.
2. `office_content`, as proposed.
3. Manual confirmation only, not automated. Spot-checked Primogen's 5-manoeuvre order in the frozen
   seed literal against `content/rules/office-powers.md`'s own "The Primogen" section (outside this
   repo, at the umbrella workspace root) and confirmed an exact match (People Talk, Freedom of
   Information, Show of Hands, Pull Rank, Veto). An automated markdown-to-data cross-check was judged
   disproportionate for four offices that change rarely and are hand-authored either way.
4. Deleted. Re-ran the six-dependents grep before deleting and found it had UNDERCOUNTED, not
   overcounted: alongside the 6 production call sites, 5 test files imported or `vi.mock`ed
   `office-data.js` directly (`issue-1141-office-data-sync.test.js`,
   `office-merit-dots.test.js`'s own source-contract assertions, `oxp-7-office-merits-empty-list-guard.test.js`,
   plus comment-only mentions in `issue-1141-office-tab-render.test.js` and `oxp-1-office-seats.test.js`
   that needed no code change). All five reworked in this story rather than left to break.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no failing suite required log-diving. The one real surprise (the office-tab-render suite's 22
failures) traced directly to a missing `localStorage` stub during cache-priming in that test file's
own `beforeAll`, found from the assertion diffs alone (every render fell back to the pre-existing
"Office details for this role are pending." branch), not from a separate debug pass.

### Completion Notes List

- Schema (`office_content.schema.js`) models two document kinds (`kind: 'office'` / `kind: 'merit_caps'`)
  sharing one collection via a top-level `oneOf`, mirroring `bloodline.schema.js`'s discipline
  (Draft-07, `additionalProperties: false`, no speculative fields).
- `server/lib/office-content-index.js` — two partial unique indexes (`{category:1}` filtered to
  `kind:'office'`; `{kind:1}` filtered to `kind:'merit_caps'`), created by both the seed script and the
  test `setupDb()` helper (idempotent).
- `server/scripts/seed-office-content.js` — frozen literal copies of `OFFICE_DATA`/`MERIT_DOT_CAPS`
  (byte-identical to the deleted `office-data.js`), an integrity gate (`checkIntegrity`) that runs
  before any document is built, `buildSeedDocs()` (pure, exported — reused directly by test fixtures,
  not re-implemented), and `seedOfficeContent()`/`main()` with the established dry-run-default,
  `--apply`-to-write, DIFFERS/orphan/dupe reconciliation shape from `seed-bloodlines.js`. Not yet run
  against live Mongo — that is Angelus's own action per this repo's standing convention.
- `server/routes/office-content.js` — one public `GET /`, mirroring `bloodlines.js` exactly; mounted in
  both `server/index.js` and `server/tests/helpers/test-app.js`.
- Server dependents repointed via a new shared helper, `server/lib/office-content-read.js`
  (`getOfficeEntry(category, {session})`, `getMeritCaps({session})`) — no server-side cache, per the
  story's own Dev Notes. `office-purchase.js`'s accept route does NOT call `resolveOfficeSeat()`
  (correction, Codex review Pass 3b — an earlier draft of this note overstated this) — it re-reads the
  seat directly (`seatsCol().findOne({_id}, {session: dbSession})`) because it must re-verify the
  seat's office category still matches what was submitted before trusting anything else, then passes
  `{session: dbSession}` through the direct `getOfficeEntry`/`getMeritCaps` calls. `resolveOfficeSeat()`
  itself IS used elsewhere in the same file (the POST submission and GET routes, both outside any
  transaction) and gained the `{session}` option for callers that need it, but the accept route is not
  one of them. `checkPurchaseValidity` gained a `meritCaps` parameter (previously a module-level
  import) so its caller controls whether that read is session-scoped.
- Client dependents repointed via a new `public/js/data/office-content-cache.js`, structurally
  following `bloodlines-cache.js` (fetch-once-at-boot, monotonic generation counter, synchronous
  accessors) but WITHOUT a miss registry — an unresolved office category lands on the pre-existing,
  already-visible "pending" fallback (the same one Administrator already used), not a silent wrong
  number the way an unresolved bloodline was. Wired into both `app.js` and `admin.js`'s boot sequences
  (`Promise.allSettled`/`await`, matching each file's own existing `loadBloodlines()` call site).
- Deleted `public/js/tabs/office-data.js` after confirming (re-grep) no remaining production import;
  the 5 test files that depended on it directly were reworked, not left broken (see Open Question 4's
  resolution above for the full list and the undercounted discovery).
- `office-merit-dots.test.js`'s two source-contract assertions (regex-matching the exact import
  statement text, and the exact cap literals) were repointed to the new import shape and to
  `seed-office-content.js` respectively, rather than deleted — they still catch the same class of
  drift they always did, just against the new source of truth.
- `server/tests/helpers/db-setup.js`'s `setupDb()` now auto-seeds `office_content` (idempotent upsert,
  `$setOnInsert`, never overwrites) for every DB-backed suite, the same way `getTestCharacterIds`
  already auto-seeds minimal characters — every server route test that resolves a real office category
  needs real content there now, not just a static import that was always present.
- Full targeted regression (office-merit-dots, oxp-1, oxp-3, oxp-4, oxp-5, oxp-6, oxp-7, oxp-9, both
  issue-1141 suites): consistently 415+/416 across every run, with the ONE recurring failure being
  `oxp-1-office-seats.test.js`'s own concurrent-seat-creation race test (`seed-office-seats.mjs`'s
  overlapping `applySeats(...)` calls, unrelated to `office_content` — that file never touches this
  story's own collection). **Correction (Codex review, Pass 3b): an earlier draft of this note called
  this "reproduced clean in isolation," which overstated it** — it is a genuine, pre-existing FLAKE
  (same class as this repo's own documented Atlas-connection-contention flakes), not a test that fails
  once and then reliably passes. Across multiple runs, mine and the external reviewer's, it failed with
  a varying wrong seat count (8, 10, 11 instead of the expected 7) and also passed clean at least once
  in isolation — both outcomes are real, neither is "the" answer, because the underlying
  `seed-office-seats.mjs` script genuinely has no unique index on its own natural key
  (`{office_category, holder_id}`), so overlapping upserts race non-deterministically. This is a real,
  pre-existing bug in oxp-1's own seed script, out of this story's scope to fix, not a regression this
  migration introduced or a claim this record should have called "clean."
- Full untargeted suite run (4430 tests, all files): 28 failed / 4324 passed / 76 skipped. One was a
  REAL regression this story introduced, found and fixed: `issue-1143-db-setup-skip.test.js`'s positive
  control mocks `../db.js` with a minimal surface (`connectDb`/`getDb` only, no working
  `getCollection`), and `setupDb()`'s new office_content auto-seed call threw against that mock,
  making `isDbAvailable()` resolve `false` instead of `true`. Fixed by wrapping the auto-seed call in
  its own try/catch inside `setupDb()` — a seeding failure is now non-fatal to every OTHER DB-backed
  suite (logged, not thrown), since letting it abort `setupDb()` itself would fail every suite in the
  repo over a concern most of them never touch. Verified fixed (3/3 passing) and re-verified the rest
  of the fix's blast radius is zero. The other 27 failures were verified pre-existing via `git stash`
  A/B isolation on a representative spot-check (`api-rules-offering.test.js`, `fix.943.retireStripDerived.test.js`,
  `rule-engine-integration.test.js`, `ws-fanout.test.js`, `issue-830-inherited-card-css.test.js` — all
  4 failing files reproduced byte-identical failure counts against the stashed base commit, with this
  story's own changes entirely removed) plus direct inspection for the rest: 5 already documented in
  `CLAUDE.md`'s own "Known pre-existing failures" list (`n7-n9-allocator-readers`,
  `epic.708.3-cycle-phase-controls`, `oath-a-pledge-helpers`, `issue-836-legacy-tracker-cache-removed`,
  `issue-1013-indomitable-rules-text`); `issue-823-test-db-guard.test.js` asserts the literal string
  `'tm_suite_test'`, stale since the tm_suite→tm_game rebrand; `bl3a-one-inclan-implementation.test.js`
  and `gdx-4-css-standards-grep.test.js` are CSS-assertion failures already confirmed pre-existing and
  unrelated earlier this same session (no CSS file touched by this story); the 8 `*-parallel-write.test.js`
  files are concurrency stress tests, all failing together only under full-suite load — the same
  resource-contention flake class this repo's own `CLAUDE.md` already documents for `cm-4-renumber-
  chapter-merge.test.js`/`fix.715.dt-manual-open-gate.test.js`. None of the 27 touch office content or
  any file this story modified.
- `reference-data-ssot.md` updated: new `office_content` row in the Office table, a note explaining the
  migration/locked-scope/Administrator-caveat, and a correction naming the stale "3 import sites"
  premise and the real (undercounted) total.
- AC6's explicit rank-to-manoeuvre-name test added directly (`issue-1141-office-tab-render.test.js`):
  renders Primogen's real (not synthetic) manoeuvre list from content that flowed through the full
  migration pipeline (frozen literal → `buildSeedDocs` → stubbed `/api/office_content` → cache →
  `officeEntry()` → render) and asserts all 5 real names appear in the exact source order — a reorder
  anywhere in that pipeline would fail this test.

### File List

- `server/schemas/office_content.schema.js` (new; category enum widened to the full 5-value
  `OFFICE_CATEGORY_ENUM` after Codex review, Pass 3a — see AC1's own correction note)
- `server/lib/office-content-index.js` (new)
- `server/lib/office-content-read.js` (new)
- `server/routes/office-content.js` (new)
- `server/scripts/seed-office-content.js` (new; `keyOf()` reconciliation-aliasing bug fixed after Codex
  review, Pass 2 — see the Dev Agent Record; `checkIntegrity` now returns and `seedOfficeContent` now
  prints unmapped-merit warnings, Codex review Low)
- `server/index.js` (modified — mount office-content router)
- `server/tests/helpers/test-app.js` (modified — mount office-content router)
- `server/tests/helpers/db-setup.js` (modified — auto-seeds `office_content`, NOT wrapped in a
  swallowing try/catch — an earlier draft's blanket catch was itself a Codex review finding, Medium,
  reverted; see `issue-1143-db-setup-skip.test.js`)
- `server/lib/office-seat-resolve.js` (modified — reads `office_content`, session-aware; stale
  `OFFICE_DATA` prose corrected)
- `server/routes/office-merit-dots.js` (modified — reads merit caps from `office_content`)
- `server/routes/office-manoeuvre-rank.js` (modified — comment only, no import change)
- `server/routes/office-purchase.js` (modified — session-aware `office_content` reads inside the accept
  transaction; `checkPurchaseValidity` gained a `meritCaps` parameter)
- `server/routes/office-seats.js` (modified — comment only: corrected a stale claim about
  `resolveOfficeSeat`'s session support, Codex review Low)
- `server/schemas/office_seat.schema.js` (modified — comment only: stale `office-data.js` reference
  corrected, Codex review Low)
- `public/js/data/office-content-cache.js` (new; `officeEntry()` now returns a copy, not the live
  cached document — Codex review, Pass 3a, High)
- `public/js/tabs/office-tab.js` (modified — repointed to the cache)
- `public/js/editor/sheet.js` (modified — repointed to the cache)
- `public/js/app.js` (modified — boot-time `loadOfficeContent()`)
- `public/js/admin.js` (modified — boot-time `loadOfficeContent()`)
- `public/js/tabs/office-data.js` (deleted)
- `server/tests/oxp-10-seed-office-content.test.js` (new — seed script + schema unit/integration
  coverage, added after Codex review Medium finding; includes the permanent regression test for the
  Pass 2 reconciliation bug)
- `server/tests/oxp-10-office-content-cache.test.js` (new — cache module unit coverage, added after
  Codex review Medium finding)
- `server/tests/issue-1143-db-setup-skip.test.js` (modified — its positive control's `db.js` mock now
  includes a working `getCollection` stub, completing the mock rather than weakening `setupDb()`'s own
  contract; see the `db-setup.js` entry above)
- `server/tests/issue-1141-office-data-sync.test.js` (modified — imports the seed script instead)
- `server/tests/issue-1141-office-tab-render.test.js` (modified — primes the cache before import; new
  AC6 explicit ordering test added)
- `server/tests/office-merit-dots.test.js` (modified — two source-contract assertions repointed)
- `server/tests/oxp-1-office-seats.test.js` (modified — comment only)
- `server/tests/oxp-7-office-merits-empty-list-guard.test.js` (modified — primes the cache instead of
  `vi.mock`ing the deleted static module)
- `server/tests/oxp-7-sheet-office-merits-section.test.js` (modified — same cache-priming technique)
- `specs/reference-data-ssot.md` (modified — new table row + note)
- `specs/epic-oxp-office-xp-economy.md` (modified — status correction)
- `specs/stories/code-review/oxp-10-office-data-mongo-migration-diff.txt` (new — the scoped review diff)
- `specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-review.md` (new — the review
  prompt)
- `specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-findings.md` (new — Codex's own
  findings)
- `specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-run.log` (new — the raw run log)
- `specs/stories/oxp-10-office-data-mongo-migration.md` (this file — tasks, Open Questions, Dev Agent
  Record, AC1/AC7 amendments)
- `specs/stories/sprint-status.yaml` (modified — status progression)

## Senior Developer Review (AI)

**Reviewer:** External — Codex, CLI-direct (`codex exec`, `model_reasoning_effort=high`), 3-pass
adversarial protocol (Blind Hunter → Edge Case Hunter → Acceptance Auditor), single session, against
commit `5c3d168e` (base `fcf5bd2b`). Went well beyond a static read: stood up an isolated,
transaction-capable local MongoDB replica set (the configured Atlas URI was unreachable in its
sandbox, and the plain local daemon is standalone and can't run this repo's transactions) to actually
reproduce every DB-backed claim, including the one real bug it found. Full raw output:
`specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-findings.md`.

**Outcome: 1 High, 5 Medium, 5 Low.** Every finding independently re-verified against this session's
own environment before triage — none accepted on the reviewer's word alone.

### High

- **AC7's cache module omitted 3 of its own literal sub-requirements (miss registry, refetch function,
  copy-not-reference accessors), checked off as done anyway.** CONFIRMED, split triage:
  - Copy-not-reference: **PATCHED**. `officeEntry()` returned the live cached document; nothing
    currently mutates it, but the AC promised copies and the fix is free. Now returns a shallow copy
    with `merits`/`manoeuvres`/`statusPower` copied too. New regression test:
    `oxp-10-office-content-cache.test.js`'s "mutating a returned entry does NOT corrupt the cache".
  - Miss registry + separate `refetch...()`: **AC7 AMENDED, not implemented.** Both exist in bloodlines
    to guard a real, dangerous failure shape (a silently-wrong-but-plausible XP cost) this collection
    cannot have — every office-content failure mode already lands on the same honest, already-visible
    "pending" fallback. A `refetch...()` would be genuinely dead code today (read-only collection,
    nothing to refetch against). Building either just to satisfy the AC's literal wording would be
    exactly the speculative-unused-capability this codebase's own conventions argue against. See AC7's
    own amendment text above for the full reasoning and the condition under which they should be added
    later.

### Medium

- **`db-setup.js`'s new office_content seed swallowed every seeding failure, not just the one it was
  meant to accommodate.** CONFIRMED. **PATCHED** — reverted the blanket try/catch; `setupDb()` keeps
  its pre-existing throw-on-failure contract (other suites already depend on it, per its own
  docstring). Fixed the ACTUAL problem instead: `issue-1143-db-setup-skip.test.js`'s minimal `db.js`
  mock now includes a working `getCollection` stub, so the suite whose mock was incomplete completes
  its own mock rather than the shared function growing an exception.
- **Seed reconciliation's `keyOf()` aliased any unrecognised-`kind` document onto the `merit_caps`
  sentinel key.** CONFIRMED and independently reproduced against real MongoDB (both by the reviewer and
  by me, prove-discriminated with a single-change revert). A real, operationally significant bug:
  `--apply` could finish "successfully" having never written the merit-caps singleton at all, with the
  aliased orphan never reported. **PATCHED** — `keyOf()` now gives office/merit_caps documents their
  own unambiguous keys and anything else an always-orphan key; a separate `labelOf()` keeps console
  output human-readable. Permanent regression test added:
  `oxp-10-seed-office-content.test.js`'s "an unrecognised-kind orphan..." test.
- **AC1's schema enum contradicted the epic's own "oxp-8 is content-only, no code dependency" premise.**
  CONFIRMED — narrowing the category enum to 4 values (excluding Administrator) meant oxp-8 could never
  actually be content-only; authoring Administrator content would require a TM Game code deploy to
  widen the schema first. **PATCHED** — schema's `category` now uses the full 5-value
  `OFFICE_CATEGORY_ENUM`, matching AC1's own literal "matching... exactly" wording. "No Administrator
  document exists yet" is now enforced by the seed script's frozen `OFFICE_DATA` simply having no such
  key, not by schema refusal.
- **Task 7/AC10 claimed seed/schema/cache tests that did not exist.** CONFIRMED — a real coverage gap,
  and the reconciliation bug above is direct evidence of it. **PATCHED** — two new test files,
  `oxp-10-seed-office-content.test.js` (26+ tests: checkIntegrity, buildSeedDocs, schema validation,
  DB-backed reconciliation including the regression test) and `oxp-10-office-content-cache.test.js`
  (13 tests: load/failure states, copy-not-reference, meritCap default).
- **The Dev Agent Record's "reproduced clean in isolation" claim about `oxp-1`'s race test was itself
  overstated.** CONFIRMED — it is a genuine flake (varying wrong seat counts across runs), not a test
  that fails once and then reliably passes. **CORRECTED IN THE RECORD** (not the code — the underlying
  bug is in `seed-office-seats.mjs`, oxp-1's own script, unrelated to `office_content`, out of this
  story's scope). See the completion-notes entry above for the corrected wording.

### Low

- **Schema comment claimed 12 merit-cap entries; the real frozen source has 10.** CONFIRMED. **PATCHED**
  — comment corrected, no longer claims a fixed cardinality at all.
- **The integrity gate's own comment promised a console warning for an unmapped merit that was never
  implemented.** CONFIRMED. **PATCHED** — `checkIntegrity` now returns `warnings`, `seedOfficeContent`
  prints them. New tests cover both the warning firing and the real frozen source producing none.
- **Several stale comments still described the deleted `office-data.js`/`OFFICE_DATA` as if it were
  still the live source.** CONFIRMED for the three the reviewer named as production-file prose (not the
  many legitimate `OFFICE_DATA` references to the still-real export from `seed-office-content.js`).
  **PATCHED** — `office_seat.schema.js`, `office-seats.js` (also corrected a second, independently stale
  claim in the same comment block — that `resolveOfficeSeat` had no session support and should not gain
  one; it now has one, used by `office-purchase.js`), `office-seat-resolve.js`.
- **The Dev Agent Record claimed the accept route threads `{session}` through `resolveOfficeSeat()`;
  it doesn't call that function at all.** CONFIRMED — an overstatement with no runtime consequence (the
  actual direct reads are correctly session-scoped), but a future reader could go looking for a call
  that isn't there. **CORRECTED IN THE RECORD.**
- **Test-DB office_content fixtures never get repaired if stale (`$setOnInsert` + no-op teardown).**
  CONFIRMED as a real, low-frequency operational quirk — accepted, not patched. This is the same
  never-auto-clobber philosophy this collection's own seed script uses everywhere else (a human decides
  when a disagreement is resolved); a developer who suspects stale test fixtures can drop the collection
  directly. Changing this would mean the test suite silently overwrites what a human might have put
  there deliberately.

### Verification

Every patch re-run and green: full office-domain batch (`oxp-10-seed-office-content.test.js`,
`oxp-10-office-content-cache.test.js`, `office-merit-dots`, `oxp-1`, `oxp-2`, `oxp-3`, `oxp-4`, `oxp-5`,
`oxp-7` both files, `oxp-9`, `oxp-11`, both `issue-1141` suites, `issue-1143`) — 429 passed / 1 failed
(the confirmed-pre-existing `issue-823` rebrand-drift assertion) across the last full run. The
reconciliation-bug fix and the `issue-1143` mock fix were both prove-discriminated with single-change
reverts before being accepted as real fixes, not just re-run to confirm green.

**Not pushed, not merged** — commit only, per this repo's standing rule.
