/* Identity tab — edit view rendering and handlers */

import state from '../data/state.js';
import { APPROVED_BLOODLINES, MASKS_DIRGES, CLANS, COVENANTS, COURT_TITLES } from '../data/constants.js';
import { esc } from '../data/helpers.js';

let _markDirty, _xpLeft;
export function registerCallbacks(markDirty, xpLeft) {
  _markDirty = markDirty;
  _xpLeft = xpLeft;
}

/* ── Main tab renderer ── */
export function renderIdentityTab(c) {
  const el = document.getElementById('et-identity');

  const bloodlineOpts = APPROVED_BLOODLINES.map(b => `<option${c.bloodline === b ? ' selected' : ''}>${b}</option>`).join('');
  const maskOpts = MASKS_DIRGES.map(m => `<option${c.mask === m ? ' selected' : ''}>${m}</option>`).join('');
  const dirgeOpts = MASKS_DIRGES.map(m => `<option${c.dirge === m ? ' selected' : ''}>${m}</option>`).join('');
  const clanOpts = CLANS.map(cl => `<option${c.clan === cl ? ' selected' : ''}>${cl}</option>`).join('');
  const covOpts = COVENANTS.map(cv => `<option${c.covenant === cv ? ' selected' : ''}>${cv}</option>`).join('');
  const titleOpts = COURT_TITLES.map(t => `<option${c.court_title === t ? ' selected' : ''}>${t || '(none)'}</option>`).join('');

  el.innerHTML = `
    <div class="form-section">
      <div class="form-section-title">Identity</div>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">Character Name</label>
          <input class="form-input" value="${esc(c.name || '')}" onchange="updField('name',this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">Player Name</label>
          <input class="form-input" value="${esc(c.player || '')}" onchange="updField('player',this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">Concept</label>
          <input class="form-input" value="${esc(c.concept || '')}" onchange="updField('concept',this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">Pronouns</label>
          <input class="form-input" value="${esc(c.pronouns || '')}" onchange="updField('pronouns',this.value)">
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Lineage &amp; Covenant</div>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">Clan</label>
          <select class="form-select" onchange="updField('clan',this.value)">${clanOpts}</select>
        </div>
        <div class="form-row">
          <label class="form-label">Bloodline</label>
          <select class="form-select" onchange="updField('bloodline',this.value||null)">
            <option value=""${!c.bloodline ? ' selected' : ''}>(none)</option>
            ${bloodlineOpts}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">Covenant</label>
          <select class="form-select" onchange="updField('covenant',this.value)">${covOpts}</select>
        </div>
        <div class="form-row">
          <label class="form-label">Court Title</label>
          <select class="form-select" onchange="updField('court_title',this.value==='(none)'?null:this.value)">${titleOpts}</select>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Persona</div>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">Mask</label>
          <select class="form-select" onchange="updField('mask',this.value)">
            <option value=""${!c.mask ? ' selected' : ''}>(none)</option>
            ${maskOpts}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">Dirge</label>
          <select class="form-select" onchange="updField('dirge',this.value)">
            <option value=""${!c.dirge ? ' selected' : ''}>(none)</option>
            ${dirgeOpts}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">Apparent Age</label>
          <input class="form-input" value="${esc(c.apparent_age || '')}" onchange="updField('apparent_age',this.value||null)">
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Experience</div>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">XP Total</label>
          <input class="form-input" type="number" min="0" value="${c.xp_total || 0}" onchange="updField('xp_total',+this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">XP Spent</label>
          <input class="form-input" type="number" min="0" value="${c.xp_spent || 0}" onchange="updField('xp_spent',+this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">XP Left</label>
          <input class="form-input" type="number" value="${_xpLeft(c)}" disabled title="Derived from XP Total - XP Spent">
        </div>
        <div class="form-row">
          <label class="form-label">Blood Potency</label>
          <input class="form-input" type="number" min="0" max="10" value="${c.blood_potency || 1}" onchange="updField('blood_potency',+this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">Humanity</label>
          <input class="form-input" type="number" min="0" max="10" value="${c.humanity != null ? c.humanity : 7}" onchange="updField('humanity',+this.value)">
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Status</div>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">City Status</label>
          <input class="form-input" type="number" min="0" max="5" value="${c.status?.city || 0}" onchange="updStatus('city',+this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">Clan Status</label>
          <input class="form-input" type="number" min="0" max="5" value="${c.status?.clan || 0}" onchange="updStatus('clan',+this.value)">
        </div>
        <div class="form-row">
          <label class="form-label">Covenant Status</label>
          <input class="form-input" type="number" min="0" max="5" value="${c.status?.covenant || 0}" onchange="updStatus('covenant',+this.value)">
        </div>
      </div>
    </div>
  `;
}

/* ── Field update handlers ── */
export function updField(key, val) {
  if (state.editIdx < 0) return;
  state.chars[state.editIdx][key] = val;
  _markDirty();
  // Update header name
  if (key === 'name') document.getElementById('edit-charname').textContent = val || 'Unnamed';
}

export function updStatus(key, val) {
  if (state.editIdx < 0) return;
  if (!state.chars[state.editIdx].status) state.chars[state.editIdx].status = {};
  state.chars[state.editIdx].status[key] = val;
  _markDirty();
}
