export const devlogEntrySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Devlog Entry',
  type: 'object',
  required: ['type', 'title', 'status'],
  additionalProperties: true,
  properties: {
    type:         { type: 'string', enum: ['rule_change', 'app_feature'] },
    title:        { type: 'string', minLength: 1 },
    body:         { type: 'string' },
    status:       { type: 'string', enum: ['considering', 'confirmed', 'in_progress', 'implemented', 'deferred'] },
    // When true, the entry is surfaced in the player tab's prominent
    // "Recently Shipped" section regardless of status, instead of falling into
    // the collapsed Resolved group. Lets a just-implemented change read as news.
    highlight:    { type: 'boolean' },
    target_cycle: { type: 'string' },
    created_at:   { type: 'string' },
    updated_at:   { type: 'string' },
  },
};
