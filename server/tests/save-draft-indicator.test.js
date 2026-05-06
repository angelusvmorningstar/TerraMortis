/**
 * Static grep contract — hotfix #47 save-draft indicator.
 *
 * Verifies that the four code-level changes in downtime-form.js are present
 * and the removed artefacts are absent. These are guard-rails against
 * accidental revert, not runtime tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '../../');
const src = readFileSync(
  resolve(REPO_ROOT, 'public/js/tabs/downtime-form.js'),
  'utf8'
);

describe('hotfix #47 — save-draft indicator', () => {

  it('Save Draft button is not rendered', () => {
    expect(src).not.toMatch(/id="dt-btn-save"/);
  });

  it('static "auto-save as you type" text is removed', () => {
    expect(src).not.toMatch(/auto-save as you type/);
  });

  it('saveDraft() sets Saving… status text', () => {
    expect(src).toMatch(/statusEl\.textContent\s*=\s*'Saving…'/);
  });

  it('success path sets Saved HH:MM via _saveTimestamp()', () => {
    expect(src).toMatch(/'Saved ' \+ _saveTimestamp\(\)/);
  });

  it('_saveTimestamp helper is defined', () => {
    expect(src).toMatch(/function _saveTimestamp\(\)/);
  });

  it('setTimeout clear of save-status is removed', () => {
    // The old clear: setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000)
    // Should not exist anywhere near the success path
    expect(src).not.toMatch(/statusEl\.textContent\s*=\s*''\s*}\s*,\s*2000/);
  });

  it('#dt-btn-save click listener is removed', () => {
    expect(src).not.toMatch(/dt-btn-save.*addEventListener/);
    expect(src).not.toMatch(/addEventListener.*dt-btn-save/);
  });

});
