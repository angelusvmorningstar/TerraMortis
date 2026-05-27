---
id: fix.491
title: Skill acquisition actions render Outcome card, not Validation Status
status: review
issue: 491
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/491
branch: ms/issue-491-skill-acquisition-outcome
type: bug
---

## Story

As an ST processing downtimes, I want skill acquisition actions to show an Outcome card (Approved / Partial / Failed + narrative), so I can record what happened and have it surface in the Allies & Asset Summary the same way merit actions do.

## Acceptance criteria

- [x] Skill acquisition action rows render an Outcome card (Approved / Partial / Failed + narrative input), not a Validation Status card
- [x] Clicking Approved / Partial / Failed saves `merit_outcome` + `pool_status: 'resolved'` to `acquisitions_resolved[actionIdx]` (existing save path — no new wiring needed)
- [x] Typing in the narrative input saves `outcome_summary` to `acquisitions_resolved[actionIdx]`
- [x] The Allies & Asset Summary in the DT story shows the recorded `outcome_summary` for skill acquisitions (not "— Outcome not yet recorded —")
- [x] Merit-based action outcomes are unaffected

---

## Dev notes

### Prototype context

This fix lives entirely in the DT processing prototype on branch `ms/dt-processing-proto`. Entry point: `public/dt-proto.html`. All changes are in:

- `public/js/admin/downtime-views.js` — rendering fix
- `public/js/admin/downtime-story.js` — summary lookup fix

No server-side changes. No new CSS needed (all required classes exist).

---

### Part 1 — downtime-views.js: replace Validation Status with Outcome card

#### Why skill acquisitions hit Validation Status

At **downtime-views.js:9108**:

```js
if (entry.source !== 'feeding' && entry.source !== 'project' && !isSorcery && entry.source !== 'merit') {
  // renders Validation Status card
```

Skill acquisitions have `entry.source === 'acquisition'`, so they fall through this condition and get the Validation Status card. Only `entry.source === 'merit'` was excluded.

#### The fix — two-part change at line 9108

**Step A:** Extend the Validation Status condition to also exclude skill acquisitions:

```js
// BEFORE (line 9108):
if (entry.source !== 'feeding' && entry.source !== 'project' && !isSorcery && entry.source !== 'merit') {

// AFTER:
const isSkillAcq = entry.source === 'acquisition' && entry.actionType === 'skill_acquisitions';
if (entry.source !== 'feeding' && entry.source !== 'project' && !isSorcery && entry.source !== 'merit' && !isSkillAcq) {
```

**Step B:** Render the Outcome card for skill acquisitions. Insert this block immediately after the closing `}` at line 9092 (end of the `if (entry.actionType === 'skill_acquisitions')` pool display block):

```js
// After the pool columns block (line 9091-9092):
  h += '</div>'; // proc-detail-grid
}

// ADD THIS:
if (isSkillAcq) {
  h += _renderMeritOutcomeZone(entry, rev);
}
```

Note: `isSkillAcq` is defined in Step A before the Validation Status block. Make sure it's in scope here (move the `const isSkillAcq` declaration before the acquisition section if needed, not just before line 9108).

#### `_renderMeritOutcomeZone` — what it renders and how it saves

Function at **downtime-views.js:7028**. It emits:
- `.proc-merit-outcome-btn` buttons (Approved / Partial / Failed)
- `.proc-outcome-summary-input` text input

Both are already wired at **lines 6055–6073**:

```js
// line 6062 — saves merit_outcome + pool_status:'resolved' via saveEntryReview
// line 6073 — saves outcome_summary via saveEntryReview
```

`saveEntryReview` for acquisition entries (**line 3655**) routes to `acquisitions_resolved[entry.actionIdx]`. No new wiring needed — the existing handlers cover skill acquisitions automatically once the HTML is rendered.

The function needs `entry.meritCategory` for the MERIT_MATRIX lookup, but if it's absent, `mode` defaults to `'auto'` and the card renders fine. Skill acquisitions don't need to be blocked or auto-resolved.

---

### Part 2 — downtime-story.js: fix outcome lookup in renderMeritSummary

#### Why the summary shows "— Outcome not yet recorded —"

`buildMeritActions()` (**downtime-story.js:2015**) builds a synthetic `actions` array that includes skill acquisitions appended at the end (line 2159–2188). This result is assigned to `sub.merit_actions` in memory at load time (**line 171**).

`renderMeritSummary` (**line 2305**) iterates this array with:

```js
const actions  = sub?.merit_actions || [];
const resolved = sub?.merit_actions_resolved || [];
```

For a skill acquisition at index `i` in `actions`, `resolved[i]` reads `merit_actions_resolved[i]` — but skill acquisition outcomes are saved to `acquisitions_resolved[actionIdx]`, not `merit_actions_resolved`. So `resolved[i]` is `undefined`, and `outcome_summary` is always blank.

Note: `deriveMeritCategory('Skill Acquisition')` returns `'resources'` (matches `/skill/` regex at line 2206). So in the summary, skill acquisitions are grouped under the 'resources' category. The blocking-check code at line 2373 already has a resources-specific branch that reads `acqRes[0]?.pool_status` — awareness of this split already exists.

#### The fix — downtime-story.js:2321

In `renderMeritSummary`, when building `outcome` for a 'resources' category entry, also check `acquisitions_resolved` for `outcome_summary`:

```js
// BEFORE (line 2321):
let outcome = rev.outcome_summary?.trim() || '';
if (cat === 'resources') {
  const thread = (Array.isArray(rev.notes_thread) && rev.notes_thread.length ? rev.notes_thread : null)
    || (Array.isArray(sub?.acquisitions_resolved?.[0]?.notes_thread) && sub.acquisitions_resolved[0].notes_thread.length
      ? sub.acquisitions_resolved[0].notes_thread : null);
  if (thread) outcome = thread[thread.length - 1]?.text?.trim() || '';
}

// AFTER:
let outcome = rev.outcome_summary?.trim() || '';
if (cat === 'resources') {
  // For skill acquisitions, outcome_summary is in acquisitions_resolved, not merit_actions_resolved
  if (!outcome) outcome = sub?.acquisitions_resolved?.[0]?.outcome_summary?.trim() || '';
  // Fallback: last ST notes thread entry (Resources acquisition legacy path)
  if (!outcome) {
    const thread = (Array.isArray(rev.notes_thread) && rev.notes_thread.length ? rev.notes_thread : null)
      || (Array.isArray(sub?.acquisitions_resolved?.[0]?.notes_thread) && sub.acquisitions_resolved[0].notes_thread.length
        ? sub.acquisitions_resolved[0].notes_thread : null);
    if (thread) outcome = thread[thread.length - 1]?.text?.trim() || '';
  }
}
```

This reads `acquisitions_resolved[0].outcome_summary` first (the skill acquisition outcome saved by the new Outcome card), then falls through to the existing notes thread fallback for Resources acquisitions.

#### Assumption: single skill acquisition per submission

The current form has one skill acquisition row per submission (PR #187 context at line 2159). `acquisitions_resolved[0]` is correct. If multiple rows are ever supported, this needs revisiting — but that's out of scope here.

---

### What to verify in the browser

1. Open `http://localhost:8080/dt-proto.html`
2. Navigate to a submission with a skill acquisition (e.g. "Air of Menace")
3. The action row's detail panel should show an **Outcome** card (Approved / Partial / Failed + text input), not a Validation Status card
4. Click "Approved" → pool_status should save as 'resolved', merit_outcome as 'approved'
5. Enter a narrative → outcome_summary saves to acquisitions_resolved[0]
6. Open the DT Story panel for the same submission
7. The Allies & Asset Summary should show the narrative in the skill acquisition row (not "— Outcome not yet recorded —")
8. Check that merit action outcomes (e.g. Allies, Contacts) still save and display correctly — unaffected

---

## Files to change

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | ~line 9092: declare `isSkillAcq`; extend Validation Status condition; render Outcome card after pool columns |
| `public/js/admin/downtime-story.js` | ~line 2321: read `acquisitions_resolved[0].outcome_summary` for resources category before notes-thread fallback |

No CSS changes, no new functions, no API changes.
