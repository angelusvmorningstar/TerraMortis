/**
 * Downtime CSV parser — ES module version.
 * Parses a Google Forms CSV export into submission objects.
 *
 * Converted from downtime_helper/js/parser.js (Peter's original).
 */

// ── Column indices (0-based) ────────────────────────────────────────────────

const COL = {
  TIMESTAMP:         0,
  EMAIL:             1,
  PLAYER_NAME:       2,
  CHARACTER_NAME:    3,
  ATTENDED:          4,
  TRAVEL:            5,
  GAME_RECOUNT:      6,
  STANDOUT_RP:       7,
  IC_CORRESPONDENCE: 8,
  MOST_TRUSTED:      9,
  ACTIVELY_HARMING:  10,
  ASPIRATIONS:       11,
  IS_REGENT:         12,
  REGENT_TERRITORY:  13,
  RESIDENCY_GRANTS:  14,
  TOTAL_RESIDENCY:   15,
  REGENCY_ACTION:    16,
  FEEDING_METHOD:    17,
  FEED_ACADEMY:      18,
  FEED_HARBOUR:      19,
  FEED_DOCKLANDS:    20,
  FEED_SECOND_CITY:  21,
  FEED_SHORE:        22,
  FEED_BARRENS:      23,
  INF_ACADEMY:       24,
  INF_HARBOUR:       25,
  INF_DOCKLANDS:     26,
  INF_SECOND_CITY:   27,
  INF_SHORE:         28,
  PROJ1: 29, PROJ2: 34, PROJ3: 39, PROJ4: 44,
  HAS_SPHERE:        49,
  SPHERE1: 50, SPHERE2: 54, SPHERE3: 58, SPHERE4: 62, SPHERE5: 66,
  HAS_CONTACTS_A: 70, HAS_CONTACTS_B: 71,
  CONTACT1: 72, CONTACT2: 73, CONTACT3: 74, CONTACT4: 75, CONTACT5: 76, CONTACT6: 77,
  HAS_RETAINERS_A: 78, HAS_RETAINERS_B: 79,
  RETAINER1: 80, RETAINER2: 81, RETAINER3: 82, RETAINER4: 83, RETAINER5: 84,
  HAS_ACQ_A: 85, HAS_ACQ_B: 86, RESOURCE_ACQ: 87, SKILL_ACQ: 88,
  HAS_RITUAL_A: 89, HAS_RITUAL_B: 90, CASTING: 91,
  ST_NOTES: 92, XP_SPEND: 93, LORE_QUESTIONS: 94, FORM_RATING: 95, FORM_COMMENTS: 96,
};

// ── CSV tokeniser (RFC 4180) ────────────────────────────────────────────────

function parseCSV(raw) {
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;
  while (i < raw.length) {
    const ch = raw[i], next = raw[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i += 2; }
      else if (ch === '"') { inQuotes = false; i++; }
      else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { row.push(field); field = ''; i++; }
      else if (ch === '\r' && next === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; }
      else if (ch === '\n' || ch === '\r') { row.push(field); rows.push(row); row = []; field = ''; i++; }
      else { field += ch; i++; }
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const str  = (v) => (v == null ? null : v.trim() || null);
const bool = (v) => /^yes$/i.test((v || '').trim());
const int  = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };

export function parseDicePool(expression) {
  const s = str(expression);
  if (!s) return null;
  const totalMatch = s.match(/=\s*(\d+)/);
  if (totalMatch) return { expression: s, size: parseInt(totalMatch[1], 10) };
  const tokens = s.match(/\b\d+\b/g);
  const size = tokens ? tokens.reduce((acc, n) => acc + parseInt(n, 10), 0) : null;
  return { expression: s, size: (size > 0 ? size : null) };
}

function feedingStatus(v) {
  const s = (v || '').trim();
  if (!s || s === 'Not feeding here') return 'Not feeding here';
  if (/resident/i.test(s)) return 'Resident';
  if (/poach/i.test(s)) return 'Poaching';
  if (/feed/i.test(s)) return 'Feeding';
  return s || null;
}

/**
 * Extract the canonical action type from the composite Google Forms value.
 * e.g. "XP Spend: Grow your character 🌱" → "xp_spend"
 *      "Ambience Change (Increase): Make a Territory delicious 😄" → "ambience_increase"
 */
function normaliseActionType(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (/^xp spend/i.test(s))                    return 'xp_spend';
  if (/^ambience.*increase/i.test(s))           return 'ambience_increase';
  if (/^ambience.*decrease/i.test(s))           return 'ambience_decrease';
  if (/^attack/i.test(s))                       return 'attack';
  if (/^feed/i.test(s))                         return 'feed';
  if (/^hide|^protect/i.test(s))                return 'hide_protect';
  if (/^investigate/i.test(s))                   return 'investigate';
  if (/^patrol|^scout/i.test(s))                return 'patrol_scout';
  if (/^support/i.test(s))                       return 'support';
  if (/^misc/i.test(s))                          return 'misc';
  if (/^no action/i.test(s))                     return null;
  return s.split(':')[0].trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Parse structured Key: Value pairs from a project description field.
 * Players use a semi-structured format with lines like:
 *   Project Name: Very Very Sneaky
 *   Characters: ME
 *   XP SPEND: 3
 *   Merits: Safe Place 1
 *   Description: ...
 *
 * Keys are normalised to lowercase. Unkeyed trailing text becomes 'detail'.
 */
function parseDescriptionFields(raw) {
  if (!raw) return {};
  const result = {};
  const lines = raw.split('\n');
  let lastKey = null;

  for (const line of lines) {
    const kv = line.match(/^\s*(project name|name|characters?|cast|xp\s*spend|xp|merits?|bonuses?|desc(?:ription)?)\s*:\s*(.*)/i);
    if (kv) {
      let key = kv[1].trim().toLowerCase()
        .replace(/^project name$/, 'project_name')
        .replace(/^characters?$/, 'characters')
        .replace(/^cast$/, 'characters')
        .replace(/^xp\s*spend$/, 'xp_spend')
        .replace(/^merits?$/, 'merits')
        .replace(/^bonuses?$/, 'bonuses')
        .replace(/^desc(ription)?$/, 'detail');
      result[key] = (kv[2] || '').trim();
      lastKey = key;
    } else if (lastKey === 'detail') {
      // Continuation of the detail/description block
      result.detail = (result.detail || '') + '\n' + line;
    } else if (line.trim()) {
      // Unkeyed text — append to detail
      result.detail = (result.detail || '') + '\n' + line;
    }
  }

  // Clean up
  if (result.detail) result.detail = result.detail.trim();
  if (result.xp_spend) {
    const n = parseInt(result.xp_spend, 10);
    result.xp_spend = isNaN(n) ? result.xp_spend : n;
  }
  return result;
}

function parseProject(cols, offset) {
  const actionTypeRaw = str(cols[offset]);
  if (!actionTypeRaw || /no action taken/i.test(actionTypeRaw)) return null;
  const descRaw = str(cols[offset + 4]) || '';
  const parsed = parseDescriptionFields(descRaw);
  return {
    action_type: normaliseActionType(actionTypeRaw),
    action_type_raw: actionTypeRaw,
    primary_pool: parseDicePool(cols[offset + 1]),
    secondary_pool: parseDicePool(cols[offset + 2]),
    desired_outcome: str(cols[offset + 3]) || '',
    description: descRaw,
    // Extracted structured fields from description
    project_name: parsed.project_name || parsed.name || null,
    characters: parsed.characters || null,
    xp_spend: parsed.xp_spend || null,
    merits: parsed.merits || null,
    bonuses: parsed.bonuses || null,
    detail: parsed.detail || null,
  };
}

function parseMeritPool(meritType) {
  const s = str(meritType);
  if (!s) return null;
  const m = s.match(/\b(\d+)\b/);
  return { expression: s, size: m ? parseInt(m[1], 10) : null };
}

function parseSphereAction(cols, offset) {
  const meritType = str(cols[offset]);
  const actionType = str(cols[offset + 1]);
  if (!meritType || !actionType || /no action taken/i.test(actionType)) return null;
  return {
    merit_type: meritType,
    action_type: actionType,
    desired_outcome: str(cols[offset + 2]) || '',
    description: str(cols[offset + 3]) || '',
    dice_pool: parseMeritPool(meritType),
  };
}

function collectArray(cols, startIdx, count) {
  const out = [];
  for (let i = 0; i < count; i++) { const v = str(cols[startIdx + i]); if (v) out.push(v); }
  return out;
}

function isBlankRow(cols) { return cols.every(c => !c || !c.trim()); }

// ── Main export ─────────────────────────────────────────────────────────────

export function parseDowntimeCSV(csvText) {
  const allRows = parseCSV(csvText);
  const warnings = [];
  const submissions = [];

  if (allRows.length < 2) {
    warnings.push('CSV appears to have no data rows.');
    return { submissions, warnings };
  }

  const dataRows = allRows.slice(1).filter(r => !isBlankRow(r));

  for (let ri = 0; ri < dataRows.length; ri++) {
    const c = dataRows[ri];
    try {
      const sub = {
        submission: {
          timestamp: str(c[COL.TIMESTAMP]),
          email: str(c[COL.EMAIL]),
          player_name: str(c[COL.PLAYER_NAME]) || '(unknown)',
          character_name: str(c[COL.CHARACTER_NAME]) || '(unknown)',
          attended_last_game: bool(c[COL.ATTENDED]),
        },
        narrative: {
          travel_description: str(c[COL.TRAVEL]),
          game_recount: str(c[COL.GAME_RECOUNT]),
          standout_rp: str(c[COL.STANDOUT_RP]),
          ic_correspondence: str(c[COL.IC_CORRESPONDENCE]),
          most_trusted_pc: str(c[COL.MOST_TRUSTED]),
          actively_harming_pc: str(c[COL.ACTIVELY_HARMING]),
          aspirations: str(c[COL.ASPIRATIONS]),
        },
        regency: {
          is_regent: bool(c[COL.IS_REGENT]),
          territory: str(c[COL.REGENT_TERRITORY]),
          residency_grants: str(c[COL.RESIDENCY_GRANTS])
            ? str(c[COL.RESIDENCY_GRANTS]).split(/[,\n]+/).map(s => s.trim()).filter(Boolean) : [],
          total_residency_count: int(c[COL.TOTAL_RESIDENCY]),
          regency_action: str(c[COL.REGENCY_ACTION]),
        },
        feeding: {
          method: str(c[COL.FEEDING_METHOD]),
          territories: {
            'The Academy': feedingStatus(c[COL.FEED_ACADEMY]),
            'The City Harbour': feedingStatus(c[COL.FEED_HARBOUR]),
            'The Dockyards': feedingStatus(c[COL.FEED_DOCKLANDS]),
            'The Second City': feedingStatus(c[COL.FEED_SECOND_CITY]),
            'The Northern Shore': feedingStatus(c[COL.FEED_SHORE]),
            'The Barrens': feedingStatus(c[COL.FEED_BARRENS]),
          }
        },
        influence: {
          // These columns are checkbox/text selections ("The Academy" if selected, blank if not).
          // A non-empty cell = player is spending influence in that territory (= +1).
          'The Academy':    str(c[COL.INF_ACADEMY])    ? 1 : 0,
          'The Harbour':    str(c[COL.INF_HARBOUR])    ? 1 : 0,
          'The Dockyards':  str(c[COL.INF_DOCKLANDS])  ? 1 : 0,
          'The Second City': str(c[COL.INF_SECOND_CITY]) ? 1 : 0,
          'The Shore':      str(c[COL.INF_SHORE])      ? 1 : 0,
        },
        projects: [
          parseProject(c, COL.PROJ1), parseProject(c, COL.PROJ2),
          parseProject(c, COL.PROJ3), parseProject(c, COL.PROJ4),
        ].filter(Boolean),
        sphere_actions: [
          parseSphereAction(c, COL.SPHERE1), parseSphereAction(c, COL.SPHERE2),
          parseSphereAction(c, COL.SPHERE3), parseSphereAction(c, COL.SPHERE4),
          parseSphereAction(c, COL.SPHERE5),
        ].filter(Boolean),
        contact_actions: {
          has_contacts: bool(c[COL.HAS_CONTACTS_A]) || bool(c[COL.HAS_CONTACTS_B]),
          requests: collectArray(c, COL.CONTACT1, 6),
        },
        retainer_actions: {
          has_retainers: bool(c[COL.HAS_RETAINERS_A]) || bool(c[COL.HAS_RETAINERS_B]),
          actions: collectArray(c, COL.RETAINER1, 5),
        },
        acquisitions: {
          has_acquisitions: bool(c[COL.HAS_ACQ_A]) || bool(c[COL.HAS_ACQ_B]),
          resource_acquisitions: str(c[COL.RESOURCE_ACQ]),
          skill_acquisitions: str(c[COL.SKILL_ACQ]),
        },
        ritual_casting: {
          has_rituals: bool(c[COL.HAS_RITUAL_A]) || bool(c[COL.HAS_RITUAL_B]),
          casting: str(c[COL.CASTING]),
        },
        meta: {
          st_notes: str(c[COL.ST_NOTES]),
          xp_spend: str(c[COL.XP_SPEND]),
          lore_questions: str(c[COL.LORE_QUESTIONS]),
          form_rating: int(c[COL.FORM_RATING]),
          form_comments: str(c[COL.FORM_COMMENTS]),
        },
      };
      submissions.push(sub);
    } catch (err) {
      warnings.push(`Row ${ri + 2}: failed to parse -- ${err.message}`);
    }
  }

  return { submissions, warnings };
}
