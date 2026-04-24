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
