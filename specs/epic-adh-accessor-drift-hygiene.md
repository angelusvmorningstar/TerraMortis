# Epic ADH — Accessor Drift & Data Hygiene Remediation

**Goal:** Fix the real, verified findings from two 2026-09-02 audits — a code-duplication/drift
re-run (`specs/audit-drift-map-2026-09-02.md`) and a live-Mongo data-hygiene sweep
(`specs/data-hygiene-audit-2026-09-02.md`) — without re-deriving the evidence. Every story below
cites its exact source finding by the audit doc's own name/number.

**Source docs (read before working any story below):**
- `specs/audit-drift-map-2026-09-02.md` — 10 open findings (NEW-1/NEW-2/NEW-3 plus carried-forward
  May items 4, 5, 6, 8, 9, 14, 31), covering places a character stat/merit rating is hand-derived
  instead of routed through a canonical accessor.
- `specs/data-hygiene-audit-2026-09-02.md` — 21 real live-data findings across 12 collections, plus
  a defensive-read section covering FK dual-typing risk on the `character_id` field.

**Scoped by:** a scoping-only pass, 2026-09-02 (no application code changed in that pass — this
epic and its stories are the deliverable). Do not re-run the audits to re-derive scope; both docs
were produced this session against current code/live data.

## Priority flag — read this before picking a story off the list

Two items are materially more urgent than the rest and should be worked first regardless of the
story numbering below (numbering follows each source doc's own recommended sequence within its
own findings, not a single merged risk ranking):

1. **ADH.1 — the ObjectId-only `character_id` query in `characters.js`'s hard-delete cascade.**
   Data-hygiene audit, "Real, unguarded risk found" section. This sits on a **destructive** path:
   if a string-typed `character_id` ever regrows (the exact mechanism that produced issue #558
   once already), a hard character delete undercounts affected rows in the ST-facing
   cascade-preview (false confidence to proceed) and permanently fails to delete the orphaned rows.
   The single most urgent item across both audit docs.
2. **ADH.2 — `server/lib/normalize-character.js`'s stale `MERIT_CHANNELS` list (drift-map NEW-1).**
   This is a live **write-path**: it runs on every character POST/PUT and can silently overwrite
   `m.rating` using an incomplete channel sum (missing `free_retainer`/`free_fwb`), the exact
   failure class the 2026-08-31 "one true rating" fix was created to close on the client side. It
   re-opened, server-side, under a new shape.

Everything else in this epic is real but lower urgency — either dormant-but-real (ADH.4), an
isolated live bug with a small blast radius (ADH.3), or read-side/display-only drift (ADH.5,
ADH.6).

## Sequencing note

Story numbering below follows the drift-map doc's own "Recommended sequence" section for the
drift-map-sourced stories (NEW-1 → NEW-3 → NEW-2 → items 5&6 → item 4 → items 8/9/14/31 batched),
with the data-hygiene ObjectId fix placed first per the priority flag above. There is no hard
dependency between stories — they touch different files — so they can be worked in any order an
ST/dev prefers, but fixing ADH.1 and ADH.2 first is the risk-driven recommendation.

## Correction on scope (2026-09-02)

An earlier verbal brief for this epic asserted TM Game's drift-map audit contained a "Finding #5
(`influence-calc.js` — two disagreeing canonical accessors, needs Angelus's own ruling before any
code change)". **That was a misattribution** — `influence-calc.js` is a TM Story file
(`TM Story/public/js/downtime-form/influence-calc.js`), not a TM Game one, and does not appear
anywhere in TM Game's `audit-drift-map-2026-09-02.md`. Confirmed by direct grep of both this
epic's source docs: no match for `influence-calc`, `meritRef(`, "City Influence panel", or
"Mandragora Garden gate" — none of these correspond to a real finding in TM Game's own audit. Every
finding in TM Game's doc already has an unambiguous refactor target in its own "Refactor target"
column; **no ruling-gated / blocked story was created in this epic.** If a TM Story-side
`influence-calc.js` ruling is genuinely needed, it belongs in a TM Story epic, not here.

---

## Stories

| ID | Title | Source finding | Severity | Status |
|----|-------|-----------------|----------|--------|
| ADH.1 | `characters.js` hard-delete cascade — dual-type `character_id` (+ one-document typo fix) | data-hygiene audit, "Real, unguarded risk found" + Tier 4 `characters.date_of_embrace` | HIGH (destructive path) | Ready for dev |
| ADH.2 | `normalize-character.js` — align `sumChannels()`'s stale `MERIT_CHANNELS` list | drift-map NEW-1 | HIGH (write-path) | Ready for dev |
| ADH.3 | `contested-rolls.js` — `_attrEffective` full formula (Resilience→Stamina) | drift-map NEW-3 | HIGH (live gameplay) | Ready for dev |
| ADH.4 | Propagate `discDots()`'s bonus-channel fix to its real call sites, incl. `getPool()` | drift-map NEW-2 (+ item 4's `resist.js` skill branch, folded in — same file) | HIGH (dormant) | Ready for dev |
| ADH.5 | Fix `contested-roll.js`'s `aval`/`sk` double-count and `prereq.js`'s base-only reads | drift-map items 5 & 6 (May) | HIGH | Ready for dev |
| ADH.6 | Batch MED-and-below read-side cleanup: `ordeals-view.js`, `xp.js` `xpPT5`, direct `m.rating` reads, `sheet.js` `BONUS_SOURCE` | drift-map items 8, 9, 14, 31 (May) | MED / LOW-MED | Ready for dev |

Story files: `specs/stories/adh.1` through `adh.6` (see each file's own frontmatter for the exact
filename).

## Explicitly not in this epic

- Drift-map items 1, 2, 3, 7, 10, 11-13, 15 — already **FIXED** or **orphaned/moot** per the audit's
  own "Changed since May" summary. No story needed.
- Drift-map items 16-28 (structural duplicates) and 21-24/29 (schema-shape) — the audit itself says
  these were not re-verified in enough depth this pass to sequence confidently; needs a dedicated
  future scoping pass, not folded into this epic speculatively.
- Drift-map item 30 (NPCR-14 API scoping) — explicitly deferred to the `ms/p0-coordinator-role-ownership-bypass`
  branch's own findings per the audit.
- Data-hygiene Tier 2 (territory key residual, #496) — still open but unchanged from June, gated on
  a CSV-import write-side fix that wasn't re-investigated this pass; not re-scoped here.
- Data-hygiene Tier 1 (`deadline_at` type drift on `chapters`/`downtime_cycles`), Tier 3 (FK/
  reference-value fragmentation: `sphere_N_target_value`, `project_N_target_value`,
  `responses.xp_spend`, the two `dice_string` fields, `rule_grant.pool_targets`), and the low-
  confidence `purchasable_powers.cost` "-" placeholder — all real but each needs its own
  values-enumeration pass before a canonical shape can be chosen (per the audit's own recommended
  sequence steps 3-6). Cheap enough to fold in only where truly one-line; the `date_of_embrace`
  typo is the one that qualified (folded into ADH.1). The rest are deliberately left unscoped
  pending that enumeration pass — a future epic, not guessed at here.
