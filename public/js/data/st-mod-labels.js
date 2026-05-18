/* Human-readable labels for STM stat_path strings.
 *
 * Used by the STM-6 audit view (and STM-4/5 popover & dropdown later).
 * Static labels for the deterministic paths in server/routes/st_mods.js
 * STATIC_WHITELIST. Merit/discipline indexed paths fall through to a
 * raw-path display since looking up the actual merit/discipline name
 * requires loading the character — overkill for audit / popover usage.
 */

const ATTRS = [
  'Intelligence', 'Wits', 'Resolve',
  'Strength', 'Dexterity', 'Stamina',
  'Presence', 'Manipulation', 'Composure',
];
const SKILLS = [
  'Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science',
  'Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry',
  'Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge',
];

const STATIC_LABELS = (() => {
  const m = new Map();
  for (const a of ATTRS) {
    m.set(`attributes.${a}.dots`, `${a} (dots)`);
    m.set(`attributes.${a}.bonus`, `${a} (bonus)`);
  }
  for (const s of SKILLS) {
    m.set(`skills.${s}.dots`, `${s} (dots)`);
    m.set(`skills.${s}.bonus`, `${s} (bonus)`);
  }
  m.set('current.damage_bashing', 'Damage (bashing)');
  m.set('current.damage_lethal', 'Damage (lethal)');
  m.set('current.damage_aggravated', 'Damage (aggravated)');
  m.set('current.willpower', 'Willpower (current)');
  m.set('current.vitae', 'Vitae (current)');
  m.set('blood_potency', 'Blood Potency');
  m.set('humanity', 'Humanity');
  m.set('derived.defence', 'Defence');
  m.set('derived.health_max', 'Health (max)');
  m.set('derived.willpower_max', 'Willpower (max)');
  m.set('derived.size', 'Size');
  m.set('derived.speed', 'Speed');
  m.set('derived.initiative', 'Initiative');
  return m;
})();

const MERIT_RE = /^merits\.([0-9]+)\.dots$/;
const DISC_RE = /^disciplines\.([0-9]+)\.dots$/;

/** Return a human-readable label for a stat_path. Falls back to the raw
 *  path for merits[N]/disciplines[N] (with a "Merit #N" / "Discipline #N"
 *  hint) and for any unknown shape — the latter shouldn't happen because
 *  the server whitelists at write time, but the audit view shows historical
 *  rows so any future schema drift surfaces gracefully. */
export function labelForPath(path) {
  if (typeof path !== 'string') return '';
  if (STATIC_LABELS.has(path)) return STATIC_LABELS.get(path);
  const mMerit = MERIT_RE.exec(path);
  if (mMerit) return `Merit #${mMerit[1]} (dots)`;
  const mDisc = DISC_RE.exec(path);
  if (mDisc) return `Discipline #${mDisc[1]} (dots)`;
  return path;
}
