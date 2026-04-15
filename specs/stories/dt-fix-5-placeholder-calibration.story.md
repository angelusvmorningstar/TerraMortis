# Story DT-Fix-5: Prompt/Placeholder Calibration Audit

## Status: ready-for-dev

## Story

**As an** ST filling in DT Processing fields,
**I want** all input and textarea placeholder texts to be descriptive, fit within their field width, and not overflow or truncate,
**so that** I understand what each field expects without having to guess.

## Background

An audit of all `placeholder=` attributes in `downtime-views.js` revealed 17 distinct placeholders. Some are thin (single words), some may overflow their field, and some may no longer reflect the field's current purpose (especially after the removal of the ST Response block in DT-Fix-7).

---

## Known Placeholders (as of audit, 2026-04-15)

| Field | Current Placeholder | Location (~line) |
|---|---|---|
| ST notes (internal, thread) | `"ST notes (hidden from players)"` | 1121 |
| Resolution note | `"Resolution note (visible to player when approved)"` | 1198 |
| Ambience notes | `"Working notes about the territory picture this cycle..."` | 2630 |
| Sign-off note | `"Resolution note (visible to player when released)"` | 2804 |
| XP flag reason | `"Flag reason..."` | 2927 |
| Equipment reminder | `"e.g. +4 to pool, Rote quality, -1 Vitae"` | 4675 |
| Contacts subject | `"Sphere, person, or topic…"` | 6085 |
| Patrol observed | `"What was observed…"` | 6099 |
| Rumour content | `"What was heard…"` | 6129 |
| Feeding name | `"Short action name"` | 6255 |
| Feeding description | *(none — textarea has no placeholder)* | 6256 |
| Player's Pool | *(validated pool input — check current placeholder)* | 6563 |
| ST Response | `"Narrative response for the player..."` | 6615 — **REMOVE** (DT-Fix-7) |
| Player Feedback | `"Visible to player (pool correction reason, etc.)..."` | 6631 |
| ST Notes (action) | `"Add ST note..."` | 6652 |
| Project note (internal) | `"ST note for this project (internal)..."` | 8644 |
| Project writeup (player-visible) | `"Player-visible writeup for this project..."` | 8648 |
| Merit note | `"ST note for this action..."` | 8750 |

---

## Audit Criteria

For each placeholder, check:

1. **Descriptive** — does it tell the ST what to enter?
2. **Width-safe** — does it fit the field without truncation on a typical 1280px desktop? (Test in browser)
3. **Accurate** — does it reflect what the field is currently used for?
4. **Missing** — if a field has no placeholder, should it have one?

---

## Known Issues to Fix

1. **Feeding description textarea** (~line 6256): has no placeholder. Add: `"How does the character typically feed? What's the cover story?"`
2. **ST Response** (~line 6615): removed in DT-Fix-7 — no action needed here if DT-Fix-7 ships first.
3. **Feeding name** (~line 6255): `"Short action name"` is thin. Consider: `"e.g. The Thirsty Blade, quiet back alley…"`
4. Any placeholder with visible truncation in browser — shorten or reword.

---

## Acceptance Criteria

1. All active input/textarea fields in DT Processing have a placeholder.
2. No placeholder truncates in a 1280px-wide admin panel.
3. All placeholders accurately describe the field's current purpose.
4. Feeding description textarea has a meaningful placeholder.
5. If DT-Fix-7 has already shipped, the ST Response placeholder is gone — no action needed for that field.

---

## Tasks / Subtasks

- [ ] Task 1: Open DT Processing in browser, inspect each field listed above for truncation
- [ ] Task 2: Fix truncating placeholders — shorten or reword
- [ ] Task 3: Add placeholder to feeding description textarea
- [ ] Task 4: Improve feeding name placeholder
- [ ] Task 5: Check for any other fields with missing or misleading placeholders
- [ ] Task 6: Re-test all changed fields in browser

---

## Dev Notes

This story ships after DT-Fix-7 (Remove ST Response) if possible, to avoid touching the same lines twice. If sequencing doesn't allow it, skip the ST Response placeholder line — it will be deleted by DT-Fix-7.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Update placeholder strings at identified call sites |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
