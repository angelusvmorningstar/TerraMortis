/**
 * BL-3b (issue #1008) — the constants are gone, the seed is archived, and the
 * two frozen fixture copies cannot drift.
 *
 * AC 1, 2, 3, 5, 6, 8. This is a deletion story, so almost everything it can
 * get wrong is invisible to a unit test of behaviour: an export removed while
 * something still reads it (`data-map.md` Known Drift Pattern #1) is a runtime
 * `ReferenceError`, not a parse error, because ES modules resolve free
 * identifiers at runtime and this repo has no linter. BL-3a's own review
 * shipped exactly that bug — `isClanDisc` deleted with two live call sites
 * surviving, past a test that checked for the declaration rather than the
 * calls. So the assertions here are source greps over the real tree, and they
 * are deliberately written against what is CALLED and IMPORTED, not what is
 * declared.
 *
 * The other half of the story's risk is scaffolding drift. `dev-fixtures.js`
 * and `server/tests/helpers/bloodline-fixtures.js` now hold the same 23
 * documents frozen in two places, because `dev-fixtures.js` cannot import
 * anything (it is guarded by `if(_isDev)` and replaces `window.fetch`). Two
 * frozen copies of dev scaffolding are acceptable; two that can silently
 * disagree are not, which is what the equality guard below is for.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOODLINE_FIXTURES } from './helpers/bloodline-fixtures.js';
import { stripComments } from './helpers/strip-comments.js';
// Imported, not grepped: a named import of a deleted export is itself the
// assertion that CLAN_DISCS survived, and it fails this file loudly at load
// time rather than quietly at some future call site.
import { CLAN_DISCS } from '../../public/js/data/constants.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/**
 * A source grep must not pass (or fail) on prose.
 *
 * This used to be a pair of regular expressions inlined here. BL-3b's external
 * review found the blind spot: regexes cannot tell a comment from the same
 * characters inside a string or a template literal, so a line like
 * `const sep = '//';` erased the rest of itself and took any deleted-constant
 * reference after it down quietly. Replaced with the quote-aware scanner in
 * `helpers/strip-comments.js`, which is self-tested at the bottom of this file.
 */
const code = rel => stripComments(read(rel));

function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkJs(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

const rel = file => path.relative(REPO_ROOT, file).replace(/\\/g, '/');

// ─────────────────────────────────────────────────────────────────────────────
// AC 1 — the three exports are gone, and CLAN_DISCS is not
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3b — AC 1: constants.js no longer defines a bloodline', () => {
  const src = code('public/js/data/constants.js');

  it('exports none of the three', () => {
    expect(src).not.toMatch(/export\s+const\s+BLOODLINE_DISCS\b/);
    expect(src).not.toMatch(/export\s+const\s+BLOODLINE_CLANS\b/);
    expect(src).not.toMatch(/export\s+const\s+APPROVED_BLOODLINES\b/);
  });

  it('keeps CLAN_DISCS, which is a different thing and still live', () => {
    // It is the five clans' own discipline lists, read by `data/accessors.js`
    // for the no-bloodline fallback. Deleting it with the others would break
    // every character who has no bloodline, which is most of them.
    expect(src).toMatch(/export\s+const\s+CLAN_DISCS\s*=/);
    expect(Object.keys(CLAN_DISCS).sort())
      .toEqual(['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue']);
  });

  it('says where bloodlines went, so the next author does not re-add them here', () => {
    // Comment-only, and the point of it: an ST opening this file used to find a
    // complete, plausible, current-looking bloodline table with nothing saying
    // it was dead.
    const raw = read('public/js/data/constants.js');
    expect(raw).toMatch(/bloodlines-cache\.js/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 2 — nothing in public/js names the three in code
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3b — AC 2: no client file mentions the deleted constants in code', () => {
  it('has no offenders at all, with no allow-list', () => {
    // BL-3a needed a five-entry allow-list here. BL-3b removed every reason for
    // one, so this runs with none: any file that turns up is a regression, not
    // an exception to be carved out.
    const offenders = [];
    for (const file of walkJs(path.join(REPO_ROOT, 'public/js'))) {
      if (/BLOODLINE_DISCS|BLOODLINE_CLANS|APPROVED_BLOODLINES/.test(code(rel(file)))) {
        offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the migration-history comments survive, because they are the signpost', () => {
    // `code()` strips comments before matching, so these are invisible to the
    // grep above and must stay: they are how a reader finds the collection.
    expect(read('public/js/data/bloodlines-cache.js')).toMatch(/BLOODLINE_DISCS/);
    expect(read('public/js/data/accessors.js')).toMatch(/BLOODLINE_DISCS/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 3 — dev-fixtures.js serves a frozen blob and imports nothing
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3b — AC 3: dev-fixtures.js is self-contained', () => {
  const raw = read('public/js/dev-fixtures.js');

  it('has no import statements at all', () => {
    // The rest of the file already assumes this: it is a plain script of `var`
    // blobs plus a `window.fetch` shim, and the bloodline branch was the only
    // thing that ever made it a module.
    expect(code('public/js/dev-fixtures.js')).not.toMatch(/^\s*import\s/m);
  });

  it('carries BLOODLINES as a single-line pure-JSON var, like its five siblings', () => {
    // The file is CRLF, so trim before stripping the semicolon.
    const line = raw.split('\n').map(l => l.trim()).find(l => l.startsWith('var BLOODLINES='));
    expect(line, 'no `var BLOODLINES=` line').toBeTruthy();
    expect(() => JSON.parse(line.slice('var BLOODLINES='.length).replace(/;$/, ''))).not.toThrow();
  });

  it('serves the blob directly instead of computing the payload', () => {
    expect(code('public/js/dev-fixtures.js'))
      .toMatch(/if\(method==='GET'&&seg\[0\]==='bloodlines'&&!seg\[1\]\)return _mock\(BLOODLINES\);/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 8 — the two frozen copies are equal, by test
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3b — AC 8: the two frozen fixture copies cannot drift', () => {
  /**
   * `dev-fixtures.js` cannot be imported under Node — it reads `localStorage`
   * at module scope and replaces `window.fetch` — so the blob is parsed back
   * out of the source text. This is why AC 3 requires it on ONE line as pure
   * JSON: a multi-line or JS-literal blob would need a JS parser here, and a
   * guard that is hard to write is a guard that gets dropped.
   */
  const blob = (() => {
    const m = /^var BLOODLINES=(\[.*\]);$/m.exec(read('public/js/dev-fixtures.js'));
    if (!m) throw new Error('the `var BLOODLINES=` line is missing or no longer single-line JSON');
    return JSON.parse(m[1]);
  })();

  it('parses to 23 documents', () => {
    expect(blob).toHaveLength(23);
  });

  it('deep-equals the server suite fixture, document for document', () => {
    expect(blob).toEqual(BLOODLINE_FIXTURES);
  });

  it('carries exactly the fields GET /api/bloodlines serves, with notes projected out', () => {
    // `PUBLIC_PROJECTION` in `server/routes/bloodlines.js` excludes `notes` and
    // NOTHING else, so the two timestamps are part of the served response and
    // belong here. BL-3b's first cut dropped them and its review put them back:
    // a fixture whose comment claims to be the response shape has to be it.
    for (const d of blob) {
      expect(Object.keys(d).sort())
        .toEqual(['_id', 'clan', 'created_at', 'disciplines', 'name', 'slug', 'updated_at']);
      expect(d.disciplines).toHaveLength(4);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 5 — the seed is archived, self-contained, and out of the live tree
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3b — AC 5: the seed is retired to scripts/archive', () => {
  it('lives at scripts/archive/seed-bloodlines.js and not at scripts/', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'server/scripts/archive/seed-bloodlines.js'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'server/scripts/seed-bloodlines.js'))).toBe(false);
  });

  it('carries the two constants as frozen local literals, not a cross-boundary import', () => {
    const src = code('server/scripts/archive/seed-bloodlines.js');
    expect(src).toMatch(/const BLOODLINE_DISCS = \{/);
    expect(src).toMatch(/const BLOODLINE_CLANS = \{/);
    expect(src, 'the constants file no longer exports these').not.toMatch(/BLOODLINE_DISCS[^=]*\}\s*from/);
  });

  it('no longer re-exports deriveSlug', () => {
    // Its stated purpose was to keep importers working UNTIL the archive move.
    expect(code('server/scripts/archive/seed-bloodlines.js')).not.toMatch(/export\s*\{\s*deriveSlug\s*\}/);
  });

  it('nothing outside scripts/archive imports it, except the spec that keeps it working', () => {
    // Import specifiers only, static or dynamic — this file names the path in
    // string literals all over the place and is not an importer.
    //
    // All three quote styles, not just `'`. Every real import in this repo is
    // single-quoted (checked 2026-08-11: zero double-quoted module specifiers
    // anywhere in `server/` or `public/js`), so the narrow version was not
    // hiding anything today. It was still the wrong shape for a guard whose
    // entire job is to catch the drift nobody is looking for, which is what
    // BL-3b's external review said about it.
    //
    // And `import` on its own, not only `from` and `import(`. The review's own
    // example was `import "../scripts/archive/seed-bloodlines.js"` — a bare
    // side-effect import, which has no `from` and no parenthesis and which the
    // first cut of this fix STILL missed until it was tested against exactly
    // that line. A side-effect import of the seed is the worst case of all,
    // because it runs the module rather than merely borrowing a function from it.
    const IMPORTS_SEED = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`][^'"`]*seed-bloodlines\.js['"`]/;

    // Exactly one exemption, and it is not a "live" importer in the sense this
    // guard means: `bl3b-archived-seed-smoke.test.js` exists BECAUSE the seed is
    // deliberately kept runnable (AC 5). Production has never been seeded and
    // this is still the only bulk path into the collection, so its integrity
    // gate and document builder need executable coverage or a regression in
    // them only surfaces the day someone runs `--apply` for real. The exemption
    // is asserted to be real below, so it cannot rot into a dead carve-out.
    const SMOKE_SPEC = 'server/tests/bl3b-archived-seed-smoke.test.js';

    const offenders = [];
    for (const file of walkJs(path.join(REPO_ROOT, 'server'))) {
      const r = rel(file);
      if (r.startsWith('server/scripts/archive/')) continue;
      if (r === SMOKE_SPEC) continue;
      if (IMPORTS_SEED.test(code(r))) offenders.push(r);
    }
    expect(offenders, 'a retired migration must have no live importers').toEqual([]);

    // The carve-out has to still be doing its job. If the smoke spec is deleted
    // or stops importing the archived script, this guard has quietly widened.
    expect(fs.existsSync(path.join(REPO_ROOT, SMOKE_SPEC)), `${SMOKE_SPEC} is missing`).toBe(true);
    expect(IMPORTS_SEED.test(code(SMOKE_SPEC)), `${SMOKE_SPEC} no longer imports the archived seed`).toBe(true);
  });

  it('still resolves every relative import it kept, one directory deeper', () => {
    // The move added a level; a missed `../` is a crash the moment someone runs
    // it, which is the one thing this file is kept runnable for.
    const src = code('server/scripts/archive/seed-bloodlines.js');
    const dir = path.join(REPO_ROOT, 'server/scripts/archive');
    const specs = [...src.matchAll(/from\s+'(\.[^']+)'/g)].map(m => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(fs.existsSync(path.resolve(dir, spec)), `unresolved import ${spec}`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — retiring the seed does not retire the unique-index guarantee
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3b — AC 6: the unique name index, post-ADMR-1', () => {
  /**
   * UPDATED BY ADMR-1 (2026-08-26). This block used to pin
   * `server/routes/bloodlines.js` as the live, non-archived importer that
   * kept `ensureBloodlineNameIndex` from becoming the archived seed's problem
   * alone — the whole point being that a later "tidy up the archive" pass
   * could remove that guarantee without noticing. ADMR-1 IS that removal, but
   * a deliberate one, not an accidental tidy-up: ST authoring of bloodlines
   * (and with it, responsibility for the collection's unique-name index)
   * moved to TM Admin, a separate app this repo's own test suite cannot see
   * into. This repo no longer creates or writes `bloodlines` documents at
   * all, so it has nothing left to guarantee an index ahead of.
   *
   * What stays true, and what this now checks: `bloodline-name-index.js`
   * still has exactly the one PRODUCTION importer BL-3b's own archiving left
   * it with — the frozen `scripts/archive/seed-bloodlines.js`, smoke-tested
   * for exactly this reason by `bl3b-archived-seed-smoke.test.js`. If a LIVE
   * (non-archive, non-test) importer reappears, that is a real product
   * decision (this repo taking bloodline writes back, or some other
   * live-owner reason) and deserves a human decision, not a silent pass here.
   *
   * `server/tests/` is excluded from this scan (ADMR-1, 2026-08-26): this
   * story's own `bloodline-name-index.test.js` imports the module directly to
   * test it, which is exactly the coverage this guard wants to exist, not the
   * production drift it exists to catch.
   */
  const importers = () => {
    const out = [];
    for (const file of walkJs(path.join(REPO_ROOT, 'server'))) {
      const r = rel(file);
      if (r.startsWith('server/scripts/archive/')) continue;
      if (r.startsWith('server/tests/')) continue;
      if (r.endsWith('/bloodline-name-index.js')) continue;
      // All three quote styles — see the seed-importer guard above for why.
      if (/from\s+['"`][^'"`]*bloodline-name-index\.js['"`]/.test(code(r))) out.push(r);
    }
    return out;
  };

  it('has NO production importer outside scripts/archive - ADMR-1 retired the last one', () => {
    expect(importers(), 'a live importer reappeared - decide deliberately, this is not automatically wrong').toEqual([]);
  });

  it('the archived seed script is still the one real caller', () => {
    const src = code('server/scripts/archive/seed-bloodlines.js');
    expect(src).toMatch(/from\s+['"`][^'"`]*bloodline-name-index\.js['"`]/);
    expect(src).toMatch(/ensureBloodlineNameIndex\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The guards' own reliability — added by BL-3b's review
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-3b review — the comment stripper the AC 1/2/5/6 greps depend on', () => {
  /**
   * Every source grep above is only as good as `stripComments`. If it treats
   * comment-like characters INSIDE a string literal as a real comment, it
   * erases executable code, and an offender scan that finds nothing is then
   * indistinguishable from an offender scan that could not see. That is a
   * silent false negative in a guard whose whole purpose is that there is no
   * silent failure — so the stripper is tested, not trusted.
   */

  it('strips a real line comment', () => {
    expect(stripComments('const a = 1; // gone\nconst b = 2;\n'))
      .toBe('const a = 1; \nconst b = 2;\n');
  });

  it('strips a real block comment, including a multi-line one', () => {
    expect(stripComments('a; /* gone */ b;')).toBe('a;  b;');
    expect(stripComments('a;\n/*\n gone\n*/\nb;')).toBe('a;\n\n\n\nb;');
  });

  it('does NOT treat a `//` inside a string as a comment', () => {
    // The exact case BL-3b's external review raised. Under the old regex pair
    // everything after the `'//'` vanished and `BLOODLINE_DISCS` went with it.
    const src = "const marker = '//'; use(BLOODLINE_DISCS);";
    expect(stripComments(src)).toBe(src);
    expect(stripComments(src)).toMatch(/BLOODLINE_DISCS/);
  });

  it('does NOT treat a block-comment opener inside a string as a comment', () => {
    // Worse than the line case: the old regex ate everything from here to the
    // next closer, which in a real file is the next JSDoc block, taking every
    // line between them out of the scan.
    const src = "const open = '/*'; use(BLOODLINE_CLANS);\nconst close = '*/'; more(APPROVED_BLOODLINES);";
    expect(stripComments(src)).toBe(src);
    expect(stripComments(src)).toMatch(/BLOODLINE_CLANS/);
    expect(stripComments(src)).toMatch(/APPROVED_BLOODLINES/);
  });

  it('does NOT treat `//` inside a double-quoted or template literal as a comment', () => {
    expect(stripComments('const u = "https://x"; keep(1);')).toBe('const u = "https://x"; keep(1);');
    expect(stripComments('const t = `a // b`; keep(2);')).toBe('const t = `a // b`; keep(2);');
  });

  it('carries template-literal state across lines, so a `//` inside one survives', () => {
    const src = 'const t = `line one\n// not a comment\nline three`;\nkeep(BLOODLINE_DISCS);';
    expect(stripComments(src)).toMatch(/not a comment/);
    expect(stripComments(src)).toMatch(/BLOODLINE_DISCS/);
  });

  it('honours a backslash escape rather than closing the literal early', () => {
    const src = "const s = 'it\\'s // still a string'; keep(3);";
    expect(stripComments(src)).toBe(src);
  });

  it('preserves the line count, so a source-position assertion stays meaningful', () => {
    const src = 'a;\n// c\n/* d\n e */\nb;\n';
    expect(stripComments(src).split('\n')).toHaveLength(src.split('\n').length);
  });
});
