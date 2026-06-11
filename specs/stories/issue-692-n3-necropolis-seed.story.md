# Issue #692: N-3 — Necropolis merit family seed + Collective Compound rule_grant + rating_of_source evaluator

Status: Ready for Review

issue: 692
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/692
branch: piatra/issue-692-n3-necropolis-seed
epic: MNEC (specs/epic-mnec-necropolis-merits.md — committed in this PR; was a Thoth session artefact uncommitted on dev)
adr: ADR-005 Rev 2 (specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md)
dispatch: PROCEED-WITH-NOTICE; HALT-DAR raised + resolved 2026-06-11 (canonical MNEC file copied in from main workdir; Khepri confirmed contents match Thoth's session output).

## Story

As an N-1-merged campaign,
I want the nine Necropolis merits + the Necropolis Sepulcher Collective Compound rule_grant + the pool-evaluator `amount_basis: 'rating_of_source'` handler all in production,
so that Nosferatu characters can buy Sepulcher and have its dot rating fund free grants into the six collectively-shared target merits — auto-shared across all qualifying owners via the N-1 synthesis path — and N-4 / N-5 can land their UI work on top of the data.

## What ships

- **MNEC epic file** committed at `specs/epic-mnec-necropolis-merits.md` (was an uncommitted Thoth session artefact on the main workdir; this PR makes it canonical on `dev`).
- **9 `purchasable_powers` docs** seeded via `server/scripts/seed-rules-necropolis.js` — verbatim rule text per the MNEC epic, including the three preserved CSV typos per Peter's 2026-06-10 ack (no auto-correct):
  - White Ants: "to **detects** their personal actions" (intended "to detect")
  - Trap Door: "**a** entrance to the Necropolis" (intended "an entrance")
  - Trap Door: "above **group** in a Territory" (intended "above ground")
- **One `rule_grant` doc** for Necropolis Sepulcher with `source_slug: 'necro'`, `amount_basis: 'rating_of_source'`, `partner_shareable: true`, `sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 }`, and the six target merit names in `pool_targets`.
- **Pool-evaluator extension** — `_computeAmount` now handles `amount_basis: 'rating_of_source'` by delegating to the existing `_ratingOfPartner` helper against `rule.source`. Reads purchased dots only (cp+xp) — anti-loop guard ensures the source's own free grants don't amplify the pool.
- **Trap Door dual-anchor data shape only** — Trap Door's prereq + xp_fixed + flat rating are seeded. The actual `attached_to: { origin, destination }` value is set at purchase-time by the player; the schema accepts it (N-1 D7). UI picker is N-5.

## Acceptance gates

1. ✅ MERITS_DB shape — all 9 docs exist with `parent: 'Kindred'`, `category: 'merit'`, correct `rating_range`, `xp_fixed` set on the three flat-cost merits (True Worm, Dark Temple, Trap Door), and the prereq trees matching the MNEC family/standalone split.
2. ✅ rule_grant Collective Compound shape — pool doc carries `partner_shareable: true`, `sharing_scope.type === 'collective_owners_of_merit'`, and the six pool_targets.
3. ✅ Idempotency — running the seeder a second time touches zero docs (regression test runs `--apply` twice and asserts "Touched 0 doc(s)" on the second).
4. ✅ Pool-evaluator `rating_of_source` math — Necropolis Sepulcher 3 → `_grant_pools` entry of amount 3 across the six targets. Source-absent skips the grant. Purchased-only guard verified.
5. ✅ End-to-end Collective Compound (Necropolis fixture) — Alice (Sepulcher 3, Catacombs 2) and Bob (Sepulcher 2, Catacombs 1) see each other in `_collective_shared_with` on Catacombs; Carl (no Sepulcher, no Catacombs) sees no synthesised field on any merit. Resolver helper agrees with the API behaviour for the same fixture (sanity).
6. ✅ Verbatim-typo presence — explicit assertions on `description` for the three CSV typos.

## Tasks / Subtasks

- [x] MNEC epic file (`specs/epic-mnec-necropolis-merits.md`) — canonical from Thoth's session; committed.
- [x] Pool-evaluator `_computeAmount` — add `case 'rating_of_source': return _ratingOfPartner(c, rule.source);`.
- [x] Atomic seeder (`server/scripts/seed-rules-necropolis.js`) — idempotent, `--dry-run` default, `--apply` to write; 9 merit upserts + 1 rule_grant upsert.
- [x] Test file (`server/tests/n3-necropolis.test.js`) — 12 vitest cases across the 4 dispatch ACs + typo-preservation.
- [x] Story file (this one).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **HALT-DAR raised + resolved (2026-06-11).** The MNEC epic referenced as the source of truth wasn't committed on `dev` — Thoth had written it in his session but never `git add`-ed. Khepri confirmed the canonical file lived in the main workdir at `/Volumes/EXT.2T.1/Git/Misc/TerraMortis/specs/epic-mnec-necropolis-merits.md` (304 lines, 21867 bytes) and matched his session transmission. Copied into the worktree and committed as part of N-3 so the canonical source-of-truth lives on `dev` going forward.
- **The "MERITS_DB" naming in the dispatch is a slight misframing** — there is no JS `MERITS_DB` constant in the current codebase; merits live in the `purchasable_powers` MongoDB collection (loaded via `getRuleByKey(slug)` from the rules cache). The seeder writes there. The dispatch's structural intent is satisfied.
- **"rank" field stays null on all 9 entries** — across all existing merits in the live DB, none populate `rank` (rank is used by disciplines, where it indicates the discipline-power tier). Flat-rated merits (True Worm, Dark Temple, Trap Door) encode as `rating_range: [N, N]` plus `xp_fixed: N`. The dispatch's "rank 2" framing for these maps to the existing flat-range convention.
- **`sub_category: null` on all 9** — existing merit docs use sub_category to drive rendering placement (general / domain / influence). Necropolis Sepulcher is described in the epic as a "personal non-shareable Safe Place" so could plausibly be `'domain'`, but the rest of the family doesn't cleanly fit any existing bucket. Defaulted to null for all 9 to match the conservative existing pattern (~80% of merits are sub_category=null); STs can adjust if a rendering preference emerges.
- **`pool-evaluator rating_of_source` reuses `_ratingOfPartner`** rather than introducing a new helper. The semantics are identical: read cp + xp on every merit named `rule.source`. Avoiding a new helper keeps the evaluator-purity convention (no external imports) intact.
- **`amount_basis: 'rating_of_source'` was already in the schema enum** (`rule-grant.schema.js`) — the evaluator just didn't have the handler. This is the "small addition" the dispatch flagged; no schema change needed.
- **Three pre-existing test-file failures** (archive-import) carry forward from the N-1 PR — not caused by N-3. All 1271 individual tests pass.
- **Worktree pattern continued** (`/tmp/tm-ptah/n3-necropolis`, node_modules + server/.env symlinked from main).

### File List

**New**
- `specs/epic-mnec-necropolis-merits.md` — canonical Thoth-authored epic, committed to dev for the first time
- `server/scripts/seed-rules-necropolis.js` — atomic, idempotent seeder (9 purchasable_powers + 1 rule_grant)
- `server/tests/n3-necropolis.test.js` — 12 vitest cases
- `specs/stories/issue-692-n3-necropolis-seed.story.md` — this file

**Modified**
- `public/js/editor/rule_engine/pool-evaluator.js` — `_computeAmount` gains the `rating_of_source` case

### Change Log

- 2026-06-11 (Ptah): HALT-DAR — MNEC epic missing on dev; Khepri pointed at canonical file in main workdir; copied + committed.
- 2026-06-11 (Ptah): N-3 shipped — 9 merits + 1 rule_grant seeded; pool-evaluator extended; 12 tests passing.
