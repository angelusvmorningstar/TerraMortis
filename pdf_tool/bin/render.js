#!/usr/bin/env node
/**
 * CLI entry point — renders a character JSON fixture to a PDF file.
 *
 * Usage:
 *   node bin/render.js fixtures/mammon.json out/mammon.pdf
 *
 * The renderer source of truth lives in public/js/print/ as browser ES modules.
 * This CLI dynamic-imports them from there so there's one implementation used
 * by both Node verification and the browser site integration.
 *
 * Node uses require('pdfkit') — the Node build — not the standalone browser
 * bundle. See specs/guidance/pdf-target/PRIOR-ART.md for why mixing them broke
 * the previous server attempt.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const PDFDocument = require('pdfkit');

/**
 * The renderer source in public/js/print/ is pure ESM, but public/ has no
 * package.json declaring "type": "module" (adding one would affect the whole
 * site). Work around by copying the 6 renderer files to a temp directory with
 * .mjs extensions, then dynamic-importing from there. Zero side effects on
 * the public/ tree.
 */
async function loadRendererFromPublic(rootDir) {
  const srcDir = path.resolve(rootDir, '..', 'public', 'js', 'print');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-pdf-'));
  const names = ['layout.js','helpers.js','iconmap.js','page1.js','page2.js','render.js'];
  for (const n of names) {
    const src = fs.readFileSync(path.join(srcDir, n), 'utf8')
      .replace(/from '\.\/(\w+)\.js'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(tmp, n.replace(/\.js$/, '.mjs')), src);
  }
  const mod = await import(pathToFileURL(path.join(tmp, 'render.mjs')).href);
  return { render: mod.render, cleanup: () => {
    try { for (const n of names) fs.unlinkSync(path.join(tmp, n.replace(/\.js$/, '.mjs'))); fs.rmdirSync(tmp); } catch {}
  } };
}

async function main() {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];
  if (!inputArg || !outputArg) {
    console.error('Usage: node bin/render.js <input.json> <out.pdf>');
    process.exit(1);
  }

  const input = path.resolve(inputArg);
  const output = path.resolve(outputArg);
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));

  const root = path.resolve(__dirname, '..');
  const fontDir = path.join(root, 'fonts');
  const assetDir = path.join(root, 'assets');

  // Note: CaslonAntique-Merged.ttf and GoudyBold-Merged.ttf both have missing
  // glyphs (F/I/J uppercase among others — see font-test.pdf). Remap the
  // 'Caslon' role to Sorts Mill Goudy which has a small-caps aesthetic when
  // uppercased and a complete glyph set. Keep the 'GoudyBold' role on
  // Liberation Serif Bold for the same reason.
  const fonts = {
    Caslon:    fs.readFileSync(path.join(fontDir, 'SortsMillGoudy-Regular.ttf')),
    GoudyBold: fs.readFileSync(path.join(fontDir, 'LiberationSerif-Bold.ttf')),
    Body:      fs.readFileSync(path.join(fontDir, 'SortsMillGoudy-Regular.ttf')),
    BodyIt:    fs.readFileSync(path.join(fontDir, 'SortsMillGoudy-Italic.ttf')),
    Bold:      fs.readFileSync(path.join(fontDir, 'LiberationSerif-Bold.ttf')),
    Regular:   fs.readFileSync(path.join(fontDir, 'LiberationSerif-Regular.ttf')),
    Italic:    fs.readFileSync(path.join(fontDir, 'LiberationSerif-Italic.ttf')),
  };

  // Load every asset file in assets/ into memory by filename
  const assets = {};
  for (const fname of fs.readdirSync(assetDir)) {
    if (/\.(png|jpg|jpeg)$/i.test(fname)) {
      assets[fname] = fs.readFileSync(path.join(assetDir, fname));
    }
  }

  // Ensure output dir exists
  fs.mkdirSync(path.dirname(output), { recursive: true });

  // Load the ESM renderer from public/js/print/ via tmp-copy workaround
  const { render, cleanup } = await loadRendererFromPublic(root);

  const stream = fs.createWriteStream(output);
  try {
    await render({ data, PDFDocument, fonts, assets, output: stream });
    console.log(`✓ Wrote ${output}`);
  } catch (err) {
    console.error('Render failed:');
    console.error(err.stack || err.message);
    process.exit(2);
  } finally {
    cleanup();
  }
}

main();
