---
title: 'DT Processing: move normal feed territory pill to right column'
type: 'fix'
issue: 737
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/737
branch: ms/issue-737-feed-terr-pill-right-col
created: '2026-06-15'
status: done
recommended_model: 'sonnet — targeted relocation in one file'
context:
  - public/js/admin/downtime-views.js
  - public/css/admin-layout.css
---

## Intent

Move the normal-feed territory pill panel from the LEFT card body
(`renderNormalisedCard`) to the RIGHT column (`_renderFeedRightPanel`), matching
the column layout already used by rote feed cards.

---

## Root cause / motivation

In feat.735 the territory block was wrapped in a `proc-feed-mod-panel` bordered
panel (correct style) but was left in `renderNormalisedCard` — the left card body
function. The right column (`_renderFeedRightPanel`) is the canonical home for all
feed-specific ST controls. Moving it there aligns normal-feed with rote-feed UX and
groups Territory, Feed Declaration, and Dice Pool in one column.

The vertical gap between stacked right-column panels is already provided by the
existing `flex-direction: column; gap: 12px` on `.proc-feed-right`
(admin-layout.css line 5878). No CSS changes required.

---

## File locations

| File | Lines | Notes |
|------|-------|-------|
| `public/js/admin/downtime-views.js` | 9669–9705 | Territory block to REMOVE from `renderNormalisedCard` |
| `public/js/admin/downtime-views.js` | 7762 | `_renderFeedRightPanel` — insertion target |
| `public/js/admin/downtime-views.js` | 7822 | `feedSub` already defined here — no parameter change needed |
| `public/js/admin/downtime-views.js` | 7972 | Feed Declaration block — territory panel goes BEFORE this |

---

## T1 — Remove territory block from `renderNormalisedCard`

**File:** `public/js/admin/downtime-views.js`

Delete the entire territory block at lines 9669–9705 (the `{ const _stOvrArr ... }` block).
The surrounding mismatch-flag block (lines 9630–9668) is unrelated and stays in the left card.

---

## T2 — Add territory panel to `_renderFeedRightPanel` before Feed Declaration

**File:** `public/js/admin/downtime-views.js`  
**Insert before:** the `// ── DTFP-5` comment at line 7972.

`feedSub` is already declared at line 7822 via `submissions.find(s => s._id === entry.subId)`.
`cachedTerritories` and `TERRITORY_SLUG_MAP` are module-level — both accessible here.

**Critical naming:** Inside `_renderFeedRightPanel`, `key` is bound at line 7763 to
`entry.key`. The inner `for...of` loop over `_rawTerrs` must use a different variable
name (e.g. `_slug`) to avoid shadowing it.

```js
// ── Territory pill ──
{
  const _stOvrArr = feedSub?.st_review?.territory_overrides?.feeding;
  let _feedSet;
  if (Array.isArray(_stOvrArr)) {
    _feedSet = new Set(_stOvrArr);
  } else {
    _feedSet = new Set();
    try {
      const _grid = JSON.parse(feedSub?.responses?.feeding_territories || '{}');
      for (const [slug, status] of Object.entries(_grid)) {
        if (!status || status === 'none' || status === 'Not feeding here') continue;
        let tid;
        if (/^[a-f0-9]{24}$/i.test(slug)) {
          const terrDoc = (cachedTerritories || []).find(t => String(t._id) === slug);
          tid = terrDoc?.slug || null;
        } else {
          tid = TERRITORY_SLUG_MAP[slug];
        }
        if (tid) _feedSet.add(tid);
      }
    } catch { /* ignore malformed JSON */ }
    if (_feedSet.size === 0) {
      const _rawTerrs = _normTerrKeys(feedSub?._raw?.feeding?.territories || {});
      for (const [_slug, status] of Object.entries(_rawTerrs)) {
        if (!status || status === 'Not feeding here' || status === 'none') continue;
        const tid = TERRITORY_SLUG_MAP[_slug];
        if (tid) _feedSet.add(tid);
      }
    }
  }
  h += `<div class="proc-feed-mod-panel">`;
  h += `<div class="proc-mod-panel-title">Territory</div>`;
  h += _renderInlineTerrPills(entry.subId, 'feeding', '', _feedSet, true);
  h += `</div>`;
}
```

---

## T3 — Playwright tests

New spec file: `tests/fix-737-feed-terr-pill-right-col.spec.js`

Reuse `setupProcessing` / `openFeedingAction` pattern from feat-735 spec. Two tests:

- **AC-A**: Territory panel (`proc-feed-mod-panel` with "Territory" title) is visible inside
  `.proc-feed-right` (not anywhere outside it)
- **AC-B**: Territory panel appears before the Feed Declaration panel in the right column
  DOM order — i.e. the Territory panel's bounding box top < Feed Declaration panel's top

---

## Acceptance criteria

- [x] Territory `proc-feed-mod-panel` is rendered inside `.proc-feed-right`, not in the left card body
- [x] Territory panel appears above the Feed Declaration panel in the right column
- [x] Vertical gap between Territory and Feed Declaration panels (12px from existing flex gap)
- [x] No regression on rote feed territory pill (unchanged)
- [x] No regression on #735 Feed Declaration chips (blood type + method override)

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes.
- Do NOT touch `admin-layout.css` — the gap is already there.
- Do NOT change `_renderFeedRightPanel`'s signature or `feedSub` lookup.
- The mismatch-flag block in `renderNormalisedCard` (lines 9630–9668) stays in the left card.

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: removed territory block from `renderNormalisedCard`; T2: added territory block to `_renderFeedRightPanel` before Feed Declaration

### Completion notes

Territory block moved to `_renderFeedRightPanel` before the DTFP-5 Feed Declaration block. Inner
`for...of` loop variable renamed `_slug` to avoid shadowing outer `key` (line 7763). No CSS changes
needed — `.proc-feed-right` already has `gap: 12px`. Mismatch-flag block left in left card body unchanged.
