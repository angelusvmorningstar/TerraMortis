# Epic DBO — Database Ownership (TM Suite side)

**Opened** 2026-08-14 from the cross-app data audit recorded in `D:\Terra Mortis\data-map.md`
(corrections dated `2026-08-14`; new Open Items under a dated heading at the end).

**Companion epic**: `../TM Wiki/specs/epic-31-data-sovereignty.md` — the Wiki half. Neither epic is
complete on its own. Every migration has acceptance criteria on **both** sides.

> **NOTE ON HOW THIS FILE ARRIVED.** Authored from the TM Wiki session on 2026-08-14 while this repo
> had uncommitted work in flight on `ms/oxp-7-sheet-office-merits-section` (including
> `specs/stories/sprint-status.yaml` and `specs/deferred-work.md`). **Deliberately no row was added
> to this repo's `sprint-status.yaml`** to avoid clobbering that session's uncommitted state. Adding
> the `epic-dbo` row is this session's first action when it picks this up. Also read
> `D:\Terra Mortis\BRIEF-2026-08-14-tm-suite.md` first — it carries the rulings and the coordination
> protocol in full.

---

## Objective

Make `tm_suite` hold only what has a mechanical function during live play, and fix the schema-versus-
data defects the audit found on this side. **Getting smaller is the point**, not a side effect.

## THIS EPIC OUTRANKS ITS COMPANION (Angelus, 2026-08-14)

> *"The data structure of Suite is more critical. Wiki is not a live feature of game, so wiki can be
> incomplete without undermining game."*

**When a decision from this epic and one from `../TM Wiki/specs/epic-31-data-sovereignty.md` are both
waiting on Angelus, this one goes first.** His attention is the scarcest resource in the ecosystem.
The two streams are otherwise parallel and do not block each other.

Within this epic, `DBO-1` and `DBO-3` are the two live defects in the app that actually runs the
session, and they should lead. `DBO-3` in particular is a filter in the players' own XP-spend picker
that has **never once done what its comment says it does.**

**One caution against over-applying the asymmetry:** it does not mean Wiki defects are ignorable. A
player losing written work is severe wherever it happens, because it is irreversible and it costs a
real person real effort - which is why the Wiki's Ordeals containment story was treated as urgent
despite living on the "less critical" side. The full four-band severity model is in `data-map.md`
under "THE CRITICALITY ASYMMETRY".

**And a tension to hold rather than resolve:** the handover stories below make `tm_suite` leaner,
which serves this principle directly. But *executing* a migration is itself a risk to Suite. The end
state is better for the critical side; the transition is a hazard to it. Hence the standing order
below, and hence nothing runs near a session.

## The governing principle (Angelus, 2026-08-14)

> *"The game app is the most vulnerable to breaking from complexity because it has to COMPUTE. The
> wiki on the other hand, its interface is largely READING and PRESENTING the database."*

TM Suite computes: dice pools, XP ledgers, prerequisite verdicts, affordability, status resolution,
downtime processing. Computation means state transitions, and state transitions are where corruption
lives. Every collection this app carries is more surface for its compute paths to trip over.

**The classifier for what stays:**

> **Does this have a mechanical function during LIVE PLAY (at the table, during a session)?**

Character sheets and stats (XP etc.) stay — direct mechanical impact. A home address does not: where
a character lives has no bearing on live play and only matters in downtime.

**Two worked examples define the edges:**

- **`characters.mask` / `.dirge` STAY, WHOLE.** Pure character fiction, but they are the *trigger
  condition* for Willpower regain (`willpower.mask_1wp` / `.mask_all`) — the mechanic needs the
  content itself. Inseparable.
- **`characters.touchstones[]` is TWO ENTITIES.** Angelus: *"One piece of data is the touchstone
  MECHANIC, the other is the touchstone IDENTITY. The game app is truly agnostic on the identity of
  the touchstone, only story cares about that."*

**General rule:** does the mechanic need *the content itself* (stays whole) or merely *the fact or
rating of its existence* (two things that were stored together, and separate)?

## The constraint every migration inherits

`../TM Wiki/specs/deferred-work.md` item 163 (Angelus, 2026-08-12): **"Whatever moves, the reader,
the writer and the storage must move together."** Earned when the Wiki's downtime form stranded a
real player's Downtime 6 in `tm_wiki`, invisible to processing.

**Standing order: copy, verify, cut over, then drop. Never delete the source first.** The drop is an
AC on the shared migration story, executed only after the Wiki side verifies a real read end to end.

---

## Stories

### DBO-1 — `purchasable_powers` schema versus live data

`server/schemas/purchasable_power.schema.js:70` is `additionalProperties: false` and declares neither
`selected` (present on **666 of 673 rows**) nor `special` (**527**). **Only 7 documents pass their own
schema.** The schema's own comment at `:220-245` records this and notes a purpose-built strip script
exists at `server/scripts/archive/strip-selected-from-purchasable-powers.js` but either was never run
or something re-seeds the field.

**Answer that question first — "never run, or does something put it back?" — before writing any new
script.** The schema comment says so explicitly and it is the right call.

**ANSWERED 2026-08-14, read-only investigation, no writes.** Neither field is being re-seeded — both
are stale, un-migrated legacy data, and nothing in the active codebase can currently write either back:

- `selected` — genuinely dead. `POST /api/rules` validates against the schema
  (`additionalProperties: false`), so a new document carrying it is rejected outright; `PUT
  /api/rules/:key`'s `UPDATABLE_FIELDS` allowlist (`server/routes/rules.js:70-83`) doesn't include it
  at all, so routine ST edits via the admin Rule Data editor structurally cannot set or restore it.
  `grep` across `public/` found zero reads of it against a purchasable-power shape (the handful of
  `.selected` hits are DOM `<option>`/CSS state, unrelated). The archived collection-wide strip script
  (`server/scripts/archive/strip-selected-from-purchasable-powers.js`) has **never been run with
  `--apply`** — the 666-row count from 2026-08-07 is simply the original `ingest-excel.js` import,
  untouched since. Live re-check today: **656 of 673** (was 666) — the drop of exactly 10 matches
  `fix-1111-oath-row-hygiene.js` (OATH-A, issue #1111), a narrow, already-applied script that strips
  `selected`+`special` from only the ten `cost_model` rows. That script ran; the broad one never did.
- `special` — same shape of answer, but **not a clean strip any more**. Commit `b3a6ab4e` (2026-04-08,
  Peter) moved the CODE from `rule.special` to `rule.sub_category` for standing-merit filtering and
  removed `special` from the schema/seed/PUT-allowlist/rules-editor-modal — but never migrated the
  DATA, so every row that already carried a `special` value kept it forever. That is the root cause
  DBO-3 (merged today) diagnosed independently from the other direction. **DBO-3 has now made
  `special` load-bearing again**: `isMeritEventGranted(rule)` in `public/js/editor/merits.js:46` reads
  `rule.special === 'standing'` and is live in production. Live re-check today, grouped by value:
  `{null: 515, "standing": 2}` — the two `"standing"` rows are exactly Mystery Cult Initiation and
  Professional Training, the pair DBO-3's fix depends on. **This changes DBO-1's fix shape**: `special`
  can no longer be silently stripped collection-wide — it must be DECLARED in the schema (the 2
  `"standing"` rows are genuinely read by live code), while the 515 `null` rows are harmless residue
  that can be left as `null` (equivalent to absent for the one check that reads it) or cleaned
  opportunistically. `selected` remains a clean, safe, collection-wide strip — the existing archived
  script (extended past its current `selected`-only filter, or a new one following the same
  dry-run/backup/`--apply` shape) is the right tool; there is nothing to "find" that puts it back.

Blocks readers: TM Wiki's Epic 17 research wanted a load-bearing filter on `special` and could not
safely take one. Now resolved: `special` should be declared as `{ oneOf: [{ enum: ['standing'] }, {
type: 'null' }] }` (or equivalent), not removed — Epic 17 can take a filter on it once declared.

**CORRECTION 2026-08-14 (dbo-1's own external Codex review, Pass 2).** The "nothing in the active
codebase can currently write either back" claim above was true of every *automatic* path but missed a
*manual* one: `server/scripts/seed-rules-necropolis.js` (issue #692, active, not archived — has its
own shebang, is meant to be re-run) upserts nine merit documents via `_baseDoc()`, whose defaults
include `selected: true` and `special: null`. Re-running it with `--apply` after DBO-1's cleanup would
put `selected` straight back on all nine rows (and `special: null`, though that value is schema-valid
and harmless on its own). This does not make DBO-1's cleanup unsafe to ship — it is not boot-time or
automatic, and DBO-1's own script remains correct for the state of the data today — but it means the
end state is not durable against a real, supported, already-shipped workflow. Not fixed as part of
DBO-1 (out of its stated scope: this touches a different epic's seeder, N-3/MNEC). Flagged in
`deferred-work.md` for a follow-up: strip `selected: true` from `seed-rules-necropolis.js`'s
`_baseDoc()` defaults (or run DBO-1's cleanup script again after any future re-seed).

### DBO-2 — `character_dossier` schema and reveal path

Two defects on one collection (30 docs / 442 facts):

- **`server/schemas/character_dossier.schema.js` does not exist.** `server/scripts/_dossier-audit.js:3`
  imports it and `../TM Wiki/server/routes/characters.js:219-220` cites it as the authority for
  `character_id`'s type. Two code sites point at a phantom file.
- **The reveal path was never wired.** All 442 facts are `st_hidden: true` and `revealed_to` appears
  on **zero** of them, so the Wiki's shipped summary tier shows nothing to any non-owner. Nothing in
  this repo writes `revealed_to` for dossier facts (the only `revealed_to` writers are the six
  `_reveal-*.mjs` scripts, which target `st_map_locations`).

**RESOLVED 2026-08-14 (Angelus's decision).** Live-data check first: `st_hidden: true` is not
concentrated on the 13 `secret`-tagged facts — all 26 tags, including plainly non-sensitive ones
(`aspiration`, `worldview`, `sire`, `haven`, `hunting_method`), are 100% hidden across all 442 facts.
Presented to Angelus as a genuine choice (full concealment intended vs. mechanism simply unbuilt), not
decided unilaterally. **Angelus's call: `st_hidden: true` as today's default is correct — he has not
yet set what should be revealed, not that it must stay concealed.** That means a reveal mechanism does
need to exist so he can set `revealed_to` per fact when he chooses to; none does today (checked: no
`server/routes/*.js` writes `character_dossier` at all, only one-off `server/scripts/_*.js` tools).

DBO-2 scope, following from this: (1) write the missing `server/schemas/character_dossier.schema.js`,
closing the dead-citation bug on both repos; (2) leave every existing fact's `st_hidden` value
untouched — the current all-hidden state is not a bug to fix; (3) build the missing writer so an ST
can mark specific facts revealed (set `revealed_to`) going forward. Where that writer's UI should live
(TM Suite admin vs. TM Cockpit, given the admin-to-Cockpit split direction) is still open — decide at
create-story time.

**WRITER LOCATION DECIDED 2026-08-14, at create-story time, and it is not this repo. Story created:
`specs/stories/dbo-2-character-dossier-schema-and-reveal.md` (`ready-for-dev`).** Point (3) above is
superseded: no reveal writer is built here at all. All three candidate homes were traced.

- **TM Cockpit — ruled out.** Its Atlas credential is hard-scoped to exactly seven collections
  (`ordeal_responses`, `ordeal_submissions`, `questionnaire_responses`, `characters`,
  `downtime_submissions`, `downtime_cycles`, `game_sessions`), per `../TM Cockpit/lib/connect.mjs`'s
  own header comment. `character_dossier` is not among them, and Cockpit's own ADR-001 had already
  declined to build dossier-write tooling there for a related reason.
- **TM Suite admin — possible but redundant.** The pattern exists (the Relationship Editor), but it
  would compete with a mechanism already built elsewhere.
- **TM Wiki — chosen.** `tm_wiki.visibility_prefs`
  (`../TM Wiki/server/wiki-schemas/visibility-prefs.schema.js`) is a complete, already-built,
  currently-dark reveal mechanism: it already declares `subject_type: 'fact'` with
  `subject_ref: { fact_key }`, three tiers, `semi_private_groups`, and `named_reveals` /
  `named_conceals`. It is gated off behind `wiki_config.fact_level_enabled: false` for exactly one
  documented reason. `../TM Wiki/specs/tm-wiki-schema.md`'s "## The fact_key dependency" section names
  an upstream TM Suite mint of a durable opaque per-fact key as *"the single dependency this
  foundation cannot satisfy itself"*, and states the unblocking condition plainly: *"When the mint
  lands and is backfilled, flip the flag - no wiki schema change needed."*

So DBO-2's TM Suite scope is now exactly three things: **write the schema** (from a full live field
inventory, exporting `DOSSIER_TAGS` to close `_dossier-audit.js:3`'s dead import — confirmed genuinely
unrunnable, the import throws `ERR_MODULE_NOT_FOUND`; TM Wiki's half of the dead citation is already
self-corrected by their Story 31-1, so nothing is owed there); **add a required opaque `fact_key`**
(minted with `randomUUID()` from `node:crypto` — checked first, `server/package.json` declares neither
`nanoid` nor `ulid`, and no first-party opaque-ID minting precedent exists anywhere in the repo, so no
new dependency is added; TM Wiki declares `subject_ref.fact_key` as `{ type: 'string', minLength: 1 }`,
which a UUID satisfies unchanged); and **a one-off, dry-run-default backfill script**
(`server/scripts/dbo-2-dossier-fact-key-backfill.mjs`, mirroring DBO-1's and DBO-8's own
`plan`/`apply`/`main` conventions). Hard constraints in the story: no `st_hidden` change, no
`revealed_to` change, no reveal writer or UI or route here, no flipping `fact_level_enabled` (TM Wiki's
own action), and `--apply` against live `tm_suite` stays Angelus's.

One new finding surfaced at create-story time and baked into an acceptance criterion: TM Wiki's
shipped `filterVisibleFacts` (`../TM Wiki/server/routes/characters.js:210-214`) reads
`if (fact.st_hidden !== true) return true` — **fail-open** — so a fact minted without `st_hidden` is
silently visible to everyone. `st_hidden` is therefore required on every fact in the new schema; all
442 live facts already carry it, so it costs nothing today and closes a real default-open hazard for
every future writer.

**When this lands and Angelus has run `--apply`, TM Wiki must be told the mint is complete**, so they
can backfill-verify and decide when to flip `wiki_config.fact_level_enabled`.

**SHIPPED 2026-08-14 (dev-story).** Three new files, nothing else in this repo touched:

- `server/schemas/character_dossier.schema.js` - draft-07, `additionalProperties: false` at BOTH the
  document and the fact level, derived from a fresh read-only live inventory that reproduced the
  story's own figures exactly (30 documents, 442 facts, 26 tags, `character_id` and `_id` both BSON
  ObjectId on all 30, `fact_key` on 0, `revealed_to` on 0, `st_hidden: true` on all 442). Exports
  `characterDossierSchema`, `DOSSIER_TAGS` (26), `DOSSIER_FACT_SOURCES` (4) and `DOSSIER_SEVERITIES`
  (3). `fact_key` and `st_hidden` are both `required` on every fact; `severity` is the one enumed
  vocabulary; `tag`, `source` and `status` are deliberately plain strings, each with the reason
  written beside it. Documentation and test contract only - no MongoDB `$jsonSchema` validator was
  added, and none exists on the live collection.
- `server/scripts/dbo-2-dossier-fact-key-backfill.mjs` - `planBackfill` / `applyBackfill` / `main`,
  mirroring DBO-1's and DBO-8's conventions (dry-run default, backup-before-write with abort on
  backup failure, no shebang, `MONGODB_DB` override, auto-run guard, collection passed as an
  argument). Mint is `randomUUID()` from `node:crypto`; `server/package.json` is unchanged.
- `server/tests/dbo-2-dossier-fact-key.test.js` - 25 tests, all passing, the DB-backed half genuinely
  executed against a reachable `tm_suite_test` rather than skipped.

`server/scripts/_dossier-audit.js` needed **no edit at all**: its line-3 import specifier was already
correct and only the target file was missing, so it is byte-identical and its import now resolves.
The AC8 source-contract test pins that specifier so a future edit cannot silently re-break it.

A bare dry-run against live `tm_suite` (read-only, no `--apply`) reported exactly
`30 document(s) / 442 fact(s) need a fact_key`, matching the inventory. **`--apply` has NOT been run
against live `tm_suite`** - that stays Angelus's own action, after the 2026-08-15 game, and the
TM Wiki notification above is owed the moment it happens.

Residual hazard logged to `specs/deferred-work.md` rather than scope-crept into this story:
`server/scripts/_havens-and-locations.js:46` `$push`es a fact with no `fact_key`, so re-running that
one-off script after the backfill would reintroduce a keyless fact.

### DBO-3 — XP-spend merit picker: the `standing` filter has never fired

`getItemsForCategory('merit')` skips `sub_category === 'standing'`, but Mystery Cult Initiation and
Professional Training carry `special: 'standing'` with `sub_category: null`. So the filter has
**never** excluded the two merits its own comment names, and excludes `Confessor`/`Pledged` instead.

Live defect in the app players use. Same class as a naming mismatch the Wiki found on its own side
(`"Theban Sorcery"` vs the `"Theban"` sheet key). Note DBO-1 may change what `special` is allowed to
be, so sequence this after it or design the fix to survive either outcome.

### DBO-4 — Office collections: absent, empty, and a route pointing at nothing — RESOLVED 2026-08-14

- **`office_manoeuvre_ranks` does not exist in live Atlas.** Not empty — absent. The route at
  `server/routes/office-manoeuvre-rank.js:7` refers to it.
- **`office_actions`** holds 0 documents; **`office_merit_dots`** holds 2.

Relevant to the OXP epic: code renders differently against dev fixtures than against production.
Decide per surface whether "renders empty" is an intended quiet failure or a defect, and make it
explicit rather than a discovery at the table.

**RESOLVED, dev-storied 2026-08-14 — this section's own "not yet merged" premise was stale.**
**CORRECTION (dbo-4's own external Codex review, same day): `git log origin/main --all` was used at
dev time, which includes local branches — `oxp-1` through `oxp-5` and `oxp-11` are genuinely merged
(oxp-5 via PR #1165, merge commit `1063787b`), but `oxp-6` is NOT on `origin/main`; it exists only on
local branch `ms/oxp-6-office-tab-purchase-markers`, unpushed. Re-verified with `git fetch origin main`
+ `git merge-base --is-ancestor`.** This repo's own `epic-oxp` sprint-status row was stale on the
oxp-5 point (now corrected); its oxp-6 row was already correctly marked `backlog`. Findings, all
confirmed against live `tm_suite` (read-only queries):

- **`office_manoeuvre_ranks` and `office_merit_dots`'s "no document = 0" convention is deliberate**,
  not a gap — confirmed by reading every writer (both `PUT` routes' `upsert: true`, the one reset path
  `resetManoeuvreRank` in `server/routes/office-seats.js:501-544`'s explicit `upsert: false`, with an
  inline comment naming this exact convention). Not a defect.
- **`office_actions` genuinely holds 0 documents because no office action has ever been approved
  through the pipeline** — confirmed by reading the full `POST`/`accept`/`decline` write paths
  (transactional, no silent-failure branch; any non-`RouteResponse` error re-throws as a 500 rather
  than being swallowed). Not a defect.
- **The "renders differently against dev fixtures than production" claim is answered, and it is a
  real, live, currently-open hazard**: `office_merit_dots` holds 2 REAL pre-migration documents still
  keyed by office category (`"Enforcer"`, `"Head of State"`), not by seat. `server/scripts/migrate-
  office-purchases-to-seats.mjs` (built and reviewed alongside oxp-11, dry-run default) has not been
  run against live `tm_suite` — until it is, the current seat-keyed code cannot see either document
  (`GET /api/office_merit_dots` reports both seats as zero-purchased). Both currently hold only
  `{"Safe Place": 0}`, so nothing of real value is at stake *today* — but the migration script's own
  header names a compounding hazard: an ST setting a merit dot on either seat before the migration
  runs creates a fresh seat-keyed document, after which the migration will treat the old category-
  keyed one as already-migrated and leave it permanently orphaned. **Running `--apply` is Angelus's
  action, not an agent's** (same standing convention as DBO-1's own cleanup script) — flagged here,
  in `specs/reference-data-ssot.md`'s new Office section, and in `deferred-work.md` for visibility
  before the compounding case can occur.

No code defect found; no code changed by this story. Full evidence:
`specs/stories/dbo-4-office-collections-absent-empty-route.md`.

### DBO-5 — Location data handover *(joint with Wiki 31-2)*

Ruled 2026-08-14: *"All location data moves to wiki. Location has no relevance at game."* Covers
`st_map_locations` (130 docs) and `locations` (42 docs, 26 polygons). **Verified: this repo has zero
readers for either** — no route, no `server/index.js` mount, no client code.

**Stays here:** `territories` identity and governance — `regent_id`, `lieutenant_id`,
`feeding_rights`, `ambience`, `ambienceMod`, `slug`, `name`. Those are game-relevant and this repo
writes them through real routes. **A polygon is presentation; a regent is a rule.**

This side's work: stop building against either collection; hand over the six `_reveal-*.mjs` scripts
in `server/scripts/` (they live here **only** because the Cockpit's scoped Mongo user cannot write
`st_map_locations` — a credentials accident the move dissolves); drop the source collections **after**
the Wiki verifies a real read.

### DBO-6 — `story_threads` handover *(joint with Wiki 31-3)*

44 populated narrative threads, authored 2026-06-21, keyed on `slug`, carrying
`truth`/`events`/`knowledge`/`participants`. **No route, no mount, no client code in this repo** —
only ST scripts (`_threads-batch3-and-settles.js`, `_threads-rebuild-timelines.js`, `_dt234-extend.js`,
`_dt3-canon-apply.js`, `_fix-carver-fact.js`). No mechanical function at the table.

The empty `tm_wiki.story_threads` twin is the correct destination, built by a 2026-07-25 ruling that
never knew these 44 documents existed. Note live data carries `status: 'seeded'` on 2 documents, a
value none of the authoring scripts declare.

### DBO-7 — `character_dossier` and `archive_documents` handover *(joint with Wiki 31-4, 31-5)*

Both are downtime/story material by the live-play test. `archive_documents`: 60 docs, ~380KB of
narrative HTML, 100% `visible_to_player`, read only by this repo's Story tab.

`character_dossier` is **not** a blanket move — 32 facts carry `sheet_field`/`sheet_value`/`clash`
cross-referencing real sheet values, and where that field is genuinely live-mechanical the coupling
stays. Angelus: *"mostly true with some exceptions like mask etc."* Per-field pass required. Depends
on DBO-2 resolving the schema and reveal questions first.

### DBO-8 — Touchstone mechanic/identity separation — RESOLVED 2026-08-14, scope changed

Original target: `characters.touchstones[]` keeps `{humanity, edge_id?}` and drops `name`/`desc`,
resolving first that Humanity was stored **twice** (`characters.touchstones[].humanity` and
`relationships.touchstone_meta.humanity`) with no reconciliation.

**RESOLVED, dev-storied 2026-08-14 — the "resolve first" investigation changed the story's shape.**
Live query against `tm_suite`: **0 of 44** live `touchstones[]` entries (30 characters) carry
`edge_id`. The **one** `kind:'touchstone'` relationship edge in the whole database is
`status:'retired'` and orphaned (no character references it). Traced why: `public/js/editor/edit.js`'s
own comment cites **issue #162** removing the only code path that ever created an `edge_id`-linked
touchstone — "Legacy entries with edge_id continue to render and edit; their edges sit dormant" — but
zero such legacy entries survive in live data. There was no live disagreement to reconcile, because
nothing live used the dual-storage shape.

Presented to Angelus as a genuine strategic choice (revive vs retire a dormant mechanism), not decided
unilaterally. **Angelus's call: retire the dead mechanic outright** rather than build the originally-
planned split. Delivered: `edge_id`/`touchstone_meta`/`kind:'touchstone'` removed entirely from both
schemas (`character.schema.js`, `relationship.schema.js`) and all code
(`server/routes/relationships.js`, `server/routes/characters.js`, `public/js/editor/edit.js`,
`public/js/editor/sheet.js`); `touchstones[]` stays `{humanity, name, desc?}` — the shape every live
entry already was. A dry-run-only cleanup script for the one orphaned relationship document
(`server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs`) — `--apply` stays Angelus's own action,
though unlike DBO-1's own migration this one carries no urgency (the document is inert; the schema
change alone prevents any new one). Full evidence:
`specs/stories/dbo-8-touchstone-mechanic-identity-split.md`.

**Wiki's own 31-6 should be re-checked against this outcome** — if it assumed the original split
(character-linked touchstones staying a real, buildable-toward mechanic), that assumption no longer
holds on this side.

### DBO-9 — Suite's own duplicated constants

`NON_COMBAT_STYLES` exists in **three** places across two repos: `public/js/editor/sheet.js:2242`,
`public/js/tabs/downtime-form.js:4277` (`NON_COMBAT_STYLES_DT`), and TM Wiki's own copy. Two of those
are inside this repo. Consolidate this side's pair; the cross-repo copy is the Wiki's 31-8.

---

## Not this epic

- **Ordeals.** Already ruled FULL CUTOVER (Epic 30, 2026-08-12): this repo's player-facing Ordeals tab
  and `ordeals-admin.js` marking UI both retire once the Wiki equivalents ship. The cutover is
  **incomplete** — the Cockpit ingest is unbuilt — so this repo's tab stays live and is the working
  surface until it completes. **Do not retire it unilaterally.** The Wiki's story 31-0 handles
  containment on its side.
- **`feral`.** **RESOLVED on the Wiki side, 2026-08-16** (found via a cross-repo store audit run from
  the TM Story/Wiki session): the Wiki's own 31-7 story initially dropped `feral` per an Angelus
  ruling on 2026-08-15, then he corrected it the same day — Story 11-9's own DQ2 had already weighed
  and kept it on real evidence, and the "zero usage" audit that justified dropping it tested the
  wrong signal (a literal-string search against this repo's field, which only ever holds free text).
  `feral` is restored and stays in the Wiki's `feeding_templates`. **Still open, and still this repo's
  call**: whether this repo's `feedMethodEnum` (`server/schemas/downtime_submission.schema.js:58-60`)
  should ever gain `feral` too (Wiki's `deferred-work.md` item 214) — not decided here, no longer
  "opposite fixes in opposite repos" since only one side is still unsettled.
- **Boons and debts** (5 and 4 dossier facts). If an Invictus boon is mechanically enforceable it
  stays; if it is narrative leverage the ST adjudicates, it travels. Not yet ruled.

## Hard constraints

1. **Nothing deploys before the 2026-08-15 game.** This is the app running the session — the one
   surface where a deploy breaks the table live.
2. **No migration, backfill or restructure against production before the game.** After the session,
   deliberately, backup first.
3. **Do not edit `D:\Terra Mortis\data-map.md`.** The TM Wiki session holds it and it has no version
   control — last write wins, silently. Record findings in this repo's `specs/deferred-work.md` and
   they will be folded in at a sync point. Backup: `D:\Terra Mortis\data-map.backup-2026-08-14.md`.
4. **Seam decisions are joint.** Anything spanning both databases goes to the data map's Open Items
   and waits for Angelus. Neither session resolves a seam alone — both sides "fixing" the Ordeals
   surfaces independently could leave players with no working surface at all.
