# Lore Mastery Schema

Describes the shape of documents in the `lore_mastery` collection.
Derived from the Google Forms "Lore Mastery" quiz — a pre-game knowledge
check covering VtR 2e fundamentals.

---

## Overview

A quiz of 44 numbered questions plus one unnumbered follow-up, covering four
topic areas: vampire fundamentals (Q01–Q10), kindred society (Q11–Q20),
disciplines (Q21–Q29 + extra), and covenant powers and clans (Q30–Q44).
All answers are free-text strings. The quiz is not auto-graded; answers are
stored verbatim for ST review.

---

## Top-level document structure

The JSON file contains two root keys:

| Key | Type | Notes |
|---|---|---|
| `question_reference` | array | Ordered list of question metadata (see below) |
| `submissions` | array | One document per respondent (see below) |

---

## `question_reference` array

Each entry maps an answer key to its question text and source column.

| Field | Type | Notes |
|---|---|---|
| `key` | string | Answer key used in submissions: `"q01"` through `"q44"`, plus `"q_extra_29"` |
| `number` | integer / null | Question number (1–44), or null for the unnumbered extra |
| `column_index` | integer | Original CSV column index |
| `text` | string | Full question text |

### Question topics

| Range | Topic |
|---|---|
| Q01–Q10 | Vampire fundamentals (Vitae, Beast, Torpor, Blood Potency, Mask/Dirge, Touchstones, weaknesses, Ghouls, Frenzy) |
| Q11–Q20 | Kindred society (Traditions, Covenants, age categories, Elysium, Praxis, court positions, Domain) |
| Q21–Q29 + extra | Disciplines (physical disciplines, clan uniques, Devotions, out-of-clan learning, Elysium usage, activation costs) |
| Q30–Q44 | Covenant powers and clans (blood sorceries, covenant specifics, Blood Sympathy, bloodlines, clan curses) |

---

## Submission document

| Field | Type | Required | Notes |
|---|---|---|---|
| `character_id` | ObjectId | no | FK → `characters._id` (populated on import) |
| `character_name` | string | yes | Canonical character name |
| `player_email` | string | yes | Submitter's email |
| `submitted_at` | string | yes | ISO timestamp |
| `answers` | object | yes | Keyed by question key → free-text answer string |
| `questions_answered` | integer | yes | Count of non-empty answers (out of 45) |

### `answers` object

Keys are `q01` through `q44` plus `q_extra_29`. Values are verbatim
player-written strings. Missing keys indicate unanswered questions.

Example:
```json
{
  "q01": "Vitae",
  "q02": "The Beast",
  "q07": "Sunlight, Fire and Frenzy",
  "q_extra_29": "Yes"
}
```

---

## Import notes

- **15 submissions** from 15 distinct characters.
- **Ivana Horvat** submitted with only 1 answer (likely accidental partial submission).
- The unnumbered question at column 29 ("Can you use Disciplines on other vampires
  in Elysium?") is a follow-up to Q20 about Elysium rules, stored as `q_extra_29`.
- Answers are free-text and not validated against correct answers. Some players
  gave detailed explanations, others gave single-word responses.
- 15 of 30 canonical characters responded. No retired or non-roster characters
  are present in this dataset.
