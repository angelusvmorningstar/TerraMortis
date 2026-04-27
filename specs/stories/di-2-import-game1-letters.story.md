---
id: di.2
epic: di
status: needs-product-input
priority: low
depends_on: []
---

# Story DI-2: Import Game 1 Letters into Chronicles

As a player viewing the Story / Chronicle tab,
I want the in-character letter I received at the start of Game 1 to be accessible alongside my downtime narratives,
So that my opening correspondence is preserved in one place rather than living in an out-of-band document the ST sent me.

---

## Status: needs-product-input

This story **cannot be implemented as written** because the source data is not located in the repository and its shape is undefined. The story is registered to track the intent, but the next step is a scoping conversation with the user, not implementation.

### What's missing before this can move to ready-for-dev

1. **Source data location.** A grep across the repository for "letter", "game 1", "chapter 1 letter", "opening letter" returns no Game 1 letter content. The letters either:
   - Live in a Google Doc / Drive folder accessible to the ST.
   - Live in `st-working/` under a name that doesn't match obvious search terms (worth a manual browse).
   - Have not been collected centrally — each player received their letter individually and the ST has the originals in their own files.
   - Are in `Notion` or another external tool.
   - Need to be (re)gathered before this story can proceed.
2. **Data shape.** Are the letters:
   - Plain text per character?
   - Markdown with sections (greeting, body, signature)?
   - PDFs or images that would need OCR?
3. **Coverage.** Is there a letter for **every** Game 1 character (~31), or only for some?
4. **Authorship attribution.** Each letter is in-character from another NPC. Does the data preserve who the in-character author is, or is it just "from home"?
5. **Where they live in the player UI.** The epic file flags this as undecided:
   > Determine where letters should live: new document type, or as a section within a DT submission document?
   - Option A: A new document type rendered in the Story tab's Documents pane (right side of the split layout). Sit alongside Dossier and History as a third permanent doc card titled "Letter from Home — Game 1".
   - Option B: A pre-DT1 entry in the Chronicle pane (left side). Acts as a "Cycle 0" entry chronologically. Requires either a new `downtime_cycle` doc with `game_number: 0` or a new collection.
   - Option C: A section appended to each character's existing `chars_v2.json` history blob (or equivalent on the live character document).

### Recommendation for the scoping conversation

Bring three things to the next pass:

1. The actual Game 1 letter content (file dump, Drive folder link, or pointer).
2. A coverage count: how many of the ~31 active characters have a letter?
3. A preference between rendering options A / B / C above. Recommend **Option A** (Documents pane card) because:
   - Letters are not downtime narratives; placing them in the Chronicle pane forces a fake "Cycle 0" that distorts cycle-counting logic across the codebase.
   - The Documents pane already hosts Dossier and History — a Letter card fits the existing pattern at `public/js/tabs/story-tab.js:111-116`.
   - A new collection (e.g. `character_letters`) keeps the data isolated and easy to extend if Game 2 / Chapter 2 letters become a thing.

---

## Provisional acceptance criteria (drafted against Option A — review before implementation)

These are pre-implementation drafts. They may need revising once the source data is in hand.

### Schema (Option A)

A new collection `character_letters` with documents shaped:

```js
{
  character_id: ObjectId,        // foreign key
  game_number: 1,                // 1 for Game 1; extensible to 2+ later
  title: 'Letter from Home',     // display title; may differ per letter
  author: 'string|null',         // in-character author if known
  body_md: 'string',             // markdown body
  received_at: ISODate,          // narrative date the letter was received (Game 1 night)
  imported_at: ISODate,          // when this record was created
}
```

### Import (Option A)

A script `server/migrate-game1-letters.js` that:
- Reads source data from a path TBD.
- Inserts one `character_letters` doc per character.
- Idempotent: skip if a doc already exists for the (character_id, game_number) pair; `--force` overwrites.
- Reports per-character: insert / skip / fail with a name.

### Render (Option A)

In `public/js/tabs/story-tab.js`:
- New API call to `/api/character_letters?character_id=<id>` inside `renderStoryTab`.
- New `renderLetterCard(letter)` function returning a `.doc-card` block matching the existing Dossier / History card shape.
- Card slots into the Documents pane (right side) above or below the existing cards (UX preference TBD).

### API endpoint

A new route `GET /api/character_letters` that:
- Filters by `character_id` query param.
- Player role: returns only letters for the caller's own characters.
- ST role: returns whatever `character_id` is requested (no scope restriction).
- Per memory `feedback_player_list_endpoints_scope`: the role-scoping happens at the Mongo query level, not post-fetch.

---

## Files expected to change (provisional, Option A)

- `server/migrate-game1-letters.js` — new script.
- `server/routes/character_letters.js` — new route file.
- `server/index.js` — wire the new route.
- `server/schemas/character_letter.schema.js` — new schema.
- `public/js/tabs/story-tab.js` — fetch + render letter card in Documents pane.
- `public/css/<player-app-css>.css` — minor styling if the letter card needs anything beyond the existing `.doc-card` chrome.

---

## Definition of Done

- AC verified once they're locked.
- Game 1 letters visible to each character in their Story tab on player.html.
- Idempotent script; can be re-run without duplicating.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `di-2-import-game1-letters: needs-product-input → backlog → ready-for-dev → in-progress → review` as the scoping conversation resolves and work proceeds.

---

## Dependencies and ordering

- **No technical upstream dependencies.**
- **Product upstream:** the scoping conversation listed above must happen first.
- **No downstream blockers.** DI-2 ships independently of DI-1 and DI-3.
- **Could pair with NPC infrastructure** (NPCR epic, recently shipped): if letters carry an in-character author, that author may already be (or should be) an NPC record. Worth checking at scoping.

---

## References

- `specs/epic-data-imports.md` — DI epic; DI-2 acceptance criteria and dev notes.
- `public/js/tabs/story-tab.js:103-119, 122-149` — Story tab two-pane layout; Chronicle vs Documents split.
- `memory/feedback_player_list_endpoints_scope.md` — query-level role scoping rule.
- `memory/project_npcr_epic.md` — NPC infrastructure that may interact with letter authorship.
- Recommended scoping reference: `specs/stories/dtosl.5.inline-quick-add-npc.story.md` (similar shape — story scoped tightly because the data model wasn't fully resolved at drafting time).
