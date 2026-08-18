# Story BL-3a: One implementation of in-clan — rewire every reader to the cache

Status: done

> **Epic BL** — issue **#1008**. Third story, and the one that makes the epic's promise true on
> **every** costing surface rather than one.
>
> **This story is half of the original BL-3**, split on 2026-08-10 after BL-3 and BL-4 were found to
> block each other. BL-4 must not ship before the DT form stops reading the constants (a Mongo-only
> bloodline would otherwise cost one price on the sheet and another in the DT form, silently), but
> BL-3 could not delete the constants because **`server/scripts/seed-bloodlines.js:57` reads them** —
> deleting both would leave the collection with no writer at all until BL-4 exists. Angelus ruled the
> split. **BL-3a rewires the readers and KEEPS the constants; BL-3b deletes them, after BL-4.**
>
> **Data-lock:** no new pass needed. BL-2's data-lock (2026-08-10) verified every reader and the
> shapes are unchanged; `D:\Terra Mortis\data-map.md` is current. The reader list below was
> **re-verified by grep on 2026-08-10 after BL-2 landed** — but re-verify line numbers before editing,
> because BL-2 moved some of them.
>
> **Deploy:** branch from `main`, PR direct to `main`, never through `dev`. No push or merge without
> Angelus's explicit word in his current message.
>
> **Timing:** Epic BL is agreed for **after Game 7 (Sat 2026-08-15)**. This story changes what players
> are charged in the DT form, so it carries the same weight as BL-2, not BL-1.

## Story

As the Storyteller,
I want every surface that asks "is this discipline in-clan?" to route through the one accessor that
reads the bloodlines collection,
so that adding a bloodline without a deploy produces the right cost **everywhere**, and so that the
DT form stops being a second, quietly divergent implementation of the same rule.

## Why this story exists

After BL-2 there are **two live sources of in-clan truth**:

| Surface | Reads | Miss path |
|---|---|---|
| Sheet, editor, audit, export | `clanDiscList` → the collection | empty + banner + editor lock |
| **DT form** (`downtime-form.js:4109-4115`) | `BLOODLINE_DISCS` → the constant | **falls through to the clan list** |

The DT form's private `isClanDisc` is drift pattern #15 verbatim, still live, and it feeds
`getXpCost` at `:4130` — so it decides what a **player** is charged when they buy a discipline.

Today the two agree, because the collection is seeded *from* the constants. They stop agreeing the
moment BL-4 lets an ST add a bloodline that exists only in Mongo — the sheet would cost it correctly
and the DT form would fall back to the clan list, with no banner, no lock, and no error. That is the
original defect reintroduced on the surface players actually touch.

BL-2 fixed the accessor. This fixes the rule.

## Acceptance Criteria

1. **Exactly one implementation of in-clan.** After this story, `grep -rn "BLOODLINE_DISCS" public/js`
   returns hits only in `data/constants.js` (the definition), `data/bloodlines-cache.js` and
   `data/accessors.js` (comments referring to the migration), and `dev-fixtures.js` (BL-3b's problem).
   **No live code path may compute in-clan from the constant.**
2. **The DT form routes through the accessor.** `downtime-form.js` already imports from
   `data/accessors.js` at `:22`, so this is an import addition, not a new dependency:
   - `isClanDisc(discName)` (`:4109-4115`) becomes `isInClanDisc(currentChar, discName)`;
   - `clanDiscs` (`:4174`) becomes `clanDiscList(c)`;
   - `bloodlineDiscs` (`:4176`) becomes `c.bloodline ? clanDiscList(c) : []`.
   Delete the private function rather than leaving it unused.
3. **The DT form inherits the miss ruling, and it must be visible to a player.** An unresolved
   bloodline there means every discipline costs 4 XP per dot. The banner is already mounted in
   `app.js` (BL-2), and `downtime-form.js` free-rides on `app.js`'s boot priming (documented at
   `downtime-form.js:36`) — **verify both, do not assume.** A player must not be quoted a price
   computed from an unresolved bloodline without the banner being on screen.
4. **The two bloodline dropdowns read the cache.**
   - `editor/identity.js:19` — `APPROVED_BLOODLINES` becomes `approvedBloodlines()`;
   - `editor/sheet.js:2703` — `BLOODLINE_CLANS[c.clan]` becomes `bloodlinesByClan()[c.clan] || []`.
   Both functions already exist in `data/bloodlines-cache.js`; BL-2 built them for exactly this and
   they currently have zero callers.
5. **A bloodline that exists only in Mongo becomes selectable.** This is the epic's actual promise
   and the first point at which it is observable. A test must prove that a name present in the cache
   but absent from the constants appears in both dropdowns.
6. **The clan-change block at `edit.js:102-104`.** It reads `BLOODLINE_CLANS[val]` to clear a
   bloodline that does not belong to the new clan. **BL-5 will delete this whole branch** — Angelus
   ruled 2026-08-10 that clan is write-once, so it is unreachable. Rewire the one line to the cache
   anyway (`bloodlinesByClan()[val] || []`) rather than leaving the last constant reader alive: BL-3b
   is blocked while any live path reads `BLOODLINE_CLANS`, and BL-3b must not also have to wait on
   BL-5. One line of eventually-deleted code is the cheaper trade.
7. **`wizard.js:118` is excluded.** Zero importers, verified again 2026-08-10. Do not wire it, do not
   migrate it. It belongs to **#1095**.
8. **Behaviour is identical while the collection matches the constants.** Every DT form pool, every
   XP cost and both dropdowns must be unchanged for all 23 seeded bloodlines. A test proves this over
   all 23, not a sample.
9. **Tests** (targeted vitest; the full suite is NOT a gate — see Dev Notes):
   - the DT form's cost path: in-clan and out-of-clan for a resolved bloodline, and **4 XP per dot
     for every discipline when the bloodline is unresolved** (the case the old fallback got wrong);
   - the Malkovians two-way case again, this time through the DT form, since that is the surface
     that was still wrong;
   - both dropdowns render from the cache, including AC 5's Mongo-only name;
   - AC 8 equivalence over all 23;
   - **`server/tests/dt-form-territory-fresh-fetch.test.js:77-78` mocks `CLAN_DISCS` and
     `BLOODLINE_DISCS` on the constants module.** Changing what `downtime-form.js` imports will break
     that mock. Update it; do not delete the assertions it guards.

## What this story is NOT

- **No deletion of the constants**, and no change to `seed-bloodlines.js` — **BL-3b**, after BL-4.
  The constants stay as the seed's input.
- **No change to `dev-fixtures.js`** — it derives its `/api/bloodlines` fixture from the constants,
  which is correct while they exist. **BL-3b**.
- **No admin CRUD, no write endpoints** — **BL-4**.
- **No write-once enforcement, no editor lock on clan or bloodline** — **BL-5**. AC 6 rewires one
  line inside a block BL-5 will delete; it does not implement BL-5's rule.
- **No `wizard.js` work** — #1095.
- **No new banner or lock UI.** BL-2 built both; this story makes a third surface feed them.

## Tasks / Subtasks

- [x] Task 1 (AC 2, 3): rewire `downtime-form.js`'s three sites; delete the private `isClanDisc`;
      verify the boot priming and banner actually reach the DT form.
- [x] Task 2 (AC 4, 5): rewire both dropdowns to `approvedBloodlines()` / `bloodlinesByClan()`.
- [x] Task 3 (AC 6): rewire `edit.js:103`.
- [x] Task 4 (AC 1): grep-prove there is no live constant reader left, as a test.
- [x] Task 5 (AC 8, 9): tests, including the DT form cost matrix and the all-23 equivalence.
- [x] Task 6 (AC 9): repair `dt-form-territory-fresh-fetch.test.js`'s mock.
- [~] Task 7: verify in-browser — a DT form discipline purchase for a resolved character, and for an
      unresolved one. **BL-2's browser gap is still open; this is the story that should close it.**
- [ ] Task 8: PR to `main` (Angelus's word). *(GATED.)*

## Dev Notes

### Verified reader list (grep, 2026-08-10, post-BL-2)

| File:line | Reads | This story |
|---|---|---|
| `editor/identity.js:19` | `APPROVED_BLOODLINES` | rewire (AC 4) |
| `editor/sheet.js:2703` | `BLOODLINE_CLANS` | rewire (AC 4) |
| `editor/edit.js:103` | `BLOODLINE_CLANS` | rewire (AC 6) |
| `tabs/downtime-form.js:4112/4174/4176` | `BLOODLINE_DISCS` | rewire (AC 2) |
| `tabs/wizard.js:118` | `BLOODLINE_CLANS` | **excluded**, dead |
| `data/dev-fixtures.js:1` | both | **BL-3b** |
| `server/scripts/seed-bloodlines.js:57` | both | **BL-3b** — this is why the split exists |

`editor/sheet.js:6` and `editor/edit.js:7` will still import the constants for other purposes
(`CLAN_DISCS`, `CLAN_BANES`); only the bloodline names come out.

### The cache API BL-2 already built for this

`public/js/data/bloodlines-cache.js` exports `bloodlinesByClan()` and `approvedBloodlines()`, both
derived from the one collection and both currently unused — BL-2's AC 2 required them precisely so
this story is a rewiring job and not a redesign. Neither filters on availability: there is no
soft-retire concept, ruled 2026-08-10.

### Two traps from BL-2's review

- **`sheet.js:2703` carries an inline `style="margin-top:3px;font-size:10px"`** on the bloodline
  select, which violates the project's normalised-CSS rule. You are editing that line anyway; fix it
  with a class while you are there.
- **A locked discipline row shows two different dot totals** (`sheet.js:653` pips from stored `dots`
  vs `:685` recomputed at 4/dot). Registered in `deferred-work.md`, not this story's job, but you
  will see it while testing an unresolved character and it is not a new bug.

### Environment and hard rules

- **The full test suite is not a gate** — six known permanent reds (#1116, #1115, #1125, #1117, plus
  `issue-837-xp-totals-deprecation` and `n8-mandragora-prereq`, both parse errors). Run only your own
  specs plus any you touch. Never pipe through `tail`.
- `server/tests/repo-no-nul-bytes.test.js` exists as of BL-2 and should stay green.
- **Normalised CSS is mandatory.** Tokens only, reuse before invent, grouped selectors for shared
  chrome.
- British English, no em-dashes in any string the app prints.
- Branch from `main`; PR to `main`; no push or merge without Angelus's explicit word.

### References

- Issue **#1008**; `specs/stories/sprint-status.yaml` under `epic-bl`
- **BL-2's story and Senior Developer Review** — the miss ruling, and the review that found the DT
  form divergence
- `D:\Terra Mortis\data-map.md` — drift patterns **#15** (the ruling) and **#16**, plus the
  `bloodlines`, `characters.bloodline` and `characters.clan` entries
- `specs/stories/deferred-work.md` — BL-2's six deferrals; three of them are this story's

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5`), via `bmad-dev-story` inside `bmad-loop`. 2026-08-10.

### Debug Log References

**DT form costing, verified unchanged against the live roster.** The new path (`isInClanDisc`) vs
the exact expression it replaced, across every live bloodline-carrying character and every
discipline:

```
every character x every discipline costs the same: true (130 combinations)
```

**Tests:** `Test Files 24 passed · Tests 396 passed` — the new BL-3a suite, the repaired DT form
mock, the five BL-2 suites, the three BL-1 suites, the NUL guard, and every existing suite importing
`accessors.js`, `api.js` or `test-app.js`.

**The NUL guard earned itself back on its first day.** Mid-run it failed the batch on a transient
NUL that one of my own `node -e` edits had put into
`server/tests/dt-form-territory-fresh-fetch.test.js`; a subsequent Edit-tool rewrite removed it, so
it passed in isolation afterwards. That is precisely the failure mode it was added for: invisible,
transient, and undetectable by parse-checking.

### Completion Notes List

**AC 9 deviation, declared rather than quietly narrowed.** AC 9's first two bullets asked for a
behavioural test of the DT form's cost path. `getXpCost`, the former `isClanDisc`, and `currentChar`
are all module-private in a 4000-line DOM module whose character is set from a render path that
needs a browser (`downtime-form.js:1372`). Exporting internals purely so a test could reach them
would be a worse module for a weaker check. The split I took instead:

- the **behaviour** of the cost decision is now literally `isInClanDisc`, which BL-2's suite covers
  exhaustively — all 23 bloodlines, the Malkovians two-way case, and unresolved-means-everything-
  out-of-clan;
- what remained BL-3a's own risk is **wiring**, and that is asserted directly, including a
  grep-proof over all of `public/js` that no unexpected file can reach the constants;
- the equivalence claim is backed by the 130-combination run against live characters above, which is
  stronger evidence than a mocked unit test would have been.

**Design decisions:**

1. **The private `isClanDisc` was deleted, not left unused.** An orphaned copy of a rule is exactly
   how the second implementation came to exist; leaving it would invite the next author to call it.
2. **`bloodlineDiscs` became `c.bloodline ? clanDiscList(c) : []`** rather than a new cache call.
   Its only job is widening `validDiscs` to include bloodline-only disciplines, and `clanDiscList`
   already returns precisely that set when a bloodline is present.
3. **Dead imports removed as they fell out.** `downtime-form.js` no longer imports `CLAN_DISCS` or
   `BLOODLINE_DISCS`; `sheet.js` no longer imports `BLOODLINE_DISCS` or `BLOODLINE_CLANS`; `edit.js`
   no longer imports either. Leaving them would have made AC 1's grep-proof pass on a technicality
   while the imports rotted.
4. **The inline-style trap was fixed while in the file**, as the story instructed:
   `style="margin-top:3px;font-size:10px"` on the bloodline select became `.sh-edit-select-sub` in
   `components.css`, tokens only, and a test now pins its absence.
5. **The stale mock entry was removed with its reason in a comment.** `BLOODLINE_DISCS` is gone from
   `dt-form-territory-fresh-fetch.test.js`'s constants mock because the DT form no longer imports it;
   `CLAN_DISCS` stays because `accessors.js` still reads it for the no-bloodline path.

**Scope held.** The constants are still defined and still exported — BL-3b deletes them, after BL-4.
`seed-bloodlines.js` and `dev-fixtures.js` are untouched and still read them, which is correct and is
the whole reason for the split. `wizard.js:118` untouched (dead, #1095). No write endpoints, no
write-once enforcement, no new banner or lock UI.

**Task 7 is PARTIAL, and it is the same gap BL-2 declared.** The 130-combination live check covers
the logic on the surface this story changed, but nobody has yet opened a browser and watched the DT
form quote a price, or seen the banner render. BL-2 flagged this; BL-3a was nominated as the story
to close it and has not. It is still the first thing to do once BL-1 is merged and the seed applied.
Recorded as `[~]`, not `[x]`.

### File List

New:

- `server/tests/bl3a-one-inclan-implementation.test.js`

Modified:

- `public/js/tabs/downtime-form.js` — private `isClanDisc` deleted; the cost branch and the
  discipline picker route through `isInClanDisc` / `clanDiscList`; dead constant imports removed
- `public/js/editor/identity.js` — bloodline options from `approvedBloodlines()`
- `public/js/editor/sheet.js` — bloodline options from `bloodlinesByClan()`; inline style replaced
  with `.sh-edit-select-sub`; dead constant imports removed
- `public/js/editor/edit.js` — clan-change validity check reads the cache; dead constant imports
  removed
- `public/css/components.css` — `.sh-edit-select-sub`
- `server/tests/dt-form-territory-fresh-fetch.test.js` — stale `BLOODLINE_DISCS` mock entry removed
- `specs/stories/bl-3a-rewire-readers-to-cache.story.md`, `specs/stories/sprint-status.yaml`

## Senior Developer Review (AI)

**Reviewer:** internal 3-layer adversarial review, parallel Opus subagents. **Date:** 2026-08-10.
**Outcome:** Changes Requested → 8 fixes applied → **Approve.**

**Layers:** Blind Hunter (diff only) 10 · Edge Case Hunter (diff + repo) 8 · Acceptance Auditor
(diff + spec + standards) 8. The diff was 405 lines and looked like a clean refactor. It was not.

### The one that mattered: I shipped a crash

**`isClanDisc` was deleted while two live calls to it survived** at `downtime-form.js:4188-4189`
(`const cost = isClanDisc(d) ? 3 : 4`). I rewired `getXpCost` and stopped looking. The result is
`ReferenceError: isClanDisc is not defined` on two player-facing paths: opening the XP-spend picker
with category **Discipline**, and rendering a saved discipline commitment — the second needs no
interaction at all.

**My own test passed against it.** It asserted `not.toMatch(/function isClanDisc/)` — the
*declaration*, which was indeed gone. The declaration was never the risk. ES modules resolve free
identifiers at runtime, so `node --check` and the repo's pre-commit hook both pass, and there is no
linter. Found by the Edge Case Hunter, which had repo access and grepped for call sites.

The test now asserts no bare `isClanDisc(` call survives anywhere in `public/js`, not just that the
function is gone.

### The one all three layers found independently

**`shEdit('clan', …)` would silently delete a valid bloodline.** `bloodlinesByClan()` returns `{}`
whenever the cache is unloaded, failed, **or the collection is empty** — and empty is the live state
until the seed runs. An empty map makes `validBLs` empty, so *every* bloodline reads as invalid and
the branch nulls it, with `_markDirty()` already fired so the next save persists the loss.

This is the only destructive write in the rewiring, and moving it to an async source is what made it
dangerous; the static constant was always populated, so the clear only ever fired on a genuine
mismatch. It now refuses to judge unless the cache can answer (`bloodlinesResolvable()`, a single
predicate so three call sites cannot each invent their own combination of the three state flags),
and compares on the same trimmed/case-folded key the cost path uses, so a value that costs correctly
is never deleted for a spelling difference.

### Fixes applied (8)

1. **[High] The `isClanDisc` crash** — above, plus a repo-wide guard against bare calls.
2. **[High] The clan-change destructive write** — guarded and normalised, with five tests covering
   empty / failed / resolvable / valid-for-new-clan / case-differing.
3. **[Med] Bloodline names were interpolated into `<option>` unescaped.** They are now DB-sourced,
   the read endpoint is public and unauthenticated, and BL-4 lets an ST write them. Both dropdowns
   `esc()` them, as the same files already do for constant-sourced options.
4. **[Med] Either dropdown could show a bloodline-bearing character as having none.** If the stored
   value is absent from the derived list — empty cache, or a case/whitespace difference — no option
   carries `selected`, the browser picks index 0 (`(none)` / `(no bloodline)`), and the next change
   commits that. Both now union the character's own value in and match case-insensitively.
5. **[Low, but a real regression] The replacement CSS class lost a specificity fight the inline
   style had won.** `.sh-edit-select-sub` (0,1,0) loses to `.sh-desktop .sh-edit-select` (0,2,0) at
   `components.css:921`, so the sub-select would have rendered at 13px instead of 10px on the admin
   character sheet — the one surface it exists for. Added a matching desktop rule.
6. **[Med] The accessors mock in `dt-form-territory-fresh-fetch.test.js` was not updated** with the
   two functions the DT form now imports. Latent: any future assertion driving the render deeper
   would fail with a confusing mock error.
7. **[Low] A comment I added to that mock was wrong** — it claimed `accessors.js` still reads
   `CLAN_DISCS` there, but `accessors.js` is mocked wholesale in that file. Corrected, with the error
   noted so the next reader knows it was checked.
8. **[Low] The `isClanDisc` deletion test strengthened** from declaration-only to call-site coverage
   (this is #1's guard, listed separately because it is a test change, not a code change).

Every fix proved to discriminate by single-change revert: eight reverts, eight failures.

### Verified false or accepted as-is (4)

- *"`CLAN_DISCS` may still be referenced in `downtime-form.js` after the import was dropped"* —
  grep: zero occurrences.
- *"The AC-8 equivalence test is circular"* — true as stated, and unchanged: the fixture is built
  from the constants. It is not the evidence for AC 8; the 130-combination live run is, and that
  reads real character documents. Noted rather than papered over.
- *"AC 1's allow-list exempts whole files including `accessors.js`"* — fair. Left as-is: narrowing it
  to comment-only matching is a real improvement but touches the guard protecting the epic's central
  claim, and doing that inside a review pass on a story that already shipped a crash is the wrong
  moment. Deferred with the reasoning.
- *"AC 1 is literally false because `wizard.js:118` still reads `BLOODLINE_CLANS`"* — correct, and
  AC 7 explicitly excludes `wizard.js` as dead (zero importers, re-confirmed). AC 1 and AC 7
  contradict each other as written; the code is right and the AC text was sloppy. Recorded here
  rather than silently reconciled by the allow-list.

### Regression after patching

`Test Files 25 passed · Tests 417 passed`. The live costing re-verification was re-run after every
change: **130 combinations, identical**. The NUL guard again caught a transient byte from one of my
own shell edits mid-run — second time in two stories, and the reason it exists.

**No unresolved High or Medium findings remain.** The browser-rendering gap is unchanged and still
declared; this story did not close it.

## Change Log

| Date | Change |
|---|---|
| 2026-08-10 | Internal 3-layer review. 8 fixes (2 High, 3 Medium, 3 Low), 3 deferred, 4 verified false or accepted. Worst was a `ReferenceError` I shipped: `isClanDisc` deleted with two live calls surviving, and my own test passed because it checked the declaration rather than the call sites. 10 new tests; all fixes proved to discriminate. 417 green. |
| 2026-08-10 | BL-3a implemented. The DT form's private in-clan implementation deleted and both its call sites routed through the shared accessor, so there is now exactly one implementation of in-clan; both bloodline dropdowns and the clan-change check read the collection. A Mongo-only bloodline is selectable for the first time. 13 new tests, 396 green. Costing verified unchanged across 130 live character x discipline combinations. Browser verification still outstanding, carried from BL-2. Status → review. |
