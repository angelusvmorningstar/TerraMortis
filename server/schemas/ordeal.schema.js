/**
 * JSON Schema (Draft-07) for TM Ordeal system.
 * Collections: ordeal_rubrics, ordeal_submissions, ordeal_responses
 *
 * Ordeals are knowledge tests (lore, rules, covenant) that award XP on completion.
 * ordeal_responses follows the same draft→submitted→approved state machine as questionnaires.
 */

const ordealTypeEnum = ['lore_mastery', 'rules_mastery', 'covenant_questionnaire', 'character_history'];

// ordeal_type naming conventions differ by pipeline:
//   Pipeline A (ordeal_submissions — historical Google Forms import):
//     lore_mastery | rules_mastery | covenant_questionnaire | character_history
//     → Marked in admin panel; cascade uses ORDEAL_NAME_MAP to translate to short names
//   Pipeline B (ordeal_responses — web form submissions):
//     rules | lore | covenant
//     → Approved by ST in player-facing ordeal form; cascade in ordeal-responses.js
// Do not attempt to unify these enums — both pipelines are active.

export const ordealRubricSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Ordeal Rubric',
  type: 'object',
  required: ['ordeal_type', 'title', 'questions'],
  additionalProperties: true,

  properties: {
    ordeal_type:      { type: 'string', enum: ordealTypeEnum },
    covenant:         { type: ['string', 'null'] },
    title:            { type: 'string' },
    description:      { type: 'string' },
    expected_answers: { type: 'array' },
    marking_notes:    { type: 'string' },
    questions:        { type: 'array' },
  },
};

export const ordealSubmissionSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Ordeal Submission',
  type: 'object',
  required: ['ordeal_type', 'submitted_at', 'source', 'responses'],
  additionalProperties: true,

  properties: {
    ordeal_type:    { type: 'string', enum: ordealTypeEnum },
    character_id:   { type: ['string', 'null'] },
    player_id:      { type: ['string', 'null'] },
    covenant:       { type: ['string', 'null'] },
    source:         { type: 'string' },
    submitted_at:   { type: 'string' },

    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question_index: { type: 'integer', minimum: 0 },
          answer:         { type: 'string' },
        },
        additionalProperties: true,
      },
    },

    marking: {
      type: 'object',
      properties: {
        status:           { type: 'string', enum: ['pending', 'complete'] },
        overall_feedback: { type: 'string' },
        marked_at:        { type: 'string' },
        xp_awarded:       { type: 'integer', minimum: 0 },
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question_index: { type: 'integer', minimum: 0 },
              result:         { type: 'string' },
              feedback:       { type: 'string' },
            },
            additionalProperties: true,
          },
        },
      },
      additionalProperties: true,
    },
  },
};

export const ordealResponseSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Ordeal Response',
  type: 'object',
  required: ['ordeal_type'],
  additionalProperties: true,

  properties: {
    player_id:    { type: 'string' },
    ordeal_type:  { type: 'string', enum: ['rules', 'lore', 'covenant'] },
    status:       { type: 'string', enum: ['draft', 'submitted', 'approved'] },
    responses:    { type: 'object', additionalProperties: true },
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
    submitted_at: { type: ['string', 'null'] },
    approved_at:  { type: ['string', 'null'] },
  },
};
