/**
 * JSON Schema (Draft-07) for TM Ordeal system.
 * Collections: ordeal_rubrics, ordeal_submissions, ordeal_responses
 *
 * Ordeals are knowledge tests (lore, rules, covenant) that award XP on completion.
 * ordeal_responses follows the same draft→submitted→approved state machine as questionnaires.
 */

const ordealTypeEnum = ['lore_mastery', 'rules_mastery', 'covenant_questionnaire', 'character_history'];

export const ordealRubricSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Ordeal Rubric',
  type: 'object',
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

// Validates the POST /api/ordeal-responses REQUEST body, which is
// { type, responses }. The handler maps `type` → the stored `ordeal_type`
// field and adds player_id/status/timestamps server-side (issue #525). It must
// therefore require `type`, not `ordeal_type` — requiring the stored-doc field
// 400'd every create. `ordeal_type` is kept as an allowed property (it
// describes the stored doc) but is NOT required on the request.
export const ordealResponseSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Ordeal Response',
  type: 'object',
  required: ['type'],
  additionalProperties: true,

  properties: {
    type:         { type: 'string', enum: ['rules', 'lore', 'covenant'] },
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
