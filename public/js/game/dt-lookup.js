/* Game app — downtime submission lookup.
   Fetches the current cycle's submission for the active character
   and renders it read-only with st_review visible. */

import { apiGet } from '../data/api.js';
import { esc } from '../data/helpers.js';

const SECTIONS = [
  { key: 'court',         title: 'Court' },
  { key: 'regency',       title: 'Regency' },
  { key: 'feeding',       title: 'Feeding' },
  { key: 'projects',      title: 'Projects' },
  { key: 'spheres',       title: 'Spheres' },
  { key: 'contacts',      title: 'Contacts' },
  { key: 'retainers',     title: 'Retainers' },
  { key: 'acquisitions',  title: 'Acquisitions' },
  { key: 'blood_sorcery', title: 'Blood Sorcery' },
  { key: 'vamping',       title: 'Vamping' },
  { key: 'admin',         title: 'Admin' },
];

const SKIP = new Set(['_id','cycle_id','character_id','created_at','updated_at','status','st_review']);

export async function loadDtLookup(el, char) {
  el.innerHTML = '<div class="dtl-loading">Loading\u2026</div>';
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    if (!cycles.length) {
      el.innerHTML = '<div class="dtl-empty">No downtime cycles created yet.</div>';
      return;
    }
    // Most recent cycle by opened_date
    cycles.sort((a, b) => new Date(b.opened_date || 0) - new Date(a.opened_date || 0));
    const cycle = cycles[0];

    const subs = await apiGet('/api/downtime_submissions?cycle_id=' + cycle._id);
    const charId = String(char._id);
    const sub = subs.find(s => String(s.character_id) === charId) || null;

    el.innerHTML = render(cycle, sub);
  } catch (err) {
    el.innerHTML = `<div class="dtl-empty">Failed to load: ${esc(err.message)}</div>`;
  }
}

// ── Rendering ──

function render(cycle, sub) {
  const cycleName = esc(cycle.name || cycle.label || 'Current Cycle');
  const status    = sub ? (sub.status || 'draft') : null;

  let h = '<div class="dtl-wrap">';

  // Header
  h += `<div class="dtl-hdr"><span class="dtl-cycle-name">${cycleName}</span>`;
  if (status) h += `<span class="dtl-badge dtl-s-${esc(status)}">${esc(status)}</span>`;
  h += '</div>';

  if (!sub) {
    h += '<div class="dtl-empty">No submission for this cycle.</div>';
    h += '</div>';
    return h;
  }

  // ST Review — shown first, most game-day relevant
  const rev = sub.st_review;
  if (rev) {
    h += '<div class="dtl-section dtl-st-block">';
    h += '<div class="dtl-sec-title">ST Notes</div>';

    if (rev.mechanical_summary) {
      h += `<div class="dtl-mech">${esc(rev.mechanical_summary)}</div>`;
    }

    const vitae = rev.vitae_spent, wp = rev.willpower_spent, inf = rev.influence_spent;
    if (vitae || wp || inf) {
      h += '<div class="dtl-exp-row">';
      if (vitae) h += `<span class="dtl-exp dtl-exp-v">Vitae <b>${vitae}</b></span>`;
      if (wp)    h += `<span class="dtl-exp dtl-exp-w">WP <b>${wp}</b></span>`;
      if (inf)   h += `<span class="dtl-exp dtl-exp-i">Influence <b>${inf}</b></span>`;
      h += '</div>';
    }

    if (rev.narrative) {
      for (const [key, block] of Object.entries(rev.narrative)) {
        if (!block?.text) continue;
        const dot = block.status === 'done' ? ' \u2713' : block.status === 'flagged' ? ' \u2691' : '';
        h += `<div class="dtl-narr"><div class="dtl-narr-key">${esc(key.replace(/_/g,' '))}${esc(dot)}</div>`;
        h += `<div class="dtl-narr-text">${esc(block.text)}</div></div>`;
      }
    }

    h += '</div>';
  }

  // Player submission sections
  for (const { key, title } of SECTIONS) {
    const data = sub[key];
    if (!hasContent(data)) continue;
    h += renderSection(title, data);
  }

  h += '</div>';
  return h;
}

function hasContent(data) {
  if (data === null || data === undefined) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') return Object.keys(data).length > 0;
  return !!data;
}

function renderSection(title, data) {
  let h = `<div class="dtl-section"><div class="dtl-sec-title">${esc(title)}</div>`;
  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      h += `<div class="dtl-sub-hd">Item ${i + 1}</div>`;
      h += renderObj(item);
    });
  } else {
    h += renderObj(data);
  }
  h += '</div>';
  return h;
}

function renderObj(obj) {
  if (!obj || typeof obj !== 'object') return `<div class="dtl-val">${esc(String(obj ?? ''))}</div>`;
  let h = '';
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k)) continue;
    const val = valStr(v);
    if (!val) continue;
    h += `<div class="dtl-field"><div class="dtl-label">${esc(k.replace(/_/g,' '))}</div>`;
    h += `<div class="dtl-val">${esc(val)}</div></div>`;
  }
  return h || '<div class="dtl-val dtl-dim">(empty)</div>';
}

function valStr(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    if (!v.length) return null;
    if (typeof v[0] === 'string') return v.join(', ');
    return v.map(item => typeof item === 'object'
      ? Object.entries(item).filter(([k]) => !SKIP.has(k)).map(([k,vv]) => `${k}: ${valStr(vv) ?? '-'}`).join(' | ')
      : String(item)
    ).join('\n');
  }
  if (typeof v === 'object') {
    return Object.entries(v).filter(([k]) => !SKIP.has(k))
      .map(([k,vv]) => `${k}: ${valStr(vv) ?? '-'}`).join(' | ') || null;
  }
  return String(v);
}
