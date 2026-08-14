/**
 * DBO-9 — NON_COMBAT_STYLES consolidated to a single source
 * (public/js/data/constants.js), replacing two byte-for-byte duplicate local
 * consts (sheet.js's own NON_COMBAT_STYLES, downtime-form.js's own
 * NON_COMBAT_STYLES_DT).
 *
 * sheet.js and downtime-form.js are both heavy on browser globals
 * (document/window) and are not directly importable under vitest — this
 * repo's own established pattern for logic buried in those files is a
 * source-contract test against the real file text, not live invocation
 * (see n7-n9-allocator-readers.test.js). constants.js itself has no browser
 * dependency, so its export is exercised via a real import instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NON_COMBAT_STYLES } from '../../public/js/data/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const read = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');

describe('DBO-9: NON_COMBAT_STYLES has one real source', () => {
  it('constants.js exports exactly the four non-combat style names', () => {
    expect(NON_COMBAT_STYLES).toEqual(['Fast-Talking', 'Cacophony Savvy', 'Etiquette', 'Three Heads of Kerberos']);
  });

  it('sheet.js imports NON_COMBAT_STYLES from constants.js, not a local const', () => {
    const src = read('public/js/editor/sheet.js');
    expect(src).toMatch(/import\s*\{[^}]*\bNON_COMBAT_STYLES\b[^}]*\}\s*from\s*['"]\.\.\/data\/constants\.js['"]/);
    // A local redeclaration would shadow the import and defeat the whole
    // point of consolidating - anchored on `const NON_COMBAT_STYLES =` (an
    // assignment), not the bare name, so the import statement itself can
    // never accidentally self-match.
    expect(src).not.toMatch(/const\s+NON_COMBAT_STYLES\s*=/);
  });

  it('sheet.js\'s three call sites read the shared array via .includes(...)', () => {
    const src = read('public/js/editor/sheet.js');
    const callSites = [...src.matchAll(/NON_COMBAT_STYLES\.includes\(/g)];
    expect(callSites).toHaveLength(3);
    // .has(...) is Set syntax - a leftover would mean a call site was missed
    // when the local Set was replaced with the shared array.
    expect(src).not.toMatch(/NON_COMBAT_STYLES\.has\(/);
  });

  it('downtime-form.js imports NON_COMBAT_STYLES from constants.js, no local NON_COMBAT_STYLES_DT remains', () => {
    const src = read('public/js/tabs/downtime-form.js');
    expect(src).toMatch(/import\s*\{[^}]*\bNON_COMBAT_STYLES\b[^}]*\}\s*from\s*['"]\.\.\/data\/constants\.js['"]/);
    expect(src).not.toMatch(/NON_COMBAT_STYLES_DT/);
  });

  it('downtime-form.js\'s one call site reads the shared array via .includes(...)', () => {
    const src = read('public/js/tabs/downtime-form.js');
    const callSites = [...src.matchAll(/NON_COMBAT_STYLES\.includes\(/g)];
    expect(callSites).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Behavioural equivalence — the actual filter logic, run for real against the
// shared array, proving the four names are still excluded exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

describe('DBO-9: no behavioural change — the same four names are excluded either way', () => {
  it('sheet.js\'s manoeuvre-pick filter shape: NON_COMBAT_STYLES.includes(man.style)', () => {
    const allStyles = ['Boxing', 'Fast-Talking', 'Street Fighting', 'Cacophony Savvy', 'Etiquette', 'Three Heads of Kerberos', 'Martial Arts'];
    const kept = allStyles.filter(s => !NON_COMBAT_STYLES.includes(s));
    expect(kept).toEqual(['Boxing', 'Street Fighting', 'Martial Arts']);
  });

  it('downtime-form.js\'s style-purchase filter shape: excludes the same four, keeps everything else', () => {
    const parents = ['Regular', 'Boxing', 'Fast-Talking', 'Cacophony Savvy', 'Etiquette', 'Three Heads of Kerberos', 'Kung Fu'];
    const styleNames = [...new Set(parents.filter(p => p && p !== 'Regular' && !NON_COMBAT_STYLES.includes(p)))].sort();
    expect(styleNames).toEqual(['Boxing', 'Kung Fu']);
  });
});
