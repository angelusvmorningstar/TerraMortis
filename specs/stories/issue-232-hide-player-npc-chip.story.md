# Story issue-232: Hide "New NPC (pending)" chip from player Relationships tab

Status: review

issue: 232
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/232
branch: morningstar-issue-232-hide-player-npc-chip

---

## Story

As a player using the Relationships tab in the Player Portal,
When I click **+ Add Relationship**,
I should only see the "Another PC" path — the "New NPC (pending)" chip and its quick-add form should not be visible to me,
So that the policy that NPCs are ST-curated (not player-created) is reflected in the UI, matching the same policy already enforced in the admin sidebar (#23), DT form (#84), and Touchstone editor (#162).

This is a policy/scoping fix, not a broken feature. NPCR.7 originally exposed player NPC quick-add by design; the design intent has shifted.

---

## Acceptance Criteria

**AC-1 — Chip hidden for player role**
Given a logged-in player views the Relationships tab and clicks **+ Add Relationship**,
When the picker renders,
Then the "New NPC (pending)" chip is not present in the DOM. The chip row either renders only "Another PC" or collapses entirely (per the resolved Open Question below).

**AC-2 — Default mode is `pc` for players**
Given a player opens the Add Relationship picker,
When the picker first renders,
Then it defaults to `npc_mode === 'pc'` and the "Another PC" form is shown immediately (character picker, kind selector, etc.).

**AC-3 — Add Relationship entry point preserved**
Given a player views the Relationships tab,
When they look at the tab head,
Then the **+ Add Relationship** button is still present and clickable. The button itself is not removed — only the NPC sub-mode below it is hidden. PC-to-PC proposals (NPCR.10) remain a player capability.

**AC-4 — ST role still sees the chip**
Given an ST views the Relationships tab via `player.html` (e.g. testing in a player's view, or because their character has its own relationships tab),
When they click **+ Add Relationship**,
Then the "New NPC (pending)" chip is visible AND functional. The ST-side default mode remains `'new'` per the existing behaviour.

**AC-5 — Player save flow only reaches the `'pc'` branch**
Given a player completes the Add Relationship form and clicks Save,
When `saveAddEdge(el, char)` runs,
Then the only branch reachable from the player UI is `_tabState.npc_mode === 'pc'` (the PC-to-PC validation + POST). The `'new'` and `'existing'` branches at `:934` and `:927` remain in code (for ST testing) but are unreachable from a player session.

**AC-6 — Existing edges render unchanged**
Given the change is deployed,
When edges previously created by players via the (now-hidden) NPC quick-add path load,
Then they continue to render correctly in the read-only edge list. No regression on already-saved data.

**AC-7 — Empty state hint remains coherent**
Given a player with no PC-to-PC relationships opens the picker,
When the form renders,
Then any hint copy that previously assumed the "New NPC (pending)" chip was available is updated or removed (e.g. the hint at `:812` referencing **New NPC (pending)** as an empty-state recommendation).

---

## Tasks

- [x] **Task 1 — Gate the "New NPC (pending)" chip on `isSTRole()`**
  - [x] In `public/js/tabs/relationships-tab.js`, locate the `rel-add-mode-chips` block at `:801-804`. Wrap the rendering of the `data-npc-mode="new"` chip in `${isSTRole() ? '...' : ''}`. The `isSTRole` import already exists at `:15` — no new import needed.
  - [x] When non-ST, the chip row contains only the "Another PC" chip OR collapses entirely. Per Open Question resolution: **collapse entirely** (a single-chip row is visually pointless — see Dev Notes). *Implemented: the entire `<div class="rel-add-mode-chips">` block is wrapped in `${isSTRole() ? '...' : ''}` so it disappears completely for non-ST users.*

- [x] **Task 2 — Default `npc_mode` to `'pc'` for non-ST**
  - [x] In `resetTabState(charId)` at `:25-47`, change the `npc_mode: 'new'` default at `:32` so it resolves to `'pc'` when `!isSTRole()` and `'new'` when ST. Mirror the same logic in `openAddPicker(el, char)` at `:724` — both sites currently hardcode `'new'`.
  - [x] Use a helper if it reduces repetition: e.g. a small `_defaultNpcMode()` returning `isSTRole() ? 'new' : 'pc'`. *Implemented as `_defaultNpcMode()` at the top of the file (just before `resetTabState`); both call sites updated.*

- [x] **Task 3 — Defensive guard in `setNpcMode`**
  - [x] In `setNpcMode(el, char, mode)` at `:753-757`, add a guard so non-ST callers cannot flip into `'new'` mode even if a malformed click event fires (e.g. injected `data-npc-mode`). When `!isSTRole()` and `mode === 'new'`, coerce to `'pc'` (the only player-allowed mode).
  - [x] Not a security boundary (server-side `requireRole('st')` on the `/api/npcs/quick-add` route is the actual gate), but it's a cheap UI consistency check that prevents weird states.

- [x] **Task 4 — Sweep stale copy referencing the hidden chip**
  - [x] At `:812`, the hint inside the (legacy `npc_mode === 'existing'`) branch reads "Use **New NPC (pending)** to add one, or ask the ST to link you to a register NPC." This branch is dead code for players (the existing-NPC mode was removed from index.html per the comment at `:30-31`), but the hint is still misleading if any path resurrects. Either remove the dead branch entirely OR update the hint to "Ask the ST to link you to a register NPC." (single-action). Lean toward removing the dead branch since it's already comment-flagged as removed. *Implemented: removed the entire `npcMode === 'existing'` ternary branch from `renderAddPanel`. The `'existing'` handling in `saveAddEdge` (`:927-933`) is preserved per story scope.*
  - [x] Verify no other strings in the file reference the hidden affordance (search for "New NPC", "pending", "quick-add"). *Verified: remaining matches are inside the gated `isSTRole()` block (the chip itself, ST-visible) or the `saveAddEdge` `'new'` branch (preserved for ST per story).*

### Review Follow-ups (AI)

(Added by Quinn — bmad-agent-qa, 2026-05-09. Both items are tidy-up exposed by the dead-branch removal; not blockers.)

- [ ] **[AI-Review][Low]** Dead network call: `apiGet('/api/npcs/directory')` at `relationships-tab.js:745` is now unused in player sessions (the directory data is no longer rendered after the `'existing'` branch removal). Recommend gating the call on `isSTRole()` so player sessions skip the round-trip. ST behaviour preserved (the L991 cache push after quick-add still works). (See QA review item 1.)
- [ ] **[AI-Review][Low]** Dead local variables: `loading` (`:789`) and `npcOpts` (`:797-808`) in `renderAddPanel` are computed but never read after the `'existing'` branch was removed. Two-line deletion to clean up. (See QA review item 2.)

- [ ] **Task 5 — Manual verification**
  - [ ] As a logged-in player (or via ST localTestLogin emulating player role), open Relationships tab, click **+ Add Relationship** → confirm chip row shows only "Another PC" content (or no chip row), and the PC-to-PC form renders by default.
  - [ ] As an ST, repeat — confirm the "New NPC (pending)" chip is visible and the new-NPC form still works end-to-end (POST to `/api/npcs/quick-add` succeeds).
  - [ ] As a player whose character has existing pending NPCs already in the directory, open the read-only edge list — confirm those edges render with names + flag affordances unchanged (NPCR.6 + NPCR.11 paths).
  - [ ] Hard-refresh as a player; confirm the Add Relationship picker opens directly into the PC-to-PC form on first click (no transient flash of the new-NPC form).

---

## Dev Notes

### Why this is policy, not bug

NPCR.7 (the original story) explicitly designed player NPC quick-add as a feature: players could create pending NPCs, ST would later promote them to register NPCs. That design has been walked back across the codebase:

- **#23** — removed the NPC Register sidebar from `admin.html` (admin-side cleanup; predates this).
- **#84** — `dt-form.33` stripped NPC selectors from the DT form entirely (DT-form-side cleanup).
- **#162** — removed the relational NPC picker from the Touchstone editor in edit mode (sheet-side cleanup).
- **#232** (this story) — the last remaining player-facing NPC affordance: the Relationships tab quick-add chip.

Once this lands, the only NPC creation path is the ST admin (`admin/npc-register.js`). Server-side, `/api/npcs/quick-add` continues to exist (so STs can still trigger it from `player.html` for testing), and `/api/npcs` POST exists for the admin register — neither route changes in this story.

### Files in scope

| File | Action |
|---|---|
| `public/js/tabs/relationships-tab.js` | UPDATE — gate chip + default mode + defensive guard + dead-code sweep |

That's it. Single file. No CSS, no schema, no server changes.

### Files NOT to touch

- `server/routes/npcs.js` — the `/api/npcs/quick-add` route stays. STs may still hit it; players are now gated only at the UI layer (defence in depth would require a server-side role check on quick-add, but that's a separate hardening story per the issue's scope notes).
- `public/js/admin/npc-register.js` — ST-only NPC management; unchanged.
- `public/js/data/relationship-kinds.js` — `playerCreatableKinds()` and `playerPcPcKinds()` filters stay as-is. The change is at the UI gate level, not the kind-list level.
- `public/admin.html`, `public/index.html`, `public/player.html` — no markup changes needed.

### Resolved Open Questions

| Question (from issue) | Resolution | Why |
|---|---|---|
| Gate vs remove-entirely | **Gate on `!isSTRole()`** | Matches existing pattern in same file (`:811`, `:818` both gate on `isSTRole()`). Preserves an ST test path. Reversibility costs nothing — remove the gate to restore. |
| Single chip vs collapse | **Collapse entirely** for non-ST | A one-chip "radiogroup" is visually pointless and ARIA-confusing. The mode is implicit (pc) when only one option exists. |
| Default `npc_mode` for non-ST | **`'pc'`** | So the picker opens directly into the PC-to-PC form, no transient flash of the (hidden) new-NPC form. |

### Save logic — what to preserve

`saveAddEdge(el, char)` at `:913` branches on `_tabState.npc_mode`:

- `:927` — `'existing'` branch (legacy; already noted as removed from `index.html` at `:30-31`)
- `:934` — `'new'` branch (POST `/api/npcs/quick-add`) — unreachable from player UI after this story, but kept for ST.
- `:940` — `'pc'` branch (PC-to-PC proposal via `/api/relationships`) — the player's only path.

**Don't delete the `'new'` branch.** It's still valid for ST. Hiding the UI chip is the entire fix.

### Defensive guard rationale (Task 3)

`setNpcMode(el, char, mode)` at `:753` currently accepts whatever `mode` string the caller passes (`'pc'` resolves to `'pc'`, anything else resolves to `'new'`). With the chip hidden from players, no UI path can call this with `'new'`. But:
- The function is exported via the click handler at `:907` — `chip.dataset.npcMode`. If somehow a hidden chip slipped into the DOM (cache, browser extension, weirdness), the click would still flip mode.
- A defensive coercion costs ~3 lines and prevents future re-introduction bugs.

This is **not** a security boundary. The actual gate against player NPC creation is server-side at `/api/npcs/quick-add`. The UI guard is purely for state hygiene.

### Testing standard

This is a UI gating change with no business logic. Per `feeding-grounds-double-free.test.js` precedent and the project convention, **no unit test is warranted**. Manual verification (Task 5) covers it.

A Playwright E2E spec would be feasible:
1. Seed a player session via `localTestLogin('player')` or fixture
2. Navigate to Relationships tab, click **+ Add Relationship**
3. Assert no element with `data-npc-mode="new"` is present
4. Assert PC-to-PC form fields are visible

But this is optional follow-up; not blocking. Same call as #231.

### British English

User-visible string updates (Task 4) use British English: "Ask the ST to link you to a register NPC." (singular "register NPC"; "ask" not "request"; "link" not "associate").

---

## Dev Agent Record

### Debug Log

- `node --input-type=module --check` against the modified file passes.
- No existing tests touch `relationships-tab.js`, `setNpcMode`, or `_defaultNpcMode` — confirmed via grep across `tests/` and `server/tests/`. No regression run needed.
- Per story testing standard: no unit tests added (UI gating change with no business logic, follows `feeding-grounds-double-free.test.js` precedent).

### Completion Notes

**Implemented (Tasks 1-4):**
- New `_defaultNpcMode()` helper at the top of the file returns `'new'` for ST and `'pc'` otherwise.
- `resetTabState()` and `openAddPicker()` both call `_defaultNpcMode()` instead of hardcoding `'new'`. Player sessions now open the picker straight into the PC-to-PC form.
- `<div class="rel-add-mode-chips">` block is wrapped in `${isSTRole() ? '...' : ''}` — collapses entirely for non-ST. ST view unchanged.
- `setNpcMode()` coerces non-ST callers to `'pc'` regardless of incoming `mode` argument. Defensive only; the actual gate is server-side `requireRole('st')` on `/api/npcs/quick-add`.
- Removed the dead `npcMode === 'existing'` branch from `renderAddPanel()`. The `'existing'` handling in `saveAddEdge` (line 935 in the new numbering) is preserved per story scope — it's never reached but kept as a safety belt.

**Manual verification (Task 5) NOT performed by dev agent.** Browser-only checks: chip visibility for player vs ST, picker default rendering on first open, save flow ending up in the `'pc'` branch only, no transient flash of the hidden form. All listed under Task 5 for QA / user.

**No tests added.** Per story testing standard and project precedent — UI gating, no business-logic surface to assert against in a unit test. A Playwright E2E spec is the right tool if one is wanted later (story flagged this as optional follow-up).

**No security boundary added or claimed.** The chip hide is UX hygiene. The actual prevention of player NPC creation is the existing server-side `requireRole('st')` on `/api/npcs/quick-add`. Per story scope, that route was not touched.

**British English** in the (no-op for this story — the only user-visible string changes were deletions of dead-code copy).

### File List

Modified:
- `public/js/tabs/relationships-tab.js` — added `_defaultNpcMode()` helper, gated chip row on `isSTRole()`, defensive guard in `setNpcMode`, removed dead `npcMode === 'existing'` branch
- `specs/stories/sprint-status.yaml` — entry for `issue-232-hide-player-npc-chip` set to `review`
- `specs/stories/issue-232-hide-player-npc-chip.story.md` — this story file (task checkboxes + dev record)

No files added. No files deleted.

### Change Log

- 2026-05-09 — Implemented player-side NPC chip hiding per issue #232. Single file change to `public/js/tabs/relationships-tab.js`: helper for default mode, role-gated chip render, defensive `setNpcMode` coercion, dead-code branch removal. No tests (UI gating, per story standard). Manual smoke verification deferred to QA. (Tasks 1-4)
- 2026-05-09 — QA review (Quinn): **Approve with notes**. 0 blockers, 0 high, 0 medium, 2 low. All ACs satisfied in code. Action items added under "Tasks/Subtasks → Review Follow-ups (AI)" below.

---

## Senior Developer Review (AI)

**Reviewer:** Quinn (bmad-agent-qa)
**Date:** 2026-05-09
**Outcome:** ✅ **Approve with notes** — no blockers; the action items are dead-code cleanup that the `'existing'` branch removal exposed. Optional housekeeping, not gates.

### Summary

Single-file diff. All seven ACs are satisfied at the code level — the `_defaultNpcMode()` helper drives both default sites, the chip block is correctly gated on `isSTRole()`, the `setNpcMode` defensive guard handles cached / stale clicks, and the `'existing'` branch is gone from `renderAddPanel`. The matching `'existing'` and `'new'` branches in `saveAddEdge` are preserved per story scope.

Crucially I verified the `/api/npcs/directory` privacy scoping (server-side, NPCR.14) — even though `_tabState.npcs` is still loaded for player sessions and is now dead-consumed in the UI, the data returned is already filtered to NPCs the player personally created. **No privacy leak**.

Manual browser verification (Task 5) is the only remaining check. That's the user's pass.

This is a much smaller / cleaner story than #231 and the diff reflects that. Nothing to push back on.

### Action items

**LOW — dead network call: `/api/npcs/directory` is now unused in player sessions**

After the `npcMode === 'existing'` branch was removed from `renderAddPanel`, the data fetched at `:743-748` (into `_tabState.npcs`) is no longer rendered for any role. It's still pushed into by the ST-only `saveAddEdge` `'new'` branch at `:991` (so the freshly-created NPC gets added to the cache), but no UI path consumes the cache anymore. Player sessions therefore round-trip the directory unnecessarily on every `+ Add Relationship` click.

**Recommend** one of:
1. Gate the `apiGet('/api/npcs/directory')` call on `isSTRole()` (cheapest fix). Leave the cache for ST quick-add post-creation push.
2. Remove the directory load entirely and replace the L991 push with a no-op (the new NPC is in the database; the cache was only useful for the `existing` select).
3. Leave it — it's a small request and the server is properly scoped.

Lean toward (1) — minimal change, preserves ST behaviour, eliminates the dead call for players.

**LOW — dead local variables in `renderAddPanel`**

After removing the `npcMode === 'existing'` branch, two locals are computed but never read:
- `loading` at `:789` — was rendering "Loading NPCs…" in the deleted branch
- `npcOpts` at `:797-808` — was populating the deleted `<select>`'s options

Both are silent — no runtime error, no warning unless ESLint with `no-unused-vars` is enabled (and the project doesn't appear to lint). **Recommend** removing both as a tidy-up while the dev is already in this file. Two-line deletion. Out of strict scope but trivially in-the-area.

### Tests added by Quinn

None this pass. Per the story testing standard ("UI gating change with no business logic surface, follows feeding-grounds-double-free.test.js precedent"), no unit test is warranted. A Playwright E2E spec would be the appropriate tool if a regression guard is wanted later — same offer that was on #231 (item 5 there): seed a player session, click `+ Add Relationship`, assert no `[data-npc-mode="new"]` element exists, assert PC-to-PC form renders. Say the word if you want it.

### What I verified

- ✅ `_defaultNpcMode()` returns `'new'` for ST, `'pc'` for non-ST (`:29-31`)
- ✅ Both default sites use the helper consistently (`:41`, `:734`)
- ✅ Chip block correctly wrapped — collapses entirely for non-ST (`:820-825`)
- ✅ Defensive guard in `setNpcMode` coerces non-ST callers to `'pc'` regardless of `mode` arg (`:763-776`)
- ✅ Dead `npcMode === 'existing'` branch fully removed from `renderAddPanel`
- ✅ `saveAddEdge` `'existing'` and `'new'` branches preserved (story-scoped)
- ✅ Read-only edge list code path untouched (AC-6)
- ✅ `+ Add Relationship` button untouched (AC-3)
- ✅ `/api/npcs/directory` is server-scoped per NPCR.14 — no privacy leak from the (now-dead) directory load
- ✅ Parse-check passes
- ✅ No existing tests touch the modified file → no regression possible from this change
- ✅ British English: no user-visible string additions (only deletions)

### What I did NOT verify (out of Quinn's static reach)

- ❌ The chip row actually collapses cleanly in a real browser (no leftover spacing / aria-hidden weirdness)
- ❌ The picker form renders correctly with no chip row above it (visual regression check)
- ❌ Hard-refresh as a player → no flash of the hidden `'new'` form on first picker open
- ❌ Character switch with picker open → state resets correctly
- ❌ ST testing in `player.html` → chip + new-NPC form work end-to-end with real `/api/npcs/quick-add` POST
- ❌ Existing pending NPCs (created by players before this fix) still surface correctly in the read-only edge list

These are all in Task 5's manual smoke checklist. **Run them on a local dev server before merging.**
