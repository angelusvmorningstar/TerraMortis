# Deferred Work

## Deferred from: DT Story UX (2026-04-17)

- **DT Story — taller narrative textarea**: The draft/response textarea in story section cards is too short for comfortable writing. Increase its min-height (target: ~6–8 rows or ~120px min).
- **DT Story — collapse completed cards**: Add a toggle (per-character or global) to collapse section cards that are marked complete (`status === 'complete'`), reducing visual noise when most processing is done.

## Deferred from: DTFC Epic Wave 3 (2026-04-20)

These stories are blocked on infrastructure that doesn't yet exist. Defined in `specs/epic-dtfc-downtime-form-calibration.md`.

- ~~**dtfc.9 — NPC Story Moment**~~ — **UNSHELVED**: Now has a full design. Implemented as DT Story 1.11 (Personal Story player form with NPC stub) + 1.14 (six-section report delivery). The NPC stub (`character.npcs[]`) is a placeholder interface; the full NPC Register is a separate future epic. See `specs/epic-dt-story.md` stories 1.11 and 1.14.
- **dtfc.10 — Collaborative Projects**: Allow a lead player to tag collaborators on a project. Tagged players receive an invitation in their DT form; accepting commits one of their project slots with the same title/target but their own pool. Requires an invitation mechanism — either a `downtime_invitations` collection or a new field on submissions. Needs architectural design before implementation.
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
