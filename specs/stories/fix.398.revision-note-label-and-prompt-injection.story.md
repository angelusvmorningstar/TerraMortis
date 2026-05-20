# Story fix.398: Revision note label fix and prompt generator injection

**Story ID:** fix.398
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-19
**Issue:** [#398](https://github.com/angelusvmorningstar/TerraMortis/issues/398)
**Branch:** ms/issue-398-dt-story-revision-note-label-prompt

---

## User Story

As an ST using the DT Story tab, I want revision note textareas to be clearly labelled as Story-side notes (not player-facing), and I want the prompt generator to include the revision note when one is present — so the AI understands what changed and what to improve.

---

## Background

### Two issues in one story

**Issue 1 — Misleading placeholder text**

Several revision textareas have placeholder `"Revision note for player…"`. The `revision_note` field is stored in `st_narrative` (admin-only) and is confirmed absent from all player-facing JS (`story-tab.js`, no player routes expose it). The "for player" wording implies delivery to the player, which is incorrect and not intended.

Feeding Narrative and Home Report already use `"Revision note…"` (correct). Projects, Merits, Territories, and Cacophony Savvy use the incorrect `"Revision note for player…"`.

**Issue 2 — Prompt generators ignore the revision note**

When an ST marks a section `needs_revision`, they write a revision note explaining what needs to change. When they then click the prompt generator (Copy Context) to regenerate the narrative, the revision note is not included in the prompt. The AI has no knowledge that this is a revision, what was wrong with the prior draft, or what the ST wants changed.

### How context builders are called

Each section's "Copy Context" button calls a context builder function and copies the result to clipboard:

| Section | Builder | Revision note source |
|---|---|---|
| Projects | `buildProjectContext(char, sub, idx, ...)` | `sub.st_narrative.project_responses[idx].revision_note` |
| Merits/Actions | `buildActionContext(char, sub, idx)` | `sub.st_narrative.action_responses[idx].revision_note` |
| Territories | `buildTerritoryContext(char, sub, terrId, ...)` | `sub.st_narrative.territory_reports[idx].revision_note` |
| Home Report | `buildHomeReportContext(char, sub, ...)` | `sub.st_narrative.home_report.revision_note` |
| Cacophony Savvy | `buildCacophonySavvyContext(char, action, slotIdx, csDots)` | `sub.st_narrative.cacophony_savvy[slotIdx].revision_note` |
| Story Moment | `buildLetterContext` / `buildTouchstoneContext` | `sub.st_narrative.story_moment.revision_note` |
| Feeding | feeding narrative context (inline in render function) | `sub.st_narrative.feeding_narrative.revision_note` |

The builders already read `sub` or `sub.st_narrative` for other fields. The revision note just needs to be read and injected before the rubric line.

### Pattern from `buildProjectContext`

`buildProjectContext` (line 640) already reads an `existingDraft`:

```js
const existingDraft = sub.st_narrative?.project_responses?.[idx]?.response || '';
```

And injects it before the ST directives:

```js
if (existingDraft) {
  lines.push('');
  lines.push('Existing draft (revise unless told to rewrite):');
  lines.push(existingDraft);
}
```

The revision note should follow a similar pattern — injected right after the existing draft block (if any), before the rubric.

### Where the context builder is called from (for prompt generator)

- Projects: line ~1587 (also ~3908 for maintenance/patrol variants)
- Territories: line ~4037
- Merits/Actions: line ~2401 (called from render handlers)
- Home Report: line ~2997 (exported; called from story-tab.js)
- Cacophony Savvy: line ~4209
- Story Moment / Letter: lines ~1658, 1733

---

## Acceptance Criteria

- [x] All revision textarea placeholders in Projects, Merits, Territories, Cacophony Savvy, Story Moment, Feeding Narrative, and Home Report read `"Revision note for Story"`. No instance of `"for player"` anywhere.
- [x] When a project card has a non-empty `revision_note` and the ST clicks Copy Context, the generated prompt includes a `"Revision note: …"` line.
- [x] Same for: territory cards, merit/action cards, home report, cacophony savvy slots, story moment, feeding narrative.
- [x] Sections with no revision note produce identical prompt output to today (no empty `"Revision note: "` line emitted).
- [x] `revision_note` is confirmed not present in any player-facing delivery path — no regression.

---

## Implementation

### File: `public/js/admin/downtime-story.js`

#### Part 1 — Placeholder text (7 instances)

Replace every `"Revision note for player…"` / `"Revision note for player…"` with `"Revision note for Story…"`. Also standardise the two existing `"Revision note…"` instances to `"Revision note for Story…"` for consistency.

Lines to update (approximate — verify by search):

| Line | Section | Current | New |
|---|---|---|---|
| ~1511 | Feeding narrative | `Revision note…` | `Revision note for Story…` |
| ~1641 | Projects | `Revision note for player…` | `Revision note for Story…` |
| ~1931 | Story Moment | `Revision note for player…` | `Revision note for Story…` |
| ~2637 | Merits | `Revision note for player…` | `Revision note for Story…` |
| ~3068 | Home Report | `Revision note…` | `Revision note for Story…` |
| ~3203 | Territories | `Revision note for player…` | `Revision note for Story…` |
| ~3358 | Cacophony Savvy | `Revision note for player…` | `Revision note for Story…` |

Use `replace_all: true` on the Edit tool — all instances should become `"Revision note for Story…"`.

#### Part 2 — Prompt injection

Inject the revision note into each context builder. The injection pattern is:

```js
if (revisionNote) {
  lines.push('');
  lines.push(`Revision note: ${revisionNote}`);
}
```

Place this **after** the existing draft block (if the builder has one) and **before** the final rubric/style line.

**`buildProjectContext`** (line ~780, after the `existingDraft` block):

```js
// After existingDraft block:
const revisionNote = sub.st_narrative?.project_responses?.[idx]?.revision_note || '';
if (revisionNote) {
  lines.push('');
  lines.push(`Revision note: ${revisionNote}`);
}
```

**`buildActionContext`** (line ~2513, before the final rubric line):

```js
const revisionNote = sub.st_narrative?.action_responses?.[idx]?.revision_note || '';
if (revisionNote) {
  lines.push('');
  lines.push(`Revision note: ${revisionNote}`);
}
```

**`buildTerritoryContext`** (line ~2910, before `Apply AMBIENCE_SIGNATURE` rubric):

```js
// Need idx passed in OR looked up from st_narrative.territory_reports array.
// buildTerritoryContext currently receives terrId, not idx. The territory_reports
// array is keyed positionally; find by territory_id field:
const terrReports = sub.st_narrative?.territory_reports || [];
const terrReport  = terrReports.find(r => r?.territory_id === terrId) || {};
const revisionNote = terrReport.revision_note || '';
if (revisionNote) {
  lines.push('');
  lines.push(`Revision note: ${revisionNote}`);
}
```

**`buildHomeReportContext`** (line ~3018, before style line):

```js
const revisionNote = sub.st_narrative?.home_report?.revision_note || '';
if (revisionNote) {
  ctx += `\nRevision note: ${revisionNote}\n`;
}
```

Note: `buildHomeReportContext` builds `ctx` as a string (not `lines` array). Append before the `Style:` line.

**`buildCacophonySavvyContext`** (line ~3281, before `return lines.join('\n')`):

```js
// slotIdx is already a parameter — use it to read the revision note from sub.
// Note: sub is not currently a parameter of buildCacophonySavvyContext.
// The caller (line ~4209) has access to sub. Pass it in as a new optional parameter.
```

`buildCacophonySavvyContext` currently has signature `(char, noisyAction, slotIdx, csDots)`. Add `sub` as a 5th optional parameter:

```js
function buildCacophonySavvyContext(char, noisyAction, slotIdx, csDots, sub) {
  // ... existing code ...
  const revisionNote = sub?.st_narrative?.cacophony_savvy?.[slotIdx]?.revision_note || '';
  if (revisionNote) {
    lines.push('');
    lines.push(`Revision note: ${revisionNote}`);
  }
  return lines.join('\n');
}
```

Update the call site at line ~4209 to pass `sub`:

```js
// Before:
copyToClipboard(buildCacophonySavvyContext(char, action, slotIdx, csDots), btn);
// After:
copyToClipboard(buildCacophonySavvyContext(char, action, slotIdx, csDots, _currentSub), btn);
```

**Story Moment** — `buildLetterContext` and `buildTouchstoneContext` (lines ~1658, ~1733):

Both builders use `opts` for context. Read the revision note from `sub.st_narrative.story_moment.revision_note` (passed via `sub` which is available in the render scope):

```js
// In buildLetterContext and buildTouchstoneContext, before the final rubric line:
const revisionNote = sub?.st_narrative?.story_moment?.revision_note || '';
if (revisionNote) {
  lines.push('');
  lines.push(`Revision note: ${revisionNote}`);
}
```

Both functions already receive `sub` as a parameter. Check the signatures at lines 1658 and 1733 to confirm.

**Feeding narrative** — the feeding context is built inline (not a named builder function). Find where the feeding prompt is assembled and inject before the rubric.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | 7 placeholder text updates; revision note injection in 7 context builders; `buildCacophonySavvyContext` signature + call site update. |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- `replace_all: true` on the placeholder edit is safe — all occurrences of `"Revision note for player…"` should become `"Revision note for Story…"`. Do a final grep after to confirm no stragglers.
- The injection must be conditional on `revisionNote` being truthy. Never emit an empty `"Revision note: "` line — that would pollute prompts for sections that have never been marked for revision.
- `buildTerritoryContext` does not currently receive an index — find the territory report by `territory_id` field in the array, not by position. Verify the shape of `territory_reports` entries: `{ territory_id, response, author, status, revision_note }` (set at line ~4062).
- `buildHomeReportContext` uses string concatenation (`ctx +=`) rather than a `lines` array. Match that pattern for the injection.
- `buildCacophonySavvyContext` is a pure function with no access to `sub`. Adding `sub` as a 5th optional parameter is the cleanest path; the caller at line ~4209 holds `_currentSub`.
- Verify no player-facing file reads `revision_note` after this change — it's ST-only data and must stay that way.
