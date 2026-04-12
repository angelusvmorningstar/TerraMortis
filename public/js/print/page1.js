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
  dots, squares, capacityRow, field, miniHeader, sectionBanner,
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
  // Always 20 boxes in 2 rows of 10. First vitae_max outlined empty, rest solid black.
  miniHeader(doc, x, y, w, 'VITAE', { fontSize: 10 });
  y += 14;
  const vmax = data.stats.vitae_max || 0;
  const vRowX = x + (w - 10 * SQ_GAP) / 2;
  capacityRow(doc, vRowX, y, Math.min(vmax, 10), 10);
  y += 12;
  capacityRow(doc, vRowX, y, Math.max(0, vmax - 10), 10);
  y += 14;

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
  // Always 15 boxes in 10 + 5. First `health` outlined, rest solid black.
  miniHeader(doc, x, y, w, 'HEALTH', { fontSize: 10 });
  y += 14;
  const h = data.stats.health || 0;
  const hRow1X = x + (w - 10 * SQ_GAP) / 2;
  const hRow2X = x + (w - 5 * SQ_GAP) / 2;
  capacityRow(doc, hRow1X, y, Math.min(h, 10), 10);
  y += 12;
  capacityRow(doc, hRow2X, y, Math.max(0, h - 10), 5);
  y += 16;

  // ── Willpower ────────────────────────────────────────────────────────────
  // Always 10 boxes in a row. First `willpower` outlined, rest solid black.
  miniHeader(doc, x, y, w, 'WILLPOWER', { fontSize: 10 });
  y += 14;
  const wp = data.stats.willpower || 0;
  capacityRow(doc, x + (w - 10 * SQ_GAP) / 2, y, Math.min(wp, 10), 10);
  y += 22;

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

  // Small helper: draw the rating on the right edge of the column as real
  // circles (via dots() primitive). A zero rating renders as an em-dash so
  // missing merits are still visible. Avoids the U+25CF glyph which the body
  // font has no character for.
  const dotR = 1.9;
  const dotG = 5;
  function ratingGlyphs(rating, rowY) {
    if (rating > 0) {
      const dotsW = rating * dotG;
      dots(doc, x + w - dotsW, rowY + 4, rating, rating, { r: dotR, gap: dotG });
    } else {
      doc.font(F.body).fontSize(8).fillColor(C.GREY);
      doc.text('–', x + w - 5, rowY, { lineBreak: false });
      doc.fillColor(C.INK);
    }
  }

  // Influence merits list — name on the left, real dots on the right.
  const influenceMerits = (data.merits || []).filter(m => m.category === 'influence');
  influenceMerits.forEach(m => {
    doc.font(F.caslon).fontSize(8.5).fillColor(C.INK);
    doc.text(m.name, x, y, { lineBreak: false });
    ratingGlyphs(m.effective_rating, y);
    y += 10;
    if (m.qualifier) {
      doc.font(F.body).fontSize(7.5).fillColor(C.INK);
      doc.text(m.qualifier, x + 4, y, { width: w - 4, lineBreak: true });
      y = doc.y + 3;
    }
  });

  y += 10;

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
    ratingGlyphs(m.effective_rating, y);
    y += 11;
  });
  y += 10;

  // DOMAIN
  miniHeader(doc, x, y, w, 'DOMAIN', { fontSize: 10 });
  y += 14;
  const domainMerits = (data.merits || []).filter(m => m.category === 'domain');
  domainMerits.forEach(m => {
    doc.font(F.body).fontSize(8.5).fillColor(C.INK);
    doc.text(m.name, x, y, { lineBreak: false });
    ratingGlyphs(m.effective_rating, y);
    y += 11;
  });
  y += 10;

  // STANDING (Mystery Cult Initiation, Professional Training, etc.)
  miniHeader(doc, x, y, w, 'STANDING', { fontSize: 10 });
  y += 14;
  const standingMerits = (data.merits || []).filter(m =>
    m.category === 'standing' && !/Kindred Status/i.test(m.name)
  );
  standingMerits.forEach(m => {
    doc.font(F.body).fontSize(8.5).fillColor(C.INK);
    doc.text(m.name, x, y, { lineBreak: false });
    ratingGlyphs(m.effective_rating, y);
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

// ─── Masthead (RIGHT PANEL TOP) ─────────────────────────────────────────────
// Three internal columns:
//   Col A: logo → name → tagline → identity fields (Player/Concept/XP/Printed)
//   Col B: Carthian/clan icons + names
//   Col C: status diamonds — start near the TOP of the page, not aligned with
//          the identity block. The space freed by moving the diamonds up is
//          reclaimed by the ATTRIBUTES and SKILLS sections below.
function renderMasthead(doc, data, assets) {
  const { x, w } = COL.masthead;

  // Narrower identity column (user feedback: "too spread out width")
  const colAW = 132;
  const colBX = x + colAW + 10;
  const diamondColW = 58;
  const colBW = w - colAW - 10 - diamondColW - 6;

  // ── Logo + character name + tagline (col A, top) ──────────────────────
  const lw = 108, lh = 62;
  const logoAsset = assets['logo-vampire.png'] || assets['logo-vampire.jpg'];
  if (logoAsset) {
    doc.image(logoAsset, x - 4, M_TOP - 2, { width: lw, height: lh });
  }

  // Terra Mortis tagline UNDER the logo (not next to the name). Frees the
  // whole vertical span beside the logo for the character name to wrap to
  // a second line if it's very long.
  doc.font(F.caslon).fontSize(11).fillColor(C.INK);
  doc.text('Terra Mortis', x - 4, M_TOP + lh + 1, {
    width: lw, align: 'center', lineBreak: false,
  });

  // Name to the right of the logo, occupying the full vertical span.
  // Allowed to wrap to a second line if needed; shrink-to-fit only kicks
  // in at extreme lengths.
  const nameAreaX = x + lw + 6;
  const nameAreaW = w - lw - 6 - diamondColW - 6;
  const nameText = data.identity.displayName.toUpperCase();
  let nameSize = 22;
  doc.font(F.caslon).fontSize(nameSize);
  // Allow the name two lines of room: 2 × (nameSize * 1.2) vertical capacity.
  // Only shrink if a single word is wider than the column.
  const longestWord = nameText.split(/\s+/).reduce((a, b) =>
    doc.widthOfString(a) > doc.widthOfString(b) ? a : b, '');
  while (doc.widthOfString(longestWord) > nameAreaW - 8 && nameSize > 10) {
    nameSize -= 0.5;
    doc.fontSize(nameSize);
  }
  doc.fillColor(C.ACCENT);
  doc.text(nameText, nameAreaX, M_TOP + 6, {
    width: nameAreaW,
    lineGap: -2,       // tight line spacing for the 2-line wrap case
  });

  // ── Identity fields (col A) ──────────────────────────────────────────
  let y = M_TOP + lh + 10;
  field(doc, x, y,      'Player',  data.identity.player,  colAW); y += 13;
  field(doc, x, y,      'Concept', data.identity.concept, colAW); y += 13;
  const xpDisplay = (data.print_meta && data.print_meta.xp_display)
    || `${data.xp.remaining} / ${data.xp.earned}`;
  field(doc, x, y,      'XP',      xpDisplay,              colAW); y += 13;
  const printDate = (data.print_meta && data.print_meta.printed_date)
    || todayDDMMMYY();
  field(doc, x, y,      'Printed', printDate,              colAW);

  // ── Covenant + Clan block (col B) ────────────────────────────────────
  renderCovClanBlocks(doc, data, assets, colBX, M_TOP + lh + 10, colBW);

  // ── Status diamonds (col C) — START AT TOP OF PAGE ───────────────────
  // Previously aligned with the identity block; user feedback wants them
  // starting near the top of the page to free vertical space for the
  // ATTRIBUTES / SKILLS sections below.
  renderStatusDiamondsVertical(doc, data, assets,
    x + w - diamondColW + 2, M_TOP + 2, diamondColW - 4);
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

  // Covenant row — icon left, shrink-to-fit name right.
  // Use `fit: [w, h]` to preserve aspect ratio; the icons are not square
  // (Carthian is wide, Crone is ornate tall) so forcing width=height=32
  // stretched them.
  if (covIconFile && assets[covIconFile]) {
    doc.image(assets[covIconFile], x, y, { fit: [iconSize, iconSize], align: 'center', valign: 'center' });
  }
  const covText = covName ? covName.toUpperCase() : '';
  const covSize = fitOneLine(covText, textW, 12, 7);
  doc.fillColor(C.ACCENT);
  doc.text(covText, textX, y + (iconSize - covSize) / 2, { width: textW, lineBreak: false });

  // Clan row
  const y2 = y + rowH;
  if (clanIconFile && assets[clanIconFile]) {
    doc.image(assets[clanIconFile], x, y2, { fit: [iconSize, iconSize], align: 'center', valign: 'center' });
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
  const y0 = M_TOP + 170;     // moved up — status diamonds no longer push this down
  const bannerH = 26;

  // Prefer the simple ink-brush banner_large.png over the scrollwork plates
  // (closer to Mammon target aesthetic).
  sectionBanner(doc, x, y0, w, bannerH, 'ATTRIBUTES',
    assets['banner-large.png'] || assets['short-banner.png'], 15);

  // Three column sub-headers: Mental / Physical / Social
  const colW = w / 3;
  const ySub = y0 + bannerH + 6;
  ['MENTAL', 'PHYSICAL', 'SOCIAL'].forEach((label, i) => {
    doc.font(F.caslon).fontSize(11).fillColor(C.ACCENT);
    doc.text(label, x + i * colW, ySub, { width: colW, align: 'center', lineBreak: false });
  });
  doc.fillColor(C.INK);

  // Three rows (Power, Finesse, Resistance) × three columns.
  // Attribute labels rendered UPPERCASE (small caps via the Caslon font
  // applied by traitRow) and right-aligned against the dot column so
  // long labels like "MANIPULATION" can't overlap the dots.
  const yRow = ySub + 22;
  const rowGap = 20;
  ATTR_GRID.forEach((row, ri) => {
    ['Mental', 'Physical', 'Social'].forEach((cat, ci) => {
      const name = row[cat];
      const val = data.attributes[name];
      if (!val) return;
      const rowX = x + ci * colW + 12;
      const rowW = colW - 24;
      traitRow(doc, rowX, yRow + ri * rowGap, name.toUpperCase(), val.effective, 5, rowW,
        { fontSize: 8 });
    });
  });
}

// ─── Skills section (right panel bottom) ──────────────────────────────────
function renderSkills(doc, data, assets) {
  const { x, w } = RIGHT_PANEL;
  const y0 = M_TOP + 290;     // below attributes (banner 26 + sub 22 + 3 rows × 20 = 108 → 170+108=278 + gap)
  const bannerH = 26;

  sectionBanner(doc, x, y0, w, bannerH, 'SKILLS',
    assets['banner-large.png'] || assets['short-banner.png'], 15);

  const colW = w / 3;
  const subtitles = {
    Mental: '(−3 unskilled)',
    Physical: '(−1 unskilled)',
    Social: '(−1 unskilled)',
  };

  const skillMap = {};
  (data.skills || []).forEach(s => { skillMap[s.name] = s; });

  const ySub = y0 + bannerH + 6;
  const yRow = ySub + 24;
  const rowGap = 26;     // spread out — user feedback: more gap between skills

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
      // Smaller skill label, bigger spec label — user feedback
      skillRow(doc, rowX, yRow + si * rowGap, sname.toUpperCase(), dotsN, rowW,
        s && s.specialisations, { fontSize: 7.5, specFontSize: 7.5 });
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
