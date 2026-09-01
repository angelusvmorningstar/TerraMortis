// 2026-08-25: TM Game's server-side half of the Ordeals retirement (see
// public/js/ordeals/ordeal-retirement.js for why). STs pass through
// unaffected — only new player-initiated writes are blocked.
import { ORDEALS_RETIRED } from '../../public/js/ordeals/ordeal-retirement.js';
import { isStRole } from './auth.js';

export function requireOrdealNotRetiredForPlayers(req, res, next) {
  // 2026-09-01 general audit fix (same root cause as the ownership-check
  // fixes in history.js/ordeal-responses.js/questionnaire.js, found while
  // implementing them, not in the original audit's own finding): was
  // role === 'player', which let a coordinator-role account bypass this
  // retirement gate entirely and reach the POST/PUT handlers below.
  if (ORDEALS_RETIRED && !isStRole(req.user)) {
    return res.status(403).json({
      error: 'ORDEAL_RETIRED',
      message: 'This form no longer accepts new ordeal submissions. Complete your ordeals on the sibling site instead.',
    });
  }
  next();
}
