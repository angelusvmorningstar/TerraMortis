/**
 * Data loader — dual-mode character loading.
 *
 * Game app (cache-first): tries API on startup, caches to localStorage,
 * falls back to cached data if API is unreachable.
 *
 * Admin app uses api.js directly and is unaffected by this module.
 */

import { apiGet } from './api.js';

const LS_KEY = 'tm_chars_db';

/**
 * Strip zero-dot disciplines from a character object.
 * Treats disciplines with 0 dots as absent everywhere in the app,
 * preventing rendering bugs and broken pool calculations.
 */
export function sanitiseChar(c) {
  if (c?.disciplines) {
    for (const [key, val] of Object.entries(c.disciplines)) {
      if ((typeof val === 'object' ? val.dots : val) === 0) delete c.disciplines[key];
    }
  }
  return c;
}

/** Sanitise an array of characters. */
function sanitiseAll(chars) {
  if (Array.isArray(chars)) chars.forEach(sanitiseChar);
  return chars;
}

/**
 * Fetch characters from the API, cache to localStorage, return the array.
 * If the API is unreachable, silently falls back to localStorage.
 * If localStorage is also empty, returns null (caller should fall back to embedded data).
 */
export async function loadCharsFromApi() {
  try {
    const chars = await apiGet('/api/characters');
    if (Array.isArray(chars) && chars.length) {
      sanitiseAll(chars);
      localStorage.setItem(LS_KEY, JSON.stringify(chars));
      return chars;
    }
  } catch {
    // API unreachable — fall through to localStorage
  }

  // Fall back to localStorage cache
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Handle both v2 wrapper format and raw array
      if (Array.isArray(parsed) && parsed.length) return sanitiseAll(parsed);
      if (parsed && parsed.v === 2 && Array.isArray(parsed.chars) && parsed.chars.length) return sanitiseAll(parsed.chars);
    }
  } catch {
    // Corrupt localStorage — fall through
  }

  return null;
}

// ── Rules (purchasable powers) loader ──

const RULES_KEY = 'tm_rules_db';
let _rulesCache = null;

/**
 * Fetch the purchasable_powers collection from the API, cache to localStorage.
 * Falls back to localStorage if API is unreachable.
 * Returns the array of power documents, or null.
 */
export async function loadRulesFromApi() {
  try {
    const rules = await apiGet('/api/rules');
    if (Array.isArray(rules) && rules.length) {
      _rulesCache = rules;
      localStorage.setItem(RULES_KEY, JSON.stringify(rules));
      return rules;
    }
  } catch {
    // API unreachable — fall through to localStorage
  }

  // Fall back to localStorage cache
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        _rulesCache = parsed;
        return parsed;
      }
    }
  } catch {
    // Corrupt localStorage — fall through
  }

  return null;
}

/** Get the cached rules array synchronously. Returns null if not yet loaded. */
export function getRulesDB() {
  if (_rulesCache) return _rulesCache;
  // Try localStorage as fallback for sync access before async load completes
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (raw) {
      _rulesCache = JSON.parse(raw);
      return _rulesCache;
    }
  } catch { /* ignore */ }
  return null;
}

/** Get a single rule by key slug. */
export function getRuleByKey(key) {
  const db = getRulesDB();
  if (!db) return null;
  return db.find(r => r.key === key) || null;
}

/** Get all rules for a given category. */
export function getRulesByCategory(category) {
  const db = getRulesDB();
  if (!db) return [];
  return db.filter(r => r.category === category);
}

/** Invalidate the rules cache (call after ST edits a rule). */
export function invalidateRulesCache() {
  _rulesCache = null;
  localStorage.removeItem(RULES_KEY);
}

/** Get tracker data for a character from localStorage. */
export function getTrackerData(name) {
  const raw = localStorage.getItem(`tm_tracker_${name}`);
  return raw ? JSON.parse(raw) : null;
}

/** Set tracker data for a character in localStorage. */
export function setTrackerData(name, data) {
  localStorage.setItem(`tm_tracker_${name}`, JSON.stringify(data));
}
