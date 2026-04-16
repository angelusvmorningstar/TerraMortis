/**
 * downtime-constants.js — shared constants for the DT processing system.
 *
 * Imported by both downtime-views.js and downtime-story.js.
 * Neither file imports from the other (NFR-DS-01), so shared data lives here.
 *
 * Exports:
 *   ACTION_TYPE_LABELS    — display labels for action type keys (feed = 'Feed'; views overrides to 'Rote Feed')
 *   MERIT_MATRIX          — pool formula, action mode, and effect text per merit category × action type
 *   INVESTIGATION_MATRIX  — innate modifier and no-lead penalty per information type
 *   TERRITORY_SLUG_MAP    — normalises any territory string variant to a TERRITORY_DATA id
 */

// ── Action type labels ────────────────────────────────────────────────────────

export const ACTION_TYPE_LABELS = {
  ambience_increase: 'Ambience Increase',
  ambience_decrease: 'Ambience Decrease',
  feed:              'Feed',
  attack:            'Attack',
  hide_protect:      'Hide / Protect',
  investigate:       'Investigate',
  patrol_scout:      'Patrol / Scout',
  support:           'Support',
  misc:              'Miscellaneous',
  maintenance:       'Maintenance',
  xp_spend:          'XP Spend',
  block:             'Block',
  rumour:            'Rumour',
  grow:              'Grow',
  acquisition:       'Acquisition',
};

// ── Merit action matrix (from DT Merits.xlsx) ────────────────────────────────
// poolFormula: 'dots2plus2' | 'none' | 'contacts'
// mode: 'instant' | 'contested' | 'auto' | 'blocked'
// effect: primary effect text (rolled option)
// effectAuto: fixed/unrolled effect (used when poolFormula is 'none' or ST chooses auto)

export const MERIT_MATRIX = {
  allies: {
    ambience_increase: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3–4: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3–4: −1 ambience; Lvl 5: −2 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk − Hide/Protect) halved (round up) removed from target merit level',                                           effectAuto: '(Level − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit',                                 effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool',                                              effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1–5+)',  effectAuto: '(Level − Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate − Hide/Protect = net successes)',                                            effectAuto: 'See Investigation Matrix (Level − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1–5+)',    effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'auto',      effect: 'Auto blocks merit of same level or lower' },
  },
  status: {
    ambience_increase: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3–4: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3–4: −1 ambience; Lvl 5: −2 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk − Hide/Protect) halved (round up) removed from target merit level',                                           effectAuto: '(Level − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit',                                 effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool',                                              effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1–5+)',  effectAuto: '(Level − Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate − Hide/Protect = net successes)',                                            effectAuto: 'See Investigation Matrix (Level − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1–5+)',    effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'auto',      effect: 'Auto blocks merit of lower level' },
  },
  retainer: {
    ambience_increase: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3–4: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3–4: −1 ambience; Lvl 5: −2 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk − Hide/Protect) halved (round up) removed from target merit level',                                           effectAuto: '(Level − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit',                                 effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool',                                              effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1–5+)',  effectAuto: '(Level − Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate − Hide/Protect = net successes)',                                            effectAuto: 'See Investigation Matrix (Level − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1–5+)',    effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'blocked',   effect: 'Cannot perform Block' },
  },
  staff: {
    ambience_increase: { poolFormula: 'none', mode: 'auto',      effect: '+1 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto',      effect: '−1 ambience' },
    attack:            { poolFormula: 'none', mode: 'contested', effect: '(1 − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'none', mode: 'instant',   effect: '−1 success from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'none', mode: 'instant',   effect: '+1 success to supported action' },
    patrol_scout:      { poolFormula: 'none', mode: 'contested', effect: '1 action revealed (1 − Hide/Protect = net successes; detail scales 1–5+)' },
    investigate:       { poolFormula: 'none', mode: 'contested', effect: 'See Investigation Matrix (1 − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'none', mode: 'instant',   effect: '1 similar-merit action revealed (1 success)' },
    block:             { poolFormula: 'none', mode: 'blocked',   effect: 'Cannot perform Block' },
  },
  contacts: {
    investigate:  { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
    patrol_scout: { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
    rumour:       { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
  },
};

// ── Investigation Matrix ──────────────────────────────────────────────────────
// innate: baseline modifier for this information tier
// noLead: additional penalty when investigating without a lead

export const INVESTIGATION_MATRIX = [
  { type: 'Public',       innate: +3, noLead: -1,
    results: ['Gain all publicly available information', 'Also gain lead on Internal information', 'Also gain lead on Confidential information', 'Also gain lead on Restricted information', 'Also one Rumour'] },
  { type: 'Internal',     innate: -1, noLead: -2,
    results: ['Gain lead on Internal information', 'Learn whether the information you seek exists', 'Gain vague Internal information', 'Gain basic Internal information', 'Gain detailed Internal information'] },
  { type: 'Confidential', innate: -2, noLead: -4,
    results: ['Gain lead on Confidential information', 'Learn whether the information you seek exists', 'Gain vague Confidential information', 'Gain basic Confidential information', 'Gain detailed Confidential information'] },
  { type: 'Restricted',   innate: -3, noLead: -5,
    results: ['Gain lead on Restricted information', 'Learn whether the information you seek exists', 'Gain vague Restricted information', 'Gain basic Restricted information', 'Gain detailed Restricted information'] },
];

// ── Ambience step ladder ──────────────────────────────────────────────────────
// Index 0 = worst, index 8 = best. Used for net-change calculations.

export const AMBIENCE_STEPS = [
  'Hostile', 'Barrens', 'Neglected', 'Untended',
  'Settled', 'Tended', 'Curated', 'Verdant', 'The Rack',
];

// ── Territory slug map ────────────────────────────────────────────────────────
// Normalises any territory string variant to a TERRITORY_DATA id (or null for Barrens).
// Covers: normaliseTerritoryGrid slugs, legacy slugs, display-name variants, pass-through ids.

export const TERRITORY_SLUG_MAP = {
  // normaliseTerritoryGrid slugs
  the_academy:                  'academy',
  the_harbour:                  'harbour',
  the_city_harbour:             'harbour',     // legacy
  the_dockyards:                'dockyards',
  the_docklands:                'dockyards',   // legacy
  the_second_city:              'secondcity',
  the_north_shore:              'northshore',
  the_northern_shore:           'northshore',  // legacy
  the_barrens:                  null,
  the_barrens__no_territory_:   null,          // no territory
  // Display-name variants (from _raw.feeding.territories)
  'The Academy':                'academy',
  'The City Harbour':           'harbour',
  'The Harbour':                'harbour',     // short form used in _raw.influence
  'The Dockyards':              'dockyards',
  'The Second City':            'secondcity',
  'The Northern Shore':         'northshore',  // legacy
  'The North Shore':            'northshore',
  'The Shore':                  'northshore',  // short form used in _raw.influence
  'The Barrens':                null,
  'The Barrens (No Territory)': null,
  // TERRITORY_DATA ids (pass-through)
  academy:    'academy',
  harbour:    'harbour',
  dockyards:  'dockyards',
  secondcity: 'secondcity',
  northshore: 'northshore',
};
