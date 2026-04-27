---
id: feat.2
epic: feat
status: ready-for-dev
priority: low
depends_on: []
---

# Story FEAT-2: Non-Vampire Territories in City Tab

As a player or ST viewing the City tab,
I want non-vampire territories (mortal-controlled districts, contested zones, etc.) to appear in the city view alongside vampire-held territories,
So that the full territorial picture of the chronicle is visible rather than only the slice the Court has carved up.

---

## Context

The current City tab renders only territories that the Court treats as feeding/regency surfaces. Non-vampire areas (mortal-controlled, contested, neutral) exist in the chronicle's fiction but not in the data model. This story adds them.

### What already exists

- **Territory schema** at `server/schemas/territory.schema.js` is `additionalProperties: true`, so a new `type` field requires no schema migration — existing territories simply read as untyped (default to `'vampire'`).
- **Player city tab**: `public/js/tabs/city-tab.js` (player-facing render).
- **Admin city view**: `public/js/admin/city-views.js` (ST-facing render with regent / lieutenant / feeding-rights controls).

### What this story adds

- A `type` field on territory documents: `'vampire' | 'mortal' | 'contested'`.
- Visual differentiation in both the player and admin city views: non-vampire territories render distinctly (muted colour, different icon, or grouped section — visual choice strawman below).
- Suppression of regent / lieutenant / feeding-rights controls on non-vampire territories in the admin view (those concepts don't apply).

### Out of scope

- A migration script to backfill existing territories with `type: 'vampire'`. Not needed: the renderer treats absent `type` as `'vampire'` by default. Future writes set the field; old reads default safely.
- Admin UI to *create* a non-vampire territory or *change* a territory's type. v1 is read-only for the type field — set it manually in MongoDB or via a follow-up story.
- Any mechanical effect of the type (e.g. mortal territories being uninvadable). The type is purely visual classification in v1.
- Non-vampire residency tracking. Existing `territory_residency` collection unchanged.

---

## Acceptance Criteria

### Schema

**Given** the territory schema
**Then** the optional field `type` is accepted, with allowed values `'vampire' | 'mortal' | 'contested'`.
**And** the schema continues to accept territories without a `type` field (legacy default).

### Reader default

**Given** a territory document without a `type` field
**When** the city tab renders it
**Then** it renders as if `type === 'vampire'` (no visual change from today).

### Player city tab

**Given** the player loads the City tab
**Then** vampire territories render with the existing visual treatment (regent name, ambience, feeding rights).
**And** non-vampire territories render with a visually distinct treatment that signals "not part of the Court's holdings". Strawman: muted card with a small label badge ("Mortal-controlled" or "Contested").
**And** non-vampire territories do not show regent or feeding-rights data.
**And** the order of cards is preserved or the cards are grouped (Vampire first, then Non-Vampire) — see §Open decision below.

### Admin city view

**Given** the ST loads the admin City view
**Then** vampire territories render with the existing controls (regent dropdown, lieutenant dropdown, feeding-rights chips).
**And** non-vampire territories render without those controls.
**And** the type label is visible to the ST so they can identify what kind of territory it is.

### No regressions

**Given** existing territories without a `type` field
**Then** the City tabs continue to render exactly as they do today (default vampire treatment).

### Manual smoke test

After implementation, manually flip one MongoDB territory document to `type: 'mortal'` and verify:
- Player City tab visually distinguishes it.
- Admin City view hides regent/feeding controls for it.
- Other territories are unaffected.

---

## Implementation Notes

### Schema

In `server/schemas/territory.schema.js`, add:

```js
type: { type: 'string', enum: ['vampire', 'mortal', 'contested'] },
```

inside `properties`. No required-list change.

### Renderer change shape

In each city renderer (`public/js/tabs/city-tab.js` and `public/js/admin/city-views.js`):

1. After loading territories, classify each as vampire / non-vampire via `(t.type || 'vampire') === 'vampire'`.
2. Branch the per-territory render to a non-vampire path when `type !== 'vampire'`.
3. The non-vampire path omits the regent / lieutenant / feeding-rights blocks and adds a type badge.

### Open decision — grouping vs interleaving

Two reasonable approaches:
- **A. Interleave** non-vampire cards in alphabetical order with vampire cards. Tag each visually.
- **B. Group**: render vampire territories first, then a divider, then non-vampire territories.

**Strawman:** Option B (grouped). Reason: STs and players think of territory politics in two distinct frames (Court holdings vs everything else). A grouped view matches that mental model and avoids visual noise from interleaved badges. Confirm with user during implementation.

### CSS

Strawman muted-card treatment: `opacity: 0.85`, replace gold accent with neutral grey. Reuse existing `--surf2` background; swap `--accent` border for `--bdr`. No new tokens needed.

### British English

Type values stay as enum strings (`vampire | mortal | contested`); no British/US concern. Display labels: "Mortal-controlled", "Contested" — both fine.

---

## Files Expected to Change

- `server/schemas/territory.schema.js` — add `type` enum.
- `public/js/tabs/city-tab.js` — non-vampire render branch.
- `public/js/admin/city-views.js` — non-vampire render branch (suppress regent/feeding controls).
- `public/css/<player-app-css>.css` and/or `admin-layout.css` — muted card treatment for non-vampire territories.

---

## Definition of Done

- AC verified.
- Manual smoke test on one mortal territory (flipped via MongoDB) confirms differentiation in both views.
- Existing vampire territories show no regression.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml`: `feat-2-non-vampire-territories: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Independent of every other FEAT / NPCP / CHM / DTSR / DTFP / DTIL / JDT / DTUX story.
- Pairs naturally with future "create non-vampire territory" admin UI if the user wants that later — that's a follow-up story.

---

## References

- `specs/epic-features.md` FEAT-2 entry — original acceptance criteria.
- `server/schemas/territory.schema.js` — current schema (additionalProperties true).
- `public/js/tabs/city-tab.js` — player city renderer.
- `public/js/admin/city-views.js` — admin city renderer.
