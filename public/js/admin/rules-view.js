/**
 * Rules domain — paginated table with modal edit/add for purchasable powers.
 * ST-only admin panel for managing the unified rules database (620+ entries).
 */

import { apiGet, apiPut, apiPost } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { invalidateRulesCache } from '../data/loader.js';
import { prereqLabel } from '../data/prereq.js';

// ── State ──

let _container = null;
let activeCategory = '';
let searchQuery = '';
let currentPage = 1;
let totalPages = 1;
let totalCount = 0;
let pageSize = parseInt(localStorage.getItem('tm_rules_page_size'), 10) || 50;
let _debounceTimer = null;

const CATEGORIES = ['', 'attribute', 'skill', 'discipline', 'merit', 'devotion', 'rite', 'manoeuvre'];
const CAT_LABELS = { '': 'All', attribute: 'Attr', skill: 'Skill', discipline: 'Disc', merit: 'Merit', devotion: 'Devot', rite: 'Rite', manoeuvre: 'Man' };
const CATEGORY_ENUM = ['attribute', 'skill', 'discipline', 'merit', 'devotion', 'rite', 'manoeuvre'];

// ── Init ──

export async function initRulesView(container) {
  if (!container) return;
  _container = container;
  container.innerHTML = '<p class="placeholder-msg">Loading rules\u2026</p>';
  await fetchAndRender();
  wireEvents();
}

// ── Data fetching ──

async function fetchPage() {
  const params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('limit', pageSize);
  if (activeCategory) params.set('category', activeCategory);
  if (searchQuery) params.set('q', searchQuery);
  return apiGet(`/api/rules?${params}`);
}

async function fetchAndRender() {
  try {
    const res = await fetchPage();
    totalCount = res.total;
    totalPages = res.pages;
    currentPage = res.page;
    render(res.data);
  } catch (err) {
    _container.innerHTML = `<p class="placeholder-msg">Failed to load rules: ${esc(err.message)}</p>`;
  }
}

// ── Render ──

function ratingDisplay(rule) {
  if (rule.rating_range) return `${rule.rating_range[0]}\u2013${rule.rating_range[1]}`;
  if (rule.rank) return `Rank ${rule.rank}`;
  if (rule.xp_fixed != null) return `${rule.xp_fixed} XP`;
  return '';
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max) + '\u2026';
}

function render(data) {
  let h = '';

  // ── Toolbar: categories + search + Add button ──
  h += '<div class="rules-filters">';
  for (const cat of CATEGORIES) {
    const active = cat === activeCategory ? ' rules-cat-active' : '';
    h += `<button class="rules-cat-btn${active}" data-rules-cat="${cat}">${esc(CAT_LABELS[cat])}</button>`;
  }
  h += '</div>';

  h += '<div class="rules-search-row">';
  h += '<div class="rules-search-wrap">';
  h += `<input type="text" class="rules-search" id="rules-search" placeholder="Search by name or description\u2026" value="${esc(searchQuery)}">`;
  if (searchQuery) h += '<button class="rules-search-clear" id="rules-search-clear" title="Clear search">\u2715</button>';
  h += '</div>';
  h += `<span class="rules-result-count">${totalCount} result${totalCount === 1 ? '' : 's'}</span>`;
  h += '<button class="dt-btn rules-add-btn" id="rules-add-btn">+ Add Rule</button>';
  h += '</div>';

  // ── Table ──
  h += '<div class="rules-tbl-wrap"><table class="rules-tbl"><thead><tr>';
  h += '<th>Name</th><th>Category</th><th>Parent</th><th>Rating</th><th>Prereqs</th><th></th>';
  h += '</tr></thead><tbody>';
  for (const rule of data) {
    const pq = rule.prereq ? truncate(prereqLabel(rule.prereq), 40) : '';
    h += '<tr>';
    h += `<td class="rules-td-name">${esc(rule.name)}</td>`;
    h += `<td><span class="rules-cat-tag">${esc(rule.category)}</span></td>`;
    h += `<td class="rules-td-dim">${esc(rule.parent || '')}</td>`;
    h += `<td class="rules-td-dim">${ratingDisplay(rule)}</td>`;
    h += `<td class="rules-td-prereq" title="${esc(rule.prereq ? prereqLabel(rule.prereq) : '')}">${esc(pq)}</td>`;
    h += `<td><button class="rules-edit-btn" data-edit-key="${esc(rule.key)}" title="Edit">&#9998;</button></td>`;
    h += '</tr>';
  }
  if (!data.length) {
    h += '<tr><td colspan="6" class="rules-td-empty">No rules match your filters.</td></tr>';
  }
  h += '</tbody></table></div>';

  // ── Pagination ──
  h += '<div class="rules-pag">';
  h += `<button class="rules-pag-btn" id="rules-prev"${currentPage <= 1 ? ' disabled' : ''}>\u25C0 Prev</button>`;
  h += `<span class="rules-pag-info">Page ${currentPage} of ${totalPages}</span>`;
  h += `<button class="rules-pag-btn" id="rules-next"${currentPage >= totalPages ? ' disabled' : ''}>Next \u25B6</button>`;
  h += '<select class="rules-pag-size" id="rules-page-size">';
  for (const sz of [25, 50, 100]) {
    h += `<option value="${sz}"${sz === pageSize ? ' selected' : ''}>${sz}</option>`;
  }
  h += '</select>';
  h += '</div>';

  _container.innerHTML = h;
}

// ── Events ──

function wireEvents() {
  _container.addEventListener('click', handleClick);
  _container.addEventListener('input', handleInput);
  _container.addEventListener('change', handleChange);
}

function handleClick(e) {
  const catBtn = e.target.closest('[data-rules-cat]');
  if (catBtn) { activeCategory = catBtn.dataset.rulesCat; currentPage = 1; fetchAndRender(); return; }

  const editBtn = e.target.closest('[data-edit-key]');
  if (editBtn) { openEditModal(editBtn.dataset.editKey); return; }

  if (e.target.closest('#rules-add-btn')) { openAddModal(); return; }

  if (e.target.closest('#rules-prev') && currentPage > 1) { currentPage--; fetchAndRender(); return; }
  if (e.target.closest('#rules-next') && currentPage < totalPages) { currentPage++; fetchAndRender(); return; }

  if (e.target.closest('#rules-search-clear')) {
    searchQuery = '';
    currentPage = 1;
    fetchAndRender().then(() => { document.getElementById('rules-search')?.focus(); });
  }
}

function handleInput(e) {
  if (e.target.id !== 'rules-search') return;
  const inp = e.target;
  searchQuery = inp.value;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    const pos = inp.selectionStart;
    currentPage = 1;
    fetchAndRender().then(() => {
      const restored = document.getElementById('rules-search');
      if (restored) { restored.focus(); restored.selectionStart = restored.selectionEnd = Math.min(pos, restored.value.length); }
    });
  }, 300);
}

function handleChange(e) {
  if (e.target.id === 'rules-page-size') {
    pageSize = parseInt(e.target.value, 10) || 50;
    localStorage.setItem('tm_rules_page_size', String(pageSize));
    currentPage = 1;
    fetchAndRender();
  }
}

// ── Edit Modal ──

async function openEditModal(key) {
  let rule;
  try {
    rule = await apiGet(`/api/rules/${encodeURIComponent(key)}`);
  } catch (err) {
    alert(`Failed to load rule: ${err.message}`);
    return;
  }
  showModal(renderModalContent(rule, false));
}

function openAddModal() {
  showModal(renderModalContent(null, true));
}

function showModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'rules-modal-overlay';
  overlay.innerHTML = `<div class="rules-modal-dialog">${html}</div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  const escHandler = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  const dialog = overlay.querySelector('.rules-modal-dialog');
  dialog.querySelector('.rules-modal-cancel')?.addEventListener('click', closeModal);
  dialog.querySelector('.rules-modal-save')?.addEventListener('click', () => handleModalSave(dialog));

  // Auto-slug for add modal
  const nameInput = dialog.querySelector('[data-field="name"]');
  const keyInput = dialog.querySelector('[data-field="key"]');
  if (nameInput && keyInput) {
    nameInput.addEventListener('blur', () => {
      if (!keyInput.dataset.userEdited) keyInput.value = slugify(nameInput.value);
    });
    keyInput.addEventListener('input', () => { keyInput.dataset.userEdited = 'true'; });
  }
}

function closeModal() {
  document.querySelector('.rules-modal-overlay')?.remove();
}

function slugify(str) {
  return (str || '').toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Modal Content ──

function renderModalContent(rule, isAdd) {
  const title = isAdd ? 'Add Rule' : `Edit: ${rule.name}`;
  const mode = isAdd ? 'add' : 'edit';
  const key = rule?.key || '';

  let h = `<div class="rules-modal-header">${esc(title)}</div>`;
  h += `<div class="rules-modal-body" data-mode="${mode}" data-key="${esc(key)}">`;

  if (isAdd) {
    h += '<div class="rules-modal-grid">';
    h += mf('Key', 'text', 'key', '', 'auto-generated from name');
    h += mf('Name', 'text', 'name', '', 'required');
    h += ms('Category', 'category', '', CATEGORY_ENUM, 'required');
    h += mf('Parent', 'text', 'parent', '');
    h += mf('Rank', 'number', 'rank', '');
    h += mf('XP Fixed', 'number', 'xp_fixed', '');
    h += '</div>';
    h += mf('Rating Range', 'rating_range', 'rating_range', null);
    h += '<div class="rules-modal-grid">';
    h += mf('Pool Attr', 'text', 'pool_attr', '');
    h += mf('Pool Skill', 'text', 'pool_skill', '');
    h += mf('Pool Disc', 'text', 'pool_disc', '');
    h += '</div>';
    h += '<div class="rules-modal-grid">';
    h += mf('Resistance', 'text', 'resistance', '');
    h += mf('Cost', 'text', 'cost', '');
    h += mf('Action', 'text', 'action', '');
    h += mf('Duration', 'text', 'duration', '');
    h += '</div>';
    h += mf('Description', 'textarea', 'description', '', null, 4);
    h += '<div class="rules-modal-grid">';
    h += mf('Special', 'text', 'special', '');
    h += mf('Exclusive', 'text', 'exclusive', '');
    h += mf('Bloodline', 'text', 'bloodline', '');
    h += '</div>';
    h += mf('Prerequisites (JSON)', 'textarea', 'prereq', '', 'JSON object or null', 3);
  } else {
    h += '<div class="rules-modal-ro">';
    h += roSpan('Key', rule.key);
    h += roSpan('Category', rule.category);
    h += '</div>';
    h += '<div class="rules-modal-grid">';
    h += mf('Name', 'text', 'name', rule.name || '');
    h += mf('Parent', 'text', 'parent', rule.parent || '');
    h += mf('Rank', 'number', 'rank', rule.rank ?? '');
    h += mf('XP Fixed', 'number', 'xp_fixed', rule.xp_fixed ?? '');
    h += '</div>';
    h += mf('Rating Range', 'rating_range', 'rating_range', rule.rating_range);
    h += '<div class="rules-modal-grid">';
    h += mf('Pool Attr', 'text', 'pool_attr', rule.pool?.attr || '');
    h += mf('Pool Skill', 'text', 'pool_skill', rule.pool?.skill || '');
    h += mf('Pool Disc', 'text', 'pool_disc', rule.pool?.disc || '');
    h += '</div>';
    h += '<div class="rules-modal-grid">';
    h += mf('Resistance', 'text', 'resistance', rule.resistance || '');
    h += mf('Cost', 'text', 'cost', rule.cost || '');
    h += mf('Action', 'text', 'action', rule.action || '');
    h += mf('Duration', 'text', 'duration', rule.duration || '');
    h += '</div>';
    h += mf('Description', 'textarea', 'description', rule.description || '', null, 4);
    h += '<div class="rules-modal-grid">';
    h += mf('Special', 'text', 'special', rule.special || '');
    h += mf('Exclusive', 'text', 'exclusive', rule.exclusive || '');
    h += mf('Bloodline', 'text', 'bloodline', rule.bloodline || '');
    h += '</div>';
    h += mf('Prerequisites (JSON)', 'textarea', 'prereq',
      rule.prereq ? JSON.stringify(rule.prereq, null, 2) : '', 'JSON object or null', 3);
  }

  h += '</div>';
  h += '<div class="rules-modal-footer">';
  h += '<span class="rules-modal-status" id="rules-modal-status"></span>';
  h += '<button class="dt-btn rules-modal-cancel">Cancel</button>';
  h += `<button class="dt-btn rules-modal-save">${isAdd ? 'Create' : 'Save'}</button>`;
  h += '</div>';
  return h;
}

function roSpan(label, value) {
  return `<div class="rules-modal-ro-field"><span class="rules-modal-ro-label">${esc(label)}</span> <span class="rules-modal-ro-value">${esc(String(value))}</span></div>`;
}

/** Modal field shorthand. */
function mf(label, type, name, value, hint, rows) {
  if (type === 'rating_range') {
    const min = value ? value[0] : '';
    const max = value ? value[1] : '';
    return '<div class="rules-modal-field rules-modal-rr">'
      + `<label class="rules-modal-label">${esc(label)}</label>`
      + '<div class="rules-rating-inputs">'
      + `<input type="number" class="rules-modal-input rules-modal-num" data-field="rating_min" value="${min}" min="0" max="10" placeholder="Min">`
      + '<span class="rules-rating-sep">\u2013</span>'
      + `<input type="number" class="rules-modal-input rules-modal-num" data-field="rating_max" value="${max}" min="0" max="10" placeholder="Max">`
      + '</div></div>';
  }
  let h = '<div class="rules-modal-field">';
  h += `<label class="rules-modal-label">${esc(label)}</label>`;
  if (type === 'textarea') {
    h += `<textarea class="rules-modal-input${name === 'prereq' ? ' rules-modal-mono' : ''}" data-field="${name}" rows="${rows || 3}">${esc(String(value))}</textarea>`;
  } else if (type === 'number') {
    h += `<input type="number" class="rules-modal-input rules-modal-num" data-field="${name}" value="${esc(String(value))}" min="0">`;
  } else {
    h += `<input type="text" class="rules-modal-input" data-field="${name}" value="${esc(String(value))}">`;
  }
  if (hint) h += `<div class="rules-modal-hint">${esc(hint)}</div>`;
  h += '</div>';
  return h;
}

/** Modal select shorthand. */
function ms(label, name, value, options, hint) {
  let h = '<div class="rules-modal-field">';
  h += `<label class="rules-modal-label">${esc(label)}</label>`;
  h += `<select class="rules-modal-input" data-field="${name}">`;
  h += '<option value="">\u2014</option>';
  for (const opt of options) h += `<option value="${esc(opt)}"${opt === value ? ' selected' : ''}>${esc(opt)}</option>`;
  h += '</select>';
  if (hint) h += `<div class="rules-modal-hint">${esc(hint)}</div>`;
  h += '</div>';
  return h;
}

// ── Modal Save ──

async function handleModalSave(dialog) {
  const body = dialog.querySelector('.rules-modal-body');
  const mode = body.dataset.mode;
  const key = body.dataset.key;
  const status = dialog.querySelector('#rules-modal-status');

  const updates = {};
  body.querySelectorAll('[data-field]').forEach(el => {
    const f = el.dataset.field;
    if (f === 'prereq' || f === 'rating_min' || f === 'rating_max' || f === 'pool_attr' || f === 'pool_skill' || f === 'pool_disc') return;
    if (f === 'xp_fixed' || f === 'rank') {
      const v = parseInt(el.value, 10);
      updates[f] = isNaN(v) ? null : v;
    } else {
      updates[f] = el.value.trim() || null;
    }
  });

  // Rating range
  const minEl = body.querySelector('[data-field="rating_min"]');
  const maxEl = body.querySelector('[data-field="rating_max"]');
  if (minEl && maxEl) {
    const min = parseInt(minEl.value, 10);
    const max = parseInt(maxEl.value, 10);
    updates.rating_range = (!isNaN(min) && !isNaN(max)) ? [min, max] : null;
  }

  // Pool
  const pa = body.querySelector('[data-field="pool_attr"]')?.value.trim() || null;
  const ps = body.querySelector('[data-field="pool_skill"]')?.value.trim() || null;
  const pd = body.querySelector('[data-field="pool_disc"]')?.value.trim() || null;
  updates.pool = (pa || ps || pd) ? { attr: pa, skill: ps, disc: pd } : null;

  // Prereq JSON
  const prereqEl = body.querySelector('[data-field="prereq"]');
  if (prereqEl) {
    const raw = prereqEl.value.trim();
    if (!raw) { updates.prereq = null; }
    else { try { updates.prereq = JSON.parse(raw); } catch { setStatus(status, 'Invalid prereq JSON', true); return; } }
  }

  // Client-side validation for Add
  if (mode === 'add') {
    if (!updates.key) { setStatus(status, 'Key is required', true); return; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(updates.key)) { setStatus(status, 'Key must be lowercase slug (a-z, 0-9, hyphens)', true); return; }
    if (!updates.name) { setStatus(status, 'Name is required', true); return; }
    if (!updates.category) { setStatus(status, 'Category is required', true); return; }
  }

  setStatus(status, 'Saving\u2026', false);

  try {
    if (mode === 'add') await apiPost('/api/rules', updates);
    else await apiPut(`/api/rules/${encodeURIComponent(key)}`, updates);
    invalidateRulesCache();
    setStatus(status, 'Saved', false);
    setTimeout(() => { closeModal(); fetchAndRender(); }, 400);
  } catch (err) {
    setStatus(status, err.message || 'Save failed', true);
  }
}

function setStatus(el, msg, isError) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'rules-modal-status' + (isError ? ' rules-modal-err' : '');
}
