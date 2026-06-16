---
id: fix.685
title: Shared merit — gate partner bonus on own dot investment; render as third dot tier
status: review
issue: 685
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/685
branch: ms/issue-685-shared-merit-min-dot-gate
type: bug
---

## Story

As an ST managing shared domain merits, I want the system to enforce the rule that
a character must have at least 1 own dot (inherent OR bonus) before they can draw
on partner-contributed dots, and I want partner-contributed dots to appear as a
visually distinct third tier (underlined hollow) so they are distinguishable from
both inherent (filled) and bonus (hollow) dots.

## Acceptance criteria

- [ ] A character with 0 own dots (no cp, no xp, no free_*) in a shared merit
  receives 0 effective dots from the partner — the partner contribution is blocked
- [ ] A character with ≥1 own dot (inherent OR bonus — any channel counts) receives
  the full partner contribution as normal
- [ ] Einar's own effective total is unchanged — 0-dot stubs on partners do not
  affect the primary owner's calculation
- [ ] Safe Place, Feeding Grounds, Herd, and all other shareable domain merit types
  apply the same gate
- [ ] In the read-only sheet view, a shared merit renders three tiers:
  filled ● for inherent (cp+xp), hollow ○ for bonus (free_*), underlined hollow
  for shared (partner-contributed) dots
- [ ] In the edit-mode "My dots" label, shared dots are not shown (that label
  shows own dots only — inherent + bonus)

---

## Dev notes

### Concept: three dot tiers

| Tier | Source | Display |
|------|--------|---------|
| Inherent | cp + xp | ● filled |
| Bonus | free_* channels (MCI grants, ST free, fwb, attache, etc.) | ○ hollow |
| Shared | partner contribution via `shared_with` | ○ hollow + underlined |

Eligibility: shared tier is only non-zero if `domMeritContribSingle(c, m) >= 1`
(inherent + bonus combined). A 0-dot stub has `domMeritContribSingle = 0` → shared = 0.

Effective rating for display = inherent + bonus + shared.

---

### Part 1 — Calculation gate in `public/js/editor/domain.js`

Three functions need the gate. The gate condition is the same in all three:
**`domMeritContribSingle(c, m) >= 1`** (any own dot from any channel).

---

#### 1a — `domMeritTotalSingle` (line 73–91)

Used by multi-instance types (Safe Place, Feeding Grounds) and the Haven/MG cap.

```js
// BEFORE:
function domMeritTotalSingle(c, m) {
  const own = domMeritContribSingle(c, m);
  const partners = m.shared_with || [];
  const key = domKey(m);
  let partnerTotal = 0;
  for (const pName of partners) { ... partnerTotal += domMeritShareableSingle(pm); }
  if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
    partnerTotal = m._partner_dots;
  }
  return Math.min(5, own + partnerTotal);
}

// AFTER — wrap the partner block in the gate:
function domMeritTotalSingle(c, m) {
  const own = domMeritContribSingle(c, m);
  const partners = m.shared_with || [];
  const key = domKey(m);
  let partnerTotal = 0;
  if (own >= 1) {
    for (const pName of partners) {
      const p = (state.chars || []).find(ch => ch.name === pName);
      if (p) {
        const pm = (p.merits || []).find(pm2 =>
          pm2.category === 'domain' && pm2.name === m.name && domKey(pm2) === key
        );
        if (pm) partnerTotal += domMeritShareableSingle(pm);
      }
    }
    if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
      partnerTotal = m._partner_dots;
    }
  }
  return Math.min(5, own + partnerTotal);
}
```

---

#### 1b — `domMeritTotal` singleton path (line 177–193)

Used by Haven, Herd, and other singleton domain merits.

```js
// BEFORE:
const own = domMeritContribSingle(c, m);
const partners = m.shared_with || [];
let partnerTotal = 0;
for (const pName of partners) {
  const p = (state.chars || []).find(ch => ch.name === pName);
  if (p) partnerTotal += domMeritShareable(p, name);
}
if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
  partnerTotal = m._partner_dots;
}
const total = own + partnerTotal;
const cap = (name === 'Herd' && flockHerdBonus(c) > 0) ? Infinity : 5;
return Math.min(cap, total);

// AFTER — same gate:
const own = domMeritContribSingle(c, m);
const partners = m.shared_with || [];
let partnerTotal = 0;
if (own >= 1) {
  for (const pName of partners) {
    const p = (state.chars || []).find(ch => ch.name === pName);
    if (p) partnerTotal += domMeritShareable(p, name);
  }
  if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
    partnerTotal = m._partner_dots;
  }
}
const total = own + partnerTotal;
const cap = (name === 'Herd' && flockHerdBonus(c) > 0) ? Infinity : 5;
return Math.min(cap, total);
```

---

#### 1c — `domMeritAccess` partner-scan (line 298–309)

After the above fixes, `domMeritTotal(c, name)` returns 0 for a 0-dot character.
But the partner-scan fallback at lines 301–307 still fires and returns the
partner's total. This scan must also be gated.

`domMeritContrib(c, name)` is the exported multi-instance-safe version of
`domMeritContribSingle` and is the right check here.

```js
// BEFORE:
export function domMeritAccess(c, name) {
  const own = domMeritTotal(c, name);
  if (own > 0) return own;
  for (const partner of (state.chars || [])) {
    const pm = (partner.merits || []).find(m =>
      m.category === 'domain' && m.name === name &&
      (m.shared_with || []).includes(c.name)
    );
    if (pm) return domMeritTotal(partner, name);
  }
  return 0;
}

// AFTER — add own-dot gate before the partner scan:
export function domMeritAccess(c, name) {
  const own = domMeritTotal(c, name);
  if (own > 0) return own;
  if (domMeritContrib(c, name) < 1) return 0;
  for (const partner of (state.chars || [])) {
    const pm = (partner.merits || []).find(m =>
      m.category === 'domain' && m.name === name &&
      (m.shared_with || []).includes(c.name)
    );
    if (pm) return domMeritTotal(partner, name);
  }
  return 0;
}
```

---

### Part 2 — Three-tier dot rendering in `public/js/editor/sheet.js`

#### 2a — New helper `shDotsThreeTier(inherent, bonus, shared)`

Add alongside `shDotsMixed` (line 138). The underlined hollow dot wraps each
character in a `<span class="dot-shared">` tag.

```js
// Add after shDotsMixed (~line 142):
function shDotsThreeTier(inherent, bonus, shared) {
  let h = '';
  for (let i = 0; i < inherent; i++) h += '●';
  for (let i = 0; i < bonus; i++)    h += '○';
  for (let i = 0; i < shared; i++)   h += '<span class="dot-shared">○</span>';
  return '<span class="trait-dots">' + h + '</span>';
}
```

---

#### 2b — Update the read-only shared merit display (lines 1069–1076)

Currently the shared view uses `shDotsMixed(_shOwn, _shPart)` which collapses
bonus and shared dots into a single "hollow" bucket. Replace it with the three-tier
split using `shDotsThreeTier`.

```js
// BEFORE (lines 1069-1073):
const _shPurch = (m.cp || 0) + (m.xp || 0);
const _shOwn   = Math.min(de, _shPurch);
const _shPart  = Math.max(0, de - _shOwn);
const _shHtml  = '<div class="dom-total-view" title="● own, ○ partners">'
  + shDotsMixed(_shOwn, _shPart) + '</div>';

// AFTER — three-tier split:
const _sh3Inherent = Math.min(de, (m.cp || 0) + (m.xp || 0));
const _sh3OwnAll   = Math.min(de, (m.cp || 0) + (m.xp || 0) + meritFreeSum(m));
const _sh3Bonus    = _sh3OwnAll - _sh3Inherent;
const _sh3Shared   = Math.max(0, de - _sh3OwnAll);
const _shHtml      = '<div class="dom-total-view" title="● inherent, ○ bonus, ○̲ shared">'
  + shDotsThreeTier(_sh3Inherent, _sh3Bonus, _sh3Shared) + '</div>';
```

Note: `meritFreeSum` is already imported in sheet.js from domain.js.
`domMeritContribSingle` does NOT need to be imported — we can compute
`inherent + bonus` using `(cp+xp) + meritFreeSum(m)` which is the same subset
used for display purposes (excludes SSJ/Flock/auto-bonuses which are Herd-only,
and Herd is in `_noShare` so it never hits this code path).

---

### Part 3 — CSS for `.dot-shared`

Add to `public/css/components.css` in the dot/trait-dots section:

```css
.dot-shared {
  text-decoration: underline;
}
```

---

### What NOT to change

- `domMeritShareableSingle` / `domMeritShareable` — these compute what a
  character CONTRIBUTES. Einar's shareable dots are unaffected by this fix.
- The edit-mode "My dots" label (line 1008) already shows only the character's
  own dots (it reads from `dd` which excludes partner totals). No change needed.
- The `shared_with` link data — do not alter. A 0-dot stub stays linked.
- `_partner_dots` server-enrichment: this fallback feeds into `domMeritTotalSingle`
  and `domMeritTotal`, which are now gated — no server-side change required.
- `meritEffectiveRating` for CAP_DOMAIN (Haven, Mandragora Garden): that path
  uses the character's own cp+xp+free_* directly; it already returns 0 for a
  0-dot character without needing a change.

### What to verify after the fix

1. Open admin sheet for Rene M (0-dot Haven linked to Einar).
   - Her Haven effective dots should show 0, not 1.
2. Give Rene 1 cp dot in Haven → she should now show filled ● + Einar's
   contribution as underlined hollow ○.
3. Open Einar's sheet — his Haven total is unchanged.
4. Verify a character with only a free_mci grant (1 bonus dot, 0 cp/xp) in a
   shared merit CAN receive partner dots — the gate allows bonus dots.
5. Prereq checker: Haven 1 prereq should NOT pass for Rene at 0 own dots.

### Files to change

| File | Change |
|------|--------|
| `public/js/editor/domain.js` | `domMeritTotalSingle`: wrap partner loop in `own >= 1` |
| `public/js/editor/domain.js` | `domMeritTotal` singleton path: same gate |
| `public/js/editor/domain.js` | `domMeritAccess`: add `domMeritContrib(c, name) < 1` early-return before partner scan |
| `public/js/editor/sheet.js` | Add `shDotsThreeTier` helper after `shDotsMixed` |
| `public/js/editor/sheet.js` | Replace `_shHtml` shared-view construction with three-tier split |
| `public/css/components.css` | Add `.dot-shared { text-decoration: underline; }` |
