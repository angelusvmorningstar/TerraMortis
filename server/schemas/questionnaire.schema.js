/**
 * JSON Schema (Draft-07) for TM Questionnaire and History Responses.
 * Collections: questionnaire_responses, history_responses
 *
 * Both follow the same draft → submitted → approved state machine.
 * One response per character. Players own their responses; STs can approve.
 */

const responseDocSchema = {
  type: 'object',
  required: ['character_id'],
  additionalProperties: true,

  properties: {
    character_id: { type: 'string', minLength: 1 },
    player_id:    { type: 'string' },
    status:       { type: 'string', enum: ['draft', 'submitted', 'approved'] },
    responses:    { type: 'object', additionalProperties: true },
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
    submitted_at: { type: ['string', 'null'] },
    approved_at:  { type: ['string', 'null'] },
  },
};

export const questionnaireResponseSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Questionnaire Response',
  ...responseDocSchema,
};

export const historyResponseSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM History Response',
  ...responseDocSchema,
};
