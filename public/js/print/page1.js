/**
 * Page 1 renderer — A4 landscape, matches specs/guidance/pdf-target/mammon-1.png
 *
 * Layout zones (x coords are PDF points from left edge of page):
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ DISC.  │ INFLUENCE  │ HUMANITY │ ═════ MASTHEAD (logo + name) ═════ │
 *   │ column │ KINDRED ST │ MASK     │ Player / Concept / XP / Printed   │
 *   │        │ DOMAIN     │ DIRGE    │ ┌ COV ┐  CITY  COV  CLAN (diamond)│
 *   │        │ STANDING   │ BANES    │ └ CLAN┘                            │
 *   │ BP ●●  │            │          │ ═══ ATTRIBUTES ═══                │
 *   │ Vitae  │            │          │ Mental  Physical  Social          │
 *   │ Health │            │          │ ═══ SKILLS ═══                    │
 *   │ Willp. │            │          │ Mental  Physical  Social          │
 *   │ Size Speed Def ♦    │          │                                    │
 *   └─────────────────────────────────────────────────────────────────────┘
 */

import {
  PAGE_W, PAGE_H, M_LEFT, M_RIGHT, M_TOP, M_BOTTOM, CW, CH,
  COL, C, F, DOT_GAP, SQ_GAP,
  ALL_SKILLS, ATTR_GRID, DISCIPLINE_ORDER, RITUAL_ORDER,
} from './layout.js';

import {
  dots, squares, field, miniHeader, sectionBanner,
  skillRow, traitRow, paragraph,
} from './helpers.js';

import { COVENANT_ICONS, CLAN_ICONS } from './iconmap.js';

function renderPage1(doc, data, assets) {
  // Full-page background — draws the red parchment border and cream field
  if (assets['background.jpg']) {
    doc.image(assets['background.jpg'], 0, 0, { width: PAGE_W, height: PAGE_H });
  }

  renderLeftColumn(doc, data, assets);
  renderInfluenceColumn(doc, data, assets);
  renderHumanityColumn(doc, data, assets);
  renderMasthead(doc, data, assets);
  renderAttributes(doc, data, assets);
  renderSkills(doc, data, assets);
}

// ─── Left column: disciplines + ritual tracks + vitals ───────────────────────
function renderLeftColumn(doc, data, assets) {
  const { x, w } = COL.disciplines;
  let y = M_TOP + 18;

  // DISCIPLINES mini-header
  miniHeader(doc, x, y, w, 'DISCIPLINES', { fontSize: 10 });
  y += 14;

  const discMap = {};
  (data.disciplines || []).forEach(d => { discMap[d.name] = d.dots; });

  DISCIPLINE_ORDER.forEach(name => {
    const val = discMap[name];
    doc.font(F.caslon).fontSize(8).fillColor(C.INK);
    doc.text(name.toUpperCase(), x, y, { lineBreak: false });
    if (val && val > 0) {
      dots(doc, x + w - 5 * DOT_GAP, y + 3, val, 5);
    } else {
      // em-dash placeholder to match Mammon's blank lines
      doc.font(F.body).fontSize(8).fillColor(C.GREY);
      doc.text('–', x + w - 6, y, { lineBreak: false });
    }
    y += 11;
  });

  y += 4;
  RITUAL_ORDER.forEach(name => {
    const val = discMap[name] || discMap[name + ' Ritual'];
    doc.font(F.caslon).fontSize(8).fillColor(C.INK);
    doc.text(name.toUpperCase(), x, y, { lineBreak: false });
    if (val && val > 0) {
      dots(doc, x + w - 5 * DOT_GAP, y + 3, val, 5);
    } else {
      doc.font(F.body).fontSize(8).fillColor(C.GREY);
      doc.text('–', x + w - 6, y, { lineBreak: false });
    }
    y += 11;
  });

  y += 6;

  // ── Blood Potency ────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'BLOOD POTENCY');
  y += 11;
  dots(doc, x + (w - 10 * DOT_GAP) / 2, y + 2, data.stats.blood_potency || 0, 10);
  y += 12;

  // ── Vitae ────────────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'VITAE');
  y += 11;
  // Two rows of squares (11 max for BP2), wrap at 10 per row
  const vmax = data.stats.vitae_max || 0;
  const vrow1 = Math.min(vmax, 10);
  const vrow2 = Math.max(0, vmax - 10);
  if (vrow1 > 0) {
    squares(doc, x + (w - vrow1 * SQ_GAP) / 2, y, 0, vrow1);
  }
  if (vrow2 > 0) {
    squares(doc, x + (w - vrow2 * SQ_GAP) / 2, y + 10, 0, vrow2);
  }
  y += vrow2 > 0 ? 22 : 14;

  // Vitae per turn + feed sources (derived)
  if (data.print_meta) {
    doc.font(F.bodyIt).fontSize(6.5).fillColor(C.GREY);
    if (data.print_meta.vitae_per_turn) {
      doc.text(`Vitae per turn: ${data.print_meta.vitae_per_turn}`, x, y, { width: w, align: 'center', lineBreak: false });
      y += 7;
    }
    if (data.print_meta.feed_sources && data.print_meta.feed_sources.length) {
      doc.text(`Can feed from: ${data.print_meta.feed_sources.join(', ')}`, x, y, { width: w, align: 'center', lineBreak: false });
      y += 7;
    }
    doc.fillColor(C.INK);
  }
  y += 4;

  // ── Health ───────────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'HEALTH');
  y += 11;
  const h = data.stats.health || 0;
  squares(doc, x + (w - h * SQ_GAP) / 2, y, 0, h);
  y += 14;

  // ── Willpower ────────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'WILLPOWER');
  y += 11;
  const wp = data.stats.willpower || 0;
  squares(doc, x + (w - wp * SQ_GAP) / 2, y, 0, wp);
  y += 18;

  // ── Size / Speed / Defence diamonds ──────────────────────────────────────
  renderStatDiamonds(doc, data, assets, x, y, w);
}

function renderStatDiamonds(doc, data, assets, x, y, w) {
  // Three diamonds across the column width. Each diamond PNG is ~147-157 × 172.
  // Display width target: ~35pt each.
  const dW = 38, dH = 42;
  const gap = (w - 3 * dW) / 4;
  const yx = [
    x + gap,
    x + gap * 2 + dW,
    x + gap * 3 + dW * 2,
  ];

  const diamonds = [
    { img: 'diamond-size.png',    value: data.stats.size },
    { img: 'diamond-speed.png',   value: data.stats.speed },
    { img: 'diamond-defence.png', value: data.stats.defence },
  ];

  diamonds.forEach((d, i) => {
    const dx = yx[i];
    if (assets[d.img]) {
      doc.image(assets[d.img], dx, y, { width: dW, height: dH });
    } else {
      // Fallback: empty diamond outline
      doc.save().polygon(
        [dx + dW/2, y],
        [dx + dW,   y + dH*0.45],
        [dx + dW/2, y + dH*0.6],
        [dx,        y + dH*0.45]
      ).fill(C.ACCENT).restore();
    }
    // Large value number centred on diamond body
    doc.font(F.goudyBold).fontSize(14).fillColor(C.BANNER_C);
    doc.text(String(d.value || 0), dx, y + 10, { width: dW, align: 'center', lineBreak: false });
    doc.fillColor(C.INK);
  });
}

// ─── Influence / Kindred Status / Domain / Standing column ──────────────────
function renderInfluenceColumn(doc, data, assets) {
  const { x, w } = COL.influence;
  let y = M_TOP + 18;

  // INFLUENCE header with empty-box tally row
  miniHeader(doc, x, y, w, 'INFLUENCE');
  y += 11;
  // Two rows of empty squares (visual tally; total count = stats.influence_total * 2)
  const infN = Math.min(data.stats.influence_total || 0, 10);
  squares(doc, x + (w - infN * SQ_GAP) / 2, y, 0, infN);
  y += 10;
  squares(doc, x + (w - infN * SQ_GAP) / 2, y, 0, infN);
  y += 14;

  // Influence merits list
  const influenceMerits = (data.merits || []).filter(m => m.category === 'influence');
  influenceMerits.forEach(m => {
    const label = m.qualifier ? `${m.name} ${'●'.repeat(m.effective_rating)}` : `${m.name} ${'●'.repeat(m.effective_rating)}`;
    doc.font(F.caslon).fontSize(7.5).fillColor(C.INK);
    doc.text(`${m.name} ${'●'.repeat(m.effective_rating)}`, x, y, { lineBreak: false });
    y += 8;
    if (m.qualifier) {
      doc.font(F.body).fontSize(7).fillColor(C.INK);
      doc.text(m.qualifier, x + 4, y, { width: w - 4, lineBreak: true });
      y = doc.y + 2;
    }
  });

  y += 4;

  // KINDRED STATUS
  miniHeader(doc, x, y, w, 'KINDRED STATUS');
  y += 11;
  const ksMerits = (data.merits || []).filter(m =>
    m.category === 'standing' && /Kindred Status/i.test(m.name)
  );
  ksMerits.forEach(m => {
    doc.font(F.body).fontSize(7.5).fillColor(C.INK);
    const label = m.qualifier || m.name.replace(/Kindred Status\s*\(?/, '').replace(/\)$/, '');
    doc.text(label, x, y, { lineBreak: false });
    const val = m.effective_rating > 0 ? '●'.repeat(m.effective_rating) : '–';
    doc.text(val, x + w - doc.widthOfString(val), y, { lineBreak: false });
    y += 9;
  });
  y += 4;

  // DOMAIN
  miniHeader(doc, x, y, w, 'DOMAIN');
  y += 11;
  const domainMerits = (data.merits || []).filter(m => m.category === 'domain');
  domainMerits.forEach(m => {
    doc.font(F.body).fontSize(7.5).fillColor(C.INK);
    doc.text(m.name, x, y, { lineBreak: false });
    const val = m.effective_rating > 0 ? '●'.repeat(m.effective_rating) : '–';
    doc.text(val, x + w - doc.widthOfString(val), y, { lineBreak: false });
    y += 9;
  });
  y += 4;

  // STANDING (Mystery Cult Initiation, Professional Training, etc.)
  miniHeader(doc, x, y, w, 'STANDING');
  y += 11;
  const standingMerits = (data.merits || []).filter(m =>
    m.category === 'standing' && !/Kindred Status/i.test(m.name)
  );
  standingMerits.forEach(m => {
    doc.font(F.body).fontSize(7.5).fillColor(C.INK);
    doc.text(m.name, x, y, { lineBreak: false });
    const val = m.effective_rating > 0 ? '●'.repeat(m.effective_rating) : '–';
    doc.text(val, x + w - doc.widthOfString(val), y, { lineBreak: false });
    y += 9;
    if (m.description) {
      doc.font(F.bodyIt).fontSize(6.5).fillColor(C.GREY);
      doc.text(m.description, x, y, { width: w });
      y = doc.y + 2;
      doc.fillColor(C.INK);
    }
  });
}

// ─── Humanity ladder + Mask/Dirge/Banes ─────────────────────────────────────
function renderHumanityColumn(doc, data, assets) {
  const { x, w } = COL.humanity;
  let y = M_TOP + 18;

  miniHeader(doc, x, y, w, 'HUMANITY');
  y += 12;

  // Bucket touchstones by humanity rating
  const touchByHum = {};
  (data.touchstones || []).forEach(t => {
    const h = t.humanity;
    if (!touchByHum[h]) touchByHum[h] = [];
    touchByHum[h].push(t.name);
  });

  // Ladder 10 down to 1
  const hum = data.stats.humanity || 0;
  for (let rating = 10; rating >= 1; rating--) {
    // Rating number
    doc.font(F.caslon).fontSize(9).fillColor(C.INK);
    doc.text(`${rating}:`, x, y, { lineBreak: false });

    // Filled circle for current humanity
    if (rating === hum) {
      doc.circle(x + 13, y + 4, 2.5).fill(C.INK);
    }

    // Touchstones at this rating
    const ts = touchByHum[rating];
    if (ts && ts.length) {
      doc.font(F.bodyIt).fontSize(7).fillColor(C.INK);
      const label = ts.map(n => `(${n})`).join(', ');
      doc.text(label, x + 20, y, { width: w - 20, lineBreak: false, ellipsis: true });
    }
    y += 10;
  }

  y += 6;

  // Mask
  if (data.identity.mask) {
    doc.font(F.caslon).fontSize(9).fillColor(C.INK);
    doc.text(`MASK: ${data.identity.mask.toUpperCase()}`, x, y, { lineBreak: false });
    y += 11;
    const wpc = data.willpower_conditions || {};
    if (wpc.mask_1wp) {
      doc.font(F.bold).fontSize(7).fillColor(C.INK);
      doc.text('1 WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7).text(' ' + wpc.mask_1wp, { width: w });
      y = doc.y + 1;
    }
    if (wpc.mask_all) {
      doc.font(F.bold).fontSize(7);
      doc.text('All WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7).text(' ' + wpc.mask_all, { width: w });
      y = doc.y + 3;
    }
  }

  // Dirge
  if (data.identity.dirge) {
    doc.font(F.caslon).fontSize(9).fillColor(C.INK);
    doc.text(`DIRGE: ${data.identity.dirge.toUpperCase()}`, x, y, { lineBreak: false });
    y += 11;
    const wpc = data.willpower_conditions || {};
    if (wpc.dirge_1wp) {
      doc.font(F.bold).fontSize(7).fillColor(C.INK);
      doc.text('1 WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7).text(' ' + wpc.dirge_1wp, { width: w });
      y = doc.y + 1;
    }
    if (wpc.dirge_all) {
      doc.font(F.bold).fontSize(7);
      doc.text('All WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7).text(' ' + wpc.dirge_all, { width: w });
      y = doc.y + 3;
    }
  }

  // Banes & Curses
  y += 3;
  miniHeader(doc, x, y, w, 'BANES & CURSES');
  y += 11;
  (data.banes || []).forEach(b => {
    doc.font(F.caslon).fontSize(8).fillColor(C.INK);
    doc.text(b.name.toUpperCase(), x, y, { lineBreak: false });
    y += 9;
    doc.font(F.body).fontSize(7).fillColor(C.INK);
    doc.text(b.effect, x, y, { width: w });
    y = doc.y + 3;
  });
}

// ─── Masthead: logo + name, 3 columns (identity / cov+clan / status diamonds) ─
function renderMasthead(doc, data, assets) {
  const { x, w } = COL.masthead;

  // Reserve right edge for the vertically-stacked status diamonds
  const diamondColW = 54;
  const mastheadInnerW = w - diamondColW;

  // ── Row 1: logo + name + tagline ─────────────────────────────────────────
  const lw = 95, lh = 55;
  if (assets['logo-vampire.jpg']) {
    doc.image(assets['logo-vampire.jpg'], x, M_TOP, { width: lw, height: lh });
  }

  const nameX = x + lw + 8;
  const nameW = mastheadInnerW - lw - 8;

  // Fit character name on a single line by shrinking if it would overflow
  const nameText = data.identity.displayName.toUpperCase();
  let nameSize = 19;
  doc.font(F.caslon).fontSize(nameSize);
  while (doc.widthOfString(nameText) > nameW && nameSize > 10) {
    nameSize -= 0.5;
    doc.fontSize(nameSize);
  }
  doc.fillColor(C.ACCENT);
  doc.text(nameText, nameX, M_TOP + 5, { width: nameW, lineBreak: false });

  // Terra Mortis tagline beneath the name
  doc.font(F.caslon).fontSize(11).fillColor(C.INK);
  doc.text('Terra Mortis', nameX, M_TOP + 30, { width: nameW, lineBreak: false });

  // ── Row 2: identity fields (col A)  +  cov/clan blocks (col B) ──────────
  let y = M_TOP + lh + 6;
  const colAW = 170;
  const colBX = x + colAW + 10;
  const colBW = mastheadInnerW - colAW - 10;

  field(doc, x, y,      'Player',  data.identity.player,  colAW); y += 12;
  field(doc, x, y,      'Concept', data.identity.concept, colAW); y += 12;
  const xpDisplay = (data.print_meta && data.print_meta.xp_display)
    || `${data.xp.remaining} / ${data.xp.earned}`;
  field(doc, x, y,      'XP',      xpDisplay,              colAW); y += 12;
  const printDate = (data.print_meta && data.print_meta.printed_date)
    || todayDDMMMYY();
  field(doc, x, y,      'Printed', printDate,              colAW);

  // Covenant + Clan block (col B) starts aligned with the first identity field
  renderCovClanBlocks(doc, data, assets, colBX, M_TOP + lh + 6, colBW);

  // ── Col C: three status diamonds stacked vertically on the far right ────
  renderStatusDiamondsVertical(doc, data, assets,
    x + mastheadInnerW + 4, M_TOP + lh + 2, diamondColW - 4);
}

function renderCovClanBlocks(doc, data, assets, x, y, w) {
  const covName = data.identity.covenant;
  const clanName = data.identity.clan;
  const covIconFile = covName && COVENANT_ICONS[covName];
  const clanIconFile = clanName && CLAN_ICONS[clanName];

  const iconSize = 32;
  const rowH = 38;
  const textX = x + iconSize + 6;
  const textW = w - iconSize - 6;

  // Shrink-to-fit helper — covenant names can be long ("CARTHIAN MOVEMENT"),
  // so auto-reduce font size until they fit on one line.
  function fitOneLine(text, maxW, startSize, minSize) {
    let size = startSize;
    doc.font(F.caslon).fontSize(size);
    while (doc.widthOfString(text) > maxW && size > minSize) {
      size -= 0.5;
      doc.fontSize(size);
    }
    return size;
  }

  // Covenant row — icon left, shrink-to-fit name right
  if (covIconFile && assets[covIconFile]) {
    doc.image(assets[covIconFile], x, y, { width: iconSize, height: iconSize });
  }
  const covText = covName ? covName.toUpperCase() : '';
  const covSize = fitOneLine(covText, textW, 12, 7);
  doc.fillColor(C.ACCENT);
  doc.text(covText, textX, y + (iconSize - covSize) / 2, { width: textW, lineBreak: false });

  // Clan row
  const y2 = y + rowH;
  if (clanIconFile && assets[clanIconFile]) {
    doc.image(assets[clanIconFile], x, y2, { width: iconSize, height: iconSize });
  }
  const clanText = clanName ? clanName.toUpperCase() : '';
  const clanSize = fitOneLine(clanText, textW, 12, 7);
  doc.fillColor(C.ACCENT);
  doc.text(clanText, textX, y2 + (iconSize - clanSize) / 2, { width: textW, lineBreak: false });
  doc.fillColor(C.INK);
}

/** Three status diamonds stacked vertically on the far right of the masthead */
function renderStatusDiamondsVertical(doc, data, assets, x, y, w) {
  const status = (data.stats && data.stats.status) || {};
  const dW = Math.min(w, 48);
  const dH = 40;
  const rowGap = 4;

  const entries = [
    { img: 'diamond-city-status.png', value: status.city     || 0 },
    { img: 'diamond-cov-status.png',  value: status.covenant || 0 },
    { img: 'diamond-clan-status.png', value: status.clan     || 0 },
  ];

  entries.forEach((d, i) => {
    const dy = y + i * (dH + rowGap);
    if (assets[d.img]) {
      doc.image(assets[d.img], x, dy, { width: dW, height: dH });
    }
    doc.font(F.goudyBold).fontSize(14).fillColor(C.BANNER_C);
    doc.text(String(d.value), x, dy + 8, { width: dW, align: 'center', lineBreak: false });
    doc.fillColor(C.INK);
  });
}

// ─── Attributes section ──────────────────────────────────────────────────────
function renderAttributes(doc, data, assets) {
  const { x, w } = COL.masthead;
  const y0 = M_TOP + 160;
  const bannerH = 20;

  sectionBanner(doc, x, y0, w, bannerH, 'ATTRIBUTES', assets['banner-section.png'], 13);

  // Three column sub-headers: Mental / Physical / Social
  const colW = w / 3;
  const ySub = y0 + bannerH + 4;
  ['MENTAL', 'PHYSICAL', 'SOCIAL'].forEach((label, i) => {
    doc.font(F.caslon).fontSize(10).fillColor(C.ACCENT);
    doc.text(label, x + i * colW, ySub, { width: colW, align: 'center', lineBreak: false });
  });
  doc.fillColor(C.INK);

  // Three rows (Power, Finesse, Resistance) × three columns
  const yRow = ySub + 15;
  ATTR_GRID.forEach((row, ri) => {
    ['Mental', 'Physical', 'Social'].forEach((cat, ci) => {
      const name = row[cat];
      const val = data.attributes[name];
      if (!val) return;
      const rowX = x + ci * colW + 10;
      const rowW = colW - 20;
      traitRow(doc, rowX, yRow + ri * 13, name, val.effective, 5, rowW);
    });
  });
}

// ─── Skills section ──────────────────────────────────────────────────────────
function renderSkills(doc, data, assets) {
  const { x, w } = COL.masthead;
  const y0 = M_TOP + 240;
  const bannerH = 20;

  sectionBanner(doc, x, y0, w, bannerH, 'SKILLS', assets['banner-section.png'], 13);

  const colW = w / 3;
  const subtitles = {
    Mental: '(−3 unskilled)',
    Physical: '(−1 unskilled)',
    Social: '(−1 unskilled)',
  };

  const skillMap = {};
  (data.skills || []).forEach(s => { skillMap[s.name] = s; });

  const ySub = y0 + bannerH + 4;
  const yRow = ySub + 16;
  const rowGap = 13;

  ['Mental', 'Physical', 'Social'].forEach((cat, ci) => {
    // Category label + unskilled penalty subtitle
    doc.font(F.caslon).fontSize(10).fillColor(C.ACCENT);
    doc.text(cat.toUpperCase(), x + ci * colW, ySub, { width: colW, align: 'center', lineBreak: false });
    doc.font(F.bodyIt).fontSize(6.5).fillColor(C.GREY);
    doc.text(subtitles[cat], x + ci * colW, ySub + 11, { width: colW, align: 'center', lineBreak: false });
    doc.fillColor(C.INK);

    ALL_SKILLS[cat].forEach((sname, si) => {
      const s = skillMap[sname];
      const dotsN = s ? s.effective : 0;
      const rowX = x + ci * colW + 10;
      const rowW = colW - 20;
      skillRow(doc, rowX, yRow + si * rowGap, sname.toUpperCase(), dotsN, rowW, s && s.specialisations);
    });
  });
}

function todayDDMMMYY() {
  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = months[d.getMonth()];
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `${dd}-${mmm}-${yy}`;
}

export { renderPage1 };
