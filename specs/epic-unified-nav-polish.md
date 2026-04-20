---
stepsCompleted: [1, 2, 3, 4]
status: complete
stories: 12
epics: 7
validatedDate: 2026-04-19
completedDate: 2026-04-19
inputDocuments:
  - specs/epic-unified-nav.md
  - specs/ux-design-unified-nav.md
  - public/js/app.js
  - public/css/suite.css
  - public/index.html
notes: nav.6 (Contested Roll defender picker) deferred — needs design spike before implementation
---

# TM Suite — Unified Nav Polish & Regressions

## Overview

This document tracks the second wave of work on the unified game app (`index.html`, dev branch) — regressions discovered during review, CSS/layout defects, logic polish, and two feature stories that require design before implementation.

**Companion epic:** `specs/epic-unified-nav.md` — original 3-epic structure (Navigation Shell, Content Migration, Contextual Intelligence)

**Prerequisite dependency:** Group 0 (dev data fixture) must ship before Groups A and B can be properly investigated and validated.

---

## Design & API Constraints

Same constraints as `epic-unified-nav.md` apply to all stories here. British English throughout.

---

## Epic List

| Group | Epic | Stories | Status |
|---|---|---|---|
| 0 | Dev Data Fixture | nav.1 | Complete |
| A | Tab Regressions | nav.2 | Complete |
| B | Blank Tabs | nav.3 | Complete |
| C | CSS & Layout Fixes | nav.4 | Complete |
| D | Logic & Polish | nav.5 | Complete |
| E | Feature Stories | nav.6 | Needs design — blocked |
| E | Feature Stories | nav.7 | Complete |
| E | Feature Stories | nav.9, nav.10, nav.11 | Complete |
| F | Scope Definition Required | nav.8 | Complete — placeholder shipped |

---

## Group 0: Dev Data Fixture

**Goal:** Give the dev shell access to real-ish data so regressions can be distinguished from data-starvation. Without this, Groups A and B cannot be properly investigated.

**Story:** `specs/stories/nav.1.dev-data-fixture.story.md`

---

## Group A: Tab Regressions

**Goal:** Restore functionality that existed in `player.html` (main branch) and was lost during the unified nav migration. Each tab listed here renders blank or incomplete in the dev build. Investigation must happen against the main branch source before fixes are written.

**Dependency:** nav.1 (dev data fixture) must be complete first.

**Story:** `specs/stories/nav.2.tab-regressions.story.md`

Tabs in scope: Feeding, Regency, Ordeals (clarify if Submit Ordeal and Ordeals are one tab or two), Sign-In, Emergency.

---

## Group B: Blank Tabs (Wiring)

**Goal:** Who's Who and Office are blank — likely a shared init/wiring failure rather than lost source code. Investigate the pattern, fix the root cause.

**Dependency:** nav.1 (dev data fixture) must be complete first.

**Story:** `specs/stories/nav.3.blank-tabs.story.md`

---

## Group C: CSS & Layout Fixes

**Goal:** A batch of visual defects — layout overflow, missing padding, contrast failures, doubled ToC, and sidebar tile width. All independent of data; can ship in parallel with Groups A/B.

**Story:** `specs/stories/nav.4.css-layout-fixes.story.md`

Issues in scope: #1 (again buttons), #2 (low contrast), #4 (sheet picker density), #5 (status padding), #9 (map padding + list), #18 (primer ToC), #20 (sidebar tile overflow).

---

## Group D: Logic & Polish

**Goal:** Small logic and ordering fixes — none require API changes or new UI design. Fast to ship.

**Story:** `specs/stories/nav.5.logic-polish.story.md`

Issues in scope: #12 (archive nav), #15 (hide closed tickets), #16 (lore nav order), #17 (rules search cursor), #21 (tracker names), #22 (tracker collapsed influence).

---

## Group E: Feature Stories (Design Required)

**Stories:**

- `nav.6` — Contested Roll inline defender picker. Status: **needs-design**. Do not implement until design spike complete.
- `nav.7` — Unified Downtime tab (merge DT Report + Submit DT). Status: **complete**.
- `nav.9` — Combat ST tool. Status: **complete**.
- `nav.10` — Equipment schema + sheet display + admin editor. Status: **complete**.
- `nav.11` — Conditions API persistence + tracker UI + sheet display. Status: **complete**.

---

## Group F: Scope Definition Required

**Goal:** Game Guide is empty but there is no decision on what it should contain or where the content comes from. This placeholder documents the open question.

**Story:** `specs/stories/nav.8.game-guide-scope.story.md`

**Status:** Complete — placeholder shipped ("Content coming soon. Ask your Storyteller."). Full implementation deferred until content source decision is made. Update nav.8 when decided.
