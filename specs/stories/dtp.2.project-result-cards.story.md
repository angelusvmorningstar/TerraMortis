# Story DTP-2: Per-Action Project Result Cards

Status: complete

## Story

As a player opening my Story tab after downtime results are published,
I want to see a structured card for each of my project actions showing the ST's narrative response, my dice result, and any feedback,
so that I understand exactly what happened with each thing I did.

## Context

The DT Story tab (admin) writes per-project narratives to `st_narrative.project_responses[idx].response`. The processing panel writes dice data to `projects_resolved[idx]` and player feedback to `projects_resolved[idx].player_feedback`. Both fields are top-level on the submission document and reach the player via the API (after DTP-1 scrubs internal fields).

The current player Story tab renders only the assembled `published_outcome` blob (the four narrative sections + mechanical summary). Per-action cards are a new addition rendered below the existing narrative content.

## Acceptance Criteria

1. For each published submission, below the narrative sections, a "Project Results" block renders one card per project action in slot order.
2. Skipped actions (`pool_status === 'skipped'`) are not shown.
3. If `st_narrative.project_responses[idx].response` is non-empty: render the **full card**:
   - Action type chip (from ACTION_TYPE_LABELS)
   - Project name (`responses.project_${slot}_title`)
   - Objective (`responses.project_${slot}_outcome`), if non-empty
   - ST narrative response (`st_narrative.project_responses[idx].response`)
   - Dice pool expression (`projects_resolved[idx].pool_validated` or `pool.expression`), if pool_status is not `no_roll`
   - Roll result (`projects_resolved[idx].roll.successes` successes, exceptional flag), if roll exists
   - Player feedback (`projects_resolved[idx].player_feedback`), if non-empty
4. If `st_narrative.project_responses[idx].response` is empty or missing: render the **withheld card**:
   - Project name only
   - Body: *"Project withheld — see your Storytellers."*
5. No card is shown if `projects_resolved` is empty or absent for the submission.
6. Cards are visually consistent with the existing `.story-section` / `.story-entry` styling.

## Tasks / Subtasks

- [x] Task 1: Add ACTION_TYPE_LABELS constant to story-tab.js (AC: 3)
  - [ ] At the top of `public/js/player/story-tab.js`, add the same label map used in downtime-story.js:
    ```js
    const ACTION_TYPE_LABELS = {
      ambience_increase: 'Ambience Increase', ambience_decrease: 'Ambience Decrease',
      attack: 'Attack', feed: 'Feed', hide_protect: 'Hide / Protect',
      investigate: 'Investigate', patrol_scout: 'Patrol / Scout',
      support: 'Support', misc: 'Miscellaneous', maintenance: 'Maintenance',
      xp_spend: 'XP Spend', block: 'Block', rumour: 'Rumour',
      grow: 'Grow', acquisition: 'Acquisition',
    };
    ```

- [x] Task 2: Add `renderProjectCards(sub)` function (AC: 1–5)
  - [ ] In `public/js/player/story-tab.js`, add after `renderOutcome`:
    ```js
    function renderProjectCards(sub) {
      const resolved = sub.projects_resolved || [];
      const cards = resolved.slice(0, 4).filter(r => r?.pool_status !== 'skipped');
      if (!cards.length) return '';

      let h = '<div class="story-proj-results">';
      h += '<div class="story-proj-results-head">Project Results</div>';

      for (let i = 0; i < resolved.length && i < 4; i++) {
        const rev = resolved[i] || {};
        if (rev.pool_status === 'skipped') continue;

        const slot     = i + 1;
        const title    = sub.responses?.[`project_${slot}_title`]   || `Project ${slot}`;
        const outcome  = sub.responses?.[`project_${slot}_outcome`] || '';
        const actType  = rev.action_type || sub.responses?.[`project_${slot}_action`] || '';
        const actLabel = ACTION_TYPE_LABELS[actType] || actType || 'Action';
        const narr     = sub.st_narrative?.project_responses?.[i];
        const response = narr?.response || '';

        h += '<div class="story-proj-card">';
        h += `<div class="story-proj-card-header">`;
        h += `<span class="story-proj-chip">${esc(actLabel)}</span>`;
        h += `<span class="story-proj-title">${esc(title)}</span>`;
        h += '</div>';

        if (!response) {
          h += '<div class="story-proj-withheld">Project withheld \u2014 see your Storytellers.</div>';
        } else {
          if (outcome) h += `<div class="story-proj-objective"><span class="story-proj-lbl">Objective:</span> ${esc(outcome)}</div>`;
          h += `<div class="story-proj-response">${esc(response)}</div>`;

          const showPool = rev.pool_status !== 'no_roll' && rev.pool_status !== 'maintenance';
          const poolExpr = rev.pool_validated?.expression || rev.pool?.expression || rev.pool_validated || '';
          const roll     = rev.roll || null;

          if (showPool && poolExpr) {
            h += `<div class="story-proj-meta"><span class="story-proj-lbl">Pool:</span> ${esc(poolExpr)}`;
            if (roll) {
              const exc = roll.exceptional ? ', Exceptional' : '';
              h += ` <span class="story-proj-roll">\u2192 ${roll.successes} success${roll.successes !== 1 ? 'es' : ''}${exc}</span>`;
            }
            h += '</div>';
          } else if (rev.pool_status === 'no_roll') {
            h += '<div class="story-proj-meta">No roll required.</div>';
          }

          if (rev.player_feedback?.trim()) {
            h += `<div class="story-proj-feedback"><span class="story-proj-lbl">Feedback:</span> ${esc(rev.player_feedback.trim())}</div>`;
          }
        }

        h += '</div>'; // story-proj-card
      }

      h += '</div>'; // story-proj-results
      return h;
    }
    ```

- [x] Task 3: Call `renderProjectCards` from `renderChronicle` (AC: 1)
  - [ ] In `renderChronicle`, after `h += renderOutcome(sub.published_outcome)`, add:
    ```js
    h += renderProjectCards(sub);
    ```

- [x] Task 4: CSS for project cards (AC: 6)
  - [ ] In `public/css/player-layout.css`, after the `.story-section-mech` block (~line 2723), add:
    ```css
    .story-proj-results {
      padding: 14px 16px 16px;
      border-top: 1px solid var(--bdr);
    }
    .story-proj-results-head {
      font-family: var(--fl);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 10px;
    }
    .story-proj-card {
      background: var(--surf3);
      border: 1px solid var(--bdr);
      border-radius: 5px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .story-proj-card:last-child { margin-bottom: 0; }
    .story-proj-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .story-proj-chip {
      font-family: var(--fl);
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--txt3);
      background: var(--surf2);
      border: 1px solid var(--bdr);
      border-radius: 3px;
      padding: 1px 5px;
      white-space: nowrap;
    }
    .story-proj-title {
      font-family: var(--fl);
      font-size: 13px;
      font-weight: 600;
      color: var(--txt);
    }
    .story-proj-objective {
      font-size: 12px;
      color: var(--txt3);
      margin-bottom: 6px;
    }
    .story-proj-response {
      font-size: 13px;
      color: var(--txt2);
      line-height: 1.6;
      white-space: pre-wrap;
      margin-bottom: 6px;
    }
    .story-proj-meta {
      font-size: 11px;
      color: var(--txt3);
      margin-bottom: 4px;
    }
    .story-proj-roll { color: var(--txt2); margin-left: 4px; }
    .story-proj-feedback {
      font-size: 12px;
      color: var(--txt2);
      border-left: 2px solid var(--gold2);
      padding-left: 8px;
      margin-top: 6px;
    }
    .story-proj-withheld {
      font-size: 12px;
      color: var(--txt3);
      font-style: italic;
    }
    .story-proj-lbl {
      font-family: var(--fl);
      font-size: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--txt3);
      margin-right: 3px;
    }
    ```

## Dev Notes

### pool_validated shape

`pool_validated` may be a string expression (legacy) or an object `{ total, expression }`. The render code checks both: `rev.pool_validated?.expression || rev.pool?.expression || rev.pool_validated`. If it's a plain string it renders directly.

### Withheld vs skipped

- `pool_status === 'skipped'` → action not shown at all (not even withheld)
- `response` empty → withheld card shown (action existed but narrative not ready)

### Published outcome still shown

The existing four narrative sections (Letter, Touchstone, Territory, Dossier, Mechanical Outcomes) continue to render above the project cards via `renderOutcome`. The cards are additive.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `public/js/player/story-tab.js`
- `public/css/player-layout.css`
