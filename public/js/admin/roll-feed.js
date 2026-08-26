/**
 * Engine domain — live roll feed (gdx.8, #989).
 *
 * Read-only. Initial paint via GET /api/roll_log (most recent N); live
 * updates via the 'roll_log' WS frame thereafter (wired in admin.js's own
 * initWS({...}) call — a SEPARATE connection from the player app's, per
 * gdx-5's own established two-initWS-calls precedent).
 *
 * This is a NEW Engine domain, not a revival of the old (fully removed in
 * rlv.6/#836) dice-engine.js/feeding-engine.js/session-tracker.js tools, and
 * not related to session-log.js's own separately-dead initSessionLog import
 * (free-text session notes, a different feature — see this story's own Dev
 * Notes for that finding).
 */

import { apiGet } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';

const FEED_CAP = 50; // mirrors state.hist's own 20-cap precedent in roll-v2.js, sized up for a shared ST view

let _rootEl = null;
let _charsById = new Map();
let _feed = [];
let _initialized = false;
// Review fix (Blind Hunter + Edge Case Hunter, independently): _initialized
// flips true below BEFORE the GET resolves, so a real 'roll_log' WS frame
// can arrive mid-fetch. The old code let onRollLogged() unshift into _feed
// during that window, then silently discarded it with `_feed = rows`
// (unconditional overwrite, not a merge) once the fetch completed. Buffer
// anything that arrives while a fetch is in flight and merge it back in.
let _fetchInFlight = false;
let _bufferedDuringFetch = [];

async function _fetchAndMerge() {
  _fetchInFlight = true;
  _bufferedDuringFetch = [];
  let rows;
  try {
    rows = await apiGet('/api/roll_log');
    rows = Array.isArray(rows) ? rows : [];
  } catch {
    rows = [];
  } finally {
    _fetchInFlight = false;
  }

  const rowIds = new Set(rows.map(e => String(e._id)));
  const missed = _bufferedDuringFetch.filter(e => !rowIds.has(String(e._id)));
  _bufferedDuringFetch = [];
  _feed = [...missed, ...rows].slice(0, FEED_CAP);
  _render();
}

/** init — called from admin.js switchDomain when 'engine' tab activates.
 *  Idempotent: subsequent calls refresh the char map but reuse the scaffold. */
export async function initRollFeed(rootEl, chars) {
  _rootEl = rootEl;
  if (!_rootEl) return;
  _charsById = new Map((chars || []).map(c => [String(c._id), c]));

  if (!_initialized) {
    _rootEl.innerHTML = renderScaffold();
    _initialized = true;
  }

  await _fetchAndMerge();
}

/**
 * Called from admin.js's WS onReconnect callback (gdx.8 review fix, Codex +
 * Edge Case Hunter, independently). A WS drop-and-reconnect while the
 * Engine tab stays open has no live "catch-up" — rolls broadcast during the
 * outage are simply never delivered, since the server only fans out
 * `roll_log` frames at write time, not on (re)connect. Re-fetches the same
 * way initRollFeed does, but ONLY if this domain has actually been opened
 * this session — a no-op otherwise, so this doesn't fire an unnecessary
 * GET on every reconnect for an ST who never visited Engine.
 */
export function refetchOnReconnect() {
  if (!_initialized) return;
  _fetchAndMerge();
}

/** Called from admin.js's onRollLogged WS callback with the new roll doc. */
export function onRollLogged(doc) {
  if (!_initialized) return; // domain never opened this session — nothing to paint into
  if (_fetchInFlight) { _bufferedDuringFetch.push(doc); return; }
  // Dedup safety net: the server broadcasts exactly once per POST and the
  // WS client never double-registers handlers on reconnect (both verified
  // in review), so this shouldn't trigger today — but costs nothing and
  // means a future violation of either invariant degrades to "no visible
  // duplicate" instead of a silently-wrong feed.
  if (_feed.some(e => String(e._id) === String(doc._id))) return;
  _feed.unshift(doc);
  if (_feed.length > FEED_CAP) _feed.length = FEED_CAP;
  _render();
}

function renderScaffold() {
  return `
    <div class="engine-feed-wrap">
      <div class="engine-feed-heading">Live Roll Feed</div>
      <div id="engine-feed-list" class="engine-feed-list"></div>
    </div>`;
}

function _render() {
  const listEl = _rootEl?.querySelector('#engine-feed-list');
  if (!listEl) return;
  if (!_feed.length) {
    listEl.innerHTML = '<div class="engine-feed-empty">No rolls yet this session.</div>';
    return;
  }
  listEl.innerHTML = _feed.map(_renderRow).join('');
}

function _renderRow(entry) {
  const c = _charsById.get(String(entry.character_id));
  const name = c ? displayName(c) : (entry.character_id || 'Unknown');
  const cls = entry.successes > 0 ? 'engine-feed-row--hit' : 'engine-feed-row--miss';
  const spendParts = [];
  if (entry.vitae_spent) spendParts.push(`${entry.vitae_spent} Vitae`);
  if (entry.wp_spent) spendParts.push(`${entry.wp_spent} WP`);
  const spendStr = spendParts.length ? ` &middot; spent ${esc(spendParts.join(', '))}` : '';
  const modParts = [];
  if (entry.rote) modParts.push('rote');
  if (entry.wp_bonus) modParts.push('WP +3');
  const modStr = modParts.length ? ` &middot; ${esc(modParts.join(', '))}` : '';

  return `<div class="engine-feed-row ${cls}">
    <span class="engine-feed-char">${esc(name)}</span>
    <span class="engine-feed-pool">${esc(entry.pool || '')}</span>
    <span class="engine-feed-label">${esc(entry.label || '')}</span>
    <span class="engine-feed-successes">${esc(entry.successes)}</span>
    <span class="engine-feed-meta">${esc(entry.again_rule || '')}${modStr}${spendStr}</span>
  </div>`;
}
