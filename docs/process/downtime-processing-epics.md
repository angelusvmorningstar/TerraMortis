# Downtime Processing — Epic & Story Breakdown

## Context

Processing mode currently covers Steps 1–8 (action-by-action mechanical resolution). The full ST workflow also requires reading player intent before processing, drafting narrative responses, reviewing XP declarations, and staging everything for simultaneous release at the next game cycle push.

Those steps are either absent from processing mode or buried in the submission card expanded view, which forces STs to move between two views to complete a single submission.

The goal is a complete end-to-end processing workflow that never requires leaving processing mode.

---

## What Already Exists

| Feature | Location | Notes |
|---------|----------|-------|
| Processing queue Steps 1–8 | Processing mode | Phase-based action processing |
| Per-action ST Response | Processing queue (feature.66) | `st_response`, draft/reviewed status, author |
| Narrative panel (4 blocks) | Submission cards only | `renderNarrativePanel()`, saves to `st_review.narrative[key].{text,status}` |
| Approval controls | Submission cards only | `renderApproval()`, saves `approval_status` + `resolution_note` |
| Expenditure panel | Submission cards only | Vitae/WP/Influence number inputs |
| Publish panel | Submission cards only | `outcome_visibility`: hidden → ready → published |
| Player responses | Submission cards only | `renderPlayerResponses()` — Court, Vamping, Lore |
| Territories at a Glance | Processing mode | Matrix panel, territory pill selectors |
| Submission checklist | Processing mode | Completion tracking per submission |

---

## Epic 1: Pre-read — Player Intent Visible Before Processing

**Goal:** STs can read all qualitative player responses in processing mode before touching a single action. Currently these are only accessible by expanding a submission card.

**Sections surfaced:**
- Court: game recount, travel, trust/harm, aspirations, Dear X (correspondence), shoutout picks
- Vamping
- Lore request

All read-only. Source: `renderPlayerResponses()` logic, pulled into processing mode.

---

### Story 1.1 — Pre-read panel per submission in processing mode

**As a** Storyteller,
**I want** to see each player's qualitative responses (Court, Vamping, Lore) in processing mode before I begin resolving actions,
**So that** I understand their intent and context before I touch a single dice pool.

**Acceptance Criteria:**

**Given** processing mode is active and submissions are loaded
**When** the ST views the processing queue
**Then** each submission has a collapsible pre-read block above its action steps, labelled with the character name
**And** the block is collapsed by default
**And** expanding it shows: game recount, travel, trust, harm, aspirations, correspondence (Dear X), shoutout picks, vamping — each with its label
**And** fields with no content are omitted (not shown as blank)
**And** the block is read-only — no editing in this view

---

### Story 1.2 — Lore request flagging

**As a** Storyteller,
**I want** to mark a player's lore request as responded,
**So that** I can track which questions have been answered before the cycle closes.

**Acceptance Criteria:**

**Given** a submission has a non-empty lore request
**When** the lore request is visible in the pre-read block
**Then** a "Responded" toggle appears beside it
**And** toggling it saves `st_review.lore_responded: true` to the submission
**And** the toggle state persists on re-render
**And** submissions with an unanswered lore request show a small indicator on their card header

---

## Epic 2: Narrative Drafting as a Processing Step

**Goal:** STs can draft all four narrative outputs per character in processing mode. The data layer (`st_review.narrative[key].{text, status}`) and UI (`renderNarrativePanel`) already exist — this epic surfaces them in the right place.

**Four narrative blocks:**
- Letter from Home — reply from an NPC to the character; character moments only, no plot hooks
- Touchstone Vignette — second person, present tense; in-person contact with a living mortal; first referent cannot be a pronoun
- Territory Report — what the character observed in their operating territory this cycle
- Intelligence Dossier — general intel by sphere, Cacophony Savvy, mystical visions, rumours; check investigation thresholds before revealing

---

### Story 2.1 — Narrative panel in processing mode

**As a** Storyteller,
**I want** to draft narrative outputs for each character within processing mode,
**So that** I can write responses without switching to the submission card view.

**Acceptance Criteria:**

**Given** processing mode is active
**When** the ST views a submission's processing panel
**Then** a Narrative Output section appears below the action steps for that submission
**And** it contains all four narrative blocks (Letter from Home, Touchstone Vignette, Territory Report, Intelligence Dossier)
**And** each block shows its hint text, a textarea, and draft/ready toggle buttons
**And** saving and status toggling work identically to the existing submission card implementation
**And** the existing `narrativeComplete` badge on the submission card header updates to reflect changes made here

---

### Story 2.2 — Per-action responses visible as narrative reference

**As a** Storyteller,
**I want** to see the per-action ST responses I already wrote when drafting the overall narrative,
**So that** the narrative is consistent with the mechanical outcomes I recorded.

**Acceptance Criteria:**

**Given** the Narrative Output section is visible for a submission
**When** the ST opens it
**Then** a collapsed "Action responses" reference panel appears above the four narrative blocks
**And** expanding it shows each action's title and its saved `st_response` text (read-only)
**And** actions with no saved response are omitted

---

### Story 2.3 — Narrative completion blocks final sign-off

**As a** Storyteller,
**I want** the "Mark ready" button to be unavailable until all four narrative blocks are marked ready,
**So that** no submission is accidentally staged for release with incomplete narratives.

**Acceptance Criteria:**

**Given** a submission has one or more narrative blocks still in draft status
**When** the ST views the final sign-off controls (Epic 4)
**Then** the "Mark ready" button is disabled
**And** a tooltip lists which blocks are still in draft
**And** once all four blocks are marked ready the button becomes active

---

## Epic 3: XP Review

**Goal:** STs can review and approve XP declarations before the cycle push. There are two surfaces: the `xp_spend` grid (structured Admin section — all purchases) and `project_N_xp_trait` (project-linked justification).

**Rule:** Any single trait can only increase by one dot per month. Higher-dot increases require both XP and a downtime action.

---

### Story 3.1 — XP declarations panel in processing mode

**As a** Storyteller,
**I want** to see every XP spend declaration for a submission in one place during processing,
**So that** I can validate purchases before they are approved and released.

**Acceptance Criteria:**

**Given** processing mode is active and a submission has an `xp_spend` grid entry
**When** the ST views that submission
**Then** an XP Review section appears showing each row of the xp_spend grid: category, item name, XP cost
**And** each row indicates whether it is linked to a project action (shows project slot number and action type) or has no action backing ("no downtime action")
**And** rows with no action are visually distinguished (muted colour or label)

---

### Story 3.2 — Per-project XP trait visible in action detail

**As a** Storyteller,
**I want** to see the XP trait attached to a project action when I expand it in the processing queue,
**So that** I can assess whether the XP purchase is justified by the project at the same time as I validate the dice pool.

**Acceptance Criteria:**

**Given** a project action is expanded in the processing queue
**When** that project has a non-empty `project_N_xp_trait` field
**Then** the trait name and cost are shown in the action detail panel (read-only)
**And** this is displayed alongside the roll result and outcome, not in a separate section

---

### Story 3.3 — XP approval per declaration

**As a** Storyteller,
**I want** to mark each XP spend row as approved or flagged,
**So that** I have a record of which purchases were signed off before the push.

**Acceptance Criteria:**

**Given** the XP Review section is visible for a submission
**When** the ST reviews a row
**Then** Approved / Flagged toggle buttons are available per row
**And** selecting Flagged reveals a note field for the reason
**And** state saves to `st_review.xp_approvals[idx]: { status: 'approved'|'flagged', note: string }`
**And** a summary badge shows "N of M approved" on the XP Review section header

---

## Epic 4: Final Sign-off Step

**Goal:** After actions are processed and narratives drafted, STs can approve a submission and stage it for release — entirely within processing mode.

Currently `renderApproval()` and `renderPublishPanel()` are only on submission cards.

---

### Story 4.1 — Approval controls in processing mode

**As a** Storyteller,
**I want** to set the approval status and write a resolution note for a submission within processing mode,
**So that** I do not need to open the submission card to record the final decision.

**Acceptance Criteria:**

**Given** processing mode is active and a submission's action steps are visible
**When** the ST scrolls to the bottom of that submission's panel
**Then** approval buttons (pending / approved / modified / rejected) appear
**And** a resolution note textarea appears below (visible to player when released)
**And** selecting a status saves via the existing `handleApproval()` logic
**And** the submission card header badge updates to reflect the new status

---

### Story 4.2 — Mark ready button in processing mode

**As a** Storyteller,
**I want** to stage a submission for release directly in processing mode once it is complete,
**So that** the full workflow from action review to release staging happens in one place.

**Acceptance Criteria:**

**Given** a submission is approved or modified and all four narrative blocks are ready
**When** the ST views the sign-off section of that submission in processing mode
**Then** a "Mark ready" button is available
**And** clicking it sets `st_review.outcome_visibility: 'ready'`
**And** the button changes to a "Ready" state indicator and is no longer clickable
**And** a "Revert to draft" link appears to undo staging if needed

**Given** one or more preconditions are not met (not approved, narrative incomplete, XP flagged rows outstanding)
**When** the ST views the sign-off section
**Then** the "Mark ready" button is visible but disabled
**And** a tooltip lists the outstanding items

---

### Story 4.3 — Per-submission status visible in processing queue

**As a** Storyteller,
**I want** to see the processing completion state of each submission at a glance in the queue,
**So that** I can tell who still needs work without expanding each submission.

**Acceptance Criteria:**

**Given** processing mode is active
**When** the ST views the list of submissions
**Then** each submission header row shows a compact status indicator: actions resolved count, narrative ready/draft, approval status, and ready/published badge
**And** these update in place when state changes without re-rendering the full queue

---

## Epic 5: Submission Card Streamline

**Goal:** Submission cards (non-processing mode) are simplified now that processing mode handles the full workflow. Cards become a lightweight status and reference view only.

**Dependency:** Epics 1–4 must be complete before this work begins.

---

### Story 5.1 — Remove mechanically redundant panels from expanded cards

**As a** Storyteller,
**I want** expanded submission cards to no longer duplicate content that lives in processing mode,
**So that** there is one authoritative place for each piece of information.

**Acceptance Criteria:**

**Given** a submission card is expanded
**When** the ST views it
**Then** the following panels are no longer rendered: Projects panel, Feeding detail, Merit Actions panel, Narrative panel, Approval controls, Publish panel
**And** all functionality formerly in those panels is accessible in processing mode (Epics 1–4)

---

### Story 5.2 — Retain reference-only content on cards

**As a** Storyteller,
**I want** expanded submission cards to still show reference information that is useful outside of processing mode,
**So that** cards remain a useful quick-lookup tool.

**Acceptance Criteria:**

**Given** a submission card is expanded
**When** the ST views it
**Then** the following remain: Player Responses (read-only), Mechanical Summary, Expenditure panel (Vitae/WP/Influence), Export packet button, ST Notes

---

### Story 5.3 — Card header as status summary

**As a** Storyteller,
**I want** submission card headers to show a richer status summary,
**So that** I can assess where each submission is at a glance without expanding it.

**Acceptance Criteria:**

**Given** submissions are listed in non-processing mode
**When** the ST scans the card list
**Then** each card header shows: character name, approval status badge, narrative ready badge (all 4 blocks done), XP approved badge (all rows approved), action count, ready/published badge
**And** these badges reflect live state and update when processing mode makes changes

---

## Epic Sequencing

| Epic | Depends on | Estimated size |
|------|-----------|----------------|
| Epic 1 — Pre-read | Nothing | Small (render only, no new data) |
| Epic 2 — Narrative step | Nothing | Small (surface existing code) |
| Epic 3 — XP review | Nothing | Medium (new panel + approval state) |
| Epic 4 — Sign-off step | Epic 2 (narrative gating) | Small (surface existing code) |
| Epic 5 — Card streamline | Epics 1–4 complete | Small (removal work) |

Epics 1, 2, and 3 can be worked in parallel. Epic 4 should follow Epic 2. Epic 5 goes last.
