// ══════════════════════════════════════════════
//  Sheet Tab — read-only character sheet view
// ══════════════════════════════════════════════

import state from './data.js';
import { displayName, getWillpower, redactPlayer, shDotsWithBonus, formatSpecs, hasAoE } from '../data/helpers.js';
import {
  ICONS, COV_ICON_MAP, CITY_SVG, OTHER_SVG, BP_SVG, HUM_SVG, STAT_SVG,
  RITUAL_DISCS, CORE_DISCS,
} from './data.js';
import { getRuleByKey } from '../data/loader.js';
import { prereqLabel } from '../data/prereq.js';

import {
  dots, dotsWithBonus, getAttrDots, getAttrBonus,
  skillDots, skillSpec,
  meritBase, meritDotCount, meritLookup,
  powersForDisc, otherPowers,
  toggleExp, toggleDisc, expRow
} from './sheet-helpers.js';

import {
  influenceMerits, domainMerits, standingMerits, generalMerits, manoeuvres,
  influenceTotal, calcSize, calcSpeed, calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax,
  getSkillObj
} from '../data/accessors.js';
import { xpEarned, xpSpent, xpLeft } from '../editor/xp.js';
import { trackerRead, trackerReadRaw, trackerAdj, trackerWriteField } from '../game/tracker.js';
import { calcTotalInfluence, influenceBreakdown, ssjHerdBonus, flockHerdBonus, attacheBonusDots } from '../editor/domain.js';
import { getEquipment, weaponPoolLabel, effectiveDefence } from '../data/equipment.js';
import { DICE_ICON_SVG, canRollDice } from './dice-modal.js';
import { getPool } from '../shared/pools.js';

// ── Surgical tracker repaint (no full sheet rebuild) ──

export function repaintSheetTrackers() {
  const c = state.sheetChar;
  if (!c) return;
  const charId = String(c._id);
  const cs = trackerRead(charId);
  if (!cs) return;

  const maxH  = calcHealth(c);
  const maxV  = calcVitaeMax(c);
  const maxWP = calcWillpowerMax(c);
  const maxInf = calcTotalInfluence(c);

  // Health — render with damage type marks
  const agg = cs.aggravated ?? 0, leth = cs.lethal ?? 0, bash = cs.bashing ?? 0;
  const healthBoxes = document.getElementById('tb-health');
  const healthNum = document.getElementById('tn-health');
  if (healthBoxes) {
    const disp = Math.min(maxH, 15);
    let hb = '';
    for (let i = 0; i < disp; i++) {
      let cls = 'tbox', mark = '';
      if (i < agg)                    { cls += ' tbox-agg';     mark = '<svg class="tbox-mark" viewBox="0 0 20 20"><line x1="3" y1="17" x2="17" y2="3"/><line x1="3" y1="3" x2="17" y2="17"/><line x1="10" y1="2" x2="10" y2="18"/></svg>'; }
      else if (i < agg + leth)        { cls += ' tbox-lethal';  mark = '<svg class="tbox-mark" viewBox="0 0 20 20"><line x1="3" y1="17" x2="17" y2="3"/><line x1="3" y1="3" x2="17" y2="17"/></svg>'; }
      else if (i < agg + leth + bash) { cls += ' tbox-bashing'; mark = '<svg class="tbox-mark" viewBox="0 0 20 20"><line x1="4" y1="16" x2="16" y2="4"/></svg>'; }
      else                            { cls += ' health-filled'; }
      hb += `<div class="${cls}" data-tracker="health" data-idx="${i}" data-max="${disp}" data-filled="health-filled">${mark}</div>`;
    }
    healthBoxes.innerHTML = hb;
  }
  if (healthNum) {
    const dmgTotal = agg + leth + bash;
    const legend = dmgTotal > 0
      ? ` <span class="sh-health-legend">${agg ? `<span class="sh-hl-agg">${agg}A</span>` : ''}${leth ? `<span class="sh-hl-let">${leth}L</span>` : ''}${bash ? `<span class="sh-hl-bash">${bash}B</span>` : ''}</span>`
      : '';
    healthNum.innerHTML = `${maxH - dmgTotal}/${maxH}${legend}`;
  }

  // Vitae, WP, Influence — simple filled/empty
  const simple = {
    vitae:  { cur: Math.max(0, Math.min(cs.vitae ?? maxV, maxV)),       max: maxV,   cls: 'vitae-filled' },
    wp:     { cur: Math.max(0, Math.min(cs.willpower ?? maxWP, maxWP)), max: maxWP,  cls: 'wp-filled' },
    inf:    { cur: Math.max(0, Math.min(cs.inf ?? maxInf, maxInf)),     max: maxInf, cls: 'inf-filled' },
  };

  for (const [type, { cur, max, cls }] of Object.entries(simple)) {
    const boxesEl = document.getElementById('tb-' + type);
    const numEl   = document.getElementById('tn-' + type);
    if (boxesEl) {
      const disp = Math.min(max, 15);
      boxesEl.innerHTML = Array.from({ length: disp }, (_, i) =>
        `<div class="tbox${i < cur ? ' ' + cls : ''}" data-tracker="${type}" data-idx="${i}" data-max="${disp}" data-filled="${cls}"></div>`
      ).join('');
    }
    if (numEl) {
      const infoBtn = numEl.querySelector('.sh-tracker-info-btn');
      numEl.textContent = cur + '/' + max;
      if (infoBtn) numEl.appendChild(infoBtn);
    }
  }
}

// ── Sheet character selection ──

export function onSheetChar(name) {
  if (!name) {
    state.sheetChar = null;
    document.getElementById('sh-empty').style.display = '';
    document.getElementById('sh-content-suite').style.display = 'none';
    return;
  }
  state.sheetChar = state.chars.find(c => c.name === name) || null;
  if (!state.sheetChar) return;
  state.rollChar = state.sheetChar;
  document.getElementById('sh-empty').style.display = 'none';
  document.getElementById('sh-content-suite').style.display = '';
  renderSheet();
}

// ── Main render ──

export function renderSheet() {
  state.openExpId = null;
  const c = state.sheetChar;
  const el = document.getElementById('sh-content-suite');
  // Split-tab containers (phone UX — Stats / Skills / Powers)
  const statsEl  = document.getElementById('stats-content');
  const skillsEl = document.getElementById('skills-content');
  const powersEl = document.getElementById('powers-content');
  const infoEl   = document.getElementById('info-content');
  if (!c) {
    if (el) el.innerHTML = '';
    if (statsEl)  statsEl.innerHTML = '';
    if (skillsEl) skillsEl.innerHTML = '';
    if (powersEl) powersEl.innerHTML = '';
    if (infoEl)   infoEl.innerHTML = '';
    return;
  }

  const bl = c.bloodline && c.bloodline !== '\u00AC' ? c.bloodline : '';
  const _showDice = canRollDice(c);
  const st = c.status || {};
  const clanKey = (c.clan || '').toLowerCase().replace(/[^a-z]/g, '');
  const covKey = (c.covenant || '').toLowerCase().replace(/[^a-z]/g, '');
  const clanSvg = ICONS[clanKey] || '';
  const covSvg = ICONS[COV_ICON_MAP[covKey] || covKey] || '';
  const wp = getWillpower(c);

  // ── Separate curse from banes ──
  const allBanes = c.banes || [];
  const curseIdx = allBanes.findIndex(b => b.name.toLowerCase().includes('curse'));
  const curse = curseIdx >= 0 ? allBanes[curseIdx] : null;
  const regularBanes = allBanes.filter((_, i) => i !== curseIdx);

  let html = '';
  let infoHtml = '';

  // ── INFO (character identity, meta, covenant strip) ──
  infoHtml += `<div class="sh-char-hdr">`;

  // Name row
  infoHtml += `<div class="sh-namerow">
    <div class="sh-char-name">${displayName(c)}</div>
    <div class="sh-player-row">
      <span class="sh-char-player">${redactPlayer(c.player || '')}${c.pronouns ? ' \u00B7 ' + c.pronouns : ''}</span>
      <span class="sh-xp-badge">XP ${xpLeft(c)}/${xpEarned(c)}</span>
    </div>
    ${c.concept ? `<div class="sh-char-concept" style="margin-top:4px">${c.concept}</div>` : ''}
  </div>`;

  // Faction display moved to Status tab (personal status cards)

  // Meta rows: mask, dirge, curse/bane, touchstones, embrace, apparent age, features
  infoHtml += `<div class="sh-char-meta">`;

  // Mask
  if (c.mask) {
    const body = (wp.mask_1wp ? `<div><span class="exp-wp-lbl">1 WP</span> ${wp.mask_1wp}</div>` : '') +
                 (wp.mask_all ? `<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ${wp.mask_all}</div>` : '');
    infoHtml += expRow('mask', 'Mask', c.mask, body);
  }
  // Dirge
  if (c.dirge) {
    const body = (wp.dirge_1wp ? `<div><span class="exp-wp-lbl">1 WP</span> ${wp.dirge_1wp}</div>` : '') +
                 (wp.dirge_all ? `<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ${wp.dirge_all}</div>` : '');
    infoHtml += expRow('dirge', 'Dirge', c.dirge, body);
  }
  // Curse + Banes
  if (curse) infoHtml += expRow('curse', 'Curse', curse.name, `<div>${curse.effect || ''}</div>`);
  regularBanes.forEach((b, i) => {
    infoHtml += expRow('bane' + i, 'Bane', b.name, `<div>${b.effect || ''}</div>`);
  });
  // Touchstones \u2014 NPCR.4: prefer server-enriched _touchstones_resolved
  // (Shape B) when present; fall back to legacy touchstones[] otherwise.
  const hum = c.humanity || 0;
  if (Array.isArray(c._touchstones_resolved) && c._touchstones_resolved.length) {
    const resolved = [...c._touchstones_resolved].sort((a, b) => (a.humanity || 0) - (b.humanity || 0));
    const tsBody = resolved.map(t => {
      const attached = t.humanity != null && hum >= t.humanity;
      const humLbl = t.humanity != null ? `Humanity ${t.humanity}` : 'Humanity \u2014';
      const attLbl = t.humanity != null ? (attached ? 'Attached' : 'Detached') : '';
      const name = t.npc_name || '(unknown)';
      return `<div class="exp-ts-row">
        <span class="exp-ts-hum">${humLbl}${attLbl ? ` \u2014 <span style="color:${attached ? 'rgba(140,200,140,.9)' : 'var(--txt3)'};font-style:normal">${attLbl}</span>` : ''}</span>
        <span class="exp-ts-name">${name}${t.state ? ` <span class="exp-ts-desc">(${t.state})</span>` : ''}</span>
      </div>`;
    }).join('');
    infoHtml += expRow('touchstones', 'Touchstones', '', tsBody);
  } else if (!Array.isArray(c.touchstone_edge_ids)) {
    // Legacy fallback \u2014 pre-migration characters still show the old text list.
    const ts = c.touchstones || [];
    if (ts.length) {
      const tsBody = ts.map(t => {
        const attached = hum >= t.humanity;
        return `<div class="exp-ts-row">
          <span class="exp-ts-hum">Humanity ${t.humanity} \u2014 <span style="color:${attached ? 'rgba(140,200,140,.9)' : 'var(--txt3)'};font-style:normal">${attached ? 'Attached' : 'Detached'}</span></span>
          <span class="exp-ts-name">${t.name}${t.desc ? ` <span class="exp-ts-desc">(${t.desc})</span>` : ''}</span>
        </div>`;
      }).join('');
      infoHtml += expRow('touchstones', 'Touchstones', '', tsBody);
    }
  }
  // When touchstone_edge_ids is present but _touchstones_resolved is empty,
  // the character has opted into Shape B with no touchstones set yet \u2014 render nothing.
  // Embrace + Apparent Age
  if (c.date_of_embrace || c.apparent_age) {
    infoHtml += `<div class="sh-meta-pair">`;
    if (c.date_of_embrace) {
      const dedDisp = new Date(c.date_of_embrace + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      infoHtml += `<div class="sh-meta-row"><span class="sh-meta-lbl">Embrace</span><span class="sh-meta-val">${dedDisp}</span></div>`;
    }
    if (c.apparent_age) {
      infoHtml += `<div class="sh-meta-row"><span class="sh-meta-lbl">App. Age</span><span class="sh-meta-val">${c.apparent_age}</span></div>`;
    }
    infoHtml += `</div>`;
  }
  // Features
  if (c.features) {
    infoHtml += `<div class="sh-meta-row"><span class="sh-meta-lbl">Features</span><span class="sh-meta-val">${c.features}</span></div>`;
  }

  infoHtml += `</div>`; // end sh-char-meta
  infoHtml += `</div>`; // end sh-char-hdr

  // Covenant strip moved to Status tab

  // ── STATS STRIP ──
  html += `<div class="sh-stats-strip">
    <div class="sh-stat-cell"><div class="sh-stat-icon">${BP_SVG}<span class="sh-stat-n">${c.blood_potency || 1}</span></div><div class="sh-stat-lbl">BP</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${HUM_SVG}<span class="sh-stat-n">${c.humanity || 0}</span></div><div class="sh-stat-lbl">Humanity</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${STAT_SVG}<span class="sh-stat-n">${calcSize(c)}</span></div><div class="sh-stat-lbl">Size</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${STAT_SVG}<span class="sh-stat-n">${calcSpeed(c)}</span></div><div class="sh-stat-lbl">Speed</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${STAT_SVG}<span class="sh-stat-n">${calcDefence(c)}</span></div><div class="sh-stat-lbl">Defence</div></div>
  </div>`;

  // ── TRACKERS ──
  const maxH  = calcHealth(c);
  const maxV  = calcVitaeMax(c);
  const maxWP = calcWillpowerMax(c);
  const maxInf = calcTotalInfluence(c);

  // Load from canonical tracker store (keyed by _id)
  const charId = String(c._id);

  // One-time migration: seed canonical store from old tm_tracker_{name} if not yet present
  if (!trackerReadRaw(charId)) {
    const oldKey = 'tm_tracker_' + c.name;
    try {
      const old = JSON.parse(localStorage.getItem(oldKey) || 'null');
      if (old) {
        const maxD = maxH - (old.health ?? maxH);
        trackerWriteField(charId, 'vitae',     Math.max(0, Math.min(old.vitae  ?? maxV,  maxV)));
        trackerWriteField(charId, 'willpower', Math.max(0, Math.min(old.wp     ?? maxWP, maxWP)));
        trackerWriteField(charId, 'lethal',    Math.max(0, Math.min(maxD,                maxH)));
        trackerWriteField(charId, 'inf',       Math.max(0, Math.min(old.inf    ?? maxInf, maxInf)));
      }
    } catch (e) { /* ignore */ }
  }

  const cs = trackerRead(charId);
  const tState = {
    vitae:  Math.max(0, Math.min(cs.vitae      ?? maxV,  maxV)),
    wp:     Math.max(0, Math.min(cs.willpower  ?? maxWP, maxWP)),
    health: Math.max(0, maxH - (cs.bashing ?? 0) - (cs.lethal ?? 0) - (cs.aggravated ?? 0)),
    inf:    Math.max(0, Math.min(cs.inf         ?? maxInf, maxInf)),
  };

  const TRACKER_LABELS = { health: 'Health', vitae: 'Vitae', wp: 'Willpower', inf: 'Influence' };

  // Health box row — shows bashing (/), lethal (X), aggravated (X|) marks per VtR rules
  function mkHealthRow(agg, leth, bash, max) {
    const disp = Math.min(max, 15);
    const healthy = Math.max(0, disp - agg - leth - bash);
    let boxes = '';
    for (let i = 0; i < disp; i++) {
      let cls = 'tbox', mark = '';
      if (i < agg)                    { cls += ' tbox-agg';     mark = '<svg class="tbox-mark" viewBox="0 0 20 20"><line x1="3" y1="17" x2="17" y2="3"/><line x1="3" y1="3" x2="17" y2="17"/><line x1="10" y1="2" x2="10" y2="18"/></svg>'; }
      else if (i < agg + leth)        { cls += ' tbox-lethal';  mark = '<svg class="tbox-mark" viewBox="0 0 20 20"><line x1="3" y1="17" x2="17" y2="3"/><line x1="3" y1="3" x2="17" y2="17"/></svg>'; }
      else if (i < agg + leth + bash) { cls += ' tbox-bashing'; mark = '<svg class="tbox-mark" viewBox="0 0 20 20"><line x1="4" y1="16" x2="16" y2="4"/></svg>'; }
      else                            { cls += ' health-filled'; }
      boxes += `<div class="${cls}" data-tracker="health" data-idx="${i}" data-max="${disp}" data-filled="health-filled">${mark}</div>`;
    }
    const dmgTotal = agg + leth + bash;
    const legend = dmgTotal > 0
      ? `<span class="sh-health-legend">${agg ? `<span class="sh-hl-agg">${agg}A</span>` : ''}${leth ? `<span class="sh-hl-let">${leth}L</span>` : ''}${bash ? `<span class="sh-hl-bash">${bash}B</span>` : ''}</span>`
      : '';
    return `<div class="sh-tracker-row">
      <div class="sh-tracker-lbl">Health</div>
      <div class="sh-tracker-boxes" id="tb-health">${boxes}</div>
      <div class="sh-tracker-num" id="tn-health">${max - dmgTotal}/${max}${legend}</div>
    </div>`;
  }

  function mkBoxRow(type, current, max, filledCls, infoHtml) {
    const disp = Math.min(max, 15);
    const boxes = Array.from({ length: disp }, (_, i) => {
      const filled = i < current;
      return `<div class="tbox${filled ? ' ' + filledCls : ''}" data-tracker="${type}" data-idx="${i}" data-max="${disp}" data-filled="${filledCls}"></div>`;
    }).join('');
    const infoBtn = infoHtml
      ? `<button class="sh-tracker-info-btn" data-info-type="${type}" title="Breakdown">?</button>`
      : '';
    const infoPopover = infoHtml
      ? `<div class="sh-tracker-popover" id="popover-${type}" style="display:none">${infoHtml}</div>`
      : '';
    return `<div class="sh-tracker-row">
      <div class="sh-tracker-lbl">${TRACKER_LABELS[type] || type}</div>
      <div class="sh-tracker-boxes" id="tb-${type}">${boxes}</div>
      <div class="sh-tracker-num" id="tn-${type}">${current}/${max}${infoBtn}</div>
      ${infoPopover}
    </div>`;
  }

  const bdLines = influenceBreakdown(c);
  const infPopoverHtml = bdLines.length
    ? bdLines.map(l => `<span class="sh-inf-merit">${l}</span>`).join('')
    : '';

  html += `<div class="sh-tracker-block" id="tracker-block">
    ${mkHealthRow(cs.aggravated ?? 0, cs.lethal ?? 0, cs.bashing ?? 0, maxH)}
    ${mkBoxRow('vitae', tState.vitae, maxV, 'vitae-filled')}
    ${mkBoxRow('wp', tState.wp, maxWP, 'wp-filled')}
    ${maxInf > 0 ? mkBoxRow('inf', tState.inf, maxInf, 'inf-filled', infPopoverHtml) : ''}
  </div>`;

  // ── Split point: stats content ends here ──
  const statsHtml = html;
  html = '';

  // ── BODY ──
  html += `<div class="sh-body">`;

  // Attributes + Skills combined carousel (Mental / Physical / Social)
  const CATEGORIES = [
    { label: 'Mental',   attrs: ['Intelligence', 'Wits', 'Resolve'],
      skills: ['Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science'] },
    { label: 'Physical', attrs: ['Strength', 'Dexterity', 'Stamina'],
      skills: ['Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry'] },
    { label: 'Social',   attrs: ['Presence', 'Manipulation', 'Composure'],
      skills: ['Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge'] },
  ];

  html += `<div class="sh-sec">`;
  // Badge indicators above carousel
  html += `<div class="attr-carousel-badges">${CATEGORIES.map((cat, i) =>
    `<span class="attr-carousel-badge${i === 0 ? ' active' : ''}" data-carousel-idx="${i}">${cat.label}</span>`
  ).join('')}</div>`;
  // Carousel container
  html += `<div class="attr-skills-carousel" id="attr-carousel">`;
  CATEGORIES.forEach(cat => {
    html += `<div class="attr-skills-card">`;
    // Attributes block
    html += `<div class="attr-cell"><div class="attr-group-hd">${cat.label} Attributes</div>`;
    cat.attrs.forEach(a => {
      const base = getAttrDots(c, a), bonus = getAttrBonus(c, a);
      html += `<div class="attr-row-item"><span class="attr-name">${a}</span><span class="attr-dots">${dotsWithBonus(base, bonus)}</span></div>`;
    });
    html += `</div>`;
    // Skills block — matches desktop view: PT/MCI bonus dots shown hollow,
    // 9-Again labelled with source (PT/OHM), specs formatted with AoE highlight
    html += `<div class="skill-col-block"><div class="attr-group-hd">${cat.label} Skills</div>`;
    cat.skills.forEach(s => {
      const sk = getSkillObj(c, s);
      const d = sk.dots, bn = sk.bonus;
      const sp = (sk.specs || []).length ? formatSpecs(c, sk.specs) : '';
      const na = sk.nine_again;
      const ptNa = c._pt_nine_again_skills?.has(s);
      const ohmNa = c._ohm_nine_again_skills?.has(s);
      const ptBn = c._pt_dot4_bonus_skills?.has(s) ? 1 : 0;
      const mciBn = c._mci_dot3_skills?.has(s) ? 1 : 0;
      const totalBn = bn + ptBn + mciBn;
      const hasDots = d > 0 || totalBn > 0;
      const dotStr = hasDots ? shDotsWithBonus(d, totalBn) : '\u2013';
      const naLabel = na ? '9-Again' : ptNa ? '9-Again (PT)' : ohmNa ? '9-Again (OHM)' : '';
      const _diceBtn = (_showDice && hasDots) ? `<span class="skill-dice-btn" onclick="openDiceModal('skill','${s}')" title="Roll ${s}">${DICE_ICON_SVG}</span>` : '';
      html += `<div class="skill-row${hasDots ? ' has-dots' : ''}">
        <div class="skill-row-top">
          <div class="skill-name-wrap">
            <span class="skill-name">${s}</span>
            ${sp ? `<span class="skill-spec">${sp}</span>` : ''}
          </div>
          <div class="skill-dots-wrap">
            <span class="${hasDots ? 'skill-dots' : 'skill-zero'}">${dotStr}</span>
            ${naLabel ? `<span class="skill-na${ptNa || ohmNa ? ' pt-na' : ''}">${naLabel}</span>` : ''}
          </div>
        </div>
        ${_diceBtn ? `<div class="skill-row-actions">${_diceBtn}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
    html += `</div>`; // end card
  });
  html += `</div></div>`;

  // ── Split point: skills content ends here ──
  const skillsHtml = html;
  html = '';

  // ── Powers -- four sections ──

  function dotsMixed(purchased, bonus) {
    if (!purchased && !bonus) return '';
    return '<span class="trait-dots">'
      + '<span class="pointed"></span>'.repeat(purchased)
      + '<span class="pointed hollow"></span>'.repeat(bonus)
      + '</span>';
  }

  if (c.disciplines && Object.keys(c.disciplines).length) {

    function renderDiscRow(d, r, nameClass) {
      const discPowers = powersForDisc(c.powers || [], d, r);
      const hasPowers = discPowers.length > 0;
      const id = 'disc-' + c.name.replace(/[^a-z]/gi, '') + d.replace(/[^a-z]/gi, '');
      let drawerHtml = '';
      discPowers.forEach(p => {
        const _pName = (p.name || '').replace(/'/g, "\\'");
        const _pPool = p.name ? getPool(c, p.name) : null;
        const _pHasRoll = _pPool && !_pPool.noRoll && _pPool.total !== undefined;
        const _pDice = (_showDice && _pHasRoll) ? `<span class="disc-power-dice" onclick="event.stopPropagation();openDiceModal('power','${_pName}')" title="Roll ${_pName}">${DICE_ICON_SVG}</span>` : '';
        drawerHtml += `<div class="disc-power">
          <div class="disc-power-name">${p.name || ''}${_pDice}</div>
          ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
          <div class="disc-power-effect">${p.effect || ''}</div>
        </div>`;
      });
      if (d === 'Auspex' && r >= 1) {
        drawerHtml += `<button class="auspex-insight-btn" onclick="openPanel('auspex')">Auspex Insight \u203A</button>`;
      }
      const nCls = nameClass ? `trait-name ${nameClass}` : 'trait-name';
      const dTag = r ? `<span class="trait-dots">${dots(r)}</span>` : '';
      const isExpandable = hasPowers || (d === 'Auspex' && r >= 1);
      const inner = `<div class="trait-row"><div class="trait-main"><span class="${nCls}">${d}</span><div class="trait-right">${dTag}${isExpandable ? '<span class="disc-tap-arr">\u203A</span>' : ''}</div></div></div>`;
      if (!isExpandable) return `<div class="disc-tap-row">${inner}</div>`;
      return `<div class="disc-tap-row" id="disc-row-${id}" onclick="toggleDisc('${id}')">${inner}</div>
        <div class="disc-drawer" id="disc-drawer-${id}">${drawerHtml}</div>`;
    }

    const discEntries = Object.entries(c.disciplines).filter(([, r]) => (r?.dots || 0) > 0).sort(([a], [b]) => a.localeCompare(b));
    const coreDiscs = discEntries.filter(([d]) => CORE_DISCS.includes(d));
    const ritualDiscs = discEntries.filter(([d]) => RITUAL_DISCS.includes(d));

    // 1. Disciplines
    if (coreDiscs.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Disciplines</div><div class="disc-list">`;
      coreDiscs.forEach(([d, r]) => { html += renderDiscRow(d, r?.dots || 0, null); });
      html += `</div></div>`;
    }

    // 2. Devotions
    const others = otherPowers(c);
    const devotionPowers = others.filter(p => p.category === 'devotion');
    if (devotionPowers.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Devotions</div><div class="disc-list">`;
      devotionPowers.forEach((p, i) => {
        const gid = 'dev' + c.name.replace(/[^a-z]/gi, '') + i;
        const _devName = (p.name || '').replace(/'/g, "\\'");
        const _devPool = p.name ? getPool(c, p.name) : null;
        const _devHasRoll = _devPool && !_devPool.noRoll && _devPool.total !== undefined;
        const _devDice = (_showDice && _devHasRoll) ? `<span class="disc-power-dice" onclick="event.stopPropagation();openDiceModal('power','${_devName}')" title="Roll ${_devName}">${DICE_ICON_SVG}</span>` : '';
        const inner = `<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">${p.name || ''}</span>${_devDice}<div class="trait-right"><span class="disc-tap-arr">\u203A</span></div></div></div>`;
        html += `<div class="disc-tap-row" id="disc-row-${gid}" onclick="toggleDisc('${gid}')">${inner}</div>
          <div class="disc-drawer" id="disc-drawer-${gid}"><div class="disc-power">
            ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
            <div class="disc-power-effect">${p.effect || ''}</div>
          </div></div>`;
      });
      html += `</div></div>`;
    }

    // 3. Blood Sorcery (Cruac, Theban)
    if (ritualDiscs.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">`;
      ritualDiscs.forEach(([d, r]) => { html += renderDiscRow(d, r?.dots || 0, 'sorcery'); });
      html += `</div></div>`;
    }

    // 4. Rites (Cruac / Theban — stored on c.powers)
    const rites = others.filter(p => p.category === 'rite');
    if (rites.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Rites</div><div class="disc-list">`;
      rites.forEach((p, i) => {
        const gid = 'rite' + c.name.replace(/[^a-z]/gi, '') + i;
        const _riteName = (p.name || '').replace(/'/g, "\\'");
        const _ritePool = p.name ? getPool(c, p.name) : null;
        const _riteHasRoll = _ritePool && !_ritePool.noRoll && _ritePool.total !== undefined;
        const _riteDice = (_showDice && _riteHasRoll) ? `<span class="disc-power-dice" onclick="event.stopPropagation();openDiceModal('power','${_riteName}')" title="Roll ${_riteName}">${DICE_ICON_SVG}</span>` : '';
        const levelDots = p.level ? `<span class="trait-dots">${dots(p.level)}</span>` : '';
        const tradSub = p.tradition ? `<div class="trait-sub"><span class="trait-qual dim">${p.tradition}</span></div>` : '';
        const inner = `<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">${p.name}</span>${_riteDice}<div class="trait-right">${levelDots}<span class="disc-tap-arr">\u203A</span></div></div>${tradSub}</div>`;
        html += `<div class="disc-tap-row" id="disc-row-${gid}" onclick="toggleDisc('${gid}')">${inner}</div>
          <div class="disc-drawer" id="disc-drawer-${gid}"><div class="disc-power">
            ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
            <div class="disc-power-effect">${p.effect || ''}</div>
          </div></div>`;
      });
      html += `</div></div>`;
    }

    // 5. Pacts (Oaths of the Notary, Carthian Law)
    const pacts = others.filter(p => p.category === 'pact');
    if (pacts.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Pacts</div><div class="disc-list">`;
      pacts.forEach((p, i) => {
        const gid = 'pact' + c.name.replace(/[^a-z]/gi, '') + i;
        const _pactName = (p.name || '').replace(/'/g, "\\'");
        const _pactPool = p.name ? getPool(c, p.name) : null;
        const _pactHasRoll = _pactPool && !_pactPool.noRoll && _pactPool.total !== undefined;
        const _pactDice = (_showDice && _pactHasRoll) ? `<span class="disc-power-dice" onclick="event.stopPropagation();openDiceModal('power','${_pactName}')" title="Roll ${_pactName}">${DICE_ICON_SVG}</span>` : '';
        const inner = `<div class="trait-row"><div class="trait-main"><span class="trait-name secondary">${p.name}</span>${_pactDice}<div class="trait-right"><span class="disc-tap-arr">\u203A</span></div></div></div>`;
        html += `<div class="disc-tap-row" id="disc-row-${gid}" onclick="toggleDisc('${gid}')">${inner}</div>
          <div class="disc-drawer" id="disc-drawer-${gid}"><div class="disc-power">
            ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
            <div class="disc-power-effect">${p.effect || ''}</div>
          </div></div>`;
      });
      html += `</div></div>`;
    }
  }

  // ── Influence Merits ──
  const inflMerits = influenceMerits(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (inflMerits.length) {
    const _inflTip = influenceBreakdown(c).join('\n');
    const _inflTotal = calcTotalInfluence(c);
    html += `<div class="sh-sec"><div class="sh-sec-title" title="${_inflTip}">Influence Merits <span style="font-size:11px;color:var(--accent);letter-spacing:0">(${_inflTotal} inf)</span></div><div class="merit-list">`;

    const nonContacts = inflMerits.filter(m => m.name !== 'Contacts');
    const contactsMerits = inflMerits.filter(m => m.name === 'Contacts');

    nonContacts.forEach((m, i) => {
      const area = (m.area || '').trim() || null;
      const ghoul = m.name === 'Retainer' && m.ghoul ? ' (ghoul)' : '';
      const tags = m._grant_sources || [];
      const grantTag = tags.length ? `<span class="gen-granted-tag-view">${tags.join(', ')}</span>` : '';
      const meritKey = area ? m.name + ' (' + area + ')' : m.name;
      const attBonus = attacheBonusDots(c, meritKey);
      const purch = (m.cp || 0) + (m.xp || 0);
      const bon = (m.free_mci || 0) + (m.free_vm || 0) + (m.free_ohm || 0) + (m.free_lk || 0)
               + (m.free_inv || 0) + (m.free_bloodline || 0) + (m.free_pet || 0)
               + (m.free_pt || 0) + (m.free_sw || 0) + attBonus;
      const dotH = (purch || bon)
        ? dotsMixed(purch, bon)
        : (m.rating ? `<span class="trait-dots">${dots(m.rating)}</span>` : '');
      const label = area ? m.name + ' (' + area + ghoul + ')' : m.name + ghoul;
      html += renderMeritRow({ name: label, rating: 0 }, 'infl', i, dotH + grantTag);
    });

    if (contactsMerits.length) {
      let totalPurch = 0, totalRating = 0;
      const allSpheres = [];
      contactsMerits.forEach(m => {
        totalPurch += (m.cp || 0) + (m.xp || 0);
        totalRating += (m.rating || 0);
        if (m.spheres && m.spheres.length) allSpheres.push(...m.spheres);
        else if (m.area) allSpheres.push(m.area.trim());
        else if (m.qualifier) allSpheres.push(...m.qualifier.split(/,\s*/).filter(Boolean));
      });
      const cAttBonus = attacheBonusDots(c, 'Contacts' + (allSpheres.length ? ' (' + [...new Set(allSpheres.filter(Boolean))].join(', ') + ')' : ''));
      totalRating = Math.min(5, totalRating) + cAttBonus;
      const cPurch = Math.min(totalPurch, totalRating);
      const cBon = Math.max(0, totalRating - cPurch);
      const sp = [...new Set(allSpheres.filter(Boolean))].join(', ');
      html += renderMeritRow({ name: 'Contacts' + (sp ? ' (' + sp + ')' : ''), rating: 0 }, 'infl', 'contacts', dotsMixed(cPurch, cBon));
    }

    html += `<div class="infl-total" title="${_inflTip}">Total Influence: <span class="inf-n">${_inflTotal}</span></div>`;
    html += `</div></div>`;
  }

  // ── Domain Merits ──
  const domMerits = domainMerits(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (domMerits.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Domain Merits</div><div class="merit-list">`;
    domMerits.forEach(m => {
      const domKey = m.area ? m.name + ' (' + m.area + ')' : m.name;
      const attBonus = attacheBonusDots(c, domKey);
      const hasPartners = (m.shared_with || []).length > 0;
      if (hasPartners) {
        const own = (m.cp || 0) + (m.free_mci || 0) + (m.free_bloodline || 0)
                  + (m.free_pet || 0) + (m.free_vm || 0) + (m.free_lk || 0)
                  + (m.free_ohm || 0) + (m.free_inv || 0) + (m.xp || 0) + attBonus;
        let partnerDots = 0;
        for (const pName of m.shared_with) {
          const p = (state.chars || []).find(ch => ch.name === pName);
          if (p) {
            const pm = (p.merits || []).find(pm => pm.category === 'domain' && pm.name === m.name);
            if (pm) partnerDots += (pm.cp || 0) + (pm.free_mci || 0) + (pm.free_bloodline || 0) + (pm.xp || 0);
          }
        }
        if (partnerDots === 0 && m._partner_dots > 0) partnerDots = m._partner_dots;
        const total = Math.min(5, own + partnerDots);
        const ownCapped = Math.min(own, total);
        const hollow = Math.max(0, total - ownCapped);
        const dotH = dotsMixed(ownCapped, hollow);
        html += `<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">${m.name}</span><div class="trait-right">${dotH}<span class="trait-qual" style="font-size:10px">Shared</span></div></div></div></div>`;
      } else {
        const purch = (m.cp || 0) + (m.xp || 0);
        const ssjB = m.name === 'Herd' ? ssjHerdBonus(c) : 0;
        const flockB = m.name === 'Herd' ? flockHerdBonus(c) : 0;
        const derived = ssjB + flockB + attBonus;
        const totalDots = purch + derived + Math.max(0, (m.rating || 0) - purch);
        const bon = Math.max(0, totalDots - purch);
        html += `<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">${m.name}</span><div class="trait-right">${dotsMixed(purch, bon)}</div></div></div></div>`;
      }
    });
    html += `</div></div>`;
  }

  // ── Standing Merits ──
  const stndMerits = standingMerits(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (stndMerits.length) {
    const _pd = '<span class="pointed"></span>';
    const tierDotStr = [_pd, _pd.repeat(2), _pd.repeat(3), _pd.repeat(4), _pd.repeat(5)];
    html += `<div class="sh-sec"><div class="sh-sec-title">Standing Merits</div><div class="stand-list">`;
    stndMerits.forEach((m, mi) => {
      const sid = 'smt' + mi;
      const qualifier = m.cult_name || m.qualifier || m.role || '';
      // Build drawer content
      let drawerHtml = '';
      if (m.name === 'Mystery Cult Initiation' && m.rating > 0) {
        const tg = m.tier_grants || [];
        const d1c = m.dot1_choice || 'merits', d3c = m.dot3_choice || 'merits', d5c = m.dot5_choice || 'merits';
        drawerHtml += '<div class="mci-tier-list">';
        for (let d = 0; d < Math.min(5, m.rating); d++) {
          const tier = d + 1;
          const grant = tg.find(t => t.tier === tier);
          let label;
          if (d === 0 && d1c === 'speciality') label = 'Spec: ' + (m.dot1_spec_skill || '') + (m.dot1_spec ? ' (' + m.dot1_spec + ')' : '');
          else if (d === 2 && d3c === 'skill') label = 'Skill: ' + (m.dot3_skill || '');
          else if (d === 4 && d5c === 'advantage') label = 'Adv: ' + (m.dot5_text || '');
          else if (grant) label = grant.name + (grant.qualifier ? ' (' + grant.qualifier + ')' : '') + ' ' + dots(grant.rating);
          else label = '<span class="mci-tier-empty">(unassigned)</span>';
          drawerHtml += '<div class="mci-tier-row"><span class="mci-tier-dot">' + tierDotStr[d] + '</span><span class="mci-tier-label">' + label + '</span></div>';
        }
        drawerHtml += '</div>';
      } else if (m.name === 'Professional Training') {
        const as = (m.asset_skills || []).filter(Boolean);
        if (as.length) {
          drawerHtml += `<div class="stand-asset-row"><span class="stand-asset-lbl">Asset Skills (9-Again):</span>${as.map(s => `<span class="stand-na-chip">${s}</span>`).join('')}</div>`;
        }
        // PT tier benefits up to purchased rating
        const ptTiers = [
          '2 dots of Contacts',
          '2 Asset Skills',
          '3rd Asset Skill, +2 Specialisations on Asset Skills',
          '+1 dot in an Asset Skill',
          'Rote quality on any Asset Skill roll (spend 1 Willpower)',
        ];
        drawerHtml += '<div class="mci-tier-list">';
        for (let d = 0; d < Math.min(5, m.rating); d++) {
          drawerHtml += `<div class="mci-tier-row"><span class="mci-tier-dot">${tierDotStr[d]}</span><span class="mci-tier-label">${ptTiers[d]}</span></div>`;
        }
        drawerHtml += '</div>';
      }
      const qualSub = qualifier ? `<div class="trait-sub"><span class="trait-qual">${qualifier}</span></div>` : '';
      const standInner = `<div class="trait-row"><div class="trait-main"><span class="trait-name">${m.name}</span><div class="trait-right"><span class="trait-dots">${dots(m.rating || 0)}</span>${drawerHtml ? '<span class="disc-tap-arr">\u203A</span>' : ''}</div></div>${qualSub}</div>`;
      if (drawerHtml) {
        html += `<div class="disc-tap-row" id="disc-row-${sid}" onclick="toggleDisc('${sid}')">${standInner}</div>
          <div class="disc-drawer" id="disc-drawer-${sid}">${drawerHtml}</div>`;
      } else {
        html += `<div class="disc-tap-row" style="cursor:default">${standInner}</div>`;
      }
    });
    html += `</div></div>`;
  }

  // ── Other Merits + Manoeuvres ──
  const otherMerits = generalMerits(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const manMerits = manoeuvres(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // renderMeritRow — trait-row structure; dotHtml optional override (pass pre-built dotsMixed string)
  function renderMeritRow(m, idPrefix, i, dotHtml) {
    const base = meritBase(m);
    const parenMatch = base.match(/^([^(]+?)\s*\((.+)\)$/);
    const mainName = parenMatch ? parenMatch[1].trim() : base;
    const subName = parenMatch ? parenMatch[2].trim() : null;
    const db = meritLookup(m);
    if (dotHtml === undefined) {
      const purch = (m.cp || 0) + (m.xp || 0);
      const bon = (m.free_mci || 0) + (m.free_vm || 0) + (m.free_ohm || 0) + (m.free_lk || 0)
               + (m.free_inv || 0) + (m.free_bloodline || 0) + (m.free_pet || 0)
               + (m.free_pt || 0) + (m.free_sw || 0) + (m.free_mdb || 0);
      const dcnt = meritDotCount(m);
      dotHtml = (purch || bon) ? dotsMixed(purch, bon) : (dcnt ? `<span class="trait-dots">${dots(dcnt)}</span>` : '');
    }
    const hasDesc = db && db.desc;
    const inner = `<div class="trait-row"><div class="trait-main"><span class="trait-name">${mainName}</span><div class="trait-right">${dotHtml}<span class="exp-arr${hasDesc ? '' : ' trait-arr-hidden'}">\u203A</span></div></div>${subName ? `<div class="trait-sub"><span class="trait-qual">${subName}</span></div>` : ''}</div>`;
    if (hasDesc) {
      const id = idPrefix + i;
      const body = `<div>${db.desc}</div>${db.prereq ? `<div style="margin-top:5px;font-style:italic;color:var(--txt3)">Prerequisite: ${db.prereq}</div>` : ''}`;
      return `<div class="exp-row" id="exp-row-${id}" onclick="toggleExp('${id}')">${inner}</div><div class="exp-body" id="exp-body-${id}">${body}</div>`;
    }
    return `<div class="merit-plain">${inner}</div>`;
  }

  if (otherMerits.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Merits</div><div class="merit-list">`;
    otherMerits.forEach((m, i) => {
      const qual = m.qualifier ? ' (' + m.qualifier + ')' : '';
      if (m.granted_by) {
        const gb = m.granted_by === 'Mystery Cult Initiation' ? 'MCI' : m.granted_by === 'Professional Training' ? 'PT' : m.granted_by;
        const purch = (m.cp || 0) + (m.xp || 0);
        const bon = (m.free_mci || 0) + (m.free_vm || 0) + (m.free_ohm || 0) + (m.free_lk || 0)
                 + (m.free_inv || 0) + (m.free_bloodline || 0) + (m.free_pet || 0)
                 + (m.free_pt || 0) + (m.free_sw || 0) + (m.free_mdb || 0);
        const dotH = (purch || bon)
          ? dotsMixed(purch, bon)
          : (m.rating ? `<span class="trait-dots">${dots(m.rating)}</span>` : '');
        html += renderMeritRow({ name: m.name + qual, rating: 0 }, 'gmerit', i, dotH + `<span class="gen-granted-tag-view" title="Granted by ${m.granted_by}">${gb}</span>`);
      } else {
        // Let renderMeritRow compute dots from the merit object — handles purch/bon split
        // with fallback to m.rating when no sources tracked
        html += renderMeritRow(Object.assign({}, m, { name: m.name + qual }), 'merit', i);
      }
    });
    html += `</div></div>`;
  }

  if (manMerits.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Manoeuvres</div><div class="man-list">`;
    manMerits.forEach((m, i) => {
      const manName = m.manoeuvre || m.name;
      const base = meritBase(m);
      const rank = m.rating || 0;
      const slug = manName ? manName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;
      const rule = slug ? getRuleByKey(slug) : null;
      const db = rule ? { style: rule.parent, rank: rule.rank, effect: rule.description, prereq: rule.prereq ? prereqLabel(rule.prereq) : null } : null;
      const id = 'man' + i;
      const body = db ? `<div class="man-exp-body"><div class="man-style">${db.style} \u2014 Rank ${db.rank}</div><div>${db.effect || ''}</div>${db.prereq ? `<div class="man-prereq">Prerequisite: ${db.prereq}</div>` : ''}</div>` : `<div>${manName || base}</div>`;
      const inner = `<div class="trait-row"><div class="trait-main"><span class="trait-name">${manName || base}</span><div class="trait-right"><span class="exp-arr">\u203A</span></div></div><div class="trait-sub"><span class="trait-qual">${base} \u2014 Rank ${rank}</span></div></div>`;
      html += `<div class="exp-row" id="exp-row-${id}" onclick="toggleExp('${id}')">${inner}</div><div class="exp-body" id="exp-body-${id}">${body}</div>`;
    });
    html += `</div></div>`;
  }

  // ── Active Conditions (from tracker_state) ──
  const cs2 = trackerRead(String(c._id));
  const activeConds = (cs2 && cs2.conditions) ? cs2.conditions : [];
  if (activeConds.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Active Conditions</div><div class="cond-sheet-list">`;
    activeConds.forEach(cond => {
      const condName   = typeof cond === 'object' ? cond.name : cond;
      const condEffect = typeof cond === 'object' ? cond.effect : '';
      const condRes    = typeof cond === 'object' ? cond.resolution : '';
      html += `<div class="cond-sheet-card"><div class="cond-sheet-name">${esc(condName)}</div>`;
      if (condEffect) html += `<div class="cond-sheet-effect">${esc(condEffect)}</div>`;
      if (condRes)    html += `<div class="cond-sheet-res"><span class="cond-sheet-res-lbl">Resolution:</span> ${esc(condRes)}</div>`;
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  // ── Equipment ──
  const equipment = getEquipment(c);
  if (equipment.length) {
    const weapons = equipment.filter(e => e.type === 'weapon');
    const armour  = equipment.filter(e => e.type === 'armour');
    const effDef  = effectiveDefence(c);
    html += `<div class="sh-sec"><div class="sh-sec-title">Equipment</div><div class="merit-list">`;
    weapons.forEach(w => {
      const poolStr = weaponPoolLabel(c, w);
      html += `<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">${esc(w.name)}</span><div class="trait-right"><span class="trait-qual" style="font-size:10px">${poolStr}</span></div></div></div></div>`;
    });
    armour.forEach(a => {
      const arStr = `AR ${a.general_ar || 0}/${a.ballistic_ar || 0}`;
      const defStr = a.mobility_penalty ? ` \u00B7 Def ${effDef} (\u2212${a.mobility_penalty})` : '';
      html += `<div class="merit-plain"><div class="trait-row"><div class="trait-main"><span class="trait-name">${esc(a.name)}</span><div class="trait-right"><span class="trait-qual" style="font-size:10px">${arStr}${defStr}</span></div></div></div></div>`;
    });
    html += `</div></div>`;
  }

  html += `</div>`; // end sh-body
  const powersHtml = html;

  // Render to split-tab containers (phone + desktop unified).
  // Desktop mode: render to the full-sheet container so the Sheet tab works.
  // Mobile mode: render to split-tab containers only, clear the full sheet
  // to avoid duplicate IDs that break toggleExp/toggleDisc.
  const isDesktop = document.body.classList.contains('desktop-mode');
  if (el && isDesktop) {
    el.innerHTML = infoHtml + statsHtml + skillsHtml + '<div class="sh-powers-grid">' + powersHtml + '</div>';
  } else if (el) {
    el.innerHTML = '';
  }
  // Always populate split tabs (used on mobile; invisible on desktop)
  if (statsEl)  statsEl.innerHTML  = isDesktop ? '' : statsHtml;
  if (skillsEl) skillsEl.innerHTML = isDesktop ? '' : skillsHtml;
  if (powersEl) powersEl.innerHTML = isDesktop ? '' : powersHtml;
  if (infoEl)   infoEl.innerHTML   = isDesktop ? '' : infoHtml;

  // Wire attribute+skills carousel indicators
  _wireAttrCarousel(skillsEl || el);
}

function _wireAttrCarousel(container) {
  if (!container) return;
  const carousel = container.querySelector('#attr-carousel');
  const badges = container.querySelectorAll('.attr-carousel-badge');
  if (!carousel || !badges.length) return;
  const cards = carousel.querySelectorAll('.attr-skills-card');
  if (!cards.length) return;

  // Update badges on scroll
  carousel.addEventListener('scroll', () => {
    const scrollLeft = carousel.scrollLeft;
    const cardWidth = cards[0].offsetWidth;
    const idx = Math.round(scrollLeft / cardWidth);
    badges.forEach((b, i) => b.classList.toggle('active', i === idx));
  }, { passive: true });

  // Tap badge to scroll to that card
  badges.forEach((badge, i) => {
    badge.addEventListener('click', () => {
      cards[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── TRACKER INFO POPOVER ──
// (?) button shows influence breakdown; click outside dismisses.
document.addEventListener('click', function(e) {
  const infoBtn = e.target.closest('.sh-tracker-info-btn');
  if (infoBtn) {
    e.stopPropagation();
    const type = infoBtn.dataset.infoType;
    const popover = document.getElementById('popover-' + type);
    if (!popover) return;
    const isVisible = popover.style.display !== 'none';
    // Close all popovers first
    document.querySelectorAll('.sh-tracker-popover').forEach(p => p.style.display = 'none');
    if (!isVisible) popover.style.display = '';
    return;
  }
  // Click outside closes all popovers
  if (!e.target.closest('.sh-tracker-popover')) {
    document.querySelectorAll('.sh-tracker-popover').forEach(p => p.style.display = 'none');
  }
});

// ── TRACKER TOGGLE ──
// Event delegation on tracker-block — writes through to the canonical tracker store.
// ST/dev only — players view tracker state but cannot adjust it.
document.addEventListener('click', function(e) {
  const box = e.target.closest('[data-tracker]');
  if (!box) return;
  const role = (window._getRole || (() => 'player'))();
  if (role !== 'st' && role !== 'dev') return;
  const block = box.closest('#tracker-block');
  if (!block) return;
  if (!state.sheetChar) return;

  const type      = box.dataset.tracker;
  const idx       = parseInt(box.dataset.idx);
  const max       = parseInt(box.dataset.max);
  const filledCls = box.dataset.filled;
  const c         = state.sheetChar;
  const charId    = String(c._id);
  const cs        = trackerRead(charId);
  if (!cs) return;

  // Compute current value in sheet terms
  const maxH = calcHealth(c);
  let currentSheet;
  if      (type === 'health') currentSheet = Math.max(0, maxH - (cs.bashing ?? 0) - (cs.lethal ?? 0) - (cs.aggravated ?? 0));
  else if (type === 'vitae')  currentSheet = cs.vitae      ?? 0;
  else if (type === 'wp')     currentSheet = cs.willpower  ?? 0;
  else if (type === 'inf')    currentSheet = cs.inf        ?? 0;
  else return;

  // Tap filled → spend down to idx; tap empty → recover up to idx+1
  const newVal = idx < currentSheet ? idx : idx + 1;
  const delta  = newVal - currentSheet;
  if (delta === 0) return;

  if (type === 'health') {
    if (delta < 0) {
      // Taking damage — add lethal (ST reclassifies in Tracker if needed)
      trackerAdj(charId, 'lethal', -delta);
    } else {
      // Healing — remove bashing first, then lethal, then aggravated
      let rem = delta;
      const removeBash = Math.min(rem, cs.bashing    ?? 0); rem -= removeBash;
      const removeLet  = Math.min(rem, cs.lethal     ?? 0); rem -= removeLet;
      const removeAgg  = Math.min(rem, cs.aggravated ?? 0);
      if (removeBash) trackerAdj(charId, 'bashing',    -removeBash);
      if (removeLet)  trackerAdj(charId, 'lethal',     -removeLet);
      if (removeAgg)  trackerAdj(charId, 'aggravated', -removeAgg);
    }
  } else if (type === 'vitae') {
    trackerAdj(charId, 'vitae', delta);
  } else if (type === 'wp') {
    trackerAdj(charId, 'willpower', delta);
  } else if (type === 'inf') {
    trackerAdj(charId, 'inf', delta);
  }

  // Re-read updated state and repaint boxes + number
  const updated = trackerRead(charId);
  let updatedSheet;
  if      (type === 'health') updatedSheet = Math.max(0, maxH - (updated.bashing ?? 0) - (updated.lethal ?? 0) - (updated.aggravated ?? 0));
  else if (type === 'vitae')  updatedSheet = updated.vitae      ?? 0;
  else if (type === 'wp')     updatedSheet = updated.willpower  ?? 0;
  else if (type === 'inf')    updatedSheet = updated.inf        ?? 0;

  const boxesEl = document.getElementById('tb-' + type);
  const numEl   = document.getElementById('tn-' + type);
  if (boxesEl) {
    boxesEl.innerHTML = Array.from({ length: max }, (_, i) => {
      const filled = i < updatedSheet;
      return `<div class="tbox${filled ? ' ' + filledCls : ''}" data-tracker="${type}" data-idx="${i}" data-max="${max}" data-filled="${filledCls}"></div>`;
    }).join('');
  }
  if (numEl) {
    const trueMax = type === 'health' ? maxH
      : type === 'vitae'  ? calcVitaeMax(c)
      : type === 'wp'     ? calcWillpowerMax(c)
      : calcTotalInfluence(c);
    numEl.textContent = updatedSheet + '/' + trueMax;
  }
});
