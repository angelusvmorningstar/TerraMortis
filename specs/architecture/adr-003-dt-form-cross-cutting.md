---
id: ADR-003
title: 'DT submission form - Minimal/Advanced mode, soft-submit lifecycle, universal character picker'
status: approved
date: 2026-05-06
author: Winston (Architect)
revision: 3
supersedes: null
related:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/architecture/adr-002-territory-fk.md
  - specs/architectural-reset-charter.md (lifted 2026-05-06; diagnostic content retained)
  - public/js/tabs/downtime-form.js (the file under remediation)
  - public/js/tabs/downtime-data.js (DOWNTIME_SECTIONS source)
  - public/js/data/game-xp.js (Game-XP attendance linkage)
  - server/schemas/downtime_submission.schema.js (the contract this ADR amends)
  - server/schemas/game_session.schema.js (the second artefact auto-flips touch)
  - In-session task list, items #13 (this ADR) through #33 (per-section redesign tasks)
---

# ADR-003 - DT submission form cross-cutting decisions

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-05-06 | Initial draft. Three intertwined cross-cutting concerns scoped together because the per-section redesign stories cannot be properly written until these answers are recorded. Audit, decisions, story-mapping, open questions. | Winston (Architect) |
| 2 | 2026-05-06 | Q3 recommendation flipped from Option A (ratchet) to Option B (hard mirror) per Piatra resolution. Reasoning: hard mirror is the cleaner mental model, surfaces vandalism/incomplete-state visibly via existing negative-`xpLeft()` UI, drops the `downtime_awarded_xp_at_cycle` schema field, and matches the verbatim model Piatra articulated in chat ("submitted:true flips as required back and forth to match a 'has_minimum_input_in_form' bool"). Three UI affordances added as story #17 acceptance criteria to make hard mirror honest rather than abrupt: banner-when-incomplete, XP-Available delta annotation, negative-XP-Left treatment. Q4 amended to match. Resolutions table populated for Q3, Q4. | Winston (Architect) |
| 3 | 2026-05-06 | All remaining open questions resolved by Piatra in chat. Q1 mode-switch preserves entered data. Q2 MINIMAL set confirmed as recommended (court + reduced personal_story + simplified feeding + 1 project + regency-if-regent). Q5 form-rating widget is optional, not required. Q6 picker carries `excludeIds` parameter from day one. Q7 no server-side enforcement now. Q8 `isMinimalComplete()` lives in its own module (Piatra noted "separate module seems excessive but I'm fine with it"). Q9-Q12 confirmed as recommended. Status promoted from `draft` to `approved`. Story #14 (sign-off) closes; story #15 (epic decomposition) is unblocked. | Winston (Architect) |

## Context

The DT submission form (`public/js/tabs/downtime-form.js`, plus its section helpers) has accumulated chrome that obscures the minimum a player must supply to participate in a cycle, while simultaneously asking them to make architectural choices (single vs dual roll, MODE, SUPPORT) that should not surface in-form. The remediation document Piatra captured on 2026-05-06 (the DT-form notes pasted into chat that produced tasks #1-#33) lists ~30 changes. Three of those changes are not section-local - they reshape the form's whole interaction model:

1. **A Minimal/Advanced mode selector** that gates how much of the form a player sees and is held to.
2. **An auto-save / auto-submit / auto-XP lifecycle** that retires the manual "Submit Downtime" button as the gate that decides whether a player gets credit for participating.
3. **A universal character picker component** that replaces four divergent character-selection UIs scattered across sections.

These three are intertwined. The mode selector decides *what* gets validated as "complete"; the soft-submit lifecycle decides *when* completion translates to player-visible reward (the XP-this-cycle-spendable benefit); the character picker is consumed by sections whose shape depends on whether they're rendered in Minimal or Advanced. Filing per-section stories before settling these three would force every section author to invent local answers to the same questions, which is exactly the AI-vibe-coded-divergence pattern the architectural-reset charter named in its diagnosis.

This ADR is being authored after the architectural-reset freeze was lifted on 2026-05-06. The lift's status header in `specs/architectural-reset-charter.md` records the procedural reasons and invites Angelus to comment on contested decisions via ADR. **This ADR is one of those invitations.** The recommendations below carry author conviction but are explicitly open for Angelus's response on the same artefact.

### Why this matters

Three findings make the cross-cutting scoping non-optional:

1. **The form is sub-functional during a live cycle.** Twenty-eight of the thirty players will see this form within the next cycle window. A 35-section maximalist form with redundant chrome (Save Draft button that duplicates auto-save, MODE/SUPPORT selectors no rule actually consumes, single-vs-dual roll choice that should be derived) burns trust that is one-shot per player. The freeze charter (Part 3, John) named player trust as *the actual product*; the diagnosis applies in reverse here too.
2. **The "complete enough to count" threshold is currently nowhere.** A player who supplies feeding + game recount and stops there has, today, no signal that they have done enough; they must click "Submit Downtime" to flip workflow state, which awards no XP because Game-XP is gated on a separate `attendance[i].downtime` boolean the ST manually flips later. Two systems-of-record describing the same bool, neither aware of the other.
3. **Character selection has drifted to four implementations.** `dt-flex-char-sel` single-select, `dt-chip` button grid multi-select, checkbox grid for project cast, last-game-attendees subset filter - each invented locally as the section author needed it. This is the same pattern the charter audit named ("AI has vibe-coded several competing and duplicate implementations of things that should be consistent helper functions") in a smaller blast radius.

### Audit baseline (read-only probe of HEAD, 2026-05-06)

#### Section list

`DOWNTIME_SECTIONS` in `public/js/tabs/downtime-data.js:171` declares 11 top-level sections:

| Key | Title (display) | Notes |
|---|---|---|
| `court` | Court: Last Game | Game recount + travel + RP shoutout. Player-narrative. |
| `personal_story` | Personal Story | Currently expansive; remediation reduces to Touchstone OR Correspondence binary (task #18). |
| `blood_sorcery` | Blood Sorcery | Crúac/Theban; conditional on rituals owned. Remediation reorders (task #27). |
| `territory` | City: Territory and Influence | Territory pulse + influence spend. |
| `feeding` | Feeding: The Hunt | Territory + method + blood type + violence-mode. Includes ROTE hunt as secondary. |
| `regency` | Regency Actions | Conditional on regent status. Confirms feeding rights. |
| `projects` | Projects: Personal Actions | 4 slots in current code. Each slot has action-type + dice pool + cast + merits. Action types: ambience-increase/decrease, attack, feed, hide-protect, investigate, patrol-scout, support, xp-spend, misc. |
| `acquisitions` | Acquisition: Resources and Skills | Resource buys + skill buys. Skill bug (ATTR-in-pool) is task #5; redesign is task #29. |
| `equipment` | Equipment: Items and Gear | Hidden for this DT cycle per task #30. |
| `vamping` | Vamping: Fever for the Flavour | Aspirations + vamping prompts. |
| `admin` | Admin: Crunching the Numbers | XP spend + lore request + form rating + form feedback. Removed (admin-section retired, modal-on-submit takes its place) per task #31. |

The remediation MINIMAL set per Piatra's notes is: Court, Personal Story (reduced), Feeding, 1 Personal Action, plus Regency conditionally for regents.

#### Save lifecycle (current)

```
keystroke
  └─ scheduleSave()                                  downtime-form.js:144
      ├─ 800ms  → _saveLocalSnapshot()  (localStorage mirror)
      └─ 2000ms → saveDraft()           (server PUT)

saveDraft()                                          downtime-form.js:777
  ├─ if no doc:  POST /api/downtime_submissions { status: 'draft' }
  └─ if doc:     PUT  /api/downtime_submissions/:id { responses }

submitForm() (the manual button handler)             downtime-form.js:~1100
  ├─ POST or PUT with status: 'submitted'
  └─ submitted_at timestamp set
```

The 'Save Draft' button at `#dt-btn-save` (event handler at `downtime-form.js:2804`) calls `saveDraft()` directly - the same function the 2s debounce calls. The button is a redundant explicit-save shortcut. Bug #7 in the remediation list ("Save Draft button does nothing") is about this button's status indicator not being visible to the player; the function itself works. Peter's call: remove the button, keep the auto-save.

#### Submission status (current)

`downtime_submissions.status`: enum `'draft' | 'submitted'`. Manually flipped by submit button. Player can edit after submission ("you can keep editing until the deadline" message at line 1541). Note that *post-submission edits already work today* - the workflow state flip is purely permission/visibility, not editing-lock.

#### Game-XP linkage (current)

`game_sessions.attendance[i]` carries `attended`, `costuming`, `downtime`, `extra` booleans/numbers (see `public/js/data/game-xp.js:29`). XP formula: `(attended ? 1 : 0) + (costuming ? 1 : 0) + (downtime ? 1 : 0) + (extra || 0)`. The `downtime` flag is currently set by the ST in the admin attendance UI, not auto-derived from the player's `downtime_submissions.status`. Two fields, two sources of truth, manual reconciliation. This is the bug the auto-XP ask is fixing - one source of truth, both artefacts derived from it.

#### Character-picker sites (current)

Surveyed in `public/js/tabs/downtime-form.js` HEAD:

| Pattern | Locator | Cardinality | Source list |
|---|---|---|---|
| `<select class="qf-select dt-flex-char-sel">` | `:4817` | single-select | All-character names |
| `<button class="dt-chip" data-project-target-char>` | `:5000` | single-select via chips | All-character names |
| Checkbox grid for project cast | `:508`, `:2367` | multi-select | All-character names |
| Attendees subset (last-game RP shoutout) | `:1332` | single-select | Game-session attendees only |
| `<select id="reg-slot-N">` (regency tab, but consumed in DT context) | `regency-tab.js:192-199` | single-select | All-character names |

Five render shapes, two source-list modes (`ALL_CHARACTERS` and `ATTENDEE_CHARACTERS_FOR_LAST_GAME`). Five shapes is too many for one form to maintain consistently; the divergence is already producing UX inconsistency reports (Piatra's notes call it out twice).

## Decision

This section answers Q1-Q6 from task #13. Each subsection is a recommendation with reasoning. Resolutions section at the end of the ADR records Piatra's calls and any Angelus response.

### Q1 - Mode selector: scope and persistence

**Recommendation: top-of-form selector, persisted on the submission document, defaulting to MINIMAL on a fresh submission.**

Field: `responses._mode = 'minimal' | 'advanced'`. Default `'minimal'`. Persists with the submission like any other response. When the player switches to ADVANCED, additional sections render but their existing values (if any) are preserved.

Rationale:
- Per-character persistence beats per-cycle because a player's preference is a player property, not a cycle property; storing it on the submission is the simplest way to round-trip without adding a new collection.
- Default-MINIMAL because the cost of a new player landing on the maximalist form and bouncing is higher than the cost of an experienced player needing one click to expand.
- Storing it in `responses._mode` (underscore-prefixed) follows the existing convention for non-question metadata (`_feed_method`, `_feed_disc` already use this).

Open knob: when a player switches MINIMAL → ADVANCED, do their previously-collapsed-but-filled fields stay or clear? Recommendation: stay (preserves work; the cost of a stray field is zero because the section is rendered). If Piatra wants strict MINIMAL hygiene (only-MINIMAL-fields-saved-when-MINIMAL), say so and we'll add a clear-on-switch.

### Q2 - MINIMAL set composition

**Recommendation: Court, Personal Story (reduced), Feeding (simplified), Projects (1 slot only), and Regency (only if `is_regent === 'yes'`).**

The `is_regent` gate is already auto-detected from territory ownership (`downtime-form.js:1337`) so this branch costs nothing.

Per-section behaviour in MINIMAL:

| Section | MINIMAL state | Source of remediation |
|---|---|---|
| court | Full section as today; this is already the minimum game-recount | task #18 leaves court alone |
| personal_story | Reduced to binary Touchstone-or-Correspondence with one text input | task #18 |
| feeding | Simplified Feeding Form variant; auto-pick best dice pool; territory + method + blood type + violence + description | task #20 |
| projects | One slot rendered; ADVANCED renders all four | task description on task #17 |
| regency | Rendered only if regent; confirmation UI per task #23 | task #23 |
| All others | Hidden in DOM (not rendered, not validated) | n/a |

Rationale:
- The MINIMAL set is exactly the minimum required to be considered a complete submission per Piatra's notes. No more (no XP-spend gating, no acquisitions, no admin ratings) and no less (no skipping the recount).
- Sections hidden in MINIMAL are *not rendered*, not just `display:none`. This avoids the "invisible-but-validated" failure mode where a hidden field has stale data that fails validation.

### Q3 - "Submitted" as a derived bool, not a workflow state

**Recommendation: replace the `draft | submitted` workflow string with a `responses._has_minimum bool` derived continuously from the form, and let `submitted` (and `attendance[i].downtime`) become reactive mirrors.**

The pattern (Piatra confirmed in chat 2026-05-06):

```
on every save:
  has_minimum = isMinimalComplete(responses)
  if has_minimum != prev_has_minimum:
    // flip server-side, idempotent both directions
    PATCH /api/downtime_submissions/:id { status: has_minimum ? 'submitted' : 'draft' }
    PATCH /api/game_sessions/.../attendance/:char_id { downtime: has_minimum }
```

Where `isMinimalComplete(responses)` is a single function returning a boolean from the form state. It encodes the MINIMAL-completeness rules from Q2 and is the *one* source of truth for "this player has done enough this cycle."

Rationale:
- Workflow strings encode imagined state machines that real users don't match. Players type, look at their phone, come back and untype. The state should mirror the form, not assume a one-way ratchet.
- Two reactive mirrors (`submission.status`, `attendance.downtime`) means one bug class disappears: the "ST and player disagree about who's submitted" reconciliation work disappears because there is nothing to reconcile.
- **Cycle close is the only true seal.** `cycle.status === 'closed'` makes both flags read-only. This is the contract that lets us be casual about flip-back; the casualness terminates at cycle close.

The XP-already-spent edge case: a player flips to has_minimum, gets +1 Game-XP, spends it on a +1 Strength purchase (in the same cycle's XP-Spend personal action), then deletes their game recount and the bool flips back. *What happens to the +1 XP?*

**Decision: hard mirror.** `attendance.downtime` flips both ways with `_has_minimum`. When the bool flips back to false, XP-Available drops by 1 immediately. If the player had already spent it, `xpLeft()` returns negative; the existing red-badge UI surfaces the deficit until the player either restores the form to MINIMAL or reverses the spend. Cycle close is the final seal.

This was decided in chat 2026-05-06 (rev 2 of this ADR). An earlier draft proposed an Option A "ratchet" that kept `attendance.downtime` true once awarded for the cycle, with a `downtime_awarded_xp_at_cycle` schema field marking the one-shot. Hard mirror was chosen because:

- The bool *is* the state. No special-case ratchet logic to debug six months from now.
- Self-correcting visibility: a player who silently breaks their own form sees `xpLeft()` go negative immediately, rather than the inconsistency hiding until the ST notices a `'draft'` submission with credited Game-XP.
- No schema delta to `game_session.schema.js`. One fewer field.
- The negative-`xpLeft()` UI already exists and renders correctly today; CLAUDE.md is explicit that derived stats are calculated at render time without backend enforcement, so the failure mode produces a UI signal the codebase already speaks.
- It matches the verbatim model recorded in chat: *"submitted:true flips as required back and forth to match a 'has_minimum_input_in_form' bool"*.

To make hard mirror honest rather than abrupt, three UI affordances are required (story #17 acceptance criteria):

1. **Persistent banner when `_has_minimum` is false.** Wording along the lines of *"Your form is below minimum-complete. Your downtime XP credit is on hold. Add the missing pieces to restore it."* List the missing pieces inline so the player can act. The banner is the player-facing signal that replaces the manual "Submit Downtime" button.
2. **Visible XP-Available delta annotation.** When the bool is false, the XP-Available number renders with a small "(downtime credit on hold)" annotation; when true, the annotation disappears. The number doesn't lie about its source.
3. **Negative-`xpLeft()` treatment in the player view.** Already exists in the admin grid; mirror to the player's XP panel — XP-Left in red with a hover tooltip explaining the temporary deficit and how to resolve it (restore the form, or reverse the spend).

These three are not gates on the design; they are part of it. Story #17 must ship them together with the lifecycle wiring or hard mirror feels broken to players.

### Q4 - Auto-XP timing

**Decision: XP-Available mirrors `_has_minimum` both directions, immediately, with cycle close as the final seal.**

`attendance.downtime` writes the bool as-is on every flip. `xpGame()` recomputes `c._gameXP` on next `loadGameXP()` call. Players see the +1 the instant they hit MINIMAL; they see it disappear (with the banner + annotation per Q3) the instant they fall below.

Rationale (rev 2):
- "Spend in this downtime potentially" is the player-facing benefit. Earning XP on first-completeness rather than at cycle close gives the dopamine immediately.
- Earlier draft chose a one-way ratchet to avoid the "I had XP, now I don't" UX. Hard mirror is preferred (rev 2) because the banner + annotation make the flip-back legible rather than mysterious; the player who caused the flip understands why their XP moved. The ratchet's UX-protection benefit was over-engineered for a 30-player trusted-community game.
- Cycle close is the only true seal. `cycle.status === 'closed'` makes both flags read-only via the server-side gate from Q11. After close, whatever state the form is in at that moment is the state that ships.

### Q5 - Submission summary modal (ADVANCED)

**Recommendation: dismissable modal triggered by clicking a "Submit Final" button (visible only in ADVANCED), showing per-section action-spent counts.**

The modal is the new home of the form-rating widget removed from the Admin section per task #31. Modal contents:

- Action-spent summary: "4/4 Personal Actions, 2/3 Contact actions, 1/1 Sphere actions, 0/2 Acquisition slots used."
- Optional rate-the-form widget (Likert 1-5, free-text feedback). Optional, not blocking.
- "Submit final" button which sets `responses._final_submitted_at` (timestamp marking player's stated intent).

`_final_submitted_at` is *not* a status flip - the form is already in `submitted` state from the auto-flip. It's a player-stated "I am done editing" hint for the ST. Cycle close still seals.

For MINIMAL, the modal does not appear. The form auto-submits silently. A persistent toast confirms ("Submitted - keep editing until the deadline").

Rationale:
- The summary helps ADVANCED players notice unspent slots before the cycle closes; it is the form telling the player "you've used what you've used", not the system telling them they're done.
- MINIMAL players don't get the summary because it would surface complexity (slots, sections) the MINIMAL mode is hiding.

### Q6 - Universal character picker

**Recommendation: a single component, two scoped variants, one render shape.**

Component: `public/js/components/character-picker.js` (new). Exports:

```js
charPicker({
  scope: 'all' | 'attendees',     // source list
  cardinality: 'single' | 'multi', // selection mode
  initial: string[] | string,      // initial value
  onChange: (next) => void,        // change handler
  placeholder: string,             // for empty state
  excludeIds?: string[],           // hide these (e.g. self)
})
```

Render shape: a fuzzy-matching text input with progressively-narrowing dropdown list, mouse + keyboard navigable, current selection rendered as removable chips for `multi` mode and as a confirmed pill for `single`. One implementation, every site adopts it.

Scope variants:
- `all` reads from `allCharNames` (already module-scoped in `downtime-form.js:43`).
- `attendees` filters to `lastGameAttendees` (already module-scoped at `:67`).

The five existing sites in the audit replace their local pickers with `charPicker()` calls. New consumers (ALLY-attach in personal actions, Mentor/Staff actions, anywhere else) use the same.

Component boundary: the picker lives under `public/js/components/` and is consumed only by the DT form *in this ADR's scope*. Broader adoption (replacing pickers in the admin app, regency tab, etc.) is a separate decision deferred to a future ADR. The freeze-lift status header explicitly retains the gate-2 rule on cross-suite helpers; this picker stays form-local until that gate revisits.

Rationale:
- Five render shapes is the divergence pattern the charter named. Reducing to one is the local-instance fix.
- Fuzzy-match-with-dropdown is the UX pattern Piatra named in the remediation notes. It generalises across cardinality (the multi-variant just keeps the dropdown open after each pick).
- Scoping the component to the DT form first avoids the trap of building a too-general component before its consumers are stable. ADR-002 lesson applied.

## Implementation plan

The decisions above map onto the existing in-session task list. Each task becomes a story under the BMAD epic for the DT form (task #15 creates the epic). Order respects dependencies recorded in TaskList.

| Decision | Implementation tasks | Dependency note |
|---|---|---|
| Q6 Universal picker | #16 | First component to land. Other tasks consume it. |
| Q1 Mode selector + Q2 MINIMAL set | #17 | Lands second. Sets the rendering gate every per-section task respects. |
| Q3 Soft-submit + Q4 Auto-XP | #17 (same task as Q1) | The lifecycle is the mode selector's runtime contract. |
| Q5 Submit Final modal | #31 | Replaces the removed Admin section. |
| Per-section MINIMAL wiring | #18 (Personal Story), #20 (Feeding), #22 (ROTE), #23 (Regency) | Each respects Q1-Q2. |
| Personal Actions chrome strip | #24 | Hides MODE/SUPPORT/single-vs-dual; uses Q6 picker for ALLY. |
| Per-section feature work | #19, #21, #25, #26, #27, #28, #29, #30 | Independent; can land in any order after #17. |
| Removals | #32 (joint authoring), #33 (NPC selectors) | Independent of the cross-cutting pieces. |

The component `public/js/components/character-picker.js` is the only new file outside the form's section directory. No new schema fields except:
- `responses._mode: 'minimal' | 'advanced'`
- `responses._has_minimum: boolean` (derived; written for read-side convenience)
- `responses._final_submitted_at: string` (ISO timestamp; ADVANCED only)

The `game_session.schema.js` is **not amended** — the rev-2 hard-mirror decision drops the `downtime_awarded_xp_at_cycle` field that an earlier draft introduced. `attendance[i].downtime` is the only field touched, and it already exists.

The submission-side fields fit under `additionalProperties: true` in `downtime_submission.schema.js` but should be explicitly added to `properties` so the contract is documented.

### Sequencing note

Stories #16 and #17 should land before any per-section story merges. The character picker and the MINIMAL/ADVANCED gate are foundation pieces; per-section authors need both available. After #16 + #17 land, per-section stories run in parallel.

## Open questions

Each item needs Piatra's call before the corresponding story is implementable. Angelus is invited to comment on any item via response to this ADR.

### Q7 - Server-side enforcement of `has_minimum`?

The recommendation above computes `has_minimum` client-side and PATCHes the server. The server trusts the client. Two reasons to consider server-side enforcement:

1. **A player's client could lie**, sending `_has_minimum: true` without the supporting fields. Result: stolen XP. Probably theoretical; player community is small and trusted, but if the cycle has competitive elements this matters.
2. **Auditability.** A server-side check is the canonical recompute path; the client is a UI hint.

Recommendation: defer server-side check to a follow-up. Land the client-side derivation now; the server contract is `PATCH status` and `PATCH attendance.downtime`, and the *server can* later validate-on-PATCH against the same `isMinimalComplete()` rules ported to the server. Keeps shipping fast; the upgrade path is clean.

### Q8 - Where does `isMinimalComplete()` live?

Three options:

- (a) Inline in `downtime-form.js`, exported.
- (b) New module `public/js/data/dt-completeness.js`, importable from server later if Q7 picks server-side enforcement.
- (c) Live with the section helpers - each section exports its own `isMinimalCompleteFor<Section>()`, the parent composes.

Recommendation: (b). One file, one function, importable both sides if/when Q7 promotes.

### Q9 - Submission UX for "I want to be ADVANCED but only fill MINIMAL"

A player on ADVANCED who only fills MINIMAL still has `has_minimum = true` and auto-XP awards. Do they see the Submit Final modal?

Recommendation: yes. The modal is mode-conditional, not state-conditional. ADVANCED + MINIMAL-filled means the modal shows zeroes in most slots; that's accurate.

### Q10 - The character picker's keyboard model

Tab navigation, arrow-key nav, enter-to-select, escape-to-cancel, ctrl-A to select-all in multi - reasonable defaults. Worth recording explicit AC because keyboard-first players (rare but vocal) will notice.

Recommendation: standard combobox keyboard model per WAI-ARIA (`role="combobox"`, `aria-expanded`, `aria-activedescendant`). Story #16 carries this in its acceptance criteria.

### Q11 - Cycle-close hardening

Current code does not lock the form on `cycle.status === 'closed'`. Players can edit submissions after close. The remediation work assumes cycle-close is a hard gate (Q3 above relies on it). Either:

- (a) Add a closed-cycle gate to all `PATCH /api/downtime_submissions/:id` calls; reject with 423 Locked.
- (b) Trust the UI to disable editing.

Recommendation: (a). Server-side is one short middleware in `server/routes/downtime.js`. Client gates are nice-to-have; server gates are the contract.

### Q12 - The Save Draft button removal

Recommendation per Piatra's note: remove `#dt-btn-save` and its event handler at `:2804`. The status indicator at `#dt-save-status` stays but is repurposed to surface auto-save state ("Saved 14:23" or "Saving..."). Story #7 already covers this; called out here so it ladders into the Q3 lifecycle naturally.

## Out of scope

This ADR scopes the cross-cutting decisions for the DT submission form only. Out of scope:

- **Broader-than-form adoption of the character picker.** Other surfaces (admin app, regency tab outside DT context, character editor) keep their existing pickers. A future ADR may promote `character-picker.js` to a project-wide component.
- **Server-side `isMinimalComplete()` validation.** Q7 above; deferred to a follow-up.
- **NPC selector replacement.** Task #33 removes NPC selectors entirely; if NPCs come back to the form later, they will need their own picker variant. Not addressed here.
- **Joint authoring / project invitation.** Task #32 removes from MVP. Re-enabling is a future scoping decision.
- **The 9 enumerated bugs (tasks #4-#12).** They ship as hotfixes per the existing freeze-permitted-hotfix definition (which still applies post-lift as a workflow standard, not a gate). They are not blocked by this ADR.
- **Migration of existing submissions.** Existing `downtime_submissions` documents have `status: 'draft' | 'submitted'`. Post-implementation, the bool derivation runs against existing data. No migration script needed - the new code reads what's there and writes the new fields on next save.

## References

- `specs/architecture/adr-001-rules-engine-schema.md` - structural template.
- `specs/architecture/adr-002-territory-fk.md` - length and audit/decision/migration shape this ADR mirrors.
- `specs/architectural-reset-charter.md` - status header at top records the freeze lift; this ADR is one of the contested-architecture-mechanism artefacts the charter names.
- `public/js/tabs/downtime-form.js` - the file under remediation; sections enumerated in audit.
- `public/js/tabs/downtime-data.js:171` - `DOWNTIME_SECTIONS` source.
- `public/js/data/game-xp.js` - Game-XP attendance linkage; new behaviour in Q4 amends consumers here.
- `server/schemas/downtime_submission.schema.js` - submission contract.
- `server/schemas/game_session.schema.js` - attendance contract.
- In-session task list, items #13 (this ADR draft), #14 (sign-off), #15 (epic), #16-#33 (per-section stories).

## Resolutions

All twelve questions resolved by Piatra 2026-05-06. ADR status promoted from `draft` to `approved`. Angelus is invited to comment via response ADR per the contested-architecture mechanism in `specs/architectural-reset-charter.md` Part 3; rev 4 of this ADR will append any such response.

| Question | Recommendation | Resolution | Notes |
|---|---|---|---|
| Q1 mode persistence | per-submission, default MINIMAL; mode-switch preserves entered data | **resolved** | Switching MINIMAL → ADVANCED → MINIMAL keeps previously-filled fields rather than clearing. Cost of stray data in unrendered sections is zero; cost of losing player typing is real. |
| Q2 MINIMAL set | court + personal_story (reduced) + feeding + 1 project + regency-if-regent | **resolved** | Acquisitions, Equipment, Vamping, Sphere actions, Sorcery, Admin all stay ADVANCED-only. MINIMAL is for players who want truly minimal actions. |
| Q3 derived-bool lifecycle | hard mirror (rev 2 — was Option A ratchet) | **resolved** | Hard mirror chosen 2026-05-06. Banner + XP-Available annotation + negative-`xpLeft()` treatment are story #17 ACs. |
| Q4 auto-XP timing | mirrors the bool both ways; flip-back drops XP-Available with banner UI (rev 2) | **resolved** | Same chat 2026-05-06. Cycle close is the only true seal. |
| Q5 submit modal | ADVANCED only; replaces Admin form-rating; rating widget is **optional** | **resolved** | Players who want to skip-and-go are not blocked by the rating widget. MINIMAL submissions get a toast confirmation only, no modal. |
| Q6 character picker | one component, two scopes, single render shape; `excludeIds` parameter from day one | **resolved** | `excludeIds` lands in the v1 component signature so ALLY-attach pickers can exclude self without revisiting consumers later. |
| Q7 server enforcement | defer | **resolved** | Client-side derivation only for now. Server trusts the PATCH. Upgrade path stays clean if/when needed. |
| Q8 location of `isMinimalComplete` | `public/js/data/dt-completeness.js` (separate module) | **resolved** | Piatra noted "separate module seems excessive but I'm fine with it." Keeps server-port path clean if Q7 promotes later. |
| Q9 ADVANCED+MINIMAL-filled modal | yes, show with zeroes | **resolved** | Mode-conditional, not state-conditional. ADVANCED player sees ADVANCED submission UX. |
| Q10 picker keyboard model | WAI-ARIA combobox in story AC | **resolved** | `role="combobox"`, `aria-expanded`, `aria-activedescendant`, standard tab/arrow/enter/escape semantics. Story #16 carries this in its ACs. |
| Q11 cycle-close server gate | yes, server-side 423 | **resolved** | Load-bearing for hard-mirror Q3. `PATCH /api/downtime_submissions/:id` returns 423 Locked when `cycle.status === 'closed'`. One short middleware in `server/routes/downtime.js`. |
| Q12 remove Save Draft button | yes, repurpose `#dt-save-status` | **resolved** | Issue [#45](https://github.com/angelusvmorningstar/terramortis/issues/45) carries the implementation. |
