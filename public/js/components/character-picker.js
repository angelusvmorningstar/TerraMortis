/**
 * Universal character picker — ADR-003 §Q6 + §Q10.
 *
 * Locked signature:
 *   charPicker({ scope, cardinality, initial, onChange, placeholder, excludeIds })
 *
 *  - scope:        'all' | 'attendees' — source list (set via setCharPickerSources)
 *  - cardinality:  'single' | 'multi'
 *  - initial:      string | string[]   — initial selection(s)
 *  - onChange:     (next) => void      — called with current selection (id string or id[])
 *  - placeholder:  string              — empty-input placeholder
 *  - excludeIds:   string[] (optional) — character ids to hide from dropdown options
 *
 * Returns: HTMLElement (the picker root). Re-mount by calling charPicker again
 * with new options; existing element can be replaced via Element.replaceWith().
 *
 * Source list shape: array of { id: string, name: string }. Consumers populate
 * via setCharPickerSources({ all, attendees }) before mounting.
 *
 * Form-local consumption only (per ADR-003 Out-of-scope). Imported by
 * downtime-form.js and regency-tab.js.
 */

let _allSource = [];
let _attendeesSource = [];

export function setCharPickerSources({ all, attendees } = {}) {
  if (Array.isArray(all)) _allSource = all.slice();
  if (Array.isArray(attendees)) _attendeesSource = attendees.slice();
}

let _uidCounter = 0;
function _nextUid() { return `cp-${++_uidCounter}`; }

function _normIds(initial, cardinality) {
  if (cardinality === 'multi') {
    if (Array.isArray(initial)) return initial.map(String).filter(Boolean);
    if (typeof initial === 'string' && initial) return [initial];
    return [];
  }
  // single
  if (Array.isArray(initial)) return initial[0] ? String(initial[0]) : '';
  return initial ? String(initial) : '';
}

function _filterMatches(items, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter(it => (it.name || '').toLowerCase().includes(q));
}

export function charPicker({
  scope,
  cardinality,
  initial,
  onChange,
  placeholder,
  excludeIds,
} = {}) {
  if (scope !== 'all' && scope !== 'attendees') {
    throw new Error(`charPicker: scope must be 'all' or 'attendees' (got ${scope})`);
  }
  if (cardinality !== 'single' && cardinality !== 'multi') {
    throw new Error(`charPicker: cardinality must be 'single' or 'multi' (got ${cardinality})`);
  }

  const uid = _nextUid();
  const listboxId = `${uid}-listbox`;
  const sourceArr = scope === 'attendees' ? _attendeesSource : _allSource;
  const excludeSet = new Set((excludeIds || []).map(String));

  // Mutable state
  let selected = _normIds(initial, cardinality); // string for single, string[] for multi
  let query = '';
  let activeIdx = -1;
  let open = false;
  let filteredCache = [];

  // Root
  const root = document.createElement('div');
  root.className = `char-picker char-picker--${scope} char-picker--${cardinality}`;
  root.dataset.charPicker = '';

  // Selection display (chips/pill area)
  const chipsEl = document.createElement('div');
  chipsEl.className = 'char-picker__chips';
  if (cardinality === 'multi') chipsEl.setAttribute('role', 'list');

  // Combo wrapper
  const comboEl = document.createElement('div');
  comboEl.className = 'char-picker__combo';

  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'char-picker__input';
  inputEl.setAttribute('role', 'combobox');
  inputEl.setAttribute('aria-expanded', 'false');
  inputEl.setAttribute('aria-controls', listboxId);
  inputEl.setAttribute('aria-autocomplete', 'list');
  inputEl.setAttribute('aria-haspopup', 'listbox');
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;
  if (placeholder) inputEl.placeholder = placeholder;

  const listboxEl = document.createElement('ul');
  listboxEl.className = 'char-picker__listbox';
  listboxEl.id = listboxId;
  listboxEl.setAttribute('role', 'listbox');
  listboxEl.hidden = true;

  comboEl.appendChild(inputEl);
  comboEl.appendChild(listboxEl);
  root.appendChild(chipsEl);
  root.appendChild(comboEl);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function lookupName(id) {
    const item = sourceArr.find(it => String(it.id) === String(id));
    return item ? item.name : String(id);
  }

  function getSelectedSet() {
    if (cardinality === 'multi') return new Set(selected.map(String));
    return new Set(selected ? [String(selected)] : []);
  }

  function emitChange() {
    if (typeof onChange !== 'function') return;
    if (cardinality === 'multi') onChange(selected.slice());
    else onChange(selected);
  }

  function renderChips() {
    chipsEl.innerHTML = '';
    if (cardinality === 'single') {
      if (selected) {
        const pill = document.createElement('span');
        pill.className = 'char-picker__pill';
        pill.textContent = lookupName(selected);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'char-picker__pill-clear';
        clearBtn.setAttribute('aria-label', `Clear ${lookupName(selected)}`);
        clearBtn.textContent = '×';
        clearBtn.addEventListener('click', (e) => {
          e.preventDefault();
          selected = '';
          renderChips();
          renderList();
          emitChange();
          inputEl.focus();
        });
        pill.appendChild(clearBtn);
        chipsEl.appendChild(pill);
      }
      return;
    }
    // multi
    for (const id of selected) {
      const chip = document.createElement('span');
      chip.className = 'char-picker__chip';
      chip.setAttribute('role', 'listitem');
      chip.dataset.charId = id;
      chip.textContent = lookupName(id);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'char-picker__chip-remove';
      rm.setAttribute('aria-label', `Remove ${lookupName(id)}`);
      rm.textContent = '×';
      rm.addEventListener('click', (e) => {
        e.preventDefault();
        selected = selected.filter(x => String(x) !== String(id));
        renderChips();
        renderList();
        emitChange();
        inputEl.focus();
      });
      chip.appendChild(rm);
      chipsEl.appendChild(chip);
    }
  }

  function getFiltered() {
    const sel = getSelectedSet();
    const visible = sourceArr.filter(it => {
      const id = String(it.id);
      if (excludeSet.has(id)) return false;
      if (cardinality === 'multi' && sel.has(id)) return false; // already chipped
      return true;
    });
    return _filterMatches(visible, query);
  }

  function setActiveDescendant() {
    if (!open || activeIdx < 0 || activeIdx >= filteredCache.length) {
      inputEl.removeAttribute('aria-activedescendant');
      return;
    }
    const item = filteredCache[activeIdx];
    inputEl.setAttribute('aria-activedescendant', `${uid}-opt-${item.id}`);
  }

  function renderList() {
    filteredCache = getFiltered();
    listboxEl.innerHTML = '';

    if (filteredCache.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'char-picker__empty';
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-disabled', 'true');
      empty.textContent = query ? 'No matches' : 'No characters available';
      listboxEl.appendChild(empty);
    } else {
      filteredCache.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'char-picker__option';
        li.setAttribute('role', 'option');
        li.id = `${uid}-opt-${item.id}`;
        li.dataset.charId = String(item.id);
        if (idx === activeIdx) {
          li.classList.add('char-picker__option--active');
          li.setAttribute('aria-selected', 'true');
        } else {
          li.setAttribute('aria-selected', 'false');
        }
        li.textContent = item.name;
        li.addEventListener('mousedown', (e) => {
          // mousedown to fire before input blur
          e.preventDefault();
          commitSelection(item);
        });
        li.addEventListener('mousemove', () => {
          if (activeIdx !== idx) {
            activeIdx = idx;
            updateActiveClass();
            setActiveDescendant();
          }
        });
        listboxEl.appendChild(li);
      });
    }
    setActiveDescendant();
  }

  function updateActiveClass() {
    listboxEl.querySelectorAll('.char-picker__option').forEach((el, i) => {
      el.classList.toggle('char-picker__option--active', i === activeIdx);
      el.setAttribute('aria-selected', i === activeIdx ? 'true' : 'false');
    });
  }

  function openDropdown() {
    if (open) return;
    open = true;
    listboxEl.hidden = false;
    inputEl.setAttribute('aria-expanded', 'true');
    if (activeIdx < 0 && filteredCache.length > 0) activeIdx = 0;
    updateActiveClass();
    setActiveDescendant();
  }

  function closeDropdown() {
    if (!open) return;
    open = false;
    listboxEl.hidden = true;
    inputEl.setAttribute('aria-expanded', 'false');
    activeIdx = -1;
    inputEl.removeAttribute('aria-activedescendant');
  }

  function commitSelection(item) {
    if (!item) return;
    if (cardinality === 'single') {
      selected = String(item.id);
      query = '';
      inputEl.value = '';
      renderChips();
      renderList();
      closeDropdown();
      emitChange();
    } else {
      if (!selected.includes(String(item.id))) {
        selected = [...selected, String(item.id)];
      }
      query = '';
      inputEl.value = '';
      renderChips();
      renderList();
      activeIdx = filteredCache.length > 0 ? 0 : -1;
      updateActiveClass();
      setActiveDescendant();
      // dropdown stays open in multi mode
      emitChange();
    }
  }

  // ── Input handlers ───────────────────────────────────────────────────────

  inputEl.addEventListener('input', () => {
    query = inputEl.value;
    activeIdx = 0;
    renderList();
    openDropdown();
  });

  inputEl.addEventListener('focus', () => {
    renderList();
    openDropdown();
  });

  inputEl.addEventListener('blur', () => {
    // delay close so option mousedown can register
    setTimeout(() => {
      if (!root.contains(document.activeElement)) closeDropdown();
    }, 100);
  });

  inputEl.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { openDropdown(); return; }
        if (filteredCache.length === 0) return;
        activeIdx = (activeIdx + 1) % filteredCache.length;
        updateActiveClass();
        setActiveDescendant();
        ensureActiveVisible();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) { openDropdown(); return; }
        if (filteredCache.length === 0) return;
        activeIdx = (activeIdx - 1 + filteredCache.length) % filteredCache.length;
        updateActiveClass();
        setActiveDescendant();
        ensureActiveVisible();
        break;
      case 'Enter':
        if (open && activeIdx >= 0 && activeIdx < filteredCache.length) {
          e.preventDefault();
          commitSelection(filteredCache[activeIdx]);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          query = '';
          inputEl.value = '';
          renderList();
          closeDropdown();
        }
        break;
      case 'Backspace':
        // remove last chip when query is empty (multi only)
        if (cardinality === 'multi' && !query && selected.length > 0) {
          selected = selected.slice(0, -1);
          renderChips();
          renderList();
          emitChange();
        }
        break;
      default:
        break;
    }
  });

  function ensureActiveVisible() {
    if (activeIdx < 0) return;
    const opt = listboxEl.querySelectorAll('.char-picker__option')[activeIdx];
    if (!opt) return;
    const optTop = opt.offsetTop;
    const optBottom = optTop + opt.offsetHeight;
    if (optTop < listboxEl.scrollTop) {
      listboxEl.scrollTop = optTop;
    } else if (optBottom > listboxEl.scrollTop + listboxEl.clientHeight) {
      listboxEl.scrollTop = optBottom - listboxEl.clientHeight;
    }
  }

  // Initial render
  renderChips();
  renderList();

  return root;
}
