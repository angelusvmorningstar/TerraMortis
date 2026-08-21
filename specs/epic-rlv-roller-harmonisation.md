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

**Status: ready for the first two stories; the rest pending decisions named below.**

---

## Open decisions (Angelus) — resolve before storying past RLV-2

These are named in full, with evidence, in `specs/dice-roller-harmonisation-audit.md` §5. Restated
briefly here so this table's own "blocked on" column is legible without cross-referencing:

- **D1 — Rote rules fix.** Standalone rules-correctness bug (wrong in all five engines, identically,
  predates this epic entirely). Ship independent of this epic's sequencing, or fold in? Any
  retroactive-accounting question for past Rote rolls?
- **D2 — DOM-contract cleanup timing.** Land the merge with existing shared IDs untouched, converting
  to a real `getPool()`/`onRollComplete()`/`mountInto()` interface as a *separate* later story
  (Winston's recommendation) — confirm, or do both in one pass?
- **D3 — Staged-rollout mechanism.** Reuse the existing (imperfect) `tm-use-new-dice-roller` flag for
  one more soak cycle with a visible "which build is active" signal (Winston's proposal), given the
  flag itself already caused the Game 7 incident — or a different approach?
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
| rlv.1 | Fix `combat-tab.js`'s silent Quick Roll failure under the new-roller flag | Immediate, standalone | **ready-for-dev** | Nothing — independent bug fix |
| rlv.2 | Promote `roll-v2.js` to the sole player roller; retire `roll.js` | Mechanics merge | **ready-for-dev** (draft below; confirm D2/D3 before dev-story) | D2, D3 (soft — story can proceed with the roundtable's recommended defaults, flag for Angelus's final call at dev-story time) |
| rlv.3 | Reconcile pool-source state model (push vs compositional) | Design pass | **backlog** | D5 |
| rlv.4 | Port `dice-engine.js`'s builder UX + `char-pools.js`'s picker into the unified roller | Builder port | **backlog** | rlv.2, rlv.3 |
| rlv.5 | Repoint external consumers (`contested-roll.js`, `combat-tab.js`, `challenge-notification.js`) onto the unified module's real exports | Interface cleanup | **backlog** | rlv.2 (D2 decision), D4 |
| rlv.6 | Delete `roll.js`, `dice-engine.js`'s standalone dice math, the flag mechanism | Cleanup | **backlog** | rlv.2 soak period (D3), rlv.5 |
| rlv.7 | Persistent per-power modifier chips (#1039 net-new) | New feature | **backlog** | rlv.4 |
| rlv.8 | Status-difference auto-mods for social manoeuvring (#1039 net-new) | New feature | **backlog** | rlv.4 |
| rlv.9 | Rote rules fix | Rules correctness | **backlog** | D1 |
| — | Special pools (initiative/frenzy/lashing-out), websocket targeted rolls | Explicitly out of this epic | **not scheduled** | #1039 itself scopes these as separate/later slices |

---

## Sequencing notes

Per the roundtable's near-total convergence (full detail in the audit doc §3): mechanics merge
(rlv.2) lands **before** any #1039 new-surface work (rlv.7/rlv.8) — shipping new UI on top of five
still-separate engines makes the underlying fragmentation harder to spot, not safer. rlv.1 is
independent and can land any time — it's a live, silent, already-confirmed bug, not part of the
consolidation risk. rlv.9 (Rote) is independent of everything else in this epic and should not wait
on it, pending D1.
