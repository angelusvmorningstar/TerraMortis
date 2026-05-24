---
id: fix.493
title: Skill acquisition outcome surfaces in Allies & Asset Summary
status: review
issue: 493
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/493
branch: ms/issue-493-skill-acq-outcome-summary
type: bug
---

## Story

As an ST processing downtimes, after recording an Outcome (Approved / Partial / Failed + narrative) for a skill acquisition action, I want to see that narrative appear immediately in the Allies & Asset Summary, so the DT story is ready to present without needing a page reload.

## Acceptance criteria

- [ ] Given a submission with a skill acquisition and a saved `outcome_summary` in `acquisitions_resolved[0]`, the Allies & Asset Summary row shows that narrative (not "— Outcome not yet recorded —")
- [ ] The completion dot and "✓ All outcomes recorded" badge correctly require an `outcome_summary` to be present for skill acquisitions, not just a `pool_status`
- [ ] Merit action outcomes (Allies, Contacts, etc.) are unaffected

---

## Dev notes

### Prototype context

This fix lives entirely in the DT processing prototype on branch `ms/dt-processing-proto` (parent of this branch). Entry point: `public/dt-proto.html`. All changes are in:

- `public/js/dt-proto-boot.js` — shim PATCH persistence fix
- `public/js/admin/downtime-story.js` — pool_status acceptance + outcome lookup

No new CSS. No server-side changes.

---

### Root cause analysis — three independent bugs

#### Bug 1: Prototype shim does not persist PATCH mutations (primary)

`dt-proto-boot.js` intercepts `/api/` calls with a fetch shim. For PATCH/PUT requests it uses `echo()` which simply reflects the request body back without updating the in-memory `submissions` array:

```js
// dt-proto-boot.js:88
return echo(200); // PUT, PATCH — does NOT persist
```

Consequence: when `saveEntryReview` in `downtime-views.js` saves `acquisitions_resolved` to `PATCH /api/downtime_submissions/:id`, the shim acknowledges but forgets. The story panel later calls `GET /api/downtime_submissions?cycle_id=...` which returns the original unmodified static `submissions` array. So `sub.acquisitions_resolved` is always empty in the story panel.

**Fix — add a PATCH persistence branch before the catch-all in `dt-proto-boot.js`:**

```js
// Insert BEFORE the final: return echo(200); // PUT, PATCH
if (method === 'PATCH' && seg[0] === 'downtime_submissions' && seg[1]) {
  const subId = seg[1];
  const idx = submissions.findIndex(s => String(s._id) === String(subId));
  if (idx !== -1) {
    const body = opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return {}; } })() : {};
    Object.assign(submissions[idx], body);
  }
  return echo(200);
}
```

This merges the patched fields into the in-memory `submissions` array so subsequent GETs return fresh data. Note: the shim's GET handler at line 51–56 reads directly from the `submissions` variable, so this is sufficient without touching the GET handler.

---

#### Bug 2: `meritSummaryComplete` accepts wrong pool_status for skill acquisitions

`meritSummaryComplete` (`downtime-story.js:2276`) decides whether to show "✓ All outcomes recorded". For the resources category it checks:

```js
// downtime-story.js:2291
if (acqStatus !== 'validated' && acqStatus !== 'skipped') return false;
```

The Outcome card (`.proc-merit-outcome-btn`) saves `pool_status: 'resolved'`. The accepted set only includes `'validated'` and `'skipped'` — `'resolved'` is missing. So after clicking Approved on a skill acquisition, `meritSummaryComplete` still returns `false`.

**Fix — add `'resolved'` to the accepted set at line 2291:**

```js
// BEFORE:
if (acqStatus !== 'validated' && acqStatus !== 'skipped') return false;

// AFTER:
if (!['validated', 'skipped', 'resolved'].includes(acqStatus)) return false;
```

---

#### Bug 3: Blocking items check accepts wrong pool_status (same pattern)

`renderMeritSummary` (`downtime-story.js:2305`) builds `blockingItems` to decide which acquisitions still need attention. For resources category:

```js
// downtime-story.js:2380
if (acqStatus === 'validated' || acqStatus === 'skipped') return;
```

Same issue — `'resolved'` is not in the accepted set, so a skill acquisition with `pool_status: 'resolved'` stays in `blockingItems` even after the outcome is recorded.

**Fix — add `'resolved'` at line 2380:**

```js
// BEFORE:
if (acqStatus === 'validated' || acqStatus === 'skipped') return;

// AFTER:
if (['validated', 'skipped', 'resolved'].includes(acqStatus)) return;
```

---

### What to verify after the fix

1. Open `http://localhost:8080/dt-proto.html`
2. Open the processing panel for a submission with a skill acquisition
3. Click Approved / Partial / Failed on the Outcome card → enter a narrative → blur the input
4. Open the DT Story panel for the same submission
5. Allies & Asset Summary should show the narrative in the Skill Acquisition row
6. "✓ All outcomes recorded" badge should appear
7. Verify that merit action rows (Allies, Contacts etc.) still display their outcomes correctly

---

### What NOT to change

- `saveEntryReview` save path: already correct — saves to `acquisitions_resolved[entry.actionIdx]`
- The Outcome card rendering (`_renderMeritOutcomeZone`): already correct (fix.491)
- The `acquisitions_resolved[0]` lookup in `renderMeritSummary` at line 2323: correct for single-acquisition-per-submission constraint (PR #187 context)
- `meritSummaryComplete`'s Resources-merit `revStatus` branch (line 2288–2289): this reads `merit_actions_resolved[i].pool_status` for the Resources merit itself (not the skill acquisition), which can legitimately be `'validated'` — leave this alone

---

### Exact line numbers (current branch)

| File | Line | What |
|------|------|------|
| `public/js/dt-proto-boot.js` | 88 (before catch-all return) | Add PATCH persistence for `downtime_submissions` |
| `public/js/admin/downtime-story.js` | 2291 | `meritSummaryComplete` — add `'resolved'` to accepted acqStatus |
| `public/js/admin/downtime-story.js` | 2380 | blocking items check — add `'resolved'` to accepted acqStatus |

No other files need to change.

---

## Files to change

| File | Change |
|------|--------|
| `public/js/dt-proto-boot.js` | Add PATCH persistence branch before line 88 |
| `public/js/admin/downtime-story.js` | Lines 2291 and 2380: add `'resolved'` to pool_status accepted set |
