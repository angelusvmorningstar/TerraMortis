# Deferred Work

## Deferred from: DT Story UX (2026-04-17)

- ~~**DT Story — taller narrative textarea**~~ — **FOLDED INTO Epic 1 (Story Surface Reform) as DTS1.10** during 2026-04-27 scoping pass. See `memory/project_dt_overhaul_2026-04-27.md`.
- ~~**DT Story — collapse completed cards**~~ — **FOLDED INTO Epic 1 as DTS1.11** during 2026-04-27 scoping pass. See `memory/project_dt_overhaul_2026-04-27.md`.

## Deferred from: DTFC Epic Wave 3 (2026-04-20)

These stories are blocked on infrastructure that doesn't yet exist. Defined in `specs/epic-dtfc-downtime-form-calibration.md`.

- ~~**dtfc.9 — NPC Story Moment**~~ — **UNSHELVED**: Now has a full design. Implemented as DT Story 1.11 (Personal Story player form with NPC stub) + 1.14 (six-section report delivery). The NPC stub (`character.npcs[]`) is a placeholder interface; the full NPC Register is a separate future epic. See `specs/epic-dt-story.md` stories 1.11 and 1.14.
- ~~**dtfc.10 — Collaborative Projects**~~ — **SUPERSEDED by Epic 5 (Joint Downtimes)** during 2026-04-27 scoping pass. Architectural design is captured in `memory/project_dt_overhaul_2026-04-27.md`. Resolved product calls: lead recourse on decline (Call A), mid-cycle description edits (Call B), action-type whitelist (Call C). 6 stories: JDT5.1 schema, JDT5.2 lead invitation flow, JDT5.3 invitee acceptance flow, JDT5.4 slot lock + read-only display, JDT5.5 ST Processing Joint Projects phase, JDT5.6 lifecycle edge cases.
- **dtfc.11 — Equipment Tab in player.html**: Equipment section removed from the DT form (can be done in Wave 2). New Equipment tab in `player.html` is separate scope — needs its own design and story.

---

## Deferred from: code review of fix.2.area-of-expertise-qualifier (2026-04-10)

- **Bloodline grants persist to DB after first character save** — `applyDerivedMerits()` in `mci.js` writes bloodline-granted specs and merits (e.g., Gorgon: Animal Ken Snakes, AoE Snakes, IS Snakes) to the character on every render cycle; once saved to Atlas, they become regular character data. This is the same pattern used for MCI/PT/K-9/OHM grants and is intentional. If grants ever need to be revocable on bloodline change, a cleanup pass would be required.

---

## Deferred from: code review of npcr.3.flags-collection-admin-queue (2026-04-24)

- **`createTestApp` mountpoint has no `NODE_ENV` production guard** — pre-existing pattern across the test harness. If `createTestApp` is ever imported from non-test code, the `X-Test-User` header allows arbitrary role escalation.
- **Index-creation scripts default to `tm_suite` when `MONGODB_DB` is unset** — pre-existing convention. Vitest setup forces `tm_suite_test` for tests, but manually-run scripts still hit prod by default.
- **Timestamps stored as ISO strings, not BSON Date, project-wide** — consistent between NPCR.2 relationships and NPCR.3 flags. Lexicographic sort works on ISO-8601 by coincidence; change requires a cross-collection migration decision.
- **`apiPost` / `apiPut` do not expose HTTP status codes to callers** — app-wide concern affecting every client route. Clients cannot distinguish 409 from 500, blocking graceful conflict recovery everywhere.
- **No rate limit on `POST /api/npc-flags`** — infrastructure-level. Bounded in practice by a player's active-edge count.
- **Retired characters can still flag** — product decision. Do we silence retired PCs across all player surfaces, or just this one?
- **Test fixtures share `CREATED_FLAG_IDS[0]`/`[1]` by ordinal index** — brittle to vitest order changes; per-test fixtures would be cleaner.
- **`getTestCharacterIds` auto-seeds `_test_seeded: true` characters in `tm_suite_test` with no cleanup path** — pre-existing helper concern.

---

## Deferred from: code review of otc-2-status-actions-server-hardening (2026-08-12)

External Codex review (reasoning_effort=high, 3-pass) of the Status Actions server-hardening story
surfaced several real, verified findings that predate this story (confirmed against the pre-diff
code) and are out of its stated scope. Full record: `specs/stories/otc-2-status-actions-server-hardening.md`
→ Senior Developer Review. **Filed as issue #1143.**

- **No authorization check on `POST /api/office_actions`'s `actor_id`** (High) — any authenticated
  user can submit any character as the acting officeholder, not just their own, and not restricted
  to Head of State. Pre-existing since #691.
- **`game_session_id` is a caller-supplied, unvalidated string** (High) — nothing binds it to a
  real session or the live cycle, so an attacker can invent a fresh session id per request to reset
  both the budget check and the per-target dedupe check. Pre-existing since #691; undercuts the
  value of the otc.2 budget-formula fix, since the scoping key itself is spoofable.
- **Budget check, dedupe check, and the eventual writes are not atomic** (High/Medium) — a real
  concurrent-request race allows overspending the budget or double-acting on one target. Pre-existing
  since #691; otc.2's two added DB round-trips were traced and confirmed not to widen this
  particular window.
- **Self-target check compares raw ObjectId strings, not resolved ObjectIds** (Medium) — an
  uppercase/lowercase-hex pair of the same id bypasses the "cannot target yourself" rule.
  Pre-existing, unchanged by otc.2.
- **`server/tests/helpers/db-setup.js`'s `setupDb()`/`teardownDb()` don't skip cleanly on a failed
  MongoDB connection** (Low) — produces a confusing double-error instead of the wholesale skip the
  file's own header promises. Shared test infrastructure, affects every DB-backed suite in the
  project, not scoped to any one story.
- **`office-tab.js` cannot distinguish "no game is live" from a network/auth failure fetching
  cycles** (Medium) — both render the same "Available once the game session opens" message.
  Matches a pre-existing swallow-errors pattern already used one line above it; a real fix needs a
  UX decision on what each state should actually say.

---

## Deferred from: code review of issue-1143-status-actions-auth-safety (2026-08-12)

Internal Edge Case Hunter + Acceptance Auditor review (issue #1143's own fix). Full record:
`specs/stories/issue-1143-status-actions-auth-safety.md` → Senior Developer Review.

- **`findLatestSession()` has no tiebreak for two `game_sessions` docs sharing a date** (Medium) —
  sorts only by `session_date`, no secondary key. If an ST creates a second session record for the
  same date mid-cycle (a plausible correction), which one two different `POST /api/office_actions`
  requests each resolve to as "the current session" is not guaranteed stable across requests,
  which could split budget/dedupe scoping across two session buckets. Narrow trigger condition,
  not part of issue #1143's original 5 findings — deferred rather than folded into that fix.
- **AC1's actor-ownership check (`office-actions.js`) uses raw string equality, not
  ObjectId-normalized comparison** (Low) — inconsistent with AC4's own reasoning for why the
  self-target check needed ObjectId normalization. Fails safe (rejects a legitimate owner rather
  than admitting an impostor); real-world trigger unlikely given how `character_ids` is populated
  in this project's auth flow. Cosmetic/consistency fix if anyone touches this route again.

**Update, 2026-08-12 (otc-3 review):** the "No authorization check on `actor_id`" finding above was
re-confirmed live by otc-3's own Codex review (`server/routes/office-actions.js` is untouched by
that story's diff). otc-3 opened the Office tab to every player regardless of whether they hold a
court office, which removes the UI-level discovery barrier that previously meant only a Head of
State browsing their own office ever saw the Status Actions panel at all. The API route itself was
always directly reachable by any authenticated session regardless of tab visibility, so nothing new
is exposed — but the pre-existing gap is now more discoverable/likely to be stumbled onto. Angelus
reviewed this trade-off and approved shipping otc.3 as scoped rather than gating it on this fix
landing first; this entry's priority is unchanged (High) but this note records the increased
practical exposure for whoever picks up #1143.

## Deferred from: EQC-5 (issue #1156, dev-story implementation 2026-08-13)

- **Two skill-acquisition Playwright specs have stale fixtures, unrelated to EQC-5** (Low, found not
  caused) — `tests/fix-493-skill-acq-outcome-summary.spec.js` (4 of its 5 tests) and one of
  `tests/fix-player-skill-acq-outcome.spec.js`'s 3 tests ("AC-1: skill acquisition outcome_summary
  appears in player Resources group") fail on `main`/pre-EQC-5 exactly as they do after EQC-5's changes
  (confirmed via `git stash` isolation during this story's implementation). Root cause: both files'
  fixtures place skill-acquisition outcome data at `acquisitions_resolved[0]`, but fix.914 (a later
  story) moved Skill Acquisition to slot `[1]` (Resources kept `[0]`) and these two files' fixtures were
  never updated to match — `fix-491-skill-acquisition-outcome-card.spec.js` and
  `fix-914-acquisition-outcome-field-slot.spec.js` DO use the correct post-fix.914 slot and are fully
  green, confirming the underlying `downtime-story.js`/`downtime-views.js` read logic is correct; only
  these two test files' own fixtures are stale. EQC-5 removed the skill-acquisition WRITE side only
  (see its story's "stop writing, keep reading" shape) and explicitly did not touch either of these read
  files, so fixing stale fixtures in tests for functionality this story doesn't modify is out of its
  scope. Whoever next touches either spec should move the fixture's `acquisitions_resolved` entry from
  index `[0]` to `[1]`.

## Deferred from: EQC-4 (issue #1155, internal 3-layer review 2026-08-13)

- **A tweak request on an availability-5 item computes a cost (6) the catalogue schema cannot
  represent** (Medium) — `tweakedAvailability` returns `base + 1` unconditionally; the catalogue
  schema caps `availability` at 5, so the story's own stated grant mechanism (the ST creates a
  distinct catalogue entry at the requested cost) has no valid target for a tweak on an
  already-maximum-availability item. The request still displays and can be submitted (informational
  only, per AC #5 — doesn't block the draft), so nothing breaks mechanically; an ST reviewing such a
  request will need to adjudicate down or deny it by judgement, same as any other over-cap request.
  Not fixed in EQC-4 itself — enforcing or special-casing the boundary would mean either raising the
  catalogue's global availability cap (a much larger, unrelated change) or silently capping/hiding the
  display, both out of this story's scope. Revisit if this proves a real friction point in play.
- **AC #6 names `npm test`, but that script is a no-op stub in this repo** (Low) — `package.json`'s
  `test` script is `echo "Error: no test specified" && exit 1`; the actual regression command run for
  every EQC story (this one included) is `npx vitest run server/tests`. Looks like boilerplate carried
  across the whole EQC epic's story template rather than something specific to EQC-4 — worth fixing at
  the template level (or wiring `npm test` to the real vitest invocation) next time any EQC-epic story
  is created, rather than patched story-by-story.

## Deferred from: EQC-1 (issue #1152, Codex external review 2026-08-13)

- **`container_id` reference/topology validation** (Medium) — nothing in `characters.js`'s write routes
  (PUT /:id, POST /:id/equipment) validates a `container_id` against the same character's own
  equipment array: a dangling reference, a self-reference, a reference to a non-container catalogue
  item, or a multi-level containment chain are all accepted and stored as-is. Currently harmless
  because no code anywhere reads `container_id` yet (no containment-aware UI exists — that's EQC-3's
  job). Whoever builds the first reader MUST add real validation at that point, either at the write
  route or defensively at the read site. See `character.schema.js`'s own comment on the `equipment[]`
  field for the full disclosure.
- **`container_id` cannot identify a container INSTANCE when a character owns two equipment rows
  referencing the same catalogue item** (Medium) — e.g. two identical safes are indistinguishable by
  `catalogue_id` alone, since `equipment[]` rows carry no per-instance identity. A future
  container-assignment story will need to resolve this — likely by referencing the container's array
  INDEX rather than continuing to key off `catalogue_id`, or by introducing a per-row instance id.
  Real design decision, not a coding bug in EQC-1; deferred to whichever story first builds container
  assignment UI (EQC-3 or later).
