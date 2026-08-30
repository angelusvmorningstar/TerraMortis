/**
 * rule_bonus_success — roll-time "+N automatic successes when X" rules.
 *
 * The ninth typed-per-family rules-engine collection (ADR-001 Option B).
 * Unlike every other family in the catalogue this one is NOT evaluated during
 * a character render: it runs once per dice roll, after the dice are counted,
 * and produces successes rather than dots. See
 * public/js/editor/rule_engine/bonus-success-evaluator.js.
 *
 * Predicate vocabulary (dtlt.1, deliberately small — add kinds as real rules
 * need them, never speculatively):
 *   roll_attr          the named attribute is the attribute leg of the pool
 *   roll_skill         the named skill is the skill leg of the pool
 *   merit_present      the character holds the named merit, optionally at
 *                      min_rating or better (effective rating, ADR-001)
 *   manoeuvre_present  the character has picked the named fighting-style
 *                      manoeuvre (flat fighting_picks[] membership). Boolean
 *                      presence only: a manoeuvre has no rating, so min_rating
 *                      is rejected on this kind by the route's postCheck.
 *
 * `also_requires` is an AND list: every predicate in it must match as well as
 * `predicate` itself. Stronger Than You uses it to pin the manoeuvre to
 * Strength-based pools.
 *
 * `excludes_from_threshold` is captured-but-not-enforced errata metadata (see
 * docs/merits/Merits Errata.md:693, Street Fighting "Kick 'Em While They're
 * Down"). dtlt.1 only guarantees the roll result carries rolled and bonus
 * counts separately so a downstream rule can read rolled-only.
 */

const predicate = {
  type: 'object',
  required: ['kind', 'name'],
  additionalProperties: false,
  properties: {
    kind: {
      type: 'string',
      enum: ['roll_attr', 'roll_skill', 'merit_present', 'manoeuvre_present'],
    },
    name: { type: 'string', minLength: 1 },
    // merit_present only. Enforced in server/routes/rules-engine.js's postCheck
    // rather than with an if/then/else so the failure message names the reason.
    min_rating: { type: 'integer', minimum: 1 },
  },
};

export const ruleBonusSuccessSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Rule Bonus Success',
  type: 'object',
  required: ['source', 'predicate', 'count_basis'],
  additionalProperties: false,

  properties: {
    source:        { type: 'string', minLength: 1 },
    predicate,
    also_requires: { type: 'array', items: predicate },
    count_basis:   { type: 'string', enum: ['flat', 'rating'] },
    flat_amount:   { type: 'integer', minimum: 1 },
    excludes_from_threshold: { type: 'array', items: { type: 'string', minLength: 1 } },
    notes:         { type: 'string' },
    created_at:    { type: 'string' },
    updated_at:    { type: 'string' },
  },
};

/**
 * Structural checks the JSON Schema cannot express readably. Returns an error
 * string, or null when the doc is fine.
 *
 * NOTE on the story's "cyclic-reference check": ADR-001 explicitly permits a
 * rule whose predicate references its own source ("PT references its own
 * rating"); what it forbids is a grant whose *target* is its own source. This
 * collection has no target — the output is successes, not a trait — so no
 * cycle is constructible, and the v1 seed itself is source ===
 * predicate.name ('Stronger Than You' gated on holding Stronger Than You).
 * The genuinely useful structural guards are the two below.
 */
export function checkBonusSuccessDoc(body) {
  if (!body || typeof body !== 'object') return 'body must be an object';

  const preds = [body.predicate, ...(Array.isArray(body.also_requires) ? body.also_requires : [])];
  for (const p of preds) {
    if (p && p.kind !== 'merit_present' && p.min_rating !== undefined) {
      return `min_rating is only valid on a merit_present predicate (got kind '${p.kind}')`;
    }
  }

  if (body.count_basis === 'rating' && body.predicate?.kind !== 'merit_present') {
    return "count_basis 'rating' requires a merit_present predicate — there is no rating to read otherwise";
  }

  if (body.count_basis === 'flat' && body.flat_amount === undefined) {
    return "count_basis 'flat' requires flat_amount";
  }

  return null;
}
