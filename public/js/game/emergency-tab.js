/* emergency-tab.js — ST live game emergency contacts list.
   Fetches all player profiles and displays emergency contact + medical info
   for quick access at the venue. Medical info rows are highlighted. */

import { apiGet } from '../data/api.js';
import { esc } from '../data/helpers.js';

export async function renderEmergencyTab(el) {
  if (!el) return;
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let players = [];
  try {
    players = await apiGet('/api/players');
  } catch {
    el.innerHTML = '<p class="placeholder-msg">Could not load player data. Check your connection.</p>';
    return;
  }

  const sorted = players
    .filter(p => p.display_name)
    .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));

  if (!sorted.length) {
    el.innerHTML = '<p class="placeholder-msg">No player profiles found.</p>';
    return;
  }

  let h = '<div class="emg-wrap"><div class="emg-list">';
  for (const p of sorted) {
    const ec     = (p.emergency_contact_name   || '').trim();
    const mobile = (p.emergency_contact_mobile || '').trim();
    const med    = (p.medical_info             || '').trim();
    const hasMed = !!med;

    h += `<div class="emg-card${hasMed ? ' emg-card-medical' : ''}">`;
    h += `<div class="emg-player">${esc(p.display_name)}</div>`;
    if (ec)     h += `<div class="emg-row"><span class="emg-lbl">Contact</span><span class="emg-val">${esc(ec)}</span></div>`;
    if (mobile) h += `<div class="emg-row"><span class="emg-lbl">Mobile</span><span class="emg-val"><a href="tel:${esc(mobile)}">${esc(mobile)}</a></span></div>`;
    if (med)    h += `<div class="emg-row emg-row-medical"><span class="emg-lbl">Medical</span><span class="emg-val">${esc(med)}</span></div>`;
    if (!ec && !mobile && !med) h += `<div class="emg-none">No emergency contact recorded</div>`;
    h += '</div>';
  }
  h += '</div></div>';

  el.innerHTML = h;
}
