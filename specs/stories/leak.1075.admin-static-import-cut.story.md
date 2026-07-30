---
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1075
adr: ADR-008 D4 (attributable + ratchet), D10 (display-only)
branch: piatra/issue-1075-admin-leak-dynamic-import
relates: ADM (#1064), #816
---

# Story LEAK-1075: cut the static admin import from story-tab.js — stop shipping 214 KB of ST code to every player

## Status

Approved

## Story

**As a** player opening the app on a phone at a game table,
**I want** to stop downloading 214 KB of Storyteller-only JavaScript I can never use,
**so that** the page costs what it should — and so the "no admin modules for players" criterion stops being unmeasurable, which is what blocks every future surface move from being gated honestly.

## Acceptance Criteria

1. The static import at `story-tab.js:9` — `import { compilePushOutcome } from '../admin/downtime-story.js'` — is **removed**.
2. `compilePushOutcome` is obtained by **dynamic `import()`** at its single call site inside `handleSectionSave()` (`story-tab.js:1041`). That function is **already `async`** and already awaits `apiPut` a few lines later, so no signature change and no new async boundary is introduced.
3. **Prewarm:** `handleSectionEditClick()` fires the same `import()` **without awaiting it**, so the module is fetched while the ST types. Module resolution is cached, so the save path's `await` then resolves from cache and the fetch is never visible.
4. The prewarm **must not** produce an unhandled rejection — swallow its failure (`.catch(() => {})`). The save path's `await` is what surfaces a genuine load failure, so failing there is correct and failing at prewarm is noise.
5. **`admin-leak-gate.py` goes from 2 modules / 214 KB to 0 modules / 0 KB**, printing `IMPROVED` for both. Then `--bless` is run, and the baseline records `"modules": []`.
6. **The ratchet is confirmed to re-tighten** after blessing: reintroducing the static import fails with exit 1 and both modules named. Revert the reintroduction.
7. **ADR-008 D10:** `write-path-inventory.py --touches origin/dev` exits 0 — display-only established. This changes *when* a module loads, never what is persisted.
   **Invoke against the BASE, never against your own branch.** `--touches <ref>` diffs the WORKING TREE against `<ref>`, so `--touches <your-own-branch>` compares HEAD to itself, examines **zero lines**, and prints a PASS that is textually identical to a real one. An earlier draft of this story said `--touches <branch>` and would have granted a free pass to anyone following the instructions.
8. An ST can still edit and save a story section, and the recompiled `published_outcome` persists across a reload. This is the only behavioural risk in the change.

### Invariants

9. `public/js/admin/downtime-story.js` is **not modified**. Not one line. The whole point of this approach over extraction is that it does not open a frozen-write-path file.
10. `public/js/admin/downtime-views.js` is **not modified** and not opened.
11. No `effectiveRole()` / `getRole()` call site is added. The save UI is already ST-gated at `story-tab.js:934` (`isSTRole() && (cycleStatus === 'closed' || 'complete')`); this story adds no authority logic.

## Tasks / Subtasks

- [ ] **Cut the static import, add the dynamic one** (AC: 1, 2)
- [ ] **Prewarm on edit click, rejection swallowed** (AC: 3, 4)
- [ ] **Gate: shrink, bless, re-tighten** (AC: 5, 6)
  - [ ] Record `--paths` output before and after — it is the before/after evidence.
- [ ] **D10 display-only check** (AC: 7)
- [ ] **Browser: ST save round-trip** (AC: 8)

## Dev Notes

### Why this is two lines and not a refactor

The issue originally scoped this as extracting `compilePushOutcome` and its transitive closure into a shared module — a real refactor on a frozen-write-path file, with a closure nobody had measured.

Measurement made that unnecessary. `story-tab.js` imports **exactly one** thing from `admin/`, uses it at **exactly one** call site, and that call site is already inside an `async` function that already awaits. So the dependency can be moved from load-time to use-time without touching the module it points at.

**Correction to the issue's earlier scoping:** this does **not** open `admin/downtime-views.js`, so **#816's nine sites there do not ride along**. That consolidation still needs its own entry into that file, when the ADM P1 downtime surfaces open it. The four `downtime-form.js` sites are separate and partly handled by PR #1084.

### The cut is measured, not inferred

QA simulated exactly this cut against `dev` and got 2 modules → 0, with both `IMPROVED` lines. Three modules import `story-tab.js` (`archive-tab.js:16`, `downtime-tab.js:6`, `dt-lookup.js:4`) and all three inherit the leak through this single join point, so cutting it closes the leak for all of them at once.

**Trap:** if you find yourself removing one of those three importers, stop — that is the wrong fix and the count will not move.

### The one real cost, and why prewarm answers it

Dynamic import means the module is fetched on first use. Without prewarm, an ST's first story-section save would pause for a 200 KB fetch.

Prewarming on the **edit** click hides that entirely behind the ST's own typing time: they click Edit, the fetch starts, they type, they click Save, the module is already cached. `import()` returns the same cached promise for repeat calls, so the prewarm and the save-path call are the same fetch — no double request.

If the prewarm fails (offline, 404), the save path's `await` retries and surfaces the real error. That is why the prewarm's rejection is swallowed rather than reported: reporting it would fire a spurious error for a fetch nobody was waiting on.

### Why the gate matters more than the kilobytes

`ADR-008 D4` makes "a player fetches zero modules from `public/js/admin/`" the acceptance criterion for **every** surface the admin merge moves across. With this leak present the criterion is unmeasurable — a reviewer sees two modules and cannot distinguish expected-legacy from new-regression, so sixteen future passes would assert nothing.

Blessing the baseline at zero makes it meaningful for the first time, and QA has confirmed the ratchet then re-tightens: any accidental reintroduction fails immediately. With three importers, accidental reintroduction is the plausible regression.

### Relevant files

- `public/js/tabs/story-tab.js` — the only file changed (`:9` import, `:958` prewarm, `:1041` call site)
- `specs/qa/harness/admin-leak-gate.py`, `admin-leak-baseline.json` — gate and ratchet
- `specs/qa/harness/write-path-inventory.py` — the D10 check

## Testing

No unit framework. Gates and one browser path:

- `python3 specs/qa/harness/admin-leak-gate.py` → 0 modules, `IMPROVED` ×2; then `--bless`; then confirm re-tighten and revert
- `python3 specs/qa/harness/write-path-inventory.py --touches origin/dev` → exit 0 (against the BASE — see AC7; against your own branch it examines nothing and passes vacuously)
- Browser, ST session: edit a story section on a closed/complete cycle, save, reload, confirm the recompiled outcome persisted. Watch the network panel to confirm the module fetches on **edit**, not on boot.
- Browser, player session: confirm **zero** requests to `public/js/admin/*`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-30 | 1.0 | Approved. Two-line dynamic import plus prewarm, per measurement that extraction is unnecessary. | Khepri (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
