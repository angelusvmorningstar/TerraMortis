# Story rcv.3b: Rules-explanation box already covers Devotions — verify, don't rebuild

Status: done

## Rescoped 2026-08-30, before any implementation — read this before Task 1

The epic's own original framing for this story was: *"Devotions (54 docs) are thinner — 48/54 missing
`duration` — so `rcv.3b`'s own AC needs an explicit 'duration not specified' fallback rather than a
blank field or a crash."* That framing assumed rcv.3a's box would need Devotion-specific handling.
**It doesn't, and tracing the actual code shows why:**

- `char-pools.js`'s Discipline/Rite/Devotion/Pact tile loop (`char-pools.js:203-228`) builds ONE
  `derivedPowers` array from two sources — rank-gated core discipline powers, AND
  `(char.powers || []).filter(p => p.category === 'devotion' || p.category === 'rite' || p.category
  === 'pact')` (`:215-216`) — then runs every single entry through the SAME `getPool(char, pw.name)`
  call and the SAME tile-building loop (`:220-228`). There is no category-specific branch anywhere in
  this path. A Devotion tile is built identically to a core Discipline tile.
- `getPool()` (`shared/pools.js:29-77`) resolves a Devotion by trying `getRuleByKey('devotion-' +
  slug)` as one of three lookup fallbacks (`:34`) but returns the exact same object shape regardless
  of which of the three matched — `effect`/`action`/`duration`/`cost`/`cost_note`/`rules_text`/
  `rules_source`, all through the identical `|| null`/`?? null` normalisation rcv.3a's own review
  already audited.
- rcv.3a's `updRulesSummary(pi)` (`roll-v2.js:257-291`) reads those same fields with no category
  awareness at all — it has never seen, and does not need to see, whether the `pi` it was handed came
  from a Discipline, a Rite, a Devotion, or a Pact.
- **A missing `duration` already renders correctly today, for every category, silently** — `if
  (pi.duration) meta.push(esc(pi.duration))` (`roll-v2.js:274`) simply omits that bullet from the
  `power-meta` line when absent. This is not new or fragile: it is the SAME established, silent-skip
  convention `suite/sheet-helpers.js`'s `fmtRuleStats()` already uses on the Sheet tab today
  (`if (r.duration) parts.push(r.duration);`, `sheet-helpers.js:145`) — the live, in-production
  precedent this whole app already follows for exactly this situation. Nothing crashes. Nothing shows
  a blank field. The meta line just has one fewer bullet, exactly as it does on the Sheet tab.

**There is no existing "Duration not specified"-style fallback anywhere in this codebase** (grepped
`suite.js`, `editor/sheet.js`, `sheet-helpers.js` — confirmed absent). Introducing one for Devotions
specifically, while every other pool type stays silent, would be a NEW, inconsistent UX pattern
invented for a coverage gap that turns out not to produce a visible defect at all. Building it would
be solving a problem that doesn't exist, at the cost of introducing a real inconsistency that didn't
exist before.

**What this story actually is, then: verification, not construction.** Prove — with a real,
category-accurate fixture, not by inference — that a Devotion tile with a genuinely missing
`duration` (and, separately, one with real `rules_text` and one without) renders through rcv.3a's
already-shipped box exactly as correctly as a Discipline does. If that proof holds (it should, given
the trace above), this story ships zero source changes — only a regression test and a tracking
correction. If the proof somehow fails (a Devotion-specific code path this trace missed), that failure
IS the story's real finding, and only then does a fix belong here.

## Story

As an ST or player with a Devotion loaded on the Roll tab,
I want the same Rules-explanation box that already works for Disciplines and Rites to work correctly
for my Devotion too — including when its `duration` field hasn't been uplifted from the rulebook yet,
so that I'm never left wondering whether an empty-looking field means "no duration" or "this is
broken."

## Acceptance Criteria

1. A live-fixture Playwright test loads a character with a Devotion (`category: 'devotion'` in
   `char.powers`, resolved via a `devotion-<slug>` keyed rules-cache entry — not a `discipline`-keyed
   one, so this genuinely exercises the `devotion-` prefix branch in `getPool()`'s lookup, not just a
   same-shaped discipline fixture wearing a different label) that has NO `duration` set. Confirms:
   the Rules-explanation box is visible (assuming other fields are present — see AC2), the
   `power-meta` line shows only the fields that ARE present with no "N/A"/"not specified" placeholder
   and no extra empty bullet, and nothing throws.
2. A second fixture: a Devotion with real `rules_text` + `rules_source` populated. Confirms the shared
   `renderRulesExpander()` expander renders and toggles correctly for a Devotion exactly as it already
   does for a Discipline (rcv.3a's own coverage) — proving the box's behaviour is genuinely
   category-agnostic, not coincidentally correct only for the Discipline/Rite shapes rcv.3a's own
   fixtures happened to test.
3. No source file changes to `char-pools.js`, `roll-v2.js`, `shared/pools.js`, or `suite.css` unless
   AC1 or AC2 actually fails against real Devotion data — in which case the failure itself defines the
   fix's scope, not this document's own pre-guess.
4. The epic doc (`specs/epic-rcv-roller-convergence.md`) and `sprint-status.yaml` are corrected to
   record that the "Devotions need a fallback" premise was investigated and found not to hold, with
   the trace above as the evidence — not silently dropped, so a future reader doesn't re-raise the
   same already-answered question.

## What this story is NOT

- **Not** a new "Duration not specified" (or similarly worded) fallback UI — investigated and
  rejected: no such pattern exists anywhere else in this app, and building one here would be a new,
  Devotion-only inconsistency for a case that already degrades gracefully and silently everywhere
  else.
- **Not** a re-measurement of the exact current `duration` coverage percentage for the 54 Devotion
  docs — the design (rcv.3a's own, unchanged) does not depend on that number; whether it's 6/54 or
  48/54 missing, the same silent-skip behaviour handles it correctly either way.
- **Not** a change to `rcv.3a`'s own already-shipped, already-reviewed code — this story tests it
  against a category it didn't have dedicated fixtures for, it does not modify it.
- **Not** `rcv.3c` (Special/Vampire Mechanics tile copy) — unrelated, separate story, unblocked
  independently of this one.

## Tasks / Subtasks

- [ ] Task 1 (AC1, AC2) — `tests/rcv-3a-rules-explanation-box.spec.js` (append to the existing spec
  rather than creating a new file — this is a coverage extension of rcv.3a's own suite, not a new
  feature's own spec): add two Devotion-category `SEEDED_RULES` fixtures alongside the existing
  Discipline ones, and two new tests mirroring the existing "power with rules_text" / "power with NO
  rules_text" pair but keyed `devotion-<slug>` with `category: 'devotion'`, pushed to the fixture
  character's `powers: []` array with `{ name, category: 'devotion' }` (not `disciplines: {}` — a
  Devotion tile comes from `char.powers`, not discipline dots; re-read `char-pools.js:215-216` before
  writing the fixture to get this shape right) so it genuinely reaches the `derivedPowers` push at
  `char-pools.js:216` and the `devotion-` prefixed lookup branch in `getPool()`, not the discipline
  rank-gate path the existing fixtures already cover.
- [ ] Task 2 (AC3) — run the new tests. If both pass unmodified against `main`'s current code (the
  expected, traced-through outcome), no Task 3 is needed — skip straight to Task 4. If either fails,
  STOP and report the actual failure back before writing any fix — the failure's own shape defines
  what (if anything) needs to change, not a guess made in advance.
- [ ] Task 3 (conditional, only if Task 2's tests fail) — fix whatever the failure reveals. Not
  pre-specified, because the trace in this story's own rescoping section above did not find a
  Devotion-specific gap; if one is real, it is a genuine new finding, not something this document
  anticipated.
- [ ] Task 4 (AC4) — update `specs/epic-rcv-roller-convergence.md`'s own rcv.3b prose section and the
  `sprint-status.yaml` row to record the finding: the original "needs an explicit fallback" premise
  was investigated and did not hold, with a one-line pointer to this story's own rescoping section as
  the evidence trail.

## Dev Notes

### Why append to rcv-3a's spec file rather than create a new one

This story adds test coverage for a category rcv.3a's own implementation already handles by
construction (see the rescoping section) — it is not shipping new behaviour that deserves its own
spec file the way rcv.3a's genuinely new box did. Keeping the Devotion fixtures alongside the
Discipline ones in the same file also means a future change to `updRulesSummary()` or `getPool()` gets
tested against both categories in one run, not two separately-maintained files that could drift apart.

### References

- [Source: public/js/game/char-pools.js:203-228] — the shared Discipline/Rite/Devotion/Pact tile
  loop, read in full for this story's own rescoping trace.
- [Source: public/js/shared/pools.js:29-77] — `getPool()`, re-read for this story; the
  `devotion-<slug>` lookup fallback at line 34.
- [Source: public/js/suite/roll-v2.js:257-291] — `updRulesSummary()`, rcv.3a's own already-shipped,
  already-reviewed code; confirmed category-agnostic by inspection.
- [Source: public/js/suite/sheet-helpers.js:129-147] — `fmtRuleStats()`, the Sheet tab's own existing
  silent-skip-missing-field precedent this story's rescoping cites.
- [Source: specs/stories/rcv-3a-rules-explanation-disciplines-rites.md] — rcv.3a's own story, Dev
  Agent Record and Senior Developer Review; this story extends its test coverage, changes none of its
  code.
- [Source: specs/epic-rcv-roller-convergence.md] — rcv.3b's own original epic-doc framing, corrected
  by Task 4.

## Dev Agent Record

### Agent Model Used

Claude Opus (orchestrator, inline — no subagent delegation; task was small and fully specified after
the story's own rescoping investigation)

### Completion Notes List

- Task 1: appended two Devotion-category `SEEDED_RULES` fixtures to `tests/rcv-3a-rules-explanation-
  box.spec.js` (`devotion-rcv3b-quiet-ledger` with no `duration`, `devotion-rcv3b-borrowed-face` with
  real `rules_text`), keyed with the `devotion-` prefix specifically so `getPool()`'s third lookup
  fallback (`shared/pools.js:34`) is the one that actually resolves them — a same-shaped fixture
  wearing a `category: 'devotion'` label without that prefix would NOT have exercised the real lookup
  path. Added both as `{ name, category: 'devotion' }` entries to `RICH_CHAR.powers`, matching
  `char-pools.js:215-216`'s real consumption shape (a Devotion tile comes from `char.powers`, not
  discipline dots).
- Task 2: ran the two new tests (plus the full existing suite, to catch any accidental interaction
  with the fixture additions) — **15/15 passed, unmodified, on the first run.** The story's own traced
  hypothesis held: a Devotion tile with a missing `duration` degrades silently, exactly like a
  Discipline; the shared `renderRulesExpander()` expander works identically for a Devotion's
  `rules_text`.
- Task 3: **not needed** — Task 2's tests passed without any source change, so no fix was required to
  define scope for.
- Task 4: `specs/epic-rcv-roller-convergence.md`'s own rcv.3b section and `sprint-status.yaml`'s row
  both updated with the rescoping finding and its evidence trail (this story's own "Rescoped
  2026-08-30" section).

### File List

- `tests/rcv-3a-rules-explanation-box.spec.js` — modified (2 new `SEEDED_RULES` fixtures, 2 new
  `RICH_CHAR.powers` entries, 2 new tests; the file's own test count is now 15, up from rcv.3a's own
  13). No other file touched.

## Senior Developer Review (self, inline — single-layer, proportionate to a test-only, zero-source-diff change)

**Reviewed:** 2026-08-30. Full 3-layer adversarial review judged disproportionate for this change per
this project's own "match review weight to stakes" convention (`codex-review` skill) — zero source
files changed, the change is two self-contained test fixtures plus two assertions, and the story's
own Task 2 gate (does the hypothesis hold against real code) already ran as part of implementation,
not as a separate review step bolted on after.

### Self-check

- Confirmed via `git status --short` that `tests/rcv-3a-rules-explanation-box.spec.js` is the ONLY
  file this story touched — no accidental edit to `char-pools.js`, `roll-v2.js`, `shared/pools.js`, or
  any other rcv.1/rcv.2/rcv.3a file already dirty in the working tree.
- Re-read both new fixtures against `getPool()`'s real lookup order (`shared/pools.js:29-36`) to
  confirm the `devotion-` key prefix genuinely reaches the third fallback branch, not the first
  (bare-slug) or second (`rite-`) one by coincidence — the slug of `'Rcv3b Quiet Ledger'` is
  `rcv3b-quiet-ledger`, which does not collide with either of the other two `getRuleByKey()` calls
  `getPool()` tries first, so the `devotion-` prefixed key is genuinely the one that resolves it.
- Re-ran the full spec (15/15) after the additions rather than trusting the isolated 2-test run alone
  — confirms no interaction between the new Devotion fixtures and the existing Discipline ones (e.g.
  no accidental duplicate `key` value, no `RICH_CHAR.powers` shape mismatch breaking an unrelated
  test).
- Checked AC1/AC2 against the story's own literal wording: AC1 asks for "no 'N/A'/'not specified'
  placeholder and no extra empty bullet" — the test asserts `toHaveCount(1)` on `.power-meta span`
  (action only), which fails if an empty duration bullet were ever rendered. AC2 asks the expander to
  render "exactly as it already does for a Discipline" — the assertions mirror rcv.3a's own "power
  with rules_text" test structure exactly, same locators, same toggle-and-read pattern.
- Checked "What this story is NOT": confirmed no fallback UI text was added anywhere, confirmed no
  change to `char-pools.js`/`roll-v2.js`/`shared/pools.js`/`suite.css`, confirmed no duration-coverage
  percentage was re-measured or asserted on.

No findings. Story closed `done`.

### Outcome

Story status: `done`. Zero source changes; the epic's own original premise (a Devotion-specific
fallback was needed) is now recorded as investigated and not upheld, with a regression test proving
it rather than a comment asserting it. NOT committed, NOT pushed, NOT merged — this epic commits once
at close, not per-story.
