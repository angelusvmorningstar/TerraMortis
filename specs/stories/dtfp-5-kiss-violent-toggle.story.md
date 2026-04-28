---
id: dtfp.5
epic: dtfp
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTFP-5: Kiss / Violent feeding toggle on the DT form

As a player declaring how I fed this cycle,
I should set explicitly whether the feeding was a discreet "Kiss" or an overt "Violent" act, with sensible pre-selection driven by the feeding method I'm using and the freedom to override that pre-selection,
So that my Storyteller has a clear in-world signal of how loudly I fed (which drives masquerade impact, witness handling, and downstream consequences) without having to infer it from the method alone.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 2 (Player Form Polish):

> **DTF2.5** — Kiss/Violent toggle. New field `feed_violence: 'kiss' | 'violent'`. Toggle wording: **"The Kiss (subtle)" / "Violent"**. Stalking surfaces choice unselected; others pre-select per nature; player can override own pre-selection. ST override field `feed_violence_st_override`. Compat shim infers `feed_violence` from legacy `feed_method`.

The toggle sits within the feeding section of the DT form. Two values:
- `'kiss'` — subtle, low-visibility feeding (the Kiss)
- `'violent'` — overt, witness-risk feeding

The toggle is **always shown** when the player has any feeding intent (i.e. has set blood types or chosen a method or built a pool). Pre-selection rules driven by the in-memory `feedMethodId`:

| Method (in-memory) | Pre-select |
|---|---|
| `seduction` | `kiss` |
| `stalking` | **unselected** (player must pick) |
| `force` | `violent` |
| `familiar` (Deception) | `kiss` |
| `intimidation` | `violent` |
| `other` | unselected |
| (no method picked) | unselected |

Player can override their pre-selection at any time. The persisted value is what the player chose — the pre-selection is just a starting state.

The ST has an override field `feed_violence_st_override` for cases where they need to record a different value than the player chose (e.g. the player thought it was a Kiss but the dice / ST adjudication revealed witnesses → ST records the actual outcome as Violent for narrative purposes). The override does not back-write the player's `feed_violence` field; both are stored.

A **compat shim** infers `feed_violence` for legacy submissions based on the legacy `feed_method` field, using the same pre-selection table above. Submissions stored before DTFP-5 do not have `feed_violence`; on read, the shim returns the inferred value so DT Story / DT Processing / player report rendering all work with one consistent shape.

### Files in scope

- `public/js/tabs/downtime-form.js` — feeding section render: add the toggle UI; wire change handler to persist to `responses.feed_violence`.
- `public/js/admin/downtime-views.js` — DT Processing feeding panel: surface the player's `feed_violence`, allow ST to set `feed_violence_st_override`.
- `public/js/admin/downtime-story.js` — DT Story feeding section: read `feed_violence_st_override || feed_violence || inferFromLegacy(...)` and surface in the section context.
- `server/schemas/downtime_submission.schema.js` — add `responses.feed_violence` and `st_review.feed_violence_st_override` field shapes (likely allowed via `additionalProperties: true`; verify).
- A small helper module for the compat shim — could live in `public/js/tabs/downtime-data.js` or in a new `public/js/data/feed-violence.js` if it grows beyond a small lookup.

### Out of scope

- Auto-deriving witnesses or masquerade-breach outcomes from the toggle. The toggle is a fact-of-record signal; ST derives consequences narratively.
- Per-territory granularity. The toggle is per submission (one feeding scene per cycle).
- Differentiating "no feeding" from "kiss"/"violent". Players who don't feed already have a separate flow (`no_feed` status). The toggle does not render when the player has chosen not to feed.
- Player-side display of the ST override. The ST override is ST-only; the player sees their own `feed_violence` choice on the form. (If the ST override should surface in the player report, that's a DT delivery decision; defer.)
- Animations or extra confirmation on toggle change.
- Renaming or restructuring the existing feeding section header.

---

## Acceptance Criteria

### Visibility

**Given** the player is on the DT form's feeding section
**And** the player has any feeding intent (a method picked, blood type selected, pool components set, etc.)
**Then** the toggle is rendered with two clearly-labelled options:
- **"The Kiss (subtle)"**
- **"Violent"**

**Given** the player has chosen "no feeding this cycle" (whatever the existing not-feeding affordance is)
**Then** the toggle is **not** rendered.

### Pre-selection

**Given** the player has just picked the **Seduction** method
**Then** the toggle pre-selects **"The Kiss (subtle)"**.

**Given** the player has just picked the **By Force** method
**Then** the toggle pre-selects **"Violent"**.

**Given** the player has just picked **Deception** (formerly Familiar Face, id `familiar`)
**Then** the toggle pre-selects **"The Kiss (subtle)"**.

**Given** the player has just picked **Intimidation**
**Then** the toggle pre-selects **"Violent"**.

**Given** the player has just picked **Stalking**
**Then** the toggle is rendered **unselected** — neither option active. The player must explicitly choose.

**Given** the player has picked **Other**, or no method is currently selected
**Then** the toggle is rendered unselected.

### Player override

**Given** the toggle pre-selected one option per the table above
**When** the player clicks the other option
**Then** the player's choice replaces the pre-selection.
**And** subsequent saves persist the player's choice (`responses.feed_violence`).

**Given** the player has previously persisted a `feed_violence` value
**When** the form re-renders (refresh, navigate away and back)
**Then** the toggle reflects the persisted value, not the method-driven pre-selection.

### ST override

**Given** I am an ST on the DT Processing feeding panel
**Then** I see the player's chosen `feed_violence` value displayed (read-only summary).
**And** I see an override control (a small dropdown or two-button toggle) labelled "ST override".
**And** the override field initialises to whatever the ST has previously set (if anything), independent of the player's choice.

**Given** I set the ST override to a value different from the player's
**Then** the value persists at `st_review.feed_violence_st_override`.
**And** the player's `responses.feed_violence` is **unchanged** (both fields coexist).

**Given** I clear the ST override
**Then** the field is removed (or set to `null`); downstream readers fall back to the player's value.

### Compat shim

**Given** a legacy submission with `responses.feed_method: 'familiar'` and **no** `responses.feed_violence`
**When** any code reads the effective `feed_violence` (DT Story, player report, etc.)
**Then** the shim infers `'kiss'` (per the table above).

**Given** a legacy submission with `responses.feed_method: 'force'` and no `feed_violence`
**Then** the shim infers `'violent'`.

**Given** a legacy submission with `responses.feed_method: 'stalking'` and no `feed_violence`
**Then** the shim returns **unspecified** (e.g. `null` or `undefined`).
**And** display contexts render this as "Not specified" or omit the field rather than guessing.

**Given** a submission with `responses.feed_violence` explicitly set
**Then** the shim returns that value; no inference happens (player choice always wins over the inferred fallback).

**Given** an ST override is set
**Then** the **effective** value for ST-facing displays is the override; the underlying player choice is also accessible for "what the player thought" framing.

### Persistence

**Given** the player saves the form
**Then** `responses.feed_violence` is saved as `'kiss'` or `'violent'` (or omitted if the toggle is unselected — e.g. Stalking case where the player did not pick).
**And** if the toggle is unselected, save does not write the field.

**Given** the schema validation runs
**Then** `responses.feed_violence` is accepted with values `'kiss'` or `'violent'` (or absent).
**And** `st_review.feed_violence_st_override` is accepted similarly.

---

## Implementation Notes

### Data model

```js
responses.feed_violence:               'kiss' | 'violent' | (absent)
st_review.feed_violence_st_override:   'kiss' | 'violent' | (absent / null)
```

### Pre-selection lookup

```js
// public/js/tabs/downtime-data.js or new feed-violence.js
export const FEED_VIOLENCE_DEFAULTS = {
  seduction:    'kiss',
  stalking:     null,        // explicit unselected
  force:        'violent',
  familiar:     'kiss',
  intimidation: 'violent',
  other:        null,
};

export function inferFeedViolenceFromMethod(methodId) {
  return FEED_VIOLENCE_DEFAULTS[methodId] ?? null;
}
```

The compat shim is the same function: given a legacy `feed_method`, it returns the inferred `feed_violence` (or null for stalking/other/unknown).

### Effective-value helper

```js
export function effectiveFeedViolence(sub) {
  const stOverride = sub?.st_review?.feed_violence_st_override;
  if (stOverride === 'kiss' || stOverride === 'violent') return stOverride;

  const playerChoice = sub?.responses?.feed_violence;
  if (playerChoice === 'kiss' || playerChoice === 'violent') return playerChoice;

  // Compat shim
  return inferFeedViolenceFromMethod(sub?.responses?.feed_method) || null;
}
```

This single helper is the source of truth for "what was this submission's feeding violence". DT Story, player report, and any other display reads it.

### Toggle render

In the feeding section render in `downtime-form.js`, after the method selection and pool builder, before blood types or wherever logically grouped:

```js
const feedViolence = responses.feed_violence
  ?? (feedMethodId ? FEED_VIOLENCE_DEFAULTS[feedMethodId] : null);
const isKiss    = feedViolence === 'kiss';
const isViolent = feedViolence === 'violent';

h += `<div class="dt-feed-violence-toggle">`;
h += `<button type="button" class="dt-feed-vi-btn${isKiss ? ' active' : ''}" data-feed-violence="kiss">The Kiss (subtle)</button>`;
h += `<button type="button" class="dt-feed-vi-btn${isViolent ? ' active' : ''}" data-feed-violence="violent">Violent</button>`;
h += `</div>`;
```

Click handler:

```js
const viBtn = e.target.closest('[data-feed-violence]');
if (viBtn) {
  responses.feed_violence = viBtn.dataset.feedViolence;
  scheduleSave();
  reRenderFeedingSection();
  return;
}
```

Note: pre-selection is **rendered** but not **saved** unless the player clicks. The save happens when the player explicitly chooses (the click handler) or when their existing choice is already persisted. A pure pre-selection (e.g. picking Seduction → toggle shows Kiss highlighted) should not auto-save the field — the player has to engage.

A clean way to enforce this: render with pre-selection visually but treat the saved-state as `responses.feed_violence` only. If the player saves the form without clicking the toggle, no `feed_violence` is written.

If product wants pre-selection to count as the player's choice (i.e. they don't have to click to confirm Seduction → Kiss), revisit at implementation. The memory's strawman implies the pre-selection is **the default** and is treated as the player's value once anything else triggers a save — interpret one way and document at implementation.

### ST override UI

In DT Processing's feeding panel (`renderActionPanel` for feeding source, `downtime-views.js`), add below the existing pool/result display:

```js
const playerChoice = sub.responses?.feed_violence;
const stOverride = sub.st_review?.feed_violence_st_override;
const effective = stOverride || playerChoice || inferFeedViolenceFromMethod(sub.responses?.feed_method);

h += `<div class="proc-feed-violence-block">`;
h += `<div class="proc-feed-violence-row">`;
h += `<span class="proc-mod-label">Player declared</span>`;
h += `<span class="proc-feed-violence-val">${esc(playerChoice || 'Not specified')}</span>`;
h += `</div>`;
h += `<div class="proc-feed-violence-row">`;
h += `<span class="proc-mod-label">ST override</span>`;
h += `<select class="proc-feed-violence-st-override">`;
h += `<option value="">— No override —</option>`;
h += `<option value="kiss"${stOverride === 'kiss' ? ' selected' : ''}>The Kiss (subtle)</option>`;
h += `<option value="violent"${stOverride === 'violent' ? ' selected' : ''}>Violent</option>`;
h += `</select>`;
h += `</div>`;
h += `</div>`;
```

Wire the change handler to PATCH the submission with `st_review.feed_violence_st_override`.

### Schema verification

Open `server/schemas/downtime_submission.schema.js`. If `responses` and `st_review` declare `additionalProperties: true`, no schema change required. If explicit allow-list, add the two fields with `enum: ['kiss', 'violent']`.

### Strawman wording

- Toggle option 1: **"The Kiss (subtle)"** ✓ user-locked per memory
- Toggle option 2: **"Violent"** ✓ user-locked per memory
- ST override label: **"ST override"** with options "— No override —" / "The Kiss (subtle)" / "Violent"
- DT Processing display label for player choice: **"Player declared"**

### British English

Verify all new copy follows British English; no em-dashes.

### No tests required

Form + persistence + display change. Manual smoke tests:
- New submission, pick Seduction: toggle shows Kiss highlighted (pre-selection); save without clicking → field not persisted; click Kiss → field persisted.
- Pick By Force: toggle shows Violent.
- Pick Stalking: toggle unselected, player must click.
- Persisted value survives refresh.
- Legacy submission (with `_feed_method` only): DT Story / DT Processing surfaces the inferred value via the shim.
- ST override: persists separately from player choice.

A server-side test for the schema acceptance and the round-trip of both fields is a useful follow-up. Not blocking.

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` (or new file) — `FEED_VIOLENCE_DEFAULTS`, `inferFeedViolenceFromMethod`, `effectiveFeedViolence` helpers.
- `public/js/tabs/downtime-form.js` — toggle render in feeding section; click handler.
- `public/js/admin/downtime-views.js` — ST override UI in DT Processing feeding panel.
- `public/js/admin/downtime-story.js` — read effective value in DT Story feeding section context.
- `server/schemas/downtime_submission.schema.js` — verify or add field shapes.

---

## Definition of Done

- All AC verified.
- Manual smoke tests for player toggle (all five method pre-selections + Other + no method).
- Player override of pre-selection persists.
- ST override persists separately and renders correctly.
- Compat shim returns correct values for legacy `feed_method` shapes.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtfp-5-kiss-violent-toggle: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- **Compatible with DTFP-4** (templates as UX-only): the toggle reads `feedMethodId` for pre-selection regardless of whether `_feed_method` is persisted; if both stories ship, DTFP-4 ensures the pre-selection logic uses in-memory state for new submissions.
- **Compatible with DTFP-3** (FEED_METHODS data update): pre-selection lookup uses method ids (`familiar`, etc.), which are unchanged.
