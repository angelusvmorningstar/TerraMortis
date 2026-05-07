/**
 * Unit tests — covenant status gating in meetsPrereq (hotfix #44).
 *
 * Verifies that Carthian Law and Invictus Oath prereqs resolve correctly
 * based on character covenant Status, with no blanket exclusion.
 */

import { vi, describe, it, expect } from 'vitest';

// Stub accessors — only status checks needed for these prereqs
vi.mock('../../public/js/data/accessors.js', () => ({
  getAttrVal: () => 0,
  skDots: () => 0,
}));

import { meetsPrereq } from '../../public/js/data/prereq.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function carthianChar(statusDots = 1) {
  return { status: { covenant: { 'Carthian Movement': statusDots } } };
}

function invictusChar(statusDots = 1) {
  return { status: { covenant: { 'Invictus': statusDots } } };
}

function noCovenantChar() {
  return { status: {} };
}

// Prereqs matching real DB shape for covenant merits
const carthianLaw1 = { type: 'status', qualifier: 'Carthian', dots: 1 };
const carthianLaw3 = { type: 'status', qualifier: 'Carthian', dots: 3 };
const invictusOath3 = { type: 'status', qualifier: 'Invictus', dots: 3 };
const invictusOath5 = { type: 'status', qualifier: 'Invictus', dots: 5 };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('meetsPrereq — covenant status gating (hotfix #44)', () => {
  describe('Carthian Law merits', () => {
    it('allows a Carthian character with sufficient Status', () => {
      expect(meetsPrereq(carthianChar(1), carthianLaw1)).toBe(true);
    });

    it('allows a Carthian character when Status exceeds requirement', () => {
      expect(meetsPrereq(carthianChar(5), carthianLaw3)).toBe(true);
    });

    it('blocks a Carthian character with insufficient Status', () => {
      expect(meetsPrereq(carthianChar(2), carthianLaw3)).toBe(false);
    });

    it('blocks an Invictus character from Carthian Law merits', () => {
      expect(meetsPrereq(invictusChar(5), carthianLaw1)).toBe(false);
    });

    it('blocks a character with no covenant Status', () => {
      expect(meetsPrereq(noCovenantChar(), carthianLaw1)).toBe(false);
    });
  });

  describe('Invictus Oath merits', () => {
    it('allows an Invictus character with sufficient Status', () => {
      expect(meetsPrereq(invictusChar(3), invictusOath3)).toBe(true);
    });

    it('allows an Invictus character when Status exceeds requirement', () => {
      expect(meetsPrereq(invictusChar(5), invictusOath3)).toBe(true);
    });

    it('blocks an Invictus character with insufficient Status', () => {
      expect(meetsPrereq(invictusChar(2), invictusOath3)).toBe(false);
    });

    it('blocks a Carthian character from Invictus Oath merits (AC3)', () => {
      expect(meetsPrereq(carthianChar(5), invictusOath3)).toBe(false);
    });

    it('blocks a character with no covenant Status', () => {
      expect(meetsPrereq(noCovenantChar(), invictusOath5)).toBe(false);
    });
  });
});
