---
name: TM DT Grounding
description: The canonical grounding rules for ALL downtime processing — provenance gate (FIELD/QUOTED/INFERRED), structured-fields-are-truth, cross-PC verification bar, freshness check, action-type classification, and the shared mechanical rules every tm-dt-resolve-* skill depends on. Load this at the start of any downtime processing session, and whenever another tm-dt skill cites it. Born from the 2026-07-09 Cheval incident (a fabricated cross-PC target that survived into the log until a player caught it).
---

# TM DT Grounding

The single source of truth for how downtime facts are established. Every `tm-dt-*` resolve skill cites this document instead of carrying its own copy of these rules — one place to update, no drift between copies (scattered copies of rules going stale is itself a documented failure mode, F2 in `st-working/reference/dt-processing-hardening-options.md`).

## The Provenance Gate (the load-bearing rule)

**No target, participant, or affected character is ever recorded unless it carries a provenance citation.** Three classes:

- **FIELD** — read from a structured field. Cite the field name and its literal value (e.g. `sorcery_3_targets -> [{"type":"other","value":"See my DT (Amputate the Messenger)"}]`).
- **QUOTED** — a name the player literally wrote in their prose. Cite the quote.
- **INFERRED** — anything else: narrative association, "this sounds like", pattern-matching to another thread. **INFERRED target/participant claims are never recorded as fact. They are presented to the ST as questions.**

Before any resolution is written into the processing log, produce a **Cited Facts block**: each character the action affects, each with its provenance class and citation. An action whose targets are all FIELD/QUOTED can be recorded; anything INFERRED blocks until the ST rules.

**Why this exists:** on 2026-07-09 I recorded "Jack's Cheval rite targets Ryan Ambrose" from narrative conflation (two similar "held kindred" threads). The actual `sorcery_3_targets` field pointed at Jack's own project and an unnamed NPC — no Ryan anywhere. It hardened into the log and was only caught when the player contradicted it. A fabricated cross-PC target is the worst-case fabrication: it drives real PvP and lands consequences on the wrong player.

## Structured fields are ground truth for "who is involved with whom"

The canonical target/participant fields, per action family:

- Projects: `project_N_target_type` / `_target_value` (character OID) / `_target_other`, `project_N_connected_chars`, `project_N_cast`
- Spheres: `sphere_N_target_type` / `_target_value`, `sphere_N_block_merit`
- Status: `status_N_target_value`
- Sorcery: `sorcery_N_targets` (JSON array of typed targets)
- Retainer/Mentor/Staff: `*_N_target`, `*_N_task`
- Feeding: `feeding_territories`, `feeding_territories_rote` (the grid, not the prose — territory attribution follows the grid unless the ST explicitly overrides)

Prose is colour. It can *corroborate* a field or supply a QUOTED name; it never *substitutes* for a field, and it never upgrades an association into a target.

## Cross-PC claims carry the highest bar

Any claim of the form "A does X to B" where B is a player character must trace to FIELD or QUOTED provenance before it is recorded — no exceptions, no "it's obvious from context." The blast radius of getting this wrong is another player's game.

## Disambiguate by ID, never by concept

Known collision surfaces: **three Renés** (René Meyer, René St. Dominique, NPC René), **Charlie Ballsack vs Charles Mercer-Willows**, and *concept* collisions like two simultaneous "captured/held kindred" threads (Jack's unwashed-NPC messenger vs Mac's Ryan Ambrose situation — the exact conflation behind the Cheval incident). Resolve every character reference to a character `_id` via the roster before reasoning about it. If a name/concept could be two people, it is INFERRED until pinned.

## Freshness check (open every processing batch with this)

Submissions are live-editable and shift during processing (confirmed: Anichka re-finalized mid-session; Alice and Charlie arrived after the working dump was taken). At the start of any batch:

1. Query the cycle's submissions: `character_name`, `status`, `responses._final_submitted_at`.
2. Diff against the processing log's last-known list (new characters, draft→submitted flips, re-finalizations newer than their last processing).
3. Process the delta explicitly before continuing the phase — a re-finalized submission may have changed content already resolved (diff it; only re-resolve what actually changed).

No hard cutoff/freeze (Angelus explicitly rejected that) — late submissions are folded in individually as they finalize.

## Classify action types; don't trust the tag

`project_N_action` / `sphere_N_action` is the player's guess, not truth. Confirmed mis-tag patterns: an "investigate" filed as `hide_protect` (Yusuf DT5); PC-vs-PC attacks filed as `misc` (the form's attack framing doesn't fit them); blocks filed as `attack` (no project-level block exists in the form). Step 1 of resolving any action: read the description, state whether the tag matches, and flag mismatches for ST recategorisation — with an `st_note` when recategorised, per the auto-provenance principle.

## Phase-close audit

A phase is not closed until every cross-PC claim recorded during it is listed with its provenance class. Any INFERRED entry blocks closure. (This is the systematic version of the verification pass; run it as bookkeeping, not as remediation.)

## Shared mechanical rules (canonical statements — cite, don't copy)

- **Degrees of success:** 1-2 marginal, 3-4 solid, 5+ exceptional. Heuristic for ST judgement except the 5+ floor, which holds.
- **Discipline in pool → Dramatic Failure on any failure is FEEDING-ONLY** (the Starting Vitae roll). Ordinary action rolls carry no such penalty.
- **Effective ratings always** (dots + bonus) — bonus dots are real dots.
- **Never second-guess Disciplines in** (assistant-side rule): a Discipline enters a pool only if the player declared it anywhere explicit — a form field alone counts; prose alone counts; nothing counts if the player never said it. The ST may add one as their own explicit judgement call (that is a different category, log it as an ST ruling).
- **Specialisations:** +1 die (+2 with Area of Expertise). **Interdisciplinary Specialty** unlocks a spec from its attached Skill — thematic validity is the only test. Professional Training grants 9-Again on Asset Skills (a merit effect, not the spec's).
- **Hard sign-off checkpoint:** pools are presented in one turn and rolled only after explicit ST confirmation in a later turn. Never both in the same turn.
- **Real dice only:** every roll through the project's dice-engine logic (`public/js/shared/dice.js` semantics) with genuine randomness. Never simulated or estimated.
- **Resolution order** (corrected, canonical source `specs/downtime-cockpit-processing-journey.md`): Travel → Rituals → Feeding → Protection/Defence → Block → Support → Ambience → Actions/Misc → Investigate → Attack → Patrol → Contacts → Acquisitions. The block wall leads: no merit action resolves before its potential block is known. Ambience *net* is the terminal City computation.
- **Rules go stale:** before relying on a remembered house rule or constant, confirm it's current — against the live code (`downtime-data.js` constants), the Damnation City doc, or the ST. The errata doc and old memories have both been wrong this cycle.
- **Ad-hoc comparison scripts are a fabrication vector** (F4): a buggy one-off diff invented phantom haven changes on 2026-07-09. Prefer one audited extraction over many quick scripts; when a quick script's output drives a decision, sanity-check it a second way (e.g. index-based vs name-based) before acting.

## Rulings ledger

Novel ad-hoc rulings go to `st-working/reference/st-rulings-log.md` (date, question, ruling, why) — check it before predicting a ruling, append after one resolves. Capturing the "why" on every override is the linchpin of the future learning advisor (journey doc, architecture consult).
