/**
 * Compute game XP per character from game_sessions attendance data.
 * Caches result as c._gameXP (total) and c._gameXPDetail (per-game breakdown)
 * for use by xpGame() and the XP breakdown panel.
 *
 * Shared between admin and player portals so both see live attendance XP.
 */

import { apiGet } from './api.js';
import { displayName } from './helpers.js';

export async function loadGameXP(chars) {
  try {
    const gameSessions = await apiGet('/api/game_sessions');
    for (const c of chars) { c._gameXP = 0; c._gameXPDetail = []; }

    // Sort sessions by date ascending for consistent display
    gameSessions.sort((a, b) => (a.session_date || '').localeCompare(b.session_date || ''));

    for (const s of gameSessions) {
      for (const a of s.attendance || []) {
        const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
        if (xp === 0) continue;

        const c = chars.find(ch =>
          (a.character_id && ch._id === a.character_id) ||
          ch.name === a.character_name ||
          ch.name === a.name ||
          displayName(ch) === (a.display_name || a.character_display)
        );
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
