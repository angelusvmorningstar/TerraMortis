/**
 * Negative grep contract — ADR-001 §Effective-rating contract.
 *
 * Fails CI if any file under public/js/editor/rule_engine/ or
 * server/lib/rule_engine/ contains an unmarked inherent-only accessor
 * reference. The marker `// inherent-intentional: <reason>` on the same
 * line or the immediately preceding line exempts a match.
 *
 * Files under server/tests/ are exempt (opt-in via
 * `// rule_engine: production-equivalent` prefix — not currently in use).
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '../../');

const SCAN_DIRS = [
  join(REPO_ROOT, 'public/js/editor/rule_engine'),
  join(REPO_ROOT, 'server/lib/rule_engine'),
];

// Forbidden patterns — word-boundary aware
const FORBIDDEN = [
  /\bgetAttrVal\b/,
  /\bskDots\b/,
  /\bgetAttrBonus\b/,
  /\bskBonus\b/,
  // inherent property reads on merit/attribute/skill objects
  /[^.]\.(cp|xp|up)\b/,
  // .dots on attribute/skill chain (c.attributes.X.dots or c.skills.X.dots)
  /\battributes\b.*\.dots\b/,
  /\bskills\b.*\.dots\b/,
];

const MARKER = /\/\/\s*inherent-intentional:/;

function collectFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...collectFiles(full));
      } else if (entry.endsWith('.js') || entry.endsWith('.ts')) {
        files.push(full);
      }
    }
  } catch {
    // dir may not exist yet (first story in a new family)
  }
  return files;
}

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FORBIDDEN) {
      if (!pattern.test(line)) continue;
      // Check for marker on this line or the preceding line
      const thisLineMarked = MARKER.test(line);
      const prevLineMarked = i > 0 && MARKER.test(lines[i - 1]);
      if (!thisLineMarked && !prevLineMarked) {
        violations.push({
          file: filePath.replace(REPO_ROOT, '').replace(/\\/g, '/'),
          line: i + 1,
          text: line.trim(),
          pattern: pattern.toString(),
        });
      }
    }
  }
  return violations;
}

describe('Rule engine effective-rating grep contract (ADR-001)', () => {
  it('no unmarked inherent-only accessor references in rule_engine directories', () => {
    const files = SCAN_DIRS.flatMap(collectFiles);
    const allViolations = files.flatMap(checkFile);

    if (allViolations.length > 0) {
      const report = allViolations
        .map(v => `  ${v.file}:${v.line}  [${v.pattern}]\n    ${v.text}`)
        .join('\n');
      expect.fail(
        `${allViolations.length} unmarked inherent-only accessor(s) found in rule_engine/:\n${report}\n\n` +
        'Add  // inherent-intentional: <reason>  on the same or preceding line to suppress.',
      );
    }
    expect(allViolations).toHaveLength(0);
  });

  it('scanned at least one rule_engine file', () => {
    const files = SCAN_DIRS.flatMap(collectFiles);
    // Allow empty when no families have migrated yet (pre-RDE-3); once pt-evaluator.js lands,
    // this count should be ≥ 1.
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});
