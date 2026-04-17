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
import { INFLUENCE_SPHERES } from '../data/constants.js';

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

  // Ensure all 16 canonical spheres appear, even if vacant
  for (const canonical of INFLUENCE_SPHERES) {
    if (!spheres[canonical]) spheres[canonical] = {};
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
  // Occupied spheres first (by total desc), then vacant spheres alphabetically
  out.sort((a, b) => {
    const aOcc = a.total > 0 ? 1 : 0;
    const bOcc = b.total > 0 ? 1 : 0;
    if (aOcc !== bOcc) return bOcc - aOcc;
    if (a.total !== b.total) return b.total - a.total;
    return a.sphere.localeCompare(b.sphere);
  });
  return out;
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSphereCard({ sphere, rows, total }) {
  const vacant = rows.length === 0;
  let h = `<div class="sphere-card${vacant ? ' sphere-card-vacant' : ''}">`;
  h += `<div class="sphere-head"><span class="sphere-name">${esc(sphere)}</span>`;
  if (!vacant) h += `<span class="sphere-total">${total} dots</span>`;
  h += `</div>`;
  if (vacant) {
    h += `<p class="sphere-vacant-msg">No current holders</p>`;
  } else {
    h += `<ul class="sphere-card-list">`;
    rows.forEach((r, i) => {
      const isDominant = i === 0;
      h += `<li class="sphere-card-item${isDominant ? ' sphere-dominant' : ''}">`;
      h += `<span class="sphere-char-name">${i + 1}. ${esc(r.name)}</span>`;
      h += `<span class="sphere-char-meta">`;
      if (r.allies)      h += `A${r.allies} `;
      if (r.status)      h += `S${r.status} `;
      if (r.hasContacts) h += `\u2713`;
      h += `</span>`;
      h += `</li>`;
    });
    h += `</ul>`;
  }
  h += `</div>`;
  return h;
}

function renderSpheres() {
  const data = getSpheresData();
  let h = `<div class="spheres-grid">`;
  for (const entry of data) h += renderSphereCard(entry);
  h += `</div>`;
  return h;
}
