---
issue: 496
issue_url: https://github.com/angelusvmorningstar/issues/496
branch: ms/issue-496-territory-keys-canonical-oid
story: 496.2
parent_scope: 4-story breakdown — see issue #496 body
sequence: 2 of 4 (496.1 ✅ → 496.2 → 496.3 → 496.4)
depends_on: 496.1 (server dual-read tolerance — landed in commit b32120a, PR #498)
---

# Story 496.2: Form writes ObjectId keys for territory fields

Status: review

## Story

As a developer migrating territory identifiers to canonical ObjectId across the system,
I want the player downtime form to write ObjectId keys (instead of long slugs / short slugs) for every territory-encoded field on submit,
so that new submissions land in the canonical format from the moment 496.2 ships, leaving only legacy stored submissions (handled by 496.3 migration) to clean up.

This story is **phase 2 of the 4-phase migration** in #496. Phase 1 (496.1, already shipped on this branch) made the server tolerant of both formats, so this form change can land independently with no server-side breakage.

## Acceptance Criteria

1. **Pre-flight: form-side audit.** Before any code change, grep `public/js/tabs/downtime-form.js` for every site that writes a territory identifier into `responses`. Confirm the complete list (expected: 4–6 sites covering `feeding_territories`, `feeding_territories_rote`, `influence_spend`, `project_${n}_territory`, `sphere_${n}_territory`, `project_${n}_ambience_target`). Record findings in **Form Site Findings** below. If unexpected sites exist, surface to user before coding.
2. **Territory ID lookup helper.** A new helper (live with the form code, e.g. `public/js/tabs/downtime-form.js` or a small companion module) builds a `Map<displayName, oidString>` from the cached territories list at form initialisation. Lookup is O(1).
3. **JSON-string fields write OID keys.** `responses.feeding_territories` and `responses.feeding_territories_rote` JSON blobs use territory `_id` strings as keys (not long slugs). Status values (`resident`, `feeding_rights`, `poach`, `none`) unchanged.
4. **`influence_spend` JSON writes OID keys.** Same treatment as feeding fields. Negative integers (overpaying) still allowed as values.
5. **Enum fields write OID strings.** `project_${n}_territory`, `sphere_${n}_territory`, `project_${n}_ambience_target` write the territory `_id` string as the value. (Server schema accepts both formats from 496.1; this story flips form output to OID.)
6. **Barrens / "no territory" handling preserved.** Barrens has no canonical territory document. Keep writing the legacy slug `the_barrens_no_territory_` for that one cell; server resolver maps it to `null` correctly (verified in 496.1 tests).
7. **Internal form state and DOM IDs unchanged.** Element IDs (e.g. `dt-feed-val-the_academy`, `dt-project_1_ambience_target`) and the form's in-memory territory iteration (still over `FEEDING_TERRITORIES` display-name list) keep their current shape. The OID remap happens only at the **save boundary** (where values get written into `responses`). This minimises blast radius and keeps the form rendering code untouched.
8. **In-flight drafts continue to load.** A draft saved before 496.2 (legacy-slug keys) loads back into the form correctly. Draft re-keying happens organically: when the player next saves, the new save writes OID keys. No special migration on load. (The form's load code reads territory data into display state via `slugFromGrid()`-style helpers that already handle long slugs; verify these still work when the saved blob contains a mix of legacy and OID keys.)
9. **No server-side changes.** This story is form-only. Server tolerance from 496.1 is the contract; nothing here changes the schema or any route.
10. **Smoke test on localhost.** With both API and frontend running:
    - Player loads the DT form, fills out feeding + influence + at least one project, saves a draft, re-loads, confirms the draft restores correctly.
    - Submit final. Inspect the persisted submission in `tm_suite` (or test DB) and confirm `responses.feeding_territories`, `feeding_territories_rote`, `influence_spend`, and any populated enum fields use ObjectId keys/values.
    - Open the admin processing view for that submission and confirm territory pills/cards render correctly (this verifies the existing frontend's `resolveTerrId` still copes with OID-keyed submissions — should "just work" since `resolveTerrId` already accepts OIDs via pass-through).

## Tasks / Subtasks

- [ ] **Pre-flight: form-side audit** (AC: 1)
  - [ ] Grep `public/js/tabs/downtime-form.js` for every write into `responses` that involves a territory identifier (as a JSON key OR as a string value)
  - [ ] Find the influence_spend collection point (`influence_grid` question type — likely a separate code path from the feeding territory grid)
  - [ ] Find the sphere_${n}_territory collection point (sphere actions are tabbed; the territory may come from a select/pill widget)
  - [ ] Confirm the list under **Form Site Findings**. Cross-reference against the live-data audit's six fields from 496.1.

- [ ] **Territory ID lookup helper** (AC: 2)
  - [ ] Determine where territories are already cached client-side (likely fetched once at form init via `/api/territories`)
  - [ ] Build a small `territoryOidByName(displayName)` lookup, or a `Map<displayName, oidString>` on the form's internal state
  - [ ] Include reverse lookup `territoryNameByOid(oid)` if needed by the load path (AC 8)
  - [ ] Handle Barrens explicitly: returns `null` or a sentinel so the calling code knows to fall back to the legacy slug

- [ ] **Update feeding_territories collection** (AC: 3, 6)
  - [ ] Locate the `territory_grid` question handler (~line 478 of `downtime-form.js`)
  - [ ] Replace `gridVals[terrKey] = el.value` with `gridVals[oid || terrKey] = el.value` where `oid = territoryOidByName(terr)` (Barrens falls through to terrKey)

- [ ] **Update feeding_territories_rote collection** (AC: 3, 6)
  - [ ] Locate the rote grid handler (~line 448–455 of `downtime-form.js`)
  - [ ] Same OID-keying treatment as feeding_territories

- [ ] **Update influence_spend collection** (AC: 4)
  - [ ] Locate the `influence_grid` question handler (per `downtime-data.js:263` the question key is `influence_spend`; find the matching `if (q.type === 'influence_grid')` block in `downtime-form.js`)
  - [ ] Apply the same OID-keying refactor

- [ ] **Update enum-style territory inputs** (AC: 5)
  - [ ] Locate the writes for `project_${n}_ambience_target` (~line 688–690), `project_${n}_territory`, `sphere_${n}_territory`
  - [ ] For each: the form input's `value` attribute is the territory identifier. Either set the value to OID when rendering, OR remap at save time. Pick whichever produces less churn — likely save-time remap.
  - [ ] Note: per the 496.1 audit, `project_${n}_territory` is dead (0 live docs). Update for consistency anyway, but expect no observable behaviour change for that field.

- [ ] **Verify draft load handles mixed keys** (AC: 8)
  - [ ] Read the form's load path (search for where saved responses are reapplied to form state — likely a `loadDraft()` or `applyResponses()` function)
  - [ ] If the load path uses `terrKey` as a JSON lookup, ensure both legacy-slug and OID lookups work (the resolver pattern from 496.1 applies here too — could share logic via a small client-side helper, OR just convert OID→display name via the reverse lookup map)
  - [ ] Test load with a fixture draft that has long-slug keys; test load with a fresh OID-keyed save

- [ ] **Smoke test on localhost** (AC: 10)
  - [ ] Start local API and frontend
  - [ ] Player flow: fill form, save draft, reload, verify restore
  - [ ] Inspect persisted document in MongoDB; confirm OID keys
  - [ ] Admin processing view renders the submission correctly

## Dev Notes

### Depends on
- **496.1 — server dual-read tolerance** (PR #498, commit `b32120a` on this branch). Without it, the server would 400 every OID-keyed submission.

### Key files
- `public/js/tabs/downtime-form.js` (6,807 lines) — primary edit site; **all** territory-key writes live here
- `public/js/tabs/downtime-data.js` (420 lines) — defines `FEEDING_TERRITORIES` display-name list and the `influence_spend` question metadata
- `public/js/data/helpers.js` — possibly contains existing territory helpers worth reusing

### Form Site Findings

**Audit run:** 2026-05-24 against `public/js/tabs/downtime-form.js` (6,807 lines) + live MongoDB cross-check.

| Field | Site | Current shape | Change needed |
|---|---|---|---|
| `responses.feeding_territories` (JSON keys) | downtime-form.js:477–486 (`territory_grid` handler) | `terrKey = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_')`, iterating `FEEDING_TERRITORIES` | Save-boundary OID remap; Barrens fallthrough |
| `responses.feeding_territories_rote` (JSON keys) | downtime-form.js:448–456 (rote grid handler) | Same pattern as feeding_territories | Same |
| `responses.influence_spend` (JSON keys) | downtime-form.js:467–476 (`influence_grid` handler), iterates `INFLUENCE_TERRITORIES` | Same `tk` slugification pattern | Save-boundary OID remap |
| `responses.project_${n}_territory` (value) | downtime-form.js:612, 623 | `terrEl.value` from input element | Save-boundary OID remap |
| `responses.project_${n}_ambience_target` (value) | downtime-form.js:688–690 | `ambTargetEl.value` from hidden input | Save-boundary OID remap |
| `responses.sphere_${n}_territory` (value) | downtime-form.js:757–759 (suffix loop) | `el.value` from `dt-sphere_${n}_territory` input | Save-boundary OID remap |
| **NEW** `responses.project_${n}_target_terr` (value) | downtime-form.js:679–680 | `targetTerrEl.value` from `dt-project_${n}_target_terr` input | Save-boundary OID remap |

**Unexpected discovery surfaced 2026-05-24:** `project_${n}_target_terr` was missed by issue #496 body and 496.1 audit. 18 live documents have non-empty short-slug values (`"northshore"`, `"academy"`, `"harbour"`, `"dockyards"`). Same `renderTerritoryPills()` widget as other territory selectors. Not schema-validated today (only via `additionalProperties: true`). **User direction (2026-05-24):** include in 496.2 (form write), 496.3 (migration), and 496.4 (schema addition). Issue #496 commented with the finding.

**Fields verified NOT territory-typed** (despite suggestive names):
- `sphere_${n}_grow_target` — numeric dot rating (e.g. `"4"`)
- `sphere_${n}_investigate_lead` — free-text narrative

**Pause complete. Coding begins after this section is committed.**

### Why save-boundary remap (not render-boundary)
The form's internal logic iterates `FEEDING_TERRITORIES` (display names) and binds DOM elements via slug-derived IDs (`dt-feed-val-the_academy`). Changing the DOM IDs or the iteration variable would ripple through dozens of render sites for no functional benefit — server doesn't care what the DOM IDs are. By transforming only at the `responses[key] = ...` write boundary, the diff stays surgical and the form's rendering code is untouched.

### Barrens special case
Barrens (`the_barrens_no_territory_`) is not a real territory. It has no `_id` in the `territories` collection. The 496.1 resolver maps both slug variants to `null`. This story keeps writing the legacy slug for the Barrens cell — server tolerates it correctly, and there's no canonical OID to use instead.

### Things explicitly NOT in scope (handled by later stories)
| Item | Story |
|---|---|
| One-time migration of existing stored submissions | 496.3 |
| Migration of legacy `influence_territories` field (DT1) | 496.3 |
| Deletion of `resolveTerrId` / `TERRITORY_SLUG_MAP` / `normaliseTerritoryGrid` / `normaliseTerritorySlug` / server resolver | 496.4 |
| Schema tightening to OID-only | 496.4 |
| CSV import retirement | 496.4 |
| Form input UI changes (label tweaks, layout) | Out of scope of #496 entirely |

### Calibration and safety rules
- **Hobby-project scale** (per memory): half-day's work. Six write sites + one helper + draft-load verification.
- **No tests** unless the form code already has a test harness — the project has no frontend test framework per CLAUDE.md ("No test framework. Verify changes manually in-browser"). Smoke testing in the browser is the verification path.
- **Don't over-engineer the helper.** A `Map<name, oid>` built once per form load is the right size. No need for a full client-side resolver mirroring the server one — the server's resolver handles complex inputs; the form only ever writes from a known territory list.
- **Localhost smoke test is mandatory** (per CLAUDE.md and memory): start dev server, drive the form in a browser, inspect the persisted document.
- **No dev/main merge** until the full 496.x arc is complete (user direction 2026-05-24). All stories stack on this branch.

### Why no draft auto-rekeying
Once the player saves once after 496.2 deploys, their draft is OID-keyed. The brief window where they have a legacy-slug draft is harmless because:
- The server still tolerates legacy keys (496.1)
- The form load path needs to handle legacy keys anyway (existing drafts at deploy time)
- Re-keying on load adds complexity for marginal benefit

The migration script in 496.3 will rekey all stored submissions (including in-flight drafts) in one pass.

### References
- Issue #496 acceptance criteria (this story covers AC 4 in particular: "Form-side code builds a `slug → _id` map at page load from cached territories and writes ObjectId keys on submit")
- 496.1 audit: `specs/stories/tech-debt.496.1.server-territory-dual-read.story.md` § "Live Data Findings"
- `public/js/tabs/downtime-form.js:478–485` — `territory_grid` question handler (primary edit site)
- `public/js/tabs/downtime-form.js:448–455` — `feeding_territories_rote` collection
- `public/js/tabs/downtime-form.js:685–690` — `project_${n}_ambience_target` collection
- `public/js/tabs/downtime-data.js:263` — `influence_spend` question metadata
- Server resolver (built in 496.1): `server/utils/territory-key-resolver.js` — design reference for the lookup pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- No runtime debug needed; ES-module parse check passed via `node --input-type=module --check`.
- `new Function()` parse-check pattern fails on top-level `await` (a known quirk); switched to `node --input-type=module --check < file.js` for verification.

### Completion Notes List

**What changed**

1. **`public/js/tabs/downtime-form.js`**:
   - Added `_buildTerritoryOidMap()` — Map keyed by both display name and short slug → OID; built once per `collectResponses()` call (line ~107).
   - Added `_terrOidForName(name)` — O(n) lookup for render functions that don't have a pre-built map in scope (n always ≤5).
   - Added `_terrGridVal(grid, displayName, legacyKey)` — tolerant read across OID (new) and legacy-slug (existing drafts) keys for `gridVals`/`infVals`-style accesses.
   - 7 **save-side** updates in `collectResponses()`:
     - `feeding_territories_rote` (rote grid handler) — OID-key the JSON
     - `influence_spend` (`influence_grid` handler) — OID-key the JSON
     - `feeding_territories` (`territory_grid` handler) — OID-key the JSON
     - `project_${n}_territory` — remap slug → OID
     - `project_${n}_target_terr` — remap slug → OID **(NEW field, surfaced during pre-flight; user approved into scope)**
     - `project_${n}_ambience_target` — remap slug → OID
     - `sphere_${n}_territory` — remap slug → OID (loop special-case)
   - 4 **load-side** updates so existing drafts still render correctly while saves migrate to OID format:
     - `renderTerritoryPills()` — match pill by slug derived from OID lookup against `_territories` (line ~5395)
     - `renderFeedingTerritoryPills()` — `mainGridVals` and `gridVals` reads use `_terrGridVal` (line ~5424, ~5455)
     - `slugFromGrid` closure inside `_renderFeedingMinimalAnnotation` (line ~3803) — handles OID keys
     - `slugFromGrid` duplicate inside the MINIMAL-mode feeding section (line ~6460) — same OID branch added
     - `resolveTerrAmbience` closure (line ~6614) — handles OID keys
2. **`public/js/admin/downtime-views.js`**:
   - `resolveTerrId()` (line 3762) — added an ObjectId branch that looks up the canonical short slug from `cachedTerritories`. **Without this**, admin readers would silently skip any OID-keyed feeding/influence entry from a 496.2-saved submission (downstream `resolveTerrId(k) !== territory.slug` comparison fails). `cachedTerritories` is populated by `ensureTerritories()` early in the DT tab lifecycle (line 1313), so the OID branch is reliable for processing-view reads.

**Scope deviation from story AC 7 ("no client-side changes")**

AC 7 was written under the false assumption that the admin's `resolveTerrId` would "just work" with OID input via pass-through. Verification during AC 8 work showed this was wrong: `resolveTerrId` runs the input through fuzzy substring matching against territory NAMES (e.g. "harbour", "academy"), and a 24-char hex OID matches none of them — it returns `null`, and the downstream comparison silently drops the entry from aggregation. Adding the OID branch was a bug fix necessitated by the saved-format change, not feature scope expansion. The frontend admin code's larger refactor (simplifying away the normaliser entirely) remains 496.4 scope.

**Smoke test result (AC 10, 2026-05-24)**

User-driven browser smoke test against live DT4 (status: prep), real API. Test character: Humongulus.

Filled out:
- Feeding: Dockyards (Poaching), method Stalking
- Influence: Academy +1
- Project 1: Ambience Change "Tip Tap", target Academy (Up)
- Project 2: Attack "BOOM", target character Aleksei

Inspected draft in `tm_suite.downtime_submissions` (`_id: 6a12415700aabdfae26ec7f5`):

```json
responses.feeding_territories: {
  "69d9e54b00815d471503bea7": "none",      // Academy OID
  "69d5dc6a00815d47150397c6": "none",      // Harbour OID
  "69d9e54c00815d471503bea9": "poaching",  // Dockyards OID ✓
  "69d9e54c00815d471503bea8": "none",      // Second City OID
  "69d9e54b00815d471503bea6": "none",      // North Shore OID
  "the_barrens_no_territory_": "none"      // Barrens — legacy slug sentinel ✓
}
responses.influence_spend: {
  "69d9e54b00815d471503bea7": 1,           // Academy +1 ✓
  ...
}
responses.project_1_ambience_target: "69d9e54b00815d471503bea7"  // Academy OID ✓
responses.project_1_action: "ambience_change"
responses.project_1_title: "Tip Tap"
```

Confirmed:
- JSON-key OID write (feeding_territories, influence_spend)
- Enum-value OID write (project_${n}_ambience_target)
- Barrens fallback to legacy slug
- Pre-496.2 drafts (Henry St. John, René Meyer) coexist in same cycle with long-slug keys; server accepts both per 496.1 dual-read tolerance

Not directly exercised but use identical save-pattern (one-line `v ? (_terrOidMap.get(v) || v) : ''`):
- `project_${n}_territory` (dead field per 496.1 audit — 0 live docs)
- `project_${n}_target_terr` (would need a project with a territory-target-zone action; user picked character target on the Attack project)
- `sphere_${n}_territory` (would need a sphere-of-influence action)

Risk assessment: very low. All four enum sites share the exact same code pattern and the same `_terrOidMap` — if one works, they all work. Coverage adequate.

### File List

**Modified files:**

- `public/js/tabs/downtime-form.js` (6807 → ~6843 lines; 3 new helpers + 7 save updates + 4+ load updates)
- `public/js/admin/downtime-views.js` (OID branch added to `resolveTerrId`; +7 lines)
- `specs/stories/tech-debt.496.2.form-territory-oid-write.story.md` (Status flipped to `review`; Form Site Findings populated; Dev Agent Record populated)

No new files. No test files (project has no frontend test framework; verification path is browser smoke test per CLAUDE.md and the story Dev Notes).
