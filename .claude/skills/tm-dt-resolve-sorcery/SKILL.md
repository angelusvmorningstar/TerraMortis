---
name: TM DT Resolve Sorcery
description: Resolve a character's declared downtime Blood Sorcery (Crúac / Theban Miracles) rites — determines carryover-via-Mandragora-Garden vs. genuinely-new-this-cycle, rolls only the new rites, and outputs the exact data shape for the downtime_submissions document. Use when the user says "resolve sorcery", "resolve the blood sorcery", "process Phase 0", or during Phase 0 of downtime processing (the first mechanical-resolution phase, before feeding and other project actions).
---

# TM DT Resolve Sorcery

Resolves a single character's declared downtime Sorcery/Crúac (or Theban Miracles) rites for a cycle. Built from a live worked DT5 session with Angelus, following the same audit-before-building discipline as `tm-dt-resolve-feeding`: Cockpit's own `resolve-cycle.mjs` was checked first and confirmed to have **no mechanical resolution for sorcery at all** — it only surfaces `pool_status` read-only with the literal note *"sorcery — mechanical resolution not yet built in this pipeline; showing ST review status only."* Unlike feeding (which has hardcoded ambience/tolerance formulas), sorcery resolution in this cycle's process is a **pure ST judgement call**, not something the Suite or Cockpit computes for you — don't assume a hardcoded formula exists here the way it does for feeding.

See also: `reference_downtime_processing` and `feedback_st_decision_workflow` memories.

## When to Use

Invoke during Phase 0 of downtime processing — sorcery resolves **before anything else** in a cycle, since it can grant pool modifiers affecting later actions (per the documented 7-phase methodology). Triggers: "resolve sorcery", "resolve the blood sorcery", "process Phase 0", or a direct request to work through a character's declared rite(s).

## Data Shape (confirmed against real DT5 submissions — no schema entry exists for these, they're real Mongo fields not in `downtime_submission.schema.js`)

Per character, per rite slot N (1 to `sorcery_slot_count`):
- `sorcery_N_rite` — the rite/power name as declared
- `sorcery_N_targets` — target(s) of the rite
- `sorcery_N_notes` — free text, may contain narrative or self-reported mechanical claims (don't trust these at face value — see Boundaries)
- `sorcery_N_mandragora` — `"yes"`/`"no"` (or similar) — is this rite sustained via the Mandragora Garden merit
- `sorcery_N_mg_locked` — whether the Mandragora slot is locked in
- `_gate_has_sorcery` — top-level flag, whether this submission has any sorcery declared at all

## The Core Distinction — Carryover vs. Genuinely New

1. **Check the rite's full prior-cycle history first.** Query `downtime_submissions` for this character across all prior cycles, looking for this same rite name. Don't just trust this cycle's `sorcery_N_mandragora: "yes"` flag in isolation — confirm the rite was actually established and moved into Mandragora sustain in an earlier cycle, not merely declared as intended.
2. **If established and genuinely continuing via Mandragora Garden: carries over, no roll needed, no fresh cost.** The Mandragora Garden merit lets a rite sustain indefinitely once established — Angelus's explicit ruling: "You don't need to resolve parked rites, the effects and impacts just carry over." Log it as carryover, move on.
3. **Watch for same-name-different-rite traps.** A rite with a superficially similar name in an earlier cycle may be a genuinely different, expired, one-off effect (e.g. a group rave-event variant vs. a standing personal rite) — check duration and context, not just the name string, before treating something as an established carryover.
4. **If genuinely new this cycle** (first cast, or a real different rite despite a similar name): needs an initial roll. Base pool per VtR2e's rite mechanic: **Manipulation + Occult + Crúac (or Theban Miracles)**, target successes = the rite's rank. Cost: typically 1 Vitae + 1 Willpower (confirm against the specific rite/errata — don't assume this is universal without checking).
5. **The TM house Sorcery system (Themes, Sorcery Tolerance, Risk pool with intensifiers/mitigators) is a deeper layer beyond the simple carryover/new-cast pattern above** — consult `st-working/reference/Terra Mortis - Errata Master.md` and the linked Blood Sorcery Google Docs before assuming the simple base-VtR2e mechanic above covers a case that pushes Sorcery Tolerance limits, stacks multiple active rites, or otherwise goes beyond a single new cast. Don't reconstruct this system from memory — re-verify against the source doc, since Angelus flagged mid-session that the errata doc's sourcebook list didn't fully match a separate Google Doc's list (an open, never-fully-resolved discrepancy).
6. **A still-draft submission is not resolved.** If the character's DT submission status is draft (not finalized), skip and note it as outstanding — revisit only once submitted.

## Steps

1. Confirm the submission is finalized (not draft) before resolving anything.
2. For each declared rite slot, pull `sorcery_N_rite`, `sorcery_N_mandragora`, `sorcery_N_targets`, `sorcery_N_notes`.
3. For each rite, query this character's full prior-cycle `downtime_submissions` history for the same rite name to classify carryover vs. new (see Core Distinction above).
4. For carryover rites: log the carryover, no roll, no cost. Done.
5. For genuinely new rites: state the pool and target successes, and **stop for the ST's explicit sign-off before rolling** — same hard checkpoint discipline as `tm-dt-resolve-feeding` (present the pool in one turn, roll only after confirmation in a separate turn).
6. Once confirmed, roll through the real dice engine (`public/js/shared/dice.js` logic, genuine randomness, never simulated).
7. Log the result, cost paid, and whether the rite is now established/parked going forward.
8. Write the player-facing outcome text for any roll that actually happened, matching established narrative style (see `tm-dt-resolve-feeding`'s step 11 for the same pattern).

## Boundaries

- **Never trust a player's self-reported mechanical claim in `sorcery_N_notes`** (e.g. "rolled successfully," a devotion/rite named casually that doesn't match the formal rules text) — verify against the actual power/rite definition and `contested_roll_requests` before building on it. Confirmed pattern this session: a player's own submission called a power "detournement devotion" when the actual devotion (per its formal rules doc) was "The Contagion Principle," with a different, contested pool than what was self-reported.
- Never roll a carryover rite — that's the entire point of the Mandragora Garden exemption.
- Never resolve a rite belonging to a draft (unfinalized) submission.
- Never assume the simple base-VtR2e pool covers a case that looks like it's testing Sorcery Tolerance limits — check the errata doc first.
- Never write results to MongoDB directly unless explicitly asked — log them (in the DT processing log) for the ST or Peter to actually commit.
