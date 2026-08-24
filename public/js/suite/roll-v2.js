// ══════════════════════════════════════════════
//  Roll Tab UI (#1018) — the sole player roller since rlv.2 (2026-08-24).
//
//  Was gated behind the `tm-use-new-dice-roller` localStorage flag
//  alongside a parallel ./roll.js during its own development; rlv.2
//  promoted this module and deleted the flag and ./roll.js outright, not
//  as a staged soak. Started as a byte-identical copy of ./roll.js.
//
//  Slice A+D (#1024) — divergence from roll.js (retired):
//    A. Anchor number = `effPool()` (the count you'll ACTUALLY roll),
//       painted into `#rv2-eff` / `#rv2-eff-unit`, with a
//       always-visible sub-line at `#rv2-sub`
//       ("base 8 · +2 mod · 9-again"). The full skill-breakdown is
//       still written into `#effline` — moved inside a
//       `<details>` disclosure in the markup.
//    D. `setAgainSeg(v)` drives one exclusive segmented Again pill
//       ("10" / "9" / "8" / "None") that maps to `state.AGAIN` +
//       `state.NA`; replaces the old `#a8` / `#a9` / `#na-c` trio.
//       `setAgain()` is kept as an export (loadPool calls it) and
//       delegates to `setAgainSeg`.
//
//  Rote / WP chips are unchanged (they compose with Again).
// ══════════════════════════════════════════════

import state from './data.js';

import { d10, mkDie, mkChain, rollPool, cntSuc } from '../shared/dice.js';
import { skSpecs, skNineAgain } from '../data/accessors.js';
import { hasAoE } from '../data/helpers.js';
import { getCatalogueEntry } from '../data/equipment-catalogue-cache.js';
import { isCombatGearWeaponShaped, isEquipmentOnMe } from '../data/equipment-derivation.js';
// gdx.7 (#988): read the game-day flag (gdx.5) and spend from the already-
// built, already-correct tracker write path (gdx.6 supplies the cost data
// on the rule itself, via pools.js — see spendableCost below).
import { getGlobalSettings } from '../data/app-settings.js';
import { trackerAdj, trackerRead, ensureLoaded as ensureTrackerLoaded } from '../game/tracker.js';
// rlv.7 (#1039 item 2): persistent per-power modifier chips — one more
// toggleable layer on state.MOD, generated from a localStorage-backed list
// instead of hardcoded (same shape as state.WP/state.ROTE, D5).
import { loadChips, addChip, toggleChip, removeChip, clampChipValue } from '../game/power-mod-chips.js';

// ── Imports from other suite modules (will exist once extracted) ──
// showResistSec / updResist live in shared/resist.js
import { showResistSec, updResist } from '../shared/resist.js';

// ── DOM helpers (will be provided by a ui module or inlined) ──
function closePanel() {
  const overlay = document.getElementById('panel-overlay');
  if (overlay) overlay.classList.remove('on');
}

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('on'), 2500);
}

// ── SPEND ON ROLL (gdx.7, #988) ──
//
// Three pure functions, deliberately no DOM/globals, so the decision logic
// is testable without a browser. `doRoll()` and `updPool()` each call all
// three fresh, from the same state, rather than caching a combined verdict
// — the label shown and the amount actually spent can never disagree,
// because both are always the same computation.

/**
 * How much this roll would really spend: the loaded power's own
 * vitae_cost/willpower_cost (gdx.6, via pools.js — `null`/absent both mean
 * "nothing", same as `0` at this layer) plus the WP(+3) boost chip's own
 * separate 1-Willpower cost when it's toggled on. Additive, never either/or
 * — a devotion that itself costs 1 WP, rolled with the boost chip also on,
 * spends 2 WP total from two different sources. `hasPowerCost`/
 * `powerWillpowerCost` are exposed separately (review finding, Acceptance
 * Auditor: AC3/AC6) so the button label can trigger and display ONLY the
 * power's own cost — never flip into spend-mode, or claim a power cost,
 * purely because the chip is on — while the chip's own spend stays
 * distinctly labelled in the sub-line instead (updPool()). The combined
 * `vitaeCost`/`willpowerCost` total is still what's actually checked for
 * affordability and actually spent — both must be paid together or not at
 * all (AC5's "never partial").
 */
export function spendableCost(poolInfo, wpChipOn) {
  const powerVitae = poolInfo?.vitae_cost || 0;
  const powerWillpower = poolInfo?.willpower_cost || 0;
  const chipWillpower = wpChipOn ? 1 : 0;
  return {
    vitaeCost: powerVitae,
    willpowerCost: powerWillpower + chipWillpower,
    hasPowerCost: powerVitae > 0 || powerWillpower > 0,
    powerWillpowerCost: powerWillpower,
  };
}

/** Can `balance` ({vitae, willpower}) cover `cost` in full? Never partial —
 *  a roll either affords its whole real cost or it doesn't spend at all. */
export function canAffordCost(cost, balance) {
  const vitae = balance?.vitae ?? 0;
  const willpower = balance?.willpower ?? 0;
  return cost.vitaeCost <= vitae && cost.willpowerCost <= willpower;
}

/**
 * The `#roll-btn` label. Falls back to the plain dice-count label — not a
 * separate "insufficient funds" message — whenever there is nothing to
 * spend, the flag is off, or the balance can't cover the real cost in
 * full: that plain label already IS "roll without spending" (AC5), the
 * same button, same one tap, just no deduction attempted.
 *
 * Review fix (Acceptance Auditor, AC3/AC6): `wantsSpend` gates on the
 * power's OWN cost (`cost.hasPowerCost`) only — the WP-chip alone must
 * never flip a genuinely free power's button into spend-mode. The VITAE/WP
 * bits shown name only the power's own amounts (`cost.powerWillpowerCost`,
 * not the chip-inflated `cost.willpowerCost`) — the chip's own +1 WP stays
 * disclosed separately in the sub-line (updPool()), so the two sources are
 * never merged into one ambiguous figure.
 */
export function rollButtonLabel(eff, cost, gameInProgress, canAfford) {
  const isChance = eff <= 0;
  const diceLabel = isChance ? 'ROLL CHANCE DIE' : `ROLL ${eff} DICE`;
  const wantsSpend = gameInProgress && cost.hasPowerCost;
  if (!wantsSpend || !canAfford) return '✦ ' + diceLabel;
  const bits = [];
  if (cost.vitaeCost > 0) bits.push(cost.vitaeCost + ' VITAE');
  if (cost.powerWillpowerCost > 0) bits.push(cost.powerWillpowerCost + ' WP');
  return '✦ ROLL & SPEND ' + bits.join(', ');
}

/** Shared by updPool()'s label and doRoll()'s actual spend, so the two can
 *  never disagree — both call this fresh rather than one caching for the
 *  other. Reads the character CURRENTLY loaded into the roller
 *  (`state.rollChar`); `trackerRead` is a synchronous cache read.
 *
 *  Review fix (Edge Case Hunter): the original comment here claimed
 *  `trackerRead` was safe because `app.js`'s `_switchChar` always `await`s
 *  `ensureTrackerLoaded` before `rollChar` is set — false. `app.js` sets
 *  `suiteState.rollChar` at three sites; `pickChar()` (the roll tab's own
 *  character picker — the most common path in play) and one sheet-view
 *  setter do so with NO load guaranteed first. An unconfirmed character's
 *  `trackerRead` silently returns SEEDED MAX defaults (`fromCache()`'s
 *  cache-miss path), not real persisted balance — `canAffordCost` could
 *  then read a broke character as fully-funded. Fired here (fire-and-forget,
 *  a no-op if already loaded) so the cache is warmed as early as possible;
 *  `doRoll()` additionally `await`s it before the real spend, so the label
 *  painted here is best-effort but the actual spend is always correct. */
function _currentSpendDecision() {
  const cost = spendableCost(state.POOL_INFO, state.WP);
  const gameInProgress = !!getGlobalSettings()?.game_in_progress;
  const charId = state.rollChar ? String(state.rollChar._id) : null;
  if (state.rollChar) ensureTrackerLoaded(state.rollChar);
  const balance = charId ? trackerRead(charId) : null;
  const canAfford = canAffordCost(cost, balance);
  return { cost, gameInProgress, canAfford, charId };
}

/**
 * Standalone Vitae/Willpower spend, decoupled from rolling — Angelus's own
 * original ask, distinct from the roll-button spend above: "a button that
 * spends vitae and another that spends willpower for that player from
 * their totals." Reuses `trackerAdj` exactly as the roll-triggered spend
 * does (same clamp-at-0, same persistence chain) — the only new thing here
 * is the click surface itself. `#rv2-manual-spend-row` is only visible when
 * `game_in_progress` is on (updPool()'s own gate), but the same check is
 * repeated here as a real guard, not just a UI hide, so a stray click on
 * stale DOM can never spend a real resource outside a live game.
 */
async function _manualSpend(field, label) {
  if (!state.rollChar || !getGlobalSettings()?.game_in_progress) return;
  await ensureTrackerLoaded(state.rollChar);
  const charId = String(state.rollChar._id);
  const before = trackerRead(charId)?.[field] ?? 0;
  if (before <= 0) { toast('No ' + label + ' left to spend'); return; }
  await trackerAdj(charId, field, -1);
  const after = trackerRead(charId)?.[field] ?? 0;
  toast('Spent 1 ' + label + ' (' + after + ' left)');
  updPool();
}

export function spendVitae() { return _manualSpend('vitae', 'Vitae'); }
export function spendWillpower() { return _manualSpend('willpower', 'Willpower'); }

// ── RESET POOL (rlv.7 review fix — Pass 2/3a/3b) ──

/**
 * Clear ALL Roll-tab pool/chip state. Call this whenever `state.rollChar`
 * changes WITHOUT a fresh `loadPool()` immediately following (character
 * switch via `pickChar`/`openChar` in app.js, or `onSheetChar` in
 * suite/sheet.js) — otherwise the PREVIOUS character's `POOL_NAME`,
 * `powerChips` and `MOD` stay live under the NEW character.
 *
 * Review finding (Pass 2/3a/3b, reproduced live in Chromium): without this,
 * a stale chip badge from character A remains rendered and clickable after
 * switching to character B. Because `togPowerChip`/`removePowerChip` read
 * `state.rollChar` fresh at click time, clicking that stale badge persists
 * A's chip data into B's OWN localStorage slot for a pool B never loaded —
 * a real cross-character data leak, not just a stale display. `POOL_INFO`
 * has the same staleness risk (a leftover breakdown from A rendered as if
 * it were B's), so it resets here too, alongside `POOL_NAME`/`powerChips`/
 * `MOD`. `updPool()` repaints immediately so the add-mod row and any chip
 * badges disappear the moment the character changes, satisfying AC1's
 * "hidden/inert when no character or no pool is loaded" the instant a
 * switch happens, not only on the next real pool load.
 */
export function resetRollPool() {
  state.MOD = 0;
  state.POOL_INFO = null;
  state.POOL_NAME = null;
  state.powerChips = [];
  state.specBonuses = {};
  state.activeEquipBonus = null;
  state.activeWeaponId = null;
  updPool();
}

// ── LOAD POOL ──

export function loadPool(total, name, pi) {
  state.PS = Math.max(0, total);
  state.MOD = 0;
  state.specBonuses = {};
  state.activeEquipBonus = null;
  state.activeWeaponId = null;
  state.POOL_INFO = pi || null;
  // rlv.7 (#1039): restore this power's persisted mod chips, folding
  // currently-on ones into MOD — same reset-then-rebuild pattern as
  // specBonuses/activeEquipBonus above, just sourced from localStorage
  // instead of starting empty.
  state.POOL_NAME = name;
  state.powerChips = state.rollChar ? loadChips(String(state.rollChar._id), name) : [];
  state.MOD += state.powerChips.filter(c => c.on).reduce((sum, c) => sum + c.value, 0);
  // Auto-set 9-Again when the pool source grants it
  if (pi?.nineAgain) setAgain(9);
  else setAgain(10);
  // Reset Rote — player toggles manually (PT dot-5 costs 1 WP)
  if (state.ROTE) togMod('rote');
  showResistSec();
  updPool();
  const banner = document.getElementById('pool-banner');
  const cn = state.rollChar ? state.rollChar.name.split(' ')[0] : '';
  banner.textContent = cn ? cn + ' \u00B7 ' + name + ' \u00B7 ' + total + 'd' : name + ' \u00B7 ' + total + 'd';
  banner.classList.add('on');
  document.getElementById('sc-disc-lbl').textContent = '';
  document.getElementById('sc-disc-val').textContent = name;
  document.getElementById('sc-disc').classList.add('loaded');
  closePanel();
}

// ── EFFECTIVE POOL ──

export function effPool() {
  const wpBonus = state.WP ? 3 : 0;
  return state.RESIST_MODE === '-'
    ? Math.max(0, state.PS + state.MOD + wpBonus - state.RESIST_VAL)
    : state.PS + state.MOD + wpBonus;
}

// ── POOL / MOD ADJUSTMENTS ──

export function chgPool(d) {
  state.PS = Math.max(-5, Math.min(40, state.PS + d));
  updPool();
}

export function chgMod(d) {
  state.MOD = Math.max(-10, Math.min(10, state.MOD + d));
  updPool();
}

// ── UPDATE POOL DISPLAY ──

// Human-readable "again" phrase for the anchor sub-line (slice A).
function _againPhrase() {
  if (state.NA) return 'no again';
  return String(state.AGAIN) + '-again';
}

// Paint the segmented Again pill so its `on` class tracks state.AGAIN + NA
// (slice D). Safe to call when the container isn't in the DOM (v1 tab).
function _paintAgainSeg() {
  const seg = document.getElementById('rv2-again-seg');
  if (!seg) return;
  const buttons = seg.querySelectorAll('button[data-again]');
  buttons.forEach(b => {
    const val = b.dataset.again;
    const on = val === 'none'
      ? state.NA
      : (!state.NA && String(state.AGAIN) === val);
    b.classList.toggle('on', on);
  });
}

export function updPool() {
  const eff = effPool();

  // v2 stepper values (small).
  const pv = document.getElementById('pval');
  if (pv) {
    pv.textContent = state.PS <= 0 ? 'Chance' : state.PS;
    pv.className = 'rv2-stepper-val' + (state.PS <= 0 ? ' chance' : '');
  }
  const mv = document.getElementById('mval');
  if (mv) {
    const mod = state.MOD;
    mv.textContent = mod === 0 ? '0' : mod > 0 ? '+' + mod : mod;
    mv.className = 'rv2-stepper-val' + (mod > 0 ? ' pos' : mod < 0 ? ' neg' : '');
  }

  // v2 anchor: huge effective count + sub-line (slice A).
  const effEl = document.getElementById('rv2-eff');
  const unitEl = document.getElementById('rv2-eff-unit');
  const subEl = document.getElementById('rv2-sub');
  const rollBtn = document.getElementById('roll-btn');
  const isChance = eff <= 0;
  if (effEl) {
    effEl.textContent = isChance ? 'CHANCE' : String(eff);
    effEl.classList.toggle('chance', isChance);
  }
  if (unitEl) {
    unitEl.textContent = isChance ? 'die' : (eff === 1 ? 'die' : 'dice');
  }
  // gdx.7 (#988): computed once, used by both the sub-line's WP-chip
  // wording and the roll button's own label below.
  const spend = _currentSpendDecision();
  if (subEl) {
    const parts = [
      'base ' + (state.PS <= 0 ? 'chance' : state.PS),
    ];
    if (state.MOD !== 0) parts.push((state.MOD > 0 ? '+' : '') + state.MOD + ' mod');
    parts.push(_againPhrase());
    // AC6: the chip's own +3 pool boost is a separate fact from whether it
    // will ALSO really spend 1 Willpower this roll (game_in_progress) —
    // labelled distinctly from a power's own vitae_cost/willpower_cost,
    // which shows up in the roll button's own label instead, not here.
    // Review fix (Blind Hunter): also gate on spend.canAfford — without it,
    // this line claimed "(spends 1 WP)" even when the combined cost (power
    // + chip) couldn't be afforded and doRoll() would spend nothing at all,
    // disagreeing with the button's own (correctly gated) fallback label.
    if (state.WP) parts.push((spend.gameInProgress && spend.canAfford) ? 'WP +3 (spends 1 WP)' : 'WP +3');
    if (state.ROTE) parts.push('rote');
    if (state.RESIST_MODE === '-' && state.RESIST_VAL > 0) parts.push('−' + state.RESIST_VAL + ' resist');
    // U+00B7 middle-dot separator (matches sub-line separators elsewhere).
    subEl.textContent = parts.join(' · ');
  }
  if (rollBtn) {
    rollBtn.textContent = rollButtonLabel(eff, spend.cost, spend.gameInProgress, spend.canAfford);
  }

  // gdx.7 follow-up: standalone Vitae/Willpower spend, independent of
  // rolling — Angelus's actual original ask ("a button that spends vitae
  // and another that spends willpower for that player from their totals"),
  // distinct from the roll-button spend above. Same game_in_progress
  // kill-switch as the rest of this epic: a real resource spend only
  // happens live, never during downtime/testing.
  const manualRow = document.getElementById('rv2-manual-spend-row');
  if (manualRow) {
    const show = spend.gameInProgress && !!spend.charId;
    manualRow.style.display = show ? '' : 'none';
    if (show) {
      const balance = trackerRead(spend.charId) || {};
      const vBtn = document.getElementById('spend-vitae-btn');
      const wBtn = document.getElementById('spend-wp-btn');
      if (vBtn) { vBtn.textContent = '− Vitae (' + (balance.vitae ?? 0) + ')'; vBtn.disabled = (balance.vitae ?? 0) <= 0; }
      if (wBtn) { wBtn.textContent = '− WP (' + (balance.willpower ?? 0) + ')'; wBtn.disabled = (balance.willpower ?? 0) <= 0; }
    }
  }

  _paintAgainSeg();

  const el = document.getElementById('effline');
  const pi = state.POOL_INFO;

  // rlv.7 review fix (Pass 2/3b): this used to `return` here, which skipped
  // the power-chip rendering block AND the add-mod row painting below for
  // any pool with no `.attr` — a real case, not hypothetical: combat.js's
  // `quickRoll()` calls `loadPool(pool, label, { total: pool })`, a `pi`
  // with no `.attr` at all. `loadPool()` still folds a persisted chip's
  // value into `state.MOD` in that case, so the roll WAS already using it —
  // it just never rendered, leaving the ST unable to see, toggle, or remove
  // a modifier that's silently affecting a combat roll. Restructured so the
  // attr/skill/disc breakdown is skipped for a no-`.attr` pool, but chips
  // and the add-mod row still render below — the two are independent.
  const segs = [];
  let html;

  if (!pi || !pi.attr) {
    html = eff <= 0
      ? 'Effective pool: <span class="effpool-seg effpool-seg--neg">Chance die</span>'
      : 'Effective pool: <span>' + eff + (eff === 1 ? ' die' : ' dice') + '</span>';
  } else {
    if (pi.attr) segs.push('<span class="effpool-seg">' + pi.attr + ' <b>' + pi.attrV + '</b></span>');
    if (pi.skill) segs.push('<span class="effpool-seg">' + pi.skill + ' <b>' + pi.skillV + '</b></span>');
    if (pi.unskilled) segs.push('<span class="effpool-seg effpool-seg--neg">unskilled <b>' + pi.unskilled + '</b></span>');
    if (pi.discName && pi.discV) segs.push('<span class="effpool-seg">' + pi.discName + ' <b>' + pi.discV + '</b></span>');
    if (pi.meritBonus && pi.meritLabel) segs.push('<span class="effpool-seg effpool-seg--merit">' + pi.meritLabel + ' <b>+' + pi.meritBonus + '</b></span>');
    if (pi.roteEligible && !state.ROTE) segs.push('<span class="effpool-seg effpool-seg--rote" onclick="togMod(\'rote\')" title="PT dot 5: spend 1 WP for Rote quality">Rote ✓</span>');
    if (state.WP) segs.push('<span class="effpool-seg effpool-seg--wp">WP <b>+3</b></span>');
    if (state.RESIST_MODE === '-' && state.RESIST_VAL > 0) {
      segs.push('<span class="effpool-seg effpool-seg--resist">−Resist <b>' + state.RESIST_VAL + '</b></span>');
    }

    html = segs.join('<span class="effpool-sep"> + </span>');

    if (pi.skill && state.rollChar) {
      const rc = state.rollChar;
      const specs = skSpecs(rc, pi.skill);
      const na = skNineAgain(rc, pi.skill);
      if (specs.length) {
        html += '<div class="effpool-specs">' + specs.map(s => {
          const aoe = hasAoE(rc, s);
          const bonusN = na || aoe ? 2 : 1;
          const bonusLbl = na ? '2 (9-again)' : aoe ? '2 (AoE)' : '1';
          const isOn = state.specBonuses[s] !== undefined;
          const cls = 'effpool-spec' + (isOn ? ' on' : '');
          const safe = String(s).replace(/"/g, '&quot;');
          return `<span class="${cls}" data-spec="${safe}" data-bonus="${bonusN}" `
               + `onclick="togSpec(this)" title="Click to add this specialty's bonus to your modifier">`
               + `${s} <span class="effpool-spec-bonus">+${bonusLbl}</span></span>`;
        }).join('') + '</div>';
      }
    }

    // Equipment bonus chips (EQ-3): one-active-at-a-time gear bonuses
    if (pi.skill && state.rollChar) {
      const rc = state.rollChar;
      const equip = (rc.equipment || []).filter(item => {
        const entry = getCatalogueEntry(item.catalogue_id);
        // #752: 'active' is the strongest in-use state — treat it identically
        // to carried/worn for chip eligibility (Khepri's option (a) — preserves
        // 'active' as a semantically-stronger marker an ST may have already used).
        // EQC-1 (#1152): old 'equipment' bucket -> 'skill_gear', unchanged meaning.
        // EQC-2 (#1153): state check consolidated onto isEquipmentOnMe.
        return entry && entry.bucket === 'skill_gear' &&
               entry.bonus_dice > 0 &&
               entry.skill_domain === pi.skill &&
               isEquipmentOnMe(item);
      });
      if (equip.length) {
        html += '<div class="effpool-specs">' + equip.map(item => {
          const entry = getCatalogueEntry(item.catalogue_id);
          const isOn = state.activeEquipBonus &&
                       state.activeEquipBonus.catalogueId === entry.id;
          const cls = 'effpool-spec' + (isOn ? ' on' : '');
          const safe = String(entry.id).replace(/"/g, '&quot;');
          return `<span class="${cls}" data-equip="${safe}" data-bonus="${entry.bonus_dice}" `
               + `onclick="togEquipChip(this)" title="${entry.name}">`
               + `${entry.name} <span class="effpool-spec-bonus">+${entry.bonus_dice}</span></span>`;
        }).join('') + '</div>';
      }
    }
  }

  // Persistent per-power mod chips (rlv.7, #1039 item 2). Rendered
  // unconditionally (not nested in the `pi.attr` branch above) — a chip's
  // value is already folded into `state.MOD` by `loadPool()` regardless of
  // whether this pool has an attr/skill breakdown (e.g. combat.js's
  // quickRoll()), so it must stay visible/toggleable here too.
  //
  // Review fix (Pass 1, Medium): the id used to be interpolated directly
  // into the onclick attribute's own single-quoted JS argument
  // (`togPowerChip('${safeId}')`), escaped for `"` only — a chip id
  // containing an apostrophe (a malformed/imported payload; `loadChips()`
  // now also rejects those, see power-mod-chips.js) could break out of
  // that string and inject arbitrary script. Switched to this file's own
  // existing `togSpec(this)`/`togEquipChip(this)` pattern instead: the id
  // is read via `.dataset.chip` from the clicked element, never embedded
  // as executable JS text at all, so no escaping scheme can be bypassed.
  if (state.powerChips && state.powerChips.length) {
    html += '<div class="effpool-specs">' + state.powerChips.map(chip => {
      const cls = 'effpool-spec' + (chip.on ? ' on' : '');
      const safeId = String(chip.id).replace(/"/g, '&quot;');
      const safeLabel = String(chip.label).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const sign = chip.value > 0 ? '+' : '';
      return `<span class="${cls}" data-chip="${safeId}" `
           + `onclick="togPowerChip(this)" title="Click to toggle">`
           + `${safeLabel} <span class="effpool-spec-bonus">${sign}${chip.value}</span>`
           + `<span class="effpool-spec-del" onclick="event.stopPropagation();removePowerChip(this.closest('[data-chip]'))" title="Remove">×</span>`
           + `</span>`;
    }).join('') + '</div>';
  }

  el.innerHTML = html;
  updWeaponRef();

  // Add-mod row (rlv.7): static markup outside #effline's own innerHTML
  // rewrite (see the story's Dev Notes — a live text input inside this
  // rewrite would lose focus/value on every unrelated toggle), only its
  // enabled/disabled state is painted here.
  const addModRow = document.getElementById('rv2-addmod-row');
  if (addModRow) {
    const enabled = !!(state.rollChar && state.POOL_NAME);
    addModRow.classList.toggle('disabled', !enabled);
    const labelEl = document.getElementById('pmc-label');
    const valueEl = document.getElementById('pmc-value');
    const btnEl = document.getElementById('pmc-add-btn');
    if (labelEl) labelEl.disabled = !enabled;
    if (valueEl) valueEl.disabled = !enabled;
    if (btnEl) btnEl.disabled = !enabled;
  }
}

// ── SPECIALTY TOGGLE ──
//
// Click handler for the specialty badges under the effective-pool line.
// Toggling a badge on adds its dice bonus to MOD; toggling off subtracts
// the same amount. The per-spec bonus is stored in state.specBonuses so
// we can reverse the exact amount even if the displayed bonus would be
// different at toggle-off time (e.g. character data changed mid-roll).

export function togSpec(badge) {
  if (!badge) return;
  const name = badge.dataset.spec;
  const bonus = parseInt(badge.dataset.bonus, 10) || 0;
  if (!name || !bonus) return;
  const existing = state.specBonuses[name];
  if (existing !== undefined) {
    state.MOD = state.MOD - existing;
    delete state.specBonuses[name];
  } else {
    state.MOD = state.MOD + bonus;
    state.specBonuses[name] = bonus;
  }
  updPool();
}

// ── EQUIPMENT CHIP TOGGLE (EQ-3) ──

export function togEquipChip(badge) {
  if (!badge) return;
  const id = badge.dataset.equip;
  const bonus = parseInt(badge.dataset.bonus, 10) || 0;
  if (!id || !bonus) return;

  if (state.activeEquipBonus && state.activeEquipBonus.catalogueId === id) {
    state.MOD -= state.activeEquipBonus.bonus;
    state.activeEquipBonus = null;
  } else {
    if (state.activeEquipBonus) {
      state.MOD -= state.activeEquipBonus.bonus;
    }
    state.MOD += bonus;
    state.activeEquipBonus = { catalogueId: id, bonus };
  }
  updPool();
}

// ── PERSISTENT PER-POWER MOD CHIPS (rlv.7, #1039 item 2) ──

/** Add a new chip to the currently-loaded pool, on by default (AC2). Value
 *  is clamped to power-mod-chips.js's own -10..+10 cap (AC9) before it's
 *  applied — a clamped-to-0 or empty-label submission silently no-ops,
 *  matching togSpec's own silent-guard style above. Clears the add-mod
 *  row's own inputs on success, matching this file's existing direct-DOM
 *  style (e.g. togMod's rote-c/wp-c classList writes). */
export function addPowerChip(label, value) {
  if (!state.rollChar || !state.POOL_NAME) return;
  const v = clampChipValue(value);
  if (!v) return;
  const before = state.powerChips.length;
  const updated = addChip(String(state.rollChar._id), state.POOL_NAME, label, v);
  // addChip() has its own, independent empty/whitespace-label rejection —
  // if it silently no-opped (list unchanged), MOD must not be touched
  // either, or a rejected chip would still inflate the pool with no
  // visible chip and nothing persisted to explain it on reload.
  if (updated.length === before) return;
  state.powerChips = updated;
  state.MOD += v;
  const labelEl = document.getElementById('pmc-label');
  const valueEl = document.getElementById('pmc-value');
  if (labelEl) labelEl.value = '';
  if (valueEl) valueEl.value = '';
  updPool();
}

/** Sum of the on-chips' values in a chip list — shared by togPowerChip/
 *  removePowerChip so both recompute the SAME way. */
function _onSum(chips) {
  return chips.filter(c => c.on).reduce((sum, c) => sum + c.value, 0);
}

/** Toggle a chip on/off.
 *
 *  Review fix (Pass 1/2, Medium): the original version read `chip.on`
 *  from the LOCAL `state.powerChips` copy to decide the MOD sign, then
 *  separately called `toggleChip()`, which independently re-reads from
 *  `localStorage` and mutates based on THAT fresh read. If the two ever
 *  disagreed (e.g. another same-origin tab changed this same character's
 *  chips in between), the local-read sign and the storage-write outcome
 *  could point opposite ways, leaving `state.MOD` wrong. Recomputing the
 *  MOD delta as (fresh on-sum) minus (local on-sum) is correct regardless
 *  of whether local and storage agree — it reflects the NET change
 *  `state.powerChips` is about to undergo, not an assumption about which
 *  single chip caused it. */
export function togPowerChip(badge) {
  if (!badge) return;
  const id = badge.dataset.chip;
  if (!id || !state.rollChar || !state.POOL_NAME) return;
  if (!state.powerChips.some(c => c.id === id)) return;
  const before = _onSum(state.powerChips);
  const updated = toggleChip(String(state.rollChar._id), state.POOL_NAME, id);
  state.MOD += _onSum(updated) - before;
  state.powerChips = updated;
  updPool();
}

/** Permanently remove a chip (curation, distinct from toggling off).
 *  Same before/after-sum recomputation as togPowerChip, for the same
 *  reason (review fix, Pass 1/2, Medium). */
export function removePowerChip(badge) {
  if (!badge) return;
  const id = badge.dataset.chip;
  if (!id || !state.rollChar || !state.POOL_NAME) return;
  if (!state.powerChips.some(c => c.id === id)) return;
  const before = _onSum(state.powerChips);
  const updated = removeChip(String(state.rollChar._id), state.POOL_NAME, id);
  state.MOD += _onSum(updated) - before;
  state.powerChips = updated;
  updPool();
}

// ── WEAPON REFERENCE PANEL (EQ-3) ──

const COMBAT_SKILLS = ['Weaponry', 'Brawl', 'Firearms', 'Archery'];

export function updWeaponRef() {
  const panel = document.getElementById('weapon-ref');
  if (!panel) return;

  // Capture live selection before rebuilding innerHTML
  const liveSel = document.getElementById('weapon-sel');
  if (liveSel && liveSel.value) state.activeWeaponId = liveSel.value;
  else if (liveSel && !liveSel.value) state.activeWeaponId = null;

  const pi = state.POOL_INFO;
  if (!pi || !pi.skill || !COMBAT_SKILLS.includes(pi.skill) || !state.rollChar) {
    panel.style.display = 'none';
    return;
  }
  const weapons = (state.rollChar.equipment || []).filter(item => {
    // #752: 'active' is the strongest in-use state — include it in weapon-ref
    // eligibility (matches the chip predicate above).
    const entry = getCatalogueEntry(item.catalogue_id);
    // EQC-1 (#1152): 'weapon' bucket merged into 'combat_gear'; weapon-shaped
    // is identified via the shared isCombatGearWeaponShaped predicate (review
    // patch: a single-field check missed legacy weapons whose weapon_type was
    // null but damage_mod/damage_type were populated).
    // EQC-2 (#1153): state check consolidated onto isEquipmentOnMe.
    return entry && entry.bucket === 'combat_gear' && isCombatGearWeaponShaped(entry) &&
           isEquipmentOnMe(item);
  });
  if (!weapons.length) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = '';
  const prevId = state.activeWeaponId;

  const optionsHtml = weapons.map(item => {
    const e = getCatalogueEntry(item.catalogue_id);
    const sel = prevId === e.id ? ' selected' : '';
    return `<option value="${e.id}"${sel}>${e.name}</option>`;
  }).join('');

  let statsHtml = '';
  if (prevId) {
    const e = getCatalogueEntry(prevId);
    if (e) {
      const DMGTYPE = { lethal: 'Lethal', bashing: 'Bashing', aggravated: 'Aggravated' };
      const WPNTYPE = { melee: 'Melee', ranged: 'Ranged', thrown: 'Thrown' };
      const mod = e.damage_mod > 0 ? '+' + e.damage_mod : String(e.damage_mod);
      statsHtml = `<div class="trait-qual">`
               + `${mod} · ${DMGTYPE[e.damage_type] || e.damage_type} · ${WPNTYPE[e.weapon_type] || e.weapon_type}`
               + `</div>`;
    }
  }

  panel.innerHTML = `<div class="slabel">Weapon</div>`
    + `<select id="weapon-sel" class="resist-sel" onchange="updWeaponRef()">`
    + `<option value="">-- select --</option>${optionsHtml}</select>${statsHtml}`;
}

// ── AGAIN / MODIFIER TOGGLES ──

// Segmented Again pill entry point (slice D). `v` is one of
// '10' | '9' | '8' | 'none' (or the numeric variants). 'none' disables
// die explosion via state.NA; the other values set state.AGAIN and clear
// NA. Repaints the pill and the sub-line via updPool().
export function setAgainSeg(v) {
  if (v === 'none' || v === 'None') {
    state.NA = true;
  } else {
    state.NA = false;
    state.AGAIN = Number(v);
  }
  // updPool paints the seg AND the anchor sub-line so both stay in sync.
  updPool();
}

// Kept as an export because loadPool() calls it. Delegates to the new
// segmented entry point so the pill + sub-line stay in sync when a pool
// with a `nineAgain` flag is loaded.
export function setAgain(v) {
  setAgainSeg(v);
}

export function togMod(m) {
  if (m === 'rote') {
    state.ROTE = !state.ROTE;
    const el = document.getElementById('rote-c');
    if (el) el.classList.toggle('on', state.ROTE);
    updPool();
  } else if (m === 'wp') {
    state.WP = !state.WP;
    const el = document.getElementById('wp-c');
    if (el) el.classList.toggle('on', state.WP);
    updPool();
  } else {
    // 'na' — no dedicated button in v2 markup; routed through the
    // segmented pill instead. Kept for any external caller still on the
    // old chip contract.
    state.NA = !state.NA;
    updPool();
  }
}

// ── DIE DOM ELEMENTS ──

export function mkDieEl(d, delay, isX) {
  const el = document.createElement('div');
  // Exploding re-roll dice use the same success/fail colour as initial dice,
  // plus an 'ed' marker class for the chain connector styling.
  let cls = d.s ? 'die sd' : 'die fd';
  if (isX) cls += ' ed';
  if (d.x) cls += ' xd';
  el.className = cls;
  el.textContent = d.v;
  el.style.animationDelay = (delay * 40) + 'ms';
  return el;
}

export function mkColsEl(cols, base) {
  const w = document.createElement('div');
  w.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
  let delay = base;
  cols.forEach(col => {
    const ce = document.createElement('div');
    ce.className = 'dcol';
    ce.appendChild(mkDieEl(col.r, delay++, false));
    col.ch.forEach(child => {
      const conn = document.createElement('div');
      conn.className = 'xconn';
      ce.appendChild(conn);
      ce.appendChild(mkDieEl(child, delay++, true));
    });
    w.appendChild(ce);
  });
  return w;
}

// ── MAIN ROLL ──

// Review fix (Blind Hunter + Edge Case Hunter, independently): nothing
// guarded against doRoll() firing twice before the first spend's cache
// update lands (no debounce anywhere in #roll-btn's wiring — plain
// `onclick="doRoll()"` in both index.html layouts). A double-tap could
// double-charge a power's real cost. Module-level, not per-character —
// this dice roller only ever has one character loaded at a time.
let _spendInFlight = false;

export async function doRoll() {
  const eff = effPool();
  const area = document.getElementById('dice-area');
  const hdr = document.getElementById('res-hdr');
  area.innerHTML = '';
  hdr.classList.remove('on');

  // gdx.7 (#988): the cost of ACTIVATING the power is paid up front, once,
  // regardless of which of the three result branches below actually fires
  // — a chance die, a contested roll, and a standard roll all still cost
  // the same Vitae/Willpower to attempt (VtR 2e: you pay to activate, then
  // roll; a failed roll doesn't refund the cost). Recomputed fresh here
  // (not read from whatever `updPool()` last painted) so a stale label
  // can never cause a stale spend.
  //
  // Review fix (Edge Case Hunter): `state.rollChar` can be set by `app.js`'s
  // `pickChar()` (the roll tab's own picker) without ever loading the
  // tracker first — `trackerRead` would then read seeded MAX defaults, not
  // real balance. `ensureTrackerLoaded` is a no-op if already confirmed, so
  // this costs nothing on the common path and only actually awaits a
  // network round-trip the first time a given character is ever read.
  if (state.rollChar) await ensureTrackerLoaded(state.rollChar);
  const spend = _currentSpendDecision();
  if (!_spendInFlight && spend.gameInProgress && spend.canAfford && spend.charId &&
      (spend.cost.vitaeCost > 0 || spend.cost.willpowerCost > 0)) {
    _spendInFlight = true;
    try {
      // Sequenced, not fired concurrently (review fix, Edge Case Hunter):
      // two concurrent trackerAdj() calls on a not-yet-confirmed character
      // would each independently race `ensureLoaded()`, risking one write
      // clobbering the other. Awaited in turn instead — negligible cost,
      // since trackerAdj never actually suspends once confirmed (which the
      // await above guarantees it now is).
      if (spend.cost.vitaeCost > 0) await trackerAdj(spend.charId, 'vitae', -spend.cost.vitaeCost);
      if (spend.cost.willpowerCost > 0) await trackerAdj(spend.charId, 'willpower', -spend.cost.willpowerCost);
    } finally {
      _spendInFlight = false;
    }
  }

  if (eff <= 0) {
    const v = d10();
    const suc = v === 10;
    const dram = v === 1;
    const cls = dram ? 'd' : suc ? 'e' : 'f';
    const lbl = dram ? 'Dramatic Failure' : suc ? 'Success (Chance)' : 'Failure (Chance)';
    const cnt = dram ? '\u2014' : suc ? '1' : '0';
    hdr.innerHTML = `<div><span class="rcnt ${cls}">${cnt}</span><span class="rlbl ${cls}">${lbl}</span></div><div class="rverd">Chance die</div>`;
    hdr.classList.add('on');
    const del = document.createElement('div');
    del.className = 'die cd';
    del.textContent = v;
    area.appendChild(del);
    addHist('Chance', cls, lbl, cnt, 'Chance die');
    return;
  }

  const cA = rollPool(eff);
  const cB = state.ROTE ? rollPool(eff) : null;
  const sA = cntSuc(cA);
  const sB = state.ROTE ? cntSuc(cB) : 0;
  let wC, wS, lC, lS;

  if (state.ROTE && sB > sA) {
    wC = cB; wS = sB; lC = cA; lS = sA;
  } else {
    wC = cA; wS = sA;
    if (state.ROTE) { lC = cB; lS = sB; }
  }

  const mods = [];
  if (state.WP) mods.push('WP +3');
  if (state.ROTE) mods.push('rote');
  if (state.NA) mods.push('no again');

  const pi = state.POOL_INFO;
  const verdParts = [];
  if (pi && pi.attr) {
    if (pi.attr) verdParts.push(pi.attr + ' ' + pi.attrV);
    if (pi.skill) verdParts.push(pi.skill + ' ' + pi.skillV);
    if (pi.unskilled) verdParts.push('unskilled ' + pi.unskilled);
    if (pi.discName && pi.discV) verdParts.push(pi.discName + ' ' + pi.discV);
  }
  const poolStr = verdParts.length ? verdParts.join(' + ') : eff + 'd10';
  const ag = state.AGAIN;
  const verd = `${poolStr} \u00B7 ${ag}-again${mods.length ? ' \u00B7 ' + mods.join(', ') : ''}`;

  // Contested roll
  if (state.RESIST_MODE === 'v' && state.RESIST_CHAR && state.RESIST_VAL > 0) {
    const cR = rollPool(state.RESIST_VAL);
    const sR = cntSuc(cR);
    const net = wS - sR;
    const won = net > 0;
    const draw = net === 0;
    const cls = won ? (net >= 5 ? 'e' : 's') : 'f';
    const outcome = won ? (net >= 5 ? 'Exceptional Success' : 'Success') : draw ? 'Draw (Failure)' : 'Failure';
    const rcName = state.rollChar ? state.rollChar.name.split(' ')[0] : 'Roll';
    const resistName = state.RESIST_CHAR.name.split(' ')[0];
    const resistLabel = pi ? pi.resistance : '';

    hdr.innerHTML = `<div><span class="rcnt ${cls}">${won ? net : wS}</span><span class="rlbl ${cls}">${outcome}</span></div><div class="rverd">${poolStr} vs ${resistName} ${resistLabel} \u00B7 ${wS} vs ${sR}</div>`;
    hdr.classList.add('on');

    const wb = document.createElement('div');
    wb.className = 'rote-blk win';
    wb.innerHTML = `<div class="rote-lbl">${rcName} \u2014 ${wS} success${wS !== 1 ? 'es' : ''}</div>`;
    wb.appendChild(mkColsEl(wC, 0));
    area.appendChild(wb);

    const rb = document.createElement('div');
    rb.className = 'rote-blk' + (won ? '' : ' win');
    rb.innerHTML = `<div class="rote-lbl">${resistName} (resistance) \u2014 ${sR} success${sR !== 1 ? 'es' : ''}</div>`;
    rb.appendChild(mkColsEl(cR, wC.length + 2));
    area.appendChild(rb);

    addHist(eff + 'd10', cls, outcome, won ? net : wS, verd);
    return;
  }

  // Standard roll result
  const exc = wS >= 5;
  const cls = wS === 0 ? 'f' : exc ? 'e' : 's';
  const lbl = wS === 0 ? 'Failure' : exc ? 'Exceptional Success' : 'Success';
  hdr.innerHTML = `<div><span class="rcnt ${cls}">${wS}</span><span class="rlbl ${cls}">${lbl}</span></div><div class="rverd">${verd}</div>`;
  hdr.classList.add('on');

  if (state.ROTE) {
    const wb = document.createElement('div');
    wb.className = 'rote-blk win';
    wb.innerHTML = `<div class="rote-lbl">Roll 1 \u2014 ${wS} success${wS !== 1 ? 'es' : ''} (selected)</div>`;
    wb.appendChild(mkColsEl(wC, 0));
    area.appendChild(wb);

    const lb = document.createElement('div');
    lb.className = 'rote-blk';
    lb.innerHTML = `<div class="rote-lbl">Roll 2 \u2014 ${lS} success${lS !== 1 ? 'es' : ''}</div>`;
    lb.appendChild(mkColsEl(lC, wC.length + 2));
    area.appendChild(lb);
  } else {
    area.appendChild(mkColsEl(wC, 0));
  }

  addHist(eff + 'd10', cls, lbl, wS, verd);

  // Auto-reset WP after rolling (one-time spend)
  if (state.WP) {
    state.WP = false;
    document.getElementById('wp-c')?.classList.remove('on');
    updPool();
  }
}

// ── ROLL HISTORY ──

export function addHist(pool, cls, lbl, cnt, verd) {
  const h = state.hist;
  h.unshift({ pool, lbl, cnt, cls, verd });
  if (h.length > 20) h.pop();
  state.hist = h;
  renderHist();
}

export function renderHist() {
  const l = document.getElementById('hlist');
  const h = state.hist;
  if (!h.length) {
    l.innerHTML = '<div class="hempty">No rolls yet</div>';
    return;
  }
  l.innerHTML = h.map(r =>
    `<div class="hitem"><span class="hmeta">${r.verd}</span><span class="hres ${r.cls}">${r.cnt} ${r.lbl}</span></div>`
  ).join('');
}

export function clrHist() {
  state.hist = [];
  renderHist();
}
