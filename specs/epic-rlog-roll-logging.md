# Epic: RLOG — Dice Roll Logging

**Goal:** Log every dice roll from every player — opposed/contested and plain — surfaced on the
new ST tab (Epic OAQ) alongside the approval queue.

**Why:** Raised in the 2026-08-12 scoping session as part of the approval-queue ask, bundled in
because both were going to live on the same tab. **Not yet validated as a real need.** John (PM,
party-mode) pushed back explicitly during scoping: opposed/contested rolls already persist to
`session_logs` today via the existing contested-roll system; plain rolls (the Suite app's roll
calculator, `public/js/suite/roll.js`/`roll-v2.js`) have zero persistence anywhere, and standing
up that infrastructure for every roll, every player, every session is a real capacity/schema
decision, not a small addition riding alongside Epic OAQ. Angelus has not yet named a concrete
dispute, audit need, or incident this would have resolved.

**Source:** 2026-08-12 party-mode scoping session.

**Status: not scheduled.** Held here as a record of the ask, not queued for `create-story`. Needs
either a named real need, or an explicit decision from Angelus to build it anyway.

---

## Stories (not backlog-ready — pending the above)

| ID | Title | Notes |
|----|-------|-------|
| rlog.1 | Persist plain roll-calculator rolls | `roll.js`/`roll-v2.js` currently make zero server calls — this is a new write path from scratch, not a UI surface over existing data. Volume/schema/retention decision needed first (Dana and Winston both flagged this in scoping). |
| rlog.2 | Surface roll log in the OAQ tab | Depends on rlog.1 and Epic OAQ's tab existing. Sally's note from scoping: fire-and-forget logging — must never block or delay a player seeing their roll result on a flaky connection (LARP, iPad-tethered, 35+ players). |

---

## Sequencing notes

Do not pull these into `sprint-status.yaml` as `backlog` until Angelus either names the real need
this solves or explicitly says to build it regardless.
