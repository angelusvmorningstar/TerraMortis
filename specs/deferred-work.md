# Deferred Work

## Deferred from: DT Story UX (2026-04-17)

- **DT Story — taller narrative textarea**: The draft/response textarea in story section cards is too short for comfortable writing. Increase its min-height (target: ~6–8 rows or ~120px min).
- **DT Story — collapse completed cards**: Add a toggle (per-character or global) to collapse section cards that are marked complete (`status === 'complete'`), reducing visual noise when most processing is done.

## Deferred from: code review of fix.2.area-of-expertise-qualifier (2026-04-10)

- **Bloodline grants persist to DB after first character save** — `applyDerivedMerits()` in `mci.js` writes bloodline-granted specs and merits (e.g., Gorgon: Animal Ken Snakes, AoE Snakes, IS Snakes) to the character on every render cycle; once saved to Atlas, they become regular character data. This is the same pattern used for MCI/PT/K-9/OHM grants and is intentional. If grants ever need to be revocable on bloodline change, a cleanup pass would be required.
