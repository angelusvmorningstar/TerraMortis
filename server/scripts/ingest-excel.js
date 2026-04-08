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
  const c = existing ? JSON.parse(JSON.stringify(existing)) : {
    name: 'Unknown', player: null, clan: null, bloodline: null, covenant: null,
    mask: null, dirge: null, court_title: null, concept: null, pronouns: null,
    apparent_age: null, honorific: null, moniker: null, features: null, retired: false,
    blood_potency: 1, humanity: 7, humanity_base: 7,
    status: { city: 0, clan: 0, covenant: 0 }, covenant_standings: {},
    attributes: {}, skills: {}, disciplines: {},
    merits: [], powers: [], fighting_styles: [], fighting_picks: [],
    touchstones: [], banes: [], ordeals: [],
    willpower: {}, aspirations: [],
    xp_log: { earned: {}, spent: {} },
  };
  delete c._id;

  // ── Identity from Character Data sheet headers ──
  // Scan header row to discover columns, then read values for this character
  const ID_MAP = {
    'Name': 'name', 'Character Name': 'name',
    'Player': 'player', 'Player Name': 'player',
    'Clan': 'clan', 'Bloodline': 'bloodline',
    'Covenant': 'covenant', 'Mask': 'mask', 'Dirge': 'dirge',
    'Concept': 'concept', 'Pronouns': 'pronouns', 'Apparent Age': 'apparent_age',
    'Honorific': 'honorific', 'Moniker': 'moniker', 'Court Title': 'court_title',
    'Blood Potency': 'blood_potency', 'BP': 'blood_potency',
    'Humanity': 'humanity', 'Hum': 'humanity', 'Humanity Base': 'humanity_base',
  };
  const INT_FIELDS = new Set(['blood_potency', 'humanity', 'humanity_base']);
  for (let col = 0; col < 250; col++) {
    const header = dataWs[XLSX.utils.encode_cell({ r: 0, c: col })]?.v;
    if (!header) continue;
    const field = ID_MAP[String(header).trim()];
    if (!field) continue;
    const raw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: col })]?.v;
    if (raw == null || raw === '' || raw === '\u00AC') continue;
    c[field] = INT_FIELDS.has(field) ? (parseInt(raw, 10) || 0) : String(raw).trim();
  }
  if (!c.name) c.name = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 5 })]?.v || 'Unknown';

  // ── Status (city/clan/covenant + cross-covenant standings) ──
  // Cols 83-85: City/Clan/Covenant status (numeric)
  // Cols 86-93: Covenant standings pairs (name + dot string)
  const _numCell = (col) => { const v = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: col })]?.v; return typeof v === 'number' ? v : parseInt(v, 10) || 0; };
  const _strCell = (col) => { const v = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: col })]?.v; return (v && v !== '¬' && v !== '-') ? String(v).trim() : null; };
  const _dotCount = (str) => str ? (str.match(/●/g) || []).length : 0;

  if (!c.status) c.status = {};
  const cityS = _numCell(83), clanS = _numCell(84), covS = _numCell(85);
  if (cityS) c.status.city = cityS;
  if (clanS) c.status.clan = clanS;
  if (covS) c.status.covenant = covS;

  if (!c.covenant_standings) c.covenant_standings = {};
  for (let i = 0; i < 4; i++) {
    const covName = _strCell(86 + i * 2);
    const covDots = _strCell(87 + i * 2);
    if (covName && covDots) {
      const dots = _dotCount(covDots);
      if (dots > 0) c.covenant_standings[covName] = dots;
    }
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

  // ── Touchstones from Character Data (cols 104-113 = Humanity 10 down to 1) ──
  // Format: "● (Name)" = active touchstone, "○" = empty slot, "○ (Name)" = lost touchstone
  if (!c.touchstones) c.touchstones = [];
  if (!c.touchstones.length) {
    for (let col = 104; col <= 113; col++) {
      const humLevel = 114 - col; // col 104 = Humanity 10, col 113 = Humanity 1
      const raw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: col })]?.v;
      if (!raw || raw === '¬') continue;
      const nameMatch = raw.match(/\((.+)\)\s*$/);
      if (nameMatch) {
        c.touchstones.push({ humanity: humLevel, name: nameMatch[1].trim() });
      }
    }
  }

  // ── Skill specialisations from Character Data (cols 59-82) ──
  const SPEC_COLS = {
    Academics: 59, Computer: 60, Crafts: 61, Investigation: 62,
    Medicine: 63, Occult: 64, Politics: 65, Science: 66,
    Athletics: 67, Brawl: 68, Drive: 69, Firearms: 70,
    Larceny: 71, Stealth: 72, Survival: 73, Weaponry: 74,
    'Animal Ken': 75, Empathy: 76, Expression: 77, Intimidation: 78,
    Persuasion: 79, Socialise: 80, Streetwise: 81, Subterfuge: 82,
  };
  const _specMap = {};
  for (const [skill, col] of Object.entries(SPEC_COLS)) {
    const raw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: col })]?.v;
    if (raw && raw !== '¬' && raw !== '-') {
      _specMap[skill] = String(raw).split(',').map(s => s.trim()).filter(Boolean);
    }
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
        specs: _specMap[skill] || existing_skill?.specs || [], nine_again: existing_skill?.nine_again || false,
        cp: pts.cp, xp: pts.xp, free: pts.free,
        rule_key: rulesMap.get(`skill:${slugify(skill)}`) || null,
      };
    }
  }

  // ── Infer attribute and skill priorities from CP totals ──
  const ATTR_CATS = {
    Mental: ['Intelligence', 'Wits', 'Resolve'],
    Physical: ['Strength', 'Dexterity', 'Stamina'],
    Social: ['Presence', 'Manipulation', 'Composure'],
  };
  const SKILL_CATS = {
    Mental: ['Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science'],
    Physical: ['Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry'],
    Social: ['Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge'],
  };
  const ATTR_PRI = { 5: 'Primary', 4: 'Secondary', 3: 'Tertiary' };
  const SKILL_PRI = { 11: 'Primary', 7: 'Secondary', 4: 'Tertiary' };

  function inferPriority(cats, obj, priMap) {
    const totals = {};
    for (const [cat, names] of Object.entries(cats)) {
      totals[cat] = names.reduce((s, n) => s + (obj[n]?.cp || 0), 0);
    }
    // Sort categories by CP descending, assign priorities in order
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const pris = ['Primary', 'Secondary', 'Tertiary'];
    const result = {};
    // Try exact match first
    let exactMatch = true;
    for (const [cat, total] of Object.entries(totals)) {
      if (priMap[total]) result[cat] = priMap[total];
      else exactMatch = false;
    }
    if (exactMatch && new Set(Object.values(result)).size === 3) return result;
    // Fallback: rank by CP spent
    sorted.forEach(([cat], i) => { result[cat] = pris[i]; });
    return result;
  }

  c.attribute_priorities = c.attribute_priorities || inferPriority(ATTR_CATS, c.attributes, ATTR_PRI);
  c.skill_priorities = c.skill_priorities || inferPriority(SKILL_CATS, c.skills, SKILL_PRI);

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
  // Create merit objects if they don't exist on the character
  let genSlotIdx = 0, manSlotIdx = 0;
  const matched = new Set();

  for (let col = 114; col <= 143; col++) {
    const raw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: col })]?.v || '';
    const parsed = parseMeritSlot(raw);
    if (!parsed || !parsed.name) continue;

    const isManoeuvre = merits.some(m => m.category === 'manoeuvre' && m.name === parsed.name);

    if (isManoeuvre) {
      let match = merits.find(m =>
        m.category === 'manoeuvre' && m.name === parsed.name && !matched.has(merits.indexOf(m))
      );
      const pts = readPoints(charWs, MAN_ROW_START + manSlotIdx);
      if (!match) {
        match = { category: 'manoeuvre', name: parsed.name, rating: parsed.dots, ...ZERO_MC, rule_key: rulesMap.get(`manoeuvre:${slugify(parsed.name)}`) || null };
        merits.push(match);
      }
      Object.assign(match, { cp: pts.cp, xp: pts.xp, free: pts.free });
      matched.add(merits.indexOf(match));
      manSlotIdx++;
    } else {
      let match = merits.find(m =>
        m.category === 'general' && m.name === parsed.name && !matched.has(merits.indexOf(m))
      );
      const pts = readPoints(charWs, MERIT_ROW_START + genSlotIdx);
      if (!match) {
        match = { category: 'general', name: parsed.name, rating: parsed.dots, ...ZERO_MC,
          rule_key: rulesMap.get(`merit:${slugify(parsed.name)}`) || null };
        if (parsed.qualifier) match.qualifier = parsed.qualifier;
        merits.push(match);
      }
      Object.assign(match, { cp: pts.cp, xp: pts.xp, free: pts.free });
      matched.add(merits.indexOf(match));
      genSlotIdx++;
    }
  }

  // Influence merits (cols 176-195 names, 196-215 areas) — create if not found
  const inflPool = merits.filter(m => m.category === 'influence').slice();
  for (let i = 0; i < 20; i++) {
    const nameRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 176 + i })]?.v || '';
    const areaRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 196 + i })]?.v || '';
    if (!nameRaw || nameRaw === '¬') continue;
    const meritType = nameRaw.trim();
    const area = (areaRaw && areaRaw !== '¬') ? areaRaw.trim() : '';
    const pts = readPoints(charWs, INFL_ROW_START + i);

    let match = inflPool.find(m => {
      if (m.name !== meritType) return false;
      if (!area) return true;
      const mArea = m.area || m.qualifier || '';
      return mArea.toLowerCase().includes(area.toLowerCase()) || area.toLowerCase().includes(mArea.toLowerCase());
    });
    if (!match) {
      match = { category: 'influence', name: meritType, rating: 0, area: area || null, ...ZERO_MC,
        rule_key: rulesMap.get(`merit:${slugify(meritType)}`) || null };
      merits.push(match);
    }
    Object.assign(match, { cp: pts.cp, xp: pts.xp, free: pts.free });
    inflPool.splice(inflPool.indexOf(match), 1);
  }

  // Domain merits — create if not found
  for (const [dmName, row] of Object.entries(DOMAIN_ROWS)) {
    const pts = readPoints(charWs, row);
    if (!pts.cp && !pts.free && !pts.xp) continue;
    let dm = merits.find(m => m.category === 'domain' && m.name === dmName);
    if (!dm) {
      dm = { category: 'domain', name: dmName, rating: 0, ...ZERO_MC, rule_key: rulesMap.get(`merit:${slugify(dmName)}`) || null };
      merits.push(dm);
    }
    Object.assign(dm, { cp: pts.cp, xp: pts.xp, free: pts.free });
  }

  // Standing merits (MCI, PT) — create if not found
  for (const [smName, row] of [['Mystery Cult Initiation', MCI_ROW], ['Professional Training', PT_ROW]]) {
    const pts = readPoints(charWs, row);
    if (!pts.cp && !pts.free && !pts.xp) continue;
    let sm = merits.find(m => m.category === 'standing' && m.name === smName);
    if (!sm) {
      sm = { category: 'standing', name: smName, rating: 0, ...ZERO_MC, rule_key: rulesMap.get(`merit:${slugify(smName)}`) || null };
      merits.push(sm);
    }
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
