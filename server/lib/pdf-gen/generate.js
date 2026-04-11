#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
//  Vampire: The Requiem 2nd Edition — Character Sheet PDF Generator
//  Renders JSON character data into a styled PDF matching the official sheet.
//  Page size: A4 (595.28 × 841.89 pt)
// ═══════════════════════════════════════════════════════════════════════════════

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Page geometry ────────────────────────────────────────────────────────────
const PAGE_W  = 595.28;
const PAGE_H  = 841.89;
const M_LEFT  = 38;
const M_RIGHT = 30;
const M_TOP   = 12;
const CW      = PAGE_W - M_LEFT - M_RIGHT;   // content width ≈ 535

// ── Colours ──────────────────────────────────────────────────────────────────
const INK      = '#1a1a1a';
const GREY     = '#666666';
const FAINT    = '#aaaaaa';
const BANNER_C = '#d4c5a9';   // warm cream text on dark banners

// ── Dot / square sizes ──────────────────────────────────────────────────────
const DOT_R   = 3.0;
const DOT_GAP = 9.0;
const SQ_SIZE = 6.5;
const SQ_GAP  = 8.0;

// ── Canonical skill lists ────────────────────────────────────────────────────
const ALL_SKILLS = {
  Mental:   ['Academics','Computer','Crafts','Investigation','Medicine','Occult','Politics','Science'],
  Physical: ['Athletics','Brawl','Drive','Firearms','Larceny','Stealth','Survival','Weaponry'],
  Social:   ['Animal Ken','Empathy','Expression','Intimidation','Persuasion','Socialise','Streetwise','Subterfuge'],
};
const ATTR_GRID = [
  { row: 'power',      mental: 'Intelligence', physical: 'Strength',  social: 'Presence' },
  { row: 'finesse',    mental: 'Wits',         physical: 'Dexterity', social: 'Manipulation' },
  { row: 'resistance', mental: 'Resolve',      physical: 'Stamina',   social: 'Composure' },
];

// ── Paths ────────────────────────────────────────────────────────────────────
const FONT_DIR  = path.join(__dirname, 'fonts');
const ASSET_DIR = path.join(__dirname, 'assets');

const F = {
  caslon:     path.join(FONT_DIR, 'CaslonAntique-Merged.ttf'),
  goudyBold:  path.join(FONT_DIR, 'GoudyBold-Merged.ttf'),
  body:       path.join(FONT_DIR, 'SortsMillGoudy-Regular.ttf'),
  bodyIt:     path.join(FONT_DIR, 'SortsMillGoudy-Italic.ttf'),
  bold:       path.join(FONT_DIR, 'LiberationSerif-Bold.ttf'),
  regular:    path.join(FONT_DIR, 'LiberationSerif-Regular.ttf'),
  italic:     path.join(FONT_DIR, 'LiberationSerif-Italic.ttf'),
};
const A = {
  bg:       path.join(ASSET_DIR, 'background.jpg'),
  logo:     path.join(ASSET_DIR, 'logo_header.png'),
  bannerLg: path.join(ASSET_DIR, 'banner_large.png'),
};


// ═══════════════════════════════════════════════════════════════════════════════
//  DRAWING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function bg(doc) {
  doc.image(A.bg, 0, 0, { width: PAGE_W, height: PAGE_H });
}

function logo(doc) {
  const w = 200, h = 68;
  doc.image(A.logo, (PAGE_W - w) / 2, M_TOP + 2, { width: w, height: h });
}

/** Dark ink-wash banner with centred Caslon text */
function banner(doc, y, text, x = M_LEFT, w = CW, fontSize = 11) {
  const h = 17;
  doc.save().rect(x, y, w, h).fill('#1c1015').restore();
  doc.font('Caslon').fontSize(fontSize).fillColor(BANNER_C);
  doc.text(text, x, y + 3, { width: w, align: 'center', lineBreak: false });
  doc.fillColor(INK);
}

/** Smaller sub-section header */
function subHeader(doc, x, y, w, text, subtitle) {
  doc.font('Caslon').fontSize(9.5).fillColor(INK);
  doc.text(text, x, y, { width: w, align: 'center', lineBreak: false });
  if (subtitle) {
    doc.font('BodyIt').fontSize(6).fillColor(GREY);
    doc.text(subtitle, x, y + 11, { width: w, align: 'center', lineBreak: false });
    doc.fillColor(INK);
  }
}

/** ●●●○○ filled dot rating */
function dots(doc, x, y, filled, max = 5) {
  for (let i = 0; i < max; i++) {
    const cx = x + i * DOT_GAP;
    if (i < filled) {
      doc.circle(cx, y, DOT_R).fill(INK);
    } else {
      doc.save().circle(cx, y, DOT_R).lineWidth(0.55).stroke(INK).restore();
    }
  }
}

/** ■■□□□ square rating (for vitae, etc.) */
function squares(doc, x, y, filled, max) {
  for (let i = 0; i < max; i++) {
    const sx = x + i * SQ_GAP;
    if (i < filled) {
      doc.rect(sx, y, SQ_SIZE, SQ_SIZE).fill(INK);
    } else {
      doc.save().rect(sx, y, SQ_SIZE, SQ_SIZE).lineWidth(0.45).stroke(INK).restore();
    }
  }
}

/** Label with underline field: "Name:________value" */
function field(doc, x, y, label, value, totalW, opts = {}) {
  const fontSize = opts.fontSize || 8;
  const labelFont = opts.labelFont || 'Bold';
  const valueFont = opts.valueFont || 'Body';

  doc.font(labelFont).fontSize(fontSize).fillColor(INK);
  const lw = doc.widthOfString(label);
  doc.text(label, x, y, { lineBreak: false });

  // Underline
  const lineStart = x + lw + 2;
  const lineEnd = x + totalW;
  doc.save()
    .moveTo(lineStart, y + fontSize + 2)
    .lineTo(lineEnd, y + fontSize + 2)
    .lineWidth(0.4).stroke(FAINT)
    .restore();

  // Value
  if (value) {
    doc.font(valueFont).fontSize(fontSize).fillColor(INK);
    doc.text(String(value), lineStart + 2, y, { lineBreak: false });
  }
}

/** Labelled dot row:  "Academics______●●○○○" */
function skillRow(doc, x, y, name, filled, w, specs) {
  doc.font('Body').fontSize(7.5).fillColor(INK);
  doc.text(name, x, y - 3, { lineBreak: false });

  // Specialisation suffix
  if (specs && specs.length) {
    const nw = doc.widthOfString(name);
    doc.font('BodyIt').fontSize(6).fillColor(GREY);
    doc.text(` (${specs.join(', ')})`, x + nw, y - 2, { lineBreak: false });
    doc.fillColor(INK);
  }

  // Underline from name end to dots
  const dotsX = x + w - (5 * DOT_GAP);
  const nameEnd = x + doc.font('Body').fontSize(7.5).widthOfString(name) + 4;
  doc.save()
    .moveTo(nameEnd, y + 7)
    .lineTo(dotsX - 4, y + 7)
    .lineWidth(0.3).stroke(FAINT)
    .restore();

  dots(doc, dotsX, y + 1, filled, 5);
}

/** Labelled dot row for disciplines/merits with name on the left */
function traitRow(doc, x, y, name, filled, max, w) {
  doc.font('Body').fontSize(7.5).fillColor(INK);
  doc.text(name, x, y - 3, { lineBreak: false });

  const dotsX = x + w - (max * DOT_GAP);
  dots(doc, dotsX, y + 1, filled, max);
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE 1 — Main Character Sheet
// ═══════════════════════════════════════════════════════════════════════════════

function renderPage1(doc, data) {
  bg(doc);
  logo(doc);

  const id = data.identity;
  const st = data.stats;
  const attrs = data.attributes;

  // ── Identity Block ───────────────────────────────────────────────────────
  let iy = 88;
  const col1 = M_LEFT;
  const col2 = M_LEFT + CW * 0.35;
  const col3 = M_LEFT + CW * 0.67;
  const fw1 = CW * 0.32;
  const fw2 = CW * 0.30;
  const fw3 = CW * 0.30;

  field(doc, col1, iy,      'Name: ',      id.displayName || id.name, fw1);
  field(doc, col1, iy + 14, 'Player: ',    id.player, fw1);
  field(doc, col1, iy + 28, 'Chronicle: ', '', fw1);

  field(doc, col2, iy,      'Mask: ',    id.mask, fw2);
  field(doc, col2, iy + 14, 'Dirge: ',   id.dirge, fw2);
  field(doc, col2, iy + 28, 'Concept: ', id.concept, fw2);

  field(doc, col3, iy,      'Clan: ',      id.clan, fw3);
  field(doc, col3, iy + 14, 'Bloodline: ', id.bloodline || '', fw3);
  field(doc, col3, iy + 28, 'Covenant: ',  id.covenant, fw3);

  // ── ATTRIBUTES ───────────────────────────────────────────────────────────
  let ay = 130;
  banner(doc, ay, 'ATTRIBUTES');
  ay += 22;

  const attrColW = CW / 3;
  const rowH = 16;

  // Row labels (power / finesse / resistance)
  for (let r = 0; r < ATTR_GRID.length; r++) {
    const ry = ay + r * rowH;
    doc.font('BodyIt').fontSize(7).fillColor(GREY);
    doc.text(ATTR_GRID[r].row, M_LEFT + 2, ry + 1, { lineBreak: false });
  }

  // Attribute names + dots in 3 columns
  const attrStartX = M_LEFT + 60;
  const categories = ['mental', 'physical', 'social'];
  for (let c = 0; c < 3; c++) {
    const cx = attrStartX + c * (CW - 56) / 3;
    for (let r = 0; r < 3; r++) {
      const attrName = ATTR_GRID[r][categories[c]];
      const val = attrs[attrName]?.effective || 1;
      const ry = ay + r * rowH;

      doc.font('Bold').fontSize(8).fillColor(INK);
      doc.text(attrName, cx, ry, { lineBreak: false });

      const dotsX = cx + 80;
      dots(doc, dotsX, ry + 4, val, 5);
    }
  }

  // ── SKILLS & OTHER TRAITS ────────────────────────────────────────────────
  let sy = ay + 3 * rowH + 8;
  const skillsW = CW * 0.47;
  const otherX = M_LEFT + CW * 0.50;
  const otherW = CW * 0.50;

  banner(doc, sy, 'SKILLS', M_LEFT, skillsW, 10);
  banner(doc, sy, 'OTHER TRAITS', otherX, otherW, 10);
  sy += 22;

  // ── Skills columns ─────────────────────────────────────────────────────
  const skillMap = {};
  (data.skills || []).forEach(s => { skillMap[s.name] = s; });

  let curY = sy;
  const catOrder = ['Mental', 'Physical', 'Social'];
  const catSubtitle = { Mental: '(-3 unskilled)', Physical: '(-1 unskilled)', Social: '(-1 unskilled)' };

  for (const cat of catOrder) {
    subHeader(doc, M_LEFT, curY, skillsW, cat.toUpperCase(), catSubtitle[cat]);
    curY += 20;

    for (const skName of ALL_SKILLS[cat]) {
      const sk = skillMap[skName];
      const filled = sk ? sk.effective : 0;
      const specs = sk ? (sk.specialisations || []) : [];
      skillRow(doc, M_LEFT + 6, curY, skName, filled, skillsW - 10, specs);
      curY += 12;
    }
    curY += 3;
  }

  // ── Other Traits (right column) ────────────────────────────────────────
  let oy = sy;

  // DISCIPLINES
  subHeader(doc, otherX, oy, otherW, 'DISCIPLINES');
  oy += 16;

  const discs = data.disciplines || [];
  for (const d of discs) {
    traitRow(doc, otherX + 4, oy, d.name, d.dots, 5, otherW - 8);
    oy += 12;
  }
  // Empty discipline slots
  const emptyDiscSlots = Math.max(0, 4 - discs.length);
  for (let i = 0; i < emptyDiscSlots; i++) {
    const lineY = oy + 8;
    doc.save().moveTo(otherX + 4, lineY).lineTo(otherX + otherW * 0.55, lineY).lineWidth(0.3).stroke(FAINT).restore();
    dots(doc, otherX + otherW - 5 * DOT_GAP - 4, oy + 2, 0, 5);
    oy += 12;
  }
  oy += 3;

  // MERITS
  subHeader(doc, otherX, oy, otherW, 'MERITS');
  oy += 16;

  const merits = data.merits || [];
  for (const m of merits) {
    const label = m.qualifier ? `${m.name} (${m.qualifier})` : m.name;
    traitRow(doc, otherX + 4, oy, label, m.effective_rating, 5, otherW - 8);
    oy += 12;
  }
  const emptyMeritSlots = Math.max(0, 5 - merits.length);
  for (let i = 0; i < emptyMeritSlots; i++) {
    const lineY = oy + 8;
    doc.save().moveTo(otherX + 4, lineY).lineTo(otherX + otherW * 0.55, lineY).lineWidth(0.3).stroke(FAINT).restore();
    dots(doc, otherX + otherW - 5 * DOT_GAP - 4, oy + 2, 0, 5);
    oy += 12;
  }
  oy += 3;

  // ASPIRATIONS
  subHeader(doc, otherX, oy, otherW, 'ASPIRATIONS');
  oy += 14;
  for (let i = 0; i < 3; i++) {
    doc.save().moveTo(otherX + 4, oy + 8).lineTo(otherX + otherW - 4, oy + 8).lineWidth(0.3).stroke(FAINT).restore();
    oy += 12;
  }
  oy += 3;

  // BANES
  subHeader(doc, otherX, oy, otherW, 'BANES');
  oy += 14;
  const banes = data.banes || [];
  for (let i = 0; i < Math.max(3, banes.length); i++) {
    if (banes[i]) {
      doc.font('Body').fontSize(7).fillColor(INK);
      doc.text(banes[i].name, otherX + 4, oy - 2, { width: otherW - 8, lineBreak: false });
    }
    doc.save().moveTo(otherX + 4, oy + 8).lineTo(otherX + otherW - 4, oy + 8).lineWidth(0.3).stroke(FAINT).restore();
    oy += 12;
  }

  // ── Bottom-right: HEALTH / WILLPOWER / BP / VITAE / HUMANITY ──────────
  oy += 3;

  // HEALTH
  subHeader(doc, otherX, oy, otherW, 'HEALTH');
  oy += 12;
  dots(doc, otherX + 8, oy, 0, 15);
  oy += 7;
  squares(doc, otherX + 8, oy, 0, 15);
  oy += 12;

  // WILLPOWER
  subHeader(doc, otherX, oy, otherW, 'WILLPOWER');
  oy += 12;
  dots(doc, otherX + 8, oy, st.willpower, 10);
  oy += 7;
  squares(doc, otherX + 8, oy, 0, 10);
  oy += 12;

  // BLOOD POTENCY
  subHeader(doc, otherX, oy, otherW, 'BLOOD POTENCY');
  oy += 12;
  dots(doc, otherX + 8, oy, st.blood_potency, 10);
  oy += 11;

  // VITAE
  subHeader(doc, otherX, oy, otherW, 'VITAE');
  oy += 12;
  const vMax = st.vitae_max || 10;
  const row1 = Math.min(vMax, 10);
  const row2 = Math.max(0, vMax - 10);
  squares(doc, otherX + 8, oy, 0, row1);
  if (row2 > 0) {
    oy += 9;
    squares(doc, otherX + 8, oy, 0, row2);
  }
  oy += 12;

  // HUMANITY
  subHeader(doc, otherX, oy, otherW, 'HUMANITY');
  oy += 12;
  const touchMap = {};
  (data.touchstones || []).forEach(t => { touchMap[t.humanity] = t.name; });

  for (let h = 10; h >= 1; h--) {
    const hx = otherX + 4;
    doc.font('Body').fontSize(7).fillColor(INK);
    doc.text(String(h), hx, oy - 2, { lineBreak: false });

    // Touchstone line
    const lineStart = hx + 14;
    const lineEnd = otherX + otherW - 22;
    doc.save().moveTo(lineStart, oy + 6).lineTo(lineEnd, oy + 6).lineWidth(0.3).stroke(FAINT).restore();

    if (touchMap[h]) {
      doc.font('Body').fontSize(6).fillColor(GREY);
      doc.text(touchMap[h], lineStart + 2, oy - 1, { lineBreak: false });
      doc.fillColor(INK);
    }

    // Dot on the right: filled if humanity >= h, empty otherwise
    const dotX = otherX + otherW - 12;
    if (h > st.humanity) {
      doc.save().circle(dotX, oy + 2, DOT_R).lineWidth(0.5).stroke(INK).restore();
    } else {
      doc.circle(dotX, oy + 2, DOT_R).fill(INK);
    }

    oy += 11;
  }

  // ── Bottom stats line ──────────────────────────────────────────────────
  oy += 2;
  const bsy = oy;
  const statFS = 6.5;
  doc.font('Bold').fontSize(statFS).fillColor(INK);
  doc.text(`Size:${st.size}`, otherX + 4, bsy, { lineBreak: false });
  doc.text(`Speed:${st.speed}`, otherX + 55, bsy, { lineBreak: false });
  doc.text(`Defense:${st.defence}`, otherX + 110, bsy, { lineBreak: false });
  doc.text(`Armor:0`, otherX + 165, bsy, { lineBreak: false });

  doc.text(`Initiative Mod:`, otherX + 4, bsy + 11, { lineBreak: false });

  // Beats & XP
  doc.font('Body').fontSize(statFS);
  doc.text(`Beats:`, otherX + 4, bsy + 22, { lineBreak: false });
  // 5 beat boxes
  squares(doc, otherX + 35, bsy + 22, 0, 5, 5);
  doc.font('Body').fontSize(statFS);
  doc.text(`Experiences: ${data.xp?.remaining || 0}`, otherX + 4, bsy + 33, { lineBreak: false });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE 2 — Devotions / Rites / Combat
// ═══════════════════════════════════════════════════════════════════════════════

function renderPage2(doc, data) {
  bg(doc);
  logo(doc);

  let y = 90;

  // OTHER TRAITS (extra discipline/merit slots)
  banner(doc, y, 'OTHER TRAITS');
  y += 22;

  // 3 columns of 3 empty trait slots each
  const colW = CW / 3;
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      const x = M_LEFT + c * colW + 4;
      const ry = y + r * 14;
      doc.save().moveTo(x, ry + 9).lineTo(x + colW * 0.55, ry + 9).lineWidth(0.3).stroke(FAINT).restore();
      dots(doc, x + colW - 5 * DOT_GAP - 8, ry + 3, 0, 5);
    }
  }
  y += 50;

  // DEVOTIONS
  banner(doc, y, 'DEVOTIONS');
  y += 22;

  const devs = data.devotions || [];
  const devSlots = Math.max(6, devs.length);
  const devColW = CW / 2;
  for (let i = 0; i < devSlots; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const dx = M_LEFT + col * devColW + 4;
    const dy = y + row * 65;
    const d = devs[i];

    field(doc, dx, dy, 'Name: ', d?.name || '', devColW * 0.6);
    field(doc, dx + devColW * 0.62, dy, 'Cost: ', d?.xp_cost != null ? String(d.xp_cost) : '', devColW * 0.3);
    field(doc, dx, dy + 13, 'Disciplines: ', d?.prereqs || '', devColW - 12);
    doc.save().moveTo(dx, dy + 35).lineTo(dx + devColW - 12, dy + 35).lineWidth(0.3).stroke(FAINT).restore();
    field(doc, dx, dy + 40, 'Dice Pool: ', '', devColW * 0.6);
    field(doc, dx, dy + 53, 'Book: ', '', devColW * 0.5);
  }
  y += Math.ceil(devSlots / 2) * 65 + 8;

  // RITES / MIRACLES
  if (y < PAGE_H - 200) {
    banner(doc, y, 'RITES / MIRACLES');
    y += 22;

    const rites = data.rites || [];
    // Two columns: Name + Level
    const rColW = CW / 2;
    doc.font('Bold').fontSize(7.5).fillColor(INK);
    doc.text('Name', M_LEFT + 4, y, { lineBreak: false });
    doc.text('Level', M_LEFT + rColW * 0.85, y, { lineBreak: false });
    doc.text('Name', M_LEFT + rColW + 4, y, { lineBreak: false });
    doc.text('Level', M_LEFT + rColW * 1.85, y, { lineBreak: false });
    y += 14;

    for (let i = 0; i < 10; i++) {
      const col = i < 5 ? 0 : 1;
      const row = i % 5;
      const rx = M_LEFT + col * rColW + 4;
      const ry = y + row * 14;
      const rite = rites[i];
      doc.save().moveTo(rx, ry + 9).lineTo(rx + rColW * 0.75, ry + 9).lineWidth(0.3).stroke(FAINT).restore();
      doc.save().moveTo(rx + rColW * 0.8, ry + 9).lineTo(rx + rColW - 12, ry + 9).lineWidth(0.3).stroke(FAINT).restore();
      if (rite) {
        doc.font('Body').fontSize(7).fillColor(INK);
        doc.text(rite.name, rx + 2, ry, { lineBreak: false });
        doc.text(String(rite.level), rx + rColW * 0.82, ry, { lineBreak: false });
      }
    }
    y += 78;
  }

  // COMBAT
  if (y < PAGE_H - 120) {
    banner(doc, y, 'COMBAT');
    y += 22;

    const combatHeaders = ['Weapon/Attack', 'Damage', 'Range', 'Clip', 'Initiative', 'Strength', 'Size'];
    const combatColWidths = [0.28, 0.10, 0.10, 0.08, 0.12, 0.12, 0.08];
    let cx = M_LEFT + 4;
    doc.font('Bold').fontSize(6.5).fillColor(INK);
    for (let h = 0; h < combatHeaders.length; h++) {
      doc.text(combatHeaders[h], cx, y, { lineBreak: false });
      cx += CW * combatColWidths[h];
    }
    y += 12;

    // 4 empty rows
    for (let r = 0; r < 4; r++) {
      cx = M_LEFT + 4;
      for (let h = 0; h < combatHeaders.length; h++) {
        const colW = CW * combatColWidths[h];
        doc.save().moveTo(cx, y + 9).lineTo(cx + colW - 4, y + 9).lineWidth(0.3).stroke(FAINT).restore();
        cx += colW;
      }
      y += 14;
    }

    // Armor block
    y += 4;
    const armorFields = ['Rating:', 'Strength:', 'Defense:', 'Speed:', 'Description:'];
    const ax = M_LEFT + CW * 0.6;
    for (const af of armorFields) {
      field(doc, ax, y, af, '', CW * 0.35);
      y += 13;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE 3 — Expanded Merits / Possessions / Haven
// ═══════════════════════════════════════════════════════════════════════════════

function renderPage3(doc, data) {
  bg(doc);
  logo(doc);

  let y = 90;
  banner(doc, y, 'EXPANDED MERITS');
  y += 22;

  const meritSections = ['ALLIES', 'CONTACTS', 'HERD', 'MENTOR', 'RESOURCES', 'RETAINER', 'STATUS', 'OTHER'];
  const mColW = CW / 2;
  for (let i = 0; i < meritSections.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const mx = M_LEFT + col * mColW + 4;
    const my = y + row * 65;

    subHeader(doc, mx, my, mColW - 8, meritSections[i]);
    for (let line = 0; line < 3; line++) {
      doc.save().moveTo(mx, my + 16 + line * 14).lineTo(mx + mColW - 12, my + 16 + line * 14).lineWidth(0.3).stroke(FAINT).restore();
    }
  }
  y += 4 * 65 + 8;

  // POSSESSIONS
  banner(doc, y, 'POSSESSIONS');
  y += 22;

  const possSections = ['GEAR(CARRIED)', 'EQUIPMENT(OWNED)', 'VEHICLES', 'MISC'];
  for (let i = 0; i < possSections.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const px = M_LEFT + col * mColW + 4;
    const py = y + row * 65;

    subHeader(doc, px, py, mColW - 8, possSections[i]);
    for (let line = 0; line < 3; line++) {
      doc.save().moveTo(px, py + 16 + line * 14).lineTo(px + mColW - 12, py + 16 + line * 14).lineWidth(0.3).stroke(FAINT).restore();
    }
  }
  y += 2 * 65 + 8;

  // VINCULUM
  banner(doc, y, 'VINCULUM');
  y += 22;

  doc.font('Bold').fontSize(7).fillColor(INK);
  doc.text('Bound To', M_LEFT + 4, y, { lineBreak: false });
  doc.text('Stage', M_LEFT + mColW * 0.8, y, { lineBreak: false });
  doc.text('Bound To', M_LEFT + mColW + 4, y, { lineBreak: false });
  doc.text('Stage', M_LEFT + mColW * 1.8, y, { lineBreak: false });
  y += 14;
  for (let i = 0; i < 3; i++) {
    for (let c = 0; c < 2; c++) {
      const vx = M_LEFT + c * mColW + 4;
      doc.save().moveTo(vx, y + 9).lineTo(vx + mColW * 0.7, y + 9).lineWidth(0.3).stroke(FAINT).restore();
      doc.save().moveTo(vx + mColW * 0.75, y + 9).lineTo(vx + mColW - 12, y + 9).lineWidth(0.3).stroke(FAINT).restore();
    }
    y += 14;
  }
  y += 8;

  // HAVEN
  banner(doc, y, 'HAVEN');
  y += 22;

  doc.font('Bold').fontSize(7.5).fillColor(INK);
  doc.text('LOCATION', M_LEFT + 4, y, { lineBreak: false });
  doc.text('DESCRIPTION', M_LEFT + CW * 0.3, y, { lineBreak: false });
  y += 14;
  for (let i = 0; i < 3; i++) {
    doc.save().moveTo(M_LEFT + 4, y + 9).lineTo(M_LEFT + CW * 0.25, y + 9).lineWidth(0.3).stroke(FAINT).restore();
    doc.save().moveTo(M_LEFT + CW * 0.3, y + 9).lineTo(M_LEFT + CW - 4, y + 9).lineWidth(0.3).stroke(FAINT).restore();
    y += 14;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE 4 — History / Goals / Description
// ═══════════════════════════════════════════════════════════════════════════════

function renderPage4(doc, data) {
  bg(doc);
  logo(doc);

  let y = 90;

  // HISTORY
  banner(doc, y, 'HISTORY');
  y += 22;
  for (let i = 0; i < 10; i++) {
    doc.save().moveTo(M_LEFT + 4, y + 9).lineTo(M_LEFT + CW - 4, y + 9).lineWidth(0.3).stroke(FAINT).restore();
    y += 16;
  }
  y += 4;

  // GOALS
  banner(doc, y, 'GOALS');
  y += 22;
  for (let i = 0; i < 4; i++) {
    doc.save().moveTo(M_LEFT + 4, y + 9).lineTo(M_LEFT + CW - 4, y + 9).lineWidth(0.3).stroke(FAINT).restore();
    y += 16;
  }
  y += 4;

  // DESCRIPTION
  banner(doc, y, 'DESCRIPTION');
  y += 22;

  const descFields = [
    'Age:', 'Apparent Age:', 'Date of Birth:', 'R.I.P.:', 'Hair:', 'Eyes:',
    'Race:', 'Nationality:', 'Height:', 'Weight:', 'Sex:'
  ];
  const dColW = CW / 2;
  for (let i = 0; i < descFields.length; i++) {
    const dx = M_LEFT + 4;
    field(doc, dx, y, descFields[i], '', dColW * 0.45);
    // Right side line for notes
    doc.save().moveTo(M_LEFT + dColW, y + 9).lineTo(M_LEFT + CW - 4, y + 9).lineWidth(0.3).stroke(FAINT).restore();
    y += 14;
  }
  y += 8;

  // VISUALS
  banner(doc, y, 'VISUALS');
  y += 22;
  const vizW = CW / 2;
  subHeader(doc, M_LEFT, y, vizW, 'COTERIE CHART');
  subHeader(doc, M_LEFT + vizW, y, vizW, 'CHARACTER SKETCH');
}


// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN RENDER
// ═══════════════════════════════════════════════════════════════════════════════

function generate(data, outputPath) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `VtR Sheet — ${data.identity?.displayName || data.identity?.name || 'Character'}`,
      Author: 'VtR PDF Generator',
    },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  _renderPages(doc, data);

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

/**
 * Stream a PDF to a writable stream (e.g. an HTTP response).
 * Returns a promise that resolves when the doc is finished.
 */
function generateToStream(data, writable) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `VtR Sheet — ${data.identity?.displayName || data.identity?.name || 'Character'}`,
      Author: 'VtR PDF Generator',
    },
  });

  doc.pipe(writable);
  _renderPages(doc, data);

  return new Promise((resolve, reject) => {
    doc.on('end', resolve);
    writable.on('error', reject);
  });
}

function _renderPages(doc, data) {
  // Register fonts
  doc.registerFont('Caslon',    F.caslon);
  doc.registerFont('GoudyBold', F.goudyBold);
  doc.registerFont('Body',      F.body);
  doc.registerFont('BodyIt',    F.bodyIt);
  doc.registerFont('Bold',      F.bold);
  doc.registerFont('Regular',   F.regular);
  doc.registerFont('Italic',    F.italic);

  renderPage1(doc, data);

  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  renderPage2(doc, data);

  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  renderPage3(doc, data);

  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  renderPage4(doc, data);

  doc.end();
}


// ── CLI entry point ──────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFile = process.argv[2] || path.join(__dirname, 'sample-data.json');
  const outputFile = process.argv[3] || path.join(__dirname, 'output.pdf');

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  generate(data, outputFile)
    .then(p => console.log(`✓ Generated: ${p}`))
    .catch(e => { console.error(e); process.exit(1); });
}

export { generate, generateToStream };
