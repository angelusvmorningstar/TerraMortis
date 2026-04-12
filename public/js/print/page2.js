/**
 * Page 2 renderer — Merits & Powers, A4 landscape.
 * Matches specs/guidance/pdf-target/mammon-2.png.
 *
 * Two columns of flowing text: Merits fills column 1 first, Powers continues
 * in column 1 then into column 2.
 */

import { PAGE_W, PAGE_H, M_LEFT, M_RIGHT, M_TOP, M_BOTTOM, CW, F, C } from './layout.js';
import { sectionBanner } from './helpers.js';

function renderPage2(doc, data, assets) {
  if (assets['background.jpg']) {
    doc.image(assets['background.jpg'], 0, 0, { width: PAGE_W, height: PAGE_H });
  }

  const colGap = 18;
  const colW = (CW - colGap) / 2;
  const leftX = M_LEFT;
  const rightX = M_LEFT + colW + colGap;
  const contentTop = M_TOP + 6;
  const contentBottom = PAGE_H - M_BOTTOM;

  let col = 0;          // 0 = left, 1 = right
  let y = contentTop;
  const curX = () => (col === 0 ? leftX : rightX);

  function advance(h) {
    y += h;
    if (y > contentBottom - 30 && col === 0) {
      col = 1;
      y = contentTop;
    }
  }

  // ─── MERITS heading ────────────────────────────────────────────────────
  doc.font(F.caslon).fontSize(14).fillColor(C.ACCENT);
  doc.text('MERITS', curX(), y, { width: colW, align: 'center', lineBreak: false });
  doc.fillColor(C.INK);
  y += 20;

  const generalMerits = (data.merits || []).filter(m => m.category === 'general');
  generalMerits.forEach(m => {
    // Ensure enough room for name + ~3 lines of description; wrap to next column if not
    if (y > contentBottom - 40 && col === 0) {
      col = 1;
      y = contentTop;
    }
    // Name + dots
    doc.font(F.caslon).fontSize(9).fillColor(C.INK);
    const heading = `${m.name.toUpperCase()}  ${'●'.repeat(m.effective_rating)}`;
    doc.text(heading, curX(), y, { width: colW, lineBreak: false });
    y += 11;
    if (m.description) {
      doc.font(F.body).fontSize(7.5).fillColor(C.INK);
      doc.text(m.description, curX(), y, { width: colW, lineGap: 0.5 });
      y = doc.y + 6;
    } else {
      y += 4;
    }
  });

  // Advance to next free area; if we're low in col 0, jump to col 1
  if (y > contentBottom - 80 && col === 0) {
    col = 1;
    y = contentTop;
  } else {
    y += 8;
  }

  // ─── POWERS heading ────────────────────────────────────────────────────
  doc.font(F.caslon).fontSize(14).fillColor(C.ACCENT);
  doc.text('POWERS', curX(), y, { width: colW, align: 'center', lineBreak: false });
  doc.fillColor(C.INK);
  y += 20;

  const disciplines = (data.disciplines || []);
  disciplines.forEach(disc => {
    (disc.powers || []).forEach(p => {
      // Wrap to next column if near bottom
      if (y > contentBottom - 50 && col === 0) {
        col = 1;
        y = contentTop;
      }

      // Heading: "NIGHTMARE ●● | FACE OF THE BEAST"
      doc.font(F.caslon).fontSize(9).fillColor(C.INK);
      const rankDots = '●'.repeat(p.rank);
      const heading = `${disc.name.toUpperCase()} ${rankDots} | ${p.name.toUpperCase()}`;
      doc.text(heading, curX(), y, { width: colW, lineBreak: false });
      y += 11;

      // Stats line: "Cost: X  •  Pool: Y  •  Z  •  W"
      const parts = [];
      if (p.cost) parts.push(`Cost: ${p.cost}`);
      if (p.pool) parts.push(`Pool: ${p.pool}`);
      if (p.action) parts.push(p.action);
      if (p.duration) parts.push(p.duration);
      if (parts.length) {
        doc.font(F.bold).fontSize(7).fillColor(C.INK);
        doc.text(parts.join('  •  '), curX(), y, { width: colW, lineBreak: true });
        y = doc.y + 2;
      }

      // Effect
      if (p.effect) {
        doc.font(F.body).fontSize(7.5).fillColor(C.INK);
        doc.text(p.effect, curX(), y, { width: colW, lineGap: 0.5 });
        y = doc.y + 6;
      } else {
        y += 4;
      }
    });
  });
}

export { renderPage2 };
