# Story: DT Contacts Qualifier Display

**Story ID:** lst.1
**Epic:** Live Session Toolkit — Game App QoL
**Status:** review
**Date:** 2026-04-18

---

## User Story

As a player reading my published downtime narrative, I want my Contacts merit actions to show which Contacts they belong to (e.g. "Contacts (Crime)" not just "Contacts"), so I can distinguish between multiple contact actions in the same cycle.

---

## Background & Diagnosis

This was diagnosed during party-mode architecture review. Full data path traced before writing this story.

### Data path (DT2+ structured submissions — modern format)

1. `meritLabel()` in `public/js/player/downtime-form.js:147` builds the label:
   ```js
   // merit.area || merit.qualifier = "Crime"
   // → "Contacts ●●● (Crime)"
   return area ? `${merit.name} ${dots} (${area})` : `${merit.name} ${dots}`;
   ```

2. Hidden input at line 2876 sets the value:
   ```html
   <input type="hidden" id="dt-contact_${n}_merit" value="Contacts ●●● (Crime)">
   ```

3. Form save at line 417 reads it:
   ```js
   responses[`contact_${n}_merit`] = meritEl ? meritEl.value : '';
   ```

4. `buildPlayerMeritActions()` in `story-tab.js` reads it correctly for DT2+:
   ```js
   for (let n = 1; n <= 5; n++) {
     if (!resp[`contact_${n}_request`]) continue;
     actions.push({ merit_type: resp[`contact_${n}_merit`] || 'Contacts', action_type: 'misc' });
   }
   ```

5. `renderMeritActionCards()` strips dots but preserves the qualifier:
   ```js
   const meritLabel = (a.merit_type || '')
     .replace(/\s*[●○\u25cf\u25cb]+\s*/gi, ' ')
     .replace(/\s+/g, ' ').trim();
   // "Contacts ●●● (Crime)" → "Contacts (Crime)" ✓
   ```

**Conclusion: The data path is correct for DT2+ submissions.** The qualifier is saved and will render if present.

### Known edge case — raw format (DT1 legacy / old CSV imports)

When `raw.contact_actions?.requests` exists (old DT1 format), the code always uses `contact_1_merit` for all contacts:

```js
const contactRaw = raw.contact_actions?.requests || [];
if (contactRaw.length) {
  // BUG: always uses contact_1_merit regardless of which contact
  contactRaw.forEach(() => actions.push({
    merit_type: resp[`contact_1_merit`] || 'Contacts',
    action_type: 'misc'
  }));
}
```

This means if a player had two contacts in an old-format submission, both cards would show the same label. **This is a legacy path** — all active cycle submissions use DT2+ format. Fix it anyway for correctness.

---

## Tasks

### Task 1 — Verify with live data

Query the API: `GET /api/downtime_submissions` and find a resolved submission where `responses.contact_1_request` is populated.

Check: does `responses.contact_1_merit` contain the qualifier (e.g. `"Contacts ●●● (Crime)"`) or just `"Contacts"`?

If the qualifier is present in live data → the fix is already working for DT2+ and task 2 is skip.
If the qualifier is missing → investigate why `meritLabel()` result is not being saved (check if the hidden input renders before the save handler fires).

### Task 2 — Fix raw-path bug (regardless of task 1 outcome)

In `public/js/player/story-tab.js`, `buildPlayerMeritActions()`, fix the raw contact path to use per-contact merit labels:

```js
// BEFORE:
contactRaw.forEach(() => actions.push({
  merit_type: resp[`contact_1_merit`] || 'Contacts',
  action_type: 'misc'
}));

// AFTER:
contactRaw.forEach((_, idx) => {
  const n = idx + 1;
  actions.push({
    merit_type: resp[`contact_${n}_merit`] || resp[`contact_1_merit`] || 'Contacts',
    action_type: 'misc'
  });
});
```

The fallback chain `contact_${n}_merit → contact_1_merit → 'Contacts'` handles both old and new DT1 data gracefully.

### Task 3 — Verify display in both surfaces

Confirm a player with a resolved contact action (with qualifier) sees it correctly in:
1. `player.html` → Story tab → Chronicle → merit action card
2. `index.html` (game app) → Downtime tab → `renderLatestReport()` (uses the same `renderMeritActionCards()` function)

No code change expected here — this is verification only.

---

## Acceptance Criteria

- [x] A player with a "Contacts (Crime)" action sees the card labelled "Contacts (Crime)", not "Contacts"
- [x] Display is identical in player.html Story tab and game app Downtime tab
- [x] The raw-path bug is fixed: multiple contacts in an old-format submission each show their own merit label, not all showing `contact_1_merit`
- [x] No change to card layout, styling, or other merit types

---

## Files to Change

| File | Change |
|---|---|
| `public/js/player/story-tab.js` | Fix raw-path bug in `buildPlayerMeritActions()` — use `contact_${n}_merit` per contact, not always `contact_1_merit` |

No changes to `downtime-form.js` or `downtime-story.js` — those are already correct.

---

## Critical Constraints

- **Do not touch `downtime-form.js`** — the meritLabel save path is correct.
- **Do not touch `downtime-story.js`** — the ST processing view is already correct and is the reference implementation.
- **Do not change card layout or CSS** — this is purely a data/label fix.
- **Both player.html and game app share `renderMeritActionCards()` from `story-tab.js`** — fixing it once fixes both surfaces.
- Merit action cards only render when `rev.pool || rev.pool_validated || rev.roll` — cards will only appear for contacts where the ST has recorded a roll result.

---

## Reference

- SSOT: `specs/reference-data-ssot.md`
- Shared constants: `FEED_METHODS`, `TERRITORY_DATA` live in `public/js/player/downtime-data.js`
- Related backlog item (separate story, do not implement here): `feat-8` — contacts should not show "Miscellaneous" action type chip
