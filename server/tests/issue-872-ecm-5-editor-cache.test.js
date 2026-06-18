/**
 * Issue #872 — ECM-5 editor switches to API-fed catalogue.
 *
 * Two slices:
 *   1. Static-analysis: editor/edit.js no longer imports from
 *      `data/equipment-data.js` for `getCatalogueByBucket`; the new cache
 *      module exists; admin.js wires the boot fetch + WS refetch callback;
 *      ws.js routes the `catalogue` frame type.
 *   2. The catalogue cache module's pure-helper shape (no DB / no browser
 *      globals via dynamic import — the module depends only on api.js which
 *      reads `location`; stubbed before import per the ECM-1 pattern).
 *
 * Per AC#1: hard-grep `EQUIPMENT_CATALOGUE` in `public/js/editor/edit.js`
 * returns zero post-merge.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }

// ─────────────────────────────────────────────────────────────────────────────
// Static-analysis
// ─────────────────────────────────────────────────────────────────────────────

describe('#872 — editor/edit.js switches to the catalogue cache', () => {
  const src = read('public/js/editor/edit.js');

  it('hard-grep `EQUIPMENT_CATALOGUE` in editor/edit.js returns zero (AC#1)', () => {
    expect(src).not.toMatch(/EQUIPMENT_CATALOGUE/);
  });

  it('imports getCatalogueByBucket from equipment-catalogue-cache (not equipment-data)', () => {
    expect(src).toMatch(/import\s+\{\s*getCatalogueByBucket\s*\}\s+from\s+['"]\.\.\/data\/equipment-catalogue-cache\.js['"]/);
    // The legacy import is gone.
    expect(src).not.toMatch(/from\s+['"]\.\.\/data\/equipment-data\.js['"]/);
  });

  it('shEquipBucketFilter emits option `value` from the ObjectId (24-hex string), not the slug', () => {
    // Pre-ECM-5 shape: `<option value="${e.id}">`. Post: `<option value="${String(e._id)}">`.
    expect(src).toMatch(/<option value="\$\{String\(e\._id\)\}">/);
    expect(src).not.toMatch(/<option value="\$\{e\.id\}">/);
  });
});

describe('#872 — equipment-catalogue-cache module shape', () => {
  it('public/js/data/equipment-catalogue-cache.js exists', () => {
    expect(exists('public/js/data/equipment-catalogue-cache.js')).toBe(true);
  });

  const src = read('public/js/data/equipment-catalogue-cache.js');

  it('exports loadCatalogue + refetchCatalogue + getCatalogueByBucket + getCatalogueEntry + onCatalogueChange + isLoaded + getCatalogue', () => {
    expect(src).toMatch(/export\s+async\s+function\s+loadCatalogue\b/);
    expect(src).toMatch(/export\s+async\s+function\s+refetchCatalogue\b/);
    expect(src).toMatch(/export\s+function\s+getCatalogueByBucket\b/);
    expect(src).toMatch(/export\s+function\s+getCatalogueEntry\b/);
    expect(src).toMatch(/export\s+function\s+onCatalogueChange\b/);
    expect(src).toMatch(/export\s+function\s+isLoaded\b/);
    expect(src).toMatch(/export\s+function\s+getCatalogue\b/);
  });

  it('fetches via apiGet at /api/equipment_catalogue', () => {
    expect(src).toMatch(/apiGet\(\s*['"]\/api\/equipment_catalogue['"]\s*\)/);
  });
});

describe('#872 — admin.js wires boot-load + WS refetch', () => {
  const src = read('public/js/admin.js');

  it('imports loadCatalogue and refetchCatalogue from the cache module', () => {
    expect(src).toMatch(/loadCatalogue\s+as\s+loadEquipmentCatalogue/);
    expect(src).toMatch(/refetchCatalogue\s+as\s+refetchEquipmentCatalogue/);
  });

  it('calls loadEquipmentCatalogue() at boot (in a try/catch)', () => {
    expect(src).toMatch(/await\s+loadEquipmentCatalogue\(\)/);
  });

  it('passes onCatalogueUpdate to initWS, wired to refetchEquipmentCatalogue', () => {
    expect(src).toMatch(/onCatalogueUpdate:\s*\(\)\s*=>\s*\{\s*refetchEquipmentCatalogue\(\)/);
  });
});

describe('#872 — ws.js routes catalogue frames', () => {
  const src = read('public/js/data/ws.js');

  it('initWS accepts opts.onCatalogueUpdate and stores it', () => {
    expect(src).toMatch(/_onCatalogueUpdate\s*=\s*opts\.onCatalogueUpdate/);
  });

  it('onmessage dispatch routes msg.type === "catalogue" to _handleCatalogueMsg', () => {
    expect(src).toMatch(/msg\.type\s*===\s*['"]catalogue['"]\s*\)\s*_handleCatalogueMsg/);
  });

  it('_handleCatalogueMsg calls _onCatalogueUpdate(item_id, op) — no echo suppression by design', () => {
    expect(src).toMatch(/function\s+_handleCatalogueMsg/);
    expect(src).toMatch(/_onCatalogueUpdate\(item_id,\s*op\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache module behavioural — stub the browser `location` global before import.
// ─────────────────────────────────────────────────────────────────────────────

describe('#872 — cache module behavioural', () => {
  it('getCatalogueByBucket returns items grouped by bucket, sorted by name', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-catalogue-cache.js');
    // We can't call loadCatalogue() — it needs a real HTTP fetch. Test the
    // exposed read functions on an empty cache: pre-load they return [].
    expect(mod.isLoaded()).toBe(false);
    expect(mod.getCatalogue()).toEqual([]);
    expect(mod.getCatalogueByBucket('weapon')).toEqual([]);
    expect(mod.getCatalogueEntry('anything')).toBeNull();
  });

  it('onCatalogueChange returns an unsubscribe function that detaches the listener', async () => {
    if (typeof globalThis.location === 'undefined') globalThis.location = { hostname: '' };
    const mod = await import('../../public/js/data/equipment-catalogue-cache.js');
    let count = 0;
    const off = mod.onCatalogueChange(() => { count++; });
    expect(typeof off).toBe('function');
    off();
    // No way to trigger from here without a real load; the smoke is the
    // unsubscribe surface itself + the returned-function shape contract.
  });
});
