/**
 * Territory slug mapping (server-side mirror of public/js/admin/downtime-constants.js).
 *
 * Downtime submissions store feeding_territories as a JSON object whose keys
 * use a mix of slug variants (the_second_city, the_harbour, etc.) rather than
 * the canonical TERRITORY_DATA ids (secondcity, harbour, ...).
 *
 * Used by the feeding-rights lock check to resolve which territory slug
 * corresponds to a given territory document id.
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
