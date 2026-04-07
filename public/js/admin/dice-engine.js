/**
 * Dice rolling engine for admin Engine domain.
 * Matches the suite roller aesthetic. Supports character pool building
 * (attribute + skill + discipline + specialisation).
 */

import { esc, displayName } from '../data/helpers.js';
import { ALL_ATTRS, ALL_SKILLS, SKILLS_MENTAL } from '../data/constants.js';
import { getRulesByCategory, getRuleByKey } from '../data/loader.js';

// ── Dice math (decoupled from suite/data.js) ──

let again = 10;
let noAgain = false;

function d10() { return Math.floor(Math.random() * 10) + 1; }
function mkDie(v) { return { v, s: v >= 8, x: !noAgain && v >= again }; }
function mkChain(rv) {
  const r = mkDie(rv); const ch = [];
  if (!noAgain) { let l = r; while (l.x) { const c = mkDie(d10()); ch.push(c); l = c; } }
  return { r, ch };
}
function rollPool(n) { const c = []; for (let i = 0; i < n; i++) c.push(mkChain(d10())); return c; }
function cntSuc(cols) { let s = 0; cols.forEach(col => { if (col.r.s) s++; col.ch.forEach(d => { if (d.s) s++; }); }); return s; }

// ── State ──

let chars = [];
let poolSize = 5;
let mod = 0;
let rote = false;
let selectedChar = null;
let selAttr = '';
let selSkill = '';
let selDisc = '';
let selSpec = '';
let selPower = '';  // selected discipline power key
let hist = [];

// ── Init ──

export function initDiceEngine(allChars) {
  chars = allChars.filter(c => !c.retired);
  const container = document.getElementById('engine-content');
  if (!container) return;

  if (!document.getElementById('engine-left')) {
    container.innerHTML = '';
    const left = document.createElement('div');
    left.id = 'engine-left';
    left.className = 'engine-left';
    left.innerHTML = '<div id="dice-engine"></div><div id="feeding-engine" style="margin-top:20px;"></div>';

    const right = document.createElement('div');
    right.id = 'engine-right';
    right.className = 'engine-right';

    container.appendChild(left);
    container.appendChild(right);
  }

  render();
}

// ── Pool calculation ──

function getAttrVal(name) {
  if (!selectedChar || !name) return 0;
  const a = selectedChar.attributes?.[name];
  return a ? (a.dots || 0) + (a.bonus || 0) : 0;
}
function getSkillVal(name) {
  if (!selectedChar || !name) return 0;
  const s = selectedChar.skills?.[name];
  return s ? (s.dots || 0) + (s.bonus || 0) : 0;
}
function getDiscVal(name) {
  if (!selectedChar || !name) return 0;
  return selectedChar.disciplines?.[name] || 0;
}
function getSpecBonus() {
  if (!selSpec || !selectedChar) return 0;
  // Check for Area of Expertise merit (gives +2 instead of +1)
  const hasAoE = (selectedChar.merits || []).some(m =>
    m.name && m.name.toLowerCase() === 'area of expertise'
  );
  return hasAoE ? 2 : 1;
}

function calcPool() {
  return getAttrVal(selAttr) + getSkillVal(selSkill) + getDiscVal(selDisc) + (selSpec ? getSpecBonus() : 0);
}

/** Get powers available to the selected character. Tries rules cache, falls back to DISC. */
function getCharPowers() {
  if (!selectedChar) return [];
  const charDiscs = selectedChar.disciplines || {};
  const charPowers = (selectedChar.powers || []).map(p => p.name);
  const results = [];

  // Try rules cache
  const discRules = getRulesByCategory('discipline');
  const devRules = getRulesByCategory('devotion');
  const riteRules = getRulesByCategory('rite');
  if (discRules.length) {
    for (const rule of [...discRules, ...riteRules]) {
      if (rule.parent && charDiscs[rule.parent]) {
        results.push({ name: rule.name, info: { d: rule.parent, a: rule.pool?.attr, s: rule.pool?.skill, r: rule.resistance, c: rule.cost, ac: rule.action, du: rule.duration, ef: rule.description } });
      }
    }
    for (const rule of devRules) {
      if (charPowers.includes(rule.name)) {
        results.push({ name: rule.name, info: { d: rule.parent, a: rule.pool?.attr, s: rule.pool?.skill, r: rule.resistance, c: rule.cost, ac: rule.action, du: rule.duration, ef: rule.description } });
      }
    }
  }
  results.sort((a, b) => (a.info.d || '').localeCompare(b.info.d || '') || a.name.localeCompare(b.name));
  return results;
}

/** Load a power's pool into the roller state. Tries rules cache, falls back to DISC. */
function loadPower(powerName) {
  // Try rules cache
  const slug = powerName.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug) || getRuleByKey('rite-' + slug) || getRuleByKey('devotion-' + slug);
  let info;
  if (rule) {
    info = { d: rule.parent, a: rule.pool?.attr, s: rule.pool?.skill, r: rule.resistance, c: rule.cost, ac: rule.action, du: rule.duration, ef: rule.description };
  } else {
    return;
  }
  if (!info || !selectedChar) return;
  if (!info.a || !info.s) return;

  const attrV = getAttrVal(info.a);
  const skillV = getSkillVal(info.s);
  const unskilled = (info.s && skillV === 0) ? (SKILLS_MENTAL.includes(info.s) ? -3 : -1) : 0;
  const discV = info.d ? getDiscVal(info.d) : 0;

  selAttr = info.a;
  selSkill = info.s;
  selDisc = info.d || '';
  selSpec = '';
  poolSize = attrV + skillV + discV + unskilled;
  mod = 0;
}

function effPool() {
  return Math.max(0, poolSize + mod);
}

function getSpecs() {
  if (!selectedChar || !selSkill) return [];
  const s = selectedChar.skills?.[selSkill];
  return s?.specs || [];
}

// ── Render ──

function render() {
  const el = document.getElementById('dice-engine');
  if (!el) return;

  const eff = effPool();

  let h = '';

  // Character + Power selector row
  h += '<div class="de-shortcut-row">';
  h += `<select class="de-sc-btn" id="de-char">`;
  h += '<option value="">Character</option>';
  for (const c of chars) {
    const sel = selectedChar && selectedChar._id === c._id ? ' selected' : '';
    h += `<option value="${esc(c._id)}"${sel}>${esc(displayName(c))}</option>`;
  }
  h += '</select>';

  // Power/discipline dropdown
  if (selectedChar) {
    const powers = getCharPowers();
    h += `<select class="de-sc-btn" id="de-power">`;
    h += '<option value="">Discipline</option>';
    let lastDisc = '';
    for (const p of powers) {
      const disc = p.info.d || 'Other';
      if (disc !== lastDisc) {
        if (lastDisc) h += '</optgroup>';
        h += `<optgroup label="${esc(disc)}">`;
        lastDisc = disc;
      }
      const sel = selPower === p.name ? ' selected' : '';
      const rollable = p.info.a && p.info.s;
      h += `<option value="${esc(p.name)}"${sel}${rollable ? '' : ' disabled'}>${esc(p.name)}</option>`;
    }
    if (lastDisc) h += '</optgroup>';
    h += '</select>';
  }
  h += '</div>';

  // Power info banner
  if (selPower) {
    const slug = selPower.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const rule = getRuleByKey(slug) || getRuleByKey('rite-' + slug) || getRuleByKey('devotion-' + slug);
    const pi = rule ? { c: rule.cost, ac: rule.action, du: rule.duration, r: rule.resistance, ef: rule.description } : null;
    if (pi) {
      h += '<div class="de-power-info">';
      h += `<div class="de-power-name">${esc(selPower)}</div>`;
      const details = [];
      if (pi.c) details.push(`Cost: ${pi.c}`);
      if (pi.ac) details.push(pi.ac);
      if (pi.du) details.push(pi.du);
      if (pi.r) details.push(pi.r);
      if (details.length) h += `<div class="de-power-stats">${esc(details.join(' · '))}</div>`;
      if (pi.ef) h += `<div class="de-power-effect">${esc(pi.ef)}</div>`;
      h += '</div>';
    }
  }

  // Pool builder (attribute + skill + discipline) — shown when character selected
  if (selectedChar) {
    h += '<div class="de-pool-builder">';

    // Attribute
    h += '<div class="de-pb-row">';
    h += '<select class="de-pb-sel" id="de-attr">';
    h += '<option value="">Attribute</option>';
    for (const a of ALL_ATTRS) {
      const v = getAttrVal(a);
      if (!v) continue;
      const sel = selAttr === a ? ' selected' : '';
      h += `<option value="${esc(a)}"${sel}>${esc(a)} (${v})</option>`;
    }
    h += '</select>';

    // Skill
    h += '<select class="de-pb-sel" id="de-skill">';
    h += '<option value="">Skill</option>';
    for (const s of ALL_SKILLS) {
      const v = getSkillVal(s);
      if (!v) continue;
      const sel = selSkill === s ? ' selected' : '';
      h += `<option value="${esc(s)}"${sel}>${esc(s)} (${v})</option>`;
    }
    h += '</select>';

    // Discipline
    h += '<select class="de-pb-sel" id="de-disc">';
    h += '<option value="">Discipline</option>';
    const discs = Object.entries(selectedChar.disciplines || {}).filter(([, v]) => v > 0);
    for (const [d, v] of discs) {
      const sel = selDisc === d ? ' selected' : '';
      h += `<option value="${esc(d)}"${sel}>${esc(d)} (${v})</option>`;
    }
    h += '</select>';
    h += '</div>';

    // Specialisations (shown when a skill with specs is selected)
    const specs = getSpecs();
    if (specs.length) {
      h += '<div class="de-spec-row">';
      for (const sp of specs) {
        const on = selSpec === sp ? ' on' : '';
        h += `<button class="de-spec-chip${on}" data-spec="${esc(sp)}">${esc(sp)} <span class="de-spec-bonus">+${getSpecBonus()}</span></button>`;
      }
      h += '</div>';
    }

    // Load pool button
    const cp = calcPool();
    if (cp > 0) {
      h += `<button class="de-load-btn" id="de-load-pool">Load Pool (${cp} dice)</button>`;
    }
    h += '</div>';
  }

  // ── Dice Pool ──
  h += '<div class="slabel">Dice Pool</div>';
  h += '<div class="crow">';
  h += '<button class="cbtn" id="de-pool-down">\u2212</button>';
  h += `<div class="cval${poolSize <= 0 ? ' chance' : ''}" id="de-pool-val">${poolSize <= 0 ? 'Chance' : poolSize}</div>`;
  h += '<button class="cbtn" id="de-pool-up">+</button>';
  h += '</div>';
  h += `<div class="effline" id="de-effline">Effective pool: <span>${eff <= 0 ? '<span style="color:var(--err)">Chance die</span>' : eff + (eff === 1 ? ' die' : ' dice')}</span></div>`;

  // ── Bonus / Penalty ──
  h += '<div class="slabel">Bonus / Penalty</div>';
  h += '<div class="crow">';
  h += '<button class="bbtn" id="de-mod-down">\u2212</button>';
  const modStr = mod === 0 ? '0' : mod > 0 ? '+' + mod : String(mod);
  const modCls = mod > 0 ? ' pos' : mod < 0 ? ' neg' : '';
  h += `<div class="bval${modCls}" id="de-mod-val">${modStr}</div>`;
  h += '<button class="bbtn" id="de-mod-up">+</button>';
  h += '</div>';

  // ── Again Rule ──
  h += '<div class="slabel">Again Rule</div>';
  h += '<div class="arow">';
  for (const v of [8, 9, 10]) {
    const on = again === v ? ' on' : '';
    h += `<button class="abtn${on}" data-again="${v}">${v}-again</button>`;
  }
  h += '</div>';

  // ── Rote / No Again ──
  h += '<div class="mrow">';
  h += `<button class="mchip${rote ? ' on' : ''}" id="de-rote">Rote</button>`;
  h += `<button class="mchip${noAgain ? ' on' : ''}" id="de-no-again">No Again</button>`;
  h += '</div>';

  // ── Roll Button ──
  h += '<button class="de-roll-btn" id="de-roll">Roll the Dice</button>';

  // ── Result Area ──
  h += '<div id="de-res-area" class="de-res-area">';
  h += '<div id="de-res-hdr"></div>';
  h += '<div id="de-dice-area" class="de-dice-wrap"><div class="empty-d">No rolls yet</div></div>';
  h += '</div>';

  el.innerHTML = h;
  wireEvents();
}

function wireEvents() {
  const $ = id => document.getElementById(id);

  $('de-char').addEventListener('change', e => {
    const id = e.target.value;
    selectedChar = id ? chars.find(c => c._id === id) : null;
    selAttr = ''; selSkill = ''; selDisc = ''; selSpec = ''; selPower = '';
    render();
  });

  $('de-power')?.addEventListener('change', e => {
    selPower = e.target.value;
    if (selPower) loadPower(selPower);
    render();
  });

  $('de-pool-down').addEventListener('click', () => { poolSize = Math.max(-5, poolSize - 1); render(); });
  $('de-pool-up').addEventListener('click', () => { poolSize = Math.min(40, poolSize + 1); render(); });
  $('de-mod-down').addEventListener('click', () => { mod = Math.max(-10, mod - 1); render(); });
  $('de-mod-up').addEventListener('click', () => { mod = Math.min(10, mod + 1); render(); });
  $('de-rote').addEventListener('click', () => { rote = !rote; render(); });
  $('de-no-again').addEventListener('click', () => { noAgain = !noAgain; render(); });
  $('de-roll').addEventListener('click', doRoll);

  document.querySelectorAll('#dice-engine [data-again]').forEach(btn => {
    btn.addEventListener('click', () => { again = parseInt(btn.dataset.again, 10); render(); });
  });

  // Pool builder events
  if (selectedChar) {
    $('de-attr')?.addEventListener('change', e => { selAttr = e.target.value; render(); });
    $('de-skill')?.addEventListener('change', e => { selSkill = e.target.value; selSpec = ''; render(); });
    $('de-disc')?.addEventListener('change', e => { selDisc = e.target.value; render(); });
    $('de-load-pool')?.addEventListener('click', () => { poolSize = calcPool(); mod = 0; render(); });

    document.querySelectorAll('#dice-engine [data-spec]').forEach(btn => {
      btn.addEventListener('click', () => {
        selSpec = selSpec === btn.dataset.spec ? '' : btn.dataset.spec;
        render();
      });
    });
  }
}

// ── Roll ──

function doRoll() {
  const eff = effPool();
  const hdr = document.getElementById('de-res-hdr');
  const area = document.getElementById('de-dice-area');
  hdr.innerHTML = '';
  area.innerHTML = '';

  if (eff <= 0) {
    const v = d10();
    const suc = v === 10;
    const dram = v === 1;
    const cls = dram ? 'd' : suc ? 'e' : 'f';
    const lbl = dram ? 'Dramatic Failure' : suc ? 'Success (Chance)' : 'Failure (Chance)';
    const cnt = dram ? '\u2014' : suc ? '1' : '0';
    hdr.innerHTML = `<div><span class="rcnt ${cls}">${cnt}</span><span class="rlbl ${cls}">${lbl}</span></div><div class="rverd">Chance die</div>`;
    hdr.classList.add('on');
    area.innerHTML = `<div class="die cd">${v}</div>`;
    addHist('Chance', cls, lbl, cnt, 'Chance die');
    return;
  }

  const cA = rollPool(eff);
  const cB = rote ? rollPool(eff) : null;
  const sA = cntSuc(cA);
  const sB = rote ? cntSuc(cB) : 0;
  let wC, wS, lC, lS;

  if (rote && sB > sA) { wC = cB; wS = sB; lC = cA; lS = sA; }
  else { wC = cA; wS = sA; if (rote) { lC = cB; lS = sB; } }

  const mods = [];
  if (rote) mods.push('rote');
  if (noAgain) mods.push('no again');
  const poolParts = [];
  if (selAttr) poolParts.push(`${selAttr} ${getAttrVal(selAttr)}`);
  if (selSkill) poolParts.push(`${selSkill} ${getSkillVal(selSkill)}`);
  if (selDisc) poolParts.push(`${selDisc} ${getDiscVal(selDisc)}`);
  const poolStr = poolParts.length ? poolParts.join(' + ') : `${eff}d10`;
  const verd = `${poolStr} \u00B7 ${again}-again${mods.length ? ' \u00B7 ' + mods.join(', ') : ''}`;

  const exc = wS >= 5;
  const cls = wS === 0 ? 'f' : exc ? 'e' : 's';
  const lbl = wS === 0 ? 'Failure' : exc ? 'Exceptional Success' : 'Success';
  hdr.innerHTML = `<div><span class="rcnt ${cls}">${wS}</span><span class="rlbl ${cls}">${lbl}</span></div><div class="rverd">${esc(verd)}</div>`;
  hdr.classList.add('on');

  if (rote) {
    const wb = document.createElement('div'); wb.className = 'rote-blk win';
    wb.innerHTML = `<div class="rote-lbl">Roll 1 \u2014 ${wS} success${wS !== 1 ? 'es' : ''} (selected)</div>`;
    wb.appendChild(mkColsEl(wC, 0)); area.appendChild(wb);
    const lb = document.createElement('div'); lb.className = 'rote-blk';
    lb.innerHTML = `<div class="rote-lbl">Roll 2 \u2014 ${lS} success${lS !== 1 ? 'es' : ''}</div>`;
    lb.appendChild(mkColsEl(lC, wC.length + 2)); area.appendChild(lb);
  } else {
    area.appendChild(mkColsEl(wC, 0));
  }

  addHist(eff + 'd10', cls, lbl, wS, verd);
}

function mkDieEl(d, delay, isX) {
  const el = document.createElement('div');
  let cls = isX ? 'die ed' : (d.s ? 'die sd' : 'die fd');
  if (d.x) cls += ' xd';
  el.className = cls;
  el.textContent = d.v;
  el.style.animationDelay = (delay * 40) + 'ms';
  return el;
}

function mkColsEl(cols, base) {
  const w = document.createElement('div');
  w.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
  let delay = base;
  cols.forEach(col => {
    const ce = document.createElement('div'); ce.className = 'dcol';
    ce.appendChild(mkDieEl(col.r, delay++, false));
    col.ch.forEach(child => {
      const conn = document.createElement('div'); conn.className = 'xconn';
      ce.appendChild(conn);
      ce.appendChild(mkDieEl(child, delay++, true));
    });
    w.appendChild(ce);
  });
  return w;
}

// ── History (right pane) ──

function ensureHistPanel() {
  if (document.getElementById('de-history')) return;
  const right = document.getElementById('engine-right');
  if (!right) return;
  const panel = document.createElement('div');
  panel.id = 'de-history';
  panel.className = 'de-history';
  panel.innerHTML = '<div class="hist-hdr"><div class="slabel">History</div><button class="hist-clr" id="de-clear-hist">Clear</button></div><div id="de-hist-list" class="hlist"><div class="hempty">No rolls yet</div></div>';
  right.prepend(panel);
  document.getElementById('de-clear-hist').addEventListener('click', () => { hist = []; renderHist(); });
}

function addHist(pool, cls, lbl, cnt, verd) {
  hist.unshift({ pool, lbl, cnt, cls, verd });
  if (hist.length > 20) hist.pop();
  renderHist();
}

function renderHist() {
  ensureHistPanel();
  const hEl = document.getElementById('de-hist-list');
  if (!hEl) return;
  if (!hist.length) { hEl.innerHTML = '<div class="hempty">No rolls yet</div>'; return; }
  hEl.innerHTML = hist.map(r =>
    `<div class="hitem"><span class="hmeta">${esc(r.verd)}</span><span class="hres ${r.cls}">${r.cnt} ${esc(r.lbl)}</span></div>`
  ).join('');
}
