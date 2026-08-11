# Story issue-1128: Oversized merit dots in six edit-mode rows (the `trait-dots` wrapper)

Status: done

> **What broke.** OATH-B (#1111) introduced `shDotsSuspended` (`public/js/editor/sheet.js:212`) so
> every merit-dot display funnels its suspended count through one function. Correct instinct, but
> the function delegates to `shDotsMixed` (`:225`), which wraps its output in
> `<span class="trait-dots">`. Six call sites that previously emitted bare `'●'.repeat(n)`
> glyphs silently inherited that wrapper and its full-size trait-row styling
> (`font-size:15px; letter-spacing:2.5px`, `components.css:838`). The dot **counts** are correct
> everywhere. Only presentation broke.
>
> **Blast radius.** Every character, in edit mode, with no oath data required. `.infl-dots-derived`
> is a fixed 60px column, so five dots at 15px with 2.5px tracking overflow or wrap.
>
> **Release blocker.** 40 commits of oath and collective-merit work are queued on `dev` behind
> this. Urgency does not license shortcuts: the exact prior mistake was a review that asserted
> glyph *counts* and never diffed the *rendered HTML* against `main`, which is why this story
> makes that diff an acceptance criterion rather than a review habit.
>
> **This branch is deliberately based on `dev`, not `main`.** That is not a violation of the
> branching convention, it is the only correct base here: the defect exists only in `dev`'s
> unreleased code (introduced by #1111, which has never been on `main`), so a `main`-based branch
> would have nothing to fix. Branch: `ms/issue-1128-oversized-merit-dots`. PR targets `dev`.

## Story

As a Storyteller opening any character in the admin sheet's edit mode,
I want merit dots in the influence, Contacts, domain "My dots:", standing and general rows to
render at their own container's size and colour again,
so that the dot columns stop overflowing their layout, and the `dev` release can proceed with a
recorded before/after render diff instead of a count-only sweep.

## Why this story exists

`shDotsSuspended` is a good seam: one place decides how a suspension looks. The regression is that
the seam also carries a *presentation wrapper* that only some of its callers want. Twelve call
sites now route through it. Six of them sit inside small-type containers that style their own
dots; those six regressed. Six sit inside `.trait-right` / `.dom-total-lbl`, which were already
`.trait-dots`-sized before #1111; those six are correct and unchanged.

The process gap is specific and worth naming. OATH-B's AC7 ran a renderer x mode correctness sweep
and asserted rendered output, but it asserted it by counting `●` and `○` characters in the
output string. A wrapper change is invisible to a glyph count. The QA gate (Ma'at, PASS) used the
same method and recorded that four of the combinations could not be isolated by glyph count at all.
So the coverage that existed was real but structurally blind to exactly this class of defect. This
story closes that blind spot with assertions over the *container contents*, not the glyph tally,
and with a call-site census that fails when a thirteenth site appears.

## Acceptance Criteria

1. **The six broken sites emit bare glyphs again.** For a character with **no** `sworn_by` /
   oath data, the rendered content of each dot container listed below is byte-identical to what
   `origin/main` produces for the same character and same merit values, i.e. exactly
   `'●'.repeat(purchased) + '○'.repeat(bonus)` with no element wrapper of any kind:

   | site (this branch) | container | `main` counterpart |
   |---|---|---|
   | `sheet.js:979`  | `<span class="infl-dots-derived">` (influence edit row)   | `main:923`  |
   | `sheet.js:1000` | `<div class="contacts-edit-hdr">` (Contacts edit header)  | `main:944`  |
   | `sheet.js:1265` | `<span class="dom-contrib-lbl">` (domain edit "My dots:") | `main:1182` |
   | `sheet.js:1724` | `<span class="infl-dots-derived">` (standing edit row)     | `main:1588` |
   | `sheet.js:2044` | `<span class="infl-dots-derived">` (general granted row)   | `main:1783` |
   | `sheet.js:2059` | `<span class="infl-dots-derived">` (general edit row)      | `main:1798` |

   Byte-identity is asserted over the **dot container's contents**, not over the whole row.
   Whole-row identity is impossible and must not be attempted: `:2044` and `:2059` legitimately
   gained `_pledgeBadge(m) + _oathPledgeNote(m)` from OATH-A/B, and the domain compound branch was
   generalised by COLLECTIVE-2 (#1110). Those are features, not regressions.

2. **Suspension still reaches all six rows.** For a character with a broken oath suspending N dots
   on a merit rendered by each of the six sites, the solid (`●`) band in that container is
   `max(0, purchased - N)` and the hollow (`○`) band is unchanged. The suspension arithmetic
   must remain in **one** place; two copies of `Math.max(0, purchased - n)` is a regression of
   OATH-B's whole design and fails this AC.

3. **The domain table's two adjacent branches agree.** In `shRenderDomainMerits` edit mode, the
   compound-target branch (`sheet.js:1263`, which already emits a bare `'●'.repeat(_cmpOwn)`)
   and the normal branch (`sheet.js:1265`) render their `.dom-contrib-lbl` "My dots:" content at the
   same size and colour, i.e. both bare. *(The issue cites this sibling as `:1260`; the correct line
   on this branch is `:1263`. `:1260` is inside the `_grantTag843` ternary.)*

4. **`.infl-dots-derived` fits.** With five effective dots, the content of the 60px
   `.infl-dots-derived` column (`components.css:344`, `padding:0 4px`) does not overflow or wrap.
   The bar is `main`'s baseline: no wider than what `main` renders for the same five dots.

5. **All twelve call sites are accounted for, by name.** A committed test enumerates every
   `shDotsSuspended` call site in `sheet.js` and asserts the exact census: **12** sites today, split
   into the two buckets in Dev Notes below. The issue's own table listed only 11 and never named
   `:2079`. If a thirteenth appears, or a site moves bucket, the test fails rather than the site
   falling through unnoticed. The assertion must be over the census itself (count plus per-site
   classification), not a spot-check of six lines.

6. **No new CSS.** The fix introduces no new selector, no new token, no inline `style=`, no bare
   hex or `rgba()`. If the implementation finds it cannot satisfy AC1 without a CSS rule, it halts
   and asks rather than adding one. (See Dev Notes for why route (a) is specced and route (b) is
   rejected.)

7. **The six correct sites are untouched.** `sheet.js:1024`, `:1050`, `:1212`, `:1552`, `:1733`,
   `:2079` render exactly as they do now, byte for byte. `.dom-total-lbl` continues to contain a
   `.trait-dots` span, as it does on `main` too (`main:1107`, `_totalDots = shDotsMixed(...)`); that
   is pre-existing and explicitly not this story's business.

8. **A recorded before/after render diff.** The implementation records, in the PR or the story's
   dev record, the actual diff of the six containers' contents rendered from `origin/main`'s
   `sheet.js` versus the fixed `sheet.js`, for one representative no-oath character. This is the
   check AC7 of OATH-B did not perform. It is a deliverable, not a habit.

9. **Targeted tests green.** `cd server && npm run test` limited to the changed area: the new suite
   plus `oath-b-suspension.test.js`, `oath-a-render-and-gate.test.js`,
   `n7a-necro-domain-render.test.js`, `stm-polish-408-dots.test.js`. No full-suite run required, and
   never pipe the run through `tail` (it masks the exit code).

## What this story is NOT

- **Not** the two other latent oath gaps found in the same review: `app.js` missing the oath window
  handlers, and the pledged-dot edit gate covering 1 of 7 merit write paths. Both are known,
  neither blocks this issue, both are separate work.
- **Not** a broader review or rework of OATH-B (#1111). The suspension model, the
  dots-vanish-from-the-solid-band ruling, and the `_suspended_dots` transient field all stand.
- **Not** a change to the six already-correct call sites, nor to `.trait-dots` itself, nor to
  `.dom-total-lbl`'s pre-existing full-size dots.
- **Not** a change to any dot *count*, effective-rating calculation, or persisted field. Nothing is
  written; this is a read-path presentation fix only.
- **Not** a CSS refactor. `components.css` should ideally not change at all.

## Tasks / Subtasks

- [x] **T1 (AC5).** Enumerate every `shDotsSuspended(` call site in `public/js/editor/sheet.js` from
      the current source and confirm the census is 12 and the bucket split matches Dev Notes. If it
      does not, stop and report before changing code.
- [x] **T2 (AC8, baseline).** Extract `git show origin/main:public/js/editor/sheet.js` to a scratch
      file, render the influence / domain / standing / general merit blocks in **edit** mode for one
      representative no-oath fixture character, and capture the exact contents of each of the six
      dot containers. This capture is the golden baseline for AC1.
- [x] **T3 (AC1, AC2, AC6).** Implement route (a) in `sheet.js:212-237`: extract the bare-glyph
      primitive, keep `shDotsMixed` as the wrapped presentation, keep the suspension arithmetic in
      exactly one helper, and add the plain-output sibling. See Dev Notes for the specced shape.
- [x] **T4 (AC1, AC3).** Repoint the six broken call sites (`:979`, `:1000`, `:1265`, `:1724`,
      `:2044`, `:2059`) at the plain variant. Touch nothing else on those lines.
- [x] **T5 (AC7).** Confirm `:1024`, `:1050`, `:1212`, `:1552`, `:1733`, `:2079` are byte-identical
      to their pre-change state (`git diff` should show changes on exactly seven regions: the helper
      block plus the six repointed lines).
- [x] **T6 (AC1, AC8).** Re-render the same fixture through the fixed `sheet.js` and diff against
      the T2 baseline. Record the diff. It must be empty for all six containers.
- [x] **T7 (AC1, AC3).** New test suite (suggested `server/tests/issue-1128-dot-wrapper.test.js`),
      built on the harness shape already proven in `server/tests/oath-b-suspension.test.js`
      (globals stubbed at module top, `pathToFileURL` dynamic import of `public/js/editor/sheet.js`):
      for a no-oath fixture, assert no `class="trait-dots"` occurs inside any `.infl-dots-derived`,
      `.contacts-edit-hdr` or `.dom-contrib-lbl`, and assert each container's contents equal the T2
      golden strings verbatim.
- [x] **T8 (AC2).** In the same suite, a broken-oath fixture: assert the solid band in each of the
      six containers shrank by exactly the suspended count and the hollow band did not move.
- [x] **T9 (AC3).** In the same suite, render a domain block containing both a compound-target merit
      and a normal merit; assert both `.dom-contrib-lbl` contents are bare glyph runs.
- [x] **T10 (AC5).** In the same suite, the call-site census: read `sheet.js` as text, assert the
      exact count of `shDotsSuspended(` call sites (excluding the declaration) and of the plain
      variant, and assert each of the twelve is in its declared bucket. Comment the test with why
      it exists, so the next person does not delete it as a tautology.
- [x] **T11 (AC4).** Browser check on the admin sheet in edit mode, both Parchment and dark themes:
      a character with a five-dot influence merit shows five dots inside the 60px column with no
      wrap and no overflow. Screenshot for the PR.
- [x] **T12 (AC9).** Run the targeted suites listed in AC9. Record pass counts.

## Dev Notes

### Data-lock: not required

This story is a pure rendering fix. It reads no new field, writes nothing, and touches no schema,
collection or API route. No data-lock is needed.

### The verified call-site census (12, not 11)

Confirmed by grep over `public/js/editor/sheet.js` on this branch (which is byte-identical to
`origin/dev` for `sheet.js` and `components.css`), then by reading each site's surrounding markup.
Declaration lines `:212`, `:214`, `:216` are the function itself and are not call sites.

**Bucket A: BROKEN, container styles its own dots, must emit bare glyphs (6)**

| line | expression | container | `main` shape |
|---|---|---|---|
| 979  | `shDotsSuspended(_iPurch, ..., shSuspendedOf(m))`   | `<span class="infl-dots-derived">` | `main:923` bare repeat |
| 1000 | `shDotsSuspended(baseDots, ..., shSuspendedOf(m))`  | `<div class="contacts-edit-hdr">`  | `main:944` bare repeat |
| 1265 | `shDotsSuspended(_dPurch, ..., shSuspendedOf(m))`   | `<span class="dom-contrib-lbl">`   | `main:1182` bare repeat |
| 1724 | `shDotsSuspended(_stPurch, ..., shSuspendedOf(m))`  | `<span class="infl-dots-derived">` | `main:1588` bare repeat |
| 2044 | `shDotsSuspended(_gPurch, ..., shSuspendedOf(m))`   | `<span class="infl-dots-derived">` | `main:1783` bare repeat |
| 2059 | `shDotsSuspended(_gPurch, ..., shSuspendedOf(m))`   | `<span class="infl-dots-derived">` | `main:1798` bare repeat |

**Bucket B: CORRECT, container is designed for `.trait-dots`, leave alone (6)**

| line | routes into | why correct |
|---|---|---|
| 1024 | `shRenderMeritRow(..., dotHtml)` -> `.trait-right` | `shRenderMeritRow:2682` itself falls back to `<span class="trait-dots">`, so `.trait-right` is the class's home |
| 1050 | `shRenderMeritRow(..., dotHtml)` -> `.trait-right` | same |
| 1212 | `_cmpDotsHtml` -> `<span class="dom-total-lbl">` at `:1263` | `.dom-total-lbl` already carried a `.trait-dots` span on `main` (`main:1107`, `_totalDots = shDotsMixed(...)`, used at `main:1182`). Pre-existing, unchanged by #1111 |
| 1552 | `dotHtml` -> domain **view** row -> `.trait-right` | sibling branches at `:1555`, `:1558`, `:1560` already emit `.trait-dots` in the same slot |
| 1733 | inline `<div class="trait-right">` (standing view) | direct `.trait-right` |
| **2079** | `dotH` -> `shRenderMeritRow(..., dotH, ...)` at `:2083` and `:2085` -> `.trait-right` | **the site the issue's table never listed.** Traced and confirmed: general **view** mode, both the granted and ungranted branches pass `dotH` straight into `shRenderMeritRow`. Belongs in Bucket B |

AC5 exists because that census was wrong in the issue itself. A source-level census test is the
cheapest guard that survives the next person adding a seventh small-type row.

### Chosen fix: route (a), an unwrapped variant. Route (b) rejected

The issue left the route open, to be settled by whichever matches existing convention. Verified
evidence, both ways:

- **Route (b) has no precedent.** `.trait-dots` appears **exactly once** in the entire
  `public/css/*.css` tree: `components.css:838`. There is no nested override anywhere, for this or
  any comparable dot class. Route (b) would introduce a first-of-its-kind specificity pattern into
  a file whose stated convention (`coding-standards.md` -> CSS Standards -> Shared Chrome Pattern)
  is grouped shared chrome, not per-container overrides. It would also need one rule per container
  (`.infl-dots-derived`, `.contacts-edit-hdr`, `.dom-contrib-lbl`, and any future one), each
  re-declaring `font-size` / `color` / `letter-spacing` that the container already declares, so the
  two declarations can silently drift. Worst of all, it cannot satisfy AC1: the wrapper element
  would still be in the DOM, so the output would not be byte-identical to `main` and the one check
  that catches this defect class could not be written.
- **Route (a) is the existing convention.** `sheet.js:212-237` already holds three named,
  single-purpose dot renderers side by side: `shDotsSuspended`, `shDotsMixed`, `shDotsThreeTier`.
  Adding a fourth is the same move the file has made three times already, and it produces literally
  the same bytes `main` produces, which is what AC1 needs.

**Specced shape** (names are suggestions, the structure is not). The design constraint that matters
is that the suspension arithmetic exists once and the glyph run exists once, so wrapped and plain
output can never disagree:

```js
/** The glyph run alone: solid purchased band, then hollow bonus band. */
function _shDotGlyphs(purchased, bonus) {
  if (!purchased && !bonus) return '';
  return '●'.repeat(purchased) + '○'.repeat(bonus);
}

/** The one place a suspension changes the bands. Solid shrinks; bonus never does. */
function _shSuspendBands(purchased, bonus, suspended) {
  const n = Math.max(0, suspended || 0);
  return n ? [Math.max(0, purchased - n), bonus] : [purchased, bonus];
}
```

`shDotsMixed` then wraps `_shDotGlyphs` in `<span class="trait-dots">` when the run is non-empty
(preserving today's empty-string return for zero dots, which `main` also produces);
`shDotsSuspended` stays exactly as it is behaviourally and is the Bucket B entry point; the new
plain sibling applies `_shSuspendBands` and returns `_shDotGlyphs` unwrapped, for Bucket A.

Keep the existing 25-line comment block above `shDotsSuspended` (`:180-211`). It records Peter's
ruling on presentation and the reasoning against hollow dots, and none of that changes. Extend it
with one short paragraph explaining the wrapped/plain split so the next reader does not re-merge
them.

### Byte-identity: what is and is not comparable to `main`

Assert over **container contents**, not whole rows. Verified differences that are legitimate and
must not be "fixed":

- `:2044` and `:2059` gained `_pledgeBadge(m) + _oathPledgeNote(m)` (OATH-A/B).
- The domain compound branch at `:1263` was generalised by COLLECTIVE-2 (#1110): `main:1180` reads
  `_necroOwn` / "Sepulcher-owners", this branch reads `_cmpOwn` / `_cmpGateLbl`.
- `.dom-total-lbl` carries a `.trait-dots` span on both `main` and this branch. Unchanged, and out
  of scope.

Also note `shDotsMixed` returns `''` when both bands are zero, and `main`'s bare
`repeat(0) + repeat(0)` is also `''`. The plain variant must preserve that, or AC1 fails on merits
with zero effective dots.

### Test harness

`server/tests/oath-b-suspension.test.js` is the working precedent and should be copied in shape:
`globalThis.location` / `localStorage` / `window` / `document` stubbed at module top **before** the
vitest import, then `beforeAll` dynamic-imports `public/js/editor/sheet.js` via `pathToFileURL`,
pulling `shRenderGeneralMerits`, `shRenderDomainMerits`, `shRenderInfluenceMerits`. The same file
already demonstrates the source-text assertion pattern (`read('public/js/editor/sheet.js')` plus
`expect(src).toContain(...)`) that AC5's census test needs. Standing merits render through the
influence/general path; confirm which exported entry point reaches `:1724` and `:1733` before
writing T8, rather than assuming.

Do not build the census test around a `git show` of `origin/main` at test time. `main` will move.
Capture main's six golden strings once (T2) and commit them as fixture constants with a comment
saying where they came from and why.

### Environment and hard rules

- **Branch `ms/issue-1128-oversized-merit-dots`, based on `dev`.** Deliberate, see the framing
  blockquote. PR targets `dev`. Do not rebase onto `main`.
- **Do not push, merge or deploy** unless Angelus's current message says so. `commit` means
  `git commit` only.
- **British English, no em-dashes** in any app-authored string. This story adds no user-facing copy;
  if that changes, the rule applies.
- **Normalised CSS is mandatory** (`specs/project-context.md` §1, `coding-standards.md` -> CSS
  Standards). Route (a) should need zero CSS changes. Any CSS change at all is a signal to stop and
  re-read AC6.
- Frontend-only change. No server, schema, collection or API work. Run
  `node --check public/js/editor/sheet.js` before committing (the repo's staged-file parse hook does
  this too; enable with `git config core.hooksPath .githooks`).

### References

- `public/js/editor/sheet.js:180-237` (the comment block and the three dot renderers), and the
  twelve call sites tabulated above.
- `public/css/components.css:338-344` (`.contacts-edit-hdr`, `.infl-dots-derived`), `:426-427`
  (`.dom-contrib-lbl`, `.dom-total-lbl`), `:838` (`.trait-dots`), `:842` (`.trait-right`).
- `specs/stories/oath.b.breach-and-suspension.story.md` -> "AC7 - the read-path audit found the
  primary sheet", and its QA Results section. Read both: they explain precisely why a glyph-count
  sweep passed a wrapper regression, and the QA note that four combinations could not be isolated
  by glyph count is the same limitation from the other side.
- `server/tests/oath-b-suspension.test.js` (harness shape, source-text assertion pattern).
- GitHub issue #1128; introduced by #1111; sibling generalisation #1110.
- `specs/architecture/coding-standards.md` -> CSS Standards; `specs/project-context.md`.

## Dev Agent Record

**Agent Model Used:** Opus 5 (claude-opus-5[1m]), BMAD dev-story phase, 2026-08-11.

### Debug Log References

1. **T1 census, verified from source, not from the story.** `grep -n 'shDotsSuspended('
   public/js/editor/sheet.js` on the pre-change file returned the declaration at `:212` plus
   exactly twelve call sites: `:979`, `:1000`, `:1024`, `:1050`, `:1212`, `:1265`, `:1552`,
   `:1724`, `:1733`, `:2044`, `:2059`, `:2079`. Matches Dev Notes exactly, including `:2079`
   (the site the GitHub issue's own table never listed). Bucket split confirmed by reading the
   surrounding markup at each site. No halt.
2. **T2 baseline capture.** `git archive origin/main public` extracted to the scratchpad, then a
   standalone Node ESM script (globals stubbed, `pathToFileURL` dynamic import) rendered the four
   merit sections in **edit** mode for the no-oath fixture through `main`'s own module tree. A
   `git show` of `main`'s `sheet.js` alone was NOT viable: `main` imports
   `hasNecropolisSepulcher` / `getNecropolisTargets` / `collectiveNecroDots` /
   `synthesiseCollectiveNecroNames` from `rules-helpers.js`, all four renamed by COLLECTIVE-2
   (#1110), so a lone file copy dropped into this branch's `public/js/editor/` would fail its
   named imports. The whole-tree extract avoids that.
3. **Container extraction is tag-balanced on purpose.** A non-greedy
   `/<span class="infl-dots-derived">(.*?)<\/span>/` stops at the inner `</span>` of the very
   wrapper under test, silently truncating the evidence. Both the capture script and the committed
   suite use a depth-counting extractor.
4. **DEFECT FOUND AND FIXED beyond the literal task list — `sheet.js:1000` threw.** Rendering the
   dev fixture through the *unfixed* `sheet.js` crashed:
   `ReferenceError: m is not defined at shRenderInfluenceMerits (sheet.js:1000:162)`. OATH-B's edit
   at the Contacts edit header wrote `shSuspendedOf(m)`, but `m` is not in scope there: the
   enclosing `nonContacts.forEach(m => …)` closed 12 lines earlier and there is no module-level
   `m`. ES modules are strict, so this is a hard throw, not `undefined`. Effect on `dev` today:
   **the influence section of edit mode fails to render for every character with a Contacts
   merit** — a second, unreported release blocker in the same six lines this story owns. Fixed to
   `shSuspendedOf(contactsEntry)`, which is the merit whose `baseDots` and `rating` the same
   expression already reads. Declared as a scope addition below rather than folded in silently.
5. **AC6 held.** `public/css/components.css` is untouched. `git status` shows exactly one modified
   source file (`public/js/editor/sheet.js`) plus one new test file.

### Completion Notes List

1. **Route (a) implemented as specced** (`public/js/editor/sheet.js:227-272`). Two private
   primitives extracted — `_shDotGlyphs(purchased, bonus)` (the glyph run; returns `''` for 0/0,
   preserving `main`'s `repeat(0)+repeat(0)`) and `_shSuspendBands(purchased, bonus, suspended)`
   (the one place a suspension moves a band) — then two public entry points over them:
   `shDotsSuspended` (wrapped, Bucket B, behaviourally unchanged) and the new
   `shDotsSuspendedPlain` (bare glyphs, Bucket A). `shDotsMixed` now composes `_shDotGlyphs`
   rather than repeating the glyph literals, so wrapped and plain cannot drift.
   `Math.max(0, purchased - n)` exists exactly once in the file, asserted in the suite.
2. **The 25-line OATH-B comment block was kept verbatim and extended** with one paragraph naming
   the wrapped/plain split and stating explicitly that re-merging them, or inlining the arithmetic
   into either, is the regression.
3. **Six Bucket A call sites repointed.** `sheet.js:1019` (influence edit, `.infl-dots-derived`),
   `:1040` (Contacts header, `.contacts-edit-hdr`), `:1305` (domain "My dots:", `.dom-contrib-lbl`),
   `:1764` (standing edit, `.infl-dots-derived`), `:2084` (general granted row), `:2099` (general
   edit row). Line numbers are post-change; they were `:979`, `:1000`, `:1265`, `:1724`, `:2044`,
   `:2059` before the 40-line helper block was added. **Corrected 2026-08-11 by the Senior
   Developer Review**: this originally said "nothing else on those lines changed." That's false
   for `:1040` — the Contacts header also changes `shSuspendedOf(m)` to
   `shSuspendedOf(contactsEntry)`. That change was already disclosed correctly elsewhere in this
   record (item 5, Debug Log 4) as the fix for a real `ReferenceError` on the base commit, so
   nothing was hidden — but this summary line overstated the diff's own scope. Five of the six
   sites (all but `:1040`) genuinely change only the function name.
4. **T5 — the diff shape.** `git diff -U2` reports **eight** hunks, not the seven the task
   predicted: the helper block splits into two because the unchanged `shSuspendedOf` sits between
   the new block and the rewritten `shDotsMixed`. Same seven logical regions. All six Bucket B
   sites (`:1064`, `:1090`, `:1252`, `:1592`, `:1773`, `:2119` post-change) are outside every
   hunk, i.e. byte-identical, satisfying AC7.
5. **AC8 — the recorded before/after render diff is EMPTY for all six containers.** Rendered from
   `origin/main`'s module tree and from the fixed `sheet.js`, same fixture, same edit mode:

   | container | `origin/main` | fixed `sheet.js` | diff |
   |---|---|---|---|
   | influence edit `.infl-dots-derived` | `●●●○○` | `●●●○○` | none |
   | Contacts `.contacts-edit-hdr` | `Contacts ●●○○` | `Contacts ●●○○` | none |
   | domain `.dom-contrib-lbl` | `My dots: ●●●○` | `My dots: ●●●○` | none |
   | standing `.infl-dots-derived` | `●●○` | `●●○` | none |
   | general granted `.infl-dots-derived` | `○○` | `○○` | none |
   | general edit `.infl-dots-derived` | `●●●●●` | `●●●●●` | none |

   For completeness, the pre-fix `dev` render of this same fixture produced **no output at all**:
   it threw at `:1000` (Debug Log 4). The six goldens above are committed as `MAIN_GOLDEN` in the
   new suite with a comment recording where they came from and why they are not re-derived from
   `origin/main` at test time.
6. **AC4 verified in a real browser, both themes** (`npx http-server public -p 8099 -s`; port 8080
   was already occupied by another process, so the check ran on 8099). `admin.html` does not load
   `dev-fixtures.js` (that interceptor is `index.html`-only) and no local API was running, so the
   fixture character was injected directly into the live editor state — `import('/js/data/state.js')`
   from the page returns the same module instance `admin.js` holds — and rendered through the app's
   own `window.renderSheet` into a real `#sh-content.cd-sheet`. Measured on the live DOM, identical
   in Parchment and dark: `.infl-dots-derived` `clientWidth` 60, `scrollWidth` 60 (**no overflow**),
   `font-size` 11px, `innerHTML` a bare glyph run, five dots on one line. Re-injecting the pre-fix
   markup into the same element quantified the regression: `<span class="trait-dots">●●●●●</span>`
   computes to 15px / 2.5px letter-spacing, an inner run of 58px inside a 52px content box, giving
   `scrollWidth` 62 vs `clientWidth` 60. Screenshots taken in both themes.
7. **AC3 confirmed at the render, not only in source.** With a primed rules cache, a domain block
   containing both a compound-target merit (`Catacombs`, the `:1263` branch) and a normal merit
   (`Herd`, the `:1265` branch) renders both `.dom-contrib-lbl` values as bare `My dots: ●…` runs.
   The adjacent `.dom-total-lbl` keeps its `.trait-dots` span, which is pre-existing on `main`
   (`main:1107`) and explicitly out of scope; a test pins that boundary so a later tidy-up does not
   "finish the job".
8. **Test suite: 33 tests, all green** (`server/tests/issue-1128-dot-wrapper.test.js`). Harness
   copied in shape from `oath-b-suspension.test.js`. Primary assertions are container
   **contents** (byte-exact against `MAIN_GOLDEN`), not a glyph tally — the tally alone is exactly
   what let OATH-B's AC7 sweep pass a wrapper regression. **Corrected 2026-08-11 by the Senior
   Developer Review**: "never a glyph tally" overstated it — the suite also counts solid/hollow
   glyphs in a couple of places (e.g. the suspension-band assertions) as a supplementary check
   alongside the byte-exact ones, not instead of them. The AC1 boundary the record cares about
   (content-equality, which a wrapper change cannot slip past) is intact either way.
9. **AC9 targeted run: 137 tests green across 5 files** —
   `issue-1128-dot-wrapper.test.js` (33), `oath-b-suspension.test.js`,
   `oath-a-render-and-gate.test.js`, `n7a-necro-domain-render.test.js`,
   `stm-polish-408-dots.test.js`. Additionally ran `collective-1-virtual-rows.test.js` +
   `collective-2-compound-generalisation.test.js` (59 green) because the domain renderer is on the
   changed path. No full-suite run; nothing piped through `tail`.
   `node --check public/js/editor/sheet.js` passes.

### Declared deviations

- **Scope addition (necessary for AC1):** `sheet.js:1040` also changes `shSuspendedOf(m)` to
  `shSuspendedOf(contactsEntry)`. This is not cosmetic — the original is a `ReferenceError` that
  crashes influence edit mode for any character with Contacts (Debug Log 4), and AC1 cannot be
  satisfied at a call site that throws. One identifier, inside a line the story already directed
  me to touch, matching the two sibling reads on the same expression. Flagged here rather than
  buried.
- **T5's "exactly seven regions"** is eight `git diff` hunks for the mechanical reason in
  Completion Note 4. No extra edits.
- **AC4's browser check** used an injected fixture rather than a live character, because
  `admin.html` has no fixture interceptor and no local API was running. What is being asserted is
  layout of app-rendered markup under the real stylesheet, which the injection preserves exactly.

### File List

**Modified**
- `public/js/editor/sheet.js` — helper block rewritten (`_shDotGlyphs`, `_shSuspendBands`,
  `shDotsSuspended`, new `shDotsSuspendedPlain`, `shDotsMixed` recomposed) and six Bucket A call
  sites repointed; plus the `contactsEntry` scope fix at the Contacts edit header.
- `specs/stories/sprint-status.yaml` — `issue-1128-oversized-merit-dots` -> `review`, both
  `last_updated` markers (the `#` header at line 2 and the YAML field at line 35) updated together.
- `specs/stories/issue-1128-oversized-merit-dots.story.md` — this record; Status -> review.

**Added**
- `server/tests/issue-1128-dot-wrapper.test.js` — 33 tests: AC1 byte-identity against the
  `main`-captured goldens, AC2 per-site suspension, AC3 domain sibling consistency, AC4 five-dot
  fit, AC5 call-site census, AC6 no-new-CSS.

**Unchanged, deliberately**
- `public/css/components.css` — zero CSS changes, per AC6.

## Senior Developer Review (AI)

**Reviewer:** external adversarial 3-pass review (Codex), verified and triaged internally. **Date:**
2026-08-11. **Outcome:** 0 High, 2 Medium (both resolved as a confirmed correct fix, not a defect),
5 Low. **Ready to ship as-is** — Codex's own verdict, and this session's independent re-verification
agrees.

### The Contacts `contactsEntry` substitution — scrutinised, not waved through

Both Pass 1 (blind, diff-only) and Pass 2 (repo access) converged on the same thing: one of the six
repointed call sites (`sheet.js:1040`, the Contacts edit header) changes more than a function name —
`shSuspendedOf(m)` became `shSuspendedOf(contactsEntry)`. Pass 1 correctly refused to classify this
from the diff alone and flagged it for Pass 2. Pass 2 traced the actual scope in
`shRenderInfluenceMerits` and then **reproduced the failure directly**: imported base commit
`158a713f`'s real `sheet.js` and executed it against a Contacts-merit fixture. It threw
`ReferenceError: m is not defined` — `m` was the closed-over parameter of an already-returned
`nonContacts.forEach(m => {...})` callback, not a live binding at the Contacts header. This session
independently reproduced the same exception before this review was even commissioned (see Debug Log
4). **Confirmed: the substitution repairs a real, pre-existing crash on `dev` today** (every
character with a Contacts merit fails to render the influence edit section at all), not a
behaviour-altering side effect smuggled into a styling fix.

### Two record corrections applied in place

Two of the Dev Agent Record's own completion notes overstated what they described — real findings,
correctly Low severity, corrected directly in Completion Notes 3 and 8 above rather than left
standing next to their own retraction:

1. **"Nothing else on those lines changed" (item 3)** was false for `:1040` specifically — the
   `contactsEntry` substitution above. The other five Bucket A sites genuinely change only the
   function name; only the summary sentence was too broad.
2. **"Never a glyph tally" (item 8)** was false — the suite's primary assertions are byte-exact
   container-content checks (the ones that actually catch a wrapper regression), but it also counts
   solid/hollow glyphs in a supplementary role in a couple of places. The AC1 guarantee the sentence
   was trying to describe (content-equality survives what a count-only sweep missed) holds regardless.

### Verified false or accepted as-is

- *"AC4's automated test doesn't measure real layout"* — true, and accepted rather than fixed now.
  The fix itself is verified correct by an actual browser measurement (both themes, `clientWidth`/
  `scrollWidth` both 60px), but the *regression test* only checks glyph content, not computed width.
  Building a Playwright-based layout assertion is a heavier test shape than anything else in this
  suite. Deferred to `deferred-work.md` rather than built now, disproportionate to a small bugfix.
- *"The census test's comment-parser could in principle miscount"* — true in the abstract, verified
  by Pass 2 to cause zero actual miscounting in the real file today (exactly 12 live call sites, none
  on a line the parser would misclassify). Not fixed; the same class of "theoretical, zero current
  exploitability" finding this project's reviews have accepted as-is before (matching the walker/
  symlink finding from `bl-3b`'s own review).
- *"Compound-target 'My dots:' never reflects a suspended oath"* — true, and real, but confirmed via
  `git blame` (commit `92f2a4884`) to predate both OATH-B and this fix. Deliberately out of this
  story's scope (that branch was already correctly bare, just never suspension-aware) — deferred to
  `deferred-work.md` as a separate, genuine defect rather than silently dropped.
- *"Claimed screenshots aren't in the workspace"* — correct; they were written to a local temp
  directory as browser-verification evidence, the same way every other browser check in this
  project's recent work has been, and were never meant to be committed. Codex independently
  reproduced the same measurements itself rather than trusting the screenshots existed.

### Regression

Independently re-run, not just read: the exact AC9 gate (`issue-1128-dot-wrapper`,
`oath-b-suspension`, `oath-a-render-and-gate`, `n7a-necro-domain-render`, `stm-polish-408-dots`) —
**5 files, 137 tests, green**. The new suite alone — **33/33**. The two collective suites the domain
renderer also touches — **59/59**. `node --check` and `git diff --check` both clean. Zero CSS
changes confirmed (`git diff --name-only` against `public/css` is empty). All six Bucket B call
sites confirmed byte-identical at their old/new line pairs.

**No unresolved High or Medium remains.** Status -> `done`.

## Change Log

| Date | Change |
|---|---|
| 2026-08-11 | Story created, ready-for-dev (SM). |
| 2026-08-11 | Implemented route (a): `_shDotGlyphs` + `_shSuspendBands` extracted, `shDotsSuspendedPlain` added, six Bucket A call sites repointed, zero CSS change. Fixed an additional `ReferenceError` at the Contacts edit header that crashed influence edit mode on `dev`. 33 new tests; 137 green across the AC9 suites; AC8 render diff empty for all six containers; AC4 verified in-browser in both themes. Status -> review. |
| 2026-08-11 | External adversarial 3-pass review (Codex): 0 High, 2 Medium (both scrutinised and confirmed as a correct fix — the `contactsEntry` substitution repairs a real, independently-reproduced `ReferenceError` on `dev`, not a hidden behaviour change), 5 Low (2 corrected in place in the Dev Agent Record, 2 deferred to `deferred-work.md` as pre-existing/out-of-scope, 1 accepted as-is). Ready to ship as-is, both by Codex's own verdict and this session's independent re-verification. Status -> done. |

## Open questions for Angelus

None blocking. One judgement call is recorded rather than asked, because the evidence settles it:
the issue left routes (a) and (b) open and this story specs **(a)**, on the grounds that
`.trait-dots` has no nested-override precedent anywhere in the CSS tree while `sheet.js` already
holds three sibling dot renderers, and that only route (a) can produce output byte-identical to
`main` (AC1). If you would rather take route (b), say so before implementation starts, because AC1
and AC8 would both need rewording.
