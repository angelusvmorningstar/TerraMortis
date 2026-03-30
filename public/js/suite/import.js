/**
 * import.js — Excel import/parsing for the ST Suite.
 *
 * Reads character data from XLSX spreadsheets and converts rows into
 * the suite's character format. Uses the SheetJS (XLSX) library via CDN
 * (window.XLSX).
 *
 * Depends on callbacks registered via setCallbacks() to access app state
 * (loadChars, renderStOverview, toast).
 */

// ══════════════════════════════════════════════
//  CALLBACK REGISTRATION
// ══════════════════════════════════════════════

let _loadChars = () => {};
let _renderStOverview = () => {};
let _toast = () => {};

/**
 * Register callbacks so import functions can trigger app-level side effects.
 * Called once from main.js during init.
 */
export function setImportCallbacks({ loadChars, renderStOverview, toast }) {
  _loadChars = loadChars;
  _renderStOverview = renderStOverview;
  _toast = toast;
}

// ══════════════════════════════════════════════
//  HANDLE IMPORT (CHARACTER EXCEL)
// ══════════════════════════════════════════════

export function handleImport(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = window.XLSX.read(data, { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!rows || rows.length < 2) { _toast('Import failed: no data rows'); return; }
      const parsed = parseExcelToChars(rows);
      if (!parsed.length) { _toast('Import failed: no characters found'); return; }
      localStorage.setItem('tm_import_chars', JSON.stringify(parsed));
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem('tm_import_meta', JSON.stringify({ filename: file.name, count: parsed.length, date: dateStr }));
      _loadChars();
      _renderStOverview();
      _toast(`Imported ${parsed.length} characters from ${file.name}`);
    } catch (err) {
      console.error('Import error', err);
      _toast('Import failed: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  input.value = '';
}

// ══════════════════════════════════════════════
//  HANDLE DOWNTIME IMPORT
// ══════════════════════════════════════════════

export function handleDtImport(input) {
  const file = input.files[0];
  if (!file) return;
  _toast('Downtime import: coming soon');
  input.value = '';
}

// ══════════════════════════════════════════════
//  PARSE EXCEL TO CHARACTERS
// ══════════════════════════════════════════════

function parseExcelToChars(rows) {
  const hdrs = rows[0];
  const h = {};
  hdrs.forEach((v, i) => { if (v) h[String(v).trim()] = i; });

  const NULL_VALS = new Set([null, undefined, '', '-', '\u00ac', '~']);
  function isNull(v) { return NULL_VALS.has(v) || (typeof v === 'string' && v.trim() === '') || v === '\u25cb'; }
  function clean(v) { return (isNull(v)) ? null : String(v).trim(); }

  // Count filled dots for integer value; count open dots for bonus; dagger for nine-again
  function parseDotStr(v) {
    const s = clean(v);
    if (!s || s === '-' || s === '\u00ac' || s === '~' || s === '\u25cb') return null;
    const base = (s.match(/\u25cf/g) || []).length;
    const bonus = (s.match(/\u25cb/g) || []).length;
    const nineAgain = s.includes('\u2020');
    return { base, bonus, nineAgain };
  }
  function dotInt(v) { const d = parseDotStr(v); return d ? d.base : 0; }

  // Return skill value: int if simple, object if has bonus/spec/nine_again
  function skillVal(dotCol, specCol, row) {
    const raw = row[dotCol];
    const spec = clean(row[specCol]);
    const d = parseDotStr(raw);
    const base = d ? d.base : 0;
    const bonus = d ? d.bonus : 0;
    const na = d ? d.nineAgain : false;
    if (!base && !spec) return null; // no dots, no spec -> skip
    if (!bonus && !na && !spec) return base; // simple integer
    const o = { dots: base };
    if (bonus) o.bonus_dots = bonus;
    if (na) o.nine_again = true;
    if (spec) o.spec = spec;
    return o;
  }

  // Attribute: may have bonus dots
  function attrVal(col, row) {
    const d = parseDotStr(row[col]);
    if (!d) return 0;
    if (!d.bonus) return d.base;
    return { dots: d.base, bonus_dots: d.bonus };
  }

  // Parse covenant status dot string -> integer
  function covStatus(v) {
    const s = clean(v);
    if (!s || s === '-') return 0;
    return (s.match(/\u25cf/g) || []).length;
  }

  // Parse touchstone: "filled-dot (Name (desc))" or "filled-dot (Name)"
  function parseTouchstone(v, humanity) {
    const s = clean(v);
    if (!s || !s.includes('(')) return null;
    const content = s.replace(/^\u25cf\s*\(/, '').replace(/\)$/, '');
    const inner = content.match(/^(.+?)\s*\((.+)\)$/);
    if (inner) return { humanity, name: inner[1].trim(), desc: inner[2].trim() };
    return { humanity, name: content.trim(), desc: null };
  }

  // Parse influence total "8 / 8" -> integer (max)
  function parseInflTotal(v) {
    const s = clean(v);
    if (!s) return 0;
    const parts = s.split('/');
    return parseInt(parts[parts.length - 1]) || 0;
  }

  const ATTR_NAMES = ['Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity', 'Stamina', 'Presence', 'Manipulation', 'Composure'];
  const SKILL_PAIRS = [
    ['Academics', 'Academics Spec'], ['Computer', 'Computer Spec'], ['Crafts', 'Crafts Spec'],
    ['Investigation', 'Investigation Spec'], ['Medicine', 'Medicine Spec'], ['Occult', 'Occult Spec'],
    ['Politics', 'Politics Spec'], ['Science', 'Science Spec'],
    ['Athletics', 'Athletics Spec'], ['Brawl', 'Brawl Spec'], ['Drive', 'Drive Spec'],
    ['Firearms', 'Firearms Spec'], ['Larceny', 'Larceny Spec'], ['Stealth', 'Stealth Spec'],
    ['Survival', 'Survival Spec'], ['Weaponry', 'Weaponry Spec'],
    ['Animal Ken', 'Animal Ken Spec'], ['Empathy', 'Empathy Spec'], ['Expression', 'Expression Spec'],
    ['Intimidation', 'Intimidation Spec'], ['Persuasion', 'Persuasion Spec'],
    ['Socialise', 'Socialise Spec'], ['Streetwise', 'Streetwise Spec'], ['Subterfuge', 'Subterfuge Spec'],
  ];
  const DISC_NAMES = ['Animalism', 'Auspex', 'Celerity', 'Dominate', 'Majesty', 'Nightmare', 'Obfuscate', 'Protean', 'Resilience', 'Vigour', 'Cruac', 'Theban', 'Creation', 'Destruction', 'Divination', 'Protection', 'Transmutation'];

  const result = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    const name = clean(row[h['Character Name']]);
    if (!name) continue;

    // Attributes
    const attributes = {};
    ATTR_NAMES.forEach(a => { const v = attrVal(h[a], row); if (v) attributes[a] = v; });

    // Skills
    const skills = {};
    SKILL_PAIRS.forEach(([sk, sp]) => {
      const v = skillVal(h[sk], h[sp], row);
      if (v !== null) skills[sk] = v;
    });

    // Disciplines
    const disciplines = {};
    DISC_NAMES.forEach(d => { const n = dotInt(row[h[d]]); if (n > 0) disciplines[d] = n; });

    // Powers (Blood 1-30)
    const powers = [];
    for (let i = 1; i <= 30; i++) {
      const name_p = clean(row[h[`Blood ${i}`]]);
      if (!name_p) continue;
      const stats = clean(row[h[`Blood Stats ${i}`]]);
      const effect = clean(row[h[`Blood Effect ${i}`]]);
      const p = { name: name_p };
      if (stats) {
        const pm = stats.match(/Pool:\s*(\d+)/);
        if (pm) p.pool_size = parseInt(pm[1]);
        p.stats = stats;
      }
      if (effect) p.effect = effect;
      powers.push(p);
    }

    // Merits
    const merits = [];
    for (let i = 1; i <= 30; i++) {
      const m = clean(row[h[`Merit ${i}`]]);
      if (m && m !== '\u00ac') merits.push(m);
    }

    // Influence
    const influence = [];
    for (let i = 1; i <= 20; i++) {
      const type = clean(row[h[`Influence ${i}`]]);
      const area = clean(row[h[`Area ${i}`]]);
      const dots = dotInt(row[h[`Influence Dots ${i}`]]);
      if (type && !isNull(row[h[`Influence ${i}`]])) influence.push({ type, area: area || '', dots });
    }

    // Touchstones (col Humanity 10..1 -> humanity values 10..1)
    const touchstones = [];
    for (let hv = 10; hv >= 1; hv--) {
      const ts = parseTouchstone(row[h[`Humanity ${hv}`]], hv);
      if (ts) touchstones.push(ts);
    }

    // Banes
    const baneNames = ['Clan Bane', 'Bloodline Bane', 'Other Bane 1', 'Other Bane 2', 'Other Bane 3'];
    const baneEffCols = ['Clan Bane Effect', 'Bloodline Bane Effect', 'Other Bane Effect 1', 'Other Bane Effect 2', 'Other Bane Effect 3'];
    const banes = [];
    baneNames.forEach((bn, i) => {
      const n = clean(row[h[bn]]); const e = clean(row[h[baneEffCols[i]]]);
      if (n && n !== '\u00ac') banes.push({ name: n, effect: e || '' });
    });

    // Covenant standings
    const covenant_standings = [];
    for (let i = 1; i <= 4; i++) {
      const label = clean(row[h[`Covenant ${i}`]]);
      const status = covStatus(row[h[`Covenant Status ${i}`]]);
      if (label && label !== '\u00ac') covenant_standings.push({ label, status });
    }

    // Domain
    const domKeys = ['Safe Place', 'Haven', 'Feeding Grounds', 'Herd'];
    const domJS = ['safe_place', 'haven', 'feeding_grounds', 'herd'];
    const domain = {};
    domKeys.forEach((k, i) => { const n = dotInt(row[h[k]]); if (n > 0) domain[domJS[i]] = n; });

    // Standing
    const mcDots = dotInt(row[h['Mystery Cult Initiation']]);
    const mcName = clean(row[h['Mystery Cult Name']]);
    const ptDots = dotInt(row[h['Professional Training']]);
    const ptRole = clean(row[h['Prof Training Role']]);
    const standing = {};
    if (mcDots > 0 || mcName) standing.mystery_cult = { dots: mcDots, name: mcName || '' };
    if (ptDots > 0 || ptRole) standing.prof_training = { dots: ptDots, role: ptRole || '' };

    // Aspirations
    const aspirations = [];
    for (let i = 1; i <= 3; i++) { const a = clean(row[h[`Aspiration ${i}`]]); if (a) aspirations.push(a); }

    const char = {
      name,
      player: clean(row[h['Player Name']]),
      clan: clean(row[h['Clan']]),
      bloodline: (() => { const b = clean(row[h['Bloodline']]); return (b && b !== '\u00ac') ? b : null; })(),
      covenant: clean(row[h['Covenant']]),
      concept: (() => { const c = clean(row[h['Concept']]); return (c && c !== '\u00ac') ? c : null; })(),
      pronouns: clean(row[h['Pronouns']]),
      mask: clean(row[h['Mask']]),
      dirge: clean(row[h['Dirge']]),
      court_title: (() => { const ct = clean(row[h['Court Title']]); return (ct && ct !== '\u00ac') ? ct : null; })(),
      apparent_age: (() => { const aa = clean(row[h['Apparent Age']]); return (aa && aa !== '\u00ac') ? aa : null; })(),
      blood_potency: dotInt(row[h['Blood Potency']]),
      humanity: parseInt(row[h['Hum']]) || 0,
      size: parseInt(row[h['Size']]) || 5,
      speed: parseInt(row[h['Speed']]) || 0,
      defence: parseInt(row[h['Defence']]) || 0,
      xp_total: parseInt(row[h['XP Total']]) || 0,
      xp_left: parseInt(row[h['XP Left']]) || 0,
      status: {
        city: parseInt(row[h['City Status']]) || 0,
        clan: parseInt(row[h['Clan Status']]) || 0,
        covenant: parseInt(row[h['Covenant Status']]) || 0,
      },
      attributes, skills, disciplines, powers, merits, influence,
      influence_total: parseInflTotal(row[h['Influence']]),
      touchstones, banes, aspirations, covenant_standings,
      domain: Object.keys(domain).length ? domain : undefined,
      standing: Object.keys(standing).length ? standing : undefined,
      features: (() => { const f = clean(row[h['Features']]); return (f && f !== '\u00ac') ? f : null; })(),
      willpower: {
        mask_1wp: clean(row[h['Mask 1WP']]),
        mask_all_wp: clean(row[h['Mask AllWP']]),
        dirge_1wp: clean(row[h['Dirge 1WP']]),
        dirge_all_wp: clean(row[h['Dirge AllWP']]),
      },
    };
    // Clean undefined keys
    if (!char.domain) delete char.domain;
    if (!char.standing) delete char.standing;
    result.push(char);
  }
  return result;
}
