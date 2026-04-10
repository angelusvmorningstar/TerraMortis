# Story Fix.7: Haven Prerequisite — Count Shared Dots

## Status: ready-for-dev

## Story

**As an** ST entering Safe Place for a character who shares a Haven with another character,
**I want** the Haven prerequisite check to count shared partner dots as well as the character's own,
**so that** a character who meets Haven through a shared territory is not incorrectly flagged with a prerequisite warning.

## Background

Safe Place requires Haven as a prerequisite. Domain merits like Haven can be shared — one character owns the dots and lists others in `shared_with`, giving partners access to the full total via `domMeritTotal()`.

The prerequisite checker in `public/js/data/prereq.js` (the `'merit'` case, lines ~68-75) checks only the character's own `m.rating` in their merits array:

```js
case 'merit': {
  const merits = char.merits || [];
  return merits.some(m => {
    if (m.name !== node.name) return false;
    if (node.qualifier && ...) return false;
    return (m.rating || 0) >= (dots || 1);
  });
}
```

This ignores shared domain merit totals. A character who has 0 dots of Haven on their own sheet but is listed in another character's Haven `shared_with` array effectively has access to those Haven dots — but the prereq check does not see them.

`domMeritTotal(c, name)` in `public/js/editor/domain.js` correctly computes the total including shared partner contributions. The fix is to call this function (or replicate its logic) in the prereq check for domain merits.

### Import / circular dependency concern

`prereq.js` lives in `public/js/data/`. `domMeritTotal` lives in `public/js/editor/domain.js`, which imports `state` from the suite data module. Check the import chain before adding a direct import to `prereq.js` — a circular dependency would break the build. Options in order of preference:

1. **Callback parameter** (cleanest): Add an optional `opts.domTotal` callback to `meetsPrereq(c, prereq, opts)`. The call site in `sheet.js` (`_prereqWarn`) already imports `domain.js` and can pass `(name) => domMeritTotal(c, name)`. All other call sites pass nothing and the old behaviour is unchanged.
2. **Inline shared-dot calculation** in `prereq.js`: for a 'merit' prereq where the character has the named merit with `category === 'domain'` and a `shared_with` array, look up each partner in the global `state.chars` and add their `domMeritShareable()` result — but only if `state` can be imported without circularity.
3. **Special-case at call site**: in `_prereqWarn()` in sheet.js, pre-compute whether the prereq involves a domain merit and call `domMeritTotal` separately before invoking `meetsPrereq`. Only applicable if the prerequisite structure is simple enough to parse at that level.

The implementation agent should pick whichever option avoids circularity. The callback approach (option 1) is recommended — it is minimal, backwards-compatible, and keeps the dependency in the right direction.

## Acceptance Criteria

1. A character with 0 own Haven dots who is listed in a partner's Haven `shared_with` passes the Haven prerequisite check for Safe Place
2. A character with their own Haven dots still passes as before (no regression)
3. A character with neither own Haven nor shared Haven still fails the check and shows the warning
4. The fix applies generically to any domain merit used as a prerequisite (not only Haven), so future prereqs of this kind work automatically
5. No existing prerequisite checks regress — merits without domain prereqs are unaffected

## Tasks / Subtasks

- [ ] Task 1: Add optional `opts` parameter to `meetsPrereq()` in `prereq.js`
  - [ ] Change the function signature from `meetsPrereq(char, prereq)` to `meetsPrereq(char, prereq, opts = {})`
  - [ ] In the `'merit'` case, after the existing `merits.some(...)` check, add a fallback using `opts.domTotal`:
    ```js
    case 'merit': {
      const merits = char.merits || [];
      const directMatch = merits.some(m => {
        if (m.name !== node.name) return false;
        if (node.qualifier && m.qualifier !== node.qualifier && m.area !== node.qualifier) return false;
        return (m.rating || 0) >= (dots || 1);
      });
      if (directMatch) return true;
      // Also check shared domain merit total if a resolver is provided
      if (opts.domTotal) {
        const total = opts.domTotal(node.name, node.qualifier || null);
        if (total >= (dots || 1)) return true;
      }
      return false;
    }
    ```
  - [ ] Ensure the `opts` parameter is threaded through any recursive calls within `meetsPrereq` (if it calls itself for compound prerequisites like `and`/`or` nodes)

- [ ] Task 2: Pass `domTotal` callback from the prerequisite warning call site in `sheet.js`
  - [ ] In `_prereqWarn(c, meritName, m)` (~line 73), update the `meetsPrereq` call:
    ```js
    if (meetsPrereq(c, rule.prereq, {
      domTotal: (name) => domMeritTotal(c, name)
    })) return '';
    ```
  - [ ] Confirm `domMeritTotal` is already imported in `sheet.js` from `../editor/domain.js` — check the import line at the top of the file. Add to the import if missing.

- [ ] Task 3: Pass `domTotal` callback from any other call sites that render prereq warnings
  - [ ] Search the codebase for all calls to `meetsPrereq(` — confirm every call site either already passes `opts` or is in a context where shared domain merits are irrelevant (e.g., the buildMeritOptions filter in `merits.js`, where domain merits being selectable is fine without shared-dot awareness)
  - [ ] For any call site in an editor context that renders UI (sheet.js, merits.js), add the `domTotal` callback if appropriate

## Dev Notes

### Architecture
- No test framework. Verify in-browser manually.
- `meetsPrereq` is called in multiple places: `sheet.js` `_prereqWarn`, `merits.js` `buildMeritOptions`, `merits.js` `meetsDevPrereqs`, possibly others. Only the call sites that render ST-visible warnings need the `domTotal` callback — the merit option filter doesn't need to be changed unless we also want shared-dot awareness when deciding which merits appear in the add-merit dropdown.
- `domMeritTotal(c, name)` uses `state.chars` to find partner characters. This only works in the admin app context where `state.chars` is populated. The function already handles the case where a partner is not found (skips them).
- The Haven prereq for Safe Place is the known failing case. Test with a character who has `shared_with` pointing to another character with Haven dots.

### Manual verification
- Character A: Haven ●● own dots
- Character B: Haven 0 own dots, listed in Character A's `shared_with`
- Add Safe Place to Character B: confirm no prereq warning appears
- Add Safe Place to Character C (no Haven of any kind): confirm warning still appears
- Character A still has no warning (own dots, regression check)

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
