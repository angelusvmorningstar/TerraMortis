# Adversarial review - rcv.3a (Rules-explanation box, Discipline/Rite/Devotion/Pact pools), Terra Mortis TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/rcv-3a-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/rcv-3a-diff.txt`
  and is relative to that root, taken against base commit `dfefb490`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo sits inside a larger umbrella workspace
  (`D:\Terra Mortis\`) with three sibling repos (`TM Story`, `TM Admin`, `TM Herald`) and a
  `TM Design System` repo - do not read or touch anything outside `D:\Terra Mortis\TM Game` even to
  verify something, this review is scoped to this repo alone.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- The working tree also carries OTHER, unrelated in-progress stories' own uncommitted changes
  (`public/js/game/char-pools.js`, several test files, some new spec/scratchpad files) - these are
  deliberately NOT part of this diff and NOT this review's concern. Do not flag them, do not diff
  against them, ignore anything outside the 5 files this diff actually touches.
- This machine may have a Playwright dev server already bound to port 8080 from a previous run
  (`npx playwright test` uses `reuseExistingServer: true`) - if a Playwright run behaves oddly or
  seems to be serving stale content, say so explicitly rather than silently trusting the result.
- **Blast radius note:** `public/js/suite/roll-v2.js`'s `loadPool()`/`updPool()`/`resetRollPool()` and
  `public/js/suite/sheet-helpers.js` are shared infrastructure used far beyond this one story
  (`loadPool` is called from every pool tile across the whole Roll tab; `sheet-helpers.js` backs the
  character Sheet tab). A mistake in either is not scoped to "the new rules box" - it can silently
  affect every other pool type, or every Sheet-tab render.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `npx playwright test
  tests/rcv-3a-rules-explanation-box.spec.js tests/rlv-4-custom-pool-builder.spec.js
  tests/rlv-2-single-roller-retirement.spec.js tests/rcv-2-three-independent-accordions.spec.js` and
  `cd server && npx vitest run` for any suite that imports `roll-v2.js`, `sheet-helpers.js`, or
  `rules-text.js` (grep to find them). Report the real numbers even if they disagree with anything
  the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/rcv-3a-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new "Rules explanation" collapsible box on a dice-roller Roll tab, showing a power's cost/action/
duration/description plus an optional full-rules-text expander, for whichever pool is currently
loaded. It touches: `public/index.html` (a new static `<details>` block), `public/js/suite/roll-v2.js`
(a new exported `updRulesSummary(pi)` function, two new imports, two new call sites), `public/css/
suite.css` (new CSS rules for the box), `public/js/suite/sheet-helpers.js` (a guard added around two
existing `window.X = ...` assignments), and a new Playwright spec file.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `updRulesSummary(pi)` in `roll-v2.js`: read its gate condition exactly
   (`pi && (pi.effect || pi.action || pi.duration || pi.cost)` or similar). Is there any `pi` shape
   reachable from this file's own existing pool-loading call sites that would slip past this gate
   incorrectly - either a pool with none of these fields still showing the box (a false positive), or
   a pool that SHOULD show something being hidden because the gate checks the wrong field name?
2. The function reads and clears specific DOM elements by id (`document.getElementById(...)`). If ANY
   of those ids do not exist in the DOM at call time (e.g. called before `index.html`'s markup is
   parsed, or on a page/tab where this markup was never mounted), does the function throw
   (`.style` on `null`), or does it degrade gracefully? Trace every `getElementById` call in the new
   function and confirm each one's result is null-checked before use, or justify why it cannot be
   null.
3. `esc()` usage: is every piece of untrusted/rule-doc-sourced text (`pi.effect`, `pi.action`,
   `pi.duration`, any cost-format output) actually escaped before being placed into
   `.innerHTML =`, or does any field go in raw? A rule doc's `description`/`action`/`duration` field
   is server/DB-sourced content, not attacker input in the classic sense, but this codebase's own
   convention (visible elsewhere in the diff, e.g. `renderRulesExpander`'s own `esc()`-first
   contract) treats it as needing escaping regardless - check the new code holds the same line
   consistently, not selectively.
4. The `sheet-helpers.js` change: it wraps two `window.X = ...` assignments in a
   `typeof window !== 'undefined'` guard. Read the full diff hunk. Does this change silently alter
   behaviour in the ONE environment where `window` genuinely IS defined (a real browser) - i.e. is the
   guard purely additive (no-op in a real browser, only changes behaviour in a Node/SSR/test
   environment), or could the guard's placement change *when* the assignment happens relative to
   something else in the same file that a real browser load order depends on?
5. Self-contradiction within the diff: does any comment in the diff claim something the surrounding
   code doesn't actually do (e.g. a comment claiming a value is escaped when the line below doesn't
   escape it; a comment claiming a function is "called once" when a second call site exists elsewhere
   in the same diff)?
6. Dead code / unused imports: are both new imports into `roll-v2.js` actually used, and used exactly
   the number of times the diff's own call-site count would suggest?
7. The new CSS rules: any rule with a selector that could accidentally match/override styling
   elsewhere in `suite.css` outside this new component (check for an unscoped or very generic
   selector, e.g. a bare class name likely to exist elsewhere in a 3000+ line stylesheet).
8. The new Playwright spec: any assertion whose PASS condition is trivially satisfiable (a locator
   that silently matches zero elements and still "passes", a `toBeVisible({timeout: X})` on something
   that would also pass if the feature were entirely absent, a count check that would pass at 0).

**STOP. Write your Pass 1 findings to `specs/stories/code-review/rcv-3a-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same as Pass 1's summary above.

### What to hunt for

1. Read `public/js/suite/roll-v2.js`'s `loadPool(total, name, pi)` in full (the function this diff
   adds a call into). Walk EVERY call site of `loadPool()` across the whole codebase (grep for
   `loadPool(`) - not just the discipline-pool path the author had in mind. For each distinct call
   site (skill tiles, Custom Pool builder, Vampire Mechanics tiles, combat quick-roll, anything else),
   hand-trace what `pi` shape it actually passes and confirm `updRulesSummary(pi)` behaves correctly
   (shows/hides as intended) for every one of them, not just the discipline-power case.
2. Read `public/js/shared/pools.js`'s `getPool(char, raw)` in full - the function that actually builds
   the `pi` object this new code reads `effect`/`action`/`duration`/`cost`/`rules_text`/`rules_source`
   from. Confirm each of those fields' possible values (present-and-truthy, present-and-empty-string,
   `null`, `undefined`) against how the new gate/render logic in `roll-v2.js` treats each case -
   specifically, does an empty string (`''`) behave the same as `null`/`undefined` everywhere it needs
   to, or could an empty-string field slip past a truthiness check differently than a missing one in a
   way that produces a visibly broken (not just imperfect) render?
3. Read `public/js/shared/rules-text.js`'s `renderRulesExpander`/`renderRulesText`/`toggleRulesText`
   in full. It maintains toggle state by DOM id (`rules-body-<id>`). The new code in `roll-v2.js`
   calls it with a FIXED id string (not unique per power). Trace what happens across a sequence of
   loads: load Power A (rules-text expander opened by the user), then load Power B (different power,
   different rules_text, SAME fixed id). Does Power B's expander correctly start closed, or could the
   fixed id cause any stale-state leak from A into B - e.g. the toggle button's own `.open` CSS class
   surviving across the innerHTML replacement in a way that visually desyncs from the actual
   `.visible` state of the new body?
4. Read whichever function in the codebase resets pool state on a character switch (`resetRollPool()`
   or equivalent - grep for it) in full. The diff appears to call `updRulesSummary` from there too.
   Confirm: does this new call correctly run BEFORE or AFTER whatever else that function clears, such
   that no stale rules-box content can flash or persist between the old character's last-loaded power
   and the new character having nothing loaded yet?
5. Read `public/js/suite/sheet-helpers.js` in full, not just the diffed hunk - what OTHER module-scope
   code runs in this file, and does importing it from `roll-v2.js` (a NEW cross-import that didn't
   exist before this diff) pull in any other side-effecting module-level code beyond the two
   `window.X = ...` assignments the diff touches? Check the very top of the file for other
   module-level statements.
6. Malformed/absent input: what does `updRulesSummary` do if called with `pi` being an object that
   HAS `effect`/`action`/etc as non-string types (a number, an array, a nested object) - realistic if
   any upstream rule-doc field was ever hand-edited incorrectly via an admin tool. Does `esc()`
   coerce safely, or could this throw / render `[object Object]` silently?
7. CSS cascade: read the full new `.rules-summary`/`.power-*` rule block plus roughly 30 lines above
   and below where it was inserted in `suite.css`. Confirm no existing rule elsewhere in the file
   already targets one of these exact class names with different properties (a genuine collision, not
   just a similar name) that would silently override or be overridden depending on source order.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/rcv-3a-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/rcv-3a-rules-explanation-disciplines-rites.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely if present. Reading the author's own record first anchors you on their framing and turns
   a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (specifically: does the box ever appear
     for a plain Skill, Custom Pool, or Vampire Mechanics tile? Does anything resembling a "duration
     not specified" fallback text appear anywhere, which this story explicitly reserves for a LATER
     story to decide?).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: a Rules-explanation box for
plain Skills; a Devotion-specific "duration not specified" fallback (that is a later story, rcv.3b);
Special/Vampire Mechanics tile rules copy (a later story, rcv.3c); any change to `getPool()`,
`char-pools.js`, or any pool's `pi` shape/`onTap` routing; a precise re-measurement of exactly how
many discipline/rite rule docs currently have `rules_text` populated (the design intentionally does
not depend on that number).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full, if the story file has one. It may make specific,
   checkable claims such as: exact test pass counts ("10/10 new", "28/28 including regression"); a
   specific existing cost-formatter function it claims to have found and reused rather than
   reinvented; specific line-number claims about where things live in `roll-v2.js`/`pools.js`; a claim
   that a particular CSS/layout fix was necessary and what the root cause was; a claim that a
   `sheet-helpers.js` change was necessary to avoid breaking Node-environment vitest suites.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run
   the drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and
   say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/rcv-3a-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the Playwright and vitest gate commands
  named in the Honesty requirements above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
