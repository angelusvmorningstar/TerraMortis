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
      if (val === 0) delete c.disciplines[key];
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

/** Get tracker data for a character from localStorage. */
export function getTrackerData(name) {
  const raw = localStorage.getItem(`tm_tracker_${name}`);
  return raw ? JSON.parse(raw) : null;
}

/** Set tracker data for a character in localStorage. */
export function setTrackerData(name, data) {
  localStorage.setItem(`tm_tracker_${name}`, JSON.stringify(data));
}
