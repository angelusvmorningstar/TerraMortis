# Epic: OAQ — ST Approval Queue for Status Actions

**Goal:** Every Status Action (a Court Position holder changing another character's City Status)
is parked pending ST sign-off rather than applying immediately. Built by generalising the existing
`contested_roll_requests` pending-lifecycle pattern (status field, accept/decline, ST-only void —
`server/routes/contested-rolls.js`) rather than new infrastructure from scratch.

**Why:** Status Actions mutate a character's City Status directly. Angelus wants ST oversight on
every one, full stop — restated explicitly in the 2026-08-12 scoping session: "because I want to
be able to sign off on it. Status changes need ST oversight." Not up for further debate; do not
re-litigate the "why" in story-writing.

**Source:** 2026-08-12 party-mode scoping session.

---

## Stories

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| oaq.1 | Data-lock: `contested_roll_requests` shape vs Status Action needs | done | Confirm whether pending-vs-resolved is a status enum or inferred from a resolution field's presence, and whether a single-party action (Status Actions has no "opposing roll") needs an `action_type` discriminator plus a type-specific payload sub-document, before extending the collection. Dana's data-steward pass. |
| oaq.2 | Pending Status Actions — submit, ST accept/decline | done | Extend the pattern from oaq.1. Resolve at build time: does submitting spend the actor's session budget immediately (refund on decline?), or only on approval — this is a two-line decision now, a data-integrity argument later if left implicit. |
| oaq.3 | New ST tab — approval queue view | done | Pending-first sort/split, not buried under volume once Epic ROLLS (if activated) lands in the same tab. Race-safe for concurrent STs (three STs on this project) — an "already actioned by [ST]" refresh state so two STs can't both approve the same pending action. |

**CORRECTED 2026-08-15**: this table said `backlog` for all three; `sprint-status.yaml` on `main` has
shown `done` for all three. oaq.2/oaq.3 are merged and live; oaq.1 (data-lock only, docs) is
dev/review-complete on its own branch, held under Epic OTC's standing order alongside otc-2, not
actually unstarted.

---

## Sequencing notes

- Depends on OTC.2 (phase gate) landing first — little point building ST sign-off for actions
  that can currently also fire outside the game-phase gate.
- Epic OXP's merit-purchase spend also routes through this queue once built (Angelus confirmed:
  "ALL XP has to be approved") — oaq.3's tab design should anticipate a second pending-item type
  arriving, even though only Status Actions populate it at first.
- Epic ROLLS (if activated) shares this tab but is a separate epic — do not let its scope bleed
  into oaq.3's build.
