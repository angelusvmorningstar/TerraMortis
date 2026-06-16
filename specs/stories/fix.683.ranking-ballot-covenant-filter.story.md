---
id: fix.683
title: Ranking ballot covenant dropdown filters to primary covenant members only
status: review
issue: 683
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/683
branch: ms/issue-683-ranking-ballot-covenant-filter
type: bug
---

## Story

As a player submitting my Clan & Covenant Ranking ballot, I want the covenant dropdown to show
only characters who are primary members of my covenant, so that I am not presented with characters
who merely hold secondary standing there and should not be eligible for my ranking vote.

## Acceptance criteria

- [ ] A character with secondary Invictus standing (e.g. Keeper) does NOT appear in the Invictus
  covenant ranking dropdown for an Invictus-primary character
- [ ] A character with no primary Crone covenant does NOT appear in the Crone ranking dropdown
- [ ] Characters whose primary covenant IS the target covenant continue to appear in the dropdown
  (even at 0 standing)
- [ ] The display-only status rows (section headers above the ballot) are unchanged — they
  may still show secondary standing holders by design
- [ ] Clan ballot dropdown is unaffected

---

## Dev notes

### Root cause

In `public/js/tabs/status-ranking.js:241`, `covMembers` is built via `covenantRowsFor`:

```js
const covMembers = (me?.covenant ? covenantRowsFor(chars, me.covenant, sortName) : []).map(r => r.c).filter(c => String(c._id) !== activeId);
```

`covenantRowsFor` (`public/js/data/status-data.js:50-54`) is designed for the *display panels*,
which intentionally show every rank-holder regardless of primary affiliation:

```js
export function covenantRowsFor(chars, cov, sortNameFn) {
  return chars
    .map(c => ({ c, val: c.status?.covenant?.[cov] || 0 }))
    .filter(r => r.val > 0 || r.c.covenant === cov)   // ← val > 0 catches secondary holders
    .sort(...);
}
```

Because it includes characters where `status.covenant[cov] > 0`, characters with secondary
standing in a covenant (e.g. Keeper's secondary Invictus) pass the filter and land in the
ballot dropdown. That is correct behaviour for the standing display — but wrong for the ballot,
where eligibility is determined solely by primary membership (`c.covenant === cov`).

### Fix — one line in `status-ranking.js`

Replace the `covMembers` assignment at line 241 with a direct primary-covenant filter that
bypasses `covenantRowsFor` entirely:

```js
// BEFORE (line 241):
const covMembers  = (me?.covenant ? covenantRowsFor(chars, me.covenant, sortName) : []).map(r => r.c).filter(c => String(c._id) !== activeId);

// AFTER:
const covMembers  = me?.covenant ? chars.filter(c => c.covenant === me.covenant && String(c._id) !== activeId) : [];
```

No sort is needed — `memberOptions` renders the list in iteration order; the array will come
out in whatever order `chars` is in (consistent with how it has always behaved).

### What NOT to change

- `covenantRowsFor` in `public/js/data/status-data.js` — this function is used by both
  `renderSuiteStatusTab` and the standing-display sections; its `val > 0` inclusion is
  deliberate there. Do not touch it.
- The `clanMembers` line (240) — clan ballot is not reported broken; leave it alone.
- The `covenantListFor` helper — unrelated, used only to decide which covenant tables to render.
- Anything in the ST aggregate path (`isST === true` branch above line 237).

### What to verify after the fix

1. Log in as a character whose primary covenant is Invictus (e.g. any Invictus-primary PC).
2. Open the Status tab → scroll to Clan & Covenant Ranking.
3. Check the Covenant dropdown: Keeper should NOT appear.
4. Check that other Invictus-primary characters DO appear.
5. Log in as a Circle of the Crone character; confirm Wan Yelong is absent from the dropdown.
6. Confirm the standing display sections above the ballot (the rank tables) still show secondary
   holders if they have `status.covenant[cov] > 0`.

### Files to change

| File | Change |
|------|--------|
| `public/js/tabs/status-ranking.js` | Line 241: replace `covMembers` assignment (see fix above) |

---

## Dev agent record

### Completion notes

- Replaced `covMembers` assignment at line 241 to filter `chars` directly by `c.covenant === me.covenant` instead of calling `covenantRowsFor`, which was including secondary standing holders via its `val > 0` branch.
- Removed unused `covenantRowsFor` from the import on line 13 — `clanRowsFor` and `resolveActiveChar` remain.
- `covenantRowsFor` in `status-data.js` is untouched; display panels continue to show secondary holders by design.
- No tests exist for this module (browser-only DOM code); verification is manual per the story's "What to verify" section.

### Files changed

| File | Change |
|------|--------|
| `public/js/tabs/status-ranking.js` | Line 241: `covMembers` now filters by primary covenant only; import cleaned |
