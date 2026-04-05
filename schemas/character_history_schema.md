# Character History Schema

Describes the shape of documents in the `character_histories` collection.
Derived from the Google Forms "Character History" submission form.

---

## Overview

A lightweight collection storing extended character backstories submitted by
players. The form offered two submission methods: paste text directly, or
upload/link to an external document. In practice all 14 submissions include
inline text in `history_text`; four of those also include a Google Drive URL
in `original_upload_url` as a supplementary reference.

---

## Top-level document

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | MongoDB primary key |
| `character_id` | ObjectId | no | FK → `characters._id` (null until resolved) |
| `character_name` | string | yes | Canonical character name as submitted |
| `player_email` | string | yes | Submitter's email (from Google Forms) |
| `submitted_at` | string | yes | ISO timestamp of form submission |
| `submission_type` | string | yes | Always `"text"` in this dataset |
| `history_text` | string | yes | Full backstory text — present on all 14 documents |
| `original_upload_url` | string | no | Google Drive `open?id=` link; present on 4 documents alongside `history_text` |
| `notes` | string | no | Supplementary notes; present on 1 document (René Meyer) |

---

## Import notes

- **14 submissions** from 14 distinct characters in the current data file.
- One additional submission exists from **Wayne Holloway**, who is not in the
  canonical character roster and was excluded from the import file.
- `character_id` is null on all documents until the characters collection is
  populated in MongoDB and the join is resolved.
- Player email is used as the join key to resolve `character_name`. One email
  (`m.bennett87@gmail.com`) required manual resolution to René St. Dominique.
- **17 canonical characters have no history submission:** Anichka,
  Casamir 'Cazz', Charles Mercer-Willows, Charlie Ballsack, Cyrus Reynolds,
  Eve Lockridge, Ivana Horvat, Jelle 'Gel' Dunneweld, Julia, Keeper, Livia,
  Ludica Lachramore, Magda, Margaret 'Doc' Kane, Reed Justice, Sister Hazel,
  Wan Yelong.
