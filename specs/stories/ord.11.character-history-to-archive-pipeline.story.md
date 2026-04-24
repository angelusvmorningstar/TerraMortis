---
id: ord.11
epic: ord
status: draft
priority: medium
depends_on: [ord.3, ord.4, ord.9]
---

# Story ORD-11: Refine character_history submission into archive_documents

As an ST reviewing a character_history ordeal,
I want a "Refine to archive" action that takes the raw history text and produces a `history_submission` archive document in-app,
So that the refined history appears in the player's Archive tab as a readable document alongside their dossier.

---

## Context

`character_history` ordeal submissions land in `ordeal_submissions` with the raw text in `responses[0].answer`. The player's Archive tab already knows how to render `history_submission` type archive documents, but nothing today bridges the raw submission to the refined archive entry.

This story adds the bridge: a single ST action that creates (or opens, if already refined) the `history_submission` archive document, pre-populated from the raw submission text, ready for the ST to polish in the ORD.3 inline editor.

---

## Acceptance Criteria

**Given** I am ST opening a character_history submission in the admin review surface (`public/js/admin/ordeals-admin.js` or equivalent) **Then** a **Refine to archive** button is present on the review pane.

**Given** I click **Refine to archive** **And** no existing `history_submission` archive document exists for this character **Then** `POST /api/archive_documents` is called with:
- `character_id` = submission.character_id
- `type` = `'history_submission'`
- `title` = `'Character History'`
- `content_html` = the raw `responses[0].answer` wrapped in a minimal HTML scaffold (paragraphs split by double newlines, line breaks preserved)
- `visible_to_player` = `true`

**Given** the POST succeeds **Then** the ST is redirected into the ORD.3 inline editor on the new document so they can polish prose before "publishing" (polishing is in-place; saving makes it visible).

**Given** I click **Refine to archive** **And** an existing `history_submission` archive document already exists for this character **Then** the ST is redirected into the ORD.3 edit view on that existing document. **And** no duplicate is created. **And** a small notice indicates "Opening existing refined history".

**Given** the player opens their Archive tab **Then** the refined history appears as a file card with title **Character History**. **And** clicking it opens the read view using `.reading-pane` styling.

**Given** the character_history submission's marking **Then** it remains at the ordeal level; the archive document is a presentation artefact, not the source of XP. **And** the ordeal's `+3 XP` on completion is unchanged.

**Given** the character is retired **Then** the archive document follows the existing archive lifecycle; no new retirement logic is added in this story.

**Given** an ST wants to regenerate the refined history from the raw submission (e.g. after editing the raw submission) **Then** that is an explicit separate action not covered here; this story creates once and edits in place.

---

## Implementation Notes

- **HTML scaffolding from plain text**: split `responses[0].answer` on double-newlines to produce paragraphs. Wrap each in `<p>`. Preserve single newlines as `<br>` OR collapse to whitespace (pick one; `<br>` feels closer to the author's intent for historical imports).
- **API behaviour**: the ORD.4 POST handler enforces one-per-type per character via 409. Handle that: on 409, follow up with `GET /api/archive_documents?character_id=X` filtered to `type='history_submission'`, resolve the existing id, redirect to the editor.
- **Alternative**: add an `upsert=true` query param to `POST /api/archive_documents` that falls through to the existing doc when a conflict would occur. Keep the implementation clean either way.
- **Admin review surface location**: `public/js/admin/ordeals-admin.js` is the probable host; confirm during drafting that the surface has a per-submission detail view where a button can live.
- **No content mutation on the raw submission**: the ordeal_submissions doc stays intact. Only the archive_documents entry holds the refined version.
- **Testing**: `server/tests/api-ordeal-history-refine.test.js` covers: creates new archive doc on first refine; redirects to existing on second refine; permissions (ST only); doc ends up with correct type and title.

## Files expected to change

- `public/js/admin/ordeals-admin.js` (Refine button and redirect logic)
- `server/routes/archive-documents.js` (optional `upsert` handling or rely on ORD.4's 409 + follow-up fetch)
- `server/tests/api-ordeal-history-refine.test.js` (new)
