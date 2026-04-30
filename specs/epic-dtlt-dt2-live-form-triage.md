---
status: in-progress
inputDocuments:
  - CLAUDE.md
  - specs/epic-dtui-downtime-form-ux-refactor.md
  - public/js/tabs/downtime-form.js
  - public/js/tabs/downtime-data.js
  - public/js/admin/downtime-views.js
  - public/js/data/accessors.js
  - public/js/editor/domain.js
  - public/js/editor/mci.js
  - public/js/editor/rule_engine/safe-word-evaluator.js
  - public/js/editor/sheet.js
  - public/js/tabs/feeding-tab.js
  - public/js/tabs/relationships-tab.js
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/feedback_effective_rating_discipline.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/reference_vitae_deficit.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/reference_influence_formula.md
---

# Epic: DTLT — DT 2 Live Form Triage

**Goal:** Resolve the 27 issues surfaced by the ST team's review of the live DT 2 form. Restore correctness and parity across feeding, projects, sphere actions, sorcery, target pickers, and XP spend before DT 3 opens.

**Why:** Live form review on 2026-04-30 surfaced a structured list of bugs spanning calculation, data, UX, and pipeline gaps. Several are recurring patterns of the same bug class (effective rating vs inherent dots; missing caps; legacy data leaks) that warrant a coordinated sweep rather than per-bug patches. Two findings need ST team rulings before resolution; one needs reproduction details. Everything else has a clear fix path identified during diagnosis.

**Source:** Diagnostic conversation 2026-04-30. Each story below maps back to a numbered task in the diagnostic task list.

**Sequencing rationale:**

1. Story 1.2 (DT form quick fixes) is six trivial one-liners. Ship to unblock players immediately.
2. Story 1.3 (Theme purge) is a data migration; runs before Story 1.4 so the effective-rating sweep doesn't need to handle phantom theme entries.
3. Story 1.4 (Effective rating sweep) is the largest blast radius — touches feeding, influence, XP picker, and project dice pool.
4. Stories 1.5–1.8 are bounded UX/wire fixes mirroring established patterns.
5. Story 1.9 (Archive pipeline) needs a small architectural choice before implementation.
6. Stories 1.10–1.11 are blocked on ST team rulings.

**Out of scope (parked outside this epic):**

- T5 Bonus-success mechanic (Stronger Than You) — descoped 2026-04-30 after scoping pass confirmed it's rules-engine work, not downtime-UI. See Out of Epic section.
- T2 NPC relationships data population — separate effort, broader scope.
- T18 Ambience Change supporting merits — needs reproduction before scoping.

---

## Stories

#### Story 1.1: Bonus-success mechanic — DESCOPED 2026-04-30

Originally planned to fix T5 ("Strength Style bonus success not factored"). Scoping pass confirmed this is rules-engine work, not downtime-UI: the fix requires a new `rule_bonus_success` Mongo collection, a roll-time evaluator, and integration across seven dice surfaces. None of that belongs in a UI triage epic.

T5 is pre-existing — Stronger Than You has never applied in code — so deferring is zero-regression. Story file `specs/stories/dtlt.1.bonus-success-mechanic.story.md` remains dev-ready (Sonnet-grade) and can be picked up against the rules engine workstream when prioritised. Memory `feedback_errata_vigour_example.md` documents the related interpretive lesson about Vigour.

---

#### Story 1.2: DT form quick fixes (six one-liners)

As a player using the DT form,
I want six small bugs and copy issues fixed,
So that maintenance options, copy, button behaviour, and tab labels match the rules and don't break Masquerade.

**Implements:** T7, T8, T9, T11, T19, T25.

**Background:** Six independent one-line fixes, all in `public/js/tabs/downtime-form.js` or `public/js/tabs/downtime-data.js`. Bundled into a single story because each is too small to warrant its own ceremony, and the affected files cluster cleanly.

**Acceptance Criteria:**

**T7 — Maintenance removed from sphere/status actions:**

**Given** the SPHERE_ACTIONS array at `public/js/tabs/downtime-data.js:57`,
**When** the file is updated,
**Then** the `'maintenance'` entry is removed.

**Given** an Allies or Status sphere slot,
**When** the action selector renders,
**Then** "Maintenance" no longer appears as an option.

**Given** PROJECT_ACTIONS still includes maintenance,
**When** a project slot's action selector renders,
**Then** "Maintenance" remains available there (where it belongs).

**T8 — Contacts placeholder rewrite:**

**Given** the Contacts request textarea at `public/js/tabs/downtime-form.js:5263`,
**When** the placeholder renders,
**Then** the example does NOT reference a Kindred-style honorific (no "Lord Vance" or similar Kindred-coded name).

**Given** the placeholder is updated,
**When** a player views it,
**Then** it models how a vampire would actually phrase a query to a mortal contact (e.g. mortal name, place, organisation, event).

**T9 — Relationships tab label alignment:**

**Given** copy in `downtime-form.js:3580` and `:3586` that references "Relationships tab",
**When** the strings are updated,
**Then** they reference "NPCs tab" matching the visible label in `MORE_APPS` at `app.js:1354`.

**T11 — "Another PC" button works:**

**Given** `setNpcMode` at `public/js/tabs/relationships-tab.js:757-761`,
**When** the function receives `mode === 'pc'`,
**Then** `_tabState.npc_mode` is set to `'pc'` (currently coerces to `'existing'` due to a fall-through ternary).

**Given** a player opens "+ Add Relationship" and clicks "Another PC",
**When** the click is processed,
**Then** the Add panel re-renders showing the PC-PC mode UI.

**T19 — Ambience Change tab card shows a label:**

**Given** `ACTION_ICONS` and `ACTION_SHORT` at `downtime-form.js:107-118`,
**When** a project slot has `actionVal === 'ambience_change'`,
**Then** the project tab card renders a meaningful label and icon (direction-aware: `▲ Ambience +` if `ambience_dir === 'improve'`, `▼ Ambience −` if `degrade`).

**Given** the legacy `ambience_increase` / `ambience_decrease` keys are still in the maps,
**When** the change is made,
**Then** sphere/status tabs (which use the legacy values) continue to render correctly.

**T25 — Grow action target cap:**

**Given** the loop at `downtime-form.js:4908`,
**When** a Grow target picker renders,
**Then** the available targets follow the rule: `currentDots < 3 ? 3 : currentDots + 1` (capped at 5).

**Given** a player has Allies 3,
**When** they pick the Grow action,
**Then** the target dropdown offers only 4 (not 5).

**Given** a player has Allies 0,
**When** they pick the Grow action,
**Then** the target dropdown offers 1, 2, and 3.

**Given** Allies is at 5,
**When** the Grow action is rendered,
**Then** the dropdown is empty (no targets above cap).

---

#### Story 1.3: Theme purge migration

As a Storyteller maintaining data integrity,
I want legacy Theme entries (Creation, Destruction, Protection, Transmutation, Divination) purged from character `disciplines` maps,
So that retired sub-disciplines stop appearing on sheets and as purchasable options in the XP spend picker.

**Implements:** T17, T22.

**Background:** The `Fix.1` commit (`fc5af08`) removed Theme support from the code (purged `SORCERY_THEMES` constant, made Cruac/Theban out-of-clan), but never migrated the data. Theme keys still appear on character documents in MongoDB. They leak into the sheet's discipline list (`editor/sheet.js:606-607`, `suite/sheet.js:407`) and into the XP picker's discipline dropdown (`downtime-form.js:3375-3386`) via `Object.keys(c.disciplines)`. User has confirmed master sheets do not carry Theme CP — these are pure import artefacts, no CP reconciliation required.

**Acceptance Criteria:**

**Given** a migration script under `server/scripts/`,
**When** the script runs against MongoDB,
**Then** every character document has the keys `disciplines.Creation`, `disciplines.Destruction`, `disciplines.Protection`, `disciplines.Transmutation`, `disciplines.Divination` `$unset` (idempotent — safe to re-run).

**Given** the script logs its work,
**When** it completes,
**Then** stdout shows the number of characters touched and the keys removed per character.

**Given** the migration has run,
**When** any character's sheet renders,
**Then** Themes do not appear in the Disciplines section.

**Given** the migration has run,
**When** the XP Spend picker renders the Discipline category,
**Then** Themes do not appear as options.

**Given** the XP picker's discipline list construction at `downtime-form.js:3380`,
**When** the merge `[...clanDiscs, ...CORE_DISCS, ...owned]` is made,
**Then** the result is filtered against `[...CORE_DISCS, ...RITUAL_DISCS, ...bloodline-specific]` (defence-in-depth — survives any future data leak).

**Given** the ingest-excel script at `server/scripts/ingest-excel.js`,
**When** it processes character data,
**Then** it does not write Theme keys (verify and confirm; close the inflow).

---

#### Story 1.4: Effective rating + cap sweep

As a player and Storyteller,
I want every roll, calc, and purchase surface to read effective rating (inherent + bonus channels) and respect cap-of-5,
So that PT/MCI/granted dots count where they should and you can't buy past cap.

**Implements:** T3, T4, T21, T23.

**Background:** Recurring bug class — multiple call sites read inherent dots (`s.dots + s.bonus`, `c.disciplines[d].dots`) instead of effective rating. Memory `feedback_effective_rating_discipline.md` already documents that bonus dots are mechanically real. The merit XP picker at `downtime-form.js:3388-3429` is the only read site that does it correctly today (uses `effectiveMeritRating` and caps at `rule.rating_range.max`). Other sites need to be brought in line.

**Sites to fix:**

- T3 Influence calc: `public/js/editor/domain.js:118` reads `m.rating || 0` directly. `m.rating` is unreliable post-import (set to 0 by `ingest-excel.js:381`) and partial post-edit. Replace `calcMeritInfluence` to compute effective rating from channels: `cp + xp + sum(free_*) + attacheBonusDots`. Audit `calcContactsInfluence`, `influenceBreakdown` for the same pattern.
- T4 Feeding pool: `public/js/tabs/feeding-tab.js:416` uses `skDots`. Replace with `skTotal(c, s)` from `public/js/data/accessors.js:104`. Same fix at `public/js/suite/tracker-feed.js:89` and `public/js/admin/feeding-engine.js:87`.
- T21 XP picker: at `downtime-form.js:3360-3458`:
  - attribute (3364): add `if (dots >= 5) skip`
  - skill (3370): use `skTotal`; add `if (dots >= 5) skip`
  - discipline (3375): cap at 5
  - rite (3442): rebuild — pull `getRulesByCategory('rite')`, filter by character tradition + `rule.rank <= disc dots`, drop names already in `(c.powers || [])`, render `${rule.name} (${rule.tradition} Rank ${rule.rank})`
- T23 Project dice pool: `downtime-form.js:3221-3282` and `:4075-4096`:
  - Replace `(s.dots || 0) + (s.bonus || 0)` with `skTotal(c, savedSkill)`
  - Add `${prefix}_spec` input populated from `currentChar.skills[skill].specs`
  - Add spec bonus to total: `+ (savedSpec && skSpecs(c, savedSkill).includes(savedSpec) ? (skNineAgain(c, savedSkill) || hasAoE(c, savedSpec) ? 2 : 1) : 0)`
  - Mirror in secondary pool render at line 3322

**Acceptance Criteria:**

**Given** a character has Resources via a bonus channel (e.g. `free_inv` from Invested),
**When** their influence total is calculated,
**Then** the Resources merit's effective rating contributes to influence at the standard threshold (3→1, 5→2).

**Given** a character has Weaponry 4 inherent + 1 from PT Asset Skill (effective 5),
**When** they pick a feeding method that uses Weaponry,
**Then** the feeding pool reflects the effective 5, not the inherent 4.

**Given** a character has Weaponry 5 (any combination of inherent + bonus),
**When** the XP Spend → Skill dropdown renders,
**Then** Weaponry is NOT listed (at cap).

**Given** a character has Cruac 5,
**When** the XP Spend → Discipline dropdown renders,
**Then** Cruac is NOT listed.

**Given** a character has rite "Pangs of Proserpina" already on sheet,
**When** the XP Spend → Rite dropdown renders,
**Then** "Pangs of Proserpina" is NOT listed.

**Given** the XP Spend → Rite dropdown renders for a character with Cruac 3,
**When** the player views available rites,
**Then** they see specific rite names (e.g. "Pangs of Proserpina (Cruac Rank 1)") filtered by tradition and rank cap, not generic "Cruac Rite (Level N)" placeholders.

**Given** a player builds a project dice pool,
**When** they pick a skill that has specialties,
**Then** a spec picker appears with the available specs as chips.

**Given** a spec is selected,
**When** the pool total recomputes,
**Then** it includes +1 (or +2 for AoE / 9-Again skills).

**Given** a project dice pool is built,
**When** the player picks a skill with PT Asset Skill or MCI 3-dot bonus,
**Then** the pool total reflects the effective skill rating (inherent + bonus + PT/MCI bonus).

---

#### Story 1.5: Sorcery cost + target picker

As a player submitting Cruac sorcery in downtime,
I want rite cost displayed consistently across every surface and the rite target picker to actually persist my selection,
So that the cost shown matches the cost deducted, and target type clicks aren't silently dropped.

**Implements:** T12, T14, T15.

**Background:** Cruac rite cost shows "3" everywhere (bad seeded data, see `public/js/editor/sheet.js:657` reading `ruleEntry.cost`). Meanwhile the feeding tally at `admin/downtime-views.js:8058-8072` and the DT form vitae projection at `downtime-form.js:5683` correctly derive cost from rank (`rank>=4 ? 2 : 1`). The DT rites Stats line at `downtime-form.js:3791` uses `rite.stats` from the character power, which is unreliable (legacy field, only present on older characters). The sorcery target picker at `downtime-form.js:559-569` drops type-only rows because of an `if (type && value)` guard — meaning a click on a target-type radio is destroyed before re-render.

**Acceptance Criteria:**

**T12 — Rite cost derivation:**

**Given** the character sheet rite drawer,
**When** a Cruac rite renders,
**Then** the cost line shows `1 V` for ranks 1-3 and `2 V` for ranks 4-5, derived from rank not from the stored `cost` field.

**Given** a Theban rite renders,
**When** the cost line shows,
**Then** it shows `1 WP`.

**T15 — DT rites Stats line uses derived cost:**

**Given** the DT form sorcery slot at `downtime-form.js:3789-3792`,
**When** a rite is selected,
**Then** the rendered Stats line shows the same derived cost as the vitae projection panel below.

**Given** the legacy `rite.stats` field on character powers,
**When** the rites section renders,
**Then** the displayed cost ignores `rite.stats` and uses the derived value.

**T14 — Sorcery target picker persists type-only clicks:**

**Given** the sorcery target collector at `downtime-form.js:567`,
**When** a player picks a target type radio (Character/Territory/Other) on a rite,
**Then** the row is persisted as `{type, value: ''}` (the `&& value` guard is dropped).

**Given** the type radio is clicked and the row persists,
**When** the form re-renders,
**Then** the value sub-picker (Character chips / Territory pills / Other text input) appears for the chosen type.

**Given** a value is then entered or selected,
**When** the form saves,
**Then** the row persists as `{type, value}` with both fields populated.

---

#### Story 1.6: Pickers and lock state

As a player using merit pickers and supports,
I want gracefully-handled empty roster cases, clear hints on missing options, a merit picker for project Hide/Protect, and visible locks when a sphere is committed as a support,
So that the UI accurately reflects mechanical state.

**Implements:** T6, T10, T20, T24.

**Background:** Four bounded UX/render fixes mirroring established patterns in the codebase.

**T6 — Safe Word evaluator graceful when allChars is empty:**

The evaluator at `public/js/editor/rule_engine/safe-word-evaluator.js:29-40` calls `_removeStaleSwMerit(c)` when `allChars` doesn't contain the partner character. Eight call sites pass single-arg `applyDerivedMerits(c)` (no allChars), causing the merit to be stripped on every render except the ST main sheet. Fix: when `allChars` is empty, treat as "can't verify, skip this evaluator" — leave existing merit intact rather than removing it.

**T10 — Touchstone hint in Relationships tab Kind dropdown:**

The Kind dropdown at `public/js/tabs/relationships-tab.js:780` correctly excludes touchstone (it's created via the sheet picker, not the relationships tab). Add a hint below the dropdown: `"Touchstones are added on the character sheet."`

**T20 — Project Hide/Protect merit picker:**

`renderTargetCharOrOther` at `downtime-form.js:4779` only offers Character / Other. Add an "Own Merit" target type that, when selected, renders the existing `target_own_merit` widget (the merit dropdown used at `downtime-form.js:5004-5012` for sphere hide_protect).

**T24 — Sphere slot lock when used as project support:**

When an Ally chip is ticked in a project's Support Assets panel, `saved['sphere_${i}_action'] = 'support'` is set (see `downtime-form.js:2321`). Mirror the rote-feeding lock pattern (`downtime-form.js:2893-2904`): in the sphere pane render, if `actionVal === 'support'`, render a locked badge (`Committed to support of Project N`), skip the action dropdown and `renderSphereFields`, and emit a hidden input. Find the owning project by scanning `saved['project_${k}_joint_sphere_chips']`. Also call `renderForm(container)` after chip-click so the lock appears immediately.

**Acceptance Criteria:**

**Given** a character with an active Safe Word pact and a partner-mirrored merit,
**When** any client surface (Game app sheet, DT form, ST sheet) renders the character without passing `allChars` to `applyDerivedMerits`,
**Then** the SW-granted merit is NOT removed; it remains in the in-memory representation.

**Given** an ST or player opens the Relationships tab and clicks "+ Add Relationship",
**When** the Kind dropdown renders,
**Then** a small hint reads `"Touchstones are added on the character sheet."`

**Given** a player picks Hide/Protect on a project slot,
**When** the target zone renders,
**Then** the target-type ticker offers Own Merit / Character / Other.

**Given** the player picks "Own Merit",
**When** the merit sub-picker renders,
**Then** it lists the character's merits (matching the sphere-side `target_own_merit` widget).

**Given** a player ticks an Ally chip in a project's Support Assets panel,
**When** they navigate to the Sphere section for that Ally,
**Then** the sphere pane shows a locked badge `"Committed to support of Project N"` and no action dropdown.

**Given** the chip is ticked,
**When** the click handler fires,
**Then** the form re-renders so the lock appears immediately (not deferred until tab switch).

**Given** the chip is un-ticked,
**When** the player navigates to the sphere pane,
**Then** the lock is gone and the normal action dropdown is back.

---

#### Story 1.7: ST processing parity for skill acquisitions

As a Storyteller processing a skill-based acquisition,
I want the player's declared attribute, skill, spec, and pool total to surface in the action queue and processing panel,
So that I don't reconstruct the pool from scratch when the player has already declared it.

**Implements:** T27.

**Background:** The DT form at `downtime-form.js:3936-3970` correctly collects `skill_acq_pool_attr`, `skill_acq_pool_skill`, `skill_acq_pool_spec` and saves them. But the ST processing pipeline at `admin/downtime-views.js:2747` only reads the legacy `skill_acquisitions` field (which is just the description text, see `downtime-form.js:704`). The structured pool fields persist in MongoDB but nothing reads them downstream. ST gets a queue entry with `poolPlayer: ''` and has to rebuild the pool by hand.

**Acceptance Criteria:**

**Given** a player submits a skill acquisition with attr/skill/spec selected,
**When** the ST processing queue at `admin/downtime-views.js:2771-2789` ingests the submission,
**Then** the queue entry's `poolPlayer` field is populated with the player's declared pool (e.g. `"Manipulation 3 + Persuasion 4 + Authoritative — 8"`).

**Given** the ST opens the processing panel for a skill acquisition,
**When** the panel renders,
**Then** the player's declared attribute, skill, and spec are visible.

**Given** the legacy `skill_acquisitions` field still flows through,
**When** the queue entry renders,
**Then** the description text from `skill_acq_description` continues to display (no regression for the description).

---

#### Story 1.8: Resources multi-acquisition slots

As a player declaring multiple Resources purchases in one downtime,
I want to add and remove acquisition slots, each with its own description and availability rating,
So that I can submit several distinct items without merging them into one description.

**Implements:** T26.

**Background:** `renderAcquisitionsSection` at `downtime-form.js:3837` renders one description + one availability dot row + one merits checkbox grid. Mirror the rite-slot pattern at `downtime-form.js:3721-3830`: hidden count input, "+ Add" button, per-slot keys (`acq_${n}_description`, `acq_${n}_availability`, `acq_${n}_merits`), per-slot remove with shift-down. Resources rating stays at the top (it's character-level, shared across slots).

**Acceptance Criteria:**

**Given** the Acquisitions section renders with default state,
**When** a player views it,
**Then** one slot is visible (slot 1) plus an "+ Add Item" button.

**Given** the player clicks "+ Add Item",
**When** the form re-renders,
**Then** a second slot appears with its own description textarea, availability dot row, and remove button.

**Given** multiple slots are visible,
**When** the player clicks Remove on slot N,
**Then** later slots shift down (slot N+1 becomes slot N, etc.), mirroring sorcery-remove at `downtime-form.js:2487-2504`.

**Given** the form persists,
**When** the collector at `downtime-form.js:668-686` runs,
**Then** it iterates slots by `acq_slot_count` and writes per-slot keys plus a composite `responses['resources_acquisitions']` (legacy compat).

**Given** an existing submission with the legacy single-slot shape (`acq_description`, `acq_availability`),
**When** the form reloads it,
**Then** legacy values populate slot 1 (no data loss for in-flight DT 2 submissions).

**Given** the ST processing readers (`admin/downtime-views.js`, `admin/downtime-story.js`),
**When** a multi-slot submission is processed,
**Then** each slot surfaces as a distinct queue entry with its own availability (or one combined entry — pick one and document the decision).

---

#### Story 1.9: Archive shows all published DT cycles

As a player or Storyteller browsing the Archive,
I want every published downtime response to appear, not just DT 1,
So that DT 2 and future cycles are reachable from the Archive surface alongside the current cycle's report.

**Implements:** T1.

**Background:** Archive tab at `public/js/tabs/archive-tab.js:41` reads the `archive_documents` collection (`type='downtime_response'`). Entries are populated only by manual upload (`/api/archive_documents/upload`) or one-time bulk import (`server/scripts/import-archive-documents.js`). DT 1 entries exist because they were imported; DT 2 entries don't because that step was never repeated. Story → Chronicle (`story-tab.js:168`) reads `downtime_submissions` directly and shows all published narratives — so the data is already canonical there.

**Architectural choice (pick one before starting):**

- A. Auto-write `archive_documents` on cycle close (server-side hook on cycle status update).
- B. Stop using `archive_documents` for downtime responses; Archive tab reads from `downtime_submissions` like the Chronicle. Reserve `archive_documents` for dossier/history only.
- C. Manual backfill of DT 2 via existing upload tool; defer automation.

Recommendation: **B** — single source of truth, no migration needed, no per-cycle ST work.

**Acceptance Criteria:**

**Given** option B is chosen,
**When** the Archive tab loads for a character,
**Then** the Downtime Reports group reads from `downtime_submissions` filtered to `String(s.character_id) === charId && s.published_outcome`, sorted reverse-chronologically by cycle.

**Given** the same data,
**When** Story → Chronicle renders,
**Then** the existing behaviour is preserved (no regression).

**Given** option B is chosen,
**When** historical `archive_documents` entries with `type='downtime_response'` exist for DT 1,
**Then** the migration deletes them OR the Archive renderer ignores them (decide before starting; don't show duplicates).

---

#### Story 1.10: Mandragora Garden fruit conditionality

As a Storyteller resolving Mandragora Garden production,
I want fruit production gated on the maintenance vitae actually being paid,
So that "whilst feeding the garden" (per RAW) is enforced and players can't claim free fruit by skipping maintenance.

**Implements:** T13.

**Status:** **Blocked on ST team ruling.** Two readings exist:
1. Fruit tied to whether any rite is sustained in the garden this cycle (house-rule reading).
2. Fruit tied to maintenance vitae being paid (RAW: "whilst feeding the garden"). RAW favours #2.

**When unblocked:**

- Add a "maintain garden this cycle" toggle on the vitae projection panel (or couple to the existing per-rite "Vitae cost already paid" flags, depending on ST ruling).
- Both cost (`-mandDots`) and fruit (`+mandDots`) gate on the toggle.
- Currently both are unconditional (`downtime-form.js:5687-5690` and `:5776`).

**Acceptance Criteria (template — fill in after ruling):**

**Given** the ST team's ruling on conditionality,
**When** the gate is implemented,
**Then** the maintenance cost and the Blood Fruit production both depend on the same condition (no asymmetric gating).

**Given** a player opts not to maintain the garden this cycle,
**When** the vitae projection renders,
**Then** neither the `-mandDots` cost nor the `+bloodFruit` row appear.

---

#### Story 1.11: Rote feeding in Barrens — ambience policy

As a Storyteller,
I want a clear rule for how rote-feed ambience interacts with main-feed ambience,
So that rote-in-Barrens is not a free escape hatch from territorial penalty (or, if intentional, the rule is documented in-form).

**Implements:** T16.

**Status:** **Blocked on ST team ruling.** Current rule at `downtime-form.js:5732-5742` is "best of two ambience modifiers wins" — Barrens (-4) is always dominated, so rote-in-Barrens is consequence-free. ST team needs to decide:
1. Keep best-of-two (current; document for players).
2a. Use rote's ambience always.
2b. Use main's ambience always.
2c. Use worst of two (penalise risk-taking).
2d. Sum or average.

**When unblocked:**

- Apply the chosen rule at `downtime-form.js:5732-5742`.
- Mirror the same rule in `admin/downtime-views.js` so the ST-side feeding tally and the player-side projection stay in sync.

**Acceptance Criteria (template — fill in after ruling):**

**Given** the ST team's chosen rule,
**When** a player has both a main and a rote feeding territory selected,
**Then** the vitae projection's ambience modifier is computed per the chosen rule.

**Given** the same rule,
**When** the ST-side feeding tally resolves,
**Then** it computes the ambience modifier identically (no projection-vs-resolved drift).

---

## Out of Epic

- **T5 Bonus-success mechanic (Stronger Than You)** — descoped 2026-04-30. Rules-engine work (new `rule_bonus_success` collection + roll-time evaluator + seven-surface integration), not downtime UI. Pre-existing bug, zero regression cost to defer. Story file `specs/stories/dtlt.1.bonus-success-mechanic.story.md` is Sonnet-grade dev-ready. Memory `feedback_errata_vigour_example.md` captures the Vigour-interpretation lesson surfaced during scoping.
- **T2 NPC relationships data population** — schema is built; data is sparse. Multiple sources to harvest (touchstones, mortal_family, sire_name, narrative). Separate effort — likely a follow-up to NPCR.5.
- **T18 Ambience Change supporting merits** — needs reproduction details. Static analysis says ambience_change is in `JOINT_ELIGIBLE_ACTIONS` and should render the Support Assets panel like every other joint-eligible action; no code path treats it differently. Re-test once DTLT-2 ships (the tab-label fix may have masked the actual symptom).
