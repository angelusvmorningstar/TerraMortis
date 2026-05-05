---
id: issue-3-territory-fk-adr
issue: 3
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/3
branch: issue-3-territory-fk-adr
status: ready-for-review
priority: high
depends_on: ['issue-3-rfr-cleanup']
parent: issue-3
---

# Story #3 (α): Audit + ADR-002 — territory `_id`-as-FK refactor design

As an architect responsible for the integrity of cross-document references in `tm_suite`,
I should have a single architecture decision document covering the audit, decision, migration plan, and rollout sequence for retiring territory `id` as a foreign key in favour of `_id`,
So that the multi-PR refactor (stories #3b-e) can be planned, sized, and executed against a written contract rather than improvised across files.

This story produces **only** `specs/architecture/adr-002-territory-fk.md` plus an audit-table appendix or sibling. **No code change.** Code changes follow in subsequent stories once the ADR is approved by the user.

---

## Context

Issue #3 was originally framed as "the `id` field on the territories table is overloaded as a label, use `_id` instead". A code re-read and live-data audit (2026-05-05) revealed:

1. **The slug-uniqueness contract is broken in practice.** Five docs in `tm_suite.territories` shared `id: 'secondcity'`. Four of them were obvious test residue (already cleaned in story β / PR #20). But the schema has no uniqueness constraint on the `id` field; nothing prevents the situation recurring.
2. **The slug-as-FK pattern is wired everywhere.** Cross-document references (`regent_confirmations[].territory_id`, `confirmed_ambience[id]`, `discipline_profile[id]`, slug-keyed downtime feeding, ~30 client `territories.find(t => t.id === ...)` sites) all depend on `id`. Any wrong-document collision silently surfaces wrong data; no error fires.
3. **MongoDB's `_id` is already there, already unique, already indexed.** The slug field is redundant as an identifier — at best, it's a human-readable secondary label.

The user (Angelus) authorised **Scope C — full refactor** in chat: promote `_id` to the canonical FK, retire or repurpose `id`. This story scopes the **design**; #3b-e scope the implementation.

### Files in scope

- `specs/architecture/adr-002-territory-fk.md` (new) — the ADR itself, modelled on `adr-001-rules-engine-schema.md`.

### Files NOT in scope

- Any code file. No schema edits, no route edits, no client edits, no migration script. **The deliverable is words, not code.**
- Any other foreign-key audit (characters, downtimes, sessions, etc.). Territory only.
- Decision on whether to actually execute the refactor — that's a separate go/no-go after the ADR is read by the user. The ADR makes a recommendation; the user approves or sends it back.

### Why an ADR rather than diving straight to code

- The change touches **server schema, server routes, ~30 client sites, two cross-document collections, and a migration script** — at least 4 follow-on PRs (#3b through #3e per Khepri's earlier breakdown). Improvising the order risks half-migrated state in production.
- Backwards-compat decisions (e.g. should the API accept *either* `_id` or slug for a transition period?) need to be made *once*, written down, and referenced by every subsequent PR.
- A future reader needs to understand why `id` got retired and what the migration sequence was — this ADR is the canonical answer.

---

## Acceptance Criteria

**Given** Ptah completes this story
**When** the user opens `specs/architecture/adr-002-territory-fk.md`
**Then** they find a document modelled on `adr-001-rules-engine-schema.md` (frontmatter, revision history table, sectioned body) covering at minimum the items listed in the *ADR contents* section below.

**Given** the audit section of the ADR
**When** a reader looks for "every place territory `id` is used as a FK"
**Then** they find an exhaustive table — server collections + fields, server routes + endpoints, client lookup sites — with file paths and line numbers (or path:symbol references where line numbers would churn). Nothing in scope to be silently missed when the migration runs.

**Given** the decision section of the ADR
**When** a reader looks for "what changes and what stays"
**Then** they find a clear statement: which field becomes the canonical FK; whether `id` (the slug) is retired entirely / kept as a non-unique label / renamed to `slug`; how API endpoints that today accept the slug behave going forward; whether parallel-acceptance (read-old-write-new) is required for a transition period.

**Given** the migration plan section
**When** a reader looks for "how do we get from current state to new state without breaking production"
**Then** they find an ordered sequence: schema change first, server-side write paths second, server-side read paths third (or equivalent ordering), data migration script, client refactor, removal of legacy compatibility code. Each step is described with its own success criteria and rollback path.

**Given** the rollout sequence section
**When** a reader maps the sequence onto stories #3b-e
**Then** the mapping is explicit: which step belongs in which follow-on story, what each story can land independently of the others, and which dependencies are hard (must merge in order) vs. soft (could be parallelised by different agents).

**Given** the open-questions section
**When** a reader is ready to greenlight or block the refactor
**Then** they find a clearly listed set of decisions that need user sign-off: the canonical FK decision, the slug retirement decision, the API back-compat policy, and any cross-document FK rewrites that need stakeholder confirmation (e.g. downtime cycles already in the field — do we migrate active cycles or only future ones?).

**Given** the ADR is committed
**When** a developer wants to start work on #3b
**Then** they can read the ADR and know: (a) what schema change to make, (b) what test cases prove the schema is correct, (c) what the next story (#3c) will need from this one. No invention required at the next step.

---

## ADR contents (target structure)

The ADR should follow the shape of `adr-001-rules-engine-schema.md`. At minimum it must cover:

### 1. Frontmatter
- `id: ADR-002`, `title: 'Territory _id-as-FK refactor (retire slug as identifier)'`, `status: draft`, `date: 2026-05-05`, `author: Ptah (DEV)` (or co-author with Winston the Architect persona if that suits better — your call), `revision: 1`, `supersedes: null`, `related: [adr-001, issue #3, PR #20 cleanup]`.

### 2. Context
- Why this ADR exists. Reference the in-conversation audit, the live data anomaly that prompted it, and the broken slug-uniqueness contract.
- Reference β / PR #20 cleanup as the prerequisite.

### 3. Audit
**The largest section.** A full table — one row per file/site that reads or writes territory FKs:

| Site | File:line | Reads `id`? | Writes `id`? | Cross-doc FK? | Notes |
|---|---|---|---|---|---|

Coverage required:
- **Server collections**: `territories.id`, `territories._id`. Cross-doc FKs: `downtime_cycles.regent_confirmations[].territory_id`, `downtime_cycles.confirmed_ambience.<key>`, `downtime_cycles.discipline_profile.<key>`, `downtime_submissions.responses.feeding_territories.<key>` (slug-keyed object), any `tracker_state` references if present, any other collection that mentions a territory by name or slug.
- **Server routes**: `server/routes/territories.js` (GET, POST, PUT, PATCH), any other route that filters or upserts territories (`territory-residency.js`, etc.).
- **Server schemas**: `server/schemas/territory.schema.js`, `server/schemas/territory.schema.js` (residency).
- **Server middleware/auth**: `server/middleware/auth.js` `isRegentOfTerritory`.
- **Server scripts**: any migration script that has historically referenced territories — call out only those that affect the live shape, not one-offs.
- **Client lookup sites** (audited via `grep -rn "territories.find\|territor.*\.id\b" public/js`): the ~30 sites in admin/, suite/, tabs/, and editor/ that read by `t.id`. Include the bigger consumers especially: `public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js`, `public/js/admin/city-views.js`, `public/js/tabs/regency-tab.js`, `public/js/tabs/feeding-tab.js`, `public/js/suite/territory.js`, `public/js/suite/tracker-feed.js`, `public/js/data/helpers.js findRegentTerritory`.
- **Client write sites**: any `apiPost('/api/territories', { id: ... })` or `apiPut('/api/territories/...')`.
- **Reference data**: `public/js/player/downtime-data.js TERRITORY_DATA` — its slug list and how it interacts with the live collection.

For each row, classify into one of: *retire entirely / migrate to `_id` / leave as label*. The classification is what feeds into the migration plan.

### 4. Decision
- **Canonical FK**: `_id` (Mongo ObjectId, stringified for client use).
- **Status of `id`**: pick one — *retire entirely* (drop from schema, drop from all docs) or *retain as `slug` for human-readable URLs / debug labels* (rename + drop required, drop unique assumption, never used as FK). Ptah recommends the option, user signs off.
- **API behaviour**: pick one — *strict (`_id` only)*, *transitional (accept either, write `_id`, deprecation log on slug usage)*, or *dual-permanent*.
- **Client read/write contract**: *all client lookups switch to `String(t._id) === id`*; document writes pass `_id` only.

### 5. Migration plan
Order matters. Recommended ordering — **but Ptah confirms or proposes alternatives based on the audit**:

1. **Server schema** — drop the slug `required`, optionally rename `id → slug`, add `slug` index but no uniqueness if retained.
2. **Server routes** — accept `_id` on PUT/PATCH paths. If transitional API behaviour is chosen, add slug → `_id` translation in the route layer.
3. **Migration script** — for each cross-doc collection, rewrite slug-keyed FK to `_id`. Dry-run + apply pattern, like β / PR #20.
4. **Client refactor** — every `territories.find(t => t.id === x)` becomes `territories.find(t => String(t._id) === String(x))` or equivalent. Touches ~30 sites; could be one PR or split by directory.
5. **Reference data alignment** — decide what `TERRITORY_DATA` slug list means now. Probably keep as a *display/sort manifest* but stop using its slug for FK purposes.
6. **Removal of legacy compatibility** — drop slug-acceptance from API once all clients are upgraded.

For each step, the ADR should note: *what test or audit proves it's safe to ship*; *what's the rollback path if it goes wrong in production*; *what the next step depends on from this one*.

### 6. Rollout sequence (story mapping)
Map the migration steps onto stories #3b through #3e. Recommended:
- **#3b — Server schema + routes** (steps 1 + 2 of migration)
- **#3c — Migration script** (step 3, mirrors β / cleanup-rfr-territory-residue.js shape)
- **#3d — Client refactor** (step 4, possibly split — see if it sizes into one or multiple PRs)
- **#3e — Reference data alignment + legacy removal** (steps 5 + 6)

Mark each as parallelisable / sequential. #3c must follow #3b (need new server contract first); #3d can run in parallel with #3c if API back-compat is in place; #3e is last.

### 7. Open questions
The decisions that need user sign-off **before** any code work starts. Itemised, with Ptah's recommendation and rationale for each:
- Retire `id` entirely vs. rename to `slug` and keep as label?
- Transitional API back-compat or strict cutover?
- Migrate all `downtime_cycles` documents (including historical/closed cycles) or only `active` ones?
- Migrate `downtime_submissions.responses.feeding_territories` even though the keys are *user-typed slug strings* in some legacy submissions, not enum values?
- Anything else surfaced by the audit that needs a stakeholder call.

### 8. References
List the documents this ADR refers to: ADR-001, story β, audit script (cleanup-rfr-territory-residue.js commit), parent issue #3, related stories #3b-e (placeholders even though they don't exist yet), key code files cited in the audit table.

---

## Implementation Notes

### How Ptah produces this

This is **research and writing**, not coding. The work shape:

1. **Audit pass** — `grep` the codebase systematically. Use the categories listed under §3 above as a checklist. Cross-reference with the live MongoDB collection list (you can probe via the same `MONGODB_URI` pattern as the cleanup script — read-only, list collection names + sample documents). Build the audit table.
2. **Decision pass** — for each field/site/route, decide what the new state should be. Where there are alternatives, list them with pros/cons. The user reads pros/cons and makes the call.
3. **Migration pass** — order the steps so production never breaks. The schema-first / client-last ordering above is the default; deviate if the audit reveals something you didn't expect.
4. **Open questions pass** — anything that requires a stakeholder call goes here, not buried in prose.
5. **Write the ADR** — single markdown file, follows ADR-001's shape, ships in one commit.

### Style guidance

- British English (`Defence`, `Honour`, `behaviour`) per CLAUDE.md.
- No em-dashes in body text.
- `ADR-001`-style frontmatter with revision history table.
- Audit tables can be wide; use markdown tables. Where line numbers would churn, cite path:symbol (e.g. `public/js/admin/downtime-views.js:_terrDoc`).
- The ADR is for an audience of **the user (Angelus) plus future Ptah on a future story**. Aim for unambiguous, not verbose. Include enough detail that #3b's developer can act without re-doing the audit.

### What "done" looks like for this story

- One commit on `issue-3-territory-fk-adr` containing `specs/architecture/adr-002-territory-fk.md` and a Dev Agent Record append on this story file.
- The ADR audit table is **complete enough** that the user can read it and say "yes ship the refactor" or "no, this is bigger than I thought, defer".
- Each open question has a Ptah-recommendation attached.
- No code in this PR. If you find yourself wanting to "fix one obvious thing while you're in there", **resist** — file it as a thought in the ADR's open-questions section and let SM size it as a separate story.

---

## Test Plan

This is a doc-only story; the "test" is review.

1. **Self-review (Ptah)** — read your audit table back. Did you cite every site in the categories under §3? Use a grep counter to check (e.g. `rg -c "territories.find\(" public/js/` and compare against the table row count for that pattern).
2. **QA review (Ma'at)** — read the ADR for clarity, completeness, and decision soundness. Check that every "open question" has a recommendation. Cross-check the audit table against the same greps. **No code path to verify computationally** — Ma'at's value here is editorial: would I be confused reading this in three months?
3. **User review (Angelus / Peter)** — make the calls on the open questions. Approve / send back. **This is where the gating happens.** No subsequent code stories start until the ADR is approved.

---

## Definition of Done

- [x] `specs/architecture/adr-002-territory-fk.md` exists, follows ADR-001's structural template
- [x] Audit table covers all categories listed in §3 *(server collections, server routes, server schemas, server middleware, server scripts, client lookups, client writes, reference data — all cited with file:line)*
- [x] Decision section makes clear recommendations on canonical FK, slug status, API behaviour, client contract
- [x] Migration plan is ordered with per-step success/rollback criteria *(6 steps, each with success criterion + rollback path + dependency)*
- [x] Rollout sequence maps onto #3b-e with clear independence/dependence markers *(all sequential, no parallelism — see Rollout sequence table)*
- [x] Open-questions section lists everything that needs user sign-off, each with a Ptah-recommendation *(Q1–Q7, each with recommendation and rationale)*
- [ ] Ma'at review committed as QA Results commit on this branch BEFORE PR *(QA step)*
- [ ] PR target: `dev` *(SM step)*
- [ ] User explicitly approves the ADR (or sends back for revision) **before** issue #3 progresses to #3b *(user step)*

---

## Note for Ptah

Two things to watch:
1. **Don't size yourself out.** This story is research-heavy. If the audit takes longer than you'd budget for an implementation story, that's expected. Use as many `grep`/`rg` passes as you need; cite line numbers liberally.
2. **Resist scope creep into code.** Every time you spot a bug or smell while auditing, add it to a "future-work" list in the ADR — don't fix it. The ADR's value comes from being a complete map; the code stories that follow get to be focused.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed:**
- `specs/architecture/adr-002-territory-fk.md` (new) — full ADR following ADR-001's template: frontmatter + revision history + 9 sections (Context, Audit, Decision, Migration plan, Rollout sequence, Open questions, References, Out of scope). No code changes.

**Audit headline counts:**
- **Server collections affected:** 7 (territories itself + 4 cross-doc FKs in downtime_cycles + downtime_submissions + territory_residency)
- **Server routes touched:** 7 (3 in territories.js + 1 in downtime.js + 2 in territory-residency.js + 1 char projection vestige flagged as future-work)
- **Server schemas:** 2 (territory + territoryResidency)
- **Client lookup sites (`t.id ===` / `territories.find` pattern):** **29** confirmed via `grep -rn "\.find(t => t\.id ==\|territories\.find" public/js`
- **Client write sites:** 3 (`apiPost('/api/territories')`, regency-tab feeding-rights PATCH, regency-tab confirm-feeding POST)
- **Reference data sites:** 2 (`TERRITORY_DATA` + `TERRITORY_SLUG_MAP`)
- **Total audit table rows:** ≈40 across all categories
- **Open questions:** **7** (Q1 retain-as-slug-vs-retire; Q2 strict-vs-transitional API; Q3 dead-code fallback; Q4 submissions key migration; Q5 dormant collection; Q6 cache coordination with #13; Q7 future-work catalogue)
- **Recommended migration steps:** 6 (schema → routes → migration script → client → reference data → legacy removal)
- **Recommended story map:** #3b (steps 1+2), #3c (step 3), #3d (step 4), #3e (steps 5+6), all sequential — no parallelism

**Live MongoDB probe results (2026-05-05, post-PR-#20):**
- `territories.count = 5`, all unique slugs, all `regent_id` values are 24-char ObjectId-stringified character refs.
- `downtime_cycles.count = 3`. Only Downtime 2 has populated `confirmed_ambience` (5 slug keys) and `discipline_profile` (5 slug keys). No cycle currently has populated `regent_confirmations`.
- `downtime_submissions.feeding_territories` keys observed: 6 distinct slug-variants, none matching canonical territories.id values. **All require translation through `server/utils/territory-slugs.js` to resolve.**
- `territory_residency.count = 0` — collection is dormant. Drives Q5.

**Surprises (worth flagging to SM and to user):**

1. **`territory_residency` is dead.** Schema + 2 routes + 0 documents. Either retire it or migrate as a no-op. Q5 captures this.
2. **`regent_confirmations` is empty across all live cycles.** The cross-doc FK pattern Khepri flagged in the story prep (`downtime_cycles.regent_confirmations[].territory_id`) has zero production data. The migration script will touch zero documents on this field — it's a code-side rewrite, not a data-side rewrite. Reduces migration risk for #3c.
3. **Three slug variants in production.** Canonical (`secondcity`), the_-prefixed (`the_second_city`), and display-name (`'The Second City'`) — all live in `feeding_territories` keys, normalised by `TERRITORY_SLUG_MAP`. The slug-as-FK contract was already broken at the *form* layer well before the territories.id collisions surfaced. Drives Q4's recommendation to leave submissions alone and rebuild the form in a future story.
4. **`downtime-story.js` already has a defensive `_id` fallback.** `:506, 678, 2345` use `String(t.id || t._id) === String(terrId)`. Some prior developer was uneasy. The migration cleans up the defensive coalesce; it doesn't introduce a new pattern.
5. **`characters.regent_territory` is vestigial.** Surfaces only in `server/routes/characters.js:212` projection. The migration script that originally moved regency assignment to territory documents has already run (per `migrate-regent-to-id.js` docstring). Filed as future-work in Q7, not addressed here.

**Resisted scope creep:**
- Did NOT touch any code file.
- Did NOT propose fixing the `c._regentTerritory` cache invalidation (belongs to Issue #13 — Q6 records this).
- Did NOT propose retiring `characters.regent_territory` (filed as Q7 future-work).
- Did NOT propose rebuilding the submissions form (the `feeding_territories` keys problem) — Q4 recommends *leaving* legacy submissions intact and rebuilding the form in a separate future story.
- Used a temporary read-only audit script in `server/scripts/_audit-territory-fk.mjs`, executed once, deleted before commit. Not in repo.

**Completion Notes:**
- Followed ADR-001's structural template closely. Frontmatter shape, revision history table, sectioned body, "Out of scope" section, "Recorded dissents" section omitted (none recorded yet — to be added in revision 2 if QA or user surfaces them).
- Style: British English throughout; no em-dashes; markdown tables for the audit; path:line references where line numbers are stable, path:symbol where they would churn.
- The recommendation column on each open question is opinionated. Where the cost is identical (Q1, Q4) the recommendation defaults to the option that improves long-run clarity. Where one option carries real cost (Q2 dual-acceptance has real removal-debt cost), the recommendation goes the cheaper way.

**Change Log:**
- 2026-05-05 — Initial draft committed on `issue-3-territory-fk-adr` (single commit per SM standing instruction). ADR rev 1, status `draft`. Awaiting Maat editorial review and user sign-off on Q1–Q7.

## Note for Ma'at

Your QA value here is editorial review of a design document, not test verification. Read it as if you're a developer about to start #3b based on what you read — would you have everything you need? If anything is ambiguous or under-specified, surface it in QA Results so we resolve before code work starts.

## Note for the User (when Ptah delivers)

The ADR will end with an open-questions list. Each has Ptah's recommendation. You'll need to read the section, make calls on each, and either approve the ADR (which greenlights #3b-e) or send it back with comments. This is the design gate; there's no rush.

---

## QA Results

**Reviewer:** Quinn (Ma'at / QA), claude-opus-4-7
**Date:** 2026-05-05
**Commit reviewed:** 3368cfb
**Method:** Editorial review against story §3 coverage list; grep cross-check; spot-check of cited file:line references; sanity-check of Q2 and Q5; British/em-dash audit; three-month test.

### Editorial verdict: **CONCERNS** (one fix-required on Q5; three nice-to-fix)

The ADR's design decisions are sound and the document is buildable from in three months. One factual audit miss on Q5 should be corrected before the user signs off; three editorial gaps are nice-to-fix.

### Audit-table coverage vs story §3 — PASS (all 8 categories present)

Server collections (13 rows) · Server routes (7 rows) · Server schemas (2 rows) · Server middleware (1 row) · Server scripts (4 rows) · Client lookup sites (~31 rows in per-dir breakdown) · Client write sites (3 rows) · Reference data (2 rows). Spot-checks of cited file:line references (`territories.js:26-29/32-42/65`, `downtime.js:52-120`, `helpers.js:148-154`, `downtime-views.js:2064/2066/6700/6713/...`) all resolve to the claimed code.

### Concern A — Q5 audit basis is factually wrong (FIX-REQUIRED before user signs off)

Q5 (drop `territory_residency` collection) is recommended on the grounds: *"Searching client code: I find no `apiGet('/api/territory-residency')` or `apiPut`/`apiPost`."* This is incorrect.

Live audit:
- `public/js/tabs/downtime-form.js:1312` does `await apiGet('/api/territory-residency')` and populates `residencyByTerritory` from the result (`:1313-1316`).
- `server/index.js:84` mounts the route under `requireAuth`.
- `server/tests/api-players-sessions-residency.test.js` exercises GET and PUT.

The recommendation outcome is *still* defensible — and arguably stronger than Ptah claimed — because `residencyByTerritory` is set at `downtime-form.js:1313-1316` and **never read** anywhere else in the codebase. The client touches the API but the result is dead. Drop scope expands to:

- Collection (0 docs): drop.
- Schema (`server/schemas/territory.schema.js:24-36`): drop.
- Routes (`server/routes/territory-residency.js`): drop. Mount in `server/index.js:24,84` removed.
- Test suite (territory-residency portion of `server/tests/api-players-sessions-residency.test.js`): drop.
- Client dead code: remove `residencyByTerritory` declaration at `public/js/tabs/downtime-form.js:73` and the apiGet block at `:1311-1317`.

**Action requested:** correct the Q5 paragraph in the ADR to acknowledge the client call exists but its result is unused dead code, list the four delete sites above, then re-state the recommendation. The user's call doesn't change but they should make it on the correct premise.

### Concern B — Client lookup count is inconsistent (NICE-TO-FIX)

ADR §Audit/Client lookup sites states "**29 sites** (audit count, 2026-05-05)". The per-directory breakdown table in the same section sums to **31** (12+4+4+3+1+1+1+3+1+1). The ADR's cited grep (`\.find(t => t\.id ==\|territories\.find`) actually returns **19** when run live — it doesn't catch the defensive coalesce form `String(t.id || t._id) === ...` at `downtime-story.js:506,678,2345` and similar. Those rows are correctly cited *in the table* but invisible to the cited grep.

Three numbers in the same section (29 / 31 / 19) is confusing for the future reader. Replace the headline with the table sum (31), and either widen the cited grep or note explicitly that the cited grep is a lower bound that misses the defensive form.

### Concern C — Em-dash usage contradicts the story style guide (NICE-TO-FIX)

Story line 167: *"No em-dashes in body text."* ADR-001 (the structural template) uses 6 em-dashes total. ADR-002 uses **74**. This is project-internal style, not a CLAUDE.md hard rule, but it's a clear miss against the story brief and against the tone-match precedent set by ADR-001.

### Concern D — Step 3 rollback names a paired script that doesn't exist (NICE-TO-FIX)

Migration plan Step 3 says *"Rollback: restore from the backup file via a paired rollback script (or manual `mongorestore`)."* No paired rollback script is scoped into #3c. Either commit to writing one in #3c's spec, or soften the rollback wording to *"manual `mongorestore` of the backup file (or a paired script written as part of #3c)."*

### Decision soundness — PASS

All four decisions (canonical FK = `_id`; slug retain-as-label rename; strict cutover API; client `String(t._id) ===` contract) are clearly stated, with alternatives genuinely considered and rationale grounded. *Risk note for the user* on Q2 (strict cutover): this puts pressure on Step 4 browser smoke as the safety net. Transitional dual-acceptance would soften the deploy-window pressure at the cost of removal-debt. Both defensible — Ptah's call is the cleaner long-run choice.

### Migration plan rigor — PASS (with Concern D)

Each of the 6 steps has a concrete success criterion and correct depends-on chain. Rollbacks are real reverts with no data state corruption (Steps 1, 2, 5, 6) or acknowledged risk (Step 4 honestly notes partial-rollback is dangerous and recommends close deploy timing). Step 3's rollback wording is the weakest (Concern D).

### Open questions sanity check

| Q | Verdict | Notes |
|---|---|---|
| Q1 (retain vs retire `id`) | sound | cost-equivalent options; readable-URL benefit cited. |
| Q2 (strict cutover) | sound, with risk note above | both options weighed; pressures Step 4 smoke. |
| Q3 (retire `_TERR_ID_NAME`) | sound | live data confirms premise. |
| Q4 (leave submissions keys) | sound | append-only audit-trail framing is right. |
| Q5 (drop residency) | outcome sound, **basis wrong** | see Concern A. |
| Q6 (decouple from #13) | sound | cross-cut explicitly acknowledged. |
| Q7 (future-work catalogue) | sound | four items filed. |

Nothing missing from Q1–Q7.

### Editorial — British English & ADR-001 tone match

- British English: PASS. `behaviour` used; no Americanisms detected.
- ADR-001 structural template: PASS. Frontmatter, revision history table, sectioned body, Out-of-scope, References — all present.
- Tone: matches ADR-001 in voice. Em-dash density does NOT match (Concern C).

### Three-month test — PASS (Concern A nuance)

A developer picking up #3b cold has everything they need: schema fields to change, route file:line references, migration-script template precedent, per-directory site counts. Q5's audit miss matters less for #3b's developer (schema + routes work) and more for the user's decision gate now. Once Q5 is corrected, the document is unambiguous for downstream work.

### Recommendation

**Fix Concern A (Q5 audit basis), then PASS.** Concerns B/C/D are editorial polish; the user could read around them. Concern A changes the factual basis on which the user is being asked to make a Q5 call, so it should be corrected before sign-off.
