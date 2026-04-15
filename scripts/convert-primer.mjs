#!/usr/bin/env node
/**
 * Convert the primer markdown file to a static HTML asset served by Netlify.
 *
 * Source:  public/primer/Terra_Mortis_Setting_Primer.md
 * Output:  public/primer/primer.html
 *
 * Re-run with `npm run primer:build` whenever the .md changes. The player
 * portal's primer-tab.js fetches the output directly as a static file,
 * bypassing the .docx upload workflow in archive_documents.
 *
 * Transformations:
 *   - marked with GFM enabled for tables, line breaks, etc.
 *   - Headings get slugified IDs so the markdown's own in-doc TOC links work
 *     (e.g. `[Power Play](#power-play)` targets `<h1 id="power-play">`).
 *   - Image src is rewritten from `images/foo.jpg` to `/primer/images/foo.jpg`
 *     because the HTML gets injected into a page served from /player.html,
 *     so relative paths would resolve incorrectly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const SRC        = path.join(REPO_ROOT, 'public/primer/Terra_Mortis_Setting_Primer.md');
const OUT        = path.join(REPO_ROOT, 'public/primer/primer.html');

// ── slug generation ─────────────────────────────────────────────────────────
// Mirrors the common GitHub-style slugify: lowercase, strip non-alnum except
// spaces and hyphens, collapse spaces to hyphens. Deduplicates with `-2`, `-3`
// suffixes if the same heading appears twice.

const slugCounts = new Map();
function slugify(text) {
  const base = String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const n = slugCounts.get(base) || 0;
  slugCounts.set(base, n + 1);
  return n === 0 ? base : `${base}-${n + 1}`;
}

// ── marked configuration ────────────────────────────────────────────────────

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const raw  = tokens.map(t => t.raw || '').join('');
      const id   = slugify(raw);
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
    image({ href, title, text }) {
      // Rewrite relative `images/…` to absolute `/primer/images/…`
      let src = href;
      if (src && !/^(https?:|\/)/.test(src)) {
        src = '/primer/' + src.replace(/^\.?\//, '');
      }
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${src}" alt="${text || ''}"${titleAttr}>`;
    },
  },
});

// ── run ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(SRC)) {
  console.error(`Source not found: ${SRC}`);
  process.exit(1);
}

const md = fs.readFileSync(SRC, 'utf8');
const html = marked.parse(md);

fs.writeFileSync(OUT, html, 'utf8');
console.log(`Wrote ${path.relative(REPO_ROOT, OUT)} (${html.length.toLocaleString()} bytes)`);
