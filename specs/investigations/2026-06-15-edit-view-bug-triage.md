# Edit-View Bug Triage — 2026-06-15

**Author:** Ma'at (QA)
**Dispatched by:** Khepri (SM)
**Branch state at investigation:** `dev` @ 3be7a3c2 (read-only; production main pushed 07:18 UTC same day, post-#704 backfill)

Three items observed by Peter against production main, all in the character editor / sheet edit view. Output is shape-only — no implementation. Confidence level noted per item where DB-side state is involved.

---

## Item 1 — "MCI: any merit free dots X/Y" counter desync

### Render path

- Counter row is emitted by `_renderPoolCounters(c, 'general')` in `public/js/editor/sheet.js:100-134`, called from `shRenderGeneralMerits` at `sheet.js:1286`.
- For the `'any'` category pool (the MCI cross-merit pool), the row template at `sheet.js:131` produces exactly Peter's string: `<tag>MCI</tag>: any merit free dots <X>/<Y>`.
- `Y` (denominator) = `p.amount`, written by the rules-engine pool evaluator at `public/js/editor/rule_engine/mci-evaluator.js:81`. This is correct.
- `X` (numerator) = `getMCIPoolUsed(c)` at `sheet.js:124` → defined `public/js/editor/mci.js:190-195`.

### Root cause — confirmed

`getMCIPoolUsed` reads **only** the legacy flat field:

```js
// mci.js:190-195
export function getMCIPoolUsed(c) {
  let total = 0;
  (c.merits || []).forEach(m => { total += m.free_mci || 0; });
  (c.fighting_styles || []).forEach(fs => { fs.free_mci || 0; });
  return total;
}
```

The post-N-2 backfill (PR #704, applied 2026-06-15) moved persisted `m.free_<slug>` values into the `m.free_grants[<slug>]` map. The shared union-sum helper `meritFreeSum` at `public/js/data/rules-helpers.js:92-100` sums **both** legacy and map channels — but `getMCIPoolUsed` doesn't. Net effect: for every backfilled merit, the numerator silently collapses to 0 (or whatever fraction wasn't backfilled), while `meritFreeSum` (used by the merit row display, the rating-vs-sum guard at `sheet.js:171`, and the per-slug inline reads at `sheet.js:1059`) continues to report the correct sum. The counter and the dots displayed on individual merits disagree.

### Secondary observation — the selectors

Peter's note that the MCI XP selectors "don't seem correctly wired and don't serve to change values" reads symptomatically from the same desync. The Specialisation / Merit choice buttons (`shEditMCIDot` at `public/js/editor/edit-domain.js:234-246`) write to `m.dot1_choice`/`dot3_choice`/`dot5_choice`, then call `_renderSheet(c)`, which reruns the pool evaluator and recomputes `p.amount`. Toggling between `'speciality'` and `'merits'` correctly changes the **denominator** — but the **numerator** is still busted by the read-side bug, so the user sees `0/N` flipping to `0/(N+1)` and concludes the selector "did nothing visible." The selectors themselves are fine.

A genuinely orphaned write does exist on the same chain: `meritBdRow`'s MCI input at `public/js/editor/xp.js:215` writes via `onchange="shEditMeritPt(realIdx, 'free_mci', ...)"` — i.e. user edits to the MCI bonus field on a merit row still write to legacy `m.free_mci`. After the backfill cleared those, this write creates a fresh divergence (legacy = N, map = previously-backfilled M, `meritFreeSum` returns M+N). This is the WRITE side of the same channel asymmetry and belongs in the #707 cleanup, not in the read-side fix below.

### Sister-bug connection

Issues #749 (style-retainer evaluator pet double-count) and #750 (5-evaluator audit) are the **write-side** of this same legacy-vs-map channel asymmetry — evaluators that write to either map OR legacy, double-counted when both fire. **This item is the read-side**: a single read site that consults only one channel. The same audit umbrella should cover both halves; readers and writers must converge on the union helpers (`freeOf`, `meritFreeSum`).

### Blast radius

- Render-only — never persisted. No data corruption.
- Confined to the "MCI: any merit free dots" counter row. The corresponding alert badge logic at `sheet.js:1263` reuses the same `getMCIPoolUsed` and therefore also misreports (red/yellow merit-section badge).
- Other slug-keyed pool readers (`getPoolUsed` at `mci.js:222-240`, `getMCIPoolUsed` at `mci.js:190-195`) all share the flat-field pattern. Check the OHM / LK / Inv / OTS counters during the fix — `getPoolUsed` iterates `Object.entries(m)` looking for `k.startsWith('free_')`, so it captures legacy channels but **also misses** `m.free_grants.*`. That makes #749/#750/#707 plus this item all symptoms of one shape.
- Sheet display of per-merit dot totals (`sheet.js:1059`) already inlines the union-sum pattern (`_fg.mci ?? m.free_mci ?? 0`), so individual merit rows are correct. The mismatch is between merit-row totals (right) and the counter (wrong).

### Recommended fix shape

1. **Minimal — read-side patch (drop-in).** Rewrite `getMCIPoolUsed` to use the existing `freeOf(m, 'mci')` helper from `rules-helpers.js` (the same helper `meritBdRow` already uses). One-line change; aligns with the canonical pattern.
2. **Coherent — audit all pool readers.** `getMCIPoolUsed`, `getPoolUsed`, `lorekeeperUsed`, `vmUsed`, `investedUsed`, `ohmUsed`, `getOTSPoolUsed`, `_grant_pools.any-counter`. Each should read via `freeOf` (or `meritFreeSum`'s helper) so the read side stops caring about which channel a value lives in. Bundle with the #707 cleanup story; do **not** stage as a separate per-counter fix race.
3. **Future-proof — converge on one accessor.** When N-2 finally drops the legacy-flat fallback, the readers should already be helper-based so the deletion is a single change in `rules-helpers.js`. Picking shape (2) earns this for free.

Recommend shape (2) bundled with #707. Shape (1) alone is acceptable as a quick prod patch if the dispatch cluster wants to stop the bleeding before the audit lands.

---

## Item 2 — Orphan MCI "up/down counter" numeric input

### Locating it

There is no dedicated "MCI dots" numeric input on the MCI standing-merit row. The element Peter is seeing is the **Bonus** up/down row rendered by `meritBdRow` at `public/js/editor/xp.js:222-223`:

```html
<div class="attr-derived-row">
  <span class="bd-lbl">Bonus</span>
  <button onclick="shAdjMeritBonus(...,-1)">▼</button>
  <span class="bd-src">+N</span>
  <button onclick="shAdjMeritBonus(...,1)">▲</button>
</div>
```

`meritBdRow` is invoked unconditionally for the MCI merit at `sheet.js:1143` (no `opts`, just CP/XP/Bonus), so the Bonus row renders even though MCI is a standing merit whose dots are derived from CP + XP, not from a bonus offset.

### Writer

`shAdjMeritBonus` at `public/js/editor/edit.js:599-605` clamps and writes `m.bonus = Math.max(0, (m.bonus || 0) + delta)`.

### Load-bearing check

`m.bonus` is read in the following code paths:

| Site | Context | Standing merit? |
|------|---------|-----------------|
| `domain.js:46` | `effective_rating` calc | no — domain merits |
| `sheet.js:875, 919` | influence merit display + breakdown | no |
| `sheet.js:1012` | domain merit "My dots" display | no |
| `sheet.js:1056` | domain merit derived legacy-field sum | no |
| `sheet.js:1312, 1329` | general merit display | no |

The standing-merit render block at `sheet.js:1106` builds `dd` from `cp + free_bloodline + free_pet + free_mci + free_vm + xp` and explicitly **omits** `m.bonus`. `_renderMCI` (`sheet.js:1132-1203`) and `_renderPT` (`sheet.js:1204-1253`) likewise never reference `m.bonus`.

**Confirmed orphan**: for MCI (and Professional Training) the Bonus row is writable but unread. No load-bearing consumer on the standing-merit path.

### Blast radius

- UI clutter; no data corruption from the field existing.
- If existing production characters have non-zero `m.bonus` on MCI / PT entries (from STs experimenting with the orphan input), it has no rendered effect today — but if a future feature rewires standing rating to include `m.bonus` (e.g. a hand-edit ST override pattern), those stale values would spuriously appear. Low probability, but the cleanup should consider zeroing-out.
- Removing the row is **safe for standing merits**. It is **not safe** to remove globally — see the table above; `m.bonus` is load-bearing on general / influence / domain rows.

### Recommended fix shape

1. **Suppress the Bonus row on the standing-merit render path.** Either:
   - Add `opts.hideBonus` to `meritBdRow` and pass it from the standing call sites (`sheet.js:1143`, `sheet.js:1217`). Keeps `meritBdRow` category-agnostic.
   - Or branch inside `meritBdRow` on `mc.category === 'standing'`. Less argument plumbing but couples the helper to category names.

   Option A (`opts.hideBonus`) preferred — symmetric with the existing `showMCI`/`showVM`/etc. opts.

2. **One-off zero-out script for any standing merits with `bonus > 0`.** Cheap aggregation query; idempotent zero. Optional but tidy.

3. **No new feature, no schema change.** The orphan is purely a UX leak from a generic helper; suppression at the call site is the whole fix.

---

## Item 3 — Domain merit selector accepts Catacombs without Necropolis Sepulcher

### Where the dropdown is built

`shRenderDomainMerits` (`sheet.js:963-`) calls `buildSubCategoryMeritOptions(c, 'domain', m.name, DOMAIN_MERIT_TYPES)` at `sheet.js:980`. The helper is defined at `public/js/editor/merits.js:322-346`.

The helper's filter chain (line 330-335):

```js
for (const rule of rulesDB) {
  if (rule.sub_category !== subCategory) continue;          // ← (1) sub_category gate
  if (!_meetsPrereq(c, rule.prereq) && rule.name.toLowerCase() !== curLow) continue;  // ← (2) prereq gate
  if (_isExcluded(c, rule.name) && rule.name.toLowerCase() !== curLow) continue;
  if (seen.has(rule.name)) continue;
  seen.add(rule.name);
  qualified.push(rule.name);
}
for (const n of extraNames) {                                // ← (3) hardcoded fallback list
  if (!seen.has(n)) { seen.add(n); qualified.push(n); }
}
```

`DOMAIN_MERIT_TYPES` at `public/js/data/constants.js:125` is the hardcoded legacy list `['Safe Place','Haven','Feeding Grounds','Herd','Mandragora Garden']`. **Catacombs is not in it.** So Catacombs reaches the dropdown via path (1)+(2), not via the `extraNames` fallback.

### Catalog state — confidence: medium

The Necropolis family seed at `server/scripts/seed-rules-necropolis.js`:
- Sets `prereq: PREREQ_FAMILY` for Catacombs (`seed-rules-necropolis.js:113`), where `PREREQ_FAMILY = { all: [{type:'clan',name:'Nosferatu'}, {type:'merit',name:'Necropolis Sepulcher',dots:1}] }` (lines 54-60).
- Sets `sub_category: null` for all nine merits via `_baseDoc` (line 83). **No override per-merit.**
- Uses `replaceOne({key}, doc, {upsert: true})` so re-running the seed fully overwrites.

If the seed shipped to production unchanged, Catacombs in MongoDB has `sub_category === null`, which means the sub_category gate at line 330 **should already reject it** — so Catacombs shouldn't appear in the domain dropdown at all. Since Peter observes that it does, one of these is true on production data:

- (a) An off-the-books DB update or a not-yet-committed migration set `sub_category: 'domain'` on the Necropolis family. The current archived migration `server/scripts/archive/migrate-merit-sub-category.js` only touches the legacy DOMAIN_NAMES list (no Catacombs), so this would be ad-hoc.
- (b) The seed ran with edited code that included `sub_category: 'domain'` for these merits, and the committed `seed-rules-necropolis.js` doesn't reflect it.
- (c) Far less likely: Catacombs reaches the dropdown through a path I missed.

QA cannot resolve (a) vs (b) without a `purchasable_powers.findOne({name:'Catacombs'})` query. **Recommend Khepri or Imhotep confirm the persisted shape before designing.**

### Prereq engine — handles this case correctly

`meetsPrereq` at `public/js/data/prereq.js:38-148` correctly evaluates the `{all: [...]}` combinator and the `type:'merit'` leaf — see line 81-86 (`m.name === node.name` + rating check). For a non-Nosferatu (or a Nosferatu without Sepulcher 1+), `meetsPrereq` returns false. So **if** the prereq tree is persisted correctly on the Catacombs catalog doc, the line-331 check at `buildSubCategoryMeritOptions` does the right thing.

Two scenarios that would still allow the bug even with sub_category='domain':
- The persisted `prereq` field on Catacombs is `null` (seed didn't write the tree, or overwrote it with null later). Then `meetsPrereq(c, null)` returns true at `prereq.js:39`. **High suspect.** Worth verifying alongside (a)/(b).
- `m.rating` on the character's Necropolis Sepulcher merit is unsynced — but in that case Sepulcher owners would also fail their own catalog row, which would be flagged separately and Peter would have noticed.

### Blast radius

- All six collectively-shared Necropolis merits (Catacombs, Caldarium, Garbage Pit, Labyrinth Guardians, Dark Temple, White Ants) share `PREREQ_FAMILY` and are the same shape. So the gap is family-wide.
- Adding a non-prereq Catacombs row gives the character access to its `_collective_shared_with` synthesis logic (see `server/tests/n3-necropolis.test.js`). The shared display would show partners' contributions for a character who shouldn't be in the pool.
- No data corruption — the merit exists in `c.merits` like any other, just illegitimately.
- Existing rows that pre-date a fix (i.e. characters who currently hold a Catacombs without Sepulcher) need a separate cleanup pass; the filter change alone won't retroactively strip them.

### Recommended fix shape

1. **Wrap the prereq check in a named helper** — `meritPrereqOK(c, rule)` — that returns `{ok: boolean, reason?: string}`. Internally delegates to `_meetsPrereq(c, rule.prereq)` and, on failure, builds the human-readable reason via `prereqLabel(rule.prereq)`. Use this in `buildSubCategoryMeritOptions` and anywhere else that filters by prereq (`buildMeritOptions`, `buildMCIGrantOptions`, `buildFThiefOptions`). Gives a single audit surface.
2. **Diagnostic warn on current-row prereq miss.** When the helper passes a rule into the qualified list because `rule.name === currentName` (the escape hatch at line 331), but the prereq check fails, log a `console.warn` so STs can see "the merit on this row no longer qualifies" instead of the silent acceptance today.
3. **Verify catalog state before any code change.** Run a one-time read against `purchasable_powers` for the Necropolis family confirming `prereq` and `sub_category` shapes. If `prereq` is null, the right fix is to re-run the seed (or a targeted update) — not to layer client-side prereq logic on top of a missing source-of-truth field.
4. **No prereq-tree recursion needed at this layer.** The existing `_everyPrereqPathRequiresCarthian` walker (`merits.js:399-405`) is fine as a parallel pattern for the FT thief filter, but `meetsPrereq` already evaluates the full tree end-to-end — the filter helper just wraps it.

### Fucking Thief carve-out — data hooks already exist

Khepri asked: "flag what state (if any) tracks 'thief slot spent vs unspent' on a character." The state is implicit, not explicit. There is no `c.fucking_thief_slot_spent` field. The slot state lives in two consistent places that should always agree:

| Hook | Read | Meaning |
|------|------|---------|
| FT merit's `qualifier` | `c.merits.find(m => m.name === 'Fucking Thief')?.qualifier` | Name of the chosen stolen merit (string) or empty/undefined |
| Granted-by row | `c.merits.some(m => m.granted_by === 'Fucking Thief')` | The stolen merit row exists |

These are wired together by `shEditGenMerit` at `public/js/editor/edit-domain.js:120-130` — picking a value in `buildFThiefOptions` updates FT.qualifier and adds an `addMerit(...{granted_by:'Fucking Thief'})` row.

**Implication for the domain filter design (Imhotep's territory):** the carve-out does not need a new persistent field. Two design choices for him:

- **(easy)** Keep the current split: FT theft uses its own dedicated picker (`buildFThiefOptions` → granted-by-FT addMerit), and the general dropdown's prereq filter does NOT need to consider FT at all. The granted-by row already short-circuits prereq display on the sheet (`sheet.js:1298` renders the granted-row path without the prereq warn). Whatever filter Imhotep adds to the domain dropdown should just not iterate `granted_by` merits when computing what's already present.
- **(harder)** Unify into one picker. Then the filter must consult both: "does FT exist on character? does this candidate qualify as a 1-dot non-Carthian (use `_everyPrereqPathRequiresCarthian` already there)? is FT.qualifier unset (slot unspent) or === candidate (slot already spent on it)?" Three boolean reads on existing fields — still no new schema.

Recommend (easy) for the N-1-equivalent cleanup; (harder) only if there's a separate UX reason to merge the pickers. Either way, no `fucking_thief_slot_spent` field needs to exist.

---

## Cross-references

- **#704** — N-2 backfill (legacy `m.free_<slug>` → `m.free_grants[<slug>]`). Triggered Item 1's read-side desync.
- **#707** — post-N-2 cleanup story. Bundle Item 1 shape (2) under this; the audit is identical scope.
- **#749** — style-retainer evaluator pet double-count (write-side of the same channel asymmetry).
- **#750** — 5-evaluator audit (write-side audit, peer of #749).
- **ADR-005 Rev 2** — generalised Collective Compound pattern; the Necropolis family is its first instance. Catacombs prereq-leak (Item 3) is not an ADR violation, just an enforcement gap downstream of the seed.
- **`feedback_canonical_first_state_pattern`** — Item 1 follows the same pattern: read sites should consult the canonical helper (`freeOf` / `meritFreeSum`) rather than reaching into flat fields. The fix is "read through the canonical helper", same shape as the click-handler convention.
- **`feedback_listener_routing_static_blind_spot`** — Item 3 is also a static-review blind spot of a different kind: code-reading the filter chain at `merits.js:330-335` looks correct, but DB-side state can defeat it. Verify persisted catalog shape before designing.

---

## Summary table

| Item | Root cause | Blast radius | Fix shape (preferred) |
|------|-----------|---------------|-----------------------|
| 1 | `getMCIPoolUsed` reads only legacy `m.free_mci`; backfill moved data to `m.free_grants.mci`. Read-side of channel-asymmetry audit. | Counter + alert badge only; render-time; no corruption | Convert all pool readers (`getMCIPoolUsed`, `getPoolUsed`, etc.) to use `freeOf`/`meritFreeSum` helpers. Bundle under #707. |
| 2 | `meritBdRow` always renders a Bonus up/down; standing-merit render paths don't read `m.bonus`. Orphan write site. | UX clutter only; potential stale `m.bonus` values on existing standing merits | Add `opts.hideBonus`, pass from `sheet.js:1143` + `sheet.js:1217`. Optional zero-out script. |
| 3 | Domain dropdown allows Catacombs without Necropolis Sepulcher. Likely cause: persisted catalog state (sub_category='domain' set off-the-books, or prereq null on the doc) defeats the existing filter at `merits.js:331`. | Family-wide (6 Necropolis-shared merits); illegitimate access to shared-pool synthesis | Verify catalog state first. Then wrap prereq check in `meritPrereqOK(c, rule)` helper; reuse across all sub-category pickers. FT carve-out needs no new field. |
