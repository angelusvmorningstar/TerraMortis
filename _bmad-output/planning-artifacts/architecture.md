---
stepsCompleted: [1, 2]
inputDocuments:
  - prd.md
  - product-brief-tm-suite.md
  - product-brief-tm-suite-distillate.md
workflowType: 'architecture'
project_name: 'TM Suite'
user_name: 'Angelus'
date: '2026-03-29'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
48 FRs across 9 capability areas. The heaviest areas architecturally are:
- Merit System (11 FRs) - derived grants, sharing calculations, prerequisite validation, multiple category-specific behaviours
- Dice Rolling (7 FRs) - pool construction from character data, multiple roll modes, contested rolls
- Character Data Management (8 FRs) - CRUD operations, derived stat calculation, data separation

**Non-Functional Requirements:**
18 NFRs with the most architecturally significant being:
- NFR5: Performance parity with single-file implementation
- NFR15: No JS file exceeds 500 lines
- NFR16: CSS tokens in one file, no hardcoded colours
- NFR17: Reference data as separate JSON files
- NFR18: Predictable, navigable file structure

**Scale and Complexity:**
- Primary domain: Static SPA, vanilla JS
- Complexity level: Medium
- Estimated architectural components: 15-20 modules

### Technical Constraints and Dependencies

- No build step - ES modules (`<script type="module">`) only
- No framework - vanilla HTML/CSS/JS throughout
- Static deployment to GitHub Pages
- Character data loaded from GitHub-hosted JSON
- Reference databases (MERITS_DB, DEVOTIONS_DB, MAN_DB, ICONS) must be externalised from inline JS to separate files
- Territory tab currently uses React CDN - must be rewritten to vanilla JS
- Google Fonts loaded from CDN (Cinzel, Cinzel Decorative, Lora)

### Cross-Cutting Concerns Identified

- **Data access layer** - every feature needs character data; currently each app loads it differently
- **Design tokens** - shared CSS custom properties used across all views and consistent with campaign website
- **British English** - spelling conventions throughout UI text and code comments
- **Derived calculations** - stats, merit sharing, XP-to-dots conversions used across multiple modules
- **Schema compliance** - v2 schema rules (attributes as `{dots, bonus}`, skills as `{dots, bonus, specs, nine_again}`, etc.) must be enforced consistently
