/**
 * Character data migration script -- Phase 1
 *
 * Fixes:
 *   A) merit_creation array misalignment (trailing NULLs / ghost entries)
 *   B) MCI old format -- add dot1_choice/dot3_choice/dot5_choice fields
 *   C) free_mci allocation for clean matches where value is currently 0
 *
 * Usage:
 *   node scripts/migrate-chars.js                  -- dry run (no writes)
 *   node scripts/migrate-chars.js --write          -- write to data/chars_v2.json
 *   node scripts/migrate-chars.js --write --backup -- write + keep .bak file
 */

const { readFileSync, writeFileSync, copyFileSync } = require('fs');
const { resolve } = require('path');

const WRITE = process.argv.includes('--write');
const BACKUP = process.argv.includes('--backup');
const filePath = resolve('data/chars_v2.json');

const chars = JSON.parse(readFileSync(filePath, 'utf8'));

const EMPTY_MC = () => ({ cp: 0, free: 0, xp: 0 });

// Track all changes for the report
const changes = [];
const manualItems = [];

function log(charName, type, message) {
  changes.push({ charName, type, message });
}
function manual(charName, type, message) {
  manualItems.push({ charName, type, message });
}

// ── A: merit_creation alignment ───────────────────────────────────────────

for (const c of chars) {
  const n = c.name || '(unnamed)';
  const merits = c.merits || [];
  const mc = c.merit_creation || [];

  if (merits.length === mc.length) continue;

  if (mc.length > merits.length) {
    // Extra mc entries at the end -- check they're all zeros
    const extras = mc.slice(merits.length);
    const allZero = extras.every(e => e && (e.cp || 0) === 0 && (e.free || 0) === 0 && (e.xp || 0) === 0 &&
      (e.free_mci || 0) === 0 && (e.free_vm || 0) === 0 && (e.free_pt || 0) === 0 &&
      (e.free_lk || 0) === 0 && (e.free_ohm || 0) === 0 && (e.free_inv || 0) === 0 &&
      (e.free_mdb || 0) === 0 && (e.up || 0) === 0);

    if (allZero) {
      log(n, 'mc-truncate', `Removed ${extras.length} trailing zero-value merit_creation entr${extras.length === 1 ? 'y' : 'ies'}`);
      c.merit_creation = mc.slice(0, merits.length);
    } else {
      manual(n, 'mc-extra', `merit_creation has ${mc.length - merits.length} extra entries with non-zero values — manual review needed`);
    }
  } else {
    // Fewer mc entries than merits -- append empty entries
    const needed = merits.length - mc.length;
    const missing = merits.slice(mc.length).map(m => m ? m.name + ' ' + (m.rating || 0) : 'null');
    log(n, 'mc-append', `Appended ${needed} empty merit_creation entr${needed === 1 ? 'y' : 'ies'} for: ${missing.join(', ')}`);
    while (c.merit_creation.length < merits.length) {
      c.merit_creation.push(EMPTY_MC());
    }
  }
}

// ── B: MCI dot_choice fields ───────────────────────────────────────────────

for (const c of chars) {
  const n = c.name || '(unnamed)';
  const merits = c.merits || [];

  for (const m of merits) {
    if (m.name !== 'Mystery Cult Initiation') continue;
    if (m.dot1_choice || m.dot3_choice || m.dot5_choice) continue; // already migrated

    // Only old format if benefit_grants exists as a non-empty array of objects
    const hasOldGrants = Array.isArray(m.benefit_grants) && m.benefit_grants.some(g => g && typeof g === 'object' && 'name' in g);
    if (!hasOldGrants) continue;

    m.dot1_choice = 'merits';
    m.dot3_choice = 'merits';
    m.dot5_choice = 'merits';
    log(n, 'mci-dot-choices', `Added dot1_choice/dot3_choice/dot5_choice = "merits" to Mystery Cult Initiation (rating ${m.rating})`);
  }
}

// ── C: free_mci allocation for clean matches ──────────────────────────────

for (const c of chars) {
  const n = c.name || '(unnamed)';
  const merits = c.merits || [];

  for (const mci of merits) {
    if (mci.name !== 'Mystery Cult Initiation') continue;
    if (!Array.isArray(mci.benefit_grants)) continue;

    mci.benefit_grants.forEach((grant, dotIdx) => {
      if (!grant || !grant.name) return;

      // Find matching merit in merits array (same name + category; qualifier optional match)
      const matchIdx = merits.findIndex(m => {
        if (m.name !== grant.name) return false;
        if (m.category !== grant.category) return false;
        // If grant has qualifier, prefer merit with matching qualifier; but don't disqualify on mismatch
        // (same-name merits with different qualifiers are separate entries)
        if (grant.qualifier && m.qualifier && m.qualifier !== grant.qualifier) return false;
        return true;
      });

      const dotLabel = 'dot ' + (dotIdx + 1);

      if (matchIdx < 0) {
        manual(n, 'mci-no-match', `${dotLabel}: "${grant.name}${grant.qualifier ? ' (' + grant.qualifier + ')' : ''}" rated ${grant.rating} not found in merits array`);
        return;
      }

      const mcEntry = c.merit_creation[matchIdx];
      if (!mcEntry) {
        manual(n, 'mci-no-mc', `${dotLabel}: "${grant.name}" matched merits[${matchIdx}] but merit_creation[${matchIdx}] is missing`);
        return;
      }

      const currentMci = mcEntry.free_mci || 0;
      if (currentMci > 0) {
        // Already allocated -- verify it matches expected
        if (currentMci !== grant.rating) {
          manual(n, 'mci-mismatch', `${dotLabel}: "${grant.name}" merits[${matchIdx}] free_mci=${currentMci} but benefit_grants says ${grant.rating} — check manually`);
        }
        // else already correct, nothing to do
        return;
      }

      // Check if this merit is matched by multiple grants (ambiguous allocation)
      const otherGrants = mci.benefit_grants.filter((g, gi) => gi !== dotIdx && g && g.name === grant.name && g.category === grant.category);
      if (otherGrants.length > 0) {
        manual(n, 'mci-ambiguous', `${dotLabel}: "${grant.name}" merits[${matchIdx}] is targeted by ${otherGrants.length + 1} benefit_grants entries — set free_mci manually`);
        return;
      }

      // Clean match, free_mci is 0 -- set it
      mcEntry.free_mci = grant.rating;
      log(n, 'mci-free-set', `${dotLabel}: set merit_creation[${matchIdx}] ("${grant.name}") free_mci = ${grant.rating}`);
    });
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('  Character Data Migration -- Phase 1');
console.log(`  Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}`);
console.log(`  Changes: ${changes.length}  |  Manual items: ${manualItems.length}`);
console.log('═══════════════════════════════════════════════════════');

if (changes.length > 0) {
  console.log('\n── Changes applied' + (WRITE ? '' : ' (dry run)') + ' ──────────────────────────────────');
  const byChar = {};
  for (const c of changes) {
    if (!byChar[c.charName]) byChar[c.charName] = [];
    byChar[c.charName].push(c);
  }
  for (const [name, items] of Object.entries(byChar).sort()) {
    console.log('\n  ' + name);
    for (const item of items) {
      console.log('    ✓ [' + item.type + ']  ' + item.message);
    }
  }
}

if (manualItems.length > 0) {
  console.log('\n── Manual review required ──────────────────────────────');
  const byChar = {};
  for (const c of manualItems) {
    if (!byChar[c.charName]) byChar[c.charName] = [];
    byChar[c.charName].push(c);
  }
  for (const [name, items] of Object.entries(byChar).sort()) {
    console.log('\n  ' + name);
    for (const item of items) {
      console.log('    ⚠ [' + item.type + ']  ' + item.message);
    }
  }
}

// ── Write ──────────────────────────────────────────────────────────────────

if (WRITE) {
  if (BACKUP) {
    const backupPath = filePath.replace('.json', '.bak.json');
    copyFileSync(filePath, backupPath);
    console.log('\n  Backup written to ' + backupPath);
  }
  writeFileSync(filePath, JSON.stringify(chars, null, 2), 'utf8');
  console.log('\n  Written to ' + filePath);
} else {
  console.log('\n  Run with --write to apply changes (add --backup to keep a .bak file).');
}

console.log('');
