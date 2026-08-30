# Story rcv.5: Detecting Blood Sympathy — new Vampire Mechanics tile

Status: done

## Design source — panel shape adapted from the mockup, not ported literally

`app.js:684-735` in the recovered mockup implements Detecting Blood Sympathy as a genuine two-screen
wizard (pick a relation tier, THEN a second screen asking passive vs forced, with a "Back" button) —
but it does this using `.fb-modal`/`.fb-overlay`/`.fb-cell`, the prototype-only component this epic's
own scoping already ruled out (`specs/epic-rcv-roller-convergence.md`: "not `.fb-modal`, which is a
prototype-only component with zero matches anywhere in `public/`"). Re-checked before writing this
story: **this app has no sequential-step-with-Back panel anywhere** — grepped for `back`-labelled panel
buttons, found none. Every one of the three existing live choice panels (Lash Out, Clash of Wills,
Blood Bond Resistance, `app.js`'s `mode === 'lashout'/'clash'/'bloodbond'` branches) instead shows
ALL its chip groups simultaneously in one screen, revealing the total + Load Pool button only once
every required chip is picked — Lash Out's own Aspect chips and Nature (Kindred/Mortal) chips both
visible at once is the closest direct precedent for this story's own two chip groups (Relation,
Approach).

**This story adapts the mockup's own two DECISIONS (relation tier, passive-vs-forced) into this app's
own established one-screen-multiple-chip-groups shape, not the mockup's own two-screen-with-Back
shape.** This is a deliberate, evidenced deviation from the literal mockup UI flow, matching this
session's own standing rule: reference the mockup's real content and decisions, verify its own UI
choices against what this app's real code actually does elsewhere before porting them wholesale
(the same call already made for Clash of Wills and Blood Bond Resistance's own copy in `rcv.3c`).

## Story

As an ST or player who wants to check whether their character can sense a blood relative,
I want a Detecting Blood Sympathy tile on the Roll tab that lets me pick the relation and whether I'm
actively forcing a connection, then rolls the correct pool,
so that I don't have to work out Wits + Blood Potency + the relation bonus by hand.

## Acceptance Criteria

1. A new live tile, "Detecting Blood Sympathy", added to `char-pools.js`'s `VM_CHOICE` array
   (currently `:152-156`) as a fourth `{opensPanel}` choice tile, alongside Lash Out/Clash of Wills/
   Blood Bond Resistance: `{ label: 'Detecting Blood Sympathy', mode: 'bloodsympathy' }`.
2. Tapping it opens the existing `#panel`/`#panel-overlay` sheet via `openPanel('bloodsympathy')` —
   **explicitly NOT a new modal component**. A new `else if (mode === 'bloodsympathy')` branch in
   `app.js`'s `openPanel()` function (after the existing `mode === 'bloodbond'` branch), following the
   exact structural pattern of the `lashout` branch (two independent chip groups, live total, Load
   Pool button once both are picked).
3. Two chip groups, both visible at once (not sequential screens):
   - **Relation** — four chips, the mockup's own tier data ported verbatim
     (`BLOOD_SYMPATHY_TIERS`, `app.js:106-111`): Once Removed (Sire or childe, +3), Twice Removed
     (Sibling, grandsire, or grandchilde, +2), Thrice Removed (Cousin, sire's sibling, or
     great-grandsire/childe, +1), Four Times Removed (Clanmate, +0).
   - **Approach** — two chips, labelled "Passive (free)" and "Forced (1 WP)", matching the exact
     wording used in Task 2's own code block and Lash Out's own "Kindred (1 WP)"/"Mortal (free)"
     precedent. **Correction (review):** this AC originally read "Free — ambient detection only" for
     Passive — an em-dash the implementer correctly avoided by following Task 2's code block instead,
     which is what actually shipped. Wording fixed here to match.
4. The live pool total is `Wits + Blood Potency + <chosen tier's mod>`, shown once both a Relation
   and an Approach are picked, in the same `<div class="panel-total">...</div>` format the other
   three live panels already use.
5. `willpower_cost` is `1` when Approach is Forced, `0` when Passive — matching Lash Out's own
   Kindred/Mortal cost pattern (`noWP: false`, an activation cost tied to which approach is chosen,
   composing additively with the separate WP(+3) dice-boost chip per `spendableCost()`'s own
   documented "additive, never either/or" rule), NOT Blood Bond Resistance's `noWP: true` pattern
   (that one's WP is specifically "the cost of attempting the resistance itself" — a different
   relationship between cost and roll than this mechanic has).
6. No `resistance` field — Detecting Blood Sympathy is a straight roll with no opposing pool, unlike
   Clash of Wills or Blood Bond Resistance.
7. `pi.effect`/`pi.action` are set on Load Pool, so the already-shipped Rules-explanation box (`rcv.3a`)
   shows real copy for this tile exactly as it now does for Lash Out/Clash of Wills/Blood Bond
   Resistance (`rcv.3c`) — see Task 2's exact copy, ported from the mockup's own rules-summary text
   (`app.js:1256-1268`) and edited only to drop the mockup's own dynamic per-tier interpolation
   (which described the CHOSEN tier specifically; this app's `effect` field is static per-tile, not
   rebuilt per-selection, matching every other tile's own pattern) in favour of a general description
   naming all four tiers. Includes the mockup's own explicit "cannot dramatically fail" rule as plain
   rules text — **not** a new dice-engine mechanic. This app's dice engine (`shared/dice.js`) has no
   concept of a distinct "dramatic failure" outcome at all (confirmed: grepped for "dramatic", zero
   matches outside comments); building that distinction is real, separate, unscoped work this story
   does not attempt. The rule is documented, not enforced.
8. Existing Vampire Mechanics tiles (Frenzy Resistance, Lash Out, Clash of Wills, Blood Bond
   Resistance, Humanity Check) and their own behaviour are unchanged.

## What this story is NOT

- **Not** `.fb-modal` or any new modal/panel component — reuses `#panel`/`#panel-overlay` exactly.
- **Not** the mockup's own literal two-screen wizard-with-Back UI — adapted to this app's own
  established one-screen-multiple-chip-groups shape (see Design source above).
- **Not** a new shared data structure for choice-roll tiles — Sally's own party-mode note stands:
  each of the (now five) choice tiles stays hand-coded inline, matching this app's existing
  convention; not this epic's problem to generalise.
- **Not** a "dramatic failure" dice-engine feature — the rule is surfaced as rules text via the
  existing Rules-explanation box, not built as new roll-outcome logic.
- **Not** `rcv.6` (Surprise/Perception) — a separate tile, separate story, listed next in the epic.

## Tasks / Subtasks

- [ ] Task 1 (AC1) — `public/js/game/char-pools.js`: add the fourth `VM_CHOICE` entry.

- [ ] Task 2 (AC2-AC7) — `public/js/app.js`: new `else if (mode === 'bloodsympathy')` branch in
  `openPanel()`, following the `lashout` branch's exact structure:
  ```js
  } else if (mode === 'bloodsympathy') {
    title.textContent = 'Detecting Blood Sympathy';
    if (!suiteState.rollChar) {
      body.innerHTML = '<div class="hempty" style="padding:24px 16px;">Select a character first</div>';
    } else {
      const c = suiteState.rollChar;
      // rcv.5: ported verbatim from the mockup (app.js:106-111).
      const BLOOD_SYMPATHY_TIERS = [
        { key: 'once', label: 'Once Removed', sub: 'Sire or childe', mod: 3 },
        { key: 'twice', label: 'Twice Removed', sub: 'Sibling, grandsire, or grandchilde', mod: 2 },
        { key: 'thrice', label: 'Thrice Removed', sub: "Cousin, sire's sibling, or great-grandsire/childe", mod: 1 },
        { key: 'four', label: 'Four Times Removed', sub: 'Clanmate', mod: 0 },
      ];
      let tier = null, forced = null;
      const render = () => {
        const witsV = getAttrVal(c, 'Wits');
        const bp = c.blood_potency || 0;
        let html = '<div class="panel-section">Relation</div><div class="vm-chip-wrap">';
        BLOOD_SYMPATHY_TIERS.forEach(t => {
          html += `<button class="mchip bs-tier-chip${tier === t.key ? ' on' : ''}" data-t="${esc(t.key)}">${esc(t.label)}<br><span style="opacity:.7">${esc(t.sub)}</span></button>`;
        });
        html += '</div><div class="panel-section">Approach</div><div class="vm-chip-wrap">';
        html += `<button class="mchip bs-force-chip${forced === false ? ' on' : ''}" data-f="0">Passive (free)</button>`;
        html += `<button class="mchip bs-force-chip${forced === true ? ' on' : ''}" data-f="1">Forced (1 WP)</button>`;
        html += '</div>';
        if (tier && forced !== null) {
          const t = BLOOD_SYMPATHY_TIERS.find(x => x.key === tier);
          const total = witsV + bp + t.mod;
          html += `<div class="panel-total">Wits <b>${witsV}</b> + Blood Potency <b>${bp}</b> + ${esc(t.label)} <b>${t.mod >= 0 ? '+' : ''}${t.mod}</b> = <b>${total}</b> dice</div>`;
          html += '<button class="pnl-confirm-btn" id="bloodsym-load">Load Pool</button>';
        }
        body.innerHTML = html;
        body.querySelectorAll('.bs-tier-chip').forEach(btn => btn.addEventListener('click', () => { tier = btn.dataset.t; render(); }));
        body.querySelectorAll('.bs-force-chip').forEach(btn => btn.addEventListener('click', () => { forced = btn.dataset.f === '1'; render(); }));
        document.getElementById('bloodsym-load')?.addEventListener('click', () => {
          const t = BLOOD_SYMPATHY_TIERS.find(x => x.key === tier);
          const total = witsV + bp + t.mod;
          const pi = {
            total, attr: 'Wits', attrV: witsV, skill: null, skillV: 0,
            discName: null, discV: 0, resistance: null, noWP: false,
            willpower_cost: forced ? 1 : 0,
            // rcv.5: ported from the mockup's own rules-summary text
            // (app.js:1256-1268), edited to describe all four tiers generally
            // rather than the mockup's own dynamic per-selection text (this
            // app's pi.effect is static per-tile, matching every other tile).
            effect: 'Detects a blood relative within the same city: sire or childe (+3), sibling, grandsire, or grandchilde (+2), cousin, a sire\'s sibling, or great-grandsire/childe (+1), or a clanmate (+0). Passive detection is free and ambient; forcing a connection to a specific target costs 1 Willpower. This roll cannot dramatically fail, regardless of pool size.\n\nSuccess: a vague impression of the relative\'s mental state and general direction. Exceptional success: also their rough distance, whether they have reached torpor or Final Death, and a single short sentence through the blood tie.',
            action: 'Instant action',
          };
          loadPool(total, 'Detecting Blood Sympathy', pi);
        });
      };
      render();
    }
  }
  ```
  Verify `getAttrVal`/`esc`/`loadPool` are already imported/in scope at this point in `app.js` (they
  are — used identically by the neighbouring `lashout`/`clash`/`bloodbond` branches) before assuming
  no new imports are needed.

- [ ] Task 3 (testing) — extend `tests/rcv-3a-rules-explanation-box.spec.js` (this exercises the same
  shared Rules-explanation box the other four Vampire Mechanics tiles already have coverage in,
  matching the convention `rcv.3c` established) OR a new dedicated spec if the panel interaction
  itself (chip picking, total computation, both Passive and Forced cost paths) needs enough coverage
  that bolting it onto that file would bloat it — use your own judgement on file placement, but do not
  skip covering: the tile appears in the Special accordion; both chip groups are independently
  required before Load Pool appears; the total formula is correct for at least two different tiers;
  Passive costs 0 WP and Forced costs 1 WP (assert via the cost chip, matching the pattern
  `tests/rcv-3a-rules-explanation-box.spec.js`'s own Lash Out Kindred/Mortal tests already use); the
  Rules-explanation box shows the ported copy with two separate paragraphs.

## Dev Notes

### File List (expected)

- `public/js/game/char-pools.js` — modified (Task 1: new `VM_CHOICE` entry).
- `public/js/app.js` — modified (Task 2: new `bloodsympathy` panel mode).
- A test file (Task 3) — extended existing or new, per implementer's own judgement on placement.

### References

- [Source: specs/epic-rcv-roller-convergence.md] — rcv.5's own epic-doc section.
- [Source: scratchpad/roller-live-recovered/public/app.js:95-111,684-735,1256-1268] — read in full for
  this story's own design-lock pass (tier data, the mockup's own two-screen wizard, its rules-summary
  copy).
- [Source: public/js/app.js:1111-1158,1159-1211,1213-1253] — the three live panel branches
  (`lashout`/`clash`/`bloodbond`), read in full as this app's own real precedent for panel structure,
  chip-group shape, and cost-field conventions.
- [Source: public/js/game/char-pools.js:152-156] — the exact `VM_CHOICE` array this story extends.
- [Source: public/js/suite/roll-v2.js:257-291] — `updRulesSummary()`, confirming `effect`/`action`
  render exactly the same way for this tile as for any other (no category-specific code needed).
- [Source: public/js/shared/dice.js] — confirmed no "dramatic failure" concept exists anywhere in the
  dice engine, grounding AC7's "documented, not enforced" call.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-loop Phase 2 delegate, 2026-08-30)

### Completion Notes List

- Implemented Tasks 1-2 per the story's own exact code blocks: `char-pools.js`'s `VM_CHOICE` gained
  the fourth entry, `app.js`'s `openPanel()` gained the new `bloodsympathy` branch, inserted after
  `bloodbond` and before `custom` exactly as specced.
- Real bug caught and fixed in my own spec's own Task 2 code block, not the implementer's fault:
  the tier chip markup used `<br><span style="opacity:.7">` for the two-line label/sub-text, which
  (a) violates `CLAUDE.md`'s ban on inline `style="..."` in JS-rendered HTML, and (b) would not have
  rendered correctly at all — `.mchip`'s base rule is `display:flex` with `flex-direction: row`
  (the default), and a `<br>` element inside a flex ROW container becomes its own flex item rather
  than forcing a line wrap the way it does in normal block/inline flow, so "Once Removed" and "Sire
  or childe" would have laid out side-by-side, not stacked. The implementer caught this, replaced the
  inline style with a real `.bs-tier-sub` class, and added `.vm-chip-wrap .mchip.bs-tier-chip{flex-
  direction:column; height:auto; min-height:36px; ...}` to make the two lines genuinely stack. Both
  new rules use existing tokens only (`--fs-floor-micro`, `--gdim`). Verified visually via a throwaway
  screenshot: all four tier chips render correctly on two lines.
- Real inconsistency in my own story caught and correctly resolved: AC3's own prose described the
  Approach chip labels as "Free — ambient detection only" (containing an em-dash I missed when I
  swept only the `effect:` string for violations, not the AC text itself) while Task 2's code block
  used "Passive (free)"/"Forced (1 WP)" — the implementer followed the code block (as instructed, and
  because it matches Lash Out's own established "Kindred (1 WP)"/"Mortal (free)" precedent more
  closely), which also meant the em-dash never reached shipped code. AC3's wording corrected here to
  match what was actually built.
- New spec `tests/rcv-5-detecting-blood-sympathy.spec.js` (a new file, not appended to `rcv-3a`'s own
  spec — the implementer's own judgement call, reasoned: the panel-interaction coverage here is
  substantial and a different concern from that file's own Rules-box focus). 14/14 tests, covering:
  the tile in the Special accordion; both chip groups rendering together with all four tier
  labels+subs; independent gating before Load Pool appears; the total formula for all four tiers;
  Forced/Passive cost chips; cost driven by Approach not tier; `noWP:false` composing additively with
  the WP(+3) chip; no resistance section; the Rules box showing two separate paragraphs.
- One necessary, non-defect update to `rcv-2`'s own spec: its Special-accordion count-badge assertion
  moved from 5 to 6 in two places, since that test's own point is asserting the badge is correctly
  DERIVED from the real tile count, and it correctly picked up the new fourth VM_CHOICE tile.
- Regression: `tests/rcv-3a-rules-explanation-box.spec.js` + `tests/rlv-4-custom-pool-builder.spec.js`
  + `tests/rlv-2-single-roller-retirement.spec.js` + `tests/rcv-2-three-independent-accordions.spec.js`
  + `tests/rlv-7-persistent-mod-chips.spec.js` = 75/75; combined with the new spec's own 14, 89/89
  total across all six suites in one invocation. Vitest, the 2 `server/tests/` files referencing
  `VM_CHOICE`/`opensPanel`/`char-pools`/`openPanel` (`gdx-11-vampire-mechanics-quick-actions`,
  `issue-879-defence-penalty-wirein`) = 90/90.
- Line-number drift confirmed and worked around: the story's own citations for the `clash`/`bloodbond`
  panel branches were ~9-10 lines stale (content unchanged, just shifted by earlier stories' own
  edits) — the implementer worked from actual current content, not the stale numbers.

### File List

- `public/js/game/char-pools.js` — modified (Task 1: fourth `VM_CHOICE` entry).
- `public/js/app.js` — modified (Task 2: new `bloodsympathy` panel mode).
- `public/css/suite.css` — modified beyond the story's own File List (review-fix: `.bs-tier-chip`/
  `.bs-tier-sub`, replacing a broken inline-style approach in the story's own code block).
- `tests/rcv-5-detecting-blood-sympathy.spec.js` — new (14 tests).
- `tests/rcv-2-three-independent-accordions.spec.js` — modified (count-badge assertion 5→6, a correct
  consequence of the new tile, not a defect).

## Senior Developer Review (self, inline per bmad-loop Phase 3)

**Reviewed:** 2026-08-30. **Mode:** ORCHESTRATOR, inline — full independent re-verification.

### Independent re-verification

- Read the full diff of `app.js`'s new panel branch directly: matches the story's own Task 2 code
  block exactly, with the one flagged, verified-correct CSS deviation.
- Independently confirmed the flex/`<br>` layout bug claim by reading `.mchip`'s base CSS rule
  directly (`display:flex`, default row direction, fixed `height:48px`) rather than taking the
  implementer's explanation on faith — the diagnosis holds.
- Re-ran every suite myself: `tests/rcv-5-detecting-blood-sympathy.spec.js` **14/14**, the 5-suite
  broader regression **75/75** (89/89 combined with the new spec), vitest **90/90** — all matched the
  implementer's own reported numbers exactly.
- Swept the actual diff for em-dashes in added lines: all hits were code comments (this codebase's
  own established comment style), none in string literals or rendered copy.
- Visually verified via a throwaway Playwright screenshot (Once Removed + Forced selected, deleted
  after use): all four tier chips render correctly as two-line stacked labels, selections highlight,
  the total line reads "Wits 3 + Blood Potency 2 + Once Removed +3 = 8 dice" correctly.

### Finding (self)

**[Low, self-caught, already correctly resolved by the implementer] AC3's own prose described chip
copy that differed from what Task 2's code block actually specified, and AC3's version contained an
em-dash I missed during this story's own drafting.** Not a live defect (the implementer followed the
code block, which is what shipped), but a real inconsistency in the record. Fixed: AC3's wording now
matches the shipped "Passive (free)"/"Forced (1 WP)" copy, with a note explaining the correction.

No unresolved High/Medium findings. Story closed `done`.

### Outcome

Story status: `done`. A genuinely new tile, built by reusing the existing panel component and this
app's own established one-screen chip-group pattern rather than the mockup's own incompatible
two-screen wizard. One real CSS/layout bug in my own story spec caught and fixed by the implementer,
verified independently. NOT committed, NOT pushed, NOT merged — this epic commits once at close, not
per-story.
