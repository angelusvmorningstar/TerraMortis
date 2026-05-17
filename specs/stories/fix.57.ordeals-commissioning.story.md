# Story fix.57: Ordeals — commission the end-to-end pipeline

**Story ID:** fix.57
**Epic:** Fixes
**Issue:** 350
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/350
**Branch:** ms/issue-350-ordeals-submit-audit
**Status:** review
**Date:** 2026-05-18

---

## User Story

As a player, I want to open the Ordeals & XP tab, fill in my answers, and submit them — and see a clear message if my account isn't set up yet — so that my ordeal XP is recorded correctly rather than failing silently.

---

## Background

The Ordeals system has two separate pipelines that co-exist:

### Pipeline A — Historical submissions (Google Forms → `ordeal_submissions`)
- Imported by `server/scripts/import-ordeals.js` from Google Forms `.xlsx` files
- Uses long ordeal_type enum: `lore_mastery`, `rules_mastery`, `covenant_questionnaire`, `character_history`
- Read by the ST admin marking panel (`public/js/admin/ordeals-admin.js`)
- Marking triggers `cascadeComplete()` in `ordeal-submissions.js`, which uses `ORDEAL_NAME_MAP` to translate long type → short name for `characters.ordeals[]`

### Pipeline B — Web form submissions (browser → `ordeal_responses`)
- Used by the player-facing ordeal form (`public/js/tabs/ordeal-form.js`)
- Uses short ordeal_type enum: `rules`, `lore`, `covenant` (no `character_history` — that uses a separate `/api/history` endpoint)
- Lifecycle: `draft` → `submitted` → `approved`
- ST approval happens via "Approve Ordeal" button in `ordeal-form.js` (ST-only, visible in the player-facing form), NOT in the admin marking panel
- Approval triggers `cascadePlayerOrdealXp()` in `ordeal-responses.js`

**These two enums are intentionally different** — they serve different pipelines. The `ORDEAL_NAME_MAP` in `ordeal-submissions.js` provides the translation for Pipeline A cascade.

The `ordeals-view.js` status resolution reads both pipelines and merges them:
- `statusCache` from `/api/ordeal-responses` (Pipeline B)
- `submissionsMap` from `/api/ordeal_submissions/mine` (Pipeline A, player-facing strip)

### Why submissions fail silently

`requireAuth` (auth.js:57-59) returns 403 `FORBIDDEN` if no `players` document exists for the authenticated Discord user. All ordeal endpoints sit behind `requireAuth` (registered in `server/index.js:87-89`). Players without a `players` record see silent API failures — all `.catch(() => null)` in `ordeals-view.js:54-61` swallow the 403.

---

## Security audit findings (pre-verified)

These findings are confirmed by code review. Dev agent does not need to re-audit, but must preserve these properties in any code changes.

| Check | File | Finding |
|---|---|---|
| Player-scoped GET | `ordeal-responses.js:57-66` | `queryPlayerId` check is gated by `isStRole()` — non-ST cannot pass `?player_id=` to retrieve another player's doc. **Secure.** |
| ST-only all-responses | `ordeal-responses.js:145` | `GET /all` uses `requireRole('st')`. **Secure.** |
| ST-only submissions list | `ordeal-submissions.js:63` | `GET /` uses `requireRole('st')`. **Secure.** |
| ST-only submission detail | `ordeal-submissions.js:120` | `GET /:id` uses `requireRole('st')`. **Secure.** |
| ST-only marking write | `ordeal-submissions.js:129` | `PUT /:id` uses `requireRole('st')`. Cascade only fires on `marking.status === 'complete'`. **Secure.** |
| Rubric confidentiality | `ordeal-rubrics.js:14,23` | Both GET and PUT use `requireRole('st')`. Players have no read path to rubrics. **Secure.** |
| Cascade auth | `ordeal-submissions.js:151` | `cascadeComplete` is only reachable via `PUT /:id` (ST-only). **Secure.** |
| localStorage | `ordeal-form.js` | All persistence is via `apiPost`/`apiPut`. No `localStorage` or `sessionStorage` writes. **Confirmed clean.** |
| Player-mine strip | `ordeal-submissions.js:89-113` | `GET /mine` strips rubric/marking details; exposes feedback only when `marking.status === 'complete'`. **Secure.** |

---

## What needs to be built / fixed

### Task 1 — Audit script (NEW file: `server/scripts/audit-player-records.js`)

A read-only script that prints a gap report. Angelus runs it, then patches manually.

The script should:
1. Load all non-retired characters from `characters` collection (project `_id`, `name`, `moniker`, `retired`)
2. Load all player docs from `players` collection
3. For each active character: determine if a player doc references that character via `character_ids`
4. Report:
   - Players with no `players` doc (Discord user exists but no record)
   - Player docs with empty `character_ids`
   - Characters with no player claiming them
   - Summary counts
5. No writes. `--dry-run` flag not needed (read-only by default).

Pattern to follow: `server/scripts/relink-keeper-dt2-submission.js` and `server/scripts/restore-dt1-charles-cyrus.js` for MongoDB connection/client pattern.

### Task 2 — Player-record error card in `ordeals-view.js`

Current: all `apiGet` calls in `initOrdeals()` silently catch 403s and return null. Player sees blank "Not Started" cards.

Fix: detect the 403 at the `apiGet('/api/players/me')` call and render an error state instead of the ordeal list.

**How `apiGet` signals errors:** Check `public/js/data/api.js` before implementing. It likely throws on non-200 responses — if so, use a try/catch around the `apiGet('/api/players/me')` call rather than `.catch()`, and check the error status or message.

The error card HTML should use existing CSS classes. Render it in place of the ordeal list:
```html
<div class="ordeal-col">
  <div class="ordeals-container">
    <div class="ordeals-section">
      <p class="ordeal-setup-msg">
        Your account is not set up yet. Contact an ST to get your player record created.
      </p>
    </div>
  </div>
</div>
```
Add `.ordeal-setup-msg` to the ordeal CSS file — a simple notice paragraph, no special styling beyond existing body text. Use the project's existing `--gold2` or neutral colour.

**Do not change** the `.catch(() => null)` on the other parallel calls (questionnaire, history, ordeal-responses, submissions/mine) — those can all legitimately return null if the player has no submissions yet.

### Task 3 — Document the enum split in `ordeal.schema.js`

Add a file-level comment block (5-10 lines) explaining the two-pipeline design. Place it immediately before `ordealRubricSchema`:

```js
// ordeal_type naming conventions differ by pipeline:
//   Pipeline A (ordeal_submissions — historical Google Forms import):
//     lore_mastery | rules_mastery | covenant_questionnaire | character_history
//     → Marked in admin panel; cascade uses ORDEAL_NAME_MAP to translate to short names
//   Pipeline B (ordeal_responses — web form submissions):
//     rules | lore | covenant
//     → Approved by ST in player-facing ordeal form; cascade in ordeal-responses.js
// Do not attempt to unify these enums — both pipelines are active.
```

### Task 4 — Rubric seed template (NEW file: `data/ordeal_rubrics_seed.json`)

The `import-ordeals.js` script seeds `ordeal_rubrics` from this file only if it exists and the collection is empty. The file does not currently exist. Create a structural template with placeholder expected answers so the import script can run.

Required structure:
```json
{
  "lore_mastery": [
    { "index": 0, "question": "[Lore Q1 — fill in]", "expected_answer": "[PLACEHOLDER — ST to complete]", "marking_notes": "" }
  ],
  "rules_mastery": [
    { "index": 0, "question": "[Rules Q1 — fill in]", "expected_answer": "[PLACEHOLDER — ST to complete]", "marking_notes": "" }
  ],
  "covenant_questionnaire": [
    {
      "covenant": "Carthian Movement",
      "questions": [
        { "index": 0, "question": "[Carthian Q1 — fill in]", "expected_answer": "[PLACEHOLDER]", "marking_notes": "" }
      ]
    },
    { "covenant": "Circle of the Crone", "questions": [] },
    { "covenant": "Invictus", "questions": [] },
    { "covenant": "Lancea et Sanctum", "questions": [] }
  ]
}
```

Flag clearly at the top of the file with a comment that Angelus must fill in all `[PLACEHOLDER]` values before running the import script against production.

> **Note:** JSON doesn't support comments. Use a `"_note"` key at the top level:
> `"_note": "Fill in all PLACEHOLDER values before running import-ordeals.js against production"`

### Task 5 — Schema hardening (LOW priority — do last)

In `ordeal.schema.js`:
- Add `required: ['ordeal_type', 'ordeal_type']` appropriate fields to `ordealRubricSchema` and `ordealSubmissionSchema`
- For `ordealRubricSchema`, add: `required: ['ordeal_type', 'title', 'questions']`
- For `ordealSubmissionSchema`, add: `required: ['ordeal_type', 'submitted_at', 'source', 'responses']`
- Leave `additionalProperties: true` on all three — historical imports contain extra fields (e.g. `marking.marked_by`) that are not in the current schema

---

## Acceptance Criteria

- [ ] `server/scripts/audit-player-records.js` exists and runs cleanly — outputs gap report, no writes
- [ ] `data/ordeal_rubrics_seed.json` exists with correct structure (placeholders acceptable)
- [ ] `initOrdeals()` detects 403 from `/api/players/me` and renders the error card instead of ordeal cards
- [ ] Error card text: "Your account is not set up yet. Contact an ST to get your player record created."
- [ ] `ordeal.schema.js` has the two-pipeline comment block before `ordealRubricSchema`
- [ ] `ordealRubricSchema` and `ordealSubmissionSchema` have `required` arrays
- [ ] No localStorage writes introduced anywhere in this story
- [ ] Existing ordeal cards (for players with valid player records) render and function as before

### Operational acceptance (Angelus runs after code ships)

- [ ] Run `audit-player-records.js` against production — review gap report
- [ ] Patch any player record gaps manually via MongoDB or a follow-up script
- [ ] Confirm `ordeal_responses`, `ordeal_submissions`, `ordeal_rubrics` collections exist in live `tm_suite`
- [ ] Fill in `data/ordeal_rubrics_seed.json` with actual expected answers
- [ ] Run `import-ordeals.js` against production (seeds rubrics if collection empty; imports historical submissions)
- [ ] Smoke test: log in as a player, open Ordeals tab, fill a Rules response, submit — confirm doc appears in `ordeal_responses` with `status: submitted`
- [ ] Log in as ST, open the player's ordeal form, approve — confirm `status: approved` in `ordeal_responses` and `characters.ordeals[]` updated

---

## Files to modify

| File | Action | Notes |
|---|---|---|
| `server/scripts/audit-player-records.js` | CREATE | Read-only gap report script |
| `data/ordeal_rubrics_seed.json` | CREATE | Structural template with placeholders |
| `public/js/tabs/ordeals-view.js` | MODIFY | `initOrdeals()` — detect 403, render error card |
| `server/schemas/ordeal.schema.js` | MODIFY | Two-pipeline comment; `required` fields on rubric + submission schemas |
| (CSS file for ordeals) | MODIFY | Add `.ordeal-setup-msg` style |

### Finding the ordeal CSS file

Look for `.ordeal-card`, `.ordeal-section`, `.ordeals-heading` in `public/css/` — that's the file to add `.ordeal-setup-msg` to.

---

## What must not change

- `ordeal-form.js` — auto-save and submit logic is correct; do not add localStorage
- `ordeal-responses.js` route — player-scoping is correct; do not change the `queryPlayerId` logic
- `ordeal-submissions.js` — marking routes, cascade logic, and `/mine` strip are correct
- `ordeal-rubrics.js` — ST-only gates are correct
- `ORDEAL_NAME_MAP` in `ordeal-submissions.js` — this is the intentional translation layer; do not "fix" it
- `ordeals-admin.js` — reads only from `ordeal_submissions`; this is correct by design
- The two-pipeline architecture — do not attempt to merge `ordeal_submissions` and `ordeal_responses`

---

## Known data facts

The `import-ordeals.js` script:
- Sets `player_id: null` on all imported submissions ("populated when Epic 5 players collection is built" — this never happened)
- This means `cascadeComplete()` for historical submissions falls through to the `character_id` fallback path (line 55-58 in ordeal-submissions.js) for player-level ordeals — which works for the one character but won't cascade to other characters on the same player account
- Do not try to retroactively fix this in this story — it's a pre-existing known gap

---

## Dev Agent Record

**Implemented:** 2026-05-18

**Files modified:**
- `server/scripts/audit-player-records.js` — NEW: read-only gap report script
- `data/ordeal_rubrics_seed.json` — NEW: structural template with placeholders for all ordeal types
- `public/js/tabs/ordeals-view.js` — `initOrdeals()`: separated `/api/players/me` fetch from parallel batch; added try/catch to render error card on 403
- `server/schemas/ordeal.schema.js` — added two-pipeline comment block; added `required` to `ordealRubricSchema` and `ordealSubmissionSchema`
- `public/css/player-layout.css` — added `.ordeal-setup-msg` style after `.ordeal-fb-text`
- `server/routes/ordeal-responses.js` — removed misapplied `validate(ordealResponseSchema)` from POST route (schema expects `ordeal_type` field; route body uses `type`; route does its own type validation)
- `server/tests/helpers/test-app.js` — added ordealResponsesRouter and ordealRubricsRouter to test app
- `server/tests/api-ordeal-responses.test.js` — NEW: 17 tests covering auth, player scoping, cross-player isolation, draft/submit lifecycle, approval cascade
- `server/tests/api-ordeal-rubrics.test.js` — NEW: 7 tests covering rubric confidentiality (player blocked) and ST access
- `server/tests/ordeal-schema-seed.test.js` — NEW: 12 structural tests for schema required fields and seed file shape

**Completion notes:**
- `apiGet` throws `Error(message)` on non-2xx; the 403 from `requireAuth` throws `'No player record found — contact an ST'`. The try/catch in `initOrdeals` catches any error from the player-me fetch and renders the error card — does not inspect the message, so any auth failure shows the same user-friendly prompt.
- The `ordealSubmissionSchema` and `ordealRubricSchema` `required` fields are documentation-only — neither schema is imported by any route, so no runtime validation change.
- The rubric seed JSON has a `_note` key at root level (since JSON has no comment syntax) flagging that all PLACEHOLDER values must be filled before running the import script.
- **QA finding (fixed):** `validate(ordealResponseSchema)` was applied to `POST /api/ordeal-responses` but the schema requires `ordeal_type` while the request body uses `type`. This caused every POST to fail with 400 in production — players could never submit. Fixed by removing the misapplied middleware; route already validates type inline.
- Full suite: 838/838 tests pass.

---

## Scope Notes

- **In scope:** Audit script, rubric seed template, 403 error card, schema documentation and hardening
- **Out of scope:** Redesigning ordeal question content, merging the two pipelines, changes to `player.html` (legacy), fixing historical `player_id: null` values in `ordeal_submissions`, adding new ordeal types
