// This site's downtime form kill switch. Mirrors TM Story's own
// public/js/downtime-form/retirement.js, in the opposite direction.
//
// 2026-09-01 (general audit correction): the 2026-08-29 Downtime + Ordeals
// full removal (PR #1227) deleted the Downtime nav tile/tab dispatch from
// app.js entirely, so app.js no longer imports this module at all — and
// public/js/tabs/downtime-tab.js, this file's one remaining client
// importer, is itself kept unrouted (reference only, per that removal's own
// documented scope boundary), not reachable from the live app either. The
// real, live importers today are all server-side: server/routes/downtime.js,
// questionnaire.js, history.js and ordeal-responses.js's own POST guards
// (see app.js's own boot-time comment, which already reflects this).
//
// WHY IT EXISTS. D6 (TM Story's specs/story-side-refactor.md, approved)
// rules there is only ever one live downtime form, and TM Story is sole
// owner. TM Story's own rebuilt form went live for filing on 2026-08-24.
// TM Game's form had no equivalent gate — an oversight caught 2026-08-25
// during a cross-repo redundancy review. Nothing stopped a player filing on
// BOTH forms at once, the same failure shape as the 2026-08-07 incident
// that got TM Story's own prior form retired in the first place. No TM Game
// chapter was in downtime phase when this was found, so this flag closes
// the gap before it can bite, not in response to it already having bitten.
//
// STs are exempt from the write gate: they still need to correct/annotate
// existing TM Game submissions filed before this cutover. Only new
// player-initiated writes are blocked.
//
export const FORM_RETIRED = true;

export const RETIRED_TILE_REASON = 'downtimes are filed on TM Story now';

// Copy pass 2026-08-27 (flight-check finding, Paige): named the destination
// instead of the vague "sibling site", led with the one instruction that
// matters, and moved the migration-cohort safety net to a smaller
// secondary line so it doesn't read as alarming to a player who has never
// used this form. ctaHref/ctaLabel render as a real link — see
// downtime-tab.js's own retired-notice render block.
export const RETIRED_NOTICE = {
  title: 'Downtimes are now filed on TM Story',
  body: [
    'This form no longer reaches the Storyteller.',
  ],
  ctaHref: 'https://terramortisstory.netlify.app/',
  ctaLabel: 'File your downtime on TM Story',
  footnote: 'If you filed a downtime on this page before 25 August, tell your Storyteller directly so nothing of yours is lost.',
};
