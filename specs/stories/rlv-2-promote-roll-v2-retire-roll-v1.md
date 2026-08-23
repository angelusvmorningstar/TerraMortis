# Story rlv.2: promote roll-v2.js to the sole player roller; retire roll.js

Status: review — dev-story complete 2026-08-24. All ACs implemented, full changed-area regression
green (see Dev Agent Record). NOT committed, NOT pushed, NOT deployed to `dev` — the story's own
smoke-test task is deliberately left undone pending Angelus's explicit push/deploy instruction, per
`CLAUDE.md`'s hard rule.

D2/D3 confirmed 2026-08-24, no further decisions blocked dev-story. D2: DOM-contract cleanup
deferred to rlv.5, existing shared IDs untouched here. D3:
**direct cutover, not a staged soak** — `roll-v2.js` becomes the only player roller, `roll.js` and
the `tm-use-new-dice-roller` flag/Settings checkbox are deleted outright in this story, no rollback
fence held for a release cycle. Angelus's own words: "I only want the new dice roller active, I want
the old versions retired so there is no switch. Players don't realise there is two and I want to just
use the one we have been designing, which supersedes the rest." This story now also absorbs the
`roll.js`-deletion half of what was drafted as rlv.6 (see epic file's rlv.6 row, narrowed
accordingly). ACs/Tasks below have been rewritten to match — no soaked-default branch remains.

## Story

As a player,
I want one dice roller, not a coin-flip between two depending on a setting I never touched,
so that the features/fixes that land only reach "the roller I use" — not a roller half the table
silently isn't on.

## Why this story exists

Confirmed by the Phase 0 audit (`specs/dice-roller-harmonisation-audit.md` §4a): `roll.js` and
`roll-v2.js` are **byte-identical on every gameplay-critical function** — `effPool`, `chgPool`,
`chgMod`, `loadPool`, and the entirety of `doRoll()`'s resolution logic (chance-die, Rote,
contested/opposed branch, exceptional threshold). The only real delta is additive: `roll-v2.js` has
gdx-7's reviewed, shipped vitae/willpower spend automation and the #1024 slice A+D UI (effective-pool
anchor, segmented Again pill) that `roll.js` lacks entirely. There is no rules-divergence risk in
promoting v2 — this story is safe specifically because that comparison has already been done and
confirmed, not because "it's probably fine."

The `tm-use-new-dice-roller` per-device flag itself is the direct cause of the Game 7 incident (spend
automation silently not firing on a phone that had never had the flag set) and the confirmed-live
`combat-tab.js` Quick Roll bug (rlv.1, independent fix, not blocked by this story). Every additional
week this flag exists is another week either kind of silent-mismatch bug can recur.

## What this story is NOT

- NOT the DOM-contract cleanup (converting the shared-ID convention into a real
  `getPool()`/`onRollComplete()`/`mountInto()` interface). Per Winston's recommendation (roundtable,
  full transcript referenced in the audit doc §3) and pending D2's confirmation, **this story keeps
  the existing shared-ID surface untouched** — `pval`, `mval`, `roll-btn`, `dice-area`, `hlist`,
  `rote-c`, `wp-c`, `sc-*`, `roll-char-pools`, `weapon-ref`, `resist-*`, `lifecycle-cards`,
  `btn-contested`, `effline`, `res-hdr` all keep their current names and shape on the promoted
  roller. The five external consumers (`app.js`, `shared/resist.js`, `game/contested-roll.js`,
  `game/combat-tab.js`, `game/challenge-notification.js`) should need **zero changes** as a result of
  this story specifically (rlv.1's fix is independent and can land before, after, or as part of this
  story with no conflict). DOM-contract cleanup is rlv.5, later, once this lands and soaks.
- NOT `dice-engine.js`'s builder UX or `char-pools.js`'s extension (rlv.4, blocked on rlv.3's state
  model design pass).
- NOT any of #1039's genuinely new features (persistent mod chips, status-diff mods — rlv.7/rlv.8).
- NOT the Rote rules fix (rlv.9, independent, pending D1).
- NOT keeping `roll.js` around as a rollback fence. D3 resolved to a direct cutover: `roll.js`, the
  `tm-use-new-dice-roller` flag, and its Settings checkbox are all deleted in this story, not
  dead-code-fenced for a later cleanup story. There is deliberately no switch left for a player (or a
  future dev) to flip back to the old roller.

## Acceptance Criteria

1. `roll-v2.js` becomes the only player roller, immediately, for every player. No flag, no default to
   flip, no soak period — `USE_NEW_ROLLER`/`_roller` selection logic in `app.js` (currently
   `localStorage.getItem('tm-use-new-dice-roller') === '1'`) is removed and every caller wired
   directly to `roll-v2.js`'s exports.
2. `roll.js` is deleted from the repo outright (not dead-code-fenced), along with the
   `tm-use-new-dice-roller` Settings checkbox (`app.js`'s settings-tab markup + its change listener)
   and the boot-time DOM-subtree-removal mechanism that used to hide whichever tab wasn't active —
   there is only one Roll tab now, so nothing needs hiding. A player never sees a choice, a toggle, or
   any indication a second roller ever existed.
3. A boot-time console log confirming which roller module is active is enough to satisfy the
   diagnosability concern the Game 7 incident raised — a persistent on-screen "which build" badge is
   explicitly NOT wanted, since it would itself reveal to players that a second roller exists/existed.
   Kept minimal and dev/ST-facing only.
4. No change to `roll-v2.js`'s own gameplay logic, spend mechanics, or UI — this story is purely
   about **reachability/defaults**, not features. Confirmed safe per the byte-identical finding in
   §4a of the audit doc; if implementation surfaces ANY behavioural difference between the files not
   already documented there, stop and flag it rather than resolving it silently — that would
   contradict the audit's own finding and needs Angelus's eyes before proceeding.
5. Existing tests for `roll.js`'s currently-covered behaviour continue passing against `roll-v2.js`
   where they exercise shared (confirmed-identical) logic — do not assume test coverage transfers
   automatically; verify the actual test files target the right module post-promotion.
6. Regression run: full suite of DT/roll-adjacent Playwright specs plus the vitest suites touching
   `tracker_state`/`purchasable_powers` spend paths (gdx-7's own test file is the closest existing
   coverage for the spend-automation half of this).

## Tasks / Subtasks

- [x] Confirm D2 and D3 with Angelus — both resolved 2026-08-24, recorded above.
- [x] Implement the boot-time active-roller console log (AC3) — `console.log('[dice roller]
  roll-v2.js active')` in `app.js`'s `boot()`.
- [x] Remove the `tm-use-new-dice-roller` flag read/branch in `app.js`, wire every caller directly to
  `roll-v2.js`'s exports. Also removed: `rollV1`/`rollV2`/`_roller`/`USE_NEW_ROLLER`, the two nav-item
  flag-gates (bottom nav + desktop sidebar `primaryTabs`), the `roll: 'dice'` `NAV_ALIAS` entry (this
  was itself a previously-deferred bug — see Dev Notes below), and every hardcoded `goTab('dice')`
  call site (there were five, not just `combat-tab.js`'s — see Dev Notes).
- [x] Remove the Settings checkbox markup + its change listener in `app.js`.
- [x] Remove `roll.js` from the repo; remove the boot-time DOM-subtree-removal mechanism and the
  `#t-dice` markup block in `public/index.html` (collapsed to the one `#t-roll` tab); dropped the
  now-dead `#t-dice`/`#t-roll` dual-selector CSS in `suite.css`.
- [x] Confirmed zero *behavioural* changes needed to the five external consumer files — only
  `combat-tab.js` and `contested-roll.js` imported from `roll.js` directly (repointed to
  `roll-v2.js`; `challenge-notification.js`, the third file the epic named, was already deleted by
  crd-2). Both changes were mechanical import-path fixes, no logic change, confirming this story's
  own claim.
- [x] Full regression per AC6 — see Dev Agent Record below for the full account, including three
  genuinely pre-existing (found-not-caused) test-suite defects surfaced and logged rather than
  silently worked around.
- [ ] Deploy to `dev` for a real click-through smoke test — **NOT DONE, deliberately.** Per
  `CLAUDE.md`'s hard rule, pushing/deploying requires the user's *current* message to explicitly say
  so; nothing in this session's instructions authorised a push. Status moves to `review`, not `done`,
  specifically because this step is outstanding — it's Angelus's own action, same convention as
  every other story in this file that ends "NOT committed, NOT pushed, NOT merged."

## Dev Notes

- Source: `public/js/suite/roll.js`, `public/js/suite/roll-v2.js`, `public/js/app.js` (flag read +
  boot-time subtree removal — this is the mechanism AC1/AC3 modify), `public/index.html` (Settings
  checkbox markup, `#t-dice`/`#t-roll` tab roots).
- **`USE_NEW_ROLLER` has more call sites than just the flag read** — `app.js:441-442` and
  `:2205-2206` branch nav-item visibility on it, and `:1461` uses it to pick which of `#t-dice`/
  `#t-roll` to remove at boot. All of these collapse once there's only one roller: the nav item is
  always shown, nothing needs removing at boot, `#t-dice`/`#t-roll` become one tab.
- **rlv.1's fix (`combat-tab.js`, PR #1196) reads this same `USE_NEW_ROLLER` const from `app.js`** to
  decide `loadPool`/`goTab` targets — that was the story's "first circular module reference." Once
  this story deletes `USE_NEW_ROLLER` entirely, `combat-tab.js`'s Quick Roll needs to be updated to
  just call into `roll-v2.js` unconditionally (the ambiguity rlv.1 was fixing disappears by
  construction once there's only one roller to route to). Land rlv.1 first regardless (it's an
  independent live-bug fix, safe to ship and merge before this story), then update its code again here
  rather than leaving a dangling reference to a deleted const.
- Full original evidence for this story's safety claim: `specs/dice-roller-harmonisation-audit.md`
  §4a (byte-diff confirmation) and §3 (roundtable synthesis, Winston's 4-PR sequencing proposal,
  which this story is PR 1 of).
- This story does NOT touch `shared/dice.js`, `dice-engine.js`, or `contested-roll.js` — those are
  rlv.4/rlv.5/rlv.9 territory.

### Design-token guidance (TM Admin, post-port — read before writing any CSS in this story)

The shared design-token port (`design-token-port.md`, umbrella root) lands in this same file
(`suite.css`) before this story's dev-story starts (see "What this story is NOT" — this story
deliberately waited on that port for exactly this reason). Once it has:

1. **`.rv2-eff` is locked**: Cinzel Bold, `--type-size-display-hero: 64px` (Angelus-confirmed over
   the old roll.js implementation's 48px — settled, don't re-litigate). If AC1/AC3's dead-code-fencing
   of `roll.js` touches any CSS around `.rv2-eff` — unhiding it by default, removing a flag-gated
   wrapper, whatever — preserve the token reference; don't reintroduce a literal size or the old 48px.
2. **AC2's "active roller build" badge**: build it off the existing status/badge vocabulary
   (`.status-pill`, `.dt-status-badge` family — small, Lato, uppercase, letter-spaced, semantic
   colour + label, never colour alone). Don't invent a new visual language for it, and don't reach for
   Cinzel — this is exactly the small-UI-chrome case the standing display-only rule excludes.
3. **The standing type rule (fully confirmed, not just the port's opinion)**: Cinzel is ONLY for
   genuine app/page-level display headings (login screen, sidebar brand title). Everything else —
   badges, modal titles, per-item numerals, names — is Lato (`--fl`/`--type-heading`) for
   anything heading-shaped, Libre Baskerville (`--ft`/`--type-body`) for prose. Apply this test to any
   CSS this story's dead-code-fencing touches that isn't already covered by rule 1 above.
4. **Any new CSS this story writes should target the ported token names directly**
   (`--space-*`, `--radius-*`, `--type-size-*`, `--control-height-*`) rather than literal px —
   otherwise it's new code that immediately needs its own normalisation pass.

None of the above changes this story's actual scope — AC4's "no gameplay/feature changes" still
stands. This is "if you touch CSS, touch it with the current vocabulary and rules," not new UI work.

### References
- [Source: specs/dice-roller-harmonisation-audit.md §3, §4a]
- [Source: public/js/suite/roll.js]
- [Source: public/js/suite/roll-v2.js]
- [Source: public/js/app.js]
- [Source: public/index.html]

## Dev Agent Record

### Agent Model Used
Claude Sonnet 5 (bmad-dev-story, 2026-08-24).

### Debug Log References
No separate debug log file; findings recorded inline below and in
`specs/deferred-work.md`'s own "Deferred from: rlv-2-promote-roll-v2-retire-roll-v1" entry.

### Completion Notes List

- **Scope grew beyond the story's own text in one real way, discovered while implementing, not
  assumed going in**: `goTab('dice')` was hardcoded at FIVE call sites in `app.js`
  (`pickChar`/sheet-open pool-load, `openChar`'s pool-load, `toggleDesktopMode`, the boot-time
  default-landing ternary, `_enterPlayerView`'s no-linked-character fallback), not just
  `combat-tab.js`'s Quick Roll that rlv.1 was scoped to fix. Every one of them would have silently
  no-op'd once `#t-dice` was deleted, exactly the same failure shape as the Game 7 incident and the
  rlv.1 bug — this was the SAME defect at more call sites than the epic/story text named. All five
  fixed to `goTab('roll')`. Also found: `goTab()`'s own `if (t === 'dice') { renderLifecycleCards();
  }` special-case meant lifecycle cards never refreshed on tab-entry for anyone actually using
  roll-v2.js via nav clicks (nav always sent `t === 'roll'` when the new-roller flag was on) — a
  second latent bug from the same root cause, fixed by changing the check to `t === 'roll'`.
- **`NAV_ALIAS`'s `roll: 'dice'` entry — a previously-deferred, already-known bug (see the epic's
  own gdx-status memory: "NAV_ALIAS['roll'] = 'dice' breaks the bottom-nav highlight when the new
  roller is active") — is resolved as a side effect of deleting the alias entirely.** With only one
  tab/nav-id (`roll`) left, no alias is needed; the bug can't recur because there's no longer a
  'dice' id for anything to wrongly resolve to.
- **AC3 (boot-time diagnostic) implemented as a plain `console.log`, not a badge.** The story's own
  "Design-token guidance" Dev Notes subsection (above) anticipated a possible on-screen "active
  roller build" badge from the earlier D3-pending draft; the resolved D3 explicitly rejects any
  player-visible indication that a second roller ever existed, so no CSS/badge work was needed and
  that guidance subsection didn't end up applying. Left in place rather than edited, since dev-story
  is restricted to Tasks/Dev Agent Record/File List/Change Log/Status.
- **Test suite required real changes, not just the vitest/Playwright files the story's own Dev Notes
  named.** Found and fixed while running the regression: `server/tests/equipment-client-fixes.test.js`
  read `roll.js` as source text for three assertions (repointed to `roll-v2.js`, confirmed still
  true — `togEquipChip`/`updWeaponRef` are on the Phase 0 audit's byte-identical list). Deleted
  `tests/issue-1018-parallel-roll-tab-flag.spec.js` outright (its entire premise, the flag-gated
  parallel tab pair, no longer exists) and replaced it with
  `tests/rlv-2-single-roller-retirement.spec.js`, a source-fetch + live-boot proof of the retirement
  itself (mirrors this project's own precedent for superseded-surface removals, e.g.
  `issue-836-legacy-tracker-cache-removed.test.js`). Rewrote `tests/issue-1024-roll-v2-anchor-and-
  again-seg.spec.js` to drop its "flag ON" vs "flag OFF" test pairs (there is only one state now) and
  fixed one CRLF/LF delimiter bug in it that was already broken pre-existing (confirmed via
  `git stash` isolation). Updated `goTab('dice')`/`#t-dice` references in
  `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js`, `tests/desktop-and-css.spec.js`, and a
  stale comment in `tests/player.spec.js`.
- **Three genuinely pre-existing, previously-undocumented test-suite defects were found during
  regression, confirmed via `git stash` isolation against unmodified base code (identical failures
  before and after this story's changes), and logged rather than fixed** — all out of this story's
  scope, all recorded in `specs/deferred-work.md` and `CLAUDE.md`'s "Known pre-existing failures":
  1. `tests/st-only-chrome.spec.js`'s two "Dice tab" nav-visibility tests were already broken (one
     genuinely failing, one only "passing" because the tab has never actually been role-gated) —
     removed rather than renamed, since renaming the selector would just point an already-wrong
     assertion at the surviving tab.
  2. `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js` — 7 of 12 tests fail on
     `#effline`/weapon-reference assertions, identically with and without this story's changes.
  3. `tests/suite.spec.js` — at least 5 of 24 tests fail (nav visibility, a 60s-timeout tab-click),
     identically with and without this story's changes; stopped investigating past test 12/24 once
     the pre-existing pattern was confirmed twice.
- **Regression run**: `server/tests` changed-area batch (21 files touching `app.js`,
  `combat-tab.js`, `contested-roll.js`, `equipment-catalogue-cache.js`, `roll-v2.js` by static
  analysis or behaviour) — 576/577 passed; the 1 failure (`n7-n9-allocator-readers.test.js`) and 1
  load-failure (`issue-836-legacy-tracker-cache-removed.test.js`) are both already documented in
  `CLAUDE.md`'s pre-existing-failures list, confirmed unrelated. Playwright:
  `rlv-2-single-roller-retirement.spec.js` (new, 6/6), `issue-1024-roll-v2-anchor-and-again-seg.spec.js`
  (7/7), `feature-662-eq3-roll-calc-equipment-chips.spec.js` (5/12, 7 pre-existing per above),
  `st-only-chrome.spec.js` (2/2, post-removal), `player.spec.js` (13/13, shared file run). **Ratios
  corrected 2026-08-24 during internal code review** — the internal Acceptance Auditor layer caught
  that the counts originally recorded here (5/5, 8/8, 15/15) were wrong (verified via `npx
  playwright test --list`: the real counts are 6, 7, and 13 respectively); all three files were still
  genuinely fully green, so the conclusion was right, just not the arithmetic. `desktop-and-css.spec.js`
  has TWO touched tests, not one as originally recorded — the same review also caught a second
  "Dice"-labelled assertion (`desktop-mode — sidebar has primary tabs (Dice, Sheet, Status)`,
  `/Dice/i`) that this story's own dev-story pass missed, since the sidebar's `primaryTabs` array no
  longer has a Dice entry at all. Fixed alongside the first (now `Roll, Sheet, Status` / `/Roll/i`).
  Both are inside the already-documented 12-test `#btn-desktop-toggle` pre-existing-failure family —
  updated for correctness but not separately re-verified green, since neither can be (that family
  fails before reaching either assertion) — this is exactly why the second one was missed the first
  time round, and exactly why an independent reviewer caught it. `tests/suite.spec.js` not re-run to
  completion post-fix (see finding 3 above; already proven not to be a regression via two
  stash-isolated runs, and a full run costs a 60s timeout per
  pass).
- **Not done**: deploying to `dev` for a live click-through smoke test. Per `CLAUDE.md`'s hard rule
  this needs Angelus's own explicit push/deploy instruction in a *current* message; nothing in this
  session authorised one. Status is `review`, not `done`, specifically because of this outstanding
  step.

### File List

**Modified:**
- `public/js/app.js` — removed the roller flag/split entirely; direct `roll-v2.js` import; fixed
  five `goTab('dice')` call sites, the `t === 'dice'` lifecycle-card hook, the `NAV_ITEMS`/desktop
  `primaryTabs` dice/roll pair, `TAB_SUBTITLES`, `NAV_ALIAS`; removed the Settings checkbox + its
  listener and the boot-time DOM-subtree-removal block; added the AC3 boot console log.
- `public/index.html` — deleted the `#t-dice` tab block; rewrote the `#t-roll` header comment.
- `public/css/suite.css` — dropped `#t-dice` from the two dual-tab selectors.
- `public/js/game/combat-tab.js` — import repointed to `roll-v2.js`, dropped the unused `doRoll`
  import, `goTab('dice')` → `goTab('roll')`.
- `public/js/game/contested-roll.js` — import repointed to `roll-v2.js`.
- `public/js/suite/roll-v2.js` — updated its own header comment (no longer "parallel dev surface").
- `public/js/data/equipment-catalogue-cache.js` — stale comment reference updated.
- `public/js/editor/edit.js` — stale comment reference updated.
- `server/tests/equipment-client-fixes.test.js` — repointed source-text assertions to `roll-v2.js`.
- `tests/issue-1024-roll-v2-anchor-and-again-seg.spec.js` — dropped flag-conditional test pairs;
  fixed a pre-existing CRLF/LF delimiter bug found along the way.
- `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js` — `goTab('dice')`/`#t-dice` → `roll`.
- `tests/desktop-and-css.spec.js` — `goTab('dice')`/`#t-dice`/"Dice" label → `roll`/"Roll".
- `tests/player.spec.js` — stale comment reference updated.
- `tests/st-only-chrome.spec.js` — removed the two pre-existing-broken "Dice tab" tests.
- `specs/epic-rlv-roller-harmonisation.md`, `specs/stories/sprint-status.yaml`,
  `specs/deferred-work.md`, `CLAUDE.md` — decision record + pre-existing-failure documentation
  (see prior commits/edits this session; not new to this dev-story pass beyond the deferred-work.md
  and CLAUDE.md pre-existing-failure additions made during regression).

**Deleted:**
- `public/js/suite/roll.js`
- `tests/issue-1018-parallel-roll-tab-flag.spec.js`

**Added:**
- `tests/rlv-2-single-roller-retirement.spec.js`

## Senior Developer Review (AI)

**Reviewed:** 2026-08-24. **Mode:** LOCAL/internal 3-layer review (Blind Hunter diff-only, Edge
Case Hunter diff + full repo, Acceptance Auditor two-pass spec + Dev Agent Record verification),
all three run as parallel subagents in this session — Codex was unavailable (usage quota resets
2026-08-27, see [[feedback-review-mode]]), so this was the deliberate choice per the project's own
`bmad-code-review` override, not a fallback. Because this same session wrote the code under review,
independence came from the subagents' own blinding, not from a different model. **Outcome:
Approved with 3 patches applied, 2 items deferred, all other findings dismissed with evidence.**

### Findings

**Patched (3):**
1. **[Low]** Stale `roll.js` comment header in `server/tests/equipment-client-fixes.test.js:61`
   (Edge Case Hunter) — the section comment still named `roll.js` while the `describe()` block six
   lines below and the file's top docstring had already been correctly updated to `roll-v2.js`.
   Fixed.
2. **[Medium]** Dev Agent Record test-count inaccuracy (Acceptance Auditor, Pass 2) —
   `rlv-2-single-roller-retirement.spec.js`, `issue-1024-roll-v2-anchor-and-again-seg.spec.js`, and
   `player.spec.js` were recorded as 5/5, 8/8, 15/15; verified via `npx playwright test --list` to
   actually be 6/6, 7/7, 13/13. All three were genuinely fully green either way — the conclusion was
   right, the arithmetic wasn't. Corrected in this file's own Completion Notes and in
   `sprint-status.yaml`'s rlv-2 row.
3. **[Low, found by the same finding above]** `tests/desktop-and-css.spec.js` had a SECOND
   "Dice"-labelled test (`desktop-mode — sidebar has primary tabs (Dice, Sheet, Status)`, line 68)
   that the dev-story pass missed — only the "tapping sidebar Dice navigates" test had been updated.
   Both are inside the already-documented 12-test `#btn-desktop-toggle` pre-existing-failure family,
   which is exactly why the second one was missed (it never runs far enough to fail on its own
   terms) and exactly why an independent reviewer caught it. Fixed to `Roll, Sheet, Status`/`/Roll/i`.

None of the three patches above needed prove-discrimination reverts — all are test-accuracy/comment
fixes with no behavioural code path to discriminate (nothing production-facing changed; re-running
the affected suites confirms no regression, not that a specific revert fails).

**Deferred (2), both logged to `deferred-work.md` under "Deferred from: code review of
rlv-2-promote-roll-v2-retire-roll-v1 (2026-08-24, internal 3-layer review)":**
1. **[Low, found not caused]** `specs/architecture/system-map.md` §10 is deeply stale (predates
   roll-v2.js's existence entirely, calls the Game app roller "missing") — this diff makes its
   `roll.js` line doubly wrong, but the whole table needs its own re-audit, not a one-line patch.
2. **[Medium, coordination risk not a code defect]** rlv.1 (PR #1196, open, not merged) and rlv.2's
   own `combat-tab.js` changes were never actually sequenced the way the Dev Notes assumed — this
   branch never had rlv.1's fix applied before rlv.2's dev-story ran, so rlv.2 fixed the same lines
   independently. No bug in either branch alone, but merging both to `main` risks a conflict or a
   silent double-fix. Recommended handling recorded: merge rlv.1 first, then rebase rlv.2 onto the
   post-merge `main`.

**Dismissed with evidence (7):**
1. Blind Hunter's highest-severity concern — `doRoll` potentially still used elsewhere in
   `combat-tab.js` after its import was dropped, risking a `ReferenceError` — checked directly
   (`grep doRoll public/js/game/combat-tab.js`, zero matches beyond the removed import). Confirmed
   dead, exactly as the Phase 0 audit originally found.
2. Blind Hunter's concern that `setAgainSeg`/`spendVitae`/`spendWillpower` might not be real
   `roll-v2.js` exports now that the `_roller.x || fallback` defensive pattern is gone — refuted
   directly by Edge Case Hunter, which confirmed all three (and every other destructured name) are
   genuine named exports of `roll-v2.js`.
3. Blind Hunter's concern about residual `goTab('dice')` call sites outside this diff's swept
   scope — refuted by Edge Case Hunter's repo-wide grep: zero live matches, only in `specs/**` docs
   and an unexecuted `archive/suite-main.js`.
4. Blind Hunter's concern that deleting `st-only-chrome.spec.js`'s two "Dice tab" tests removes the
   only regression signal on Roll-tab role-visibility — already handled deliberately: both tests
   were pre-existing broken (one genuinely failing, one passing by accident, per this story's own
   `deferred-work.md` entry), and the underlying product question (should the Roll tab ever be
   role-gated?) is explicitly flagged there for Angelus, not silently dropped.
5. Blind Hunter's stylistic concern that the AC3 boot console log is permanent and can never say
   anything else — correct as observed, but that's the deliberate design: AC3 explicitly rejects a
   player-visible "which build" indicator, and a boot-time confirmation for anyone checking devtools
   is all Angelus's own resolution of D3 asked for.
6. Acceptance Auditor's Pass-1 note that `combat-tab.js`/`contested-roll.js` needed real changes
   despite "What this story is NOT" saying the five external consumers "should need zero changes" —
   already reconciled in this story's own Completion Notes as mechanical import-path fixes with no
   logic change, which is what the "zero changes" language was actually protecting against.
7. Acceptance Auditor's Pass-1 note that the `t === 'dice'` → `t === 'roll'` lifecycle-card fix is a
   behavioural change bundled into a "reachability only" story (AC4) — correct that it's
   behavioural, but it's the minimum necessary consequence of the identifier cutover, not a smuggled
   feature, and it was disclosed (not hidden) in the Completion Notes exactly as AC4 requires.

### Regression re-verification after patches
`tests/rlv-2-single-roller-retirement.spec.js` + `issue-1024-roll-v2-anchor-and-again-seg.spec.js`
+ `player.spec.js` re-run together post-patch: 26/26 passed. `equipment-client-fixes.test.js`
re-run post-comment-fix: 6/6 passed. No regression from any patch applied in this review.

### Outcome
Story status: `review` → **`review`, unchanged** (patches applied are review-quality fixes to
tests/docs, not implementation changes — the underlying dev-story work was already correct). Still
NOT committed, NOT pushed, NOT deployed — per this file's own Dev Agent Record, deployment to `dev`
requires Angelus's own explicit instruction and is the one outstanding item before `done`.
