---
id: ord.4
epic: ord
status: review
priority: medium
depends_on: [ord.3]
---

# Story ORD-4: ST creates blank dossier or history from scratch

As an ST,
I want to create a new blank dossier or history_submission document for a character without uploading a .docx,
So that I can author a fresh dossier in-app for newly-joined characters or characters who lack a document.

---

## Context

The admin Archive panel today has only a .docx upload form. For characters who have no existing .docx (newly-joined players, or the one character in `tm_deprecated` whose dossier was never authored), there is no way to create an archive document natively.

This story adds a "create blank" affordance and the backing `POST /api/archive_documents` endpoint. Once created, the document opens in the ORD.3 inline editor with empty content.

---

## Acceptance Criteria

**Given** I am ST on the admin archive panel for a character **Then** two "Create blank" affordances appear near the upload form: **+ New Dossier** and **+ New History**.

**Given** I click **+ New Dossier** **Then** `POST /api/archive_documents` is called with `{ character_id, type: 'dossier', title: 'Dossier', content_html: '', visible_to_player: true }`.

**Given** the POST succeeds **Then** the archive list refreshes. **And** the new document appears. **And** opening it lands in ORD.3 edit mode with an empty pane ready to type into.

**Given** I click **+ New History** **Then** the same flow fires with `type: 'history_submission', title: 'Character History'`.

**Given** `POST /api/archive_documents` **Then** it requires ST role (`requireRole('st')`). **And** validates: `type` in the allowed enum (`dossier`, `history_submission`, `downtime_response`, `primer`), `character_id` required unless type is `primer`, `character_id` resolves to a real character.

**Given** `type='primer'` via this endpoint **Then** the existing single-primer constraint is honoured: if a primer exists, 409 CONFLICT; if not, it is created.

**Given** `type='dossier'` and the character already has a dossier **Then** the API rejects with 409 CONFLICT (design decision: one dossier per character, matching primer's type-uniqueness pattern). **And** the admin UI surfaces the conflict with a useful message ("This character already has a dossier. Open it to edit.").

**Given** `type='history_submission'` and the character already has a history_submission **Then** same 409 pattern.

**Given** POST without ST role **Then** 403.

**Given** invalid `character_id` **Then** 400.

---

## Implementation Notes

- The POST handler mirrors the existing upload flow's validation and character-id parsing. No mammoth step; `content_html` is accepted directly (empty string for create-blank).
- **Dossier uniqueness**: the existing upload endpoint does NOT enforce uniqueness. Deciding type-uniqueness per character is a new constraint. If that breaks any real workflow (e.g. STs keeping historical versions as separate docs), reconsider. For now, enforce one-per-type.
- **UI integration**: buttons live in `public/js/admin/archive-admin.js` alongside the upload form. On successful create, call `renderArchiveAdmin()` to refresh, then open the detail view in edit mode (ORD.3 integration).
- **Tests**: `server/tests/api-archive-documents.test.js` gets POST coverage: ST creates dossier, ST creates history, 409 on duplicate, 403 for players, 400 on bad input.
- **Smoke**: as ST, on a character with no dossier, click **+ New Dossier**, confirm the inline editor opens empty, type content, Save, open in player view, confirm visible.

## Files expected to change

- `public/js/admin/archive-admin.js` (create buttons and post-create redirect)
- `server/routes/archive-documents.js` (new POST handler)
- `server/tests/api-archive-documents.test.js`
