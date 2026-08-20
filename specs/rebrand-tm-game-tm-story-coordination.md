# Rebrand coordination — `tm_suite`→`tm_game`, site/service renames

**Status: PLANNED, not yet executed. Phase 0 (prep) in progress. No live cutover has happened.**
**Full plan: `../../rebrand-game-story-admin.md`** (umbrella root — this repo doesn't own the change
alone, TM Story and TM Admin are both affected too).

Written 2026-08-21 from a TM Admin session, in the same spirit as this repo's own
`specs/cm-2b-cross-repo-coordination.md` — a heads-up left in each affected repo rather than only
in the session that authored it, so anyone picking up work here isn't surprised.

## What's changing here specifically

- MongoDB Atlas database: `tm_suite` → `tm_game`.
- Netlify site: `terramortissuite.netlify.app` → `terramortisgame.netlify.app`.
- Render service: `tm-suite-api` → `tm-game-api`.
- Load-bearing files already identified by research (see the umbrella doc for the full inventory):
  `server/config.js:9`, `server/db.js:25`, `server/index.js:320` (DB-name fallback defaults),
  `server/helpers/email.js:25` (`PORTAL_URL` — breaks player-facing downtime-outcome email links if
  missed), `netlify.toml:19`, `public/js/data/ws.js:91`, `website/js/banner.js:7` (Render API host),
  `.github/workflows/*.yml` (CI), plus ~30 `server/scripts/*.mjs` files with a
  `process.env.MONGODB_DB || 'tm_suite'` fallback pattern.

## What this means if you're working here before the cutover

- Don't add fresh code that hardcodes `tm_suite` or `terramortissuite` as a new literal — if you're
  writing a new script, prefer requiring `MONGODB_DB` explicitly (no silent fallback) over adding
  another instance of the pattern this rebrand is trying to close off (already flagged as a known
  risk in `specs/deferred-work.md:58`).
- Normal feature work and deploys to `dev` continue as usual — this doesn't freeze the repo. Only
  the actual cutover window (Phase 2 of the umbrella plan) needs a clear runway, coordinated with
  Angelus directly.
- The ~30 migration/seed scripts under `server/scripts/` with the `|| 'tm_suite'` fallback are
  explicitly a **trailing cleanup item (Phase 3)**, not a blocker — but if you run one of them
  between the cutover and that cleanup landing, pass `MONGODB_DB=tm_game` explicitly rather than
  trusting the default.
- Next TM Game session (Game 8) isn't until 2026-09-19, so there's no session-timing pressure on
  scheduling the cutover itself.
