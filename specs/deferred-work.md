# Deferred Work

## Deferred from: DT Story UX (2026-04-17)

- **DT Story — taller narrative textarea**: The draft/response textarea in story section cards is too short for comfortable writing. Increase its min-height (target: ~6–8 rows or ~120px min).
- **DT Story — collapse completed cards**: Add a toggle (per-character or global) to collapse section cards that are marked complete (`status === 'complete'`), reducing visual noise when most processing is done.

## Deferred from: DTFC Epic Wave 3 (2026-04-20)

These stories are blocked on infrastructure that doesn't yet exist. Defined in `specs/epic-dtfc-downtime-form-calibration.md`.

- **dtfc.9 — NPC Story Moment**: Replace the "correspondence" field with a structured NPC story moment (Correspondence / Interaction / Observation). Requires a new NPC data model — a collection of NPCs connected to each character (correspondents + touchstones). This collection and its management UI do not exist.
- **dtfc.10 — Collaborative Projects**: Allow a lead player to tag collaborators on a project. Tagged players receive an invitation in their DT form; accepting commits one of their project slots with the same title/target but their own pool. Requires an invitation mechanism — either a `downtime_invitations` collection or a new field on submissions. Needs architectural design before implementation.
- **dtfc.11 — Equipment Tab in player.html**: Equipment section removed from the DT form (can be done in Wave 2). New Equipment tab in `player.html` is separate scope — needs its own design and story.

---

## Deferred from: code review of fix.2.area-of-expertise-qualifier (2026-04-10)

- **Bloodline grants persist to DB after first character save** — `applyDerivedMerits()` in `mci.js` writes bloodline-granted specs and merits (e.g., Gorgon: Animal Ken Snakes, AoE Snakes, IS Snakes) to the character on every render cycle; once saved to Atlas, they become regular character data. This is the same pattern used for MCI/PT/K-9/OHM grants and is intentional. If grants ever need to be revocable on bloodline change, a cleanup pass would be required.
