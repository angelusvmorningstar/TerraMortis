---
epic: ADH (Accessor Drift & Data Hygiene Remediation)
epic_file: specs/epic-adh-accessor-drift-hygiene.md
story: ADH.2
source: specs/audit-drift-map-2026-09-02.md — Drift map table, row "NEW-1"
priority: HIGHEST in this epic (tied with ADH.1) — live write-path corruption risk
---

# Story ADH.2: `normalize-character.js` — align `sumChannels()`'s stale `MERIT_CHANNELS` list

## Status: Draft (scoping only — no code written)

## Story

**As** a developer maintaining the server-side character normalizer,
**I want** `sumChannels()` (the function that runs on every character POST/PUT and can overwrite
`m.rating`) to sum the same complete set of free-dot channels the client's canonical
`meritFreeSum`/`LEGACY_FREE_SLUGS` already uses,
**so that** a character save can never silently truncate a merit's persisted rating because the
server-side sum disagreed with the correct one over two missing channels.

## Background (source finding, verbatim citation)

`specs/audit-drift-map-2026-09-02.md`, Drift map table, row **NEW-1**:

> `server/lib/normalize-character.js` carries **two different merit-channel-sum implementations in
> the same file.** `sumChannels()` (the one that actually runs, on every character save, and can
> overwrite `m.rating`) uses a 15-entry `MERIT_CHANNELS` list that is **missing `free_retainer` and
> `free_fwb`** — both real schema fields (`server/schemas/character.schema.js:613,616`) that the
> client's own canonical `meritFreeSum`/`LEGACY_FREE_SLUGS` (`data/rules-helpers.js:71-73`) already
> includes. `_effectiveMeritRating()` in the *same file* (used only by the White Ants territory-count
> validator) has the correct, complete 14-slug list.
> — Severity: **HIGH**, escalated to a **write path**. Refactor target: "Point `sumChannels()` at
> the same slug list `_effectiveMeritRating` (or the client) already uses; or better, export one
> shared list both functions read."

Confirmed live this scoping pass — `server/lib/normalize-character.js:31-36`'s `MERIT_CHANNELS`
constant currently reads:
```js
const MERIT_CHANNELS = [
  'cp', 'xp', 'free',
  'free_mci', 'free_vm', 'free_lk', 'free_ohm', 'free_inv',
  'free_pt', 'free_mdb', 'free_sw', 'free_bloodline', 'free_pet',
  'free_attache', 'free_carthian',
];
```
— missing `free_retainer` and `free_fwb`. `_effectiveMeritRating()` (`:283-296`, same file) already
has the complete 14-slug legacy list (`free_attache`, `free_bloodline`, `free_carthian`, `free_fwb`,
`free_inv`, `free_lk`, `free_mci`, `free_mdb`, `free_ohm`, `free_pet`, `free_pt`, `free_retainer`,
`free_sw`, `free_vm`) plus `cp`/`xp`/`free_grants` map — this is the correct reference.

**Why this matters beyond a display bug:** this is the same underlying gap the 2026-08-31 "one true
rating" fix closed client-side (`xp.js`'s `meritRating` — commit message named live-verified impact
on real characters' Caldarium/Labyrinth Guardians merits computing 0). That fix did not touch
`normalize-character.js`, and this server-side function **runs on every save and can overwrite
`m.rating`** — so a character with `free_retainer` or `free_fwb` dots, saved through the normal
editor save path, risks having its merit rating silently truncated on write, not just misread.

## Acceptance Criteria

1. `sumChannels()` in `server/lib/normalize-character.js` sums the same complete channel set
   `_effectiveMeritRating()` already uses in the same file — at minimum adding `free_retainer` and
   `free_fwb` to `MERIT_CHANNELS`.
2. **Preferred implementation** (per the audit's own refactor-target note): the two functions read
   one shared exported channel-list constant, so this exact drift class (two hand-maintained lists
   in one file) cannot silently reopen. If a shared constant is genuinely impractical for a reason
   discovered during implementation, document why in this story's Dev Agent Record and fall back to
   AC1's minimal fix instead — don't force an awkward refactor.
3. Confirm the `free` channel's retained-but-dead status (per the file's own comment at `:25-30`,
   issue #834) is preserved exactly as-is — this story does not touch that channel's behaviour,
   only adds the two missing legacy slugs.
4. **Regression test added**: a character document with non-zero `free_retainer` and/or `free_fwb`
   on a merit, saved through the normalizer, produces the correct summed `m.rating` (matching what
   `_effectiveMeritRating()`/the client's `meritFreeSum` would compute) — not the previously
   under-counted value.
5. **Live-data check (read-only, before or after the fix — pick one and say which in Dev Agent
   Record):** query live `tm_game.characters` for any merit with non-zero `free_retainer` or
   `free_fwb` whose `m.rating` disagrees with the correct channel sum — i.e., confirm whether any
   character has actually already had a save silently truncate their rating under the old code.
   If any are found, do NOT auto-correct them in this story — surface the list to Angelus and get
   explicit direction before writing to any live character document (a data-correction story, if
   needed, is separate scope).
6. No other behaviour of `normalize-character.js` changes — this is a narrow, one-function fix.

## Tasks / Subtasks

- [ ] Read `server/lib/normalize-character.js` in full (both `sumChannels()` and
      `_effectiveMeritRating()`, plus the surrounding normalizer flow that calls `sumChannels()` and
      decides whether to overwrite `m.rating`) before making any change.
- [ ] Decide shared-constant vs. minimal-list-fix per AC2, document the decision.
- [ ] Apply the fix.
- [ ] Add the regression test (AC4) in `server/tests/`, modelled on this repo's existing
      normalize-character test coverage if one exists (grep for existing
      `normalize-character*.test.js` first — extend rather than duplicate).
- [ ] Run the touched spec file(s) plus an adjacent regression sweep on
      normalize-character/character-save-related tests — not the full suite.
- [ ] Run the live-data check (AC5) via read-only Mongo query; report findings; do not write to
      live data without explicit Angelus sign-off, and treat that as a separate follow-up if
      anything is found.

## Dev Notes

### Key files
- `server/lib/normalize-character.js:31-36` (`MERIT_CHANNELS`, the stale list) and `:283-296`
  (`_effectiveMeritRating`, the correct reference).
- `server/schemas/character.schema.js:613` (`free_fwb`), `:616` (`free_retainer`) — confirms both
  are real, currently-schema-valid fields, not dead ones.
- `public/js/data/rules-helpers.js:71-97` — `LEGACY_FREE_SLUGS` and `_meritFreeSumHelper`, the
  client-side canonical equivalent this story's fix should agree with.
- `public/js/editor/xp.js:199` — `meritRating`, the client function the 2026-08-31 "one true
  rating" fix already corrected (delegates to `meritFreeSum` now); this story closes the same gap
  server-side.

### Why sequenced first in the drift-map set
The audit's own "Recommended sequence" section names NEW-1 first: "it is a live write-path that can
silently truncate persisted data on ordinary character saves, the same failure class the 'one true
rating' fix was created to close, and the fix is a one-line channel-list alignment."

### Explicitly out of scope
- Any change to `meritEffectiveRating`, `meritFreeSum`, or any client-side file — those are already
  correct (per the drift-map audit's "Checked clean" section and the 2026-08-31 fix).
- Any live-data correction beyond surfacing findings per AC5 — gated on Angelus's direction.

### References
- `specs/audit-drift-map-2026-09-02.md` — NEW-1 row in full, plus the "Server-side re-derivation"
  section explaining why TM Game (unlike TM Story) has real server-side re-derivation paths to
  audit.
- 2026-08-31 "one true rating" Stage 1 commits (`823bf2a9`, `db454b42`) — the client-side precedent
  for this exact fix shape.
