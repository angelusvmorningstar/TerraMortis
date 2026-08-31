# Story issue-1122: Standing pledge-overcommitment indicator (render-time, both renderers)

Status: review

> **The other half of OATH-A.** #1111 shipped `_pledgeFloorNote` (`public/js/editor/edit.js`
> `_applyPledgeFloor`, `sheet.js:2149`): edit-time feedback that fires when an edit would have
> dropped a merit's dots below what a standing Swear By oath has pledged against it. That notice is
> correctly edit-only — it has nothing to report on a character nobody has touched. But a character
> CAN be over-committed (pledged more dots than the merit currently holds) on a fresh load, with no
> edit involved: `_applyPledgeFloor` gates exactly one of the merit-write paths (`shEditMeritPt` in
> `edit.js`), and #1128's own record names the other six as ungated. If any of those moves a merit's
> dots below what's pledged, nothing renders anything, ever, until someone happens to edit that exact
> merit's fields again. This story builds the render-time indicator that closes that gap, per #1122.
>
> **Angelus's ruling (settled before this story was written, do not re-open):** an over-committed
> pool is a **warning, not an error**. The pledge floor's own doc comment already says why — "the
> data is legal" — pledging beyond a shrunk pool is a real, sanctioned game state (the floor exists
> specifically so an oath's dots are never silently voided), not a bug. The indicator must read
> calm/informational, not alarming. Concretely: reuse `.dom-cap-warn` (`components.css:507`,
> `color:var(--warn-dk)`) — the same class `_pledgeFloorNote` already uses — never `.rel-error` /
> `--err` (`components.css:690`, `720`), which this codebase reserves for genuine error states.

## Story

As a Storyteller opening any character's sheet, in either view or edit mode,
I want a character whose pledged merit dots currently exceed what that merit holds to show that on
the sheet, on load, with no edit required,
so that an over-committed pledge is discoverable from the data itself rather than only by accident,
in a tone that reads as "worth knowing" rather than "something is broken."

## Why this story exists

`buildPledgeIndex(c)` (`public/js/data/rules-helpers.js:719`) already builds the render-time reverse
index — "is this merit pledged, and how much?" — and `shRenderGeneralMerits` already consumes it
every render, in both modes, via `_pledgeBadge` / `_oathPledgeNote` (`sheet.js:2229-2248`). The
missing piece is a **comparison**, not a new data source: `e.dots` (pledged) against
`meritRating(c, m)` (owned — the same "what you bought" measure `pledgeableDots` already uses per
ADR-010 D1b, deliberately not the suspension-adjusted effective rating, per ADR-010 D2's "zero
accessor changes"). When pledged exceeds owned, the character is over-committed on that merit, and
that fact is fully derivable from `c.merits` alone — no new field, no new write path.

The dual-renderer blind spot is the same one #1128's own framing names: `shRenderGeneralMerits` has
an edit-mode branch and a view-mode branch computing the same rows, and wiring only one silently
misses the other. `_pledgeFloorNote` is *correctly* edit-mode-only (it is feedback about an edit);
the new indicator is not feedback about anything that just happened, so it belongs in both.

## Acceptance Criteria

1. **Render-time derivation, not a write-time side effect.** A new pure check compares, for every
   merit with a nonzero pledge entry in `buildPledgeIndex(c)`, `e.dots` (pledged) against
   `meritRating(c, m)` (owned). It sets nothing on `m`, reads no field `_applyPledgeFloor` doesn't
   already establish exists (`sworn_by.attachments`, `cp`/`xp`/`free_*`/`free_grants`), and is called
   fresh on every render — never gated behind an edit having happened.
2. **Surfaces in both renderers of `shRenderGeneralMerits`.** The edit-mode branch (currently calling
   `_pledgeFloorNote(m)` at `sheet.js:2291` inline and `:2310`) and the view-mode branch (currently
   calling neither, `:2322-2334`) both call the new check for every merit and render its output when
   the merit is over-committed. Prove this with assertions against BOTH rendered HTML strings, per
   the `renderBoth()` pattern already established in `server/tests/oath-a-render-and-gate.test.js`.
3. **A freshly loaded, never-edited, over-committed character shows it.** Constructing a character
   fixture directly (bypassing `shEditMeritPt`/`_applyPledgeFloor` entirely, modelling one of the six
   ungated write paths #1128 names) with a merit whose `cp`/`xp`/`free_*` sum is below what an oath's
   `sworn_by.attachments` pledges against it renders the indicator with zero prior edits.
4. **Warning tone, not error tone (Angelus's ruling).** The indicator uses `.dom-cap-warn` (the exact
   class `_pledgeFloorNote` already renders with). It must not introduce or reuse any `--err`/
   `.rel-error`/`.sh-touchstones-error`-family styling. No new CSS is added — this AC is satisfiable
   with the existing class alone.
5. **Distinguishable from `_pledgeFloorNote`, deliberately, not merged with it.** The two notices
   answer different questions at different times (edit-time "your edit was overridden" vs. render-time
   "this merit is currently short"), so they are separate functions with separate wording, not a
   single message reused. They MAY both render on the same merit row in the same pass (they are not
   mutually exclusive — see Dev Notes) — that is acceptable and is not "two notices saying the same
   thing," because they say different things about different moments. `_pledgeFloorNote` itself is
   UNCHANGED by this story: its wording, its edit-only trigger, and its existing call sites all stand.
6. **A non-over-committed pledge renders nothing new.** A character with a standing pledge that the
   merit's current dots fully cover (the existing `swornFixture()` shape in
   `oath-a-render-and-gate.test.js` — Resources `cp:3`, pledged `2`) renders no over-commitment text,
   in either mode. Only `pledged > owned` trips it, never `pledged === owned` or `pledged < owned`.
7. **Nothing is persisted.** The check reads `c.merits` and computes at call time; it writes no field
   onto `m`, unlike `_pledgeFloorNote` (which sets and later strips `m._pledgeFloorNote`). There is
   nothing for a save path to strip, and this AC is satisfied by construction if AC1 is met — call
   this out explicitly in the PR rather than adding a strip step that has nothing to do.
8. **Targeted tests green.** New suite (`server/tests/issue-1122-pledge-overcommit-indicator.test.js`)
   plus `oath-a-render-and-gate.test.js`, `oath-a-pledge-helpers.test.js`,
   `issue-1128-dot-wrapper.test.js` (adjacent renderer, confirm no interference). No full-suite run
   required.

## What this story is NOT

- **Not** a fix to the underlying "1 of 7 write paths" gate gap #1128 named. That gap is *why* an
  over-commitment can arise undetected; closing it (gating all seven paths through
  `_applyPledgeFloor`, or an equivalent) is separate work, out of scope here, and not filed as its
  own issue by this story — flag it to Angelus if he wants it tracked.
- **Not** a change to `_pledgeFloorNote`, `_applyPledgeFloor`, the floor-computation logic in
  `edit.js`, or the pledge editor (`_oathPledgeEditor`). All stand exactly as OATH-A shipped them.
- **Not** wiring pledge awareness into `shRenderDomainMerits`, `shRenderInfluenceMerits`, or the
  standing-merits renderer. Verified during research: `sworn_by` / `buildPledgeIndex` /
  `_pledgeBadge` are referenced **only** inside `shRenderGeneralMerits` (`sheet.js`, confirmed by
  grep across the whole file) — none of the other three category renderers surface a pledge badge
  today, even though `_oathPledgeEditor`'s candidate list is not category-filtered and a domain or
  influence merit COULD in principle be an attachment target (ADR-010's own record: *"The pledge
  editor applies no category filter, so domain merits are ordinary targets"*). That is a pre-existing
  gap in the base pledge-display feature, not something #1122 introduced or was asked to fix. If a
  pledge ever targets a non-general merit, neither the base "Pledged N" badge nor this story's
  over-commitment indicator will show on that merit's own row today. Worth its own issue if it
  matters in practice; not guessed at here.
- **Not** a change to any dot count, `meritRating`, or the suspension mechanic (OATH-B,
  `shSuspendedOf`/`shDotsSuspended`). Read-only, presentation-only, exactly like #1128.
- **Not** the "1122-adjacent" question of whether the ST-facing copy should name a remediation step
  (e.g. "renegotiate the oath"). Angelus's ruling settled tone (warning) but the copy itself is not
  separately specified beyond AC4/AC5 — the implementer may draft it in the spirit of
  `_pledgeFloorNote`'s existing sentence, calm and factual.

## Tasks / Subtasks

- [x] **T1 (AC1, AC7).** Add `_pledgeOvercommitNote(m)` inside `shRenderGeneralMerits`
      (`sheet.js`), immediately after the existing `_oathPledgeNote` definition (`:2240-2248`), in
      the same closure so it shares `_pledgeIdx` (`:2229`). Reads `_pledgeIdx.get(pledgeKeyFor(m))`
      for `e.dots`, compares against `meritRating(c, m)`, returns `''` when `e.dots <= owned` or the
      merit has no pledge entry. Sets nothing on `m`.
- [x] **T2 (AC4).** Output shape: `'<div class="dom-cap-warn">⚠ Pledged ' + e.dots + ', pool
      funds ' + owned + ' - ' + short + ' dot' + (short===1?'':'s') + ' short against ' +
      esc(oathNames) + '.</div>'` (wording is a suggestion, not a spec — keep it calm/factual per the
      framing note, keep the `⚠` glyph and `.dom-cap-warn` class to match `_pledgeFloorNote`'s
      existing visual weight, and never introduce `--err`/`.rel-error`).
- [x] **T3 (AC2).** Wire the call into the edit-mode branch: granted-merit sub-branch (`:2291`,
      alongside the existing `_pledgeFloorNote(m)` call already inline there) and the plain-merit
      sub-branch (`:2310`, immediately after the existing `h += _pledgeFloorNote(m);` line). Confirm
      current line numbers against the working tree before editing — line numbers drift.
- [x] **T4 (AC2, AC3).** Wire the call into the view-mode branch (`:2322-2334`): both the
      `m.granted_by` sub-branch (`:2330`) and the plain sub-branch (`:2332`), placed before the
      existing `if (pw) h += pw;` append (matching the edit-mode ordering: pledge-related notes
      before the prerequisite warning).
- [x] **T5 (AC5).** Confirm by reading, not assuming: does `_pledgeOvercommitNote` ever fire on the
      SAME render pass as `_pledgeFloorNote`? (It can: `_pledgeFloorNote` is set by the most recent
      edit and persists in memory as `m._pledgeFloorNote` until the next edit on that merit or a
      fresh load; `_pledgeOvercommitNote` is independently render-time-derived from current state.)
      Record the finding in Dev Notes rather than asserting a false mutual exclusivity.
- [x] **T6 (AC3, AC6, AC8).** New suite. Reuse the `mkChar` / `buildSwornBy` / `renderBoth` harness
      shape from `oath-a-render-and-gate.test.js` (globals stubbed at module top, `pathToFileURL`
      dynamic import, `stateMod.chars`/`editIdx`/`editMode` set before each render call). Cases:
      - over-committed, no edit ever run (fixture built with `cp` below what's pledged directly) →
        indicator present in BOTH `edit` and `view` HTML.
      - `swornFixture()` unmodified (pledged fully covered) → indicator absent in BOTH.
      - unpledged merit on an over-committed character → indicator absent for that merit specifically
        (assert per-merit, not per-character, the same way AC6's "unpledged merits carry NO badge"
        test in `oath-a-render-and-gate.test.js` counts occurrences rather than checking a global
        absence).
      - multiple oaths over-pledging the same merit → `e.dots` sums across oaths (already guaranteed
        by `buildPledgeIndex`; assert the summed value appears, not each oath separately).
      - `.dom-cap-warn` class present, `--err`/`.rel-error`-family classes absent, on the
        over-committed render.
- [x] **T7 (AC8).** Run `cd server && npx vitest run tests/issue-1122-pledge-overcommit-indicator.test.js tests/oath-a-render-and-gate.test.js tests/oath-a-pledge-helpers.test.js tests/issue-1128-dot-wrapper.test.js`. Record pass counts. `node --check public/js/editor/sheet.js`.
- [x] **T8.** Browser check (Angelus cannot run the app locally — flag if this cannot be done and
      report code-only completion instead, per this repo's own `CLAUDE.md`): admin sheet, a character
      with an over-committed pledge, both Parchment and dark themes, both view and edit mode. Confirm
      the warning reads calmly (amber/`--warn-dk` tone, not red) and does not collide visually with
      `_pledgeFloorNote` when both happen to render together.

## Dev Notes

### Data-lock: not required

Pure client-side rendering fix over fields OATH-A already established exist (`sworn_by.attachments`,
`cp`/`xp`/`free_*`/`free_grants`). No new field, no schema change, no API route. No data-lock needed.

### The comparison, precisely

```
owned   = meritRating(c, m)                        // xp.js:193 — cp + all free_* channels + xp
pledged = _pledgeIdx.get(pledgeKeyFor(m))?.dots ?? 0 // rules-helpers.js:719 buildPledgeIndex
overBy  = pledged - owned                            // > 0 means over-committed
```

`meritRating` is deliberately the OWNED measure (not the OATH-B suspension-adjusted effective one),
matching `pledgeableDots`'s own documented choice (`rules-helpers.js:772-786`, "this is the OWNED
rating, not the effective one: pledging is about what you bought"). Reusing the same measure keeps
the pledge family internally consistent — `pledgeableDots`, `_pledgeFloorNote`'s floor computation,
and this indicator all read "owned" the same way.

### Why a stored over-commitment can exist at all (confirms AC3 is buildable)

`edit.js`'s `_applyPledgeFloor` (`:1099-1108`) only ever *raises* a value being written by
`shEditMeritPt`, and only for the specific field being edited on the specific merit under edit. It
cannot lower anything. Two ways a stored `pledged > owned` state can arise with zero edits on the
pledged merit itself, both real and both untouched by this story:

1. **The "1 of 7 write paths" gap** (#1128's own "What this story is NOT," verified still open): six
   other merit-write paths exist that do not route through `_applyPledgeFloor` at all. Any of them
   reducing a pledged merit's `cp`/`xp`/`free_*` produces exactly this state, invisibly, today.
2. **A pool shrinking elsewhere without touching the merit's own fields.** `_applyPledgeFloor` only
   fires when `shEditMeritPt` is called on the pledged merit itself. If capacity for a shared pool
   (Collective Compound, MCI, VM, etc.) shrinks through some other action, the pledged merit's
   `free_grants[slug]` is untouched (nothing re-clamps on read), so this specific scenario does NOT
   by itself create an over-commitment — the stored dots stay the same as what's pledged. It is
   listed here for completeness of the investigation; (1) is the actual mechanism that matters for
   AC3's fixture.

For the test fixture (T6), the simplest faithful reproduction is direct construction: build a merit
with `cp`/`xp` summing to less than a `sworn_by.attachments` pledge against it, without ever calling
`shEditMeritPt`. This is not an artificial test-only shape — it is exactly the state path (1) above
produces on a real character today.

### `_pledgeFloorNote` and the new indicator are not mutually exclusive — do not assume they are

Read carefully before assuming these two notices are alternate views of "the same fact": they are
not. `_pledgeFloorNote` is set as a side effect of the MOST RECENT edit and lives in memory
(`m._pledgeFloorNote`) until the next edit on that merit's fields or a fresh load discards it (it is
never persisted — stripped on save, per its own doc comment at `sheet.js:2146`). Immediately after
the floor fires, the merit is held AT the pledged amount (`_applyPledgeFloor` raises `val` to exactly
`_floor`, never past it — verified against `edit.js:1099-1108`'s arithmetic: when the floor binds,
`_ownedWithoutField + _floor = _ownedWithoutField + (_pledgedHere - _ownedWithoutField) =
_pledgedHere`), so `_pledgeOvercommitNote` would NOT fire in that exact instant (`owned == pledged`,
not `<`). They can still coexist across two different edits in the same session — e.g. edit field A
on merit X (triggers the floor note, corrects X to exactly `pledged`), then a DIFFERENT ungated write
path (out of scope here) drops X below `pledged` again before the next render — but this is a real,
not contrived, sequence and the design must not assume it cannot happen. AC5 accepts co-rendering
rather than forcing artificial exclusivity.

### CSS: zero new rules, confirmed

`.dom-cap-warn` (`components.css:507`): `font-size:0.625rem;color:var(--warn-dk);font-family:var(--ft);padding:1px 8px 2px;`.
Already used by `_pledgeFloorNote`, `.wa-picker-warn`, `.td-anchor-warn` — an established shared
warning-tone class, not a one-off. `--warn-dk` is distinct from `--err`
(`.rel-error`/`.sh-touchstones-error`/`.rel-disp.negative` all use `--err` + `--warn-dk-bg`) — the
codebase already draws exactly the warning-vs-error line Angelus's ruling needs, so this AC costs
zero new CSS.

### Environment and hard rules

- **Branch `ms/issue-1122-pledge-pool-overcommit`, based on up-to-date `main`** (per this repo's own
  `CLAUDE.md`, which overrides the pickup skill's stale `dev`/`Morningstar` default). PR targets
  `main`.
- **Do not push, merge or deploy** unless Angelus's current message says so.
- **British English, no em-dashes** in any new user-facing string ("colour"/"favour" not applicable
  here, but the indicator text must still follow the convention if it grows any such word later).
- **Normalised CSS is mandatory.** This story should need zero CSS changes — any CSS edit at all is a
  signal to stop and re-check AC4.
- Frontend-only. No server, schema, collection or API work. Run
  `node --check public/js/editor/sheet.js` before committing.

### References

- `public/js/editor/sheet.js:2130-2336` (`shRenderGeneralMerits`, the pledge machinery and both
  renderer branches), `:2149-2151` (`_pledgeFloorNote`), `:2229-2248` (`_pledgeIdx`, `_pledgeBadge`,
  `_oathPledgeNote`).
- `public/js/editor/edit.js:1040-1177` (`shEditMeritPt`, `_applyPledgeFloor`, the floor arithmetic
  and its own extensive doc comments naming #1122 as the deferred render-time feature).
- `public/js/data/rules-helpers.js:663-830` (`meritMatchesRef`, `swornOaths`, `pledgeKeyFor`,
  `buildPledgeIndex`, `pledgedDots`, `pledgeableDots`, `validatePledge` — ADR-010 D1/D1b).
- `public/js/editor/xp.js:193-197` (`meritRating`).
- `public/css/components.css:507` (`.dom-cap-warn`), `:690,720,553,620` (the `--err` family, for
  contrast — confirms which token this story must NOT use).
- `specs/architecture/adr-010-swear-by-oath-cost-model.md` (D1, D1b, D2 — encumbrance is
  display/edit-gate only, zero accessor changes; the "no category filter" note on pledge targets).
- `specs/stories/issue-1128-oversized-merit-dots.story.md` (the dual-renderer blind-spot precedent
  this story's AC2/T6 structure is modelled on, including the "assert rendered HTML, not source
  regex" discipline and its "1 of 7 write paths" finding this story's Dev Notes build on).
- `server/tests/oath-a-render-and-gate.test.js` (harness shape: `mkChar`, `buildSwornBy`,
  `renderBoth`, the AC6 badge-assertion pattern).
- GitHub issue #1122; references #1111 (OATH-A), #1128 (the "1 of 7" gap), ADR-010 D1.

## Dev Agent Record

### Debug Log

**Line numbers verified before editing, not trusted.** Every `sheet.js` reference the story cites
was still exact in the working tree: `_pledgeFloorNote` at `:2149-2152`, `_pledgeIdx` at `:2229`,
`_pledgeBadge` at `:2231-2238`, `_oathPledgeNote` at `:2240-2248`, the edit-mode granted sub-branch
at `:2291`, the edit-mode plain sub-branch's `h += _pledgeFloorNote(m);` at `:2310`, and the
view-mode branch at `:2322-2334`. No drift; no re-anchoring needed.

**RED, and for the right reason.** New suite run against unmodified `sheet.js`:
**10 failed / 7 passed (17)**. The failure message on every one was the indicator's absence
(`expected '<div class="sh-sec">…' to match /pool funds/g`), not a harness error. The 7 that passed
in the RED run are the negative controls and are supposed to pass at base — the AC6 silence cases
(covered pledge, `pledged === owned`, no oath at all), the AC7 purity cases, and "the edit-time note
alone does NOT produce the standing indicator". A suite where the whole file goes red proves the
harness works, not that the assertions discriminate; these seven passing at base and still passing
after is what makes the other ten load-bearing.

**GREEN after implementation:** 17/17 in the new suite, `node --check public/js/editor/sheet.js`
clean.

**The marker is `pool funds`, deliberately not `Pledged N`.** `_pledgeBadge` already emits
`Pledged 3` on every pledged merit in both renderers, so a substring assertion on that would have
passed at base and proved nothing. Every discriminating assertion keys off `pool funds`, which only
the new function emits.

**Four call sites, not two.** The story's AC2 says "both renderers"; each renderer then forks again
on `m.granted_by`, so the real count is four. Test
`fires on a granted merit sub-branch too, in both renderers` covers the two that are easiest to
miss.

**T5 finding — confirmed by reading `edit.js:1065-1108`, not assumed.** The story asked whether the
two notices can fire on the same render pass. They can, and the arithmetic says exactly when they
cannot:

- `_floor = Math.max(0, _pledgedHere - _ownedWithoutField)` (`:1069`), and `_applyPledgeFloor`
  returns `_floor` when `v < _floor` (`:1099-1108`). So when the floor binds, the written value
  makes `owned = _ownedWithoutField + _floor = _pledgedHere` — owned lands *exactly* on pledged.
  `_pledgeOvercommitNote` requires `pledged > owned` strictly, so it returns `''` in that instant.
  The two are therefore mutually exclusive **immediately after a binding edit**, and only then.
- `delete m._pledgeFloorNote` at `:1071` clears the note **only for the merit currently under
  edit**. A note set on merit X survives every subsequent edit to merit Y. So the co-render sequence
  is real, not contrived: edit X (floor fires, note set, owned == pledged) → a different ungated
  write path drops X below its pledge → next render shows both.

Recorded rather than asserted as exclusivity, per T5. Two tests pin it from both directions: the
co-render case asserts both strings present with `>= 2` `.dom-cap-warn` blocks, and the converse
case asserts a floor note on a *covered* merit does not summon the indicator — which is what proves
they are genuinely two functions rather than one reused.

**`oath-a-pledge-helpers.test.js` — 1 failure, PRE-EXISTING, proved by A/B not by assumption.**
`meritRating and meritEffectiveRating are byte-identical to their pre-OATH-A form` fails. It is on
`CLAUDE.md`'s known-failures list (source-literal drift), and the received value shows the real
cause is CRLF: the test asserts an LF literal (`…meritRating(c, m) {\n  if (m…`) against a file read
back with `\r\n`. This story touches neither `xp.js` nor `domain.js`. Verified rather than argued:
`git stash push -u` → same suite → **1 failed / 28 passed**, same test, same line `:388`. Identical
with and without the change. Stash popped, tree restored and confirmed.

### Completion Notes

Implemented exactly as specced. One new arrow function, four call sites, one new test file. No CSS,
no server, no schema, no API, no accessor touched.

- **T1/T2 — `_pledgeOvercommitNote(m)`** added inside `shRenderGeneralMerits` immediately after
  `_oathPledgeNote`, in the same closure so it shares `_pledgeIdx` (built once per render, so
  wiring both renderers costs no extra index build). Reads
  `_pledgeIdx.get(pledgeKeyFor(m))?.dots` against `meritRating(c, m)`; returns `''` when the merit
  has no pledge entry, a zero pledge, or `pledged <= owned`. Sets nothing on `m`.
- **AC1's measure is `meritRating`, deliberately.** Not the OATH-B suspension-adjusted effective
  rating — matching `pledgeableDots`'s own documented choice (`rules-helpers.js:772-786`, ADR-010
  D1b, "pledging is about what you bought"). This is not cosmetic consistency: `meritRating` sums
  ten `free_*`/`free_grants` channels, so an indicator reading only `cp + xp` would have cried
  over-commitment on every correctly-funded MCI- or compound-granted merit. Pinned by the
  `counts free_grants channels as owned` test.
- **Oath names are de-duplicated** (`[...new Set(e.oaths.map(o => o.oath))]`) so two oaths of the
  same name cannot render "Oath Of Fealty, Oath Of Fealty". The pledged figure itself is
  `e.dots`, which `buildPledgeIndex` already sums across oaths — one notice per merit carrying the
  summed total, never one notice per oath.
- **T3/T4 — four call sites.** Edit-mode granted sub-branch (`:2291`, after the inline
  `_pledgeFloorNote(m)`), edit-mode plain sub-branch (`:2310`, immediately after
  `h += _pledgeFloorNote(m);`), view-mode granted sub-branch and view-mode plain sub-branch (both
  before the existing `if (pw) h += pw;`, matching edit mode's ordering of pledge notes ahead of
  the prerequisite warning).
- **AC4 satisfied with zero CSS**, as the story predicted. `.dom-cap-warn` reused verbatim,
  `⚠` glyph matched to `_pledgeFloorNote`. `git diff` touches no `.css` file at all.
- **AC7 satisfied by construction, and asserted anyway.** Two tests snapshot `JSON.stringify(c.merits)`
  and `Object.keys(m)` across a full both-modes render and require them unchanged. There is no strip
  step because there is nothing to strip — flagging that here rather than adding a no-op, per AC7's
  own instruction.

**Copy shipped** (AC4/AC5 left it to the implementer, "in the spirit of `_pledgeFloorNote`'s
existing sentence"): `⚠ Pledged 3, pool funds 1 - 2 dots short against Oath Of Fealty.` Calm and
factual, states the two numbers and the gap, names the creditor, prescribes no remediation (the
"renegotiate the oath" question the story explicitly parked). British English; hyphen, not an
em-dash; pluralisation handled (`1 dot short` / `2 dots short`, pinned by its own test).

**Test results (T7), run exactly as the story specifies, no `tail`, no full-suite run:**

```
cd server && npx vitest run tests/issue-1122-pledge-overcommit-indicator.test.js \
  tests/oath-a-render-and-gate.test.js tests/oath-a-pledge-helpers.test.js \
  tests/issue-1128-dot-wrapper.test.js
```

| Suite | Result |
|---|---|
| `issue-1122-pledge-overcommit-indicator.test.js` (new) | **17/17 pass** (was 10 failed / 7 passed at base) |
| `oath-a-render-and-gate.test.js` | pass |
| `oath-a-pledge-helpers.test.js` | 28 pass, **1 pre-existing fail** (CRLF source-literal, A/B-verified identical at base) |
| `issue-1128-dot-wrapper.test.js` | pass |
| **Total** | **114 passed / 1 failed (115)** — the 1 is pre-existing |

`node --check public/js/editor/sheet.js` — clean.

**T8 — browser check: DONE, with a stated substitution.** The story anticipated this might not be
possible. It was partially possible, so what was and was not verified is stated precisely rather
than claimed broadly.

- **Not done:** driving the real `admin.html` against live data. No live character is currently
  over-committed (the state arises only from the ungated write paths and nothing surfaces it today,
  which is the entire premise of this story), and the admin app needs Discord OAuth. Manufacturing
  an over-committed character in live Mongo to look at it was out of scope and not authorised.
- **Done instead, and genuinely:** a headless Chromium run (`playwright` 1.58.2, repo's own
  Chromium 1208) loading a page that links the **real** admin stylesheet set (`theme.css`,
  `components.css`, `admin-layout.css`, `admin-shared.css`, `admin-spheres.css`) and renders the
  **real** `shRenderGeneralMerits` output — not hand-written markup — for three panels: edit mode
  over-committed, view mode over-committed, and edit mode with `_pledgeFloorNote` set so both
  notices co-render. Computed colours read out of the live CSSOM in both themes, against probe
  elements resolving `--warn-dk` and `--err` side by side:

  | Theme | Indicator colour | `--warn-dk` | `--err` | Verdict |
  |---|---|---|---|---|
  | Parchment (default) | `rgb(122, 92, 0)` | `rgb(122, 92, 0)` | `rgb(139, 16, 16)` | amber, matches warn, ≠ err |
  | Dark | `rgb(212, 168, 50)` | `rgb(212, 168, 50)` | `rgb(232, 160, 160)` | amber, matches warn, ≠ err |

  All four rendered `.dom-cap-warn` blocks across the three panels resolved to `--warn-dk` in both
  themes; no `.rel-error`/`.sh-touchstones-error` element existed anywhere in the output. Angelus's
  warning-not-error ruling is therefore verified as *rendered pixels*, not just as a class name in a
  string assertion.
- **Collision check (the specific thing T8 asked about):** screenshots inspected in both themes.
  The indicator sits below the merit's `bd-row` in edit mode and directly beneath the merit row in
  view mode, at `font-size: 10px`, on its own line. When `_pledgeFloorNote` is also present the two
  stack as two consecutive one-line notes in the same amber, reading as a related pair rather than
  a collision or a duplicate. No overlap, no wrapping artefact, no layout shift in either theme.
- Harness and screenshots live in the session scratchpad, deliberately not committed to the repo.

### Declared Deviations

1. **T8 substituted a component-level Chromium render for the live admin sheet.** Rationale, scope
   and exactly what each half proves are in the Completion Notes above. The tone and collision
   questions T8 was written to answer are fully answered with real browser evidence; what is *not*
   covered is the surrounding live admin chrome, which this change does not touch.
2. **Nothing else.** No AC was reinterpreted, no scope added, no file touched outside the File List.

### Findings for Angelus (not acted on, per the story's own scope boundaries)

- **The "1 of 7 ungated write paths" gap (#1128's finding) is still open** and is the mechanism
  that lets an over-commitment arise in the first place. This story makes that state *visible*; it
  does not prevent it. The story explicitly declines to file it — flagging it here so the decision
  to track it or not is yours.
- **A pledge against a non-general merit still shows nothing**, neither the base "Pledged N" badge
  nor this indicator, because `buildPledgeIndex`/`_pledgeBadge`/`sworn_by` are referenced only
  inside `shRenderGeneralMerits`. Re-verified by grep during implementation; pre-existing gap in the
  base OATH-A display feature, not introduced here. Worth its own issue only if a domain/influence
  pledge is a real scenario.

### File List

| File | Change |
|---|---|
| `public/js/editor/sheet.js` | MODIFIED — added `_pledgeOvercommitNote` inside `shRenderGeneralMerits`; wired into 4 call sites (2 edit-mode sub-branches, 2 view-mode sub-branches) |
| `server/tests/issue-1122-pledge-overcommit-indicator.test.js` | NEW — 17 tests across AC1/AC3/AC4/AC5/AC6/AC7 |
| `specs/stories/issue-1122-pledge-pool-overcommit.story.md` | MODIFIED — tasks ticked, Dev Agent Record added, Status → review |
| `specs/stories/sprint-status.yaml` | MODIFIED — `issue-1122-pledge-pool-overcommit` → `review` (one line, nothing else touched) |

Zero CSS files. Zero server/route/schema files. Zero changes to `edit.js`, `rules-helpers.js`,
`xp.js`, `domain.js` or any accessor.

## Change Log

| Date | Change |
|---|---|
| 2026-08-31 | Story created from issue #1122 (SM). Angelus's ruling on the issue's own open question — warning, not error — folded in before writing ACs. Ready for dev. |
| 2026-08-31 | Implemented (Dev). `_pledgeOvercommitNote` added to `shRenderGeneralMerits`, wired into all 4 renderer sub-branches. New suite 17/17 (RED 10/7 at base). T7 set 114 passed / 1 pre-existing fail (A/B-verified). T8 done as a Chromium render of real output under real stylesheets, both themes — see Declared Deviations. Zero CSS. Status → review. |

## Open questions for Angelus

None blocking. One scope boundary is recorded rather than asked, because the evidence settles it:
this story wires the indicator into `shRenderGeneralMerits` only, because `buildPledgeIndex` /
`_pledgeBadge` / `sworn_by` are referenced nowhere else in `sheet.js` today (verified by grep) — the
other three category renderers have no pledge-display machinery to extend in the first place, even
though a pledge could in principle target a merit in one of them (ADR-010's own note). Building that
machinery for three more renderers is a materially bigger feature than #1122 asks for. If a pledge
against a non-general merit is a real scenario worth covering, say so and it becomes its own issue.
