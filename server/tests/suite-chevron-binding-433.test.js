/**
 * Bugfix #433 — suite chevron-expand binding contract.
 *
 * The bug: the suite app page hosts BOTH the editor sheet (Sheets tab)
 * and the suite sheet. app.js binds the EDITOR toggleExp/toggleDisc to
 * the unprefixed window globals; the suite sheet's inline onclick called
 * the same unprefixed names, so the editor functions ran against suite-
 * convention element IDs and silently no-opped.
 *
 * Fix: namespace the suite handlers — suite onclick calls
 * suiteToggleExp/suiteToggleDisc, which app.js + sheet-helpers expose
 * separately from the editor's toggleExp/toggleDisc.
 *
 * The toggle functions are browser-only (DOM + window). This source-
 * contract test pins the binding so a future edit that reverts the
 * onclick namespace (or re-introduces the window.toggleExp collision in
 * sheet-helpers) fails here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const sheetJs = readFileSync(resolve(repoRoot, 'public/js/suite/sheet.js'), 'utf8');
const helpersJs = readFileSync(resolve(repoRoot, 'public/js/suite/sheet-helpers.js'), 'utf8');

describe('#433 — suite sheet onclick uses the namespaced suite handlers', () => {
  it('suite/sheet.js has no unprefixed toggleDisc/toggleExp onclick (would resolve to editor version)', () => {
    expect(sheetJs).not.toMatch(/onclick="toggleDisc\(/);
    expect(sheetJs).not.toMatch(/onclick="toggleExp\(/);
  });

  it('suite/sheet.js disc rows call suiteToggleDisc', () => {
    const count = (sheetJs.match(/onclick="suiteToggleDisc\(/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(5); // disciplines / devotions / rites / rituals / standing
  });
});

describe('#433 — sheet-helpers exposes namespaced globals + emits namespaced onclick', () => {
  it('expRow emits suiteToggleExp, not the unprefixed toggleExp', () => {
    expect(helpersJs).toMatch(/onclick="suiteToggleExp\(/);
    expect(helpersJs).not.toMatch(/onclick="toggleExp\(/);
  });

  it('window exposure is namespaced (no collision with editor window.toggleExp/toggleDisc)', () => {
    // The collision-causing lines must be gone:
    expect(helpersJs).not.toMatch(/window\.toggleExp\s*=/);
    expect(helpersJs).not.toMatch(/window\.toggleDisc\s*=/);
    // Replaced with namespaced exposure:
    expect(helpersJs).toMatch(/window\.suiteToggleExp\s*=/);
    expect(helpersJs).toMatch(/window\.suiteToggleDisc\s*=/);
  });

  it('the toggle functions themselves still operate on suite-convention IDs', () => {
    // toggleDisc targets disc-row-/disc-drawer-; toggleExp targets exp-row-/exp-body-
    expect(helpersJs).toMatch(/disc-row-/);
    expect(helpersJs).toMatch(/disc-drawer-/);
    expect(helpersJs).toMatch(/exp-row-/);
    expect(helpersJs).toMatch(/exp-body-/);
  });
});
