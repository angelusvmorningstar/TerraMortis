import { OFFICE_DATA } from './office-data.js';
import { esc } from '../data/helpers.js';

export function renderOfficeTab(el, char) {
  if (!el || !char) { if (el) el.innerHTML = '<div class="dtl-empty">No character loaded.</div>'; return; }
  if (!char.court_category) { el.innerHTML = '<div class="dtl-empty">No office held.</div>'; return; }

  const data = OFFICE_DATA[char.court_category];
  const title = esc(char.court_title || char.court_category);
  const role  = esc(char.court_category);

  let h = `<div class="office-tab">`;
  h += `<div class="office-header"><div class="office-title">${title}</div><div class="office-role">${role}</div></div>`;

  if (!data) {
    h += `<div class="dtl-empty">Office details for this role are pending.</div>`;
    h += `</div>`;
    el.innerHTML = h;
    return;
  }

  // Status Power
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Status Power</div>`;
  h += `<div class="office-status-power">${esc(data.statusPower)}</div>`;
  h += `</div>`;

  // Manoeuvres
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Manoeuvres <span style="font-size:10px;opacity:.6">(each costs 1 Influence)</span></div>`;
  h += `<div class="office-manoeuvre-list">`;
  for (const m of data.manoeuvres) {
    h += `<div class="office-manoeuvre">`;
    h += `<div class="office-manoeuvre-name">${esc(m.name)}</div>`;
    h += `<div class="office-manoeuvre-effect">${esc(m.effect)}</div>`;
    h += `</div>`;
  }
  h += `</div></div>`;

  // Merits
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Granted Merits</div>`;
  h += `<div class="office-merit-list">`;
  for (const merit of data.merits) {
    h += `<span class="office-merit-chip">${esc(merit)}</span>`;
  }
  h += `</div></div>`;

  h += `</div>`;
  el.innerHTML = h;
}
