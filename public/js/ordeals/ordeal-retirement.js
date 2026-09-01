// This site's Ordeals kill switch. Mirrors public/js/downtime/form-retirement.js,
// same shape, same reasoning.
//
// 2026-09-01 (general audit correction): the 2026-08-29 Downtime + Ordeals
// full removal (PR #1227) deleted the Ordeals nav tile/tab dispatch from
// app.js entirely, so app.js no longer imports this module at all — and
// public/js/tabs/ordeals-view.js, this file's one remaining client
// importer, is itself kept unrouted (reference only, per that removal's own
// documented scope boundary), not reachable from the live app either. The
// real, live importers today are all server-side:
// server/routes/questionnaire.js, history.js, ordeal-responses.js's own
// POST guards (see app.js's own boot-time comment, which already reflects
// this).
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
// 2026-09-01 (general audit correction): the copy-pending TODO that used to
// sit here is stale — RETIRED_NOTICE's own render surface (ordeals-view.js)
// has been unrouted from the live app since 2026-08-29 (see the file header
// above), so this text is harmless dead reference copy, not a live pending
// task. Left as-is rather than polished further.
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
