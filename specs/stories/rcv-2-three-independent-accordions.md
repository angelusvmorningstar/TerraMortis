# Story rcv.2: Skills / Disciplines / Special as three independent accordions

Status: done

## Story

As an ST or player using the Roll tab's pool picker,
I want Skills, Disciplines, and Special (Vampire Mechanics) to each collapse and expand on their own,
so that I can open just the section I need without one shared toggle forcing everything else open or
closed with it, and without Special permanently occupying screen space I'm not using right now.

## Design source — read before Task 1

Per this epic's own standing rule (`specs/epic-rcv-roller-convergence.md`'s Locked Decisions,
[[feedback-reference-real-mockup-not-reinvented-design]]): this story is grounded directly in
`scratchpad/roller-live-recovered/public/app.js`/`app.css` (the recovered dev-server prototype),
read in full at the exact cited lines below — not a recap, not an inference from the epic doc's own
prose summary of it.

- **State shape** — `app.js:237`: `sectionOpen: { secQueue: true, secSkills: false, secDisc: false,
  secSpecial: false }`. Queue is CRD's own contested-roll inbox (out of scope here — see "What this
  story is NOT").
- **Markup shape** — `app.js:1799-1822` (the four `.picker-section` blocks) and `app.js:2130-2134`
  (the toggle handler):
  ```js
  appEl.querySelectorAll('[data-toggle]').forEach(function (head) {
    head.addEventListener('click', function () {
      var id = head.getAttribute('data-toggle');
      state.sectionOpen[id] = !state.sectionOpen[id];
      render();
    });
  });
  ```
  Each section is fully independent — a plain per-id boolean flip on one shared state object, no
  "close the others" logic, no accordion-group exclusivity.
- **CSS** — `app.css:160-179` (`.picker`, `.picker-section`, `.picker-head`, `.picker-head-label`,
  `.picker-count`, `.chevron`, `.picker-body-wrap`, `.picker-body`, `.picker-body-inner`). Confirmed
  during this story's own design-lock pass: every custom property the mockup's CSS reads
  (`--bdr`, `--radius-md`, `--surf`, `--control-height-sm`, `--fl`, `--txt`, `--txt3`,
  `--type-size-heading`, `--type-size-micro`, `--type-weight-strong`, `--type-weight-label`) already
  exists verbatim in `public/css/theme.css` — this mockup was built against this app's own real
  design system, so the animation/spacing model ports directly, only the selector names change to
  this file's own `gcp-` prefix convention (see Task 3).
- **Custom Pool relocates out of the accordion group entirely** — `app.js:1825`:
  ```js
  '<button class="freebuild-btn" id="freeBuildBtn" type="button">Free Build</button>'
  ```
  rendered immediately AFTER the closing `</div>` of `.picker`, not inside any section. `app.css:238`'s
  own comment: *"Free Build entry point — the compositional builder (attribute + skill + discipline),
  distinct from the curated pool list above it."* This is today's live "+ Custom Pool" tile's mockup
  counterpart — same job (opens the Attribute×Skill×Discipline builder panel, unchanged by this
  story), different position: a full-width dashed-border button below the three accordions, not a
  grid tile living inside Disciplines' section the way it does today. **Label decision (this story's
  own call, not silently copied from the mockup):** keep the existing "+ Custom Pool" copy rather than
  renaming to "Free Build" — the panel this button opens is internally `openPanel('custom')`, titled
  "Custom Pool" in its own header (`rlv.4`, unchanged), and matching that internal name avoids a
  button/panel-title mismatch the mockup's own vocabulary never had to deal with. Port the *chrome*
  (dashed border, standalone full-width button, distinct from the tile grid) and the *position*
  (outside the accordion group), not the *word*.

## Acceptance Criteria

1. `char-pools.js`'s pools area renders as three independent accordion sections — Skills,
   Disciplines, Special (Vampire Mechanics) — each with its own open/closed state, a chevron that
   rotates on open, and a count badge showing how many pool tiles are inside. **All three default to
   closed** on first render for a given (character, device) — no section is open-by-default,
   including Special, which today never collapses at all. This is a deliberate behaviour change from
   today's always-visible Vampire Mechanics heading, sourced directly from the mockup's own
   `secSpecial: false` default — not an oversight.
2. Each section's open/closed state is independent: opening Skills does not close Disciplines or
   Special, and vice versa. No shared "collapse everything" toggle remains.
3. The existing rank-gate filter on the Disciplines section (today at `char-pools.js:196-206` —
   `discEntries` only includes disciplines with `dots > 0`, `ruledPowers` only includes powers whose
   `rank <= v.dots`) is untouched and still applies inside the new Disciplines accordion. This is the
   one thing John flagged by name during scoping as easy to lose in a restructure — call it out
   explicitly in the PR/review, don't just trust the diff.
4. The "+ Custom Pool" tile moves out of the pools grid entirely into its own standalone button
   below the three accordions, always visible regardless of any section's open/closed state (matching
   the mockup's `freeBuildBtn` placement — see Design source above). Tapping it still calls the same
   existing `openPanel('custom')` flow (rlv.4) — no behaviour change to what it does, only where it
   sits and how it's styled (full-width, dashed border, distinct from a grid tile).
5. Each section's open state persists per-section across a re-render (character switch, roll,
   character reload) via independent `localStorage` keys — `tm_pools_open_skills`,
   `tm_pools_open_disc`, `tm_pools_open_special` — mirroring `tm_pools_collapsed`'s own existing
   `stored === null → default` pattern (gdx-11, AC9): `null` (never touched on this device) means
   closed; an explicit prior `'1'` means open.
6. **State-shape decision (Winston, party-mode — resolved here, not left implicit):** the old single
   `tm_pools_collapsed` key is retired outright, not migrated. Its value is never read again by this
   story's code. A user who previously had it un-collapsed (`'0'`) sees all three new sections default
   to closed on their next load — a silent reset to the new three-key default, not a migration. This
   matches the precedent gdx-11 itself already set (AC9 flipped the *old* single toggle's own default
   from expanded to collapsed with no migration path), so this is a repeat of an already-accepted
   pattern, not a new kind of behaviour change.
7. Every existing pool tile — skill tiles, discipline/devotion/rite tiles, the five current
   Vampire Mechanics tiles (Frenzy Resistance, Lash Out, Clash of Wills, Blood Bond Resistance,
   Humanity Check — rcv.1's own current, already-shipped state), and their tap→roll/tap→panel/
   tap→submit behaviour — is unchanged by this story. This is a container/chrome restructure only; no
   pool math, no `pi` shape, no `onTap` routing changes.
8. Count badges show the real tile count per section at render time (e.g. Skills shows the number of
   non-zero skill tiles, Disciplines the number of rollable discipline/devotion/rite tiles after the
   rank-gate filter, Special the fixed count of Vampire Mechanics tiles) — not a hardcoded number.
9. Dead CSS this restructure directly creates is removed, not left behind: `.gcp-section-hd`,
   `.gcp-collapse-btn` (including its two entries inside the shared touch-target selector lists at
   `suite.css:3060` and `suite.css:3135` — remove `.gcp-collapse-btn` from those two comma-separated
   lists, do not touch the other class names sharing those rules), `.gcp-pools-wrap`, and
   `.gcp-all-collapsed` (both its own rule and its two combinator rules `.gcp-all-collapsed
   .gcp-pool-grid` / `.gcp-all-collapsed .gcp-section-hd`) all become fully unreferenced by this
   story's own change — confirmed via grep (`grep -rn "gcp-section-hd\|gcp-collapse-btn\|gcp-pools-wrap\|gcp-all-collapsed" public/`)
   before deleting, not assumed. `.gcp-pool-grid` itself stays — every accordion body still uses it
   for its own tile grid.

## What this story is NOT

- **Not** the Queue accordion (`secQueue` in the mockup) — that's Epic CRD's own contested-roll
  inbox, a separate epic. Don't port it.
- **Not** a Rules-explanation box for any pool type — that's rcv.3a/3b/3c, later in this epic,
  depends on this story landing first.
- **Not** a change to any pool's dice math, `pi` shape, or roll/panel/submit routing — pure container
  restructure.
- **Not** a copy change to the Custom Pool button's label (see Design source above — deliberately
  kept as "+ Custom Pool").

## Tasks / Subtasks

- [ ] Task 1 (AC1, AC2, AC5, AC6, AC8) — `public/js/game/char-pools.js`: restructure
  `renderCharPools()`'s pools area into three accordion sections.
  - Replace the current three separate render blocks (Vampire Mechanics at ~line 106-166, Skill Pools
    at ~line 168-194, Discipline Pools at ~line 195-219) and the single collapse-toggle wrap at
    ~line 231-250 with a small local helper that builds one `.gcp-acc-section`, reused three times:
    ```js
    function accordionSection(id, label, count, bodyHtml, storageKey) {
      const stored = localStorage.getItem(storageKey);
      const open = stored === '1'; // null (never touched) or '0' -> closed, matches gdx-11's own default-closed precedent
      return `<div class="gcp-acc-section" data-open="${open}" data-storage-key="${storageKey}">` +
        `<button class="gcp-acc-head" data-acc-toggle="${id}" type="button" aria-expanded="${open}">` +
        `<span class="gcp-acc-label">${esc(label)} <span class="gcp-acc-count">${count}</span></span>` +
        `<span class="gcp-chevron"></span></button>` +
        `<div class="gcp-acc-body-wrap"><div class="gcp-acc-body"><div class="gcp-acc-body-inner">${bodyHtml}</div></div></div>` +
        `</div>`;
    }
    ```
  - Build `vmHtml` (Special), `skillHtml` (Skills), `discHtml` (Disciplines) exactly as today — no
    change to the tile-building loops themselves, only to what wraps them.
  - Emit the three sections in order Skills, Disciplines, Special (matching the mockup's own
    `secSkills`/`secDisc`/`secSpecial` order) via `accordionSection(...)`, each only if it has
    content (an empty Skills/Disciplines section for a character with none is still worth showing
    per today's existing behaviour — confirm against current `if (skillHtml || discHtml ||
    customHtml)` gate whether an empty section should render at all; Special always has content
    since Frenzy Resistance/Humanity Check etc. are unconditional).
  - Wire the click handler once, after `el.innerHTML = h`, alongside the existing
    `.gcp-pool-btn`/`.gcp-collapse-btn` wiring block (~line 255-270):
    ```js
    el.querySelectorAll('[data-acc-toggle]').forEach(head => {
      head.addEventListener('click', () => {
        const section = head.closest('.gcp-acc-section');
        const key = section.dataset.storageKey;
        const nowOpen = section.dataset.open !== 'true';
        section.dataset.open = String(nowOpen);
        head.setAttribute('aria-expanded', String(nowOpen));
        localStorage.setItem(key, nowOpen ? '1' : '0');
      });
    });
    ```
    Toggling in place (no full re-render) avoids re-computing every pool/tile on a pure open/close
    tap — matches this file's existing pattern of a lightweight DOM-only toggle for the old
    `.gcp-collapse-btn` handler, just applied per-section now instead of once globally.
  - Remove the old `tm_pools_collapsed` read/write entirely (AC6) — do not leave it as dead code, do
    not add a migration read.

- [ ] Task 2 (AC4) — relocate Custom Pool: build the `customHtml` tile's replacement as a standalone
  button rendered after the three accordion sections, not inside the Disciplines accordion's body:
  ```js
  h += '<button class="gcp-freebuild-btn" data-idx="' + customIdx + '" type="button">+ Custom Pool</button>';
  ```
  Push `{ opensPanel: 'custom', label: '+ Custom Pool' }` to `pools[]` exactly as today (unchanged
  index-based click wiring — it's still just another `.gcp-pool-btn`-equivalent target;
  `el.querySelectorAll('.gcp-pool-btn')` at the click-wiring block needs `.gcp-freebuild-btn` added to
  its selector, or a second small wiring line, so `onTap(pools[idx])` still fires for it).

- [ ] Task 3 (AC1, AC9) — `public/css/suite.css`: add the accordion CSS, ported from the mockup's
  `app.css:160-179` with this file's own `gcp-` naming and this app's own real theme tokens (already
  confirmed present — see Design source above):
  ```css
  .gcp-accordions{display:flex;flex-direction:column;gap:8px;margin-bottom:8px;}
  .gcp-acc-section{border:1px solid var(--bdr);border-radius:var(--radius-md);background:var(--surf);overflow:hidden;}
  .gcp-acc-head{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:var(--control-height-sm);padding:0 12px;cursor:pointer;}
  .gcp-acc-label{font-family:var(--fl);font-size:var(--type-size-heading);font-weight:var(--type-weight-strong);color:var(--txt);}
  .gcp-acc-count{font-family:var(--fl);font-size:var(--type-size-micro);font-weight:var(--type-weight-label);color:var(--txt3);margin-left:6px;}
  .gcp-chevron{width:9px;height:9px;border-right:2px solid var(--txt3);border-bottom:2px solid var(--txt3);transform:rotate(45deg);transition:transform .18s ease;flex:none;}
  .gcp-acc-section[data-open="true"] .gcp-chevron{transform:rotate(-135deg);}
  .gcp-acc-body-wrap{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s ease;}
  .gcp-acc-section[data-open="true"] .gcp-acc-body-wrap{grid-template-rows:1fr;}
  .gcp-acc-body{overflow:hidden;min-height:0;}
  .gcp-acc-body-inner{padding:8px 10px 10px;}
  .gcp-freebuild-btn{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;display:flex;align-items:center;justify-content:center;width:100%;min-height:var(--control-height-md);border-radius:var(--radius-md);border:1px dashed var(--bdr3);background:transparent;color:var(--accent);font-family:var(--fl);font-size:var(--type-size-subheading);font-weight:var(--type-weight-strong);letter-spacing:.02em;text-transform:uppercase;transition:background .15s ease,border-style .15s ease;margin-top:4px;}
  .gcp-freebuild-btn:hover{background:color-mix(in srgb, var(--accent) 8%, transparent);border-style:solid;}
  .gcp-freebuild-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
  ```
  Verify `--accent` and `--type-size-subheading` also exist in `theme.css` before using them (not
  independently confirmed during this story's own design-lock pass, unlike the tokens listed under
  Design source above — check before Task 3, not after).
  Then delete (AC9): the standalone `.gcp-section-hd`, `.gcp-collapse-btn`, `.gcp-all-collapsed
  .gcp-pool-grid`, `.gcp-all-collapsed .gcp-section-hd` rules; remove `.gcp-collapse-btn` (only) from
  the two shared touch-target selector lists at `suite.css:3060` and `suite.css:3135`.

- [ ] Task 4 (testing) — Playwright coverage, following `tests/rlv-4-custom-pool-builder.spec.js`'s
  house style (`window.pickChar(c)` injection, `serviceWorkers: 'block'`,
  [[project-sw-leaks-live-data-in-playwright-tests]]). At minimum: each of the three sections opens
  independently and does not affect the other two's state; a section's open state survives a
  character switch/re-render (localStorage round-trip); the Disciplines section still respects the
  rank-gate filter (a character with a discipline dot below a power's rank does not show that power's
  tile); the Custom Pool button opens the same `openPanel('custom')` flow as before, from its new
  position outside the accordions. Also re-run `tests/rlv-4-custom-pool-builder.spec.js` itself as a
  regression check (it renders and clicks the Custom Pool tile, so it is the spec most likely to break
  from this story's own DOM restructure) and the vitest suites that read `char-pools.js`'s source
  (`gdx-11-vampire-mechanics-quick-actions.test.js`, `issue-879-defence-penalty-wirein.test.js`).

## Dev Notes

### Why per-section toggle-in-place instead of a full re-render

The mockup's own toggle handler (`app.js:2130-2134`) calls a full `render()` on every open/close tap,
because that codebase's `render()` is cheap and idempotent (it's a from-scratch prototype with no
existing DOM-diffing discipline). This app's `renderCharPools()` recomputes every pool's dice math,
rank-gate filtering, and tile markup from character state on every call — calling it just to flip one
chevron would be wasteful and would also re-attach every click handler needlessly. The toggle handler
in Task 1 instead flips `data-open`/`aria-expanded`/the CSS custom property purely in the DOM plus a
`localStorage` write, matching this file's own existing `.gcp-collapse-btn` handler's already-shipped
lightweight-toggle pattern (today's `el.querySelector('.gcp-collapse-btn')?.addEventListener(...)`) —
this story extends that existing pattern per-section rather than reintroducing the mockup's own
heavier full-render approach.

### File List (expected)

- `public/js/game/char-pools.js` — modified (accordion restructure, Custom Pool relocation, dead
  `tm_pools_collapsed` code removed).
- `public/css/suite.css` — modified (new accordion + freebuild-btn rules added; dead
  `.gcp-section-hd`/`.gcp-collapse-btn`/`.gcp-pools-wrap`/`.gcp-all-collapsed` rules removed,
  `.gcp-collapse-btn` removed from the two shared touch-target selector lists).
- A new Playwright spec (Task 4) — e.g. `tests/rcv-2-three-independent-accordions.spec.js`.

### References

- [Source: specs/epic-rcv-roller-convergence.md] — rcv.2's own epic-doc section, John's rank-gate
  flag, Winston's state-shape flag, the Queue out-of-scope note.
- [Source: scratchpad/roller-live-recovered/public/app.js:237,1799-1830,2130-2134] — read in full for
  this story's own design-lock pass.
- [Source: scratchpad/roller-live-recovered/public/app.css:160-179,238-250] — read in full for this
  story's own design-lock pass.
- [Source: public/js/game/char-pools.js] — read in full for this story (current live structure).
- [Source: public/css/suite.css:889-893,3060,3135] — the exact live rules this story retires.
- [Source: specs/stories/rlv-4-port-builder-ux-into-unified-roller.md] — the Custom Pool builder's
  own original story; this story does not touch its panel logic, only where its entry tile lives.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-epic-loop Phase 2 delegate, 2026-08-30)

### Completion Notes List

- Implemented per the story's own pre-worked spec (Tasks 1-3): renderCharPools() restructured so
  vmHtml/vmCount are built exactly as before but hoisted out to become the Special accordion's body;
  a new accordionSection() helper renders all three sections into .gcp-accordions; the old single
  tm_pools_collapsed toggle and its handler deleted outright (AC6); Custom Pool relocated to a
  standalone .gcp-freebuild-btn after the accordion group (AC4), keeping the existing label per the
  story's own locked decision.
- Task 4 (testing): new tests/rcv-2-three-independent-accordions.spec.js, 19 tests. Also updated, as
  an unavoidable consequence of this story's own DOM restructure (flagged rather than silently done):
  tests/rlv-4-custom-pool-builder.spec.js (7 .gcp-choice-wide selectors changed to .gcp-freebuild-btn,
  the "expand the collapsed Pools section" helper step removed since the button is now unconditionally
  visible) and tests/desktop-and-css.spec.js (one retired touch-target probe entry for the deleted
  .gcp-collapse-btn, with an explanatory comment).
- Real technique finding worth carrying into rcv.3a/3b/3c: the grid-template-rows 0fr-to-1fr collapse
  animation clips via overflow:hidden, and Playwright's toBeVisible() ignores ancestor clipping - a
  tile inside a closed section still reports "visible" to a naive assertion. The new spec asserts on
  the clipped body's rendered height instead. This also means collapsed content stays
  keyboard-focusable, inherent to the animation technique itself (ported unchanged from the mockup),
  not something this story introduced or could avoid without abandoning the technique.
- Three real discrepancies found between the story's own citations and actual current state, all
  confirmed independently during review (see below) rather than taken on the implementer's word:
  1. suite.css:889-893 - the retired rules are actually 889-892; line 893 is .gcp-pool-grid, which
     AC9 already correctly said should stay.
  2. .gcp-pools-wrap was listed in AC9/the File List for CSS deletion but never had a CSS rule of its
     own - confirmed via grep, nothing to delete in suite.css (it only ever existed as a class name in
     char-pools.js's own markup, removed there with the wrapper).
  3. AC7's own prose said "the four remaining Vampire Mechanics tiles" then named five - corrected in
     this file (see AC7 above) to "five", the real, current, already-shipped count.
- One judgement call flagged for review rather than made silently: section labels use the mockup's own
  verbatim wording (Skills, Disciplines, Special) rather than today's live headings (Skill Pools,
  Discipline Pools, Vampire Mechanics). Resolved in review below rather than left open.
- .gcp-choice-wide (CSS) and choiceBtn()'s own wide parameter are now dead code (Custom Pool was their
  only caller) but were not named in AC9's own deletion list, and removing them would also require
  editing rlv-4-custom-pool-builder.spec.js's own CSS-presence smoke test - judged real scope creep
  beyond this story's stated boundary, logged to deferred-work.md instead of silently expanding scope.

### File List

- public/js/game/char-pools.js - modified (Task 1: accordion restructure, accordionSection() helper,
  per-section toggle handler; Task 2: Custom Pool relocated to .gcp-freebuild-btn; old
  tm_pools_collapsed code removed).
- public/css/suite.css - modified (Task 3: accordion + freebuild-btn rules added; dead
  .gcp-section-hd/.gcp-collapse-btn/.gcp-all-collapsed rules removed, .gcp-collapse-btn removed from
  the two shared touch-target selector lists).
- tests/rcv-2-three-independent-accordions.spec.js - new (19 tests).
- tests/rlv-4-custom-pool-builder.spec.js - modified (7 selector updates + 1 helper-step removal,
  consequence of this story's own DOM restructure, no behaviour assertion altered).
- tests/desktop-and-css.spec.js - modified (1 retired touch-target probe entry, with a comment).

## Senior Developer Review (self, inline per epic-loop Phase 3)

Reviewed 2026-08-30. Mode: ORCHESTRATOR, inline - full independent re-verification, not a
trust-the-subagent-report pass. Re-ran every test suite personally rather than accepting the dev-story
agent's own reported numbers; read the full diff of every changed file directly before accepting any
of it.

### Independent re-verification

- git status/git diff --stat confirmed nothing staged or committed, and confirmed the change surface
  matched exactly what the story scoped (2 source files, 2 pre-existing test files touched as a
  documented consequence, 1 new test file) - no surprise files.
- Read public/js/game/char-pools.js's full diff and public/css/suite.css's full diff directly -
  matches the story's own Tasks 1-3 code blocks closely, no unrequested behaviour change found (pool
  math, pi shapes, and onTap routing are byte-identical to before).
- Re-ran tests/rcv-2-three-independent-accordions.spec.js plus tests/rlv-4-custom-pool-builder.spec.js
  together independently: 31/31 passed.
- Re-ran server/tests/gdx-11-vampire-mechanics-quick-actions.test.js plus
  server/tests/issue-879-defence-penalty-wirein.test.js independently: 90/90 passed.
- Re-ran the specific tests/desktop-and-css.spec.js tests affected by the retired touch-target probe
  (-g "gdx-3 AC1", 3 tests) independently, both with the change applied (3/3 passed) and stashed back
  to base (3/3 passed, identical) - confirms the removed .gcp-collapse-btn probe was not masking a
  real regression, it genuinely has nothing left to measure.
- Visually verified live via a throwaway Playwright screenshot script (character with 5 skills, 2
  disciplines, deleted after use): confirmed all-closed default state, independent opening (Skills
  stays open while Special is also opened), correct tile counts in each badge, and the Custom Pool
  button rendering as a standalone dashed button below both accordions, exactly as designed.

### Findings and resolutions

1. Section label wording (flagged by the implementer, resolved here). The mockup Angelus personally
   built uses Skills/Disciplines/Special; today's live app uses Skill Pools/Discipline Pools/Vampire
   Mechanics. Resolution: keep the mockup's own wording, per Angelus's own explicit standing
   instruction this epic operates under (make sure to reference the mock up at the design phase for
   each of these) - that instruction is itself the answer to "which source wins" for exactly this kind
   of question, not a case-by-case judgement call to make freshly each time. This does drop "Vampire
   Mechanics" as visible UI copy (the section is now labelled "Special"); flagged explicitly here
   rather than only in a code comment, since it is a real, visible copy change a returning player will
   notice. Easily revertable if wrong - a one-word change, not a re-architecture.
2. Three citation discrepancies (AC7's tile count, the suite.css line-range off-by-one, the phantom
   .gcp-pools-wrap CSS rule) - all confirmed genuinely minor documentation drift in the story as
   written, not implementation defects. Corrected AC7's wording in this file; the other two were
   already correctly handled by the implementer (deleted what actually existed, not what the story's
   line numbers implied).
3. .gcp-choice-wide/wide param now dead, correctly deferred rather than folded in - agreed with the
   implementer's own scope call; logged to deferred-work.md.

No unresolved High/Medium findings. Story closed done.

### Outcome

Story status: done. All ACs verified against the real diff and live-rendered output, not just the
implementer's own report. NOT committed, NOT pushed, NOT merged - this epic commits once at close
(bmad-epic-loop's own per-epic cadence), not per-story.
