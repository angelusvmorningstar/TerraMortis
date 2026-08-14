# Adversarial review - dbo-9-suite-duplicated-constants (consolidate NON_COMBAT_STYLES to one source), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is a small, low-risk, pure-refactor story — match review depth to stakes. Still run all three
passes, but do not manufacture findings to fill space; "nothing found" is a legitimate, expected
outcome here given the diff's size.

## How to run this - read this section before anything else

Three passes in one session, in a fixed order, each allowed to see strictly more than the one
before it.

1. Work the passes in the order written. Do not read ahead. The story spec is deliberately NOT in
   the diff — do not go looking for it during the earlier passes.
2. Freeze each pass before advancing: write that pass's findings to
   `specs/stories/code-review/dbo-9-suite-duplicated-constants-codex-findings.md` before opening
   anything the next pass allows.
3. At the end, attest to what you actually did.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. Diff at
  `specs/stories/code-review/dbo-9-suite-duplicated-constants-diff.txt`, taken against base commit
  `9cab47ea` (the tip of `ms/dbo-4-office-collections-absent-empty-route`, the branch this one was
  cut from).
- The diff is deliberately scoped to source and tooling only (`constants.js`, `sheet.js`,
  `downtime-form.js`, and the one new test file). The story file and tracking files are excluded on
  purpose — do not treat their absence as an omission.
- **Read and run freely** to verify a claim.
- **Do NOT modify, commit, or push anything.**
- This repo sits inside an umbrella workspace (`D:\Terra Mortis\`) alongside sibling repos (`TM
  Wiki`, `TM Cockpit`, `TM Herald`). Do not open, read, or reference any of them.
- Temporarily editing a file to prove something is allowed and encouraged - restore it exactly,
  confirm with `git diff`, and say so.
- Report the exact commands you ran and their real output.

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

### What this diff claims to be

Two files (`sheet.js`, `downtime-form.js`) each carried a byte-for-byte identical local constant
listing four "non-combat style" names, used to exclude those names from style/manoeuvre pickers. The
diff moves that list into a single new export, `NON_COMBAT_STYLES`, in `public/js/data/constants.js`
(as a plain array, not a `Set`), deletes both local declarations, and updates all four call sites from
`Set.has(...)` to `Array.includes(...)`. A new test file proves the export's value, that both files
import rather than redeclare it, and that the filtered-out names are unchanged.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`.has(...)` → `.includes(...)` is a real semantic no-op here, but confirm it.** Both operate on
   primitive string equality with no coercion in either direction — is there any case where a `Set`
   and an `Array` genuinely diverge for this exact usage (four short ASCII strings, plain equality)?
   Say plainly if you find none, rather than omitting the check.
2. **`NON_COMBAT_STYLES` is now a shared, exported, mutable array** (not a fresh `Set` instance per
   file as before). Does anything anywhere in either touched file's new call sites (or nearby code
   in the same functions) mutate it — `.push`, `.sort()` in place, `.splice`, reassignment via the
   imported binding, anything that could make one consumer's use leak into the other's? A leak here
   would be invisible today (four static strings) but a real hazard for any *future* editor of either
   file who doesn't realise the array is now shared module state.
3. **The new test file's source-contract regexes** — specifically
   `/import\s*\{[^}]*\bNON_COMBAT_STYLES\b[^}]*\}\s*from\s*['"]\.\.\/data\/constants\.js['"]/`. This
   project has a documented history of exactly this failure mode (a comment near a pinned function
   self-matching a source-contract regex, producing a false pass — see the project's own
   `feedback_source_contract_regex_false_pass` convention). Could this specific regex match anything
   OTHER than a genuine import statement in either file — a comment, a string literal, dead code?
   Actually construct or point to a concrete string that would false-positive it, or state plainly
   that you tried and found none.
4. Self-contradiction within the diff, dead code, unused imports, anything the comment claims that
   the code doesn't actually do (or vice versa).

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dbo-9-suite-duplicated-constants-codex-findings.md` now, before reading
further.**

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite` (excluding sibling repos - see above).

### What to hunt for

1. **Any OTHER consumer of the two deleted local constants** that the diff's four call sites don't
   account for — grep the whole repo for `NON_COMBAT_STYLES` and `NON_COMBAT_STYLES_DT` and confirm
   every remaining reference is one of: the new export, the two updated import lines, the four
   updated call sites, or the new test file. Anything else is either a missed call site (a real bug)
   or dead reference.
2. **Any test file (besides the new one) that reads `sheet.js` or `downtime-form.js` as raw source
   text** (source-contract style, common in this repo — e.g. anything matching
   `n7-n9-allocator-readers.test.js`'s own pattern) and might assert something about byte offsets,
   line numbers, or exact surrounding text near either changed region, which this diff's line-count
   change (net -1 line in `sheet.js`, net 0 in `downtime-form.js`) could have silently broken. Run
   any such test you find.
3. Does `public/js/data/constants.js` get imported anywhere in a context where an ARRAY (rather than
   the old per-file `Set`) could behave differently at the CALL SITE beyond the four already
   converted — e.g. is `NON_COMBAT_STYLES` referenced anywhere via destructuring, spread, or
   `for...of` in a way sensitive to it now being a real array versus a Set (both are iterable, but
   confirm nothing downstream assumed Set-specific behaviour like insertion-order-of-unique-values
   or a `.size` property)?

**STOP. Write your Pass 2 findings now, before reading further.**

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dbo-9-suite-duplicated-constants.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY. Do NOT read the `## Dev Agent Record` section
   yet.
2. Check the diff against each AC's literal wording:
   - AC1: declared exactly once, as a plain array (not a `Set`), placed near `STYLE_TAGS`.
   - AC2: `sheet.js`'s local const deleted, import added, all three named call sites (`:2315`,
     `:2347`, `:2437` in the STORY's own line numbers — note these may have shifted slightly by dev
     time; use function names / surrounding context to locate them, not blind line numbers) updated.
   - AC3: same for `downtime-form.js`'s one call site.
   - AC4: no behavioural change, proven by a test.
   - AC5: nothing else in either file touched.
3. Write your Pass 3a findings now, before moving on.

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:** TM Wiki's own copy of this
same duplicated constant (a different repo's own story, DBO-31-8); any other duplication anywhere
else in either file.

### Pass 3b - now read the author's record and check it against reality

4. Read the `## Dev Agent Record` in full. It makes specific claims — verify by running, not reading:
   - "7/7 new tests pass"; "prove-discrimination... failed exactly the 'three call sites' test (6
     passed, 1 failed)".
   - "Ran the full set of existing test files that reference sheet.js/downtime-form.js by name (29
     files)... 513/514 passed" and the specific claim that 2 additional failing test FILES
     (`issue-836-legacy-tracker-cache-removed.test.js`, `n8-mandragora-prereq.test.js`) are
     pre-existing and unrelated, confirmed by stashing this story's 3 changed files and re-running
     against the unmodified base. You do not need to reproduce the stash-based confirmation yourself
     (that would require git operations this review should not perform) — but DO run both of those
     two test files directly, right now, against the CURRENT (post-dbo-9) code, and confirm they
     still fail with the same errors the record describes. If they pass for you, or fail
     differently, say so — that would mean the record's claim doesn't hold in this environment.
   - `git diff --stat` claim: "3 files, 13 insertions/13 deletions" for the three source files
     (excluding the new test file). Verify with your own `git diff --stat` against the same base
     commit.
5. Flag anything FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED.
6. State plainly whether this is ready to ship as-is.

## Output

Write to `specs/stories/code-review/dbo-9-suite-duplicated-constants-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each tagged `[Pass 1]`/`[Pass 2]`/`[Pass 3a]`/`[Pass 3b]`. Write
`- None found.` under any empty heading.

For each finding: one-line title, severity, file:line, triggering input/sequence, observable
consequence, confidence.

Close with **Validation notes**: files opened per pass, every command run with its real result,
anything you could not run and why, confirmation you modified nothing (or restored and verified).
