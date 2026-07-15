---
name: TM Next Action
description: Serve the next downtime action to the ST as a full cockpit-style ACTION CARD — verbatim description and objective, tagged targets/territories/merits, all cross-action intelligence, a suggested dice pool read off the merits, and a suggested outcome — then STOP for sign-off, roll on the real engine, and record the ST's ruling. Use when the ST says "next action", "give me the next one", "what's next to resolve", or names a specific action to work. This is the chat-as-cockpit workflow: it replaces clicking through the cockpit UI for a cycle's resolution queue.
---

# TM Next Action

The chat becomes the cockpit. The ST asks for an action; you bring it fully dressed — everything the cockpit's own resolution card would show, plus the intelligence panel — and then you wait. The ST signs off or corrects, you roll, the ST rules.

**Read `.claude/skills/tm-dt-grounding/SKILL.md` first.** Its rules (provenance gate, reproduce-verbatim, field-name traps, structured-fields-are-truth, resolution order, the merits-not-just-attr-skill-disc pool rule) govern this skill. Where they disagree, grounding wins.

Origin: DT5, 2026-07-13. Refactoring the cockpit to support per-action narrative outcomes and dependency tagging was taking longer than simply working the queue in chat. Angelus's call: *"the work to refactor the cockpit is taking more time than just working through it in this manner."*

## When to Use

- "Next action", "give me the next one", "what's next to resolve"
- The ST names a specific action ("bring me Yusuf's sphere_3", "do Conrad's p3")
- Any point in a cycle's Actions/Misc → Investigate → Attack → Patrol → Contacts → Acquisitions run

**Not** for feeding (`tm-dt-resolve-feeding`), sorcery (`tm-dt-resolve-sorcery`), or travel (`tm-dt-resolve-haven-travel`) — those have their own skills and are usually already closed before this one starts.

## The working index

Each cycle gets a **resolution queue** doc — the gated, dependency-ordered list of what is left, e.g. `st-working/downtime/dt5/dt5-resolution-queue.md`. It records: what is already resolved (do not reopen), the cross-action dependency clusters (who is acting on whom), the gates in resolution order, and the standing open ST items. Build it once per cycle from a fresh pull of every live submission; update it as each action closes.

Consult it to answer "what's next", and to know which cluster the action belongs to.

## The card

Every action is served in this shape. Never a summary, never a paraphrase of the player's words.

### 1. Header
Character (moniker), lane + slot, declared action type, title. Note the resolution gate/cluster it belongs to.

### 2. Lead and Approach — VERBATIM, labeled as the form labels them
**These are two fields of ONE action, never two actions.** The cockpit form itself has exactly this shape and this order — match it:
- **Lead** (`*_investigate_lead`, where present) — the prerequisite known fact/starting point the player already had before this action began. Label it "Lead," not "description" or anything else.
- **Approach** (`*_description`) — what the player actually does this cycle, the method. Label it "Approach." (`*_outcome` / `outcome_raw` — the player's desired outcome — belongs here too, where present.)

Present Lead before Approach (the form's own order). Do not give them separate headers that could read as two separate actions (Angelus, 2026-07-15, on Yusuf `project_2`: presenting "Description" and "Investigate lead" as two labeled blocks read as two distinct bodies of effort even though they're one action's two fields). Dump every populated key with that action's prefix — including ones you did not expect (see the field-name traps in grounding; projecting only named fields has produced false "the player wrote nothing" findings).

### 3. Tags
- **Target** — resolved to a character `_id` and name, marked **FIELD** or **QUOTED** (never INFERRED as fact)
- **Connected characters** — `*_connected_chars`, `*_cast`
- **Territory** — resolved to its canonical name (beware: ambience projects write `_ambience_target`, not `_territory`)
- **Merit in use** — for a sphere/status/contact/retainer (merit-lane) action, state PLAINLY AND SEPARATELY whose merit is being spent: "**[Character]'s own [Merit] [rating]**" as its own clear line, not folded into a list item that could be misread as the target's merit. Do this even when a target's own (lack of a) matching merit is also part of the card — the two are different facts and both need their own explicit sentence (Angelus, 2026-07-15: a card on Eve's `sphere_3` stated Brandy's absent Allies (Street) prominently but left Eve's own Allies ●●● (Street) — the merit she was actually spending — implicit inside a "Merit in use" tag; the ST had to ask "what merit is Eve using for this??" twice before it landed as a plain sentence). `*_block_merit` for hide_protects works the same way — whose merit is protecting what, stated outright.
- **Declared pool** — `*_pool_attr` / `_pool_skill` / `_pool_disc` / `_pool_spec` / `_pool_expr` exactly as submitted

### 4. Intelligence
Everything else in the cycle that touches this action. This is the panel the ST cannot hold in their head:
- **Who else is acting on the same target this cycle**, and what they declared
- **Protections and blocks in play** — a hide_protect's rolled successes subtract from attacks/blocks/investigates against that merit; a successful block shuts the merit out of *actions* (not its passive influence)
- **What prior cycles established** — check the target's own history and the processing log
- **What this character does NOT know** — dramatic irony is the ST's raw material; surface it
- **Provenance flags** — any cross-PC claim that is QUOTED-only or INFERRED, called out as a question, never as fact
- **Open ST rulings this action depends on** — pull them from the queue doc's standing-items list

### 5. Suggested pool
**First check the lane. A sphere/status/contact/retainer (merit-lane) action never gets a dice pool at all — skip straight to "flat successes = the acting character's effective merit rating."** This holds for every action-type tag on that lane (investigate, attack, grow, hide_protect — no exceptions, no mode-based carve-out). See grounding's own top-line rule. Only a `project`-lane action (or a merit-lane action explicitly recategorised into `project`) builds an Attribute + Skill + Discipline pool at all.

For `project`-lane actions: **Read the merits, not just Attribute + Skill + Discipline.** A DT5 audit that checked only the three got three of ten pools wrong. At minimum check: Professional Training (9-Again on Asset Skills; +1 dot to the `dot4_skill`), MCI dot-3 skills, Air of Menace, the skill's own `specs` array. Effective ratings always (dots + bonus).

Then:
- **Flag any mismatch between the declared pool and the described action.** The declared pool is the player's guess. If the description is a stalking-and-intimidation piece and the pool has Celerity in it, say so and offer the branches (this is exactly how Hazel's Hunt Livia resolved — the ST split the action into its two possible readings and picked one).
- **Name the modifiers**, don't fold them in silently: information-type for investigates (Public +3 / Internal -1 / Confidential -2 / Restricted -3), the no-lead penalty, protection successes subtracting, equipment.
- Never add a Discipline the player did not declare somewhere explicit. A blank `_pool_disc` means no Discipline — the cockpit's mechanical deriver auto-picks one for feeding when the field is blank, which is a bug, not a rule (Cyrus Reynolds, DT5: an undeclared Majesty 3 inflated his pool to 11; ST ruling was *"if the player did not submit majesty, we aren't using it"*).

### 6. Suggested outcome
Offer one. Label it clearly as a suggestion. Ground it in the roll's degree of success (1-2 marginal, 3-4 solid, 5+ exceptional) and in what the action can actually reach.

### 7. STOP
Present the card and halt. Do not roll in the same turn you present the pool. This is a hard checkpoint, not a formality.

## After sign-off

1. **Roll** on the real seeded engine (`cockpit/lib/roll-dice.mjs` `rollPool`, or the suite's `dice.js` semantics) — genuine randomness, recorded seed. Never simulate or estimate.
2. **Report the result**: pool, dice (flat array, exploded dice inline), successes, degree.
3. **The ST decides the outcome.** Offer a reading; do not decide. **Never infer beyond what the ST states** — if he says "she learns Livia spends time in the Dockyards," that is *all* she learns. Do not extrapolate to allies, assets, or contacts he did not name.
4. **Record it** in the cockpit's decision store for the cycle (`data/cycles/<id>/downtime-decisions.json`, via `POST /api/downtime-decisions`), keyed by a `decisionKey` **derived from real code** (`buildActionRows()` + `decisionKey()`), never hand-guessed. Three channels, all distinct:
   - `why` — ST-internal reasoning (never player-facing; required on an override)
   - `player_facing_note` — short, optional, reaches the player
   - `narrative_outcome` — the prose outcome, optional, action-level only
5. **Update the queue doc** — mark it closed, and fold any new fact into the clusters it affects.
6. **Novel ruling?** Append it to `st-working/reference/st-rulings-log.md` (date, question, ruling, why).

## Boundaries

- **The ST decides outcomes. Always.** You suggest; he rules. Do not infer past his words.
- **Never roll on the turn you present the pool.**
- **Never record an INFERRED cross-PC target as fact** — present it as a question.
- **Never propagate a player's malapropism into ST voice** ("Docklands" → The Dockyards; quote it, don't adopt it).
- **Derive decision keys and pools from real code and real data**, never from memory or hand-construction — this codebase has a repeated history of silent key-shape bugs.
- **No live Mongo writes.** The cockpit's local decision store is the recording surface; the write-back to `downtime_submissions` (Phase E) is a separate, ST-gated step.
