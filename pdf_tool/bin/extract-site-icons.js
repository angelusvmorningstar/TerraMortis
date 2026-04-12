#!/usr/bin/env node
/**
 * Extract clan/covenant icons from the site's existing icon bank
 * (public/js/data/icons.js — base64 SVG data URIs) and rasterise them to PNG
 * files in pdf_tool/assets/ using the names pdf_tool/src/iconmap.js expects.
 *
 * One-shot tool — re-run whenever the site adds/updates icons.
 *
 * Usage:
 *   node bin/extract-site-icons.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

// The site's icons.js uses `export const ICONS = { ... }` but the file
// extension is .js and public/ has no package.json with "type": "module",
// so Node refuses to import it directly. Work around by copying to a
// temporary .mjs file, then importing via file:// URL.
async function loadSiteIcons() {
  const srcPath = path.resolve(__dirname, '../../public/js/data/icons.js');
  const tmpPath = path.join(os.tmpdir(), `tm-icons-${process.pid}.mjs`);
  fs.copyFileSync(srcPath, tmpPath);
  try {
    const mod = await import('file://' + tmpPath);
    return mod.ICONS;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

// Map site icon key → pdf_tool asset filename
// Keys that don't map to anything in iconmap.js are skipped.
const KEY_TO_ASSET = {
  daeva:     'clan-daeva.png',
  gangrel:   'clan-gangrel.png',
  mekhet:    'clan-mekhet.png',
  nosferatu: 'clan-nosferatu.png',
  ventrue:   'clan-ventrue.png',

  carthian:  'covenant-carthian.png',
  crone:     'covenant-crone.png',
  invictus:  'covenant-invictus.png',
  lance:     'covenant-lancea.png',     // "Lancea et Sanctum"
  // No 'dracul' key in the site bank → Ordo Dracul falls back to text-only
};

// Target size for clan/covenant icons. Matches the iconSize used in page1.js.
// Rendering at 3× the display size gives a crisp result when scaled down in pdfkit.
const TARGET_W = 128;
const TARGET_H = 128;

// Accent colour the PDF renderer uses for clan/covenant icons on the cream
// parchment background. Matches C.ACCENT in src/layout.js.
const TINT_HEX = '#8b1a1a';

function decodeDataUri(uri) {
  const m = /^data:image\/svg\+xml;base64,(.+)$/.exec(uri);
  if (!m) throw new Error('not an svg+xml base64 data URI');
  let svg = Buffer.from(m[1], 'base64').toString('utf8');

  // Recolour every black / currentColor fill to the accent red so the icons
  // match Mammon.pdf's painterly red-brown style on a cream background.
  svg = svg
    .replace(/fill="#000000"/gi, `fill="${TINT_HEX}"`)
    .replace(/fill="#000"/gi,    `fill="${TINT_HEX}"`)
    .replace(/fill="black"/gi,   `fill="${TINT_HEX}"`)
    .replace(/fill="currentColor"/gi, `fill="${TINT_HEX}"`);

  // If the root <svg> tag has no explicit fill, default its color.
  if (!/fill="[^"]+"/.test(svg.split(/<\/?svg/)[0] || '')) {
    svg = svg.replace(/<svg\b/, `<svg fill="${TINT_HEX}"`);
  }

  return Buffer.from(svg, 'utf8');
}

async function main() {
  const assetDir = path.resolve(__dirname, '..', 'assets');
  fs.mkdirSync(assetDir, { recursive: true });

  const ICONS = await loadSiteIcons();
  console.log(`Loaded ${Object.keys(ICONS).length} site icons`);

  const results = [];
  for (const [key, assetName] of Object.entries(KEY_TO_ASSET)) {
    const uri = ICONS[key];
    if (!uri) {
      results.push({ key, assetName, status: 'MISSING from site' });
      continue;
    }
    try {
      const svgBuf = decodeDataUri(uri);
      const outPath = path.join(assetDir, assetName);
      await sharp(svgBuf, { density: 300 })
        .resize(TARGET_W, TARGET_H, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(outPath);
      const bytes = fs.statSync(outPath).size;
      results.push({ key, assetName, status: 'ok', bytes });
    } catch (err) {
      results.push({ key, assetName, status: 'FAILED: ' + err.message });
    }
  }

  console.log('\nExtraction results:');
  results.forEach(r => {
    const status = r.status === 'ok' ? `✓ ${r.bytes} B` : '✗ ' + r.status;
    console.log(`  ${r.key.padEnd(12)} → ${r.assetName.padEnd(26)}  ${status}`);
  });

  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\n${ok}/${results.length} icons extracted`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
