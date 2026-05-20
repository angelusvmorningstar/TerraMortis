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

/** Categorised static stat-path enumeration for the STM-5 admin panel
 *  dropdown. Per ADR-004 Rev 2 §D3, the static categories cover
 *  Attributes / Skills / Current State / Derived; Merits and Disciplines
 *  are character-derived and synthesised at panel-open via
 *  buildStatPathCategories below.
 *
 *  Each entry shape: { path: '<dotted path>', label: '<human>' }. */
export const STM_STATIC_CATEGORIES = [
  {
    category: 'Attributes',
    entries: ATTRS.flatMap(a => [
      { path: `attributes.${a}.dots`, label: `${a} (dots)` },
      { path: `attributes.${a}.bonus`, label: `${a} (bonus)` },
    ]),
  },
  {
    category: 'Skills',
    entries: SKILLS.flatMap(s => [
      { path: `skills.${s}.dots`, label: `${s} (dots)` },
      { path: `skills.${s}.bonus`, label: `${s} (bonus)` },
    ]),
  },
  {
    category: 'Current State',
    entries: [
      { path: 'current.damage_bashing',    label: 'Damage (bashing)' },
      { path: 'current.damage_lethal',     label: 'Damage (lethal)' },
      { path: 'current.damage_aggravated', label: 'Damage (aggravated)' },
      { path: 'current.willpower',         label: 'Willpower (current)' },
      { path: 'current.vitae',             label: 'Vitae (current)' },
      { path: 'blood_potency',             label: 'Blood Potency' },
      { path: 'humanity',                  label: 'Humanity' },
    ],
  },
  {
    category: 'Derived',
    entries: [
      { path: 'derived.defence',       label: 'Defence' },
      { path: 'derived.health_max',    label: 'Health (max)' },
      { path: 'derived.willpower_max', label: 'Willpower (max)' },
      { path: 'derived.size',          label: 'Size' },
      { path: 'derived.speed',         label: 'Speed' },
      { path: 'derived.initiative',    label: 'Initiative' },
    ],
  },
];

/** Build the full categorised dropdown for a given character. Static
 *  categories come from STM_STATIC_CATEGORIES; Merits + Disciplines are
 *  derived from the character's own arrays (per ADR-004 Rev 2 §D3 last
 *  paragraph: character-derived, recomputed each time the panel opens
 *  so stale snapshots can't accumulate).
 *
 *  Pure function — no side effects, no DOM. Easily unit-testable.
 *
 *  Skips any merit/discipline whose name is empty (defensive — sparse
 *  character documents in old data shouldn't crash the dropdown). */
export function buildStatPathCategories(character) {
  const cats = STM_STATIC_CATEGORIES.map(c => ({ category: c.category, entries: c.entries.slice() }));

  const merits = Array.isArray(character?.merits) ? character.merits : [];
  const meritEntries = merits
    .map((m, i) => m && m.name ? { path: `merits.${i}.dots`, label: `${m.name} (dots)` } : null)
    .filter(Boolean);
  if (meritEntries.length) cats.push({ category: 'Merits', entries: meritEntries });

  // c.disciplines is an OBJECT keyed by discipline name in the v2 schema
  // (per public/js/data/accessors.js#discDots). Defensive: handle either
  // array (legacy / hypothetical) or object form. STM-5 (issue #386)
  // updated the server regex to accept name-based discipline paths so the
  // dropdown emits paths that round-trip through the whitelist.
  let discEntries = [];
  const rawDiscs = character?.disciplines;
  if (Array.isArray(rawDiscs)) {
    discEntries = rawDiscs
      .map((d, i) => d && d.name ? { path: `disciplines.${i}.dots`, label: `${d.name} (dots)` } : null)
      .filter(Boolean);
  } else if (rawDiscs && typeof rawDiscs === 'object') {
    discEntries = Object.keys(rawDiscs).map(name => ({
      path: `disciplines.${name}.dots`,
      label: `${name} (dots)`,
    }));
  }
  if (discEntries.length) cats.push({ category: 'Disciplines', entries: discEntries });

  return cats;
}
