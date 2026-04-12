# Story fix.22: Safe Word Shared Merit Grant

## Status: done

## Story

**As an** ST,
**I want** the Oath of the Safe Word to automatically reflect the partner's shared Social Merit on the recipient's sheet,
**so that** the oath benefit appears correctly with proper dot counts in both the admin editor and player portal.

## Background

The Oath of the Safe Word (`category: "pact"` in `powers`) has two fields set by the ST:
- `partner` — the other character's name (string)
- `shared_merit` — the Social Merit being offered (string like `"Resources"` or `"Allies (Legal)"`)

When both characters mutually link (each has the oath pointing at the other), the oath is "active". Each character offers their `shared_merit`; the partner receives a copy.

**Current failure:** `shared_merit` is stored but never acted on. There is no grant code. The WP calculation in `shRenderStats` already detects mutual linkage (`_swActive`) but nothing propagates the merit.

**Keeper/Charlie case:** Keeper has an `{ category: "influence", name: "Resources", rating: 5, granted_by: "Safe Word" }` entry that was manually added with a raw `rating` field. The admin editor ignores `rating` — it computes dots from `cp + xp + free_*` buckets only — so it renders 0 dots. The player portal reads `rating` directly, so it shows 5. The manually set `rating: 5` is also wrong (Charlie's Resources is only 1 dot). The raw `rating: 5` must be removed and replaced with correct bucket-driven data.

## Acceptance Criteria

1. `applyDerivedMerits(c, allChars = [])` accepts an optional second parameter
2. When the oath is mutually active (both sides set `partner` pointing at each other), the recipient gets `free_sw` set on the partner's `shared_merit` equal to the partner's own merit rating (computed from `cp + xp + free_*`, excluding `free_sw` itself — no circular grants)
3. If the partner's merit doesn't exist on the recipient's `merits` array, it is auto-created as `{ name, category: 'influence', granted_by: 'Safe Word', cp: 0, xp: 0 }`
4. If the oath becomes inactive (not mutual) or `shared_merit` is unset, `free_sw` is cleared to 0 and the auto-created merit (no own dots) is removed
5. `free_sw` is included in every dot-total calculation: `dd` (admin edit mode), `iBon` (admin view mode), `meritBdRow` total, `meritRating`, and the `rating` sync in `applyDerivedMerits`
6. Admin edit mode shows a note below the merit: `"Safe Word: +N dot(s) (auto) — removed if oath is removed"` (gold text, same pattern as OHM note)
7. `free_sw` initialised to 0 in `ensureMeritSync` and `addMerit`
8. `free_sw: { type: 'integer', minimum: 0 }` added to character schema merit properties
9. Keeper's `Resources` entry in `data/chars_v2.json` corrected: raw `rating: 5` removed; entry left as `{ category: "influence", name: "Resources", granted_by: "Safe Word" }` — auto-grant will set `free_sw = 1` (Charlie's Resources is 1 dot) when oath is active
10. `renderSheet` passes `state.chars` to `applyDerivedMerits`; `charAlerts` in `admin.js` passes `chars`

## Tasks / Subtasks

- [ ] Task 1: Extend `applyDerivedMerits` signature and add Safe Word grant (AC: 1, 2, 3, 4, 5)
  - [ ] In `public/js/editor/mci.js`: change signature to `export function applyDerivedMerits(c, allChars = [])`
  - [ ] After the OHM block (after line ~276) and BEFORE the rating-sync block (~line 367), add the Safe Word section:
    ```js
    // ── Safe Word: grant partner's shared_merit as free_sw dots ──
    (c.merits || []).forEach(m => { m.free_sw = 0; });
    const _swPact = (c.powers || []).find(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word');
    if (_swPact && _swPact.partner) {
      const _swPartner = allChars.find(ch => ch.name === _swPact.partner);
      const _swActive = _swPartner && (_swPartner.powers || []).some(p =>
        p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word' && p.partner === c.name
      );
      if (_swActive) {
        const _partnerPact = (_swPartner.powers || []).find(p =>
          p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word'
        );
        const _smStr = (_partnerPact && _partnerPact.shared_merit ? _partnerPact.shared_merit : '').trim();
        if (_smStr) {
          const _parenM = _smStr.match(/^(.+?)\s*\((.+)\)$/);
          const _mName = _parenM ? _parenM[1].trim() : _smStr;
          const _mArea = _parenM ? _parenM[2].trim() : '';
          const _pm = (_swPartner.merits || []).find(m =>
            m.name === _mName &&
            (!_mArea || (m.area || '').toLowerCase() === _mArea.toLowerCase() ||
                        (m.qualifier || '').toLowerCase() === _mArea.toLowerCase())
          );
          // Grant = partner's own dots only (cp + xp + free_* excluding free_sw to prevent circular)
          const _gr = _pm ? ((_pm.cp||0)+(_pm.free_bloodline||0)+(_pm.free_retainer||0)+(_pm.free_mci||0)+
            (_pm.free_vm||0)+(_pm.free_lk||0)+(_pm.free_ohm||0)+(_pm.free_inv||0)+
            (_pm.free_pt||0)+(_pm.free_mdb||0)+(_pm.xp||0)) : 0;
          if (_gr > 0) {
            let _rm = (c.merits || []).find(m =>
              m.name === _mName && m.granted_by === 'Safe Word' &&
              (!_mArea || (m.area || '').toLowerCase() === _mArea.toLowerCase())
            );
            if (!_rm) {
              if (!c.merits) c.merits = [];
              _rm = { name: _mName, category: 'influence', granted_by: 'Safe Word', cp: 0, xp: 0, free_sw: 0 };
              if (_mArea) _rm.area = _mArea;
              c.merits.push(_rm);
            }
            _rm.free_sw = _gr;
          }
        }
      } else {
        // Oath no longer active — remove auto-created SW merit if no own dots
        const _swIdx = (c.merits || []).findIndex(m =>
          m.granted_by === 'Safe Word' &&
          !(m.cp) && !(m.xp) && !(m.free_mci) && !(m.free_vm) && !(m.free_bloodline) &&
          !(m.free_retainer) && !(m.free_lk) && !(m.free_ohm) && !(m.free_inv) && !(m.free_pt) && !(m.free_mdb)
        );
        if (_swIdx !== -1) c.merits.splice(_swIdx, 1);
      }
    }
    ```
  - [ ] In the rating-sync block (mci.js ~line 372): add `+ (m.free_sw || 0)` to `total`

- [ ] Task 2: `free_sw` defaults in `merits.js` (AC: 7)
  - [ ] In `ensureMeritSync` (line ~110): add `if (m.free_sw === undefined) m.free_sw = 0;`
  - [ ] In `addMerit` (line ~126): add `if (merit.free_sw === undefined) merit.free_sw = 0;`

- [ ] Task 3: Wire `free_sw` into all dot calculations (AC: 5, 6)
  - [ ] `public/js/editor/sheet.js` line 640 — `dd` calc: add `+ (m.free_sw || 0)`
  - [ ] `public/js/editor/sheet.js` line 645 — after OHM note, add:
    ```js
    if (m.free_sw) h += '<div style="font-size:10px;color:var(--gold2);padding:2px 8px">Safe Word: +' + m.free_sw + ' dot' + (m.free_sw !== 1 ? 's' : '') + ' (auto) \u2014 removed if oath is removed</div>';
    ```
  - [ ] `public/js/editor/sheet.js` line 671 — `iBon` in view mode: add `+ (m.free_sw || 0)`
  - [ ] `public/js/editor/edit.js` line 761 — merit rating inline recalc: add `+ (m.free_sw || 0)`
  - [ ] `public/js/editor/xp.js` line 192 (`meritRating`): add `+ (m.free_sw || 0)`
  - [ ] `public/js/editor/xp.js` line 204-205 (`meritBdRow`): add `fsw = mc.free_sw || 0` to destructuring; add `+ fsw` to `total`

- [ ] Task 4: Pass `allChars` at call sites (AC: 10)
  - [ ] `public/js/editor/sheet.js` line 1394: `applyDerivedMerits(c, state.chars)`
  - [ ] `public/js/admin.js` line 235 (inside `charAlerts`): `applyDerivedMerits(c, chars)`
    - `chars` is the module-level array in admin.js — confirm it's in scope at that call site

- [ ] Task 5: Schema (AC: 8)
  - [ ] `server/schemas/character.schema.js` merit properties block (~line 364-365): add
    ```
    free_sw:        { type: 'integer', minimum: 0 },
    ```
    immediately after `free_inv`

- [ ] Task 6: Fix Keeper's data (AC: 9)
  - [ ] In `data/chars_v2.json`, find Keeper's Resources entry: `{ "category": "influence", "name": "Resources", "rating": 5, "granted_by": "Safe Word" }`
  - [ ] Remove the `"rating": 5` field — leave as `{ "category": "influence", "name": "Resources", "granted_by": "Safe Word" }`
  - [ ] Note: the auto-grant will compute `free_sw = 1` (Charlie's Resources is 1 dot from xp) when Keeper's sheet is rendered with oath active

- [ ] Task 7: Verification
  - [ ] Open Keeper in admin editor — Resources shows 1 dot (from `free_sw = 1`), gold Safe Word note visible
  - [ ] Open Charlie in admin editor — no Resources grant on Charlie (Charlie offers, Keeper receives)
  - [ ] WP display on Keeper still shows combined WP (existing `_swActive` logic in `shRenderStats` unaffected)
  - [ ] Remove/clear `partner` on Keeper's oath — Resources grant disappears from Keeper's sheet
  - [ ] Restore `partner` — grant reappears

## Dev Notes

### Pattern being followed: OHM grant (mci.js lines 232–276)

OHM clears `free_ohm = 0` on all merits, then sets `free_ohm = 1` on specific merits if the oath exists. Safe Word follows identical pattern but:
- Reads the grant from the PARTNER's `shared_merit` field (cross-character)
- Requires `allChars` to find the partner
- Grant amount = partner's merit total (not a fixed 1)

### Existing `_swActive` code in `shRenderStats` (sheet.js lines 233–239)

The WP calculation at `shRenderStats` already detects mutual linkage. This code is UNCHANGED. The grant in `applyDerivedMerits` does not replace it — they are parallel features.

### Circular grant prevention

When computing `_gr` (the grant amount), only sum the partner's **own** dot fields: `cp + xp + free_*` excluding `free_sw`. This prevents a circular amplification if both characters share the same merit type with each other.

### `allChars` at other `applyDerivedMerits` call sites

Other callers (`city-views.js`, `session-tracker.js`, `spheres-view.js`, `csv-format.js`) don't pass `allChars` — they get `[]` by default and the Safe Word block silently skips. This is correct: those contexts don't render full character sheets and don't need the Safe Word grant.

### `buildSaveBody` — no changes needed

`buildSaveBody` in `admin.js` strips keys starting with `_` only. `free_sw` does not start with `_`, so it IS saved to MongoDB. This is intentional: `free_sw = 0` will be saved (re-computed on next render), and the correct `m.rating` (synced from `free_sw` in the rating-sync block) will also be saved, making the player portal work correctly.

### XP cost unaffected

`free_sw` dots are granted (zero cost). `xpSpentMerits` uses `m.xp` directly, not total rating. Including `free_sw` in `meritRating` and `meritBdRow` total is display-only — it doesn't add XP cost.

### Keeper's Resources data

Charlie's Resources: `{ cp: 0, xp: 1 }` → computed rating 1. So `free_sw = 1` on Keeper. The existing `rating: 5` in the JSON is wrong and must be removed. After the fix, auto-grant produces rating 1.

If the ST believes Keeper should have more dots, the correct approach is to add `cp` or `xp` to Keeper's own Resources entry (own investment), which stacks with `free_sw`.

### player/wizard.js line 699

Not strictly needed (wizard creates new characters who won't have Safe Word pre-loaded), but add `free_sw: 0` for consistency with all other `free_*` fields.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Claude (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
