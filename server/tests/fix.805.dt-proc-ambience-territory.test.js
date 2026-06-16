/**
 * fix.805 — DT proc: Ambience territory shows raw ObjectId; pills ignore player choice.
 *
 * Two bugs fixed in public/js/admin/downtime-views.js:
 *
 * 1. DETAILS panel (line ~9699) emitted entry.projTerritory raw — could be a
 *    MongoDB ObjectId. Fix: resolve via resolveTerrId + TERRITORY_DATA two-tier
 *    lookup, falling back to the raw value if resolution fails.
 *
 * 2. Allies merit territory pill switcher (two render paths at ~7546 and ~7662)
 *    only read st_review.territory_overrides and fell back to '' (N/A). Fix:
 *    add resolveTerrId(entry.projTerritory) as a second fallback so the player's
 *    chosen territory pre-selects when no ST override exists.
 *
 * AC1 — DETAILS block calls resolveTerrId before the Territory field
 * AC2 — DETAILS block uses two-tier TERRITORY_DATA lookup
 * AC3 — old single-line raw-emit pattern is gone
 * AC4 — compact merit panel (_renderCompactMeritPanel) has projTerritory fallback
 * AC5 — action merit panel has projTerritory fallback (second isAlliesAction block)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');
const src  = readFileSync(resolve(root, 'public/js/admin/downtime-views.js'), 'utf8');

// Locate the DETAILS territory block — keyed by its comment
const detailsTerrIdx = src.indexOf('Territory (read-only — set via territory pills elsewhere)');

// Locate the two isAlliesAction blocks
const alliesBlock1 = src.indexOf('if (entry.isAlliesAction)');
const alliesBlock2 = src.indexOf('if (entry.isAlliesAction)', alliesBlock1 + 1);

// ── AC1: DETAILS block resolves via resolveTerrId ────────────────────────────

describe('AC1 — DETAILS territory block calls resolveTerrId(entry.projTerritory)', () => {
  it('resolveTerrId call appears in DETAILS territory block', () => {
    const detailsRegion = src.slice(detailsTerrIdx, detailsTerrIdx + 400);
    expect(detailsRegion).toContain('resolveTerrId(entry.projTerritory)');
  });
});

// ── AC2: DETAILS block uses two-tier lookup ───────────────────────────────────

describe('AC2 — DETAILS territory block uses cachedTerritories + TERRITORY_DATA fallback', () => {
  it('cachedTerritories lookup appears in DETAILS territory block', () => {
    const detailsRegion = src.slice(detailsTerrIdx, detailsTerrIdx + 400);
    expect(detailsRegion).toContain('cachedTerritories');
  });

  it('TERRITORY_DATA lookup appears in DETAILS territory block', () => {
    const detailsRegion = src.slice(detailsTerrIdx, detailsTerrIdx + 400);
    expect(detailsRegion).toContain('TERRITORY_DATA.find(t => t.slug === _tCanon)');
  });
});

// ── AC3: old raw-emit pattern is gone ────────────────────────────────────────

describe('AC3 — old single-line raw Territory emit is removed', () => {
  it('esc(entry.projTerritory)}</div> no longer appears as Territory field value', () => {
    // The old pattern was a single-line: ...Territory</span> ${esc(entry.projTerritory)}</div>
    expect(src).not.toContain('proc-feed-lbl">Territory</span> ${esc(entry.projTerritory)}</div>');
  });
});

// ── AC4: compact merit panel has projTerritory fallback ──────────────────────

describe('AC4 — compact merit panel (first isAlliesAction) has projTerritory fallback', () => {
  it('first isAlliesAction block uses resolveTerrId(entry.projTerritory) as fallback', () => {
    const block1Region = src.slice(alliesBlock1, alliesBlock1 + 300);
    expect(block1Region).toContain('resolveTerrId(entry.projTerritory)');
  });
});

// ── AC5: action merit panel has projTerritory fallback ───────────────────────

describe('AC5 — action merit panel (second isAlliesAction) has projTerritory fallback', () => {
  it('second isAlliesAction block uses resolveTerrId(entry.projTerritory) as fallback', () => {
    const block2Region = src.slice(alliesBlock2, alliesBlock2 + 300);
    expect(block2Region).toContain('resolveTerrId(entry.projTerritory)');
  });
});
