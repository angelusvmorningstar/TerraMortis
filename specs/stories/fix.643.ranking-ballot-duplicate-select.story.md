# Story fix.643: Ranking Ballot — Prevent Duplicate Character in Same List

## Status: done

---
issue: 643
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/643
branch: ms/issue-643-ranking-duplicate-select
---

## Story

**As a** player filling in my ranking ballot,
**I want** the clan and covenant dropdowns to prevent me from picking the same character twice in the same list,
**so that** I cannot accidentally submit an invalid ballot without realising it.

## Background

Feature #624 added a per-cycle ranking ballot to the Status tab (unified player app, `index.html`). Players choose their top 5 clanmates and top 5 covenantmates from `<select>` dropdowns. The server correctly rejects duplicate picks within the same list (HTTP 400 "the same character twice"), but the client provides no visual feedback before the player hits Save — a player can silently construct an invalid ballot and receive a confusing failure on submit.

Cross-list duplication is intentional and allowed: a character who is both a clanmate and a covenantmate may appear in both the clan ranking and the covenant ranking.

## Acceptance Criteria

1. Selecting a character in any slot of the clan block immediately disables that character's `<option>` in all other clan slots.
2. Changing or clearing a slot re-enables the previously-disabled option in the other clan slots.
3. The same disable/re-enable logic applies independently to the covenant block.
4. A character chosen in the clan block is NOT disabled in the covenant block (cross-list picks remain freely available).
5. The `— none —` placeholder option (value `""`) is never disabled in any slot.
6. The existing Save-click duplicate guard (`"Each slot must be a different character."`) remains as a last-resort fallback and is not removed.
7. No changes to the server, schema, or any file other than `public/js/tabs/status-ranking.js`.

## Tasks / Subtasks

- [x] Task 1: Add `wireDuplicateGuard(el, rank)` function
  - [x] Accepts the ballot section element and a rank string (`'clan'` or `'covenant'`)
  - [x] Queries `el.querySelectorAll('.status-ranking-sel[data-rank="${rank}"]')` to get the five selects for that block
  - [x] On `change` on any of those selects, collects the non-empty selected values of the other selects in the block, then for every select iterates its `<option>` elements: disables those whose value appears in the other-slot values set; enables all others (except `value=""` which is always enabled)
  - [x] Runs an initial pass immediately after wiring (so a ballot loaded from the DB with pre-filled slots is correctly initialised)

- [x] Task 2: Call `wireDuplicateGuard` from `appendRankingSection` (player branch)
  - [x] Called `wireDuplicateGuard(el, 'clan')` and `wireDuplicateGuard(el, 'covenant')` immediately after `wireRankingSave`

- [ ] Task 3: Manual verification (requires code on dev)
  - [ ] Pick the same character in slot 1 and slot 3 of the clan block — slot 3's dropdown should show that character greyed-out / unselectable immediately after slot 1's pick
  - [ ] Change slot 1 to a different character — the previously-disabled character re-enables in slot 3
  - [ ] Pick the same character in the covenant block independently — no cross-contamination from the clan block
  - [ ] Load the page with a saved ballot (pre-filled slots) — guard fires on load; no duplicates possible in pre-filled state
  - [ ] The `— none —` option is always selectable

## Dev Notes

### The only file to change

`public/js/tabs/status-ranking.js` — everything else is correct as-is.

### Exact wiring point

`wireRankingSave` (line 152) is called from `appendRankingSection` (line 225) **after** the ballot HTML has been appended to the DOM. This is the correct place to add the guard — the selects exist in the DOM at this point.

```js
// Current wireRankingSave (lines 152-174):
function wireRankingSave(el, voterId, cycleId) {
  const btn = el.querySelector('.status-ranking-save');
  if (!btn) return;
  btn.addEventListener('click', async () => { ... });
}

// ADD after the btn.addEventListener block:
wireDuplicateGuard(el, 'clan');
wireDuplicateGuard(el, 'covenant');
```

### Implementation sketch for `wireDuplicateGuard`

```js
function wireDuplicateGuard(el, rank) {
  const selects = [...el.querySelectorAll(`.status-ranking-sel[data-rank="${rank}"]`)];
  function refresh() {
    // Collect non-empty values chosen by OTHER selects
    selects.forEach(sel => {
      const others = new Set(selects.filter(s => s !== sel).map(s => s.value).filter(Boolean));
      sel.querySelectorAll('option').forEach(opt => {
        if (!opt.value) return; // never disable the "— none —" placeholder
        opt.disabled = others.has(opt.value);
      });
    });
  }
  selects.forEach(sel => sel.addEventListener('change', refresh));
  refresh(); // initial pass for pre-filled ballots
}
```

### What NOT to change

- `renderRankingSlots` — generates the `<select>` HTML; no change needed. The `disabled` attribute is a live DOM mutation in `refresh()`, not baked into the HTML.
- `memberOptions` — generates `<option>` elements; no change needed.
- `renderRankingBallot`, `wireRankingAggregate`, ST aggregate code — untouched.
- The server route `server/routes/ranking_ballots.js` — already correct.
- The schema `server/schemas/ranking_ballot.schema.js` — no change.

### CSS

No CSS changes needed. Browsers render `<option disabled>` as greyed-out natively. Do not add custom styles.

### No test framework

This project has no automated test framework. Verification is manual in-browser. Mark tasks done after confirming behaviour in the app (requires the feature on dev — see smoke check protocol).

### Selector contract

Selects are identified by `[data-rank="clan"]` or `[data-rank="covenant"]` and class `.status-ranking-sel`. These attributes are set in `renderRankingSlots` (line 33) and must not be changed.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-08 | 1.0 | Initial draft | Claude Sonnet 4.6 |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `wireDuplicateGuard` added above `wireRankingSave` in `status-ranking.js` (~12 lines).
- Called from the player branch of `appendRankingSection` alongside `wireRankingSave`; guard runs after the ballot HTML is in the DOM.
- Initial `refresh()` call on wire handles pre-filled ballots loaded from the DB.
- No server, schema, CSS, or other file changes made.

### File List
- `public/js/tabs/status-ranking.js`
