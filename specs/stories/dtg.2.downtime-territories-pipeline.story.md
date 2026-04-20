---
id: dtg.2
epic: downtime-game-app
group: A
status: complete
priority: high
---

# Story dtg.2: Downtime Form — Wire Territories Through to Game App

As an ST or regent player using the game app,
I want the downtime form to correctly detect my regent status and show the Regency section,
So that regents can complete their full downtime submission from the game app without being silently missing a section.

## Background

`renderDowntimeTab(targetEl, char, territories)` in `downtime-form.js` accepts a `territories` argument used for:

1. Regent detection — `findRegentTerritory(territories, char)` gates the entire Regency section
2. Regent cap — `getRegentCap()` uses territory ambience to set the feeding cap
3. Regent confirmations — filters unconfirmed territories from the regency dropdown
4. Feeding grid indicators — `residencyByTerritory` cross-references territory residents

In the game app, the call chain is:

```
app.js goTab('downtime')
  → initDowntimeTab(el, char)          ← downtime-tab.js, no territories arg
    → renderDowntimeTab(el, char)       ← downtime-form.js, territories = []
```

Territories are already loaded in `suiteState.territories` by `loadAllData()` in `app.js` before any tab renders. They are simply never passed down the chain.

The result: `gateValues.is_regent` is always `'no'` in the game app. Regents never see their Regency section. The feeding cap is unconstrained. ST users reviewing any character's form see an incomplete picture.

## Acceptance Criteria

### Regent Section Visibility

**Given** a character who is regent of a territory (their `_id` matches a territory's `regent_id`)
**When** they open the Downtime tab in the game app
**Then** the Regency section is visible in the form (not gated out)

**Given** a character who is not a regent
**When** they open the Downtime tab in the game app
**Then** the Regency section is absent — behaviour unchanged

### Regent Cap

**Given** a regent character whose territory has an ambience value
**When** the feeding cap is calculated
**Then** `getRegentCap()` returns the correct cap based on territory ambience, not an unconstrained default

### ST Dev Login

**Given** an ST logged in via dev login (no specific character, or ST Admin user)
**When** they view the Downtime tab
**Then** the form loads without error whether or not the character is a regent — no crash from missing territories

### Data Flow

**Given** `loadAllData()` has completed in `app.js`
**When** the Downtime tab is opened
**Then** `suiteState.territories` is passed through the full call chain to `renderDowntimeTab`

## Implementation Notes

- `app.js` `goTab('downtime')`: pass `suiteState.territories` to `initDowntimeTab(el, char, territories)`
- `downtime-tab.js` `initDowntimeTab(el, char, territories)`: accept and pass `territories` to `renderDowntimeTab(currentZone, char, territories)`
- `downtime-form.js` `renderDowntimeTab` already accepts `territories` as third arg — no change needed there
- The dev-bypass stub cycle (`_id: 'dev-stub'`) already in place from nav.7 follow-up work — territories fix must not break that path

## Files

- `public/js/app.js` — pass `suiteState.territories` to `initDowntimeTab`
- `public/js/player/downtime-tab.js` — accept and forward `territories` argument
- `public/js/player/downtime-form.js` — no changes needed (already accepts territories)

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
2026-04-20. Three-line change: app.js passes suiteState.territories to initDowntimeTab; downtime-tab.js accepts territories param with default []; downtime-tab.js forwards territories to renderDowntimeTab. renderDowntimeTab already accepted territories as third arg — no change needed there. Regent detection (gateValues.is_regent) now resolves correctly in game app context.
### File List
- public/js/app.js
- public/js/player/downtime-tab.js
