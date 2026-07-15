---
issue: 994
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/994
branch: piatra/issue-994-rules-text-display
---

# Story 994: Display power `rules_text` in sheet drawers and dice modal

**Story ID:** feat.994
**Status:** Draft
**Date:** 2026-07-15
**Issue:** [#994](https://github.com/angelusvmorningstar/TerraMortis/issues/994)
**Branch:** `piatra/issue-994-rules-text-display`

---

## User Story

As a player on game day,
I want to expand a power's full, errata-corrected rules right where the power is shown (sheet drawer, dice modal),
so that I never have to open a PDF mid-scene.

---

## Background

- #992 (merged, PR #993) added `rules_text` (full rulebook text, markdown-lite) and `rules_source` (provenance, e.g. "VtR 2e Rulebook + TM Errata") to 312 of 619 `purchasable_powers` docs in prod.
- `/api/rules` (`server/routes/rules.js:27,43`) has **no projection** — full docs already flow to the client and into the `tm_rules_db` localStorage cache via `public/js/data/loader.js`. **No server change needed.** (Payload grows ~600-700KB; acceptable, note in PR.)
- `rules_text` format: paragraphs separated by blank lines; `**bold**` markers (`**Cost:**`, `**Dice Pool:**`, `**Dramatic Failure:**` etc.); optionally a `---` line followed by `**TM Errata:**` section. No other markdown.
- Display sites (verified):
  1. **Suite sheet Powers section** — `public/js/suite/sheet.js` builds `powersHtml` (~:517-739); power rows/drawers show the one-line desc. Find where each discipline power / devotion / rite row renders its expandable body.
  2. **Editor/legacy sheet drawers** — `public/js/editor/sheet.js`: rules-db map built at `:55` (`db[name] = { desc: r.description, ... }`); drawer bodies render `db.desc` at ~`:783` and ~`:2402`. The `:55` map must also carry `rules_text`/`rules_source`.
  3. **Dice modal** — `public/js/suite/dice-modal.js` `#dm-pool-info` populated ~`:296-321` (shows pool breakdown + cost line).
- CSS: tokens in `public/css/theme.css`; reuse existing drawer/expander component classes (`components.css`, `suite.css` — see `.disc-tap-row`/`.disc-drawer` pattern). NO bare hex, NO inline `style=`.
- British English. No em-dashes in UI copy.

---

## Acceptance Criteria

- [ ] AC1: A shared helper (suggest `public/js/shared/rules-text.js`) exports `renderRulesText(rulesText, rulesSource)` returning safe HTML: escape ALL input first (use existing `esc` helper), then transform exactly three markers — `**...**` → `<strong>`, blank-line paragraph breaks → `<p>`/`<br>`, a line consisting of `---` → `<hr>`-equivalent (tokenised class). Muted provenance line from `rules_source` at the end.
- [ ] AC2: Suite sheet Powers section — every power row whose rules doc has non-empty `rules_text` gets a collapsed "Full rules" expander inside its drawer; tapping toggles it. Powers without `rules_text` render exactly as today.
- [ ] AC3: Editor sheet drawers (both `:783`-area and `:2402`-area render paths) — same expander, same helper.
- [ ] AC4: Dice modal — when the seeded pool has a matching rules doc with `rules_text`, `#dm-pool-info` gains a collapsed "Rules" expander beneath the cost line. Rolling is unaffected.
- [ ] AC5: XSS-safe — a `rules_text` containing `<script>` or `<img onerror=...>` renders inert (test with a poisoned fixture).
- [ ] AC6: Usable at 360px — expanded text wraps, scrolls vertically within the drawer if long, never causes horizontal page overflow.
- [ ] AC7: All styling via theme tokens / existing classes; enforcement grep clean (no bare hex, no inline styles).
- [ ] AC8: No server/schema changes; no admin-surface changes; edit-mode entry (stripOverlay path) untouched.

## Design notes

- Match key: the rules cache is keyed by name/key depending on site — editor/sheet.js keys `db` by `r.name.toLowerCase()` (`:55`); suite sheet + dice modal resolve powers via `powersForDisc`/`getPool` — pass the rules doc (or its `rules_text`) through the existing lookups rather than re-querying.
- Lazy render is fine (build expander HTML on first toggle) but not required — 2-4KB strings are cheap.
- Keep the expander label small-caps muted per existing drawer affordances; reuse an existing chevron/toggle class if one exists rather than inventing one.
- The `**TM Errata:**` section after the `<hr>` should read as visually distinct via the hr + bold label only — no special colour needed.

## Test Plan

No test framework for client JS — browser smoke (per repo convention) + the AC5 poisoned-fixture check via a temporary console harness:
1. Boot suite locally (`npx http-server public -p 8080` + `cd server && npm run dev`), pick a character with Animalism (Feral Whispers = book-only) and one with an errata-append power (Raise the Familiar).
2. Sheet Powers drawer: expander present, toggles, renders bold/paragraphs/hr, provenance line shows.
3. Power without rules_text (any Auspex power, any devotion): no expander, renders as today.
4. Dice modal from a discipline row: Rules expander present and collapsed by default.
5. 360px viewport: no horizontal overflow with the longest matched power.
6. AC5: temporarily stub a poisoned rules_text in console; verify inert.
7. Listener-routing check (repo blind spot): verify the toggle works via an actual click in-browser, not just code review — click handlers registered inside `change` listeners silently no-op.

## Dev Notes

- Do not push/PR/merge/commit — SM handles git after verification.
- Unrelated uncommitted specs exist in the working tree — do not stage or modify them.
