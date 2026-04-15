# Story 1.4: Letter from Home Section

## Status: done

## Story

**As an** ST writing the Letter from Home for a character,
**I want** a section that pulls the character's touchstones and player-submitted letter and assembles a tailored Copy Context prompt,
**so that** I can draft the NPC reply with the correct voice and context.

## Background

This story implements the Letter from Home section in the DT Story character view, replacing the B1 scaffold placeholder. The ST writes a reply letter from an NPC to the player character. The Copy Context button assembles a prompt with the character's touchstones, any player-submitted letter, and house style rules.

### What "Letter from Home" means

The letter is always a **reply from an NPC to the character** — never from the character. Letters are character moments only; no plot hooks. If the player hasn't specified a correspondent, the ST invents one from the character's background.

This is different from the Touchstone vignette (B5), which is an in-person scene. The letter is correspondence.

### Existing st_review.narrative structure — pre-fill fallback

The system already has a `st_review.narrative.letter_from_home` field used in Downtime 1 processing:

```js
// Already present on some DT1 submissions:
sub.st_review?.narrative?.letter_from_home?.text   // existing ST letter draft
sub.st_review?.narrative?.letter_from_home?.status // 'draft' | 'ready'
```

When rendering, pre-fill the textarea from `st_narrative.letter_from_home.response` if present. If absent, fall back to `sub.st_review?.narrative?.letter_from_home?.text`. This preserves any DT1 work without a separate migration.

Once the ST saves via DT Story, it writes to `st_narrative.letter_from_home` and the fallback path is no longer needed.

### Touchstone data

Touchstones are on the character object in `_allCharacters`. Structure:

```js
char.touchstones = [
  { humanity: 6, name: 'Kateryna', desc: 'grand-niece' },
  { humanity: 5, name: 'Sister',   desc: null },
]
```

- `t.humanity` — minimum humanity level for the touchstone to be "attached"
- `t.name` — touchstone's name
- `t.desc` — relationship description (optional, may be null)

To determine attachment status: `attached = (char.humanity || 0) >= t.humanity`.

Show all touchstones in the context block, with attached/detached status, as potential letter writers. The ST picks which one writes the reply.

### Player's submitted letter

The player may have written a letter as part of their downtime submission. This is stored in `sub.responses`. The exact field key needs to be confirmed against the actual submission data — check `sub.responses` for a key matching `letter`, `letter_to_home`, or `narrative_letter`. If found, include it in the prompt context so the ST can write a reply to it.

To confirm: read an actual submission document from the DB/API and inspect `sub.responses` keys. If no letter field exists, omit it from the context block gracefully.

### Copy Context prompt structure

```
You are helping a Storyteller draft a Letter from Home for a Vampire: The Requiem 2nd Edition LARP character.

Character: {displayName(char)}
Clan: {char.clan}
Covenant: {char.covenant}

Touchstones:
- {t.name} ({t.desc || 'no description'}) — Humanity {t.humanity} — {Attached/Detached}
...

Player's submitted letter:
{sub.responses?.letter_to_home || sub.responses?.letter || '[No player letter submitted]'}

Write a reply letter (~100 words) from one of the above touchstones (or an invented correspondent if none fit) to the character.

Style rules:
- Written by the NPC to the character, never from the character
- Character moments only — no plot hooks, no hints of future events
- Match the correspondent's voice based on their relationship to the character
- Second person (the NPC writes "you" addressing the character)
- British English
- No mechanical terms — no discipline names, dot ratings
- No em dashes
- Do not editorialise — write the scene, not its significance
```

### Section layout

Standard DT Story section pattern (from B1):

```
┌─────────────────────────────────────────────────────┐
│  LETTER FROM HOME                       [Copy Context] │
├─────────────────────────────────────────────────────┤
│  [Context block — collapsible]                       │
│  Touchstones: Kateryna (grand-niece) · Attached     │
│  Player letter: "Dear..."                            │
├─────────────────────────────────────────────────────┤
│  [textarea — ST's reply letter]                      │
│  [Save Draft]    [Mark Complete ✓]                   │
└─────────────────────────────────────────────────────┘
```

Context block: collapsed by default once textarea has content; "Show context" toggle reveals it.

### Save pattern

```js
await saveNarrativeField(sub._id, {
  'st_narrative.letter_from_home': {
    response: text,
    author: getUser()?.global_name || getUser()?.username || 'ST',
    status: 'draft'
  }
});
```

On Mark Complete, same save with `status: 'complete'`.

### Completion

The Letter from Home section is complete when `sub.st_narrative?.letter_from_home?.status === 'complete'`. Uses the generic `isSectionComplete(stNarrative, 'letter_from_home')`.

---

## Acceptance Criteria

1. The Letter from Home section renders in the DT Story character view above the Touchstone section, replacing the B1 scaffold placeholder.
2. The section header shows "LETTER FROM HOME" with a completion dot (amber = incomplete, green = complete) and a Copy Context button.
3. The context block displays all character touchstones — each showing name, desc (if present), humanity threshold, and attached/detached status based on character's current humanity.
4. If a player letter is found in `sub.responses` (check for `letter_to_home`, `letter`, or similar keys), it is shown in the context block under "Player's submitted letter:". If absent, the block shows "[No player letter submitted]".
5. The Copy Context button assembles `buildLetterContext(char, sub)` and writes to clipboard. Shows "Copied!" / "Failed" states per shared `copyToClipboard` utility.
6. The prompt includes: character name/clan/covenant, all touchstones with relationship and attachment, player's submitted letter (or absence note), house style rules (~100 words, NPC reply, no plot hooks, British English, no em dashes, second person from NPC).
7. The textarea is pre-filled from `sub.st_narrative?.letter_from_home?.response`. If absent, falls back to `sub.st_review?.narrative?.letter_from_home?.text` (DT1 legacy).
8. Save Draft: saves `{ response: text, author, status: 'draft' }` to `st_narrative.letter_from_home` via `saveNarrativeField`. Confirms save with brief visual feedback.
9. Mark Complete: saves `{ ..., status: 'complete' }`. Completion dot turns green. Pill rail re-derives amber/green from isSectionComplete.
10. Context block is collapsed once textarea has content; "Show context" toggle expands it.
11. No changes to `downtime-views.js`.

---

## Tasks / Subtasks

- [x] Task 1: buildLetterContext(char, sub) pure function
  - [x] Reads char.touchstones, char.humanity for attachment status
  - [x] Reads char.clan, char.covenant for character context
  - [x] Finds player letter in sub.responses (check multiple possible keys)
  - [x] Assembles prompt string with all sections; omits empty lines gracefully
  - [x] Returns string

- [x] Task 2: renderLetterFromHome(char, sub, stNarrative) renderer
  - [x] Replaces B1 scaffold placeholder for 'letter_from_home' section
  - [x] Context block: touchstone list + player letter (or absence note)
  - [x] Context block collapsed if stNarrative?.letter_from_home?.response is present
  - [x] Pre-fill textarea: stNarrative?.letter_from_home?.response || sub.st_review?.narrative?.letter_from_home?.text || ''
  - [x] Copy Context button, textarea (min 5 rows), Save Draft, Mark Complete

- [x] Task 3: Event delegation for letter_from_home section
  - [x] Copy Context → buildLetterContext → copyToClipboard
  - [x] Context toggle (Show/Hide context)
  - [x] Save Draft → saveNarrativeField with 'st_narrative.letter_from_home', status: 'draft' → re-render section
  - [x] Mark Complete → saveNarrativeField with status: 'complete' → re-render + update pill rail

- [x] Task 4: Confirm player letter field name
  - [x] Inspected backup_downtime_2_2026-04-13.json — field is `correspondence` (schema: "In-character letter to NPC")
  - [x] buildLetterContext checks: correspondence → letter_to_home → letter → narrative_letter → personal_message
  - [x] Gracefully shows [No player letter submitted] if none found

- [x] Task 5: CSS
  - [x] `.dt-story-touchstone-list` — touchstone entries in context block
  - [x] `.dt-story-touchstone-entry` — individual touchstone row
  - [x] `.dt-story-ts-attached` / `.dt-story-ts-detached` — attachment state styling
  - [x] `.dt-story-player-letter` — player letter block in context (italic, indented)

---

## Dev Notes

### Touchstone attachment display

```js
const attached = (char.humanity || 0) >= t.humanity;
// Display: "Kateryna (grand-niece) — Hum 6 — Attached"
// Display: "Sister — Hum 5 — Detached" (if char.humanity < 5)
```

Detached touchstones are still shown — the ST may still use them as letter writers for flavour. Attachment status is informational.

### Finding the player letter key

DT1 was imported from CSV so its structure differs from DT2 app form. Check:

```js
// Try in order:
const playerLetter =
  sub.responses?.letter_to_home ||
  sub.responses?.letter ||
  sub.responses?.narrative_letter ||
  sub.responses?.personal_message ||
  null;
```

If not found, the prompt line shows `[No player letter submitted]` — graceful degradation.

### Clan and covenant display

```js
char.clan     // e.g. 'Mekhet', 'Daeva', 'Gangrel'
char.covenant // e.g. 'Invictus', 'Carthian Movement', 'Circle of the Crone'
```

Both are stored as strings directly on the character object. Include in prompt for NPC voice calibration — an Invictus character's family writes differently than a Circle character's.

### Legacy st_review.narrative pre-fill

Only used as fallback on initial render. Once saved via DT Story, `st_narrative.letter_from_home.response` is present and takes precedence. Do not migrate the old field — just read it as a fallback:

```js
const existingResponse =
  stNarrative?.letter_from_home?.response ||
  sub.st_review?.narrative?.letter_from_home?.text ||
  '';
```

### Section key for isSectionComplete

```js
isSectionComplete(sub.st_narrative, 'letter_from_home')
// → sub.st_narrative?.letter_from_home?.status === 'complete'
```

This matches the generic helper from B1. No special handling needed.

### Imports needed in downtime-story.js (already present from B1/B2/B3)

```js
import { apiGet, apiPut } from '../data/api.js';
import { displayName } from '../data/helpers.js';
import { getUser } from '../auth/discord.js';
```

No new imports needed for B4.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify: add buildLetterContext, renderLetterFromHome, event handlers |
| `public/css/admin-layout.css` | Modify: add letter section CSS in dt-story-* block |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |
| 2026-04-15 | 1.1 | Implementation complete | Dev Agent (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None — no blocking issues.

### Completion Notes List
- Player letter field confirmed as `correspondence` via backup_downtime_2_2026-04-13.json inspection; multiple fallback keys also checked
- DT1 legacy fallback reads `sub.st_review?.narrative?.letter_from_home?.text` on initial render; once saved via DT Story, st_narrative takes over
- Detached touchstones shown with CSS strikethrough; still usable as letter writers
- Panel click handler refactored from B2's project-only routing to section-key routing via `closest('.dt-story-section')?.dataset.section` — extensible for B5-B7
- renderSection dispatch extended with letter_from_home case
- Section header now uses `.dt-story-section-header-actions` flex wrapper to align Copy Context button + completion dot

### File List
- `public/js/admin/downtime-story.js`
- `public/css/admin-layout.css`
