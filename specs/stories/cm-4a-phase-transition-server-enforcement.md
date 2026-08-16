# Story cm-4a: Phase-transition invariant, server-side

Status: done

> **Ruling document: `D:\Terra Mortis\cycle-model.md` Rev 3 (2026-08-16), §7 ("one writer, enforced
> — not conventional") and §11a ("Two new stories, added to the epic" → CM-4a).** Epic-internal
> story, no GitHub issue; tracked in `specs/stories/sprint-status.yaml` under `epic-cm`.
>
> **Sequence position: FIRST of the remaining CM work.** §11a's revised sequencing puts CM-4a ahead
> of CM-2, CM-2b and CM-4 precisely because it has no data-shape dependency — it is a pure code
> change against a route that all three of those stories will later rename around. Doing it first
> means the rename stories move an already-correct route rather than a broken one.
>
> **Branch from `main`, PR direct to `main`** (project branching convention; `dev` flows from `main`,
> never into it). Server-side change: the staging frontend proxies the **production** API, so this
> cannot be smoke-tested on `dev` — it has to reach `main` before any hand-check is meaningful.
> Game 8 is 2026-09-19, so there is no deadline pressure on this.

## Story

As the Storyteller (and as anyone who ever writes a cycle's phase from anywhere other than the one
admin button that currently remembers to),
I want the tracker slate-wipe to be a consequence of the phase transition itself, enforced by the
server route that performs it,
so that a phase can never advance without the wipe rule that belongs to that transition having been
applied — and so a skipped wipe cannot happen silently.

## Why this story exists

CM-5a established the correct wipe rule and encoded it as a pure, shared, executable predicate
(`resetOnTransition`, `public/js/downtime/cycle-phase.js#L123-133`). What it did not do — because it
was shipped four days before Game 7 and deliberately scoped to the UI layer — was make anything
enforce it. Today the rule fires from exactly one place: `writePhase()` in
`public/js/admin/cycle-views.js#L256-283`, which makes **two independent HTTP calls** —
`apiDelete('/api/tracker_state')` (L272) and then `setCyclePhase(cy, phaseOrNull)` (L281). The second
call is the only one that touches the cycle document. The first is a courtesy the client happens to
extend.

The server end of that second call, `cyclesRouter.put('/:id')` at
`server/routes/downtime.js#L569-582`, is a fully generic `{ $set: updates }` `findOneAndUpdate` with
no knowledge of phase semantics whatsoever. A `PUT /api/downtime_cycles/<id>` carrying
`{ phase: 'game' }` from any ST-authenticated caller succeeds, writes the phase, and does not touch
`tracker_state` — regardless of what the previous phase was.

**This is not theoretical.** Two second writers exist right now:

1. **In this repo.** The admin Data Portability importer PUTs a whole cycle document body straight at
   that route (`public/js/admin/data-portability.js#L535-537`). If the imported document carries a
   `phase` that differs from the live one, the phase changes and no wipe rule is consulted.
2. **In a sibling repo.** `TM Cockpit/scripts/open-dt6-game-phase.mjs` writes
   `{ phase, game_phase, status }` directly to `downtime_cycles` via Cockpit's own live readwrite
   Mongo credential. Written on Game 7 night (2026-08-15) as an emergency alternative to the admin
   UI, it was **never executed** — blocked by a permission classifier, recorded as such in its own
   Cockpit commit `410c32e` ("the (blocked-by-classifier, not run) record of the intended write").
   Had it run, it would have flipped Chapter 7 to `game` from `downtime` — a transition
   `resetOnTransition` says MUST wipe — with no wipe, no dialog, and no error.

§11a states the consequence plainly: unlike Saturday's two other bugs (both visible, both caught the
same night), **a skipped wipe is silent**. It would surface weeks later as unexplained stale tracker
state on some future cycle, with no error and no obvious cause. That is why this story sits ahead of
the renumber.

§7's "one writer, enforced — not conventional" held for the **fields** (phase/game_phase/status all
move together through `setCyclePhase` → `buildPhaseUpdate`). It never extended to the **invariant**
that is supposed to follow from them. This story extends it.

## What this story is NOT

- **NOT a removal or weakening of the client's dialogs.** The zero-submission flip warning
  (`cycle-views.js#L257-263`, the #1003 guard) and the tracker-reset confirmation (L268-270) are real
  ST-facing safety prompts and stay exactly as they are. They are not the defect. The defect is that
  the *data-layer guarantee* lives only beside them.
- **NOT a change to the wipe rule itself.** `resetOnTransition`'s matrix (prep→game false, anything
  else→game true, →prep true only from a preceding phase, →downtime/→processing/→null never) is
  correct as ruled by CM-5a and its review. This story reuses that predicate verbatim; it must not
  reimplement, copy or "improve" it.
- **NOT the carry-over apply mechanism.** Feeding and Influence already reach the tracker, per
  cycle-model.md §2 and CM-5a's own verified trace: an ST's Confirm Feed PUTs vitae and influence per
  character (`public/js/tabs/feeding-tab.js#L964`), and `reconcileInfluenceDT` self-applies on tracker
  init. Both are **event-driven and per-character**, deliberately not tied to the phase-write moment.
  §11a's phrase "the wipe/carry-over trigger" is about the wipe trigger specifically; nothing about
  carry-over is re-architected here.
- **NOT the CM-2 rename** (`chapters` → `story_cycles`) — see `cm-2-chapters-to-story-cycles-rename`.
- **NOT the CM-2b rename** (`downtime_cycles` → `chapters`, ruled 2026-08-16) — see
  `cm-2b-downtime-cycles-to-chapters-rename`. This story touches the route that will later be renamed;
  it deliberately lands first so that rename moves correct code.
- **NOT CM-4** (the renumber and document merge) or **CM-6** (the `game_sessions` FK link) — both
  carry data-shape preconditions this story has none of.
- **NOT CM-3** (derived maintenance), still blocked on the ≈3-vs-exact-3 game-rules ruling in §3.
- **NOT TM Cockpit's script hygiene.** Gating or deleting `open-dt6-game-phase.mjs`, and narrowing
  Cockpit's Atlas role scoping, are TM Cockpit's own housekeeping per §11a's closing paragraph. TM
  Cockpit is a separate repo with a separate deploy pipeline (umbrella `CLAUDE.md`); nothing in this
  story changes a file outside TM Suite.
- **NOT a claim to have closed the direct-Mongo hole.** A route-level guarantee binds every caller
  that goes *through the API*. It cannot bind a client writing to Atlas directly with its own
  credential — which is exactly what the Cockpit script does. See AC9: this story states that residual
  honestly in the code and in this document rather than overclaiming §11a's "regardless of caller".
- **NOT tracker-route hardening.** Direction enforcement on the tracker PUT (players may only
  decrease; cycle-model.md §2's permission rule), and the missing WebSocket broadcast on bulk delete
  (CM-5a review finding K), both remain deferred to the 5b tracker-hardening pass.

## Acceptance Criteria

1. **The enforcement lives in the route that mutates the phase.** `cyclesRouter.put('/:id')`
   (`server/routes/downtime.js#L569-582`) becomes phase-aware. It fires the transition rule **only
   when the request body carries an own `phase` property** — the CM-1 canonical field. A body without
   `phase` behaves byte-identically to today: same generic `$set`, no read-before-write, no
   `tracker_state` access, no session.

   *This condition is load-bearing and must be implemented as written, not "improved" into a
   derived-status comparison.* `deriveCycleStatus` returns `'game'` from the legacy sign-off ladder
   whenever prep is signed and city is not (`public/js/downtime/db.js#L102`), and `signoffPhase`
   writes that derived status on every sign-off toggle (`db.js#L106-119`), as does `setManualOpen`
   (`db.js#L127-138`). Keying enforcement on effective-status drift would therefore wipe every
   character's tracker on a routine sign-off checkbox. Keying it on an explicit `phase` key in the
   body does not.

2. **The decision reuses the pure predicate — no second implementation.** The route imports
   `resetOnTransition` from `public/js/downtime/cycle-phase.js`, added to the existing named-import
   list at `server/routes/downtime.js#L12` (which already pulls `CYCLE_PHASE_SEQUENCE`,
   `FEEDING_ONLY_FIELDS`, `openCycleVerdict`, `cyclePhase` from that module — the cross-tier sharing
   precedent and plumbing already exist; this is one more name on an existing line). The transition
   matrix must appear in exactly one place in the codebase after this story, as it does before it.

3. **One shared "from phase" reader, because client and server currently disagree.** Add a pure
   `transitionFromPhase(cycle)` to `cycle-phase.js`: the known `phase` value if present, else the
   known `game_phase` value, else `statusToPhase(status)`, else `null` — with the same
   unknown-value guard `uiPhase` already applies. `cycle-views.js`'s `uiPhase` (L25-28) delegates to
   it; the route uses it for the pre-update read.

   *Why this is required and not tidiness:* the client decides with `uiPhase` (`phase || game_phase`,
   label-guarded) and the server's existing `cyclePhase` (L68-72) falls back to
   `statusToPhase(status)` instead. On a legacy document with `game_phase: 'game'` and
   `status: 'closed'` the two disagree — `uiPhase` says `'game'` (so →prep does not wipe), `cyclePhase`
   says `'processing'` (so →prep **does** wipe). Shipping the server against `cyclePhase` would produce
   a tracker wipe on a transition where the ST saw no confirmation dialog. One reader, both tiers,
   removes the class.

4. **Identical wipe/no-wipe behaviour to today, proven exhaustively.** A table-driven test asserts,
   for every ordered pair over `{null, 'downtime', 'processing', 'prep', 'game'}` (25 pairs), that the
   route wipes if and only if `resetOnTransition(transitionFromPhase(before), body.phase)` is true.
   Includes the three legacy document shapes AC3 exists for: `{game_phase:'game', status:'closed'}`,
   `{status:'active'}` with no phase fields at all, and a hand-edited junk value
   (`{phase:'feeding'}` as the stored *current* value) resolving to `null` rather than leaking.

5. **Caller-independence.** An integration test issues a raw `PUT /api/downtime_cycles/:id` with
   `{ phase: 'game' }` against a cycle in `downtime` phase — no client code, no preceding
   `DELETE /api/tracker_state` — and `tracker_state` is empty afterwards. The same PUT against a cycle
   in `prep` leaves seeded tracker documents untouched. A PUT of `{ label: 'x' }` never touches
   `tracker_state` at any phase. Auth is unchanged and already correct: `requireRole('st')` admits
   `dev` too (`server/middleware/auth.js#L109-127`), matching the DELETE route's own ST/dev rule
   (`server/routes/tracker.js#L49-55`) exactly, so the wipe cannot become reachable by a role that
   could not already trigger it.

6. **Atomicity: the phase write and the wipe commit together or not at all.** Both run inside one
   `client.startSession()` / `session.withTransaction(...)`, following this codebase's existing
   precedent at `server/routes/office-seats.js#L217-250` — including its two conventions: the response
   status and body are captured in outer-scope variables and sent **after** the commit (responding
   inside the callback answers before the transaction has committed, and `withTransaction` re-runs its
   whole callback on any transient error), and any early-exit is thrown as a route-response object
   rather than returned. `getClient()` is already exported for exactly this purpose
   (`server/db.js#L47-52`, added by issue-1143).

   A test proves atomicity by injecting a failure **after** the phase write inside the transaction
   and asserting that (a) the cycle's phase is unchanged and (b) the seeded `tracker_state` documents
   still exist — i.e. the wipe did not half-apply. Follows the prove-discrimination convention this
   project holds itself to: the test must be shown to go red against a non-transactional
   implementation.

   **Non-replica-set fallback — see Open Questions.** The specified default: attempt the transaction;
   if the server reports transactions unsupported, execute wipe-then-phase-write (today's ordering,
   whose failure mode is strictly no worse than the status quo — CM-5a review finding I) and log a
   clearly-worded warning. Production (Render → Atlas) is always a replica set; this path exists only
   for a local standalone `mongod`.

7. **Exactly one wipe executor.** `writePhase()` keeps the #1003 flip warning, keeps the
   `resetOnTransition` consult, keeps the confirm dialog and keeps cancel-aborts-the-transition — and
   **drops its own `apiDelete('/api/tracker_state')` call** (`cycle-views.js#L272`), because the server
   now performs it. The `apiDelete` import at L1 goes with it if nothing else in the file uses it
   (check: L44's `deleteCycle` lives in `db.js`, not here). Server enforcement must not depend in any
   way on the client having called anything — proven by AC5's raw PUT, never by a source-text
   assertion about the client.

   The client's error surface changes shape: a failed wipe now arrives as a failed phase PUT rather
   than a separate "Tracker reset failed" throw. The message the ST sees must still name the tracker
   reset when that is what failed.

8. **Existing suites reconciled, not deleted.** `server/tests/cm5-reset-transition.test.js#L49-80`
   currently asserts that `writePhase`'s body contains `apiDelete('/api/tracker_state')` **exactly
   once** (L58) and that it sits between the confirm and the `setCyclePhase` call (L61-63). AC7 makes
   those assertions false. They are **rewritten to assert the new contract** (the client consults
   `resetOnTransition`, shows the dialog, aborts on cancel, and makes no tracker call of its own; the
   server owns the wipe), with a comment recording why the assertion inverted — the same treatment
   CM-5a's own review finding C gave the assertion it inverted. Do not simply delete them. The
   `resetOnTransition` matrix tests at L17-43 are unaffected and must stay green untouched.
   `cm1-cycle-phase.test.js` and `issue-918-cycle-tab-management.test.js` (both of which exercise the
   cycles PUT) must also stay green.

9. **The residual gap is stated in the code, not glossed.** The route carries a comment saying plainly
   what this guarantee does and does not cover: every caller reaching `downtime_cycles.phase` through
   the API is bound; a client writing to Atlas directly with its own credential is not, and the
   mitigation for that class is credential scoping in the writing repo (TM Cockpit's own deferred
   work), not anything this route can do. §11a's wording ("fires regardless of caller — a fixup
   script, a future second admin surface, a direct Mongo write") over-reaches on the third item; this
   story delivers the first two and says so.

10. **Hand-test script** (below) runs against production after deploy, on a throwaway cycle. Per
    cycle-model.md §11, the hand-executed script — not the suite — is this project's verification
    record for CM work.

## Tasks / Subtasks

- [x] **Task 1 — Shared from-phase reader (AC 3)**
  - [x] Add `transitionFromPhase(cycle)` to `public/js/downtime/cycle-phase.js`, beside
        `resetOnTransition`. Pure, no imports (the module's own header contract, L1-22 — do not break
        it; the server imports this file directly).
  - [x] Rewrite `uiPhase` in `public/js/admin/cycle-views.js#L25-28` to delegate, preserving its
        label-map guard behaviour exactly (unknown values render as "no phase", never leak into labels
        or CSS class names — a Codex review finding from 2026-08-10, recorded in that function's own
        comment).
  - [x] Unit tests for the three legacy shapes named in AC4, plus the plain cases.

- [x] **Task 2 — Route enforcement (AC 1, 2, 5, 9)**
  - [x] Add `resetOnTransition` and `transitionFromPhase` to the existing import at
        `server/routes/downtime.js#L12`.
  - [x] In `cyclesRouter.put('/:id')`: branch on
        `Object.prototype.hasOwnProperty.call(req.body, 'phase')`. Non-phase bodies take the existing
        code path unchanged (same `$set`, same 404 handling, same response shape).
  - [x] Phase bodies: read the current document, compute `transitionFromPhase(existing)`, ask
        `resetOnTransition(from, body.phase)`, and wipe `getCollection('tracker_state')` with
        `deleteMany({})` when it says so — the same operation the DELETE route performs
        (`server/routes/tracker.js#L53`).
  - [x] Write the AC9 comment. Keep it factual and short; it is the thing a future reader will trust.

- [x] **Task 3 — Transaction (AC 6)**
  - [x] `getClient()` from `server/db.js`, `startSession()`, `withTransaction`. Read the seat-handover
        route's comment block at `office-seats.js#L217-250` first — it explains the retry semantics
        that make the outer-scope response capture necessary, and that reasoning applies here
        unchanged.
  - [x] Pass `{ session }` to the cycle read, the cycle update and the tracker `deleteMany`. A write
        outside the session silently escapes the transaction; this is the single easiest thing to get
        wrong here.
  - [x] Ensure the session is closed in a `finally`.
  - [x] Implement the unsupported-transaction fallback per AC6, guarded narrowly on the error MongoDB
        actually raises (do not swallow arbitrary errors into the fallback path).

- [x] **Task 4 — Client simplification (AC 7)**
  - [x] Remove the `apiDelete('/api/tracker_state')` call and its try/catch from
        `writePhase` (`cycle-views.js#L271-275`). Keep the guard, the `resetOnTransition` consult and
        the confirm dialog above it.
  - [x] Update the function's doc comment (L251-255) to describe what actually happens now. CM-5a's
        review finding D exists because two comments in this exact file stated the opposite of shipped
        behaviour; in a repo whose tests grep source text, a lying comment is how the next agent
        re-derives the wrong rule.
  - [x] Drop the now-unused `apiDelete` import at L1 if nothing else in the file uses it.
        *(KEPT: `deleteCycle`'s sibling at L182 still calls `apiDelete('/api/chapters/...')`.)*

- [x] **Task 5 — Tests (AC 4, 5, 6, 8)**
  - [x] New `server/tests/cm-4a-phase-transition-enforcement.test.js`. DB-backed suites in this repo
        use `describe.skipIf(!dbAvailable)` with `isDbAvailable()` from `tests/helpers/db-setup.js`
        (issue-1143's convention) — follow it, and read the summary line, because **a skipped suite is
        not a passing suite** (`CLAUDE.md`).
  - [x] Build the app via `createTestApp()` (`tests/helpers/test-app.js`), which already mounts
        `cyclesRouter` and `trackerRouter`; inject the ST user via the `X-Test-User` header.
  - [x] 25-pair table test (AC4), caller-independence tests (AC5), atomicity test (AC6).
  - [x] Rewrite `cm5-reset-transition.test.js#L49-80` per AC8, with the why-it-inverted comment.
  - [x] Prove-discrimination: revert the route hunk, confirm the caller-independence test goes red,
        restore. Record both runs in the Dev Agent Record.

- [x] **Task 6 — Changed-area regression (AC 8)**
  - [x] `cd server && npx vitest run tests/cm-4a-phase-transition-enforcement.test.js
        tests/cm5-reset-transition.test.js tests/cm1-cycle-phase.test.js
        tests/issue-918-cycle-tab-management.test.js tests/derive-cycle-status.test.js
        tests/api-joint-projects.test.js` — the last one because it also PUTs cycles and would surface
        an accidental regression in the non-phase path (AC1).
        *(Widened to 14 suites: every test file that reads the three changed modules or PUTs a cycle.)*
  - [x] Targeted only, per this project's standing instruction; do not run the full 171-suite sweep.

- [ ] **Task 7 — Hand-test on production (AC 10). *DEPLOY-GATED.*** *Not run and not runnable by the
      dev agent: the change is server-side, so it cannot be exercised until it reaches `main` and
      Render redeploys, and live-data verification is a human action in this project regardless. The
      script is authored above and unchanged; steps 5-8 are the ones that only pass after this story.*
- [ ] **Task 8 — PR to `main`, then merge `main` back into `dev`. *GATED on Angelus's explicit
      word.*** Never push or merge without it. *Nothing committed, pushed or merged by the dev agent;
      the working tree is left as the finished, uncommitted result.*

## Hand-test script (production, throwaway cycle, ~10 minutes)

Server-side change, so `dev` cannot exercise it (the staging frontend proxies the production API).
Run after the deploy from `main` lands.

1. Create a throwaway cycle in the Cycle tab. Leave its phase unset.
2. Confirm at least one real tracker document exists (open the tracker on any character). **Do not
   run any step below against the live chapter's cycle.**
3. Press **Game** on the throwaway. Dialog appears; accept. Tracker cards reload at defaults — the
   wipe fired, exactly as before this story.
4. Press **Prep** on the throwaway. Per `resetOnTransition('game','prep')` → false, **no dialog and no
   wipe**. Unchanged from CM-5a.
5. **The story, tested directly.** Set the throwaway back to `downtime` (Downtime button). Then, from
   a browser console on the admin app, bypass the UI entirely:
   `await (await fetch(API + '/api/downtime_cycles/<throwaway_id>', {method:'PUT', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body:JSON.stringify({phase:'game'})})).json()`
   — no dialog, no client wipe call. Reload the tracker: **it has been wiped by the server.** Before
   this story it would not have been.
6. Repeat step 5 with the throwaway in `prep` and body `{phase:'game'}` — trackers survive
   (prep→game is non-destructive; the server honours the same rule).
7. Repeat step 5 with body `{label:'renamed'}` — the label changes, trackers survive, nothing else
   moves.
8. On the throwaway, toggle a DTUX sign-off checkbox on and off. Trackers survive. (This is AC1's
   trap: `signoffPhase` writes `status`, and `deriveCycleStatus` returns `'game'` from the legacy
   ladder, so a status-keyed implementation would have wiped here.)
9. Delete the throwaway.

## Dev Notes

Every line reference below was verified against the working tree on 2026-08-16, on branch
`ms/xpl-2-historic-reconciliation` (the CM code is untouched by that branch). Re-confirm before
citing in a commit message; this repo's own history includes a source-contract regex that
false-passed against a drifted line.

### The two-call shape, exactly as it stands today

`public/js/admin/cycle-views.js#L256-283`:

```js
async function writePhase(cy, phaseOrNull) {
  if (phaseOrNull === 'game') { /* #1003 zero-submission flip warning, L257-263 */ }
  if (resetOnTransition(uiPhase(cy), phaseOrNull)) {
    const label = PHASE_LABELS[phaseOrNull];
    if (!confirm(`Setting to ${label} phase will reset the live tracker ...`)) return false;
    try { await apiDelete('/api/tracker_state'); }
    catch (err) { throw new Error('Tracker reset failed: ' + err.message); }
  }
  await setCyclePhase(cy, phaseOrNull);
  return true;
}
```

`setCyclePhase` (`public/js/downtime/db.js#L227-233`) builds the update through `buildPhaseUpdate`
(`cycle-phase.js#L157-169`) and calls `updateCycle` (`db.js#L57-59`), which is
`apiPut('/api/downtime_cycles/' + id, updates)`. The DELETE and the PUT are separate requests with no
relationship. Nothing correlates them.

### The unguarded route

`server/routes/downtime.js#L569-582`:

```js
cyclesRouter.put('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', ... });
  const { _id, ...updates } = req.body;
  const result = await cycles().findOneAndUpdate({ _id: oid }, { $set: updates }, { returnDocument: 'after' });
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', ... });
  res.json(result);
});
```

No phase awareness, no validation (`downtimeCycleSchema` is applied to the POST at L94 but **not** to
this PUT — noted in cycle-model.md §6 precondition 3 as its own hazard, out of scope here),
`cycles()` is `getCollection('downtime_cycles')` (L83).

### The sharing precedent already exists

`server/routes/downtime.js#L12`:

```js
import { CYCLE_PHASE_SEQUENCE, FEEDING_ONLY_FIELDS, openCycleVerdict, cyclePhase } from '../../public/js/downtime/cycle-phase.js';
```

`cycle-phase.js`'s own header (L1-22) declares it a "PURE MODULE: no imports, no I/O, no browser
globals. Deliberately importable by the client (db.js), the server (routes/downtime.js), and the test
suite directly, so there is exactly one implementation of the phase contract and no mirror copies to
drift." This story adds two names to that import. It is not inventing cross-tier module sharing; it is
using the thing CM-1 built for precisely this.

### The client/server from-phase divergence (AC3's real reason)

| stored fields | `uiPhase` (client, L25-28) | `cyclePhase` (server, L68-72) | →prep decision |
|---|---|---|---|
| `{phase:'game'}` | `'game'` | `'game'` | agree: no wipe |
| `{game_phase:'game', status:'closed'}` | `'game'` | `'processing'` | **disagree: server would wipe with no dialog** |
| `{status:'active'}` | `null` | `'downtime'` | agree: wipe |
| `{status:'game'}` only | `null` | `'game'` | **disagree: server would not wipe where client would** |

The second row is the dangerous direction — a wipe the ST was never warned about. The `game_phase`
override is a real legacy shape: `deriveCycleStatus` (`db.js#L87-104`) exists specifically to honour
it (#708), and `cyclePhase`'s own JSDoc admits the server "only enter[s] phase-aware branches when
`phase` is a known value, so the fallback fidelity does not matter there" — an assumption this story
invalidates, because the *from* side of a transition is exactly where a legacy document is read.

### The sign-off trap (AC1's real reason)

`deriveCycleStatus` (`db.js#L87-104`) returns `'game'` at **L102** (`if (!ps.city) return 'game'`) for
any cycle whose `prep` sign-off is set and whose `city` sign-off is not — a routine mid-cycle state.
`signoffPhase` (`db.js#L106-119`) writes that derived status to the cycle on **every sign-off toggle**
via `updateCycle(cycle._id, { phase_signoff: ps, status: newStatus })`, and `setManualOpen`
(`db.js#L127-138`) does the same for the #231 override. An implementation that computed the effective
phase before and after the `$set` and compared them would therefore wipe every character's tracker
when an ST ticks a sign-off box. The `hasOwnProperty(body,'phase')` gate is what prevents this, and it
is why AC1 forbids the "more general" alternative.

Corollary worth knowing: `buildPhaseUpdate(cycle, null, ...)` writes `phase: null` explicitly
(`cycle-phase.js#L159-166`), so a clear-to-neutral IS a phase-keyed body — and
`resetOnTransition(anything, null)` is `false` (L132), so clearing correctly never wipes. Verified
against the matrix tests at `cm5-reset-transition.test.js#L41-43`.

### The in-repo second writer

`public/js/admin/data-portability.js#L535-537`:

```js
case 'downtime_cycles':
  if (id) return apiPut(`/api/downtime_cycles/${id}`, body);
  return apiPost('/api/downtime_cycles', body);
```

The Data Portability importer PUTs whole exported cycle documents. After this story, an import that
*changes* a cycle's phase will fire the wipe rule. An import that restores the same phase will not —
`resetOnTransition(x, x)` is false for every `x` in the matrix (`→'prep'` requires
`from !== 'prep'`, `→'game'` requires `from !== 'prep'`, `→'downtime'`/`→'processing'`/`→null` are
unconditionally false), so a round-trip export/re-import is safe by construction. Flagged as an open
question below rather than silently decided.

### The cross-repo second writer (motivating evidence only — no Cockpit code changes here)

`TM Cockpit/scripts/open-dt6-game-phase.mjs`, written 2026-08-15 ~2 hours before Game 7. It connects
with `process.env.MONGODB_URI` (Cockpit's own credential, readwrite on `downtime_cycles` per
`TM Cockpit/lib/connect.mjs`) and executes:

```js
await cycles.updateOne({ _id: ObjectId.createFromHexString(DT6_ID) },
  { $set: { phase: 'game', game_phase: 'game', status: 'game' } });
```

Its own header notes the write "matches the app's OWN canonical mirror table exactly
(public/js/downtime/cycle-phase.js, PHASE_MIRROR.game) — the same {phase, game_phase, status} triple
the real 'open game phase' admin button writes via setCyclePhase(). Not an ad-hoc/partial write." That
is precisely the point: it is a *careful* second writer that got the fields exactly right and would
still have skipped the wipe entirely, because the wipe was never a property of the fields. Chapter 7
was in `downtime` phase at the time; `resetOnTransition('downtime','game')` is `true`. It was **not
run** — blocked by a permission classifier, per Cockpit commit `410c32e`. The capability, not the
event, is the evidence.

Note what this means for scope: because that script bypasses the API, **this story would not have
stopped it**. AC9 requires saying so.

### Transaction feasibility (verified, with the caveat)

- Two collections, one database, one client: `downtime_cycles` and `tracker_state` are both reached
  through `getCollection` off the single connection in `server/db.js`. MongoDB supports
  multi-document, multi-collection transactions on a replica set, which Atlas always is.
- The precedent is `server/routes/office-seats.js#L217-250` (`PUT /:seatId/holder`), whose own comment
  block is the best in-repo explanation of `withTransaction`'s retry semantics and why the response
  must be captured outside the callback and sent after the commit. `getClient()` was exported for this
  (`server/db.js#L47-52`, issue-1143).
- Size is not a concern: the bulk wipe is ~42 documents in live data (the Game 7 restore was 42
  records), far inside any transaction limit.
- **The caveat**: vitest points at `MONGODB_URI` with `MONGODB_DB` forced to `tm_suite_test`
  (`server/tests/helpers/setup-env.js`, `server/vitest.config.js`). If that URI is Atlas, transactions
  work in tests. If a developer runs against a **standalone local `mongod`** — which `CLAUDE.md` says
  several suites expect — transactions are unsupported and would throw, taking the *route*, not just
  the test, with them. Hence AC6's fallback, and hence the office-seats suites' `describe.skipIf`
  pattern being the right model for the atomicity test specifically.

### Wipe execution detail

The bulk wipe is `col().deleteMany({})` (`server/routes/tracker.js#L53`), ST/dev-guarded inline at
L51-52. The route this story changes is `requireRole('st')`, which admits `dev` as well
(`server/middleware/auth.js#L115-121`: "dev is treated as st for all access checks"), so the
authorisation surface for a wipe is unchanged in both directions — no role gains or loses the ability.

Not in scope but worth the dev agent knowing: the DELETE route broadcasts nothing over WebSocket
(contrast `broadcastTrackerUpdate` on the tracker PUT, `tracker.js#L44`, defined at `server/ws.js#L63`).
An open tab can therefore resurrect wiped state on its next write. That is CM-5a review finding K,
pre-existing, deferred to the 5b hardening pass — this story changes *where* the wipe executes, not
whether it announces itself. Do not fix it here; do not make it worse.

### What CM-5a deliberately deferred, that this story closes

CM-5a review finding I, verbatim from that story's triage table: *"DELETE precedes the phase write
with no compensation; a failed write leaves the tracker wiped and the phase unchanged (Blind H3, Edge
M4) — defer. Pre-existing shape (true of the legacy game reset too), unchanged in kind by this
story."* AC6 is that deferral being paid off, in the direction §11a cares about most (phase advances,
wipe never fires) and in the direction the review found (wipe fires, phase never advances).

## Project Structure Notes

- **Modified**: `server/routes/downtime.js` (the cycles PUT, plus one import line),
  `public/js/downtime/cycle-phase.js` (one new pure export),
  `public/js/admin/cycle-views.js` (`uiPhase` delegates; `writePhase` loses its tracker call),
  `server/tests/cm5-reset-transition.test.js` (assertions reconciled per AC8).
- **New**: `server/tests/cm-4a-phase-transition-enforcement.test.js`.
- **Untouched by design**: `server/routes/tracker.js` (the DELETE route stays exactly as it is — the
  admin UI is no longer its only caller, but its contract does not change), `public/js/downtime/db.js`
  (`setCyclePhase` remains the canonical, side-effect-free field writer — CM-5a AC5's rule survives:
  the side effect belongs to the *route*, not to the client-side writer),
  `public/js/admin/downtime-views.js` (`handleOpenGamePhase` was confirmed dead code by CM-5a's review
  and reverted then; leave it dead. If it is ever revived it inherits the server guarantee for free,
  which is the whole point of moving enforcement down a tier).
- No schema change. `downtime_cycles` documents gain and lose no fields; this story is behaviour only.
- No migration script, no dry-run/apply convention — that convention governs data migrations, and this
  is a live-route change. It does, however, inherit the project's deploy caution: server-side, so it
  must reach `main` before it can be verified anywhere.

## Open questions for Angelus (flag before dev starts)

1. **Transaction fallback on a non-replica-set Mongo.** AC6 specifies: attempt the transaction, and on
   an explicit unsupported-transactions error fall back to wipe-then-phase-write with a loud log. The
   alternative is to fail the request outright, which is more honest but would break the route for
   anyone running a standalone local `mongod`. Production is unaffected either way (Atlas is always a
   replica set). **Recommended: the fallback, as specified** — degrading to today's exact behaviour in
   dev is strictly no worse than the status quo, whereas a hard failure is a new breakage. Say if you
   would rather it hard-fail.
2. **Should the Data Portability importer trigger a wipe?** After this story, importing a cycle
   document whose `phase` differs from the live one will wipe the tracker, with no dialog (the
   importer has none). Round-trip imports are safe by construction (same phase in, no transition).
   **Recommended: leave it firing** — it is semantically correct, and an importer that could silently
   change a phase *without* the wipe is exactly the class of hole this story closes. The alternative
   is having the importer strip `phase`/`game_phase`/`status` from cycle bodies, which is a real
   behaviour change to a different feature and would want its own story.
3. **Cockpit's direct-Mongo path (out of this repo, but the decision shapes AC9's wording).** The
   permanent fix for the class is either narrowing Cockpit's Atlas credential to read-only on
   `downtime_cycles` (already flagged in Cockpit's `specs/cockpit/deferred-work.md` as "role scoping
   pending") or requiring Cockpit scripts that change phase to call TM Suite's API with an ST token
   instead of writing Mongo directly. Both are Cockpit's work, not this story's — but if you intend
   the second, the route this story hardens becomes the supported entry point and that is worth
   recording in `cycle-model.md` §11a when it is next revised.

## Dev Agent Record

**Agent:** Amelia (BMAD dev). **Date:** 2026-08-16. **Branch:**
`ms/cm-4a-phase-transition-server-enforcement`, cut from up-to-date `main`.

### Open questions — all three answered before dev started

1. **Transaction fallback:** attempt the real transaction; fall back to today's wipe-then-write
   ordering with a loud log ONLY on a genuine transactions-unsupported error. Implemented as
   `isTransactionsUnsupported()` (exported for unit test), guarded on the `code 20` /
   "Transaction numbers are only allowed on a replica set member or mongos" shape, the driver's
   `MongoCompatibilityError`, and an explicit "transactions are not supported". A `WriteConflict`, a
   timeout or any ordinary error is NOT laundered into the fallback — pinned by its own test.
2. **Data Portability importer:** yes, it fires the enforcement. No code change was needed; it PUTs
   at the same route, so it inherits the guarantee. A same-phase round-trip import is a no-op by
   construction.
3. **TM Cockpit:** out of scope entirely. Nothing outside TM Suite was read for change or touched.
   AC9's comment states the residual rather than implying the hole is closed.

### Implementation plan (as executed, red-green per task)

- **Task 1** — `transitionFromPhase(cycle)` added to `cycle-phase.js` (still zero imports; the pure
  contract is re-asserted by a test). `uiPhase` in `cycle-views.js` delegates to it and keeps only its
  label-map display guard.
- **Task 2** — one import line extended; the cycles PUT branches on an own `phase` key. Non-phase
  bodies keep the original code path verbatim (same `$set`, same 404, same `res.json(result)`, no
  session, no `tracker_state` access).
- **Task 3** — `getClient().startSession()` + `withTransaction`, response captured in outer-scope
  `statusCode`/`body` and sent after the commit, `RouteResponse` thrown for the 404 early-exit,
  `endSession()` in `finally` — the office-seats.js pattern, followed including its reasoning.
- **Task 4** — `writePhase` loses its `apiDelete('/api/tracker_state')` call; keeps the #1003 warning,
  the `resetOnTransition` consult, the confirm dialog and cancel-aborts. Doc comment rewritten to
  describe what actually happens now.
- **Task 5/6** — new suite plus four existing suites reconciled; targeted regression gate.

### Deviations and judgement calls (for the reviewer)

- **`declaresPhase()` added to `cycle-views.js` (not in the story).** `deriveCurrentCycle` filtered
  cycles on `uiPhase(c)` truthiness to mean "carries a phase". Because `uiPhase` now resolves the
  legacy `status` as well, every legacy cycle would have answered yes, its second (non-closed) branch
  would have become unreachable, and the ST's ribbon could have started naming a closed
  highest-game_number cycle where it previously named a live lower-numbered one. `declaresPhase` keeps
  that one filter asking the original question (does the document DECLARE a phase) so the ribbon's
  selection rule is untouched by this story. The phase BUTTONS deliberately do follow the new shared
  read, which is the AC3 unification.
- **Two suites beyond AC8's list also asserted the client-side DELETE and were reconciled the same
  way, not deleted:** `cm1-cycle-phase.test.js` (the CM-5a-era "exactly one DELETE inside the guard"
  assertion) and `issue-918-cycle-tab-management.test.js`. Both now assert its ABSENCE, each with a
  comment recording the inversion and pointing at the behavioural coverage.
- **`epic.708.3-cycle-phase-controls.test.js`** likewise pinned `/api/tracker_state` in
  `cycle-views.js`. Measured with and without this change: 3 failures at base, 4 with the change, 3
  after inverting that one assertion. Its other 3 failures are the documented pre-existing
  source-snippet drift (`setGamePhase`, `data-phase`, `gold2`) and are untouched.
- **`tests/cycle-phase-controls.spec.js` (Playwright) is stale at base.** Measured: 11 failed with the
  change, 11 failed without it — it still asserts the pre-CM-1 three-button, disabled-active-button
  UI. Not fixed here (out of scope), but the one test whose assertion this story inverts was rewritten
  to the new contract and a header note records the base-staleness so nobody attributes it to CM-4a.
  Worth its own cleanup story; it is not on `CLAUDE.md`'s known-failures list and should be.
- **AC4's junk-value case is `{phase:'feeding', game_phase:'prep'}`, not the story's literal
  `{phase:'feeding'}`.** Deliberate, and reviewed as correct (see the Senior Developer Review's
  DISMISS entry). A junk value that resolves to `null` cannot discriminate: `resetOnTransition(null,
  'game')` and a leaked `resetOnTransition('feeding','game')` are BOTH true, so the literal spec case
  would have passed whether the junk leaked or not. Adding a known `game_phase` makes the from-phase
  resolve to `'prep'`, and `resetOnTransition('prep','game')` is false — so the test now fails if and
  only if the junk value leaks into the matrix. Strictly more discriminating than the spec text.
- **`RouteResponse` is defined locally for the third time.** `office-seats.js`'s own comment invites a
  shared module "the first time a THIRD route needs it" — this is that route. Not lifted, because
  doing so would edit two transactional routes CM-4a otherwise leaves alone. Flagged rather than done
  silently.
- **Not done, deliberately:** no WebSocket broadcast on the server-side wipe (CM-5a review finding K,
  deferred to the 5b hardening pass — this story changes where the wipe executes, not whether it
  announces itself); no validation added to this PUT (cycle-model.md §6 precondition 3, out of scope,
  and a test pins that a junk to-phase still writes through exactly as before); `server/routes/tracker.js`
  untouched. `specs/reference-data-ssot.md` arguably now wants a line saying the cycles PUT is a second
  writer to `tracker_state`; not added because the story's Project Structure Notes do not scope it.

### Debug Log — test runs, in order

| # | Run | Result |
|---|---|---|
| 1 | Baseline, `cm1-cycle-phase.test.js` | 62/62 pass (pre-change sanity) |
| 2 | Baseline, `office-merit-dots.test.js` | 27/27 pass — **DB is reachable, so nothing in this story skipped** |
| 3 | **RED** Task 1, new suite | 9 failed / 1 passed |
| 4 | **GREEN** Task 1, new suite | 10/10 pass |
| 5 | **RED** Tasks 2+3, new suite (52 tests, DB-backed, not skipped) | 16 failed / 36 passed |
| 6 | **GREEN** Tasks 2+3, after two test-side assertion fixes | 52/52 pass |
| 7 | **RED** Task 4, `cm5` + `cm1` + `issue-918` | 3 failed / 91 passed |
| 8 | **GREEN** Task 4, same three | 94/94 pass |
| 9 | New suite + `isTransactionsUnsupported` unit tests | 55/55 pass |
| 10 | **Prove-discrimination (AC6)**: `opts` forced to `{}` so writes escape the session, ordering unchanged | atomicity test RED — `expected 'game' to be 'downtime'`, i.e. the phase committed and stayed committed. Restored, 55/55 pass |
| 11 | **Prove-discrimination (AC5)**: phase branch forced off (`if (true)`) | caller-independence RED — 2 failed / 5 passed. Restored, 55/55 pass |
| 12 | `epic.708.3` with change / at base / after reconciling | 4 failed → 3 failed at base → 3 failed after. Baseline restored |
| 13 | `tests/cycle-phase-controls.spec.js` (Playwright, chromium) with change / at base | 11 failed / 11 failed — stale at base, unchanged by this story |
| 14 | **Changed-area regression gate**, 14 suites | **298 passed, 3 failed** — the three are `epic.708.3`'s documented pre-existing source-drift failures, identical to base |

Gate command (run 14):

```
cd server && npx vitest run tests/cm-4a-phase-transition-enforcement.test.js \
  tests/cm5-reset-transition.test.js tests/cm1-cycle-phase.test.js \
  tests/issue-918-cycle-tab-management.test.js tests/derive-cycle-status.test.js \
  tests/api-joint-projects.test.js tests/api-downtime-regent-gate.test.js \
  tests/api-invitation-lifecycle.test.js tests/epic.708.2-cycle-tab-shell.test.js \
  tests/epic.708.3-cycle-phase-controls.test.js tests/epic.708.4-dt-prep-access-controls.test.js \
  tests/epic.708.5-publish-pipeline.test.js tests/epic.708.6-attendance-xp-absorption.test.js \
  tests/api-tracker-state.test.js
```

### Completion Notes

- **All ten ACs implemented; AC10's script is authored and deploy-gated, not run.** Live/production
  verification is a human action in this project and the change cannot be exercised anywhere until it
  reaches `main` (the staging frontend proxies the production API).
- **The real Mongo transaction path was exercised, not the fallback.** The vitest `MONGODB_URI`
  resolves to the Atlas replica set (DB forced to `tm_suite_test`), the atomicity test's rollback
  genuinely rolled back, and no `[cm-4a] ... transactions unsupported` warning appeared in any run.
  The fallback branch itself is covered only at the predicate level (`isTransactionsUnsupported`
  unit tests); its end-to-end path is unreachable on this machine and on production alike, by design.
- **Test coverage delivered:** 55 tests in the new suite — the full 25-pair ordered table over
  `{null, downtime, processing, prep, game}` driven off `resetOnTransition` itself, the three legacy
  document shapes, a junk-value non-leak case built to be discriminating (`{phase:'feeding',
  game_phase:'prep'}` → prep → game must NOT wipe), caller-independence including the sign-off-shaped
  body that a status-keyed implementation would have wiped on, a player 403, unchanged 400/404
  shapes, and the atomicity pair.
- **The atomicity failure is injected without any test-only hook in production code**: `vi.mock` on
  `server/db.js` makes `tracker_state`'s `deleteMany` throw, and the wipe is the last operation in the
  transaction callback, so it is by construction a failure *after* the phase write.
- **Nothing committed, pushed, merged or deployed.**

### File List

**Modified**
- `public/js/downtime/cycle-phase.js` — new pure export `transitionFromPhase`; no imports added.
- `public/js/admin/cycle-views.js` — `uiPhase` delegates; new `declaresPhase` for the ribbon filter;
  `writePhase` drops its tracker DELETE, keeps both dialogs, and names the tracker reset in the error
  it throws when a reset was due; doc comment rewritten.
- `server/routes/downtime.js` — import line extended; `RouteResponse`, `trackerState()`,
  `isTransactionsUnsupported()` (exported), `runPhaseTransition()`; the cycles PUT split into the
  unchanged generic path and the transactional phase-transition path; AC9 comment.
- `server/tests/cm5-reset-transition.test.js` — AC8 reconciliation + the new error-message assertion.
- `server/tests/cm1-cycle-phase.test.js` — same inversion, second occurrence.
- `server/tests/issue-918-cycle-tab-management.test.js` — same inversion, third occurrence.
- `server/tests/epic.708.3-cycle-phase-controls.test.js` — same inversion, fourth occurrence.
- `tests/cycle-phase-controls.spec.js` — the one inverted assertion + a base-staleness header note.
- `specs/stories/sprint-status.yaml` — row status.

**New**
- `server/tests/cm-4a-phase-transition-enforcement.test.js` (55 tests).

**Untouched, as the story requires:** `server/routes/tracker.js`, `public/js/downtime/db.js`,
`public/js/admin/downtime-views.js`, `public/js/admin/data-portability.js`, everything in TM Cockpit.

### Change Log

| Date | Change |
|---|---|
| 2026-08-16 | Story created (ready-for-dev), 10 ACs. |
| 2026-08-16 | Three open questions answered by Angelus; dev started, status → in-progress. |
| 2026-08-16 | Tasks 1-6 complete, red-green per task, prove-discrimination recorded for AC5 and AC6. Status → review. Tasks 7 (production hand-test) and 8 (PR/merge) remain gated. |
| 2026-08-16 | Internal 3-layer code review (LOCAL; Codex unavailable until 2026-08-20). 16 findings: 9 patched with prove-discrimination each, 6 deferred to `specs/deferred-work.md`, 1 dismissed. Headline: P1, a real destructive regression this story introduced via the Data Portability importer (`resetOnTransition('game','game')` is `true`, so a backup restore of a game-phase cycle wiped every live tracker). Gate re-run: 314 passed / 3 failed / 0 skipped, the 3 being `epic.708.3`'s documented pre-existing drift. Status → done. Tasks 7 and 8 still gated. |

## Senior Developer Review

**Reviewer:** Claude (internal). **Date:** 2026-08-16. **Mode: LOCAL / internal 3-layer.**
Codex / external review was unavailable until 2026-08-20, so this is not the external pass this repo
normally runs on a story of this risk shape. Record that when reading the outcome: three adversarial
layers were run, but all three were the same model family.

**Layers run:**

1. **Blind Hunter** — the diff alone, no story, no ACs. Hunts for defects a reader would find without
   knowing what the change was supposed to do.
2. **Edge Case Hunter** — the diff plus the whole repository. Walks every branching path and boundary
   in the changed code AND every caller of it, including the ones the story does not name.
3. **Acceptance Auditor** — the story spec plus two-pass verification against the author's own Dev
   Agent Record claims, including live reproduction of the recorded prove-discrimination probes.

**Outcome: 9 patched, 6 deferred, 1 dismissed.** Approved for `done`.

### Patched (blocking, all landed and green)

Every patch carries a prove-discrimination result: that fix alone was temporarily reverted, the
specific test was confirmed red for the right reason, and the revert restored (`git diff` clean).

**P1 — [HIGH] False safety claim, and a NEW destructive path this story introduced.**
The route's AC9 comment claimed `resetOnTransition(x, x)` is false for every `x`, so a same-phase
importer round-trip is "safe by construction". It is false for every `x` **except `'game'`** —
`resetOnTransition('game','game')` is `true`, because entering game from anywhere but prep is the
legacy reset (`public/js/downtime/cycle-phase.js`, `resetOnTransition`). The admin Data Portability
importer PUTs a whole exported cycle body, `phase` included, at this route
(`public/js/admin/data-portability.js`, the `downtime_cycles` case). So re-importing a backup of a
cycle sitting in game phase — the phase a cycle is in on a game night — silently wiped every
character's live `tracker_state`, with no confirmation dialog anywhere on that path. Pre-story the
importer never touched `tracker_state` at all: this was a regression the story created.
*Fix:* the importer strips the mirror trio (`phase`/`game_phase`/`status`) from its restore PUT, via
a new pure `withoutPhaseFields` in `cycle-phase.js` (which `buildPhaseUpdate` now also uses, so the
trio is named once). POST is deliberately left alone — a create is not a transition, reaches no wipe,
and stripping there would drop the `status` a new document legitimately needs. The route comment now
states the `'game'` exception explicitly instead of the false universal claim.
*Prove-discrimination:* strip reverted → **2 red**, including the DB-backed end-to-end
(`expected +0 to be 2` — the live tracker genuinely destroyed by a restore). Restored, green.

**P2 — [MEDIUM] The `uiPhase` widening broke the phase-button toggle on legacy status-only cycles.**
AC3 widened `uiPhase` to fall through to `statusToPhase(status)`, correctly, for the
transition/dialog decision. It was also left feeding `buildPhaseCell`'s own active-class and
toggle-target computation. On a real legacy shape — `{status:'active'}`, no phase fields at all —
`uiPhase` resolves to `'downtime'`, so the Downtime button rendered active and clicking it wrote
`phase: null` (a clear) instead of `phase: 'downtime'`; and because the re-derived status stayed
`'active'` the button re-lit immediately, making `downtime` **impossible to set on that cycle from
the UI at all**. Same shape for `status:'closed'`→Processing and `status:'game'`→Game.
*Fix:* the story's own `declaresPhase` was already the right reader for "does this document declare a
phase". It is now `declaredPhase(cy)` (returning the value, with `declaresPhase` as its boolean
wrapper) and drives the buttons through a new exported `phaseToggleTarget(cy, phase)`. The widened
`uiPhase`/`transitionFromPhase` reader feeds the wipe/dialog decision only.
*Deviation from the suggested test:* this project has no jsdom, so "render through `buildPhaseCell`
and click" is not reachable from a unit test. Per the oxp.5 convention the decision is exported and
driven directly instead, with a source assertion pinning that `buildPhaseCell` uses it and no longer
mentions `uiPhase`.
*Prove-discrimination:* `phaseToggleTarget` reverted to `uiPhase` → **red**,
`expected null to be 'downtime'`. Restored, green.

**P3 — [test quality] AC6's atomicity test did not discriminate on the fallback path.**
On a standalone `mongod` (fallback ordering: wipe first, no session) the injected `deleteMany`
failure throws *before* the phase write happens at all, so both "phase unchanged" and "tracker
intact" pass vacuously — proving nothing about atomicity.
*Fix:* the injected mock now records the `deleteMany` arguments, and the test additionally asserts
(a) the wipe was called exactly once **with a `session` option**, and (b) no
`[cm-4a] ... transactions unsupported` warning was logged during that test.
*Prove-discrimination:* route forced onto the fallback (`runPhaseTransition(oid, updates, null)`) →
**red on the new assertion only** (`expected undefined to be truthy`), with the two original
assertions passing exactly as predicted. Restored, green.

**P4 — [test quality] AC7's "names the tracker reset" test asserted prose, not behaviour.**
It sliced `writePhase`'s source and regex-matched `/tracker reset/i` — satisfied by the function's own
doc comment, so deleting the entire try/catch rethrow would still have passed.
*Fix:* rewritten as a driven test. `writePhase` is exported, `public/js/data/api.js` is mocked (its
only non-pure dependency, reached directly and via `downtime/db.js`), the phase PUT is made to
reject, and the real surfaced error is read. Two further cases added: a non-destructive transition
must NOT invent a tracker-reset message, and cancelling the dialog must abort before any write.
*Prove-discrimination:* try/catch deleted → **red**,
`expected [Function] to throw error matching /tracker reset/i but got '502 Bad Gateway'`. Restored,
green.

**P5 — [test quality] Self-defeating "no second resolution order" assertion.**
It forbade the literal string `'cy.phase || cy.game_phase'`, and was satisfied only by an accident of
syntax: `declaresPhase` **is** a second resolution order, written with optional chaining, and slipped
past the pattern.
*Fix:* rewritten to what it always meant — exactly ONE inline `phase || game_phase` resolution in
`cycle-views.js`, which must live inside the named `declaredPhase` — plus an assertion that
`declaredPhase` never grows a `status` fallback (which would make it indistinguishable from `uiPhase`
and resurrect P2). The second reader is now disclosed as the one sanctioned, named, single-instance
exception, with the reason, and (post-P2) it has a real job.
*Prove-discrimination:* a second inline reader added to `cycle-views.js` → **red**,
`expected length 1, received 2`. Removed, green.

**P6 — [Low] Dead branch, plus a vacuous assertion.**
(a) `isTransactionsUnsupported` carried a code-20-**and**-message check immediately above an
identical message-only check, so the first could never be the deciding return. Simplified away.
(b) The same suite's `expect(ROUTE).not.toMatch(/toPhase\s*===/)` matched no identifier the route has
ever contained (its variable is `updates.phase`), so it would have passed against any
reimplementation of the matrix. Replaced with patterns matching what an inlined matrix would actually
look like here.
*Prove-discrimination:* (a) two new assertions pin that the guard decides on the **message**, not the
code — code 20 with a different message → `false`, the message with no code → `true` — making the
simplification provably behaviour-neutral. (b) an inline `updates.phase === 'game'` added to the
route → **red**. Restored, green.

**P7 — [Low, wording] Overclaimed comment.**
`writePhase`'s doc comment said client and server "cannot disagree" because they read the same
reader. True of the reader, false of the data: `cy` is a cached row object and the Cycle tab holds no
WebSocket subscription, so a concurrent writer between page load and click can make the dialog stale
in either direction.
*Fix:* wording only. The comment now states what is actually guaranteed — the server's enforcement is
authoritative regardless of what the client showed or whether it showed anything, so a stale dialog
is a UX-accuracy risk and not a data-safety one — and points at D2. No behaviour change; the full
re-fetch-before-dialog fix is deliberately deferred.

**P8 — [Low, docs] SSOT gap.**
`specs/reference-data-ssot.md` documented `DELETE /api/tracker_state` as the deletion path for
`tracker_state` and did not mention that `PUT /api/downtime_cycles/:id` can now delete every document
in that collection as a side effect of a phase-changing write.
*Fix:* one paragraph under the collections table, in the file's own terse style, naming the trigger
condition, the auth (unchanged, ST/dev, same as the DELETE), the no-`phase`-no-touch rule, and the
P1 importer strip.

**P9 — [Low, docs] `CLAUDE.md` known-failures list.**
`tests/cycle-phase-controls.spec.js` is entirely pre-existing-stale (it still asserts the pre-CM-1
three-button, disabled-active-button UI) and was not on the list.
*Fix:* added, matching the section's bullet style. Re-measured during this review, **including after
P2 — which touches exactly that UI: 11 failed with the change, 11 failed at base.**

**One additional reconciliation, not on the triage list**, surfaced by P2 and handled the way AC8
handled its own inversions: `issue-918-cycle-tab-management.test.js`'s "phase toggle clears to
neutral" pinned the literal source expression `(uiPhase(cy) === phase) ? null : phase`, which P2
changed. That assertion's shape has now drifted three times (#918 hardcoded it, CM-1 moved it to
`uiPhase`, this review moved it to `declaredPhase`) and CM-1 left it red once already, reaching
production unnoticed. It is rewritten as **behaviour** — driving `phaseToggleTarget` directly — with a
comment recording why, rather than re-pinned to a fourth source snippet that will drift again.

### Deferred (written to `specs/deferred-work.md`)

New section: `## Deferred from: code review of cm-4a-phase-transition-server-enforcement (2026-08-16,
internal 3-layer review)`. Each entry there carries file:line, severity, trigger, and why it was not
fixed.

- **D1 [Medium]** — a bare legacy `status:'game'` now suppresses a wipe that used to correctly fire,
  because `statusToPhase` maps it straight to phase `'game'` while this codebase's own documented
  "three meanings of prep" ambiguity means the same value can mean "prep signed off, city not".
  Deferred: disambiguating a bare `status` is a phase-model design decision belonging with
  CM-2/CM-2b/CM-4 (`cycle-model.md` §11a), and the one concrete historical example on record is an
  archived closed cycle, not a live hazard.
- **D2 [Low]** — the stale client cache behind P7. A re-fetch before the dialog, or a response field
  reporting whether a wipe actually fired, would close it properly. Deferred: the data-safety
  property this story exists to deliver is already correct without it.
- **D3 [Low]** — a player tracker write racing the wipe's commit window. **Confirmed pre-existing**
  (the old client-side DELETE had the identical race), so not a regression from this story; belongs
  with the 5b tracker-hardening pass alongside CM-5a finding K.
- **D4 [Low]** — dead `handleOpenGamePhase` would wipe with no tracker-specific warning if revived.
- **D5 [Low]** — fallback-path 404 following a completed wipe. Dev-environment only (the fallback
  never runs on Atlas), microsecond window.
- **D6 [Low]** — unguarded `startSession()`/`endSession()` edge failures. Narrow driver-level cases;
  this project's stated convention is not to engineer around scenarios that cannot happen in practice.

### Dismissed (no action)

- **AC4's junk-value case uses `{phase:'feeding', game_phase:'prep'}`, not the story's literal
  `{phase:'feeding'}`.** Not a defect — a deliberate and strictly **better** substitution. The literal
  spec case resolves to `null`, and `resetOnTransition(null,'game')` is `true` exactly as a leaked
  `resetOnTransition('feeding','game')` would be, so it cannot distinguish "correctly ignored" from
  "leaked and coincidentally still wiped". Adding a known `game_phase` resolves the from-phase to
  `'prep'`, where the correct answer is "no wipe" and the leaked answer is "wipe" — so the test now
  discriminates. The Deviations section above has been updated to record this accurately.

### Verification

Changed-area regression gate — the 14 suites the dev pass used, plus the new importer suite:

```
cd server && npx vitest run tests/cm-4a-phase-transition-enforcement.test.js \
  tests/cm-4a-importer-phase-strip.test.js tests/cm5-reset-transition.test.js \
  tests/cm1-cycle-phase.test.js tests/issue-918-cycle-tab-management.test.js \
  tests/derive-cycle-status.test.js tests/api-joint-projects.test.js \
  tests/api-downtime-regent-gate.test.js tests/api-invitation-lifecycle.test.js \
  tests/epic.708.2-cycle-tab-shell.test.js tests/epic.708.3-cycle-phase-controls.test.js \
  tests/epic.708.4-dt-prep-access-controls.test.js tests/epic.708.5-publish-pipeline.test.js \
  tests/epic.708.6-attendance-xp-absorption.test.js tests/api-tracker-state.test.js
```

**314 passed, 3 failed, 0 skipped** (298/3 before this review; +16 net new tests). The three failures
are `epic.708.3`'s documented pre-existing source-snippet drift (`setGamePhase`, `data-phase`,
`gold2`), identical to base. **Nothing skipped** — the DB was reachable for every run, so every
DB-backed suite genuinely executed (`CLAUDE.md`: a skipped suite is not a passing suite).

Playwright: `tests/cycle-phase-controls.spec.js` re-measured after P2 — **11 failed, identical to
base**, now documented in `CLAUDE.md` per P9.

### Files changed by this review

- `public/js/downtime/cycle-phase.js` — new pure exports `PHASE_FIELDS` and `withoutPhaseFields`;
  `buildPhaseUpdate` reuses the latter so the mirror trio is named once. Still zero imports.
- `public/js/admin/data-portability.js` — the cycle-restore PUT strips the mirror trio (P1);
  `writeJsonDoc` exported for direct test drive.
- `public/js/admin/cycle-views.js` — `declaresPhase` → `declaredPhase` plus a boolean wrapper; new
  exported `phaseToggleTarget`; `buildPhaseCell` drives its buttons off it (P2); `writePhase`
  exported (P4); the "cannot disagree" comment softened (P7).
- `server/routes/downtime.js` — AC9 comment corrected on the `'game'` exception (P1);
  `isTransactionsUnsupported` dead branch removed (P6).
- `server/tests/cm-4a-phase-transition-enforcement.test.js` — session-path assertions (P3), rewritten
  second-reader assertion (P5), real matrix-reimplementation patterns and the message-not-code
  assertions (P6), driven `phaseToggleTarget` suite (P2).
- `server/tests/cm5-reset-transition.test.js` — driven `writePhase` error-surface suite (P4).
- `server/tests/issue-918-cycle-tab-management.test.js` — toggle assertion rewritten as behaviour.
- **New:** `server/tests/cm-4a-importer-phase-strip.test.js` (P1, 5 tests, including a CONTROL case
  proving the unstripped body really does wipe a live tracker).
- `specs/reference-data-ssot.md` (P8), `CLAUDE.md` (P9), `specs/deferred-work.md` (D1-D6).

**Nothing committed, pushed, merged or deployed.** Tasks 7 (production hand-test) and 8 (PR) remain
gated on Angelus's explicit word.

## References

- [Source: D:\Terra Mortis\cycle-model.md#L310-372] — §7, phase-as-data, the legacy-mirror table, and
  the "one writer, enforced — not conventional" panel condition this story extends from fields to
  invariant.
- [Source: D:\Terra Mortis\cycle-model.md#L485-609] — §11a: the Game 7 incident record, the
  second-writer finding, CM-4a's own justification, the revised sequencing that puts this story first,
  and the closing note assigning the Cockpit script's disposal to Cockpit.
- [Source: specs/stories/sprint-status.yaml#L925-931] — the `epic-cm` block and this story's own
  `cm-4a-phase-transition-server-enforcement` row.
- [Source: specs/stories/cm5-tracker-reset-to-prep.story.md] — the predecessor: AC5's
  "`setCyclePhase` stays the only writer" rule, review findings A/D/I/K, and the carry-over path trace
  this story relies on rather than re-deriving.
- [Source: server/routes/downtime.js#L12,L83,L569-582] — the shared-module import line, the `cycles()`
  collection helper, and the unguarded generic PUT this story hardens.
- [Source: public/js/downtime/cycle-phase.js#L1-22,L48-56,L68-72,L123-133,L157-169] — the pure-module
  contract, `statusToPhase`, `cyclePhase`, `resetOnTransition` (the predicate to reuse), and
  `buildPhaseUpdate` (which proves a clear-to-neutral is a phase-keyed body).
- [Source: public/js/admin/cycle-views.js#L1-3,L25-28,L251-283] — the imports, `uiPhase`, and
  `writePhase`'s current two-call shape.
- [Source: public/js/downtime/db.js#L57-59,L87-104,L106-119,L127-138,L227-233] — `updateCycle`,
  `deriveCycleStatus` (L102 is the sign-off trap), `signoffPhase`, `setManualOpen`, `setCyclePhase`.
- [Source: public/js/admin/data-portability.js#L535-537] — the in-repo second writer at the same route.
- [Source: server/routes/tracker.js#L10-15,L44,L49-55] — `canAccess`, the PUT's WS broadcast, and the
  ST/dev bulk-wipe DELETE.
- [Source: server/middleware/auth.js#L109-127] — `requireRole('st')` admits `dev`, matching the DELETE
  route's own rule.
- [Source: server/routes/office-seats.js#L200-250] — the in-repo `withTransaction` precedent, including
  the retry-semantics comment AC6 requires reading.
- [Source: server/db.js#L47-52] — `getClient()`, exported by issue-1143 for exactly this.
- [Source: server/tests/cm5-reset-transition.test.js#L17-43,L49-95] — the matrix tests that stay, and
  the client-wiring assertions AC8 rewrites.
- [Source: server/tests/helpers/db-setup.js, server/tests/helpers/test-app.js,
  server/vitest.config.js, server/tests/helpers/setup-env.js] — `isDbAvailable`/`describe.skipIf`, the
  test app that already mounts both routers, and the `tm_suite_test` forcing that makes the transaction
  caveat in Dev Notes real.
- [Source: public/js/tabs/feeding-tab.js#L964] — the ST Confirm Feed tracker write; the carry-over path
  this story explicitly does not touch.
- [Source: TM Cockpit/scripts/open-dt6-game-phase.mjs (sibling repo, read-only evidence)] — the
  never-executed direct-Mongo phase flip; motivating evidence only, no change scoped here.
- [Source: CLAUDE.md — Running & Testing, Branching, Deployment] — targeted-suite convention, the
  skipped-is-not-passing rule, branch-from-`main`/PR-to-`main`, and why a server change cannot be
  smoke-tested on `dev`.
