# Story rlv.2: promote roll-v2.js to the sole player roller; retire roll.js

Status: ready-for-dev (confirm D2/D3 in `epic-rlv-roller-harmonisation.md` with Angelus before
dev-story starts — this draft proceeds with the roundtable's recommended defaults for both, flagged
inline below wherever a default stands in for an unconfirmed decision)

## Story

As a player,
I want one dice roller, not a coin-flip between two depending on a setting I never touched,
so that the features/fixes that land only reach "the roller I use" — not a roller half the table
silently isn't on.

## Why this story exists

Confirmed by the Phase 0 audit (`specs/dice-roller-harmonisation-audit.md` §4a): `roll.js` and
`roll-v2.js` are **byte-identical on every gameplay-critical function** — `effPool`, `chgPool`,
`chgMod`, `loadPool`, and the entirety of `doRoll()`'s resolution logic (chance-die, Rote,
contested/opposed branch, exceptional threshold). The only real delta is additive: `roll-v2.js` has
gdx-7's reviewed, shipped vitae/willpower spend automation and the #1024 slice A+D UI (effective-pool
anchor, segmented Again pill) that `roll.js` lacks entirely. There is no rules-divergence risk in
promoting v2 — this story is safe specifically because that comparison has already been done and
confirmed, not because "it's probably fine."

The `tm-use-new-dice-roller` per-device flag itself is the direct cause of the Game 7 incident (spend
automation silently not firing on a phone that had never had the flag set) and the confirmed-live
`combat-tab.js` Quick Roll bug (rlv.1, independent fix, not blocked by this story). Every additional
week this flag exists is another week either kind of silent-mismatch bug can recur.

## What this story is NOT

- NOT the DOM-contract cleanup (converting the shared-ID convention into a real
  `getPool()`/`onRollComplete()`/`mountInto()` interface). Per Winston's recommendation (roundtable,
  full transcript referenced in the audit doc §3) and pending D2's confirmation, **this story keeps
  the existing shared-ID surface untouched** — `pval`, `mval`, `roll-btn`, `dice-area`, `hlist`,
  `rote-c`, `wp-c`, `sc-*`, `roll-char-pools`, `weapon-ref`, `resist-*`, `lifecycle-cards`,
  `btn-contested`, `effline`, `res-hdr` all keep their current names and shape on the promoted
  roller. The five external consumers (`app.js`, `shared/resist.js`, `game/contested-roll.js`,
  `game/combat-tab.js`, `game/challenge-notification.js`) should need **zero changes** as a result of
  this story specifically (rlv.1's fix is independent and can land before, after, or as part of this
  story with no conflict). DOM-contract cleanup is rlv.5, later, once this lands and soaks.
- NOT `dice-engine.js`'s builder UX or `char-pools.js`'s extension (rlv.4, blocked on rlv.3's state
  model design pass).
- NOT any of #1039's genuinely new features (persistent mod chips, status-diff mods — rlv.7/rlv.8).
- NOT the Rote rules fix (rlv.9, independent, pending D1).
- NOT deleting `roll.js` outright in this story. Per Winston's recommendation and pending D3's
  confirmation, **this story's default plan keeps `roll.js` in the tree, dead-code-fenced, for one
  full release cycle after the default flips**, as an explicit rollback fence — deletion is a
  trivial separate follow-up (rlv.6) once nobody's hit a regression in anger.

## Acceptance Criteria

1. `roll-v2.js` becomes reachable by every player without needing the `tm-use-new-dice-roller`
   flag set — **[DEFAULT PENDING D3 CONFIRMATION]** the roundtable's recommended path: keep the flag
   mechanism for one staged soak release (default OFF still routes to `roll.js` during the soak,
   default flips to ON — i.e., v2 — only after a confirmed session or two of live ST-observed use),
   rather than an immediate hard cutover. Confirm with Angelus before dev-story whether to take this
   staged path or cut over directly; either is implementable from this AC set, but the staging detail
   changes Tasks below.
2. A visible signal exists (boot-time console log at minimum; a tiny persistent on-screen badge is
   Winston's preferred option, not mandatory for this AC) stating which roller build is currently
   active on this device — directly closes the "which phone is on which version" undiagnosable-ness
   that caused the Game 7 incident. This ships regardless of the D3 answer.
3. Once the default flips to v2 (immediately, if D3 says cut over directly; after the soak, if
   staged), `roll.js`'s own tab/nav entry, Settings toggle, and DOM subtree remain present but
   unreachable in normal use only if D3 chose staging — if D3 chose a direct cutover, `roll.js`'s nav
   entry and Settings toggle are removed in this same story (its file stays, per "What this story is
   NOT," just disconnected from the UI).
4. No change to `roll-v2.js`'s own gameplay logic, spend mechanics, or UI — this story is purely
   about **reachability/defaults**, not features. Confirmed safe per the byte-identical finding in
   §4a of the audit doc; if implementation surfaces ANY behavioural difference between the files not
   already documented there, stop and flag it rather than resolving it silently — that would
   contradict the audit's own finding and needs Angelus's eyes before proceeding.
5. Existing tests for `roll.js`'s currently-covered behaviour continue passing against `roll-v2.js`
   where they exercise shared (confirmed-identical) logic — do not assume test coverage transfers
   automatically; verify the actual test files target the right module post-promotion.
6. Regression run: full suite of DT/roll-adjacent Playwright specs plus the vitest suites touching
   `tracker_state`/`purchasable_powers` spend paths (gdx-7's own test file is the closest existing
   coverage for the spend-automation half of this).

## Tasks / Subtasks

- [ ] Confirm D2 and D3 with Angelus (or proceed with the defaults named in ACs above, explicitly
  flagged as defaults-not-confirmed-decisions in the PR description if he's not reachable before
  dev-story starts, per this project's own established "flag rather than block" convention).
- [ ] Implement the boot-time active-roller signal (AC2) — cheap, do this first regardless of D3.
- [ ] Implement the default-flip mechanism per the D3 answer (staged soak-then-flip, or direct
  cutover).
- [ ] Confirm zero changes needed to the five external consumer files (per "What this story is NOT")
  — if any turn out to need a change, that's a signal rlv.1's independent-fix framing or this story's
  own "no external changes" claim was wrong; investigate before proceeding rather than patching
  silently.
- [ ] Full regression per AC6.
- [ ] Deploy to `dev` for a real click-through smoke test (per `CLAUDE.md`, Angelus cannot verify
  locally) before calling this done.

## Dev Notes

- Source: `public/js/suite/roll.js`, `public/js/suite/roll-v2.js`, `public/js/app.js` (flag read +
  boot-time subtree removal — this is the mechanism AC1/AC3 modify), `public/index.html` (Settings
  checkbox markup, `#t-dice`/`#t-roll` tab roots).
- Full original evidence for this story's safety claim: `specs/dice-roller-harmonisation-audit.md`
  §4a (byte-diff confirmation) and §3 (roundtable synthesis, Winston's 4-PR sequencing proposal,
  which this story is PR 1 of).
- This story does NOT touch `shared/dice.js`, `dice-engine.js`, or `contested-roll.js` — those are
  rlv.4/rlv.5/rlv.9 territory.

### Design-token guidance (TM Admin, post-port — read before writing any CSS in this story)

The shared design-token port (`design-token-port.md`, umbrella root) lands in this same file
(`suite.css`) before this story's dev-story starts (see "What this story is NOT" — this story
deliberately waited on that port for exactly this reason). Once it has:

1. **`.rv2-eff` is locked**: Cinzel Bold, `--type-size-display-hero: 64px` (Angelus-confirmed over
   the old roll.js implementation's 48px — settled, don't re-litigate). If AC1/AC3's dead-code-fencing
   of `roll.js` touches any CSS around `.rv2-eff` — unhiding it by default, removing a flag-gated
   wrapper, whatever — preserve the token reference; don't reintroduce a literal size or the old 48px.
2. **AC2's "active roller build" badge**: build it off the existing status/badge vocabulary
   (`.status-pill`, `.dt-status-badge` family — small, Lato, uppercase, letter-spaced, semantic
   colour + label, never colour alone). Don't invent a new visual language for it, and don't reach for
   Cinzel — this is exactly the small-UI-chrome case the standing display-only rule excludes.
3. **The standing type rule (fully confirmed, not just the port's opinion)**: Cinzel is ONLY for
   genuine app/page-level display headings (login screen, sidebar brand title). Everything else —
   badges, modal titles, per-item numerals, names — is Lato (`--fl`/`--type-heading`) for
   anything heading-shaped, Libre Baskerville (`--ft`/`--type-body`) for prose. Apply this test to any
   CSS this story's dead-code-fencing touches that isn't already covered by rule 1 above.
4. **Any new CSS this story writes should target the ported token names directly**
   (`--space-*`, `--radius-*`, `--type-size-*`, `--control-height-*`) rather than literal px —
   otherwise it's new code that immediately needs its own normalisation pass.

None of the above changes this story's actual scope — AC4's "no gameplay/feature changes" still
stands. This is "if you touch CSS, touch it with the current vocabulary and rules," not new UI work.

### References
- [Source: specs/dice-roller-harmonisation-audit.md §3, §4a]
- [Source: public/js/suite/roll.js]
- [Source: public/js/suite/roll-v2.js]
- [Source: public/js/app.js]
- [Source: public/index.html]

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
