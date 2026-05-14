# Story issue-295: DT Prep — Early Access tick grants out-of-window access (early and late)

Status: review

issue: 295
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/295
branch: morningstar-issue-295-dt-early-access-out-of-window

---

## Story

As a Storyteller managing downtime submissions,
When I tick a player's character in the DT Prep "Early Access" list,
I want that tick to grant them access to the downtime form outside the normal cycle window — both before the cycle opens and after it closes,
So that I can accommodate early submitters and players who missed the window without needing to reopen the cycle manually.

---

## Acceptance Criteria

**AC-1 — Early access before the cycle opens (existing behaviour preserved)**
**Given** a cycle with `status: prep` and a character in `early_access_player_ids`,
**When** that player's character sheet downtime tab is loaded,
**Then** the downtime form renders (not a "locked" or "countdown" message).
*(This already works — preserve it.)*

**AC-2 — Access after the cycle closes**
**Given** a cycle with `status: closed` and a character in `early_access_player_ids`,
**When** that player's character sheet downtime tab is loaded,
**Then** the downtime form renders (not "No active downtime cycle. Check with your Storyteller.").

**AC-3 — Late submission saves successfully**
**Given** a cycle with `status: closed` and a character in `early_access_player_ids`,
**When** that player saves or submits their downtime form,
**Then** the server accepts the save (200/201 — not 423 CYCLE_CLOSED), and the submission is persisted.

**AC-4 — Non-early-access players unaffected**
**Given** a cycle with `status: closed` and a character NOT in `early_access_player_ids`,
**When** that player's character sheet downtime tab is loaded,
**Then** they see the existing "ST is processing" or "No active downtime cycle" message — unchanged from today.

**AC-5 — UI label in DT Prep updated**
**Given** the ST is on Admin > Downtime > DT Prep,
**Then** the section heading reads "Out-of-Window Access" (not "Early Access Players"), reflecting the broader meaning of the tick.

---

## Tasks

- [x] **Task 1 — Fix client-side access gate to include closed cycles** (`public/js/tabs/downtime-tab.js`)
  - [x] After the `activeCycle` lookup (line 34–36), find the most recently closed cycle:
    ```js
    const recentClosedCycle = cycles
      .filter(c => c.status === 'closed')
      .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0] || null;
    ```
  - [x] Change `inEarlyAccess` (line 39) to check both live and recently closed cycles:
    ```js
    const inEarlyAccess = charId && (
      (activeCycle?.early_access_player_ids || []).includes(charId) ||
      (recentClosedCycle?.early_access_player_ids || []).includes(charId)
    );
    ```
  - [x] Change the rendering branch at line 75 from `} else if (activeCycle) {` to `} else if (activeCycle || inEarlyAccess) {` so the form renders even when the live cycle is absent but the player has early access on a closed cycle.
  - [x] Confirm AC-4 is not broken: the `else` branch at line 89 (closed-cycle/ST-processing message) still runs when `inEarlyAccess` is false and `activeCycle` is null and `isST` is false.

- [x] **Task 2 — Allow server-side saves for early-access characters on closed cycles** (`server/routes/downtime.js`)
  - [x] In `requireOpenCycle` (line 37–61), expand the cycle projection to include `early_access_player_ids`:
    ```js
    const cycle = await getCollection('downtime_cycles').findOne(
      { _id: cycleOid },
      { projection: { status: 1, early_access_player_ids: 1 } }
    );
    ```
  - [x] After the cycle-closed check, add an early-access bypass. The submission doc is already loaded at this point (`sub`); read `sub.character_id` and compare against `cycle.early_access_player_ids`:
    ```js
    if (cycle?.status === 'closed') {
      const charIdStr = String(sub.character_id || '');
      const earlyIds = (cycle.early_access_player_ids || []).map(String);
      if (earlyIds.includes(charIdStr)) return next();  // early-access bypass
      return res.status(423).json({
        error: 'CYCLE_CLOSED',
        message: 'Cycle is closed; submissions are locked',
      });
    }
    ```
  - [x] Note: `POST /api/downtime_submissions/` (line 556) has no cycle-status check at all — a new submission against a closed cycle is accepted server-side already. No change needed there.

- [x] **Task 3 — Update DT Prep section heading** (`public/js/admin/downtime-views.js`)
  - [x] At line 2530, change the heading from `Early Access Players` to `Out-of-Window Access`:
    ```js
    `<div class="dt-prep-early-title">Out-of-Window Access</div>`
    ```
  - [x] CSS class names (`dt-prep-early`, `dt-prep-early-title`, `dt-early-toggle-row`, `dt-early-toggle`, `dt-early-name`, `dt-early-list`) must NOT change — they are used in stylesheets and event listener selectors.
  - [x] The checkbox toggle behaviour, persistence logic, and all other code in `renderPrepPanel` and its event handlers is unchanged.

- [ ] **Task 4 — Manual verification**
  - [ ] On a live (or dev) cycle in `status: prep`: confirm a character in `early_access_player_ids` sees the form; confirm one NOT in the list sees "Downtimes are not yet open" or countdown. (AC-1 regression check)
  - [ ] On a closed cycle: confirm a character in `early_access_player_ids` sees the form and can save. (AC-2, AC-3)
  - [ ] On a closed cycle: confirm a character NOT in `early_access_player_ids` sees the ST-processing / no-cycle message. (AC-4)
  - [ ] In DT Prep: confirm the heading reads "Out-of-Window Access". (AC-5)

---

## Dev Notes

### System overview

The access gate lives in two places:

| Layer | File | Gate |
|---|---|---|
| Client render | `public/js/tabs/downtime-tab.js:34-42` | Decides whether to show the form or a "locked" message |
| Server save | `server/routes/downtime.js:37-61` (`requireOpenCycle`) | Returns 423 if the cycle is closed when the player tries to PUT a submission |

Both must be changed for a late submission to work end-to-end.

### Client-side logic (downtime-tab.js)

Current `activeCycle` lookup only includes live statuses:
```js
const LIVE_STATUSES = ['active', 'game', 'prep', 'open'];
const activeCycle = cycles
  .filter(c => LIVE_STATUSES.includes(c.status))
  .sort((a, b) => LIVE_STATUSES.indexOf(a.status) - LIVE_STATUSES.indexOf(b.status))[0] || null;
```

When a cycle is `closed`, `activeCycle` is null, so `inEarlyAccess` (which checks `activeCycle?.early_access_player_ids`) is always false for non-ST players. The rendering falls through to the else-branch (lines 90-108) which shows "ST is processing" or "No active downtime cycle".

The fix:
- After the `activeCycle` lookup, also find the most recently closed cycle (by `_id` sort, same pattern used at line 90-93).
- Expand `inEarlyAccess` to check both `activeCycle` and `recentClosedCycle`.
- Change the rendering condition from `activeCycle` alone to `activeCycle || inEarlyAccess`.

### Form behaviour when rendering against a closed cycle

`renderDowntimeTab` (called at line 85) does its own cycle lookup internally in `downtime-form.js:1261-1269`:
```js
currentCycle = sorted.find(c => LIVE_STATUSES.includes(c.status))
  || sorted.find(c => c.status === 'closed')   // ← already a fallback!
  || sorted[0]
  || null;
```

The form already finds the closed cycle as its fallback. It renders fine. If the player saves before the server gate is patched, the form surfaces the 423 gracefully at line 1107-1109:
```js
if (err && /CYCLE_CLOSED|423|Cycle is closed/i.test(err.message || '')) {
  if (statusEl) statusEl.textContent = 'Cycle closed; submission locked';
}
```

After Task 2 is implemented, the 423 will not fire for early-access characters, and the save will succeed.

### Server-side logic (requireOpenCycle)

Current projection in `requireOpenCycle` fetches only `{ status: 1 }`. Expanding it to include `early_access_player_ids` is a minimal, low-risk change (no new query, just extra field in the projection).

The submission document (`sub`) is already loaded before the cycle fetch — use `sub.character_id` for the early-access check. The field is stored as ObjectId in MongoDB but the `early_access_player_ids` array may contain string IDs (written by the admin toggle at line 2586). Use `String()` on both sides for safety (same pattern as the client-side check at `downtime-tab.js:39`).

The `requireOpenCycle` guard applies only to `PUT /api/downtime_submissions/:id`. The POST route (`line 556`) has no cycle-status check, so creating a brand-new submission against a closed cycle already works server-side. If a late-access player has never submitted, they create (POST) and save immediately. If they have an existing draft, they update (PUT) — that's the path `requireOpenCycle` guards.

### What NOT to change

- `public/js/tabs/downtime-form.js` — cycle lookup (lines 1261-1269) and error handling (lines 1107-1109) already handle the closed-cycle case correctly. No change.
- `public/css/admin-layout.css` — CSS class names for the early-access section are unchanged. No change.
- `server/routes/downtime.js` POST `/api/downtime_submissions` — no cycle check needed, works already.
- `server/routes/downtime.js` joint-project `liveStatuses` checks (lines 205-208, 292-295) — joint projects against a closed cycle are a separate scope. Do not change.
- `public/js/downtime/db.js` — `deriveCycleStatus` and the cycle lifecycle are unchanged. The early-access flag is orthogonal to the phase-signoff chain.

### No new schema fields

`early_access_player_ids` is already declared in `server/schemas/downtime_submission.schema.js:547`:
```js
early_access_player_ids: { type: 'array', items: { type: 'string' } },
```
No schema change required.

### British English in any new user-visible strings

Use "Storyteller", "behaviour", etc. per project convention. The heading change ("Out-of-Window Access") is already British-neutral.

### Open question: heading wording

Issue #295 flags "Out-of-Window Access" or "Access Override" as options. "Out-of-Window Access" is used in this story. If a different label is preferred at review, it is a one-line change at `downtime-views.js:2530` — no functional impact.

### Key code locations

| Location | What | Action |
|---|---|---|
| `public/js/tabs/downtime-tab.js:34-42` | `activeCycle` lookup + `inEarlyAccess` | UPDATE — add `recentClosedCycle`, expand check |
| `public/js/tabs/downtime-tab.js:75` | Form render branch | UPDATE — `activeCycle || inEarlyAccess` |
| `server/routes/downtime.js:37-61` | `requireOpenCycle` | UPDATE — expand projection; add early-access bypass |
| `public/js/admin/downtime-views.js:2530` | DT Prep heading | UPDATE — "Out-of-Window Access" |

### Files NOT to touch

- `public/js/tabs/downtime-form.js`
- `public/js/downtime/db.js`
- `public/css/admin-layout.css`
- `server/schemas/downtime_submission.schema.js`

---

## Dev Agent Record

### Completion Notes

Three targeted changes; no new dependencies, no schema changes.

**Task 1 — `public/js/tabs/downtime-tab.js`:**
- Added `recentClosedCycle` lookup after `activeCycle` (same `_id`-sort pattern used at line 90–93 in the same file).
- Expanded `inEarlyAccess` to OR both cycle arrays with `String()` comparison (consistent with line 39's pre-existing approach).
- Changed render branch from `} else if (activeCycle) {` to `} else if (activeCycle || inEarlyAccess) {`. AC-4 preserved: the `else` branch (ST-processing / no-cycle message) only runs when both `activeCycle` is null and `inEarlyAccess` is false.

**Task 2 — `server/routes/downtime.js` `requireOpenCycle`:**
- Expanded submission projection to include `character_id` (was `cycle_id: 1` only).
- Expanded cycle projection to include `early_access_player_ids`.
- When `cycle.status === 'closed'`, checks `sub.character_id` against `early_access_player_ids` (both `.map(String)` for safety). Early-access characters call `next()`; all others still receive 423 CYCLE_CLOSED.
- POST `/api/downtime_submissions/` already has no cycle check — new submissions to closed cycles work without change.

**Task 3 — `public/js/admin/downtime-views.js`:**
- Heading text changed from "Early Access Players" to "Out-of-Window Access". CSS class names, event handlers, and persistence logic untouched.

**Parse checks:** All three modified files pass `node --input-type=module --check` clean.

**No unit tests added:** All three changes are integration-path code (DOM rendering, Express middleware, template string). No pure functions suitable for isolated unit testing were introduced; manual verification (Task 4) covers the acceptance criteria.

### Review Follow-ups (AI)

- [x] **[AI-Review][Med]** Fixed: `inEarlyAccess` OR-ed both `activeCycle` and `recentClosedCycle` — player ticked in a *previous* closed cycle's early-access list would bypass the "not yet open" gate on a new live cycle (prep). Replaced the two-OR pattern with `cycleForAccessCheck = activeCycle || recentClosedCycle` so only one cycle's list is consulted at a time.

### Change Log

- 2026-05-14 — Implemented out-of-window access: `recentClosedCycle` added to client gate; `requireOpenCycle` extended with early-access bypass; DT Prep heading renamed to "Out-of-Window Access". (Tasks 1–3)
- 2026-05-14 — QA fix: replaced two-OR `inEarlyAccess` with `cycleForAccessCheck = activeCycle || recentClosedCycle` to prevent cross-cycle early-access bleed.

### File List

Modified:
- `public/js/tabs/downtime-tab.js` — `recentClosedCycle` lookup; `cycleForAccessCheck` pattern; render branch condition
- `server/routes/downtime.js` — `requireOpenCycle` projection expanded; early-access bypass added
- `public/js/admin/downtime-views.js` — DT Prep heading updated
- `specs/stories/issue-295-dt-early-access-out-of-window.story.md` — this story file
- `specs/stories/sprint-status.yaml` — entry updated to `review`

---

## Senior Developer Review (AI)

**Reviewer:** Quinn (bmad-agent-qa)
**Date:** 2026-05-14
**Outcome:** ✅ **Approve with fix applied** — one medium bug found and corrected inline; no remaining blockers.

### Summary

Static-analysis pass against the five ACs. All three modified JS files parse clean. Logic verified end-to-end: client gate, server bypass, and UI label. One medium correctness bug was identified and fixed in this pass (see Action Items). The fix was a 2-line change and parses clean.

**Manual browser verification (Task 4) is still outstanding** — that is the user's pass, not Quinn's.

### Action Items

**MEDIUM — [FIXED] Cross-cycle early-access bleed in `inEarlyAccess`**

The original implementation OR-ed both `activeCycle?.early_access_player_ids` and `recentClosedCycle?.early_access_player_ids`. This means a player marked as early-access in a closed Cycle A would have `inEarlyAccess = true` even when a new Cycle B is live in `prep` — they would bypass the "not yet open" gate and see Cycle B's form before the ST intended.

**Fixed inline** by replacing the two-OR pattern with:
```js
const cycleForAccessCheck = activeCycle || recentClosedCycle;
const inEarlyAccess = charId && (cycleForAccessCheck?.early_access_player_ids || []).includes(charId);
```

Only one cycle's early-access list is consulted: the live cycle when one exists, the most recently closed cycle when none does. This is the correct semantic for "out-of-window" access.

### What I Verified

- ✅ **AC-1 (regression):** `activeCycle` in `prep` → `inEarlyAccess` true → `canAccess` true → form renders; character NOT in list → `canAccess` false → countdown/locked branch fires
- ✅ **AC-2:** `activeCycle` null, `recentClosedCycle` has character → `inEarlyAccess` true → `activeCycle || inEarlyAccess` branch → form renders
- ✅ **AC-3:** `requireOpenCycle` — cycle projection includes `early_access_player_ids`; `String()` normalisation on both `sub.character_id` (ObjectId) and list entries (strings from admin toggle); `charIdStr &&` guard prevents empty-string false positive; `return next()` on match
- ✅ **AC-4:** `activeCycle` null, character NOT in `recentClosedCycle.early_access_player_ids` → `inEarlyAccess` false → `isST` false → `else` branch → "ST is processing" / "No active downtime cycle" message unchanged
- ✅ **AC-5:** `downtime-views.js:2530` — heading is `Out-of-Window Access`
- ✅ CSS class names unchanged (`dt-prep-early-title`, `dt-early-toggle`, etc.)
- ✅ `section-flag` routes have no cycle-status gate and are unaffected (they operate on published outcomes, not draft submissions)
- ✅ `POST /api/downtime_submissions/` has no cycle check — new submissions to closed cycles work without change
- ✅ `early_access_player_ids` schema declaration unchanged
- ✅ All three files pass `node --input-type=module --check`

### What I Did NOT Verify (Out of Quinn's Static Reach)

- ❌ Form actually renders in a browser for a character in `early_access_player_ids` on a closed cycle
- ❌ Save actually persists (round-trips through API) for that character
- ❌ Character NOT in the list actually sees the correct blocked message
- ❌ Heading renders in the DT Prep panel in both themes

These are all in Task 4's manual smoke checklist — run them on a local dev server before merging.
