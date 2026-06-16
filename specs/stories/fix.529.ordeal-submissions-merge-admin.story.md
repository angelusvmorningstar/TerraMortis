---
issue: 529
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/529
branch: morningstar-issue-529-ordeal-submissions-invisible
story: 529
---

# Story 529: Merge ordeal_submissions + ordeal_responses into admin marking panel

Status: review

## Story

As an ST,
I want the admin Ordeals marking panel to show ALL historical and new submissions,
so that previously imported ordeals (Google Forms / import scripts) are no longer invisible.

## Root cause

fix.527 changed `initOrdealsAdminView()` to fetch only from
`/api/ordeal-responses/all`. Docs in the `ordeal_submissions` collection (imported before
fix.527, marked by import scripts) are no longer fetched — they sit unchanged in the DB but
don't appear in the UI.

## Acceptance criteria

- [ ] Admin panel shows submissions from **both** `ordeal_responses` and `ordeal_submissions`
  in a single merged list
- [ ] Type filter tabs and counts reflect the combined total correctly
- [ ] Marking Save Progress / Mark Complete on a legacy `ordeal_submissions` doc PUTs to
  `/api/ordeal_submissions/:id` (not to `/api/ordeal-responses/:id`)
- [ ] Marking Save Progress / Mark Complete on a new `ordeal_responses` doc continues to PUT
  to `/api/ordeal-responses/:id` (unchanged behaviour)
- [ ] No existing marking data on `ordeal_submissions` docs is lost or reset

## Tasks

### [x] 1. Fetch both collections and tag each doc with `_source`

`public/js/admin/ordeals-admin.js` — `initOrdealsAdminView()` (lines 58–62):

```js
// BEFORE:
[submissions, rubrics] = await Promise.all([
  apiGet('/api/ordeal-responses/all'),
  apiGet('/api/ordeal_rubrics'),
]);

// AFTER:
let [responses, legacy, rubricsData] = await Promise.all([
  apiGet('/api/ordeal-responses/all'),
  apiGet('/api/ordeal_submissions'),
  apiGet('/api/ordeal_rubrics'),
]);
rubrics = rubricsData;
submissions = [
  ...(responses || []).map(r => ({ ...r, _source: 'responses' })),
  ...(legacy   || []).map(l => ({ ...l, _source: 'submissions' })),
];
```

Note: `rubrics` is the existing module-level variable. The three-way destructure needs to
match the new parallel fetch. The `|| []` guards handle any null/error from either endpoint
gracefully.

### [x] 2. Route `handleSave` based on `_source`

`public/js/admin/ordeals-admin.js` — `handleSave()` (lines 421–440):

The function currently always PUTs to `/api/ordeal-responses/`. It must now route to the
correct endpoint per doc. Also: `status: 'approved'` should only be sent for
`ordeal_responses` docs (it triggers the XP cascade there); `ordeal_submissions` handles
XP cascade server-side via its own `cascadeComplete` on `marking.status === 'complete'`.

```js
// Replace the hardcoded endpoint + status logic:

const endpoint = sub._source === 'submissions'
  ? '/api/ordeal_submissions/' + subId
  : '/api/ordeal-responses/' + subId;

if (markComplete && sub._source === 'responses') {
  updates.status = 'approved';
}

try {
  const updated = await apiPut(endpoint, updates);
  // Re-attach _source — the server response won't include it
  const idx = submissions.findIndex(s => s._id === subId);
  if (idx >= 0) submissions[idx] = { ...updated, _source: sub._source };
  ...
```

The `_source` re-attach is critical: after the PUT, the returned document from the server
has no `_source` field. Without re-attaching it, the next Save/Mark Complete on the same
doc would fall through to the `ordeal-responses` default — silently PUTting to the wrong
endpoint and failing with a 404.

Full replacement block for `handleSave` (replace lines 399–441):

```js
async function handleSave(subId, markComplete) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  const pend = pendingAnswers[subId] || {};

  const existing = [...(sub.marking?.answers || [])];
  for (const [idxStr, val] of Object.entries(pend)) {
    const idx = +idxStr;
    const pos = existing.findIndex(a => a.question_index === idx);
    if (pos >= 0) {
      existing[pos] = { question_index: idx, result: val.result, feedback: val.feedback || '' };
    } else {
      existing.push({ question_index: idx, result: val.result, feedback: val.feedback || '' });
    }
  }

  const overall = pendingOverall[subId] !== undefined
    ? pendingOverall[subId]
    : (sub.marking?.overall_feedback || '');

  const updates = {
    marking: {
      ...(sub.marking || {}),
      status:           markComplete ? 'complete' : (existing.length ? 'in_progress' : 'unmarked'),
      overall_feedback: overall,
      answers:          existing,
    },
  };

  const endpoint = sub._source === 'submissions'
    ? '/api/ordeal_submissions/' + subId
    : '/api/ordeal-responses/' + subId;

  if (markComplete && sub._source !== 'submissions') {
    updates.status = 'approved';
  }

  try {
    const updated = await apiPut(endpoint, updates);
    const idx = submissions.findIndex(s => s._id === subId);
    if (idx >= 0) submissions[idx] = { ...updated, _source: sub._source };
    delete pendingAnswers[subId];
    delete pendingOverall[subId];
    render();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}
```

### [x] 3. Guard `renderRight()` character name lookup (already present, verify no change needed)

`renderRight()` line 179 still uses `characters.find(c => String(c._id) === String(sub.character_id))`.
`ordeal_submissions` docs have `character_id` (from import); `ordeal_responses` docs have
`character_id` (from fix.527 POST change) or null. The existing lookup + `charNameForSub()`
fallback handles both. No change needed here.

## Dev notes

### Only file changing

`public/js/admin/ordeals-admin.js` — two targeted edits:
1. `initOrdealsAdminView()` — fetch 3-way instead of 2-way, tag submissions
2. `handleSave()` — route endpoint + status flag per `_source`, re-attach `_source` on update

### Server — no changes

- `server/routes/ordeal_submissions.js` — `GET /` (ST-only, returns all) is already the
  correct endpoint for legacy docs. No change.
- `server/routes/ordeal-responses.js` — `GET /all` (ST-only) unchanged.
- `server/tests/` — no new tests needed for this story. Both endpoints are already covered.
  The change is purely in the client fetch + routing layer.

### `_source` is a client-only tag

`_source` is added in the browser after fetching — it never goes to the server. The server
PUT body contains only `marking` (and optionally `status`). `_source` is stripped naturally
since it's not included in `updates`.

### `ordeal_submissions` marking behaviour

`PUT /api/ordeal_submissions/:id` (in `ordeal-submissions.js`):
- Accepts any fields in the body (`const { _id, ...updates } = req.body`)
- When `updates.marking?.status === 'complete'`: sets `marked_at`, `xp_awarded: 3`, and calls `cascadeComplete`
- Does NOT handle `status: 'approved'` (that field doesn't exist in the `ordeal_submissions` schema)
- So: do NOT send `status: 'approved'` for `_source === 'submissions'` docs

### `ordeal_responses` marking behaviour (unchanged from fix.527)

`PUT /api/ordeal-responses/:id`:
- `status: 'approved'` + `marking.status: 'complete'` triggers `cascadePlayerOrdealXp`
- XP cascade fires on both the `status === 'approved'` check AND the `marking.status === 'complete'`
  check (idempotent, no double-apply risk)

### Potential duplicate display

If a player has BOTH an `ordeal_responses` doc (submitted via the app) AND an
`ordeal_submissions` doc (imported from Google Forms) for the same ordeal type, both will
appear in the list. This is acceptable for this story — dedup is out of scope. STs can
identify the duplicate by character name + type and ignore/mark one.

### Type normalisation is already correct

`normType()` and `ORDEAL_TYPE_NORM` from fix.527 handle both:
- `ordeal_responses`: short-form types (`'rules'`, `'lore'`, `'covenant'`)
- `ordeal_submissions`: long-form types (`'rules_mastery'`, `'lore_mastery'`, `'covenant_questionnaire'`)

The filter (`submissions.filter(s => normType(s.ordeal_type) === activeType)`) and rubric
lookup (`rubrics.find(r => r.ordeal_type === normOrdealType)`) already work for both shapes.
No change needed.

### Testing note

Frontend-only change, no server tests to add. Verify manually: reload admin Ordeals tab
after deploy — both old imported submissions and new player submissions should appear.
`api-ordeal-submissions.test.js` (10) and `api-ordeal-responses.test.js` (15) should remain
green unchanged. Run both to confirm no regression before committing.

## Dev agent record

### Agent model used

claude-sonnet-4-6

### Completion notes

**Two edits, one file (`ordeals-admin.js`):**

1. `initOrdealsAdminView()`: switched from a 2-way to a 3-way parallel fetch
   (`ordeal-responses/all` + `ordeal_submissions` + `ordeal_rubrics`). Results are merged
   into the `submissions` array with `_source: 'responses'` or `_source: 'submissions'`
   tagged on each document. The `|| []` guards handle a null/error from either collection
   endpoint without breaking the other.

2. `handleSave()`: routes the PUT to the correct endpoint based on `_source`. Legacy
   `ordeal_submissions` docs go to `/api/ordeal_submissions/:id`; new `ordeal_responses`
   docs go to `/api/ordeal-responses/:id`. The `status: 'approved'` field (which triggers
   XP cascade in ordeal-responses) is only sent for `_source === 'responses'` docs —
   the submissions route handles XP via its own `cascadeComplete`. After the PUT, `_source`
   is re-attached to the in-memory entry since the server response won't include it; without
   this, the next save on the same doc would silently route to the wrong endpoint.

3. Task 3 verified: `charNameForSub()` and `renderRight()` character lookup unchanged —
   already handles both collection shapes correctly.

**Tests:** no new server tests needed (frontend-only change). Confirmed 25/25 green across
`api-ordeal-responses` (15) and `api-ordeal-submissions` (10).

### File list

**Modified:**
- `public/js/admin/ordeals-admin.js`
- `specs/stories/fix.529.ordeal-submissions-merge-admin.story.md` (this file)

### Change log

- 2026-06-01: Story created from issue #529. Root cause confirmed via code audit.
  Status → ready-for-dev.
- 2026-06-01: Implemented tasks 1–3. Frontend-only change. 25 existing tests green.
  Status → review.
- 2026-06-01 (QA, Quinn): Verdict **PASS**. Frontend-only change — no new server tests
  warranted. Both endpoints the admin now calls (`GET /api/ordeal_submissions` and
  `GET /api/ordeal-responses/all`) are covered by the existing suites. The `_source`
  tagging and PUT routing are verifiable only in-browser; smoke test after deploy is
  the definitive check. 25/25 green, no regressions.
