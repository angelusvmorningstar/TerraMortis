---
id: dtfp.4
epic: dtfp
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTFP-4: Treat feeding-method templates as UX-only quick-pick scaffolding

As a player filling out the feeding section,
I should see the pool builder always visible (not gated on method selection), and the feeding-method cards should act as a quick-pick that populates the suggestion chips without persisting the chosen method on my submission,
So that what gets saved is what I actually built (attr + skill + disc + spec), not a vestigial "I chose Stalking" label that adds nothing once my pool is committed — and I can refine my pool freely without feeling I have to "stay within" a method I picked at the top.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 2 (Player Form Polish):

> **DTF2.4** — Templates as UX-only quick-pick. **`feed_method` no longer stored** on new submissions — templates are pure scaffolding for the pool builder. Pool builder always visible. Legacy DT1/DT2 `feed_method` retained as back-compat read.

Today's flow at `public/js/tabs/downtime-form.js`:
- Method cards render at line 4029 from `FEED_METHODS`.
- Selecting a card sets `feedMethodId` (in-memory) AND writes `responses['_feed_method']` (persisted, line 265).
- The pool builder is **gated** on `feedMethodId` (line 4039: `if (feedMethodId) renderFeedPoolSelector(...)`).
- Required-field validation expects `_feed_method` to be set (line 658: `if (!responses['_feed_method']) missing.push('Feeding Method')`).

DTFP-4 reframes feeding methods as **scaffolding**:
- Method cards still render as quick-picks. Clicking one **populates the suggestion chips** with that method's attrs/skills/discs.
- The pool builder renders **always**, with or without a method selected. Empty chips are fine.
- `_feed_method` is **no longer written** on new submissions. The persisted state is just the pool components: chosen attr, skill, disc, spec.
- Validation no longer requires `_feed_method`. It does require pool components (already enforced by the existing pool-validation logic).
- Legacy reads: a submission saved before DTFP-4 with `_feed_method: 'familiar'` still loads correctly, the corresponding method card is highlighted, and the chips populate as a one-time UX hint. The legacy field is **read** but not **written** by the new save path.

The intent is to remove a stored field whose only purpose was to drive UI state, freeing future tooling (DT Story prompts, DT Processing displays) from having to defer to a label the player no longer sees as canonical.

### Files in scope

- `public/js/tabs/downtime-form.js`:
  - Line 265 `responses['_feed_method'] = feedMethodId;` — remove this write.
  - Line 658 validation gate — remove the `_feed_method` requirement.
  - Line 4039 (and 4060) `if (feedMethodId)` gates — remove so the pool builder renders unconditionally.
  - Line 892 — keep the read of `_feed_method` from legacy responses (initial load only); when the user picks a different method post-load, the in-memory state changes but no new write happens.
  - Method card render at line 4029-4036 — keep; still emits clickable cards.
  - Click handler at line 1664 (`feedMethodId = feedCard.dataset.feedMethod`) — keep the in-memory update so the pool builder re-renders with the new chip set.

- `public/js/admin/downtime-views.js` and `public/js/admin/downtime-story.js` — verify any reads of `responses._feed_method` still treat it as optional. Most likely already do; audit at implementation.

### Out of scope

- Removing `FEED_METHODS` data — the array is still used to drive the quick-pick cards and chips.
- Removing the method cards from the UI — players still see them as quick-picks.
- Migrating historical submissions to drop `_feed_method` — the field stays in the database; we just stop writing it. A future cleanup pass can drop the field if it ever becomes load-bearing for storage cost (vanishingly small at our scale).
- Auto-suggesting a "best fit" method based on the chosen pool components. Out of scope; players can pick the template that fits their fiction.
- Showing all methods' chips simultaneously when no method is picked. The "always visible" rule means the pool-builder framework renders, but suggestion chips render only when the player has picked a method. Without a selection, the player sees the freehand attr/skill/disc dropdowns and can compose their pool manually.
- DT Processing UI changes that derive from `_feed_method`. If any panel relied on it, they should already be tolerant of its absence (older `responses` shapes); verify and adjust if needed.

---

## Acceptance Criteria

### Save behaviour

**Given** I am a player filling out the feeding section
**When** I pick a method card and build a pool
**Then** the saved submission's `responses` object **does not contain** `_feed_method`.
**And** the saved submission contains the pool components (`_feed_blood_types`, `_rote_*` if rote, plus whatever the pool builder writes for attr/skill/disc/spec selections).

**Given** I save a draft, refresh the page, and reload the draft
**Then** the pool builder shows my saved pool components correctly.
**And** the method card I clicked at draft time is **not** highlighted (the choice was UX-only, not persisted).

**Given** I am loading a submission saved before DTFP-4 that has `responses._feed_method: 'familiar'`
**Then** on initial render, the Deception (formerly Familiar Face) method card is highlighted, and the suggestion chips populate as a UX hint.
**And** the player's actual pool selections render correctly.
**And** if the player saves the draft again post-DTFP-4, the new save **does not write** `_feed_method` — the legacy field stays on the document until the next overwrite-by-omission moment, but no fresh write reinforces it. (If the API uses dot-path patches, the legacy field may persist; that's fine — it's read-only from now on.)

### Always-visible pool builder

**Given** I am viewing the feeding section with no method picked
**Then** the pool builder framework still renders: dropdowns for Attribute, Skill, Discipline are visible.
**And** no suggestion chips appear (since none have been requested via a method pick).

**Given** I pick a method card
**Then** the suggestion chips appear immediately.
**And** the dropdowns continue to be available alongside the chips for freehand selection.

**Given** I switch from one method to another
**Then** the suggestion chips swap to the new method's chip set.
**And** my previously-selected pool components (in the dropdowns) are **preserved** — switching methods does not clear my pool, only the suggestion chips.

### Validation

**Given** I attempt to submit without choosing a method but with a fully-built pool
**Then** the submission **succeeds**.
**And** the missing-fields list does **not** include "Feeding Method".

**Given** I attempt to submit without a complete pool (attr/skill/disc all blank)
**Then** the submission's existing pool-validation logic still flags missing pool components (unchanged behaviour).

### Method card state

**Given** the method cards are visible
**Then** at most one card is highlighted at any time (the one most recently clicked in the current session, or the legacy `_feed_method` value on initial load).
**And** there is a **Clear** affordance (or simply clicking the same card again unselects it) so the player can deliberately have no method selected.

### DT Processing / DT Story compatibility

**Given** a submission saved post-DTFP-4 (no `_feed_method` stored)
**When** the ST opens DT Processing or DT Story for it
**Then** the existing panels render without errors (any code that reads `_feed_method` falls back gracefully to its existing default for missing values).

**Given** a submission saved pre-DTFP-4 (with `_feed_method` stored)
**When** the same panels render
**Then** they continue to surface the legacy method as today (no regression on historical data).

---

## Implementation Notes

### Remove the write

At `public/js/tabs/downtime-form.js:265`, remove the line:

```js
responses['_feed_method'] = feedMethodId;
```

If there are other writes of `_feed_method` (audit at implementation), remove those too. Keep the in-memory `feedMethodId` variable; it's still useful for driving the suggestion chips during the session.

### Remove the validation requirement

At line 658, remove:

```js
if (!responses['_feed_method']) missing.push('Feeding Method');
```

Verify that the existing pool-validation logic catches the case where the player has not chosen any pool components — that should remain the actual gate for "did the player tell us how they're feeding".

### Always render pool builder

At lines 4039 and 4060 (and any other gated render), remove the `if (feedMethodId)` check around `renderFeedPoolSelector`. The helper renders empty/placeholder content when `feedMethodId` is empty. Verify `renderFeedPoolSelector` handles the empty-method case gracefully:

```js
function renderFeedPoolSelector(c, feedMethodId /* may be '' */, ...) {
  const m = FEED_METHODS.find(x => x.id === feedMethodId); // may be undefined
  // ...
  if (m && (m.attrs.length || m.skills.length || m.discs.length)) {
    // render suggestion chips
  }
  // dropdowns always render
}
```

If the helper currently assumes `m` is defined, gate the chip render block on `m` truthiness.

### Initial-load read

At line 892, keep:

```js
feedMethodId = responseDoc.responses['_feed_method'] || '';
```

This is the legacy back-compat read. On initial load, if the legacy field is present, the method card is highlighted and chips populate. The player can keep or change the selection; either way, the next save does not re-persist the field.

### Method card click handler

At line 1664, the handler updates `feedMethodId` and triggers a re-render. Keep this. The change is: do **not** call `scheduleSave()` for this update specifically (or, the next save just doesn't include `_feed_method` because the write at line 265 was removed). Verify the existing save flow is what handles persistence, and the change at line 265 covers this.

### Optional: Clear-method affordance

If product wants an explicit "Clear method" affordance, add a small `× Clear` button next to or below the method cards that resets `feedMethodId = ''` and re-renders. Otherwise, clicking the currently-selected card again could toggle off (cleaner UX). Pick one at implementation.

### Audit DT Processing and DT Story consumers

Grep `_feed_method` across `public/js/admin/`. Any read sites should:
- Treat the field as optional (`responses._feed_method || ''` or similar).
- Not error if the field is missing.

If any code path strictly required the field, fix it as part of this story (it was already wrong for cycles where the player skipped feeding).

### No tests required

Persistence + render change. Manual smoke test:
- New submission: pick method, build pool, save, refresh → pool persists, method card NOT highlighted, no `_feed_method` in the saved doc.
- Legacy submission: opens with method highlighted, chips populated.
- Submit without method picked: succeeds.
- DT Processing / DT Story render unchanged for both old and new submissions.

A server-side test asserting that a submission can be saved without `_feed_method` would be a useful follow-up. Not blocking.

### British English

No new copy in this story; existing copy stays. Verify any nearby text remains British.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — remove the `_feed_method` write at line 265; remove the validation gate at line 658; remove `if (feedMethodId)` gates on pool-builder render at lines 4039 and 4060; verify `renderFeedPoolSelector` handles empty method.
- `public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js` — audit for `_feed_method` reads; ensure they treat the field as optional.

No schema changes (`_feed_method` simply stops being written; existing field on legacy docs remains untouched).

---

## Definition of Done

- All AC verified.
- Manual smoke tests for new and legacy submissions.
- DT Processing and DT Story render correctly for both shapes.
- No regression on the rote / blood-type / pool-builder flows.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtfp-4-templates-as-ux-only: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other story.
- Compatible with DTFP-3 (FEED_METHODS data update): the new chip sets show through the unchanged scaffolding behaviour.
- Compatible with DTFP-5 (Kiss/Violent toggle): unrelated. The toggle's pre-selection logic that currently reads `feed_method` should be updated to fall back to the in-memory `feedMethodId` if it's currently the source of truth (verify at DTFP-5 implementation).
