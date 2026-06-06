# Story Feature.624: ST-only clan/covenant ranking on the player Status tab

## Status: in-progress

## Metadata
- issue: 624
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/624
- branch: morningstar-issue-624-clan-covenant-ranking
- type: feature (NEW data + UI on player and ST sides)

---

## Story

**As a** player,
**I want** to rank the top 3 of my clan and the top 3 of my covenant each downtime cycle,
**so that** the STs get a numerical read of each character's standing within their clan and covenant.

**As a** Storyteller,
**I want** to see each character's aggregated clan-points and covenant-points (summed from all players' ballots, sortable),
**so that** I can gauge social standing — without players seeing the tallies or each other's ballots.

---

## Background

New feature. Players cast a per-cycle ranking ballot (Clan top-3 + Covenant top-3); points (3/2/1) aggregate into an ST-only per-character "rank" score. Players never see the aggregate; STs see the aggregate **only** (not individual ballots). This is the first net-new feature of the recent run, so it **starts with a data-model + auth audit** before any UI (data-hygiene habit).

### Locked decisions (Angelus, via clarifying questions)
- **Per-cycle** ballot, surfaced on the **player Status tab**.
- Two rankings: **Clan** (1st/2nd/3rd) and **Covenant** (1st/2nd/3rd).
- Clan slots offer only the player's **clan** members; covenant slots only the player's **covenant** members.
- The player **cannot rank themselves**; the 3 slots within one ranking must be **distinct** characters.
- Points **1st=3, 2nd=2, 3rd=1**, summed across **all** ballots in the cycle, separately for clan and covenant → a **points total per character** (the "rank").
- **ST-only:** players never see the aggregate; STs see the **aggregate only** (per-character clan-points + covenant-points, sortable) — not individual ballots.

---

## ⚠️ Task 0 (BLOCKING) — Data-model + auth audit & decision

**Do this first; it gates everything else.** Enumerate what exists, then decide where the ballot lives and how the aggregate is read. Present the decision in the Dev Agent Record before building.

**What exists (from research):**
- **Per-cycle data** lives in `downtime_submissions.responses` (flat JSON-stringified per-field keys; POST/PUT `/api/downtime_submissions`, `server/routes/downtime.js:605/1151`). But the ballot UI is on the **Status tab**, not the downtime form, and a player may have **no** downtime submission — coupling the ballot to `downtime_submissions` is awkward.
- **No existing ballot/voting/aggregate collection.**
- **Status tab** renderer: `public/js/tabs/status-tab.js` (entry `public/js/player.js:388`, panel `public/player.html:121`). It currently shows standing status tiers, derived from `GET /api/characters/status`.
- **Clan/covenant filtering helpers:** `public/js/data/status-data.js` — `clanRowsFor(chars, clan, sortName)` (`:61`), `covenantRowsFor(chars, cov, sortName)` (`:50`). Char list from `GET /api/characters/status` (`server/routes/characters.js:281`).
- **Auth:** `server/middleware/auth.js` — `requireRole('st')` (`:109`), `isStRole` treats `dev` as `st`. ST-only endpoint example: `server/routes/tracker.js` (`canAccess` + early 403). Player-scoped write precedent: the safe-place PATCH from #506 (a player-owned write gated by `character_ids` ownership, NOT `requireRole('st')`).
- **Derived-at-render aggregation pattern:** `public/js/editor/xp.js:72/115` (sum via `.reduce`, never stored).

**Decision to make (recommend + confirm with Angelus):**
- **Where the ballot lives.** **Recommended: a NEW collection** `ranking_ballots` (or `clan_covenant_ballots`), one doc per `{cycle_id, voter_character_id}` holding `clan_ranking` + `covenant_ranking` (each `{1: charId, 2: charId, 3: charId}`). Rationale: decouples from `downtime_submissions` (the ballot is on the Status tab and not every player submits a downtime), gives a clean player-scoped write + ST-scoped aggregate read, and matches the ST-only auth boundary. *Alternative:* `downtime_submissions.responses['clan_ranking']` / `['covenant_ranking']` — reuses infra but inherits the awkward coupling above.
- **How the aggregate is read (ST-only).** **Recommended:** a `requireRole('st')` endpoint that returns per-character clan/covenant points totals **computed at request time** from all ballots in the active cycle (derived, never stored). Players have **no** read path to the aggregate.
- **Schema additions** for whichever store is chosen (+ the per-cycle key on the ballot doc). New collection → register in `specs/reference-data-ssot.md`.

---

## Acceptance Criteria

- [ ] **AC1 (audit)** — Task 0 decision recorded (ballot store + aggregate-read endpoint + auth), with the SSOT/schema updated.
- [ ] **AC2 (player UI)** — The player Status tab shows a Clan ranking (1st/2nd/3rd) and a Covenant ranking (1st/2nd/3rd) for the **active cycle**.
- [ ] **AC3 (filtering + self-exclusion)** — Clan slots list only the player's clan members; covenant slots only the player's covenant members; the active character is **never** selectable; the 3 slots within a ranking must be distinct (no duplicate).
- [ ] **AC4 (persistence)** — Submitting persists the ballot for the active cycle via a **player-owned** write (ownership-gated, not ST-gated); re-opening the tab shows the saved picks.
- [ ] **AC5 (aggregate)** — Given all ballots in the cycle, each character's **clan points** = Σ(3·firsts + 2·seconds + 1·thirds) received in clan ballots; **covenant points** the same from covenant ballots. Computed at render/request time (not stored).
- [ ] **AC6 (ST view, ST-only)** — STs see, per character, the clan-points and covenant-points totals, **sortable**; the values are gated to ST (`requireRole('st')`) and are **not** returned to or shown to players. STs see the aggregate **only** — no individual ballots.
- [ ] **AC7 (privacy)** — A player request for the aggregate (or another player's ballot) is rejected/absent. Players see only their own ballot.

---

## Tasks

> Task 0 above is BLOCKING. Then:

### Task 1 — Ballot store + endpoints (per Task 0 decision)
- Create the chosen store (new collection recommended) + schema. SSOT entry.
- **Player write** (own ballot): ownership-gated endpoint (mirror the #506 safe-place player-scoped PATCH — `character_ids` gate, not `requireRole('st')`). Validates: clan picks ∈ voter's clan, covenant picks ∈ voter's covenant, no self, distinct slots, current cycle.
- **Player read** (own ballot only) for pre-fill.
- **ST aggregate read**: `requireRole('st')` endpoint returning per-character `{clan_points, covenant_points}` for the active cycle, computed at request time.
- **dev-fixtures**: add interceptor handlers for the new endpoints (`public/js/dev-fixtures.js` / the `api.js` request wrapper) so localhost works (memory: reference_dev_fixtures).

### Task 2 — Player Status-tab ranking UI
- Add a "Clan / Covenant Ranking" section to `status-tab.js` (player view only — guard on `isSTRole()` so it shows for the player editing their own ballot; never renders the aggregate). Desktop-first (no max-width caps).
- Slot pickers (1/2/3 × clan, 1/2/3 × covenant) populated via `clanRowsFor`/`covenantRowsFor` minus the active char, with distinct-slot enforcement. British English labels. Reuse existing chip/section CSS (audit `status-tab` + `components.css` first; don't invent styles).
- Save on submit → the player-write endpoint; pre-fill from the player-read endpoint.

### Task 3 — ST aggregate view (on the Status tab, ST-view only)
- **DECIDED (Angelus 2026-06-06):** the aggregate appears on the **Status tab itself in ST-view**, NOT the admin Player grid. `status-tab.js` already branches on `isSTRole()` (the ST view at ~`:242-271`) — add the per-character clan-points + covenant-points there, sortable.
- Values come from the ST aggregate endpoint (`requireRole('st')`, computed at request time). The **player** view of the Status tab shows only the player's own ballot UI (Task 2) and **never** the aggregate.

### Task 4 — Tests (Playwright E2E; vitest for any server route)
- Player: clan/covenant slots filtered + self excluded + distinct enforced; save+reload round-trip.
- ST: aggregate totals correct for a known set of ballots (3/2/1 maths); sortable; player token gets 403/empty on the aggregate.
- Server route unit tests in `tm_suite_test` (never live DB).

### Task 5 — Verify + SSOT/docs
- Run the new specs (one persistent http-server; never concurrent Playwright). Update `specs/reference-data-ssot.md`. Note: dev proxies `/api/*` to prod, so server changes aren't live-testable on `dev` until `main` — verify via specs.

---

## Dev Notes

### Key files (from research — file:line)
- **Player Status tab:** `public/js/tabs/status-tab.js` (renderer; `renderStatusSection` `:180`); entry `public/js/player.js:388`; panel `public/player.html:121`.
- **Clan/covenant filtering:** `public/js/data/status-data.js` — `clanRowsFor` `:61`, `covenantRowsFor` `:50`, `covenantListFor` `:36`. Char source `GET /api/characters/status` (`server/routes/characters.js:281`).
- **Per-cycle submission infra (if Option A):** `server/routes/downtime.js:605/1151`; `responses` shape + collect pattern `public/js/tabs/downtime-form.js:368+` (e.g. the `game_recount_N` field loop `:587`).
- **Admin Player grid:** `public/js/admin.js` — `renderCharGrid` `:530`, `charCard` `:552`, sort comparator `:548`. Sortable-header precedent `public/js/admin/attendance.js:14/209/268`.
- **Auth:** `server/middleware/auth.js` — `requireRole('st')` `:109`, `isStRole` `:82` (dev==st); localhost bypass `:21`. ST-only endpoint pattern `server/routes/tracker.js:10-27` (`canAccess` + 403).
- **Player-scoped write precedent:** the #506 safe-place PATCH (player-owned write gated by `character_ids` ownership, not `requireRole('st')`) — find via `git log`/`characters.js`.
- **Derived aggregation pattern:** `public/js/editor/xp.js:72/115` (`.reduce`, recomputed, never stored).
- **Char schema:** `server/schemas/character.schema.js` — `clan` (`:60`), `covenant` (`:~70`), `status.covenant` map (`:114-132`).
- **dev-fixtures:** `public/js/dev-fixtures.js` + `public/js/data/api.js:16` (request wrapper).

### Hard rules to respect
- **Derived stats are never stored** — the points aggregate is computed at request/render time, not persisted.
- **British English** throughout; **no em-dashes** in UI text; reuse existing CSS tokens/classes (audit `status-tab`/`components.css` before writing styles — memory: feedback_audit_css_before_writing).
- **Auth boundary is the crux:** the aggregate must be `requireRole('st')`; the player write must be ownership-gated (players can't use the ST role). Players must have **no** read path to the aggregate or to others' ballots (AC7).
- **Player portal is desktop-first** (`player.html`) — no max-width caps on the new section.
- **dev** proxies `/api/*` to prod (memory: reference_dev_frontend_prod_api) — server changes aren't live on `dev` until `main`; verify via Playwright, not a dev smoke check.
- Tests run against `tm_suite_test`, never live `tm_suite`.

### Open questions (propose a default, don't block)
- **Same char in both lists?** A character who shares both your clan and covenant could appear in both your clan ranking and covenant ranking — assumed **allowed** (separate lists).
- **Partial ballots?** Filling only 1st/2nd (leaving 3rd blank) — assumed **allowed**; points only count filled slots.
- **ST view placement** — grid sortable columns vs dedicated panel (Task 3 recommends grid + sort toggle); Angelus to confirm.
- **Tie-handling** when sorting equal point totals — default to a stable secondary sort by `sortName`.
- **Cycle scoping** — which cycle is "active" for the ballot (the open downtime cycle); confirm the resolver the Status tab should use.

### Why audit-first
This adds a new data shape + a new auth surface. Getting the store + auth wrong (e.g. leaking the aggregate to players, or coupling to `downtime_submissions` for a player with no submission) is far costlier than the UI. Task 0 must land a written decision before Tasks 1–3.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Task 0 decision (Angelus, 2026-06-06) — AC1
- **Ballot store:** NEW `ranking_ballots` collection, one doc per `{cycle_id, voter_character_id}` with `clan_ranking` + `covenant_ranking` (`{1:charId,2:charId,3:charId}`). (Angelus deferred the backend call; new collection chosen over `downtime_submissions.responses` to decouple from the downtime form.)
- **Aggregate display:** on the **Status tab in ST-view** (`isSTRole()`), per Angelus — not the admin grid.
- **Auth:** player write = ownership-gated endpoint (`character_ids` gate, #506 pattern); ST aggregate read = `requireRole('st')`, computed at request time (derived-never-stored). No player read path to the aggregate.

### Debug Log References
- `npx vitest run tests/api-ranking-ballots.test.js` → **12 passed** (against `tm_suite_test`).

### Completion Notes List
- **Task 0 — done** (decision above; AC1).
- **Task 1 (backend) — done.** New `ranking_ballots` collection (one doc per `{cycle_id, voter_character_id}`). Routes (`server/routes/ranking_ballots.js`, mounted `/api/ranking_ballots`):
  - `PUT /` — player upserts own ballot. Ownership-gated (`owns()`, ST may write any). Server-side validation (defence-in-depth, AC3): self-exclusion, distinct slots, clan-membership (`c.clan === voter.clan`) and covenant-membership (`c.covenant === voter.covenant || c.status.covenant[voter.covenant] > 0`). Partial ballots allowed.
  - `GET /mine?cycle_id=&voter=` — player reads own ballot (ownership-gated).
  - `GET /aggregate?cycle_id=` — **`requireRole('st')`**; sums 3/2/1 per character across all cycle ballots, computed at request time (derived-never-stored). Players get 403 (AC6/AC7 covered by tests).
- Schema `server/schemas/ranking_ballot.schema.js` (shape only; business rules in route). Mounted in both `server/index.js` and `server/tests/helpers/test-app.js`.
- **Task 2 (player ballot UI) — built.** `status-tab.js` player view now renders a "Clan & Covenant Ranking" section: 3+3 `<select>` slots populated from `clanRowsFor`/`covenantRowsFor` **minus the active char** (self-exclusion), with a Save button (client distinct-check → `PUT /api/ranking_ballots`) and pre-fill from `GET /mine`. Active cycle resolved via `/api/downtime_cycles` (LIVE statuses). Module syntax verified.
- **Task 3 (ST aggregate) — built.** `status-tab.js` ST view renders a "Ranking Points — this cycle" section (clan + covenant leaderboards, sorted desc), fetched from `GET /aggregate`. Player view never fetches/shows it.
- **dev-fixtures — done.** Echo handlers for the three endpoints added to `dev-fixtures.js`.
- **Playwright E2E — written but NOT GREEN LOCALLY (environment blocker, not #624).** `tests/feature-624-clan-covenant-ranking.spec.js` covers: ballot renders, clan picker excludes self + non-members, save PUTs the picks, ST aggregate shows points. **The player-portal test harness fails to boot in this local env** — the page shows "Could not load app" *before any feature code runs*; the existing `tests/player.spec.js` auth test fails identically, **and still fails with my frontend changes git-stashed** — so this is pre-existing player-portal test-debt, not this feature. The spec should pass once the player-portal boot harness is fixed / in CI. **Flag: separate issue for the player-portal Playwright boot.**

### File List
- server/schemas/ranking_ballot.schema.js (NEW)
- server/routes/ranking_ballots.js (NEW)
- server/index.js (mount)
- server/tests/helpers/test-app.js (mount)
- server/tests/api-ranking-ballots.test.js (NEW — 12 tests, green)
- public/js/tabs/status-tab.js (player ballot UI + ST aggregate view)
- public/js/dev-fixtures.js (echo handlers for the 3 endpoints)
- tests/feature-624-clan-covenant-ranking.spec.js (NEW — E2E; blocked locally by the pre-existing player-portal boot harness)
- specs/stories/feature.624.clan-covenant-ranking.story.md (this story)

### Change Log
- 2026-06-06 — Task 0 design decision + Task 1 backend: new ranking_ballots collection + player-write / player-read / ST-aggregate endpoints with server-side validation; 12 route tests green. UIs pending.
