---
type: epic
id: epic-dt-form-mvp-redesign
title: 'DT submission form — MVP redesign'
status: ready-for-dev
date: 2026-05-06
owner: Piatra (Peter)
sm: Khepri
adr: specs/architecture/adr-003-dt-form-cross-cutting.md
audit: specs/audits/maintenance-action-audit.md
---

# Epic — DT submission form MVP redesign

This is the epic README for the cross-cutting remediation of `public/js/tabs/downtime-form.js`. It indexes the per-section story files below; **the epic itself does not carry acceptance criteria** — the stories do. Read top-to-bottom as a navigation surface.

## Why this epic exists

The DT submission form has accumulated chrome that obscures the minimum a player must supply, while asking architectural choices the rules don't consume. ADR-003 (*DT submission form cross-cutting decisions*, status `approved`, rev 3 / 2026-05-06) locked the three load-bearing decisions:

1. **Minimal/Advanced mode selector** — gates how much of the form a player sees.
2. **Hard-mirror soft-submit lifecycle** — `_has_minimum` derived bool replaces the manual `submitted` workflow string; auto-XP credit mirrors both directions; cycle close is the only true seal.
3. **Universal character picker** — single component, two scope variants (`all` / `attendees`), one render shape; replaces the five existing picker shapes.

ADR-003 also resolves Q1-Q12 (resolutions table at the bottom of the ADR). All decisions in stories below pull through that resolutions table by reference; do not re-litigate them in story bodies.

## Context: architectural-reset freeze

The freeze (ratified 2026-04-something, see `specs/architectural-reset-charter.md`) was lifted on 2026-05-06. The DT submission form is the surface that prompted the lift. ADR-003 was authored after the lift as the contested-architecture-mechanism artefact the charter describes; this epic is its implementation layer.

Diagnostic content in the charter remains useful reference. The freeze's gate-2 rule (cross-suite helpers) is explicitly retained per ADR-003 §Q6 — the universal character picker stays form-local in this epic; broader adoption is a future ADR.

## Stories under this epic

Naming convention: `dt-form.NN-<slug>.story.md`, where `NN` matches the in-session task ID for traceability. All stories ship at status `Draft` initially and are picked up via `tm-gh-issue-pickup`-style flow once #15 (this decomposition) is merged.

### Foundation (must merge before per-section stories)

| Task | Story | Title |
|---|---|---|
| #16 | `dt-form.16-character-picker.story.md` | Universal character picker component |
| #17 | `dt-form.17-minimal-advanced-lifecycle.story.md` | Minimal/Advanced mode + soft-submit lifecycle + auto-XP mirror |

**Sequencing rule:** #16 lands first (other stories consume `charPicker()`). #17 lands second (sets the rendering gate every per-section story respects). Per-section stories may then run in parallel.

### Per-section MINIMAL wiring

| Task | Story | Title |
|---|---|---|
| #18 | `dt-form.18-personal-story-reduce.story.md` | Personal Story — reduce to Touchstone-or-Correspondence binary |
| #20 | `dt-form.20-feeding-simplified.story.md` | Feeding — simplified MINIMAL variant |
| #22 | `dt-form.22-rote-hunt.story.md` | ROTE hunt redesign (secondary feeding) |
| #23 | `dt-form.23-regency-confirm.story.md` | Regency confirmation UI |

### Personal Actions chrome strip

| Task | Story | Title |
|---|---|---|
| #24 | `dt-form.24-personal-actions-chrome.story.md` | Personal Actions — strip MODE/SUPPORT/single-vs-dual; adopt `charPicker()` for ALLY |

### Per-section feature work

The ADR's Implementation Plan table calls these out as "Independent; can land in any order after #17". Titles for #19, #21, #25, #26, #28 supplied by Piatra 2026-05-06 in response to a clarification request from SM.

| Task | Story | Title |
|---|---|---|
| #19 | `dt-form.19-influence-breakdown-tooltip.story.md` | City Influence breakdown tooltip |
| #21 | `dt-form.21-feeding-territory-tint.story.md` | Feeding territory tinting (green/red, regardless of selection) |
| #25 | `dt-form.25-ambience-action-redesign.story.md` | Ambience Increase/Decrease — territory-row table with up/down arrow chips |
| #26 | `dt-form.26-xp-spend-action.story.md` | XP Spend action overhaul + remove Admin XP section |
| #27 | `dt-form.27-blood-sorcery-reorder.story.md` | Blood Sorcery — reorder rituals (Crúac/Theban) |
| #28 | `dt-form.28-mentor-staff-actions.story.md` | Mentor + Staff actions (per-merit / per-dot surfacing) |
| #29 | `dt-form.29-acquisitions-redesign.story.md` | Acquisitions — Resources + Skills redesign (subsumes hotfix #42 skill-acquisition fix once that lands) |
| #30 | `dt-form.30-equipment-hide.story.md` | Equipment — hide section for this DT cycle |

### Submission summary modal

| Task | Story | Title |
|---|---|---|
| #31 | `dt-form.31-submit-final-modal.story.md` | Submit Final modal (ADVANCED only) — replaces Admin section + form-rating widget |

### Removals

| Task | Story | Title |
|---|---|---|
| #32 | `dt-form.32-joint-authoring-remove.story.md` | Remove joint authoring / project invitation |
| #33 | `dt-form.33-npc-selectors-remove.story.md` | Remove NPC selectors |

## Cross-cutting notes (hotfix ↔ epic-story dependencies)

Two epic stories carry hotfix dependencies that change their landing order:

- **Issue #44 ↔ task #26.** The Merit selector category-filter fix (cycle-blocker hotfix #44) lands BEFORE story #26 (XP Spend redesign). Story #26 preserves that fix; #26 replaces the surrounding UI but the underlying merit-eligibility logic from the #44 hotfix remains the source of truth.
- **Issue #46 ↔ task #28.** The granted-merit detection walk (cycle-blocker hotfix #46, Charlie Ballsack Retainer-via-Attaché) lands BEFORE story #28 (Mentor + Staff actions). Story #28's merit detection follows the established walk pattern from the #46 hotfix.

Both are flagged in the affected stories' Dependencies blocks and again in the Cross-references section of each.

## Story-pair sequencing notes (intra-epic, confirmed by Piatra)

- **#26 ↔ #31 (Admin section removal).** Both touch the Admin section. Confirmed sequencing 2026-05-06: **#31 lands first** (removes the Admin section structure and replaces it with the Submit Final modal), **#26 follows** (puts XP Spend functionality in a project slot). Documented in #26's Dependencies block.

## Open-questions resolutions (Piatra 2026-05-06, two passes)

Two waves of resolutions during decomposition. The first wave was applied 2026-05-06 morning; the second wave (Q1, Q2 architectural corrections) was applied 2026-05-06 afternoon following Piatra's review. The second wave **inverts/constrains** the first wave on Q1 and Q2 — current state is the second-wave resolutions in the table below.

| Story | Question | Final resolution (Piatra 2026-05-06 afternoon) |
|---|---|---|
| #22 ROTE hunt | Where does ROTE live; does ROTE-only count toward MINIMAL? | **ROTE is a personal-project-action variant, NOT a feeding-section block.** Reuses primary feeding's pool; only territory selectable. Existing schema field `project_N_feed_method2` already supports this. **ROTE-only does NOT satisfy MINIMAL completeness; primary feeding is independently required.** A player can put ROTE in their MINIMAL "1 project slot" allocation but must also fill primary feeding in the feeding section. |
| #25 Ambience action | UP/DOWN exclusivity? Multi-row? | **Single target per action.** One row's UP or DOWN selectable at a time per action slot. Switching to a different row clears the previous selection. Two changes = two project slots. The earlier "independently toggleable, multi-row" interpretation is superseded. |
| #27 Blood Sorcery order | Crúac vs Theban order? | **Crúac first, Theban second.** Within each, alphabetical-by-name unless pickup-time analysis surfaces a better order. (No change from morning resolution.) |
| #26 ↔ #31 sequencing | Admin section removal order? | **#31 first (Admin section structure removed); #26 follows (XP Spend relocated to project slot).** Confirmed. |

### Earlier (morning, 2026-05-06) resolutions superseded by the afternoon pass

For audit trail. The first-pass resolutions are recorded in commit `8279207d` and are corrected by this commit:

- *(superseded)* #22 ROTE-only counts toward MINIMAL completeness
- *(superseded)* #25 Ambience UP/DOWN are independently toggleable; both may be selected simultaneously per row; multi-row allowed

## Cross-cutting hotfix references (NOT in scope of this epic)

The 9 hotfix bugs labelled `cycle-blocker` and `audit-finding` ship via the `tm-gh-issue-pickup` lane, not as stories under this epic. They are listed here only so the context the epic operates in is captured. Order is by issue number, not priority.

| Issue | Title |
|---|---|
| #42 | DT form: Skill acquisition pool incorrectly uses ATTR + SKILL (rules say SKILL only) |
| #43 | DT form: Feeding Grounds (5) merit doubles dice bonus to +10 instead of +5 |
| #44 | DT form: Merit selector dropdown missing Carthian Law / Invictus Oath / standing-merit categories |
| #45 | DT form: Charlie Ballsack does not see Retainer action despite holding Retainer via Attaché grant |
| #46 | DT form: Status / Allies sections bleed — status section starts showing ally-only options |
| #47 | DT form: Save Draft button does nothing visible (status indicator not surfacing) |
| #48 | Calculated merits: Keeper's Quick Draw shows 2 hollow dots in render |
| #49 | DT form: Yusuf's Contacts list pulls stale post-edit data — offers actions for contacts he no longer owns |
| #50 | DT form: Maintenance Action toggle inversion — PT is greyed (needs maintenance), MCI is clickable (already maintained) |

Note that issue #50 has a dedicated audit at `specs/audits/maintenance-action-audit.md` — its fix work feeds the per-section Maintenance redesign within #24 (Personal Actions chrome) implicitly. The audit's *recommended fix scope* section is the implementation contract for the hotfix lane; the per-section redesign in this epic does not re-derive it.

## Foundational acceptance criteria (lifted from ADR-003)

These are non-negotiable and re-stated in the bodies of #16 and #17 directly:

### #16 (character picker)

- WAI-ARIA combobox keyboard model per Q10 (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, tab/arrow/enter/escape semantics)
- `excludeIds` parameter present from v1 per Q6 (so ALLY-attach pickers can exclude self without revisiting consumers later)
- Two scope variants: `all` (reads from `allCharNames`), `attendees` (filters to `lastGameAttendees`)
- Replaces the 5 existing picker shapes inventoried in ADR-003 §Audit-baseline:
  - `<select class="qf-select dt-flex-char-sel">` at `downtime-form.js:4817`
  - `<button class="dt-chip" data-project-target-char>` at `downtime-form.js:5000`
  - Project-cast checkbox grid at `downtime-form.js:508, 2367`
  - Last-game-attendees subset at `downtime-form.js:1332`
  - Regency tab `<select id="reg-slot-N">` at `regency-tab.js:192-199`

### #17 (Minimal/Advanced + lifecycle)

- Per Q3 / Q4 hard mirror: `attendance.downtime` flips both ways with `_has_minimum`, immediately, with cycle close as the final seal
- The three UI affordances **MUST ship together with the lifecycle wiring** or hard mirror feels broken:
  1. Persistent banner when `_has_minimum` is false ("Your form is below minimum-complete. Your downtime XP credit is on hold."), listing missing pieces
  2. Visible XP-Available delta annotation ("(downtime credit on hold)") when bool is false; disappears when true
  3. Negative-`xpLeft()` treatment in the player view (red XP-Left + hover tooltip) when player has spent XP that subsequently flipped back below minimum
- `responses._mode` field per Q1 — default `'minimal'`; switching MINIMAL → ADVANCED → MINIMAL preserves entered data (does not clear unrendered-section fields)
- `isMinimalComplete()` lives in `public/js/data/dt-completeness.js` per Q8 — single function, one source of truth, importable from server later if Q7 promotes
- Cycle-close server gate (Q11) returns 423 Locked from `PATCH /api/downtime_submissions/:id` when `cycle.status === 'closed'`

## Branching and merge posture

- Branch: `docs/dt-form-epic-decomposition`
- Push to origin; **do not merge** — Piatra reviews and merges per the request
- Once merged, individual stories are picked up by `tm-gh-issue-pickup`-style flow against new feature branches (`dev` base)

## Story dependency block (read this before scheduling)

```
#16  ─┐
      ├─→ #18, #20, #22, #23, #24  (per-section MINIMAL wiring)
#17 ──┤    │
      │    └→ #19, #21, #25, #26, #27, #28  (independent feature work, post-#17)
      ├─→ #29  (acquisitions; subsumes hotfix #42 once that ships)
      ├─→ #30  (equipment hidden — trivial, can ship anytime after #17)
      ├─→ #31  (submit final modal — depends on #17's lifecycle being live)
      └─→ #32, #33  (removals — independent of cross-cutting; can ship anytime)
```

## References

- `specs/architecture/adr-003-dt-form-cross-cutting.md` — the locked design contract
- `specs/audits/maintenance-action-audit.md` — feeds Maintenance redesign within #24
- `specs/architectural-reset-charter.md` — context for why this epic exists; freeze lift status header at top
- GitHub issues #42-#50 — hotfix lane, not in scope of this epic
- `public/js/tabs/downtime-form.js` — primary remediation surface
- `public/js/tabs/downtime-data.js` — `DOWNTIME_SECTIONS` source of truth (`:171`)
- `public/js/data/game-xp.js` — Game-XP attendance linkage; lifecycle wiring (#17) amends consumers here
- `server/schemas/downtime_submission.schema.js` — submission contract; new fields `_mode`, `_has_minimum`, `_final_submitted_at` documented under `properties`
- `server/schemas/game_session.schema.js` — attendance contract; **no schema delta** per ADR-003 rev 2 hard-mirror decision
