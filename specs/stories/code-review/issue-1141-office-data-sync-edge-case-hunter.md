# Edge Case Hunter — issue-1141-office-data-sync

You have **read access to the whole repository** at `D:\Terra Mortis\TM Suite`, plus the diff below. Use
the repo to understand context the diff alone doesn't show — but your job is edge cases and boundary
conditions in and around this change, not a general code review.

## What this change is

`public/js/tabs/office-data.js` exports a static object, `OFFICE_DATA`, keyed by a Court Position's
`court_category` (`'Head of State'`, `'Primogen'`, `'Enforcer'`, `'Socialite'` — no `'Administrator'`
key, deliberately). It is consumed by `renderOfficeTab` in `public/js/tabs/office-tab.js`, wired into the
player-facing "Office" tab in `public/js/app.js`. This story rewrote the manoeuvre content for all four
positions (new names, new rank order, new effect text — supplied by a collaborator, transcribed
verbatim), and fixed a bug where three of the four positions' `merits` arrays duplicated the office's own
`asset` name as a bogus extra merit chip. A new Vitest suite,
`server/tests/issue-1141-office-data-sync.test.js`, asserts on the new content directly.

## The diff

`D:\Terra Mortis\TM Suite\specs\stories\code-review\issue-1141-office-data-sync-diff.txt`

## What to hunt for

- **Every consumer of `OFFICE_DATA`, found by your own search, not by trusting the diff or the story's
  claim that there is only one.** Grep the repository for `OFFICE_DATA` and for `office-data.js`. If you
  find a second consumer the diff doesn't account for, that is a real finding.
- **Boundary conditions on the data shape itself**: does anything downstream assume a fixed array length
  (the `merits` arrays are now 3 or 4 items where they used to be 3-5, some with a trailing duplicate)?
  Does anything assume manoeuvre array order carries meaning beyond display (it does — array position is
  rank, per the story; confirm nothing else relies on a *different* ordering assumption)?
- **The `court_category` values actually live in MongoDB right now** — `characters.court_category` per
  `server/schemas/character.schema.js`. Two characters currently hold `'Socialite'` concurrently (an
  appointed seat and a "popular" seat), and one holds `'Administrator'` with no corresponding
  `OFFICE_DATA` entry. Check `office-tab.js`'s handling of an `OFFICE_DATA[category] === undefined` case
  and of two characters resolving the same category — does anything break, race, or share state
  incorrectly across two renders?
- **The new test file's safety.** `office-tab.js` imports `../data/api.js`, which reads
  `location.hostname` at module top level; the story claims this makes `office-tab.js` unsafe to import
  under this project's Vitest (no jsdom configured in `server/vitest.config.js`) and that the new test
  file therefore imports only `office-data.js`. Verify this claim yourself — check what the new test file
  actually imports, and confirm whether the claimed hazard is real (try importing `office-tab.js` in a
  throwaway Vitest run if you want to prove it directly, don't just take the story's word for it).
- **Anything else in the same directory or import graph** (`office-tab.js`, `office-actions.js`,
  `server/schemas/character.schema.js`) that this diff should have touched but didn't, given what it
  claims to fix.

## Ground rules

- **Do not modify, commit, or push anything in this repository.**
- **Never touch any sibling repository.** This is an umbrella workspace at `D:\Terra Mortis\`; TM Wiki,
  TM Cockpit and TM Herald are adjacent, independent repos with their own git history. Stay inside
  `D:\Terra Mortis\TM Suite` only.
- Read and run things freely to verify a suspicion — grep, run the new test file, write a throwaway
  script — but if you temporarily edit any tracked file to prove something, you must restore it to its
  exact original state afterward, confirm the restore (`git diff` showing no changes), and say explicitly
  in your output that you did this and that the restore is confirmed.

## Output format

A Markdown list. For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **Location**: `file:line`
- **Triggering input or sequence**: the concrete input, state, or sequence of calls that exposes the
  problem
- **Observable consequence**: what actually goes wrong
- **Confidence**: how sure you are, and why

If you find nothing, say so plainly rather than manufacturing a finding.
