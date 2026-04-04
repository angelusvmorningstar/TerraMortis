# Character History Schema

Describes the shape of documents in the `character_histories` collection.
Derived from the Google Forms "Character History" submission form.

---

## Overview

A lightweight collection storing extended character backstories submitted by
players. The form offered two submission methods: paste text directly, or
upload/link to an external document. Content is stored as-is with no structural
decomposition — these are narrative documents, not structured data.

---

## Top-level document

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | MongoDB primary key |
| `character_id` | ObjectId | no | FK → `characters._id` (populated on import) |
| `character_name` | string | yes | Canonical character name |
| `player_email` | string | yes | Submitter's email (from Google Forms) |
| `submitted_at` | string | yes | ISO timestamp of form submission |
| `submission_type` | string | yes | `"text"` / `"upload"` / `"link"` |
| `history_text` | string | conditional | Full backstory text (when `submission_type === "text"`) |
| `upload_url` | string | conditional | Google Drive file URL (when `submission_type === "upload"`) |
| `external_url` | string | conditional | External URL, e.g. Notion page (when `submission_type === "link"`) |
| `notes` | string | no | Supplementary notes submitted alongside an upload or link |

---

## Submission types

### `"text"` — inline backstory (10 submissions)

The `history_text` field contains the full narrative, ranging from ~2,400 to
~9,700 characters. Content is unstructured prose, sometimes including timelines,
playlists, or formatted sections. No HTML — plain text with newlines.

### `"upload"` — Google Drive document (4 submissions)

The `upload_url` field contains a Google Drive `open?id=` link. The actual
document content is not stored in MongoDB; the link is a reference for ST
access. These may be Google Docs, PDFs, or other file types.

### `"link"` — external page (1 submission)

The `external_url` field contains a link to an externally hosted page (e.g.
Notion). As with uploads, the content itself is not stored.

---

## Import notes

- **15 submissions** from 15 distinct characters.
- **16 canonical characters** have no history submission: Anichka, Casamir 'Cazz',
  Charles Mercer-Willows, Charlie Ballsack, Cyrus Reynolds, Eve Lockridge,
  Ivana Horvat, Jelle 'Gel' Dunneweld, Keeper, Livia, Ludica Lachramore, Magda,
  Margaret 'Doc' Kane, Reed Justice, Sister Hazel, Wan Yelong.
- One submission is from **Wayne Holloway**, who is not in the current 30-character
  canonical roster (same as the character questionnaire).
- `character_id` is null until the characters collection is populated in MongoDB.
- Player email is used as the join key to resolve `character_name` via the
  character questionnaires collection. One email (`m.bennett87@gmail.com`)
  required manual resolution to René St. Dominique.
