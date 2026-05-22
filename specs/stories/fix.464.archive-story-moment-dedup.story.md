---
issue: 464
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/464
branch: ms/issue-464-archive-story-moment-duplicate
status: review
date: 2026-05-22
---

# fix.464 — Archive tab: Story Moment deduplication guard

## Story

As a player viewing the Archive tab,
I want the Story Moment section to appear exactly once per downtime report,
so that I am not confused by duplicated narrative content.

## Background

`renderOutcomeWithCards` (story-tab.js) has two independent render paths that both produce a
"Story Moment" block:

1. **Dedicated renderer** — `renderStoryMoment(sub)` at line 438, reading from
   `st_narrative.story_moment.response` (the consolidated field written by the admin tool from
   DT3 onwards).
2. **Section loop** — `parseOutcomeSections(sub.published_outcome)` at line 380 parses the raw
   `published_outcome` text; when the push text contains a `## Story Moment` heading (which it
   does for DT3), the loop at lines 440-486 renders that heading as a second Story Moment block.

DT1-2 escaped the bug because `story_moment` was never set — `renderStoryMoment` returned `''`,
so only the sections loop path fired. DT3 introduced the structured `story_moment` field, and now
both paths fire simultaneously, producing an identical duplicate.

The same latent issue exists for `renderHomeReportSection` / `## Home Report`.

## Acceptance Criteria

- [ ] AC1: A DT3 submission with `st_narrative.story_moment.response` set shows exactly **one**
  Story Moment block in `renderOutcomeWithCards` output.
- [ ] AC2: A legacy submission with **only** `published_outcome` text (no `st_narrative.story_moment`,
  no `personal_story`, no `letter_from_home`, no `touchstone`) still shows Story Moment from the
  parsed `## Story Moment` heading in `published_outcome`.
- [ ] AC3: Home Report does not duplicate under the same conditions — same guard applies.
- [ ] AC4: Legacy `letter_from_home`-only and `touchstone`-only submissions render their Story Moment
  section unchanged (single block, no regression).

---

## Dev Notes

### File to modify — ONE file, no others

**`public/js/tabs/story-tab.js`** — function `renderOutcomeWithCards` (line ~378).

Do **not** touch: `_storyNarrSection`, `renderStoryMoment`, `renderHomeReportSection`,
`_flagSectionKeyForHeading`, `parseOutcomeSections`, or any other helper. The fix is
entirely local to the control flow inside `renderOutcomeWithCards`.

### Exact fix — minimal change

**Before the section loop**, compute the dedicated section HTML first and track which
section keys were rendered:

```js
// ── Sections 1-2: Story Moment + Home Report (above main narrative) ──
let h = '<div class="story-narrative">';
const smHtml = renderStoryMoment(sub, { editable });
const hrHtml = renderHomeReportSection(sub, { editable });
h += smHtml;
h += hrHtml;
// Skip published_outcome headings already handled by dedicated renderers.
const _renderedKeys = new Set();
if (smHtml) _renderedKeys.add('story_moment');
if (hrHtml) _renderedKeys.add('home_report');

for (const sec of sections) {
  if (sec.heading) {
    const secKey = _flagSectionKeyForHeading(sec.heading);
    if (secKey && _renderedKeys.has(secKey)) continue;   // ← guard
    // ... rest of loop unchanged ...
  }
}
```

**The loop body is unchanged.** Only the `continue` guard line is added.

### Why `_flagSectionKeyForHeading` is the right hook

`_flagSectionKeyForHeading` already maps:
- `'story moment'` → `'story_moment'`
- `'home report'` → `'home_report'`

Using it is idiomatic — it's already the canonical heading → key resolver in this file
(used for flag affordances at line 462). No new string comparison needed.

### Why `renderStoryMoment` returns `''` on legacy-only submissions

```js
function renderStoryMoment(sub, opts = {}) {
  const smText = sub.st_narrative?.story_moment?.response;
  if (smText) return _storyNarrSection(...);          // early return for DT3+

  const psText = sub.st_narrative?.personal_story?.response;
  if (psText) return _storyNarrSection(...);           // early return

  const letter    = sub.st_narrative?.letter_from_home?.response;
  const touchstone = sub.st_narrative?.touchstone?.response;
  if (!letter && !touchstone) return '';              // ← returns '' here
  // ... legacy dual-block path for DT1-2
}
```

A submission with **only** a `## Story Moment` heading in `published_outcome` (and no structured
`st_narrative` fields) will return `''` → `_renderedKeys` will NOT have `'story_moment'` → the
loop will render the heading as normal. AC2 is satisfied by this logic automatically.

### What NOT to do

- Do NOT modify `renderStoryMoment` or `renderHomeReportSection` — they are correct.
- Do NOT call `renderStoryMoment` twice.
- Do NOT try to strip headings from `published_outcome` — historical data exists; this would be
  destructive and wrong.
- Do NOT add a `compiled_sections_already_rendered` flag or similar module-level state. The
  `_renderedKeys` Set is local to `renderOutcomeWithCards` and is all that's needed.

### Key line numbers (as of branch base — verify before editing)

| Line | What |
|------|------|
| 378  | `export function renderOutcomeWithCards(sub, opts = {})` |
| 380  | `const sections = parseOutcomeSections(sub.published_outcome)` |
| 436  | `// ── Sections 1-2: Story Moment + Home Report` comment |
| 437  | `let h = '<div class="story-narrative">'` |
| 438  | `h += renderStoryMoment(sub, { editable })` |
| 439  | `h += renderHomeReportSection(sub, { editable })` |
| 440  | `for (const sec of sections) {` |
| 462  | `const headingKey = _flagSectionKeyForHeading(sec.heading)` |

---

## Tasks / Subtasks

- [x] T1: Add `_renderedKeys` Set and `continue` guard to `renderOutcomeWithCards` in `story-tab.js`
  - [x] Capture `renderStoryMoment` return value before appending; add to `_renderedKeys` if non-empty
  - [x] Capture `renderHomeReportSection` return value before appending; add to `_renderedKeys` if non-empty
  - [x] Add `if (secKey && _renderedKeys.has(secKey)) continue;` at top of the section loop's `if (sec.heading)` block
  - [x] Parse-check: `node --check --input-type=module < public/js/tabs/story-tab.js`
- [x] T2: Write Playwright tests for the four ACs (file: `tests/fix-464-archive-story-moment-dedup.spec.js`)
  - [x] AC1: structured `story_moment` + published_outcome with `## Story Moment` → exactly one `.story-section-head` containing "Story Moment"
  - [x] AC2: no structured fields + published_outcome with `## Story Moment` → exactly one `.story-section-head` containing "Story Moment"
  - [x] AC3: structured `home_report` + published_outcome with `## Home Report` → exactly one `.story-section-head` containing "Home Report"
  - [x] AC4: legacy `letter_from_home`-only submission → exactly one Story Moment block
- [x] T3: Run tests and confirm all pass

---

## Testing Approach

Tests import `renderOutcomeWithCards` directly from `story-tab.js` via Playwright's
`page.evaluate` + `page.addScriptTag`, OR use the `page.goto` + fixture interception pattern
used throughout this test suite.

The simplest approach is **pure unit style** within Playwright — create a minimal HTML page,
inject the module, call `renderOutcomeWithCards` with stub data, and count `.story-section-head`
elements. See `tests/issue-321-dt-story-cycle-resolver.spec.js` for the API-stub pattern used
in this repo.

Stub shapes needed for each AC:

```js
// AC1 — structured story_moment + published_outcome heading
const sub_ac1 = {
  _id: 'sub-ac1', character_id: 'char-1', cycle_id: 'cycle-1',
  published_outcome: '## Story Moment\n\nThe letter content from push text.',
  st_narrative: { story_moment: { response: 'The structured story moment.', status: 'complete' } },
  responses: {},
};
// Expected: exactly 1 h4 with text "Story Moment"

// AC2 — no structured fields, only published_outcome
const sub_ac2 = {
  _id: 'sub-ac2', character_id: 'char-1', cycle_id: 'cycle-1',
  published_outcome: '## Story Moment\n\nContent from push text only.',
  st_narrative: {},
  responses: {},
};
// Expected: exactly 1 h4 with text "Story Moment"

// AC3 — home report dedup
const sub_ac3 = {
  _id: 'sub-ac3', character_id: 'char-1', cycle_id: 'cycle-1',
  published_outcome: '## Home Report\n\nThe home report in push text.',
  st_narrative: { home_report: { response: 'The structured home report.', status: 'complete' } },
  responses: {},
};
// Expected: exactly 1 h4 with text "Home Report"

// AC4 — legacy letter_from_home only
const sub_ac4 = {
  _id: 'sub-ac4', character_id: 'char-1', cycle_id: 'cycle-1',
  published_outcome: null,
  st_narrative: { letter_from_home: { response: 'Legacy letter content.', status: 'complete' } },
  responses: {},
};
// Expected: exactly 1 h4 with text "Story Moment" (from legacy path)
```

---

## File List

- `public/js/tabs/story-tab.js` — UPDATE
- `tests/fix-464-archive-story-moment-dedup.spec.js` — CREATE

---

## Dev Agent Record

### Completion Notes

T1: In `renderOutcomeWithCards` (story-tab.js), replaced the two inline `h +=` calls for dedicated
section renderers with captured variables (`smHtml`, `hrHtml`). Built a `_renderedKeys` Set from
whichever ones returned non-empty string. Added `if (secKey && _renderedKeys.has(secKey)) continue`
at the top of the `if (sec.heading)` block in the published_outcome sections loop. This prevents
the same section appearing twice when structured `st_narrative` data and a matching `## Heading`
both exist in `published_outcome`. The existing `_flagSectionKeyForHeading` function was the
correct hook — it already maps `'story moment'` → `'story_moment'` and `'home report'` →
`'home_report'`.

T2: 5 Playwright tests via the game app Archive tab. AC4 required `published_outcome` to be a
truthy string (archive-tab.js:65 filters out submissions without it); a non-heading body string
was used so the legacy `letter_from_home` path still fires without competition.

All 5 tests pass. Parse check clean.

### Change Log

- fix(#464): renderOutcomeWithCards — dedup guard for dedicated section renderers (2026-05-22)
- test(#464): 5 Playwright tests via Archive tab (AC1-AC4 + content integrity) (2026-05-22)
