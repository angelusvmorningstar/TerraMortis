# Adversarial review — oaq.3 (New ST tab — approval queue view), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this — read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/oaq-3-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you — if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap — see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oaq-3-diff.txt`
  and is relative to that root, taken against base commit `ab8145ad` (the working tree is currently
  UNCOMMITTED beyond that — the diff file captures the real current state either way, so work from
  the diff file, not from `git diff` yourself, in case anything shifts).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/oaq-3-st-tab-approval-queue-view.md`, `specs/stories/sprint-status.yaml`) are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo is one of four sibling repos in an umbrella
  workspace (`D:\Terra Mortis\TM Cockpit`, `TM Wiki`, `TM Herald`) — do not touch any of them even to
  read.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- MongoDB is a real 3-node Atlas replica set (`MONGODB_URI` in `server/.env`) — transactions
  genuinely work, no local mongod needed. `fileParallelism: false` in vitest config. The admin app
  (`public/admin.html`) has no browser test harness in this repo — client-side JS correctness for
  `public/js/admin/office-approvals.js` must be verified by reading + reasoning + the static-analysis
  test file, not by driving a real browser.
- Blast radius: `server/routes/office-actions.js` is shared infrastructure already hardened across
  two prior review rounds (issue-1143, oaq.2) — a mistake in the new route or the additive
  `resolved_by`/`declined_by` fields could affect the whole Status Actions pipeline, not just this
  tab. `public/js/admin.js`'s `switchDomain` function is the dispatch chain for EVERY admin tab, not
  just this one — a mistake in how this diff hooks into it could break sibling tabs' dispatch, not
  just this feature's own.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed
  gap is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/oaq-3-approval-queue.test.js tests/oaq-2-pending-status-actions.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js tests/issue-873-ecm-6-admin-sidebar.test.js`.
  Report the real numbers even if they disagree with anything the story claims — especially then.

---

## PASS 1 — BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oaq-3-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

### What this diff claims to be

A new `GET /api/office_actions/pending` route (ST-only) lists pending Status Action records. The
existing `PUT /:id/accept` and `PUT /:id/decline` routes (built by a prior story, unchanged in their
core transaction/budget/precondition logic) are additively extended to record `resolved_by`/
`declined_by` (the acting ST's username), and their shared 409 "no longer pending" response is
enriched to name who already acted. A new admin-app tab module
(`public/js/admin/office-approvals.js`) lists the queue, polls it every 10 seconds, and lets an ST
accept/decline each row via a single delegated click handler. `public/admin.html`/`public/js/admin.js`
gain the sidebar button, domain section, import, and dispatch line to mount the new tab.
`public/css/admin-layout.css` gains two small class groups (`.dt-btn-danger` for the Decline button;
`.oaq-row-actions`/`.oaq-row-error` for row layout).

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. In `office-actions.js`'s `_findPending`, the enriched 409 message picks `resolved_by` or
   `declined_by` via `doc.status === 'resolved' ? doc.resolved_by : doc.status === 'declined' ?
   doc.declined_by : null`. Is there any reachable `contested_roll_requests` status value for a
   `status_action` record other than `pending`/`resolved`/`declined`? If so, what does the message
   read for that case — could it read "already actioned by undefined" or similarly broken?
2. `GET /pending`'s placement in the router — walk the WHOLE file for any other route whose pattern
   could shadow or be shadowed by `/pending` (Express matches path segments literally here, but
   check there is genuinely no `GET /:id`-shaped route anywhere in this router that `/pending` could
   collide with, and that route declaration ORDER doesn't matter here — confirm rather than assume).
3. In `office-approvals.js`, `_pollTick()` calls `_rootEl.closest('.domain')?.classList.contains
   ('active')` and returns early if falsy. Trace: is `_rootEl` ever null/detached at the moment a
   poll tick fires (e.g. after a hypothetical future removal of the section, or before first mount)?
   Does `.closest()` on a detached-but-still-referenced element throw, return null, or silently do
   the wrong thing?
4. `_resolve(requestId, action)` removes the row from local state on success
   (`state.rows.filter(r => String(r._id) !== requestId)`) without re-fetching. Is there a scenario
   where the server's actual current state (post-mutation) genuinely diverges from what this local
   removal assumes — e.g. does a successful accept ever NOT mean the record left the pending set?
5. `busyIds`/`errorById` are `Set`/`Map` keyed by `requestId` — a string read from
   `btn.dataset.oaqId`. Rows are matched via `String(r._id) !== requestId`. Confirm there's no
   type-coercion gap between how the id is written into the DOM (`data-oaq-id="${esc(id)}"`, where
   `id = String(r._id)`) and how it's read back — could `esc()` alter the string in a way that breaks
   the later `String(r._id) !== requestId` comparison (e.g. HTML-entity-escaping a character that
   appears in a MongoDB ObjectId hex string)?
6. Self-contradiction check: the diff's own comments state "No WebSocket broadcast is required" /
   "polling... skipped while this tab isn't the active domain". Confirm no broadcast code (a call
   into `server/ws.js` or similar) was actually added anywhere in this diff, and confirm the
   `.active`-class skip logic is actually reachable (not dead code that never runs because the
   condition is always true or always false).
7. Dead code / unused imports / unreachable branches anywhere in the diff.
8. `.dt-btn-danger:hover { background: var(--crim-a15); }` — is `--crim-a15` a token that's actually
   defined somewhere (theme.css), or a typo'd/nonexistent custom property that would silently no-op?
9. `_refetchAndRender()`'s catch block only logs to console and leaves `state.rows` unchanged on a
   fetch failure — if the FIRST fetch ever fails (mount-time network blip), does the tab get stuck
   showing "Loading…" forever, or does it fall through to the empty state incorrectly?

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oaq-3-codex-findings.md` now,
before reading further.**

---

## PASS 2 — EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent — work from the code itself.

### Orientation (not ground truth — verify against the code)

Same shape as Pass 1's summary above.

### What to hunt for

1. Read `public/js/admin.js`'s `switchDomain` function in full. Trace the EXACT sequence when a user
   clicks the new "Approval Queue" sidebar button: does `.active`/`on` class toggling correctly reach
   the right elements, and does `initOfficeApprovals` receive a genuinely mounted, visible root
   element on first call? Does switching AWAY from this tab and back re-trigger `initOfficeApprovals`
   correctly (is `state.initialized` module-level state safe across repeated activations, or could a
   second activation double-attach the delegated listener — re-read `_attachDelegatedHandlers` being
   gated by `if (!state.initialized)` and confirm this is actually sufficient)?
2. Read `public/js/game/challenge-notification.js`'s poller in full and compare against
   `office-approvals.js`'s poller. Both poll independently (10s each) once the app is loaded — is
   there any shared resource (a DOM element id, a global timer name, a shared badge element) they
   could collide on? (`challenge-notification.js` updates `#more-badge` — confirm `office-approvals.js`
   never touches the same element.)
3. Grep the WHOLE codebase for any pre-existing use of `.dt-btn-danger`, `.oaq-row-actions`, or
   `.oaq-row-error` before this diff — confirm these are genuinely new names, not accidentally
   colliding with something already meaning something else elsewhere.
4. Read `server/middleware/auth.js`'s `requireRole` in full and confirm `GET /api/office_actions/pending`
   (gated `requireRole('st')`) is correctly reachable by BOTH `st` and `dev` roles (the codebase's own
   stated equivalence — `dev` is a privacy-redacted ST role) and correctly rejects `player`/
   `coordinator` roles. Trace the actual `effective` roles array logic by hand for each case.
5. Trace `_resolve()`'s error path against a REAL 409 response shape from `_findPending` end to end:
   does `public/js/data/api.js`'s `request()` function's `throw new Error(msg)` (where `msg =
   data.message || data.error`) actually carry `_findPending`'s enriched message string
   ("...already resolved by X") all the way through to `err.message` in `office-approvals.js`'s catch
   block? Trace it by hand, don't assume.
6. Walk `computeNewStatus`/the accept transaction in `office-actions.js` once more with this diff's
   changes applied — confirm the NEW `resolved_by`/`declined_by` field writes are genuinely inside
   the existing transaction boundary (for accept) and don't introduce a second, un-transacted write
   that could diverge from the `status`/`outcome` fields under a race.
7. Is there any existing admin-app CSS selector that ALSO matches `.or-list-item` in a way this new
   module's rows would unintentionally inherit unwanted styling from (e.g. a click handler
   elsewhere delegated at a higher DOM level that also listens for `.or-list-item` clicks)? Grep for
   other consumers of `.or-list-item`'s click/hover behaviour.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oaq-3-codex-findings.md` now,
before reading further.**

---

## PASS 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/oaq-3-st-tab-approval-queue-view.md` — the **Story**, **Decisions already
   made**, **What this story is NOT**, **Acceptance Criteria**, and **Tasks/Subtasks** sections ONLY.
2. **Do NOT read the "Dev Agent Record" or "Senior Developer Review" sections yet.**
3. Against AC1–AC9, check the diff and the real code it touches for:
   - Violations of an AC's literal wording.
   - Deviations from stated intent — "What this story is NOT" and "Decisions already made" are
     equally load-bearing. In particular: does `accept()`/`decline()`'s transaction/budget/
     precondition logic genuinely remain untouched beyond the additive `resolved_by`/`declined_by`
     fields (AC's own explicit constraint)? Does the display layer genuinely avoid hardcoding
     `request_type === 'status_action'` as the ONLY possible value, per the story's stated
     forward-shape for Epic OXP?
   - Specified behaviour missing or present only in appearance.
4. **Write your Pass 3a findings down now, before moving on.**

**Settled decisions — do not re-litigate:**

- No WebSocket broadcast for instant push — deliberate, polling is the chosen mechanism.
- `initOfficeApprovals(rootEl)` takes no `chars` parameter — deliberate, this tab has no
  character-filter UI, unlike `st-mods-audit.js`'s.
- The story's OWN suggested CSS fallbacks (`.ch-btn-accept`/`.ch-btn-decline`,
  `.dt-appr-approved`/`.dt-appr-rejected`) were NOT used — this is a documented, deliberate deviation
  (recorded in the Dev Agent Record you'll read in Pass 3b) discovered during implementation, not an
  unexamined gap. You MAY independently verify the claims behind it (exactly the kind of checkable
  claim Pass 3b should test) but don't flag "story's suggestion wasn't followed" as a fresh finding
  on its own.
- No teardown hook was added for the poll on tab switch-away — deliberate; the poll tick itself
  checks the `.active` class instead, because no module in this codebase has ever had a teardown
  hook to extend.
- Epic OXP (the second pending-item type) and Epic ROLLS are explicitly out of scope. Do not flag
  their absence.

### Pass 3b — now read the author's record and check it against reality

5. Read the **Dev Agent Record** in full. Checkable claims include:
   - "Changed-area suite (6 files): 100/100 pass" — run it yourself.
   - "Full untargeted suite... 2422/2427 passed, 5 failed / 10 files failed... byte-identical to the
     established pre-existing baseline... No new failures" — spot-check the three named
     assertion-level failures (`n7-n9-allocator-readers.test.js`, `oath-a-pledge-helpers.test.js`,
     `epic.708.3-cycle-phase-controls.test.js`) and confirm they're unrelated to this diff (grep each
     for `office-actions`, `admin.html`, `admin.js`, `office-approvals`, `admin-layout`).
   - The claim that `.ch-btn-accept`/`.ch-btn-decline` live in `suite.css`, which `admin.html` never
     loads — verify by reading `admin.html`'s `<link>` tags and `suite.css`'s actual location.
   - The claim that `.dt-appr-approved`/`.dt-appr-rejected` are `.active`-gated toggle-state
     indicators, not one-shot action buttons — verify by reading their CSS rules and their existing
     call sites elsewhere in the codebase.
   - The claim that "exactly one delegated listener" exists in `office-approvals.js` (asserted by the
     new test file's own regex-count check) — verify independently by reading the file, not by
     trusting the test's own assertion of itself.
   - The AC4/AC5 live-reproduction claims (accept/decline record the acting ST's username; a stale
     accept/decline 409s naming who already acted) — reproduce them yourself.
6. **Verify each claim by running it, not reading it.**
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**.
8. State plainly whether this change is ready to ship, needs patches, or has a blocking problem.

---

## Output

Write everything to `specs/stories/code-review/oaq-3-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the gate command above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
