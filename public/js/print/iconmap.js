/**
 * Clan & covenant name → asset file lookup.
 *
 * Returns an asset filename (relative to pdf_tool/assets/) or null if no icon
 * is available for that clan/covenant. Callers should render a text-only
 * fallback when null is returned.
 *
 * Only Nosferatu and Carthian Movement icons currently exist — these are the
 * only ones embedded in Mammon.pdf. Drop additional PNGs into pdf_tool/assets/
 * named by the pattern below and they will light up automatically.
 */

const CLAN_ICONS = {
  'Daeva':      'clan-daeva.png',
  'Gangrel':    'clan-gangrel.png',
  'Mekhet':     'clan-mekhet.png',
  'Nosferatu':  'clan-nosferatu.png',
  'Ventrue':    'clan-ventrue.png',
};

const COVENANT_ICONS = {
  'Carthian Movement':  'covenant-carthian.png',
  'Circle of the Crone': 'covenant-crone.png',
  'Invictus':           'covenant-invictus.png',
  'Lancea et Sanctum':  'covenant-lancea.png',
  'Ordo Dracul':        'covenant-dracul.png',
  // Aliases and shortforms seen in the character schema
  'Carthian':           'covenant-carthian.png',
  'Crone':              'covenant-crone.png',
  'Lancea':             'covenant-lancea.png',
};

function clanIcon(clanName, fileExistsFn) {
  if (!clanName) return null;
  const fname = CLAN_ICONS[clanName];
  if (!fname) return null;
  return fileExistsFn(fname) ? fname : null;
}

function covenantIcon(covName, fileExistsFn) {
  if (!covName) return null;
  const fname = COVENANT_ICONS[covName];
  if (!fname) return null;
  return fileExistsFn(fname) ? fname : null;
}

export { clanIcon, covenantIcon, CLAN_ICONS, COVENANT_ICONS };
