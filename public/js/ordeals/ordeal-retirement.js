// This site's Ordeals kill switch. Mirrors public/js/downtime/form-retirement.js,
// same shape, same reasoning. Imported by three layers that must agree:
//
//   - public/js/app.js              the Ordeals nav tile (bottom nav, the mobile
//                                    "More" grid, and the desktop sidebar — all
//                                    three render off the same MORE_APPS entry)
//   - public/js/tabs/ordeals-view.js the tab body itself, a notice instead of
//                                    the ordeal list/forms
//   - server/routes/questionnaire.js, history.js, ordeal-responses.js
//                                    the write routes, refusing new
//                                    player-initiated writes
//
// WHY IT EXISTS. Ordeals are moving to TM Story, same as downtime (2026-08-25,
// Angelus). Leaving TM Game's own Ordeals tile live and clickable for players
// would let them start (or think they can start) an Ordeal here that nobody on
// the ST side will ever see — the same confusion the downtime gate exists to
// prevent, not a reaction to any submission actually going missing yet.
//
// STs are exempt from both the tile dimming and the write gate: they still
// need to mark/correct Ordeal submissions filed before this cutover.
//
// TODO(copy): RETIRED_NOTICE below is placeholder text pending Angelus's own
// pass on player-facing wording.
export const ORDEALS_RETIRED = true;

export const RETIRED_TILE_REASON = 'ordeals are filed on the sibling site';

export const RETIRED_NOTICE = {
  title: 'Ordeals have moved',
  body: [
    'Ordeals are no longer completed here. An ordeal submitted on this page does not reach the Storyteller.',
    'Complete your ordeals on the sibling site instead.',
    'If you have already submitted an ordeal on this page, tell the Storyteller now so that nothing of yours is lost.',
  ],
};
