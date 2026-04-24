---
status: draft
version: "0.1"
date: "2026-04-24"
author: Angelus
projectType: web_app
projectContext: brownfield
complexity: high
workflowType: epic
workflow: create
inputDocuments:
  - party-mode-session-2026-04-24
  - specs/epic-npcr.md
  - CLAUDE.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/reference_npc_schema.md
  - server/schemas/ordeal.schema.js
  - server/schemas/character.schema.js
  - server/routes/archive-documents.js
  - server/routes/ordeal-submissions.js
  - server/scripts/import-ordeal-submissions.js
  - public/js/tabs/ordeals-view.js
  - public/js/tabs/questionnaire-data.js
  - public/js/tabs/archive-tab.js
  - data copy/TM_ordeal_rubrics_2026-04-19.json
  - private/dossiers/*.docx
---

# Epic ORD: Ordeal Tracking and Dossier Archive

## Goal

Bring the Ordeals feature from "mostly built, not functional end-to-end" to a working pipeline where: player submissions land in the live database; ST marking is unblocked; refined dossiers and histories appear in each player's Archive tab; and the Character Questionnaire stops asking for data the app already owns.

## Why

1. The live `tm_suite.ordeal_submissions` collection is empty. Fifty submissions collected via Google Forms and converted into app shape sit in `tm_deprecated`, unreachable from the live app. Players can neither see their own history nor be marked for XP.
2. The Character Questionnaire currently asks for fifteen-plus fields that duplicate character-schema data (clan, covenant, mask, dirge, blood potency, apparent age, touchstones, etc.). It also asks for relationship lists (allies, coterie, enemies, boons, debts) that the NPCR relationships graph now owns authoritatively. "No dead data" principle: the ordeal captures only what is unique to the ordeal.
3. The ST dossier workflow is .docx-upload-only. There is no way to author a dossier or history natively in-app, no way to tweak an uploaded document without re-uploading, and no way to author from scratch for new characters.
4. Ordeal rubrics exist but every expected_answer is a placeholder. Marking cannot function until rubrics are authored.
5. Character history submissions become raw text on `ordeal_submissions`, not the refined archive documents the player sees in their Archive tab. A refinement pipeline is missing.

## Context: What Already Exists

Much of the system is already built. This epic fills gaps rather than designing fresh.

**Collections (live `tm_suite`)**

- `archive_documents` (empty) — with types `dossier`, `history_submission`, `downtime_response`, `primer`. Full permission model: `visible_to_player` flag; player-scoped filter; ST sees all. Thirty dossiers, four history submissions, and twenty-six downtime responses sit in `tm_deprecated.archive_documents`, unmigrated.
- `ordeal_submissions` (empty) — schema supports `responses[]`, `marking { status, xp_awarded, answers[{ result, feedback }], overall_feedback }`. Fifty submissions sit in `tm_deprecated`, unmigrated.
- `ordeal_rubrics` (empty) — schema supports questions, expected_answers, marking_notes. Draft content exists in `data copy/TM_ordeal_rubrics_2026-04-19.json` with all answers placeholder.
- `questionnaire_responses` (empty in live, 46 in `tm_deprecated`) — structured key-value submissions from the Character Questionnaire. Has its own collection, not `ordeal_submissions`.
- `history_responses` (empty in live, 15 in `tm_deprecated`) — raw backstory text and optional external link.

**Routes**

- `GET /api/archive_documents?character_id=...` — player-scoped with `visible_to_player` filter
- `GET /api/archive_documents/:id` — full content, permission-gated
- `POST /api/archive_documents/upload` — ST-only, mammoth converts .docx to HTML
- `GET /api/ordeal_submissions/mine` — player-scoped
- `POST /api/ordeal-responses`, `PUT /api/ordeal-responses/:id` — draft and submit flow
- Admin ordeal-review endpoints for marking

**Surfaces**

- Player game-app Archive tab (`public/js/tabs/archive-tab.js`) — already renders dossier and history file-cards
- Player game-app Ordeals tab (`public/js/tabs/ordeals-view.js`) — shows five ordeal cards per character with status, XP breakdown, per-answer ST feedback
- ST Admin Archive panel (`public/js/admin/archive-admin.js`) — list + .docx upload form
- ST Admin Ordeals review (`public/js/admin/ordeals-admin.js`)

**Import tooling**

- `server/scripts/import-ordeal-submissions.js` — reads pre-processed JSON extracts from `data/`, resolves characters by name, upserts by `(character_id, ordeal_type)`, seeds rubrics if empty. Never run against live.
- The expected JSON extracts (`data/lore_mastery.json`, `data/rules_mastery.json`, etc.) do not currently exist on disk.

## Context: Design Decisions

### "No dead data" principle

Every field the Character Questionnaire captures is audited against:

1. Character schema (clan, covenant, name, mask, dirge, blood_potency, apparent_age, touchstones, status tiers, etc.)
2. NPCR relationships graph (sires, touchstones, allies, coterie, enemies, boons, debts, family)
3. Player record (player_name, discord_nickname, facebook_name)

Any field whose value already lives in one of those stores is stripped from the questionnaire. Historical submissions are never rewritten, but newly-collected data never duplicates. Rendering surfaces (dossier, archive views) pull from the authoritative store at read time, not from frozen questionnaire snapshots.

### Dossier is a curated document, not a live render

The refined dossier and refined history stored in `archive_documents` are ST-authored narrative documents. They are not live auto-renders of raw submission data. A player may submit a raw questionnaire through the ordeal; the ST refines the prose into a polished dossier; that refined artefact is what appears in the player's Archive. Storage is HTML; styling is `.reading-pane` (shared with DT reports).

### Edit in place, not a separate authoring surface

The ST edits the player's dossier and history from the player's own Archive detail view, with an ST-gated edit toggle. No dedicated admin editor. The existing .docx upload path is preserved for STs who prefer Word-first drafting.

### Migration by name, not by ID

`tm_deprecated` ObjectIds do not map to `tm_suite` ObjectIds. Migration resolves by normalised character name (honorific-stripped, case-insensitive, prefix-matched) against live `tm_suite.characters`. Unmatched entries are surfaced for manual intervention, never silently dropped.

### Player-level linkage for player ordeals

Lore Mastery, Rules Mastery, and Covenant Questionnaire are player-level ordeals (completing one unlocks XP for all the player's characters). Migration and new submissions must populate `player_id` for these types. Character History and Character Questionnaire remain character-scoped.

### Rubric authoring is a content task

Filling in the placeholder expected_answers across lore (45), rules (56), and covenant (23 questions × 4 covenants) is content work, not engineering. It is storied here so that marking can function, but it is authored by the ST team, not by code.

## Context: Tiers

Five workstreams, each shippable independently.

**Tier 1 — Questionnaire cleanup.** Strip redundant fields and NPCR-overlap fields from the Character Questionnaire. No dead data going forward.

**Tier 2 — Archive editor.** Add an ST inline editor to the Archive detail view so dossiers and histories can be authored or tweaked in-app, not only via .docx upload.

**Tier 3 — Ordeal submission migration.** Regenerate JSON extracts from `tm_deprecated`, audit name resolution, add player_id linkage, harmonise covenant slugs, execute the import to `tm_suite`.

**Tier 4 — Rubric authoring.** Fill placeholder expected_answers so marking can function. Content, not code.

**Tier 5 — Character History to Archive pipeline.** Refine raw `character_history` submissions into `archive_documents` of type `history_submission` via the Tier 2 editor.

## Context: Deferred

- **Migrate `tm_deprecated.archive_documents` to `tm_suite`.** Thirty dossiers, four history submissions, twenty-six downtime responses. Runs after Tier 2 ships so STs can refine migrated content in-app. Not in this epic.
- **The one missing dossier.** Thirty-one characters, thirty dossiers in `tm_deprecated`. One character's dossier was never authored. Identify and flag later.
- **Triggers and Sensitivities field.** Present in some .docx dossiers as a player-safety section. Not captured in the current questionnaire. Decision deferred: add to questionnaire, add to player record, or leave as ST-authored-only. Not in this epic.
- **Dossier and history export.** Generating .docx from the live view for ST archival and distribution. Nice-to-have.
- **ST notes on character.** The .docx dossiers include private ST annotations. Player-facing dossiers omit them. If a backing store is needed later, it is a separate concern.

## Requirements Inventory

### Functional Requirements

**Tier 1 — Questionnaire cleanup**

- FR1: The Character Questionnaire form does not collect fields whose value already lives on `characters`, on the player record, or on the relationships graph.
- FR2: Historical questionnaire submissions in `questionnaire_responses` retain their existing field values. No retroactive rewrite.
- FR3: The DT form NPCs picker remains the destination for allies, coterie, enemies, and debt relationships (no regression).

**Tier 2 — Archive editor**

- FR4: When viewing an Archive detail pane, an ST sees an Edit toggle that swaps the reading pane for a content-editable region with a small toolbar.
- FR5: Saving from the editor persists `content_html` and bumps `updated_at` via `PUT /api/archive_documents/:id` (new endpoint).
- FR6: An ST can create a new blank dossier or history_submission document for a character without uploading a .docx.
- FR7: The existing .docx upload path remains functional and reachable from the admin archive panel.
- FR8: Players see the Edit control only when their role is ST; editing is impossible as a player.

**Tier 3 — Ordeal submission migration**

- FR9: JSON extracts in `data/` match the current shape of `tm_deprecated.ordeal_submissions`.
- FR10: The import script's character name resolver matches every `tm_deprecated` submission to a live `tm_suite` character, or surfaces the unmatched name for manual reconciliation.
- FR11: Imported `ordeal_submissions` of type `lore_mastery`, `rules_mastery`, or `covenant_questionnaire` carry a valid `player_id` derived from the character's player link.
- FR12: Covenant values are harmonised to the form the app expects (consistent between submission and rubric).
- FR13: The import is idempotent; re-running against the same data produces no duplicates and preserves any marking already applied.

**Tier 4 — Rubric authoring**

- FR14: `ordeal_rubrics` documents for lore_mastery, rules_mastery, and each of the four covenant variants have real expected_answer and marking_notes content on every question. No placeholder strings remain.

**Tier 5 — Character History to Archive pipeline**

- FR15: Given a character_history submission with raw text, the ST can refine it into a `history_submission` archive document from within the player's Archive view.
- FR16: A refined history document is visible in the player's Archive tab with the same reading-pane styling as dossiers.

### Non-Functional Requirements

- NFR1: British English throughout. No em-dashes.
- NFR2: Migration by name honours the existing `HONORIFICS` regex; additional honorifics (Baron, Brother, others) are added as encountered in the dry-run audit.
- NFR3: No new JS library dependencies for the inline editor. Vanilla contentEditable with a small toolbar module.
- NFR4: The `.reading-pane` CSS class drives dossier and history rendering. No new document-style CSS unless genuinely required.
- NFR5: Migration writes land only on explicit non-dry-run invocation with the user running the script themselves (per repo convention; ST runs imports).
- NFR6: Idempotency is tested (re-run produces identical outcome; preserved marking is untouched).
- NFR7: Definition of Done per story: AC-by-AC evidence; file list; manual smoke of nearest adjacent flow; schema round-trip where relevant; Quinn verification; `bmad-code-review` for schema, auth, or migration stories.
- NFR8: `additionalProperties: false` at the root discipline for new schema fields. Legacy fields on questionnaire_responses may remain with `additionalProperties: true`.

### UX Design Requirements

- UX-DR1: Archive inline editor uses `.reading-pane` for both read mode and edit mode. Toolbar is pinned to the top of the pane in edit mode.
- UX-DR2: Toolbar buttons: Heading (H2 / H3 / paragraph), Bold, Italic, Unordered list, Ordered list, Link. Undo and redo rely on native browser behaviour.
- UX-DR3: Edit toggle visible only to ST role. Players see the reading pane only.
- UX-DR4: Saving surfaces inline success or error feedback within the pane; no browser `alert()`.
- UX-DR5: Create-from-scratch affordance for dossier and history_submission lives in the admin archive panel alongside upload.
- UX-DR6: The Character Questionnaire form renders the slimmer field set cleanly; removed sections do not leave empty section headings or visible gaps.
- UX-DR7: Where a questionnaire field is retired in favour of the NPCs tab, the form copy links the player to the NPCs tab inline.

### FR Coverage Map

| FR | Tier | Summary |
|---|---|---|
| FR1 | 1 | Strip redundant fields from form |
| FR2 | 1 | Historical preserve |
| FR3 | 1 | NPCs tab continues to own relationships |
| FR4 | 2 | ST inline Edit on Archive detail |
| FR5 | 2 | PUT /api/archive_documents/:id |
| FR6 | 2 | Create new blank doc |
| FR7 | 2 | .docx upload preserved |
| FR8 | 2 | Edit gated on role |
| FR9 | 3 | JSON extracts regenerated |
| FR10 | 3 | Name resolver covers all |
| FR11 | 3 | player_id populated for player ordeals |
| FR12 | 3 | Covenant slug harmonised |
| FR13 | 3 | Idempotent import |
| FR14 | 4 | Rubric content |
| FR15 | 5 | Refine history via editor |
| FR16 | 5 | Refined history visible |

### Tier dependencies

- Tier 1 and Tier 2 are independent of each other.
- Tier 3 depends on neither; it is a standalone migration.
- Tier 4 depends on Tier 3 (rubric docs must exist before authoring content fills them). Tier 3's rubric seeding step is the on-ramp.
- Tier 5 depends on Tier 2 (needs the inline editor) and Tier 3 (needs raw histories imported so there is something to refine).

## Stories

### Definition of Done (applies to every story)

- All ACs verified in target environment (browser for UI, API for endpoints, dry-run output for migration) with observed behaviour documented.
- Files touched listed in the completion note.
- No TODO or placeholder in shipped code.
- Manual smoke of nearest adjacent flow.
- Schema changes round-tripped where relevant.
- Story completion note uses `done / deferred / skipped` per AC, with evidence.
- Quinn verification pass.
- `bmad-code-review` for schema, auth-boundary, or migration stories.

---

## Tier 1 — Questionnaire Cleanup

### ORD.1: Strip character-schema-redundant fields from Questionnaire

As an ST,
I want the Character Questionnaire to stop asking players for data that already lives on the character sheet or the player record,
So that the ordeal captures only narrative material and the "no dead data" principle is honoured going forward.

**Fields removed (per Paige's audit 2026-04-24):**

Player Info section: `player_name`, `discord_nickname`.

Character Profile section: `character_name`, `high_concept` (equivalent to character.concept), `clan`, `bloodline`, `covenant`, `blood_potency`, `apparent_age`, `mask`, `dirge`.

Character History section: `touchstones` (free-text; NPCR.4 structured field owns this).

**Acceptance Criteria:**

**Given** `public/js/tabs/questionnaire-data.js` **Then** the listed question definitions are removed entirely.

**Given** a player opens the Character Questionnaire **Then** the form renders the remaining questions without visible empty sections or trailing dividers.

**Given** the completion gate logic **Then** the required-fields check is updated so the three surviving required fields (`court_motivation`, `ambitions_sydney`, `why_sydney`) determine "complete" alongside the existing optional-thoughtful-completion rule.

**Given** an existing historical `questionnaire_responses` document **Then** it loads without error and its removed fields are not rendered in the read-only review view.

**Given** a new submission **Then** the removed fields are not stored even if legacy client state includes them.

**Files expected to change:** `public/js/tabs/questionnaire-data.js`, `public/js/tabs/questionnaire-form.js` (completion gate), `public/js/tabs/ordeals-view.js` (status resolver if affected), `server/tests/api-questionnaire.test.js` (update expectations).

**Dependencies:** none.

---

### ORD.2: Retire NPCR-overlap fields from Questionnaire

As an ST,
I want the Character Questionnaire to stop collecting relationship lists and boon/debt/secret tracking that the NPCs tab now owns authoritatively,
So that relationship data lives only in the relationships graph and the ordeal form directs players to the right home.

**Fields removed:**

Character Connections section: `allies_characters`, `allies` (notes), `coterie_characters`, `coterie` (notes), `enemies_characters`, `enemies` (notes), `boons_debts` (dynamic list).

Character History section: `sire_name` (now a `kind='sire'` NPCR edge), `mortal_family` (now `kind='family'` NPCR edges), `sire_story` (moves to per-edge `note` on the sire edge).

**Secrets handling (open question deferred to drafting):** `secrets` dynamic list is a structured per-character record that parallels NPCR edge shape. Either introduce a new NPCR kind (`secret` or `shared_secret`) or leave in the questionnaire for now. Deferred pending a Tier-6 or follow-up story; this story removes only the unambiguous NPCR-overlaps.

**Acceptance Criteria:**

**Given** `public/js/tabs/questionnaire-data.js` **Then** the listed question definitions are removed.

**Given** the questionnaire form **Then** the Character Connections section header is replaced with inline copy directing the player to the NPCs tab for relationship tracking. **And** only fields that do not duplicate NPCR remain.

**Given** the Character History section **Then** the removed fields leave a clean layout (no empty blocks).

**Given** a historical `questionnaire_responses` with retired fields populated **Then** the document loads; retired fields are not rendered in the read-only review view.

**Given** an ST opens the admin questionnaire review **Then** retired fields are omitted from the rendering; the audit trail in `tm_deprecated` remains intact for historical reference.

**Files expected to change:** `public/js/tabs/questionnaire-data.js`, `public/js/tabs/questionnaire-form.js`, `public/js/admin/questionnaire-admin.js` (or equivalent review surface), `server/tests/api-questionnaire.test.js`.

**Dependencies:** none. (NPCR.6 and downstream shipped as prerequisites.)

---

## Tier 2 — Archive Editor

### ORD.3: ST inline editor on Archive detail view

As an ST,
I want to edit a player's dossier or history from inside their Archive detail view with a small toolbar,
So that I can refine content without leaving the app or re-uploading a .docx.

**Acceptance Criteria:**

**Given** I am ST and open an Archive document detail **Then** an "Edit" button appears next to the back link.

**Given** I click Edit **Then** the `.reading-pane` becomes `contenteditable` and a toolbar pins to the top of the pane.

**Given** the toolbar **Then** it provides: Heading cycle (H2 / H3 / Paragraph), Bold, Italic, Unordered list, Ordered list, Link.

**Given** I edit and click Save **Then** `PUT /api/archive_documents/:id` is called with updated `content_html`. **And** `updated_at` is bumped server-side. **And** the pane returns to read mode with the new content rendered.

**Given** `PUT /api/archive_documents/:id` **Then** it requires ST role. **And** accepts `{ content_html, title? }`. **And** rejects any other fields.

**Given** save fails (network, 500, permission) **Then** an inline banner appears inside the pane with the error. No `alert()`.

**Given** I am a player (not ST) **Then** the Edit button is not rendered. **And** a direct `PUT` is 403.

**Given** I click Cancel during edit **Then** unsaved changes are discarded and the pane returns to the last-saved content.

**Given** the edit surface **Then** styles match the read surface (same typography, same `.reading-pane` CSS rules apply).

**Files expected to change:** `public/js/tabs/archive-tab.js` (Edit toggle, toolbar, save handler), `public/js/editor/archive-inline-editor.js` (new, ~100 lines), `server/routes/archive-documents.js` (new PUT handler with role gate and whitelist), `server/tests/api-archive-documents.test.js` (PUT tests), `public/css/components.css` (toolbar styles if needed).

**Dependencies:** none.

---

### ORD.4: ST creates blank dossier or history from scratch

As an ST,
I want to create a new blank dossier or history_submission document for a character without uploading a .docx,
So that I can author a fresh dossier in-app for newly-joined characters or characters who lack a document.

**Acceptance Criteria:**

**Given** I am ST on the admin archive panel for a character **Then** two "Create blank" buttons are present alongside the upload form: "+ New Dossier" and "+ New History".

**Given** I click "+ New Dossier" **Then** `POST /api/archive_documents` (new endpoint) creates a document with `type='dossier', character_id, title='Dossier', content_html='', visible_to_player: true`.

**Given** the document is created **Then** the archive list refreshes and the new document appears. **And** opening it lands in the ORD.3 edit mode with empty content ready to type.

**Given** the same endpoint receives type='primer' **Then** the existing primer single-document constraint is honoured (409 if one already exists).

**Given** `POST /api/archive_documents` without ST role **Then** 403.

**Given** character_id is missing or does not resolve **Then** 400.

**Files expected to change:** `public/js/admin/archive-admin.js` (create buttons), `server/routes/archive-documents.js` (new POST handler), `server/tests/api-archive-documents.test.js` (POST tests).

**Dependencies:** ORD.3.

---

## Tier 3 — Ordeal Submission Migration

### ORD.5: Regenerate JSON extracts from tm_deprecated

As the ST team,
I want `data/lore_mastery.json`, `data/rules_mastery.json`, `data/covenant_questionnaire.json`, `data/character_histories.json`, and `data/ordeal_rubrics_seed.json` to match the current shape of `tm_deprecated.ordeal_submissions` and `tm_deprecated.ordeal_rubrics`,
So that `import-ordeal-submissions.js` has the source data it expects.

**Acceptance Criteria:**

**Given** a new script `server/scripts/export-ordeal-submissions-for-import.js` **Then** it reads from `tm_deprecated.ordeal_submissions` and produces the four JSON extracts in the shape `import-ordeal-submissions.js` consumes.

**Given** the extract script is run **Then** `data/lore_mastery.json` has 15 submissions and a `question_reference` array.

**Given** the extract script **Then** `data/rules_mastery.json` has 9 submissions and a `question_reference` array.

**Given** the extract script **Then** `data/covenant_questionnaire.json` has 12 submissions keyed by covenant slug and `question_references` map keyed by covenant slug.

**Given** the extract script **Then** `data/character_histories.json` has 14 submissions each with `character_name`, `history_text`, and `submitted_at`.

**Given** the extract script **Then** `data/ordeal_rubrics_seed.json` mirrors `tm_deprecated.ordeal_rubrics` in the shape the import script consumes.

**Given** character names in `tm_deprecated.ordeal_submissions` are stored only by ObjectId not by name **Then** the extract joins to `tm_deprecated.characters` to resolve a name for each submission. **And** if a character does not resolve, the row is reported with the stale ObjectId for manual handling.

**Given** submissions with `marking.status='complete'` and an `xp_awarded` value **Then** the extracts preserve marking state so the import can restore it (idempotency guarantee of the import script applies).

**Files expected to change:** `server/scripts/export-ordeal-submissions-for-import.js` (new), `data/lore_mastery.json` (new), `data/rules_mastery.json` (new), `data/covenant_questionnaire.json` (new), `data/character_histories.json` (new), `data/ordeal_rubrics_seed.json` (new).

**Dependencies:** none.

---

### ORD.6: Dry-run audit of name resolution

As the ST team,
I want a full dry-run of `import-ordeal-submissions.js` against the ORD.5 extracts before any writes hit `tm_suite`,
So that every unmatched character name is surfaced and resolved before migration executes.

**Acceptance Criteria:**

**Given** `node import-ordeal-submissions.js --dry-run` is run **Then** the output lists every submission with `[OK]` or `[UNMATCHED]` and prints a summary at the end.

**Given** any `[UNMATCHED]` entries **Then** each is resolved before ORD.9 runs, by one of: extending the `HONORIFICS` regex; adding the honorific to the character's `honorific` field on `tm_suite.characters`; correcting the character_name in the JSON extract; or confirming the submission is for a retired character that should land by `_id` rather than name.

**Given** the re-run dry-run **Then** zero `[UNMATCHED]` remain.

**Given** the dry-run **Then** no database writes occur (guaranteed by the existing `DRY_RUN` guard in the script).

**Given** the audit **Then** its output is captured as a migration note in the story completion record, not written to a new spec file.

**Files expected to change:** possibly `server/scripts/import-ordeal-submissions.js` (HONORIFICS regex extension if needed), the JSON extracts from ORD.5 if name corrections are needed. No production writes.

**Dependencies:** ORD.5.

---

### ORD.7: Add player_id linkage for player-level ordeals

As an ST,
I want every imported `ordeal_submissions` document for lore_mastery, rules_mastery, and covenant_questionnaire to carry a valid `player_id`,
So that player-level XP and ordeal status resolve correctly.

**Acceptance Criteria:**

**Given** `import-ordeal-submissions.js` **Then** it is amended to look up each character's `player` field after character resolution, then look up the corresponding `players` document by Discord id (or the current link convention), then set `player_id` on the submission.

**Given** the ordeal_type is `character_history` **Then** `player_id` remains null; character_history is character-scoped.

**Given** a character resolves but its `player` is null or points at no `players` document **Then** the script reports the anomaly in the run summary but does not fail. **And** the submission is still inserted with `player_id: null`; the anomaly is triaged manually.

**Given** an `ordeal_responses` branch exists where `player_id` is required at submission time (player-side forms) **Then** the migration is consistent with that branch; no orphaned imported docs that the player-side UI cannot attribute.

**Given** the schema `server/schemas/ordeal.schema.js` **Then** no structural change is required (player_id is already optional). **And** a comment is added clarifying the character_history vs player-level convention.

**Files expected to change:** `server/scripts/import-ordeal-submissions.js` (add player resolver), `server/schemas/ordeal.schema.js` (docstring comment).

**Dependencies:** ORD.5. Can run in parallel with ORD.6.

---

### ORD.8: Harmonise covenant slug representation

As an ST,
I want `ordeal_submissions.covenant` and `ordeal_rubrics.covenant` to use the same vocabulary,
So that rubric lookup by covenant during marking cannot fail due to naming drift.

**Acceptance Criteria:**

**Given** the covenant slug in use across the app **Then** the canonical form is chosen (likely the slug form: `carthian`, `crone`, `invictus`, `lancea`) and documented in a shared constant.

**Given** a shared module `public/js/data/covenant-slugs.js` or equivalent **Then** it exports the canonical slug list and a translator from display names (`"Carthian Movement"`, `"Circle of the Crone"`, etc.) to slug form.

**Given** ORD.5 extracts and ORD.9 import writes **Then** both produce submissions with the canonical slug.

**Given** the rubric seed **Then** it uses the canonical slug on its `covenant` field.

**Given** the existing `covenant-data.js` on the client **Then** its covenant keys are consistent with the canonical form, or a translation layer is documented at the render boundary.

**Files expected to change:** `public/js/data/covenant-slugs.js` (new, or equivalent), `server/scripts/import-ordeal-submissions.js`, `server/scripts/export-ordeal-submissions-for-import.js` (from ORD.5), rubric seed file from ORD.5.

**Dependencies:** ORD.5.

---

### ORD.9: Execute ordeal submissions import to tm_suite

As the ST team,
I want the fifty submissions in `tm_deprecated.ordeal_submissions` and their rubrics to land in `tm_suite`,
So that the live Ordeals tab reads real historical data and STs can continue marking where Google-Form submissions left off.

**Acceptance Criteria:**

**Given** ORD.5 extracts exist, ORD.6 audit is clean, ORD.7 player_id linkage is in place, and ORD.8 slugs are canonical **Then** `node server/scripts/import-ordeal-submissions.js` is run against `tm_suite`.

**Given** the import completes **Then** `tm_suite.ordeal_submissions` contains 50 documents: 15 lore_mastery, 9 rules_mastery, 12 covenant_questionnaire (4+3+3+2 across the four covenants), 14 character_history.

**Given** marking state **Then** any submission that was `marking.status='complete'` with `xp_awarded` in `tm_deprecated` retains that state in `tm_suite`.

**Given** `tm_suite.ordeal_rubrics` **Then** it is seeded from `data/ordeal_rubrics_seed.json` on first run; placeholders remain placeholders (ORD.10 fills them).

**Given** the import is re-run **Then** no duplicates are created. **And** marking state is preserved (`$setOnInsert` guard).

**Given** the Ordeals tab is opened **Then** each migrated submission shows with its correct status (Approved if complete, Submitted or In Review for pending, not_started otherwise).

**Given** the XP breakdown **Then** it correctly reflects `+3 XP` for every marking-complete ordeal.

**Files expected to change:** none in source (all already in place). A migration report note added to the story completion.

**Dependencies:** ORD.5, ORD.6, ORD.7, ORD.8.

---

## Tier 4 — Rubric Authoring

### ORD.10: Fill ordeal_rubric expected_answers

As an ST,
I want every ordeal rubric question to have a real expected_answer and marking_notes,
So that marking is a fair and repeatable process rather than freehand.

**Content scope:**

- Lore Mastery: 45 questions.
- Rules Mastery: 56 questions.
- Covenant Questionnaire: 23 questions × 4 covenants = 92 items (though the first question on each covenant is an echo of the player's chosen covenant and can be trivial-marked or dropped; decide during authoring).

**Acceptance Criteria:**

**Given** the ST team authors content **Then** `tm_suite.ordeal_rubrics` is updated via a `PUT /api/ordeal_rubrics/:id` endpoint or a targeted update script, not a schema rewrite.

**Given** every question in `tm_suite.ordeal_rubrics` **Then** `expected_answer` is no longer `[PLACEHOLDER ...]`. **And** `marking_notes` is no longer `[What counts as close vs no]`.

**Given** interpretive covenant questions **Then** their `marking_notes` describes what demonstrates solid understanding; their `expected_answer` may be "ST judgement" if no single canonical answer exists, flagged explicitly.

**Given** the review UI (`public/js/admin/ordeals-admin.js`) **Then** it renders expected_answer alongside the player's answer so the ST can mark efficiently.

**Given** a question's `expected_answer` is still placeholder at mark time **Then** the review UI shows a visible "rubric unfilled" tag so the ST does not silently mark against no reference.

**Files expected to change:** content in `tm_suite.ordeal_rubrics` only. Optional: a small update script `server/scripts/update-ordeal-rubric.js` that accepts a JSON patch file so content can be edited in a file and applied atomically. Review UI refinement to surface "rubric unfilled" tag if needed.

**Dependencies:** ORD.9 (rubrics seeded in live DB). Content authoring runs in parallel; code dependencies are minimal.

---

## Tier 5 — Character History to Archive Pipeline

### ORD.11: Refine character_history submission into archive_documents

As an ST reviewing a character_history ordeal,
I want a "Refine to archive" action that takes the raw history text and produces a `history_submission` archive document in-app,
So that the refined history appears in the player's Archive tab as a readable document alongside their dossier.

**Acceptance Criteria:**

**Given** an ST opens a character_history submission in the admin review surface **Then** a "Refine to archive" button is present.

**Given** the button is clicked **Then** a new `archive_documents` document is created (or updated if one exists for this character) with `type='history_submission', character_id, title='Character History', content_html=<pre-populated from submission.responses[0].answer wrapped in basic HTML>, visible_to_player: true`.

**Given** the create succeeds **Then** the ST is redirected into the ORD.3 edit view on the new document so they can polish prose before publishing.

**Given** the player opens their Archive tab **Then** the refined history appears as a file card with title "Character History" and renders when clicked.

**Given** the character_history submission marking is `complete` with `xp_awarded: 3` **Then** that XP remains tracked at the ordeal level; the archive document is a presentation artefact, not the source of XP.

**Given** an ST re-runs the refine action on the same character **Then** the existing history document is re-opened in edit mode rather than creating a duplicate.

**Given** the player deletes or the ST retires the character **Then** the archive document follows the existing archive lifecycle (no new retirement path in this story).

**Files expected to change:** `public/js/admin/ordeals-admin.js` (refine button and redirect), `server/routes/archive-documents.js` (re-use the ORD.4 POST handler, perhaps with a "reuse if exists by character_id+type" flag), `server/tests/api-ordeal-history-refine.test.js` (new).

**Dependencies:** ORD.3 (editor), ORD.4 (create endpoint), ORD.9 (submissions imported).

---

## Deferred

- Migration of `tm_deprecated.archive_documents` (30 dossiers, 4 histories, 26 DT responses) to `tm_suite.archive_documents`.
- Dossier and history .docx export from the live view.
- Missing-dossier reconciliation for the one character lacking a dossier in `tm_deprecated`.
- Triggers and Sensitivities as a first-class player-safety field.
- ST-private notes backing store (`st_notes` on character or separate collection).
- `secrets` dynamic list treatment: move to NPCR kind or keep in questionnaire.

## Open questions (to resolve during story drafting)

- Does the Archive inline editor re-use the mammoth-converted HTML without any sanitisation step, or does save pass through a sanitiser (e.g. DOMPurify) to prevent script injection? Inline contentEditable in the browser allows arbitrary HTML by default.
- Does `POST /api/archive_documents` need to reject duplicate `type='dossier'` per character, or is multiple-dossiers-per-character an intentional capability? The existing primer constraint suggests type-uniqueness is applied per-type; dossier may want the same.
- Rubric content authoring tooling: is a JSON-patch-file workflow worthwhile (edit content in a file, script applies), or is direct admin-UI editing preferred? Trade-off is ergonomics vs reviewability.
