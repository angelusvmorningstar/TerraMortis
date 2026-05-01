---
title: 'Effective rating + cap sweep — Influence, Feeding pool, XP picker, Project dice pool'
type: 'fix'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — uniform pattern across 4 sites + spec picker addition + rite catalog filter; bounded changes guided by an existing canonical implementation (the merit XP picker branch)'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/dtlt.3.theme-purge-migration.story.md
  - public/js/data/accessors.js
  - public/js/editor/domain.js
  - public/js/editor/mci.js
  - public/js/tabs/downtime-form.js
  - public/js/tabs/feeding-tab.js
  - public/js/admin/feeding-engine.js
  - public/js/suite/tracker-feed.js
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/feedback_effective_rating_discipline.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/reference_influence_formula.md
---

## Intent

**Problem:** Recurring bug class — multiple calc sites read inherent dots (`skDots`, `s.dots + s.bonus`, `m.rating || 0`) instead of effective rating that includes bonus channels (PT 4-dot Asset Skill, MCI 3-dot, every `free_*` merit channel). Plus several sites have no cap-of-5 check. Plus the project dice pool has no spec picker. Plus the XP picker's rite branch lists generic level placeholders instead of named rites filtered by ownership.

Four diagnostic findings collapse into one fix shape: read effective rating, apply caps, fold spec bonuses where applicable. The merit XP picker at `downtime-form.js:3388-3429` already does this correctly via `effectiveMeritRating` + `if (currentDots >= max) continue` — that's the model to copy.

Per ADR-001 effective-rating contract: "The persistent bug class in this codebase is calculations silently ignoring bonus dots." This story closes four readers that currently violate that contract.

**Approach:** Three coordinated changes:

1. **Canonical helper** — extract a single `meritEffectiveRating(c, m)` accessor in `public/js/data/accessors.js`. Sums every dot channel: `cp + xp + free + free_bloodline + free_pet + free_mci + free_vm + free_lk + free_ohm + free_inv + free_pt + free_mdb + free_sw`, plus dynamic bonuses (Herd's SSJ + Flock, shared domain partner totals). All four call sites read from this helper instead of `m.rating || 0`. Replaces the two existing duplicate `effectiveMeritRating` definitions in `downtime-form.js:260` and the implicit equivalent reads scattered through the codebase.

2. **Effective skill access** — replace `skDots(c, s)` calls and inline `(s.dots + s.bonus)` patterns at calc sites with `skTotal(c, s)` (already exists at `accessors.js:104`). Adds spec picker UI to the project dice pool and folds the spec bonus into the total.

3. **Cap and rite-catalog fixes in the XP picker** — attribute/skill/discipline branches gain a cap-at-5 skip. Rite branch is rebuilt against the rule catalog (`getRulesByCategory('rite')`) with tradition + rank filtering and "already owned" exclusion.

**Critical context** — current state of `m.rating` writes (informs why we read effective at calc time, not trust the stored field):
- `server/scripts/ingest-excel.js:381-385` — imports influence merits with `rating: 0` and never updates it after assigning channels.
- `public/js/editor/mci.js:79-84` — `applyDerivedMerits` re-syncs rating BUT excludes the generic `free` channel from the sum (line 82). So merits with dots in the legacy `free` column have `m.rating < actual effective`.
- `public/js/editor/edit.js:1014` — `shStepMeritRating` writes `rating = cp + xp` only.
- `public/js/editor/edit.js:1053` — `shEditMeritPt` writes `rating = cp + various free_* + xp` but excludes `free`, `free_pt`, `free_mdb`, `free_sw`.

So `m.rating` is structurally unreliable. The fix is at the read side, not the write side.

## Boundaries & Constraints

**Always:**
- New canonical helper lives at `public/js/data/accessors.js`. Single source of truth for "merit effective rating".
- Helper signature: `meritEffectiveRating(c, m) → number`. Pure function. Returns 0 if `m` is falsy. Handles shared domain merits (delegates to `domMeritTotal` from `editor/domain.js`) and Herd dynamic bonuses (`ssjHerdBonus`, `flockHerdBonus`) per the existing `downtime-form.js:260` pattern.
- All four call sites read from this helper. Don't leave any "legacy fallback to `m.rating`" path — full swap.
- The two existing `effectiveMeritRating` shadow definitions are deleted (in `downtime-form.js:260` and `domain.js`'s implicit reads). Imports updated.
- `skTotal(c, skill)` (`accessors.js:104`) is the canonical effective-skill helper. It already correctly handles `dots + bonus + _pt_dot4_bonus_skills + _mci_dot3_skills`, capped at 5. All feeding pool builders and the project dice pool use it.
- **Disciplines** read inherent only for now (`c.disciplines[d]?.dots`). Disciplines do not currently carry bonus channels in the same way merits/skills do — adding effective rating for disciplines is out of scope here. Memory `feedback_effective_rating_discipline.md` flags this as a future concern, but no code today injects bonus channels into disciplines (`rule_disc_attr` injects discipline rating into *attributes*, not into discipline ratings themselves). Cap-at-5 still applies.
- Rite picker rebuild filters against character ownership via `(c.powers || []).filter(p => p.category === 'rite').map(p => p.name)`. Match by exact name string.
- Spec picker UI in project dice pool follows the existing chip-row pattern from the feeding tab (`feeding-tab.js:421` — `specBonus = specName && bestSpecs.includes(specName) ? ((na || hasAoE) ? 2 : 1) : 0`).
- Project dice pool changes apply to BOTH primary (`pool` prefix) and secondary (`pool2` prefix) pools (`downtime-form.js:3322`).

**Ask First:**
- **Honey with Vinegar threshold for narrow Status with HwV.** `domain.js:124` currently applies the HwV reduction only to wide Status. Narrow Status with HwV is unspecified — current code falls through to default thresholds (3→1, 5→2) but only the `r >= 5 ? 1 : 0` branch is reached at line 122. Confirm: is this intentional? The story preserves current behaviour by default. Flag if the reviewer wants to change it.
- **`m.rating` write-side audit.** This story does not fix the inconsistent writers (`shStepMeritRating`, `shEditMeritPt`, ingest-excel). The reads now bypass them entirely, so the bug class is closed at the calc level. **Confirm:** is leaving the writers inconsistent acceptable, or do you want a follow-up story (DTLT-12 maybe) to harmonise them? Default: leave the writers; `m.rating` becomes a vestigial display hint.

**Never:**
- Do not modify `applyDerivedMerits` to add `free` to the rating sum. That changes write-side behaviour with potential ripple effects on the rules engine evaluators (per ADR-001 phase 5 final rating sync). Stay on the read side.
- Do not delete the `m.rating` field from documents or write paths. Many UI surfaces still read it for display (sheet renderers, sphere-merit chips). Removing it is a separate larger refactor.
- Do not change `skDots` itself. Other callers genuinely want inherent-only (e.g. XP cost calculators that should not factor in granted dots when computing how much XP a player owes). Add new helpers, don't break existing ones.
- Do not extend the `meritEffectiveRating` helper to handle disciplines. Different shape, different bonus channels, separate story.
- Do not change the merit XP picker branch (`downtime-form.js:3388-3429`). It's the model — keep it as the reference pattern.
- Do not move spec/9-Again logic into `meritEffectiveRating`. Skill spec bonus is a roll-time thing layered on top of `skTotal`; don't conflate.

## I/O & Edge-Case Matrix

| Site | Scenario | Pre-fix | Post-fix |
|---|---|---|---|
| **Influence calc** | Char with Resources via `free_inv` channel only (rating=0 stored) | `calcMeritInfluence` returns 0; merit doesn't count | Returns the threshold-derived contribution from effective rating |
| **Influence calc** | Char with Allies via Excel `free` column (rating=0 stored) | Returns 0 | Returns the threshold-derived contribution; `free` is in the helper's sum |
| **Influence calc** | Char with Honey with Vinegar + Allies effective 4 | Reads `m.rating` (potentially wrong) | Reads effective; applies HwV threshold (4→2) |
| **Influence calc** | Char with Contacts spread across two entries (`Contacts (Police) ●●` + `Contacts (Bureaucracy) ●●`) | Sums `m.rating` (per-entry stored value) | Sums `meritEffectiveRating(c, m)` per entry; capped at 5; threshold applied |
| **Feeding pool** | Char with Weaponry 4 + PT 4-dot Asset Skill bonus +1 (effective 5) | `skDots` returns 4; pool understates by 1 | `skTotal` returns 5; pool correct |
| **Feeding pool** | Char with Brawl 3 + MCI 3-dot bonus +1 (effective 4) | `skDots` returns 3 | `skTotal` returns 4 |
| **Feeding pool** | All three feeding builders (player tab, suite tracker, admin engine) | All three read `skDots` | All three read `skTotal` |
| **Project dice pool** | Player picks Crafts 3 + Strength 3 with spec "Smithing"; native spec | Total = 6; no spec bonus, no spec picker visible | Spec picker chips render; selecting "Smithing" adds +1 (or +2 if 9-Again or AoE); total = 7 |
| **Project dice pool** | Player picks Weaponry with PT Asset Skill bonus | Total uses inherent only | Total uses `skTotal` (effective) |
| **Project dice pool** | Secondary "Dual Roll" pool active | Same bugs as primary | Same fix as primary |
| **XP picker — attribute** | Char with Strength 5 | Lists "Strength (5 → 6)" — purchasable | Strength not in dropdown |
| **XP picker — skill** | Char with Weaponry 5 (any combination) | Lists "Weaponry (5 → 6)" | Not in dropdown |
| **XP picker — skill** | Char with Brawl 4 + MCI 3-dot bonus (effective 5) | Lists "Brawl (4 → 5)" — purchase past cap | `skTotal` returns 5; not in dropdown |
| **XP picker — discipline** | Char with Cruac 5 | Lists "Cruac (5 → 6)" | Not in dropdown |
| **XP picker — rite** | Char with Cruac 3 | Lists "Cruac Rite (Level 1)", "Cruac Rite (Level 2)", "Cruac Rite (Level 3)" — generic | Lists actual named rites at ranks 1-3, filtered to ones not already owned, e.g. "Pangs of Proserpina (Cruac Rank 1)" |
| **XP picker — rite** | Char with Cruac 3 already owns "Pangs of Proserpina" | "Pangs of Proserpina" not filtered | "Pangs of Proserpina" excluded from list |
| **XP picker — rite** | Char with Theban 2 | Generic "Theban Rite (Level 1)", "Theban Rite (Level 2)" | Named Theban rites at ranks 1-2, filtered |
| **XP picker — devotion** | Existing devotion logic | Unchanged | Unchanged (out of scope; devotions don't have a cap-style issue) |
| **All sites** | Char with no merits/skills/disciplines | Empty reads return 0 | Helpers handle gracefully (return 0; no thrown errors) |

## Code Map

### New: canonical helper

`public/js/data/accessors.js` — add a new export:

```js
/**
 * Effective merit rating: sum of every dot channel + dynamic bonuses.
 * Use this everywhere a calc references a merit's effective dots. Do NOT
 * read m.rating directly — it is unreliable post-import and post-edit.
 *
 * Handles:
 *   - All free_* channels (free, free_bloodline, free_pet, free_mci, free_vm,
 *     free_lk, free_ohm, free_inv, free_pt, free_mdb, free_sw)
 *   - cp + xp
 *   - Herd's dynamic SSJ + Flock bonus
 *   - Shared domain merit partner totals (delegates to domMeritTotal)
 *
 * @param {object} c - character
 * @param {object} m - merit entry
 * @returns {number}
 */
export function meritEffectiveRating(c, m) {
  if (!c || !m) return 0;
  // Shared domain merits: domMeritTotal pulls in partners + SSJ/Flock
  if (m.category === 'domain' && (m.shared_with || []).length > 0) {
    return domMeritTotal(c, m.name);
  }
  const sum = (m.cp || 0) + (m.xp || 0) + (m.free || 0)
    + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0)
    + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0)
    + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0);
  if (m.name === 'Herd') {
    return sum + ssjHerdBonus(c) + flockHerdBonus(c);
  }
  return sum;
}
```

Imports needed at top of `accessors.js`: `domMeritTotal`, `ssjHerdBonus`, `flockHerdBonus` from `editor/domain.js`. Watch for circular imports — `domain.js` imports from `accessors.js`. If circular, do dynamic import or move the three helpers (or move `meritEffectiveRating` into `domain.js` and re-export from `accessors.js`).

### Site 1: Influence calc — `public/js/editor/domain.js`

Lines 109-148 currently read `m.rating || 0`. Three functions to update:

`calcMeritInfluence(m, hwv)` at line 116 — change signature to `calcMeritInfluence(c, m, hwv)`:
```js
export function calcMeritInfluence(c, m, hwv = false) {
  if (m.name === 'Contacts') return 0;
  const r = meritEffectiveRating(c, m);  // was: m.rating || 0
  // ...rest unchanged
}
```

`calcContactsInfluence(c)` at line 139 — replace the reduce body:
```js
const total = Math.min(5, (c.merits || [])
  .filter(m => m.category === 'influence' && m.name === 'Contacts')
  .reduce((s, m) => s + meritEffectiveRating(c, m), 0));  // was: s + (m.rating || 0)
```

`calcTotalInfluence(c)` at line 286 — already passes `c`; just thread it through the `calcMeritInfluence` call:
```js
(c.merits || []).filter(m => m.category === 'influence').forEach(m => {
  total += calcMeritInfluence(c, m, hwv);  // was: calcMeritInfluence(m, hwv)
});
// MCI at 5 dots check at line 299:
if (mci && meritEffectiveRating(c, mci) >= 5) total += 1;  // was: mci.rating >= 5
```

`influenceBreakdown(c)` at line 308 — same threading:
```js
for (const m of inflM) {
  const inf = calcMeritInfluence(c, m, hwv);  // was: calcMeritInfluence(m, hwv)
  // ...
}
const mci = (c.merits || []).find(m => m.name === 'Mystery Cult Initiation');
if (mci && meritEffectiveRating(c, mci) >= 5) lines.push('MCI 5: 1');  // was: mci.rating >= 5
```

Also update `attacheBonusDots(c, meritName)` at line 254 if it reads any `m.rating` — verify and replace if so.

### Site 2: Feeding pool — three duplicate builders

**`public/js/tabs/feeding-tab.js:404-434`** (`buildPool`):
```js
let bestS = '', bestSV = 0, bestSpecs = [];
for (const s of method.skills) {
  const v = skTotal(c, s);  // was: skDots(c, s)
  if (v > bestSV) { bestSV = v; bestS = s; bestSpecs = c.skills?.[s]?.specs || []; }
}
```
Add `skTotal` to the import at line 14: already imports from `'../data/accessors.js'`; just add to the destructured list.

**`public/js/admin/feeding-engine.js:75-104`** (`buildPool`):
```js
let bestSkillVal = 0, bestSkillName = '', bestSkillSpec = '';
for (const s of m.skills) {
  const v = skTotal(feedChar, s);  // was: skDots(feedChar, s)
  // ...
}
```
Verify `skTotal` is imported; add if not.

**`public/js/suite/tracker-feed.js:75-91`** (legacy suite tracker):
```js
m.skills.forEach(s => {
  const v = skTotal(c, s);  // was: skDots(c, s)
  // ...
});
```

### Site 3: XP picker — `public/js/tabs/downtime-form.js:3360-3458`

**Attribute branch** (line 3363-3368):
```js
case 'attribute':
  return ALL_ATTRS.map(a => {
    const v = c.attributes?.[a];
    const dots = v ? (v.dots || 0) + (v.bonus || 0) : 0;
    if (dots >= 5) return null;  // NEW: cap check
    return { value: a, label: `${a} (${dots} → ${dots + 1})` };
  }).filter(Boolean);  // NEW: drop nulls
```
(Note: attributes don't have PT/MCI bonus channels, so `dots + bonus` is sufficient. If a future story adds attribute-bonus channels, swap to a helper.)

**Skill branch** (line 3369-3374):
```js
case 'skill':
  return ALL_SKILLS.map(s => {
    const dots = skTotal(c, s);  // was: (v.dots || 0) + (v.bonus || 0)
    if (dots >= 5) return null;  // NEW: cap check
    return { value: s, label: `${s} (${dots} → ${dots + 1})` };
  }).filter(Boolean);
```
Add `skTotal` to imports.

**Discipline branch** (line 3375-3387):
```js
case 'discipline': {
  const owned = Object.keys(c.disciplines || {});
  const clanDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline])
    || (c.clan && CLAN_DISCS[c.clan]) || [];
  // DTLT-3 added the canonical filter; keep it
  const bloodlineDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline]) || [];
  const validDiscs = new Set([...CORE_DISCS, ...RITUAL_DISCS, ...bloodlineDiscs]);
  const all = [...new Set([...clanDiscs, ...CORE_DISCS, ...owned])]
    .filter(d => validDiscs.has(d))
    .sort();
  return all.map(d => {
    const dots = c.disciplines?.[d]?.dots || 0;
    if (dots >= 5) return null;  // NEW: cap check
    const cost = isClanDisc(d) ? 3 : 4;
    const tag = isClanDisc(d) ? 'clan' : 'out';
    return { value: d, label: `${d} (${dots} → ${dots + 1}) [${tag}, ${cost} XP]` };
  }).filter(Boolean);
}
```

**Rite branch** (line 3442-3458) — full rebuild:
```js
case 'rite': {
  const cruacLevel = c.disciplines?.Cruac?.dots || 0;
  const thebanLevel = c.disciplines?.Theban?.dots || 0;
  if (cruacLevel === 0 && thebanLevel === 0) return [];

  // Rites already on the character — exclude
  const ownedRiteNames = new Set(
    (c.powers || [])
      .filter(p => p.category === 'rite')
      .map(p => p.name)
  );

  // Pull from the rules cache (same source as the sheet rite drawer)
  const allRites = getRulesByCategory('rite') || [];
  const items = [];
  for (const rule of allRites) {
    if (ownedRiteNames.has(rule.name)) continue;
    const tradition = rule.parent;  // 'Cruac' or 'Theban'
    const charRank = tradition === 'Cruac' ? cruacLevel
                   : tradition === 'Theban' ? thebanLevel
                   : 0;
    if (charRank === 0) continue;  // character can't access this tradition
    const rank = rule.rank || 1;
    if (rank > charRank) continue;  // beyond their rating
    items.push({
      value: rule.name,
      label: `${rule.name} (${tradition} Rank ${rank})`,
    });
  }
  // Sort by tradition then rank then name
  items.sort((a, b) => a.label.localeCompare(b.label));
  return items;
}
```

The `getRulesByCategory` import already exists for the merit branch usage at line 3399. The rite cost (`xp_fixed` field on the rule, if present) can replace the hardcoded `case 'rite': return 4;` at `getXpCost` line 3355 if rite costs ever become non-uniform. For now, keep `return 4` — out of scope for this story.

### Site 4: Project dice pool — `public/js/tabs/downtime-form.js:3221-3282` (render) + `:4075-4096` (reactive update)

**Render — `renderDicePool` at line 3221:**

The function is called for both primary and secondary pools (line 3148 + line 3322). Changes apply once and cover both via the `prefix` parameter.

Replace the inline reads at line 3229-3239:
```js
let total = 0;
let bestSpecs = [];
if (savedAttr) {
  const a = currentChar.attributes?.[savedAttr];
  if (a) total += (a.dots || 0) + (a.bonus || 0);
}
if (savedSkill) {
  total += skTotal(currentChar, savedSkill);  // was: (s.dots || 0) + (s.bonus || 0)
  bestSpecs = currentChar.skills?.[savedSkill]?.specs || [];
}
if (savedDisc) {
  total += currentChar.disciplines?.[savedDisc]?.dots || 0;
}
const savedSpec = saved[`${prefix}_spec`] || '';
if (savedSpec && bestSpecs.includes(savedSpec)) {
  const na = skNineAgain(currentChar, savedSkill);
  total += (na || hasAoE(currentChar, savedSpec)) ? 2 : 1;
}
```

Add a spec chip row inside the function, rendered AFTER the three dropdowns and BEFORE the total span (around line 3279):
```js
// Spec chip row — only when a skill is selected and has specs
if (savedSkill && bestSpecs.length > 0) {
  h += `<div class="dt-pool-spec-row" data-pool-spec-prefix="${prefix}">`;
  h += `<span class="dt-pool-spec-label">Specialty:</span>`;
  for (const sp of bestSpecs) {
    const on = savedSpec === sp ? ' dt-pool-spec-on' : '';
    const bonus = (skNineAgain(currentChar, savedSkill) || hasAoE(currentChar, sp)) ? 2 : 1;
    h += `<button type="button" class="dt-pool-spec-chip${on}" data-pool-spec="${esc(prefix)}" data-spec-name="${esc(sp)}">${esc(sp)} <span class="dt-pool-spec-bonus">+${bonus}</span></button>`;
  }
  h += `<input type="hidden" id="dt-${prefix}_spec" value="${esc(savedSpec)}">`;
  h += '</div>';
}
```
Reuse the existing `.dt-feed-spec-row`/`.dt-feed-spec-chip`/`.dt-feed-spec-on`/`.dt-feed-spec-bonus` CSS class names if the styling matches; otherwise create `.dt-pool-spec-*` classes mirroring those rules in the same CSS file.

**Click handler** — wire spec chip click. Find the existing chip click handler block (around line 2390 area where `data-feed-chip-attr` etc. are handled) and add:
```js
// Project dice pool spec chip — single-select per prefix
const poolSpecChip = e.target.closest('[data-pool-spec]');
if (poolSpecChip) {
  const prefix = poolSpecChip.dataset.poolSpec;
  const specName = poolSpecChip.dataset.specName;
  const hidden = document.getElementById(`dt-${prefix}_spec`);
  const currentVal = hidden?.value || '';
  const newVal = currentVal === specName ? '' : specName;  // toggle off if same
  if (hidden) hidden.value = newVal;
  // Re-render to update total and chip-on state
  const responses = collectResponses();
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  return;
}
```

**Collector — `collectResponses`** (line 480 area, where pool fields are gathered):
Add `${prefix}_spec` collection per pool. Find where `pool_attr`, `pool_skill`, `pool_disc` are collected (search for `pool_attr`); add `_spec` alongside.

**Reactive update — `updatePoolTotal` at line 4075-4096:**
```js
function updatePoolTotal(prefix) {
  const attrEl = document.getElementById(`dt-${prefix}_attr`);
  const skillEl = document.getElementById(`dt-${prefix}_skill`);
  const discEl = document.getElementById(`dt-${prefix}_disc`);
  const specEl = document.getElementById(`dt-${prefix}_spec`);
  const totalEl = document.getElementById(`${prefix}_total`);
  if (!totalEl) return;

  let total = 0;
  if (attrEl?.value) {
    const a = currentChar.attributes?.[attrEl.value];
    if (a) total += (a.dots || 0) + (a.bonus || 0);
  }
  if (skillEl?.value) {
    total += skTotal(currentChar, skillEl.value);  // was inline
  }
  if (discEl?.value) {
    total += currentChar.disciplines?.[discEl.value]?.dots || 0;
  }
  if (specEl?.value && skillEl?.value) {
    const specs = currentChar.skills?.[skillEl.value]?.specs || [];
    if (specs.includes(specEl.value)) {
      const na = skNineAgain(currentChar, skillEl.value);
      total += (na || hasAoE(currentChar, specEl.value)) ? 2 : 1;
    }
  }
  totalEl.textContent = total || '—';
}
```

### Imports to verify / add

| File | Add to imports |
|---|---|
| `public/js/data/accessors.js` | `domMeritTotal`, `ssjHerdBonus`, `flockHerdBonus` from `'../editor/domain.js'` (mind circular imports — see Code Map note) |
| `public/js/editor/domain.js` | `meritEffectiveRating` from `'../data/accessors.js'` (replaces the local helper at downtime-form.js:260 — that local one is then deleted, see below) |
| `public/js/tabs/feeding-tab.js` | `skTotal` |
| `public/js/admin/feeding-engine.js` | `skTotal` |
| `public/js/suite/tracker-feed.js` | `skTotal` |
| `public/js/tabs/downtime-form.js` | `skTotal`, `skNineAgain`, `hasAoE` (likely already imported), `RITUAL_DISCS`, `getRulesByCategory` (already imported) |

### Helpers to delete after the swap

`public/js/tabs/downtime-form.js:260-271` — local `effectiveMeritRating` shadow. Replace all callers (search for `effectiveMeritRating(` in the file) with the canonical import. Keep `effectiveDomainDots` at line 274 (different shape — looks up a domain merit by name first).

## Tasks & Acceptance

**Execution:**

- [ ] Add `meritEffectiveRating(c, m)` to `public/js/data/accessors.js`. Resolve circular-import risk (move helpers or use dynamic import).
- [ ] Refactor `public/js/editor/domain.js`: thread `c` through `calcMeritInfluence`; replace `m.rating || 0` reads with `meritEffectiveRating(c, m)` in `calcMeritInfluence`, `calcContactsInfluence`, `calcTotalInfluence`, `influenceBreakdown`. Audit `attacheBonusDots` for any `m.rating` reads.
- [ ] Replace `skDots` with `skTotal` in three feeding builders: `tabs/feeding-tab.js:416`, `admin/feeding-engine.js:87`, `suite/tracker-feed.js:89`.
- [ ] XP picker (`tabs/downtime-form.js:3360-3458`):
  - Attribute branch: cap-at-5.
  - Skill branch: use `skTotal`, cap-at-5.
  - Discipline branch: cap-at-5.
  - Rite branch: rebuild against `getRulesByCategory('rite')` with tradition + rank filter and `ownedRiteNames` exclusion.
- [ ] Project dice pool (`tabs/downtime-form.js`):
  - `renderDicePool` at line 3221: use `skTotal`; add spec chip row.
  - `updatePoolTotal` at line 4075: use `skTotal`; include spec bonus.
  - Spec chip click handler in the `container.addEventListener('click', ...)` block.
  - Spec collection in `collectResponses` for both `pool` and `pool2` prefixes.
- [ ] Delete the local `effectiveMeritRating` at `tabs/downtime-form.js:260-271`. Update its callers to import from `accessors.js`.
- [ ] Manual smoke per Verification.

**Acceptance Criteria:**

- **T3 — Influence:**
  - Given a character with Resources via `free_inv` channel only (rating stored as 0, but free_inv = 3), when `calcTotalInfluence(c)` runs, then Resources contributes 1 influence (threshold at 3 dots).
  - Given a character with Allies 5 effective via mixed channels, when `calcTotalInfluence(c)` runs, then Allies contributes 2 influence.
  - Given a character with `m.rating` correctly set (Eve case), when `calcTotalInfluence(c)` runs, then result is unchanged from pre-fix (no regression for already-correct data).
  - Given the sheet's influence breakdown tooltip renders, when channels-only merits exist, then they appear in the breakdown with their effective contribution.
- **T4 — Feeding pool:**
  - Given a character with Weaponry 4 + PT Asset Skill bonus on Weaponry, when picking a feeding method that uses Weaponry, then the pool reflects `skTotal` = 5.
  - Given the Game-app player feeding tab, the legacy suite tracker, and the admin feeding engine all build a pool for the same character + method, then all three return the same total.
- **T21 — XP picker:**
  - Given a character with Strength 5, when the XP Spend → Attribute dropdown renders, then Strength is not listed.
  - Given a character with Weaponry 5 (any combination of inherent + bonus), when the XP Spend → Skill dropdown renders, then Weaponry is not listed.
  - Given a character with Cruac 5, when the XP Spend → Discipline dropdown renders, then Cruac is not listed.
  - Given a character with Cruac 3, when the XP Spend → Rite dropdown renders, then it lists named Cruac rites at ranks 1-3 only, excluding any rites the character already owns.
  - Given the rules cache has 0 rites, when the XP Spend → Rite dropdown renders, then it returns an empty list (no errors thrown).
- **T23 — Project dice pool:**
  - Given a player picks a skill with specialties on a project slot, when the pool renders, then a spec chip row appears with the available specs.
  - Given the player clicks a spec chip, when the form re-renders, then the chip is selected and the total includes +1 (or +2 if 9-Again or AoE).
  - Given the player clicks the same chip again, when the form re-renders, then the chip is deselected and the bonus is removed.
  - Given a character with Brawl + PT Asset Skill bonus, when the project dice pool builds, then the total reflects effective Brawl (`skTotal`).
  - Given the secondary "Dual Roll" pool is enabled, when both primary and secondary pools render, then both have spec chip rows and both use `skTotal`.

## Verification

**Commands:**

- No new tests required at the unit level (refactor preserves API). Existing suites should remain green:
  - `cd server && npx vitest run` — all parallel-write contracts continue to pass (the rules engine doesn't read merit ratings via `m.rating`; this story doesn't touch that path).
  - Open browser console for the player DT form and admin sheet — no thrown errors during render or interaction.

**Manual checks:**

1. **Ballsack vs Eve influence (the original report):**
   - Open Eve's sheet. Note her influence total + breakdown. Compare to pre-fix — should be unchanged.
   - Open Ballsack's sheet. His Resources merit should now contribute to influence per its effective rating. The original `Ballsack has Resources but no influence` symptom is gone.
2. **Feeding pool parity:**
   - Pick a character with PT 4-dot Asset Skills granting +1 to Weaponry. Open the Game-app feeding tab and pick a method that uses Weaponry. Confirm pool reflects effective Weaponry.
   - Same character: open the legacy suite tracker `tabs/feeding-tab.js` (if reachable) — same pool.
   - Same character: open admin feeding engine — same pool.
3. **XP picker caps:**
   - Pick a character with one capped attribute, one capped skill, one capped discipline. Open XP Spend on a project slot. Confirm capped traits are absent from each dropdown.
4. **XP picker rites:**
   - Pick a character with Cruac 3 and at least one rite already owned. Open XP Spend → Rite. Confirm the dropdown lists named Cruac rites at ranks 1-3, excluding the owned one. Confirm Theban rites are absent (character has no Theban).
   - Switch to a Cruac 0 / Theban 2 character. Confirm Theban rites at ranks 1-2 appear, no Cruac rites.
5. **Project dice pool spec:**
   - Configure a project action with a skill that has specs (e.g. Crafts → Smithing). Confirm the spec chip row appears below the skill dropdown. Click "Smithing" — pool total +1 (or +2 if 9-Again applies). Click again — back to baseline.
   - Add a secondary pool ("Dual Roll"). Confirm spec row appears for the secondary skill independently. Toggle a secondary spec; confirm only the secondary total updates.
6. **No regression on the merit XP picker (the model branch):**
   - Configure a project XP spend on a Merit. Confirm the dropdown still shows merits the character can purchase, capped at `rating_range.max` (per existing logic). No behavioural change here — just confirming the model branch is untouched.

## Final consequence

Four readers stop reading inherent dots and start reading effective rating. The recurring bug class flagged in `feedback_effective_rating_discipline.md` is closed at the four highest-impact sites in the codebase. `m.rating` becomes a vestigial display hint — calc paths route around it.

The merit XP picker remains the canonical pattern (`effectiveMeritRating` + `if (currentDots >= max) continue`). The new `meritEffectiveRating` helper extracted to `accessors.js` is the single source of truth for "merit effective rating" — future readers grab it from there instead of inlining yet another channel-summation expression.

The project dice pool gains the spec picker it should always have had, parity with the feeding tab. The XP picker's rite branch starts honouring the rite catalog instead of generating placeholder strings — players see actual named rites filtered to the ones they don't own yet.

After dtlt-3 (Theme purge, runs first) and dtlt-4 (this story), the XP picker's discipline branch is finally clean: filtered against canonical names, capped at 5, no phantom themes, no past-cap purchases.
