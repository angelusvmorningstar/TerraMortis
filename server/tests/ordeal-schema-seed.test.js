/**
 * Structural tests — ordeal schema definitions and rubric seed file.
 * Verifies fix.57 deliverables without hitting MongoDB.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ordealRubricSchema,
  ordealSubmissionSchema,
  ordealResponseSchema,
} from '../schemas/ordeal.schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');

// ── Schema hardening ──────────────────────────────────────────────────────────

describe('ordealRubricSchema — required fields', () => {
  it('has required array including ordeal_type, title, questions', () => {
    expect(ordealRubricSchema.required).toContain('ordeal_type');
    expect(ordealRubricSchema.required).toContain('title');
    expect(ordealRubricSchema.required).toContain('questions');
  });

  it('keeps additionalProperties: true for import compat', () => {
    expect(ordealRubricSchema.additionalProperties).toBe(true);
  });
});

describe('ordealSubmissionSchema — required fields', () => {
  it('has required array including ordeal_type, submitted_at, source, responses', () => {
    expect(ordealSubmissionSchema.required).toContain('ordeal_type');
    expect(ordealSubmissionSchema.required).toContain('submitted_at');
    expect(ordealSubmissionSchema.required).toContain('source');
    expect(ordealSubmissionSchema.required).toContain('responses');
  });

  it('keeps additionalProperties: true for import compat', () => {
    expect(ordealSubmissionSchema.additionalProperties).toBe(true);
  });
});

describe('ordealResponseSchema — unchanged', () => {
  it('uses short ordeal_type enum (Pipeline B)', () => {
    const en = ordealResponseSchema.properties.ordeal_type.enum;
    expect(en).toContain('rules');
    expect(en).toContain('lore');
    expect(en).toContain('covenant');
    // Must NOT contain long-form types (Pipeline A)
    expect(en).not.toContain('lore_mastery');
    expect(en).not.toContain('rules_mastery');
  });

  it('has required: ordeal_type', () => {
    expect(ordealResponseSchema.required).toContain('ordeal_type');
  });
});

// ── Rubric seed file structure ────────────────────────────────────────────────

describe('data/ordeal_rubrics_seed.json', () => {
  let seed;

  it('is valid JSON and parseable', () => {
    const raw = readFileSync(path.join(ROOT, 'data/ordeal_rubrics_seed.json'), 'utf-8');
    seed = JSON.parse(raw);
    expect(seed).toBeTruthy();
  });

  it('has lore_mastery array', () => {
    seed = seed || JSON.parse(readFileSync(path.join(ROOT, 'data/ordeal_rubrics_seed.json'), 'utf-8'));
    expect(Array.isArray(seed.lore_mastery)).toBe(true);
    expect(seed.lore_mastery.length).toBeGreaterThan(0);
  });

  it('has rules_mastery array', () => {
    seed = seed || JSON.parse(readFileSync(path.join(ROOT, 'data/ordeal_rubrics_seed.json'), 'utf-8'));
    expect(Array.isArray(seed.rules_mastery)).toBe(true);
    expect(seed.rules_mastery.length).toBeGreaterThan(0);
  });

  it('has covenant_questionnaire array with all four covenants', () => {
    seed = seed || JSON.parse(readFileSync(path.join(ROOT, 'data/ordeal_rubrics_seed.json'), 'utf-8'));
    expect(Array.isArray(seed.covenant_questionnaire)).toBe(true);
    const covenants = seed.covenant_questionnaire.map(b => b.covenant);
    expect(covenants).toContain('Carthian Movement');
    expect(covenants).toContain('Circle of the Crone');
    expect(covenants).toContain('Invictus');
    expect(covenants).toContain('Lancea et Sanctum');
  });

  it('each question entry has index, question, expected_answer, marking_notes', () => {
    seed = seed || JSON.parse(readFileSync(path.join(ROOT, 'data/ordeal_rubrics_seed.json'), 'utf-8'));
    const allQuestions = [
      ...seed.lore_mastery,
      ...seed.rules_mastery,
      ...seed.covenant_questionnaire.flatMap(b => b.questions),
    ];
    for (const q of allQuestions) {
      expect(typeof q.index).toBe('number');
      expect(typeof q.question).toBe('string');
      expect(typeof q.expected_answer).toBe('string');
      expect(typeof q.marking_notes).toBe('string');
    }
  });

  it('has _note key warning about placeholders', () => {
    seed = seed || JSON.parse(readFileSync(path.join(ROOT, 'data/ordeal_rubrics_seed.json'), 'utf-8'));
    expect(typeof seed._note).toBe('string');
    expect(seed._note.toLowerCase()).toMatch(/placeholder/);
  });
});
