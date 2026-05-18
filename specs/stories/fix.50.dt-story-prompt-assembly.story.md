# Story fix.50: DT Story — prompt assembly missing player submission + wrong previous-cycle content

**Story ID:** fix.50
**Issue:** #352
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/352
**Branch:** ms/issue-352-downtime-prompt-dt3-submissions
**Epic:** Fixes
**Status:** review
**Date:** 2026-05-18

---

## User Story

As an ST generating a Copy Context prompt for a player's Letter from Home or Touchstone Vignette, I want the prompt to include the player's current-cycle submission text and the correct previous-cycle output, so that I can draft the narrative with accurate material and not accidentally produce output based on wrong or missing data.

---

## Background

Two bugs in `public/js/admin/downtime-story.js` corrupt the Copy Context prompt for the Story Moment section. Both are in the prompt-assembly and previous-cycle-fetch logic triggered by clicking "Copy Context" on the Story Moment card. Both must be fixed in this story.

### Bug 1 — `buildTouchstoneContext` never includes the player's DT submission text

`buildLetterContext` (line ~1426) correctly reads the player's submission:
```js
const playerLetter =
  sub.responses?.personal_story_text ||
  sub.responses?.correspondence ||
  sub.responses?.letter_to_home ||
  ...
  null;
```
It then writes `Player-submitted letter: [text or sentinel]` into the prompt.

`buildTouchstoneContext` (line ~1500) has **no equivalent**. It reads only `aspirations` from `sub.responses`. The player's DT vignette scene — stored in `personal_story_text` — is silently dropped from the generated prompt.

**Confirmed instance:** Reed Justice DT3 — player submitted a vignette scene (scale-model phone call with mother). The Copy Context prompt contained only DT2 previous-vignette material; no DT3 player content appeared. ST drafted from DT2 by mistake.

**Why it matters:** An empty player-submission field is indistinguishable from "player submitted nothing." When the ST sees no content they may assume the player didn't submit and invent material or carry over the prior cycle. Both outcomes silently ignore player-authored content.

### Bug 2 — Wrong previous-cycle content type in vignette slot

In `handleCopyStoryMomentContext` (line ~3432), previous-cycle content is derived at lines ~3494-3500:

```js
const prevLetterText = (prevStoryMoment?.format === 'letter' && prevStoryMoment.response)
  ? prevStoryMoment.response
  : prevLegacyLetter;

const prevVignetteText = (prevStoryMoment?.format === 'vignette' && prevStoryMoment.response)
  ? prevStoryMoment.response
  : prevLegacyVignette;   // ← the bug is here
```

The fallback `prevLegacyVignette = prevSub.st_narrative?.touchstone?.response`.

If the previous cycle's `story_moment` exists (modern submission — DT2 onwards) **but was a letter** (`format === 'letter'`), the vignette check fails and falls through to `prevLegacyVignette`. If `st_narrative.touchstone.response` was ever populated — by older processing code or as a legacy field — it serves that content as the "previous vignette" even though it contains letter text.

**Confirmed instances:** Julia Dolancia, Ludica Lachramore, Macheath — "previous vignette (DT2)" field contained their DT2 letter text, signed "Yours, Ian" / "Falcone" / "P". The actual DT2 vignette was not loaded.

**Root cause:** When `prevStoryMoment` is present, it should be the authoritative source. If `prevStoryMoment.format === 'letter'`, the character did a letter in the previous cycle — there is no previous vignette to pull. The fallback to legacy fields should only activate when `prevStoryMoment` is entirely absent (pre-consolidation DT1 data).

---

## Files

**Single file, two focused changes:**

- `public/js/admin/downtime-story.js`

No schema, no API, no CSS.

---

## Acceptance Criteria

- [ ] `buildTouchstoneContext` includes the player's DT submission text under a "Player's vignette:" label. When `personal_story_text` (and all fallbacks) are null, it prints `[No player vignette submitted]` — never an empty field.
- [ ] `buildLetterContext` already prints `[No player letter submitted]` when the player has not submitted — verify this is intact and not regressed.
- [ ] The previous-cycle vignette field in the Touchstone Vignette prompt is never populated with letter-format content.
- [ ] When the previous cycle has `story_moment.format === 'letter'`, the vignette prompt omits the "previous vignette" section entirely (no fallback to `st_narrative.touchstone.response`).
- [ ] When the previous cycle has `story_moment.format === 'vignette'`, the vignette prompt includes the correct `story_moment.response` as the previous vignette.
- [ ] When the previous cycle has no `story_moment` (legacy DT1 data), existing fallback behaviour is preserved: `prevLegacyLetter` → letter slot, `prevLegacyVignette` → vignette slot.
- [ ] `_storyMomentNameCheck` validation is unchanged — name-matching still wraps both paths.
- [ ] The Copy Context button for a letter-format story moment is unaffected (no regression).
- [ ] The Copy Context buttons for all other sections (projects, territories, patrol, etc.) are unaffected.

---

## Implementation

### Change 1 — `buildTouchstoneContext`: add player submission section

**Location:** `buildTouchstoneContext` function, starting at line ~1500.

Add player vignette extraction using the **same field priority chain** as `buildLetterContext`. Both use `personal_story_text` as the primary key (comment at line ~1573 explains why: dt-form.18 collapsed the personal-story narrative to this field):

```js
const playerVignette =
  sub.responses?.personal_story_text ||
  sub.responses?.correspondence ||
  sub.responses?.letter_to_home ||
  sub.responses?.letter ||
  sub.responses?.narrative_letter ||
  sub.responses?.personal_message ||
  null;
```

Then, after the Aspirations line and before the `prevVignette` block:

```js
lines.push('');
lines.push('Player\'s vignette:');
lines.push(playerVignette ? playerVignette.trim() : '[No player vignette submitted]');
```

Place it in the same position as "Player-submitted letter" in `buildLetterContext` (after aspirations, before previous-cycle content).

### Change 2 — `handleCopyStoryMomentContext`: authoritative previous-cycle source gate

**Location:** Lines ~3494-3500 in `handleCopyStoryMomentContext`.

Replace the current fallback logic:

```js
// BEFORE (buggy):
const prevLetterText = (prevStoryMoment?.format === 'letter' && prevStoryMoment.response)
  ? prevStoryMoment.response
  : prevLegacyLetter;

const prevVignetteText = (prevStoryMoment?.format === 'vignette' && prevStoryMoment.response)
  ? prevStoryMoment.response
  : prevLegacyVignette;
```

```js
// AFTER (fixed):
// If prevStoryMoment exists, it is authoritative. Use format-gated value; null if wrong format.
// Only fall back to legacy fields when prevStoryMoment is entirely absent (pre-DT2 data).
const prevLetterText = prevStoryMoment
  ? (prevStoryMoment.format === 'letter' && prevStoryMoment.response ? prevStoryMoment.response : null)
  : prevLegacyLetter;

const prevVignetteText = prevStoryMoment
  ? (prevStoryMoment.format === 'vignette' && prevStoryMoment.response ? prevStoryMoment.response : null)
  : prevLegacyVignette;
```

The `_storyMomentNameCheck` calls on lines ~3503-3504 and the downstream branching are unchanged.

---

## Dev Notes

### Field naming context

`personal_story_text` is the canonical player narrative field post-dt-form.18 (issue #208). The legacy chain (`correspondence`, `letter_to_home`, etc.) exists for pre-redesign submissions that predate the field rename. Use the full chain in both builders; do not shorten it.

### Why the legacy fallback must be gated by `prevStoryMoment === null`

DT2 submissions used the new `story_moment` field. Some characters also have residual content in `st_narrative.touchstone.response` from DT1 or from the old code path that predates the format consolidation. If a DT2 submission is a letter (`story_moment.format = 'letter'`), `st_narrative.touchstone.response` should be ignored entirely for the previous-cycle vignette slot — the character had no vignette that cycle. The old code's fallthrough caused that legacy residual to appear as "previous vignette".

### `renderStoryMoment` already shows the player submission correctly in the UI

The context block at line ~1634-1641 reads `playerLetter` from `personal_story_text` and renders it under "Player's letter:". The bug is exclusively in the **Copy Context prompt** (`buildTouchstoneContext`), not in the rendered panel. The UI display is correct; only the clipboard text is broken.

### Issue #341 is a related but separate bug

Issue #341 (`story_moment_format` radio ignoring `personal_story_kind`) means the radio may default to 'letter' even when the player submitted a vignette. That story is tracked separately. This story (fix.50) fixes the prompt content bugs regardless of which radio the ST has selected.

### Operational note (not code)

Any DT3 prompts already generated and copied this cycle that were affected by these bugs will need to be re-copied after the fix is deployed. The ST should check:
- Any character whose DT3 Copy Context was used but whose player submitted a vignette scene.
- Any character whose "previous vignette" field looked like a signed letter.

These are manual re-copy actions. No code change is required for this.

---

## Testing

Manual test cases (no automated test framework):

1. **Bug 1 — player vignette present:**
   - Open a DT3 submission where the player submitted a vignette scene (`personal_story_text` is non-empty, `personal_story_kind = 'touchstone'`).
   - Select the "Touchstone Vignette" radio on the Story Moment card.
   - Click "Copy Context" and paste into a text editor.
   - Verify "Player's vignette:" section appears with the player's text verbatim.

2. **Bug 1 — no player vignette:**
   - Find or create a submission where `personal_story_text` is null.
   - Same steps. Verify "Player's vignette: [No player vignette submitted]" appears.

3. **Bug 1 — letter path not regressed:**
   - Select "Letter from Home" radio on a submission with player text.
   - Copy Context. Verify "Player-submitted letter:" still appears correctly.

4. **Bug 2 — previous cycle was letter, vignette field now empty:**
   - Open a DT3 character whose DT2 story moment was a letter.
   - Select "Touchstone Vignette" radio. Copy Context.
   - Verify "Previous vignette with this touchstone (Downtime 2):" does **not** appear (or the vignette section is absent entirely).
   - Verify no signed-off letter content appears in the prompt.

5. **Bug 2 — previous cycle was vignette, loads correctly:**
   - Open a DT3 character whose DT2 story moment was a vignette.
   - Copy Context (vignette mode). Verify "Previous vignette with this touchstone (Downtime 2):" appears with the correct vignette text.

6. **Regression — Copy Context for project/territory/feeding sections:**
   - Spot-check Copy Context on a project action and a territory section.
   - Verify content is unaffected.
