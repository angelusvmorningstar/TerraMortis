/**
 * Client-side Excel parser for character master workbook.
 * Uses window.XLSX (loaded via CDN). Ports cell mappings from migrate-points.js.
 */

// ── Cell position constants ──

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
  if (!raw || raw === '\u00AC') return null;
  const dotMatch = raw.match(/[●]+/);
  const dots = dotMatch ? dotMatch[0].length : 0;
  const parts = raw.replace(/[●○]+/g, '').split('|').map(s => s.trim()).filter(Boolean);
  return { name: parts[0] || '', dots, qualifier: parts[1] || null };
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

// ── Parser ──

function extractCharacter(charWs, dataWs, dataRow) {
  const warnings = [];

  // Attributes
  const attributes = {};
  for (const [attr, row] of Object.entries(ATTR_ROWS)) {
    attributes[attr] = readPoints(charWs, row);
  }

  // Skills
  const skills = {};
  for (const [skill, row] of Object.entries(SKILL_ROWS)) {
    const pts = readPoints(charWs, row);
    if (pts.cp || pts.free || pts.xp) skills[skill] = pts;
  }

  // Disciplines
  const disciplines = {};
  for (const [disc, row] of Object.entries(DISC_ROWS)) {
    const pts = readPoints(charWs, row);
    if (pts.cp || pts.free || pts.xp) disciplines[disc] = pts;
  }

  // Domain merits
  const domainMerits = {};
  for (const [name, row] of Object.entries(DOMAIN_ROWS)) {
    const pts = readPoints(charWs, row);
    if (pts.cp || pts.free || pts.xp) domainMerits[name] = pts;
  }

  // Standing merits (MCI, PT)
  const standingMerits = {};
  const mciPts = readPoints(charWs, MCI_ROW);
  if (mciPts.cp || mciPts.free || mciPts.xp) standingMerits['Mystery Cult Initiation'] = mciPts;
  const ptPts = readPoints(charWs, PT_ROW);
  if (ptPts.cp || ptPts.free || ptPts.xp) standingMerits['Professional Training'] = ptPts;

  // General merits + manoeuvres from Character Data columns 114-143
  // The Character Data sheet lists merits in order; the individual character sheet
  // has general merits in rows 79-98 and manoeuvres in rows 101-120 (separate runs).
  // We read the name from Character Data, then read CP/Free/XP from the character sheet.
  // General merits and manoeuvres are interleaved in Character Data columns 114-143.
  // In the individual character sheet they occupy SEPARATE row blocks with independent indices:
  //   General: rows 79-98 (20 slots), Manoeuvres: rows 101-120 (20 slots)
  // We can't tell gen from man without the character data, so we read points at BOTH
  // possible indices. The merge engine will pick the correct one based on category match.
  // We also store running gen/man slot indices so the merge engine can advance them correctly.
  const generalMerits = [];
  let _genIdx = 0, _manIdx = 0;
  for (let c = 114; c <= 143; c++) {
    const raw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c })]?.v || '';
    const parsed = parseMeritSlot(raw);
    if (!parsed) continue;
    generalMerits.push({
      ...parsed,
      _genPts: readPoints(charWs, MERIT_ROW_START + _genIdx),
      _manPts: readPoints(charWs, MAN_ROW_START + _manIdx),
      _genIdx, _manIdx,
    });
    // Both counters speculatively advance; merge engine will use the correct one
    _genIdx++;
    _manIdx++;
  }

  // Influence merits from Character Data columns 176-195 (names) + 196-215 (areas)
  const influenceMerits = [];
  for (let i = 0; i < 20; i++) {
    const nameRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 176 + i })]?.v || '';
    const areaRaw = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 196 + i })]?.v || '';
    if (!nameRaw || nameRaw === '\u00AC') continue;
    influenceMerits.push({
      name: nameRaw.trim(), area: (areaRaw && areaRaw !== '\u00AC') ? areaRaw.trim() : '',
      points: readPoints(charWs, INFL_ROW_START + i),
    });
  }

  // XP log
  const xpLog = {
    attributes: num(charWs, 7, 13), skills: num(charWs, 8, 13),
    merits: num(charWs, 9, 13), powers: num(charWs, 10, 13), special: num(charWs, 11, 13),
  };

  // Identity from Character Data
  const name = dataWs[XLSX.utils.encode_cell({ r: dataRow, c: 5 })]?.v || '';

  return { name, attributes, skills, disciplines, generalMerits, influenceMerits, domainMerits, standingMerits, xpLog, warnings };
}

/**
 * Parse an XLSX workbook, return array of extracted character data.
 * @param {object} workbook — XLSX workbook object from XLSX.read()
 * @returns {{ characters: object[], warnings: string[] }}
 */
export function parseExcelWorkbook(workbook) {
  const dataWs = workbook.Sheets['Character Data'];
  if (!dataWs) return { characters: [], warnings: ['No "Character Data" sheet found'] };

  const sheetMap = {};
  for (const sn of workbook.SheetNames) {
    const match = sn.match(/^([^(]+)/);
    if (match) sheetMap[match[1].trim()] = sn;
  }

  const dataRowMap = {};
  for (let r = 1; r <= 40; r++) {
    const name = dataWs[XLSX.utils.encode_cell({ r, c: 5 })]?.v || '';
    if (name) dataRowMap[name] = r;
  }

  const characters = [];
  const globalWarnings = [];

  for (const [charName, dataRow] of Object.entries(dataRowMap)) {
    const sheetName = findSheetName(charName, sheetMap);
    if (!sheetName || !workbook.Sheets[sheetName]) {
      globalWarnings.push(`${charName}: no individual sheet found`);
      continue;
    }
    const data = extractCharacter(workbook.Sheets[sheetName], dataWs, dataRow);
    data.sheetName = sheetName;
    characters.push(data);
  }

  return { characters, warnings: globalWarnings };
}
