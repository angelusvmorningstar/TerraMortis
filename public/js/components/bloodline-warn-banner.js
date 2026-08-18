/**
 * Unresolved-bloodline warning banner (Epic BL, BL-2 / issue #1008).
 *
 * The loud half of the miss-path ruling. Returning an empty discipline list
 * stops a wrong in-clan cost being applied, but an empty list is just as quiet
 * as the bug it replaces, so every miss the cache registers is surfaced here.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this does not reuse `app-status-banner`
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   Because it does not exist. `public/js/app.js` and `public/js/admin.js`
 *   both carry `const banner = document.getElementById('app-status-banner');
 *   if (banner) { ... }` for the rules-engine boot failure, and there is no
 *   element with that id in any HTML file and no CSS for the class it sets.
 *   The defensive `if` turned a missing element into permanent silence, so
 *   that warning has never once reached a user (data-map.md drift pattern #16).
 *
 *   Two consequences for this module. The mount is declared in both
 *   `index.html` and `admin.html` AND asserted by a test, so it cannot quietly
 *   go missing. And if it is missing anyway, `mount()` CREATES the element
 *   rather than returning early, because a banner that silently does nothing
 *   is worse than no banner at all: it reads, to the next author, as covered.
 */

import { esc } from '../data/helpers.js';
import {
  MISS_NOT_LOADED,
  MISS_EMPTY_COLLECTION,
  getBloodlineMisses,
  onBloodlineMiss,
} from '../data/bloodlines-cache.js';

export const BLOODLINE_WARN_MOUNT_ID = 'bloodline-warn-banner';

/**
 * Build the banner markup from a miss snapshot. Pure, so the wording and the
 * escaping are testable without a DOM.
 *
 * @param {Array<{reason: string, bloodline: string, characters: string[]}>} misses
 * @returns {string} '' when there is nothing to say
 */
export function buildBloodlineWarnHtml(misses) {
  if (!Array.isArray(misses) || !misses.length) return '';

  const rows = misses.map(m => {
    const who = (m.characters || []).map(esc).join(', ');

    if (m.reason === MISS_NOT_LOADED) {
      // A system state. Transient, affects everyone, and reloading is a real
      // remedy - so say so. Named characters are still listed, because the
      // ruling says the banner names who is affected regardless of cause.
      return '<div class="bl-warn-row">'
        + '<strong>Bloodline data has not loaded.</strong> '
        + 'Every character with a bloodline is being costed as out-of-clan '
        + '(4 XP per dot) and discipline editing is locked. '
        + (who ? 'Affected so far: ' + who + '. ' : '')
        + 'Reload the page; if that does not clear it, the API is unreachable.'
        + '</div>';
    }

    if (m.reason === MISS_EMPTY_COLLECTION) {
      // An operational state, and the one most likely to be hit first: BL-1
      // ships the collection but the seed is a separate manual act.
      return '<div class="bl-warn-row">'
        + '<strong>The bloodlines collection is empty.</strong> '
        + 'It has almost certainly not been seeded, so every character with a '
        + 'bloodline is being costed as out-of-clan (4 XP per dot) and '
        + 'discipline editing is locked. '
        + (who ? 'Affected so far: ' + who + '. ' : '')
        + 'This is an operational fix, not a reload.'
        + '</div>';
    }

    // A data state. Persistent, affects named characters, and reloading will
    // not invent the missing bloodline - so do not suggest it.
    return '<div class="bl-warn-row">'
      + '<strong>Bloodline not found: ' + esc(m.bloodline) + '.</strong> '
      + (who ? 'Affects ' + who + '. ' : '')
      + 'Their disciplines are all being costed as out-of-clan (4 XP per dot) '
      + 'and discipline editing is locked until the bloodline is added.'
      + '</div>';
  });

  return '<div class="bl-warn-banner" role="alert">' + rows.join('') + '</div>';
}

/**
 * Resolve the mount, creating it if the declared element is absent. Never
 * returns null - see the header note on drift pattern #16.
 */
function resolveMount() {
  let el = document.getElementById(BLOODLINE_WARN_MOUNT_ID);
  if (el) return el;
  console.error(
    `[bloodline-warn-banner] #${BLOODLINE_WARN_MOUNT_ID} is missing from this page; `
    + 'creating it so the warning is not silently dropped. Add the element to the markup.'
  );
  el = document.createElement('div');
  el.id = BLOODLINE_WARN_MOUNT_ID;
  document.body.insertBefore(el, document.body.firstChild);
  return el;
}

/** Render the current miss set into the mount. */
export function renderBloodlineWarnBanner() {
  if (typeof document === 'undefined') return;
  resolveMount().innerHTML = buildBloodlineWarnHtml(getBloodlineMisses());
}

/**
 * Render once and re-render whenever the miss registry changes. Call once per
 * app boot. Returns an unsubscribe for symmetry with the cache's listener API.
 */
export function mountBloodlineWarnBanner() {
  if (typeof document === 'undefined') return () => {};
  renderBloodlineWarnBanner();
  return onBloodlineMiss(renderBloodlineWarnBanner);
}
