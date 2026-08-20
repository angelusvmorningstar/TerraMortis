/**
 * gdx-4 (issue #985, absorbing #859) - the CSS-standards ratchet.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this file exists
 * ──────────────────────────────────────────────────────────────────────────
 *
 * #854 normalised the colour literals out of this repo once. The enforcement
 * grep it left behind matched HTML `style="..."` attributes only, so two whole
 * classes of drift walked straight back in:
 *
 *   1. DOM-API styling from JavaScript (`el.style.cssText = '...#333...'`,
 *      `el.style.color = '#fff'`) was never guarded at all - that gap is what
 *      #859 was raised for.
 *   2. Even the attribute shape it DID guard came back, because the grep only
 *      ever ran by hand. `public/js/tabs/downtime-form.js` picked up a
 *      `style="color:#b23"` in EQC-4 (#1155, commit ff72cbad, 2026-08-13) and
 *      nothing noticed for a week.
 *
 * So the grep is checked in. It runs over the WHOLE of `public/js` and
 * `public/css/suite.css`, not only over the files gdx-4 happened to touch,
 * because a ratchet that only guards yesterday's offenders is not a ratchet.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   The policy this file enforces, in full
 * ──────────────────────────────────────────────────────────────────────────
 *
 * A colour in this repo resolves through a design token from
 * `public/css/theme.css`, or it is one of exactly TWO standing exemptions.
 * Both are named here on purpose, so a future reader who lands on a failure
 * learns the policy from the failing test rather than having to find three
 * documents:
 *
 *   • `public/js/editor/print.js`'s embedded `<style>` block. `printSheet()`
 *     builds a complete standalone document and hands it to a new window. That
 *     document does not link `theme.css` and must not: a print sheet needs dark
 *     ink on white paper whichever theme the ST is running. Its hexes live
 *     inside that one embedded stylesheet, never in an inline attribute - which
 *     is precisely what assertion 2 below keeps true.
 *
 *   • `console.log('%c...')` devtools banners (`public/js/admin.js:2`). Console
 *     `%c` styling is parsed by the browser's console, not by the page's CSS
 *     engine, so it cannot read a custom property.
 *
 * There is also one COMPLIANT shape that is not an exemption and must not be
 * "fixed": `var(--token, #hex)`, where the hex is only a fallback and the token
 * is what actually renders. #859 AC2 ruled on this using `public/js/app.js`'s
 * `var(--green2, #7EC8A0)` as the precedent. Assertion 1 allows that one site by
 * CONTENT, and assertion 3's predicate deliberately steps over every `var()`
 * fallback in `suite.css` (there are eleven).
 *
 * Adding a third exemption means adding it to this header, to
 * `specs/architecture/coding-standards.md` -> CSS Standards -> Documented
 * exemptions, and to whichever allowlist below it belongs in. That cost is the
 * point.
 *
 * AC1, AC2, AC3, AC7.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const rel = file => path.relative(REPO_ROOT, file).replace(/\\/g, '/');

/**
 * Comments are prose. A guard that fires on prose gets a carve-out bolted on,
 * and a carve-out is how the guard stops guarding.
 *
 * `helpers/strip-comments.js` is the quote-aware scanner BL-3b's review put in
 * to replace the naive block/line regex pair, which could not tell a comment
 * from the same characters inside a string or a template literal and erased
 * real executable text in 10 of 659 files when measured. It errs towards
 * KEEPING text, so this file can raise a false alarm but cannot fall silent.
 * It is self-tested in `bl3b-constants-deleted.test.js`.
 */
const code = rel => stripComments(read(rel));

function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkJs(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

const JS_FILES = walkJs(path.join(REPO_ROOT, 'public/js')).map(rel);

/** Line number of a match index, for a failure message someone can act on. */
const lineOf = (src, index) => src.slice(0, index).split('\n').length;

// ─────────────────────────────────────────────────────────────────────────────
// AC1 - no DOM-API colour literal in public/js
// ─────────────────────────────────────────────────────────────────────────────

describe('gdx-4 AC1 - styling from JavaScript uses tokens, never literals', () => {
  /**
   * The widened grep #859 asked for, published verbatim in
   * `specs/architecture/coding-standards.md`:
   *
   *   grep -rnoE "\.style\.[a-zA-Z]+\s*=\s*['\"`][^'\"`]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
   *
   * Widened here to 8 hex digits so `#RRGGBBAA` cannot slip past, which the
   * shell version's `{3,6}` would allow through as a 6-digit prefix anyway.
   */
  const DOM_API = /\.style\.[a-zA-Z]+\s*=\s*['"`][^'"`]*(?:#[0-9A-Fa-f]{3,8}|rgba?\()/g;

  /**
   * The single permitted hit, matched on CONTENT rather than on a line number.
   *
   * Every line number in gdx-4's own source issues had rotted - #859's two
   * citations were off by 66 and 31 lines by the time the story was written, and
   * #985's three were wrong at every commit checked. Pinning a line here would
   * just queue up the same failure.
   */
  const ALLOWED = [
    // No closing paren in the snippet: the grep's `[^'"`]*` stops at the hex, so
    // the match text ends mid-`var()`. Match on what the grep actually captures,
    // not on what the source line reads like.
    { file: 'public/js/app.js', snippet: 'var(--green2, #7EC8A0' },
  ];

  it('has no offender outside the one documented var() fallback', () => {
    const offenders = [];
    for (const f of JS_FILES) {
      const src = code(f);
      for (const m of src.matchAll(DOM_API)) {
        const permitted = ALLOWED.some(a => a.file === f && m[0].includes(a.snippet));
        if (!permitted) offenders.push(`${f}:${lineOf(src, m.index)} ${m[0].trim()}`);
      }
    }
    expect(offenders, 'set the colour with a class backed by a theme.css token instead').toEqual([]);
  });

  it('and the allowed fallback is still really there, so the carve-out cannot rot', () => {
    // If `app.js` is ever tokenised properly this assertion fails and the
    // allowlist above gets deleted with it, rather than sitting on as a
    // permanently-open hole nobody remembers the reason for.
    for (const a of ALLOWED) {
      expect(code(a.file), `${a.file} no longer contains ${a.snippet}`).toContain(a.snippet);
    }
  });

  it('leaves the console %c banner alone, because it is a named exemption', () => {
    // `console.log('%c...', 'color: #E0C47A; ...')` is not a `.style.` assignment
    // so the grep never saw it, but a future author widening this file must know
    // it is deliberate rather than missed. Console `%c` styling is parsed by the
    // devtools console, which has no access to the page's custom properties.
    expect(code('public/js/admin.js')).toMatch(/console\.log\('%c\[TM Admin\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 - no HTML-attribute colour literal in public/js, print.js included
// ─────────────────────────────────────────────────────────────────────────────

describe('gdx-4 AC2 - no inline style attribute carries a colour', () => {
  /**
   * The #854 grep, published verbatim in `coding-standards.md`:
   *
   *   grep -rnoE "style=\"[^\"]*(#[0-9A-Fa-f]{3,6}|rgba?\()" public/js/
   *
   * Widened two ways, both measured against the tree first: to 8 hex digits, and
   * to single-quoted attributes. The single-quote form returned zero hits at
   * gdx-4 time, so closing it costs nothing today and shuts a bypass that would
   * otherwise be one keystroke wide.
   */
  const ATTR = /style=(["'])[^"']*(?:#[0-9A-Fa-f]{3,8}|rgba?\()/g;

  it('has zero offenders, with no allowlist at all', () => {
    // `print.js` passes this only because gdx-4 Task 4 moved its five
    // Category-A literals into the document's own embedded `<style>` block.
    // The exemption is for that stylesheet, NOT for the file: if a future
    // change puts a colour back into a `style="..."` attribute inside
    // `print.js`'s markup, it must fail here.
    const offenders = [];
    for (const f of JS_FILES) {
      const src = code(f);
      for (const m of src.matchAll(ATTR)) offenders.push(`${f}:${lineOf(src, m.index)} ${m[0].trim()}`);
    }
    expect(offenders, 'apply a class declared in a stylesheet instead').toEqual([]);
  });

  it('print.js still keeps its print colour in the embedded stylesheet', () => {
    // The other half of the exemption: it is only honest while the colour is
    // actually THERE. If someone deletes the embedded rules the print sheet goes
    // unstyled, which is invisible until an ST prints a character.
    const src = read('public/js/editor/print.js');
    expect(src).toMatch(/\.print-muted\s*\{[^}]*color:\s*#888/);
    expect(src).toMatch(/\.print-note\s*\{[^}]*color:\s*#555/);
    expect(src).toMatch(/\.xp-row-total\s*\{[^}]*#999/);
    // And the exemption is recorded in the generated document itself.
    expect(src).toMatch(/coding-standards\.md/);
  });

  it('the EQC-4 regression specifically cannot come back', () => {
    // Named because it is the one this ratchet was built after, not before.
    const src = code('public/js/tabs/downtime-form.js');
    expect(src).not.toMatch(/#b23/i);
    // The class the markup already referenced is now declared for real.
    expect(read('public/css/components.css')).toMatch(/\.dt-equipment-tweak-warn\s*\{/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 - no bare hex in a suite.css rule body
// ─────────────────────────────────────────────────────────────────────────────

describe('gdx-4 AC3 - suite.css declarations resolve through tokens', () => {
  /**
   * "Bare" is the whole difficulty here. A naive `/#[0-9A-Fa-f]{3,6}/` over the
   * file matches three things this story must NOT touch:
   *
   *   • the eleven compliant `var(--token, #hex)` fallbacks,
   *   • ID selectors made entirely of hex digits, of which `#feed-chev` is a
   *     real live example in this file,
   *   • hexes quoted inside comments.
   *
   * So the predicate strips comments, then repeatedly strips `var(...)` from the
   * inside out (which handles a nested fallback), then looks only INSIDE
   * declaration values - text after a `:` that follows a `{` or a `;`. A
   * selector is never in that position.
   *
   * `theme.css` is deliberately not scanned: it is the declared hex SSOT and is
   * where every one of these values is supposed to live.
   */
  const blank = m => m.replace(/[^\n]/g, ' ');

  function declarationValues(css) {
    let t = css.replace(/\/\*[\s\S]*?\*\//g, blank);
    let prev;
    do { prev = t; t = t.replace(/var\(\s*--[^()]*\)/g, blank); } while (t !== prev);
    const out = [];
    for (const m of t.matchAll(/(?:^|[{;])([^{};:]*):([^;{}]*)/g)) {
      out.push({ prop: m[1].trim(), value: m[2], line: lineOf(t, m.index) });
    }
    return out;
  }

  const BARE_HEX = /#[0-9A-Fa-f]{3,8}(?![0-9A-Za-z_-])/g;

  it('has none left', () => {
    const offenders = [];
    for (const d of declarationValues(read('public/css/suite.css'))) {
      const hits = d.value.match(BARE_HEX);
      if (hits) offenders.push(`public/css/suite.css:${d.line} ${d.prop}: ${hits.join(', ')}`);
    }
    expect(offenders, 'use a theme.css token; mint one there if none fits').toEqual([]);
  });

  it('the three gdx-4 sites resolve through the tokens the story chose', () => {
    const css = read('public/css/suite.css');
    // Mask alpha stops on #bnav's fade. Any opaque value works - a token was
    // used in preference to an exemption purely because --ink-black already
    // exists, is theme-invariant, and is declared once in :root.
    expect(css).toMatch(/-webkit-mask-image:\s*linear-gradient\([^;]*var\(--ink-black\)/);
    expect(css).toMatch(/[^-]mask-image:\s*linear-gradient\([^;]*var\(--ink-black\)/);
    // Glyph sitting on an always-dark stat icon, which is what this token is for.
    expect(css).toMatch(/\.city-stat-glyph\s*\{[^}]*color:\s*var\(--txt-on-dark\)/);
  });

  it('leaves the compliant var() fallbacks in place - they are not offenders', () => {
    // Carve-out guard in the other direction: this test must not have been made
    // to pass by sweeping the eleven fallback sites #859 AC2 rules compliant.
    const css = read('public/css/suite.css');
    //
    // Eleven `var(--token, <fallback>)` sites, of which TEN have a hex fallback
    // and one (`var(--gold2-a40, rgba(224, 196, 122, .4))`) has an rgba one.
    // gdx-4's story text called all eleven "hex" fallbacks; measured against the
    // tree, ten are. Counted here as the union, which is the honest predicate.
    const fallbacks = css.match(/var\(\s*--[a-zA-Z0-9-]+\s*,\s*(?:#[0-9A-Fa-f]{3,8}|rgba?\()/g) || [];
    expect(fallbacks.length, 'the var(--token, fallback) sites were swept, which was not the ask')
      .toBeGreaterThanOrEqual(11);
  });

  it('the ~17 bare rgba() sites are still there - carve-out 3, not this story', () => {
    // Deliberately asserted so a later sweep of them is a conscious act that
    // updates this test, rather than something that quietly happens under cover
    // of "tidying". See specs/deferred-work.md, gdx-4 section, carve-out 3.
    const css = read('public/css/suite.css');
    const bare = (css.match(/(?<!var\([^()]{0,80})rgba?\(/g) || []).length;
    expect(bare).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (source half) - the redundant !important grid declarations are gone
// ─────────────────────────────────────────────────────────────────────────────

describe('gdx-4 AC4 - no !important on the grid rules, and .story-split is declared once', () => {
  const css = read('public/css/suite.css');

  it('.sh-attr-grid and .skill-grid no longer shout', () => {
    // Both beat a components.css rule of identical specificity that index.html
    // already loads FIRST, so source order alone decided it. Neither class is
    // ever emitted with an inline style, so nothing else was being beaten.
    expect(css).toMatch(/\.sh-attr-grid\s*\{\s*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.skill-grid\s+\{\s*grid-template-columns:\s*1fr;/);
    expect(css).not.toMatch(/\.sh-attr-grid[^}]*!important/);
    expect(css).not.toMatch(/\.skill-grid[^}]*!important/);
  });

  it('.story-split is declared exactly once at base and once at min-width 900px', () => {
    // The second copy existed only to beat the first one, ten lines above it in
    // the same file, using !important to do it.
    const bases = css.match(/^\.story-split\s*\{/gm) || [];
    // `[ \t]`, not `\s`: `\s` matches the newline itself, so `^\s+` would also
    // match the base block and count it twice.
    const nested = css.match(/^[ \t]+\.story-split\s*\{/gm) || [];
    expect(bases, 'the duplicate base block is back').toHaveLength(1);
    expect(nested, 'the duplicate media-query block is back').toHaveLength(1);
    expect(css).not.toMatch(/\.story-split[^}]*!important/);
  });

  it('the merge kept 16px, not the 20px from the block that used to lose', () => {
    // The one silent-regression risk in the whole merge: block one said 20px,
    // block two said 16px, and block two won on !important plus source order.
    // Getting this backwards is a 4px shift on every phone downtime report.
    expect(css).toMatch(/^\.story-split \{ display: flex; flex-direction: column; gap: 16px; \}$/m);
  });

  it('.tab-split survived - it was never the duplicated one', () => {
    expect(css).toMatch(/^\.tab-split \{/m);
    expect(css).toMatch(/\.tab-split \{ flex-direction: row;/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (source half) - the one inline JS grid is a class
// ─────────────────────────────────────────────────────────────────────────────

describe('gdx-4 AC4 - no inline grid-template-columns is built in JavaScript', () => {
  it('public/js has no inline grid-template-columns left', () => {
    // One site at gdx-4 time (`admin/next-session.js`). The second one in the
    // tree lives in `public/theme-preview.html`, a standalone token-preview page
    // that is not part of either app's build, and is not scanned here.
    const offenders = [];
    for (const f of JS_FILES) {
      const src = code(f);
      for (const m of src.matchAll(/style=(["'])[^"']*grid-template-columns/g)) {
        offenders.push(`${f}:${lineOf(src, m.index)}`);
      }
    }
    expect(offenders, 'declare the grid as a class in a stylesheet').toEqual([]);
  });

  it('the Next Session field row uses .ns-field-grid, declared in admin-layout.css', () => {
    expect(code('public/js/admin/next-session.js')).toMatch(/class="ns-field-grid"/);
    expect(read('public/css/admin-layout.css'))
      .toMatch(/\.ns-field-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 - the documents carry the prohibition and the exemption register
// ─────────────────────────────────────────────────────────────────────────────

describe('gdx-4 AC5 - the standards documents say all of this out loud', () => {
  it('coding-standards.md prohibits DOM-API literals and publishes both greps', () => {
    const doc = read('specs/architecture/coding-standards.md');
    expect(doc).toMatch(/style\.cssText/);
    expect(doc).toMatch(/Documented exemptions/);
    // Both greps published verbatim. Asserted with toContain rather than a
    // regex, because the published text is itself a regex full of backslashes.
    expect(doc).toContain('\\.style\\.[a-zA-Z]+\\s*=\\s*');           // the AC1 grep
    expect(doc).toContain('style=\\"[^\\"]*(#[0-9A-Fa-f]{3,6}|rgba?\\()'); // the AC2 grep
  });

  it('and names exactly the two standing exemptions', () => {
    const doc = read('specs/architecture/coding-standards.md');
    expect(doc).toMatch(/print\.js/);
    expect(doc).toMatch(/%c/);
  });

  it('project-context.md carries the short cross-reference', () => {
    // That file's own header says "keep it short and high-signal", so it gets a
    // sentence and a pointer, not a copy of the block above.
    expect(read('specs/project-context.md')).toMatch(/cssText|\.style\./);
  });

  it('deferred-work.md records the four gdx-4 carve-outs', () => {
    const doc = read('specs/deferred-work.md');
    expect(doc).toMatch(/gdx-4-mobile-css-cleanup/);
    expect(doc).toMatch(/gdx-13-dead-css-selector-retirement/);
    expect(doc).toMatch(/gdx-14-inline-font-size-sweep/);
    expect(doc).toMatch(/gdx-15-rgba-literal-tokenisation/);
    expect(doc).toMatch(/--fh2/);
  });
});
