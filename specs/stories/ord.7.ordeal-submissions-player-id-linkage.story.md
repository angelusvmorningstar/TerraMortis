---
id: ord.7
epic: ord
status: superseded
priority: high
depends_on: [ord.5]
superseded_by: ord.5
---

**Superseded** by ORD-5's direct-migration approach. `player_id` linkage is
implemented inline in `migrate-ordeal-submissions-from-deprecated.js` via a
reverse `players.character_ids` lookup. Player-level ordeals carry a valid
`player_id`; character_history carries null; retired characters (Kirk Grimm)
carry null with a warning.

# Story ORD-7: Add player_id linkage for player-level ordeals

As an ST,
I want every imported `ordeal_submissions` document for lore_mastery, rules_mastery, and covenant_questionnaire to carry a valid `player_id`,
So that player-level XP and ordeal status resolve correctly across all the player's characters.

---

## Context

Lore Mastery, Rules Mastery, and Covenant Questionnaire are player-level ordeals: passing one grants XP to every character the player owns. The current `import-ordeal-submissions.js` hardcodes `player_id: null` on every submission regardless of ordeal type. For player-level ordeals, this leaves the ordeal unable to attribute correctly.

Character History stays character-scoped (no player_id), consistent with how the Ordeals tab currently differentiates character-level vs player-level ordeals (`CHAR_ORDEALS` vs `PLAYER_ORDEALS` in `ordeals-view.js`).

---

## Acceptance Criteria

**Given** `import-ordeal-submissions.js` is amended **Then** after the character is resolved, the script looks up the character's `player` field value (Discord id or the current player link convention). **And** joins that to `tm_suite.players` to find the player document. **And** sets `player_id` on the submission.

**Given** the ordeal_type is `lore_mastery`, `rules_mastery`, or `covenant_questionnaire` **Then** `player_id` is required at write time. **And** if lookup fails, the submission is still written with `player_id: null` but a warning is logged in the run summary.

**Given** the ordeal_type is `character_history` **Then** `player_id` remains null regardless. **And** no lookup is attempted.

**Given** a character's `player` field is null or empty **Then** the script prints a warning `[PLAYER_LOOKUP_FAILED] <character name>: player field empty` and writes with `player_id: null`.

**Given** a character's `player` field points at a Discord id that has no matching `players` document **Then** same warning `[PLAYER_LOOKUP_FAILED] <character name>: no player for id=<discord_id>` and writes with `player_id: null`.

**Given** the schema `server/schemas/ordeal.schema.js` **Then** no structural change is required (player_id is already optional). **And** a comment is added documenting: "player_id is required for lore_mastery, rules_mastery, covenant_questionnaire; null for character_history."

**Given** the Ordeals tab resolver in `public/js/tabs/ordeals-view.js` **Then** it reads `player_id` for player-level ordeals and attributes XP to all characters owned by that player. No change to the resolver if it already queries `/api/ordeal_submissions/mine` (which is player-scoped server-side).

**Given** the import completes **Then** the summary prints: successful player_id resolutions, warnings for unresolved players.

---

## Implementation Notes

- **Player link convention**: verify how the project currently maps `character.player` to `players.<id>`. Check `tm_suite.characters` for a sample: if `player` is a Discord id (snowflake), `players` is likely keyed by `_id` or `discord_id`. Confirm during drafting.
- **Upsert preservation**: the existing `$setOnInsert` guard means re-running the import does not overwrite existing docs. If a doc already exists with `player_id: null` and this story's fix would populate it, decide: run a separate one-time patch for existing records, OR accept that only new imports benefit. Lean toward the patch: a follow-up `node server/scripts/patch-player-id.js` that reads current `tm_suite.ordeal_submissions` and back-fills player_id for player-level ordeal types.
- **Testing**: extend the existing `--dry-run` output to include `[PLAYER] <name> → <player_id>` lines so the audit surfaces player resolution quality.

## Files expected to change

- `server/scripts/import-ordeal-submissions.js` (player resolver)
- `server/schemas/ordeal.schema.js` (docstring comment only)
- Optional: `server/scripts/patch-player-id.js` (new, for back-filling if needed)
