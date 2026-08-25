// This site's downtime form kill switch. Mirrors TM Story's own
// public/js/downtime-form/retirement.js, in the opposite direction. Imported
// by three layers that must agree:
//
//   - public/js/app.js               the Downtime nav tile + the "Downtime
//                                     due" lifecycle card (both entry points)
//   - public/js/tabs/downtime-tab.js the tab body itself, a notice instead
//                                     of the form
//   - server/routes/downtime.js      the write routes, refusing new
//                                     player-initiated writes
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
// TODO(copy): RETIRED_NOTICE below is placeholder text pending Angelus's
// own pass on player-facing wording — see specs/deferred-work.md.
export const FORM_RETIRED = true;

export const RETIRED_TILE_REASON = 'downtimes are filed on the sibling site';

export const RETIRED_NOTICE = {
  title: 'Downtime filing has moved',
  body: [
    'This form is out of service. A downtime filed here does not reach the Storyteller.',
    'File your downtime on the sibling site instead.',
    'If you have already filed a downtime on this page, tell the Storyteller now so that nothing of yours is lost.',
  ],
};
