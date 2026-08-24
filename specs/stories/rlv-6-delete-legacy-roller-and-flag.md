# Story rlv.6: Delete `dice-engine.js` and its dead sidecar wiring

Status: done

## Story

As a developer maintaining TM Game,
I want the already-unreachable `dice-engine.js` admin dice roller and its orphaned wiring removed,
so that the codebase stops carrying dead code that could mislead a future reader into thinking the
admin app still has its own dice roller, or that this cleanup is still blocked on something.

## CRITICAL — this is NOT what the epic row originally said. Read this before Task 1.

The epic's own row for rlv.6 originally read "Delete `dice-engine.js`'s standalone dice math once
ported (rlv.4)" — implying this was a migration-completion cleanup, blocked on rlv.4 finishing first.
**That premise was wrong, investigated and corrected 2026-08-24 before this story was written.**
`dice-engine.js` (`public/js/admin/dice-engine.js`) is **already fully unreachable dead code**,
completely independent of anything rlv.4 did:

- `public/js/admin.js:37` imports `initDiceEngine` but **never calls it anywhere in the file**
  (confirmed by grep — the import is the only occurrence of the name).
- `public/js/admin.js:320`'s `switchDomain()` has `if (domain === 'engine') { /* Engine tab removed
  — dice, feeding, session tracker were Engine-only tools */ }` — a no-op that can never fire, because
- `public/admin.html` has **no sidebar button with `data-domain="engine"`** and **no `#d-engine`/
  `#engine-content` element anywhere** (confirmed: `grep -in engine public/admin.html` returns zero
  matches). The Engine domain's own nav entry was already physically removed from the HTML.
- This was already flagged in a 2026-06-17 investigation note
  (`specs/investigations/2026-06-17-session-handover-to-peter.md:80`): "**#846** delete dead
  `initDiceEngine` / `dice-engine.js` (zero callers, confirmed)."
- Its sibling Engine-domain tools, `feeding-engine.js` and `session-tracker.js`, were **already
  deleted** under issue #836 (`public/js/admin.js:38-41`'s own comment;
  `server/tests/issue-836-legacy-tracker-cache-removed.test.js:38-43` proves both files are gone).
  `dice-engine.js` is the one file of that original trio still physically present, purely because
  #836 didn't catch it too.

**This story is plain dead-code deletion, safe today, with zero dependency on rlv.4/rlv.5.** rlv.4
did not "port dice-engine.js's dice math out" — it built a fresh, independent implementation in
`app.js`/`char-pools.js`, never touching `dice-engine.js` itself. Nothing in rlv.4's diff or rlv.5's
(superseded) investigation changes what's safe to delete here.

## Acceptance Criteria

1. `public/js/admin/dice-engine.js` is deleted.
2. `public/js/admin.js` no longer imports `initDiceEngine` (line 37's import line removed), and the
   no-op `if (domain === 'engine') { ... }` branch inside `switchDomain()` (line 320) is removed.
3. `public/css/admin-layout.css`'s Engine-split-layout block — `/* ── Engine split layout ── */`
   through the `#dice-engine`/`#feeding-engine` rules (lines 2570-2756, ending at the blank line
   before `/* ── Player View link on character detail ── */`) — is deleted in full. The **separate**
   `#session-tracker` block starting at line 2760 (`/* SESSION TRACKER (Engine domain) */`) is
   **NOT** touched by this story — see "What this story is NOT" below.
4. `tests/admin.spec.js`'s `test.describe('Admin — Engine Domain', ...)` block (currently lines
   338-366 — 5 tests asserting `#dice-engine`/`#feeding-engine` render, has a character selector, has
   a roll button) is deleted, since the feature it tests no longer exists.
5. `tests/admin.spec.js`'s single `test('clicking Engine switches domain', ...)` (currently lines
   156-159, inside `test.describe('Admin — Sidebar', ...)`) is deleted — it asserts on a
   `data-domain="engine"` button and `#d-engine` element that no longer exist and never will again
   once this story lands; the concept of "the Engine domain" is fully retired, not just its dice tool.
6. A new vitest suite (mirroring `server/tests/issue-836-legacy-tracker-cache-removed.test.js`'s own
   pattern exactly — source-text/`fs.existsSync` checks, not a live import, since `admin.js`
   transitively pulls in browser globals) proves: `public/js/admin/dice-engine.js` no longer exists;
   `admin.js` no longer imports `initDiceEngine` or references `./admin/dice-engine.js`; `admin.js`'s
   `switchDomain()` no longer has an `if (domain === 'engine')` branch; `admin-layout.css` no longer
   contains a `#dice-engine` rule.
7. Every OTHER admin domain (Player, City, Spheres, Downtime, Attendance/Next-Session, Data,
   Ordeals, Rules) continues to render and switch exactly as before — this is a pure subtraction of
   already-dead code, not a restructuring of `switchDomain()`'s other branches or `admin-layout.css`'s
   other rules.

## What this story is NOT

- **NOT a fix for `tests/admin.spec.js`'s "Admin — Next Session Panel" describe block** (currently
  lines 180-244, ~7 tests). **Found during this story's own research, genuinely pre-existing, and
  unrelated to `dice-engine.js`**: that block's `beforeEach` clicks
  `.sidebar-btn[data-domain="engine"]` and waits for `#next-session-content` — but `initNextSession()`
  (`public/js/admin.js:331`) is called under `domain === 'attendance'` today, not `'engine'`. The Next
  Session panel is a real, live, still-used feature (`public/js/admin/next-session.js` still exists
  and is still called) that was relocated to the Attendance domain at some point without its own test
  suite being updated to match — these tests were already targeting a dead selector before this story
  touched anything, and deleting `dice-engine.js`'s own dead code neither causes nor fixes that. Flag
  it for its own follow-up (a one-line `data-domain="engine"` → `data-domain="attendance"` fix in that
  `beforeEach`); do not fold it into this story's diff.
- **NOT a cleanup of `admin-layout.css`'s `#session-tracker` block** (starts ~line 2760, a separate
  leftover from issue #836's own incomplete cleanup — `session-tracker.js` is also already deleted,
  per `admin.js:38-41`'s comment, but its CSS was never removed). Adjacent, equally dead, but a
  different file's debt — flag it, don't silently absorb it here.
- **NOT a broader admin-app navigation audit.** This story touches exactly the four files named in
  the Acceptance Criteria; it does not go looking for other dead code elsewhere in `admin.js` or
  `admin-layout.css`.

## Tasks / Subtasks

- [x] Task 1 (AC1) — delete `public/js/admin/dice-engine.js` outright (`git rm` or plain delete —
  match this project's own precedent for a confirmed-dead file, e.g. how `feeding-engine.js`/
  `session-tracker.js` were removed for #836, not archived).

- [x] Task 2 (AC2) — `public/js/admin.js`:
  - [ ] Remove line 37: `import { initDiceEngine } from './admin/dice-engine.js';`
  - [ ] Remove line 320: `if (domain === 'engine') { /* Engine tab removed — dice, feeding, session
    tracker were Engine-only tools */ }` from inside `switchDomain()`. Leave every other
    `if (domain === '...')` branch in that function untouched, in the same order.

- [x] Task 3 (AC3) — `public/css/admin-layout.css`: delete the block from
  `/* ── Engine split layout ── */` (currently line 2570) through the blank line immediately before
  `/* ── Player View link on character detail ── */` (currently line 2756/2757) inclusive. This
  removes `.engine-split`, `.engine-left`/`.engine-right`, every `#dice-engine ...` rule, and every
  `#feeding-engine ...` rule in that one contiguous block. **Stop exactly there** — do not touch the
  separate `#session-tracker` block that follows (see "What this story is NOT").

- [x] Task 4 (AC4, AC5) — `tests/admin.spec.js`:
  - [ ] Delete the `test('clicking Engine switches domain', ...)` block (currently lines 156-159,
    inside `test.describe('Admin — Sidebar', ...)`). Leave the surrounding `describe` and its other
    tests (`Player domain active by default`, `clicking City switches domain`, `cross-app nav buttons
    exist`) untouched.
  - [ ] Delete the entire `test.describe('Admin — Engine Domain', ...)` block (currently lines
    338-366). Do not touch the `test.describe('Admin — City Domain', ...)` block immediately before it
    or the `test.describe('Admin — Theme', ...)` block immediately after it.

- [x] Task 5 (AC6) — new vitest suite, e.g. `server/tests/rlv-6-dice-engine-removed.test.js`, mirroring
  `server/tests/issue-836-legacy-tracker-cache-removed.test.js`'s exact structure (same
  `fs.existsSync`/`fs.readFileSync` source-text-check pattern, same `REPO_ROOT` resolution via
  `fileURLToPath(import.meta.url)` — not a live import, `admin.js` transitively pulls in browser
  globals via `api.js`'s `location` read):
  ```js
  describe('rlv.6 — dice-engine.js removed', () => {
    it('public/js/admin/dice-engine.js no longer exists', () => {
      expect(exists('public/js/admin/dice-engine.js')).toBe(false);
    });
  });

  describe('rlv.6 — admin.js drops dead Engine-domain wiring', () => {
    const src = read('public/js/admin.js');
    it('no longer imports initDiceEngine', () => {
      expect(src).not.toMatch(/import\s*\{\s*initDiceEngine\s*\}/);
      expect(src).not.toMatch(/from\s*['"]\.\/admin\/dice-engine\.js['"]/);
    });
    it('switchDomain() no longer has an engine branch', () => {
      expect(src).not.toMatch(/domain\s*===\s*['"]engine['"]/);
    });
  });

  describe('rlv.6 — admin-layout.css drops dead Engine-domain rules', () => {
    const css = read('public/css/admin-layout.css');
    it('no longer contains #dice-engine rules', () => {
      expect(css).not.toMatch(/#dice-engine/);
    });
  });
  ```

- [x] Task 6 (AC7, regression) — run `tests/admin.spec.js` in full (not just the two deleted blocks'
  siblings) to confirm every other admin domain still switches and renders correctly, and run the
  targeted vitest suites that already touch `admin.js` (grep first to find them — do not assume none
  exist) to confirm nothing else references the removed branch/import.

## Dev Notes

### Why deletion, not "port then delete"

The epic's original framing assumed `dice-engine.js` needed rlv.4 to finish "porting" its
functionality before it could safely go — that assumption is what this story's own investigation
overturned. rlv.4 already ported the *UI pattern* (attribute+skill+discipline chip picker) as a fresh,
independent implementation; it never read from or depended on `dice-engine.js`'s own code, and
`dice-engine.js` was already fully disconnected from the DOM (no mount point) before rlv.4 started.
There is nothing to "finish porting" — the file has had zero live callers for a while now (per the
2026-06-17 investigation note), same shape as `feeding-engine.js`/`session-tracker.js`, which #836
already deleted without needing anything "ported" first.

### File List (expected)

- `public/js/admin/dice-engine.js` — deleted.
- `public/js/admin.js` — modified (drop 1 import line, drop 1 no-op branch).
- `public/css/admin-layout.css` — modified (drop ~187 lines of orphaned rules).
- `tests/admin.spec.js` — modified (drop 2 test blocks, ~33 lines total).
- `server/tests/rlv-6-dice-engine-removed.test.js` — new (mirrors the #836 test file's pattern).

### Project Structure Notes

No new files except the test spec, which follows an exact existing precedent
(`issue-836-legacy-tracker-cache-removed.test.js`) rather than inventing a new pattern. This is a
pure subtraction story — nothing added to the running app's behaviour, only dead surface removed.

### References

- [Source: specs/epic-rlv-roller-harmonisation.md] — rlv.6's row, re-scoped 2026-08-24 with the
  corrected premise (see this story's own "CRITICAL" section above for the full evidence, duplicated
  here rather than only in the epic file so the dev agent doesn't need to cross-reference to get it).
- [Source: specs/investigations/2026-06-17-session-handover-to-peter.md:80] — the original #846
  "zero callers, confirmed" flag this story finally acts on.
- [Source: public/js/admin.js:30-44,308-334] — full import block and `switchDomain()`, read in full
  for this story; confirms `initDiceEngine` has no call site and exactly which branch is the no-op.
- [Source: public/admin.html] — grepped in full for "engine" (case-insensitive); zero matches,
  confirming no nav entry or mount point exists.
- [Source: public/js/admin/dice-engine.js] — read in full for this story (already read during rlv.4's
  own research pass too — it is the ST admin Engine-domain dice roller with its own d10()/rollPool()/
  doRoll()/history panel and attribute+skill+discipline+power pool builder).
- [Source: public/css/admin-layout.css:2570-2765] — read in full to establish exact deletion
  boundaries and confirm the adjacent `#session-tracker` block is genuinely separate.
- [Source: tests/admin.spec.js:97-381] — read in full to map every Engine-domain reference,
  including the two in scope (Sidebar's domain-switch test, the Engine Domain describe block) and the
  one explicitly out of scope (Next Session Panel's stale selector).
- [Source: server/tests/issue-836-legacy-tracker-cache-removed.test.js] — read in full as the exact
  structural template for this story's own new test file (same dead-file-removal shape, same
  source-text-check rationale).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (`bmad-dev-story`, 2026-08-24)

### Debug Log References

- `test-results/admin-*` (two full `tests/admin.spec.js` Playwright runs, post-change and
  pre-change/stashed) — used for the git-stash regression isolation, see Completion Notes.

### Completion Notes List

- Implemented exactly per the story's own pre-worked spec (Tasks 1-6) — every file:line anchor
  matched current `main` exactly at implementation time, confirmed by re-reading each file
  immediately before editing.
- Task 1: `public/js/admin/dice-engine.js` deleted outright.
- Task 2: `public/js/admin.js` — dropped the dead `initDiceEngine` import (replaced with an inline
  comment explaining why, matching the existing `#836` comment style immediately below it) and the
  no-op `if (domain === 'engine')` branch in `switchDomain()`.
- Task 3: `public/css/admin-layout.css` — deleted lines 2570-2756 (the full Engine-split-layout
  block: `.engine-split`, `.engine-left`/`.engine-right`, every `#dice-engine`/`#feeding-engine`
  rule) via `sed -i '2570,2756d'`. Verified brace-balanced afterward (2308 open, 2308 close) and
  confirmed the separate `#session-tracker` block immediately following was left untouched, exactly
  as AC3 requires.
- Task 4: `tests/admin.spec.js` — deleted the single `'clicking Engine switches domain'` test and the
  entire `test.describe('Admin — Engine Domain', ...)` block (its banner comment included), leaving
  the "Next Session Panel" block's own `data-domain="engine"` clicks untouched per the story's "What
  this story is NOT".
- Task 5: new `server/tests/rlv-6-dice-engine-removed.test.js`, mirroring
  `issue-836-legacy-tracker-cache-removed.test.js`'s exact structure. 7/7 passing (the story's own
  spec named 4 checks; two more were added — a `#feeding-engine` CSS check alongside `#dice-engine`,
  and a "clicking Engine switches domain" text-absence check alongside the describe-block-name
  check — both natural, minimal extensions of the same named checks, not scope growth).
- Task 6 (regression): ran the changed-area vitest batch — exactly these 14 files, selected via
  `grep -rl "public/js/admin\.js\|'admin\.js'" server/tests/*.test.js`: `bl2-boot-priming`,
  `bl4-bloodlines-admin-view`, `bl5-lineage-lock-client`, `collective-1-virtual-rows`,
  `epic.708.2-cycle-tab-shell`, `equipment`, `fix.402.spliceCurrentLeak`, `fix.943.retireStripDerived`,
  `issue-836-legacy-tracker-cache-removed`, `issue-837-xp-totals-deprecation`,
  `issue-872-ecm-5-editor-cache`, `issue-873-ecm-6-admin-sidebar`,
  `issue-879-defence-penalty-wirein`, `oaq-3-approval-queue` (a **broader** grep, e.g.
  `rg -l 'admin\.js' server/tests`, returns 19 files instead of 14 — a different, also-reasonable
  selection criterion; both are valid, they just aren't the same list, so cite the exact list rather
  than a bare count when reproducing this) —
  **342/342 passed**, 1 suite (`issue-836-legacy-tracker-cache-removed.test.js`) failed to load with
  `ENOENT: public/js/suite/tracker.js` — this is `CLAUDE.md`'s own already-documented pre-existing
  failure ("asserts against `public/js/suite/tracker.js`, which was renamed to `toast.js` elsewhere")
  and has nothing to do with `dice-engine.js`; re-confirmed unrelated by reading the failing file's
  own `read()` call, which targets a name unrelated to anything this story touched.
  Ran the full `tests/admin.spec.js` Playwright suite (all 25 tests, not just the two edited
  describe blocks' siblings): **11 passed, 14 failed**. To confirm none of the 14 were caused by this
  story, `git stash`-isolated the exact same suite against unmodified `main` (per this project's own
  established isolation technique): baseline was **11 passed, 20 failed**. The delta is exactly the 6
  tests this story deliberately removed (the 5 "Admin — Engine Domain" tests + "clicking Engine
  switches domain") — every one of the remaining 14 failures is byte-identical between the two runs
  (same test names: Auth Gate's "player gets redirected away from admin", Sidebar's "cross-app nav
  buttons exist", all **6** "Next Session Panel" tests (corrected from an earlier miscount of 7 —
  the describe block genuinely contains 6, per code review Pass 3b), Player Domain's "character grid
  container exists", City Domain's 4 court/territory tests, Theme's "CSS custom properties load") —
  all confirmed pre-existing, none introduced by this story, none fixed by this story (deliberately —
  see "What this story is NOT"). Stash was popped and restored cleanly afterward (`git status --short`
  confirmed the exact same 8-file change set before and after).
- No High/Medium findings — this is a pure, verified-safe deletion.

### File List

- `public/js/admin/dice-engine.js` — deleted.
- `public/js/admin.js` — modified (dropped 1 import line + inline comment, dropped 1 no-op branch).
- `public/css/admin-layout.css` — modified (dropped 187 lines of orphaned rules, lines 2570-2756).
- `tests/admin.spec.js` — modified (dropped 2 test blocks: 1 single test + 1 five-test describe
  block, ~34 lines total).
- `server/tests/rlv-6-dice-engine-removed.test.js` — new (7 tests, mirrors the `#836` test file's
  pattern).
- `tests/post-game-1.spec.js` — modified (code review patch: EPB.3's roll-button touch-target test
  repointed from the deleted `.de-roll-btn` class to the real, live `#roll-btn` on the player Roll
  tab — see Senior Developer Review below).

## Senior Developer Review (AI)

**Reviewed:** 2026-08-24. **Mode:** EXTERNAL — Codex CLI (`codex exec -C <repo> -s workspace-write
-c model_reasoning_effort=high`), a real 3-pass review (Blind Hunter / Edge Case Hunter / Acceptance
Auditor). Codex genuinely available this session — the second real run today (see [[feedback-review-mode]]
for the pattern of it coming and going unpredictably; always check the log content, never assume from
a remembered quota/reset date). Diff scoped to source + tooling only
(`specs/stories/code-review/rlv-6-diff.txt`, against base commit `7d80228c`, rlv.4's own commit),
story/tracking files deliberately excluded. Full prompt and findings persisted at
`specs/stories/code-review/rlv-6-codex-review.md` / `rlv-6-codex-findings.md` / `rlv-6-codex-run.log`.
**Outcome: 1 patched (Medium — a real regression this diff's own CSS deletion caused, found by the
reviewer, missed by this story's own Task 6 because it only regression-tested `tests/admin.spec.js`,
not the whole suite), 2 corrected (Low, Dev Agent Record inaccuracies), 1 dismissed with evidence
(Low, explicitly out of scope). No High findings, nothing deferred.**

### Findings

**Patched (1), prove-discriminated:**

1. **[Medium, Pass 2 + Pass 3b, independently found by both passes]**
   `tests/post-game-1.spec.js:368` (EPB.3, a mobile touch-target-size regression guard) built a
   synthetic, detached `<button class="de-roll-btn">` purely to read a CSS rule's `min-height` —
   testing the *class this story deletes*, not a real rendered element anywhere in the app. This
   diff's own CSS deletion (Task 3) made the assertion deterministically fail (`min-height` reads
   `0` once the rule backing that class is gone). This story's own Task 6 regression pass only ran
   `tests/admin.spec.js` — a different file — so it never caught this. **Fix**: repointed the test
   to the real, live, sole surviving roll button — `#roll-btn` on the player Roll tab
   (`.rv2-roll-btn` in `roll-v2.js`'s own markup) — measuring its actual rendered `boundingBox()`
   height instead of a synthetic element's computed style. This is a *better* test than the
   original (it measures something real, in context, rather than a detached class-name probe) while
   preserving EPB.3's real intent (VtR admin/player mobile touch-target size, part of the project's
   own gdx-2/gdx-3 accessibility work). Revert-alone: the test fails (as Codex itself reproduced,
   `>= 48` expected, `0` received) with the repoint removed and the original synthetic-element
   version restored; passes with the fix in place. Also independently confirmed the fix isn't
   vacuously trivial: shrinking `.rv2-roll-btn`'s own `padding` alone didn't flip the test red — a
   separate, layered mobile-specific override (measured `min-height: 58px`, `padding: 18px 16px`)
   also enforces the same floor, consistent with this project's own belt-and-braces accessibility
   pattern (gdx-2/gdx-3) rather than a single fragile rule. Confirmed via `git diff` that
   `public/css/suite.css` is byte-identical to its committed state after the discrimination probing
   (nothing left behind).

**Corrected (2, Low, Dev Agent Record accuracy — not code defects):**

2. **[Low, Pass 3b]** The record's original vitest-batch claim named "14 suites" without listing
   them, and a *different*, broader grep (`rg -l 'admin\.js' server/tests`, 19 files) couldn't
   reproduce the same result in the reviewer's own sandbox (5 of those 19 need a local MongoDB the
   reviewer's environment blocks with `EACCES`). The historical 342/342 claim itself was never
   *disproved* — just unreproducible from an ambiguous "14 suites" description. **Fix**: the record
   now names the exact 14 files and the exact grep that selects them, so the claim is reproducible
   rather than merely asserted.
3. **[Low, Pass 3b]** The record said "all 7 'Next Session Panel' tests" failed; the describe block
   genuinely contains 6, and the real Playwright run reports exactly 6 failures under that name (the
   overall 11 passed / 14 failed headline was already correct — this was a sub-count slip only).
   **Fix**: corrected "7" to "6" in the record.

**Dismissed with evidence (1, Low):**

4. **[Low, Pass 2, self-dismissed by the reviewer's own Pass 3a]** `public/js/admin.js`'s
   `switchDomain()` has a second, separately pre-existing dead branch (`npcs` — no matching
   `data-domain="npcs"` button exists in `admin.html`, confirmed by `tests/issue-23-npc-register.spec.js`
   itself asserting the NPC Register button is absent). Real, but explicitly out of this story's own
   "What this story is NOT" scope (not a broader admin-navigation audit) — the reviewer's own Pass 3a
   correctly declined to treat it as an AC violation. Not patched here; worth its own tiny follow-up
   story alongside the two other adjacent findings already flagged in this story's "What this story
   is NOT" section (the Next Session Panel stale selector, the `#session-tracker` orphaned CSS).

### Regression re-verification after the patch

`tests/post-game-1.spec.js -g "EPB.3"` (targeted): pass, both before and after prove-discrimination
reverts, restored correctly. A small neighbouring sample from the same file
(`EPD.1`, `EPB.4`, `EPB.3`, and the 3 `nav-1-3` tests) run together: 3 passed (`EPD.1`/`EPB.4`/`EPB.3`),
3 failed (`nav-1-3` ×3, all on `#n-more` timing out) — `git stash`-isolated the same 3 `nav-1-3` tests
against unmodified `main`: **identical 3 failures**, confirming pre-existing and unrelated to this
diff (same class of viewport/default-landing-tab issue already found elsewhere this session, not
investigated further here — out of scope). A full, whole-file `post-game-1.spec.js` run was attempted
but killed by the environment before completing; given the patch is a single, narrowly-scoped,
self-contained test function (no shared helpers touched), the targeted run plus the neighbouring
sample were judged sufficient rather than re-attempting the full file. `tests/admin.spec.js`'s own
11 passed / 14 failed (vs. 11/20 on unmodified `main`, delta exactly the 6 removed tests) stands
unchanged from the dev-story pass — nothing in this review's patch touches `admin.spec.js`.

### Outcome

Story status: `done`. No unresolved High/Medium findings — the one real Medium was patched,
prove-discriminated, and left with better coverage than before (a real rendered element instead of a
synthetic probe); both Low record inaccuracies corrected; the one dismissed Low is genuinely
out of scope, not swept under the rug. NOT committed, NOT pushed, NOT merged — per this project's
hard rule, only on the user's own explicit instruction in a current message.
