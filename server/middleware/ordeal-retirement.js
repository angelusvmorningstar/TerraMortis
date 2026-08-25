// 2026-08-25: TM Game's server-side half of the Ordeals retirement (see
// public/js/ordeals/ordeal-retirement.js for why). STs pass through
// unaffected — only new player-initiated writes are blocked.
import { ORDEALS_RETIRED } from '../../public/js/ordeals/ordeal-retirement.js';

export function requireOrdealNotRetiredForPlayers(req, res, next) {
  if (ORDEALS_RETIRED && req.user.role === 'player') {
    return res.status(403).json({
      error: 'ORDEAL_RETIRED',
      message: 'This form no longer accepts new ordeal submissions. Complete your ordeals on the sibling site instead.',
    });
  }
  next();
}
