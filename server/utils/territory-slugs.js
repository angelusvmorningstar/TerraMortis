/**
 * Territory slug mapping (server-side mirror of public/js/admin/downtime-constants.js).
 *
 * **LEGACY READER ONLY** (per ADR-002 Q4 / story #3e).
 *
 * Used to translate slug-variant keys found in
 * `downtime_submissions.responses.feeding_territories` (the_second_city,
 * 'The Harbour', etc. — user-typed via the legacy form) to the canonical
 * `TERRITORY_DATA[i].slug` value.
 *
 * No write path may use this map. New submissions and any future form
 * rebuild must write canonical slugs (or `_id` strings) directly.
 *
 * The map can be retired entirely once all submissions in production are
 * known to use canonical keys.
 */

export const TERRITORY_SLUG_MAP = {
  // normaliseTerritoryGrid slugs
  the_academy:                'academy',
  the_harbour:                'harbour',
  the_city_harbour:           'harbour',     // legacy
  the_dockyards:              'dockyards',
  the_docklands:              'dockyards',   // legacy
  the_second_city:            'secondcity',
  the_north_shore:            'northshore',
  the_northern_shore:         'northshore',  // legacy
  the_barrens:                null,
  the_barrens__no_territory_: null,
  // Display-name variants (from _raw.feeding.territories)
  'The Academy':              'academy',
  'The City Harbour':         'harbour',
  'The Harbour':              'harbour',
  'The Dockyards':            'dockyards',
  'The Second City':          'secondcity',
  'The Northern Shore':       'northshore',
  'The North Shore':          'northshore',
  'The Shore':                'northshore',
  'The Barrens':              null,
  'The Barrens (No Territory)': null,
  // TERRITORY_DATA ids (pass-through)
  academy:    'academy',
  harbour:    'harbour',
  dockyards:  'dockyards',
  secondcity: 'secondcity',
  northshore: 'northshore',
};

/**
 * Resolve any territory string variant to a canonical TERRITORY_DATA id.
 * Known variants (the_second_city, The Harbour, etc.) go through the map.
 * Unknown strings pass through unchanged — the caller compares to
 * territory.id directly, so an arbitrary-but-matching slug still resolves.
 * Returns null only when the input is explicitly mapped to null (Barrens).
 */
export function normaliseTerritorySlug(val) {
  if (!val) return null;
  if (val in TERRITORY_SLUG_MAP) return TERRITORY_SLUG_MAP[val];
  return val;
}
