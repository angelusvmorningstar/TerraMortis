# Story Feature.608: Contested roll — styled Opposing Char picker + resistance-trait pool builder

## Status: review

> **Implemented 2026-06-05.** Opposing Char → shared `_renderCharTypeahead` (single-mode saves a scalar `contested_char`, confirmed at `:5831` — no reconciliation needed). Resistance Pool → bespoke trait builder: Resolve/Stamina/Composure chips + Blood Potency toggle, computed from the opposing char via `_computeContestedPoolLabel` → `contested_pool_label` ending "= N" (roll parser untouched). New `.proc-contested-trait`/`-bp` classes added to the existing rote-chip CSS (no new tokens). New spec `tests/fix-608-contested-roll-pool-builder.spec.js` — 2/2 pass. ESM parse-check green. Regression in parallel.

## Metadata
- issue: 608
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/608
- branch: morningstar-issue-608-contested-roll-pool-builder
- type: feature
- introduced-by: #595 (the roll-mode work that added the contested widget)

---

## Story

**As** an ST resolving a contested action,
**I want** the Opposing Char picker styled like the rest of the view and the Resistance Pool built from the opposing character's resistance traits,
**so that** I am not fighting a raw OS dropdown or typing dice pools by hand.

---

## Decisions (Angelus, 2026-06-05)
- **Opposing Char picker** → reuse the **typeahead chip** picker (`_renderCharTypeahead`, single-mode), same as the #586 target / Connected Characters.
- **Resistance Pool** → **build from the appropriate resistance trait(s): Resolve / Stamina / Composure, plus optional Blood Potency**, computed from the opposing character's effective stats (dice-app style, but scoped to resistance traits). Not a full attr/skill/disc builder.
- **Implementation** → **bespoke** resistance-trait widget (do NOT refactor the inline `.proc-pool-builder`; it carries skill/disc that resistance pools don't need).

---

## Background & audit

The contested widget is in the DT processing roll card (`downtime-views.js:7990-8019`):
- Opposing Char = bare `<select class="proc-contested-char-sel">` (`:7998`, value = `sortName(c)`) → unstyled.
- Resistance Pool = free-text `<input class="proc-contested-pool-input">` (`:8009`, saves `contested_pool_label`).
- Roll Defence (`:8013`) parses `contested_pool_label` with `/=\s*(\d+)\s*$/` (`:6290`) to get the dice count.

Handlers at `:6243-6296`: toggle → `{contested}`; char-sel → `{contested_char}`; pool-input → `{contested_pool_label}`; roll-btn → `{contested_roll}`.

Dice-app reference (`public/js/game/contested-roll.js`): defender pool derived from the character, e.g. `resistance.defPool = c => aval(c,'Stamina')+aval(c,'Resolve')`, `social.defPool = c => aval(c,'Composure')+(c.blood_potency||0)`, where `aval = getAttrEffective(c,a)+getAttrBonus(c,a)`.

---

## Acceptance Criteria

- [x] **AC1 (styled char picker)** — `_renderCharTypeahead(... saveField:'contested_char', single:true)`; no raw `<select>` (test asserts `.proc-contested-char-sel` count 0). Single-mode saves the scalar sortName.
- [x] **AC2 (resistance-trait builder)** — Resolve/Stamina/Composure chips (`.proc-contested-trait`) + "+ Blood Potency" (`.proc-contested-bp`), computed from the opposing char via `getAttrVal` + `blood_potency`.
- [x] **AC3 (computed total + roll compat)** — `_computeContestedPoolLabel` → "Resolve 3 + Blood Potency 2 = 5" stored as `contested_pool_label`; roll parser (`:6290`) unchanged. _(Test asserts "= 5".)_
- [x] **AC4 (persistence)** — `contested_resist_traits` + `contested_resist_bp` stored; label derived from them + the opposing char; re-render reflects active chips + total.
- [x] **AC5 (gating)** — no opposing char → "Select an opposing character first", no chips/roll (test); changing the char recomputes the label (typeahead `contested_char` side-effect in `saveTypeahead`).
- [x] **AC6 (no regression)** — Contested-off clear extended to reset `contested_resist_traits`/`contested_resist_bp`; Roll Defence + non-contested rolls unaffected (regression suite).
- [x] **AC7 (test)** — `tests/fix-608-contested-roll-pool-builder.spec.js`, 2 tests pass.

---

## Tasks

### Task 1 — Opposing Char typeahead (AC1, AC5, AC6) — [x] DONE
Replace the `<select class="proc-contested-char-sel">` block (`:7997-8006`) with `_renderCharTypeahead(key, (rev.contested_char ? [rev.contested_char] : []), <other chars>, { label: 'Opposing Char', saveField: 'contested_char', single: true })`. Reconcile the save shape: `_renderCharTypeahead`'s save handler (`:5746`) may write an array — ensure `contested_char` ends up the single `sortName` string the rest of the contested code + the opposing-char lookup expect (read `[0]` if it saves an array, or confirm single-mode saves a scalar). Remove the old `.proc-contested-char-sel` change handler (`:6260-6268`) if the typeahead handler supersedes it.

### Task 2 — Resistance-trait pool builder (AC2, AC3, AC4, AC5) — [x] DONE
Replace the `.proc-contested-pool-input` block (`:8007-8010`) with a bespoke builder:
- Resolve the opposing char object from `rev.contested_char` (sortName → `characters.find`). If none, render a hint ("Select an opposing character first") and stop.
- Render three toggle chips (Resolve / Stamina / Composure) reflecting `rev.contested_resist_traits`, and a "+ Blood Potency" toggle reflecting `rev.contested_resist_bp`.
- Compute the total from the opposing char: `Σ getAttrEffective(oppChar, trait) (+ getAttrBonus if used by the project's accessor convention)` for selected traits, `+ (blood_potency||0)` if BP on. Build the label "Trait N + ... + Blood Potency M = TOTAL".
- Show the computed expression read-only (the chips ARE the edit affordance).

### Task 3 — Handlers (AC3, AC4, AC5) — [x] DONE
Add delegated handlers for the resistance-trait chips and BP toggle: on toggle, update `contested_resist_traits` / `contested_resist_bp`, recompute the label from the opposing char, `saveEntryReview({ contested_resist_traits, contested_resist_bp, contested_pool_label })`, re-render. Keep the Roll Defence handler (`:6282-6296`) as-is (it reads `contested_pool_label`). When the opposing char changes (Task 1), recompute `contested_pool_label` from the existing trait selection + the new char.

### Task 4 — Test (AC7) — [x] DONE
Playwright spec: mark an action contested, select an opposing char (with known Resolve + BP), toggle Resolve + BP → assert the contested pool expression shows "Resolve <n> + Blood Potency <bp> = <n+bp>" and the Roll Defence button is present. Cover: no opposing char → builder disabled/hint; changing char recomputes.

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js:7990-8019` — contested render (char select, pool input, roll button).
- `public/js/admin/downtime-views.js:6243-6296` — contested handlers.
- `public/js/admin/downtime-views.js:6290` — Roll Defence dice-count parser (`/=\s*(\d+)\s*$/`) — keep compatible.
- `public/js/admin/downtime-views.js` `_renderCharTypeahead` (~`:7140`) + its save handler (~`:5746`) — the styled picker to reuse.
- `public/js/game/contested-roll.js` — dice-app resistance derivation (the model: trait(s) + BP from the character).
- Attribute accessors: `getAttrEffective` / `getAttrBonus` (`public/js/data/accessors.js`) — confirm they are imported in `downtime-views.js`; add the import if missing.

### Must preserve / watch-outs
- **Roll-compat:** `contested_pool_label` MUST end in `= N` (the roller parses it). Build the label accordingly.
- **Typeahead save shape:** verify single-mode writes a scalar vs array; the opposing-char lookup + `contested` clear logic expect a `sortName` string.
- **Resistance traits are ATTRIBUTES** (Resolve/Stamina/Composure), computed from the OPPOSING char, not the acting char. Use the opposing char object throughout the builder.
- **BP** = `oppChar.blood_potency` (label it "Blood Potency", British English; no em-dashes).
- Resistance pools can combine two traits (e.g. Resolve + Composure) — chips are multi-select.
- Toggling Contested off must still clear the new fields too (extend `:6251` to also reset `contested_resist_traits`/`contested_resist_bp`).
- Bespoke widget — do NOT refactor the inline `.proc-pool-builder` (skill/disc are irrelevant to resistance).

### References
- [Source: downtime-views.js:7990-8019, 6243-6296] — contested widget + handlers
- [Source: contested-roll.js:20-37] — dice-app trait-derived defender pool
- #595 (introduced the contested widget), #586 (`_renderCharTypeahead` styled picker pattern)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- ESM parse-check `downtime-views.js` — PASS.
- `fix-608-contested-roll-pool-builder.spec.js` — 2 passed.
- Regression (roll card + typeahead + pool specs) — _result in Change Log._

### Completion Notes List

- **Opposing Char:** replaced the bare `<select>` with `_renderCharTypeahead(..., saveField:'contested_char', single:true)`. Confirmed single-mode saves a scalar (`chips[0]||null`, `:5831`) so `contested_char` stays a sortName string — no read changes needed. Removed the old `.proc-contested-char-sel` change handler.
- **Resistance Pool:** bespoke trait builder — `CONTESTED_RESIST_TRAITS = ['Resolve','Stamina','Composure']` chips + a Blood Potency toggle, computed from the opposing char (`getAttrVal` + `blood_potency`) via `_computeContestedPoolLabel`, which builds "Trait N + ... + Blood Potency M = TOTAL" (ends "= N", so the Roll Defence parser at `:6290` is untouched). Replaced the old `.proc-contested-pool-input` handler with `.proc-contested-trait`/`.proc-contested-bp` toggle handlers.
- **Opposing-char change:** added a `contested_char` side-effect in `saveTypeahead` — recomputes `contested_pool_label` from the existing traits against the new char + re-renders.
- **State:** `contested_resist_traits` (array) + `contested_resist_bp` (bool) added to the review + the `contestedData` assembly + the contested-off clear.
- **CSS:** new `.proc-contested-trait`/`.proc-contested-bp` classes added to the existing `.proc-rote-chip` rule groups (base/hover/is-active/`:active` press) + a `.proc-contested-resist` flex row. No new tokens. Distinct behavior class avoids the rote-chip click handler firing.

### File List

- `public/js/admin/downtime-views.js` (modified — `_computeContestedPoolLabel` + `CONTESTED_RESIST_TRAITS`; contested render swap; trait/BP handlers; typeahead `contested_char` side-effect; `contestedData` + clear)
- `public/css/admin-layout.css` (modified — `.proc-contested-trait`/`-bp` styling + `.proc-contested-resist`)
- `tests/fix-608-contested-roll-pool-builder.spec.js` (new — 2 Playwright tests)
- `specs/stories/feature.608.contested-roll-pool-builder.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Contested roll: Opposing Char now a styled typeahead chip; Resistance Pool now built from the opposing character's resistance traits (Resolve/Stamina/Composure) + optional Blood Potency, computed from their stats and producing a roll-compatible "= N" label. New spec, 3 tests passing (full flow, gating, two-trait sum). Regression: roll card + typeahead + pool specs = 36 passed / 0 failed. Status → review.
