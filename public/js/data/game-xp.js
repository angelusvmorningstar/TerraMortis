/**
 * Compute game XP per character from game_sessions attendance data.
 * Caches result as c._gameXP (total) and c._gameXPDetail (per-game breakdown)
 * for use by xpGame() and the XP breakdown panel.
 *
 * Shared between admin and player portals so both see live attendance XP.
 */

import { apiGet } from './api.js';
import { displayName } from './helpers.js';

export async function loadGameXP(chars, isST = true) {
  try {
    // ST users get the full sessions list; players use the character-scoped endpoint
    let gameSessions;
    try {
      if (!isST) throw new Error('player');
      gameSessions = await apiGet('/api/game_sessions');
    } catch {
      gameSessions = await apiGet('/api/characters/game-xp');
    }
    for (const c of chars) { c._gameXP = 0; c._gameXPDetail = []; }

    // Sort sessions by date ascending for consistent display
    gameSessions.sort((a, b) => (a.session_date || '').localeCompare(b.session_date || ''));

    for (const s of gameSessions) {
      for (const a of s.attendance || []) {
        const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
        if (xp === 0) continue;

        // Phase 1: id match (authoritative). Coerce both sides — both are JSON strings
        // in practice, but guard against any path that supplies a non-string ObjectId.
        // #821: id-first, silent-drop + warn on id-present-no-match (prod audit 2026-07-03
        // confirmed 0 rows in that state; warn is diagnostic surface for future corner cases).
        let c = null;
        if (a.character_id) {
          c = chars.find(ch => String(ch._id) === String(a.character_id));
          if (!c) {
            console.warn(`[game-xp] attendance row with character_id=${a.character_id} matched no character — XP unattributed`);
          }
        }
        // Phase 2: name fallback — only for legacy rows that genuinely lack character_id.
        // Rows with a character_id that fails to match stay unattributed (signal to backfill).
        if (!c && !a.character_id) {
          c = chars.find(ch =>
            ch.name === a.character_name ||
            ch.name === a.name ||
            displayName(ch) === (a.display_name || a.character_display)
          );
        }
        if (c) {
          c._gameXP += xp;
          c._gameXPDetail.push({
            title: s.title || `Game ${s.session_number || '?'}`,
            date: s.session_date,
            xp,
            attended: !!a.attended,
            costuming: !!a.costuming,
            downtime: !!a.downtime,
            extra: a.extra || 0,
            paid: !!a.paid,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Could not load game sessions for XP:', err.message);
  }
}
