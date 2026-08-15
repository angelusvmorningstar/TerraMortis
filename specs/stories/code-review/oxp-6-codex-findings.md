# Adversarial review — oxp-6-office-tab-purchase-markers

**TRIAGE OUTCOME (2026-08-14, `codex-review` skill Step 5/6).** The `codex exec` process crashed with an
internal error (`ERROR codex_models_manager::manager: failed to renew cache TTL: missing field
'base_instructions'`) immediately after freezing Pass 3a, so **Pass 3b never ran** — no independent
verification of the Dev Agent Record's claims, no final ship-readiness verdict from the reviewer. Pass 1,
Pass 2 and Pass 3a all completed and froze real findings before the crash (0 High, 3 Medium, 3 Low). This
session performed the Pass-3b-equivalent verification itself: every finding traced against the running
code, two genuine bugs found and fixed (one a real information-disclosure leak, confirmed independently by
both Pass 2 and Pass 3a), one deliberate design deviation dismissed with evidence and additionally
strengthened with a parity regression test, three Lows patched or dismissed with evidence. Re-verified
gate: 11 files, 345 tests (up from 339), 0 failed, 0 skipped.

## High

- None found.

## Medium

### [Pass 1] One failed purchase-state endpoint now blanks both otherwise-independent sections

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:378`
- **Triggering input or sequence:** The seat resolves successfully, then either `/api/office_merit_dots` or `/api/office_manoeuvre_rank` rejects while the other endpoint succeeds. `Promise.all` enters the single catch and sets the shared `fetchFailed` flag.
- **Observable consequence:** `_wireMeritDots` and `_wireManoeuvreRank` both render load errors. A transient manoeuvre-rank failure therefore hides valid merit dots, and a transient merit-dot failure hides/mutes the valid manoeuvre purchase state. Before this refactor the two renderers fetched and failed independently, so the healthy section remained usable.
- **Confidence:** High; this follows directly from the new shared catch and the same `fetchFailed` argument being passed to both renderers.
- **Outcome: PATCHED.** `Promise.all` replaced with `Promise.allSettled`, tracking `meritFailed`/`rankFailed` independently instead of one shared `fetchFailed`. Balance still requires BOTH to succeed (it needs both collections), but each section's own error rendering is now independent again. Two new tests, prove-discriminated by single-change revert (reverting to shared `Promise.all` failed exactly the two targeted tests, nothing else moved).

### [Pass 2] An unconfirmed “own office” view exposes another seat’s balance and affordability reasons

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:491`
- **Triggering input or sequence:** A player character has `court_category: 'Primogen'`, but neither Primogen seat has a matching `holder_id` (for example, stale handover data). `isOwnOffice` is true from category equality, `_wirePurchaseState` falls back to the first Primogen seat with `outcome.confirmed === false`, and `showReasons = isOwnOffice || isST` still authorizes reasons. `_wireManoeuvreRank` likewise gates only on `isOwnOffice`, not `outcome.confirmed`.
- **Observable consequence:** The player sees the fallback seat’s exact “spent / earned / remaining” balance plus balance-derived merit and manoeuvre `title` attributes, even while the adjacent warning says that the displayed seat “may not be your own.” I reproduced the real module with a player-role stub and mismatched holders; it rendered `3 of 7 office XP spent, 4 remaining` and per-dot titles for `seat-a`.
- **Confidence:** High; reproduced dynamically against `public/js/tabs/office-tab.js`, not inferred only from source.
- **Outcome: PATCHED — real bug, the most severe finding in this review.** `showReasons` (merit dots) and the new `showBalance` gate (manoeuvre balance line + reasons) both now require `outcome.confirmed` in addition to `isOwnOffice`, mirroring the pre-existing manoeuvre-LIST muting guard in the same function that already did this correctly. An ST still sees everything regardless of confirmation, unchanged. New test reproduces the exact leak scenario (a player, unconfirmed own-office view, real balance/title values visible before the fix) and is prove-discriminated: reverting either gate back to `isOwnOffice || isST` reproduced the leak (`0 of 7 office XP spent, 7 remaining` plus per-dot titles) and failed exactly the one targeted test.

### [Pass 3a] AC7’s holder-only visibility is implemented as category equality, not confirmed seat ownership

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:194`
- **Triggering input or sequence:** The character’s `court_category` equals the viewed multi-seat category, but the resolved seat’s `holder_id` does not match the character. This sets `isOwnOffice` true while `outcome.confirmed` is false; AC7’s render gates never consult `confirmed`.
- **Observable consequence:** Contrary to AC7 and the “NOT a change to who can see purchase state” constraint, a non-ST receives real balance and affordability data for a seat the app explicitly cannot confirm they hold. This acceptance finding confirms, rather than replaces, the independently discovered Pass 2 leak.
- **Confidence:** High; AC7 is explicit about holder-or-ST-only visibility and the dynamic reproduction is recorded under Pass 2.
- **Outcome: PATCHED — same fix as the Pass 2 finding immediately above.** This is the identical bug, independently confirmed by two passes working from different context (Pass 2 dynamic reproduction, Pass 3a literal AC reading) — a strong signal it was real. Not a separate patch.

### [Pass 3a] The dot-title implementation directly violates AC4 and AC6’s required helper path

- **Severity:** Medium
- **File:line:** `public/js/tabs/office-tab.js:62`
- **Triggering input or sequence:** Any merit render, or any manoeuvre render with a reasons array, uses the newly-written `_dotsWithReasons` loop.
- **Observable consequence:** AC4 says both render paths must call `shDotsWithBonus` and that “No new dot-rendering code is written”; AC6 specifically requires the existing `opts.hollowMod`/`title` mechanism. The shipped code does neither. Current filled/plain markup happens to match, but the implementation is outside the accepted design contract and will not inherit future fixes or markup changes made in the shared helper.
- **Confidence:** High on the literal AC violation; the later rationale for the deviation had not been read when this Pass 3a finding was frozen.
- **Outcome: DISMISSED with evidence, strengthened with a new test.** The literal AC violation is real and correctly caught — Pass 3a is deliberately blind to the Dev Agent Record by the review's own protocol, which is exactly where this deviation was already justified during dev (before this review ran): `shDotsWithBonus`'s `opts.hollowMod` also emits an `stm-modded-dot` class with gold-tinted ST-mod-overlay styling (`components.css` ~5472-5494), and reusing it for an ordinary unaffordable dot would have visually misrepresented it as an ST override. Re-verified directly against the CSS during this triage, not just trusted from the dev record. The finding's own secondary point — "will not inherit future markup changes made in the shared helper" — is legitimate and is now closed with a real test rather than argued away: a new parity test proves `manoeuvreRankHtml` with an all-null reasons array is byte-identical to omitting reasons (the plain `shDotsWithBonus` path), so any future divergence between the two fails a test instead of drifting silently.

## Low

### [Pass 1] Reference-view privacy test does not cover affordability titles on merit dots

- **Severity:** Low
- **File:line:** `server/tests/issue-1141-office-tab-render.test.js:786`
- **Triggering input or sequence:** A non-ST reference viewer opens an office that has a resolved seat and merit rows. The production code currently suppresses reasons through `showReasons`, but the new reference-view test inspects only the manoeuvre mount for `derived-note`.
- **Observable consequence:** A later regression that exposes balance-derived `title="Not enough office XP (...)"` attributes in the always-visible merit mount would leak purchase affordability to reference viewers while this test still passes.
- **Confidence:** High that the coverage gap exists; the shipped gating itself appears correct in the diff.
- **Outcome: PATCHED.** New test explicitly checks the merit mount (not just the manoeuvre mount) for a reference viewer: dots render (existing behaviour, unaffected) but carry no `title=` attribute.

### [Pass 1] Route exclusivity and sole-consumer claims require repository verification

- **Severity:** Low
- **File:line:** `server/routes/office-manoeuvre-rank.js:16`
- **Triggering input or sequence:** Any unchanged client or route also consumes the formerly numeric GET response or exposes `manoeuvre_xp_destroyed` through another path.
- **Observable consequence:** The response-shape change could break an unmodified consumer, or the strong “ONLY route” comment could misdescribe the data boundary.
- **Confidence:** Not yet established; deliberately recorded as worth checking because Pass 1 was restricted to the diff.
- **Outcome: DISMISSED with evidence.** Grepped the whole repo for `manoeuvre_xp_destroyed`: the only other reference is `office-seats.js`'s handover route, which returns a DIFFERENT, derived field (`manoeuvre_xp_destroyed_total`, a one-shot per-handover receipt in the PUT `/holder` response body) — not the raw stored field, and not a general read path. No other consumer of the changed GET route's shape exists beyond the three test files already found and fixed during dev (oxp-3, oxp-11, oxp-4) plus `issue-1141-office-tab-render.test.js`, found the same way. The "ONLY route" claim holds.

### [Pass 2] The updated oxp.4 source-contract test no longer proves its stated data-flow boundary

- **Severity:** Low
- **File:line:** `server/tests/oxp-4-merit-persistence-handover.test.js:389`
- **Triggering input or sequence:** `_wirePurchaseState` now adds `seat` and `allSeats` to `outcome`, then passes that object into `_wireMeritDots` and `_adjustMeritDots`; those objects contain `holder_id`. The modified test merely regex-matches the widened signatures and still asserts that seat resolution reduces the holder match to a seat id before anything else sees it.
- **Observable consequence:** The suite passes while the structural guarantee described by the test (“the holder is used to CHOOSE a seat and never travels any further”) is false. No holder id is currently sent in the merit API request, but the regression test can no longer detect holder-bearing data being propagated into the merit-dot functions it claims are isolated from it.
- **Confidence:** High; the pre-change test and current full test were compared, and the new `outcome` fields are visible at `office-tab.js:348-358`.
- **Outcome: PATCHED with a positive-form test, existing check re-verified as already sufficient.** The pre-existing `not.toMatch(/holder/i)` ban already WOULD catch a future literal `.holder_id` read inside either function (the substring `holder_id` contains `holder`), so the "structural guarantee" was not as weakened as the finding implies. Added the finding's own suggested stronger form anyway: a new test proves `_wireMeritDots`/`_adjustMeritDots`'s source never references `outcome.seat` or `outcome.allSeats` at all (confirmed by direct code read: both functions use only `outcome.seatId`), which is a positive proof rather than an absence-of-a-word check.

## Validation notes

### Pass 1 (frozen before Pass 2)

- Opened only `specs/stories/code-review/oxp-6-diff.txt`. I did not open the story spec or any repository source file.
- Commands run:
  - `Get-Content -Raw 'specs/stories/code-review/oxp-6-diff.txt'` — succeeded, but the tool display truncated the output.
  - `Select-String -Path 'specs/stories/code-review/oxp-6-diff.txt' -Pattern '^diff --git' ...` — succeeded; identified the diff section boundaries.
  - Four bounded `Get-Content` slice commands covering lines 1–1033 — succeeded and exposed the complete diff without opening another file.
- No executable gate was run in Pass 1 because the pass forbade repository exploration. No source file was modified. This review output file is the only intentional write.

### Pass 2 (frozen before Pass 3)

- Opened repository context only after Pass 1 was written. I still did not open `specs/stories/oxp-6-office-tab-purchase-markers.md` or any other account of author intent.
- Files opened in full: `public/js/tabs/office-tab.js`, `public/js/data/office-xp.js`, `public/js/data/helpers.js`, `public/js/data/api.js`, `public/js/tabs/office-data.js`, `server/routes/office-manoeuvre-rank.js`, `server/tests/issue-1141-office-tab-render.test.js`, `server/tests/oxp-11-office-purchase-seat-keying.test.js`, `server/tests/oxp-3-office-manoeuvre-rank.test.js`, and `server/tests/oxp-4-merit-persistence-handover.test.js`. I also opened the relevant `renderOfficeTab` call in `public/js/app.js` and the handover-reset block in `server/routes/office-seats.js`.
- Opened the complete base-commit (`1063787b`) versions of the three modified pre-existing tests named by the prompt via `git show`: `oxp-11-office-purchase-seat-keying.test.js`, `oxp-3-office-manoeuvre-rank.test.js`, and `oxp-4-merit-persistence-handover.test.js`. The oxp.11 and oxp.3 response-shape assertion edits preserve their original seat-independence and persistence intent. The oxp.4 signature/source-boundary edit does not, as reported above.
- Commands run included full/bounded `Get-Content` reads; `git show 1063787b:<path>` for each original test; targeted `rg` searches for the changed endpoint, consumers, fixtures, and destroyed-XP field; route-definition searches; and exact `Select-String` occurrence counts for the two source-slice anchors. Both anchors occur exactly once.
- One broad `rg` command timed out after about 12 seconds but returned partial matches; I reran narrower searches successfully. One first attempt at the inline Node trace had a wrapper syntax error and did not execute; the corrected command succeeded.
- Dynamic checks run with the real imported module:
  - `manoeuvreDotReasons(2, 5, 0)` returned `[null,null,"Not enough office XP (1 short)","Reach rank 3 first","Reach rank 4 first"]`.
  - `manoeuvreDotReasons(0, 5, 999)` left index 0 unblocked and order-blocked indices 1–4.
  - Deeply negative balances produced positive shortfalls (`51` and upward), not negative/nonsensical values.
  - Filled/plain dot markup matched `shDotsWithBonus` for ranks 0, 2, and 5.
  - A real-module fake-DOM run for an unconfirmed player own-office view reproduced the fallback-seat balance/title leak described above.
- `apiGet` has no side effect beyond one `fetch` and response parsing, so the other promise continuing after `Promise.all` rejects is harmless. A never-settling office-seat fetch leaves the same initial `Loading…`/empty-rank/optimistic-list state as before the diff. Neither synchronous renderer mutates the shared purchase/balance inputs.
- No source or test file was modified in Pass 2; only this required review report was extended.

### Pass 3a (frozen before Pass 3b)

- Opened `specs/stories/oxp-6-office-tab-purchase-markers.md` only after Pass 2 was frozen. I first listed its level-two headings, then read only lines 7–14 (Story) and 43–308 (What this story is NOT, Acceptance Criteria, Tasks/Subtasks, and Dev Notes).
- I deliberately did not read lines 321 onward (Dev Agent Record), nor the author-account content under that heading. I also did not read the separate “Why this story exists” narrative or the closing open-question section because the pass named the allowed sections narrowly; the prompt itself already supplied the settled `spendKnown` ruling needed for review.
- Commands run: one `Select-String` heading-only command and one bounded `Get-Content` command for the allowed ranges. Both succeeded.
- AC1’s exact route snippet matches the shipped route. AC6’s rank-order-first result is implemented correctly. The balance line appears once in the manoeuvre rank mount immediately after the Manoeuvres header, and no excluded seat CRUD, seat picker, OAQ approval gate, Administrator content, new route, or new write path was added.
- No source or test file was modified in Pass 3a; only this required review report was extended.
