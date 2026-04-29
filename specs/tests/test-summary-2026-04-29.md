# Test Automation Summary — 2026-04-29

**Framework:** Playwright (Chromium)
**Result:** 8 / 8 passed (~11s)
**File:** `tests/dt-vitae-projection.spec.js`

## Context

Today's downtime form changes shipped ad-hoc (no story file). This spec
back-fills E2E coverage for the user-visible behaviour and the merit-rating
calculations behind it.

## Approach

Direct module invocation: each test injects a `#dt-sandbox` div into the page
and calls `renderDowntimeTab(sandbox, char, [])` from `downtime-form.js`. This
bypasses the unified app's character picker / state plumbing and tests the
form unit on its own. All locators are scoped to `#dt-sandbox`.

Why not full app navigation: `player.html` is now a redirect to the unified
`index.html` and the existing `player.spec.js` is broken because of that
unification (pre-existing tech debt). Driving the form through the unified
app's nav requires populating `suiteState.chars`, the dev-fixtures fetch
wrapper interferes with Playwright route mocks, and the chain of waits is
brittle. The sandbox approach is a clean shortcut that still exercises the
real render path.

## Generated Tests

### Three-container layout — `Downtime feeding — three-container layout`
- [x] Feeding section renders main hunt, rote section, and vitae budget containers
- [x] Standard / Rote toggle pills replace the legacy `#dt-feed-rote` checkbox
- [x] Clicking Rote Hunt expands sub-block with its own territory pills, pool selector, and description textarea (placeholder, no label); clicking Standard collapses it

### Vitae projection — `Downtime feeding — vitae projection`
- [x] Empty character: Starting 0 / Net +0 / Projected 0 / 10
- [x] Herd merit (domain) → +N positive mod row (effective rating via `m.rating`)
- [x] Mandragora Garden → −N negative mod row + Blood Fruit count under the projected total
- [x] Oath of Fealty (canonical "of") → +effective Invictus Status
- [x] Oath of Fealty case-insensitive ("Oath Of Fealty" — Charlie's data shape) → still matches

## Coverage Notes

**Covered:**
- Vitae projection layout and copy
- Standard / Rote pill toggle (replacement for the old checkbox)
- Three-container split (`dt-feed-card-wrap` / `dt-feed-rote-section` / `dt-vitae-budget`)
- Rote sub-block render (territory pills, pool selector, description)
- Effective merit rating end-to-end (Herd via `m.rating`, Mandragora cost & fruit)
- Oath of Fealty pact detection (case-insensitive) and Invictus Status read

**Not yet covered (noted for follow-up if regressions appear):**
- Dual territory ambience "best-of" logic — exercising the rote territory ticker actually flipping the projected ambience requires interaction with `data-feed-rote-terr-key` pills, which is a meatier scenario
- Standard / Rote yield formula difference (`⌊2N/3⌋` vs `⌊5N/6⌋`) — requires building a non-zero pool first
- Discipline failure note (`"By adding a Discipline, if this roll fails…"`) — only fires when a discipline is selected in the pool builder
- OTS floor behaviour — `_ots_covenant_bonus` is computed by `applyDerivedMerits`; tests would need the OTS pact pre-baked into char data

## Next Steps

- Run the spec in CI alongside the existing Playwright suite
- Add the deferred scenarios above when those features are exercised by real downtime cycles
- Consider fixing `tests/player.spec.js` separately (pre-existing redirect breakage) — out of scope for today's QA pass
