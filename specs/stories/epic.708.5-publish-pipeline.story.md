---
issue: 708
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/708
branch: ms/issue-708-cycle-tab-game-phase
epic: CYCLE — Game Cycle Management Tab
story: 5 of 6
status: review
---

# Epic CYCLE — Story 5: Publish Pipeline

## Story

**As an** ST,
**I want** to publish all DT reports for a cycle from the Cycle tab,
**so that** I can finalise a downtime cycle in one click without navigating the per-character DT processing view.

---

## Epic Context

Story 5 of 6 in the CYCLE epic (#708). Stories 1–4 are complete and on `dev`.

This story adds a "Publish Reports" button to each cycle row in the Cycle tab. Clicking it promotes all submissions for that cycle that have compiled outcome text (`st_review.outcome_text` non-empty) to published state — setting `published_outcome`, `st_review.outcome_visibility = 'published'`, and `st_review.published_at`. A new server endpoint handles the bulk operation.

Story 6 will add attendance/XP absorption.

---

## Background: Existing Publish Mechanism

The ST writes per-character narratives in the DT processing view (`downtime-story.js`). Each submission has:

- `st_narrative` — sections written by the ST (`story_moment`, `home_report`, `project_responses`, etc.)
- `st_review.outcome_text` — compiled markdown built from `st_narrative` via `compilePushOutcome()` (run when ST clicks "Push" per character)
- `st_review.outcome_visibility` — `'draft'|'ready'|'published'`
- `published_outcome` — top-level string; once set, makes the report visible in Story tab, DT tab, Archive tab, and Feeding tab

The existing per-character publish path:
1. ST writes narrative in DT story tab
2. ST clicks "Push" — `compilePushOutcome()` builds markdown, patches `st_review.outcome_text` + `outcome_visibility='published'` + copies to `published_outcome` via `PUT /api/downtime_submissions/:id`

Story 5 adds a cycle-level "Publish Reports" button that promotes ALL ready submissions in a cycle at once. It does **not** re-compile from `st_narrative` — it works on submissions where `st_review.outcome_text` is already set (the ST has already done the per-character compilation in the DT tab).

---

## Acceptance Criteria

- [x] AC-1: Each cycle row in the Game Cycles panel has a "Publish Reports" button.
- [x] AC-2: Clicking "Publish Reports" calls `POST /api/downtime_cycles/:id/publish` and shows an inline confirmation with the count of reports published (e.g., "4 reports published") or a message if none were ready ("No compiled reports found for this cycle").
- [x] AC-3: `POST /api/downtime_cycles/:id/publish` (ST-only) finds all submissions for the cycle where `st_review.outcome_text` is non-empty. For each, it sets: `published_outcome = st_review.outcome_text`, `st_review.outcome_visibility = 'published'`, `st_review.published_at = <now ISO>`. Returns `{ published: N, skipped: N }`.
- [x] AC-4: Submissions already published (`st_review.outcome_visibility === 'published'` AND `published_outcome` set) are counted as `skipped` and not re-written.
- [x] AC-5: API errors are caught and shown inline; no unhandled rejections.
- [x] AC-6: Contract tests pass (≥8 assertions in `server/tests/epic.708.5-publish-pipeline.test.js`).

---

## Dev Notes

### Files to change

**Modified:**
- `server/routes/downtime.js` — add `POST /:id/publish` to `cyclesRouter`
- `public/js/admin/cycle-views.js` — add "Publish Reports" button + inline result span to each cycle row

**New:**
- `server/tests/epic.708.5-publish-pipeline.test.js` — static-grep contract tests

### server/routes/downtime.js — POST /:id/publish

Add after the existing `cyclesRouter.put('/:id', ...)` block. The `cyclesRouter` is already declared in `downtime.js` and mounted with `requireAuth` in `index.js`.

```js
// POST /api/downtime_cycles/:id/publish — ST only; bulk-promote compiled DT reports
cyclesRouter.post('/:id/publish', requireRole('st'), async (req, res) => {
  const cycleId = req.params.id;
  const subs = getCollection('downtime_submissions');

  // Find all submissions for this cycle (cycle_id may be string or ObjectId)
  const all = await subs.find({ cycle_id: cycleId }).toArray();

  let published = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const sub of all) {
    const text = sub.st_review?.outcome_text;
    if (!text) { skipped++; continue; }
    if (sub.st_review?.outcome_visibility === 'published' && sub.published_outcome) {
      skipped++;
      continue;
    }
    await subs.updateOne(
      { _id: sub._id },
      { $set: {
          published_outcome: text,
          'st_review.outcome_visibility': 'published',
          'st_review.published_at': now,
      }}
    );
    published++;
  }

  res.json({ published, skipped });
});
```

**Note on cycle_id matching**: submissions store `cycle_id` as a plain string (the `_id` string of the cycle). Verify by checking a live submission if uncertain — but the string match is the standard pattern used throughout `downtime.js`.

### cycle-views.js — Publish Reports button

Add a 5th column "Publish" to the cycle table. Update the `<thead>`:

```html
<thead><tr>
  <th>Label</th>
  <th style="width:270px">Phase</th>
  <th style="width:200px">Chapter</th>
  <th style="width:110px">Prep Access</th>
  <th style="width:130px">Publish</th>
</tr></thead>
```

In the `sorted.forEach` loop, after the Prep Access `tdAccess` cell, add:

```js
const tdPublish = document.createElement('td');
const publishBtn = document.createElement('button');
publishBtn.className = 'btn-sm';
publishBtn.textContent = 'Publish Reports';
const publishResult = document.createElement('span');
publishResult.style.cssText = 'display:block;font-size:11px;margin-top:3px;color:var(--txt2)';
tdPublish.appendChild(publishBtn);
tdPublish.appendChild(publishResult);
tr.appendChild(tdPublish);

publishBtn.addEventListener('click', async () => {
  publishBtn.disabled = true;
  publishResult.style.color = 'var(--txt2)';
  publishResult.textContent = 'Publishing…';
  try {
    const result = await apiPost('/api/downtime_cycles/' + cy._id + '/publish', {});
    if (result.published === 0) {
      publishResult.textContent = 'No compiled reports found.';
    } else {
      publishResult.style.color = 'var(--gold2)';
      publishResult.textContent = result.published + ' report' + (result.published === 1 ? '' : 's') + ' published.';
    }
  } catch (err) {
    publishResult.style.color = 'var(--crim)';
    publishResult.textContent = 'Publish failed: ' + err.message;
  } finally {
    publishBtn.disabled = false;
  }
});
```

`apiPost` is already imported in `cycle-views.js`.

### No schema changes

`published_outcome`, `st_review.outcome_text`, `st_review.outcome_visibility`, and `st_review.published_at` are all existing fields in `downtime_submission.schema.js`. No schema migration needed.

### cycle_id string matching

Submissions use `cycle_id` as the string form of the cycle's `_id`. The `POST /:id/publish` endpoint queries `{ cycle_id: req.params.id }` — this matches how submissions are created. If the cycle `_id` is a MongoDB ObjectId, `req.params.id` is the string representation; submissions store it as that same string.

### Test file pattern

Same static-grep pattern as stories 1–4.

```js
import fs from 'fs';
const DOWNTIME  = fs.readFileSync('../server/routes/downtime.js', 'utf8');
const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
```

Required assertions (≥8):
- `DOWNTIME` contains `cyclesRouter.post` (the new endpoint)
- `DOWNTIME` contains `'/publish'` or `'/:id/publish'`
- `DOWNTIME` contains `requireRole`
- `DOWNTIME` contains `published_outcome`
- `DOWNTIME` contains `outcome_visibility`
- `DOWNTIME` contains `published_at`
- `CYCLE_VIEWS` contains `Publish Reports`
- `CYCLE_VIEWS` contains `/publish`
- `CYCLE_VIEWS` contains `published`  (result display)

---

## Tasks

- [x] **Task 1** — Add `POST /:id/publish` to `cyclesRouter` in `server/routes/downtime.js` (ST-only, bulk promote compiled reports)
- [x] **Task 2** — Add "Publish Reports" button + result span to each cycle row in `public/js/admin/cycle-views.js`; update `<thead>` to add 5th column
- [x] **Task 3** — Create `server/tests/epic.708.5-publish-pipeline.test.js` with ≥8 static-grep assertions; run and confirm all pass

---

## File List

**New:**
- `server/tests/epic.708.5-publish-pipeline.test.js`

**Modified:**
- `server/routes/downtime.js`
- `public/js/admin/cycle-views.js`

---

## Dev Agent Record

### Debug Log
_Empty_

### Completion Notes
- Added `POST /:id/publish` to `cyclesRouter` in `downtime.js`; queries submissions by `cycle_id` ObjectId; skips already-published and empty-text subs; returns `{ published, skipped }`
- Added "Publish Reports" button + inline result span to each cycle row in `cycle-views.js`; `<thead>` updated to 5 columns; `detailTd.colSpan` updated to 5; button disabled during request, re-enabled in `finally`
- 13 static-grep contract tests pass; Story 4 (10 tests) unaffected

### Change Log
- 2026-06-11: Story implemented — publish pipeline endpoint + Cycle tab button; 13 passing contract tests
