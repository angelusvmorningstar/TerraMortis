/**
 * Rules domain — browse, search, filter, and edit purchasable powers.
 * ST-only admin panel for managing the unified rules database.
 */

import { apiGet, apiPut } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { invalidateRulesCache } from '../data/loader.js';
import { prereqLabel } from '../data/prereq.js';

let allRules = [];
let filteredRules = [];
let activeCategory = '';
let searchQuery = '';
let expandedKey = null;

const CATEGORIES = ['', 'attribute', 'skill', 'discipline', 'merit', 'devotion', 'rite', 'manoeuvre'];
const CAT_LABELS = { '': 'All', attribute: 'Attributes', skill: 'Skills', discipline: 'Disciplines', merit: 'Merits', devotion: 'Devotions', rite: 'Rites', manoeuvre: 'Manoeuvres' };

export async function initRulesView(container) {
  if (!container) return;
  container.innerHTML = '<p class="placeholder-msg">Loading rules...</p>';

  try {
    allRules = await apiGet('/api/rules');
  } catch (err) {
    container.innerHTML = `<p class="placeholder-msg">Failed to load rules: ${esc(err.message)}</p>`;
    return;
  }

  // Update count badge
  const badge = document.getElementById('rules-count');
  if (badge) badge.textContent = allRules.length;

  applyFilters();
  render(container);
  wireEvents(container);
}

function applyFilters() {
  filteredRules = allRules;
  if (activeCategory) filteredRules = filteredRules.filter(r => r.category === activeCategory);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredRules = filteredRules.filter(r =>
      r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
    );
  }
}

function render(container) {
  let h = '';

  // Category filter pills
  h += '<div class="rules-filters">';
  for (const cat of CATEGORIES) {
    const active = cat === activeCategory ? ' rules-cat-active' : '';
    const count = cat ? allRules.filter(r => r.category === cat).length : allRules.length;
    h += `<button class="rules-cat-btn${active}" data-rules-cat="${cat}">${esc(CAT_LABELS[cat])} <span class="rules-cat-count">${count}</span></button>`;
  }
  h += '</div>';

  // Search
  h += '<div class="rules-search-row">';
  h += `<input type="text" class="rules-search" id="rules-search" placeholder="Search by name or description\u2026" value="${esc(searchQuery)}">`;
  h += `<span class="rules-result-count">${filteredRules.length} / ${allRules.length}</span>`;
  h += '</div>';

  // Table
  h += '<div class="rules-table">';
  for (const rule of filteredRules) {
    const isExpanded = rule.key === expandedKey;
    const prereqStr = rule.prereq ? prereqLabel(rule.prereq) : '';
    const ratingStr = rule.rating_range ? `${rule.rating_range[0]}\u2013${rule.rating_range[1]}` : (rule.rank ? `Rank ${rule.rank}` : '');

    h += `<div class="rules-row${isExpanded ? ' rules-row-expanded' : ''}" data-rules-key="${esc(rule.key)}">`;
    h += '<div class="rules-row-header" data-rules-toggle>';
    h += `<span class="rules-name">${esc(rule.name)}</span>`;
    h += `<span class="rules-cat-tag">${esc(rule.category)}</span>`;
    if (rule.parent) h += `<span class="rules-parent">${esc(rule.parent)}</span>`;
    if (ratingStr) h += `<span class="rules-rating">${ratingStr}</span>`;
    if (prereqStr) h += `<span class="rules-prereq">${esc(prereqStr)}</span>`;
    h += '</div>';

    if (isExpanded) {
      h += renderEditPanel(rule);
    }
    h += '</div>';
  }
  if (!filteredRules.length) {
    h += '<p class="placeholder-msg">No rules match your search.</p>';
  }
  h += '</div>';

  container.innerHTML = h;
}

function renderEditPanel(rule) {
  let h = '<div class="rules-edit-panel">';

  // Read-only fields
  h += '<div class="rules-ro-grid">';
  h += roField('Key', rule.key);
  h += roField('Category', rule.category);
  if (rule.parent) h += roField('Parent', rule.parent);
  if (rule.rank) h += roField('Rank', rule.rank);
  if (rule.pool) {
    const poolParts = [rule.pool.attr, rule.pool.skill, rule.pool.disc].filter(Boolean);
    h += roField('Pool', poolParts.join(' + ') || 'None');
  }
  if (rule.resistance) h += roField('Resistance', rule.resistance);
  if (rule.cost) h += roField('Cost', rule.cost);
  if (rule.action) h += roField('Action', rule.action);
  if (rule.duration) h += roField('Duration', rule.duration);
  h += '</div>';

  // Editable fields
  h += '<div class="rules-edit-fields">';
  h += editField('Description', 'textarea', 'description', rule.description || '', 4);
  h += editRatingRange(rule.rating_range);
  if (rule.category === 'devotion') {
    h += editField('XP Cost', 'number', 'xp_fixed', rule.xp_fixed || '', 1);
  }
  h += editField('Special', 'text', 'special', rule.special || '');
  h += editField('Exclusive', 'text', 'exclusive', rule.exclusive || '');
  h += editField('Bloodline', 'text', 'bloodline', rule.bloodline || '');

  // Prereq editor (JSON)
  h += '<div class="rules-field">';
  h += '<label class="rules-field-label">Prerequisites (JSON)</label>';
  h += `<textarea class="rules-field-input rules-prereq-json" data-field="prereq" rows="4">${esc(rule.prereq ? JSON.stringify(rule.prereq, null, 2) : '')}</textarea>`;
  h += '<p class="rules-field-hint">Edit as JSON. Leave empty for no prerequisites.</p>';
  h += '</div>';

  h += '</div>';

  // Save button
  h += '<div class="rules-edit-actions">';
  h += `<button class="dt-btn rules-save-btn" data-save-key="${esc(rule.key)}">Save Changes</button>`;
  h += '<span class="rules-save-status" id="rules-save-status"></span>';
  h += '</div>';

  h += '</div>';
  return h;
}

function roField(label, value) {
  return `<div class="rules-ro-field"><span class="rules-ro-label">${esc(label)}</span><span class="rules-ro-value">${esc(String(value))}</span></div>`;
}

function editField(label, type, fieldName, value, rows) {
  let h = '<div class="rules-field">';
  h += `<label class="rules-field-label">${esc(label)}</label>`;
  if (type === 'textarea') {
    h += `<textarea class="rules-field-input" data-field="${fieldName}" rows="${rows || 3}">${esc(value)}</textarea>`;
  } else if (type === 'number') {
    h += `<input type="number" class="rules-field-input rules-field-num" data-field="${fieldName}" value="${esc(String(value))}" min="0">`;
  } else {
    h += `<input type="text" class="rules-field-input" data-field="${fieldName}" value="${esc(value)}">`;
  }
  h += '</div>';
  return h;
}

function editRatingRange(rr) {
  const min = rr ? rr[0] : '';
  const max = rr ? rr[1] : '';
  let h = '<div class="rules-field">';
  h += '<label class="rules-field-label">Rating Range</label>';
  h += '<div class="rules-rating-inputs">';
  h += `<input type="number" class="rules-field-input rules-field-num" data-field="rating_min" value="${min}" min="0" max="5" placeholder="Min">`;
  h += '<span class="rules-rating-sep">\u2013</span>';
  h += `<input type="number" class="rules-field-input rules-field-num" data-field="rating_max" value="${max}" min="0" max="5" placeholder="Max">`;
  h += '</div></div>';
  return h;
}

function wireEvents(container) {
  // Category filter
  container.addEventListener('click', (e) => {
    const catBtn = e.target.closest('[data-rules-cat]');
    if (catBtn) {
      activeCategory = catBtn.dataset.rulesCat;
      applyFilters();
      render(container);
      wireEvents(container);
      return;
    }

    // Row toggle
    const toggle = e.target.closest('[data-rules-toggle]');
    if (toggle) {
      const row = toggle.closest('[data-rules-key]');
      const key = row?.dataset.rulesKey;
      expandedKey = expandedKey === key ? null : key;
      applyFilters();
      render(container);
      wireEvents(container);
      return;
    }

    // Save
    const saveBtn = e.target.closest('[data-save-key]');
    if (saveBtn) {
      handleSave(saveBtn.dataset.saveKey, container);
      return;
    }
  });

  // Search
  const searchInput = document.getElementById('rules-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      applyFilters();
      render(container);
      wireEvents(container);
    });
  }
}

async function handleSave(key, container) {
  const panel = container.querySelector('.rules-edit-panel');
  if (!panel) return;

  const updates = {};

  // Collect editable fields
  panel.querySelectorAll('[data-field]').forEach(el => {
    const field = el.dataset.field;
    if (field === 'prereq') return; // handled separately
    if (field === 'rating_min' || field === 'rating_max') return; // handled separately
    if (field === 'xp_fixed') {
      const v = parseInt(el.value, 10);
      updates.xp_fixed = isNaN(v) ? null : v;
    } else {
      updates[field] = el.value || null;
    }
  });

  // Rating range
  const minEl = panel.querySelector('[data-field="rating_min"]');
  const maxEl = panel.querySelector('[data-field="rating_max"]');
  if (minEl && maxEl) {
    const min = parseInt(minEl.value, 10);
    const max = parseInt(maxEl.value, 10);
    updates.rating_range = (!isNaN(min) && !isNaN(max)) ? [min, max] : null;
  }

  // Prereq JSON
  const prereqEl = panel.querySelector('[data-field="prereq"]');
  if (prereqEl) {
    const raw = prereqEl.value.trim();
    if (!raw) {
      updates.prereq = null;
    } else {
      try {
        updates.prereq = JSON.parse(raw);
      } catch {
        const status = document.getElementById('rules-save-status');
        if (status) { status.textContent = 'Invalid prereq JSON'; status.className = 'rules-save-status rules-save-err'; }
        return;
      }
    }
  }

  const status = document.getElementById('rules-save-status');
  if (status) { status.textContent = 'Saving\u2026'; status.className = 'rules-save-status'; }

  try {
    const updated = await apiPut(`/api/rules/${encodeURIComponent(key)}`, updates);
    // Update local cache
    const idx = allRules.findIndex(r => r.key === key);
    if (idx >= 0) allRules[idx] = updated;
    invalidateRulesCache();
    if (status) { status.textContent = 'Saved'; status.className = 'rules-save-status rules-save-ok'; }
    setTimeout(() => {
      applyFilters();
      render(container);
      wireEvents(container);
    }, 500);
  } catch (err) {
    if (status) { status.textContent = `Save failed: ${err.message}`; status.className = 'rules-save-status rules-save-err'; }
  }
}
