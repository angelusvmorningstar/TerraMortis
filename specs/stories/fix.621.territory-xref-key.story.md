# Story Fix.621: Territory cross-reference callout — canonical key lookup

## Status: review

## Metadata
- issue: 621
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/621
- branch: morningstar-issue-621-territory-xref-key
- type: bug fix (product code — not test-only)
- found_by: fix.617 (DTX-1 territory-xref tests, deferred pointing here)

---

## Story

**As an** ST processing downtimes,
**I want** the "Also in <territory>: <other character>" cross-reference callout to appear on action cards in a shared territory,
**so that** I can see at a glance who else is acting in the same place — intelligence the suite currently drops silently.

---

## Background

`public/js/admin/downtime-views.js` builds a cross-reference index once per render and reads it back in the action-card detail to render the callout. The index is keyed **canonically**, but one of the two card-render paths reads it back with the **raw** territory string, so the lookup never matches when territories are loaded.

### The divergence (confirmed)

**Index build (~`:4669-4684`)** — canonical keys:
```js
_xrefIndex = new Map();
for (const e of queue) {
  if (e.projTerritory) {
    const canon = resolveTerrId(e.projTerritory) || e.projTerritory;   // canonical
    const k = `terr:${canon}`;
    ... _xrefIndex.get(k).push({ charName: e.charName, label: e.label, phase: e.phase });
  }
  if (e.feedTerrs) {
    for (const terr of Object.keys(e.feedTerrs)) {
      const canon = resolveTerrId(terr) || terr;                        // canonical
      const k = `terr:${canon}`;
      ... push({ charName, label: 'Feeding', phase });
    }
  }
  if (e.actionType === 'investigate') { ... key `inv-target:${target}` ... }   // raw both sides — fine
}
```

**Block A — the bug (~`:9165-9185`)** — raw lookup:
```js
// ── XRef callout ──
{
  const xrefLines = [];
  if (entry.projTerritory && entry.actionType !== 'ambience_change') {
    const others = (_xrefIndex.get(`terr:${entry.projTerritory}`) || [])   // RAW — never matches canonical index
      .filter(r => r.charName !== entry.charName);
    if (others.length) xrefLines.push(`Also in ${entry.projTerritory}: ...`);
  }
  if (entry.actionType === 'investigate' && rev.investigate_target_char) { ... }   // inv-target: raw — fine
  if (xrefLines.length) { h += `<div class="proc-xref-callout">` ... }
}
```

**Block B — the correct pattern (~`:9948-9989`)**, fixed in the 496.2 QA pass:
```js
if (entry.projTerritory) {
  const projCanon = resolveTerrId(entry.projTerritory) || entry.projTerritory;   // canonical
  const projDisplay = (cachedTerritories || []).find(t => t.slug === projCanon)?.name
                   || TERRITORY_DATA.find(t => t.slug === projCanon)?.name
                   || entry.projTerritory;                                        // display name
  const others = (_xrefIndex.get(`terr:${projCanon}`) || []).filter(r => r.charName !== entry.charName);
  if (others.length) xrefLines.push(`Also in ${projDisplay}: ${others.map(r => `${r.charName} (${r.label})`).join(', ')}`);
}
```

`resolveTerrId` canonicalises against `TERRITORY_DATA` (e.g. `'North Shore'` → `'north_shore'`), so the index holds `terr:north_shore` while Block A queries `terr:North Shore` → **no match → callout silently never renders** on the Block-A card path (used by patrol/scout projects and feeding actions). Target-based xref (`inv-target:`) is unaffected — same raw key on both sides.

### Why it matters
STs lose cross-reference intelligence (who else is in this territory) on the affected cards in production — territories are always loaded there, so the keys always diverge. This is a real regression, not a stale test.

---

## Acceptance Criteria

- [x] **AC1** — The project-territory xref callout in Block A (`:9169`) uses the **canonical** key (`resolveTerrId(entry.projTerritory) || entry.projTerritory`), mirroring Block B. The displayed text resolves to the territory **display name** (like Block B), not an OID/slug.
- [x] **AC2** — The **feeding-action** territory xref renders too (the `feeding action with shared territory shows xref callout` test). Investigate whether the feeding card reaches Block A at all — feeding entries are indexed via `e.feedTerrs` (`:4677`), but Block A only checks `entry.projTerritory`. If the feeding card has no territory-xref lookup (or the wrong key), add/fix it using the canonical key against the feeding entry's territory.
- [x] **AC3** — Both DTX-1 territory-xref tests un-skipped (`test.fixme` + the `// fix.617 DEFERRED ... #621` note removed) and **green**.
- [x] **AC4** — No regression: target-based xref (`inv-target:`), the sibling Block B path, and the `ambience_change` guard (`:9168`) all unchanged in behaviour. The full `downtime-processing-dt-fixes.spec.js` suite stays green.

---

## Tasks

### Task 1 — Fix the project-territory lookup in Block A (`downtime-views.js:9168-9171`)
Replace the raw lookup with the canonical pattern from Block B:
```js
if (entry.projTerritory && entry.actionType !== 'ambience_change') {
  const projCanon = resolveTerrId(entry.projTerritory) || entry.projTerritory;
  const projDisplay = (cachedTerritories || []).find(t => t.slug === projCanon)?.name
                   || TERRITORY_DATA.find(t => t.slug === projCanon)?.name
                   || entry.projTerritory;
  const others = (_xrefIndex.get(`terr:${projCanon}`) || []).filter(r => r.charName !== entry.charName);
  if (others.length) xrefLines.push(`Also in ${projDisplay}: ${others.map(r => `${r.charName} (${r.label})`).join(', ')}`);
}
```
Keep the `ambience_change` guard. Confirm `cachedTerritories` / `TERRITORY_DATA` are in scope at this point (they are in Block B; verify the same names are accessible in Block A's function — if not, fall back to `entry.projTerritory` for display, which still satisfies the test that asserts the raw name 'North Shore').

### Task 2 — Make the feeding-action territory xref render (AC2)
The `feeding action with shared territory shows xref callout` test fails the same way. First **diagnose**: open the feeding card's render path and check whether it has any `terr:` xref lookup. Feeding entries are indexed under `terr:<canon>` from `e.feedTerrs` (`:4677`), but Block A keys off `entry.projTerritory` which a feeding entry won't have. Determine the feeding entry's territory source (e.g. `feedTerrs` keys, or `feeding_review`/`responses` feeding territory) and render an "Also in <territory>" callout for feeding using the **canonical** key. Reuse the same `proc-xref-callout`/`proc-xref-line` markup. If the feeding xref belongs in a shared helper, factor minimally — do not refactor the whole callout.

### Task 3 — Un-skip the two DTX-1 territory-xref tests
In `tests/downtime-processing-dt-fixes.spec.js`, the DTX-1 describe has:
- `test.fixme('project action with shared territory shows xref callout naming the other character', ...)`
- `test.fixme('feeding action with shared territory shows xref callout', ...)`

Remove `test.fixme` → `test` and delete the `// fix.617 DEFERRED — ... #621` comment above each. The assertions (callout visible, contains 'North Shore' + 'Non Submitter') are already correct — do not change them.

### Task 4 — Verify
Run one persistent server, then the spec:
```
npx http-server public -p 8080 -s        # ONE server; never run concurrent Playwright (see memory)
npx playwright test tests/downtime-processing-dt-fixes.spec.js --reporter=line --workers=4
```
Expect both DTX-1 territory tests green and the rest of the suite unchanged (the 3 passing sibling xref tests must still pass, and DTS-2 duplicate stays `test.fixme`). Record the tally in the Dev Agent Record.

---

## Dev Notes

### Files
- `public/js/admin/downtime-views.js` — UPDATE. Block A xref render ~`:9165-9185` (the fix); index build ~`:4669-4684`; Block B reference pattern ~`:9948-9989`. `resolveTerrId` canonicalises via `TERRITORY_DATA`/`cachedTerritories`.
- `tests/downtime-processing-dt-fixes.spec.js` — UPDATE. DTX-1 describe (un-skip 2 tests). Fixtures: `SUBMISSION_PROJ_TERR_CHARLIE`/`_NS` (patrol_scout, `project_1_territory: 'North Shore'`) and the feeding pair `SUBMISSION_FEED_CHARLIE`/`_NS`.

### What must be preserved
- Block B (`:9961`) is already correct — **do not touch it**; the two paths render on different card variants.
- Target-based xref (`inv-target:`) and the hide/protect note — unchanged (raw key on both sides, working).
- The `ambience_change` exclusion at `:9168`.

### Why two render paths exist
There are two card-render variants with near-duplicate xref blocks (A at `:9167`, B at `:9948`). 496.2 fixed B for OID/slug normalisation but missed A. A deeper cleanup (single shared xref helper) is tempting but **out of scope** — this story fixes the bug with minimal change. If you factor a helper, keep it to the xref block only and verify both paths + all DTX-1 tests.

### Testing infra (from memory)
- **Never run concurrent Playwright processes** — they share the one port-8080 `http-server`; a second run tears it down mid-suite → fake `ERR_CONNECTION_REFUSED`. One persistent server.
- `dt-fixes` uses `local-test-token`, cycle `status: 'active'`. Territories API returns `[]` in-test, but `resolveTerrId` still canonicalises via the baked-in `TERRITORY_DATA` constant — which is exactly why the raw-vs-canonical mismatch reproduces in tests.
- **dev proxies `/api/*` to prod**, so product changes aren't live-testable on `dev` until `main`; verify via the Playwright specs, not a dev smoke check.

### Scope guard
Product change is confined to the Block-A xref render (and the feeding xref). No schema, endpoint, or data changes. Test change is un-skipping 2 existing tests.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Debug Log References
- `dt-fixes.spec.js` after Task 1+2+3: **1 failed** — the project DTX-1 test timed out clicking a non-existent `support` filter pill (the fix.614 conversion mislabelled patrol_scout as "Support"; it's phase 9 = Patrol). Not an xref issue.
- After the navigation fix (`openFirstAction 'Support' -> 'Patrol'`): **53 pass / 1 skip / 0 fail** — both DTX-1 territory tests green.
- Regression (other DT specs: reference, consistency, feature312, admin-smoke, fix-491): **76 pass / 0 fail.**

### Completion Notes List
- **Task 1 — project path (renderNormalisedCard, Block A `:9168`).** Replaced the raw `terr:${entry.projTerritory}` lookup with the canonical pattern from Block B: `resolveTerrId(...)` for the key + display-name resolve via `cachedTerritories`/`TERRITORY_DATA`. `renderNormalisedCard` is **project-only** (dispatcher `:9229`).
- **Task 2 — feeding path (Block B `:9961`).** Diagnosis: feeding/merit/sorcery cards render via the main function's inline path (where Block B lives); Block B already used the canonical key for `projTerritory`, but **feeding entries have no projTerritory** — they carry `feedTerrs`/`primaryTerr` (entry build `:2966-2967`). Added a feeding branch keyed on `entry.primaryTerr` with the canonical key, mirroring the project branch. This is what made the feeding DTX-1 test pass.
- **Task 3 — un-skipped** both DTX-1 territory tests (removed `test.fixme` + the `#621` DEFERRED notes). Assertions unchanged.
- **Bonus test fix:** the project DTX-1 test navigated to the wrong phase (`'Support'`) — corrected to `'Patrol'` (patrol_scout = phase 9). This was a latent fix.614-conversion bug masked by the `test.fixme`.
- **Untouched:** Block B's `projTerritory` branch, `inv-target:` xref, the `ambience_change` guard, the index build. DTS-2 duplicate stays `test.fixme` (separate harness limit, out of scope).
- **AC5/scope:** product change confined to the two xref render blocks; no schema/endpoint/data. dev proxies /api to prod, so verified via Playwright (not a dev smoke check).

### File List
- public/js/admin/downtime-views.js (Block A project xref → canonical key + display name; Block B + feeding-territory branch)
- tests/downtime-processing-dt-fixes.spec.js (un-skipped 2 DTX-1 territory tests; fixed project test phase nav Support→Patrol)
- specs/stories/fix.621.territory-xref-key.story.md (this story)

### Change Log
- 2026-06-06 — Fixed the territory cross-reference callout: project path now uses the canonical territory key (Block A), and a feeding-territory branch was added (Block B). Both DTX-1 territory tests un-skipped and green; full DT suite 129 pass / 1 skip (DTS-2) / 0 fail; no regression.
