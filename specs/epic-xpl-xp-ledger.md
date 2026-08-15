# Epic: XPL — XP Ledger

**Goal:** Give every character a dated, auditable record of XP-affecting writes to their sheet.
Today `xpEarned()`/`xpSpent()` are fully derived from cumulative totals (per the project's own
"derived stats never stored" convention) — correct for a live total, but it means there is no
record anywhere of WHEN a dot was bought, by which route (a downtime-driven purchase vs an ad-hoc
ST correction), or on whose authority. The ledger adds that history without changing how the
totals themselves are computed or displayed.

**Why:** A player's downtime-purchased merit dot (Majesty 4) silently failed to write during
downtime processing this cycle; the player noticed the discrepancy and DM'd the ST directly, who
manually patched the sheet with zero trace anywhere of the correction — not what was changed, when,
or why. Angelus (ST/project lead) named the underlying gap directly: no register of XP expenditure
exists, only a live total. Scoped and designed via `bmad-party-mode` (Dana, Winston, John, Sally,
Quinn), then verified against real code and live data via `bmad-data-lock` before any story was
written — see `D:\Terra Mortis\data-map.md`'s TM Suite section, entries dated 2026-08-15 under
`characters.attributes[X].xp` (compound), the `characters` PUT `/api/characters/:id` route, and
`downtime_submission.project_N_xp_rows`.

**Source:** 2026-08-15 `bmad-party-mode` roundtable (the Majesty-4 incident as trigger), followed by
a `bmad-data-lock` pass the same day that corrected two of the panel's working assumptions (see
Sequencing notes below) before Story 1 was written.

---

## Stories

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| xpl.1 | XP ledger — write hook + ST read view | done | Append-only `xp_ledger` collection, single write hook inside the existing `PUT /api/characters/:id` (diff pre-fetch vs incoming `.xp` fields, one row per non-zero delta), plus a read-only history view and an optional reason input on the admin sheet editor. SPEND events only — `xpEarned()` stays fully derived, out of scope here. Code-reviewed 2026-08-15 (internal 3-layer, Codex CLI unavailable) — 2 real High findings caught and fixed (merit-name-collision fabricating/dropping rows, live-data-reproduced; removed traits/merits invisible to the ledger), 136/136 final regression. Committed locally on `ms/xpl-1-xp-ledger-write-hook`; not pushed/merged/deployed. |
| xpl.2 | Historic reconciliation (DT1-DT6 backfill) | ready-for-dev | Investigated 2026-08-15 with real, read-only live queries against `tm_suite` (not assumed) — see `specs/stories/xpl-2-historic-reconciliation.md` for the full findings. Scope narrowed from the epic's original framing: DT1 has ZERO structured XP data (the mechanism didn't exist that cycle) and is excluded entirely; there is no approval signal anywhere in the real data (`approval_status` is schema-declared but null on all 104 real xp-bearing submissions); only 34 real non-zero purchase requests exist across DT2-DT6. Angelus's ruling on the resulting policy gap: **confirmed-only** — only backfill a ledger row when the character's current live state demonstrably matches the historic request; everything else surfaces in a report for manual ST review, nothing written blind. |

## What this epic is NOT

- NOT a change to how `xpEarned()`/`xpSpent()`/`xpLeft()` are computed or displayed — those stay
  exactly as derived today (`public/js/editor/xp.js`). The ledger is a parallel audit trail, not a
  new source of truth for the live total.
- NOT a player-facing surface. A future "XP tab" players could see their own history through, and
  any link from the downtime form's XP-request section directly into a ledger entry, were both
  named by Angelus as later, uncommitted ideas — not scoped into either story here.
- NOT a change to the four client-side editor mutators (`shEditAttrPt`/`shEditSkillPt`/
  `shEditDiscPt`/`shEditMeritPt` in `public/js/editor/edit.js`) or to the downtime form's
  `project_N_xp_rows`/`responses.xp_spend` fields. Both stay exactly as they are — the ledger reads
  the RESULT of a save, at the one place saves actually land server-side, not the client-side edits
  that lead up to it.

---

## Sequencing notes

- xpl.1 first, always — xpl.2 depends on the ledger schema/collection existing before it can backfill
  into it.
- **Two working assumptions from the original party-mode design were corrected by the follow-up
  data-lock, before xpl.1 was written** (full detail in `data-map.md`):
  1. The panel assumed two distinct XP write paths (automated downtime-processing + manual ST
     correction). There is only one: the downtime form's XP section is a request a human ST reads
     and re-enters by hand (`schema` comment: "note only, spending done in Admin section") — a
     downtime-driven purchase and an ad-hoc correction like Majesty-4 are the same code path today.
  2. The panel assumed DT5 was unreconcilable because a `xp_spend` field had been wiped. Live-verified
     that DT5's `downtime_submissions` documents are intact with real purchase data — what was wiped
     was a downstream character-side figure, not the submission source.
- **A THIRD assumption, this epic's own original xpl.2 placeholder text, was corrected by xpl.2's own
  data-lock (2026-08-15, same day):** "walk `project_N_xp_rows` per cycle and mint ledger rows for
  each real historic purchase" assumed uniform structured data across all 6 cycles and an implicit
  ability to know whether a request was actually applied. Neither holds — DT1 has none of this data
  structurally, and no cycle has an approval signal. See xpl.2's own story file for the full
  investigation and the resulting confirmed-only scope.
- xpl.1's read view is intentionally minimal (a plain history list on the existing admin XP
  breakdown, plus the reason input added during xpl.1's own code review) — Sally's fuller
  "specialised XP tab" concept is parked, not built, until Angelus commits to that later phase.
