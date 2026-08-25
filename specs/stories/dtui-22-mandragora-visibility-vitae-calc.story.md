---
id: dtui.22
epic: dtui
status: done
priority: medium
depends_on: []
---

# Story DTUI-22: Blood Sorcery — Mandragora Garden checkbox visibility + Vitae Projection calculation

As a player whose character has (or doesn't have) the Mandragora Garden merit,
I want the "Park in Mandragora Garden" checkbox to appear only when my garden actually has usable capacity, and the Vitae Projection's Blood Fruit line to report that same capacity,
So that the form never offers me a garden benefit my character doesn't actually have access to, and never disagrees with itself about how big that benefit is.

---

## Context

**FR5/FR6** (epic doc, `specs/epic-dtui-downtime-form-ux-refactor.md` FR Coverage Map): *"Mandragora Garden checkbox is shown only for characters who have the Mandragora Garden merit"* / *"Vitae Projection — Mandragora Garden contribution uses the same calculation logic as the feeding roll (effective dots)"*. Epic doc Story 1.22 (~line 1068-1096).

**Wave 4** (parallelisable with Waves 2-3 after Wave 1) — Wave 1/2/3 are all complete, and dtui-20 (Court Acknowledge Peers) and dtui-23 (Feeding territory relocation, on its own unmerged branch `ms/dtui-23-feeding-territory-relocation`) are this epic's other Wave 4 stories done so far. `depends_on` is empty deliberately — this story does not touch anything dtui-20/dtui-21/dtui-23 touch. **This story branched fresh off `origin/main`, which does NOT include dtui-23's changes** (dtui-23 is committed locally on its own branch only, not merged) — its own restructured Feeding section markup is not present here; this story reads and writes against the pre-dtui-23 Feeding section shape, which is unaffected either way since this story's own Vitae Projection work sits in a separate container from the parts dtui-23 touched (territory/blood-type/method tickers).

### The epic's premise needed real investigation before any code changed — read this before touching anything

Unlike dtui-23 (where two of four ACs turned out to already be true), this story's premise was **partly right, partly imprecise**, and required tracing through `effectiveDomainDots()`/`meritEffectiveRating()` (`public/js/tabs/downtime-form.js:411-419`, `public/js/editor/domain.js:363-403`) to find out which:

1. **"Mandragora Garden checkbox" (FR5) is the existing "Park in Mandragora Garden" checkbox inside `renderSorcerySection()`** (`downtime-form.js:5077-5096`, Blood Sorcery section) — confirmed the only Mandragora-related checkbox in the form. There is no separate "Mandragora Garden checkbox" anywhere in the Feeding section or Vitae Projection container; FR6's own AC wording ("Given the Mandragora Garden checkbox is checked...") refers to this same one.
2. **FR5's gate was real, but wrong-shaped, not missing.** Before this story, `hasMandragora` (`downtime-form.js:4978`, pre-change) was `(currentChar.merits || []).some(m => m.name === 'Mandragora Garden')` — mere merit-name possession, not effective rating. A character can own a Mandragora Garden merit entry with **0 effective dots** (e.g. the merit row exists on the sheet but no CP/XP/free dots have been allocated to it yet — a realistic, reachable state during character build or data cleanup) and the old gate would still show the checkbox, the "+3 dice" notice, and (via a separate, correctly-gated `mandragoraCap` computation) implicitly promise 0 capacity while still looking usable. **This is the real, concrete bug FR5 fixes** — not a "feature doesn't exist yet" gap.
3. **FR6 was already TRUE for the specific figure it names** (`mandDots = effectiveDomainDots(c, 'Mandragora Garden')`, `downtime-form.js:7286`/pre-change `7276` — the Blood Fruit contribution line in the Vitae Projection container) — this already used the effective-dots helper, not inherent-only, before this story touched anything. What was NOT true until this story: the Blood Sorcery section's own checkbox-visibility gate used a *different, weaker* check for what is conceptually the same fact (does this character's garden have usable capacity), so the two surfaces could disagree — e.g. a 0-effective-dot garden showed the checkbox (implying usability) in Blood Sorcery while correctly showing no Blood Fruit line in Vitae Projection. **This story's fix makes both surfaces read the exact same `effectiveDomainDots(_, 'Mandragora Garden')` call**, which is the substance of "uses the same calculation logic" — even though the epic's own FR6 wording ("the feeding roll") does not literally describe either of these two call sites (see next point).
4. **"The feeding roll" in FR6's wording does not literally exist as a distinct code path.** Grepped the whole `public/js` tree (including `public/js/suite/roll-v2.js`, the actual dice-roll calculator) for any Mandragora + feeding-roll interaction — there is none. Mandragora Garden has exactly two mechanical effects in this codebase: (a) +3 dice to Cruac rite casting (Blood Sorcery section; also mirrored server/admin-side in `public/js/admin/downtime-views.js` for the ST's own rite-pool display), and (b) flat per-effective-dot Blood Fruit production (Vitae Projection, decoupled from vitae cost since dtlt-10's 2026-08-18 ruling — see point 5). Neither of these is "the feeding roll" (the actual hunt/feed dice pool, `mainPool` in the Vitae Projection container, `downtime-form.js:~7346` in this branch) — Mandragora never contributes to that pool anywhere in the codebase. Treating this as the epic doc using loose language for "the Mandragora-relevant mechanic elsewhere in this same form" (i.e. the Blood Sorcery section), the same way dtui-23 found the epic doc's "checkboxes" premise for Blood Type had already drifted — flagged here rather than either forcing a literal "feeding roll" interpretation that doesn't map to any real code, or silently reinterpreting FR6 without saying so.
5. **FR6's own AC text ("Given the Mandragora Garden checkbox is checked...") is stale against dtlt-10's 2026-08-18 ruling.** Per the existing comment at `downtime-form.js` (Vitae Projection container, "Mandragora Garden maintenance cost REMOVED 2026-08-18 (dtlt-10, Angelus's ruling)"), Blood Fruit production was deliberately decoupled from which specific rite (if any) is parked via the checkbox — it is now a flat per-effective-dot benefit that applies regardless of checkbox state, confirmed by `tests/dt-vitae-projection.spec.js`'s own pre-existing "Mandragora Garden lists Blood Fruit produced with no vitae cost (dtlt-10, Reading C)" test, which asserts the Blood Fruit line renders for a character with the merit and **no submission responses at all** (no checkbox ticked anywhere). FR6's own "checkbox is checked" framing predates that ruling. Not fixed here (dtlt-10 already settled this deliberately, and re-coupling Blood Fruit to the checkbox would be a product regression, not a bug fix) — flagged as a stale epic-doc premise, same as dtui-23 flagged its own stale ACs.

### Files already read and confirmed correct, untouched by this story

- `public/js/data/constants.js:104` — `DOMAIN_MERIT_TYPES` already lists `'Mandragora Garden'` under `category: 'domain'`; `effectiveDomainDots()`'s `.find(merit => merit.category === 'domain' ...)` filter is correct against real character data shape.
- `public/js/editor/domain.js:363-403` (`meritEffectiveRating`) — the canonical effective-rating helper, already documented "Use this everywhere a calc references a merit's effective dots. Do NOT read m.rating directly." Not modified; reused exactly as-is.
- `tests/dt-vitae-projection.spec.js` — pre-existing coverage for the Vitae Projection container (Herd, Mandragora Blood Fruit, Oath of Fealty). Confirmed still green after this story's change (Mandragora test uses `rating: 2, cp: 2` — a real positive-dots fixture, unaffected by the Blood Sorcery-side gate this story touches, which lives in a different render function).

---

## Files in scope

- `public/js/tabs/downtime-form.js`:
  - `renderSorcerySection()` (`~4976-4987` in this branch) — `hasMandragora` computation changed from merit-name possession to `effectiveDomainDots(currentChar, 'Mandragora Garden') >= 1`; `mandragoraCap` (`~5017-5020`) simplified to reuse the same figure instead of recomputing it under a redundant `hasMandragora ?` guard.
  - The per-slot "Park in Mandragora Garden" checkbox render gate (`~5100`) — patched during code review (see AC6): now `(hasMandragora || mandSaved) && cruacRites.length`, so a slot already parked before the garden's effective dots dropped to zero stays visible and untick-able instead of orphaning that saved state.
  - Vitae Projection container's `mandDots` line (`~7286`, inside the `feeding_method` render case) — comment-only change, cross-referencing the Blood Sorcery section's now-identical calculation; the calculation itself (`effectiveDomainDots(c, 'Mandragora Garden')`) was already correct and is unchanged.
- No changes to `public/js/tabs/downtime-data.js`, `public/js/editor/domain.js`, `public/css/components.css`, or any server-side file — this story is a client-side gating-logic fix within one function plus a cross-reference comment; no new UI component, no schema change.
- New: `tests/dtui-22-mandragora-vitae-projection.spec.js`

---

## Out of scope

- **`domain.js`'s `meritEffectiveRating()` itself.** While tracing the Mandragora Garden cap logic for this story, found what looks like a separate, pre-existing inconsistency: an *unattached* Mandragora Garden (no Safe Place/Sepulcher anchor set) is documented in `sheet.js`'s own UI copy as "contributes 0 dots until linked" (`editor/sheet.js:1364`), but tracing `meritEffectiveRating()`'s actual arithmetic for `CAP_DOMAIN` merits (`domain.js:365-380`) shows the cap-zero case falls through `Math.min(effectiveStored, cap || stored)` — when `cap` is `0` (falsy), `cap || stored` evaluates to `stored`, so an unattached garden with, say, `cp: 2` returns effective rating `2`, not `0`, contradicting the UI's own warning text. **Not fixed here.** `meritEffectiveRating()` is a shared, heavily-depended-on helper (Haven uses the identical `CAP_DOMAIN` path; countless editor/sheet/domain features read through it) — a fix there is a cross-cutting correctness change well outside a Wave-4 downtime-form-section story's scope, and risks resurfacing in ways this story has no ability to fully regression-test. **Confirmed independently by the Codex review** (Pass 2, Medium) via its own direct Node trace — same result, same root cause. **Flagged for whoever next touches `domain.js`'s cap logic, and logged to `specs/deferred-work.md`** (upgraded from "flagged only" to "logged" after code review — see AC5's own correction note for the second, related gap found in the same function, which pushed both over the bar for a real, scoped deferred-work entry rather than just an in-story flag). This story's own primary test fixtures sidestep the ambiguity entirely by using `cp: 0` (no dots purchased at all) for the "0 effective dots" case, which zeroes out through every code path unambiguously, rather than the attach/unattach edge case.
- **`meritEffectiveRating()`'s omission of `m.bonus` for `CAP_DOMAIN`/generic-path merits.** A second, independently-confirmed gap in the same shared helper, found during code review (see AC5's correction note above). Not fixed here for the same reason as the unattached-anchor gap: shared, cross-cutting, needs its own investigation into whether `m.bonus` is even meant to count for these merit types (may be intentionally inert, matching the precedent `xp.js:266-269`'s own comment documents for standing merits). Logged to `specs/deferred-work.md` alongside the unattached-anchor gap.
- **The "+3 dice" Cruac rite bonus mechanic itself**, and the ST-side mirrored calculation in `public/js/admin/downtime-views.js` (`_mgMerit`/`mgDots` at lines ~6385-6386, ~7575-7576, ~7901-7902) — those already compute `(rating||dots||0) + (bonus||0)`, a different but equally "effective" formula, used for the ST's own rite-pool processing view. Not touched; this story's scope is the player-facing downtime form only (`downtime-form.js`), matching every other Wave 4 story's own file-scope discipline.
- **Re-coupling Blood Fruit production to the "Park in Mandragora Garden" checkbox.** dtlt-10 (2026-08-18, Angelus's ruling) deliberately decoupled these; FR6's stale "checkbox is checked" AC wording is flagged above, not acted on.
- **dtui-21 (Personal Story NPC chips)** and **dtui-23 (Feeding territory relocation)** — the epic's other Wave 4 stories in flight this session; this story's diff does not touch either's own scope (NPC correspondents, territory/blood-type/method ticker grouping).

---

## Acceptance Criteria

### AC1 — Checkbox visible when Mandragora Garden effective rating >= 1

**Given** a character has the Mandragora Garden merit with effective rating >= 1 (dots actually allocated) and at least one known/castable Cruac rite,
**When** the Blood Sorcery section renders,
**Then** the "Park in Mandragora Garden" checkbox is visible for that rite slot, and the "Mandragora Garden grants +3 dice to every Cruac rite cast this downtime" notice and the "Garden capacity: N / M" line are both shown.

### AC2 — Checkbox hidden when the character does not have the merit at all

**Given** a character has no Mandragora Garden merit entry,
**When** the Blood Sorcery section renders,
**Then** the checkbox, the "+3 dice" notice, and the "Garden capacity" line are all absent entirely (not present-and-disabled).

### AC3 — Checkbox hidden when the merit is present but effective rating is 0 (the regression this story fixes)

**Given** a character has a Mandragora Garden merit entry with 0 effective dots (no CP/XP/free dots allocated),
**When** the Blood Sorcery section renders,
**Then** the checkbox, the "+3 dice" notice, and the "Garden capacity" line are all absent — matching AC2's treatment, not AC1's, even though the merit technically exists on the character. **This is the one behavioural change this story makes**; before this story, this exact shape rendered the same as AC1.

### AC4 — Vitae Projection's Blood Fruit line uses the identical effective-dots figure as the Blood Sorcery gate

**Given** a character has Mandragora Garden with effective rating >= 1,
**When** the Vitae Projection panel renders (Feeding section),
**Then** the "Blood Fruit produced" note shows a count equal to the same `effectiveDomainDots(c, 'Mandragora Garden')` figure the Blood Sorcery section used to decide the checkbox was visible for that character — never a different, independently-derived number.

### AC5 — Effective rating discipline holds in both directions

**Given** effective rating discipline (CC1) applies to any Mandragora-related calculation,
**When** either the checkbox-visibility gate or the Vitae Projection contribution runs,
**Then** both read through `effectiveDomainDots()`/`meritEffectiveRating()` — the same canonical helper this codebase already treats as "use this everywhere a calc references a merit's effective dots" — never a bespoke inherent-only or possession-only check.

**Correction (Codex review, Pass 3a, Medium):** this AC originally read "...inherent + every bonus channel..." as a parenthetical describing what `meritEffectiveRating()` covers. That parenthetical does not hold: Codex traced (and this session independently confirmed via a direct Node import) that `meritEffectiveRating()`'s `CAP_DOMAIN` branch (Haven, Mandragora Garden) — and its generic non-domain-merit fallback — sum only `cp + xp + meritFreeSum(m)`; neither ever reads the scalar `m.bonus` field the editor sheet's own "Bonus" stepper writes for domain merits. A Mandragora Garden with `{ cp: 0, xp: 0, bonus: 1 }` returns effective rating `0` from `effectiveDomainDots()`, not `1`, even though the character sheet shows one usable bonus dot on that row. **Not patched** — this is a gap in the shared, canonical helper itself (`domain.js`), the same out-of-scope boundary already documented above for the unattached-anchor issue, not something this story's own diff introduces or can safely fix in isolation. AC5's literal wording is corrected here rather than left overclaiming what the helper actually does; **logged to `specs/deferred-work.md`** alongside the unattached-anchor gap (both are `meritEffectiveRating()`/`CAP_DOMAIN` issues, same root function, same owner). AC1's own "effective rating >= 1" is unaffected by this gap for every fixture this story's own tests use (none exercise a bonus-only Mandragora Garden), so AC1-AC4 still hold as written; only AC5's own descriptive claim about the helper's coverage was wrong.

### AC6 — A rite parked while the garden had capacity stays untick-able after the garden's effective dots later fall to zero

**Given** a rite slot already has `sorcery_N_mandragora: 'yes'` saved from a time when the character's Mandragora Garden had effective rating >= 1,
**When** the garden's effective rating later drops to 0 (e.g. an ST edit revokes dots, or a bonus channel is removed) and the Blood Sorcery section re-renders,
**Then** that slot's "Park in Mandragora Garden" checkbox remains visible, rendered checked and enabled (not disabled), with a tooltip explaining the garden no longer has capacity — so the player can still untick it to release the stale parking, rather than the checkbox simply disappearing and leaving that rite permanently, silently parked with no way to correct it through the form.

**Added during code review (Codex, Pass 2/3a, Medium — not in the original AC set)**: this AC captures a real regression the review found in this story's own AC1-AC3 fix. Gating the checkbox purely on the section-level `hasMandragora` flag (as AC2/AC3 literally specify) means a slot that was legitimately parked while the garden had capacity becomes unrepresentable — and, worse, mechanically STUCK as parked (`collectResponses()`'s preserve-prior branch keeps writing `'yes'` when no checkbox element exists in the DOM to read from) — the moment the garden's effective dots fall to zero for any reason. AC2/AC3's own literal wording ("the checkbox... [is] absent entirely") is still correct for a slot with NO prior saved `'yes'`; AC6 is the narrower, additional case of a slot that already has one. See the Senior Developer Review section below for the full finding and patch.

---

## Implementation Notes

**`renderSorcerySection()` change** (`downtime-form.js`, function start):

```javascript
function renderSorcerySection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'blood_sorcery');
  // dtui-22 (FR5): gate every Mandragora Garden affordance on EFFECTIVE dots,
  // not mere merit possession.
  const mandragoraDots = effectiveDomainDots(currentChar, 'Mandragora Garden');
  const hasMandragora = mandragoraDots >= 1;
  // ... unchanged below, except mandragoraCap now reuses mandragoraDots
  // directly instead of recomputing effectiveDomainDots() under a redundant
  // `hasMandragora ?` guard.
```

The "+3 dice" notice gate is unchanged in shape (still reads `hasMandragora`) — it correctly hides when the garden has no capacity. The **checkbox render gate** did need a second change, made during code review — see AC6 and the Senior Developer Review section below:

```javascript
// Patched during code review (Codex Pass 2/3a, Medium) — see AC6.
if ((hasMandragora || mandSaved) && cruacRites.length) {
  // ...
  const gardenGone = !hasMandragora && mandSaved;
  const mandDisabled = (mgLocked || !isCruac || overCap) ? ' disabled' : '';
  const mandTitle = mgLocked
    ? '...'
    : gardenGone
      ? 'Your Mandragora Garden no longer has capacity for this rite. Untick to release it.'
      : overCap ? '...' : '...';
```

**Vitae Projection container** — no logic change; `mandDots = effectiveDomainDots(c, 'Mandragora Garden')` was already correct. Added a cross-referencing comment only, so a future reader sees both call sites are deliberately identical rather than coincidentally similar.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `renderSorcerySection()`'s `hasMandragora`/`mandragoraCap` computation; the checkbox render gate (patched during review, see AC6); a cross-referencing comment on the Vitae Projection container's `mandDots` line
- New: `tests/dtui-22-mandragora-vitae-projection.spec.js`
- `specs/deferred-work.md` — modified (logged the two confirmed pre-existing `meritEffectiveRating()`/`CAP_DOMAIN` gaps found during code review)

---

## Definition of Done

- AC1-AC6 verified
- Checkbox/notice/capacity line all gate on effective rating >= 1, not mere merit possession, EXCEPT a slot with a pre-existing saved park (AC6), which stays visible and untick-able
- Vitae Projection's Blood Fruit line and the Blood Sorcery section's checkbox gate read through the identical `effectiveDomainDots()` call
- Pre-existing `tests/dt-vitae-projection.spec.js` (5/8 pass — 3 pre-existing, unrelated failures, see Dev Agent Record) and `tests/dt-form-37-sorcery-targets-stringify.spec.js` (5/5 pass) both re-verified after the review patch
- `specs/stories/sprint-status.yaml` updated: dtui-22 → done

---

## Compliance

- CC1 — Effective rating discipline: this story's entire substance IS a CC1 fix — replacing a possession-only gate with an effective-rating gate
- CC2 — Filter-to-context protocol: the checkbox/notice/capacity line are now genuinely hidden (not shown-and-broken) when the character's garden has no usable capacity
- CC4 — Token discipline: zero CSS changes, zero new markup shapes
- CC5 — British English, no em-dashes in any new comment or copy (no player-facing copy changed at all — this story is gating logic only)
- CC9 — Reuses the existing canonical `effectiveDomainDots()`/`meritEffectiveRating()` helpers exactly as documented ("use this everywhere"); does not introduce a parallel calculation

---

## Dependencies and Ordering

- **Depends on:** nothing blocking — Wave 1 is done, and this story's scope (Blood Sorcery section, Vitae Projection container) does not overlap dtui-20/21/23's own scopes
- **Blocks:** nothing directly

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Completion Notes

- Branched fresh off `origin/main` (`git fetch origin && git switch -c ms/dtui-22-mandragora-vitae-projection origin/main`), confirmed `origin/main` at the time of branching was `12543b35` (dtui-20's own merge commit) — dtui-23 is NOT present in this branch's history, as expected (it lives only on its own unmerged local branch).
- Investigated the epic's FR5/FR6 premise before writing any code (see Context section above, points 1-5) — found FR5 described a real gap (possession-only gate) but FR6's specific "Blood Fruit contribution" figure was already correct pre-story; the real FR6-relevant work was making the Blood Sorcery section's own gate agree with the figure the Vitae Projection container already computed correctly, rather than computing anything new.
- **The fix**: `renderSorcerySection()`'s `hasMandragora` now derives from `effectiveDomainDots(currentChar, 'Mandragora Garden') >= 1` instead of `(currentChar.merits || []).some(m => m.name === 'Mandragora Garden')`. `mandragoraCap` simplified to reuse the same `mandragoraDots` value directly (previously recomputed `effectiveDomainDots()` a second time, redundantly, under an `hasMandragora ?` guard that is now definitionally always true when reached).
- **Investigated but deliberately did not touch**: a separate, pre-existing inconsistency in `domain.js`'s `meritEffectiveRating()` where an unattached (no anchor) Mandragora Garden's cap-zero case doesn't actually zero the returned effective rating, due to a `cap || stored` fallback masking `cap === 0`. This contradicts the editor sheet's own "contributes 0 dots until linked" UI copy, but fixing it means touching a helper shared by Haven and used throughout the editor/sheet/domain surface — well outside a Wave-4 form-section story's scope. Flagged in "Out of scope" above for whoever next works in `domain.js`, not logged to `deferred-work.md` (not yet confirmed/scoped enough to be actionable there without further investigation of Haven's own behaviour under the same path). This story's own test fixtures avoid the ambiguity by using `cp: 0` (no dots purchased) for the "0 effective dots" case, which zeroes unambiguously through every path.
- Confirmed via direct grep across `public/js` (including `public/js/suite/roll-v2.js`, the actual dice-roll calculator) that no code path titled or shaped like "the feeding roll" has any Mandragora interaction anywhere in the codebase — Mandragora's only two mechanical effects are the Cruac +3-dice bonus and Blood Fruit production, neither literally "the feeding roll" (the hunt/feed dice pool). Treated the epic's wording as loose/stale, matching dtui-23's own precedent for a stale epic premise, rather than either forcing a literal (and non-existent) interpretation or silently reinterpreting without flagging it.

**Testing (pre-review)**: `tests/dtui-22-mandragora-vitae-projection.spec.js` (5 Playwright tests: AC2/AC1/AC3 for the Blood Sorcery checkbox gate, plus two FR6-consistency tests cross-checking the Blood Sorcery gate against the Vitae Projection Blood Fruit line for both the positive-dots and zero-dots cases). All 5 passed in isolation (single worker, port 8080 free at run time — no squatter present this session).

**Correction (Codex review, Pass 3b, Medium):** this note originally claimed the two pre-existing adjacent suites (`tests/dt-vitae-projection.spec.js`, `tests/dt-form-37-sorcery-targets-stringify.spec.js`) were "both green." That is false, and was never actually verified before being written — an overclaim of exactly the shape this session's own `feedback_effective_rating_discipline`/review conventions exist to catch. The real, run numbers: `dt-form-37-sorcery-targets-stringify.spec.js` is genuinely 5/5. `dt-vitae-projection.spec.js` is **5 passed / 3 failed (8 tests total, not 13)** — the 3 failures are `tests\dt-vitae-projection.spec.js:146/157/173`, all asserting a legacy `.dt-feed-rote-section`/`button[data-feed-rote]` UI pattern that `downtime-form.js`'s own "dt-form.22: ROTE block removed from the feeding section" comment confirms no longer exists in this codebase. Confirmed pre-existing via `git stash` A/B against this story's own diff (both before and independently again by the Codex review itself, which ran its own separate A/B and got the identical 3 named failures against base) — not caused by this story's `hasMandragora`/`mandragoraCap` change, which the Blood Sorcery section's own render function never touches the Rote UI at all. The false "both green" claim is corrected here rather than left standing.

### Senior Developer Review (AI)

External review via `codex-review` (Codex CLI, `model_reasoning_effort=high`, 3-pass Blind Hunter →
Edge Case Hunter → Acceptance Auditor, single session). Findings persisted at
`specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-codex-findings.md`. Every finding
below was independently re-verified against the real code in this session before being triaged — none
were accepted on Codex's word alone. Codex's own validation notes show real command execution
(direct Node traces of `meritEffectiveRating()` for multiple fixture shapes, a live Playwright run
against a locally-started static server after the configured `npx http-server` failed on a blocked
npm-registry fetch, and its own `git stash`-equivalent base A/B via `apply_patch` restore/re-apply) —
a genuine adversarial pass, not a static read.

**High:** none found.

**Medium (5 total):**

1. **The zero-dot Vitae Projection test could pass even if the whole budget panel failed to render**
   (Pass 1) — **confirmed real**. The test's only Vitae Projection assertion was
   `fruitRow.toHaveCount(0)` on a locator chained under `.dt-vitae-budget`, with no positive assertion
   that `.dt-vitae-budget` itself rendered. **Triage: patched.** Added `await
   expect(budget).toBeVisible()` before the absence check.
2. **An unattached Mandragora Garden still passes the new effective-dots gate** (Pass 2) —
   **confirmed real**, and **confirmed pre-existing** in `domain.js`'s `meritEffectiveRating()`
   (traced independently by Codex via direct Node import, matching this story's own already-documented
   "Out of scope" finding on the identical `cap || stored` masking bug). **Triage: not patched** — the
   story's own Pass 3a disposition (Codex's own words) confirms "the spec explicitly makes its fix out
   of scope"; this is confirmation of an already-flagged, already-out-of-scope shared-helper gap, not a
   new one. Upgraded from "flagged in-story only" to **logged in `specs/deferred-work.md`** given a
   second related gap (finding 4 below) was found in the same function during this same review.
3. **A rite parked while the garden had capacity becomes unrepresentable and stays mechanically
   active after effective dots fall to zero** (Pass 2/3a) — **confirmed real, and a genuine new
   regression this story's own AC1-AC3 fix introduces** (not pre-existing: before this story,
   `hasMandragora` was possession-based and stayed true regardless of dots, so an already-parked
   checkbox for a since-zeroed garden remained visible and untick-able; the AC1-AC3 fix's
   effective-dots gate hides it instead, orphaning the saved `'yes'`).
   **Triage: patched.** Added AC6 (see Acceptance Criteria above) and changed the checkbox render
   gate from `hasMandragora && cruacRites.length` to `(hasMandragora || mandSaved) &&
   cruacRites.length`, with a `gardenGone` branch keeping the slot enabled (not disabled) and an
   explanatory tooltip. **Prove-discriminated**: reverted the `mandSaved` clause alone (single-line
   `sed`), re-ran the new regression test — failed on the exact expected assertion (`toHaveCount(1)`
   expected `1`, received `0`); restored the clause, re-ran — passed, then re-ran the full 6-test spec
   file together — 6/6 green.
4. **`meritEffectiveRating()` never reads `m.bonus` for `CAP_DOMAIN`/generic-path merits, despite the
   editor sheet exposing a working Bonus stepper on domain merit rows** (Pass 3a) — **confirmed real**
   via this session's own direct Node trace (attached Mandragora Garden with `{ cp: 0, xp: 0, bonus:
   1 }` → `effectiveDomainDots()` returns `0`, not `1`). This makes AC5's original "inherent + every
   bonus channel" parenthetical false as written. **Triage: not patched** (same shared-helper,
   out-of-scope reasoning as finding 2) — **AC5's wording corrected** to describe what the helper
   actually does rather than overclaim, and **logged to `specs/deferred-work.md`** alongside finding 2.
5. **The Dev Agent Record falsely reported both adjacent suites green** (Pass 3b) — **confirmed real**
   by re-running both suites directly: `dt-vitae-projection.spec.js` is 5/8 (3 pre-existing failures,
   A/B confirmed by both this session and Codex independently), `dt-form-37-...` is genuinely 5/5.
   **Triage: patched** — corrected in the Completion Notes above (the "Correction (Codex review, Pass
   3b, Medium)" paragraph) rather than left standing.

**Low (2 total):**

- The "identical calculation" comment on the Blood Sorcery `hasMandragora` line claims the Blood
  Sorcery and Vitae Projection call sites are identical, which Pass 1 (blind, diff-only) correctly
  flagged as unverifiable from the diff alone (different variable names, `currentChar` vs `c`).
  **Triage: acknowledged, not patched** — Pass 2 (repo-aware) resolved the uncertainty by confirming
  `const c = currentChar` inside the very function the second call site lives in, so the two
  references genuinely resolve to the same object. The comment's claim holds; no wording change
  needed, but the finding is recorded here per the review's own "record it even though a later pass
  resolved it" convention.
- **Reachable duplicate Mandragora Garden rows make the gate depend on array order** (Pass 2) — real,
  but low production likelihood (Codex's own confidence: "Medium for production frequency because
  Mandragora Garden is documented as a singleton merit"). `effectiveDomainDots()` uses `.find()`
  (first match only) while the pre-story gate used `.some()` (any match); a malformed two-row
  character (reachable via the editor's `shAddDomMerit()`, which doesn't dedupe Mandragora Garden the
  way it does Herd) could see the new gate hide the checkbox when the old one wouldn't have, depending
  on which row is first. **Triage: acknowledged, not patched** — the underlying "should Mandragora
  Garden dedupe on add, the way Herd does" question is an editor-side data-integrity concern, not a
  downtime-form gating concern; out of this story's scope, and no evidence any real character in this
  campaign currently has a duplicate row (not investigated further — flagging is proportionate to the
  documented "Medium" real-world likelihood, a dedicated data-integrity fix is not).

**Verified-clean per the Acceptance Auditor pass:** AC1-AC4 hold literally for the story's named
fixtures; AC5's original wording was the one real inaccuracy (finding 4), now corrected; the diff
respects every "Out of scope" boundary named in this story (does not touch `domain.js`, the ST-side
admin calculation, or dtui-21/dtui-23's own scope).

**Regression after patches** (re-run in this session, not just claimed): the new spec file 6/6 green
(5 original + AC6's new regression test); `dt-form-37-sorcery-targets-stringify.spec.js` 5/5;
`dt-vitae-projection.spec.js` 5/8 (3 pre-existing failures, unchanged before/after the review patch).

**Outcome:** Approved with patches applied. No unresolved High or Medium defect remains — Medium
findings 1, 3, and 5 patched (test strengthened, checkbox-orphan regression fixed and
prove-discriminated, false record claim corrected); findings 2 and 4 resolved via deliberate triage
(confirmed pre-existing, out-of-scope shared-helper gaps, both logged to `deferred-work.md` rather
than fixed in isolation here). Both Low findings acknowledged, no patch needed.

### File List

- `public/js/tabs/downtime-form.js` — modified (`renderSorcerySection()`'s `hasMandragora`/
  `mandragoraCap`; a cross-referencing comment on the Vitae Projection container's `mandDots` line;
  post-review: the checkbox render gate now also shows an already-parked slot when the garden's
  effective dots have since fallen to zero, per AC6)
- `tests/dtui-22-mandragora-vitae-projection.spec.js` — new (6 Playwright tests, AC1-AC6;
  post-review: strengthened the zero-dot Vitae Projection test with a positive `.dt-vitae-budget`
  visibility assertion, added the AC6 orphaned-parked-rite regression test)
- `specs/deferred-work.md` — modified (logged the two confirmed pre-existing `meritEffectiveRating()`/
  `CAP_DOMAIN` gaps: the unattached-anchor cap-zero masking, and the `m.bonus` omission)
