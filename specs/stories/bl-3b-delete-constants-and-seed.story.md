# Story BL-3b: Delete the constants, retire the seed — the collection becomes the only source

Status: done

> **Reviewed and patched 2026-08-11.** ACs 1-8 are met and the code carries no unresolved High or
> Medium finding. **AC 9 is NOT resolved and cannot be resolved by code**: production still holds
> **0** bloodline documents, so this branch must not be merged or deployed until the seed has been
> applied to live. See the Senior Developer Review at the end of this file.

> **Epic BL** — issue **#1008**. Fifth story to be written, second half of the original BL-3, and the
> **last story in the epic that touches migration-era scaffolding**. BL-1 built the collection, BL-2
> built the cache, BL-3a rewired every client reader onto it, BL-4 gave it a real writer. What is
> left is the ladder: three constants nothing reads, and a seed script whose only job was to get the
> data across once.
>
> **This story was explicitly held until BL-4 shipped** (ruled 2026-08-10). Until the admin CRUD
> existed, `server/scripts/seed-bloodlines.js` was the collection's *only* writer, and it reads the
> constants — deleting them first would have left the collection with no writer at all. BL-4 is done
> (`f4c6d890` implementation, `70e1c02c` review fixes), so the precondition is met.
>
> **BL-5 is separate scope** and is not unblocked or blocked by this story. It is character-side
> write-once validation of `characters.bloodline`; nothing here touches it.
>
> **Data-lock: NOT required.** Judged, not assumed. This story deletes code and moves a file. It
> introduces no new data shape, writes no production data, and adds no read or write surface. Every
> shape it depends on (`bloodlines` documents as `GET /api/bloodlines` serves them) was verified by
> BL-2's data-lock and re-verified by BL-4's, and is unchanged. The one live-data fact that matters
> is recorded in AC 9 as an operational precondition rather than a shape to lock.
>
> **Timing: the after-Game-7 gate does NOT bind this story.** BL-2 and BL-3a carried it because they
> changed what a player is charged; BL-4 carried it because it can put wrong data into production.
> BL-3b changes no live behaviour whatsoever: the three constants have zero live readers after BL-3a,
> the seed script is not part of the running app, and `dev-fixtures.js` executes only under
> `local-test-token`. The gate attaches to the **epic's merge and the seed run**, not to this story's
> code, and both of those are Angelus's explicit acts anyway. Implement whenever; merge when he says.
>
> **Deploy:** continue on `bl/bl-1-bloodline-collection` (already carries bl-1/bl-2/bl-3a/bl-4,
> unpushed). Branched from `main`, PR direct to `main`, never through `dev`. No push or merge without
> Angelus's explicit word in his current message.

## Story

As the maintainer of this codebase,
I want the three bloodline constants deleted and the seed script retired to `scripts/archive/`,
so that there is exactly **one** place a bloodline can be defined, and no future reader can pick the
wrong one.

## Why this story exists

After BL-3a, `BLOODLINE_DISCS`, `BLOODLINE_CLANS` and `APPROVED_BLOODLINES` are dead weight with a
live footprint. Three concrete costs, all present today:

| Cost | Detail |
|---|---|
| **Two hand-maintained structures that can still disagree** | `BLOODLINE_DISCS` (23 names) and `BLOODLINE_CLANS` (5 clans, 23 names) are the exact pair whose disagreement produced this epic — Ocka Keats carried "Hounds of Actaeon" for two weeks costing 4 XP/dot instead of 3. Nothing reads them for costing now, but they are still there, still editable, and still look authoritative. |
| **"Which one is really the source of truth?"** | An ST or a future author who opens `constants.js` sees a complete, plausible, current-looking bloodline table sitting next to `CLANS` and `COVENANTS`. Nothing in the file says it is dead. The next person who needs to add a bloodline will find it before they find the admin screen. |
| **A seed script that is now a trap** | `seed-bloodlines.js` reports drift but never repairs it (`:308-319`), has no update path, and derives everything from the constants. Now that BL-4's CRUD is the real writer, re-running the seed is at best a no-op and at worst the thing someone reaches for instead of the screen. |

BL-3a proved nothing reads them. This story removes them, which is the only thing that makes that
proof permanent.

There is one thing this story must be careful about, and it is the reason several ACs below are
larger than "delete three exports": **the constants are still the seed's input, and the seed is the
only bulk migration path into a fresh `bloodlines` collection. Production currently holds zero
bloodline documents** (measured 2026-08-11, BL-4 review pass). Deleting the constants without moving
their content into the archived script would leave no way to populate the collection except typing
23 bloodlines into the admin screen by hand.

## Acceptance Criteria

1. **The three exports are gone.** `public/js/data/constants.js:50-74` (`BLOODLINE_DISCS`), `:84`
   (`APPROVED_BLOODLINES`) and `:86-92` (`BLOODLINE_CLANS`) are deleted. `CLAN_DISCS` at `:76-82`
   sits **between** two of them and **stays** — it is still read by `accessors.js` for the
   no-bloodline fallback and by consumers unrelated to this epic. Verify the line numbers before
   editing; nothing else in the file references the three being removed.

2. **No file in `public/js` mentions the three names at all, in code.** The allow-list in
   `server/tests/bl3a-one-inclan-implementation.test.js:52-58` becomes **empty**. That test already
   strips comments before matching (`code()` at `:43-45`), so the migration-history comments in
   `data/bloodlines-cache.js:5/219/235/248`, `data/accessors.js:22/32` and
   `tabs/downtime-form.js:4110/4174` are fine and stay. This also settles the AC1-vs-AC7
   contradiction BL-3a's review registered in `deferred-work.md`: after this story there is no
   exception to carve out, so the contradiction cannot be inherited.

3. **`dev-fixtures.js` serves a frozen list, and local dev still works.**
   `public/js/dev-fixtures.js:1` imports both constants and `:33-36` synthesises the
   `GET /api/bloodlines` response from them. Replace with the pattern the rest of that file already
   uses for every other collection: a **single-line, pure-JSON `var` blob** at the top alongside
   `CHARS` (`:11`), `TERRITORIES` (`:12`), `DT_CYCLES` (`:13`), `DT_SUBS` (`:14`), `GAME_SESSIONS`
   (`:15`) and `TRACKER_STATE` (`:16`):
   - add `var BLOODLINES=[...];` carrying the 23 documents **exactly as `GET /api/bloodlines` serves
     them** (`_id`, `name`, `slug`, `clan`, `disciplines`; `notes` projected out — see
     `routes/bloodlines.js:201`);
   - the branch at `:33-36` collapses to `return _mock(BLOODLINES);`;
   - the `import` at `:1` is deleted, leaving the file with **no imports at all**, which is what the
     rest of it already assumes.
   Capture the 23 by running the existing `buildSeedDocs` **before** deleting anything, so the
   fixture is provably the data that was migrated rather than a retyped copy.

4. **`wizard.js` is fixed, not deferred.** `public/js/tabs/wizard.js:11` imports `BLOODLINE_CLANS`
   and `:118` reads it. The file has **zero importers** — re-confirmed by grep across `public/`,
   `server/` and `tests/` on 2026-08-11: the only hits for "wizard" elsewhere are unrelated prose in
   `admin/downtime-story.js` and `admin/downtime-views.js` about the cycle-reset wizard. Rewire it
   anyway, one line, exactly as BL-3a rewired `edit.js:103`:
   `const bloodlines = wiz.clan ? (bloodlinesByClan()[wiz.clan] || []) : [];`, importing from
   `../data/bloodlines-cache.js`. The reasoning is BL-3a's verbatim: an import of a deleted export is
   a landmine for **#1095**, which will revive this file, and one line of eventually-rewritten dead
   code is cheaper than a broken revival. **Do not wire `wizard.js` into any app, do not prime the
   cache from it, do not otherwise touch it.**

5. **The seed moves to `server/scripts/archive/seed-bloodlines.js`, self-contained and still
   runnable.** This is the load-bearing part of the archive move, not a formality:
   - **The constants travel with it.** `BLOODLINE_DISCS` and `BLOODLINE_CLANS` become frozen
     `const` literals at the top of the archived file, replacing the cross-boundary import at `:59`.
     `CORE_DISCS` / `RITUAL_DISCS` still import from `constants.js` (they are not being deleted) —
     but check the relative path survives the move.
   - **Every other relative import is repathed** for the extra directory level: `../db.js`,
     `../schemas/bloodline.schema.js`, `../schemas/character.schema.js`, `../lib/bloodline-slug.js`,
     `../lib/bloodline-name-index.js` all gain one `../`.
   - **`export { deriveSlug }` at `:80` is deleted.** Its stated purpose (`:73-79`) was to keep this
     file's importers working *until* the archive move; the move is now happening, and the shared
     implementation in `server/lib/bloodline-slug.js` is the only one anyone should reach for.
   - **The header gains an archive note**, following `server/scripts/archive/seed-rules-bloodlines.js`
     (a retired one-time bloodline migration already sitting in that folder): what it did, when it
     was retired, that the `bloodlines` collection is now canonical, that **BL-4's admin screen is
     where bloodlines are added**, and that this script exists only to bulk-populate a collection
     that has never been seeded.
   - **It still runs.** `node scripts/archive/seed-bloodlines.js` from `server/` must produce the
     same dry-run report it does today. Prove it.

6. **The unique-index guarantee is proven to survive, and no production code changes to achieve it.**
   Verified 2026-08-11: **this is already handled and needs no new work.**
   `server/routes/bloodlines.js:183-192` memoises `ensureNameIndex()` and calls it at `:338` before
   the first write of the process, with a header (`:172-182`) stating in terms that "the seed script
   is not a precondition of this screen working — a collection created entirely through POST would
   otherwise carry no unique index at all". `server/lib/bloodline-name-index.js` owns the spec, the
   `strength: 2` collation and the in-place upgrade. Coverage already exists and already
   discriminates: `server/tests/bl4-bloodlines-write-api.test.js:275-294` drops
   `bloodline_name_unique` in a `beforeAll`, then asserts a write recreates it with
   `collation.strength === 2`.
   What this AC requires is therefore **evidence, not change**:
   - re-run that suite after the archive move and record it green;
   - add one guard asserting `server/lib/bloodline-name-index.js` still has at least one importer
     **outside `scripts/archive/`**, so a future cleanup cannot quietly take the last live caller
     with it. Archiving the seed removes one of its two importers; the guard pins the other.

7. **The four test files coupled to the constants and the seed are repointed, not weakened.** Each
   imports something this story removes. Deal with all four explicitly:
   - **New `server/tests/helpers/bloodline-fixtures.js`** exporting the 23 frozen served documents
     (same content as AC 3's blob, same shape). This becomes the one hand-maintained fixture copy for
     the server suite. Capture it from `buildSeedDocs` before the deletion, as with AC 3.
   - **`bl2-clandisclist-miss-path.test.js`** (`:16` constants, `:17` `buildSeedDocs`,
     `:44` `docsFromConstants`) → builds from the fixture helper. Its `:161-177` and `:208-215`
     assertions currently read "matches `BLOODLINE_DISCS`"; they become "matches the 23 as migrated",
     which is what they now actually mean. **Do not delete assertions to make imports go away.**
   - **`bl3a-one-inclan-implementation.test.js`** (`:29` constants, `:171/194/211/248`
     `buildSeedDocs`) → same treatment, plus AC 2's empty allow-list.
   - **`bl4-bloodlines-write-api.test.js:613-617`** asserts `seed.deriveSlug === shared.deriveSlug`
     by importing the seed. That assertion dies with AC 5's re-export. Replace it with a guard that
     no file under `server/` outside `scripts/archive/` defines a second slug derivation; keep
     `:621-624` (the route derives the slug with the shared function) untouched.
   - **`bl1-seed-bloodlines.test.js` retires with the script it tests** — with one carve-out.
     `deriveSlug`'s coverage (`:43-70`: single word, spaces, the `Lidérc` diacritic case, separator
     collapse, and a schema-legal slug for every real bloodline) tests a **live** module,
     `server/lib/bloodline-slug.js`, and must be relocated to a live spec before the file goes,
     re-pointed at the fixture helper for the all-23 case. Everything else in that file — the
     integrity gate, `buildSeedDocs`, `crossCheckHolders`, and `main()` against `tm_suite_test` —
     exercises the retired migration, and the only part of it still load-bearing (the index) is
     covered by AC 6. Delete it, and say in the story record that you did and why.

8. **Behaviour is identical, and it is shown rather than asserted.** Nothing a player or an ST sees
   may change. The evidence bar for a deletion story is the same one BL-3a met:
   - a repo-wide grep proof (AC 2) rather than a manual sweep;
   - the targeted suites green: the BL-2 pair, the BL-3a suite, the four BL-4 suites,
     `bloodline-parallel-write.test.js`, `dt-form-territory-fresh-fetch.test.js` and
     `server/tests/repo-no-nul-bytes.test.js`;
   - **the AC 3 fixture proven equal to the AC 7 fixture by test.** `dev-fixtures.js` cannot be
     imported under Node (it is guarded by `if(_isDev)` and replaces `window.fetch`), so extract the
     `var BLOODLINES=` line from its source with a line-anchored regex, `JSON.parse` it, and
     deep-equal it against `bloodline-fixtures.js`. This is why AC 3 requires the blob on one line
     as pure JSON. Two frozen copies of dev scaffolding are acceptable; two that can drift are not.

9. **Operational precondition, recorded here because it is the one thing this story can make
   irreversible.** Production held **0 bloodline documents** as of 2026-08-11. Before this branch
   merges, the seed must be applied to production (`node scripts/seed-bloodlines.js --apply` from
   `server/`, or the archived path afterwards) or every one of the 13 bloodline-carrying characters
   hits BL-2's loud-miss path on the live site. This is Angelus's operational act and not a coding
   task; AC 5 exists so that it stays possible after the archive move. **State the current
   production count in the story record when you finish**, so whoever merges knows whether it has
   been done.

## What this story is NOT

- **Not BL-5.** No write-once enforcement on `characters.bloodline` or `characters.clan`, no editor
  lock, no server-side validation of character bloodline values. Separate story, separate scope, not
  blocked by this one.
- **No change to the `bloodlines` collection's live data.** This story writes nothing to any
  database. AC 9 records an operational precondition; it does not perform it.
- **No change to `CLAN_DISCS`.** It stays in `constants.js`, read by `accessors.js` for the
  no-bloodline path and by consumers outside this epic.
- **No change to BL-4's admin screen, its five endpoints, `server/lib/bloodline-name-index.js`,
  `server/lib/bloodline-slug.js`, the cache's generation counter, or the WS frame.** AC 6 proves an
  existing guarantee; it does not modify it.
- **`wizard.js` is not wired into anything.** AC 4 fixes a dangling import in a file with zero
  importers. It stays unreachable. **#1095** owns whether it lives at all.
- **No new fixture branches in `dev-fixtures.js` for BL-4's admin endpoints.** That file is imported
  only from `app.js:1525` (the player app); the admin app does not load it. Out of scope.
- **No fixing of `deferred-work.md`'s other open BL items** — the redact-mode banner merge, the
  duplicated dot totals on a locked discipline row, the second inline style at `sheet.js:2673`, the
  ECM `withObjectId` twin. Untouched.

## Tasks / Subtasks

- [x] Task 1 (AC 3, 7): **capture the frozen 23 first, before deleting anything.** Run
      `buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })`, project `notes` out, add
      `_id`s, and write both `server/tests/helpers/bloodline-fixtures.js` and the
      `var BLOODLINES=[...]` line for `dev-fixtures.js` from that one output.
- [x] Task 2 (AC 5): move `server/scripts/seed-bloodlines.js` to `scripts/archive/` with `git mv`;
      inline the two constants as frozen literals; repath the five relative imports; delete the
      `deriveSlug` re-export; write the archive header. Confirm the dry run still produces its
      report.
- [x] Task 3 (AC 1): delete the three exports from `constants.js`, leaving `CLAN_DISCS` intact.
- [x] Task 4 (AC 3): rewire `dev-fixtures.js` — blob in, import out, branch collapsed.
- [x] Task 5 (AC 4): rewire `wizard.js:11/118` to `bloodlinesByClan()`.
- [x] Task 6 (AC 7): repoint `bl2-clandisclist-miss-path.test.js`, `bl3a-one-inclan-implementation.test.js`
      and `bl4-bloodlines-write-api.test.js:613-617`; relocate the `deriveSlug` block out of
      `bl1-seed-bloodlines.test.js`; delete the rest of that file.
- [x] Task 7 (AC 2): empty the allow-list in the BL-3a guard and confirm it still passes.
- [x] Task 8 (AC 6): add the "`bloodline-name-index.js` still has a live importer" guard; re-run
      `bl4-bloodlines-write-api.test.js`.
- [x] Task 9 (AC 8): add the dev-fixtures/helper equality guard; run the targeted suites and record
      the counts.
- [x] Task 10 (AC 8): verify in a browser under `local-test-token` that the player app still boots
      with bloodline costing intact and no warn banner. **This also closes the gap BL-4's review
      registered**: with `dev-fixtures.js` no longer deriving from the constants, the admin-to-player
      WS hop becomes observable locally for the first time. It is the reason that deferral pointed
      at this story. *(Done. The player half of the hop is now observable and was observed; the
      admin half was NOT, and the story's expectation about it turns out to be half wrong — see
      Completion Note 8.)*
- [ ] Task 11: PR to `main` (Angelus's word only). *(GATED — not done.)*

## Dev Notes

### Verified state, 2026-08-11 (own grep, not inherited)

Only **two** files in `public/js` still import the three constants:

| File:line | Reads | This story |
|---|---|---|
| `public/js/dev-fixtures.js:1` | `BLOODLINE_DISCS`, `BLOODLINE_CLANS` | rewire (AC 3) |
| `public/js/tabs/wizard.js:11` | `BLOODLINE_CLANS` | rewire (AC 4), stays dead |

Comment-only mentions, already correct, **not** to be touched: `data/accessors.js:22/32`,
`data/bloodlines-cache.js:5/219/235/248`, `tabs/downtime-form.js:4110/4174`,
`server/routes/bloodlines.js:4-5`.

Server-side importers of the seed or the constants:

| File:line | Imports | This story |
|---|---|---|
| `server/scripts/seed-bloodlines.js:59` | constants | travels with the archived file (AC 5) |
| `server/tests/bl1-seed-bloodlines.test.js:26-32` | seed + constants | retires (AC 7) |
| `server/tests/bl2-clandisclist-miss-path.test.js:16-17` | seed + constants | repoint (AC 7) |
| `server/tests/bl3a-one-inclan-implementation.test.js:29` | seed + constants | repoint (AC 7) |
| `server/tests/bl4-bloodlines-write-api.test.js:613-617` | seed (`deriveSlug` identity) | replace (AC 7) |

### What BL-4 already extracted, so this story does not rediscover it

Both shared modules landed and both are live. **Do not duplicate or move them.**

- `server/lib/bloodline-slug.js` — `deriveSlug`, lifted out of the seed by BL-4 AC 7 explicitly so
  that this story's archive move could not take the route's slug logic with it. Its own header says
  so at `:5-8`.
- `server/lib/bloodline-name-index.js` — added by BL-4's review-fix pass (`70e1c02c`). Owns
  `BLOODLINE_NAME_INDEX`, the `strength: 2` collation, and `ensureBloodlineNameIndex()`, which
  creates the index or upgrades a pre-BL-4 case-sensitive one in place, scanning for case-differing
  duplicates before it drops anything. The seed calls into it at `:346` rather than calling
  `createIndex` inline, so **retiring the seed does not retire the index logic**.

### The `dev-fixtures.js` pattern to match

The file is 109 lines and 412 KB: lines 11-16 are six enormous single-line `var` blobs of pure JSON,
and the header (`:2-6`) calls the file `AUTO-GENERATED ... from live Atlas export`. Everything below
`:17` is a `window.fetch` shim dispatching on the path. **The bloodline branch at `:33-36` is the
only one in the whole file that computes its payload instead of serving a blob** — BL-2 hand-added it
and its comment says so. AC 3 is therefore not inventing a pattern; it is bringing the one exception
back into line with the five collections around it.

Note also that the equipment catalogue and the `rule_*` collections have **no** fixture branch here
at all — they fall through to a real fetch. So there is no "how ECM/PP fixture a Mongo-backed
reference collection" precedent to copy; the blob is the precedent.

### The archive convention being followed

`server/scripts/archive/` holds roughly 90 retired scripts, including
`server/scripts/archive/seed-rules-bloodlines.js` — a one-time bloodline `rule_grant` seed, retired
the same way and self-contained (it opens its own `MongoClient` rather than importing `server/db.js`).
The convention is **move, do not delete; keep it runnable; say in the header why it is here**. AC 5
follows it, with the additional requirement that the constants travel with the script — because
unlike `seed-rules-bloodlines.js`, this one's input is being deleted out from under it in the same
commit.

### Why the deletion risk class needs a grep proof rather than a review

`data-map.md` Known Drift Pattern **#1** is "a field or export removed while something still reads
it". BL-3a's own review shipped a `ReferenceError` from exactly this class: `isClanDisc` was deleted
with two live call sites surviving, and the test passed because it checked for the *declaration*
rather than the *calls*. ES modules resolve free identifiers at runtime, `node --check` passes, and
this repo has no linter. AC 2's repo-walk test is the tool that catches it; AC 7's careful repointing
is the other half, because a test file that fails to import is a different and louder failure but
still a failure.

### Environment and hard rules

- **The full suite is not a gate.** Six-plus known pre-existing reds unrelated to this epic (#1116,
  #1115, #1125, #1117, `issue-837-xp-totals-deprecation` and `n8-mandragora-prereq` parse errors,
  plus `issue-836-legacy-tracker-cache-removed` which BL-4 identified as a seventh). Run this story's
  own specs plus every spec it touches. Never pipe through `tail` — it masks the exit code.
- `server/tests/repo-no-nul-bytes.test.js` must stay green. Its 60-second timeout was set during
  BL-4's review after the "transient" failures turned out to be a too-short timeout rather than a
  flake. **Do not introduce a fast-timeout pattern anywhere this story touches.** It has caught a
  real transient NUL byte from shell-driven edits twice in this epic; if you edit files with
  `node -e`, expect it to earn itself again.
- Tests run with `cd server && npm run test` (vitest, `singleFork`, forced onto `tm_suite_test`).
- British English throughout. No em-dashes in any string the app prints.
- Normalised CSS is mandatory — **not expected to apply here**; this story touches no markup and no
  UI string. If that turns out to be wrong, tokens only, reuse before invent.
- Branch `bl/bl-1-bloodline-collection`, PR direct to `main`. No push, no merge, no deploy without
  Angelus's explicit word in his current message.

### References

- Issue **#1008**; `specs/stories/sprint-status.yaml` → `epic-bl` block (`:912-923`), particularly the
  BL-3b line at `:921` and the split note at `:916-919`
- `specs/stories/bl-1-bloodline-collection-and-seed.story.md` — the seed's design and its integrity
  gate, which is what AC 5 is archiving rather than deleting
- `specs/stories/bl-3a-rewire-readers-to-cache.story.md` — the grep-proof precedent (its AC 1), the
  reader table this story finishes, and the `ReferenceError` post-mortem in its review
- `specs/stories/bl-4-admin-crud.story.md` — AC 7 (`deriveSlug` extracted ahead of this story), its
  Senior Developer Review and Change Log for the collated index and the ensure-on-write guarantee
- `specs/stories/deferred-work.md` — three entries this story discharges: the empty allow-list, the
  AC1/AC7 contradiction, and the player-app WS hop that only this story's `dev-fixtures.js` rewiring
  can make observable
- `D:\Terra Mortis\data-map.md` — the "Bloodlines - `BLOODLINE_DISCS` / `BLOODLINE_CLANS` /
  `APPROVED_BLOODLINES`" entry (`:238`) and the "`bloodlines` (collection)" entry (`:301`); Known
  Drift Patterns **#1**, **#2** and **#15**
- `server/scripts/archive/seed-rules-bloodlines.js` — the archive-move precedent

## Open question for Angelus

**One, and it is AC 9's.** Production holds zero bloodline documents. The seed has never been applied
to live. That is fine while the branch is unmerged, but it means the epic's merge and the seed run
are a single operation, not two independent ones — merging the frontend without seeding would put
all 13 bloodline-carrying characters on the loud-miss path at once.

This story does not change that; it only ensures the seed stays runnable afterwards (AC 5). But it is
worth confirming you want the sequence to be **seed production first, then merge** rather than the
other way round, since the reverse leaves a visible window where every bloodline character shows the
warn banner. If you would rather populate the collection through BL-4's admin screen instead of the
archived seed, say so and AC 5 can be reduced to a plain archive move.

**Still open after implementation.** Re-measured 2026-08-11 at the end of this story: production
still holds **0** bloodline documents, and 13 characters still carry a bloodline (13/13 resolving
against the seed set). Nothing here changed that, and nothing here can. The question is unchanged and
is yours.

## Dev Agent Record

### Agent Model Used

`claude-opus-5[1m]` (Claude Code, dev-story phase), 2026-08-11.

### Debug Log References

No debug log entries. Three self-inflicted red-then-green cycles during implementation, all in the
new guards rather than in production code, all recorded in the Completion Notes (items 5, 6 and 7).

### Completion Notes List

1. **Task ordering held: the 23 were captured before anything was deleted.** A throwaway script in
   the scratchpad imported the still-live `buildSeedDocs` and the still-live constants, ran
   `buildSeedDocs({ discs: BLOODLINE_DISCS, clans: BLOODLINE_CLANS })`, and wrote BOTH frozen copies
   from that single output — `server/tests/helpers/bloodline-fixtures.js` and the
   `var BLOODLINES=` line for `dev-fixtures.js`. So the two copies are provably the migrated data
   and provably identical at birth; AC 8's guard is what keeps them identical.

   **One shape decision, declared:** the fixture carries exactly the five fields AC 3 names
   (`_id`, `name`, `slug`, `clan`, `disciplines`) and drops `created_at`/`updated_at`, which
   `buildSeedDocs` emits and `PUBLIC_PROJECTION` does not strip. The old inline test helpers kept
   them (`({ notes, ...d })`). Nothing in the cache or the accessors reads a timestamp, and freezing
   a wall-clock value into a fixture makes it look like a record of a moment rather than a record of
   a shape. AC 3's own field list is what was followed. `_id`s are `bl-0`…`bl-22`, matching the
   convention `dev-fixtures.js` already used.

2. **The archived seed is genuinely still runnable, and it was run.**
   `node scripts/archive/seed-bloodlines.js` from `server/` produces its full report, byte-for-byte
   the same table as before the move: integrity OK, 23 in source, 0 already present, would insert 23,
   and the live cross-check `13 character(s) ... 13/13 holder(s) and 13/13 distinct value(s) resolve`.
   `BLOODLINE_DISCS` and `BLOODLINE_CLANS` are frozen `const` literals at the top of the file with a
   do-not-edit header; `CORE_DISCS`/`RITUAL_DISCS` still import from `constants.js` at the new depth.
   All five relative imports gained one `../` and every one of them is asserted resolvable by test
   (`bl3b-constants-deleted.test.js`, "still resolves every relative import it kept").

3. **`CLAN_DISCS` was left alone, and the guard for it is an import rather than a grep.**
   `bl3b-constants-deleted.test.js` imports `{ CLAN_DISCS }` from `constants.js` by name. If a later
   cleanup takes it out with the others, that file fails at module load with a real error rather than
   passing a source-text check — which is the shape of failure BL-3a's `isClanDisc` post-mortem asked
   for.

4. **`wizard.js`: one line changed, still zero importers.** `:11` drops `BLOODLINE_CLANS` from the
   `constants.js` import and gains `import { bloodlinesByClan } from '../data/bloodlines-cache.js'`;
   `:118` becomes `wiz.clan ? (bloodlinesByClan()[wiz.clan] || []) : []`, identical in form to
   `edit.js:103`. Re-confirmed after the edit that nothing imports it: the only repo-wide hits for
   `tabs/wizard.js` are two test files that read it as SOURCE TEXT
   (`issue-836-legacy-tracker-cache-removed.test.js:117`, `issue-837-xp-totals-deprecation.test.js:305-306`),
   not importers. It is not wired anywhere, does not prime the cache, and remains #1095's problem.

5. **Red-then-green #1 — the blob guard and CRLF.** `public/js/` is CRLF; the first cut of the
   single-line-JSON assertion did `line.replace(/;$/, '')` after a `split('\n')`, so the trailing
   `\r` defeated the anchor and `JSON.parse` threw at position 3001. Fixed by trimming. Worth
   recording because AC 8's *other* regex (`/^var BLOODLINES=(\[.*\]);$/m`) was never affected —
   JS treats CR as a line terminator for `$` under `/m` — so the two guards disagreed about the same
   line for a reason that is invisible unless you go looking.

6. **Red-then-green #2 — a guard that caught itself.** The "nothing outside `scripts/archive` imports
   the seed" check first matched the bare filename anywhere in a file, and the only offender it found
   was the guard file, which names the path in half a dozen string literals. Narrowed to import
   specifiers (`from '…seed-bloodlines.js'` / `import('…')`).

7. **Red-then-green #3 — the same trap in the AC 7 replacement.** The new "everything that derives a
   slug imports the shared module" check first matched the bare identifier `deriveSlug`, and again
   the only offender was a guard file that names it inside a regex literal. Narrowed to CALL sites
   (`(^|[^.\w])deriveSlug\s*\(`), which is also the stronger assertion and the one BL-3a's post-mortem
   argues for: a call is what ReferenceErrors at runtime, not a mention.

8. **Task 10 — what was and was not observable in the browser. The story's expectation about the
   WS hop is half wrong, and this is the honest version.**

   Observed, under `local-test-token` at `http://localhost:8080/index.html` with the local API up:
   - `[dev-fixtures] active — 31 chars, 5 territories`, and the file now loads with **no imports**;
   - `GET /api/bloodlines` served 23 documents from the frozen blob, first document `Ankou`/`ankou`/
     `Mekhet`, matching the helper fixture exactly;
   - the player app booted fully to the character grid, then to Dr Cazz's sheet (Malkovians), whose
     Disciplines panel renders Auspex / Celerity / Obfuscate / Resilience;
   - **11 bloodline-carrying fixture characters, `getBloodlineMisses()` empty, no warn banner in the
     DOM and no warn text on the page**;
   - costing spot-checks through the real accessors: `clanDiscList` for Hounds of Actaeon returns the
     bloodline list (not the Gangrel fallback — the #1008 defect itself); Malkovians is
     `Animalism → false`, `Auspex → true`, the two-way error BL-2 documented; a plain Gangrel with no
     bloodline still gets the clan list;
   - no console error or warning naming a bloodline, a constant, a `ReferenceError` or a
     `SyntaxError` on a clean reload.

   **The WS hop: the player half works and was proved; the admin half was deliberately not
   attempted.** `refetchBloodlines()` fires, reaches `http://localhost:3000/api/bloodlines`, and
   re-resolves all 23 with no misses. But the reason the admin-to-player hop is still not fully
   observable locally is not the constants — it is that `dev-fixtures.js` intercepts
   `GET /api/bloodlines` for the *refetch* as well as the boot load. A bloodline created on the admin
   screen would reach a `local-test-token` player app as a frame that triggers a refetch returning
   the same frozen 23. Seeing the new bloodline arrive needs a player session **without**
   `local-test-token`. The deferral BL-4's review pointed at this story is therefore only partly
   discharged: the frame → refetch → re-resolve path is now demonstrable, the new-data path is not.

   And the admin-side write was not performed, on purpose: `server/.env` points the local API at the
   **live Atlas `tm_suite`**, so an admin-screen create would have been a production write. This
   story writes no data (see "What this story is NOT"), so the check stops at the boundary rather
   than crossing it.

9. **One addition beyond the letter of the ACs, declared rather than hidden: `CLAUDE.md`.** It listed
   `BLOODLINE_DISCS` under "Immutable reference data (baked into JS modules)" and said all of them
   live in `constants.js`. Leaving that would have left the repo's own onboarding document asserting
   the existence of an export this story deleted — the same "looks authoritative, is dead" cost the
   story's own rationale table opens with. Changed minimally: the bullet becomes `CLAN_DISCS`, a
   one-line pointer says bloodlines are no longer on that list, and an Epic BL entry joins Epic PP
   and Epic ECM under "Previously-static data now MongoDB-backed". No other section touched.

10. **What was deliberately NOT touched, having been noticed.** `server/lib/bloodline-slug.js:4` says
    the implementation was lifted out of `server/scripts/seed-bloodlines.js:78-85`, which is now a
    stale path. That file is named in "What this story is NOT" as out of scope, so the comment stands;
    flagging it here so review can rule rather than rediscover. Also untouched, as scoped out: BL-5,
    BL-4's screen/routes/shared modules, `CLAN_DISCS` itself, any `dev-fixtures.js` branch for BL-4's
    admin endpoints, and every other open item in `deferred-work.md`.

### Test Results

Run with `cd server && npx vitest run <files>`. No output was piped through `tail` at any point.

| Suite | Result |
|---|---|
| `bl3b-constants-deleted.test.js` **(new)** | 19 passed |
| `bl2-clandisclist-miss-path.test.js`, `bl2-bloodlines-cache.test.js`, `bl2-bloodline-warn-banner.test.js`, `bl2-boot-priming.test.js`, `bl2-editor-discipline-lock.test.js`, `bl3a-one-inclan-implementation.test.js`, `bl1-bloodlines-api.test.js`, `bl1-bloodline-schema.test.js`, `bl3b-constants-deleted.test.js` | **9 files, 160 tests, all passed** |
| `bl4-bloodlines-write-api.test.js`, `bl4-bloodlines-admin-view.test.js`, `bl4-bloodlines-refetch.test.js`, `bloodline-parallel-write.test.js`, `dt-form-territory-fresh-fetch.test.js` | **5 files, 117 tests, all passed** |
| `repo-no-nul-bytes.test.js` | 1 passed (its 60-second timeout left as BL-4's review set it; no fast-timeout pattern introduced) |
| **All 15 of the above in one final run** | **15 files, 278 tests, all passed** |
| **After the review pass**, the same 15 plus `bl3b-archived-seed-smoke.test.js` | **16 files, 308 tests, all passed** — see the Senior Developer Review for the 30 new tests and the five discrimination probes |

AC 6's evidence specifically: `bl4-bloodlines-write-api.test.js` is green including the
`beforeAll` that DROPS `bloodline_name_unique` and then asserts a write recreates it with
`collation.strength === 2` (`:275-294`). No production code changed to achieve it.

**Full suite, for context only — it is not a gate.** 174 files, 2351 tests: **165 files / 2347 tests
pass; 9 files fail**. Seven are collection-time failures on the known pre-existing red list
(`issue-1013`, `issue-1021`, `issue-811`, `issue-826`, `issue-836-legacy-tracker-cache-removed`,
`issue-837-xp-totals-deprecation`, `n8-mandragora-prereq`). Two more carry in-file failures and are
**not** on the story's list, so they are named here explicitly: `epic.708.3-cycle-phase-controls`
(3 failures, source greps for `setGamePhase` / `data-phase` / `gold2` in `admin/cycle-views.js`) and
`n7-n9-allocator-readers` (1 failure, a source grep for `meritPrereqOK` in the merit utilities). Both
grep files this story does not modify — the complete tracked change set is the ten paths in the File
List — so neither can be caused by it, but neither was verified green before this branch either.

### File List

**New**
- `server/tests/helpers/bloodline-fixtures.js` — the 23 frozen served documents plus three shape
  helpers (`bloodlineFixtures()`, `fixtureDiscsByName()`, `fixtureNamesByClan()`); the review added
  `created_at`/`updated_at` and the `FIXTURE_TIMESTAMP` export
- `server/tests/bl3b-constants-deleted.test.js` — guards across AC 1, 2, 3, 5, 6 and 8 (19 at
  implementation, **27** after the review added the stripper self-tests)
- `server/tests/helpers/strip-comments.js` **(review)** — the quote-aware comment stripper the AC 1/2/5/6
  source greps now use, replacing the regex pair in `bl3b` and `bl3a`
- `server/tests/bl3b-archived-seed-smoke.test.js` **(review)** — 22 tests over the archived migration's
  pure functions (`checkIntegrity`, `buildSeedDocs`, `crossCheckHolders`), restoring the executable
  coverage that retired with `bl1-seed-bloodlines.test.js`

**Moved**
- `server/scripts/seed-bloodlines.js` → `server/scripts/archive/seed-bloodlines.js` (`git mv`, then
  edited: archive header, two frozen constant literals, five repathed imports, `deriveSlug`
  re-export deleted)

**Deleted**
- `server/tests/bl1-seed-bloodlines.test.js` — retired with the script it tested. Its `deriveSlug`
  block (`:43-70`) was relocated first, to `bl4-bloodlines-write-api.test.js`'s AC 7 describe, and
  re-pointed at the fixture helper for the all-23 case; that block tests the LIVE
  `server/lib/bloodline-slug.js`, everything else in the file tested the retired migration and the
  only part of it still load-bearing (the unique index) is covered by AC 6.

**Modified**
- `public/js/data/constants.js` — three exports deleted, `CLAN_DISCS` kept, signpost comment added
- `public/js/dev-fixtures.js` — import removed (file now has none), `var BLOODLINES=` blob added
  alongside its five siblings, bloodline branch collapsed to `return _mock(BLOODLINES);`; the review
  added `created_at`/`updated_at` to the blob
- `public/js/tabs/wizard.js` — `:11` import and `:118` read rewired to `bloodlinesByClan()`; still
  unreachable
- `server/tests/bl2-clandisclist-miss-path.test.js` — repointed to the fixture helper; no assertion
  removed
- `server/tests/bl3a-one-inclan-implementation.test.js` — repointed to the fixture helper; allow-list
  emptied; the review repointed its `code()` at the shared quote-aware stripper
- `server/tests/bl4-bloodlines-write-api.test.js` — seed-identity assertion replaced by two
  "no second implementation" guards; five relocated `deriveSlug` cases added
- `CLAUDE.md` — reference-data lists corrected (see Completion Note 9)
- `server/routes/bloodlines.js` — **not modified.** Listed only because the review's discrimination
  probe for fix 2 temporarily moved one line in it and restored the file byte-identically; `git diff`
  confirms no change.
- `specs/stories/sprint-status.yaml` — `bl-3b` → `review` at implementation, → `done` after the
  review; both `last_updated` markers updated each time and verified identical to each other
- `specs/stories/deferred-work.md` **(review)** — three entries from the review pass: the three
  surviving copies of the old regex stripper, the symlink-blind file walkers, and AC 9 named as an
  open operational gate rather than a dropped finding
- `specs/stories/code-review/bl-3b-delete-constants-and-seed-codex-findings.md` **(review)** — the
  external findings (new, written by Codex)
- `specs/stories/code-review/bl-3b-delete-constants-and-seed-diff.txt` **(review)** — the reviewed
  diff handed to Codex (new)
- `specs/stories/bl-3b-delete-constants-and-seed.story.md` — this record, plus the Senior Developer
  Review section

### Change Log

| Date | Change |
|---|---|
| 2026-08-11 | External adversarial review (Codex), then verified and patched internally. 1 High, 4 Medium, 4 Low. **Zero functional defects in the shipped code** — the High is AC 9, an operational precondition the story had already disclosed, and every Medium is about the STRENGTH of the new guard suite rather than about behaviour. 5 fixes (4 Medium, 1 Low), 3 Low dismissed with reasons, the High left open because no code change addresses it. The comment stripper the AC 1/2/5/6 greps depend on became a quote-aware scanner in a shared helper and is now self-tested (7 cases); measured first, and the old regex pair was erasing real executable text in 10 of 659 files. The "no live importer" guard was found to miss FOUR of five import forms once probed, including the single-quoted bare side-effect import this repo's own convention would produce — the review's stated double-quote concern was the smaller half of that hole. The index-ordering test now asserts source order instead of claiming to. A new 22-test smoke suite exercises the archived migration's `checkIntegrity`, `buildSeedDocs` and `crossCheckHolders` against the frozen fixtures, with no database, restoring the coverage that retired with `bl1-seed-bloodlines.test.js`. Both frozen fixture copies gained `created_at`/`updated_at`, which `GET /api/bloodlines` really does serve. All five fixes proved to discriminate by single-change revert. 308 tests green across 16 suites, up from 278 across 15. **AC 9 remains open**: production still holds 0 bloodline documents. Status → done for the code; the merge is still gated on the seed and on Angelus's word. |
| 2026-08-11 | BL-3b implemented on `bl/bl-1-bloodline-collection`. The 23 bloodlines captured from the live `buildSeedDocs` FIRST, into two frozen copies held equal by test; the seed moved to `server/scripts/archive/` with its two constants inlined and proven still runnable (dry run identical, 0 present / would insert 23); `BLOODLINE_DISCS`, `BLOODLINE_CLANS` and `APPROVED_BLOODLINES` deleted from `constants.js`; `dev-fixtures.js` reduced to a blob and left with no imports at all; `wizard.js` rewired and left unreachable; four coupled specs repointed and one retired. BL-3a's allow-list is now empty. 278 tests green across the 15 touched/adjacent suites including the NUL-byte guard. Browser-verified under `local-test-token`: 11 bloodline characters, zero misses, no warn banner, costing correct including the Actaeon and Malkovians cases. Production bloodline-document count at completion: **0** (AC 9 — unchanged, and unchanged BY this story, which writes no data). Status → review. NOT committed, NOT pushed, no PR. |

## Senior Developer Review (AI)

**Reviewer:** external adversarial 3-pass review (Codex), verified and patched internally.
**Date:** 2026-08-11. **Outcome:** Changes Requested → 5 fixes applied → **Approve on the code.**
**Not clear to merge:** AC 9 is unresolved and no code change can resolve it. See "The one this pass
cannot close" below before doing anything with this branch.

**Passes:** Pass 1 blind (diff only) · Pass 2 repo without the story · Pass 3a story without the
record · Pass 3b record. **1 High, 4 Medium, 4 Low.** Its validation notes disclose the exact
commands, the two things it refused to do on safety grounds (no manual Mongo connection, no run of
the archived seed even in dry-run, because that loads `server/.env` and reaches live Atlas), and the
claims it therefore could not substantiate.

The shape of this review is worth recording because it is unlike BL-4's. **Codex found zero
functional defects in the shipped code.** Every Medium is about how much its own new guard suite
actually guarantees, which is the right thing to attack in a deletion story: the change here is
subtraction, and the only thing standing between subtraction and a `ReferenceError` in production is
whether the source greps can see. Three of the four Mediums say, in different ways, that they could
not. They were right in three of three, and in one case understated.

### The one this pass cannot close

**[High] AC 9 — production still holds 0 bloodline documents.** Confirmed, disclosed, and
**operational, not code.** The story's own "Open question for Angelus" raised it before
implementation and re-measured it after; Codex independently reached the same conclusion from the
story text and correctly declined to query production to verify it.

Nothing in this review pass changes it and nothing could. If this branch merges before the seed is
applied to live, all **13** bloodline-carrying characters land on BL-2's loud-miss path at once:
bloodline disciplines stop resolving for costing and the warn banner appears for every one of them,
until the collection is populated. AC 5 exists so the archived script stays runnable for exactly
this act, and the smoke suite added by this review is what keeps its logic honest until then.

**This is Angelus's call and Angelus's sequence.** The story's recommendation stands: seed
production first, then merge. Do not read `Status: done` as "ready to deploy" — it means the code is
implemented and reviewed, in the same sense BL-4 is `done` and unmerged.

### Fixes applied (5)

1. **[Med] The comment stripper could erase executable code, and the guards' whole value rested on
   it** (`bl3b-constants-deleted.test.js:36-38`). Correct, and measured before it was fixed rather
   than after: a scanner comparison across the exact trees these tests walk found the regex pair
   erasing real executable text in **10 of 659 files** in `public/js` and `server` today, worst case
   2,313 characters in `public/js/admin/bloodlines-admin.js` — which is inside the AC 2 walk. It
   happened not to hide any of the three deleted constant names on the day it was measured, and
   "happened not to" is the entire problem.

   Replaced with a quote-aware character scanner in a new shared helper,
   `server/tests/helpers/strip-comments.js`, which tracks single/double/template literals and
   backslash escapes and honours comment markers only outside them. Deliberately **not** a parser:
   regex literals are not recognised, which biases it toward KEEPING text it should have dropped, so
   the residual failure mode is a loud false alarm rather than a silent pass. `bl3a`'s identical
   `code()` (`bl3a-one-inclan-implementation.test.js:57-59`) was repointed at the same helper — it is
   the co-guard for this story's own AC 2 and its allow-list is the one that must stay empty, so
   hardening one and not the other would have been the worse half-measure. Seven self-tests now pin
   the helper's behaviour.

2. **[Med] The "index ensured before first write" test proved no ordering**
   (`bl3b-constants-deleted.test.js:251-255`). Correct: it asserted that two text fragments existed
   somewhere in a 500-line file. The real guarantee was never here and is not moved here — it is
   `bl4-bloodlines-write-api.test.js:275-294`, which drops `bloodline_name_unique` in a `beforeAll`
   and asserts a write recreates it with `collation.strength === 2` against `tm_suite_test`. That is
   proof by behaviour. What this test now adds is the cheap structural half behaviour cannot see:
   `await ensureNameIndex()`'s source position must sit after `router.post('/'`, before the first
   `insertOne`/`insertMany`, and before the next handler registration. Renamed to say what it checks,
   with the BL-4 test named at the site as the actual guarantee.

3. **[Med] The importer guards accepted only single-quoted specifiers**
   (`bl3b-constants-deleted.test.js:199,220`). True, and **the review understated it.** Probing with
   a planted offender showed the original regex missed **four of five** real import forms:
   double-quoted `from`, dynamic `import("…")`, bare `import "…"` *and bare `import '…'`* — the last
   of which is single-quoted and therefore exactly what this repo's own convention would produce.
   The first cut of this fix widened the quote class and still missed the bare forms, which the probe
   caught; the guard now matches `from` / `import` / `require`, an optional parenthesis, and all
   three quote styles. Context on the original risk: there are **zero** double-quoted module
   specifiers anywhere in `server/` or `public/js`, so nothing was evading it on the day — but a bare
   side-effect import is the worst case of all, because it executes the retired migration rather than
   borrowing a function from it. The AC 6 `bloodline-name-index.js` guard got the widened quote class
   but deliberately not the bare-import forms: that guard asserts an importer EXISTS, so widening it
   loosens rather than tightens, and a side-effect import would not be a real caller anyway.

4. **[Med] The only retained bulk migration lost nearly all its executable coverage.** The
   substantive one. `bl1-seed-bloodlines.test.js` retired with 35 tests, of which only the five
   `deriveSlug` cases were relocated, leaving `checkIntegrity`, `buildSeedDocs` and
   `crossCheckHolders` untested — in a script AC 5 deliberately keeps runnable precisely because it
   may still be run against a production collection that has never been seeded.

   New `server/tests/bl3b-archived-seed-smoke.test.js`, **22 tests, no database**. Importing the
   archived script opens no connection (`server/db.js` connects only inside `connectDb()`, and
   `assertTestDbSafety` refuses a non-`_test` database under vitest regardless), so the three pure
   functions are exercised in isolation. Eleven integrity-gate defect classes, each changing exactly
   one thing against a clean two-entry source: wrong discipline count, unknown discipline name
   ("Vigor" for "Vigour"), repeated discipline, non-array discipline list, invalid clan key, a name
   claimed by two clans, a name listed twice under one clan, a clan claim with no discipline entry
   behind it, a bloodline no clan claims, a non-array clan list, a slug collision, and an empty slug.
   Plus `buildSeedDocs` refusing to build from a rejected source rather than silently dropping the
   bad row, and — the strongest assertion in the file — **the archived script rebuilding the migrated
   23 document for document against the frozen fixtures.** That last one converts Codex's own
   entry-by-entry hand comparison (its Low 3, resolved inside its own review) into a permanent test.

   This file is the single documented exemption to fix 3's "nothing imports the retired seed" guard,
   and that guard now asserts the exemption is real — the file must exist and must still import the
   script — so it cannot decay into a dead carve-out.

5. **[Low] The frozen fixtures were not the shape `GET /api/bloodlines` actually serves.** Correct.
   `PUBLIC_PROJECTION` excludes `notes` and nothing else, so `created_at` and `updated_at` are part
   of the served response; both frozen copies carried five fields while an assertion titled "exactly
   the fields GET … serves" locked the difference in. Both now carry all seven, at a frozen
   `FIXTURE_TIMESTAMP` of `2026-08-11T00:00:00.000Z` rather than a wall-clock value — and that same
   constant is what the smoke suite hands `buildSeedDocs`, so the timestamps are not arbitrary filler
   but the thing that makes fix 4's document-for-document comparison possible. Nothing in the cache
   or the accessors reads a timestamp, so no behaviour changed.

### Dismissed (3), with reasons

- **[Low] The archived seed's dry-run claim cannot be independently verified.** Not a defect — a
  correctly respected safety boundary. The script loads `server/.env` and reaches live Atlas even in
  dry-run, so neither Codex nor this pass ran it. The recorded run stands as the author's, and the
  new smoke suite now covers the logic underneath it without touching a database.
- **[Low] The archived constants might not be byte-faithful.** Raised in Codex's Pass 1 and resolved
  by Codex's own Pass 2, which compared them entry by entry against `70e1c02c` and found exact
  equality (1,435 and 364 characters after CRLF normalisation). No separate action, and fix 4 now
  re-proves it by test on every run rather than by inspection once.
- **[Low] The file walker would not follow a symlinked source directory.** True of `walkJs`, and
  zero current exploitability: Codex's own `Get-ChildItem -Attributes ReparsePoint` over `public/js`
  and `server` returned nothing. Recorded, not fixed — guarding against a repository shape this
  project does not have would be speculative complexity in the one file that most needs to stay
  readable.

### Found by this pass, not by Codex

- **The bare side-effect import hole** in fix 3, strictly larger than what was reported and exposed
  only by planting an offender rather than by reading the regex. This is the argument for the
  discrimination protocol in one line: the fix written from the finding alone was still wrong, and
  only the probe said so.
- **`bl3a-one-inclan-implementation.test.js:57-59` carried the identical stripper**, and it is the
  guard running this story's empty allow-list. Repointed as part of fix 1.
- **Three further copies of the same regex pair remain**, in `bl2-boot-priming.test.js:34`,
  `bl4-bloodlines-admin-view.test.js:267/378/401` and `bl4-bloodlines-write-api.test.js:48`. Left
  alone: they belong to other stories' ACs and none of them walks a tree — each strips a single named
  file whose content is known. Named here so the next author repoints them at
  `helpers/strip-comments.js` rather than rediscovering the problem from scratch.

### Accepted as-is

- **`server/lib/bloodline-slug.js:4` still cites `server/scripts/seed-bloodlines.js:78-85`**, a path
  this story moved. Flagged by the implementation record for review to rule on rather than
  rediscover: it stays. The file is named in "What this story is NOT", the comment is a provenance
  note rather than a live pointer, and editing an out-of-scope file to correct a comment is how a
  deletion story grows a tail.
- **The two extra full-suite reds** (`epic.708.3-cycle-phase-controls`, `n7-n9-allocator-readers`).
  Codex reproduced both independently and confirmed with `git diff` that this change touches neither
  the suites nor the files they grep. Pre-existing, not caused here, and not this story's to fix.

### Regression after patching

`cd server && npx vitest run` over 16 suites — the two BL-3b files, the seven other BL-1/BL-2/BL-3a
files, the three BL-4 files, `bloodline-parallel-write`, `dt-form-territory-fresh-fetch` and
`repo-no-nul-bytes`: **`Test Files 16 passed · Tests 308 passed`**, up from 15 files / 278 tests.
Thirty new tests, all from this pass (7 stripper self-tests, 22 archived-migration smoke tests, and
1 added assertion inside the index-ordering guard). No output was piped through `tail` at any point.
`node --check` clean on all eight touched JavaScript files. Line endings verified consistent per
tree — `public/js` CRLF, `server/` LF, no mixed file — and `repo-no-nul-bytes` green.

All five fixes proved to discriminate by single-change revert, each restored byte-identically
afterwards and re-confirmed green:

| Fix | Probe | Result |
|---|---|---|
| 1 stripper | `stripComments` body swapped back to the old regex pair | **7 self-tests fail**, each naming the literal it wrongly ate; restored → 27 pass |
| 2 index order | `await ensureNameIndex()` moved below `insertOne` in `routes/bloodlines.js` | fails on "the await moved below the first insert" (7709 vs 7239). The OLD assertions both still returned `true` against that same broken source, which is the point |
| 3 importer guard | `server/lib/_discrimination-probe.js` planted with a bare double-quoted import of the archived seed | the first widened regex **passed** — hole found and closed; the final regex flags the file, and the original catches 1 of 5 import forms to the new one's 5 of 5 |
| 4 smoke suite | (a) the unknown-discipline check deleted from `checkIntegrity`; (b) `.sort()` added to `buildSeedDocs`'s discipline copy | (a) 1 of 22 fails, exactly the "Vigor" case; (b) the document-for-document comparison fails on four bloodlines' discipline order |
| 5 fixture shape | `created_at` removed from the first document of the `dev-fixtures.js` blob only | both AC 8 guards fail — the deep-equality and the field-list assertion |

**No unresolved High or Medium remains in the code. AC 9 remains an open operational precondition
and is not a code finding.** `Status: done` records the former; it does not claim the latter.

**Nothing was committed, pushed, merged or deployed by this pass.** The whole story — implementation
and these review fixes together — is still one uncommitted change set on `bl/bl-1-bloodline-collection`.
