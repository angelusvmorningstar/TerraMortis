---
id: ord.1
epic: ord
status: done
priority: medium
depends_on: []
---

# Story ORD-1: Strip character-schema-redundant fields from Questionnaire

As an ST,
I want the Character Questionnaire to stop asking players for data that already lives on the character sheet or the player record,
So that the ordeal captures only narrative material and the "no dead data" principle is honoured going forward.

---

## Context

The Character Questionnaire in `public/js/tabs/questionnaire-data.js` currently asks for fifteen-plus fields whose values are already authoritatively stored elsewhere (character schema fields, player record fields, or the NPCR touchstones[] list). Keeping these questions creates duplicate capture and invites drift between the ordeal answer and the live value.

This story removes fields redundant with **character schema** and **player record**. NPCR-overlap fields are handled separately in ORD.2.

### Redundancy audit

| Field removed | Redundant with |
|---|---|
| `player_name` | Discord auth / player record |
| `discord_nickname` | Discord auth / player record |
| `character_name` | `characters.name` + `moniker` + `honorific` |
| `high_concept` | `characters.concept` |
| `clan` | `characters.clan` |
| `bloodline` | `characters.bloodline` |
| `covenant` | `characters.covenant` |
| `blood_potency` | `characters.blood_potency` |
| `apparent_age` | `characters.apparent_age` |
| `mask` | `characters.mask` |
| `dirge` | `characters.dirge` |
| `touchstones` (free-text) | `characters.touchstones[]` (NPCR.4 structured) |

---

## Acceptance Criteria

**Given** `public/js/tabs/questionnaire-data.js` **Then** the twelve listed question definitions are removed entirely from the `QUESTIONNAIRE_SECTIONS` array.

**Given** the removal leaves a section empty (e.g. Player Info after removing `player_name` and `discord_nickname`) **Then** the section is either collapsed to only its remaining fields or removed if nothing remains; no empty section headings.

**Given** a player opens the Character Questionnaire form **Then** the remaining questions render cleanly without visible empty blocks, trailing dividers, or orphaned field numbering.

**Given** the completion gate logic in `questionnaire-form.js` **Then** the required-fields check is recomputed for the slimmer set. The three surviving required fields (`court_motivation`, `ambitions_sydney`, `why_sydney`) are still mandatory; the ordeal is "complete" when those are non-blank AND the rest of the form has had a thoughtful pass (existing rule).

**Given** an existing historical `questionnaire_responses` document with removed fields populated **Then** the document loads without error. **And** the read-only review view omits the removed fields (does not render them with values).

**Given** a new submission created after this story ships **Then** the removed field keys are not present on the saved document even if legacy client state contains them (form-level strip at save boundary).

**Given** the ordeal status resolver in `ordeals-view.js` **Then** it continues to report Completed / In Progress / Not Started correctly for both slim new submissions and legacy populated submissions.

---

## Implementation Notes

- The removals are surgical edits inside `QUESTIONNAIRE_SECTIONS`. No schema migration; historical docs keep their fields (`questionnaire_responses` has `additionalProperties: true`).
- Player Info after this strip keeps `facebook_name`, `gaming_style_tags`, `gaming_style_pvp`, `gaming_style_note`, `support_tags`, `support_note`. Rename the section if appropriate.
- Character Profile after this strip keeps `bloodline_rationale`, `covenant_factions`, `conflict_approach`. Consider whether the section is worth retaining as a section or folding into the next one.
- Character History section loses `touchstones` (the free-text one). Do not touch the NPCR-owned `character.touchstones[]`.
- Test coverage: extend `server/tests/api-questionnaire.test.js` to assert that a submission with removed fields has them stripped on save and that a minimal submission still passes validation.
- Smoke: open a fresh character questionnaire form in the browser, confirm the slimmer field set renders cleanly, submit, verify `tm_suite.questionnaire_responses` has no redundant fields.

## Files expected to change

- `public/js/tabs/questionnaire-data.js`
- `public/js/tabs/questionnaire-form.js` (save-boundary strip + completion gate)
- `public/js/tabs/ordeals-view.js` (status resolver sanity)
- `server/tests/api-questionnaire.test.js`
