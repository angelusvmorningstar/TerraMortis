#!/usr/bin/env node
/**
 * Convert Lady Julia from old format (tm_characters.json) to v2 schema
 * and append to data/chars_v2.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'archive', 'tm_characters.json'), 'utf8'));
const chars = old.characters || old;
const julia = chars.find(c => c.name === 'Lady Julia');
if (!julia) { console.error('Lady Julia not found in tm_characters.json'); process.exit(1); }

// --- Conversion ---

// Status: flatten covenants
const primaryCov = julia.covenant; // "Invictus"
const covStandings = {};
for (const c of julia.status.covenants) {
  if (c.label !== primaryCov) {
    // Map label to standard key
    const key = c.label === 'Crone' ? 'Crone'
              : c.label === 'Lance' ? 'Lance'
              : c.label; // Carthian, Invictus, etc.
    covStandings[key] = c.dots;
  }
}

// Skills: normalize — old format can be int or {dots, bonus, spec}
// Julia has empty skills, but handle generically
const skills = {};
for (const [name, val] of Object.entries(julia.skills || {})) {
  if (typeof val === 'number') {
    if (val > 0) skills[name] = { dots: val, bonus: 0, specs: [], nine_again: false };
  } else if (val && typeof val === 'object') {
    skills[name] = {
      dots: val.dots || 0,
      bonus: val.bonus || 0,
      specs: val.spec || val.specs || [],
      nine_again: val.nine_again || false
    };
  }
}

// Disciplines: flatten to just dot values, merge blood_sorcery
const disciplines = {};
for (const [name, val] of Object.entries(julia.disciplines || {})) {
  disciplines[name] = val.dots || 0;
}
for (const [name, val] of Object.entries(julia.blood_sorcery || {})) {
  disciplines[name] = val.dots || 0;
}

// Merits: consolidate all categories
const merits = [];

// General merits
for (const m of julia.merits || []) {
  merits.push({
    category: 'general',
    name: m.name,
    rating: m.dots || 0,
    ...(m.qualifier ? { qualifier: m.qualifier } : {})
  });
}

// Influence
for (const m of julia.influence || []) {
  merits.push({
    category: 'influence',
    name: m.name,
    rating: m.dots || 0,
    ...(m.qualifier ? { area: m.qualifier } : {})
  });
}

// Domain
for (const [key, val] of Object.entries(julia.domain || {})) {
  if (val.dots > 0) {
    const nameMap = { safe_place: 'Safe Place', haven: 'Haven', herd: 'Herd' };
    merits.push({
      category: 'domain',
      name: nameMap[key] || key,
      rating: val.dots
    });
  }
}

// Standing
for (const [key, val] of Object.entries(julia.standing || {})) {
  if (key === 'mystery_cult' && val.dots > 0) {
    merits.push({
      category: 'standing',
      name: 'Mystery Cult Initiation',
      rating: val.dots,
      cult_name: val.name || '',
      benefits: Array(val.dots).fill(''),
      active: true,
      benefit_grants: []
    });
  } else if (key === 'prof_training' && val.dots > 0) {
    merits.push({
      category: 'standing',
      name: 'Professional Training',
      rating: val.dots,
      role: val.role || '',
      asset_skills: [],
      benefits: Array(val.dots).fill(''),
      active: true,
      benefit_grants: []
    });
  }
}

// Manoeuvres
for (const m of julia.manoeuvres || []) {
  merits.push({
    category: 'manoeuvre',
    name: m.name,
    rating: m.dots || 0,
    ...(m.rank_name ? { rank_name: m.rank_name } : {})
  });
}

// Powers: consolidate devotions, pacts, rites
const powers = [];

// Devotions
for (const d of julia.devotions || []) {
  const name = typeof d === 'string' ? d : d.name;
  powers.push({
    category: 'devotion',
    name
  });
}

// Pacts
for (const p of julia.pacts || []) {
  const name = typeof p === 'string' ? p : p.name;
  powers.push({
    category: 'pact',
    name
  });
}

// Rites
for (const r of julia.rites || []) {
  powers.push({
    category: 'rite',
    name: r.name,
    ...(r.qualifier ? { tradition: r.qualifier } : {})
  });
}

// Willpower: reformat
const willpower = {
  mask_1wp: julia.willpower.mask_1wp || null,
  mask_all: julia.willpower.mask_all_wp || null,
  dirge_1wp: julia.willpower.dirge_1wp || null,
  dirge_all: julia.willpower.dirge_all_wp || null
};

// Banes: drop type field
const banes = (julia.banes || []).map(b => ({
  name: b.name,
  effect: b.effect
}));

// Features: array → string or null
const features = (julia.features && julia.features.length)
  ? julia.features.join('\n')
  : null;

// Calculate xp_spent from discipline XP
let xpSpent = 0;
for (const val of Object.values(julia.disciplines || {})) {
  xpSpent += val.xp_spent || 0;
}
for (const d of julia.devotions || []) {
  if (d.xp_spent) xpSpent += d.xp_spent;
}

// Build v2 character
const v2Julia = {
  name: julia.name,
  player: julia.player,
  concept: julia.concept,
  pronouns: julia.pronouns || null,
  clan: julia.clan,
  bloodline: julia.bloodline || null,
  covenant: julia.covenant,
  mask: julia.mask || null,
  dirge: julia.dirge || null,
  court_title: julia.court_title || null,
  apparent_age: julia.apparent_age || null,
  features,
  willpower,
  aspirations: julia.aspirations || [],
  blood_potency: julia.blood_potency.dots,
  humanity: julia.humanity.dots,
  xp_total: julia.xp_total || 0,
  xp_spent: xpSpent,
  status: {
    city: julia.status.city.dots,
    clan: julia.status.clan.dots,
    covenant: (julia.status.covenants.find(c => c.label === primaryCov) || {}).dots || 0
  },
  covenant_standings: covStandings,
  attributes: julia.attributes,
  skills,
  disciplines,
  powers,
  merits,
  touchstones: julia.touchstones || [],
  banes
};

// --- Append to chars_v2.json ---
const v2Path = path.join(ROOT, 'data', 'chars_v2.json');
const v2Data = JSON.parse(fs.readFileSync(v2Path, 'utf8'));

// Check she's not already there
if (v2Data.find(c => c.name === 'Lady Julia')) {
  console.log('Lady Julia already exists in chars_v2.json — skipping');
} else {
  v2Data.push(v2Julia);
  fs.writeFileSync(v2Path, JSON.stringify(v2Data, null, 2), 'utf8');
  console.log('Lady Julia added to chars_v2.json (' + v2Data.length + ' characters total)');
}

// Print her for review
console.log('\n--- Lady Julia v2 ---');
console.log(JSON.stringify(v2Julia, null, 2));
