/**
 * Spheres domain view — aggregates Allies, Status, and Contacts influence
 * merits across all active characters, grouped by sphere.
 *
 * Allies + Status dots are summed as the "rank score".
 * Contacts is presence-only (one contact per listed sphere, not the rating).
 */

import { apiGet } from '../data/api.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { esc, displayName, sortName, discordAvatarUrl, isRedactMode } from '../data/helpers.js';
import { INFLUENCE_SPHERES } from '../data/constants.js';

function avatarUrl(c) {
  const pi = c._player_info || {};
  if (isRedactMode() || !pi.discord_id || !pi.discord_avatar) {
    if (isRedactMode()) return discordAvatarUrl(null, null);
    let h = 0;
    const s = String(c._id || c.name || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return `https://cdn.discordapp.com/embed/avatars/${Math.abs(h) % 6}.png`;
  }
  return discordAvatarUrl(pi.discord_id, pi.discord_avatar, 64);
}

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
      spheres[key][cid] = { c, allies: 0, status: 0, hasContacts: false };
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
    rows.sort((a, b) => b.total - a.total || sortName(a.c).localeCompare(sortName(b.c)));
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

function renderSpherePyramid(rows, dimension) {
  const holders = rows
    .filter(r => r[dimension] > 0)
    .sort((a, b) => b[dimension] - a[dimension] || sortName(a.c).localeCompare(sortName(b.c)));

  const apex      = holders.find(r => r[dimension] === 5) || null;
  const highSeats = holders.filter(r => r[dimension] === 4).slice(0, 2);
  const floor     = holders.filter(r => r[dimension] < 4);

  const highSlots = [...highSeats];
  while (highSlots.length < 2) highSlots.push(null);

  let h = `<div class="sph-pyramid-col">`;
  h += `<div class="sph-pyramid-col-head">${dimension === 'allies' ? 'Allies' : 'Status'}</div>`;

  // Apex
  if (apex) {
    h += `<div class="sph-apex">`;
    h += `<img class="sph-apex-avatar" src="${esc(avatarUrl(apex.c))}" alt="" loading="lazy">`;
    h += `<div class="sph-apex-info">`;
    h += `<span class="sph-apex-name">${esc(displayName(apex.c))}</span>`;
    h += `<span class="sph-apex-dots">\u25CF\u25CF\u25CF\u25CF\u25CF</span>`;
    h += `</div>`;
    h += `<span class="sph-apex-val">5</span>`;
    h += `</div>`;
  } else {
    h += `<div class="sph-apex sph-vacant"><span class="sph-vacant-label">Vacant</span></div>`;
  }

  // High seats
  h += `<div class="sph-high-row">`;
  for (const r of highSlots) {
    if (r) {
      h += `<div class="sph-high">`;
      h += `<img class="sph-high-avatar" src="${esc(avatarUrl(r.c))}" alt="" loading="lazy">`;
      h += `<span class="sph-high-name">${esc(displayName(r.c))}</span>`;
      h += `<span class="sph-high-val">4</span>`;
      h += `</div>`;
    } else {
      h += `<div class="sph-high sph-vacant"><span class="sph-vacant-label">\u2013</span></div>`;
    }
  }
  h += `</div>`;

  // Floor: group by value descending
  if (floor.length) {
    h += `<div class="sph-floor">`;
    const groups = [];
    for (const r of floor) {
      const last = groups[groups.length - 1];
      if (last && last.val === r[dimension]) last.items.push(r);
      else groups.push({ val: r[dimension], items: [r] });
    }
    for (const g of groups) {
      h += `<div class="sph-floor-bracket">`;
      h += `<span class="sph-floor-dots">${'\u25CF'.repeat(g.val)}${'\u25CB'.repeat(5 - g.val)}</span>`;
      for (const r of g.items) h += `<span class="sph-floor-name">${esc(displayName(r.c))}</span>`;
      h += `</div>`;
    }
    h += `</div>`;
  }

  h += `</div>`;
  return h;
}

function renderSphereCard({ sphere, rows, total }) {
  const vacant = rows.filter(r => r.total > 0 || r.hasContacts).length === 0;
  let h = `<div class="sphere-card${vacant ? ' sphere-card-vacant' : ''}">`;
  h += `<div class="sphere-head"><span class="sphere-name">${esc(sphere)}</span>`;
  if (!vacant) h += `<span class="sphere-total">${total} dots</span>`;
  h += `</div>`;

  if (vacant) {
    h += `<p class="sphere-vacant-msg">No current holders</p>`;
  } else {
    h += `<div class="sph-pyramid-split">`;
    h += renderSpherePyramid(rows, 'status');
    h += renderSpherePyramid(rows, 'allies');
    h += `</div>`;

    const contactChars = rows
      .filter(r => r.hasContacts)
      .sort((a, b) => sortName(a.c).localeCompare(sortName(b.c)));
    if (contactChars.length) {
      h += `<div class="sph-contacts-section">`;
      h += `<div class="sph-contacts-label">Contacts</div>`;
      h += `<div class="sph-contacts-chips">`;
      for (const r of contactChars) {
        h += `<div class="sph-contact-chip">`;
        h += `<img class="sph-contact-avatar" src="${esc(avatarUrl(r.c))}" alt="" loading="lazy">`;
        h += `<span class="sph-contact-name">${esc(displayName(r.c))}</span>`;
        h += `</div>`;
      }
      h += `</div>`;
      h += `</div>`;
    }
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
