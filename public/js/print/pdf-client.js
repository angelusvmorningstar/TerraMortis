/**
 * Browser entry point for the character sheet PDF renderer.
 *
 * Usage (from a button click handler):
 *
 *     import { renderCharacterPdf, downloadCharacterPdf } from './print/pdf-client.js';
 *     import { serialiseForPrint, buildPrintMeta } from './editor/export-character.js';
 *
 *     const data = serialiseForPrint(c);
 *     data.print_meta = buildPrintMeta(c, data);
 *     await downloadCharacterPdf(data);
 *
 * The pdfkit standalone bundle must be loaded before calling renderCharacterPdf.
 * Either drop a <script> tag in the HTML:
 *
 *     <script src="https://cdn.jsdelivr.net/npm/pdfkit@0.18.0/js/pdfkit.standalone.js"></script>
 *
 * or call ensurePdfKitLoaded() which fetches and injects it on first use.
 */

import { render } from './render.js';

// ── Font and asset file list (mirrors pdf_tool/bin/render.js) ───────────────
const FONT_FILES = {
  // Note: CaslonAntique-Merged.ttf and GoudyBold-Merged.ttf are broken
  // (missing F/I/J glyphs). See pdf_tool/README.md. Use Sorts Mill Goudy and
  // Liberation Serif Bold instead.
  Caslon:    'SortsMillGoudy-Regular.ttf',
  GoudyBold: 'LiberationSerif-Bold.ttf',
  Body:      'SortsMillGoudy-Regular.ttf',
  BodyIt:    'SortsMillGoudy-Italic.ttf',
  Bold:      'LiberationSerif-Bold.ttf',
  Regular:   'LiberationSerif-Regular.ttf',
  Italic:    'LiberationSerif-Italic.ttf',
};

const ASSET_FILES = [
  'background.jpg',
  'logo-vampire.jpg',
  'banner-section.png',
  'diamond-city-status.png',
  'diamond-cov-status.png',
  'diamond-clan-status.png',
  'diamond-size.png',
  'diamond-speed.png',
  'diamond-defence.png',
  'clan-daeva.png', 'clan-gangrel.png', 'clan-mekhet.png',
  'clan-nosferatu.png', 'clan-ventrue.png',
  'covenant-carthian.png', 'covenant-crone.png',
  'covenant-invictus.png', 'covenant-lancea.png',
];

// ── CDN fallback for pdfkit standalone bundle ────────────────────────────────
const PDFKIT_CDN = 'https://cdn.jsdelivr.net/npm/pdfkit@0.18.0/js/pdfkit.standalone.js';
const BLOBSTREAM_CDN = 'https://cdn.jsdelivr.net/npm/blob-stream@0.1.3/.js';

// ── Singletons: lazy-loaded font/asset buffers ──────────────────────────────
let _fontsP = null;
let _assetsP = null;
let _pdfkitP = null;

/**
 * Ensure window.PDFDocument exists. If a <script> tag has already loaded the
 * standalone bundle, this resolves immediately. Otherwise it injects a script
 * tag from the CDN and waits for it.
 */
export function ensurePdfKitLoaded() {
  if (typeof window !== 'undefined' && window.PDFDocument) {
    return Promise.resolve(window.PDFDocument);
  }
  if (_pdfkitP) return _pdfkitP;

  _pdfkitP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFKIT_CDN;
    s.onload = () => {
      if (window.PDFDocument) resolve(window.PDFDocument);
      else reject(new Error('pdfkit standalone loaded but window.PDFDocument is undefined'));
    };
    s.onerror = () => reject(new Error('failed to load pdfkit standalone from CDN'));
    document.head.appendChild(s);
  });
  return _pdfkitP;
}

/**
 * Fetch a URL as an ArrayBuffer.
 *
 * Must return ArrayBuffer, NOT Uint8Array. In pdfkit's browser standalone
 * build, PDFImage.open checks `Buffer.isBuffer(src)` then
 * `src instanceof ArrayBuffer` then a data:URI regex — and if none match it
 * falls through to `fs.readFileSync(src)` which crashes. A Uint8Array fails
 * all three checks (it's not an ArrayBuffer — it's a view onto one via
 * .buffer), so we must hand the raw ArrayBuffer in. Fonts accept either via
 * PDFFontFactory.open, so returning ArrayBuffer works for both call sites.
 */
async function fetchBuf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
  return await r.arrayBuffer();
}

/** Load and cache all fonts from /assets/pdf/fonts/ */
function loadFonts() {
  if (_fontsP) return _fontsP;
  _fontsP = (async () => {
    const out = {};
    for (const [key, fname] of Object.entries(FONT_FILES)) {
      out[key] = await fetchBuf(`/assets/pdf/fonts/${fname}`);
    }
    return out;
  })();
  return _fontsP;
}

/** Load and cache all assets from /assets/pdf/icons/ */
function loadAssets() {
  if (_assetsP) return _assetsP;
  _assetsP = (async () => {
    const out = {};
    for (const fname of ASSET_FILES) {
      try {
        out[fname] = await fetchBuf(`/assets/pdf/icons/${fname}`);
      } catch (e) {
        // Missing icon file is non-fatal — renderer falls back to text-only
        console.warn(`[pdf-client] asset ${fname} unavailable:`, e.message);
      }
    }
    return out;
  })();
  return _assetsP;
}

/**
 * Render a character to a PDF Blob. `data` is the shape produced by
 * serialiseForPrint(c), optionally with a `print_meta` block merged in.
 */
export async function renderCharacterPdf(data) {
  const [PDFDocument, fonts, assets] = await Promise.all([
    ensurePdfKitLoaded(),
    loadFonts(),
    loadAssets(),
  ]);
  return render({ data, PDFDocument, fonts, assets });
}

/**
 * Render and trigger a browser download.
 */
export async function downloadCharacterPdf(data, filename) {
  const blob = await renderCharacterPdf(data);
  const name = filename || safeName(data.identity) + '_sheet.pdf';
  triggerDownload(blob, name);
  return blob;
}

/** Open the rendered PDF in a new tab instead of downloading. */
export async function openCharacterPdf(data) {
  const blob = await renderCharacterPdf(data);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Let the tab load before revoking
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function safeName(identity) {
  // Belt and braces: try displayName, then name, then fall back to 'character'.
  // Also strip leading/trailing underscores so a result like "____" (from an
  // all-non-alnum source e.g. dev-mode redaction block characters U+2588) falls
  // through to 'character' instead of producing a filename like "_sheet.pdf".
  const candidates = [
    identity && identity.displayName,
    identity && identity.name,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const clean = String(raw).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (clean) return clean;
  }
  return 'character';
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
