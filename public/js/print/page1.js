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
  PAGE_MID, LEFT_PANEL, RIGHT_PANEL,
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

// ─── Left column 1: disciplines + ritual tracks + vitals ───────────────────
function renderLeftColumn(doc, data, assets) {
  const { x, w } = COL.disciplines;
  let y = M_TOP + 20;

  // DISCIPLINES mini-header
  miniHeader(doc, x, y, w, 'DISCIPLINES', { fontSize: 11 });
  y += 16;

  const discMap = {};
  (data.disciplines || []).forEach(d => { discMap[d.name] = d.dots; });

  const DISC_ROW = 13;

  DISCIPLINE_ORDER.forEach(name => {
    const val = discMap[name];
    doc.font(F.caslon).fontSize(9).fillColor(C.INK);
    doc.text(name.toUpperCase(), x, y, { lineBreak: false });
    if (val && val > 0) {
      dots(doc, x + w - 5 * DOT_GAP, y + 4, val, 5);
    } else {
      // em-dash placeholder to match Mammon's blank lines
      doc.font(F.body).fontSize(9).fillColor(C.GREY);
      doc.text('–', x + w - 6, y, { lineBreak: false });
    }
    y += DISC_ROW;
  });

  y += 6;
  RITUAL_ORDER.forEach(name => {
    const val = discMap[name] || discMap[name + ' Ritual'];
    doc.font(F.caslon).fontSize(9).fillColor(C.INK);
    doc.text(name.toUpperCase(), x, y, { lineBreak: false });
    if (val && val > 0) {
      dots(doc, x + w - 5 * DOT_GAP, y + 4, val, 5);
    } else {
      doc.font(F.body).fontSize(9).fillColor(C.GREY);
      doc.text('–', x + w - 6, y, { lineBreak: false });
    }
    y += DISC_ROW;
  });

  y += 10;

  // ── Blood Potency ────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'BLOOD POTENCY', { fontSize: 10 });
  y += 14;
  dots(doc, x + (w - 10 * DOT_GAP) / 2, y + 3, data.stats.blood_potency || 0, 10);
  y += 16;

  // ── Vitae ────────────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'VITAE', { fontSize: 10 });
  y += 14;
  const vmax = data.stats.vitae_max || 0;
  const vrow1 = Math.min(vmax, 10);
  const vrow2 = Math.max(0, vmax - 10);
  if (vrow1 > 0) {
    squares(doc, x + (w - vrow1 * SQ_GAP) / 2, y, 0, vrow1);
  }
  if (vrow2 > 0) {
    squares(doc, x + (w - vrow2 * SQ_GAP) / 2, y + 12, 0, vrow2);
  }
  y += vrow2 > 0 ? 26 : 14;

  // Vitae per turn + feed sources (derived)
  if (data.print_meta) {
    doc.font(F.bodyIt).fontSize(7.5).fillColor(C.GREY);
    if (data.print_meta.vitae_per_turn) {
      doc.text(`Vitae per turn: ${data.print_meta.vitae_per_turn}`, x, y, { width: w, align: 'center', lineBreak: false });
      y += 9;
    }
    if (data.print_meta.feed_sources && data.print_meta.feed_sources.length) {
      doc.text(`Can feed from: ${data.print_meta.feed_sources.join(', ')}`, x, y, { width: w, align: 'center', lineBreak: false });
      y += 9;
    }
    doc.fillColor(C.INK);
  }
  y += 6;

  // ── Health ───────────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'HEALTH', { fontSize: 10 });
  y += 14;
  const h = data.stats.health || 0;
  squares(doc, x + (w - h * SQ_GAP) / 2, y, 0, h);
  y += 20;

  // ── Willpower ────────────────────────────────────────────────────────────
  miniHeader(doc, x, y, w, 'WILLPOWER', { fontSize: 10 });
  y += 14;
  const wp = data.stats.willpower || 0;
  squares(doc, x + (w - wp * SQ_GAP) / 2, y, 0, wp);
  y += 24;

  // ── Size / Speed / Defence diamonds ──────────────────────────────────────
  renderStatDiamonds(doc, data, assets, x, y, w);
}

function renderStatDiamonds(doc, data, assets, x, y, w) {
  // Three diamonds across the column width using the painterly stat-diamond.png
  // (single black diamond shape) with the value number + label text drawn over.
  const dW = 48, dH = 54;
  const gap = (w - 3 * dW) / 4;

  const diamonds = [
    { label: 'SIZE',    value: data.stats.size },
    { label: 'SPEED',   value: data.stats.speed },
    { label: 'DEFENCE', value: data.stats.defence },
  ];

  diamonds.forEach((d, i) => {
    const dx = x + gap * (i + 1) + dW * i;
    if (assets['stat-diamond.png']) {
      doc.image(assets['stat-diamond.png'], dx, y, { width: dW, height: dH });
    } else {
      // Fallback: a red diamond polygon
      doc.save().polygon(
        [dx + dW/2, y],
        [dx + dW,   y + dH*0.5],
        [dx + dW/2, y + dH],
        [dx,        y + dH*0.5]
      ).fill(C.ACCENT).restore();
    }
    // Value number centred on diamond body
    doc.font(F.goudyBold).fontSize(17).fillColor(C.BANNER_C);
    doc.text(String(d.value || 0), dx, y + (dH - 17) / 2 - 2, {
      width: dW, align: 'center', lineBreak: false,
    });
    // Label below the diamond
    doc.font(F.caslon).fontSize(7).fillColor(C.INK);
    doc.text(d.label, dx, y + dH + 1, { width: dW, align: 'center', lineBreak: false });
  });
}

// ─── Left column 2: Influence / Kindred Status / Domain / Standing ────────
function renderInfluenceColumn(doc, data, assets) {
  const { x, w } = COL.influence;
  let y = M_TOP + 20;

  // INFLUENCE header with empty-box tally row
  miniHeader(doc, x, y, w, 'INFLUENCE', { fontSize: 11 });
  y += 16;
  const infN = Math.min(data.stats.influence_total || 0, 10);
  squares(doc, x + (w - infN * SQ_GAP) / 2, y, 0, infN);
  y += 12;
  squares(doc, x + (w - infN * SQ_GAP) / 2, y, 0, infN);
  y += 18;

  // Influence merits list
  const influenceMerits = (data.merits || []).filter(m => m.category === 'influence');
  influenceMerits.forEach(m => {
    doc.font(F.caslon).fontSize(8.5).fillColor(C.INK);
    doc.text(`${m.name} ${'●'.repeat(m.effective_rating)}`, x, y, { lineBreak: false });
    y += 10;
    if (m.qualifier) {
      doc.font(F.body).fontSize(7.5).fillColor(C.INK);
      doc.text(m.qualifier, x + 4, y, { width: w - 4, lineBreak: true });
      y = doc.y + 3;
    }
  });

  y += 6;

  // KINDRED STATUS
  miniHeader(doc, x, y, w, 'KINDRED STATUS', { fontSize: 10 });
  y += 14;
  const ksMerits = (data.merits || []).filter(m =>
    m.category === 'standing' && /Kindred Status/i.test(m.name)
  );
  ksMerits.forEach(m => {
    doc.font(F.body).fontSize(8.5).fillColor(C.INK);
    const label = m.qualifier || m.name.replace(/Kindred Status\s*\(?/, '').replace(/\)$/, '');
    doc.text(label, x, y, { lineBreak: false });
    const val = m.effective_rating > 0 ? '●'.repeat(m.effective_rating) : '–';
    doc.text(val, x + w - doc.widthOfString(val), y, { lineBreak: false });
    y += 11;
  });
  y += 6;

  // DOMAIN
  miniHeader(doc, x, y, w, 'DOMAIN', { fontSize: 10 });
  y += 14;
  const domainMerits = (data.merits || []).filter(m => m.category === 'domain');
  domainMerits.forEach(m => {
    doc.font(F.body).fontSize(8.5).fillColor(C.INK);
    doc.text(m.name, x, y, { lineBreak: false });
    const val = m.effective_rating > 0 ? '●'.repeat(m.effective_rating) : '–';
    doc.text(val, x + w - doc.widthOfString(val), y, { lineBreak: false });
    y += 11;
  });
  y += 6;

  // STANDING (Mystery Cult Initiation, Professional Training, etc.)
  miniHeader(doc, x, y, w, 'STANDING', { fontSize: 10 });
  y += 14;
  const standingMerits = (data.merits || []).filter(m =>
    m.category === 'standing' && !/Kindred Status/i.test(m.name)
  );
  standingMerits.forEach(m => {
    doc.font(F.body).fontSize(8.5).fillColor(C.INK);
    doc.text(m.name, x, y, { lineBreak: false });
    const val = m.effective_rating > 0 ? '●'.repeat(m.effective_rating) : '–';
    doc.text(val, x + w - doc.widthOfString(val), y, { lineBreak: false });
    y += 11;
    if (m.description) {
      doc.font(F.bodyIt).fontSize(7).fillColor(C.GREY);
      doc.text(m.description, x, y, { width: w });
      y = doc.y + 3;
      doc.fillColor(C.INK);
    }
  });
}

// ─── Left column 3: Humanity ladder + Mask/Dirge/Banes ─────────────────────
function renderHumanityColumn(doc, data, assets) {
  const { x, w } = COL.humanity;
  let y = M_TOP + 20;

  miniHeader(doc, x, y, w, 'HUMANITY', { fontSize: 11 });
  y += 16;

  // Bucket touchstones by humanity rating
  const touchByHum = {};
  (data.touchstones || []).forEach(t => {
    const h = t.humanity;
    if (!touchByHum[h]) touchByHum[h] = [];
    touchByHum[h].push(t.name);
  });

  // Ladder 10 down to 1
  const hum = data.stats.humanity || 0;
  const LADDER_ROW = 12;
  for (let rating = 10; rating >= 1; rating--) {
    // Rating number
    doc.font(F.caslon).fontSize(10).fillColor(C.INK);
    doc.text(`${rating}:`, x, y, { lineBreak: false });

    // Filled circle for current humanity
    if (rating === hum) {
      doc.circle(x + 15, y + 5, 3).fill(C.INK);
    }

    // Touchstones at this rating
    const ts = touchByHum[rating];
    if (ts && ts.length) {
      doc.font(F.bodyIt).fontSize(7.5).fillColor(C.INK);
      const label = ts.map(n => `(${n})`).join(', ');
      doc.text(label, x + 22, y, { width: w - 22, lineBreak: false, ellipsis: true });
    }
    y += LADDER_ROW;
  }

  y += 10;

  // Mask
  if (data.identity.mask) {
    doc.font(F.caslon).fontSize(10).fillColor(C.INK);
    doc.text(`MASK: ${data.identity.mask.toUpperCase()}`, x, y, { lineBreak: false });
    y += 13;
    const wpc = data.willpower_conditions || {};
    if (wpc.mask_1wp) {
      doc.font(F.bold).fontSize(7.5).fillColor(C.INK);
      doc.text('1 WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7.5).text(' ' + wpc.mask_1wp, { width: w });
      y = doc.y + 2;
    }
    if (wpc.mask_all) {
      doc.font(F.bold).fontSize(7.5);
      doc.text('All WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7.5).text(' ' + wpc.mask_all, { width: w });
      y = doc.y + 5;
    }
  }

  // Dirge
  if (data.identity.dirge) {
    doc.font(F.caslon).fontSize(10).fillColor(C.INK);
    doc.text(`DIRGE: ${data.identity.dirge.toUpperCase()}`, x, y, { lineBreak: false });
    y += 13;
    const wpc = data.willpower_conditions || {};
    if (wpc.dirge_1wp) {
      doc.font(F.bold).fontSize(7.5).fillColor(C.INK);
      doc.text('1 WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7.5).text(' ' + wpc.dirge_1wp, { width: w });
      y = doc.y + 2;
    }
    if (wpc.dirge_all) {
      doc.font(F.bold).fontSize(7.5);
      doc.text('All WP:', x, y, { lineBreak: false, continued: true });
      doc.font(F.body).fontSize(7.5).text(' ' + wpc.dirge_all, { width: w });
      y = doc.y + 5;
    }
  }

  // Banes & Curses
  y += 4;
  miniHeader(doc, x, y, w, 'BANES & CURSES', { fontSize: 10 });
  y += 14;
  (data.banes || []).forEach(b => {
    doc.font(F.caslon).fontSize(9).fillColor(C.INK);
    doc.text(b.name.toUpperCase(), x, y, { lineBreak: false });
    y += 11;
    doc.font(F.body).fontSize(7.5).fillColor(C.INK);
    doc.text(b.effect, x, y, { width: w });
    y = doc.y + 5;
  });
}

// ─── Masthead (RIGHT PANEL TOP): logo + name banner, 3 columns below ──────
function renderMasthead(doc, data, assets) {
  const { x, w } = COL.masthead;

  // Reserve right edge for the vertically-stacked status diamonds
  const diamondColW = 58;
  const mastheadInnerW = w - diamondColW - 4;

  // ── Row 1: logo + character name + Terra Mortis tagline ────────────────
  // Logo sits at the top-left of the right panel. To its right we draw the
  // ornate name-banner.png plate with the character's name centred over it,
  // and "Terra Mortis" underneath.
  // Prefer the transparent PNG version over the JPG fallback — the JPG has
  // an opaque white rectangle that looks bad on the cream parchment.
  const lw = 110, lh = 64;
  const logoAsset = assets['logo-vampire.png'] || assets['logo-vampire.jpg'];
  if (logoAsset) {
    doc.image(logoAsset, x - 4, M_TOP - 2, { width: lw, height: lh });
  }

  const nameAreaX = x + lw + 6;
  const nameAreaW = mastheadInnerW - lw - 6;

  // Character name — large red small-caps, shrink-to-fit.
  // Mammon target draws this as plain accent-coloured text with no banner
  // plate — name-banner.png has a transparent interior so cream text
  // would disappear against the cream parchment.
  const nameText = data.identity.displayName.toUpperCase();
  let nameSize = 22;
  doc.font(F.caslon).fontSize(nameSize);
  while (doc.widthOfString(nameText) > nameAreaW - 8 && nameSize > 10) {
    nameSize -= 0.5;
    doc.fontSize(nameSize);
  }
  doc.fillColor(C.ACCENT);
  doc.text(nameText, nameAreaX, M_TOP + 8, {
    width: nameAreaW, lineBreak: false,
  });

  // Terra Mortis tagline beneath the name
  doc.font(F.caslon).fontSize(12).fillColor(C.INK);
  doc.text('Terra Mortis', nameAreaX, M_TOP + 34, {
    width: nameAreaW, lineBreak: false,
  });

  // ── Row 2: identity fields (col A) + cov/clan blocks (col B) ───────────
  let y = M_TOP + lh + 14;
  const colAW = 172;
  const colBX = x + colAW + 12;
  const colBW = mastheadInnerW - colAW - 12;

  field(doc, x, y,      'Player',  data.identity.player,  colAW); y += 14;
  field(doc, x, y,      'Concept', data.identity.concept, colAW); y += 14;
  const xpDisplay = (data.print_meta && data.print_meta.xp_display)
    || `${data.xp.remaining} / ${data.xp.earned}`;
  field(doc, x, y,      'XP',      xpDisplay,              colAW); y += 14;
  const printDate = (data.print_meta && data.print_meta.printed_date)
    || todayDDMMMYY();
  field(doc, x, y,      'Printed', printDate,              colAW);

  // Covenant + Clan block (col B) aligned with identity fields
  renderCovClanBlocks(doc, data, assets, colBX, M_TOP + lh + 14, colBW);

  // Status diamonds stacked vertically on the far right
  renderStatusDiamondsVertical(doc, data, assets,
    x + mastheadInnerW + 6, M_TOP + lh + 10, diamondColW - 6);
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
  const dW = Math.min(w, 52);
  const dH = 48;
  const rowGap = 6;

  const entries = [
    { img: 'diamond-city-status.png', value: status.city     || 0, label: 'CITY' },
    { img: 'diamond-cov-status.png',  value: status.covenant || 0, label: 'COV' },
    { img: 'diamond-clan-status.png', value: status.clan     || 0, label: 'CLAN' },
  ];

  entries.forEach((d, i) => {
    const dy = y + i * (dH + rowGap);
    if (assets[d.img]) {
      doc.image(assets[d.img], x, dy, { width: dW, height: dH });
    }
    // Value centred in the upper portion of the diamond
    doc.font(F.goudyBold).fontSize(16).fillColor(C.BANNER_C);
    doc.text(String(d.value), x, dy + 10, { width: dW, align: 'center', lineBreak: false });
    // Label below in small caps
    doc.font(F.caslon).fontSize(6.5).fillColor(C.BANNER_C);
    doc.text(d.label, x, dy + 30, { width: dW, align: 'center', lineBreak: false });
    doc.fillColor(C.INK);
  });
}

// ─── Attributes section (right panel middle) ──────────────────────────────
function renderAttributes(doc, data, assets) {
  const { x, w } = RIGHT_PANEL;
  const y0 = M_TOP + 230;    // below masthead (logo 58 + id fields 56 + cov/clan 90 + padding)
  const bannerH = 26;

  sectionBanner(doc, x, y0, w, bannerH, 'ATTRIBUTES',
    assets['short-banner.png'] || assets['banner-section.png'], 15);

  // Three column sub-headers: Mental / Physical / Social
  const colW = w / 3;
  const ySub = y0 + bannerH + 6;
  ['MENTAL', 'PHYSICAL', 'SOCIAL'].forEach((label, i) => {
    doc.font(F.caslon).fontSize(11).fillColor(C.ACCENT);
    doc.text(label, x + i * colW, ySub, { width: colW, align: 'center', lineBreak: false });
  });
  doc.fillColor(C.INK);

  // Three rows (Power, Finesse, Resistance) × three columns
  const yRow = ySub + 20;
  const rowGap = 18;
  ATTR_GRID.forEach((row, ri) => {
    ['Mental', 'Physical', 'Social'].forEach((cat, ci) => {
      const name = row[cat];
      const val = data.attributes[name];
      if (!val) return;
      const rowX = x + ci * colW + 12;
      const rowW = colW - 24;
      traitRow(doc, rowX, yRow + ri * rowGap, name, val.effective, 5, rowW,
        { fontSize: 9 });
    });
  });
}

// ─── Skills section (right panel bottom) ──────────────────────────────────
function renderSkills(doc, data, assets) {
  const { x, w } = RIGHT_PANEL;
  const y0 = M_TOP + 340;    // below attributes (banner 26 + subheader 20 + 3 rows 18)
  const bannerH = 26;

  sectionBanner(doc, x, y0, w, bannerH, 'SKILLS',
    assets['short-banner.png'] || assets['banner-section.png'], 15);

  const colW = w / 3;
  const subtitles = {
    Mental: '(−3 unskilled)',
    Physical: '(−1 unskilled)',
    Social: '(−1 unskilled)',
  };

  const skillMap = {};
  (data.skills || []).forEach(s => { skillMap[s.name] = s; });

  const ySub = y0 + bannerH + 6;
  const yRow = ySub + 22;
  const rowGap = 18;

  ['Mental', 'Physical', 'Social'].forEach((cat, ci) => {
    // Category label + unskilled penalty subtitle
    doc.font(F.caslon).fontSize(11).fillColor(C.ACCENT);
    doc.text(cat.toUpperCase(), x + ci * colW, ySub, { width: colW, align: 'center', lineBreak: false });
    doc.font(F.bodyIt).fontSize(7).fillColor(C.GREY);
    doc.text(subtitles[cat], x + ci * colW, ySub + 13, { width: colW, align: 'center', lineBreak: false });
    doc.fillColor(C.INK);

    ALL_SKILLS[cat].forEach((sname, si) => {
      const s = skillMap[sname];
      const dotsN = s ? s.effective : 0;
      const rowX = x + ci * colW + 12;
      const rowW = colW - 24;
      skillRow(doc, rowX, yRow + si * rowGap, sname.toUpperCase(), dotsN, rowW,
        s && s.specialisations, { fontSize: 8.5 });
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
