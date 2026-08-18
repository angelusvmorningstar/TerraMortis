# Story BL-5: Clan and bloodline are write-once, and the code finally knows it

Status: done

> **Epic BL** — issue **#1008**. The **last story in the epic**. BL-1 built the collection, BL-2 built
> the cache, BL-3a rewired every reader onto it, BL-4 gave it a real writer, BL-3b deleted the
> constants and retired the seed. Every one of those was about the **catalogue**. This one is the
> only story about the **character**, and it closes #1008 entirely.
>
> **The rule was ruled, and then nothing happened.** Angelus ruled on 2026-08-10 that
> `characters.bloodline` is write-once (`null` to a name is allowed; name to a different name and
> name to `null` are not) and, the same day, that `characters.clan` is write-once too (set at the
> Embrace, permanent, no in-fiction path to change it). Five stories later there is still **no
> enforcement anywhere** — not in the schema, not in the route, not in the client. This story is the
> enforcement.
>
> **Data-lock: NOT required as a separate pass. Judged, not assumed, and measured during story
> creation.** Unlike BL-3b (pure deletion) this story adds enforcement over live character data, so
> the question was live. It was answered by direct query against `tm_suite` on **2026-08-11** rather
> than inherited from `data-map.md`; the measurements are in Dev Notes and they settle the one shape
> question that mattered (the `''`-vs-`null` edge case). Every other shape this story touches was
> verified by BL-2's and BL-4's locks and is unchanged. Nothing here reads a field whose shape has
> not been measured this week.
>
> **Timing: the after-Game-7 gate (Sat 2026-08-15) does NOT bind this story's code.** BL-2 and BL-3a
> carried it because they changed what a **player** is charged; BL-4 carried it because it can put
> wrong data into production. BL-5 changes neither. Every surface it touches is ST-only: the Identity
> tab and the editor sheet render behind `getRole() === 'st'` in **both** apps
> (`app.js:325` and `app.js:1232` gate `renderIdentityTab` / `editorRenderSheet`), and
> `PUT /api/characters/:id` is `requireRole('st')`. No player-facing surface, no costing path and no
> DT form behaviour changes. What the gate DOES still bind is the **epic's merge**, which was already
> gated on BL-3b's open AC 9 — production holds **0** bloodline documents (re-measured 2026-08-11,
> during this story's creation), so merging before the seed is applied puts all 13 bloodline-carrying
> characters on BL-2's loud-miss path at once. Implement whenever; merge with the epic, after the
> seed, on Angelus's word.
>
> **Deploy:** continue on `bl/bl-1-bloodline-collection` (already carries bl-1, bl-2, bl-3a, bl-4 and
> bl-3b, unpushed). Branched from `main`, PR direct to `main`, never through `dev`. No push, no merge,
> no deploy without Angelus's explicit word in his current message.

## Story

As the Storyteller,
I want a character's clan and, once acquired, their bloodline to be genuinely unchangeable — refused
by the server, and not even offered by either editor screen,
so that a permanent fact about a character cannot be silently rewritten by a stray dropdown, a bulk
import, or a clan edit that quietly nulls it.

## Why this story exists

Two facts about a character are permanent by the rules of the setting. Neither is permanent in the
code.

| Fact | Ruling (Angelus, 2026-08-10) | Enforcement today |
|---|---|---|
| `characters.clan` | "Clan can not be changed." Set at the Embrace. | **None.** Two live dropdowns write it. |
| `characters.bloodline` | "Not every character has a bloodline but once they do it's forever. A new character can start without a bloodline and then get one." | **None.** Two live dropdowns write it, and one code path nulls it automatically. |

Concretely, all four of these are true right now:

1. **`public/js/editor/edit.js:107-125` performs a silent name-to-null.** Changing a character's clan
   nulls their bloodline if it does not belong to the new clan. No warning, no confirmation, no
   record. Because clan is *also* write-once, this branch is **unreachable by design** and should be
   deleted rather than guarded — a guard is a thing that can be got subtly wrong later.
2. **The clan control has no "not set" option on either screen.** `identity.js:81` and
   `sheet.js:2716` build the `<select>` from `CLANS` alone. A character with no clan renders with
   `Daeva` visibly selected and one touch commits it. Latent today (all 41 live characters carry a
   valid clan) and closed by construction once clan is locked — except on the one path that still
   needs an open control, the first set.
3. **The server has no idea any of this is a rule.** `validateCharacterPartial`
   (`server/middleware/validateCharacter.js:37`) is Ajv **schema** validation: it inspects `req.body`
   and has no access to the character's current document, so it structurally **cannot** express a
   transition rule, which needs old-versus-new. `PUT /api/characters/:id` will happily `$set` a
   different bloodline over an existing one.
4. **Both fields have TWO independent client editing surfaces.** `identity.js:81/85` via `updField`,
   and `sheet.js:2717` via `shEdit` — a second, separate clan/bloodline dropdown pair on the sheet.
   Locking one and not the other leaves the rule true on one screen and false on the other: the same
   "one rule, two implementations" shape as the DT form's private in-clan check, which cost this epic
   a whole extra story to unpick.

**One defect the epic's own scoping note listed is already fixed, and this story must not
re-litigate it.** The "editor shows `(none)` for a character who has a bloodline" defect
(`identity.js:73-75` as it then was) was closed by BL-3a's own code review, fix 4 — an accident of
timing rather than this epic's design. Verified in full during this story's creation, on **both**
surfaces: `identity.js:27-31` and `sheet.js:34-42` (`_blOptionNames`) each union the character's own
stored value into the option list, matched case-insensitively, and escape it. The two surfaces have
**not** diverged. `data-map.md` still describes this defect as live and needs correcting — see
Dev Notes.

## Acceptance Criteria

### Server — the rule, enforced where it cannot be bypassed

1. **A pure write-once decision function, in its own `server/lib/` module.** New
   `server/lib/character-write-once.js`, exporting a function that takes the **current** stored value
   and the **incoming** value for one field and returns an allow/refuse verdict with a reason. Pure:
   no database, no Express, no imports beyond the language — the same shape as
   `server/lib/bloodline-delete-guard.js`, which is the precedent this story follows and which exists
   precisely so ordering logic can be tested without racing a real database. The field-by-field
   transition table it implements:

   | Current | Incoming | Verdict |
   |---|---|---|
   | no value | a non-empty value | **allow** — acquisition |
   | a value | the byte-identical same value | **allow** — no-op |
   | a value | a different value (including case- or whitespace-only differences) | **refuse** |
   | a value | no value | **refuse** |
   | no value | no value | **allow** — no-op |
   | (field absent from the body) | — | **allow** — never inspected |

2. **"No value" is one predicate, and it covers `''`.** `null`, `undefined`, absent, `''` and
   whitespace-only all mean "no value", via a single shared helper rather than a `=== null` check at
   each site. This is not hypothetical tidiness: `server/schemas/character.schema.js:70` gives `clan`
   an enum that **explicitly includes `''`**, and `:74` declares `bloodline` as
   `{ type: ['string', 'null'] }`, which permits `''` too. A naive `=== null` check would let
   `'Malkovians' → ''` through as an allowed "no change", which is the exact bypass the rule forbids.
   Live data carries **no `''` on either field** (measured — see Dev Notes), so the check is a guard
   against the API, not a fix for existing rows.

3. **The no-op case is load-bearing and must be proven, not assumed.** The ST editor saves the
   **whole document**: `admin.js:1015`/`:1240` PUT `buildSaveBody(c)` (`admin.js:976`), which carries
   `clan` and `bloodline` unchanged on **every single save**. A guard that refuses "the field is
   present in the body" rather than "the field's value changed" would break every character save in
   the app on its first day. A test must save a bloodline-carrying character's full document
   unchanged and assert **200**.

4. **The check is wired into `PUT /api/characters/:id`, after schema validation, with exactly one
   extra read.** `server/routes/characters.js:451`. The handler already conditionally fetches the
   current document at `:485` (`findOne({ _id: oid }, { projection: { clan: 1 } })`) for the
   touchstones branch. Hoist that fetch so it happens **once** when either guarded field is present
   in the body, widen the projection to `{ clan: 1, bloodline: 1 }`, and share it with the existing
   touchstones branch rather than reading the same document twice. If neither `clan` nor `bloodline`
   nor `touchstones` is in the body, no extra read happens at all.

5. **A refusal is a 409, and its message names the remedy.** Return
   `409` with `error: 'WRITE_ONCE_VIOLATION'` and a message naming the field, the stored value, the
   attempted value and why it is refused. **409 not 400**: the body is well-formed and schema-valid;
   what conflicts is the stored state. This follows the 409s BL-4 already returns for the name
   collision and the delete guard. The message must state that correcting a mis-entered value is a
   deliberate data correction, not an edit — there is intentionally no UI override (see AC 12 and the
   open question).

6. **The acquisition is atomic, not read-then-write.** Between the AC 4 read and the
   `findOneAndUpdate` at `:491` nothing holds a lock, so two concurrent acquisitions could both read
   `bloodline: null`, both pass the check, and the second silently overwrite the first — precisely
   the read-then-write class BL-4's review found three of. When (and only when) the incoming value
   differs from what was read, add the **prior value** to the update filter, so the write is a
   compare-and-set: `{ _id: oid, <field>: <priorValue> }`. A zero-match result on a document that
   still exists is the race, and returns the same 409 as AC 5. Saves that do not change either field
   must not gain a filter condition — an unrelated concurrent clan write must not fail somebody's
   merit save.

7. **The player-facing creation path is NOT blocked, and this is asserted.**
   `POST /api/characters/wizard` (`:412`, `requireRole('player')`) and `POST /api/characters` (`:439`,
   ST) create documents with **no prior state**, so there is nothing to compare and the guard must
   never run on them. A test must create a character carrying both a clan and a bloodline through the
   wizard route and assert **201**. This is the single most likely way to break a path nobody is
   looking at: the guard is about transitions, and a creation is not one.

8. **The acquired bloodline must resolve against the collection — but only on acquisition, and only
   when the collection can answer.** This is the original sprint-status scope line
   ("server-side validation of `characters.bloodline` against the collection") and it survives, in
   narrowed form:
   - it runs **only on the no-value-to-a-name transition**, never on a no-op — otherwise every one of
     the 13 existing holders would fail their next full-document save;
   - it matches on the same trimmed, case-folded key the client resolves costing through
     (`_key` at `public/js/data/bloodlines-cache.js:86-88` — trim plus case-fold), not on exact
     string equality. The server has no shared copy of that helper today; write one rather than
     inlining a second `.trim().toLowerCase()`, and say where you put it.
   - **it refuses to judge when the collection is empty or unreadable.** Production holds **0**
     bloodline documents right now; a referential check that fires against an empty collection would
     reject every first-set in the app. This is BL-3a's `bloodlinesResolvable()` reasoning applied
     server-side, and the same lesson its review paid for: a lookup that cannot answer must not be
     allowed to answer "no".
   - a non-resolving acquisition returns 400 `VALIDATION_ERROR` (the value is wrong), not the 409 of
     AC 5 (the state conflicts). Both codes must be distinguishable by a client.
   No referential check is added for `clan` — `character.schema.js:70` already carries a 5-value enum
   built from `CLAN_NAMES`, which is stronger than anything this story would add.

### Client — the same rule, on both screens, at the handler and in the markup

9. **The two handlers refuse the write, not just the two templates.** This is the explicit
   instruction in `data-map.md`'s `characters.clan` entry: *"Enforce at the handler
   (`updField` / `shEdit`), not only in the markup, so a disabled `<select>` is defence-in-depth
   rather than the whole defence."*
   - `public/js/editor/identity.js:182` `updField(key, val)` — refuse `clan` and `bloodline` writes
     that AC 1's table refuses, `console.warn` the reason, and return without touching
     `state.chars[...]` and without calling `_markDirty()`.
   - `public/js/editor/edit.js:88` `shEdit(field, val)` — same, and note that `shEdit` writes the
     field on its **first line** (`state.chars[state.editIdx][field] = val || null;`), so the guard
     must sit **above** that line, not after it. **`edit.js` has two importers, `admin.js` and
     `app.js`** — verify the change against both.
   - The refusal logic must exist **once**, shared by both handlers, not written twice. Two
     implementations of one rule is the failure mode this entire epic exists to remove.

10. **The lock reads the character's own stored value and never the bloodline cache.** A field is
    locked when the character already holds a value for it — `c.clan` for clan, `c.bloodline` for
    bloodline — full stop. It must **not** consult `bloodlinesResolvable()`, `bloodlinesByClan()` or
    any cache state. BL-3a's clear-guard needed the cache because it was deciding whether a value was
    *valid*; this decides whether a value *exists*, and the character document is the only authority
    on that. With production holding 0 bloodline documents, a lock keyed off the cache would unlock
    every field in the app.

11. **All four dropdowns are locked, and the locked state is visibly explained.** Four call sites,
    two files, and the line numbers must be re-verified before editing:
    - `identity.js:81` — clan `<select>` → `updField('clan', ...)`
    - `identity.js:85` — bloodline `<select>` → `updField('bloodline', ...)`
    - `sheet.js:2717` — clan `<select>` → `shEdit('clan', ...)`
    - `sheet.js:2717` — bloodline `<select>` → `shEdit('bloodline', ...)` (the **same line**; two
      selects are built there, and it is easy to lock one and miss the other)

    **Reuse, do not invent — no new CSS class is needed for this.** The character sheet already has
    exactly this treatment: `sheet.js:673`'s `_discLockAttr` renders
    `disabled title="Locked: ..."` on an input, and `identity.js:141-149` already renders `disabled`
    inputs with an explanatory `title` for the derived XP fields. Use `disabled` plus a `title` on
    the control, and add the visible reason with the existing **`.derived-note`** class
    (`components.css:399`) — already used on the sheet at `sheet.js:2693/2697` for exactly this job
    ("here is why this value is what it is"), and in `components.css`, which **both** apps load.
    Do **not** reach for BL-4's `.ec-form-readonly` / `.ec-form-hint`: those live in
    `admin-layout.css` and belong to the reference-data admin surface, not the character editor.
    Do **not** reuse `.bl-disc-locked` (`components.css:688`) — it is error-coloured
    (`--err-a12`/`--err`) and this is not an error, it is the rule working.

12. **The locked copy is player-facing prose and must read like a rule, not an error.** British
    English, no em-dashes. It must say the field is permanent and cannot be changed here, and it must
    not imply a mistake has been made or that something is broken. One sentence per field is enough.

13. **The unlocked clan control gains a "not set" placeholder.** On the acquisition path only — a
    character with no clan — both clan `<select>`s must carry an explicit, non-committing first
    option so the browser cannot present `Daeva` as a fait accompli. The bloodline selects already do
    this (`(none)` at `identity.js:86`, `(no bloodline)` at `sheet.js:2717`); the clan selects do not,
    and this is the one path where it still matters after the lock lands.

### The dead code

14. **`edit.js`'s bloodline auto-clear is deleted, and proven gone.**
    `public/js/editor/edit.js:107-125` — the whole "clear bloodline if not valid for the new clan"
    block, including BL-3a's explanatory comment above it. Once clan is genuinely write-once and
    enforced, the clan can never change after first set, so "clear the bloodline when the clan
    changes" can never fire. BL-3a rewired one line inside it (`bloodlinesByClan()`) rather than
    delete it, explicitly on the reasoning that deleting it was BL-5's job and BL-3b must not have to
    wait on BL-5. That debt is now due.
    - **The clan bane assignment at `:101-106` STAYS.** It is still needed the first time a clan is
      set on a new character. Delete the bloodline lines only.
    - **The now-dead imports go with it.** `bloodlinesByClan` and `bloodlinesResolvable` are imported
      at `edit.js:10` and read **only** inside the deleted block (`:121/:123`) — verify that before
      deleting, then remove the import and the BL-3a note at `:6-9`. `isInClanDisc` and
      `bloodlineUnresolved` from `accessors.js` are used elsewhere in the file and stay.
    - **Proof is a test, not a reading.** BL-3a's review shipped a `ReferenceError` from exactly this
      class — a deletion with surviving call sites, passing a test that checked the declaration
      rather than the calls. Assert that no bare `bloodlinesByClan(` or `bloodlinesResolvable(` call
      survives in `edit.js`, using `server/tests/helpers/strip-comments.js` (BL-3b's quote-aware
      scanner) rather than a fresh regex pair.

### Tests

15. **Targeted vitest; the full suite is NOT a gate — see Dev Notes.** New
    `server/tests/bl5-write-once.test.js`, plus repairs to any existing spec this story's route
    change touches. Coverage required:
    - **The pure function, exhaustively**: every row of AC 1's table for both fields, plus the `''`,
      `undefined`, absent and whitespace-only cases from AC 2, plus the case-differing and
      whitespace-differing "same value" cases which must **refuse**.
    - **The route, behaviourally, against `tm_suite_test`**: the full-document no-op save returning
      200 (AC 3); `null → 'Malkovians'` returning 200; `'Malkovians' → 'Gorgons'` returning 409;
      `'Malkovians' → null` returning 409; `'Malkovians' → ''` returning 409; the same four for
      `clan`; a body touching neither field returning 200 with no behaviour change.
    - **The wizard path** (AC 7) returning 201 with both fields set.
    - **The compare-and-set** (AC 6): the prior value appears in the update filter on an acquisition
      and does not on a no-op. A behavioural race is not required; asserting the filter shape is.
    - **The referential check** (AC 8): resolves → 200; does not resolve → 400; **collection empty →
      200**, which is the one that protects production today.
    - **The client**, in the style of the BL-2/BL-3a/BL-3b guards: both handlers refuse a forbidden
      transition and leave `state.chars` untouched and `_markDirty` uncalled; all four dropdowns
      render `disabled` when the field holds a value and enabled when it does not; the `edit.js`
      deletion proof from AC 14; and a grep-proof that no inline `style="..."`, bare hex or `rgba()`
      entered either file.
    - `server/tests/repo-no-nul-bytes.test.js` stays green. **Its 60-second timeout was set
      deliberately during BL-4's review** after "transient" failures turned out to be a too-short
      timeout. Do not introduce a fast-timeout pattern anywhere you touch.

## What this story is NOT

- **Not a redesign of the character editor.** Only the four clan/bloodline controls change, plus the
  two handlers guarding them. Nothing else on the Identity tab or the sheet header moves.
- **Not a UI override, unlock affordance, or "ST can force it anyway" escape hatch.** `data-map.md`
  is explicit that a mis-entered clan is *"a data correction, not a clan change, and should require a
  deliberate override rather than a live dropdown."* Building the override is a separate decision and
  is raised as an open question below, not answered here.
- **Not a correction script.** If Angelus wants a `scripts/` path for correcting a mis-entered clan
  or bloodline, that is its own story. This one makes the need visible; it does not fill it.
- **Not a change to BL-4's admin CRUD, its five endpoints, `server/lib/bloodline-name-index.js`,
  `server/lib/bloodline-slug.js`, `server/lib/bloodline-delete-guard.js`, the cache's generation
  counter, or the WS frame.** AC 1 follows the delete guard's shape; it does not touch it.
- **Not referential validation on `POST`.** Neither creation route has prior state, and adding a
  bloodline-must-resolve check to `POST /api/characters` would break restoring a JSON backup into an
  unseeded collection through `admin/data-portability.js:514`. AC 8 is a transition check and lives
  only where transitions do.
- **Not a fix for the bulk-import write paths.** `admin/data-portability.js:514/:999` and
  `admin/excel-merge.js` PUT full merged documents. After this story, a restore whose stored
  bloodline **differs** from live will 409 — which is the correct and deliberate outcome (a restore
  that rewrites a permanent fact should be loud), but it is a behaviour change on a path this story
  does not otherwise touch. Record it; do not build around it.
- **Not the loud-miss path.** A bloodline that stops resolving after acquisition is BL-2's banner and
  BL-2's editor lock, both already live. AC 8 checks the value at the moment it is acquired and never
  again.
- **Not `tabs/wizard.js`.** Zero importers, re-confirmed by BL-3b on 2026-08-11. It belongs to
  **#1095**. Do not wire it, do not lock it, do not prime the cache from it.
- **Not the `data-map.md` correction.** Two entries need updating (see Dev Notes). Per this repo's
  data-lock discipline a create-story pass **flags** map corrections rather than making them; the
  dev-story or a `bmad-data-lock` pass owns the edit.

## Tasks / Subtasks

- [x] Task 1 (AC 1, 2): write `server/lib/character-write-once.js` — the pure transition function and
      the single "no value" predicate. No database, no Express, no route import.
- [x] Task 2 (AC 4, 5, 6): wire it into `PUT /api/characters/:id`. Hoist and widen the existing
      current-document read, share it with the touchstones branch, add the compare-and-set filter on
      acquisitions only, return the 409.
- [x] Task 3 (AC 8): add the acquisition-only referential check, matched on the shared normalised
      key, refusing to judge against an empty or unreadable collection.
- [x] Task 4 (AC 7): confirm by test that both creation routes are untouched.
- [x] Task 5 (AC 9, 10): add the shared client-side refusal and call it from **both** `updField` and
      `shEdit`. Verify `edit.js` against both its importers (`admin.js`, `app.js`).
- [x] Task 6 (AC 11, 12, 13): lock all four dropdowns with `disabled` + `title` + `.derived-note`;
      add the clan "not set" placeholder on the unlocked path. No new CSS class, no inline styles.
- [x] Task 7 (AC 14): delete `edit.js:107-125` and its two now-dead imports; keep the bane
      assignment; prove the deletion with a call-site test using the shared comment stripper.
- [x] Task 8 (AC 15): the test suite, server and client halves.
- [x] Task 9: verify in a browser — a bloodline-carrying character shows both controls locked with a
      readable reason on **both** screens; a character with no bloodline can still acquire one and
      the save succeeds; a forbidden transition attempted through the API returns 409 with a usable
      message. **This epic has carried an open browser-verification gap since BL-2 and it should not
      leave a fifth story unclosed.** *(Done for real against the live app on 2026-08-11. Exactly what
      was observed live versus what was proved by test, and why, is itemised in Completion Note 9.)*
- [ ] Task 10: PR to `main` (Angelus's word only). *(GATED — and behind BL-3b's AC 9 seed run.)*

## Dev Notes

### Live data, measured 2026-08-11 during this story's creation (own query, not inherited)

Direct query against `tm_suite.characters`, 41 documents:

| Measurement | Result |
|---|---|
| Total characters | **41** |
| `bloodline` value kinds | `null` × **28**, non-empty string × **13**. **Zero `''`, zero absent, zero non-string.** |
| `clan` value kinds | non-empty string × **41**. **Zero `null`, zero `''`, zero absent.** |
| `clan` distribution | Ventrue 10, Mekhet 9, Nosferatu 8, Gangrel 7, Daeva 7 — all five valid `CLAN_NAMES` |
| Bloodline holders | **13**, 13 distinct values, one (`Terrassa Mortimer` / Lidérc) `retired: true` |
| Holder clan agreement | **13/13** — every holder's `clan` matches their bloodline's clan in the archived `BLOODLINE_CLANS` (`scripts/archive/seed-bloodlines.js:135-141`). `data-map.md`'s claim re-verified independently, not trusted. |
| `bloodlines` collection | **0 documents** — BL-3b's AC 9 is still open and still gates the merge |

What this settles:

- **The `''` edge case is theoretical in the data and real in the schema.** Nothing live carries `''`
  on either field, and neither UI can produce it (`identity.js:85` and `sheet.js:2717` both write
  `this.value||null`; `shEdit` coerces with `val || null`; the clan selects have no empty option).
  But `character.schema.js:70` puts `''` **in the clan enum**, and `:74` leaves `bloodline` an
  unconstrained `['string','null']`, so a direct API call can send it. AC 2 treats it as "no value"
  because that is what it means; the consequence is that `'Malkovians' → ''` is **refused** exactly
  like `'Malkovians' → null`, which is the only reading that closes the bypass.
- **Clan is effectively frozen for the entire live roster.** All 41 already have one, so after this
  story the clan control is locked for every character in the database and the acquisition path
  (AC 13) exists only for characters created from here on.

### Verified file state, 2026-08-11 (read in full, not grepped)

| File:line | What is there now | What this story does |
|---|---|---|
| `public/js/editor/edit.js:88-128` | `shEdit`; writes the field on line 1; `if (field === 'clan')` assigns the bane (`:101-106`) then clears an invalid bloodline (`:107-125`) | guard above line 1 (AC 9); delete `:107-125` (AC 14) |
| `public/js/editor/edit.js:5-10` | imports `isInClanDisc`, `bloodlineUnresolved` (used elsewhere) and `bloodlinesByClan`, `bloodlinesResolvable` (used **only** in the deleted block) | drop the two cache imports and the `:6-9` note |
| `public/js/editor/identity.js:27-31` | the bloodline option union-fix, **already correct** | leave alone |
| `public/js/editor/identity.js:81` | clan `<select>`, no placeholder, no union | lock (AC 11); placeholder when unset (AC 13) |
| `public/js/editor/identity.js:85-88` | bloodline `<select>` with `(none)` | lock (AC 11) |
| `public/js/editor/identity.js:182-190` | `updField` — a bare assignment plus `_markDirty()` | guard (AC 9) |
| `public/js/editor/sheet.js:34-42` | `_blKey` + `_blOptionNames`, **already carries the same union-fix as identity.js** | leave alone; see the note below |
| `public/js/editor/sheet.js:2716-2717` | both edit-mode selects, built on one line inside the `covRow` call | lock both (AC 11); placeholder on clan (AC 13) |
| `public/js/editor/sheet.js:2718` | the non-edit read-only render (`sh-faction-label` + `sh-faction-bloodline`) | the shape to imitate for the locked display |
| `server/routes/characters.js:451-499` | `PUT /:id`; conditional current-doc read at `:485` (`projection: { clan: 1 }`); `findOneAndUpdate` at `:491` | hoist and widen the read; add the guard and the compare-and-set (AC 4, 6) |
| `server/routes/characters.js:412/439` | `POST /wizard` and `POST /` | untouched; asserted untouched (AC 7) |
| `server/middleware/validateCharacter.js` | 39 lines, Ajv only, body-only, no DB | untouched |
| `server/schemas/character.schema.js:70/74` | `clan` enum includes `''`; `bloodline` is `['string','null']` | untouched (AC 2 handles it at the guard) |

**A note on `_blOptionNames` and the identity.js union, for the reviewer.** Once AC 11 lands, the
option lists are only ever built when the field is **unset**, so `if (c.bloodline && ...)` inside both
union-fixes becomes unreachable. **Keep both.** They are one line each, they are the fix BL-3a's
review paid for, and if a future story ever reopens the control the protection must not have to be
rediscovered. State the decision in the story record so review rules on it rather than re-finding it.

### Where the server check belongs, and why not a middleware

The obvious reach is a sibling middleware next to `validateCharacterPartial`, following
`validateWhiteAntsTerritoriesMiddleware` (`server/lib/normalize-character.js:197`). **Rejected**, for
one structural reason and one cost reason:

- **Structural.** Every existing middleware in that chain is body-only. A write-once rule needs the
  *stored* value, so a middleware would have to open its own `findOne` — and the handler already
  performs exactly that read at `:485`. Two reads of one document per save, to answer two questions
  about the same document, is the shape that invites them to drift apart.
- **Testability.** BL-4 extracted `bloodline-delete-guard.js` as pure logic with injected IO
  specifically so ordering could be tested without a database, and BL-3b's review proved the value of
  that when it added 22 database-free tests to the archived seed. AC 1 follows it: the decision is
  pure and exhaustively unit-tested; the wiring is thin and tested behaviourally through the route.

### The concurrency register BL-4's review established

BL-4's review found **three** read-then-write races the implementation record had wrongly claimed
were closed, and its `bloodline-delete-guard.js` header explains at length why a MongoDB transaction
does not fix that class (transactions conflict on **writes**; MongoDB has no predicate locking, so a
concurrent insert elsewhere never conflicts). Any write-path change in this epic is now expected to
state its race position explicitly. AC 6 is this story's answer: the acquisition becomes a
compare-and-set on the prior value, which is a single atomic operation and needs no transaction. Say
so in the story record, and say what is deliberately left open — a concurrent write between the read
and the update that sets the **same** value is indistinguishable from a no-op and is harmless.

### `data-map.md` corrections this story surfaces (flag, do not fix here)

1. **`characters.bloodline` → Enforcement.** The bullet describing `identity.js:73-75` as displaying
   a false value is **out of date**: BL-3a's review fix 4 closed it on both surfaces
   (`identity.js:27-31` and `sheet.js:34-42`). The entry should record it as fixed, by which story,
   and that the same fix landed on both dropdowns.
2. **`characters.bloodline` and `characters.clan` → Consumers / line numbers.** Both entries cite
   pre-BL-3a line numbers (`edit.js:103`, `identity.js:19/69/73`, `sheet.js:2692`). Current:
   `edit.js:107-125`, `identity.js:81/85/182`, `sheet.js:2716-2717`.
3. Both entries' **Enforcement: none** sections become the record of what this story built, once it
   lands.

### Environment and hard rules

- **The full suite is not a gate.** BL-3b's run is the current authoritative list: 174 files / 2351
  tests, **9 files failing**, all pre-existing. Seven collection-time reds (`issue-1013`,
  `issue-1021`, `issue-811`, `issue-826`, `issue-836-legacy-tracker-cache-removed`,
  `issue-837-xp-totals-deprecation`, `n8-mandragora-prereq`) plus two with in-file failures
  (`epic.708.3-cycle-phase-controls`, `n7-n9-allocator-readers`). Run this story's own specs plus
  every spec it touches — `api-characters-crud.test.js` in particular, which exercises both creation
  routes and the PUT. **Never pipe through `tail`** — it masks the exit code.
- Tests run with `cd server && npm run test` (vitest, `singleFork`, forced onto `tm_suite_test`).
- `server/tests/repo-no-nul-bytes.test.js` must stay green, at its existing 60-second timeout.
- **Normalised CSS is mandatory and it applies here.** Tokens only, reuse before invent. AC 11 names
  the existing classes; adding a new one requires justifying why `.derived-note` and the
  `disabled`+`title` pattern do not cover it. No bare hex, no `rgba()`, no `style="..."` in markup or
  JS-rendered HTML.
- **British English, no em-dashes in any string the app prints.** AC 12's copy is app-authored
  player-facing prose, so this is a direct requirement of the change, not background.
- Branch `bl/bl-1-bloodline-collection`, PR direct to `main`, never through `dev`. No push, no merge,
  no deploy without Angelus's explicit word in his current message.

### References

- Issue **#1008**; `specs/stories/sprint-status.yaml` → `epic-bl` block, the `bl-5` line at `:923`
- `D:\Terra Mortis\data-map.md` — **`characters.clan`** (the write-once ruling, both editing surfaces,
  the "enforce at the handler" instruction, the `edit.js:102-104` deletion call) and
  **`characters.bloodline`** (the transition table, the 13 holders, the two defects) — read both
  entries in full, not the summaries here
- `specs/stories/bl-3a-rewire-readers-to-cache.story.md` — the two-editing-surface discipline, its
  AC 6 explaining why the clan-change block was rewired rather than deleted, and its Senior Developer
  Review (the `ReferenceError` post-mortem behind AC 14's call-site proof, and fix 4, the union-fix
  this story verified is already in place)
- `specs/stories/bl-4-admin-crud.story.md` — AC 6 (the immutable-field UI lock and its
  `.ec-form-readonly` / `.ec-form-hint` treatment, deliberately **not** reused here), AC 8 (the
  guarded delete), and its Senior Developer Review for the concurrency register AC 6 answers
- `specs/stories/bl-3b-delete-constants-and-seed.story.md` — the deletion-discipline grep-proof
  pattern behind AC 14, the shared `server/tests/helpers/strip-comments.js`, and the open AC 9 that
  gates this epic's merge
- `specs/stories/deferred-work.md` — the 2026-08-10 block *"`characters.bloodline` is write-once and
  nothing enforces it"* (the three findings this story discharges: the silent name-to-null, the false
  `(none)` display, and the two-editing-surfaces trap), plus the BL-4 review entry on renaming a
  bloodline that has holders, which is why no rename or cascade appears anywhere in this story
- `server/lib/bloodline-delete-guard.js` — the pure-logic-plus-injected-IO precedent AC 1 follows,
  and its header's explanation of why a transaction does not fix a read-then-write race

## Open questions for Angelus

1. **There is deliberately no in-app remedy for a mis-entered clan or bloodline, and that is a real
   trap worth your ruling.** After this story, an ST who acquires the wrong bloodline for a character
   has locked it permanently with no UI path back — and BL-4's delete guard also refuses to delete a
   bloodline that has holders, so the catalogue cannot be cleaned up around it either. Today the
   correction would be a direct database edit. `data-map.md` anticipated this (*"should require a
   deliberate override rather than a live dropdown"*) but nobody has said what the override **is**.
   Three options, in ascending cost: (a) leave it as a direct Mongo edit and say so in the 409
   message, which is what this story specs; (b) a small `server/scripts/correct-character-lineage.js`
   with a confirmation prompt and a log line, as its own story; (c) an ST-only override affordance in
   the editor, which re-opens the door the story exists to close. **The story as written assumes (a).**
   If you want (b), it is a separate story and should be scheduled deliberately rather than absorbed.

2. **Should a forbidden transition be refused, or refused-and-recorded?** The 409 tells the ST who
   attempted it. Nothing writes down that it happened. Given the whole point is that these facts are
   permanent, an attempt to change one is arguably worth a line in a log the way an ordeal sign-off
   is. Not specced, because this repo has no character-audit-log surface to write to and inventing one
   here would be scope creep. Say the word if you want it and it becomes its own story.

3. **Confirming the split judgement, since the epic's own note flagged this story as "no longer
   small".** It was assessed honestly and **no split is recommended.** The honest scope is one new
   pure module, one route wiring, one shared client guard called from two handlers, four dropdown
   locks across two files, and one dead-code deletion — larger than BL-3a, materially smaller than
   BL-4's fifteen ACs. More to the point, the two halves cannot be usefully separated: the client lock
   without the server guard is theatre (the API is the bypass), and the server guard without the
   client lock is an ST hitting a 409 from a dropdown that still looks live. Splitting it would
   reproduce the "one rule, two implementations, shipped a story apart" shape this epic spent BL-3a
   removing. If you disagree, the natural seam is server (AC 1-8) versus client (AC 9-14), and AC 14's
   deletion must travel with the client half.

### Angelus's answers, given before implementation began (2026-08-11)

1. **Option (a), for now.** No in-app remedy. The 409 names the remedy as a deliberate data
   correction made directly against the database. No UI override was built, and no correction script
   was built. Implemented exactly as specced.
2. **Yes, he wants a refused transition recorded — and it is NOT this story.** Filed as **GitHub
   issue #1132**, unstarted. This implementation deliberately writes no audit record, creates no
   collection, and adds no logging beyond the 409 response and the client `console.warn`. If a
   reviewer finds anything that looks like an attempt log in this diff, it is a defect.
3. No split. Implemented whole.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5[1m]`), via `bmad-dev-story`. 2026-08-11. Branch
`bl/bl-1-bloodline-collection`, no commit, no push.

### Debug Log References

**Test runs.** Three gates, all reproducible.

> **Corrected 2026-08-11 by the Senior Developer Review, and the correction matters.** This table
> originally claimed a second gate of "**41 files, 811 tests, green**" against "the 41-file list
> below" — but no such list or command appeared anywhere in the story, so the figure could not be
> reproduced by anybody but its author. Codex's own derivation of the promised set found **34** reader
> files, not 41, and that set **includes four specs that are known-red**, so it could never have been
> "green" as a whole batch. The row below replaces it with a set derived by a **named, runnable
> command** whose reds are excluded **explicitly** rather than implied away, and whose count was
> re-measured after the review's own patches landed. Do not restore a regression figure to this file
> without the command that produces it.

| Run | Command | Result |
|---|---|---|
| Story's own specs (post-review) | `npx vitest run tests/bl5-write-once.test.js tests/bl5-lineage-lock-client.test.js` | 2 files, **154 tests**, green (93 server + 61 client) |
| Touched plus adjacent (post-review) | `npx vitest run tests/bl5-write-once.test.js tests/bl5-lineage-lock-client.test.js tests/api-characters-crud.test.js tests/bl3a-one-inclan-implementation.test.js tests/repo-no-nul-bytes.test.js` | 5 files, **212 tests**, green |
| Broad regression (post-review), reds excluded by name | see the exact command below | **40 files, 804 tests, green** |
| Known pre-existing reds, excluded and re-confirmed unrelated | `npx vitest run tests/issue-836-legacy-tracker-cache-removed.test.js tests/issue-837-xp-totals-deprecation.test.js tests/n7-n9-allocator-readers.test.js tests/n8-mandragora-prereq.test.js` | **4 files red**, same pre-existing causes (missing `public/js/suite/tracker.js`; two `SyntaxError` collection-time reds; one `meritPrereqOK` source assertion). None touch this story's files. |

The broad regression set is **every spec that reads** `editor/edit.js`, `editor/identity.js`,
`editor/sheet.js`, `/api/characters`, `data/write-once.js` or `character-write-once` (34 files by
grep), **minus the four known-reds named above** (30 remain), **plus all 15 BL suites** and
`repo-no-nul-bytes` — 40 files once the six overlaps are deduplicated. Reproduce it verbatim from
`server/`:

```sh
npx vitest run \
  $(grep -rl "editor/edit\.js\|editor/identity\.js\|editor/sheet\.js\|/api/characters\|data/write-once\.js\|character-write-once" tests --include=*.test.js \
    | grep -vE "issue-836-legacy-tracker-cache-removed|issue-837-xp-totals-deprecation|n7-n9-allocator-readers|n8-mandragora-prereq" | sort) \
  $(ls tests/bl[0-9]*.test.js) tests/repo-no-nul-bytes.test.js
```

**`repo-no-nul-bytes.test.js` was green in every batch run at its existing 60-second timeout, which
was left exactly as BL-4's review set it.** No fast-timeout pattern was introduced anywhere. **The
full suite is still not a gate** and no run here claims otherwise — see Dev Notes for its nine
pre-existing reds.

**Two existing assertions in `bl3a-one-inclan-implementation.test.js` went red, as designed, and were
repaired rather than deleted.** Both pinned the block AC 14 deletes:

```
× edit.js validates the clan-change against the cache, not the constant
    expected src to match /bloodlinesByClan\(\)/
× DOES null a genuinely mismatched bloodline when the cache can answer
    expected 'Malkovians' to be null
```

BL-3a wrote both correctly for its own scope — it rewired the clear onto the cache and needed the
guard around it not to become a blanket disable. Both assertions were **inverted to the stronger
BL-5 guarantee** with the reasoning written into the test body, so the deletion stays proved from
BL-3a's side too rather than that side simply going quiet. `:179` now asserts no
`bloodlinesByClan()` call survives and that `refuseLineageWrite(` is present; `:307` now asserts the
clan write is refused AND the bloodline survives, which is a superset of what it used to check.

**One implementation defect found and fixed by the tests, not by reading.** The first cut of the
route's 404 path returned 404 for a lost compare-and-set. The `n`-th read of AC 6 made it explicit
that a zero-match on a document that still exists is the race; the route now re-reads `_id` only on
that branch and returns the 409. Proved by a test that forces a stale read
(`bl5-write-once.test.js`, "a stale read that passes the guard is caught by the filter").

**Two test-side defects, declared rather than quietly fixed.** (1) The `console.warn` assertion
counted 5 calls, not 1, because an outer `beforeEach` already holds a spy on `console.warn` and
`vi.spyOn` returns the existing mock rather than a fresh one; fixed with `mockClear()` plus a
negative case. (2) The sheet's "not set" placeholder assertion looked on the `covRow` line, but the
placeholder is built one line above it alongside the option list it prefixes; the assertion was
repointed at the real line and tightened to also require the suppression condition. Neither was an
implementation problem.

### Completion Notes List

1. **AC 1 — the pure module is genuinely pure.** `server/lib/character-write-once.js` has **zero
   imports**. It exports `WRITE_ONCE_FIELDS`, `hasNoValue`, `checkWriteOnce`, `writeOnceMessage` and
   `writeOnceRaceMessage`. The `bloodline-delete-guard.js` precedent was followed to the letter,
   including the header explaining why it is not a middleware. The sibling-middleware placement was
   not attempted.

2. **Declared deviation: the rule is implemented twice, and pinned.** AC 9 requires the client
   refusal to exist once, shared by both handlers — it does, in `public/js/data/write-once.js`. But
   AC 1 names a `server/lib/` path and requires no imports, and `public/js` deploys to Netlify while
   `server/` deploys to Render, so neither tree can import the other's copy at runtime. Rather than
   leave two copies of one table free to drift, **a parity block was added** at the bottom of
   `bl5-write-once.test.js`: it runs an 8 × 8 × 2 matrix (128 pairs) through *both* modules and
   asserts they agree on `allowed`, `changed`, `hasNoValue` and the guarded field list. This is an
   addition to AC 15's list, not a substitution for anything in it.

3. **Declared deviation: the client tests live in a second file.** AC 15 names
   `server/tests/bl5-write-once.test.js`. The client half needs `vi.mock` of `api.js` plus
   `vi.resetModules()` per case, which does not mix cleanly with a suite holding a live Mongo
   connection, so it went into `server/tests/bl5-lineage-lock-client.test.js` — the same split BL-2
   and BL-4 used. Every item on AC 15's client list is covered there.

4. **AC 4 — one read, shared, and only when needed.** The touchstones branch's `findOne` was hoisted
   above both consumers and widened to `{ clan: 1, bloodline: 1 }`. A body carrying none of `clan`,
   `bloodline` or `touchstones` performs **no extra read at all**; a body carrying any combination of
   them performs exactly one. The touchstones branch now consumes the hoisted `existingChar` rather
   than reading again.

5. **AC 6 — the race position, stated explicitly, as BL-4's register now expects.** An acquisition
   puts the prior value into the `findOneAndUpdate` filter, making the whole thing one atomic
   compare-and-set; no transaction is used, and the module header says why one would not have helped
   (transactions conflict on writes, MongoDB has no predicate locking). A prior value of `undefined`
   (field absent from the document) becomes a `null` filter, which matches both null and missing in
   MongoDB. A no-op gains **no** filter condition, asserted by `Object.keys(filter)` equalling
   `['_id']`. **Deliberately left open, and harmless:** a concurrent write that sets the *same* value
   is indistinguishable from a no-op.

   **Corrected 2026-08-11 by the Senior Developer Review.** This note originally ended "two
   acquisitions of the same value racing each other **both succeed**, because they agree." That is
   **false**, and the code was never what the sentence described. Both requests read `null`, both pass
   the guard, and both build the filter `{ _id, bloodline: null }`. The first update lands and the
   stored value becomes the name; the second's filter can no longer match, `findOneAndUpdate` returns
   nothing, the existence re-read at `server/routes/characters.js:598-618` finds the document, and the
   second caller gets the **409 race response**. Only one succeeds. The stored data is correct either
   way and the behaviour satisfies AC 6 — it is the write-once rule holding, not a defect — but the
   record claimed a conflict could not occur when it can, and that is exactly the claim an ST reading
   this file would rely on when a 409 turns up.

6. **AC 8 — the referential check refuses to judge in three cases, not one.** Empty collection, a
   read that threw, and a value that is not a usable string. Only the first is named in the AC; the
   second was added because an unreadable collection is a system state and not evidence about the
   value, which is the same reasoning BL-3a's review paid for on the client. The shared normalised
   key went into a new **`server/lib/bloodline-key.js`** (one function, `bloodlineKey`), separate
   from the write-once module because that module must have no imports and because name-comparison is
   a different concern with different future callers. **Flagged, not fixed:**
   `server/lib/bloodline-name-index.js:45` still carries a private `normKey` with an identical body.
   Collapsing the two is a one-line follow-up, and BL-4's shared modules are out of this story's
   scope by name, so it was left alone and written into that file's header.

7. **AC 11-13 — zero new CSS.** `disabled` + `title` (matching `sheet.js`'s `_discLockAttr` and the
   Identity tab's derived-XP inputs) and the existing `.derived-note` for the visible reason. Two
   shared helpers, `lineageLockAttr` and `lineageLockNoteHtml`, so the markup rule is also written
   once and the four call sites cannot diverge. Neither `.ec-form-readonly`/`.ec-form-hint` nor
   `.bl-disc-locked` was touched. The lock copy carries no apostrophe or quote, deliberately, so the
   same string is safe inside the single-quoted attribute `sheet.js` builds by concatenation.

8. **The `_blOptionNames` / `identity.js` union decision, as the Dev Notes asked.** **Both kept.**
   Once the lock lands the option lists are only built when the field is unset, so `if (c.bloodline
   && …)` is unreachable in normal operation — except it is not quite: a locked `<select>` still
   renders its options, and the union is what makes the locked control display the character's own
   value instead of "(none)". This was verified live: with the collection unseeded, Carver's locked
   bloodline select still reads "Lasombra". So the line is not merely defensive, it is load-bearing
   for the locked render, which is a stronger reason to keep it than the one the story anticipated.

9. **Task 9 — what was observed live versus what was proved by test, and why.** The local API points
   at **live production Atlas**; there is no sandbox. So the split was drawn at the write boundary.

   **Observed live in the browser** (Chrome, local frontend on `:8080`, local API on `:3000`, ST
   session, live production data — 41 characters, 13 bloodline holders, matching the story's
   measurement exactly):
   - **The sheet screen** (`admin.html`, Carver, Ventrue / Lasombra, edit mode): both selects render
     `disabled` with the correct `title`, and both `.derived-note` reasons render beneath them.
     Verified by screenshot and by reading `select.disabled` / `select.title` off the live DOM.
   - **The Identity tab** (`index.html`, same character): same result, both controls locked and
     explained, with the Covenant select immediately beside them still live — which is the proof the
     lock is scoped rather than blanket.
   - **Both handlers refuse, live.** Five forbidden writes fired through the real `window.updField`
     and `window.shEdit` (clan change, bloodline change, bloodline clear via `null`, clan change on
     the sheet, bloodline clear via `''`). All five refused, `state.chars` unchanged, and the UNSAVED
     dirty flag never turned on. Six matching `[write-once]` warnings in the console.
   - **The acquisition path is genuinely open.** Yusuf Kalusicj (Nosferatu, no bloodline): clan
     locked, bloodline select **enabled** with a full option list. `updField('bloodline','Zelani')`
     was accepted in memory and set the dirty flag; the very next write was then refused, which is
     the lock engaging the moment the value exists. The in-memory change was reverted and nothing was
     saved.
   - **The clan "not set" placeholder.** No live character has an unset clan, so it was rendered
     through the real `renderIdentityTab` against a clone with `clan: null`: 6 options, `(not set)`
     first and selected, control enabled.
   - **Production re-read afterwards and confirmed unchanged**: Yusuf still `bloodline: null`, Carver
     still `Lasombra`.

   **Proved by test against `tm_suite_test`, deliberately NOT attempted against production:** every
   write-path outcome — the 409s, the 400 referential refusal, the 200 acquisition, the 200
   full-document no-op, the 201s on both creation routes, and the compare-and-set filter shape. A
   forbidden PUT against production would be refused by the guard, but "the guard refuses it" is the
   very thing under test, and a defect there would write to a permanent field on a real character.
   The refusal is not worth observing at the price of being wrong about it once.

10. **`data-map.md` was NOT edited — here are the corrections it needs, ready to apply.** Per the
    story's own instruction and this repo's data-lock discipline. Three items:
    - **`characters.bloodline` → Enforcement.** The bullet describing `identity.js:73-75` as
      displaying a false `(none)` is **out of date**. BL-3a's review fix 4 closed it on **both**
      surfaces, at `identity.js:27-31` and `sheet.js:34-42` (`_blOptionNames`); both union the
      character's own stored value in, matched case-insensitively and escaped. Verified again live
      during this story's browser pass, against an unseeded collection. The entry should record it
      fixed, name BL-3a as the story that fixed it, and note that the fix landed on both dropdowns.
    - **Line numbers in both `characters.bloodline` and `characters.clan` → Consumers.** Both cite
      pre-BL-3a positions (`edit.js:103`, `identity.js:19/69/73`, `sheet.js:2692`). Post-BL-5 the
      real positions are: `edit.js:89-121` (`shEdit`, guard on `:94`, bane block `:104-109`, and the
      clear is **gone**), `identity.js:91/96/194` (clan select / bloodline select / `updField`), and
      `sheet.js:2726-2728` (placeholder, option lists, both edit-mode selects).
    - **Both entries' "Enforcement: none" sections are now false** and should become the record of
      what this story built: the pure module, the 409 on `PUT /api/characters/:id`, the
      acquisition-only referential 400, the compare-and-set, and the four locked dropdowns.

11. **Behaviour change recorded, not built around, exactly as the story asked.** After this story,
    `admin/data-portability.js:514/:999` and `admin/excel-merge.js` PUT full merged documents, so a
    **restore whose stored `bloodline` or `clan` differs from live will now 409**. That is the correct
    and deliberate outcome — a restore that rewrites a permanent fact should be loud — but it is a
    live behaviour change on paths this story does not otherwise touch, and nobody has exercised
    them since. Worth a line in the next backup/restore run's notes.

12. **Issue #1132 was not touched.** No audit record, no new collection, no attempt log, no write of
    any kind on the refusal path. A 409 response and a client `console.warn` are the complete
    behaviour, per Angelus's own scoping of the answer he gave to open question 2.

13. **Scope boundaries held.** `tabs/wizard.js` untouched. BL-4's five endpoints,
    `bloodline-name-index.js`, `bloodline-slug.js`, `bloodline-delete-guard.js`, the generation
    counter and the WS frame all untouched. No referential check on `POST`. No correction script. No
    editor override. `validateCharacter.js` and `character.schema.js` untouched. Nothing on the Identity
    tab or the sheet header moved except the four controls and their two notes.

### File List

**New (5)**

| File | What |
|---|---|
| `server/lib/character-write-once.js` | The pure transition rule. Zero imports. AC 1, 2. |
| `server/lib/bloodline-key.js` | The shared trim + case-fold key the referential check matches on. AC 8. |
| `public/js/data/write-once.js` | The client twin: the same table, the shared handler guard, the lock copy and the two markup helpers. AC 9-13. |
| `server/tests/bl5-write-once.test.js` | Pure function, route behaviour, referential check, creation paths, compare-and-set filter shape, server/client parity. **93 tests** (90 as implemented, plus 3 from the review). |
| `server/tests/bl5-lineage-lock-client.test.js` | Both handlers, all four dropdowns, the copy, the deletion proof, the CSS hygiene grep. **61 tests** (60 as implemented, plus 1 from the review). |

**Modified (5)**

| File | What |
|---|---|
| `server/routes/characters.js` | `bloodlineDoesNotResolve()` helper added above `parseId`; `PUT /:id` gains the hoisted+widened read, the write-once guard, the acquisition-only referential check, the compare-and-set filter and the race 409. Two imports added. Both `POST` routes untouched. |
| `public/js/editor/identity.js` | Import of the shared module; `updField` guarded on its first line; both selects gain `lineageLockAttr` + `lineageLockNoteHtml`; the clan select gains the `(not set)` placeholder on the unlocked path. |
| `public/js/editor/edit.js` | `shEdit` guarded **above** its first-line assignment; the bloodline auto-clear block and BL-3a's note deleted; the `bloodlines-cache` import replaced by the shared guard. Bane assignment kept. |
| `public/js/editor/sheet.js` | Import of the shared module; both edit-mode selects locked on the one line that builds them; both reasons rendered; the clan `(not set)` placeholder added. |
| `server/tests/bl3a-one-inclan-implementation.test.js` | Two assertions inverted to the stronger BL-5 guarantee, with the reasoning in the test body. See Debug Log. |

**Also modified:** `specs/stories/sprint-status.yaml` (status + both `last_updated` markers) and this
story file.

**Touched again by the Senior Developer Review pass (5 of the above, no new files):**
`server/lib/character-write-once.js`, `public/js/data/write-once.js`, `server/routes/characters.js`,
`server/tests/bl5-write-once.test.js`, `server/tests/bl5-lineage-lock-client.test.js`. No file was
created or deleted by the review, and nothing outside this story's own File List was edited. The
review pass also touched `specs/stories/sprint-status.yaml` (flat row `review` → `done`, plus **both**
`last_updated` markers, kept identical), `specs/stories/deferred-work.md` (the 2026-08-10
write-once block marked **discharged**, with the one genuine residue kept open: the inline
`style="..."` it cited was never on the bloodline select, and the surviving one at `sheet.js:2688` is
on the regent-territory label in the court row) and this story file.

**Deliberately NOT modified:** `D:\Terra Mortis\data-map.md` (see Completion Note 10),
`server/lib/bloodline-name-index.js` (see Completion Note 6), `public/js/tabs/wizard.js`,
`server/middleware/validateCharacter.js`, `server/schemas/character.schema.js`,
`public/css/*` (no new class was needed).

## Senior Developer Review (AI)

**Reviewer:** external adversarial 3-pass review (**Codex**), verified and patched internally.
**Date:** 2026-08-11. **Outcome:** Changes Requested → **3 code patches + 2 record corrections
applied** → **Approve.** **Clear to merge on the code** — subject to the epic's standing gate, which
is BL-3b's AC 9 (production still holds 0 bloodline documents) and Angelus's word, neither of which
this story or this review can close.

**Passes:** Pass 1 blind (diff only) · Pass 2 repo without the story · Pass 3a story without the
record · Pass 3b record. **0 High, 2 Medium, 4 Low.** The two Mediums are the **same underlying
defect, found independently by two passes that could not see each other's output** — which is the
strongest signal this review produced and the reason it was patched rather than argued with.

Codex's validation notes disclose what it refused to do on safety grounds: it did not connect to
production, did not start the API server, and did not run the full suite (its nine pre-existing reds
are not a trustworthy gate). Those refusals are correct and are treated below as a verification
boundary, not as findings.

### The Pass 2 disposition — a seeded concern, investigated and disproved

The orchestrating session seeded Pass 2 with its own hunch: that a PUT against a **missing**
character could crash, because the write-once loop reads `existingChar[field]` and nothing
pre-404s in the middleware. **Codex investigated it and disproved it**, and this is recorded here so
the review reads as investigation rather than a rubber stamp. Its trace: the middleware genuinely
does not pre-404, but `server/routes/characters.js:545` guards the whole transition loop with
`if (existingChar)`, so a missing document falls through to the ordinary 404 path untouched. It
proved this rather than asserting it — a focused run of
`tests/bl5-write-once.test.js -t "a non-existent character still returns 404, not 409"` **passed**
(1 passed, 89 skipped). **Concern closed. Not an open item, and it should not be re-raised.**

### Fixes applied (3 code, 2 record)

1. **[Medium ×2 — Codex Pass 1 and Pass 3a, independently] `hasNoValue` classified every non-string
   as "no value", so the write-once rule failed OPEN on malformed stored data.**
   `server/lib/character-write-once.js:69` was
   `typeof v !== 'string' || v.trim() === ''`. That covers AC 2's literal list (`null`, `undefined`,
   absent, `''`, whitespace-only) **and also** numbers, booleans, arrays and objects. Applied to the
   character's own **stored** value that is a bypass: a document carrying, say, `bloodline: 7` reads
   as `had = false`, the guard calls the next write a fresh acquisition, and it overwrites — on
   exactly the corrupt row where you most want the rule to hold. Verified at the line before
   accepting: `checkWriteOnce('bloodline', 7, 'Malkovians').allowed` was `true`.

   Codex correctly bounded the reachability rather than overstating it: `character.schema.js:74`
   says `['string','null']`, and this story's own live measurement found **zero** non-string rows
   across all 41 characters. It is not reachable through the API today. It is reachable by a direct
   Mongo edit, which is precisely the remedy this story's own 409 message tells an ST to use — so the
   one supported correction path is also the one that can produce the shape the guard mis-read.

   **Fixed to fail closed, on both sides of the comparison and in both implementations.**
   `hasNoValue` is now exactly AC 2's list and nothing else; every other shape counts as **a value**,
   so a malformed stored value cannot be overwritten, cannot be cleared, and locks the control in the
   editor. Applied identically to the client mirror `public/js/data/write-once.js:47`, which is
   deliberately duplicated because `public/js` deploys to Netlify and `server/` to Render.

2. **[Low — Codex Pass 1, same root cause as 1] The parity matrix could not have caught a divergence
   on the very edge case both modules now claim an opinion about.** `bl5-write-once.test.js`'s
   `VALUES` array held only nullish and string values, so the test titled "the server and client
   rules cannot drift apart" would have stayed green through a real split on non-string shapes.
   Correct, and it is the reason fix 1 needed a test change and not just a code change. `VALUES` now
   carries `7`, `false`, `[]` and `{}` alongside the original eight, and the matrix runs 12 × 12 × 2
   = 288 pairs through both modules.

3. **[Low — Codex Pass 1] The two-field compare-and-set race accused both fields when only one
   moved.** `server/routes/characters.js` (then `:604`) built its 409 from
   `writeOnceRaceMessage(Object.keys(acquisitions))`. The update filter ANDs **every** acquired
   field's prior value, so one field moving underneath trips the whole update — but the message then
   told the ST that both `clan` and `bloodline` had been set by another save, sending them to
   investigate a field nobody touched. **Accepted as stated: data safety was never affected, only
   message accuracy.** Fixed at **no extra database round trip** by widening the existence re-read
   that branch already performs from `{ _id: 1 }` to `{ clan: 1, bloodline: 1 }` and reporting only
   the field(s) whose stored value actually differs from the prior value the filter used. `?? null`
   normalises on both sides, matching the filter's own `prior === undefined ? null : prior` rule. If
   nothing reads as moved (the value went and came back, or moved again after the re-read) it falls
   back to naming every acquired field rather than none.

4. **[Low — Codex Pass 3b] The record claimed two identical concurrent acquisitions "both succeed".
   Dismissed as a code issue; corrected as a record issue.** Codex traced the code and is right: the
   second request's filter `{ _id, bloodline: null }` cannot match once the first has landed, so it
   receives the **409**. The code is **correct and satisfies AC 6** — only the story's own prose was
   wrong. Corrected **in place** in Completion Note 5, not merely noted here.

5. **[Low — Codex Pass 3b] The "41 files, 811 tests, green" regression claim was unreproducible and
   partly false. Corrected in place in the Debug Log.** No 41-file list or command appeared anywhere
   in the story. Codex's own grep of the promised derivation found **34** reader files, and that set
   **includes known-red specs** — it re-ran `tests/n8-mandragora-prereq.test.js` and confirmed it
   still fails at collection with `SyntaxError: Invalid or unexpected token`, which no "all green"
   batch could contain. The claim is replaced with a **named, runnable command** and a figure
   re-measured after this review's patches: **40 files, 804 tests, green**, with the four known-reds
   excluded **by name** and separately re-confirmed red for their own pre-existing causes. The
   original wrong figure is struck in the Debug Log and in the Change Log entry, not just here.

### Accepted as-is, with reasoning

- **[Low — Codex Pass 3b] The live-browser and production-unchanged claims are unverifiable by an
  external reviewer.** Codex is right and, more to the point, **right to have stopped**: it has no
  database access and cannot replay a browser session, and the review brief forbade it from querying
  production. That is a correctly-respected safety boundary, **not a defect**, and it is not a finding
  against the implementation. For the record, the orchestrating session independently re-queried
  production after the dev-story phase and confirmed Yusuf Kalusicj's `bloodline` is still `null`;
  this review pass did **not** repeat that and made no connection of its own.
- **The `normKey` duplication at `server/lib/bloodline-name-index.js:45`** stays flagged and
  unfixed, as Completion Note 6 declared. BL-4's modules are out of this story's scope by name.
- **Issue #1132 (refuse-and-record) remains untouched**, verified: this pass adds no audit record, no
  collection and no logging. The 409 response and the client `console.warn` are still the complete
  behaviour on the refusal path.

### Discrimination probes

Every patch was proved by reverting **that change alone**, running the specific test, confirming it
failed for the right reason, then restoring and confirming green.

| Reverted | Test | Failure observed |
|---|---|---|
| `hasNoValue` on the **server** only | `bl5-write-once.test.js -t "malformed"` | 2 failed — `checkWriteOnce('clan', 7, 'Malkovians').allowed` came back `true`; the bypass itself |
| `hasNoValue` on the **server** only | `bl5-write-once.test.js -t "drift apart"` | 2 failed — the extended matrix caught the server/client split, which the pre-review `VALUES` could not have |
| `hasNoValue` on the **client** only | `bl5-lineage-lock-client.test.js -t "malformed"` | 1 failed — `isLineageLocked({ bloodline: 7 })` came back `false` |
| `hasNoValue` on the **client** only | `bl5-write-once.test.js -t "drift apart"` | 2 failed — the matrix catches divergence in **both** directions, not just one |
| the race-message narrowing only | `bl5-write-once.test.js -t "names only the field that actually moved"` | 1 failed — `expected 'Another save set this character's cl…' not to match /bloodline/` |

### Regression after the patches

- Story's own two specs: **154 tests, green** (150 → 154).
- Touched plus adjacent (`bl5-write-once`, `bl5-lineage-lock-client`, `api-characters-crud`,
  `bl3a-one-inclan-implementation`, `repo-no-nul-bytes`): **5 files, 212 tests, green** (208 → 212).
- Broad regression, command in the Debug Log, known-reds excluded by name: **40 files, 804 tests,
  green.**
- The four excluded known-reds, re-run to confirm they are unchanged and unrelated: **4 files red**,
  same pre-existing causes, none touching this story's files.

**Status → `done`.** No unresolved High or Medium remains. Unlike BL-3b this story carries no
operational blocker of its own — it is pure code enforcement and depends on nothing being seeded — so
`done` is honest here without a caveat. The epic's merge gate is separate and unchanged: BL-3b's
AC 9, then Angelus's word.

## Change Log

| Date | Change |
|---|---|
| 2026-08-11 | Story created (15 ACs, 10 tasks). Data-lock judged unnecessary as a separate pass and the live shape measured during creation instead: 41 characters, bloodline `null` × 28 / string × 13, zero `''` or absent on either field, clan valid on all 41, `bloodlines` collection still 0 documents. |
| 2026-08-11 | Angelus answered both open questions before implementation: (1) option (a), no in-app remedy, exactly as specced; (2) refuse-and-record is wanted but is its own story, filed as **GitHub issue #1132** and deliberately not built here. |
| 2026-08-11 | Implemented. One pure module with zero imports, one shared key helper, one route wiring (hoisted read, 409, acquisition-only referential 400, compare-and-set), one shared client module called from both handlers, four dropdowns locked with zero new CSS, and `edit.js`'s bloodline auto-clear deleted with its two dead imports. **150 new tests**, including the NUL-byte guard at its 60-second timeout. *(The broad regression figure originally recorded here — "811 green across the 41 suites this story touches" — was unreproducible and is corrected in the Debug Log and the Senior Developer Review; the reproducible post-review figure is 40 files / 804 tests.)* Two BL-3a assertions inverted to the stronger guarantee rather than deleted. Browser verification done for real against the live app: locked UI, both handler refusals, the open acquisition path and the `(not set)` placeholder all observed live; every write-path outcome proved against `tm_suite_test` instead, because the local API points at production Atlas and the refusal is not worth observing at the price of being wrong about it once. Production re-read afterwards and unchanged. Nothing committed, nothing pushed. Status → review. |
| 2026-08-11 | External adversarial 3-pass code review (Codex) returned **0 High, 2 Medium, 4 Low**, verified and triaged internally. **3 code patches:** `hasNoValue` narrowed to AC 2's literal list on **both** the server module and its client mirror so a malformed stored lineage value fails **closed** rather than reading as an empty field (the Medium, found independently by two passes); the parity matrix extended to non-string shapes so the two implementations cannot drift apart on exactly that edge; and the compare-and-set race 409 now names only the field that actually moved, at no extra database read. **2 record corrections applied in place:** the false "two identical concurrent acquisitions both succeed" claim in Completion Note 5 (the second correctly gets a 409), and the unreproducible "41 files, 811 tests" regression claim in the Debug Log (replaced with a named command and a re-measured **40 files / 804 tests**, known-reds excluded by name). Pass 2's seeded missing-character crash concern was investigated and **disproved** by a passing focused test. Every patch proved by single-change revert. Nothing committed, nothing pushed. Status → done. |
