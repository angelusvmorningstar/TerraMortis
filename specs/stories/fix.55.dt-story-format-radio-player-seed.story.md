---
issue: 341
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/341
branch: ms/issue-341-dt-story-format-radio-fix
status: review
---

# Fix 55: DT Story — Seed format radio from player's submission

## Story

**As an ST** processing a downtime submission, **I want** the Story Moment format radio to initialise to match the player's chosen format (letter or vignette) when I open their DT Story panel for the first time, **so that** I do not have to manually switch the radio before copying the prompt context.

## Acceptance Criteria

- [x] **AC1** — When a submission has `responses.personal_story_kind === 'touchstone'` and no saved ST narrative exists, the Story Moment section opens with "Touchstone Vignette" selected.
- [x] **AC2** — When a submission has `responses.personal_story_kind === 'correspondence'` (or the field is absent) and no saved ST narrative exists, the Story Moment section opens with "Letter from Home" selected.
- [x] **AC3** — When a saved ST narrative already exists (any of `story_moment`, `letter_from_home.response`, or `touchstone.response`), the radio reflects the saved narrative's format, unchanged.
- [x] **AC4** — No change to the existing save/copy/clipboard behaviour.

## Tasks

- [x] **T1** — In `renderStoryMoment` (`public/js/admin/downtime-story.js`), after the three-way `if/else if/else if` priority chain (line 1550), insert a fallback that seeds `initialFormat` from `sub.responses.personal_story_kind` when all three priority paths were skipped.

## Dev Notes

### Exact insertion point

File: `public/js/admin/downtime-story.js`

The priority chain occupies lines 1533–1550 and ends with the closing `}` at line 1550. The very next executable line is:

```js
const complete = initialStatus === 'complete';   // line 1552
```

Insert **between line 1550 and 1552**:

```js
  // Seed from player's format preference when no ST narrative exists yet
  if (!sm && !legacyLetter?.response && !legacyTouchstone?.response) {
    initialFormat = sub.responses?.personal_story_kind === 'touchstone' ? 'vignette' : 'letter';
  }
```

### Why this works

`sub.responses.personal_story_kind` is written by `public/js/tabs/downtime-form.js` line 510 when the player saves their form. Values: `'correspondence'` (Letter from Home) or `'touchstone'` (Touchstone Vignette). The DT Story panel maps `'vignette'` ↔ `'touchstone'` internally; `'correspondence'` maps to `'letter'`.

The three-level priority chain already handles every case where saved ST data exists. This fallback only fires when all three are absent, i.e. a fresh submission the ST has not yet touched.

### No other changes required

`buildLetterContext` / `buildTouchstoneContext` and `handleCopyStoryMomentContext` are unaffected — they read `initialFormat` through the rendered radio at call time. The fix is a single guarded assignment.

## Dev Agent Record

### File List

- `public/js/admin/downtime-story.js`

### Change Log

- 2026-05-17: T1 complete. Added 3-line guard in `renderStoryMoment` after the priority chain. Seeds `initialFormat` from `sub.responses.personal_story_kind` when no saved ST narrative exists. All 4 ACs satisfied.
