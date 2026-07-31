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
7. **ADR-008 D10:** `write-path-inventory.py --touches <branch>` exits 0 — display-only established. This changes *when* a module loads, never what is persisted.
8. An ST can still edit and save a story section, and the recompiled `published_outcome` persists across a reload. This is the only behavioural risk in the change.

### Invariants

9. `public/js/admin/downtime-story.js` is **not modified**. Not one line. The whole point of this approach over extraction is that it does not open a frozen-write-path file.
10. `public/js/admin/downtime-views.js` is **not modified** and not opened.
11. No `effectiveRole()` / `getRole()` call site is added. The save UI is already ST-gated at `story-tab.js:934` (`isSTRole() && (cycleStatus === 'closed' || 'complete')`); this story adds no authority logic.

## Tasks / Subtasks

- [x] **Cut the static import, add the dynamic one** (AC: 1, 2)
- [x] **Prewarm on edit click, rejection swallowed** (AC: 3, 4)
- [x] **Gate: shrink, bless, re-tighten** (AC: 5, 6)
  - [x] Record `--paths` output before and after — it is the before/after evidence.
- [x] **D10 display-only check** (AC: 7) — exit 0, **but see note 5: the documented invocation is vacuous**
- [ ] **Browser: ST save round-trip** (AC: 8) — *not observable here; Ma'at*

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
- `python3 specs/qa/harness/write-path-inventory.py --touches <branch>` → exit 0
- Browser, ST session: edit a story section on a closed/complete cycle, save, reload, confirm the recompiled outcome persisted. Watch the network panel to confirm the module fetches on **edit**, not on boot.
- Browser, player session: confirm **zero** requests to `public/js/admin/*`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-30 | 1.0 | Approved. Two-line dynamic import plus prewarm, per measurement that extraction is unnecessary. | Khepri (SM) |

## Dev Agent Record

**Implemented. One behavioural AC (AC8) is browser-only and is not ticked.** `Status` stays `Approved` for that reason. One finding needs the SM's attention: the D10 invocation as documented passes vacuously (note 5).

### Agent Model Used

Ptah (DEV) — claude-opus-5

### Debug Log References

Branch `piatra/issue-1075-admin-leak-cut`, worktree `/private/tmp/tm-ptah/leak-1075`, off `origin/piatra/issue-1075-admin-leak-dynamic-import` (sub-branch because the SM holds the story branch in their own worktree).

| Commit | Content |
|---|---|
| `f9299547` | cut the static import; dynamic import at the call site; prewarm on edit |
| `4ddb6bec` | bless the leak baseline at zero |

Three git-status checkpoints per change. Main checkout was on `dev` throughout and was never touched.

### Completion Notes List

**1. AC5 — the gate, before and after.**

Before (`--paths`, on the story branch base):

```
admin modules statically reachable : 2
uncompressed weight                : 214 KB

public/js/admin/downtime-constants.js  (14 KB)
   3 static path(s):
     app.js -> archive-tab.js  -> story-tab.js -> downtime-story.js -> downtime-constants.js
     app.js -> downtime-tab.js -> story-tab.js -> downtime-story.js -> downtime-constants.js
     app.js -> dt-lookup.js    -> story-tab.js -> downtime-story.js -> downtime-constants.js
public/js/admin/downtime-story.js  (200 KB)
   3 static path(s):
     app.js -> archive-tab.js  -> story-tab.js -> downtime-story.js
     app.js -> downtime-tab.js -> story-tab.js -> downtime-story.js
     app.js -> dt-lookup.js    -> story-tab.js -> downtime-story.js
```

After:

```
admin modules statically reachable : 0
uncompressed weight                : 0 KB

IMPROVED: public/js/admin/downtime-constants.js no longer statically reachable — run --bless
IMPROVED: public/js/admin/downtime-story.js no longer statically reachable — run --bless
```

`--bless` run; baseline records `"modules": []`; gate re-run exit 0 against it. Matches QA's simulation exactly — 2 → 0 with both `IMPROVED` lines.

The `--paths` output is also the evidence for why the join point was the only viable cut: all six paths pass through `story-tab.js`, so removing any one of the three importers would have left the other two and moved the count by zero.

**2. AC6 — the ratchet re-tightens, confirmed on this tree.** Reintroduced the static import at `:9`, re-ran the gate: **exit 1**, naming both modules under `+`. Reverted; exit 0. Both dynamic-import sites intact afterwards.

*I committed the code change before running this.* On ADM-1 the equivalent test reverted a file I still had uncommitted edits in, and `git status` then read clean — the revert destroyed the change under test and looked like success.

**3. AC2/AC3/AC4 — one fetch, not two, and the failure surfaces in the right place.**

The prewarm in `handleSectionEditClick` and the `await` in `handleSectionSave` use **byte-identical specifier strings** (`'../admin/downtime-story.js'`, asserted programmatically), so they resolve to one module-map entry and one network fetch. I deliberately did **not** add my own promise cache: the module map already provides that, and a second cache would be a redundant mechanism — and would also prevent the retry-on-save the story expects after a failed prewarm.

The prewarm's rejection is swallowed (`.catch(() => {})`) because nothing awaits it. The save path's failure is surfaced in the **same shape as the existing `apiPut` catch** (`statusEl.textContent = 'Failed: …'` and return), so a genuine load failure is a visible message rather than an unhandled rejection. Placed before the recompile so no partial state is written on failure.

**4. AC9/AC10/AC11 — invariants hold.** `git status` across the whole change shows two files: `public/js/tabs/story-tab.js` and `specs/qa/harness/admin-leak-baseline.json`. `public/js/admin/downtime-story.js` **not modified** and not opened; `public/js/admin/downtime-views.js` **not modified** and not opened, so #816's nine sites do not ride along. Auth call sites in `story-tab.js` unchanged at 3 (`getRole`/`effectiveRole`/`isSTRole`, comments stripped) — the save UI's existing gate at `:934` was not touched.

**5. AC7 — exit 0, but THE DOCUMENTED INVOCATION PASSES VACUOUSLY. Flagging for the SM.**

`write-path-inventory.py --touches <ref>` computes `git diff --unified=0 <ref> -- public/js` against the **working tree**. The dispatch and the story both say `--touches <your-branch>`. Run from that branch, `<ref>` *is* `HEAD`, so the diff is **empty** and the check reports "DISPLAY-ONLY ESTABLISHED" for a diff containing nothing:

```
git diff --unified=0 piatra/issue-1075-admin-leak-cut -- public/js   ->  0 lines
git diff --unified=0 origin/dev                       -- public/js   -> 34 lines
```

An empty diff trivially reaches no persistence site, so **the pass carries no information**. The meaningful invocation is against the **base**:

```
$ python3 specs/qa/harness/write-path-inventory.py --touches origin/dev
  DISPLAY-ONLY ESTABLISHED — the diff reaches no persistence site.
exit 0
```

**AC7 is genuinely satisfied on the real 34-line diff** — recording both runs so the distinction is not lost. Recommend the story/ADR wording change to `--touches <base>` (i.e. `origin/dev`), because as written every future story gets a free pass by running it the documented way, and the pass looks identical to a real one.

**6. Both gates verified capable of failing, not just of passing.** Neither was taken on trust:

| gate | simulated failure | result |
|---|---|---|
| `admin-leak-gate.py` | reintroduce the static import | exit 1, both modules named |
| `write-path-inventory.py` | add an `apiPut` to `/api/downtime_submissions/:id` in the diff | exit 1, "diff line mutates downtime_submissions" **and** "inventory write site inside a changed hunk" |

Both reverted; tree clean. The second was worth running because it is a gate I had not seen fail, and because its vacuous-invocation behaviour (note 5) meant a green exit was not yet evidence of anything.

### What I could not verify — Ma'at's

No browser and no authenticated session here, so the behavioural criterion is untouched and uninferred:

- **AC8** — ST edits a story section on a `closed`/`complete` cycle, saves, reloads, and the recompiled `published_outcome` persisted. **This is the only real behavioural risk in the change** and it is the one thing a gate cannot establish.
- Network panel, ST session: the 200 KB module fetches on **Edit click**, not on boot — i.e. the prewarm fires and one request appears, not two.
- Network panel, player session: zero requests to `public/js/admin/*`.

Verified statically instead: gate 0 modules/0 KB from the player entry; `story-tab.js` parses; identical specifiers; no static `admin/` import remains; invariants above.

One prediction worth checking against reality rather than asserting: the save path should show **no** network request at all when preceded by an Edit click, since the module map is already populated. If a second request appears, the specifiers diverged or the module map is not being hit, and the no-pause claim in AC3 would be wrong.

### File List

**Modified**

- `public/js/tabs/story-tab.js` — removed the static `compilePushOutcome` import (`:9`, replaced by a comment recording why and naming the gate that enforces it); prewarm `import()` in `handleSectionEditClick`; awaited `import()` with error surfacing at the `handleSectionSave` call site. +26/−1.
- `specs/qa/harness/admin-leak-baseline.json` — blessed to `"modules": []`.
- `specs/stories/leak.1075.admin-static-import-cut.story.md` — this record; task checkboxes.

**Not modified, deliberately:** `public/js/admin/downtime-story.js`, `public/js/admin/downtime-views.js`, and the three importers of `story-tab.js`.

### Change Log addendum

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-30 | 1.1 | Implemented (`f9299547`, `4ddb6bec`). Gate 2 modules/214 KB → 0/0, blessed, ratchet re-tighten confirmed. D10 exit 0 — **and the documented `--touches <your-branch>` invocation found to pass vacuously; re-run against `origin/dev`**. Both gates verified capable of failing. AC8 browser-only, outstanding. | Ptah (DEV) |

## QA Results
