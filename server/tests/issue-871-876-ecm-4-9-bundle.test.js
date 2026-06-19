/**
 * Issue #871 (ECM-4) + #876 (ECM-9) — DT form catalogue dropdown bundle.
 *
 * Two slices:
 *   1. ECM-4: equipment section is un-hidden; downtime-form.js no longer
 *      writes free-text `equipment_${n}_name`; the catalogue dropdown
 *      sources from the shared cache module ECM-5 introduced; app.js
 *      boot-loads the cache + wires onCatalogueUpdate; admin DT view
 *      falls back to legacy free-text for in-flight submissions per
 *      Khepri's backcompat guidance.
 *   2. ECM-9: item_request textarea is rendered on the DT form and
 *      surfaced as a labelled block on the admin processing UI; schema
 *      documents the field.
 *
 * Static-analysis throughout — no browser harness in this repo. Manual
 * UI smoke is captured in the PR test plan.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// ECM-4
// ─────────────────────────────────────────────────────────────────────────────

describe('#871 — equipment section is un-hidden', () => {
  it('downtime-data.js declares hidden: false on the equipment section', () => {
    const src = read('public/js/tabs/downtime-data.js');
    // Find the equipment-section block and confirm hidden: false.
    const idx = src.indexOf("key: 'equipment'");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/hidden:\s*false/);
    expect(block).not.toMatch(/hidden:\s*true/);
  });
});

describe('#871 — downtime-form.js wires the catalogue dropdown', () => {
  const src = read('public/js/tabs/downtime-form.js');

  it('imports getCatalogue + getCatalogueEntry from the shared cache module', () => {
    expect(src).toMatch(/import\s+\{\s*getCatalogue,\s*getCatalogueEntry\s*\}\s+from\s+['"]\.\.\/data\/equipment-catalogue-cache\.js['"]/);
  });

  it('renderEquipmentRow no longer renders a free-text name input', () => {
    // The legacy line was: `<input type="text" id="dt-equipment_${n}_name" ...>`.
    // It must be gone.
    expect(src).not.toMatch(/<input[^>]*id="dt-equipment_\$\{n\}_name"/);
  });

  it('renderEquipmentRow renders a select with id `dt-equipment_${n}_catalogue_id`', () => {
    expect(src).toMatch(/<select id="dt-equipment_\$\{n\}_catalogue_id"/);
  });

  it('emits optgroups per bucket (weapon / armour / equipment / asset)', () => {
    // The render iterates ['weapon', 'armour', 'equipment', 'asset'] and emits <optgroup label="...">
    expect(src).toMatch(/for\s*\(\s*const\s+bucket\s+of\s+\[\s*['"]weapon['"]\s*,\s*['"]armour['"]\s*,\s*['"]equipment['"]\s*,\s*['"]asset['"]\s*\]/);
    expect(src).toMatch(/<optgroup label="\$\{esc\(bucket\)\}">/);
  });

  it('option value is the 24-hex `_id` (not the legacy slug)', () => {
    expect(src).toMatch(/<option value="\$\{esc\(String\(it\._id\)\)\}"/);
  });

  it('legacy free-text name surfaces as a disabled placeholder option when no catalogue_id is set', () => {
    expect(src).toMatch(/legacyName\s*&&\s*!selectedId/);
    expect(src).toMatch(/legacy:\s*\$\{esc\(legacyName\)\}/);
  });

  it('collectResponses writes equipment_${n}_catalogue_id (the canonical key)', () => {
    expect(src).toMatch(/responses\[\s*`equipment_\$\{n\}_catalogue_id`\s*\]\s*=/);
  });

  it('collectResponses no longer reads `dt-equipment_${n}_name` from the DOM', () => {
    // Pre-ECM-4: const nameEl = document.getElementById(`dt-equipment_${n}_name`).
    // The legacy `_name` key still appears in the slot-removal shift path
    // for in-flight-submission backcompat (Khepri's silent-leave guidance),
    // but the form NEVER reads `dt-equipment_${n}_name` from the DOM anymore
    // because that input was replaced by the catalogue dropdown.
    expect(src).not.toMatch(/document\.getElementById\(\s*`dt-equipment_\$\{n\}_name`/);
  });
});

describe('#871 — app.js boot-loads the catalogue + wires WS refetch', () => {
  const src = read('public/js/app.js');

  it('imports loadCatalogue + refetchCatalogue from the shared cache module', () => {
    expect(src).toMatch(/loadCatalogue\s+as\s+loadEquipmentCatalogue/);
    expect(src).toMatch(/refetchCatalogue\s+as\s+refetchEquipmentCatalogue/);
  });

  it('loadEquipmentCatalogue is called inside the Promise.allSettled boot batch', () => {
    expect(src).toMatch(/Promise\.allSettled\(\[[\s\S]{0,2000}loadEquipmentCatalogue\(\)/);
  });

  it('passes onCatalogueUpdate to initWS, wired to refetchEquipmentCatalogue', () => {
    expect(src).toMatch(/onCatalogueUpdate:\s*\(\)\s*=>\s*\{\s*refetchEquipmentCatalogue\(\)/);
  });
});

describe('#871 — admin/downtime-views.js falls back to legacy free-text', () => {
  const src = read('public/js/admin/downtime-views.js');

  it('imports getCatalogueEntry from the shared cache module', () => {
    expect(src).toMatch(/import\s+\{\s*getCatalogueEntry\s*\}\s+from\s+['"]\.\.\/data\/equipment-catalogue-cache\.js['"]/);
  });

  it('resolves catalogue_id via the cache and falls back to legacy free-text name', () => {
    expect(src).toMatch(/r\[`equipment_\$\{n\}_catalogue_id`\]/);
    expect(src).toMatch(/r\[`equipment_\$\{n\}_name`\]/);
    expect(src).toMatch(/getCatalogueEntry\(catalogueId\)/);
    expect(src).toMatch(/legacy free-text/);
  });

  it('renders an Item Request block when responses.item_request is non-empty', () => {
    expect(src).toMatch(/r\[['"]item_request['"]\]/);
    expect(src).toMatch(/Item Request/);
  });
});

describe('#871 — dt-action-summary.js counts the new key', () => {
  const src = read('public/js/data/dt-action-summary.js');
  it('counts a slot used when either catalogue_id OR legacy name is populated', () => {
    expect(src).toMatch(/equipment_\$\{n\}_catalogue_id/);
    expect(src).toMatch(/equipment_\$\{n\}_name/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ECM-9
// ─────────────────────────────────────────────────────────────────────────────

describe('#876 — DT form renders item_request textarea', () => {
  const src = read('public/js/tabs/downtime-form.js');
  it('renders a textarea with id="dt-item-request"', () => {
    expect(src).toMatch(/<textarea id="dt-item-request"/);
  });
  it('collects responses.item_request', () => {
    expect(src).toMatch(/responses\[['"]item_request['"]\]\s*=/);
  });
});

describe('#876 — schema documents item_request', () => {
  const src = read('server/schemas/downtime_submission.schema.js');
  it('lists item_request in the responses properties block', () => {
    expect(src).toMatch(/item_request:\s*\{\s*type:\s*['"]string['"]\s*\}/);
  });
});
