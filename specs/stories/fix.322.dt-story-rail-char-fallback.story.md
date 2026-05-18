# Story fix.322: DT Story rail — fall back to character_name when char lookup fails

**Story ID:** fix.322
**Epic:** DT Story tab improvements
**Status:** done
**Date:** 2026-05-18
**Issue:** [#322](https://github.com/angelusvmorningstar/TerraMortis/issues/322)
**Branch:** ms/issue-322-dt-story-rail-char-fallback

---

## User Story

As an ST using the DT Story tab, I want the rail pill and character-name header to show the submission's stored character name when the character document cannot be resolved, so that I can identify orphaned submissions without guessing whose they are.

---

## Background

The rail pill showed "Unknown" for a DT2 submission whose `character_id` pointed to a deleted character document (the old Keeper). The submission's own `character_name: "Keeper"` field was ignored. This is a UI robustness gap — the rest of the codebase already uses `s.character_name || 'Unknown'` as the fallback in dozens of places; the rail pill and character-name header are the inconsistent ones.

---

## Acceptance Criteria

- [ ] Given a submission whose `character_id` does not match any character in `_allCharacters`, the rail pill displays `sub.character_name` (e.g. `"Keeper"`), not `"Unknown"`
- [ ] Given a submission whose `character_id` matches a live character, the rail pill displays `char.moniker || char.name` exactly as before (no regression)
- [ ] Given a submission with neither a matching character nor a `character_name`, the pill falls back to `"Unknown"` as a last resort
- [ ] The character-name header inside `renderCharacterView` (`<h3 class="dt-story-char-name">`) applies the same three-step fallback
- [ ] Optional (in-scope): orphan pills get a visual indicator (CSS class or suffix) so the ST can distinguish broken FK from just an unfamiliar name

---

## Implementation

### File: `public/js/admin/downtime-story.js`

**One change only — no schema changes, no CSS changes required (unless visual indicator is added).**

#### Fix 1 — Rail pill name (line 1160)

```js
// Before:
const name = char ? (char.moniker || char.name) : 'Unknown';

// After:
const name = char ? (char.moniker || char.name) : (sub.character_name || 'Unknown');
```

If the optional orphan indicator is implemented, add a CSS class to the pill button:

```js
const isOrphan = !char;
h += `<button class="dt-story-pill${stateClass}${isOrphan ? ' dt-story-pill--orphan' : ''}" ...>`;
```

#### Fix 2 — Character-name header in `renderCharacterView` (line 1338)

`renderCharacterView(char, sub)` receives `sub` as its second parameter, so the fallback is available.

```js
// Before:
h += `<h3 class="dt-story-char-name">${char ? dropdownName(char) : 'Unknown'}</h3>`;

// After:
h += `<h3 class="dt-story-char-name">${char ? dropdownName(char) : (sub?.character_name || 'Unknown')}</h3>`;
```

#### Optional — CSS for orphan indicator

If the visual indicator is added, append to `public/css/admin-layout.css`:

```css
.dt-story-pill--orphan {
  opacity: 0.65;
  border-style: dashed;
}
```

---

## Dev Notes

### Exact locations (verified against current file)

| Site | Line | Current code |
|------|------|--------------|
| `getCharForSub` | 1077–1080 | `_allCharacters.find(c => c._id === sub.character_id) \|\| null` |
| Rail pill name | 1159–1160 | `const name = char ? (char.moniker \|\| char.name) : 'Unknown';` |
| Character-name header | 1338 | `` `${char ? dropdownName(char) : 'Unknown'}` `` |

### What to preserve

- `getCharForSub` itself does **not** need to change — it is a strict lookup by design. The fallback belongs at the call sites, not inside the function.
- Line 1163: `const charId = sub.character_id || sub._id;` already handles missing character gracefully — no change needed there.
- All the other `s.character_name || 'Unknown'` patterns elsewhere in the file (lines 755, 942, 974, 2299, 2306, etc.) are already correct — do not change them.
- `dropdownName(char)` is only called when `char` is non-null — no change needed to that helper.

### Regression risk

Negligible. The only change is substituting the hard-coded `'Unknown'` string with `sub.character_name || 'Unknown'`. When `character_name` is empty or absent (which it never is for any DT2+ submission per the schema), behaviour is identical.

### No test framework

Per `CLAUDE.md`: verify manually in-browser. Test by loading the DT Story tab with DT2 data that includes the orphaned Keeper submission and confirming the pill shows "Keeper".

---

## Files to Change

| File | Change |
|------|--------|
| `public/js/admin/downtime-story.js` | Two one-line fixes at lines 1160 and 1338 |
| `public/css/admin-layout.css` | Optional: add `.dt-story-pill--orphan` rule |
