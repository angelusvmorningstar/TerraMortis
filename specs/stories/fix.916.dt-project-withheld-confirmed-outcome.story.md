# fix.916 — DT Story: confirmed project outcomes render "Project withheld"

```yaml
issue: 916
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/916
branch: morningstar-issue-916-project-withheld
status: review
type: bug
predecessor: 914
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Implementation summary

Read-side only; no server/DB/write-path changes. In `renderOutcomeWithCards`
(`public/js/tabs/story-tab.js`, per-project loop), `rev` is now declared before
`resp`, and the withheld gate falls back to a **confirmed** outcome:

```js
const rev = resolved[i] || {};
const confirmedOutcome = (rev.outcome_confirmed && rev.outcome?.trim()) ? rev.outcome.trim() : '';
const resp = responses[i]?.response?.trim() || confirmedOutcome;
```

An approved project (`projects_resolved[i].outcome` + `outcome_confirmed: true`) now
flows into the card branch instead of the withheld branch, removing the spurious
"Project withheld" card that was being injected under the published narrative. An
existing `st_narrative.project_responses[i].response` still takes precedence, and an
unapproved draft (`outcome_confirmed` falsy) stays withheld. The narrative prose is
unaffected — it comes from the published_outcome section, not the card body, so no
duplication.

### Testing

- New `tests/fix-916-project-withheld-confirmed-outcome.spec.js` (4 ACs), player
  Archive-tab harness (same as fix-466):
  - AC1/AC2 — confirmed outcome + empty `project_responses`: no `.proj-card-withheld`,
    narrative still renders.
  - AC3 — `outcome` present but `outcome_confirmed:false`: still withheld (unapproved
    draft guard).
  - AC4 — no outcome: genuine withheld preserved.
  - AC5 — existing `project_responses[i].response`: card renders (precedence/regression).
- Regression-checked the other `renderOutcomeWithCards` specs: fix-464, fix-466,
  fix-468, fix-470. **27 passed, 0 regressions.**
- Harness note: this corrects the fix.914 QA assumption — the player report IS
  reachable via the Archive tab, so `renderOutcomeWithCards` is testable end-to-end.

### File List

- `public/js/tabs/story-tab.js` (modified)
- `tests/fix-916-project-withheld-confirmed-outcome.spec.js` (new)
- `specs/stories/fix.916.dt-project-withheld-confirmed-outcome.story.md` (this file)

### Change Log

- Withheld-gate fallback to a confirmed `projects_resolved[i].outcome` in
  `renderOutcomeWithCards`; approved projects show their card, drafts stay withheld.

## QA Results (Quinn)

**Verdict: PASS** — fix-916 ×5 green, plus fix-464/466/468/470 regression (27 total
across the dev run), 0 regressions.

AC coverage: AC1/AC2 (no withheld card) ✓, AC3 (unconfirmed draft stays withheld) ✓,
AC4 (no outcome stays withheld) ✓, AC5 (response precedence) ✓.

QA-added / hardened (gaps in the dev pass):
- **AC6 multi-project** — realistic DT4 shape (project 1 confirmed, project 2 draft):
  exactly one withheld card (the draft "Follow the Money"), the confirmed project
  renders its card + narrative, and the withheld card is NOT cross-wired to the
  confirmed project's title. Proves per-slot gate independence.
- **AC1 hardened** — now also asserts a non-withheld `.proj-card` actually renders
  (the original test would have passed even if the fix dropped the card entirely).

No outstanding gaps. The fix.914 player-report harness concern is resolved here — the
Archive-tab harness reaches `renderOutcomeWithCards` end-to-end.

## Story

As a player (and the ST previewing the report), when an ST has drafted and approved
a project outcome in DT Processing, I want that project to show its outcome in the
DT Story / player report, so that approved project results actually reach players
instead of reading "Project withheld — see your Storytellers."

## Background

Third in the #904 / #914 field-mismatch family. Each fix is the same shape: the DT
Processing **Confirm** button writes the approved outcome to a *resolved* field, but
a player-report renderer reads a *legacy* field that the post-#886 flow never
populates.

- #904 — merit actions: read `merit_actions_resolved[i].outcome_summary`, ST wrote `.outcome`
- #914 — acquisitions: read `acquisitions_resolved[…].outcome_summary`, ST wrote `.outcome` (+ wrong slot)
- **#916 — projects**: read `st_narrative.project_responses[i].response`, ST wrote `projects_resolved[i].outcome` (+ `outcome_confirmed: true`)

`renderOutcomeWithCards` (`public/js/tabs/story-tab.js`) gates each project's card on
`responses[i]?.response`, where `responses = sub.st_narrative.project_responses`.
That legacy publish/editable surface is **empty across all 29 DT4 submissions**,
while nearly all of them have four fully-resolved projects carrying confirmed
`projects_resolved[i].outcome` prose. So every approved project drops into the
`!resp` branch and renders the "Project withheld" card.

### The duplicate

In the DT Story view the project appears twice (confirmed live on Yusuf Kalusicj's
"Moving Blood over old Ground"):

1. A published **narrative section** with the full outcome prose — because
   `compilePushOutcome` (`downtime-story.js:3537+`) live-compiles
   `projects_resolved[i].outcome` into the published narrative.
2. A spurious **"withheld" card** injected immediately under that section
   (`story-tab.js:486-489`), because the card gate read the wrong (empty) field.

The narrative is right; the withheld card is the bug.

## Acceptance criteria

- [ ] **AC1** — Given a project with `projects_resolved[i].outcome` set and
  `outcome_confirmed: true`, and `st_narrative.project_responses[i].response` empty,
  When `renderOutcomeWithCards` runs (admin DT Story preview and player report),
  Then the project shows its proper mechanics card (type chip / pool / roll / ST
  note), not "Project withheld — see your Storytellers."
- [ ] **AC2** — Given that same project, Then the duplicate withheld card no longer
  appears beneath the published narrative section.
- [ ] **AC3** — Given a project with **no** confirmed outcome (no `response`, and
  either no `projects_resolved[i].outcome` or `outcome_confirmed` falsy), Then
  "Project withheld — see your Storytellers." still renders (genuine withheld
  preserved).
- [ ] **AC4** — Given a project that DOES have `st_narrative.project_responses[i].response`,
  Then that value is used unchanged (precedence preserved — the `projects_resolved`
  fallback never displaces an existing response).
- [ ] **AC5** — No data migration; the fix surfaces already-approved DT4 outcomes on
  next render. No server/DB/write-path changes.
- [ ] **AC6** — Verified against live DT4 submission for Yusuf Kalusicj (4 confirmed
  projects incl. "Moving Blood over old Ground").

## Scope

**In scope**
- Read-side fallback in `renderOutcomeWithCards` so the withheld gate recognises a
  confirmed `projects_resolved[i].outcome`.
- Gate strictly on `outcome_confirmed` so unapproved drafts stay withheld.

**Out of scope**
- The push/publish compile path (`compilePushOutcome`) — already compiles the prose
  into `published_outcome`; unchanged.
- The editable `st_narrative.project_responses` admin surface and its save handler
  (`downtime-story.js:422-429`).
- Any backfill of `st_narrative.project_responses` (the render fix makes it
  unnecessary; a backfill would be a per-cycle band-aid).
- Joint-project outcome injection (`_findJointForSlot` / `compilePushOutcome`) — not
  touched by the gate change.

---

## Dev Notes

### Files to read before editing

- `public/js/tabs/story-tab.js` — `renderOutcomeWithCards` (378-515): the project
  card builder loop (388-434), the section render + card injection (447-503).
- `public/js/admin/downtime-story.js` — `compilePushOutcome` (3537+) **reference
  only**; confirms the project narrative is sourced from `projects_resolved[i].outcome`.

### Exact change site

`public/js/tabs/story-tab.js`, top of the per-project loop. Today:

```
Line 393-394:
  const resp     = responses[i]?.response || '';
  const rev      = resolved[i] || {};
```

`rev` is declared *after* `resp`. Reorder so `rev` is available, then let `resp` fall
back to the confirmed outcome:

```
  AFTER (sketch):
  const rev  = resolved[i] || {};
  const confirmedOutcome = (rev.outcome_confirmed && rev.outcome?.trim()) ? rev.outcome.trim() : '';
  const resp = responses[i]?.response?.trim() || confirmedOutcome;
```

That is the whole behavioural change. The existing branch at line 399 (`if (!resp)`)
then only fires for genuinely-unrecorded projects (AC3), and a confirmed project
flows into the `else` branch which builds the mechanics card (header / pool / roll /
ST note) at lines 404-429.

### Why this removes the duplicate (AC2)

The narrative prose is NOT rendered inside the card (the `else` branch renders only
the type chip, pool, roll, and `player_facing_note`). The prose comes from the
published_outcome section (447-483). So flipping the gate replaces the withheld card
with a mechanics card next to the same narrative section — no prose duplication, and
the "withheld" line is gone.

### What NOT to change

- Do not render `resp` / `confirmedOutcome` text inside the card body — the prose
  already lives in the published narrative section; printing it in the card would
  duplicate it.
- Do not touch `compilePushOutcome` or the publish path — `published_outcome` already
  carries the prose.
- Do not write to `st_narrative.project_responses` — read-side only.
- Preserve the card-injection/`used` logic (486-489) and unmatched append (498-503)
  unchanged.

### Preservation invariant

`responses[i]?.response?.trim() || confirmedOutcome` — an existing `response` always
wins; the `projects_resolved` fallback only fills the empty case (AC4). Mirrors the
#904/#914 precedence pattern.

### No data migration

Every DT4 project the ST confirmed already has `outcome` + `outcome_confirmed: true`
in MongoDB. The read-side fix surfaces it on next render.

---

## Testing

No automated framework for runtime, but Playwright specs exist for the admin DT Story
panel (`tests/fix-456-*`, `tests/fix-491-*`, `tests/fix-914-*`). The dev pass should
add `tests/fix-916-project-withheld-confirmed-outcome.spec.js` mirroring that harness
(mock API, boot admin DT Story, inspect `.proj-card` / `.proj-card-withheld`).

**Cases to cover:**
- AC1/AC2 — submission with a `responses.project_1_title` and
  `projects_resolved[0] = { outcome: '…', outcome_confirmed: true }`, empty
  `st_narrative.project_responses`: rendered project shows the mechanics card /
  no `proj-card-withheld`, and "Project withheld" text absent.
- AC3 — project with no response and `projects_resolved[0]` having no outcome (or
  `outcome_confirmed` falsy): `proj-card-withheld` present, "Project withheld" text
  shown.
- AC4 — project with `st_narrative.project_responses[0].response` set AND a different
  `projects_resolved[0].outcome`: the `response` value drives the card (fallback not
  used).

**Manual on dev:** open Yusuf Kalusicj's DT4 DT Story — all four projects show their
outcomes, no withheld cards; confirm the player report shows the same once pushed.

> Coverage note (carried from fix.914 QA): the *player* `renderMeritSummarySection`
> path still lacks a published-report harness. `renderOutcomeWithCards` is reachable
> via the admin DT Story panel (same harness as fix-456/491/914), so the project-card
> change IS testable there; the player report remains manual-verify.

---
_Story created from GitHub issue #916 via tm-gh-issue-pickup → bmad-create-story.
Branch: `morningstar-issue-916-project-withheld`. Predecessor: fix.914._
