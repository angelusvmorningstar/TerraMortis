/**
 * Sheet rendering module — all read-only and edit-mode sheet HTML generation.
 * Extracted from tm_editor.html lines 315–1310.
 */
import state from '../data/state.js';
import { CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS, RITUAL_DISCS, CLAN_ATTR_OPTIONS, ATTR_CATS, PRI_LABELS, PRI_BUDGETS, SKILL_PRI_BUDGETS, SKILLS_MENTAL, SKILLS_PHYSICAL, SKILLS_SOCIAL, SKILL_CATS, CLANS, COVENANTS, MASKS_DIRGES, COURT_TITLES, BLOODLINE_CLANS, BANE_LIST, INFLUENCE_SPHERES, ALL_SKILLS, CITY_SVG, OTHER_SVG, BP_SVG, HUM_SVG, HEALTH_SVG, WP_SVG, STAT_SVG, STYLE_TAGS } from '../data/constants.js';
import { ICONS } from '../data/icons.js';
import { CLAN_ICON_KEY, COV_ICON_KEY, clanIcon, covIcon, shDots, shDotsWithBonus, esc, formatSpecs, hasAoE, displayName, dropdownName, sortName, getWillpower, redactPlayer, redactCharName, isRedactMode } from '../data/helpers.js';
import { getAttrVal, getAttrBonus, getSkillObj, calcCityStatus, titleStatusBonus, regentAmienceBonus, isInClanDisc, riteCost } from '../data/accessors.js';
import { calcHealth, calcWillpowerMax, calcSize, calcSpeed, calcDefence } from '../data/derived.js';
import { xpToDots, xpEarned, xpSpent, xpLeft, xpStarting, xpHumanityDrop, xpOrdeals, xpGame, xpPT5, xpSpentAttrs, xpSpentSkills, xpSpentMerits, xpSpentPowers, xpSpentSpecial, setDevotionsDB, meritBdRow } from './xp.js';
import { meritBase, meritDotCount, meritLookup, meritFixedRating, buildMeritOptions, buildSubCategoryMeritOptions, buildMCIGrantOptions, buildFThiefOptions, ensureMeritSync, meetsDevPrereqs, devPrereqStr, meetsPrereq, prereqLabel } from './merits.js';
import { getRulesByCategory, getRuleByKey } from '../data/loader.js';
import { applyDerivedMerits, getPoolTotal, getPoolUsed, getPoolsForCategory, mciPoolTotal, getMCIPoolUsed } from './mci.js';
import { domMeritTotal, domMeritAccess, domMeritContrib, domMeritShareable, calcTotalInfluence, influenceBreakdown, calcContactsInfluence, calcMeritInfluence, hasHoneyWithVinegar, hasViralMythology, vmUsed, ssjHerdBonus, flockHerdBonus, hasLorekeeper, lorekeeperUsed, hasOHM, ohmUsed, hasInvested, investedPool, investedUsed, effectiveInvictusStatus, attacheBonusDots } from './domain.js';
import { auditCharacter } from '../data/audit.js';
import { shEnsureTouchstoneData } from './edit.js';

// Build legacy-format shims from rules cache for remaining deep consumers.
// These produce arrays/objects in the old DEVOTIONS_DB/MERITS_DB/MAN_DB shape.
function _devDB() {
  return getRulesByCategory('devotion').map(r => ({
    n: r.name, key: r.key,
    p: r.prereq?.all?.map(n => ({ disc: n.name, dots: n.dots })) || (r.prereq?.type === 'discipline' ? [{ disc: r.prereq.name, dots: r.prereq.dots }] : []),
    xp: r.xp_fixed || 0, cost: r.cost || '', effect: r.description || '',
    stats: r.pool ? `Pool: ${[r.pool.attr, r.pool.skill, r.pool.disc].filter(Boolean).join(' + ')}` + (r.action ? `  •  ${r.action}` : '') + (r.duration ? `  •  ${r.duration}` : '') : '',
    bl: r.bloodline,
  }));
}
function _meritDB() {
  const db = {};
  for (const r of getRulesByCategory('merit')) {
    db[r.name.toLowerCase()] = { desc: r.description, prereq: r.prereq, prereqStr: r.prereq ? prereqLabel(r.prereq) : null, rating: r.rating_range ? `${r.rating_range[0]}–${r.rating_range[1]}` : null, type: r.parent, sub_category: r.sub_category };
  }
  return db;
}
function _manDB() {
  const db = {};
  for (const r of getRulesByCategory('manoeuvre')) {
    db[r.name.toLowerCase()] = { name: r.name, style: r.parent, rank: String(r.rank || ''), effect: r.description, prereq: r.prereq, prereqStr: r.prereq ? prereqLabel(r.prereq) : null };
  }
  return db;
}
// Module-level aliases rebuilt on each render (rules cache is fast, already in memory)
let DEVOTIONS_DB = [];
let MERITS_DB = {};
let MAN_DB = {};
function _refreshLegacyDBs() {
  DEVOTIONS_DB = _devDB();
  MERITS_DB = _meritDB();
  MAN_DB = _manDB();
  if (DEVOTIONS_DB.length) setDevotionsDB(DEVOTIONS_DB);
}
_refreshLegacyDBs();

/** Render audit badges — separate error and warning indicators with counts and hover breakdown. */
function _auditBadge(c) {
  const audit = auditCharacter(c);
  if (audit.valid && audit.warnings.length === 0) {
    return '<span class="audit-badge audit-ok" title="All checks passed">\u2714</span>';
  }
  let h = '';
  if (audit.errors.length) {
    const tip = audit.errors.map(e => '\u2716 ' + e.message).join('\n');
    h += `<span class="audit-badge audit-err" title="${esc(tip)}">\u2716${audit.errors.length > 1 ? ' ' + audit.errors.length : ''}</span>`;
  }
  if (audit.warnings.length) {
    const tip = audit.warnings.map(w => {
      let line = '\u26A0 ' + w.message;
      if (w.detail?.items?.length) line += '\n  \u2022 ' + w.detail.items.join('\n  \u2022 ');
      return line;
    }).join('\n');
    h += `<span class="audit-badge audit-warn" title="${esc(tip)}">\u26A0${audit.warnings.length > 1 ? ' ' + audit.warnings.length : ''}</span>`;
  }
  return h;
}

/** Render a prereq warning showing only the terms the character actually fails. */
function _prereqWarn(c, meritName, m) {
  if (m && m.granted_by) return '';
  const rule = getRuleByKey(meritName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  if (!rule || !rule.prereq) return '';
  if (meetsPrereq(c, rule.prereq, { domTotal: (name) => domMeritAccess(c, name) })) return '';
  const label = prereqLabel(rule.prereq);
  return '<div class="merit-prereq-warn">\u26A0 Prerequisites not met: <span class="merit-prereq-txt">' + esc(label) + '</span></div>';
}

/** Render grant pool counters for a merit category. Handles single and multi-target pools. */
function _renderPoolCounters(c, category) {
  const pools = getPoolsForCategory(c, category);
  // Include 'any' category pools (MCI pool) only in the general section — it applies everywhere
  // but repeating it in every category is redundant noise
  const anyPools = category === 'general' ? (c._grant_pools || []).filter(p => p.category === 'any') : [];
  // Also include 'vm' category pools (VM Allies bonus) in the influence section
  const vmPools = category === 'influence' ? (c._grant_pools || []).filter(p => p.category === 'vm') : [];
  // Also include 'ohm' category pools (OHM grants) in the influence section
  const ohmPools = category === 'influence' ? (c._grant_pools || []).filter(p => p.category === 'ohm') : [];
  // Also include 'inv' pools (Invested) in both domain and influence sections
  const invPools = (category === 'domain' || category === 'influence') ? (c._grant_pools || []).filter(p => p.category === 'inv') : [];
  // Lorekeeper pools target Herd/Retainer — show in the domain section (Herd lives there;
  // Retainer is influence but pool is unified). One row keeps the summary uncluttered.
  const lkPools = category === 'domain' ? (c._grant_pools || []).filter(p => p.category === 'lk') : [];
  const allPools = [...pools, ...anyPools, ...vmPools, ...ohmPools, ...invPools, ...lkPools];
  if (!allPools.length) return '';
  let h = '<div class="grant-pools">';
  const seen = new Set();
  allPools.forEach(p => {
    const label = p.names ? p.names.join('/') : (p.category === 'any' ? 'any merit' : p.category === 'vm' ? 'Allies (VM bonus)' : p.category === 'ohm' ? 'OHM: auto Contacts+Resources, pick Allies sphere' : p.category === 'inv' ? 'Herd/Mentor/Resources/Retainer (Invested)' : p.name);
    const key = p.source + '|' + label;
    if (seen.has(key)) return;
    seen.add(key);
    let pTotal, pUsed;
    if (p.category === 'any') { pTotal = p.amount; pUsed = getMCIPoolUsed(c); }
    else if (p.category === 'vm') { pTotal = p.amount; pUsed = vmUsed(c); }
    else if (p.category === 'lk') { pTotal = p.amount; pUsed = lorekeeperUsed(c); }
    else if (p.category === 'ohm') { pTotal = p.amount; pUsed = ohmUsed(c); }
    else if (p.category === 'inv') { pTotal = p.amount; pUsed = investedUsed(c); }
    else { const lookupName = p.names ? p.names[0] : p.name; pTotal = getPoolTotal(c, lookupName); pUsed = getPoolUsed(c, lookupName); }
    const cls = pUsed > pTotal ? 'sc-over' : pUsed === pTotal ? 'sc-full' : 'sc-val';
    h += '<div class="grant-pool-row"><span class="grant-pool-tag">' + esc(p.source) + '</span>: ' + esc(label) + ' free dots <span class="' + cls + '">' + pUsed + '/' + pTotal + '</span></div>';
  });
  h += '</div>'; return h;
}

/** Render a small red or yellow alert badge for a section title (edit mode only). */
function _alertBadge(lvl) {
  if (!lvl) return '';
  return lvl === 'red' ? '<span class="sh-sec-alert red" title="Data error">!</span>' : '<span class="sh-sec-alert yellow" title="Unspent pool dots">&#9679;</span>';
}

/** Render merit dots split into purchased (full gold) and bonus (empty circle). */
function shDotsMixed(purchased, bonus) {
  if (!purchased && !bonus) return '';
  return '<span class="trait-dots">' + '\u25CF'.repeat(purchased) + '\u25CB'.repeat(bonus) + '</span>';
}

/** Derived dot source notes on a merit. Only emits lines where the field > 0. */
function _derivedNotes(m) {
  const _n = (v, lbl, why) => v ? '<div class="derived-note">' + lbl + ': +' + v + ' dot' + (v !== 1 ? 's' : '') + ' (auto) \u2014 ' + why + '</div>' : '';
  return _n(m.free_mci,       'MCI',        'removed if MCI drops')
       + _n(m.free_vm,        'VM',         'removed if VM removed')
       + _n(m.free_ohm,       'OHM',        'removed if oath is removed')
       + _n(m.free_lk,        'Lorekeeper', 'removed if Lorekeeper removed')
       + _n(m.free_inv,       'Invested',   'removed if Invested removed')
       + _n(m.free_bloodline, 'Bloodline',  'removed if bloodline changes')
       + _n(m.free_pet,        'Pet (K-9/Falconry)', 'removed if style removed')
       + _n(m.free_pt,        'PT Bonus',   'removed if PT is removed')
       + _n(m.free_mdb,       'MDB Bonus',  'equals Mentor rating')
       + _n(m.free_sw,        'Safe Word',  'removed if oath is removed')
       + _n(m.free_fwb,       'FwB Bonus',  'equals MCI + Status dots, removed if FwB removed')
       + _n(m.free_attache,   'Attaché',    'equals Invictus status, removed if Attaché variant removed');
}
function _statusTrack(base, bonus, bonusColor, maxDots = 5) {
  const dot = i => {
    if (i <= base) return '<span class="sh-track-dot sh-track-base">\u25CF</span>';
    if (i <= base + bonus) return '<span class="sh-track-dot" style="color:' + bonusColor + '">\u25CB</span>';
    return '<span class="sh-track-dot sh-track-empty">\u25CB</span>';
  };
  if (maxDots > 5) {
    let row1 = '', row2 = '';
    for (let i = 1; i <= 5; i++) row1 += dot(i);
    for (let i = 6; i <= maxDots; i++) row2 += dot(i);
    return '<div class="sh-status-track sh-status-track-rows">'
      + '<div class="sh-track-row">' + row1 + '</div>'
      + '<div class="sh-track-row">' + row2 + '</div>'
      + '</div>';
  }
  let h = '<div class="sh-status-track">';
  for (let i = 1; i <= maxDots; i++) h += dot(i);
  return h + '</div>';
}
function _statusEditBtns(downFn, upFn) {
  return '<div class="sh-status-btns"><button class="sh-stat-lr" onclick="' + downFn + '">&#9664;</button><button class="sh-stat-lr" onclick="' + upFn + '">&#9654;</button></div>';
}
/* Render only the dots that exist — inherent full, bonus hollow, nothing beyond total.
   maxDots caps the scale (10 for city, 5 for cov/clan). */
function _statusDots(base, bonus, maxDots) {
  const total = Math.min(base + bonus, maxDots);
  if (!total) return '';
  const cappedBase = Math.min(base, maxDots);
  const dot = i => i <= cappedBase
    ? '<span class="sh-sdot sh-sdot-base">\u25CF</span>'
    : '<span class="sh-sdot sh-sdot-bonus">\u25CB</span>';
  if (total > 5) {
    let h = '<div class="sh-sdot-track sh-sdot-rows">';
    h += '<div class="sh-sdot-row">'; for (let i = 1; i <= 5; i++) h += dot(i); h += '</div>';
    h += '<div class="sh-sdot-row">'; for (let i = 6; i <= total; i++) h += dot(i); h += '</div>';
    return h + '</div>';
  }
  let h = '<div class="sh-sdot-track">';
  for (let i = 1; i <= total; i++) h += dot(i);
  return h + '</div>';
}
function _statusPip(svg, val, lbl) {
  return '<div class="sh-stat-pip"><div class="sh-status-shape">' + svg + '<span class="sh-status-n">' + val + '</span></div><div class="sh-status-lbl">' + lbl + '</div></div>';
}

/* ── Auto-detected notable features ── */
function derivedFeatures(c) {
  const out = [];
  // Attributes at 5 (dots + bonus) — visible to others
  const attrNames = ['Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity', 'Stamina', 'Presence', 'Manipulation', 'Composure'];
  for (const a of attrNames) {
    const obj = (c.attributes || {})[a] || {};
    if ((obj.dots || 0) + (obj.bonus || 0) >= 5) out.push('Inhumanly high ' + a);
  }
  // Giant merit
  if ((c.merits || []).some(m => m.name === 'Giant')) out.push('Giant');
  // Striking Looks
  const sl = (c.merits || []).find(m => m.name === 'Striking Looks');
  if (sl && (sl.rating || 0) > 0) out.push('Striking Looks ' + '\u25CF'.repeat(sl.rating));
  return out;
}

export function toggleExp(id) {
  const row = document.getElementById('exp-row-' + id), body = document.getElementById('exp-body-' + id);
  if (!row || !body) return;
  if (state.openExpId && state.openExpId !== id) {
    const pr = document.getElementById('exp-row-' + state.openExpId), pb = document.getElementById('exp-body-' + state.openExpId);
    if (pr) pr.classList.remove('open'); if (pb) pb.classList.remove('visible');
  }
  const isOpen = body.classList.contains('visible');
  row.classList.toggle('open', !isOpen); body.classList.toggle('visible', !isOpen);
  state.openExpId = isOpen ? null : id;
}
export function toggleDisc(id) {
  const row = document.getElementById('disc-row-' + id), drawer = document.getElementById('disc-drawer-' + id);
  if (!row || !drawer) return;
  const isOpen = drawer.classList.contains('visible');
  row.classList.toggle('open', !isOpen); drawer.classList.toggle('visible', !isOpen);
}
/**
 * NPCR.4 touchstone section — character.touchstones[] is authoritative (cap 6).
 * Slot rating descends from the clan anchor (Ventrue=7, else=6). Each entry
 * may carry an optional edge_id linking to a relationships doc (kind='touchstone').
 * The server enriches each item with _npc_name when linked.
 */
export function renderTouchstones(c, editMode) {
  const ts = Array.isArray(c.touchstones) ? c.touchstones : [];
  const hum = c.humanity || 0;
  const anchor = c?.clan === 'Ventrue' ? 7 : 6;
  const sorted = [...ts].sort((a, b) => (b.humanity || 0) - (a.humanity || 0));

  if (!editMode) {
    if (sorted.length === 0) return '';
    const rows = sorted.map(t => {
      const att = hum >= t.humanity;
      const name = t._npc_name || t.name || '(unnamed)';
      return '<div class="exp-ts-row"><span class="exp-ts-hum">Humanity ' + t.humanity
        + ' — <span style="color:' + (att ? 'rgba(140,200,140,.9)' : 'var(--txt3)')
        + ';font-style:normal">' + (att ? 'Attached' : 'Detached') + '</span></span>'
        + '<span class="exp-ts-name">' + esc(name)
        + (t.desc ? ' <span class="exp-ts-desc">(' + esc(t.desc) + ')</span>' : '') + '</span></div>';
    }).join('');
    return expRow('touchstones', 'Touchstones', '', rows);
  }

  // Edit mode — kick off NPC load (used by Add-picker).
  if (c._ts_loaded !== true && c._ts_loaded !== 'error' && c._ts_loaded !== 'loading') {
    shEnsureTouchstoneData();
  }

  const picker = c._ts_picker;
  let h = '<div class="sh-touchstones-edit">';
  h += '<div class="sh-sec-title" style="font-size:11px;margin:8px 0 4px">Touchstones</div>';
  if (c._ts_err) {
    h += '<div class="sh-touchstones-error" role="alert">' + esc(c._ts_err) + '</div>';
  }

  sorted.forEach(t => {
    const actualIdx = ts.indexOf(t);
    const att = hum >= t.humanity;
    const name = t._npc_name || t.name || '(unnamed)';
    const isEditing = picker && picker.mode === 'edit' && picker.index === actualIdx;
    h += '<div class="sh-ts-slot">';
    h += '<div class="sh-ts-slot-head"><span class="sh-ts-slot-hum">Humanity ' + t.humanity
      + '</span> · <span class="sh-ts-slot-att" style="color:'
      + (att ? 'rgba(140,200,140,.9)' : 'var(--txt3)') + '">'
      + (att ? 'Attached' : 'Detached') + '</span>'
      + (t.edge_id ? ' <span class="sh-ts-slot-kind">character</span>' : ' <span class="sh-ts-slot-kind dim">object</span>')
      + '</div>';
    h += '<div class="sh-ts-slot-body">';
    if (isEditing) {
      h += renderTouchstoneEditForm(c, actualIdx);
    } else {
      h += '<div class="sh-ts-slot-filled-row">';
      h += '<span class="sh-ts-slot-name">' + esc(name) + '</span>';
      if (t.desc) h += '<span class="sh-ts-slot-state">' + esc(t.desc) + '</span>';
      h += '<div class="sh-ts-slot-actions">';
      h += '<button class="sh-ts-slot-btn" onclick="shTouchstoneStartEdit(' + actualIdx + ')" title="Edit">edit</button>';
      h += '<button class="sh-ts-slot-btn danger" onclick="shTouchstoneRemove(' + actualIdx + ')" title="Remove">remove</button>';
      h += '</div></div>';
    }
    h += '</div></div>';
  });

  if (picker && picker.mode === 'add') {
    h += renderTouchstoneAddForm(c, anchor, ts.length);
  } else {
    const atCap = ts.length >= 6;
    const nextHum = anchor - ts.length;
    const btnLabel = atCap
      ? 'Maximum of 6 touchstones reached'
      : '+ Add touchstone (Humanity ' + nextHum + ')';
    h += '<button class="sh-ts-slot-add"'
      + (atCap ? ' disabled style="opacity:.5;cursor:not-allowed"' : ' onclick="shTouchstoneStartAdd()"')
      + '>' + btnLabel + '</button>';
  }

  h += '</div>';
  return h;
}

function renderTouchstoneAddForm(c, anchor, existingCount) {
  const draft = c._ts_picker.draft;
  const humanity = anchor - existingCount;
  const npcsLoading = c._ts_loaded !== true;
  const linkedNpcIds = new Set(
    (c.touchstones || []).map(t => t.edge_id ? String(t._npc_id || '') : null).filter(Boolean)
  );
  const npcs = (c._ts_npcs || [])
    .filter(n => n.status === 'active' || n.status === 'pending')
    .filter(n => !linkedNpcIds.has(String(n._id)))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

  let h = '<div class="sh-ts-picker">';
  h += '<div class="sh-ts-picker-head">New touchstone · Humanity ' + humanity + '</div>';

  h += '<label class="sh-ts-picker-check">';
  h += '<input type="checkbox"' + (draft.is_character ? ' checked' : '')
    + ' onchange="shTouchstonePickerToggleCharacter(this.checked)"> ';
  h += '<span>This touchstone is a character (link or create an NPC)</span>';
  h += '</label>';

  if (!draft.is_character) {
    h += '<label class="sh-ts-picker-field"><span>Name *</span>'
      + '<input class="sh-edit-input" placeholder="e.g., Grandfather&#39;s pocket watch" value="'
      + esc(draft.name || '') + '" oninput="shTouchstonePickerDraft(&#39;name&#39;, this.value)"></label>';
    h += '<label class="sh-ts-picker-field"><span>Description (optional)</span>'
      + '<input class="sh-edit-input" placeholder="Why it matters" value="'
      + esc(draft.desc || '') + '" oninput="shTouchstonePickerDraft(&#39;desc&#39;, this.value)"></label>';
  } else {
    h += '<div class="sh-ts-picker-mode-chips">';
    h += '<button type="button" class="sh-ts-slot-btn' + (draft.pick_existing ? ' primary' : '')
      + '" onclick="shTouchstonePickerSetMode(&#39;existing&#39;)">Pick existing NPC</button>';
    h += '<button type="button" class="sh-ts-slot-btn' + (!draft.pick_existing ? ' primary' : '')
      + '" onclick="shTouchstonePickerSetMode(&#39;create&#39;)">Create new NPC</button>';
    h += '</div>';

    if (draft.pick_existing) {
      if (npcsLoading) {
        h += '<div class="sh-ts-picker-loading">Loading NPCs…</div>';
      } else {
        const opts = npcs.map(n => '<option value="' + esc(String(n._id)) + '"'
          + (String(draft.npc_id || '') === String(n._id) ? ' selected' : '') + '>'
          + esc(n.name || '(unnamed)') + '</option>').join('');
        h += '<label class="sh-ts-picker-field"><span>NPC *</span>'
          + '<select class="sh-edit-select" onchange="shTouchstonePickerDraft(&#39;npc_id&#39;, this.value)">'
          + '<option value="">(pick an NPC)</option>' + opts + '</select></label>';
      }
      h += '<label class="sh-ts-picker-field"><span>Touchstone description (optional)</span>'
        + '<input class="sh-edit-input" placeholder="How they anchor the character" value="'
        + esc(draft.desc || '') + '" oninput="shTouchstonePickerDraft(&#39;desc&#39;, this.value)"></label>';
    } else {
      h += '<label class="sh-ts-picker-field"><span>NPC name *</span>'
        + '<input class="sh-edit-input" placeholder="Full NPC name" value="'
        + esc(draft.new_npc_name || '') + '" oninput="shTouchstonePickerDraft(&#39;new_npc_name&#39;, this.value)"></label>';
      h += '<label class="sh-ts-picker-field"><span>NPC description (for the register)</span>'
        + '<input class="sh-edit-input" placeholder="Short description" value="'
        + esc(draft.new_npc_desc || '') + '" oninput="shTouchstonePickerDraft(&#39;new_npc_desc&#39;, this.value)"></label>';
      h += '<label class="sh-ts-picker-field"><span>Touchstone description (optional)</span>'
        + '<input class="sh-edit-input" placeholder="How they anchor the character" value="'
        + esc(draft.desc || '') + '" oninput="shTouchstonePickerDraft(&#39;desc&#39;, this.value)"></label>';
    }
  }

  h += '<div class="sh-ts-picker-actions">';
  h += '<button class="sh-ts-slot-btn primary" onclick="shTouchstoneSaveAdd()">Save</button>';
  h += '<button class="sh-ts-slot-btn" onclick="shTouchstonePickerClose()">Cancel</button>';
  h += '</div></div>';
  return h;
}

function renderTouchstoneEditForm(c, idx) {
  const draft = c._ts_picker.draft;
  let h = '<div class="sh-ts-picker">';
  h += '<label class="sh-ts-picker-field"><span>Name *</span>'
    + '<input class="sh-edit-input" value="' + esc(draft.name || '') + '"'
    + ' oninput="shTouchstonePickerDraft(&#39;name&#39;, this.value)"></label>';
  h += '<label class="sh-ts-picker-field"><span>Description</span>'
    + '<textarea class="sh-ts-picker-textarea" oninput="shTouchstonePickerDraft(&#39;desc&#39;, this.value)">'
    + esc(draft.desc || '') + '</textarea></label>';
  h += '<div class="sh-ts-picker-actions">';
  h += '<button class="sh-ts-slot-btn primary" onclick="shTouchstoneSaveEdit()">Save</button>';
  h += '<button class="sh-ts-slot-btn" onclick="shTouchstonePickerClose()">Cancel</button>';
  h += '</div></div>';
  return h;
}

export function expRow(id, lbl, val, bodyHtml) {
  return '<div class="exp-row" id="exp-row-' + id + '" onclick="toggleExp(\'' + id + '\')"><span class="exp-lbl labeled">' + lbl + '</span><span class="exp-val">' + (val || '') + '</span><span class="exp-arr">\u203A</span></div><div class="exp-body" id="exp-body-' + id + '">' + bodyHtml + '</div>';
}

export function shRenderStatsStrip(c) {
  const { editMode } = state;
  const s = (i, v, l) => '<div class="sh-stat-cell"><div class="sh-stat-icon">' + i + '<span class="sh-stat-n">' + v + '</span></div><div class="sh-stat-lbl">' + l + '</div></div>';
  const sEdit = (i, v, l, fnDown, fnUp) => '<div class="sh-stat-cell sh-stat-editable"><div class="sh-stat-icon">' + i + '<span class="sh-stat-n">' + v + '</span></div><div class="sh-stat-edit-row"><button class="sh-stat-adj" onclick="' + fnDown + '">&#x25BC;</button><div class="sh-stat-lbl">' + l + '</div><button class="sh-stat-adj" onclick="' + fnUp + '">&#x25B2;</button></div></div>';
  const bp = c.blood_potency || 0, hm = c.humanity || 0;
  const bpCell = s(BP_SVG, bp || 1, 'BP');
  const humCell = s(HUM_SVG, hm, 'Humanity');
  // Safe Word: combined WP when mutually linked (both have the oath pointing to each other)
  const _swPact = (c.powers || []).find(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word');
  const _swPartner = _swPact && _swPact.partner ? (state.chars || []).find(ch => ch.name === _swPact.partner) : null;
  const _swActive = _swPartner && ((_swPartner.powers || []).some(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word' && p.partner === c.name));
  const _wpBase = calcWillpowerMax(c);
  const _wpVal = _swActive ? _wpBase + calcWillpowerMax(_swPartner) : _wpBase;
  const _wpLbl = _swActive ? 'WP (shared)' : 'Willpower';
  return '<div class="sh-stats-strip">' + bpCell + humCell + s(HEALTH_SVG, calcHealth(c), 'Health') + s(WP_SVG, _wpVal, _wpLbl) + s(STAT_SVG, calcSize(c), 'Size') + s(STAT_SVG, calcSpeed(c), 'Speed') + s(STAT_SVG, calcDefence(c), 'Defence') + '</div>';
}

export function shRenderAttributes(c, editMode) {
  const ATTR_ROWS = [['Intelligence', 'Strength', 'Presence'], ['Wits', 'Dexterity', 'Manipulation'], ['Resolve', 'Stamina', 'Composure']];
  const catOrder = ['Mental', 'Physical', 'Social'], BONUS_SOURCE = { Strength: 'Vigour', Stamina: 'Resilience' };
  // Normalise clan_attribute from attribute free field if missing
  if (!c.clan_attribute && c.attributes) { const ca = Object.entries(c.attributes).find(([, ao]) => (ao.free || 0) === 2); if (ca) c.clan_attribute = ca[0]; }
  const _attrAlert = editMode ? (catOrder.some(cat => { const budget = PRI_BUDGETS[(c.attribute_priorities || {})[cat] || 'Tertiary'] || 3, usedCP = (ATTR_CATS[cat] || []).reduce((s, a) => s + ((c.attributes?.[a]?.cp) || 0), 0); return budget - usedCP < 0; }) ? 'red' : null) : null;
  let h = '<div class="sh-sec"><div class="sh-sec-title">Attributes' + _alertBadge(_attrAlert) + '</div>';
  if (editMode) {
    const caList = CLAN_ATTR_OPTIONS[c.clan] || [];
    const caPills = caList.map(a => '<button class="cap-btn' + (c.clan_attribute === a ? ' active' : '') + '" onclick="shSetClanAttr(\'' + a.replace(/'/g, "\\'") + '\')">' + esc(a) + '</button>').join('');
    h += '<div class="sh-clan-attr-row"><span>Favoured Attribute</span><div class="clan-attr-pill">' + caPills + '</div></div>';
    const pri = c.attribute_priorities || {};
    if (!pri.Mental && !pri.Physical && !pri.Social) { pri.Mental = 'Primary'; pri.Physical = 'Secondary'; pri.Social = 'Tertiary'; }
    h += '<div class="sh-attr-col-hdr">';
    catOrder.forEach(cat => {
      const curPri = pri[cat] || 'Tertiary', budget = PRI_BUDGETS[curPri] || 3, usedCP = (ATTR_CATS[cat] || []).reduce((s, a) => s + ((c.attributes?.[a]?.cp) || 0), 0), rem = budget - usedCP;
      h += '<div class="sh-attr-pri"><select onchange="shSetPriority(\'' + cat + '\',this.value)">' + PRI_LABELS.map(p => '<option' + (curPri === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><span class="sh-cp-remaining' + (rem < 0 ? ' over' : rem === 0 ? ' full' : '') + '">' + rem + ' CP</span></div>';
    });
    h += '</div>';
  }
  h += '<div class="sh-attr-grid">';
  if (editMode) {
    const ATTR_COLS = [ATTR_CATS.Mental, ATTR_CATS.Physical, ATTR_CATS.Social];
    ATTR_COLS.forEach(col => {
      h += '<div>'; col.forEach(a => {
        const base = getAttrVal(c, a), bonus = getAttrBonus(c, a), isClan = c.clan_attribute === a;
        const autoBonus = (c.disciplines?.[BONUS_SOURCE[a]]?.dots || 0);
        const ao = c.attributes[a] || {}, aE = a.replace(/'/g, "\\'"), baseDots = 1 + (isClan ? 1 : 0), ab = baseDots + (ao.cp || 0), xd = xpToDots(ao.xp || 0, ab, 4), tot = ab + xd;
        h += '<div><div class="attr-cell attr-cell-edit"><div class="attr-name-sh">' + a + (isClan ? '<span class="attr-clan-star">\u2605</span>' : '') + '</div><div class="attr-dots-sh">' + shDotsWithBonus(base, autoBonus + bonus) + '</div></div>';
        h += '<div class="attr-bd-panel"><div class="attr-bd-row"><div class="bd-grp"><span class="bd-lbl">Base</span> <span class="attr-bd-ro">' + baseDots + '</span></div><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="' + (ao.cp || 0) + '" onchange="shEditAttrPt(\'' + aE + '\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="' + (ao.xp || 0) + '" onchange="shEditAttrPt(\'' + aE + '\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">' + tot + '</span></div></div>';
        { const aE2 = a.replace(/'/g, "\\'"), src = BONUS_SOURCE[a] || '', effTotal = tot + autoBonus + bonus;
          if (autoBonus > 0) h += '<div class="attr-derived-row"><span class="bd-lbl">' + src + '</span><span class="bd-src">+' + autoBonus + '</span></div>';
          h += '<div class="attr-derived-row"><span class="bd-lbl">Bonus</span><button class="sh-stat-adj" onclick="shAdjAttrBonus(\'' + aE2 + '\',-1)"' + (bonus === 0 ? ' disabled' : '') + '>&#x25BC;</button><span class="bd-src">' + (bonus > 0 ? '+' + bonus : '0') + '</span><button class="sh-stat-adj" onclick="shAdjAttrBonus(\'' + aE2 + '\',1)">&#x25B2;</button>' + (autoBonus > 0 || bonus > 0 ? '<div class="bd-eff"><span class="bd-lbl">Eff</span> <span class="bd-val">' + effTotal + '</span></div>' : '') + '</div>'; }
        h += '</div></div>';
      }); h += '</div>';
    });
  } else {
    ATTR_ROWS.forEach(row => row.forEach(a => {
      const base = getAttrVal(c, a), bonus = getAttrBonus(c, a);
      const autoBonus = (c.disciplines?.[BONUS_SOURCE[a]]?.dots || 0);
      h += '<div class="attr-cell"><div class="attr-name-sh">' + a + '</div><div class="attr-dots-sh">' + shDotsWithBonus(base, autoBonus + bonus) + '</div></div>';
    }));
  }
  h += '</div></div>';
  return h;
}

export function shRenderSkills(c, editMode) {
  const SKILL_COLS = [SKILLS_MENTAL, SKILLS_PHYSICAL, SKILLS_SOCIAL], skillCatOrder = ['Mental', 'Physical', 'Social'];
  const _skillAlert = editMode ? (skillCatOrder.some(cat => { const budget = SKILL_PRI_BUDGETS[(c.skill_priorities || {})[cat] || 'Tertiary'] || 4, usedCP = (SKILL_CATS[cat] || []).reduce((s, sk) => s + ((c.skills?.[sk]?.cp) || 0), 0); return budget - usedCP < 0; }) ? 'red' : null) : null;
  let h = '<div class="sh-sec"><div class="sh-sec-title">Skills' + _alertBadge(_skillAlert) + '</div>';
  if (editMode) {
    const sPri = c.skill_priorities || {};
    if (!sPri.Mental && !sPri.Physical && !sPri.Social) { sPri.Mental = 'Primary'; sPri.Physical = 'Secondary'; sPri.Social = 'Tertiary'; }
    h += '<div class="sh-attr-col-hdr">';
    skillCatOrder.forEach(cat => {
      const curPri = sPri[cat] || 'Tertiary', budget = SKILL_PRI_BUDGETS[curPri] || 4, usedCP = (SKILL_CATS[cat] || []).reduce((s, sk) => s + ((c.skills?.[sk]?.cp) || 0), 0), rem = budget - usedCP;
      h += '<div class="sh-attr-pri"><select onchange="shSetSkillPriority(\'' + cat + '\',this.value)">' + PRI_LABELS.map(p => '<option' + (curPri === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><span class="sh-cp-remaining' + (rem < 0 ? ' over' : rem === 0 ? ' full' : '') + '">' + rem + ' CP</span></div>';
    });
    h += '</div>';
    const ptMSpec = (c.merits || []).find(m => m.name === 'Professional Training');
    const ptFreeSpec = (ptMSpec && ptMSpec.rating >= 3) ? 2 : 0;
    const ptAssetSet = new Set((ptMSpec && ptMSpec.rating >= 3 && ptMSpec.asset_skills) ? (ptMSpec.asset_skills || []).filter(Boolean) : []);
    // Bloodline free specs — excluded from paid count
    const blFreeSpecs = c._bloodline_free_specs || [];
    const blBySkill = {};
    blFreeSpecs.forEach(({ skill }) => { blBySkill[skill] = (blBySkill[skill] || 0) + 1; });
    const blTotal = blFreeSpecs.length;
    let _assetSp = 0, _nonAssetSp = 0;
    Object.entries(c.skills || {}).forEach(([sk, skillObj]) => {
      const allCnt = (skillObj && skillObj.specs) ? skillObj.specs.length : 0;
      const paid = Math.max(0, allCnt - (blBySkill[sk] || 0));
      if (ptAssetSet.has(sk)) _assetSp += paid; else _nonAssetSp += paid;
    });
    const ptFreeCov = Math.min(ptFreeSpec, _assetSp), paidSp = _nonAssetSp + Math.max(0, _assetSp - ptFreeCov);
    const specXP = Math.max(0, paidSp - 3), cpSp = Math.min(paidSp, 3), cpCls = cpSp === 3 ? 'sc-full' : 'sc-val';
    const bonusTotal = ptFreeSpec + blTotal, bonusUsed = ptFreeCov + blTotal;
    const bonusParts = [];
    if (ptFreeSpec) bonusParts.push('PT: ' + ptFreeCov + '/' + ptFreeSpec + ' (asset skills)');
    if (blTotal) bonusParts.push('Bloodline: ' + blTotal);
    h += '<div class="sh-spec-counter">Specialisations <span class="' + cpCls + '">' + cpSp + ' / 3 CP</span>'
      + (specXP ? ' + <span class="sc-xp">' + specXP + ' XP</span>' : '')
      + (bonusTotal ? ' + <span class="sc-bonus">Bonus: ' + bonusUsed + '/' + bonusTotal + '</span>' : '')
      + (bonusParts.length ? '<div class="sc-parts">' + bonusParts.join(' \u00B7 ') + '</div>' : '')
      + '</div>';
  }
  h += '<div class="skills-3col">';
  if (editMode) {
    for (let ri = 0; ri < 8; ri++) {
      SKILL_COLS.forEach(col => {
        const s = col[ri];
        const sk = getSkillObj(c, s), d = sk.dots, bn = sk.bonus, sp = (sk.specs || []).join(', '), na = sk.nine_again, ptNa = c._pt_nine_again_skills && c._pt_nine_again_skills.has(s), ohmNa = c._ohm_nine_again_skills && c._ohm_nine_again_skills.has(s), ptBn = c._pt_dot4_bonus_skills && c._pt_dot4_bonus_skills.has(s) ? 1 : 0, mciBn = c._mci_dot3_skills && c._mci_dot3_skills.has(s) ? 1 : 0, hasDots = d > 0 || bn > 0 || ptBn > 0 || mciBn > 0, dotStr = hasDots ? shDotsWithBonus(d, bn + ptBn + mciBn) : '\u2013';
        h += '<div class="sk-edit-cell"><div class="sh-skill-row sk-edit' + (hasDots ? ' has-dots' : '') + '"><div class="skill-name-wrap"><span class="sh-skill-name">' + s + '</span>' + (sp ? '<span class="sh-skill-spec">' + formatSpecs(c, sk.specs) + '</span>' : '') + '</div><div class="skill-dots-wrap"><span class="' + (hasDots ? 'sh-skill-dots' : 'sh-skill-zero') + '">' + dotStr + '</span>' + (na ? '<span class="sh-skill-na">9-Again</span>' : ptNa ? '<span class="sh-skill-na pt-na">9-Again (PT)</span>' : ohmNa ? '<span class="sh-skill-na pt-na">9-Again (OHM)</span>' : '') + '</div></div>';
        const so2 = (c.skills || {})[s] || {}, sE = s.replace(/'/g, "\\'"), sb = so2.cp || 0, sxd = xpToDots(so2.xp || 0, sb, 2), st2 = sb + sxd;
        h += '<div class="sk-bd-panel"><div class="sk-bd-row"><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="' + (so2.cp || 0) + '" onchange="shEditSkillPt(\'' + sE + '\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="' + (so2.xp || 0) + '" onchange="shEditSkillPt(\'' + sE + '\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">' + st2 + '</span></div></div>';
        const specs = sk.specs || [];
        h += '<div class="sk-spec-list">';
        specs.forEach((sp2, si) => { h += '<div class="sk-spec-row"><input class="sk-spec-input" value="' + esc(sp2) + '" onchange="shEditSpec(\'' + sE + '\',' + si + ',this.value)" placeholder="Specialisation">' + (hasAoE(c, sp2) ? '<span style="color:rgba(140,200,140,.8);font-size:8px;font-family:var(--fh);white-space:nowrap">+2</span>' : '') + '<button class="sk-spec-rm" onclick="shRemoveSpec(\'' + sE + '\',' + si + ')" title="Remove">&times;</button></div>'; });
        h += '<button class="sk-spec-add" onclick="shAddSpec(\'' + sE + '\')">+ spec</button></div></div></div>';
      });
    }
  } else {
    for (let ri = 0; ri < 8; ri++) {
      SKILL_COLS.forEach(col => {
        const s = col[ri], sk = getSkillObj(c, s), d = sk.dots, bn = sk.bonus, sp = (sk.specs || []).join(', '), na = sk.nine_again, ptNa = c._pt_nine_again_skills && c._pt_nine_again_skills.has(s), ohmNa = c._ohm_nine_again_skills && c._ohm_nine_again_skills.has(s), ptBn = c._pt_dot4_bonus_skills && c._pt_dot4_bonus_skills.has(s) ? 1 : 0, mciBn = c._mci_dot3_skills && c._mci_dot3_skills.has(s) ? 1 : 0, hasDots = d > 0 || bn > 0 || ptBn > 0 || mciBn > 0, dotStr = hasDots ? shDotsWithBonus(d, bn + ptBn + mciBn) : '\u2013';
        h += '<div class="sh-skill-row' + (hasDots ? ' has-dots' : '') + '"><div class="skill-name-wrap"><span class="sh-skill-name">' + s + '</span>' + (sp ? '<span class="sh-skill-spec">' + formatSpecs(c, sk.specs) + '</span>' : '') + '</div><div class="skill-dots-wrap"><span class="' + (hasDots ? 'sh-skill-dots' : 'sh-skill-zero') + '">' + dotStr + '</span>' + (na ? '<span class="sh-skill-na">9-Again</span>' : ptNa ? '<span class="sh-skill-na pt-na">9-Again (PT)</span>' : ohmNa ? '<span class="sh-skill-na pt-na">9-Again (OHM)</span>' : '') + '</div></div>';
      });
    }
  }
  h += '</div></div>';
  return h;
}

export function shRenderDisciplines(c, editMode) {
  let h = '';

  // ── Derive discipline powers from the purchasable_powers rules cache.
  // Each power is keyed by parent (discipline name) + rank (1–5).
  // Falls back to stored c.powers entries for any discipline not covered
  // by the rules DB (e.g. homebrew).
  const _discRules = getRulesByCategory('discipline');
  function _discPowers(discName, dots) {
    const fromRules = _discRules
      .filter(r => r.parent === discName && r.rank != null && r.rank <= dots)
      .sort((a, b) => a.rank - b.rank);
    if (fromRules.length) return fromRules.map(r => ({
      name: r.name,
      stats: _fmtRuleStats(r),
      effect: r.description || '',
    }));
    // Fallback: stored powers on the character (legacy / homebrew)
    return (c.powers || [])
      .filter(p => p.category === 'discipline' && p.discipline === discName)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0))
      .map(p => ({ name: p.name, stats: p.stats || '', effect: p.effect || '' }));
  }
  function _fmtRuleStats(r) {
    const parts = [];
    if (r.cost) parts.push('Cost: ' + r.cost);
    if (r.pool) {
      const p = [r.pool.attr, r.pool.skill].filter(Boolean).join(' + ');
      const res = r.resistance ? ' \u2013 ' + r.resistance : '';
      parts.push('Pool: ' + (p || '\u2013') + res);
    }
    if (r.action) parts.push(r.action);
    if (r.duration) parts.push(r.duration);
    return parts.length ? parts.join('  \u2022  ') : '';
  }

  function renderDiscRow(d, r, nameClass) {
    const dp = _discPowers(d, r || 0), hasPow = dp.length > 0, id = 'disc-' + c.name.replace(/[^a-z]/gi, '') + d.replace(/[^a-z]/gi, '');
    let dr = ''; dp.forEach(p => { dr += '<div class="disc-power"><div class="disc-power-name">' + esc(p.name) + '</div>' + (p.stats ? '<div class="disc-power-stats">' + esc(p.stats) + '</div>' : '') + '<div class="disc-power-effect">' + esc(p.effect || '') + '</div></div>'; });
    const nTag = '<span class="trait-name' + (nameClass ? ' ' + nameClass : '') + '">' + esc(d) + '</span>', dTag = r ? '<span class="trait-dots' + (nameClass ? ' ' + nameClass : '') + '">' + shDots(r) + '</span>' : '';
    const _trInner = '<div class="trait-row"><div class="trait-main">' + nTag + '<div class="trait-right">' + dTag + (hasPow ? '<span class="disc-tap-arr">\u203A</span>' : '') + '</div></div></div>';
    if (!hasPow) return '<div class="disc-tap-row">' + _trInner + '</div>';
    return '<div class="disc-tap-row" id="disc-row-' + id + '" onclick="toggleDisc(\'' + id + '\')">' + _trInner + '</div><div class="disc-drawer" id="disc-drawer-' + id + '">' + dr + '</div>';
  }
  function renderDiscEditRow(d, r, isIC, nameClass) {
    const dObj = (c.disciplines || {})[d] || {}, dE = d.replace(/'/g, "\\'"), cm = isIC ? 3 : 4, db2 = dObj.cp || 0, xd = xpToDots(dObj.xp || 0, db2, cm), dt = db2 + xd;
    const id = 'disc-' + c.name.replace(/[^a-z]/gi, '') + d.replace(/[^a-z]/gi, '');
    // Derive powers from rules cache (same as view mode)
    const dp = _discPowers(d, dt);
    let dr = ''; dp.forEach(p => { dr += '<div class="disc-power"><div class="disc-power-name">' + esc(p.name) + '</div>' + (p.stats ? '<div class="disc-power-stats">' + esc(p.stats) + '</div>' : '') + '<div class="disc-power-effect">' + esc(p.effect || '') + '</div></div>'; });
    const _eR = '<div class="trait-right">' + (r > 0 ? '<span class="trait-dots' + (nameClass ? ' ' + nameClass : '') + '">' + shDots(r) + '</span>' : '') + (dp.length ? '<span class="disc-tap-arr">\u203A</span>' : '') + '</div>';
    let h2 = '<div class="disc-tap-row disc-edit"' + (dp.length ? ' id="disc-row-' + id + '" onclick="toggleDisc(\'' + id + '\')"' : '') + '><div class="trait-row"><div class="trait-main"><span class="trait-name' + (nameClass ? ' ' + nameClass : '') + '">' + esc(d) + '</span>' + _eR + '</div>' + (isIC ? '<div class="trait-sub"><span class="disc-clan-tag">in-clan</span></div>' : '') + '</div></div>';
    h2 += '<div class="disc-bd-panel"><div class="disc-bd-row"><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="' + (dObj.cp || 0) + '" onchange="shEditDiscPt(\'' + dE + '\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="' + (dObj.xp || 0) + '" onchange="shEditDiscPt(\'' + dE + '\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">' + dt + '</span></div></div></div>';
    if (dp.length) h2 += '<div class="disc-drawer" id="disc-drawer-' + id + '">' + dr + '</div>';
    return h2;
  }
  if (editMode) {
    const dd = c.disciplines || {};
    const _validDiscs = new Set([...CORE_DISCS, ...RITUAL_DISCS]);
    const iCP = Object.entries(dd)
      .filter(([d]) => _validDiscs.has(d) && isInClanDisc(c, d))
      .reduce((s, [, v]) => s + (v.cp || 0), 0);
    const oCP = Object.entries(dd)
      .filter(([d]) => _validDiscs.has(d) && !isInClanDisc(c, d))
      .reduce((s, [, v]) => s + (v.cp || 0), 0);
    const rem = 3 - iCP - oCP;
    h += '<div class="sh-sec"><div class="sh-sec-title">Disciplines' + _alertBadge(iCP < 2 || oCP > 1 || rem !== 0 ? 'red' : null) + '</div><div class="disc-cp-counter"><span class="sh-cp-remaining' + (rem < 0 ? ' over' : rem === 0 ? ' full' : '') + '">' + rem + ' CP</span><span class="' + (iCP < 2 ? 'sh-cp-remaining over' : '') + '">In-clan: ' + iCP + ' (min 2)</span><span class="' + (oCP > 1 ? 'sh-cp-remaining over' : '') + '">Out-of-clan: ' + oCP + ' (max 1)</span></div><div class="disc-list">';
    CORE_DISCS.forEach(d => { h += renderDiscEditRow(d, (c.disciplines || {})[d]?.dots || 0, isInClanDisc(c, d), null); });
    h += '</div></div>';
    const cn = (c.covenant || '').toLowerCase(), showCr = cn.includes('crone') || (c.disciplines || {}).Cruac?.dots > 0, showTh = cn.includes('lancea') || (c.disciplines || {}).Theban?.dots > 0;
    if (showCr || showTh) {
      h += '<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">';
      // Cruac and Theban are always out-of-clan (4 XP/dot) regardless of covenant.
      if (showCr) h += renderDiscEditRow('Cruac', (c.disciplines || {}).Cruac?.dots || 0, false, 'sorcery');
      if (showTh) h += renderDiscEditRow('Theban', (c.disciplines || {}).Theban?.dots || 0, false, 'sorcery');
      h += '</div></div>';
    }
  } else if (c.disciplines && Object.keys(c.disciplines).length) {
    const de = Object.entries(c.disciplines).filter(([, r]) => (r?.dots || 0) > 0).sort(([a], [b]) => a.localeCompare(b)),
          core = de.filter(([d]) => CORE_DISCS.includes(d)),
          rit = de.filter(([d]) => RITUAL_DISCS.includes(d));
    if (core.length) { h += '<div class="sh-sec"><div class="sh-sec-title">Disciplines</div><div class="disc-list">'; core.forEach(([d, r]) => { h += renderDiscRow(d, r?.dots || 0, null); }); h += '</div></div>'; }
    if (rit.length) {
      h += '<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">';
      rit.forEach(([d, r]) => { h += renderDiscRow(d, r?.dots || 0, 'sorcery'); });
      h += '</div></div>';
    }
  }
  // Devotions
  const devP = (c.powers || []).filter(p => p.category === 'devotion');
  if (editMode || devP.length) {
    h += '<div class="sh-sec"><div class="sh-sec-title">Devotions</div><div class="disc-list">';
    devP.forEach((p, i) => {
      const gid = 'dev' + c.name.replace(/[^a-z]/gi, '') + i, db = DEVOTIONS_DB.find(d => d.n === p.name);
      if (editMode) { h += '<div class="disc-tap-row disc-edit" id="disc-row-' + gid + '" onclick="toggleDisc(\'' + gid + '\')">' + '<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">' + esc(p.name) + '</span><div class="trait-right">' + (db ? '<span class="dev-xp-tag">' + db.xp + ' XP</span>' : '') + '<span class="disc-tap-arr">\u203A</span><button class="dev-rm-btn" onclick="event.stopPropagation();shRemoveDevotion(' + i + ')" title="Remove">&times;</button></div></div></div></div>' + '<div class="disc-drawer" id="disc-drawer-' + gid + '"><div class="disc-power">' + (db ? '<div class="dev-prereq">Requires: ' + devPrereqStr(db) + '</div>' : '') + (p.stats ? '<div class="disc-power-stats">' + esc(p.stats) + '</div>' : '') + '<div class="disc-power-effect">' + esc(p.effect || '') + '</div></div></div>'; }
      else { h += '<div class="disc-tap-row" id="disc-row-' + gid + '" onclick="toggleDisc(\'' + gid + '\')">' + '<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">' + esc(p.name) + '</span><div class="trait-right">' + (db && db.xp ? '<span class="trait-dots">' + '\u25CF'.repeat(db.xp) + '</span>' : '') + '<span class="disc-tap-arr">\u203A</span></div></div></div></div>' + '<div class="disc-drawer" id="disc-drawer-' + gid + '"><div class="disc-power">' + (p.stats ? '<div class="disc-power-stats">' + esc(p.stats) + '</div>' : '') + '<div class="disc-power-effect">' + esc(p.effect || '') + '</div></div></div>'; }
    });
    if (editMode) {
      const owned = new Set(devP.map(p => p.name)), avail = DEVOTIONS_DB.filter(d => !owned.has(d.n) && meetsDevPrereqs(c, d));
      h += '<div class="dev-add-row"><select id="dev-add-select" class="dev-add-sel" style="display:none">'; if (avail.length) avail.forEach(d => { h += '<option value="' + esc(d.key) + '">' + esc(d.n) + ' (' + devPrereqStr(d) + ') \u2014 ' + d.xp + ' XP</option>'; });
      h += '</select><button class="dev-add-btn"' + (avail.length ? ' onclick="shShowDevSelect(this)"' : ' disabled style="opacity:.4;cursor:default"') + '>' + (avail.length ? '+ Add Devotion (' + avail.length + ')' : 'No devotions available') + '</button></div>';
    }
    h += '</div></div>';
  }
  // Rites
  const ritP = (c.powers || []).filter(p => p.category === 'rite');
  const cruacDots = (c.disciplines || {}).Cruac?.dots || 0, thebanDots = (c.disciplines || {}).Theban?.dots || 0;
  const hasSorcery = cruacDots > 0 || thebanDots > 0;
  if (editMode ? hasSorcery : ritP.length) {
    const cruacPool = cruacDots * 2, thebanPool = thebanDots * 2;
    const cruacFreeUsed = ritP.filter(p => p.tradition === 'Cruac' && p.free).length;
    const thebanFreeUsed = ritP.filter(p => p.tradition === 'Theban' && p.free).length;
    const _riteOver = cruacFreeUsed > cruacPool || thebanFreeUsed > thebanPool;
    const _riteBadge = editMode ? _alertBadge(_riteOver ? 'red' : cruacFreeUsed < cruacPool || thebanFreeUsed < thebanPool ? 'yellow' : null) : '';
    h += '<div class="sh-sec"><div class="sh-sec-title">Rites' + _riteBadge + '</div>';
    if (editMode) {
      h += '<div class="grant-pools">';
      if (cruacDots > 0) { const cls = cruacFreeUsed > cruacPool ? ' sc-over' : cruacFreeUsed === cruacPool ? ' sc-full' : ' sc-val'; h += '<div class="grant-pool-row"><span class="grant-pool-tag">Cruac</span> free rites <span class="' + cls + '">' + cruacFreeUsed + '/' + cruacPool + '</span><span class="grant-pool-rank">rank \u2264 ' + cruacDots + '</span></div>'; }
      if (thebanDots > 0) { const cls = thebanFreeUsed > thebanPool ? ' sc-over' : thebanFreeUsed === thebanPool ? ' sc-full' : ' sc-val'; h += '<div class="grant-pool-row"><span class="grant-pool-tag">Theban</span> free rites <span class="' + cls + '">' + thebanFreeUsed + '/' + thebanPool + '</span><span class="grant-pool-rank">rank \u2264 ' + thebanDots + '</span></div>'; }
      h += '</div>';
    }
    h += '<div class="disc-list">';
    const allPw = c.powers || [];
    ritP.forEach(p => {
      const pi = allPw.indexOf(p);
      const gid = 'rite' + c.name.replace(/[^a-z]/gi, '') + pi;
      const xpCost = p.free ? 0 : (p.level >= 4 ? 2 : 1);
      const ruleEntry = getRulesByCategory('rite')?.find(r => r.name === p.name);
      const baseCost = riteCost(p).label || null;
      const riteOffering = ruleEntry?.offering ?? null;
      const costLine = baseCost ? (riteOffering ? baseCost + ' & ' + riteOffering : baseCost) : null;
      if (editMode) {
        const discDots = p.tradition === 'Cruac' ? cruacDots : thebanDots;
        const usedFree = p.tradition === 'Cruac' ? cruacFreeUsed : thebanFreeUsed;
        const freePool = p.tradition === 'Cruac' ? cruacPool : thebanPool;
        const canFree = !p.free && p.level <= discDots && usedFree < freePool;
        const freeLbl = p.free ? 'Free' : (xpCost + ' XP');
        const freeCls = p.free ? 'rite-free-badge' : 'rite-xp-badge';
        h += '<div class="disc-tap-row disc-edit" id="disc-row-' + gid + '" onclick="toggleDisc(\'' + gid + '\')">' + '<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">' + esc(p.name) + '</span><div class="trait-right"><span class="trait-dots">' + shDots(p.level) + '</span><button class="' + freeCls + '" onclick="event.stopPropagation();shToggleRiteFree(' + pi + ')"' + (p.free || canFree ? '' : ' disabled title="rank exceeds ' + p.tradition + ' dots or pool full"') + '>' + freeLbl + '</button><span class="disc-tap-arr">\u203A</span><button class="dev-rm-btn" onclick="event.stopPropagation();shRemoveRite(' + pi + ')" title="Remove">&times;</button></div></div><div class="trait-sub"><span class="trait-qual dim">' + esc(p.tradition) + '</span></div></div></div>' + '<div class="disc-drawer" id="disc-drawer-' + gid + '"><div class="disc-power">' + (costLine ? '<div class="disc-power-stats">Cost: ' + esc(costLine) + '</div>' : '') + (p.stats ? '<div class="disc-power-stats">' + esc(p.stats) + '</div>' : '') + '<div class="disc-power-effect">' + esc(ruleEntry?.description || p.effect || '') + '</div></div></div>';
      } else {
        h += '<div class="disc-tap-row" id="disc-row-' + gid + '" onclick="toggleDisc(\'' + gid + '\')">' + '<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">' + esc(p.name) + '</span><div class="trait-right"><span class="trait-dots">' + shDots(p.level) + '</span><span class="disc-tap-arr">\u203A</span></div></div><div class="trait-sub"><span class="trait-qual dim">' + esc(p.tradition) + '</span>' + (p.free === false ? '<span class="trait-chip">' + xpCost + ' XP</span>' : '') + '</div></div></div>' + '<div class="disc-drawer" id="disc-drawer-' + gid + '"><div class="disc-power">' + (costLine ? '<div class="disc-power-stats">Cost: ' + esc(costLine) + '</div>' : '') + (p.stats ? '<div class="disc-power-stats">' + esc(p.stats) + '</div>' : '') + '<div class="disc-power-effect">' + esc(ruleEntry?.description || p.effect || '') + '</div></div></div>';
      }
    });
    if (editMode) {
      const trads = [];
      if (cruacDots > 0) trads.push('Cruac');
      if (thebanDots > 0) trads.push('Theban');
      if (trads.length) {
        const defaultTrad = trads[0];
        const defaultDots = defaultTrad === 'Cruac' ? cruacDots : thebanDots;
        const allRites = getRulesByCategory('rite');
        const availRites = allRites
          .filter(r => r.parent === defaultTrad && r.rank != null && r.rank <= defaultDots)
          .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
        const tradSel = trads.length > 1
          ? '<select id="rite-add-trad" class="gen-qual-input" style="width:90px" onchange="shRefreshRiteDropdown(this.value)">' + trads.map(t => '<option>' + t + '</option>').join('') + '</select>'
          : '<span style="font-size:11px;color:rgba(220,160,120,.9);padding:0 4px">' + trads[0] + '</span><input type="hidden" id="rite-add-trad" value="' + trads[0] + '">';
        let nameSel, addOnclick;
        if (availRites.length) {
          nameSel = '<select id="rite-add-name" class="gen-qual-input" style="flex:1;min-width:140px">'
            + '<option value="" data-rank="" disabled selected>\u2014 select rite \u2014</option>'
            + availRites.map(r => '<option value="' + esc(r.name) + '" data-rank="' + r.rank + '">' + '\u25CF'.repeat(r.rank) + ' ' + esc(r.name) + '</option>').join('')
            + '</select>';
          addOnclick = '(function(){var s=document.getElementById(\'rite-add-name\');var n=s.value;var lv=+(s.options[s.selectedIndex]?.dataset?.rank||1);if(n)shAddRite(document.getElementById(\'rite-add-trad\').value,n,lv);})()';
        } else {
          // Rites DB not loaded or empty — fall back to free-text + level selector
          nameSel = '<input type="text" id="rite-add-name" class="gen-qual-input" style="flex:1;min-width:140px" placeholder="Rite name">'
            + '<select id="rite-add-level" class="gen-qual-input" style="width:50px">'
            + [1,2,3,4,5].map(n => '<option value="' + n + '">' + n + '</option>').join('')
            + '</select>';
          addOnclick = '(function(){var n=document.getElementById(\'rite-add-name\').value.trim();var lv=+document.getElementById(\'rite-add-level\').value;if(n)shAddRite(document.getElementById(\'rite-add-trad\').value,n,lv);})()';
        }
        h += '<div class="dev-add-row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + nameSel + tradSel + '<button class="dev-add-btn" onclick="' + addOnclick + '">+ Add</button></div>';
      }
    }
    h += '</div></div>';
  }
  // Pacts
  const pctP = (c.powers || []).filter(p => p.category === 'pact');
  if (pctP.length || editMode) {
    const _oathDB = Object.fromEntries(Object.entries(MERITS_DB || {}).filter(([, v]) => v.type === 'Invictus Oath' || v.type === 'Carthian Law'));
    const _toTitle = s => s.replace(/\b\w/g, ch => ch.toUpperCase());
    const _allSkillOpts = ALL_SKILLS.map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
    const _charNames = [...(state.chars || [])].filter(ch => ch.name && ch.name !== c.name).sort((a, b) => sortName(a).localeCompare(sortName(b))).map(ch => '<option value="' + esc(ch.name) + '">' + esc(dropdownName(ch)) + '</option>').join('');
    h += '<div class="sh-sec"><div class="sh-sec-title">Pacts</div><div class="disc-list">';
    pctP.forEach((p, i) => {
      const realPi = (c.powers || []).indexOf(p);
      const gid = 'pact' + c.name.replace(/[^a-z]/gi, '') + i;
      const isOHM = (p.name || '').toLowerCase() === 'oath of the hard motherfucker';
      const isSW = (p.name || '').toLowerCase() === 'oath of the safe word';
      const dbEntry = _oathDB[(p.name || '').toLowerCase()];
      const effect = p.effect || (dbEntry && dbEntry.desc) || '';
      const reqDots = dbEntry && dbEntry.rating ? parseInt(dbEntry.rating) || 0 : 0;
      if (editMode) {
        const pcp = p.cp || 0, pxp = p.xp || 0, ptotal = pcp + pxp;
        const ptCls = ptotal >= reqDots && (reqDots === 0 || ptotal === reqDots) ? ' met' : ptotal > 0 ? ' over' : '';
        h += '<div class="pact-edit-block">'
          + '<div class="pact-edit-hdr">'
          + '<span class="trait-name secondary">' + esc(_toTitle(p.name)) + '</span>'
          + '<div class="trait-right">'
          + (reqDots ? '<span class="trait-dots">' + '\u25CF'.repeat(reqDots) + '</span>' : '')
          + '</div>'
          + '</div>'
          + '<div class="pact-cp-xp">'
          + '<span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + pcp + '" onchange="shEditPact(' + realPi + ',\'cp\',+this.value)" style="width:36px">'
          + '<span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + pxp + '" onchange="shEditPact(' + realPi + ',\'xp\',+this.value)" style="width:36px">'
          + '<span class="pact-total' + ptCls + '">= ' + ptotal + ' dot' + (ptotal === 1 ? '' : 's') + '</span>'
          + '<button class="dev-rm-btn" onclick="shRemovePact(' + realPi + ')" title="Remove oath">&times;</button>'
          + '</div>';
        // OHM-specific controls
        if (isOHM) {
          const sk0 = (p.ohm_skills && p.ohm_skills[0]) || '';
          const sk1 = (p.ohm_skills && p.ohm_skills[1]) || '';
          const ohmSphere = p.ohm_allies_sphere || '';
          const _alliesMerits = (c.merits || []).filter(m => m.category === 'influence' && m.name === 'Allies' && m.area);
          const _alliesOpts = _alliesMerits.map(m => '<option value="' + esc(m.area) + '"' + ((m.area || '').toLowerCase() === ohmSphere.toLowerCase() ? ' selected' : '') + '>' + esc(m.area) + '</option>').join('');
          h += '<div class="pact-controls">'
            + '<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">Auto grants:</span><span class="grant-pool-tag">+1 Contacts, +1 Resources</span></div>'
            + '<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">+1 Allies:</span>'
            + (_alliesMerits.length
              ? '<select class="gen-qual-input" style="width:180px" onchange="shEditPact(' + realPi + ',\'ohm_allies_sphere\',this.value)"><option value="">-- pick Allies merit --</option>' + _alliesOpts + '</select>'
              : '<span class="pact-hint">Add an Allies merit first</span>')
            + '</div>'
            + '<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">9-Again skills:</span>'
            + '<select class="gen-qual-input" style="width:120px" onchange="shEditPact(' + realPi + ',\'ohm_skill_0\',this.value)"><option value="">-- skill 1 --</option>' + _allSkillOpts.replace('value="' + esc(sk0) + '"', 'value="' + esc(sk0) + '" selected') + '</select>'
            + '<select class="gen-qual-input" style="width:120px" onchange="shEditPact(' + realPi + ',\'ohm_skill_1\',this.value)"><option value="">-- skill 2 --</option>' + _allSkillOpts.replace('value="' + esc(sk1) + '"', 'value="' + esc(sk1) + '" selected') + '</select>'
            + '</div>'
            + '</div>';
        }
        // Safe Word-specific controls
        if (isSW) {
          const partner = p.partner || '';
          const sharedMerit = p.shared_merit || '';
          const partnerChar = partner ? (state.chars || []).find(ch => ch.name === partner) : null;
          const partnerHasSW = partnerChar && (partnerChar.powers || []).some(pp => pp.category === 'pact' && (pp.name || '').toLowerCase() === 'oath of the safe word' && pp.partner === c.name);
          h += '<div class="pact-controls">'
            + '<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">Partner:</span>'
            + '<select class="gen-qual-input" style="width:160px" onchange="shEditPact(' + realPi + ',\'partner\',this.value)"><option value="">-- select character --</option>' + _charNames.replace('value="' + esc(partner) + '"', 'value="' + esc(partner) + '" selected') + '</select>'
            + (partner && !partnerHasSW ? '<span class="pact-hint">partner must also take this oath</span>' : '')
            + (partnerHasSW ? '<span class="pact-linked">\u2713 mutually linked</span>' : '')
            + '</div>'
            + (() => { const _sm = (c.merits || []).filter(m => m.category === 'influence'); const _smOpts = _sm.map(m => { const _lbl = m.name + (m.qualifier ? ' (' + m.qualifier + ')' : m.area ? ' (' + m.area + ')' : ''); return '<option value="' + esc(_lbl) + '"' + (sharedMerit === _lbl ? ' selected' : '') + '>' + esc(_lbl) + '</option>'; }).join(''); return '<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">Shared Social Merit:</span>' + (_sm.length ? '<select class="gen-qual-input" style="width:180px" onchange="shEditPact(' + realPi + ',\'shared_merit\',this.value)"><option value="">\u2014 pick Social Merit \u2014</option>' + _smOpts + '</select>' : '<span class="pact-hint">No Social Merits on sheet</span>') + '</div>'; })()

            + '</div>';
        }
        h += '</div>';
      } else {
        const _pNotes = [isOHM && p.ohm_allies_sphere ? 'Allies: ' + esc(p.ohm_allies_sphere) : '', isOHM && p.ohm_skills && p.ohm_skills.filter(Boolean).length ? '9-again: ' + p.ohm_skills.filter(Boolean).map(esc).join(', ') : '', isSW && p.partner ? 'w/ ' + esc(p.partner) + (p.shared_merit ? ' \u00B7 ' + esc(p.shared_merit) : '') : ''].filter(Boolean).join(' \u00B7 ');
        const _pvTotal = (p.cp || 0) + (p.xp || 0);
        h += '<div class="disc-tap-row" id="disc-row-' + gid + '" onclick="toggleDisc(\'' + gid + '\')">'
          + '<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">' + esc(_toTitle(p.name)) + '</span><div class="trait-right">' + (_pvTotal ? '<span class="trait-dots">' + '\u25CF'.repeat(_pvTotal) + '</span>' : '') + '<span class="disc-tap-arr">\u203A</span></div></div>'
          + (_pNotes ? '<div class="trait-sub"><span class="trait-qual">' + _pNotes + '</span></div>' : '')
          + '</div></div>'
          + '<div class="disc-drawer" id="disc-drawer-' + gid + '"><div class="disc-power">'
          + (p.stats ? '<div class="disc-power-stats">' + esc(p.stats) + '</div>' : '')
          + '<div class="disc-power-effect">' + esc(effect) + '</div>'
          + '</div></div>';
      }
    });
    if (editMode) {
      const _takenOaths = new Set(pctP.map(p => (p.name || '').toLowerCase()));
      const _addableOaths = Object.keys(_oathDB).filter(k => !_takenOaths.has(k));
      h += '<div class="dev-add-row" style="display:flex;gap:6px;align-items:center">'
        + '<select id="pact-add-sel" class="gen-qual-input" style="flex:1;min-width:200px">'
        + '<option value="">-- select oath or law to add --</option>'
        + _addableOaths.map(k => { const db = _oathDB[k]; const dots = db && db.rating ? parseInt(db.rating) || 0 : 0; return '<option value="' + esc(k) + '">' + esc(_toTitle(k)) + (dots ? ' (' + '\u25CF'.repeat(dots) + ')' : '') + '</option>'; }).join('')
        + '</select>'
        + '<button class="dev-add-btn" onclick="shAddPact(document.getElementById(\'pact-add-sel\').value)">+ Add Pact</button>'
        + '</div>';
    }
    h += '</div></div>';
  }
  return h;
}

export function shRenderInfluenceMerits(c, editMode) {
  const inflM = (c.merits || []).filter(m => m.category === 'influence');
  if (!editMode && !inflM.length) return '';
  const totalInfl = calcTotalInfluence(c);
  const _inflTip = influenceBreakdown(c).map(l => esc(l)).join('\n');
  const _inflVmPools = (c._grant_pools || []).filter(p => p.category === 'vm');
  const _inflOhmPools = (c._grant_pools || []).filter(p => p.category === 'ohm');
  const _inflInvPools = (c._grant_pools || []).filter(p => p.category === 'inv');
  let _inflAlert = null;
  _inflVmPools.forEach(p => { const u = vmUsed(c); if (u > p.amount) _inflAlert = 'red'; else if (u < p.amount && _inflAlert !== 'red') _inflAlert = 'yellow'; });
  _inflOhmPools.forEach(p => { const u = ohmUsed(c); if (u > p.amount) _inflAlert = 'red'; else if (u < p.amount && _inflAlert !== 'red') _inflAlert = 'yellow'; });
  _inflInvPools.forEach(p => { const u = investedUsed(c); if (u > p.amount) _inflAlert = 'red'; else if (u < p.amount && _inflAlert !== 'red') _inflAlert = 'yellow'; });
  const _inflBadge = editMode ? _alertBadge(_inflAlert) : '';
  let h = '<div class="sh-sec"><div class="sh-sec-title">Influence Merits' + _inflBadge + '</div><div class="merit-list">';
  if (editMode) {
    // All non-Contacts influence merits
    const _inflMciPool = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false).reduce((s, m) => s + mciPoolTotal(m), 0);
    const _inflHasVM = hasViralMythology(c);
    const _inflHasLK = hasLorekeeper(c);
    const _inflHasINV = hasInvested(c);
    const _invMerits = new Set(['Herd', 'Mentor', 'Resources', 'Retainer']);
    const nonContacts = inflM.filter(m => m.name !== 'Contacts');
    const _inflHWV = hasHoneyWithVinegar(c);
    nonContacts.forEach(m => {
      const idx = inflM.indexOf(m), inf = calcMeritInfluence(c, m, _inflHWV), tOpts = buildSubCategoryMeritOptions(c, 'influence', m.name), rIdx = c.merits.indexOf(m), dd = (m.cp || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_attache || 0) + attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name) + (m.xp || 0);
      const _iPurch = (m.cp || 0) + (m.xp || 0);
      let _areaHtml;
      if (m.name === 'Attach\u00e9') {
        const _attEligible = (c.merits || []).filter(m2 => ['Contacts', 'Resources', 'Safe Place'].includes(m2.name));
        const _attKey = m2 => m2.name + (m2.area ? ' (' + m2.area + ')' : '');
        const _attOpts = ['<option value="">(select target)</option>']
          .concat(_attEligible.map(m2 => '<option value="' + esc(_attKey(m2)) + '"' + (m.attached_to === _attKey(m2) ? ' selected' : '') + '>' + esc(_attKey(m2)) + '</option>'))
          .join('');
        _areaHtml = '<select class="infl-area" onchange="shEditInflMerit(' + idx + ',\'attached_to\',this.value||null)">' + _attOpts + '</select>'
          + '<label class="infl-ghoul-lbl"><input type="checkbox"' + (m.ghoul ? ' checked' : '') + ' onchange="shEditInflMerit(' + idx + ',\'ghoul\',this.checked)"> Ghoul</label>';
      } else {
        _areaHtml = _inflArea(m, idx, false);
      }
      h += '<div class="infl-edit-row"><select class="infl-type" onchange="shEditInflMerit(' + idx + ',\'name\',this.value);renderSheet(chars[editIdx])">' + tOpts + '</select>' + _areaHtml + '<span class="infl-dots-derived">' + '\u25CF'.repeat(_iPurch) + '\u25CB'.repeat(Math.max(0, dd - _iPurch)) + '</span><span class="infl-inf">' + (inf ? '<span class="infl-tier-chip">' + inf + ' Inf</span>' : '') + '</span>';
      if (m.granted_by) h += '<span class="gen-granted-tag">' + esc(m.granted_by) + '</span>';
      h += '<button class="dev-rm-btn" onclick="shRemoveInflMerit(' + idx + ')" title="Remove">&times;</button></div>';
      const _isAttacheVariant = m.name?.startsWith('Attach\u00e9 (');
      h += meritBdRow(rIdx, m, m.name === 'Attach\u00e9' || _isAttacheVariant ? null : meritFixedRating(m.name), { showMCI: _inflMciPool > 0, showVM: _inflHasVM && m.name === 'Allies', showLK: _inflHasLK && m.name === 'Retainer', showINV: _inflHasINV && (_invMerits.has(m.name) || _isAttacheVariant || (m.name === 'Attach\u00e9' && (m.cp || 0) + (m.xp || 0) >= 1)), attachBonus: attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name) }); h += _prereqWarn(c, m.name);
      h += _derivedNotes(m);
      const _attBonus = attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name);
      if (_attBonus > 0) h += '<div class="derived-note">Attach\u00e9: +' + _attBonus + ' dot' + (_attBonus !== 1 ? 's' : '') + ' (Invictus Status ' + effectiveInvictusStatus(c) + ')</div>';
    });
    // Contacts: single entry with sphere-per-dot
    const contactsEntry = inflM.find(m => m.name === 'Contacts');
    const cInf = calcContactsInfluence(c);
    if (contactsEntry) {
      const cIdx = c.merits.indexOf(contactsEntry), rating = contactsEntry.rating || 0, spheres = contactsEntry.spheres || [], baseDots = (contactsEntry.cp || 0) + (contactsEntry.xp || 0), spOpts = s => INFLUENCE_SPHERES.map(sp => '<option' + (s === sp ? ' selected' : '') + '>' + sp + '</option>').join('');
      h += '<div class="contacts-edit-block"><div class="contacts-edit-hdr">Contacts ' + '\u25CF'.repeat(baseDots) + '\u25CB'.repeat(Math.max(0, rating - baseDots)) + (cInf ? ' \u2014 <span class="inf-val">' + cInf + '</span> inf' : '') + '</div>';
      const _cKey = contactsEntry.area ? 'Contacts (' + contactsEntry.area + ')' : 'Contacts';
      h += meritBdRow(cIdx, contactsEntry, meritFixedRating(contactsEntry.name), { showMCI: _inflMciPool > 0, attachBonus: attacheBonusDots(c, _cKey) });
      const _cAttBonus = attacheBonusDots(c, _cKey);
      if (_cAttBonus > 0) h += '<div class="derived-note">Attach\u00e9: +' + _cAttBonus + ' dot' + (_cAttBonus !== 1 ? 's' : '') + ' (Invictus Status ' + effectiveInvictusStatus(c) + ')</div>';
      h += _derivedNotes(contactsEntry);
      for (let d = 0; d < rating; d++) {
        const sp = spheres[d] || '';
        let src = '';
        if (d < baseDots) src = 'base';
        else src = 'granted';
        h += '<div class="contacts-dot-row"><span class="contacts-dot-num">\u25CF ' + (d + 1) + '</span><select class="contacts-sphere-sel" onchange="shEditContactSphere(' + cIdx + ',' + d + ',this.value)"><option value="">\u2014 sphere \u2014</option>' + spOpts(sp) + '</select>' + (src !== 'base' ? '<span class="contacts-dot-src">' + src + '</span>' : '') + '</div>';
      }
      h += '</div>';
    }
    h += '<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddInflMerit(\'Allies\')">+ Add Allies / Other</button></div>';
    h += '<div class="infl-total" title="' + _inflTip + '">Total Influence: <span class="inf-n">' + totalInfl + '</span></div>';
  } else {
    inflM.filter(m => m.name !== 'Contacts').slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((m, idx) => {
      const area = (m.area || '').trim() || null, gt = m.name === 'Retainer' && m.ghoul ? ' (ghoul)' : '', tags = m._grant_sources || [], gb = tags.length ? (' <span class="gen-granted-tag-view">' + tags.join(', ') + '</span>') : '';
      const iRIdx = c.merits.indexOf(m);
      const iPurch = (m.cp || 0) + (m.xp || 0), iBon = (m.free_mci || 0) + (m.free_vm || 0) + (m.free_ohm || 0) + (m.free_lk || 0) + (m.free_inv || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_pt || 0) + (m.free_sw || 0) + (m.free_attache || 0) + attacheBonusDots(c, area ? m.name + ' (' + area + ')' : m.name);
      h += shRenderMeritRow((area ? m.name + ' (' + area + gt + ')' : m.name + gt) + gb, 'infl', idx, shDotsMixed(iPurch, iBon));
    });
    const ce = inflM.filter(m => m.name === 'Contacts');
    if (ce.length) {
      let totalPurch = 0, totalRating = 0;
      ce.forEach(m => {
        totalPurch += (m.cp || 0) + (m.xp || 0);
        totalRating += (m.rating || 0);
      });
      totalRating = Math.min(5, totalRating);
      const cPurch = Math.min(totalPurch, totalRating);
      const cBon = Math.max(0, totalRating - cPurch);
      const allSp = [];
      ce.forEach(m => {
        if (m.spheres && m.spheres.length) allSp.push(...m.spheres);
        else if (m.area) allSp.push(m.area.trim());
        else if (m.qualifier) allSp.push(...m.qualifier.split(/,\s*/).filter(Boolean));
      });
      const sp = [...new Set(allSp)].join(', ');
      h += shRenderMeritRow('Contacts' + (sp ? ' (' + sp + ')' : ''), 'infl', 'contacts', shDotsMixed(cPurch, cBon));
    }
    h += '<div class="infl-total" title="' + _inflTip + '">Total Influence: <span class="inf-n">' + totalInfl + '</span></div>';
  }
  h += '</div></div>'; return h;
}
function _inflArea(m, idx, isC) {
  const spOpts = s => INFLUENCE_SPHERES.map(sp => '<option' + (s === sp ? ' selected' : '') + '>' + sp + '</option>').join('');
  if (m.name === 'Allies') return '<select class="infl-area" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)"><option value="">\u2014 sphere \u2014</option>' + spOpts(m.area) + '</select>';
  if (isC) return '<span class="infl-area-fixed">' + esc(m.area || '\u2014') + '</span>';
  if (m.name === 'Resources') return '<span class="infl-area-none"></span>';
  if (m.name === 'Mentor') return '<input type="text" class="infl-area" value="' + esc(m.area || '') + '" placeholder="Mentor name" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)">';
  // Retainer + Attaché variants share the same row affordances — Attachés are
  // functionally Retainers (description text + Ghoul flag) per game-rule.
  if (m.name === 'Retainer' || m.name?.startsWith('Attaché (')) return '<input type="text" class="infl-area" value="' + esc(m.area || '') + '" placeholder="Description" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)"><label class="infl-ghoul-lbl"><input type="checkbox"' + (m.ghoul ? ' checked' : '') + ' onchange="shEditInflMerit(' + idx + ',\'ghoul\',this.checked)"> Ghoul</label>';
  if (m.name === 'Staff') return '<input type="text" class="infl-area" value="' + esc(m.area || '') + '" placeholder="Area of expertise" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)">';
  if (m.name === 'Status') { const isNarrow = m.narrow || (m.area && !INFLUENCE_SPHERES.includes(m.area)); return '<button class="infl-mode-btn" onclick="shEditStatusMode(' + idx + ')" title="' + (isNarrow ? 'Switch to sphere' : 'Switch to narrow') + '">' + (isNarrow ? 'Sphere \u2195' : 'Narrow \u2195') + '</button>' + (isNarrow ? '<input type="text" class="infl-area infl-area-narrow" value="' + esc(m.area || '') + '" placeholder="Narrow status" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)">' : '<select class="infl-area" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)"><option value="">\u2014 sphere \u2014</option>' + spOpts(m.area) + '</select>'); }
  return '<input type="text" class="infl-area" value="' + esc(m.area || '') + '" placeholder="Sphere / scope" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)">';
}

export function shRenderDomainMerits(c, editMode) {
  const chars = state.chars, domM = (c.merits || []).filter(m => m.category === 'domain');
  if (!editMode && !domM.length) return '';
  const _domLkPools = (c._grant_pools || []).filter(p => p.category === 'lk');
  const _domInvPools = (c._grant_pools || []).filter(p => p.category === 'inv');
  let _domAlert = null;
  _domLkPools.forEach(p => { const u = lorekeeperUsed(c); if (u > p.amount) _domAlert = 'red'; else if (u < p.amount && _domAlert !== 'red') _domAlert = 'yellow'; });
  _domInvPools.forEach(p => { const u = investedUsed(c); if (u > p.amount) _domAlert = 'red'; else if (u < p.amount && _domAlert !== 'red') _domAlert = 'yellow'; });
  const _domBadge = editMode ? _alertBadge(_domAlert) : '';
  let h = '<div class="sh-sec"><div class="sh-sec-title">Domain Merits' + _domBadge + '</div><div class="merit-list">';
  if (editMode) {
    const _domMciPool = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false).reduce((s, m) => s + mciPoolTotal(m), 0);
    const _hasLK = hasLorekeeper(c); const _hasINV = hasInvested(c); const _hasVM = hasViralMythology(c);
    domM.forEach((m, di) => {
      const hTk = domM.some((dm, dj) => dm.name === 'Herd' && dj !== di);
      // Catalog-driven options (sub_category='domain'), with the Herd-once-per-character
      // rule layered on top. Mandragora Garden's prereq is enforced by the helper.
      let tOpts = buildSubCategoryMeritOptions(c, 'domain', m.name);
      if (hTk && m.name !== 'Herd') {
        // Strip Herd from this row's options if another row already has Herd
        tOpts = tOpts.replace(/<option value="Herd"[^>]*>Herd<\/option>/g, '');
      }
      const rIdx = c.merits.indexOf(m), dd = (m.cp || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_inv || 0) + (m.free_attache || 0) + attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name) + (m.xp || 0), parts = m.shared_with || [], eT = domMeritTotal(c, m.name), avP = [...chars].filter(ch => ch.name !== c.name && !parts.includes(ch.name)).sort((a, b) => sortName(a).localeCompare(sortName(b)));
      // Total display: own dots filled + partner contribution hollow.
      // Cap own at the total so a single character can't double-paint dots
      // beyond the merit's effective rating.
      const _ownCapped = Math.min(dd, eT);
      const _partnerDots = Math.max(0, eT - _ownCapped);
      const _totalDots = _partnerDots > 0 ? shDotsMixed(_ownCapped, _partnerDots) : shDots(eT);
      const _dPurch = (m.cp || 0) + (m.xp || 0);
      h += '<div class="dom-edit-block"><div class="infl-edit-row"><select class="infl-type" onchange="shEditDomMerit(' + di + ',\'name\',this.value)">' + tOpts + '</select><span class="dom-contrib-lbl">My dots: ' + '\u25CF'.repeat(_dPurch) + '\u25CB'.repeat(Math.max(0, dd - _dPurch)) + '</span><span class="dom-total-lbl" title="Total across all contributors (\u25CF own, \u25CB partners)">Total: ' + _totalDots + '</span><button class="dev-rm-btn" onclick="shRemoveDomMerit(' + di + ')" title="Remove">&times;</button></div>';
      const _isLKMerit = m.name === 'Herd' || m.name === 'Retainer'; const _isINVMerit = m.name === 'Herd'; const _isVMMerit = m.name === 'Herd';
      h += meritBdRow(rIdx, m, meritFixedRating(m.name), { showMCI: _domMciPool > 0, showVM: _hasVM && _isVMMerit, showLK: _hasLK && _isLKMerit, showINV: _hasINV && _isINVMerit, attachBonus: attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name) }); h += _prereqWarn(c, m.name);
      h += _derivedNotes(m);
      if (m.name === 'Herd') { const ssjB = ssjHerdBonus(c); if (ssjB) h += '<div class="derived-note">SSJ Bonus: +' + ssjB + ' dots (' + shDots(ssjB) + ') \u2014 equals MCI dots</div>'; }
      if (m.name === 'Herd') { const flockB = flockHerdBonus(c); if (flockB) h += '<div class="derived-note">Flock Bonus: +' + flockB + ' dots (' + shDots(flockB) + ') \u2014 equals Flock rating, can exceed 5</div>'; }
      if (!['Herd', 'Feeding Grounds'].includes(m.name) && parts.length) { h += '<div class="dom-partners-row">'; parts.forEach(pN => { const p = chars.find(ch => ch.name === pN), pD = p ? domMeritShareable(p, m.name) : 0; h += '<span class="dom-partner-tag">' + esc(pN) + (pD ? ' ' + shDots(pD) : ' \u25CB') + '<button class="dom-partner-rm" onclick="shRemoveDomainPartner(' + di + ',\'' + pN.replace(/'/g, "\\'") + '\')">\u00D7</button></span>'; }); h += '</div>'; }
      if (!['Herd', 'Feeding Grounds'].includes(m.name) && avP.length) h += '<div class="dom-add-partner-row"><select class="dom-partner-sel" onchange="if(this.value){shAddDomainPartner(' + di + ',this.value);this.value=\'\';}"><option value="">+ Add shared partner\u2026</option>' + avP.map(p => '<option value="' + esc(p.name) + '">' + esc(dropdownName(p)) + '</option>').join('') + '</select></div>';
      h += '</div>';
    });
    h += '<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddDomMerit()">+ Add Domain Merit</button></div>';
  } else {
    domM.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(m => {
      const dp = m.shared_with && m.shared_with.length ? m.shared_with : null, de = domMeritTotal(c, m.name), dO = domMeritContrib(c, m.name), _dRaw = (m.cp || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_inv || 0) + attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name) + (m.xp || 0), ssjB = !dp && m.name === 'Herd' ? ssjHerdBonus(c) : 0, flockB = !dp && m.name === 'Herd' ? flockHerdBonus(c) : 0, fwbB = !dp ? (m.free_fwb || 0) : 0, attB = !dp ? (m.free_attache || 0) : 0, dPurch = (ssjB > 0 || flockB > 0 || fwbB > 0 || attB > 0) ? _dRaw : Math.min(5, _dRaw);
      const dotHtml = (ssjB > 0 || flockB > 0 || fwbB > 0 || attB > 0) ? shDotsMixed(dPurch, Math.max(0, de - dPurch)) : '<span class="trait-dots">' + shDots(de) + '</span>';
      // Shared display: own dots filled + partner contribution hollow.
      const _shOwn = Math.min(dO, de);
      const _shPart = Math.max(0, de - _shOwn);
      const _shHtml = '<div class="dom-total-view" title="\u25CF own, \u25CB partners">' + shDotsMixed(_shOwn, _shPart) + '</div>';
      h += '<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">' + esc(m.name) + '</span><div class="trait-right">' + (dp ? _shHtml : dotHtml) + '</div></div>' + (dp ? '<div class="trait-sub"><span class="trait-qual dom-shared-lbl">Shared \u00B7 ' + dp.map(n => { const p = chars.find(ch => ch.name === n), pd = p ? domMeritShareable(p, m.name) : 0; return esc(n) + (pd ? ' ' + shDots(pd) : ''); }).join(', ') + '</span></div>' : '') + '</div></div>';
    });
  }
  h += '</div></div>'; return h;
}

export function shRenderStandingMerits(c, editMode) {
  const standM = (c.merits || []).filter(m => m.category === 'standing');
  if (!editMode && !standM.length) return '';
  let h = '<div class="sh-sec"><div class="sh-sec-title">Standing Merits</div><div class="merit-list">';
  const _standMciPool = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false).reduce((s, m) => s + mciPoolTotal(m), 0);
  const _standSorted = editMode ? standM : standM.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  _standSorted.forEach((m, si) => {
    const rIdx = c.merits.indexOf(m), dd = (m.cp || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.xp || 0);
    const _stPurch = (m.cp || 0) + (m.xp || 0);
    if (m.name === 'Mystery Cult Initiation') h += _renderMCI(c, m, si, rIdx, m, dd, editMode);
    else if (m.name === 'Professional Training') h += _renderPT(c, m, si, rIdx, m, dd, editMode, _standMciPool);
    else if (editMode) {
      h += '<div class="infl-edit-row"><input type="text" class="gen-name-input" value="' + esc(m.name) + '" placeholder="Merit name" onchange="shEditStandMerit(' + si + ',\'name\',this.value)"><span class="infl-dots-derived">' + '\u25CF'.repeat(_stPurch) + '\u25CB'.repeat(Math.max(0, dd - _stPurch)) + '</span></div>';
      h += meritBdRow(rIdx, m, meritFixedRating(m.name), { showMCI: _standMciPool > 0 });
      h += _prereqWarn(c, m.name);
      h += _derivedNotes(m);
      if (m.name === 'Oath of the Scapegoat' && dd > 0) {
        if (c.covenant === 'Invictus') h += '<div class="derived-note">OTS: grants +' + dd + ' Invictus Covenant Status (no normal purchase) ' + shDots(dd) + '</div>';
        h += '<div class="derived-note">OTS: +' + (dd * 2) + ' free style/merit dots (' + (c._ots_free_dots || 0) + ' pool)</div>';
      }
    }
    else { const sub = m.cult_name || m.role || '', assets = m.asset_skills && m.asset_skills.length ? m.asset_skills.join(', ') : ''; const _sSub = [sub ? esc(sub) : '', assets ? 'Asset Skills: ' + esc(assets) : ''].filter(Boolean).join(' \u00B7 '); h += '<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">' + esc(m.name) + '</span><div class="trait-right">' + shDotsMixed(_stPurch, Math.max(0, (m.rating || 0) - _stPurch)) + '</div></div>' + (_sSub ? '<div class="trait-sub"><span class="trait-qual">' + _sSub + '</span></div>' : '') + '</div></div>'; }
  });
  if (editMode) {
    const hasMCI = standM.some(m => m.name === 'Mystery Cult Initiation');
    const hasPT = standM.some(m => m.name === 'Professional Training');
    h += '<div class="dev-add-row">';
    if (!hasMCI) h += '<button class="dev-add-btn" onclick="shAddStandMCI()">+ Add MCI</button>';
    if (!hasPT) h += '<button class="dev-add-btn" onclick="shAddStandPT()">+ Add Prof. Training</button>';
    h += '</div>';
  }
  h += '</div></div>'; return h;
}
function _renderMCI(c, m, si, rIdx, mc, dd, editMode) {
  const inactive = m.active === false, eDots = editMode ? dd : m.rating;
  const dots = ['\u25CF', '\u25CF\u25CF', '\u25CF\u25CF\u25CF', '\u25CF\u25CF\u25CF\u25CF', '\u25CF\u25CF\u25CF\u25CF\u25CF'];
  let h = '<div class="mci-block' + (inactive ? ' mci-inactive' : '') + '"><div class="mci-header"><div class="mci-title"><span class="merit-name-sh">' + esc(m.name) + '</span>';
  if (editMode) h += '<input type="text" class="stand-name-input" value="' + esc(m.cult_name || '') + '" placeholder="Cult name" onchange="shEditStandMerit(' + si + ',\'cult_name\',this.value)">';
  else if (m.cult_name) h += '<span class="trait-qual">' + esc(m.cult_name) + '</span>';
  h += '</div><div class="mci-header-right">';
  if (editMode) { h += '<button class="mci-toggle-btn" onclick="shToggleMCI(' + si + ')" title="' + (inactive ? 'Activate cult' : 'Suspend cult') + '">' + (inactive ? 'Suspended' : 'Active') + '</button>'; h += '<button class="dev-rm-btn" onclick="shRemoveStandMerit(' + si + ')" title="Remove MCI">\u00D7</button>'; }
  else if (inactive) h += '<span class="mci-toggle-btn" style="opacity:0.5">Suspended</span>';
  h += '<span class="trait-dots">' + shDots(eDots) + '</span></div></div>';
  if (editMode) {
    h += meritBdRow(rIdx, m, meritFixedRating(m.name)); h += _prereqWarn(c, m.name);
    const d1c = m.dot1_choice || 'merits', d3c = m.dot3_choice || 'merits', d5c = m.dot5_choice || 'merits';
    for (let d = 0; d < 5 && d < eDots; d++) {
      h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">' + dots[d] + '</span><div class="mci-dot-content">';
      if (d === 0) {
        h += '<button class="mci-choice-btn' + (d1c === 'speciality' ? ' mci-choice-active' : '') + '" onclick="shEditMCIDot(' + si + ',\'dot1_choice\',\'speciality\')">Specialisation</button>';
        h += '<button class="mci-choice-btn' + (d1c === 'merits' ? ' mci-choice-active' : '') + '" onclick="shEditMCIDot(' + si + ',\'dot1_choice\',\'merits\')">1 Merit</button>';
        if (d1c === 'speciality') {
          const _spcMissing = !m.dot1_spec_skill || !m.dot1_spec;
          h += '<span class="mci-spec-pick' + (_spcMissing ? ' has-unfilled' : '') + '">';
          h += '<select class="pt-skill-sel" onchange="shEditMCIDot(' + si + ',\'dot1_spec_skill\',this.value)"><option value="">' + (m.dot1_spec_skill || '\u2014 skill \u2014') + '</option>' + ALL_SKILLS.map(sk => '<option' + (m.dot1_spec_skill === sk ? ' selected' : '') + '>' + esc(sk) + '</option>').join('') + '</select>';
          h += '<input type="text" class="stand-name-input" value="' + esc(m.dot1_spec || '') + '" placeholder="Specialisation" onchange="shEditMCIDot(' + si + ',\'dot1_spec\',this.value)">';
          h += '</span>';
        }
      } else if (d === 1) {
        h += '<span class="mci-benefit-text">1 merit dot</span>';
      } else if (d === 2) {
        h += '<button class="mci-choice-btn' + (d3c === 'skill' ? ' mci-choice-active' : '') + '" onclick="shEditMCIDot(' + si + ',\'dot3_choice\',\'skill\')">Skill Dot</button>';
        h += '<button class="mci-choice-btn' + (d3c === 'merits' ? ' mci-choice-active' : '') + '" onclick="shEditMCIDot(' + si + ',\'dot3_choice\',\'merits\')">2 Merits</button>';
        if (d3c === 'skill') {
          const _d3Missing = !m.dot3_skill;
          const _d3Skills = ALL_SKILLS.filter(sk => { const s = c.skills?.[sk]; return (s?.dots || 0) < 5; });
          h += '<span class="mci-spec-pick' + (_d3Missing ? ' has-unfilled' : '') + '"><select class="pt-skill-sel" onchange="shEditMCIDot(' + si + ',\'dot3_skill\',this.value)"><option value="">' + (m.dot3_skill || '\u2014 skill \u2014') + '</option>' + _d3Skills.map(sk => '<option' + (m.dot3_skill === sk ? ' selected' : '') + '>' + esc(sk) + '</option>').join('') + '</select></span>';
        }
      } else if (d === 3) {
        h += '<span class="mci-benefit-text">3 merit dots</span>';
      } else if (d === 4) {
        h += '<button class="mci-choice-btn' + (d5c === 'advantage' ? ' mci-choice-active' : '') + '" onclick="shEditMCIDot(' + si + ',\'dot5_choice\',\'advantage\')">Advantage</button>';
        h += '<button class="mci-choice-btn' + (d5c === 'merits' ? ' mci-choice-active' : '') + '" onclick="shEditMCIDot(' + si + ',\'dot5_choice\',\'merits\')">3 Merits</button>';
        if (d5c === 'advantage') {
          const _d5Missing = !m.dot5_text;
          h += '<span class="mci-spec-pick' + (_d5Missing ? ' has-unfilled' : '') + '"><input type="text" class="stand-name-input" value="' + esc(m.dot5_text || '') + '" placeholder="Advantage description" onchange="shEditMCIDot(' + si + ',\'dot5_text\',this.value)"></span>';
        }
      }
      h += '</div></div>';
    }
    const pool = mciPoolTotal(m);
    if (pool > 0) h += '<div class="mci-pool-row"><span class="mci-pool-lbl">Merit Pool</span><span class="mci-pool-val">' + pool + ' dot' + (pool === 1 ? '' : 's') + ' \u2014 allocate via MCI field on each merit</span></div>';
  } else if (!inactive) {
    const d1c = m.dot1_choice || 'merits', d3c = m.dot3_choice || 'merits', d5c = m.dot5_choice || 'merits';
    for (let d = 0; d < 5 && d < m.rating; d++) {
      let txt;
      if (d === 0) {
        if (d1c === 'speciality') txt = 'Spec: ' + (m.dot1_spec_skill ? esc(m.dot1_spec_skill) + (m.dot1_spec ? ' (' + esc(m.dot1_spec) + ')' : '') : '<span class="mci-unset">(unset)</span>');
        else txt = '1 merit dot';
      } else if (d === 1) {
        txt = '1 merit dot';
      } else if (d === 2) {
        if (d3c === 'skill') txt = 'Skill: ' + (m.dot3_skill ? esc(m.dot3_skill) + ' +1' : '<span class="mci-unset">(unset)</span>');
        else txt = '2 merit dots';
      } else if (d === 3) {
        txt = '3 merit dots';
      } else if (d === 4) {
        if (d5c === 'advantage') txt = 'Advantage: ' + (m.dot5_text ? esc(m.dot5_text) : '<span class="mci-unset">(unset)</span>');
        else txt = '3 merit dots';
      }
      h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">' + dots[d] + '</span><span class="mci-benefit-text">' + (txt || '') + '</span></div>';
    }
  }
  h += '</div>'; return h;
}
function _renderPT(c, m, si, rIdx, mc, dd, editMode, mciPool = 0) {
  const inactive = m.active === false;
  const as = m.asset_skills || [], eDots = editMode ? dd : m.rating;
  const dots = ['\u25CF', '\u25CF\u25CF', '\u25CF\u25CF\u25CF', '\u25CF\u25CF\u25CF\u25CF', '\u25CF\u25CF\u25CF\u25CF\u25CF'];
  const _skSel = (slotIdx, label) => { const cur = as[slotIdx] || ''; return '<select class="pt-skill-sel" onchange="shEditStandAssetSkill(' + si + ',' + slotIdx + ',this.value)"><option value="">' + (cur || label) + '</option>' + ALL_SKILLS.map(sk => '<option' + (cur === sk ? ' selected' : '') + '>' + esc(sk) + '</option>').join('') + '</select>'; };
  let h = '<div class="pt-block' + (inactive ? ' mci-inactive' : '') + '"><div class="pt-header"><div class="mci-title"><span class="merit-name-sh">' + esc(m.name) + '</span>';
  if (editMode) h += '<input type="text" class="stand-name-input" value="' + esc(m.role || '') + '" placeholder="Role" onchange="shEditStandMerit(' + si + ',\'role\',this.value)">';
  else if (m.role) h += '<span class="trait-qual">' + esc(m.role) + '</span>';
  h += '</div><div class="mci-header-right">';
  if (editMode) { h += '<button class="mci-toggle-btn" onclick="shTogglePT(' + si + ')" title="' + (inactive ? 'Activate PT' : 'Suspend PT') + '">' + (inactive ? 'Suspended' : 'Active') + '</button>'; h += '<button class="dev-rm-btn" onclick="shRemoveStandMerit(' + si + ')" title="Remove PT">\u00D7</button>'; }
  else if (inactive) h += '<span class="mci-toggle-btn" style="opacity:0.5">Suspended</span>';
  h += '<span class="trait-dots">' + shDots(eDots) + '</span></div></div>';
  if (editMode) {
    h += meritBdRow(rIdx, m, meritFixedRating(m.name), { showMCI: mciPool > 0 });
    h += _prereqWarn(c, m.name);
    h += '<div class="pt-skills-edit">';
    if (eDots >= 1) h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF</span><span class="mci-benefit-text">Networking: 2 free Contacts' + (m.role ? ' (' + esc(m.role) + ')' : '') + '</span></div>';
    if (eDots >= 2) {
      const _pt2Missing = !as[0] || !as[1];
      h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF</span><div><span class="mci-benefit-text">Continuing Education: 9-Again on Asset Skills</span><div class="pt-skill-pick' + (_pt2Missing ? ' has-unfilled' : '') + '" style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">' + _skSel(0, '\u2014 skill 1 \u2014') + _skSel(1, '\u2014 skill 2 \u2014') + '</div></div></div>';
    }
    if (eDots >= 3) {
      const ptAssetSet3 = new Set(as.filter(Boolean));
      const _assetSp3 = Object.entries(c.skills || {}).filter(([sk]) => ptAssetSet3.has(sk)).reduce((s, [, sk]) => s + (sk.specs ? sk.specs.length : 0), 0);
      const ptFreeCov3 = Math.min(2, _assetSp3);
      const _pt3Missing = !as[2];
      h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF\u25CF</span><div><span class="mci-benefit-text">Breadth of Knowledge: 3rd Asset Skill + 2 PT Specialisations (Asset Skills only)</span><div class="pt-skill-pick' + (_pt3Missing ? ' has-unfilled' : '') + '" style="display:flex;gap:6px;margin-top:4px;align-items:center">' + _skSel(2, '\u2014 3rd skill \u2014') + '<span style="font-size:10px;color:var(--accent)">PT specs: ' + ptFreeCov3 + ' / 2 used</span></div></div></div>';
    }
    if (eDots >= 4) {
      const dot4 = m.dot4_skill || '', validAs = as.filter(Boolean);
      const _skEffDots = sk => { const so = (c.skills || {})[sk] || {}; return (so.cp || 0) + xpToDots(so.xp || 0, so.cp || 0, 2); };
      const eligibleAs = validAs.filter(sk => _skEffDots(sk) < 5);
      const _pt4Missing = !dot4 || !validAs.includes(dot4);
      h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF\u25CF\u25CF</span><div><span class="mci-benefit-text">On the Job Training: +1 dot in an Asset Skill</span><div class="pt-skill-pick' + (_pt4Missing ? ' has-unfilled' : '') + '" style="display:flex;gap:4px;margin-top:4px"><select class="pt-skill-sel" onchange="shEditStandMerit(' + si + ',\'dot4_skill\',this.value)"><option value="">' + (dot4 || '\u2014 choose \u2014') + '</option>' + eligibleAs.map(sk => '<option' + (dot4 === sk ? ' selected' : '') + '>' + esc(sk) + '</option>').join('') + '</select></div></div></div>';
    }
    if (eDots >= 5) h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF\u25CF\u25CF\u25CF</span><span class="mci-benefit-text">The Routine: spend 1 WP for Rote quality on any Asset Skill action. Adds +3 to roll</span></div>';
    h += '</div>';
  } else {
    if (as.filter(Boolean).length) h += '<div class="pt-assets"><span class="mci-benefit-text" style="flex-shrink:0">Asset Skills (9-Again):</span>' + as.filter(Boolean).map(s => '<span class="pt-skill-tag">' + esc(s) + '</span>').join('') + '</div>';
    const PT_BENEFITS = [
      '2 dots of Contacts',
      '2 Asset Skills',
      '3rd Asset Skill, +2 Specialisations on Asset Skills',
      '+1 dot in ' + (m.dot4_skill ? esc(m.dot4_skill) : 'an Asset Skill'),
      '1WP for Rote quality on any Asset Skill action'
    ];
    for (let d = 0; d < eDots && d < 5; d++) h += '<div class="mci-benefit-row"><span class="mci-dot-lbl">' + dots[d] + '</span><span class="mci-benefit-text">' + PT_BENEFITS[d] + '</span></div>';
  }
  h += '</div>'; return h;
}

export function shRenderGeneralMerits(c, editMode) {
  const oM = (c.merits || []).filter(m => m.category === 'general');
  if (!editMode && !oM.length) return '';
  const bpCP = (c.bp_creation && c.bp_creation.cp) || 0;
  const meritCPUsed = (c.merits || []).reduce((s, m) => s + (m.cp || 0), 0) + (c.fighting_styles || []).reduce((s, fs) => s + (fs.cp || 0), 0) + (c.powers || []).filter(p => p.category === 'pact').reduce((s, p) => s + (p.cp || 0), 0) + bpCP;
  const meritCPRem = 10 - meritCPUsed;
  const meritCPCls = meritCPRem < 0 ? ' over' : meritCPRem === 0 ? ' full' : '';
  let _meritAlert = meritCPRem < 0 ? 'red' : null;
  for (const _p of (c._grant_pools || []).filter(_p2 => _p2.category === 'any')) { const _u = getMCIPoolUsed(c); if (_u > _p.amount) { _meritAlert = 'red'; break; } else if (_u < _p.amount && _meritAlert !== 'red') _meritAlert = 'yellow'; }
  const _meritBadge = editMode ? _alertBadge(_meritAlert) : '';
  let h = '<div class="sh-sec"><div class="sh-sec-title">Merits' + _meritBadge + '</div><div class="merit-list">';
  if (editMode) {
    const _bpXP = (c.bp_creation && c.bp_creation.xp) || 0, _bpLost = (c.bp_creation && c.bp_creation.lost) || 0;
    const _bpDerived = Math.max(0, 1 + Math.floor(bpCP / 5) + Math.floor(_bpXP / 5) - _bpLost);
    // If humanity_lost not yet set, infer it from the stored drop so Lost input matches XP
    const _humLost = c.humanity_lost !== undefined ? c.humanity_lost : Math.max(0, (c.humanity_base || 7) - (c.humanity || 0));
    const _humXP = c.humanity_xp || 0;
    const _humDerived = Math.max(0, Math.min(10, (c.humanity_base || 7) + Math.floor(_humXP / 2) - _humLost));
    h += '<div class="sh-merit-cp-row"><span class="sh-cp-remaining' + meritCPCls + '">' + meritCPUsed + ' / 10 CP</span><span class="sh-merit-cp-lbl"> creation points used</span></div>';
    h += '<div class="sh-bh-grid">'
      + '<span class="sh-bh-lbl">BP</span>'
      + '<label class="sh-bh-field"><span class="sh-bh-flbl">CP</span><input class="attr-bd-input" type="number" min="0" max="10" value="' + bpCP + '" onchange="shEditBPCreation(+this.value)"></label>'
      + '<label class="sh-bh-field"><span class="sh-bh-flbl">XP</span><input class="attr-bd-input" type="number" min="0" value="' + _bpXP + '" onchange="shEditBPXP(+this.value)"></label>'
      + '<label class="sh-bh-field"><span class="sh-bh-flbl">Lost</span><input class="attr-bd-input" type="number" min="0" value="' + _bpLost + '" onchange="shEditBPLost(+this.value)"></label>'
      + '<span class="sh-bh-total">= BP ' + _bpDerived + (_bpDerived > 2 ? ' <span class="sh-bh-alert">\u26A0 cap</span>' : '') + '</span>'
      + '<span class="sh-bh-lbl">Humanity</span>'
      + '<span class="sh-bh-field"></span>'
      + '<label class="sh-bh-field"><span class="sh-bh-flbl">XP</span><input class="attr-bd-input" type="number" min="0" value="' + _humXP + '" onchange="shEditHumanityXP(+this.value)"></label>'
      + '<label class="sh-bh-field"><span class="sh-bh-flbl">Lost</span><input class="attr-bd-input" type="number" min="0" value="' + _humLost + '" onchange="shEditHumanityLost(+this.value)"></label>'
      + '<span class="sh-bh-total">= Humanity ' + _humDerived + '</span>'
      + '</div>';
    h += _renderPoolCounters(c, 'general') + _renderPoolCounters(c, 'influence') + _renderPoolCounters(c, 'domain');
    const _genMciPool = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false).reduce((s, m) => s + mciPoolTotal(m), 0);
    const _KERBEROS_ASPECTS = ['Monstrous', 'Competitive', 'Seductive'];
    const _CRUAC_STYLES = ['Opening the Void', 'Primal Creation', 'Unbridled Chaos'];
    const _mdbMerit = oM.find(m => m.name === 'The Mother-Daughter Bond');
    const _mdbChosenStyle = _mdbMerit && _mdbMerit.qualifier;
    const _mdbMentorRating = (() => { const mentorM = (c.merits || []).find(m => m.category === 'influence' && m.name === 'Mentor'); if (!mentorM) return 0; return (mentorM.cp || 0) + (mentorM.free_mci || 0) + (mentorM.xp || 0); })();
    oM.forEach((m, gi) => {
      const rIdx = c.merits.indexOf(m), dd = (m.cp || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0) + (m.xp || 0), isAoE = m.name?.toLowerCase() === 'area of expertise', isIS = m.name?.toLowerCase() === 'interdisciplinary specialty', isFT = m.name === 'Fucking Thief', isKerberos = m.name === 'Three Heads of Kerberos', isDC = m.name === 'Defensive Combat', isFF = m.name === 'Fighting Finesse', isMDB = m.name === 'The Mother-Daughter Bond', nSp = isAoE || isIS, cSp = Object.values(c.skills || {}).flatMap(sk => sk.specs || []);
      // Merits that accept a free-text qualifier (all others show no qualifier input unless one is already set)
      const _FREE_TEXT_QUAL = new Set(['Language','Multilingual','Library','Quick Draw','Mandragora Garden']);
      const _gPurch = (m.cp || 0) + (m.xp || 0);
      if (m.granted_by) { h += '<div class="gen-edit-row gen-granted-row"><span class="gen-granted-name">' + esc(m.name) + (m.qualifier ? ' (' + esc(m.qualifier) + ')' : '') + '</span><span class="infl-dots-derived">' + '\u25CF'.repeat(_gPurch) + '\u25CB'.repeat(Math.max(0, dd - _gPurch)) + '</span><span class="gen-granted-tag" title="Granted by ' + esc(m.granted_by) + '">' + esc(m.granted_by) + '</span></div>'; h += meritBdRow(rIdx, m, meritFixedRating(m.name), { showMCI: _genMciPool > 0 }); h += _derivedNotes(m); h += _prereqWarn(c, m.name, m); }
      else {
        h += '<div class="gen-edit-row"><select class="gen-name-select" onchange="shEditGenMerit(' + gi + ',\'name\',this.value)">' + buildMeritOptions(c, m.name || '') + '</select>';
        if (isFT) h += '<select class="gen-qual-input" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)">' + buildFThiefOptions(m.qualifier || '') + '</select>';
        else if (isDC || isFF) h += '<select class="gen-qual-input" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)"><option value="">' + (m.qualifier || '\u2014 skill \u2014') + '</option>' + ['Brawl', 'Weaponry'].map(s => '<option' + (m.qualifier === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>';
        else if (isMDB) h += '<select class="gen-qual-input" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)"><option value="">' + (m.qualifier || '\u2014 Cr\u00FAac Style \u2014') + '</option>' + _CRUAC_STYLES.map(s => '<option' + (m.qualifier === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>';
        else if (isKerberos) h += '<select class="gen-qual-input" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)"><option value="">' + (m.qualifier || '\u2014 Aspect \u2014') + '</option>' + _KERBEROS_ASPECTS.map(a => '<option' + (m.qualifier === a ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>';
        else if (nSp) {
          if (cSp.length) {
            h += '<select class="gen-qual-input" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)"><option value="">\u2014 spec \u2014</option>' + cSp.map(sp => '<option value="' + esc(sp) + '"' + (m.qualifier === sp ? ' selected' : '') + '>' + esc(sp) + '</option>').join('') + '</select>';
          } else {
            h += '<select class="gen-qual-input" disabled><option value="">\u2014 add a specialisation first \u2014</option></select>';
          }
        } else if (_FREE_TEXT_QUAL.has(m.name) || m.qualifier) h += '<input type="text" class="gen-qual-input" value="' + esc(m.qualifier || '') + '" placeholder="Qualifier" onchange="shEditGenMerit(' + gi + ',\'qualifier\',this.value)">';
        h += '<span class="infl-dots-derived">' + '\u25CF'.repeat(_gPurch) + '\u25CB'.repeat(Math.max(0, dd - _gPurch)) + '</span><button class="dev-rm-btn" onclick="shRemoveGenMerit(' + gi + ')" title="Remove">&times;</button></div>';
        h += meritBdRow(rIdx, m, meritFixedRating(m.name), { showMCI: _genMciPool > 0 });
        h += _derivedNotes(m);
        h += _prereqWarn(c, m.name, m);
      }
    });
    h += '<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddGenMerit()">+ Add Merit</button></div>';
  } else {
    oM.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((m, i) => {
      const qual = m.qualifier ? ' (' + m.qualifier + ')' : '';
      const pw = _prereqWarn(c, m.name, m);
      const purch = (m.cp || 0) + (m.xp || 0), bon = (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0);
      const dotH = shDotsMixed(purch, bon);
      if (m.granted_by) {
        const gb = m.granted_by === 'Mystery Cult Initiation' ? 'MCI' : m.granted_by === 'Professional Training' ? 'PT' : m.granted_by;
        const grantTag = '<span class="gen-granted-tag-view" title="Granted by ' + esc(m.granted_by) + '">' + esc(gb) + '</span>';
        h += shRenderMeritRow(m.name + qual, 'gmerit', i, dotH, grantTag);
        if (pw) h += pw;
      } else { h += shRenderMeritRow(m.name + qual, 'merit', i, dotH); if (pw) h += pw; }
    });
  }
  h += '</div></div>'; return h;
}

/** Compute tag counts from all fighting styles (includes free_mci dots). */
function _tagCounts(c) {
  const counts = {};
  (c.fighting_styles || []).forEach(fs => {
    const dots = (fs.cp || 0) + (fs.free_mci || 0) + (fs.free_ots || 0) + (fs.xp || 0);
    const tags = STYLE_TAGS[fs.name] || [];
    tags.forEach(t => { counts[t] = (counts[t] || 0) + dots; });
  });
  return counts;
}

/** Non-combat style names — live in general merits, not fighting_styles. */
const NON_COMBAT_STYLES = new Set(['Fast-Talking', 'Cacophony Savvy', 'Etiquette', 'Three Heads of Kerberos']);

/** Max accessible rank for a style = max(own dots, highest relevant tag count). */
function _maxRank(c, styleName, dots) {
  const tags = STYLE_TAGS[styleName] || [];
  const tc = _tagCounts(c);
  let maxTag = 0;
  tags.forEach(t => { if ((tc[t] || 0) > maxTag) maxTag = tc[t]; });
  return Math.max(dots, maxTag);
}

// ── Prereq checking ───────────────────────────────────────────────────────────

const _ATTR_MAP = {
  'Dex': 'Dexterity', 'Dexterity': 'Dexterity',
  'Str': 'Strength', 'Strength': 'Strength',
  'Sta': 'Stamina', 'Stamina': 'Stamina',
  'Wits': 'Wits', 'Composure': 'Composure', 'Resolve': 'Resolve',
  'Manipulation': 'Manipulation', 'Intelligence': 'Intelligence', 'Presence': 'Presence'
};

const _SKILL_SET = new Set([
  'Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry',
  'Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge',
  'Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science'
]);

const _COV_STATUS_MAP = {
  'crone': 'Circle of the Crone', 'invictus': 'Invictus',
  'sanctum': 'Ordo Dracul', 'carthian': 'Carthian Movement',
  'lancea': 'Lancea et Sanctum'
};

function _attrDots(c, fullName) {
  const obj = (c.attributes || {})[fullName];
  return obj ? (obj.dots || 0) + (obj.bonus || 0) : 0;
}

function _skillDots(c, name) {
  const obj = (c.skills || {})[name];
  return obj ? (obj.dots || 0) + (obj.bonus || 0) : 0;
}

function _checkSingleTerm(c, term) {
  term = term.trim();
  if (!term) return true;

  // Term with a trailing number: "Name N" (greedy name, last word is digit)
  const numM = term.match(/^(.+?)\s+(\d+)$/);
  if (numM) {
    const name = numM[1].trim();
    const req = parseInt(numM[2]);

    if (_ATTR_MAP[name]) return _attrDots(c, _ATTR_MAP[name]) >= req;
    if (_SKILL_SET.has(name)) return _skillDots(c, name) >= req;

    if (name.endsWith(' Status')) {
      const type = name.slice(0, -7).trim().toLowerCase();
      if (type === 'city') return ((c.status || {}).city || 0) >= req;
      if (type === 'clan') return ((c.status || {}).clan || 0) >= req;
      if (type === 'covenant') return (c.status?.covenant?.[c.covenant] || 0) >= req;
      const cov = _COV_STATUS_MAP[type];
      if (!cov) return true;
      // Unified: all covenant standings keyed by full name in status.covenant
      return (c.status?.covenant?.[cov] || 0) >= req;
    }

    if (name === 'Willpower')
      return (_attrDots(c, 'Resolve') + _attrDots(c, 'Composure')) >= req;

    // Fighting style by name
    if ((c.fighting_styles || []).some(fs => fs.name === name)) {
      return (c.fighting_styles || [])
        .filter(fs => fs.name === name)
        .reduce((s, fs) => s + (fs.cp || 0) + (fs.free_mci || 0) + (fs.xp || 0), 0) >= req;
    }

    // Discipline
    if ((c.disciplines || {})[name] !== undefined) return (c.disciplines[name]?.dots || 0) >= req;

    // Merit with rating
    return (c.merits || []).some(m => m.name === name && (m.rating || 0) >= req);
  }

  // Term with qualifier: "Name (Qualifier)"
  const qualM = term.match(/^(.+?)\s*\((.+)\)$/);
  if (qualM) {
    const name = qualM[1].trim(), qual = qualM[2].trim();
    return (c.merits || []).some(m =>
      m.name === name && (m.qualifier || '').toLowerCase() === qual.toLowerCase()
    );
  }

  // Bare term
  if (term === 'Kerberos Bloodline') return (c.bloodline || '').toLowerCase().includes('kerberos');
  if (term === 'Bonded Condition') return true; // game-world condition — optimistic
  return (c.merits || []).some(m => m.name === term) || true; // optimistic for unknowns
}

/**
 * Returns true if all prereqs in the prereqStr are met.
 * Format: "Term, Term, ...; ManoeuvrePrereq"
 * Terms may contain 'or': "Wits 3 or Fighting Finesse"
 */
function _prereqsMet(c, prereqStr) {
  if (!prereqStr) return true;
  // Structured prereq tree from rules cache — use meetsPrereq engine
  if (typeof prereqStr === 'object') return meetsPrereq(c, prereqStr);
  const [statPart, manPart] = prereqStr.split(';').map(s => s.trim());

  if (manPart) {
    const picked = new Set((c.fighting_picks || []).map(pk =>
      (typeof pk === 'string' ? pk : pk.manoeuvre).toLowerCase()
    ));
    if (!picked.has(manPart.toLowerCase())) return false;
  }

  for (const term of statPart.split(',').map(t => t.trim()).filter(Boolean)) {
    const ok = term.includes(' or ')
      ? term.split(' or ').some(t => _checkSingleTerm(c, t.trim()))
      : _checkSingleTerm(c, term);
    if (!ok) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Get all MAN_DB manoeuvres for a style, sorted by rank. */
function _styleManoeuvres(styleName) {
  const results = [];
  for (const [key, entry] of Object.entries(MAN_DB)) {
    if (entry.style === styleName) results.push({ key, ...entry });
  }
  results.sort((a, b) => parseInt(a.rank) - parseInt(b.rank));
  return results;
}

/**
 * Returns true if the character qualifies for a manoeuvre (orthodox or unorthodox).
 * Pass pre-computed tc = _tagCounts(c) for efficiency when calling in a loop.
 * Orthodox: has a type:'style' entry for man.style with dots >= man.rank.
 * Unorthodox: any shared tag total >= man.rank.
 */
function _qualifiesForManoeuvre(c, man, tc) {
  const rank = parseInt(man.rank) || 1;
  // Regular-style manoeuvres: qualify via Fighting Merit dots
  if (man.style === 'Regular') {
    const fmDots = (c.fighting_styles || [])
      .filter(fs => fs.type === 'merit' && fs.name === 'Fighting Merit')
      .reduce((s, fs) => s + (fs.cp || 0) + (fs.free_mci || 0) + (fs.free_ots || 0) + (fs.xp || 0), 0);
    return fmDots >= rank;
  }
  const styleDots = (c.fighting_styles || [])
    .filter(fs => fs.type !== 'merit' && fs.name === man.style)
    .reduce((s, fs) => s + (fs.cp || 0) + (fs.free_mci || 0) + (fs.free_ots || 0) + (fs.xp || 0), 0);
  if (styleDots >= rank) return true;
  const manTags = STYLE_TAGS[man.style] || [];
  return manTags.some(t => (tc[t] || 0) >= rank);
}

/**
 * Returns all MAN_DB manoeuvres the character qualifies for but hasn't yet picked,
 * excluding non-combat styles. Sorted by rank then name.
 */
function _availablePicks(c) {
  const picked = new Set((c.fighting_picks || []).map(pk =>
    (typeof pk === 'string' ? pk : pk.manoeuvre).toLowerCase()
  ));
  const tc = _tagCounts(c);
  const results = [];
  for (const [key, man] of Object.entries(MAN_DB)) {
    if (NON_COMBAT_STYLES.has(man.style)) continue;
    if (picked.has(key)) continue;
    if (!_qualifiesForManoeuvre(c, man, tc)) continue;
    if (!_prereqsMet(c, man.prereq)) continue;
    results.push({ key, ...man });
  }
  results.sort((a, b) => (parseInt(a.rank) - parseInt(b.rank)) || a.name.localeCompare(b.name));
  return results;
}

/** Get all unique style names from MAN_DB, excluding Regular (handled via Fighting Merit). */
function _allStyles() {
  const s = new Set();
  for (const entry of Object.values(MAN_DB)) {
    if (entry.style !== 'Regular') s.add(entry.style);
  }
  return [...s].sort();
}

export function shRenderManoeuvres(c, editMode) {
  const styles = c.fighting_styles || [];
  const allPicks = c.fighting_picks || [];
  if (!editMode && !styles.length && !allPicks.length) return '';

  const mciPool = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false)
    .reduce((s, m) => s + mciPoolTotal(m), 0);
  const otsExtraPicks = c._ots_free_dots || 0;

  let h = '<div class="sh-sec"><div class="sh-sec-title">Manoeuvres</div>';

  if (editMode) {
    const tc = _tagCounts(c);
    const fStyles = styles.filter(fs => fs.type !== 'merit');
    const fMerits = styles.filter(fs => fs.type === 'merit');
    const totalDots = styles.reduce((s, fs) => s + (fs.cp || 0) + (fs.free_mci || 0) + (fs.free_ots || 0) + (fs.xp || 0), 0);
    const totalPicks = allPicks.length;
    const otsFreeDots = c._ots_free_dots || 0;
    const fmEntry0 = styles.find(fs => fs.type === 'merit' && fs.name === 'Fighting Merit');
    const otsUsed = (c.fighting_styles || []).reduce((s, fs) => s + (fs.free_ots || 0), 0)
                  + (fmEntry0 ? (fmEntry0.free_ots || 0) : 0);

    const maxPicks = totalDots;
    h += '<div class="sh-merit-cp-row" style="margin-bottom:6px"><span style="color:var(--txt2)">' + totalDots + ' dot' + (totalDots === 1 ? '' : 's') + ', ' + totalPicks + ' pick' + (totalPicks === 1 ? '' : 's') + '</span></div>';
    if (otsFreeDots > 0) {
      const otsCls = otsUsed > otsFreeDots ? ' sc-over' : otsUsed === otsFreeDots ? ' sc-full' : ' sc-val';
      h += '<div class="grant-pool-row"><span class="grant-pool-tag">Oath of the Scapegoat</span> free style/merit dots <span class="' + otsCls + '">' + otsUsed + '/' + otsFreeDots + '</span></div>';
    }

    // Style Points — tag totals for unorthodox access
    const tagEntries = Object.entries(tc).filter(([, v]) => v > 0);
    if (tagEntries.length) {
      h += '<div class="grant-pools">';
      h += '<div class="sh-sub-title">STYLE POINTS (unorthodox access)</div>';
      tagEntries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([tag, count]) => {
        h += '<div class="grant-pool-row"><span class="grant-pool-tag">' + esc(tag) + '</span>'
          + '<span style="margin-left:6px">' + shDots(Math.min(count, 5)) + '</span>'
          + '<span class="grant-pool-rank">rank 1\u2013' + count + '</span></div>';
      });
      h += '</div>';
    }

    // ── Fighting Styles ──────────────────────────────────────
    h += '<div class="sh-sub-title">Fighting Styles</div>';
    h += '<div class="man-list">';
    fStyles.forEach(fs => {
      const si = styles.indexOf(fs);
      const dots = (fs.cp || 0) + (fs.free_mci || 0) + (fs.free_ots || 0) + (fs.xp || 0);
      const _fsPurch = (fs.cp || 0) + (fs.xp || 0);
      const _fsDerived = (fs.free_mci || 0) + (fs.free_ots || 0);
      const tags = STYLE_TAGS[fs.name] || [];
      const fsUp = fs.up || 0;

      h += '<div class="mci-block"><div class="mci-header"><div class="mci-title"><span class="merit-name-sh">' + esc(fs.name) + '</span>';
      if (tags.length) h += '<span style="font-size:9px;color:var(--txt3);margin-left:6px">' + tags.map(t => esc(t)).join(', ') + '</span>';
      h += '</div><span class="merit-dots-sh">' + '\u25CF'.repeat(_fsPurch) + '\u25CB'.repeat(_fsDerived) + '</span></div>';

      h += '<div class="merit-bd-row">'
        + '<div class="bd-grp"><span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + (fs.cp || 0) + '" onchange="shEditStyle(' + si + ',\'cp\',+this.value)"></div>'
        + '<div class="bd-grp"><span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + (fs.xp || 0) + '" onchange="shEditStyle(' + si + ',\'xp\',+this.value)"></div>'
        + (mciPool > 0 ? '<div class="bd-grp"><span class="bd-lbl" style="color:var(--accent)">MCI</span><input class="merit-bd-input" style="color:var(--accent)" type="number" min="0" value="' + (fs.free_mci || 0) + '" onchange="shEditStyle(' + si + ',\'free_mci\',+this.value)"></div>' : '')
        + (otsFreeDots > 0 ? '<div class="bd-grp"><span class="bd-lbl" style="color:var(--accent)">OTS</span><input class="merit-bd-input" style="color:var(--accent)" type="number" min="0" value="' + (fs.free_ots || 0) + '" onchange="shEditStyle(' + si + ',\'free_ots\',+this.value)"></div>' : '')
        + '<div class="bd-eq"><span class="bd-val">' + dots + ' dot' + (dots === 1 ? '' : 's') + '</span>'
        + (dots > 0 ? '<span style="font-size:9px;color:var(--txt3);margin-left:4px">orthodox rank 1\u2013' + dots + '</span>' : '')
        + (fsUp ? '<span class="bd-up-warn">+' + fsUp + ' unaccounted</span>' : '') + '</div></div>';
      if (fs.free_mci) h += '<div class="derived-note">MCI: +' + fs.free_mci + ' dot' + (fs.free_mci !== 1 ? 's' : '') + ' (auto) \u2014 removed if MCI drops</div>';
      if (fs.free_ots) h += '<div class="derived-note">OTS: +' + fs.free_ots + ' dot' + (fs.free_ots !== 1 ? 's' : '') + ' (auto) \u2014 removed if oath is removed</div>';

      h += '<button class="sk-spec-rm" style="float:right;margin:4px" onclick="shRemoveStyle(' + si + ')" title="Remove">&times; Remove</button>';
      h += '<div style="clear:both"></div></div>';
    });

    const existingNames = new Set(styles.map(s => s.name));
    h += '<div class="dev-add-row"><select class="dev-add-btn" style="font-size:11px" onchange="if(this.value){shAddStyle(this.value,\'style\');this.value=\'\'}">';
    h += '<option value="">+ Add Fighting Style\u2026</option>';
    _allStyles().filter(s => !existingNames.has(s) && !NON_COMBAT_STYLES.has(s)).forEach(s => {
      h += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    });
    h += '</select></div></div>';

    // ── Fighting Merits ──────────────────────────────────────
    h += '<div class="sh-sub-title">Fighting Merits</div>';
    h += '<div class="man-list">';
    const fmEntry = fMerits.find(fs => fs.name === 'Fighting Merit');
    if (fmEntry) {
      const si = styles.indexOf(fmEntry);
      const dots = (fmEntry.cp || 0) + (fmEntry.free_mci || 0) + (fmEntry.free_ots || 0) + (fmEntry.xp || 0);
      const _fmPurch = (fmEntry.cp || 0) + (fmEntry.xp || 0);
      const _fmDerived = (fmEntry.free_mci || 0) + (fmEntry.free_ots || 0);
      const fsUp = fmEntry.up || 0;
      h += '<div class="mci-block"><div class="mci-header"><div class="mci-title"><span class="merit-name-sh">Fighting Merit</span></div>'
        + '<span class="merit-dots-sh">' + '\u25CF'.repeat(_fmPurch) + '\u25CB'.repeat(_fmDerived) + '</span></div>';
      h += '<div class="merit-bd-row">'
        + '<div class="bd-grp"><span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + (fmEntry.cp || 0) + '" onchange="shEditStyle(' + si + ',\'cp\',+this.value)"></div>'
        + '<div class="bd-grp"><span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + (fmEntry.xp || 0) + '" onchange="shEditStyle(' + si + ',\'xp\',+this.value)"></div>'
        + (mciPool > 0 ? '<div class="bd-grp"><span class="bd-lbl" style="color:var(--accent)">MCI</span><input class="merit-bd-input" style="color:var(--accent)" type="number" min="0" value="' + (fmEntry.free_mci || 0) + '" onchange="shEditStyle(' + si + ',\'free_mci\',+this.value)"></div>' : '')
        + (otsFreeDots > 0 ? '<div class="bd-grp"><span class="bd-lbl" style="color:var(--accent)">OTS</span><input class="merit-bd-input" style="color:var(--accent)" type="number" min="0" value="' + (fmEntry.free_ots || 0) + '" onchange="shEditStyle(' + si + ',\'free_ots\',+this.value)"></div>' : '')
        + '<div class="bd-eq"><span class="bd-val">' + dots + ' dot' + (dots === 1 ? '' : 's') + '</span>'
        + (dots > 0 ? '<span style="font-size:9px;color:var(--txt3);margin-left:4px">1 pick / dot</span>' : '')
        + (fsUp ? '<span class="bd-up-warn">+' + fsUp + ' unaccounted</span>' : '') + '</div></div>';
      if (fmEntry.free_mci) h += '<div class="derived-note">MCI: +' + fmEntry.free_mci + ' dot' + (fmEntry.free_mci !== 1 ? 's' : '') + ' (auto) \u2014 removed if MCI drops</div>';
      if (fmEntry.free_ots) h += '<div class="derived-note">OTS: +' + fmEntry.free_ots + ' dot' + (fmEntry.free_ots !== 1 ? 's' : '') + ' (auto) \u2014 removed if oath is removed</div>';
      h += '<button class="sk-spec-rm" style="float:right;margin:4px" onclick="shRemoveStyle(' + si + ')" title="Remove">&times; Remove</button>';
      h += '<div style="clear:both"></div></div>';
    } else {
      h += '<div class="dev-add-row"><button class="dev-add-btn" style="font-size:11px" onclick="shAddStyle(\'Fighting Merit\',\'merit\')">+ Add Fighting Merit</button></div>';
    }
    h += '</div>';

    // ── Picks editor ─────────────────────────────────────────
    const remaining = maxPicks - totalPicks;
    h += '<div class="sh-sub-title">Manoeuvres Picked'
      + '<span style="font-weight:normal;color:var(--txt2);margin-left:8px">' + totalPicks + ' / ' + maxPicks + '</span></div>';
    h += '<div class="man-list">';

    allPicks.forEach((pk, pi) => {
      const manName = typeof pk === 'string' ? pk : pk.manoeuvre;
      const db = MAN_DB[manName.toLowerCase()];
      const prereqOk = !db || !db.prereq || meetsPrereq(c, db.prereq);
      h += '<div class="mci-benefit-row">'
        + '<span class="mci-dot-lbl">' + (db ? '\u25CF'.repeat(parseInt(db.rank) || 1) : '\u25CF') + '</span>'
        + '<span style="flex:1;font-size:11px' + (prereqOk ? '' : ';color:var(--crim)') + '">' + esc(manName) + '</span>'
        + (db ? '<span style="font-size:9px;color:var(--txt3);margin-right:6px">' + esc(db.style) + '</span>' : '')
        + (!prereqOk ? '<span style="font-size:9px;color:var(--crim);margin-right:4px" title="' + esc(db.prereqStr || '') + '">prereq</span>' : '')
        + '<button class="sk-spec-rm" onclick="shRemovePick(' + pi + ')" title="Remove">&times;</button></div>';
    });

    if (remaining > 0) {
      const available = _availablePicks(c);
      if (available.length) {
        h += '<div style="padding:2px 0"><select class="gen-name-select" style="font-size:10px" onchange="if(this.value){shAddPick(this.value);this.value=\'\'}">';
        h += '<option value="">+ Add manoeuvre (' + remaining + ' remaining)\u2026</option>';
        available.forEach(m => {
          h += '<option value="' + esc(m.name) + '">' + esc(m.name) + ' (' + esc(m.style) + ', rank ' + m.rank + ')</option>';
        });
        h += '</select></div>';
      } else {
        h += '<div style="font-size:10px;color:var(--txt3);padding:4px 0">' + remaining + ' slot' + (remaining === 1 ? '' : 's') + ' available \u2014 no qualifying manoeuvres yet</div>';
      }
    }

    h += '</div>'; // closes man-list (picks)

  } else {
    // ── View mode ────────────────────────────────────────────
    const fStyles = styles.filter(fs => fs.type !== 'merit');
    const fMerits = styles.filter(fs => fs.type === 'merit');

    // Style Points summary
    const tc = _tagCounts(c);
    const tagEntries = Object.entries(tc).filter(([, v]) => v > 0);
    if (tagEntries.length) {
      h += '<div class="grant-pools">';
      h += '<div class="sh-sub-title">STYLE POINTS</div>';
      tagEntries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([tag, count]) => {
        h += '<div class="grant-pool-row"><span class="grant-pool-tag">' + esc(tag) + '</span>'
          + '<span style="margin-left:6px">' + shDots(Math.min(count, 5)) + '</span>'
          + '<span class="grant-pool-rank">rank 1\u2013' + count + '</span></div>';
      });
      h += '</div>';
    }

    if (fStyles.length) {
      h += '<div class="sh-sub-title">FIGHTING STYLES</div>';
      h += '<div class="man-list">';
      fStyles.forEach(fs => {
        const _vPurch = (fs.cp || 0) + (fs.xp || 0), _vDerived = (fs.free_mci || 0) + (fs.free_ots || 0);
        const tags = STYLE_TAGS[fs.name] || [];
        h += '<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">' + esc(fs.name) + '</span><div class="trait-right">' + shDotsMixed(_vPurch, _vDerived) + '</div></div>' + (tags.length ? '<div class="trait-sub"><span class="trait-qual">' + tags.map(t => esc(t)).join(', ') + '</span></div>' : '') + '</div></div>';
      });
      h += '</div>';
    }

    if (fMerits.length) {
      h += '<div class="sh-sub-title">FIGHTING MERITS</div>';
      h += '<div class="man-list">';
      fMerits.forEach(fs => {
        const _vPurch = (fs.cp || 0) + (fs.xp || 0), _vDerived = (fs.free_mci || 0) + (fs.free_ots || 0);
        const tags = STYLE_TAGS[fs.name] || [];
        h += '<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">' + esc(fs.name) + '</span><div class="trait-right">' + shDotsMixed(_vPurch, _vDerived) + '</div></div>' + (tags.length ? '<div class="trait-sub"><span class="trait-qual">' + tags.map(t => esc(t)).join(', ') + '</span></div>' : '') + '</div></div>';
      });
      h += '</div>';
    }

    if (allPicks.length) {
      h += '<div class="sh-sub-title">MANOEUVRES</div>';
      h += '<div class="man-list">';
      allPicks.forEach((pk, pi) => {
        const manName = typeof pk === 'string' ? pk : pk.manoeuvre;
        const db = MAN_DB[manName.toLowerCase()];
        const prereqOk = !db || !db.prereq || meetsPrereq(c, db.prereq);
        const id2 = 'man' + pi;
        const body = db
          ? '<div class="man-exp-body"><div class="man-style">' + esc(db.style) + ' \u2014 Rank ' + esc(db.rank) + '</div><div>' + esc(db.effect || '') + '</div>' + (db.prereqStr ? '<div class="man-prereq">Prerequisite: ' + esc(db.prereqStr) + '</div>' : '') + '</div>'
          : '<div>' + esc(manName) + '</div>';
        h += '<div class="exp-row' + (prereqOk ? '' : ' merit-prereq-fail') + '" id="exp-row-' + id2 + '" onclick="toggleExp(\'' + id2 + '\')">' + '<div class="trait-row"><div class="trait-main"><span class="trait-name">' + esc(manName) + '</span><div class="trait-right"><span class="exp-arr">\u203A</span></div></div>' + (db ? '<div class="trait-sub"><span class="trait-qual">' + esc(db.style) + ' \u2014 Rank ' + db.rank + (prereqOk ? '' : ' \u2014 prereq not met') + '</span></div>' : '') + '</div></div><div class="exp-body" id="exp-body-' + id2 + '">' + body + '</div>';
      });
      h += '</div>';
    }
  }

  h += '</div>';
  return h;
}

// ── Equipment renderer (nav.10) ───────────────────────────────────────────────
export function shRenderEquipment(c, editMode) {
  const equip = c.equipment || [];
  if (!editMode && !equip.length) return '';
  const SKILLS = ['Brawl', 'Weaponry', 'Firearms'];
  const TYPES  = ['weapon', 'armour'];
  let h = '<div class="sh-sec"><div class="sh-sec-title">Equipment</div><div class="merit-list">';
  if (editMode) {
    equip.forEach((e, i) => {
      const isWeapon = e.type === 'weapon';
      const skillOpts = SKILLS.map(s => `<option${e.attack_skill === s ? ' selected' : ''}>${s}</option>`).join('');
      const dmgOpts = ['B','L','A'].map(d => `<option${e.damage_type === d ? ' selected' : ''}>${d}</option>`).join('');
      h += `<div class="equip-edit-row">`;
      h += `<select class="gen-qual-input" style="width:70px" onchange="shEditEquip(${i},'type',this.value)"><option${e.type==='weapon'?' selected':''}>weapon</option><option${e.type==='armour'?' selected':''}>armour</option></select>`;
      h += `<input class="sh-edit-input" value="${esc(e.name||'')}" placeholder="Name" onchange="shEditEquip(${i},'name',this.value)" style="flex:1">`;
      if (isWeapon) {
        h += `<select class="gen-qual-input" style="width:80px" onchange="shEditEquip(${i},'attack_skill',this.value)">${skillOpts}</select>`;
        h += `<input class="attr-bd-input" type="number" value="${e.damage_rating||0}" title="Dmg bonus" onchange="shEditEquip(${i},'damage_rating',+this.value)" style="width:40px">`;
        h += `<select class="gen-qual-input" style="width:40px" onchange="shEditEquip(${i},'damage_type',this.value)">${dmgOpts}</select>`;
      } else {
        h += `<input class="attr-bd-input" type="number" value="${e.general_ar||0}" title="General AR" onchange="shEditEquip(${i},'general_ar',+this.value)" style="width:40px">`;
        h += `<input class="attr-bd-input" type="number" value="${e.ballistic_ar||0}" title="Ballistic AR" onchange="shEditEquip(${i},'ballistic_ar',+this.value)" style="width:40px">`;
        h += `<input class="attr-bd-input" type="number" value="${e.mobility_penalty||0}" title="Mobility penalty" onchange="shEditEquip(${i},'mobility_penalty',+this.value)" style="width:40px">`;
      }
      h += `<button class="dev-rm-btn" onclick="shRemoveEquip(${i})" title="Remove">&times;</button>`;
      h += `</div>`;
    });
    h += `<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddEquip('weapon')">+ Weapon</button><button class="dev-add-btn" onclick="shAddEquip('armour')" style="margin-left:4px">+ Armour</button></div>`;
  } else {
    equip.forEach(e => {
      h += `<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">${esc(e.name)}</span><div class="trait-right"><span class="trait-qual" style="font-size:10px">${e.type === 'weapon' ? `${e.attack_skill||''} +${e.damage_rating||0}${e.damage_type||'L'}` : `AR ${e.general_ar||0}/${e.ballistic_ar||0}`}</span></div></div></div></div>`;
    });
  }
  h += '</div></div>';
  return h;
}

export function shRenderMeritRow(m, idPrefix, i, dotHtml, chipHtml) {
  const b2 = meritBase(m), dc = meritDotCount(m), ds = dc ? shDots(dc) : '', pm = b2.match(/^([^(]+?)\s*\((.+)\)$/), mn = pm ? pm[1].trim() : b2, sn = pm ? pm[2].trim() : null;
  const db = meritLookup(m), dt = dotHtml !== undefined ? dotHtml : (ds ? '<span class="trait-dots">' + ds + '</span>' : '');
  const _inner = (hasArr) => '<div class="trait-row"><div class="trait-main"><span class="trait-name">' + esc(mn) + '</span><div class="trait-right">' + (dt || '') + '<span class="exp-arr' + (hasArr ? '' : ' trait-arr-hidden') + '">\u203A</span></div></div>' + ((sn || chipHtml) ? '<div class="trait-sub">' + (chipHtml || '') + (sn ? '<span class="trait-qual">' + esc(sn) + '</span>' : '') + '</div>' : '') + '</div>';
  if (db && db.desc) {
    const id2 = idPrefix + i, pqStr = db.prereq ? prereqLabel(db.prereq) : '', body = '<div>' + esc(db.desc) + '</div>' + (pqStr ? '<div style="margin-top:5px;font-style:italic;color:var(--txt3)">Prerequisite: ' + esc(pqStr) + '</div>' : '');
    return '<div class="exp-row" id="exp-row-' + id2 + '" onclick="toggleExp(\'' + id2 + '\')">' + _inner(true) + '</div><div class="exp-body" id="exp-body-' + id2 + '">' + body + '</div>';
  }
  return '<div class="merit-plain">' + _inner(false) + '</div>';
}

/* ── renderSheet orchestrator ── */

export function renderSheet(c, target = null) {
  _refreshLegacyDBs();
  const { editMode, chars, editIdx } = state;
  state.openExpId = null;
  const el = target || document.getElementById('sh-content');
  if (!c) { el.innerHTML = ''; return; }
  applyDerivedMerits(c, chars); ensureMeritSync(c);
  const bl = c.bloodline && c.bloodline !== '\u00AC' ? c.bloodline : '', st = c.status || {}, wp = getWillpower(c);
  const clanIconHtml = clanIcon(c.clan, 48), covIconHtml = covIcon(c.covenant, 48);
  const allB = c.banes || [], curseIdx = allB.findIndex(b => b.name.toLowerCase().includes('curse')), curse = curseIdx >= 0 ? allB[curseIdx] : null, regB = allB.filter((_, i) => i !== curseIdx);
  let h = '';
  // Desktop layout hint — admin CSS uses this for 3-col grid
  const isDesktop = el.closest('.cd-sheet');
  if (isDesktop) h += '<div class="sh-desktop' + (editMode ? ' sh-editing' : '') + '"><div class="sh-dcol sh-dcol-left">';
  // Header
  const _rd = editMode && isRedactMode();
  h += '<div class="sh-char-hdr"><div class="sh-namerow"><div class="sh-char-name">' + (editMode ? (_rd ? '<input class="sh-edit-input" value="' + esc(redactCharName(c.name)) + '" disabled>' : '<input class="sh-edit-input" value="' + esc(c.name) + '" onchange="shEdit(\'name\',this.value);document.getElementById(\'edit-charname\').textContent=this.value">') : esc(displayName(c))) + '</div>' + _auditBadge(c);
  if (editMode) {
    if (_rd) {
      h += '<div style="display:flex;gap:8px;margin-top:2px"><div style="flex:1"><input class="sh-edit-input" value="' + esc(redactCharName(c.honorific || '')) + '" disabled style="font-size:12px"></div><div style="flex:1"><input class="sh-edit-input" value="' + esc(redactCharName(c.moniker || '')) + '" disabled style="font-size:12px"></div></div>';
    } else {
      h += '<div style="display:flex;gap:8px;margin-top:2px"><div style="flex:1"><input class="sh-edit-input" value="' + esc(c.honorific || '') + '" onchange="shEdit(\'honorific\',this.value||null)" placeholder="Honorific (e.g. Lord, Lady)" style="font-size:12px"></div><div style="flex:1"><input class="sh-edit-input" value="' + esc(c.moniker || '') + '" onchange="shEdit(\'moniker\',this.value||null)" placeholder="Moniker (overrides display name)" style="font-size:12px"></div></div>';
    }
  }
  h += '<div class="sh-player-row"><span class="sh-char-player">' + (editMode ? (_rd ? '<input class="sh-edit-input" value="' + esc(redactPlayer(c.player || '')) + '" disabled placeholder="Player">' : '<input class="sh-edit-input" value="' + esc(c.player || '') + '" onchange="shEdit(\'player\',this.value)" placeholder="Player">') : esc(redactPlayer(c.player || ''))) + '</span><span class="sh-xp-badge' + (xpLeft(c) < 0 ? ' xp-over' : xpLeft(c) > 0 ? ' xp-under' : '') + '">XP ' + xpLeft(c) + '/' + xpEarned(c) + '</span></div></div>';
  if (editMode) {
    const eT = xpEarned(c), sT = xpSpent(c);
    const _pt5 = xpPT5(c);
    h += '<div class="sh-xp-breakdown"><table><tr><th colspan="2">XP Earned</th><th colspan="2">XP Spent</th></tr><tr><td>Starting</td><td>' + xpStarting() + '</td><td>Attributes</td><td>' + xpSpentAttrs(c) + '</td></tr><tr><td>Humanity Drop</td><td>' + xpHumanityDrop(c) + '</td><td>Skills + Specs</td><td>' + xpSpentSkills(c) + '</td></tr><tr><td>Ordeals</td><td>' + xpOrdeals(c) + '</td><td>Merits</td><td>' + xpSpentMerits(c) + '</td></tr><tr><td>Game</td><td>' + xpGame(c) + '</td><td>Powers</td><td>' + xpSpentPowers(c) + '</td></tr>' + (_pt5 ? '<tr><td>PT \u25cf\u25cf\u25cf\u25cf\u25cf</td><td>' + _pt5 + '</td>' : '<tr><td></td><td></td>') + '<td>Special</td><td>' + xpSpentSpecial(c) + '</td></tr><tr class="xp-total-row"><td>Total Earned</td><td>' + eT + '</td><td>Total Spent</td><td>' + sT + '</td></tr><tr class="xp-total-row"><td colspan="3" style="text-align:right;padding-right:8px">Available</td><td>' + (eT - sT) + '</td></tr></table></div>';
    const ords = c.ordeals || []; if (ords.length) { h += '<div class="sh-ordeals">'; ords.forEach(o => { h += '<span class="sh-ordeal' + (o.complete ? ' done' : '') + '"><span class="sh-ordeal-dot">' + (o.complete ? '\u25CF' : '\u25CB') + '</span><span class="sh-ordeal-label">' + esc(o.name) + '</span></span>'; }); h += '</div>'; }
  }
  h += '<div class="sh-char-body"><div class="sh-char-left">';
  if (editMode) {
    h += '<div class="sh-char-concept"><input class="sh-edit-input" value="' + esc(c.concept || '') + '" onchange="shEdit(\'concept\',this.value)" placeholder="Concept"></div>';
    h += '<div class="sh-char-concept"><input class="sh-edit-input" value="' + esc(c.pronouns || '') + '" onchange="shEdit(\'pronouns\',this.value)" placeholder="Pronouns"></div>';
  } else if (c.concept || c.pronouns) {
    h += '<div class="sh-concept-row"><span class="sh-char-concept">' + esc(c.concept || '') + '</span><span class="sh-char-pronoun">' + esc(c.pronouns || '') + '</span></div>';
  }
  if (editMode) { h += '<div class="exp-row"><span class="exp-lbl labeled">Mask</span><select class="sh-edit-select" style="flex:1;margin:0 6px" onchange="shEdit(\'mask\',this.value)"><option value="">(none)</option>' + MASKS_DIRGES.map(m2 => '<option' + (c.mask === m2 ? ' selected' : '') + '>' + esc(m2) + '</option>').join('') + '</select></div>'; }
  else if (c.mask) { h += expRow('mask', 'Mask', esc(c.mask), (wp.mask_1wp ? '<div><span class="exp-wp-lbl">1 WP</span> ' + esc(wp.mask_1wp) + '</div>' : '') + (wp.mask_all ? '<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ' + esc(wp.mask_all) + '</div>' : '')); }
  if (editMode) { h += '<div class="exp-row"><span class="exp-lbl labeled">Dirge</span><select class="sh-edit-select" style="flex:1;margin:0 6px" onchange="shEdit(\'dirge\',this.value)"><option value="">(none)</option>' + MASKS_DIRGES.map(m2 => '<option' + (c.dirge === m2 ? ' selected' : '') + '>' + esc(m2) + '</option>').join('') + '</select></div>'; }
  else if (c.dirge) { h += expRow('dirge', 'Dirge', esc(c.dirge), (wp.dirge_1wp ? '<div><span class="exp-wp-lbl">1 WP</span> ' + esc(wp.dirge_1wp) + '</div>' : '') + (wp.dirge_all ? '<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ' + esc(wp.dirge_all) + '</div>' : '')); }
  if (curse) h += expRow('curse', 'Curse', esc(curse.name), '<div>' + esc(curse.effect || '') + '</div>');
  if (editMode) { regB.forEach((b, bi) => { const ri = allB.indexOf(b); h += '<div class="exp-row" style="flex-direction:column;align-items:stretch;padding:8px 10px"><div class="sh-bane-edit-row"><span class="exp-lbl" style="min-width:36px">Bane</span><select class="sh-edit-select" style="flex:1" onchange="shEditBaneName(' + ri + ',this.value)"><option value="">(select)</option>' + BANE_LIST.map(bn => '<option' + (b.name === bn ? ' selected' : '') + '>' + esc(bn) + '</option>').join('') + '</select><button class="sh-bane-rm" onclick="shRemoveBane(' + ri + ')" title="Remove">&times;</button></div><input class="sh-edit-input" value="' + esc(b.effect || '') + '" onchange="shEditBaneEffect(' + ri + ',this.value)" placeholder="Effect text" style="margin-top:4px;font-size:11px"></div>'; }); h += '<button class="sh-bane-add" onclick="shAddBane()">+ Add Bane</button>'; }
  else regB.forEach((b, i) => { h += expRow('bane' + i, 'Bane', esc(b.name), '<div>' + esc(b.effect || '') + '</div>'); });
  // Touchstones \u2014 NPCR.4 Shape B bridge.
  // Branch on touchstone_edge_ids presence: truthy \u2192 new picker/view backed by
  // the relationships graph; falsy \u2192 legacy read-only + migration button.
  h += renderTouchstones(c, editMode);
  // Date of Embrace + Apparent Age
  if (editMode || c.date_of_embrace) { const _ded = c.date_of_embrace || ''; const _dedDisp = _ded ? new Date(_ded + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; h += '<div class="exp-row"><span class="exp-lbl labeled">Embrace</span>' + (editMode ? '<input type="date" class="sh-edit-input" value="' + esc(_ded) + '" onchange="shEdit(\'date_of_embrace\',this.value)">' : '<span class="exp-val">' + esc(_dedDisp) + '</span>') + '</div>'; }
  if (editMode || c.apparent_age) h += '<div class="exp-row"><span class="exp-lbl labeled">App. Age</span>' + (editMode ? '<input class="sh-edit-input" value="' + esc(c.apparent_age || '') + '" onchange="shEdit(\'apparent_age\',this.value)" placeholder="Apparent Age">' : '<span class="exp-val">' + esc(c.apparent_age) + '</span>') + '</div>';
  // Features: auto-detected stats + manual notes — single card
  const _autoFeat = derivedFeatures(c);
  if (editMode || _autoFeat.length || c.features) {
    h += '<div class="sh-features-card">';
    h += '<div class="sh-features-top"><span class="exp-lbl labeled">Features</span><span class="exp-val sh-features-auto">' + (_autoFeat.length ? _autoFeat.join(', ') : '<span class="sh-feat-none">None detected</span>') + '</span></div>';
    if (editMode) {
      h += '<div class="sh-features-top"><span class="exp-lbl labeled"></span><input class="sh-edit-input" style="flex:1" value="' + esc(c.features || '') + '" onchange="shEdit(\'features\',this.value)" placeholder="Additional features\u2026"></div>';
    } else if (c.features) {
      h += '<div class="sh-features-top"><span class="exp-lbl labeled"></span><span class="exp-val">' + esc(c.features) + '</span></div>';
    }
    h += '</div>';
  }
  h += '</div>'; // end left
  // Right panel
  h += '<div class="sh-hdr-right">';
  const tOpts = COURT_TITLES.map(t => '<option value="' + esc(t) + '"' + (c.court_category === t ? ' selected' : '') + '>' + esc(t || '(none)') + '</option>').join('');
  // Regent territory is derived from territories collection, not stored on character
  const _regTerrName = c._regentTerritory?.territory || null;
  const _courtLabel = c.court_category ? (c.court_title ? c.court_category + ' \u2014 ' + c.court_title : c.court_category) : '\u2014';
  h += '<div class="sh-hdr-row"><div class="sh-icon-slot"></div><div class="sh-faction-text">';
  if (editMode) { h += '<select class="sh-edit-select" onchange="shEdit(\'court_category\',this.value||null)">' + tOpts + '</select>'; if (_regTerrName) h += '<div style="margin-top:3px;font-size:10px;color:var(--accent)">Regent \u2014 ' + esc(_regTerrName) + '</div>'; }
  else { h += '<div class="sh-faction-label">' + esc(_courtLabel) + '</div>'; if (_regTerrName) h += '<div class="sh-faction-bloodline">Regent \u2014 ' + esc(_regTerrName) + '</div>'; }
  const cityBase = st.city || 0, titleBonus = titleStatusBonus(c), regentBonus = regentAmienceBonus(c), cityTotal = cityBase + titleBonus + regentBonus;
  h += '<div class="sh-faction-sub">Title</div>'
    + _statusDots(cityBase, titleBonus + regentBonus, 10)
    + (editMode ? _statusEditBtns('shStatusDown(\'city\')', 'shStatusUp(\'city\')') : '')
    + '</div>' + _statusPip(CITY_SVG, cityTotal, 'City') + '</div>';
  // covRow: dots + arrows live in the text column; pip is just diamond + number + label
  const covRow = (iconHtml, editH, viewH, sub, svg, sVal, sLbl, sKey, tBase, tBonus) => {
    h += '<div class="sh-hdr-row">'
      + (iconHtml ? '<div class="sh-faction-icon">' + iconHtml + '</div>' : '<div class="sh-icon-slot"></div>')
      + '<div class="sh-faction-text">'
      + (editMode ? editH : viewH)
      + '<div class="sh-faction-sub">' + sub + '</div>'
      + _statusDots(tBase, tBonus, 5)
      + (editMode ? _statusEditBtns('shStatusDown(\'' + sKey + '\')', 'shStatusUp(\'' + sKey + '\')') : '')
      + '</div>'
      + _statusPip(svg, sVal, sLbl)
      + '</div>';
  };
  const _covBase = st.covenant?.[c.covenant] || 0;
  covRow(covIconHtml, '<select class="sh-edit-select" onchange="shEdit(\'covenant\',this.value);renderSheet(chars[editIdx])">' + COVENANTS.map(cv => '<option' + (c.covenant === cv ? ' selected' : '') + '>' + cv + '</option>').join('') + '</select>', '<div class="sh-faction-label">' + esc(c.covenant || '\u2014') + '</div>', 'Covenant', OTHER_SVG, _covBase, 'Cov.', 'covenant', _covBase, 0);
  if (editMode) {
    const cOpts = CLANS.map(cl => '<option' + (c.clan === cl ? ' selected' : '') + '>' + cl + '</option>').join(''), bls = (BLOODLINE_CLANS[c.clan] || []).slice().sort(), blO = bls.map(b => '<option' + (c.bloodline === b ? ' selected' : '') + '>' + b + '</option>').join('');
    covRow(clanIconHtml, '<select class="sh-edit-select" onchange="shEdit(\'clan\',this.value)">' + cOpts + '</select><select class="sh-edit-select" style="margin-top:3px;font-size:10px" onchange="shEdit(\'bloodline\',this.value||null);renderSheet(chars[editIdx])"><option value="">(no bloodline)</option>' + blO + '</select>', '', 'Clan / Bloodline', OTHER_SVG, st.clan || 0, 'Clan', 'clan', st.clan || 0, 0);
  }
  else covRow(clanIconHtml, '', '<div class="sh-faction-label">' + esc(c.clan || '\u2014') + '</div>' + (bl ? '<div class="sh-faction-bloodline">' + esc(bl) + '</div>' : ''), 'Clan', OTHER_SVG, st.clan || 0, 'Clan', 'clan', st.clan || 0, 0);
  h += '</div></div></div>'; // end right, body, hdr
  // Covenant strip
  const _covFull = [['Carthian Movement','Carthian'],['Circle of the Crone','Crone'],['Invictus','Invictus'],['Lancea et Sanctum','Lance']];
  const covS = _covFull.filter(([full]) => full !== c.covenant).map(([full, short]) => ({ label: short, fullName: full, status: c.status?.covenant?.[full] || 0 }));
  if (covS.length) { h += '<div class="cov-strip">'; covS.forEach(cs => { const a = cs.status > 0, lq = cs.label.replace(/'/g, "\\'"); if (editMode) { h += '<div class="cov-strip-cell cov-strip-cell-edit"><span class="cov-strip-name' + (a ? ' active' : '') + '">' + esc(cs.label) + '</span>' + _statusTrack(cs.status, 0, '') + _statusEditBtns('shCovStandingDown(\'' + lq + '\')', 'shCovStandingUp(\'' + lq + '\')') + '</div>'; } else { h += '<div class="cov-strip-cell"><span class="cov-strip-name' + (a ? ' active' : '') + '">' + esc(cs.label) + '</span><span class="cov-strip-dot' + (a ? ' active' : '') + '">' + (a ? '\u25CB' : '\u2013') + '</span></div>'; } }); h += '</div>'; }
  h += shRenderStatsStrip(c);
  if (isDesktop) {
    h += '<div class="sh-body">' + shRenderAttributes(c, editMode) + shRenderSkills(c, editMode) + '</div>';
    h += '</div>'; // end sh-dcol-left
    h += '<div class="sh-dcol sh-dcol-mid"><div class="sh-body">' + shRenderGeneralMerits(c, editMode) + shRenderInfluenceMerits(c, editMode) + shRenderDomainMerits(c, editMode) + shRenderStandingMerits(c, editMode) + shRenderManoeuvres(c, editMode) + shRenderEquipment(c, editMode) + '</div></div>';
    h += '<div class="sh-dcol sh-dcol-right"><div class="sh-body">' + shRenderDisciplines(c, editMode) + '</div></div>';
    h += '</div>'; // end sh-desktop
  } else {
    h += '<div class="sh-body">' + shRenderAttributes(c, editMode) + shRenderSkills(c, editMode) + shRenderDisciplines(c, editMode) + shRenderGeneralMerits(c, editMode) + shRenderInfluenceMerits(c, editMode) + shRenderDomainMerits(c, editMode) + shRenderStandingMerits(c, editMode) + shRenderManoeuvres(c, editMode) + shRenderEquipment(c, editMode) + '</div>';
  }
  const _scrollEl = el.closest('.sh-wrap') || el.parentElement || document.documentElement, _scrollTop = _scrollEl.scrollTop;
  el.innerHTML = h; _scrollEl.scrollTop = _scrollTop;
}
