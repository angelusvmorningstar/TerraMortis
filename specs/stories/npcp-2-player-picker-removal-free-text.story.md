---
id: npcp.2
epic: npcp
status: ready-for-dev
priority: high
depends_on: [npcp.1]
---

# Story NPCP-2: Remove player NPC picker, replace with free-text input

As a player filling out the Personal Story section of the DT form,
I should describe the NPC by typing their name freely rather than picking from a dropdown of existing NPCs,
So that I never see NPCs unrelated to my character in any picker, autocomplete, or suggestion list — and ST resolves my reference to a real NPC record on their side at processing time.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 6 (NPC Privacy Hardening) — calls out the existing-NPC picker on the player Personal Story section as a privacy leak. Even with NPCP-1's server-side scoping in place, the picker UI itself encourages players to think of NPCs as a fetchable directory and risks future code regressions exposing the list. Shutting the picker down entirely is the defensive posture: free text in, ST resolution out.

The picker lives in `renderPersonalStorySection` in `public/js/tabs/downtime-form.js` (around line 2723). It was added under DTOSL-2 (`specs/stories/dtosl.2.choice-selector-contextual-dropdown.story.md`) as a 3-way choice — Correspondence / Touchstone / Other — with a contextual NPC dropdown for the Correspondence and Touchstone modes. NPCP-2 removes the dropdowns entirely and converts all three modes to free-text inputs.

The legacy field `responses.personal_story_npc_id` (set when a player picked from the dropdown) stays in the schema as a back-compat read for DT1 / DT2 submissions. New submissions (DT3+) write `responses.personal_story_npc_text` (string) instead. ST processing readers must handle both: ST sees the typed name from new submissions, the resolved NPC name from old submissions.

The server-side resolution flow (player free text → ST review → ST link to existing NPC or create new) is handled by **DTOSL-5** (`specs/stories/dtosl.5.inline-quick-add-npc.story.md`), which has been re-scoped to the server endpoint half only (the player-UI half is superseded by this story; see the re-scope note at the top of dtosl.5). NPCP-2 does not implement DTOSL-5 itself; it only writes the free text into the submission, where the ST will pick it up at processing time.

### Files in scope

- `public/js/tabs/downtime-form.js` — `renderPersonalStorySection` (~line 2723) and `_legacyRenderPersonalStorySection` (~line 2806). The legacy renderer was the pre-DTOSL.2 one; DTOSL.2 added the new 3-way version. NPCP-2 modifies the new version only; legacy stays untouched (it never wrote `personal_story_npc_id` in the same shape).
- `server/schemas/downtime_submission.schema.js` — schema's `responses.additionalProperties: true` should already accept `personal_story_npc_text`, but verify; add explicit field if helpful.
- DT Story tab readers in `public/js/admin/downtime-story.js` — must surface the free text in the right authoring context. Probably one or two read sites: `buildLetterContext`, `buildTouchstoneContext`, or their successor `buildStoryMomentContext` (depending on whether DTSR-2 has shipped first; both paths must work).

### Out of scope

- Server endpoint design for player NPC quick-add or free-text resolution (DTOSL-5's territory)
- ST UI for resolving free-text references to NPC records (separate ST workflow, not in this story)
- Any change to NPC data model or `linked_character_ids` semantics
- Changes to the `dt-off-screen-life` epic's other stories (DTOSL.3, DTOSL.4 are independent)
- Story Moment consolidation (DTSR-2's territory; this story modifies the current 3-way structure as it stands today)

---

## Acceptance Criteria

**Given** I am a player on the DT form's Personal Story section
**When** I select any of the three modes (Correspondence / Touchstone / Other)
**Then** the dropdown of existing NPCs is **not rendered**.
**And** in its place, a single free-text input appears with a label appropriate to the chosen mode.

**Given** I am a player on the DT form's Personal Story section
**When** I type into the free-text input
**Then** **no autocomplete suggestions** appear.
**And** **no validation** is performed against the existing NPC list.
**And** **no "did you mean..." messaging** appears.

**Given** I am a player typing an NPC reference
**When** I save the form
**Then** my input persists in `responses.personal_story_npc_text` (string).
**And** the legacy field `responses.personal_story_npc_id` is **not written** for new submissions.

**Given** a DT2 submission with `responses.personal_story_npc_id` set
**When** the ST opens DT Story for that submission (Touchstone or Letter section, or the consolidated Story Moment if DTSR-2 has shipped)
**Then** the ST sees the resolved NPC name (looked up via the id) — same behaviour as today (no regression).

**Given** a DT3+ submission with `responses.personal_story_npc_text` set
**When** the ST opens the same DT Story authoring surface
**Then** the ST sees the player's typed text rendered as the NPC reference.
**And** the ST has access to the surrounding context (mode chosen, prompt text, any other Personal Story fields).

**Given** the prompt language above the free-text input
**Then** it explicitly defers spelling and identity resolution to the ST. Recommended starting wording (final wording at implementation):
> *"Who is the moment with? Type their name. Your ST will resolve who you mean."*

**Given** a player has loaded a draft from before this story shipped (which contains `personal_story_npc_id` but no `personal_story_npc_text`)
**When** the form re-renders
**Then** the player sees the free-text input with the **previously-resolved NPC name** pre-filled (look up the id and render the name into the text input as the initial value).
**And** if the player saves without changing it, the new save writes `personal_story_npc_text` (the resolved name as text) and clears the legacy `personal_story_npc_id`.

---

## Implementation Notes

- **Pure renderer change in `tabs/downtime-form.js`.** No new helper modules. The existing 3-way choice selector stays. The dropdown branches inside `renderPersonalStorySection` get replaced with a `<input type="text">` with `autocomplete="off"`.
- **`autocomplete="off"`** on the text input is non-negotiable. Browsers may still offer past-typed values, which is fine (browser-local, not server-mediated). What we do not want is any server-fed list ever populating the input.
- **No `<datalist>`**, no JS-driven typeahead, no `oninput` filtering against an NPC list.
- **Field rename, not schema change.** The schema's `responses` is `additionalProperties: true` (per memory `feedback_schema_validation` and adjacent patterns), so writing a new key like `personal_story_npc_text` requires no schema migration. Verify by checking `server/schemas/downtime_submission.schema.js` — if there's an explicit allow-list for `responses.*`, add the new key.
- **Legacy read-and-render.** When the form loads a draft that has `personal_story_npc_id` but no `personal_story_npc_text`, the renderer should resolve the id to a name (via the same lookup path the current dropdown uses) and pre-fill the text input. On save, write `personal_story_npc_text`; do **not** persist the id. This is a one-time silent migration per submission as it gets edited.
- **DT Story authoring surface readers** need a small fallback: `text = sub.responses.personal_story_npc_text || resolveNPCName(sub.responses.personal_story_npc_id) || '(unknown NPC)'`. One helper, used in both `buildLetterContext` and `buildTouchstoneContext` (or `buildStoryMomentContext` if DTSR-2 has landed before this story).
- **Prompt wording**: Sally's strawman is the starting point. The exact string can be tuned at implementation; the principle is that it must explicitly defer spelling/identity to the ST and not imply a "correct answer" the player has to find.
- **No follow-up ST UI in this story.** The ST-side resolution flow (where the ST decides whether the typed name maps to an existing NPC or a new one) is DTOSL-5's territory, currently `rescope-pending`. Until that ships, the ST will see the typed text and resolve it manually in their head when authoring narrative — same as they do today for free-text fields elsewhere on the form.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `renderPersonalStorySection`: dropdown branches replaced with free-text inputs; legacy id pre-fill on draft load; save writes `personal_story_npc_text`.
- `public/js/admin/downtime-story.js` — `buildLetterContext` / `buildTouchstoneContext` (or `buildStoryMomentContext` if DTSR-2 shipped first): fallback resolver `text || resolveByLegacyId() || '(unknown NPC)'`.
- `server/schemas/downtime_submission.schema.js` — verify `responses.personal_story_npc_text` is accepted (likely no change needed if `additionalProperties: true` is in place).

---

## Definition of Done

- All AC verified.
- Manual smoke test: as a player, all three modes show free-text inputs, no dropdowns, no autocomplete suggestions; saved submission carries `personal_story_npc_text` and not `personal_story_npc_id`.
- Legacy DT2 submission opens correctly in DT Story; ST sees resolved NPC name.
- Pre-NPCP-2 draft (had `personal_story_npc_id` only) opens correctly in player form with the resolved name pre-filled in the text input.
- No regression on DTOSL.2's 3-way mode selector; only the dropdown half is replaced.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `npcp-2-player-picker-removal-free-text: ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **NPCP-1 must ship first.** The server-side scope is the load-bearing defence; this story is the client-side reduction.
- **DTSR-2 (Story Moment consolidation) is independent** — NPCP-2 works whether or not DTSR-2 has shipped. Implementation note above covers both code paths.
- **DTOSL-5 (server endpoint for free-text resolution) is downstream**, not blocking. NPCP-2 ships without it; the ST resolves typed names manually until DTOSL-5 lands.
