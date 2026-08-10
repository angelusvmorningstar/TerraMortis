# Story BL-3a: One implementation of in-clan — rewire every reader to the cache

Status: ready-for-dev

> **Epic BL** — issue **#1008**. Third story, and the one that makes the epic's promise true on
> **every** costing surface rather than one.
>
> **This story is half of the original BL-3**, split on 2026-08-10 after BL-3 and BL-4 were found to
> block each other. BL-4 must not ship before the DT form stops reading the constants (a Mongo-only
> bloodline would otherwise cost one price on the sheet and another in the DT form, silently), but
> BL-3 could not delete the constants because **`server/scripts/seed-bloodlines.js:57` reads them** —
> deleting both would leave the collection with no writer at all until BL-4 exists. Angelus ruled the
> split. **BL-3a rewires the readers and KEEPS the constants; BL-3b deletes them, after BL-4.**
>
> **Data-lock:** no new pass needed. BL-2's data-lock (2026-08-10) verified every reader and the
> shapes are unchanged; `D:\Terra Mortis\data-map.md` is current. The reader list below was
> **re-verified by grep on 2026-08-10 after BL-2 landed** — but re-verify line numbers before editing,
> because BL-2 moved some of them.
>
> **Deploy:** branch from `main`, PR direct to `main`, never through `dev`. No push or merge without
> Angelus's explicit word in his current message.
>
> **Timing:** Epic BL is agreed for **after Game 7 (Sat 2026-08-15)**. This story changes what players
> are charged in the DT form, so it carries the same weight as BL-2, not BL-1.

## Story

As the Storyteller,
I want every surface that asks "is this discipline in-clan?" to route through the one accessor that
reads the bloodlines collection,
so that adding a bloodline without a deploy produces the right cost **everywhere**, and so that the
DT form stops being a second, quietly divergent implementation of the same rule.

## Why this story exists

After BL-2 there are **two live sources of in-clan truth**:

| Surface | Reads | Miss path |
|---|---|---|
| Sheet, editor, audit, export | `clanDiscList` → the collection | empty + banner + editor lock |
| **DT form** (`downtime-form.js:4109-4115`) | `BLOODLINE_DISCS` → the constant | **falls through to the clan list** |

The DT form's private `isClanDisc` is drift pattern #15 verbatim, still live, and it feeds
`getXpCost` at `:4130` — so it decides what a **player** is charged when they buy a discipline.

Today the two agree, because the collection is seeded *from* the constants. They stop agreeing the
moment BL-4 lets an ST add a bloodline that exists only in Mongo — the sheet would cost it correctly
and the DT form would fall back to the clan list, with no banner, no lock, and no error. That is the
original defect reintroduced on the surface players actually touch.

BL-2 fixed the accessor. This fixes the rule.

## Acceptance Criteria

1. **Exactly one implementation of in-clan.** After this story, `grep -rn "BLOODLINE_DISCS" public/js`
   returns hits only in `data/constants.js` (the definition), `data/bloodlines-cache.js` and
   `data/accessors.js` (comments referring to the migration), and `dev-fixtures.js` (BL-3b's problem).
   **No live code path may compute in-clan from the constant.**
2. **The DT form routes through the accessor.** `downtime-form.js` already imports from
   `data/accessors.js` at `:22`, so this is an import addition, not a new dependency:
   - `isClanDisc(discName)` (`:4109-4115`) becomes `isInClanDisc(currentChar, discName)`;
   - `clanDiscs` (`:4174`) becomes `clanDiscList(c)`;
   - `bloodlineDiscs` (`:4176`) becomes `c.bloodline ? clanDiscList(c) : []`.
   Delete the private function rather than leaving it unused.
3. **The DT form inherits the miss ruling, and it must be visible to a player.** An unresolved
   bloodline there means every discipline costs 4 XP per dot. The banner is already mounted in
   `app.js` (BL-2), and `downtime-form.js` free-rides on `app.js`'s boot priming (documented at
   `downtime-form.js:36`) — **verify both, do not assume.** A player must not be quoted a price
   computed from an unresolved bloodline without the banner being on screen.
4. **The two bloodline dropdowns read the cache.**
   - `editor/identity.js:19` — `APPROVED_BLOODLINES` becomes `approvedBloodlines()`;
   - `editor/sheet.js:2703` — `BLOODLINE_CLANS[c.clan]` becomes `bloodlinesByClan()[c.clan] || []`.
   Both functions already exist in `data/bloodlines-cache.js`; BL-2 built them for exactly this and
   they currently have zero callers.
5. **A bloodline that exists only in Mongo becomes selectable.** This is the epic's actual promise
   and the first point at which it is observable. A test must prove that a name present in the cache
   but absent from the constants appears in both dropdowns.
6. **The clan-change block at `edit.js:102-104`.** It reads `BLOODLINE_CLANS[val]` to clear a
   bloodline that does not belong to the new clan. **BL-5 will delete this whole branch** — Angelus
   ruled 2026-08-10 that clan is write-once, so it is unreachable. Rewire the one line to the cache
   anyway (`bloodlinesByClan()[val] || []`) rather than leaving the last constant reader alive: BL-3b
   is blocked while any live path reads `BLOODLINE_CLANS`, and BL-3b must not also have to wait on
   BL-5. One line of eventually-deleted code is the cheaper trade.
7. **`wizard.js:118` is excluded.** Zero importers, verified again 2026-08-10. Do not wire it, do not
   migrate it. It belongs to **#1095**.
8. **Behaviour is identical while the collection matches the constants.** Every DT form pool, every
   XP cost and both dropdowns must be unchanged for all 23 seeded bloodlines. A test proves this over
   all 23, not a sample.
9. **Tests** (targeted vitest; the full suite is NOT a gate — see Dev Notes):
   - the DT form's cost path: in-clan and out-of-clan for a resolved bloodline, and **4 XP per dot
     for every discipline when the bloodline is unresolved** (the case the old fallback got wrong);
   - the Malkovians two-way case again, this time through the DT form, since that is the surface
     that was still wrong;
   - both dropdowns render from the cache, including AC 5's Mongo-only name;
   - AC 8 equivalence over all 23;
   - **`server/tests/dt-form-territory-fresh-fetch.test.js:77-78` mocks `CLAN_DISCS` and
     `BLOODLINE_DISCS` on the constants module.** Changing what `downtime-form.js` imports will break
     that mock. Update it; do not delete the assertions it guards.

## What this story is NOT

- **No deletion of the constants**, and no change to `seed-bloodlines.js` — **BL-3b**, after BL-4.
  The constants stay as the seed's input.
- **No change to `dev-fixtures.js`** — it derives its `/api/bloodlines` fixture from the constants,
  which is correct while they exist. **BL-3b**.
- **No admin CRUD, no write endpoints** — **BL-4**.
- **No write-once enforcement, no editor lock on clan or bloodline** — **BL-5**. AC 6 rewires one
  line inside a block BL-5 will delete; it does not implement BL-5's rule.
- **No `wizard.js` work** — #1095.
- **No new banner or lock UI.** BL-2 built both; this story makes a third surface feed them.

## Tasks / Subtasks

- [ ] Task 1 (AC 2, 3): rewire `downtime-form.js`'s three sites; delete the private `isClanDisc`;
      verify the boot priming and banner actually reach the DT form.
- [ ] Task 2 (AC 4, 5): rewire both dropdowns to `approvedBloodlines()` / `bloodlinesByClan()`.
- [ ] Task 3 (AC 6): rewire `edit.js:103`.
- [ ] Task 4 (AC 1): grep-prove there is no live constant reader left, as a test.
- [ ] Task 5 (AC 8, 9): tests, including the DT form cost matrix and the all-23 equivalence.
- [ ] Task 6 (AC 9): repair `dt-form-territory-fresh-fetch.test.js`'s mock.
- [ ] Task 7: verify in-browser — a DT form discipline purchase for a resolved character, and for an
      unresolved one. **BL-2's browser gap is still open; this is the story that should close it.**
- [ ] Task 8: PR to `main` (Angelus's word). *(GATED.)*

## Dev Notes

### Verified reader list (grep, 2026-08-10, post-BL-2)

| File:line | Reads | This story |
|---|---|---|
| `editor/identity.js:19` | `APPROVED_BLOODLINES` | rewire (AC 4) |
| `editor/sheet.js:2703` | `BLOODLINE_CLANS` | rewire (AC 4) |
| `editor/edit.js:103` | `BLOODLINE_CLANS` | rewire (AC 6) |
| `tabs/downtime-form.js:4112/4174/4176` | `BLOODLINE_DISCS` | rewire (AC 2) |
| `tabs/wizard.js:118` | `BLOODLINE_CLANS` | **excluded**, dead |
| `data/dev-fixtures.js:1` | both | **BL-3b** |
| `server/scripts/seed-bloodlines.js:57` | both | **BL-3b** — this is why the split exists |

`editor/sheet.js:6` and `editor/edit.js:7` will still import the constants for other purposes
(`CLAN_DISCS`, `CLAN_BANES`); only the bloodline names come out.

### The cache API BL-2 already built for this

`public/js/data/bloodlines-cache.js` exports `bloodlinesByClan()` and `approvedBloodlines()`, both
derived from the one collection and both currently unused — BL-2's AC 2 required them precisely so
this story is a rewiring job and not a redesign. Neither filters on availability: there is no
soft-retire concept, ruled 2026-08-10.

### Two traps from BL-2's review

- **`sheet.js:2703` carries an inline `style="margin-top:3px;font-size:10px"`** on the bloodline
  select, which violates the project's normalised-CSS rule. You are editing that line anyway; fix it
  with a class while you are there.
- **A locked discipline row shows two different dot totals** (`sheet.js:653` pips from stored `dots`
  vs `:685` recomputed at 4/dot). Registered in `deferred-work.md`, not this story's job, but you
  will see it while testing an unresolved character and it is not a new bug.

### Environment and hard rules

- **The full test suite is not a gate** — six known permanent reds (#1116, #1115, #1125, #1117, plus
  `issue-837-xp-totals-deprecation` and `n8-mandragora-prereq`, both parse errors). Run only your own
  specs plus any you touch. Never pipe through `tail`.
- `server/tests/repo-no-nul-bytes.test.js` exists as of BL-2 and should stay green.
- **Normalised CSS is mandatory.** Tokens only, reuse before invent, grouped selectors for shared
  chrome.
- British English, no em-dashes in any string the app prints.
- Branch from `main`; PR to `main`; no push or merge without Angelus's explicit word.

### References

- Issue **#1008**; `specs/stories/sprint-status.yaml` under `epic-bl`
- **BL-2's story and Senior Developer Review** — the miss ruling, and the review that found the DT
  form divergence
- `D:\Terra Mortis\data-map.md` — drift patterns **#15** (the ruling) and **#16**, plus the
  `bloodlines`, `characters.bloodline` and `characters.clan` entries
- `specs/stories/deferred-work.md` — BL-2's six deferrals; three of them are this story's

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
