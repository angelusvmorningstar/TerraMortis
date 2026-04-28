/**
 * JSON Schema (Draft-07) for Project Invitation.
 * Collection: project_invitations
 *
 * One document per invitation extended by the lead of a joint project to
 * a prospective support participant. The collection is queried per-character
 * in the invitee acceptance flow ("show me all my pending invitations"),
 * which is why it lives separately rather than embedded on the cycle.
 *
 * Lifecycle: pending → (accepted | declined | decoupled | cancelled-by-lead).
 * Transitions are enforced by JDT-2+ business logic; JDT-1 only declares the shape.
 *
 * Recommended indexes (created in scripts/create-project-invitation-indexes.js):
 *   { invited_character_id: 1, status: 1 }   JDT-3 invitee inbox query
 *   { joint_project_id: 1 }                  JDT-2 / JDT-6 fan-out by joint
 *
 * See specs/stories/jdt-1-schema-foundations.story.md and Epic JDT.
 */

export const projectInvitationSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Project Invitation',
  type: 'object',
  required: ['_id', 'joint_project_id', 'cycle_id', 'invited_character_id', 'status', 'created_at'],
  additionalProperties: true,

  properties: {
    _id:                   { type: 'string' },
    joint_project_id:      { type: 'string' },
    cycle_id:              { type: 'string' },
    invited_character_id:  { type: 'string' },
    invited_submission_id: { type: ['string', 'null'] },
    status: {
      type: 'string',
      enum: ['pending', 'accepted', 'declined', 'decoupled', 'cancelled-by-lead'],
    },
    created_at:    { type: 'string' },
    responded_at:  { type: ['string', 'null'] },
    decoupled_at:  { type: ['string', 'null'] },
    cancelled_at:  { type: ['string', 'null'] },
  },
};
