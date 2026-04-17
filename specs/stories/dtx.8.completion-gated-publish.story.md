# Story DTX.8: Completion-Gated Publish + Publish All

Status: ready-for-dev

## Story

As an ST managing downtime narrative delivery,
I want the push mechanism to only include sections I have marked complete,
and I want a single "Publish All" action that delivers every character's approved
sections at once (with gap placeholders for anything still pending),
so that players always receive accurate results without waiting for every single
section to be finalised.

## Acceptance Criteria

### AC1 — Completion gate on compilePushOutcome

`compilePushOutcome` changes from "include if response non-empty" to:

| Condition | Behaviour |
|---|---|
| Section is applicable + `status === 'complete'` | Include with content (as now) |
| Section is applicable + status is NOT `'complete'` | Include as gap placeholder (see AC3) |
| Section is not applicable to this character/sub | Omit entirely (as now) |

"Applicable" is determined by `getApplicableSections(char, sub)` — unchanged.

### AC2 — Zero-complete guard

If `compilePushOutcome` produces only gap placeholders and no real content (i.e. zero
sections are `status === 'complete'`), the function returns an empty string. The
existing empty guard in `handlePushCharacter` already blocks the push in this case —
no additional code needed. The error message reads:
`"Nothing to push — no sections are marked complete yet."`

### AC3 — Gap placeholder format

For each applicable section that is NOT `status === 'complete'`, emit:

```
## [Section Label]

*Your Storyteller is still finalising this section — contact them if you have questions.*
```

The label is the same heading that would appear if the section had content (territory
name, project title, merit type, etc.).

### AC4 — Per-section completion check by type

| Section key | Complete check | Gap label |
|---|---|---|
| `letter_from_home` | `sn.letter_from_home?.status === 'complete'` | `section.label` |
| `touchstone` | `sn.touchstone?.status === 'complete'` | `section.label` |
| `feeding_validation` | `sn.feeding_validation?.status === 'complete'` | `section.label` |
| `territory_reports[i]` | `sn.territory_reports?.[i]?.status === 'complete'` | territory name |
| `project_responses[i]` | `sn.project_responses?.[i]?.status === 'complete'` | project title |
| `action_responses[i]` | `sn.action_responses?.[i]?.status === 'complete'` | merit type |
| `resource_approvals[i]` | `sn.resource_approvals?.[i]?.status === 'complete'` | merit type / "Resource N" |
| `cacophony_savvy[i]` | `sn.cacophony_savvy?.[i]?.status === 'complete'` | `Cacophony Savvy N` |
| `general_notes` | always include if non-empty (no status) | — no gap — |

Note: `action_responses` is indexed globally across all merit sections
(same index as `sub.merit_actions[i]`). The category filter still applies
so only the correct merit section categories contribute to each section's items.

### AC5 — "Publish All" button in DT Story panel

A "Publish All" button appears in the DT Story panel header (above the nav rail).

Behaviour when clicked:
1. Iterate every submission in `_allSubmissions`.
2. For each, call `compilePushOutcome(sub)`. If the result is non-empty, PUT
   `{ 'st_review.outcome_text': md, 'st_review.outcome_visibility': 'published', 'st_review.published_at': iso }`
   to `/api/downtime_submissions/:sub._id`.
3. Update each pushed `sub.st_review` in `_allSubmissions` to reflect the published state.
4. Re-render the nav rail once all PUTs complete.
5. Show a summary in the panel: "Published N / M characters. K skipped (no sections complete)."
6. Submissions with zero complete sections are silently skipped — not an error condition.

Button label: **Publish All**. During execution show **Publishing…** (disabled). Only
visible to STs.

### AC6 — New game cycle creation triggers Publish All

When the ST creates a new downtime cycle via the admin panel, the system automatically
runs the equivalent of "Publish All" on the PREVIOUS cycle's submissions before the
new cycle is activated.

- Locate the "create/open new cycle" handler in `public/js/admin/` (exact location TBD
  — search for the POST to `/api/downtime_cycles`).
- After the new cycle is successfully created, resolve the previous cycle (most recent
  non-active cycle) and call `publishAllForCycle(cycleId)` — a shared helper extracted
  from the Publish All button handler.
- This is fire-and-forget with the same per-submission logic as AC5. No UI feedback
  required for the auto-trigger (it runs silently in the background).

### AC7 — Re-push updates correctly after Publish All

After a mass publish, an ST can still click "Push" (or the re-push ↺ button) on an
individual character. This overwrites `outcome_text` with the current compiled result.
No special handling needed — the idempotent PUT behaviour is unchanged.

### AC8 — Player-facing gap display

The player's Story tab renders gap entries as italicised pending notes within the
narrative. No code changes needed on the player side — gap content is plain markdown
text and renders via the existing `renderOutcome` / `parseOutcomeSections` functions.

The player's downtime form "awaiting ST review" message is replaced by the published
result (including gaps) as soon as any section is complete and pushed.

## Dev Notes

### Key files

- `public/js/admin/downtime-story.js` — `compilePushOutcome`, empty guard error
  message, "Publish All" button render + handler, `publishAllForCycle` helper
- Cycle creation handler — location TBD, search: `POST.*downtime_cycles` in
  `public/js/admin/`

### compilePushOutcome rewrite sketch

```js
function compilePushOutcome(sub) {
  const char = getCharForSub(sub);
  const sn = sub.st_narrative || {};
  const sections = getApplicableSections(char, sub);
  const parts = [];
  let hasContent = false;

  const GAP = '*Your Storyteller is still finalising this section — ' +
              'contact them if you have questions.*';

  for (const section of sections) {
    const key = section.key;

    if (key === 'letter_from_home' || key === 'touchstone' || key === 'feeding_validation') {
      const complete = sn[key]?.status === 'complete';
      if (complete) {
        const response = sn[key]?.response;
        if (response?.trim()) { parts.push(`## ${section.label}\n\n${response.trim()}`); hasContent = true; }
      } else {
        parts.push(`## ${section.label}\n\n${GAP}`);
      }

    } else if (key === 'territory_reports') {
      _feedTerrEntries(sub).forEach((terr, i) => {
        const complete = sn.territory_reports?.[i]?.status === 'complete';
        if (complete) {
          const response = sn.territory_reports?.[i]?.response;
          if (response?.trim()) { parts.push(`## ${terr.name}\n\n${response.trim()}`); hasContent = true; }
        } else {
          parts.push(`## ${terr.name}\n\n${GAP}`);
        }
      });

    } else if (key === 'project_responses') {
      (sub.projects_resolved || []).forEach((rev, i) => {
        const complete = sn.project_responses?.[i]?.status === 'complete';
        const label = sub.responses?.[`project_${i + 1}_title`] || `Project ${i + 1}`;
        if (complete) {
          const response = sn.project_responses?.[i]?.response;
          if (response?.trim()) {
            const pfn = rev?.player_facing_note?.trim();
            parts.push(`## ${label}\n\n${response.trim()}${pfn ? `\n\n${pfn}` : ''}`); hasContent = true;
          }
        } else {
          parts.push(`## ${label}\n\n${GAP}`);
        }
      });

    } else if (MERIT_SECTIONS.has(key)) {
      const categories = MERIT_SECTION_CATEGORIES[key] || [];
      (sub.merit_actions || []).forEach((action, i) => {
        const cat = deriveMeritCategory(action.merit_type);
        if (!categories.includes(cat)) return;
        const complete = sn.action_responses?.[i]?.status === 'complete';
        const label = action.merit_type || `Action ${i + 1}`;
        if (complete) {
          const response = sn.action_responses?.[i]?.response;
          if (response?.trim()) {
            const pfn = sub.merit_actions_resolved?.[i]?.player_facing_note?.trim();
            parts.push(`## ${label}\n\n${response.trim()}${pfn ? `\n\n${pfn}` : ''}`); hasContent = true;
          }
        } else {
          parts.push(`## ${label}\n\n${GAP}`);
        }
      });

    } else if (key === 'resource_approvals') {
      (sn.resource_approvals || []).forEach((approval, i) => {
        const complete = approval?.status === 'complete';
        const label = approval?.merit_type || `Resource ${i + 1}`;
        if (complete) {
          const response = approval?.response;
          if (response?.trim()) { parts.push(`## ${label}\n\n${response.trim()}`); hasContent = true; }
        } else {
          parts.push(`## ${label}\n\n${GAP}`);
        }
      });

    } else if (key === 'cacophony_savvy') {
      (sn.cacophony_savvy || []).forEach((slot, i) => {
        const complete = slot?.status === 'complete';
        const label = `Cacophony Savvy ${i + 1}`;
        if (complete) {
          const response = slot?.response;
          if (response?.trim()) { parts.push(`## ${label}\n\n${response.trim()}`); hasContent = true; }
        } else {
          parts.push(`## ${label}\n\n${GAP}`);
        }
      });
    }
  }

  // General notes — no status, always include if present
  const generalNotes = sn.general_notes?.trim();
  if (generalNotes) { parts.push(generalNotes); hasContent = true; }

  return hasContent ? parts.join('\n\n') : '';
}
```

### publishAllForCycle helper sketch

```js
async function publishAllForCycle(submissions) {
  let published = 0, skipped = 0;
  const now = new Date().toISOString();
  await Promise.all(submissions.map(async sub => {
    const md = compilePushOutcome(sub);
    if (!md.trim()) { skipped++; return; }
    const patch = {
      'st_review.outcome_text':       md,
      'st_review.outcome_visibility': 'published',
      'st_review.published_at':       now,
    };
    await apiPut('/api/downtime_submissions/' + sub._id, patch);
    if (!sub.st_review) sub.st_review = {};
    sub.st_review.outcome_text       = md;
    sub.st_review.outcome_visibility = 'published';
    published++;
  }));
  return { published, skipped };
}
```

### Empty guard error message update

Change existing guard from:
`'Nothing to push — all narrative fields are empty (check General Notes and section responses)'`
to:
`'Nothing to push — no sections are marked complete yet.'`

### Cycle creation hook — location TBD

Before implementing AC6, search `public/js/admin/` for the handler that POSTs to
`/api/downtime_cycles`. The hook should run after the POST resolves successfully,
fetching all submissions for the cycle being superseded and calling `publishAllForCycle`.
The previous cycle ID can be resolved as the most recent `closed` or `game` cycle
at the time of the new cycle's creation.
