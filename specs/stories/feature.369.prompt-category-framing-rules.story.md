# Story feature.369: DT Story — add category-specific framing rules to context prompts

**Story ID:** feature.369
**Epic:** DT Story tab improvements
**Status:** done
**Date:** 2026-05-18
**Issue:** [#369](https://github.com/angelusvmorningstar/TerraMortis/issues/369)
**Branch:** ms/issue-369-prompt-category-framing-rules

---

## User Story

As an ST using the DT Story tab, I want the generated prompts to include category-specific framing rules that the AI must respect — so that vignettes don't invent in-person encounters when the player was absent, ambience prompts ground the narrative in territorial politics, and Cacophony prompts stay within the covenant knowledge hierarchy.

---

## Background

### Three framing failures observed in DT3 processing

**1. Vignette scenes invented in-person attendance**

Some touchstone vignettes written by the AI depicted the character physically present at a scene (watching the touchstone interact with other people, overhearing conversations). This is only valid when the character attended game in person. Characters who submitted downtime without attending game should appear in vignettes through remote means only (phone call, message, memory, dream).

The character's in-person attendance is knowable from the downtime submission: `sub.responses?.attended_game === 'yes'` (or equivalent field from the DT form). The prompt should flag when the character was not physically present so the AI avoids inventing in-person scenes.

**2. Ambience prompts lacked territorial framing**

Ambience Increase/Decrease responses from DT3 read as generic action outcomes ("Marcus succeeded in his efforts"), without grounding the narrative in the covenant-specific politics of territory control. An ambience action represents a covenant investing in or destabilising a feeding ground. The prompt should remind the AI that ambience changes have political weight within the city's power structure.

**3. Cacophony Savvy prompts omitted covenant/bloodline filter**

Cacophony Savvy vignettes are heard through the Kindred rumour network. What a Cacophony dot picks up is filtered by the character's covenant affiliations — Invictus characters hear rumours through priestal channels; Crone characters hear through rite-whispers; unaffiliated characters hear street-level buzz. The current prompt contains no covenant framing at all, producing generic "heard through the grapevine" descriptions that ignore the Kindred social structure.

---

## Acceptance Criteria

- [x] `buildTouchstoneContext` includes an attendance-gate line: if `sub.responses?.attended_game` is falsy or `'no'`, the prompt includes `Attendance: Character was not physically present at game this cycle. Vignette must not depict in-person encounters.`; if the character attended, the prompt includes `Attendance: Character was present at game this cycle.`
- [x] The ambience branch in `buildProjectContext` (when `actionType === 'ambience_increase' || 'ambience_decrease'`) includes a framing line: `Framing: An ambience action represents covenant investment in or destabilisation of a feeding ground. Ground the narrative in territorial politics — name the covenant pressure where relevant.`
- [x] `buildCacophonySavvyContext` includes the character's covenant so the AI can calibrate the rumour channel: `Covenant filter: ${char.covenant || 'Unaligned'} — calibrate the rumour channel accordingly.`

---

## Implementation

### `public/js/admin/downtime-story.js`

#### 1. `buildTouchstoneContext` — attendance gate (line ~1492)

Add after the aspirations block, before the player-submitted narrative:

```js
// Attendance gate
const attendedGame = sub.responses?.attended_game;
const wasPresent   = attendedGame === 'yes' || attendedGame === true;
lines.push('');
if (wasPresent) {
  lines.push('Attendance: Character was present at game this cycle.');
} else {
  lines.push('Attendance: Character was not physically present at game this cycle. Vignette must not depict in-person encounters — use remote contact, memory, or received information only.');
}
```

#### 2. `buildProjectContext` — ambience territorial framing

In the section that builds action-type-specific content, after the `Action:` line, add the framing directive when the action is ambience:

```js
const isAmbience = actionType === 'ambience_increase' || actionType === 'ambience_decrease';

// After existing action detail lines (title, outcome, description, merits, cast):
if (isAmbience) {
  lines.push('');
  lines.push('Framing: An ambience action represents covenant investment in or destabilisation of a feeding ground. Ground the narrative in the territorial politics of the city — acknowledge the covenant pressure being applied or resisted where the fiction allows it.');
}
```

#### 3. `buildCacophonySavvyContext` — covenant filter (line ~2959)

Add after the character header block:

```js
// Before (lines 2963-2964):
lines.push(`Character: ${char ? displayName(char) : 'Unknown'}`);
lines.push(`Cacophony Savvy: ${csDots} dots (slot ${slotIdx + 1} of ${csDots})`);

// After:
lines.push(`Character: ${char ? displayName(char) : 'Unknown'}`);
lines.push(`Cacophony Savvy: ${csDots} dots (slot ${slotIdx + 1} of ${csDots})`);
lines.push(`Covenant filter: ${char?.covenant || 'Unaligned'} — calibrate the rumour channel and language to this covenant's social register.`);
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Add attendance gate to `buildTouchstoneContext`; add ambience framing to `buildProjectContext`; add covenant filter to `buildCacophonySavvyContext` |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- `sub.responses?.attended_game` is the DT form field. If this field is absent (older submissions), treat as not-present (the safe default for the fiction constraint). The ternary `wasPresent` check handles this.
- The `isAmbience` guard in `buildProjectContext` should check the resolved `actionType` (from `rev.action_type_override || rev.action_type`), not the raw form response — ST overrides take precedence. After the fix in #366, `actionType` is already derived early in the function; use that variable.
- `buildLetterContext` does not need the attendance gate because the letter format is explicitly correspondent-mediated — it is never an in-person scene by definition.

---

## Dev Agent Record

### Completion Notes

All three additions were already implemented in `downtime-story.js` from a prior session. Verified at:
- Attendance gate: lines 1829-1836 (buildTouchstoneContext) — wasPresent branch produces correct text for both states
- Ambience framing: lines 741-743 (buildProjectContext) — isAmbience guard with framing directive; implementation also covers `ambience_change` variant
- Covenant filter: line 3433 (buildCacophonySavvyContext) — exact text matches AC intent (implementation slightly more detailed)

No code changes needed. Story closed.

### Change Log

- 2026-06-07: Verified all ACs satisfied in downtime-story.js from prior session. No code changes. Story closed.
