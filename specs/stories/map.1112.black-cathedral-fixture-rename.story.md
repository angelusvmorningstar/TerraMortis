---
issue: 1112
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1112
branch: piatra/issue-1112-black-cathedral-fixture
worktree: /private/tmp/tm-ptah/cathedral-1112
base: origin/dev (b44afc1a)
---

# Story MAP-1112: Black Cathedral rename in the map fixture

## Status

Ready for Dev

## Story

**As a** Storyteller whose live map, Discord clubhouse and covenant merit data all now say *Black Cathedral*,
**I want** the canonical map fixture in this repo to say the same,
**so that** a future re-seed of `st_map_locations` from the fixture cannot reintroduce the stale HQ placeholder names.

## Issue premise correction — read this first

**#1112 as filed does not describe this repository.** Verified against `origin/dev` @ `b44afc1a`:

- The string **`Black Abbey` does not exist** anywhere in the repo, on any branch, in any commit. The fixture's Lancea site is named **`Old Lance HQ`** (`type: hq`, `real_place: "St Mary's Cathedral precinct"`).
- **`server/scripts/apply-covenant-clan-sites.mjs` does not exist** in this repo or its history. `TM Cockpit/` and `TM Herald/` are not on this filesystem. AC2 of the issue is a **different repository's** task and is out of scope here.
- The rename work already exists as commit **`d4c9c69a`** ("Map: sync fixture to canonical names"), stranded on the unmerged branch `origin/ms/issue-939-personal-story-optional`.

So the real change is `Old Lance HQ` → `Black Cathedral`, not `Black Abbey` → `Black Cathedral`.

## Why NOT to cherry-pick d4c9c69a

`_locations-local.json` is a **single-line 876 KB JSON blob**. Its whole diff is one line, so any blob-level cherry-pick is an all-or-nothing overwrite with no meaningful conflict resolution.

`d4c9c69a^` is **not** an ancestor of `dev`. Semantic three-way diff of the fixture:

| | entries |
|---|---|
| `dev` @ b44afc1a | **74** |
| `d4c9c69a` (ms branch) | **136** |

The ms lineage (`7eecf424`, `ec340c80`, `d4c9c69a` — none on dev) *added* 62 supernatural-faction locations (loci, cenotes, leylines, wyrmnests, courts) and refined zone geometry on top of the shared base. **Cherry-picking `d4c9c69a`'s blob onto dev would drag all 62 in as a side effect of a rename story** — a silent, unreviewed scope explosion inside a one-name change.

Apply the rename **semantically** instead, using the script `d4c9c69a` shipped for exactly this purpose.

## Acceptance Criteria

1. `server/scripts/sync-fixture-renames.mjs` is on this branch (recovered verbatim from `d4c9c69a`; it is not on dev).
2. `_locations-local.json`'s hq entry reads **`Black Cathedral`** (was `Old Lance HQ`).
3. The other two HQs are renamed in the same pass: `Old Invictus HQ` → **`Swift Manor`**, `Old Crone HQ` → **`Crone Temple`**. Peter confirmed 2026-08-06 that `Crone Temple` is canonical for the map site, distinct from the `Mother's Fane` merit name — this **overrides** the issue's AC4, which assumed otherwise.
4. The two owner-disambiguated haven renames apply: Reed Justice's `The Penthouse` → `The Underground`, Wan Yelong's `The Loft` → `The Belfry`. Eve Lockridge's `The Penthouse` and Cazz's `The Loft` are **untouched**.
5. **Entry count is still 74** and no `centroid`, `polygon`, `real_place`, `residents` or reveal data changes. Renames only.
6. A second `node scripts/sync-fixture-renames.mjs` dry run reports `Matched 0 rename(s)` — idempotent, and a re-run cannot reintroduce an old name.
7. The 62 ms-branch-only locations are **NOT** pulled in.

## Tasks / Subtasks

- [ ] Recover the script (AC: 1)
  - [ ] `git show d4c9c69a:server/scripts/sync-fixture-renames.mjs > server/scripts/sync-fixture-renames.mjs`
  - [ ] Do not modify it. The rename tables inside it are already correct for dev's fixture (verified by SM dry run, below).
- [ ] Apply (AC: 2, 3, 4)
  - [ ] `cd server && node scripts/sync-fixture-renames.mjs` (dry run) — must match the expected output below **exactly**.
  - [ ] `node scripts/sync-fixture-renames.mjs --write`
- [ ] Verify (AC: 5, 6, 7)
  - [ ] Entry count still 74; diff the parsed JSON against `origin/dev`'s and confirm the only field deltas are the 5 `name` values.
  - [ ] Re-run dry: `Matched 0 rename(s)`.
  - [ ] `git diff --stat` shows exactly two files: the fixture and the new script.

## Dev Notes

### SM dry run against dev's fixture — expected output, verbatim

```
Matched 5 rename(s):
  HQ: "Old Lance HQ" -> "Black Cathedral"
  HQ: "Old Invictus HQ" -> "Swift Manor"
  HQ: "Old Crone HQ" -> "Crone Temple"
  Haven: "The Penthouse" (Reed Justice) -> "The Underground"
  Haven: "The Loft" (Wan Yelong) -> "The Belfry"
  (still named "The Penthouse": 1 — expect the OTHER owner's, e.g. Eve Lockridge)
  (still named "The Loft": 1 — expect the OTHER owner's, e.g. Cazz)
```

Anything other than 5 matches, or a survivor count other than 1/1, means dev's fixture is not the state I measured — **stop and report**, do not `--write`.

### Format preservation
The script writes `JSON.stringify(data)` — compact, single-line, matching the existing file. Do not pretty-print; a reformat turns a 5-word change into an unreviewable 876 KB diff.

### Out of scope
- Live `st_map_locations` (already renamed; do **not** write to Mongo — this story is repo-only).
- The Discord channel (already renamed via TM Herald).
- The merit data (already seeded).
- `apply-covenant-clan-sites.mjs` — different repo, see the premise correction.
- The 62 missing locations and the other two stranded ms commits — separate finding, being filed as its own issue.

## Dev Agent Record

_(Ptah fills this in)_

## QA Results

_(Ma'at fills this in)_
