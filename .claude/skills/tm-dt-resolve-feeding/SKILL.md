---
name: TM DT Resolve Feeding
description: Resolve a character's downtime feeding — both the main feed action (validated, not rolled — the player rolls it live before next game) and any Rote Hunt project action (a separate action, resolved and rolled now). Matches the declared dice pool against the player's actual feeding description, applies Specialisations generously, never adds a Discipline the player didn't name, and outputs the exact data shape for the downtime_submissions document. Use when the user says "resolve feeding", "resolve the rote feed(s)", "process Ocka/<character>'s feed", or during Phase 1 Step 2 of downtime processing (feeding pool review).
---

# TM DT Resolve Feeding

Resolves a single character's declared feeding for a downtime cycle — the one main feed action every character gets, plus an optional Rote Hunt project action if they dedicated a project slot to one. Built from a live worked session with Angelus (Ocka/Walter Kelly, DT5) after several wrong turns — those corrections are baked into the steps below, not left as pitfalls to rediscover.

**Read `.claude/skills/tm-dt-grounding/SKILL.md` first — its rules (provenance gate, freshness check, structured-fields-are-truth, shared mechanical rules) govern this skill; where the two disagree, grounding wins.**

See also: `reference_feeding_pool_interpretation` and `feedback_st_decision_workflow` memories for the durable version of this method and its origin.

## When to Use

Invoke during downtime processing when resolving a character's feeding — Phase 1 Step 2 in the documented 7-phase methodology (after Sorcery/Phase 0, before the rest of Phase 2's project actions). Triggers: "resolve feeding", "resolve the rote feed", "process `<character>`'s feed", or a direct request to work through someone's feeding declaration.

**Batching is fine and expected.** This skill processes one character at a time internally, but presenting several characters' pools together in one turn for a single combined sign-off works well and is the normal way this gets invoked in practice (confirmed live across batches of 3 and 5 characters, DT5) — just don't roll any Rote Hunt in the batch until the ST has signed off on all of them.

**Full-cycle bulk run, grouped by confidence (Angelus's stated preference for future cycles):** when asked to run this against every feeding action in a cycle at once, process all of them through steps 1-6 first, then present the results split into two groups rather than one flat list, so the ST's attention goes where it's actually needed:
- **High confidence** — the declared pool (or an obviously-correct generous Specialisation add) matches the description cleanly, no reframing needed, Discipline use (if any) is unambiguous, territory matches with no override needed, description wasn't blank/thin. These can be signed off in bulk with a quick skim.
- **Low confidence** — any of: a full Attribute/Skill/Discipline reframe was needed (the two smell-tests in step 3); Discipline attribution is ambiguous or contradicts something else in the submission; a territory mismatch/Regent-override applies; the description was blank or too thin and had to be grounded in prior-cycle history; or anything else that genuinely needed a judgement call rather than a mechanical read. These need the ST's actual eyes, one at a time or in a small batch, not a bulk skim.
Still respect the hard sign-off checkpoint (step 7) for both groups — grouping by confidence changes how results are *presented*, not whether rolling still waits for explicit confirmation.

## The Two Actions — Know Which One You're Resolving

1. **Main feed action** — every character gets exactly one per cycle, declared via `feeding_territories`, `_feed_method`, `_feed_custom_attr`/`_feed_custom_skill` (or a fixed method), `_feed_blood_types`, `feeding_description`. **You validate this pool. You do not roll it.** The player rolls it live, before the next game session, and picks how much Vitae to take from vessels then. Recorded in the top-level `feeding_review` field on the submission doc.
2. **Rote Hunt project action** — optional, only exists if the character dedicated a project slot to it (`project_N_action: "rote"`, often with `project_N_feed_method2`). This is a genuinely separate action with its own pool, resolved and **rolled now**, during processing, like any other project action. Its own roll is never itself Rote (`params.rote: false` even though the action type is `"rote"`). **On success, it grants Rote quality to the main feed action** (which is still rolled later, by the player — flag it `rote: true` in `feeding_review`, don't roll it now either). Recorded in `projects_resolved[slot]` with `action_type: "rote"` and `action_type_override: "feed"`.

Both actions — main feed and a Rote Hunt attempt — **each count as a separate feed** against that territory's feeding tolerance/cap, and both are subject to poaching rules if the character lacks feeding rights there.

**Feeding tolerance is a hardcoded formula, not a vibe — audited from the actual codebase (`public/js/tabs/downtime-data.js` and `public/js/admin/downtime-views.js`), don't reconstruct it from rules text alone:**
- `AMBIENCE_FEEDING_TOLERANCE` (per ambience tier): Hostile/Barrens 0, Neglected 4, Untended 5, Settled 6, Tended 6, Curated 7, Verdant 7, The Rack 8.
- Feeder count per territory = every non-`"none"` (and non-`"Not feeding here"`) entry across a character's `feeding_territories` grid, **plus** — only if that character has a project slot with `action_type === 'rote'` (or the legacy locked `'feed'` variant) — every non-`"none"` entry in their `feeding_territories_rote` grid (capped at +1 per territory per character, i.e. max 2 total from one character on one territory). This exactly matches `_getSubFedTerrs`/`_computeMatrixFeederCounts` in `downtime-views.js` — a `"poaching"` status counts too, same as `"feeding_rights"`, since the app only checks for non-`"none"`.
- Overfeed contribution to that territory's ambience net this cycle: `feeders > cap ? -(feeders - cap) * 2 : feeders < cap ? (cap - feeders) : 0` (`downtime-views.js:4101`). This is only the feeding component of ambience net — full resolution also needs each tier's fixed `AMBIENCE_ENTROPY` decay and any `ambience_increase`/`ambience_decrease` project actions + Influence spend, which belong to a separate ambience-resolution step, not this skill.
- Barrens is exempt from ambience step-calculation entirely (uninhabitable, per the code's own comment) — don't apply the overfeed formula there.
- **Territory attribution follows the declared grid, not the narrative prose.** If a character's `feeding_territories` ticks one territory but their `feeding_description` names a different one by name, the Suite's actual counting logic only reads the grid — flag the mismatch to the ST, but don't assume it changes which territory the feed counts against unless the ST explicitly applies an `st_review.territory_overrides.feeding` override.

**Before resolving the first feeding of a new cycle, confirm this formula/these constants are still current** by re-checking `downtime-data.js` — don't assume a previously-learned version still holds (house rules and hardcoded values both drift).

## Steps

0. **Freshness check (opens every batch — see tm-dt-grounding).** Query the cycle's live submissions (`character_name`, `status`, `responses._final_submitted_at`), diff against the processing log's last-known list, and fold in the delta (new finalizations, draft→submitted flips, re-finalizations newer than their last processing) before resolving anything. Submissions shift mid-processing — confirmed live (Anichka re-finalized during DT5 processing; Alice and Charlie arrived after the working dump). No freeze/cutoff — late arrivals are folded in individually.
1. **Read the full feeding description(s).** Pull `feeding_description` (main feed) and, if a Rote Hunt exists, `project_N_description` too. Check whether the Rote Hunt's description is its own distinct technique or explicitly mirrors the main feed's (e.g. "as in the feeding action") — if it mirrors, both actions likely need the same pool, not two different ones.
   **If the description is blank or too thin to match-check against** (confirmed live, Macheath DT5 — his cycle's field was completely empty), check that character's **prior-cycle `downtime_submissions`** for their last declared feeding pool and narrative before treating this as an unverifiable gap. A blank field is very often just an unchanged, previously-established routine the player didn't bother retyping, not a genuine absence of information — ground the pool in the most recent real narrative you can find rather than accepting the declared Attribute/Skill/Discipline with no textual support at all.
2. **Identify what's explicitly declared** for each action: Attribute/Skill (custom or fixed method), any Discipline named, any Specialisation mentioned. Note narrative elements that are lead-up flavour (how the character *located or approached* the target) versus elements described as mechanically *doing* something in the action itself (e.g. "boosted by X to bring them down") — only the latter belong in the pool.
   **Always read effective rating (dots + bonus), not just base dots**, on every component (confirmed live, Brandy LaRoux DT5: Presence showed 3 dots + 1 bonus on her sheet, pool used 4). A character's sheet can carry bonus dots from merits/other sources that are just as real as purchased dots.
3. **Match-check.** State explicitly whether the declared pool fits the description, and why. If it's a poor match, suggest a better Attribute/Skill pairing grounded in the narrative. Two concrete smell-tests for "this needs reframing," both confirmed live this cycle:
   - **The declared `_feed_method` tag and the declared custom Attribute/Skill don't belong together** (Aleksei Romanov, DT5: method "seduction" paired with custom Strength+Weaponry, while the actual description was a pure enthrallment scene — reframed to Presence+Empathy+Majesty).
   - **A fixed (non-custom) method is selected with no custom override, and the character has 0 dots in every skill option that method allows** (Don Ezzelino Rocio, DT5: "force" selected, no custom override, 0 in both Brawl and Weaponry — reframed to Presence+Intimidation, matching his actual sheet and the narrative's intimidation-driven framing).
   **When more than one Attribute genuinely fits the described approach equally well, pick whichever gives the higher pool on the character's actual sheet** — generous interpretation means picking the best-fitting *and* best-scoring reading when both are defensible, not just whichever was found first (confirmed live: René's "whispering practiced words" line fit both Presence and Manipulation, and Manipulation was both the better narrative fit and the higher stat — the pool moved from 6 to 7 as a result).
   **If the override is a full Attribute/Skill/Discipline swap (not just adding a missed Specialisation or nudging one Attribute), write an ST note explaining the change** and attach it to the record (`st_note` field, matching real prior-cycle examples) — don't silently substitute a materially different pool from what the player declared. Confirmed live (Aleksei Romanov, DT5): declared Strength+Weaponry replaced entirely with Presence+Empathy+Majesty because the description ("enrapture... deva natures") didn't match a combat pool at all — a shift this size needs the player to see why, not just a changed number.
4. **Be generous with Specialisations.** If a relevant Specialisation exists on the declared Skill but wasn't explicitly selected, apply it anyway — check the character's actual sheet, don't assume.
5. **Never second-guess Disciplines.** Only include one if the player explicitly named/used it — **this includes declaring it in the `_feed_disc` form field alone**, even if the narrative prose doesn't separately restate it (confirmed by Angelus: the form field itself is the explicit declaration; prose is flavour, not a redundant mechanical checklist). When a Discipline is legitimately in, add its full dot rating to the pool as a normal component, same as any Attribute/Skill. What this rule guards against is *me* adding one the player never declared anywhere — not a declared-but-undescribed field value.
   **Resolved (confirmed against the Damnation City doc, 2026-07-09 — supersedes the earlier General Errata dispute):** adding a Discipline to a feeding pool means **any failure becomes a Dramatic Failure** — no Vitae cost, no Feeding Grounds Merit exception. The doc's exact text: *"they may add a relevant discipline, but any failure becomes dramatic failure."* **Always flag this consequence explicitly** whenever a pool includes a Discipline, whether it's the main feed (rolled live later, by the player — flag it in `feeding_review` for their awareness) or a Rote Hunt (rolled now, during processing — apply it directly if the roll comes back at 0 successes).
6. **Check territory consistency.** If the description reads inconsistent with the declared territory (e.g. describes rural/parkland terrain but declares an urban territory), check the territory's actual geography (reverse-geocode its centroid if needed) before assuming a mismatch — it may genuinely fit. Compare `feeding_territories` against `feeding_territories_rote` — they should usually match if both actions are the same hunting trip. **If the declared grid conflicts with the narrative, check whether the character is that territory's Regent** (`territories.regent_id` matching the character's own `_id`) before treating the grid as final — a Regent has standing rights in their own territory regardless of what the grid checkbox says, and is also the authority other characters' `feeding_rights` entries for that territory should trace back to (worth cross-checking if another character's rights claim there looks questionable).
7. **Validate the pool — do not roll yet.** State the final pool for each action clearly, with your reasoning from steps 2-6. **Stop here and wait for the ST's explicit sign-off on the pool before rolling anything.** This is a hard checkpoint, not a formality — presenting a pool and immediately rolling it in the same turn is exactly the process violation this skill exists to prevent (it happened live in the session this skill was built from: a roll was made before the pool was actually confirmed, and had to be discarded and redone even though the number happened to match). Don't roll on the same turn you present the pool, even if it seems obviously correct.
8. **Once the ST confirms, resolve the Rote Hunt (if any) — single roll, real dice engine**, matching `public/js/shared/dice.js` logic (10-Again default, or 9/8-Again per confirmed bonuses; never simulated/estimated). Not itself rote.
9. **If the Rote Hunt succeeds:** the main feed gets `rote: true` in `feeding_review`. **Do not roll the main feed** — it's validated only, ready for the player.
10. **Output the exact data shape** for both `projects_resolved[slot]` (if a Rote Hunt) and `feeding_review`, matching real prior-cycle precedent (query `downtime_submissions` for a similar past `action_type: "rote"` entry if unsure of the exact shape — don't invent fields).
11. **Write the player-facing outcome text for any roll that actually happened this pass** (i.e. the Rote Hunt, if any — never the main feed, since that isn't rolled yet). This is what the player actually reads, distinct from the ST-internal mechanical log — match the established "## Feeding" narrative style from prior cycles (short, second-person "You...", concrete, no invented facts beyond what the roll/description support). Pull a real prior example from `downtime_submissions` (`st_review.outcome_text` / `published_outcome`) to match tone if unsure. Use the degrees-of-success heuristic (1-2 marginal, 3-4 solid, 5+ exceptional) to calibrate how the prose reads — a marginal success should read as scraping by, not a triumph.
12. **If a Discipline was genuinely used in either pool** (per step 5 — only ever player-named, never ST-added), log it against that territory's per-cycle Discipline-usage tally. This feeds two separate downstream mechanisms, both confirmed from `cockpit/Terra_Mortis_Downtime_Workflow_Debrief.md`:
    - **2+ uses of the same Discipline in a territory this cycle** triggers Territory Pulse flavour text for that territory (a "discipline residue in mortal behaviour" beat — see `reference_territory_pulse_prompt` memory for the full prompt structure). Below 2, it's dropped as noise.
    - **3+ uses of a *physical* Discipline in a territory this cycle** is an actual in-fiction Masquerade breach (footage or witnesses) — a bigger deal than Pulse flavour, flag it distinctly if a territory crosses this line.
    - **Scope (per Angelus):** only Disciplines used in **feeding rolls** and **Ambience Change project actions** count toward a territory's tally — not Disciplines used in other project types (investigate, patrol_scout, etc.). Ambience Change tracking belongs to a future ambience-resolution skill; this skill only needs to log its own (feeding-sourced) contribution, but should be aware the same territory tally has another feed into it.
    - Keep a running per-territory, per-Discipline count across the cycle as each character's feeding gets resolved — don't just log per-character and lose the aggregate.

## Specialisation vs. Asset Skill — Common Confusion, Don't Repeat It

- A Specialisation normally grants **+1 die**, not 9-Again (that's a 1e-era misconception — confirmed against this rulebook's actual text).
- With the **Area of Expertise** merit, a Specialisation grants **+2** instead.
- With the **Interdisciplinary Specialty** merit, a Specialisation is **not locked to its attached Skill** — it grants its +1 on *any* Skill roll where the specialisation is thematically valid (confirmed live, Charlie Ballsack DT5: his "Coward Punch" spec sits on Stealth but applied to his ambush-feed pool via Interdisciplinary Specialty). So don't flag a spec as a "soft fit" just because it's attached to a different declared Skill — check whether the character has Interdisciplinary Specialty first; if they do, the only question is whether the spec is thematically valid for what's described, not which Skill it's pinned to.
- **Professional Training** (rank 2+, "Continuing Education") grants **9-Again on its Asset Skills** — a merit effect, separate from any Specialisation on that Skill.
- When both apply to the same roll: the 9-Again comes from Professional Training, **not** the Specialisation. Still list the Specialisation in `active_feed_specs` (it's real, it's on the sheet) — but `pool_mod_spec` reads 0 if it isn't doing separate numeric work once the Asset Skill's 9-Again is already active.
- Correct TM terminology: **"Specialisation,"** not "Specialty."

## Data Shape Reference

`projects_resolved[slot]` for a Rote Hunt:
```json
{
  "action_type": "rote",
  "action_type_override": "feed",
  "pool": { "expression": "<Attr N + Skill N + Disc N = total>", "total": N },
  "roll": {
    "dice_string": "[...]",
    "successes": N, "exceptional": false,
    "params": { "size": N, "again": 9, "success": 8, "exc": 5, "rote": false }
  },
  "pool_validated": "<same expression>",
  "pool_status": "validated",
  "nine_again": true,
  "active_feed_specs": ["<spec name>"],
  "pool_mod_spec": 0,
  "pool_validated_by": "<ST name>"
}
```

`feeding_review` (top-level, main feed — no `roll` until the player rolls it live):
```json
{
  "pool_player": "<method name> — <player's own summary>",
  "pool_validated": "<Attr N + Skill N + Disc N = total>",
  "pool_status": "validated",
  "nine_again": true,
  "rote": true,
  "active_feed_specs": ["<spec name>"],
  "pool_validated_by": "<ST name>"
}
```

## Boundaries

- **Never roll in the same turn you present the pool.** Present the pool and reasoning, then stop and wait for the ST's explicit sign-off — a separate turn, not a formality tacked onto the presentation.
- Never roll the main feed action — it belongs to the player, live, before next game.
- Never invent a Discipline into a pool the player didn't name.
- Never assume a data shape — query a real prior-cycle example from `downtime_submissions` before writing fields you're unsure of.
- Never write these results to MongoDB directly unless explicitly asked — log them (in the DT processing log and/or as the data shape above) for the ST or Peter to actually commit.
- Always run dice through the project's real dice engine logic with genuine randomness — never simulate or estimate a result.
