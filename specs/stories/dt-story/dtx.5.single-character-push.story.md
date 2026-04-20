# Story DTX.5: Single-Character Downtime Push

Status: complete

## Story

As an ST reviewing downtime narrative in the DT Story panel,
I want to push one character's completed narrative to the player immediately,
so that I can test delivery live and correct individual responses after a bulk push without re-running the full cycle wizard.

## Acceptance Criteria

1. Each character row in the DT Story character list shows a "Push" button (or icon button) when that character's narrative is not yet published.
2. Clicking Push compiles all applicable `st_narrative` sections with a non-empty response into a single markdown string (same `## Section\n\nText` format used by the cycle wizard) and writes it to `st_review.outcome_text`, then sets `st_review.outcome_visibility = 'published'`.
3. Once pushed, the character row shows a "Published" badge in place of the Push button. The badge persists across re-renders of the character list.
4. Re-pushing an already-published character overwrites `st_review.outcome_text` cleanly (idempotent) — the badge stays visible after the second push.
5. After a successful push the player immediately sees the Chronicle update in their story-tab (reads `published_outcome`) and the Feeding narrative section in their feeding-tab (extracts `## Feeding` block from `published_outcome`).
6. `feeding_roll.params` is NOT modified by the push — the pool is already set during processing.
7. If the PUT call fails, a visible error message appears in the character row; the character is not marked as published.
8. The Push button is only shown to STs (role check consistent with rest of DT Story panel).

## Tasks / Subtasks

- [x] Task 1: Add `compilePushOutcome(sub)` helper — iterates `getApplicableSections(char, sub)`, concatenates `## {label}\n\n{response}\n\n` for each section that has a non-empty response in `st_narrative`, returns trimmed markdown string.
- [x] Task 2: Add `handlePushCharacter(sub)` async function — calls `compilePushOutcome`, PUTs `{ 'st_review.outcome_text': md, 'st_review.outcome_visibility': 'published', 'st_review.published_at': iso }`, updates local `sub.st_review` object, re-renders character list.
- [x] Task 3: Add Push button to character list item render (`renderCharList` or equivalent in `downtime-story.js`) — shown when `sub.st_review?.outcome_visibility !== 'published'`.
- [x] Task 4: Add "Published" badge to character list item — shown when `sub.st_review?.outcome_visibility === 'published'`. Uses existing `.dt-proj-done-badge` CSS class or equivalent gold-outline chip.
- [x] Task 5: Wire error display — if `handlePushCharacter` throws, show inline error text in the character row (e.g. `<span class="dt-error-msg">Push failed: {message}</span>`); clear on next successful push.

## Dev Notes

### Key files to change
- `public/js/admin/downtime-story.js` — `compilePushOutcome`, `handlePushCharacter`, char list render

### Compile logic

`compilePushOutcome(sub)` walks the same section list as `getApplicableSections(char, sub)`. For each section:

| Section key | Source field |
|---|---|
| `letter_from_home` | `st_narrative.letter_from_home.response` |
| `touchstone` | `st_narrative.touchstone.response` |
| `feeding_validation` | `st_narrative.feeding_validation.response` |
| `territory_reports` | `st_narrative.territory_reports[i].response` (one per feed territory, label = territory name) |
| `project_responses` | `st_narrative.project_responses[i].response` (one per resolved project) |
| `action_responses` | `st_narrative.action_responses[i].response` (indexed by global merit action index, for all merit sections) |
| `resource_approvals` | `st_narrative.resource_approvals[i].response` (if text present) |
| `cacophony_savvy` | `st_narrative.cacophony_savvy[i].response` (one per CS dot) |

Sections with no response (empty or absent) are silently skipped — never emit a `## Heading` with no body.

### Published badge CSS

Reuse `.dt-proj-done-badge` (existing gold-outline chip defined in the DT Story stylesheet). If a new class is needed, follow the same token pattern: `border: 1px solid var(--gold2); color: var(--gold2); border-radius: 3px; padding: 1px 6px; font-size: 0.75em`.

### Server side — no changes needed

`strip-st-review.js` already promotes `st_review.outcome_text` to `published_outcome` when `outcome_visibility === 'published'`. No server changes required.

### Idempotency

PUT with `outcome_visibility: 'published'` is a safe overwrite. The cycle reset wizard (Push Cycle step 4) already relies on this — it sets `outcome_visibility: 'published'` for all 'ready' subs. Single-push uses the same mechanism and coexists cleanly.

### Feeding pool

`feeding_roll.params.size` is written during DT Processing when the ST confirms the feeding pool. The push step does not read or write `feeding_roll` — the player's feeding-tab gates on `feeding_roll.params.size` independently of `published_outcome`.

### Visibility in DT Story char list

Characters in the list already show completion state via the green/amber nav pill (see `getNavPillState`). The Published badge is separate — it reflects delivery state, not completion state. A character can be "all-green" but not yet pushed, or pushed before all sections are marked complete (correction scenario).
