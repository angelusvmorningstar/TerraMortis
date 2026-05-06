/**
 * DT submission MINIMAL-completeness check (ADR-003 §Q3, §Q8).
 *
 * Single source of truth for "is this player above the minimum-complete bar
 * this cycle?". Lives in its own module so it can be imported client-side
 * (downtime-form lifecycle) and, in a future Q7 server-side validation pass,
 * by the API without dragging form code along.
 *
 * Pure ESM. No DOM. No `document` / `window` / `localStorage` / `fetch`.
 *
 * MINIMAL set per ADR §Q2:
 *   court + personal_story (reduced) + feeding (simplified)
 *   + 1 project + regency-if-regent
 *
 * Each rule below mirrors the §Q8 spec and is inverted to drive the
 * banner's missing-pieces list (story #17 UI affordance #1).
 */

const FEEDING_POOL_KEYS = ['_feed_disc', '_feed_custom_attr', '_feed_custom_skill', '_feed_custom_disc'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function _hasAnyGameRecount(responses) {
  // Any of game_recount_1..5 non-empty, or the legacy joined `game_recount`.
  for (let n = 1; n <= 5; n++) {
    if (isNonEmptyString(responses[`game_recount_${n}`])) return true;
  }
  return isNonEmptyString(responses.game_recount);
}

function _hasPersonalStory(responses) {
  // Per ADR §Q2 / story #18 simplification: a target ("who") + a note ("what
  // moment"). The current renderer (renderPersonalStorySection) persists
  // personal_story_npc_name + personal_story_note. Legacy fallbacks accept
  // `correspondence` as the moment text.
  const hasWho = isNonEmptyString(responses.personal_story_npc_name)
              || isNonEmptyString(responses.personal_story_npc_id);
  const hasWhat = isNonEmptyString(responses.personal_story_note)
               || isNonEmptyString(responses.story_moment_note)
               || isNonEmptyString(responses.osl_moment)
               || isNonEmptyString(responses.correspondence);
  return hasWho && hasWhat;
}

function _hasFeedingTerritory(responses) {
  // feeding_territories is a JSON-stringified map of slug → state. Any slug
  // not 'none' counts as a chosen feeding territory.
  let grid;
  try { grid = JSON.parse(responses.feeding_territories || '{}'); } catch { return false; }
  if (!grid || typeof grid !== 'object') return false;
  return Object.values(grid).some(state => isNonEmptyString(state) && state !== 'none');
}

function _hasFeedingMethod(responses) {
  return FEEDING_POOL_KEYS.some(k => isNonEmptyString(responses[k]));
}

function _hasFeedingBloodType(responses) {
  let arr;
  try { arr = JSON.parse(responses._feed_blood_types || '[]'); } catch { return false; }
  return Array.isArray(arr) && arr.length > 0;
}

function _hasFeedingViolence(responses) {
  return isNonEmptyString(responses.feed_violence);
}

function _hasFeedingComplete(responses) {
  return _hasFeedingTerritory(responses)
      && _hasFeedingMethod(responses)
      && _hasFeedingBloodType(responses)
      && _hasFeedingViolence(responses);
}

function _hasFirstProject(responses) {
  return isNonEmptyString(responses.project_1_action);
}

/**
 * @param {object} responses           — submission.responses bag
 * @param {object} [ctx]               — optional caller-side context
 * @param {boolean} [ctx.isRegent]      — true if the character owns a regent territory
 * @param {boolean} [ctx.regencyConfirmed] — true if the regent has confirmed feeding rights this cycle
 * @returns {boolean}
 */
export function isMinimalComplete(responses, ctx = {}) {
  if (!responses || typeof responses !== 'object') return false;
  const { isRegent = false, regencyConfirmed = false } = ctx;

  if (!_hasAnyGameRecount(responses)) return false;
  if (!_hasPersonalStory(responses)) return false;
  if (!_hasFeedingComplete(responses)) return false;
  if (!_hasFirstProject(responses)) return false;
  if (isRegent && !regencyConfirmed) return false;
  return true;
}

/**
 * Inverts isMinimalComplete to drive the banner's missing-pieces list.
 *
 * @param {object} responses
 * @param {object} [ctx]
 * @returns {{section: string, label: string}[]}
 */
export function missingMinimumPieces(responses, ctx = {}) {
  const out = [];
  if (!responses || typeof responses !== 'object') {
    out.push({ section: 'court', label: 'Fill in your game recount' });
    out.push({ section: 'personal_story', label: 'Name a Personal Story moment' });
    out.push({ section: 'feeding', label: 'Pick a feeding territory, method, blood type, and Kiss/Violent toggle' });
    out.push({ section: 'projects', label: 'Pick an action for Project 1' });
    return out;
  }
  const { isRegent = false, regencyConfirmed = false } = ctx;

  if (!_hasAnyGameRecount(responses)) {
    out.push({ section: 'court', label: 'Game Recount: add at least one highlight from last session' });
  }
  if (!_hasPersonalStory(responses)) {
    out.push({ section: 'personal_story', label: 'Personal Story: name an NPC and describe the moment you want' });
  }
  if (!_hasFeedingTerritory(responses)) {
    out.push({ section: 'feeding', label: 'Feeding: pick a territory to hunt in' });
  }
  if (!_hasFeedingMethod(responses)) {
    out.push({ section: 'feeding', label: 'Feeding: pick a method (build the hunt pool)' });
  }
  if (!_hasFeedingBloodType(responses)) {
    out.push({ section: 'feeding', label: 'Feeding: pick at least one blood type' });
  }
  if (!_hasFeedingViolence(responses)) {
    out.push({ section: 'feeding', label: 'Feeding: choose Kiss or Violent' });
  }
  if (!_hasFirstProject(responses)) {
    out.push({ section: 'projects', label: 'Project 1: pick an action' });
  }
  if (isRegent && !regencyConfirmed) {
    out.push({ section: 'regency', label: 'Regency: confirm this cycle’s feeding rights' });
  }
  return out;
}
