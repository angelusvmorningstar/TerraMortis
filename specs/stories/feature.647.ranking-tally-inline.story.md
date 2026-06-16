# Story feature.647: Show ranking point total inline with character name in ST aggregate view

## Status: review

## Metadata

```yaml
issue: 647
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/647
branch: ms/issue-647-ranking-tally-inline-name
```

## Story

**As an** ST reviewing the "Ranking Points — This Cycle" panel,
**I want** each character's point total shown in parentheses next to their name,
**so that** I can read the ranking at a glance without eye-travelling to the far-right column.

## Acceptance Criteria

1. **Given** the ST aggregate view (Ranked or Political mode), each character row displays their point total in parentheses immediately after their name: `Name (n)`.
2. **Given** a character has 0 points, they still display as `Name (0)` — consistent rendering for all entries.
3. **Given** either Ranked or Political mode is active, the inline tally updates when switching modes (no extra wiring needed — `refresh()` already re-renders the list).
4. The right-hand `.rank-member-pts` column is preserved — this change is purely additive to the name span.
5. No regression to the player ballot view or any other ranking surface.

## Tasks

- [x] **Task 1:** `public/js/tabs/status-ranking.js` — update `renderAggMemberList` (line 72) to append `(${m.pts})` after the name:
  ```js
  // Before:
  `<div class="rank-member-row"><span class="rank-member-name">${esc(m.name)}</span><span class="rank-member-pts${m.pts === 0 ? ' zero' : ''}">${m.pts}</span></div>`

  // After:
  `<div class="rank-member-row"><span class="rank-member-name">${esc(m.name)} (${m.pts})</span><span class="rank-member-pts${m.pts === 0 ? ' zero' : ''}">${m.pts}</span></div>`
  ```

- [x] **Task 2:** `tests/feature-624-clan-covenant-ranking.spec.js` — extend the existing ST aggregate test (or add a new one) to assert the inline `(n)` format:
  - Given aggregate `{ clan_points: { 'char-clan': 5 } }`, the clan list shows `Clanmate (5)`.
  - Given a character with 0 points in the visible list, their entry shows `(0)`.

## Dev Notes

### The only file that changes

`public/js/tabs/status-ranking.js` is the single source of truth for all ranking UI, imported by both `status-tab.js` (legacy portal) and `suite/status.js` (live unified app). One edit here covers both surfaces.

### Exact target

```
public/js/tabs/status-ranking.js:70-75  — renderAggMemberList()
```

Current:
```js
function renderAggMemberList(members) {
  if (!members || !members.length) return `<p class="placeholder-msg status-empty">No members.</p>`;
  return members.map(m =>
    `<div class="rank-member-row"><span class="rank-member-name">${esc(m.name)}</span><span class="rank-member-pts${m.pts === 0 ? ' zero' : ''}">${m.pts}</span></div>`
  ).join('');
}
```

Change: append ` (${m.pts})` inside the `.rank-member-name` span. No other changes to this function.

### How `m.name` and `m.pts` are set

`buildOrgGroups` (line 56-68) populates each member object:
```js
{ name: c.moniker || c.name || '', pts: Number((points || {})[String(c._id)] || 0) }
```
- `name` is already the display string (moniker preferred over legal name) — no helpers needed here.
- `pts` is 0 when the character received no votes. Still show `(0)` for consistency.

### How the tally is derived (for reviewers / QA)

Players submit a ballot of their top 5 for Clan and Covenant per cycle.  
Scores: 1st = 5 pts, 2nd = 4 pts, 3rd = 3 pts, 4th = 2 pts, 5th = 1 pt.  
The aggregate API (`GET /api/ranking_ballots/aggregate?cycle_id=...&mode=ranked|political`) returns `{ clan_points: { <char_id>: n }, covenant_points: { <char_id>: n } }`. `m.pts` is one of those values.

### Mode switching — no extra work needed

`wireRankingAggregate` calls `renderAggMemberList` indirectly through `refreshPills` every time the user clicks Ranked/Political. The inline tally will update automatically.

### Existing tests

`tests/feature-624-clan-covenant-ranking.spec.js` has an ST aggregate test at line 103-113 that checks `toContainText('5')`. After the change, `Clanmate (5)` still satisfies `toContainText('5')` so existing tests continue to pass. Add (or update) the test to also assert `toContainText('Clanmate (5)')` explicitly.

### No CSS changes expected

The `(n)` suffix is plain text inside the existing `.rank-member-name` span. No new class or styling needed. If the ST later wants it styled differently (muted, smaller), that's a separate issue.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-09 | 1.0 | Story created from issue #647 | SM |
| 2026-06-09 | 1.1 | Implemented; both tasks done; status → review | Dev Agent |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Task 1: appended ` (${m.pts})` inside `.rank-member-name` span in `renderAggMemberList` — one-line change.
- Task 2: replaced broken ST test (used non-existent `.status-ranking-agg-grid` locator) with two passing tests that use `#rank-clan-list` / `#rank-cov-list` and assert `Clanmate (5)`, `Voter (0)` (zero-point), and `Covmate (3)` after pill navigation. Pre-existing player ballot `toHaveCount(3)→5` failure is unrelated to this story and was already present before this branch.

### File List
- `public/js/tabs/status-ranking.js`
- `tests/feature-624-clan-covenant-ranking.spec.js`
