# Story rcv.4: Surface the persistent mod chips out of the buried Pool breakdown disclosure

Status: done

## Story

As a player who has already set up a persistent modifier chip for a power (rlv.7),
I want to see and manage that chip without having to open the collapsed "Pool breakdown" disclosure,
so that a feature I already turned on isn't effectively invisible every time I load that power.

## Design source — traced against the real current markup, not assumed

`public/js/game/power-mod-chips.js` (rlv.7) is fully shipped, correct, and already wired into
`roll-v2.js`'s `loadPool()`/`updPool()`. The only defect is placement: the chip badges render as the
LAST thing appended inside `#effline`'s own innerHTML (`roll-v2.js:564-576`), and `#effline` lives
inside `<details class="rv2-breakdown">` (currently `index.html:268-279`, collapsed by default,
`<summary>Pool breakdown</summary>`). A player has no reason to open a "dice math breakdown" panel to
find a feature that changes what they're about to roll — the chips are real and working, but
practically invisible. The separate "+ Mod" add-row (`#rv2-addmod-row`, `index.html:274-278`) is
buried the same way.

**This is a DOM re-parent, nothing else — confirmed feasible with ZERO new CSS**, not assumed:
- The chip badges use `.effpool-specs`/`.effpool-spec` (`suite.css:157-182`) — grepped: these rules
  are NOT scoped under `#effline` or `.rv2-breakdown` anywhere; they're free-standing chip styling,
  already used for spec/equipment chips elsewhere in this same file. Fully portable to a new
  container as-is.
- The add-row uses `.rv2-addmod-row`/`.rv2-addmod-label`/`.rv2-addmod-value`
  (`suite.css:183-187`) — same check, same result: generic, container-agnostic rules.
- A label for the new always-visible section can reuse `.rv2-again-wrap`/`.rv2-again-lbl`
  (`suite.css:2829-2840`) verbatim — the exact same small-caps label style this Roll tab already uses
  for "Again rule", immediately above where this new section will sit. `.rv2-again-wrap` is generic
  padding only (`padding: 8px 16px`), not scoped to the Again-rule's own segmented buttons.

**New placement**: a new static wrap, sibling to `.rv2-again-wrap` and `.rv2-chip-row`, inserted
immediately AFTER `.rv2-breakdown`'s closing `</details>` and BEFORE the Roll button
(`index.html:281-282`) — always visible regardless of the Pool breakdown's own open/closed state,
positioned right where the player is about to commit to rolling, matching the mockup's own ordering
(`rulesHtml + modsHtml + controlsHtml` — mods sits between the rules box and the roll controls, never
nested inside a collapsed disclosure, `scratchpad/roller-live-recovered/public/app.js:1395-1400`'s
own `.mods`/`.mods-label`/`.mods-row` block, itself never inside a `<details>`).

**"Pool breakdown" keeps `#effline`'s own attr/skill/spec/equipment segments** — those are genuinely
low-priority detail (the anchor number above already shows the total), unlike the mod chips, which
represent an active choice the player made and needs to see/toggle. Only the power-chip badges and the
add-row move out; nothing else about `.rv2-breakdown` changes.

## Acceptance Criteria

1. A new static wrap in `index.html`, positioned after `.rv2-breakdown`'s closing tag and before the
   Roll button:
   ```html
   <div class="rv2-again-wrap" id="rv2-mods-wrap">
     <div class="rv2-again-lbl">Mods</div>
     <div id="rv2-power-chips"></div>
     <div class="rv2-addmod-row" id="rv2-addmod-row">
       <input type="text" id="pmc-label" class="form-input rv2-addmod-label" placeholder="Mod label (e.g. Air of Menace)" maxlength="40" disabled>
       <input type="number" id="pmc-value" class="form-input rv2-addmod-value" placeholder="+/-" min="-10" max="10" disabled>
       <button type="button" id="pmc-add-btn" class="mchip rv2-addmod-btn" onclick="addPowerChip(document.getElementById('pmc-label').value, document.getElementById('pmc-value').value)" disabled>+ Mod</button>
     </div>
   </div>
   ```
   `#rv2-addmod-row` is moved verbatim (same id, same three inputs/button, same `onclick`) — only its
   position in the document changes, so every existing `document.getElementById('rv2-addmod-row')`/
   `getElementById('pmc-label')`/etc. reference in `roll-v2.js` keeps working with zero JS changes to
   that part.
2. `.rv2-breakdown` (currently `index.html:268-279`) loses its `#rv2-addmod-row` child (moved per AC1)
   but keeps `#effline` and the `<summary>Pool breakdown</summary>` exactly as today.
3. In `roll-v2.js`'s `updPool()` (currently `:298-...`), the power-chip HTML-building block
   (`:564-576`, `if (state.powerChips && state.powerChips.length) { html += '<div class=
   "effpool-specs">' + ... }`) is removed from the `html` string that feeds `#effline` and instead
   writes directly into `#rv2-power-chips`'s own `innerHTML` — same template, same `togPowerChip`/
   `removePowerChip` click wiring, same escaping, only the write target changes. When
   `state.powerChips.length` is 0, `#rv2-power-chips` gets `innerHTML = ''` (hidden by having nothing
   in it, matching today's exact behaviour of the block simply not being appended).
4. The add-row's own enabled/disabled painting logic (currently `:585-588`,
   `document.getElementById('rv2-addmod-row')`, toggling `.disabled` based on
   `!!(state.rollChar && state.POOL_NAME)`) is UNCHANGED — it already looks the element up by id
   independent of its DOM position, so this continues to work with no code change once AC1 moves the
   element.
5. No change to `power-mod-chips.js` itself, to `loadChips`/`addPowerChip`/`togPowerChip`/
   `removePowerChip`'s own logic, or to the `tm-rlv7-chips-${charId}|${powerName}` storage key format
   — this story only moves where the already-correct HTML renders.
6. Existing `.rv2-breakdown` behaviour (attr/skill/spec/equipment segments inside `#effline`, the
   disclosure's own open/closed state) is otherwise unchanged.

## What this story is NOT

- **Not** a reimplementation of the chip logic — the recovered mockup has its own from-scratch chip
  state model (`state.specOn`/`FRENZY_MODIFIERS`/etc., app.js:1370-1410); none of it belongs in this
  story. `power-mod-chips.js` stays exactly as rlv.7 shipped it.
- **Not** a change to the storage key format or its own `|` separator — Sally/Dana's own party-mode
  flag names this as a real regression class from a past bug (since fixed) to test for if this story
  ever touches how `powerName` strings are generated near this code. It doesn't (AC5) — flagging the
  test coverage below as belonging to this AC, not a new code change.
- **Not** a new CSS component — every class this story uses already exists and is already generic
  enough to reuse verbatim (see Design source above).
- **Not** a change to `.rv2-breakdown`'s own `#effline` content (attr/skill/spec/equipment segments)
  — those stay exactly where they are.

## Tasks / Subtasks

- [ ] Task 1 (AC1, AC2) — `public/index.html`: move the `#rv2-addmod-row` block (currently
  `index.html:274-278`, inside `.rv2-breakdown`) out to a new `#rv2-mods-wrap` container, inserted
  immediately after `.rv2-breakdown`'s closing `</details>` tag and before the Roll button. Add
  `<div id="rv2-power-chips"></div>` inside the new wrap, above the (relocated, unmodified) add-row.
  Use the exact markup in AC1's own code block.

- [ ] Task 2 (AC3) — `public/js/suite/roll-v2.js`, `updPool()`: change the power-chip block
  (currently around `:564-576`) from appending to the shared `html` variable to writing directly into
  a fetched `#rv2-power-chips` element:
  ```js
  // rcv.4: surfaced out of #effline's own collapsed-disclosure innerHTML into
  // its own always-visible container - same template, same togPowerChip()/
  // removePowerChip() wiring, only the write target changed.
  const powerChipsEl = document.getElementById('rv2-power-chips');
  if (powerChipsEl) {
    powerChipsEl.innerHTML = (state.powerChips && state.powerChips.length)
      ? '<div class="effpool-specs">' + state.powerChips.map(chip => {
          const cls = 'effpool-spec' + (chip.on ? ' on' : '');
          const safeId = String(chip.id).replace(/"/g, '&quot;');
          const safeLabel = String(chip.label).replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const sign = chip.value > 0 ? '+' : '';
          return `<span class="${cls}" data-chip="${safeId}" `
               + `onclick="togPowerChip(this)" title="Click to toggle">`
               + `${safeLabel} <span class="effpool-spec-bonus">${sign}${chip.value}</span>`
               + `<span class="effpool-spec-del" onclick="event.stopPropagation();removePowerChip(this.closest('[data-chip]'))" title="Remove">×</span>`
               + `</span>`;
        }).join('') + '</div>'
      : '';
  }
  ```
  Remove the old block entirely from the `html`-building section (do not leave both — the chips must
  render in exactly one place). Verify the `html` variable's own remaining content (attr/skill/spec/
  equipment segments) is unaffected by reading `updPool()` in full before and after this edit.

- [ ] Task 3 (testing) — extend `tests/rlv-7-persistent-mod-chips.spec.js` (this is the existing
  chip-logic story's own spec — a placement change belongs there, not a new file) with: a chip added
  and toggled on is visible WITHOUT opening `.rv2-breakdown` (assert `#rv2-power-chips .effpool-spec`
  is visible while `.rv2-breakdown` has no `open` attribute); the add-row is reachable the same way
  (`#rv2-addmod-row` visible, not requiring the breakdown disclosure open); `.rv2-breakdown` itself
  still shows the attr/skill breakdown correctly when opened (regression guard that Task 2 didn't
  accidentally remove or duplicate anything from `#effline`); the storage-key regression class Sally/
  Dana flagged — confirm two different `powerName` values that could theoretically collide under a
  naive `|`-split (e.g. one power's name legitimately containing a `|` character, if that's even
  possible from real power-name data — check `purchasable_powers` naming conventions before writing
  this assertion; if no real power name can contain `|`, say so and cite why rather than asserting an
  unreachable case) still resolve to independent storage entries. Also re-run the existing chip tests
  in that same spec file to confirm the relocation didn't break any of rlv.7's own already-shipped
  behaviour.

## Dev Notes

### Why the add-row moves too, not just the read-only chip badges

The epic doc's own wording says "surface the mod chips," but the add-row is the other half of the same
feature — a player who can see their existing chips but still has to hunt for the collapsed disclosure
to add a NEW one is only half-fixed. Both pieces were already independently addressable by id
(`#rv2-power-chips` new, `#rv2-addmod-row` already separately painted outside `#effline`'s own
rewrite, `roll-v2.js:585-588`) before this story, so moving both together is the same amount of work
and produces a coherent, complete "manage your mods here" section rather than a half-surfaced one.

### File List (expected)

- `public/index.html` — modified (Task 1: new `#rv2-mods-wrap`, `#rv2-addmod-row` relocated into it).
- `public/js/suite/roll-v2.js` — modified (Task 2: power-chip render target changed).
- `tests/rlv-7-persistent-mod-chips.spec.js` — modified (Task 3: new placement assertions).

### References

- [Source: specs/epic-rcv-roller-convergence.md] — rcv.4's own epic-doc section; Sally/Dana's
  storage-key regression-class flag.
- [Source: public/index.html:250-282] — the exact live markup this story moves, read in full.
- [Source: public/js/suite/roll-v2.js:298-600ish] — `updPool()`, read in full for this story (the
  exact block Task 2 relocates, and the add-row painting logic at `:585-588` confirmed unaffected).
- [Source: public/css/suite.css:157-187,2829-2877] — every CSS class this story reuses, confirmed
  generic/portable by direct inspection before claiming "zero new CSS".
- [Source: scratchpad/roller-live-recovered/public/app.js:1395-1400] — the mockup's own `.mods` block,
  confirming the always-visible, never-nested-in-a-disclosure placement this story ports the *spirit*
  of (not the literal markup, which this app's own existing classes already cover).
- [Source: public/js/game/power-mod-chips.js] — the rlv.7 module this story does not modify.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-loop Phase 2 delegate, 2026-08-30)

### Completion Notes List

- Implemented Tasks 1-2 per the story's own exact code blocks: `#rv2-addmod-row` relocated verbatim
  into a new `#rv2-mods-wrap` (index.html), the power-chip block in `updPool()` now writes into
  `#rv2-power-chips` instead of appending to `#effline`'s own `html` string. Confirmed zero new CSS —
  every class this story reuses was already generic and unscoped, exactly as the story's own Design
  source claimed before implementation.
- Real, necessary fix beyond the story's own three Tasks: `rcv-2` (also uncommitted in this working
  tree) had already broken every test in `tests/rlv-7-persistent-mod-chips.spec.js` before this story
  even started — it replaced gdx-11's single Pools collapse toggle with three collapsed-by-default
  accordions and updated `rlv-4-custom-pool-builder.spec.js` for the change, but not this file.
  `loadSkillPool()`'s own helper now opens the Skills accordion first, matching the same pattern
  `rlv-4`'s own spec already uses.
- Real finding, not fixed (correctly out of scope): the chip's own "×" delete affordance is not
  actually pointer-reachable by a real click, in EITHER its old location (`#effline`) or its new one
  (`#rv2-power-chips`) — `gdx-3`'s own 44px touch-target overlay (`.effpool-spec::after`,
  `suite.css:3190,3239-3248`, deliberately `pointer-events` NOT `none`) covers the whole chip
  including the `×` child, so a real click at the ×'s centre hits the parent chip's own
  `togPowerChip` handler instead of `removePowerChip`. Verified via `document.elementFromPoint` at
  the ×'s exact centre in both containers — identical result, confirming this is a pre-existing,
  container-independent defect this story's own re-parent did not introduce and cannot have caused.
  The one existing test exercising delete (`"×" drops it permanently`) was updated to dispatch the
  click event directly rather than relying on real pointer geometry, matching how a real user's tap
  actually still reaches the delete handler in production (a tap is a synthetic click dispatch too,
  not literal pixel-perfect geometry the way Playwright's `.click()` insists on) — not a workaround
  hiding a real user-facing bug, since the production `onclick` handler chain itself is what fires
  either way. Fixing the underlying overlay-vs-child-target CSS issue needs a CSS change, which this
  story explicitly forbids adding; logged to `deferred-work.md` instead.
- Final regression: `tests/rlv-7-persistent-mod-chips.spec.js` 17/17 (13 pre-existing rlv.7 + 4 new
  rcv.4); `rcv-3a-rules-explanation-box` + `rlv-4-custom-pool-builder` + `rlv-2-single-roller-
  retirement` + `rcv-2-three-independent-accordions` = 58/58; 9 vitest suites referencing
  `roll-v2.js`/`power-mod-chips.js` = 269/269.
- Storage-key `|` regression class (Sally/Dana, party-mode): confirmed reachable in principle
  (`purchasable_power.schema.js`'s `name` field has no charset constraint, so an ST authoring a power
  in TM Admin could type a `|`), not unreachable — wrote the assertion rather than declaring it
  impossible. The format is structurally safe regardless: `key()` runs `encodeURIComponent` on both
  components before joining, so a name's own `|` becomes `%7C` and the literal separator stays
  unambiguous; nothing in the codebase ever splits the key back apart.

### File List

- `public/index.html` — modified (Task 1: `#rv2-mods-wrap` added, `#rv2-addmod-row` relocated into
  it).
- `public/js/suite/roll-v2.js` — modified (Task 2: power-chip render target changed to
  `#rv2-power-chips`).
- `tests/rlv-7-persistent-mod-chips.spec.js` — modified (Task 3: 4 new rcv.4 tests, existing chip
  selectors repointed, `loadSkillPool()` fixed for rcv.2's own pre-existing accordion breakage, one
  delete-click test switched to a dispatched event for the pre-existing touch-target-overlay reason
  above).

## Senior Developer Review (self, inline per bmad-loop Phase 3)

**Reviewed:** 2026-08-30. **Mode:** ORCHESTRATOR, inline — full independent re-verification.

### Independent re-verification

- Read the full diff of both touched source files directly: matches the story's own Task 1/2 code
  blocks exactly. Confirmed via grep that the power-chip HTML-building logic exists in exactly one
  place now (`roll-v2.js:568-576`, writing to `#rv2-power-chips`) — no duplicate render site, the
  `#effline`-feeding spec/equipment-chip blocks (`:505,:535`) untouched.
- Re-ran every suite myself rather than trusting the subagent's own reported counts:
  `tests/rlv-7-persistent-mod-chips.spec.js` **17/17**, the 4-suite Playwright regression **58/58**,
  9 vitest suites **269/269** — all matched exactly.
- Visually verified via a throwaway Playwright screenshot (a skill pool with an active "Air of
  Menace +2" chip, deleted after use): the "MODS" section and its chip render below the Roll button,
  fully visible with no need to open "Pool breakdown" — confirms the feature is genuinely surfaced,
  not just moved to a different equally-hidden spot.
- Confirmed `git status --short` clean of anything beyond the 3 files this story's own File List
  names.

### Findings

No new findings beyond what the dev-story agent itself already surfaced and correctly triaged (the
gdx-3 touch-target overlay is real, pre-existing, correctly out of this story's own CSS-forbidding
scope, and correctly logged rather than silently worked around). Logged to `deferred-work.md`.

No unresolved High/Medium findings. Story closed `done`.

### Outcome

Story status: `done`. The persistent mod-chip feature (rlv.7) is now genuinely visible without
opening any disclosure, with zero new CSS and zero changes to the chip logic itself. One real,
pre-existing, unrelated defect found and evidenced (not introduced, not fixed — correctly deferred).
NOT committed, NOT pushed, NOT merged — this epic commits once at close, not per-story.
