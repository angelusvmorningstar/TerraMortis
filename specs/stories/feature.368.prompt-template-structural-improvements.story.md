# Story feature.368: DT Story — prompt template structural improvements

**Story ID:** feature.368
**Epic:** DT Story tab improvements
**Status:** done
**Date:** 2026-05-18
**Issue:** [#368](https://github.com/angelusvmorningstar/TerraMortis/issues/368)
**Branch:** ms/issue-368-prompt-template-structural-improvements

---

## User Story

As an ST using the DT Story tab, I want the generated prompts to give the AI clearer, more specific writing instructions — word limits that discourage padding, anti-periphrasis guidance, and ST directives placed at the top where the AI will weight them most heavily.

---

## Background

### Three structural weaknesses identified in DT3 processing

**1. Word limit phrasing encourages padding**

Current rubric for project/patrol: `'One paragraph, 80-120 words. Use house style.'`

"80–120 words" sets 80 as the floor, which trains the AI to pad to reach the minimum. In practice the DT3 narratives that landed well were compact (60–90 words). The rubric should communicate that shorter is preferred within a ceiling.

**2. No anti-periphrasis guidance**

The AI reliably produces throat-clearing openers ("The night was thick with possibility", "As the shadows lengthened across the city") before getting to the actual narrative. These opening sentences contain zero information and waste word count. No current rubric discourages this pattern.

**3. ST directives appear at the bottom of prompts**

Current order in `buildProjectContext`:
1. Character header
2. Action details
3. Territory context
4. Story context
5. Player-facing note
6. **ST directives** (near-last)
7. Existing draft
8. Rubric (last)

LLMs weight the beginning and end of context windows more heavily than the middle. ST directives — the most important constraints — are buried in the middle. Moving them immediately before the rubric (second-to-last) ensures they are weighted correctly.

### Current rubric strings by builder

| Builder | Current rubric |
|---|---|
| `buildProjectContext` (line 618) | `'One paragraph, 80-120 words. Use house style.'` |
| `buildPatrolContext` (line 825) | `'Apply PATROL_SCALE. One paragraph, 80-120 words. Use house style.'` |
| `buildMaintenanceContext` (line 664) | `'No roll required. 50-80 words. Use house style.'` |
| `buildLetterContext` (line 1481) | `'Apply LETTER_CORRESPONDENT_RULES. 100-300 words. Use house style.'` |
| `buildTouchstoneContext` (line 1514) | `'Apply TOUCHSTONE_CALIBRATION. 100-300 words. Use house style.'` |
| `buildCacophonySavvyContext` (line 2973) | `'Write a short vignette (~75 words) of what...'` |

---

## Acceptance Criteria

- [x] Project and patrol rubric reads: `No more than 120 words; shorter is better. Do not open with atmosphere or mood-setting — begin on action or consequence. Use house style.`
- [x] Maintenance rubric reads: `No more than 80 words; shorter is better. No scene-setting opener. Use house style.`
- [x] Letter rubric reads: `Apply LETTER_CORRESPONDENT_RULES. No more than 300 words. Do not open with "I hope this letter finds you" or similar pleasantries. Use house style.`
- [x] Vignette rubric reads: `Apply TOUCHSTONE_CALIBRATION. No more than 200 words; shorter is better. Begin in scene — no mood-setting preamble. Use house style.`
- [x] Cacophony Savvy rubric reads: `No more than 80 words. Begin with the rumour itself, not with the character receiving it. Use house style.`
- [x] ST directives block (`ST directives (must reflect):`) is moved to immediately before the existing draft + rubric in `buildProjectContext` and `buildPatrolContext` — it no longer appears between territory context and player-facing note
- [x] Story context (`Story context (do not contradict):`) remains before ST directives

---

## Implementation

### `public/js/admin/downtime-story.js`

#### 1. Updated rubric strings

**`buildProjectContext` (line ~618):**
```js
// Before:
const rubric = [
  isInvestigation ? 'Apply INVESTIGATION_THRESHOLDS.' : null,
  isFeed ? 'Apply FEEDING_CONSTRAINTS.' : null,
  'One paragraph, 80-120 words. Use house style.',
].filter(Boolean).join(' ');

// After:
const rubric = [
  isInvestigation ? 'Apply INVESTIGATION_THRESHOLDS.' : null,
  isFeed ? 'Apply FEEDING_CONSTRAINTS.' : null,
  'No more than 120 words; shorter is better. Do not open with atmosphere or mood-setting — begin on action or consequence. Use house style.',
].filter(Boolean).join(' ');
```

**`buildPatrolContext` (line ~825):**
```js
// Before:
lines.push('Apply PATROL_SCALE. One paragraph, 80-120 words. Use house style.');

// After:
lines.push('Apply PATROL_SCALE. No more than 120 words; shorter is better. Do not open with atmosphere or mood-setting — begin on action or consequence. Use house style.');
```

**`buildMaintenanceContext` (line ~664):**
```js
// Before:
lines.push('No roll required. 50-80 words. Use house style.');

// After:
lines.push('No roll required. No more than 80 words; shorter is better. No scene-setting opener. Use house style.');
```

**`buildLetterContext` (line ~1481):**
```js
// Before:
lines.push('Apply LETTER_CORRESPONDENT_RULES. 100-300 words. Use house style.');

// After:
lines.push('Apply LETTER_CORRESPONDENT_RULES. No more than 300 words. Do not open with pleasantries or greetings — begin with the letter\'s substance. Use house style.');
```

**`buildTouchstoneContext` (line ~1514):**
```js
// Before:
lines.push('Apply TOUCHSTONE_CALIBRATION. 100-300 words. Use house style.');

// After:
lines.push('Apply TOUCHSTONE_CALIBRATION. No more than 200 words; shorter is better. Begin in scene — no mood-setting preamble. Use house style.');
```

**`buildCacophonySavvyContext` (line ~2973):**
```js
// Before:
lines.push(`Write a short vignette (~75 words) of what ${char ? displayName(char) : 'the character'} heard via the Cacophony about this event.`);

// After:
lines.push(`Write a vignette of no more than 80 words of what ${char ? displayName(char) : 'the character'} heard via the Cacophony about this event. Begin with the rumour itself, not with the character receiving it.`);
```

#### 2. Move ST directives block in `buildProjectContext`

Current order (after territory context): story_context → player_facing_note → **ST directives** → existing draft → rubric.

New order: story_context → player_facing_note → existing draft → **ST directives** → rubric.

Move the ST directives block (lines 596–603) to immediately before `lines.push(rubric)`. The story context and player-facing note blocks stay in place.

**`buildProjectContext` — reorder blocks (line ~596–622):**

```js
  // ... territory context block ends ...

  // Story context (ST-written context for AI prompt) — stays here
  if (rev.story_context) {
    lines.push('');
    lines.push(`Story context (do not contradict): ${rev.story_context}`);
  }
  if (rev.player_facing_note) {
    lines.push('');
    lines.push(`Player-facing note: ${rev.player_facing_note}`);
  }

  // Existing draft — moved before ST directives
  if (existingDraft) {
    lines.push('');
    lines.push('Existing draft (revise unless told to rewrite):');
    lines.push(existingDraft);
  }

  // ST directives — moved to just before rubric
  const hasDirectives = rev.st_note || notes.length;
  if (hasDirectives) {
    lines.push('');
    lines.push('ST directives (must reflect):');
    if (rev.st_note) lines.push(`- ${rev.st_note}`);
    for (const n of notes) lines.push(`- [${n.author_name || 'ST'}] ${n.text || ''}`);
  }

  lines.push('');
  lines.push(rubric);
```

Apply the same reordering to `buildPatrolContext`.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Update rubric strings in all 6 builders; reorder ST directives block in `buildProjectContext` and `buildPatrolContext` |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- Do not change `LETTER_CORRESPONDENT_RULES`, `TOUCHSTONE_CALIBRATION`, `PATROL_SCALE`, `INVESTIGATION_THRESHOLDS`, or `FEEDING_CONSTRAINTS` — these are prompt-system rule labels referenced by the AI's system prompt, not strings defined in this file.
- The instruction "Do not open with atmosphere or mood-setting" replaces the "One paragraph" constraint, which was also being ignored. The new instruction is behavioural, not structural.
- `buildMaintenanceContext` has no territory context block and no existing-draft field, so no reordering is needed there.

---

## Dev Agent Record

### Completion Notes

All 5 rubric string updates and both ST directives reorderings were already implemented in `downtime-story.js` from a prior session. The only gap was `buildCacophonySavvyContext` missing "Use house style." at the end of its rubric line (the implementation spec omitted it; the AC required it). Added in this session. All ACs now satisfied.

- Rubrics verified at: line 852 (project), 899 (maintenance), 1100 (patrol), 1783 (letter), 1855 (touchstone), 3443 (cacophony)
- ST directives ordering verified at: buildProjectContext line 839, buildPatrolContext line 1091 — both placed immediately before rubric

### Change Log

- 2026-06-07: Added "Use house style." to `buildCacophonySavvyContext` rubric line (downtime-story.js:3443). All other ACs already satisfied. Story closed.
