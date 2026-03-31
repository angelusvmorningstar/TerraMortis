# Story 3.1: Professional Training Grant System

**Status:** Done

**Epic:** 3 — ST Admin Features

**Priority:** Standard

## Story

**As a** Storyteller viewing a character sheet,
**I want** Professional Training dot-level benefits to be automatically applied and displayed,
**so that** I can see at a glance what each character's PT rating grants without looking up the rules.

## VtR 2e Rules Reference

- **Dot 1 (Networking):** 2 dots of Contacts in the profession's field
- **Dot 2 (Continuing Education):** 9-again on Asset Skills
- **Dot 3 (Breadth of Knowledge):** Third Asset Skill + 2 free Specialisations in Asset Skills
- **Dot 4 (On the Job Training):** +1 Skill dot in an Asset Skill (player choice)
- **Dot 5 (The Routine):** Spend WP for rote quality on an Asset Skill (roll mechanic)

## Acceptance Criteria

1. Characters with PT dot 1+ automatically receive a derived Contacts merit (2 dots, area = role name), tagged "Professional Training".
2. Characters with PT dot 2+ show "9-Again (PT)" on their asset skills in the skills section, without modifying stored skill data.
3. Free specialisation count uses PT dot 3 threshold (not dot 2) per VtR 2e rules.
4. PT view mode displays dot-level benefit descriptions (like MCI shows its grants).
5. PT-derived Contacts are stripped and re-injected each render cycle (same pattern as MCI grants).
6. Existing PT editing (role, asset skills, dot allocation) is unchanged.

## Changes Made

- `public/js/editor/mci.js` — Extended `applyDerivedMerits()` with PT grant logic (Contacts injection, `_pt_nine_again_skills` tracking)
- `public/js/editor/sheet.js` — Skill rendering checks `_pt_nine_again_skills` for PT 9-again badge; fixed free specs threshold from `>=2` to `>=3`; `_renderPT()` shows dot-level benefit descriptions in view mode

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-03-31 | 1.0 | Implemented | Claude (Dev) |
