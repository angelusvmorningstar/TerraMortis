# Epic: DT Processing — Consistency & Architecture

## Status: ready-for-dev

## Purpose

The DT Processing tab was built incrementally across multiple development sessions with a vibe-coding approach. It works, but each action type's panel was added piecemeal, producing inconsistent UI patterns, layout, and architecture. This epic standardises the tab so every action panel follows a consistent structure, uses structured controls wherever values are enumerable, and shares common renderer functions.

The tab is ~8,000 lines of code. This epic does not rewrite it — it audits, extracts, and standardises, story by story.

---

## Design Principles

These principles govern every story in this epic. Dev agents must not deviate from them.

1. **Four zones per action panel, always in this order:**
   - Zone 1 — Action Definition (type, target, territory, details)
   - Zone 2 — Pool Builder (attr + skill + disc + modifiers)
   - Zone 3 — Outcome (successes, vitae, thresholds)
   - Zone 4 — Status (button row: Pending / Validated / Skip / etc.)

2. **Structured controls over free text.** If the valid values are enumerable, use a selector or ticker. Free text is only for genuinely open fields (narratives, notes, descriptions).

3. **Player feedback is player-visible output. ST notes are ST-only prompt context.** Both flow to DT Story. Neither is shown to the player directly from DT Processing.

4. **Shared zone renderers own layout and spacing.** Panel wrappers (per action type) supply data only — never CSS or layout.

---

## What Is Already Shared and Working — Do Not Change

| Function | Purpose |
|----------|---------|
| `_renderValStatusButtons` | Status button row — consistent across all panels |
| `_renderTickerRow` | Equipment modifier ticker — shared by all four right-panels |
| `_buildPoolExpr`, `_parsePoolExpr`, `_refreshPoolExpr` | Pool builder computation |
| `_formatDiceString` | Dice string formatting |
| `renderSubmissionChecklist` + `CHK_SECTIONS` | Submission checklist — complete, do not modify |

---

## Key Files

| File | Role |
|------|------|
| `public/js/admin/downtime-views.js` | All panel renderers, queue builder, processing mode |
| `public/js/admin/downtime-story.js` | DT Story context generators (`buildProjectContext`, `buildActionContext`) |
| `public/css/admin-layout.css` | All styles |

---

## Stories

### Track A — Data Wiring

| Story | File | Description |
|-------|------|-------------|
| A1 | feature.68 | Wire ST notes + player feedback into DT Story context generators |

### Track B — Structured Controls

| Story | File | Description |
|-------|------|-------------|
| B1 | feature.69 | Blood type: text input → ticker (Human / Animal / Kindred / Ghoul) |
| B2 | feature.70 | Sorcery controls: tradition → selector, rite → dropdown, targets → multi-character select |
| B3 | feature.71 | Contacts info request: add info-type selector (Public / Internal / Confidential / Restricted) |

### Track C — Missing Action UIs

| Story | File | Description |
|-------|------|-------------|
| C1 | feature.72 | Patrol/Scout: add structured outcome recording fields |
| C2 | feature.73 | Rumour: add structured outcome recording fields |
| C3 | feature.74 | Support: add target-action selector linking to queue entry |
| C4 | feature.75 | Block: add auto-resolution display and confirmation toggle |

### Track D — Architecture

| Story | File | Description |
|-------|------|-------------|
| D1 | feature.76 | Extract duplicated action-type recategorisation row into shared function |
| D2 | feature.77 | Extract shared roll card renderer; de-duplicate character lookup |
| D3 | feature.78 | Right-panel gap fill using shared zone renderers |

### Track E — Visual / UX

| Story | File | Description |
|-------|------|-------------|
| E1 | feature.79 | CSS token pass — eliminate ad-hoc styles throughout processing tab |
| E2 | feature.80 | Committed pool status — separate "pool locked" from "outcome validated" |

---

## Dependency Order

```
A1 ──────────────────────────────────────────┐
B1, B2, B3 ──────────────────────────────────┤
C1, C2, C3, C4 ──────────────────────────────┤──▶ E1 ──▶ E2
D1 ──▶ D2 ──▶ D3 ────────────────────────────┘
```

- Tracks A, B, C are fully independent of each other and of Track D
- D1 must land before D2; D2 must land before D3
- E1 runs last (CSS pass) — after all other tracks are stable
- E2 depends on E1 (new status must survive the CSS token pass)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial epic — from Winston + Sally design session | Bob (bmad-agent-sm) |
| 2026-04-15 | 1.1 | Added E2: committed pool status | Bob (bmad-agent-sm) |
