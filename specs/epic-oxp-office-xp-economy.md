# Epic: OXP — Office XP Economy

**Goal:** Implement the full office XP/purchase economy specified in
`content/rules/office-powers.md` (umbrella root): derived XP accrual per office **seat** since
creation, a two-category purchase model (persistent merits vs handover-reset manoeuvres bought as
a graduated merit in rank order), purchase markers on the Office tab, a new "Office Merits" sheet
section for the current holder, and the Administrator's missing content.

**Why:** Fully ruled and specified 2026-08-11 in `content/rules/office-powers.md`. Nothing in the
codebase implements any of it yet — noted explicitly as out-of-scope when issue-1141 shipped
(`issue-1141-office-data-sync` entry, this file). Restated and confirmed app-side in the
2026-08-12 scoping session.

**Source:** `content/rules/office-powers.md` — **authoritative, cite this file directly, do not
re-derive the model from chat/memory.** 2026-08-12 party-mode scoping session for the app-side
confirmation that spend routes through Epic OAQ.

---

## The ruled model (do not re-derive — cite `office-powers.md` §"Office XP")

- **1 XP/month per office seat**, accruing from the seat's creation date, regardless of who holds
  it or vacancy. A vacant seat still accrues.
- The **office/seat owns the pool, never the holder** — unspent XP carries over on handover.
- Two purchase categories:
  - **Merits** — persist across handover (institutional infrastructure).
  - **Manoeuvres** — bought as a graduated merit in **fixed rank order** (dot 1 = rank 1, no
    skipping), **reset to zero on handover**, spent XP **lost, not refunded or banked**.
- **Earned XP is derived** (months since creation), **never stored** — matches the app's standing
  rule (`specs/project-context.md`: derived stats never stored). Only the **spend ledger** is
  stored.
- **A role can have more than one concurrently held seat** — the two Socialite seats (appointed
  Harpy, popular People's Harpy) are the confirmed live case. The data model must key on **seat**,
  not `court_category` alone.
- **All spend requires ST approval** (Epic OAQ) — no unmoderated spend path.

## Known creation dates (seed data, already ruled — `office-powers.md` §"Office creation dates")

| Office/Seat | Created | Game |
|---|---|---|
| The Ruler | 2026-02-21 | Game 1 |
| The Primogen | 2026-02-21 | Game 1 |
| The Enforcer | 2026-02-21 | Game 1 |
| The Socialite (Harpy, appointed) | 2026-02-21 | Game 1 |
| The Administrator (Seneschal) | 2026-06-20 | Game 5 |
| The Socialite (People's Harpy, popular) | 2026-07-18 | Game 6 |

Confirmed against `game_sessions.session_date` in MongoDB, keyed by `game_number`.

## Stories

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| oxp.1 | Data-lock: office/seat schema | done | Dana's pass — where creation dates live, how a seat is identified/keyed (must support 2 concurrent Socialite seats), how the persist/reset split is represented. Migrate `OFFICE_DATA` off a static JS module per this project's own convention (new reference data defaults to Mongo-backed, `CLAUDE.md`) — already flagged for whoever picks this up, per the issue-1141 story record. |
| oxp.2 | Derived office-XP calculation | done | Months-since-creation minus the spend ledger, never stored — mirrors the existing `xpGame()` pattern (`public/js/editor/xp.js`) rather than inventing a new one. |
| oxp.3 | Manoeuvre purchase — graduated merit, rank order | done | Bought one dot at a time in fixed rank order (`office-powers.md` §"Where the ranks come from" has the resolved rank tables for all four ranked offices). Resets to zero + spent XP lost on handover. |
| oxp.4 | Merit purchase — persists across handover | done | Institutional; survives a change of holder, unlike manoeuvres. |
| oxp.5 | Handover logic | done | On officeholder/seat change: merits stay with the office; manoeuvres reset to zero and their spent XP is destroyed (not refunded, not banked). |
| oxp.6 | Office tab — purchase markers | done | Full reference list always shown; unpurchased greyed/muted (reuse the existing hollow-dot pattern, `.pointed.hollow`). Distinguish "not enough pool XP" from "prerequisite/rank not reached" via a reason on tap/hover — don't collapse both to one visual state. |
| oxp.7 | Sheet — new "Office Merits" section | done | Parallel to the existing Domain Merits section pattern (`sheet.js:1122`, category-filtered `.sh-sec`); visible only to the character currently holding that seat. |
| oxp.8 | Administrator content authoring | backlog | **Not app code.** Five manoeuvres in the "Yes, Minister" style + a merit suite, written by Angelus/Symon (`office-powers.md` §"Remaining loose ends" — the Administrator seat is real and filled since Game 5, just has nothing written to spend its accruing pool on). Blocks nothing else in this epic; can proceed independently. |
| oxp.9 | Spend routes through Epic OAQ | done | All XP spend requires ST approval. A holder-submitted `office_purchase` pending-item type in the OAQ queue, mirroring gdx.12's precedent; purchase writes only on ST accept, budget-enforced. Externally Codex-reviewed (3 isolated passes), 6 findings patched incl. a real reproduced double-spend race. Committed `c9134abd`/`276c4fa1`, not pushed. |

**CORRECTED 2026-08-15**: this table said `backlog` for oxp.1-7; `sprint-status.yaml` on `main` shows
`done` for all seven, plus `oxp.11` (office-purchase-seat-keying, not in this table at all — added
later, not scoped here). oxp.1-5 and oxp.11 are merged and live; oxp.6/oxp.7 are dev/review-complete
on their own branches, held under this epic's own standing order (hold all remaining merges until it
ships), not actually unstarted.

**CORRECTED 2026-08-27**: oxp.9 done (see its own row above). Only oxp.8 (Administrator content
authoring, not app code, Angelus/Symon) and oxp.10 (`OFFICE_DATA` -> Mongo migration, split out of
oxp.1, not in this table — see `sprint-status.yaml`) remain genuine backlog.

**CORRECTED 2026-08-27, later same day**: oxp.10 dev-storied to `review` (see `sprint-status.yaml`).
`OFFICE_DATA`/`MERIT_DOT_CAPS` migrated to a new `office_content` MongoDB collection, mirroring
bloodlines' own precedent exactly — read-only in this repo (`GET /api/office_content` + a client cache
module), no write route or admin UI here; a future TM Admin story adds ST authoring. `public/js/tabs/
office-data.js` is deleted. Re-verifying the "3 import sites" premise at dev-story time (Task 0) found
it had UNDERCOUNTED even the corrected 6-dependents figure: 5 test files also imported or mocked the
static module directly and needed reworking. Only oxp.8 (Administrator content) remains genuine
backlog.

---

## Open rules questions (not app work — Angelus/Symon's call, raise when ready)

Five items remain unruled in `office-powers.md` §"Open questions": escalating-cost window (per
Court/game/never-resetting) for Freedom of Information and Show of Hands; Ear to the Ground's
unpriced information cost; the Ruler's "remove Social Manoeuvring" design note on Due
Diligence/Sovereignty Inviolate; how penetrating People Talk's Discipline-pool read is meant to
be; and Playing Favourites' interrupt timing. None of these block the XP-economy mechanic itself
(rank order and the purchase model are settled), but they do block finalising the Ruler/Primogen/
Socialite manoeuvre text with full confidence. **Angelus will raise these when ready — do not
prompt or gate on this.**

## Sequencing notes

- Depends on Epic OAQ (spend approval routing) for oxp.9 only — oxp.1 through oxp.8 can proceed
  independently.
- oxp.1 (data-lock) should run before oxp.2–oxp.7, since the seat-keying decision shapes all of
  them.
- oxp.8 (content authoring) has no code dependency and can happen any time.
