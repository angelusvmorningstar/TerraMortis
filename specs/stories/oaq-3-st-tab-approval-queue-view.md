---
id: oaq.3
epic: oaq
epic_file: specs/epic-oaq-office-approval-queue.md
status: done
priority: high
type: feature
depends_on: [oaq.2]
branch: ms/oaq-3-st-tab-approval-queue-view
---

# Story OAQ.3: New ST tab — approval queue view

As a Storyteller running Terra Mortis,
I want a dedicated admin tab listing every pending Status Action with one-click accept/decline,
so that I can action the sign-off queue oaq.2 built without resorting to raw HTTP calls, and so
that two Storytellers working the queue at once never both act on the same request.

## Why this story exists

oaq.2 built the full pending-lifecycle backend (submit → pending → ST accept/decline, all
code-reviewed and hardened) but explicitly scoped the ST-facing surface out — its own "What this
story is NOT" states: "NOT a UI for STs to browse/approve — that's oaq.3." Right now, resolving a
pending Status Action requires a raw `PUT` (curl/Postman/similar); oaq.2's own internal review
flagged that as shipped, "a submitted Status Action has no in-app path to ever be accepted or
declined... the feature is currently inert for real STs." This story builds that surface.

## Decisions already made (do not re-litigate)

- **Pending-first sort.** The epic requires the queue not get buried under volume once Epic ROLLS
  (if activated) lands in the same tab — oldest pending request surfaces first (`created_at: 1`
  sort), not newest-first.
- **A GET endpoint for pending records does not exist yet and must be added.** Confirmed by reading
  both `office-actions.js` (its `GET /` only ever reads the *applied* log, by its own comment) and
  `contested-rolls.js` (its only `GET /mine` is player-identity-scoped, not ST-facing). Add
  `GET /api/office_actions/pending` (ST-role only) to `office-actions.js` — it already owns
  `pendingCol()`, `_findPending`, and the ST-role gate for this record family.
- **`accept()`/`decline()` must additively capture WHICH ST resolved a record.** Neither currently
  records actor identity (`req.user.username` is available via `requireRole('st')`, confirmed in
  `server/middleware/auth.js`) — without this, the epic's own explicit requirement ("already
  actioned by [ST]" refresh state) cannot be satisfied. This is the **only** change to
  `office-actions.js`'s accept/decline logic this story makes — do not touch the transaction,
  budget, or precondition logic oaq.2 already built and code-reviewed. Add `resolved_by` (accept)
  / `declined_by` (decline), both `req.user.username`, alongside the existing `$set` in each route.
- **Refresh mechanism: 10-second poll against the new GET endpoint**, mirroring the existing
  pattern in `public/js/game/challenge-notification.js` (`POLL_MS = 10_000`, same
  `contested_roll_requests` collection family, already proven in this codebase). **No WebSocket
  broadcast is required.** Race safety already exists independently of the poll: both
  `office-actions.js`'s `_findPending` and `contested-rolls.js`'s `_findChallenge` already reject
  with `409 CONFLICT` if `status !== 'pending'` by the time a mutating `PUT` lands (built and
  tested under oaq.2) — the poll is purely for UI freshness (a resolved row disappearing without a
  manual reload), not for correctness.
- **Admin tab wiring follows the existing 3-part pattern exactly**, modelled on
  `public/js/admin/st-mods-audit.js` — **not** `ordeals-admin.js`'s older per-render `bindEvents`
  approach. One delegated `click`/`change` listener bound once at scaffold time, dispatching on
  `data-*` attributes (project convention — see `st-mods-audit.js:11-16`'s own comment citing this
  exact rationale: static review cannot catch ad-hoc listeners, and per-render `addEventListener`
  silently no-ops on repeat paints).
- **Reuse existing CSS, invent nothing new**: base button `.dt-btn`; accept/decline pair from
  `.ch-btn-accept`/`.ch-btn-decline` (`challenge-notification.js`'s existing accept/decline UI for
  this exact collection, just the player-facing case — reuse its styling for the ST case) — or the
  toggle-style `.dt-appr-approved`/`.dt-appr-rejected` if that reads better once built, dev's
  judgement; status badges from the `.dt-status-approved`/`.dt-status-rejected` /
  `.or-status-badge` pattern; list layout from `.or-list`/`.or-list-item`/`.or-list-heading`/
  `.or-list-summary` (`ordeals-admin.js` precedent — the layout shape, not its listener pattern).
- **`public/js/tabs/office-tab.js` is NOT part of the admin app** — it is the player-facing Office
  tab, wired into `public/js/app.js`, not `admin.js`. Do not confuse it with the admin tab pattern;
  it is irrelevant to this story's mounting mechanism and is not touched by this story.

## What this story is NOT

- NOT Epic OXP itself (the XP-spend approval item type) — only Status Actions populate the queue
  for now. Shape the list-rendering code so it does not hardcode an assumption that
  `request_type` is always `'status_action'` at the DISPLAY layer (a `request_type`-keyed label/
  renderer lookup rather than a single fixed template is enough forward-shape; do not build a
  second item type or its handling now).
- NOT Epic ROLLS (dice roll logging) — a separate epic that may eventually share this tab. Do not
  let its scope bleed in.
- NOT a change to `accept()`/`decline()`'s transaction, budget-claim, or precondition logic — oaq.2
  already built and code-reviewed all of that. This story's only route-layer change is the
  additive `resolved_by`/`declined_by` field capture described above.
- NOT a WebSocket broadcast for instant push — polling is sufficient and in-pattern; a
  `broadcastOfficeActionUpdate` (mirroring `broadcastCatalogueUpdate` in `server/ws.js`) would be a
  small, in-pattern future enhancement, but is not required or built here.
- NOT a change to `public/js/tabs/office-tab.js` (the player-facing Office tab) — different file,
  different app surface, out of scope.

## Acceptance Criteria

1. `GET /api/office_actions/pending` (ST-role only, `requireRole('st')`) returns every
   `contested_roll_requests` document with `request_type: 'status_action'`, `status: 'pending'`,
   sorted oldest-first (`created_at: 1`).
2. A new admin tab lists every pending Status Action from AC1: actor name, target name, a
   human-readable action-type label (raise / lower / grant first dot / strip last dot), and
   submission time.
3. Each row has Accept/Decline buttons calling the existing, unchanged
   `PUT /api/office_actions/:id/accept` / `:id/decline` routes.
4. `accept()` and `decline()` are extended (additive only, per the decision above) to set
   `resolved_by` / `declined_by` = `req.user.username` on the pending record.
5. Given two STs are both viewing the queue and one resolves a row before the other's next poll,
   the second ST's next accept/decline attempt on that same row gets a clear "already actioned by
   `<username>`" message — the existing `409 CONFLICT` response, its `message` enriched to include
   the `resolved_by`/`declined_by` value now being captured — not a generic/unlabelled conflict.
6. The queue refreshes automatically (10-second poll, mirroring `challenge-notification.js`) so a
   row resolved by another ST (or by this ST in another tab) disappears without a manual reload.
7. Empty state: the tab shows a clear "nothing pending" message when `GET /pending` returns `[]`.
8. All new UI reuses existing component classes per the decisions above — no ad-hoc styles, no new
   hex/`rgba()` literals, no inline `style="..."` (project `CLAUDE.md` hard requirement, restated
   in `specs/project-context.md`).
9. Real behavioural test coverage: Supertest coverage (against the mounted app + `tm_suite_test`)
   for `GET /pending` and the `resolved_by`/`declined_by` capture on accept/decline; static-analysis
   wiring coverage for the admin tab registration (sidebar button, domain section, `admin.js`
   dispatch), matching this project's own established pattern for admin-tab wiring tests — see Dev
   Notes.

## Tasks / Subtasks

- [x] Task 1 — `GET /api/office_actions/pending` + `resolved_by`/`declined_by` capture (AC: 1, 4, 5)
  - [x] Added the route in `server/routes/office-actions.js`, near `GET /latest_session`. ST-role
        gated. Query: `{ request_type: 'status_action', status: 'pending' }`, sort
        `{ created_at: 1 }`.
  - [x] `PUT /:id/accept`'s `$set` (inside the existing transaction) now sets
        `resolved_by: req.user.username`; included in the response `request` body.
  - [x] `PUT /:id/decline`'s `$set` now sets `declined_by: req.user.username`.
  - [x] `_findPending`'s 409 response (shared by both routes) now includes `resolved_by`/
        `declined_by` and an enriched `message` ("...already resolved by X") when the record is no
        longer pending.

- [x] Task 2 — Admin tab scaffold (AC: 2, 7, 8)
  - [x] `public/admin.html`: added the sidebar button (`data-domain="office-approvals"`, no
        collision — no `office`-prefixed domain existed) and the matching
        `<section id="d-office-approvals" class="domain">` + inner mount `<div>`. No
        `.domain-header` wrapper (matches `st-mods-audit`'s precedent exactly — that module renders
        its own `<h2>` inside its scaffold, so a wrapper would double the heading).
  - [x] `public/js/admin.js`: imported `initOfficeApprovals`, added one dispatch line inside
        `switchDomain`, right after the `city` domain (contextually adjacent — office/court
        actions).
  - [x] New file `public/js/admin/office-approvals.js`: `initOfficeApprovals(rootEl)` entry point
        (no `chars` param — this tab has no character-filter UI, so accepting-and-ignoring it would
        be dead parameter weight). Scaffold + one delegated click listener bound once at scaffold
        time.

- [x] Task 3 — List render + accept/decline + poll refresh (AC: 2, 3, 5, 6, 7)
  - [x] Fetches `GET /api/office_actions/pending` on mount and every 10s (`setInterval`,
        `POLL_MS = 10_000`). No explicit teardown hook exists anywhere in this codebase for any
        admin module (confirmed: `switchDomain` never unmounts a section, only toggles `.active`),
        so instead of inventing one, the poll tick itself checks
        `_rootEl.closest('.domain').classList.contains('active')` and skips the fetch when this
        tab isn't the visible one — avoids wasted requests without new infrastructure.
  - [x] Reused `.or-list`/`.or-list-item`/`.or-list-name`/`.or-status-badge` (ordeals-admin
        precedent) for row layout; `.stm-audit-root`/`.stm-audit-head`/`.stm-audit-sub`/
        `.stm-audit-loading`/`.stm-audit-empty` (found in `components.css`, not `admin-layout.css`
        — st-mods-audit's own scaffold styling) for the outer shell — a stronger reuse than the
        story's own suggestion of `.ch-btn-accept`/`.ch-btn-decline`, which turned out to live in
        `suite.css`, a stylesheet `admin.html` never loads (confirmed via its `<link>` tags) and
        would have rendered unstyled in the admin app. Accept uses `.dt-btn .dt-btn-gold`
        (existing positive-action modifier); Decline needed a genuinely new class — none of this
        codebase's "approve/reject" classes fit (`.dt-appr-approved`/`.dt-appr-rejected` are
        `.active`-gated TOGGLE-state indicators, not one-shot action buttons) — added
        `.dt-btn-danger` to `admin-layout.css`, grouped with the other `.dt-btn-*` modifiers,
        mirroring `.btn-danger`'s existing crimson-token treatment exactly (sanctioned by
        `specs/project-context.md`: "If the needed style does not exist as a class, add it... using
        tokens"). Also added `.oaq-row-actions`/`.oaq-row-error` (structural layout only, no
        colour/font literals) grouped next to `.or-list-item`.
  - [x] Delegated handler: Accept/Decline click → `PUT` the corresponding route; on success, row
        removed from local state; on `409`, the enriched "already actioned by X" message (Task 1)
        renders inline via `.dt-error-msg`.
  - [x] Empty state ("Nothing pending.") via `.stm-audit-empty`.

- [x] Task 4 — Test coverage (AC: 9)
  - [x] `server/tests/oaq-3-approval-queue.test.js`: Supertest coverage for `GET /pending`
        (sorted, scoped, ST-gated) and `resolved_by`/`declined_by` capture (including the enriched
        409 body) — 7 DB-backed tests (**correction, external review**: the original write-up
        transposed this count with the wiring count below).
  - [x] Admin-tab wiring: static-analysis assertions folded into the same file, mirroring
        `issue-873-ecm-6-admin-sidebar.test.js`'s structure exactly — sidebar button, domain
        section, import, dispatch, module file shape, delegated-listener-count check, reused-class
        check, no inline `style=` check — 11 tests. 18/18 total in this file (post-review: 22, after
        the review round's own added regression tests — see Senior Developer Review).

- [x] Task 5 — Full regression + review prep
  - [x] Changed-area regression: `oaq-3-approval-queue.test.js` +
        `oaq-2-pending-status-actions.test.js` + `issue-1143-office-actions-auth-safety.test.js` +
        `otc-2-office-actions-api.test.js` + `feature.691.hos-city-status-power.test.js` +
        `issue-873-ecm-6-admin-sidebar.test.js` — **100/100 pass**. The new sidebar button does not
        collide with or break the existing Equipment Catalogue wiring assertions there.
  - [x] Confirmed `resolved_by`/`declined_by` additions do not break any existing oaq.2 test's
        assertions — all of `oaq-2-pending-status-actions.test.js` (16 tests, checks `status`/
        `outcome`, not full-body equality) still passes unchanged.

## Dev Notes

### Current state of the files this story touches (read in full before starting)

- `server/routes/office-actions.js` — 358 lines as of oaq.2's final committed state (`ab8145ad`).
  `GET /latest_session` (:96-99), `GET /` (:101-112, applied log only), `POST /` (submission),
  `PUT /:id/accept` (:240-336, full transaction — actor/target load, `court_category` re-check,
  `computeNewStatus`, budget claim, CAS write, `office_actions` log insert, pending record resolved
  with `outcome: { old_status, new_status }`), `PUT /:id/decline` (:342-355, simple status flip).
  `_findPending` (:80-91) is the shared lookup+pending-guard both accept/decline call — this is
  where the 409 enrichment for Task 1 most naturally lives, or read the stale doc directly in each
  route's own 409 branch — dev's call on the cleanest shape.
- `server/routes/contested-rolls.js` — untouched by oaq.2 except the `request_type` guards added
  during its review round; not otherwise relevant to this story except as the origin of the
  `.ch-btn-accept`/`.ch-btn-decline` UI pattern (`public/js/game/challenge-notification.js`) worth
  reusing.
- `public/admin.html` / `public/js/admin.js` — read the `equipment-catalogue` and `st-mods-audit`
  domain wiring in both files in full before writing the new tab; copy the pattern, don't
  reinvent it.
- `public/js/admin/st-mods-audit.js` — read in full; this is the structural template for the new
  module (delegated-handler scaffold, `initXxx(rootEl, chars)` signature).
- `public/js/admin/ordeals-admin.js` — read for the **layout classes only**
  (`.or-list`/`.or-list-item`/`.or-list-heading`/`.or-list-summary`/status badges); do **not**
  copy its per-render `bindEvents` listener pattern (superseded by `st-mods-audit.js`'s approach —
  see the decision above).
- `public/js/game/challenge-notification.js` — read in full for the poll pattern
  (`POLL_MS = 10_000`) and the `.ch-btn-accept`/`.ch-btn-decline` button styling, both directly
  reusable precedent for the same collection family.
- `server/middleware/auth.js` — confirms `req.user.username` is populated by the time any
  `requireRole('st')`-gated route runs (:22-73).

### Files this story touches (final)

- `server/routes/office-actions.js` — UPDATE. New `GET /pending` route; additive
  `resolved_by`/`declined_by` capture in `accept`/`decline`; 409 body enrichment.
- `public/admin.html` — UPDATE. New sidebar button + domain section.
- `public/js/admin.js` — UPDATE. Import + one dispatch line.
- `public/js/admin/office-approvals.js` — NEW. Tab module.
- `server/tests/oaq-3-approval-queue.test.js` — NEW.
- `public/css/admin-layout.css` — UPDATE. `.dt-btn-danger` (grouped with the other `.dt-btn-*`
  modifiers, mirrors `.btn-danger`'s existing token treatment) and `.oaq-row-actions`/
  `.oaq-row-error` (grouped with `.or-list-item`, structural only).

### Testing standards (reaffirmed from oaq.2 / issue-1143)

Real behavioural Supertest coverage against the mounted app + `tm_suite_test` for anything
server-side; static-analysis source-text assertions for admin-tab wiring specifically, since this
project has no browser harness for the admin app (`issue-873-ecm-6-admin-sidebar.test.js`'s own
stated rationale — cite it, don't re-derive it). `server/tests/helpers/test-app.js` already mounts
`officeActionsRouter` — no new mounting needed for Task 4's Supertest coverage.

## Project Context Reference

`specs/project-context.md`, `CLAUDE.md` HARD RULE: never push/merge without explicit instruction
this session. CSS: reuse tokens/classes, never invent (`specs/project-context.md` §1).

## Dev Agent Record

### Implementation summary

`GET /api/office_actions/pending` added (ST-only, oldest-first, scoped to `request_type:
'status_action', status: 'pending'`). `accept()`/`decline()` additively capture `resolved_by`/
`declined_by` (`req.user.username`); the shared `_findPending` 409 path now names who already
actioned a stale record. A new admin tab (`office-approvals.js`) lists the queue, polls every 10s
(skipped while the tab isn't the active domain — no teardown hook exists anywhere in this codebase
to stop polling on switch-away, so the poll tick itself checks the `.active` class instead of
inventing new infrastructure), and resolves rows via the existing accept/decline endpoints through
a single delegated click listener.

### Deviations from the story's own suggested CSS reuse

The story suggested `.ch-btn-accept`/`.ch-btn-decline` as a fallback for the Accept/Decline
buttons. Verified during Task 3 that these live in `suite.css`, which `admin.html` never loads
(confirmed via its `<link>` tags — only `theme.css`/`components.css`/`admin-layout.css`/
`admin-shared.css`/`admin-spheres.css`) — using them would have rendered the buttons unstyled.
Used `.dt-btn .dt-btn-gold` for Accept instead. For Decline, the story's other suggestion
(`.dt-appr-approved`/`.dt-appr-rejected`) turned out to be `.active`-gated TOGGLE-state indicators
by their own CSS shape — not a semantic fit for a one-shot action button (**correction, external
review**: the original write-up additionally claimed these classes were "used elsewhere for a
persistent approved/rejected/modified/pending selector"; verified this claim is FALSE — only bare
CSS definitions exist, zero JS/HTML call sites anywhere in the codebase, i.e. dead CSS. The
underlying reasoning — `.active`-gated toggle styling is a poor fit for a one-shot button — still
holds on the CSS shape alone and doesn't depend on the false usage claim) — added `.dt-btn-danger`
to `admin-layout.css` instead, mirroring the
existing `.btn-danger` class's crimson-token treatment exactly, grouped with the other `.dt-btn-*`
modifiers. This is the sanctioned path per `specs/project-context.md`: "If the needed style does
not exist as a class, add it to the right stylesheet using tokens, then apply the class."

Also found (and reused) `.stm-audit-root`/`.stm-audit-head`/`.stm-audit-sub`/`.stm-audit-loading`/
`.stm-audit-empty` for the tab's outer shell — these live in `components.css`, not
`admin-layout.css` (an earlier grep of only `admin-layout.css` for `st-mods-audit` styling
returned nothing, which briefly looked like a gap in that module too; they exist, just filed under
`components.css`). Reusing them avoided inventing near-duplicate shell classes.

### AC-by-AC verification

- **AC1** (GET /pending, ST-only, oldest-first): verified live — 2 submissions return in
  submission order; a resolved record is excluded; a player gets 403.
- **AC2/AC7** (list render, empty state): verified via static-analysis (`Nothing pending` text
  present, `.or-list`/`.or-list-item` reused) — no browser harness in this repo for the admin app.
- **AC3** (Accept/Decline call the existing routes): verified — `apiPut` call site matches
  `/api/office_actions/${requestId}/${action}` exactly, both routes unchanged by this story beyond
  the additive `resolved_by`/`declined_by` fields.
- **AC4/AC5** (resolved_by/declined_by capture + enriched 409): verified live — accept/decline both
  record `req.user.username`; a stale attempt on either gets 409 with the acting ST's username in
  the message.
- **AC6** (10s poll): verified via static-analysis (`POLL_MS = 10_000`, `setInterval` present).
- **AC8** (no ad-hoc styles): verified — every class applied is either pre-existing and reused, or
  newly added to the correct stylesheet using existing tokens; no `style="..."` attribute anywhere
  in the module (asserted by test).

### Regression

Changed-area suite (6 files): **100/100 pass** —
`oaq-3-approval-queue.test.js` (18, new — 11 DB-backed + 7 wiring), `oaq-2-pending-status-actions.
test.js` (16), `issue-1143-office-actions-auth-safety.test.js` (13), `otc-2-office-actions-api.
test.js` (8), `feature.691.hos-city-status-power.test.js` (32), `issue-873-ecm-6-admin-sidebar.
test.js` (13) — confirming the new sidebar button/domain wiring doesn't collide with the existing
Equipment Catalogue wiring assertions there, and the `resolved_by`/`declined_by` additions don't
break any existing oaq.2 assertion's expected response shape.

Full untargeted suite (`npx vitest run`, no filter): **2422/2427 passed, 5 failed / 10 files
failed** — byte-identical to the established pre-existing baseline
(`n7-n9-allocator-readers.test.js` ×1, `oath-a-pledge-helpers.test.js` ×1,
`epic.708.3-cycle-phase-controls.test.js` ×3, plus the same 7 unrelated file-level `SyntaxError`/
`ENOENT` errors already known and confirmed unrelated to this diff — none reference
`office-actions`, `admin.html`, `admin.js`, `office-approvals`, or `admin-layout.css`). No new
failures.

### File List

- `server/routes/office-actions.js` — MODIFIED. New `GET /pending` route; additive
  `resolved_by`/`declined_by` capture in `accept`/`decline`; 409 body enrichment via `_findPending`.
- `public/admin.html` — MODIFIED. New sidebar button (`data-domain="office-approvals"`) + domain
  section (`id="d-office-approvals"`, no `.domain-header` wrapper — the module renders its own).
- `public/js/admin.js` — MODIFIED. Import + one dispatch line for `office-approvals`.
- `public/js/admin/office-approvals.js` — NEW. Tab module.
- `public/css/admin-layout.css` — MODIFIED. `.dt-btn-danger`, `.oaq-row-actions`, `.oaq-row-error`.
- `server/tests/oaq-3-approval-queue.test.js` — NEW. 18 tests.

### Change Log

- 2026-08-12: All tasks complete, all ACs verified against real code. Changed-area regression
  100/100 across 6 files; full untargeted suite 2422/2427 (5 failed/10 files), byte-identical to
  the established pre-existing baseline, no new failures. Status → review.
- 2026-08-12: External review (Codex, 3-pass, high effort) complete. 1 High patched (dev-role PII
  leak — raw character names/ST usernames rendered unredacted). 3 Medium patched (false-empty state
  on fetch failure; stale poll response could resurrect a resolved row; concurrent-race 409
  enrichment gap — investigating this surfaced a real, previously-undetected crash: a TRUE
  concurrent accept-vs-accept race on one pending record hit an uncaught 500 via the same stale
  issue-1143 unique index oaq.2's review believed it had fully closed, now fixed by reordering the
  transaction so the pending-record resolve gate runs before the collision-prone log insert, not
  after). 1 Medium dismissed with evidence (display-layer "gap" re-litigates a scope boundary the
  story's own "What this story is NOT" explicitly settled). 1 Medium addressed via fresh
  reproduction (reviewer's sandbox couldn't reach Atlas; re-verified independently). 4 Low patched
  (cursor affordance on non-clickable rows; missing AC1 negative-filter test; transposed test-count
  documentation; a false "used elsewhere" CSS-usage claim). All patches prove-discriminated. Changed-
  area regression 104/104; full suite 2426/2431, byte-identical to baseline. Status → review, ready
  to ship. No unresolved High/Medium remains. Status → done.

## Senior Developer Review

External review (Codex CLI, `model_reasoning_effort=high`, 3-pass single session — Blind Hunter /
Edge Case Hunter / Acceptance Auditor). Full findings:
`specs/stories/code-review/oaq-3-codex-findings.md` (untracked, per this project's own convention).
Prompt and scoped diff: `specs/stories/code-review/oaq-3-{codex-review,diff}.txt`.

**Environment caveat, disclosed by the reviewer itself**: Codex's sandbox could not reach MongoDB
Atlas (`connect EACCES`), so its own DB-backed gate run and AC4/AC5 live reproduction were blocked.
It said so plainly rather than guessing — the honesty the process asks for. All DB-backed
verification below was independently done in this session, which does have Atlas access.

### Findings — patched

- **[High, Pass 2] The queue rendered raw character names and ST usernames to the privacy-redacted
  `dev` role, bypassing this codebase's mandatory redaction contract.** Verified real:
  `public/js/data/helpers.js`'s `redactCharName(s)` exists specifically for "a raw name string that
  didn't come through `displayName(c)`" — exactly this module's case (`actor_name`/`target_name` are
  raw strings baked into the pending record at submission time, not character objects). Confirmed
  the established pattern by checking `ordeals-admin.js` (uses `displayName()`, which auto-redacts)
  and `attendance.js` (uses `redactPlayer()` for a raw Discord username) — this module used neither.
  **Fixed**: imported `redactCharName`/`redactPlayer`; row rendering now wraps `actor_name`/
  `target_name` in `redactCharName`; the "already actioned by X" error message is now built
  client-side from the 409 response's `resolved_by`/`declined_by` fields (switched `_resolve()` from
  `apiPut` to `apiRaw`, since `apiPut`'s thrown `Error` only carries the pre-formatted message
  string, not the underlying fields needed to redact just the name inside it) and wraps the acting
  ST's username in `redactPlayer`.

- **[Medium, Pass 1] An initial fetch failure rendered as a false "Nothing pending."** Confirmed:
  the old catch block only logged to console, leaving `state.rows` empty, which then hit the same
  render branch as a genuinely empty queue — telling an ST there's nothing to review when the real
  state is unknown. **Fixed**: added `state.fetchFailed`, rendered as a distinct "Could not load the
  queue" message, never silently presented as "nothing pending."

- **[Medium, Pass 1] A stale poll response could resurrect an already-resolved row.** Confirmed the
  ordering hazard: a poll's `GET /pending` in flight when an accept/decline succeeds could still
  land afterward and overwrite the locally-filtered `state.rows` with its stale snapshot. **Fixed**:
  added a fetch-generation counter (`_fetchGen`); every `_refetchAndRender()` call captures its own
  generation and discards its result if a newer fetch has started by the time it resolves. `_resolve()`
  now also triggers a real refetch after a successful accept/decline (previously relied on the local
  filter alone), reconciled by the same guard.

- **[Medium, Pass 2 — this is where the review paid for itself] The conflict enrichment didn't cover
  the TRUE concurrent-accept race, and pursuing that gap surfaced a real, previously-undetected
  crash.** Codex's finding was narrower — that the loser of a genuine simultaneous accept-vs-accept
  race falls into `office-actions.js`'s inner transaction conflict branch, which threw the old
  unenriched 409. Writing a regression test for exactly that race (two real concurrent
  `PUT .../accept` calls via `Promise.all` on the same pending record) exposed something worse: the
  loser got an **uncaught 500**, not a 409 at all. Root-caused live (a throwaway reproduction script,
  written, run, and deleted — see Validation notes) to the SAME structural defect the oaq.2 review
  round believed it had fully closed: the stale issue-1143 `office_actions` unique index. That
  earlier fix only prevented a SECOND SEPARATE pending record from ever reaching `accept` after a
  first one on the same `(actor, target)` was accepted — it did nothing for two requests racing the
  SAME single pending record, because both sides still reached `actionsCol().insertOne()` with an
  identical `{game_session_id, actor_id, target_id}` key before either one checked whether the
  pending record itself was still up for grabs. The `resolveResult.matchedCount === 0` check that
  *should* have caught this ran only AFTER the log insert, not before. **Fixed**: moved the pending-
  record resolve (the actual atomic race gate) to run FIRST in the transaction, immediately after
  computing `new_status` — before the budget claim, the CAS write, and the log insert. A losing
  request now fails cleanly at that first gate and never reaches the collision-prone insert at all;
  neither does it claim a phantom budget slot for a request that never actually resolves. Also
  extracted `_conflictBody(doc)` so `_findPending`'s enrichment and the (now singular) in-transaction
  race branch, plus `decline()`'s own race branch, all build the same enriched message from a fresh
  read. Prove-discriminated: reverted the reordering (moved the resolve gate back to its original
  post-insert position), confirmed the new race test fails with the exact `[200, 500]` shape
  observed before the fix, restored, confirmed `[200, 409]` with `resolved_by` populated, 5/5 clean
  on a standalone repro script plus the permanent test.

### Findings — reviewed, not patched (with rationale)

- **[Medium, Pass 3a] The display layer allegedly still assumes Status Action is the only pending
  item type.** Codex is factually right that `_renderRow()`/`_resolve()` only key off `request_type`
  for the badge LABEL, not for field selection or action dispatch — a hypothetical future Epic OXP
  item would render as "Unknown → Unknown" and hit the wrong endpoint. But the story's own "What
  this story is NOT" section sets the bar explicitly: *"a `request_type`-keyed label/renderer lookup
  rather than a single fixed template is enough forward-shape; do not build a second item type or
  its handling now."* The finding is asking for exactly the per-type field/dispatch handling that
  sentence explicitly excludes. Pass 3a had the spec available and quoted "What this story is NOT"
  itself, so this isn't a blinding artefact — it's a re-litigation of an already-settled scope
  boundary. **Not patched** — the label-only ternary is the deliberately-scoped implementation, not
  an oversight.

- **[Medium, Pass 3b] The claimed regression evidence (100/100, 2422/2427) was unverifiable in the
  reviewer's own sandbox.** Confirmed environmental, not a product regression: Codex's own
  Validation notes report `connect EACCES` on every Atlas connection attempt. Independently re-ran
  every gate in this session (which has real Atlas access) — see Regression below, now including the
  post-patch numbers. Not a code issue; no patch applicable.

### Findings — patched (Low)

- **[Low, Pass 2] Approval rows inherited a clickable-row cursor/hover from the reused
  `.or-list-item` (Ordeals' select-to-view pattern), but only the buttons are actually clickable.**
  **Fixed**: added `.oaq-row-wrap .or-list-item { cursor: default; }` and a hover override,
  grouped with the other `oaq.3` rules in `admin-layout.css`.

- **[Low, Pass 3a] The AC1 test proved the positive case (two seeded Status Actions come back) but
  never proved the negative — that a pending record of a DIFFERENT `request_type` is excluded.**
  **Fixed**: added a regression test inserting a genuine `contested_roll` pending document directly
  and asserting `GET /pending` never returns it.

- **[Low, Pass 3a/3b] The story and Dev Agent Record both transposed the DB-backed/static test
  counts** (said "11 DB-backed + 7 wiring"; actually 7 DB-backed + 11 wiring — the reviewer counted
  both independently and cross-checked against `npx vitest run tests/oaq-3-approval-queue.test.js`
  with Atlas unavailable, which skips exactly the DB-backed cases: 11 passed, 7 skipped). **Fixed**:
  corrected both the Tasks/Subtasks write-up and this section's own regression numbers below.

- **[Low, Pass 3b] The claimed existing `.dt-appr-approved`/`.dt-appr-rejected` call sites
  ("used elsewhere for a persistent approved/rejected/modified/pending selector") do not exist.**
  Verified: only bare CSS definitions, zero JS/HTML consumers anywhere in the codebase — dead CSS.
  **Fixed**: corrected the Task 3 write-up to drop the false usage claim; the underlying reasoning
  (these are `.active`-gated toggle-state classes, a poor fit for a one-shot action button, judged
  from their CSS shape alone) still holds and didn't depend on the false claim.

### Regression

Changed-area suite (6 files, re-run after all patches): **104/104 pass** —
`oaq-3-approval-queue.test.js` (22 — 18 original + 4 new regression tests from this review round:
the true-concurrent-race enrichment test that surfaced the 500 bug, the AC1 negative-filter test,
and two wiring tests for the redaction fix and the fetch-error/stale-poll guards), plus the
unchanged `oaq-2-pending-status-actions.test.js` (16), `issue-1143-office-actions-auth-safety.
test.js` (13), `otc-2-office-actions-api.test.js` (8), `feature.691.hos-city-status-power.test.js`
(32), `issue-873-ecm-6-admin-sidebar.test.js` (13).

The true-concurrent-accept-race fix was prove-discriminated as described above (reverted, confirmed
the exact `[200, 500]` failure, restored, confirmed `[200, 409]`, 5/5 clean on a standalone repro).

Full untargeted suite (`npx vitest run`, no filter, re-run after all patches): **2426/2431 passed,
5 failed / 10 files failed** — byte-identical to the established baseline
(`n7-n9-allocator-readers.test.js` ×1, `oath-a-pledge-helpers.test.js` ×1,
`epic.708.3-cycle-phase-controls.test.js` ×3, plus the same 7 unrelated file-level errors). Total
count is 4 higher than the pre-review 2427 (this round's 4 new regression tests). No new failures.

### File List (review round additions)

No new files. `server/routes/office-actions.js`, `public/js/admin/office-approvals.js`,
`public/css/admin-layout.css`, and `server/tests/oaq-3-approval-queue.test.js` (all already in the
File List above) received further edits during this review round.

### Outcome

Ready to ship. The one blocking finding (dev-role PII leak) is patched and verified; the concurrent-
race investigation it indirectly triggered found and fixed a real, previously-undetected crash bug
that had survived two prior review rounds because no existing test asserted the LOSING side of a
concurrent-accept race gets a clean status code (oaq.2's own AC8 test only ever checked that exactly
one side won, which a 500 on the other side would not have failed). All other findings patched or
dismissed with recorded evidence; no unresolved High/Medium remains.

## Post-script: moved to the game app (2026-08-12, same day)

Angelus, after seeing the shipped result: "you put the approval queue in admin, can you instead
put it on the main player app as a tab that only appears to STs?" Moved same day (PR #1148):

- `public/js/admin/office-approvals.js` → `public/js/suite/office-approvals.js`.
- Registered as an ST-only tab in `app.js`'s `MORE_APPS` (desktop sidebar) and `NAV_ITEMS` (mobile
  bottom nav) — same `stOnly: true` gating pattern as Territory/Tracker/Combat/Spheres, never built
  into the DOM at all for a non-ST viewer. Removed entirely from `admin.html`/`admin.js`.
- **The CSS reuse decisions documented above are now stale**: `.dt-btn-gold`/`.dt-btn-danger` were
  chosen specifically because `admin.html` doesn't load `suite.css`. Now that the module lives in
  the game app, it uses `.ch-btn-accept`/`.ch-btn-decline` (challenge-notification.js's existing
  accept/decline styling, same `contested_roll_requests` collection family) instead — a better
  semantic fit than either option originally weighed, made available by the move itself.
- Poll visibility check moved from `.domain.active` (admin app) to `.tab.active` (game app).
- Regression: 24/24 changed-area (wiring tests rewritten for the new location), 145/145 broader,
  full suite 2446/2451 byte-identical to baseline. Live-verified on prod: tile renders correctly
  under Storyteller, queue loads with no console errors, confirmed gone from the admin sidebar.
