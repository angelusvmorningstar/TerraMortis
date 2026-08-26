# Adversarial review - admr-1-retire-bloodlines-admin (Retire Bloodlines admin authoring from TM Game), TM Game

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
   `specs/stories/code-review/admr-1-retire-bloodlines-admin-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/admr-1-retire-bloodlines-admin-diff.txt` and is relative to that root,
  taken as `git diff d581550d 6e925f29` (both real commits on the current branch, so you can
  reproduce it yourself: `git show d581550d:server/routes/bloodlines.js`, etc.).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/admr-1-retire-bloodlines-admin.md`, `specs/stories/sprint-status.yaml`) are excluded
  from it on purpose, so the earlier passes stay genuinely blind to the author's own account. Do not
  treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo is `TM Game`, one of four sibling apps in an
  umbrella workspace (`TM Story`, `TM Herald`, `TM Admin` alongside it) - do not read or touch any of
  the sibling directories even to check something; everything you need is inside this repo.
- Node/vitest environment: `cd server && npm test` runs the full suite against a real MongoDB Atlas
  test database (`tm_game_test`), reachable from this machine - no local mongod needed, but it is a
  live network dependency and the full run takes roughly 5-10 minutes. Prefer targeted runs
  (`npx vitest run tests/<name>.test.js`) for anything you need to verify quickly, and only run the
  full suite if you need the whole-repo picture. **This repo's own `CLAUDE.md` documents a real,
  pre-existing pool of unrelated failing tests, wider than the doc fully catalogues** (missing test-DB
  seed data for several `*-parallel-write.test.js`/`cm-*` suites, plus a few stale literal-snippet
  assertions) - if a test file you did not touch fails, check `CLAUDE.md`'s "Known pre-existing
  failures" section and/or a `git stash` A/B against `d581550d` before treating it as caused by this
  diff.
- **Blast radius note**: `server/routes/bloodlines.js`'s surviving `GET /` route is read by
  `public/js/data/bloodlines-cache.js`, which every character sheet in BOTH `admin.html` and the
  player-facing suite app depends on to price disciplines (3 XP/dot in-clan vs 4 XP/dot out-of-clan).
  A mistake in the kept route, or in anything the removed code shared with it, breaks discipline
  costing for every bloodline character in the live game, not just the admin screen this diff retires.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/bl1-bloodlines-api.test.js tests/bl3b-constants-deleted.test.js
  tests/bl3b-archived-seed-smoke.test.js tests/bl1-bloodline-schema.test.js
  tests/bloodline-slug.test.js` (the five files this diff is directly responsible for). Report the
  real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/admr-1-retire-bloodlines-admin-diff.txt` and **nothing
else**. No spec, no story file, no project context. Do not explore the repository. Do not go looking
for the spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

An ST-facing admin authoring screen for a `bloodlines` collection (create/edit/delete, plus an
"impact preview" of who references a bloodline) is deleted from this repo, on the theory that a
separate app now owns that authoring surface. The server route file that used to serve both the admin
screen and a public read is trimmed down to just the public read. Two library modules the deleted
write routes used to call (`bloodline-slug.js`, `bloodline-name-index.js`) are left in place. Several
test files are deleted, one new test file is added, and two existing test files are edited.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `server/routes/bloodlines.js`'s surviving `GET /` handler: does it behave IDENTICALLY to before
   the trim (same projection, same sort, same response shape)? Diff the kept handler's own lines
   against what they were pre-change and confirm nothing shifted.
2. The `buildBloodlinesRouter(authMiddleware)` factory now has an entirely unused `authMiddleware`
   parameter. Is that genuinely harmless, or does keeping a parameter whose name implies
   authentication-gating on a router that now has NO auth-gated routes at all risk misleading a future
   reader into assuming this route is protected when it is not?
3. `public/js/admin.js`'s two edits: the import line and the domain-dispatch call for the deleted
   admin screen are removed. Is anything ELSE in this file still referencing the deleted module or
   its exports (`initBloodlinesAdmin`, or any function that used to live in `bloodlines-admin.js`)?
4. `public/admin.html`'s removed sidebar button and domain section (`#d-bloodlines`,
   `#bloodlines-content`): is there any other markup, inline script, or CSS selector in this same file
   still referencing either id that would now silently target nothing?
5. `server/ws.js` is untouched by this diff and still exports `broadcastBloodlineUpdate` - but every
   call site that used to invoke it was inside the routes just deleted. Is this function now called
   from ANYWHERE in the repo? If not, is leaving it in place (rather than also deleting it) a real gap
   worth flagging, or a defensible scope boundary (it lives in shared WS broadcast infrastructure, not
   route-specific code)?
6. `bl1-bloodlines-api.test.js` is substantially rewritten: a new describe block asserts that six
   different HTTP verb/path combinations against `/api/bloodlines/*` now return 404. Read the
   assertions literally - do they test what their own `it()` description claims, or could a passing
   assertion be trivially satisfied (e.g. checking status without checking the response actually came
   from this router rather than some unrelated catch-all)?
7. `bl3b-constants-deleted.test.js`'s rewritten "AC 6" block asserts a NEGATIVE (`toEqual([])`) about
   import sites of `ensureBloodlineNameIndex`, immediately followed by a second test asserting the
   ONE known survivor (an archived script) still imports it. Could the first assertion pass
   vacuously - e.g. if the `walkJs`/regex helper it depends on silently fails to find real importers
   at all, would the test still report green?
8. The new `bloodline-slug.test.js`: does every import it uses actually resolve (check for a stale
   relative path left over from wherever this content used to live), and does it duplicate coverage
   that already exists elsewhere in the suite, or genuinely add net-new coverage?
9. Dead code, unused imports, self-contradiction within the diff itself (a comment claiming something
   is removed while a call site nearby still reaches it, or vice versa).

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/admr-1-retire-bloodlines-admin-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1: an ST-facing bloodlines admin screen and five of its six server routes are
removed from this repo; the public `GET /` route and two library modules the removed routes used
(`server/lib/bloodline-slug.js`, `server/lib/bloodline-name-index.js`) are kept because something else
in the repo still needs them.

### What to hunt for

1. **Trace every remaining caller of `bloodline-slug.js`'s `deriveSlug` and
   `bloodline-name-index.js`'s `ensureBloodlineNameIndex` by hand.** Read
   `server/scripts/archive/seed-bloodlines.js` in full and confirm it genuinely still calls both, with
   real, reachable call sites (not just an import that is never invoked). Then grep the WHOLE repo
   (not just `server/`) for any other caller either function might have that a narrower search could
   miss - a client-side bundler config, a build script, anything under `public/` that isn't obviously
   named "bloodline".
2. **Route registration order.** `server/index.js` mounts `buildBloodlinesRouter(...)` at
   `/api/bloodlines`. With only `GET /` left in the router, confirm a request to
   `/api/bloodlines/anything` genuinely falls through to whatever this app's own global 404 handling
   is, rather than being caught by some OTHER route registered elsewhere that happens to also match
   `/api/bloodlines/*` (check for any wildcard, catch-all, or static-file-serving middleware mounted
   before or after this router that could intercept it instead).
3. **`public/js/data/bloodlines-cache.js`'s two call sites of `apiGet('/api/bloodlines')`
   (`loadBloodlines()` and `refetchBloodlines()`).** Trace both all the way through to confirm neither
   was affected by anything in this diff - they call the same URL, but confirm nothing about
   `server/db.js`'s `getCollection`, the Express app's middleware chain, or CORS/auth headers changed
   in a way that could affect an unauthenticated GET even though the route body itself looks
   unchanged.
4. **Fixture/mock shape check.** `bl4-bloodlines-write-api.test.js` and
   `bl4-bloodlines-admin-view.test.js` are deleted outright. Walk every `describe`/`it` in both
   (recoverable via `git show d581550d:server/tests/bl4-bloodlines-write-api.test.js` and the sibling
   file) and confirm each one exercised ONLY code this diff actually removed - flag anything that
   might have been covering a still-live code path (e.g. a shared helper, a schema validation rule,
   or a discipline-list check that the kept `GET /` route or `bloodlines-cache.js` also depends on).
5. **`server/schemas/bloodline.schema.js` and `bl1-bloodline-schema.test.js`, both left untouched by
   this diff.** With every write route gone, nothing in this repo calls `ajv.compile(bloodlineSchema)`
   at runtime any more except that one test file. Is the schema file still earning its place as a
   genuine shape-contract, or is `bl1-bloodline-schema.test.js` now testing something with zero
   production consumer in this repo at all - and if so, does that matter?
6. **`server/tests/helpers/bloodline-fixtures.js`**, used by both `bl3b-constants-deleted.test.js` and
   the new `bloodline-slug.test.js`: confirm both files' usage still agrees on its shape and that
   nothing about the fixture file itself needed to change as a consequence of this diff.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/admr-1-retire-bloodlines-admin-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/admr-1-retire-bloodlines-admin.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps:
- Rewriting TM Admin's own equivalent bloodlines feature, or verifying its behaviour matches
  byte-for-byte (a different repo, not touchable from here, and the story's own AC #2 explicitly notes
  this was checked at the route-surface level only).
- Building a fix for the live cross-app WebSocket update gap this diff surfaces (an ST edit made
  through TM Admin will not live-broadcast to an already-open TM Game tab until reload) - the story's
  own AC #4 requires this to be NAMED, not fixed, and left for a human decision.
- Any work on Devlog or Data Portability - those are separate stories in the same epic
  (`specs/epic-admin-retirement.md`), not this one.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims, among them:
   - That `deriveSlug`/`bloodline-slug.js` and `ensureBloodlineNameIndex`/`bloodline-name-index.js`
     each have exactly one remaining live caller (the archived seed script), and that this was found
     mid-implementation after an earlier attempt to delete both wholesale.
   - That `bl3b-constants-deleted.test.js` needed an unanticipated fix to its own "AC 6" block.
   - That the five bloodline test files this story owns pass 85/85 in isolation.
   - That a representative sample of ~8 unrelated failing test files was individually confirmed
     pre-existing via `git stash` A/B against commit `d581550d`.
   - That `git diff --stat` matches the story's own stated File List with no incidental churn.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/admr-1-retire-bloodlines-admin-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the five-file vitest command named in Ground
  rules above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
