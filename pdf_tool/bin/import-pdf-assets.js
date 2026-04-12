#!/usr/bin/env node
/**
 * Import the painterly sheet-element assets from the repo-root pdf_assets/
 * folder into the PDF tool's asset directories.
 *
 * Source:  /pdf_assets/              (51 files, committed via `b3f829f`)
 * Targets: /pdf_tool/assets/         (for Node CLI verification)
 *          /public/assets/pdf/icons/ (for the browser renderer)
 *
 * For clan/covenant icons: reads the SVG, recolours every black / currentColor
 * fill to the accent red `#8b1a1a`, and rasterises to PNG at 256x256 via sharp.
 * For decorative element PNGs (frame, panel, banners, BP/humanity accents, stat
 * diamond, status shields): copies the PNG verbatim — they already have the
 * right colour baked in and transparency.
 *
 * Run once per pdf_assets update:
 *   node bin/import-pdf-assets.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TINT_HEX = '#8b1a1a';
const ICON_W = 256;
const ICON_H = 256;

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR   = path.join(REPO_ROOT, 'pdf_assets');
const TARGETS = [
  path.join(REPO_ROOT, 'pdf_tool', 'assets'),
  path.join(REPO_ROOT, 'public', 'assets', 'pdf', 'icons'),
];

// SVG → PNG with red tint (clan + covenant icons).
// Key = source filename (without extension) in pdf_assets/
// Value = target filename in assets/
const TINTED_SVGS = {
  'daeva icon':     'clan-daeva.png',
  'gangrel icon':   'clan-gangrel.png',
  'mekhet icon':    'clan-mekhet.png',
  'nosferatu icon': 'clan-nosferatu.png',
  'ventrue icon':   'clan-ventrue.png',
  'carthian icon':  'covenant-carthian.png',
  'crone icon':     'covenant-crone.png',
  'invictus icon':  'covenant-invictus.png',
  'lance icon':     'covenant-lancea.png',
  'dragon icon':    'covenant-dracul.png',     // Ordo Dracul — new coverage
};

// PNG files to copy verbatim (already have correct colour + alpha).
// Key = source filename in pdf_assets/
// Value = target filename or array of target filenames (same file → multiple names).
//
// Note: covenant status and clan status are the same shape in Mammon — only
// the labels differ — so covenant status.png is copied into both filenames.
// city status has its own distinct shield shape.
const COPY_PNGS = {
  'frame.png':            'frame.png',
  'panel.png':            'panel.png',
  'name banner.png':      'name-banner.png',
  'short banner.png':     'short-banner.png',
  'banner.png':           'banner-ornate.png',
  'BP.png':               'bp-icon.png',
  'humanity.png':         'humanity-icon.png',
  'city status.png':      'diamond-city-status.png',
  'covenant status.png':  ['diamond-cov-status.png', 'diamond-clan-status.png'],
  'stat.png':             'stat-diamond.png',
  'TM logo.png':          'tm-logo.png',
  'TM logo-gold.png':     'tm-logo-gold.png',
  // Vampire: The Requiem masthead logo with alpha channel — replaces the
  // JPG version extracted from Mammon.pdf that had an opaque white edge.
  'logo_header.png':      'logo-vampire.png',
};

function recolourSvg(svgStr) {
  return svgStr
    .replace(/fill="#000000"/gi, `fill="${TINT_HEX}"`)
    .replace(/fill="#000"/gi,    `fill="${TINT_HEX}"`)
    .replace(/fill="black"/gi,   `fill="${TINT_HEX}"`)
    .replace(/fill="currentColor"/gi, `fill="${TINT_HEX}"`);
}

async function processTintedSvgs() {
  for (const [srcStem, targetName] of Object.entries(TINTED_SVGS)) {
    const srcPath = path.join(SRC_DIR, srcStem + '.svg');
    if (!fs.existsSync(srcPath)) {
      console.warn(`  ✗ ${srcStem}.svg not found in pdf_assets/`);
      continue;
    }
    let svg = fs.readFileSync(srcPath, 'utf8');
    svg = recolourSvg(svg);
    const svgBuf = Buffer.from(svg, 'utf8');
    const pngBuf = await sharp(svgBuf, { density: 300 })
      .resize(ICON_W, ICON_H, {
        fit: 'inside',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    for (const dir of TARGETS) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, targetName), pngBuf);
    }
    console.log(`  ✓ ${srcStem}.svg → ${targetName}  (${pngBuf.length} B)`);
  }
}

function processCopyPngs() {
  for (const [srcName, targetSpec] of Object.entries(COPY_PNGS)) {
    const srcPath = path.join(SRC_DIR, srcName);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  ✗ ${srcName} not found in pdf_assets/`);
      continue;
    }
    const buf = fs.readFileSync(srcPath);
    const targets = Array.isArray(targetSpec) ? targetSpec : [targetSpec];
    for (const targetName of targets) {
      for (const dir of TARGETS) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, targetName), buf);
      }
    }
    console.log(`  ✓ ${srcName} → ${targets.join(', ')}  (${buf.length} B)`);
  }
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`pdf_assets not found at ${SRC_DIR}`);
    console.error('Expected painterly asset pack from commit b3f829f.');
    process.exit(1);
  }
  console.log(`Importing from ${SRC_DIR}\n`);

  console.log('Tinted SVGs → PNG:');
  await processTintedSvgs();

  console.log('\nCopy PNGs verbatim:');
  processCopyPngs();

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
