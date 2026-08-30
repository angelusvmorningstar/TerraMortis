# Story rcv.3a: Rules-explanation box — Disciplines / Rites (+ Devotions/Pacts, same code path)

Status: done

## Story

As an ST or player with a discipline, rite, devotion, or pact power loaded on the Roll tab,
I want to see what the power actually does — its cost, action type, duration, and full rules text —
without leaving the Roll tab or hunting through a sourcebook,
so that I can resolve an unfamiliar power correctly in the moment, at the table.

## Design source — read before Task 1

Per this epic's own standing rule ([[feedback-reference-real-mockup-not-reinvented-design]]): grounded
directly in the recovered mockup, AND in a real, already-shipped piece of this app's own
infrastructure the epic's own scoping round never checked for. Both matter — read both before Task 1.

### 1. The mockup's own shape

`scratchpad/roller-live-recovered/public/app.js:1225-1240` (the generic `power` kind) and
`app.css:435-461`. The box is a `<details class="rules-summary">`, collapsed by default (open in the
mockup only for demo visibility — this epic already ruled the real shipped default is collapsed, to
match rcv.2's own accordions), containing:
- a `<summary>` with the label "Rules explanation", a compact cost line (`power-cost`), and a chevron;
- a body with a `power-meta` line (bullet-separated short facts — action/duration/etc) and a
  `power-desc` paragraph (the power's effect text).

Every CSS custom property this block reads (`--bdr2`, `--radius-lg`, `--surf2`,
`--control-height-sm`, `--fl`, `--type-size-heading`, `--type-weight-strong`, `--accent`,
`--type-size-label`, `--type-weight-label`, `--type-letter-spacing-label`, `--crim2`,
`--type-size-caption`, `--txt2`, `--bdr3`, `--type-size-body`, `--ft`) is confirmed present verbatim
in `public/css/theme.css` — this ports directly, class names and all (no live collision — confirmed
via grep — so this story keeps the mockup's own naming, `rules-summary`/`power-name`/`power-cost`/
`power-meta`/`power-desc`, rather than adopting `char-pools.js`'s own `gcp-` prefix, since this
component lives outside that file entirely — see §2 below).

### 2. Real finding: this app already has a shared "full rules text" component, and the epic's own
scoping never mentioned it

`public/js/shared/rules-text.js` (issue #994) exports `renderRulesExpander(id, rulesText, rulesSource,
opts)` — a stateless, XSS-safe, already-styled (`public/css/components.css:806-816`,
`.rules-expander`/`.rules-expander-toggle`/`.rules-expander-body`) collapsed toggle that renders a
power's real, page-cited rulebook text (`purchasable_powers.rules_text` + `rules_source`, uplifted
from the actual sourcebooks by issue #992's own migration, `server/scripts/uplift-power-rules-text.js`).
It is **already live and working today** — `public/js/suite/sheet.js:558,599,628,650` uses it on the
character Sheet tab for Powers/Devotions/Rites/Pacts drawers. The epic doc's own rcv.3a/rcv.3c
scoping cited only `getPool()`'s `cost/action/duration/description` fields and never mentioned
`rules_text`/`rules_source`/`renderRulesExpander()` at all — a real gap in the original scoping round,
not a deliberate omission (confirmed: neither term appears anywhere in
`specs/epic-rcv-roller-convergence.md`).

**Coverage is genuinely uneven, which is exactly why this matters for the design, not just an
implementation detail:** issue #992's own dry-run report
(`server/scripts/reports/992-uplift-report.md`, 2026-07-15) recorded, at that snapshot: discipline 24
matched / 16 unmatched / 5 ambiguous / 5 skipped-Auspex (of 50 total per John's own earlier count);
rite 18 matched / 114 unmatched (of 132 total). Merged as PR #993, with at least one later per-power
top-up (`fix(#1013)`, Indomitable). Real current coverage is almost certainly better than the July
snapshot but is **not** complete — this is corroborated by `CLAUDE.md`'s own documented pre-existing
test gap (`issue-1013-indomitable-rules-text.test.js`, `markdown/` corpus not present in this
checkout) and is not something this story re-measures precisely; the design below simply does not
depend on the exact number, because `renderRulesExpander()` already self-guards (see below).

**Resolution — use both, together, safely:** `getPool()`'s `pi.effect`/`pi.action`/`pi.duration`/
`pi.cost` (near-100% coverage per John's own confirmed research) supply the *always-present* summary
(the mockup's own `power-meta`/`power-desc`); `pi.rules_text`/`pi.rules_source` supply the *full
citation* via `renderRulesExpander()` when available, appended after the summary. No missing-data
branch is needed for the rules-text half specifically — `renderRulesExpander()` already returns `''`
for empty/missing `rulesText` (`shared/rules-text.js:71-73`, its own documented contract: "Returns ''
... so call sites can splice the result in unconditionally without an extra branch"). This is a
straightforwardly better design than either source alone would have produced, and it reuses TWO
already-existing, already-correct pieces rather than inventing a third.

### 3. Where this lives — resolved by tracing the data flow, not assumed

The mockup's own `rulesHtml` is built once per **currently-selected pool** (`selected`, the mockup's
analogue to this app's `state.POOL_INFO`) and rendered in the same area as the mod/controls block
(`app.js:1244`, `rulesHtml + modsHtml + controlsHtml`) — **not** inside the picker grid itself (the
`.picker` accordions rcv.2 just built only ever show static, always-tappable tiles; they have no
concept of "currently loaded"). In this app, "currently loaded pool" state and its rendering already
live in `public/js/suite/roll-v2.js` — `loadPool(total, name, pi)` sets `state.POOL_INFO` and calls
`updPool()`, which repaints `#effline` (`public/index.html:254`, inside the existing `<details
class="rv2-breakdown">` "Pool breakdown" disclosure). **This story's box is a sibling disclosure to
`.rv2-breakdown`, not a change inside it** — "Pool breakdown" is dice-math (attribute + skill + mods);
"Rules explanation" is what the power *does*, a conceptually separate concern, matching the mockup's
own separate `rulesHtml` variable. Placed immediately **before** `.rv2-breakdown` in the markup,
matching the mockup's own vertical order (`rulesHtml` before `modsHtml`/`controlsHtml`).

**Static markup, painted once per `loadPool()` call, not on every `updPool()` repaint** — matching the
add-mod row's own already-established precedent (`public/index.html:255-257`'s own comment: "static
markup so `updPool()`'s own `#effline` innerHTML rewrite never touches ... these live inputs"). If this
box's HTML were rebuilt inside `updPool()` instead, its own open/closed state would silently collapse
every time a WP chip, Rote chip, spec, or equipment chip toggles (all of which call `updPool()`) —
a real, avoidable annoyance this story does not want to introduce.

## Acceptance Criteria

1. A new `<details class="rules-summary" id="rules-summary-box">` renders in `public/index.html`,
   immediately before the existing `<details class="rv2-breakdown">` (currently at index.html:252).
   Static markup (empty body, `style="display:none"` initially) — populated by JS, not server-rendered.
2. A new exported function in `roll-v2.js`, `updRulesSummary(pi)`, is called once from `loadPool()`
   (immediately after `state.POOL_INFO = pi`, before `updPool()` — not from inside `updPool()` itself,
   per the "static, painted once" design above).
3. When the loaded `pi` has none of `effect`/`action`/`duration`/`cost`/`rules_text` set (a Skill tile
   — pushes `pi: null` — Custom Pool, or a Vampire Mechanics tile — none of these build a `pi` with
   these fields, confirmed via a full sweep of every `loadPool()` call site in the codebase during
   review), the box is hidden (`display:none`) and its body is cleared. This is the only gating logic
   needed; it naturally excludes every pool type this epic has explicitly ruled out of scope (plain
   Skills — Angelus's own ruling this epic operates under — and the not-yet-covered Special tiles,
   `rcv.3c`'s own job). `rules_text` is in this list alongside the original four — **added during
   review** (see the Dev Agent Record) after the original four-field gate was found to silently hide
   a power whose only real content was its full rules text.
4. When the loaded `pi` has real power data, the box becomes visible (`display:''`) and its `open`
   attribute is explicitly reset to closed on every new load (a newly-loaded power never inherits the
   previous power's open/closed state).
5. The `<summary>` shows: a fixed label "Rules explanation" (a plain `.rules-summary-label` span —
   see Task 1's exact markup); a compact cost line, in its own `power-cost` span, built via
   `fmtCostLine()` (`suite/sheet-helpers.js`, gdx.6/#987 — this app's existing single source of truth
   for a power's cost line), with its `"Cost: "` prefix stripped; a chevron. **Corrected during
   review** (Acceptance Auditor): `fmtCostLine()`'s own real precedence prefers structured
   `vitae_cost`/`willpower_cost` FIRST and only falls back to the legacy free-text `cost` string when
   both are absent — the reverse of this AC's original wording, which had it backwards. The
   implementation's order is the correct one (it matches `spendableCost()`'s own spend-on-structured-
   fields-only convention, so the cost chip and the spend button now agree) — this AC's wording is
   corrected to match, not the code changed to match the AC. `fmtCostLine()` must be called with a
   `pi` object that actually carries `cost_note` for its middle precedence tier to be reachable —
   `getPool()` did not originally set this field (a review-fixed bug, see the Dev Agent Record).
6. The body shows, in order: a `power-meta` line listing `pi.action` and `pi.duration` (each only if
   present — skip silently, no "N/A" placeholder text, matching this codebase's own established
   defensive-render convention), a `power-desc` paragraph with `pi.effect` (only if present), then
   `renderRulesExpander('rules-summary-expander', pi.rules_text, pi.rules_source)` appended
   unconditionally (it self-guards to `''` when there's nothing to show). The visibility gate itself
   (AC3) must also treat `pi.rules_text` as "has content" — a power whose only real data is its full
   rules text must not be hidden just because it has no `effect`/`action`/`duration`/`cost` (a
   review-fixed bug, see the Dev Agent Record).
7. `renderRulesExpander` and `renderRulesText`'s own `toggleRulesText` global wiring (already
   idempotent — `shared/rules-text.js:106-108` — guards `typeof window !== 'undefined'`, safe to import
   from a second module) are imported into `roll-v2.js` from `../shared/rules-text.js`, alongside
   `esc` from `../data/helpers.js` (not currently imported there — add it to the existing
   `hasAoE`-carrying import line, `roll-v2.js:29`).
8. Existing pool-breakdown behaviour (`.rv2-breakdown`, `#effline`, the add-mod row, every
   spec/equipment/power chip) is unchanged — this story only adds a new sibling disclosure and calls
   `updRulesSummary()` from two places: `loadPool()` (the case this AC names), and also
   `resetRollPool()` — **corrected during review** (Acceptance Auditor) — since that function exists
   precisely to clear pool state on a character switch that has no immediate following `loadPool()`
   call, and `POOL_INFO` (what this box reads) is exactly the kind of state it clears. Leaving this
   box out of `resetRollPool()` would mean a stale power's rules stayed painted under a newly-switched
   character. The addition is correct; this AC's original wording just didn't say so.
9. CSS: `public/css/suite.css` gets the `rules-summary`/`rules-summary-head`/`rules-summary-body`/
   `power-cost`/`power-meta`/`power-desc` rules, ported near-verbatim from the mockup's own
   `app.css:435-461` (tokens already confirmed present — see Design source §1). `.rules-expander*`
   needs no new CSS — already fully styled in `components.css:806-816`.

## What this story is NOT

- **Not** a Rules-explanation box for plain Skills — Angelus's own explicit ruling this epic operates
  under (`specs/epic-rcv-roller-convergence.md`'s Locked Decisions). `pi: null` for skill tiles already
  makes this the natural default; do not add a skill-specific branch to work around it.
- **Not** `rcv.3b`'s own job: a dedicated "duration not specified" fallback string for Devotions
  specifically (48/54 missing `duration` per John's research) — this story's own AC6 already skips an
  absent field silently for every power type; `rcv.3b` decides whether Devotions specifically need
  something louder than silence. Don't pre-empt that decision here.
- **Not** `rcv.3c`'s own job: Special-tile (Vampire Mechanics) rules copy — those tiles' `pi` objects
  never carry `effect`/`action`/`duration`/`cost` at all (see AC3), so this box never appears for them;
  a separate, dedicated mechanism is `rcv.3c`'s to build.
- **Not** a re-measurement of exact current `rules_text` coverage percentages — the design does not
  need that number (see Design source §2's "self-guards" point); don't spend story time re-running
  the uplift script's dry-run for a number this story doesn't act on.
- **Not** a change to `getPool()`, `char-pools.js`, or any pool's `pi` shape — this story only reads
  fields `getPool()` already returns.

## Tasks / Subtasks

- [ ] Task 1 (AC1) — `public/index.html`: add the new disclosure immediately before the existing
  `<details class="rv2-breakdown">` (currently line 252):
  ```html
  <!-- rcv.3a: static markup, populated once per loadPool() call (not on every
       updPool() micro-repaint) so its own open/closed state survives mod/chip
       toggles - same pattern the add-mod row below already established.
       Hidden when the loaded pool has no rules data (skills, Custom Pool,
       Vampire Mechanics tiles - none of these set pi.effect/action/duration/cost). -->
  <details class="rules-summary" id="rules-summary-box" style="display:none">
    <summary class="rules-summary-head">
      <span class="rules-summary-label">Rules explanation</span>
      <span class="power-cost" id="rules-summary-cost"></span>
      <span class="chevron"></span>
    </summary>
    <div class="rules-summary-body" id="rules-summary-body"></div>
  </details>
  ```

- [ ] Task 2 (AC2, AC3, AC4, AC5, AC6, AC7) — `public/js/suite/roll-v2.js`:
  - Extend the existing import from `../data/helpers.js` (currently `import { hasAoE } from
    '../data/helpers.js';`, line 29) to add `esc`.
  - Add a new import: `import { renderRulesExpander } from '../shared/rules-text.js';`
  - Add a new exported function, placed near `loadPool()`:
    ```js
    // rcv.3a: Rules-explanation box for the currently-loaded pool. Static
    // container in index.html, painted here (once per loadPool() call) - NOT
    // from inside updPool(), which repaints far more often (every mod/chip
    // toggle) and would otherwise collapse this box's own open state on
    // every unrelated interaction.
    export function updRulesSummary(pi) {
      const box = document.getElementById('rules-summary-box');
      const hasRules = pi && (pi.effect || pi.action || pi.duration || pi.cost);
      if (!hasRules) {
        box.style.display = 'none';
        box.open = false;
        document.getElementById('rules-summary-body').innerHTML = '';
        return;
      }
      box.style.display = '';
      box.open = false; // never inherit the previous power's open state
      document.getElementById('rules-summary-cost').textContent = pi.cost || '';
      const meta = [];
      if (pi.action) meta.push(esc(pi.action));
      if (pi.duration) meta.push(esc(pi.duration));
      const metaHtml = meta.length ? `<div class="power-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>` : '';
      const descHtml = pi.effect ? `<p class="power-desc">${esc(pi.effect)}</p>` : '';
      const expanderHtml = renderRulesExpander('rules-summary-expander', pi.rules_text, pi.rules_source);
      document.getElementById('rules-summary-body').innerHTML = metaHtml + descHtml + expanderHtml;
    }
    ```
  - Call it from `loadPool()` (currently `roll-v2.js:220-249`), immediately after `state.POOL_INFO =
    pi || null;` (line 226): `updRulesSummary(state.POOL_INFO);`
  - **Cost-line format (AC5):** before hardcoding `pi.cost || ''`, check whether `pi.cost` is reliably
    populated for every power this box will show, or whether a fallback built from
    `pi.vitae_cost`/`pi.willpower_cost` is needed for some — read `getPool()`
    (`public/js/shared/pools.js:54-73`) again at implementation time; `pi.cost` is `rule.cost || null`
    directly from the rule doc, a legacy free-text field, separate from the newer structured
    `vitae_cost`/`willpower_cost` (gdx.6/gdx.7). If `pi.cost` is null but `vitae_cost`/`willpower_cost`
    are set, decide and document a fallback format rather than silently showing a blank cost line for
    a power that does have cost data, just not in the legacy field.

- [ ] Task 3 (AC9) — `public/css/suite.css`: add, ported from `app.css:435-461`:
  ```css
  .rules-summary{border:1px solid var(--bdr2);border-radius:var(--radius-lg);background:linear-gradient(180deg, var(--surf2), var(--surf));overflow:hidden;margin-bottom:8px;}
  .rules-summary-head{all:unset;box-sizing:border-box;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:var(--control-height-sm);padding:0 14px;}
  .rules-summary-head::-webkit-details-marker{display:none;}
  .rules-summary[open] .rules-summary-head{border-bottom:1px solid var(--bdr);}
  .rules-summary-label{font-family:var(--fl);font-size:var(--type-size-heading);font-weight:var(--type-weight-strong);color:var(--accent);}
  .rules-summary-head .chevron{margin-left:auto;width:9px;height:9px;border-right:2px solid var(--txt3);border-bottom:2px solid var(--txt3);transform:rotate(45deg);transition:transform .18s ease;flex:none;}
  .rules-summary[open] .rules-summary-head .chevron{transform:rotate(-135deg);}
  .rules-summary-body{padding:10px 14px 14px;display:flex;flex-direction:column;gap:6px;}
  .power-cost{font-family:var(--fl);font-size:var(--type-size-label);font-weight:var(--type-weight-label);letter-spacing:var(--type-letter-spacing-label);text-transform:uppercase;color:var(--crim2);white-space:nowrap;}
  .power-meta{display:flex;flex-wrap:wrap;gap:6px 10px;font-family:var(--fl);font-size:var(--type-size-caption);color:var(--txt2);}
  .power-meta span:not(:last-child)::after{content:'·';margin-left:10px;color:var(--bdr3);}
  .power-desc{margin:2px 0 0;font-family:var(--ft);font-style:italic;font-size:var(--type-size-body);color:var(--txt2);line-height:1.55;}
  ```
  Note: this story's own `.chevron` rule is scoped `.rules-summary-head .chevron` (not a bare
  `.chevron` class) to avoid colliding with rcv.2's own bare `.gcp-chevron` — deliberately NOT reusing
  that class name even though the visual is similar, since `.gcp-chevron`'s rotation selector is scoped
  to `.gcp-acc-section[data-open="true"]`, a different state-attribute contract than a native
  `<details open>` box uses.

- [ ] Task 4 (testing) — Playwright coverage, following the house style established this epic
  (`window.pickChar(c)` injection, `serviceWorkers: 'block'`). At minimum: loading a discipline power
  with real `rules_text` shows the box with a working expander toggle; loading one WITHOUT `rules_text`
  (real gap — pick a genuinely unmatched power, or a synthetic fixture) still shows the meta/desc
  summary with no expander rendered; loading a Skill or Custom Pool hides the box entirely; switching
  from a power with the box open to a different power resets it to closed; the box's own open state
  survives an unrelated `updPool()` repaint (toggle the WP chip while the box is open, confirm it's
  still open). Also re-run `tests/rlv-4-custom-pool-builder.spec.js` and
  `tests/rlv-2-single-roller-retirement.spec.js` as regression (both touch `roll-v2.js`/`loadPool()`
  directly).

## Dev Notes

### Why the summary line doesn't need a "missing field" placeholder

Every field this box reads (`pi.action`, `pi.duration`, `pi.cost`, `pi.effect`) is independently
optional and independently skipped when absent (AC6) — this matches `getPool()`'s own `?? null`/`||
null` conventions throughout `shared/pools.js` (nothing there ever fabricates a placeholder for a
missing rule-doc field) and this codebase's broader defensive-render convention (see `char-pools.js`'s
own `if (skillHtml)`/`if (discHtml)` gates from rcv.2). `rcv.3b` is where a LOUDER fallback (visible
"Duration not specified" text, not silence) gets decided for Devotions specifically, because that
story's own data shows silence would be misleading at a 48/54 miss rate — a judgement call for that
story to make deliberately, not one this story should pre-empt by choosing a louder default everyone
inherits.

### File List (expected)

- `public/index.html` — modified (Task 1: new static `<details>` block).
- `public/js/suite/roll-v2.js` — modified (Task 2: `updRulesSummary()`, 2 import additions, 1 call
  site in `loadPool()`).
- `public/css/suite.css` — modified (Task 3: 12 new CSS rules).
- A new Playwright spec (Task 4) — e.g. `tests/rcv-3a-rules-explanation-box.spec.js`.

### References

- [Source: specs/epic-rcv-roller-convergence.md] — rcv.3a's own epic-doc section; the coverage
  statistics John confirmed during party-mode scoping.
- [Source: scratchpad/roller-live-recovered/public/app.js:1180-1245] — read in full for this story's
  own design-lock pass (the `selected.kind === 'power'` branch and its surrounding `rulesHtml +
  modsHtml + controlsHtml` ordering).
- [Source: scratchpad/roller-live-recovered/public/app.css:435-461] — read in full for this story's
  own design-lock pass.
- [Source: public/js/shared/rules-text.js] — read in full; the existing shared component this story
  wires in rather than duplicates.
- [Source: public/js/shared/pools.js:29-77] — `getPool()`, read in full; the exact `pi` shape this
  story's `updRulesSummary()` consumes.
- [Source: public/js/suite/sheet.js:546-565,592-599,620-628,644-650] — the Sheet tab's own existing
  `renderRulesExpander()` call sites, the closest sibling precedent for this story's own usage.
- [Source: public/js/suite/roll-v2.js:220-249,298-...,377-495] — `loadPool()`/`updPool()`/`#effline`,
  read in full for this story.
- [Source: public/index.html:242-263] — the exact live markup this story's Task 1 inserts before.
- [Source: server/scripts/uplift-power-rules-text.js, server/scripts/reports/992-uplift-report.md] —
  the rules_text migration and its own dry-run coverage snapshot.
- [Source: git log --grep="992"] — PR #993 (merged), fix(#1013) (a later per-power top-up) — confirms
  the migration is live, not just scripted.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-loop Phase 2 delegate, 2026-08-30)

### Completion Notes List

- Implemented per the story's own pre-worked spec (Tasks 1-3): a new static `<details class="rules-
  summary">` block in index.html immediately before `.rv2-breakdown`; a new exported
  `updRulesSummary(pi)` in roll-v2.js, called from `loadPool()`; the ported CSS from the mockup.
- Real, necessary deviations beyond the story's own three named Tasks, all flagged by the implementer
  rather than silently made:
  1. `flex:none` added to `.rules-summary` - the verbatim mockup port produced a 2px unclickable
     sliver in the real page (`#t-roll` is an overflowing flex column; `overflow:hidden` on this box
     zeroed its automatic flex-basis, unlike `.rv2-breakdown`'s, which has no `overflow` rule).
  2. `updRulesSummary(null)` also called from `resetRollPool()`, not just `loadPool()` as AC2/AC8
     originally said - without it, switching character via `pickChar()` (which always calls
     `resetRollPool()`, never a fresh `loadPool()` on its own) left the previous character's power
     rules painted under the new one.
  3. `sheet-helpers.js` gained a `typeof window !== 'undefined'` guard around two pre-existing
     `window.X = ...` assignments - importing `fmtCostLine` from that file pulled it into `roll-v2.js`'s
     module graph, and two Node-environment vitest suites (`gdx-7-apply-costs-on-roll.test.js`,
     `gdx-11-vampire-mechanics-quick-actions.test.js`) stub `location`/`localStorage` but not `window`,
     so an unguarded module-scope assignment threw `ReferenceError: window is not defined` there.
     Purely additive in a real browser (same guard pattern `shared/rules-text.js:106` already uses).
- AC5's own cost-line investigation (as the story asked, rather than hardcoding `pi.cost || ''`):
  found and reused the existing `fmtCostLine(r)` in `suite/sheet-helpers.js` (gdx.6, #987) — this
  app's own single source of truth for a power's cost line, already handling the structured/
  `cost_note`/legacy-`cost` precedence and the "confirmed free" (`vitae_cost:0, willpower_cost:0`)
  case. Stripped the `"Cost: "` prefix to match the mockup's own `parseStats()` treatment
  (`app.js:311`).
- New spec `tests/rcv-3a-rules-explanation-box.spec.js`: 10/10 green at dev-story completion.
  Regression at dev-story completion: `rlv-4-custom-pool-builder.spec.js` (12/12) +
  `rlv-2-single-roller-retirement.spec.js` (6/6) = 18/18; vitest suites touching `roll-v2`/
  `sheet-helpers`/`rules-text` (14 files) 339/342, the 3 failures the pre-existing, documented #1117
  gap (`issue-1013-indomitable-rules-text.test.js`, `markdown/` corpus absent from this checkout).

### File List

- `public/index.html` — modified (Task 1: new static `<details>` block; review fix: bare
  `class="chevron"` → `class="rules-chevron"`, comment corrections).
- `public/js/suite/roll-v2.js` — modified (Task 2: `updRulesSummary()`, 2 import additions, 2 call
  sites — `loadPool()` per AC2, `resetRollPool()` beyond AC2's original literal wording; review fix:
  gate widened to include `pi.rules_text`, doc comment corrected).
- `public/js/shared/pools.js` — modified (review fix: `cost_note: rule.cost_note ?? null` added to
  both `getPool()` return branches — not in the story's own original File List, a gap the review
  found and closed).
- `public/css/suite.css` — modified (Task 3: ported rules-summary rules; review fix: `.rules-chevron`
  scoped selector replacing a bare `.chevron`, `.power-cost`/`.power-meta`/`.power-desc` scoped under
  `.rules-summary`, `:focus-visible` added).
- `public/js/suite/sheet-helpers.js` — modified, beyond the story's own File List (dev-story deviation
  #3 above: `window` guard, necessary for the new cross-import not to break Node-environment tests).
- `tests/rcv-3a-rules-explanation-box.spec.js` — new (10 tests at dev-story completion; +3 review-fix
  regression tests, 13 total).

## Senior Developer Review (self, inline per bmad-loop Phase 3)

**Reviewed:** 2026-08-30. **Mode:** MIXED — attempted external (Codex CLI, `codex exec`,
`model_reasoning_effort=high`), failed twice for infrastructure reasons unrelated to code quality (a
corrupted local models-cache first run produced zero findings at all; a second run after clearing the
cache did real Pass-1 work but the process cut off before Pass 2/3 ever completed, no explanation
given). Rather than retry a third time, switched to **internal**: 3 layers run as independent parallel
subagents in this session (Blind Hunter = diff only, Edge Case Hunter = diff + repo, Acceptance
Auditor = diff + repo + spec, each genuinely isolated — none saw the others' output or the partial
Codex findings). All three converged, independently, on the same root defect from different angles —
exactly the "what good looks like" signature a blinded multi-layer review is supposed to produce.

### Findings and resolutions

**Patched (2 real bugs, both prove-discriminated with single-change reverts):**

1. **[High — Edge Case Hunter/Acceptance Auditor, corroborated by Blind Hunter's own High from a
   different angle] `getPool()` never threaded `cost_note` onto `pi`, so the Roll-tab cost chip
   silently dropped cost qualifiers** ("1 V per effect" → "1 Vitae", losing "per effect") that the
   Sheet tab shows correctly for the same rule doc, because `fmtCostLine(pi)` reads `pi.cost_note`
   and it was always `undefined` at this call site. Named live examples from the reviewers'
   citations: Celerity/Resilience/Vigour ladders, Iron Edict. **Fix:** `cost_note: rule.cost_note ??
   null` added to both `getPool()` return branches in `shared/pools.js`. **Prove-discrimination:**
   reverted the one line feeding the rollable branch, ran the new "a qualified structured cost shows
   its note" test — failed exactly as expected (`Received: "1 Vitae"`, expected `"1 Vitae (per
   effect)"`); restored, re-ran, green.
2. **[High — Blind Hunter] The visibility gate ignored `pi.rules_text`, so a power whose only real
   content was its full rules text was hidden entirely** — the box's own most valuable output
   (the page-cited rulebook expander) was unreachable for exactly the powers where it would matter
   most. **Fix:** `hasRules` widened to `pi.effect || pi.action || pi.duration || pi.cost ||
   pi.rules_text` in `roll-v2.js`. Deliberately did NOT add `pi.vitae_cost`/`pi.willpower_cost` to
   this gate (Blind Hunter's own finding conflated the two) — Edge Case Hunter's full 13-call-site
   sweep of every `loadPool()` caller confirmed the Vampire Mechanics tiles (Lash Out, Blood Bond
   Resistance) DO carry `willpower_cost` but never `rules_text`, so widening on cost fields would
   have made the box wrongly appear on tiles this story explicitly excludes (`rcv.3c`'s own job),
   while widening on `rules_text` alone is safe. **Prove-discrimination:** reverted the `||
   pi.rules_text` clause, ran the new "a power whose only content is rules_text still shows the box"
   test — failed exactly as expected (box stayed hidden); restored, re-ran, green.

**Patched (4 hygiene fixes, corroborated across 2-3 layers, low/no live reachability but cheap to
close):**

3. **[Medium — Blind Hunter + Edge Case Hunter, independently] `.rules-summary-head{all:unset}`
   stripped the UA keyboard focus ring with no replacement.** Fixed: `.rules-summary-head:focus-
   visible{outline:2px solid var(--accent);outline-offset:2px}`, matching `.gcp-freebuild-btn`'s own
   precedent from rcv.2.
4. **[Medium — Blind Hunter] Three CSS selectors (`.power-cost`/`.power-meta`/`.power-desc`) were
   unscoped/global in a 3000+ line stylesheet** — Edge Case Hunter independently grepped and found no
   live collision today, but the fix costs nothing (all three only ever appear inside `.rules-
   summary`) and closes a real future-fragility risk a blind reviewer correctly flagged even without
   repo access to confirm it. Scoped all three under `.rules-summary`.
5. **[Medium — Blind Hunter] Bare `class="chevron"` markup, even though the CSS rule targeting it was
   already correctly scoped (`.rules-summary-head .chevron`).** The risk was a future global
   `.chevron{}` rule reaching in via the markup's own generic class name. Renamed both the markup
   class and the CSS selector to `.rules-chevron`.
6. **[Medium — Blind Hunter] One test's PASS condition was satisfiable by the feature being deleted
   entirely** (`toBeHidden()` alone passes on a zero-match locator). Added `toHaveCount(1)` alongside
   it in the "hidden before any pool is loaded" test.

**Corrected (story spec wording, not code — 2 items, both Acceptance Auditor):**

7. AC5's stated cost-field precedence was backwards (said legacy `cost` first, structured fields as
   fallback) — the actual, correct implementation prefers structured fields first, matching
   `spendableCost()`'s own convention. Corrected the AC's wording to match the code, not the reverse.
8. AC8 named only `loadPool()` as `updRulesSummary()`'s call site; the real, necessary second call
   site in `resetRollPool()` (dev-story deviation #2) is now named explicitly.

**Dismissed with evidence (3, all Low):**

9. Blind Hunter's concern that an unguarded `fmtCostLine(pi).replace(...)` could throw and abort
   `loadPool()` entirely: read `fmtCostLine()`'s full body — every code path returns a string (`''`
   or `'Cost: ' + text`), never `undefined`/`null`/a throw, and `updRulesSummary()` already guards
   `pi` truthy before this line via the `hasRules` check. The scenario cannot occur as the code
   currently stands.
10. Edge Case Hunter's non-string-field-coercion concern (an object/array in `effect`/`action`
    rendering `[object Object]`): `server/schemas/purchasable_power.schema.js` types these fields
    `['string','null']` with `additionalProperties:false`, and nothing in the admin tooling can write
    a non-string value. Theoretical, not reachable through any real write path.
11. Three tests asserting on literal source text (import-line regexes, exact `<details>` attribute
    order) are brittle by the same pattern `CLAUDE.md` already documents as an accepted, pre-existing
    trade-off elsewhere in this codebase (`n7-n9-allocator-readers.test.js` et al.) — not a new
    problem this story introduced, not worth rewriting against an established convention.

**Deferred (4, all Low, logged to `deferred-work.md`):** a cost-only power with a legacy `cost` string
that formats to `''` opening onto a genuinely empty body; whitespace-only field values surviving
`getPool()`'s `|| null` normalisation; a 16px horizontal misalignment against `.rv2-breakdown`; a long
unparsed cost string clipping on a narrow viewport. All low-reachability, none blocking.

### Regression after patches

Full re-run, all green: `tests/rcv-3a-rules-explanation-box.spec.js` (13/13, up from 10 — 3 new
review-fix regression tests) + `tests/rlv-4-custom-pool-builder.spec.js` (12/12) +
`tests/rlv-2-single-roller-retirement.spec.js` (6/6) + `tests/rcv-2-three-independent-accordions.spec.js`
(19/19) = **50/50**. Vitest, the 14 suites touching `roll-v2`/`sheet-helpers`/`rules-text`: **339/342**
(3 pre-existing #1117 failures, `markdown/` corpus confirmed absent from this checkout).

### Outcome

Story status: `done`. Both real bugs patched and prove-discriminated; 4 hygiene fixes closed; spec
wording corrected in 2 places; 3 findings dismissed with direct evidence; 4 low-reachability items
deferred with a named reason each. No unresolved High/Medium findings. NOT committed, NOT pushed, NOT
merged — this epic commits once at close (`bmad-epic-loop`'s own per-epic cadence), not per-story.
