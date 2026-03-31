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

function parseProject(cols, offset) {
  const actionType = str(cols[offset]);
  if (!actionType || /no action taken/i.test(actionType)) return null;
  return {
    action_type: actionType,
    primary_pool: parseDicePool(cols[offset + 1]),
    secondary_pool: parseDicePool(cols[offset + 2]),
    desired_outcome: str(cols[offset + 3]) || '',
    description: str(cols[offset + 4]) || '',
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
            'The Docklands': feedingStatus(c[COL.FEED_DOCKLANDS]),
            'The Second City': feedingStatus(c[COL.FEED_SECOND_CITY]),
            'The Northern Shore': feedingStatus(c[COL.FEED_SHORE]),
            'The Barrens': feedingStatus(c[COL.FEED_BARRENS]),
          }
        },
        influence: {
          'The Academy': int(c[COL.INF_ACADEMY]) || 0,
          'The Harbour': int(c[COL.INF_HARBOUR]) || 0,
          'The Docklands': int(c[COL.INF_DOCKLANDS]) || 0,
          'The Second City': int(c[COL.INF_SECOND_CITY]) || 0,
          'The Shore': int(c[COL.INF_SHORE]) || 0,
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
