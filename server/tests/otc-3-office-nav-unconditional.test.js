/**
 * otc.3 — the Office tab is visible to every player, not just officeholders.
 *
 * app.js is browser-coupled (module-scope location/window access in the same
 * file's other imports) and this project has no dedicated test file for its
 * nav system (NAV_ITEMS/MORE_APPS/_moreGridCondition — confirmed by grep
 * before writing this file, per this story's own Task 4 instruction). This
 * follows the project's established fallback for otherwise-untestable
 * browser-coupled files: a source-text contract test, matching the style of
 * feature.691.hos-city-status-power.test.js.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(REPO_ROOT, 'public/js/app.js'), 'utf8');

describe('otc.3 — Office tab nav is unconditional', () => {
  it('the "hasOffice" condition string no longer appears anywhere in app.js', () => {
    expect(APP).not.toContain('hasOffice');
  });

  it('both office nav entries (NAV_ITEMS and MORE_APPS) are single lines with no condition property', () => {
    // Both registrations are single-line object literals in this file (confirmed
    // by reading app.js directly) — match per-line rather than a multi-line span,
    // which risks a non-greedy regex spanning across unrelated later code.
    const officeLines = APP.split('\n').filter(line => line.includes("id: 'office'"));
    expect(officeLines.length).toBe(2); // NAV_ITEMS + MORE_APPS
    for (const line of officeLines) {
      expect(line).not.toContain('condition');
    }
  });

  it('hasRegency is untouched — this story does not extend to the Regency tab', () => {
    expect(APP).toContain("condition: 'hasRegency'");
  });

  it('_moreGridCondition still short-circuits STs to true before any condition branch', () => {
    const start = APP.indexOf('function _moreGridCondition');
    const end = APP.indexOf('\n}', start);
    expect(start).toBeGreaterThan(-1);
    const body = APP.slice(start, end);
    expect(body).toContain("getRole() === 'st'");
  });
});
