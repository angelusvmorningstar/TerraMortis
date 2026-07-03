/**
 * fix.865 — DT processing: retainer/mentor action-type override ignored.
 *
 * Three queue-build blocks hardcoded actionType: 'resources_retainers' without
 * reading action_type_override from merit_actions_resolved. The sphere/allies
 * path already applied the override correctly; these blocks now mirror that
 * pattern. Also adds originalActionType to each push, a placeholder option to
 * _renderActionTypeRow, and tightens the recat handler null-condition.
 *
 * AC-T1 — Block A (retainers.forEach) reads action_type_override
 * AC-T2 — Block B (mentor for-loop) reads action_type_override
 * AC-T3 — Block C (app-form retainer for-loop) reads action_type_override
 * AC-T4 — Block A pushes originalActionType
 * AC-T5 — Block B pushes originalActionType
 * AC-T6 — Block C pushes originalActionType
 * AC-T7 — No bare 'resources_retainers' without override read survives in A/B/C
 * AC-T8 — _renderActionTypeRow emits placeholder option
 * AC-T9 — Recat handler guards on !newType as well as originalActionType match
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');
const src  = readFileSync(resolve(root, 'public/js/admin/downtime-views.js'), 'utf8');

// ── Block anchors ─────────────────────────────────────────────────────────────
// Block A: retainers.forEach CSV path
// Anchor from retainers.forEach (unique function call) so the override read
// that precedes the queue.push label is included in the slice.
const blockAStart = src.indexOf('retainers.forEach');
const blockAEnd   = src.indexOf('meritFlatIdx++;', blockAStart) + 'meritFlatIdx++;'.length;

// Block B: mentor for-loop — anchor from mentor_${n}_task key read
const blockBStart = src.indexOf('`mentor_${n}_task`');
const blockBEnd   = src.indexOf('meritFlatIdx++;', blockBStart) + 'meritFlatIdx++;'.length;

// Block C: app-form retainer for-loop — retainer_${n}_task is unique discriminator
const blockCStart = src.indexOf('`retainer_${n}_task`');
const blockCEnd   = src.indexOf('meritFlatIdx++;', blockCStart) + 'meritFlatIdx++;'.length;

// Recat handler anchor
const recatHandlerStart = src.indexOf('Clear override if ST selects the original player-submitted type');

// _renderActionTypeRow anchor
const renderActionTypeRowStart = src.indexOf('proc-recat-row');

// ── Sanity: anchors found ─────────────────────────────────────────────────────
describe('anchors found', () => {
  it('Block A anchor is present', () => { expect(blockAStart).toBeGreaterThan(0); });
  it('Block B anchor is present', () => { expect(blockBStart).toBeGreaterThan(0); });
  it('Block C anchor is present', () => { expect(blockCStart).toBeGreaterThan(0); });
  it('recat handler anchor is present', () => { expect(recatHandlerStart).toBeGreaterThan(0); });
  it('_renderActionTypeRow anchor is present', () => { expect(renderActionTypeRowStart).toBeGreaterThan(0); });
});

// ── AC-T1: Block A reads action_type_override ────────────────────────────────
describe('AC-T1 — Block A reads action_type_override', () => {
  it('contains action_type_override read in retainers.forEach block', () => {
    const blockA = src.slice(blockAStart, blockAEnd);
    expect(blockA).toContain('action_type_override');
  });
});

// ── AC-T2: Block B reads action_type_override ────────────────────────────────
describe('AC-T2 — Block B reads action_type_override', () => {
  it('contains action_type_override read in mentor for-loop block', () => {
    const blockB = src.slice(blockBStart, blockBEnd);
    expect(blockB).toContain('action_type_override');
  });
});

// ── AC-T3: Block C reads action_type_override ────────────────────────────────
describe('AC-T3 — Block C reads action_type_override', () => {
  it('contains action_type_override read in app-form retainer for-loop block', () => {
    const blockC = src.slice(blockCStart, blockCEnd);
    expect(blockC).toContain('action_type_override');
  });
});

// ── AC-T4: Block A pushes originalActionType ─────────────────────────────────
describe('AC-T4 — Block A pushes originalActionType', () => {
  it('originalActionType appears in retainers.forEach queue.push', () => {
    const pushStart = src.indexOf('queue.push({', blockAStart);
    const pushEnd   = blockAEnd;
    const pushSlice = src.slice(pushStart, pushEnd);
    expect(pushSlice).toContain('originalActionType:');
  });
});

// ── AC-T5: Block B pushes originalActionType ─────────────────────────────────
describe('AC-T5 — Block B pushes originalActionType', () => {
  it('originalActionType appears in mentor for-loop queue.push', () => {
    const pushStart = src.indexOf('queue.push({', blockBStart);
    const pushEnd   = blockBEnd;
    const pushSlice = src.slice(pushStart, pushEnd);
    expect(pushSlice).toContain('originalActionType:');
  });
});

// ── AC-T6: Block C pushes originalActionType ─────────────────────────────────
describe('AC-T6 — Block C pushes originalActionType', () => {
  it('originalActionType appears in app-form retainer for-loop queue.push', () => {
    const pushStart = src.indexOf('queue.push({', blockCStart);
    const pushEnd   = blockCEnd;
    const pushSlice = src.slice(pushStart, pushEnd);
    expect(pushSlice).toContain('originalActionType:');
  });
});

// ── AC-T7: No bare 'resources_retainers' assignment without override read ─────
describe('AC-T7 — No bare resources_retainers actionType without override read', () => {
  it('Block A does not contain bare actionType: resources_retainers', () => {
    // Widen to include the full retainers.forEach closure
    const retainerForEachStart = src.indexOf('retainers.forEach');
    const retainerForEachEnd   = src.indexOf('meritFlatIdx++;', retainerForEachStart) + 'meritFlatIdx++;'.length;
    const blockAFull = src.slice(retainerForEachStart, retainerForEachEnd);
    // The bare assignment should not exist — the dynamic variable must be used instead
    expect(blockAFull).not.toContain("actionType: 'resources_retainers'");
  });

  it('Block B does not contain bare actionType: resources_retainers', () => {
    const blockB = src.slice(blockBStart, blockBEnd);
    expect(blockB).not.toContain("actionType: 'resources_retainers'");
  });

  it('Block C does not contain bare actionType: resources_retainers', () => {
    const blockC = src.slice(blockCStart, blockCEnd);
    expect(blockC).not.toContain("actionType: 'resources_retainers'");
  });
});

// ── AC-T8: _renderActionTypeRow emits placeholder option ─────────────────────
describe('AC-T8 — _renderActionTypeRow emits placeholder option', () => {
  it('placeholder option is present in select render', () => {
    const selectStart = src.indexOf('proc-recat-select', renderActionTypeRowStart);
    // Read enough to capture the placeholder option line.
    // In the JS source the template literal uses escaped quotes: value=\"\"
    const selectSlice = src.slice(selectStart, selectStart + 400);
    // The source contains the placeholder option for empty/unset action type
    expect(selectSlice).toContain('Select action type');
    // value="" in the source — the template literal uses plain double-quotes
    expect(selectSlice).toContain('value=""');
  });
});

// ── AC-T9: Recat handler guards on !newType ───────────────────────────────────
describe('AC-T9 — Recat handler patch line guards on !newType', () => {
  it('patch line contains !newType condition', () => {
    const patchIdx = src.indexOf('action_type_override:', recatHandlerStart);
    expect(patchIdx).toBeGreaterThan(recatHandlerStart);
    const patchLine = src.slice(patchIdx, patchIdx + 120);
    expect(patchLine).toContain('!newType');
  });

  it('patch line also guards originalActionType match', () => {
    const patchIdx = src.indexOf('action_type_override:', recatHandlerStart);
    const patchLine = src.slice(patchIdx, patchIdx + 120);
    expect(patchLine).toContain('entry.originalActionType');
  });
});
