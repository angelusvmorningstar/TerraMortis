---
issue: 933
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/933
branch: morningstar-issue-933-lore-rubric-index26
story: 933
predecessors: [924, 928, 930, 934]
status: done
---

# Story 933: Lore rubric — remove unlabelled scored:false entry at index 26 (fixes Q27-Q44 verdict pairing)

Status: done

## Story

As a player whose Lore Mastery ordeal has been graded,
I want the per-question verdicts and feedback to appear under the correct question labels from Q27 onwards,
so that I can read the actual ST feedback on my answers instead of seeing them paired to the wrong question.

## Background

The `lore_mastery` document in `ordeal_rubrics` has 45 entries (indices 0–44) instead of 44. The extra entry
at index 26 is unlabelled, `scored: false`, and contains a retired duplicate of Q20 ("Can you use Disciplines
on other vampires in Elysium?"). `LORE_SECTIONS` (44 questions) has no form question at this position.

As a result, every lore question from Q27 onwards sits at rubric index N+1 rather than N (Q27→27, Q28→28 …
Q44→44 when the form expects 26, 27 … 43). The cockpit wrote verdicts using the rubric's `question_index`
field (`cockpit/lib/apply-marking.mjs`). The player-facing renderer (`ordeal-form.js`) now uses a running
counter `qi` (landed via PR #934) that matches flat form positions (Q27 → qi=26), but those never match the
rubric indices (Q27 → 27). So Q27–Q44 verdicts are invisible or paired one-off.

The running counter fix in `ordeal-form.js` is correct and works for Rules Mastery. It will also work for
Lore **once the rubric entry is removed and existing marking indices are decremented by 1**. No suite code
changes are needed for this story.

Wan Yelong has lore `near` verdicts at rubric indices 29, 36, 38, 39, 40 (Q29, Q36, Q38, Q39, Q40) that are
currently invisible in the player view. After this fix they will surface correctly.

## What the dev needs to build

A single migration script: `server/scripts/fix-lore-rubric-index26.mjs`

**Dry-run by default, `--apply` to write** (same safety pattern as `server/scripts/fix-rubric.mjs`).

### Script logic

1. Connect to MongoDB using `MONGODB_URI` from root `.env` (same as `fix-rubric.mjs` pattern).
2. Load the `lore_mastery` document from `ordeal_rubrics`.
3. **Detect the bad entry**: find an entry where `scored === false` AND the question text does NOT begin
   with a leading `\d+\.` (i.e. has no question number). The known text is "Can you use Disciplines on other
   vampires in Elysium?" at position 26 (0-based array index), but match by content/scored flag, not
   hard-coded position — makes it robust if the array is re-ordered.
4. **If bad entry not found**: print "lore rubric is already clean — no changes needed" and exit. This is
   the idempotency gate for the rubric step.
5. **If found**: proceed only if `--apply` was passed (otherwise print what would change).
   - Pull the `questions` array, splice out the bad entry.
   - Rewrite the `questions` array via `updateOne({ ordeal_type: 'lore_mastery' }, { $set: { questions: [...] } })`.
   - Print confirmation.
6. **Patch existing lore marking indices**: operate on `ordeal_responses` (the collection where marking lives).
   - Find all `ordeal_responses` docs where `type === 'lore'` AND `marking.answers` is a non-empty array.
   - For each, iterate `marking.answers`: for every answer where `question_index >= 27`, decrement by 1.
   - Write back with `$set: { 'marking.answers': patchedAnswers }` (replace the whole array — simpler than
     positional updates on a variable-length array).
   - In dry-run: print how many docs would be affected and show the index changes.
   - In `--apply`: write, report modified count.
7. Print a summary: N rubric entries removed, M marking docs patched.

### Idempotency

The bad rubric entry check in step 4 is the gate. If the rubric has already been cleaned, the script stops
before touching markings. Do NOT use a separate `>= 27` threshold on markings as the idempotency gate —
after patching, Q27+ indices sit at 26, 27 … which would be re-decremented on a second run.

### After script execution (Peter's domain to run)

The cockpit `ordeals-bundle.json` is stale once the rubric changes. Peter should re-export via
`cockpit/scripts/export-ordeals.mjs` to regenerate the bundle, which will reflect the corrected indices for
any future grading pass. Wan Yelong's lore marking indices will be correct in the DB after the patch; no
re-grade is required (the near/no answers are already recorded, just at shifted indices).

## Acceptance criteria

- [ ] `server/scripts/fix-lore-rubric-index26.mjs` exists and runs idempotently (re-runnable with no
      double-decrement or double-remove)
- [ ] Dry-run output (default) correctly identifies the bad entry and the M lore marking docs to patch
- [ ] `--apply` run removes the unlabelled `scored:false` entry from `ordeal_rubrics.lore_mastery.questions`
      (collection has 44 entries afterwards, not 45)
- [ ] `--apply` run decrements `question_index` >= 27 in all `ordeal_responses` lore marking docs by 1
- [ ] After apply: Wan Yelong's lore in-progress view shows Q29, Q36, Q38, Q39, Q40 `near` verdicts under
      the correct question labels (manual smoke-check on dev/main after Peter runs apply)
- [ ] No regression: lore verdicts for Q1–Q26 are unaffected (indices 0–25 unchanged)
- [ ] Rules Mastery ordeal verdicts unaffected (separate collection path, no changes here)
- [ ] Second run of script (after apply) exits cleanly with "already clean" message, touching nothing

## Scope

**In scope:**
- `server/scripts/fix-lore-rubric-index26.mjs` (new file, written by Angelus, executed by Peter)

**Out of scope:**
- `public/js/tabs/ordeal-form.js` — running counter fix landed in PR #934; no changes here
- `cockpit/` — re-export after rubric change is a manual ST step, not a code change
- Any other ordeal type (rules, covenant, questionnaire, history)
- Re-grading — the index patch preserves the existing near/no decisions; re-grade is not required

**DB execution:** Peter runs `node server/scripts/fix-lore-rubric-index26.mjs --apply` against live
`tm_suite`. Angelus writes and reviews the script.

## Dev notes

### Script pattern reference — `server/scripts/fix-rubric.mjs`

Model this script on `fix-rubric.mjs`. Key patterns to copy:
- `dotenv.config({ path: join(__dirname, '..', '..', '.env') })` for root `.env`
- `const APPLY = args.includes('--apply')`
- Dry-run prints before/after; apply writes and reports `modifiedCount`
- `client.close()` in `finally`
- Exit with `process.exitCode = 1` on error (don't `process.exit(1)` before `finally`)
- `serverSelectionTimeoutMS: 10000` on the MongoClient

### Rubric detection (not by hardcoded index)

```js
const hasLeadingNumber = (text) => /^\s*\d+\./.test(String(text || ''));
const badEntry = (rubric.questions || []).find(q => q.scored === false && !hasLeadingNumber(q.question));
```

### Marking patch (replace whole array)

MongoDB positional `$` operators require knowing the index. Since we're modifying multiple elements, replace
the whole `marking.answers` array:

```js
const patched = doc.marking.answers.map(a =>
  a.question_index >= 27 ? { ...a, question_index: a.question_index - 1 } : a
);
await col.updateOne({ _id: doc._id }, { $set: { 'marking.answers': patched } });
```

Use bulk-write or a loop — the collection is small (one lore doc per player, a handful total).

### Collections

- `ordeal_rubrics` — one doc per ordeal type; field `ordeal_type: 'lore_mastery'`
- `ordeal_responses` — one doc per player per ordeal type; filter by `type: 'lore'`
  - `marking.answers: [{ question_index, result, feedback }]`

### Live data reference (Wan Yelong)

Lord Wan Yelong (`character_id: 69d73ea49162ece35897a499`) has a lore `ordeal_responses` doc
(`_id: 6a35f289efee90c8c11fff70`) with `marking.status: 'in_progress'` and nears at indices 29, 36, 38, 39,
40. After the patch these should sit at 28, 35, 37, 38, 39 (which map to Q29, Q36, Q38, Q39, Q40 in the
44-question lore form at qi positions 28, 35, 37, 38, 39 — i.e. 0-based for Q29=28, Q36=35, Q38=37, Q39=38,
Q40=39). Verify in the player view after Peter applies.

## File List

- `server/scripts/fix-lore-rubric-index26.mjs` — NEW

### Review Findings

- [x] [Review][Patch] Decrement threshold `>= 27` is hardcoded — should derive from `badEntry.index` (`> badEntry.index`) so the threshold is data-driven from the actual detected entry, not a magic number [`server/scripts/fix-lore-rubric-index26.mjs:97,111,113`]
- [x] [Review][Patch] Partial-apply gap: if `--apply` cleans the rubric but crashes mid-marking-loop, re-run hits the "already clean" idempotency gate and exits, leaving un-patched docs stranded — add `--force-mark-patch` flag as recovery path [`server/scripts/fix-lore-rubric-index26.mjs:59-62`]
- [x] [Review][Patch] Step 3 proceeds to marking patch even if rubric `updateOne` returns `modifiedCount === 0` (e.g. concurrent write between findOne and updateOne) — add a guard to skip and warn [`server/scripts/fix-lore-rubric-index26.mjs:87`]
- [x] [Review][Patch] Dry-run summary string hardcodes `"1"` instead of `${nRubricRemoved}` — minor cosmetic inconsistency [`server/scripts/fix-lore-rubric-index26.mjs:142`]
- [x] [Review][Defer] No MongoDB transaction wrapping steps 2 and 3 — deferred, pre-existing pattern across all migration scripts; partial-failure concern addressed by patch finding #2

## Dev Agent Record

### Implementation Notes

- Wrote `server/scripts/fix-lore-rubric-index26.mjs` modelled on `fix-rubric.mjs` pattern.
- Dry-run by default; `--apply` to write.
- Idempotency gate: detects bad entry by `scored === false` AND no leading `\d+\.` in question text.
  If not found, exits immediately without touching `ordeal_responses`.
- Rubric removal: filters the bad entry from the questions array by array position (found via `findIndex`),
  rewrites the whole array with `$set`.
- Marking patch: fetches all `ordeal_responses` type:'lore' docs with non-empty `marking.answers`,
  filters to those containing any `question_index > badEntry.index`, replaces the whole `marking.answers`
  array with decremented values via `$set`.
- Variable name typo caught and fixed during syntax pass: `docsTopatch` -> `docsToPatch`.
- `node --check` passes clean.

### Change Log

- 2026-06-26: Implemented `server/scripts/fix-lore-rubric-index26.mjs` (story 933, Angelus)
- 2026-06-26: Code review patches — threshold data-driven via `badEntry.index`, `--force-mark-patch` recovery flag, modifiedCount=0 guard, summary string fix (story 933, Angelus)
