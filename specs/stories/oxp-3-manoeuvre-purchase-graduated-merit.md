# Story oxp.3: Manoeuvre purchase — graduated merit, rank order

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST,
I want to set how many of an office's five ranked manoeuvres are currently purchased, and have the
Office tab show unpurchased ones as visually muted for the officeholder,
so that the tab stops implying all five manoeuvres are already available, matching how the office's
merit suite already shows real purchase state instead of a flat "granted" list.

## Why this story exists

Angelus flagged this directly against the live Office tab (Ruler office screenshot, 2026-08-13):
all 5 manoeuvres render as a flat list with zero purchase state, so anyone reading the tab would
reasonably assume every manoeuvre is already available to use. This is the same gap PR #1147
(`office-merit-dots`, 2026-08-12) already closed for the office's MERIT suite (Safe Place, Haven,
Staff, Resources etc.) — that shipped a minimal ST-set dot tracker (`office_merit_dots` collection,
`server/routes/office-merit-dots.js`) deliberately ahead of Epic OXP's full accrual/spend economy
(oxp.1/oxp.2, still backlog). This story extends that same "direct ST-set purchase state, no XP
bookkeeping" treatment to manoeuvres — it is `oxp-3-manoeuvre-purchase-graduated-merit` in
`specs/stories/sprint-status.yaml`, but scoped to the minimal version, not the full XP-gated
version the epic file originally envisioned.

**Epic file** (`specs/epic-oxp-office-xp-economy.md`) exists only on the `dev` branch currently —
never merged to `main`. Read via `git show dev:specs/epic-oxp-office-xp-economy.md` if the working
tree doesn't have it. oxp.3's epic slot reads: "Bought one dot at a time in fixed rank order
(`office-powers.md` §'Where the ranks come from' has the resolved rank tables for all four ranked
offices). Resets to zero + spent XP lost on handover."

## What this story is NOT

- NOT Epic OXP's full accrual/spend economy. No derived office-XP calculation (oxp.2), no XP cost
  to advance a rank, no spend-approval routing through Epic OAQ (oxp.9 — there is no XP spend here
  to approve, exactly the same reasoning that let the merit-dots stopgap skip OAQ). The ST simply
  sets the rank directly, the same way the ST sets merit dots directly today.
- NOT handover reset logic (oxp.5). The epic's ultimate design resets manoeuvre rank to zero and
  destroys spent XP on a change of officeholder — there is no XP to destroy yet in this minimal
  version, and no handover-detection trigger exists in the codebase to hook. Out of scope here;
  revisit when oxp.1/oxp.2/oxp.5 land for real.
- NOT waiting on oxp.1 (office/seat data-lock) or oxp.2 (derived XP calc). Same precedent as the
  merit-dots stopgap: this is direct ST-set state keyed by office `court_category`, not a seat-keyed
  accrual pool, so the "two concurrent Socialite seats" data-lock question oxp.1 exists to resolve
  does not apply here — `office_merit_dots` already proved this at the category level with no seat
  ambiguity problem.
- NOT a new rank-order authoring pass. `OFFICE_DATA[category].manoeuvres` array order in
  `public/js/tabs/office-data.js` already matches `content/rules/office-powers.md` §"Where the ranks
  come from" exactly for all four built offices (Head of State/Ruler, Primogen, Socialite, Enforcer)
  — verified directly against the epic-doc's own rank table during story creation. Array index + 1
  IS the rank; nothing new needs authoring.
- NOT a change to the Merit Suite section, Status Actions section, or the otc.3 reference-view
  banner. Those are unmodified by this story except where Task 2 shares one combined data fetch
  with the existing merit-dots fetch for efficiency (confirm during implementation whether that
  sharing is worth the coupling, or two independent fetches is simpler and safer — see Dev Notes).

## Acceptance Criteria

1. **Own-office view** (`isOwnOffice === true`, i.e. the character currently browsing their own
   held office): all 5 manoeuvres are still always listed in the existing fixed rank order, but any
   manoeuvre whose rank (array position + 1) exceeds the office's current `manoeuvre_rank` renders
   with a visually muted treatment distinguishing it from a purchased one. 0 manoeuvres purchased
   (no document / rank 0) mutes all five; rank 5 mutes none.
2. **Reference view** (`isOwnOffice === false`, otc.3's browse-any-office mode): the MANOEUVRE LIST
   is unchanged from today — plain, unmuted, a pure summary of the office's content. No purchase
   state is revealed or implied by the list, regardless of the office's actual stored rank. This is
   the exact split Angelus specified: "different from whoever is just looking at the office powers,
   who just sees a summary of the abilities, not which ones are active."

   This criterion governs the manoeuvre list specifically. The separate rank READOUT widget is
   AC6's, and AC6 deliberately exempts ST/dev viewers from this restriction so an ST can set an
   office's purchase state up while browsing it as reference, before anyone holds the seat. That is
   the same exemption the Merit Suite section already ships with. A non-ST reference viewer gets no
   readout at all, so for them the list is the whole of what AC2 describes and nothing leaks.
3. A new persistence layer stores one graduated integer 0–5 per office category (0 = nothing
   purchased, 5 = all five manoeuvres purchased), keyed the same way `office_merit_dots` is keyed
   (by `category`, i.e. `OFFICE_DATA` key / `char.court_category` value). A category with no rank
   ever set defaults to 0, exactly like an unset merit defaults to 0 dots today.
4. Reading the current rank is open to any authenticated user (reference info, not a secret — same
   posture as `GET /api/office_merit_dots`), independent of whether the request is for the reader's
   own office.
5. Setting the rank is ST-only, gated with `requireRole('st')` — the same middleware
   `server/routes/office-merit-dots.js` already uses (dev role is ST-equivalent throughout this
   codebase; `requireRole('st')` already covers that equivalence, confirm by reading the middleware
   rather than assuming). Validates: the category is a real `OFFICE_DATA` key with a `manoeuvres`
   array (do not hardcode "5" as the cap — read `data.manoeuvres.length` for the given category, so
   this does not silently misvalidate if a future office ever has a different count), and the
   submitted rank is an integer between 0 and that count inclusive.
6. The Office tab shows a graduated rank readout (e.g. dot-style, mirroring the merit suite's own
   `●●○○○`-style rendering for visual consistency) plus ST/dev-only +/- stepper controls to advance
   or retreat the rank one step at a time — one control set per office, not per-manoeuvre, since
   this is a single graduated value, not five independent purchases. Shown regardless of
   `isOwnOffice`, matching the Merit Suite section's own existing precedent (its stepper is not
   gated on `isOwnOffice` either, so an ST can set up an office's purchase state while browsing it
   as reference, before anyone even holds it). Non-ST/dev viewers never see the stepper controls,
   only the rank's effect on the manoeuvre list (own-office view) or nothing extra at all
   (reference view, per AC2).
7. Adjusting the rank never trusts stale in-memory/DOM state, and two STs adjusting concurrently
   converge rather than clobber. The stepper therefore sends the SIGNED STEP to the server, which
   applies it (and the 0-to-count clamp) to the stored value atomically in a single MongoDB
   operation. It must not read the rank and write back a locally computed absolute value: however
   fresh that read is, it is still a read-then-write, and two overlapping adjustments that both read
   the same starting rank both write the same next one, silently losing a step.
8. No regression to the existing Merit Suite section, Status Actions section, category picker, or
   otc.3 reference-view banner — this story only adds new persistence/route and touches the
   Manoeuvres section's rendering in `office-tab.js`.

## Tasks / Subtasks

- [x] Task 1 — Server: persistence + route (AC: 3, 4, 5)
  - [x] Add a new collection `office_manoeuvre_ranks`, one document per office category
        (`_id: category`, `{ rank: <int>, updated_at: <ISO string> }`) — a sibling to
        `office_merit_dots`, not a reshape of it. Keeping it a separate collection/route avoids any
        risk of changing `office_merit_dots`' existing response shape, which `office-tab.js`'s
        already-shipped `_wireMeritDots`/`_adjustMeritDots` depend on today (reshaping that response
        to nest `dots` under a wrapper to make room for a rank field was considered and rejected
        during story-writing — see Dev Notes for the reasoning, revisit only if a combined-fetch
        refactor is deliberately chosen in Task 2).
  - [x] New file `server/routes/office-manoeuvre-rank.js`, structured as a close mirror of
        `server/routes/office-merit-dots.js`:
        - `GET /` — open (any authenticated user), returns `{ [category]: rank }` for every category
          that has a document; a category with no document is simply absent (client treats missing
          as 0, same convention as merit dots).
        - `PUT /:category` — `requireRole('st')`, body `{ rank }`. Validates `OFFICE_DATA[category]`
          exists and has a `manoeuvres` array; validates `rank` is an integer between 0 and
          `OFFICE_DATA[category].manoeuvres.length` inclusive. `findOneAndUpdate` with `upsert: true`,
          `$set: { rank: n, updated_at: new Date().toISOString() }`.
  - [x] Mount in `server/index.js`, following the exact pattern at line 187
        (`app.use('/api/office_merit_dots', requireAuth, noCache(), officeMeritDotsRouter);`) —
        `app.use('/api/office_manoeuvre_rank', requireAuth, noCache(), officeManoeuvreRankRouter);`,
        placed next to the existing office-merit-dots mount line.
- [x] Task 2 — Client: fetch + render + stepper (AC: 1, 2, 6, 7, 8)
  - [x] In `office-tab.js`, fetch `GET /api/office_manoeuvre_rank` (new call, alongside the existing
        `GET /api/office_merit_dots` fetch in `_wireMeritDots` — decide during implementation
        whether a single combined helper fetching both is worth the coupling, or two independent
        `_wireX` functions each doing their own fetch is simpler; either is acceptable, but do not
        let the two collections' data get merged into one client-side object — keep them
        conceptually distinct the way the server does).
  - [x] New function `_wireManoeuvreRank(el, category, manoeuvreCount)`, modelled directly on
        `_wireMeritDots` (lines ~118-166 of `office-tab.js`): fetches the current rank, renders a
        dot-style readout (`'●'.repeat(rank) + '○'.repeat(manoeuvreCount - rank)`) plus, for
        ST/dev (`getRole() === 'st' || getRole() === 'dev'`), `.cs-step-btn` up/down controls
        (reuse `.cs-edit-stepper`/`.cs-step-btn` exactly as the merit stepper does — do not invent
        new stepper CSS). Disable the up button at `rank >= manoeuvreCount`, the down button at
        `rank <= 0`, matching the merit stepper's own disabled-state pattern.
  - [x] New function `_adjustManoeuvreRank(el, category, manoeuvreCount, delta)`, modelled on
        `_adjustMeritDots` (lines ~168-184): re-fetches fresh before computing `next`, clamps to
        `[0, manoeuvreCount]`, no-ops if unchanged, `PUT`s via `apiPut`, then re-renders.
  - [x] Modify the existing manoeuvre-list render loop (currently lines ~76-86: `for (const m of
        data.manoeuvres) { ... }`) to track index (`data.manoeuvres.entries()` or an index-tracking
        loop) and, **only when `isOwnOffice` is true**, apply a muted class to any manoeuvre whose
        `index + 1 > rank`. When `isOwnOffice` is false, render exactly as today — no class, no rank
        awareness in the markup at all (AC2 must hold structurally, not just visually — a reference
        view's HTML should not leak which manoeuvres are purchased even to someone reading the DOM).
  - [x] Add the rank readout + stepper mount unconditionally in the Manoeuvres section (both
        own-office and reference view render it — matching the Merit Suite section's own existing
        `isOwnOffice`-independent behaviour, see Dev Notes), but the readout's rank value naturally
        answers "how many are purchased" without needing the muted-manoeuvre-card treatment, so this
        does not contradict AC2's "reference viewers see a summary, not which are active" — the
        summary list itself stays uninformative in reference mode even though the rank number is
        visible in the readout above it. (If this reads as a genuine contradiction once actually
        built and viewed, flag it — Angelus's call on whether the readout itself should also be
        own-office-only; the ST-editing-ahead-of-handover use case from AC6 is the reason it was
        scoped visible-always here, mirroring the merit stepper precedent.)
  - [x] New CSS: a muted-manoeuvre class in `public/css/suite.css`, near the existing
        `.office-manoeuvre*` rules (~line 2297-2300). Reuse the existing muted idiom already
        established for a comparable "zero/not-yet-active" state in this codebase —
        `.skill-zero { opacity: .4 }` — rather than inventing new opacity/colour values; check
        `components.css`'s `.pointed.hollow` too (the epic's own oxp.6 planning note suggested it)
        but that is a dot-glyph pattern, not a block-mute pattern, so confirm which actually fits a
        `<div class="office-manoeuvre">` block before choosing. Per `specs/project-context.md`, no
        inline styles, no new hex/rgba values — tokens or an existing class only.
  - [x] New `.office-manoeuvre-rank` mount markup + wiring alongside the existing
        `.office-manoeuvre-list`, in the Manoeuvres section (`office-tab.js` ~line 77-86).
- [x] Task 3 — Tests (AC: all)
  - [x] New `server/tests/oxp-3-office-manoeuvre-rank.test.js`, modelled directly on
        `server/tests/office-merit-dots.test.js`'s structure (DB-backed describe blocks gated on
        `isDbAvailable()`, plus a client-wiring source-text contract describe block at the bottom).
        Cover at minimum: GET returns `{}` with nothing set; GET reflects a prior PUT; GET is
        player-readable; PUT sets a rank and persists; PUT rejects a non-ST (403); PUT rejects an
        unknown category (400); PUT rejects a rank above the office's manoeuvre count (400); PUT
        rejects a negative or non-integer rank (400); PUT allows setting back down to 0.
  - [x] Extend `server/tests/issue-1141-office-tab-render.test.js` (or add a sibling render test
        file if that one is getting unwieldy — check its current size first) with: own-office view
        mutes manoeuvres above the current rank and does not mute ones at/below it; reference view
        never mutes regardless of the stored rank (the AC2 structural boundary — assert the muted
        class/attribute is absent from the reference-view HTML entirely, not just visually
        suppressed); the stepper is present for ST/dev and absent for a player, matching the merit
        stepper's own already-tested gating pattern.
  - [x] Confirm regression on the full changed-area suite before considering this story complete —
        do not run the full untargeted suite for this change (`specs/project-context.md`'s own
        "targeted tests only" rule).

## Dev Notes

### Current state of the files this story touches

**`public/js/tabs/office-data.js`**: `OFFICE_DATA[category].manoeuvres` is an array of
`{ name, effect }` objects, already in rank order matching `content/rules/office-powers.md`'s
resolved rank table exactly for all four built offices (verified during story creation: Ruler's
array is Due Diligence → Call in a Favour → Sovereignty Inviolate → Willing Coalition → Executive
Order, ranks 1–5 in that exact order per the epic doc's own table). `MERIT_DOT_CAPS` is exported
from here too — no equivalent per-manoeuvre cap map is needed since the cap is simply
`manoeuvres.length`, read dynamically, not authored per-office.

**`public/js/tabs/office-tab.js`**: the Manoeuvres section (lines ~76-86) is currently a flat
render loop with zero purchase-state awareness — `for (const m of data.manoeuvres) { ...name...
...effect... }`. The Merit Suite section immediately below it (lines ~88-184) is the direct pattern
to mirror: `_wireMeritDots` fetches `GET /api/office_merit_dots` (a full table, not scoped to one
category — the client filters to `dotsByCategory[category]` itself), renders per-merit dot displays
plus ST/dev-gated `.cs-step-btn` controls, and `_adjustMeritDots` re-fetches fresh before writing.
Note the Merit Suite section is rendered with **no `isOwnOffice` gate at all** — it is visible and
ST-editable regardless of which office the viewer is currently browsing. This story's rank
readout+stepper (AC6) deliberately follows that same precedent rather than introducing a new
`isOwnOffice`-gated pattern inconsistent with its sibling section.

**`server/routes/office-merit-dots.js`**: the exact structural precedent for Task 1's new route —
read it in full before writing the new one, not just this story's paraphrase of it. Note its GET
handler shape: `for (const doc of docs) out[doc._id] = doc.dots || {}` — the response value IS the
document's `dots` sub-object directly, no further wrapper. This is why Task 1 uses a **separate**
collection/route for manoeuvre rank rather than adding a `manoeuvre_rank` field onto the existing
`office_merit_dots` document: doing so would require either (a) reshaping `GET
/api/office_merit_dots`'s response to nest the existing flat `{merit: n}` shape under a `dots` key
to make room for a sibling `manoeuvre_rank` key — a breaking change to an already-shipped, already
client-consumed response contract — or (b) polluting the flat merit-keyed object with a
differently-shaped stray key, which is fragile (relies on no merit ever being named `manoeuvre_rank`)
and confusing to read. A sibling collection with its own route has neither problem and is a close,
low-risk copy of an already-reviewed pattern.

**`server/index.js`** line 187: `app.use('/api/office_merit_dots', requireAuth, noCache(),
officeMeritDotsRouter);` — the exact line to copy the pattern from for the new mount. Import added
at line 30 (`import officeMeritDotsRouter from './routes/office-merit-dots.js';`) — same relative
import shape for the new router.

**`public/css/suite.css`**: `.office-manoeuvre-list`/`.office-manoeuvre`/`.office-manoeuvre-name`/
`.office-manoeuvre-effect` at lines ~2297-2300; `.office-merit-list`/`.office-merit-row`/
`.office-merit-dots`/`.office-merit-stepper` at lines ~2302-2310 (the stepper reuses `.cs-edit-stepper`/
`.cs-step-btn`, defined once at lines ~1064-1089, not redefined per-section). The only existing
muted/dim idiom found in this stylesheet during story creation is `.skill-zero { font-size:11px;
color:var(--txt3); opacity:.4; }` (a skill-at-zero-dots treatment) — closest existing precedent for
"this thing exists but isn't active yet," though it was authored for a different element shape
(a skill row, not a card/block), so confirm the visual read is right on an `.office-manoeuvre`
block before committing to reusing it verbatim vs. adapting just the `opacity: .4` value with a new
class name.

### Testing standards summary

- vitest, `cd server && npx vitest run tests/<name>.test.js`. Run only the files Task 3 names —
  per `specs/project-context.md`, targeted tests only, never the full suite for a change this size.
- DB-backed tests need a local `mongod`; without one they `describe.skipIf(!dbAvailable)` rather
  than fail (project-wide convention, see CLAUDE.md's testing section) — a skipped suite is not a
  passing suite, read the summary line.
- `office-tab.js` needs the `globalThis.location` stub technique already established in
  `issue-1141-office-tab-render.test.js` (its header comment explains why — the module imports
  `api.js`, which reads `location.hostname` at module scope).
- `office-merit-dots.test.js`'s client-wiring describe block (source-text contract assertions, no
  browser harness in this repo) is the direct template for Task 3's own client-wiring tests.

### Project Structure Notes

- New files: `server/routes/office-manoeuvre-rank.js`, `server/tests/oxp-3-office-manoeuvre-rank.test.js`.
- Modified files: `server/index.js` (new route mount), `public/js/tabs/office-tab.js` (manoeuvre
  render loop + new rank readout/stepper wiring), `public/css/suite.css` (new muted-manoeuvre class,
  new rank-readout/stepper CSS reusing `.cs-edit-stepper`/`.cs-step-btn`),
  `server/tests/issue-1141-office-tab-render.test.js` (extended) or a new sibling render-test file.
- No new MongoDB collection naming conflicts: `office_manoeuvre_ranks` does not collide with
  `office_merit_dots`, `office_action`, or any existing collection (confirm via
  `specs/reference-data-ssot.md` during implementation if in doubt).
- British English, no em-dashes, in any new player/ST-facing copy (there is minimal new copy here —
  mostly a dot readout and stepper buttons, no new prose strings expected).

### References

- [Source: public/js/tabs/office-data.js] — `OFFICE_DATA`, `MERIT_DOT_CAPS`, the manoeuvre array
  order already matching the epic's rank table.
- [Source: public/js/tabs/office-tab.js#L76-184] — the Manoeuvres section to modify, and the Merit
  Suite section (`_wireMeritDots`/`_adjustMeritDots`) that is this story's direct structural
  template.
- [Source: server/routes/office-merit-dots.js] — the direct precedent for Task 1's new route,
  including its GET response shape (the reason for a separate collection, not a reshape).
- [Source: server/tests/office-merit-dots.test.js] — the direct precedent for Task 3's new test
  file, including the DB-availability-gated describe pattern and the client-wiring contract tests.
- [Source: server/index.js#L30, #L187] — route import and mount pattern to copy.
- [Source: content/rules/office-powers.md#Where-the-ranks-come-from] (umbrella root,
  `D:\Terra Mortis\content\rules\office-powers.md`) — authoritative rank-order table for all four
  built offices; already reflected correctly in `office-data.js`, cited here for verification only,
  not because anything needs re-deriving from it.
- [Source: specs/epic-oxp-office-xp-economy.md] (dev branch only — `git show
  dev:specs/epic-oxp-office-xp-economy.md`) — parent epic; this story deliberately narrows its
  oxp.3 slot to the minimal ST-set version, explicitly not waiting on oxp.1/oxp.2/oxp.9.
  Cross-reference: `git show dev:specs/epic-oaq-office-approval-queue.md` if checking why OAQ
  routing (oxp.9) does not apply — there is no XP spend event in this story's scope to route
  through it.
- [Source: specs/project-context.md] — CSS reuse discipline (tokens/existing classes only, no
  inline styles, no new hex/rgba), targeted-tests-only testing discipline.
- [Source: 2026-08-13 chat, Angelus's screenshot + three numbered requirements] — the direct source
  of this story's three ACs (muted display, graduated rank tracker, ST lock), and the explicit
  reference-view-vs-own-office-view distinction quoted in AC2.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), via the `bmad-dev-story` workflow.

### Debug Log References

- **Baseline first.** Ran `office-merit-dots.test.js` + `issue-1141-office-tab-render.test.js` before
  writing a line: 28/28 green, with the DB-backed describe blocks genuinely executing (not skipping),
  so the later "all green" figures are trustworthy rather than a silent skip.
- **Red→green, twice.** Task 1's route test file failed 24/24 for the right reason first
  (`expected 404 to be 200` — route genuinely absent, not a harness error), then 18/24 after the
  route landed, with the remaining 6 being the still-unwritten client contracts. Task 2's render
  tests failed 10/10 before the client work, then all green.
- **Two of my own test-harness bugs, caught by the red phase, fixed in the tests not the source:**
  (a) `blockClasses`'s first regex (`office-manoeuvre[^"]*`) also swallowed the inner
  `.office-manoeuvre-name`/`-effect` divs, reporting 15 blocks instead of 5; (b) the
  `_adjustManoeuvreRank` source-contract test sliced the function body on `'\n}\n'`, which is
  line-ending sensitive and silently produced an empty body under this repo's CRLF working copy.
  Both now cut on structure that does not depend on line endings.
- **Prove-discrimination (mutation testing) on the two boundaries that actually matter**, per the
  bar otc.3's own review set:
  - Removed `isOwnOffice &&` from the muted-class condition → **exactly one** test failed, the AC2
    structural-boundary test, and no other. Restored, green.
  - Replaced the stepper's `if (isST)` with `if (true)` → **exactly one** test failed, the AC6
    stepper-gating test, and no other. Restored, green.
  Without this, both tests would have been passing only because the functions did not exist during
  the red phase, which proves nothing about the gates themselves.
- **A pre-existing, uncommitted local edit to `server/db.js` (`tls: true` → `tls: false`) appeared
  mid-session and is NOT part of this story.** It broke local Mongo connectivity with
  `MongoParseError: All values of tls/ssl must be the same`, which made `otc-2-office-actions-api.test.js`
  fail at file level (it uses `setupDb()`'s throw-on-failure contract, not `isDbAvailable()`'s clean
  skip) and silently downgraded every other DB-backed suite in the run to *skipped*. Diagnosed by
  stashing only that one file, re-running, and confirming the run went from
  "1 file failed / 64 skipped" to a clean 171/171. The user's edit was then restored and verified
  byte-identical against a saved patch (`git diff` output diffed against the pre-stash capture).
  **`server/db.js` is untouched by this story** — flagged here because it will keep making unrelated
  suites look broken until it is reverted or the URI is adjusted to match.

### Completion Notes List

- All 8 ACs implemented and verified by test, not by code reading. Final regression: **171/171 across
  10 files, zero skipped.**
- **AC2 is enforced structurally, not visually.** `manoeuvreListHtml` takes `isOwnOffice` and simply
  never emits the muted class when it is false, so a reference viewer's DOM carries no purchase
  state to read. The test asserts absence of the class across every rank 0-5, and the mutation above
  proves the gate is what makes it pass.
- **Resolved the readout-vs-AC2 tension the story's own Task 2 flagged and asked to be flagged
  back.** Task 2 said to mount the rank readout "unconditionally", but AC2 says a reference viewer
  sees no purchase state and AC6's closing sentence says non-ST/dev viewers see "nothing extra at
  all (reference view, per AC2)". Rendering the readout unconditionally would have satisfied the
  task wording while breaking both ACs for a player browsing someone else's office. Implemented the
  reading that satisfies all three: the rank block is populated when `isOwnOffice || isST`, and the
  stepper within it only when `isST`. So — the officeholder sees their own rank; an ST sees and can
  edit any office's rank from either view (AC6's ST-editing-ahead-of-handover case, preserved
  exactly); a player browsing a reference office gets nothing extra, and `_wireManoeuvreRank` does
  not even issue the fetch for them. **Angelus's call if he wants the readout hidden from the
  non-ST officeholder too** — that is the only remaining degree of freedom, and AC1 reads as wanting
  them to see it.
- **The synchronous first render is deliberately unmuted, not muted-then-unmuted.** Rank arrives
  async, so `renderOfficeTab` passes `rank = null` and `manoeuvreListHtml` mutes nothing until the
  fetch resolves. Muting-by-default would have flashed "you own none of these" on every render.
  The rank mount is emitted as a genuinely empty div (`:empty { display: none }`) rather than a
  "Loading…" placeholder, so a non-ST reference viewer, who never gets it filled, sees no stray
  chrome.
- **Kept the manoeuvre list synchronous rather than converting it to an async mount** like the Merit
  Suite's `data-office-merit-mount`. Converting it would have been the closer mirror of
  `_wireMeritDots`, but four existing tests in `issue-1141-office-tab-render.test.js` assert
  manoeuvre names are present in the *synchronous* `innerHTML` (the two-Socialite render, otc.3's
  reference security boundary, otc.3's own-office regression, and the picker re-render), and
  breaking them would have been a real AC8 regression for no user-visible gain. The async wiring
  re-renders the list's innerHTML in place instead.
- **Testability without a browser harness.** This repo has no jsdom, so the rank-dependent markup
  lives in two pure exported builders — `manoeuvreListHtml` and `manoeuvreRankHtml` — which the
  render tests call directly. That gives real behavioural assertions on muting and stepper gating
  (rather than the source-text-only contracts `office-merit-dots.test.js` had to settle for) with no
  module mocking, and keeps `_wireManoeuvreRank` as a thin fetch-and-mount shell whose ordering
  guarantees are covered by source contracts.
- **AC5's cap is dynamic, and there is a test asserting the route contains no bare `5`.** Validation
  reads `OFFICE_DATA[category].manoeuvres.length`, so Administrator (oxp.8, no `manoeuvres` array yet)
  is rejected as a 400 today and will validate correctly the day its content is authored, with no
  code change here. Confirmed `requireRole('st')` covers dev by reading the middleware, per AC5's
  instruction not to assume: `requireRole` appends `'dev'` whenever `'st'` is requested.
- **Stricter than the precedent on one point, deliberately.** `office-merit-dots.js` validates with
  `Number(dots)`, which happily coerces `null`, `''` and `[]` into a valid-looking `0`. The new route
  only coerces non-empty strings, so a null/missing rank is a 400 rather than a silent reset to
  "nothing purchased". Covered by its own test.
- CSS is tokens-only. The muted treatment reuses `.skill-zero`'s established `opacity: .4` idiom
  rather than inventing a colour; `.pointed.hollow` (which the epic's oxp.6 note suggested) was
  checked and rejected as the story's Dev Notes anticipated — it is a dot-glyph pattern and cannot
  dim a `<div class="office-manoeuvre">` block. The stepper reuses `.cs-edit-stepper`/`.cs-step-btn`
  verbatim, sized to match `.office-merit-stepper`. No inline styles, no hex, no `rgba()` — asserted
  by test on both the JS and the new CSS block.
- **No deviations from the Task breakdown other than the two documented above** (the
  `isOwnOffice || isST` readout gate resolving the AC2 tension the story itself asked about, and
  keeping the manoeuvre list synchronous to protect existing tests). The story's optional
  "combined fetch with merit dots" question was answered as the story permitted: two independent
  `_wireX` functions, each doing its own fetch, so the two collections never merge client-side.

### File List

- `server/routes/office-manoeuvre-rank.js` — **NEW**. `GET /` (open to any authenticated user,
  returns `{ [category]: rank }`) and `PUT /:category` (`requireRole('st')`, validates category and
  an integer rank within `manoeuvres.length`, upserts `{ rank, updated_at }`). Mirrors
  `office-merit-dots.js`.
- `server/tests/oxp-3-office-manoeuvre-rank.test.js` — **NEW**. 24 tests: 15 DB-backed
  (`describe.skipIf(!dbAvailable)`) over GET/PUT including auth, validation and boundary cases, plus
  9 source-contract tests covering the client wiring, the route's dynamic cap, the ST gate, the
  `index.js` mount, and the CSS block's token discipline.
- `server/index.js` — MODIFIED. Router import (line 31) and mount
  (`app.use('/api/office_manoeuvre_rank', requireAuth, noCache(), officeManoeuvreRankRouter)`,
  line 189), placed beside the existing `office_merit_dots` pair.
- `server/tests/helpers/test-app.js` — MODIFIED. Same import + mount against `mockAuth`, so the
  DB-backed tests exercise the real router. (Not named in the story's Project Structure Notes, but
  required — the test app is a separate mount surface from `index.js`.)
- `public/js/tabs/office-tab.js` — MODIFIED. New `_isST()` helper (deduped out of `_wireMeritDots`,
  which now calls it); new exported pure builders `manoeuvreListHtml` and `manoeuvreRankHtml`; the
  Manoeuvres section now renders through the builder and emits a
  `[data-office-manoeuvre-rank-mount]` div; new `_wireManoeuvreRank` and `_adjustManoeuvreRank`
  (re-fetch-before-write, mirroring `_adjustMeritDots`), wired from `renderOfficeTab`.
- `public/css/suite.css` — MODIFIED. Added `.office-manoeuvre-unpurchased` and the
  `.office-manoeuvre-rank*` group beside the existing `.office-manoeuvre*` rules.
- `server/tests/issue-1141-office-tab-render.test.js` — MODIFIED. Imports the two new builders; new
  `oxp.3 — manoeuvre purchase state` describe block, 11 tests covering AC1 muting at every rank, the
  AC2 structural boundary, AC6's readout/stepper/disabled-state gating, and AC8's Administrator
  fallback.
- `specs/stories/sprint-status.yaml` — MODIFIED. `oxp-3-manoeuvre-purchase-graduated-merit` moved
  `ready-for-dev` → `review`, then `review` → `done` after the review round; `last_updated`
  refreshed each time.

**Not modified by this story, but dirty in the working tree:** `server/db.js` (`tls: true` →
`tls: false`) — see the Debug Log note above. **Resolved:** the file was back at `tls: true` with a
clean `git diff` by the time of the external review, and the review round's own runs reached Mongo
without incident.

### Added during the review round (2026-08-13)

- `server/routes/office-manoeuvre-rank.js`: new `PUT /:category/step` (`requireRole('st')`, body
  `{ delta }`), an aggregation-pipeline `findOneAndUpdate` that applies the step and the
  `[0, manoeuvres.length]` clamp to the stored value in one atomic operation. The absolute-set
  `PUT /:category` is unchanged and kept.
- `public/js/tabs/office-tab.js`: `manoeuvreRankHtml` now clamps its own `rank` argument;
  `renderOfficeTab` stamps a per-render generation counter on `el`; `_wireManoeuvreRank` checks that
  generation before every DOM write and no longer leaves a failed fetch's list unmuted;
  `_adjustManoeuvreRank` sends `{ delta }` to the new step route instead of reading, computing and
  writing an absolute rank.
- `server/tests/oxp-3-office-manoeuvre-rank.test.js`: +11 tests (8 DB-backed over the step route
  including two concurrency cases, 3 new source contracts), 1 rewritten (the old
  re-fetch-before-write contract is now the delta contract). 24 → 35.
- `server/tests/issue-1141-office-tab-render.test.js`: +4 tests (3 driving the real async wiring
  through a hand-rolled fake DOM, 1 on the builder's clamp). 22 → 26.

## Senior Developer Review

**Reviewer**: Codex (external), 3-pass isolated (Blind Hunter → Edge Case Hunter → Acceptance
Auditor), `reasoning_effort=high`, 2026-08-13. Findings written to
`specs/stories/code-review/oxp-3-codex-findings.md`, raw transcript alongside it. Every finding was
independently reproduced against the real code before any patch was written, per this project's
return protocol.

**Outcome**: Needs patches → three patched, one ruled not-a-bug by Angelus, one dismissed as
environmental, two low-severity fixes applied → **Approved**.

### Findings and disposition

| # | Pass | Severity | Finding | Disposition |
|---|------|----------|---------|--------------|
| 1 | 1 | Medium | A rejected `GET /api/office_manoeuvre_rank` left the holder's manoeuvre list in its optimistic unmuted state, silently reading as "all five purchased" when the real rank is unknown and may be 0 | **Patched** |
| 2 | 1 | Medium | An adjustment resolving after a category switch repainted the newly selected office with the previous one's rank, controls and manoeuvre rows | **Patched** |
| 3 | 2 | Medium | Concurrent stepper clicks lost a rank change: the client read the rank, computed `current + delta` locally and wrote back an absolute value, so two overlapping adjustments both wrote the same next value | **Patched, server-side** |
| 4 | 3a | Medium | AC2 and AC6 cannot both be claimed literally, because an ST/dev reference viewer sees the real rank readout | **Not a bug. Angelus's ruling: keep current behaviour; AC2's scope clarified** |
| 5 | 3b | Medium | "All 8 ACs satisfied" is overstated while AC7's concurrency outcome is absent | **Resolved by patch 3; AC7 rewritten to describe the mechanism that actually delivers it** |
| 6 | 1 | Low | Exported `manoeuvreRankHtml` throws `RangeError` on a negative rank; only the internal caller's clamp saves it | **Patched** |
| 7 | 3b | Low | The mandated ten-file gate found nine files and returned 107 passed / 49 skipped, not the recorded 171/171 | **Two causes, both real: one wrong filename in the reviewer's gate command (corrected), and environmental Mongo unreachability (dismissed, see below)** |
| 8 | 3b | Low | The "five existing tests" justification for keeping the manoeuvre list synchronous miscounts; there are four | **Patched (documentation)** |
| 9 | 1 | Low | Source-regex tests do not prove several behaviours their titles name | **Superseded: the review round's own new tests drive the real async wiring rather than its source text** |

### Patch 1: no fail-open list (#1)

`_wireManoeuvreRank`'s `catch` previously wrote an error into the rank mount and returned, touching
nothing else. Because the synchronous first render deliberately passes `rank = null` (mutes nothing,
so the tab does not flash "you own none of these" on every render), a failed fetch left an
indefinitely optimistic list. It now replaces the holder's list with
`<p class="dtl-empty">Could not load purchase state.</p>`, matching `_wireMeritDots`'s own
`Could not load merit dots.` idiom in the sibling section. An explicit failure message was chosen
over muting all five, because "we could not find out" is honest and "assume nothing is purchased" is
another guess.

**Prove-discriminated**: reverted only the list-replacement branch, ran the two changed-area files,
got exactly two failures, both this patch's own tests (the fake-DOM behavioural test and its source
contract), nothing else. Restored, green.

### Patch 2: render-generation guard (#2)

`renderOfficeTab` now stamps `el._officeManoeuvreGen = (el._officeManoeuvreGen || 0) + 1` on every
render. `_wireManoeuvreRank` captures it before its first `await` and re-checks before every DOM
write; `_adjustManoeuvreRank` captures it and abandons its re-render if it has moved.

The precedent is `public/js/suite/office-approvals.js`'s `_fetchGen`, added in oaq.3's own review for
this exact class of bug. It keeps its counter at **module** scope, which is right there because that
module only ever drives a single root element. Here the counter is anchored to `el` itself instead:
the office tab's root node is re-rendered repeatedly, and the whole failure mode is one `el` holding
two different categories' markup at two different moments, so the generation belongs to the element
being re-rendered rather than to the module. This is a deliberate adaptation of the precedent, not a
departure from it, and no new mechanism (WeakMap, external store) was introduced.

The load-bearing check is the one in `_adjustManoeuvreRank`, because `_wireManoeuvreRank` is where
the stale re-entry re-queries the DOM and so picks up the NEW category's nodes. The checks inside
`_wireManoeuvreRank` itself are defence in depth and are not independently observable today: on the
ordinary path each wire captures its own nodes before awaiting, so a late write lands on detached
nodes and is invisible (Codex's own analysis says the same). They are kept because any future
refactor that re-queries after an await would need them, and they cost nothing.

**Prove-discriminated**: removed only `_adjustManoeuvreRank`'s generation check. Exactly one test
failed, the stale-category one, with exactly the right message (`expected '<span class="office-
manoeuvre-rank-la…' to contain '●●●●●'`, i.e. Enforcer's mount had been painted with
Primogen's rank).
Nothing else moved. Restored, green.

### Patch 3: atomic step route (#3, and #5 with it)

New `PUT /api/office_manoeuvre_rank/:category/step`, `requireRole('st')`, body `{ delta }`. It does
the read-modify-write inside MongoDB as an aggregation-pipeline `findOneAndUpdate`
(`$ifNull` → `$add` → `$max 0` → `$min count`), so the increment and the clamp are one operation
against the stored value and `upsert` behaves identically to an existing document. Validation is
unchanged in kind: the category must be a real `OFFICE_DATA` key with a `manoeuvres` array, the cap
is still `manoeuvres.length` and never a bare 5, and the write is still ST-only.

The existing absolute-set `PUT /:category` is deliberately kept rather than folded in. "Set this
office to exactly rank N" is a legitimate operation whose last-writer-wins semantics are correct;
only the stepper's relative adjustment needed the atomic form. The client
(`_adjustManoeuvreRank`) no longer reads anything: it sends `{ delta: 1 }` or `{ delta: -1 }` and
re-renders from the result.

AC7's text was rewritten to match. Its original wording mandated the re-fetch-before-write pattern
copied from `_adjustMeritDots`, which was itself the defect: however fresh the read, read-then-write
across a network boundary is not atomic. The AC's *intent* ("two STs adjusting concurrently converge
rather than clobber") is unchanged and is now genuinely met, which also closes finding #5.

**Prove-discriminated**: reverted only the pipeline, replacing it with a `findOne` + computed `$set`
read-then-write and changing nothing else. Ran three times: three failures every run and only those
three (both concurrency tests plus the source contract asserting the pipeline operators), the
first-listed one failing as `expected 4 to be 3`, a real and reproducible lost update. Restored,
confirmed green three times running.

Note on test design: the concurrency test fires **four** simultaneous steps, not two. Two racers did
not reliably interleave under the reverted code (one of the first discrimination runs passed on the
two-racer version), which would have made the guard a flaky one. Four steps from 0 to 4, below
Enforcer's cap of 5, failed deterministically across every run.

### Not a bug: #4, the AC2/AC6 reference-viewer question (Angelus's ruling)

Codex read AC2's "reference view reveals no purchase state" as contradicted by an ST/dev seeing the
real rank readout while browsing an office they do not hold. **Angelus reviewed this and ruled to
keep the current behaviour**: an ST/dev sees and can edit the rank readout from any view. That is
the already-shipped Merit Suite precedent, and it is the reason AC6 was written `isOwnOffice`-
independent in the first place, so an ST can set an office's purchase state up before anyone holds
the seat.

AC2's text has accordingly been clarified to state what it always governed: the MANOEUVRE LIST. The
list's behaviour was never in question and is unchanged: plain and unmuted in reference view, with
the muted class structurally absent from the markup rather than merely suppressed, so a browsing
player's DOM carries no purchase state at all. The rank READOUT is AC6's widget and AC6's ST/dev
exemption is deliberate. A non-ST reference viewer gets no readout at all, so for them the list is
the whole of what AC2 describes. No code changed for this finding.

### Dismissed as environmental: #7's Mongo half

Codex's run of the ten-file gate reported nine files, 107 passed and 49 skipped, with Mongo failing
`EACCES`. Two separate causes, and only one of them is real:

- **The wrong filename is a genuine error, and mine as reviewer, not the dev round's.** The gate
  command handed to Codex named `tests/oaq-2-pending-status-actions-accept-decline.test.js`; the
  real file is `tests/oaq-2-pending-status-actions.test.js`. That is why vitest collected nine paths
  rather than ten. The wrong name never appeared in this story file (it exists only in the reviewer's
  own prompt and in Codex's verbatim findings, which are left as written); the corrected command is
  recorded in full under Regression below so there is no ambiguity next time.
- **The Mongo failure was process collision, not a defect.** An orphaned `codex exec` process was
  running concurrently with the review. After it was killed, the identical gate with the corrected
  filename was re-run in this environment and returned a clean **171 passed / 0 skipped across
  10/10 files**, matching the dev round's recorded figure exactly. This is the same class of
  transient-Mongo-reachability discrepancy already recorded in otc.2's and oaq-2's reviews: both
  readings are accurate for their own moment, and they are recorded rather than reconciled further.
  No DB-backed suite is claimed green on Codex's run; the figures below are from this environment.

### Patch 4: defensive clamp in the exported builder (#6)

`manoeuvreRankHtml` now clamps: `Math.max(0, Math.min(count, Math.trunc(rank) || 0))`, applied to
both the dot display and the stepper's disabled states. Not reachable from today's only caller,
which clamps first, but the function is exported and `'●'.repeat(-1)` throws, so the safety should
not depend on every future caller's discipline. Covered by a test over -1, 7, 2.7 and `NaN`.

### Superseded: #9, source-regex tests

Codex's methodological point, that whole-file regex assertions can stay green without exercising the
behaviour their titles name, was fair for the async layer specifically. Rather than argue it, this
round added a hand-rolled fake DOM to `issue-1141-office-tab-render.test.js` (the same technique
otc.3's review used for its fake `<select>`; this project has no jsdom) with `localStorage` and
`fetch` stubbed the way that file's header already stubs `location`. Three tests now drive
`renderOfficeTab` → `_wireManoeuvreRank` → `_adjustManoeuvreRank` end to end against real fake nodes,
including a gated in-flight write. The remaining source contracts are kept for the things that are
genuinely textual (route mounting, the dynamic cap, the ST gate, CSS token discipline).

### Regression

**186 passed / 186, 10 files, zero skipped**, up from 171 (15 new tests). The corrected gate, run
from `server/`:

```
npx vitest run tests/oxp-3-office-manoeuvre-rank.test.js tests/issue-1141-office-tab-render.test.js \
  tests/office-merit-dots.test.js tests/otc-3-office-nav-unconditional.test.js \
  tests/feature.691.hos-city-status-power.test.js tests/issue-1141-office-data-sync.test.js \
  tests/issue-1143-office-actions-auth-safety.test.js tests/oaq-2-pending-status-actions.test.js \
  tests/otc-2-office-actions-api.test.js tests/otc-2-city-status-calc.test.js
```

No unresolved High or Medium findings remain.

### Deferred, not patched

`server/routes/office-merit-dots.js` and `_adjustMeritDots` carry the **identical** read-then-write
lost-update race that patch 3 fixed here, for exactly the same reason and with exactly the same
consequence. It predates this story, is untouched by its diff, and was found only because this story
copied the pattern. Filed in `specs/deferred-work.md` under this story's own review heading rather
than fixed in scope.

## Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Story implemented, all 8 ACs. New `office_manoeuvre_ranks` collection + `office-manoeuvre-rank.js` route; Office tab gains muted-unpurchased manoeuvres (own-office view only), a graduated rank readout, and an ST/dev-only stepper. 171/171 across 10 files, zero skipped. Two boundary gates prove-discriminated by mutation. |
| 2026-08-13 | Codex external review (3-pass, high effort): 0 High, 5 Medium, 4 Low. 3 Medium patched (fail-open list on a rejected rank fetch; stale-category repaint via a render-generation guard on `el`; lost-update race closed by a new atomic `PUT /:category/step` aggregation-pipeline route, with the client no longer computing an absolute rank). 1 Medium ruled not-a-bug by Angelus (ST/dev sees the rank readout in reference view, matching the Merit Suite precedent) with AC2's scope clarified; 1 Medium resolved by the concurrency patch, AC7 rewritten to the atomic-step mechanism. 2 Low patched (clamp inside exported `manoeuvreRankHtml`; "five existing tests" corrected to four), 1 Low superseded by new fake-DOM wiring tests, 1 Low dismissed as environmental after an independent clean re-run of the corrected gate (171/171, 10/10 files, 0 skipped). All three fixes prove-discriminated by single-change revert. Final regression **186/186 across 10 files, zero skipped**. Sibling merit-dots race filed to `specs/deferred-work.md`. |
