# Covenant Questionnaire Schema

Describes the shape of documents in the `covenant_questionnaires` collection.
Derived from the Google Forms "Covenant Questionnaire" ordeal — a branching
knowledge and roleplay test where questions differ based on the character's
covenant.

---

## Overview

The form begins with a shared Q1 (covenant selection), then branches into one
of four covenant-specific question sets (Q2–Q23, 22 questions each). Questions
blend lore knowledge, philosophical interpretation, and in-character scenario
responses. 12 respondents across all four covenants.

---

## Top-level document structure

| Key | Type | Notes |
|---|---|---|
| `question_references` | object | Keyed by covenant slug → array of question metadata |
| `submissions` | array | One document per respondent |

---

## `question_references` object

Keyed by covenant slug: `"carthian"`, `"crone"`, `"invictus"`, `"lancea"`.
Each value is an array of question objects:

| Field | Type | Notes |
|---|---|---|
| `key` | string | Answer key: `"q02"` through `"q23"` |
| `number` | integer | Question number (2–23) |
| `column_index` | integer | Original CSV column index |
| `text` | string | Full question text |

### Question structure per branch

Each covenant's 22 questions follow a consistent arc:

| Range | Topic |
|---|---|
| Q02–Q12 | Covenant lore, philosophy, history, structure, and inter-covenant relations |
| Q13–Q16 | Critical analysis and provocative prompts (weaknesses, hypocrisy, dangers) |
| Q17–Q19 | Personal character connection (why this covenant, position, relationships) |
| Q20–Q23 | In-character scenario responses (political dilemmas, moral challenges) |

---

## Submission document

| Field | Type | Required | Notes |
|---|---|---|---|
| `character_id` | ObjectId | no | FK → `characters._id` (populated on import) |
| `character_name` | string | yes | Canonical character name |
| `player_email` | string | yes | Submitter's email |
| `submitted_at` | string | yes | ISO timestamp |
| `covenant` | string | yes | Covenant slug: `"carthian"` / `"crone"` / `"invictus"` / `"lancea"` |
| `covenant_label` | string | yes | Display name: `"The Carthian Movement"` / `"The Circle of the Crone"` / `"The Invictus"` / `"The Lancea et Sanctum"` |
| `answers` | object | yes | Keyed by question key → free-text answer string |
| `questions_answered` | integer | yes | Count of non-empty answers (out of 22) |

### `answers` object

Keys are `q02` through `q23`. Only questions from the respondent's covenant
branch are present. Values are verbatim player-written strings.

---

## Respondent breakdown

| Covenant | Respondents |
|---|---|
| The Carthian Movement | Einar Solveig, Macheath 'Mac', René Meyer, Yusuf 'Mammon' Kalusicj |
| The Circle of the Crone | Brandy LaRoux, Ivana Horvat, Jack Fallow |
| The Invictus | René St. Dominique, Ryan Ambrose |
| The Lancea et Sanctum | Carver, Conrad Sondergaard, Kirk Grimm |

---

## Import notes

- **12 submissions**, all on-roster. 18 canonical characters did not submit.
- One respondent ("Nathan Hodge") submitted their player name rather than
  character name; resolved to Einar Solveig via email cross-reference.
- Two respondents answered 21/22 (Yusuf skipped one Carthian question; Carver
  skipped one Lancea question). All others answered the full 22.
- The `covenant` field is a slug for programmatic use; `covenant_label` is the
  display string matching in-world naming conventions.
- Q1 ("Which covenant is your character joining?") is not stored in `answers`
  as it is captured in the `covenant`/`covenant_label` fields.
