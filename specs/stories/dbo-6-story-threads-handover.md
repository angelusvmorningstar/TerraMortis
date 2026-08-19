# Story DBO.6: `story_threads` handover to TM Wiki (joint with Wiki 31-3)

Status: done

## Story

As the ecosystem's data owner,
I want `tm_suite.story_threads` (44 populated narrative threads) reshaped and moved to
`tm_wiki.story_threads` and dropped from `tm_suite` once the cutover is verified,
So that `tm_suite` stops holding pure story-bible material with no mechanical function at the table.

---

## Context

44 populated narrative threads, authored 2026-06-21, keyed on `slug`, carrying
`truth`/`events`/`knowledge`/`participants`. **No route, no mount, no client code in this repo** —
only local ST authoring scripts. No mechanical function at the table.

The destination, `tm_wiki.story_threads`, is a **different, currently-empty** collection built by a
2026-07-25 ruling that never knew these 44 `tm_suite` documents existed — 31-3 is the reshape that
reconciles the two. `thread_id` is kept alive (a fresh one minted per migrated document) rather than
starting the Wiki side from a blank slate, per the shared `../../data-map.md`.

**Note carried over from the epic doc, not yet resolved:** live data carries `status: 'seeded'` on 2
of the 44 documents — a value none of the authoring scripts declare. Flag, don't silently drop, when
the reshape runs.

### Re-verified today, 2026-08-18 (this pass)

- **This repo's own reader/writer side is confirmed clean**: `git grep` across all tracked `.js`/
  `.mjs` files found zero references to `story_threads` anywhere in live route/service code —
  matches the epic doc's "no route, no mount, no client code" claim exactly.
- **The five named ST authoring scripts** (`_threads-batch3-and-settles.js`,
  `_threads-rebuild-timelines.js`, `_dt234-extend.js`, `_dt3-canon-apply.js`, `_fix-carver-fact.js`)
  **exist locally but are untracked** — not committed to git, same as the large body of local scratch
  scripts (`_acad-*`, `_hb-*`, `_ns-*`, etc.) already noted elsewhere this session as pre-existing
  clutter, not code this repo owns or ships. Consistent with the epic doc's own framing of them as
  one-off authoring tools, not production code.
- **The drop script exists and is real**: commit `745a2c2f` ("feat(31-3): Suite-side drop script for
  TM Wiki's story_threads migration"), on branch `ms/31-3-suite-story-threads-drop-script`, **local
  only — not pushed to `origin`**. `server/scripts/_drop-31-3-story-threads.mjs` (196 lines per its
  own commit message) does not exist in the current working tree — it only exists on that unmerged,
  unpushed branch.
- **Live production cutover status not re-checked this pass** — same caveat as DBO-5: would need a
  live `tm_wiki` connection this session did not make. Treat the 2026-08-15 data-map finding (the
  script's own dry-run against live production correctly REFUSED, because `tm_wiki.story_threads` is
  not cut over yet) as the most recent known-good answer, not re-confirmed today.

### Out of scope

- Running `--apply`/`--write` against production. Same standing convention as every drop/trim script
  in this epic.
- Pushing or merging the drop-script branch. It is not even pushed to `origin` yet, let alone merged
  — a lower-stakes starting point than DBO-5's branch, but still not done in this pass without an
  explicit decision to do so.
- Resolving the 2 `status: 'seeded'` documents' handling. Flagged, not decided — needs Angelus's
  call on whether that value should migrate, get dropped, or block the reshape until understood.

---

## Acceptance Criteria

**Given** the TM Suite codebase
**Then** no route, service, or client code references `story_threads`. *(Verified 2026-08-18 — met.)*

**Given** the Wiki has verified a real end-to-end read of the reshaped `story_threads` data
**Then** the Suite-side drop script (`server/scripts/_drop-31-3-story-threads.mjs`, on branch
`ms/31-3-suite-story-threads-drop-script`) is run with `--apply`/`--write` against production by
Angelus, and `tm_suite.story_threads` is confirmed empty/absent afterward. *(Met — 2026-08-19.
`--write` run for real against production: the script's own live re-verify immediately before
dropping reported story_threads 44/44, CLEAN, by slug; the collection then dropped. Independently
re-confirmed via a direct `listCollections` query against `tm_suite` afterward — the collection
does not exist among the remaining 43. Pre-drop backup:
`server/scripts/_backups/dbo-5-6-predrop-story_threads-2026-08-19T08-16-04-152Z.json`,
parse-verified, 44 docs.)*

**Given** the 2 documents carrying `status: 'seeded'`
**Then** their handling is explicitly decided (migrate as-is, drop, or hold) rather than silently
carried through or silently discarded. *(Decided 2026-08-19 — Angelus: migrate as-is. Matches what
already happened in practice: the Wiki-side `--write` copied all 44 source documents verbatim,
including both `seeded` ones, and the live re-verify above confirms all 44 present and matching
in `tm_wiki`. No further action needed on this AC.)*

---

## Dev Notes

- Drop script commit: `745a2c2f`, branch `ms/31-3-suite-story-threads-drop-script`, local only, not
  pushed. Its own commit message records an internal code review (2026-08-14, TM Wiki session) that
  patched a `valuesEqual` Date-comparison bug and added a duplicate-slug guard, keeping it in sync
  with its TM Wiki twin `migrate-31-3-story-threads.mjs`; built correctly from the start against both
  defects DBO-5's own sibling script's external review found (count/id-only re-verify, CWD-relative
  `.env` load).
- **Branch-hygiene note, carried from the sprint-status comment**: the TM Wiki 31-3 row cites Suite
  commit `07460b44`, which is now unreachable (no branch contains it) — `745a2c2f` is the live one.
  Do not chase the wrong commit if picking this up later.
- Paired Wiki story: `TM Wiki/specs/stories/31-3-story-threads-migration.md` — done, internally code-
  reviewed (3 parallel subagents; external Codex was the first choice but hit a usage lockout not
  resettable until 2026-08-20), per the Wiki's own `sprint-status.yaml` as last known 2026-08-15.
  Not re-checked this pass (TM Wiki repo absent from this session's environment).
- Full shared context: `../../data-map.md`, the `story_threads` (tm_suite) and `story_threads`
  (tm_wiki) entries. Note the data-map's own warning: **there is a SECOND, unrelated `story_threads`
  collection in `tm_wiki`** (0 docs at time of writing, different schema) — do not confuse the two
  when verifying the cutover.

---

## Definition of Done

- This repo has zero readers/writers for `story_threads`. **Met.**
- The `status: 'seeded'` handling is explicitly decided. **Met (2026-08-19) — migrate as-is,
  Angelus's ruling.**
- Wiki confirms a real end-to-end read of the reshaped data. **Met (2026-08-19) — production
  cutover complete, independently re-verified live against `tm_wiki` directly.**
- Production drop run by Angelus, `tm_suite.story_threads` confirmed empty/absent. **Met
  (2026-08-19) — `--write` run for real, collection dropped, independently re-confirmed absent.**

---

## Change Log

- 2026-08-18: Story file created (previously tracked only via `sprint-status.yaml` inline comments,
  per `/bmad-loop`'s own position check finding no story file existed). Re-verified this repo's own
  reader/writer state and the drop-script branch's real commit/push status directly. No code changed.
  Status stays `in-progress` — real, cross-repo work remains outstanding.
- 2026-08-19: Wiki-side production cutover confirmed complete and independently re-verified live
  against `tm_wiki` directly (44/44, exact match). Drop script's dry run re-run against production:
  clean. Pre-drop `tm_suite` backup taken and parse-verified. Angelus ruled on the `seeded`-status
  AC: migrate as-is (already the practical outcome of the Wiki-side write).
- 2026-08-19 (later, same day): Angelus ran `--write` for real. `story_threads` dropped from
  production `tm_suite`, independently re-confirmed absent via a direct `listCollections` query.
  All Definition-of-Done items met. Status: in-progress -> done.
