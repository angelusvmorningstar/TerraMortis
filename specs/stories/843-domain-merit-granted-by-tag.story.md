# Story 843: Show gen-granted-tag on domain merit editor rows

## Status: Ready for Dev

## Metadata
- issue: 843
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/843
- branch: piatra/issue-843-domain-merit-granted-by-tag
- type: UI fix
- model: fix.815.harbour-influence-negzero.test.js (test pattern); sheet.js line 906 (influence gen-granted-tag reference)

---

## Story

**As** an ST reviewing a character's domain merits in the editor,
**I want** a visible source indicator when a domain merit row carries bonus dots from Carthian Pull or another grant source,
**so that** hollow dots on domain merits are never unexplained.

---

## Background

The influence merit editor row (sheet.js:906) already emits a `<span class="gen-granted-tag">` when `m.granted_by` is set. The domain merit editor rows (the `_emitDomRow` closure, lines 1146-1150) have no equivalent. When a character has Carthian Pull allocated to a domain merit such as Haven, the bonus dot appears hollow in the editor with no indication of its source. Eve Lockridge's Haven is the live example: `free_carthian: 1`, `granted_by: "Carthian Pull"` on the Haven merit, one unexplained hollow dot in the editor.

The fix is a source-resolution expression immediately before the `</div>` that closes each domain editor row, emitting the same `gen-granted-tag` span. No new CSS, no mechanical changes.

---

## Scope

| Layer | File | Change |
|-------|------|--------|
| Editor renderer | `public/js/editor/sheet.js` | Add grant-source resolution and `gen-granted-tag` emission inside `_emitDomRow` (both the Necro-target branch at line 1147 and the standard branch at line 1149) |
| Static test | `server/tests/fix.843.domain-granted-by-tag.test.js` | Two suites: (1) `gen-granted-tag` reference present in the domain row area; (2) source-resolution expression present |

---

## Acceptance Criteria

1. Given a domain merit with `granted_by: "Carthian Pull"`, the editor row displays `<span class="gen-granted-tag">Carthian Pull</span>`.
2. Given a domain merit with no `granted_by` but `free_carthian > 0`, the editor row displays `<span class="gen-granted-tag">Carthian Pull</span>`.
3. Given a domain merit with no `granted_by` and no positive `free_*` grant, the row renders unchanged (no tag).
4. The tag uses the existing `gen-granted-tag` CSS class. No new style tokens.
5. No domain-total or mechanical calculation is altered.
6. `server/tests/fix.843.domain-granted-by-tag.test.js` passes (`vitest run`).

---

## Tasks

- [ ] Add grant-source resolution and tag to `_emitDomRow` (AC1-5)

  **Location:** `public/js/editor/sheet.js`, inside `_emitDomRow`, after the `_expOnclick` / `_expIdAttr` variables are defined (around line 1145) and before the two `h +=` branches at lines 1147 and 1149.

  Insert a resolved-source variable:

  ```js
  const _fg843 = m.free_grants || {};
  const _grantSource843 = m.granted_by
    || ((_fg843.carthian ?? m.free_carthian ?? 0) > 0 ? 'Carthian Pull' : null)
    || ((_fg843.lk      ?? m.free_lk      ?? 0) > 0 ? 'Lorekeeper'   : null)
    || ((_fg843.inv     ?? m.free_inv     ?? 0) > 0 ? 'Invested'     : null)
    || ((_fg843.vm      ?? m.free_vm      ?? 0) > 0 ? 'VM'           : null)
    || ((_fg843.mci     ?? m.free_mci     ?? 0) > 0 ? 'MCI'          : null)
    || ((_fg843.fwb     ?? m.free_fwb     ?? 0) > 0 ? 'FwB Bonus'    : null)
    || ((_fg843.attache ?? m.free_attache ?? 0) > 0 ? 'Attaché' : null)
    || null;
  const _grantTag843 = _grantSource843
    ? '<span class="gen-granted-tag">' + esc(_grantSource843) + '</span>'
    : '';
  ```

  Then splice `_grantTag843` into both row-emit branches (lines 1147 and 1149), inserting it just before the `_expArr` reference in each string concatenation. For example the standard branch becomes:

  ```js
  h += '...' + _subtitleInline + '<span class="dom-contrib-lbl">My dots: ...' + _grantTag843 + _expArr + '<button ...
  ```

  Do the same for the Necro-target branch at line 1147.

  **Priority of sources:** `granted_by` wins (it is always the most specific). Free-channel labels follow the same order as `_derivedNotes` (sheet.js:182-193). Only the first truthy source is displayed; if a merit somehow carries multiple, the `granted_by` string already captures the authoritative one.

  **`free_grants` map-fallback:** Use the same `_fg843.slug ?? m.free_slug ?? 0` pattern already used at line 1389, so the check is forward-compatible with the ADR-005 Rev 2 `free_grants` map migration without depending on it.

  **Necro target rows:** The Necro-target branch at line 1147 also gets `_grantTag843`. Necro target merits should not carry Carthian Pull dots in practice, but the tag is harmless if the data ever appears, and omitting it from one branch while adding it to the other creates inconsistency.

- [ ] Write static test (AC6)

  New file: `server/tests/fix.843.domain-granted-by-tag.test.js`

  Pattern: `fix.815.harbour-influence-negzero.test.js` (REPO_ROOT + `fs.readFileSync` helper, vitest).

  Read source: `public/js/editor/sheet.js`.

  **Suite 1 — gen-granted-tag reference present in the domain row area**

  Approach: extract the text of the `_emitDomRow` function (from the string `'const _emitDomRow'` to a reasonable end sentinel such as `'// Per-row emitter end'` or by taking the substring between `_emitDomRow` and the next top-level `const` that follows the closure, e.g. `'domM.forEach'`). Assert that extracted substring contains `gen-granted-tag`.

  Alternatively (simpler, sufficient given file structure): assert that the full source contains `gen-granted-tag` in a position consistent with it being inside `_emitDomRow` — i.e., assert that the index of `gen-granted-tag` that falls after `_emitDomRow` is less than the index of `domM.forEach` (the call site that comes after the closure definition). Either approach is acceptable; the simpler string-position check is preferred.

  ```js
  it('gen-granted-tag span appears inside the _emitDomRow closure', () => {
    const startIdx = src.indexOf('const _emitDomRow');
    const endIdx   = src.indexOf('domM.forEach', startIdx);
    const slice    = src.slice(startIdx, endIdx);
    expect(slice).toContain('gen-granted-tag');
  });
  ```

  **Suite 2 — source resolution expression present**

  Assert that `_grantSource843` (or whatever variable name the implementer uses, though the story names it `_grantSource843`) and the `granted_by` branch are present inside the same closure slice. Use a regex that allows for minor naming variation but confirms the logical shape:

  ```js
  it('granted_by is the primary source in the resolution chain', () => {
    const startIdx = src.indexOf('const _emitDomRow');
    const endIdx   = src.indexOf('domM.forEach', startIdx);
    const slice    = src.slice(startIdx, endIdx);
    // granted_by must appear before free_carthian in the resolution
    expect(slice).toMatch(/granted_by[\s\S]{0,200}free_carthian/);
  });

  it('Carthian Pull label is present in the resolution chain', () => {
    const startIdx = src.indexOf('const _emitDomRow');
    const endIdx   = src.indexOf('domM.forEach', startIdx);
    const slice    = src.slice(startIdx, endIdx);
    expect(slice).toContain('Carthian Pull');
  });
  ```

- [ ] Run `vitest run server/tests/fix.843.domain-granted-by-tag.test.js` and confirm all pass.

---

## Dev Notes

### Exact insertion point

Lines 1146-1150 of `sheet.js` (as of branch base) hold the two `h +=` emit branches. The variables `_expId`, `_expClass`, `_expArr`, `_expOnclick`, `_expIdAttr`, `_sp` are all defined in the lines immediately above (1134-1145). Insert `_grantSource843` / `_grantTag843` after line 1145 and before line 1146.

### Why not reuse `_fg` from the surrounding scope

The `_emitDomRow` closure does compute `dd` which references `meritFreeSum(m)` (line 1077), but `_fg` as a local alias for `m.free_grants` is not defined in this closure (it is defined inside the read-only view loop at line 1388). Use a fresh local `const _fg843 = m.free_grants || {}` to avoid any name collision and to make the change self-contained.

### Why not use `_derivedNotes`

`_derivedNotes(m)` already emits per-channel notes as `derived-note` divs below the row. The `gen-granted-tag` span is a compact inline indicator on the row itself, matching the influence-row treatment (line 906). Both can coexist: `_derivedNotes` provides detail below, the tag provides a quick scannable marker on the row. The two are complementary.

### What about `meritFreeSum`

`meritFreeSum(m)` (defined in `domain.js`, imported at sheet.js:32) sums all `free_*` channels to a scalar. It does not tell you which channel is non-zero, so the grant-source resolution must read individual channels. The `_fg843.slug ?? m.free_slug ?? 0` pattern mirrors the read-only view path at line 1389 and is forward-compatible with the ADR-005 Rev 2 free_grants map.

### CSS

`gen-granted-tag` is already defined in the stylesheet. No new rules needed.

### Scope boundary

The cap-interaction mechanical defect (hollow dots exceeding the cap) is a separate issue explicitly called out as out of scope in #843. This story only adds the visible source tag.

---

## Dev Agent Record

### Agent Model Used

(fill in on completion)

### Debug Log

### Completion Notes

### File List

- `public/js/editor/sheet.js`
- `server/tests/fix.843.domain-granted-by-tag.test.js`
- `specs/stories/843-domain-merit-granted-by-tag.story.md`

### Change Log
