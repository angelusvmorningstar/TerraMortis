/* Persistence and export — localStorage I/O */

import state from '../data/state.js';
import { CHARS_DATA } from '../data/chars-data.js';

let _renderList, _updDirtyBadge;

/**
 * Register callback functions from main.js to avoid circular imports.
 * @param {Function} renderList - re-renders the character grid
 * @param {Function} updDirtyBadge - updates the dirty indicator badge
 */
export function registerCallbacks(renderList, updDirtyBadge) {
  _renderList = renderList;
  _updDirtyBadge = updDirtyBadge;
}

/**
 * Load character data from localStorage, falling back to embedded CHARS_DATA.
 * Writes to state.chars.
 */
export function loadDB() {
  try {
    const raw = localStorage.getItem('tm_chars_db');
    if (raw) { state.chars = JSON.parse(raw); return; }
  } catch (e) { /* ignore */ }
  try {
    const imp = localStorage.getItem('tm_import_chars');
    if (imp) { state.chars = JSON.parse(imp); return; }
  } catch (e) { /* ignore */ }
  // Fall back to built-in data
  state.chars = JSON.parse(JSON.stringify(CHARS_DATA));
}

/**
 * Produce a clean deep copy of state.chars with derived merits stripped.
 * @returns {Array} cleaned character array
 */
export function charsForSave() {
  return state.chars.map(c => {
    const copy = JSON.parse(JSON.stringify(c));
    if (copy.merits) {
      for (let i = copy.merits.length - 1; i >= 0; i--) {
        if (copy.merits[i].derived) {
          copy.merits.splice(i, 1);
          if (copy.merit_creation && copy.merit_creation[i] !== undefined) copy.merit_creation.splice(i, 1);
        }
      }
    }
    return copy;
  });
}

/**
 * Save characters to localStorage, clear dirty set, refresh UI.
 */
export function saveDB() {
  localStorage.setItem('tm_chars_db', JSON.stringify(charsForSave()));
  state.dirty.clear();
  if (_renderList) _renderList();
  if (_updDirtyBadge) _updDirtyBadge();
}

/**
 * Save all characters and flash the save button confirmation.
 */
export function saveAll() {
  saveDB();
  document.getElementById('btn-save').textContent = 'Saved \u2713';
  setTimeout(() => { document.getElementById('btn-save').textContent = 'Save All'; }, 1500);
}

/**
 * Sync characters to ST Suite via localStorage keys.
 */
export function syncToSuite() {
  const clean = charsForSave();
  localStorage.setItem('tm_chars_db', JSON.stringify(clean));
  localStorage.setItem('tm_import_chars', JSON.stringify(clean));
  localStorage.setItem('tm_import_meta', JSON.stringify({
    filename: 'tm_editor',
    count: clean.length,
    date: new Date().toISOString()
  }));
  state.dirty.clear();
  if (_renderList) _renderList();
  if (_updDirtyBadge) _updDirtyBadge();
  alert('Synced ' + clean.length + ' characters to ST Suite (tm_import_chars).');
}

/**
 * CSV export (stub — not yet implemented).
 */
export function downloadCSV() {
  alert('CSV export not yet implemented.');
}
