# Story fix.365: DT Story — add player narrative text to Touchstone Vignette context builder

**Story ID:** fix.365
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-18
**Issue:** [#365](https://github.com/angelusvmorningstar/TerraMortis/issues/365)
**Branch:** ms/issue-365-player-submission-absent-story-moment

---

## User Story

As an ST using the DT Story tab, when I click "Copy Context" on a Story Moment card in Vignette format, I want the prompt to include the player's submitted narrative text — so that the AI has the player's input as raw material for the vignette, not just the character's touchstone list.

---

## Background

### Root cause — `buildTouchstoneContext` omits the player letter entirely

`buildLetterContext` (line 1418) includes the player's submitted letter via a priority chain:

```js
const playerLetter =
  sub.responses?.personal_story_text ||
  sub.responses?.correspondence ||
  sub.responses?.letter_to_home ||
  sub.responses?.letter ||
  sub.responses?.narrative_letter ||
  sub.responses?.personal_message ||
  null;
// ...
lines.push('Player-submitted letter:');
lines.push(playerLetter ? playerLetter.trim() : '[No player letter submitted]');
```

`buildTouchstoneContext` (line 1492) includes **no player narrative field at all**:

```js
function buildTouchstoneContext(char, sub) {
  // ... touchstones list, aspirations ...
  lines.push('Apply TOUCHSTONE_CALIBRATION. 100-300 words. Use house style.');
  return lines.join('\n');
}
```

The player may have written a personal narrative in `personal_story_text` (the current DT form field, introduced with dt-form.18). When the ST selects "Vignette" format and clicks Copy Context, the AI receives no player input — only the touchstone list and aspirations. The AI has no idea what the player intended for this cycle.

### Confirmed DT3 instance

Reed Justice submitted `personal_story_text` (the phone-call scene) but the vignette prompt contained no player narrative. This means the AI was expected to invent the entire vignette without the player's stated intent. The same field is used regardless of the format the ST selects for the response — the player writes one narrative and the ST chooses whether to respond as letter or vignette.

### Note: async race was a confounding factor

Some instances of "missing submission" in DT3 were caused by the async race fixed in #363/#364. After those fixes are applied, the player field will reliably reflect the correct character's submission. This fix adds the field that was structurally absent even when the correct submission was loaded.

---

## Acceptance Criteria

- [x] When Copy Context is clicked in Vignette format, the generated prompt includes the player's submitted narrative text under a "Player-submitted narrative:" label
- [x] If no player narrative was submitted (`personal_story_text` and all fallback fields are empty), the prompt shows `[No player narrative submitted this cycle]` rather than omitting the field entirely
- [x] The player narrative field appears after the touchstone list and aspirations, before the rubric line

---

## Implementation

### `public/js/admin/downtime-story.js`

#### `buildTouchstoneContext` — add player narrative (line ~1492)

```js
function buildTouchstoneContext(char, sub) {
  const humanity = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];
  const playerAspirations = sub.responses?.aspirations || null;

  // Player's submitted narrative — same priority chain as buildLetterContext
  const playerLetter =
    sub.responses?.personal_story_text ||
    sub.responses?.correspondence ||
    sub.responses?.letter_to_home ||
    sub.responses?.letter ||
    sub.responses?.narrative_letter ||
    sub.responses?.personal_message ||
    null;

  const lines = ['Draft a Touchstone Vignette for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  if (touchstones.length) {
    lines.push('');
    lines.push('Touchstones:');
    for (const t of touchstones) {
      const status = humanity >= (t.humanity || 0) ? 'Attached' : 'Detached';
      lines.push(`- ${t.name} (Humanity ${t.humanity}, ${status})`);
    }
  }

  lines.push('');
  lines.push(`Aspirations: ${playerAspirations ? playerAspirations.trim() : '[No aspirations recorded]'}`);

  lines.push('');
  lines.push('Player-submitted narrative:');
  lines.push(playerLetter ? playerLetter.trim() : '[No player narrative submitted this cycle]');

  lines.push('');
  lines.push('Apply TOUCHSTONE_CALIBRATION. 100-300 words. Use house style.');

  return lines.join('\n');
}
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Add player narrative field to `buildTouchstoneContext` |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- The player writes one narrative regardless of which format the ST selects. The field is `personal_story_text` in DT3 (dt-form.18+). The legacy fallback chain covers pre-dt-form.18 submissions.
- `buildLetterContext` already uses this priority chain correctly — this fix brings `buildTouchstoneContext` to parity.
- Label is "Player-submitted narrative:" (format-neutral) not "Player-submitted letter:". The old "Player's vignette:" label in `tests/issue-352-dt-story-prompt-assembly.spec.js` (Bug 1 tests) was updated to match.

---

## Dev Agent Record

**Date:** 2026-05-20

### Completion Notes

Fix implemented in commit `55a0cf4`. `buildTouchstoneContext` (line 1755) now includes the player narrative priority chain (`personal_story_text` → legacy fallbacks) under the label "Player-submitted narrative:" (line 1792). Updated 2 stale assertions in `tests/issue-352-dt-story-prompt-assembly.spec.js` (Bug 1 tests) which checked the old "Player's vignette:" label.

---

## File List

- `public/js/admin/downtime-story.js` (modified — player narrative added to buildTouchstoneContext)
- `tests/issue-352-dt-story-prompt-assembly.spec.js` (updated — label assertions corrected)

---

## Change Log

- 2026-05-18: fix(#365): add player narrative to buildTouchstoneContext
- 2026-05-20: test: corrected stale label assertions in issue-352 test file
- The label is "Player-submitted narrative:" rather than "Player-submitted letter:" to be format-neutral (the player's text is the raw material for whichever format the ST chooses).
