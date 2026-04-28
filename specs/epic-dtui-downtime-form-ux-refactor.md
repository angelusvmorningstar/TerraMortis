---
stepsCompleted: [1, 2, 3, 4]
lastStep: 4
status: complete
inputDocuments:
  - specs/ux-design-downtime-form.md
  - public/js/tabs/downtime-form.js
  - public/js/tabs/downtime-tab.js
  - public/js/tabs/downtime-data.js
  - CLAUDE.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/feedback_effective_rating_discipline.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/reference_downtime_system.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/feedback_player_natural_language.md
---

# Epic: DTUI — Downtime Form UX Refactor

**Goal:** Refactor the player-facing Downtime Submission form to reduce mental load. Extend the form's existing "show only what's relevant" grammar universally. Unify scattered UI patterns into a coherent ticker-and-chip-grid vocabulary. Establish a stable shell for project and merit-action blocks where only Target, Desired Outcome, and Approach morph per action type, so players learn the shape once and reuse it everywhere.

**Why:** A walk-through of the current form on 2026-04-29 surfaced 27 specific issues spanning every section of the form. Code review confirmed that the form was built incrementally — UI patterns, field shapes, and decision flows differ across sections, forcing players to retrain on each section. The form's data shape is genuinely heterogeneous (different actions need different inputs), but the UI shape should be homogeneous (the player's gesture for "configure an action" is always the same). This epic introduces the missing abstraction layer.

**Source:** `specs/ux-design-downtime-form.md` (UX design specification, 14-step BMAD workflow completed 2026-04-29)

**Foundational pattern:** Stable shell, smart contents. Project and merit-action blocks share an identical outer shape (Action Type → Description → Outcome → Target → Dice → Approach → Solo/Joint), with three internal zones morphing per action.

---

## Requirements Inventory

### Functional Requirements

**Landing & Navigation:**

- FR1: Landing page "Player Portal" button is renamed "ST Portal" and links to `admin.html` (Discord OAuth gated)
- FR2: Mobile viewport (<1024px) replaces broken `/player` redirect with "best on desktop" notice

**Court:**

- FR3: Court → Acknowledge Peers section greys out and disables non-attendees from last game session; only attendees selectable

**Personal Story:**

- FR4: Personal Story section presents NPC correspondents from the character's NPC list as selectable chips, in addition to existing freetext

**Blood Sorcery:**

- FR5: Mandragora Garden checkbox is shown only for characters who have the Mandragora Garden merit
- FR6: Vitae Projection — Mandragora Garden contribution uses the same calculation logic as the feeding roll (effective dots)

**Feeding (section restructure):**

- FR7: Territory pill selector is relocated from Territory & Influence section into the Feeding section, directly below the dice pool options
- FR8: Feeding section groups Territory + Blood Type + Method of Feeding together with consistent ticker styling
- FR9: Method of Feeding labels: "The Kiss (subtle)" and "The Assault (violent)" (renamed from "Violent")
- FR10: "Commit a Project action for Rote quality on this hunt" panel appears after "Describe how your character hunts", not before
- FR11: Rote hunt panel includes the same three feeding selectors (Territory, Blood Type, Method) as a normal feed
- FR12: Solo/Joint and all "pick one of few" controls use pill-ticker styling everywhere across the form (replacing radios and checkboxes for that gesture-shape)

**Action Blocks (Personal Projects + Merit-based actions):**

- FR13: "Support" is removed from the action type dropdown in both Personal Projects and Merit-based actions (Support is reachable only via Joint with sphere-merit collaborators)
- FR14: "Characters Involved" picker is removed from project blocks by default; characters are only selectable as Invitees inside the Joint panel
- FR15: Joint invitees are greyed out and unselectable if the character has no free projects remaining this cycle (with explanatory tooltip)
- FR16: Target selector (Character / Territory / Other) is moved out of the Joint panel and applies to all project types (Solo or Joint), not just Joint
- FR17: Target selector uses a shared component model: radio Character/Territory/Other + Character chips (single-select, no attendance highlighting) / Territory chips / Other freetext
- FR18: Target selector is scoped per action type:
  - Ambience Change: Territory only + Improve/Degrade ticker
  - Attack: Character / Other only
  - Hide/Protect: Character / Other only
  - Investigate: Character / Territory / Other
  - Patrol/Scout: Territory only
  - Misc: Character / Territory / Other
  - Support: none (inherited from lead action)
  - XP Spend: none
  - Maintenance: chip array of own merits/assets requiring maintenance; maintained-this-chapter chips greyed
- FR19: When the player selects an action type, an explanatory description appears below the dropdown using the existing CSS conventions (italic Lora). Copy provided per action type:
  - Ambience Change, Attack, Hide/Protect, Investigate, Patrol/Scout, Support, XP Spend, Misc, Maintenance (full copy in `ux-design-downtime-form.md`)
- FR20: The "description" field is renamed **Approach** with a calibrated prompt per action type (full per-action prompts in UX spec)
- FR21: The "Desired Outcome" field is treated per action type:
  - Ambience Change: prefilled, read-only
  - Attack: replaced with ticker — Destroy / Degrade / Disrupt
  - Hide/Protect: prefilled, read-only
  - Investigate: prefilled, read-only
  - Patrol/Scout: prefilled, read-only
  - Support / XP Spend / Maintenance: removed
  - Misc: keep freetext, prompt updated
- FR22: Ambience Change is a single action (replacing "Ambience Change increase" / "Ambience Change decrease") with an Improve / Degrade ticker alongside the Territory target
- FR23: Solo / Joint selector is the **last** decision in the action block (after Approach), not the first
- FR24: Solo / Joint uses pill-ticker styling, not radios

**Allies (Merit-based actions):**

- FR25: Allies action dropdown removes Scout, Support, and Rumour
- FR26: Allies retains all other action types (Ambience, Attack, Hide/Protect, Investigate, Patrol/Scout, Block, Grow, Misc, Maintenance) with descriptions, target selectors, and Desired Outcome treatments mirroring Personal Projects (no Approach field in Allies)
- FR27: Allies Ambience action is gated on **effective** Allies dots:
  - Standard threshold: 3+ effective dots (3-4 = ±1 ambience point, 5 = ±2 points)
  - With Honey with Vinegar merit: 2+ effective dots (2-3 = ±1, 4-5 = ±2)
  - If the specific Allies instance is below the threshold, Ambience is excluded from the dropdown for that merit
- FR28: When Allies Ambience is selected, a read-only description shows the dynamic exhaustion notice and the calculated ±1 or ±2 contribution based on the merit's effective dots, Honey with Vinegar presence, and Improve/Degrade selection
- FR29: Allies Block targeting uses the standard character chip model (single-select) and retains the existing freetext field asking which merit they are targeting on that character
- FR30: Allies Grow action inherits the XP Spend treatment, scoped to growing that specific Allies merit

**Joint Collaboration Hub:**

- FR31: Joint panel auto-expands when the player selects Joint from the Solo/Joint ticker
- FR32: Joint panel houses two stacked chip grids: (a) Player invitees, (b) Sphere-merit collaborators (own Allies, Retainers, etc.)
- FR33: Selecting a sphere-merit chip in the Joint panel auto-commits that merit's Support action to this project (mirroring the rote-feeding-auto-commits-project pattern)
- FR34: Sphere-merit chips are greyed out and tooltipped if the merit is already used elsewhere this cycle

**Form Chrome & Navigation:**

- FR35: Submit button is at the bottom of the form (scroll-to-reach), not sticky
- FR36: "Add another project" button is rendered below the last project block, not in section header or as a sticky chip
- FR37: Section accordion: sections with dirty (unsaved) input stay expanded across form re-renders
- FR38: Sticky progress rail at right edge of viewport shows section list with completion state (incomplete / in-progress / complete / current); clicking a section name scrolls to and expands that section
- FR39: Auto-save indicator is anchored visibly in form chrome (replacing the buried `#dt-save-status` line) and announces state via `aria-live="polite"`

**Filter-to-Context Protocol (cross-cutting):**

- FR40: All eligibility, calculation, and prerequisite checks use **effective rating** (inherent + bonus dots), never inherent only
- FR41: Every section's render starts with a context check: controls whose use is impossible in the current context are hidden by default, or rendered as greyed-with-reason when the player should know the option exists but isn't currently available
- FR42: Greyed (disabled) controls show: 50-60% opacity AND `cursor: not-allowed` AND a tooltip explaining the disablement reason — never colour-only signal

### Non-Functional Requirements

- NFR1: Form is desktop-only; no mobile/tablet rendering of the form (notice page only on small screens)
- NFR2: Adaptive density within desktop: ≥1280px target (4-col character chips, 6-col territory chips, 220px progress rail), 1024-1279px acceptable (3-col / 5-col / 180px rail), <1024px not rendered
- NFR3: WCAG 2.1 Level AA compliance for all new components
- NFR4: Auto-save dual-tier (localStorage 800ms, server 2000ms) — already in place; redesign surfaces it more visibly without behavioural change
- NFR5: All colour through CSS custom properties on `:root`; zero bare hex in rule bodies (per `reference_css_token_system.md`); new colour roles add new tokens rather than inlining
- NFR6: Inherit existing TM Suite typography (Cinzel for headings, Lora for body); no new font stacks
- NFR7: Match existing dot-display semantics (● filled inherent, ○ hollow derived)
- NFR8: British English throughout; no em-dashes
- NFR9: Touch targets ≥ 32px for tickers and chips; ≥ 36px for buttons
- NFR10: Reduced motion (`prefers-reduced-motion: reduce`) disables all transitions and animations
- NFR11: Keyboard navigable throughout (Tab, Shift-Tab, arrow keys within ticker groups, Enter/Space to activate)
- NFR12: Screen reader compatibility tested with NVDA on Windows
- NFR13: Form supports a 30+ minute focused-attention session — no validation walls, no aggressive resets, no concentration-breaking modals introduced
- NFR14: No new modal patterns introduced (existing rote-cast modal acceptable as legacy debt; not in scope to refactor here)
- NFR15: All `aria-live` regions use `polite`, never `assertive`
- NFR16: Visible focus states (gold `--gold2` outline at 2px) on all interactive elements; never `outline: none` without alternative

### Additional Requirements

- AR1: Existing TM Suite design system serves as foundation — `--bg`, `--gold1/2/3`, `--surf1/2/3`, `--crim`, Cinzel/Lora typography (per `reference_css_token_system.md`, `reference_typography_system.md`)
- AR2: Existing accordion section family (`.qf-section`, `.qf-section-title`, `.qf-section-tick`, `.qf-section-body`) is reused as-is — no replacement
- AR3: Existing form components (`.qf-textarea`, `.qf-btn` variants, `.qf-field`, `.qf-label`) are reused as-is
- AR4: Existing one-shot banner pattern from DTU-2 (`.qf-results-banner` family) is reused for restore-from-localStorage and submit confirmation
- AR5: Existing character chip styling (in joint invitees) is the basis for the canonical `.dt-chip` and `.dt-chip-grid` components; existing feeding-method ticker is the basis for `.dt-ticker`
- AR6: Type scale (font sizes) and spacing remain raw px values matching existing convention; tokenisation of these dimensions is flagged as a future refactor opportunity but not in this epic's scope
- AR7: Field re-render preserves matching field values across action type changes (Approach text, Dice pool); incompatible fields cleared with quiet inline notice
- AR8: All existing auto-save behaviour (localStorage at 800ms, server at 2000ms, DTU-2 restore banner) is preserved without change
- AR9: Existing schema fields and API endpoints remain unchanged unless explicitly required by a story (this is a UI refactor, not a schema migration)

### UX Design Requirements

**New Atomic Components:**

- UX-DR1: `.dt-ticker` — pill-ticker for "pick one of few" selections; replaces radios and small checkbox groups; states (default, hover, active, disabled, focus); fieldset/radiogroup ARIA semantics; arrow-key navigation within group
- UX-DR2: `.dt-chip` — single selectable entity chip (character, territory, NPC, merit, maintenance item); states (default, hover, selected, disabled, focus); 32-44px height; tooltip required on disabled state
- UX-DR3: `.dt-chip-grid` — layout container for `.dt-chip` components with selection semantics; variants (single-select, multi-select, single-select-required); responsive grid wrapping; never paginated
- UX-DR4: `.dt-action-desc` — italic descriptive copy block beneath action-type dropdown; `aria-live="polite"`; fade-in 200ms (skipped on reduced motion); read-only

**New Compound Components:**

- UX-DR5: `.dt-action-block` — stable shell housing project/merit-action; fixed outer shape (dropdown → action-desc → outcome zone → target zone → dice pool zone → approach textarea → solo/joint ticker → joint panel); zones morph per action type; preserves compatible field values across action changes
- UX-DR6: `.dt-joint-panel` — collaboration hub; auto-expands on Joint selection; two stacked chip grids (player invitees, sphere-merit collaborators) with own labels; helper text explains exhaustion implications; `aria-expanded` semantics
- UX-DR7: `.dt-progress-rail` — sticky right-edge sidebar; section list with completion state (incomplete/in-progress/complete/current/disabled); click to scroll-and-expand; gated sections excluded; `aria-current="step"` on active item

**Enhanced Existing Components:**

- UX-DR8: `.dt-save-status` — visible auto-save indicator anchored in form chrome; states (idle/saving/saved/save-failed); replaces buried `#dt-save-status`; `aria-live="polite"`

**Cross-cutting Protocol:**

- UX-DR9: Filter-to-context rendering protocol — logic-only (no CSS class); applied to every section's render; impossible options hidden by default, greyed-with-reason where the player should know they exist; effective rating used everywhere

**Pattern Consolidation:**

- UX-DR10: Button hierarchy — three tiers (primary `--gold2` filled / secondary `--surf2` outlined / tertiary text-only); one primary button per form (Submit); destructive actions tertiary by default
- UX-DR11: Feedback channels — five channels (auto-save inline, restore banner one-shot, submit confirmation banner one-shot, submit error banner inline, per-field validation inline); no toast notifications; no interrupting modals
- UX-DR12: Form input grammar — uniform field shape (label + optional helper text + input + optional inline validation); labels are character-voice questions where possible; no red asterisks for required
- UX-DR13: Conditional field appearance — fade-in 200ms when condition becomes true, fade-out 200ms when condition lifts; no layout jumps
- UX-DR14: Empty/loading/error states — seven defined states (form loading, load failed, empty action block, no projects yet, no qualifying merits, save failed, stale cycle) each with specific treatment per UX spec
- UX-DR15: Helper text conventions — italic Lora muted colour; British English; one sentence preferred (two if constraint genuinely warrants)

### FR Coverage Map

| FR | Story | Notes |
|---|---|---|
| FR1 | dtui.28 | Landing page rename |
| FR2 | dtui.29 | Mobile notice |
| FR3 | dtui.20 | Court grey out non-attendees |
| FR4 | dtui.21 | Personal Story NPC chips |
| FR5 | dtui.22 | Mandragora visibility |
| FR6 | dtui.22 | Mandragora Vitae Projection calc |
| FR7 | dtui.23 | Feeding territory relocated |
| FR8 | dtui.23 | Three feeding tickers grouped |
| FR9 | dtui.24 | "The Assault (violent)" rename |
| FR10 | dtui.25 | Rote panel ordering |
| FR11 | dtui.25 | Rote panel territory/blood/method selectors |
| FR12 | dtui.1 + dtui.5 | Ticker component + Solo/Joint applied |
| FR13 | dtui.4 | Remove Support from action dropdown |
| FR14 | dtui.5 | Characters Involved removed (lives in Joint) |
| FR15 | dtui.13 | Greyed invitees if no free projects |
| FR16 | dtui.5 | Joint target moved out of Joint panel |
| FR17 | dtui.8 | Shared targeting component |
| FR18 | dtui.8 | Per-action Target scoping |
| FR19 | dtui.6 | Action type descriptions |
| FR20 | dtui.7 | Approach calibrated prompts |
| FR21 | dtui.9 | Desired Outcome per-action treatments |
| FR22 | dtui.10 | Ambience Change consolidation |
| FR23 | dtui.5 | Solo/Joint moved to bottom |
| FR24 | dtui.5 | Solo/Joint as ticker styling |
| FR25 | dtui.15 | Allies dropdown removes Scout/Support/Rumour |
| FR26 | dtui.15 + dtui.16 | Allies action descriptions + targeting parity |
| FR27 | dtui.17 | Allies Ambience eligibility gate |
| FR28 | dtui.18 | Allies Ambience contribution display |
| FR29 | dtui.16 | Allies Block targeting (chip + freetext merit field) |
| FR30 | dtui.19 | Allies Grow inherits XP Spend |
| FR31 | dtui.12 | Joint panel auto-expand |
| FR32 | dtui.12 | Joint stacked chip grids |
| FR33 | dtui.14 | Sphere-merit auto-commit |
| FR34 | dtui.14 | Sphere-merit greyed if used |
| FR35 | dtui.30 | Submit placement |
| FR36 | dtui.31 | Add-project placement |
| FR37 | dtui.32 | Accordion dirty-stays-open |
| FR38 | dtui.26 | Progress rail |
| FR39 | dtui.27 | Save status enhancement |
| FR40 | cross-cutting | Effective rating discipline — appears in every story's Compliance section |
| FR41 | dtui.4 + cross-cutting | Filter-to-context protocol baked into shell; applied throughout sections |
| FR42 | cross-cutting | Greyed-with-reason — every story with disabled controls |

## Epic List

### Epic 1: DTUI — Downtime Form UX Refactor

**Goal:** Refactor the player-facing Downtime Submission form to reduce mental load. Establish a stable shell for project and merit-action blocks where only Target, Desired Outcome, and Approach morph per action type. Unify scattered UI patterns into a coherent ticker-and-chip-grid vocabulary. Apply the form's existing "show only what's relevant" grammar universally.

**User outcome:** A player filing their downtime feels like a confident conspirator scheming on behalf of their character. Every section knows their character. Every action block is configured with the same gesture. Bringing in help — whether a player or their own merit — is one mental model. The form gets out of the way so the storytelling can do its work.

**FRs covered:** All 42 FRs (FR1-FR42), all 16 NFRs (NFR1-NFR16), all 9 ARs, all 15 UX-DRs.

#### Wave 1 — Foundation Atomics

| ID | Title |
|----|-------|
| dtui.1 | `.dt-ticker` component (pill-ticker for "pick one of few") |
| dtui.2 | `.dt-chip` and `.dt-chip-grid` components (chip-grid for "pick from roster") |
| dtui.3 | `.dt-action-desc` component (italic copy block under action dropdown) |

**Wave dependencies:** None. Foundation. Wave 1 must complete and be verified before Waves 2, 3, 4 begin.

#### Wave 2 — Action Block Compound

| ID | Title |
|----|-------|
| dtui.4 | `.dt-action-block` stable shell structure (fixed flow order: Action Type → Description → Outcome → Target → Dice → Approach → Solo/Joint; Support removed from dropdown; filter-to-context protocol baked in) |
| dtui.5 | Action block placement changes (Solo/Joint moved to bottom + ticker styling; Characters Involved removed from default; Joint target moved out of Joint panel) |
| dtui.6 | Action type descriptions per action — explanatory copy below dropdown |
| dtui.7 | Approach field calibrated prompts per action type |
| dtui.8 | Per-action Target selector scoping (Character / Territory / Other rules per action) |
| dtui.9 | Per-action Desired Outcome treatments (prefilled / ticker / freetext / removed) |
| dtui.10 | Ambience Change consolidation (single action + Improve/Degrade ticker, replaces increase/decrease) |
| dtui.11 | Maintenance action target — chip array of own merits/assets requiring upkeep, maintained-this-chapter chips greyed |

**Wave dependencies:** Wave 1 complete (uses `.dt-ticker`, `.dt-chip-grid`, `.dt-action-desc`).

#### Wave 3 — Joint Collaboration Hub

| ID | Title |
|----|-------|
| dtui.12 | `.dt-joint-panel` component — auto-expands on Joint selection; two stacked chip-grid containers labelled |
| dtui.13 | Player invitee chip grid in Joint panel; greyed (with tooltip) if character has no free projects this cycle |
| dtui.14 | Sphere-merit collaborator chip grid + auto-commit Support pattern; greyed if merit already used this cycle |
| dtui.15 | Allies action dropdown parity (remove Scout/Support/Rumour; action descriptions per action; no Approach field) |
| dtui.16 | Allies target scoping parity (per-action targeting; Block keeps freetext merit field alongside chip target) |
| dtui.17 | Allies Ambience eligibility gate (effective dots ≥3, or ≥2 with Honey with Vinegar; option excluded from dropdown if ineligible) |
| dtui.18 | Allies Ambience contribution display (read-only ±1/±2 calculation based on effective dots, Honey with Vinegar, and Improve/Degrade) |
| dtui.19 | Allies Grow action — inherits XP Spend treatment, scoped to growing the specific Allies merit |

**Wave dependencies:** Wave 1 + Wave 2 complete (Joint panel embeds in action block; Allies parity uses action-block patterns).

#### Wave 4 — Filter-to-Context per Section (parallelisable with Waves 2-3 after Wave 1)

| ID | Title |
|----|-------|
| dtui.20 | Court — Acknowledge Peers chip grid greys out non-attendees from last game session |
| dtui.21 | Personal Story — character's NPC correspondents wired in as selectable chips alongside freetext |
| dtui.22 | Blood Sorcery — Mandragora Garden checkbox visibility filter + Vitae Projection Mandragora calculation using effective dots |
| dtui.23 | Feeding section restructure — territory pill relocated from Territory & Influence into Feeding directly below dice pool; grouped with Blood Type and Method as three consistent tickers |
| dtui.24 | Feeding — Method of Feeding label rename ("The Kiss (subtle)" / "The Assault (violent)") |
| dtui.25 | Feeding rote panel — moved below "Describe how your character hunts"; same three feeding selectors (Territory, Blood Type, Method) inside the rote panel |

**Wave dependencies:** Wave 1 complete (uses `.dt-chip-grid` for Acknowledge Peers and NPC correspondents; uses `.dt-ticker` for feeding tickers).

#### Wave 5 — Orientation Chrome (independent — parallelisable with Waves 2-4)

| ID | Title |
|----|-------|
| dtui.26 | `.dt-progress-rail` sticky right-edge sidebar with section list and completion state (incomplete / in-progress / complete / current); click to scroll-and-expand |
| dtui.27 | `.dt-save-status` enhancement — visible auto-save indicator anchored in form chrome (replaces buried `#dt-save-status`) |

**Wave dependencies:** Independent of Waves 2-4 once Wave 1 is in. Can be developed in parallel.

#### Wave 6 — Form Polish (after Waves 1-5 substantially done)

| ID | Title |
|----|-------|
| dtui.28 | Landing page "Player Portal" → "ST Portal" rename + redirect to `admin.html` (Discord OAuth gated) |
| dtui.29 | Mobile redirect replaced with "best on desktop" notice (current `/player` redirect is broken) |
| dtui.30 | Submit button placement — bottom of form, scroll-to-reach, not sticky |
| dtui.31 | Add-project button placement — below the last project block, with remaining slot count |
| dtui.32 | Section accordion behaviour — sections with dirty (unsaved) input stay expanded across form re-renders |

**Wave dependencies:** None on each other; mostly independent of other waves but best done after the substantive work in Waves 1-5 is in.

### Cross-cutting Compliance (every story)

These rules apply to every story in this epic. Each story's compliance section must reference them:

- **CC1 — Effective rating discipline (FR40):** All eligibility, calculation, and prerequisite checks use effective rating (inherent + bonus dots). Never inherent only. Documented in `feedback_effective_rating_discipline.md`.
- **CC2 — Filter-to-context protocol (FR41):** Sections render only controls whose use is possible in the current context. Impossible options hidden by default; greyed-with-reason where the player should know an option exists but isn't currently available.
- **CC3 — Greyed-with-reason rule (FR42):** Disabled controls show 50-60% opacity AND `cursor: not-allowed` AND a tooltip explaining the disablement reason. Never colour-only signal.
- **CC4 — Token discipline (NFR5):** All colour through CSS custom properties. Zero bare hex in rule bodies. New colour roles add new tokens on `:root`, never inline values.
- **CC5 — British English, no em-dashes** (NFR8) — applies to all new copy, labels, helper text, tooltips.
- **CC6 — Accessibility baseline (NFR3, NFR11, NFR12, NFR15, NFR16):** WCAG 2.1 Level AA, keyboard navigable, NVDA-compatible, `aria-live="polite"` (never assertive), visible focus states.
- **CC7 — Reduced motion support (NFR10):** Wrap animations in `@media (prefers-reduced-motion: no-preference)`; never animation as only signal.
- **CC8 — No new modals (NFR14):** Existing rote-cast modal acceptable as legacy debt; do not introduce new modal patterns.
- **CC9 — Component pattern library compliance (UX-DR10, UX-DR12, UX-DR13, UX-DR15):**
  - Button hierarchy: one primary per form (`--gold2` filled), secondary `--surf2` outlined, tertiary text-only `--gold3`
  - Form input grammar: label (bold, character-voice question) + optional italic helper text + input + optional inline validation
  - Conditional field rendering: fade-in 200ms on condition true, fade-out 200ms on condition false; no layout jumps; reduced motion skips transitions
  - Helper text: italic Lora muted; one sentence preferred (two if constraint warrants); British English; no em-dashes

### Sequencing Notes for Dev Agent

- **Wave 1 unblocks Waves 2, 3, 4 (partially), 5.** Build atomics first; verify each before advancing.
- **Waves 2-5 can run partly in parallel after Wave 1** — Wave 4 (filter-to-context per section) and Wave 5 (orientation chrome) don't conflict with Waves 2-3.
- **Wave 6 polish is best done last** — submit/add-project/accordion changes are easier to verify when the rest of the form is stable.
- **Run `code-review` every 2-3 stories** — catches drift early, especially with Sonnet executing.
- **Each story file should reference specific line numbers** in `public/js/tabs/downtime-form.js` for the dev agent's precise pointer.

### Story Granularity Rationale

Stories are intentionally split for Sonnet-friendly execution:
- Each story touches ≤5 files
- Each has 3-5 BDD acceptance criteria
- Each is verifiable in ~1-2 hours of human review
- Each is a single concern with a single change focus

Total: **32 stories across 6 waves.**

---

## Stories

### Wave 1 — Foundation Atomics

#### Story 1.1: `.dt-ticker` component (pill-ticker for "pick one of few")

As a player filling out the downtime form,
I want every "pick one of few" choice to use the same pill-ticker visual and interaction,
So that I learn the gesture once and reuse it without retraining for each section.

**Implements:** UX-DR1; foundation for FR12 and Waves 2-4 stories using ticker.

**Acceptance Criteria:**

**Given** a developer applies `.dt-ticker` to a fieldset of options,
**When** the ticker renders,
**Then** the fieldset displays as a horizontal row of pill-shaped buttons with rounded corners and label text only.

**Given** the ticker is rendered with one pill selected,
**When** the player clicks a different pill,
**Then** the new pill highlights with `--gold2` background and dark text; previously-selected pill returns to default `--surf2` styling.

**Given** a ticker pill is in disabled state,
**When** the player hovers it,
**Then** the cursor shows `not-allowed`, opacity is 50-60%, text uses `--surf-fg-muted`, and a tooltip explains the disablement reason.

**Given** a player navigates with keyboard only,
**When** they Tab into the ticker group,
**Then** the focused pill shows a 2px `--gold2` outline; arrow keys navigate within the group; Tab exits the group.

**Given** a screen reader (NVDA) reads the form,
**When** it encounters a ticker group,
**Then** it announces the fieldset legend or `aria-label`, then each pill's label, with the selected pill clearly identified.

**Compliance:** CC4, CC5, CC6, CC7.

---

#### Story 1.2: `.dt-chip` and `.dt-chip-grid` components

As a player filling out the downtime form,
I want every "pick from a roster" interaction to use the same chip-grid visual and gesture,
So that targeting characters, picking territories, ticking invitees, or selecting maintenance items all feel like the same action.

**Implements:** UX-DR2, UX-DR3; foundation for FR15, FR17, FR18, FR32, multiple Wave 4 stories.

**Acceptance Criteria:**

**Given** a developer applies `.dt-chip-grid` to a container with `.dt-chip` children,
**When** the grid renders,
**Then** chips display as a responsive grid of pill-shaped buttons that wrap at container width.

**Given** a chip-grid is configured as `single-select`,
**When** the player clicks a chip,
**Then** that chip highlights with `--gold2` border and accent dot; any previously-selected chip in the same grid returns to default.

**Given** a chip-grid is configured as `multi-select`,
**When** the player clicks chips,
**Then** each click toggles the chip's selected state; multiple chips can be selected simultaneously.

**Given** a chip is in disabled state,
**When** the player hovers it,
**Then** the cursor shows `not-allowed`, the chip shows 50-60% opacity and desaturated colour, and a tooltip explains the disablement reason.

**Given** the viewport is ≥1280px,
**When** a character chip-grid renders,
**Then** chips wrap into 4 columns; territory chip-grids wrap into 6 columns. At 1024-1279px: 3 / 5 columns. Below 1024px: form not rendered.

**Given** a screen reader reads the grid,
**When** it encounters a chip-grid,
**Then** it announces the grid's `aria-labelledby` reference; treats each chip as button/checkbox/radio per grid variant; reads disabled chips' tooltip text on focus.

**Compliance:** CC3, CC4, CC5, CC6, CC9.

---

#### Story 1.3: `.dt-action-desc` component

As a player who just selected an action type,
I want a brief italic description to appear immediately below the dropdown explaining how the action works,
So that I confirm I picked the right thing without hunting for help text.

**Implements:** UX-DR4; enables FR19.

**Acceptance Criteria:**

**Given** a player views an action block with no action selected,
**When** they look beneath the action-type dropdown,
**Then** no `.dt-action-desc` element is visible.

**Given** a player selects an action type from the dropdown,
**When** the action is set,
**Then** the `.dt-action-desc` element fades in below the dropdown (200ms) showing the per-action explanatory copy in italic Lora at body size.

**Given** a player changes the action type to a different action,
**When** the new action is set,
**Then** the existing description fades out and the new description fades in at the same position; copy reflects the new action.

**Given** the user has `prefers-reduced-motion: reduce` set,
**When** an action description appears or changes,
**Then** the change is instant — no fade animation.

**Given** a screen reader is on the form,
**When** the action description appears or changes,
**Then** the screen reader announces the new description via `aria-live="polite"`.

**Compliance:** CC4, CC5, CC6, CC7, CC9.

---

### Wave 2 — Action Block Compound

#### Story 1.4: `.dt-action-block` stable shell structure

As a player configuring an action,
I want the project/merit-action block to have a consistent outer shape with a fixed flow order,
So that I know exactly where each input lives regardless of which action I picked.

**Implements:** UX-DR5; enables FR13 (Support removed), FR41 (filter-to-context baked in).

**Acceptance Criteria:**

**Given** a developer renders a project block or merit-action block,
**When** the block initialises,
**Then** the block contains zones in this fixed flow order: action-type dropdown → `.dt-action-desc` → Outcome zone → Target zone → Dice pool zone (projects only) → Approach textarea → Solo/Joint `.dt-ticker` → Joint panel.

**Given** a player views an empty action block (no action selected),
**When** the block renders,
**Then** only the action-type dropdown is visible; all other zones are hidden.

**Given** a player picks an action type,
**When** the block re-renders,
**Then** zones surface in the fixed order; zones not applicable to the chosen action remain hidden (filter-to-context).

**Given** the action-type dropdown is rendered,
**When** the dropdown options are enumerated,
**Then** the list does NOT include "Support" (Support is reachable only via Joint hub).

**Given** a player changes action type mid-flow,
**When** the new action is set,
**Then** matching field values (Approach text, Dice pool) are preserved; incompatible field values are cleared with a quiet inline notice.

**Compliance:** CC1, CC2, CC4, CC5, CC6, CC9.

---

#### Story 1.5: Action block placement changes

As a player configuring an action,
I want Solo/Joint to be the last decision (not the first), Characters Involved removed, and Joint target moved out of the Joint panel,
So that I design the action fully before deciding to bring help, and so the form doesn't ask the same target question twice.

**Implements:** FR12, FR14, FR16, FR23, FR24.

**Acceptance Criteria:**

**Given** a player views an action block with an action selected,
**When** they scroll through the block,
**Then** the Solo/Joint `.dt-ticker` is rendered at the bottom of the block (after Approach textarea).

**Given** the action block first renders,
**When** the Solo/Joint ticker shows,
**Then** Solo is the default selected pill.

**Given** a developer removes the legacy "Characters Involved" picker,
**When** the action block renders,
**Then** the legacy picker is absent from the default block layout; characters are only selectable inside the Joint panel (covered in dtui.13).

**Given** a player selects an action that takes a target,
**When** the block surfaces zones,
**Then** the Target zone (Character/Territory/Other selector) appears in the action block's main flow — NOT inside the Joint panel.

**Given** a player toggles Solo to Joint,
**When** the Joint panel auto-expands,
**Then** the panel contains only the invitee chip-grids (covered in dtui.12-14); no target picker re-asked inside the Joint panel.

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.6: Action type descriptions per action

As a player picking an action type,
I want the `.dt-action-desc` to show calibrated explanatory copy for that action,
So that I understand mechanically what the action does without needing help docs.

**Implements:** FR19.

**Acceptance Criteria:**

**Given** a player picks "Ambience Change",
**When** the description renders,
**Then** the copy reads: *"This project will apply your successes directly towards improving or degrading the ambience of the selected territory."*

**Given** a player picks "Attack",
**When** the description renders,
**Then** the copy reads: *"You are attempting to destroy, ruin, or harm a specific target. You will need to select a character you're targeting, and detail to us the specific thing attached to them you're trying to affect..."* (full copy from UX spec).

**Given** a player picks any of: Hide/Protect, Investigate, Patrol/Scout, XP Spend, Misc, Maintenance,
**When** the description renders,
**Then** the copy matches the per-action text specified in `specs/ux-design-downtime-form.md` UX Consistency Patterns section.

**Given** the dropdown shows actions not in scope for this round (Support removed per FR13),
**When** the player browses options,
**Then** Support is NOT listed; descriptions for Support never render in Personal Projects or Merit-based actions.

**Given** a player switches action type,
**When** the new action is selected,
**Then** the existing description swaps to the new action's description per dtui.3 fade behaviour.

**Compliance:** CC5 (British English, no em-dashes in copy), CC9.

---

#### Story 1.7: Approach calibrated prompts per action

As a player writing the narrative for an action,
I want the Approach textarea label to be a character-voice question calibrated to that action,
So that the prompt feels like roleplay, not a survey.

**Implements:** FR20.

**Acceptance Criteria:**

**Given** a player picks "Ambience Change",
**When** the Approach prompt renders,
**Then** the prompt reads: *"How do you go about changing the ambience of this territory in narrative terms."*

**Given** a player picks "Attack",
**When** the Approach prompt renders,
**Then** the prompt reads: *"How do you attempt to destroy or undermine this target in narrative terms."*

**Given** a player picks any other action with an Approach prompt (Hide/Protect, Investigate, Patrol/Scout, Support, Misc, Maintenance),
**When** the Approach prompt renders,
**Then** the prompt matches the per-action calibrated text in `specs/ux-design-downtime-form.md`.

**Given** the field label is rendered,
**When** the player views the form,
**Then** the field is labelled "Approach" (renamed from "description").

**Given** a player switches action type,
**When** the new action is selected,
**Then** the Approach prompt updates immediately to reflect the new action.

**Compliance:** CC5, CC9.

---

#### Story 1.8: Per-action Target selector scoping

As a player picking an action,
I want only the targeting options that make sense for that action to appear,
So that I can't accidentally pick an invalid target.

**Implements:** FR17, FR18.

**Acceptance Criteria:**

**Given** a player picks Ambience Change,
**When** the Target zone renders,
**Then** it shows Territory `.dt-chip-grid` (single-select) plus an Improve/Degrade `.dt-ticker`.

**Given** a player picks Attack or Hide/Protect,
**When** the Target zone renders,
**Then** it shows a Character/Other radio toggle; Character variant shows Character `.dt-chip-grid` (single-select); Other variant shows freetext.

**Given** a player picks Investigate or Misc,
**When** the Target zone renders,
**Then** it shows a Character/Territory/Other radio toggle with appropriate widget for the active variant.

**Given** a player picks Patrol/Scout,
**When** the Target zone renders,
**Then** it shows Territory `.dt-chip-grid` only (no Character or Other variants).

**Given** a player picks Support or XP Spend,
**When** the Target zone renders,
**Then** the Target zone is hidden entirely (no widget visible).

**Compliance:** CC1, CC2, CC4, CC9.

---

#### Story 1.9: Per-action Desired Outcome treatments

As a player setting the goal of my action,
I want the Desired Outcome zone to fit the action — prefilled when determined, ticker when finite, freetext only when narrative,
So that I'm not writing what the system already knows.

**Implements:** FR21.

**Acceptance Criteria:**

**Given** a player picks Ambience Change with Improve direction,
**When** the Outcome zone renders,
**Then** it shows read-only text: *"Improve the ambience of the targeted territory."* (Degrade direction → "Degrade...")

**Given** a player picks Attack,
**When** the Outcome zone renders,
**Then** it shows a `.dt-ticker` with three pills: Destroy / Degrade / Disrupt.

**Given** a player picks Hide/Protect,
**When** the Outcome zone renders,
**Then** it shows read-only text: *"Attempt to protect the asset from attacks this downtime."*

**Given** a player picks Investigate,
**When** the Outcome zone renders,
**Then** it shows read-only text: *"Uncover a secret or mystery about the target."*

**Given** a player picks Patrol/Scout,
**When** the Outcome zone renders,
**Then** it shows read-only text: *"Observe the territory closely for intrusive or adversarial activity."*

**Given** a player picks Support, XP Spend, or Maintenance,
**When** the Outcome zone renders,
**Then** the Outcome zone is hidden entirely.

**Given** a player picks Misc,
**When** the Outcome zone renders,
**Then** it shows a freetext field labelled "Desired Outcome" with prompt: *"State the goal of this project, aiming to achieve one clear thing."*

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.10: Ambience Change consolidation

As a player wanting to change a territory's ambience,
I want a single "Ambience Change" action with an Improve/Degrade ticker, replacing the two separate "Ambience Change increase" and "Ambience Change decrease" actions,
So that direction is a property of the action, not a separate action.

**Implements:** FR22.

**Acceptance Criteria:**

**Given** the action-type dropdown is rendered,
**When** the player browses options,
**Then** the dropdown lists "Ambience Change" (singular); "Ambience Change increase" and "Ambience Change decrease" are NOT listed separately.

**Given** a player picks Ambience Change,
**When** the Target zone renders,
**Then** it shows Territory chips AND a `.dt-ticker` for Improve/Degrade direction.

**Given** the Improve/Degrade ticker first renders,
**When** the block initialises,
**Then** Improve is the default selected direction.

**Given** a player toggles Improve/Degrade,
**When** the direction changes,
**Then** the action description, Approach prompt, and Desired Outcome dynamically reflect the new direction.

**Given** Allies' Ambience action is selected (covered in dtui.15-18),
**When** the merit-action block renders,
**Then** it inherits this consolidated structure — single Ambience action with Improve/Degrade ticker.

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.11: Maintenance action target — chip array

As a player filing a Maintenance action,
I want the Target zone to show a chip grid of my own merits/assets that require maintenance,
So that I select what I'm maintaining without typing or remembering merit names.

**Implements:** FR18 (Maintenance variant).

**Acceptance Criteria:**

**Given** a player picks Maintenance,
**When** the Target zone renders,
**Then** it shows `.dt-chip-grid` (single-select) populated with the character's merits/assets that require chapter-frequency maintenance.

**Given** a chip represents an item already maintained this chapter,
**When** the chip renders,
**Then** it is in disabled state with tooltip: *"Maintained this chapter."*

**Given** a chip represents an item not yet maintained this chapter,
**When** the chip renders,
**Then** it is selectable; clicking selects it as the maintenance target.

**Given** the character has no merits/assets requiring maintenance,
**When** the player picks Maintenance from the dropdown,
**Then** the Target zone shows an empty-state notice (or Maintenance is excluded from the dropdown via filter-to-context).

**Given** filter-to-context is applied,
**When** the chip-grid populates,
**Then** items appear based on character data using effective rating discipline (per CC1).

**Compliance:** CC1, CC2, CC3, CC4, CC9.

---

### Wave 3 — Joint Collaboration Hub

#### Story 1.12: `.dt-joint-panel` auto-expand + stacked chip grids

As a player who wants help on an action,
I want the Joint panel to expand automatically beneath the action block when I tick "Joint", showing two stacked chip grids — one for player invitees, one for my own sphere merits,
So that I can choose whether to bring players, merits, or both, in one clear panel.

**Implements:** UX-DR6, FR31, FR32.

**Acceptance Criteria:**

**Given** a player has Solo/Joint set to Solo,
**When** the action block renders,
**Then** the Joint panel is hidden.

**Given** a player toggles Solo/Joint to Joint,
**When** the toggle changes,
**Then** the Joint panel auto-expands beneath the action block (transition skipped on `prefers-reduced-motion: reduce`).

**Given** the Joint panel is open,
**When** it renders,
**Then** it contains two clearly-labelled chip grids stacked vertically: "Players" (player invitees, multi-select) above "Your Allies and Retainers" (sphere-merit collaborators, multi-select).

**Given** a screen reader is on the form,
**When** the Joint panel state changes,
**Then** the parent block's `aria-expanded` attribute updates accordingly.

**Given** the Joint panel is open,
**When** it is examined for accessibility,
**Then** each chip-grid has its own `aria-labelledby` pointing to its visible heading.

**Compliance:** CC4, CC6, CC7, CC9.

---

#### Story 1.13: Player invitee chip grid behaviour

As a player picking which characters to invite into a Joint action,
I want chips for characters who have no free projects this cycle to be greyed with a tooltip explaining why,
So that I don't waste an invitation on someone unable to join.

**Implements:** FR15.

**Acceptance Criteria:**

**Given** the Joint panel renders the player invitee chip-grid,
**When** chips populate,
**Then** all characters from the roster appear, sorted alphabetically by display name.

**Given** an invitee chip represents a character with at least one free project this cycle,
**When** the chip renders,
**Then** it is in default selectable state.

**Given** an invitee chip represents a character with no free projects remaining this cycle,
**When** the chip renders,
**Then** it is in disabled state with tooltip: *"This player has no free projects this cycle."*

**Given** a player ticks one or more invitee chips,
**When** the form saves,
**Then** the invitations are tracked per the existing invite mechanism (no API change required).

**Given** the chip-grid is multi-select,
**When** the player ticks multiple chips,
**Then** all selections persist; any combination is valid.

**Compliance:** CC1, CC3, CC4, CC9.

---

#### Story 1.14: Sphere-merit auto-commit Support pattern

As a player using my own Allies/Retainers as Support on my own action,
I want ticking a sphere-merit chip in the Joint panel to automatically commit that merit's Support action to this project,
So that I don't have to fill out a separate merit-action form for the same support.

**Implements:** FR33, FR34.

**Acceptance Criteria:**

**Given** the Joint panel renders the sphere-merit chip-grid,
**When** chips populate,
**Then** the player's own Allies, Retainers, and similar sphere merits appear with effective rating dots displayed.

**Given** a sphere-merit chip represents a merit not yet used this cycle,
**When** the chip renders,
**Then** it is in default selectable state.

**Given** a sphere-merit chip represents a merit already committed elsewhere this cycle,
**When** the chip renders,
**Then** it is in disabled state with tooltip: *"This merit's action is already committed elsewhere."*

**Given** a player ticks a sphere-merit chip,
**When** the form saves,
**Then** a Support action entry tied to this project is auto-created using the merit (no separate merit-action form is filled by the player).

**Given** the chip-grid is multi-select,
**When** the player ticks multiple sphere-merit chips,
**Then** each ticked merit auto-commits its Support to this project.

**Compliance:** CC1, CC3, CC4, CC9.

---

#### Story 1.15: Allies action descriptions parity (no Approach field)

As a player configuring an Allies merit-based action,
I want Allies actions to show the same per-action descriptions as Personal Projects (without an Approach field),
So that I learn the action types once and they work the same across contexts.

**Implements:** FR25, FR26.

**Acceptance Criteria:**

**Given** the Allies action-type dropdown renders,
**When** the player browses options,
**Then** the dropdown excludes Scout, Support, and Rumour.

**Given** the Allies action-type dropdown renders,
**When** the player browses options,
**Then** the dropdown includes: Ambience Change, Attack, Hide/Protect, Investigate, Patrol/Scout, Block, Grow, Misc, Maintenance.

**Given** a player picks an Allies action,
**When** the action block renders,
**Then** the `.dt-action-desc` shows the same per-action description copy as Personal Projects (e.g. Attack copy from dtui.6 applies).

**Given** the Allies action block renders,
**When** zones surface,
**Then** the Approach textarea is NOT rendered (Allies actions have no Approach field).

**Given** other zones render in the Allies action block,
**When** they surface,
**Then** Outcome and Target follow the same per-action treatment as Personal Projects (per dtui.8, dtui.9).

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.16: Allies target scoping parity (with Block exception)

As a player configuring an Allies action,
I want Allies' targeting to use the same per-action scoping as Personal Projects, with Block also retaining a freetext field for which merit is targeted,
So that targeting feels consistent and Block keeps its specific semantics.

**Implements:** FR26, FR29.

**Acceptance Criteria:**

**Given** an Allies action other than Block is selected,
**When** the Target zone renders,
**Then** it follows the same per-action scoping as Personal Projects (per dtui.8, dtui.11).

**Given** Allies Block is selected,
**When** the Target zone renders,
**Then** it shows Character `.dt-chip-grid` (single-select) AND a freetext field labelled: *"Which merit are you targeting on this character?"*

**Given** Allies Block is selected,
**When** the Target zone renders,
**Then** Territory and Other variants are NOT available (Block is character-only targeting).

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.17: Allies Ambience eligibility gate

As a player whose Allies merit doesn't meet the Ambience contribution threshold,
I want Ambience to NOT appear as a selectable action in that merit's dropdown,
So that I can't pick an action my merit can't actually perform.

**Implements:** FR27.

**Acceptance Criteria:**

**Given** an Allies merit instance with effective dots ≥ 3 (no Honey with Vinegar),
**When** the action-type dropdown for that merit renders,
**Then** Ambience Change appears as a selectable option.

**Given** the character has the Honey with Vinegar merit AND an Allies merit with effective dots ≥ 2,
**When** the action-type dropdown for that Allies merit renders,
**Then** Ambience Change appears as a selectable option.

**Given** an Allies merit instance with effective dots < 3 (no Honey with Vinegar) OR < 2 (with Honey with Vinegar),
**When** the action-type dropdown for that merit renders,
**Then** Ambience Change is excluded entirely (not greyed — hidden via filter-to-context).

**Given** effective rating discipline (CC1),
**When** the eligibility check runs,
**Then** it uses inherent + bonus dots — never inherent only.

**Compliance:** CC1, CC2, CC9.

---

#### Story 1.18: Allies Ambience contribution display

As a player whose Allies merit qualifies for Ambience,
I want to see exactly how many points my exhaustion of these allies will contribute, dynamically based on my dots and the Improve/Degrade direction,
So that I understand the cost-benefit before committing.

**Implements:** FR28.

**Acceptance Criteria:**

**Given** an Allies merit with effective dots 3-4 selects Ambience with Improve direction,
**When** the contribution display renders,
**Then** it reads: *"You are exhausting these allies for the next game. These allies will count +1 towards the targeted territory's ambience."*

**Given** an Allies merit with effective dots 5 selects Ambience with Improve,
**When** the display renders,
**Then** the value is +2.

**Given** the character has Honey with Vinegar AND Allies effective dots 2-3 selects Ambience with Improve,
**When** the display renders,
**Then** the value is +1.

**Given** Honey with Vinegar AND Allies effective dots 4-5 selects Ambience with Improve,
**When** the display renders,
**Then** the value is +2.

**Given** the player toggles Improve/Degrade,
**When** the direction changes,
**Then** the sign of the contribution flips (+ → -, etc.) and the display updates live without re-render lag.

**Compliance:** CC1, CC4, CC5, CC9.

---

#### Story 1.19: Allies Grow action — XP Spend treatment

As a player wanting to grow a specific Allies merit using XP,
I want a "Grow" action under that Allies merit that inherits the XP Spend treatment, scoped to that specific merit,
So that I have a clear path to growing the merit through downtime.

**Implements:** FR30.

**Acceptance Criteria:**

**Given** the Allies action-type dropdown renders,
**When** the player browses options,
**Then** "Grow" appears as a selectable option.

**Given** a player picks Grow,
**When** the action block renders,
**Then** the block shows the XP Spend pattern: no Target zone, no Approach field, no Outcome zone — only the XP picker.

**Given** the Grow XP picker renders,
**When** it loads options,
**Then** the only target available for the dot purchase is the specific Allies merit instance this action is scoped to (not other merits).

**Given** the player commits a dot purchase via Grow,
**When** the form saves,
**Then** XP cost is calculated per existing rules (`xp.js`); no cost-rate change.

**Compliance:** CC4, CC9.

---

### Wave 4 — Filter-to-Context per Section

#### Story 1.20: Court — Acknowledge Peers grey out non-attendees

As a player acknowledging peers from last game,
I want the chip grid to grey out players who weren't at the last game session, with a tooltip explaining why,
So that I can only acknowledge peers I actually shared the session with.

**Implements:** FR3.

**Acceptance Criteria:**

**Given** Court section renders,
**When** the Acknowledge Peers chip-grid populates,
**Then** all characters appear as multi-select chips.

**Given** a chip represents a character who attended the last game session,
**When** the chip renders,
**Then** it is in default selectable state.

**Given** a chip represents a character who did NOT attend the last game session,
**When** the chip renders,
**Then** it is disabled with tooltip: *"This player wasn't at the last game."*

**Given** the form determines attendance,
**When** the chip-grid populates,
**Then** it reads from the existing `game_sessions` / attendance data store; no new schema introduced.

**Compliance:** CC2, CC3, CC4, CC9.

---

#### Story 1.21: Personal Story — NPC correspondent chips

As a player writing about my character's off-screen NPC interactions,
I want my character's existing NPC correspondents to appear as selectable chips alongside the freetext,
So that I can quickly tag known NPCs without retyping them every cycle.

**Implements:** FR4.

**Acceptance Criteria:**

**Given** a character has at least one NPC correspondent,
**When** Personal Story section renders,
**Then** a `.dt-chip-grid` (multi-select) is shown with the character's NPC correspondents alongside the existing freetext field.

**Given** a character has no NPC correspondents,
**When** Personal Story section renders,
**Then** only the freetext field is shown (no empty chip-grid placeholder).

**Given** a player ticks one or more NPC chips,
**When** the form saves,
**Then** the tagged NPCs are recorded as part of this Personal Story entry per existing schema (`reference_npc_schema.md`).

**Given** existing freetext is preserved,
**When** the player adds chip selections,
**Then** the freetext continues to accept free-form narrative beyond the listed NPCs.

**Compliance:** CC2, CC4, CC5, CC9.

---

#### Story 1.22: Mandragora visibility + Vitae Projection calc

As a player whose character has the Mandragora Garden merit,
I want the Mandragora checkbox to appear (and the Vitae Projection to calculate correctly),
So that the form treats Mandragora consistently with how the merit actually works.

**Implements:** FR5, FR6.

**Acceptance Criteria:**

**Given** a character has the Mandragora Garden merit (effective rating ≥ 1),
**When** Blood Sorcery section renders,
**Then** the Mandragora Garden checkbox is visible in that section.

**Given** a character does NOT have the Mandragora Garden merit,
**When** Blood Sorcery section renders,
**Then** the Mandragora Garden checkbox is hidden entirely.

**Given** the Mandragora Garden checkbox is checked,
**When** the Vitae Projection panel renders,
**Then** the Mandragora Garden contribution line uses the same calculation logic as the feeding roll's Mandragora handling — using effective dots, never inherent only.

**Given** effective rating discipline applies,
**When** any Mandragora-related calculation runs,
**Then** it reads inherent + bonus dots per CC1.

**Compliance:** CC1, CC2, CC4, CC9.

---

#### Story 1.23: Feeding territory relocation + grouping

As a player filling out the feeding section,
I want the territory selector to be in Feeding directly below the dice pool, grouped with Blood Type and Method of Feeding as three consistent tickers,
So that all my feeding choices live together in one clear set.

**Implements:** FR7, FR8.

**Acceptance Criteria:**

**Given** the form renders,
**When** the player views the Territory & Influence section,
**Then** the territory feeding-pill selector is NO LONGER present in that section.

**Given** the form renders,
**When** the player views the Feeding section,
**Then** the territory selector appears directly below the feeding dice pool.

**Given** the Feeding section renders,
**When** zones surface,
**Then** Territory + Blood Type + Method of Feeding appear as three consecutive `.dt-ticker`s with consistent styling.

**Given** Blood Type was previously rendered with checkboxes,
**When** the Feeding section renders,
**Then** Blood Type is now a `.dt-ticker` (Animal / Human / Kindred), replacing the checkboxes.

**Given** the Influence-spend portion of Territory & Influence is preserved,
**When** the player views Territory & Influence,
**Then** influence-spend-related controls remain intact (no scope creep into influence-spend mechanics).

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.24: Feeding — Method of Feeding label rename

As a player picking how my character feeds,
I want the violent option to be clearly labelled "The Assault (violent)" alongside "The Kiss (subtle)",
So that the labels match the in-fiction terminology consistently.

**Implements:** FR9.

**Acceptance Criteria:**

**Given** the Method of Feeding ticker renders,
**When** the player views the options,
**Then** the labels are: "The Kiss (subtle)" and "The Assault (violent)".

**Given** the legacy "Violent" label is removed,
**When** the form persists data,
**Then** existing data with "Violent" or "violent" enum values continues to read correctly via back-compat (rename surfaces only the label, not the underlying enum).

**Compliance:** CC5, CC9.

---

#### Story 1.25: Rote panel ordering + selectors

As a player committing a project for Rote feeding,
I want the Rote panel to appear after "Describe how your character hunts" and to include the same three feeding selectors (Territory, Blood Type, Method) as a normal feed,
So that the Rote feed has the same level of mechanical specification.

**Implements:** FR10, FR11.

**Acceptance Criteria:**

**Given** the Feeding section renders,
**When** the player scrolls through it,
**Then** "Commit a Project action for Rote quality on this hunt" checkbox appears AFTER the "Describe how your character hunts" textarea.

**Given** the Rote checkbox is ticked,
**When** the panel expands,
**Then** the panel contains: existing Attribute / Skill / Discipline selectors, existing "Describe your dedicated feeding effort" textarea, AND new Territory ticker, Blood Type ticker, Method of Feeding ticker.

**Given** the Rote panel's three new tickers render,
**When** they initialise,
**Then** they are independent from the main feeding tickers (player can rote-feed in a different territory than they normally feed in).

**Compliance:** CC4, CC5, CC9.

---

### Wave 5 — Orientation Chrome

#### Story 1.26: `.dt-progress-rail` sticky sidebar

As a player working through a long downtime form,
I want a sticky right-edge sidebar showing each section with completion status,
So that I can see at a glance where I am and how much is left.

**Implements:** UX-DR7, FR38.

**Acceptance Criteria:**

**Given** the form renders on a viewport ≥1280px,
**When** the layout initialises,
**Then** the `.dt-progress-rail` is rendered as a sticky sidebar at the right edge with width 220px.

**Given** the form renders on a viewport 1024-1279px,
**When** the layout initialises,
**Then** the `.dt-progress-rail` width is 180px.

**Given** the progress rail renders,
**When** sections are listed,
**Then** each section shows: name + state indicator. States: Incomplete (muted), In progress (gold3 + underline), Complete (gold2 + ✔), Current (gold1 + ●), Disabled (hidden).

**Given** a section is gated and doesn't apply to this character,
**When** the rail renders,
**Then** that section is excluded entirely from the rail (not shown as disabled).

**Given** a player clicks a section name in the rail,
**When** the click fires,
**Then** the form scrolls to that section and expands it (smooth scroll except under `prefers-reduced-motion`).

**Given** a screen reader is on the form,
**When** it encounters the rail,
**Then** the rail is a `<nav aria-label="Form progress">` and the currently-active item has `aria-current="step"`.

**Compliance:** CC4, CC5, CC6, CC7, CC9.

---

#### Story 1.27: `.dt-save-status` enhancement

As a player writing in the form for 30+ minutes,
I want a visible, trustworthy auto-save indicator anchored in form chrome,
So that I never wonder if my work is being saved.

**Implements:** UX-DR8, UX-DR11, FR39.

**Acceptance Criteria:**

**Given** the form renders,
**When** the layout initialises,
**Then** the `.dt-save-status` element is anchored visibly in form chrome (header or progress rail), NOT buried inside a section.

**Given** auto-save is idle,
**When** the indicator renders,
**Then** it is empty or shows "Saved" with a timestamp.

**Given** auto-save is in progress (saving to server),
**When** the indicator renders,
**Then** it shows "Saving…" with a subtle pulse animation (skipped on `prefers-reduced-motion`).

**Given** auto-save completes successfully,
**When** the indicator updates,
**Then** it transitions from "Saving…" to "Saved" cleanly.

**Given** auto-save fails,
**When** the indicator updates,
**Then** it shows "Save failed — retrying" with `--crim` accent.

**Given** the existing DTU-2 restore-from-localStorage banner pattern,
**When** a draft is restored,
**Then** the one-shot banner displays above the form (existing behaviour preserved).

**Given** a screen reader is on the form,
**When** save state changes,
**Then** the change is announced via `aria-live="polite"`.

**Compliance:** CC4, CC5, CC6, CC7, CC9.

---

### Wave 6 — Form Polish

#### Story 1.28: Landing page "ST Portal" rename + admin redirect

As a Storyteller arriving at the landing page,
I want the second button to be labelled "ST Portal" and link directly to admin.html (gated by Discord OAuth),
So that I get to my actual workspace and the broken `/player` redirect is removed.

**Implements:** FR1.

**Acceptance Criteria:**

**Given** the landing page (index.html) renders,
**When** the user views the buttons,
**Then** the second button is labelled "ST Portal" (renamed from "Player Portal").

**Given** the user clicks "ST Portal",
**When** the click fires,
**Then** the link navigates to `admin.html`.

**Given** the user is not authenticated as ST,
**When** they reach `admin.html`,
**Then** the existing Discord OAuth gate intercepts and prompts for login (no logic change in OAuth flow).

**Given** the visual treatment of the button,
**When** the page renders,
**Then** the existing button styling is preserved (no visual regression).

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.29: Mobile redirect → desktop-only notice

As a player visiting the downtime form on mobile,
I want to see a clear "best on desktop" notice instead of being redirected to a broken page,
So that I understand the form requirement and know to come back at my computer.

**Implements:** NFR1, FR2.

**Acceptance Criteria:**

**Given** a browser viewport width is <1024px,
**When** the form route loads,
**Then** the form is NOT rendered.

**Given** the viewport is <1024px,
**When** the form route loads,
**Then** a notice page renders with copy: "This form works best on desktop. Open this page at your computer to continue."

**Given** the notice page renders,
**When** the user views it,
**Then** it uses TM Suite design system (parchment surface, gold text per CC4).

**Given** the legacy `/player` redirect is removed,
**When** mobile users visit the form,
**Then** they are NOT redirected to the defunct `/player` URL.

**Given** the viewport is ≥1024px,
**When** the form route loads,
**Then** the form renders normally (no notice).

**Compliance:** CC4, CC5, CC6, CC9.

---

#### Story 1.30: Submit button placement (bottom, not sticky)

As a player submitting my downtime,
I want the Submit button at the bottom of the form (scroll-to-reach), not sticky always-visible,
So that submission is a deliberate gesture, not an accidental click during scrolling.

**Implements:** FR35.

**Acceptance Criteria:**

**Given** the form renders,
**When** the layout initialises,
**Then** the Submit button is rendered at the bottom of the form within the existing `.qf-actions` block.

**Given** the player scrolls,
**When** they observe the Submit button's behaviour,
**Then** it is NOT sticky (no `position: sticky` or `position: fixed`); it scrolls with the page content.

**Given** the Submit button uses the primary tier styling,
**When** it renders,
**Then** it has `--gold2` filled background and dark `--bg` text per CC9 button hierarchy.

**Given** the Save Draft button exists alongside,
**When** the layout initialises,
**Then** Save Draft retains its existing position and styling (secondary tier).

**Compliance:** CC4, CC5, CC9.

---

#### Story 1.31: Add-project button placement (below last block)

As a player wanting to add another project,
I want the "Add another project" button rendered below the last project block, with the remaining slot count visible,
So that I always know where to click and how many slots I have left.

**Implements:** FR36.

**Acceptance Criteria:**

**Given** the Personal Projects section renders with at least one project block,
**When** the layout initialises,
**Then** the "Add another project" button is rendered immediately below the LAST project block.

**Given** the button renders,
**When** the player views it,
**Then** the button label shows the remaining slot count: "Add another project (X of Y used)".

**Given** the player has used all available project slots,
**When** the button renders,
**Then** it is in disabled state with tooltip: *"You've used all your project slots this cycle."*

**Given** the button uses the secondary tier styling,
**When** it renders,
**Then** it has `--surf2` outlined background and `--gold2` text per CC9 button hierarchy.

**Compliance:** CC3, CC4, CC5, CC9.

---

#### Story 1.32: Section accordion dirty-stays-open

As a player mid-edit who triggers an auto-save re-render,
I want any section with unsaved changes to stay expanded across the re-render,
So that my work isn't hidden behind a collapsed accordion mid-thought.

**Implements:** FR37.

**Acceptance Criteria:**

**Given** a section accordion is in default state,
**When** the form first renders,
**Then** the section is collapsed.

**Given** a player clicks to expand a section,
**When** the click fires,
**Then** the section opens (existing behaviour preserved).

**Given** a section is open AND has dirty (unsaved) input in any of its fields,
**When** the form re-renders (e.g. on auto-save or state update),
**Then** the section remains expanded across the re-render.

**Given** a section is open but has no dirty input,
**When** the form re-renders,
**Then** the section may collapse per existing behaviour (no behaviour change for clean sections).

**Given** an open expanded section preserves its state across re-render,
**When** the player views the form,
**Then** there is no visible layout jump or scroll position change.

**Compliance:** CC4, CC9.
