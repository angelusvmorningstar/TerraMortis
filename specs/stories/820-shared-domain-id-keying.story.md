---
issue: 820
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/820
branch: piatra/issue-820-shared-domain-id-keying
status: Done
---

# Story 820 — Shared-domain merit partners keyed by _id not name

## Context

`shared_with` on domain merits stores character names (`c.name`). Names are mutable
(schema supports `name`/`moniker`/`honorific` changes) and are not guaranteed unique.
A rename silently breaks the partner link on one side; two characters sharing the same
`name` cause wrong-match / double-count on dot totals.

Prod audit 2026-07-03: 40 characters, 0 duplicate names, 11 characters with
`shared_with` data across 28 merits. Stored as `string[]` of character names today.

Migration approach: dual-read compatibility on all resolution sites + write-as-`_id`
going forward. No one-shot migration is required (28 records, no duplicate-name risk
today, every re-save through the fixed write path converts a record). An optional
migration script may be included in the same PR as an operator tool — not blocking.

The `_id` field is already available on every `state.chars` entry (confirmed: used by
`_markPartnerDirty` in `edit-domain.js:32`).

---

## Acceptance criteria

- [ ] `shAddDomainPartner` / `shRemoveDomainPartner` write `String(ch._id)` values
      into `shared_with`, not `ch.name`.
- [ ] Every resolution site resolves a `shared_with` entry via a shared helper that
      accepts either a 24-hex ObjectId string (_id shape) or a legacy character name.
- [ ] Partner names still shown correctly on the sheet — `_id` resolved to
      `displayName(ch)` at render time.
- [ ] Renaming a character in a shared-domain group does not break the link on either
      side after re-save through the fixed write path.
- [ ] Two characters with the same `name` resolve to the correct (distinct) partners.
- [ ] Mixed `shared_with` arrays (some old-name entries, some new-_id entries) resolve
      both shapes correctly with no regression.
- [ ] The `sheet.js:434` pact-partner resolution (Oath of the Safe Word) is NOT
      changed — it is a separate schema field (`p.partner`) with separate semantics
      and is out of scope.
- [ ] Tests pass per the test spec below.

---

## Write side — `public/js/editor/edit-domain.js`

### `shAddDomainPartner` (lines 495-541)

Affected variable initialisations and array constructions — change every place that
puts a character's name into a `shared_with` array to use `String(ch._id)` instead.

Current code builds the group from names:

```js
// line 508
const fullGroup = [c.name, ...(m.shared_with || []), partnerName];
```

And resolves members by name:

```js
// line 512
const member = state.chars.find(ch => ch.name === memberName);
// line 524
const partner = state.chars.find(ch => ch.name === partnerName);
```

And filters the available-partner dropdown by name:

```js
// line 1077 in sheet.js (avP construction)
avP = [...chars].filter(ch => ch.name !== c.name && !parts.includes(ch.name))
```

Required changes:

1. Compute and cache the _id of the current char and of the incoming partner at the
   top of the function:
   ```js
   const cId  = String(c._id);
   const partner = state.chars.find(ch => String(ch._id) === partnerName);
   // NOTE: the <select> value changes from p.name → String(p._id) in the renderer
   ```
2. Replace `const fullGroup = [c.name, ...]` with `[cId, ...]`.
3. Replace `state.chars.find(ch => ch.name === memberName)` with
   `_resolveSharedWithMember(state.chars, memberName)`.
4. Replace `state.chars.find(ch => ch.name === partnerName)` with
   `state.chars.find(ch => String(ch._id) === partnerName)` (incoming value is now an
   _id from the updated picker).
5. Everywhere `fullGroup.filter(n => n !== memberName)` or `!== c.name` or
   `!== partnerName` is used to exclude self, compare against `cId` / `partnerId`
   (`String(partner._id)`).

### `shRemoveDomainPartner` (lines 543-585)

Same pattern:

1. Incoming `partnerName` is now a character `_id` string (from the remove button,
   which must pass `String(ch._id)` — see render side below).
2. `const remainingGroup = [c.name, ...]` — replace `c.name` with `String(c._id)`.
3. `state.chars.find(ch => ch.name === memberName)` — replace with
   `_resolveSharedWithMember(state.chars, memberName)`.
4. `state.chars.find(ch => ch.name === partnerName)` — replace with
   `state.chars.find(ch => String(ch._id) === partnerName)`.
5. `pm.shared_with.filter(n => n !== c.name && n !== partnerName)` — filter against
   `String(c._id)` and `String(partner._id)`.

---

## Resolution helper — new shared utility

Place in `public/js/data/helpers.js` (or a new `public/js/data/shared-with.js` —
developer's choice). Export it and import into both `edit-domain.js` and `sheet.js`.

```js
/**
 * Resolve a shared_with entry (string) to a character object.
 * Accepts either a 24-hex ObjectId (new format) or a legacy character name.
 * Returns the matching character object, or null if not found.
 *
 * @param {Array} chars - state.chars array
 * @param {string} entry - _id hex string or character name
 * @returns {object|null}
 */
export function resolveSharedWithMember(chars, entry) {
  if (typeof entry === 'string' && /^[a-f0-9]{24}$/i.test(entry)) {
    return chars.find(ch => String(ch._id) === entry) || null;
  }
  return chars.find(ch => ch.name === entry) || null;
}
```

Note: the helper is intentionally named `resolveSharedWithMember` (public export).
The 819-style underscore-prefixed internal alias (`_resolveSharedWithMember`) can be
used locally if preferred, but the export name must be stable for the test to assert.

---

## Read / render side — `public/js/editor/sheet.js`

### Edit-mode partner display (line 1077 — `avP` and `parts`)

`parts = m.shared_with || []` is already correct (just reads the array). Two things
must change:

1. **Available-partner filter** (`avP`):
   ```js
   // Current (line 1077):
   avP = [...chars].filter(ch => ch.name !== c.name && !parts.includes(ch.name))
   // Replace with:
   avP = [...chars].filter(ch => String(ch._id) !== String(c._id)
     && !parts.some(e => resolveSharedWithMember(chars, e) === ch))
   ```

2. **Add-partner `<select>` value** (line 1229):
   ```js
   // Current:
   avP.map(p => '<option value="' + esc(p.name) + '">' + esc(dropdownName(p)) + '</option>')
   // Replace value with String(p._id):
   avP.map(p => '<option value="' + esc(String(p._id)) + '">' + esc(dropdownName(p)) + '</option>')
   ```

3. **Partner tag display** (line 1228 — existing partners row):
   ```js
   // Current (resolves by name):
   parts.forEach(pN => { const p = chars.find(ch => ch.name === pN), ...
   // Replace with:
   parts.forEach(pEntry => {
     const p = resolveSharedWithMember(chars, pEntry);
     const pN = p ? displayName(p) : pEntry; // display falls back to raw entry if unresolved
     const pD = p ? domMeritShareable(p, m.name) : 0;
     // Remove button must pass the STORED value (pEntry) so shRemoveDomainPartner
     // receives what is actually in shared_with — not the resolved display name.
     h += '<span class="dom-partner-tag">' + esc(pN) + (pD ? ' ' + shDots(pD) : ' ○')
       + '<button class="dom-partner-rm" onclick="shRemoveDomainPartner(' + di + ',\''
       + pEntry.replace(/'/g, "\\'") + '\')">×</button></span>';
   });
   ```

### Read-only view partner display (line 1444)

```js
// Current:
dp.map(n => { const p = chars.find(ch => ch.name === n), pd = p ? domMeritShareable(p, m.name) : 0;
              return esc(n) + (pd ? ' ' + shDots(pd) : ''); })
// Replace with:
dp.map(entry => {
  const p = resolveSharedWithMember(chars, entry);
  const pd = p ? domMeritShareable(p, m.name) : 0;
  const label = p ? displayName(p) : entry;
  return esc(label) + (pd ? ' ' + shDots(pd) : '');
})
```

### Out-of-scope resolution sites in `sheet.js`

- **Line 434** — `_swPact.partner` / Oath of the Safe Word: separate schema field,
  separate UI. Do NOT change.
- **Line 775, 823, 825, 829** — pact partner `<select>` and display: out of scope.
- **Line 1045 onward** — Necropolis / collective-dots logic does not use `shared_with`
  for partner resolution; not affected.

---

## Optional migration script

If included, place at `server/scripts/migrate-820-shared-with-ids.js`.

The script should:
1. Load all characters via `db.characters.find({})`.
2. Build a name-to-_id map from the result.
3. For each character, iterate `c.merits` where `m.shared_with` is a non-empty array.
4. For each `shared_with` entry that is NOT already 24-hex, replace with the mapped
   `_id` string. Warn and skip entries that don't resolve to any character.
5. Write back only the `merits` field using `replaceOne` scoped to `{ _id: c._id }`.
6. Print a summary: N characters updated, M entries converted, K entries skipped.

The script is an operator tool, not part of the normal deploy path.

---

## Tests — `server/tests/fix.820.shared-domain-id-keying.test.js`

Use the same vitest + static-analysis pattern as `fix.819.findcharacter-id-first.test.js`.

### Suite 1 — Write-side static analysis (`edit-domain.js`)

```
describe('#820 — write side no longer stores c.name in shared_with', () => {
  it('shAddDomainPartner does not put c.name directly into fullGroup', ...)
  // Assert the source of edit-domain.js does NOT contain the pattern:
  //   [c.name, ...(m.shared_with
  // (The old construction that seeds the group with the name string.)

  it('shAddDomainPartner uses String(c._id) in group construction', ...)
  // Assert source contains: String(c._id) inside shAddDomainPartner body.

  it('shRemoveDomainPartner uses String(c._id) in remainingGroup', ...)
  // Assert source does NOT contain: [c.name, ...(m.shared_with inside shRemoveDomainPartner.
})
```

### Suite 2 — Helper presence and shape

```
describe('#820 — resolveSharedWithMember helper', () => {
  it('resolveSharedWithMember is exported from helpers.js (or shared-with.js)', ...)
  // Assert the chosen file contains: export function resolveSharedWithMember(

  it('helper contains 24-hex ObjectId regex', ...)
  // Assert: /^[a-f0-9]{24}$/i  appears in the helper source.
})
```

### Suite 3 — Inline logic (unit-style, no DB)

```
describe('#820 — resolveSharedWithMember behaviour', () => {
  const chars = [
    { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Alice' },
    { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Alice' }, // duplicate name
    { _id: 'cccccccccccccccccccccccc', name: 'Bob' },
  ];

  it('resolves 24-hex _id to the correct character', () => {
    const result = resolveSharedWithMember(chars, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(result._id).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    // The second "Alice" is returned, not the first — _id wins
  });

  it('falls back to name lookup for legacy non-hex entry', () => {
    const result = resolveSharedWithMember(chars, 'Bob');
    expect(result._id).toBe('cccccccccccccccccccccccc');
  });

  it('returns null for an unresolvable entry', () => {
    expect(resolveSharedWithMember(chars, 'Unknown')).toBeNull();
  });

  it('name fallback returns the first match when names are duplicated (legacy-compat)', () => {
    const result = resolveSharedWithMember(chars, 'Alice');
    // Behaviour: first match wins (same as the legacy chars.find behaviour).
    // This is acceptable — the whole point of #820 is to eliminate the ambiguity
    // going forward; legacy entries remain best-effort.
    expect(result).not.toBeNull();
  });
})
```

### Suite 4 — Regression: mixed array

```
describe('#820 — mixed old-name / new-_id shared_with resolves both', () => {
  it('resolves an array containing both legacy names and new _id strings', () => {
    const chars = [
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Alice' },
      { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Bob' },
    ];
    const entries = ['Alice', 'bbbbbbbbbbbbbbbbbbbbbbbb'];
    const resolved = entries.map(e => resolveSharedWithMember(chars, e));
    expect(resolved[0]._id).toBe('aaaaaaaaaaaaaaaaaaaaaaaa'); // name-resolved
    expect(resolved[1]._id).toBe('bbbbbbbbbbbbbbbbbbbbbbbb'); // id-resolved
  });
})
```

---

## Files touched

| File | Change |
|------|--------|
| `public/js/editor/edit-domain.js` | Write side: use `_id` in `shAddDomainPartner` / `shRemoveDomainPartner` |
| `public/js/editor/sheet.js` | Read/render: `avP` filter, `<select>` value, partner tag display, read-only view partner display |
| `public/js/data/helpers.js` (or new `public/js/data/shared-with.js`) | Add `resolveSharedWithMember` export |
| `server/tests/fix.820.shared-domain-id-keying.test.js` | New test file (static + unit) |
| `server/scripts/migrate-820-shared-with-ids.js` | Optional operator script |
| `specs/stories/820-shared-domain-id-keying.story.md` | This file |

---

## Constraints

- No schema changes: `shared_with` stays `type: string[]` in MongoDB.
- No route changes.
- The `sheet.js:434` pact-partner field (`p.partner`) is explicitly out of scope.
- Story file ships in the same PR as the code changes.
