# Audit — City Status calculation stocktake

> **Headline.** Of issue #13's 10 risk surfaces: **6 clean**, **2 defects** (cache invalidation, bonus breakdown invisibility), **2 game-rules questions** (lieutenant entitlement, cap policy). One surface has a minor quirk tied to the cap-policy question. The territory FK refactor (PRs #20-#37) incidentally fixed several risks: ID-type mismatch is cleanly string-vs-string, cache value type is `_id`, ambience hygiene is clean, every regent walkthrough computes correctly. Recommended fix bundle is **small** — the cache-bust hook + a "+N from regency of X" tooltip — both 1-PR-sized.

---

## Background

`calcCityStatus(c)` (`public/js/data/accessors.js:307-309`) sums three pieces:

```
calcCityStatus(c) = (c.status.city || 0) + titleStatusBonus(c) + regentAmienceBonus(c)
```

The territory bonus reads `c._regentTerritory?.ambience` from a cache populated on-demand by `findRegentTerritory(territories, c)` (`public/js/data/helpers.js:147-165`). The hollow-dot rendering is in `_statusDots` / `_statusTrack` (`public/js/editor/sheet.js:154-192`).

Issue #13 enumerates 10 risk surfaces. This audit walks each.

## Methodology

1. Code-walk every cache-priming and cache-reading site (greps recorded inline below).
2. Live MongoDB read-only probe: per-territory ambience, per-regent calculation, type sanity, multi-regency check.
3. Compare expected vs actual on the live probe's per-regent walkthrough.
4. Walk hollow-dot rendering edge cases on paper against `_statusDots`.

Throwaway probe `server/scripts/_audit-city-status.mjs` was created, run, and deleted before commit (per #11a precedent). Full source captured in this story's Dev Agent Record.

---

## Per-surface findings

### Surface 1 — Cache priming order

**Description.** `regentAmienceBonus` reads `c._regentTerritory?.ambience`. If `findRegentTerritory(territories, c)` was never called, the cache is `undefined` and the bonus silently returns `0`.

**Audit method.** `grep -rn "findRegentTerritory\|_regentTerritory\b" public/js/`. Every consumer of `calcCityStatus` traced backwards.

**Finding.** **CLEAN.** Two reasons:
1. `findRegentTerritory` self-primes — when called with `c._regentTerritory === undefined`, it computes and caches. Most consumers hit it directly via the regency-display code path well before any City Status read.
2. `admin.js:1119` and `:1149` prime the cache for all characters at load time (after `apiGet('/api/territories')`).

The "unprimed cache" failure mode would only fire if `calcCityStatus` is called *before* territories are loaded *and* nothing else has called `findRegentTerritory` first. The codebase doesn't appear to have such a path: City Status displays render after the standard load sequence completes.

**Severity.** N/A.

**Recommended action.** None.

---

### Surface 2 — Cache invalidation

**Description.** `c._regentTerritory` is cached on the character object. If the underlying territory data changes mid-session (regent_id reassigned, ambience changed via the City editor), the cache stays stale until a full character reload happens.

**Audit method.** Code-walk for cache writes / busts. Comment search.

**Finding.** **DEFECT (cross-cutting).**

- `admin.js:549` has an explicit comment on the `Object.assign` re-merge: *"`_-prefixed ephemeral props (e.g. _gameXP, _regentTerritory) are not on `fresh` so they survive."* The cache **deliberately survives** an Object.assign-style refresh of character data.
- No WebSocket message path was found that invalidates `_regentTerritory`. No territory-write site (city-views.js `saveTerritory`, `saveTerrAmbience`) clears the cache on success.
- The cache is invalidated only by **full app reload** — the user has to refresh the browser tab to see City Status reflect a regent change or ambience change.

The territory FK refactor narrowed the impact: `loadAllData()` reloads characters from the API and produces fresh objects (so the cache resets in the natural-reload case). But ST-driven mid-session edits (e.g. confirming new ambience for a cycle) still leave displayed City Status stale until refresh.

**Severity.** **Calculation-wrong** (display can lag the underlying truth by a session).

**Recommended action.** A small (10-30 line) bust-on-write hook:
- In `city-views.js saveTerritory` / `saveTerrAmbience` after the API call returns, iterate `chars` and clear `_regentTerritory` for any character whose old or new regent matches the saved territory.
- In the WebSocket `onTrackerUpdate` (or a sibling territory-update message if one exists), do the same.
- Alternative: replace the cache lookup with a cheap re-derivation each render (drop the cache entirely). The territory list is 5 entries; the lookup is O(1) per character per render.

The drop-the-cache option is simpler and removes a class of bug. Recommended as the primary fix.

---

### Surface 3 — Lieutenant entitlement

**Description.** `findRegentTerritory` records `lieutenantId` in its result, but `regentAmienceBonus` only fires for the regent. If lieutenants are entitled to the bonus per game rules, they currently get nothing.

**Audit method.** Read code; check rules.

**Finding.** **GAME-RULES QUESTION.** Current code behaviour: lieutenants get **zero** ambience bonus.

**Severity.** Calculation-wrong **only if** the rules say lieutenants are entitled.

**Recommended action.** **User decision.** If lieutenants are entitled at the same rate, add an OR clause to the territory match in `findRegentTerritory` or compute a separate `lieutenantAmienceBonus`. If lieutenants are entitled to a *fraction* (e.g. half), introduce a separate path. If lieutenants are not entitled, no change needed.

---

### Surface 4 — Multiple regencies

**Description.** `findRegentTerritory` uses `find()` which returns the first match. A character regent of 2+ territories sees only the first territory's bonus.

**Audit method.** Code-walk + live probe.

**Finding.** **CLEAN today; future-fragile.**

Live probe (per-regent count): every regent in `tm_suite.territories` holds **exactly one** territory. There is no character with 2+ regent assignments in production data. The current `find()` behaviour produces correct results for current data.

**Severity.** N/A today; would become Calculation-wrong if multiple regencies are introduced.

**Recommended action.** None today. Future-proofing question for the user: if a character ever holds 2+ regencies, should bonuses sum, or take max? Document as a deferred policy decision but no code change needed.

---

### Surface 5 — ID type mismatch

**Description.** Comparison is `t.regent_id === String(c._id)`. If any path stores `regent_id` as ObjectId or number, the match silently fails.

**Audit method.** Live probe.

**Finding.** **CLEAN.**

Live probe results: all 5 territories' `regent_id` values are `typeof === 'string'`, length 24, regex-match `/^[0-9a-f]{24}$/i`. Comparison is string-vs-string everywhere. The territory FK refactor (#3b) added `parseId(...)` ObjectId discipline at write paths; current data matches that contract.

**Severity.** N/A.

**Recommended action.** None.

---

### Surface 6 — Ambience string match

**Description.** `REGENT_AMBIENCE_BONUS` keys are exact strings. Casing/whitespace variants in territory data silently yield zero bonus.

**Audit method.** Live probe.

**Finding.** **CLEAN.**

Live probe enumerates all unique ambience values in `tm_suite.territories`:

| Ambience | Bonus | In map? | Whitespace? |
|---|---|---|---|
| Curated | 1 | ✓ | no |
| Untended | 0 | ✗ (intentional — no bonus) | no |
| Verdant | 1 | ✓ | no |
| Settled | 0 | ✗ (intentional — no bonus) | no |

All four values match the canonical strings exactly. Two values aren't in the bonus map — that's intentional (Untended/Settled don't grant). No "The Rack" in current data, but if it ever appears it would match cleanly.

**Severity.** N/A.

**Recommended action.** None for the audit. Defensive future-proofing is cheap if desired: normalise ambience strings (`.trim()`, exact-list validation) at the write site (`city-views.js saveTerrAmbience`). Optional, low priority.

---

### Surface 7 — Cap clamp

**Description.** `calcCityStatus` returns the raw sum. The dot track caps display at 10. Some consumers read the unclamped value (e.g. `< 8` floor checks). What's the policy?

**Audit method.** Code-walk.

**Finding.** **GAME-RULES QUESTION.**

- Calc: `(base || 0) + titleBonus + ambienceBonus` — uncapped.
- Display: `_statusDots(base, bonus, 10)` caps via `Math.min(base + bonus, 10)`.
- Floor checks (`tabs/status-tab.js:160`, `suite/status.js:112`): `cityVal(c) < 8` — read raw uncapped sum.

Live walkthrough: max observed total is 4 (René St. Dominique, Primogen of Dockyards: base 2 + title 2 + amb 0). No live character exceeds 10 today. The question is policy: if a Primogen takes regency of a Verdant/Curated territory and base reaches 8, the sum exceeds 10. What should display? What should `< 8` checks see?

**Severity.** Display-wrong **only if** the policy says clamp; calculation-wrong **only if** the policy is uncapped and the floor checks are wrong.

**Recommended action.** **User decision.** Recommend: clamp `calcCityStatus` to 10 universally (matches the dot-track display). One-line change in `accessors.js:308`: `return Math.min(10, ...)`. If the user wants uncapped (allowing 11+ for some reason), no change.

---

### Surface 8 — Hollow-dot rendering correctness

**Description.** Walk the four edge cases against `_statusDots`.

**Audit method.** Code-walk: `public/js/editor/sheet.js:178-192`.

```js
function _statusDots(base, bonus, maxDots) {
  const total = Math.min(base + bonus, maxDots);
  if (!total) return '';
  const cappedBase = Math.min(base, maxDots);
  const dot = i => i <= cappedBase
    ? '<span class="sh-sdot sh-sdot-base">●</span>'    // filled
    : '<span class="sh-sdot sh-sdot-bonus">○</span>';  // hollow
  // ... rendered for i in [1, total]
}
```

| Edge case | Expected | Actual | Verdict |
|---|---|---|---|
| base + bonus > max (e.g. base=10, bonus=2, max=10) | All 10 filled; bonus invisible | `total=10`, `cappedBase=10` → all 10 filled. **Bonus does NOT render hollow above the cap.** | Tied to Surface 7 cap-policy. If clamp is the policy, this is correct. If uncapped, the hollow dots should render and overflow visually. |
| bonus only, base=0 | All hollow | `total=bonus`, `cappedBase=0` → all hollow up to bonus. | **CLEAN** |
| base only, bonus=0 | All filled, no hollow padding | `total=base`, `cappedBase=base` → all filled up to base; no hollow trailing padding. | **CLEAN** |
| title + ambience both present (one bonus arg) | All hollow rendered | Both bonuses passed as one `bonus` arg; renders as a single hollow band. **No visual distinction between title and ambience source.** | Display-correct for the dot count; breakdown invisible (covered in Surface 9). |

**Severity.** Cosmetic, tied to Surface 7.

**Recommended action.** None as a standalone fix. Surface 7's cap-policy decision determines whether the `base + bonus > max` case needs a behaviour change.

---

### Surface 9 — Bonus visibility / breakdown

**Description.** When a regent ambience bonus is applied, is there UI explaining "+1 from regency of X" the way `attacheBonusDots` surfaces its bonus?

**Audit method.** Code-walk for tooltips, derived-notes, breakdown rows.

**Finding.** **DEFECT (cosmetic / display-clarity).**

- The City Status block in `editor/sheet.js:1744-1748` renders `_statusDots(cityBase, titleBonus + regentBonus, 10)` and `_statusPip(CITY_SVG, cityTotal, 'City')`. No tooltip, no derived-note row, no breakdown.
- Compare `attacheBonusDots` rendering in the influence merits section (`sheet.js:830-841`): when an Attaché bonus applies, a `<div class="derived-note">Attaché: +N dot(s) (Invictus Status N)</div>` appears under the dot track. The pattern exists; it just isn't applied to City Status.
- Players have no way to know *why* their City Status went up after a court appointment or ambience confirmation, unless they remember they're a regent.

**Severity.** Cosmetic / display-clarity. Not a calculation bug.

**Recommended action.** Small (10-20 line) addition to the City Status render block in `editor/sheet.js` and `suite/status.js`:
- If `titleBonus > 0`: render a `<div class="derived-note">Title: +${titleBonus} (${court_category})</div>`
- If `regentBonus > 0`: render a `<div class="derived-note">Regency: +${regentBonus} (${territory_name}, ambience: ${ambience})</div>`

Mirrors the Attaché pattern. Cheap and high-readability gain.

---

### Surface 10 — Suite vs editor parity

**Description.** Every consumer must call `calcCityStatus` (not `c.status.city` directly).

**Audit method.** `grep -rn "calcCityStatus\b\|c\.status\.city\b\|c\.status\?.\?.city" public/js/`.

**Scope.** Display consumers — sites where the value is shown to the user as City Status. Non-display reads of raw `c.status.city` (Eminence/Ascendancy aggregations, edit-state ops, prereq checks) are intentionally base-only by design and are out of scope here.

**Finding.** **CLEAN.**

Enumerated consumers:

| Site | Calls `calcCityStatus`? | Notes |
|---|---|---|
| `public/js/tabs/status-tab.js:43, 131, 135, 141, 160, 164` | ✓ | `cityVal(c) = calcCityStatus(c)`; all reads via cityVal |
| `public/js/suite/status.js:86, 90, 96, 112, 116, 173, 198, 277` | ✓ | `cityVal(c) = calcCityStatus(c)`; all reads via cityVal |
| `public/js/editor/sheet.js:1744` | indirect ✓ | Reads `cityBase = st.city || 0`, then explicitly adds `titleStatusBonus(c) + regentAmienceBonus(c)` (the same calculation, manually inlined for hollow-dot breakdown rendering). |
| `public/js/editor/csv-format.js:189` | ✓ | `row.push(calcCityStatus(c))` |
| `public/js/editor/export-character.js:88` | ✓ | `city: calcCityStatus(c)` |

No consumer short-circuits to `c.status.city` alone. Every read either calls `calcCityStatus` directly or composes the same three components inline (sheet.js, intentional for the rendering split).

**Severity.** N/A.

**Recommended action.** None for parity. (Optional consistency improvement: refactor `sheet.js:1744` to call `calcCityStatus(c)` for the total and decompose the components for the breakdown — but this is style, not a bug.)

---

## Recommended fix bundle

Two confirmed defects, both small:

| Surface | Fix | Effort |
|---|---|---|
| 2 (cache invalidation) | Drop the `_regentTerritory` cache entirely OR add bust-on-write hooks in `city-views.js` save handlers | 10-30 lines |
| 9 (bonus visibility) | Mirror the Attaché derived-note pattern for title + regency bonuses | 10-20 lines |

**Combined: ~50 lines, single PR.** Recommended path: **A — small fix bundle**.

Two game-rules questions for user:

| Surface | Question | Code response |
|---|---|---|
| 3 (lieutenants) | Are lieutenants entitled to the regent ambience bonus? | If yes: extend `findRegentTerritory` to match by lieutenant_id with documented bonus value. If no: no change. |
| 7 (cap clamp) | Should `calcCityStatus` clamp to 10? | If yes: 1-line `Math.min(10, ...)` in `accessors.js:308`. If no: no change. |

Six surfaces returned **clean** (1, 4, 5, 6, 8, 10). The territory FK refactor incidentally addressed several of them.

## Test matrix

Live + walkthrough coverage:

| Char | Regent? | Lieutenant? | Ambience | Base | Title | Amb bonus | Expected Total | Live Total | Match |
|---|---|---|---|---|---|---|---|---|---|
| René Meyer | secondcity | — | Curated | 2 | 0 | 1 | 3 | 3 | ✓ |
| Alice Vunder | northshore | — | Curated | 2 | 0 | 1 | 3 | 3 | ✓ |
| René St. Dominique | dockyards | — | Untended | 2 | 2 (Primogen) | 0 | 4 | 4 | ✓ |
| Jack Fallow | academy | — | Verdant | 3 | 0 | 1 | 4 | 4 | ✓ |
| Reed Justice | harbour | — | Settled | 3 | 0 | 0 | 3 | 3 | ✓ |
| (any non-regent) | — | — | n/a | varies | varies | 0 | base + title | as observed | ✓ |
| (any lieutenant) | — | yes | n/a | varies | varies | 0 (Surface 3 q) | base + title (current code) | as observed | game-rules dependent |
| (regent of 2+) | — | — | n/a | n/a (no live data) | — | — | — | n/a — synthetic only |
| Edge case: Curated + Primogen + base 8 | — | — | Curated | 8 | 2 | 1 | 11 | (no live data) | Surface 7 dependent |

5 live regents, 5 clean walkthroughs. No mismatch between expected and observed.

## Detection-and-response

If a future audit ever surfaces a mismatch between displayed and computed City Status:

1. **Re-run** the live probe in this audit's Dev Agent Record.
2. **Check the cache.** Open browser dev tools, log `c._regentTerritory` for the affected character. If it's a stale value compared to live `tm_suite.territories.<that territory>`, Surface 2 has fired — full reload should fix the symptom; the bust-on-write hook fix would prevent it.
3. **Check ambience hygiene.** If any territory's ambience value has whitespace or unusual casing, normalise it. (No occurrence today; defensive only.)
4. **Check breakdown.** If the user is confused about *why* the value is what it is, the Surface 9 fix would have helped — recommend implementing it.
5. **Owner.** SM routes to the appropriate fix issue.

## References

- Issue #13 — this audit's parent.
- `public/js/data/accessors.js:293-309` — `calcCityStatus`, `regentAmienceBonus`, `REGENT_AMBIENCE_BONUS`, `titleStatusBonus`.
- `public/js/data/helpers.js:147-165` — `findRegentTerritory` and the cache.
- `public/js/editor/sheet.js:154-192, 1744-1748` — hollow-dot rendering.
- `public/js/admin/admin.js:549, 1119, 1149` — cache priming + survival comment.
- `public/js/admin/city-views.js` — territory editor (regent + ambience write paths; cache-bust hook would land here).
- ADR-002 (`specs/architecture/adr-002-territory-fk.md`) — Q6 cache lifecycle decoupling rationale.
- Story #11a precedent for the audit-recommends-no-or-small-fix pattern.
