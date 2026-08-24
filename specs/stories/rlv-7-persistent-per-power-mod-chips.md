# Story rlv.7: Persistent per-power modifier chips

Status: done

## Story

As a player rolling dice in the Suite app's Roll tab,
I want to add a free-text label + numeric modifier to whatever power/pool I currently have loaded,
have it appear as a toggleable chip, and have the app remember it (including its on/off state) the
next time I load that same power for that same character,
so that a recurring situational bonus (the issue's own example: "Air of Menace +2" on a Nightmare
roll) doesn't have to be re-typed into the plain +/- Mod stepper every single time I roll that power.

## Acceptance Criteria

1. The Roll tab's pool-breakdown disclosure (`<details class="rv2-breakdown">`, `#effline` inside
   it — `public/index.html:250-255`) gains a small "add mod" row: a free-text label input (max 40
   chars) and a numeric value input, plus an "+ Mod" button. Hidden/inert when no character or no
   pool is loaded (matches the existing `Select a character first` guard pattern used by `openPanel`'s
   `disc`/`common`/`custom` branches, `public/js/app.js:911-912`, `1009-1010`, `1037-1038`).
2. Submitting the add-mod row with a non-empty label and a non-zero value creates a new chip, added
   in the **on** state immediately (no separate confirm step — matches `togSpec`'s own immediate-apply
   behaviour, `public/js/suite/roll-v2.js:413-427`).
3. Each chip renders inside `#effline` reusing the existing `.effpool-specs`/`.effpool-spec` classes
   (`public/css/suite.css:138-143` — the same badge family `togSpec`/`togEquipChip` already use for
   specialty and equipment bonuses), showing its label and signed value (e.g. `Air of Menace +2`),
   plus a small "×" remove affordance.
4. Clicking a chip (not its "×") toggles it on/off — its `value` is added to or removed from
   `state.MOD`, and `effPool()`/`updPool()` update live, exactly like the existing `togSpec`/
   `togEquipChip` toggle behaviour.
5. Clicking a chip's "×" permanently removes it (distinct from toggling off) — it no longer appears
   for this power at all, on this or any future load.
6. Chips are persisted per **(character id, power/pool label)** — the same `name` string already
   passed as `loadPool(total, name, pi)`'s second argument by every call site (`app.js:1149`
   skill/discipline pool tiles, `app.js:1092` Custom Pool, `app.js:953,980` discipline/devotion/rite
   panel items, `app.js:1026` Common Actions) — in `localStorage`, surviving a page reload or
   navigating away and back.
7. Loading a pool (`loadPool()`) for a power that has previously-added chips restores them with
   their **last-known on/off state** (a chip left off stays off; a chip left on is pre-toggled on
   again) — this is #1039's own worked example: "Air of Menace +2 pre-toggled next time you roll
   Nightmare."
8. Loading a **different** power, or the same power for a **different character**, shows that
   power/character's own chips only — never another power's or another character's chips (the
   persistence key is a composite of both, mirroring `tabs/draft-persist.js`'s existing
   `key(charId, cycleId)` composite-key pattern, `public/js/tabs/draft-persist.js:20-22`).
9. A chip's value is clamped to **-10..+10** on entry (`clampChipValue()`) — the same bound
   `chgMod()` already enforces on the plain Mod stepper (`public/js/suite/roll-v2.js:222-225`). This
   is the pool-cap interpretation this story implements; see "Open question for Angelus" below —
   the issue's own AC just says "pool caps enforced" without defining the cap, and this reuses the
   app's own existing sanction bound rather than inventing a new one.
10. New chips never apply to a different pool's roll — `loadPool()` resets `state.MOD` to 0 before
    re-applying only the loaded power's own on-chips' values (same reset-then-rebuild pattern already
    used for `state.specBonuses`/`state.activeEquipBonus`, `roll-v2.js:184-186`).
11. All new markup/CSS uses existing design tokens and component classes only — `.effpool-spec`,
    `.form-input`, `.mchip` families — no bare hex, no inline `style="..."` (project-context.md §1,
    issue #1039's own last AC line).
12. The persistence module's pure functions (`clampChipValue`, `addChip`, `toggleChip`, `removeChip`,
    `loadChips`) are unit-testable without a browser, matching `spendableCost`/`canAffordCost`'s
    existing "exported for testability" pattern (`roll-v2.js:81-99`).

## What this story is NOT

- **NOT rlv.8** (status-difference auto-mods for social manoeuvring) — a separate, still-backlog
  story. Nothing here computes or suggests a chip's value from city/covenant status; the player types
  a free-text label and a number, full stop.
- **NOT a fix for the pre-existing gap where `togSpec`/`togEquipChip` bypass `chgMod()`'s -10..+10
  clamp entirely** (they write straight to `state.MOD` uncapped, `roll-v2.js:420-424,438-444`). This
  story's own new chips ARE clamped (AC9) because the issue explicitly asks for "pool caps enforced"
  on this specific new surface — but retrofitting the clamp onto the two pre-existing, unrelated chip
  types is out of scope; flag it, don't silently fix it here.
- **NOT cross-device/cross-browser sync.** Chips are `localStorage`-backed, same as the app's existing
  `tm_pools_collapsed` collapse-state precedent (`char-pools.js:171,199`) — a player switching devices
  starts with no remembered chips on the new device. This is an accepted limitation matching existing
  app precedent, not a defect to design around.
- **NOT a change to `openPanel()`'s architecture.** The add-mod row is static inline markup inside the
  existing breakdown `<details>`, not a new `openPanel(mode)` branch — deliberate, so adding a chip
  mid-roll stays a single in-context action rather than a full-screen panel navigation. (`openPanel`'s
  existing `custom`/`disc`/`common` branches rebuild `#panel-body` wholesale on every render, which
  would fight a live text input's own value/focus — the same reason `updPool()`'s own `#effline`
  rewrite must NOT contain the input fields themselves; see Dev Notes.)
- **NOT deriving chips automatically from character sheet state** (e.g. auto-adding "Air of Menace"
  itself as a chip). That specific example is already a real, automatic, non-optional bonus via
  `char-pools.js`'s existing `meritBonus`/`meritLabel` mechanism (`char-pools.js:122-127`) — the issue
  text only borrows its name for a worked example of what a *manually curated* chip could represent.
  This story does not read merits, disciplines, or any character field to suggest or pre-populate a
  chip; the player always types the label and value themselves.
- **NOT expanding automated test coverage of the pre-existing `togSpec`/`chgMod`/`togEquipChip`
  functions.** They have no dedicated unit tests today (same as `spendableCost` before gdx.7 added
  its own); this story only requires unit tests for the code it adds (AC12), matching that existing
  scope boundary rather than retroactively covering unrelated pre-existing functions.

## Tasks / Subtasks

- [x] **Task 1 (AC6, AC7, AC8, AC9, AC12)** — new module `public/js/game/power-mod-chips.js`, modelled
  directly on `public/js/tabs/draft-persist.js`'s existing shape (versioned JSON payload, a
  `key(charId, X)` composite-key function, try/catch around every `localStorage` call so a disabled/
  quota-exceeded store degrades to a silent no-op rather than throwing):

  ```js
  const VERSION = 1;
  const CAP = 10; // matches chgMod()'s existing -10..+10 stepper bound, roll-v2.js:222-225

  function key(charId, powerName) {
    return `tm-rlv7-chips-${charId}-${powerName}`;
  }

  export function clampChipValue(v) {
    const n = Math.trunc(Number(v) || 0);
    return Math.max(-CAP, Math.min(CAP, n));
  }

  export function loadChips(charId, powerName) {
    if (!charId || !powerName) return [];
    try {
      const raw = localStorage.getItem(key(charId, powerName));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.chips)) return [];
      return parsed.chips;
    } catch {
      return [];
    }
  }

  function saveChips(charId, powerName, chips) {
    if (!charId || !powerName) return;
    try {
      localStorage.setItem(key(charId, powerName), JSON.stringify({ v: VERSION, chips }));
    } catch {
      // QuotaExceeded or storage disabled — acceptable fallback failure.
    }
  }

  export function addChip(charId, powerName, label, value) {
    const chips = loadChips(charId, powerName);
    const cleanLabel = String(label || '').trim().slice(0, 40);
    const cleanValue = clampChipValue(value);
    if (!cleanLabel || !cleanValue) return chips;
    const chip = { id: crypto.randomUUID(), label: cleanLabel, value: cleanValue, on: true };
    const next = [...chips, chip];
    saveChips(charId, powerName, next);
    return next;
  }

  export function toggleChip(charId, powerName, chipId) {
    const chips = loadChips(charId, powerName);
    const next = chips.map(c => c.id === chipId ? { ...c, on: !c.on } : c);
    saveChips(charId, powerName, next);
    return next;
  }

  export function removeChip(charId, powerName, chipId) {
    const chips = loadChips(charId, powerName);
    const next = chips.filter(c => c.id !== chipId);
    saveChips(charId, powerName, next);
    return next;
  }
  ```

  - [x] `addChip`/`toggleChip`/`removeChip` all return the freshly-saved list so the caller can assign
    straight to `state.powerChips` without a second read.
  - [x] A 0-value or empty/whitespace-only label is silently rejected (`addChip` returns the
    unchanged list) — no toast/error needed, matches `togSpec`'s own silent-no-op guard style
    (`roll-v2.js:414,417`).

- [x] **Task 2 (AC2, AC3, AC4, AC5, AC7, AC9, AC10, AC11)** — wire the module into
  `public/js/suite/roll-v2.js`:
  - [x] Import: `import { loadChips, addChip, toggleChip, removeChip, clampChipValue } from '../game/power-mod-chips.js';`
  - [x] In `loadPool(total, name, pi)` (`roll-v2.js:182-204`), after the existing `state.MOD = 0;`
    reset and before `updPool()`: set `state.POOL_NAME = name;` (new state field — see Task 3), then
    `state.powerChips = state.rollChar ? loadChips(String(state.rollChar._id), name) : [];`, then fold
    the currently-on chips into `state.MOD`:
    `state.MOD += state.powerChips.filter(c => c.on).reduce((sum, c) => sum + c.value, 0);`
  - [x] New exported function `addPowerChip(label, value)`: no-ops if `!state.rollChar ||
    !state.POOL_NAME`; clamps `value` via `clampChipValue`; no-ops on a 0 result (mirrors Task 1's
    own guard, so a silently-rejected chip never touches `state.MOD`); otherwise calls `addChip`,
    assigns the result to `state.powerChips`, adds the clamped value to `state.MOD` (new chips are
    always on-by-default per AC2), clears the two add-mod inputs' values if present
    (`document.getElementById('pmc-label')`/`pmc-value`, matching this file's own existing direct-DOM
    style, e.g. `togMod`'s `rote-c`/`wp-c` classList writes), then calls `updPool()`.
  - [x] New exported function `togPowerChip(id)`: finds the chip in `state.powerChips`; no-ops if not
    found; adds/subtracts its `value` from `state.MOD` depending on its current `on` state (toggling
    off subtracts, toggling on adds — same sign logic as `togSpec`, `roll-v2.js:419-424`); calls
    `toggleChip` and reassigns `state.powerChips`; calls `updPool()`.
  - [x] New exported function `removePowerChip(id)`: finds the chip; no-ops if not found; if it was
    `on`, subtracts its `value` from `state.MOD` first (so an active chip's bonus doesn't linger after
    deletion); calls `removeChip` and reassigns `state.powerChips`; calls `updPool()`.
  - [x] In `updPool()` (`roll-v2.js:250-403`), after the existing equipment-chip block (ends
    `roll-v2.js:399`) and before `el.innerHTML = html;` (`roll-v2.js:401`), append a
    `state.powerChips`-rendering block, structured like the specialty-chip block
    (`roll-v2.js:353-370`) but gated only on `state.powerChips.length` (chips can attach to any pool
    type, not just skill pools):
    ```js
    if (state.powerChips && state.powerChips.length) {
      html += '<div class="effpool-specs">' + state.powerChips.map(chip => {
        const cls = 'effpool-spec' + (chip.on ? ' on' : '');
        const safeId = String(chip.id).replace(/"/g, '&quot;');
        const safeLabel = String(chip.label).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const sign = chip.value > 0 ? '+' : '';
        return `<span class="${cls}" data-chip="${safeId}" `
             + `onclick="togPowerChip('${safeId}')" title="Click to toggle">`
             + `${safeLabel} <span class="effpool-spec-bonus">${sign}${chip.value}</span>`
             + `<span class="effpool-spec-del" onclick="event.stopPropagation();removePowerChip('${safeId}')" title="Remove">×</span>`
             + `</span>`;
      }).join('') + '</div>';
    }
    ```
    (escape `label` for `<`/`>` only — chip labels are free text, unlike `togSpec`'s controlled
    skill-specialty strings, `roll-v2.js:364` only escapes `"`).
  - [x] Also in `updPool()`, paint the add-mod row's visibility: hidden/disabled when
    `!state.rollChar || !state.POOL_NAME` (AC1's guard), matching the existing
    `rv2-manual-spend-row` show/hide pattern (`roll-v2.js:312-323`).

- [x] **Task 3 (AC6, AC10)** — `public/js/suite/data.js`: add two new state fields next to the
  existing `specBonuses`/`activeEquipBonus` (`data.js:90-94`), with a comment in the same style as
  the existing `specBonuses` one:
  ```js
  // rlv.7 (#1039): the currently-loaded pool's own display label (the `name`
  // argument every loadPool() call site already passes) — the persistence
  // key for power-mod-chips.js. Populated by loadPool(), cleared by nothing
  // (stays set to the last-loaded pool's name, same lifetime as POOL_INFO).
  POOL_NAME: null,
  // Persistent per-power mod chips for the currently-loaded pool (rlv.7,
  // #1039). Array of { id, label, value, on }. Populated by loadPool() from
  // power-mod-chips.js's localStorage-backed store; mutated by
  // addPowerChip/togPowerChip/removePowerChip.
  powerChips: [],
  ```

- [x] **Task 4 (AC1, AC3, AC11)** — `public/index.html`: inside `<details class="rv2-breakdown">`
  (`index.html:252-255`), immediately after the existing `#effline` div, add the static add-mod row
  (static so `updPool()`'s wholesale `#effline` innerHTML rewrite never touches — and never wipes the
  focus/value of — these live input elements; see "What this story is NOT"):
  ```html
  <div class="rv2-addmod-row" id="rv2-addmod-row">
    <input type="text" id="pmc-label" class="form-input rv2-addmod-label" placeholder="Mod label (e.g. Air of Menace)" maxlength="40">
    <input type="number" id="pmc-value" class="form-input rv2-addmod-value" placeholder="+/-" min="-10" max="10">
    <button type="button" class="mchip rv2-addmod-btn" onclick="addPowerChip(document.getElementById('pmc-label').value, document.getElementById('pmc-value').value)">+ Mod</button>
  </div>
  ```
  - [x] `app.js:124`'s `roll-v2.js` import line gains `addPowerChip, togPowerChip, removePowerChip`.
    `app.js:1332`'s `Object.assign(window, { ... })` global-exposure block (the mechanism every
    `onclick="..."` handler in `index.html` resolves against) gains the same three names inside its
    existing "Suite roll tab" group (`app.js:1432-1446`, alongside `togSpec`/`togEquipChip`/`togMod`).

- [x] **Task 5 (AC11)** — `public/css/suite.css`: add the one genuinely new rule this story needs —
  `.effpool-spec-del` (a small inline "×", token-coloured) — plus `.rv2-addmod-row`/
  `.rv2-addmod-label`/`.rv2-addmod-value`/`.rv2-addmod-btn` layout rules (flex row; `.form-input`
  already supplies the input styling per `components.css:40`). **Correction found during
  implementation**: `theme.css:77-80`'s own port note confirms **no `--space-*` scale exists in TM
  Game** (unlike TM Admin/TM Story) — every neighbouring `.effpool-*`/`.mchip` rule in `suite.css`
  already uses plain px for spacing, not a token scale; this story's new rules match that real
  convention instead of inventing a token scale nothing else in this file uses. No bare hex/rgba;
  every colour a `var(--...)` token per project-context.md §1.

- [x] **Task 6 (AC12)** — new vitest suite, e.g.
  `server/tests/rlv-7-persistent-mod-chips.test.js`, covering the new module's pure functions.
  Import chain is browser-global-free for `power-mod-chips.js` itself (it only touches `localStorage`,
  `crypto.randomUUID`, `JSON`) — no `location`/`document` stub needed for this file alone, but if any
  test also imports `roll-v2.js` directly (e.g. to check `addPowerChip`'s wiring), reuse
  `gdx-7-apply-costs-on-roll.test.js`'s existing `location`/`localStorage`/`document` stub harness
  (`server/tests/gdx-7-apply-costs-on-roll.test.js:35-60`) rather than inventing a new one:
  - [x] `clampChipValue`: clamps above +10 and below -10; passes through in-range values; truncates
    non-integers; treats non-numeric input as 0.
  - [x] `addChip`: rejects empty/whitespace label; rejects 0 value; accepts a valid label+value and
    returns a list containing exactly one chip with `on: true`; a label over 40 chars is truncated,
    not rejected.
  - [x] `toggleChip`: flips `on` for the matching id only, leaves other chips (and their `on` state)
    untouched; a not-found id returns the list unchanged.
  - [x] `removeChip`: drops the matching chip only; a not-found id returns the list unchanged.
  - [x] `loadChips`: returns `[]` for a charId/powerName with nothing stored; returns `[]` (not a
    throw) for a corrupted/wrong-version stored payload; round-trips a real `addChip` write correctly.
  - [x] Composite-key isolation: chips added under `(charA, powerX)` do not appear under
    `(charA, powerY)` or `(charB, powerX)` — proves AC8 at the module level. 23/23 passing.

- [x] **Task 7 (all ACs, e2e)** — new Playwright spec `tests/rlv-7-persistent-mod-chips.spec.js`,
  reusing rlv.4's own established pattern exactly (`tests/rlv-4-custom-pool-builder.spec.js:1-149` —
  `test.use({ serviceWorkers: 'block' })`, the `local-test-token` auth bypass via `addInitScript`, and
  `window.pickChar(c)` direct character injection rather than depending on `/api/characters` — this
  app's Service Worker intercepts that route ahead of Playwright's own stubs and can serve stale real
  data instead of the test fixture, see `memory/project-sw-leaks-live-data-in-playwright-tests.md`;
  duplicate the `setupSuite`/`pickCharacter`/`ST_USER`/`RICH_CHAR`-shaped helpers inline in the new
  file rather than extracting a shared module, matching rlv.4's own precedent of not refactoring
  `tests/helpers/unified-app.js` for this). **Real gap found and fixed during this task**: the add-mod
  row lives inside `<details class="rv2-breakdown">` (collapsed by default), so `.fill()` on
  `#pmc-label`/`#pmc-value` timed out until the spec's own `loadSkillPool()` helper explicitly opens
  the disclosure first (`summary.click()` if `!details.open`) — a real interaction step a real player
  also has to take, not a workaround for a defect. 11/11 passing after the fix:
  - [x] Load a character, tap a skill pool tile, add a chip via the add-mod row — chip appears in
    `#effline`, `on` by default, effective pool total (`#rv2-eff`) reflects the new value.
  - [x] Toggling the chip off reduces `#rv2-eff` back down by the chip's value; toggling it back on
    restores it.
  - [x] Reloading the page (`page.reload()`), re-injecting the same character, and tapping the same
    skill pool tile again restores the chip with its last-known on/off state (proved both a
    still-on and a toggled-off-then-reloaded case, two separate tests).
  - [x] Removing a chip via "×", then reloading and re-tapping the same pool, shows no chip at all.
  - [x] Loading a **different** pool on the same character shows no chips (proves the per-power key,
    not just per-character), and switching back shows the first pool's chip is still intact.
  - [x] A value typed above 10 in the add-mod row's number input is clamped to +10 (not rejected
    outright) once added.

- [x] **Task 8 (regression)** — run the changed-area suites: the new vitest file (Task 6, 23/23), the
  new Playwright spec (Task 7, 11/11), `tests/rlv-4-custom-pool-builder.spec.js` (shares
  `roll-v2.js`/`char-pools.js`/`app.js` surface — 12/12, nothing in this story's `loadPool()`/
  `updPool()` edits regressed it), every existing vitest suite referencing `roll-v2.js`/`suite/data.js`/
  `game/char-pools.js` (`crd-2-pending-queue`, `crd-3b-resolution-screen`, `equipment-client-fixes`,
  `gdx-7-apply-costs-on-roll`, `gdx-8-influence-reconcile-current-cycle`,
  `issue-879-defence-penalty-wirein`, `rlv-1-combat-tab-quick-roll` — 214/214 combined with Task 6's
  own file), `tests/rlv-2-single-roller-retirement.spec.js` (6/6, baseline Roll-tab behaviour
  unaffected), and `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js` as an extra check on the
  shared `#effline` rendering path this story's `updPool()` edit touches — **5 passed, 7 failed,
  exactly matching `CLAUDE.md`'s own documented pre-existing baseline** ("7 of 12: AC-1, AC-2, AC-3,
  AC-4, AC-7, AC-8, AC-10 — equipment-chip/weapon-reference assertions on `#effline` never find their
  elements"), confirmed unrelated to this story rather than assumed.

## Dev Notes

### Why an inline static row, not a new `openPanel` mode

`app.js`'s `openPanel(mode)` (`app.js:889` onward) rebuilds `#panel-body` wholesale via
`body.innerHTML = ''` plus fresh appends on every open — fine for the existing `char`/`disc`/`common`/
`custom` panels because none of them hold a live, mid-typing text input across a re-render. This
story's add-mod row does — the label/value inputs must survive every `updPool()` repaint (which fires
on nearly every state change: toggling a chip, toggling Rote/WP, adjusting the Base/Mod steppers).
Putting the inputs inside `#effline`'s own `innerHTML =` rewrite (`roll-v2.js:401`) would wipe
whatever the player was mid-typing the moment they toggle anything else. Keeping the row as static
markup in `index.html`, outside `#effline`, sidesteps this entirely — `updPool()` never touches it.

### Why `state.POOL_NAME` is a new field, not derived from `state.POOL_INFO`

`pi` (`state.POOL_INFO`) is a compositional breakdown object (`{ attr, attrV, skill, skillV, ... }`)
with no stable "this power's display name" field of its own — the `name` string is a separate
argument every `loadPool()` call site already computes and passes (see AC6's citation list). Deriving
a label from `pi` post-hoc (e.g. `pi.discName || pi.skill`) would silently diverge from what the
player actually saw as the pool banner text (`loadPool()`'s own `banner.textContent` construction,
`roll-v2.js:196-199`) for Custom Pool entries (`app.js:1085`'s `[attr, skill, disc].join(' + ')`
composite label) and Common Actions (`app.js:1026`'s `a.name`, which isn't reachable from `pi` at
all). Storing the exact `name` argument as `state.POOL_NAME` guarantees the persistence key always
matches what `loadPool()` was actually called with, for every entry path uniformly (this is the same
"a chip is one more toggleable layer on the model `char-pools.js`/`shared/pools.js` already produces"
generalisation D5 named, applied literally).

### Custom Pool labels are combo-dependent — expected, not a defect

A Custom Pool load's label is `[attr, skill, disc].filter(Boolean).join(' + ')` (`app.js:1085`) — so
"Wits + Intimidation" and "Wits + Intimidation + Nightmare" are two different persistence keys even
though a player might think of them as "the same roll." This is a natural consequence of keying on the
pool's own display label (consistent with every other entry path) rather than inventing a second,
parallel identity system — flagging it here so the dev agent doesn't treat it as a bug to work around.

### Open question for Angelus — "pool caps enforced"

Issue #1039's own AC line just says "pool caps enforced" without defining what a cap means here. This
story implements it as **AC9: each chip's own value is clamped to -10..+10**, reusing the existing
bound `chgMod()` already applies to the plain Mod stepper (`roll-v2.js:222-225`) — the app's own
established sanity bound, not a new house rule invented for this story. An alternative reading (a cap
on the *total* effective pool size, or a cap on how many chips can be active at once) was considered
and not implemented — nothing in the codebase defines either of those today, and inventing one would
be a genuine new rules decision rather than a proven-pattern reuse. If Angelus wants a different
definition, that's a follow-up, not a blocker for this story as scoped.

### Project Structure Notes

One new file (`public/js/game/power-mod-chips.js`), modelled directly on an existing sibling
(`tabs/draft-persist.js`) rather than inventing a new persistence shape. All other changes are
additive edits to files this epic already owns (`roll-v2.js`, `data.js`, `app.js`, `index.html`,
`suite.css`) — no new top-level module boundary, no new dependency.

### References

- [Source: specs/epic-rlv-roller-harmonisation.md] — rlv.7's row and D5's own finding (chips as "one
  more toggleable layer" on the existing `state.WP`/`MOD`/`ROTE` pattern), re-confirmed against
  current code before this story was written (both `roll-v2.js`'s toggle-layer pattern and
  `char-pools.js`'s pool-breakdown model still match the epic row's description as of 2026-08-24 — no
  correction needed this time, unlike rlv.4/5/6's own premises).
- [Source: specs/dice-roller-harmonisation-audit.md §2, §4d, §5 item 7] — "what #1039 actually needs
  (toggleable per-power modifier chips) is a proven pattern already, not a missing capability."
- [Source: GitHub issue #1039, item 2 + its AC line] — full text pulled via `gh issue view 1039`
  2026-08-24: "Persistent remembered modifiers: free-text mods become persistent chips per power ('Air
  of Menace +2' pre-toggled next time you roll Nightmare). Player curates, app remembers, pool
  breakdown stays visible to STs. Pool caps enforced." / AC: "Per-power persistent mod chips: add/
  toggle/persist; pool breakdown remains visible to STs; pool caps enforced."
- [Source: public/js/suite/roll-v2.js] — read in full for this story. `state.WP`/`MOD`/`ROTE` toggle
  pattern: `loadPool` (182-204), `effPool` (208-213), `chgMod` (222-225), `updPool` (250-403,
  specialty-chip block 353-370, equipment-chip block 372-399), `togSpec` (413-427), `togEquipChip`
  (431-448), `togMod` (536-554). `spendableCost`/`canAffordCost`'s "exported for testability" pattern
  (81-99) is this story's own precedent for AC12.
- [Source: public/js/game/char-pools.js] — read in full for this story. `pools[]` construction
  (86-201), `roteEligibleFor` (59-63), the `meritBonus`/`meritLabel` automatic-bonus mechanism
  (122-127) this story explicitly does NOT touch or duplicate, `tm_pools_collapsed` localStorage
  precedent (171, 199).
- [Source: public/js/app.js:889-1157] — read in full for this story. `openPanel(mode)`'s
  `char`/`disc`/`auspex`/`common`/`custom` branches (889-1097) and every `loadPool(...)` call site
  (953, 980, 1026, 1092, 1149) confirming the `name` argument's shape across all five entry paths;
  `suiteState.rollChar` assignment sites (332, 1116, 1265) confirming it is always set before any
  `loadPool()` call this story touches.
- [Source: public/js/tabs/draft-persist.js] — read in full; this story's `power-mod-chips.js` mirrors
  its exact shape (versioned payload, composite `key(charId, X)`, try/catch-guarded
  `localStorage.setItem`/`getItem`).
- [Source: public/index.html:150-272] — the full Roll tab markup, read in full for this story,
  confirming the exact insertion point inside `<details class="rv2-breakdown">` and the file's own
  header comment listing which IDs are the "shared surface" other files depend on (this story adds
  new IDs, `pmc-label`/`pmc-value`/`rv2-addmod-row`, and does not touch any ID in that shared list).
- [Source: public/css/suite.css:135-149,171-173,840-842] — `.effpool-seg`/`.effpool-spec`/`.mchip`/
  `.gcp-9a-badge` families, the exact classes this story reuses rather than inventing new ones.
- [Source: specs/project-context.md §1] — normalised-CSS rule this story's Task 5 must satisfy.
- [Source: server/tests/gdx-7-apply-costs-on-roll.test.js:1-60] — the existing
  `location`/`localStorage`/`document` stub harness for testing `roll-v2.js` exports without a
  browser; this story's own module (`power-mod-chips.js`) needs none of it in isolation (only touches
  `localStorage`, already real in Node 20+, and `crypto.randomUUID`, also a Node global) but any test
  that also imports `roll-v2.js` directly should reuse this harness rather than reinventing it.
- [Source: tests/rlv-4-custom-pool-builder.spec.js] — read in full; this story's own Playwright spec
  (Task 7) copies its `setupSuite`/`pickCharacter`/`ST_USER`/character-fixture pattern directly,
  including the Service-Worker-block workaround its own header comment documents.
- [Source: memory/project-sw-leaks-live-data-in-playwright-tests.md] — the Service Worker /api
  interception finding this story's e2e spec must design around from the start (matches rlv.4's own
  confirmed pattern), rather than discover it fresh mid-implementation.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (`bmad-dev-story`, 2026-08-24)

### Debug Log References

- Two Playwright runs of `tests/rlv-7-persistent-mod-chips.spec.js`: the first (before the
  `<details>`-disclosure fix) recorded 4 passed / 7 failed, all 7 failures timing out on
  `#pmc-label`/`#pmc-value`/`.rv2-addmod-btn` reporting "element is not visible"; the second (after
  the fix) 11/11 passed in 23.1s.
- `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js` regression run: 5 passed / 7 failed,
  cross-checked against `CLAUDE.md`'s own documented pre-existing baseline for this exact file rather
  than assumed — exact match (AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-10).

### Completion Notes List

- Implemented per the story's own pre-worked spec (Tasks 1-8) — every file:line anchor matched
  current `main` exactly at implementation time.
- Task 1: `public/js/game/power-mod-chips.js` — new module, byte-for-byte the design already worked
  out in this story's own Task 1 code block. Modelled on `tabs/draft-persist.js`'s versioned-payload,
  composite-key shape.
- Task 2: `roll-v2.js` — import added; `loadPool()` now restores persisted chips and folds on-chips
  into `state.MOD`; three new exported functions (`addPowerChip`/`togPowerChip`/`removePowerChip`);
  `updPool()` renders `state.powerChips` as a fourth `.effpool-specs` block (after the equipment-chip
  block, before `el.innerHTML = html`) and paints the add-mod row's enabled/disabled state.
- Task 3: `public/js/suite/data.js` — added `POOL_NAME`/`powerChips` state fields next to
  `specBonuses`/`activeEquipBonus`.
- Task 4: `public/index.html` — static add-mod row added inside `<details class="rv2-breakdown">`,
  right after `#effline`, with `disabled` on all three controls by default (matching AC1's "hidden/
  inert when no character or pool loaded" — `updPool()`'s early-return path for "no pool yet" never
  re-enables them, so the static default IS the correct initial state). `app.js` gained the three new
  imports and their `window` exposure entries in the existing "Suite roll tab" group.
- Task 5: `public/css/suite.css` — **correction found during implementation**: the story's own Task 5
  text assumed a `--space-*` token scale exists in this app (following `project-context.md`'s generic
  guidance); `theme.css:77-80`'s own port note confirms no such scale exists in TM Game (unlike TM
  Admin/TM Story) — every neighbouring `.effpool-*`/`.mchip` rule in `suite.css` already uses plain px
  for spacing. New rules (`.effpool-spec-del`, `.rv2-addmod-row` and its children) match that real
  convention instead. Colours are still all `var(--...)` tokens, satisfying AC11's actual requirement.
- Task 6: `server/tests/rlv-7-persistent-mod-chips.test.js` — originally 23 tests covering
  `clampChipValue`/`addChip`/`toggleChip`/`removeChip`/`loadChips` plus composite-key isolation
  (AC8 proved at the module level; the module itself needs no `location`/`document` stub, only real
  Node 20+ globals). Grew to **43 tests** across this story's own two review rounds (self-check, then
  the external Codex pass below) — see the Senior Developer Review section for the added coverage.
- Task 7: `tests/rlv-7-persistent-mod-chips.spec.js` — originally 11 tests, grew to **13** during the
  Codex review round (2 new regression tests, see Senior Developer Review). One real gap found and
  fixed during this task's ORIGINAL authoring (not a source defect): the add-mod row sits inside a
  collapsed-by-default `<details>` disclosure, so the spec's `loadSkillPool()` helper opens it
  (`summary.click()` if not already open) before any `.fill()` call — the same step a real player has
  to take, since the row was deliberately placed there per AC1/AC8 (visible pool-breakdown disclosure,
  "stays visible to STs").
- Task 8: full regression — see Debug Log References above and the Senior Developer Review section
  below. The dev-story pass's OWN regression run had no High/Medium findings; the external Codex
  review that followed found real ones (4 High, 6 Medium — all patched, see below). The Task-5
  assumption correction remains a Dev Notes accuracy fix, not a defect requiring a patch.
- **Real bug found and fixed during this session's own pre-review self-check** (before handing off to
  Codex, not a review finding): `addPowerChip` (`roll-v2.js`) applied the clamped value to `state.MOD`
  **unconditionally** after calling `addChip()`, but `addChip()` has its own, independent
  empty/whitespace-label rejection — a valid non-zero value submitted with a blank label would inflate
  `state.MOD` with no corresponding chip added and nothing persisted, so the pool total would silently
  drift wrong until the next `loadPool()`. Fixed by comparing `state.powerChips.length` before/after
  the `addChip()` call and only applying `state.MOD += v` when it actually grew. Prove-discriminated:
  `git stash`-reverted the fix alone, confirmed the two new regression tests (empty label, whitespace
  label) fail exactly as expected (`state.MOD` reads `3` instead of `0`), restored and re-confirmed
  28/28 green. Two new regression tests plus one for the pre-existing `0`-value early guard and one
  for "no character loaded" added to `server/tests/rlv-7-persistent-mod-chips.test.js`, using the same
  `location`/`document` stub harness as `gdx-7-apply-costs-on-roll.test.js` (this story's own Task 6
  originally scoped out testing `roll-v2.js`'s DOM-touching exports, matching `togSpec`/`chgMod`'s
  existing untested precedent — that scoping call still stands for the *rest* of `addPowerChip`/
  `togPowerChip`/`removePowerChip`; this one function gets a dedicated integration test because a real
  bug was found in it, not because the scope changed).
- Open item carried forward, not resolved here (flagged in the story's own Dev Notes rather than
  decided unilaterally): the issue's "pool caps enforced" AC is undefined; this story implements it
  as a ±10 clamp per chip, reusing the app's own existing `chgMod()` bound. If Angelus wants a
  different definition, that's a follow-up, not a blocker.

### File List

- `public/js/game/power-mod-chips.js` — new (persistence module); modified again during Codex review
  (injective composite key, honest storage-failure-as-no-op, per-entry load validation/normalization).
- `public/js/suite/roll-v2.js` — modified (import, `loadPool()`/`updPool()` edits, three new exported
  functions); modified again during Codex review (new `resetRollPool()` export, `updPool()`
  restructured so chip rendering/add-row painting no longer sit behind the `pi.attr` early return,
  `togPowerChip`/`removePowerChip` switched to badge-element + `dataset.chip` instead of an
  interpolated id string, both recompute MOD from a full before/after on-sum instead of a
  single-chip delta, `pmc-add-btn` id added so its lookup uses `getElementById` like every other
  element in this file instead of the file's only `querySelector` call).
- `public/js/suite/data.js` — modified (two new state fields).
- `public/index.html` — modified (static add-mod row inside the breakdown disclosure; `id="pmc-add-btn"`
  added to the add-mod button during Codex review).
- `public/js/app.js` — modified (three new imports, three new `window` exposure entries); modified
  again during Codex review (`resetRollPool` imported and called from `pickChar()` and `openChar()`).
- `public/js/suite/sheet.js` — modified during Codex review (`resetRollPool` imported and called from
  `onSheetChar()` — a fourth character-switch site the story's own original research missed, only
  found because Codex searched beyond `app.js`).
- `public/css/suite.css` — modified (`.effpool-spec-del`, `.rv2-addmod-row` and children); modified
  again during Codex review (comment rephrased to remove an embedded `*/` that was prematurely
  closing it and corrupting the `.effpool-spec-del` rule).
- `server/tests/rlv-7-persistent-mod-chips.test.js` — new (23 tests); grew to 43 during review (see
  Senior Developer Review).
- `tests/rlv-7-persistent-mod-chips.spec.js` — new (11 tests); grew to 13 during review.
- `specs/deferred-work.md` — modified (one genuinely pre-existing, review-found issue logged, not
  fixed — see that file's own "Deferred from: code review of rlv-7…" entry).

## Senior Developer Review (AI)

**Reviewed:** 2026-08-24. **Mode:** EXTERNAL — Codex CLI (`codex exec -C <repo> -s workspace-write
-c model_reasoning_effort=high`), a real 3-pass review (Blind Hunter / Edge Case Hunter / Acceptance
Auditor), with a genuine 3b sub-pass that ran the suites itself, reproduced findings live in
Chromium, and prove-discriminated its own claims (SHA-256 hash checks before/after a temporary
revert). Diff scoped to source + tooling only (`specs/stories/code-review/rlv-7-diff.txt`, against
base commit `66424fb2` — `origin/main` right after PR #1203 merged), story/tracking files
deliberately excluded. Full prompt and findings persisted at
`specs/stories/code-review/rlv-7-codex-review.md` / `rlv-7-codex-findings.md` / `rlv-7-codex-run.log`.

**Outcome: this was a genuinely high-value external pass — 4 High findings, all real, all patched
with proven regression tests; 6 Medium findings, all real, all patched; several Low findings, mostly
resolved as a side effect of the same fixes. The Dev Agent Record's original "No High/Medium
findings" line (written after this story's own internal regression pass, before external review) was
itself flagged by Codex's own Pass 3b as false and overstated — correctly so; that claim described
this session's own regression run, not an adversarial review, and the distinction should have been
stated more carefully the first time.**

### Findings — High (4, all patched)

1. **[Pass 2/3a/3b, High]** Switching character (`pickChar()`, `openChar()` in `app.js`; `onSheetChar()`
   in `suite/sheet.js` — a fourth site this story's own research never found, only surfaced because
   Codex searched beyond `app.js`) left the PREVIOUS character's `POOL_NAME`/`powerChips`/`MOD`/
   `POOL_INFO` fully live under the NEW character. Reproduced live in Chromium: load character A's
   6-die Occult pool with an on `+2` chip, switch to character B without loading a pool — the UI
   stayed at effective 8, the stale chip badge remained clickable, and clicking it would call
   `togPowerChip`/`removePowerChip` with `state.rollChar` already reassigned to B — persisting A's
   chip data into **B's own localStorage slot** for a pool B never loaded. A real cross-character
   data leak, not just a stale display, and a routine flow (every character switch), not an exotic
   edge case. **Fix**: new exported `resetRollPool()` in `roll-v2.js` clears `POOL_INFO`/`POOL_NAME`/
   `powerChips`/`MOD`/`specBonuses`/`activeEquipBonus`/`activeWeaponId` together and repaints via
   `updPool()`; called from all three real character-reassignment sites (the fourth,
   `app.js:1265`→`pickChar()`, was already redundant with `pickChar()`'s own reset). Proven by a new
   e2e test (`tests/rlv-7-persistent-mod-chips.spec.js`, "switching character clears the previous
   character's pool/chips") that reproduces the exact Chromium scenario Codex found and asserts the
   stale chip/effective-pool/enabled-row are all gone immediately after the switch.
2. **[Pass 2/3b, High]** `combat-tab.js`'s `quickRoll()` calls exactly `loadPool(pool, label, { total:
   pool })` — a `pi` with no `.attr` at all. `loadPool()` still folded a persisted on-chip's value
   into `state.MOD` in that case (chip restoration never gated on `.attr`), but `updPool()` used to
   `return` before the chip-rendering block AND the add-mod-row painting for any `pi` without
   `.attr` — so the roll silently included a modifier the ST could not see, toggle, or remove.
   Reproduced live: an attr-less Brawl reload showed effective 7 (5 base + a persisted `+2` chip)
   while rendering zero chip badges. **Fix**: restructured `updPool()` so the attr/skill/disc/merit
   segment breakdown is still skipped for a no-`.attr` pool, but power-chip rendering and the
   add-mod-row enable/disable painting now run unconditionally, below and independent of that
   branch. Proven by a new e2e test ("a persisted chip stays visible on a combat-quick-roll-shaped
   pool with no .attr") that calls `window.loadPool(5, 'Occult', { total: 5 })` — the exact shape
   `quickRoll()` uses — and asserts the chip badge renders, stays toggleable, and the add-mod row
   stays enabled.
3. **[Pass 3a, High]** Direct consequence of finding 1: AC1's literal wording ("hidden/inert when no
   character or no pool is loaded") was violated the instant a character switch happened without a
   fresh pool load — the add-mod row stayed visible and enabled against the wrong character. Resolved
   by the same `resetRollPool()` fix as finding 1 (same root cause, independently surfaced by a
   different pass reading the AC text literally rather than the code).
4. **[Pass 3b, High]** The record's own "No High/Medium findings" conclusion, read literally, implied
   ship-as-is readiness — false, given findings 1-2 above were both reproduced live in Chromium with
   the repository's own Playwright-managed server. Resolved by this review round itself; the record
   now states plainly (this section) that the *internal* regression pass found nothing, but the
   *external* pass found real, patched defects — a distinction worth being explicit about going
   forward, per this project's own established convention of naming which findings came from outside
   the authoring session.

### Findings — Medium (6, all patched)

5. **[Pass 1/2, Medium]** `togPowerChip`/`removePowerChip` computed the MOD delta from the LOCALLY
   held `state.powerChips` copy's `chip.on` value, then separately called `toggleChip`/`removeChip`,
   which independently re-read `localStorage` fresh. If local and storage ever disagreed (a
   same-origin multi-tab race on the same character), the sign/delta could be wrong. **Fix**: both
   functions now recompute the on-chip value SUM before and after the storage call and apply the
   NET difference — correct regardless of what else changed underneath. Proven by a new unit test
   simulating exactly this race (toggle chip A and add chip C directly via the module while
   `state.powerChips` still holds the stale pre-race view, then toggle chip B via the roller and
   confirm MOD lands on the mathematically correct total, not the naively-assumed one).
6. **[Pass 1/3a, Medium]** `saveChips()` swallowed a `localStorage.setItem` exception (quota
   exceeded, storage disabled) and every caller still returned the "next" list as if the write had
   succeeded — a failed persistent write was presented to the roller as a successful one, silently
   reverting only on reload. Contradicted this story's own Task 1 spec, which explicitly called for
   "degrade to a silent no-op." **Fix**: `saveChips()` now returns whether the write actually
   succeeded; `addChip`/`toggleChip`/`removeChip` return the UNCHANGED list on failure, making it a
   genuine no-op end-to-end (in-memory state and storage both stay as they were) rather than a
   divergent one. `addPowerChip`'s existing before/after-length check (from this story's own earlier
   self-found fix) now correctly no-ops on a save failure for free, with a new test proving it.
7. **[Pass 1, Medium]** `key(charId, powerName)` was a plain `` `tm-rlv7-chips-${charId}-${powerName}`
   `` template with no delimiter escaping — not injective: `(charId:"a-b", powerName:"c")` and
   `(charId:"a", powerName:"b-c")` both produced the identical key, letting two distinct
   character/pool pairs overwrite each other's chip list. (Pass 2 correctly narrowed this to Low
   real-world reachability today, since production character ids are fixed-width MongoDB
   `ObjectId`s — but the function's own contract was still broken for any non-`ObjectId` source,
   including this story's own test fixtures.) **Fix**: `encodeURIComponent` each component and join
   with `|`, which `encodeURIComponent` itself escapes (to `%7C`) and therefore can never appear
   literally inside either encoded half — genuinely injective now. Proven by a new unit test using
   the exact collision example from the finding.
8. **[Pass 1, Medium]** A chip id was interpolated directly into the `onclick` attribute's own
   single-quoted JS argument (`togPowerChip('${id}')`), escaped for `"` only. A malformed/imported
   id containing an apostrophe could break out of that string and inject script. **Fix**: switched
   to this file's OWN existing, safer pattern (`togSpec(this)`/`togEquipChip(this)`) — the clicked
   element is passed directly and the id is read via `.dataset.chip`, never embedded as executable
   JS text at all, so no escaping scheme can be bypassed. (Also closed at the data layer:
   `loadChips()`'s new per-entry validation, finding 9, rejects any id that isn't a non-empty
   string.)
9. **[Pass 1, Medium]** A stored payload passing the outer shape check (`v === VERSION`, `chips` is
   an array) was trusted field-for-field with no per-entry validation — a corrupted-but-parseable
   payload with a non-numeric `value` could coerce `state.MOD += value` into string concatenation
   instead of numeric addition. **Fix**: every loaded entry now passes through a new
   `normalizeChip()` — `value` runs through the same `clampChipValue()` `addChip()` already uses on
   write (so a numeric STRING like `"7"` is correctly coerced to the number `7`, while genuinely
   non-numeric text is dropped), `id`/`label` must be non-empty strings, `on` is normalized to a
   strict boolean. Malformed entries are dropped individually, not the whole payload. Proven by new
   unit tests: mixed valid/invalid entries in one payload, a numeric-string value being coerced
   (not dropped), an out-of-range stored value being clamped on load, and a non-`true` `on` value
   normalizing to `false`.
10. **[Pass 3a/3b, Medium]** `suite.css`'s new comment block contained the literal phrase
    `.effpool-*/.mchip` — the `*/` inside it prematurely closed the CSS comment, corrupting the
    `.effpool-spec-del` rule that followed (Codex reproduced this live: computed `margin-left` came
    back `0px`, not the intended `4px`). Directly falsified this story's own Task 5/AC11 claim that
    the new CSS satisfied the remove-affordance styling. **Fix**: comment rephrased to avoid any
    `*/` sequence in its body.

### Findings — Low (6: 2 addressed as a side effect, 1 test strengthened, 3 self-resolved/moot)

11. **[Pass 1, Low]** Several test assertions were weaker than their titles claimed (e.g. the
    round-trip test only checked `label`, not `id`/`value`/`on`). Strengthened the round-trip test to
    assert full equality against the write's own return value. The other named cases (source-fetch
    smokes proving spelling not wiring; the add-mod-row structural placement) are already backed by
    the live e2e suite's own real DOM interactions, which is a stronger proof than strengthening the
    smoke tests themselves would add — left as-is, accepted trade-off.
12. **[Pass 1, Low]** The add-success check in `addPowerChip` is a list-length heuristic, not proof a
    specific invocation added a chip. Sound given `addChip()`'s append-only invariant (confirmed by
    reading it); a dedicated save-failure test now proves the heuristic correctly catches that case
    too. No further change.
13. **[Pass 1, Low]** Storage-failure code comments contradicted the actual (pre-fix) behaviour.
    Resolved as a direct side effect of finding 6's fix — the comments now describe what the code
    actually does.
14. **[Pass 2, Low]** The original `addPowerChip` integration test harness never set `state.POOL_INFO`,
    so it exercised the no-`.attr` early-return path, and its fake `document` lacked the
    `querySelector` the successful branch called. **Self-resolved**: finding 2's fix made chip
    rendering/add-row painting unconditional (no longer behind the `pi.attr` branch), and this
    story's OWN earlier fix (switching `document.querySelector('.rv2-addmod-btn')` to
    `document.getElementById('pmc-add-btn')` for consistency with every other DOM lookup in this
    file) removed the missing-stub gap entirely — both the vitest and vanilla-DOM paths now use only
    `getElementById`, which every stub in this codebase already implements.
15. **[Pass 2, Low]** Pass 1's key-collision example needs non-`ObjectId` character ids to be
    reachable via the real API today. **Moot** — finding 7 fixed the underlying injectivity issue
    directly rather than leaving it as a documented-but-unreachable risk.
16. **[Pass 3b, Low]** The Dev Agent Record's Task 6 completion note was stale (claimed 23 tests, no
    stub needed) and contradicted its own later self-fix paragraph (28 tests, stub needed). Corrected
    above (Task 6/7/8 notes and File List now state the real, current counts and reasons).

### Deferred (1, genuinely pre-existing, not caused by this story)

- **[Pass 2, Medium in isolation, deferred not patched]** The pre-built skill-tile fallback in three
  `app.js` `onTap` callsites drops `roteEligible`/`meritBonus`/`meritLabel` even though the source
  pool object (`char-pools.js`) already carries them — a real, pre-existing gap (all three callsites
  predate this story) that shows up as a missing Rote cue / missing merit-bonus segment on load for
  an otherwise numerically-correct pool. Logged to `specs/deferred-work.md` with the exact fix,
  rather than folded into this story's own scope.

### Regression re-verification after all patches

New vitest: 43/43 (`server/tests/rlv-7-persistent-mod-chips.test.js`, up from 23 — 20 new tests
across the self-found fix and this review round). New Playwright: 13/13
(`tests/rlv-7-persistent-mod-chips.spec.js`, up from 11 — 2 new regression tests reproducing the two
High findings live). Combined vitest regression (the 7 named sibling suites + this story's own file):
**234/234**. `tests/rlv-4-custom-pool-builder.spec.js`: 12/12, unaffected by the `roll-v2.js`/
`char-pools.js`-adjacent changes. `tests/rlv-2-single-roller-retirement.spec.js`: 6/6, Roll-tab
baseline unaffected. `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js`: 5 passed / 7 failed,
re-confirmed byte-identical to `CLAUDE.md`'s own documented pre-existing baseline (same 7 test names:
AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-10) after every review patch, not just before.

### Outcome

Story status: `done`. All 4 High and all 6 Medium findings patched and prove-discriminated (either
via a dedicated new regression test reproducing the exact failure mode, or via `git stash`-based
before/after verification for the two findings this session self-found before external review).
1 Low finding's test strengthened; the rest resolved as direct side effects of the High/Medium
patches or judged sound as originally implemented. 1 genuinely pre-existing Medium-in-isolation
finding deferred with a named fix, not silently absorbed into this story's scope. NOT committed, NOT
pushed, NOT merged — per this project's hard rule, only on the user's own explicit instruction in a
current message.
