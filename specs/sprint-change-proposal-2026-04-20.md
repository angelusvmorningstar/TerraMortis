# Sprint Change Proposal — DT Form Redesign
**Date:** 2026-04-20  
**Author:** Correct Course — Angelus  
**Trigger:** Post-dtg design review session

---

## Section 1: Issue Summary

### What Triggered This

Following the completion of the DTG epic (game app integration, dtg.1–4), a full design review of the downtime submission form was conducted by Angelus. 21 calibration tasks were identified spanning field changes, UX improvements, and significant new features.

The triggering condition is **not a technical failure** — the form works correctly. The issue is that the form was built incrementally across multiple epics without a holistic design pass. Now that players are using it in both `player.html` and `index.html`, concrete usability gaps and mechanical mismatches are visible.

### Problem Statement

The downtime form as shipped:
- Contains questions that don't serve ST processing (trust/harm fields)
- Uses UI patterns that obscure player choice (3 dropdowns for shoutout picks; free-text for structured data like aspirations and XP spend)
- Has a feeding section that lets players build mechanically incoherent dice pools (arbitrary attr/skill mixing)
- Shows territory data in a way that doesn't match the actual permission model (resident/poacher regardless of feeding rights)
- Embeds features that either don't exist yet (NPC correspondence) or require new infrastructure (collaborative projects with cross-player invitations)
- Has section ordering that doesn't match game logic (Blood Sorcery should precede Feeding)

### Evidence

21 specific tasks captured in review session (see Section 4). Two tasks (NPC story moment, collaborative projects) require systems that don't yet exist.

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|------|--------|--------|
| DTG (game app integration) | **Complete** | None — dtg.1–4 are wiring and CSS work. The form content changes are layered on top. |
| DTX (ST processing experience) | **In backlog** | **Moderate** — 3 breaking impacts (see below) |
| DTF (new — this proposal) | **New** | Primary deliverable of this proposal |
| DTP, DTS, DTR | Backlog | No impact |

### Breaking Impacts on DTX

The ST processing panel (`downtime-views.js`) reads specific response keys. Three tasks change key values or format:

| Task | Change | DTX Impact |
|------|--------|------------|
| Task 8 — Territory grid | Renames value `'resident'` → `'feeding_rights'` | `downtime-views.js` line 1473: `feedTerrs[k] === 'resident'` and line 7925: `for (const status of ['resident', 'poacher'])` break silently — feeding territory assignment stops working in ST panel |
| Task 4 — Aspirations structured | Replaces text blob with 3 `{type, text}` slots | `downtime-views.js` line 1014: `aspirations` displayed as raw text — would show `[object Object]` or JSON string |
| Task 3 — Remove trust/harm | Removes keys from form | Minor — ST panel reads them but shows empty gracefully. No breakage, just orphaned labels |

**Conclusion:** Tasks 4 and 8 must ship with corresponding `downtime-views.js` updates in the same commit. They cannot be implemented independently.

### Schema / Response Key Impact Summary

| Task | Key change type | Risk |
|------|----------------|------|
| T1 Shoutout checkboxes | Same key, same JSON array format | None |
| T2 NPC story moment | New keys — `npc_moment_mode`, `npc_moment_npc_id`, `npc_moment_text` | Blocked — NPC system doesn't exist |
| T3 Remove trust/harm | Keys become absent | Low — ST panel shows empty gracefully |
| T4 Aspirations structured | `aspirations` → `aspiration_1_type/text`, `aspiration_2_*`, `aspiration_3_*` | **Breaking** — ST panel needs update |
| T5 Feeding pool | `_feed_method`, `_feed_disc`, `_feed_spec` unchanged | None |
| T6 Territory before feeding | Section reorder only | None |
| T7 Rote project commitment | New key `_feed_rote_slot` (which project); `_feed_rote` bool unchanged | Additive |
| T8 Territory grid binary | `'resident'` → `'feeding_rights'` in `feeding_territories` JSON values | **Breaking** — ST panel reads `'resident'` explicitly |
| T9 Regency to vamping | `regency_action` key unchanged, section moves | None |
| T10 Collaborative projects | New keys — blocked on invitation system | Blocked |
| T11 Project action targeting | New fields additive: `project_N_target_char`, `project_N_target_type` | Additive |
| T12 Investigate lead field | New key `project_N_investigate_lead` | Additive |
| T13 XP spend structured | `project_N_xp` → structured; `xp_spend` JSON array format extends | Additive with ST panel update |
| T14 Sphere calibrations | Field removals within sphere section | Low — ST reads sphere keys loosely |
| T15 Status section | New keys for Status merit actions | Additive |
| T16 Retainer actions | Updates `retainer_N_*` keys | Low risk |
| T17 Contacts prompt | No key change | None |
| T18 Blood Sorcery reorder | Section reorder only | None |
| T19 Equipment to new tab | Removes `equipment_N_*` from DT submission | Removes keys — low risk |
| T20 Maintenance action | New project action type, additive | Additive |
| T21 Admin XP carry-forward | Extends `xp_spend` display logic | Additive |

### Architecture Impact

No new API endpoints required for Wave 1 or 2. The collaborative projects feature (Task 10) would require a new `downtime_invitations` collection or a `collaborators` field on submissions — this needs architectural design before implementation.

### UX Spec Impact

`specs/ux-design-specification.md` contains downtime form section definitions that are now partially superseded. It should be updated post-implementation, not pre-implementation.

---

## Section 3: Recommended Approach

### Option Evaluation

**Option 1 — Direct Adjustment (new epic, new stories):** Create a `DTFC` epic grouping the 21 tasks into implementation waves. Tasks with ST panel dependencies ship together. Tasks requiring new infrastructure are deferred. **Effort: Medium. Risk: Low.**

**Option 2 — Rollback:** Not applicable. DTG was wiring and CSS work — rolling it back doesn't simplify anything. The form content was always there.

**Option 3 — MVP Review:** Not applicable. These are enhancements to an operational system, not scope reductions.

### Recommendation: Option 1 — New Epic DTFC in Three Waves

**Rationale:**
- DTG is complete and working. These are net-new changes layered on top, not corrections to broken work.
- Wave 1 (simple calibrations) can ship immediately with low risk.
- Wave 2 (structure changes + ST panel updates) is cohesive work that must ship together.
- Wave 3 (collaborative projects, NPC moments) is blocked on infrastructure that doesn't exist yet — deferring is the only responsible choice.
- Splitting into waves protects against regressions and keeps stories reviewable.

---

## Section 4: Detailed Change Proposals

### Wave 1 — Simple Calibrations (no schema changes, no ST panel updates)

**Story DTFC-1: Court Section Calibrations**

| Task | Change |
|------|--------|
| T1 | Shoutout picks: replace 3 dropdowns with checkbox grid of all non-retired characters (max 3 selectable). Same `rp_shoutout` JSON array key. |
| T3 | Remove `trust` and `harm` questions from Court section entirely. Remove from `DOWNTIME_SECTIONS` court questions array and from `COURT_KEYS` in `downtime-views.js`. |
| T17 | Contacts: update field prompt to steer players toward specific requests (label/desc change only). |

**Story DTFC-2: Form Section Ordering**

| Task | Change |
|------|--------|
| T6 | Territory section moves before Feeding in section render order. |
| T9 | Regency action removed as standalone gated section; folded into Vamping as conditional sub-field. |
| T18 | Blood Sorcery section renders before Feeding section. |

**Story DTFC-3: Project and Sphere Field Calibrations**

| Task | Change |
|------|--------|
| T11 | Attack: character target picker. Feed: locks to rote setup. Hide/Protect: own asset/merit target. No pool pre-loading on any action. |
| T12 | Investigate: flexible target (char/territory/free-text) + mandatory "lead" field. |
| T14 | Sphere Allies: remove description from Ambience, Attack, Block, Hide, Investigate, Support. Block: char target + free-text merit guess. Support: picker for existing project player participates in. Grow/Misc keep description. Remove Acquisition from Allies action list. |
| T15 | Add Status section: auto-detect Broad Status, Narrow Status, MCI. Same tabbed model as Allies. |
| T16 | Add Retainer actions section: auto-detect Retainer merits. Actions TBD. |
| T20 | Add Maintenance project action: gated on Professional Training or MCI. Description only, no pool. |

---

### Wave 2 — Structure Changes with ST Panel Updates (ship together)

**Story DTFC-4: Aspirations Structured Slots**

| Task | Change |
|------|--------|
| T4 | Replace single `aspirations` textarea with 3 structured slots: dropdown (Short/Medium/Long) + short text field each. New keys: `aspiration_1_type`, `aspiration_1_text`, `aspiration_2_type`, `aspiration_2_text`, `aspiration_3_type`, `aspiration_3_text`. |

ST panel update required: `COURT_KEYS` and `COURT_LABELS` in `downtime-views.js` — render aspirations as 3 labelled lines instead of raw text.

**Story DTFC-5: Territory Grid — Feeding Rights Model**

| Task | Change |
|------|--------|
| T8 | Each territory row shows only the options the character can take: if they have feeding rights → `feeding_rights` + `not_feeding`. If not → `poaching` + `not_feeding`. Always one or the other, never both. Show current ambience on the row. Add indicative note about post-DT ambience shift. |

ST panel update required: `downtime-views.js` — replace hardcoded `'resident'` checks with `'feeding_rights'`. Update `for (const status of ['resident', 'poacher'])` → `['feeding_rights', 'poaching']`. Update display labels.

**Story DTFC-6: Feeding Pool and Vitae Projection**

| Task | Change |
|------|--------|
| T5 | Method selection auto-loads best Attr + best Skill from method's valid options. Pool is Attr + Skill + optional Discipline — no free-form mixing. Auto-surfaces specs, 9-Again, Feeding Grounds. |
| T6 | Vitae display: replace "Starting Vitae before feeding" with net vitae projection based on territory ambience mod + pool + monthly costs (ghouls, rites). Same numbers as ST feeding roll calculator. |

**Story DTFC-7: Rote Project Commitment**

| Task | Change |
|------|--------|
| T7 | Rote toggle lets player choose which project slot (1–4) to commit. Inline feed configuration appears in the Feeding section. Chosen slot locked in Projects section. New key: `_feed_rote_slot`. |

**Story DTFC-8: XP Spend — Structured Dot Purchase**

| Task | Change |
|------|--------|
| T13 | Project XP Spend action: category dropdowns (Attrs/Skills/Discs/Devotions/Rites), item selector, cost display, available XP shown. One dot per project slot. Merits 1–3 dots: free in Admin, no project slot required. |
| T21 | Admin: XP purchases from project slots auto-populate read-only. Admin then allows additional free merit purchases (same structured model). Running total shown. |

ST panel update required: ensure `xp_spend` JSON parsing in `downtime-views.js` (lines 2565–2606) handles new structured row format.

---

### Wave 3 — Deferred (infrastructure not yet available)

**Story DTFC-9: NPC Story Moment (BLOCKED)**

| Task | Blocker |
|------|---------|
| T2 | Requires NPC data model — list of NPCs connected to each character (correspondents + touchstones). This collection does not exist. Must be designed and built as a prerequisite. |

**Story DTFC-10: Collaborative Projects (BLOCKED)**

| Task | Blocker |
|------|---------|
| T10 | Requires invitation mechanism — lead player commits a project, target player receives a notification, accepting commits one of their slots. This requires either a new `downtime_invitations` collection or a new field on submissions. Needs architectural design. |

**Story DTFC-11: Equipment Tab in player.html (SCOPED SEPARATELY)**

| Task | Note |
|------|------|
| T19 | Removing Equipment from the DT form is straightforward. The new Equipment tab in `player.html` is separate scope — needs its own design. These should be split: remove from DT form in Wave 2, build new tab as a separate epic story. |

---

## Section 5: Implementation Handoff

### Scope Classification: **Moderate**

New epic, backlog reorganisation needed. No fundamental replan required — architecture is unchanged for Waves 1 and 2.

### Handoff Plan

| Wave | Who | Action |
|------|-----|--------|
| Wave 1 (DTFC-1 to -3) | Dev | Implement directly. No ST panel changes. Safe to ship first. |
| Wave 2 (DTFC-4 to -8) | Dev | Each story must ship with its corresponding `downtime-views.js` update in the same commit. Do not split form change from panel update. |
| Wave 3 (DTFC-9 to -11) | PM/Architect | Design NPC system and invitation mechanism before any implementation begins. Equipment tab scoped as standalone story. |

### Success Criteria

- All Wave 1 stories pass: existing DT submissions still load and display in ST panel without regressions
- Wave 2 stories pass: ST panel correctly displays new aspirations format, new territory grid values, new XP structure
- `downtime-views.js` E2E tests pass after each story (no regressions on `trust`, `harm`, `aspirations`, `feeding_territories` display)
- Wave 3 stories remain in backlog until prerequisite systems are designed

---

## Checklist Status

| # | Item | Status |
|---|------|--------|
| 1.1 | Trigger story identified | ✅ dtg.3 completion + design review |
| 1.2 | Problem categorised | ✅ New requirements from stakeholder review |
| 1.3 | Evidence gathered | ✅ 21 tasks documented |
| 2.1 | Current epic impact | ✅ DTG complete — no impact |
| 2.2 | Epic changes required | ✅ New DTFC epic |
| 2.3 | Future epic impacts | ✅ DTX: 3 breaking impacts identified |
| 2.4 | New epics needed | ✅ DTFC only |
| 2.5 | Priority resequencing | ✅ None needed |
| 3.1 | PRD conflicts | ✅ None — enhancements within existing scope |
| 3.2 | Architecture conflicts | ✅ Wave 3 needs design; Waves 1-2 clean |
| 3.3 | UX spec conflicts | ✅ Update post-implementation |
| 3.4 | Other artifacts | ✅ downtime-views.js impacts documented |
| 4.1-4.4 | Path forward | ✅ Option 1, new DTFC epic |
| 5.1-5.5 | Proposal components | ✅ All sections above |
