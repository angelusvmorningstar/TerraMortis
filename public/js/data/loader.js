/**
 * Data loader - fetches JSON data files and manages localStorage.
 * All data loading goes through this module.
 */

let _meritsDb = null;
let _devotionsDb = null;
let _manDb = null;
let _chars = null;

const LS_KEY = 'tm_chars_db';

/** Fetch a JSON file, with error logging. */
async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

/** Load all reference data. Call once at app init. */
export async function loadReferenceData() {
  const [merits, devotions, man] = await Promise.all([
    fetchJson('data/merits_db.json'),
    fetchJson('data/devotions_db.json'),
    fetchJson('data/man_db.json'),
  ]);
  _meritsDb = merits;
  _devotionsDb = devotions;
  _manDb = man;
  return { meritsDb: merits, devotionsDb: devotions, manDb: man };
}

/** Get cached reference data (must call loadReferenceData first). */
export function getMeritsDb() { return _meritsDb; }
export function getDevotionsDb() { return _devotionsDb; }
export function getManDb() { return _manDb; }

/** Load characters from localStorage, falling back to JSON file. */
export async function loadChars() {
  const stored = localStorage.getItem(LS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.v === 2 && Array.isArray(parsed.chars)) {
        _chars = parsed.chars;
        return _chars;
      }
    } catch (e) {
      console.warn('Invalid localStorage data, loading from file');
    }
  }
  _chars = await fetchJson('data/chars_test.json');
  return _chars;
}

/** Save characters to localStorage in v2 format. */
export function saveChars(chars) {
  _chars = chars;
  localStorage.setItem(LS_KEY, JSON.stringify({ v: 2, chars }));
}

/** Get cached characters (must call loadChars first). */
export function getChars() { return _chars; }

/** Get tracker data for a character. */
export function getTrackerData(name) {
  const raw = localStorage.getItem(`tm_tracker_${name}`);
  return raw ? JSON.parse(raw) : null;
}

/** Set tracker data for a character. */
export function setTrackerData(name, data) {
  localStorage.setItem(`tm_tracker_${name}`, JSON.stringify(data));
}
