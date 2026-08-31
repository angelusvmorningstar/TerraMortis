/**
 * Static source guard: fails loudly if any TM Game source file writes a
 * changed value into a trait's `.bonus` field (attributes/skills/
 * disciplines/merits — `attrObj`/`skillObj`/`discObj`/`merit` in
 * server/schemas/character.schema.js), outside the two audit-confirmed
 * exceptions.
 *
 * TM Admin Story tm-admin.10.1 ("one true rating", Stage 1, Phase A). AC1
 * froze `bonus` in the schema's own doc comments; this is the mechanical
 * proof that the freeze holds — matching AC2's "verified, not asserted"
 * requirement and AC3's "fails loudly if reintroduced" requirement — not
 * just a restated claim.
 *
 * Two entry points, mirroring verify-rules-engine.js's own shape:
 *   1. CLI: `node server/scripts/rules-verify/verify-no-bonus-writes.js`
 *      Exits 0 on pass, 1 on violation found.
 *   2. Library: `import { verifyNoBonusWrites } from './verify-no-bonus-writes.js'`
 *      Returns { ok, violations, filesScanned }. Used by server/index.js's
 *      boot gate.
 *
 * What counts as a "write". A direct or compound assignment to a `.bonus`
 * property (`x.bonus = ...`, `x.bonus += ...`, `x['bonus'] = ...`), or a
 * quoted Mongo dot-path key ending in `.bonus` used as an object key
 * (`'attributes.Presence.bonus': N` — the $set shape STM-14b's migration
 * script used). A literal zero (`= 0`) is NOT flagged: zeroing is the safe
 * direction (matches STM-14b's own migration precedent, which zeroed
 * `.bonus` rather than left a stale value) — only a write that can
 * introduce a nonzero/changed value is a violation. Pure object-literal
 * pass-through construction (`{ ...existing, bonus: bonus || 0 }`, as
 * `public/js/data/accessors.js`'s `setAttrVal`/`setSkillObj` do to echo an
 * UNCHANGED bonus value back onto the object on every dot-click) is not
 * itself a `.bonus =` assignment and is not matched by this scanner — see
 * the story's own Dev Agent Record for the manual review that found those
 * two call sites benign.
 *
 * Known current gap (see the story's Dev Agent Record and
 * character.schema.js's own merit.bonus comment): `shAdjMeritBonus`
 * (public/js/editor/edit.js) DOES write a changed value into merit.bonus
 * and is not in the allowlist below. Running this guard today therefore
 * reports one real violation. That is this guard doing its job correctly,
 * not a bug in the guard — see the story record for why it is not fixed by
 * this same story.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const MANIFEST_PATH = join(__dirname, 'bonus-write-allowlist.json');

function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.allowlist)) {
    throw new Error(`Manifest at ${MANIFEST_PATH} has no "allowlist" array`);
  }
  if (!Array.isArray(parsed.scan_roots) || !Array.isArray(parsed.exclude_globs)) {
    throw new Error(`Manifest at ${MANIFEST_PATH} is missing "scan_roots"/"exclude_globs"`);
  }
  return parsed;
}

// Direct/compound assignment to a `.bonus` property or `['bonus']`/`["bonus"]`.
const ASSIGN_RE = /(\.bonus|\[['"]bonus['"]\])\s*(\+=|-=|=(?!=))\s*([^;\n]*)/;
// Quoted Mongo dot-path key ending in `.bonus`, used as an object key (the
// STM-14b migration script's `$set: {'attributes.Presence.bonus': 0}` shape).
const DOTPATH_KEY_RE = /['"][\w.]*\.bonus['"]\s*:\s*([^,}\n]*)/;

function isLiteralZero(rhs) {
  return rhs.trim().replace(/[,;]$/, '') === '0';
}

/** Deliberately simple (dir-prefix / filename-suffix only) — no glob
 *  dependency, matching this repo's own no-new-deps convention
 *  (specs/stories/34-smart-quote-guard.story.md). */
function isExcluded(relPath, excludeGlobs) {
  return excludeGlobs.some(g => {
    if (g.endsWith('/**')) return relPath.startsWith(g.slice(0, -3));
    if (g.startsWith('**/*')) return relPath.endsWith(g.slice(4)); // e.g. '**/*.test.js' -> suffix '.test.js'
    if (g.startsWith('**/')) return relPath.endsWith(g.slice(3));
    return relPath === g;
  });
}

function collectFiles(repoRoot, scanRoots, excludeGlobs) {
  const files = [];
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = relative(repoRoot, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (!isExcluded(rel + '/', excludeGlobs) && !isExcluded(rel, excludeGlobs)) walk(full);
      } else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) {
        if (!isExcluded(rel, excludeGlobs)) files.push(full);
      }
    }
  }
  for (const scanRoot of scanRoots) walk(join(repoRoot, scanRoot));
  return files;
}

function checkFile(filePath, repoRoot) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const rel = relative(repoRoot, filePath).replace(/\\/g, '/');
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const assignMatch = ASSIGN_RE.exec(line);
    if (assignMatch) {
      const op = assignMatch[2];
      const rhs = assignMatch[3] || '';
      if (op !== '=' || !isLiteralZero(rhs)) {
        violations.push({ file: rel, line: i + 1, text: line.trim(), kind: 'assignment' });
        continue; // one violation per line is enough
      }
    }

    const dotPathMatch = DOTPATH_KEY_RE.exec(line);
    if (dotPathMatch) {
      const rhs = dotPathMatch[1] || '';
      if (!isLiteralZero(rhs)) {
        violations.push({ file: rel, line: i + 1, text: line.trim(), kind: 'dot-path-key' });
      }
    }
  }
  return violations;
}

/**
 * @param {string} [repoRoot] Defaults to this file's own repo (TM Game).
 *   Overridable for tests.
 * @param {object} [manifestOverride] Defaults to the real manifest
 *   (bonus-write-allowlist.json). Overridable so tests can exercise the
 *   allowlist-matching mechanism itself without depending on the real
 *   entries' paths lining up with a synthetic fixture's scan roots.
 * @returns {{ ok: boolean, violations: Array, filesScanned: number }}
 */
export function verifyNoBonusWrites(repoRoot = REPO_ROOT, manifestOverride = null) {
  const manifest = manifestOverride || loadManifest();
  const files = collectFiles(repoRoot, manifest.scan_roots, manifest.exclude_globs);
  const allowlistedPaths = new Set(manifest.allowlist.map(a => a.path));

  const allViolations = [];
  for (const f of files) {
    const rel = relative(repoRoot, f).replace(/\\/g, '/');
    if (allowlistedPaths.has(rel)) continue; // never true for TM Game's own tree today — see manifest comment
    allViolations.push(...checkFile(f, repoRoot));
  }

  return { ok: allViolations.length === 0, violations: allViolations, filesScanned: files.length };
}

function formatViolationsReport(violations) {
  const lines = [
    `[verify-no-bonus-writes] FAIL — ${violations.length} write site(s) to a .bonus field found outside the named allowlist:`,
  ];
  for (const v of violations) {
    lines.push(`  • ${v.file}:${v.line} [${v.kind}]`);
    lines.push(`      ${v.text}`);
  }
  lines.push('');
  lines.push('bonus is write-frozen (server/schemas/character.schema.js) as of TM Admin Story');
  lines.push('tm-admin.10.1. Either this is a regression of the retired STM-14 class of bug, or a');
  lines.push('genuinely new exception that needs a named, signed-off entry in');
  lines.push('bonus-write-allowlist.json — not a silent addition.');
  return lines.join('\n');
}

function formatPassReport(filesScanned) {
  return `[verify-no-bonus-writes] OK — ${filesScanned} file(s) scanned, zero unallowlisted .bonus writes found.`;
}

export { formatViolationsReport, formatPassReport, loadManifest };

// CLI entry — only when invoked directly, not when imported.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = verifyNoBonusWrites();
  if (result.ok) {
    console.log(formatPassReport(result.filesScanned));
    process.exit(0);
  } else {
    console.error(formatViolationsReport(result.violations));
    process.exit(1);
  }
}
