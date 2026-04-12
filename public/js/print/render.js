/**
 * Shared render entry point — works in Node and browser.
 *
 * The renderer is injected with PDFDocument and asset/font buffers, so a single
 * implementation can target:
 *   - Node CLI (bin/render.js) — uses require('pdfkit') and fs to load buffers
 *   - Browser  — loads pdfkit.standalone.js via script tag, fetches buffers
 *
 * Call shape:
 *   render({
 *     data,           // resolved character JSON (serialiseForPrint shape)
 *     PDFDocument,    // constructor from pdfkit (either build)
 *     fonts: {        // font buffers — { Caslon: Uint8Array|Buffer, ... }
 *       Caslon, GoudyBold, Body, BodyIt, Bold, Regular, Italic,
 *     },
 *     assets: {       // image buffers keyed by asset filename
 *       'background.jpg': Buffer, 'logo-vampire.jpg': Buffer, ...
 *     },
 *     output,         // writable stream (Node) or undefined (returns Blob in browser)
 *   })
 *   → returns Promise<void> in Node (resolves when stream finishes)
 *   → returns Promise<Blob> in browser
 */

import { PAGE_W, PAGE_H, F } from './layout.js';
import { renderPage1 } from './page1.js';
import { renderPage2 } from './page2.js';

async function render({ data, PDFDocument, fonts, assets, output }) {
  if (!PDFDocument) throw new Error('render: PDFDocument constructor is required');
  if (!fonts) throw new Error('render: fonts map is required');
  if (!assets) throw new Error('render: assets map is required');
  if (!data || !data.identity) throw new Error('render: data.identity is required');

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],           // A4 landscape explicitly
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title:   `VtR Sheet — ${data.identity.displayName || data.identity.name || 'Character'}`,
      Author:  'Terra Mortis TM Suite',
      Creator: 'pdf_tool',
    },
  });

  // Register every font once. Font keys match F.* in layout.js.
  doc.registerFont(F.caslon,    fonts.Caslon);
  doc.registerFont(F.goudyBold, fonts.GoudyBold);
  doc.registerFont(F.body,      fonts.Body);
  doc.registerFont(F.bodyIt,    fonts.BodyIt);
  doc.registerFont(F.bold,      fonts.Bold);
  doc.registerFont(F.regular,   fonts.Regular);
  doc.registerFont(F.italic,    fonts.Italic);

  // CRITICAL: set up the output sink BEFORE calling doc.end(). In pdfkit's
  // browser standalone build, ending the doc without a sink attached drops
  // the data chunks on the floor. In Node this happens to work because pdfkit
  // buffers internally, but the same code needs to be correct in both.

  let resultPromise;
  if (output) {
    // Node path: pipe to the caller's writable stream first, then end
    doc.pipe(output);
    resultPromise = new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
      doc.on('error', reject);
    });
  } else {
    // Browser path: attach data + end listeners first, then end
    const chunks = [];
    resultPromise = new Promise((resolve, reject) => {
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => {
        try {
          // eslint-disable-next-line no-undef
          resolve(new Blob(chunks, { type: 'application/pdf' }));
        } catch (e) { reject(e); }
      });
      doc.on('error', reject);
    });
  }

  // Page 1 — main sheet
  renderPage1(doc, data, assets);

  // Page 2 — merits + powers
  doc.addPage({
    size: [PAGE_W, PAGE_H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  renderPage2(doc, data, assets);

  doc.end();
  return resultPromise;
}

export { render };
