# Story Fix.16: Area of Expertise — Always Show Spec Dropdown

## Status: done

## Story

**As an** ST adding an Area of Expertise or Interdisciplinary Specialty merit,
**I want** the qualifier picker to always be a dropdown of the character's existing specialisations,
**so that** I can select the relevant spec directly rather than typing free text, and the +2 bonus is correctly wired to a real spec on the sheet.

## Background

In `sheet.js` line 875, the general merit edit loop identifies AoE and IS as `nSp` merits and builds `cSp` — the list of all specialisations across all of the character's skills:

```js
const nSp = isAoE || isIS;
const cSp = Object.values(c.skills || {}).flatMap(sk => sk.specs || []);
```

At line 883, the dropdown is shown **only when `cSp.length > 0`**:

```js
else if (nSp && cSp.length)
  h += '<select ...>' + cSp.map(...) + '</select>';
```

If the character has no specialisations yet, the condition fails and the code falls through to the plain `<input type="text">` branch. The ST then has to type the qualifier manually, which may not match any real spec and breaks the +2 bonus lookup in `dice-engine.js` (line 88) and `helpers.js` (line 139), both of which do a case-insensitive string match against `m.qualifier`.

The fix is to always render a `<select>` for AoE and IS, with a disabled placeholder option when no specs exist.

### How the +2 bonus is applied

`helpers.js` line 139:
```js
m.name === 'Area of Expertise' && m.qualifier &&
  m.qualifier.toLowerCase() === specName.toLowerCase()
```

The bonus already works correctly when the qualifier matches a spec — no change needed there. The only problem is that the qualifier can be set via free text, which may silently mismatch.

## Acceptance Criteria

1. When a character has at least one specialisation, adding AoE or IS shows a `<select>` dropdown of all their specs
2. When a character has **no** specialisations yet, adding AoE or IS shows a `<select>` with a single disabled placeholder option `-- add a specialisation first --`
3. Selecting a spec from the dropdown correctly sets `m.qualifier` (same as before — the `onchange` handler is unchanged)
4. Free-text input is no longer shown for AoE or IS under any condition
5. The existing qualifier (if already set) is pre-selected in the dropdown

## Tasks / Subtasks

- [ ] In `public/js/editor/sheet.js`, on line ~883, change:
  ```js
  else if (nSp && cSp.length)
    h += '<select class="gen-qual-input" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)">'
      + '<option value="">' + (m.qualifier || '\u2014 spec \u2014') + '</option>'
      + cSp.map(sp => '<option' + (m.qualifier === sp ? ' selected' : '') + '>' + esc(sp) + '</option>').join('')
      + '</select>';
  ```
  to:
  ```js
  else if (nSp) {
    if (cSp.length) {
      h += '<select class="gen-qual-input" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)">'
        + '<option value="">\u2014 spec \u2014</option>'
        + cSp.map(sp => '<option value="' + esc(sp) + '"' + (m.qualifier === sp ? ' selected' : '') + '>' + esc(sp) + '</option>').join('')
        + '</select>';
    } else {
      h += '<select class="gen-qual-input" disabled>'
        + '<option value="">\u2014 add a specialisation first \u2014</option>'
        + '</select>';
    }
  }
  ```
  This replaces the `else if (nSp && cSp.length)` branch entirely. The plain text `<input>` fallback that previously handled this case should NOT fire for AoE/IS anymore — confirm the `else` branch at line ~884 is still guarded by `!nSp` conditions or comes after this block.

## Dev Notes

- `cSp` is built from `Object.values(c.skills || {}).flatMap(sk => sk.specs || [])`. Bloodline-granted specs (e.g. `Animal Ken.snakes` for Gorgon, after Fix.15) will appear here automatically.
- The `<option value="">` placeholder in the populated dropdown should NOT carry the old `m.qualifier` text as its label (the original code did this as a display hack). The pre-selected option is handled by the `selected` attribute on the matching `cSp` entry instead.
- `shEditGenMerit(gi, 'qualifier', this.value)` is unchanged — it writes `m.qualifier` directly.
- `disabled` on the empty-state `<select>` prevents the ST from submitting an empty qualifier. The merit can still be saved; qualifier just stays blank until a spec exists.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
