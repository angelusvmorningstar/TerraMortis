/**
 * BL-3b review fix (issue #1008) — strip JavaScript comments without stripping
 * code that merely LOOKS like a comment.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this exists
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Several specs in this repo prove things about the source tree by grepping it:
 * "no file in `public/js` names `BLOODLINE_DISCS` in code", "nothing outside
 * `scripts/archive/` imports the retired seed", "every slug derivation goes
 * through the shared module". A grep like that must not fire on prose, so each
 * of them stripped comments first with a pair of regular expressions — one
 * matching a block comment lazily, one matching a line comment to end of line.
 *
 * Those regexes do not lex JavaScript. They cannot tell a comment from the same
 * characters inside a string, a template literal or a regular expression, so
 * `const sep = '//';` erases the rest of that line, and a block-comment opener
 * inside a string literal erases everything up to the next closer, which can be
 * hundreds of lines away. BL-3b's external review raised this as a blind spot
 * in exactly the guards whose whole job is to have no blind spot, and it is not
 * theoretical: measured across `public/js` and `server` on 2026-08-11, the
 * regex pair erased real executable text in 10 of 659 files. (It happened not
 * to hide any of the three deleted constant names on that day. "Happened not
 * to" is not a guarantee, which is the point.)
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   What this does instead, and what it deliberately does not do
 * ──────────────────────────────────────────────────────────────────────────
 *
 * A character scanner that tracks quote state. A single quote, double quote or
 * backtick opens a literal; a backslash escapes the next character; the two
 * plain quote styles also close at end of line, because JavaScript forbids a
 * raw newline inside them, while a template literal carries across lines.
 * Comment markers are honoured only OUTSIDE a literal.
 *
 * It is not a parser and does not try to be. Regular-expression literals are
 * not recognised, so a regex containing a lone quote character opens a literal
 * that then closes at end of line. That mis-read errs in the safe direction on
 * purpose: it makes the scanner KEEP text it should have dropped, so a guard
 * can raise a false alarm (loud, investigated) but not fall silent (quiet,
 * shipped). A full AST parse would cost a parser dependency for a repo that has
 * no linter and no build step, and would buy nothing the safe-direction bias
 * does not already cover.
 *
 * `server/tests/bl3b-constants-deleted.test.js` self-tests this function, so
 * the reliability of the guards is itself guarded.
 *
 * @param {string} src - JavaScript source text.
 * @returns {string} the same text with comment bodies removed, line count and
 *   every non-comment character preserved.
 */
export function stripComments(src) {
  const out = [];
  let inBlock = false;
  let inTemplate = false;

  for (const line of src.split('\n')) {
    let kept = '';
    let quote = inTemplate ? '`' : null;
    let i = 0;

    while (i < line.length) {
      const c = line[i];
      const c2 = line[i + 1];

      if (inBlock) {
        if (c === '*' && c2 === '/') { inBlock = false; i += 2; } else { i += 1; }
        continue;
      }

      if (quote) {
        if (c === '\\') { kept += c + (c2 ?? ''); i += 2; continue; }
        if (c === quote) { quote = null; kept += c; i += 1; continue; }
        kept += c; i += 1; continue;
      }

      if (c === "'" || c === '"' || c === '`') { quote = c; kept += c; i += 1; continue; }
      if (c === '/' && c2 === '/') break;                    // rest of the line is a comment
      if (c === '/' && c2 === '*') { inBlock = true; i += 2; continue; }

      kept += c;
      i += 1;
    }

    // Plain quotes cannot span a newline; a template literal can, and must
    // carry its state into the next line or a `//` inside it would read as a
    // comment and silently take executable text with it.
    inTemplate = quote === '`';
    out.push(kept);
  }

  return out.join('\n');
}
