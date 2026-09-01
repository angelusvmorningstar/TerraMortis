/* combat-tab.js — ST scene-level combat management tool.
 *
 * Session-persistent via sessionStorage key 'tm_combat_scene'.
 * Damage writes use trackerAdj() → existing PUT /api/tracker_state/:id.
 * No new MongoDB collections.
 */

import suiteState from '../suite/data.js';
import {
  getAttrEffective, calcDefence, calcHealth,
  // cmb.1: read live for the expanded card. Derived stats are never stored on
  // the combatant object - these are recomputed every render, same rule the
  // Tracker tab already follows for the same character.
  calcVitaeMax, calcWillpowerMax, calcSpeed,
  // cmb.3a: the real, bonus-inclusive skill accessor. The retired preset-pool
  // system used a local `skDots` shortcut that read `c.skills[s].dots` only and
  // silently dropped skill bonus dots plus the PT/MCI bonus-dot merits. The
  // Attack modal's pool maths is new code, so it uses the accessor the rest of
  // the app already agrees on rather than carrying that gap forward.
  skTotal,
} from '../data/accessors.js';
// Issue #879 (ADR-006 D4): combat scene captures the armour-adjusted +
// overlay-modded defence at snapshot time.
//
// cmb.3b: the Attack modal reads the attacker's own equipped weapons. Both
// predicates below are this repo's single source of truth for their question -
// `isEquipmentOnMe` for which `state` values count as equipped (carried/worn/
// active, never stashed/lost) and `isCombatGearWeaponShaped` for whether a
// combat_gear catalogue entry is a weapon at all. Imported, never re-derived
// inline: editor/sheet.js and suite/roll-v2.js already ask the same two
// questions through these same two functions, and EQC-1's own review found what
// happens when a consumer keeps its own copy instead.
import {
  defenceForDisplay, isEquipmentOnMe, isCombatGearWeaponShaped,
} from '../data/equipment-derivation.js';
// cmb.3b: a character's `equipment[]` entry carries only `{ catalogue_id, state,
// ... }` - the weapon's own name and stats live on the catalogue document. This
// is the same cache reader sheet.js and roll-v2.js resolve theirs through.
import { getCatalogueEntry } from '../data/equipment-catalogue-cache.js';
import { esc } from '../data/helpers.js';
import { trackerAdj, trackerRead } from './tracker.js';
import { loadPool } from '../suite/roll-v2.js';

const SESSION_KEY = 'tm_combat_scene';
const d10 = () => Math.floor(Math.random() * 10) + 1;

// ── State ─────────────────────────────────────────────────────────────────────
let _el = null;
let _scene = null; // { combatants: [...], round: 1, activeIdx: 0 }

// cmb.1 (AC6): the card's drag handle owns its own gesture state, structurally
// separate from the header's expand toggle. cmb.2 wires the real reordering on
// top of this; here it exists so the two gestures can never fight once it does.
//
// cmb.2: this object stays exactly two fields wide. `window.combatDragState()`
// publishes it verbatim and cmb.1's suites assert its whole shape, so every
// piece of transient gesture bookkeeping the reorder needs lives beside it
// rather than inside it.
let _drag = { active: false, charId: null };
let _dragPointerId = null;   // which pointer owns the gesture, so a second finger cannot steer it
let _dragTargetId = null;    // charId of the card currently under the pointer, or null over empty space
let _dragBound = false;      // the document-level release path is wired exactly once

function _save() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(_scene)); } catch { /* ignore */ }
}

function _load() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function _clearScene() {
  _scene = null;
  // cmb.3c: the split calculator is scratch state that belongs to a fight. It
  // lives outside `_scene` (so it never reaches sessionStorage) and therefore
  // has to be torn down explicitly with it.
  _split.clear();
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function aval(c, attr) {
  return getAttrEffective(c, attr);
}

function _initPool(c) { return aval(c, 'Dexterity') + aval(c, 'Composure'); }

function _combatantFromChar(c) {
  const id = String(c._id);
  const ts = trackerRead(id) || {};
  return {
    charId: id,
    name: c.moniker || c.name,
    initiative: null,
    initBase: _initPool(c),
    defence: defenceForDisplay(c),
    defenceUsed: false,
    maxHp: calcHealth(c),
    // cmb.3a: `attackPools` is gone. The preset pools were computed once, at
    // park time, from the attacker alone - they could not express "this target,
    // this attack type, right now", which is the whole job of the Attack modal
    // that replaced them.
    // cmb.1: cards open collapsed. Only one is ever expanded at a time
    // (toggleExpand collapses the rest).
    expanded: false,
  };
}

function _charFor(charId) {
  return (suiteState.chars || []).find(x => String(x._id) === charId) || null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initCombatTab(el) {
  _el = el;
  _scene = _load();
  // cmb.3a: the Attack modal is parented to <body>, so it would otherwise
  // outlive a re-init of the tab it belongs to and float over whatever renders
  // next. Re-entering the tab always starts with a clean surface.
  if (_atk) _atkClose();
  render();
}

/* cmb.2 (AC7): the rolled-order comparator, extracted so it has exactly one
   home. `rollInitiative` sorts with it at roll time and `resetToRolled` re-
   applies it any number of rounds later; duplicating the initBase tie-break
   into the second caller is how the two would silently drift apart.

   Note on the field name: this file's rolled value is `cb.initiative`, set once
   in `rollInitiative` and never written again. cmb.2's story text calls it
   `rolledInitiative`; no such field exists here and none was added, because
   `render()` already dispatches pre-roll vs round view on `initiative === null`
   and a second parallel copy of the same number is exactly the drift this
   story exists to prevent. */
function _byRolledInitiative(a, b) {
  if (b.initiative !== a.initiative) return b.initiative - a.initiative;
  return b.initBase - a.initBase;
}

/* Turn order IS array order in this file, so every reorder moves the slot the
   active card is sitting at. The ST's turn cursor has to follow the combatant,
   not the index - otherwise dragging anyone silently hands the turn to whoever
   landed in that slot. Runs the caller's mutation, then re-finds the same
   object. */
function _reorderPreservingActive(mutate) {
  const active = _scene.combatants[_scene.activeIdx] || null;
  mutate(_scene.combatants);
  const idx = active ? _scene.combatants.indexOf(active) : -1;
  _scene.activeIdx = idx >= 0 ? idx : 0;
}

function rollInitiative() {
  if (!_scene) return;
  _scene.combatants.forEach(cb => {
    cb.initiative = cb.initBase + d10();
    cb.defenceUsed = false;
  });
  _scene.combatants.sort(_byRolledInitiative);
  _scene.activeIdx = 0;
  _scene.round = 1;
  _save();
  render();
}

/* cmb.2 (AC1): move one combatant into another's slot. Position is the only
   thing written - no combatant's `initiative`, `initBase`, `expanded`,
   `defenceUsed` or any other field is touched, here or anywhere else on the
   drag path. Returns whether the array actually changed, so a drop that lands
   back where it started costs nothing (no save, no re-render). */
function moveCombatant(charId, targetId) {
  if (!_scene || !charId || !targetId || charId === targetId) return false;
  const from = _scene.combatants.findIndex(c => c.charId === charId);
  const to   = _scene.combatants.findIndex(c => c.charId === targetId);
  if (from < 0 || to < 0 || from === to) return false;
  _reorderPreservingActive(list => {
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
  });
  _save();
  return true;
}

/* cmb.2 (AC7): snap the whole line back to what the dice actually gave, however
   many manual bumps happened since. Reads `initiative`, never writes it. */
function resetToRolled() {
  if (!_scene || !_scene.combatants.length) return;
  if (_scene.combatants[0].initiative === null) return;
  _reorderPreservingActive(list => list.sort(_byRolledInitiative));
  _save();
  render();
}

function nextRound() {
  if (!_scene) return;
  _scene.round++;
  _scene.activeIdx = 0;
  _scene.combatants.forEach(cb => { cb.defenceUsed = false; });
  _save();
  render();
}

function nextTurn() {
  if (!_scene) return;
  const alive = _scene.combatants.filter(cb => !_isIncap(cb));
  const curActive = _scene.combatants[_scene.activeIdx];
  const curAliveIdx = alive.indexOf(curActive);
  const nextAlive = alive[(curAliveIdx + 1) % alive.length];
  _scene.activeIdx = _scene.combatants.indexOf(nextAlive);
  _save();
  render();
}

/* cmb.1 (AC5): at most one card is open. Expanding a card collapses whatever
   was open before it, so the turn order never scrolls off a phone screen. */
function toggleExpand(charId) {
  if (!_scene) return;
  const cb = _scene.combatants.find(c => c.charId === charId);
  if (!cb) return;
  const next = !cb.expanded;
  _scene.combatants.forEach(x => { x.expanded = false; });
  cb.expanded = next;
  _save();
  render();
}

function toggleDefence(charId) {
  if (!_scene) return;
  const cb = _scene.combatants.find(c => c.charId === charId);
  if (cb) { cb.defenceUsed = !cb.defenceUsed; _save(); render(); }
}

function removeCombatant(charId) {
  if (!_scene) return;
  _scene.combatants = _scene.combatants.filter(c => c.charId !== charId);
  // cmb.3c: a combatant who has left the fight takes their scratch calculator
  // with them, so re-adding them later starts clean rather than resurrecting a
  // half-typed split from an earlier round.
  _split.delete(charId);
  if (_scene.activeIdx >= _scene.combatants.length) _scene.activeIdx = 0;
  // cmb.3a: an open Attack modal is pointing at combatants that may have just
  // left the scene. Losing the attacker shuts it; losing the target drops the
  // selection and recomputes, rather than leaving a Defence subtraction on the
  // board for someone who is no longer in the fight.
  if (_atk) {
    if (_atk.attackerId === charId) _atkClose();
    else if (_atk.targetId === charId) _atkSetTarget(null);
  }
  _save();
  render();
}

function endCombat() {
  if (_atk) _atkClose();
  _clearScene();
  render();
}

async function applyDmg(charId, field, delta) {
  await trackerAdj(charId, field, delta);
  render();
}

/* cmb.3a: the single hand-off from this tab to the Roll tab. `quickRoll` (and
   its `window.combatQuickRoll` twin) used to live here, taking a pre-baked
   preset pool; the Attack modal takes its place and hands over the pool the ST
   actually settled on. The call shape is deliberately unchanged -
   `loadPool(pool, label, { total: pool })` then `goTab('roll')` - because
   roll-v2.js has explicit handling for a pool with no `.attr` that this path
   is the only producer of (see its own comments, and
   tests/rlv-7-persistent-mod-chips.spec.js). */
function _rollPool(charId, pool, label) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return false;
  suiteState.rollChar = c;
  loadPool(pool, label, { total: pool });
  if (window.goTab) window.goTab('roll');
  return true;
}

function _isIncap(cb) {
  const ts = trackerRead(cb.charId);
  if (!ts) return false;
  const dmg = (ts.bashing || 0) + (ts.lethal || 0) + (ts.aggravated || 0);
  return dmg >= cb.maxHp;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  if (!_el) return;
  if (!_scene || !_scene.combatants.length) {
    renderSetup();
  } else if (_scene.combatants[0].initiative === null) {
    renderPreRoll();
  } else {
    renderRound();
  }
}

function renderSetup() {
  const chars = (suiteState.chars || []).filter(c => !c.retired).sort((a, b) =>
    (a.moniker || a.name).localeCompare(b.moniker || b.name)
  );
  let h = '<div class="cbt-wrap"><div class="cbt-setup">';
  h += '<div class="cbt-setup-title">Select combatants</div>';
  h += '<div class="cbt-char-grid">';
  chars.forEach(c => {
    const id = String(c._id);
    h += `<button class="cbt-char-btn" onclick="combatAddChar('${esc(id)}')">${esc(c.moniker || c.name)}</button>`;
  });
  h += '</div>';
  h += '<div class="cbt-selected-list" id="cbt-selected"><p class="cbt-hint">No combatants selected</p></div>';
  h += '<button class="cbt-roll-init-btn" id="cbt-start-btn" style="display:none" onclick="combatStart()">Roll Initiative</button>';
  h += '</div></div>';
  _el.innerHTML = h;
  _scene = { combatants: [], round: 0, activeIdx: 0 };
}

/* Reuses the round view's own .cbt-card look (border/background/radius) rather
   than the pre-cmb.1 flat .cbt-row this screen used to render with - this was
   the one screen in the park -> roll -> fight flow the epic's five stories
   never touched, so it kept looking like the old app while everything either
   side of it changed. No rail (nothing rolled yet to show) and no expand
   (nothing to expand into before initiative exists) - just the card shell with
   Name, Defence, and Remove, matching what this screen actually needs. */
function renderPreRoll() {
  let h = '<div class="cbt-wrap">';
  h += `<div class="cbt-header"><span class="cbt-round-lbl">Combatants ready</span><div class="cbt-actions"><button class="cbt-roll-init-btn" onclick="combatRollInit()">Roll Initiative</button><button class="cbt-end-btn" onclick="combatEnd()">End Combat</button></div></div>`;
  h += '<div class="cbt-list">';
  _scene.combatants.forEach(cb => {
    const id = esc(cb.charId);
    h += `<div class="cbt-card cbt-card-preroll">
      <span class="cbt-name">${esc(cb.name)}</span>
      <span class="cbt-chip">DEF <b>${cb.defence}</b></span>
      <button class="cbt-rm-btn" onclick="combatRemove('${id}')" aria-label="Remove ${esc(cb.name)}">✕</button>
    </div>`;
  });
  h += '</div></div>';
  _el.innerHTML = h;
}

/* Health box-track - unchanged visual language from the pre-cmb.1 row
   (cbt-box / cbt-bash / cbt-let / cbt-agg), just relocated into the card. */
function _healthBoxes(ts, hp) {
  const dmg = (ts.bashing || 0) + (ts.lethal || 0) + (ts.aggravated || 0);
  let boxes = '';
  for (let i = 0; i < Math.min(hp, 15); i++) {
    let cls = 'cbt-box';
    if (i < (ts.aggravated || 0)) cls += ' cbt-agg';
    else if (i < (ts.aggravated || 0) + (ts.lethal || 0)) cls += ' cbt-let';
    else if (i < dmg) cls += ' cbt-bash';
    boxes += `<span class="${cls}"></span>`;
  }
  return boxes;
}

/* Vitae / Willpower track. Reads and writes go through the same
   trackerRead/trackerAdj pair the Tracker tab uses for the same character, so
   there is one writer, not two. The pip run is a run of real elements rather
   than a proportional bar because a proportional fill needs a per-render inline
   width, and this repo's CSS standard has no inline styles from JS. */
function _trackHtml(label, charId, field, cur, max, pipCls) {
  let pips = '';
  for (let i = 0; i < Math.min(max, 15); i++) {
    pips += `<span class="cbt-pip${i < cur ? ' ' + pipCls : ''}"></span>`;
  }
  const id = esc(charId);
  const lbl = esc(label);
  return `<div class="cbt-track">
      <div class="cbt-track-hd"><span class="cbt-track-lbl">${lbl}</span><span class="cbt-track-val">${cur}/${max}</span></div>
      <div class="cbt-track-row">
        <button class="cbt-track-btn" onclick="combatTrack('${id}','${field}',-1)" aria-label="Lower ${lbl}">−</button>
        <span class="cbt-pips">${pips}</span>
        <button class="cbt-track-btn" onclick="combatTrack('${id}','${field}',1)" aria-label="Raise ${lbl}">+</button>
      </div>
    </div>`;
}

// ── Kindred damage split (cmb.3c) ─────────────────────────────────────────────

/* THE FORMULA. Quoted, not summarised, from Terra Mortis's Conflict Errata
   (Combat -> Damage), which is authoritative wherever it disagrees with core
   VtR 2e RAW (Angelus's ruling, 2026-09-01):

     "By default, all damage dealt to Kindred is Bashing. Where an ability or
      power would apply Lethal or Aggravated damage, only the Weapon Rating is
      upgraded. Thus, a 1L weapon used with Kindred duelling would deliver one
      Lethal damage + successes Bashing damage. In the case of a 0L weapon, the
      first success is upgraded to Lethal, with subsequent successes adding
      Bashing damage."

   Read against the core rulebook's own damage rule (p.176, "Determine damage by
   adding the successes rolled to any weapon bonus"), the rating is ADDED to the
   successes. It is not subtracted from them and it is not a cap on them:

     rating > 0  ->  rating points of the rated type, PLUS every rolled success
                     as Bashing. Total damage = rating + successes.
                     (5 successes with a 1L weapon = 1 Lethal + 5 Bashing = 6.)

     rating = 0  ->  there is no extra point to add, so the FIRST success is
                     upgraded to the rated type instead and the rest are
                     Bashing. Total damage stays exactly the successes rolled.
                     (5 successes bare-handed = 1 Lethal + 4 Bashing = 5, NOT
                     1 Lethal + 5 Bashing.)

   That off-by-one at rating = 0 is the whole reason this helper exists rather
   than the arithmetic being inlined at the call site: every other case is purely
   additive and this one is not.

   Pure - no reads of module state, no writes, no rendering. `successes` and
   `rating` are floored at 0 because the steppers below cannot go negative and a
   negative here would silently invert the split. */
export function computeKindredSplit(successes, rating) {
  const s = Math.max(0, Math.floor(Number(successes) || 0));
  const r = Math.max(0, Math.floor(Number(rating) || 0));
  if (r > 0) return { ratedPoints: r, bashingPoints: s };
  const ratedPoints = s >= 1 ? 1 : 0;
  return { ratedPoints, bashingPoints: Math.max(0, s - ratedPoints) };
}

/* The two damage types a rating can be upgraded to. The Errata's own text names
   both as things "an ability or power would apply"; Lethal is the default
   because Aggravated is genuinely rare in play, not because it is a lesser
   option. Bashing is absent deliberately - it is what the unrated half always
   is, never something the rating gets toggled to. */
const SPLIT_TYPES = { lethal: 'Lethal', aggravated: 'Aggravated' };
const SPLIT_ARROW = '→';   // U+2192 RIGHTWARDS ARROW

/* Scratch calculator state, keyed by charId. Deliberately a module-level Map and
   NOT a field on the combatant object: `_save()` serialises `_scene` wholesale
   into sessionStorage, and this story adds no durable scene state (its own Dev
   Notes). What the ST last typed into the calculator is not part of the fight. */
const SPLIT_DEFAULT = { successes: 0, rating: 0, type: 'lethal' };
const _split = new Map();

/** Read-only: never creates an entry, so render() cannot grow the map. */
function _splitRead(charId) { return _split.get(charId) || { ...SPLIT_DEFAULT }; }

/** Write path: materialises the entry on first edit only. */
function _splitEnsure(charId) {
  let s = _split.get(charId);
  if (!s) { s = { ...SPLIT_DEFAULT }; _split.set(charId, s); }
  return s;
}

/* AC1's both-audiences phrasing, per Epic CMB Decision 2: a worked calculation
   naming what the Kindred takes AND what a mortal would have taken, not a bare
   number and not a dismissible suggestion. The numbers and the type are read
   live, so this is the preview and the Apply button agree by construction -
   both go through computeKindredSplit. */
function _splitPreviewText(successes, rating, type) {
  const s = Math.max(0, Math.floor(Number(successes) || 0));
  const r = Math.max(0, Math.floor(Number(rating) || 0));
  const { ratedPoints, bashingPoints } = computeKindredSplit(s, r);
  const lead = `${s} ${s === 1 ? 'success' : 'successes'}, rating ${r} ${SPLIT_ARROW} `;
  if (!ratedPoints && !bashingPoints) return `${lead}nothing to apply.`;
  const parts = [];
  if (ratedPoints > 0) {
    const lbl = SPLIT_TYPES[type] || SPLIT_TYPES.lethal;
    parts.push(`${ratedPoints} ${lbl} (a mortal takes ${ratedPoints === 1 ? 'this' : 'these'} too)`);
  }
  if (bashingPoints > 0) {
    parts.push(`${bashingPoints} Bashing to Kindred (a mortal would take ${bashingPoints === 1 ? 'this' : 'these'} as Lethal too)`);
  }
  return `${lead}${parts.join(' + ')}.`;
}

/* One labelled stepper. `.cbt-split-step` carries no styling of its own: it is
   grouped onto `.cbt-track-btn`'s existing rule in suite.css rather than
   duplicating that rule body (specs/project-context.md section 4), so it IS the
   Vitae/Willpower adjust button, at the same size, on the same card.

   It keeps its own class name rather than literally reusing `.cbt-track-btn`
   because cmb.1's own touch-target spec counts that class to prove the four
   track buttons are all really there. Sharing the name would have silently
   turned that count into eight and broken a passing assertion about a control
   this story does not touch. */
function _splitStepperHtml(id, field, label, value) {
  const lbl = esc(label);
  return `<div class="cbt-split-row">
      <span class="cbt-track-lbl">${lbl}</span>
      <button class="cbt-split-step" data-cbt-split-step="${field}:-1" onclick="combatSplitStep('${id}','${field}',-1)" aria-label="Fewer ${lbl}">${MINUS}</button>
      <span class="cbt-split-num" data-cbt-split-${field}>${value}</span>
      <button class="cbt-split-step" data-cbt-split-step="${field}:1" onclick="combatSplitStep('${id}','${field}',1)" aria-label="More ${lbl}">+</button>
    </div>`;
}

/* The calculator, rendered BESIDE the raw +B/+L/+A/- controls and never in place
   of them (AC6, Epic CMB Decision 5). Nothing here is required to enter damage;
   the buttons above it stay exactly as cmb.1 built them. */
function _splitHtml(charId) {
  const id = esc(charId);
  const s = _splitRead(charId);
  const { ratedPoints, bashingPoints } = computeKindredSplit(s.successes, s.rating);
  const nothing = !ratedPoints && !bashingPoints;

  let types = '';
  Object.keys(SPLIT_TYPES).forEach(key => {
    const on = s.type === key;
    types += `<button class="cbt-split-type${on ? ' cbt-split-type-on' : ''}" data-cbt-split-type="${key}" aria-pressed="${on ? 'true' : 'false'}" onclick="combatSplitType('${id}','${key}')">${esc(SPLIT_TYPES[key])}</button>`;
  });

  return `<div class="cbt-split">
      <div class="cbt-split-lbl">Kindred damage split</div>
      ${_splitStepperHtml(id, 'successes', 'Successes', s.successes)}
      ${_splitStepperHtml(id, 'rating', 'Rating', s.rating)}
      <div class="cbt-split-row">
        <span class="cbt-track-lbl">Type</span>
        <div class="cbt-split-types">${types}</div>
      </div>
      <p class="cbt-split-preview" data-cbt-split-preview>${esc(_splitPreviewText(s.successes, s.rating, s.type))}</p>
      <button class="cbt-split-apply" data-cbt-split-apply="${id}" onclick="combatSplitApply('${id}')"${nothing ? ' disabled aria-disabled="true"' : ''}>Apply Split</button>
    </div>`;
}

function _splitStep(charId, field, delta) {
  if (field !== 'successes' && field !== 'rating') return;
  if (!_combatantById(charId)) return;
  const s = _splitEnsure(charId);
  s[field] = Math.max(0, (s[field] || 0) + (Number(delta) || 0));
  render();
}

function _splitSetType(charId, type) {
  if (!SPLIT_TYPES[type]) return;
  if (!_combatantById(charId)) return;
  _splitEnsure(charId).type = type;
  render();
}

/* AC5: Apply commits through `applyDmg` - the exact function `window.combatDmg`
   already calls for the manual +B/+L/+A buttons - so there is one damage writer
   in this file, not two. Both halves are ADDITIVE deltas onto whatever is
   already marked; nothing here resets or overwrites existing damage.

   Awaited in sequence rather than fired together: `trackerAdj` reads the cached
   tracker row, mutates it and schedules a background PUT, so two overlapping
   calls for the same character could interleave their read and write. */
async function _splitApply(charId) {
  if (!_combatantById(charId)) return false;
  const s = _splitRead(charId);
  const { ratedPoints, bashingPoints } = computeKindredSplit(s.successes, s.rating);
  if (!ratedPoints && !bashingPoints) return false;
  if (ratedPoints > 0) await applyDmg(charId, s.type, ratedPoints);
  if (bashingPoints > 0) await applyDmg(charId, 'bashing', bashingPoints);
  return true;
}

/* The expanded half of a card: stat chips, the two tracker-backed tracks, the
   health box-track, the Attack button (cmb.3a, in place of cmb.1's preset pool
   buttons), the existing damage controls, and cmb.3c's split calculator beside
   them. Every control here is a real tap target (AC7). */
function _cardBodyHtml(cb, ts, hp) {
  const id = esc(cb.charId);
  const c = _charFor(cb.charId);
  const dmg = (ts.bashing || 0) + (ts.lethal || 0) + (ts.aggravated || 0);
  const vitaeMax = c ? calcVitaeMax(c) : 0;
  const wpMax = c ? calcWillpowerMax(c) : 0;
  const speed = c ? calcSpeed(c) : 0;

  let h = '<div class="cbt-card-exp">';
  h += `<div class="cbt-chips">
      <span class="cbt-chip${cb.defenceUsed ? ' cbt-chip-used' : ''}">DEF <b>${cb.defence}</b></span>
      <span class="cbt-chip">MOVE <b>${speed}</b></span>
      <button class="cbt-def-toggle" onclick="combatToggleDef('${id}')" title="Toggle defence used" aria-label="Toggle defence used">${cb.defenceUsed ? '↩' : '🛡'}</button>
    </div>`;
  h += _trackHtml('Vitae', cb.charId, 'vitae', ts.vitae || 0, vitaeMax, 'cbt-pip-vitae');
  h += _trackHtml('Willpower', cb.charId, 'willpower', ts.willpower || 0, wpMax, 'cbt-pip-wp');
  h += `<div class="cbt-track">
      <div class="cbt-track-hd"><span class="cbt-track-lbl">Health</span><span class="cbt-track-val">${dmg}/${hp}</span></div>
      <span class="cbt-hp-boxes">${_healthBoxes(ts, hp)}</span>
    </div>`;
  h += `<div class="cbt-atk-row"><button class="cbt-atk-open-btn" data-cbt-attack="${id}" onclick="combatAttack('${id}')">Attack</button></div>`;
  h += `<div class="cbt-dmg-ctrl">
      <span class="cbt-dmg-lbl">Dmg:</span>
      <button class="cbt-dmg-btn bash" onclick="combatDmg('${id}','bashing',1)">+B</button>
      <button class="cbt-dmg-btn let" onclick="combatDmg('${id}','lethal',1)">+L</button>
      <button class="cbt-dmg-btn agg" onclick="combatDmg('${id}','aggravated',1)">+A</button>
      <button class="cbt-dmg-btn heal" onclick="combatDmg('${id}','bashing',-1)">−</button>
    </div>`;
  h += _splitHtml(cb.charId);
  h += '</div>';
  return h;
}

/* One combatant card. Collapsed it is Name + tags + Health, with the rolled
   initiative in the rail beside it; the whole header is a single real button so
   there is nothing ambiguous to tap, and the drag handle sits outside that
   button rather than inside it (AC6). */
function _cardHtml(cb, idx) {
  const isActive = idx === _scene.activeIdx;
  const incap = _isIncap(cb);
  const ts = trackerRead(cb.charId) || {};
  const dmg = (ts.bashing || 0) + (ts.lethal || 0) + (ts.aggravated || 0);
  const hp = cb.maxHp;
  const expanded = !!cb.expanded;
  const id = esc(cb.charId);
  const c = _charFor(cb.charId);
  const isNpc = !!(c && (c.is_npc || c.npc));

  let h = `<div class="cbt-card${isActive ? ' cbt-active' : ''}${incap ? ' cbt-incap' : ''}${expanded ? ' cbt-card-open' : ''}" data-cbt-card="${id}">`;
  h += `<div class="cbt-card-rail">
      <span class="cbt-grip" data-cbt-grip="${id}" aria-hidden="true">⋮⋮</span>
      <span class="cbt-init-slot">${cb.initiative}</span>
      <span class="cbt-init-cap">Init</span>
    </div>`;
  h += '<div class="cbt-card-body">';
  h += `<button class="cbt-card-hd" data-cbt-toggle="${id}" onclick="combatToggleExpand('${id}')" aria-expanded="${expanded ? 'true' : 'false'}">`;
  h += `<span class="cbt-name">${esc(cb.name)}</span>`;
  if (isNpc) h += '<span class="cbt-npc-tag">NPC</span>';
  if (incap) h += '<span class="cbt-incap-lbl">Incapacitated</span>';
  h += `<span class="cbt-mini-hp"><span class="cbt-mini-hp-lbl">H</span>${dmg}/${hp}</span>`;
  h += `<span class="cbt-chev">${expanded ? '▾' : '▸'}</span>`;
  h += '</button>';
  if (expanded) h += _cardBodyHtml(cb, ts, hp);
  h += '</div></div>';
  return h;
}

// ── Drag to reorder (cmb.2) ───────────────────────────────────────────────────

/* Classes, not inline styles - this repo's CSS standard forbids styling from JS
   (specs/project-context.md §1). Both are declared in suite.css and both are
   composited-only, so nothing the drag paints can reflow the list (AC3). */
const DRAG_CLS = 'cbt-card-dragging';
const DROP_CLS = 'cbt-drop-target';

function _cardEls() {
  if (!_el || typeof _el.querySelectorAll !== 'function') return [];
  return Array.from(_el.querySelectorAll('[data-cbt-card]'));
}

/* Which card the pointer is over, measured against the real rendered boxes.
   Deliberately not `document.elementFromPoint`: the dragged card sits directly
   under the finger, so a topmost-element hit test would only ever answer
   "itself". Returns null over empty space, which is what AC5 turns on. */
function _cardAt(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  for (const card of _cardEls()) {
    if (typeof card.getBoundingClientRect !== 'function') continue;
    const r = card.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return card;
  }
  return null;
}

/* Repaint the lift and the drop ring from `_drag` alone, so this is safe to
   call after a mid-gesture re-render as well as on every pointermove. */
function _paintDrag() {
  for (const card of _cardEls()) {
    if (!card.classList) continue;
    const id = card.getAttribute('data-cbt-card');
    card.classList.toggle(DRAG_CLS, _drag.active && id === _drag.charId);
    card.classList.toggle(DROP_CLS, _drag.active && !!_dragTargetId && id === _dragTargetId);
  }
}

/** Ignore a pointer that is not the one that started this gesture. */
function _wrongPointer(ev) {
  return _dragPointerId !== null && ev && ev.pointerId !== undefined && ev.pointerId !== _dragPointerId;
}

function _dragStart(ev, charId) {
  _drag = { active: true, charId };
  _dragPointerId = (ev && ev.pointerId !== undefined) ? ev.pointerId : null;
  _dragTargetId = null;
  _paintDrag();
}

function _dragMove(ev) {
  if (!_drag.active || _wrongPointer(ev)) return;
  const card = _cardAt(ev.clientX, ev.clientY);
  const id = card ? card.getAttribute('data-cbt-card') : null;
  _dragTargetId = (id && id !== _drag.charId) ? id : null;
  _paintDrag();
}

/* The single exit from a drag, however it ends: a real drop, a release over
   empty space, or a cancel. `_drag` is cleared BEFORE anything else can throw,
   so there is no path out of here that leaves the gesture stuck active (AC5). */
function _dragEnd(ev, cancelled) {
  if (!_drag.active || _wrongPointer(ev)) return;
  const charId = _drag.charId;
  const target = cancelled ? null : _cardAt(ev && ev.clientX, ev && ev.clientY);
  const targetId = target ? target.getAttribute('data-cbt-card') : null;

  _drag = { active: false, charId: null };
  _dragPointerId = null;
  _dragTargetId = null;

  // moveCombatant() has already persisted through _save() if it moved anything.
  if (targetId && moveCombatant(charId, targetId)) render();
  else _paintDrag();   // AC5: order untouched, so only the lift comes off
}

/* cmb.1's Senior Developer Review flagged its grip listeners as unable to end a
   real drag: they were scoped to the grip, and a reorder gesture by definition
   releases somewhere else. Closed here on the document instead, because pointer
   capture on its own does not cover both failure modes:

     1. the release lands anywhere but the grip - capture does solve this one;
     2. `render()` replaces `_el.innerHTML` wholesale, which destroys the grip
        element mid-gesture and implicitly drops whatever capture it held. A
        document listener survives that; a captured element cannot.

   Capture is still requested at pointerdown below, because it is what stops the
   browser handing a half-finished gesture to a scroll or a text selection. The
   document is the authority; capture is the courtesy. Bound once per module,
   never per render, so repeated renders cannot stack duplicate handlers. */
function _ensureDragListeners() {
  if (_dragBound) return;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  _dragBound = true;
  document.addEventListener('pointermove', ev => _dragMove(ev));
  document.addEventListener('pointerup', ev => _dragEnd(ev, false));
  document.addEventListener('pointercancel', ev => _dragEnd(ev, true));
}

/* The handle's own listener lives here, on the handle only. The header toggle is
   an onclick on its own sibling button, so a gesture that starts on the grip can
   never reach it and a tap that lands on the header never opens a drag. */
function _wireCardHandles() {
  if (!_el || typeof _el.querySelectorAll !== 'function') return;
  _ensureDragListeners();
  _el.querySelectorAll('[data-cbt-grip]').forEach(grip => {
    const charId = grip.getAttribute('data-cbt-grip');
    grip.addEventListener('pointerdown', ev => {
      ev.stopPropagation();
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof grip.setPointerCapture === 'function' && ev.pointerId !== undefined) {
        // Throws if the id is not a live pointer (a synthetic event, say). The
        // document listeners above are what actually make the drag work, so a
        // refused capture is a downgrade in feel, never a broken gesture.
        try { grip.setPointerCapture(ev.pointerId); } catch { /* capture is a courtesy */ }
      }
      _dragStart(ev, charId);
    });
  });
  _paintDrag();
}

function renderRound() {
  let h = '<div class="cbt-wrap">';
  h += `<div class="cbt-header"><span class="cbt-round-lbl">Round ${_scene.round}</span><div class="cbt-actions"><button class="cbt-next-btn" onclick="combatNextTurn()">Next Turn</button><button class="cbt-round-btn" onclick="combatNextRound()">Next Round</button><button class="cbt-reset-btn" onclick="combatResetOrder()" title="Re-sort the line by the initiative that was actually rolled">Reset to Rolled Order</button><button class="cbt-end-btn" onclick="combatEnd()">End Combat</button></div></div>`;
  h += '<div class="cbt-list">';
  _scene.combatants.forEach((cb, idx) => { h += _cardHtml(cb, idx); });
  h += '</div></div>';
  _el.innerHTML = h;
  _wireCardHandles();
}

// ── Attack modal (cmb.3a) ─────────────────────────────────────────────────────

/* The five attack types, built to Terra Mortis's own Conflict Errata, which is
   authoritative wherever it disagrees with core VtR 2e RAW (Angelus's ruling,
   2026-09-01). Two entries below differ from what the core rulebook alone would
   give, and both differences are deliberate rather than typos:

     - Thrown Weapons is Strength + Athletics, NOT core RAW's Dexterity +
       Athletics. The Errata changes this one specifically. Its further note
       that an *aerodynamic* thrown weapon may use Dexterity or Strength at the
       player's discretion is a per-weapon property, and there is no weapon data
       in this story at all, so that choice belongs to cmb.3b.
     - Ranged Combat never subtracts Defence. That is not the Errata: the
       rulebook itself (p.176) says Defence cannot be applied against firearms
       attacks, so it stands unmodified either way.

   `defence: false` therefore means two different things for `ranged` and for
   `other`, which is why `defenceNA` exists as its own flag. Only Ranged makes a
   claim about the target's Defence - "it does not apply to you" - and the
   target pill has to show that, rather than leaving a visibly non-zero Defence
   number silently doing nothing (AC6). */
const ATTACK_TYPES = [
  { key: 'unarmed', label: 'Unarmed Combat', attr: 'Strength',  skill: 'Brawl',    defence: true,  defenceNA: false },
  { key: 'melee',   label: 'Melee Combat',   attr: 'Strength',  skill: 'Weaponry', defence: true,  defenceNA: false },
  { key: 'ranged',  label: 'Ranged Combat',  attr: 'Dexterity', skill: 'Firearms', defence: false, defenceNA: true  },
  { key: 'thrown',  label: 'Thrown Weapons', attr: 'Strength',  skill: 'Athletics', defence: true,  defenceNA: false },
  // "Other" is not a fallback and not a lesser option (Epic CMB Decision 5):
  // same row class, same tap target, same one-tap reachability as every
  // formula-backed type. It simply has no formula to show.
  { key: 'other',   label: 'Other',          attr: null,        skill: null,       defence: false, defenceNA: false },
];

const MINUS = '−';   // U+2212 MINUS SIGN, matching the tracker buttons above.

/* { attackerId, targetId, type, pool, manual } while the modal is open, null
   while it is shut. `pool` is the single source of truth for what actually gets
   rolled: the formula seeds it, the stepper overwrites it, and Roll reads it -
   nothing recalculates it out from under the ST at submit time. */
let _atk = null;
let _atkEl = null;        // the modal host, parented to <body>, never to _el
let _atkKeyBound = false; // the Escape listener is bound at most once

function _atkTypeFor(key) { return ATTACK_TYPES.find(t => t.key === key) || null; }

function _combatantById(charId) {
  if (!_scene) return null;
  return _scene.combatants.find(cb => cb.charId === charId) || null;
}

/* Pool maths, per the five formulas above. Reads `getAttrEffective` and
   `skTotal` - the real, bonus-inclusive accessors - never this file's old local
   `skDots` shortcut, which is gone with the preset pools it served. */
function _atkPoolFor(typeKey, targetId) {
  const t = _atkTypeFor(typeKey);
  if (!t || !t.attr) return 0;                    // "Other" starts at 0, no formula
  const c = _atk ? _charFor(_atk.attackerId) : null;
  if (!c) return 0;
  const base = getAttrEffective(c, t.attr) + skTotal(c, t.skill);
  const tgt = targetId ? _combatantById(targetId) : null;
  // Defence is subtracted for the three melee-range types only, and only when a
  // target is actually picked. `defenceUsed` deliberately does NOT change this
  // number - it is a display state on the card and on the pill (cmb.1's own
  // convention), not a rules modifier this story was given.
  const def = (t.defence && tgt) ? (tgt.defence || 0) : 0;
  return Math.max(0, base - def);
}

/** The live formula with real numbers in it, or '' when there is none to show. */
function _atkFormulaText(typeKey, targetId) {
  const t = _atkTypeFor(typeKey);
  if (!t || !t.attr) return '';
  const c = _atk ? _charFor(_atk.attackerId) : null;
  if (!c) return '';
  let txt = `${t.attr} ${getAttrEffective(c, t.attr)} + ${t.skill} ${skTotal(c, t.skill)}`;
  const tgt = targetId ? _combatantById(targetId) : null;
  if (t.defence && tgt) txt += ` ${MINUS} Defence ${tgt.defence || 0}`;
  return txt;
}

/** The static one-line description under each type's own name. */
function _atkTypeDesc(t) {
  if (!t.attr) return 'Set your own pool';
  let d = `${t.attr} + ${t.skill}`;
  if (t.defence) d += ` ${MINUS} Defence`;
  if (t.defenceNA) d += ' · Defence does not apply';
  return d;
}

// ── Equipped-weapon awareness (cmb.3b) ───────────────────────────────────────

/* Which catalogue `weapon_type` each attack type draws its chips from. Unarmed
   and Other are absent deliberately, not by oversight (AC6): Unarmed is
   bare-handed by definition, and Other has no formula for a weapon reference to
   hang off. A type that is not in this map simply shows no chips. */
const ATTACK_WEAPON_TYPE = { melee: 'melee', ranged: 'ranged', thrown: 'thrown' };

/* Same labels editor/sheet.js's own equipment renderer uses, so a Machete reads
   identically on the sheet and in this modal. */
const DMG_TYPE_LABEL = { bashing: 'Bashing', lethal: 'Lethal', aggravated: 'Aggravated' };

/* "+1 Lethal" - the weapon's damage rating, shown purely for reference. This
   story surfaces the number; cmb.3c is what applies the Kindred bashing/lethal
   split to a rolled result. Nothing here touches the dice pool.

   Each half is omitted independently when it is absent. All six weapon-shaped
   documents in the live catalogue carry `damage_mod`/`damage_type` fully
   populated (this story's own Pre-flight check, run against
   `tm_game.equipment_catalogue`), so this is ordinary defensive coding rather
   than a contingency for known-missing data. */
function _atkWeaponRating(entry) {
  const parts = [];
  if (entry.damage_mod != null) {
    // `!= null`, not a truthiness check: a real +0 weapon (a throwing knife) has
    // a rating and must show it. The explicit sign matches editor/sheet.js's own
    // weapon line, so the same item reads the same in both places; the negative
    // branch exists because a bare `'+' + n` would render "+-1" if the catalogue
    // ever carried one.
    const n = Number(entry.damage_mod);
    if (Number.isFinite(n)) parts.push(n >= 0 ? `+${n}` : String(n));
  }
  const dmg = DMG_TYPE_LABEL[entry.damage_type] || entry.damage_type;
  if (dmg) parts.push(String(dmg));
  return parts.join(' ');
}

/* The ATTACKER's own currently-equipped weapons matching an attack type.

   Cross-referenced exactly the way the rest of this app already does it:
   `item.catalogue_id` through `getCatalogueEntry`, then the shared
   `isCombatGearWeaponShaped` predicate rather than a bucket comparison alone
   (armour and weapons share the `combat_gear` bucket since EQC-1). A dangling
   `catalogue_id` resolves to null and is skipped, matching EQC-1's own
   display-inert-on-dangling-reference contract.

   Identity is the index into this character's own `equipment[]`, NOT the
   `catalogue_id`: nothing stops a character carrying two of the same catalogue
   item, and two chips for two machetes have to stay independently selectable. */
function _atkWeaponsFor(charId, typeKey) {
  const want = ATTACK_WEAPON_TYPE[typeKey];
  if (!want) return [];
  const c = _charFor(charId);
  if (!c || !Array.isArray(c.equipment)) return [];
  const out = [];
  c.equipment.forEach((item, idx) => {
    // AC2: `stashed` and `lost` are filtered out here, by the shared predicate,
    // and nowhere else - a weapon you own but left at home is not one you can
    // swing this round.
    if (!item || !isEquipmentOnMe(item)) return;
    const entry = getCatalogueEntry(item.catalogue_id);
    if (!entry || entry.bucket !== 'combat_gear' || !isCombatGearWeaponShaped(entry)) return;
    if (entry.weapon_type !== want) return;
    out.push({
      idx,
      name: entry.name || String(item.catalogue_id),
      rating: _atkWeaponRating(entry),
    });
  });
  return out;
}

/** The selected weapon resolved back to its entry, or null when none is picked. */
function _atkSelectedWeapon() {
  if (!_atk || _atk.weapon === null || _atk.weapon === undefined) return null;
  return _atkWeaponsFor(_atk.attackerId, _atk.type).find(w => w.idx === _atk.weapon) || null;
}

/* AC1/AC4: one chip per matching equipped weapon, or nothing at all. An empty
   list is not an error state and never renders a placeholder or a disabled row -
   the modal stays exactly as usable as it was, falling through to the bare
   attribute+skill pool for fists, an improvised object, or anything else the
   catalogue has never heard of. */
function _atkWeaponChipsHtml() {
  const list = _atkWeaponsFor(_atk.attackerId, _atk.type);
  if (!list.length) return '';
  let h = '<div class="cbt-atk-weapons-lbl">Weapon</div><div class="cbt-atk-weapons">';
  list.forEach(w => {
    const on = _atk.weapon === w.idx;
    h += `<button class="cbt-atk-weapon${on ? ' cbt-atk-weapon-on' : ''}" data-cbt-atk-weapon="${w.idx}" aria-pressed="${on ? 'true' : 'false'}" onclick="combatAttackWeapon(${w.idx})">`;
    h += `<span class="cbt-atk-weapon-name">${esc(w.name)}</span>`;
    if (w.rating) h += `<span class="cbt-atk-weapon-rating">${esc(w.rating)}</span>`;
    h += '</button>';
  });
  h += '</div>';
  return h;
}

function _atkTargetPillsHtml(sel) {
  const others = (_scene ? _scene.combatants : []).filter(cb => cb.charId !== _atk.attackerId);
  if (!others.length) return '<p class="cbt-hint">No other combatants in the scene. An attack can still be rolled without a target.</p>';
  let h = '';
  others.forEach(cb => {
    const tid = esc(cb.charId);
    const on = cb.charId === _atk.targetId;
    let defCls = 'cbt-atk-def';
    let defTxt = `DEF ${esc(cb.defence)}`;
    if (sel && sel.defenceNA) {
      // Ranged wins over the defence-used marking: firearms bypass Defence
      // whether or not this combatant has already spent theirs, so "N/A" is the
      // truer statement of the two and showing both at once reads as noise.
      defCls += ' cbt-atk-def-na';
      defTxt += ' · N/A';
    } else if (cb.defenceUsed) {
      defCls += ' cbt-atk-def-used';
    }
    h += `<button class="cbt-atk-pill${on ? ' cbt-atk-pill-on' : ''}" data-cbt-atk-target="${tid}" aria-pressed="${on ? 'true' : 'false'}" onclick="combatAttackTarget('${tid}')">`;
    h += `<span class="cbt-atk-pill-name">${esc(cb.name)}</span><span class="${defCls}">${defTxt}</span></button>`;
  });
  return h;
}

function _atkModalHtml() {
  if (!_atk) return '';
  const cb = _combatantById(_atk.attackerId);
  const c = _charFor(_atk.attackerId);
  const who = cb ? cb.name : (c ? (c.moniker || c.name) : 'Attacker');
  const sel = _atkTypeFor(_atk.type);
  const pool = Math.max(0, _atk.pool || 0);
  const formula = _atkFormulaText(_atk.type, _atk.targetId);

  let types = '';
  ATTACK_TYPES.forEach(t => {
    const on = _atk.type === t.key;
    types += `<button class="cbt-atk-type${on ? ' cbt-atk-type-on' : ''}" data-cbt-atk-type="${esc(t.key)}" aria-pressed="${on ? 'true' : 'false'}" onclick="combatAttackType('${esc(t.key)}')">`;
    types += `<span class="cbt-atk-type-lbl">${esc(t.label)}</span><span class="cbt-atk-type-sub">${esc(_atkTypeDesc(t))}</span></button>`;
  });

  let note;
  if (!sel) note = 'Pick an attack type to preview its pool.';
  else if (!formula) note = 'No formula. The pool is whatever you set it to.';
  else note = formula;

  let h = `<div class="cbt-atk-overlay" data-cbt-atk-overlay onclick="combatAttackBackdrop(event)">`;
  h += `<div class="cbt-atk-modal" role="dialog" aria-modal="true" aria-label="Attack">`;
  h += `<div class="cbt-atk-hd"><span class="cbt-atk-title">Attack: ${esc(who)}</span>`;
  h += `<button class="cbt-atk-close" data-cbt-atk-close onclick="combatAttackClose()" aria-label="Close attack">✕</button></div>`;

  h += `<div class="cbt-atk-sec"><div class="cbt-atk-sec-lbl">Target</div>`;
  h += `<div class="cbt-atk-pills">${_atkTargetPillsHtml(sel)}</div></div>`;

  h += `<div class="cbt-atk-sec"><div class="cbt-atk-sec-lbl">Attack type</div>`;
  h += `<div class="cbt-atk-types">${types}</div>`;
  // cmb.3b: the weapon chips live inside the Attack Type section because they
  // are a property of the type that is selected, not a section of their own that
  // would sit empty for Unarmed and Other.
  h += _atkWeaponChipsHtml();
  h += `</div>`;

  h += `<div class="cbt-atk-sec"><div class="cbt-atk-sec-lbl">Dice pool</div>`;
  h += `<div class="cbt-atk-stepper">`;
  h += `<button class="cbt-atk-step" data-cbt-atk-step="-1" onclick="combatAttackStep(-1)" aria-label="Lower the dice pool">${MINUS}</button>`;
  h += `<span class="cbt-atk-pool" data-cbt-atk-pool>${pool}<span class="cbt-atk-pool-d">d</span></span>`;
  h += `<button class="cbt-atk-step" data-cbt-atk-step="1" onclick="combatAttackStep(1)" aria-label="Raise the dice pool">+</button>`;
  h += `</div><div class="cbt-atk-note" data-cbt-atk-note>${esc(note)}</div></div>`;

  h += `<div class="cbt-atk-actions">`;
  h += `<button class="cbt-atk-cancel" data-cbt-atk-cancel onclick="combatAttackClose()">Cancel</button>`;
  h += `<button class="cbt-atk-roll" data-cbt-atk-roll onclick="combatAttackRoll()"${sel ? '' : ' disabled aria-disabled="true"'}>Roll</button>`;
  h += `</div></div></div>`;
  return h;
}

function _atkPaint() {
  if (_atkEl) _atkEl.innerHTML = _atkModalHtml();
}

/* Escape closes the modal. Bound on the document once per module - the modal's
   own markup is replaced wholesale on every state change, so a listener living
   inside it would be destroyed by the first tap. */
function _atkEnsureKeyListener() {
  if (_atkKeyBound) return;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  _atkKeyBound = true;
  document.addEventListener('keydown', ev => {
    if (_atk && ev && (ev.key === 'Escape' || ev.key === 'Esc')) _atkClose();
  });
}

/* The modal is parented to <body>, not to `_el`. render() replaces `_el`'s
   whole innerHTML, and `.cbt-wrap` is an `overflow: hidden` flex column - a
   dialog nested in either would be destroyed by the next re-render or clipped
   by the scrolling card list it has to sit above. */
function _atkOpen(charId) {
  if (!_scene || !_combatantById(charId)) return;
  // cmb.3b: `weapon` is the index into the attacker's own `equipment[]`, or
  // null. It is a reference display only - nothing reads it into the pool.
  _atk = { attackerId: charId, targetId: null, type: null, pool: 0, manual: false, weapon: null };
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (!_atkEl) _atkEl = document.createElement('div');
  if (document.body && _atkEl.parentNode !== document.body) document.body.appendChild(_atkEl);
  _atkEnsureKeyListener();
  _atkPaint();
}

function _atkClose() {
  _atk = null;
  if (_atkEl) {
    _atkEl.innerHTML = '';
    if (_atkEl.parentNode && typeof _atkEl.parentNode.removeChild === 'function') {
      _atkEl.parentNode.removeChild(_atkEl);
    }
  }
}

/* AC7, resolved deliberately: changing the target or the type RECOMPUTES the
   preview from the formula and drops any manual adjustment made before that
   change. The story leaves the choice open; this is the safer of the two.

   An adjustment is always made in a context - "+2 because he is in cover
   against my Ranged shot" - and carrying that delta silently into a different
   type or a different target would state a number the ST never actually chose
   for those selections. The ST is never locked out either way: the stepper is
   live at all times, including immediately after any recompute, and `_atk.pool`
   is what Roll reads, so the last thing the ST touched is always what is
   rolled. `manual` is tracked so the modal never claims a hand-set pool came
   from a formula. */
function _atkSetType(key) {
  if (!_atk || !_atkTypeFor(key)) return;
  _atk.type = key;
  _atk.pool = _atkPoolFor(key, _atk.targetId);
  _atk.manual = false;
  // cmb.3b AC5: a Melee weapon selection has no meaning once Ranged is the type.
  // Cleared on every type change, including a change back to the same family -
  // the chip list is rebuilt from the new type, so a stale index could otherwise
  // light up an unrelated weapon.
  _atk.weapon = null;
  _atkPaint();
}

/* cmb.3b AC3: the weapon is a REFERENCE display and nothing more. `_atk.pool`
   and `_atk.manual` are deliberately untouched here, and there is no branch
   anywhere that makes the stepper, the Roll button, or a type row conditional on
   a weapon being selected (Epic CMB Decision 5 - support rails, not handcuffs).
   The rating a chip shows affects damage, which cmb.3c resolves; it never
   affects the attack pool.

   Tapping the selected chip again clears it, matching the target pills' own
   established behaviour in this same modal rather than inventing a second
   convention for the same gesture. */
function _atkSetWeapon(idx) {
  if (!_atk) return;
  const n = Number(idx);
  if (!Number.isInteger(n)) return;
  if (!_atkWeaponsFor(_atk.attackerId, _atk.type).some(w => w.idx === n)) return;
  _atk.weapon = (_atk.weapon === n) ? null : n;
  _atkPaint();
}

/** Tapping the selected target again clears it - AC8 allows a targetless roll. */
function _atkSetTarget(charId) {
  if (!_atk) return;
  if (charId !== null && !_combatantById(charId)) return;
  _atk.targetId = (_atk.targetId === charId) ? null : charId;
  if (_atk.type) {
    _atk.pool = _atkPoolFor(_atk.type, _atk.targetId);
    _atk.manual = false;
  }
  _atkPaint();
}

/* AC4: any non-negative integer, for every type including the preset ones. The
   only floor is 0 - there is no upper clamp, and no type gates the stepper. */
function _atkStep(delta) {
  if (!_atk) return;
  const d = Number(delta) || 0;
  _atk.pool = Math.max(0, (_atk.pool || 0) + d);
  _atk.manual = true;
  _atkPaint();
}

/* AC8: a type is the only requirement. No target is fine, a 0 pool is fine. */
function _atkRoll() {
  if (!_atk || !_atk.type) return false;
  const t = _atkTypeFor(_atk.type);
  const tgt = _atk.targetId ? _combatantById(_atk.targetId) : null;
  // cmb.3b AC8: resolved BEFORE _atkClose() below wipes the state it reads.
  // "Melee Combat vs Reed (Machete)" - the Roll-tab entry names what was
  // actually swung, not just the skill it was swung with.
  const w = _atkSelectedWeapon();
  const label = t.label + (tgt ? ` vs ${tgt.name}` : '') + (w ? ` (${w.name})` : '');
  const pool = Math.max(0, _atk.pool || 0);
  const attackerId = _atk.attackerId;
  _atkClose();
  return _rollPool(attackerId, pool, label);
}

// ── Window-exposed functions ──────────────────────────────────────────────────

window.combatAddChar = function(charId) {
  if (!_scene) _scene = { combatants: [], round: 0, activeIdx: 0 };
  if (_scene.combatants.find(c => c.charId === charId)) return;
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  _scene.combatants.push(_combatantFromChar(c));
  _save();
  // Update selected list
  const selEl = document.getElementById('cbt-selected');
  const startBtn = document.getElementById('cbt-start-btn');
  if (selEl) {
    selEl.innerHTML = _scene.combatants.map(cb =>
      `<span class="cbt-sel-chip">${esc(cb.name)} <button onclick="combatRemove('${esc(cb.charId)}')">✕</button></span>`
    ).join('');
  }
  if (startBtn) startBtn.style.display = _scene.combatants.length >= 1 ? '' : 'none';
};

window.combatStart = function() {
  if (!_scene || !_scene.combatants.length) return;
  renderPreRoll();
};

window.combatRollInit = function() { rollInitiative(); };
window.combatNextRound = function() { nextRound(); };
window.combatNextTurn = function() { nextTurn(); };
window.combatEnd = function() { endCombat(); };
window.combatRemove = function(id) { removeCombatant(id); };
window.combatToggleDef = function(id) { toggleDefence(id); };
window.combatDmg = function(id, field, delta) { applyDmg(id, field, delta); };
window.combatToggleExpand = function(id) { toggleExpand(id); };
// cmb.3a: the Attack modal. `combatQuickRoll` lived here until this story
// retired the preset pools it rolled; nothing else in the app called it (repo-
// wide search, Task 1) and its own suite went with it.
window.combatAttack = function(id) { _atkOpen(id); };
window.combatAttackClose = function() { _atkClose(); };
window.combatAttackTarget = function(id) { _atkSetTarget(id); };
window.combatAttackType = function(key) { _atkSetType(key); };
window.combatAttackStep = function(delta) { _atkStep(delta); };
// cmb.3b: pick (or unpick) one of the attacker's equipped weapons for the
// selected type. Reference display only - it never moves the pool.
window.combatAttackWeapon = function(idx) { _atkSetWeapon(idx); };
window.combatAttackRoll = function() { return _atkRoll(); };
// A tap that lands on the backdrop itself dismisses; a tap that bubbled up from
// anything inside the dialog does not.
window.combatAttackBackdrop = function(ev) {
  if (ev && ev.target && ev.currentTarget && ev.target === ev.currentTarget) _atkClose();
};
// Read-only view of the modal's state, following combatDragState's precedent so
// the pool maths is assertable without a layout engine.
window.combatAttackState = function() { return _atk ? { ..._atk } : null; };
// cmb.3c: the Kindred damage-split calculator on each expanded card. It is a
// scratch tool beside the +B/+L/+A buttons, never a replacement for them - the
// raw buttons above stay wired to `combatDmg` exactly as cmb.1 left them, and
// Apply commits through that same `applyDmg` path additively.
window.combatSplitStep = function(id, field, delta) { _splitStep(id, field, delta); };
window.combatSplitType = function(id, type) { _splitSetType(id, type); };
window.combatSplitApply = function(id) { return _splitApply(id); };
// Read-only view of one card's calculator, following combatAttackState's
// precedent: the inputs the ST set plus the split they compute to, so the
// arithmetic is assertable without reading it back out of rendered prose.
window.combatSplitState = function(id) {
  const s = _splitRead(id);
  return { ...s, ...computeKindredSplit(s.successes, s.rating) };
};
// The pure formula on its own, so the rating = 0 off-by-one can be swept
// exhaustively rather than sampled through the UI.
window.combatSplitCompute = function(successes, rating) { return computeKindredSplit(successes, rating); };
// cmb.2: snaps the turn line back to the rolled order. Reads `initiative`,
// never writes it, so the dice result stays retrievable however many manual
// bumps the ST made in between.
window.combatResetOrder = function() { resetToRolled(); };
// Vitae / Willpower run through the same trackerAdj write applyDmg already
// uses; the separate name is only so the damage buttons stay readable.
window.combatTrack = function(id, field, delta) { applyDmg(id, field, delta); };
// Read-only view of the handle's gesture state (AC6 is tested against this,
// and cmb.2 builds its reorder on top of it).
window.combatDragState = function() { return { ..._drag }; };
