# Rules Mastery Schema

Describes the shape of documents in the `rules_mastery` collection.
Derived from the Google Forms "Rules Mastery" ordeal — a pre-game mechanical
knowledge test covering VtR 2e game systems.

---

## Overview

A quiz of 55 numbered questions (Q10 split into two sub-parts, giving 56 answer
fields total), covering six topic areas: dice mechanics (Q01–Q05), blood and
feeding (Q06–Q10), disciplines (Q11–Q15), frenzy and humanity (Q16–Q25),
combat and damage (Q26–Q33), and advanced systems (Q34–Q55). All answers are
free-text. Not auto-graded; stored verbatim for ST review.

---

## Top-level document structure

| Key | Type | Notes |
|---|---|---|
| `question_reference` | array | Ordered list of question metadata |
| `submissions` | array | One document per respondent |

---

## `question_reference` array

| Field | Type | Notes |
|---|---|---|
| `key` | string | Answer key: `"q01"` through `"q55"`, with `"q10a"` and `"q10b"` for the split question |
| `number` | integer | Question number (1–55) |
| `column_index` | integer | Original CSV column index |
| `text` | string | Full question text |

### Question topics

| Range | Topic |
|---|---|
| Q01–Q05 | Dice mechanics (pool composition, exceptional success, Willpower, contested/resisted rolls, 10-again) |
| Q06–Q10 | Blood and feeding (Blood Potency feeding restrictions, Vitae drain, Ghouls, blood bonds, BP6+ immunities) |
| Q11–Q15 | Disciplines (activation pools, Clash of Wills, out-of-clan learning, supernatural resistance, dot limits) |
| Q16–Q25 | Frenzy and Humanity (frenzy triggers, bestial triad, Riding the Wave, breaking points, detachment, Touchstones, banes) |
| Q26–Q33 | Combat and damage (initiative, Defence, damage types, fire, healing, Doors system, Conditions/Beats) |
| Q34–Q55 | Advanced systems (Mask/Dirge, boons, Status, torpor, Blood Sympathy, staking, Vitae per turn, diablerie, the Kiss, sunlight, blood sorcery, Domain, Feeding Grounds, Elysium, Clash of Wills, Tilts, Devotions, coteries) |

---

## Submission document

| Field | Type | Required | Notes |
|---|---|---|---|
| `character_id` | ObjectId | no | FK → `characters._id` (populated on import) |
| `character_name` | string | yes | Canonical character name |
| `player_email` | string | yes | Submitter's email |
| `submitted_at` | string | yes | ISO timestamp |
| `answers` | object | yes | Keyed by question key → free-text answer string |
| `questions_answered` | integer | yes | Count of non-empty answers (out of 56) |

### `answers` object

Keys are `q01` through `q55`, with Q10 split into `q10a` (Vitae addiction
immunity) and `q10b` (blood bond immunity). Values are verbatim player-written
strings.

---

## Import notes

- **9 submissions** from 9 distinct characters, all on-roster. All respondents
  answered every question (56/56).
- This is a smaller respondent pool than Lore Mastery (15). The Rules Mastery
  ordeal requires deeper mechanical knowledge and was likely completed by the
  more experienced players.
- Q10 used a Google Forms checkbox grid with two sub-items (True/False for
  each), stored as separate answer keys `q10a` and `q10b`.
- Some answers are extensive multi-paragraph explanations; others are single
  words or True/False.
