// ══════════════════════════════════════════════
//  Sheet Tab — read-only character sheet view
// ══════════════════════════════════════════════

import state from './data.js';
import {
  ICONS, COV_ICON_MAP, CITY_SVG, OTHER_SVG, BP_SVG, HUM_SVG, STAT_SVG,
  SORCERY_THEMES, RITUAL_DISCS, CORE_DISCS,
  MAN_DB
} from './data.js';

import {
  dots, dotsWithBonus, getAttrDots, getAttrBonus,
  skillDots, skillSpec,
  meritBase, meritDotCount, meritSuffix, meritKey, meritLookup,
  powersForDisc, otherPowers,
  toggleExp, toggleDisc, expRow
} from './sheet-helpers.js';

// ── Sheet character selection ──

export function onSheetChar(name) {
  if (!name) {
    state.sheetChar = null;
    document.getElementById('sh-empty').style.display = '';
    document.getElementById('sh-content').style.display = 'none';
    return;
  }
  state.sheetChar = state.chars.find(c => c.name === name) || null;
  if (!state.sheetChar) return;
  document.getElementById('sh-empty').style.display = 'none';
  renderSheet();
}

// ── Main render ──

export function renderSheet() {
  state.openExpId = null;
  const c = state.sheetChar;
  const el = document.getElementById('sh-content');
  if (!c) { el.innerHTML = ''; return; }

  const bl = c.bloodline && c.bloodline !== '\u00AC' ? c.bloodline : '';
  const st = c.status || {};
  const clanKey = (c.clan || '').toLowerCase().replace(/[^a-z]/g, '');
  const covKey = (c.covenant || '').toLowerCase().replace(/[^a-z]/g, '');
  const clanSvg = ICONS[clanKey] || '';
  const covSvg = ICONS[COV_ICON_MAP[covKey] || covKey] || '';
  const wp = c.willpower || {};

  // ── Separate curse from banes ──
  const allBanes = c.banes || [];
  const curseIdx = allBanes.findIndex(b => b.name.toLowerCase().includes('curse'));
  const curse = curseIdx >= 0 ? allBanes[curseIdx] : null;
  const regularBanes = allBanes.filter((_, i) => i !== curseIdx);

  let html = '';

  // ── HEADER ──
  html += `<div class="sh-char-hdr">
  <div class="sh-namerow">
    <div class="sh-char-name">${c.name}</div>
    <div class="sh-player-row">
      <span class="sh-char-player">${c.player || ''}</span>
      <span class="sh-xp-badge">XP ${c.xp_left != null ? c.xp_left : '?'}/${c.xp_total != null ? c.xp_total : '?'}</span>
    </div>
  </div>
  <div class="sh-char-body">
    <div class="sh-char-left">`;

  if (c.concept) html += `<div class="sh-char-concept">${c.concept}</div>`;

  // Mask
  if (c.mask) {
    const body = (wp.mask_1wp ? `<div><span class="exp-wp-lbl">1 WP</span> ${wp.mask_1wp}</div>` : '') +
                 (wp.mask_all_wp ? `<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ${wp.mask_all_wp}</div>` : '');
    html += expRow('mask', 'Mask', c.mask, body);
  }
  // Dirge
  if (c.dirge) {
    const body = (wp.dirge_1wp ? `<div><span class="exp-wp-lbl">1 WP</span> ${wp.dirge_1wp}</div>` : '') +
                 (wp.dirge_all_wp ? `<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> ${wp.dirge_all_wp}</div>` : '');
    html += expRow('dirge', 'Dirge', c.dirge, body);
  }
  // Curse
  if (curse) html += expRow('curse', 'Curse', curse.name, `<div>${curse.effect || ''}</div>`);
  // Banes
  regularBanes.forEach((b, i) => {
    html += expRow('bane' + i, 'Bane', b.name, `<div>${b.effect || ''}</div>`);
  });
  // Touchstones
  const ts = c.touchstones || [];
  if (ts.length) {
    const hum = c.humanity || 0;
    const summary = '';
    const tsBody = ts.map(t => {
      const attached = hum >= t.humanity;
      return `<div class="exp-ts-row">
        <span class="exp-ts-hum">Humanity ${t.humanity} \u2014 <span style="color:${attached ? 'rgba(140,200,140,.9)' : 'var(--txt3)'};font-style:normal">${attached ? 'Attached' : 'Detached'}</span></span>
        <span class="exp-ts-name">${t.name}${t.desc ? ` <span class="exp-ts-desc">(${t.desc})</span>` : ''}</span>
      </div>`;
    }).join('');
    html += expRow('touchstones', 'Touchstones', summary, tsBody);
  }

  html += `</div>`; // end sh-char-left

  // Right panel
  html += `<div class="sh-hdr-right">
    <div class="sh-hdr-row">
      <div class="sh-icon-slot"></div>
      <div class="sh-faction-text">
        <div class="sh-faction-label">${c.court_title || '\u2014'}</div>
        <div class="sh-faction-sub">Title</div>
      </div>
      <div class="sh-stat-pip">
        <div class="sh-status-shape">${CITY_SVG}<span class="sh-status-n">${st.city || 0}</span></div>
        <div class="sh-status-lbl">City</div>
      </div>
    </div>
    <div class="sh-hdr-row">
      ${covSvg ? `<div class="sh-faction-icon" style="color:#CC1111;width:36px;height:36px;flex-shrink:0">${covSvg}</div>` : `<div class="sh-icon-slot"></div>`}
      <div class="sh-faction-text">
        <div class="sh-faction-label">${c.covenant || '\u2014'}</div>
        <div class="sh-faction-sub">Covenant</div>
      </div>
      <div class="sh-stat-pip">
        <div class="sh-status-shape">${OTHER_SVG}<span class="sh-status-n">${st.covenant || 0}</span></div>
        <div class="sh-status-lbl">Cov.</div>
      </div>
    </div>
    <div class="sh-hdr-row">
      ${clanSvg ? `<div class="sh-faction-icon" style="color:#CC1111;width:36px;height:36px;flex-shrink:0">${clanSvg}</div>` : `<div class="sh-icon-slot"></div>`}
      <div class="sh-faction-text">
        <div class="sh-faction-label">${c.clan || '\u2014'}</div>
        ${bl ? `<div class="sh-faction-bloodline">${bl}</div>` : ''}
        <div class="sh-faction-sub">Clan</div>
      </div>
      <div class="sh-stat-pip">
        <div class="sh-status-shape">${OTHER_SVG}<span class="sh-status-n">${st.clan || 0}</span></div>
        <div class="sh-status-lbl">Clan</div>
      </div>
    </div>
  </div>`; // end sh-hdr-right

  html += `</div></div>`; // end sh-char-body, sh-char-hdr

  // ── COVENANT STRIP ──
  const covS = (c.covenant_standings || []).slice(1);
  if (covS.length) {
    html += `<div class="cov-strip">`;
    covS.forEach(cs => {
      const active = cs.status > 0;
      html += `<div class="cov-strip-cell">
        <span class="cov-strip-name${active ? ' active' : ''}">${cs.label}</span>
        <span class="cov-strip-dot${active ? ' active' : ''}">${active ? '\u25CB' : '\u2013'}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── STATS STRIP ──
  html += `<div class="sh-stats-strip">
    <div class="sh-stat-cell"><div class="sh-stat-icon">${BP_SVG}<span class="sh-stat-n">${c.blood_potency || 1}</span></div><div class="sh-stat-lbl">BP</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${HUM_SVG}<span class="sh-stat-n">${c.humanity || 0}</span></div><div class="sh-stat-lbl">Humanity</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${STAT_SVG}<span class="sh-stat-n">${c.size || 5}</span></div><div class="sh-stat-lbl">Size</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${STAT_SVG}<span class="sh-stat-n">${c.speed || 0}</span></div><div class="sh-stat-lbl">Speed</div></div>
    <div class="sh-stat-cell"><div class="sh-stat-icon">${STAT_SVG}<span class="sh-stat-n">${c.defence || 0}</span></div><div class="sh-stat-lbl">Defence</div></div>
  </div>`;

  // ── TRACKERS ──
  const maxV = 9 + (c.blood_potency || 1);
  const maxWP = (getAttrDots(c, 'Resolve') || 0) + (getAttrDots(c, 'Composure') || 0);
  const infl = c.influence || [];
  const maxInf = infl.reduce((s, x) => s + (x.dots || 0), 0);

  // Load or seed persisted state
  const tKey = 'tm_tracker_' + c.name;
  let tState;
  try { tState = JSON.parse(localStorage.getItem(tKey) || 'null'); } catch (e) { tState = null; }
  if (!tState) tState = { vitae: maxV, wp: maxWP, inf: maxInf };
  tState.vitae = Math.max(0, Math.min(tState.vitae, maxV));
  tState.wp = Math.max(0, Math.min(tState.wp, maxWP));
  tState.inf = Math.max(0, Math.min(tState.inf, maxInf));
  // Always write back so toggleBox can read it
  localStorage.setItem(tKey, JSON.stringify(tState));

  function mkBoxRow(type, current, max, filledCls) {
    const disp = Math.min(max, 15);
    const boxes = Array.from({ length: disp }, (_, i) => {
      const filled = i < current;
      return `<div class="tbox${filled ? ' ' + filledCls : ''}" data-tracker="${type}" data-idx="${i}" data-max="${disp}" data-filled="${filledCls}"></div>`;
    }).join('');
    return `<div class="sh-tracker-row">
      <div class="sh-tracker-lbl">${type === 'vitae' ? 'Vitae' : type === 'wp' ? 'Willpower' : 'Influence'}</div>
      <div class="sh-tracker-boxes" id="tb-${type}">${boxes}</div>
      <div class="sh-tracker-num" id="tn-${type}">${current}/${max}</div>
    </div>`;
  }

  html += `<div class="sh-tracker-block" id="tracker-block">
    ${mkBoxRow('vitae', tState.vitae, maxV, 'vitae-filled')}
    ${mkBoxRow('wp', tState.wp, maxWP, 'wp-filled')}
    ${maxInf > 0 ? mkBoxRow('inf', tState.inf, maxInf, 'inf-filled') : ''}
  </div>`;

  // ── BODY ──
  html += `<div class="sh-body">`;

  // Attributes (column-first: Mental/Physical/Social)
  const ATTR_ROWS = [
    ['Intelligence', 'Strength', 'Presence'],
    ['Wits', 'Dexterity', 'Manipulation'],
    ['Resolve', 'Stamina', 'Composure'],
  ];
  html += `<div class="sh-sec"><div class="sh-sec-title">Attributes</div><div class="attr-grid">`;
  ATTR_ROWS.forEach(row => row.forEach(a => {
    const base = getAttrDots(c, a), bonus = getAttrBonus(c, a);
    html += `<div class="attr-cell"><div class="attr-name">${a}</div><div class="attr-dots">${dotsWithBonus(base, bonus)}</div></div>`;
  }));
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
      const bn = typeof sk === 'object' ? (sk.bonus_dots || 0) : 0;
      const na = typeof sk === 'object' && sk.nine_again;
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
      const discPowers = powersForDisc(c.powers || [], d);
      const hasPowers = discPowers.length > 0;
      const id = 'disc-' + c.name.replace(/[^a-z]/gi, '') + d.replace(/[^a-z]/gi, '');
      let drawerHtml = '';
      discPowers.forEach(p => {
        const pname = p.name.includes('|') ? p.name.split('|')[1].trim() : p.name;
        drawerHtml += `<div class="disc-power">
          <div class="disc-power-name">${pname}</div>
          ${p.stats ? `<div class="disc-power-stats">${p.stats}</div>` : ''}
          <div class="disc-power-effect">${p.effect || ''}</div>
        </div>`;
      });
      const nameTag = (nameStyle ? '<span class="disc-tap-name" style="' + nameStyle + '">' : '<span class="disc-tap-name">') + d + '</span>';
      const dotsTag = r ? `<span class="disc-tap-dots">${dots(r)}</span>` : '';
      if (!hasPowers) {
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

    const discEntries = Object.entries(c.disciplines);
    const coreDiscs = discEntries.filter(([d]) => CORE_DISCS.includes(d));
    const ritualDiscs = discEntries.filter(([d]) => RITUAL_DISCS.includes(d));
    const themeDiscs = discEntries.filter(([d]) => SORCERY_THEMES.includes(d));

    // 1. Disciplines
    if (coreDiscs.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Disciplines</div><div class="disc-list">`;
      coreDiscs.forEach(([d, r]) => { html += renderDiscRow(d, r, null); });
      html += `</div></div>`;
    }

    // 2. Devotions
    const others = otherPowers(c);
    const devotions = others.filter(p => p.name.trim().startsWith('Devotion'));
    if (devotions.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Devotions</div><div class="disc-list">`;
      devotions.forEach((p, i) => {
        const pname = p.name.includes('|') ? p.name.split('|')[1].trim() : p.name.replace(/^Devotion\s*\|\s*/i, '');
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

    // 3. Blood Sorcery (Cruac, Theban, then themes)
    if (ritualDiscs.length || themeDiscs.length) {
      html += `<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">`;
      ritualDiscs.forEach(([d, r]) => { html += renderDiscRow(d, r, 'color:rgba(220,160,120,.9)'); });
      if (themeDiscs.length) {
        html += `<div class="disc-sub-head">Themes</div>`;
        themeDiscs.forEach(([d, r]) => { html += renderDiscRow(d, r, 'color:rgba(220,160,120,.75)'); });
      }
      html += `</div></div>`;
    }

    // 4. Pacts (Oaths + Carthian Law)
    const pacts = others.filter(p => !p.name.trim().startsWith('Devotion'));
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
  const inflNew = c.influence || [];
  if (inflNew.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Influence Merits</div><div class="merit-list">`;
    let inflIdx = 0;
    inflNew.forEach(x => {
      const area = (x.area && x.area.trim()) ? x.area.trim() : null;
      const mStr = (area ? `${x.type} (${area})` : x.type) + (x.dots ? ' ' + dots(x.dots) : '');
      html += renderMeritRow(mStr, 'infl', inflIdx++);
    });
    html += `</div></div>`;
  }

  // ── Domain Merits ──
  const dom = c.domain || {};
  const domEntries = [
    { key: 'safe_place', label: 'Safe Place' },
    { key: 'haven', label: 'Haven' },
    { key: 'feeding_grounds', label: 'Feeding Grounds' },
    { key: 'herd', label: 'Herd' },
  ].filter(e => dom[e.key]);
  if (domEntries.length) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Domain Merits</div><div class="merit-list">`;
    domEntries.forEach(e => {
      html += `<div class="merit-plain"><span class="merit-name">${e.label}</span><span class="merit-dots">${dots(dom[e.key])}</span></div>`;
    });
    html += `</div></div>`;
  }

  // ── Standing Merits ──
  const stnd = c.standing || {};
  const hasMC = stnd.mystery_cult && stnd.mystery_cult.dots;
  const hasPT = stnd.prof_training && stnd.prof_training.dots;
  if (hasMC || hasPT) {
    html += `<div class="sh-sec"><div class="sh-sec-title">Standing Merits</div><div class="stand-list">`;
    if (hasMC) {
      html += `<div class="stand-row">
        <div class="stand-name-row"><span class="stand-label">Mystery Cult Initiation</span><span class="stand-dots">${dots(stnd.mystery_cult.dots)}</span></div>
        ${stnd.mystery_cult.name ? `<div class="stand-sub">${stnd.mystery_cult.name}</div>` : ''}
      </div>`;
    }
    if (hasPT) {
      html += `<div class="stand-row">
        <div class="stand-name-row"><span class="stand-label">Professional Training</span><span class="stand-dots">${dots(stnd.prof_training.dots)}</span></div>
        ${stnd.prof_training.role ? `<div class="stand-sub">${stnd.prof_training.role}</div>` : ''}
      </div>`;
    }
    html += `</div></div>`;
  }

  // ── Other Merits + Manoeuvres ──
  const allMerits = c.merits || [];
  const DOMAIN_NAMES = ['Safe Place', 'Haven', 'Feeding Grounds', 'Herd'];
  const STD_NAMES = ['Mystery Cult', 'Mystery Cult Initiation', 'Professional Training', 'Prof. Training'];

  function isMeritDomain(s) { return DOMAIN_NAMES.some(d => meritBase(s) === d); }
  function isMeritStanding(s) { return STD_NAMES.some(d => meritBase(s).startsWith(d)); }
  function isMeritManoeuvre(s) {
    const suf = meritSuffix(s);
    return !!(suf && MAN_DB[suf.toLowerCase()]);
  }

  const otherMerits = allMerits.filter(m => !isMeritDomain(m) && !isMeritStanding(m) && !isMeritManoeuvre(m));
  const manMerits = allMerits.filter(m => isMeritManoeuvre(m));

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
      const suf = meritSuffix(m);
      const base = meritBase(m);
      const rank = meritDotCount(m);
      const db = suf ? MAN_DB[suf.toLowerCase()] : null;
      const id = 'man' + i;
      const body = db ? `<div class="man-exp-body">
        <div class="man-style">${db.style} \u2014 Rank ${db.rank}</div>
        <div>${db.effect || ''}</div>
        ${db.prereq ? `<div class="man-prereq">Prerequisite: ${db.prereq}</div>` : ''}
      </div>` : `<div>${suf || m}</div>`;
      html += `<div class="exp-row" id="exp-row-${id}" onclick="toggleExp('${id}')">
        <div style="flex:1;min-width:0">
          <div class="merit-name">${suf || base}</div>
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
// Event delegation on tracker-block — avoids inline onclick and string-escaping issues
document.addEventListener('click', function(e){
  const box = e.target.closest('[data-tracker]');
  if(!box) return;
  const block = box.closest('#tracker-block');
  if(!block) return;

  const type = box.dataset.tracker;
  const idx  = parseInt(box.dataset.idx);
  const max  = parseInt(box.dataset.max);
  const filledCls = box.dataset.filled;

  // Resolve the tKey from the currently displayed character
  if(!state.sheetChar) return;
  const tKey = 'tm_tracker_' + state.sheetChar.name;
  let tState;
  try{ tState = JSON.parse(localStorage.getItem(tKey)||'null'); }catch(e){ tState=null; }
  if(!tState) return;

  const current = tState[type];
  // Tap filled → spend down to idx; tap empty → recover up to idx+1
  tState[type] = idx < current ? idx : idx + 1;
  tState[type] = Math.max(0, Math.min(tState[type], max));
  localStorage.setItem(tKey, JSON.stringify(tState));

  // Re-render boxes
  const boxesEl = document.getElementById('tb-'+type);
  const numEl   = document.getElementById('tn-'+type);
  if(boxesEl){
    boxesEl.innerHTML = Array.from({length:max},(_,i)=>{
      const filled = i < tState[type];
      return `<div class="tbox${filled?' '+filledCls:''}" data-tracker="${type}" data-idx="${i}" data-max="${max}" data-filled="${filledCls}"></div>`;
    }).join('');
  }
  // num shows true max (might exceed 15 display boxes for influence)
  const trueMax = type==='vitae'?(9+(state.sheetChar.blood_potency||1))
                : type==='wp'?((state.sheetChar.attributes&&(state.sheetChar.attributes['Resolve']||0)+(state.sheetChar.attributes['Composure']||0))||max)
                : (state.sheetChar.influence||[]).reduce((s,x)=>s+(x.dots||0),0);
  if(numEl) numEl.textContent = tState[type]+'/'+trueMax;
});
