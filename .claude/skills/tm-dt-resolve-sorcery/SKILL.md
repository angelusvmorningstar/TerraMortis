---
name: TM DT Resolve Sorcery
description: Resolve a character's declared downtime Blood Sorcery (Crúac / Theban Miracles) rites — determines carryover-via-Mandragora-Garden vs. genuinely-new-this-cycle, rolls only the new rites, and outputs the exact data shape for the downtime_submissions document. Use when the user says "resolve sorcery", "resolve the blood sorcery", "process Phase 0", or during Phase 0 of downtime processing (the first mechanical-resolution phase, before feeding and other project actions).
---

# TM DT Resolve Sorcery

Resolves a single character's declared downtime Sorcery/Crúac (or Theban Miracles) rites for a cycle. Built from a live worked DT5 session with Angelus, following the same audit-before-building discipline as `tm-dt-resolve-feeding`: Cockpit's own `resolve-cycle.mjs` was checked first and confirmed to have **no mechanical resolution for sorcery at all** — it only surfaces `pool_status` read-only with the literal note *"sorcery — mechanical resolution not yet built in this pipeline; showing ST review status only."* Unlike feeding (which has hardcoded ambience/tolerance formulas), sorcery resolution in this cycle's process is a **pure ST judgement call**, not something the Suite or Cockpit computes for you — don't assume a hardcoded formula exists here the way it does for feeding.

**Read `.claude/skills/tm-dt-grounding/SKILL.md` first — its rules govern this skill; where the two disagree, grounding wins.** The Cheval incident (2026-07-09) happened *in this skill's domain*: a rite's target was recorded from narrative inference ("targets Ryan Ambrose") without reading `sorcery_N_targets`, which actually pointed at the character's own project and an unnamed NPC. The provenance step below exists because of that.

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
4. **If genuinely new this cycle** (first cast, or a real different rite despite a similar name): needs an initial roll.
   - **Pool:** Manipulation + Occult + Crúac, or Intelligence + Academics + Theban Sorcery (VtR 2e p.152, "The Request").
   - **ALL Crúac and Theban rites are EXTENDED actions** (confirmed by Angelus, 2026-07-10; matches VtR 2e p.152). Roll up to as many times as the **unmodified** dice pool; 30 minutes per roll, reduced to 15 minutes only if the caster has **more** Ritual-Discipline dots than the rite's dot rating. A ritual must be completed in one attempt; it auto-fails if interrupted; no bonus for a prior near-miss. **Never resolve a rite as a single roll.**
   - **Target number of successes is a PER-RITE stat, NOT the rite's rank.** Look it up in the rite's own entry. Never infer it from the dot rating. (Cheval is •• and needs **5**; The Hydra's Vitae •• needs 5; Deflection of Wooden Doom ••• needs 6; Touch of the Morrigan ••• needs 6.) **This was a live error:** DT5 recorded "target successes = 1 (rite rank)" for Jack's Mantle of Amorous Fire and ruled a 1-success cast a clean success. `purchasable_powers` stores `rank` but has **no target-number field**, so the DB cannot tell you this — go to the book.
   - **Resisted / Contested rites** subtract the target's noted trait (e.g. Cheval: Resisted by Composure) — check the rite's own line.
   - **Cost:** Crúac rites cost **one Vitae per dot of the rite** (VtR 2e p.152, "The Sacrifice"); the first Vitae is spent as though fuelling a Discipline, any remainder must be spilled in the casting. Theban miracles cost **1 Willpower** plus a sacrament. (Note: `purchasable_powers.cost` sometimes disagrees with this — e.g. Cheval is •• but the DB records "1 V". Flag the discrepancy to the ST rather than silently picking one.)
   - **Roll results:** Dramatic Failure wastes the sacrifice, applies Tempted (Crúac) / Humbled (Theban), and imposes -2 on the next ritual. Failure accumulates nothing; the player chooses to abandon or continue (gaining Stumbled). Exceptional success lets the player reduce the target number by their Discipline dots, cut the time per roll, or apply Ecstatic/Raptured.
   - **Where the rules live:** the core Crúac/Theban rite list and casting rules are in `st-working/reference/Vampire the Requiem 2e Rulebook.md` (rites from ~line 17190; "The Request"/"The Sacrifice" ~17010-17130). **Grep it before assuming a rite is absent** — Cheval was wrongly declared "not in the local reference set" in DT5 because a `head` truncated the grep output. If a rite genuinely isn't there (e.g. Mantle of Amorous Fire), it is homebrew or from *Sacraments and Blasphemies* — ask the ST for the source, don't infer its stats.
5. **The TM house Sorcery system (Themes, Sorcery Tolerance, Risk pool with intensifiers/mitigators) is a deeper layer beyond the simple carryover/new-cast pattern above** — consult `st-working/reference/Terra Mortis - Errata Master.md` and the linked Blood Sorcery Google Docs before assuming the simple base-VtR2e mechanic above covers a case that pushes Sorcery Tolerance limits, stacks multiple active rites, or otherwise goes beyond a single new cast. Don't reconstruct this system from memory — re-verify against the source doc, since Angelus flagged mid-session that the errata doc's sourcebook list didn't fully match a separate Google Doc's list (an open, never-fully-resolved discrepancy).
6. **A still-draft submission is not resolved.** If the character's DT submission status is draft (not finalized), skip and note it as outstanding — revisit only once submitted.

## Steps

1. Confirm the submission is finalized (not draft) before resolving anything.
2. For each declared rite slot, pull `sorcery_N_rite`, `sorcery_N_mandragora`, `sorcery_N_targets`, `sorcery_N_notes`.
   **PROVENANCE GATE (hard step — see tm-dt-grounding):** the rite's target is whatever `sorcery_N_targets` literally says, quoted verbatim into the record with the field cited. If the field is empty and the prose names a target, that name is QUOTED provenance — quote it. If neither names one, the target is **unstated** — record it as unstated or ask the ST; never fill it by inference, association, or similarity to another plot thread. Character targets resolve to a character `_id` via the roster before being recorded. A rite claimed to target a **PC** without FIELD/QUOTED provenance is a question for the ST, not a fact for the log.
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
