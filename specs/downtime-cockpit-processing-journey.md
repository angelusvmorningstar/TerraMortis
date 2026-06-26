# Downtime Processing — Cockpit Migration: User Journey & Requirements

> **Living document.** Captures the ST's lived downtime-processing journey, how the
> current TM Suite app handles each step (match / mismatch), and the resulting
> requirement for the cockpit rebuild. Updated as the walkthrough continues.
>
> Last updated: 2026-06-26 · Status: READY FOR STEP 4 (full pipeline + post-processing + narrative engine + cockpit substrate + architecture-consult decisions [territory seam, single trust boundary, composition invert, learning-advisor-as-curated-corpus]; increment one = ingest + completeness gate; 3 sizing questions open)

## Strategic framing

- **Decision:** downtime *processing* is moving out of the TM Suite app and into the
  **cockpit** (`TerraMortis-cockpit`), mirroring the ordeals model (external tool
  processes a cycle → emits a bundle the app ingests).
- **Reason:** the app's processing surface (`public/js/admin/downtime-views.js`, ~601KB
  of accreted logic) is too fragile to change safely.
- **Consequence:** gaps found below are **requirements for the cockpit greenfield build
  ("ought")**, not bugs to patch in the app ("is"). We are building a requirements list,
  not a defect log.
- **Cockpit already has:** ordeals grading pipeline; the **map** (7.1); court-pin (7.2).
  Map proximity matters for the mapped-feeding-location vision.
- **Known constraint (parked for the plan):** cockpit is currently read-only / no DB
  writes until Peter. A **write-back path** is needed — how a processed outcome returns
  to the app's `published_outcome` / DT Report. To be designed in Step 4 (plan).

## Legend

- ✅ Match — app already does what's wanted
- ⚠️ Partial — present but diverges from intent
- ❌ Missing — not implemented / manual only
- 🟢 Greenfield — feature is disabled/absent in app, so zero migration risk

## Step order

**Current app ribbon (the "is"):**
`1 Travel · 2 Rituals · 3 Feeding · 4 Support · 5 Ambience · 6 Defence · 7 Investigate · 8 Attack · 9 Patrol · 10 Misc · 11 Contacts · 12 Acquisitions`

**Corrected order of operations (the "ought", confirmed by Angelus 2026-06-26):**

Front of pipeline (auto-resolved / inputs to later actions):
`Travel → Rituals → Feeding`

Action-resolution sequence:
1. **Protection/Defence** — self-protect: shield yourself, an asset, or a merit
2. **Block** — stop another Kindred using a merit or asset
3. **Support** — boost another action (own or another player's). Resolved after Block so a
   blocked merit can never grant a support bonus.
4. **Ambience** — impact a territory
5. **Actions** — most miscellaneous actions
6. **Investigate** — gather focused information on something
7. **Attack** — harm another player directly
8. **Patrol** — a general report on what happened in the territory inspected

Then: `Contacts → Acquisitions` (resource/info merit fulfilment).

Key corrections vs the current ribbon:
- **The defensive pair leads** (Protection/Defence then Block) — the "block wall": no merit
  action resolves before its potential block is known.
- **Support resolves after the wall** (the ribbon has it at slot 4, before Ambience; now it
  sits after Block) so a blocked merit can never feed a support bonus. (Decided 2026-06-26.)
- **Block is split out** as a first-class type, distinct from Attack (harm) and from
  Protection/Defence (shield own). See the Block step for the current conflation.
- **Actions (Misc)** moves up to right after Ambience.

Pre-processing (before any step):
- **Intake validation** — all submissions present, no errors. ✅ (schema + pool-snapshot
  invariant `final = base + Σ deltas` + cycle-close 423 lock; `server/routes/downtime.js`).
- **Triage / count actions** — how many actions need resolving. ✅ (processing queue
  explodes each submission into per-action entries grouped by phase; `downtime-views.js:4742`).

---

## Step 1 · Travel (from court → followability)

**Intent:** the player's method of travel from court yields a "how easy to follow" signal
(obvious / neutral / subtle...), used to seed who can be tracked. Idea: a *temporary web
tool for the cycle's processing*.

**Today:** ❌ Travel is **free text only** (`responses.travel`); ST field
`st_review.travel_discretion` is unstructured. The `obvious/neutral/subtle` statuses exist
in code but belong to **ambience-change projects**, not travel (`downtime-views.js:282`).

**Requirement:** net-new structured travel resolution producing a followability signal
(obvious / neutral / subtle) that **writes into the territory visibility web** (see Patrol and
spine #5). Travel sets how noticeable a character's own movements are; Patrol/Investigate then
read that web against the traveller.

---

## Step 2 · Rituals (blood sorcery / Cruac)

**Intent:** resolve Crone rites **first** (incl. rites parked in a Mandragora Garden from
prior cycles). No action cost. The *result* (e.g. a status boost) must **flow downstream**
into that character's later action pools the same cycle.

**Today:**
- ✅ Ordering: sorcery is Phase 0 (`PHASE_ORDER.resolve_first = 0`), resolved before all else.
- ✅ Mandragora seeding: rites with `mandragora_parked` pre-fill the form next cycle
  (`downtime-form.js:1464`); prior cycle's result note shown to ST as a reminder.
- ❌ **Downstream flow is a sticky-note, not a wire.** A resolved rite shows as a visual
  badge on the target's downstream cards (`_sorcByTarget`, `downtime-views.js:4805`), but
  nothing mutates the downstream pool. ST hand-edits `pool_validated`.

**Requirement:** real action-linkage so a rite result feeds a later action's pool.

---

## Step 3 · Feeding (rote + normal)

**Intent:**
- Validate all pools.
- **Roll the rote feed now** → determines whether the main feed gets rote quality.
- **Normal feed pool validated but NOT rolled** (player rolls pre-game next cycle).
- Both feeds carry a **location**: a mapped territory, or the **barrens** (everywhere
  outside defined territories). New map divides the city so a feed is mapped.

**Territory consequences:**
1. Feed **count** per territory — rote + normal both tally toward feeding tolerance (per-cycle).
2. **Violent** feeding heat-maps onto the territory **over time** (persistent).
3. **Discipline used while feeding** (hit or miss) → **cycle-only mood/ambience** (NOT
   cumulative — clarified by Angelus).

**Today:**
- ✅ Location captured per-feed (`feeding_territories` + `feeding_territories_rote`).
- ✅ Barrens modelled as a non-territory bucket (no ambience progression).
- ❌ Granularity is coarse — fixed 6-item named list, not mapped points
  (`FEEDING_TERRITORIES`, `downtime-data.js:60`).
- ⚠️ Rote-rolled / normal-deferred not modelled as described — single `feeding_roll`;
  rote is just a nine-again toggle; `feeding_deferred` is a *player* choice.
- ⚠️ Feed-count tolerance computed per-cycle **in memory**, never persisted
  (`downtime-views.js:3878, 4111`).
- ❌ **Rote feeds excluded from the feeder count** — `_feedTerrIdsForSub` reads only
  `feeding_territories`, never `_rote` (`downtime-views.js:2355`). Undercounts pressure.
- ❌ Violent-feeding heat map over time — does not exist (`feed_violence` is a per-submission
  flag, no territory rollup, no time series).
- ⚠️ Discipline-in-feeding → mood: the pulse's discipline beat is sourced from **projects**,
  not feeding (`discipline_profile`, `downtime-views.js:3722`).

**Requirements:** mapped feeding locations; rote+normal both count to tolerance; rote→main
feed quality modelled; **persistent violent-feeding heat map** (the one true over-time
accumulator); discipline-in-feeding → cycle mood, sourced correctly.

---

## Step 4 · Support

**Intent:** support backs the player's own action or **another player's**. Cross-player =
shared scene / shared awareness. **Two-way flow:**
- Supporter roll → **dice-pool bonus** to the main action (uncapped Teamwork bonus per the
  merit matrix; allies/status add dots).
- Main action benefit/knowledge → supporter gets a **weighted partial share** (less than
  the lead). Example DT4: Alice supported Rene; her roll boosted his pool, she gained *some*
  of his knowledge.

**Today:**
- ❌ Support is **disabled** in the form (deprecated; `downtime-form.js:3783`). 🟢
- ❌ Supporter→main pool bonus implemented **nowhere** (`downtime-story.js:2392`).
- ⚠️ The formal replacement, **joint projects**, explicitly forbids pool-pooling
  (independent rolls per character) and provides only a **flat** shared outcome
  (`st_joint_outcome` broadcast identically), never a weighted share.

**Requirement:** real action-linkage (bonus out, weighted knowledge share back). Same
primitive as sorcery-downstream. 🟢 zero migration risk (support already disabled).

---

## Step 5 · Ambience

Three contribution sources (formulae **verified correct** in `buildAmbienceData`,
`downtime-views.js:4095-4129`; no is-vs-ought gap on the math):

1. **Direct influence spend → 1:1.** Raw sum of per-territory spends (negative allowed).
   **Auto, no ST sign-off.** Currently **silent and invisible**.
2. **PC project ambience action → STEPPED:** 1-4 successes = **+2**, 5+ = **+4**
   (canonical, confirmed; the rulebook "successes = ±ambience" wording is superseded).
   ST-validated (rolled).
3. **Allies (auto, no sign-off) → ** 3-4 dots = +1, 5 dots = +2. **Honey with Vinegar**
   shifts thresholds down a rank: 2-3 dots = +1, 4-5 dots = +2.
   - **Auto-approve EXCEPTION:** if the merit has been **Blocked**, it cannot contribute.

Net per territory = `entropy + overfeed + influence + projects + allies`, mapped to a step
via `AMBIENCE_THRESHOLDS`, capped **+1 step up / -2 steps down per cycle** (matches the rule).

**Requirements:**
- **Visibility / "siting":** a who-spent-what-where ledger for direct influence and ally
  contributions (both currently vanish into the net). Derive from existing `influence_spend`
  + computed ally value — free, no extra ST work.
- **Ordering (RESOLVED):** auto-approval of ally/influence contributions needs blocks known
  first. Per the corrected order of operations, the defensive pair **Protection/Defence →
  Block** resolves **before** Ambience. Block gates every merit action, so the wall sits at
  the front of the action-resolution sequence.

---

## Step 6 · Protection/Defence (Hide/Protect)

**Definition (Angelus):** anything done to **shore up yourself, an asset, or a merit against
being hurt this downtime**. Covers both **Hide** (conceal it so it can't be found or targeted)
and **Protect** (shield it from harm). This is the `hide_protect` action type.

**Mechanics (DT Merits matrix):** Instant; rolled successes are **subtracted from any Attack,
Block, Patrol/Scout, or Investigate** targeting the hidden/protected merit. Allies/Status/
Retainer (unrolled): Merit Level subtracted instead. Staff: -1 (Opt 2: successes = 1).

**Today:** `hide_protect` is a first-class **project** action (`downtime-data.js:14`),
phase 6 in the ribbon. ✅ exists, ⚠️ ordered after Ambience (should precede it).

**Requirement:** resolve first in the action sequence; its successes feed the contest math
of later Attack/Investigate/Patrol against the same target.

---

## Step 7 · Block

**Definition (Angelus):** anything done to **stop another Kindred** using a merit or asset.
Distinct from Attack (which harms/destroys) and from Protection/Defence (which shields one's
own).

**Mechanics (DT Merits matrix):** Allies/Status auto-block a merit of **same level or lower**
(no roll); PC Project auto-blocks a merit of **successes-level or lower**; Retainer cannot
block as a main action; Staff cannot block. A blocked merit **cannot be used this cycle**
(matrix constraint #1) — which is why Block must resolve before any merit action.

**Today (the conflation you flagged):**
- ❌ `block` is **absent from `PROJECT_ACTIONS`** (`downtime-data.js:10-21`) — projects offer
  only `attack` + `hide_protect`. A project-level block has to be declared as **Attack**, so
  block and attack collapse at the project level.
- ⚠️ `block` exists **only for sphere (social merit) actions** (`downtime-data.js:53`).
- ⚠️ Where it exists, it's ordered into **Phase 10 (Misc)** (`block: 10`,
  `downtime-views.js:126`), not as an early defensive step. (Attack is Phase 8 — so not the
  same phase, but Block is mis-placed.)

**Requirement:** Block becomes a **first-class action type for all actions** (project + sphere),
distinct from Attack and Protection/Defence, resolved **second** (right after
Protection/Defence) so blocked merits are removed before they can act. 🟢 mostly greenfield.

---

## Investigate

*(Corrected sequence: resolves after the defensive wall, Ambience, and Actions. Ribbon: step 7.)*

**Intent (Angelus):** uncover information. Two factors dominate:
- **Lead / starting point** — does the player have a credible way in? No lead = throwing darts
  blindly. We must know HOW they are starting so we can infer how far they get; reflected as a
  dice **modifier**.
- **Confidentiality** — how secret the information is, categorised into levels, with a **clock**
  so one investigation can run across multiple downtimes.
- Plus a critical UX need: **dead-end signalling** — when there is nothing to find, players must
  learn there is nothing to find (DT4: many players burned cycles on a cold "rats" lead).

**Today — the MOST built-out step; the concepts you want already exist:**
- ✅ **Lead capture:** `project_N_investigate_lead` is a REQUIRED field (`downtime-form.js:3831`);
  the form blocks lead-less investigations.
- ✅ **Lead modifier:** ST toggles `inv_has_lead`; no-lead applies a penalty via the
  `INVESTIGATION_MATRIX` (`downtime-constants.js:97`; `downtime-story.js:2201`).
- ✅ **Confidentiality tiers:** Public/Internal/Confidential/Restricted, each with innate +
  no-lead modifiers; ST selects `inv_secrecy`. Net successes index a results ladder (1-5+).
- ✅ **Clock across cycles:** dedicated `investigations` collection —
  `successes_accumulated / threshold`, progress bar, auto-resolves at threshold; presets by type
  (public identity 5 … touchstone/bloodline 15) (`investigation.schema.js`; `downtime-views.js:10918`).

**Gaps (wiring + the dead-end):**
- ⚠️ **Form ↔ tracker not wired.** A player's investigate action does NOT create/update the
  investigations tracker — ST re-enters it and feeds successes by hand each cycle. Same "no wire"
  pattern as sorcery/support.
- ⚠️ **Lead double-entered.** Player fills the required lead field, but ST must still manually
  toggle `inv_has_lead`; the player's input does not pre-set it.
- ❌ **Dead-end not communicated.** An `abandoned` status exists on the tracker, but there is no
  player-facing "nothing to find" message, no detection, nothing distinguishing "incomplete" from
  "exhausted." The DT4 rats problem: players keep paying into a cold lead because nothing tells
  them to stop.

**Requirements:** auto-link the investigate action to a persistent investigation record (the
clock); pre-set lead status from the player's submitted lead; add a **first-class, communicated
dead-end state** ("this lead is exhausted / nothing further to find") so cold leads close out.

---

## Attack

*(Corrected sequence: position 7, after Investigate. Ribbon: step 8.)*

**Intent (Angelus):** two modes —
1. **Attack an asset / merit / holding / NPC** — destroy it if successful. The designed use.
   Contested: attack successes − Hide/Protect successes, net halved (round up) off the target
   merit's level (DT Merits matrix).
2. **Attack a player directly** — what people actually do. Because this is **direct combat
   between characters it must be resolved IN PERSON** (at game), not rolled in downtime
   processing. Parallels the deferred normal-feed roll.

**Evidence (Ryan Ambrose):**
- **DT3 "Ambush Rene Meyers"** — a PC-vs-PC attack. Player declared it as **`misc`** (the attack
  option is framed for assets, so PC combat had no clean fit). ST did **not roll** it; pool
  validated, then deferred with a note: *"Rene comes to the party... See an ST before game."* →
  in-person resolution, done by hand.
- **DT4 "Picking a lesser target"** — attack on a **generic NPC** ("a Carthian from the unwashed
  masses", `target_type: other`). This one WAS rolled in processing (6 successes, exceptional),
  resolved as `attack`, with consequences spilling into live play ("the third... was seen"; "Mac
  and Doc come round the corner").

So: **NPC/asset attack → resolved in processing; PC attack → deferred to in person.**

**Today:**
- ✅ `attack` is a first-class project action; form captures a target (`project_N_target_type`
  character/territory/other, `target_value` OID, `target_other` free text).
- ⚠️ The label ("destroy merits, holdings, projects, or NPCs") gives PC-vs-PC combat no clean
  fit, so it gets declared as **misc** (DT3). Taxonomy mismatch → recategorisation territory.
- ❌ No structured **"resolve in person"** state. In-person deferral is a freeform ST note
  ("See an ST before game"); no flag, nothing surfaced to the player, no link to a game-night
  resolution. (Same shape as the deferred normal-feed roll, but unmodelled.)

**Requirements:**
- Distinguish **attack-asset** (rolled/resolved in processing; contested vs Hide/Protect, halved
  off merit level) from **attack-player** (direct combat → in person).
- Clean PC-target capture so player-attacks stop collapsing into misc.
- A first-class **resolution-venue** state (see spine #4): PC attacks default to in-person,
  flagged and surfaced to both ST and player.

---

## Patrol / Scout

*(Corrected sequence: position 8, last action before Contacts/Acquisitions. Ribbon: step 9.)*

**Intent (Angelus):** "what do I notice happening in this territory over the month." Successes →
how much is noticed. Primary quarry: poaching and other illicit activity; but also general
goings-on. High **Auspex** should let a patroller pierce **Obfuscate** and notice concealed
actors. The ideal: a small per-territory **document of what occurred, each item rated
obvious↔subtle**, so it is easy to gauge what any given observer sees.

**Ivana DT4 (the loophole):** her watch on Wan came in with pool `Wits + Empathy + Obfuscate = 9`
(using Obfuscate to stay unseen herself). ST **overrode** it to `Intelligence 3 + Occult 3 +
Auspex 5 = 11` with **Rote** from her *Scions of the First City* bloodline power — the loophole
she argued — which let her **feel Wan's passage across the territory even while he held himself
unseen** (he was Obfuscated). She could not see him, but the territory "laid his position out
plainly," and she inferred the Carthian marks were his hand. Entirely manual ST adjudication of a
bloodline-power-vs-Obfuscate edge case. (Came in tagged as an investigate, but it is the
patrol/Auspex sensing mechanic.)

**Today:**
- ✅ `buildPatrolContext()` assembles good raw material — ambience, regent, residents/poachers,
  feeding-by-discipline, **other actions in the territory categorised**, discipline profile
  (`downtime-story.js:916`); `sameTerrEntries` lists all same-territory entries
  (`downtime-views.js:4461`).
- ⚠️ But it is a **transient copy-context dump**, not a materialised ledger: unordered, **no
  visibility ratings**, no success-gating, no priority. ST writes a freeform ≤120-word report.
- ⚠️ `patrol_detail_level` (1-5+) is recorded, but the matrix **priority order** (Attack >
  Patrol > Investigate > Ambience > Support) and "1 action per success" are **not implemented**.
- ⚠️ **obvious/neutral/subtle exist but are TRAVEL-only** discretion tags
  (`downtime-constants.js:172`) — actions are not individually tagged for noticeability.
- ❌ **Auspex-vs-Obfuscate is manual.** Obfuscate use shows as an info **badge**
  (`downtime-views.js:9129`); no code compares Auspex to Obfuscate or reveals concealed actors.
- ⚠️ `connected_chars` is a manual documentary tag; plays no role in visibility.

**Requirement — the territory visibility web (this is the "temporary web for downtime"):**
materialise a **per-territory activity ledger** — every action taken in the territory this cycle,
each tagged with a **visibility rating (obvious ↔ subtle)** and the concealment in play
(Obfuscate dots). Patrol resolves **against the ledger**: reveal the top items by obviousness,
gated by the patroller's successes (1 per success / detail scale) and **Auspex vs the actor's
Obfuscate**, in matrix priority order. **This is the same web Travel feeds** (Step 1: travel sets
how noticeable a character's own movements are). Travel = write visibility; Patrol = read
visibility. See spine #5.

---

## Misc / Actions

*(Corrected sequence: position 5, after Ambience. Ribbon: step 10 — currently a catch-all.)*

Today phase 10 (Misc) is a **catch-all** lumping `misc`, `xp_spend`, `maintenance`, `grow`,
`rumour` (and `block`, now pulled to the defensive wall) into one bucket (`downtime-views.js:126`).
Angelus wants it **decomposed into distinct lanes**:

**XP Spend — separate it out; make it action-free and auto.**
- Today: `xp_spend` is a *project action* ("XP Spend: Grow your character", `downtime-data.js:18`)
  — players must spend an action slot to spend XP.
- Future: **decouple XP spend from actions** — players just spend. Mostly **auto, no ST
  oversight**. A "validate, don't process" side-lane, with two enforcement exceptions:
  1. **+1 dot per downtime cap** on **Disciplines / Blood Sorcery / Attributes** (no more than one
     dot in any of these in a single downtime).
  2. **Allies/Status top-tier scarcity:** only **1** holder at 5, only **2** at 4 (computed in
     `spheres-view.js:132-133` as apex + two high seats). Pushing **into** 4/5 is **not** a plain
     XP spend — it requires the **grow** action (below).

**Maintenance — sighted only, no response.**
- Once per **story** (1-3 games) a character must spend a downtime on **Professional Training
  and/or Mystery Cult Initiation** (`MAINTENANCE_MERITS`, `downtime-data.js:143`).
- **No ST reaction/oversight** — just **sighted/acknowledged**. Already low-touch (auto-resolves
  as `maintenance`).

**Grow — gated acquisition of scarce top-tier Allies/Status.**
- `grow` action: "Attempt to acquire Allies or Status 4 or 5" (`downtime-data.js:56`). The only
  route into the scarce seats; contested by the scarcity caps (1×5, 2×4), not a free XP buy.

**Misc proper — personal story / personal interest.**
- The residual after XP/maintenance/grow peel off: personal story development, chasing personal
  interest. Light-touch narrative.

**Requirement:** split the Misc catch-all into these lanes. XP spend and maintenance become
**parallel side-lanes** (auto-validated / sighted) rather than sequenced actions — leaving only
**Grow** and **true Misc** in the action sequence at this position. The spend validator enforces
only the +1-dot cap and the Allies/Status scarcity (+grow); keep the scarcity hierarchy (1×5, 2×4,
per `spheres-view.js`) as the reference data it reads.

---

## Contacts

*(Corrected sequence: end of pipeline with Acquisitions — info/merit fulfilment. Ribbon: step 11.)*

**Intent (Angelus):** a contact lets a character learn **one thing** a mortal/kindred contact
might plausibly know. Mortal contacts have ears in key places and report on **kindred activity**
(not identities) — "the great unwashed have ears." Info must be **within the contact's purview
(sphere)**, OR at least **relevant** — e.g. Police may have Underworld intel, but as outsiders
(degraded).

**Canonical rules (errata + matrix):**
- **Contacts: 1 sphere per dot. Information only, not services.** (`reference_merits_errata`)
- Pool: Manipulation + appropriate social skill (rolled), or per merit level (unrolled); contested
  vs Hide/Protect; **≥1 success → requested info provided in theme with the sphere asked** (DT
  Merits matrix).
- **HARD WALL — contacts CANNOT surface: Kindred identities, merit ratings, or
  investigation-threshold intel.** They report mortal-world activity and its effects, never the
  supernatural specifics.

**Calibration from DT3/DT4 (64 contact requests):** *(request↔outcome matching is approximate —
DT3 outcomes partly cross-assigned in the stored array, DT4 mostly "approved" with no written
feedback; directional.)*
- **Within-sphere → reliable** (Street on underworld players; Politics on political leadership).
- **Cross-sphere → answered but degraded/outsider** (Wan's University contacts "deal in records,
  archives and scholarship" → only partial on a Kindred-footprint ask).
- **Masquerade → hard denial** (Etsy's Underworld contacts asked to find a vampire using "super
  speed" from CCTV: disregarded, "wouldn't break the Masquerade").
- **Kindred identities → off-limits** (Conrad's "which Kindred holds sway over the police?" failed;
  Henry's "who has influence in Police" with no vampire named succeeded). Ask in mortal terms.
- **Reputation cascades** (Rene's poisoned standing closed contacts across spheres).
- **One piece of information** (answers are mortal gossip, not a database).

**Today:**
- Contacts parse into merit_actions; resolution is **manual** (outcome / player_facing_note).
- ⚠️ DT4: most contacts marked approved with **no written feedback** — the info wasn't captured in
  text. Same "feedback inconsistently captured" pattern as recategorisation.
- ⚠️ Request↔outcome linkage is **brittle/positional** — outcomes don't cleanly key to the specific
  request.

**Requirements:** assist/enforce sphere-purview matching (within / relevant-but-outsider /
out-of-purview); **hard-block** Kindred identities, merit ratings, threshold intel; one piece of
info per contact; clean request↔outcome linkage; make the **answer a reliably captured deliverable**
(it IS the player's result). **Target model:** a **per-sphere intelligence bot** that absorbs the
sphere's cycle activity and suggests an answer for ST sign-off (ordeal-style), not freeform
composition — see Post-processing · Intelligence model.

---

## Acquisitions

*(Corrected sequence: end of pipeline, with Contacts — resource/info merit fulfilment. Ribbon: step 12.)*

**Intent (Angelus):** acquisitions should be **largely mechanical** — the only questions are
"does the character have the **Resources**?" and/or "do they have the **Skill**?"

**Resources route — fully specified, auto-resolvable (CofD 2e core, NOT a house rule):**
> "Every item has an Availability rating. Once per chapter, your character can procure an item at
> her Resources level or lower, without issue. An item one Availability above her Resources reduces
> her effective Resources by one dot for a full month... She can procure items two Availability
> below her Resources without limit." — `st-working/reference/Chronicles of Darkness Rulebook.md:7089`

- Band: effective Availability **≤ Resources → free**; **= Resources+1 → granted, −1 Resources for
  a month** (liquidation); **≥ Resources+2 → unlimited**. Availability 0-5 (1 Common … 5 Unique;
  `equipment_catalogue.schema.js:32`).
- **Fixer (TM house rule):** 2-dot merit, −1 effective Availability everywhere
  (`equipment-derivation.js:158`). Already implemented.
- Form already **gates selection** so a player can't pick an item with effective Availability >
  Resources (`isAffordable`); free-text escape via `item_request`.
- ✅ This half is genuinely mechanical — the cockpit can **auto-resolve** it (effective Availability
  incl. Fixer vs effective Resources, apply the band).

**Skill route — CAPTURE EXISTS, NO RULE. The critical gap.**
- Form captures Skill + Specialisation + derived pool + Description + Availability
  (`downtime-form.js:5244`), but **no mechanic is defined** — no roll, no success threshold, no
  crafting rule in rulebooks or TM errata. Entirely ST-manual.
- ❌ **A ruling is needed:** what does the skill route do? (Candidate: roll Skill pool; successes ≥
  Availability = acquired; extended across cycles for high Availability.) **OPEN DECISION — Angelus.**

**Resources-route nuances currently unenforced:**
- **One-per-chapter** free procurement — not tracked.
- **Liquidation** — Resources+1 acquisition should drop effective Resources by 1 for a month — not
  tracked.

**Two parallel systems (decide whether to merge):** equipment-catalogue slots (pre-defined,
affordability-gated) vs freeform acquisitions (`acq_resource_rows` / `acq_skill_rows`).

**ST resolution today:** entirely manual — `acquisitions_resolved[]`, pool_status
pending/validated/skipped + notes (`downtime-views.js:3804`). No auto checks at all.

**Requirement:** auto-resolve the Resources route (effective Availability vs Resources, with Fixer,
liquidation, one-per-chapter); **define then implement the Skill route**; decide catalogue-vs-
freeform unification.

---

## Story (new consolidated action — is→ought)

**Today (the "is"):** personal narrative is split across three scattered, differently-scoped inputs:
- **Personal Story** section — player picks **touchstone moment** OR **letter from home**
  (`correspondence`; `personal_story_kind` toggles which; `downtime-data.js:244`).
- **Vamping** section — `vamping` free text, explicitly framed as *"Soft RP, general flavour,
  non-mechanical activities... won't generate rolls but informs ST narration"*
  (`downtime-data.js:393`), plus **aspirations**.
- On the OUTPUT side these are already half-consolidated: `st_narrative.story_moment` (DTSR-2) merges
  letter + touchstone into one **Story Moment** in the player report (`downtime-story.js:1805`).

**The problem:** Vamping is **unbounded** and meant to be response-free flavour, but players
(notably Anichka) use it as a **backdoor to do extra things that require an ST response** — extra
actions smuggled outside the action economy.

**The ought (Angelus):** a single new downtime action **"Story"** that aggregates touchstone +
letter from home + vamping into one **narrative lane** — one bounded ST narration response, scoped as
character/story development, NOT a channel for extra mechanical actions. Extends the existing
story_moment consolidation to also absorb vamping; presents as a proper action alongside the others,
authored in the existing **Story phase** of the cycle.

**Requirement:** one **Story** action consolidating touchstone / letter / vamping; bounded to a
single narrative response; explicitly **not** an extra-action backdoor (anything mechanical must be
declared as its own action).

**Aspirations — kept SEPARATE (decided 2026-06-26).** Aspirations are not per-cycle narrative; they
are a **persistent, session-level advancement device** — a character has three; fulfilling one grants
a **Beat** and it is replaced **at end of session**, not in downtime (VtR 2e
`Vampire the Requiem 2e Rulebook.md:3774`, `:4473`; no TM house-rule changes). Within the downtime
form they are merely a **declaration for ST context/hooks**. Folding a session-level XP mechanic into
the "bounded narrative, no mechanical payoff" Story lane would undercut its scoping. So: **Story**
aggregates only touchstone + letter + vamping; **aspirations stay as persistent character-level data
surfaced for context**, not part of the Story response.

---

## Post-processing & narrative-drafting engine

*(The back half: turning resolved mechanics into player-facing prose, then assembling and
publishing. Informed by the claude.ai debrief + reference bundle — see Source materials.)*

**Method: resolve-then-narrate.** Mechanics are fully resolved first (pools, rolls, outcomes); only
then is prose drafted per slot. (DT1 drafted prose + mechanics in one pass; abandoned by DT2.)

**Input contract — three-file export from the Suite:**
- `backup_downtime_N.json` — full submissions (keyed by character_name + status)
- `city-overview-downtime-N.json` — feeding matrix, actions-in-territories, discipline profile,
  spheres of influence, `ambience_by_territory`
- `DowntimeN_raw.csv`

**Output contract — the player report** (`Downtime_Template.md`), fixed order: **Feeding →
Intelligence Dossier** (General / Cacophony [1 item per Savvy dot, never bloodline] / Mystical /
Rumours [2, may be true/half-true/false]) **→ Territory Report** (per territory) **→ Projects 1-4**
(narrative + pool/merits/result/XP footer) **→ Allies/Status/Retainer Actions → Resources & Mortal
Status → Rituals** (successes accumulated / required) **→ Lore**. ST-internal notes stripped from the
player version.

**The narrative engine (the bulk of the actual work):**
- **Two shared calibration blocks**, injected by tag, never re-typed:
  - `[HOUSE STYLE]` — second person present tense; British English; **no em-dashes**; no mechanical
    terms in prose (no discipline names, dot ratings, success counts, ambience labels); no
    editorialising; never dictate a character's choices/feelings; no cross-character image reuse in a
    cycle.
  - `[SUCCESS CALIBRATION]` — **1 success = full success** (never partial); more = better/more
    detail; 5+/exceptional = an extra benefit but never write the word "exceptional"; plausibility
    ceiling (one month, one character contributes to a trend, never transforms the city).
- **Per-section prompt templates** (8 Copy Context templates, Handlebars-filled): Letters,
  Touchstones, Project narratives, Territory reports, Patrol/Scout, Merit actions, Maintenance,
  Group rituals. Calibration ladders per type (touchstone emotional ladder by Humanity/attachment;
  territory ambience sensory ladder; discipline → mortal-texture translations).
- **Length bands:** territory 80-150, letters 80-150, touchstones 120-200 (→100-300), projects
  60-300, merit actions 40-130.
- **Voice:** touchstone vignettes second person; close third person elsewhere; show the body not the
  interpretation; diegetic time in months/weeks/nights, never "cycle."
- **Direct-prose standard (the governing register — DT3→DT4 correction, the single most important
  narrative evolution).** The original house style still allowed a literary/atmospheric register;
  across DT3-DT4 Angelus drove it hard toward **direct, literal, compressed statement** ("You keep
  reaching for metaphor when I've NOT asked for it"). Now codified in a dedicated `tm-downtime-result`
  skill (top rules: "Plain and short. Strip ornament." / "No oblique referents — the most frequent
  failure"):
  - **Plain and short** — short declaratives, the literal event; default 1-2 lines per result unless
    more is asked.
  - **Literal, not figurative** — no metaphor/simile/atmospheric padding unless requested.
  - **No oblique referents** — resolve every vague pointer to the named thing (the single most
    frequent failure).
  - **Name, don't describe** — actual character names, never "the Gangrel girl."
  - **State revelations plainly**; let action carry emotion, don't declare it.
  - **Powers named in effect, not buried** — make the supernatural event explicit and literal so the
    player knows it happened; never the mechanical Discipline name, never hidden under metaphor.
  - **Read the submission** — never invent details not in the data (e.g. travel/departure inferred
    from a haven address).
  - **Avoid the codified LLM-tic list** — reply-about-the-reply openers, "the way X" trailing
    similes, qualifier chains, staged short-declarative cadence, negate-then-affirm cadence, epigram
    closers, three-clause compounding, routine-faking filler.

**New cross-cutting requirements surfaced by the debrief:**
- **QC linting on every draft before completion:** em-dash check, mechanical-term check,
  **oblique-referent check** (named not vague), **figurative-language check** (no unbid metaphor),
  named-not-stand-in / anonymous-PC check, word-count band, "exceptional"-word check, and the
  codified LLM-tic list. Enforces the direct-prose standard, not just the original house style.
- **Diff-aware regeneration:** editing a patrol/territory report flags every response that
  cross-referenced it (prevents the wrong-field / stale-cross-reference cascades).
- **Canonical identity layer (Character Master authoritative):** prevents identity drift
  (René-vs-René, Charlie Ballsack vs Charles Willows, clan/covenant mismatches).

### Composition model — current vs ought (from the `downtime-story.js` review)

**Today:** ST composes via **Copy-Context → external LLM → paste-back**: a `build*Context` function
assembles a prompt (char header, pool, roll, territory state, prior-cycle content, calibration),
ST copies it out, an external Claude drafts, ST pastes the result into a textarea
(`st_narrative.{section}.response`), with a **draft / complete / needs_revision** status per section
and a sign-off panel that sets `st_narrative.locked`. `compilePushOutcome` assembles the complete
sections + resolved mechanics + territory pulse into `outcome_text`, then publish promotes to
`published_outcome`. Composed sections: **story_moment, territory_reports, merit/contact
action_responses, cacophony_savvy**. **Projects are NOT composed** (issue #886 — outcomes written
directly in DT Processing as `projects_resolved[i].outcome`); feeding outcome written in processing;
acquisitions/rituals mechanical.

**The ought — invert the loop, and split intelligence from composition:**

- **Composition (bespoke prose) narrows to Projects + Story.** (Story folds in here; territory
  flavour is the Pulse; contacts/rumours become intelligence, below.)
- **Three-stage human-in-the-loop assist** (replaces the copy-paste loop and **inverts draft
  ownership**): (1) the tool **primes** the ST with the grounded intelligence/context needed for a
  relevant, low-error response; (2) the **ST writes a rough draft** ("a punt") — ST owns the
  substance and judgement; (3) the tool **polishes** rough prose into polished, **direct/clear**
  prose (the direct-prose standard). Trainable on the large existing corpus of claude.ai-drafted
  responses. Better than today's "LLM drafts → ST reviews" because the ST's judgement is in the
  draft (grounding it, cutting hallucination) and the tool does the regression-prone mechanical
  polish.

### Intelligence model (contacts + surveillance) — suggest + sign-off, not composition

- **Per-sphere contact bots:** one bot per influence sphere absorbs that sphere's cycle activity and,
  on request, **suggests intelligence** for a contact answer; the ST **signs off** (the
  ordeal-feedback sign-off model). Replaces freeform contact composition. Honours the contacts hard
  wall (no Kindred identities / merit ratings / threshold intel).
- **Surveillance harvesting:** aggregate **player-submitted summaries** (game recounts/narratives)
  into intelligence for characters with surveillance powers/merits — e.g. **Rene's ghost spy**,
  **Jack's court surveillance** (DT responses exist). A cross-player intelligence rollup the ST
  assembles by hand today.
- **Cacophony (Cacophony Savvy merit):** the Kindred rumour network. A holder gets **one rumour per
  dot** about Court/Kindred goings-on, drawn from the cycle's **noisiest actions** (ranked by
  priority), **distorted / may be half-true**, and **never bloodline information**. Today composed
  per-slot via `buildCacophonySavvyContext` (`downtime-story.js:3393`) from the noisy action's source
  char + action type + territory + intent. Ought: a **Court-cacophony bot** that ranks the cycle's
  loud actions and suggests per-dot rumour items for ST sign-off (same suggest+sign-off model).
- **Rumours (general):** two items tied to the noisiest city events, may be true / half-true /
  false (part of the output Intelligence Dossier). Same intelligence-suggest model.

All four intelligence flows (contacts, surveillance, cacophony, rumours) share one shape: **the
cockpit ingests the cycle's activity, ranks/filters it per the holder's reach, suggests items, and
the ST signs off.** They populate the Intelligence Dossier section of the report (General / Cacophony
/ Mystical / Rumours).

### DT City — post-completion step

- **Ambience resolution runs only after all downtime actions are resolved.** The entropy + overfeed +
  influence + projects + allies → step formula (see Step 5) is a **terminal City computation**. Its
  outputs: (a) the territory's **new ambience**, which **gates the next cycle's feeding rolls**, and
  (b) input to the **Territory Pulse**. Sequencing: ambience is the last thing computed, downstream of
  every action.

---

## Cross-cutting requirement · Auto-provenance notes

When the ST overrides a player's submission, derive a player-facing note automatically
instead of relying on the ST to type it:

- **Recategorisation:** `action_type` ≠ `action_type_override` → "Storyteller reclassified
  this from a Patrol action to a Support action." Enum-vs-enum, exact. Retroactively fixes
  silent overrides.
- **Dice-pool overwrite:** player's pool ≠ `pool_validated` → "Storyteller adjusted your
  dice pool to Wits 2 + Investigation 3 + Protean 4 = 9." **Needs a structured pool**
  (terms + total) to diff reliably — `pool_validated` is currently a freeform string
  (reformatting would false-positive). Reason the cockpit's pool model should be structured.

**Layering:** WHAT changed = auto-derived (always present, plumbing). WHY = ST freeform
(optional, the gold — rules teaching). Today both are one freeform note, so under time
pressure the player gets nothing.

**DT4 evidence:** ~10 of 29 submissions had a recategorisation; **most had empty notes**.
Confusion clusters on: support vs solo action · investigate vs patrol_scout ·
ambience_change vs maintenance vs misc.

---

## Cross-cutting requirement · Coverage / completeness gate (EXISTS — needs stronger normalisation)

A completeness gate already exists: **`renderSubmissionChecklist()`** (`downtime-views.js:11326`) —
the **Submission Checklist** with an "N/M actions · K/29 players" header and a per-slot
★ complete / O valid / ? pending / X skipped / — n/a grid. Its **action count is canonical**
(`buildProcessingQueue` + `DONE_STATUSES`). So coverage IS surfaced. The problem Angelus flagged is
that **it is not normalised strongly enough** — three drift points:

1. **Second, hand-synced reconstruction of the merit-action list.** `_getSubMeritActions` /
   `_buildMeritSlotMap` (`11100`, `11137`) rebuild the spheres→contacts→retainers list from
   raw/responses, commented "mirrors buildProcessingQueue" — a parallel of the real queue that must
   be kept in sync by hand. Drift mis-maps the A/S/R/C cells. Likely cause of the audit's **93
   resolved vs 81 reconstructed** merit-action mismatch.
2. **Acquisitions cell reads a divergent field.** It reads
   `st_review.actions['acq:resources'].pool_status` (`11287`), but acquisitions actually resolve into
   `acquisitions_resolved[]` — two sources for one fact. And it is a **single aggregate cell**, so a
   character's multiple acquisition rows collapse to one "?", which is how **6 unresolved acquisition
   rows hid behind a few single "?" marks** in the DT4 audit.
3. **Hardcoded slot columns with blind spots.** Fixed: Travel, BS1-4, Feed, P1-4, A1-5, S1-3, R1-3,
   C1-5, Acquisitions. **Staff folds into Retainer columns** (`11145`); **no columns for
   Equipment/item_request, Lore, or XP-spend/Maintenance** (invisible to the gate); tracks project
   *slots* not action *types*, so it cannot reflect the corrected taxonomy (Defence/Block/Support…).

**DT4 audit evidence (the gaps the current gate under-surfaces):** 7/29 submissions had ≥1
unresolved item — Acquisitions worst (6 items / 5 chars: Henry 2/2, Brandy 2/4, Yusuf 2/4, Xavier
1/2); Conrad's "Aaron's Rod" sorcery; Reed's project 4; Humongulus feeding (likely non-feeder).
(Caveat: some may have been handled live and not recorded.)

**Requirement:** the cockpit drives **one** coverage view **directly off the canonical resolved
data** (no second reconstruction); **a column per real action** (not fixed slots), covering **every**
category — incl. Staff, Equipment/item_request, Lore, XP-spend, Maintenance — with **per-row**
acquisitions; and a publish gate that blocks on outstanding items unless explicitly skipped.
Mechanising the manual steps (acquisitions especially) closes most of the gap by construction.

---

## Recurring architectural spine (the load-bearing requirements)

1. **A real action-linkage model** — cross-action AND cross-player. One action references
   another and feeds it: a **bonus one direction, a weighted share the other**. Covers
   sorcery→action, support↔main, rote→main-feed. The app never had it; the cockpit builds
   it once.
2. **Territory as state** — today almost everything is recomputed per-cycle and discarded;
   only `ambience` is written back (manually). The one genuine **persistent over-time
   accumulator** needed is the **violent-feeding heat map**. (Feed tolerance and
   discipline-mood are per-cycle by design.)
3. **Derived transparency** — auto-notes, influence/ally ledgers: surface what the system
   already knows, at zero ST cost.
4. **Resolution venue** — some actions resolve in **processing** (rolled/validated now), others
   defer to **in-person / live play**. Known in-person cases: the normal-feed roll (player rolls
   pre-game) and **PC-vs-PC attacks** (direct combat). The cockpit needs an explicit venue/
   deferral state (flagged, surfaced to ST + player), instead of today's freeform "see an ST
   before game" note.
5. **Territory visibility web** ("the temporary web for downtime") — a per-territory ledger of
   every action that happened this cycle, each rated **obvious ↔ subtle** with concealment
   (Obfuscate) noted. **Travel writes** to it (how noticeable a character's movements are);
   **Patrol/Investigate read** from it, gated by successes and **Auspex vs Obfuscate**, in matrix
   priority order. Today the ST reconstructs this in their head every patrol; the obvious/subtle
   tags exist but only for Travel, and Auspex-vs-Obfuscate is fully manual.
6. **Structural, not remembered** (the debrief's stated #1 rebuild goal, and the biggest correctness
   risk) — the **locked calibration set** (1-success rule, house style, success calibration,
   investigation thresholds, ambience ladder, discipline-effects table) and the **canonical
   identity layer** (Character Master) live as **structured data the tool injects and enforces**,
   not as rules an operator must recall and re-load each cycle. Today correctness depends on a human
   catching drift in review and remembering to load reference docs; the rebuild's main job is to make
   that structural so the system cannot quietly build on a wrong René, a mis-tagged territory, or a
   stale prior-cycle field.

---

## Territory Pulse (reviewed)

Live builder `_buildTerritoryPulsePromptText` (`downtime-views.js:2383`) faithfully
implements the canonical prompt spec: discipline threshold (2+), covenant aggregation +
weight bands, individuals named at 10+, negative side anonymised, direct hands split
(positive named / negative count-only), no-rumours directive, beat order. **The prose brain
is sound — lift it.**

Carry-over fixes for the cockpit:
1. **Rote feed excluded** from feeder count (`_feedTerrIdsForSub` reads only
   `feeding_territories`) → understates feeding pressure.
2. **Discipline beat sourced from projects, not feeding.**
3. **A full feeder roster (names + methods) is passed to the model** — not in the canonical
   template; risks leaking identities/methods; contradicts the name-suppression philosophy.

---

## Source materials

- **`cockpit/Terra_Mortis_Downtime_Workflow_Debrief.md`** — the claude.ai project debrief: how
  downtime processing actually ran across DT1-DT4 (workflow, evolution, prompt recipes, calibration,
  friction, edge cases, continuity, rebuild guidance). The richest single source for the narrative
  engine and the rebuild's "structural not remembered" goal.
- **`cockpit/TM_Referenced_Docs_Bundle.zip`** — curated reference docs behind the debrief:
  `Downtime_Template.md`, `Terra_Mortis_Style_Guide.md`, `Terra_Mortis_Touchstone_Guidelines.md`,
  `Damnation_City_Restructured.md` (ambience source system), `Carthian_Law.md`, disc/merit lookups,
  character data, cycle inputs. Its `MANIFEST.md` lists referenced-but-missing items (prompt
  reference, investigation matrix, resolution reference, discipline-effects table, retrospectives,
  verbatim-prose JSON backups) and their recovery paths (re-upload / reconstruct / re-export).

## Data corrections to apply at source (cockpit)

- **Influence spheres = 16, including Military.** The Style Guide lists 15 (Military missing); the
  merits errata lists 16. Use the 16-sphere list; the Style Guide is stale.
- **Downtime rules source hierarchy:** TM Google Doc > *Blood Sorcery: Sacraments & Blasphemies* >
  VtR 2e Core. Higher authority wins.
- **Territory naming:** Style Guide says "The Dockyard" (singular); form/data use "The Dockyards."
  Pick one canonical spelling.

## Cockpit substrate & reuse map (from the codebase read)

**What the cockpit is:** plain Node `http` server (port **4317**), vanilla-JS frontend, normalised
CSS (light only). Two databases: **`tm_suite_dev`** (read-only sandbox, seeded from prod) and
**`tm_chronicle`** (local read/write, ST-authored reference). **One** guarded production write —
`lib/apply-marking.mjs` (ordeals only, ST-authorized, idempotent, with XP cascade). LLM access is via
a **headless Claude Code subprocess** (`lib/grade-via-claude-code.mjs`) — subscription-backed, no API
key, no per-token bill; NOT an Anthropic-API integration. BMAD: `specs/cockpit/stories/`,
`tm-cockpit` 0.1.0; downtime would be **Epic 8**.

**Requirement → existing mechanism to reuse:**

| Requirement | Reuse |
|---|---|
| **Intelligence bots** (contacts/cacophony/surveillance: suggest → sign-off) | The ordeal grading pipeline **near-verbatim**: `gradeViaClaudeCode` + `build-grading-prompt` (template+rows) + `parse-grading-response` (JSON validate) + the 3-step confirm/overrule/finalise state machine (localStorage) + `apply-marking` (idempotent prod write). New prompt content + verdict shape only. |
| **Composition assist** (prime → ST drafts → polish) | Same subprocess, **inverted**: tool primes grounded context → ST drafts rough → AI polishes to direct prose. Direct-prose standard = the polish prompt's rubric. Response corpus → few-shot (grading prompt has none today). |
| **Write-back path** (RESOLVED) | `apply-marking.mjs` is the template: idempotent, ST-authorized prod write to `tm_suite`. Downtime = an `apply-downtime.mjs` writing resolved fields / `published_outcome` the same way. |
| **Input contract** (three-file export) | `scripts/export-ordeals.mjs` → template for `export-downtime.mjs` (submissions + city-overview from sandbox → local bundle). |
| **Grounded context** (prime step) | The pack-data builder + live character-index projection (PII/ST-hidden stripped, confidence-tagged). |
| **Visibility web + mapped feeding** | `lib/living-city-map.mjs` returns `{map, groups, layers, court}` overlay seam; court-pin (mode-gated, draggable, localStorage) is the proven pattern for feeding pins + travel-route web. **GAP:** per-territory state (ambience/feeding/activity) not in `map-bundle.json` — needs bundle/schema extension (= the territory-state spine requirement). |
| **Structural, not remembered** (spine #6) | `tm_chronicle` seeds (glossary, rules, channels, disambiguations) + projected character index = the substrate; the locked calibration set becomes seeded structured data the prompts inject. |

**Constraints to honour:** read-only sandbox; single guarded prod write (ST-authorized, idempotent);
connection isolation; LLM via Claude Code subprocess (not API); light mode only; normalised CSS
tokens; map boundaries local-only, never Mongo.

**Open substrate question:** where per-territory ambience/activity *state* persists — read from the
sandbox `territories` collection + recompute, vs. a `tm_chronicle` working store, vs. write-back to
`tm_suite`. Ties to the write-back design.

## Design decisions from the architecture consult (party-mode panel, 2026-06-26)

A roundtable (Architect/PM/UX/QA/Analyst) reviewed the plan. Conclusions, now treated as decisions:

### Increment one
- **Increment one = thin ingest (`export-downtime.mjs`) + the completeness gate** (unanimous). It must
  live in the cockpit reading the export, because the goal is to move processing OUT of the web app,
  not to lint the app. The gate drags in *only* the minimum parse + one canonical cycle structure;
  no resolution engine or bots in increment one. (Read-only is NOT a project constraint — see Sizing
  answer 1; the write-back is in scope later in the phasing, gated by validate-before-live.)
- Map *rendering* is a deferred "proof-of-value" milestone, not deleted.

### The territory seam (settled)
- **One irreversible constraint: every action/feed carries a stable `territory_id`** (the Mongo OID).
  Coordinates are killed — feeding is a **territory-level aggregation**, not street-level; position
  *is* the territory.
- **Per-territory aggregate, keyed by `territory_id`:** `feed_count`, `cap` (ambience-derived, so it
  DRIFTS cycle to cycle), `overfeed`, `violence_heat`, `activity_count`, `completeness`, plus an open
  `visibility_entries[]`. All **derived/recomputable from submissions, never stored or hand-edited**
  (honours the no-stored-derived-stats rule).
- **Map = dumb renderer; rules live in the aggregate.** id↔name reconciliation is a one-time
  build-script join (stamp the territory `_id` into the map bundle, fail loudly on unmatched);
  only ~6 vampire feeding territories matter, the rest render as inert backdrop.
- **"Downtime overlay":** one toggleable **feeding-pressure** layer, cap-relative (render `7/4` +
  colour by under/at/over cap; markers at centroid). Guard the layer zoo (one render fn + a registry +
  radio, one lens at a time). It is comprehension/sense-making, sits **below** the completeness spine.

### Single trust boundary
- The cockpit is **single-operator and private** ("no-one but me sees this"). No auth, PII-stripping,
  or player/ST view-split *inside* it; render everything (raw rolls, ungraded suggestions, ST notes).
  The **only** player-visibility boundary in the whole system is the **write-back (`apply-downtime`)**;
  all redaction logic lives there and nowhere else.

### The composition invert
- **ST drafts rough → AI polishes** (not AI-drafts → ST-edits), because editing fluent text for
  *truth* is expensive vigilance, while writing rough is generative and sustainable at volume. Polish
  is **diff-rendered**, leashed to the direct-prose standard (compress/regularise, **never enrich**),
  draft-in-flow / polish-in-batch. Exceptions: **boilerplate** auto-drafts; **intelligence** stays
  AI-first (derive → sign-off). Rule of thumb: *author the fiction, sign off the facts, auto-draft the
  boilerplate.*

### The learning advisor (north-star vision, grounded)
The aim: "a sophisticated intelligence in Claude Code that the cockpit speaks to, that gets better at
advising me." Grounded honestly:

- **It is NOT model training.** The Claude Code subprocess is **stateless**. "Learning" =
  a curated, version-controlled **corpus + retrieval + a correction-capture loop**. The intelligence
  is the briefing packet, made better each cycle. (This is the achievable *and* durable version; a
  fine-tuned model would be opaque, unrollback-able, and brittle to evolving taste.)
- **Four layers shipped into each call:** (1) the **skill** (procedure); (2) **canonical reference**
  (world facts; the DB is ground truth); (3) **retrieved precedent** (the layer that grows); (4) the
  **live task**. The cockpit "speaks to" the intelligence by assembling 1-4 as the prompt.
- **Five knowledge kinds, only ONE learns** (Mary): RULES → code (never learned; deterministic, injected
  as fact); CALIBRATION → config + worked examples (rule fixed, examples grow); **RULINGS/PRECEDENT →
  an append-mostly ledger (the real learning surface)**; IDENTITY/CANON → authoritative reference
  (looked up, not learned); STYLE → skill + exemplars. So the "intelligence" is one growing precedent
  ledger + four curated references, far smaller than it sounds.
- **Precedent ledger schema:** `{ id, cycle, trigger, ruling, rationale, grounding (citation | ST-fiat),
  scope (general | one-off), status (active | superseded-by:<id> | retired), supersedes }`. **Never
  delete — supersede.** The LLM sees `active` only; you keep everything (reversible, auditable).
  **Grounding is the gate:** nothing goes active without a citation or an explicit `ST-fiat` tag; fiat
  rulings are the audit queue.
- **THE LINCHPIN (3 of 4 panellists independently):** capture a one-line **why** at every override /
  sign-off. `{ suggested, final, why }`, one append per sign-off. It is the entire training signal AND
  the *only* thing the vision adds to increment one. Without it: a fast first-drafter with zero trust
  accrual. With it: the advisor compounds for free.
- **The existing corpus is a MINE, not a feed.** Don't bulk-load the years of claude.ai responses (they
  hold superseded calibrations as confidently as good rulings). One extraction pass → `proposed`
  precedents → ST signs each into active/superseded/reject (the same suggest→sign-off loop, applied to
  knowledge curation).
- **Anti-rot:** curation is first-class (promote recurring corrections into rules, archive the
  precedents); provenance + recency; corpus holds *judgement* only, facts stay in the DB; corrections
  `provisional` by default, graduate on recurrence; scope tags; contradiction check at write; supersede
  not delete.
- **Anti-complacency (the 95% trap):** force a why-token not a click; hidden mandatory adversarial slots
  each cycle; confidence is a *scored claim*, never a reason to lower the gate. Sign-off stays ground
  truth (ST's call is truth, AI loosens to match — mirrors ordeal grading).
- **Measurement (else "learning" is marketing):** a frozen **golden cycle** (inputs + your signed-off
  outcomes) re-run on every spine change → agreement count = regression signal; **calibration
  tracking** (is "high confidence" actually more right?); **override-rate trend** (falling + stable
  golden = improving; falling + no golden = complacency — they look identical from inside).
- **Retrieval is the new bottleneck:** start dumb and inspectable (keyword/tag over a small curated
  set; the assembled prompt visible before it runs); no vector search until the corpus outgrows
  eyeballing.

### Sizing answers (locked 2026-06-26)
1. **Read-only is NOT a constraint.** Angelus is comfortable with the cockpit writing to live, since the
   ordeal `apply-grade` run already proved the pattern. The safety model is **validate-before-live**
   (golden cycle + dry-run + pre-write snapshot), not a read-only phase. So **write-back
   (`apply-downtime`) is in scope** across the phasing; increment one can still be ingest + gate as the
   cheap first brick, but nothing is capped at read-only.
2. **Learning v1 targets the documented #1 risk: "structural, not remembered" — canonical identity +
   calibration drift** (the two-Renés, the stale-prior-field cascade, the moving "full success" bar; see
   debrief §10 + spine #6). Not novel-precedent capture first.
3. **Capture the override "why" — yes, as much as possible.** The correction-capture linchpin is in from
   increment one; the learning advisor is a real target.

## Open decisions

- **Skill-route acquisition rule** — undefined in rules and code. What does acquiring via a Skill
  actually do (roll? success threshold vs Availability? extended over cycles)? [Angelus to rule]
- **Catalogue vs freeform acquisitions** — merge the two systems, or keep separate?
- **Write-back path** — RESOLVED in principle: follow the `apply-marking.mjs` pattern (idempotent,
  ST-authorized prod write to `tm_suite`) via an `apply-downtime.mjs`. Remaining detail: exactly which
  fields it writes (resolved arrays vs compiled `published_outcome`) and the territory-state question
  above. [design in the plan]

## Still to capture (journey continues)

post-processing (outcome compilation, pulse authoring, publish, write-back to app).
