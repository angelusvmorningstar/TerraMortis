# Story rlv.4: Port `dice-engine.js`'s dropdown-picker UI in as an alternate ad-hoc entry path

Status: done

## Story

As an ST or player with a character loaded on the Roll tab,
I want to freely assemble an Attribute + Skill + Discipline dice pool even when no pre-built pool
button exists for that exact combination,
so that I can roll for edge-case actions without doing the arithmetic by hand or switching to the
admin Engine tool.

## CRITICAL — this is an adaptation, not a from-scratch build. Read this before Task 1.

**A near-complete, already-built, already-reviewed implementation of this exact feature already
exists — stranded, unmerged, on the `dev` branch.** Commit `922f357e` ("feat(gdx-11): Vampire
Mechanics quick actions + Custom Pool builder on the roll tab", 2026-08-19) added a "+ Custom Pool"
tile to `char-pools.js`'s pools grid, opening a chip-based Attribute×Skill×Discipline builder panel
in `app.js`. It was internally 3-layer reviewed (8 defects found and fixed), and its pure functions
have vitest coverage (`server/tests/gdx-11-vampire-mechanics-quick-actions.test.js`, though none of
the Custom Pool UI logic itself is unit-tested — it's inline in `app.js`'s render closure).

`dev` and `main` diverged after that commit (`main` has since done Epic CRD, the ecosystem rebrand,
and Epic RLV including rlv.2's roll.js retirement; `dev` never got any of that). **Do not
`git cherry-pick`, `git merge`, or `git show`-and-paste from `dev`** — its version depends on things
`main` no longer has (the `tm-use-new-dice-roller` flag, `#t-dice`/`goTab('dice')`, a `noWP` pool
field nothing on `main` reads). Hand-write the adapted version directly against current `main`,
using the exact specification below — every adaptation from the `dev` original is already worked
out; do not re-derive it.

**Scope boundary — this story ports ONLY the Custom Pool builder (the `dev` commit's own AC8), not
the rest of that commit.** The same commit also added "Vampire Mechanics" quick-action tiles (Frenzy
Resistance, Riding the Wave, Lash Out, Clash of Wills, Blood Bond Resistance) and a Staking/Torpor
flow — a different, larger, already-separately-scoped feature (gdx-11 proper) that has nothing to do
with rlv.4's own remit (D5's ad-hoc-entry-path mandate). Do not port any of: `shared/resist.js`'s
`ATTRS`/`DISC_ABBR`/`lashOutPool`/`bloodBondPool` exports, `equipment-derivation.js`'s
`isStakeWeapon`, `tracker.js`'s `in_torpor` allowlist entry, or `roll-v2.js`'s `noWP` guard in
`effPool()`. None of those are needed for Custom Pool alone. gdx-11 proper remains stranded on `dev`
for a future story to resurrect — not this one.

## Acceptance Criteria

1. `public/js/shared/pools.js`'s `unskilledPenalty(skillName)` is exported (currently
   module-private) — the Custom Pool builder needs it and must not duplicate the -3 Mental / -1
   Physical-or-Social logic.
2. `char-pools.js`'s `renderCharPools()` appends a full-width "+ Custom Pool" tile to the end of the
   existing pools grid (after Skill Pools / Discipline Pools, same grid — no new section heading).
   This renders everywhere `renderCharPools()` is called (`#gcp-panel` on the Sheets tab,
   `#roll-char-pools` on the Roll tab — 3 call sites in `app.js`), and the tile appears even for a
   character with zero non-zero skills and zero disciplines (the grid's current
   `hasPools = skillHtml || discHtml` visibility gate must include the new tile).
3. Tapping the tile opens a new `openPanel('custom')` bottom-sheet panel, reusing the existing
   `#panel-overlay`/`#panel` mechanism (no new modal system). It shows three independently-optional
   toggle-chip groups: **Attribute** (all 9, from `ALL_ATTRS`), **Skill** (defaults to the
   character's non-zero skills via `skTotal`, with a "show all" toggle that reveals 0-dot skills
   too — a deliberate unskilled roll is an intended use case, not hidden), **Discipline** (the
   character's own `dots > 0` disciplines; "No disciplines" shown if none). Each chip toggles on a
   second tap (deselect).
4. A live total —
   `getAttrEffective(char, attr) + skTotal(char, skill) + unskilledPenalty(skill) [only when a
   0-dot skill is chosen] + disciplineDots`, floored at 0 — updates on every chip tap and is shown
   (with a "Load Pool" button) once at least an Attribute is picked. Attribute is the only mandatory
   chip; Skill and Discipline are each independently optional.
5. "Load Pool" commits via the existing, unmodified `loadPool(total, label, pi)`. The `pi` object
   matches `char-pools.js`/`shared/pools.js`'s canonical breakdown shape —
   `{ total, attr, attrV, skill, skillV, unskilled, discName, discV, resistance: null }` — so
   `roll-v2.js`'s existing specialisation-chip, equipment-chip, Rote-badge, WP-chip, and spend
   automation all apply to a Custom Pool exactly as they do to any named pool. No changes to
   `roll-v2.js` itself.
6. No character loaded shows the same "Select a character first" empty state the Discipline/Common
   panels already use (`.hempty`, same padding/copy).
7. Character/Discipline/Common/Auspex panels, `COMMON_ACTIONS`, and every other existing Roll-tab or
   Sheets-tab behaviour render and behave identically to before this story — this is a pure addition
   to `openPanel()` and `renderCharPools()`, not a restructuring.

## Tasks / Subtasks

- [x] Task 1 (AC1) — `public/js/shared/pools.js`: add `export` to `unskilledPenalty` (currently
  `function unskilledPenalty(skillName) {` at line 9 — no other change to the function body).

- [x] Task 2 (AC2) — `public/js/game/char-pools.js`:
  - [ ] Add a `choiceBtn(label, idx, wide)` helper near `poolBtn()` (a tile that opens a panel
    instead of showing a dice total):
    ```js
    function choiceBtn(label, idx, wide) {
      const cls = 'gcp-pool-btn gcp-choice' + (wide ? ' gcp-choice-wide' : '');
      return `<button class="${cls}" data-idx="${idx}"><span class="gcp-pool-n gcp-choice-arrow">›</span><span class="gcp-pool-lbl">${esc(label)}</span><span class="gcp-pool-sub">tap to choose</span></button>`;
    }
    ```
  - [ ] In `renderCharPools()`, after the existing discipline-pools loop (currently ends around line
    132, right before `const hasPools = skillHtml || discHtml;`), build the tile:
    ```js
    const customIdx = _pools.length;
    _pools.push({ opensPanel: 'custom', label: '+ Custom Pool' });
    const customHtml = choiceBtn('+ Custom Pool', customIdx, true);
    ```
  - [ ] Change the gate and append: `if (skillHtml || discHtml || customHtml) { ... }`, and inside
    it, after the existing `if (discHtml) { ... }` block, add
    `if (customHtml) h += '<div class="gcp-pool-grid">' + customHtml + '</div>';`.
  - [ ] No change needed to the existing click-wiring
    (`el.querySelectorAll('.gcp-pool-btn').forEach(...)` at the bottom of the function) — the tile
    is still a `.gcp-pool-btn`, so `onTap(_pools[idx])` already fires with `{opensPanel:'custom',
    label:'+ Custom Pool'}`. The `app.js` side (Task 4) is what needs to understand `opensPanel`.

- [x] Task 3 (AC3, AC4, AC5, AC6) — `public/js/app.js` imports and new panel mode:
  - [ ] Extend existing imports (do not add new import statements where an existing one already
    covers the module):
    - `import { ... } from './data/constants.js';` (currently `SKILLS_MENTAL` only, line 130) →
      add `ALL_ATTRS, ALL_SKILLS`.
    - `import { getAttrEffective as getAttrVal, skDots } from './data/accessors.js';` (line 129) →
      add `skTotal`.
    - `import { getPool } from './shared/pools.js';` (line 128) → add `unskilledPenalty`.
  - [ ] Add a new `else if (mode === 'custom')` branch to `openPanel(mode)`, placed after the
    existing `else if (mode === 'common')` block (which currently ends the if/else chain, just
    before `document.getElementById('panel-overlay').classList.add('on');`). Full implementation
    (adapted from the `dev`-branch original — `ATTRS` swapped for this repo's own `ALL_ATTRS` since
    `constants.js` already has the canonical 9-attribute list and importing a second copy from
    `shared/resist.js` would just be redundant; `pi.noWP` dropped, nothing on `main` reads it):
    ```js
    } else if (mode === 'custom') {
      title.textContent = 'Custom Pool';
      if (!suiteState.rollChar) {
        body.innerHTML = '<div class="hempty" style="padding:24px 16px;">Select a character first</div>';
      } else {
        const c = suiteState.rollChar;
        const myDiscs = Object.entries(c.disciplines || {}).filter(([, v]) => (v?.dots || 0) > 0).map(([name, v]) => ({ name, dots: v.dots }));
        let attr = null, skill = null, disc = null, showAll = false;
        const render = () => {
          let html = '<div class="panel-section">Attribute</div><div class="vm-chip-wrap">';
          ALL_ATTRS.forEach(a => {
            html += `<button class="mchip cp-attr-chip${attr === a ? ' on' : ''}" data-a="${esc(a)}">${esc(a)}</button>`;
          });
          html += '</div>';

          const nonZero = ALL_SKILLS.filter(s => skTotal(c, s) > 0);
          const shown = showAll ? ALL_SKILLS : nonZero;
          html += `<div class="panel-section">Skill <button class="cp-showall-btn" id="cp-showall">${showAll ? 'non-zero only' : 'show all'}</button></div><div class="vm-chip-wrap">`;
          if (!shown.length) {
            html += '<div class="hempty" style="padding:0 16px 8px;">No non-zero skills — tap "show all"</div>';
          }
          shown.forEach(s => {
            html += `<button class="mchip cp-skill-chip${skill === s ? ' on' : ''}" data-s="${esc(s)}">${esc(s)}</button>`;
          });
          html += '</div><div class="panel-section">Discipline</div>';
          html += myDiscs.length
            ? '<div class="vm-chip-wrap">' + myDiscs.map(d =>
                `<button class="mchip cp-disc-chip${disc === d.name ? ' on' : ''}" data-d="${esc(d.name)}">${esc(d.name)} (${d.dots})</button>`
              ).join('') + '</div>'
            : '<div class="hempty" style="padding:0 16px 8px;">No disciplines</div>';

          const attrV = attr ? getAttrVal(c, attr) : 0;
          const skillV = skill ? skTotal(c, skill) : 0;
          const unskilled = (skill && skillV === 0) ? unskilledPenalty(skill) : 0;
          const discDots = disc ? (myDiscs.find(d => d.name === disc)?.dots || 0) : 0;
          const total = Math.max(0, attrV + skillV + unskilled + discDots);

          if (attr) {
            const bits = [attr + ' ' + attrV];
            if (skill) bits.push(skill + ' ' + (unskilled ? unskilled : skillV) + (unskilled ? ' (unskilled)' : ''));
            if (disc) bits.push(disc + ' ' + discDots);
            html += `<div class="panel-total">${esc(bits.join(' + '))} = <b>${total}</b> dice</div>`;
            html += '<button class="pnl-confirm-btn" id="cp-load">Load Pool</button>';
          }
          body.innerHTML = html;
          body.querySelectorAll('.cp-attr-chip').forEach(btn => btn.addEventListener('click', () => { attr = attr === btn.dataset.a ? null : btn.dataset.a; render(); }));
          body.querySelectorAll('.cp-skill-chip').forEach(btn => btn.addEventListener('click', () => { skill = skill === btn.dataset.s ? null : btn.dataset.s; render(); }));
          body.querySelectorAll('.cp-disc-chip').forEach(btn => btn.addEventListener('click', () => { disc = disc === btn.dataset.d ? null : btn.dataset.d; render(); }));
          document.getElementById('cp-showall')?.addEventListener('click', () => { showAll = !showAll; render(); });
          document.getElementById('cp-load')?.addEventListener('click', () => {
            const label = [attr, skill, disc].filter(Boolean).join(' + ') || 'Custom Pool';
            const pi = { total, attr, attrV, skill: skill || null, skillV, unskilled: unskilled || null, discName: disc || null, discV: discDots, resistance: null };
            loadPool(total, label, pi);
          });
        };
        render();
      }
    }
    ```
    Note: the local `discDots` variable inside this closure is unrelated to (and does not import)
    `accessors.js`'s exported `discDots(c, disc)` function of the same name — `app.js` does not
    currently import that accessor; do not add an import that would shadow this local.

- [x] Task 4 (AC3, AC7) — wire the 3 `renderCharPools()` onTap callbacks in `app.js` to route
  `opensPanel` tiles to `openPanel()` instead of trying to `loadPool()` a tile with no `.total`.
  Three call sites, each needs the same one-line guard added directly before its existing
  `loadPool(...)` call:
  - `openChar()`, lines 333-336: currently `loadPool(...)` then `goTab('roll')`. **Reorder** so
    `goTab('roll')` runs first, then the guard, then `loadPool` — so a `custom` panel opens on top
    of the now-visible Roll tab, not the Sheets tab it was called from:
    ```js
    renderCharPools(poolsEl, c, (p) => {
      goTab('roll');
      if (p.opensPanel) { openPanel(p.opensPanel); return; }
      loadPool(p.total, p.label, p.pi || { total: p.total, attr: p.attr, attrV: p.attrV, skill: p.skill, skillV: p.skillV, nineAgain: p.nineAgain, resistance: p.resistance });
    });
    ```
  - `pickChar()`, lines 1079-1083 (the Roll tab's own character picker — already on the Roll tab, no
    `goTab` call exists or is needed here): just add the guard before `loadPool`.
  - `_switchChar()`, lines 1214-1218: same reorder as `openChar()` — move the existing `goTab('roll')`
    (currently called after `loadPool`) to before the guard.
  - Note: the `dev`-branch original used `goTab('dice')` throughout (pre-rlv.2 tab id) — this story
    must use `goTab('roll')`, matching `main`'s current single Roll tab (`#t-roll`, retired by
    rlv.2).

- [x] Task 5 (AC2, AC3) — `public/css/suite.css`: add the CSS classes the markup above depends on.
  None currently exist on `main` (verified — no collisions). Two groups, both directly reusable
  as-is from the `dev`-branch original (already token-compliant, no bare hex/rgba):
  - Scoped mini-panel chrome (chip row, live-total banner, confirm button) — add near the existing
    `.pi-pool.nr` rule (~suite.css:340):
    ```css
    .vm-chip-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 8px;}
    .vm-chip-wrap .mchip{flex:0 0 auto;height:36px;padding:0 12px;}
    .panel-section .cp-showall-btn{float:right;background:none;border:none;color:var(--gdim);font-family:var(--fl);font-size:8px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent;}
    .panel-total{margin:8px 16px;padding:10px 12px;border:1px solid var(--gold2-a25);border-radius:6px;background:var(--gold2-a12);font-family:var(--fl);font-size:11px;color:var(--txt2);letter-spacing:.02em;}
    .panel-total b{color:var(--gold2);}
    .pnl-confirm-btn{display:block;width:calc(100% - 32px);margin:8px 16px 16px;padding:14px;border:none;border-radius:8px;background:var(--crim);color:var(--txt-on-dark);font-family:var(--fl);font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent;}
    .pnl-confirm-btn:active{filter:brightness(1.15);}
    ```
  - Choice-tile chrome (the "+ Custom Pool" tile itself) — add near the existing `.gcp-rote-badge`
    rule (~suite.css:842):
    ```css
    .gcp-pool-btn.gcp-choice{border-color:var(--gold2-a25);}
    .gcp-choice-arrow{color:var(--gdim);font-size:18px;}
    .gcp-choice-wide{grid-column:1/-1;flex-direction:row;align-items:center;gap:8px;}
    .gcp-choice-wide .gcp-choice-arrow{order:2;margin-left:auto;}
    .gcp-choice-wide .gcp-pool-lbl{order:1;margin-top:0;}
    .gcp-choice-wide .gcp-pool-sub{display:none;}
    ```
  - Do NOT port the `dev` diff's `.rv2-stake-*` rules — those are Staking/Torpor-only (out of
    scope, see the boundary note above). `.mchip.on` (the toggle-state styling) already exists
    unchanged at suite.css:172 — no new rule needed for chip selection state. `.cp-attr-chip` /
    `.cp-skill-chip` / `.cp-disc-chip` need no CSS rules of their own — they're JS selector hooks
    only; `.mchip`/`.mchip.on` supply all visual styling.

- [x] Task 6 (testing) — add Playwright e2e coverage; follow `tests/rlv-2-single-roller-retirement.spec.js`'s
  house style (source-fetch smokes for static assertions + one live-boot flow for the interactive
  path). At minimum: (a) a source-fetch smoke that `app.js` contains the `custom` mode branch and
  `char-pools.js` contains the `+ Custom Pool` tile; (b) a live flow — load a character with at
  least one non-zero skill and one discipline, open the tile, pick Attribute+Skill+Discipline,
  confirm the live total matches the formula, tap Load Pool, confirm the Roll tab's pool banner and
  `#effline` breakdown reflect the loaded pool. Also run the existing targeted suites that already
  touch these files (`server/tests/issue-879-defence-penalty-wirein.test.js` reads
  `char-pools.js`'s source) to confirm no regression — do not run the full suite.

## Dev Notes

### Why this shape, not a `dice-engine.js` port

The epic's own D5 line says "port `dice-engine.js`'s dropdown-picker UI in as an alternate ad-hoc
entry path, building the same `pi` shape `char-pools.js` already produces." `dice-engine.js`
(`public/js/admin/dice-engine.js`) is the ST-only admin Engine-domain tool — it has its own
character selector (any character, since it's ST-only and has no "which character is mine"
concept), its own dice math, its own history panel, all self-contained, because the admin app has
none of the player Roll tab's existing infrastructure. The player Roll tab already has all of that
(character selection via `sc-char`, dice math + history in `roll-v2.js`, spend automation). Porting
`dice-engine.js`'s own dropdown-select UI verbatim would mean re-solving problems the Roll tab
already solves, and re-inventing the `dev`-branch Custom Pool builder's chip-based picker (a strictly
better fit for this app's existing panel/chip vocabulary — see `.mchip`, `.vm-chip-wrap` already used
for Rote/WP toggles and now this). This story therefore adapts that already-reviewed sibling
implementation rather than the literal `dice-engine.js` UI — the *outcome* D5 asks for (an ad-hoc
attribute+skill+discipline entry path building `char-pools.js`'s own `pi` shape) is what matters, not
a specific donor file.

### `pi` shape — why so few fields

`shared/pools.js`'s `getPool()` (the canonical named-power pool builder) also sets `cost`,
`vitae_cost`, `willpower_cost`, `action`, `duration`, `effect`, `isRitual`, `rules_text`,
`rules_source`, `info` — none of those are read by anything downstream for a *raw* ad-hoc pool
(verified by reading `roll-v2.js` in full): `spendableCost()` only reads `pi.vitae_cost`/
`pi.willpower_cost` (both `undefined` is fine, treated as `0`/falsy), `showResistSec()` only reads
`pi.resistance`. A Custom Pool has no rule behind it, so those fields simply don't exist for it —
do not fabricate placeholder values for them.

### Formula source, verbatim from the reviewed `dev`-branch story doc (AC8)

> `getAttrEffective(char, attr) + skTotal(char, skill) + unskilledPenalty(skill) [when a 0-dot skill
> is chosen; export from public/js/shared/pools.js] + (disciplineDots || 0)`

`getAttrEffective` already includes the discipline-enhances-attribute rule (`discAttrBonus`, e.g.
Celerity→Dexterity) via `accessors.js`'s data-driven `rule_disc_attr` system — this is why the
formula does not separately add anything for a discipline the user picked *both* in the Attribute
slot's underlying enhancement *and* the Discipline chip; that's pre-existing, already-shipped
behaviour of `getAttrEffective` itself (same as every other pool in this app, including named
discipline powers via `shared/pools.js`), not a new correctness question this story needs to
resolve.

### Skill list source — do not use `skDots`

The existing `'common'` panel mode (a few lines above where this story's new branch goes,
`app.js:1012-1027`) computes skill values via `skDots(c, a.skill)` — **raw dots only, no PT
dot-4/MCI dot-3 bonus dots**. That is a narrower, pre-existing choice in that one panel; do not copy
it here. This story's formula uses `skTotal`, matching `shared/pools.js`'s own canonical model (the
one D5 mandates standardising on) and including those bonus dots correctly.

### File List (expected)

- `public/js/shared/pools.js` — one-word change (`function` → `export function`).
- `public/js/game/char-pools.js` — `choiceBtn()` helper, tile push + render, gate extended.
- `public/js/app.js` — 3 import additions, new `custom` panel mode, 3 onTap-callback guards.
- `public/css/suite.css` — 2 new rule groups (~13 lines total).
- A new Playwright spec (Task 6) — e.g. `tests/rlv-4-custom-pool-builder.spec.js`.

### Project Structure Notes

No new files except the test spec. No new directories, no new component/CSS system — every element
class used already exists in `public/css/suite.css` and is already load-bearing elsewhere in this
same Roll tab (`.mchip`, `.panel-item`/`.hempty`/`.panel-section` conventions from the existing
Discipline/Common panels, `.gcp-pool-btn`/`.gcp-pool-grid` from the existing pools grid). This keeps
the story inside `specs/architecture/coding-standards.md`'s CSS-reuse mandate (see
`specs/project-context.md` §1) without needing to invent anything new beyond the 13 lines in Task 5.

### References

- [Source: specs/epic-rlv-roller-harmonisation.md] — rlv.4's row and the epic's D5 resolution.
- [Source: specs/dice-roller-harmonisation-audit.md §4d] — the full D5 investigation this story's
  scope rests on (`char-pools.js`/`shared/pools.js` as the canonical model, `dice-engine.js`'s
  shallower state).
- [Source: git commit 922f357e, branch `dev`] — the stranded prior-art implementation this story
  adapts. `git show 922f357e -- public/js/app.js public/js/game/char-pools.js
  public/js/shared/pools.js public/css/suite.css` to view the original diff directly if needed —
  read-only reference, do not merge/cherry-pick it.
- [Source: specs/stories/gdx-11-vampire-mechanics-quick-actions.md (dev branch only, not on main) §AC8]
  — the original acceptance criterion this story's AC3/AC4/AC5 are adapted from, via
  `git show 922f357e:specs/stories/gdx-11-vampire-mechanics-quick-actions.md`.
- [Source: public/js/app.js:307-341,888-1035,1047-1088,1182-1219] — `openChar`/`openPanel`/
  `pickChar`/`_switchChar`, current `main` state, read in full for this story.
- [Source: public/js/game/char-pools.js] — read in full for this story.
- [Source: public/js/shared/pools.js] — read in full for this story.
- [Source: public/js/suite/roll-v2.js:180-427] — `loadPool`/`effPool`/`updPool`/`togSpec` and the
  `effline` breakdown renderer, confirming exactly which `pi` fields are load-bearing.
- [Source: public/index.html:152-272] — current Roll tab markup (single tab, no flag, post-rlv.2).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (`bmad-dev-story`, 2026-08-24)

### Debug Log References

- `test-results/rlv-4-custom-pool-builder--ec6ce-ve-total-and-loads-the-pool-chromium/error-context.md`
  — the page snapshot that surfaced the Service Worker / live-data leak (see Completion Notes below).

### Completion Notes List

- Implemented exactly per the story's own pre-worked spec (Tasks 1-5), adapted from the stranded
  `dev`-branch commit `922f357e` — no re-derivation needed, matched the story's exact code blocks.
- Tasks 1-4 (`shared/pools.js` export, `char-pools.js` tile, `app.js` panel mode + 3 onTap guards)
  and Task 5 (CSS) implemented as specced; all file:line anchors in the story matched current `main`
  exactly, confirmed by re-reading each file immediately before editing (no drift since story
  creation).
- Task 6 (testing): found and worked around two real, pre-existing test-infrastructure issues before
  the new spec could pass meaningfully. Neither is this story's to fix; both are worked around in the
  new spec, not silently ignored:
  1. **A Service Worker leaks live production character data past `page.route()` stubs.**
     `public/index.html` registers a Service Worker (`/sw.js`) that intercepts `/api/characters`
     ahead of Playwright's `page.route()` and serves real, cached production data from whatever real
     ST session last used the shared `localhost:8080` origin (`reuseExistingServer: true` reuses it
     across every Playwright run). Confirmed directly: a `page.route()` stub for `/api/characters`
     plus navigation produced a full **real** character roster (Alice Vunder, Magda, Livia, etc. —
     real campaign names) instead of the stubbed fixture, with zero matching request ever visible to
     `page.on('request')`; `test.use({ serviceWorkers: 'block' })` stopped the SW from being *active*
     on the page but the leak persisted regardless (root cause not fully isolated — possibly a shared
     Chromium profile/cache across separate Playwright browser contexts on this machine, not the SW
     alone). Read-only (`GET`), no data at risk, but the same mechanism would defeat a stub on a
     `POST`/`PUT` test just as easily. This story's own new spec sidesteps it entirely: it injects the
     fixture character via the real, exposed `window.pickChar(c)` global (same technique
     `tests/feature-662-eq3-roll-calc-equipment-chips.spec.js` already uses for the same underlying
     reason) instead of depending on `/api/characters` resolving with test data. Flagged for whoever
     next touches Playwright test infrastructure broadly: any other spec stubbing `/api/characters`
     (or other endpoints) via `page.route()` — especially anything using the real `#sc-char` →
     `.panel-item` click flow — may be silently exercising live production data instead of its own
     fixture.
  2. **ST default-landing tab breaks `#sc-char`-dependent tests.** `tests/post-game-1.spec.js`'s
     `EPC.1 — pool chips render in roll tab after character selection` and `EPC.3 — Auspex button
     appears after selecting char with Auspex` both **timeout waiting for `#sc-char` to become
     visible**, confirmed by running them directly against unmodified `main` before this story's own
     changes were applied. Root cause: `boot()`'s default-landing logic (`goTab(isDesktop ?
     (!isST && hasChar ? 'sheets' : 'chars') : ...)`) lands an ST with no saved `tm_active_char` and
     no auto-picked character on the **`chars`** tab at Playwright's default 1280×720 (desktop-width)
     viewport, not `roll` — so `#sc-char` (inside `#t-roll`) is `display:none` and unclickable.
     Pre-existing, unrelated to this story; likely the same failure family as `CLAUDE.md`'s already-
     documented `tests/suite.spec.js` "starts on Roll tab" / tab-navigation failures. This story's own
     spec avoids it by calling `window.goTab('roll')` explicitly before interacting with the tab, and
     by injecting the character via `window.pickChar(c)` rather than the `#sc-char` panel flow.
- New Playwright spec `tests/rlv-4-custom-pool-builder.spec.js`: 10/10 green at dev-story completion
  (4 source-fetch smokes + 6 live-flow tests covering AC2-AC7); grew to 12/12 during code review (see
  Senior Developer Review below) after two patches each got their own regression test.
- Regression at dev-story completion: `server/tests` changed-area batch (9 suites touching
  `char-pools.js`/`app.js`/`shared/pools.js` by static grep — bl2/bl4/bl5, crd-2, gdx-7,
  issue-871-876, issue-879, oaq-3, otc-3) reported **298 passed, 18 skipped (316 total)** — the 18
  skips are the `#1117` mongod-gated pattern `CLAUDE.md` already documents (no local `mongod`
  reachable at that point in the session), not a real gap; re-run during code review with a local
  `mongod` reachable genuinely passed 316/316 (see below — this file's own original "316/316 passed"
  wording was corrected as a code-review finding, since it didn't disambiguate skip-vs-pass at the
  time it was written). Playwright `rlv-2-single-roller-retirement.spec.js` +
  `issue-1024-roll-v2-anchor-and-again-seg.spec.js` (both touch `app.js`/`roll-v2.js`/the Roll tab
  directly) 13/13 passed — no regression from this story's `app.js` import/onTap-callback edits.
  Full suite not run, per `specs/project-context.md`'s own targeted-tests convention.
- No High/Medium findings at dev-story completion — the two test-infrastructure findings above are
  pre-existing and out of scope, not defects introduced by this story. Two real Medium defects were
  found and patched during code review (see Senior Developer Review below).

### File List

- `public/js/shared/pools.js` — modified (Task 1: `unskilledPenalty` exported).
- `public/js/game/char-pools.js` — modified (Task 2: `choiceBtn()` helper, "+ Custom Pool" tile,
  pools-grid visibility gate extended; review fix: `_pools` module-level singleton rescoped to a
  per-call local `pools`, `roteEligibleFor(char, skill)` extracted as a shared export).
- `public/js/app.js` — modified (Task 3: 3 import additions, new `custom` panel mode; Task 4: 3
  onTap-callback guards + 2 `goTab('roll')` reorders; review fix: `roteEligibleFor` imported and
  wired into the Custom Pool `pi` object).
- `public/css/suite.css` — modified (Task 5: 2 new rule groups).
- `tests/rlv-4-custom-pool-builder.spec.js` — new (Task 6: 4 source-fetch smokes + 6 live-flow
  Playwright tests; review: +2 tests for the two patched findings, 12 total).

## Senior Developer Review (AI)

**Reviewed:** 2026-08-24. **Mode:** EXTERNAL — Codex CLI (`codex exec -C <repo> -s workspace-write
-c model_reasoning_effort=high`), a real 3-pass review (Blind Hunter / Edge Case Hunter / Acceptance
Auditor), not a quota failure this session (Codex hit a hard usage quota on 2026-08-23 that does not
reset until 2026-08-27; checked the run log's real content rather than assuming, per
[[feedback-review-mode]]). Diff scoped to source + tooling only (`specs/stories/code-review/
rlv-4-diff.txt`, against base commit `40be9e18`), story/tracking files deliberately excluded. Full
prompt and findings persisted at `specs/stories/code-review/rlv-4-codex-review.md` /
`rlv-4-codex-findings.md` / `rlv-4-codex-run.log`. **Outcome: 2 patched (both Medium), 1 corrected
(Low, a Dev Agent Record inaccuracy), 2 dismissed with evidence (Low). No High findings, none
deferred.**

### Findings

**Patched (2), both prove-discriminated with single-change reverts:**

1. **[Medium, Pass 2]** `char-pools.js`'s `_pools` was a **module-level singleton** shared by two
   independently-mounted containers (`#gcp-panel` on Sheets, `#roll-char-pools` on Roll), each
   possibly showing a different character. A button still attached from an earlier render in one
   container read its saved index against whatever the OTHER container's later render had rebuilt the
   shared array into — silently loading the wrong character's pool, or (for the new, always-present,
   fixed-position Custom Pool tile this story adds) receiving `undefined` and throwing at
   `p.opensPanel` when the two characters have different pool counts. This was a genuinely
   pre-existing architectural risk (skill/discipline tiles shared the same defect) already flagged,
   unresolved, in the Phase 0 audit (`dice-roller-harmonisation-audit.md` §4d: "`_pools`... a mutable
   singleton — worth a look for race/staleness risk once a chip-toggle layer is added") — this
   story's own always-present Custom Pool tile is exactly the chip-toggle-layer addition that note
   anticipated, and made the defect reliably reachable (any two different characters, not a
   coincidental index collision) rather than theoretical. **Independently reproduced before
   patching** (a temporary Playwright script rendering two characters into two separate DOM
   containers directly via the real `renderCharPools()` export — deleted after use, not part of the
   final diff) — confirmed the click callback received `undefined` on the unfixed code. **Fix:**
   `_pools` rescoped from `let _pools = []` at module scope to `const pools = []` local to
   `renderCharPools()`, so each container's button closures permanently reference their own render
   call's array regardless of what any other container does afterward. Revert-alone: the same repro,
   now folded into the suite as `tests/rlv-4-custom-pool-builder.spec.js`'s "a pool button in one
   container is unaffected by a later render in another container", fails (captures `undefined`
   again) with the fix removed and passes with it restored.
2. **[Medium, Pass 3a]** AC5's own literal wording promises the Rote badge applies to a Custom Pool
   "exactly as it does to any named pool," but the `pi` object this story's own spec prescribed
   (`{ total, attr, attrV, skill, skillV, unskilled, discName, discV, resistance: null }`) has no
   `roteEligible` field, and `roll-v2.js`'s only Rote-cue gate is `if (pi.roteEligible ...)` — so an
   otherwise-eligible Custom Pool (Professional Training 5, chosen Skill in the merit's own
   `asset_skills`) never showed the badge. A real AC-literal-wording gap in the spec's own prescribed
   shape, not a coding slip. **Fix:** extracted the skill-pool loop's existing inline PT-5 eligibility
   check into a shared, exported `roteEligibleFor(char, skill)` in `char-pools.js` (pure function of
   character + skill name, independent of how the pool was built), called it from both the pre-existing
   skill-pool loop (no behaviour change there — same computation, now named and reusable) and the
   Custom Pool builder's Load Pool handler in `app.js`. Revert-alone: the new
   "Rote eligibility... applies to a Custom Pool exactly as a named pool" test fails (`#effline
   .effpool-seg--rote` never appears) with the `roteEligible: roteEligibleFor(c, skill)` field removed
   from the `pi` object, passes with it restored.

**Corrected (1, Low):**

3. **[Low, Pass 3b]** This file's own Completion Notes originally claimed the 9-suite vitest batch
   passed "316/316" — Codex ran the exact command twice and got **298 passed, 18 skipped (316
   total)** both times, not 316 passed. Re-verified independently during this review round: the 18
   skips are the project's own documented `#1117` pattern (`CLAUDE.md`: "several suites need a local
   `mongod`. Without one they SKIP rather than fail... a skipped suite is not a passing suite") — no
   local `mongod` was reachable at the point the original claim was written. A local `mongod` was
   reachable later in this same session (confirmed via `netstat`, port 27017 listening) and a fresh
   run of the identical command genuinely passed 316/316 with zero skips. Both facts are true, at
   different points — the record's own wording is corrected above (Completion Notes List) to
   disambiguate skip-vs-pass rather than repeat the same imprecision with a coincidentally-matching
   number.

**Dismissed with evidence (2, both Low, Pass 1 — each explicitly flagged by Codex itself as
"worth checking in Pass 2", and Pass 2 raised no corresponding finding):**

4. Whether the `pi` object's fields (`attr`, `attrV`, `skill`, `skillV`, `unskilled`, `discName`,
   `discV`, `resistance`, now also `roteEligible`) are a genuine field-for-field match for what
   `roll-v2.js`'s `loadPool()`/`updPool()`/`togSpec()`/`showResistSec()` actually read — verified
   directly (read `roll-v2.js:180-427` in full during story creation, re-confirmed during this
   review) rather than trusting Pass 2's silence alone: `spendableCost()` reads only
   `vitae_cost`/`willpower_cost` (absent is fine, treated as falsy), `showResistSec()` reads only
   `resistance`, the `effline` renderer reads exactly the fields this `pi` shape supplies. No mismatch
   found on either pass.
5. Whether reordering `goTab('roll')` to run BEFORE `loadPool()` (at the `openChar()`/`_switchChar()`
   onTap sites) could regress the pre-existing, non-custom pool-tap path — verified directly by
   reading `goTab()` in full (`app.js:450-497`): it only toggles CSS `.active`/`.on` classes, updates
   header text, and runs a small set of `t === '<tab>'`-gated side effects (none of which touch
   `#pool-banner`, `#effline`, `#sc-disc-*`, or any element `loadPool()` writes to) — the DOM elements
   `loadPool()` writes into exist regardless of which tab is currently active, so the two orderings
   are behaviourally identical for every pre-existing pool-tap call site, not just the new one.

### Regression re-verification after patches

`tests/rlv-4-custom-pool-builder.spec.js` (grew from 10 to 12 tests, the two new ones proving the
patches above) + `tests/rlv-2-single-roller-retirement.spec.js` +
`tests/issue-1024-roll-v2-anchor-and-again-seg.spec.js` re-run together post-patch: **25/25 passed**.
`server/tests` changed-area batch (the same 9 suites) re-run post-patch: **316/316 passed** (mongod
reachable this run — see Corrected finding #3 above for why this differs from the original claim).

### Outcome

Story status: `done`. No unresolved High/Medium findings; both patches applied, prove-discriminated,
and covered by new permanent regression tests in the story's own spec file; the one inaccurate claim
corrected; both remaining Low findings dismissed with direct evidence, not just Pass 2's silence.
NOT committed, NOT pushed, NOT merged — per this project's hard rule, commit/push/merge only on the
user's own explicit instruction in their current message.
