#!/usr/bin/env node

/**
 * Migrate point allocations (CP, Free, XP) from the Excel character master
 * into the v2 character JSON and MongoDB.
 *
 * Usage: cd server && node ../scripts/migrate-points.js
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

const DOMAIN_ROWS = {
  'Safe Place': 131, Haven: 132, 'Feeding Grounds': 133, Herd: 134,
};

const MERIT_START_ROW = 78;
const INFLUENCE_START_ROW = 137;
const MCI_ROW = 159;
const PT_ROW = 160;

function num(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return 0;
  const v = typeof cell.v === 'number' ? cell.v : parseInt(cell.v, 10);
  return isNaN(v) ? 0 : v;
}

function readPoints(ws, row) {
  return { cp: num(ws, row, 11), free: num(ws, row, 12), xp: num(ws, row, 13) };
}

function processCharacter(ws, char) {
  // Attributes
  char.attr_creation = {};
  for (const [attr, row] of Object.entries(ATTR_ROWS)) {
    const pts = readPoints(ws, row);
    char.attr_creation[attr] = pts;
  }

  // Skills
  char.skill_creation = {};
  for (const [skill, row] of Object.entries(SKILL_ROWS)) {
    const pts = readPoints(ws, row);
    char.skill_creation[skill] = pts;
  }

  // Disciplines
  char.disc_creation = {};
  for (const [disc, row] of Object.entries(DISC_ROWS)) {
    const pts = readPoints(ws, row);
    if (pts.cp || pts.free || pts.xp) {
      char.disc_creation[disc] = pts;
    }
  }

  // Merits — build merit_creation array matching merits array index
  const merits = char.merits || [];
  char.merit_creation = merits.map(() => ({ cp: 0, free: 0, xp: 0 }));

  // General merits (rows 78-97)
  const genMerits = merits.filter(m => m.category === 'general');
  for (let i = 0; i < Math.min(20, genMerits.length); i++) {
    const pts = readPoints(ws, MERIT_START_ROW + i);
    const mIdx = merits.indexOf(genMerits[i]);
    if (mIdx >= 0) char.merit_creation[mIdx] = pts;
  }

  // Influence merits (rows 137-156)
  const inflMerits = merits.filter(m => m.category === 'influence');
  for (let i = 0; i < Math.min(20, inflMerits.length); i++) {
    const pts = readPoints(ws, INFLUENCE_START_ROW + i);
    const mIdx = merits.indexOf(inflMerits[i]);
    if (mIdx >= 0) char.merit_creation[mIdx] = pts;
  }

  // Domain merits
  for (const dm of merits.filter(m => m.category === 'domain')) {
    const row = DOMAIN_ROWS[dm.name];
    if (!row) continue;
    const mIdx = merits.indexOf(dm);
    if (mIdx >= 0) char.merit_creation[mIdx] = readPoints(ws, row);
  }

  // Standing merits (MCI, PT)
  for (const sm of merits.filter(m => m.category === 'standing')) {
    const row = sm.name === 'Mystery Cult Initiation' ? MCI_ROW : sm.name === 'Professional Training' ? PT_ROW : null;
    if (!row) continue;
    const mIdx = merits.indexOf(sm);
    if (mIdx >= 0) char.merit_creation[mIdx] = readPoints(ws, row);
  }

  // XP log
  if (!char.xp_log) char.xp_log = { earned: {}, spent: {} };
  char.xp_log.spent = {
    attributes: num(ws, 7, 13),
    skills: num(ws, 8, 13),
    merits: num(ws, 9, 13),
    powers: num(ws, 10, 13),
    special: num(ws, 11, 13),
  };

  return char;
}

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const chars = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

  // Map first names / nicknames to sheet names
  const sheetMap = {};
  for (const sn of wb.SheetNames) {
    const match = sn.match(/^([^(]+)/);
    if (match) sheetMap[match[1].trim()] = sn;
  }

  let matched = 0, skipped = 0;

  for (const char of chars) {
    const firstName = char.name.split(' ')[0].replace(/'/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let sheetName = sheetMap[firstName];

    // Try nickname: "Casamir 'Cazz'" → "Cazz"
    if (!sheetName) {
      const nick = char.name.match(/'([^']+)'/)?.[1];
      if (nick) sheetName = sheetMap[nick];
    }
    // Try "Yusuf 'Mammon'" → "Mammon"
    if (!sheetName) {
      for (const [key, val] of Object.entries(sheetMap)) {
        if (char.name.toLowerCase().includes(key.toLowerCase())) {
          sheetName = val;
          break;
        }
      }
    }
    // Try "René Meyer" → "Rene M", "René St. Dominique" → "Rene St"
    if (!sheetName) {
      const parts = char.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ');
      if (parts.length >= 2) {
        const tryKey = parts[0] + ' ' + parts[1].charAt(0) + (parts[1].endsWith('.') ? '' : '');
        sheetName = sheetMap[tryKey];
        // Also try with full second word start
        if (!sheetName) {
          const tryKey2 = parts[0] + ' ' + parts[1].replace('.', '');
          sheetName = sheetMap[tryKey2];
        }
      }
    }

    if (!sheetName || !wb.Sheets[sheetName]) {
      console.log(`SKIP: ${char.name} — no matching sheet`);
      skipped++;
      continue;
    }

    processCharacter(wb.Sheets[sheetName], char);
    matched++;
    console.log(`OK: ${char.name} → ${sheetName}`);
  }

  // Write updated JSON
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
      const result = await col.insertMany(chars);
      console.log(`MongoDB: inserted ${result.insertedCount} characters with point allocations`);
    } finally {
      await client.close();
    }
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
