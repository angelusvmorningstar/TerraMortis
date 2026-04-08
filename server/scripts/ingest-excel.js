#!/usr/bin/env node

/**
 * Excel-to-v3 Direct Ingestion Pipeline.
 *
 * Reads the Excel character master workbook, merges with existing MongoDB
 * character data, and produces v3-schema characters validated before insert.
 *
 * Usage: cd server && node scripts/ingest-excel.js [options]
 *   --dry-run   Validate and log without writing to database
 *   --json      Write validated v3 characters to data/chars_v3.json
 *   --file=PATH Path to Excel workbook (default: ../Terra Mortis Character Master (v3.0).xlsx)
 *   --confirm   Skip interactive confirmation prompt
 *
 * Requires MONGODB_URI in .env for database access.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import Ajv from 'ajv';
import { characterSchema } from '../schemas/character.schema.js';

// ── CLI flags ──

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const JSON_OUT = args.includes('--json');
const CONFIRM = args.includes('--confirm');
const FILE_ARG = args.find(a => a.startsWith('--file='));
const EXCEL_PATH = FILE_ARG
  ? FILE_ARG.slice(7)
  : new URL('../../Terra Mortis Character Master (v3.0).xlsx', import.meta.url).pathname;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

// ── Excel cell position constants (ported from migrate-points.js) ──

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
const MERIT_ROW_START = 78;
const MAN_ROW_START = 100;
const INFL_ROW_START = 137;
const MCI_ROW = 159;
const PT_ROW = 160;

// ── Helpers ──

function num(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return 0;
  const v = typeof cell.v === 'number' ? cell.v : parseInt(cell.v, 10);
  return isNaN(v) ? 0 : v;
}

function readPoints(ws, row) {
  return { cp: num(ws, row, 11), free: num(ws, row, 12), xp: num(ws, row, 13) };
}

function parseMeritSlot(raw) {
  if (!raw || raw === '¬') return null;
  const dotMatch = raw.match(/[●]+/);
  const dots = dotMatch ? dotMatch[0].length : 0;
  const parts = raw.replace(/[●○]+/g, '').split('|').map(s => s.trim()).filter(Boolean);
  return { name: parts[0] || '', dots, qualifier: parts[1] || null };
}

function slugify(str) {
  return (str || '').toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findSheetName(charName, sheetMap) {
  const firstName = charName.split(' ')[0].replace(/'/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let sn = sheetMap[firstName];
  if (sn) return sn;
  const nick = charName.match(/'([^']+)'/)?.[1];
  if (nick) { sn = sheetMap[nick]; if (sn) return sn; }
  for (const [key, val] of Object.entries(sheetMap)) {
    if (charName.toLowerCase().includes(key.toLowerCase())) return val;
  }
  const parts = charName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ');
  if (parts.length >= 2) {
    sn = sheetMap[parts[0] + ' ' + parts[1].charAt(0)];
    if (sn) return sn;
  }
  return null;
}

// ── Build v3 character from Excel + existing DB data ──

function buildCharacter(charWs, dataWs, dataRow, existing, rulesMap) {
  // Start from existing DB character or empty shell
  const c = existing ? JSON.parse(JSON.stringify(existing)) : {};
  delete c._id; // Remove MongoDB _id for re-insert

  // ── Identity from Character Data sheet (only if not from DB) ──
  if (!c.name) {
    c.name = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 5 })]?.v || 'Unknown';
  }

  // ── Attributes: v3 inline { dots, bonus, cp, xp, free, rule_key } ──
  if (!c.attributes) c.attributes = {};
  for (const [attr, row] of Object.entries(ATTR_ROWS)) {
    const pts = readPoints(charWs, row);
    const existing_attr = c.attributes[attr] || { dots: 1, bonus: 0 };
    const isClan = c.clan_attribute === attr;
    const free = 1 + (isClan ? 1 : 0);
    const base = pts.cp + free;
    c.attributes[attr] = {
      dots: base + Math.floor((pts.xp || 0) / 4),
      bonus: existing_attr.bonus || 0,
      cp: pts.cp, xp: pts.xp, free,
      rule_key: rulesMap.get(`attribute:${slugify(attr)}`) || null,
    };
  }

  // ── Skills: v3 inline { dots, bonus, specs, nine_again, cp, xp, free, rule_key } ──
  if (!c.skills) c.skills = {};
  for (const [skill, row] of Object.entries(SKILL_ROWS)) {
    const pts = readPoints(charWs, row);
    const existing_skill = c.skills[skill];
    const base = pts.cp + pts.free;
    const dots = base + Math.floor((pts.xp || 0) / 2);
    if (dots > 0 || existing_skill) {
      c.skills[skill] = {
        dots, bonus: existing_skill?.bonus || 0,
        specs: existing_skill?.specs || [], nine_again: existing_skill?.nine_again || false,
        cp: pts.cp, xp: pts.xp, free: pts.free,
        rule_key: rulesMap.get(`skill:${slugify(skill)}`) || null,
      };
    }
  }

  // ── Disciplines: v3 { dots, cp, xp, free, rule_key } objects ──
  if (!c.disciplines) c.disciplines = {};
  for (const [disc, row] of Object.entries(DISC_ROWS)) {
    const pts = readPoints(charWs, row);
    if (pts.cp || pts.free || pts.xp) {
      const base = pts.cp + pts.free;
      c.disciplines[disc] = {
        dots: base + Math.floor((pts.xp || 0) / 3), // approximate — actual rate depends on clan
        cp: pts.cp, xp: pts.xp, free: pts.free,
        rule_key: null, // discipline names aren't in purchasable_powers
      };
    }
  }

  // ── Merits: apply Excel points inline on existing merits ──
  const merits = c.merits || [];
  const ZERO_MC = { cp: 0, xp: 0, free: 0, free_mci: 0, free_vm: 0, free_lk: 0, free_ohm: 0, free_inv: 0, free_pt: 0, free_mdb: 0 };

  // Ensure all merits have inline fields
  for (const m of merits) {
    for (const [k, v] of Object.entries(ZERO_MC)) {
      if (m[k] === undefined) m[k] = v;
    }
    if (m.rule_key === undefined) m.rule_key = rulesMap.get(`merit:${slugify(m.name)}`) || null;
  }

  // Read merit names from Character Data (cols 114-143)
  let genSlotIdx = 0, manSlotIdx = 0;
  const matched = new Set();

  for (let col = 114; col <= 143; col++) {
    const raw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: col })]?.v || '';
    const parsed = parseMeritSlot(raw);
    if (!parsed) continue;

    const isManoeuvre = merits.some(m => m.category === 'manoeuvre' && m.name === parsed.name);

    if (isManoeuvre) {
      const match = merits.find(m =>
        m.category === 'manoeuvre' && m.name === parsed.name && !matched.has(merits.indexOf(m))
      );
      if (match) {
        const pts = readPoints(charWs, MAN_ROW_START + manSlotIdx);
        Object.assign(match, { cp: pts.cp, xp: pts.xp, free: pts.free });
        matched.add(merits.indexOf(match));
      }
      manSlotIdx++;
    } else {
      const match = merits.find(m =>
        m.category === 'general' && m.name === parsed.name && !matched.has(merits.indexOf(m))
      );
      if (match) {
        const pts = readPoints(charWs, MERIT_ROW_START + genSlotIdx);
        Object.assign(match, { cp: pts.cp, xp: pts.xp, free: pts.free });
        matched.add(merits.indexOf(match));
      }
      genSlotIdx++;
    }
  }

  // Influence merits (cols 176-195 names, 196-215 areas)
  const inflPool = merits.filter(m => m.category === 'influence').slice();
  for (let i = 0; i < 20; i++) {
    const nameRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 176 + i })]?.v || '';
    const areaRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 196 + i })]?.v || '';
    if (!nameRaw || nameRaw === '¬') continue;
    const meritType = nameRaw.trim();
    const area = (areaRaw && areaRaw !== '¬') ? areaRaw.trim() : '';

    const match = inflPool.find(m => {
      if (m.name !== meritType) return false;
      if (!area) return true;
      const mArea = m.area || m.qualifier || '';
      return mArea.toLowerCase().includes(area.toLowerCase()) || area.toLowerCase().includes(mArea.toLowerCase());
    });
    if (match) {
      const pts = readPoints(charWs, INFL_ROW_START + i);
      Object.assign(match, { cp: pts.cp, xp: pts.xp, free: pts.free });
      inflPool.splice(inflPool.indexOf(match), 1);
    }
  }

  // Domain merits
  for (const dm of merits.filter(m => m.category === 'domain')) {
    const row = DOMAIN_ROWS[dm.name];
    if (!row) continue;
    const pts = readPoints(charWs, row);
    Object.assign(dm, { cp: pts.cp, xp: pts.xp, free: pts.free });
  }

  // Standing merits (MCI, PT)
  for (const sm of merits.filter(m => m.category === 'standing')) {
    const row = sm.name === 'Mystery Cult Initiation' ? MCI_ROW : sm.name === 'Professional Training' ? PT_ROW : null;
    if (!row) continue;
    const pts = readPoints(charWs, row);
    Object.assign(sm, { cp: pts.cp, xp: pts.xp, free: pts.free });
  }

  c.merits = merits;

  // ── Fighting styles: set rule_key ──
  for (const fs of (c.fighting_styles || [])) {
    if (fs.rule_key === undefined) fs.rule_key = rulesMap.get(`manoeuvre:${slugify(fs.name)}`) || null;
  }

  // ── Powers: set rule_key ──
  for (const p of (c.powers || [])) {
    if (p.rule_key !== undefined) continue;
    const slug = slugify(p.name);
    switch (p.category) {
      case 'discipline': p.rule_key = rulesMap.get(`discipline:${slug}`) || null; break;
      case 'devotion': p.rule_key = rulesMap.get(`devotion:devotion-${slug}`) || null; break;
      case 'rite': p.rule_key = rulesMap.get(`rite:rite-${slug}`) || null; break;
      default: p.rule_key = null;
    }
  }

  // ── XP log from Excel ──
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  c.xp_log.spent = {
    attributes: num(charWs, 7, 13),
    skills: num(charWs, 8, 13),
    merits: num(charWs, 9, 13),
    powers: num(charWs, 10, 13),
    special: num(charWs, 11, 13),
  };

  // Remove old parallel fields if present
  delete c.attr_creation; delete c.skill_creation; delete c.disc_creation; delete c.merit_creation;

  return c;
}

// ── Main ──

async function main() {
  console.log(`Excel-to-v3 Ingestion${DRY_RUN ? ' (DRY RUN)' : ''}${JSON_OUT ? ' (JSON output)' : ''}`);

  // Check Excel file
  if (!existsSync(EXCEL_PATH)) {
    console.error(`Excel file not found: ${EXCEL_PATH}`);
    process.exit(1);
  }
  console.log(`Reading: ${EXCEL_PATH}`);
  const wb = XLSX.readFile(EXCEL_PATH);

  // Connect to MongoDB
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db('tm_suite_dev');

  // Build rule_key lookup from purchasable_powers
  const rules = await db.collection('purchasable_powers').find({}).toArray();
  const rulesMap = new Map();
  for (const r of rules) {
    rulesMap.set(`${r.category}:${r.key}`, r.key);
  }
  console.log(`Loaded ${rules.length} purchasable_powers for rule_key lookup`);

  // Load existing characters from database
  const existingChars = await db.collection('characters').find({}).toArray();
  const existingMap = new Map();
  for (const c of existingChars) existingMap.set(c.name, c);
  console.log(`Loaded ${existingChars.length} existing characters from database`);

  // Build Excel sheet name lookup
  const dataWs = wb.Sheets['Character Data'];
  if (!dataWs) { console.error('No "Character Data" sheet found'); process.exit(1); }
  const sheetMap = {};
  for (const sn of wb.SheetNames) {
    const match = sn.match(/^([^(]+)/);
    if (match) sheetMap[match[1].trim()] = sn;
  }

  // Build Character Data row lookup (name in column F = index 5)
  const dataRowMap = {};
  for (let r = 1; r <= 40; r++) {
    const name = dataWs[XLSX.utils.encode_cell({ r, c: 5 })]?.v || '';
    if (name) dataRowMap[name] = r;
  }
  console.log(`Excel: ${Object.keys(dataRowMap).length} characters in Character Data sheet\n`);

  // Set up schema validation
  const ajv = new Ajv({ allErrors: true });
  const schemaForValidation = { ...characterSchema };
  delete schemaForValidation.$schema;
  const validate = ajv.compile(schemaForValidation);

  // Process each character
  const results = [];
  let matchCount = 0, skipCount = 0;
  let ruleKeyHits = 0, ruleKeyMisses = 0;

  for (const [charName, dataRow] of Object.entries(dataRowMap)) {
    const sheetName = findSheetName(charName, sheetMap);
    if (!sheetName || !wb.Sheets[sheetName]) {
      console.log(`  SKIP: ${charName} — no individual sheet found`);
      skipCount++;
      continue;
    }

    const existing = existingMap.get(charName) || null;
    if (!existing) console.log(`  WARN: ${charName} — not in database (building from Excel only)`);

    const c = buildCharacter(wb.Sheets[sheetName], dataWs, dataRow, existing, rulesMap);

    // Count rule_key stats
    for (const a of Object.values(c.attributes || {})) { if (a.rule_key) ruleKeyHits++; else ruleKeyMisses++; }
    for (const s of Object.values(c.skills || {})) { if (s.rule_key) ruleKeyHits++; else ruleKeyMisses++; }
    for (const m of (c.merits || [])) { if (m.rule_key) ruleKeyHits++; else ruleKeyMisses++; }
    for (const p of (c.powers || [])) { if (p.rule_key) ruleKeyHits++; else ruleKeyMisses++; }

    // Validate
    const { _id, ...docForValidation } = c;
    if (!validate(docForValidation)) {
      const errors = validate.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
      console.error(`  ✗ ${charName} — VALIDATION FAILED: ${errors}`);
      console.error('    Aborting — no documents written.');
      await client.close();
      process.exit(1);
    }

    const meritCount = (c.merits || []).length;
    const discCount = Object.keys(c.disciplines || {}).length;
    const powerCount = (c.powers || []).length;
    console.log(`  ✓ ${charName} → ${sheetName} (${meritCount} merits, ${discCount} discs, ${powerCount} powers)`);

    results.push(c);
    matchCount++;
  }

  // Include DB-only characters (exist in DB but not in Excel)
  for (const [name, existing] of existingMap) {
    if (!Object.keys(dataRowMap).some(n => n === name || findSheetName(name, sheetMap))) {
      // Check if we already processed this character
      if (!results.some(c => c.name === name)) {
        const copy = JSON.parse(JSON.stringify(existing));
        delete copy._id;
        results.push(copy);
        console.log(`  + ${name} — preserved from database (not in Excel)`);
      }
    }
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`Characters: ${matchCount} from Excel, ${skipCount} skipped, ${results.length} total`);
  console.log(`Rule keys: ${ruleKeyHits} resolved, ${ruleKeyMisses} null`);

  // Output
  if (JSON_OUT) {
    const outPath = new URL('../../data/chars_v3.json', import.meta.url).pathname;
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\nWrote ${results.length} characters to ${outPath}`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — no database changes.');
    await client.close();
    return;
  }

  // Confirmation prompt
  if (!CONFIRM) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question(`\n⚠️  This will DROP and re-insert ${results.length} characters in tm_suite_dev. Type YES to proceed: `, resolve);
    });
    rl.close();
    if (answer !== 'YES') { console.log('Aborted.'); await client.close(); return; }
  }

  // Write to database
  const col = db.collection('characters');
  await col.deleteMany({});
  if (results.length) await col.insertMany(results);
  console.log(`\n✅ Inserted ${results.length} characters into tm_suite_dev.characters`);

  await client.close();
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
