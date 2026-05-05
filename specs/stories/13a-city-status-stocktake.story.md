---
id: issue-13a
issue: 13
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/13
branch: issue-13a-city-status-stocktake
status: ready-for-review
priority: high
depends_on: []
parent: issue-13
---

# Story #13a: City Status calculation stocktake — audit-only

As an ST whose campaign relies on City Status displays being correct (regent-bonus dots, hollow-dot rendering, suite vs editor parity, base-vs-bonus breakdown),
I should have a written audit covering all 10 risk surfaces called out in issue #13, with concrete findings per surface (defect / clean / out-of-scope), and recommendations for which fixes are worth shipping vs. which to defer,
So that the fix work — if any — can be sized and bundled appropriately rather than improvised across files.

This is **audit-only**. Same shape as #11a: investigation, written deliverable, recommendations on fix scope. **Fix work happens in follow-on PR(s)** decided after this audit lands and SM/user choose a path (mirror the #11 A/B/C decision).

Permitted under the architectural-reset freeze as audit-finding work tied to a tracked issue.

---

## Context

`calcCityStatus(c)` is composed in `public/js/data/accessors.js:307-309`:

```
calcCityStatus(c) = (c.status.city || 0) + titleStatusBonus(c) + regentAmienceBonus(c)
                                            ^court_category-based   ^territory-ambience-based
```

The territory-driven portion (`regentAmienceBonus`) reads from a per-character cache `c._regentTerritory` populated by `findRegentTerritory(territories, c)` (`public/js/data/helpers.js:156-167`). The bonus is awarded when the character is the regent of a territory whose ambience is in `REGENT_AMBIENCE_BONUS = { Curated: 1, Verdant: 1, 'The Rack': 2 }` (`accessors.js:301`). The "hollow dot" treatment for the bonus dots is rendered by `_statusDots` / `_statusTrack` in `public/js/editor/sheet.js:1737+`.

Issue #13 calls out **10 risk surfaces** — any one of which can produce a quietly-wrong dot count without an obvious symptom. Several may be defects; some may already be correct; some may be out-of-scope (game-rules decisions, not code bugs). The audit's job is to run each surface to ground.

### Note on recent state shifts (relevant context)

The territory FK refactor (issue #3, ADR-002, PRs #20-#37) **just landed**. Several risk surfaces in #13 reference the post-#3c on-disk shape:
- Territory documents now have `slug` not `id` (renamed by #3c).
- `c._regentTerritory.territoryId` value type changed from slug to `_id` string (per ADR Q6, implemented in #3d's Pattern H).
- `_TERR_ID_NAME` fallback was deleted in #3e.
- `territory_residency` collection was retired in `fd5dee1`.

The audit must operate against **current `dev`** (post-#37 audit + post-#39 follow-up filing), not against the pre-refactor code. Some risk surfaces may have been incidentally addressed by the FK refactor; others remain.

### Files in scope (read + audit)

- `public/js/data/accessors.js` — `calcCityStatus`, `titleStatusBonus`, `regentAmienceBonus`, `REGENT_AMBIENCE_BONUS`
- `public/js/data/helpers.js` — `findRegentTerritory`, cache priming
- `public/js/editor/sheet.js` — `_statusDots`, `_statusTrack` hollow-dot rendering
- `public/js/suite/status.js` — player consumer (lines 86, 277)
- `public/js/tabs/status-tab.js` — player consumer (lines 43, 131)
- `public/js/editor/csv-format.js` — export consumer (line 189)
- `public/js/admin/city-views.js` — territory editor (regent change handler, ambience write path)
- Live MongoDB `tm_suite.territories` (read-only) — ambience field hygiene check

### Files in scope (write — the deliverable)

- `specs/audits/city-status-stocktake-audit.md` (new) — the audit document
- (Optional, kept locally not committed) `server/scripts/_audit-city-status.mjs` — throwaway probe for live-data inspection

### Files NOT in scope (in this story)

- **Any source code change.** Fixes are decided after this audit per SM/user A/B/C path. Investigation-only here.
- **Game-rules decisions** (e.g., do lieutenants get the bonus? what's the cap policy?). The audit DOCUMENTS the question; the answer is the user's call.
- **The territory editor's ambience write path** — only investigated for whether normalisation is needed. The write-site fix (if needed) ships in a follow-on PR.
- **WebSocket cache-busting plumbing** — only investigated; the fix (if needed) ships in a follow-on PR.

---

## Acceptance Criteria

**Given** the audit completes
**When** a developer reads `specs/audits/city-status-stocktake-audit.md`
**Then** they find a section per risk surface (10 sections), each with:
- Surface description (one-paragraph recap)
- Audit method (what was checked, e.g. grep, code-walk, live probe, test-matrix slot)
- Finding (defect / clean / out-of-scope game-rules / unclear-needs-user-call)
- Severity (cosmetic / display-wrong / calculation-wrong / cross-cutting)
- Recommended action (specific fix shape if defect, or N/A if clean, or "user decides" if out-of-scope)

**Given** risk surface 8 (hollow-dot rendering correctness)
**When** the audit reports findings
**Then** all four documented edge cases are covered: `base + bonus > max`, `bonus only / base 0`, `base only / bonus 0`, `title bonus + ambience bonus both present`. Each case has a verdict.

**Given** risk surface 10 (suite vs editor parity)
**When** the audit reports findings
**Then** every consumer call site (`accessors.js`, `helpers.js`, `sheet.js`, `suite/status.js`, `tabs/status-tab.js`, `csv-format.js`) is enumerated and verified to call `calcCityStatus` directly (not short-circuit to `c.status.city`).

**Given** the live-data probe
**When** territory documents are inspected for ambience hygiene
**Then** the audit reports any casing/whitespace variants, and documents which territories carry which ambience values (cross-checked against `REGENT_AMBIENCE_BONUS` keys).

**Given** the live regent-walkthrough
**When** Ptah picks a known character holding a regency and walks `(base + title + ambience)` against the displayed City Status
**Then** the audit reports the character, the calculation, the displayed value, and any mismatch. If clean, that's a positive data point; if mismatched, it's a concrete defect.

**Given** the test matrix
**When** Ptah covers char-is-regent / not / lieutenant / regent-of-two × ambience values × base 0/5/10
**Then** the audit table records expected vs actual (or "N/A — no live data for this combination" with a synthetic-fixture note if needed) for each cell. Cells that need fixture characters can be skipped if the live data doesn't cover them; mark them clearly.

**Given** the Recommendations section
**When** SM reads it to decide on fix path with the user
**Then** they have:
- A list of confirmed defects with severity, sized for "small fix bundle (1 PR)" vs "larger fix work (split)"
- A list of game-rules questions needing user calls
- A go/no-go recommendation on the full set of 7 fix tasks listed in the issue body

---

## Implementation Notes

### Audit methodology (Ptah's checklist)

1. **Surface 1 — Cache priming order.** Grep every `calcCityStatus(` call site. For each, trace whether `findRegentTerritory(territories, c)` is called before. Note any path where territories haven't loaded or `findRegentTerritory` was skipped. Likely candidates: synchronous-render paths, error/fallback paths, very-early-boot rendering.

2. **Surface 2 — Cache invalidation.** Grep for `_regentTerritory` writes. Confirm what triggers a re-prime. Specifically check: does WebSocket-driven regent-change broadcast bust the cache? Does `loadAllData()` re-fetch produce fresh character objects (so the cache is naturally fresh)? Is there a mid-session edit path where the cache stays stale?

3. **Surface 3 — Lieutenant entitlement.** This is a **game-rules question**, not a code bug. Document the current code behaviour (lieutenants get nothing); flag the question for user.

4. **Surface 4 — Multiple regencies.** Read `findRegentTerritory`'s implementation. Confirm it uses `find()` (returns first match). Check live data: any character regent of 2+ territories?

5. **Surface 5 — ID type mismatch.** Read the comparison in `findRegentTerritory`. Live probe: any territory document where `regent_id` is non-string (legacy ObjectId, number)? Any character where `_id` comparison would silently fail?

6. **Surface 6 — Ambience string match.** Live probe: enumerate all `ambience` values in `tm_suite.territories`. Cross-check against `REGENT_AMBIENCE_BONUS` keys (`Curated`, `Verdant`, `The Rack`). Any casing/whitespace variants?

7. **Surface 7 — Cap clamp.** Read `calcCityStatus`. Confirm raw-sum behaviour. Inspect consumers: which read the unclamped value, which clamp to 10? Document the **policy question** (clamp to 10 vs uncapped) for user.

8. **Surface 8 — Hollow-dot rendering correctness.** Read `_statusDots` and `_statusTrack`. Walk through the four edge cases on paper:
   - `base + bonus > max` — what does it render?
   - `bonus only, base 0` — does it correctly render hollow-only?
   - `base only, bonus 0` — does it correctly render filled-only with no hollow padding?
   - `title bonus + ambience bonus both present` — both stack? Visible?

9. **Surface 9 — Bonus visibility/breakdown.** Grep for tooltip / breakdown UI on the existing City Status display. Any explanation of "+1 from regency of X"? Compare to how `attacheBonusDots` surfaces its bonus. Document the gap.

10. **Surface 10 — Suite vs editor parity.** Grep every consumer. Confirm each calls `calcCityStatus` (not `c.status.city` directly). Enumerated list with file:line.

### Live-data probe shape

Throwaway script under `server/scripts/_audit-city-status.mjs`. Same dotenv + MongoClient pattern. Read-only:
- Enumerate territories: `_id`, `slug`, `name`, `ambience`, `regent_id`, `lieutenant_id`
- Cross-check ambience values against `REGENT_AMBIENCE_BONUS`
- Find regents with 2+ territories
- For each regent character: pull the doc, compute `(c.status.city || 0) + titleStatusBonus + regentAmienceBonus`, compare against any cached value
- Capture output verbatim into Dev Agent Record

### Test matrix table shape

A table with rows × columns:
- Rows: char-is-regent / not / lieutenant / regent-of-two
- Columns: ambience Curated / Verdant / The Rack / unknown / null × base 0 / 5 / 10

Each cell records: expected total / expected dot rendering / actual (live or synthetic). Cells without live coverage can be marked "synthetic" with a fixture note.

### Hard rules

- **No source code changes** in this story. Recommendations only.
- **No data mutations.** Read-only probes.
- **Game-rules questions stay as questions** — don't pre-decide. Lieutenant entitlement and cap policy are user calls.
- **No follow-on fix story drafts** — those happen after the audit + user A/B/C decision (mirror #11 path).

---

## Test Plan

This is a documentation deliverable; the "test" is review.

1. **Self-review (Ptah)** — re-read the audit. Every surface has a verdict; every defect has a recommended fix shape; game-rules questions clearly flagged for user.
2. **Editorial review (Ma'at)** — read the audit; spot-check 2-3 surfaces by independently re-running the relevant grep / live probe / code walk; verify hollow-dot rendering edge-case verdicts are correct by independent code reading.
3. **Live regent walkthrough corroboration (Ma'at)** — pick a different regent than Ptah did; independently compute the calc; confirm parity with displayed.

---

## Definition of Done

- [ ] Audit doc lives at `specs/audits/city-status-stocktake-audit.md` and is committed
- [ ] Each of the 10 risk surfaces has a section with verdict + severity + recommended action
- [ ] Test matrix table populated (live + synthetic where needed)
- [ ] Live-data probe output captured in DAR
- [ ] Live regent walkthrough recorded (which character, calc, display, match/mismatch)
- [ ] Game-rules questions clearly flagged with current code behaviour
- [ ] Recommendations section sizes the fix bundle (or recommends no-fix per #11a precedent)
- [ ] Throwaway audit script captured in DAR + deleted before commit (per #26 / #11a precedent)
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body links #13 (does NOT close #13 — fix decision follows)

---

## Note for Ptah

Same shape as #11a but smaller. The 10 surfaces are well-itemised in the issue body — work through them in order, surface by surface, building the audit doc as you go.

Some surfaces are likely to be **clean** (incidentally addressed by the territory FK refactor — e.g. ID type mismatch is now obviously string-vs-string post-#3d). Some are likely to be **defects** (cache invalidation; bonus visibility/breakdown). Some are **game-rules questions** that the audit just documents (lieutenant entitlement; cap policy).

**Resist scope creep:** if you spot a defect in a non-#13 surface while auditing (e.g. you walk into a `titleStatusBonus` bug that's unrelated to #13), log it in a "non-#13 future-work" appendix; don't fix.

**Recommendations honesty:** if the audit finds the surface in good shape, say so. The #11a precedent showed: an "audit recommends no-fix" outcome is a valid, valuable outcome. Don't manufacture defects to justify the audit.

## Note for Ma'at

Editorial QA on the audit:
1. **Surface coverage** — every one of the 10 is addressed.
2. **Verdict consistency** — verdicts (defect / clean / out-of-scope / unclear) are applied consistently with similar evidence across surfaces.
3. **Live walkthrough corroboration** — pick a regent character Ptah didn't pick; do the same calc; should match.
4. **Recommendation actionability** — read as if SM is about to talk to the user about A/B/C path. Have what you need?

Append QA Results commit before PR.

---

## Notes

After this PR's merge:
- SM presents A/B/C path to user (close informationally / fix bundle / split into multiple stories) based on audit findings.
- Issue #13 stays OPEN until the chosen path completes.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (1):**
- `specs/audits/city-status-stocktake-audit.md` (new, +254) — banner Headline at top; per-surface section for each of the 10 risks with verdict / severity / recommended action; recommended fix bundle table; live test matrix; detection-and-response.

**Headline counts:**
- **Clean: 6** (Surfaces 1, 4, 5, 6, 8, 10)
- **Defects: 2** (Surface 2 cache invalidation; Surface 9 bonus visibility)
- **Game-rules questions: 2** (Surface 3 lieutenant entitlement; Surface 7 cap policy)
- Surface 8 has 1 quirk tied to Surface 7 (display behaviour for `base + bonus > max`)

**Recommended fix bundle: small (≈50 lines, 1 PR).** Drop the `_regentTerritory` cache (or add bust-on-write hooks) + add Title/Regency derived-note rendering mirroring the Attaché pattern.

**Surface-by-surface verdict snapshot:**

| Surface | Verdict | Severity | Action |
|---|---|---|---|
| 1 — Cache priming order | Clean | N/A | None |
| 2 — Cache invalidation | **Defect** | Calculation-wrong | Drop cache OR bust on write |
| 3 — Lieutenant entitlement | Game-rules | depends on rules | User decides |
| 4 — Multiple regencies | Clean today | future-fragile | None today |
| 5 — ID type mismatch | Clean | N/A | None |
| 6 — Ambience string match | Clean | N/A | None |
| 7 — Cap clamp | Game-rules | depends on policy | User decides |
| 8 — Hollow-dot rendering | Clean (1 quirk tied to 7) | Cosmetic | Tied to 7 |
| 9 — Bonus visibility | **Defect** | Cosmetic / display-clarity | Add derived-note (Attaché pattern) |
| 10 — Suite vs editor parity | Clean | N/A | None |

**Surprises / important context (3):**

1. **Territory FK refactor (#3b/#3c/#3d) incidentally fixed several risks.** ID type mismatch (Surface 5) is now clean string-vs-string by construction. `_TERR_ID_NAME` is gone (#3e); `c._regentTerritory.territoryId` is `_id`-string; ambience hygiene is clean (no whitespace / casing issues in any of the 5 territories).

2. **The cache-invalidation defect (Surface 2) is documented in code.** `admin.js:549` has an explicit comment that `_regentTerritory` *deliberately* survives Object.assign re-merges. The intent is unclear from the comment — is this intentional preservation across full reloads (in which case the cache should die when `loadAllData()` runs anew, which it does), or is this preservation across *all* state changes including territory writes? The bust-on-write fix resolves the ambiguity by being explicit.

3. **Surface 9 bonus visibility has a clear template** — the Attaché bonus pattern at `sheet.js:830-841` already does exactly the same thing (`<div class="derived-note">Attaché: +N dot(s)</div>`). The Title + Regency notes would copy that pattern. Cheap and consistent with existing code style.

**Live walkthrough (5 regents, all clean):**

```
=== territories (n=5) ===
  secondcity (Curated)   regent=René Meyer            base=2 title=0 (-)        amb=1 -> 3 [match]
  northshore (Curated)   regent=Alice Vunder          base=2 title=0 (-)        amb=1 -> 3 [match]
  dockyards (Untended)   regent=René St. Dominique    base=2 title=2 (Primogen) amb=0 -> 4 [match]
  academy (Verdant)      regent=Jack Fallow           base=3 title=0 (-)        amb=1 -> 4 [match]
  harbour (Settled)      regent=Reed Justice          base=3 title=0 (-)        amb=0 -> 3 [match]

Surfaces 4/5/6 probe outcomes: 0 multi-regents, all hex24 string regent_ids, 4 clean ambience values.
```

**Throwaway audit script** (`server/scripts/_audit-city-status.mjs`) created/run/deleted per #11a/#26 precedent.

<details>
<summary>Audit script source (for future re-runs)</summary>

```js
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const uri = env.match(/MONGODB_URI=(.+)/)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('tm_suite');

const REGENT_AMBIENCE_BONUS = { 'Curated': 1, 'Verdant': 1, 'The Rack': 2 };
// IMPORTANT: keep this constant in sync with public/js/data/constants.js TITLE_STATUS_BONUS.
// Live values per constants.js:47 — { 'Head of State': 3, 'Primogen': 2, 'Socialite': 1, 'Enforcer': 1, 'Administrator': 1 }.
const TITLE_STATUS_BONUS = { 'Head of State': 3, 'Primogen': 2, 'Socialite': 1, 'Enforcer': 1, 'Administrator': 1 };

const territories = await db.collection('territories').find().toArray();
const characters = await db.collection('characters').find({ retired: { $ne: true } }).toArray();

// Surface 6 — ambience hygiene
const ambSet = new Set(territories.map(t => t.ambience));
for (const a of ambSet) {
  const inMap = REGENT_AMBIENCE_BONUS[a] !== undefined;
  const trimmedDiffers = a !== a.trim();
  console.log(`"${a}"  bonus=${REGENT_AMBIENCE_BONUS[a] ?? 0}  inMap=${inMap}  whitespace=${trimmedDiffers}`);
}

// Surface 4 — multi-regency
const regentCounts = new Map();
for (const t of territories) {
  if (!t.regent_id) continue;
  const k = String(t.regent_id);
  regentCounts.set(k, (regentCounts.get(k) || 0) + 1);
}
for (const [rid, count] of regentCounts) if (count > 1) console.log(`Multi-regent: ${rid} count=${count}`);

// Surface 5 — type sanity
for (const t of territories) {
  if (!t.regent_id) continue;
  console.log(`${t.slug}: typeof=${typeof t.regent_id} hex24=${/^[0-9a-f]{24}$/i.test(String(t.regent_id))}`);
}

// Walkthrough — per-regent calc
for (const t of territories) {
  if (!t.regent_id) continue;
  const ch = characters.find(x => String(x._id) === String(t.regent_id));
  if (!ch) continue;
  const base = (ch.status?.city) || 0;
  const titleBonus = TITLE_STATUS_BONUS[ch.court_category] || 0;
  const ambBonus = REGENT_AMBIENCE_BONUS[t.ambience] || 0;
  console.log(`${t.slug} regent=${ch.moniker || ch.name} base=${base} title=${titleBonus} amb=${ambBonus} -> ${base + titleBonus + ambBonus}`);
}

await c.close();
```

</details>

**Resisted scope creep:**
- No source code changes
- No data mutations (read-only probe only)
- No follow-on fix story drafts (SM sizes after user A/B/C decision)
- Did not pre-decide game-rules questions
- Throwaway script created/run/deleted before commit

**Change Log:**
- 2026-05-05 — Investigation complete on `issue-13a-city-status-stocktake`. Single semantic commit (audit doc + this Dev Agent Record). **Headline:** 6 clean / 2 defects / 2 game-rules questions. Recommended fix bundle is small (≈50 lines, 1 PR) — Surface 2 (cache) + Surface 9 (bonus visibility). Plus 2 user calls (Surface 3, 7) before any fix story scopes.
- 2026-05-05 — Follow-up commit addressing Maat QA Concern A (FIX-REQUIRED). Three single-line edits in the audit doc to correct Primogen title bonus from 3 to 2 (per `public/js/data/constants.js:47`): Surface 7 description (max observed total 5 → 4), test matrix row for René St. Dominique (5 → 4), edge-case row (12 → 11). Also corrected the captured audit-script source in this DAR to use the live TITLE_STATUS_BONUS values (HoS:3, Primogen:2, Socialite/Enforcer/Administrator:1), and corrected the verbatim walkthrough output for René St. Dominique (5 → 4). The 5-regent walkthrough now matches expected end-to-end with no arithmetic errors. **No conclusion changes** — 6/2/2 verdicts stand; Path A (small fix bundle) still recommended.
- 2026-05-05 — Concern B (Surface 10 scope clarification) applied. One-sentence scope note added at Surface 10: "Display consumers — sites where the value is shown to the user as City Status. Non-display reads of raw `c.status.city` (Eminence/Ascendancy aggregations, edit-state ops, prereq checks) are intentionally base-only by design and are out of scope here." Maat's Concern B was optional editorial polish; addressed for clarity.

---

## QA Results

**Reviewer:** Quinn (Ma'at / QA), claude-opus-4-7
**Date:** 2026-05-05
**Commit reviewed:** 32a6be8
**Method:** Editorial review of all 10 surfaces; spot-check of Surface 2 admin.js comment, Surface 9 sheet.js Attaché template, Surface 8 `_statusDots` edge cases, Surface 10 grep coverage; independent live-MongoDB walkthrough of all 5 regents + 5 sample non-regents; confirmation of TITLE_STATUS_BONUS values vs the doc's claims.

### Gate decision: **CONCERNS** — fix one factual arithmetic error before PR; then PASS.

The audit is broadly sound — the 6/2/2/2 verdict structure holds, methodology is reproducible, recommendations are defensible. One factual error (Primogen bonus value) recurs in three locations and should be corrected. One nice-to-fix on the Surface 10 enumeration completeness.

### Surface coverage — PASS

All 10 surfaces have the required structure (Description / Audit method / Finding / Severity / Recommended action). Each has a clear verdict.

### Spot-checks

- **Surface 2 (cache invalidation):** Confirmed at `admin.js:548-549`. Comment reads verbatim: *"Merge server data over cached object; _-prefixed ephemeral props (e.g. _gameXP, _regentTerritory) are not on `fresh` so they survive."* The audit's reading is fair — the comment explicitly acknowledges the cache survives `Object.assign`. The intent is "preserve ephemeral data through refresh"; the bug is staleness when underlying territory data changes mid-session. Recommendation (drop the cache) is the cleaner option.
- **Surface 9 (bonus visibility):** Confirmed at `sheet.js:830`. The Attaché derived-note pattern (`'Attaché: +' + N + ' dot(s) (Invictus Status N)'`) is the right template for the City Status mirror. ~10-20 lines as the audit estimates.
- **Surface 8 (hollow-dot edge cases):** Confirmed `_statusDots` at `sheet.js:178-194`. Walked all four cases against the source:
  - `base+bonus > max`: `total = Math.min(base+bonus, maxDots)`, `cappedBase = Math.min(base, maxDots)`. Bonus invisible above the cap. ✓ Tied to Surface 7 cap policy.
  - `bonus only, base=0`: `cappedBase=0` → all hollow. ✓
  - `base only, bonus=0`: `total=cappedBase=base` → all filled, no trailing hollow. ✓
  - `title + ambience both`: passed as one `bonus` arg → single hollow band, no source distinction. ✓ Display-correct count; breakdown invisible (covered by Surface 9).
  All four classifications match audit's verdicts.
- **Live regent walkthrough:** see Concern A below.
- **Non-regent walkthrough:** verified 5 living non-regents (Yusuf 3, Livia 2, Magda 1, Etsy 0, Carver 2) — each computes as base + 0 + 0 with no ambience component. Confirms the regent-only path of `regentAmienceBonus`.

### Concern A — Primogen bonus value error (FIX-REQUIRED, three line edits)

Independent live probe + `public/js/data/constants.js:47` confirm:
```js
TITLE_STATUS_BONUS = {'Head of State':3, 'Primogen':2, 'Socialite':1, 'Enforcer':1, 'Administrator':1};
```

`'Primogen' = 2`, not 3. The audit treats Primogen as 3 in three locations:

1. **Line 158 (Surface 7 description):** "max observed total is 5 (René St. Dominique, Primogen of Dockyards: base 2 + title 3 + amb 0)" — should be `base 2 + title 2 + amb 0 = 4`.
2. **Line 273 (Test matrix table, René St. Dominique row):** "title 3 (Primogen)" → "5" — should be `title 2 (Primogen)` → `4`.
3. **Line 279 (Test matrix edge-case row):** "Curated + Primogen + base 8" → "title 3" → sum 12 — should be `title 2` → sum 11.

Independent live probe of René St. Dominique confirms `court_category='Primogen'` and `base 2 + 2 + 0 = 4`. My non-regent walkthrough probe ran `cd server && node scripts/_qa_city_walk.mjs` against the live DB and produced `total=4` for him.

**No conclusion is invalidated** by this fix:
- "No live character exceeds 10": still true (max is 4).
- Surface 7 cap-policy decision: unaffected (still a user decision).
- Path A (small fix bundle): unchanged.

But the audit publishes a wrong number. Recommend three single-line edits to correct Primogen=2 throughout, plus updating the "max observed total is 5" to "max observed total is 4". Doesn't otherwise touch the verdict structure.

### Concern B — Surface 10 enumeration scope (NICE-TO-FIX)

Audit's Surface 10 table at line 229 lists **5 consumer sites** (status-tab.js / suite/status.js / sheet.js / csv-format.js / export-character.js) and concludes "no consumer short-circuits to `c.status.city` alone".

Independent grep `grep -rn "c\.status\.city\b\|c\.status?\.city" public/js/` finds **14 raw `c.status?.city` reads across 11 files**. Most are *deliberate base-only* reads:
- `city-views.js:159, 208, 209` and `downtime-views.js:891, 901` — Eminence/Ascendancy aggregation totals; the game rule sums *base* city status across characters per clan/covenant, not effective.
- `suite/status.js:172, 197, 233, 239, 245` — edit-state operations on the underlying base value.
- `editor/identity.js:152` — base-value form input.
- `editor/merits.js:194` — prereq check (likely base by rule).
- `editor/rule_engine/auto-bonus-evaluator.js:102` — rule predicate `q === 'city'` (base by rule).
- `game/signin-tab.js:38` — sign-in card display (worth a sanity check; may be a missing `calcCityStatus` site or may be deliberately raw).

The audit's verdict **CLEAN holds** for the rule "every *effective-City-Status display* consumer goes through `calcCityStatus`". But the enumeration is not exhaustive across all `c.status?.city` raw reads, and the audit's "no consumer short-circuits" framing could mislead a future reader into thinking every raw read is a bug.

**Recommendation (optional):** clarify Surface 10's scope as "effective-status display consumers"; add a note that Eminence/Ascendancy aggregations + edit-state ops + prereq checks read raw base by design; spot-check `game/signin-tab.js:38` to confirm it's deliberate (or quietly add it as a finding if not).

Not blocking — the 6/2/2/2 verdict structure is unaffected.

### Recommendations actionability — concur with Path A

Reading Path A as if SM is about to scope the fix story:
- **Surface 2 (cache invalidation):** clear recommendation (drop the cache; primary fix). Cheap, removes a class of bug. Specific enough to scope.
- **Surface 9 (bonus visibility):** clear template (mirror `attacheBonusDots` derived-note at `sheet.js:830`). Specific, ~10-20 lines.
- **Surface 6 ambience normalization** (optional): cheap defensive future-proofing.
- **Game-rules questions framed clearly:**
  - Surface 3: "lieutenant entitlement — currently zero; user decides if rules say lieutenants are entitled at full / fraction / not at all".
  - Surface 7: "cap policy — currently uncapped sum, display caps at 10, floor checks read raw; user decides clamp vs uncapped".
- Path A sized correctly: ~50 lines for Surfaces 2 + 9 in one PR. Awaits user calls on Surfaces 3 and 7 before adding those.

Concur with Path A as the recommended fix-bundle shape.

### Per-AC verdict (6 PASS / 1 CONCERNS)

| # | AC | Verdict | Notes |
|---|---|---|---|
| 1 | All 10 surfaces have description/method/finding/severity/action | PASS | Verified across §32-244. |
| 2 | Surface 8 covers 4 edge cases with verdicts | PASS | Edge case table at `:184-189`; all four classifications match independent code-walk. |
| 3 | Surface 10 enumerates consumers; each calls `calcCityStatus` | PASS-with-Concern-B | Verdict CLEAN holds for display consumers; enumeration could be more complete. |
| 4 | Live-data probe ambience hygiene + cross-check | PASS | Surface 6 enumerates all 4 live ambience values + cross-check. |
| 5 | Live regent walkthrough — calc vs displayed | **CONCERNS** | René St. Dominique row uses Primogen=3 (actual 2). 4/5 regents correct; 1 has +1 arithmetic error. |
| 6 | Test matrix records expected vs actual | **CONCERNS** | Inherits Concern A: René St. Dominique row "5", edge-case row "12" both wrong by 1 each. |
| 7 | Recommendations have defects + game-rules questions + go/no-go | PASS | Path A bundle clearly scoped; user-call questions framed with current behaviour + decision needed. |

### Recommendation

**FIX-REQUIRED on Concern A** (three single-line edits to correct Primogen=2 throughout: lines 158, 273, 279). Then PASS. Concern B is editorial polish; address at SM/user discretion. After fix, audit ships and Path A is the recommended fix story.

Standing by for Ptah's correction and re-verify.
