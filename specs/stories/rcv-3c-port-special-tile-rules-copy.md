# Story rcv.3c: Port the drafted Special-tile rules copy — Lash Out, Clash of Wills, Blood Bond Resistance

Status: done

## Scope correction, before Task 1 — read this first

The epic doc's own citation list names eight mechanics as candidates for this story. Tracing what is
actually live today, and what each one is really for, narrows this to three:

| Mechanic | In this story? | Why |
|---|---|---|
| Lash Out | **Yes** | Live VM_CHOICE tile today (`char-pools.js`), copy at `app.js:1246-1247`. |
| Clash of Wills | **Yes** | Live VM_CHOICE tile today, copy at `app.js:1306-1307` (needs editing, see below). |
| Blood Bond Resistance | **Yes** | Live VM_CHOICE tile today, copy at `app.js:1272-1273` (needs editing, see below). |
| Frenzy Resistance | No | Not cited in the epic doc's own list at all (silently excluded there already) — its copy belongs to Epic FRZ's own future Resistance Roll story, per `specs/epic-frz-frenzy-system.md`. |
| Humanity Check | No | `submitAction` only, never calls `loadPool()` — has no "currently loaded pool" for this box to attach to. The epic doc's own citation says this copy is "needed by `rcv.7`", not this story. |
| Detecting Blood Sympathy | No | Not a live tile — `rcv.5`'s own not-yet-built story. |
| Surprise/Perception | No | Not a live tile — `rcv.6`'s own not-yet-built story. |
| Defensive Reaction | No | Not one of the 5 live Vampire Mechanics tiles at all; the epic doc's own citation already flags it as "likely Epic CRD's own scope, confirm before porting" — out. |

**Two of the three in-scope mechanics' mockup copy cannot be ported verbatim** — re-read against the
REAL live panels (`app.js`'s `lashout`/`clash`/`bloodbond` panel modes), not assumed from the mockup
alone:

- **Clash of Wills** (`app.js:1303-1310` in the mockup): references "Toggle Contested Roll below" and
  a "duration bonus... already folded into this card's base" — **neither exists in the live panel**
  (`app.js:1159-1211`, the real `mode === 'clash'` branch: just a Your-Discipline/Their-Discipline
  chip picker, no contested-roll toggle, no duration-bonus tracking). Porting this language verbatim
  would describe a UI the player is looking at and cannot find. Edited below to describe the rule
  itself, not an instruction to a control that doesn't exist.
- **Blood Bond Resistance** (`app.js:1269-1275` in the mockup): says the cumulative -1 penalty is
  "tracked below" — the live panel (`app.js:1213-1253`) has this as a **manual "Prior Resistance
  Attempts" chip picker positioned ABOVE the Load Pool button**, not an automatic running tracker
  below the result. Edited below to match.
- **Lash Out** (`app.js:1243-1247` in the mockup): the mockup's own first paragraph is dynamic
  per-selection flavour text (`selected.aspectDesc`) with no live equivalent (the live panel offers
  three FIXED aspect chips — Monstrous/Strength, Seductive/Presence, Competitive/Intelligence,
  `app.js:1122-1126` — not a freeform description). The mockup's second paragraph (the actual
  mechanical rule) is fully portable verbatim. Replaced the first paragraph with a general sentence
  naming the three real aspect options, rather than paraphrasing something dynamic that doesn't exist.

This matches this session's own established discipline twice over: reference the real mockup rather
than reinventing ([[feedback-reference-real-mockup-not-reinvented-design]]) — AND verify the mockup's
own claims against the real, current live code before trusting them, the same discipline that
corrected rcv.1's Riding the Wave scope and rcv.3a/3b's own architecture. A mockup built before Epic
CRD's contested-roll system existed cannot be assumed accurate about what UI a live tile offers today.

## Story

As an ST or player with Lash Out, Clash of Wills, or Blood Bond Resistance loaded on the Roll tab,
I want to see what the mechanic actually does and costs, in the same Rules-explanation box every other
pool already has,
so that I don't have to remember or look up a rule I use rarely.

## Design source — architecture, resolved by tracing the code, not assumed

**No new UI component is needed. This wires copy into the box `rcv.3a` already shipped and reviewed.**
`updRulesSummary(pi)` (`roll-v2.js:257-291`) already renders `pi.effect`/`pi.action` whenever they're
present, for ANY loaded pool — its gate has never been category-aware. `rcv.3a`'s own Senior Developer
Review explicitly anticipated this: reviewing why the gate does NOT also key on
`vitae_cost`/`willpower_cost` (which Lash Out and Blood Bond Resistance's `pi` objects DO carry), it
says outright — *"those tiles are explicitly rcv.3c's job, not this box's."* This story is that job:
add `effect`/`action` fields to each mechanic's own `pi`-building code, and the already-shipped box
picks them up with no further wiring.

- **Lash Out, Blood Bond Resistance**: both already have a dedicated, pure, unit-tested pool-builder
  function in `public/js/shared/resist.js` — `lashOutPool(char, attr, kindred)` (`:73-86`) and
  `bloodBondPool(char, vitae, attempts)` (`:98-109`). Add the two new fields directly inside each
  function's own returned `pi` object.
- **Clash of Wills**: has no extracted function — its `pi` is built inline at the `clash-load` click
  handler in `app.js` (`:1205-1209`, currently `const pi = { total, attr: 'Blood Potency', attrV: bp,
  skill: null, skillV: 0, discName: myDisc, discV: myDots, resistance: 'v ' + abbr + ' + BP', noWP:
  false };`). Add the two new fields to that object literal directly — no extraction needed for this
  story (that would be a separate, unrelated refactor).

**`rules_text`/`rules_source` are deliberately NOT set for any of the three.** Those fields (and the
shared `renderRulesExpander()` component that reads them) exist specifically for real, page-cited,
verbatim-uplifted rulebook text (`shared/rules-text.js`, issue #994/#992) — none of these three
mechanics have a `purchasable_powers` doc at all (confirmed: `server/schemas/purchasable_power.schema.js`'s
own `categoryEnum` is `['attribute', 'skill', 'discipline', 'merit', 'devotion', 'rite',
'manoeuvre']` — no category exists for a universal core mechanic like this). The copy below is edited,
paraphrased summary prose adapted from the mockup, not a verbatim citation — setting `rules_text`
would misrepresent it as one. `effect`/`action` alone are the honest, correct fields.

**One small, precedented extension to `updRulesSummary()` is needed**: `pi.effect` currently renders
as a single `<p class="power-desc">` — fine for every Discipline/Rite/Devotion `description` field
seen so far (all single-paragraph), but Lash Out's and Blood Bond Resistance's own copy below is
naturally two short paragraphs, and squashing them into one loses the "what it does" / "what it costs"
separation the mockup itself kept as two `power-desc` elements. Split `pi.effect` on a blank line
(`\n\n`) into multiple `<p class="power-desc">` tags — the exact same paragraph-splitting convention
`shared/rules-text.js`'s own `renderRulesText()` already uses for `rules_text` (`shared/rules-text.js:40-51`),
applied here too rather than inventing a second convention.

## Acceptance Criteria

1. `lashOutPool(char, attr, kindred)` (`shared/resist.js`) returns a `pi` with `effect` (two
   paragraphs, `\n\n`-joined — see Task 1 for exact copy) and `action: 'Instant action'` added, no
   other field changed.
2. `bloodBondPool(char, vitae, attempts)` (`shared/resist.js`) returns a `pi` with `effect` (two
   paragraphs) and `action: 'Instant · reactive'` added, no other field changed.
3. The inline Clash of Wills `pi` object (`app.js`'s `clash-load` handler) gets `effect` (two
   paragraphs) and `action: 'Instant · contested'` added, no other field changed.
4. `updRulesSummary()` (`roll-v2.js`) splits `pi.effect` on `\n\n` into one `<p class="power-desc">`
   per paragraph, replacing the current single-`<p>` rendering. A single-paragraph `effect` (every
   existing Discipline/Rite/Devotion case) renders identically to today — this is a strict superset of
   current behaviour, not a behaviour change for anything already shipped.
5. Loading any of the three tiles shows the Rules-explanation box (already true today via the existing
   `willpower_cost`/`discName` etc. — this story adds real content where the box would otherwise show
   only a bare cost chip with an empty body, since none of the three previously set `effect`/`action`
   at all).
6. No change to any of the three mechanics' own dice math, cost, or panel UI — this story only adds
   descriptive text fields to an already-correct `pi` object.

## What this story is NOT

- **Not** Frenzy Resistance, Humanity Check, Detecting Blood Sympathy, Surprise/Perception, or
  Defensive Reaction — see the scope table above for why each is out.
- **Not** a `rules_text`/`renderRulesExpander()` wiring for any of the three — they have no
  `purchasable_powers` doc to source real page-cited text from; `effect`/`action` are the correct,
  honest fields.
- **Not** a Clash-of-Wills refactor extracting its `pi` construction into `shared/resist.js` alongside
  the other two — a real, separate, unrelated cleanup; this story edits the inline object literal
  where it already lives.
- **Not** a change to Epic CRD's own contested-roll system, even though Clash of Wills' copy touches
  on "contested" — this story only describes the existing chip-picker mechanic, it does not add or
  change any contested-roll wiring.

## Tasks / Subtasks

- [ ] Task 1 (AC1) — `public/js/shared/resist.js`, `lashOutPool()`:
  ```js
  return {
    total,
    pi: {
      total, attr, attrV, skill: null, skillV: 0, discName: null, discV: 0,
      resistance: 'v ' + attr + ' + BP',
      willpower_cost: kindred ? 1 : 0,
      noWP: false,
      // rcv.3c: ported from the recovered mockup (app.js:1243-1247), edited —
      // the mockup's own first paragraph was dynamic per-aspect flavour text
      // with no live equivalent; replaced with a general line naming the
      // three real fixed aspect chips this app actually offers.
      effect: 'Lash out with an aspect of the Beast: Monstrous (Strength), Seductive (Presence), or Competitive (Intelligence), to force compliance or provoke fear.\n\nCosts 1 Willpower against Kindred; free against a mortal. If the target fights back, they roll their own Power Attribute + Blood Potency; more successes flips who gains the Condition.',
      action: 'Instant action',
    },
  };
  ```

- [ ] Task 2 (AC2) — `public/js/shared/resist.js`, `bloodBondPool()`:
  ```js
  return {
    total,
    pi: {
      total, attr: 'Blood Potency', attrV: bp, skill: null, skillV: 0,
      discName: null, discV: 0, resistance: null,
      noWP: true, willpower_cost: 1,
      // rcv.3c: ported from the mockup (app.js:1269-1275), edited — "tracked
      // below" replaced since the live panel is a manual chip picker ABOVE
      // the Load Pool button, not an automatic running tracker.
      effect: 'Any time a point or more of Vitae is imbibed, it creates or reinforces a blood bond. Spend 1 Willpower and roll Blood Potency minus the Vitae ingested (the Willpower does not add dice). Success: that drink does not add to the bond; Vitae addiction still applies normally. Mortals have no such defence.\n\nFurther attempts to resist a bond from the same vampire, across repeated feedings, take a cumulative −1 die penalty each time: enter how many prior attempts above.',
      action: 'Instant · reactive',
    },
  };
  ```

- [ ] Task 3 (AC3) — `public/js/app.js`, the `clash-load` click handler (`:1205-1209`):
  ```js
  document.getElementById('clash-load')?.addEventListener('click', () => {
    const abbr = Object.entries(DISC_ABBR).find(([, full]) => full === theirDisc)?.[0] || theirDisc;
    const pi = {
      total, attr: 'Blood Potency', attrV: bp, skill: null, skillV: 0,
      discName: myDisc, discV: myDots, resistance: 'v ' + abbr + ' + BP', noWP: false,
      // rcv.3c: ported from the mockup (app.js:1303-1310), edited — dropped
      // "Toggle Contested Roll below" and the duration-bonus language, since
      // this live panel has neither; describes the rule, not an instruction
      // to a control that doesn't exist here.
      effect: 'When two Disciplines directly oppose each other and neither power\'s own system resolves it, both sides pool Blood Potency + dots in the Discipline fuelling their side and roll off. The side with more successes wins outright; the others fail. Ties reroll until someone pulls ahead.\n\nWillpower may only bolster this roll if your character is physically present and aware powers are clashing (p.126).',
      action: 'Instant · contested',
    };
    loadPool(total, 'Clash of Wills', pi);
  });
  ```

- [ ] Task 4 (AC4) — `public/js/suite/roll-v2.js`, `updRulesSummary()`: replace the single-paragraph
  `descHtml` line with a paragraph-per-blank-line split, matching `shared/rules-text.js`'s own
  established convention:
  ```js
  const descHtml = pi.effect
    ? pi.effect.split('\n\n').map(p => `<p class="power-desc">${esc(p)}</p>`).join('')
    : '';
  ```
  (Current line: `const descHtml = pi.effect ? \`<p class="power-desc">${esc(pi.effect)}</p>\` : '';` —
  a single-paragraph `effect` with no `\n\n` produces one array entry, so this is a strict superset,
  not a behaviour change for existing callers.)

- [ ] Task 5 (testing) — extend `tests/rcv-3a-rules-explanation-box.spec.js` (this is coverage of the
  same shared box, not a new feature — same convention `rcv.3b` already established for appending
  rather than a new file). At minimum: load each of the three tiles (Lash Out via the aspect+nature
  panel, Blood Bond Resistance via the vitae+attempts panel, Clash of Wills via the discipline-vs-
  discipline panel — reuse/extend this spec's own `RICH_CHAR`/`setupSuite` fixtures, adding a second
  character on `suiteState.RESIST_CHAR` where Clash of Wills needs an opposing character's own
  disciplines) and confirm the box shows both paragraphs as separate `<p>` elements, the correct
  `action` text, and the correct cost chip (Kindred vs Mortal Lash Out, Vitae/Attempts Blood Bond
  Resistance). Also confirm a single-paragraph `effect` (any existing Discipline fixture) still
  renders as exactly one `<p>` — Task 4's own regression guard.

## Dev Notes

### Why edit the mockup's copy instead of reporting the discrepancy and stopping

This session's own standing rule is to reference the real mockup rather than reinvent it — but that
rule exists to stop a paraphrased, under-researched *recap* of the mockup from silently drifting away
from real, carefully-drafted copy. It was never a rule to port text describing a UI element that
provably does not exist on the page the player is looking at. The three edits above are documented,
minimal, and each is justified by reading the REAL live panel code, not by guessing what "probably"
changed — the same diligence, applied in the other direction.

### References

- [Source: specs/epic-rcv-roller-convergence.md] — rcv.3c's own original citation list.
- [Source: scratchpad/roller-live-recovered/public/app.js:1243-1310] — read in full for this story's
  own design-lock pass (the `lashout`/`bloodsym`/`resistbond`/`clashofwills` `rulesKind` branches).
- [Source: public/js/app.js:1111-1211] — the live `lashout`/`clash` panel modes, read in full to
  confirm what UI actually exists today.
- [Source: public/js/app.js:1213-1253] — the live `bloodbond` panel mode, read in full.
- [Source: public/js/shared/resist.js:66-109] — `lashOutPool()`/`bloodBondPool()`, read in full; the
  exact functions this story extends.
- [Source: public/js/suite/roll-v2.js:257-291] — `updRulesSummary()`, rcv.3a's own already-shipped
  code; Task 4's own exact edit point.
- [Source: public/js/shared/rules-text.js:40-51] — `renderRulesText()`'s own blank-line paragraph
  split, the precedent Task 4 reuses rather than inventing a second convention.
- [Source: server/schemas/purchasable_power.schema.js:15-17] — `categoryEnum`, confirming none of
  these three mechanics could ever have a `purchasable_powers` doc, hence no `rules_text` field.
- [Source: specs/stories/rcv-3a-rules-explanation-disciplines-rites.md] — rcv.3a's own Senior
  Developer Review, whose patched fix #2 explicitly names this story as the one that wires real
  content into the Vampire Mechanics tiles' `pi` objects.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-loop Phase 2 delegate, 2026-08-30)

### Completion Notes List

- Implemented Tasks 1-4 per the story's own exact code blocks: `lashOutPool()`/`bloodBondPool()`
  (`shared/resist.js`) gained `effect`/`action`; the inline Clash of Wills `pi` (`app.js`'s
  `clash-load` handler) gained the same; `updRulesSummary()` (`roll-v2.js`) now splits `pi.effect` on
  a blank line into multiple `<p class="power-desc">` tags. Neither `char-pools.js` nor
  `shared/pools.js` touched; Clash of Wills' `pi` construction NOT extracted into `resist.js` (both
  explicitly out of scope per the story's own "What this story is NOT").
- Task 5 (testing): extended `tests/rcv-3a-rules-explanation-box.spec.js` (not a new file, matching
  `rcv.3b`'s own established convention) with a source-fetch smoke plus 4 live-flow tests (Lash Out
  Kindred, Lash Out Mortal, Blood Bond Resistance, Clash of Wills) and one regression guard proving a
  single-paragraph `effect` still renders as exactly one `<p>` — 21/21 at dev-story completion (15
  pre-existing rcv.3a/3b + 6 new).
- Real infrastructure finding during Task 5 (not a story defect): `public/js/dev-fixtures.js`
  (dynamically imported whenever `tm_auth_token === 'local-test-token'`, which `setupSuite` must set)
  monkey-patches `window.fetch` and answers `GET /api/characters` from its own baked 31-character
  blob — a sibling of this spec's own documented Service Worker leak, meaning
  `page.route('/api/characters')` cannot stub a second, opposing character for the Clash of Wills test
  the way it stubs the primary one. Resolved by mirroring `app.js`'s own real boot step 2b
  (`app.js:842-846`, which merges combat-only characters onto `suiteState.chars` for exactly this
  "resist target" purpose) via a new `addResistTarget()` helper that imports the real `suite/data.js`
  module in-page and pushes onto it directly — real production code exercised end-to-end (the
  `#resist-sel` dropdown, `updResist()`, the Clash panel's own chip row), not a shortcut that skips
  any of it.
- Regression at dev-story completion: `tests/rlv-4-custom-pool-builder.spec.js` +
  `tests/rlv-2-single-roller-retirement.spec.js` + `tests/rcv-2-three-independent-accordions.spec.js`
  = 37/37; 9 vitest suites referencing `lashOutPool`/`bloodBondPool`/`resist.js`/`roll-v2.js` (crd-2,
  crd-3b, equipment-client-fixes, gdx-7, gdx-8, gdx-11, gdx-12, rlv-1, rlv-7) = 269/269.

### File List

- `public/js/shared/resist.js` — modified (Tasks 1-2: `effect`/`action` on `lashOutPool()`/
  `bloodBondPool()`'s returned `pi`).
- `public/js/app.js` — modified (Task 3: `effect`/`action` on the inline Clash of Wills `pi`).
- `public/js/suite/roll-v2.js` — modified (Task 4: `updRulesSummary()`'s `descHtml` now splits on
  `\n\n`).
- `tests/rcv-3a-rules-explanation-box.spec.js` — modified (Task 5: `SPECIAL_SEC`, `CLASH_OPPONENT`,
  `openSpecialTile()`, `addResistTarget()`, 6 new tests; file's own total now 21).

## Senior Developer Review (self, inline per bmad-loop Phase 3)

**Reviewed:** 2026-08-30. **Mode:** ORCHESTRATOR, inline — full independent re-verification of the
diff, plus a real finding of my own beyond what the dev-story agent reported.

### Independent re-verification

- Read the full diff of every changed file directly (`git diff`) — matches the story's own Tasks 1-4
  code blocks exactly; no unrequested scope (no touch to `char-pools.js`, `shared/pools.js`, no
  extraction of Clash of Wills into `resist.js`).
- Re-ran the extended spec, the 3 broader Playwright regression suites, and the 9 vitest suites
  myself rather than trusting the subagent's own reported counts: **21/21, 37/37, 269/269** — all
  matched exactly.
- Read `addResistTarget()`'s own implementation and the Clash of Wills test in full: confirmed it
  exercises the real `#resist-sel` dropdown → `updResist()` → chip-row path, not a shortcut that
  assigns `RESIST_CHAR` directly (which would have proven nothing about the real production flow).
- Visually verified via a throwaway Playwright screenshot (Lash Out, Monstrous aspect, Kindred,
  deleted after use): the box renders "1 WILLPOWER", "Instant action", and both paragraphs as visually
  distinct blocks with correct spacing.

### Finding (self, not from the dev-story agent's own report)

**[High — hard rule violation, self-caught] The ported copy for Lash Out and Blood Bond Resistance
contained em-dashes, violating this project's own explicit hard rule** (`CLAUDE.md`: "No em-dashes
... in app-authored strings or player-facing prose"). This was **my own error, introduced in the
story spec's own Task 1/2 code blocks** — the dev-story agent implemented them correctly, verbatim,
exactly as instructed; the mistake was mine, in the copy I wrote when scoping the story, not
introduced during implementation. The dev-story agent itself flagged the tension explicitly in its own
report rather than silently re-editing carefully-drafted copy without authorisation — the right call,
since a subagent silently rewriting specced copy would be its own problem.

**Fix:** re-punctuated both strings (em-dash → colon or semicolon, matching sentence structure) in
`resist.js`, the story's own Task 1/2 code blocks (so the record matches what's actually live), and
the test file's `LASH_OUT_P1`/`LASH_OUT_P2` constants (the only test assertions checking exact string
content — Blood Bond Resistance's own test uses `toContainText()` substrings unaffected by the
punctuation change). Clash of Wills' own copy had zero em-dashes to begin with, confirmed by direct
grep. Re-ran the full extended spec after the fix: **21/21**, unchanged.

No unresolved High/Medium findings after the fix. Story closed `done`.

### Outcome

Story status: `done`. All three Vampire Mechanics tiles now carry real, edited-for-accuracy copy
through the box `rcv.3a` shipped; one em-dash hard-rule violation self-caught and fixed across source,
story spec, and tests. NOT committed, NOT pushed, NOT merged — this epic commits once at close, not
per-story.
