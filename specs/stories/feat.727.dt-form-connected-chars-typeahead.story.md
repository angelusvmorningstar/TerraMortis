---
title: 'DT form: Connected Characters field should allow multiple selections via chips model'
type: 'feat'
issue: 727
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/727
branch: ms/issue-727-dt-form-connected-chars-multi
created: '2026-06-14'
status: done
recommended_model: 'sonnet — UI widget replacement + CSS; moderate scope'
context:
  - public/js/tabs/downtime-form.js
  - public/css/components.css
---

## Intent

The DT player form's Connected Characters field uses a `<select>` dropdown
that re-renders the whole form on each pick and gives no filtering. Replace
it with the typeahead text input + chips pattern already live in DT Processing,
so players can type to filter and add multiple characters without a page reload.

The storage layer (`project_${n}_connected_chars` = JSON array of character IDs)
is already correct and does not change.

---

## Root cause

### Current implementation

| File | Lines | Role |
|------|-------|------|
| `public/js/tabs/downtime-form.js` | 5746–5791 | `renderConnectedCharsZone(n, saved, chars)` — renders chips + `<select class="dt-conn-add">` |
| `public/js/tabs/downtime-form.js` | 2684–2701 | `change` handler on container for `.dt-conn-add` — appends ID to JSON array + calls `renderForm()` |
| `public/js/tabs/downtime-form.js` | 3092–3106 | `click` handler on container for `.dt-conn-remove` — removes ID from JSON array + calls `renderForm()` |

### Reference implementation (DT Processing)

| File | Lines | Role |
|------|-------|------|
| `public/js/admin/downtime-views.js` | 7183–7198 | `_renderCharTypeahead()` — renders `proc-conn-*` structure |
| `public/js/admin/downtime-views.js` | 5762–5895 | Typeahead wiring: focus/input → filter dropdown; dd-item click → addChip; chip-x click → remove |
| `public/css/admin-layout.css` | 6585–6618 | `proc-conn-*` CSS (input, dropdown, dd-item, chips, chip, chip-x) |

### Why the current behaviour is limited

The `<select>` must call `renderForm()` after every add to reset the dropdown
to "Add a character…". This works but flickers and offers no filtering. The
DT Processing version mutates the DOM directly (no re-render) and supports
incremental filtering via text input.

---

## Fix

### T1 — Replace `<select>` in `renderConnectedCharsZone` with typeahead HTML [x]

**File:** `public/js/tabs/downtime-form.js`, function `renderConnectedCharsZone` (lines 5770–5790)

Replace the `<select class="dt-conn-add">` block with a typeahead structure:

```js
// BEFORE (lines 5782-5788):
h += `<select class="dt-conn-add" data-conn-slot="${n}">`;
h += '<option value="">Add a character…</option>';
for (const c of others.slice().sort(...)) {
  if (selectedSet.has(String(c.id))) continue;
  h += `<option value="${esc(String(c.id))}">${esc(c.name)}</option>`;
}
h += '</select>';

// AFTER:
h += `<div class="dt-conn-typeahead" data-conn-slot="${n}">`;
h += `<div class="dt-conn-input-row">`;
h += `<input type="text" class="dt-conn-input" data-conn-slot="${n}" placeholder="Add a character…" autocomplete="off">`;
h += `<div class="dt-conn-dropdown" style="display:none"></div>`;
h += `</div>`;
h += '</div>';
```

The existing chips block (lines 5773–5780) moves to render INSIDE the
`.dt-conn-typeahead` wrapper, after the input-row:

```js
h += `<div class="dt-conn-typeahead" data-conn-slot="${n}">`;
h += `<div class="dt-conn-input-row">`;
h += `<input type="text" class="dt-conn-input" data-conn-slot="${n}" placeholder="Add a character…" autocomplete="off">`;
h += `<div class="dt-conn-dropdown" style="display:none"></div>`;
h += `</div>`;
// chips go here (inside the wrapper, after the input):
h += '<div class="dt-conn-chips">';
for (const id of selected) {
  const nm = labelOf(id);
  if (!nm) continue;
  h += `<span class="dt-conn-chip" data-conn-id="${esc(id)}">${esc(nm)} `
     + `<button type="button" class="dt-conn-remove" data-conn-slot="${n}" data-conn-id="${esc(id)}" title="Remove">×</button></span>`;
}
h += '</div>';
h += '</div>'; // close dt-conn-typeahead
```

Also remove the now-unused `selectedSet` const below line 5780 (it was only
used by the old `<select>` to filter already-selected chars from the option
list — the typeahead does this dynamically).

---

### T2 — Wire typeahead event handlers [x]

**File:** `public/js/tabs/downtime-form.js`

#### 2a — Remove the old `.dt-conn-add` change handler (lines 2687–2701)

Delete the block that reads `connAdd = e.target.closest('.dt-conn-add')`.
The `renderForm()` call it contains is no longer needed for this path.

#### 2b — Add `initConnectedCharsTypeaheads(container)` function

Create a new function (place it near `renderConnectedCharsZone`, around
line 5792) and call it after every `renderForm()` to wire each
`.dt-conn-typeahead` widget:

```js
function initConnectedCharsTypeaheads(container) {
  container.querySelectorAll('.dt-conn-typeahead').forEach(wrap => {
    const slot    = wrap.dataset.connSlot;
    const key     = `project_${slot}_connected_chars`;
    const input   = wrap.querySelector('.dt-conn-input');
    const dropdown = wrap.querySelector('.dt-conn-dropdown');
    const chipsEl  = wrap.querySelector('.dt-conn-chips');

    // allCharacters is the form-level character list (id, name pairs, self excluded)
    const others = (allCharacters || []).slice().sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );

    function getSelectedIds() {
      return new Set([...chipsEl.querySelectorAll('.dt-conn-chip')].map(c => c.dataset.connId));
    }

    function showDropdown(query) {
      const selected = getSelectedIds();
      const q = query.trim().toLowerCase();
      const matches = others.filter(c =>
        !selected.has(String(c.id)) && (!q || c.name.toLowerCase().includes(q))
      );
      if (!matches.length) { dropdown.style.display = 'none'; return; }
      dropdown.innerHTML = '';
      for (const c of matches.slice(0, 10)) {
        const item = document.createElement('div');
        item.className = 'dt-conn-dd-item';
        item.dataset.connId = String(c.id);
        item.textContent = c.name;
        dropdown.appendChild(item);
      }
      dropdown.style.display = '';
    }

    function addChip(id, name) {
      const chip = document.createElement('span');
      chip.className = 'dt-conn-chip';
      chip.dataset.connId = id;
      chip.appendChild(document.createTextNode(name + ' '));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dt-conn-remove';
      btn.dataset.connSlot = slot;
      btn.dataset.connId = id;
      btn.title = 'Remove';
      btn.textContent = '×';
      chip.appendChild(btn);
      chipsEl.appendChild(chip);
    }

    function saveToResponseDoc() {
      const ids = [...chipsEl.querySelectorAll('.dt-conn-chip')].map(c => c.dataset.connId);
      const base = (responseDoc && responseDoc.responses) || {};
      const next = { ...base, [key]: JSON.stringify(ids) };
      if (responseDoc) responseDoc.responses = next;
      else responseDoc = { responses: next };
      scheduleSave();
    }

    input.addEventListener('focus', () => showDropdown(input.value));
    input.addEventListener('input', () => showDropdown(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { dropdown.style.display = 'none'; input.value = ''; }
    });
    input.addEventListener('blur', () =>
      setTimeout(() => { dropdown.style.display = 'none'; }, 150)
    );

    wrap.addEventListener('click', e => {
      // Pick from dropdown
      const ddItem = e.target.closest('.dt-conn-dd-item');
      if (ddItem) {
        const id = ddItem.dataset.connId;
        const char = others.find(c => String(c.id) === id);
        if (char && !getSelectedIds().has(id)) {
          addChip(id, char.name);
          input.value = '';
          dropdown.style.display = 'none';
          saveToResponseDoc();
        }
        return;
      }
      // Remove chip
      const removeBtn = e.target.closest('.dt-conn-remove');
      if (removeBtn) {
        removeBtn.closest('.dt-conn-chip')?.remove();
        saveToResponseDoc();
      }
    });
  });
}
```

#### 2c — Call `initConnectedCharsTypeaheads(container)` after `renderForm()`

Find where `renderForm(container)` returns (or where the post-render step
runs) and add the call there, so typeahead handlers are re-wired on every
re-render. It must run after the DOM update, not before.

#### 2d — Keep the existing `.dt-conn-remove` click handler for legacy chips

The existing handler in the container `click` listener (lines 3092–3106)
targets `.dt-conn-remove` buttons and is still correct as a fallback for
chips rendered outside the typeahead widget. It can be left in place or
removed — the new `initConnectedCharsTypeaheads` handles remove inside the
widget. Since `saveToResponseDoc()` and the old handler do the same thing,
leaving the old handler causes a double-save on the same save (harmless) but
also calls `renderForm()` unnecessarily. **Remove the old handler** once the
typeahead handles all Connected Characters removal.

---

### T3 — Add `dt-conn-*` CSS to `components.css` [x]

**File:** `public/css/components.css`

Add after the existing `.dt-conn-chip` and `.dt-connected-zone` rules
(search for `dt-conn` to find the insertion point, or append in the
downtime-form section):

```css
/* ── Connected Characters typeahead (issue #727) ──────────────────────────── */
.dt-conn-typeahead   { margin-top: 6px; }
.dt-conn-input-row   { position: relative; }
.dt-conn-chips       { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.dt-conn-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 6px 2px 9px; border-radius: 12px;
  background: var(--gold-a12); border: 1px solid var(--gold2-a25);
  color: var(--gold2); font-size: 12px; white-space: nowrap;
}
.dt-conn-remove {
  background: none; border: none; cursor: pointer;
  color: var(--txt3); font-size: 15px; line-height: 1; padding: 0; margin: 0;
}
.dt-conn-remove:hover { color: var(--crim); }
.dt-conn-input {
  width: 100%; box-sizing: border-box;
  padding: 5px 8px; background: var(--bg);
  border: 1px solid var(--bdr); border-radius: 4px;
  color: var(--text); font-size: 13px; font-family: var(--fl);
}
.dt-conn-input:focus { outline: none; border-color: var(--gold2); }
.dt-conn-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 200;
  background: var(--bg); border: 1px solid var(--bdr);
  border-top: none; border-radius: 0 0 4px 4px;
  max-height: 180px; overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,.35);
}
.dt-conn-dd-item {
  padding: 6px 10px; cursor: pointer;
  font-size: 13px; color: var(--text);
}
.dt-conn-dd-item:hover { background: var(--gold-a10); color: var(--gold2); }
```

**Audit first:** search `components.css` for any existing `.dt-conn-chip`
rule before adding — do not duplicate.

---

### T4 — QA: write and run Playwright spec [x]

**File:** `tests/feat-727-dt-form-connected-chars-typeahead.spec.js`

Use the player-form test harness (see `tests/` for the DT form test
pattern — start the local dev server at `:8080`).

Test cases:

| # | Steps | Assertion |
|---|-------|-----------|
| 1 | Focus the Connected Characters input, type partial name | Dropdown appears with matching character(s) |
| 2 | Click a dropdown item | Chip appears; dropdown closes; input clears |
| 3 | Click a second dropdown item | Second chip appears (both chips present) |
| 4 | Click chip × | Chip removed; field still functional |
| 5 | Type same name twice (try to add duplicate) | Second pick of same char is not available in dropdown (dedup) |
| 6 | Load a submission with one legacy `project_1_connected_chars` entry | Single chip renders correctly (backwards compat) |

---

## Acceptance criteria

- [ ] Given a player focuses the Connected Characters input and types a name,
  a filtered dropdown of matching characters appears
- [ ] Given a player clicks a character in the dropdown, a chip with that
  character's name and a dismiss × appears; the input clears
- [ ] Given a player repeats the above for a second character, both chips are
  present and both IDs are submitted in `project_N_connected_chars`
- [ ] Given a character is already chipped, they do not appear in the
  dropdown (no duplicates)
- [ ] Given a player dismisses a chip via ×, the chip is removed and the
  response is updated
- [ ] Given an existing single-character submission (legacy shape), the field
  renders the one character as a chip with no crash

---

## Guardrails

- Only `downtime-form.js` and `components.css` change (no server, no schema).
- Storage key and JSON array format are unchanged — no migration needed.
- The `renderForm()` call must NOT be triggered on chip add/remove
  (typeahead handles DOM mutation directly, avoiding the flash).
- `allCharacters` must already be populated when `initConnectedCharsTypeaheads`
  runs — this is true because `renderForm()` only runs after characters are
  loaded (existing behaviour).
- Do not port `saveEntryReview()` or any admin-side save paths into the player
  form — `responseDoc.responses` + `scheduleSave()` is the correct write path.

---

## Dev Agent Record

### Files changed
- `public/js/tabs/downtime-form.js` — T1: replaced `<select class="dt-conn-add">` with typeahead structure in `renderConnectedCharsZone`; T2: added `initConnectedCharsTypeaheads(container)`; removed old `.dt-conn-add` change handler and `.dt-conn-remove` click handler; added `initConnectedCharsTypeaheads(container)` call after `updateSectionTicks`
- `public/css/components.css` — T3: added `dt-conn-typeahead/input-row/chips/chip/remove/input/dropdown/dd-item` CSS block
- `tests/feat-727-dt-form-connected-chars-typeahead.spec.js` — T4: 6 new AC tests, all passing
- `tests/dt-form-589-connected-chars-capture.spec.js` — updated 3 tests that referenced `.dt-conn-add` select (now typeahead); all 4 still passing

### Completion notes
Storage key (`project_N_connected_chars` = JSON array of IDs) and legacy parse path unchanged — backwards compatible. Event wiring uses per-render `initConnectedCharsTypeaheads` queried after `container.innerHTML = h` (above the `_dtWired` guard). No `renderForm()` on chip add/remove — DOM-only mutation avoids flicker. 11/11 tests passing.
