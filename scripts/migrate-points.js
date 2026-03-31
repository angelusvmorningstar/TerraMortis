#!/usr/bin/env node

/**
 * Migrate point allocations (CP, Free, XP) from the Excel character master.
 * Matches merits by NAME (from Character Data sheet) not slot position.
 *
 * Usage: node scripts/migrate-points.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const EXCEL_PATH = path.join(ROOT, 'Terra Mortis Character Master (v3.0).xlsx');
const JSON_PATH = path.join(ROOT, 'data', 'chars_v2.json');

// Row positions in each character sheet (0-indexed)
const ATTR_ROWS = {
  Intelligence: 25, Wits: 26, Resolve: 27,
  Strength: 30, Dexterity: 31, Stamina: 32,
  Presence: 35, Manipulation: 36, Composure: 37,
};
const SKILL_ROWS = {
  Academics: 41, Computer: 42, Crafts: 43, Investigation: 44,
  Medicine: 45, Occult: 46, Politics: 47, Science: 48,
  Athletics: 51, Brawl: 52, Drive: 53, Firearms: 54,
  Larceny: 55, Stealth: 56, Survival: 57, Weaponry: 58,
  'Animal Ken': 61, Empathy: 62, Expression: 63, Intimidation: 64,
  Persuasion: 65, Socialise: 66, Streetwise: 67, Subterfuge: 68,
};
const DISC_ROWS = {
  Animalism: 164, Auspex: 165, Celerity: 166, Dominate: 167,
  Majesty: 168, Nightmare: 169, Obfuscate: 170, Protean: 171,
  Resilience: 172, Vigour: 173,
  Cruac: 183, Theban: 184,
  Creation: 186, Destruction: 187, Divination: 188,
  Protection: 189, Transmutation: 190,
};
const DOMAIN_ROWS = { 'Safe Place': 131, Haven: 132, 'Feeding Grounds': 133, Herd: 134 };
const MERIT_ROW_START = 78;    // rows 79-98 (general merits, 20 slots)
const MAN_ROW_START = 100;     // rows 101-120 (manoeuvres, 20 slots)
const INFL_ROW_START = 137;    // rows 138-157 (influence merits, 20 slots)
const MCI_ROW = 159;
const PT_ROW = 160;

// Clan discipline mapping for XP rate calculation
const CLAN_DISCS = {
  Daeva: ['Celerity', 'Majesty', 'Vigour'],
  Gangrel: ['Animalism', 'Protean', 'Resilience'],
  Mekhet: ['Auspex', 'Celerity', 'Obfuscate'],
  Nosferatu: ['Nightmare', 'Obfuscate', 'Vigour'],
  Ventrue: ['Animalism', 'Dominate', 'Resilience'],
};

function num(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return 0;
  const v = typeof cell.v === 'number' ? cell.v : parseInt(cell.v, 10);
  return isNaN(v) ? 0 : v;
}

function readPoints(ws, row) {
  return { cp: num(ws, row, 11), free: num(ws, row, 12), xp: num(ws, row, 13) };
}

/** Parse a merit slot from Character Data: "Crusade ●● | Silence" → { name, dots, qualifier } */
function parseMeritSlot(raw) {
  if (!raw || raw === '¬') return null;
  // Strip dots (● characters) and extract count
  const dotMatch = raw.match(/[●]+/);
  const dots = dotMatch ? dotMatch[0].length : 0;
  // Split on | for rank_name
  const parts = raw.replace(/[●○]+/g, '').split('|').map(s => s.trim()).filter(Boolean);
  const name = parts[0] || '';
  const qualifier = parts[1] || null;
  return { name, dots, qualifier };
}

function findSheetName(charName, sheetMap) {
  const firstName = charName.split(' ')[0].replace(/'/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let sn = sheetMap[firstName];
  if (sn) return sn;

  // Try nickname
  const nick = charName.match(/'([^']+)'/)?.[1];
  if (nick) { sn = sheetMap[nick]; if (sn) return sn; }

  // Try contains match
  for (const [key, val] of Object.entries(sheetMap)) {
    if (charName.toLowerCase().includes(key.toLowerCase())) return val;
  }

  // Try "René Meyer" → "Rene M"
  const parts = charName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ');
  if (parts.length >= 2) {
    sn = sheetMap[parts[0] + ' ' + parts[1].charAt(0)];
    if (sn) return sn;
    sn = sheetMap[parts[0] + ' ' + parts[1].replace('.', '')];
    if (sn) return sn;
  }

  return null;
}

function processCharacter(charWs, dataWs, dataRow, char) {
  // ── Attributes ──
  char.attr_creation = {};
  for (const [attr, row] of Object.entries(ATTR_ROWS)) {
    char.attr_creation[attr] = readPoints(charWs, row);
  }

  // ── Skills ──
  char.skill_creation = {};
  for (const [skill, row] of Object.entries(SKILL_ROWS)) {
    char.skill_creation[skill] = readPoints(charWs, row);
  }

  // ── Disciplines ──
  char.disc_creation = {};
  for (const [disc, row] of Object.entries(DISC_ROWS)) {
    const pts = readPoints(charWs, row);
    if (pts.cp || pts.free || pts.xp) char.disc_creation[disc] = pts;
  }

  // ── Merits: read names from Character Data, points from individual sheet ──
  const merits = char.merits || [];
  char.merit_creation = merits.map(() => ({ cp: 0, free: 0, xp: 0 }));

  // Read all merit names from Character Data (cols 114-143 = Merit 1-30)
  let genSlotIdx = 0;  // tracks which general merit row to read
  let manSlotIdx = 0;  // tracks which manoeuvre row to read

  for (let c = 114; c <= 143; c++) {
    const raw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c })]?.v || '';
    const parsed = parseMeritSlot(raw);
    if (!parsed) continue;

    // Find matching v2 merit by name
    // For manoeuvres, also match by qualifier (rank_name)
    const isManoeuvre = merits.some(m => m.category === 'manoeuvre' && m.name === parsed.name);

    if (isManoeuvre) {
      // Match by name + rating (dots)
      const match = merits.find(m =>
        m.category === 'manoeuvre' && m.name === parsed.name && m.rating === parsed.dots
      );
      if (match) {
        const mIdx = merits.indexOf(match);
        char.merit_creation[mIdx] = readPoints(charWs, MAN_ROW_START + manSlotIdx);
      }
      manSlotIdx++;
    } else {
      // General merit — match by name
      const match = merits.find(m =>
        m.category === 'general' && m.name === parsed.name &&
        !char.merit_creation[merits.indexOf(m)]._matched
      );
      if (match) {
        const mIdx = merits.indexOf(match);
        const pts = readPoints(charWs, MERIT_ROW_START + genSlotIdx);
        char.merit_creation[mIdx] = pts;
        char.merit_creation[mIdx]._matched = true;
      }
      genSlotIdx++;
    }
  }

  // Clean up _matched flags
  char.merit_creation.forEach(mc => delete mc._matched);

  // ── Influence merits: read from Character Data cols 176+ and individual sheet rows 138+ ──
  const inflMerits = merits.filter(m => m.category === 'influence');
  for (let i = 0; i < 20; i++) {
    const nameRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 176 + i })]?.v || '';
    const areaRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 196 + i })]?.v || '';
    if (!nameRaw || nameRaw === '¬') continue;

    // Extract merit type name (e.g., "Allies" from "Allies")
    const meritType = nameRaw.trim();
    const area = (areaRaw && areaRaw !== '¬') ? areaRaw.trim() : '';

    // Match to v2 influence merit by type + area
    const match = inflMerits.find(m => {
      if (m.name !== meritType) return false;
      if (!area) return true;
      const mArea = m.area || m.qualifier || '';
      return mArea.toLowerCase().includes(area.toLowerCase()) || area.toLowerCase().includes(mArea.toLowerCase());
    });

    if (match) {
      const mIdx = merits.indexOf(match);
      char.merit_creation[mIdx] = readPoints(charWs, INFL_ROW_START + i);
      // Remove from inflMerits so we don't double-match
      inflMerits.splice(inflMerits.indexOf(match), 1);
    }
  }

  // ── Domain merits ──
  for (const dm of merits.filter(m => m.category === 'domain')) {
    const row = DOMAIN_ROWS[dm.name];
    if (!row) continue;
    const mIdx = merits.indexOf(dm);
    char.merit_creation[mIdx] = readPoints(charWs, row);
  }

  // ── Standing merits (MCI, PT) ──
  for (const sm of merits.filter(m => m.category === 'standing')) {
    const row = sm.name === 'Mystery Cult Initiation' ? MCI_ROW : sm.name === 'Professional Training' ? PT_ROW : null;
    if (!row) continue;
    const mIdx = merits.indexOf(sm);
    char.merit_creation[mIdx] = readPoints(charWs, row);
  }

  // ── XP log ──
  if (!char.xp_log) char.xp_log = { earned: {}, spent: {} };
  char.xp_log.spent = {
    attributes: num(charWs, 7, 13),
    skills: num(charWs, 8, 13),
    merits: num(charWs, 9, 13),
    powers: num(charWs, 10, 13),
    special: num(charWs, 11, 13),
  };

  return char;
}

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const chars = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
  const dataWs = wb.Sheets['Character Data'];

  // Build sheet name lookup
  const sheetMap = {};
  for (const sn of wb.SheetNames) {
    const match = sn.match(/^([^(]+)/);
    if (match) sheetMap[match[1].trim()] = sn;
  }

  // Build character name → Character Data row lookup
  const dataRowMap = {};
  for (let r = 1; r <= 31; r++) {
    const name = dataWs[XLSX.utils.encode_cell({ r, c: 5 })]?.v || '';
    if (name) dataRowMap[name] = r;
  }

  let matched = 0, skipped = 0;

  for (const char of chars) {
    const sheetName = findSheetName(char.name, sheetMap);
    if (!sheetName || !wb.Sheets[sheetName]) {
      console.log(`SKIP: ${char.name} — no sheet`);
      skipped++;
      continue;
    }

    // Find data row
    let dataRow = dataRowMap[char.name];
    if (!dataRow) {
      // Fuzzy match
      for (const [n, r] of Object.entries(dataRowMap)) {
        if (n.includes(char.name.split(' ')[0]) || char.name.includes(n.split(' ')[0])) {
          dataRow = r;
          break;
        }
      }
    }
    if (!dataRow) {
      console.log(`SKIP: ${char.name} — no data row`);
      skipped++;
      continue;
    }

    processCharacter(wb.Sheets[sheetName], dataWs, dataRow, char);
    matched++;
    console.log(`OK: ${char.name} → ${sheetName}`);
  }

  // Write JSON
  fs.writeFileSync(JSON_PATH, JSON.stringify(chars, null, 2));
  console.log(`\nUpdated ${JSON_PATH}: ${matched} matched, ${skipped} skipped`);

  // Update MongoDB
  const { MongoClient } = require(require.resolve('mongodb', { paths: [path.join(ROOT, 'server', 'node_modules')] }));
  require(require.resolve('dotenv', { paths: [path.join(ROOT, 'server', 'node_modules')] })).config({ path: path.join(ROOT, '.env') });
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    try {
      await client.connect();
      const col = client.db('tm_suite').collection('characters');
      await col.deleteMany({});
      await col.insertMany(chars);
      console.log(`MongoDB: inserted ${chars.length} characters`);
    } finally {
      await client.close();
    }
  }
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
