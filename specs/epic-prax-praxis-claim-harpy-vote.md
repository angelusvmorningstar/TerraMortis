# Epic: PRAX — Praxis Claim & People's Harpy Vote

**Goal:** Give the ST a live, DB-backed, WS-synced tally board for the two concurrent Praxis-night
contests — the Head of State claim (City-Status-weighted support) and the People's Harpy vote
(1 supporter = 1 vote) — using the same tap-to-assign claim-board idiom Territory Bids (story
TBID.1) proved out, but DB-first and multi-ST-safe from day one, because unlike Territory Bids
that was an explicit requirement going in, not a retrofit.

**Why:** Angelus asked for it directly, immediately after TBID.1 landed this session — Territory
Bids is the nearest UI precedent, which is why this epic was scoped right on its heels.

**Source:** An extended `bmad-party-mode` discussion this session (Dana/data-steward,
Winston/architect, Sally/UX, John/PM), multiple rounds, converging on the model below. No
standalone PRD/UX-spec/Architecture doc exists for this epic — the party-mode transcript is the
record; this file is its distillation, in this repo's own standalone-epic convention (see
`epic-oxp-office-xp-economy.md` for the shape being followed).

---

## The ruled model (do not re-derive — these are locked decisions, not proposals)

**Two independent tallies, one board, ST-only.**
- **Praxis claim (Head of State):** ST opens claims for attending players (multiple claimants
  allowed). Support is tap-assigned (not dragged — no drag pattern exists anywhere in this
  codebase and touch drag is a poor fit for a live, time-pressured tool). Tally per claimant = sum
  of each supporter's `calcEffectiveCityStatus()` (`public/js/data/city-status-calc.js`) plus the
  claimant's own — this function takes a second argument for regent-ambience bonus, so the tally
  needs a live territories lookup alongside the characters lookup.
- **People's Harpy vote:** identical claim/support model, 1 supporter = 1 vote (unweighted
  headcount). No self-vote special-casing — a claimant can be assigned to themselves or anyone
  else like any other attendee.
- Exclusive per tally (a chip sits on exactly one claimant within Praxis, one within Harpy,
  independently — no cross-tally syncing). Attendee pool sourced live from
  `game_sessions.attendance[].attended` for the session's linked chapter — confirmed reliable and
  live-current via Check-In, no separate roster needed.
- **Never player-visible.** ST-eyes-only, always, full real numbers — unlike Territory Bids' own
  `peekInfo()` fuzzing, explicitly NOT ported here. Permanent constraint, not a "not yet."

**DB-backed + WS-synced, deliberately not a `territory.js` clone.** Territory Bids is the nearest
UI precedent, not the architecture template. New `praxis_sessions` collection, `chapter_id`-linked
(mirrors `game_sessions.chapter_id`, CM-6's pattern). Persist only the linkage (claimant IDs,
supporter→claimant assignments, tally type) — never the live computed score, which is recomputed
every render. A frozen `final_tally` snapshot is stored, but only at resolve time, as a historical
fact. More than one ST could theoretically watch/operate this live at once (confirmed by Angelus,
even though day-to-day it's usually him alone), so WS sync is real infrastructure here, not
speculative.

**No session-live gate.** This tab is ST-role-gated only (`requireRole('st')`), same as the rest of
`admin.html` — confirmed by Angelus, no additional "is the game phase == 'game'" server check is
needed. Territory Bids' own similar gate gap stays untouched, a separate future concern, explicitly
out of scope here.

**Office exclusivity — the game rule this epic actually turns on.** Offices "created by" the Head
of State — **Enforcer, Administrator, and the Socialite seat labelled "City Harpy"** (renamed from
plain "Harpy" as part of this epic — see PRAX-4b) — are subordinate to it and get cleared, in full,
the instant a new Head of State is installed. **Not** just the winner's own prior seat: every
current holder of each, whoever they are. This is confirm-gated — one ST prompt covers the whole
transition, never automatic.

**Primogen, Territory Regent, and People's Harpy survive Praxis changes untouched** — they are
*not* created by the Head of State and are excluded from the mass-clear. But Head of State and
People's Harpy are mutually exclusive **for one individual**: a Praxis winner who currently holds
People's Harpy has that specific seat auto-vacated as part of the same confirmed action (not a
board-wide clear, just their own).

**A Praxis winner who currently holds Primogen keeps it.** Their `court_category` (the single field
every "current office" surface reads) flips to "Head of State" as their headline/displayed title —
the more senior title wins the headline — while the Primogen seat's `holder_id` stays theirs,
mechanically retained underneath. This is the root cause PRAX-0 exists to make safe (see below);
without it, this exact case is unbuildable.

---

## Stories

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| prax-0 | Court-office identity fix (multi-seat correctness) | backlog | Root-cause fix, sequenced first among the stories that need it. `characters.court_category` and `office_seats.holder_id` were "two independent facts that agree only by luck" (`office-seats.js`'s own comments), and the whole office system assumed a character holds at most ONE seat ever — a hard 409 conflict-check enforces it today. Praxis needs a character to legitimately hold two (Head of State + Primogen). Scope: (1) a named `OFFICE_EXCLUSIVITY` matrix next to `OFFICE_CATEGORY_ENUM` in `server/schemas/office_seat.schema.js`, replacing the blanket "any second seat is a conflict" check with real per-category rules — Head of State exclusive with {Socialite, Enforcer, Administrator}, NOT exclusive with {Primogen}; (2) a shared `deriveCourtCategory(characterId, allSeats)` in new `server/lib/court-category.js`, precedence Head of State > Primogen > Administrator > Socialite > Enforcer, replacing three local one-seat-knowledge writes inside `office-seats.js`'s `PUT /:seatId/holder` (the AC4 same-holder repair branch, the departing-holder clear, the incoming-holder set); (3) identical treatment for `court_title` — same field family, same collision, explicitly in scope, not deferred; (4) a real pre-existing rules bug fixed here: `calcEffectiveCityStatus`/`titleStatusBonusFor` only ever applied ONE office's Status bonus — now sums across every held office, fixed at both the client (`public/js/data/accessors.js`) and server (`server/routes/office-actions.js`) call sites, since it feeds the real Status Action XP budget; (5) `public/js/data/office-seat-resolve.js`'s `resolveHeldSeat` currently hard-filters by the single `court_category` so it can never resolve a second seat — takes the category as a parameter instead; two call sites fixed (`office-tab.js`'s `isOwnOffice`, `editor/sheet.js`'s `patchOfficeMerits`) so a dual-seat holder doesn't silently lose purchase controls or their Office Merits panel on their own second office. **No schema change** to either `character.schema.js` or `office_seat.schema.js` — `court_category`/`court_title` stay stored single fields, this is a "which write computes the value" fix, not a data-shape change (a `held_seats` array was explicitly rejected as denormalising data `office_seats.holder_id` already gives live; live-deriving on every read was rejected as touching every hot-path reader for no benefit, and re-treads Angelus's own 2026-08-13 ruling against deriving `court_category` from the seat on every read). **No migration/backfill** — live `tm_game` confirmed clean today (7 seats, 7 characters, zero drift), this closes a prospective risk, not an existing mess. Additive to `server/tests/oxp-5-handover-logic.test.js`'s pinned AC2/AC4 behaviour (the Primogen-vs-Enforcer conflict test and every other single-seat assertion must keep passing unchanged; new coverage exercises the Head-of-State+Primogen dual-hold case specifically). Two short code-comment documentation notes land here too: at `court_category` in `character.schema.js`, pointing at `deriveCourtCategory` and stating a Head-of-State-via-kept-Primogen character's headline and one held seat will legitimately, permanently disagree by design — intentional, not drift. Depends on nothing upstream; can be built first in wall-clock time or in parallel with prax-1 through prax-3. Blocks prax-4b only. |
| prax-1 | Schema & scaffold | backlog | New `praxis_sessions` collection (`chapter_id`-linked), field shape: two independent tally/support maps (`praxis`, `harpy`), each with `claims`, `support` (a plain supporter→claimant map, recomputed live, never stored), and a `resolved` block (`null` until resolve, then a frozen snapshot). Server routes: create/open a board for a chapter, read the current board, open/withdraw a claim, assign/reassign a supporter (withdrawing a claimant returns their supporters to the unassigned pool — never auto-reassigned to another claimant, that's an ST call). WS channel scaffold — a basic "this doc changed, refetch" signal so prax-2/prax-3 have live multi-tab sync from day one (the richer resolve-time frame is prax-4b's own addition). ST-role-gated only. Depends on nothing. Blocks prax-2, prax-3, prax-4a, prax-4b. |
| prax-2 | Praxis claim board UI | backlog | Tap-to-assign UI (Sally's design): "Open Praxis Claim" entry point; tapping an attendee chip opens a bottom-sheet picker listing live claimants; tapping a claimant assigns/reassigns — always two taps, no confirm modal, the picker closing is the confirmation. Assigned chips render inside the claimant's own card (the card IS the tally, same idiom as Territory Bids' backing list); unassigned attendees sit in a pool strip above. Reuses `components.css`'s `.char-chip`. Each claimant card shows a muted secondary-line badge surfacing Primogen/Harpy special-case status before resolve time: "Primogen · keeps seat" (neutral) or "People's Harpy · vacates on win" (mild amber, not destructive-red) — no line if neither applies. WS-synced live updates. Depends on prax-1. Runs in parallel with prax-3. |
| prax-3 | Harpy board + segmented control | backlog | Reuses prax-2's claim-board component with a second weighting function (1 supporter = 1 vote). Adds the segmented Praxis/Harpy control (one component, two weighting functions — proves the shared contract holds). A sticky summary row, always visible regardless of active tab, shows the current leader + tally for BOTH contests in one line each. Each pool chip gets a small dual-dot indicator ("has a Praxis assignment" / "has a Harpy assignment") independent of which tab is open. No self-vote auto-add for Harpy claimants. Depends on prax-1. Runs in parallel with prax-2. |
| prax-4a | People's Harpy resolve | backlog | Simple single-seat handover — calls the **existing** `PUT /api/office_seats/:seatId/holder` route as-is (it already does exactly this shape correctly; no bespoke transaction needed). Target seat: `office_category:'Socialite'`, `seat_label:"People's Harpy"` (written against the post-rename label from prax-4b). Resolve + dismiss (abandon, no winner recorded) + withdraw-claimant. Snapshot the final vote count into `praxis_sessions.harpy.resolved` in the SAME transaction as the seat handover — via a new small wrapper, `POST /api/praxis_sessions/:id/resolve-harpy` — so a failure between the two writes can't leave a real handover with no historical record. UI: undo-toast, not a confirm modal, with one line of context naming the outgoing holder ("Petra Voss is now People's Harpy — Sarah Kessler vacated. [Undo]") — a single-seat swap doesn't carry the "affects other people who aren't watching" weight that justifies breaking pattern for Head of State. Depends on prax-3. Independent of prax-0 entirely. |
| prax-4b | Head of State resolve | backlog | The epic's biggest, riskiest story. New route `POST /api/praxis_sessions/:id/resolve-praxis`, its OWN `withTransaction` — explicitly not calling `office-seats.js`'s route via nested HTTP (this codebase's stated convention; atomicity across collections is achieved writing Mongo directly inside the transaction). Reuses `office-seats.js`'s CAS discipline (baseline read outside the session, claim-first ordering inside it, filter on the frozen baseline not an in-session re-read). Exports `resetManoeuvreRank` out of `office-seats.js` into `server/lib/reset-manoeuvre-rank.js` and imports from both files (genuine once-already-buggy arithmetic, not safe to duplicate); extracts `RouteResponse` into a shared module too (that file's own comment set the threshold — "the right call the first time a THIRD route needs it," and this is that route). Mass-clear logic written fresh, inline, NOT extracted (simpler shape than the full single-seat handover — the "duplicate-now" case). Computed via a live query INSIDE the transaction, immediately before the writes: `office_category IN ['Enforcer','Administrator'] OR (office_category='Socialite' AND seat_label='City Harpy')`, filtered to occupied seats. Confirm-then-execute flow (Sally's design, concrete copy in the story): lists every person about to be vacated by name and office, the claimant's own name never mixed into that list, separate visually-distinct lines for "keeps Primogen" / "own People's Harpy seat vacated" (shown only if true), button copy "Confirm Resolve," NO undo-toast follow-up (a mass-clear isn't pretended to be undoable). The confirm list IS the CAS baseline (Winston's design) — the resolve request carries the exact confirm-list the ST saw, execute-time re-verifies against it, aborts with a diff on mismatch rather than silently clearing whatever currently matches. Winner's own prior seat: People's Harpy → vacated as an explicit step in the same transaction; Primogen → `holder_id` untouched, only `characters.court_category` overwritten to `'Head of State'` via prax-0's `deriveCourtCategory`. New WS frame naming affected entities (`{type:'praxis_resolved', affected_seat_ids, affected_character_ids, resolved_office}`) — genuinely new shape for this codebase, every existing broadcaster is single-entity; `office-tab.js`/`city-tab.js` need new client-side `initWS` wiring to receive and refetch on it (neither is wired in today). The **"City Harpy" `seat_label` rename** (from plain "Harpy") is a PRECONDITION folded into this story, not standalone — it's what lets the mass-clear query disambiguate the two Socialite seats at all: a one-off direct update of the live Brandy LaRoux document, plus editing the `OFFICE_SEATS` literal in `server/scripts/seed-office-seats.mjs` (its upsert is `$setOnInsert`-only and will NOT retroactively fix an existing document on its own — both actions are needed). A one-line comment lands at this transaction's boundary recording that Praxis resolve is deliberately fully atomic where `city-views.js`'s existing `saveCourt` multi-seat pattern is deliberately non-atomic (loops independent PUT calls, accepts partial completion on failure) — so a future maintainer doesn't "align" this back to that looser shape. Depends on prax-2 AND prax-0. |

---

## What this epic is NOT

- **Not** a rework of Territory Bids, and does not retrofit its missing session-live gate or its
  client-only architecture onto it — Territory Bids stays exactly as TBID.1 left it, untouched.
- **Not** a historical archive/audit trail beyond what a real office handover already gives for
  free — once prax-4a/4b call the real handover, `office_seats` + `characters.court_category` IS
  the durable "who holds this now" record. No separate results-history story exists in this epic.
- **Not** a change to Primogen or Territory Regent resolution logic — both survive Praxis changes
  entirely untouched, separate systems.
- **Not** a rewrite of `office-seats.js`'s core one-seat-per-*conflicting*-category invariant —
  prax-0 sits alongside it (additive), doesn't rewrite what's already shipped and tested.
- **Not** gated on the game session being "live" in any server-enforced sense — ST-role gating is
  the whole access-control story here.
- **Not** player-visible in any form, at any point, ever — no fuzzed/partial view, unlike Territory
  Bids' `peekInfo()`. Permanent, not deferred.

## Sequencing notes

- **prax-0 blocks prax-4b only** — not prax-1, prax-2, prax-3, or prax-4a. Its own blast-radius
  audit confirmed the board UIs' display concerns are unaffected by the identity fix.
- **prax-1** is the base scaffold everything else sits on top of.
- **prax-2 and prax-3** run in parallel once prax-1 lands; neither depends on the other.
- **prax-4a** depends on prax-3, independent of prax-0 entirely.
- **prax-4b** depends on prax-2 **and** prax-0 — the only hard new dependency edge this epic adds.
- **prax-0 has no upstream dependency at all** and can be built first in wall-clock time, or in
  parallel with prax-1 through prax-3, whichever is more convenient. "First" means "ahead of
  prax-4b," not "ahead of the epic."

## Open questions

None outstanding. Every decision surfaced during scoping (game rules, exclusivity model,
architecture shape, confirm-dialog design, story split) was put to Angelus directly and locked.
