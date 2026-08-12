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

## Deferred from: issue-1128-oversized-merit-dots external code review (Codex, 2026-08-11)

Both items pre-existing or deliberately out of the story's scope, surfaced by the external review
and verified before deferral. Provenance:
`specs/stories/code-review/issue-1128-oversized-merit-dots-codex-findings.md`.

- **Compound-target "My dots:" never reflects a suspended oath, unlike its own adjacent Total** —
  `public/js/editor/sheet.js:1303` (domain edit mode, compound-target branch). The label renders
  `'●'.repeat(_cmpOwn)` directly, never calling `shSuspendedOf`/either dot-render helper, while the
  same row's `.dom-total-lbl` two spans over correctly routes through `shDotsSuspended`. Break an
  oath pledging dots from a compound-target merit's own contribution and the row shows contradictory
  effective counts — Total reflects the suspension, "My dots:" doesn't. Confirmed pre-existing via
  `git blame` (commit `92f2a4884`, predates both OATH-B and this fix); issue-1128 deliberately left
  this branch untouched (it was already correctly bare, just not suspension-aware) and this is a
  separate defect, not a regression of this story's own fix. Fix by routing `_cmpOwn` through
  `_shSuspendBands`/`shSuspendedOf(m)` the same way the six repointed sites now do, next time the
  compound-target rendering is touched.
- **AC4's automated test checks glyph content, not actual layout fit** —
  `server/tests/issue-1128-dot-wrapper.test.js` asserts the five-dot string is `●●●●●` and has
  length 5, but never measures computed width against `.infl-dots-derived`'s 60px column. The real
  fix was verified to fit via a live browser measurement (`clientWidth`/`scrollWidth` both 60px, both
  themes — recorded in the story's Dev Agent Record item 6), but that check isn't automated, so a
  future CSS change to `.infl-dots-derived`'s font-size/padding/letter-spacing could silently break
  the fit again with this suite staying green. Would need a Playwright-based layout assertion (real
  font metrics), a heavier test shape than this codebase's existing string-comparison pattern — worth
  adding if `.infl-dots-derived` or `.trait-dots` sizing is touched again, not urgent enough to justify
  building fresh CI-layout-test infrastructure for this one column today.

## From issue-1135-delete-eight-tabs (2026-08-11)

- **`TAB_SUBTITLES` defines `territory` twice** — `public/js/app.js`, once in the legacy block and
  again under "Unified nav tab names". Both values are the same string, so the duplicate is harmless
  today (the second silently wins) and it is pre-existing, not a regression of #1135. Left alone
  deliberately: #1135 was a deletion story and this key belongs to neither a deleted nor a surviving
  tab's registration. Delete the earlier of the two next time that object is touched.
- **`renderCityTab` is now an unreferenced export** — `public/js/tabs/city-tab.js` survives #1135
  because `public/js/admin/city-views.js` imports `openCityMapOverlay` from it, but the `whos-who`
  branch that called `renderCityTab` is gone, so that function (and whatever is exclusive to it) is
  dead in production. Deliberately not removed: the story scoped `city-tab.js` as a file to leave
  alone, and pruning a shared module's dead half is exactly the unreachable-surface work already
  tracked in #1095. Fold it in there.
- ~~**The `tickets` collection still holds 69 documents (19 open)**~~ — **RESOLVED 2026-08-11: collection
  dropped** on Angelus's explicit authorisation, after the review closed and after he was told the 19 open
  ones were real unfixed bugs. The drop was guarded on the live count matching the export (69 = 69) so the
  export is a complete recovery path. Nothing further outstanding. Original entry follows for the record.
  #1135 removed all ticket CODE
  (route, schema, mount, admin view, stylesheet, player submit form) but deliberately did NOT drop
  the collection, because dropping live data needs its own explicit go-ahead. Full export taken
  first: `data/exports/tickets-full-export-2026-08-11.json` and `tickets-open-2026-08-11.md`. The 19
  open ones include real unfixed bugs ("Incorrect 9-again on new dice roller", "Feed herd bonus
  incorrectly calculated", "Shared merits require a minimum one dot investment"). They now have no
  in-app home, so they want triaging into GitHub issues before the collection is dropped.
- ~~**The admin Primer surface is unstyled**~~ — **RESOLVED 2026-08-12: the whole surface removed.**
  A full admin-feature audit found `primer-admin.js` had no remaining consumer anywhere (the primer
  players actually read is a separate static page, `public/primer/primer.html`, unrelated to the
  `archive_documents` collection this panel wrote to) — the styling gap below was a symptom of dead
  code, not a real gap to fix. Removed: the `documents` sidebar domain and section (`admin.html`),
  `initPrimerAdmin`'s import/dispatch (`admin.js`), `public/js/admin/primer-admin.js` itself, and the
  now-unreachable `primer`-type branches in `server/routes/archive-documents.js` (`GET /primer`, and
  the `isPrimer` handling in `POST /` and `POST /upload`). The `dossier`/`history_submission`/
  `downtime_response` types on the same route are untouched — those remain real, live features.
  Original entry follows for the record. `public/js/admin/primer-admin.js` (live at
  `admin.js`, domain `documents`) emits `primer-admin-shell`, `primer-file` and `primer-upload-*`,
  and none of those classes is defined in ANY stylesheet. Pre-existing and unrelated to #1135, which
  deleted only the disjoint `primer-content`/`primer-layout`/`primer-toc*` set belonging to the
  removed player tab. Flagged because the two sets share a prefix and a future prefix-wide grep will
  keep rediscovering it.

### Added by the issue-1135 external review (2026-08-11)

- **Three `_svg` icon entries were dead before #1135** — `_svg.status`, `_svg.whosWho` and
  `_svg.dtReport` in `public/js/app.js` have zero references. Confirmed unreferenced at base
  `40cee7fb`, so they are not #1135's doing (its own three orphans, `primer`/`guide`/`rules`, were
  removed). Left alone for scope discipline. Delete next time that object is touched.
- **No coordinator-role fixture in the targeted browser specs** — `tests/issue-1135-deleted-tabs.spec.js`
  and `tests/fin-checkin-finance.spec.js` both authenticate only an ST. #1135's AC9 (a coordinator sees
  the Finance tab gone, with no console error) and the coordinator half of AC10 (check-in still works)
  therefore rest on construction plus static inspection, not on an exercised path: both removed Finance
  entries were `coordinatorOnly`, so no role can render them. A regression that hit `role: 'coordinator'`
  without hitting `'st'` would go undetected. Worth a coordinator fixture next time either spec is opened.
- **Two pre-existing broken test harnesses, both confirmed broken at base `40cee7fb`** — not caused by
  #1135 and deliberately not fixed by it. (a) `tests/post-game-1.spec.js` nav-1-3 (3 tests) waits on
  `#n-more`, but `more` has no `NAV_ITEMS` entry, so that button has never existed in this nav.
  (b) `tests/desktop-and-css.spec.js` (12 tests) waits on `#btn-desktop-toggle`, which stays hidden
  because `#hdr-nav` is only revealed by `_applyDesktopMode` once `effectiveRole()` resolves to ST, and
  it does not under the spec's stubbed API. Both need a harness fix, not a product fix. A third test in
  that file (the Primer TOC css-audit, retired by #1135) was additionally **flaky**: two full runs of
  identical base code disagreed on it, failing by locator timeout in one and passing in the other.

### Added by the issue-1137 external review (2026-08-11)

- **The supported Rules Data authoring path cannot create a generic pool rule.** The producer admits
  only `condition: 'merit_present'`, but that value is absent from BOTH the admin UI's condition
  selector (`public/js/admin/rules-data-view.js`) and the API schema enum
  (`server/schemas/rules/rule-grant.schema.js`). Choosing the UI default `always` saves a rule the
  sweep ignores; POSTing `merit_present` directly is rejected by validation. The UI also has no
  fields for `source_slug`, `category`, `partner_shareable` or `sharing_scope`, all of which a
  Collective Compound needs. **Consequence:** #1137's promise that a new compound needs no code
  change is true only for a direct DB seed script, not through the supported ST-facing surface. Worth
  its own issue: widen the enum in both places and add the compound metadata fields.
- ~~**Split-source compounds get UI but no pool.**~~ **RESOLVED 2026-08-11 by ST ruling — not a
  defect, and not a decision that was ever open.** Angelus: *"you must have Blood and Sacrifice in
  order to have merits in the Fane."* Membership, funding and prerequisite all run through the one
  compound merit, so a compound with a separate way in and way of paying is not a shape this game
  builds. **Already enforced in the data**, verified against `purchasable_powers`: all six Fane
  targets (Dark Temple (Mother's Fane), Accursed Armory, Font of Corruption, The Mother's Altar,
  Primal Mandragora, Occult Collection) carry `prereq: { all: [status Crone 1, merit "Blood and
  Sacrifice" 1] }`. Nobody holds any of them yet. The scenario the review raised therefore cannot
  occur: you cannot hold a Fane merit without the gate merit that funds it. **If a future compound is
  ever seeded with `source` differing from `sharing_scope.merit`, that is a data error to reject, not
  a funding model to support.** Original entry follows for the record.
  `ownsCompound` treats a character as an owner based
  on `sharing_scope.merit`, while `applyPoolRulesFromDb` gates on `rule.source` and
  `rating_of_source` reads the same field. When those differ — which the existing
  `Silent Vigil` / `Keeper of the Ossuary` fixture in
  `server/tests/collective-2-compound-generalisation.test.js` explicitly supports — a holder of the
  membership gate who does not hold the funding source sees the compound rendered with capacity 0.
  None of the three live compounds splits them, so nothing is broken today. Needs a **product
  ruling** before code: is a split-source compound funded by the gate merit, the source merit, or
  both? Do not guess.
- **Duplicate pool rules multiply capacity.** `applyPoolRulesFromDb` pushes one `_grant_pools` entry
  per matching rule with no de-duplication, so two `rule_grant` docs for the same source would double
  a compound's allocation capacity. **Pre-existing** — the old per-source call had the same
  behaviour, since `getRulesBySource` would have returned both — and #1137 does not introduce the
  mechanism, only extends its reach to every admitted source. Verified 2026-08-11: live data has zero
  duplicate dispatch keys among the six admitted pool rules (independently confirmed by the external
  reviewer). `getCollectiveCompounds` already de-duplicates on `source|slug`; the producer does not.
  Cheap guard if it ever bites: de-duplicate by `source|category` before the push.

## Found during a TM Wiki cross-project audit, not a code review (2026-08-12)

- **TM Suite's own live covenant-ordeal picker has two real bugs**, confirmed by direct read of
  `public/js/tabs/covenant-data.js` and `public/js/tabs/ordeal-form.js` (both live, wired via
  `app.js` → `initOrdeals`, in the player nav today). Surfaced while researching TM Wiki's Epic 30
  (which built a parallel Ordeals authoring surface and sidestepped both bugs by design — auto-deriving
  covenant from canon instead of offering a picker at all), not by a review of TM Suite code itself, so
  no story exists to carry this. **Bug A** — the picked covenant is never actually persisted:
  `covenant_choice` lives only in the separate `COVENANT_ROUTING` export, never inside the
  `COVENANT_SECTIONS[cov]` array that `collectResponses()` in `ordeal-form.js` walks, so a draft saved
  through the real picker UI never has `responses.covenant_choice` set. **Bug B** — every covenant
  reuses the same question keys (`q2`..`q23`) with no covenant-discriminator field on the stored
  `ordeal_responses` document; combined with Bug A, a character whose canon `covenant` changes after a
  draft exists (a corrected record, or a genuine covenant-change RP arc) would silently show the OLD
  covenant's answers as if they answered the NEW covenant's differently-worded questions at the same
  keys, with no code path anywhere that detects or resets this. Not fixed this session — flagged only.
