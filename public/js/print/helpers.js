/**
 * Drawing primitives — dots, squares, labelled fields, skill rows.
 *
 * Salvaged from the failed server-side attempt
 * (see specs/guidance/pdf-target/PRIOR-ART.md) then tuned for the Mammon
 * landscape layout.
 */

import { C, DOT_R, DOT_GAP, SQ_SIZE, SQ_GAP, F } from './layout.js';

/** Filled / outlined circle rating row ●●●○○ */
function dots(doc, x, y, filled, max = 5, opts = {}) {
  const r = opts.r || DOT_R;
  const gap = opts.gap || DOT_GAP;
  const fillC = opts.fill || C.INK;
  const strokeC = opts.stroke || C.INK;
  for (let i = 0; i < max; i++) {
    const cx = x + i * gap;
    if (i < filled) {
      doc.circle(cx, y, r).fill(fillC);
    } else {
      doc.save().circle(cx, y, r).lineWidth(0.6).stroke(strokeC).restore();
    }
  }
}

/** Filled / outlined square rating row ■■□□□ */
function squares(doc, x, y, filled, max, opts = {}) {
  const sz = opts.size || SQ_SIZE;
  const gap = opts.gap || SQ_GAP;
  const fillC = opts.fill || C.INK;
  const strokeC = opts.stroke || C.INK;
  for (let i = 0; i < max; i++) {
    const sx = x + i * gap;
    if (i < filled) {
      doc.rect(sx, y, sz, sz).fill(fillC);
    } else {
      doc.save().rect(sx, y, sz, sz).lineWidth(0.9).stroke(strokeC).restore();
    }
  }
}

/**
 * Capacity + cap-overflow square row.
 *
 * Renders `total` squares. The first `capacity` are outlined empty (these are
 * the character's available slots — vitae pool, health boxes, willpower).
 * The remaining `total - capacity` are rendered as solid black (these slots
 * are above the character's current cap and unavailable).
 *
 * Used for:
 *   VITAE      — capacity=vitae_max, total=20
 *   HEALTH     — capacity=health,    total=15
 *   WILLPOWER  — capacity=willpower, total=10
 */
function capacityRow(doc, x, y, capacity, total, opts = {}) {
  const sz = opts.size || SQ_SIZE;
  const gap = opts.gap || SQ_GAP;
  const strokeC = opts.stroke || C.INK;
  const blackC = opts.black || '#1a1a1a';
  const lineW = opts.lineWidth || 0.9;
  for (let i = 0; i < total; i++) {
    const sx = x + i * gap;
    if (i < capacity) {
      // Character has this slot — outlined empty square
      doc.save().rect(sx, y, sz, sz).lineWidth(lineW).stroke(strokeC).restore();
    } else {
      // Above cap — solid black square
      doc.save().rect(sx, y, sz, sz).fill(blackC).restore();
    }
  }
}

/** Labelled underline field: "Name: ________value" */
function field(doc, x, y, label, value, totalW, opts = {}) {
  const fontSize = opts.fontSize || 8.5;
  const labelFont = opts.labelFont || F.caslon;
  const valueFont = opts.valueFont || F.body;
  const colon = opts.colon !== false;

  doc.font(labelFont).fontSize(fontSize).fillColor(C.INK);
  const lbl = colon ? label + ':' : label;
  const lw = doc.widthOfString(lbl);
  doc.text(lbl, x, y, { lineBreak: false });

  const lineStart = x + lw + 3;
  const lineEnd = x + totalW;
  doc.save()
    .moveTo(lineStart, y + fontSize + 1)
    .lineTo(lineEnd, y + fontSize + 1)
    .lineWidth(0.4).stroke(C.FAINT)
    .restore();

  if (value !== null && value !== undefined && value !== '') {
    doc.font(valueFont).fontSize(fontSize).fillColor(C.INK);
    doc.text(String(value), lineStart + 2, y, {
      lineBreak: false,
      width: lineEnd - lineStart - 2,
      ellipsis: true,
    });
  }
}

/** Small-caps section header text centred over a width. No banner plate — just text. */
function miniHeader(doc, x, y, w, text, opts = {}) {
  const size = opts.fontSize || 10;
  doc.font(F.caslon).fontSize(size).fillColor(C.INK);
  doc.text(text, x, y, { width: w, align: 'center', lineBreak: false });
}

/** Dark banner plate with cream small-caps text (ATTRIBUTES, SKILLS, MERITS, POWERS) */
function sectionBanner(doc, x, y, w, h, text, assetBuf, fontSize = 13) {
  if (assetBuf) {
    doc.image(assetBuf, x, y, { width: w, height: h });
  } else {
    doc.save().rect(x, y, w, h).fill('#1c1015').restore();
  }
  doc.font(F.caslon).fontSize(fontSize).fillColor(C.BANNER_C);
  const textY = y + (h - fontSize) / 2 + 1;
  doc.text(text, x, textY, { width: w, align: 'center', lineBreak: false });
  doc.fillColor(C.INK);
}

/**
 * Skill name (right-aligned, flush against the dots) + italic spec below +
 * trailing dots.
 *
 * - Label right-aligned against the dot column with a 1em gap.
 * - Specialisation centred under the label (NOT right-aligned), forced
 *   onto one line with ellipsis if multiple specs are supplied.
 */
function skillRow(doc, x, y, name, filled, w, specs, opts = {}) {
  const size = opts.fontSize || 8;
  const specSize = opts.specFontSize != null ? opts.specFontSize : size;
  // 1em gap between label and dots (user feedback).
  const labelGap = opts.labelGap != null ? opts.labelGap : size;

  const dotsX = x + w - 5 * DOT_GAP;
  const labelEndX = dotsX - labelGap;

  // Right-aligned skill label
  doc.font(F.caslon).fontSize(size).fillColor(C.INK);
  doc.text(name, x, y, {
    width: labelEndX - x,
    align: 'right',
    lineBreak: false,
    ellipsis: true,
  });

  // Specialisations: centre-aligned under the label, single line, ellipsis
  // if they overflow the label width.
  if (specs && specs.length) {
    doc.font(F.bodyIt).fontSize(specSize).fillColor(C.GREY);
    doc.text(specs.join(', '), x, y + size + 1, {
      width: labelEndX - x,
      align: 'center',
      lineBreak: false,
      ellipsis: true,
    });
    doc.fillColor(C.INK);
  }

  dots(doc, dotsX, y + size / 2 + 0.5, filled, 5);
}

/**
 * Small-caps trait name + dots, label right-aligned flush against the dots
 * with a 1em gap before the dot column.
 */
function traitRow(doc, x, y, name, filled, max, w, opts = {}) {
  const size = opts.fontSize || 8;
  // 1em gap between label and dots (user feedback).
  const labelGap = opts.labelGap != null ? opts.labelGap : size;
  const dotsX = x + w - max * DOT_GAP;
  const labelEndX = dotsX - labelGap;

  doc.font(F.caslon).fontSize(size).fillColor(C.INK);
  doc.text(name, x, y, {
    width: labelEndX - x,
    align: 'right',
    lineBreak: false,
    ellipsis: true,
  });

  dots(doc, dotsX, y + size / 2 + 0.5, filled, max);
}

/** Flowed paragraph text — wraps inside a box */
function paragraph(doc, x, y, w, text, opts = {}) {
  const size = opts.fontSize || 7.5;
  const font = opts.font || F.body;
  doc.font(font).fontSize(size).fillColor(C.INK);
  doc.text(text, x, y, {
    width: w,
    align: opts.align || 'left',
    lineGap: opts.lineGap || 0.5,
  });
  return doc.y;
}

export {
  dots, squares, capacityRow, field, miniHeader, sectionBanner,
  skillRow, traitRow, paragraph,
};
