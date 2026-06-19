# fix.914 — DT Story: Resources/Skill Acquisition outcomes not displayed

```yaml
issue: 914
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/914
branch: morningstar-issue-914-acquisition-outcomes
status: review
type: bug
predecessor: 904
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Implementation summary

Read-side only; no server, DB, or write-path changes. The acquisition contract is
two fixed slots — Resources → `acquisitions_resolved[0]`, Skill Acquisition →
`acquisitions_resolved[1]` (write side `downtime-views.js:3578/3599`). Every
acquisition read now (a) selects the slot by kind and (b) reads
`outcome_summary?.trim() || outcome?.trim()` (mirrors #904 preservation invariant).

**`public/js/admin/downtime-story.js`**
- `renderMeritSummary` resources branch — slot-by-kind (`/skill/i.test(merit_type) ? 1 : 0`),
  read both outcome fields, and the notes_thread fallback now uses the same slot
  instead of hardcoded `[0]`.
- `meritSummaryComplete` resources gate — slot-by-kind; a confirmed outcome
  (`outcome_summary || outcome`) now counts as resolved even when `pool_status`
  is still `pending` (no-roll acquisitions never advance pool_status).
- Blocking-items resources gate — same slot-by-kind + outcome-present clears the
  "acquisition outcome pending" flag.

**`public/js/tabs/story-tab.js`**
- `hasOutcomeSummaries` acqRes guard now accepts `.outcome` as well as
  `.outcome_summary`.
- Per-action read — acquisition fallback broadened from Skill-only to all
  `action_type === 'acquisition'`, selecting slot `[1]` for Skill Acquisition and
  `[0]` for Resources, reading both fields. (Resources rows previously had no
  acquisition fallback at all and were dropped.)
- Updated the stale build-order comment that claimed skill aligns with slot `[0]`.

No skill→`[0]` fallback was added: that would cross-wire a skill row onto the
resources outcome (the #460 hazard). Skill reads its merit slot then `[1]` only.

### Testing

- Corrected `tests/fix-491-skill-acquisition-outcome-card.spec.js` AC-1/AC-3
  fixtures: skill outcomes moved to `acquisitions_resolved[1]` (`[0]` null-padded),
  matching the real write side. The earlier `[0]` placement modelled the bug.
- Added `tests/fix-914-acquisition-outcome-field-slot.spec.js` (5 ACs): `.outcome`-
  field reads, skill slot `[1]` (no cross-read of `[0]`), Brandy resources+skill
  shape, pending-but-confirmed completion gate, and `outcome_summary` precedence.
- Regression-checked fix-456 (merit_actions_resolved path + early `revStatus`
  continue preserved) and fix-460 (flat-index cross-wiring; uses empty acqRes).

### File List

- `public/js/admin/downtime-story.js` (modified)
- `public/js/tabs/story-tab.js` (modified)
- `tests/fix-914-acquisition-outcome-field-slot.spec.js` (new)
- `tests/fix-491-skill-acquisition-outcome-card.spec.js` (modified — fixture correction)
- `specs/stories/fix.914.dt-acquisition-outcomes-surface.story.md` (this file)

### Change Log

- Read-side acquisition outcome fallback (field + slot) across admin DT Story and
  player Story tab; completion/blocking gates count confirmed outcomes as resolved.

## QA Results (Quinn)

**Verdict: PASS** — 19 specs green (fix-914 ×7, fix-491 ×7, fix-456 ×5), 0 regressions.

Coverage check against ACs:
- AC1 (resources `.outcome` surfaces) — fix-914 AC-1 ✓
- AC2 (skill reads slot [1]) — fix-914 AC-3 ✓; cross-wiring guard added (AC-7)
- AC4 (pending pool_status + confirmed outcome = resolved) — fix-914 AC-2 ✓
- AC5 (outcome_summary precedence) — fix-914 AC-5 ✓
- AC6 (no migration) — read-side only, verified by code ✓
- AC7 (multi-row Resources share slot [0]) — fix-914 AC-6 ✓ (added in QA)

QA-added tests (gaps the dev pass missed):
- **AC-6 multi-row Resources** — Xavier's real "Resources (Row 1/2)" shape; both rows
  correctly share the single slot [0] outcome (outcome text appears exactly twice).
- **AC-7 cross-wiring sentinel** — empty skill slot [1] with a populated resources slot
  [0]: skill row shows the placeholder and the resources text appears exactly once
  (never duplicated onto the skill row). Proves no skill→[0] fallback — the #460 hazard.
- Corrected fix-491 fixtures (skill outcome [0]→[1]) verified still green.

**Known coverage gap (not a blocker):** the player-side `story-tab.js`
`renderMeritSummarySection` change has no automated coverage — reaching the published
player downtime-story report needs a processed-cycle unified-app harness that does not
yet exist (`tests/helpers/unified-app.js` boots the form, not the story report). The
player logic is symmetric with the now-fully-covered admin path. Recommend: manual
verify on dev once pushed (story Testing step 5), and a follow-up to build the
player-story-report test harness if this area sees more change.

## Story

As an ST, when I confirm an outcome for a Resources or Skill Acquisition action in
DT Processing, I want that outcome to appear in both the admin DT Story Allies &
Asset Summary and the player-facing downtime story, so that players actually
receive the acquisition outcomes I have written — the same way merit action
outcomes were fixed in #904.

## Background

#904 fixed the `outcome_summary` vs `outcome` read mismatch for **merit actions**
(`merit_actions_resolved[i]`), but it explicitly scoped out the acquisition paths
("Resources / Skill Acquisition paths — they have their own resolution logic").
This story closes that gap. The acquisition reads still only look at
`acquisitions_resolved[…].outcome_summary` (never `.outcome`), and the Skill
Acquisition read uses the wrong index.

### How acquisitions are written (the canonical mapping)

The DT Processing queue creates **exactly two** acquisition entries, both with
`source: 'acquisition'` (`downtime-views.js`):

| Queue entry | actionType | `actionIdx` | Write target |
|-------------|-----------|-------------|--------------|
| Resources Acquisitions (line 3567) | `resources_acquisitions` | **0** | `acquisitions_resolved[0]` |
| Skill Acquisitions (line 3588)     | `skill_acquisitions`     | **1** | `acquisitions_resolved[1]` |

When the ST confirms, `saveEntryReview` writes `{ outcome, outcome_confirmed:true }`
to `acquisitions_resolved[entry.actionIdx]` (`downtime-views.js:3804-3810`). So
**all** resource rows resolve to slot `[0]` and **all** skill rows resolve to slot
`[1]`. The big Outcome textarea + Confirm button writes `.outcome`; the compact
one-line `proc-outcome-summary-input` writes `.outcome_summary`. As in #904, the
ST naturally uses the textarea, so live data has `.outcome` populated and
`.outcome_summary` empty.

### The three defects

1. **Field mismatch (mirror of #904).** Every acquisition read looks at
   `.outcome_summary` only, so textarea-confirmed acquisition outcomes (stored in
   `.outcome`) never display.

2. **Wrong index for Skill Acquisition.** The renderer reads
   `acquisitions_resolved[0]` for Skill Acquisition rows, but skill outcomes are
   written to `acquisitions_resolved[1]`. So even with the field fix a skill
   outcome reads the *resources* slot. (The issue body framed this as "hardcode
   `[0]` drops all but the first acquisition" — the precise structure is two fixed
   slots; the real bug is skill reading slot 0 instead of slot 1.)

3. **Completion / blocking gate keys on `pool_status`, not outcome presence.** The
   resources-category gates require `acqRes[…].pool_status ∈
   {validated,skipped,resolved}`. A no-roll acquisition the ST narrated keeps
   `pool_status:'pending'` even after `outcome` + `outcome_confirmed` are written,
   so it stays flagged "acquisition outcome pending" and the completion dot never
   greens.

### Live-data confirmation (DT4)

- **Xavier Boussade** — `acquisitions_resolved[0].outcome` = "Both are delivered…
  Somewhere?…", no `.outcome_summary`. Two Resources rows both map to `[0]`.
  Field fix surfaces it for both.
- **Anichka** — `acquisitions_resolved[0].outcome` = "It honestly shits you off…",
  no `.outcome_summary`. Field fix surfaces it.
- **Brandy LaRoux** — `[0].outcome` = "Money goes out…" (Resources, no summary);
  `[1]` has both `.outcome_summary` + `.outcome` = "While not 'powered'…" (Skill
  Acquisition, `roll_mode:'player'`). Resources rows need the field fix; the Skill
  Acquisition row needs the **index** fix (`[0]→[1]`) to read its own slot.

## Acceptance criteria

- [ ] **AC1** — A Resources acquisition whose outcome the ST confirmed via the
  Outcome textarea (stored in `acquisitions_resolved[0].outcome`, no
  `outcome_summary`) displays in the admin DT Story Allies & Asset Summary
  Resources rows instead of "— Outcome not yet recorded —".
- [ ] **AC2** — A Skill Acquisition whose outcome was confirmed reads
  `acquisitions_resolved[1]` (not `[0]`) and displays its own outcome text in both
  the admin DT Story and the player Story tab.
- [ ] **AC3** — The player-facing Story tab (`story-tab.js`) renders Resources
  acquisition outcomes (currently it has no acquisition fallback for Resources
  rows at all — only Skill Acquisition) and Skill Acquisition outcomes from the
  correct slots.
- [ ] **AC4** — Once an acquisition has a confirmed outcome (text present), the
  admin completion tracker no longer lists it under "outcomes still to record",
  and the Allies & Asset Summary completion dot can turn green, **regardless of
  `pool_status`**.
- [ ] **AC5** — `outcome_summary` continues to take precedence over `outcome` in
  every fallback (preservation invariant from #904): `outcome_summary?.trim() ||
  outcome?.trim()`. Brandy's `[1]` (which has both) is unaffected.
- [ ] **AC6** — No write-side, server, or DB-migration changes. The fix is
  read-side only and surfaces already-stored DT4 outcomes on next render.
- [ ] **AC7** — Multi-row Resources submissions (e.g. Xavier's two rows) show the
  single confirmed `[0]` outcome on each Resources row (current display behaviour
  preserved — they share one acquisition resolution).

## Scope

**In scope**
- Read-side acquisition field fallback (`outcome_summary || outcome`) in
  `downtime-story.js` and `story-tab.js`
- Correct slot indexing: Resources → `acquisitions_resolved[0]`, Skill Acquisition
  → `acquisitions_resolved[1]`
- Completion / blocking gates treat a confirmed-outcome acquisition as resolved
  even when `pool_status` is still `pending`
- Player Story-tab Resources rows gain the acquisition outcome fallback they
  currently lack

**Out of scope**
- The write path (Confirm button / compact input already write correctly)
- **Protect / approved-only merit actions** — e.g. Xavier's Allies (Bureaucracy)
  "Destroy paper trail to Necropolis" (`{protected_merit_name, merit_outcome:
  "approved"}`), Brandy's MCI, Brandy's empty Allies rows (`{merit_outcome:
  "approved"}` only). These have no ST prose, so "not yet recorded" is technically
  correct. Whether they should instead render as resolved (e.g. "Protected — no
  further action") is a **decision pending from Angelus** (see Open Question) and
  must not be implemented in this story.
- Changing how many acquisition slots exist (two fixed slots is the current
  contract)

---

## Dev Notes

### Files to read before editing

- `public/js/admin/downtime-story.js` — `meritSummaryComplete` (2227-2247),
  `renderMeritSummary` (2256-2287), blocking-items loop (2322-2341)
- `public/js/tabs/story-tab.js` — `renderMeritSummarySection` (541-599),
  `buildPlayerMeritActions` (609+)
- `public/js/admin/downtime-views.js` — queue build (3566-3602), `getEntryReview`
  (3741), `saveEntryReview` acquisition branch (3804-3810) — **reference only, do
  not modify**

### Exact change sites

All acquisition reads must (a) add the `|| …outcome?.trim()` field fallback and
(b) select the slot by acquisition kind: Resources → `[0]`, Skill Acquisition →
`[1]`.

**File 1: `public/js/admin/downtime-story.js`**

In `renderMeritSummary`, the `cat === 'resources'` branch (lines 2273-2281) covers
BOTH Resources and Skill Acquisition (because `deriveMeritCategory` folds `skill`
into `resources`). It currently reads only `acquisitions_resolved[0].outcome_summary`:

```
Line 2274:
  BEFORE: if (!outcome) outcome = sub?.acquisitions_resolved?.[0]?.outcome_summary?.trim() || '';
```
Change to pick the slot by kind and add the field fallback. Determine kind from the
action's `merit_type` (the entry built at 2122-2127 uses `'Skill Acquisition'`):
```
  AFTER (sketch):
    const acqIdx = /skill/i.test(a.merit_type) ? 1 : 0;
    const acq    = sub?.acquisitions_resolved?.[acqIdx];
    if (!outcome) outcome = acq?.outcome_summary?.trim() || acq?.outcome?.trim() || '';
    // notes_thread fallback (2275-2280) must use the same acqIdx, not [0]
```
> Note: `a` is the current action in the `actions.forEach((a, i) => …)` loop
> (line 2264). Verify the `merit_type` strings emitted by `buildMeritActions`
> (`'Resources'`, `'Resources (Row N)'`, `'Skill Acquisition'`) so the regex picks
> skill correctly.

`meritSummaryComplete` resources branch:
```
Lines 2241-2242:
  BEFORE:
    const acqStatus = acqRes[0]?.pool_status || '';
    if (!['validated', 'skipped', 'resolved'].includes(acqStatus)) return false;
```
Use the correct slot for skill vs resources, and treat a confirmed outcome as
satisfying the gate:
```
  AFTER (sketch):
    const acqIdx = /skill/i.test(actions[i].merit_type) ? 1 : 0;
    const acq    = acqRes[acqIdx] || {};
    const acqResolved = ['validated','skipped','resolved'].includes(acq.pool_status || '')
      || !!(acq.outcome_summary?.trim() || acq.outcome?.trim());   // AC4: outcome-present counts
    if (!acqResolved) return false;
```

Blocking-items resources branch:
```
Lines 2330-2331:
  BEFORE:
    const acqStatus = acqRes[0]?.pool_status || '';
    if (['validated', 'skipped', 'resolved'].includes(acqStatus)) return;
```
```
  AFTER (sketch):
    const acqIdx = /skill/i.test(a.merit_type) ? 1 : 0;
    const acq    = acqRes[acqIdx] || {};
    if (['validated','skipped','resolved'].includes(acq.pool_status || '')
        || acq.outcome_summary?.trim() || acq.outcome?.trim()) return;
```

**File 2: `public/js/tabs/story-tab.js`**

`hasOutcomeSummaries` guard — acqRes line must also accept `.outcome`:
```
Line 549:
  BEFORE:  acqRes.some(rev => rev?.outcome_summary?.trim());
  AFTER:   acqRes.some(rev => rev?.outcome_summary?.trim() || rev?.outcome?.trim());
```

Per-action read (lines 562-565). Today only Skill Acquisition has an acquisition
fallback, and it reads `[0]`. Resources rows fall through with no acquisition
fallback at all (so they are dropped by `if (!summary) return;` at 566). Fix both:
```
  BEFORE:
    let summary = rev.outcome_summary?.trim() || rev.outcome?.trim();
    if (!summary && a.merit_type === 'Skill Acquisition' && a.action_type === 'acquisition') {
      summary = acqRes[0]?.outcome_summary?.trim() || '';
    }
  AFTER (sketch):
    let summary = rev.outcome_summary?.trim() || rev.outcome?.trim();
    if (!summary && a.action_type === 'acquisition') {
      const acqIdx = a.merit_type === 'Skill Acquisition' ? 1 : 0;
      const acq    = acqRes[acqIdx];
      summary = acq?.outcome_summary?.trim() || acq?.outcome?.trim() || '';
    }
```
> Confirm `buildPlayerMeritActions` sets `action_type:'acquisition'` and
> `merit_type` of `'Resources' | 'Resources (Row N)' | 'Skill Acquisition'` for
> these rows (mirror of `downtime-story.js` builder) before relying on the regex.

### Preservation invariant (from #904)

`outcome_summary?.trim() || outcome?.trim()` everywhere — never let the `outcome`
fallback displace an existing `outcome_summary`. Brandy's `[1]` has both; it must
keep showing the `outcome_summary` value.

### What NOT to change

- `downtime-views.js` write paths (3567-3602 queue, 3804-3810 save) — reference only
- The two-slot acquisition contract (Resources=0, Skill=1)
- The merit-action (`merit_actions_resolved[i]`) reads already fixed by #904
- Protect / approved-only merit rendering (out of scope, pending decision)

### No data migration

Every DT4 acquisition the ST confirmed already has `.outcome` in MongoDB. The
read-side fix surfaces it on next render. Merit summary is live-rendered (no
`published_outcome` backfill).

---

## Testing

No automated test framework. Verify in-browser on dev after merge (Angelus cannot
test server-touching paths locally; this is client-only JS so dev frontend is
sufficient once pushed).

**Manual verification (use the real DT4 submissions named above):**
1. Admin DT Story → Xavier Boussade: both Resources rows show "Both are
   delivered… Somewhere?…" (not "Outcome not yet recorded").
2. Admin DT Story → Anichka: Resources row shows "It honestly shits you off…".
3. Admin DT Story → Brandy: Resources rows show "Money goes out…"; Skill
   Acquisition row shows "While not 'powered', you find a fetish…" (proves the
   `[0]→[1]` index fix — before the fix it would be blank or show the resources
   text).
4. For each of the above, the "N outcomes still to record" note and the per-item
   blocking list no longer flag those acquisitions, and the completion dot can
   green (AC4), despite `pool_status:'pending'` on `[0]`.
5. Player Story tab for the same characters/cycle: the same acquisition outcomes
   render (Resources rows were previously dropped entirely).
6. Regression: a submission where `outcome_summary` was set via the compact
   one-line input still displays that value unchanged (AC5).

---

## Open Question (for Angelus — do not implement until decided)

Protect / approved-only merit actions (`merit_outcome:"approved"` with no prose,
and `protected_merit_name` hide/protect actions) currently render "— Outcome not
yet recorded —" because no ST prose exists. Options:
- **(a)** Leave as-is — absence of prose is a real workflow gap; ST should write a
  line.
- **(b)** Render protect/approved actions as resolved with a synthesized line
  (e.g. "Protected — no further action needed") so they stop blocking completion.

This is deliberately out of scope for fix.914. Flag for a follow-up issue once
decided.

---
_Story created from GitHub issue #914 via tm-gh-issue-pickup → bmad-create-story.
Branch: `morningstar-issue-914-acquisition-outcomes`. Predecessor: fix.904._
