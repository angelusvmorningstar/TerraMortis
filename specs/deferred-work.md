# Deferred Work

## Deferred from: code review of fix.2.area-of-expertise-qualifier (2026-04-10)

- **Bloodline grants persist to DB after first character save** — `applyDerivedMerits()` in `mci.js` writes bloodline-granted specs and merits (e.g., Gorgon: Animal Ken Snakes, AoE Snakes, IS Snakes) to the character on every render cycle; once saved to Atlas, they become regular character data. This is the same pattern used for MCI/PT/K-9/OHM grants and is intentional. If grants ever need to be revocable on bloodline change, a cleanup pass would be required.
