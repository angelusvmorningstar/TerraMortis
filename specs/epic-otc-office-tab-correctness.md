# Epic: OTC — Office Tab Correctness

**Goal:** Fix the three self-contained defects/gaps in the player Office tab found while scoping
the wider Office XP economy (Epic OXP): undifferentiated Status Power text, a client/server City
Status budget mismatch on Status Actions, and Status Actions being available outside a live game
session. Also open the tab to any player as a reference view for any office.

**Why:** Found during a 2026-08-12 scoping session while reviewing the Office tab ahead of the
Office XP economy work. None of these three items depend on OXP or the new ST approval queue
(Epic OAQ) landing first, and one (the phase gate) has a live-session consequence — a Head of
State can currently raise/lower City Status outside any game, which should not be possible.

**Source:** 2026-08-12 party-mode scoping session (Dana/Sally/Winston/John, `bmad-party-mode`).

---

## Stories

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| otc.1 | Status Power text — paragraph rendering | done | Check whether the source data already has `\n\n` the renderer ignores, or the field is genuinely flat, before deciding the fix. |
| otc.2 | Status Actions — server-side hardening | done | Two defects, one endpoint (`server/routes/office-actions.js`): (a) the server's City Status budget check omits the regent-ambience bonus and the 10-dot cap the client already displays — collapse to one shared calculation (`calcCityStatus`), not two independently-matched ones; (b) gate Status Actions to the current downtime cycle's `phase === 'game'` (reuse `public/js/downtime/cycle-phase.js`, no new lifecycle). |
| otc.3 | Office tab — browsable reference mode | done | Any player can browse any of the five offices' manoeuvres/merits as reference, gated off `app.js`'s `hasOffice` condition today. No purchase markers, no Status Actions panel, unless it's genuinely the viewer's own held office/seat. Confirm server-side scoping first — check whether office data is already fetched in full and only UI-hidden today, or needs a real "browse any office" route. |

**CORRECTED 2026-08-15**: this table said `backlog` for all three; `sprint-status.yaml` on `main` has
shown `done` for all three since 2026-08-12/13. All three merged and live. Epic itself is complete.

---

## Sequencing notes

- otc.2 first — cheap, live bug, no dependencies on anything else in this scope.
- otc.1 and otc.3 can run in parallel with each other and with anything else; both touch only
  `office-tab.js` rendering, no server changes beyond otc.3's scoping check.
- otc.2's phase gate interacts with Epic OAQ: what happens to a pending Status Action if the cycle
  phase changes while it's sitting in the approval queue needs a decision made in OAQ, not here.
- otc.3's reference view will show purchase markers once Epic OXP ships purchase state — until
  then it is pure `OFFICE_DATA` content, no purchase data exists to leak.
