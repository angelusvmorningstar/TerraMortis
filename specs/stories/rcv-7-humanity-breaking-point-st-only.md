# Story rcv.7: Humanity Breaking Point rules reference — ST Approval Queue only

Status: done

## Locked decision (Angelus, 2026-08-30)

The epic doc flagged this story's own placement question as needing a direct call before storying —
asked via `AskUserQuestion`, answered: **ST Approval Queue only.** Not the player's own submit screen,
not both. Reasoning: the already-locked decision this epic operates under keeps breaking-point level
selection ST-only end to end (`gdx.12`'s own flow — player submits blind, ST picks the level and
confirms) — the ST is the one who needs the formula and outcome reference to make that judgement call;
the player can't act on this text either way.

## Design source — a static reference, not a live calculator

The drafted text (`app.js:1276-1294` in the recovered mockup) is richer than what this story ships:
the mockup computes a LIVE touchstone modifier from `state.data.character.touchstones`/
`humanityCurrent`, fetched as part of that mockup's own full character payload. **This story does not
fetch character data into the Approval Queue** — the epic's own locked scope for `rcv.7` is explicit:
"no schema change, no player-facing level picker... The live gdx.12 flow... is correct and stays
exactly as it is." Adding a live per-character formula computation here would mean a new fetch this
queue doesn't currently make, for a single reference feature — real, separate scope this story does
not take on.

**What ships instead: a static rules reference**, using the SAME shared, XSS-safe `renderRulesExpander()`
component (`shared/rules-text.js`, issue #994) already used identically elsewhere in this app (the
character Sheet tab, and `rcv.3a`'s Roll-tab Rules-explanation box) — reused rather than reinvented,
matching this story's own real content: the Terra Mortis errata formula (`4 - (Current Humanity -
Breaking Point level) + Touchstone modifier`), all four outcome tiers, and the full 10-level Sample
Breaking Points table (`HUMANITY_CHECK_LEVELS`, `app.js:148-159`) — real, substantial, already-drafted
reference material worth porting in full, not summarising.

**Per-row, not a single shared block above the queue.** The reference content doesn't depend on which
specific request is showing (confirmed: `server/routes/humanity-check.js`'s own request shape carries
no player-submitted reason/narrative — the ST judges independently, from their own knowledge of the
scene), so a single shared block might seem more efficient than duplicating it per row. But this app
has no existing "one block above a list of same-typed rows" pattern anywhere, and `renderRulesExpander()`
is already designed to be instantiated any number of times safely (each call gets its own DOM id) — a
per-row expander matches the SAME pattern this component already uses everywhere else, rather than
inventing a new one for a queue that, in practice, rarely has more than one or two pending Humanity
Check rows at once.

**Always available, not gated on a level being chosen** — this is reference material to help the ST
DECIDE the level, so it needs to be visible before one is picked, not after.

## Story

As an ST reviewing a pending Humanity Check in the Approval Queue,
I want the full breaking-point formula, outcome tiers, and sample breaking points by level available
right there,
so that I can judge the right level without leaving the tab or hunting through a sourcebook.

## Acceptance Criteria

1. `public/js/suite/office-approvals.js`'s `_renderHumanityCheckRow(r)` (currently `:305-337`) gains a
   `renderRulesExpander()` call, imported from `../shared/rules-text.js`, rendered inside the row
   (after the existing action row, alongside where `${error ? ... : ''}` already sits) — always
   present, not conditional on `chosenLevel`.
2. The rules text (see Task 1 for the exact string) is the ported, British-English-corrected version
   of the mockup's own drafted formula + outcome-tier text, PLUS the full 10-level
   `HUMANITY_CHECK_LEVELS` table formatted as one `**bold**`-headed, single-line-break-separated block
   (`renderRulesText()`'s own existing markdown-lite contract — paragraphs on a blank line, `**bold**`,
   a single `\n` for a line break within one paragraph — read `shared/rules-text.js` again before
   writing this to match its contract exactly, not assumed).
3. `rules_source` is `'Terra Mortis Errata'`, matching the same house-ruled-content precedent already
   set for a Devotion fixture in `rcv.3b`'s own test file.
4. No new fetch, no schema change, no player-facing level picker — the existing `chosenLevel`/
   `BREAKING_POINT_LEVELS`/Accept-Decline flow is completely unchanged by this story.
5. No change to the player-side Humanity Check submit flow (`public/js/game/humanity-check.js`) at
   all — this story is ST Approval Queue only, per the locked decision above.
6. The expander uses a unique id per row (via the request's own `id`, matching this component's own
   existing call-site convention elsewhere in this app — e.g. `'rt-' + charSlug + slugId(...)` on the
   Sheet tab) so multiple pending Humanity Check rows each get their own independently-toggleable
   expander, not a single shared DOM id colliding across rows.

## What this story is NOT

- **Not** a live-computed touchstone modifier or per-character formula value — reference text only,
  the ST still does the arithmetic themselves (as they already do today, picking a level from the
  existing dropdown).
- **Not** a change to the player-side submit flow, the request schema, or the existing ST level-picker
  dropdown/Accept/Decline buttons.
- **Not** a single shared reference block rendered once above the queue — per-row, matching this
  app's own established `renderRulesExpander()` usage pattern everywhere else it appears.

## Tasks / Subtasks

- [ ] Task 1 (AC1-AC3, AC6) — `public/js/suite/office-approvals.js`:
  - Add the import: `import { renderRulesExpander } from '../shared/rules-text.js';`
  - Inside `_renderHumanityCheckRow(r)`, build and splice in the expander:
    ```js
    const hcRulesText =
      'Terra Mortis errata pool: 4 - (Current Humanity - Breaking Point level) + Touchstone modifier. No Touchstones attached: -2. One Touchstone attached: +2. Two or more attached: +3. Willpower cannot improve this roll.\n\n' +
      'Dramatic Failure: lose a Humanity dot, gain the Jaded Condition. Failure: lose a Humanity dot, gain Bestial, Competitive, or Wanton. Success: no loss, gain Bestial, Competitive, or Wanton anyway. Exceptional Success: no loss, gain Inspired. Take a Beat whenever a breaking point is faced. A character may take a bane (-1 permanent, cumulative, max 3) to become immune to losing Humanity from that specific breaking point again.\n\n' +
      '**Sample Breaking Points, by level:**\n' +
      '**Humanity 10:** One night without human contact; lying in defence of the Masquerade; spending more than one Vitae in a night.\n' +
      '**Humanity 9:** Watching humans eat a meal; committing a superhuman feat of physical prowess; feeding from the unwilling or unknowing; urging another\'s behaviour with a Discipline; spending an hour in the sun.\n' +
      '**Humanity 8:** Creating a ghoul; rejected by a human; riding the wave of frenzy; depriving another of consent with a Discipline; spending most of a day in the sun.\n' +
      '**Humanity 7:** One week active without human contact; surviving something that would hospitalise a human; injuring someone over blood.\n' +
      '**Humanity 6:** Falling into torpor; feeding from a child; reading your own obituary; experiencing a car crash or other immense physical trauma.\n' +
      '**Humanity 5:** Two weeks active without human contact; reaching Blood Potency 3; death of a mortal family member; joining a covenant to the point of gaining Status for it.\n' +
      '**Humanity 4:** Learning a dot of Cruac; impassioned violence; spending a year or more in torpor; surviving a century; accidentally killing.\n' +
      '**Humanity 3:** One month active without human contact; reaching Blood Potency 6; death of a mortal spouse or child; impassioned killing.\n' +
      '**Humanity 2:** One year active without human contact; premeditated killing; seeing a culture that did not exist when you were alive; surviving 500 years; creating a revenant.\n' +
      '**Humanity 1:** One decade active without human contact; heinous, spree, or mass murder; killing your Touchstone.';
    const hcRulesExpander = renderRulesExpander('hc-rules-' + id, hcRulesText, 'Terra Mortis Errata');
    ```
    Splice `hcRulesExpander` into the returned template string, after the existing action row and
    before the `${error ? ... : ''}` line (or after it — implementer's own call on exact placement,
    but it must render unconditionally, not behind `chosenLevel`).
  - **Before finalising the `\n` vs `\n\n` choice above, re-read `shared/rules-text.js`'s
    `renderRulesText()` in full** to confirm exactly how it splits paragraphs vs line-breaks (the
    Task 1 code above assumes blank-line-separated blocks become `<p>` tags and single-`\n` lines
    within one block become `<br>` — verify this against the real function body, not this story's own
    restatement of it, before shipping).

- [ ] Task 2 (testing) — a new or extended Playwright spec covering: the expander renders for a
  Humanity Check row, collapsed by default; toggling it open reveals the formula text and at least
  one of the 10 level entries (e.g. "Humanity 1" and its examples) with `**bold**` rendered as real
  `<strong>` (matching `renderRulesText()`'s own existing contract, already proven by `rcv.3a`'s own
  tests); it renders regardless of whether a breaking-point level has been chosen yet; two separate
  pending Humanity Check rows (if the test fixture supports seeding more than one) each get their own
  independently-toggleable expander, not a shared one; the existing level-picker dropdown, Accept, and
  Decline controls are all unchanged and still function. Check whether `office-approvals.js` already
  has an existing spec file to extend before creating a new one.

## Dev Notes

### File List (expected)

- `public/js/suite/office-approvals.js` — modified (Task 1: import + expander added to
  `_renderHumanityCheckRow`).
- A test file (Task 2) — extended existing or new, per what's already there.

### References

- [Source: specs/epic-rcv-roller-convergence.md] — rcv.7's own epic-doc section, including the
  explicit "ask before storying" placement question this story's own locked-decision section answers.
- [Source: scratchpad/roller-live-recovered/public/app.js:148-159,1276-1294] — `HUMANITY_CHECK_LEVELS`
  and the drafted rules-summary text, read in full for this story's own design-lock pass.
- [Source: public/js/suite/office-approvals.js:303-337] — `BREAKING_POINT_LEVELS`,
  `_renderHumanityCheckRow()`, read in full; the exact live function this story extends.
- [Source: public/js/shared/rules-text.js] — `renderRulesExpander()`/`renderRulesText()`, read in
  full to confirm the exact markdown-lite contract (paragraph/line-break splitting, `**bold**`) before
  writing Task 1's own multi-line string.
- [Source: server/routes/humanity-check.js] — confirmed no player-submitted reason/narrative exists on
  a request, grounding the "reference material, not request-specific" design call.
- [Source: specs/stories/rcv-3b-rules-explanation-devotions.md] — the `rules_source: 'Terra Mortis
  Errata'` precedent this story reuses for the same reason (house-ruled, not a straight page cite).

## Dev Agent Record

### Agent Model Used

Claude Opus (orchestrator, inline — no subagent delegation; task was small and fully specified after
the story's own design-lock investigation, including a direct re-read of `renderRulesText()`'s own
paragraph/line-break contract before committing to the `\n`/`\n\n` layout).

### Completion Notes List

- Implemented Task 1 exactly per the story's own design: added the `renderRulesExpander` import,
  extracted the drafted rules text into a module-level `HC_RULES_TEXT` constant (formula paragraph,
  outcome-tiers paragraph, then a single `\n`-joined "Sample Breaking Points, by level:" block with
  all 10 levels as `**bold**`-headed lines), and spliced the resulting expander into
  `_renderHumanityCheckRow()`'s own template, unconditional on `chosenLevel`, with a per-row unique id
  (`'hc-rules-' + id`).
- No existing test coverage for `office-approvals.js` at all in this repo (checked `tests/` and
  `server/tests/` — only source-contract regex assertions exist elsewhere, nothing exercising real
  rendering). New Playwright spec `tests/rcv-7-humanity-breaking-point-rules-reference.spec.js`, 5
  tests: collapsed by default; toggling reveals the formula, outcome tiers, and the full level table
  with real `<strong>` bold rendering (not literal `**` asterisks) plus the `Source: Terra Mortis
  Errata` line; visible before any level is chosen; two pending rows each get their own
  independently-toggleable expander (distinct DOM ids, not a shared one); the existing level-picker
  dropdown, Accept, and Decline controls are all unchanged. 5/5 passed on the first run.
- Regression: the 5 vitest suites referencing `office-approvals.js`/the Approval Queue
  (`gdx-12-humanity-check-oaq-submit-approve`, `oaq-3-approval-queue`, `crd-2-pending-queue`,
  `oxp-3-office-manoeuvre-rank`, `oxp-9-spend-routes-through-oaq`) = 260/260. No Playwright regression
  suite exists for this file beyond the new spec itself.
- Visually verified via a throwaway screenshot (deleted after use): the full rules reference renders
  correctly with real bold headers, correct British spelling, and the existing queue row controls
  (character name, level dropdown, Accept/Decline, timestamp) render exactly as before.

### File List

- `public/js/suite/office-approvals.js` — modified (Task 1: `renderRulesExpander` import,
  `HC_RULES_TEXT` constant, expander spliced into `_renderHumanityCheckRow()`).
- `tests/rcv-7-humanity-breaking-point-rules-reference.spec.js` — new (5 tests).

## Senior Developer Review (self, inline)

**Reviewed:** 2026-08-30. Implemented directly by the orchestrator (no subagent), so this is a final
independent pass over the finished diff before closing, matching the rigor applied to every delegated
story this epic.

### Verification

- Re-read the actual `git diff` of `office-approvals.js` directly: matches the design exactly — the
  expander is unconditional (not gated on `chosenLevel`), uses a per-row id, and no existing
  Accept/Decline/level-picker logic was touched.
- Independently confirmed `renderRulesText()`'s own paragraph/line-break contract by reading the
  function body a second time (not trusting the earlier read alone) before accepting the `\n`/`\n\n`
  layout as correct: a blank line (produced by `\n\n`) flushes the current paragraph into its own
  `<p>`; a bare `\n` continues the same paragraph, joined with `<br>` on render. The 11-line "Sample
  Breaking Points" block (header + 10 levels) correctly renders as one compact `<br>`-separated block
  under a single `<p>`, confirmed visually.
- Re-ran the new spec (5/5) and the 5 vitest regression suites (260/260) myself rather than trusting
  the implementation pass alone, since there was no separate subagent report to cross-check against.
- Swept the added `HC_RULES_TEXT` content directly for em-dashes: none found.

No findings. Story closed `done`. This closes Epic RCV's own last story.

### Outcome

Story status: `done`. Real, substantial drafted reference content (the formula, outcome tiers, and
the full 10-level Sample Breaking Points table) now genuinely surfaced where the ST needs it, reusing
the same shared component this whole epic has consistently reached for rather than reinventing. NOT
committed, NOT pushed, NOT merged — this epic commits once at close, not per-story.
