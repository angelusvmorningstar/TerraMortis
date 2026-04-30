---
title: 'Archive shows all published DT cycles — read from downtime_submissions, not archive_documents'
type: 'feat'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — client-side query swap + render adapter; Story → Chronicle already does this exact pattern (story-tab.js:168) so the precedent is direct'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - public/js/tabs/archive-tab.js
  - public/js/tabs/story-tab.js
  - public/js/admin/archive-admin.js
  - server/routes/archive-documents.js
---

## Intent

**Problem:** Archive tab (`tabs/archive-tab.js:36-97`) queries the `archive_documents` collection for `type='downtime_response'` entries. Those entries exist only when STs manually upload .docx files via the admin Archive panel (`admin/archive-admin.js`) or run the one-time bulk import script (`server/scripts/import-archive-documents.js`). DT 1 entries exist because someone ran that pipeline once. DT 2 entries don't exist because the pipeline was never re-run. Players see DT 1 in their Archive but not DT 2 — even though DT 2 is published and visible on the Story tab Chronicle.

The Story tab Chronicle (`tabs/story-tab.js:168`) reads `downtime_submissions` directly, filters by `published_outcome`, and renders all of them in reverse chronological order. The data is canonical there. The Archive tab is the only surface still gated by the manual `archive_documents` pipeline for downtime responses.

User mental model from the diagnostic: *"the current report would exist in the report section, but archive would contain all downtime report in reverse chronological order."* Archive should be the durable record, not a manually-curated subset.

**Approach (per epic recommendation, Option B):** Stop using `archive_documents` for downtime responses. Archive tab reads from `downtime_submissions` directly — same query and filter as the Chronicle. The `archive_documents` collection retains its dossier and history_submission entries; downtime is no longer one of its responsibilities.

This is a client-side query swap with a render adapter (downtime_submission shape → archive list-item shape). No server-side hooks, no per-cycle ST work, no migration of `downtime_submissions` data. The legacy DT 1 `archive_documents` entries are silently shadowed (the new query path doesn't read them). They can be left in place as harmless dead data or cleaned up in a follow-up.

## Boundaries & Constraints

**Always:**
- Archive tab continues to surface dossiers and character histories from `archive_documents` (those types are unchanged).
- Downtime entries in the Archive list display the same labels and metadata as today: cycle label (`Cycle N` from `downtime_cycles`), sortable by cycle in reverse-chronological order.
- Document detail view (the panel opened when a downtime entry is clicked) renders the published outcome using the same compilation logic as the Story tab (`story-tab.js:renderOutcomeWithCards` at `:370-498`). The Archive's existing rich-HTML rendering for dossiers / histories stays; downtime entries get the structured Chronicle render.
- Archive admin upload UI (`admin/archive-admin.js:14-21`) keeps the `downtime_response` option for now. Reason: the upload path remains useful for STs who want to attach an out-of-band .docx to a specific cycle (e.g. retconned narrative, special edit). Visibility / deduplication: when both an `archive_documents` entry AND a `downtime_submissions` published outcome exist for the same character + cycle, prefer the submission (canonical) and surface the .docx as a "ST attachment" sub-row OR a separate group. Decision deferred — see Ask First.
- Permissions: the existing `/api/downtime_submissions` API gates per-character access for players and full access for STs. The Archive tab inherits this — players see only their own characters' downtimes; STs see all. No new permission work.

**Ask First:**
- **Legacy DT 1 entries in `archive_documents`.** After this story ships, the Archive tab no longer reads them. Three handling options:
  1. **Leave them** — harmless dead data. Lowest effort. Recommended unless the duplication causes confusion.
  2. **Filter them out at API layer** — server-side filter on `GET /api/archive_documents` to exclude `type='downtime_response'`. Belt-and-braces but a bit of churn.
  3. **One-off cleanup script** — delete the entries. Frees the storage. Reversible only via re-import.
  Default: leave them. Confirm if you want option 2 or 3.
- **Coexistence with admin .docx upload.** If an ST uploads a downtime_response .docx for a cycle that *also* has a published submission, the player would see both in the Archive list — the structured one (from submission) and the .docx one (from archive_documents). Three reconcile options:
  1. Prefer submission, ignore .docx (effectively making the .docx upload path dead for downtime_response).
  2. Show both — submission entry with optional "ST attachment" badge linking to the .docx.
  3. Drop the `downtime_response` option from the upload form entirely (full deprecation).
  Default: option 1 (prefer submission, .docx not surfaced — simplest). Confirm if you want a more visible coexistence.
- **Cycle metadata in the Archive list.** Story tab uses `cycle.label || 'Cycle ' + last 4 of cycle._id` (`story-tab.js:48`). Archive's existing `archive_documents` entries use a numeric `cycle` field (e.g. "Cycle 1", "Cycle 2"). Default: use `cycle.label` from `downtime_cycles`, fall back to `Cycle N` if no cycles match. Same pattern as the Chronicle.

**Never:**
- Do not delete `archive_documents` entries during normal flow. They're separate, harmless, and (per the recommended A1 path) can be cleaned up by a follow-up if desired.
- Do not change the `archive_documents` API or schema. Other types (dossier, history_submission, primer) keep using it as today.
- Do not render the downtime entries in the Archive tab using the Archive's existing inline-editor flow (`archive-inline-editor.js`). Downtime narratives are edited via the Story tab's per-section Edit affordance (DTSR-4), not via the Archive's content_html editor. The Archive view is read-only for downtime entries.
- Do not duplicate the Story tab's `renderOutcomeWithCards` rendering function. Import and reuse it.
- Do not touch the bulk-import script `server/scripts/import-archive-documents.js`. It still works for dossiers and histories; only downtime_response usage is shadowed.

## Alternative implementations (in case the user pivots from B → A or C)

**Option A — Auto-write `archive_documents` on cycle close (server-side).**

Effort: medium. Server-side hook on `PUT /api/downtime_cycles/:id` that, when status transitions to `closed` or `complete`, iterates `downtime_submissions` for that cycle, compiles each `published_outcome` to HTML via the Chronicle render logic (server-equivalent), and inserts an `archive_documents` row per character. Backfill script for DT 2 entries already published.

Pros: archive_documents stays the canonical archive surface. Existing UI works unchanged.
Cons: data duplication (submission + archive_documents both carry the narrative). Drift risk if the player later flags or the ST edits the chronicle (the archive copy goes stale unless a re-write hook fires).

**Option C — Manual backfill of DT 2 only.**

Effort: minimal. ST uses the existing admin Archive upload UI to manually attach .docx files for DT 2 per character. Zero code change.

Pros: ships in zero engineering hours.
Cons: DT 3, DT 4, etc. require the same manual work. Doesn't fix the structural gap.

**This story specs Option B.** If you pivot, the dev agent should re-scope: A doubles the effort and adds a server hook + backfill; C closes this story file (no engineering needed; convert to an ST runbook entry).

## I/O & Edge-Case Matrix

| Scenario | Pre-fix | Post-fix |
|---|---|---|
| Char has published DT 1 + DT 2 outcomes; legacy `archive_documents` has DT 1 entry only | Archive shows DT 1 only | Archive shows DT 1 and DT 2 (both from submissions) |
| Char has only DT 2 published (joined after DT 1) | Archive empty | Archive shows DT 2 |
| Char has DT 1 published + ST-uploaded .docx in `archive_documents` for DT 1 + DT 2 published | Archive shows the .docx version of DT 1 (from archive_documents); DT 2 invisible | Archive shows DT 1 from submission (per default reconcile choice 1) and DT 2 from submission. The .docx is shadowed. |
| ST opens any character's Archive tab | Same as player; sees archive_documents entries | Same data path; ST sees all submissions per role gate. No special ST behaviour. |
| Player clicks a downtime entry in Archive | Opens Archive's inline document detail view (HTML rendering) | Opens a structured detail view rendering the published outcome via the same logic as Story tab's Chronicle |
| Player tries to edit a downtime entry from Archive | ST can edit via the Archive inline editor (HTML content_html) | Edit affordance is hidden for downtime entries. ST edits via the Story tab's per-section Edit (DTSR-4). |
| Char has dossier + character history + DT 1 + DT 2 | Archive shows three groups: Dossier, Downtime Reports (DT 1), Character History | Archive shows three groups: Dossier (from archive_documents), Downtime Reports (DT 1 + DT 2 from submissions), Character History (from archive_documents) |
| Cycle metadata: cycle has `label: "Game 4"` set by ST | Archive shows "Cycle 4" (numeric) | Archive shows "Game 4" (label) |
| Cycle metadata: cycle has no label | Shows numeric | Falls back to `Cycle <last-4-of-id>` per Chronicle convention |
| `downtime_submissions` API fails to load | Archive partial: dossier + history still shown if `archive_documents` succeeds | Same pattern: catch the submissions error, render dossier/history from archive_documents anyway, log the error to console |

## Code Map

### `public/js/tabs/archive-tab.js` — main change

**Imports** (top of file): add `apiGet` already present; add cycle/submission processing imports. Mirror Chronicle pattern:
```js
import { renderOutcomeWithCards } from './story-tab.js';
```

**Replace the data-load section** in `renderArchiveList` (line 36-47):

Currently:
```js
async function renderArchiveList() {
  _el.innerHTML = '<p class="placeholder-msg">Loading…</p>';

  let docs = [];
  try {
    docs = await apiGet(`/api/archive_documents?character_id=${_char._id}`);
  } catch { /* non-fatal */ }

  const dossiers  = docs.filter(d => d.type === 'dossier');
  const downtimes = docs.filter(d => d.type === 'downtime_response')
                        .sort((a, b) => (a.cycle || 0) - (b.cycle || 0));
  const histories = docs.filter(d => d.type === 'history_submission');
  // ...
}
```

After:
```js
async function renderArchiveList() {
  _el.innerHTML = '<p class="placeholder-msg">Loading…</p>';

  // Fetch dossier + history from archive_documents; downtime narratives come
  // from downtime_submissions (DTLT-9 — replaces the manual archive_documents
  // upload pipeline for downtime_response with the canonical submission data).
  let docs = [];
  let subs = [];
  let cycles = [];
  try {
    [docs, subs, cycles] = await Promise.all([
      apiGet(`/api/archive_documents?character_id=${_char._id}`).catch(() => []),
      apiGet(`/api/downtime_submissions`).catch(() => []),
      apiGet(`/api/downtime_cycles`).catch(() => []),
    ]);
    // STs receive raw docs; promote st_review → published_outcome so the
    // archive view matches the Chronicle (mirrors story-tab.js:80-84)
    subs.forEach(s => {
      if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
        s.published_outcome = s.st_review.outcome_text;
      }
    });
  } catch { /* non-fatal */ }

  const dossiers  = docs.filter(d => d.type === 'dossier');
  const histories = docs.filter(d => d.type === 'history_submission');

  // Downtime entries from submissions, filtered to this character + published,
  // reverse chronological by cycle (mirrors story-tab.js:51-53)
  const cycleMap = {};
  const cycleOrderMap = {};  // cycle id → numeric order key for sorting
  for (const c of cycles) {
    cycleMap[String(c._id)] = c.label || `Cycle ${String(c._id).slice(-4)}`;
    cycleOrderMap[String(c._id)] = c.cycle_number || c.created_at || c._id;
  }
  const charId = String(_char._id);
  const downtimeSubs = subs
    .filter(s => String(s.character_id) === charId && s.published_outcome)
    .sort((a, b) => {
      const ka = cycleOrderMap[String(a.cycle_id)] || '';
      const kb = cycleOrderMap[String(b.cycle_id)] || '';
      return String(kb).localeCompare(String(ka));  // reverse chronological
    });

  // ── render same shape as before, but downtime group iterates submissions ──
  let h = '';
  if (dossiers.length || downtimeSubs.length || histories.length) {
    h += '<div class="arc-docs">';
    if (dossiers.length)     h += renderDocGroup('Dossier', dossiers);
    if (downtimeSubs.length) h += renderDowntimeGroup('Downtime Reports', downtimeSubs, cycleMap);
    if (histories.length)    h += renderDocGroup('Character History', histories);
    h += '</div>';
  }
  // ... rest of function (retired chars + click wiring) unchanged ...
}
```

**Add a new render helper** (sibling of `renderDocGroup` at line 99):

```js
/**
 * Render a list of downtime submissions as archive list items.
 * Each item: cycle label + click to open structured Chronicle-style detail view.
 */
function renderDowntimeGroup(heading, submissions, cycleMap) {
  let h = `<div class="arc-doc-group">`;
  h += `<div class="arc-doc-group-title">${esc(heading)}</div>`;
  for (const sub of submissions) {
    const cycleLabel = cycleMap[String(sub.cycle_id)] || 'Unknown Cycle';
    h += `<div class="arc-doc-item" data-sub-id="${esc(String(sub._id))}">`;
    h += `<span class="arc-doc-title">${esc(cycleLabel)}</span>`;
    h += `<span class="arc-doc-meta">Downtime narrative</span>`;
    h += '<span class="arc-doc-arrow">›</span>';
    h += '</div>';
  }
  h += '</div>';
  return h;
}
```

**Add click wiring** for downtime items in `renderArchiveList` (after the existing `_el.querySelectorAll('.arc-doc-item')` block at line 86-88):

```js
// Wire downtime sub clicks (data-sub-id present instead of data-doc-id)
_el.querySelectorAll('.arc-doc-item[data-sub-id]').forEach(item => {
  item.addEventListener('click', () => openDowntimeDetail(item.dataset.subId, downtimeSubs, cycleMap));
});
```

(Note: the existing `_el.querySelectorAll('.arc-doc-item')` query at :86-87 will match BOTH `data-doc-id` and `data-sub-id` items. To avoid double-handlers, scope the existing handler to `[data-doc-id]` and add the new one for `[data-sub-id]`. Or use a delegated single handler that checks which dataset is present.)

**Add a new detail renderer** for downtime entries (sibling of `openDocDetail` at line 116):

```js
/**
 * Detail view for a downtime narrative — renders the published outcome
 * using the same component as the Story tab's Chronicle.
 */
function openDowntimeDetail(subId, allSubs, cycleMap) {
  const sub = allSubs.find(s => String(s._id) === String(subId));
  if (!sub) {
    _el.innerHTML = '<p class="placeholder-msg">Downtime narrative not found.</p>';
    return;
  }
  const cycleLabel = cycleMap[String(sub.cycle_id)] || 'Unknown Cycle';

  let h = '<div class="arc-detail">';
  h += `<button class="qf-back-btn" id="arc-back">← Back to Archive</button>`;
  h += `<div class="arc-detail-header">`;
  h += `<div class="arc-detail-title">${esc(cycleLabel)} — Downtime narrative</div>`;
  // No Edit button — downtime narratives are edited via Story tab Chronicle (DTSR-4)
  h += '</div>';
  h += '<div class="arc-detail-body reading-pane">';
  h += renderOutcomeWithCards(sub);  // imported from ./story-tab.js
  h += '</div>';
  h += '</div>';

  _el.innerHTML = h;
  document.getElementById('arc-back').addEventListener('click', renderArchiveList);
}
```

### `public/js/tabs/story-tab.js` — export `renderOutcomeWithCards`

Already exported per `:370`. No change.

### `public/js/admin/archive-admin.js` — leave as-is

Per Boundaries: keep the `downtime_response` upload option for one-off ST attachments. Reconcile decision (per "Ask First") determines whether those .docx uploads surface or are shadowed by the canonical submission entry. If reconcile choice is option 3 (full deprecation of upload), drop the entry from `TYPE_LABELS` and `TYPE_OPTIONS` at line 14-21.

### Server-side — no changes

`/api/downtime_submissions`, `/api/downtime_cycles`, `/api/archive_documents` all already exist with the right permissions. This story is purely a client-side data-source swap.

### `public/js/dev-fixtures.js` — verify mock continues to work

Line 47 already mocks `archive_documents` GETs as empty array. The new dependency on `/api/downtime_submissions` and `/api/downtime_cycles` is already mocked elsewhere for the Story tab. Sanity-check during implementation.

## Tasks & Acceptance

**Execution:**

- [ ] Confirm option B is the chosen path (or pivot per "Alternative implementations").
- [ ] Update `renderArchiveList` in `tabs/archive-tab.js`: parallel-fetch `archive_documents` (for dossier + history) + `downtime_submissions` + `downtime_cycles`. Filter submissions to this character + published. Build cycle label map.
- [ ] Add `renderDowntimeGroup` render helper.
- [ ] Add click wiring for `[data-sub-id]` items, scope existing handler to `[data-doc-id]` to avoid double-fire.
- [ ] Add `openDowntimeDetail(subId, allSubs, cycleMap)` detail renderer that imports + calls `renderOutcomeWithCards` from `story-tab.js`.
- [ ] Confirm `renderOutcomeWithCards` works without `editable: true` (it already defaults to false; double-check by inspecting the call signature at `story-tab.js:370`).
- [ ] Verify dev-fixtures `subs` and `cycles` returns are sane for the local test path.
- [ ] Manual smoke per Verification.

**Acceptance Criteria:**

- Given a character with one published DT 1 outcome and one published DT 2 outcome, when the player opens the Archive tab, then the Downtime Reports group lists both entries, sorted reverse-chronologically.
- Given a character with no published downtimes (e.g. just-arrived character), when the Archive tab loads, then the Downtime Reports group is hidden (no empty group rendered).
- Given a character with a dossier, a history submission, and two published downtimes, when the Archive tab loads, then three groups render in the standard order: Dossier, Downtime Reports, Character History.
- Given the player clicks a downtime entry, when the detail view opens, then the published outcome renders using the same Chronicle component as the Story tab (`renderOutcomeWithCards`), with no Edit button.
- Given the cycle has `label: "Game 4"`, when the entry renders in the list and detail header, then it shows "Game 4" (label takes precedence over `Cycle <id>`).
- Given the cycle has no label, when the entry renders, then it falls back to `Cycle <last-4-of-id>`.
- Given an ST opens the Archive tab for any character (even one not their own), when the data loads, then they see the same downtime entries as the player would (per existing API gates).
- Given the legacy DT 1 entries still exist in `archive_documents` with `type='downtime_response'`, when the Archive tab loads, then those entries are NOT shown (filtered out from `docs` because the downtime list is sourced from submissions instead). The default reconcile path: shadow the .docx silently.
- Given a player attempts to edit a downtime entry from the Archive view, when they look at the detail view, then no Edit button is shown (read-only); they're directed to the Story tab Chronicle for per-section edits via DTSR-4 (no copy change required for this story; absence of the button is the correct UX).

## Verification

**Commands:**

- No new tests required — query swap + render adapter; no schema or API change.
- Browser console clean during Archive tab load and downtime entry click.

**Manual checks:**

1. **Multi-cycle character:**
   - Pick a character with both DT 1 and DT 2 published outcomes (any active player; check live submissions). Open the Archive tab as that player. Confirm Downtime Reports group lists both cycles reverse-chronologically.
2. **Single-cycle character:**
   - Pick a character published in DT 2 only. Open Archive. Confirm DT 2 visible.
3. **Detail view:**
   - Click a downtime entry. Confirm the detail view opens with the structured Chronicle rendering (Story Moment, Home Report, Feeding section, project cards, Rumours section, etc. per `renderOutcomeWithCards`). Confirm no Edit button. Click "← Back to Archive". Confirm list view returns intact.
4. **Cycle label:**
   - Open a character's Archive. Hover an entry; confirm the cycle label matches what's shown on the Story tab.
5. **Dossier + history coexist:**
   - Pick a character with all four artifact types. Confirm three groups render: Dossier (archive_documents), Downtime Reports (submissions), Character History (archive_documents). Each clickable, each opens its appropriate detail view.
6. **Legacy archive_documents entries shadowed:**
   - Find a character with a legacy `type='downtime_response'` archive_documents entry (DT 1 era). Open the Archive tab. Confirm that entry does NOT duplicate the submission entry — only one DT 1 row visible (from submission).
7. **No-published-yet edge case:**
   - Pick a character with submissions in-flight but nothing yet published. Open Archive. Confirm Downtime Reports group is hidden; dossier + history (if present) still render.
8. **ST view:**
   - Switch to ST role. Open Archive tab for a character. Confirm same downtime list visible. ST has the existing Edit button on dossier/history entries — confirm it's there. Confirm NO edit button on downtime entries (they're read-only via Archive — edits happen via Story tab Chronicle DTSR-4).

## Final consequence

The Archive tab finally reflects the canonical state of published downtimes. Players see DT 2 alongside DT 1; future cycles appear automatically as they publish — no per-cycle ST work, no manual upload step, no .docx wrangling. The Story tab Chronicle and the Archive tab read from the same canonical source; they're consistent by construction, not by manual coordination.

`archive_documents` retains its role as the home of dossiers, character histories, and the primer — artefacts that exist outside the downtime cycle and are uploaded out-of-band by STs. The bulk-import script and admin upload UI continue to serve those types.

The legacy DT 1 entries in `archive_documents` are shadowed by the new query path; they sit harmlessly in the collection. A follow-up cleanup story can purge them if desired (per "Ask First"), but they don't need to be removed for this story's correctness.

Three architectural alternatives (A: server-side hook, B: client read swap, C: manual backfill) are documented at the top of this story for traceability. B was chosen as the lowest-effort, highest-leverage option that scales to all future cycles automatically.
