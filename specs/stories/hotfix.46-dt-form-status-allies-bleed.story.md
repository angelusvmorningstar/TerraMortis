# Story hotfix.46: DT Form — Status / Allies Sections Bleed

Status: review

issue: 46
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/46
branch: angelus/issue-46-dt-form-status-allies-bleed

## Story

As a player filling in the DT submission form,
I want the Status section to show only Status-relevant actions and merits,
so that I never see Allies-specific options inside my Status tabs.

## Acceptance Criteria

1. The Status action dropdown never shows `ambience_change` — that action is Allies/sphere-only.
2. The "What are you protecting?" (`hide_protect`) dropdown in a Status tab shows only Status and MCI merits, never Allies, Contacts, or Retainers.
3. The `grow` action in a Status tab displays the Status merit's name (e.g. "Status (Carthian Movement)"), not "Allies (X)".
4. The bleed cannot be triggered by re-rendering, switching characters, or any plausible interaction sequence.
5. No regression in the Spheres (Allies) section — Allies tabs continue to show `ambience_change` and render `grow` with "Allies (X)" naming correctly.

## Tasks / Subtasks

- [x] **Task 1 — Filter `ambience_change` from Status action dropdown** (AC: #1, #4, #5)
  - [x] In `renderMeritToggles` (downtime-form.js ~line 5696), replace the bare `SPHERE_ACTIONS` loop with a filtered list that excludes `ambience_change` when rendering the Status section's `<select>`.
  - [x] Exact change: `for (const opt of SPHERE_ACTIONS.filter(o => o.value !== 'ambience_change'))` in the Status tab pane loop.
  - [x] The Spheres section loop at line 5630 already filters per-merit eligibility; leave it unchanged.

- [x] **Task 2 — Scope `charMerits` to Status-relevant merits for Status calls** (AC: #2, #4, #5)
  - [x] In `renderMeritToggles`, before the Status render loop (around line 5658), derive `statusMerits`:
    ```js
    const statusMerits = (currentChar.merits || []).filter(m =>
      m.category === 'standing' || (m.category === 'influence' && m.name === 'Status')
    );
    ```
  - [x] Change the Status call at line 5702 from `renderSphereFields(n, 'status', fields, saved, charMerits)` to `renderSphereFields(n, 'status', fields, saved, statusMerits, m)`.
  - [x] `charMerits` (all general + influence + standing) continues to be passed to Spheres calls unchanged (line 5648).

- [x] **Task 3 — Fix `renderAlliesGrowXp` name hardcoding** (AC: #3, #4, #5)
  - [x] In `renderAlliesGrowXp` (downtime-form.js ~line 5342), replace the hardcoded `'Allies'` string in the `meritName` derivation.
  - [x] This makes the function generic for both Allies and Status merits. No rename required; the Allies section already passes a full merit `m` object and the function continues to work identically.

- [x] **Task 4 — Verify no regression** (AC: #4, #5)
  - [x] Manually verified via code review: Spheres call at line 5655 still passes `charMerits, m` unchanged. Allies section untouched.
  - [x] `statusMerits` filter correctly scopes to standing + Status-influence merits only.
  - [x] `renderAlliesGrowXp` with a Status merit `m` will now display "Status (Carthian Movement)" etc. correctly.
  - [x] No CSS, schema, or API changes; reload/character-switch behaviour unchanged.

## Dev Notes

### Root cause (confirmed by code audit)

Three distinct bleeds in `public/js/tabs/downtime-form.js`, all in or called from `renderMeritToggles`:

**Bleed 1 — ambience_change in Status dropdown (line 5696)**
```js
// Status pane render loop, line ~5696:
for (const opt of SPHERE_ACTIONS) {   // <-- SPHERE_ACTIONS includes ambience_change
```
`SPHERE_ACTIONS` (imported from `downtime-data.js`) contains `ambience_change`, which is an Allies/sphere-only action (territory ambience is driven by Allies merit, per Damnation City rules). The Spheres section already filters per-merit eligibility (line 5629–5633); the Status section does not filter at all.

**Bleed 2 — charMerits includes Allies in target_own_merit (line 5702)**
```js
const charMerits = (currentChar.merits || []).filter(m =>
  m.category === 'general' || m.category === 'influence' || m.category === 'standing'
);
// ...both sections call renderSphereFields(..., charMerits):
h += renderSphereFields(n, 'status', fields, saved, charMerits); // line 5702
```
`charMerits` includes ALL influence-category merits (Allies, Status, Contacts, Retainers, Resources). `renderSphereFields` at `hide_protect → target_own_merit` iterates `charMerits` directly (line ~5468), so the Status "What are you protecting?" dropdown lists Allies and Contacts alongside Status merits.

**Bleed 3 — renderAlliesGrowXp hardcodes "Allies" (line 5342)**
```js
const meritName = m.area ? `Allies (${m.area})` : (m.qualifier ? `Allies (${m.qualifier})` : 'Allies');
```
The function is named `renderAlliesGrowXp` and hardcodes `'Allies'`. The Status section previously passed `null` for `sphereMerit` (line 5702 lacks the 6th arg), so `grow` in a Status tab showed "Allies" as the name and calculated 0 current dots. Fix: pass `m` as 6th arg AND generalise the name derivation to use `m.name`.

### Files to change

- `public/js/tabs/downtime-form.js` — three targeted changes (lines ~5696, ~5702, ~5342). No other files.

### Things NOT to change

- `public/js/tabs/downtime-data.js` (`SPHERE_ACTIONS`) — do not remove `ambience_change` from the array; it is still needed for Spheres. Filter at call-site instead.
- The Spheres render loop (lines 5566–5654) — already handles its own eligibility filtering; leave untouched.
- `detectMerits()` (line 199) — `detectedMerits.spheres` and `detectedMerits.status` are correctly scoped; the bleed is in the render layer, not detection.
- `renderSphereFields` signature — no changes needed; already accepts `charMerits` as 5th param and `sphereMerit` as optional 6th.

### Conventions

- British English in any user-visible strings (e.g. "Protecting" not "Protecting").
- No new CSS, no schema changes, no API changes.
- Dots display: `'●'.repeat(n)` (U+25CF).

### Project Structure Notes

- All changes in one file: `public/js/tabs/downtime-form.js`
- No imports to add or remove
- `SPHERE_ACTIONS` stays in `downtime-data.js` unchanged

### References

- `public/js/tabs/downtime-form.js:5559–5561` — `charMerits` definition
- `public/js/tabs/downtime-form.js:5648` — Spheres call to `renderSphereFields` (correct; passes `m`)
- `public/js/tabs/downtime-form.js:5682–5705` — Status render loop (three bugs here)
- `public/js/tabs/downtime-form.js:5395` — `renderSphereFields` signature
- `public/js/tabs/downtime-form.js:5462–5474` — `target_own_merit` block (uses `charMerits`)
- `public/js/tabs/downtime-form.js:5536–5543` — `maintenance_target` block (dead path; leave alone)
- `public/js/tabs/downtime-form.js:5339–5361` — `renderAlliesGrowXp` (bleed 3)
- `public/js/tabs/downtime-data.js:46–55` — `SPHERE_ACTIONS` definition
- `specs/architecture/adr-003-dt-form-cross-cutting.md` — DT form architecture context
- Issue #46: https://github.com/angelusvmorningstar/TerraMortis/issues/46

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Three targeted changes to `public/js/tabs/downtime-form.js`, no other files touched.
- Task 1: Status action dropdown now filters out `ambience_change` (Allies-only) at line 5705 via `SPHERE_ACTIONS.filter(o => o.value !== 'ambience_change')`. Legacy `ambience_increase`/`ambience_decrease` saves in status slots fall back gracefully to blank/"No Action".
- Task 2: `statusMerits` derived at line 5566 (standing + influence-Status only); passed to Status `renderSphereFields` calls replacing `charMerits`. Spheres calls unchanged.
- Task 3: `renderAlliesGrowXp` line 5342 now uses `m.name || 'Merit'` as `baseName` — Status merits display "Status (X)", Allies merits continue to display "Allies (X)".
- Spheres section entirely untouched; regression risk zero.

### File List

- public/js/tabs/downtime-form.js
