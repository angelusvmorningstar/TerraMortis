---
issue: 527
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/527
branch: morningstar-issue-527-ordeal-responses-admin-marking
story: 527
---

# Story 527: Bridge ordeal_responses → admin marking panel

Status: review

## Story

As an ST,
I want submitted player ordeal responses to appear in the admin Ordeals marking panel,
so that I can review and mark them — which is currently impossible because the admin reads
`ordeal_submissions` while player submits write to `ordeal_responses`.

## Root cause

There are two separate ordeal collections:

| Collection | Writer | Reader | Data shape |
|---|---|---|---|
| `ordeal_responses` | Player (via `ordeal-form.js`) | `GET /api/ordeal-responses/all` (ST-only, already exists) | `responses: { key: value }` object |
| `ordeal_submissions` | Historically: import scripts / Google Forms | `ordeals-admin.js` | `responses: [{ question_index, answer }]` array |

`ordeals-admin.js:initOrdealsAdminView()` fetches from `/api/ordeal_submissions` — a collection
that no player flow writes to. Submitted responses sit in `ordeal_responses`, invisible to STs.

Additionally, the PUT handler on `/api/ordeal-responses/:id` does not accept `marking` data, so
even if the admin read the right collection, marking saves would fail.

## Acceptance criteria

- [ ] After a player submits an ordeal (any type), it appears in the admin Ordeals panel under
  the correct type filter tab (Rules Mastery / Lore Mastery / Covenant Questionnaire)
- [ ] The submission shows the player's character name, ordeal type, and their Q&A responses
- [ ] An ST can save marking progress and mark complete from the admin panel
- [ ] Marking complete on a player-level ordeal cascades XP to all of that player's characters
- [ ] Submissions already in `ordeal_responses` with `status: 'submitted'` are visible immediately
  (no data loss; no migration script needed)
- [ ] The `ordeal_submissions` collection and its existing GET/PUT routes are untouched

## Tasks

### [x] 1. Server: POST — store character_id for admin name lookup

`server/routes/ordeal-responses.js` — POST handler (line ~82):

```js
const doc = {
  player_id: playerId,
  character_id: req.user.character_ids?.[0] ?? null,  // ADD THIS
  ordeal_type: type,
  ...
};
```

`req.user.character_ids` is the array from auth middleware (same as `ordeal-submissions.js:78`
uses). Store the first element. Existing docs without `character_id` already fall back to
`sub.character_name || 'Unknown'` in the admin — no migration needed.

### [x] 2. Server: PUT — allow STs to save marking data

`server/routes/ordeal-responses.js` — PUT handler. Currently only handles `responses`, `status`,
`approved_at`. Add marking support for STs:

```js
// After existing 'if (req.body.responses !== undefined)' block:
if (req.body.marking !== undefined && isStRole(req.user)) {
  updates.marking = req.body.marking;
  if (req.body.marking?.status === 'complete') {
    updates.marking.marked_at  = updates.updated_at;
    updates.marking.xp_awarded = 3;
  }
}
```

Then, after the `findOneAndUpdate` call — cascade XP when marking is newly complete (this is the
admin path; the `status: 'approved'` path already handles the player-form approval path):

```js
// After existing cascadePlayerOrdealXp block:
if (updates.marking?.status === 'complete' && existing.marking?.status !== 'complete') {
  await cascadePlayerOrdealXp(existing.player_id, existing.ordeal_type);
}
```

`cascadePlayerOrdealXp` (defined at line 29) is already idempotent (upserts), so the two cascade
paths (approve vs mark-complete) cannot double-apply XP.

### [x] 3. Admin: read from ordeal_responses instead of ordeal_submissions

`public/js/admin/ordeals-admin.js` — top of file, add the type mapping constant:

```js
// Maps short ordeal_type values (stored in ordeal_responses) to long-form keys
// used by the admin tabs and rubric lookup.
const ORDEAL_TYPE_NORM = {
  rules:    'rules_mastery',
  lore:     'lore_mastery',
  covenant: 'covenant_questionnaire',
};

function normType(t) {
  return ORDEAL_TYPE_NORM[t] || t;
}
```

In `initOrdealsAdminView()` — change the fetch (line 49):

```js
// BEFORE:
apiGet('/api/ordeal_submissions'),
// AFTER:
apiGet('/api/ordeal-responses/all'),
```

Note the endpoint change: `ordeal_submissions` (underscore) → `ordeal-responses/all` (hyphen).
The route is already mounted at `server/index.js` and is ST-only.

### [x] 4. Admin: fix type tab filtering and summary counts

`renderLeft()` — the `submissions.filter(s => s.ordeal_type === activeType)` check (line 102)
uses long-form type keys. Short-form stored in `ordeal_responses` won't match.

```js
// BEFORE:
const visible = activeType === 'all'
  ? submissions
  : submissions.filter(s => s.ordeal_type === activeType);
// AFTER:
const visible = activeType === 'all'
  ? submissions
  : submissions.filter(s => normType(s.ordeal_type) === activeType);
```

Same fix in `tabBtn()` count filter (line 153):

```js
// BEFORE:
submissions.filter(s => s.ordeal_type === type).length;
// AFTER:
submissions.filter(s => normType(s.ordeal_type) === type).length;
```

### [x] 5. Admin: fix rubric lookup and type label

In `renderRight()` — rubric is matched by `r.ordeal_type === sub.ordeal_type` (line 175). Fix:

```js
const rubric = rubrics.find(r =>
  r.ordeal_type === normType(sub.ordeal_type) &&
  (normType(sub.ordeal_type) !== 'covenant_questionnaire' || r.covenant === sub.covenant || !r.covenant)
);
```

Type label (line 170):

```js
const typeLabel = ORDEAL_LABELS[normType(sub.ordeal_type)] || sub.ordeal_type;
```

And in `renderLeft()` list heading (line 134):

```js
h += `<div class="or-list-heading">${esc(ORDEAL_LABELS[normType(sub.ordeal_type)] || sub.ordeal_type)}</div>`;
```

### [x] 6. Admin: fix character name lookup

`charNameForSub()` (line 454) looks up by `character_id`. `ordeal_responses` docs submitted before
this fix have no `character_id`. Extend with a `player_id` fallback:

```js
function charNameForSub(sub) {
  if (sub.character_id) {
    const char = characters.find(c => String(c._id) === String(sub.character_id));
    if (char) return displayName(char);
  }
  // player_id fallback (ordeal_responses docs pre-fix and player-level ordeals)
  if (sub.player_id) {
    const char = characters.find(c => String(c.player_id) === String(sub.player_id));
    if (char) return displayName(char);
  }
  return sub.character_name || 'Unknown';
}
```

Note: characters may or may not have a `player_id` field. The `character_id` stored by Task 1
is the primary path; the `player_id` lookup is a best-effort fallback. 'Unknown' is acceptable
for existing docs without either field.

### [x] 7. Admin: fix responses rendering (object → array conversion)

`renderRight()` — line 195 reads `sub.responses || []` and iterates it as an array with
`.forEach((row, i) => { row.question; row.answer; })`.

`ordeal_responses.responses` is `{ key: value }` — an object. Convert it for rendering:

```js
// Replace:
const responses = sub.responses || [];
// With:
const responses = Array.isArray(sub.responses)
  ? sub.responses
  : Object.entries(sub.responses || {}).map(([key, answer]) => ({ question: key, answer }));
```

This handles both the old `ordeal_submissions` array format (if any such docs appear) and the
`ordeal_responses` object format. The "question" column will show the form field key (e.g.
`clan_lore_q1`) rather than natural-language text — acceptable for this story; rubric alignment
by `question_index` (position) may not perfectly match key-ordered responses, which is a
known trade-off. The rubric expected-answer column will still be populated if the rubric
`questions[i].index` happens to align with the response iteration order.

### [x] 8. Admin: fix marking save — PUT to ordeal-responses

`handleSave()` — line 417 PUTs to `/api/ordeal_submissions/`. Change to `/api/ordeal-responses/`:

```js
// BEFORE:
const updated = await apiPut('/api/ordeal_submissions/' + subId, updates);
// AFTER:
const updated = await apiPut('/api/ordeal-responses/' + subId, updates);
```

When `markComplete === true`, also set `status: 'approved'` to trigger the existing XP cascade
path (belt-and-suspenders alongside the marking cascade in Task 2):

```js
if (markComplete) {
  updates.marking.status = 'complete';
  updates.status = 'approved';  // ADD: triggers cascadePlayerOrdealXp in the route
}
```

### [x] 9. Tests: add ST marking path coverage

`server/tests/api-ordeal-responses.test.js`:

- ST can GET `/api/ordeal-responses/all` and receive all submissions (test the endpoint returns 200
  for an ST user; it already exists, just verify it's covered)
- ST can PUT marking data (in_progress): `marking: { status: 'in_progress', answers: [...] }` →
  200, `res.body.marking.status === 'in_progress'`
- ST marking complete: PUT `{ marking: { status: 'complete', answers: [...] }, status: 'approved' }`
  → 200, `res.body.marking.status === 'complete'`, `res.body.marking.xp_awarded === 3`

## Dev notes

### Key files

| File | What changes |
|---|---|
| `server/routes/ordeal-responses.js` | POST: store `character_id`; PUT: accept `marking`, cascade XP on complete |
| `public/js/admin/ordeals-admin.js` | Read from `ordeal-responses/all`; type normalisation; response shape compat; character name fallback; marking PUT target |
| `server/tests/api-ordeal-responses.test.js` | ST marking path coverage |

### What does NOT change

- `server/routes/ordeal-submissions.js` — untouched
- `ordeal_submissions` collection — untouched; existing imported submissions still visible if
  the admin ever points at them again (it won't, after this fix)
- `public/js/tabs/ordeal-form.js` — untouched; response format remains `{ key: value }`
- `server/schemas/ordeal.schema.js` — untouched; `additionalProperties: true` already allows
  the new `character_id` field and `marking` object

### Server-only path for `cascadePlayerOrdealXp`

`cascadePlayerOrdealXp(playerId, ordealType)` uses `ordeal_type` values `'rules'`, `'lore'`,
`'covenant'` — the short form stored in `ordeal_responses`. This is correct and unchanged.
The long-form normalisation (`ORDEAL_TYPE_NORM`) is admin-UI-only.

### Response format trade-off (scope note)

The Q&A table in the admin panel will show form field keys (`clan_lore_q1`) rather than
question text, because `ordeal_responses.responses` is a key-value object without question
labels. This is a UX degradation compared to `ordeal_submissions` (which has question text
because import scripts put it there). Acceptable for this fix. A follow-up story could change
`ordeal-form.js:collectResponses()` to store `[{ key, question, answer }]` and update the
admin rendering accordingly.

### Testing note

Server changes are not verifiable on the dev site (dev frontend proxies `/api/*` to the prod
Render API). Verify via `tm_suite_test` and a local run. Smoke test in production after merge
to main.

Run only the touched specs:
```
npx vitest run tests/api-ordeal-responses.test.js tests/api-ordeal-submissions.test.js
```
`api-ordeal-submissions` must remain green (we're not touching that route or collection).

## Dev agent record

### Agent model used

claude-sonnet-4-6

### Completion notes

**Root cause & fix:** Admin panel read from `ordeal_submissions`; player submits write to
`ordeal_responses`. Two collections, zero bridge. Fixed by switching the admin fetch to
`/api/ordeal-responses/all` (already existed, ST-only) and adapting the rendering layer.

**Server (ordeal-responses.js):**
- POST: stores `character_id: req.user.character_ids?.[0] ?? null` for admin name lookup
- PUT: ST-only `marking` data accepted; `marking.status === 'complete'` sets `marked_at` +
  `xp_awarded: 3` and cascades XP via the existing `cascadePlayerOrdealXp` function (idempotent)
- Two cascade paths: `status: 'approved'` (player-form flow) and `marking.status: 'complete'`
  (admin marking flow) — both call the same idempotent helper, no double-apply risk

**Admin (ordeals-admin.js):**
- `ORDEAL_TYPE_NORM` + `normType()` map short-form (`rules`, `lore`, `covenant`) to long-form
  for tab filtering, rubric lookup, and type label display
- `charNameForSub()`: tries `character_id` first, then `player_id` fallback, then 'Unknown'
- `responses` shim: `Array.isArray` check converts `{ key: value }` object to
  `[{ question: key, answer: value }]` for the Q&A table renderer
- Marking PUT target changed from `/api/ordeal_submissions/` to `/api/ordeal-responses/`
- `markComplete` also sets `status: 'approved'` to trigger the approval cascade path

**Tests:** `api-ordeal-responses.test.js` expanded from 7 → 12 green tests covering:
- `GET /all`: ST sees submitted response; player gets 403
- `PUT marking in_progress`: ST saves progress
- `PUT marking complete`: `xp_awarded: 3`, `marked_at` set, `status: 'approved'`
- Player cannot write marking data (silently ignored, 200 returned)
- `api-ordeal-submissions` (10) still green — untouched

**Trade-off:** Q&A table shows form field keys (e.g. `q1`) not natural-language question text,
because `ordeal_responses.responses` is `{ key: value }`. Rubric expected-answer alignment by
array position may not perfectly match. Noted in story scope notes; follow-up story to enrich
the stored format.

### File list

**Modified:**
- `server/routes/ordeal-responses.js`
- `public/js/admin/ordeals-admin.js`
- `server/tests/api-ordeal-responses.test.js`
- `specs/stories/fix.527.ordeal-responses-admin-marking.story.md` (this file)

### Change log

- 2026-06-01: Story created from issue #527. Root cause confirmed via code audit.
  Status → ready-for-dev.
- 2026-06-01: Implemented all 9 tasks. 22 tests green (12 new + 10 existing).
  Status → review.
- 2026-06-01 (QA, Quinn): Verdict **PASS**. Added 3 tests: `character_id` stored from
  first of `character_ids` (Task 1 regression lock), `character_id: null` when no characters,
  PUT 404 for non-existent ID. `api-ordeal-responses` now 15 green; `api-ordeal-submissions`
  10 green. No blocking gaps.
