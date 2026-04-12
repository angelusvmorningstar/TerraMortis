# Story Fix.6: K-9 and Falconry Auto-Grant 1-Dot Retainer

## Status: done

## Story

**As an** ST editing a character with K-9 or Falconry fighting style,
**I want** a 1-dot Retainer to be automatically added to the character when they have that style,
**so that** the animal companion is reflected on the sheet without the ST having to manually create it.

## Background

The K-9 fighting style grants a free 1-dot Retainer (a dog). The Falconry fighting style grants a free 1-dot Retainer (a falcon).

The grant logic already exists in `applyDerivedMerits()` in `public/js/editor/mci.js` (lines 213-227). It correctly:
- Clears `m.free` on any Retainer with `granted_by: 'K-9'` or `granted_by: 'Falconry'` each render cycle
- Finds the existing granted Retainer and sets `m.free = 1`

The bug is on line 225:
```js
const m = (c.merits || []).find(m => m.name === 'Retainer' && m.granted_by === styleName);
if (!m) return;  // ← silently does nothing if the Retainer doesn't exist yet
m.free = 1;
```

The Retainer is never auto-created. On characters who don't already have a Retainer manually added with `granted_by` set correctly, the grant silently fails every render.

The fix: replace the `if (!m) return` early exit with auto-creation of the Retainer using the same pattern as bloodline grants.

Retainer is an **influence** merit (category: `'influence'`). Its description field is `area` (not `qualifier`) — shown by the inline edit input in `shRenderInfluenceMerits()` (`placeholder="Description"`). The `area` value for the auto-granted Retainers should be `'Dog'` for K-9 and `'Falcon'` for Falconry.

The auto-created Retainer will persist to the DB on the next character save (same as bloodline grants). If the fighting style is later removed, the clear loop sets `free = 0` on the granted Retainer, leaving it as a 0-dot merit on the sheet — the ST removes it manually. This is consistent with how other derived grants behave.

## Acceptance Criteria

1. A character who has K-9 (at least 1 style dot) and no Retainer on their sheet automatically gains a 1-dot Retainer with `area: 'Dog'` and `granted_by: 'K-9'`
2. A character who has Falconry (at least 1 style dot) and no Retainer on their sheet automatically gains a 1-dot Retainer with `area: 'Falcon'` and `granted_by: 'Falconry'`
3. The auto-granted Retainer shows in the influence section with the style name as the granted-by tag (e.g., "K-9")
4. If the character already has a Retainer with the correct `granted_by`, the existing merit is used and `free = 1` is applied to it — no duplicate is created
5. The `free: 1` dot is reflected in the Retainer's rating (1 dot total), displayed as `●`
6. If a character has both K-9 and Falconry, they receive two separate granted Retainers — one Dog, one Falcon
7. Characters without K-9 or Falconry are unaffected

## Tasks / Subtasks

- [ ] Task 1: Auto-create granted Retainer when missing (`mci.js` lines 218-227)
  - [ ] Replace the current `_STYLE_RETAINER_GRANTS.forEach` block:
    ```js
    _STYLE_RETAINER_GRANTS.forEach(styleName => {
      const hasStyle = (c.fighting_styles || []).some(fs =>
        fs.type !== 'merit' && fs.name === styleName &&
        ((fs.cp||0) + (fs.free||0) + (fs.free_mci||0) + (fs.xp||0) + (fs.up||0)) >= 1
      );
      if (!hasStyle) return;
      let m = (c.merits || []).find(m => m.name === 'Retainer' && m.granted_by === styleName);
      if (!m) {
        const area = styleName === 'K-9' ? 'Dog' : 'Falcon';
        if (!c.merits) c.merits = [];
        m = { name: 'Retainer', category: 'influence', rating: 0, area, granted_by: styleName };
        c.merits.push(m);
      }
      m.free = 1;
    });
    ```
  - [ ] No other changes needed — `ensureMeritSync()` (called at the end of `applyDerivedMerits()`) will sync `rating` from `free`

## Dev Notes

### Architecture
- No test framework. Verify in-browser manually.
- `ensureMeritSync()` runs after this block and computes `rating = cp + xp + free + free_mci + ...` for all merits. The auto-created Retainer with `rating: 0, free: 1` will have its rating corrected to `1` by that function.
- The `area` field is the description text shown in the influence edit UI's text input (placeholder "Description"). This is the correct field for Retainer description — not `qualifier`.
- The `granted_by` field causes the Retainer to render with a locked style tag in the sheet and suppresses the name dropdown, consistent with how MCI-granted merits display.
- The auto-created Retainer will be saved to the DB on the next character save. It behaves like any other influence merit from that point — the ST can add more dots (cp/xp) to increase its rating above 1.
- If the fighting style is removed: the clear loop (`m.free = 0`) fires but the merit stays on the sheet at 0 dots. The ST removes it manually. This matches the behaviour of bloodline grants.

### Manual verification
- Open a character with K-9 (no existing Retainer): confirm a 1-dot Retainer (Dog) appears in the influence section tagged "K-9"
- Open a character with Falconry: confirm a 1-dot Retainer (Falcon) appears tagged "Falconry"
- Open a character with both: confirm two Retainers appear, one per style
- Open a character who already has a manually-added Retainer with `granted_by: 'K-9'`: confirm no duplicate is created, existing one gets `free: 1`
- Open a character without K-9 or Falconry: confirm no unwanted Retainers appear

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
