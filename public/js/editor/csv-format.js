/* CSV export formatting — maps v2 character data to Affinity Publisher merge format */

import {
  getAttrVal, getAttrBonus, skDots, skBonus, skSpecs,
  meritsByCategory, influenceMerits, domainMerits, standingMerits, generalMerits,
  influenceTotal, domainRating,
  calcSize, calcSpeed, calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax,
  calcCityStatus, BP_TABLE
} from '../data/accessors.js';
import { xpLeft, xpEarned } from './xp.js';
import { getWillpower } from '../data/helpers.js';
import { applyDerivedMerits } from './mci.js';
import {
  ALL_SKILLS, CLAN_BANES, CORE_DISCS, RITUAL_DISCS
} from '../data/constants.js';

// ── Formatting helpers ──

const E = '\u00AC'; // ¬ — empty field marker
const F = '\u25CF'; // ● — filled dot
const O = '\u25CB'; // ○ — empty dot
const SQ_E = '\u25A1'; // □ — empty square
const SQ_F = '\u25A0'; // ■ — filled square

export function fmtDots(n) {
  return n > 0 ? F.repeat(n) : '';
}

export function fmtDotsBonus(base, bonus) {
  const b = Math.max(0, base || 0);
  const x = Math.max(0, bonus || 0);
  if (!b && !x) return '';
  return F.repeat(b) + (x ? O.repeat(x) : '');
}

export function fmtSquares(filled, total) {
  const f = Math.max(0, filled || 0);
  const t = Math.max(0, total || 0);
  return SQ_E.repeat(f) + SQ_F.repeat(t - f);
}

function fmtFraction(cur, max) {
  return `${cur} \u2044 ${max}`; // U+2044 fraction slash — prevents Excel date auto-format
}

function v(val) { return (val != null && val !== '') ? val : E; }

// ── Icon paths ──

const ICON_BASE = 'D:\\Terra Mortis\\Character Sheets\\Sheet Elements\\';

function clanIconPath(clan) {
  return clan ? `${ICON_BASE}${clan} icon.svg` : '';
}

function covIconPath(covenant) {
  const short = { 'Circle of the Crone': 'Crone', 'Carthian Movement': 'Carthian',
    'Invictus': 'Invictus', 'Lancea et Sanctum': 'Lance', 'Ordo Dracul': 'Ordo' };
  return covenant ? `${ICON_BASE}${short[covenant] || covenant} icon.svg` : '';
}

// ── Covenant short names (for status columns) ──

const COV_SHORT = {
  'Circle of the Crone': 'Crone', 'Carthian Movement': 'Carthian',
  'Invictus': 'Invictus', 'Lancea et Sanctum': 'Lance', 'Ordo Dracul': 'Ordo'
};

const COV_ORDER = ['Circle of the Crone', 'Carthian Movement', 'Invictus', 'Lancea et Sanctum'];

// ── BP table feed descriptions ──

const FEED_DESC = { animal: 'Animals', human: 'Humans', kindred: 'Kindred' };

// ── Column headers ──

export const CSV_HEADERS = [
  'Sheet', 'Date', 'XP Left', 'XP Total', 'Player Name', 'Character Name',
  'Concept', 'Pronouns', 'Clan', 'Clan Icon', 'Bloodline', 'Covenant',
  'Covenant Icon', 'Mask', 'Dirge', 'Court Title',
  'Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity', 'Stamina',
  'Presence', 'Manipulation', 'Composure',
  ...ALL_SKILLS,
  'Blood Potency', 'BP', 'BP Icon',
  'Health', 'Willpower', 'Willpower Squares', 'Vitae', 'Vitae Squares',
  'Vitae Per Turn', 'Can Feed From',
  ...ALL_SKILLS.map(s => `${s} Spec`),
  'City Status', 'Clan Status', 'Covenant Status',
  'Covenant 1', 'Covenant Status 1', 'Covenant 2', 'Covenant Status 2',
  'Covenant 3', 'Covenant Status 3', 'Covenant 4', 'Covenant Status 4',
  'Safe Place', 'Haven', 'Feeding Grounds', 'Herd',
  'Mystery Cult Initiation', 'Mystery Cult Name',
  'Professional Training', 'Prof Training Role',
  'Hum', 'Hum Icon',
  'Humanity 10', 'Humanity 9', 'Humanity 8', 'Humanity 7', 'Humanity 6',
  'Humanity 5', 'Humanity 4', 'Humanity 3', 'Humanity 2', 'Humanity 1',
  ...Array.from({ length: 30 }, (_, i) => `Merit ${i + 1}`),
  ...Array.from({ length: 30 }, (_, i) => `Merit Effect ${i + 1}`),
  'Influence', 'Influence Squares',
  ...Array.from({ length: 20 }, (_, i) => `Influence ${i + 1}`),
  ...Array.from({ length: 20 }, (_, i) => `Area ${i + 1}`),
  ...Array.from({ length: 20 }, (_, i) => `Influence Dots ${i + 1}`),
  'Animalism', 'Auspex', 'Celerity', 'Dominate', 'Majesty', 'Nightmare',
  'Obfuscate', 'Protean', 'Resilience', 'Vigour',
  'Cruac', 'Theban',
  ...Array.from({ length: 30 }, (_, i) => `Blood ${i + 1}`),
  ...Array.from({ length: 30 }, (_, i) => `Blood Stats ${i + 1}`),
  ...Array.from({ length: 30 }, (_, i) => `Blood Effect ${i + 1}`),
  'Clan Bane', 'Bloodline Bane', 'Other Bane 1', 'Other Bane 2', 'Other Bane 3',
  'Clan Bane Effect', 'Bloodline Bane Effect',
  'Other Bane Effect 1', 'Other Bane Effect 2', 'Other Bane Effect 3',
  'Size', 'Speed', 'Defence',
  'Mask 1WP', 'Mask AllWP', 'Dirge 1WP', 'Dirge AllWP',
  'Aspiration 1', 'Aspiration 2', 'Aspiration 3',
  'Apparent Age', 'Features'
];

// ── Character row mapper ──

export function charToRow(c) {
  // Ensure derived merits (PT/MCI grants) are applied
  applyDerivedMerits(c);

  const bp = c.blood_potency || 0;
  const bpData = BP_TABLE[bp] || BP_TABLE[1];
  const hum = c.humanity != null ? c.humanity : 7;
  const health = calcHealth(c);
  const wpMax = calcWillpowerMax(c);
  const vitaeMax = calcVitaeMax(c);
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');

  const row = [];

  // Identity
  row.push(`tblCharData${(c.name || '').replace(/\s+/g, '')}`); // Sheet
  row.push(dateStr);
  row.push(xpLeft(c));
  row.push(xpEarned(c));
  row.push(v(c.player));
  row.push(v(c.name));
  row.push(v(c.concept));
  row.push(v(c.pronouns));
  row.push(v(c.clan));
  row.push(clanIconPath(c.clan));
  row.push(v(c.bloodline));
  row.push(v(c.covenant));
  row.push(covIconPath(c.covenant));
  row.push(v(c.mask));
  row.push(v(c.dirge));
  row.push(v(c.court_title));

  // Attributes (dot strings)
  const attrs = ['Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity', 'Stamina',
    'Presence', 'Manipulation', 'Composure'];
  for (const a of attrs) {
    row.push(fmtDotsBonus(getAttrVal(c, a), getAttrBonus(c, a)));
  }

  // Skills (dot strings)
  for (const s of ALL_SKILLS) {
    const d = skDots(c, s);
    const b = skBonus(c, s);
    row.push(fmtDotsBonus(d, b));
  }

  // Blood Potency
  const bpDots = fmtDotsBonus(bp, 0);
  row.push(bpDots); // dot string
  row.push(bp);      // numeric
  row.push('');       // BP Icon (SVG path — left empty, app uses inline SVG)

  // Health, Willpower, Vitae
  row.push(fmtSquares(health, 15));          // Health squares (15-wide grid)
  row.push(fmtFraction(wpMax, wpMax));       // Willpower N / N
  row.push(fmtSquares(wpMax, 10));           // Willpower squares (10-wide)
  row.push(fmtFraction(vitaeMax, vitaeMax)); // Vitae N / N
  row.push(fmtSquares(vitaeMax, 20));        // Vitae squares (20-wide)
  row.push(bpData.per_turn);                 // Vitae Per Turn
  row.push(FEED_DESC[bpData.feed] || bpData.feed); // Can Feed From

  // Specialisations
  for (const s of ALL_SKILLS) {
    const specs = skSpecs(c, s);
    row.push(specs.length ? specs.join(', ') : '');
  }

  // Status — use calcCityStatus to include title bonus and regent ambience bonus
  row.push(calcCityStatus(c));
  row.push(c.status?.clan || 0);
  row.push(c.status?.covenant || 0);

  // Covenant standings (4 covenant slots)
  for (const cov of COV_ORDER) {
    const short = COV_SHORT[cov];
    row.push(short);
    const standing = c.covenant_standings?.[short] || c.covenant_standings?.[cov];
    if (c.covenant === cov) {
      row.push(fmtDots(c.status?.covenant || 0));
    } else if (standing) {
      row.push(fmtDots(standing));
    } else {
      row.push('-');
    }
  }

  // Domain merits
  row.push(domainRating(c, 'Safe Place') ? fmtDots(domainRating(c, 'Safe Place')) : '-');
  row.push(domainRating(c, 'Haven') ? fmtDots(domainRating(c, 'Haven')) : '-');
  row.push(domainRating(c, 'Feeding Grounds') ? fmtDots(domainRating(c, 'Feeding Grounds')) : '-');
  row.push(domainRating(c, 'Herd') ? fmtDots(domainRating(c, 'Herd')) : '-');

  // MCI
  const mci = standingMerits(c).find(m => m.name === 'Mystery Cult Initiation');
  row.push(mci ? fmtDots(mci.rating) : '-');
  row.push(mci ? v(mci.cult_name) : '-');

  // PT
  const pt = standingMerits(c).find(m => m.name === 'Professional Training');
  row.push(pt ? fmtDots(pt.rating) : '-');
  row.push(pt ? v(pt.role) : '-');

  // Humanity
  row.push(hum);
  row.push('~'); // Hum Icon placeholder

  // Humanity levels 10 down to 1
  const touchstones = c.touchstones || [];
  for (let lvl = 10; lvl >= 1; lvl--) {
    const ts = touchstones.find(t => t.humanity === lvl);
    if (lvl > hum) {
      row.push(O); // above current humanity = empty
    } else if (ts) {
      row.push(`${F} (${ts.name || ''}${ts.desc ? ' ' + ts.desc : ''})`);
    } else {
      row.push(F); // at or below humanity, no touchstone
    }
  }

  // Merits (30 slots) — general + manoeuvre merits, excluding influence/domain/standing
  const allMerits = [
    ...generalMerits(c),
    ...meritsByCategory(c, 'manoeuvre')
  ];
  for (let i = 0; i < 30; i++) {
    const m = allMerits[i];
    if (m) {
      const qual = m.spheres?.length ? ` (${m.spheres.join(', ')})` : m.qualifier ? ` (${m.qualifier})` : m.area ? ` (${m.area})` : '';
      row.push(`${m.name}${qual} ${fmtDots(m.rating || 0)}${m.sub_name ? ' | ' + m.sub_name : ''}`);
    } else {
      row.push(E);
    }
  }
  // Merit effects (30 slots)
  for (let i = 0; i < 30; i++) {
    const m = allMerits[i];
    row.push(m?.effect || E);
  }

  // Influence
  const infMerits = influenceMerits(c).filter(m => !m.prereq_failed);
  const infTotal = infMerits.reduce((s, m) => s + (m.rating || 0), 0);
  row.push(fmtFraction(infTotal, infTotal));
  row.push(fmtSquares(infTotal, infTotal));

  // Influence slots (20)
  for (let i = 0; i < 20; i++) {
    row.push(infMerits[i]?.name || E);
  }
  for (let i = 0; i < 20; i++) {
    row.push(infMerits[i]?.area || E);
  }
  for (let i = 0; i < 20; i++) {
    row.push(infMerits[i] ? fmtDots(infMerits[i].rating) : '');
  }

  // Disciplines (core 10 + ritual 2 + sorcery themes 5)
  const discs = c.disciplines || {};
  for (const d of CORE_DISCS) {
    const dots = discs[d]?.dots || 0;
    row.push(dots > 0 ? fmtDots(dots) : '-');
  }
  for (const d of RITUAL_DISCS) {
    const dots = discs[d]?.dots || 0;
    row.push(dots > 0 ? fmtDots(dots) : '-');
  }
  // Blood powers (30 slots — discipline powers, devotions, rites, pacts)
  const powers = c.powers || [];
  for (let i = 0; i < 30; i++) {
    const p = powers[i];
    if (p) {
      if (p.category === 'discipline') {
        row.push(`${p.discipline} ${fmtDots(p.rank || 0)}${p.name ? ' | ' + p.name : ''}`);
      } else if (p.category === 'rite') {
        row.push(`Blood Sorcery | ${p.tradition} ${fmtDots(p.level || 0)}`);
      } else if (p.category === 'devotion') {
        row.push(`Devotion  | ${p.name}`);
      } else {
        row.push(p.name || E);
      }
    } else {
      row.push(E);
    }
  }
  // Blood Stats (30 slots)
  for (let i = 0; i < 30; i++) {
    const p = powers[i];
    if (p && p.stats) {
      row.push(p.stats);
    } else if (p) {
      const parts = [];
      if (p.cost != null) parts.push(`Cost: ${p.cost}`);
      if (p.pool_size != null) parts.push(`Pool: ${p.pool_size}`);
      row.push(parts.length ? parts.join('  \u2022  ') : E);
    } else {
      row.push(E);
    }
  }
  // Blood Effects (30 slots)
  for (let i = 0; i < 30; i++) {
    const p = powers[i];
    row.push(p?.effect || E);
  }

  // Banes
  const clanBane = CLAN_BANES[c.clan];
  const banes = c.banes || [];
  const blBane = banes.find(b => b.type === 'bloodline');
  const otherBanes = banes.filter(b => b.type !== 'bloodline');

  row.push(clanBane?.name || E);
  row.push(blBane?.name || E);
  row.push(otherBanes[0]?.name || E);
  row.push(otherBanes[1]?.name || E);
  row.push(otherBanes[2]?.name || E);
  row.push(clanBane?.effect || E);
  row.push(blBane?.effect || E);
  row.push(otherBanes[0]?.effect || E);
  row.push(otherBanes[1]?.effect || E);
  row.push(otherBanes[2]?.effect || E);

  // Derived stats
  row.push(calcSize(c));
  row.push(calcSpeed(c));
  row.push(calcDefence(c));

  // Willpower triggers — derived from Mask/Dirge, not stored
  const wp = getWillpower(c);
  row.push(v(wp.mask_1wp));
  row.push(v(wp.mask_all));
  row.push(v(wp.dirge_1wp));
  row.push(v(wp.dirge_all));

  // Aspirations
  const asps = c.aspirations || [];
  row.push(v(asps[0]));
  row.push(v(asps[1]));
  row.push(v(asps[2]));

  // Misc
  row.push(v(c.apparent_age));
  row.push(v(c.features));

  return row;
}

// ── CSV escaping ──

function escapeCSV(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCSV(chars) {
  const headerLine = CSV_HEADERS.map(escapeCSV).join(',');
  const dataLines = chars.map(c => charToRow(c).map(escapeCSV).join(','));
  return headerLine + '\n' + dataLines.join('\n');
}
