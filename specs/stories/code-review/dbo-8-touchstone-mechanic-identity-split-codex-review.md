# Adversarial review - dbo-8-touchstone-mechanic-identity-split (retire the dead edge_id/touchstone_meta mechanic), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

Three passes in one session, in a fixed order, each allowed to see strictly more than the one
before it.

1. Work the passes in the order written. Do not read ahead. The story spec is deliberately NOT in
   the diff — do not go looking for it during the earlier passes.
2. Freeze each pass before advancing: write that pass's findings to
   `specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-codex-findings.md` before
   opening anything the next pass allows.
3. At the end, attest to what you actually did.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. Diff at
  `specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-diff.txt`, taken against base
  commit `3b705938` (the tip of `ms/dbo-9-suite-duplicated-constants`, the branch this one was cut
  from).
- The diff is deliberately scoped to source and tooling only (both schemas, both routes, both client
  files, the new cleanup script, and its three touched/new test files). The story file and tracking
  files are excluded on purpose — do not treat their absence as an omission.
- **Read and run freely** to verify a claim.
- **Do NOT modify, commit, or push anything.**
- **NEVER connect to or query live `tm_suite` yourself, under any circumstances, and NEVER invoke
  `server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs` directly (with or without `--apply`)**
  — it defaults to live Atlas. You may read the script in full and reason about its logic statically,
  and you may run its own test suite (`server/tests/dbo-8-orphaned-touchstone-edges-cleanup.test.js`),
  which is scoped to `tm_suite_test` only.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis\`) alongside sibling repos (`TM
  Wiki`, `TM Cockpit`, `TM Herald`). Do not open, read, or reference any of them.
- Temporarily editing a file to prove something is allowed and encouraged - restore it exactly,
  confirm with `git diff`, and say so.
- Report the exact commands you ran and their real output, including {{GATE_COMMANDS}} below.

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

### What this diff claims to be

Retires a dormant feature: `characters.touchstones[]` entries could optionally carry `edge_id`,
linking to a `relationships` document (`kind:'touchstone'`, `touchstone_meta.humanity`). The diff
removes `edge_id` from the character schema, removes `'touchstone'`/`touchstoneMetaSchema`/
`touchstone_meta` from the relationship schema, removes every `kind==='touchstone'`-specific branch
from both route files (including a validation helper `touchstoneShapeError`, an NPC-name enrichment
function `enrichTouchstoneNpcNames` and its three call sites, and two client-side branches that used
to mirror/retire a linked relationship edge on touchstone edit/delete), and adds a new one-off
dry-run-default cleanup script for any leftover `relationships` documents still carrying
`kind:'touchstone'`. Three test files are touched: one fully rewritten, one new, one with a single
test's assertion reworded.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`validateTouchstones` (`server/routes/characters.js`) changed from `async` to a plain
   synchronous function**, and its one call site dropped the `await` and a parameter
   (`characterId`, no longer needed). Confirm the call site genuinely doesn't need to await it any
   more (nothing inside it does I/O now), and that no other caller anywhere still does
   `await validateTouchstones(...)` expecting a Promise (an `await` on a non-Promise value is
   harmless in JS, but a caller checking `instanceof Promise` or similar would not be) — check for
   any other call site.
2. **`enrichTouchstoneNpcNames`'s three call sites removed** (`GET /` for ST, `GET /` for player/mine,
   `GET /:id`). At the third site, the local `const forPlayer = req.user.role === 'player';` was also
   removed as now-unused. Confirm `forPlayer` really has no other use in that handler, and confirm no
   other enrichment step in any of these three handlers still implicitly depended on
   `enrichTouchstoneNpcNames` running first (e.g. a later step reading `t._npc_name`).
3. **`relationships.js`'s PUT route removed `touchstoneShapeError`'s call — but that call was
   conditioned on `tsErr && isSt`** (only fired for ST, unlike the POST route's unconditional check).
   Confirm the `isSt` local is still used elsewhere in that PUT handler and wasn't left orphaned by
   this removal.
4. **`CLEARABLE`/`TRACKED` arrays in the PUT route lost their `'touchstone_meta'` entries.** Walk the
   rest of that handler's diff-tracking logic that consumes `CLEARABLE`/`TRACKED` and confirm removing
   those two entries doesn't change behaviour for any OTHER field still in those arrays (e.g. does
   array index matter anywhere, or is membership the only thing that's checked?).
5. **`public/css/components.css:619-620` (`.sh-ts-slot-kind` and `.sh-ts-slot-kind.dim`) were NOT
   touched by this diff**, even though the diff removes the only JS that ever emitted that class
   (`sheet.js`'s kind-badge line). Confirm this is genuinely dead CSS now (search the whole repo for
   any other emitter of `sh-ts-slot-kind`) and flag it as a Low finding if so — orphaned CSS, not a
   functional bug.
6. Self-contradiction within the diff, dead code, unused imports (check `edit.js`'s import line
   change — `apiGet` removed — confirm nothing else in that file still calls `apiGet`), anything a
   comment claims that the code doesn't actually do.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-codex-findings.md` now, before
reading further.**

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite` (excluding sibling repos - see above).

### What to hunt for

1. **Any OTHER consumer of `edge_id`/`touchstone_meta`/`kind:'touchstone'`/`enrichTouchstoneNpcNames`/
   `touchstoneShapeError`/`_npc_name`/`touchstone_edge_ids`** that this diff's removals don't account
   for — grep the whole live codebase (`public/`, `server/`, excluding `server/scripts/archive/`,
   which is historical and deliberately untouched — confirm any hits there are archived, not live) and
   confirm every reference left is either a comment explaining the retirement, or genuinely absent.
2. **The new cleanup script's delete-by-`_id` step doesn't re-check `kind` at delete time.**
   `applyCleanup` fetches a fresh backup read (`originals`) right before deleting, but the delete loop
   (`for (const row of rows) { await collection.deleteOne({ _id: row._id }); }`) filters ONLY on
   `_id`, not on `kind: 'touchstone'` still holding. Trace whether this is a real, if narrow, risk:
   could a document's `kind` legitimately change away from `'touchstone'` between `planCleanup`'s read
   and this delete (e.g. an ST successfully PUTs a kind-change onto an existing `kind:'touchstone'`
   document — check whether the relationship schema/route would actually accept such a PUT, given
   `'touchstone'` is no longer in `KIND_ENUM` at all) — and if so, whether the delete would then
   destroy a document that is no longer the shape this script exists to clean up. Compare against how
   `dbo-1-purchasable-powers-field-cleanup.mjs` and `migrate-office-purchases-to-seats.mjs` handle the
   equivalent plan/apply gap (both re-derive from a fresh read rather than trusting the stale plan) -
   is the difference here justified by this script deleting rather than merely mutating a field, or is
   it a real gap worth closing the same way?
3. **The removed `touchstoneShapeError` function used to validate BOTH `touchstone_meta.humanity`
   range AND the pc+npc endpoint shape for any `kind:'touchstone'` submission.** Now that `'touchstone'`
   isn't a valid `kind` at all, is there any other current or former use of "one pc + one npc
   endpoint" enforcement elsewhere in the schema/route that this removal might have silently also
   removed for a DIFFERENT kind (i.e., was `touchstoneShapeError`'s endpoint-shape check ever doing
   double duty for something beyond touchstones)? Read the full endpoint-validation logic in
   `relationships.js` to confirm it wasn't.
4. **Test coverage of the schema's rejection.** `api-touchstone-edges.test.js`'s new tests assert
   `res.status === 400` for `edge_id` and for `kind='touchstone'`/`touchstone_meta`, but doesn't
   assert on `res.body.errors` contents. Is a bare 400 sufficient proof these are rejected for the
   RIGHT reason (schema `additionalProperties`/`enum` violation) rather than some other coincidental
   400 earlier in the handler chain? Trace the actual code path for at least one of these cases to
   confirm which check fires first.

**STOP. Write your Pass 2 findings now, before reading further.**

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dbo-8-touchstone-mechanic-identity-split.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY. Do NOT read `## Dev Agent Record`
   yet.
2. Check the diff against each AC's literal wording (AC1 through AC8) — in particular:
   - AC4's claim that `validateTouchstones` "keeps its cap (max 6) and humanity-in-anchor-range
     checks" — confirm both are still genuinely present and correct, not accidentally weakened during
     the trim.
   - AC8's claim that the new tests "prove... `edge_id`/`touchstone_meta`/`'touchstone'` (as a
     `KIND_ENUM` value) are genuinely gone from both schemas" — confirm the new tests actually
     exercise the SCHEMA layer (not just route-level business logic that happens to also reject these
     cases for an unrelated reason).
3. Write your Pass 3a findings now, before moving on.

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:** deleting the one live
orphaned `relationships` document from production (the cleanup script is dry-run-only by design;
`--apply` is explicitly Angelus's own future action); TM Wiki's own 31-6 story (a different repo);
any redesign of `touchstones[]` beyond dropping `edge_id` (the story is a removal, not a redesign).

### Pass 3b - now read the author's record and check it against reality

4. Read the `## Dev Agent Record` in full. It makes specific claims — verify by running, not reading:
   - "Full regression: 24 test files... 394 tests, all green." Run the gate command below and
     compare.
   - The cleanup script's dry-run-against-live-DB claim ("found exactly the one document the
     pre-story investigation named") — you cannot verify this yourself (forbidden from touching live
     `tm_suite`); note it as unverifiable-by-you, not accepted or rejected.
   - "Confirmed via repo-wide grep that no live code path references
     edge_id/touchstone_meta/touchstone_edge_ids any more outside of explanatory comments" — you
     already did your own sweep in Pass 2, item 1; compare your result against this claim directly.
5. Flag anything FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED.
6. State plainly whether this is ready to ship as-is.

## Output

Write to
`specs/stories/code-review/dbo-8-touchstone-mechanic-identity-split-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each tagged `[Pass 1]`/`[Pass 2]`/`[Pass 3a]`/`[Pass 3b]`. Write
`- None found.` under any empty heading.

For each finding: one-line title, severity, file:line, triggering input/sequence, observable
consequence, confidence.

Close with **Validation notes**: files opened per pass, every command run with its real result
(including `cd server && npx vitest run tests/api-characters.test.js tests/api-characters-carthian-pull.test.js tests/api-characters-crud.test.js tests/api-characters-public-fields.test.js tests/api-characters-safe-place-locations.test.js tests/api-relationships.test.js tests/api-relationships-for-character.test.js tests/api-relationships-mutual.test.js tests/api-relationships-player-create.test.js tests/api-relationships-player-edit.test.js tests/api-touchstone-edges.test.js tests/dbo-8-orphaned-touchstone-edges-cleanup.test.js` as the primary gate), anything you could not run and why, confirmation you modified nothing (or restored and verified).
