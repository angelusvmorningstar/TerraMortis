/**
 * Prereq string parser — converts human-readable prerequisite strings
 * into structured JSON Logic trees with all/any combinators.
 *
 * Input:  "Brawl 1 or Weaponry 1"
 * Output: { any: [{ type: 'skill', name: 'Brawl', dots: 1 }, { type: 'skill', name: 'Weaponry', dots: 1 }] }
 *
 * Input:  "Carthian Status 1, Athletics 2"
 * Output: { all: [{ type: 'merit', name: 'Status', qualifier: 'Carthian', dots: 1 }, { type: 'skill', name: 'Athletics', dots: 2 }] }
 */

// Known attribute names (full and abbreviated)
const ATTRS = new Set([
  'Intelligence', 'Wits', 'Resolve',
  'Strength', 'Dexterity', 'Stamina',
  'Presence', 'Manipulation', 'Composure',
]);
const ATTR_ABBREV = {
  'Str': 'Strength', 'Dex': 'Dexterity', 'Sta': 'Stamina',
  'Int': 'Intelligence', 'Comp': 'Composure',
  'Pre': 'Presence', 'Man': 'Manipulation',
};

// Known skill names
const SKILLS = new Set([
  'Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science',
  'Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry',
  'Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge',
]);

// Known discipline names
const DISCIPLINES = new Set([
  'Animalism', 'Auspex', 'Celerity', 'Dominate', 'Majesty',
  'Nightmare', 'Obfuscate', 'Protean', 'Resilience', 'Vigour',
  'Cruac', 'Crúac', 'Theban', 'Theban Sorcery',
]);

// Known clan names
const CLANS = new Set(['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue']);

// Known covenant status prefixes
const COVENANT_PREFIXES = ['Carthian', 'Crone', 'Invictus', 'Lance', 'Lancea', 'Ordo', 'Sanctified'];

// Known merit names that appear as prereqs
const KNOWN_MERITS = new Set([
  'Contacts', 'Resources', 'Safe Place', 'Allies', 'Herd', 'Feeding Grounds',
  'Feeding Ground', 'Dream Visions', 'Iron Stamina', 'Fighting Finesse',
  'Quick Draw', 'Trained Observer', 'Altar', 'Dynasty Membership',
  'Sorcerous Eunuch', 'Defensive Combat', 'Area of Expertise',
  'Street Fighting', 'Martial Arts', 'Spear and Bayonet', 'Weapon and Shield',
  'Joint Lock', 'Takedown', 'Fame',
]);

// Known fighting style names (appear as prereqs for manoeuvres)
const STYLE_NAMES = new Set([
  'Street Fighting', 'Martial Arts', 'Spear and Bayonet', 'Weapon and Shield',
  'Armed Defence', 'Berserker', 'Staff Fighting',
]);

// Module-level warnings accumulator. NOT safe for concurrent use in a server process.
// This module is designed for batch seed scripts only. If imported server-side,
// refactor to return warnings per call instead.
const warnings = [];

/**
 * Parse a single prereq token (one AND-clause, no commas).
 * May contain internal OR via " or ".
 */
function parseSingleToken(token) {
  token = token.trim();
  if (!token || token === '-') return null;

  // Negation: "No X Status" or "No X"
  if (/^No\s+/i.test(token)) {
    const rest = token.replace(/^No\s+/i, '').trim();
    // "No Carthian Status" → not status (Carthian)
    for (const cov of COVENANT_PREFIXES) {
      if (rest.toLowerCase().startsWith(cov.toLowerCase() + ' status')) {
        return { type: 'not_status', qualifier: cov };
      }
    }
    // "No Invictus Status" already handled, generic fallback
    return { type: 'not', name: rest };
  }

  // Humanity threshold: "Humanity < 5"
  const humMatch = token.match(/^Humanity\s*<\s*(\d+)$/i);
  if (humMatch) return { type: 'humanity', max: parseInt(humMatch[1], 10) - 1 };

  // "Cannot have X" patterns
  if (/^Cannot have /i.test(token)) {
    const names = token.replace(/^Cannot have /i, '').split(/\s+or\s+/i).map(s => s.trim());
    if (names.length === 1) return { type: 'not', name: names[0] };
    return { any: names.map(n => ({ type: 'not', name: n })) };
  }
  if (/^Not\s+/i.test(token)) {
    const rest = token.replace(/^Not\s+/i, '').split(/\s+or\s+/i).map(s => s.trim());
    if (rest.length === 1) return { type: 'not', name: rest[0] };
    return { all: rest.map(n => ({ type: 'not', name: n })) };
  }

  // Clan check: bare clan name
  if (CLANS.has(token)) return { type: 'clan', name: token };

  // Bloodline check
  const blMatch = token.match(/^(.+?)\s+[Bb]loodline$/);
  if (blMatch) return { type: 'bloodline', name: blMatch[1] };
  // "Nosferatu (Order of Sir Martin induction)" — special
  if (token.includes('Order of Sir Martin')) return { type: 'bloodline', name: 'Order of Sir Martin' };

  // Covenant Status with dots: "Carthian Status 1"
  for (const cov of COVENANT_PREFIXES) {
    const covRe = new RegExp(`^${cov}\\s+Status\\s*(\\d+)?$`, 'i');
    const covMatch = token.match(covRe);
    if (covMatch) {
      const node = { type: 'status', qualifier: cov };
      if (covMatch[1]) node.dots = parseInt(covMatch[1], 10);
      return node;
    }
  }

  // City Status with dots
  const cityMatch = token.match(/^City\s+Status\s*(\d+)?$/i);
  if (cityMatch) {
    const node = { type: 'status', qualifier: 'City' };
    if (cityMatch[1]) node.dots = parseInt(cityMatch[1], 10);
    return node;
  }

  // Clan Status
  const clanStatMatch = token.match(/^Clan\s+Status\s*(\d+)?$/i);
  if (clanStatMatch) {
    const node = { type: 'status', qualifier: 'Clan' };
    if (clanStatMatch[1]) node.dots = parseInt(clanStatMatch[1], 10);
    return node;
  }

  // "Sanctum Status 1" → Lance Status
  const sanctumMatch = token.match(/^Sanctum\s+Status\s*(\d+)?$/i);
  if (sanctumMatch) {
    const node = { type: 'status', qualifier: 'Lance' };
    if (sanctumMatch[1]) node.dots = parseInt(sanctumMatch[1], 10);
    return node;
  }

  // Attribute with dots: "Resolve 3", "Str 3"
  const attrDotsMatch = token.match(/^(\w+)\s+(\d+)$/);
  if (attrDotsMatch) {
    let name = attrDotsMatch[1];
    const dots = parseInt(attrDotsMatch[2], 10);
    if (ATTR_ABBREV[name]) name = ATTR_ABBREV[name];
    if (ATTRS.has(name)) return { type: 'attribute', name, dots };
    // Check if it's a skill
    if (SKILLS.has(name)) return { type: 'skill', name, dots };
    // Check discipline
    if (DISCIPLINES.has(name)) return { type: 'discipline', name, dots };
    // "Willpower 6" → special
    if (name === 'Willpower') return { type: 'willpower', dots };
    // "Blood Potency 5" → special (note: might have been "Blood Potency 5 1" which is a typo)
  }

  // Two-word skill/attr with dots: "Animal Ken 3", "Blood Potency 5"
  const twoWordMatch = token.match(/^(.+?)\s+(\d+)$/);
  if (twoWordMatch) {
    let name = twoWordMatch[1].trim();
    const dots = parseInt(twoWordMatch[2], 10);
    if (ATTR_ABBREV[name]) name = ATTR_ABBREV[name];
    if (ATTRS.has(name)) return { type: 'attribute', name, dots };
    if (SKILLS.has(name)) return { type: 'skill', name, dots };
    if (DISCIPLINES.has(name)) return { type: 'discipline', name, dots };
    if (name === 'Crúac' || name === 'Cruac') return { type: 'discipline', name: 'Cruac', dots };
    if (name === 'Theban Sorcery') return { type: 'discipline', name: 'Theban', dots };
    if (name === 'Blood Potency') return { type: 'blood_potency', dots };
    if (name === 'Willpower') return { type: 'willpower', dots };
    // Known merit with dots
    if (KNOWN_MERITS.has(name) || STYLE_NAMES.has(name)) return { type: 'merit', name, dots };
    // "Herd ≤" pattern (no meaningful dots)
    if (name.includes('≤') || name.endsWith('≤')) return { type: 'merit', name: name.replace(/\s*≤.*/, '') };
  }

  // Bare merit name without dots
  if (KNOWN_MERITS.has(token)) return { type: 'merit', name: token };
  if (STYLE_NAMES.has(token)) return { type: 'merit', name: token };

  // "Feeding Ground 1" → merit
  if (/^Feeding Ground/i.test(token)) {
    const m = token.match(/(\d+)$/);
    return { type: 'merit', name: 'Feeding Grounds', dots: m ? parseInt(m[1], 10) : undefined };
  }

  // "Herd ≤" → merit (variable rating)
  if (token.includes('≤')) {
    return { type: 'merit', name: token.replace(/\s*≤.*/, '').trim() };
  }

  // "Quick Draw (Thrown)" → merit with qualifier
  const qualMatch = token.match(/^(.+?)\s*\((.+?)\)$/);
  if (qualMatch) {
    const mName = qualMatch[1].trim();
    const qual = qualMatch[2].trim();
    if (KNOWN_MERITS.has(mName) || STYLE_NAMES.has(mName)) {
      return { type: 'merit', name: mName, qualifier: qual };
    }
    // "Safe Place (same level)" → merit
    if (mName === 'Safe Place') return { type: 'merit', name: 'Safe Place' };
    // "Specialisation (Brawl or Weaponry)" → specialisation
    if (mName === 'Specialisation' || mName === 'Specialization') {
      return { type: 'specialisation', name: qual };
    }
    // "Nosferatu (Order of Sir Martin induction)" handled above
  }

  // "Specialised Skill 3" → generic
  if (/^Speciali[sz]ed\s+Skill/i.test(token)) {
    const m = token.match(/(\d+)$/);
    return { type: 'specialised_skill', dots: m ? parseInt(m[1], 10) : 3 };
  }

  // "Skill Specialisation" / "Skill Specialty" → generic
  if (/^(Skill\s+)?Speciali[sz]ation$/i.test(token) || /^(Skill\s+)?Specialty$/i.test(token)) {
    return { type: 'has_specialisation' };
  }

  // "relevant Specialisation" → generic
  if (/relevant\s+Speciali[sz]ation/i.test(token)) {
    return { type: 'has_specialisation' };
  }

  // "Specialisation in X or Y"
  if (/^Speciali[sz]ation\s+in\s+/i.test(token)) {
    const rest = token.replace(/^Speciali[sz]ation\s+in\s+/i, '');
    return { type: 'specialisation', name: rest };
  }

  // Freeform text prereqs — these can't be machine-checked
  // "One must be Invictus", "One partner must be Invictus", "Appropriate Social Merit"
  // "Humanity 3 + Merit rating", "Bonded Condition", "Human character (not Kindred)"
  if (/^(One|Appropriate|Human|In-game)/i.test(token) || token.includes('+') || token.includes('Condition')) {
    return { type: 'text', name: token };
  }

  // Last resort: try as a two-word check with abbreviations
  const parts = token.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const dots = parseInt(last, 10);
    if (!isNaN(dots)) {
      const name = parts.slice(0, -1).join(' ');
      let resolved = ATTR_ABBREV[name] || name;
      if (ATTRS.has(resolved)) return { type: 'attribute', name: resolved, dots };
      if (SKILLS.has(resolved)) return { type: 'skill', name: resolved, dots };
      if (DISCIPLINES.has(resolved)) return { type: 'discipline', name: resolved, dots };
      // Treat as merit
      return { type: 'merit', name, dots };
    }
  }

  // Truly unrecognised
  warnings.push(`Unrecognised prereq token: "${token}"`);
  return { type: 'text', name: token };
}

/**
 * Split on " or " but not inside parentheses or after "Specialisation in".
 */
function smartSplitOr(str) {
  // Don't split if "Specialisation in X or Y" — treat as one specialisation reference
  if (/Speciali[sz]ation\s+in\s+/i.test(str)) return [str];

  const parts = [];
  let depth = 0, current = '', i = 0;
  while (i < str.length) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    // Check for " or " at depth 0
    if (depth === 0 && str.slice(i).match(/^\s+or\s+/i)) {
      parts.push(current.trim());
      const m = str.slice(i).match(/^\s+or\s+/i);
      i += m[0].length;
      current = '';
    } else {
      current += str[i];
      i++;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parse a full prereq string into a JSON Logic tree.
 * Returns null for empty/absent prereqs.
 */
export function parsePrereq(prereqStr) {
  if (!prereqStr || prereqStr === '-' || prereqStr.trim() === '') return null;

  // Handle semicolons as AND separators (manoeuvre prereqs use these)
  const normalized = prereqStr.replace(/;\s*/g, ', ');

  // Smart split on comma — don't split inside parentheses
  const andParts = [];
  let depth = 0, current = '';
  for (const ch of normalized) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      andParts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) andParts.push(current.trim());

  const nodes = [];
  for (const part of andParts) {
    if (!part.trim()) continue;

    // Check for OR within this part — but not inside parentheses
    const orParts = smartSplitOr(part);
    if (orParts.length > 1) {
      const orNodes = orParts.map(p => parseSingleToken(p.trim())).filter(Boolean);
      if (orNodes.length === 1) nodes.push(orNodes[0]);
      else if (orNodes.length > 1) nodes.push({ any: orNodes });
    } else {
      const node = parseSingleToken(part.trim());
      if (node) nodes.push(node);
    }
  }

  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return { all: nodes };
}

/**
 * Get any warnings generated during parsing.
 */
export function getWarnings() {
  return [...warnings];
}

/**
 * Clear warnings (call between batch runs).
 */
export function clearWarnings() {
  warnings.length = 0;
}
