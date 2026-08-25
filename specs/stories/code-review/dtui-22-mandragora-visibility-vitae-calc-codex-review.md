# Adversarial review - dtui-22 (Blood Sorcery: Mandragora Garden checkbox visibility + Vitae Projection calc), TM Game

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
   `specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-codex-findings.md`, before you
   open anything the next pass allows. Do not revise an earlier pass's findings in light of what a
   later pass taught you - if a later pass contradicts an earlier one, say so as a new finding and
   leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game\.claude\worktrees\agent-aff9c9da907a0e3af`. The diff is at
  `specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-diff.txt` and is relative to
  that root, taken against base commit `12543b35` (the merge commit for dtui-20, current tip of
  `origin/main` at the time this story's branch was cut).
- The diff is **deliberately scoped to source and tooling only** (`public/js/**`, `tests/**`).
  Story-spec and tracking edits (`specs/stories/dtui-22-mandragora-visibility-vitae-calc.story.md`,
  `specs/stories/sprint-status.yaml`) are excluded from it on purpose, so the earlier passes stay
  genuinely blind to the author's own account. Do not treat their absence as an omission or go
  hunting for them during Pass 1/2.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This is a git worktree inside a larger umbrella
  workspace (`D:\Terra Mortis\`) with sibling repos (`TM Story`, `TM Herald`, `TM Admin`, `TM Design
  System`) alongside `TM Game` - do not read or touch anything outside this worktree.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: this is a Playwright-driven client-side change. The dev server binds port
  8080 (`playwright.config.js`); confirm the port is free before starting your own run (`netstat -ano
  | grep :8080` on Windows/Git-Bash, or equivalent) - a stray squatter process on this same machine
  from another session has caused false failures before ("TM Admin dev server on 8080" is a known,
  previously-documented gotcha in this repo). If you hit that, disclose it rather than silently
  reporting a failure as a code defect. Chromium is pre-installed
  (`npx playwright install chromium` if not). Server-side `vitest` is NOT runnable in this worktree -
  `server/node_modules` was never installed here (confirmed: `npm test` from `server/` fails with
  `ERR_MODULE_NOT_FOUND` for `vitest` itself, not a test failure) - do not attempt it; this is a
  known, disclosed environment gap, not something to work around by installing packages.
- **Blast radius note**: `effectiveDomainDots()`/`meritEffectiveRating()` (the helper this diff's gate
  now routes through) is a shared, heavily-used helper across the whole app (editor sheet, domain
  merits, Haven, Herd, etc.) - but this diff does NOT modify that helper, only calls it from a new
  call site inside `renderSorcerySection()`. Confirm the diff really is call-site-only and touches no
  shared helper, since a mistake in the shared helper itself would silently break every OTHER
  consumer too, not just Mandragora Garden.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `npx playwright test
  tests/dtui-22-mandragora-vitae-projection.spec.js --workers=1`, `npx playwright test
  tests/dt-vitae-projection.spec.js --workers=1`, `npx playwright test
  tests/dt-form-37-sorcery-targets-stringify.spec.js --workers=1`. Report the real numbers even if
  they disagree with anything the story claims - especially then. Note: `dt-vitae-projection.spec.js`
  has 3 pre-existing failures (a legacy `.dt-feed-rote-section`/`button[data-feed-rote]` UI pattern
  that no longer exists in this codebase, per `downtime-form.js`'s own "dt-form.22: ROTE block removed
  from the feeding section" comment) - confirmed via `git stash` A/B against this diff during dev; the
  other 10 tests in that file (including its own pre-existing Mandragora Blood Fruit test) are
  expected to stay green. Confirm this A/B claim yourself rather than trusting it.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at
`specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-diff.txt` and **nothing else**.
No spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A gating-logic fix in a Vampire: The Requiem character-management app's downtime form
(`public/js/tabs/downtime-form.js`). `renderSorcerySection()`'s `hasMandragora` flag - which gates
whether a "Park in Mandragora Garden" checkbox, a "+3 dice" notice, and a garden-capacity display
render at all - is changed from a merit-name-possession check (`(currentChar.merits || []).some(m =>
m.name === 'Mandragora Garden')`) to an effective-rating check
(`effectiveDomainDots(currentChar, 'Mandragora Garden') >= 1`), reusing the same computed dots value
for `mandragoraCap` instead of recomputing it. A second, unrelated hunk adds only an explanatory
comment (no logic change) above a pre-existing `mandDots = effectiveDomainDots(c, 'Mandragora
Garden')` line elsewhere in the same file's Vitae Projection rendering. A new Playwright spec file
(`tests/dtui-22-mandragora-vitae-projection.spec.js`) adds 5 tests covering both the checkbox
visibility gate and a cross-check against the Vitae Projection panel's own Mandragora-derived figure.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The `mandragoraCap` simplification** - the diff replaces `hasMandragora ?
   effectiveDomainDots(currentChar, 'Mandragora Garden') : 0` with a bare reuse of a
   `mandragoraDots` variable computed earlier in the function. Confirm this is a genuinely safe
   refactor: does `mandragoraDots` get reassigned, shadowed, or fall out of scope anywhere between its
   definition and this use? Confirm the two expressions are truly equivalent for every value of
   `mandragoraDots` (not just the >= 1 case) - in particular, what does the OLD expression evaluate to
   when `hasMandragora` was true but `effectiveDomainDots` returns something the new inline gate
   wouldn't have gated on the same way (e.g. a decimal, a negative number, `NaN`)?
2. **Comment-vs-code drift** - the new comment block above `renderSorcerySection()` claims "This is
   the same effectiveDomainDots() helper the Vitae Projection container below already uses for the
   Blood Fruit contribution line (FR6), so both surfaces now read Mandragora Garden through one
   identical calculation." Verify this claim is actually true by inspecting the diff itself: is the
   argument list (character reference, merit name string) truly identical between the two call sites,
   or only superficially similar (e.g. different variable name for the character, different casing on
   the merit-name string)?
3. **Silent behaviour change beyond the stated one** - the diff's own comment claims the ONLY
   behavioural change is the `hasMandragora` gate shape. Walk every place `hasMandragora` is read
   inside `renderSorcerySection()` in the diff context and confirm none of them were ALSO changed in a
   way that isn't just "inherits the new gate value" - i.e. is there a second, independent behavioural
   change smuggled into the same hunk?
4. **The new test file's assertion strength** - for each of the 5 new tests, is there any assertion
   whose PASS condition is trivially satisfiable (e.g. a locator that silently matches zero elements
   and a `.not.toContainText(...)` that would pass identically whether the feature works OR the whole
   section failed to render at all)? In particular scrutinise the `toHaveCount(0)`/`toHaveCount(1)`
   assertions and whether a totally broken render (e.g. a JS exception during
   `renderSorcerySection()`) would make an "absent" assertion pass for the wrong reason.
5. **Error paths and edge inputs in the test fixtures** - the new spec's `buildChar()` sets
   `merits: []` for the "no merit" case and `merits: [{ category: 'domain', name: 'Mandragora
   Garden', cp: 0, xp: 0 }]` for the "0 effective dots" case. Does the diff's own new code path handle
   a merit object missing fields entirely (no `cp`, no `xp`) the same way, or could a real
   production character document (rather than this test's deliberately full-but-zeroed fixture)
   produce a different, untested code path?
6. **Dead code / unreachable branches** - with `mandragoraCap` now unconditionally equal to
   `mandragoraDots`, is there any remaining code elsewhere in the diff (or visible in the diff's
   context lines) that still branches on `hasMandragora` in a way that is now redundant or
   unreachable given `mandragoraDots >= 1 <=> hasMandragora`?
7. **Self-contradiction within the diff** - does any comment in the diff claim something the code two
   lines below it does NOT actually do?

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game\.claude\worktrees\agent-aff9c9da907a0e3af`.
Read whatever surrounding code you need to understand what this change is actually plugging into. You
still do **not** have the story spec or any account of the author's intent - work from the code
itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Additionally: `effectiveDomainDots()` is defined at
`public/js/tabs/downtime-form.js` (search for `function effectiveDomainDots`) and delegates to
`meritEffectiveRating()` in `public/js/editor/domain.js` for most merit types, with special-casing
for `'Safe Place'`/`'Feeding Grounds'` (multi-instance summing). Mandragora Garden is in this file's
`CAP_DOMAIN` set alongside `'Haven'`, meaning its effective rating can be capped by an attached
anchor (Safe Place or Necropolis Sepulcher).

### What to hunt for

1. **Trace `effectiveDomainDots(c, 'Mandragora Garden')` by hand** for these exact input shapes and
   confirm the returned number against what the diff's new gate (`>= 1`) would then do:
   - No `Mandragora Garden` entry in `c.merits` at all.
   - An entry with `cp: 2, xp: 0`, no `attached_to` set (unattached anchor).
   - An entry with `cp: 0, xp: 0` (present, zero dots).
   - An entry with negative or suspended dots (`applySuspensionTo` - read what this does and whether
     a suspended Mandragora Garden merit could produce a negative `mandragoraDots`, and if so what
     `mandragoraDots >= 1` and any code that assumes `mandragoraCap >= 0` elsewhere in
     `renderSorcerySection()` do with a negative capacity).
   For the unattached-anchor case specifically: does `meritEffectiveRating()`'s `CAP_DOMAIN` branch
   actually reduce the effective rating to reflect "no anchor", or does its own arithmetic (look at
   the `cap || stored` expression, if present, or equivalent) end up NOT zeroing it despite a 0 cap?
   State plainly what the real, traced value is - do not assume the UI's own warning text elsewhere in
   the app ("contributes 0 dots until linked", if you find such a string in `sheet.js`) reflects what
   this helper actually returns.
2. **Multi-instance vs singleton handling** - `effectiveDomainDots()` special-cases `'Safe Place'` and
   `'Feeding Grounds'` as multi-instance (summed across every matching merit entry) but treats
   everything else, including `'Mandragora Garden'`, as a single `.find()` lookup. Confirm: can a real
   character have MORE THAN ONE `Mandragora Garden` merit entry in `c.merits` (e.g. via a data-import
   artefact, a duplicate-add bug elsewhere, or a legitimate multi-instance use the game rules allow)?
   If so, what does `.find()` silently do (picks the first match, ignores the rest) and is that
   the same behaviour the OLD `hasMandragora` (`.some()`, which would have detected ANY matching
   entry) had for this same multi-entry scenario? Is there a divergence?
3. **State mutated by one render leaking into a later render** - `renderSorcerySection(saved)` is
   called on every re-render of the Blood Sorcery section (e.g. after a rite selection, a checkbox
   toggle). Confirm `mandragoraDots`/`hasMandragora`/`mandragoraCap` are all recomputed fresh on every
   call (no caching, no module-level mutable state) so a garden's dots changing between renders (e.g.
   an ST mod applied mid-session, if that's even reachable within a single form session) is picked up
   correctly, or state elsewhere (`saved`, `currentChar`) leaks a stale value.
4. **What happens when the checkbox transitions from visible to hidden mid-session** - if a
   character's effective Mandragora dots somehow drop from 1 to 0 between renders (e.g. the ST edits
   the character while the player has the form open, or a bonus channel is revoked), and a rite slot
   ALREADY has `sorcery_N_mandragora: 'yes'` saved from before the drop, what does the new gate do to
   that already-parked state? Read `mgLocked`/`mandSaved`'s interaction with the now-invisible
   checkbox and confirm no orphaned "parked" state becomes unrepresentable or silently lost on the
   next save (`collectResponses()`'s own `sorcery_N_mandragora` handling - grep for it in the full
   repo, not just the diff).
5. **The two new-comment cross-reference claim (FR6)** - read the FULL Vitae Projection container
   function this diff's second hunk sits inside (find `mandDots = effectiveDomainDots` in
   `downtime-form.js` and read at least 40 lines around it). Confirm the Blood Fruit contribution line
   this `mandDots` value feeds into is genuinely independent of the "Park in Mandragora Garden"
   checkbox's own saved state (`sorcery_N_mandragora`) - i.e. confirm Blood Fruit production really is
   unconditional on any specific rite being parked, as the diff's comment implies, by reading the
   actual code around it rather than trusting the comment.
6. **Fixture-vs-real-consumer shape** - compare the new test file's `merits: [{ category: 'domain',
   name: 'Mandragora Garden', cp: 2, xp: 0 }]` fixture shape against how a real character document
   from this app actually shapes a domain merit entry (check `schemas/schema_v2_proposal.md` or a
   real fixture elsewhere in `tests/` or `public/js/dev-fixtures.js` for a `Mandragora Garden` or
   similar domain-merit entry). Are there fields a real entry always carries that this test's fixture
   omits, and could their absence make the test pass in a way a real character wouldn't?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dtui-22-mandragora-visibility-vitae-calc.story.md` - the **Story**,
   **Acceptance Criteria**, and **Context**/**Implementation Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" or "Senior Developer Review" sections yet.** Skip past them
   entirely (they are near the end of the file). Reading the author's own record first anchors you on
   their framing and turns a review into grading homework.
3. Against the five acceptance criteria (AC1-AC5), check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative.
   - Deviations from stated intent. **The "Out of scope" section is equally load-bearing** - check
     the change did not quietly do an excluded thing (in particular: does the diff touch
     `public/js/editor/domain.js`'s `meritEffectiveRating()` itself anywhere, which the story
     explicitly says it investigated but deliberately did NOT touch?).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:**
- Fixing the separate, pre-existing inconsistency the story documents in `domain.js`'s
  `meritEffectiveRating()` (the unattached-anchor cap-zero case allegedly not actually zeroing the
  effective rating) - the story explicitly investigated this, decided it's a cross-cutting helper
  shared with Haven and out of scope for a Wave-4 form-section story, and flagged it in the story's
  own "Out of scope" section rather than fixing it. Your own Pass 2 finding #1 above may have
  independently confirmed or contradicted this claim - if you found the same thing, note it as
  confirmation rather than a new gap; if you found something different, flag the discrepancy.
- Re-coupling Blood Fruit production to the "Park in Mandragora Garden" checkbox's own saved state -
  the story documents this was deliberately decoupled by an earlier, unrelated story (dtlt-10,
  2026-08-18) and treats FR6's own AC wording ("Given the checkbox is checked...") as stale against
  that ruling. This is a deliberate non-fix, not a gap.
- The ST-side mirrored Mandragora calculation in `public/js/admin/downtime-views.js` (a different,
  simpler `(rating||dots||0)+(bonus||0)` formula used for the ST's own rite-processing view) - the
  story's own scope is the player-facing downtime form only.
- dtui-21 (Personal Story NPC chips) and dtui-23 (Feeding territory relocation) - concurrent/adjacent
  Wave 4 stories this session, explicitly out of this diff's scope.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - That `mandDots = effectiveDomainDots(c, 'Mandragora Garden')` (Vitae Projection container) was
     ALREADY correct before this story touched anything, and only a comment was added there.
   - That the `hasMandragora`/`mandragoraCap` change in `renderSorcerySection()` is the ONLY
     behavioural change in the diff.
   - The specific claim that grepping the whole `public/js` tree (including `public/js/suite/roll-v2.js`)
     found NO code path resembling "the feeding roll" with any Mandragora interaction.
   - The 5/5 new-test pass claim, and the "both pre-existing adjacent suites (`dt-vitae-projection.spec.js`,
     `dt-form-37-sorcery-targets-stringify.spec.js`) still pass" claim - with the specific caveat that
     `dt-vitae-projection.spec.js` has 3 KNOWN pre-existing failures (unrelated legacy Rote-toggle UI
     that no longer exists in the codebase), confirmed via a `git stash` A/B the author ran during dev.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now:
   `npx playwright test tests/dtui-22-mandragora-vitae-projection.spec.js --workers=1`, `npx
   playwright test tests/dt-vitae-projection.spec.js --workers=1`, `npx playwright test
   tests/dt-form-37-sorcery-targets-stringify.spec.js --workers=1`. Grep the files yourself for the
   "feeding roll" claim and the `mandDots`/comment claims. If a first run is inconsistent, run it
   twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`,
`[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than
dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the three Playwright gate commands above.
- **Anything you could not run, and why.** Name it specifically (e.g. server-side `vitest` - disclosed
  above as not runnable in this worktree).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
