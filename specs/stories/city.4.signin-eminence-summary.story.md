# Story: city.4 — Sign-In Tab: Live Eminence Summary + Attendance Tab Audit

## Status: review

## Summary

Two related items: (1) The game app Sign-In tab should show a live Eminence & Ascendancy top-2 summary that updates as attendances are ticked. (2) The "attendance tab" in the ST page that reportedly does nothing should be investigated and removed or repurposed.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/game/signin-tab.js` | Add live top-2 Eminence/Ascendancy header block |
| Admin/game app HTML or JS | Investigate and remove/repurpose redundant attendance tab if confirmed empty |

---

## Acceptance Criteria

1. The Sign-In tab renders a compact top-2 block above the attendee list showing: top 2 clans by Eminence (sum of `status.city` of attended chars) and top 2 covenants by Ascendancy
2. The top-2 block updates live as STs tick the attendance checkboxes
3. If fewer than 2 clans/covenants have any attended status, show however many exist
4. Any ST-facing tab confirmed to render nothing is removed from the navigation

---

## Tasks / Subtasks

- [x] Add live top-2 block to Sign-In tab (AC: #1, #2, #3)
  - [x] Write `calcEminence(session, chars)` helper — returns `{ eminence: [{name, total}], ascendancy: [{name, total}] }` sorted descending, top 2 only
  - [x] Call helper inside `render()` and render a compact summary block at top of `_el`
  - [x] Block re-renders on every attendance tick (existing `render()` is already called on each tick)
- [x] Investigate and remove redundant attendance tab (AC: #4)
  - [x] Audited all ST tab surfaces in both `index.html` and `admin.html`
  - [x] No dead/empty attendance tab found — game app Sign-In is functional, admin Attendance & Finance is functional
  - [x] No removal needed

---

## Dev Notes

### calcEminence helper

```js
function calcEminence(session, chars) {
  const attendedIds = new Set(
    (session?.attendance || []).filter(a => a.attended).map(a => String(a.character_id))
  );
  const em = {}, asc = {};
  for (const c of chars) {
    if (!attendedIds.has(String(c._id))) continue;
    const cs = c.status?.city || 0;
    if (c.clan)     em[c.clan]       = (em[c.clan]       || 0) + cs;
    if (c.covenant) asc[c.covenant]  = (asc[c.covenant]  || 0) + cs;
  }
  const top = (obj) => Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,2).map(([k,v]) => ({ name: k, total: v }));
  return { eminence: top(em), ascendancy: top(asc) };
}
```

### Sign-In tab data

`_session` and `_chars` are already module-level in `signin-tab.js`. The helper can be called directly in `render()`.

### Compact summary HTML

A small two-column block (`si-eminence-block`) at the top of the sign-in content:
- Left: "Eminence — 1st clan (N) · 2nd clan (N)"
- Right: "Ascendancy — 1st covenant (N) · 2nd covenant (N)"

Keep it minimal — the full breakdown lives in the City view.

### Redundant tab investigation

The admin.html Attendance & Finance domain (`#d-attendance`) is fully functional — do NOT remove.
The game app Sign-In tab (`id: 'signin'`, stOnly) is fully functional — do NOT remove.
Investigation should check for any other tab surface (e.g. a bottom nav item or sidebar button) that maps to an empty div.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `calcEminence(session, chars)` added to `signin-tab.js` — top-2 clans and covenants by summed city status of attended chars
- Summary block (`si-eminence-block`) renders above the attendee list, recalculates on every `render()` call (triggered by each attendance tick)
- Audit: no dead attendance tab exists — both Sign-In (game app) and Attendance & Finance (admin) are fully functional
- CSS: 3 new rules in `suite.css` for the eminence block

### File List

- `public/js/game/signin-tab.js`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented city.4 — live eminence top-2 in Sign-In tab; attendance tab audit (no removal needed)
