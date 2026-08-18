# Story BL-4: ST admin CRUD — a bloodline added without a deploy

Status: done

> **Epic BL** — issue **#1008**. Fourth story, and the one the issue was actually filed for. BL-1
> built the collection, BL-2 built the cache, BL-3a made every costing surface read it. All three
> were preparation: the collection still has exactly one writer, `server/scripts/seed-bloodlines.js`,
> and that writer reads the constants. **Until this story exists, "add a bloodline without a deploy"
> is still false** — the ST would have to edit `constants.js` and re-run the seed.
>
> **This story unblocks BL-3b.** BL-3b deletes the constants and retires the seed script; it is
> blocked until something other than the seed can write the collection. That something is this story.
> Ruled 2026-08-10: BL-4 runs before BL-3b, not after.
>
> **Data-lock: RECOMMENDED, and this is the first story in the epic where it is not optional.**
> BL-2's data-lock verified READ shapes only. This story opens the epic's first WRITE surface, and
> three of its acceptance criteria depend on facts nobody has re-measured: whether the live
> collection exists at all (as of 2026-08-10 it did not — `GET /api/bloodlines` returns `[]` and the
> seed's `--apply` is still a pending operational act), the exact live distribution of
> `characters.bloodline` values the delete guard has to match against, and which `rule_grant`
> documents carry a `bloodline_name`. Run `bmad-data-lock` before `bmad-dev-story`.
>
> **Deploy:** branch from `main` (continue on `bl/bl-1-bloodline-collection`, which already carries
> bl-1/bl-2/bl-3a unpushed), PR direct to `main`, never through `dev`. No push or merge without
> Angelus's explicit word in his current message.
>
> **Timing:** Epic BL is agreed for **after Game 7 (Sat 2026-08-15)**, same as its siblings. This
> story adds a new ST-only screen and three new write endpoints; it changes nothing a player sees
> unless an ST uses it, so it carries less live risk than BL-2 or BL-3a — but it is the story that
> can put a wrong bloodline into production data, which is a different and more permanent risk.

## Story

As the Storyteller,
I want to create, edit and remove bloodlines from an admin screen,
so that adding a bloodline to the chronicle is a data change I make myself in thirty seconds, not a
code change, a Netlify deploy and a re-run of a seed script.

## Why this story exists

The collection is live-shaped and every reader points at it, but the only way to put a document in it
is `server/scripts/seed-bloodlines.js`, which:

- reads `BLOODLINE_DISCS` / `BLOODLINE_CLANS` from `public/js/data/constants.js` (`:57`), so a new
  bloodline still starts as a code edit;
- is a one-shot migration by design (its own header calls `--apply` "an operational act for the ST"),
  not an editing tool;
- **reports drift, it does not repair it** (`:308-319`) — a document already present under a name but
  disagreeing with the constants is printed as `DIFFERS` and left alone. There is deliberately no
  update path anywhere in the codebase.

So today the epic delivers correct costing from a collection that no human can edit. Three concrete
consequences, all live:

| Situation | Today |
|---|---|
| ST invents a new bloodline mid-chronicle | edit two constants, PR, deploy, re-run the seed |
| A seeded bloodline has a wrong discipline | no writer can fix it; the seed prints `DIFFERS` and stops |
| `notes` (ST bookkeeping) | stored by the schema, **projected out of both public reads** (`routes/bloodlines.js:67`), so the field is currently unreachable from the app entirely |

BL-3a is what makes this story safe to ship now rather than earlier. Before it, a bloodline that
existed only in Mongo would have cost 3 XP/dot on the sheet and 4 XP/dot in the DT form, silently,
because the DT form had its own in-clan implementation. There is now exactly one implementation, so a
bloodline created on this screen is correct on every surface the moment it is created.

## Acceptance Criteria

### Server — write endpoints

1. **Three ST-gated writes, added in place inside the existing factory.**
   `server/routes/bloodlines.js` was built as `buildBloodlinesRouter(authMiddleware)` (`:56`)
   specifically so BL-4 adds handlers without touching the mounts at `server/index.js:95` and
   `server/tests/helpers/test-app.js:72`. Do not touch those mounts. Gate each write handler with
   `authMiddleware, requireRole('st')` exactly as `server/routes/equipment-catalogue.js:95-97`
   does. The two existing GETs stay public and unauthenticated, and their response shape does not
   change.

   | Endpoint | Auth | Behaviour |
   |---|---|---|
   | `POST /api/bloodlines` | ST | create |
   | `PATCH /api/bloodlines/:id` | ST | partial update, allowlisted fields only |
   | `DELETE /api/bloodlines/:id` | ST | 409 when referenced, 204 otherwise (see AC 8) |
   | `GET /api/bloodlines/admin` | ST | full documents **including `notes`** (AC 5) |
   | `GET /api/bloodlines/:id/impact` | ST | who references this bloodline (AC 8) |

   No auth → 401 (the middleware's own surface); a `player` role → 403. Both asserted.

2. **The 4-discipline rule is enforced on every write path, including PATCH.** A bloodline with
   fewer than four disciplines is invalid, not a draft (ruled 2026-08-10;
   `server/schemas/bloodline.schema.js:55-61` — `minItems`/`maxItems` 4, `uniqueItems`,
   `items.minLength` 1). POST validates the built document against `bloodlineSchema`.
   **PATCH must validate the MERGED document, not the patch body.** This is a deliberate departure
   from the ECM precedent: `equipment-catalogue.js:110-134` runs an allowlist and no schema
   validation at all, which is tolerable for a free-text catalogue and is not tolerable here — a
   `PATCH { disciplines: ['Auspex','Celerity','Vigour'] }` would otherwise write a three-discipline
   bloodline straight past the count rule and every holder's costing would quietly change. Fetch,
   merge, validate, then write.

3. **Discipline names are checked against the known set, as the seed's gate already does.**
   `seed-bloodlines.js:101-127` rejects any discipline not in `CORE_DISCS + RITUAL_DISCS`, because
   a typo like "Vigor" is drift pattern #15 arriving through the discipline field and it degrades
   just as quietly (the name resolves, the discipline never matches, the character is charged
   out-of-clan for it forever). The schema deliberately carries no enum for this
   (`bloodline.schema.js:51-54` explains why: an enum would put the discipline list back behind a
   deploy), so the check belongs in the route. Import `CORE_DISCS` / `RITUAL_DISCS` from
   `public/js/data/constants.js`, which is the same cross-boundary import the seed already makes
   (`:57`) and which **BL-3b does not delete** — only the three `BLOODLINE_*` exports go. Reject with
   400 naming the offending value.

4. **`name` is trimmed and collision-checked case-insensitively, and a collision returns 409, not a
   500.** `bloodline_name_unique` (`seed-bloodlines.js:350`) is a case-SENSITIVE index, but
   `bloodlines-cache.js:66` keys the cache on `name.trim().toLowerCase()`. So "Khaibit" and "khaibit"
   both satisfy the index and then collapse to one entry in `_byName` (`:78`) — one of the two
   documents becomes permanently unreachable for costing while both still appear in the dropdown from
   `bloodlinesByClan()` (`:151-159`). Reject on the normalised key before inserting, and catch
   E11000 as a 409 as well so the raw driver error can never reach the client as a 500. `name` must
   also be non-empty after trimming (the schema's `minLength: 1` passes `"   "`).

5. **`notes` gets an ST-gated read, because today it is unreachable.** `PUBLIC_PROJECTION`
   (`routes/bloodlines.js:67`) strips it from both public reads by design, so the admin screen cannot
   see or round-trip a field it is allowed to edit. Add `GET /api/bloodlines/admin`, ST-gated,
   returning full documents. **It must be registered BEFORE `router.get('/:id')`** or `withObjectId`
   (`:41-48`) 404s it as a malformed ObjectId. Literal-segment siblings of an `:id` route are
   established here (`/api/characters/public`, `/api/equipment_catalogue/:id/impact`); the ordering
   trap is the thing to watch. A test must pin that the **public** `GET /api/bloodlines` still omits
   `notes` after this story — that is BL-1's guarantee and this story is the most likely thing ever
   to break it.

6. **`name` and `slug` are immutable; `clan`, `disciplines` and `notes` are updatable.** Export a
   `BLOODLINE_UPDATABLE_FIELDS` set from `server/schemas/bloodline.schema.js`, mirroring
   `EQUIPMENT_CATALOGUE_UPDATABLE_FIELDS` (`equipment_catalogue.schema.js:59-69`), which excludes
   `bucket` for exactly this class of reason. Set contents: `clan`, `disciplines`, `notes`. A PATCH
   naming only immutable fields returns 400 ("No updatable fields provided"), as ECM does at
   `equipment-catalogue.js:118-123`.

   **Why rename is blocked** (this is a design decision of this story, recorded rather than
   deferred): three separate things key off the bloodline NAME, none of them by foreign key, all of
   them silently:

   - `characters.bloodline` — a plain name string, deliberately not an ObjectId FK (drift pattern #2,
     hit four times in this ecosystem). 13 live holders, 13 distinct values, 13/13 resolving.
   - `rule_grant` documents with `condition: 'bloodline'` carry `bloodline_name`, matched
     case-insensitively at `public/js/editor/rule_engine/bloodline-evaluator.js:29-32`, and are
     edited as free text in the Rules Engine admin (`public/js/admin/rules-data-view.js:307`).
   - the cache's own `_byName` index (`bloodlines-cache.js:78`).

   A rename therefore orphans every holder at once — BL-2's loud miss fires, the banner names them,
   the editor locks their disciplines and every discipline costs 4 XP/dot — and silently drops any
   bloodline grants. A cascade is worse, not better: it would perform the exact
   name-to-a-different-name transition Angelus ruled forbidden for `characters.bloodline` on
   2026-08-10, on every holder simultaneously, from a reference-data screen, with no record. So:
   **rename is not available in this story.** A mis-typed name is corrected by delete + recreate,
   which AC 8 keeps available precisely because a freshly created typo has no holders. Renaming a
   bloodline that DOES have holders is a deliberate migration script plus a data-map entry, not a UI
   action; register it in `specs/stories/deferred-work.md` with this reasoning.

   `clan` and `disciplines` ARE editable, because editing them is how an ST corrects a wrong entry
   and the correction SHOULD reach holders. Changing `clan` degrades gracefully: only
   `bloodlinesByClan()` reads it, and BL-3a's review already unions a character's stored value into
   both dropdowns so a holder still displays correctly. Changing `disciplines` re-costs holders
   immediately, which is the point, and is why AC 12 requires the impact banner.

7. **The seed script and the route must share one `deriveSlug`.** `slug` is required by the schema
   (`:33`) and the only implementation lives in `seed-bloodlines.js:78-85` — a file **BL-3b retires
   to `scripts/archive/`**. Move `deriveSlug` to a shared module (`server/lib/` already exists) and
   have both the route and the seed import it, so BL-3b's archive move cannot take it with it and
   there is never a second copy. The slug is derived server-side from `name`; it is never accepted
   from the client. A name that derives an empty slug (no letters or digits) is a 400 with a readable
   message, not a schema-pattern error.

8. **DELETE exists, and it is hard-guarded.** This is the second design decision of this story, and
   it needs stating because "bloodlines are permanent" (ruled 2026-08-10, commit `07945307`, which
   removed the `active` field) reads at first like an argument for having no delete at all.

   It is not, because of what AC 6 just ruled: with `name` immutable and no delete, **a single typo
   on creation would be permanent and visible in every ST's dropdown forever**, with no correction
   path in the application at all. Create-only plus immutable-name plus no-delete is a dead end.

   The resolution is to implement delete as *remove a mistake*, never as *retire a bloodline*, and to
   express the permanence ruling as the guard rather than as a missing feature. `DELETE` returns
   **409** when any of the following reference the document, and 204 only when none do:

   - any character whose `bloodline` matches the name **on the normalised key** — trimmed and
     case-folded, the same `_key` normalisation `bloodlines-cache.js:66` uses to resolve costing. An
     exact-match-only guard would let an ST delete a bloodline that is resolving perfectly well for a
     character carrying `" Khaibit"`;
   - any `rule_grant` document carrying a matching `bloodline_name` (see AC 6) — deleting the
     bloodline while grant rules point at it leaves those rules aimed at nothing.

   The 409 body names the blockers, as `equipment-catalogue.js:141-151` does, so the ST is told where
   to clean up rather than just refused. `GET /api/bloodlines/:id/impact` returns the same
   information for the UI (holder count, character names, referencing grant rules), ST-gated —
   deliberately unlike the ECM twin, which is public; this one joins character names to a data
   problem and the epic's posture on public reads has been minimal throughout (`notes` is the same
   ruling).

### Client — cache, live update, admin screen

9. **The cache learns to refetch, and a failed refetch must not destroy a working cache.**
   `bloodlines-cache.js:38-40` says in terms: "No WS refetch: there is no write path until BL-4."
   This is BL-4. Add `refetchBloodlines()`.

   **The obvious implementation is a live defect.** `refetchCatalogue()`
   (`equipment-catalogue-cache.js:103-106`) is two lines — null the in-flight promise, call the
   loader again — and copying it here would be wrong, because `loadBloodlines()`'s failure path
   (`:105-113`) wipes `_items`, sets `_loaded = false` and `_loadFailed = true`. The equipment
   catalogue can afford that: it degrades to an empty dropdown. This degrades to **every bloodline
   character hard-locked in the editor and costed at 4 XP/dot**, from one transient network blip,
   with a banner blaming the system. A refetch must keep the last good index when the fetch fails,
   and log. Only the boot load, which has nothing to lose, may empty the cache.

10. **A miss that the refetch resolves must stop being reported.** `MISS_UNKNOWN` entries survive a
    load by design (`:104` clears only `MISS_NOT_LOADED`), and `clearBloodlineMissesFor` (`:236-245`)
    fires from `clanDiscList`'s success path — so today a banner row only disappears when the
    affected character re-renders. After an ST creates the very bloodline the banner is complaining
    about, the row must go, without a page reload. Either clear resolved `MISS_UNKNOWN` entries on a
    successful refetch or re-render the affected surfaces; a banner that keeps asserting a fixed
    problem is how a warning stops being read (`:230-235` says this in the module's own words).

11. **Writes broadcast, and both apps listen.** Add `broadcastBloodlineUpdate(bloodlineId, op)` to
    `server/ws.js`, mirroring `broadcastCatalogueUpdate` (`:107-135`) — frame
    `{ type: 'bloodline', bloodline_id, op }`, op advisory, clients refetch regardless. Fire it from
    all three write handlers. Handle it in `public/js/data/ws.js` alongside `_handleCatalogueMsg`
    (`:186-195`) and expose `onBloodlineUpdate` through `initWS` (`:57-65`). Wire it in **both**
    boot paths, exactly as the catalogue is wired in both: `public/js/admin.js:246` and
    `public/js/app.js:1594`. Missing the player app would mean an ST adding a bloodline mid-session
    does not reach an open DT form until the player reloads, and the DT form free-rides on `app.js`'s
    priming (documented at `downtime-form.js:36`) so there is no second chance.

12. **The admin screen harvests the ECM catalogue view; it does not invent a shape.**
    New module `public/js/admin/bloodlines-admin.js`, modelled on
    `public/js/admin/equipment-catalogue-admin.js` and reusing its established structure: list table,
    toolbar with search and sort, a `+ New` button, an inline form panel below the list, `showFormMsg`
    for inline status, `apiRaw` for the DELETE so the 409 body can be read
    (`equipment-catalogue-admin.js:396-423`), and `esc()` on every interpolated value (BL-3a's review
    found unescaped bloodline names in the two dropdowns; this screen is where those names are now
    entered, so it is the last place to be casual about it).

    - **List**: name, clan, the four disciplines, holder count, actions. Holder count derived
      client-side from the `chars` array `switchDomain` already passes, as ECM does at `:60-69` and
      `:332`.
    - **Create form**: name, clan (from `CLANS`), and **exactly four discipline pickers** over
      `CORE_DISCS + RITUAL_DISCS`, plus `notes`. Save is refused until four distinct disciplines are
      chosen — **no partial save, no draft** (AC 2). The refusal must say why.
    - **Edit form**: `name` rendered read-only with the reason, reusing ECM's own
      `.ec-form-readonly` + `.ec-form-hint` treatment for its immutable `bucket` field
      (`equipment-catalogue-admin.js:248`). An impact banner when holders > 0, in ECM's words:
      held by N characters, edits apply to all.
    - **Delete**: hard-disabled with an explanatory tooltip when the impact join is non-empty, and
      the server's 409 surfaced verbatim if it fires anyway. The UI mirrors the gate; the API is the
      gate.
    - Mounted as an admin domain: sidebar button in `public/admin.html` beside
      `data-domain="equipment-catalogue"` (`:74`), a `<section id="d-bloodlines">` beside
      `#d-equipment-catalogue` (`:211-214`), and one line in `switchDomain`
      (`public/js/admin.js:304-334`).

13. **CSS is reused, not re-invented.** The ECM admin's stylesheet block is
    `public/css/admin-layout.css:10054-10204` and it covers every element this screen needs:
    `.ec-toolbar`, `.ec-table`, `.ec-form-panel`, `.ec-form-grid`, `.ec-form-field`,
    `.ec-form-readonly`, `.ec-form-hint`, `.ec-impact-banner`, `.ec-btn-primary`, `.ec-btn-sm`,
    `.ec-btn-danger`, `.ec-form-msg--ok|error|info`. Generalise the shared selectors rather than
    copying them under a `bl-` prefix — a grouped selector is the project's normalised-CSS answer to
    shared chrome. Any genuinely new class is tokens only: no bare hex, no `rgba()`, no
    `style="..."`. BL-3a shipped an inline-style fix and then a specificity regression on the
    replacement class; check the cascade, do not assume it.

14. **Tests** (targeted vitest; the full suite is NOT a gate — see Dev Notes):
    - **`server/tests/bl1-bloodlines-api.test.js:146-179` asserts that POST, PATCH and DELETE all
      404.** That block is titled "BL-1 is read-only — writes belong to BL-4". It must be
      **converted**, not deleted: same three endpoints, now asserting ST-gated success and the
      401/403 surfaces. Deleting it would remove the only regression cover on the auth boundary.
    - auth matrix: each write 401 unauthenticated, 403 as `player`, 2xx as `st`;
    - POST: creates, derives the slug, stamps `created_at`/`updated_at`, ignores a client `_id`;
    - POST rejects 3 and 5 disciplines, a repeat, an empty string, an unknown discipline name, a
      blank/whitespace name, and a case-differing duplicate name (409, never 500);
    - PATCH: ignores `name`/`slug`/`created_at`, writes `clan`/`disciplines`/`notes`, bumps
      `updated_at`, and **400s on a merged document that fails the 4-discipline rule**;
    - DELETE: 409 with a character holding the name, 409 with a character holding a
      case/whitespace-differing variant, 409 with a referencing `rule_grant`, 204 when clean;
    - `GET /api/bloodlines/admin` returns `notes` and is ST-gated; the public `GET /api/bloodlines`
      still omits it;
    - cache: `refetchBloodlines()` re-indexes on success and **preserves the last good index on
      failure** (this is the AC 9 defect, and it is the one most likely to be got wrong);
    - a resolved `MISS_UNKNOWN` clears after a refetch (AC 10);
    - `server/tests/repo-no-nul-bytes.test.js` stays green.

15. **In-browser verification is required for this story, not deferred.** BL-2 and BL-3a both
    declared a browser gap and neither closed it. This story adds an entire screen that no test
    renders. At minimum: create a bloodline, see it appear in the sheet's bloodline dropdown without
    a reload, assign it to a test character, confirm its disciplines cost 3 XP/dot on the sheet AND
    in the DT form, edit a discipline and see the cost follow, then delete a bloodline with no
    holders and confirm the delete is refused for one with holders.

## What this story is NOT

- **No deletion of `BLOODLINE_DISCS` / `BLOODLINE_CLANS` / `APPROVED_BLOODLINES`, and no retirement
  of `seed-bloodlines.js`** — that is **BL-3b**, which this story unblocks. AC 7 moves `deriveSlug`
  out of the seed so BL-3b's archive move is clean, but the seed keeps working and keeps reading the
  constants.
- **No change to `public/js/dev-fixtures.js`** — BL-3b. Note for the dev: it intercepts
  `GET /api/bloodlines` for the **player app only** (`:33-37`), so the admin screen is not
  fixture-backed and local testing of this story needs a real API and database.
- **No write-once enforcement on `characters.bloodline` or `characters.clan`, and no editor lock on
  either** — **BL-5**. This story governs the CATALOGUE; BL-5 governs what a character may hold.
- **No player-visible `description` field.** `notes` is ST bookkeeping (ruled 2026-08-10). Flavour
  text for players, if ever wanted, is a separate `description` field as the equipment catalogue has,
  and it is a separate decision with a separate player-facing surface. Deliberately excluded.
- **No `active` / soft-retire field, and no reintroduction of one by another name.** Ruled
  2026-08-10; `bl1-bloodline-schema.test.js` rejects `active` as an unknown property specifically so
  it cannot return as a BL-4 convenience. AC 8's guarded delete is the answer instead.
- **No change to the two public GET routes' shape.** They stay unauthenticated, they keep projecting
  `notes` out, and AC 5 pins both.
- **No collection-level MongoDB validator, no unique index on `slug`, no rename cascade.**
- **No bloodline GRANT editing.** Free specialities and merits granted by a bloodline live in
  `rule_grant` documents and are edited in the Rules Engine admin
  (`public/js/admin/rules-data-view.js`). Creating a bloodline here gives it disciplines and nothing
  else, and the screen should not imply otherwise. Only Gorgons carries grants today.
- **No `wizard.js` work** — dead, zero importers, #1095.

## Tasks / Subtasks

- [x] Task 1 (AC 7): move `deriveSlug` from `seed-bloodlines.js:78-85` into a shared `server/lib/`
      module; re-point the seed's import; prove the seed still passes its existing suite.
- [x] Task 2 (AC 1, 2, 3, 4, 6, 7): `POST /api/bloodlines` — ST-gated, slug derived, name trimmed and
      collision-checked on the normalised key, disciplines checked against `CORE_DISCS +
      RITUAL_DISCS`, document validated against `bloodlineSchema`, E11000 mapped to 409.
- [x] Task 3 (AC 1, 2, 6): `PATCH /api/bloodlines/:id` — allowlist from a new
      `BLOODLINE_UPDATABLE_FIELDS`, merged-document validation, `updated_at` bumped.
- [x] Task 4 (AC 1, 8): `GET /api/bloodlines/:id/impact` and `DELETE /api/bloodlines/:id` with the
      character + `rule_grant` guard and a naming 409 body.
- [x] Task 5 (AC 1, 5): `GET /api/bloodlines/admin`, registered **above** `/:id`, returning `notes`.
- [x] Task 6 (AC 11): `broadcastBloodlineUpdate` in `server/ws.js`; fired from all three writes.
- [x] Task 7 (AC 9, 10): `refetchBloodlines()` in `bloodlines-cache.js` that preserves the last good
      index on failure and clears misses the refetch resolves.
- [x] Task 8 (AC 11): client `ws.js` frame handler + `onBloodlineUpdate` wired in `admin.js` **and**
      `app.js`.
- [x] Task 9 (AC 12, 13): `public/js/admin/bloodlines-admin.js` + the three mount points in
      `admin.html` / `admin.js`; CSS by generalising the ECM block.
- [x] Task 10 (AC 14): tests, including the conversion of `bl1-bloodlines-api.test.js:146-179`.
- [x] Task 11 (AC 15): in-browser verification. Done for real, against a running API, a running
      frontend and a real database, with one documented limit (the player app's fixture
      interceptor). See the Dev Agent Record for exactly what was observed versus tested, and the
      Senior Developer Review's "AC 15, re-run for real" for the assignment step the first pass
      recorded no evidence of.
- [ ] Task 12: PR to `main` (Angelus's word). *(GATED — not done.)*

## Dev Notes

### What each file being changed looks like today

| File | Current state | This story |
|---|---|---|
| `server/routes/bloodlines.js` | 81 lines, two public GETs, `withObjectId` at `:41`, `PUBLIC_PROJECTION` at `:67`. Header and `:51-53` both say the factory's `authMiddleware` param exists unused for BL-4 | add five handlers; the param stops being unused |
| `server/schemas/bloodline.schema.js` | Draft-07, `additionalProperties: false`, required `name`/`slug`/`clan`/`disciplines`, `disciplines` exactly 4 distinct non-empty (`:55-61`), `notes` nullable string (`:75`), no `active` (`:63-69`) | add `BLOODLINE_UPDATABLE_FIELDS`; **no shape change** |
| `server/scripts/seed-bloodlines.js` | The collection's only writer. `deriveSlug` at `:78-85`, integrity gate at `:97-182`, unique index at `:350` | `deriveSlug` moves out and is imported back. Nothing else |
| `server/ws.js` | Three broadcasters; `broadcastCatalogueUpdate` at `:107-135` is the template | add a fourth |
| `public/js/data/bloodlines-cache.js` | 252 lines. Load + miss registry. `:38-40` explicitly defers WS refetch to BL-4. Failure path wipes the index (`:105-113`) | add `refetchBloodlines()` that does **not** wipe on failure |
| `public/js/data/ws.js` | `_handleCatalogueMsg` at `:186-195`, `initWS` opts at `:57-65` | add a `bloodline` frame |
| `public/js/admin.js` | imports the cache at `:23`, primes it at `:1314`, wires `onCatalogueUpdate` at `:246`, `switchDomain` at `:304-334` | add the domain + the WS wiring |
| `public/js/app.js` | primes the cache at `:729`, mounts the banner at `:736`, wires `onCatalogueUpdate` at `:1594` | add the WS wiring only. No admin UI in the player app |
| `public/admin.html` | sidebar buttons `:60-77`, domain sections `:190-220` | one button, one section |
| `public/css/admin-layout.css` | ECM admin block at `:10054-10204` | generalise, do not duplicate |

### The precedent being harvested, and where this story deliberately departs from it

`server/routes/equipment-catalogue.js` and `public/js/admin/equipment-catalogue-admin.js` are the
same problem solved once already: Mongo-backed reference data, public reads, ST-gated writes, an
admin CRUD screen, a WS frame that refreshes every open client. Reuse the route shape, the auth
chain, the factory, the 404-on-malformed-id behaviour, the allowlisted PATCH, the 409-on-referenced
DELETE, the impact endpoint, the list/form/message UI, and the whole `.ec-*` stylesheet.

Three departures, each with a reason:

1. **PATCH validates the merged document** (AC 2). ECM validates nothing on PATCH. Bloodlines carry a
   count rule that a partial update can break.
2. **The impact endpoint is ST-gated** (AC 8). ECM's is public. This one joins character names to a
   data problem, and this epic has kept its public surface minimal since BL-1 (`notes`).
3. **The refetch preserves last-good state** (AC 9). ECM's two-line refetch would hard-lock every
   bloodline character on a transient failure.

Epic PP's rule editor (`public/js/admin/rules-data-view.js`) is the second in-repo data point and is
worth a look for its field-rendering helper `_ff` (`:307` shows the "Bloodline name" field), but its
generic multi-collection shape is a poorer fit than ECM's single-collection screen. Prefer ECM.

### The three name-keyed referents (why AC 6 and AC 8 are shaped the way they are)

There is no foreign key anywhere in this epic, on purpose (drift pattern #2). The bloodline NAME is
matched as a string by:

1. `characters.bloodline` — 13 holders, 13 distinct values, 13/13 resolving as of 2026-08-10.
   Resolved through `bloodlines-cache.js:66`'s trim + case-fold, so the guard must normalise the same
   way.
2. `rule_grant` documents with `condition: 'bloodline'` — matched case-insensitively at
   `bloodline-evaluator.js:29-32`, schema field at `server/schemas/rules/rule-grant.schema.js:18`,
   edited as free text at `rules-data-view.js:307`, seeded historically by
   `server/scripts/archive/seed-rules-bloodlines.js` (Gorgons only). **Re-measure this against live
   in the data-lock** — the archived seed is not proof of the current collection.
3. The cache's `_byName` index (`bloodlines-cache.js:78`).

Nothing warns when any of these stops resolving. That is the entire argument for immutable `name`.

### Environment and hard rules

- **The full test suite is not a gate.** Six known permanent reds carried from BL-3a: #1116, #1115,
  #1125, #1117, plus `issue-837-xp-totals-deprecation` and `n8-mandragora-prereq` (both parse
  errors). Run this story's own specs plus every existing spec file it touches. `cd server &&
  npm run test`. Never pipe through `tail` — it masks the exit code.
- `server/tests/repo-no-nul-bytes.test.js` must stay green. It has caught a transient NUL byte from a
  shell edit in each of the last two stories in this epic; that is what it is for.
- **Normalised CSS is mandatory.** Tokens only, reuse before invent, grouped selectors for shared
  chrome. No bare hex, no `rgba()`, no inline `style="..."`.
- British English throughout (Defence, Armour, capitalise). No em-dashes in any string the app prints.
- Branch: continue on `bl/bl-1-bloodline-collection`. PR direct to `main`, **never** through `dev`.
  No push or merge without Angelus's explicit word in his current message.
- **The live collection may still be empty.** As of 2026-08-10 `GET /api/bloodlines` returns `[]` on
  live and the seed's `--apply` has never been run there. Against an empty collection
  `bloodlinesResolvable()` (`bloodlines-cache.js:126`) is false and every bloodline character is
  already locked — so the seed is a precondition for this screen being anything other than an empty
  table with a Create button. See the open question below.

### References

- Issue **#1008**; `specs/stories/sprint-status.yaml` under `epic-bl` (lines 899-923) for the epic's
  rulings and sequencing
- **BL-1, BL-2 and BL-3a stories**, and BL-3a's Senior Developer Review — the `ReferenceError` and the
  destructive-clan-change findings are both instructive for a story that adds a new write path
- `D:\Terra Mortis\data-map.md` — the `bloodlines` collection entry (`:301-337`), the Bloodlines
  constants entry (`:238-299`), `characters.bloodline` (`:367+`), `characters.clan` (`:339+`), and
  drift patterns **#2**, **#15** and **#16**
- Precedent: `server/routes/equipment-catalogue.js`, `public/js/admin/equipment-catalogue-admin.js`,
  `server/schemas/equipment_catalogue.schema.js:59-69`, `public/css/admin-layout.css:10054-10204`,
  `server/ws.js:107-135`, `public/js/data/equipment-catalogue-cache.js`
- Commit `07945307` — "feat(bl-1)!: drop the `active` field, bloodlines are permanent"

## Open questions for Angelus

1. **Does the seed get applied to live before this story merges, or after?** `GET /api/bloodlines`
   returns `[]` on live today and `--apply` is described in the seed's own header as an operational
   act for the ST. If it is still unrun when BL-4 lands, the first thing the new screen shows is an
   empty table, and every bloodline character stays locked until either the seed runs or 23
   bloodlines are typed in by hand. Recommendation: run `node scripts/seed-bloodlines.js --apply`
   against live as part of the same deploy window, before this screen is used in anger. This is an
   operational decision, not a code one.
2. **Should a rename script be written now, or only when something needs renaming?** AC 6 blocks
   rename in the UI and proposes registering the migration-script route in `deferred-work.md`.
   Writing it speculatively for a case that has never occurred looks like the wrong trade, but it is
   your call and the answer changes nothing else in the story.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5[1m]`), via `bmad-dev-story`. 2026-08-11.

### Debug Log References

**Tests.** ~~`Test Files 24 passed · Tests 442 passed`~~ — **corrected by the review below.** No
command or file list was preserved for that batch, and the categories the sentence names total 17
files, not 24, so the number cannot be reproduced or audited. The gate that IS reproducible, and
that the review re-ran, is named exactly in the review's own regression line.

**The NUL guard fired once.** ~~A false alarm from a file mid-write.~~ **Cause corrected by the
review below:** it is a synchronous walk over several thousand files, which takes 9-16 seconds on a
cold filesystem cache inside a parallel batch and 165ms warm and alone, against vitest's 5s default
timeout. So it went red on the first run of a batch and green on every run after, which reads
exactly like a transient byte and is not one. The test now carries an explicit 60s timeout.
Recorded because "the guard went red once" is the kind of thing that should not be discovered later
in a git log — and because the explanation written down for it was wrong.

**One pre-existing red is NOT one of the six carried from BL-3a.**
`server/tests/issue-836-legacy-tracker-cache-removed.test.js` fails at import with
`ENOENT: public/js/suite/tracker.js`. That file was deleted from HEAD by commit `58c88b5b` (USF
Phase 0 Stage A) and the suite still reads it unconditionally. Nothing to do with this story; not
touched. It should join the known-reds list, or be repaired, whichever the epic prefers.

**PATCH merged-document guard, confirmed against a running server, not only a mock.** Fired from the
browser to bypass the client's own refusal:

```
PATCH { disciplines: ['Auspex','Celerity','Vigour'] }  ->  400
"The resulting bloodline would fail schema validation. Exactly four distinct, named
 disciplines and one of the five clans are required."
document after: still 4 disciplines
```

**Delete guard, both blockers, confirmed against a running server:**

```
DELETE Khaibit (2 holders, one of them carrying "  khaibit ")   -> 409
  "Cannot delete \"Khaibit\": held by 2 characters."
  character_names: ["ZZ BL4 Browser Holder", "ZZ BL4 Sloppy Holder"]

DELETE Gorgons (0 holders, 3 rule_grant references)             -> 409
  "Cannot delete \"Gorgons\": referenced by 3 bloodline grant rules."
  grant_rule_labels: ["merit: Area of Expertise: snakes",
                      "merit: Interdisciplinary Specialty: snakes",
                      "speciality: Animal Ken: snakes"]
```

The Gorgons result is the data-lock's live finding reproduced exactly: 3 documents, all
`bloodline_name: "Gorgons"`, 2 merit grants and 1 speciality grant.

**AC 9's failure path, observed with the API genuinely dead** (process stopped, `/api/health`
returning nothing), calling `refetchBloodlines()` from the admin app's own console:

```
before: { count: 24, resolvable: true }
refetch returned: false
after:  { count: 24, resolvable: true, loadFailed: false }
cost of an in-clan discipline: still 3
misses registered: []
```

The two-line ECM copy would have left `count: 0`, `resolvable: false` and every bloodline character
hard-locked at 4 XP/dot behind a banner blaming the system. This is the one AC the story predicted
would be got wrong, and it is the one with a live observation behind it rather than only a mock.

### Completion Notes List

**What was verified in a browser, and what was verified only by test.** Stated precisely, because a
vague "verified" is what this story was written to prevent.

*Environment.* A local API (`node index.js`) and a local static frontend (`npx http-server public
-p 8080`) were run, and the admin app was driven in Chrome. The API was pointed at
**`tm_suite_test`** via `MONGODB_DB`, not at production. This repo's `server/.env` holds live
credentials and there is no sandbox mode, so the alternative was writing reference data to the live
chronicle in order to test a screen. The test database was seeded with the real 23 bloodlines
(`MONGODB_DB=tm_suite_test node scripts/seed-bloodlines.js --apply`) plus two throwaway holder
characters, so the screen had realistic content and a real holders-above-zero case. All of it was
removed afterwards; see "Residue" below.

*Observed live in the browser, no reload at any point:*

1. The **Bloodlines** sidebar entry, the domain section, and the list rendering 23 rows with name,
   clan, four discipline chips, holder count and actions.
2. **The holder join agreeing with the delete gate.** Khaibit showed `Holders 2` and a **disabled**
   Delete button, having matched both `"Khaibit"` and `"  khaibit "`. Every other row showed 0 and an
   enabled Delete.
3. **The no-partial-save refusal**, rendered inline in the error token: *"Choose exactly 4
   disciplines. 3 chosen so far. A bloodline with fewer than four is not a draft, it is invalid, so
   there is no partial save."*
4. **Creating `ZZ-BL4-Verify-Delete-Me`** (Daeva; Auspex/Celerity/Vigour/Majesty). The list went to
   24, and the costing cache picked it up immediately: `bloodlineDiscs()` returned the four,
   `bloodlinesByClan().Daeva` returned `["Lidérc","Zelani","ZZ-BL4-Verify-Delete-Me"]` — which is
   literally what the sheet's bloodline dropdown renders from — and `isInClanDisc` costed its four
   disciplines at **3 XP/dot** and everything else at 4.
5. **The edit form**: `name` rendered read-only with its reason via `.ec-form-readonly` /
   `.ec-form-hint` and no input element, and `notes` round-tripped from `GET /api/bloodlines/admin`.
6. **Editing a discipline, cost following immediately**: swapping Majesty for Protean moved Majesty
   from 3 to 4 and Protean from 4 to 3 in the same page, with the table row updating in step.
7. **Deleting through the screen**: the confirm text was recorded verbatim, the row and the count
   went back to 23, and both `bloodlineDiscs()` and the Daeva dropdown stopped returning it. No
   error dialog, i.e. a clean 204.
8. **The WS chain end to end in the admin app.** A bloodline created by `curl` from outside the
   browser entirely appeared in the open page's cache and dropdown, and costed at 3 XP/dot, without
   a reload. The `bloodline` frames were also captured directly off the socket:
   `{"type":"bloodline","bloodline_id":"...","op":"update"}` and the matching `"op":"delete"`.
9. **AC 9's failure path against a dead API**, quoted in full in the Debug Log above.

*Verified by test only, with the reason:*

- **The player app's `onBloodlineUpdate` last hop.** `public/js/dev-fixtures.js:33-35` intercepts
  `GET /api/bloodlines` under `local-test-token` and serves the list from the constants, so the
  player app cannot observe a real bloodline change on a local machine at all — the story's own
  "What this story is NOT" section flags this and assigns the fix to BL-3b. What WAS established:
  the frame is broadcast and reaches a connected browser client (captured above), the wiring in
  `app.js` is asserted by test, and the identical wiring in `admin.js` was watched working end to
  end. Registered in `deferred-work.md` to be re-verified when BL-3b lands. This is the one gap, and
  it is an environment limitation with a named owner, not an untested path.
- **The DT form quoting a price for a new bloodline.** BL-3a collapsed the DT form onto the same
  `isInClanDisc` the sheet uses, and that function was exercised in the browser against a freshly
  created bloodline (item 4 above). There is no second implementation left to diverge.
  **The review below re-ran this leg in the browser rather than by argument**, and also closed the
  assignment step this list never records: see "AC 15, re-run for real".
- **The 401/403 matrix**, which needs a non-ST identity the local test bypass cannot produce: the
  bypass mints an ST unconditionally. Covered by 10 assertions across the two API suites.

*One diagnostic worth recording, because it looked like a defect for several minutes.* The player
app's WS did not connect at all at first. Cause: `_resolveUser` in `server/ws.js` resolves
`local-test-token` by finding a player with role `st`/`dev` in the **players** collection, and
`tm_suite_test` had none, so the upgrade was rejected 401 before any of this story's code ran. An
artefact of choosing the safe database, not a code defect; a throwaway ST player row fixed it and
was removed afterwards.

**Design decisions, all departures from the ECM precedent deliberate:**

1. **`referencesFor` reads both collections whole and filters in memory** rather than querying with a
   case-insensitive regex. The sets are tiny (13 bloodline-carrying characters, 3 bloodline grant
   rules) and this way the guard uses literally the same `normKey` the cache resolves costing
   through, instead of a regex that agrees with it by inspection. The whole delete guard exists
   because exact matching would be wrong; matching it a second, similar-but-separate way would be
   the same mistake one level down.
2. ~~**The collision check is a pre-insert scan on the normalised key, with E11000 as a backstop.**
   The index cannot do this job: `bloodline_name_unique` has no collation (re-confirmed by the
   data-lock) ... The scan is what prevents that; the E11000 catch only closes the race, and only so
   a driver error can never surface as a 500.~~ **Wrong, and corrected by the review below.** The
   scan is a read-then-write with no lock, so it does not close the race at all: two concurrent
   POSTs for "Khaibit" and "khaibit" could both clear it, and a case-SENSITIVE index cannot raise
   the E11000 the handler catches. The index was given a `strength: 2` collation
   (`server/lib/bloodline-name-index.js`), so the DATABASE now enforces the normalised rule
   atomically. The scan stays, but its job is the message — a 409 naming the bloodline in the way —
   not the guarantee.
3. **The admin screen reads `GET /api/bloodlines/admin`, not the public list.** It edits `notes`, and
   the public reads project `notes` out. Reading the public list would have made the field
   round-trip silently lossy: every save would have written `notes: null` back over whatever was
   there.
4. **The screen's duplicate-name check blocks rather than warning.** ECM's is a soft `confirm()` an
   ST can override, which is right for a catalogue where two similarly-named items are merely
   untidy. Here the second document is unreachable for costing, so overriding produces a bloodline
   that exists in the dropdown and silently never resolves.
5. **`refetchBloodlines` does not share `_inFlight`.** The reason stands: joining them would mean a
   boot load failing after a successful refetch could still wipe what the refetch had just repaired.
   ~~Both apps await boot priming before calling `initWS`, so the two cannot overlap in practice.~~
   **That justification was false and is corrected by the review below** — it is true of `app.js`
   and false of `admin.js`, which calls `init()` without awaiting it (`:220`) and opens the socket
   immediately (`:226`). The ordering is now enforced inside the cache by a monotonic generation
   counter rather than assumed of the callers, which also closes the separate last-response-wins
   race between two overlapping refetches.
6. **The write handlers call `refetchBloodlines()` directly, not only via their own WS echo.** The
   write is what changes costing, and the screen should not depend on the socket being up for that
   to be true on the machine that made the change.
7. **CSS: the ECM block was retitled and shared, not duplicated.** The screen uses `.ec-admin`,
   `.ec-toolbar`, `.ec-table`, `.ec-form-*`, `.ec-impact-banner` and `.ec-btn-*` directly; only
   `.bl-disc-cell` and `.bl-disc-grid` are new, and the discipline chip joins the existing tag
   selector as a grouped selector (`.ec-bucket-tag, .bl-disc-tag`) rather than restating it. Tokens
   only, no hex, no `rgba()`, no inline styles; a test pins all three.
8. **Two pure functions are exported from the view module** (`buildHoldersIndex`,
   `validationRefusal`) so the decisions the screen makes are testable without a DOM, which this
   runner does not have. That is the shape BL-2's banner module already established with
   `buildBloodlineWarnHtml`; nothing else was exported to make it testable.

**Two guard tests converted rather than deleted.** `bl1-bloodlines-api.test.js` asserted POST /
PATCH / DELETE all 404 under the heading "BL-1 is read-only"; it now asserts the 401/403/2xx
boundary for the same three endpoints, alongside the public reads, so the file still holds the whole
auth surface in one place. `bl2-bloodlines-cache.test.js` asserted `refetchBloodlines` was
`undefined`; it now asserts it is a function, with a note saying which suite owns its semantics.
Deleting either would have removed cover rather than updated it.

**Scope held.** No constant deleted, and `seed-bloodlines.js` still reads them and still works
(BL-3b). No `dev-fixtures.js` change (BL-3b). No write-once enforcement on `characters.bloodline` or
`characters.clan`, and no editor lock (BL-5). No `description` field, no `active` field or anything
standing in for one, no rename and no cascade, no grant editing, no `wizard.js`. The two public GETs
are unchanged and a test pins that they still omit `notes`. No commit, no push, no PR.

**Residue: none.** Every fixture was removed and the removal verified. `tm_suite_test` is back to 0
bloodlines, 0 `ZZ BL4` characters and 0 fixture players. Production (`tm_suite`) was re-queried
after the browser pass and matches the data-lock exactly: **0 bloodlines, 41 characters, 13 holding
a bloodline, 3 `rule_grant` documents with `condition: 'bloodline'`**, and zero documents matching
any of this session's fixture markers. Nothing was ever written to a production character.

### File List

New:

- `server/lib/bloodline-slug.js`
- `public/js/admin/bloodlines-admin.js`
- `server/tests/bl4-bloodlines-write-api.test.js` (33 tests)
- `server/tests/bl4-bloodlines-refetch.test.js` (15 tests)
- `server/tests/bl4-bloodlines-admin-view.test.js` (26 tests)

Modified:

- `server/routes/bloodlines.js` — five handlers added inside the existing factory; the
  `authMiddleware` param stops being unused; `/admin` and `/:id/impact` registered above `/:id`
- `server/schemas/bloodline.schema.js` — `BLOODLINE_UPDATABLE_FIELDS`; no shape change
- `server/scripts/seed-bloodlines.js` — `deriveSlug` moved out and re-exported
- `server/ws.js` — `broadcastBloodlineUpdate`
- `public/js/data/bloodlines-cache.js` — `refetchBloodlines`, `_clearResolvedMisses`, header note
- `public/js/data/ws.js` — `bloodline` frame handler + `onBloodlineUpdate` through `initWS`
- `public/js/admin.js` — module import, `switchDomain` line, WS wiring
- `public/js/app.js` — WS wiring only
- `public/admin.html` — one sidebar button, one domain section
- `public/css/admin-layout.css` — block retitled as shared chrome; `.bl-disc-tag` grouped onto the
  existing tag selector; `.bl-disc-cell` and `.bl-disc-grid` added
- `server/tests/bl1-bloodlines-api.test.js` — the read-only guard block converted
- `server/tests/bl2-bloodlines-cache.test.js` — the no-refetch scope guard converted
- `specs/stories/deferred-work.md` — the rename migration and the player-app verification gap
- `specs/stories/bl-4-admin-crud.story.md`, `specs/stories/sprint-status.yaml`

Added by the review pass below:

New:

- `server/lib/bloodline-name-index.js` — the collated unique-name index, shared by the seed and the route
- `server/lib/bloodline-delete-guard.js` — the check / delete / re-check / restore ordering, injectable

Modified:

- `server/routes/bloodlines.js` — collated index ensured before the first write; discipline
  canonicalisation; the delete rewired through the guard; `grant_rule_count` on the admin list
- `server/scripts/seed-bloodlines.js` — index creation moved to the shared module
- `server/ws.js` — one guarded `_fanOut`; all four broadcasters use it
- `public/js/data/bloodlines-cache.js` — `_generation`; the corrected header note
- `public/js/admin/bloodlines-admin.js` — staleness guard in `openEditForm`; `deleteDisabledReason`;
  the load-error state and its retry; the em-dashed placeholder replaced
- `server/tests/bl4-bloodlines-write-api.test.js` — +10 tests
- `server/tests/bl4-bloodlines-refetch.test.js` — +3 tests
- `server/tests/bl4-bloodlines-admin-view.test.js` — +10 tests, and the broadcast test strengthened
- `server/tests/repo-no-nul-bytes.test.js` — explicit 60s timeout, with the real cause recorded
- `specs/stories/code-review/bl-4-admin-crud-codex-findings.md` — the external findings (new)

## Senior Developer Review (AI)

**Reviewer:** external adversarial 3-pass review (Codex), verified and patched internally.
**Date:** 2026-08-11. **Outcome:** Changes Requested → 12 fixes applied → **Approve.**

**Passes:** Pass 1 blind (diff only) · Pass 2 diff + repo · Pass 3a spec, 3b record. 4 High, 6
Medium, 5 Low. Its own validation notes disclose real pass isolation, the exact commands it ran, and
what it could not verify — including that its scoped vitest gate connected to `tm_suite_test`. Two
findings were duplicates of each other (the grant-only Delete button, filed once as Medium against
AC 12 and once as Low against the list view) and one High was the record-level twin of another.
Nothing was dismissed as a false positive this time; the calibration expectation that roughly half
of any confident finding is unproven did not hold here, and that is worth recording because it is
the opposite of the last story's result.

### The three that mattered

**1. The uniqueness rule was not enforced anywhere that could enforce it.** `routes/bloodlines.js`
read the whole collection, normalised, compared, and inserted if clear — a read-then-write with no
lock. The comment called the E11000 catch the backstop that "closes the race"; it cannot, because
`bloodline_name_unique` was raw and case-SENSITIVE (`seed-bloodlines.js:350`), so to the index
"Khaibit" and "khaibit" are simply two different names. Two concurrent creates could both land, both
appear in the dropdown, and collapse onto one `_key` in the cache, leaving one document permanently
unreachable for costing. Fixed at the database: `strength: 2` collation, in a shared module the seed
and the route both use, with an in-place upgrade path for the existing index that refuses to drop it
if the collection already holds a case-different pair. The route now ensures the index before its
first write — the seed script is not a precondition of this screen working, and a collection created
entirely through POST would otherwise have carried no unique index at all, which the original
implementation quietly depended on.

**2. DELETE's reference guard was a read-then-write too.** `referencesFor()` read `characters` and
`rule_grant`, then `deleteOne()` ran. A character assigned the name in that window was invisible to
the guard, and the delete succeeded on a now-referenced bloodline — the holder left costed fully
out-of-clan behind BL-2's banner. A MongoDB transaction does **not** fix this and it is worth
recording why, since it is the obvious reach: transactions conflict on writes to the same documents,
and a concurrent insert into `characters` touches nothing this transaction writes, so it would
commit exactly as before. MongoDB has no predicate locking. The fix is to check again after the
delete and put the document back — same `_id`, verbatim — if a reference has appeared.

**3. The edit form could save one bloodline over another.** `openEditForm(id)` sets `_editingId`
synchronously and then awaits `/impact`, but rendered the closure-captured document with no check
that it was still the open edit. Edit(A), Edit(B), A's response arriving last: the form shows A
while `_editingId` says B, and Save PATCHes B with A's clan and disciplines, silently re-costing
every holder of B. One line, and reproduced live in the browser afterwards by delaying A's `/impact`
by 1.5s — the form correctly keeps B.

### Fixes applied (12)

1. **[High] Case-different creates could both land** — collation on the index, ensured from the
   route (`server/lib/bloodline-name-index.js`).
2. **[High] The delete guard was not atomic** — re-check and restore
   (`server/lib/bloodline-delete-guard.js`), with the transaction reasoning recorded at the site.
3. **[High] Out-of-order `/impact` responses** — staleness guard in `openEditForm`.
4. **[High] The record claimed E11000 closed the race** — Dev Agent Record design decision 2 struck
   through and corrected rather than silently rewritten.
5. **[Med] One throwing `ws.send` could abort a broadcast and reject a committed write** — every
   broadcaster is called after the Mongo mutation and before the HTTP response, and Express 5
   forwards the rejection, so the ST would see a 500 for a write that succeeded. All four
   broadcasters shared the gap (it is the ECM/STM pattern, not something BL-4 introduced), so all
   four now fan out through one guarded `_fanOut`. Fixing the three pre-existing ones is beyond what
   the finding required; leaving three copies of a bug next to its fix was the worse option.
6. **[Med] Admin boot opens the WS without awaiting priming, and refetches were last-response-wins**
   — fixed as one thing, with a monotonic `_generation` in the cache, because they are one thing:
   an older answer landing last. The failure branch matters most, since it is the path that EMPTIES
   the cache; a superseded boot failure now touches nothing. This is more robust than fixing
   `admin.js`'s await ordering, which would not stop two WS frames racing each other.
7. **[Med] The record's "both apps await priming" justification was false** — corrected in place;
   the guarantee now lives in the cache rather than in an assumption about callers.
8. **[Med] AC 12's Delete-disable ignored grant-only references** — `GET /api/bloodlines/admin` now
   computes `grant_rule_count` for the whole list in one extra read (not an `/impact` fetch per row),
   and the row decision moved into an exported `deleteDisabledReason`.
9. **[Med] AC 15's literal steps were never run** — re-run for real; see below.
10. **[Med] The 24-file/442-test claim was unreproducible** and **[Low] the NUL-scan file count was
    wrong** — both corrected in the Dev Agent Record, and the NUL guard's real failure cause found
    and fixed (a 5s default timeout against a 9-16s cold scan, not a byte mid-write).
11. **[Low] Discipline names were rejected for casing or whitespace** the route could resolve
    exactly — now trimmed and canonicalised to the known spelling before validation and storage, so
    what is stored always matches the character's own discipline keys literally.
12. **[Low] The broadcast test could not see a lost broadcast**, **[Low] a failed list read rendered
    as an empty collection**, **[Low] the discipline placeholder printed em dashes** — the test is
    now sliced per handler, the screen distinguishes "could not load" from "nothing there" and
    offers a retry, and the placeholder reads "Choose a discipline".

Every fix proved to discriminate by single-change revert: twelve reverts, twelve failures, each for
the stated reason. One of those reverts failed to discriminate on the first attempt and that is the
more useful finding: the collation test inherited a collated index left in `tm_suite_test` by the
previous run, so it passed with the collation removed. The test now drops the index and builds a
fresh router first. A test whose subject is a database object has to own that object's state.

### AC 15, re-run for real

Local API (`MONGODB_DB=tm_suite_test node index.js`, confirmed against the startup line naming the
database) plus `http-server public -p 8080`, driven in Chrome. Production was never connected to for
writing, and was re-read afterwards.

Observed, no reload except where stated:

1. Created **ZZ BL4 REVIEW Bloodline** (Mekhet; Auspex/Celerity/Obfuscate/Protean) on the screen.
   The three-discipline refusal fired first, verbatim.
2. **Assigned it to a test character** — the step this story required and the original pass never
   recorded — through the sheet's own bloodline dropdown, which offered it without a reload, and
   saved to `tm_suite_test`. Re-read from the API: `bloodline: "ZZ BL4 REVIEW Bloodline"`.
3. **3 XP/dot on the sheet, with its control.** With the bloodline: 3 XP entered against Protean
   buys **1 dot**. With the bloodline cleared: the same 3 XP buys **0 dots**. Protean moves between
   the editor's out-of-clan and in-clan groups in step.
4. **3 XP/dot in the DT form.** XP Spend → Discipline for a bloodline-holding character renders
   `Nightmare (4 → 5) [clan, 3 XP]` beside `Auspex (0 → 1) [out, 4 XP]`. Nightmare is not a Ventrue
   clan discipline; it is in-clan solely because of the bloodline. **Limit, measured not assumed:**
   in the player app `dev-fixtures.js` replaces `window.fetch` wholesale under `local-test-token`, so
   even a raw `fetch('/api/bloodlines')` in that page returns the fixture list derived from the
   constants. The DT form therefore cannot see a bloodline created seconds earlier on any local
   machine. What is shown above is the rule rendering live from the cache; the last hop stays
   BL-3b's, as already registered.
5. **The delete gate, both blockers, from the screen.** Holder present: Delete disabled, "Held by 1
   character..."; API returns 409 naming `ZZ BL4 REVIEW Holder`. Grant present and **zero holders**:
   Delete disabled, "Referenced by 1 bloodline grant rule in the rules engine..." — the state AC 12
   required and BL-4 shipped enabled. API returns 409 naming `speciality: Animal Ken: snakes`.
6. **Clean delete.** References removed, both deleted through the screen: 204, no alert, list and
   cache empty, and the *genuine* empty state returned rather than the error state.
7. **The load-error state.** Token broken deliberately: "The bloodlines list could not be loaded, so
   this screen is showing nothing rather than an empty collection. Invalid or expired token", with a
   Try again button that recovered the list once the token was restored.
8. **The edit race** (fix 3) reproduced and defeated, as described above.
9. **Discipline canonicalisation and the 409**, live: `['auspex ', ' CELERITY', 'Majesty', 'Vigour']`
   stored as `["Auspex","Celerity","Majesty","Vigour"]`; `"  zz bl4 review granted "` refused 409.
10. `notes` round-tripped through `GET /api/bloodlines/admin` and stayed absent from the public read.

**Residue: none.** Every fixture removed and the removal verified. Production (`tm_suite`) re-read
afterwards and matches the data-lock exactly: **0 bloodlines, 41 characters, 13 holding a bloodline,
3 `rule_grant` documents with `condition: 'bloodline'`**, zero documents matching any marker from
this session.

### Regression after patching

`cd server && npx vitest run` over the 18 touched suites — the three BL-4 files, the six other
BL-1/BL-2/BL-3a files, `bloodline-parallel-write`, `repo-no-nul-bytes`, `stm-9-ws-broadcast` and the
three equipment/ECM suites that share the broadcaster and the admin sidebar:
**`Test Files 18 passed · Tests 342 passed`**. The mandated scoped gate inside that
(the six files the story names) is **137 passed**, up from 114: 23 new tests, all of them from this
pass.

**No unresolved High or Medium findings remain.** One Low is accepted as-is rather than fixed:
`withObjectId`'s case-insensitive round-trip is still absent from the ECM twin, which BL-4's own
header already registered against ECM rather than fixing here. The player-app DT hop remains
BL-3b's, now with a measurement behind the claim instead of an inference.

## Change Log

| Date | Change |
|---|---|
| 2026-08-11 | Story created (15 ACs, 12 tasks). |
| 2026-08-11 | Data-lock run: live `bloodlines` still 0 docs, `bloodline_name_unique` has no collation, 13 of 41 characters hold a bloodline, 3 live `rule_grant` docs carry `condition: 'bloodline'` (all "Gorgons"). |
| 2026-08-11 | Implemented. Five endpoints, one shared `deriveSlug`, a WS frame in both apps, a non-destructive cache refetch, and the admin screen. 74 new tests. In-browser verification done against a running stack on `tm_suite_test`, with the player-app hop deferred to BL-3b for a documented fixture-interceptor reason. No residue; production re-verified unchanged. Status changed to review. |
| 2026-08-11 | External adversarial review (Codex), then verified and patched. 12 fixes (4 High, 5 Medium, 3 Low), 0 dismissed. The three that mattered were all read-then-write races the record claimed were closed: case-different creates (fixed with a collated unique index, not app-level locking), the delete guard (check, delete, re-check, restore — a transaction would not have helped and the reasoning is recorded), and out-of-order `/impact` responses saving one bloodline's values into another. Four false claims in the Dev Agent Record struck through and corrected rather than rewritten. AC 15 re-run for real, including the character assignment the original pass skipped: 3 XP with the bloodline buys a dot of Protean, 3 XP without it buys none. 23 new tests; 342 green across 18 suites. All twelve fixes proved to discriminate; one needed its test fixed first, because it was inheriting a database index from the previous run. No residue; production re-read and unchanged. Status → done. |
