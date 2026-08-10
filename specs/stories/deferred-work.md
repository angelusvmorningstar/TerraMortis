# Deferred work

Items deferred from code reviews and sprint operations. Each entry is pre-existing,
not caused by the associated story, and not actionable inside that story's scope.

## Deferred from: code review of pp.9-schema-v3-inline-creation (2026-04-24)

- **Apostrophe slug regex strips ASCII only** — `public/js/data/loader.js` and `server/scripts/migrate-schema-v3.js` both use ASCII-only regex. Consistent across repo but brittle to external data with curly quotes (`’`). Harmonise when next touching slug logic.
- **Dual sanitisers with different predicates** — `public/js/data/loader.js:22` uses `typeof val === 'object' ? val.dots : val`; `public/js/player.js:93` uses `v?.dots ?? v`. Behaviour differs on null values. Align in next cleanup pass.
- **Stale-cache save path produces 400s without clear UX** — `public/js/editor/export.js` no longer strips legacy creation arrays; if a client has an old localStorage doc, the save is rejected by schema `additionalProperties: false` at root. Add a friendlier client-side scrub or a 400 error message that points users to reload.
- **Tooling drift** — `scripts/migrate-points.js` and `scripts/validate-chars.js` still reference legacy parallel arrays (`attr_creation`, `skill_creation`, `disc_creation`, `merit_creation`). Either update to v3 shape or delete if superseded.
- **Wizard zero-dot discipline persistence** — Wizard can save a discipline with `dots: 0`; sanitisers strip on load only. Add a save-time filter.
- **Rite XP formula edge case** — `level === 0` or missing yields `xp = 1`. Unclear if level-less rites are a real data shape; revisit if any surface.
- **Migration validate-then-transact concurrency** — Ajv validates before `client.startSession()`; another writer modifying between validate and commit would produce an unvalidated committed doc. Single-admin migration makes this theoretical, not urgent.

## Deferred from: code review of fix.933.lore-rubric-index26 (2026-06-26)

- **No MongoDB transaction wrapping migration steps** — `server/scripts/fix-lore-rubric-index26.mjs` (and other migration scripts) perform multi-collection writes without a MongoDB session/transaction. Atlas supports multi-document transactions; adding one would make step 2 (rubric $set) and step 3 (marking loop) atomic. Pre-existing pattern across all migration scripts. Partial-failure concern in this story is addressed by the `--force-mark-patch` recovery flag instead.

## Deferred from: review of next-session-deadline-fix (2026-04-28)

- **Cleanup script `server/scripts/cleanup-stale-sessions.js` lifecycle decision** — Spec Design Notes called for the cleanup to be a manual MCP operation, not a committed script. The MCP confirmation UI was broken at execution time so a script was written instead. Now it sits in the tree forever with hardcoded `_id`s. Two options: (a) delete the script post-application (it's spent), or (b) harden it — guard the `$unset` with a date check on `session_date` so a future re-run cannot strip a freshly-set deadline. Flagged by adversarial + edge-case + acceptance reviewers.
- **`formatDeadline` invalid-date guard** — `server/routes/game-sessions.js:7` passes `cycle.deadline_at` directly to `new Date()`/`toLocaleString()`. A malformed string or BSON Date that produces `Invalid Date` would surface as the literal string `"Invalid Date"` in the public banner. Pre-existing; the broadened cycle status set marginally increases the chance of hitting cycles whose `deadline_at` was set via legacy writers (e.g. CSV import). Add `Number.isFinite(d.getTime())` check before formatting.
- **2099 fixture leak in vitest** — `server/tests/api-game-sessions-next.test.js` uses fixed dates `2099-12-31` / `2099-12-25`. If a test crashes between insert and `afterEach` (e.g. process kill during long-running suite), stale 2099 docs persist in `tm_suite_test`. The `beforeEach` sweep catches future sessions and live cycles, but a leaked `'closed'` 2099 cycle would survive. Use a fixture marker (`__test_seeded: true`) instead of a date filter.

## Deferred from: NPCR party-mode review (2026-04-24)

- **Pending-edge lifecycle cap** — Relationship edges in `status: 'pending_confirmation'` with no response accumulate silently. No TTL, no ST broom. If a PC retires or goes inactive after proposing, the proposal sits forever. Options: (a) TTL at ~90 days auto-rejecting to `status: 'rejected'`, (b) surface age on the admin edge editor so STs can manually sweep, (c) exclude proposals from retired-PC initiators. Flagged by Winston; not urgent at current volume.
- **Hard character deletion cascade** — `DELETE /api/characters/:id` does a raw `deleteOne` with no cascade to the relationships graph. Orphan edges with dangling endpoints survive. Enrichment handles it (`_other_name: null`), no crash, but graph integrity degrades. Options: cascade-retire on delete, or a periodic orphan-sweep script that retires edges whose endpoint no longer exists. Flagged by Winston.
- **Mobile rendering audit of Tier 2 UI** — Player portal is desktop-first per project memo; Tier 2 (Relationships tab) was built on that assumption. Players will open it on phones regardless. No audit done; no guarantees about the Add Relationship picker, the edit form, or the pending banner at narrow widths. Flagged by Quinn.
- **Verify multikey indexes on `relationships.a.id` and `relationships.b.id`** — NPCR.2 planned these via `server/scripts/create-relationship-indexes.js`. Confirm they actually ran on live `tm_suite` before NPC-NPC graph work expands query load. Quick verification task, flagged by Winston.
- **QA gaps in flag × st_hidden and retired-endpoint enrichment** — `_flag_state` enrichment doesn't differ by caller role (same shape for ST and player); untested. `_other_name` resolution when the PC on the other side has `retired: true` — behaviour uncharacterised. Flagged by Quinn; add to the next QA pass.
- **Admin letter-context resolver: surface failure signals** — `handleCopyLetterContext` falls through silently when the edge resolver errors. ST gets an incomplete prompt with no indication why. Add a visible "relationship resolution failed" toast or prompt-line note. Flagged by Quinn.
- **"Updated" chip field-list** — currently bare `Updated ✕`. First player to ask "what changed?" will be one too late. Derive from `history[fields].name` when the time comes. Deferred per NPCR.6 r2 design call; pulled forward as a likely soon-needed iteration.
- **Tier 4 story specs** — all five items in the epic footer (Cytoscape visualisation, timeline view, NPC-NPC graph browser, notification subsystem, public directory). Party-mode consensus: **do not spec Tier 4 yet**. Ship Tier 1-3 to main, observe for one cycle of live play, revisit with player signal. Flagged by John; unanimous.

## Deferred from: issue-1028-cm1-phase-as-data external code review (Codex, 2026-08-10)

Each item pre-existing or deliberately out of the story's scope, surfaced by the external review
and verified before deferral. Provenance: `specs/stories/code-review/issue-1028-cm1-codex-findings.md`.

- **`game-sessions.js` downtime-deadline lookup drops prep cycles** — `server/routes/game-sessions.js:42-49` picks the next deadline among live raw statuses only; a prep-phase cycle (status mirrors to `closed`) is excluded where the old early-game window (status `game`) was included. The deadline it would report during prep is a past one anyway, so the impact is a possibly-absent cosmetic deadline line. Make it phase-aware when the session banner is next touched.
- **`phase_sequence` completeness constraint** — `uniqueItems` now enforced; the schema still accepts a partial order like `['game']`. A cycle with a partial sequence gives `phaseIndex` = -1 for missing phases. Tighten (minItems/const-set) as part of the CM-2 story that first consumes ordering, where the intended flexibility gets decided rather than guessed.
- **`app.js` lifecycle submission lookup is cycle-unfiltered on the active-cycle path** — pre-existing: `_loadLifecycleData` matches the player's submission by character only when a downtime window is open, so a stale roll on an older submission could read as "rolled". The new prep-path added by CM-1's review patch IS cycle-filtered; the old path was left byte-identical to avoid a behaviour change inside a review pass. Align it next time the lifecycle cards are touched.
- **Admin DT processing header badge reads "closed" during prep** — `downtime-views.js:1242-46` reads raw status for its badge; correct data, stale word. (Carried from the story's own completion notes; re-confirmed by the review.)

## Deferred from: cm5-tracker-reset-to-prep internal 3-layer review (2026-08-10)

- **`reconcileInfluenceDT` discards the prep-week feeding-influence deduction on reload** — `public/js/game/tracker.js:181-230` absolute-sets `influence = max − downtime spend` on every tracker init, guarded only by a per-page-load `_reconciledCycles` set. Under the prep model the prep cycle IS the "last closed by game_number", so a page reload between the ST's Confirm Feed and game night re-derives influence and drops the feeding deduction. Vitae is unaffected. Needs a persistent per-(cycle, character) reconciled marker, or a skip when the cycle is the current prep/game cycle and a confirmed feed exists. **5b-shaped; briefed to Angelus as a door-side workaround for Game 7.**
- **Tracker reset is not atomic with the phase write** — in `cycle-views.js` `writePhase` the `DELETE /api/tracker_state` precedes `setCyclePhase`; a failed phase write leaves the tracker wiped and the phase unchanged, and the inline error says only "Phase change failed". Pre-existing shape (true of the legacy game reset), now reachable on prep entry too. Consider reversing the order or naming the wipe in the failure message.
- **Tracker DELETE broadcasts nothing** — `server/routes/tracker.js:50-55` does `deleteMany({})` without `broadcastTrackerUpdate`, so an open tracker tab keeps its module-scope `_cache`/`_confirmed` and can re-upload pre-wipe values on its next save. Related: `game/tracker.js:111-127` migrates a legacy `tm_tracker_state` localStorage blob back into Mongo after a wipe, and the DELETE clears no localStorage. Part of the 5b tracker-hardening pass.
- **`epic.708.3-cycle-phase-controls.test.js` is 3-red on stale assertions** (#1116: `setGamePhase`, `data-phase`, `gold2`). CM-1 and CM-5a both left it alone deliberately. It covers the exact UI these stories touch, so it is the highest-value stale suite to repair; do it before the next cycle-UI story rather than carrying the noise further.

## Deferred from: bl-1-bloodline-collection-and-seed internal 3-layer review (2026-08-10)

Each verified against the real code before deferral. Patched findings are recorded in the story's
Senior Developer Review instead.

- **The ECM router 404s a valid UPPERCASE ObjectId** — `server/routes/equipment-catalogue.js:47` compares `String(new ObjectId(id)) !== req.params.id`, and `toString()` always renders lowercase hex, so `GET /api/equipment_catalogue/507F1F77BCF86CD799439011` returns NOT_FOUND for a document that exists. Confirmed against mongodb 7.1.1. BL-1's own router was fixed (case-insensitive round-trip); the ECM twin was left alone because it is outside this story's scope and shipping a behaviour change to a live endpoint inside a review pass is the wrong place for it. Fix when ECM is next touched.
- **`slug` uniqueness is enforced only at seed time** — the seed's integrity gate aborts on a slug collision, but only `name` gets a unique index. BL-4's admin CRUD can create two bloodlines whose names collapse to the same slug. Harmless today (nothing reads `slug`); add a unique index, or drop the field, when BL-4 gives it a consumer.
- **No collection-level `$jsonSchema` validator on `bloodlines`** — `bloodline.schema.js` is enforced by the seed script and by Ajv in the route layer BL-4 will add, but a manual `insertOne` (Compass, a script, a test fixture) can put a three-discipline document in the collection and the public route will serve it. A `collMod` with `$jsonSchema` at seed time would make the four-discipline rule as real as the unique index. BL-4's call, since that is when non-seed writes start.
- **`deriveSlug` only strips decomposable diacritics** — NFD + `\p{Mn}` handles `é`, `á`, `ü`, but `ø`, `ł`, `ß`, `æ`, `đ` have no NFD decomposition and are hyphenated or eaten (`Nørvegi` → `n-rvegi`). A wholly non-Latin name derives an empty slug, which the gate catches by aborting the whole seed with no way to supply a slug by hand. No current bloodline is affected. Revisit if BL-4 ever needs one, with an explicit override slug rather than a bigger transliteration table.
- **The live cross-check counts retired characters** — `seedBloodlines` filters only `bloodline ∉ {null, ''}`, so a retired PC carrying a legacy bloodline value would land in the unresolved list alongside live PCs and make the resolving ratio unreachable. Today all 13 holders resolve so it does not bite. Exclude or separately label `retired: true` before BL-5 uses this output as its go/no-go.
- **The production mount is not exercised by any automated test** — every API test builds `createTestApp()`, which mounts the router itself. If `server/index.js` had put `/api/bloodlines` behind `requireAuth`, or omitted the mount, all eleven API tests would still pass, including the three asserting "no auth required". Covered once manually for BL-1 (booted `node index.js`, curled the endpoint, verified 200 and the 404 path). A supertest against the real app export would close it properly, and would benefit every route suite, not just this one.
- ~~**`GET /api/bloodlines` returns soft-retired entries with no filter**~~ — **VOID 2026-08-10.** Angelus ruled that a bloodline cannot be retired; they are permanent. The `active` field was removed from the schema, the seed and the fixtures the same day (BL-1 was still unmerged and unseeded), so there is nothing to filter. A schema test now rejects `active` as an unknown property so it cannot return as a BL-4 convenience.

## Found during BL-2 data-lock follow-up (2026-08-10) — `characters.bloodline` is write-once and nothing enforces it

Angelus ruled 2026-08-10: *"Not every character has a bloodline but once they do it's forever. A new
character can start without a bloodline and then get one."* So `null` to a name is allowed; name to a
different name, and name to `null`, are not. Nothing enforces this — not the schema, not the route,
not the client — and two client paths break it today. Both are **registered against BL-5**, which is
consequently no longer the small story its sprint-status line described. Full entry in
`D:\Terra Mortis\data-map.md` under `characters.bloodline`.

- **`public/js/editor/edit.js:104` performs a silent name-to-null.** Changing a character's clan runs `if (c.bloodline && !validBLs.includes(c.bloodline)) c.bloodline = null;` — no warning, no confirmation, no record. A clan edit erases a fact the rules say is permanent. **Fix now determined (Angelus, 2026-08-10): clan cannot be changed either.** So the branch is unreachable and gets **deleted, not guarded** — no guard to get subtly wrong later. Precision for whoever does it: delete only the two bloodline-clearing lines (`:102-104`). The rest of the `if (field === 'clan')` block assigns the clan bane and is still needed for the FIRST time a clan is set on a new character.
- **`public/js/editor/identity.js:73-75` shows a false value.** The bloodline `<select>` is built only from `APPROVED_BLOODLINES`; a character carrying a name the constant does not know matches no `<option>`, so the browser falls back to the first — `(none)`. The editor displays "(none)" for a character who has a bloodline. It does not auto-wipe on render (the write is `onchange`), but the ST is reading a wrong value and the next touch of that control commits it. BL-2's loud miss path covers the *costing* half of this failure; the *display* half is still wrong and belongs with BL-3, which owns that dropdown.
- **Clan and bloodline each have TWO editing surfaces, and locking one is theatre.** Found 2026-08-10 while scoping the write-once lock. `editor/identity.js:69/73` uses `updField('clan')` / `updField('bloodline')`; `editor/sheet.js:2692` is a **second, independent** pair of dropdowns using `shEdit('clan')` / `shEdit('bloodline')`. Any write-once enforcement must cover both, or the rule holds on one screen and not the other — the same "one rule, two implementations" shape as the DT form's private in-clan check. Note also that `shEdit` lives in `editor/edit.js`, which has two importers (`admin.js` and `app.js`), so a handler change has to be checked against both. Minor, same line: `sheet.js:2692`'s bloodline select carries an inline `style="margin-top:3px;font-size:10px"`, which violates the project's normalised-CSS rule; fix it when that line is next touched rather than as its own change.

## Found during BL-2 (2026-08-10) — two more copies of the module-scope `location` read

BL-2 made `data/accessors.js` import `data/api.js` transitively, which exposed that `api.js` read
`location` at module scope and so could not be imported outside a browser. That broke two existing
vitest suites; **fixed in BL-2** by resolving `API_BASE` per request. Two more copies of the same
line survive elsewhere, are NOT reachable from `accessors.js`, and are therefore untouched and
unbroken today.

- **`public/js/data/app-settings.js:14` and `public/js/data/st-mods.js:22` each carry their own `const API_BASE = location.hostname === 'localhost' ? ... : ''`.** Same latent trap: the first time anything importable-in-node reaches them, the importing suite dies with `ReferenceError: location is not defined`. Worse, they are a straight duplication of `api.js`'s job, and `api.js`'s own header states the rule they break: "No other module should use raw `fetch('/api/...')` calls." Fold both onto `apiGet`/`apiRaw` when either module is next touched. Deliberately not done in BL-2: neither is reachable from the code this story changed, and widening a story that already alters XP costing to touch two more shared modules buys nothing today.
- **The workaround has spread.** 21 test files under `server/tests/` now stub `globalThis.location` (or a sibling browser global) before importing client modules. Each one is a small tax paid because a data module reaches for a browser global at import time. Worth a sweep once the three `API_BASE` copies are down to one, since most of those stubs should then be unnecessary.

## Deferred from: bl-2-cache-and-accessor-wiring internal 3-layer review (2026-08-10)

Each verified against the real code before deferral. The 13 patched findings are in the story's
Senior Developer Review.

- **The DT form still costs disciplines with the clan fallback this story removed.** `public/js/tabs/downtime-form.js:4109-4115` has its own `isClanDisc` reading `BLOODLINE_DISCS` then falling through to `CLAN_DISCS`, feeding `getXpCost` at `:4130`. It is drift #15 verbatim, still live, and it now reads a DIFFERENT source from `clanDiscList`. Explicitly **BL-3**, and the reason the epic's sequencing constraint exists: while the collection is seeded FROM the constants the two agree, so the window is safe until BL-4 lets an ST add a Mongo-only bloodline. **BL-3 must land before BL-4 is enabled.**
- **The Excel merge and the CSV/JSON importers write discipline cp/xp without the lock.** `public/js/admin/excel-merge.js:85-96` (via `data-portability.js`) and `public/js/suite/import.js:181` set `dObj.cp` / `dObj.xp` directly and never recompute `dots`, so an import during an unresolved state can leave cp/xp disagreeing with the stored dots. `data-portability.js:366` also writes `bloodline` as unvalidated free text, i.e. the importer can create the locked state it then writes through. BL-2's own test docstring overstated this by calling `shEditDiscPt` "the single write path" — it is the single *interactive* path. Gate the import merge, or validate `bloodline` against the cache on import, when data-portability is next touched.
- **The bloodline dropdown and the clan-change check still read the constants**, so a locked character has no in-app remedy: `editor/sheet.js:2702` and `editor/identity.js` build the picker from `BLOODLINE_CLANS`, and `edit.js:103-104` validates against it. A bloodline existing only in Mongo cannot be selected at all. **BL-3**, which owns those dropdowns — and it should read `bloodlinesByClan()` / `approvedBloodlines()`, which BL-2 already exposes for exactly that.
- **A locked discipline row shows two different dot totals.** `editor/sheet.js:653` renders pips from the stored `dots` (bought at 3/dot) while `:685` recomputes the `=` readout at 4/dot, so the two disagree for an unresolved character. Cosmetic while the lock note is up, but confusing. Suppress one of them when `_blLocked`.
- **Redact mode can merge two characters into one banner entry.** `_missLabel` uses `displayName`, which under redact mode returns a block-out string clamped to 10-16 chars, so two different characters can produce the same label and the `Set` merges them. Fix by keying the registry on character `_id` and resolving the label at render time.
- **`mountBloodlineWarnBanner()` returns an unsubscribe that both call sites discard.** Harmless today (boot runs once), but a re-login or SPA re-init without a page reload would register a second listener with no way to remove it. Either use the return value or stop advertising it.

## Deferred from: bl-3a-rewire-readers-to-cache internal 3-layer review (2026-08-10)

The 8 patched findings are in the story's Senior Developer Review.

- **AC 1's guard exempts whole files, including the one that matters most.** `server/tests/bl3a-one-inclan-implementation.test.js` allow-lists `public/js/data/accessors.js` and `public/js/data/bloodlines-cache.js` on the grounds that they mention the constants only in comments — but the test already strips comments before matching, so the exemption buys nothing while the claim is true and suppresses the alarm exactly when it stops being. `accessors.js` is the file that now owns the single implementation, and a future "fix" for a cold-cache bug could plausibly add a `BLOODLINE_DISCS` fallback there with the test still green. Narrow the allow-list to `constants.js` (the definition), `dev-fixtures.js` and `wizard.js`, and let the comment-stripper handle the other two. Not done in the review pass: it touches the guard protecting the epic's central claim, on a story that had already shipped a crash.
- **AC 1 and AC 7 contradict each other as written.** AC 1 lists the files permitted to mention the constants and does not include `tabs/wizard.js`; AC 7 explicitly excludes `wizard.js` as dead. The code is right (zero importers, re-confirmed repo-wide) and the AC text is sloppy. Worth fixing in BL-3b's spec so the same contradiction is not inherited.
- **A locked discipline row still shows two contradictory dot totals.** Carried from BL-2's review and re-confirmed here: `editor/sheet.js:653` renders pips from the stored `dots` (bought at 3/dot) while the `=` readout recomputes at 4/dot for an unresolved character. Cosmetic while the lock note is up. Suppress one of them when `_blLocked`.
- **A second inline style survives 33 lines from the one BL-3a fixed.** `editor/sheet.js:2673` carries `style="margin-top:3px;font-size:10px;color:var(--accent)"`. Outside BL-3a's instruction, which named only the line being edited, but it is the same violation on the same block and will need the same treatment.

## Deferred from: bl-4-admin-crud (2026-08-11)

- **Renaming a bloodline that HAS holders needs a migration script, not a UI action.** BL-4 made
  `name` immutable and excluded it from `BLOODLINE_UPDATABLE_FIELDS`
  (`server/schemas/bloodline.schema.js`), because three separate things key off the bloodline name as
  a plain string with no foreign key and none of them warns when it stops resolving:
  `characters.bloodline` (13 live holders), `rule_grant.bloodline_name` (3 live documents, all
  "Gorgons", matched case-insensitively at `bloodline-evaluator.js:29-32` and edited as free text in
  the Rules Engine admin), and the client cache's own `_byName` index. A rename orphans every holder
  at once and silently drops any bloodline grants; a cascade from a reference-data screen would be
  worse, because it performs the exact name-to-a-different-name transition Angelus ruled forbidden
  for `characters.bloodline` on 2026-08-10, on every holder simultaneously, with no record. A
  mis-typed name is corrected with delete + recreate, which BL-4's guarded DELETE keeps available
  precisely because a fresh typo has no holders. **If a bloodline with holders ever genuinely needs
  renaming**, that is a deliberate migration script updating all three referents in one pass, plus a
  `data-map.md` entry. Not written speculatively: it has never been needed, and writing it now would
  put a cascade in the repo for someone to reach for.
- **The bloodlines admin screen is not reachable in the player app's local test mode, so BL-4's
  player-side WS wiring could not be observed end to end locally.** `public/js/dev-fixtures.js:33-35`
  intercepts `GET /api/bloodlines` under `local-test-token` and serves the list from the constants,
  so a real create/edit/delete never reaches the player app's cache on a local machine. BL-4's
  `onBloodlineUpdate` wiring in `app.js` is asserted by test and the frame was observed arriving at a
  connected browser client, but the last hop is unobservable until **BL-3b** rewires
  `dev-fixtures.js`. Re-verify the player app once BL-3b lands.

## Deferred from: bl-4-admin-crud external code review (Codex, 2026-08-11)

- **`withObjectId`'s case-insensitive round-trip is still missing from the ECM twin.** BL-4's own
  router header already registers this: `server/routes/bloodlines.js`'s `withObjectId` compares
  `String(new ObjectId(raw)) !== raw.toLowerCase()`, because `ObjectId.prototype.toString()` always
  renders lowercase hex and a strict comparison 404s an UPPERCASE id that addresses a real document.
  `server/routes/equipment-catalogue.js`'s copy is still strict. One line, but it belongs to an ECM
  fix, not to a bloodlines review pass, and the two routers are otherwise deliberately parallel.
- **The player-app DT-form hop is now measured, not inferred, and is still BL-3b's.** The entry
  above recorded this as an environment limitation; this pass confirmed it by direct measurement
  rather than by reading the interceptor. `dev-fixtures.js` replaces `window.fetch` wholesale under
  `local-test-token`, so in the player app even a raw `fetch('/api/bloodlines')` typed into the
  console returns the fixture list derived from the constants. No amount of care in the browser can
  show that page a bloodline created on the admin screen; only BL-3b's rewiring can. What WAS
  observed live in this pass is the rule itself rendering from the cache in the DT form
  (`Nightmare (4 -> 5) [clan, 3 XP]` for a character whose clan does not grant Nightmare).
- **The seed script's own duplicate-name pre-check is still exact-match.**
  `server/scripts/seed-bloodlines.js` aborts `--apply` when the collection already holds two
  documents with the identical name, so the operator gets a readable message instead of a driver
  error. Now that the index carries a `strength: 2` collation, a case-DIFFERING pair also blocks the
  index and is reported by `ensureBloodlineNameIndex`'s own error instead — readable, but from a
  different place, and the seed's summary object still reports `duplicateNames: []` for that case.
  Harmless while the collection has no such pair (production has none, and the collated index now
  prevents new ones), and it is the seed, which BL-3b retires to `scripts/archive/`. Left alone
  rather than edited on its way out.
