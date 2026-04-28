---
id: ord.3
epic: ord
status: done
priority: high
depends_on: []
---

# Story ORD-3: ST inline editor on Archive detail view

As an ST,
I want to edit a player's dossier or history from inside their Archive detail view with a small toolbar,
So that I can refine content without leaving the app or re-uploading a .docx.

---

## Context

The Archive infrastructure (`archive_documents` collection, game-app Archive tab, admin Archive upload panel) already ships. Today the only way to create or modify a dossier or history document is to author a .docx externally and upload it; `mammoth` converts it to HTML and stores on `content_html`.

This story adds an ST-gated inline editor to the existing detail view, so content can be tweaked in-app. The `.reading-pane` CSS class already in use drives both the read and edit surfaces (same typography, parchment styling as DT reports).

### Out of scope

- Rich media (images, tables, embedded files)
- Version history or revision diffs
- Markdown round-tripping (source-of-truth remains HTML)
- Client-side validation of well-formed HTML (trust the contentEditable output; server-side sanitisation discussed in Implementation Notes)

---

## Acceptance Criteria

**Given** I am ST and open `/api/archive_documents/:id` **Then** the detail pane renders with an "Edit" button next to the existing back link.

**Given** a player (non-ST) opens the same document **Then** no Edit button is rendered.

**Given** I click Edit **Then** the `.reading-pane` becomes `contenteditable="true"`. **And** a toolbar is pinned to the top of the pane.

**Given** the toolbar **Then** it exposes: Heading cycle (H2 / H3 / Paragraph), Bold, Italic, Unordered list, Ordered list, Link. Undo and redo rely on native browser keyboard shortcuts; no dedicated toolbar button needed.

**Given** I edit and click Save **Then** `PUT /api/archive_documents/:id` is called with `{ content_html }`. **And** server sets `updated_at = new Date().toISOString()`. **And** the response returns the updated doc minus `content_html` (matching the existing list projection pattern). **And** the pane returns to read mode showing the new content.

**Given** `PUT /api/archive_documents/:id` **Then** it requires ST role (`requireRole('st')`). **And** accepts only `{ content_html, title? }`. Any other field in the body is ignored. **And** an invalid id returns 400. **And** a missing doc returns 404.

**Given** a save fails (network error, 500, auth issue) **Then** an inline banner appears inside the pane (`role="alert"`), with the error message. No `window.alert()`.

**Given** I am editing and click Cancel **Then** unsaved changes are discarded. **And** the pane returns to the last-saved content.

**Given** the edit surface **Then** it inherits `.reading-pane` typography and spacing. The only visual delta between read and edit modes is the toolbar and a subtle "editing" border cue.

**Given** a player attempts `PUT /api/archive_documents/:id` directly via API **Then** 403.

---

## Implementation Notes

- **Editor module**: new `public/js/editor/archive-inline-editor.js`, ~100-150 lines. Exports `openInlineEditor(paneEl, docId, initialHtml, onSaved)`.
- **Toolbar implementation**: use `document.execCommand` for bold, italic, lists. Headings: wrap selection in `<h2>` / `<h3>` / `<p>` via a small helper (execCommand's `formatBlock` also works but cross-browser inconsistencies; choose whichever tests cleanly in Chrome + Safari).
- **Sanitisation (open question)**: contentEditable in the browser permits arbitrary HTML, including `<script>` and event handlers. Since only ST role can save, the trust level is high, but defensive sanitisation on the server (strip scripts and event attributes, allow only a whitelist of tags) is worth considering. Flagged as open question in the epic; decision during drafting.
- **Edit mode state**: `archive-tab.js` currently passes `content_html` into the detail render. Add a local `editing` flag; when true, swap `reading-pane` innerHTML for the contentEditable setup; when false, render normally.
- **Keyboard**: Ctrl+S / Cmd+S triggers Save while in edit mode.
- **Accessibility**: toolbar buttons have `aria-label` for each command. Edit toggle has `aria-pressed`.
- **Test coverage**: `server/tests/api-archive-documents.test.js` gets PUT tests: ST can update, player gets 403, missing doc returns 404, whitelist enforced.
- **Smoke**: as ST, open a seeded archive document, click Edit, make a change, Save, reload, confirm persistence. As player, open the same document, confirm no Edit button and direct PUT returns 403.

## Files expected to change

- `public/js/tabs/archive-tab.js` (Edit toggle wiring)
- `public/js/editor/archive-inline-editor.js` (new)
- `server/routes/archive-documents.js` (new PUT handler)
- `server/tests/api-archive-documents.test.js`
- `public/css/components.css` (toolbar layout if not covered by existing classes)
