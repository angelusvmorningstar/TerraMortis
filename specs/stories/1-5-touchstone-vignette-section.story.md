# Story 1.5: Touchstone Vignette Section

## Status: ready-for-dev

## Story

**As an** ST writing the Touchstone vignette for a character,
**I want** a section that looks up the character's actual touchstones on their sheet and generates a prompt specific to those relationships,
**so that** the vignette is grounded in the character's real mortal connections.

## Background

This story implements the Touchstone Vignette section in the DT Story character view, replacing the B1 scaffold placeholder. The Touchstone Vignette is an in-person scene — the character spending a quiet moment with one of their living mortal touchstones. It is distinct from the Letter from Home (B4), which is written correspondence.

### What "Touchstone Vignette" means

The vignette is a short second-person present-tense scene written from the character's perspective. The living mortal is the primary focus. Rules:
- In-person contact only — not a letter, not a phone call
- Living mortal as primary subject (the first-named entity cannot be a pronoun)
- Second person, present tense ("You watch Kateryna sort through her grandmother's things...")
- Character moments only — no plot hooks, no supernatural revelations
- ~100 words

This is different from Letter from Home (B4), which is NPC-authored correspondence. The vignette is an authored scene from the ST's perspective.

### Existing st_review.narrative structure — pre-fill fallback

The legacy DT Processing narrative panel saved touchstone vignette text to:

```js
sub.st_review?.narrative?.touchstone_vignette?.text   // legacy draft text
sub.st_review?.narrative?.touchstone_vignette?.status // 'draft' | 'ready'
```

When rendering, pre-fill the textarea from `stNarrative?.touchstone?.response` if present. If absent, fall back to `sub.st_review?.narrative?.touchstone_vignette?.text`. Once saved via DT Story, `st_narrative.touchstone.response` takes precedence and the fallback is no longer needed.

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

Attachment: `attached = (char.humanity || 0) >= t.humanity`.

Show all touchstones in the context block. The ST picks which one features in the scene. Detached touchstones are still shown — attachment status is informational; the ST may write a detachment scene.

### Player submission context

The DT2 app form has no dedicated touchstone field. However, `sub.responses?.aspirations` may contain player intent around mortal connections. Include it in the context block if non-empty — it may reveal which touchstone the player had in mind.

```js
const playerAspirations = sub.responses?.aspirations || null;
```

If absent, omit gracefully from the context block.

### Character sheet context

Include mask and dirge if present — they inform the emotional register of the scene:

```js
char.mask   // e.g. 'Jester', 'Authoritarian', 'Gallant'
char.dirge  // e.g. 'Competitive', 'Melancholic', 'Idealist'
```

These are optional — omit lines if absent.

### Copy Context prompt structure

```
You are helping a Storyteller write a Touchstone Vignette for a Vampire: The Requiem 2nd Edition LARP character.

Character: {displayName(char)}
Clan: {char.clan}
Covenant: {char.covenant}
Humanity: {char.humanity}
Mask: {char.mask}          ← omit if absent
Dirge: {char.dirge}        ← omit if absent

Touchstones:
- {t.name} ({t.desc || 'no description'}) — Humanity {t.humanity} — {Attached/Detached}
...

Player's aspirations:
{sub.responses?.aspirations || '[No aspirations recorded]'}

Write a short vignette (~100 words) of an in-person moment between the character and one of the above touchstones (or an invented mortal if none fit).

Style rules:
- Second person, present tense — the ST narrates to the character
- The living mortal is the primary subject of the scene
- The first referent cannot be a pronoun — open with the mortal's name
- In-person contact only — not a letter or phone call
- Character moments only — no plot hooks, no supernatural revelations, no foreshadowing
- No mechanical terms — no discipline names, dot ratings
- No em dashes
- British English
- Do not editorialise — write the scene, not its significance
```

### Section layout

Standard DT Story section pattern (from B1):

```
┌─────────────────────────────────────────────────────┐
│  TOUCHSTONE VIGNETTE                [Copy Context]   │
├─────────────────────────────────────────────────────┤
│  [Context block — collapsible]                       │
│  Touchstones: Kateryna (grand-niece) · Attached     │
│  Aspirations: "Keep touchstones safe..."             │
├─────────────────────────────────────────────────────┤
│  [textarea — ST's vignette]                          │
│  [Save Draft]    [Mark Complete ✓]                   │
└─────────────────────────────────────────────────────┘
```

Context block: collapsed by default once textarea has content; "Show context" toggle reveals it.

### Save pattern

```js
await saveNarrativeField(sub._id, {
  'st_narrative.touchstone': {
    response: text,
    author: getUser()?.global_name || getUser()?.username || 'ST',
    status: 'draft'
  }
});
```

On Mark Complete, same save with `status: 'complete'`.

### Completion

The Touchstone Vignette section is complete when `sub.st_narrative?.touchstone?.status === 'complete'`. Uses the generic `isSectionComplete(stNarrative, 'touchstone')`.

---

## Acceptance Criteria

1. The Touchstone Vignette section renders in the DT Story character view, replacing the B1 scaffold placeholder.
2. The section header shows "TOUCHSTONE VIGNETTE" with a completion dot (amber = incomplete, green = complete) and a Copy Context button.
3. The context block displays all character touchstones — each showing name, desc (if present), humanity threshold, and attached/detached status based on character's current humanity.
4. If `sub.responses?.aspirations` is non-empty, it is shown in the context block under "Player's aspirations:". If absent, the block shows "[No aspirations recorded]".
5. The context block also shows Character, Clan, Covenant, Humanity. Mask and Dirge are shown only if present on the character object.
6. The Copy Context button assembles `buildTouchstoneContext(char, sub)` and writes to clipboard. Shows "Copied!" / "Failed" states per shared `copyToClipboard` utility.
7. The prompt includes: character name/clan/covenant/humanity, mask/dirge (if present), all touchstones with relationship and attachment status, player aspirations (or absence note), house style rules (second person present tense, mortal primary, first referent not a pronoun, in-person only, ~100 words, British English, no em dashes).
8. The textarea is pre-filled from `sub.st_narrative?.touchstone?.response`. If absent, falls back to `sub.st_review?.narrative?.touchstone_vignette?.text` (DT1/legacy).
9. Save Draft: saves `{ response: text, author, status: 'draft' }` to `st_narrative.touchstone` via `saveNarrativeField`. Confirms save with brief visual feedback.
10. Mark Complete: saves `{ ..., status: 'complete' }`. Completion dot turns green. Pill rail re-derives amber/green from isSectionComplete.
11. Context block is collapsed once textarea has content; "Show context" toggle expands it.
12. No changes to `downtime-views.js`.

---

## Tasks / Subtasks

- [ ] Task 1: buildTouchstoneContext(char, sub) pure function
  - [ ] Reads char.touchstones, char.humanity for attachment status
  - [ ] Reads char.clan, char.covenant, char.mask, char.dirge for character context
  - [ ] Reads sub.responses?.aspirations for optional player context
  - [ ] Assembles prompt string with all sections; omits mask/dirge/aspirations lines gracefully if absent
  - [ ] Returns string

- [ ] Task 2: renderTouchstone(char, sub, stNarrative) renderer
  - [ ] Replaces B1 scaffold placeholder for 'touchstone' section
  - [ ] Context block: touchstone list + optional aspirations + character identity
  - [ ] Context block collapsed if stNarrative?.touchstone?.response is present
  - [ ] Pre-fill textarea: stNarrative?.touchstone?.response || sub.st_review?.narrative?.touchstone_vignette?.text || ''
  - [ ] Copy Context button, textarea (min 5 rows), Save Draft, Mark Complete

- [ ] Task 3: Event delegation for touchstone section
  - [ ] Copy Context → buildTouchstoneContext → copyToClipboard
  - [ ] Context toggle (Show/Hide context)
  - [ ] Save Draft → saveNarrativeField with 'st_narrative.touchstone', status: 'draft' → re-render section
  - [ ] Mark Complete → saveNarrativeField with status: 'complete' → re-render + update pill rail

- [ ] Task 4: CSS (if not already added by B4)
  - [ ] `.dt-story-touchstone-list` — touchstone entries in context block (may already exist from B4)
  - [ ] `.dt-story-touchstone-entry` — individual touchstone row (may already exist from B4)
  - [ ] `.dt-story-ts-attached` / `.dt-story-ts-detached` — attachment state styling (may already exist from B4)
  - [ ] `.dt-story-aspirations` — player aspirations block in context (italic, indented)

---

## Dev Notes

### Touchstone attachment display

Same pattern as B4:

```js
const attached = (char.humanity || 0) >= t.humanity;
// Display: "Kateryna (grand-niece) — Hum 6 — Attached"
// Display: "Sister — Hum 5 — Detached" (if char.humanity < 5)
```

Detached touchstones are shown — the ST may write a detachment or distance scene.

### Player aspirations field

DT2 submission form field `sub.responses?.aspirations` is a freetext field where players recorded short/medium/long aspirations. It often mentions mortal concerns or touchstone-relevant intent. Include it verbatim in the context block (truncate display to 200 chars if very long, but include full text in the clipboard prompt).

```js
const playerAspirations = sub.responses?.aspirations || null;
```

### Mask and Dirge

```js
char.mask   // e.g. 'Authoritarian', 'Jester', 'Gallant' — may be absent
char.dirge  // e.g. 'Competitive', 'Melancholic', 'Idealist' — may be absent
```

Include in prompt for emotional register calibration. Omit lines if absent:

```js
const maskLine  = char.mask  ? `Mask: ${char.mask}`   : null;
const dirgeLine = char.dirge ? `Dirge: ${char.dirge}` : null;
```

### Legacy pre-fill

```js
const existingResponse =
  stNarrative?.touchstone?.response ||
  sub.st_review?.narrative?.touchstone_vignette?.text ||
  '';
```

Note: the legacy key is `touchstone_vignette` (with `_vignette` suffix). The new st_narrative key is just `touchstone` (no suffix).

### CSS reuse from B4

B4 introduced `.dt-story-touchstone-list`, `.dt-story-touchstone-entry`, `.dt-story-ts-attached`, `.dt-story-ts-detached`. If B4 is already implemented, these classes are available. B5 only adds `.dt-story-aspirations` for the player aspirations block.

If B4 has not yet shipped, add all five classes in this story's CSS task.

### Section key for isSectionComplete

```js
isSectionComplete(sub.st_narrative, 'touchstone')
// → sub.st_narrative?.touchstone?.status === 'complete'
```

Note: the st_narrative key is `touchstone`, NOT `touchstone_vignette`. The legacy st_review key uses `touchstone_vignette`; the new key drops the suffix to keep it short.

### Imports needed in downtime-story.js (already present from B1/B2/B3/B4)

```js
import { apiGet, apiPut } from '../data/api.js';
import { displayName } from '../data/helpers.js';
import { getUser } from '../auth/discord.js';
```

No new imports needed for B5.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify: add buildTouchstoneContext, renderTouchstone, event handlers |
| `public/css/admin-layout.css` | Modify: add .dt-story-aspirations (and touchstone classes if B4 not yet shipped) |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Debug Log References
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-story.js`
- `public/css/admin-layout.css`
