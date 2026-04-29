/**
 * Rules Engine admin view — left-rail navigator + per-family list + side-panel form + preview.
 * ST-only. All 8 rule families from RDE-2 are reachable through one IA.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { esc, shDotsWithBonus } from '../data/helpers.js';
import { getRulesByCategory } from '../data/loader.js';
import { invalidateRulesCache, preloadRules, getRulesBySource } from '../editor/rule_engine/load-rules.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { applyPTRulesFromDb } from '../editor/rule_engine/pt-evaluator.js';
import { applyBloodlineRulesFromDb } from '../editor/rule_engine/bloodline-evaluator.js';
import { ALL_SKILLS } from '../data/constants.js';

// ── Family registry ──

const FAMILIES = [
  { key: 'grant',                label: 'Merit Grants',         endpoint: '/api/rules/grant' },
  { key: 'speciality_grant',     label: 'Speciality Grants',    endpoint: '/api/rules/speciality_grant' },
  { key: 'skill_bonus',          label: 'Skill Bonuses',        endpoint: '/api/rules/skill_bonus' },
  { key: 'nine_again',           label: '9-Again',              endpoint: '/api/rules/nine_again' },
  { key: 'disc_attr',            label: 'Disc → Attr',     endpoint: '/api/rules/disc_attr' },
  { key: 'derived_stat_modifier',label: 'Derived Stat Modifiers', endpoint: '/api/rules/derived_stat_modifier' },
  { key: 'tier_budget',          label: 'Tier Budgets',         endpoint: '/api/rules/tier_budget' },
  { key: 'status_floor',         label: 'Status Floors',        endpoint: '/api/rules/status_floor' },
];

const FAMILY_BY_KEY = Object.fromEntries(FAMILIES.map(f => [f.key, f]));

// ── Module state ──

let _container = null;
let _chars = [];
let _rules = {}; // { [familyKey]: doc[] }
let _counts = {}; // { [familyKey]: number }
let _activeFamily = 'grant';
let _selectedRule = null; // the rule doc currently open in the side panel (null = new)
let _isNewRule = false;
let _searchQuery = '';
let _previewCharId = '';
let _formDirty = false;

// ── Exported init ──

export async function initRulesDataView(container) {
  if (!container) return;
  _container = container;
  _container.innerHTML = '<p class="placeholder-msg">Loading rules engine…</p>';
  // Reset view state (may be called multiple times via sidebar nav)
  _selectedRule = null;
  _isNewRule = false;
  _searchQuery = '';
  _formDirty = false;

  try {
    _chars = await apiGet('/api/characters');
    _chars = _chars.filter(c => !c.retired);
    _chars.forEach(c => applyDerivedMerits(c));
  } catch { _chars = []; }

  await preloadRules();

  await _fetchAllFamilies();
  _render();
}

// ── Data ──

async function _fetchAllFamilies() {
  await Promise.all(FAMILIES.map(async f => {
    try {
      const docs = await apiGet(f.endpoint);
      _rules[f.key] = Array.isArray(docs) ? docs : [];
    } catch { _rules[f.key] = []; }
    _counts[f.key] = (_rules[f.key] || []).length;
  }));
}

async function _fetchFamily(key) {
  const f = FAMILY_BY_KEY[key];
  if (!f) return;
  try {
    const docs = await apiGet(f.endpoint);
    _rules[key] = Array.isArray(docs) ? docs : [];
  } catch { _rules[key] = []; }
  _counts[key] = (_rules[key] || []).length;
}

// ── Render ──

function _render() {
  const h = `
    <div class="rde-shell">
      <nav class="rde-left-rail" id="rde-rail">${_renderRail()}</nav>
      <div class="rde-main" id="rde-main">${_renderList()}</div>
    </div>`;
  _container.innerHTML = h;
  _wireEvents();
}

function _renderRail() {
  return FAMILIES.map(f => {
    const active = f.key === _activeFamily ? ' rde-rail-active' : '';
    const cnt = _counts[f.key] || 0;
    return `<button class="rde-rail-btn${active}" data-family="${f.key}">
      <span class="rde-rail-label">${esc(f.label)}</span>
      ${cnt ? `<span class="rde-rail-count">${cnt}</span>` : ''}
    </button>`;
  }).join('');
}

function _renderList() {
  const docs = (_rules[_activeFamily] || []).filter(r => _matchesSearch(r));
  const fam = FAMILY_BY_KEY[_activeFamily];
  let h = `<div class="rde-list-toolbar">
    <input class="rde-search" id="rde-search" type="text" placeholder="Search source, notes…" value="${esc(_searchQuery)}">
    <button class="dt-btn rde-new-btn" id="rde-new-btn">+ New rule</button>
  </div>`;
  h += `<div class="rde-tbl-wrap"><table class="rde-tbl"><thead><tr>
    <th>Source</th><th>Tier</th>${_columnHeaders()}<th>Notes</th><th></th>
  </tr></thead><tbody>`;
  if (docs.length === 0) {
    const colspan = 4 + _extraColCount();
    h += `<tr><td colspan="${colspan}" class="rde-empty">No rules yet. Click "+ New rule" to add one.</td></tr>`;
  } else {
    for (const r of docs) {
      h += `<tr class="rde-row${_selectedRule?._id === r._id ? ' rde-row-active' : ''}" data-rule-id="${esc(r._id)}">
        <td class="rde-td-source">${esc(r.source || r.discipline || '')}${r.bloodline_name ? ` <span class="rde-td-tag">${esc(r.bloodline_name)}</span>` : ''}</td>
        <td class="rde-td-tier">${r.tier ? '●'.repeat(r.tier) : '–'}</td>
        ${_rowCells(r)}
        <td class="rde-td-notes" title="${esc(r.notes || '')}">${esc(_truncate(r.notes || '', 40))}</td>
        <td class="rde-td-actions">
          <button class="rde-edit-btn" data-rule-id="${esc(r._id)}" title="Edit">✎</button>
          <button class="rde-del-btn" data-rule-id="${esc(r._id)}" title="Delete">\u{1F5D1}</button>
        </td>
      </tr>`;
    }
  }
  h += '</tbody></table></div>';
  return h;
}

function _matchesSearch(r) {
  if (!_searchQuery) return true;
  const q = _searchQuery.toLowerCase();
  const fields = [r.source, r.discipline, r.notes, r.target, r.target_skill, r.target_name, r.spec, r.bloodline_name];
  return fields.some(f => f && f.toLowerCase().includes(q));
}

function _truncate(str, max) {
  return str.length <= max ? str : str.slice(0, max) + '…';
}

function _columnHeaders() {
  switch (_activeFamily) {
    case 'grant':               return '<th>Type</th><th>Target</th><th>Amount</th>';
    case 'speciality_grant':    return '<th>Skill</th><th>Spec</th>';
    case 'skill_bonus':         return '<th>Skill</th><th>Amount</th>';
    case 'nine_again':          return '<th>Skills</th>';
    case 'disc_attr':           return '<th>Kind</th><th>Target</th><th>Basis</th>';
    case 'derived_stat_modifier': return '<th>Stat</th><th>Mode</th>';
    case 'tier_budget':         return '<th>Budgets</th>';
    case 'status_floor':        return '<th>Status Kind</th><th>Target</th><th>Floor</th>';
    default: return '';
  }
}

function _extraColCount() {
  switch (_activeFamily) {
    case 'grant': case 'disc_attr': case 'status_floor': return 3;
    case 'speciality_grant': case 'skill_bonus': case 'derived_stat_modifier': return 2;
    case 'nine_again': case 'tier_budget': return 1;
    default: return 0;
  }
}

function _rowCells(r) {
  switch (_activeFamily) {
    case 'grant': {
      const grantTarget = r.grant_type === 'pool'
        ? (Array.isArray(r.pool_targets) ? r.pool_targets.join(', ') : (r.pool_targets || ''))
        : (r.target || '');
      const grantAmount = r.grant_type === 'pool' ? (r.amount_basis || '') : (r.amount ?? '');
      return `<td>${esc(r.grant_type || '')}</td><td>${esc(grantTarget)}</td><td>${esc(String(grantAmount))}</td>`;
    }
    case 'speciality_grant':
      return `<td>${esc(r.target_skill || '')}</td><td>${esc(r.spec || '')}</td>`;
    case 'skill_bonus':
      return `<td>${esc(r.target_skill || '')}</td><td>${r.amount ?? ''}</td>`;
    case 'nine_again': {
      const sk = Array.isArray(r.target_skills) ? r.target_skills.join(', ') : (r.target_skills || '');
      return `<td>${esc(_truncate(sk, 40))}</td>`;
    }
    case 'disc_attr':
      return `<td>${esc(r.target_kind || '')}</td><td>${esc(r.target_name || '')}</td><td>${esc(r.amount_basis || '')}</td>`;
    case 'derived_stat_modifier':
      return `<td>${esc(r.target_stat || '')}</td><td>${esc(r.mode || '')}</td>`;
    case 'tier_budget': {
      const b = Array.isArray(r.budgets) ? r.budgets.slice(1).join(', ') : '';
      return `<td>${esc(b)}</td>`;
    }
    case 'status_floor':
      return `<td>${esc(r.target_status_kind || '')}</td><td>${esc(r.target_status_name || '')}</td><td>${r.floor_value ?? ''}</td>`;
    default: return '';
  }
}

// ── Side panel ──

function _openSidePanel(rule, isNew = false) {
  _selectedRule = rule;
  _isNewRule = isNew;
  _formDirty = false;
  // Auto-select first character if none chosen yet
  if (!_previewCharId && _chars.length) _previewCharId = _chars[0]._id;
  const main = document.getElementById('rde-main');
  if (!main) return;
  // Refresh list to highlight row
  main.innerHTML = _renderList();
  // Append side panel
  main.insertAdjacentHTML('beforeend', `<div class="rde-side-panel" id="rde-side-panel">${_renderForm(rule, isNew)}</div>`);
  _rewireListEvents(main);
  _wireSidePanelEvents();
}

function _closeSidePanel() {
  _selectedRule = null;
  _isNewRule = false;
  _formDirty = false;
  document.getElementById('rde-side-panel')?.remove();
  const main = document.getElementById('rde-main');
  if (main) { main.innerHTML = _renderList(); _rewireListEvents(main); }
}

function _renderForm(rule, isNew) {
  const title = isNew ? `New ${FAMILY_BY_KEY[_activeFamily]?.label}` : `Edit: ${esc(rule?.source || rule?.discipline || '')}`;
  let h = `<div class="rde-form-header">${title}</div>`;
  h += `<div class="rde-form-body" id="rde-form-body">`;
  h += _formFields(rule, isNew);
  h += `<div class="rde-form-field"><label class="rde-form-label">Notes</label>
    <textarea class="rde-form-input rde-notes-ta" id="rde-notes" rows="3">${esc(rule?.notes || '')}</textarea>
    <div class="rde-form-hint">House-rule rationale (shown in tooltips).</div>
  </div>`;
  h += `</div>`;
  h += `<div class="rde-form-status" id="rde-form-status"></div>`;
  h += `<div class="rde-form-actions">`;
  if (!isNew) h += `<button class="dt-btn rde-del-confirm-btn" id="rde-del-btn">Delete</button>`;
  h += `<button class="dt-btn rde-cancel-btn" id="rde-cancel-btn">Cancel</button>`;
  h += `<button class="dt-btn rde-save-btn" id="rde-save-btn">${isNew ? 'Create' : 'Save'}</button>`;
  h += `</div>`;
  if (!isNew) h += _renderPreviewSection(rule);
  return h;
}

// ── Per-family form fields ──

function _formFields(rule, isNew) {
  switch (_activeFamily) {
    case 'grant':             return _fieldsGrant(rule, isNew);
    case 'speciality_grant':  return _fieldsSpecialityGrant(rule, isNew);
    case 'skill_bonus':       return _fieldsSkillBonus(rule, isNew);
    case 'nine_again':        return _fieldsNineAgain(rule, isNew);
    case 'disc_attr':         return _fieldsDiscAttr(rule, isNew);
    case 'derived_stat_modifier': return _fieldsDerivedStat(rule, isNew);
    case 'tier_budget':       return _fieldsTierBudget(rule, isNew);
    case 'status_floor':      return _fieldsStatusFloor(rule, isNew);
    default: return '';
  }
}

function _ff(label, id, type, value, hint, extra = '') {
  const val = value == null ? '' : String(value);
  let h = `<div class="rde-form-field"><label class="rde-form-label">${esc(label)}</label>`;
  if (type === 'textarea') {
    h += `<textarea class="rde-form-input" id="${id}" rows="2">${esc(val)}</textarea>`;
  } else if (type === 'number') {
    h += `<input class="rde-form-input rde-form-num" id="${id}" type="number" value="${esc(val)}" ${extra}>`;
  } else if (type === 'select') {
    h += extra; // extra is pre-built <select>...</select>
  } else {
    h += `<input class="rde-form-input" id="${id}" type="text" value="${esc(val)}">`;
  }
  if (hint) h += `<div class="rde-form-hint">${hint}</div>`;
  h += `<div class="rde-form-err" id="${id}-err"></div></div>`;
  return h;
}

function _sel(id, options, selected, placeholder = '') {
  let h = `<select class="rde-form-input" id="${id}">`;
  if (placeholder) h += `<option value="">${esc(placeholder)}</option>`;
  for (const [v, l] of options) h += `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`;
  h += '</select>';
  return h;
}

function _fieldsGrant(r, isNew) {
  const conditions = [['always','always'],['tier','tier'],['choice','choice'],['pact_present','pact_present'],['bloodline','bloodline'],['fighting_style_present','fighting_style_present']];
  const grantTypes = [['merit','merit'],['pool','pool'],['speciality','speciality']];
  const bases = [['flat','flat'],['rating_of_source','rating_of_source'],['rating_of_partner_merit','rating_of_partner_merit']];
  const poolTargetsVal = Array.isArray(r?.pool_targets) ? r.pool_targets.join(', ') : (r?.pool_targets || '');
  let h = '';
  h += _ff('Source merit', 'rde-f-source', 'text', r?.source, 'Name of the merit or grant source. Use "Bloodline" for bloodline grants.');
  h += _ff('Tier', 'rde-f-tier', 'number', r?.tier, 'Required PT/MCI dot level (blank = always).');
  h += _ff('Condition', 'rde-f-condition', 'select', null,
    null, _sel('rde-f-condition', [['','']].concat(conditions), r?.condition || '', 'always'));
  h += _ff('Bloodline name', 'rde-f-bloodline-name', 'text', r?.bloodline_name,
    'Required when condition=bloodline. Matched case-insensitively against character.bloodline (e.g. "Gorgons").');
  h += _ff('Grant type', 'rde-f-grant-type', 'select', null,
    'merit = free dots on a merit; pool = named free-dot pool; speciality = push spec onto a skill.',
    _sel('rde-f-grant-type', grantTypes, r?.grant_type || 'merit'));
  h += _ff('Target', 'rde-f-target', 'text', r?.target, 'Merit name (grant_type=merit) or skill name (grant_type=speciality). Leave blank for pool grants.');
  h += _ff('Target qualifier', 'rde-f-target-qualifier', 'text', r?.target_qualifier,
    'Merit qualifier/area (grant_type=merit) or spec name (grant_type=speciality).');
  h += _ff('Pool targets', 'rde-f-pool-targets', 'text', poolTargetsVal,
    'Comma-separated merit names eligible for allocation (grant_type=pool only). E.g. "Herd, Mentor, Resources, Retainer".');
  h += _ff('Amount', 'rde-f-amount', 'number', r?.amount, 'Flat dot count (amount_basis=flat). Leave blank for pool grants (amount is computed at render time).', 'min="0"');
  h += _ff('Amount basis', 'rde-f-amount-basis', 'select', null, null,
    _sel('rde-f-amount-basis', bases, r?.amount_basis || 'flat'));
  h += _ff('Partner merit name', 'rde-f-partner-merit-name', 'text', r?.partner_merit_name,
    'Merit whose rating determines pool size (amount_basis=rating_of_partner_merit). Use "Invictus Status" for covenant status, or a merit name like "Library".');
  return h;
}

function _fieldsSpecialityGrant(r, isNew) {
  let h = '';
  h += _ff('Source merit', 'rde-f-source', 'text', r?.source);
  h += _ff('Tier', 'rde-f-tier', 'number', r?.tier, '', 'min="1" max="5"');
  h += _ff('Target skill', 'rde-f-target-skill', 'text', r?.target_skill);
  h += _ff('Speciality', 'rde-f-spec', 'text', r?.spec);
  return h;
}

function _fieldsSkillBonus(r, isNew) {
  let h = '';
  h += _ff('Source merit', 'rde-f-source', 'text', r?.source);
  h += _ff('Tier', 'rde-f-tier', 'number', r?.tier, '', 'min="1" max="5"');
  h += _ff('Target skill', 'rde-f-target-skill', 'text', r?.target_skill);
  h += _ff('Amount', 'rde-f-amount', 'number', r?.amount, 'Bonus dots (1 or 2).', 'min="1" max="2"');
  return h;
}

function _fieldsNineAgain(r, isNew) {
  const skills = Array.isArray(r?.target_skills) ? r.target_skills.join(', ') : (r?.target_skills || '');
  let h = '';
  h += _ff('Source merit', 'rde-f-source', 'text', r?.source);
  h += _ff('Tier', 'rde-f-tier', 'number', r?.tier, '', 'min="1" max="5"');
  h += _ff('Target skills', 'rde-f-target-skills', 'text', skills,
    'Comma-separated skill names, or the sentinel <code>asset_skills</code>.');
  return h;
}

function _fieldsDiscAttr(r, isNew) {
  const kinds = [['attribute','attribute'],['derived_stat','derived_stat']];
  const bases = [['rating','rating'],['flat','flat']];
  let h = '';
  h += _ff('Discipline', 'rde-f-discipline', 'text', r?.discipline);
  h += _ff('Target kind', 'rde-f-target-kind', 'select', null, null,
    _sel('rde-f-target-kind', kinds, r?.target_kind || 'attribute'));
  h += _ff('Target name', 'rde-f-target-name', 'text', r?.target_name);
  h += _ff('Amount basis', 'rde-f-amount-basis', 'select', null, null,
    _sel('rde-f-amount-basis', bases, r?.amount_basis || 'rating'));
  h += _ff('Flat amount', 'rde-f-flat-amount', 'number', r?.flat_amount, 'Only used when basis=flat.');
  return h;
}

function _fieldsDerivedStat(r, isNew) {
  const stats = ['size','speed','defence','health','willpower_max'].map(s => [s,s]);
  const modes = [['flat','flat'],['rating','rating'],['skill_swap','skill_swap']];
  let h = '';
  h += _ff('Source', 'rde-f-source', 'text', r?.source);
  h += _ff('Target stat', 'rde-f-target-stat', 'select', null, null,
    _sel('rde-f-target-stat', stats, r?.target_stat || ''));
  h += _ff('Mode', 'rde-f-mode', 'select', null, null,
    _sel('rde-f-mode', modes, r?.mode || 'flat'));
  h += _ff('Flat amount', 'rde-f-flat-amount', 'number', r?.flat_amount);
  h += _ff('Swap from', 'rde-f-swap-from', 'text', r?.swap_from, 'skill_swap only');
  h += _ff('Swap to', 'rde-f-swap-to', 'text', r?.swap_to, 'skill_swap only');
  return h;
}

function _fieldsTierBudget(r, isNew) {
  const budgets = Array.isArray(r?.budgets) ? r.budgets.slice(1).join(', ') : '';
  let h = '';
  h += _ff('Source', 'rde-f-source', 'text', r?.source);
  h += _ff('Budgets (tiers 1–5)', 'rde-f-budgets', 'text', budgets,
    'Comma-separated integers for tiers 1–5 (e.g. 1,1,2,3,3).');
  return h;
}

function _fieldsStatusFloor(r, isNew) {
  const kinds = [['covenant','covenant'],['city','city'],['clan','clan']];
  let h = '';
  h += _ff('Source', 'rde-f-source', 'text', r?.source);
  h += _ff('Status kind', 'rde-f-status-kind', 'select', null, null,
    _sel('rde-f-status-kind', kinds, r?.target_status_kind || 'covenant'));
  h += _ff('Status name', 'rde-f-status-name', 'text', r?.target_status_name);
  h += _ff('Floor value', 'rde-f-floor-value', 'number', r?.floor_value, '', 'min="0"');
  return h;
}

// ── Preview panel ──

function _renderPreviewSection(rule) {
  const opts = _chars.map(c =>
    `<option value="${esc(c._id)}"${c._id === _previewCharId ? ' selected' : ''}>${esc(c.moniker || c.name)}</option>`
  ).join('');
  let h = `<div class="rde-preview-section">
    <div class="rde-preview-header">Preview</div>
    <div class="rde-preview-ctrl">
      <label class="rde-form-label">Character</label>
      <select class="rde-form-input" id="rde-preview-char">${opts}</select>
    </div>
    <div id="rde-preview-cols" class="rde-preview-cols">${_renderPreviewCols(rule)}</div>
  </div>`;
  return h;
}

function _renderPreviewCols(rule) {
  const char = _chars.find(c => c._id === _previewCharId);
  if (!char) return '<p class="rde-preview-empty">Select a character to preview.</p>';

  const before = _cloneChar(char);
  applyDerivedMerits(before);

  const after = _cloneChar(char);
  const proposed = _readFormData();
  _simulateAfter(after, rule, proposed);

  const beforeHtml = _renderPreviewDots(before, rule, proposed);
  const afterHtml  = _renderPreviewDots(after, rule, proposed);

  return `
    <div class="rde-preview-col">
      <div class="rde-preview-col-hdr">Before</div>
      ${beforeHtml}
    </div>
    <div class="rde-preview-col">
      <div class="rde-preview-col-hdr">After</div>
      ${afterHtml}
    </div>`;
}

function _cloneChar(c) {
  const clone = JSON.parse(JSON.stringify(c));
  // Re-Set instances are lost in JSON round-trip; applyDerivedMerits re-creates them
  return clone;
}

function _simulateAfter(charClone, currentRule, proposedData) {
  switch (_activeFamily) {
    case 'grant': {
      if (currentRule?.condition === 'bloodline' || proposedData?.condition === 'bloodline') {
        // Bloodline preview: re-run bloodline evaluator with the proposed rule substituted
        (charClone.merits || []).forEach(m => {
          if (m.granted_by === 'Bloodline') { m.free = 0; m.free_bloodline = 0; }
        });
        charClone._bloodline_free_specs = [];
        const bloodlineGrants = (getRulesBySource('Bloodline').grants || []).map(r =>
          r._id === currentRule._id ? { ...r, ...proposedData } : r,
        );
        applyBloodlineRulesFromDb(charClone, { grants: bloodlineGrants });
      } else {
        // PT preview: re-run PT evaluator with the proposed rule substituted
        const ptGrants = (getRulesBySource('Professional Training').grants || []).map(r =>
          r._id === currentRule._id ? { ...r, ...proposedData } : r,
        );
        (charClone.merits || []).forEach(m => { m.free_pt = 0; });
        charClone._pt_nine_again_skills = new Set();
        charClone._pt_dot4_bonus_skills = new Set();
        applyPTRulesFromDb(charClone, {
          grants: ptGrants,
          nineAgain: getRulesBySource('Professional Training').nineAgain || [],
          skillBonus: getRulesBySource('Professional Training').skillBonus || [],
        });
      }
      break;
    }
    case 'skill_bonus': {
      const ptSkillBonus = (getRulesBySource('Professional Training').skillBonus || []).map(r =>
        r._id === currentRule._id ? { ...r, ...proposedData } : r
      );
      charClone._pt_nine_again_skills = new Set();
      charClone._pt_dot4_bonus_skills = new Set();
      applyPTRulesFromDb(charClone, {
        grants: getRulesBySource('Professional Training').grants || [],
        nineAgain: getRulesBySource('Professional Training').nineAgain || [],
        skillBonus: ptSkillBonus,
      });
      break;
    }
    case 'nine_again': {
      const ptNineAgain = (getRulesBySource('Professional Training').nineAgain || []).map(r =>
        r._id === currentRule._id ? { ...r, ...proposedData } : r
      );
      charClone._pt_nine_again_skills = new Set();
      charClone._pt_dot4_bonus_skills = new Set();
      applyPTRulesFromDb(charClone, {
        grants: getRulesBySource('Professional Training').grants || [],
        nineAgain: ptNineAgain,
        skillBonus: getRulesBySource('Professional Training').skillBonus || [],
      });
      break;
    }
    default:
      // For other families, just re-apply normal derived merits
      applyDerivedMerits(charClone);
  }
}

function _renderPreviewDots(char, rule, proposed) {
  const merits = (char.merits || []).filter(m => m.category === 'influence' || m.category === 'domain');
  if (!merits.length) return '<p class="rde-preview-empty">No merits to display.</p>';

  // Show merits that have any bonus-dot source
  const relevant = merits.filter(m =>
    (m.free_pt || 0) + (m.free_mci || 0) + (m.free || 0) + (m.free_mdb || 0) + (m.free_bloodline || 0) > 0 || m.free_pt !== undefined
  );
  if (!relevant.length) return '<p class="rde-preview-empty">No bonus-dot merits on this character.</p>';

  let h = '<div class="rde-preview-merits">';
  for (const m of relevant) {
    const base = (m.cp || 0) + (m.xp || 0);
    const bonus = (m.free_pt || 0) + (m.free_mci || 0) + (m.free || 0) + (m.free_mdb || 0) + (m.free_bloodline || 0);
    h += `<div class="rde-preview-merit-row">
      <span class="rde-preview-merit-name">${esc(m.name)}</span>
      <span class="rde-preview-merit-dots">${shDotsWithBonus(base, bonus)}</span>
    </div>`;
  }
  h += '</div>';
  return h;
}

// ── Validation ──

function _validate(data) {
  const errs = [];
  const skillSet = new Set(ALL_SKILLS.map(s => s.toLowerCase()));
  const meritNames = new Set(getRulesByCategory('merit').map(r => r.name.toLowerCase()));

  switch (_activeFamily) {
    case 'grant': {
      if (!data.source?.trim()) errs.push({ id: 'rde-f-source-err', msg: 'Source is required.' });
      if (!data.grant_type) errs.push({ id: 'rde-f-grant-type-err', msg: 'Grant type is required.' });
      if (!data.amount_basis) errs.push({ id: 'rde-f-amount-basis-err', msg: 'Amount basis is required.' });
      if (data.grant_type === 'pool') {
        if (!data.pool_targets?.length) errs.push({ id: 'rde-f-pool-targets-err', msg: 'Pool targets are required for pool grants.' });
      } else {
        if (!data.target?.trim()) errs.push({ id: 'rde-f-target-err', msg: 'Target is required.' });
        if (data.grant_type === 'merit' && data.target && !meritNames.has(data.target.toLowerCase())) {
          errs.push({ id: 'rde-f-target-err', msg: `"${data.target}" is not in MERITS_DB. Check spelling.` });
        }
        if (data.source?.trim() === data.target?.trim()) errs.push({ id: 'rde-f-target-err', msg: 'Source and target must differ.' });
        if (data.amount == null || isNaN(data.amount)) errs.push({ id: 'rde-f-amount-err', msg: 'Amount is required.' });
      }
      break;
    }
    case 'speciality_grant': {
      if (!data.source?.trim()) errs.push({ id: 'rde-f-source-err', msg: 'Source is required.' });
      if (!data.target_skill?.trim()) errs.push({ id: 'rde-f-target-skill-err', msg: 'Target skill is required.' });
      if (data.target_skill && !skillSet.has(data.target_skill.toLowerCase())) {
        errs.push({ id: 'rde-f-target-skill-err', msg: `"${data.target_skill}" is not a recognised skill.` });
      }
      if (!data.spec?.trim()) errs.push({ id: 'rde-f-spec-err', msg: 'Speciality is required.' });
      break;
    }
    case 'skill_bonus': {
      if (!data.source?.trim()) errs.push({ id: 'rde-f-source-err', msg: 'Source is required.' });
      if (!data.target_skill?.trim()) errs.push({ id: 'rde-f-target-skill-err', msg: 'Target skill is required.' });
      if (data.target_skill && !skillSet.has(data.target_skill.toLowerCase()) && data.target_skill !== 'dot4_skill') {
        errs.push({ id: 'rde-f-target-skill-err', msg: `"${data.target_skill}" is not a recognised skill (or "dot4_skill" sentinel).` });
      }
      if (!data.amount || isNaN(data.amount)) errs.push({ id: 'rde-f-amount-err', msg: 'Amount is required.' });
      break;
    }
    case 'nine_again': {
      if (!data.source?.trim()) errs.push({ id: 'rde-f-source-err', msg: 'Source is required.' });
      if (!data.target_skills) errs.push({ id: 'rde-f-target-skills-err', msg: 'Target skills required.' });
      if (Array.isArray(data.target_skills)) {
        const bad = data.target_skills.filter(s => !skillSet.has(s.toLowerCase()));
        if (bad.length) errs.push({ id: 'rde-f-target-skills-err', msg: `Unrecognised skills: ${bad.join(', ')}` });
      }
      break;
    }
    case 'disc_attr': {
      if (!data.discipline?.trim()) errs.push({ id: 'rde-f-discipline-err', msg: 'Discipline is required.' });
      if (!data.target_kind) errs.push({ id: 'rde-f-target-kind-err', msg: 'Target kind is required.' });
      if (!data.target_name?.trim()) errs.push({ id: 'rde-f-target-name-err', msg: 'Target name is required.' });
      if (!data.amount_basis) errs.push({ id: 'rde-f-amount-basis-err', msg: 'Amount basis is required.' });
      break;
    }
    case 'derived_stat_modifier': {
      if (!data.source?.trim()) errs.push({ id: 'rde-f-source-err', msg: 'Source is required.' });
      if (!data.target_stat) errs.push({ id: 'rde-f-target-stat-err', msg: 'Target stat is required.' });
      if (!data.mode) errs.push({ id: 'rde-f-mode-err', msg: 'Mode is required.' });
      break;
    }
    case 'tier_budget': {
      if (!data.source?.trim()) errs.push({ id: 'rde-f-source-err', msg: 'Source is required.' });
      if (!Array.isArray(data.budgets) || data.budgets.length < 2) errs.push({ id: 'rde-f-budgets-err', msg: 'Enter at least 1 budget (tiers 1+).' });
      break;
    }
    case 'status_floor': {
      if (!data.source?.trim()) errs.push({ id: 'rde-f-source-err', msg: 'Source is required.' });
      if (!data.target_status_kind) errs.push({ id: 'rde-f-status-kind-err', msg: 'Status kind is required.' });
      if (!data.target_status_name?.trim()) errs.push({ id: 'rde-f-status-name-err', msg: 'Status name is required.' });
      if (data.floor_value == null || isNaN(data.floor_value)) errs.push({ id: 'rde-f-floor-value-err', msg: 'Floor value is required.' });
      break;
    }
  }
  return errs;
}

function _showValidationErrors(errs) {
  // Clear all
  document.querySelectorAll('.rde-form-err').forEach(el => { el.textContent = ''; el.closest('.rde-form-field')?.classList.remove('rde-field-err'); });
  for (const { id, msg } of errs) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.closest('.rde-form-field')?.classList.add('rde-field-err'); }
  }
}

// ── Collect form data ──

function _readFormData() {
  const v = (id) => document.getElementById(id)?.value?.trim() || null;
  const n = (id) => { const el = document.getElementById(id); const val = parseFloat(el?.value); return isNaN(val) ? null : val; };

  switch (_activeFamily) {
    case 'grant': {
      const d = {
        source: v('rde-f-source'),
        condition: v('rde-f-condition') || 'always',
        grant_type: v('rde-f-grant-type') || 'merit',
        target: v('rde-f-target'),
        amount: n('rde-f-amount'),
        amount_basis: v('rde-f-amount-basis') || 'flat',
        notes: v('rde-notes'),
      };
      const tier = n('rde-f-tier');
      if (tier != null) d.tier = tier;
      const bl = v('rde-f-bloodline-name');
      if (bl) d.bloodline_name = bl;
      const tq = v('rde-f-target-qualifier');
      if (tq) d.target_qualifier = tq;
      const ptRaw = v('rde-f-pool-targets');
      if (ptRaw) d.pool_targets = ptRaw.split(',').map(s => s.trim()).filter(Boolean);
      const pm = v('rde-f-partner-merit-name');
      if (pm) d.partner_merit_name = pm;
      return d;
    }
    case 'speciality_grant':
      return {
        source: v('rde-f-source'),
        tier: n('rde-f-tier'),
        target_skill: v('rde-f-target-skill'),
        spec: v('rde-f-spec'),
        notes: v('rde-notes'),
      };
    case 'skill_bonus':
      return {
        source: v('rde-f-source'),
        tier: n('rde-f-tier'),
        target_skill: v('rde-f-target-skill'),
        amount: n('rde-f-amount'),
        notes: v('rde-notes'),
      };
    case 'nine_again': {
      const raw = v('rde-f-target-skills');
      let target_skills;
      if (raw === 'asset_skills') {
        target_skills = 'asset_skills';
      } else {
        target_skills = (raw || '').split(',').map(s => s.trim()).filter(Boolean);
      }
      return { source: v('rde-f-source'), tier: n('rde-f-tier'), target_skills, notes: v('rde-notes') };
    }
    case 'disc_attr':
      return {
        discipline: v('rde-f-discipline'),
        target_kind: v('rde-f-target-kind') || 'attribute',
        target_name: v('rde-f-target-name'),
        amount_basis: v('rde-f-amount-basis') || 'rating',
        flat_amount: n('rde-f-flat-amount'),
        notes: v('rde-notes'),
      };
    case 'derived_stat_modifier':
      return {
        source: v('rde-f-source'),
        target_stat: v('rde-f-target-stat'),
        mode: v('rde-f-mode') || 'flat',
        flat_amount: n('rde-f-flat-amount'),
        swap_from: v('rde-f-swap-from'),
        swap_to: v('rde-f-swap-to'),
        notes: v('rde-notes'),
      };
    case 'tier_budget': {
      const rawB = v('rde-f-budgets');
      const parsed = (rawB || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      return { source: v('rde-f-source'), budgets: [0, ...parsed], notes: v('rde-notes') };
    }
    case 'status_floor':
      return {
        source: v('rde-f-source'),
        target_status_kind: v('rde-f-status-kind') || 'covenant',
        target_status_name: v('rde-f-status-name'),
        floor_value: n('rde-f-floor-value'),
        notes: v('rde-notes'),
      };
    default: return {};
  }
}

// ── Save / Delete ──

async function _handleSave() {
  const data = _readFormData();
  const errs = _validate(data);
  _showValidationErrors(errs);
  if (errs.length) {
    _setStatus('Fix validation errors above.', true);
    return;
  }

  const saveBtn = document.getElementById('rde-save-btn');
  if (saveBtn) saveBtn.disabled = true;
  _setStatus('Saving…', false);

  const endpoint = FAMILY_BY_KEY[_activeFamily]?.endpoint;
  try {
    if (_isNewRule) {
      await apiPost(endpoint, data);
    } else {
      await apiPut(`${endpoint}/${_selectedRule._id}`, data);
    }
    invalidateRulesCache();
    await preloadRules();
    await _fetchFamily(_activeFamily);
    _counts[_activeFamily] = (_rules[_activeFamily] || []).length;
    _selectedRule = null;
    _isNewRule = false;
    _formDirty = false;
    _rerenderAll();
  } catch (err) {
    if (saveBtn) saveBtn.disabled = false;
    _setStatus(err.message || 'Save failed.', true);
  }
}

async function _handleDelete(ruleId) {
  if (!confirm('Delete this rule? This cannot be undone.')) return;
  const endpoint = FAMILY_BY_KEY[_activeFamily]?.endpoint;
  try {
    await apiDelete(`${endpoint}/${ruleId}`);
    invalidateRulesCache();
    await preloadRules();
    await _fetchFamily(_activeFamily);
    _counts[_activeFamily] = (_rules[_activeFamily] || []).length;
    _selectedRule = null;
    _formDirty = false;
    _rerenderAll();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}

function _setStatus(msg, isError) {
  const el = document.getElementById('rde-form-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'rde-form-status' + (isError ? ' rde-status-err' : '');
}

// ── Re-render helpers ──

function _rerenderAll() {
  const rail = document.getElementById('rde-rail');
  if (rail) rail.innerHTML = _renderRail();
  const main = document.getElementById('rde-main');
  if (main) { main.innerHTML = _renderList(); _rewireListEvents(main); }
}

// ── Event wiring ──

function _wireEvents() {
  const rail = document.getElementById('rde-rail');
  if (rail) {
    rail.addEventListener('click', e => {
      const btn = e.target.closest('[data-family]');
      if (!btn) return;
      if (_formDirty && !confirm('Discard unsaved changes?')) return;
      _activeFamily = btn.dataset.family;
      _selectedRule = null;
      _isNewRule = false;
      _formDirty = false;
      _searchQuery = '';
      _rerenderAll();
    });
  }
  const main = document.getElementById('rde-main');
  if (main) _rewireListEvents(main);
}

function _rewireListEvents(main) {
  const search = main.querySelector('#rde-search');
  if (search) {
    search.addEventListener('input', e => {
      _searchQuery = e.target.value;
      main.innerHTML = _renderList();
      _rewireListEvents(main);
      const el = main.querySelector('#rde-search');
      if (el) el.focus();
    });
  }

  main.querySelectorAll('.rde-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const id = row.dataset.ruleId;
      const rule = (_rules[_activeFamily] || []).find(r => r._id === id);
      if (rule) _openSidePanel(rule, false);
    });
  });

  main.querySelectorAll('.rde-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const rule = (_rules[_activeFamily] || []).find(r => r._id === btn.dataset.ruleId);
      if (rule) _openSidePanel(rule, false);
    });
  });

  main.querySelectorAll('.rde-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _handleDelete(btn.dataset.ruleId);
    });
  });

  const newBtn = main.querySelector('#rde-new-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      if (_formDirty && !confirm('Discard unsaved changes?')) return;
      _openSidePanel(null, true);
    });
  }
}

function _wireSidePanelEvents() {
  const panel = document.getElementById('rde-side-panel');
  if (!panel) return;

  panel.querySelector('#rde-cancel-btn')?.addEventListener('click', () => {
    if (_formDirty && !confirm('Discard unsaved changes?')) return;
    _closeSidePanel();
  });

  panel.querySelector('#rde-save-btn')?.addEventListener('click', _handleSave);

  panel.querySelector('#rde-del-btn')?.addEventListener('click', () => {
    if (_selectedRule) _handleDelete(_selectedRule._id);
  });

  // Mark dirty on any form change
  panel.addEventListener('input', () => { _formDirty = true; });
  panel.addEventListener('change', () => { _formDirty = true; });

  // Preview character selector
  panel.querySelector('#rde-preview-char')?.addEventListener('change', e => {
    _previewCharId = e.target.value;
    const cols = document.getElementById('rde-preview-cols');
    if (cols) cols.innerHTML = _renderPreviewCols(_selectedRule);
  });

  // Refresh preview when form fields change (debounced)
  let _previewTimer = null;
  panel.addEventListener('input', () => {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      const cols = document.getElementById('rde-preview-cols');
      if (cols && _previewCharId) cols.innerHTML = _renderPreviewCols(_selectedRule);
    }, 400);
  });
}
