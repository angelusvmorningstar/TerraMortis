# Story feature.99: Letter from Home and Touchstone Vignette Prompt Refactor

**Issue:** [#339](https://github.com/angelusvmorningstar/TerraMortis/issues/339)
**Branch:** `ms/issue-339-letter-touchstone-prompt-refactor`

## Status: review

## Story

**As an** ST drafting downtime story moments,
**I want** the Letter from Home and Touchstone Vignette prompts to enforce their structural distinction with explicit rules,
**so that** recurring miscalibrations (voice tied to Mask/Dirge, detachment read as physical distance, verbal tic repetition, hemisphere season errors, scene furniture recycling) do not require manual correction every cycle.

## Background

Three downtime cycles have surfaced a consistent set of prompt miscalibrations:

- **Mask/Dirge voice calibration**: The model reads Mask and Dirge in the assembled context and calibrates the correspondent's voice to them. This is wrong — Mask and Dirge describe the *character*, not the correspondent. Oksana Kovalenko (Anichka's sire) should write as herself, not as someone mirroring a Bon Vivant Mask.
- **Verbal tic repetition across cycles**: Alice's sister used "you did the thing again" in both DT2 and DT3 because the letter prompt has no instruction to check what phrasing has already been used.
- **Register drift**: Anichka's sire drifted from formal deliberate prose (established voice) to clipped modern phrasing because no voice-check rule exists.
- **Hemisphere season error**: Anichka's sire opened with a southern-hemisphere summer reference. The sire is in western Ukraine. The check simply didn't happen.
- **Detachment = physical distance**: The Carver/James DT2 vignette produced an observation-from-afar scene (Carver watching James from a pub corner) because "in-person contact only" was read as physical proximity. The rule should mean active interaction, not presence in the same room.
- **Scene furniture recycling**: Vignettes reuse the same NPC details (James's cold coffee, Tod's chair) because no "scenes used" check exists.
- **Previous vignette not injected**: `handleCopyStoryMomentContext` fetches the previous cycle's letter output and injects it for the Letter format. It does NOT do the same for the Vignette format — the "build on prior cycle" rule has no prior cycle output to build on.

The fix has two layers:
1. **Rules changes** in `st-working/reference/tm_rubrics.md` and `st-working/reference/tm_prompt_templates.md`
2. **One assembly-level code fix** in `public/js/admin/downtime-story.js` — `handleCopyStoryMomentContext` must fetch and pass previous-cycle vignette output to `buildTouchstoneContext`, the same way it already does for the letter format.

---

## Acceptance Criteria

### LETTER_CORRESPONDENT_RULES rubric

1. Mask/Dirge calibration explicitly prohibited: "The correspondent writes as themselves, in their own register, shaped by their relationship to the character and their own personality. Mask and Dirge describe the character, not the correspondent."
2. Voice-check rule added: "If the character has a correspondence reference document, read the voice section and used-beats list before drafting. The voice rules are authoritative. The used-beats list identifies phrasing and imagery that has already been used and must not be recycled directly."
3. Correspondent selection priority is explicit, in order: implied recipient of the submitted letter → established correspondent from previous cycles → attached touchstone → background NPC. Invented NPCs flagged `[ST: Invented NPC — confirm before sending]`.
4. Correspondent context rule added: "The correspondent has a life continuing between letters. Something should have happened on their side, even if small. The letter should not feel as though the correspondent exists only when the character writes."
5. Seasonal/location check rule added: "Check the correspondent's location and the in-fiction date before opening with any seasonal, weather, or time-of-year beat. A correspondent writing from Ukraine has a different season from a correspondent in Sydney."
6. Trajectory awareness rule added: "Where the correspondence reference identifies a trajectory across the chain, sit at the appropriate point on that arc. The reference flags this explicitly."
7. Signature register rule added: "If the character writes in a signature register (a recurring metaphor, vocabulary, or stylistic tic), the correspondent's reply sits inside the same register, even if the correspondent uses it differently."

### TOUCHSTONE_CALIBRATION rubric

8. "In-person physical contact only. No phone, no social media, no remote observation." replaced with: "The scene shows active interaction between the character and the mortal. The character is present in the mortal's life. Detached touchstones continue to interact normally; what has changed is on the character's side, not the mortal's. Physical distance or observation-from-afar is a deliberate narrative choice and should not be the default reading of 'detached'."
9. Scene staging pre-draft rule added: "Before writing, identify where the scene takes place, what the mortal is doing in it, and what the character is doing alongside or in response to the mortal. The emotional calibration is carried by what the character does in the scene, not by description of what the character feels."
10. Scene furniture continuity rule added: "If the touchstone has an NPC profile, read it before drafting. Draw from the established appearance, voice, and behavioural beats. Do not repeat scene furniture already used in previous cycles — the 'scenes used' list in the profile identifies what has been spent."
11. First referent reframed: "The first referent cannot be a pronoun" changed to "Open with the mortal's name or a concrete noun where possible; this anchors the scene. Strong preference, not absolute."
12. Emotional calibration guidance extended: "Emotional calibration is carried by what the character notices, what the character chooses to do or not do, and what is left unspoken. Do not state the emotional register; stage it."
13. NPC voice rule added: "If the touchstone has an NPC profile, follow the voice section. If the NPC speaks in the scene, the dialogue should sit inside the established voice register."

### Shared [HOUSE STYLE] block

14. A `HOUSE STYLE` block extracted in `tm_rubrics.md` (or a named section in `tm_prompt_templates.md`) containing the shared rules that currently appear separately in both prompts:
    - British English
    - No em dashes
    - No mechanical terminology in narrative prose (no discipline names, dot ratings, success counts)
    - No plot hooks, foreshadowing, or supernatural revelations
    - No editorialising; write the work, not its significance
    - 100–300 words
    - The character's correspondence reference or NPC profile must be read before drafting, if one exists
    - The character's submitted content for this cycle must be replied to specifically; do not write a generic check-in
    - The previous cycle's output for this character must be read; build on it, do not repeat its beats
15. Both templates in `tm_prompt_templates.md` reference this block rather than restating rules inline.

### Assembly fix — Vignette previous-cycle injection

16. `handleCopyStoryMomentContext` in `public/js/admin/downtime-story.js` fetches the previous cycle's story moment output when the selected format is `vignette`, using the same cycle-lookup pattern already used for the letter format.
17. `buildTouchstoneContext` accepts a `prevVignette` / `prevCycleNumber` option (similar to `buildLetterContext`) and appends a "Previous vignette with this touchstone (Downtime N):" block when the value is present.
18. The early-return path for `format === 'vignette'` in `handleCopyStoryMomentContext` is replaced with a shared cycle-fetch flow that resolves prior output then branches to the appropriate builder.

### Manual verification

19. Copy Context for a Letter: assembled prompt includes the correct fields and the letter rules do not mention Mask/Dirge as a calibration target.
20. Copy Context for a Vignette on a character with a DT2 story moment: the assembled prompt includes a "Previous vignette" block from DT2.
21. Copy Context for a Vignette on a character with no prior story moment: assembled prompt omits the previous-vignette block gracefully.

---

## Tasks / Subtasks

- [x] Task 1: Update `LETTER_CORRESPONDENT_RULES` in `st-working/reference/tm_rubrics.md`
  - [x] Remove any implicit Mask/Dirge calibration; add explicit "correspondent writes as themselves" rule (AC 1)
  - [x] Add voice-check / used-beats rule (AC 2)
  - [x] Make correspondent selection priority explicit with order (AC 3)
  - [x] Add correspondent-has-a-continuing-life rule (AC 4)
  - [x] Add seasonal/location check rule (AC 5)
  - [x] Add trajectory awareness rule (AC 6)
  - [x] Add signature register rule (AC 7)

- [x] Task 2: Update `TOUCHSTONE_CALIBRATION` in `st-working/reference/tm_rubrics.md`
  - [x] Replace "in-person physical contact only" with active-interaction + detached-internal-not-physical rule (AC 8)
  - [x] Add scene staging pre-draft rule (AC 9)
  - [x] Add scene furniture continuity rule (AC 10)
  - [x] Reframe first-referent as strong preference (AC 11)
  - [x] Add staging-not-statement emotional calibration guidance (AC 12)
  - [x] Add NPC voice rules for dialogue (AC 13)

- [x] Task 3: Extract shared [HOUSE STYLE] block (AC 14–15)
  - [x] Add `HOUSE_STYLE` block to `tm_rubrics.md` with the 9 shared rules
  - [x] Update Letter from Home template in `tm_prompt_templates.md` to reference it
  - [x] Update Touchstone Vignette template in `tm_prompt_templates.md` to reference it
  - [x] Update template body to include section-specific rules inline (or reference new rubric sections)

- [x] Task 4: Assembly fix in `public/js/admin/downtime-story.js`
  - [x] Add `prevVignette` / `prevCycleNumber` opts to `buildTouchstoneContext` (AC 17)
  - [x] When opts are present, append "Previous vignette with this touchstone (Downtime N):" block in `buildTouchstoneContext` output (AC 17)
  - [x] Remove early-return for `vignette` format in `handleCopyStoryMomentContext` (AC 16, 18)
  - [x] Refactor cycle-fetch logic into a shared flow that runs before branching to letter vs vignette builder (AC 16, 18)
  - [x] Pass resolved `prevVignette` / `prevCycleNumber` to `buildTouchstoneContext` (AC 18)
  - [x] Confirm letter path still works unchanged (prevCorrespondence still passes correctly)

---

## Dev Notes

### What is and is not changing in the JS

`buildLetterContext` and `buildTouchstoneContext` assemble the prompt context that gets copied to the clipboard. The rules themselves live in `tm_rubrics.md` — the JS output says "Apply LETTER_CORRESPONDENT_RULES" and "Apply TOUCHSTONE_CALIBRATION", which are loaded separately when the ST uses Claude.

The JS changes are **assembly only**:
- `buildTouchstoneContext` gains a new `opts` parameter (matching `buildLetterContext`'s pattern)
- The previous-vignette block is appended when `opts.prevVignette` is truthy
- `handleCopyStoryMomentContext` fetches prior cycle before branching — same cycle-lookup already present for the letter path

No change to save handlers, the `st_narrative` schema, or the rendered DT Story panel UI.

### Cycle-fetch refactor pattern

Current code:

```js
async function handleCopyStoryMomentContext(btn) {
  // ...
  if (format === 'vignette') {
    copyToClipboard(buildTouchstoneContext(char, _currentSub), btn);
    return;  // ← early return, no cycle fetch
  }

  // cycle fetch only for letter:
  let prevCorrespondence = null;
  let prevCycleNumber    = null;
  try { /* fetch prev cycle, find prev sub */ } catch { /* */ }

  // ...
  const text = buildLetterContext(char, _currentSub, {
    prevCorrespondence, prevCycleNumber, stVoiceNote, storyMomentTarget,
  });
  copyToClipboard(text, btn);
}
```

Target pattern (shared fetch, branch after):

```js
async function handleCopyStoryMomentContext(btn) {
  // ...

  // Fetch previous cycle data for both letter and vignette
  let prevOutput      = null;  // generic: covers both prevCorrespondence + prevVignette
  let prevCycleNumber = null;
  try { /* same cycle-lookup logic as before */ 
    // Extract previous story_moment response regardless of format
    prevOutput = prevSub?.st_narrative?.story_moment?.response
      || prevSub?.st_narrative?.letter_from_home?.response
      || prevSub?.st_narrative?.touchstone?.response
      || null;
    prevCycleNumber = prevCycle.game_number;
  } catch { /* leave nulls */ }

  const stVoiceNote = /* same as before */;

  if (format === 'vignette') {
    copyToClipboard(
      buildTouchstoneContext(char, _currentSub, {
        prevVignette: prevOutput,
        prevCycleNumber,
      }),
      btn
    );
    return;
  }

  // letter path:
  // NPCR.12 story-moment target resolution (unchanged)
  // ...
  const text = buildLetterContext(char, _currentSub, {
    prevCorrespondence: prevOutput,
    prevCycleNumber,
    stVoiceNote,
    storyMomentTarget,
  });
  copyToClipboard(text, btn);
}
```

### Key files

| File | Action | What changes |
|------|--------|-------------|
| `st-working/reference/tm_rubrics.md` | UPDATE | `LETTER_CORRESPONDENT_RULES` and `TOUCHSTONE_CALIBRATION` sections; new `HOUSE_STYLE` block |
| `st-working/reference/tm_prompt_templates.md` | UPDATE | Letter from Home and Touchstone Vignette templates; both reference `HOUSE_STYLE` |
| `public/js/admin/downtime-story.js` | UPDATE | `buildTouchstoneContext` (add opts); `handleCopyStoryMomentContext` (shared cycle fetch + vignette path) |

### What the "Mask/Dirge calibration" error actually is

The current JS context includes `_charIdentLine(char)` which produces `"Mask: Bon Vivant | Dirge: Martyr | Humanity: 6"`. This line is correct context — the model needs to know the character's Humanity for emotional calibration. The problem is there is no rule saying *don't use Mask/Dirge to calibrate the correspondent's voice*. The model infers that it should. Adding an explicit anti-calibration rule to `LETTER_CORRESPONDENT_RULES` closes this without removing the Mask/Dirge line from context (it remains useful for understanding the character).

### The TM_Downtime_Prompt_Reference.md vs tm_prompt_templates.md

There are two reference files:
- `st-working/reference/TM_Downtime_Prompt_Reference.md` — verbose, full inline rules, older format
- `st-working/reference/tm_prompt_templates.md` — compact, rubric-reference style ("Apply LETTER_CORRESPONDENT_RULES"), newer format

The JS code (`buildLetterContext`/`buildTouchstoneContext`) outputs text matching the **compact template format** from `tm_prompt_templates.md`. Update `tm_prompt_templates.md` as the live document. `TM_Downtime_Prompt_Reference.md` may be updated for consistency but is not the active format.

### Deferred: correspondence reference and NPC profile injection

The issue identifies three assembly-level improvements. This story addresses only the **previous-cycle output injection** (the vignette gap). The other two — injecting correspondence reference documents and NPC profiles — are deferred because:

1. Correspondence references live in `st-working/downtime/dt*/` as `.docx` files, not in MongoDB. Injection requires either a new schema field or ST manual paste. Schema change is out of scope here.
2. NPC profiles: the NPC schema has `is_correspondent` but no dedicated `profile_text` field for prose injection. Adding this is a separate story.

Both can be filed as follow-on issues if confirmed as valuable.

---

## File List

- `st-working/reference/tm_rubrics.md` — added `HOUSE_STYLE` block; rewrote `LETTER_CORRESPONDENT_RULES`; rewrote `TOUCHSTONE_CALIBRATION`
- `st-working/reference/tm_prompt_templates.md` — updated Letter from Home and Touchstone Vignette templates to reference `HOUSE_STYLE`
- `public/js/admin/downtime-story.js` — `buildTouchstoneContext`: added `opts` param, `prevVignette` block; `handleCopyStoryMomentContext`: shared cycle-fetch before branch; `buildLetterContext`: rubric reference updated
- `specs/stories/feature.99.letter-touchstone-prompt-refactor.story.md` — this file

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-17 | 1.0 | Initial draft from issue #339 | bmad-create-story |
| 2026-05-17 | 1.1 | Implementation complete — all tasks done | bmad-dev-story |
