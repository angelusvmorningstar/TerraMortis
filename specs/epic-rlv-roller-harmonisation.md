# Epic RLV — Dice Roller Harmonisation

**Goal:** Collapse TM Game's five independent, non-communicating dice-resolution touchpoints
(`roll.js`, `roll-v2.js`, `dice-engine.js`, `char-pools.js`'s picker model, `contested-roll.js`'s own
engine) into one roller, then build issue #1039's genuinely new surface (persistent per-power mod
chips, status-difference auto-mods) on top of that single, known-good base.

**Why:** #1039 ("Roller redesign") asked for a from-scratch-looking UI redesign without accounting
for two implementations that already do most of the hard work (`dice-engine.js`'s attr+skill+
discipline+power builder, `char-pools.js`'s collapsible sectioned picker) — both stranded outside
the player app's roller. Meanwhile the fragmentation itself has already caused two real incidents: a
silent per-device roller mismatch during Game 7 (gdx-7's spend feature never actually fired live),
and a confirmed-live silent bug in `combat-tab.js`'s Quick Roll today. Consolidating is the
precondition for #1039's new features to be built once, not two or three times.

**Source:** Issue #1039 (2026-07-25 meeting intake, never sharded, sat untouched since Piatra
stepped back 2026-08-09). Scoped via: a full functional audit of all five implementations, a
BMAD party-mode roundtable (John/Winston/Sally/Amelia), and a Phase 0 read-only technical audit —
all recorded in `specs/dice-roller-harmonisation-audit.md`. **Read that doc before touching any
story below** — it has the full per-function evidence this epic's scope rests on.

**Relationship to Epic USF (#1047):** Orthogonal, not blocking. USF's own 193-duplication audit
covers Suite↔Player↔Admin CSS/JS fragmentation; the roller never lived in `player.html` (already
deleted, USF Phase 0 Stage B, commit `5fdaa032`), so none of USF's named shards touch roller code.
No sequencing dependency either direction — this epic can proceed independently.

**Status: rlv.1 (PR #1196, open) and rlv.2 (merged to main 2026-08-24, PR #1198) both shipped;
rlv.3-9 pending the decisions named below.**

---

## Open decisions (Angelus) — resolve before storying past RLV-2

These are named in full, with evidence, in `specs/dice-roller-harmonisation-audit.md` §5. Restated
briefly here so this table's own "blocked on" column is legible without cross-referencing:

- **D1 — Rote rules fix. RESOLVED 2026-08-24 (Angelus): NOT a bug, a deliberate house rule.** The
  Phase 0 audit found every engine (identically) implements Rote as "reroll the entire pool a second
  time, keep whichever attempt has more successes" rather than RAW's "reroll only the failed dice,
  keep the original successes," and had flagged this as a rules-correctness defect needing a
  decision. Angelus's own words: "roll twice take best result is what we're using... this is an
  intentional shift from rules." No code change, no retroactive accounting for past rolls. rlv.9
  (which existed solely to fix this) is superseded — see that row below.
- **D2 — DOM-contract cleanup timing.** Land the merge with existing shared IDs untouched, converting
  to a real `getPool()`/`onRollComplete()`/`mountInto()` interface as a *separate* later story
  (Winston's recommendation) — confirm, or do both in one pass?
- **D3 — Staged-rollout mechanism. RESOLVED 2026-08-24 (Angelus): direct cutover, not a staged soak.**
  `roll-v2.js` becomes the only player roller. The `tm-use-new-dice-roller` flag, its Settings
  checkbox, and `roll.js` itself are all removed outright in rlv.2 — no rollback fence held for a
  release cycle. Explicit rationale in his own words: "I only want the new dice roller active, I want
  the old versions retired so there is no switch. Players don't realise there is two and I want to
  just use the one we have been designing, which supersedes the rest." Safe per the Phase 0 audit's
  own §4a finding (byte-identical on every gameplay-critical function, independently confirmed
  twice) — the risk this decision accepts is UI/feature-parity gaps, not rules divergence. This also
  means rlv.2 absorbs the `roll.js`-deletion half of what rlv.6 was scoped to do (see that row below,
  narrowed accordingly) and the Game 7 failure mode (per-device silent mismatch) cannot recur at all
  once this ships, by construction — there is no second roller left to be silently on.
- **D4 — `contested-roll.js`'s scope.** Stays a deliberately-simplified third engine with its own
  header already disclaiming it ("always 10-again, ignores Roll tab state"), or gets folded into the
  unified roller's math with its `TYPES` pool-building table preserved as a distinct entry mode?
- **D5 — State-model reconciliation** (Amelia's still-open flag, not yet resolved by the audit).
  `char-pools.js`'s push-based tap-to-load vs `dice-engine.js`'s compositional dropdown-build are
  different models of "what the current pool is." #1039's mod chips/status-diff mods likely need
  compositional state regardless of entry path — needs its own small design pass before RLV-3.

---

## Stories

| ID | Title | Phase | Status | Blocked on |
|----|-------|-------|--------|------------|
| rlv.1 | Fix `combat-tab.js`'s silent Quick Roll failure under the new-roller flag | Immediate, standalone | **done** — dev-storied, internally reviewed, PR #1196 open against `main` (not yet merged) | Nothing — independent bug fix |
| rlv.2 | Promote `roll-v2.js` to the sole player roller; delete `roll.js` and the flag outright (D3 resolved: direct cutover) | Mechanics merge | **done** — dev-storied, internally reviewed, merged to `main` 2026-08-24 (PR #1198, commit `a8860617`) | Nothing — shipped |
| rlv.3 | Reconcile pool-source state model (push vs compositional) | Design pass | **backlog** | D5 |
| rlv.4 | Port `dice-engine.js`'s builder UX + `char-pools.js`'s picker into the unified roller | Builder port | **backlog** | rlv.2, rlv.3 |
| rlv.5 | Repoint external consumers (`contested-roll.js`, `combat-tab.js`, `challenge-notification.js`) onto the unified module's real exports | Interface cleanup | **backlog** | rlv.2 (D2 decision), D4 |
| rlv.6 | Delete `dice-engine.js`'s standalone dice math once ported (rlv.4) | Cleanup | **backlog** | rlv.4, rlv.5 — narrowed 2026-08-24: `roll.js` and the flag mechanism are now deleted by rlv.2 itself, not held for this story |
| rlv.7 | Persistent per-power modifier chips (#1039 net-new) | New feature | **backlog** | rlv.4 |
| rlv.8 | Status-difference auto-mods for social manoeuvring (#1039 net-new) | New feature | **backlog** | rlv.4 |
| rlv.9 | ~~Rote rules fix~~ | Rules correctness | **superseded** — D1 resolved 2026-08-24, the "bug" is a deliberate house rule, nothing to fix | — |
| — | Special pools (initiative/frenzy/lashing-out), websocket targeted rolls | Explicitly out of this epic | **not scheduled** | #1039 itself scopes these as separate/later slices |

---

## Design-token guidance for stories that touch dice UI (rlv.2, rlv.4, rlv.7, rlv.8)

From TM Admin (`tm-admin-02`, cross-session, post-port review), applies to every RLV story that
touches roller CSS, not just rlv.2 (which already has this folded into its own Dev Notes in full):
`.rv2-eff` is locked to Cinzel Bold / `--type-size-display-hero: 64px` (Angelus-confirmed, don't
reintroduce a literal size); any new build/status-indicator chrome uses the existing
`.status-pill`/`.dt-status-badge` vocabulary, never Cinzel; Cinzel is app/page-level display
headings only (login screen, sidebar brand title) — everything else, including modal titles and
per-item numerals, is Lato/`--type-heading` or Libre Baskerville/`--type-body`; any new CSS should
target the ported token names (`--space-*`, `--radius-*`, `--type-size-*`, `--control-height-*`)
directly. Whoever storys rlv.4/rlv.7/rlv.8 should re-confirm this is still current against
`design-token-port.md` at that time rather than trusting this summary indefinitely.

## Sequencing notes

Per the roundtable's near-total convergence (full detail in the audit doc §3): mechanics merge
(rlv.2, shipped) lands **before** any #1039 new-surface work (rlv.7/rlv.8) — shipping new UI on top
of five still-separate engines makes the underlying fragmentation harder to spot, not safer. rlv.1
is independent and can land any time — it's a live, silent, already-confirmed bug, not part of the
consolidation risk. rlv.9 (Rote) is superseded — D1 resolved 2026-08-24, no fix needed.
