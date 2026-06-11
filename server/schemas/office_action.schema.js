export const officeActionSchema = {
  type: 'object',
  required: ['game_session_id', 'actor_id', 'target_id', 'action_type'],
  additionalProperties: false,
  properties: {
    game_session_id: { type: 'string' },
    actor_id:        { type: 'string' },
    target_id:       { type: 'string' },
    action_type:     { type: 'string', enum: ['grant_first', 'raise', 'lower', 'strip_last'] },
  },
};
