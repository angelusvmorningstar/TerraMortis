/**
 * Character data validation script
 * Usage: node scripts/validate-chars.js [path/to/chars.json]
 *
 * Reports schema violations, orphaned data, and accounting mismatches.
 * Exit code 0 = clean, 1 = issues found.
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

const filePath = resolve(process.argv[2] || 'data/chars_v2.json');
const chars = JSON.parse(readFileSync(filePath, 'utf8'));

// ── Constants ──────────────────────────────────────────────────────────────

const ATTR_NAMES = ['Intelligence','Wits','Resolve','Strength','Dexterity','Stamina','Presence','Manipulation','Composure'];
const COVENANT_NAMES = ['Carthian','Invictus','Lance','Crone','Ordo'];
const COVENANT_STANDING_KEYS = ['Carthian','Invictus','Lance','Crone','Ordo'];
const VALID_MERIT_CATEGORIES = new Set(['general','influence','domain','standing','manoeuvre']);
const VALID_POWER_CATEGORIES = new Set(['discipline','devotion','pact','rite']);
const DERIVED_FIELDS = ['size','speed','defence','health','willpower_max','vitae_max','xp_left'];
const STANDING_MERIT_NAMES = ['Mystery Cult Initiation','Professional Training'];
const XP_COST = { attr: 4, skill: 2, clan_disc: 3, other_disc: 4, merit: 1 };

// ── Issue collector ────────────────────────────────────────────────────────

const issues = [];

function warn(charName, category, message) {
  issues.push({ charName, category, message, severity: 'warn' });
}
function error(charName, category, message) {
  issues.push({ charName, category, message, severity: 'error' });
}

// ── Per-character checks ───────────────────────────────────────────────────

for (const c of chars) {
  const n = c.name || '(unnamed)';

  // ── 1. Derived fields stored (should not exist) ────────────────────────
  for (const field of DERIVED_FIELDS) {
    if (field in c) {
      error(n, 'derived-stored', `Derived field "${field}" is stored — should be computed at render time`);
    }
  }

  // ── 2. Willpower — derived at render time, should not be stored ──────────
  if ('willpower' in c) {
    warn(n, 'willpower-stored', `willpower object is stored — it is now derived at render time from Mask/Dirge and should not be persisted`);
  }
  // Incomplete identity: mask/dirge null means WP conditions cannot be derived
  if (!c.mask) warn(n, 'identity-incomplete', `mask is null — WP conditions cannot be derived`);
  if (!c.dirge) warn(n, 'identity-incomplete', `dirge is null — WP conditions cannot be derived`);

  // ── 3. Attributes ──────────────────────────────────────────────────────
  if (c.attributes) {
    for (const [attr, val] of Object.entries(c.attributes)) {
      if (typeof val === 'number') {
        error(n, 'attr-shape', `Attribute "${attr}" is a raw number (${val}) — must be {dots, bonus}`);
      } else if (typeof val === 'object') {
        if (!('dots' in val)) error(n, 'attr-shape', `Attribute "${attr}" missing "dots" field`);
        if (!('bonus' in val)) warn(n, 'attr-shape', `Attribute "${attr}" missing "bonus" field`);
        if (typeof val.dots === 'number' && val.dots < 1) warn(n, 'attr-value', `Attribute "${attr}" has dots=${val.dots} (vampires minimum 1)`);
      } else {
        error(n, 'attr-shape', `Attribute "${attr}" has unexpected type: ${typeof val}`);
      }
    }
    const missingAttrs = ATTR_NAMES.filter(a => !(a in c.attributes));
    if (missingAttrs.length) warn(n, 'attr-missing', `Missing attributes: ${missingAttrs.join(', ')}`);
  } else {
    error(n, 'attr-missing', `No attributes object`);
  }

  // ── 4. Skills ──────────────────────────────────────────────────────────
  if (c.skills) {
    for (const [skill, val] of Object.entries(c.skills)) {
      if (typeof val === 'number') {
        error(n, 'skill-shape', `Skill "${skill}" is a raw number (${val}) — must be {dots, bonus, specs, nine_again}`);
      } else if (typeof val === 'object') {
        if (!('dots' in val)) error(n, 'skill-shape', `Skill "${skill}" missing "dots" field`);
        if (!('bonus' in val)) warn(n, 'skill-shape', `Skill "${skill}" missing "bonus" field`);
        if (!('specs' in val)) warn(n, 'skill-shape', `Skill "${skill}" missing "specs" field`);
        else if (!Array.isArray(val.specs)) error(n, 'skill-shape', `Skill "${skill}" specs is not an array`);
        if (!('nine_again' in val)) warn(n, 'skill-shape', `Skill "${skill}" missing "nine_again" field`);
        // Old "spec" (string) instead of "specs" (array)
        if ('spec' in val) warn(n, 'skill-shape', `Skill "${skill}" has old "spec" string field — should be "specs" array`);
      } else {
        error(n, 'skill-shape', `Skill "${skill}" has unexpected type: ${typeof val}`);
      }
    }
  }

  // ── 5. Merits ──────────────────────────────────────────────────────────
  const merits = c.merits || [];
  const meritCreation = c.merit_creation || [];

  // Length alignment
  if (merits.length !== meritCreation.length) {
    error(n, 'merit-creation-length', `merits.length (${merits.length}) !== merit_creation.length (${meritCreation.length}) — arrays are misaligned`);
  }

  for (let i = 0; i < merits.length; i++) {
    const m = merits[i];
    if (!m) { error(n, 'merit-null', `merits[${i}] is null/undefined`); continue; }
    if (!m.name) warn(n, 'merit-name', `merits[${i}] has no name`);
    if (!m.category) {
      error(n, 'merit-category', `Merit "${m.name}" (idx ${i}) has no category`);
    } else if (!VALID_MERIT_CATEGORIES.has(m.category)) {
      error(n, 'merit-category', `Merit "${m.name}" (idx ${i}) has unknown category "${m.category}"`);
    }
    if (m.rating === undefined || m.rating === null) {
      warn(n, 'merit-rating', `Merit "${m.name}" (idx ${i}) has no rating`);
    }

    // MCI-specific format check (PT uses a different system — dot_choice fields don't apply)
    if (m.name === 'Mystery Cult Initiation') {
      const hasNewFormat = 'dot1_choice' in m || 'dot3_choice' in m || 'dot5_choice' in m;
      const hasOldFormat = 'benefit_grants' in m && Array.isArray(m.benefit_grants) &&
        m.benefit_grants.some(g => g && typeof g === 'object' && 'name' in g);
      if (hasOldFormat && !hasNewFormat) {
        error(n, 'mci-old-format', `"${m.name}" (idx ${i}) uses old benefit_grants array format — missing dot1_choice/dot3_choice/dot5_choice. MCI pool accounting will be incorrect.`);
      }
      if (m.name === 'Mystery Cult Initiation') {
        // Pool accounting: check free_mci allocation
        const poolDots = mciPoolTotal(m);
        const allocatedMci = meritCreation.reduce((s, mc) => s + (mc ? (mc.free_mci || 0) : 0), 0);
        // Only flag if there are grants that look unaccounted
        if (hasOldFormat && !hasNewFormat && m.benefit_grants.filter(Boolean).length > 0) {
          warn(n, 'mci-pool-orphan', `MCI has ${m.benefit_grants.filter(Boolean).length} benefit_grants entries but no free_mci allocations tracked — granted merits may be costing CP/XP incorrectly`);
        }
      }
    }

    // Manoeuvre merits should have rank_name
    if (m.category === 'manoeuvre' && !m.rank_name) {
      warn(n, 'manoeuvre-rank', `Manoeuvre merit "${m.name}" (idx ${i}) missing rank_name`);
    }

    // Influence merits should have area (Allies/Contacts) or just name (Resources/Retainer/etc.)
    if (m.category === 'influence' && (m.name === 'Allies' || m.name === 'Contacts') && !m.area && !m.qualifier) {
      warn(n, 'influence-area', `Influence merit "${m.name}" (idx ${i}) has no area/qualifier`);
    }
  }

  // ── 6. merit_creation null slots ──────────────────────────────────────
  meritCreation.forEach((mc, i) => {
    if (mc === null || mc === undefined) {
      warn(n, 'merit-creation-null', `merit_creation[${i}] is null — corresponds to "${(merits[i] || {}).name || 'unknown'}"`);
    }
  });

  // ── 7. Powers ─────────────────────────────────────────────────────────
  (c.powers || []).forEach((p, i) => {
    if (!p.category) {
      warn(n, 'power-category', `powers[${i}] "${p.name || '?'}" has no category`);
    } else if (!VALID_POWER_CATEGORIES.has(p.category)) {
      warn(n, 'power-category', `powers[${i}] "${p.name || '?'}" has unknown category "${p.category}"`);
    }
    if (p.category === 'discipline' && !p.discipline) {
      warn(n, 'power-discipline', `Discipline power "${p.name || '?'}" (idx ${i}) has no discipline field`);
    }
  });

  // ── 8. Covenant standings ─────────────────────────────────────────────
  if (c.covenant_standings && c.covenant) {
    // Character's own covenant should not appear in standings
    const ownCov = c.covenant;
    const shortKey = ownCov.replace('Circle of the Crone', 'Crone')
                           .replace('Ordo Dracul', 'Ordo')
                           .replace('Lancea et Sanctum', 'Lance')
                           .replace('Carthian Movement', 'Carthian');
    if (shortKey in c.covenant_standings) {
      warn(n, 'covenant-standings', `covenant_standings includes own covenant key "${shortKey}" — own covenant should be excluded`);
    }
    // Old array format check
    if (Array.isArray(c.covenant_standings)) {
      error(n, 'covenant-standings', `covenant_standings is an array — should be an object keyed by covenant name`);
    }
  }

  // ── 9. Fighting styles ────────────────────────────────────────────────
  (c.fighting_styles || []).forEach((fs, i) => {
    if (!fs.name) warn(n, 'fighting-style', `fighting_styles[${i}] has no name`);
    if (!fs.type) warn(n, 'fighting-style', `fighting_styles[${i}] "${fs.name || '?'}" has no type field`);
    if ('up' in fs) warn(n, 'fighting-style-legacy', `fighting_styles[${i}] "${fs.name || '?'}" has legacy "up" field — should be migrated to "cp"`);
  });

  // ── 10. XP sanity ────────────────────────────────────────────────────
  // Attribute creation XP divisible by 4
  if (c.attr_creation) {
    for (const [attr, ac] of Object.entries(c.attr_creation)) {
      const xp = ac.xp || 0;
      if (xp % XP_COST.attr !== 0) {
        warn(n, 'xp-attr', `${attr} attr_creation.xp=${xp} is not divisible by ${XP_COST.attr}`);
      }
    }
  }
  // Skill creation XP divisible by 2
  if (c.skill_creation) {
    for (const [skill, sc] of Object.entries(c.skill_creation)) {
      const xp = sc.xp || 0;
      if (xp % XP_COST.skill !== 0) {
        warn(n, 'xp-skill', `${skill} skill_creation.xp=${xp} is not divisible by ${XP_COST.skill}`);
      }
    }
  }

  // ── 11. Status values ─────────────────────────────────────────────────
  if (c.status) {
    for (const [k, v] of Object.entries(c.status)) {
      if (typeof v !== 'number') warn(n, 'status', `status.${k} is not a number: ${v}`);
      if (v < 0 || v > 5) warn(n, 'status', `status.${k}=${v} is out of range (0–5)`);
    }
  }

  // ── 12. Humanity baseline ─────────────────────────────────────────────
  if (c.humanity_base === undefined) {
    warn(n, 'humanity-base', `humanity_base field missing — needed for XP drop calculation`);
  } else if (c.humanity > c.humanity_base) {
    warn(n, 'humanity-value', `humanity (${c.humanity}) > humanity_base (${c.humanity_base}) — humanity cannot exceed starting value`);
  }

  // ── 13. Ephemeral fields stored ───────────────────────────────────────
  const ephemeralFields = ['_gameXP','_grant_pools','_mci_free_specs','_mci_dot3_skills','_pt_nine_again_skills','_pt_dot4_bonus_skills','_ohm_nine_again_skills'];
  for (const f of ephemeralFields) {
    if (f in c) warn(n, 'ephemeral-stored', `Ephemeral field "${f}" is stored in the document — should only exist at runtime`);
  }
}

// ── MCI pool helper (mirrors mci.js logic) ────────────────────────────────

function mciPoolTotal(mci) {
  const r = mci.rating || 0;
  let pool = 0;
  if (r >= 1) pool += mci.dot1_choice === 'speciality' ? 0 : 1;
  if (r >= 2) pool += 1;
  if (r >= 3) pool += mci.dot3_choice === 'skill' ? 0 : 2;
  if (r >= 4) pool += 3;
  if (r >= 5) pool += mci.dot5_choice === 'advantage' ? 0 : 3;
  return pool;
}

// ── Report ─────────────────────────────────────────────────────────────────

const errors = issues.filter(i => i.severity === 'error');
const warnings = issues.filter(i => i.severity === 'warn');

// Group by character
const byChar = {};
for (const issue of issues) {
  if (!byChar[issue.charName]) byChar[issue.charName] = [];
  byChar[issue.charName].push(issue);
}

// Group by category (for summary)
const byCategory = {};
for (const issue of issues) {
  if (!byCategory[issue.category]) byCategory[issue.category] = 0;
  byCategory[issue.category]++;
}

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('  Character Data Validation Report');
console.log(`  File: ${filePath}`);
console.log(`  Characters scanned: ${chars.length}`);
console.log(`  Issues found: ${errors.length} errors, ${warnings.length} warnings`);
console.log('═══════════════════════════════════════════════════════');

for (const [charName, charIssues] of Object.entries(byChar).sort()) {
  const errs = charIssues.filter(i => i.severity === 'error');
  const warns = charIssues.filter(i => i.severity === 'warn');
  console.log('');
  console.log(`┌─ ${charName} (${errs.length} errors, ${warns.length} warnings)`);
  for (const issue of charIssues) {
    const prefix = issue.severity === 'error' ? '│  ✗ ERROR' : '│  ⚠ WARN ';
    console.log(`${prefix}  [${issue.category}]  ${issue.message}`);
  }
  console.log('└─────────────────────────────────────────────────────');
}

console.log('');
console.log('── Issue summary by category ───────────────────────────');
for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${cat}`);
}
console.log('');

process.exit(issues.length > 0 ? 1 : 0);
