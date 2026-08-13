/**
 * Issue #1156 (EQC-5, epic #1038) — remove the Skill-Based Acquisition
 * sub-table from the DT form's Acquisitions section. Shaking down a
 * shopkeeper for a free item via a skill roll is no longer an acquisition
 * channel; it's a Personal Project.
 *
 * Shape: "stop writing, keep reading" — the player-facing write side
 * (downtime-data.js question def, downtime-form.js renderer/collector) is
 * removed; the ST-facing read side (admin/downtime-views.js,
 * admin/downtime-story.js, tabs/story-tab.js) and the schema field
 * declarations are UNTOUCHED so historical cycles' skill-acquisition data
 * keeps rendering. This file proves both halves: the write side is gone,
 * and the read side + schema fields are still there (regression guard
 * against over-deletion).
 *
 * Static-analysis throughout — no browser harness in this repo (see
 * issue-871-876-ecm-4-9-bundle.test.js for the established convention).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// downtime-data.js — question definition removed
// ─────────────────────────────────────────────────────────────────────────────

describe('#1156 — downtime-data.js Acquisitions section', () => {
  const src = read('public/js/tabs/downtime-data.js');
  const idx = src.indexOf("key: 'acquisitions'");

  it('the acquisitions section block exists', () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it('no longer declares the skill_acquisitions question', () => {
    const block = src.slice(idx, idx + 900);
    expect(block).not.toMatch(/key:\s*'skill_acquisitions'/);
    expect(block).not.toMatch(/Skill Based Acquisitions/);
  });

  it('still declares the resources_acquisitions question (regression guard)', () => {
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/key:\s*'resources_acquisitions'/);
  });

  it('section title no longer mentions Skills', () => {
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/title:\s*'Acquisition: Resources'/);
    expect(block).not.toMatch(/Skills/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// downtime-form.js — write-side removal
// ─────────────────────────────────────────────────────────────────────────────

describe('#1156 — downtime-form.js Skill sub-table removed', () => {
  const src = read('public/js/tabs/downtime-form.js');

  it('_renderSkillRow no longer exists', () => {
    expect(src).not.toMatch(/function _renderSkillRow/);
  });

  it('_readSkillRows no longer exists', () => {
    expect(src).not.toMatch(/function _readSkillRows/);
  });

  it('the Skill-Based Asset Acquisition heading no longer renders', () => {
    expect(src).not.toMatch(/Skill-Based Asset Acquisition/);
  });

  it('no longer imports skillAcqPoolStr from accessors.js', () => {
    const importLine = src.match(/^import \{[^}]*\} from '\.\.\/data\/accessors\.js';$/m)[0];
    expect(importLine).not.toMatch(/skillAcqPoolStr/);
    // Regression guard: the other names on that same import line survive.
    expect(importLine).toMatch(/calcVitaeMax/);
    expect(importLine).toMatch(/skTotal/);
    expect(importLine).toMatch(/riteCost/);
    expect(importLine).toMatch(/getAttrEffective/);
    expect(importLine).toMatch(/getAttrTotal/);
    expect(importLine).toMatch(/discDots/);
  });

  it('no data-acq-skill or data-skill-acq-spec markup/handlers remain', () => {
    expect(src).not.toMatch(/data-acq-skill[="[]/);
    expect(src).not.toMatch(/data-skill-acq-spec/);
  });

  it('renderAcquisitionsSection no longer calls a skill-row renderer', () => {
    const idx = src.indexOf('function renderAcquisitionsSection');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 2000);
    expect(block).not.toMatch(/_renderSkillRow/);
    expect(block).not.toMatch(/skillRows/);
  });

  it('the Resources sub-table still renders (regression guard)', () => {
    expect(src).toMatch(/function _renderResourceRow/);
    expect(src).toMatch(/function _readResourceRows/);
    expect(src).toMatch(/Resource-Based Asset Acquisition/);
  });
});

describe('#1156 — collectResponses no longer writes skill-acquisition keys', () => {
  const src = read('public/js/tabs/downtime-form.js');

  it('never writes responses[\'skill_acquisitions\']', () => {
    expect(src).not.toMatch(/responses\['skill_acquisitions'\]\s*=/);
  });

  it('never writes any responses[\'skill_acq_*\'] key', () => {
    expect(src).not.toMatch(/responses\['skill_acq_(description|pool_skill|pool_spec|availability|merits)'\]\s*=/);
  });

  it('never writes responses[\'acq_skill_rows\']', () => {
    expect(src).not.toMatch(/responses\['acq_skill_rows'\]\s*=/);
  });

  it('still writes the Resources mirror keys (regression guard)', () => {
    expect(src).toMatch(/responses\['acq_resource_rows'\]\s*=/);
    expect(src).toMatch(/responses\['resources_acquisitions'\]\s*=/);
    expect(src).toMatch(/responses\['acq_description'\]\s*=/);
  });

  it('Add/Remove row handlers hardcode acq_resource_rows (no more skill/resource dispatch)', () => {
    // EQC-5: the shared rowKey === 'skill' ? ... : 'acq_resource_rows' ternary
    // is gone — Resources is the only remaining acquisition row kind.
    expect(src).not.toMatch(/rowKey === 'skill'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Read side + schema — deliberately UNTOUCHED (regression guard against
// over-deletion; historical cycles must keep rendering their skill-acq data)
// ─────────────────────────────────────────────────────────────────────────────

describe('#1156 — ST-facing read side is untouched', () => {
  it('admin/downtime-views.js still builds the skill_acquisitions queue entry', () => {
    const src = read('public/js/admin/downtime-views.js');
    expect(src).toMatch(/actionType:\s*'skill_acquisitions'/);
    expect(src).toMatch(/skillAcqPoolStr/);
  });

  it('admin/downtime-story.js still recognises Skill Acquisition merit_type', () => {
    const src = read('public/js/admin/downtime-story.js');
    expect(src).toMatch(/'Skill Acquisition'/);
  });

  it('tabs/story-tab.js still reads acq_skill_rows / skill_acquisitions for historical display', () => {
    const src = read('public/js/tabs/story-tab.js');
    expect(src).toMatch(/skill_acquisitions|acq_skill_rows/);
  });

  it('accessors.js still exports skillAcqPoolStr (consumed by downtime-views.js)', () => {
    const src = read('public/js/data/accessors.js');
    expect(src).toMatch(/export function skillAcqPoolStr/);
  });
});

describe('#1156 — schema still declares (not deletes) the legacy skill_acq_* fields', () => {
  const src = read('server/schemas/downtime_submission.schema.js');

  it('every skill_acq_* / skill_acquisitions field is still declared', () => {
    for (const key of [
      'skill_acq_description', 'skill_acq_pool_attr', 'skill_acq_pool_skill',
      'skill_acq_pool_spec', 'skill_acq_availability', 'skill_acq_merits',
      'skill_acquisitions', 'acq_skill_rows',
    ]) {
      expect(src).toMatch(new RegExp(`${key}:\\s*\\{ type: 'string' \\}`));
    }
  });

  it('the skill_acq_* fields are annotated [legacy]', () => {
    const idx = src.indexOf('acq_skill_rows:');
    const block = src.slice(idx, idx + 1400);
    expect(block).toMatch(/\[legacy\]/);
  });
});
