/**
 * Issue #873 — ECM-6 admin sidebar (Equipment Catalogue CRUD UI).
 *
 * Server-side: the schema-widen for `mechanical_effect` (the asset-bucket
 * field ECM-2 surfaced) lives in this PR — covered alongside the existing
 * ECM-1 tests at issue-868-ecm-1-equipment-catalogue-api.test.js.
 *
 * Client side: vanilla JS module + admin.html sidebar wiring. No browser
 * harness in this repo, so the slice is static-analysis: assert the
 * wiring lands and the module exports the expected entry point. UI
 * smoke is captured in the PR test plan.
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
// Schema-widen — `mechanical_effect` in properties + PATCH allowlist
// ─────────────────────────────────────────────────────────────────────────────

describe('#873 — equipment_catalogue schema widened for mechanical_effect', () => {
  const src = read('server/schemas/equipment_catalogue.schema.js');

  it('schema.properties declares mechanical_effect (nullable string)', () => {
    expect(src).toMatch(/mechanical_effect:\s*\{\s*type:\s*\[\s*['"]string['"]\s*,\s*['"]null['"]\s*\]/);
  });

  it('EQUIPMENT_CATALOGUE_UPDATABLE_FIELDS contains mechanical_effect', () => {
    // Match the named export Set literal and check the field appears as a
    // string element. Substring-of-name false positives blocked by the
    // surrounding quotes.
    const setStart = src.indexOf('EQUIPMENT_CATALOGUE_UPDATABLE_FIELDS');
    expect(setStart).toBeGreaterThan(-1);
    const block = src.slice(setStart, src.indexOf(';', setStart));
    expect(block).toMatch(/['"]mechanical_effect['"]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client wiring — admin sidebar, view module, dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('#873 — admin sidebar wires Equipment Catalogue domain', () => {
  it('admin.html declares the sidebar button with data-domain="equipment-catalogue"', () => {
    const src = read('public/admin.html');
    expect(src).toMatch(/data-domain="equipment-catalogue"[^>]*>\s*Equipment Catalogue/);
  });

  it('admin.html declares the domain section with id="d-equipment-catalogue"', () => {
    const src = read('public/admin.html');
    expect(src).toMatch(/<section\s+id="d-equipment-catalogue"\s+class="domain"/);
    expect(src).toMatch(/id="equipment-catalogue-content"/);
  });

  it('admin.js imports initEquipmentCatalogueAdmin', () => {
    const src = read('public/js/admin.js');
    expect(src).toMatch(/import\s+\{\s*initEquipmentCatalogueAdmin\s*\}\s+from\s+['"]\.\/admin\/equipment-catalogue-admin\.js['"]/);
  });

  it('admin.js dispatches the equipment-catalogue domain in switchDomain', () => {
    const src = read('public/js/admin.js');
    expect(src).toMatch(/domain\s*===\s*['"]equipment-catalogue['"]\s*\)\s*initEquipmentCatalogueAdmin/);
  });
});

describe('#873 — view module file shape', () => {
  it('public/js/admin/equipment-catalogue-admin.js exists', () => {
    expect(exists('public/js/admin/equipment-catalogue-admin.js')).toBe(true);
  });

  it('exports initEquipmentCatalogueAdmin', () => {
    const src = read('public/js/admin/equipment-catalogue-admin.js');
    expect(src).toMatch(/export\s+async\s+function\s+initEquipmentCatalogueAdmin\b/);
  });

  it('uses apiGet / apiPost / apiPatch / apiRaw (DELETE-with-409 inspection)', () => {
    const src = read('public/js/admin/equipment-catalogue-admin.js');
    expect(src).toMatch(/apiGet\(/);
    expect(src).toMatch(/apiPost\(/);
    expect(src).toMatch(/apiPatch\(/);
    expect(src).toMatch(/apiRaw\(['"]DELETE['"]/);
  });

  it('renders soft duplicate warning at create-time (name + bucket case-insensitive)', () => {
    const src = read('public/js/admin/equipment-catalogue-admin.js');
    expect(src).toMatch(/name\s*\|\|\s*['"]['"]\s*\)\.toLowerCase\(\)/);
    expect(src).toMatch(/values\.name\.toLowerCase\(\)/);
    expect(src).toMatch(/already exists/);
  });

  it('fetches /:id/impact for the edit-form banner', () => {
    const src = read('public/js/admin/equipment-catalogue-admin.js');
    expect(src).toMatch(/\/api\/equipment_catalogue\/\$\{[^}]+\}\/impact/);
  });

  it('disables delete control when holders > 0', () => {
    const src = read('public/js/admin/equipment-catalogue-admin.js');
    expect(src).toMatch(/holdersCount\s*>\s*0\s*\?\s*['"`]disabled/);
  });

  it('handles 409 from DELETE by surfacing the API holders payload', () => {
    const src = read('public/js/admin/equipment-catalogue-admin.js');
    expect(src).toMatch(/res\.status\s*===\s*409/);
    expect(src).toMatch(/character_names/);
  });

  it('bucket selector is immutable in edit mode (delete + recreate to change bucket)', () => {
    const src = read('public/js/admin/equipment-catalogue-admin.js');
    expect(src).toMatch(/immutable.*delete \+ recreate/i);
  });
});
