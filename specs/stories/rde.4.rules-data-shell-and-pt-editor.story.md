---
title: 'Rules Data admin shell + Professional Training editor view'
type: 'feature'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** Once PT rules live in `tm_suite.rule_grant` / `rule_skill_bonus` / `rule_nine_again` (RDE-3), STs need an in-app way to edit them. Without an editor, the migration goal of "STs control hardcoded rules from the admin panel" is unfulfilled. This story builds the Rules Data sidebar entry, the left-rail navigator, and the first concrete editor view (PT). Subsequent migration stories (RDE-5+) plug into the shell.

**Approach:** Add a "Rules Data" entry to the admin Engine sidebar. The view has a left rail with the six rule-family categories. Clicking a category shows a sortable, searchable list of that family's rules. Clicking a row opens a side panel with an editable form. PT's three rules render in their respective categories. Each rule has a `notes` textarea for the *why*, and a preview panel that picks a real character and shows the sheet's bonus-dot rendering before vs after the rule change.

## Boundaries & Constraints

**Always:**
- Single sidebar entry "Rules Data" under the admin Engine domain. Reaches all rule families through one IA.
- Left rail in this order: *Merit Grants*, *Skill Bonuses*, *9-Again*, *Discipline → Attribute*, *Derived Stat Modifiers*, *Tier Budgets*. Mirrors the ADR catalogue.
- List view is a flat table per category. Sortable by `source` and `tier`. Searchable by free-text against `source` and `notes`.
- Side panel form has inline validation matching the Ajv schema (e.g. "merit name must exist in `MERITS_DB`" for `rule_grant.target` when `grant_type='merit'`).
- Each rule has a multiline `notes` textarea. Surfaced in the row's tooltip and visible in the form.
- Preview panel: ST picks a real character from a dropdown of all active PCs; the panel renders that character's sheet bonus-dot section before vs after the proposed save. Saves only commit on explicit confirm.
- Hollow-dot convention untouched. Editor uses `shDotsWithBonus` for any preview rendering.
- ST-only at the API and UI level. Sidebar entry hidden for non-ST roles.

**Ask First:**
- Whether to include a "Show effective character before/after" preview side-by-side or stacked. UX preference. Default side-by-side on desktop.
- Whether form changes auto-save (with debounce) or require an explicit Save click. Default explicit Save to avoid accidental partial-state writes affecting live characters.

**Never:**
- No bulk edit. One rule at a time. Bulk import deferred per ADR.
- No rule re-ordering or priority field in v1. Rules apply in collection-natural order; if order ever matters, that's a new story.
- No rule history or undo. Out of scope per ADR.
- No rendering of rule logic in the player view. ST-side only.

## I/O & Edge-Case Matrix

| Scenario | UI state | Expected |
|---|---|---|
| ST opens Rules Data first time | empty collections | each category shows "No rules yet" placeholder + "+ New rule" button |
| ST clicks Merit Grants → existing PT rule | row visible | click opens side panel pre-filled |
| ST changes `amount` on PT dot 1 from 2 to 3, opens preview against a PT-1 character | preview rendered | sheet shows Contacts at `free_pt: 3` post-save (3 hollow dots), pre-save shows 2 |
| ST submits invalid form (target merit doesn't exist) | inline validation | save button disabled, field outlined, message visible |
| ST deletes a rule | confirmation dialog | on confirm: DELETE call, list refreshes, rule gone |
| Player visits the URL directly | server returns 403 | UI shows "Forbidden" placeholder; sidebar entry never rendered for player role |
| ST switches preview character with unsaved form changes | unsaved changes | confirmation: discard / keep editing |

## Code Map

- `public/admin.html` — sidebar definition. Add "Rules Data" entry under Engine.
- `public/js/admin.js` — sidebar wiring; add a `loadRulesData()` entry point.
- `public/js/admin/rules-data-view.js` (new) — main view module. Mirrors structure of `public/js/admin/downtime-views.js` (large file, multiple sub-views, similar IA depth).
- `public/css/admin.css` (or wherever admin styles live) — left rail + side panel + preview styles.
- `public/js/data/api.js` — add `apiGet/Post/Put/Delete` helpers for `/api/rules/<family>` if not already generic.
- `server/routes/rules-engine.js` — already exists from RDE-2. No changes here unless the editor exposes a need.
- `public/js/editor/sheet.js:507,520` — `shDotsWithBonus` reused in preview rendering.

## Tasks & Acceptance

**Execution:**
- [ ] `public/admin.html` — add "Rules Data" sidebar entry under the Engine section.
- [ ] `public/js/admin/rules-data-view.js` (new) — implements the view. Left rail, list panel, side-panel form, preview panel. ~600 lines target; if it grows beyond that, split editors per family in subsequent stories.
- [ ] `public/css/admin.css` (or wherever) — styles for the new view following parchment theme tokens (`--gold2`, `--bg`, surface tiers).
- [ ] PT-specific form support: `rule_grant` form covers PT's dot-1 rule; `rule_nine_again` form covers PT's dot-2 rule; `rule_skill_bonus` form covers PT's dot-4 rule. Forms scaffolded for the OTHER rule types but only PT's three populate at launch — RDE-5+ fills them in.
- [ ] Preview panel: pick-character dropdown filtered by `retired !== true`. Renders sheet's bonus-dot section using `shDotsWithBonus`. Pre/post columns side by side.
- [ ] Inline validation: `rule_grant.target` (when `grant_type='merit'`) checked against `MERITS_DB` keys. `rule_skill_bonus.target_skill` checked against the canonical skill list. `rule_nine_again.target_skills` element-wise checked.
- [ ] Wire edit / delete with confirmation modals.

**Acceptance Criteria:**
- Given an ST navigates to admin → Engine → Rules Data, when the view loads, then the left rail shows six categories with non-zero counts only on Merit Grants / Skill Bonuses / 9-Again (PT's three rules).
- Given an ST clicks PT's dot-1 rule and changes `amount` from 2 to 3, when they open the preview against a PT-1 character, then the post-save column shows Contacts with `free_pt: 3`.
- Given a player attempts to load the route, when the API responds 403, then the UI shows a forbidden placeholder and the sidebar entry is hidden.
- Given an ST tries to save a rule whose `target` merit doesn't exist in `MERITS_DB`, when they click Save, then the form blocks submission with inline validation.

## Verification

**Commands:**
- `npx http-server public -p 8080` + `cd server && npm run dev` (or `node index.js` per the local-env memory) — open `http://localhost:8080/admin.html`, sign in as ST via `localTestLogin()`, navigate to Rules Data.

**Manual checks:**
- All three PT rules visible across their respective categories.
- Edit one, preview against a real PT-1 character, confirm sheet diff renders correctly.
- Delete a rule, confirm it disappears from the list and the API.
- Open as player (or with player override), confirm sidebar entry hidden and direct URL returns forbidden.

## Design Notes

The list-and-side-panel pattern is well-trodden in `downtime-views.js` and `city-views.js`. Lift the layout, restyle for rule-shape forms.

The preview panel is the trust-builder. STs will not adopt this tool if rule edits feel like throwing rocks into a well. The before/after sheet diff makes the blast radius concrete. Cut other features before cutting the preview.

Forms scaffolded for all six families now (even though only PT populates) means RDE-5+ stories add data, not UI infrastructure. Lower marginal cost per family.
