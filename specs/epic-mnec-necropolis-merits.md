# Epic MNEC: Necropolis Merit Family (Collective Compound — first instance)

## Status (2026-06-10)

**FINAL.** All 9 merits carry canonical rule text from Peter's CSV (verbatim text forwarded by Khepri 2026-06-10). Structural shape, schema patterns, prereqs, xp_fixed, family clan constraint, and the four Khepri-resolved decisions are LOCKED. ADR-005 Rev 2 (PR #659) carries the dual-anchor `attached_to` shape that supports Trap Door (D7). N-3 dispatch unblocked.

Three CSV-verbatim typos (White Ants: "to detects"; Trap Door: "a entrance" + "above group") preserved per the canonical-CSV principle — Peter explicitly acked preserve-as-is 2026-06-10. See **Editorial Notes** at the foot of this epic. The rules engine and player-facing display render the verbatim text.

## Motivation

Peter is introducing a family of nine merits centred on a shared underground site (the Necropolis). The structural shape of this family — a per-character **gate** merit that grants pool dots into a set of **collectively-shared** target merits, plus optional **attached** merits — is the first concrete instance of a recurring pattern: **Collective Compound**. Future covenant compounds (Lancea Sanctum crypt, Carthian commune), clan-specific group sites (Ventrue corporate, Mekhet archive), and bloodline shared rites are likely to follow the same shape.

This epic specifies:
1. The **Collective Compound** abstraction at the PRD level (shape, sharing semantics, schema patterns) so future instances can be scoped against a named pattern.
2. The nine **Necropolis** merits as the first concrete instance, integrated into the existing merit-family structure.

Architecture for the abstraction is owned by **ADR-005** (in design by Imhotep). This epic provides the product framing; ADR-005 chooses how the read-side resolver and schema slot into the rules engine.

## Clan constraint

**The entire MNEC family is Nosferatu-exclusive.** Every merit in this epic carries `{"type":"clan","name":"Nosferatu"}` as part of its `prereq_json`. Eight of the nine merits also require `{"type":"merit","name":"Necropolis Sepulcher","dots":1}` (everything except Necropolis Sepulcher itself and True Worm). The composite prereq for the family-bound merits is:

```json
{"all":[
  {"type":"clan","name":"Nosferatu"},
  {"type":"merit","name":"Necropolis Sepulcher","dots":1}
]}
```

True Worm is Nosferatu-only but **not** Sepulcher-gated (it stands alone within the family). Necropolis Sepulcher itself is Nosferatu-only, no merit prereq.

## Goals

- Players can purchase Necropolis Sepulcher dots and receive free grants into a curated pool of Necropolis target merits.
- Six collectively-shared merits in the family auto-share between all characters with Necropolis Sepulcher dots — no per-merit partner picker, no explicit ally list.
- One attached merit (Trap Door) bridges a Safe Place to a Necropolis Sepulcher — dual-anchor.
- One drawback merit (True Worm) lives in the family for thematic grouping but is mechanically standalone.
- The schema and resolver shape are general enough that the next covenant or clan compound is a content addition, not a redesign.

## Non-Goals

- **No partner picker UI.** Collective sharing is implicit (gated on Sepulcher dots); there is no allies list to maintain.
- **No retroactive audit-cleanup of existing pool-grant inconsistency in this epic.** Lorekeeper / Invested / VM / MCI use varying partner_shareable treatments that may be deliberate or accreted. That audit is a separate prerequisite story flagged below; do NOT bundle into MNEC scope.
- **No global template library** of compound merits in v1 — this epic introduces one concrete instance plus the abstraction; cross-instance management UI is future work if it materialises.
- **No second compound instance.** Covenant/clan/bloodline variants are out of scope here; this epic stands up the pattern only.

## The Collective Compound abstraction

A Collective Compound merit family has three roles:

1. **Gate merit** — per-character, rated (1-5). Owning the gate is the entry condition for the compound. Dot rating drives pool grants into the target merit set. Per-character; **not** collectively-shared (each ST/player buys their own dots).
2. **Target merits** — one or more merits whose mechanical benefit is **collectively-shared** between every character who owns Gate dots ≥ N. Per-character ownership of a target is a free grant funded by gate pool; benefit fires for any gate-owner.
3. **Attached merits** (optional) — per-character merits whose effect anchors to one or more named compound roles. Examples include single-anchor (Haven-style `attached_to: Safe Place`) and **dual-anchor** (Trap Door: `attached_to: { origin: Necropolis Sepulcher, destination: Safe Place }`).

The family can also include **standalone members** — merits that group thematically with the family but participate in no pool, no sharing, and no anchoring. True Worm is the example here.

### Schema patterns introduced by this epic

These are PRD-level requirements on the merit schema; ADR-005 specifies the canonical field names and resolver behaviour.

- **`sharing_scope`** — discriminator-tagged sharing specification on each target merit. Source-bound for now, structured for extension:
  ```js
  sharing_scope: { type: "collective_owners_of_merit", merit: "Necropolis Sepulcher", min_dots: 1 }
  ```
  The `type` field is the gate discriminator. Future covenant or clan variants add new types (e.g. `"collective_members_of_covenant"`) rather than overloading the existing one.

- **`partner_shareable`** — uniform default across pool-grants in this family; per-merit override permitted where deliberate. Default: TBD by ADR-005, consistent with Sepulcher pool semantics. Per-merit override path exists for the deferred audit of existing pool-grants.

- **`attached_to`** — generalised to a **named-anchor map** to support dual-anchor merits per ADR-005 Rev 2 §D7. Existing single-anchor merits (Haven) remain expressible. Trap Door is the dual-anchor case:
  ```js
  attached_to: { origin: "Necropolis Sepulcher", destination: "Safe Place" }
  ```

- **Purchase prereq vs render-time anchor constraint** — distinguished. A `prereq_json` clause gates *purchase* (engine refuses to buy without it). An `attached_to` anchor constraint is evaluated at *render* (mod is purchased and persistent, but the merit goes *non-functional* if the anchor target fails its constraint). Trap Door is the worked example: Necropolis Sepulcher dots are a hard purchase prereq AND the `origin` anchor; a White-Ants-covered Territory is NOT a purchase prereq but IS a render-time constraint on the `destination` anchor's containing Territory. ADR-005 Rev 2 §D7 places the constraint evaluation in the named-anchor resolver.

- **`pool_source`** — flag on the gate merit indicating that its dot rating funds free grants into the target set. R dots → R free grants. ADR-005 specifies the resolver shape.

## The Nine Necropolis Merits

Each entry below has the structural fields populated and the canonical mechanical rule text quoted verbatim from Peter's source CSV.

---

### 1. Necropolis Sepulcher (gate)

- **Type:** Gate merit
- **Rating:** 1-5
- **Sharing:** Personal, non-shareable (per-character purchase)
- **Pool:** `pool_source: true` — R dots grant R free Necropolis-family target merits
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"type":"clan","name":"Nosferatu"}`
- **XP cost:** standard rated-merit formula (xp_fixed blank)
- **Role in family:** Funds free grants into the six collectively-shared target merits; gates collective sharing for the whole family

**Rule text (canonical):**

> Prerequisites: Nosferatu Status •
>
> One dot of this merit buys a Nosferatu small home within the Necropolis and gives them 1 point per dot to spend in other Necropolis Merits. Further expenditure on this merit provides a larger space for the Haunt's Haven and provides more dots to invest into the Necropolis. This acts as a personal, non-shareable, Safe Place in the Necropolis.

---

### 2. Catacombs (target, collectively-shared)

- **Type:** Target merit
- **Rating:** 1-5
- **Sharing:** Collectively-shared — `sharing_scope: { type: "collective_owners_of_merit", merit: "Necropolis Sepulcher", min_dots: 1 }`
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"all":[{"type":"clan","name":"Nosferatu"},{"type":"merit","name":"Necropolis Sepulcher","dots":1}]}`
- **XP cost:** standard rated-merit formula (xp_fixed blank)
- **Role in family:** Wits + Investigation extended roll mechanic; outsider penalty

**Rule text (canonical):**

> Navigating the tunnels necessitates an extended Wits + Investigation roll, with ten successes required. Each roll is equivalent to one hour's worth of wandering. Those who do not have dots in Necropolis Sepulcher suffer a penalty to this roll equal to the total dots in this Catacombs. Those who do possess any dots in the Merit, however, may still have to succeed if distracted, or under time pressure or duress. Even the Haunts may find themselves periodically lost in the dark and distorted heart of their own Necropolis. In such a case, a resident can add Clan Status to these rolls, representing how familiar they are with the Catacombs and the Warren in general.
>
> This Merit is shared between all Haunts with dots in the Necropolis.

---

### 3. Caldarium (target, collectively-shared)

- **Type:** Target merit
- **Rating:** 1-3
- **Sharing:** Collectively-shared — `sharing_scope: { type: "collective_owners_of_merit", merit: "Necropolis Sepulcher", min_dots: 1 }`
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"all":[{"type":"clan","name":"Nosferatu"},{"type":"merit","name":"Necropolis Sepulcher","dots":1}]}`
- **XP cost:** standard rated-merit formula (xp_fixed blank)
- **Role in family:** Social bonuses + re-roll mechanic at 3 dots

**Rule text (canonical):**

> The Caldaria is the one location in the Necropolis that strangers may be allowed to visit, it is, in a way, a Nosferatu Elysium: one shall not bring violence here.
>
> At one dot, the Caldarium provides a place of social power for the Nosferatu: all Haunts within the Caldarium gain +1 to City Status and rolls involving Expression, Persuasion, Socialize or Subterfuge.
>
> At two dots, this bonus increases to +2.
>
> At three dots, a dark serenity stays with the Haunt even after it leaves the bathhouse. For the rest of the night, Haunts may re-roll one Social or Mental action.
>
> This Merit is shared between all Haunts with dots in the Necropolis.

---

### 4. Garbage Pit (target, collectively-shared)

- **Type:** Target merit
- **Rating:** 1-3
- **Sharing:** Collectively-shared — `sharing_scope: { type: "collective_owners_of_merit", merit: "Necropolis Sepulcher", min_dots: 1 }`
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"all":[{"type":"clan","name":"Nosferatu"},{"type":"merit","name":"Necropolis Sepulcher","dots":1}]}`
- **XP cost:** standard rated-merit formula (xp_fixed blank)
- **Role in family:** Retrieval + disposal mechanic

**Rule text (canonical):**

> The Garbage Pit provides 2 distinct benefits that Haunts have learnt not to look too closely at: Once per Chapter a Haunt willing to spend the time can find a trash version of basically anything in the depths of the pit. Anything above Availability equal to this merit will be trashed enough to reduce it to that level. Secondly, any object thrown into the Garbage Pit with intention is never, ever, seen again. No, torpored Kindred are not objects.
>
> This Merit is shared between all Haunts with dots in the Necropolis.

---

### 5. Labyrinth Guardians (target, collectively-shared)

- **Type:** Target merit
- **Rating:** 1-5
- **Sharing:** Collectively-shared — `sharing_scope: { type: "collective_owners_of_merit", merit: "Necropolis Sepulcher", min_dots: 1 }`
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"all":[{"type":"clan","name":"Nosferatu"},{"type":"merit","name":"Necropolis Sepulcher","dots":1}]}`
- **XP cost:** standard rated-merit formula (xp_fixed blank)
- **Role in family:** Guardian swarms; resident Vitae cost

**Rule text (canonical):**

> Guardian Swarms are packs or hordes of mutant animals that live in the Warren. These creatures are unnatural (flat-white eyes, stitched-together limbs, too human voices, etc.) and will attack any non-resident they come across. If the Guardians have their Health track filled with lethal damage, they'll disperse. However, they will return after a week to roam the Warren once again. Any resident who encounters the Labyrinth Guardians must feed them a point of Vitae, or suffer their attacks — their vigil has a price, after all.
>
> This Merit is shared between all Haunts with dots in the Necropolis.

---

### 6. Dark Temple (target, collectively-shared)

- **Type:** Target merit
- **Rating:** Rank 2 (fixed, no per-dot scaling)
- **Sharing:** Collectively-shared — `sharing_scope: { type: "collective_owners_of_merit", merit: "Necropolis Sepulcher", min_dots: 1 }`
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"all":[{"type":"clan","name":"Nosferatu"},{"type":"merit","name":"Necropolis Sepulcher","dots":1}]}`
- **XP cost:** `xp_fixed: 2`
- **Role in family:** Sated + Spooked conditions

**Rule text (canonical):**

> A Haunt spending time in the Dark Temple has their Beast quietened; they take the Sated Condition (+1 on Frenzy checks) and are considered to have meditated (+1 on Breakpoint checks). However, it is unquiet even for a Haunt, and they take the Spooked Condition, distracted by otherworldly whispers at the edges of perception.
>
> This Merit is shared between all Haunts with dots in the Necropolis.

---

### 7. White Ants (target, collectively-shared, **territory-integrated**)

- **Type:** Target merit
- **Rating:** 1-5
- **Sharing:** Collectively-shared — `sharing_scope: { type: "collective_owners_of_merit", merit: "Necropolis Sepulcher", min_dots: 1 }`
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"all":[{"type":"clan","name":"Nosferatu"},{"type":"merit","name":"Necropolis Sepulcher","dots":1}]}`
- **XP cost:** standard rated-merit formula (xp_fixed blank)
- **Role in family:** Territory-linked penalty; player selects ONE real campaign territory per dot
- **Integration note:** UI must surface the live territory list from the campaign territory system; player picks R territories from real options, not free text. ADR-005 Rev 2 specifies the read shape.

**Rule text (canonical):**

> The Necropolis sprawls and opens into Territories far beyond what is reasonable. For each dot in this merit select a Territory the Necropolis has infected. Haunts taking clandestine actions in that area apply a -3 to all rolls to detects¹ their personal actions against anyone who does not possess dots in Necropolis Sepulcher.
>
> This Merit is shared between all Haunts with dots in the Necropolis.

¹ CSV-verbatim typo ("to detects") preserved per Khepri's canonical-preservation principle; flagged in Editorial Notes at the foot of this epic.

---

### 8. Trap Door (attached, dual-anchor)

- **Type:** Attached merit (per-character, not collectively-shared)
- **Rating:** Rank 1 (fixed, no rating)
- **Sharing:** None (per-character purchase)
- **Category:** Merit (sub_category: Kindred)
- **Purchase prereq JSON:** `{"all":[{"type":"clan","name":"Nosferatu"},{"type":"merit","name":"Necropolis Sepulcher","dots":1}]}`
- **XP cost:** `xp_fixed: 1`
- **Anchors (dual):** `attached_to: { origin: "Necropolis Sepulcher", destination: "Safe Place" }` — engine requires both at render time
- **Render-time anchor constraint:** the `destination` Safe Place must live in a Territory the character has White Ants coverage in. **NOT a hard purchase prereq** — the merit can be bought and persisted at any time, but the engine renders it as **non-functional** if the White-Ants-Territory constraint fails. Constraint evaluation lives in the named-anchor resolver per ADR-005 Rev 2 §D7.
- **Role in family:** Entrance bypass mechanic — bridges a Safe Place to a Necropolis
- **Architectural note:** First dual-anchor merit. Existing `attached_to` mechanism (Haven-style single-target) generalises to named-anchor map per ADR-005 Rev 2 §D7.

**Rule text (canonical):**

> The Haunt has put a entrance to the Necropolis in a purchased Safe Place above group² in a Territory covered by White Ants. While they can do much to keep this entrance secret from other Haunts, nothing is ever guaranteed and any other Haunt using this entrance can bypass external Safe Place benefits. To find this other Haunts must navigate the Catacomb as if they do not possess dots in Necropolis Sepulcher.
>
> This merit is not shared and is linked to a specific Safe Place.

² CSV-verbatim typo ("above group" — likely intended "above ground") preserved per Khepri's canonical-preservation principle; flagged in Editorial Notes at the foot of this epic.

---

### 9. True Worm (standalone, drawback)

- **Type:** Standalone (family member by theme only)
- **Rating:** Rank 2 (fixed, no rating)
- **Sharing:** None — per-character purchase
- **Category:** Merit (sub_category: Kindred)
- **Prereq JSON:** `{"type":"clan","name":"Nosferatu"}` — Nosferatu-only but NOT Sepulcher-gated; fully standalone within the family
- **XP cost:** `xp_fixed: 2`
- **Role in family:** Drawback merit; day-sleep relief in deep tunnels
- **Engine note:** **No rules-engine logic.** Descriptive text only. STs apply sun damage manually via the ST Mods overlay (Epic STM) when adjudicating exposure scenes.

**Rule text (canonical):**

> So used to the dark, the Nosferatu no longer feels the draw of day sleep when in the tunnels of the Necropolis that lay more than 10 meters below the earth where there is no possibility of sunlight. They still must spend 1 Vitae each day to 'wake'.
>
> **Drawback:** While active during the day, the Nosferatu is at half his normal Speed (round up). In addition, a Haunt possessing this Merit is especially harmed by sunlight. The Nosferatu suffers +1 Health point per time unit when exposed to any of the sun's rays.

---

## Deferred prerequisite: pool-grant partner_shareable audit

Existing pool-granting merits (Lorekeeper, Invested, Vinculum Master, Mater Consanguineus Inferior) use inconsistent partner_shareable treatments. Before ADR-005 finalises the uniform default for MNEC, an audit story should determine, per existing merit:

- Was the current partner-shareable behaviour deliberate game-design or accreted inconsistency?
- For deliberate cases, mark the merit with an explicit `partner_shareable` override on the new schema.
- For accreted cases, fix to the uniform default during the consolidation.

**Out of scope for MNEC implementation;** flagged for SM dispatch queue as a deferred prereq. ADR-005 should choose the uniform default for MNEC without waiting on this audit, and the override path supplies the migration on.

## Dependencies

- **Architecture:** ADR-005 — Collective Compound abstraction (shape, resolver, schema). Imhotep Rev 2 pushed in PR #659 covers dual-anchor `attached_to` (§D7) supporting Trap Door's render-time anchor constraint.
- **Existing merit infrastructure:** `public/js/editor/merits.js`, the hardcoded MERITS_DB until Epic PP consolidates it to Mongo. MNEC describes rules; PP eventually owns storage.
- **Territory integration:** White Ants requires read access to the live campaign territory list. ADR-005 specifies the read shape.
- **Safe Place integration:** Trap Door's dual-anchor mechanism reuses the existing `attached_to` Safe Place pattern (Haven). The schema generalisation to named-anchor map is the architecturally novel piece.
- **CLAUDE.md amendment:** when ADR-005 ships, CLAUDE.md needs a note naming the Collective Compound pattern. Pin to whichever story owns the schema introduction, same load-bearing pattern as STM-2.
- **Epic STM (ST Mods overlay):** True Worm's day/sun adjudication uses the ST Mods overlay. No technical coupling beyond the existing overlay; noted for ST awareness.
- **Open follow-up story (not blocking MNEC):** partner_shareable audit on Lorekeeper / Invested / VM / MCI.

## Stories

Story breakdown is owned by Khepri (SM) after ADR-005 ships and the rule text is finalised. PRD-level expectations:
- Schema introduction (sharing_scope, partner_shareable, generalised attached_to, pool_source) — first story.
- Necropolis Sepulcher gate + pool-grant resolver.
- The six collectively-shared target merits (Catacombs, Caldarium, Garbage Pit, Labyrinth Guardians, Dark Temple, White Ants) — likely groupable by sharing scope and similar rule shape; one story per merit unless trivially identical.
- Trap Door dual-anchor.
- True Worm (descriptive-only, lowest effort).
- Territory-list integration for White Ants.

Story ordering and parallelism are SM's call once ADR-005 lands.

## Editorial Notes

Three minor typos identified in the source CSV during the 2026-06-10 fold-in. **Peter acked preserve-as-is 2026-06-10** per the canonical-CSV principle (rule text is source-of-truth). The rules engine and player-facing display render verbatim. Documented here for audit:

| Merit | CSV reads | Alternative reading | Footnote |
|---|---|---|---|
| White Ants | "to detects their personal actions" | "to detect their personal actions" | ¹ |
| Trap Door | "a entrance to the Necropolis" | "an entrance to the Necropolis" | ² |
| Trap Door | "in a purchased Safe Place above group" | "above ground" | ² |

If a later editorial pass overrides this preservation choice, update both this epic and the canonical CSV in one commit, and append a correction note here citing the date and authoriser.
