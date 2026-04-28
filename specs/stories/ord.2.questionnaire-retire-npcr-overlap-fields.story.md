---
id: ord.2
epic: ord
status: done
priority: medium
depends_on: []
---

# Story ORD-2: Retire NPCR-overlap fields from Questionnaire

As an ST,
I want the Character Questionnaire to stop collecting relationship lists, sire data, family data, and boon/debt tracking that the NPCs tab now owns authoritatively,
So that relationship data lives only in the relationships graph and the ordeal directs players to the right home.

---

## Context

After NPCR shipped, the Relationships graph became the authoritative store for allies, coterie, enemies, sires, family, touchstones, and debt edges. The Character Questionnaire still asks for this content as free-text lists and per-character dynamic entries. "No dead data" means retire these fields and replace them with copy that points players at the NPCs tab.

This story is independent of ORD.1. Both run against the same source file but touch disjoint fields.

### Fields retired

| Field removed | NPCR home |
|---|---|
| `allies_characters` (character_select) | `kind='ally'` edges |
| `allies` (notes) | Per-edge `note` field |
| `coterie_characters` (character_select) | `kind='coterie'` edges (mutual-confirm) |
| `coterie` (notes) | Per-edge `note` field |
| `enemies_characters` (character_select) | `kind='rival'` / `'enemy'` edges |
| `enemies` (notes) | Per-edge `note` field |
| `boons_debts` (dynamic list) | `kind='debt-holder'` / `'debt-bearer'` edges |
| `sire_name` (text) | `kind='sire'` edge |
| `sire_story` (textarea) | Per-edge `state` on the sire edge |
| `mortal_family` (dynamic list) | `kind='family'` edges |

### Secrets — deferred

`secrets` is a structured per-character list that could map to a new NPCR kind (`secret` or `shared_secret`) but no such kind exists yet. For this story, `secrets` stays in the questionnaire. A follow-up story may introduce the NPCR kind and migrate.

---

## Acceptance Criteria

**Given** `public/js/tabs/questionnaire-data.js` **Then** the listed ten field definitions are removed.

**Given** the Character Connections section now has only `opposed_covenant_tag`, `opposed_covenant`, `intolerable_behaviours`, and `secrets` **Then** the section intro copy is rewritten to direct players to the NPCs tab for allies, coterie, enemies, boons, and debts, with inline language like: "Relationship connections are now tracked in the NPCs tab. This section covers only narrative stance, not specific characters."

**Given** the Character History section loses `sire_name`, `sire_story`, and `mortal_family` **Then** what remains (`embrace_story`, `early_city`, `early_nights`, `last_city_politics`, `hunting_method_tags`, `hunting_style_note`, `first_kill`, `common_indulgences`) renders cleanly. **And** the section intro notes that sire and family relationships are tracked in the NPCs tab.

**Given** a historical `questionnaire_responses` with retired fields populated **Then** the document loads without error. **And** the read-only review view omits the retired fields.

**Given** an ST opens the admin questionnaire review **Then** retired fields are not rendered. **And** the audit trail in `tm_deprecated.questionnaire_responses` retains original values for historical reference.

**Given** a new submission **Then** retired field keys are not stored on the saved document (save-boundary strip).

**Given** a player without any NPCR edges for allies/coterie/etc. **Then** the questionnaire does not error or block; it simply has no connections section to fill. The NPCs tab is the place to add them.

---

## Implementation Notes

- Copy for the "go to NPCs tab" redirect should be short and concrete. Example: *"Add allies, coterie, enemies, sires, family, and favours owed in the NPCs tab. This section covers only narrative stance."*
- Do not modify NPCR schemas; this story only retires form fields.
- If `secrets` is kept: keep the `character_picker` subfield intact; do not regress that dynamic list. A future story may convert it to an NPCR kind.
- Test coverage: extend `server/tests/api-questionnaire.test.js` to assert retired fields are stripped at save time.
- Smoke: open questionnaire in browser, verify the NPCs-tab redirect copy is visible, confirm the form submits cleanly without the retired fields.

## Files expected to change

- `public/js/tabs/questionnaire-data.js`
- `public/js/tabs/questionnaire-form.js` (save-boundary strip; intro copy render)
- `public/js/admin/questionnaire-admin.js` or equivalent admin review surface
- `server/tests/api-questionnaire.test.js`
