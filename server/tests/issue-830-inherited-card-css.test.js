/**
 * Issue #830 — inherited-card title CSS placement guards.
 *
 * Pure CSS change. The renderer emits .dom-inherited-card +
 * .dom-inherited-card-title elements (added by #793); this issue adds the
 * styling so the title reads as a subtitle (small + dim) and the card has
 * a subtle visual grouping.
 *
 * Tests are static-analysis sanity guards (no behavioural change to
 * shRenderDomainMerits). The #793 / #827 behavioural tests already cover
 * the structural emission; this file just confirms the CSS rules exist
 * and target the expected selectors with subtitle-scale properties.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

describe('#830 — inherited-card title CSS', () => {
  const css = read('public/css/components.css');

  it('.dom-inherited-card has a left rail (border-left) and indent (padding-left)', () => {
    // Reads the rule block by anchoring on the selector + the following `{...}` body.
    const rule = css.match(/\.dom-inherited-card\s*\{[^}]+\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).toMatch(/border-left/);
    expect(rule[0]).toMatch(/padding-left/);
  });

  it('.dom-inherited-card-title is subtitle scale (≤ 11px) and dim (uses --txt3)', () => {
    const rule = css.match(/\.dom-inherited-card-title\s*\{[^}]+\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).toMatch(/font-size:\s*1[01]px/); // 10 or 11px
    expect(rule[0]).toMatch(/color:\s*var\(--txt3\)/);
    expect(rule[0]).toMatch(/text-transform:\s*uppercase/);
  });

  it('.dom-row-subtitle (from #827 inline subtitles) gets explicit styling here too', () => {
    // The inline subtitle on Haven / MG / White Ants rows shares the
    // subtitle-scale + dim treatment — making the visual language consistent
    // across the "subtitle on row" and "card title" surfaces.
    const rule = css.match(/\.dom-row-subtitle\s*\{[^}]+\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).toMatch(/font-size:\s*1[01]px/);
    expect(rule[0]).toMatch(/color:\s*var\(--txt3\)/);
  });

  it('CSS placed in the Domain merit editing section (near .dom-edit-block)', () => {
    // Static placement guard — keep grouped with related domain-merit CSS so
    // future audits find the styling alongside the structural rules.
    const editBlockIdx = css.indexOf('.dom-edit-block{');
    const cardIdx = css.indexOf('.dom-inherited-card{');
    expect(editBlockIdx).toBeGreaterThan(0);
    expect(cardIdx).toBeGreaterThan(editBlockIdx);
    // Within ~600 chars of dom-edit-block — same section
    expect(cardIdx - editBlockIdx).toBeLessThan(600);
  });
});
