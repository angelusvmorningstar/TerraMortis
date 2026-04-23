# Story EPC.1: Enhanced Game App Dice Roller — Custom Pool Builder + Smart Modifiers

Status: done

## Story

**As an** ST running a live game on a tablet,
**I want** to build any dice pool from attribute + skill + discipline with auto-populated modifiers,
**so that** I can roll any check without looking up stats manually.

## Background

The suite app (`index.html`) has a basic dice roller at `public/js/suite/roll.js`. The admin app has a full-featured dice roller at `public/js/admin/dice-engine.js` with character selection, attribute+skill+discipline pool building, and modifier support (9-Again, Rote, specialisations).

The game app is `index.html`. The dice-engine.js already has the full feature set we need — it needs to be wired into the suite context.

`public/js/game/char-pools.js` exports `renderCharPools()` which renders tappable pool buttons with 9-again and Rote badges pre-populated from character data. This is the "smart modifier" feature.

## Acceptance Criteria

1. In the suite app dice tab, the ST can select a character, then select an attribute + skill + discipline to build a custom pool.
2. When a skill is selected, 9-Again, Rote eligibility, and available specialisations are auto-populated from the character's data.
3. The ST can tick modifiers (9-Again, Rote, spec bonus) before rolling.
4. Alternatively, the ST can tap a pre-built pool from `renderCharPools()` to auto-fill the roller with that pool's values.
5. Roll button remains full-width, min 48px height on mobile (EPB.3 already handles this via `.de-roll-btn`).
6. Roll results display dice faces with successes counted — same pattern as existing roller.

## Tasks / Subtasks

- [ ] Check what the suite roll tab currently renders in `index.html` and `suite/roll.js`
- [ ] Wire `dice-engine.js` into index.html: add import to `app.js` and expose `initDiceEngine(el, chars)` function
- [ ] In `dice-engine.js`, extract `initDiceEngine(containerEl, allChars)` as the public init function
- [ ] When a character is selected in the dice roller, call `renderCharPools(poolsEl, char, onTap)` to show tappable pre-built pools
- [ ] Tapping a pool chip auto-fills the attribute/skill/discipline selectors and sets the correct modifiers
- [ ] Verify on tablet viewport: all controls accessible, roll button full-width

## Dev Notes

- `public/js/admin/dice-engine.js` — full dice engine, already has all logic. Expose as `initDiceEngine(el, chars)`.
- `public/js/game/char-pools.js` — `renderCharPools(el, char, onTap)` already renders tappable pools with 9-again/Rote badges.
- `public/js/app.js` — suite app entry point; init the dice engine from here when the dice tab activates.
- `index.html` — find the dice tab section and confirm its container ID.
- `public/css/admin-layout.css` — `.de-roll-btn` already has mobile fix from EPB.3.
- Do NOT duplicate dice logic — import and reuse `dice-engine.js`.

### References
- [Source: specs/architecture/system-map.md#Section 10] — Dice roller implementations
- [Source: public/js/admin/dice-engine.js]
- [Source: public/js/game/char-pools.js]

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
