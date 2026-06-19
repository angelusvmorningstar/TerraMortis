# fix.904 — DT Story: merit action outcomes not displayed

```yaml
issue: 904
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/904
branch: ms/issue-904-dt-merit-outcome-field
status: review
type: bug
```

## Story

As an ST, when I confirm an outcome for a merit action in DT Processing, I want
that outcome to appear in both the admin DT Story Allies & Asset Summary and the
player-facing downtime story, so that players actually receive the outcomes I have
written for their Contacts, Allies, and other merit actions.

## Background

The DT Processing panel has an **Outcome** textarea + **Confirm** button for each
merit action. When the ST confirms, `saveEntryReview` patches:

```js
{ outcome: text, outcome_confirmed: true }   // downtime-views.js:5528
```

But the DT Story admin renderer and the player-facing story tab both read
`rev.outcome_summary`, not `rev.outcome`. These fields are never the same write.

The only path that does write `outcome_summary` is the small one-line
`proc-outcome-summary-input` (blur-save only, compact panel). The prominent
textarea + Confirm button — the path an ST naturally uses — writes `outcome`.
Result: confirmed outcomes silently vanish from both the admin summary and the
player's delivered story.

This predates feat #886. That epic explicitly left the merit summary unchanged.

## Acceptance criteria

- [ ] **AC1** — After an ST types in the Outcome textarea and clicks Confirm for any
  merit action (Contacts, Allies, Retainer, Status, etc.) in DT Processing, the
  admin DT Story Allies & Asset Summary shows the confirmed text in the outcome
  column instead of "— Outcome not yet recorded —"
- [ ] **AC2** — The admin ST completion tracker (Dismiss-button section) no longer
  lists that action as pending once its outcome has been confirmed
- [ ] **AC3** — The completion dot for the Allies & Asset Summary section turns green
  once all non-skipped, non-resources merit actions have confirmed outcomes
- [ ] **AC4** — The player-facing story tab (`story-tab.js`) renders the confirmed
  outcome text for the same merit actions
- [ ] **AC5** — Characters where `outcome_summary` was already populated (via the
  compact one-line input) continue to display correctly — the fallback must not
  displace an existing `outcome_summary` value
- [ ] **AC6** — Both compact-panel and full-panel merit action types are fixed (both
  use the same Confirm handler and write `outcome`)
- [ ] **AC7** — No changes to DT Processing panel behaviour or save paths

## Scope

**In scope**
- Read-side fallback in three locations (see Dev Notes for exact lines)
- No server changes; no DB migration; no Processing panel changes

**Out of scope**
- Changing what the Confirm button writes (that is a separate question)
- The `outcome_confirmed` flag and its consumers
- Resources / Skill Acquisition paths (they have their own resolution logic)

---

## Dev Notes

### Root cause — exact locations

All three reads must add `|| rev.outcome?.trim()` as a fallback.

**File 1: `public/js/admin/downtime-story.js`**

Three sites:

**Site A — completion gate (`meritSummaryComplete`)**
```
Line 2245:
  BEFORE:  if (!rev.outcome_summary?.trim()) return false;
  AFTER:   if (!(rev.outcome_summary?.trim() || rev.outcome?.trim())) return false;
```

**Site B — outcome display in `renderMeritSummary`**
```
Line 2272:
  BEFORE:  let outcome = rev.outcome_summary?.trim() || '';
  AFTER:   let outcome = rev.outcome_summary?.trim() || rev.outcome?.trim() || '';
```
The `resources` fallback chain on lines 2274–2280 is untouched — it only runs
when `outcome` (the local variable) is still empty after line 2272.

**Site C — blocking-items tracker**
```
Line 2336:
  BEFORE:  if (rev.outcome_summary?.trim()) return;
  AFTER:   if (rev.outcome_summary?.trim() || rev.outcome?.trim()) return;
```

---

**File 2: `public/js/tabs/story-tab.js`**

Two sites:

**Site D — `hasOutcomeSummaries` guard**
```
Lines 547–549:
  BEFORE:
    const hasOutcomeSummaries =
      resolved.some(rev => rev?.outcome_summary?.trim()) ||
      acqRes.some(rev => rev?.outcome_summary?.trim());

  AFTER:
    const hasOutcomeSummaries =
      resolved.some(rev => rev?.outcome_summary?.trim() || rev?.outcome?.trim()) ||
      acqRes.some(rev => rev?.outcome_summary?.trim());
```
Note: `acqRes` line is unchanged — acquisitions have their own resolution path.

**Site E — per-action summary read**
```
Line 562:
  BEFORE:  let summary = rev.outcome_summary?.trim();
  AFTER:   let summary = rev.outcome_summary?.trim() || rev.outcome?.trim();
```
Line 566 (`if (!summary) return;`) is unchanged — still correct because after
the fallback, `summary` will be populated if either field has a value.

---

### What NOT to change

- `downtime-views.js` — do not alter the Confirm button's write path
- `downtime-views.js:6408` — the compact one-line `outcome_summary` blur-save is
  the correct write path; it stays as-is
- Lines 2273–2280 in `downtime-story.js` — the resources fallback chain runs on
  the local `outcome` variable *after* line 2272; Site B's change feeds into it
  correctly with no further modification
- `acquisitions_resolved` paths in `story-tab.js` — acquisitions use their own
  resolved path, not the same Confirm button

### Preservation invariant

`outcome_summary` takes precedence over `outcome` in every fallback. The pattern
`outcome_summary?.trim() || outcome?.trim()` ensures any value already in
`outcome_summary` (from the compact one-line input) is never overwritten or
displaced by the `outcome` fallback. Existing data is safe.

### No data migration needed

Any submission where the ST clicked Confirm already has `outcome` populated in
MongoDB. The read-side fix surfaces that data immediately on next render.
No backfill script, no server changes.

---

## Testing

No automated test framework. Verify in-browser on dev after merge.

**Manual verification steps:**
1. Open a character's DT processing panel that has a Contacts or Allies action
2. Type an outcome in the large Outcome textarea and click **Confirm**
3. Open DT Story for that character → Allies & Asset Summary should show the
   confirmed text (not "— Outcome not yet recorded —")
4. The completion tracker section should not list that action as pending
5. Open the player-facing story tab for the same character/cycle → the same
   outcome text should appear in the merit summary
6. Verify a character where the compact one-line `proc-outcome-summary-input` was
   used still displays correctly (AC5)

---
_Story created from GitHub issue #904. Branch: `ms/issue-904-dt-merit-outcome-field`_
