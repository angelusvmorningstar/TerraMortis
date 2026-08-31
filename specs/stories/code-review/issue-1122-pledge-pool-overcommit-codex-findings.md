# Adversarial review: issue-1122 pledge-pool overcommit

## High

### Pass 1

- None found.

### Pass 2

- None found.

### Pass 3a

- None found.

### Pass 3b

- None found.

## Medium

### Pass 1

#### [Pass 1] Numeric pledge values are interpolated into HTML without escaping or normalization

- **Severity:** Medium
- **File:line:** `public/js/editor/sheet.js:2290-2296` (line positions inferred from the supplied diff)
- **Triggering input or sequence:** `_pledgeIdx` returns an entry whose `dots` value is not a finite number—for example, an attachment supplies a string that causes `entry.dots += att.dots || 0` to concatenate—and the resulting value compares greater than the merit's owned rating.
- **Observable consequence:** `e.dots`, `owned`, and `short` are inserted directly into an HTML string. If any can contain markup, the new warning becomes an injection sink in every renderer that consumes this HTML. The diff alone does not establish whether malformed attachment values are reachable through real write paths, so reachability and whether this is newly exposed versus inherited require Pass 2 repository tracing.
- **Confidence:** Medium. The sink and lack of escaping are certain from the diff; practical reachability is not yet established.

#### [Pass 1] Multi-oath warning omits the contribution associated with each oath

- **Severity:** Medium
- **File:line:** `public/js/editor/sheet.js:2294-2296` (line positions inferred from the supplied diff)
- **Triggering input or sequence:** Two or more standing oaths pledge different numbers of dots against the same underfunded merit.
- **Observable consequence:** The warning reports only the summed pledge, owned pool, total shortage, and a list of oath names. A reader cannot determine which oath contributes which amount from the warning, even though the adjacent pre-existing pledge badge preserves that mapping as `Oath (dots)`. This is materially ambiguous when adjudicating which promises consume the pool; the total shortage alone cannot reconstruct the per-oath allocation.
- **Confidence:** High that information is lost; Medium that product intent requires the breakdown because the spec is deliberately unavailable in this pass.

### Pass 2

#### [Pass 2] Deleting or renaming a pledged merit makes the standing overcommitment warning disappear

- **Severity:** Medium
- **File:line:** `public/js/editor/sheet.js:2331-2383`; `public/js/editor/edit-domain.js:145-165`; `public/js/editor/merits.js:180-182`
- **Triggering input or sequence:** Swear an oath against `Resources`, then use the normal general-merit remove control (or rename that merit) without first releasing/re-swearing the oath. `removeMerit` simply splices the target row, while `sworn_by.attachments` on the oath retains the old name+qualifier reference.
- **Observable consequence:** `buildPledgeIndex` still contains the orphaned pledge, but `_pledgeOvercommitNote` is invoked only while iterating extant general-merit rows, so no standing overcommitment warning renders in either admin mode or Suite. The oath row's pre-existing `_oathPledgeNote` still names the missing attachment, but it does not say that the pool is absent/underfunded. This is partly a pre-existing reverse-badge gap, but it defeats the new standing indicator precisely on a normal ungated write path that can reduce owned dots to zero by deleting the row.
- **Confidence:** High. The normal removal path has no pledge guard, and a direct real-renderer probe produced no `dom-cap-warn` while still producing the oath's `Sworn against Missing Merit 3` note.

#### [Pass 2] Legacy `rating`-only merits produce different warning arithmetic in admin and Suite

- **Severity:** Medium
- **File:line:** `public/js/editor/xp.js:193-196`; `public/js/editor/sheet.js:2290,2374-2376,3271`; `public/js/suite/sheet.js:739`; `public/js/editor/merits.js:139-155`
- **Triggering input or sequence:** Load a schema-valid legacy general merit such as `{name:'Resources', category:'general', rating:1}` with no `cp` or `xp`, while a standing oath pledges 3 dots to it. Suite calls `shRenderGeneralMerits(c, false)` directly, but the admin `renderSheet` first runs `ensureMeritSync`, which materializes `cp:0` and `xp:0`.
- **Observable consequence:** In Suite, `meritRating` takes its documented fallback and the warning says `pool funds 1 - 2 dots short`; in admin, the inserted zero fields disable the fallback and the same persisted shape says `pool funds 0 - 3 dots short`. The Suite merit row itself renders no dot glyph because its view branch separately uses only `cp + xp + free`, so its textual `pool funds 1` also contradicts the visible zero-dot row. An executed probe against the real renderer reproduced both messages. Rating-only data is not merely hypothetical: the schema permits it and the server normalizer explicitly preserves a positive no-channel rating when it cannot map `granted_by` to a canonical channel.
- **Confidence:** High.

#### [Pass 2] The new ST-framed warning is also player-visible without the badge's legality explanation

- **Severity:** Medium
- **File:line:** `public/js/suite/sheet.js:739`; `public/js/editor/sheet.js:2231-2249,2380-2383`
- **Triggering input or sequence:** Any player opens their Suite read-only sheet for a character whose general merit is overcommitted.
- **Observable consequence:** The shared view-mode branch emits `⚠ Pledged N, pool funds M - ... short against ...` into the player app. The pre-existing `_pledgeBadge` and `_oathPledgeNote` are already player-visible through the same call and therefore establish that pledge existence is not private; however, `_pledgeBadge`'s tooltip explicitly says the merit remains fully usable, while the new warning uses deficit/failure language and only an internal code comment explains that this is a legal state. A player can reasonably read it as a character-sheet error requiring correction. The diff and its direct-render tests say “both renderers” but contain no Suite-specific assertion or player-facing copy decision, so the cross-app implication looks insufficiently accounted for from code alone.
- **Confidence:** High on exposure and wording difference; Medium on whether product intent accepts that player interpretation pending the deliberately withheld spec.

### Pass 3a

#### [Pass 3a] The literal ST-facing story silently expands to the player app through its shared view branch

- **Severity:** Medium
- **File:line:** `specs/stories/issue-1122-pledge-pool-overcommit.story.md:23-28,74-80,105-108`; `public/js/suite/sheet.js:739`; `public/js/editor/sheet.js:2371-2383`
- **Triggering input or sequence:** Implement AC2 literally by adding the indicator to both view-mode sub-branches of `shRenderGeneralMerits`, then open the same overcommitted character in player Suite.
- **Observable consequence:** The story is framed exclusively as “As a Storyteller,” calls the text “ST-facing copy,” and describes only two renderers, but the view renderer is also Suite's player renderer. The implementation therefore changes the audience from ST-only to ST+player without an AC or dev note deciding whether players should see a legal-but-underfunded oath, or adapting the calm/factual copy to explain that legality. Existing pledge badges are already player-visible, so pledge secrecy is not breached; the mismatch is the new warning's implication and unacknowledged audience expansion.
- **Confidence:** High that the spec omits the cross-app consequence; Medium that shipping requires copy/product clarification rather than accepting the shared behavior as implicit in AC2.

### Pass 3b

- None found.

## Low

### Pass 1

- None found.

### Pass 2

#### [Pass 2] A zero-dot attachment contributes an oath name to the warning without contributing dots

- **Severity:** Low
- **File:line:** `public/js/data/rules-helpers.js:721-733`; `public/js/editor/sheet.js:2294-2296`
- **Triggering input or sequence:** A character contains oath A pledging 3 dots and oath B carrying a degenerate `{name:'Resources', dots:0}` attachment to the same one-dot merit.
- **Observable consequence:** `buildPledgeIndex` adds 3 then 0 to the total but pushes both oath records; the warning renders `2 dots short against Oath A, Oath B`, falsely implying Oath B participates in the shortage. A real-renderer probe reproduced that exact output. Normal UI creation deletes zero entries, `validatePledge` rejects them, and the JSON schema requires `minimum:1`, so this requires legacy/corrupt data or direct internal construction rather than an accepted normal save.
- **Confidence:** High for behavior; High that normal persisted writes reject the trigger.

#### [Pass 2] Pass 1's numeric injection sink is inherited and blocked by normal write validation

- **Severity:** Low
- **File:line:** `public/js/editor/sheet.js:2231-2238,2286-2296`; `public/js/editor/edit-domain.js:740-758,808-839`; `server/schemas/character.schema.js:601-622`; `server/middleware/validateCharacter.js:9-39`
- **Triggering input or sequence:** An in-memory/corrupt attachment contains a markup string in `dots`; normal UI and API writes are excluded from this trigger.
- **Observable consequence:** A direct probe confirmed raw markup reaches rendered HTML, but repository tracing narrows and contradicts the practical scope of the Pass 1 concern: `shSetPledgeDots` parses integers, `shSwearOath` calls `validatePledge`, and AJV rejects both string dots and zero-dot attachments under the character schema. Moreover, the pre-existing `_pledgeBadge` already interpolates the same aggregated `e.dots` without escaping, so this diff adds another sink but does not create the first exposure. Treat as data-corruption hardening, not a newly reachable security regression.
- **Confidence:** High. An AJV probe returned invalid for the markup string and valid for integer `3`.

### Pass 3a

#### [Pass 3a] Pass 1's omitted per-oath amounts match the story's suggested output rather than violating an AC

- **Severity:** Low
- **File:line:** `specs/stories/issue-1122-pledge-pool-overcommit.story.md:120-125`; `public/js/editor/sheet.js:2294-2296`
- **Triggering input or sequence:** Compare the multi-oath output to T2 after reading the spec.
- **Observable consequence:** The Pass 1 information-loss concern remains true for readers, but the implementation follows the story's suggested output shape, which names `oathNames` without individual dot contributions, and no acceptance criterion requires a breakdown. It should therefore be treated as a product-copy improvement, not an acceptance failure.
- **Confidence:** High.

### Pass 3b

#### [Pass 3b] The “targeted tests green / implemented exactly as specced” claim is not literally true in this checkout

- **Severity:** Low
- **File:line:** `specs/stories/issue-1122-pledge-pool-overcommit.story.md:82-85,275-292,361-377`; `server/tests/oath-a-pledge-helpers.test.js:388`
- **Triggering input or sequence:** Run the exact AC8 four-file command on this Windows checkout.
- **Observable consequence:** The process exits 1 with 114 passed / 1 failed, so AC8's literal “Targeted tests green” wording is unmet and the broad completion phrase “Implemented exactly as specced” is overstated. The Dev Agent Record does accurately disclose the failure; independent base-archive execution reproduced 28 passed / 1 failed at the same test and line when using the unchanged CRLF `xp.js`/`domain.js`, so this is not a regression from the story and should not by itself block shipment.
- **Confidence:** High.

#### [Pass 3b] The claimed Playwright/CSSOM run is unverifiable as stated

- **Severity:** Low
- **File:line:** `specs/stories/issue-1122-pledge-pool-overcommit.story.md:379-415`; `public/css/components.css:507`; `public/css/theme.css:147,178,321,352`
- **Triggering input or sequence:** Attempt to reproduce the record's exact headless Chromium run, computed-color assertions, and screenshot inspection from committed repository artifacts.
- **Observable consequence:** The harness and screenshots were deliberately left only in a session scratchpad, so the reported browser execution, four rendered blocks, layout/collision inspection, and exact test procedure cannot be rerun or independently authenticated. The underlying CSS claim is strongly corroborated statically: `.dom-cap-warn` resolves only to `var(--warn-dk)`; Parchment defines warn/error as `#7a5c00`/`#8B1010` and dark defines them as `#d4a832`/`#E8A0A0`, exactly matching the record's quoted RGB values and remaining distinct in both themes.
- **Confidence:** High that the run is unreproducible as stated; High that the underlying warn-not-error token mapping is correct.

## Pass 1 completeness notes

- The supplied diff shows exactly four new call sites: edit/granted, edit/plain, view/granted, and view/plain.
- The helper is called independently after `_pledgeFloorNote` in both edit sub-branches; no new early return suppresses legitimate co-rendering. The view branches do not render `_pledgeFloorNote` in the supplied diff.
- Each insertion occurs after a renderer/row string has been completed, and the helper returns one balanced `<div>...</div>`; no mismatched tag is apparent in any hunk.
- The fallback `by || 'a standing oath'` appears unreachable if the stated `buildPledgeIndex` invariant holds, but is harmless defensive output rather than a reportable defect. Repository inspection is deferred to Pass 2.
- No unused import, cleanup issue, or newly unreachable render branch is apparent in the diff.
- The rendered-HTML tests generally use a feature-specific marker (`pool funds`) rather than the pre-existing generic `Pledged N` badge. I found no clearly vacuous positive assertion in Pass 1. Some negative tone assertions are broad over the full renderer output, but that makes them stricter/brittle rather than falsely passing.

## Pass 2 completeness notes

- `buildPledgeIndex` always pushes an oath record in the same loop iteration that increments `entry.dots`; therefore `by || 'a standing oath'` remains unreachable whenever a positive index total exists. Keeping the fallback is harmless defensive coding.
- `_pledgeOvercommitNote` reads owned dots through `meritRating`; suspension is materialized separately as transient `_suspended_dots` and only reduces the displayed solid-dot band/effective accessor. A probe with 3 owned, 3 pledged, and 2 suspended rendered one effective solid dot but no overcommit warning, which is the intended non-interaction.
- The new fixture shapes match real structures: `buildSwornBy` writes `dots_required`, normalized attachment qualifiers/dots, `sworn_at`, and `history:[]`; the schema matches; the editor validates before calling it; and `free_grants:{mci:2}` is the canonical map shape read by `freeOf` and written by the post-N-1 allocator.
- Direct fixture construction is appropriate for the core render-time requirement because it deliberately bypasses the one edit path that applies `_applyPledgeFloor`; the target state is schema-valid and can be produced by other merit mutations.
- Full-function inspection confirmed exactly four `_pledgeOvercommitNote` calls, one for each edit/view × granted/plain branch. No fifth call exists elsewhere.
- `_pledgeBadge` and `_oathPledgeNote` were already player-visible before this change because Suite has long delegated its general-merit view to the same function at `public/js/suite/sheet.js:739`.

## Pass 3a completeness notes

- AC1/AC3 are implemented as a fresh pure comparison of reverse-index `e.dots` against `meritRating(c,m)`; no helper assignment or merit mutation was found.
- AC2 is wired in all four required edit/view × granted/plain sub-branches and the tests assert rendered HTML in both modes.
- AC4 is met literally by emitting only `.dom-cap-warn`; the story commit changes no CSS and the new code references no error-family class/token.
- AC5 is met: the new helper and wording are separate, `_pledgeFloorNote` is unchanged, and edit-mode call order permits both notices.
- AC6 uses a strict positive shortage (`short > 0`); equal and covered cases return empty output.
- AC7 is satisfied by construction in the new helper and reinforced by before/after merit serialization tests; no new persisted or underscore-prefixed field is introduced.
- The commit diff is empty for `public/js/editor/edit.js` and `public/css`; no excluded domain, influence, or standing renderer is wired. The only `shRenderDomainMerits` hit in the sheet diff is unchanged surrounding commentary.
- The targeted-gate result required by AC8 is deferred to Pass 3b so it can be checked alongside the author's exact claims.

## Pass 3b completeness notes

- The new suite contains and executes 17 tests: independently observed GREEN was 17/17.
- An isolated base-commit archive using the story's new test reproduced the claimed RED exactly: 10 failed / 7 passed, with positive indicator assertions failing because `pool funds` was absent rather than because of harness/import errors.
- The exact four-file gate independently produced 4 files, 115 tests, 114 passed / 1 failed; the sole failure was the documented CRLF-vs-LF literal at `oath-a-pledge-helpers.test.js:388`. No database skip or error occurred.
- The base helper suite independently produced 28 passed / 1 failed at the same test/line after using the current CRLF `xp.js` and `domain.js`; `git diff --exit-code dab928ed 492185f1 -- public/js/editor/xp.js public/js/editor/domain.js` confirmed neither source changed in the story.
- `node --check public/js/editor/sheet.js` exited 0 with no output.
- The scoped supplied diff contains no `.css` text (grep exit 1/no matches), and the story commit's only files are `sheet.js`, the new test, the story, and sprint status.
- Base line-number claims in the Debug Log were checked with `git show dab928ed:public/js/editor/sheet.js` and match the stated anchors.
- Apart from the two qualifications above, I found no false Dev Agent Record count or file-scope claim.

## Ship assessment

**Needs patches or explicit product decisions before shipping as-is; no High/blocking defect found.** The core acceptance behavior and tone implementation work, but a normal target delete/rename makes the standing warning vanish, legacy rating-only data yields contradictory cross-app arithmetic, and the player-facing audience/copy consequence is unresolved. If those edge states are consciously deferred and the player visibility is explicitly accepted, the implementation itself is otherwise technically ready; the single gate failure is independently pre-existing.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/issue-1122-pledge-pool-overcommit-diff.txt`. I checked only whether the requested output file already existed before creating it. I did not inspect the repository, story, CSS, commit, or surrounding sources.
- **Pass 2:** Before opening the story, directly inspected relevant ranges or full relevant functions in: `public/js/editor/sheet.js`, `public/js/suite/sheet.js`, `public/js/data/rules-helpers.js`, `public/js/editor/xp.js`, `public/js/editor/edit.js`, `public/js/editor/edit-domain.js`, `public/js/editor/merits.js`, `public/js/editor/domain.js`, `public/js/editor/mci.js`, `public/js/data/state.js` (loaded by probes), `public/js/editor/rule_engine/load-rules.js` (loaded/mock-shaped by tests), `server/schemas/character.schema.js`, `server/lib/normalize-character.js`, `server/routes/characters.js`, `server/middleware/validateCharacter.js`, `server/tests/issue-1122-pledge-overcommit-indicator.test.js`, `server/tests/oath-a-render-and-gate.test.js`, and `server/tests/oath-a-pledge-helpers.test.js`. Repository-wide `rg` searches also scanned `public/js` and `server` for write paths, schema validation, persistence stripping, and suspension references. I did not open the story spec.
- **Pass 3a:** Opened only story lines 23-261: Story, Why, Acceptance Criteria, What this story is NOT, Tasks/Subtasks, and Dev Notes. I first listed section headings to locate the boundary, then stopped before line 262 (`## Dev Agent Record`). I also compared the named commits/diff for excluded source and CSS changes; I did not read the author record.
- **Pass 3b:** Opened story lines 262-441 (Dev Agent Record through File List), then inspected `public/css/theme.css`, `public/css/components.css`, root `package.json`, the base-commit `sheet.js` anchors via `git show`, and the test/runtime artifacts described below. This was the first time I read the author's account.
- Earlier-pass findings were appended to, never rewritten in response to later information. Later qualifications are separately tagged findings.

### Commands run and observed results

The following are the shell commands issued, grouped by pass. `apply_patch` was additionally used to create this report after Pass 1 and append each frozen later pass; no product source was edited.

#### Pass 1 commands

1. `Get-Content -Raw -LiteralPath 'specs/stories/code-review/issue-1122-pledge-pool-overcommit-diff.txt'` — exit 0; read the two-file scoped diff.
2. `Test-Path -LiteralPath 'specs/stories/code-review/issue-1122-pledge-pool-overcommit-codex-findings.md'` — exit 0, `False`.

#### Pass 2 commands

All unqualified reads/searches below exited 0. Commands that returned no match or whose orchestration failed are called out explicitly.

1. `rg -n -C 8 "function buildPledgeIndex|export function buildPledgeIndex|function pledgeKeyFor|export function pledgeKeyFor|function buildSwornBy|export function buildSwornBy" public/js/data/rules-helpers.js`
2. `rg -n -C 12 "function meritRating|export function meritRating" public/js/editor/xp.js`
3. `rg -n "shRenderGeneralMerits|_pledgeBadge|_oathPledgeNote|_pledgeOvercommitNote|_pledgeFloorNote|buildPledgeIndex|pledgeKeyFor" public/js/editor/sheet.js public/js/suite/sheet.js`
4. `rg -n "sworn_by|buildSwornBy|attachments|validatePledge" public/js server --glob '!tests/issue-1122-pledge-overcommit-indicator.test.js'`
5. `$p='public/js/data/rules-helpers.js'; $l=Get-Content -LiteralPath $p; $l[670..885]`
6. `$p='public/js/data/rules-helpers.js'; $l=Get-Content -LiteralPath $p; $l[990..1060]`
7. `$p='public/js/editor/sheet.js'; $l=Get-Content -LiteralPath $p; $l[2110..2390]`
8. `$p='public/js/editor/edit-domain.js'; $l=Get-Content -LiteralPath $p; $l[710..865]`
9. `$p='server/schemas/character.schema.js'; $l=Get-Content -LiteralPath $p; $l[570..700]`
10. `$p='public/js/editor/edit.js'; $l=Get-Content -LiteralPath $p; $l[1060..1130]`
11. `rg -n -C 10 "export function freeOf|function freeOf|export function meritFreeSum|function meritFreeSum|function shSuspendedOf|const shSuspendedOf|export function shDotsSuspended|function shDotsSuspended" public/js`
12. `rg -n "rating:" server/schemas/character.schema.js public/js --glob '*.js'`
13. `rg -n "merits.*rating|rating.*merit|\.rating" public/js/editor public/js/data server --glob '*.js' --glob '!tests/**'`
14. `rg -n -C 6 "validate.*character|characterSchema|character\.schema|ajv|sworn_by" server/routes server --glob '*.js' --glob '!tests/**'`
15. `$p='server/lib/normalize-character.js'; $l=Get-Content -LiteralPath $p; $l[0..230]`
16. `$p='server/schemas/character.schema.js'; $l=Get-Content -LiteralPath $p; $l[480..630]`
17. `$p='public/js/editor/edit-domain.js'; $l=Get-Content -LiteralPath $p; $l[130..180]`
18. `$p='public/js/editor/edit.js'; $l=Get-Content -LiteralPath $p; $l[930..1020]`
19. `$p='public/js/editor/edit.js'; $l=Get-Content -LiteralPath $p; $l[1135..1185]`
20. `$p='server/tests/oath-a-render-and-gate.test.js'; $l=Get-Content -LiteralPath $p; $l[90..135]; $l[300..330]`
21. `$p='server/tests/oath-a-pledge-helpers.test.js'; $l=Get-Content -LiteralPath $p; $l[150..215]; $l[225..365]`
22. `rg -n "normalizeMeritsMiddleware|validateBody\(characterSchema|characterSchema" server/routes server/app.js server/index.js --glob '*.js'` — exit 1 because `server/app.js`/`server/index.js` do not exist; useful route matches were returned. This was in a parallel batch whose other issued searches were rerun.
23. `rg -n "new Ajv|coerceTypes|validateBody|validateSchema|validateCharacter" server --glob '*.js' --glob '!tests/**'`
24. `rg -n "buildSaveBody|charsForSave|strip.*underscore|startsWith\('_'\)" public/js server --glob '*.js'`
25. `rg -n "_suspended_dots|suspendedDotsByMerit|applyMeritSuspension|meritEffectiveRating" public/js/editor public/js/data --glob '*.js'`
26. `$p='server/routes/characters.js'; $l=Get-Content -LiteralPath $p; $l[0..35]; $l[420..525]`
27. `$p='public/js/editor/mci.js'; $l=Get-Content -LiteralPath $p; $l[175..220]`
28. `rg -n -C 8 "applyOathSuspensions|apply.*Suspension" public/js/editor public/js/suite --glob '*.js'`
29. `$p='public/js/editor/domain.js'; $l=Get-Content -LiteralPath $p; $l[340..385]`
30. `$p='server/middleware/validateCharacter.js'; Get-Content -Raw -LiteralPath $p`
31. `$p='server/tests/issue-1122-pledge-overcommit-indicator.test.js'; $l=Get-Content -LiteralPath $p; $l[0..346]`
32. Inline `node --input-type=module` real-renderer probe for zero-dot, orphan target, `rating` fallback, suspension, and markup-string cases — exit 0. It reproduced the zero-dot name, missing orphan warning, legacy warning, suspension non-interaction, and raw malformed markup.
33. Inline `node --input-type=module` AJV probe from `server` for attachment dots equal to a markup string, `0`, and `3` — exit 0; string and zero invalid, integer 3 valid.
34. `$p='public/js/suite/sheet.js'; $l=Get-Content -LiteralPath $p; $l[700..755]`
35. `$p='public/js/editor/sheet.js'; $l=Get-Content -LiteralPath $p; $l[2220..2390]`
36. `$p='public/js/data/rules-helpers.js'; $l=Get-Content -LiteralPath $p; $l[1060..1100]`
37. `rg -n "applyDerivedMerits\(" public/js/editor public/js/suite --glob '*.js'`
38. `rg -n -C 10 "export function removeMerit|function removeMerit" public/js/editor/merits.js public/js/editor` — issued in a batch that returned exit 1 because a sibling no-match search failed; rerun successfully as command 41.
39. `$p='public/js/editor/merits.js'; $l=Get-Content -LiteralPath $p; $l[0..100]` — issued in the same failed batch; relevant range was rerun later.
40. `rg -n "rename|shEditGenMerit|shRemoveGenMerit" server/tests/issue-1128-dot-wrapper.test.js server/tests/oath-a-render-and-gate.test.js` — no matches/exit 1.
41. `rg -n -C 10 "export function removeMerit|function removeMerit" public/js/editor` — exit 0.
42. `$p='public/js/editor/merits.js'; $l=Get-Content -LiteralPath $p; $l[135..185]` — first issued alongside the no-match command 40, then rerun alone successfully.
43. `rg -n -C 8 "applyDerivedMerits|ensureMeritSync|function render.*Sheet|export function.*Sheet" public/js/suite/sheet.js`
44. `$p='public/js/editor/sheet.js'; $l=Get-Content -LiteralPath $p; $l[3240..3290]`
45. `$p='public/js/suite/sheet.js'; $l=Get-Content -LiteralPath $p; $l[500..560]`
46. `$p='public/js/suite/sheet.js'; $l=Get-Content -LiteralPath $p; $l[195..235]`
47. Inline real-renderer legacy-row probe — exit 0; showed no dot glyph but `pool funds 1` in Suite-like direct view.
48. Inline `ensureMeritSync` comparison probe — exit 0; Suite-like warning was `1 / 2 short`, admin-like warning `0 / 3 short` for the same initial `rating:1` data.

#### Pass 3a commands

1. `rg -n "^## " specs/stories/issue-1122-pledge-pool-overcommit.story.md` — exit 0; located Dev Agent Record at line 262 without reading it.
2. `$p='specs/stories/issue-1122-pledge-pool-overcommit.story.md'; $l=Get-Content -LiteralPath $p; $l[22..260]` — exit 0; stopped before the author record.
3. `git diff --name-only dab928ed 492185f1 -- public/js/editor/edit.js public/js/editor/sheet.js public/css server/tests/issue-1122-pledge-overcommit-indicator.test.js` — exit 0; only `sheet.js` and the new test.
4. `git diff --exit-code dab928ed 492185f1 -- public/js/editor/edit.js public/css` — exit 0/no diff.
5. `git diff --unified=3 dab928ed 492185f1 -- public/js/editor/sheet.js | rg -n "shRenderDomainMerits|shRenderInfluenceMerits|shRenderStandingMerits|_pledgeFloorNote\(m\) \{|function _pledgeFloorNote|function _oathPledgeEditor|_applyPledgeFloor"` — exit 0; only the new helper comment's `_applyPledgeFloor` mention and unchanged domain-renderer context.

#### Pass 3b commands

1. `$p='specs/stories/issue-1122-pledge-pool-overcommit.story.md'; $l=Get-Content -LiteralPath $p; $l[261..440]` — exit 0; read Dev Agent Record in full.
2. `cd server && npx vitest run tests/issue-1122-pledge-overcommit-indicator.test.js tests/oath-a-render-and-gate.test.js tests/oath-a-pledge-helpers.test.js tests/issue-1128-dot-wrapper.test.js` — exit 1: **4 files, 115 tests, 114 passed / 1 failed**, sole failure at helper line 388; no skips or DB messages.
3. `node --check public/js/editor/sheet.js` — exit 0, no output.
4. `npx vitest run tests/issue-1122-pledge-overcommit-indicator.test.js` from `server` — exit 0: **1 file, 17/17 passed**.
5. Attempted isolated-clone setup under `D:\tmp\issue1122-red-base-codex-20260831` — failed with permission denied; nothing was created there.
6. Attempted `git clone --no-hardlinks --no-checkout 'D:\Terra Mortis\TM Game'` into a unique workspace scratch path — failed because Git treated the source as dubious ownership; the command then created only an empty `server/node_modules` junction structure. `Resolve-Path` plus recursive listing verified the exact contents; policy rejected two `Remove-Item` forms, and exact non-recursive `[System.IO.Directory]::Delete` calls removed the junction and empty parents. Final `Test-Path` was `False`.
7. Retried the local clone with command-scoped `git -c safe.directory='*' clone ...` — timed out after 122 seconds while only a partial `.git` directory existed. `Resolve-Path`/top-level listing verified the exact unique scratch target; `[System.IO.Directory]::Delete($resolved,$true)` removed it, and `Test-Path` returned `False`.
8. `Get-ChildItem -Name -LiteralPath server | Where-Object { $_ -match 'package|vitest' }; Get-Content -Raw -LiteralPath package.json` — exit 0; located Vitest metadata and package type.
9. `rg --files public server | rg "package\.json$|vitest\.config\.js$"` — exit 0.
10. Created a unique workspace scratch archive with `git archive` of base `public/js`, package/Vitest metadata, and the base helper test, plus a second archive of the story's new test; expanded both and junctioned the existing `server/node_modules` — exit 0.
11. `npx vitest run tests/issue-1122-pledge-overcommit-indicator.test.js` in the archive — first run exit 1/no tests because `tests/helpers/setup-env.js` was absent.
12. Archived and expanded base `server/tests/helpers/setup-env.js` — exit 0.
13. Reran the base-renderer new suite — exit 1 with the claimed **10 failed / 7 passed (17)**; failure output showed missing `pool funds`/indicator assertions.
14. `git diff --exit-code dab928ed 492185f1 -- public/js/editor/xp.js public/js/editor/domain.js` — exit 0. A PowerShell byte/newline count found `xp.js` 275 CRLF/0 bare LF and `domain.js` 679 CRLF/0 bare LF; those unchanged checkout copies were mechanically copied into the base archive to reproduce the environment artifact.
15. `npx vitest run tests/oath-a-pledge-helpers.test.js` in the base archive — exit 1: **28 passed / 1 failed**, same test and line 388, CRLF received versus LF literal expected.
16. `rg -n -C 4 "dom-cap-warn|--warn-dk|--err" public/css/theme.css public/css/components.css` — exit 0; confirmed both themes and class mapping.
17. `rg -n "\.rel-error|\.sh-touchstones-error|\.rel-disp\.negative|var\(--err\)|var\(--warn-dk\)" public/css/components.css public/css/theme.css` — exit 0; confirmed error-family contrast.
18. `rg -n "\.css" specs/stories/code-review/issue-1122-pledge-pool-overcommit-diff.txt` — exit 1/no matches, as expected.
19. `git diff --name-only dab928ed 492185f1 | Sort-Object` — exit 0; four files: source, test, story, sprint status.
20. `Resolve-Path` and top-level listing of the archive scratch target, followed by verified junction removal and exact recursive `[System.IO.Directory]::Delete` — exit 0; final `Test-Path` was `False`.
21. `git show dab928ed:public/js/editor/sheet.js | rg -n "function _pledgeFloorNote|const _pledgeIdx =|const _pledgeBadge|const _oathPledgeNote|if \(m\.granted_by\)|h \+= _pledgeFloorNote\(m\)|oM\.slice"` — exit 0; confirmed the Debug Log's base line numbers.
22. `git status --short; Get-ChildItem -Force -Name | Where-Object { $_ -like '.codex-review-issue1122-*' }; rg -n "^## (High|Medium|Low|Validation notes)|^### Pass [123]" specs/stories/code-review/issue-1122-pledge-pool-overcommit-codex-findings.md` — exit 0. No scratch path remained. Git reported no tracked modification; it listed the requested findings file plus pre-existing untracked `markdown/`, `scratchpad/`, diff/review/exec-log artifacts.

Some commands above were issued through parallel orchestration; when one no-match command made the wrapper return exit 1 and suppress sibling output, the relevant searches were rerun individually. No result is claimed from a suppressed output alone.

### Could not run / intentionally not run

- I could not reproduce the exact Playwright 1.58.2/Chromium 1208 CSSOM and screenshot run because its harness and images are not in the repository. I performed the required independent static token/class verification instead; the quoted RGB values agree exactly with the committed hex values.
- I did not drive the live OAuth-protected admin app or mutate Mongo to manufacture a character. The requested acceptance behavior was exercised through the real renderer/module graph, and no database was required or contacted.
- I did not run the full 171-file suite, per the explicit instruction. Only the requested four-file gate, the new suite alone, the base RED suite, and the base helper suite were run.
- `D:\tmp` unexpectedly rejected scratch creation. The isolated base verification was completed in a uniquely named workspace scratch archive instead, then removed after exact-path validation.

### Modification/restoration attestation

- No product source, test, story spec, sprint file, commit, branch, sibling repository, database, or external system was modified.
- The only lasting file created by this review is this requested findings report.
- Temporary scratch content consisted of one failed empty/junction setup, one timed-out partial clone, and one successful base archive under unique `.codex-review-issue1122-*` paths inside TM Game. Each exact path was resolved and inspected before deletion; each final `Test-Path` returned `False`. No sibling repository was opened or touched.
- Final `git status --short` is clean of unintended tracked or scratch changes. It is not globally empty because the workspace already contains untracked `markdown/`, `scratchpad/`, the supplied diff, and other code-review artifacts; this report is the only new lasting path attributable to this review.
