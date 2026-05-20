---
issue: 362
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/362
branch: ms/issue-362-dt-story-xp-spend-context
status: review
---

# Story: DT Story — XP Spend Context Prompt Shows Purchase Detail

## Story

As an ST writing downtime narratives in DT Story,
I want the context prompt for XP Spend project actions to show what was actually purchased,
so that the narrative I write (or the AI generates) accurately reflects what the character learned or acquired.

## Acceptance Criteria

- [ ] Given a project with `action_type === 'xp_spend'` and `rev.outcome_summary` set, the context prompt includes a line `XP Purchase: <outcome_summary>`.
- [ ] Given `outcome_summary` is absent but `project_N_outcome` (player field) is set, the context includes `Desired Purchase: <outcome>` instead of the generic `Desired Outcome: <outcome>` label.
- [ ] Given neither field is set, no extra line is added and the context is unchanged.
- [ ] The Copy Context button output matches what is displayed in the collapsed context block (both call `buildProjectContext()`).
- [ ] No change to context output for non-XP-Spend action types.

## Dev Notes

### The one file to change

Only `public/js/admin/downtime-story.js` needs to change. No API changes, no CSS, no other files.

### buildProjectContext() — current state

The function (around line 492) assembles the AI prompt for project action cards. It reads player-submitted form fields and roll data, then pushes labelled lines:

```js
lines.push(`Action: ${actionLabel}`);
if (title)       lines.push(`Title: ${title}`);
if (outcome)     lines.push(`Desired Outcome: ${outcome}`);
if (description) lines.push(`Description: ${description}`);
if (merits)      lines.push(`Merits & Bonuses: ${merits}`);
if (cast)        lines.push(`Connected Characters: ${cast}`);
```

Where:
- `outcome` = `sub.responses?.[`project_${slot}_outcome`]` — **player-submitted** desired outcome
- `rev` = `sub.projects_resolved?.[idx] || {}` — the ST-resolved review object
- `rev.outcome_summary` — **ST-filled** in DT Processing; for xp_spend this is the actual purchase (e.g. "Dominate ●●●")

`rev.outcome_summary` is never read by `buildProjectContext()`. It is used in `renderMeritSummary()` for merit actions (lines ~2048-2074) but was never wired up for project actions.

### The fix

Add a special-case block for `xp_spend` after the pool/roll block in `buildProjectContext()`. The right place is **after** the existing `if (outcome)` line push, so both the player intent and the actual purchase can appear:

```js
// For XP Spend: show what was actually purchased from ST's outcome_summary,
// or fall back to the player's stated desired outcome with a clearer label.
if (actionType === 'xp_spend') {
  const xpPurchase = rev.outcome_summary?.trim();
  if (xpPurchase) {
    lines.push(`XP Purchase: ${xpPurchase}`);
  }
}
```

**And** change the generic "Desired Outcome" label to "Desired Purchase" for xp_spend to make the player intent line clearer:

```js
if (outcome) {
  lines.push(actionType === 'xp_spend'
    ? `Desired Purchase: ${outcome}`
    : `Desired Outcome: ${outcome}`);
}
```

These two changes together satisfy all ACs:
- `outcome_summary` present → shows "XP Purchase: ..." (primary)
- `outcome_summary` absent, player `outcome` present → shows "Desired Purchase: ..." (fallback via the relabelled line)
- Neither present → no extra lines (graceful omission)
- Non-xp_spend → unchanged ("Desired Outcome" label, no XP Purchase line)

### Where exactly in the function

The existing `if (outcome)` line push is at approximately line 522. Change it and add the xp_spend block immediately after:

```js
// Before (line ~522):
if (outcome) lines.push(`Desired Outcome: ${outcome}`);

// After:
if (outcome) {
  lines.push(actionType === 'xp_spend'
    ? `Desired Purchase: ${outcome}`
    : `Desired Outcome: ${outcome}`);
}
const xpPurchase = rev.outcome_summary?.trim();
if (actionType === 'xp_spend' && xpPurchase) {
  lines.push(`XP Purchase: ${xpPurchase}`);
}
```

### Variables already in scope

Both `outcome` and `rev` are defined earlier in `buildProjectContext()`:
- `outcome` — line ~495: `const outcome = sub.responses?.[`project_${slot}_outcome`] || '';`
- `rev` — line ~501: `const rev = sub.projects_resolved?.[idx] || {};`
- `actionType` — line ~502: `const actionType = rev.action_type_override || rev.action_type || ...;`

No new variables needed.

### NFR: Zero imports from downtime-views.js

`downtime-story.js` header: "Zero imports from downtime-views.js." This change needs no new imports — all variables are already in scope. ✓

### No CSS needed

The context block uses `<pre class="dt-story-context-text">` which renders all lines as plain text. No styling change required.

### xp_spend in other contexts

`xp_spend` is listed in `ACTION_TYPES_FOR_UPTIME_BREAKDOWN` in `downtime-constants.js` but has no special context builder (only `patrol_scout` and `maintenance` have separate builders). This change is the only place it needs to be handled differently.

## Tasks

- [x] In `buildProjectContext()`, change the `Desired Outcome` push to use `Desired Purchase` label when `actionType === 'xp_spend'`
- [x] In `buildProjectContext()`, add `XP Purchase: <outcome_summary>` line for xp_spend when `rev.outcome_summary` is set
- [x] Parse-check: `node --input-type=module --check < public/js/admin/downtime-story.js`
- [ ] Smoke test: open DT Story for a character with an XP Spend project that has `outcome_summary` set; verify context block shows "XP Purchase: ..." line

## Verification

- Open DT Story, find a character with an `xp_spend` project action where the ST has filled in the outcome in DT Processing.
- Expand the context block — it should show "XP Purchase: <what was bought>".
- Click Copy Context — the copied text should include the same line.
- Open a different action type (e.g. Grow) — context should still show "Desired Outcome:" (not "Desired Purchase:").
- No console errors.

## Dev Agent Record

### File List
- `public/js/admin/downtime-story.js` — modified `buildProjectContext()`: xp_spend now uses "Desired Purchase" label and adds "XP Purchase" line from `rev.outcome_summary`

### Change Log
- 2026-05-18: In `buildProjectContext()`, changed "Desired Outcome" label to "Desired Purchase" for xp_spend actions; added "XP Purchase: <outcome_summary>" line when ST has recorded outcome in DT Processing

### Completion Notes
Two-line targeted change inside `buildProjectContext()` (~line 626). Both `rev` and `actionType` were already in scope. Parse-checked clean. Smoke test (manual) remains for user — requires a character with an xp_spend project and `outcome_summary` populated in DT Processing.
