---
title: 'DT Processing: add acknowledge action for parked Mandragora rite slots'
type: 'feature'
issue: 742
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/742
branch: ms/issue-742-dt-mg-ack-parked-rite
created: '2026-06-15'
status: done
recommended_model: 'sonnet — two small changes + one event handler in one file'
context:
  - public/js/admin/downtime-views.js
depends_on:
  - issue: 741
    branch: ms/issue-741-dt-mg-prior-outcome
    status: PR open (#743), awaiting merge to dev
---

## Intent

Add a lightweight "Noted — still running" control to each parked Mandragora Garden
rite slot in DT processing. Clicking it writes an acknowledgement to the submission,
marks the slot as handled in the completion indicator, and persists the acked state
across page reload.

---

## CRITICAL: Dependency on MG-1 (#741)

**Before touching any code, merge the MG-1 branch:**

```bash
git merge ms/issue-741-dt-mg-prior-outcome
```

MG-1 adds the `mandragora` flag to sorcery queue entries and injects the
`.proc-mg-prior-outcome` section into `_renderSorceryRightPanel`. MG-2 gates all
its changes on `entry.mandragora === true`, which only exists after MG-1 is merged.

If the MG-1 branch is not yet merged to dev/main, cherry-pick or merge it locally
before implementing this story. The Playwright tests must run against the combined
codebase.

---

## Root cause / motivation

After MG-1 (#741), the ST sees the prior cycle's resolution inline for each parked
rite. However, the slot still has no write action — it shows up as "pending" in the
completion indicator because `sorcery_review[N].pool_status` is never set. The ST
cannot distinguish "I've reviewed this and it's still running" from "I haven't looked
at it yet".

---

## File locations

| File | Concern |
|------|---------|
| `public/js/admin/downtime-views.js` | Only file changed. Three touch points: render, event wiring, no-schema-change note. |
| `server/schemas/downtime_submission.schema.js` | Read-only — no change needed (see Schema section below). |

---

## Schema decision — no change required

`downtime_submission.schema.js` line 207–208:
```js
responses: {
  type: 'object',
  additionalProperties: true,
```

`additionalProperties: true` means any key in `responses` passes schema validation.
`sorcery_N_mg_acked` does NOT need a schema extension. Do NOT modify the schema file.

---

## Data shapes

| Field | Location | Notes |
|-------|----------|-------|
| `sorcery_N_mandragora` | `submission.responses` | `'yes'` when slot is parked — set by player form; read-only here |
| `entry.mandragora` | queue entry object (added by MG-1) | `true` when slot is parked — gate for MG-2 UI |
| `sorcery_N_mg_acked` | `submission.responses` | Written by ack: `'yes'`. Read back at render time to show acked state. |
| `sorcery_review[N].pool_status` | `submission.sorcery_review` | Written by ack: `'skipped'`. This is what makes the slot count in the completion indicator. |

**Why `'skipped'` for pool_status?**

`DONE_STATUSES` (line 273) = `new Set(['validated', 'no_roll', 'no_feed', 'maintenance', 'resolved', 'no_effect', 'skipped', 'obvious', 'neutral', 'subtle'])`.

The completion counter (line 4321):
```js
const doneCt = entries.filter(e => DONE_STATUSES.has(getEntryReview(e)?.pool_status)).length;
```

`'no_action'` is NOT in `DONE_STATUSES`. `'skipped'` IS. Use `'skipped'`.

The checklist (`_chkState`, line 11055–11056) also handles `'skipped'` for sorcery:
```js
if (ps === 'skipped' || ps === 'no_action') return 'no_action';
```
Both are treated the same in the checklist — shows as X (reviewed/skipped).

---

## T1 — Render ack control in `_renderSorceryRightPanel`

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderSorceryRightPanel(entry, char, sub, rev)` (line 7647)

After MG-1 is merged, the function will have a prior-outcome block injected between
`let h = ...` and the `// ── Dice Pool Builder` comment. Add the ack control
immediately after that block (still before Dice Pool Builder), gated on
`entry.mandragora === true`.

```js
// ── Parked Mandragora rite — Acknowledge control ──────────────────────────
if (entry.mandragora) {
  const _mgAcked = sub?.responses?.[`sorcery_${entry.actionIdx}_mg_acked`] === 'yes';
  h += `<div class="proc-mg-ack">`;
  if (_mgAcked) {
    h += `<span class="proc-mg-ack-done">&#10003; Noted &#8212; still running</span>`;
  } else {
    h += `<button type="button" class="dt-btn proc-mg-ack-btn" data-proc-key="${esc(key)}">Noted &#8212; still running</button>`;
  }
  h += `</div>`;
}
```

Place this block **after** the MG-1 prior-outcome block and **before** the
`// ── Dice Pool Builder` comment.

The `sub` argument is `sorcSub` — the full submission object — so `sub.responses` is
available directly.

---

## T2 — Wire the ack button event handler

**File:** `public/js/admin/downtime-views.js`
**Location:** Inside `renderProcessingMode(container)`, with the other `.forEach` event
wire-ups (after the feeding clear-roll handler at line ~5631).

```js
// Wire Mandragora ack button
container.querySelectorAll('.proc-mg-ack-btn').forEach(btn => {
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const procKey = btn.dataset.procKey;
    const entry   = _getQueueEntry(procKey);
    if (!entry) return;
    const sub = submissions.find(s => s._id === entry.subId);
    if (!sub) return;
    const n = entry.actionIdx;

    // 1. Mark sorcery_review[N].pool_status = 'skipped' — counts in completion indicator
    await saveEntryReview(entry, { pool_status: 'skipped' });

    // 2. Write mg_acked flag to responses (dot-notation — server does $set, preserves all other responses fields)
    await updateSubmission(entry.subId, { [`responses.sorcery_${n}_mg_acked`]: 'yes' });

    // 3. Update in-memory responses for immediate re-render
    if (!sub.responses) sub.responses = {};
    sub.responses[`sorcery_${n}_mg_acked`] = 'yes';

    renderProcessingMode(container);
  });
});
```

**Why two separate API calls?**
- `saveEntryReview` writes `sorcery_review` (the whole object) — it does not touch `responses`
- The `responses` write uses dot-notation `responses.sorcery_N_mg_acked` so the PUT
  `$set` only updates that one key, leaving all other responses fields intact
- This is the same two-call pattern used by the feeding clear-roll handler (#739, line 5626)

---

## T3 — Playwright tests

New spec file: `tests/feat-742-dt-proc-mg-ack-parked-rite.spec.js`

Reuse the fixture and setup structure from `tests/feat-741-dt-proc-mg-prior-outcome.spec.js`.
The same `CHAR_742`, `CYCLE_742`, `SUB_PARKED_742` fixture structure applies.

**Fixtures needed:**

- `SUB_PARKED` — responses has `sorcery_1_mandragora: 'yes'`; `sorcery_review` is `{}`
  (no pool_status — entry is pending)
- `SUB_PARKED_ACKED` — same as above but `responses.sorcery_1_mg_acked: 'yes'` and
  `sorcery_review: { 1: { pool_status: 'skipped' } }`
- `SUB_NOT_PARKED` — responses has `sorcery_1_mandragora: 'no'`

**Route interceptor:** intercept `PUT /api/downtime_submissions/*` and return `{ ok: true }`.

**Tests:**

- **AC-1**: Parked rite shows a `.proc-mg-ack-btn` button. Non-parked rite shows no such button.
- **AC-2 (pool_status write)**: Clicking `.proc-mg-ack-btn` triggers a PUT to
  `/api/downtime_submissions/<id>` — verify the request body contains
  `{ 'responses.sorcery_1_mg_acked': 'yes' }` or `{ sorcery_review: ... }` with
  `pool_status: 'skipped'`. (Playwright can intercept the request and inspect it.)
- **AC-3 (reload persistence)**: When starting with `SUB_PARKED_ACKED` (already acked),
  the `.proc-mg-ack-btn` is NOT present; instead `.proc-mg-ack-done` is visible.
- **AC-4 (button absent for non-parked)**: Non-parked rite shows no `.proc-mg-ack` element.

---

## Acceptance criteria

- [ ] Given a parked rite slot in DT processing, a "Noted — still running" button (`.proc-mg-ack-btn`) is present in the right panel
- [ ] Given the ST clicks the button, `sorcery_N_mg_acked: 'yes'` is written to `submission.responses` via `updateSubmission`
- [ ] Given the ST clicks the button, `sorcery_review[N].pool_status` is set to `'skipped'`, which makes the slot count in the completion indicator
- [ ] Given the ST reloads after acking, the button is replaced by a "Noted — still running" confirmation text (`.proc-mg-ack-done`)
- [ ] Non-parked rite slots show no `.proc-mg-ack` element
- [ ] No changes to `downtime_submission.schema.js`

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes (plus new test file).
- Do NOT modify `saveEntryReview` itself — the sorcery branch already handles `pool_status` writes correctly. The ack handler calls it directly.
- Do NOT modify `DONE_STATUSES` — `'skipped'` is already in it.
- The ack is one-way only — no "un-ack" control. If the ST acks accidentally, they can change `sorcery_review[N].pool_status` back via the normal sorcery review flow.
- The ack button is only for parked rites (`entry.mandragora === true`). Never show it for non-parked sorcery.
- The `updateSubmission` call for `responses` uses dot-notation (`responses.sorcery_N_mg_acked`) — NOT a full responses object replacement. This is safe because the server route does `{ $set: updates }`.

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: ack control rendered inside `if (entry.mandragora)` block in `_renderSorceryRightPanel`; T2: `proc-mg-ack-btn` event handler wired in `renderProcessingMode`
- `tests/feat-742-dt-proc-mg-ack-parked-rite.spec.js` — 4 Playwright tests (AC-1 through AC-4)

### Completion notes

Merged MG-1 (ms/issue-741-dt-mg-prior-outcome) before implementation — fast-forward, no conflicts.

T1: Inside the existing `if (entry.mandragora)` block in `_renderSorceryRightPanel`, after the prior-outcome section from MG-1, reads `sub.responses?.sorcery_N_mg_acked === 'yes'` to branch between a `.proc-mg-ack-btn` button and a `.proc-mg-ack-done` confirmation span.

T2: Event handler calls `saveEntryReview(entry, { pool_status: 'skipped' })` (writes `sorcery_review[N]` — registers in `DONE_STATUSES` completion indicator) then `updateSubmission(entry.subId, { 'responses.sorcery_N_mg_acked': 'yes' })` (dot-notation `$set` — does not replace entire responses object). In-memory `sub.responses` updated before `renderProcessingMode` rerenders.

No schema changes — `responses` has `additionalProperties: true`. All 4 Playwright tests pass (23.9s).
