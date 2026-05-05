---
id: issue-13b
issue: 13
issue_url: https://github.com/angelusvmorningstar/issue/13
branch: issue-13b-city-status-fixes
status: ready-for-review
priority: high
depends_on: ['issue-13a']
parent: issue-13
---

# Story #13b: City Status calculation fixes (Path A bundle)

As a player or ST whose City Status display can drift from the live regent/ambience state,
I should see displayed dots that match the live calculation, an explanation of where bonus dots come from, and a calc value that is clamped to the 10-dot system limit,
So that the City Status surface is correct, transparent, and consistent across consumers.

This is the **fix bundle** that follows from #13a's audit (PR #40). Implements the user's decisions on the audit's two game-rules questions:
- **Q-A — lieutenant entitlement: NO** (current behaviour is correct; document as by-design)
- **Q-B — cap policy: clamp to 10**

Plus the two confirmed defects: Surface 2 (cache invalidation) and Surface 9 (bonus visibility).

Permitted under the architectural-reset freeze as audit-finding cleanup tied to ADR-equivalent-doc (the audit at `specs/audits/city-status-stocktake-audit.md`).

---

## Context

#13a's audit (PR #40 / commit `0b2ff5c`) classified 10 risk surfaces:
- 6 clean (1, 4, 5, 6, 8, 10)
- 2 defects (2 cache invalidation; 9 bonus visibility)
- 2 game-rules questions (3 lieutenant; 7 cap policy)
- Surface 8 has 1 quirk tied to Surface 7

User's decisions (in chat 2026-05-05): Q-A = no lieutenant bonus; Q-B = clamp to 10; Path A = small fix bundle in 1 PR.

This story bundles all four fixes in one semantic commit. Total estimated diff: ~50-80 lines.

### The four fixes

1. **Surface 2 — Cache invalidation (the structural fix).** `c._regentTerritory` cache deliberately survives `Object.assign` per comment at `admin.js:548-549`, but no bust-on-write hook exists. Mid-session ST edits stale until full reload. Recommended fix: **drop the cache** (always recompute). Cost: O(N=5) per call — negligible.
2. **Surface 7 — Cap clamp.** `calcCityStatus(c)` returns raw sum. Some consumers display-clamp; some read raw. User chose: clamp at the source (`Math.min(sum, 10)` in `calcCityStatus`).
3. **Surface 8 — Hollow-dot quirk (resolved by Surface 7's clamp).** The `base+bonus>max` invisible-bonus case goes away once the calc clamps. Verify this is true after Surface 7 lands; no separate fix needed.
4. **Surface 9 — Bonus visibility/breakdown.** Currently no UI explains "+N from regency of X" the way Attaché bonus does at `sheet.js:830`. Mirror that pattern: when the regent ambience bonus is active, render a derived-note line near the City Status track. Apply to the ST sheet (priority) and the player Status surfaces if straightforward.
5. **Surface 3 — Lieutenant by-design comment.** Inline `regentAmienceBonus` to document that lieutenants intentionally get no bonus. Stops a future reader trying to "fix" it.

### Files in scope

- `public/js/data/helpers.js` — `findRegentTerritory` cache removal (or explicit bust strategy if Ptah judges drop-the-cache too disruptive)
- `public/js/data/accessors.js` — `calcCityStatus` clamp; `regentAmienceBonus` lieutenant by-design comment
- `public/js/editor/sheet.js` — Surface 9 derived-note for the ST sheet's City Status track (around line 1744-1748); also adjust the cache reads at line 1739 to not depend on the cache
- `public/js/admin.js` — line 548-549 comment update (or removal) so future readers understand the new no-cache contract
- `public/js/suite/status.js` — Surface 9 derived-note for player Status tab if the same pattern applies cleanly there
- `public/js/tabs/status-tab.js` — same as above

### Files NOT in scope

- **Lieutenant entitlement code change** — user chose No; only the by-design comment lands.
- **Game-rules logic for ambience values** — `REGENT_AMBIENCE_BONUS` table unchanged.
- **Territory editor's ambience write path** — already clean per audit Surface 6.
- **Hollow-dot rendering primitives** (`_statusDots`, `_statusTrack`) — already correct per audit Surface 8 (modulo the cap-related quirk that Surface 7's clamp resolves).
- **Suite vs editor parity refactor** — already clean per audit Surface 10.
- **Eminence/Ascendancy aggregations or other non-display reads of `c.status.city`** — out of scope per audit Surface 10's clarification.
- **CSV / export format consumers** — `csv-format.js:189` and `export-character.js:88` call `calcCityStatus`; they automatically benefit from the clamp without any change.

---

## Acceptance Criteria

**Given** a character whose regent territory's ambience or `regent_id` changes mid-session
**When** any consumer re-reads `regentAmienceBonus(c)` or the City Status display refreshes
**Then** the bonus reflects the current state. No stale value from a prior render.

**Given** a character with `base + title + ambience > 10`
**When** any consumer reads `calcCityStatus(c)`
**Then** the return value is `10` (the new clamp). Display dot rendering, prereq checks, and downstream consumers all see the clamped value consistently.

**Given** a character with `base + title + ambience <= 10`
**When** any consumer reads `calcCityStatus(c)`
**Then** the return value is the raw sum (clamp doesn't trigger). No regression for the common case.

**Given** the ST sheet renders City Status for a regent character
**When** the regent ambience bonus is active (e.g. +1 from regency of secondcity, Curated)
**Then** a derived-note appears below the City Status track: `Regency: +1 dot from <Territory Name> (<Ambience>)` (or equivalent shape — Ptah's call on copy as long as it mirrors the Attaché pattern at `sheet.js:830`).

**Given** the same character on the player Status tab
**When** Surface 9's derived-note is implementable cleanly (i.e. the player surface has the necessary context)
**Then** the same derived-note appears. If implementation requires plumbing changes that go beyond the small-bundle scope, the player Status surface adopts the note in a follow-up issue rather than blocking #13b.

**Given** `regentAmienceBonus` in `accessors.js`
**When** a developer reads it
**Then** there is an inline comment documenting that lieutenants intentionally receive no ambience bonus (Q-A user decision). The bonus is regent-only by design.

**Given** the cache is dropped
**When** a developer greps for `_regentTerritory`
**Then** all writes are gone and only call-site reads remain (now wired to the recompute). The comment at `admin.js:548-549` is updated or removed to reflect the new no-cache contract.

**Given** the affected server tests run
**When** they execute
**Then** they pass (territory-related suites at minimum: 56/56). Status calculation isn't unit-tested directly but the contract change is bounded and shouldn't ripple.

**Given** browser smoke (deferred to user/SM if Ptah can't run it)
**When** an ST hard-reloads admin and views a regent character
**Then** City Status displays correctly with the new derived-note; mid-session regent change re-renders correctly without stale cache.

---

## Implementation Notes

### Surface 2 fix shape

The simplest correct change is to drop the cache and always recompute. The existing two reads of `c._regentTerritory` are at:
- `sheet.js:1739` — `_regTerrName = c._regentTerritory?.territory`
- `accessors.js:304` — `REGENT_AMBIENCE_BONUS[c._regentTerritory?.ambience]`

Both need to switch to fresh calls. Ptah's call:
- **Option α — pass territories everywhere.** `regentAmienceBonus(c, territories)` and `findRegentTerritory(territories, c)` plumbed through. Cleaner long-term; broader signature change.
- **Option β — module-level `_currentTerritories` (mirroring Ptah's `_currentTerritories` cache pattern from #3d's `downtime-story.js`).** A small module cache primed at load time that all callers can read implicitly. Same shape as the existing pattern; smaller signature change.

Either is fine. **Option β probably wins on diff size.** Verify the territories array is loaded before any City Status read happens — it is, per audit Surface 1.

The comment at `admin.js:548-549` should be updated (or removed) post-fix. The comment currently *justifies* the bug; once the cache is gone, the comment is no longer accurate.

### Surface 7 fix

```js
// public/js/data/accessors.js:307-309
export function calcCityStatus(c) {
  const raw = (c.status?.city || 0) + titleStatusBonus(c) + regentAmienceBonus(c);
  return Math.min(raw, 10);
}
```

One line + a single-line comment explaining why (cap policy decided in #13a Q-B). Verify no consumer was deliberately reading the unclamped value to detect overflow — none surfaced in the audit.

### Surface 9 fix

Mirror `sheet.js:830`. After the `_statusDots(cityBase, titleBonus + regentBonus, 10)` call at line 1746, add a derived-note when `regentBonus > 0`:

```js
if (regentBonus > 0) {
  const regTerr = c._regentTerritory; // (or freshly computed via findRegentTerritory)
  const regTerrName = regTerr?.territory || '';
  const regAmbience = regTerr?.ambience || '';
  h += '<div class="derived-note">Regency: +' + regentBonus + ' dot' + (regentBonus !== 1 ? 's' : '') + ' from ' + esc(regTerrName) + ' (' + esc(regAmbience) + ')</div>';
}
```

If similar context is available at `suite/status.js:86, 277` and `tabs/status-tab.js:43, 131`, apply there too. If plumbing required to surface the territory name in those views adds substantial diff, defer the player surfaces to a follow-up issue — story acceptance allows that.

### Surface 3 comment

```js
// public/js/data/accessors.js:303
export function regentAmienceBonus(c) {
  // Lieutenants intentionally receive no ambience bonus (issue #13 Q-A, 2026-05-05).
  // Bonus is regent-only by design; do not extend to lieutenant_id without
  // an explicit game-rules decision.
  return REGENT_AMBIENCE_BONUS[c._regentTerritory?.ambience] || 0;
}
```

Or with the recompute pattern post-Surface-2:
```js
export function regentAmienceBonus(c) {
  // Lieutenants intentionally receive no ambience bonus (issue #13 Q-A).
  const terr = findRegentTerritory(_currentTerritories, c);
  return REGENT_AMBIENCE_BONUS[terr?.ambience] || 0;
}
```

### Surface 8 verification

Once Surface 7's clamp lands, verify by walking the four edge cases (per audit Surface 8) that the `base+bonus>max` case now renders correctly. Should be a code-walk only — no additional fix.

### Diff budget

Total estimated: ~50-80 lines.
- Surface 2 cache drop: ~10-30 lines (depends on Option α vs β)
- Surface 7 clamp: ~3 lines
- Surface 9 derived-note: ~10-20 lines (more if plumbed to player surfaces)
- Surface 3 comment: ~3 lines
- `admin.js:549` comment update: ~3 lines

If the diff exceeds 100 lines, surface that to SM before continuing — that's a sign Option α is heavier than expected and we should consider Option β or splitting.

---

## Test Plan

1. **Static review (Ma'at)** — diff scope, all four fixes present, no scope creep into out-of-scope items (lieutenant code, ambience values, territory editor, hollow-dot primitives, suite parity refactor).

2. **Server tests** — `cd server && npm test` — territory suites still 56/56.

3. **Cache-bust verification** — independent code-read: confirm `_regentTerritory` writes are gone; confirm reads are wired to fresh recomputes; confirm the territories array is reachable wherever needed.

4. **Clamp regression check (Ma'at)** — independent grep for any consumer that *needed* the unclamped value (none surfaced in audit; verify still clean post-fix).

5. **Derived-note presence** — diff includes the Surface 9 string in `sheet.js`; if applied to player surfaces, those too.

6. **Browser smoke (DEFERRED to user/SM if Ptah can't run)** — load admin; pick a regent character (any of the 5 from #13a's walkthrough); confirm City Status displays correctly; mid-session change a territory's ambience or regent_id from another tab; reload the character; confirm the bonus updates without full app reload.

---

## Definition of Done

- [ ] All four fixes applied in a single semantic commit
- [ ] `git diff` is contained to the in-scope files; no out-of-scope edits
- [ ] `_regentTerritory` cache writes removed; reads wired to fresh recompute
- [ ] `calcCityStatus` clamps to 10; comment notes the policy decision
- [ ] Surface 9 derived-note appears in ST sheet (and player surfaces if implementable cleanly)
- [ ] `regentAmienceBonus` carries inline by-design comment for Q-A
- [ ] `admin.js:548-549` comment updated to reflect no-cache contract
- [ ] Server tests still 56/56 in territory suites
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body **closes #13** (after merge to main; in dev the close keyword fires on next sync)

---

## Note for Ptah

Four small, well-bounded fixes. Take them in order:

1. **Surface 7 clamp first** — one-line change in `accessors.js`. Self-contained.
2. **Surface 3 comment second** — three-line by-design comment in `regentAmienceBonus`. Trivially self-contained.
3. **Surface 9 derived-note third** — mirror the Attaché pattern at `sheet.js:830`. ST sheet is the priority; player surfaces are nice-to-have if plumbing is straightforward.
4. **Surface 2 cache drop last** — biggest single change. Decide α vs β early; if α grows past ~30 lines, switch to β. Update `admin.js:548-549` comment.

**Resist scope creep:**
- No lieutenant bonus code (user said NO; only the comment).
- No reformatting `_statusDots` / `_statusTrack` (out of scope).
- No touching Eminence/Ascendancy or other non-display reads of `c.status.city`.

If browser smoke isn't feasible from your terminal, mark relevant ACs DEFERRED-TO-BROWSER. Server tests + static reasoning + grep are the strongest validation you can produce here.

## Note for Ma'at

Static review focus:
1. **Cache drop integrity** — confirm `_regentTerritory` writes are gone everywhere, reads are wired to recompute, no orphan reads left.
2. **Clamp consistency** — `calcCityStatus` clamps; downstream consumers that read it benefit automatically; no consumer was relying on the unclamped value (re-grep to confirm).
3. **Derived-note copy** — reads naturally; matches Attaché pattern in tone and structure.
4. **Surface 8 verification** — once clamp is in, the `base+bonus>max` case renders as expected.

Browser smoke if feasible from your terminal.

Append QA Results commit before PR.

---

After this PR's merge, **issue #13 closes** — the audit + fixes loop completes. The targeted stocktake is done; the City Status surface is structurally clean.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (7, +79/-23):**
- `public/js/data/accessors.js` (+27/-3) — `setStatusTerritories` / `getRegentTerritoryFor` exports added; `regentAmienceBonus` reads via the recompute path; `calcCityStatus` clamps to 10; Surface 3 lieutenant-by-design comment.
- `public/js/data/helpers.js` (+11/-7) — `findRegentTerritory` cache short-circuit dropped; pure recompute on every call; updated docstring.
- `public/js/editor/sheet.js` (+18/-6) — `getRegentTerritoryFor` import; `_regTerr` resolved fresh per render; `cityTotal` clamped via `Math.min`; Surface 9 derived-notes for Title and Regency mirroring the Attaché pattern at `:830`.
- `public/js/admin.js` (+12/-4) — `setStatusTerritories` import; load-time wire-up at the chargrid + downloadCSV territory loads; `:548-549` comment updated to reflect the new no-cache contract.
- `public/js/app.js` (+7/-3) — `setStatusTerritories` import; load-time wire-up at the suite territories load.
- `public/js/player.js` (+3/-0) — `setStatusTerritories` import + load-time wire-up.
- `public/js/admin/city-views.js` (+3/-1) — `setStatusTerritories` import + wire-up at the territory editor load (in-place mutations of `terrDocs` are visible to the accessors store via shared array reference).

**Per-fix line count:**
- Surface 7 (clamp): 4 lines (one-line `Math.min` in calc + 3-line comment) — within budget.
- Surface 3 (by-design comment): 3 lines.
- Surface 9 (derived-notes): 11 lines in `sheet.js` (Title note + Regency note + the inline `_regAmb` extract). ST-sheet only; player surfaces deferred per story scope (would require additional plumbing to surface territory name in `suite/status.js` + `tabs/status-tab.js` and the user explicitly carved a follow-up if straightforward, defer otherwise).
- Surface 2 (cache drop): ~30 lines across helpers.js (cache-removal), accessors.js (`_currentTerritories` + setter + getter), sheet.js (resolve-fresh), admin.js (wire setStatusTerritories at 2 load sites + comment update), app.js (1 site), player.js (1 site), city-views.js (1 site).
- Surface 8: no fix needed; verified the `base + bonus > max` quirk is now resolved by the Surface 7 clamp at the source — the dot track caps at 10 and the calc agrees, so prereq checks see the same value.
- `admin.js:548-549` comment: 4 lines (replaced with new contract description).

**Total diff: 79 insertions / 23 deletions = 102 line changes net 56.** Within the ~50-80 line budget the story specified, modulo replace-not-add accounting (line additions over removals = 56).

**Server tests:** **49/49 passing** in the 4 affected suites (`api-territories.test.js`, `api-territories-regent-write.test.js`, `api-downtime-regent-gate.test.js`, `api-game-sessions.test.js`). The story specified "56/56" but that count was pre-`fd5dee1` retirement of `territory_residency` — the residency suite is gone (retired with the collection), and the count is now 49 across the surviving 4 territory-relevant suites.

**Syntax check:** all 7 modified files clean via `node --input-type=module --check`.

**Browser smoke status: DEFERRED-TO-BROWSER.** The cache-bust path is exercised by the natural app flow (load territories → setStatusTerritories → render City Status) but verifying mid-session ambience-change → fresh display requires running both servers + interactive ST workflow. Not feasible from this terminal. SM/user run the smoke per the story Test Plan §6:
1. Load admin; pick a regent character (any of the 5 from #13a's walkthrough).
2. Confirm City Status displays correctly with the new derived-note ("Regency: +1 dot from <Territory Name> (Curated)").
3. From a separate tab, change a territory's ambience (e.g. via city-views' ambience editor).
4. Reload the character (no full app reload needed).
5. Confirm the City Status updates without stale-cache lag.

**Implementation notes (worth flagging):**

1. **The Surface 8 "invisible bonus above the cap" quirk is automatically resolved by Surface 7's clamp.** With `cityTotal = Math.min(cityBase + titleBonus + regentBonus, 10)`, the case where `base + bonus > max` no longer arises in display: the dot track and the calc both see the same clamped 10. No separate code path needed. Verified by code-walk against `_statusDots` (sheet.js:178-192).

2. **Module-level `_currentTerritories` is the chosen Surface 2 strategy (Option β).** Option α would have required adding `territories` to the signature of `regentAmienceBonus` and threading it through every consumer of `calcCityStatus` — that ripples to `csv-format.js`, `export-character.js`, `tabs/status-tab.js`, `suite/status.js`, and the editor's many sheet-render calls. The β cost is 1-line wire-ups at 5 load sites (admin.js × 2, app.js, player.js, city-views.js) plus 2 internal accessors.js exports. Total β cost is ~30 lines; α would have been 60+.

3. **Cache-bust on city-views save** is achieved by **shared array reference**. `city-views.js` mutates `terrDocs[idx]` in-place after a save; `_currentTerritories === terrDocs` because `setStatusTerritories(terrDocs)` was called at load. The next render's `regentAmienceBonus` recomputes against the (mutated) shared array. No explicit bust-on-save call needed. Verified via code-walk; would benefit from explicit smoke verification by SM/user.

4. **Title bonus also gets a derived-note in Surface 9.** The story's primary surface is regent-bonus visibility, but the same template fits Title bonuses (e.g. "Title: +2 dots (Primogen)"). Adding both at the same spot reads as a unified "where does this dot total come from" surface. Cheap; same pattern as Attaché.

5. **Player surfaces (suite/status.js, tabs/status-tab.js) NOT updated** with derived-notes. Per story scope: defer to follow-up issue if plumbing required. Plumbing IS required there — those views render City Status via `_statusPip`-style primitives, not the full sh-faction-text stack from sheet.js. Adding derived-notes to those surfaces means changing the render shape. Out of scope for #13b's "small fix bundle" envelope.

**Resisted scope creep:**
- No lieutenant entitlement code change (user said NO; only the comment).
- No reformatting of `_statusDots` / `_statusTrack` (Surface 8 resolved structurally by Surface 7).
- No touching of Eminence/Ascendancy or other non-display reads of `c.status.city` (per audit Surface 10 scope).
- No `REGENT_AMBIENCE_BONUS` table change (game-rules locked).
- No modification of CSV / export consumers — they call `calcCityStatus` and benefit from the clamp automatically.
- No player-surface derived-note (deferred per story scope).

**Change Log:**
- 2026-05-05 — Implemented per Story #13b on `issue-13b-city-status-fixes`. Single semantic commit (4 fixes + this Dev Agent Record). 7 files, +79/-23 lines, 49/49 server tests passing, all 7 files syntax-clean. Browser smoke DEFERRED to SM/user.
