/**
 * Spheres domain view — aggregates Allies, Status, and Contacts influence
 * merits across all active characters, grouped by sphere.
 *
 * Allies + Status dots are summed as the "rank score".
 * Contacts is presence-only (one contact per listed sphere, not the rating).
 */

import { apiGet } from '../data/api.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { displayName } from '../data/helpers.js';

let chars = [];

export async function initSpheresView() {
  const container = document.getElementById('spheres-content');
  if (!container) return;
  container.innerHTML = '<p class="placeholder">Loading spheres\u2026</p>';

  try {
    chars = await apiGet('/api/characters');
    chars.forEach(c => applyDerivedMerits(c));
  } catch {
    container.innerHTML = '<p class="placeholder">Failed to load character data.</p>';
    return;
  }

  container.innerHTML = renderSpheres();
}

/**
 * Normalise a sphere name for caseless matching.
 * "high society", "High Society", "  HIGH SOCIETY  " all collapse to "High Society".
 */
function normaliseSphere(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Merit names that contribute dots to a sphere's rank score.
 * Contacts is presence-only and is tracked separately.
 */
const DOTTED_MERITS = new Set(['Allies', 'Status']);

function getSpheresData() {
  const active = chars.filter(c => !c.retired);
  const spheres = {}; // canonicalSphere -> charId -> { name, allies, status, mortalStatus, hasContacts }

  const ensureRow = (key, c) => {
    if (!spheres[key]) spheres[key] = {};
    const cid = String(c._id || c.name);
    if (!spheres[key][cid]) {
      spheres[key][cid] = {
        name: displayName(c),
        allies: 0,
        status: 0,
        hasContacts: false,
      };
    }
    return spheres[key][cid];
  };

  for (const c of active) {
    for (const m of (c.merits || [])) {
      if (m.category !== 'influence') continue;
      const dots = m.rating || 0;
      if (dots <= 0) continue;
      const raw = (m.area || m.qualifier || '').toString();
      if (!raw) continue;

      if (m.name === 'Contacts') {
        for (const part of raw.split(',')) {
          const key = normaliseSphere(part);
          if (!key) continue;
          ensureRow(key, c).hasContacts = true;
        }
      } else if (DOTTED_MERITS.has(m.name)) {
        for (const part of raw.split(',')) {
          const key = normaliseSphere(part);
          if (!key) continue;
          const row = ensureRow(key, c);
          if (m.name === 'Allies') row.allies += dots;
          else if (m.name === 'Status') row.status += dots;
        }
      }
    }
  }

  // Convert to sorted array per sphere — sort rows by total dots (desc), then name
  const out = [];
  for (const sphere of Object.keys(spheres)) {
    const rows = Object.values(spheres[sphere]).map(r => ({
      ...r,
      total: r.allies + r.status,
    }));
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const sphereTotal = rows.reduce((s, r) => s + r.total, 0);
    out.push({ sphere, rows, total: sphereTotal });
  }
  // Sort spheres by overall total dots, then alphabetically
  out.sort((a, b) => b.total - a.total || a.sphere.localeCompare(b.sphere));
  return out;
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSpheres() {
  const data = getSpheresData();
  if (!data.length) {
    return '<p class="placeholder">No sphere data yet. Add Allies, Status, Mortal Status, or Contacts influence merits with a sphere assignment.</p>';
  }
  let h = '<div class="spheres-list">';
  for (const { sphere, rows, total } of data) {
    h += '<div class="sphere-block">';
    h += `<div class="sphere-head"><span class="sphere-name">${esc(sphere)}</span><span class="sphere-total">${total} dots</span></div>`;
    h += '<table class="infl-table sphere-table">'
      + '<colgroup><col style="width:32px"><col><col style="width:60px"><col style="width:60px"><col style="width:60px"><col style="width:60px"></colgroup>'
      + '<thead><tr>'
      + '<th>#</th>'
      + '<th>Character</th>'
      + '<th>Allies</th>'
      + '<th>Status</th>'
      + '<th>Total</th>'
      + '<th>Contact</th>'
      + '</tr></thead><tbody>';
    rows.forEach((r, i) => {
      h += `<tr>
        <td class="infl-num">${i + 1}</td>
        <td class="infl-name">${esc(r.name)}</td>
        <td class="infl-num">${r.allies || '\u2014'}</td>
        <td class="infl-num">${r.status || '\u2014'}</td>
        <td class="infl-num infl-total">${r.total || '\u2014'}</td>
        <td class="infl-num">${r.hasContacts ? '\u2713' : ''}</td>
      </tr>`;
    });
    h += '</tbody></table>';
    h += '</div>';
  }
  h += '</div>';
  return h;
}
