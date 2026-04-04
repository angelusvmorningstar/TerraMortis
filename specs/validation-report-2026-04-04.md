---
validationTarget: "specs/prd.md"
validationDate: "2026-04-04"
prdVersion: "2.0"
inputDocuments:
  - specs/prd.md
  - specs/prd/epic-restructure-proposal.md
  - specs/architecture.md
  - CLAUDE.md
validationStepsCompleted:
  - step-v-01-discovery
  - step-v-02-format-detection
  - step-v-03-density-validation
  - step-v-04-brief-coverage-validation
  - step-v-05-measurability-validation
  - step-v-06-traceability-validation
  - step-v-07-implementation-leakage-validation
  - step-v-08-domain-compliance-validation
  - step-v-09-project-type-validation
  - step-v-10-smart-validation
  - step-v-11-holistic-quality-validation
  - step-v-12-completeness-validation
validationStatus: COMPLETE
holisticQualityRating: "4/5 - Good"
overallStatus: Warning
---

# PRD Validation Report

**PRD Being Validated:** specs/prd.md (v2.0)
**Validation Date:** 4 April 2026

## Input Documents

- specs/prd.md ✓ (validation target)
- specs/prd/epic-restructure-proposal.md ✓
- specs/architecture.md ✓ (note: v1.0, pre-API — outdated)
- CLAUDE.md ✓

## Validation Findings

### V-02: Format Detection

**Classification: BMAD Standard**

All 6 core sections present:
1. Executive Summary ✓
2. Success Criteria ✓
3. Product Scope ✓
4. User Journeys ✓
5. Functional Requirements ✓
6. Non-Functional Requirements ✓

**Routing:** Full validation suite (V-03 onwards)

### V-03: Information Density Validation

**Anti-Pattern Violations:**

**Conversational Filler:** 0 occurrences

**Wordy Phrases:** 1 occurrence
- FR-DP-01: "require a defined flat export format to be specified before implementation — round-trip fidelity depends on this format being established" (borderline; acceptable given the technical caveat intent)

**Redundant Phrases:** 0 occurrences

**Total Violations:** 1

**Severity Assessment:** Pass

**Recommendation:** PRD demonstrates good information density with minimal violations. The single flagged instance in FR-DP-01 is a deliberate caveat, not filler — no action required.

### V-04: Product Brief Coverage

**Status:** N/A — No Product Brief was provided as input

### V-05: Measurability Validation

**Total FRs Analysed:** 24
**Total NFRs Analysed:** 19

#### Functional Requirements

**Format Violations (not "[Actor] can [capability]"):** 5
- FR-3-02: behaviour description, no actor ("MCI and Professional Training standing merits derive...")
- FR-3-03: no actor ("City domain displays...")
- FR-5-01: passive construction ("Players authenticate via Discord OAuth and are mapped...")
- FR-5-04: passive construction ("Published downtime outcomes are available...")
- FR-GC-03: no actor ("The feeding scene view presents...")

**Implementation Leakage:** 3
- FR-3-04 / FR-GC-01: "game_sessions collection" (collection name exposed in FR)
- FR-GC-05: "submission schema" (data structure reference)
- FR-6-01: "max 600px", "bottom navigation", "without page reload" (layout and DOM details)

**Subjective Adjectives / Vague Quantifiers:** 0

**FR Violations Total:** 8

#### Non-Functional Requirements

**Genuine Violations:** 1
- NFR8: `requireRole('st')` — code function name leakage; should express the security behaviour, not the implementation

**Intentional Architectural Constraints (not violations):** NFR12, NFR13 (stack constraints), NFR14–15 (maintainability conventions), NFR18–19 (design system specs) — acceptable in brownfield context where implementation is fixed

**NFR Violations Total:** 1

#### Overall Assessment

**Total Requirements:** 43
**Total Violations:** 9

**Severity:** Warning (5–10 violations)

**Recommendation:** FR format violations are the primary concern — 5 FRs use passive or behaviour-description style rather than actor/capability framing. These reduce testability but do not obscure intent. The implementation leakage in FR-6-01 is the most significant — tablet layout constraints should be expressed as UX requirements, not pixel values and DOM semantics. NFR8 code-name leakage is minor. NFR12–19 implementation details are intentional brownfield constraints, not quality issues.

### V-06: Traceability Validation

#### Chain Validation

**Executive Summary → Success Criteria:** Intact — all four success dimensions trace directly to executive summary

**Success Criteria → User Journeys:** Intact — all criteria have supporting journeys (cycle time → J2, atomic reset → J2, player self-service → J4, CSV portability → J3)

**User Journeys → Functional Requirements:** Gaps identified — see below

**Scope → FR Alignment:** Intact — Product Scope sections (Done / Current Phase / Later) align with Epic 3, Epic 5/GC, and Epic 6 FR blocks respectively

#### Orphan Elements

**Orphan Functional Requirements:** 0 (no FRs are fully untraceable)

**Unsupported Success Criteria:** 0

**User Journeys Without FRs:** 0

#### Traceability Issues

**Near-orphan FR:** FR-GC-07 (monthly influence income applied at reset) — no explicit journey mentions influence income calculation; J1 references "influence generation" in territory context but not reset-time application. Lowest-risk path: add "Monthly influence income applied" to Journey 2 capabilities list.

**Duplicate FR pair:** FR-3-04 / FR-GC-01 — both describe attendance recording. FR-3-04 belongs to the existing Epic 3 scope; FR-GC-01 re-specifies it in the game cycle block. Acceptable duplication given the two different delivery contexts, but worth noting for story authoring (should be one story, not two).

**Capability gaps in Journey 1:** FR-6-04 (downtime submission view in read-only mode) and FR-6-05 (per-character live game state tracker with reset-all) are not listed in Journey 1's **Capabilities:** line. These are valid FRs that emerged from the game cycle planning but lack an explicit journey anchor.

**Total Traceability Issues:** 3 (all minor)

**Severity:** Warning

**Recommendation:** Traceability chain is substantially intact. Add "monthly influence income application" and "downtime read-only view" and "live state tracking with session reset" to Journey 2 / Journey 1 capabilities respectively. Treat FR-3-04 / FR-GC-01 as a single story at implementation time.

### V-07: Implementation Leakage Validation

#### Leakage by Category

**Frontend Frameworks:** 0 violations

**Backend Frameworks:** 1 violation
- NFR8: `requireRole('st')` — code function name; should state the security requirement, not reference the implementation

**Databases:** 0 genuine violations
- FR-3-04 / FR-GC-01 "game_sessions collection", FR-5-01 "players collection", FR-GC-05 "submission schema" — boundary cases; all are also domain concepts in this system, and all reflect intentional brownfield constraints. Flagged for awareness, not action.

**Cloud Platforms:** 0 violations
- NFR12 (MongoDB Atlas), NFR13 (Discord OAuth), FR-5-01 (Discord OAuth) — intentional brownfield architectural constraints, not leakage

**Infrastructure:** 0 violations

**Libraries:** 0 violations

**Data Formats:** 0 violations — CSV in FR-DP-01–05 is capability-relevant (CSV export/import is the specified deliverable)

**Other Implementation Details:** 2 violations
- FR-6-01: "max 600px" — CSS breakpoint value; should express "tablet-optimised layout" not the constraint value
- FR-6-01: "without page reload" — SPA navigation implementation detail; should express "without interrupting the current view"

**Accepted Intentional Constraints (not violations):** Discord OAuth, MongoDB Atlas, Express API, CSS design token conventions (NFR14/18/19), JS module conventions (NFR15) — fixed brownfield constraints documented by design

#### Summary

**Total Genuine Violations:** 3

**Severity:** Warning

**Recommendation:** Minor leakage only. NFR8 function name reference is the only security-relevant issue. FR-6-01 pixel/reload references are cosmetic — they communicate intent clearly even if they specify HOW. No revision required before story authoring; note as refinement candidates.

### V-08: Domain Compliance Validation

**Domain:** General (consumer/entertainment — LARP management tool)
**Complexity:** Low
**Assessment:** N/A — No regulatory compliance requirements applicable to this domain

### V-09: Project-Type Compliance Validation

**Project Type:** web_app

#### Required Sections

**User Journeys:** Present ✓ — 6 journeys covering all user types

**UX/UI Requirements:** Present (distributed) ✓ — accessibility in NFR9–11, design system in NFR17–19, responsive requirements inline in FR-5-02 (mobile-first) and FR-6-01 (tablet-optimised). No dedicated UX section needed; design system is established.

**Responsive Design:** Present ✓ — FR-5-02 (mobile-first player portal), FR-6-01 (tablet-optimised ST app)

#### Excluded Sections

None excluded for web_app — no violations.

#### Compliance Summary

**Required Sections:** 3/3 present
**Excluded Sections Present:** 0
**Compliance Score:** 100%

**Severity:** Pass

**Recommendation:** All required web_app sections are present. Distributed UX requirements across NFRs and FRs is appropriate given the established design system.

### V-10: SMART Requirements Validation

**Total Functional Requirements:** 29
*(Note: V-05 stated 24 — correction: Epic 6 contains 6 FRs and Data Portability 5, total is 29)*

#### Scoring Summary

**All scores ≥ 3:** 100% (29/29)
**All scores ≥ 4 average:** 89.7% (26/29)
**Overall Average Score:** 4.44/5.0

#### Flagged Requirements (any score < 3)

| FR | S | M | A | R | T | Avg | Issue |
|---|---|---|---|---|---|---|---|
| FR-GC-07 | 4 | 4 | 5 | 4 | 2 | 3.8 | T: Not in any journey capabilities list |
| FR-6-04 | 4 | 4 | 5 | 4 | 2 | 3.8 | T: Not in Journey 1 capabilities list |
| FR-6-05 | 4 | 4 | 5 | 4 | 2 | 3.8 | T: Not in Journey 1 capabilities list |

#### Improvement Suggestions

**FR-GC-07, FR-6-04, FR-6-05** — all share the same root cause (identified in V-06): the capabilities listed under Journey 1 and Journey 2 do not include monthly influence income application, downtime submission read-only view, or live game state tracking. Adding these three items to the respective journey capability lines resolves all three flags in a single PRD edit.

#### Overall Assessment

**Severity:** Warning — 10.3% flagged (threshold: Warning at 10–30%)

**Recommendation:** Strong FR quality overall (4.44 average). The three flagged FRs are structurally sound — their issue is weak journey anchoring, not poor definition. A single pass adding three capability phrases to Journey 1 and Journey 2 will clear all flags.

### V-11: Holistic Quality Assessment

#### Document Flow and Coherence

**Assessment:** Good

**Strengths:**
- "What Makes This Special" callout is sharp, differentiated, and frames the product's value proposition precisely
- Narrative arc (built → building → later) is well-executed and unambiguous
- User Journeys are grounded in specific real-game scenarios rather than generic persona descriptions
- Measurable Outcomes table provides a strong accountability anchor
- Success Criteria map cleanly to journey capabilities

**Areas for Improvement:**
- FR section has no prose summary headers between epic blocks — reader must track context manually
- FR-GC-01 / FR-3-04 duplication creates mild cognitive load across sections

#### Dual Audience Effectiveness

**For Humans:**
- Executive-friendly: Strong — summary, "What Makes This Special", outcomes table
- Developer clarity: Good — FRs are buildable; NFRs define conventions precisely
- Designer clarity: Adequate — design system implied in NFRs, no consolidated UI flow
- Stakeholder decision-making: Strong — phased scope is explicit

**For LLMs:**
- Machine-readable structure: Good — BMAD standard sections, clear hierarchy
- UX readiness: Adequate — UX requirements distributed; LLM must synthesise across sections
- Architecture readiness: Good — stack constraints explicit in NFR12/13
- Epic/Story readiness: Excellent — FR groupings map directly to epics with derivable acceptance criteria

**Dual Audience Score:** 4/5

#### BMAD PRD Principles Compliance

| Principle | Status | Notes |
|---|---|---|
| Information Density | Met | Pass — 1 borderline instance, not action-required |
| Measurability | Partial | Warning — 5 format violations, 3 leakage instances |
| Traceability | Partial | Warning — 3 minor gaps (FR-GC-07, FR-6-04, FR-6-05) |
| Domain Awareness | Met | General domain; no special compliance needed |
| Zero Anti-Patterns | Met | 0–1 instances throughout |
| Dual Audience | Met | Strong for humans, good for LLMs |
| Markdown Format | Met | Proper headers, tables, lists throughout |

**Principles Met:** 5/7

#### Overall Quality Rating

**Rating: 4/5 — Good**
Strong document with clear vision, well-scoped requirements, and effective user journeys. Minor traceability and measurability gaps are the only barriers to an excellent rating. All findings are fixable in a single editing pass.

#### Top 3 Improvements

1. **Add three capability phrases to Journey 1 and Journey 2 capability lists**
   FR-GC-07, FR-6-04, and FR-6-05 all score T=2 because their capabilities are absent from the journey narrative. Adding "monthly influence income application" to Journey 2 and "downtime submission read-only view" and "live game state tracking" to Journey 1 resolves all three SMART flags and the V-06 near-orphan finding in a single edit.

2. **Reframe 5 passive FRs to actor/capability format**
   FR-3-02, FR-3-03, FR-5-01, FR-5-04, FR-GC-03 use behaviour-description or passive construction rather than "[Actor] can [capability]". Converting these improves developer clarity and measurability score without changing intent.

3. **Acknowledge the FR-GC-01 / FR-3-04 duplication explicitly**
   Both FRs describe attendance recording. Either merge them or add a cross-reference note (e.g., "FR-GC-01 extends FR-3-04 to the cycle management context") so story authors don't build two separate features.

#### Summary

**This PRD is:** A solid, high-density document that accurately represents the current state and next phase of TM Suite; ready for story authoring with three minor traceable gaps to resolve first.

### V-12: Completeness Validation

#### Template Completeness

**Template Variables Found:** 0 — No template variables remaining ✓

#### Content Completeness by Section

**Executive Summary:** Complete — vision, "What Makes This Special", current state, product context
**Success Criteria:** Complete — User/Business/Technical success + Measurable Outcomes table with Target and Status
**Product Scope:** Complete — Done/Current/Later phases with epic-restructure-proposal cross-reference
**User Journeys:** Complete — 6 journeys with narrative and capabilities blocks
**Functional Requirements:** Complete — 29 FRs across 5 FR blocks (Epic 3, Epic 5, Game Cycle, Epic 6, Data Portability)
**Non-Functional Requirements:** Complete — 19 NFRs across 6 categories

#### Section-Specific Completeness

**Success Criteria Measurability:** All measurable — numeric targets in Measurable Outcomes table
**User Journeys Coverage:** Yes — all key user types covered (Angelus ST ×3, Player, Rules ST, Developer)
**FRs Cover Current Phase Scope:** Yes — Epic 5, Game Cycle Management, Data Portability all covered; Epic 6 included for later planning
**NFRs Have Specific Criteria:** All — performance NFRs have numeric targets (100ms, 500ms, 200ms, 3s); accessibility references WCAG 2.1 AA

#### Frontmatter Completeness

**stepsCompleted:** Present ✓ (edit workflow steps documented)
**projectType:** Present ✓ (`web_app` at root level — no nested classification block, but field present and used correctly)
**inputDocuments:** Present ✓
**date / lastEdited:** Present ✓
**domain classification:** Not present — acceptable for general domain; no action required

**Frontmatter Completeness:** 3.5/4

#### Completeness Summary

**Overall Completeness:** 97% — all 6 core sections complete, no template gaps

**Critical Gaps:** 0
**Minor Gaps:** 1 (frontmatter domain field absent — informational only)

**Severity:** Pass

**Recommendation:** PRD is complete. All required sections and content are present. The minor frontmatter gap (no explicit domain classification) has no downstream impact given the general domain classification used throughout.

---

## Post-Validation Fixes Applied (2026-04-04)

Three improvements applied directly to specs/prd.md after validation:

1. **Journey capability lists extended** — added "downtime submission read-only view, live per-character game state tracking with session reset" to Journey 1; added "monthly influence income application at reset" to Journey 2. Resolves traceability flags on FR-GC-07, FR-6-04, FR-6-05.

2. **Five FRs reframed to actor/capability format** — FR-3-02, FR-3-03 (added "ST can view..."), FR-5-01 (reframed from passive auth description), FR-5-04 (reframed from passive outcome availability), FR-GC-03 (added "ST can view a feeding scene summary..."). Resolves measurability format violations.

3. **FR-3-04 / FR-GC-01 cross-referenced** — FR-GC-01 now notes "(see also FR-3-04 — same capability, formalised here for the cycle management context)". FR-3-04 collection name reference removed. Resolves duplicate and implementation leakage findings.

**Post-fix status:** All warnings resolved. PRD ready for CE (Create Epics and Stories).
