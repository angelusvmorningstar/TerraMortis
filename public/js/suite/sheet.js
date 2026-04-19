// ══════════════════════════════════════════════
//  Sheet Tab — read-only character sheet view
// ══════════════════════════════════════════════

import state from './data.js';
import { displayName, getWillpower, redactPlayer } from '../data/helpers.js';
import {
  ICONS, COV_ICON_MAP, CITY_SVG, OTHER_SVG, BP_SVG, HUM_SVG, STAT_SVG,
  RITUAL_DISCS, CORE_DISCS,
} from './data.js';
import { getRuleByKey } from '../data/loader.js';
import { prereqLabel } from '../data/prereq.js';

import {
  dots, dotsWithBonus, getAttrDots, getAttrBonus,
  skillDots, skillSpec,
  meritBase, meritDotCount, meritSuffix, meritKey, meritLookup,
  powersForDisc, otherPowers,
  toggleExp, toggleDisc, expRow
} from './sheet-helpers.js';

import {
  influenceMerits, domainMerits, standingMerits, generalMerits, manoeuvres,
  influenceTotal, calcSize, calcSpeed, calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax, xpLeft
} from '../data/accessors.js';
import { trackerRead, trackerReadRaw, trackerAdj, trackerWriteField } from '../game/tracker.js';
import { calcTotalInfluence, influenceBreakdown } from '../editor/domain.js';

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
  document.getElementById('sh-empty').style.display = 'none';
  document.getElementById('sh-content-suite').style.display = '';
  renderSheet();
}

// ── Main render ──

export function renderSheet() {
  state.openExpId = null;
  const c = state.sheetChar;
  const el = document.getElementById('sh-content-suite');
  if (!c) { el.innerHTML = ''; return; }

  const bl = c.bloodline && c.bloodline !== '\u00AC' ? c.bloodline : '';
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

  // ── HEADER ──
  html += `<div class="sh-char-hdr">`;

  // Name row
  html += `<div class="sh-namerow">
    <div class="sh-char-name">${displayName(c)}</div>
    <div class="sh-player-row">
      <span class="sh-char-player">${redactPlayer(c.player || '')}${c.pronouns ? ' \u00B7 ' + c.pronouns : ''}</span>
      <span class="sh-xp-badge">XP ${xpLeft(c)}/${c.xp_total != null ? c.xp_total : '?'}</span>
    </div>
    ${c.concept ? `<div class="sh-char-concept" style="margin-top:4px">${c.concept}</div>` : ''}
  </div>`;

  // Faction display — Covenant first, then Clan
  html += `<div class="sh-faction-display">`;
  if (c.covenant) {
    html += `<div class="sh-faction-row">
      ${covSvg ? `<div class="sh-faction-icon-sm" style="color:var(--accent)">${covSvg}</div>` : `<div class="sh-faction-icon-sm"></div>`}
      <div class="sh-faction-info">
        <span class="sh-faction-name">${c.covenant}</span>
        <span class="sh-faction-type">Covenant</span>
        ${st.covenant ? `<span class="sh-faction-dots">${dots(st.covenant)}</span>` : ''}
      </div>
      <div class="sh-stat-pip">
        <div class="sh-status-shape">${OTHER_SVG}<span class="sh-status-n">${st.covenant || 0}</span></div>
        <div class="sh-status-lbl">Cov.</div>
      </div>
    </div>`;
  }
  if (c.clan) {
    html += `<div class="sh-faction-row">
      ${clanSvg ? `<div class="sh-faction-icon-sm" style="color:var(--accent)">${clanSvg}</div>` : `<div class="sh-faction-icon-sm"></div>`}
      <div class="sh-faction-info">
        <span class="sh-faction-name">${c.clan}</span>
        ${bl ? `<span class="sh-faction-bloodline-sub">${bl}</span>` : ''}
        <span class="sh-faction-type">Clan</span>
        ${st.clan ? `<span class="sh-faction-dots">${dots(st.clan)}</span>` : ''}
      </div>
      <div class="sh-stat-pip">
        <div class="sh-status-shape">${OTHER_SVG}<span class="sh-status-n">${st.clan || 0}</span></div>
        <div class="sh-status-lbl">Clan</div>
      </div>
    </div>`;
  }
  html += `</div>`; // end sh-faction-display

  // Meta rows: mask, dirge, curse/bane, touchstones, embrace, apparent age, features
  html += `<div class="sh-char-meta">`;

  // Mask
  if (c.mask) {
    const body = (wp.mask_1wp ? `<div><span class="exp-wp-lbl">1 WP</span> ${wp.mask_1wp}</div>` : '') +
                 (wp.mask_all ? `<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ${wp.mask_all}</div>` : '');
    html += expRow('mask', 'Mask', c.mask, body);
  }
  // Dirge
  if (c.dirge) {
    const body = (wp.dirge_1wp ? `<div><span class="exp-wp-lbl">1 WP</span> ${wp.dirge_1wp}</div>` : '') +
                 (wp.dirge_all ? `<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ${wp.dirge_all}</div>` : '');
    html += expRow('dirge', 'Dirge', c.dirge, body);
  }
  // Curse + Banes
  if (curse) html += expRow('curse', 'Curse', curse.name, `<div>${curse.effect || ''}</div>`);
  regularBanes.forEach((b, i) => {
    html += expRow('bane' + i, 'Bane', b.name, `<div>${b.effect || ''}</div>`);
  });
  // Touchstones
  const ts = c.touchstones || [];
  if (ts.length) {
    const hum = c.humanity || 0;
    const tsBody = ts.map(t => {
      const attached = hum >= t.humanity;
      return `<div class="exp-ts-row">
        <span class="exp-ts-hum">Humanity ${t.humanity} \u2014 <span style="color:${attached ? 'rgba(140,200,140,.9)' : 'var(--txt3)'};font-style:normal">${attached ? 'Attached' : 'Detached'}</span></span>
        <span class="exp-ts-name">${t.name}${t.desc ? ` <span class="exp-ts-desc">(${t.desc})</span>` : ''}</span>
      </div>`;
    }).join('');
    html += expRow('touchstones', 'Touchstones', '', tsBody);
  }
  // Embrace + Apparent Age
  if (c.date_of_embrace || c.apparent_age) {
    html += `<div class="sh-meta-pair">`;
    if (c.date_of_embrace) {
      const dedDisp = new Date(c.date_of_embrace + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      html += `<div class="sh-meta-row"><span class="sh-meta-lbl">Embrace</span><span class="sh-meta-val">${dedDisp}</span></div>`;
    }
    if (c.apparent_age) {
      html += `<div class="sh-meta-row"><span class="sh-meta-lbl">App. Age</span><span class="sh-meta-val">${c.apparent_age}</span></div>`;
    }
    html += `</div>`;
  }
  // Features
  if (c.features) {
    html += `<div class="sh-meta-row"><span class="sh-meta-lbl">Features</span><span class="sh-meta-val">${c.features}</span></div>`;
  }

  html += `</div>`; // end sh-char-meta
  html += `</div>`; // end sh-char-hdr

  // ── COVENANT STRIP ──
  const covStandings = c.covenant_standings || {};
  const COV_SHORT = {
    'Carthian Movement': 'Carthian',
    'Circle of the Crone': 'Crone',
    'Invictus': 'Invictus',
    'Lancea et Sanctum': 'Lance',
  };
  const ownLabel = COV_SHORT[c.covenant] || null;
  const covSEntries = Object.entries(covStandings)
    .filter(([label, v]) => v !== undefined && label !== ownLabel);
  if (covSEntries.length) {
    html += `<div class="cov-strip">`;
    covSEntries.forEach(([label, status]) => {
      const active = status > 0;
      html += `<div class="cov-strip-cell">
        <span class="cov-strip-name${active ? ' active' : ''}">${label}</span>
        <span class="cov-strip-dot${active ? ' active' : ''}">${active ? '\u25CB' : '\u2013'}</span>
      </div>`;
    });
    html += `</div>`;
  }

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

  function mkBoxRow(type, current, max, filledCls) {
    const disp = Math.min(max, 15);
    const boxes = Array.from({ length: disp }, (_, i) => {
      const filled = i < current;
      return `<div class="tbox${filled ? ' ' + filledCls : ''}" data-tracker="${type}" data-idx="${i}" data-max="${disp}" data-filled="${filledCls}"></div>`;
    }).join('');
    return `<div class="sh-tracker-row">
      <div class="sh-tracker-lbl">${TRACKER_LABELS[type] || type}</div>
      <div class="sh-tracker-boxes" id="tb-${type}">${boxes}</div>
      <div class="sh-tracker-num" id="tn-${type}">${current}/${max}</div>
    </div>`;
  }

  const bdLines = influenceBreakdown(c);
  const infBreakdown = bdLines.length
    ? `<div class="sh-inf-breakdown">${bdLines.map(l =>
        `<span class="sh-inf-merit">${l}</span>`
      ).join('')}</div>`
    : '';

  html += `<div class="sh-tracker-block" id="tracker-block">
    ${mkBoxRow('health', tState.health, maxH, 'health-filled')}
    ${mkBoxRow('vitae', tState.vitae, maxV, 'vitae-filled')}
    ${mkBoxRow('wp', tState.wp, maxWP, 'wp-filled')}
    ${maxInf > 0 ? mkBoxRow('inf', tState.inf, maxInf, 'inf-filled') + infBreakdown : ''}
  </div>`;

  // ── BODY ──
  html += `<div class="sh-body">`;

  // Attributes (3-column: Mental | Physical | Social)
  const ATTR_COLS = [
    { label: 'Mental',   attrs: ['Intelligence', 'Wits', 'Resolve'] },
    { label: 'Physical', attrs: ['Strength', 'Dexterity', 'Stamina'] },
    { label: 'Social',   attrs: ['Presence', 'Manipulation', 'Composure'] },
  ];
  html += `<div class="sh-sec"><div class="sh-sec-title">Attributes</div><div class="attr-grid">`;
  ATTR_COLS.forEach(col => {
    html += `<div class="attr-cell"><div class="attr-group-hd">${col.label}</div>`;
    col.attrs.forEach(a => {
      const base = getAttrDots(c, a), bonus = getAttrBonus(c, a);
      html += `<div class="attr-row-item"><span class="attr-name">${a}</span><span class="attr-dots">${dotsWithBonus(base, bonus)}</span></div>`;
    });
    html += `</div>`;
  });
  html += `</div></div>`;

  // Skills (3-col, all 24)
  const SKILL_COLS = [
    ['Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science'],
    ['Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry'],
    ['Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge'],
  ];
  html += `<div class="sh-sec"><div class="sh-sec-title">Skills</div><div class="skills-3col">`;
  for (let ri = 0; ri < 8; ri++) {
    SKILL_COLS.forEach(col => {
      const s = col[ri];
      const sk = c.skills ? c.skills[s] : null;
      const d = skillDots(sk), sp = skillSpec(sk);
      const bn = sk ? (sk.bonus || 0) : 0;
      const na = sk && sk.nine_again;
      const hasDots = d > 0 || bn > 0;
      const dotStr = hasDots ? dotsWithBonus(d, bn) : '\u2013';
      html += `<div class="skill-row${hasDots ? ' has-dots' : ''}">
        <div class="skill-name-wrap">
          <span class="skill-name">${s}</span>
          ${sp ? `<span class="skill-spec">${sp}</span>` : ''}
        </div>
        <div class="skill-dots-wrap">
          <span class="${hasDots ? 'skill-dots' : 'skill-zero'}">${dotStr}</span>
          ${na ? `<span class="skill-na">9-Again</span>` : ''}
        </div>
      </div>`;
    });
  }
  html += `</div></div>`;

  // ── Powers -- four sections ──
  if (c.disciplines && Object.keys(c.disciplines).length) {

    function renderDiscRow(d, r, nameStyle) {
      const discPowers = powersForDisc(c.powers || [], d, r);
      const hasPowers = discPowers.length > 0;
      const id = 'disc-' + c.name.replace(/[^a-z]/gi, '') + d.replace(/[^a-z]/gi, '');
      let drawerHtml = '';
      discPowers.forEach(p => {
        const pname = p.name || '';
        drawerHtml += `<div class="disc-power">
          <div class="disc-power-name">${pname}</div>
          ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
          <div class="disc-power-effect">${p.effect || ''}</div>
        </div>`;
      });
      if (d === 'Auspex' && r >= 1) {
        drawerHtml += `<button class="auspex-insight-btn" onclick="openPanel('auspex')">Auspex Insight \u203A</button>`;
      }
      const nameTag = (nameStyle ? '<span class="disc-tap-name" style="' + nameStyle + '">' : '<span class="disc-tap-name">') + d + '</span>';
      const dotsTag = r ? `<span class="disc-tap-dots">${dots(r)}</span>` : '';
      const isExpandable = hasPowers || (d === 'Auspex' && r >= 1);
      if (!isExpandable) {
        return `<div class="disc-tap-row">
          <div class="disc-tap-left">${nameTag}${dotsTag}</div>
        </div>`;
      }
      return `<div class="disc-tap-row" id="disc-row-${id}" onclick="toggleDisc('${id}')">
          <div class="disc-tap-left">${nameTag}${dotsTag}</div>
          <span class="disc-tap-arr">\u203A</span>
        </div>
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
        const pname = p.name || '';
        const gid = 'dev' + c.name.replace(/[^a-z]/gi, '') + i;
        html += `<div class="disc-tap-row" id="disc-row-${gid}" onclick="toggleDisc('${gid}')">
          <div class="disc-tap-left"><span class="disc-tap-name" style="color:var(--txt2)">${pname}</span></div>
          <span class="disc-tap-arr">\u203A</span>
        </div>
        <div class="disc-drawer" id="disc-drawer-${gid}">
          <div class="disc-power">
            ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
            <div class="disc-power-effect">${p.effect || ''}</div>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    }

    // 3. Blood Sorcery (Cruac, Theban)
    if (ritualDiscs.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">`;
      ritualDiscs.forEach(([d, r]) => { html += renderDiscRow(d, r?.dots || 0, 'color:rgba(220,160,120,.9)'); });
      html += `</div></div>`;
    }

    // 4. Pacts (Oaths + Carthian Law)
    const pacts = others.filter(p => p.category === 'pact' || p.category === 'rite');
    if (pacts.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Pacts</div><div class="disc-list">`;
      pacts.forEach((p, i) => {
        const gid = 'pact' + c.name.replace(/[^a-z]/gi, '') + i;
        html += `<div class="disc-tap-row" id="disc-row-${gid}" onclick="toggleDisc('${gid}')">
          <div class="disc-tap-left"><span class="disc-tap-name" style="color:var(--txt2)">${p.name}</span></div>
          <span class="disc-tap-arr">\u203A</span>
        </div>
        <div class="disc-drawer" id="disc-drawer-${gid}">
          <div class="disc-power">
            ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
            <div class="disc-power-effect">${p.effect || ''}</div>
          </div>
        </div>`;
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
    inflMerits.forEach((m, i) => {
      html += renderMeritRow(m, 'infl', i);
    });
    html += `</div></div>`;
  }

  // ── Domain Merits ──
  const domMerits = domainMerits(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (domMerits.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Domain Merits</div><div class="merit-list">`;
    domMerits.forEach(m => {
      const hasPartners = (m.shared_with || []).length > 0;
      if (hasPartners) {
        // Own dots from all purchase sources
        const own = (m.cp || 0) + (m.free_mci || 0) + (m.free_bloodline || 0)
                  + (m.free_pet || 0) + (m.free_vm || 0) + (m.free_lk || 0)
                  + (m.free_ohm || 0) + (m.free_inv || 0) + (m.xp || 0);
        // Partner contributions — try state.chars first, fall back to
        // server-enriched _partner_dots (player portal ?mine=1 path)
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
        const label = m.name + ' <span style="font-size:10px;color:var(--txt3)">Shared</span>';
        html += `<div class="merit-plain"><span class="merit-name">${label}</span><span class="merit-dots">${dotsWithBonus(ownCapped, hollow)}</span></div>`;
      } else {
        html += `<div class="merit-plain"><span class="merit-name">${m.name}</span><span class="merit-dots">${dots(m.rating || 0)}</span></div>`;
      }
    });
    html += `</div></div>`;
  }

  // ── Standing Merits ──
  const stndMerits = standingMerits(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (stndMerits.length) {
    const tierDotStr = ['\u25CF', '\u25CF\u25CF', '\u25CF\u25CF\u25CF', '\u25CF\u25CF\u25CF\u25CF', '\u25CF\u25CF\u25CF\u25CF\u25CF'];
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
      // Render as expandable row if we have drawer content, plain row otherwise
      if (drawerHtml) {
        html += `<div class="disc-tap-row" id="disc-row-${sid}" onclick="toggleDisc('${sid}')">
          <div class="disc-tap-left">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span class="disc-tap-name">${m.name}</span>
              ${qualifier ? `<span style="font-family:var(--fl);font-size:10px;color:var(--label-secondary);font-weight:400">${qualifier}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="disc-tap-dots">${dots(m.rating || 0)}</span>
            <span class="disc-tap-arr">\u203A</span>
          </div>
        </div>
        <div class="disc-drawer" id="disc-drawer-${sid}">${drawerHtml}</div>`;
      } else {
        html += `<div class="disc-tap-row" style="cursor:default">
          <div class="disc-tap-left">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span class="disc-tap-name">${m.name}</span>
              ${qualifier ? `<span style="font-family:var(--fl);font-size:10px;color:var(--label-secondary);font-weight:400">${qualifier}</span>` : ''}
            </div>
          </div>
          <span class="disc-tap-dots">${dots(m.rating || 0)}</span>
        </div>`;
      }
    });
    html += `</div></div>`;
  }

  // ── Other Merits + Manoeuvres ──
  const otherMerits = generalMerits(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const manMerits = manoeuvres(c).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  function renderMeritRow(m, idPrefix, i) {
    const base = meritBase(m);
    const dcnt = meritDotCount(m);
    const dotsStr = dcnt ? dots(dcnt) : '';
    const parenMatch = base.match(/^([^(]+?)\s*\((.+)\)$/);
    const mainName = parenMatch ? parenMatch[1].trim() : base;
    const subName = parenMatch ? parenMatch[2].trim() : null;
    const nameHtml = subName
      ? `<div class="merit-name">${mainName}</div><div class="merit-sub">${subName}</div>`
      : `<div class="merit-name">${mainName}</div>`;
    const db = meritLookup(m);
    const dotsTag = dotsStr ? `<span class="merit-dots">${dotsStr}</span>` : '';
    if (db && db.desc) {
      const id = idPrefix + i;
      const body = `<div>${db.desc}</div>${db.prereq ? `<div style="margin-top:5px;font-style:italic;color:var(--txt3)">Prerequisite: ${db.prereq}</div>` : ''}`;
      return `<div class="exp-row" id="exp-row-${id}" onclick="toggleExp('${id}')">
        <div style="flex:1;min-width:0">${nameHtml}</div>
        ${dotsTag}<span class="exp-arr">\u203A</span>
      </div>
      <div class="exp-body" id="exp-body-${id}">${body}</div>`;
    } else {
      return `<div class="merit-plain">
        <div style="flex:1;min-width:0">${nameHtml}</div>${dotsTag}
      </div>`;
    }
  }

  if (otherMerits.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Merits</div><div class="merit-list">`;
    otherMerits.forEach((m, i) => { html += renderMeritRow(m, 'merit', i); });
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
      const body = db ? `<div class="man-exp-body">
        <div class="man-style">${db.style} \u2014 Rank ${db.rank}</div>
        <div>${db.effect || ''}</div>
        ${db.prereq ? `<div class="man-prereq">Prerequisite: ${db.prereq}</div>` : ''}
      </div>` : `<div>${manName || base}</div>`;
      html += `<div class="exp-row" id="exp-row-${id}" onclick="toggleExp('${id}')">
        <div style="flex:1;min-width:0">
          <div class="merit-name">${manName || base}</div>
          <div class="merit-sub">${base} \u2014 Rank ${rank}</div>
        </div>
        <span class="exp-arr">\u203A</span>
      </div>
      <div class="exp-body" id="exp-body-${id}">${body}</div>`;
    });
    html += `</div></div>`;
  }

  html += `</div>`; // end sh-body
  el.innerHTML = html;
}

// ── TRACKER TOGGLE ──
// Event delegation on tracker-block — writes through to the canonical tracker store.
document.addEventListener('click', function(e) {
  const box = e.target.closest('[data-tracker]');
  if (!box) return;
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
