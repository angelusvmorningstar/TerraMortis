/* Sheet-mode edit handlers — all read state.editIdx and write to state.chars[state.editIdx] */

import state from '../data/state.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { getAttrVal, getAttrBonus, setAttrVal, isInClanDisc } from '../data/accessors.js';
import {
  CLAN_BANES, BLOODLINE_CLANS, BLOODLINE_DISCS, CLAN_DISCS,
  SKILL_CATS, SKILL_PRI_BUDGETS, ALL_SKILLS, ATTR_CATS, PRI_BUDGETS,
  CORE_DISCS, RITUAL_DISCS
} from '../data/constants.js';
import { getRuleByKey, getRulesByCategory } from '../data/loader.js';
import { xpToDots, xpEarned, xpSpent } from './xp.js';
import { meritByCategory, addMerit, removeMerit, ensureMeritSync } from './merits.js';
import { getPoolTotal, mciPoolTotal, getMCIPoolUsed } from './mci.js';
import { vmAlliesPool, vmAlliesUsed, investedPool, investedUsed } from './domain.js';
import {
  shEditInflMerit, shEditContactSphere, shEditStatusMode, shRemoveInflMerit, shAddInflMerit, shAddVMAllies, shAddLKMerit,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill, shToggleMCI, shTogglePT, shEditMCIDot, shEditMCITierGrant, shEditMCITierQual, shRemoveStandMerit, shAddStandMCI, shAddStandPT,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shAddStyle, shRemoveStyle, shEditStyle, shAddPick, shRemovePick,
  registerCallbacks as registerDomainCallbacks,
  getDirtyPartners, clearDirtyPartners
} from './edit-domain.js';

/* Re-export merit-category handlers so consumers can import from edit.js */
export {
  shEditInflMerit, shEditContactSphere, shEditStatusMode, shRemoveInflMerit, shAddInflMerit, shAddVMAllies, shAddLKMerit,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill, shToggleMCI, shTogglePT, shEditMCIDot, shEditMCITierGrant, shEditMCITierQual, shRemoveStandMerit, shAddStandMCI, shAddStandPT,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shAddStyle, shRemoveStyle, shEditStyle, shAddPick, shRemovePick,
  getDirtyPartners, clearDirtyPartners
};

/* ── Callback registration (avoids circular deps with main.js / sheet.js) ── */
let _markDirty, _renderSheet;
export function registerCallbacks(markDirty, renderSheet) {
  _markDirty = markDirty;
  _renderSheet = renderSheet;
  registerDomainCallbacks(markDirty, renderSheet);
}

/* ══════════════════════════════════════════════════════════
   IDENTITY & BASICS
══════════════════════════════════════════════════════════ */

export function editFromSheet() {
  if (state.editIdx < 0) return;
  const el = document.getElementById('sh-content');
  const scrollEl = el ? el.closest('.sh-wrap') || el.parentElement || document.documentElement : document.documentElement;
  const savedScroll = scrollEl.scrollTop;
  state.editMode = !state.editMode;
  const btn = document.querySelector('.sheet-edit-btn');
  if (btn) {
    btn.textContent = state.editMode ? 'Done' : 'Edit';
    btn.classList.toggle('editing', state.editMode);
  }
  _renderSheet(state.chars[state.editIdx]);
  scrollEl.scrollTop = savedScroll;
}

export function shEdit(field, val) {
  if (state.editIdx < 0) return;
  state.chars[state.editIdx][field] = val || null;
  _markDirty();
  // Re-render for fields that affect derived display (title bonus, clan bane)
  if (field === 'court_title' || field === 'court_category') {
    _renderSheet(state.chars[state.editIdx]);
    return;
  }
  // If clan changed, update curse bane
  if (field === 'clan') {
    const c = state.chars[state.editIdx];
    const newCurse = CLAN_BANES[val];
    if (newCurse) {
      if (!c.banes) c.banes = [];
      const ci = c.banes.findIndex(b => Object.values(CLAN_BANES).some(cb => cb.name === b.name));
      if (ci >= 0) c.banes[ci] = { ...newCurse };
      else c.banes.unshift({ ...newCurse });
    }
    // Clear bloodline if not valid for new clan
    const validBLs = BLOODLINE_CLANS[val] || [];
    if (c.bloodline && !validBLs.includes(c.bloodline)) c.bloodline = null;
    _renderSheet(c);
  }
}

export function shEditStatus(key, val) {
  if (state.editIdx < 0) return;
  if (!state.chars[state.editIdx].status) state.chars[state.editIdx].status = {};
  state.chars[state.editIdx].status[key] = parseInt(val) || 0;
  _markDirty();
}

/* ══════════════════════════════════════════════════════════
   BANES
══════════════════════════════════════════════════════════ */

export function shEditBaneName(i, val) {
  if (state.editIdx < 0) return;
  const banes = state.chars[state.editIdx].banes || [];
  if (banes[i]) { banes[i].name = val; _markDirty(); }
}

export function shEditBaneEffect(i, val) {
  if (state.editIdx < 0) return;
  const banes = state.chars[state.editIdx].banes || [];
  if (banes[i]) { banes[i].effect = val; _markDirty(); }
}

export function shRemoveBane(i) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.banes) return;
  // Don't remove the clan curse
  const b = c.banes[i];
  if (b && Object.values(CLAN_BANES).some(cb => cb.name === b.name)) {
    return; // can't remove clan curse
  }
  c.banes.splice(i, 1);
  _markDirty();
  _renderSheet(c);
}

export function shAddBane() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.banes) c.banes = [];
  c.banes.push({ name: '', effect: '' });
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   TOUCHSTONES
══════════════════════════════════════════════════════════ */

export function shEditTouchstone(i, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.touchstones || !c.touchstones[i]) return;
  c.touchstones[i][field] = field === 'humanity' ? (parseInt(val) || 1) : val;
  _markDirty();
}

export function shAddTouchstone() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.touchstones) c.touchstones = [];
  c.touchstones.push({ humanity: 1, name: '', desc: '' });
  _markDirty();
  _renderSheet(c);
}

export function shRemoveTouchstone(i) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.touchstones) return;
  c.touchstones.splice(i, 1);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   TOUCHSTONE EDGES (NPCR.4 — Shape B bridge)
   ----------------------------------------------------------
   When the character has `touchstone_edge_ids` (even []), the
   sheet renders a picker backed by the relationships graph.
   Each operation round-trips immediately (edge POST/PUT/DELETE
   and a partial character PUT with the new id list) so the
   state is atomic without waiting for a full Save Character.

   All user-facing prompts use themed modals (see NPCR.3 pattern)
   — never window.confirm/prompt/alert. Errors surface via an
   inline banner inside the touchstone section.
══════════════════════════════════════════════════════════ */

function _tsConfirmModal({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'npcr-modal-overlay';
    overlay.innerHTML = `
      <div class="npcr-modal" role="dialog" aria-labelledby="sh-ts-modal-title">
        <div class="npcr-modal-title" id="sh-ts-modal-title">${_esc(title)}</div>
        <div class="npcr-modal-body"><p>${_esc(body)}</p></div>
        <div class="npcr-modal-actions">
          <button class="npcr-btn muted" data-act="cancel">${_esc(cancelLabel)}</button>
          <button class="npcr-btn ${danger ? 'danger' : 'save'}" data-act="confirm">${_esc(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const confirmBtn = overlay.querySelector('[data-act="confirm"]');
    setTimeout(() => confirmBtn?.focus(), 0);

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) close(true);
    }
    document.addEventListener('keydown', onKey);
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
  });
}

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function _tsSetError(c, msg) {
  c._ts_err = String(msg || '');
  _renderSheet(c);
}
function _tsClearError(c) {
  if (c._ts_err) { delete c._ts_err; }
}

export async function shEnsureTouchstoneData() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!Array.isArray(c.touchstone_edge_ids)) return;
  if (c._ts_loaded === true || c._ts_loaded === 'loading') return;
  c._ts_loaded = 'loading';
  try {
    const [npcs, edges] = await Promise.all([
      apiGet('/api/npcs'),
      apiGet('/api/relationships?endpoint=' + encodeURIComponent(String(c._id)) + '&kind=touchstone'),
    ]);
    c._ts_npcs = Array.isArray(npcs) ? npcs : [];
    c._ts_edges = Array.isArray(edges) ? edges : [];
    c._ts_loaded = true;
  } catch (err) {
    console.error('[touchstone] load error:', err);
    c._ts_npcs = [];
    c._ts_edges = [];
    c._ts_loaded = 'error';
    c._ts_load_error = String(err?.message || err);
  }
  _renderSheet(c);
}

export function shTouchstonePickerOpen(humanity, mode) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  c._ts_picker = {
    humanity: +humanity,
    mode: String(mode),
    draft: { name: '', desc: '', state: '', npc_id: '' },
  };
  _renderSheet(c);
}

export function shTouchstonePickerClose() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  delete c._ts_picker;
  _renderSheet(c);
}

export function shTouchstonePickerDraft(field, value) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c._ts_picker) return;
  c._ts_picker.draft[field] = value;
}

export function shTouchstoneEditStateOpen(humanity, edgeId) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  c._ts_picker = {
    humanity: +humanity,
    mode: 'edit-state',
    draft: { edge_id: String(edgeId) },
  };
  _renderSheet(c);
}

export async function shTouchstoneLink(humanity) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const draft = c._ts_picker?.draft;
  if (!draft || !draft.npc_id) { _tsSetError(c, 'Pick an NPC before linking.'); return; }
  _tsClearError(c);
  const charId = String(c._id);
  try {
    const edge = await apiPost('/api/relationships', {
      a: { type: 'pc', id: charId },
      b: { type: 'npc', id: String(draft.npc_id) },
      kind: 'touchstone',
      direction: 'a_to_b',
      state: String(draft.state || ''),
      st_hidden: false,
      touchstone_meta: { humanity: +humanity },
    });
    c._ts_edges = (c._ts_edges || []).concat(edge);
    c.touchstone_edge_ids = Array.isArray(c.touchstone_edge_ids)
      ? c.touchstone_edge_ids.concat(String(edge._id))
      : [String(edge._id)];
    await apiPut('/api/characters/' + charId, { touchstone_edge_ids: c.touchstone_edge_ids });
    delete c._ts_picker;
    _renderSheet(c);
  } catch (err) {
    console.error('[touchstone] link error:', err);
    _tsSetError(c, 'Link failed: ' + (err?.message || 'unknown error'));
  }
}

export async function shTouchstoneCreate(humanity) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const draft = c._ts_picker?.draft;
  if (!draft) return;
  const name = String(draft.name || '').trim();
  if (!name) { _tsSetError(c, 'Name is required to create an NPC.'); return; }
  _tsClearError(c);
  const description = String(draft.desc || '').trim();
  const charId = String(c._id);
  try {
    const npc = await apiPost('/api/npcs', { name, description, status: 'active' });
    c._ts_npcs = (c._ts_npcs || []).concat(npc);
    const edge = await apiPost('/api/relationships', {
      a: { type: 'pc', id: charId },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'touchstone',
      direction: 'a_to_b',
      state: String(draft.state || ''),
      st_hidden: false,
      touchstone_meta: { humanity: +humanity },
    });
    c._ts_edges = (c._ts_edges || []).concat(edge);
    c.touchstone_edge_ids = Array.isArray(c.touchstone_edge_ids)
      ? c.touchstone_edge_ids.concat(String(edge._id))
      : [String(edge._id)];
    await apiPut('/api/characters/' + charId, { touchstone_edge_ids: c.touchstone_edge_ids });
    delete c._ts_picker;
    _renderSheet(c);
  } catch (err) {
    console.error('[touchstone] create error:', err);
    _tsSetError(c, 'Create failed: ' + (err?.message || 'unknown error'));
  }
}

export async function shTouchstoneEditState(edgeId, newState) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const edge = (c._ts_edges || []).find(e => String(e._id) === String(edgeId));
  if (!edge) return;
  const trimmed = String(newState || '').trim();
  if (trimmed === (edge.state || '')) { delete c._ts_picker; _renderSheet(c); return; }
  _tsClearError(c);
  try {
    const body = {
      a: edge.a, b: edge.b, kind: edge.kind,
      direction: edge.direction || 'a_to_b',
      state: trimmed,
      st_hidden: !!edge.st_hidden,
      status: edge.status,
    };
    if (edge.touchstone_meta) body.touchstone_meta = edge.touchstone_meta;
    if (edge.disposition) body.disposition = edge.disposition;
    const updated = await apiPut('/api/relationships/' + edgeId, body);
    const idx = c._ts_edges.findIndex(e => String(e._id) === String(edgeId));
    if (idx >= 0) c._ts_edges[idx] = updated;
    delete c._ts_picker;
    _renderSheet(c);
  } catch (err) {
    console.error('[touchstone] edit state error:', err);
    _tsSetError(c, 'Save failed: ' + (err?.message || 'unknown error'));
  }
}

export async function shTouchstoneUnlink(edgeId) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const ok = await _tsConfirmModal({
    title: 'Remove touchstone?',
    body: 'The relationship record will be retired. An ST can reactivate it from the NPC register if needed.',
    confirmLabel: 'Remove',
    danger: true,
  });
  if (!ok) return;
  _tsClearError(c);
  const charId = String(c._id);
  try {
    await apiDelete('/api/relationships/' + edgeId);
    const idx = (c._ts_edges || []).findIndex(e => String(e._id) === String(edgeId));
    if (idx >= 0) c._ts_edges[idx].status = 'retired';
    c.touchstone_edge_ids = (c.touchstone_edge_ids || []).filter(id => String(id) !== String(edgeId));
    await apiPut('/api/characters/' + charId, { touchstone_edge_ids: c.touchstone_edge_ids });
    _renderSheet(c);
  } catch (err) {
    console.error('[touchstone] unlink error:', err);
    _tsSetError(c, 'Remove failed: ' + (err?.message || 'unknown error'));
  }
}

export async function shBeginTouchstoneMigration() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const ok = await _tsConfirmModal({
    title: 'Begin touchstone migration?',
    body: 'Convert this character to the new touchstone system. The legacy text entries stay visible (read-only) until NPCR.5 migration runs.',
    confirmLabel: 'Begin migration',
  });
  if (!ok) return;
  _tsClearError(c);
  try {
    c.touchstone_edge_ids = [];
    await apiPut('/api/characters/' + String(c._id), { touchstone_edge_ids: [] });
    _renderSheet(c);
  } catch (err) {
    console.error('[touchstone] migration init error:', err);
    delete c.touchstone_edge_ids;
    _tsSetError(c, 'Migration init failed: ' + (err?.message || 'unknown error'));
  }
}

/* ══════════════════════════════════════════════════════════
   BLOOD POTENCY & HUMANITY
══════════════════════════════════════════════════════════ */

function _deriveBP(c) {
  const bc = c.bp_creation || {};
  return Math.max(0, 1 + Math.floor((bc.cp || 0) / 5) + Math.floor((bc.xp || 0) / 5) - (bc.lost || 0));
}

// Legacy direct setters (used by app.js player sheet)
export function shEditBP(val) {
  if (state.editIdx < 0) return;
  state.chars[state.editIdx].blood_potency = Math.max(0, Math.min(10, parseInt(val) || 0));
  _markDirty();
  _renderSheet(state.chars[state.editIdx]);
}
export function shEditHumanity(val) {
  if (state.editIdx < 0) return;
  state.chars[state.editIdx].humanity = Math.max(0, Math.min(10, parseInt(val) || 0));
  _markDirty();
  _renderSheet(state.chars[state.editIdx]);
}

function _deriveHumanity(c) {
  return Math.max(0, Math.min(10, (c.humanity_base || 7) + Math.floor((c.humanity_xp || 0) / 2) - (c.humanity_lost || 0)));
}

export function shEditBPCreation(val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.bp_creation) c.bp_creation = {};
  c.bp_creation.cp = Math.max(0, Math.min(10, val || 0));
  c.blood_potency = _deriveBP(c);
  _markDirty();
  _renderSheet(c);
}

export function shEditBPXP(val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.bp_creation) c.bp_creation = {};
  c.bp_creation.xp = Math.max(0, val || 0);
  c.blood_potency = _deriveBP(c);
  _markDirty();
  _renderSheet(c);
}

export function shEditBPLost(val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.bp_creation) c.bp_creation = {};
  c.bp_creation.lost = Math.max(0, val || 0);
  c.blood_potency = _deriveBP(c);
  _markDirty();
  _renderSheet(c);
}

export function shEditHumanityXP(val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  c.humanity_xp = Math.max(0, val || 0);
  c.humanity = _deriveHumanity(c);
  _markDirty();
  _renderSheet(c);
}

export function shEditHumanityLost(val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  c.humanity_lost = Math.max(0, val || 0);
  c.humanity = _deriveHumanity(c);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   STATUS UP/DOWN
══════════════════════════════════════════════════════════ */

export function shStatusUp(key) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.status) c.status = {};
  c.status[key] = Math.min(key === 'city' ? 10 : 5, (c.status[key] || 0) + 1);
  _markDirty();
  _renderSheet(c);
}

export function shStatusDown(key) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.status) c.status = {};
  c.status[key] = Math.max(0, (c.status[key] || 0) - 1);
  _markDirty();
  _renderSheet(c);
}

const _COV_SHORT_FULL = { 'Carthian': 'Carthian Movement', 'Crone': 'Circle of the Crone', 'Invictus': 'Invictus', 'Lance': 'Lancea et Sanctum', 'Ordo': 'Ordo Dracul' };
function _ensureCovObj(c) {
  if (!c.status) c.status = {};
  if (!c.status.covenant || typeof c.status.covenant !== 'object') {
    c.status.covenant = { 'Carthian Movement': 0, 'Circle of the Crone': 0, 'Invictus': 0, 'Lancea et Sanctum': 0, 'Ordo Dracul': 0 };
  }
}

export function shCovStandingUp(label) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  _ensureCovObj(c);
  const full = _COV_SHORT_FULL[label] || label;
  c.status.covenant[full] = Math.min(5, (c.status.covenant[full] || 0) + 1);
  _markDirty();
  _renderSheet(c);
}

export function shCovStandingDown(label) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  _ensureCovObj(c);
  const full = _COV_SHORT_FULL[label] || label;
  c.status.covenant[full] = Math.max(0, (c.status.covenant[full] || 0) - 1);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   ATTRIBUTE PRIORITIES & CREATION POINTS
══════════════════════════════════════════════════════════ */

export function shSetPriority(cat, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.attribute_priorities) c.attribute_priorities = {};
  const old = c.attribute_priorities[cat];
  if (old === val) return;
  // Swap: find who currently has this value and give them the old one
  const cats = ['Mental', 'Physical', 'Social'];
  cats.forEach(k => {
    if (k !== cat && c.attribute_priorities[k] === val) {
      c.attribute_priorities[k] = old || 'Tertiary';
    }
  });
  c.attribute_priorities[cat] = val;
  _markDirty();
  _renderSheet(c);
}

export function shEditAttrPt(attr, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.attributes[attr]) c.attributes[attr] = { dots: 0, bonus: 0, cp: 0, xp: 0, rule_key: null };
  const ao = c.attributes[attr];
  if (ao.cp === undefined) ao.cp = 0;
  if (ao.xp === undefined) ao.xp = 0;
  val = Math.max(0, val || 0);
  if (field === 'cp') {
    // Enforce category CP cap
    const cat = Object.entries(ATTR_CATS).find(([k, v]) => v.includes(attr));
    if (cat) {
      const pri = (c.attribute_priorities || {})[cat[0]] || 'Primary';
      const budget = PRI_BUDGETS[pri] || 5;
      const otherCP = cat[1].filter(a => a !== attr).reduce((s, a) => s + ((c.attributes?.[a]?.cp) || 0), 0);
      val = Math.min(val, budget - otherCP);
      if (val < 0) val = 0;
    }
  }
  ao[field] = val;
  const attrBase = (ao.cp || 0) + 1 + (c.clan_attribute === attr ? 1 : 0);
  ao.dots = attrBase + xpToDots(ao.xp || 0, attrBase, 4);
  // Recalculate xp_log.spent.attributes: flat sum of all attr XP costs
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  let attrXpTotal = 0;
  const NINE_ATTRS = ['Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity', 'Stamina', 'Presence', 'Manipulation', 'Composure'];
  NINE_ATTRS.forEach(a => { attrXpTotal += (c.attributes?.[a]?.xp) || 0; });
  c.xp_log.spent.attributes = attrXpTotal;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

export function shAdjAttrBonus(attr, delta) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const base = getAttrVal(c, attr);
  const bonus = Math.max(0, getAttrBonus(c, attr) + delta);
  setAttrVal(c, attr, base, bonus);
  _markDirty();
  _renderSheet(c);
}

export function shSetClanAttr(val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const oldCA = c.clan_attribute;
  c.clan_attribute = val;
  // Recalculate dots for old and new clan attr
  [oldCA, val].forEach(attr => {
    if (!attr) return;
    if (!c.attributes[attr]) c.attributes[attr] = { dots: 0, bonus: 0, cp: 0, xp: 0, rule_key: null };
    const ao = c.attributes[attr];
    if (ao.cp === undefined) ao.cp = 0;
    if (ao.xp === undefined) ao.xp = 0;
    const aBase = (ao.cp || 0) + 1 + (c.clan_attribute === attr ? 1 : 0);
    ao.dots = aBase + xpToDots(ao.xp || 0, aBase, 4);
  });
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   DISCIPLINES
══════════════════════════════════════════════════════════ */

export function shEditDiscPt(disc, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.disciplines) c.disciplines = {};
  if (!c.disciplines[disc]) c.disciplines[disc] = { dots: 0, cp: 0, free: 0, xp: 0, rule_key: null };
  val = Math.max(0, val || 0);
  if (field === 'cp') {
    // Enforce: 3 total CP, max 1 out-of-clan CP.
    // Only count valid purchasable disciplines.
    const _validDiscs = new Set([...CORE_DISCS, ...RITUAL_DISCS]);
    const isIC = isInClanDisc(c, disc);
    const otherCP = Object.entries(c.disciplines)
      .filter(([d]) => d !== disc && _validDiscs.has(d))
      .reduce((s, [, v]) => s + (v.cp || 0), 0);
    val = Math.min(val, 3 - otherCP);
    if (!isIC) {
      const otherOutCP = Object.entries(c.disciplines)
        .filter(([d]) => d !== disc && _validDiscs.has(d) && !isInClanDisc(c, d))
        .reduce((s, [, v]) => s + (v.cp || 0), 0);
      val = Math.min(val, 1 - otherOutCP);
    }
    if (val < 0) val = 0;
  }
  c.disciplines[disc][field] = val;
  const cr = c.disciplines[disc];
  const discBase = cr.cp || 0;
  const discCostMult = isInClanDisc(c, disc) ? 3 : 4;
  cr.dots = discBase + xpToDots(cr.xp || 0, discBase, discCostMult);
  // Recalculate XP spent on disciplines
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  let discXpTotal = 0;
  Object.entries(c.disciplines || {}).forEach(([d, v]) => {
    discXpTotal += v.xp || 0;
  });
  c.xp_log.spent.powers = discXpTotal;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   SKILLS — SPECIALISATIONS & PRIORITIES
══════════════════════════════════════════════════════════ */

export function shEditSpec(skill, idx, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const sk = c.skills?.[skill];
  if (!sk || !sk.specs) return;
  sk.specs[idx] = val;
  _markDirty();
}

export function shRemoveSpec(skill, idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const sk = c.skills?.[skill];
  if (!sk || !sk.specs) return;
  sk.specs.splice(idx, 1);
  _markDirty();
  _renderSheet(c);
}

export function shAddSpec(skill) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.skills) c.skills = {};
  if (!c.skills[skill]) c.skills[skill] = { dots: 0, bonus: 0, specs: [], nine_again: false };
  if (!c.skills[skill].specs) c.skills[skill].specs = [];
  c.skills[skill].specs.push('');
  _markDirty();
  _renderSheet(c);
}

export function shSetSkillPriority(cat, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.skill_priorities) c.skill_priorities = {};
  const old = c.skill_priorities[cat];
  if (old === val) return;
  const cats = ['Mental', 'Physical', 'Social'];
  cats.forEach(k => {
    if (k !== cat && c.skill_priorities[k] === val) {
      c.skill_priorities[k] = old || 'Tertiary';
    }
  });
  c.skill_priorities[cat] = val;
  _markDirty();
  _renderSheet(c);
}

export function shEditSkillPt(skill, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.skills) c.skills = {};
  if (!c.skills[skill]) c.skills[skill] = { dots: 0, bonus: 0, specs: [], nine_again: false, cp: 0, xp: 0, rule_key: null };
  const so = c.skills[skill];
  if (so.cp === undefined) so.cp = 0;
  if (so.xp === undefined) so.xp = 0;
  val = Math.max(0, val || 0);
  if (field === 'cp') {
    const cat = Object.entries(SKILL_CATS).find(([k, v]) => v.includes(skill));
    if (cat) {
      const pri = (c.skill_priorities || {})[cat[0]] || 'Primary';
      const budget = SKILL_PRI_BUDGETS[pri] || 11;
      const otherCP = cat[1].filter(s => s !== skill).reduce((s, sk) => s + ((c.skills?.[sk]?.cp) || 0), 0);
      val = Math.min(val, budget - otherCP);
      if (val < 0) val = 0;
    }
  }
  so[field] = val;
  const skBase = so.cp || 0;
  so.dots = skBase + xpToDots(so.xp || 0, skBase, 2);
  // Recalculate XP spent on skills
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  let skXpTotal = 0;
  ALL_SKILLS.forEach(s => { skXpTotal += (c.skills?.[s]?.xp) || 0; });
  c.xp_log.spent.skills = skXpTotal;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   ORDEALS & XP
══════════════════════════════════════════════════════════ */

export function shToggleOrdeal(idx, checked) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.ordeals || !c.ordeals[idx]) return;
  c.ordeals[idx].complete = checked;
  c.ordeals[idx].xp = checked ? 3 : 0;
  // Recalculate ordeals total in xp_log
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  c.xp_log.earned.ordeals = c.ordeals.reduce((s, o) => s + (o.xp || 0), 0);
  _markDirty();
  _renderSheet(c);
}

export function shEditXP(bucket, key, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  if (!c.xp_log[bucket]) c.xp_log[bucket] = {};
  c.xp_log[bucket][key] = val || 0;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   DEVOTIONS
══════════════════════════════════════════════════════════ */

export function shShowDevSelect(btn) {
  const sel = document.getElementById('dev-add-select');
  if (!sel) return;
  if (sel.style.display === 'none') {
    sel.style.display = '';
    btn.textContent = 'Confirm';
  } else {
    // Actually add the devotion — sel.value is the rule's DB key, use it directly
    if (!sel.value) return;
    const c = state.chars[state.editIdx];
    const rule = getRuleByKey(sel.value);
    if (!rule) return;
    if (!c.powers) c.powers = [];
    if (c.powers.some(p => p.category === 'devotion' && p.name === rule.name)) return;
    const devStats = [rule.pool ? `Pool: ${[rule.pool.attr, rule.pool.skill, rule.pool.disc].filter(Boolean).join(' + ')}` : '', rule.action, rule.duration].filter(Boolean).join('  •  ');
    c.powers.push({ category: 'devotion', name: rule.name, stats: devStats, effect: rule.description || '' });
    _markDirty();
    _renderSheet(c);
  }
}

export function shAddDevotion() {
  shShowDevSelect(document.querySelector('.dev-add-btn'));
}

export function shRemoveDevotion(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const devPowers = (c.powers || []).filter(p => p.category === 'devotion');
  const target = devPowers[idx];
  if (!target) return;
  const realIdx = c.powers.indexOf(target);
  if (realIdx >= 0) c.powers.splice(realIdx, 1);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   RITES
══════════════════════════════════════════════════════════ */

export function shAddRite(tradition, name, level) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  name = (name || '').trim();
  if (!name) return;
  level = Math.max(1, Math.min(5, parseInt(level) || 1));
  const discDots = tradition === 'Cruac' ? (c.disciplines || {}).Cruac?.dots || 0 : (c.disciplines || {}).Theban?.dots || 0;
  const pool = discDots * 2;
  const usedFree = (c.powers || []).filter(p => p.category === 'rite' && p.tradition === tradition && p.free).length;
  const free = level <= discDots && usedFree < pool;
  if (!c.powers) c.powers = [];
  c.powers.push({ category: 'rite', name, tradition, level, free });
  _markDirty();
  _renderSheet(c);
}

export function shRemoveRite(powerIdx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.powers || !c.powers[powerIdx]) return;
  c.powers.splice(powerIdx, 1);
  _markDirty();
  _renderSheet(c);
}

export function shToggleRiteFree(powerIdx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const p = (c.powers || [])[powerIdx];
  if (!p || p.category !== 'rite') return;
  const discDots = p.tradition === 'Cruac' ? (c.disciplines || {}).Cruac?.dots || 0 : (c.disciplines || {}).Theban?.dots || 0;
  if (!p.free) {
    const pool = discDots * 2;
    const usedFree = (c.powers || []).filter((q, qi) => qi !== powerIdx && q.category === 'rite' && q.tradition === p.tradition && q.free).length;
    if (usedFree >= pool || p.level > discDots) return;
    p.free = true;
  } else {
    p.free = false;
  }
  _markDirty();
  _renderSheet(c);
}

/** Rebuild the rite-add dropdown when the tradition selector changes. */
export function shRefreshRiteDropdown(tradition) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const discDots = tradition === 'Cruac' ? (c.disciplines || {}).Cruac?.dots || 0 : (c.disciplines || {}).Theban?.dots || 0;
  const allRites = getRulesByCategory('rite');
  const tradRites = allRites
    .filter(r => r.parent === tradition && r.rank != null && r.rank <= discDots)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const sel = document.getElementById('rite-add-name');
  if (!sel || sel.tagName !== 'SELECT') return;
  sel.innerHTML = '<option value="" data-rank="" disabled selected>\u2014 select rite \u2014</option>' +
    tradRites.map(r => '<option value="' + r.name.replace(/"/g, '&quot;') + '" data-rank="' + r.rank + '">' + '\u25CF'.repeat(r.rank) + ' ' + r.name + '</option>').join('');
}

/* ══════════════════════════════════════════════════════════
   PACTS
══════════════════════════════════════════════════════════ */

export function shAddPact(name) {
  if (state.editIdx < 0) return;
  // Title-case (MERITS_DB stores lowercase keys/names; stored pacts use title case)
  name = (name || '').trim().replace(/\b\w/g, ch => ch.toUpperCase());
  if (!name) return;
  const c = state.chars[state.editIdx];
  if (!c.powers) c.powers = [];
  if (c.powers.some(p => p.category === 'pact' && p.name.toLowerCase() === name.toLowerCase())) return;
  c.powers.push({ category: 'pact', name });
  _markDirty();
  _renderSheet(c);
}

export function shRemovePact(powerIdx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.powers || !c.powers[powerIdx]) return;
  c.powers.splice(powerIdx, 1);
  _markDirty();
  _renderSheet(c);
}

export function shEditPact(powerIdx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const p = (c.powers || [])[powerIdx];
  if (!p || p.category !== 'pact') return;
  if (field === 'ohm_skill_0' || field === 'ohm_skill_1') {
    if (!p.ohm_skills) p.ohm_skills = ['', ''];
    p.ohm_skills[field === 'ohm_skill_0' ? 0 : 1] = val || '';
  } else if (field === 'cp' || field === 'xp') {
    p[field] = Math.max(0, parseInt(val) || 0);
  } else {
    p[field] = val || null;
  }
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   MERIT CREATION POINTS
══════════════════════════════════════════════════════════ */

/** Return sorted array of legal non-zero ratings for a merit. Tries rules cache, falls back to MERITS_DB. */
function _meritLegalRatings(meritName) {
  if (!meritName) return null;
  // Try rules cache
  const slug = meritName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug);
  if (rule?.rating_range) {
    const [min, max] = rule.rating_range;
    if (min === max) return [min];
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  return null;
}

/** Step a merit's total rating to the next/prev legal value (adjusts CP only). */
export function shStepMeritRating(realIdx, dir) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  ensureMeritSync(c);
  const m = c.merits[realIdx];
  if (!m) return;
  const current = (m.cp || 0) + (m.xp || 0);
  const legal = _meritLegalRatings(m.name); // [min..max] or [fixed], or null
  let next;
  if (!legal) {
    // Unknown merit — step by 1, clamp 0-5
    next = Math.max(0, Math.min(5, current + dir));
  } else if (legal.length === 1) {
    // Fixed merit: toggle between 0 and the fixed value
    next = current === 0 ? legal[0] : 0;
  } else {
    // Range: step within [0, min..max]
    const all = [0, ...legal];
    if (dir > 0) next = all.find(v => v > current) ?? current;
    else { const below = all.filter(v => v < current); next = below.length ? below[below.length - 1] : current; }
  }
  if (next === current) return;
  // Adjust CP by the delta, keeping fr and xp fixed
  const delta = next - current;
  let newCP = Math.max(0, (m.cp || 0) + delta);
  // Cap by budget if increasing
  if (delta > 0) {
    const otherCP = (c.merits || []).reduce((s, m2, i) => s + (i === realIdx ? 0 : (m2.cp || 0)), 0)
      + (c.fighting_styles || []).reduce((s, fs) => s + (fs.cp || 0), 0);
    newCP = Math.min(newCP, Math.max(0, 10 - otherCP));
  }
  m.cp = newCP;
  m.rating = (m.cp || 0) + (m.xp || 0);
  _markDirty();
  _renderSheet(c);
}

export function shEditMeritPt(realIdx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  ensureMeritSync(c);
  const m = c.merits[realIdx];
  if (!m) return;
  val = Math.max(0, parseInt(val) || 0);
  // Cap CP edits by the 10-point merit creation budget
  if (field === 'cp') {
    const otherCP = (c.merits || []).reduce((s, m2, i) => s + (i === realIdx ? 0 : (m2.cp || 0)), 0)
      + (c.fighting_styles || []).reduce((s, fs) => s + (fs.cp || 0), 0);
    val = Math.min(val, Math.max(0, 10 - otherCP));
  }
  // Cap free_mci edits by remaining MCI pool
  if (field === 'free_mci') {
    const mciTotal = (c.merits || []).filter(m2 => m2.name === 'Mystery Cult Initiation' && m2.active !== false)
      .reduce((s, m2) => s + mciPoolTotal(m2), 0);
    const otherFMCI = getMCIPoolUsed(c) - (m.free_mci || 0);
    val = Math.min(val, Math.max(0, mciTotal - otherFMCI));
  }
  // Cap free_vm edits by remaining VM pool
  if (field === 'free_vm') {
    const vmTotal = vmAlliesPool(c);
    const otherFVM = vmAlliesUsed(c) - (m.free_vm || 0);
    val = Math.min(val, Math.max(0, vmTotal - otherFVM));
  }
  // Cap free_inv edits by remaining Invested pool
  if (field === 'free_inv') {
    const invTotal = investedPool(c);
    const otherFINV = investedUsed(c) - (m.free_inv || 0);
    val = Math.min(val, Math.max(0, invTotal - otherFINV));
  }
  m[field] = val;
  // Sync stored rating
  m.rating = (m.cp || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.xp || 0);
  _markDirty();
  _renderSheet(c);
}


// ── Equipment (nav.10) ────────────────────────────────────────────────────────
export function shAddEquip(type) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.equipment) c.equipment = [];
  if (type === 'weapon') {
    c.equipment.push({ type: 'weapon', name: '', damage_rating: 0, damage_type: 'L', attack_skill: 'Weaponry' });
  } else {
    c.equipment.push({ type: 'armour', name: '', general_ar: 0, ballistic_ar: 0, mobility_penalty: 0 });
  }
  _markDirty();
  _renderSheet(c);
}

export function shEditEquip(i, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.equipment || !c.equipment[i]) return;
  c.equipment[i][field] = val;
  _markDirty();
}

export function shRemoveEquip(i) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.equipment) return;
  c.equipment.splice(i, 1);
  _markDirty();
  _renderSheet(c);
}
