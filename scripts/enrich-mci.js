#!/usr/bin/env node
/**
 * Enrich chars_v2.json with MCI standing merit data from tm_characters.json.
 *
 * For each character with MCI in the old format:
 * 1. Create a standing merit entry for MCI in the v2 merits array
 * 2. Build benefit_grants array (one entry per dot)
 * 3. Add granted_by to existing child merits
 *
 * Outputs a report of matches, ambiguities, and mismatches.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'archive', 'tm_characters.json'), 'utf8'));
const v2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chars_v2.json'), 'utf8'));
const oldChars = old.characters || old;

const report = { matched: 0, created: 0, issues: [] };

// Parse an sp_source string to extract dot number(s)
// Returns array of dot numbers, e.g. "MCI 3" -> [3], "MCI 2&3" -> [2,3], "MCI L4 1/3" -> [4]
function parseMCIDots(src) {
  // Strip "MCI" prefix and clean
  let s = src.replace(/^MCI\s*/i, '').trim();

  // "L4 1/3" -> dot 4 (the "1/3" means it's 1 of 3 things from that dot)
  // "L1" -> dot 1, "L2" -> dot 2, etc.
  const lMatch = s.match(/^L(\d)/i);
  if (lMatch) return [parseInt(lMatch[1])];

  // "x1", "x3" -> dot 1, dot 3
  const xMatch = s.match(/^x(\d)/i);
  if (xMatch) return [parseInt(xMatch[1])];

  // "2&3" -> dots 2 and 3
  const ampMatch = s.match(/^(\d)\s*&\s*(\d)/);
  if (ampMatch) return [parseInt(ampMatch[1]), parseInt(ampMatch[2])];

  // "5, Weap&Shiel 1" -> dot 5
  const commaMatch = s.match(/^(\d)/);
  if (commaMatch) return [parseInt(commaMatch[1])];

  // Just a number
  const numMatch = s.match(/^(\d)$/);
  if (numMatch) return [parseInt(numMatch[1])];

  // No number (e.g. just "MCI") -> unknown
  return [];
}

// Find matching v2 merit for an old format entry
function findV2Merit(v2Merits, oldEntry) {
  const { type, name, qualifier, dots } = oldEntry;

  if (type === 'merit') {
    // General merits: match by name. qualifier in old format is in parentheses after name
    return v2Merits.findIndex(m =>
      m.category === 'general' &&
      m.name.toLowerCase() === name.toLowerCase() &&
      m.rating === dots
    );
  }

  if (type === 'influence') {
    // Influence merits: match by name + area
    return v2Merits.findIndex(m =>
      m.category === 'influence' &&
      m.name.toLowerCase() === name.toLowerCase() &&
      m.rating === dots &&
      (m.area || '').toLowerCase() === (qualifier || '').toLowerCase()
    );
  }

  if (type === 'domain') {
    // Domain merits: name is safe_place/haven/herd -> Safe Place/Haven/Herd
    const nameMap = { safe_place: 'Safe Place', haven: 'Haven', herd: 'Herd' };
    const v2Name = nameMap[name] || name;
    return v2Merits.findIndex(m =>
      m.category === 'domain' &&
      m.name.toLowerCase() === v2Name.toLowerCase() &&
      m.rating === dots
    );
  }

  if (type === 'manoeuvre') {
    // Manoeuvres: match by rank_name or name+rating
    // Old format name is like "Push/Pull (Strength Performance 3)"
    // Parse the rank name from before the parenthesis
    const rankMatch = name.match(/^(.+?)\s*\(/);
    const rankName = rankMatch ? rankMatch[1].trim() : name;
    return v2Merits.findIndex(m =>
      m.category === 'manoeuvre' &&
      m.rank_name &&
      m.rank_name.toLowerCase() === rankName.toLowerCase()
    );
  }

  return -1;
}

// Build a benefit_grants entry from an old sp_source entry
function buildGrant(oldEntry) {
  const { type, name, qualifier, dots } = oldEntry;

  if (type === 'merit') {
    const grant = { category: 'general', name, rating: dots };
    if (qualifier) grant.qualifier = qualifier;
    return grant;
  }
  if (type === 'influence') {
    const grant = { category: 'influence', name, rating: dots };
    if (qualifier) grant.qualifier = qualifier;
    return grant;
  }
  if (type === 'domain') {
    const nameMap = { safe_place: 'Safe Place', haven: 'Haven', herd: 'Herd' };
    return { category: 'domain', name: nameMap[name] || name, rating: dots };
  }
  if (type === 'manoeuvre') {
    const rankMatch = name.match(/^(.+?)\s*\(/);
    const manMatch = name.match(/\((.+?)\s+\d+\)/);
    return {
      category: 'manoeuvre',
      name: manMatch ? manMatch[1] : name,
      rating: dots,
      rank_name: rankMatch ? rankMatch[1].trim() : name
    };
  }
  return { category: 'general', name, rating: dots };
}

// Process each character
for (const oc of oldChars) {
  const st = oc.standing || {};
  if (!st.mystery_cult || st.mystery_cult.dots <= 0) continue;

  const mci = st.mystery_cult;
  // Find the corresponding v2 character (name may have changed)
  const v2Name = oc.name === 'Lady Julia' ? 'Julia'
    : oc.name === 'Sister Hazel' ? 'Hazel'
    : oc.name === "Margaret 'Doc' Kane" ? 'Margaret Kane'
    : oc.name === "Macheath 'Mac'" ? 'Macheath'
    : oc.name === "Yusuf 'Mammon' Kalusicj" ? 'Yusuf Kalusicj'
    : oc.name === "Casamir 'Cazz'" ? 'Casamir'
    : oc.name === "Jelle 'Gel' Dunneweld" ? 'Jelle Dunneweld'
    : oc.name;

  const v2c = v2.find(c => c.name === v2Name);
  if (!v2c) {
    report.issues.push(`${oc.name}: v2 character not found (looked for ${v2Name})`);
    continue;
  }

  // Collect all MCI sp_source entries from old format
  const mciEntries = [];
  function scan(items, type) {
    for (const m of items) {
      if (m.sp_source && /^MCI/i.test(m.sp_source)) {
        mciEntries.push({
          type, name: m.name, qualifier: m.qualifier,
          dots: m.dots, sp: m.sp, src: m.sp_source,
          parsedDots: parseMCIDots(m.sp_source)
        });
      }
    }
  }
  function scanObj(obj, type) {
    for (const [k, v] of Object.entries(obj || {})) {
      if (v.sp_source && /^MCI/i.test(v.sp_source)) {
        mciEntries.push({
          type, name: k, dots: v.dots, sp: v.sp, src: v.sp_source,
          parsedDots: parseMCIDots(v.sp_source)
        });
      }
    }
  }
  scan(oc.merits || [], 'merit');
  scan(oc.influence || [], 'influence');
  scan(oc.manoeuvres || [], 'manoeuvre');
  scanObj(oc.domain || {}, 'domain');

  // Build benefit_grants: 5 slots (one per dot), null for empty
  const benefitGrants = Array(5).fill(null);

  for (const entry of mciEntries) {
    const grant = buildGrant(entry);
    const dots = entry.parsedDots;

    if (dots.length === 1) {
      const dotIdx = dots[0] - 1;
      if (dotIdx >= 0 && dotIdx < 5) {
        if (benefitGrants[dotIdx] === null) {
          benefitGrants[dotIdx] = grant;
        } else {
          // Multiple grants from same dot — this is valid (e.g. Charlie MCI L4 has multiple)
          // Convert to array if not already
          if (!Array.isArray(benefitGrants[dotIdx])) {
            benefitGrants[dotIdx] = [benefitGrants[dotIdx]];
          }
          benefitGrants[dotIdx].push(grant);
        }
      }
    } else if (dots.length === 2) {
      // Split across two dots (e.g. "MCI 2&3")
      // Put the grant at the higher dot, note the split
      const dotIdx = Math.max(...dots) - 1;
      if (benefitGrants[dotIdx] === null) {
        benefitGrants[dotIdx] = grant;
      }
      report.issues.push(`${oc.name}: "${entry.src}" spans dots ${dots.join('&')} — placed grant at dot ${Math.max(...dots)}`);
    } else {
      // No dot number (e.g. just "MCI")
      report.issues.push(`${oc.name}: "${entry.src}" -> ${entry.type}/${entry.name} — no dot number, cannot place in benefit_grants`);
    }

    // Add granted_by to the matching v2 merit
    const v2Idx = findV2Merit(v2c.merits, entry);
    if (v2Idx >= 0) {
      v2c.merits[v2Idx].granted_by = entry.src;
      report.matched++;
    } else {
      report.issues.push(`${oc.name}: No v2 merit match for ${entry.type}/${entry.name}${entry.qualifier ? ' (' + entry.qualifier + ')' : ''} ${entry.dots}dot`);
    }
  }

  // Flatten any arrays in benefitGrants (multiple grants from one dot)
  // The UI expects single grants per dot, but some dots grant multiple things.
  // Keep as single grant if only one, otherwise note the issue.
  for (let i = 0; i < 5; i++) {
    if (Array.isArray(benefitGrants[i])) {
      report.issues.push(`${oc.name}: MCI dot ${i + 1} has ${benefitGrants[i].length} grants — keeping first, rest via granted_by`);
      benefitGrants[i] = benefitGrants[i][0];
    }
  }

  // Create the MCI standing merit
  const mciMerit = {
    category: 'standing',
    name: 'Mystery Cult Initiation',
    rating: mci.dots,
    cult_name: mci.name || '',
    benefits: Array(5).fill(''),
    active: true,
    benefit_grants: benefitGrants
  };

  // Add to v2 merits (at the end of the array, before any manoeuvres)
  const lastStandingIdx = v2c.merits.reduce((acc, m, i) => m.category === 'standing' ? i : acc, -1);
  const insertIdx = lastStandingIdx >= 0 ? lastStandingIdx + 1 : v2c.merits.length;
  v2c.merits.splice(insertIdx, 0, mciMerit);
  report.created++;
}

// Write updated v2 data
fs.writeFileSync(path.join(ROOT, 'data', 'chars_v2.json'), JSON.stringify(v2, null, 2), 'utf8');

// Report
console.log(`\nMCI Enrichment Complete`);
console.log(`  Standing merits created: ${report.created}`);
console.log(`  Child merits matched (granted_by added): ${report.matched}`);
console.log(`  Issues: ${report.issues.length}`);
if (report.issues.length) {
  console.log('\nIssues:');
  report.issues.forEach(i => console.log('  ' + i));
}
