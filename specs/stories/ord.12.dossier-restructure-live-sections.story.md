---
id: ord.12
epic: ord
status: review
priority: medium
depends_on: [ord.3]
---

# Story ORD-12: Dossier restructure — live sections above editable history

As an ST and as a player,
I want the dossier detail view to render the character's core info and questionnaire details live at the top of the pane, with the ST-editable narrative limited to the history prose beneath,
So that the dossier stops duplicating character-sheet data baked into `content_html`, the edit scope matches what STs actually author, and the page adapts automatically as the underlying character sheet and questionnaire responses change.

---

## Context

Current shape (ORD-3 end state): the `archive_documents.content_html` for a dossier contains everything — character identity metadata at the top (name, player, pronouns, clan, covenant, embrace date, BP, apparent age, humanity, mask, dirge, status tiers), followed by CONCEPT / HISTORY / EMBRACE / SIRE / MORTAL TIES / Touchstones / Feeding / First Kill / Indulgences / Beliefs / Goals / Triggers / ST Notes narrative.

Most of the top block duplicates data already on `tm_suite.characters`. Each dossier edit therefore requires re-typing metadata that has a live source, and the two drift when the character sheet updates.

This story splits the dossier render into three sections:

1. **Core Info Card** — live-rendered from `tm_suite.characters`. Name, clan, bloodline, covenant, mask, dirge, BP (dots), apparent age, humanity, date of embrace, city/clan/covenant status. No data captured in `archive_documents`.
2. **Questionnaire Details** — live-rendered from `questionnaire_responses` (the collection, not the form). Iterates the fields the player has answered (concept, ambitions, views, goals, etc.) with the labels defined in `questionnaire-data.js`. Skips empty fields and the meta Player Info section.
3. **History Narrative** — the existing `content_html`. What the ORD-3 inline editor edits. Intended going forward as prose-only: backstory, feeding pattern, first kill, indulgences, beliefs and views, goals, triggers, ST notes. STs prune the now-redundant metadata block from each dossier as they edit (no forced migration).

Applies only to `type='dossier'`. `history_submission` and `downtime_response` continue to render as single content panes.

---

## Acceptance Criteria

**Given** I open an `archive_documents` document where `type='dossier'` **Then** three sections render in the pane, in order: Core Info Card, Questionnaire Details, History Narrative.

**Given** the Core Info Card **Then** it renders live from the character sheet with the following fields, each skipping gracefully when the source field is blank:
- Display name (via existing `displayName(char)` helper)
- Clan (with clan icon via `clanIcon`)
- Bloodline if present
- Covenant (with cov icon via `covIcon`)
- Mask and Dirge (as pair)
- Blood Potency (rendered as U+25CF dots, same pattern as questionnaire char header)
- Apparent age
- Humanity
- Date of embrace (formatted as "DD Month YYYY")
- City Status, Clan Status, Covenant Status (numeric)

**Given** the card styling **Then** it uses existing `.reading-pane` tokens (so it adapts to dark/light mode per ORD-3 polish) and is visually distinct from the history narrative by structure (definition-list or grid), not by a competing background.

**Given** the Questionnaire Details section **Then** it fetches `GET /api/questionnaire?character_id={doc.character_id}` and:
- Skips rendering entirely if no response exists or the response has no populated narrative fields
- Skips the `player_info` section (meta, not narrative)
- Iterates `QUESTIONNAIRE_SECTIONS` and renders only fields whose `responses[field.key]` has a value, using the field `label` from `questionnaire-data.js` for display
- Renders the response using the existing read-only field renderer pattern (`renderReadOnlyField` in `questionnaire-form.js`) or a close equivalent — dynamic lists, checkbox tag lists, radio labels, textareas all rendered inline-appropriately

**Given** the History Narrative section **Then** it renders the existing `content_html` beneath the two live sections, wrapped in `.reading-pane` for consistency.

**Given** I am ST and click Edit **Then** the ORD-3 inline editor opens on the history narrative only. The editor's `initialHtml` parameter is `doc.content_html` (unchanged from ORD-3). On Save, `PUT /api/archive_documents/:id` writes `content_html` (unchanged). Core Info Card and Questionnaire Details are never editable from this pane.

**Given** I save the editor **Then** the pane re-renders with the three sections; the new history narrative picks up the saved `content_html`; the live sections re-render from the same character data (no refetch needed unless the character sheet or questionnaire changed in the interim).

**Given** I am a player viewing my own character's dossier **Then** the three sections render in the same layout, but no Edit button appears. Core Info Card and Questionnaire Details always visible (as before — player's own questionnaire responses, their own character sheet).

**Given** the character has no `questionnaire_responses` document yet **Then** the Questionnaire Details section is hidden entirely (no empty placeholder heading).

**Given** a dossier whose `content_html` still contains the legacy metadata block at top (all 29 migrated dossiers currently) **Then** it renders as-is. STs are expected to prune the redundant metadata manually over time when they next edit. No forced migration of existing content.

**Given** the document type is `history_submission` or `downtime_response` **Then** the detail pane renders unchanged (no Core Info Card, no Questionnaire Details, no scope change on the Edit button).

**Given** the Core Info Card **Then** it responds to dark/light mode via the `--rp-*` token overrides landed in ORD-3 polish (no new colour tokens required).

---

## Implementation Notes

- The archive tab already has `_char` loaded as the active character. The Core Info Card consumes this directly — no additional API call needed for character data.
- Questionnaire fetch piggy-backs on existing `GET /api/questionnaire?character_id=X` (see `server/routes/questionnaire.js`). Player permission model already correct: player owns, ST sees all.
- Reuse `displayName`, `clanIcon`, `covIcon` from `../data/helpers.js` — same imports the questionnaire form uses. No new helpers required.
- The existing questionnaire form's `renderReadOnlyField` in `public/js/tabs/questionnaire-form.js` encapsulates the per-type read-only rendering logic (dynamic_list cards, tag lists, radio labels, textarea plain text). Either factor it out to `public/js/editor/questionnaire-render.js` (new) so both form and archive can import, or inline a slimmed copy in `archive-tab.js`. **Prefer extraction** — both surfaces benefit from one source of truth on field rendering.
- Importing `QUESTIONNAIRE_SECTIONS` from `public/js/tabs/questionnaire-data.js` is already done in the form; archive-tab.js adds the same import.
- Card layout: prefer a definition-list (`<dl>`) or simple two-column grid of `<dt>`/`<dd>` pairs. Keep the card visually subdued — no heavy borders competing with the pane's existing border. Match the typography hierarchy of the existing questionnaire char-header (`.qf-char-identity`, `.qf-char-archetypes`, etc.) rather than inventing a new aesthetic.
- BP dot render: same pattern as `questionnaire-form.js` line 455: `'●'.repeat(parseInt(bp) || 0) || bp`.
- The `_char` variable in `archive-tab.js` closure is set by `initArchiveTab` when the tab opens. `renderDocDetail` can reference it directly.
- Legacy `content_html` still duplicates the metadata at the top of existing dossiers. **Do not auto-strip**. STs prune as they edit. If during the review phase a stripping script becomes desirable, spin a follow-up story.
- The editor flow is unchanged: `PUT /api/archive_documents/:id` still writes whole `content_html`. The only semantic difference is what content_html *should* contain going forward (narrative, not metadata duplicate). No schema change.

---

## Files Expected to Change

- `public/js/tabs/archive-tab.js` — adds `renderCoreInfoCard(char)`, calls `GET /api/questionnaire?character_id=…` for dossier type, renders three-section layout inside `renderDocDetail` when `doc.type === 'dossier'`; other types unchanged.
- `public/js/editor/questionnaire-render.js` (new) — extracts `renderReadOnlyField` (and any small helpers it depends on) from `questionnaire-form.js` so archive-tab.js can reuse it without importing the form module.
- `public/js/tabs/questionnaire-form.js` — imports the extracted `renderReadOnlyField` from the new module instead of defining it inline. No behavioural change.
- `public/css/components.css` — new classes for the Core Info Card (`.arc-core-card`, `.arc-core-grid`, `.arc-core-label`, `.arc-core-value`) and the Questionnaire Details block (`.arc-quest-details`). Scoped to archive tab. Use existing `--rp-*` tokens.

---

## Definition of Done

- All ACs verified in browser against a real dossier (e.g. Alice Vunder — has character sheet, questionnaire response, and an imported dossier with content_html).
- Player view verified (no Edit button; three sections render).
- ST view verified (Edit button, inline editor operates on content_html only).
- Dark/light mode both render cleanly.
- No regression in `history_submission` or `downtime_response` rendering.
- File list in the completion note matches files actually changed.

---

## Dev Agent Record

### Implementation Notes

Implemented 2026-04-24 under the bmad-dev-story workflow.

- `renderReadOnlyField` extracted from `questionnaire-form.js` into a new shared module `public/js/editor/questionnaire-render.js`. Both the form and the archive tab now import from there; behaviour unchanged on the form side.
- `archive-tab.js` gained `renderCoreInfoCard(char)` and `renderQuestionnaireDetails(responses)` helpers plus a branch in `renderDocDetail` that renders three sections for `type='dossier'` and falls through to the original single-pane render for other types.
- Layout decision: all three sections stack inside one outer `.reading-pane` with `border-bottom` separators between them, rather than three distinct panes. Reads as one cohesive document; matches the existing visual expectation of a dossier as a single parchment surface.
- Questionnaire details fetch is piggy-backed into `openDocDetail` (best-effort; null response hides the section cleanly). Character data reuses the already-loaded `_char` closure variable.
- BP rendering reuses the `'●'.repeat(n) || bp` pattern proven in `questionnaire-form.js`.
- Legacy `content_html` for the 29 migrated dossiers still contains the metadata block at top — per the story's non-goal, this is left for STs to prune as they edit. No auto-migration.

### File List

- `public/js/editor/questionnaire-render.js` (new) — shared `renderReadOnlyField` module
- `public/js/tabs/questionnaire-form.js` (modified) — imports `renderReadOnlyField` from the new module; local definition removed
- `public/js/tabs/archive-tab.js` (modified) — imports `QUESTIONNAIRE_SECTIONS`, `renderReadOnlyField`, `clanIcon`, `covIcon`; adds `renderCoreInfoCard`, `renderQuestionnaireDetails`; three-section render for dossier type; single-pane render preserved for other types
- `public/css/components.css` (modified) — new `.arc-core-card`, `.arc-core-*`, `.arc-quest-details`, `.arc-quest-section`, `.arc-quest-section-title`, `.arc-history-heading` rule blocks

### Smoke test

Pending deploy. Local smoke blocked because live character and questionnaire data are gated behind real OAuth (localTestLogin can authenticate the API but the data in tm_suite is only reachable from a logged-in browser session against prod). Next push to main unblocks browser verification of:

- ST view: three sections render; Edit opens inline editor on `content_html` only; save persists and re-renders correctly.
- Player view: three sections render; no Edit button.
- Dark/light mode parity.
- history_submission and downtime_response unchanged.

### Change Log

- 2026-04-24 — ORD-12 implemented (bmad-dev-story workflow). Status: ready-for-dev → in-progress → review.
