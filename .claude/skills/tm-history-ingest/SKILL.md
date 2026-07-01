---
name: tm-history-ingest
description: Ingest a Terra Mortis character's submitted sources (history AND/OR questionnaire) into coordinated outputs — a faithful prose backstory draft, a tagged structured "dossier" of facts, and a relationship graph (NPCs + edges). Each character has whatever subset of sources they submitted; gather what exists and merge. The character sheet stays authoritative on any clash. Use when the user says "ingest this history", "process the backstories", "look at the questionnaire for character data", "build the dossier for <character>", "extract character facts", or wants player submissions turned into clean backstories and/or queryable character data.
---

# TM History Ingest

Turns a player's raw character history into a normalised knowledge layer the rest of the system can rely on — so that when downtimes or scenes are drafted, character facts (origin, sire, relationships) are **data**, not prose someone has to remember correctly.

One history yields **three coordinated outputs**:

1. **Prose backstory draft** — a clean, faithful formal version for the Story-tab card.
2. **Dossier** — tagged structured facts (`character_dossier`).
3. **Relationship graph** — named people as NPCs + relationship edges (`npcs` / `relationships`).

## Cross-cutting rules (apply to all three outputs)

- **The character SHEET is authoritative.** On any clash between a history fact and the sheet (date of embrace, clan, covenant…), the sheet wins. Never overwrite the sheet; record the history value and flag the clash for the ST. Histories were sometimes submitted before sheet edits, so clashes are expected.
- **No fabrication, ever.** Every datum/sentence must trace to the source. Where the source is silent, stay silent. This is the single most important discipline — ornament is where invented detail creeps in.
- **Incomplete is fine.** A 575-char stub yields three facts, not twelve, and a two-sentence backstory. Never pad to fill a gap.
- **People are proposed, then approved.** NPC / relationship extraction is ST-reviewed before writing — especially PC↔PC edges, which touch other players' characters. Disambiguate by *data* (pronoun, player, sheet), never by guess.
- **Flag AI-transcribed sources.** Some players run their history through an AI transcriber (the doc usually says so). Treat those facts as player-asserted, possibly with transcription errors; note `source_note` on the dossier and flag for ST verification.
- **Publishing prose is a separate, ST-gated step.** Draft and store; only put the prose on the page when the ST says to.

## Where the data lives

| | Collection / field |
|---|---|
| Raw history (player) | `history_responses.responses.backstory_text` (+ `.backstory_link` = a Google Drive doc) |
| Formal prose draft | top-level `history_text` on the same `history_responses` doc (the Story-tab card reads this; raw stays in `backstory_text`) |
| Dossier | `character_dossier` (one doc per character; schema: `server/schemas/character_dossier.schema.js`) |
| People + ties | `npcs` + `relationships` (schemas: `relationship.schema.js`; endpoints are `{type: pc|npc, id: <string>}`) |
| Authoritative sheet | `characters` |

DB scripts go in `server/scripts/` and run read-only first; run with the sandbox disabled (they need network to Atlas). A full DB backup exists from this work.

## Sources & coverage

A character's dossier is fed by **whatever they submitted** — most have neither, some one, a few both. Never assume both exist; gather what's there and merge.

- **History** — `history_responses.responses.backstory_text` (+ `.backstory_link`). Narrative prose.
- **Questionnaire** — `questionnaire_responses.responses.*`. Structured form fields; often NAMES what the history left vague (e.g. `sire_name` gives the sire a name where the history said only "a Maori lord"). Biographical fields worth pulling: `sire_name`/`sire_story`, `early_city`/`early_nights`, `mortal_family`, `touchstones`, `hunting_method_tags`, `aspired_position`, `why_sydney`, `why_covenant`, covenant/clan goals, `view_*`, `first_kill`, `*_characters` (PC links → relationships).
- **ST direct** — facts the ST states (`source: st`).

**Merge:** every fact carries `source`. On overlap, **named beats unnamed** (questionnaire's named sire upgrades the history's anonymous one; link the `npc_id`). A character with only a questionnaire still gets a dossier (no prose needed).

**Authority on a value clash: character sheet (1) > online DB `questionnaire_responses` (2) > Excel export (3).** Take the higher source's value; flag the lower. Otherwise reconcile/merge. Note the *Excel* "Character Details (Responses)" is the most COMPLETE questionnaire source (~27 responses vs ~6 in the DB portal form) — so it fills coverage gaps for characters the DB never imported, but loses any value clash to the sheet/DB. (Watch the Excel's quirks: Mask/Dirge is a 27-column archetype matrix where each cell reads "Mask"/"Dirge"; covenant cells store the verbose form-label, not the enum.)

## Stateful facts vs static biography

The dossier holds both, but a stateful item must carry the state that keeps it honest — a flat "owes a boon to X" fact becomes a lie the moment it's repaid.

- **`secret`** — `severity` ∈ trivial|minor|major|life_threatening (ST judgement at ingest — propose it), `compromised` (default false), `st_hidden: true`. **Severity = consequence of exposure.** `life_threatening` is reserved for exposure that would directly get the character *destroyed* — a capital crime or treason (committed diablerie, a Masquerade breach, betraying the Prince). What a character *is* (a bloodline, a clan) is at most `major`, never life-threatening — it makes enemies and risk, not a death sentence. Near-misses ("came close to diablerie") and "creates enemies" sit at `major`.
- **`boon`** (owed TO the character) / **`debt`** (the character owes) — `status` ∈ outstanding|repaid, `counterparty` (npc_id or name); repayment flips `status` (the relationships `debt-holder`/`debt-bearer` kinds can mirror it).
- Static facts (birthplace, sire, mortal vocation) need none of this.

## Step 1 — Get the source(s)

- Read `history_responses` (`responses.backstory_text`; if empty but `responses.backstory_link` is set, fetch the Drive doc with the Google Drive `read_file_content` tool) AND `questionnaire_responses` for the character. Use whatever exists.

## Step 2 — Prose draft (house style)

Faithful conversion, **not** creative writing. See the `shortform-composition` skill for the prose discipline; for backstory specifically:

- **Competent, plain prose — never florid.** No metaphor-piling, no oblique phrasing, no invented colour. Keep the concrete specifics that ARE in the source (e.g. "green hat and emerald rings", a named hot-dog stand).
- **Third-person past tense** by default (match the source if it's already first-person and the player wants that).
- **Fold meta-markers and headers** ("~HISTORICAL INTERLUDE~", "Early Life:", bio-note headers like Name/Appearance/Born) into continuous narrative; those are scaffolding, not story. The character-sheet metadata (clan/covenant/appearance) is already on the Dossier card — don't repeat it.
- **Condense tangents to the character's involvement** (a long battle digression → "she served as a ritualist there").
- **Fix obvious typos**; add nothing.
- Length follows the source (a rich 8k-char history → ~700–750 words; a stub → a paragraph). Confirm length/register with the ST on the first one.
- Store to `history_text`; leave `responses.backstory_text` untouched. **Do not publish** (set, but the ST controls when it shows).

## Step 3 — Dossier (tagged facts)

Extract structured facts into `character_dossier` as an Entity-Attribute-Value list — one doc per character, `facts: [{ tag, value, source, npc_id?, sheet_field?, sheet_value?, clash?, note? }]`.

- **Tag from the normalised vocabulary** (`DOSSIER_TAGS` in the schema: `birthplace`, `birth_year`, `mortal_vocation`, `mortal_faction`, `sire`, `brood_sibling`, `embrace_event`, `embrace_location`, `faction_history`, `key_location`, `notable_event`, `signature_ability`, `notable_ally`, `notable_enemy`, `family_member`, `current_activity`). **When a datum doesn't fit, mint a new tag** and add it to the vocabulary — but first check it isn't a near-duplicate of an existing one (no `birthplace` AND `place_of_birth`). Normalise across characters.
- `source` ∈ `history | st | downtime`. Facts can come from the ST directly, not just histories.
- **Sheet reconciliation:** for tags that map to a sheet field (e.g. `embrace_event` → `date_of_embrace`), set `sheet_field`/`sheet_value` and compute `clash`. On clash the sheet is canonical; the fact is flagged, not applied. Sheet gaps (history has more touchstones than the sheet) go in `note`, not as overwrites.
- Reference people by `npc_id` once their NPC exists (e.g. the `sire` fact links to the sire's NPC).

## Step 4 — Relationship graph (proposed → approved)

- **Named people → NPC docs** in `npcs` (`{ name, description, status:'active', linked_character_ids:[<pcId string>], is_correspondent:false }`) + a `relationships` edge.
- **Unnamed people stay as dossier facts** — never mint a nameless NPC (Anichka's unnamed sire/brood-brother are `sire`/`brood_sibling` facts, not NPCs).
- **Relationship edges** use the schema enums: `kind` ∈ KIND_ENUM (`sire`, `childe`, `ally`, `rival`, `enemy`, `mentor`, `family`, `contact`, `touchstone`, `romantic`…), `direction` ∈ `a_to_b|mutual`, `disposition` ∈ `positive|neutral|negative`, `status:'active'`, `created_by:{type:'st',id:'history-ingest'}`, and an append-only `history:[{at,by,change}]`. Endpoint ids are **strings**.
- **`touchstone` edges only when the sheet backs them** (the sheet's `touchstones` is authoritative; a history-named touchstone the sheet lacks is a flag, created as `family`/`ally`, not `touchstone`).
- **PC↔PC edges** when the history names other player characters (e.g. "Eve smuggled Einar and Renee"). These touch other players — **propose, disambiguate from data, then write.** Resolve ambiguous names by pronoun/player/sheet, not assumption (Eve's "Renee" = the *she/her* René = René Meyer, not the he/him René St. Dominique).

## Output to the ST per character

Present a review artifact before/while writing: the dossier facts (with any clash/gap flags), the proposed NPCs + edges, new tags minted, and the prose draft. Write the dossier (low-risk parallel collection) freely; hold people/edges for approval; hold prose publishing for the ST.

## Reference

- Worked examples from the 2026-06-21 build: Etsy (bio-notes), Anichka (rich prose), Lord Wan Yelong (sparse stub), Eve Lockridge (AI-transcribed, cross-PC web). Scripts: `server/scripts/dossier-*.js`, `_history-*.js`.
- Schema: `server/schemas/character_dossier.schema.js`. Prose discipline: `shortform-composition` skill.
