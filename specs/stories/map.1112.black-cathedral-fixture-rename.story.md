---
issue: 1112
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1112
branch: piatra/issue-1112-black-cathedral-fixture
worktree: /private/tmp/tm-ptah/cathedral-1112
base: origin/dev (b44afc1a)
---

# Story MAP-1112: Black Cathedral rename in the map fixture

## Status

Ready for Review

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

`_locations-local.json` is a **single line of 464,783 bytes holding 74 entries** (the 876 KB figure in an earlier draft was the *ms branch's* copy, not dev's — corrected by Ma'at). Its whole diff is one line, so any blob-level cherry-pick is an all-or-nothing overwrite with no meaningful conflict resolution.

`d4c9c69a^` is **not** an ancestor of `dev`. Semantic diff of `dev` @ `b44afc1a` (74 entries) against `d4c9c69a` (136 entries):

| dev entry fate under a blob cherry-pick | count |
|---|---|
| survives byte-identical | **41** |
| **silently modified** | **32** |
| **deleted outright** (`locus 'The Old River Red Gum'`) | **1** |
| ms-only entries that would arrive | **+62** |

Field churn across the modified 32: `werewolf_faction` x12, `tier` x11, `polygon` x4, `mage_order` x3, `address`/`lat`/`lon` x3, `centroid` x2, `geocode_query` x2, `residents`/`resident_names` x2, `boundary_locked`, `dots`.

**This is not "dev plus 62".** A blob cherry-pick would also rewrite zone geometry and faction tags on existing locations and drop one entirely — a silent, unreviewed scope explosion inside a one-name change. Do not reason about it as a pure addition.

> Reconciliation note: an SM count of 45/28/1 and Ma'at's 41/32/1 differ only in whether the 4 name-only renames are counted as modifications. Ma'at's framing is the correct one for blast radius (change relative to dev as it stands) and is what the table states. Both agree on the deletion and on the churn fields.

Apply the rename **semantically** instead, using the script `d4c9c69a` shipped for exactly this purpose.

## Acceptance Criteria

**AC0 is the gate. It subsumes AC2-AC5 and AC7.** The post-`--write` fixture must be **byte-for-byte**:

```
sha256   a34547c36ca8863d5e42aa476667da2a4d21336e941c5a78f89f2c41f82e05e7
bytes    464786      newlines 0      entries 74
```

This exact expectation is legitimate, not over-tight: a parse → serialise round trip on dev's fixture **with no renames reproduces dev byte-for-byte**, so the round trip contributes nothing of its own and every byte of the delta is attributable to the 5 renames. Any deviation is a fail. Structural field-by-field diffing is the tool for *explaining* a failure, not the primary check.

The digest above is a hash of **bytes on disk**, so it is recipe-free and safe to compare across machines. Re-deriving it yourself needs the right serialiser settings:

| runtime | reproduces dev byte-for-byte? |
|---|---|
| Node `JSON.stringify` | **yes**, no options needed |
| Python `json.dumps(doc, separators=(',',':'), ensure_ascii=False)` | **yes** |
| Python `json.dumps(doc, separators=(',',':'))` | **no** — 464,826 bytes |

The Python default fails only because `ensure_ascii=True` escapes non-ASCII. First divergence is at byte 225875, `René Meyer` against the raw UTF-8 é, in The Houseboat's `residents`. The file holds 11 non-ASCII characters in three distinct forms (`·`, `é`, `’`). **Floats are not implicated** — all 31,197 of them round-trip verbatim, zero exceptions. (An earlier draft of this note blamed float formatting. Wrong cause, right conclusion, and it would have sent the next person to the wrong knob; corrected by Ma'at and re-measured.)

Per-entry digests are a different matter and are **not** portable — they hash a re-serialisation, so they depend on `sort_keys` and separator choices. Compare individual entries by field value, never by digest.

1. `server/scripts/sync-fixture-renames.mjs` is on this branch (recovered verbatim from `d4c9c69a`; it is not on dev).
2. `_locations-local.json`'s hq entry reads **`Black Cathedral`** (was `Old Lance HQ`).
3. The other two HQs are renamed in the same pass: `Old Invictus HQ` → **`Swift Manor`**, `Old Crone HQ` → **`Crone Temple`**. Peter confirmed 2026-08-06 that `Crone Temple` is canonical for the map site, distinct from the `Mother's Fane` merit name — this **overrides** the issue's AC4, which assumed otherwise.
4. The two owner-disambiguated haven renames apply: Reed Justice's `The Penthouse` → `The Underground`, Wan Yelong's `The Loft` → `The Belfry`. Eve Lockridge's `The Penthouse` and Cazz's `The Loft` are **untouched**.
5. **Entry count is still 74** and no `centroid`, `polygon`, `real_place`, `residents` or reveal data changes. Renames only.
6. A second `node scripts/sync-fixture-renames.mjs` dry run reports `Matched 0 rename(s):` **and, in the same output, both survivor lines each reporting count 1** (Eve Lockridge, Cazz). The count-0 line alone is not sufficient — it also passes against an emptied or truncated fixture.
7. The 62 ms-branch-only locations are **NOT** pulled in, and none of dev's 74 entries is modified or deleted (see the blast-radius table).

### The Belfry discriminator — the one check that proves which path was taken

Entry count 74 can hold while ms content has been carried in, so it is not sufficient on its own. Of the 5 renames, 4 produce byte-identical results on either path. **Wan Yelong's haven is the exception: in the ms blob it is not a rename but a relocation**, which the script cannot produce (its only write is `l.name = ...`).

| | script-applied (**correct**) | copied from ms blob (**fail**) |
|---|---|---|
| `address` | `Mosman, Vista Street - the Art Gallery crypt` | `St Bede's Catholic Church, 43 Pyrmont Street, Pyrmont NSW 2009` |
| `lat` / `lon` | `-33.8251` / `151.2404` | `-33.8677697` / `151.1936963` |
| `geocode_query` key | **absent** | **present** (a key that exists nowhere in dev's fixture) |

Checked by field rather than by hash deliberately: a per-entry hash depends on the serialisation recipe and is not portable between rigs (SM and QA computed different sha1s for the same correct entry).

The `geocode_query` tell is confirmed against the **key inventory**, not just the diff: the key appears at zero occurrences across all 74 dev entries, so its presence cannot be explained away as a field that merely happens to be absent from the five renamed ones.

## Tasks / Subtasks

- [x] Recover the script (AC: 1)
  - [x] `git show d4c9c69a:server/scripts/sync-fixture-renames.mjs > server/scripts/sync-fixture-renames.mjs`
  - [x] Do not modify it. The rename tables inside it are already correct for dev's fixture (verified by SM dry run, below).
- [x] Apply (AC: 2, 3, 4)
  - [x] `cd server && node scripts/sync-fixture-renames.mjs` (dry run) — must match the expected output below **exactly**.
  - [x] `node scripts/sync-fixture-renames.mjs --write`
- [x] Verify (AC: 0, 5, 6, 7)
  - [x] **Self-test before reporting done** — `shasum -a 256 server/scripts/_locations-local.json` must equal `a34547c3…f82e05e7` (AC0). If it does, AC2-AC5 and AC7 are satisfied by construction and you are done verifying.
  - [x] If the hash differs: check the Belfry discriminator first (address must still read Mosman, no `geocode_query` key). A Pyrmont address means ms content was carried in, not a rename bug.
  - [x] Re-run dry: `Matched 0 rename(s):` **plus** both survivor lines at count 1.
  - [x] `git diff --stat` shows exactly two files: the fixture and the new script.

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
The script writes `JSON.stringify(data)` — compact, single-line, matching the existing file, so on the script path this cannot fail by construction. It can only break on a hand-edit path, and AC0's hash catches that. Do not pretty-print; a reformat turns a 5-word change into an unreviewable 464 KB diff.

### Closed at pre-read — do not spend gate time here
Ma'at confirmed each old name occurs exactly once in the blob (twice for the two shared haven names) and **never in a non-name field**. There are no `desc` / anchor / `tied_to` cross-references to chase, so there is no dangling-reference risk.

### Known hole this story deliberately does NOT close
The ms branch has Wan Yelong's haven relocated to St Bede's, Pyrmont, which is likely the live wiki map's state. This story makes the fixture authoritative for the **name** and leaves the **address** saying Mosman. The story's own rationale — a re-seed must not reintroduce a stale value — applies to the address too, so that one entry stays exposed after this lands. Scoped out on purpose (AC0's hash encodes Mosman); filed separately for Peter's ruling on whether the relocation is real.

### Out of scope
- Live `st_map_locations` (already renamed; do **not** write to Mongo — this story is repo-only).
- The Discord channel (already renamed via TM Herald).
- The merit data (already seeded).
- `apply-covenant-clan-sites.mjs` — different repo, see the premise correction.
- The 62 missing locations and the other two stranded ms commits — separate finding, being filed as its own issue.

## Dev Agent Record

### Agent Model Used

Ptah (DEV) — claude-opus-5

### AC0 gate — PASSED

```
shasum -a 256 server/scripts/_locations-local.json
a34547c36ca8863d5e42aa476667da2a4d21336e941c5a78f89f2c41f82e05e7   <- matches expectation exactly
bytes 464786      newlines 0      entries 74
```

Pre-state confirmed before touching anything: 464,783 bytes, 74 entries, sha256 `a1f392b4…a726c56b`. Post-write is +3 bytes, consistent with the five renames.

Per AC0, that digest subsumes AC2-AC5 and AC7. I ran the independent field checks anyway rather than resting on a single method — a hash and a field read are correlated only through the file itself, and the discriminator is the check that names *which path* was taken.

### Dry run — verbatim match to the SM expectation

Output was identical to the story's expected block: 5 matches (Black Cathedral / Swift Manor / Crone Temple / The Underground / The Belfry) with both survivor lines at count 1, naming the correct other owners (Eve Lockridge, Cazz). Since it matched, `--write` was authorised; no deviation, so no stop-and-report.

### The Belfry discriminator — script path confirmed, by field

| check | value | verdict |
|---|---|---|
| `address` | `Mosman, Vista Street - the Art Gallery crypt` | script path (ms would read Pyrmont) |
| `lat` / `lon` | `-33.8251` / `151.2404` | script path |
| `geocode_query` on the entry | absent | script path |
| `geocode_query` across all 74 entries | **0 occurrences** | key inventory confirms absence is meaningful, not incidental |

No ms content was carried in.

### AC6 idempotence — both halves in one output

```
Matched 0 rename(s):
  (still named "The Penthouse": 1 — expect the OTHER owner's, e.g. Eve Lockridge)
  (still named "The Loft": 1 — expect the OTHER owner's, e.g. Cazz)
```

Count-0 **and** both survivor lines at 1 in the same run, so the emptied/truncated-fixture false pass is excluded.

### Content spot-check (74 entries)

All three old HQ names at 0 occurrences; all five new names at exactly 1; the two shared haven names survive once each, owned by Eve Lockridge and Cazz respectively.

### Notes

- The script was recovered verbatim via `git show d4c9c69a:server/scripts/sync-fixture-renames.mjs` and **not modified**. I read it before running: its only write is `l.name = …` and its only serialisation is `JSON.stringify(data)` (compact), so geometry, reveal data and formatting cannot change on this path by construction.
- `d4c9c69a` was **not** cherry-picked. No blob-level operation was performed on the fixture.
- Nothing was written to MongoDB. Repo-only, as scoped.
- Staged file-by-file; the untracked `markdown` symlink is **not** in the commit (verified).
- Deliberately left open, per the story: Wan Yelong's address still reads Mosman.

### File List

- `server/scripts/sync-fixture-renames.mjs` — **added**, recovered verbatim from `d4c9c69a`
- `server/scripts/_locations-local.json` — modified, 5 name renames only (1 line changed, compact single-line format preserved)

### Change Log

| Date | Change |
|---|---|
| 2026-08-06 | Script recovered from `d4c9c69a`; dry run matched the SM expectation verbatim; `--write` applied; AC0 hash, Belfry discriminator and idempotence all pass |

## QA Results

_(Ma'at fills this in)_
