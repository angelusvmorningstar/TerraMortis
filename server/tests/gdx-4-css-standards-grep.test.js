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
 * So the grep is checked in. It runs over the WHOLE of `public/js` and (as of
 * the Codex adversarial review below) the WHOLE of `public/css` except
 * `theme.css`, not only over the files gdx-4 happened to touch, because a
 * ratchet that only guards yesterday's offenders is not a ratchet.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Codex review hardening (2026-08-20)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * An adversarial review of this story found five real gaps in the ratchet as
 * first written, all now closed here:
 *
 *   1. AC1's DOM-API regex only matched `.style.<prop> = '...'`. Bracket
 *      notation, `+=` mutation, `.setProperty(...)` and
 *      `.setAttribute('style', ...)` all set the same thing and were unguarded.
 *      Fixed by `STYLE_FORMS` below.
 *   2. The same regex's single greedy match could span an ENTIRE `cssText`
 *      string and get excused in full because it merely CONTAINED the one
 *      allowed `var()` fallback snippet - which would have let a second, real
 *      bare hex sitting next to that fallback through unnoticed. Every colour
 *      token is now checked against the allowlist by its own position, not by
 *      the surrounding match's.
 *   3. AC2's attribute regex stopped its value scan at the first quote
 *      character of EITHER kind, so a double-quoted attribute whose value
 *      legitimately contained a single quote truncated before reaching a real
 *      colour later in the same attribute. It also required `style=` with no
 *      surrounding whitespace. Both fixed with a backreference-matched value.
 *   4. AC3's declaration-value scanner split on the first `;` even when that
 *      `;` sat inside a quoted string within the value (e.g. a data-URI
 *      background), which could silently drop a real bare hex sitting later
 *      in the same declaration. The value scanner now steps over a quoted
 *      string as one atomic unit, the same way it already steps over `var()`.
 *   5. AC3 (and by extension AC7's "whole of public/css" claim) only ever
 *      scanned `suite.css`. See the new AC7 describe block below for how that
 *      is closed without silently absorbing unrelated pre-existing debt.
 *
 * What this still cannot catch, and is not trying to: a colour literal built
 * by string concatenation (`'#' + 'fff'`) or assembled through a variable a
 * human reading the diff would have to trace. A source-text ratchet is not a
 * substitute for code review; it exists to catch the shape #859 and this
 * review were actually raised for.
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

/** Replace matched text with same-length whitespace, preserving line numbers. */
const blank = m => m.replace(/[^\n]/g, ' ');

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
   * The checked-in ratchet is a SUPERSET of that grep - see the file header's
   * "Codex review hardening" section for exactly what it now catches that the
   * shell grep cannot, and why (bracket-notation, `+=`, `setProperty`,
   * `setAttribute`, and per-token rather than per-match allowlisting).
   */
  const STYLE_FORMS = [
    // `.style.<prop> =` / `+=`, and the bracket-notation twin `.style['prop']`.
    /\.style(?:\.[a-zA-Z]+|\[\s*['"`][a-zA-Z]+['"`]\s*\])\s*\+?=\s*(['"`])((?:(?!\1)[\s\S])*)\1/g,
    // `.style.setProperty('prop', '...')`
    /\.style\.setProperty\s*\(\s*['"`][a-zA-Z-]+['"`]\s*,\s*(['"`])((?:(?!\1)[\s\S])*)\1/g,
    // `.setAttribute('style', '...')`
    /\.setAttribute\s*\(\s*['"`]style['"`]\s*,\s*(['"`])((?:(?!\1)[\s\S])*)\1/g,
  ];

  const COLOUR_TOKEN = /#[0-9A-Fa-f]{3,8}(?![0-9A-Za-z_-])|rgba?\(/g;

  /**
   * The single permitted hit, matched on CONTENT rather than on a line number.
   *
   * Every line number in gdx-4's own source issues had rotted - #859's two
   * citations were off by 66 and 31 lines by the time the story was written, and
   * #985's three were wrong at every commit checked. Pinning a line here would
   * just queue up the same failure.
   */
  const ALLOWED = [
    { file: 'public/js/app.js', snippet: 'var(--green2, #7EC8A0' },
  ];

  /** Every colour token inside every DOM-API style assignment in `src`. */
  function domApiOffenders(src, file) {
    const offenders = [];
    for (const form of STYLE_FORMS) {
      form.lastIndex = 0;
      for (const m of src.matchAll(form)) {
        const content = m[2];
        // Step over `var(--token, <fallback>)` the same way AC3 does, so a
        // compliant fallback's own hex is never itself treated as a hit.
        const stripped = content.replace(/var\(\s*--[^()]*\)/g, blank);
        for (const hit of stripped.matchAll(COLOUR_TOKEN)) {
          const hitEnd = hit.index + hit[0].length;
          // Permitted ONLY if this exact token is the tail of an allowed
          // snippet - not merely if the allowed snippet appears SOMEWHERE in
          // the same assigned string. A second, unrelated hex earlier or later
          // in the same `cssText` must still be caught.
          const permitted = ALLOWED.some(a => {
            if (a.file !== file) return false;
            const idx = content.indexOf(a.snippet);
            return idx !== -1 && idx + a.snippet.length === hitEnd;
          });
          if (!permitted) offenders.push(`${file}:${lineOf(src, m.index)} ${m[0].trim().slice(0, 100)}`);
        }
      }
    }
    return offenders;
  }

  it('has no offender outside the one documented var() fallback', () => {
    const offenders = [];
    for (const f of JS_FILES) offenders.push(...domApiOffenders(code(f), f));
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

  it('catches every DOM-API shape the Codex review found as a live bypass', () => {
    const shapes = [
      `el.style['color'] = '#fff';`,
      `el.style.setProperty('color', '#fff');`,
      `el.setAttribute('style', 'color:#fff');`,
      `el.style.cssText += 'color:#fff';`,
    ];
    for (const src of shapes) {
      expect(domApiOffenders(src, 'synthetic.js'), `expected an offender for: ${src}`).not.toEqual([]);
    }
  });

  it('does not let a real hex hide behind the one allowed var() fallback in the same string', () => {
    // The original single-pattern regex could match an entire cssText string
    // in one backtrack and excuse the WHOLE match because it merely contained
    // the allowed snippet - which would have let this #fff through unnoticed.
    const src = `el.style.cssText = 'color:var(--green2, #7EC8A0);background:#fff';`;
    const offenders = domApiOffenders(src, 'public/js/app.js');
    expect(offenders, 'the #fff after the allowed fallback must still be caught').not.toEqual([]);
    expect(offenders.some(o => o.includes('#fff'))).toBe(true);
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
   * Widened beyond that grep - see the file header's "Codex review hardening"
   * section for the two live bypasses this closes: an opposite quote inside
   * the value truncating the scan early, and whitespace around `=` that the
   * shell grep's literal `style=\"` cannot see at all.
   */
  const ATTR = /style\s*=\s*(["'])((?:(?!\1)[\s\S])*)\1/g;
  const COLOUR = /#[0-9A-Fa-f]{3,8}(?![0-9A-Za-z_-])|rgba?\(/;

  /**
   * NOT a compliant shape, unlike AC1's `ALLOWED` list - this is a genuine,
   * pre-existing violation the Codex-hardened regex surfaced for the first
   * time. The original ATTR regex's `[^"']*` value scan stopped at the FIRST
   * quote of either kind, which was zero characters into this exact source
   * (`style="color:' + (att ? '...` - a literal `'` sits immediately after
   * `color:`), so it was always invisible; it has nothing to do with gdx-4's
   * own diff. Deferred rather than fixed here because `sheet.js`'s Touchstones
   * panel is entirely outside this story's file list and any colour change
   * needs Angelus's own deployed-environment look before shipping, per this
   * repo's own testing discipline. See `deferred-work.md` carve-out 6 for the
   * full evidence, including the exact-match dark-theme token this could
   * probably use. This list existing at all is a deliberate, logged
   * concession - do not add a second entry without the same evidence trail.
   */
  const DEFERRED_VIOLATIONS = [
    { file: 'public/js/editor/sheet.js', snippet: "att ? 'rgba(140,200,140,.9)'" },
  ];

  it('has zero offenders outside the one deferred, pre-existing violation', () => {
    // `print.js` passes this only because gdx-4 Task 4 moved its five
    // Category-A literals into the document's own embedded `<style>` block.
    // The exemption is for that stylesheet, NOT for the file: if a future
    // change puts a colour back into a `style="..."` attribute inside
    // `print.js`'s markup, it must fail here.
    const offenders = [];
    for (const f of JS_FILES) {
      const src = code(f);
      for (const m of src.matchAll(ATTR)) {
        if (!COLOUR.test(m[2])) continue;
        const deferred = DEFERRED_VIOLATIONS.some(d => d.file === f && m[2].includes(d.snippet));
        if (!deferred) offenders.push(`${f}:${lineOf(src, m.index)} ${m[0].trim().slice(0, 100)}`);
      }
    }
    expect(offenders, 'apply a class declared in a stylesheet instead').toEqual([]);
  });

  it('the one deferred violation is still really there, so the carve-out cannot rot', () => {
    for (const d of DEFERRED_VIOLATIONS) {
      expect(code(d.file), `${d.file} no longer contains ${d.snippet}`).toContain(d.snippet);
    }
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

  it('catches the two shapes the Codex review found as a live bypass', () => {
    const shapes = [
      `style="background:url('x');color:#fff"`,
      `style = "color:#fff"`,
    ];
    for (const src of shapes) {
      const offenders = [];
      for (const m of src.matchAll(ATTR)) {
        if (COLOUR.test(m[2])) offenders.push(m[0]);
      }
      expect(offenders, `expected an offender for: ${src}`).not.toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 - no bare hex in a CSS rule body
// ─────────────────────────────────────────────────────────────────────────────

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
 * selector is never in that position. The value scanner treats a quoted
 * string as one atomic unit it steps over, so a `;` inside e.g. a data-URI
 * cannot truncate the scan before a real bare hex sitting later in the same
 * declaration (Codex review, 2026-08-20 - see the file header).
 *
 * `theme.css` is deliberately not scanned: it is the declared hex SSOT and is
 * where every one of these values is supposed to live.
 */
function declarationValues(css) {
  let t = css.replace(/\/\*[\s\S]*?\*\//g, blank);
  let prev;
  do { prev = t; t = t.replace(/var\(\s*--[^()]*\)/g, blank); } while (t !== prev);
  const QUOTED = String.raw`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"`;
  const VALUE = `(?:${QUOTED}|[^;{}])*`;
  const DECL = new RegExp(`(?:^|[{;])([^{};:]*):(${VALUE})`, 'g');
  const out = [];
  for (const m of t.matchAll(DECL)) {
    out.push({ prop: m[1].trim(), value: m[2], line: lineOf(t, m.index) });
  }
  return out;
}

const BARE_HEX = /#[0-9A-Fa-f]{3,8}(?![0-9A-Za-z_-])/g;

/** All bare-hex offenders in one CSS file's declaration values. */
function bareHexOffenders(cssPath) {
  const offenders = [];
  for (const d of declarationValues(read(cssPath))) {
    const hits = d.value.match(BARE_HEX);
    if (hits) offenders.push(`${cssPath}:${d.line} ${d.prop}: ${hits.join(', ')}`);
  }
  return offenders;
}

describe('gdx-4 AC3 - suite.css declarations resolve through tokens', () => {
  it('has none left', () => {
    expect(bareHexOffenders('public/css/suite.css'), 'use a theme.css token; mint one there if none fits').toEqual([]);
  });

  it('catches a bare hex sitting after a quoted semicolon in the same declaration', () => {
    // The exact shape the Codex review demonstrated as a live bypass: a data
    // URI's own embedded `;` used to truncate the value scan before ever
    // reaching a real bare hex declared later in the same rule body.
    const css = `.a { background: url("data:image/svg+xml;charset=utf8,<svg fill='x'/>"), #fff; }`;
    const values = declarationValues(css);
    const hit = values.some(d => BARE_HEX.test(d.value));
    expect(hit, 'the bare #fff after the quoted data URI must still be found').toBe(true);
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
// AC7 - the ratchet extends to the rest of public/css, honestly scoped
// ─────────────────────────────────────────────────────────────────────────────

describe('gdx-4 AC7 - the other public/css stylesheets cannot grow new bare hex either', () => {
  /**
   * AC7 says this ratchet must catch a reintroduction "over the whole of
   * public/js and public/css, not only over the files this story touched."
   * The Codex review (2026-08-20) found that AC3's implementation only ever
   * scanned `suite.css`, which is the one stylesheet this story's Bullet 3
   * actually swept.
   *
   * Measured with the same `declarationValues()`/`BARE_HEX` predicate used
   * above (not a naive grep, which mostly matches ID selectors like
   * `#feed-toggle` and GitHub-issue references like `#1155` inside comments -
   * neither is a colour), four of the five other stylesheets already have
   * ZERO bare-hex declaration values and are held to the same standard as
   * `suite.css`. `admin-layout.css` has four genuine, pre-existing ones,
   * entirely unrelated to anything gdx-4 touched:
   *
   *   admin-layout.css:5712  .proc-ambience-dir-decrease { color: #c06060 }
   *   admin-layout.css:9155  .npcr-rels-row.disp-positive { border-left: ... #5a7d3a }
   *   admin-layout.css:9983  .hd-btn-delete { ... color: #fff }
   *   admin-layout.css:9985  .hd-btn-delete:not(:disabled):hover { background: #a00 }
   *
   * Sweeping those four to tokens is a per-site design judgement in two
   * themes, exactly like carve-out 3's ~17 `rgba()` sites in `suite.css` -
   * it is not a mechanical substitution this test can silently assume, and
   * bundling it into a review response rather than its own audited story is
   * how a "quick fix" becomes the next `downtime-form.js:5498`. So this file
   * is grandfathered at these four PINNED (property, hex) sites and fails on
   * any offender outside that exact list - which is what actually protects
   * against a silent regression without an unscoped mass migration.
   *
   * Pinned by site, not by count. A Codex adversarial review (2026-08-21)
   * found the first version of this test grandfathered a bare COUNT
   * (`offenders.length <= 4`), which a fix-one/add-one change could satisfy
   * without ever being caught: tokenise one of the four listed sites while a
   * genuinely NEW, unrelated bare hex appears elsewhere in the same file, and
   * the count stays at four. Pinning the exact pairs closes that.
   *
   * See `gdx-17-css-hex-ratchet-full-coverage` in `specs/deferred-work.md`.
   */
  const ZERO_OFFENDER_FILES = [
    'public/css/admin-shared.css',
    'public/css/admin-spheres.css',
    'public/css/components.css',
    'public/css/layout.css',
  ];

  const GRANDFATHERED = {
    'public/css/admin-layout.css': [
      { prop: 'color', hex: '#c06060' },        // .proc-ambience-dir-decrease, line 5712
      { prop: 'border-left', hex: '#5a7d3a' },   // .npcr-rels-row.disp-positive, line 9155
      { prop: 'color', hex: '#fff' },            // .hd-btn-delete, line 9983
      { prop: 'background', hex: '#a00' },       // .hd-btn-delete:not(:disabled):hover, line 9985
    ],
  };

  it('has zero bare-hex declaration values in admin-shared.css, admin-spheres.css, components.css and layout.css', () => {
    const offenders = ZERO_OFFENDER_FILES.flatMap(bareHexOffenders);
    expect(offenders, 'use a theme.css token; mint one there if none fits').toEqual([]);
  });

  it('has no bare hex in admin-layout.css outside its four pinned pre-existing sites', () => {
    for (const [cssPath, pinned] of Object.entries(GRANDFATHERED)) {
      const offenders = [];
      for (const d of declarationValues(read(cssPath))) {
        const hits = d.value.match(BARE_HEX);
        if (!hits) continue;
        for (const hex of hits) {
          const excused = pinned.some(p => p.prop === d.prop && p.hex === hex);
          if (!excused) offenders.push(`${cssPath}:${d.line} ${d.prop}: ${hex}`);
        }
      }
      expect(offenders, `${cssPath} has a bare hex outside its pinned baseline - see this file's own header before adding to the pinned list`).toEqual([]);
    }
  });

  it('the pinned admin-layout.css sites are still really there, so the grandfather cannot quietly cover for something else', () => {
    const values = declarationValues(read('public/css/admin-layout.css'));
    for (const p of GRANDFATHERED['public/css/admin-layout.css']) {
      const found = values.some(d => d.prop === p.prop && (d.value.match(BARE_HEX) || []).includes(p.hex));
      expect(found, `${p.prop}: ${p.hex} is no longer in admin-layout.css - update the pinned list instead of leaving it stale`).toBe(true);
    }
  });

  it('catches a fix-one/add-one swap that a count-only grandfather would have missed', () => {
    // Prove-discriminate the exact shape the Codex review demonstrated: tokenise
    // one pinned site while a NEW, unrelated bare hex appears elsewhere. The
    // count stays at four either way; only the pinned-pair check can tell.
    const css = read('public/css/admin-layout.css')
      .replace('color: #c06060', 'color: var(--crim, #c06060)') // pretend-fixed
      + '\n.synthetic-new-offender { color: #123456; }\n';       // brand-new violation
    const offenders = [];
    for (const d of declarationValues(css)) {
      const hits = d.value.match(BARE_HEX);
      if (!hits) continue;
      for (const hex of hits) {
        const excused = GRANDFATHERED['public/css/admin-layout.css'].some(p => p.prop === d.prop && p.hex === hex);
        if (!excused) offenders.push(`${d.line} ${d.prop}: ${hex}`);
      }
    }
    // Total count is still 4 (lost #c06060 as a bare literal - it is now a var()
    // fallback and stepped over - gained #123456), which is exactly why a
    // count-only check would have passed this. The pinned check must not.
    expect(offenders, 'the new synthetic offender must be caught even though the total count did not grow').not.toEqual([]);
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

  it('and discloses that the checked-in ratchet is a superset of the published greps', () => {
    // The Codex review (2026-08-20) found the doc's own "Enforcement" text
    // implied the published shell greps and the checked-in vitest suite were
    // the same check. They are not (wider hex-digit count, both quote styles,
    // more DOM-API syntax forms) - a human who copy-pastes the shell command
    // gets a WEAKER check than what actually gates the repo, so the doc must
    // say so rather than imply equivalence.
    const doc = read('specs/architecture/coding-standards.md');
    expect(doc).toMatch(/superset|wider|stricter/i);
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

  it('and records the fifth and sixth carve-outs the Codex review surfaced', () => {
    const doc = read('specs/deferred-work.md');
    expect(doc).toMatch(/gdx-17-css-hex-ratchet-full-coverage/);
    expect(doc).toMatch(/gdx-18-sheet-touchstone-attached-colour-token/);
  });
});
