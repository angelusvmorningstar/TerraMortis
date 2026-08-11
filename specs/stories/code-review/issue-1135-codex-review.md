# Adversarial review - issue-1135 (Delete eight redundant tabs from the Game App, and scrap the ticket system), TM Suite

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
   `specs/stories/code-review/issue-1135-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/issue-1135-diff.txt` and is relative to that root, taken against base
  commit `40cee7fb`. The branch has **zero commits** on top of that base, so the diff is the
  working tree vs `origin/main` and you can reproduce it yourself.
- The diff is **deliberately scoped to source and tooling only**. The story spec and
  `sprint-status.yaml` are excluded from it on purpose, so the earlier passes stay genuinely blind to
  the author's own account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo sits in an umbrella workspace beside three
  sibling repos: `../TM Cockpit`, `../TM Wiki`, `../TM Herald`. Do not modify any of them. You MAY
  **read** exactly two files outside this repo, because the change's correctness depends on them:
  `../TM Herald/services/announcements.js` and `../TM Wiki/server/routes/wiki-relationship-board.js`.
  Read-only, nothing else outside this repo.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards, disclose rather than skip:**
  - Playwright's config uses `reuseExistingServer: true` on **port 8080**. An http-server may already
    be running there from an earlier session. If a run behaves oddly, check what is on 8080 before
    trusting the result.
  - The Chromium binary may not be installed (`npx playwright install chromium`). If it is missing
    **every** test fails with an install banner rather than a real assertion - do not report that as
    a code failure.
  - `tests/desktop-and-css.spec.js` takes **~10 minutes** and `tests/admin.spec.js` takes **over 10
    minutes** (many tests burn a 60s timeout each). Budget for it or say you skipped it.
  - `server` vitest needs a local **mongod**; without it ~1074 tests silently SKIP rather than fail
    (known issue #1117). If your run skips, say so - a skipped suite is not a passing suite.
- **Blast radius.** `public/css/components.css` and `public/css/suite.css` are shared stylesheets.
  `components.css` is loaded by **both** `index.html` and `admin.html`; `suite.css` is loaded by
  `index.html` only. This change deletes **164 CSS rules** across the two. A wrong deletion here
  silently breaks surfaces this diff never mentions, and CSS fails silently - nothing throws.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  - `npx playwright test tests/issue-1135-deleted-tabs.spec.js --reporter=line`
  - `npx playwright test tests/fin-checkin-finance.spec.js tests/issue-502-devlog-tab.spec.js --reporter=line`
  - `cd server && npx vitest run tests/api-devlog.test.js tests/api-relationships.test.js`
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1135-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A pure-deletion change. It removes eight tabs from a single-page "Game App" (`public/index.html` +
`public/js/app.js`) - World, Primer, Game Guide, Rules, NPCs, Tickets, Finance, Devlog - by deleting
each one's registration points, its container `<div>`, and its renderer module. It additionally
scraps a ticket system end to end: an Express route and schema, a mount in `server/index.js`, an
admin domain in `admin.html`/`admin.js`, a stylesheet, and a player-facing "Submit a Ticket" form in
the Settings tab. It deletes 164 CSS rules said to belong only to the removed surfaces, retires one
test spec, surgically edits three others, and adds one new spec asserting the removals. It claims to
add no new behaviour whatsoever.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **Trivially-satisfiable assertions in `tests/issue-1135-deleted-tabs.spec.js`.** This is the
   single biggest risk in the diff. Nearly every assertion is `toHaveCount(0)` - which passes if the
   selector is malformed, if the page never booted, or if the app silently errored to a blank screen.
   For **each** test, ask: *would this still pass if `index.html` served an empty body?* Identify
   every test that has **no positive control in the same test** proving the app actually rendered.
   Note which ones do have such a control and which rely on a control living in a *different* test.
2. **`page.on('pageerror')` registration order.** Several tests register the error listener **after**
   `setupSuite(page)`/the navigation (see roughly lines 116-118 and 134-136), and others register it
   **before** (roughly 172-174, 195-196). Work out precisely which boot-time errors are therefore
   invisible to the tests that claim "nothing threw", and whether any test's error assertion is
   consequently vacuous.
3. **Dead code the deletion created but did not remove.** Search `public/js/app.js` for an `_svg`
   icon-map object. Entries are referenced as `_svg.<name>`. Determine which entries now have **zero**
   references anywhere in the file. (The author suspects at least three; confirm the real number and
   name them.) Report any other object/constant/import left holding entries only the deleted tabs used.
4. **Selector-list surgery in CSS.** The diff edits two multi-selector rules in `suite.css` by
   removing a single selector from a comma-separated list (search for `#t-ordeals` and `#t-whos-who`).
   Verify by reading the final file that: no dangling or doubled comma was left, no rule was left with
   a trailing comma before `{`, and the surviving selectors are exactly the intended set. A malformed
   selector list makes a browser drop the **entire** rule silently.
5. **CSS deleted by prefix vs CSS actually in use.** The change deletes every rule whose selectors all
   begin `.rel-`, `.fin-`, `.primer-`, `.devlog-`. A prefix-based census cannot see a class name built
   at runtime. Grep the surviving source for **dynamic class construction** - template literals or
   concatenation like `` `fin-${x}` ``, `'rel-' + kind`, `classList.add('devlog-' + status)` - that
   would produce one of the deleted class names. Also check `.rel-` specifically: it is a short,
   generic prefix and the most likely to have collided with something unrelated.
6. **Did every deleted rule really belong to a deleted surface?** Spot-check the deleted `.fin-*`
   rules against `public/js/game/signin-tab.js`, which is **kept**. The retired module
   `public/js/game/finance-tab.js` and the kept `signin-tab.js` are siblings that shared an epic and a
   test file; confirm the kept one does not render any class the diff deleted.
7. **Registration points that were missed.** The diff removes each tab from what appear to be four
   places (a nav array, a "more apps" array, a `goTab` dispatch, and a subtitles map). Read `app.js`
   in the diff and find any **fifth** place a tab id is registered - an alias map, a badge checker, a
   role/condition filter, a persisted "last tab" value, a hardcoded `goTab('...')` call. Report any
   deleted id still named anywhere.
8. **`goTab` behaviour for a now-unknown id.** Read the post-change `goTab`. Confirm what it does when
   handed a deleted id: does it clear the active tab and leave the user on a blank screen? Is that
   reachable by a real user (a stale persisted tab id, a bookmark, a hash) rather than only by a test
   calling it directly? If it is reachable, that is a user-visible dead end, not a no-op.
9. **Mock-handler removal fall-through.** The diff removes ticket handlers from
   `public/js/dev-fixtures.js` and `public/js/dt-proto-boot.js`. Read the surrounding interceptor: when
   a path no longer matches any handler, does it fall through to a real network call, return
   `undefined`, or throw? Confirm removing the handler cannot break the interceptor for *other* paths.
10. **Server route removal.** In `server/index.js`, confirm the removed import and `app.use` leave no
    unused import behind and no other mount depending on ordering that changed. Check whether anything
    else in the diff still references `/api/tickets`.
11. **Self-contradiction within the diff.** The test edits claim certain things were "retired". Check
    the retired tests were actually removed rather than left present-but-vacuous, and that no edited
    spec now has an orphaned helper, fixture, or import it no longer uses.
12. **Comment/code drift.** Several comments were rewritten in this diff. Check each rewritten comment
    against the code it now sits above - in particular the block above `initSpheresSurface` in
    `app.js`, which was assembled from two previously-separate comment blocks.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/issue-1135-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

A pure-deletion change removing eight tabs from the Game App and scrapping a ticket system across
client, admin and server. 164 CSS rules deleted from two shared stylesheets. One spec retired, three
edited, one added.

### What to hunt for

1. **The `npcr-` boundary - the highest-consequence check in this pass.** The deleted module
   `public/js/tabs/relationships-tab.js` (see the diff) used a set of `npcr-*` CSS classes. The change
   claims it deleted **none** of them because every one is shared with surviving code. Verify this
   independently and **field by field**: extract the full set of `npcr-*` classes the deleted module
   referenced, then for **each one** confirm it is still emitted by at least one surviving file
   (candidates: `public/js/admin/npc-register.js`, `public/js/admin/relationship-editor.js`,
   `public/js/editor/edit.js`, `public/js/tabs/downtime-form.js`). If **any** class in that set is now
   emitted by nothing, its CSS is dead; if any `npcr-` rule was deleted, a live admin surface is now
   unstyled. Report either direction. Run
   `git diff 40cee7fb -U0 -- public/css/components.css | grep -c "npcr-"` and report the real number.
2. **Reverse the CSS check: orphaned rules vs orphaned classes.** For each of `.rel-`, `.fin-`,
   `.primer-`, `.devlog-`, do the check in *both* directions. (a) Does any **surviving** file still
   emit a class whose rule was just deleted (→ unstyled live surface)? (b) Does any **surviving** rule
   reference a deleted surface (→ dead CSS left behind)? Pay attention to rules scoped by **element
   id** rather than class - `#t-primer .reading-pane`, `#t-finance.active` and similar - which a
   class-prefix search will not find. Search the final `suite.css` and `components.css` for `#t-`
   followed by any of the eight deleted tab ids.
3. **`.reading-pane` in particular.** The diff removes `#t-primer .reading-pane` from a shared
   three-selector rule. Confirm the base `.reading-pane` rules survive and that every other consumer
   (there are several files under `public/js/tabs/` and `public/js/editor/`) still renders correctly -
   i.e. the deletion took only the `#t-primer`-scoped override and not the shared definition.
4. **Empty-section rendering.** Removing the last tile from a nav section could leave a section header
   with nothing under it. Find both render sites in `app.js` (the "more grid" and the desktop sidebar)
   and confirm by reading the code what each does when a section's filtered app list is empty. Then
   confirm the section list itself was updated consistently with the tiles. Check the **role and
   feature-flag filters** too: a tile hidden by a `guide`/`stOnly`/`coordinatorOnly` flag is not the
   same as a tile that does not exist, and the two render sites do **not** apply the same filters -
   verify whether that asymmetry matters now.
5. **Role paths not covered by the tests.** The removed Finance tab was gated `coordinatorOnly`; the
   removed NPCs and Tickets tiles were `stOnly`. The new spec appears to test only an **ST** fixture.
   Walk the code for a **coordinator** role and for a plain **player**: does any surviving code path
   still reference a removed tab id for those roles? Is there any role for which the nav now renders
   an empty section, a broken tile, or nothing at all?
6. **The persisted-tab path.** Find every place a tab id is read back from `localStorage` or derived
   from the DOM and re-dispatched (look for a value derived from `.tab.active` and passed to `goTab`).
   Trace what happens for a user whose stored/derived tab is one of the eight deleted ids. Does it
   recover to a sensible default, or strand them?
7. **The check-in surface, which must be unaffected.** `public/js/game/signin-tab.js` survives and
   shares `public/js/game/payment-helpers.js` with the deleted `finance-tab.js`. Confirm
   `payment-helpers.js` is intact and that no export it provided **only** to finance-tab is now
   unused. Then confirm the check-in still renders: its own spec covers only a nav label and a
   dropdown, which is thin - read the module and check nothing it renders lost its CSS.
8. **Admin app integrity.** `public/admin.html` lost a stylesheet link, a sidebar button and a domain
   `<section>`. Confirm no remaining admin code queries `#d-tickets`, `#tickets-admin-content` or
   `[data-domain="tickets"]`, and that the admin domain-switching logic cannot land on a domain that
   no longer exists (check how it picks a default and how it handles an unknown `data-domain`).
9. **The external consumer.** `../TM Herald/services/announcements.js` polls a TM Suite endpoint.
   Read it (read-only) and confirm the endpoint it polls still exists and is still mounted in
   `server/index.js` after this change. If the diff removed the route it depends on, that is a High.
10. **Route/matcher order in `server/index.js`.** Removing one `app.use` can change which handler a
    path falls through to. Confirm no surviving route now shadows or is shadowed differently, and that
    a request to the removed path returns a clean 404 rather than being swallowed by a catch-all,
    a static handler, or an SPA fallback. **Actually start the server and curl the removed path** if
    you can; if you cannot, say so.
11. **Fixture vs real consumer.** `tests/fin-checkin-finance.spec.js` kept a session fixture that
    still carries a `finances` sub-object even though the finance UI is gone. Check nothing reads it
    in a way that now diverges from the real API shape, and that the trimmed file has no fixture or
    helper left dangling.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/issue-1135-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/issue-1135-delete-eight-tabs.story.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the 16 acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written. AC14 ("no `npcr-*` rule is touched") and AC15
     ("targeted suites green, no new failures") are the two most precisely worded; hold them to it.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing. In particular it forbids deleting
     `renderCityTab`, forbids touching the `tickets` collection, and forbids fixing a named
     pre-existing duplicate key.
   - Specified behaviour that is missing, or present only in appearance. **AC8 says a call to
     `/api/tickets` returns 404. Check whether ANY test actually asserts that**, or whether it is
     merely true by construction and untested.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Settled decisions - explicitly NOT in scope, and deliberate. Do not flag these as gaps:**

- The `tickets` collection (69 docs) is **deliberately not dropped**. Code only. A full export was
  taken first. Dropping it needs separate authorisation.
- The 19 open tickets are **deliberately not converted** into GitHub issues in this story.
- `game_sessions` finance fields (`expenses[]`, `transfers[]`, balance, notes) are **deliberately
  left in place and uneditable**. That is the intended end state, not an oversight.
- `renderCityTab` is **deliberately left** as an unreferenced export in a surviving file.
- A duplicate `territory` key in the subtitles map is **pre-existing and deliberately not fixed**.
- The devlog route, schema, admin authoring surface and its 13 entries **deliberately survive**; only
  the player-facing tab went.
- No replacement player-facing "propose a tie" path is built. Canon tie creation becoming ST-only is
  an accepted consequence.
- `tests/desktop-and-css.spec.js` has **pre-existing failures unrelated to this change** (a header
  toggle never becomes visible under the stubbed API). Judge only whether this change made it *worse*.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims. Attack these:
   - **"12 passed (14.0s)"** for `tests/issue-1135-deleted-tabs.spec.js`. Run it. Report the real count.
   - **"7 passed"** for the fin + devlog specs, and **"53 passed"** for the two server vitest files
     with **"real runs (mongod present, not skipped)"**. Run both. If yours skip, the claim is
     unverifiable-as-stated in this environment - say so.
   - **"Baseline before any edit: 13 failed / 7 passed"** for `desktop-and-css.spec.js`, now
     "12 failed / 7 passed", with **"zero new failures"**. You can verify the *current* half directly.
     The baseline half is a claim about a tree that no longer exists - you can reconstruct it
     (`git stash` is forbidden; instead check out the base version of the relevant files into a temp
     dir, or reason from `git show 40cee7fb:<path>`). Say explicitly which half you verified.
   - **"8 failed / 4 passed against HEAD vs 12/12"** - the author's discrimination claim, i.e. that
     every deletion assertion fails against the pre-change code. This is the load-bearing evidence
     that the new tests are not vacuous. Reproduce it if you can; if you cannot, say so plainly rather
     than accepting it.
   - **"Zero `npcr-` rules touched"**, evidenced by a grep returning 0. Run that grep yourself.
   - **"All 16 ACs satisfied."** Test it AC by AC. AC8 in particular (see 3a above).
   - **"braces balanced in both CSS files"** and **"79 rules from `suite.css`, 85 from
     `components.css`"**. Verify the brace balance yourself. The rule counts are harder - say so if
     you cannot confirm them exactly.
   - **"Six stale comments corrected"** and the claim that the ADM-1 documentation references were
     repointed. Grep the repo for remaining references to the deleted ticket surface in `specs/` and
     report any the author missed.
   - The **Declared deviations** section. Each is an admission; check each is *complete* rather than
     partial - an honest-sounding deviation can still understate its own scope.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/issue-1135-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the three gate commands above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
