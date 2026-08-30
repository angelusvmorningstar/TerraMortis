# Story rcv.6: Surprise/Perception — new Vampire Mechanics tile

Status: done

## Design source — no panel needed, and the resistance mechanism already fully supports this

Per the epic doc's own framing: *"Surprise/Perception... has no branching choice at all — fixed Wits +
Composure, contested by the attacker's Dexterity + Stealth... no client wizard needed, it's an
immediate-roll tile like Frenzy Resistance."* Confirmed directly against the mockup's own server-side
data (`roller-live/server.mjs:220-238`, the comment explaining exactly why this item — unlike Lash Out,
Detecting Blood Sympathy, Blood Bond Resistance, Clash of Wills — has no per-tap choice and is
"computed here like a skill"): `base: dotsOf(Wits) + dotsOf(Composure)`, no chip groups, no panel.

**This means Surprise/Perception belongs in `char-pools.js`'s `VM_IMMEDIATE` array** (currently just
`Frenzy Resistance`, `char-pools.js:129-131`), not `VM_CHOICE` — a second immediate-roll tile, tapped
once, rolls straight away.

**Real finding: this app's existing resist-target system already fully supports the exact "Dexterity +
Stealth" contest, with zero new code.** Checked directly rather than assumed: `shared/resist.js`'s
`parseResistance()` (`:36-62`) splits a `resistance` string on `+` and resolves each token
independently by type — `ATTRS` (`:9-13`) includes `Dexterity`, `SKILLS` (`:20-23`) includes
`Stealth`, and `getResistTokenVal()` (`:123-131`) already reads an `attr`-type token via
`getAttrEffective` and a `skill`-type token via `skDots`. This is the exact same mechanism Clash of
Wills already uses live (`resistance: 'v ' + abbr + ' + BP'`) — just with an attr+skill combo instead
of a discipline+BP one, which the parser already handles token-by-token without caring which types are
mixed. Setting `resistance: 'v Dexterity + Stealth'` on this tile's `pi` is the whole implementation:
the existing `#resist-sel` dropdown, `showResistSec()`, and `updResist()` do the rest, unchanged.

**The mockup's own rules-summary copy for this mechanic (`app.js:1316-1320`) references "Toggle
Contested Roll below"** — the SAME kind of stale UI instruction `rcv.3c` already found and edited out
of Clash of Wills' own copy (that mockup toggle doesn't exist in this app). Unlike Clash of Wills,
though, this app's real resist-target dropdown genuinely IS the live mechanism for running this
contest (see above) — so the copy is edited to point at the real, working control by its real name,
not simply stripped the way Clash of Wills' was.

## Story

As an ST or player whose character might be ambushed,
I want a Surprise/Perception tile that rolls Wits + Composure and lets me pick the attacker to see
their contesting Dexterity + Stealth pool,
so that I don't have to work out either side of the roll by hand.

## Acceptance Criteria

1. `char-pools.js`'s `VM_IMMEDIATE` array (currently `:129-131`) gains a second entry:
   `{ label: 'Surprise / Perception', a1: 'Wits', a2: 'Composure', resistance: 'v Dexterity + Stealth', effect: '...', action: 'Instant action' }`
   (see Task 1 for the exact `effect` copy).
2. The `VM_IMMEDIATE` loop (currently `:132-151`) is extended to thread `m.resistance`/`m.effect`/
   `m.action` onto the built `pi` object when present on the array entry, falling back to today's
   exact values (`resistance: null`, no `effect`/`action` keys) when absent — **Frenzy Resistance's own
   entry gets no new fields and its `pi`/rendering is byte-identical to today**, since it deliberately
   has no replacement rules note yet (`rcv.1`'s own scope).
3. Tapping the tile rolls immediately (no panel) — `VM_IMMEDIATE` tiles already call `poolBtn()`
   directly today, unchanged by this story.
4. The resist-target dropdown (`#resist-sel`) becomes available once this pool is loaded, exactly as
   it already does for Lash Out/Clash of Wills/Blood Bond Resistance — picking an opposing character
   computes their Dexterity + Stealth pool via the existing, unmodified `parseResistance()`/
   `getResistTokenVal()` machinery.
5. `pi.effect`/`pi.action` are set so the already-shipped Rules-explanation box (`rcv.3a`) shows real
   copy for this tile, matching the pattern `rcv.3c` established for Lash Out/Clash of Wills/Blood Bond
   Resistance. Copy is edited from the mockup's own text (see Task 1) to name the real resist-target
   dropdown rather than the mockup's own non-existent "Toggle Contested Roll" control.
6. Existing Vampire Mechanics tiles (Frenzy Resistance, Lash Out, Clash of Wills, Blood Bond
   Resistance, Humanity Check, Detecting Blood Sympathy) and their own behaviour are unchanged.
7. No new CSS, no new panel mode, no change to `shared/resist.js` — this story only adds one array
   entry and threads three optional fields through an existing loop.

## What this story is NOT

- **Not** a `VM_CHOICE` panel tile — this mechanic has no branching choice, confirmed directly against
  the mockup's own server-side data and comment explaining exactly why.
- **Not** a change to `parseResistance()`, `getResistTokenVal()`, or any part of the resist-target
  system — it already fully supports this tile's own `resistance` string with zero modification.
- **Not** a "dramatic failure"-style new dice-engine mechanic — this tile has no such special rule to
  begin with (unlike `rcv.5`'s Detecting Blood Sympathy).
- **Not** `rcv.7` (Humanity Breaking Point) — a separate, unrelated tile.

## Tasks / Subtasks

- [ ] Task 1 (AC1, AC2) — `public/js/game/char-pools.js`:
  ```js
  const VM_IMMEDIATE = [
    { label: 'Frenzy Resistance', a1: 'Resolve', a2: 'Composure' },
    // rcv.6: no branching choice (confirmed against the mockup's own server-
    // side comment, roller-live/server.mjs:220-225) - an immediate roll like
    // Frenzy Resistance, not a panel tile. `resistance` reuses the EXISTING
    // resist-target system unchanged (shared/resist.js's parseResistance()
    // already handles an attr+skill token combo, confirmed before writing
    // this - see the story's own Design source).
    {
      label: 'Surprise / Perception', a1: 'Wits', a2: 'Composure',
      resistance: 'v Dexterity + Stealth',
      // rcv.6: ported from the mockup's own rules-summary text
      // (app.js:1316-1320), edited to name the real resist-target dropdown
      // rather than the mockup's own "Toggle Contested Roll below" control,
      // which does not exist in this app.
      effect: 'A character who does not realise they are about to be on the receiving end of violence rolls Wits + Composure to notice the ambush, contested by the attacker\'s Dexterity + Stealth. Pick the attacking character from the Resistance section below to compute their pool.\n\nFailure: your character cannot take an action in the first turn of combat, and cannot apply Defence that turn. Initiative for the second turn is determined as normal.',
      action: 'Instant action',
    },
  ];
  for (const m of VM_IMMEDIATE) {
    const v1 = getAttrEffective(char, m.a1);
    const v2 = getAttrEffective(char, m.a2);
    const total = v1 + v2;
    const idx = pools.length;
    const pi = {
      total, attr: m.a1, attrV: v1, skill: m.a2, skillV: v2, discName: null, discV: 0,
      resistance: m.resistance || null, noWP: false,
      ...(m.effect ? { effect: m.effect } : {}),
      ...(m.action ? { action: m.action } : {}),
    };
    pools.push({ total, label: m.label, attr: m.a1, attrV: v1, skill: m.a2, skillV: v2, nineAgain: false, resistance: m.resistance || null, pi });
    vmHtml += poolBtn(m.label, total, ab(m.a1) + '+' + ab(m.a2), idx, false);
    vmCount++;
  }
  ```
  Note the `pools.push(...)` line's own `resistance` field also needs to read `m.resistance || null`
  (currently hardcoded `resistance: null`) — both the `pools[]` entry and its nested `pi` must agree,
  matching how every other resistance-bearing tile already keeps them in sync.

- [ ] Task 2 (testing) — extend `tests/rcv-5-detecting-blood-sympathy.spec.js`'s own house style (or
  create a small dedicated spec — implementer's own judgement, matching the precedent `rcv.5` itself
  set for choosing file placement) covering: the tile appears in the Special accordion as an
  immediate-roll tile (not a `gcp-choice` panel tile); tapping it rolls straight away with the correct
  Wits+Composure total; the resist-target dropdown becomes available and, once an opposing character
  is picked, computes their real Dexterity+Stealth pool (reuse this repo's own existing resist-target
  test pattern from `tests/rcv-3a-rules-explanation-box.spec.js`'s Clash of Wills coverage — `#resist-sel`
  selection, `#resist-line` containing "dice"); the Rules box shows the ported two-paragraph copy;
  Frenzy Resistance's own tile and its lack of a Rules-explanation box are unchanged (regression guard
  proving Task 1's loop extension is additive, not a behaviour change for the existing entry).

## Dev Notes

### File List (expected)

- `public/js/game/char-pools.js` — modified (Task 1: `VM_IMMEDIATE` second entry, loop extended to
  thread optional `resistance`/`effect`/`action`).
- A test file (Task 2) — extended existing or new, per implementer's own judgement.

### References

- [Source: specs/epic-rcv-roller-convergence.md] — rcv.6's own epic-doc section.
- [Source: scratchpad/roller-live-recovered/server.mjs:210-254] — read in full for this story's own
  design-lock pass (why Surprise/Perception and Resisting Frenzy are both "no branching choice" items,
  computed server-side "like a skill").
- [Source: scratchpad/roller-live-recovered/public/app.js:1316-1320] — the mockup's own rules-summary
  copy this story edits.
- [Source: public/js/game/char-pools.js:119-151] — the exact live `VM_IMMEDIATE` array and loop this
  story extends, read in full.
- [Source: public/js/shared/resist.js:9-23,36-62,123-131] — `ATTRS`/`SKILLS`/`parseResistance()`/
  `getResistTokenVal()`, read in full and directly confirmed (not assumed) to already support an
  attr+skill resistance token combo before writing this story.
- [Source: specs/stories/rcv-3c-port-special-tile-rules-copy.md] — Clash of Wills' own copy-editing
  precedent (dropping a stale "Toggle Contested Roll" instruction), the closest sibling case to this
  story's own Task 1 copy edit.

## Dev Agent Record

### Agent Model Used

Claude Opus (orchestrator, inline — no subagent delegation; task was small and fully specified after
the story's own investigation confirmed the existing resist-target machinery needed no changes)

### Completion Notes List

- Implemented Task 1 exactly per the story's own code block: `VM_IMMEDIATE` gained the second entry,
  the loop extended to thread `resistance`/`effect`/`action` additively — confirmed `pools.push(...)`'s
  own `resistance` field (a second place the story's own code block flagged as needing to agree with
  `pi`'s) was updated too, not just `pi` itself.
- Task 2 (testing): new `tests/rcv-6-surprise-perception.spec.js`, 5 tests covering the tile's
  immediate-roll shape (no panel, no `gcp-choice` class), Frenzy Resistance's own unchanged behaviour,
  the resist-target dropdown computing a real Dexterity+Stealth pool against a distinct-dot-value
  opposing character fixture, and the Rules box's two-paragraph copy. All 5 passed on first run.
- Real gap found and fixed, not anticipated by the story: the new tile is the SEVENTH Vampire
  Mechanics tile (after `rcv.5`'s own Detecting Blood Sympathy made it six), and TWO separate
  hardcoded `'6'`/`6` assertions in `tests/rcv-2-three-independent-accordions.spec.js` needed updating
  to `7`/`'7'` — one was caught by a first grep sweep, a second (an array-literal form,
  `[SPECIAL_SEC, 6]`, inside a loop) was missed by that same grep and only surfaced when the full
  regression run actually failed. Both fixed; re-swept the whole `tests/` directory afterward for any
  remaining `SPECIAL_SEC`-adjacent hardcoded `6` and found none.
- Final regression: new spec (5/5) + `rcv-2-three-independent-accordions` + `rcv-3a-rules-explanation-
  box` + `rcv-5-detecting-blood-sympathy` + `rlv-4-custom-pool-builder` + `rlv-2-single-roller-
  retirement` + `rlv-7-persistent-mod-chips` = 94/94 in one invocation. Vitest, the 2 suites
  referencing `VM_IMMEDIATE`/`char-pools` = 90/90.
- Visually verified via a throwaway Playwright screenshot (deleted after use): the resist-target
  section appears with the correct "RESISTANCE — V DEXTERITY + STEALTH" label, the Rules box shows
  the two-paragraph copy with correct British spelling ("realise", "Defence"), and the dice total (6
  for Wits 3 + Composure 3) computes correctly.

### File List

- `public/js/game/char-pools.js` — modified (Task 1: second `VM_IMMEDIATE` entry, loop extended to
  thread optional `resistance`/`effect`/`action`).
- `tests/rcv-6-surprise-perception.spec.js` — new (5 tests).
- `tests/rcv-2-three-independent-accordions.spec.js` — modified (two hardcoded Special-tile-count
  assertions updated 6→7, a correct consequence of the new tile, not a defect).

## Senior Developer Review (self, inline)

**Reviewed:** 2026-08-30. Implemented directly by the orchestrator (no subagent), so this review is a
final independent pass over the finished diff and test results before closing, matching the same
rigor applied to every delegated story this epic.

### Verification

- Re-read the full diff of `char-pools.js` directly: matches the story's own Task 1 code block
  exactly, including the `pools.push(...)` line's own `resistance: m.resistance || null` (easy to
  miss, called out explicitly in the story precisely because it's a second place needing to stay in
  sync with `pi`).
- Confirmed via direct code read (not assumption) that `poolBtn()` never emits a `gcp-choice` class or
  "tap to choose" subtitle — those belong only to `choiceBtn()` — before writing the test assertion
  that depends on this distinction.
- Full regression run twice: once surfaced the second missed hardcoded count (a real, if minor, gap in
  my own first grep sweep), the second run after the fix was clean at 94/94.
- Visually confirmed the resist-target integration genuinely works end-to-end, not just that the
  string was set correctly — picked a real opposing character fixture with deliberately distinct dot
  values and confirmed the displayed pool total was the sum, not a coincidence.

No findings beyond the hardcoded-count gap already caught and fixed during implementation itself. No
unresolved High/Medium findings. Story closed `done`.

### Outcome

Story status: `done`. A second net-new Vampire Mechanics tile, implemented as a strict additive
extension to the existing `VM_IMMEDIATE` loop with zero new UI and zero changes to the resist-target
system it reuses. NOT committed, NOT pushed, NOT merged — this epic commits once at close, not
per-story.
