/**
 * Compute game XP per character from game_sessions attendance data.
 * Caches result as c._gameXP for use by xpGame().
 *
 * Shared between admin and player portals so both see live attendance XP.
 */

import { apiGet } from './api.js';
import { displayName } from './helpers.js';

export async function loadGameXP(chars) {
  try {
    const gameSessions = await apiGet('/api/game_sessions');
    for (const c of chars) c._gameXP = 0;

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
        if (c) c._gameXP += xp;
      }
    }
  } catch (err) {
    console.warn('Could not load game sessions for XP:', err.message);
  }
}
