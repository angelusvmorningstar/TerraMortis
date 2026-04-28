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

## Deferred from: NPCR party-mode review (2026-04-24)

- **Pending-edge lifecycle cap** — Relationship edges in `status: 'pending_confirmation'` with no response accumulate silently. No TTL, no ST broom. If a PC retires or goes inactive after proposing, the proposal sits forever. Options: (a) TTL at ~90 days auto-rejecting to `status: 'rejected'`, (b) surface age on the admin edge editor so STs can manually sweep, (c) exclude proposals from retired-PC initiators. Flagged by Winston; not urgent at current volume.
- **Hard character deletion cascade** — `DELETE /api/characters/:id` does a raw `deleteOne` with no cascade to the relationships graph. Orphan edges with dangling endpoints survive. Enrichment handles it (`_other_name: null`), no crash, but graph integrity degrades. Options: cascade-retire on delete, or a periodic orphan-sweep script that retires edges whose endpoint no longer exists. Flagged by Winston.
- **Mobile rendering audit of Tier 2 UI** — Player portal is desktop-first per project memo; Tier 2 (Relationships tab) was built on that assumption. Players will open it on phones regardless. No audit done; no guarantees about the Add Relationship picker, the edit form, or the pending banner at narrow widths. Flagged by Quinn.
- **Verify multikey indexes on `relationships.a.id` and `relationships.b.id`** — NPCR.2 planned these via `server/scripts/create-relationship-indexes.js`. Confirm they actually ran on live `tm_suite` before NPC-NPC graph work expands query load. Quick verification task, flagged by Winston.
- **QA gaps in flag × st_hidden and retired-endpoint enrichment** — `_flag_state` enrichment doesn't differ by caller role (same shape for ST and player); untested. `_other_name` resolution when the PC on the other side has `retired: true` — behaviour uncharacterised. Flagged by Quinn; add to the next QA pass.
- **Admin letter-context resolver: surface failure signals** — `handleCopyLetterContext` falls through silently when the edge resolver errors. ST gets an incomplete prompt with no indication why. Add a visible "relationship resolution failed" toast or prompt-line note. Flagged by Quinn.
- **"Updated" chip field-list** — currently bare `Updated ✕`. First player to ask "what changed?" will be one too late. Derive from `history[fields].name` when the time comes. Deferred per NPCR.6 r2 design call; pulled forward as a likely soon-needed iteration.
- **Tier 4 story specs** — all five items in the epic footer (Cytoscape visualisation, timeline view, NPC-NPC graph browser, notification subsystem, public directory). Party-mode consensus: **do not spec Tier 4 yet**. Ship Tier 1-3 to main, observe for one cycle of live play, revisit with player signal. Flagged by John; unanimous.
