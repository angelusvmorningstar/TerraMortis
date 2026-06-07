/**
 * JSON Schema (Draft-07) for a per-cycle clan/covenant ranking ballot (#624).
 * Collection: ranking_ballots — one doc per { cycle_id, voter_character_id }.
 *
 * Validated on PUT (a player writes their OWN ballot). Business rules
 * (clan/covenant membership, self-exclusion, distinct slots) are enforced in
 * the route, not here. Each ranking is { "1": charId, "2": charId, "3": charId }
 * with PARTIAL allowed — missing/empty slots simply score nothing.
 * updated_at is set server-side and is not part of this schema.
 */

const rankingShape = {
  type: 'object',
  additionalProperties: false,
  properties: {
    1: { type: ['string', 'null'] },
    2: { type: ['string', 'null'] },
    3: { type: ['string', 'null'] },
    4: { type: ['string', 'null'] },
    5: { type: ['string', 'null'] },
  },
};

export const rankingBallotSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Clan/Covenant Ranking Ballot',
  type: 'object',
  required: ['cycle_id', 'voter_character_id'],
  additionalProperties: false,
  properties: {
    cycle_id:           { type: 'string', minLength: 1 },
    voter_character_id: { type: 'string', minLength: 1 },
    clan_ranking:     rankingShape,
    covenant_ranking: rankingShape,
  },
};
