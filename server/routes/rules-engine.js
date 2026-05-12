import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { ruleGrantSchema } from '../schemas/rules/rule-grant.schema.js';
import { ruleSpecialityGrantSchema } from '../schemas/rules/rule-speciality-grant.schema.js';
import { ruleSkillBonusSchema } from '../schemas/rules/rule-skill-bonus.schema.js';
import { ruleNineAgainSchema } from '../schemas/rules/rule-nine-again.schema.js';
import { ruleDiscAttrSchema } from '../schemas/rules/rule-disc-attr.schema.js';
import { ruleDerivedStatModifierSchema } from '../schemas/rules/rule-derived-stat-modifier.schema.js';
import { ruleTierBudgetSchema } from '../schemas/rules/rule-tier-budget.schema.js';
import { ruleStatusFloorSchema } from '../schemas/rules/rule-status-floor.schema.js';

function makeRulesRouter(collectionName, schema, { postCheck } = {}) {
  const router = Router();
  const col = () => getCollection(collectionName);

  router.get('/', async (req, res) => {
    const docs = await col().find({}).sort({ _id: 1 }).toArray();
    res.json(docs);
  });

  router.get('/:id', async (req, res) => {
    let oid;
    try { oid = new ObjectId(req.params.id); } catch { return res.status(404).json({ error: 'NOT_FOUND' }); }
    const doc = await col().findOne({ _id: oid });
    if (!doc) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(doc);
  });

  router.post('/', validate(schema), async (req, res) => {
    if (postCheck) {
      const checkErr = postCheck(req.body);
      if (checkErr) return res.status(400).json({ error: 'VALIDATION_ERROR', message: checkErr });
    }
    const doc = { ...req.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const result = await col().insertOne(doc);
    const created = await col().findOne({ _id: result.insertedId });
    res.status(201).json(created);
  });

  router.put('/:id', validate(schema), async (req, res) => {
    let oid;
    try { oid = new ObjectId(req.params.id); } catch { return res.status(404).json({ error: 'NOT_FOUND' }); }
    if (postCheck) {
      const checkErr = postCheck(req.body);
      if (checkErr) return res.status(400).json({ error: 'VALIDATION_ERROR', message: checkErr });
    }
    const { _id, ...body } = req.body;
    body.updated_at = new Date().toISOString();
    const result = await col().findOneAndUpdate(
      { _id: oid },
      { $set: body },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(result);
  });

  router.delete('/:id', async (req, res) => {
    let oid;
    try { oid = new ObjectId(req.params.id); } catch { return res.status(404).json({ error: 'NOT_FOUND' }); }
    const result = await col().deleteOne({ _id: oid });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND' });
    res.status(204).end();
  });

  return router;
}

export const grantRouter = makeRulesRouter('rule_grant', ruleGrantSchema, {
  postCheck(body) {
    if (body.source && body.target && body.source === body.target) {
      return 'source and target must not be the same merit (cyclic self-grant)';
    }
    return null;
  },
});

export const specialityGrantRouter = makeRulesRouter('rule_speciality_grant', ruleSpecialityGrantSchema);
export const skillBonusRouter      = makeRulesRouter('rule_skill_bonus',       ruleSkillBonusSchema);
export const nineAgainRouter       = makeRulesRouter('rule_nine_again',        ruleNineAgainSchema);
export const discAttrRouter        = makeRulesRouter('rule_disc_attr',         ruleDiscAttrSchema);
export const derivedStatModRouter  = makeRulesRouter('rule_derived_stat_modifier', ruleDerivedStatModifierSchema);
export const tierBudgetRouter      = makeRulesRouter('rule_tier_budget',       ruleTierBudgetSchema);
export const statusFloorRouter     = makeRulesRouter('rule_status_floor',      ruleStatusFloorSchema);

/**
 * Issue #256 (perf): coalesce 7 rule-engine endpoints into a single
 * round-trip used by `preloadRules` on the client. Cuts boot latency
 * from 7 parallel TLS+auth round-trips to 1.
 *
 * GET /api/rules/aggregate?categories=grant,nine_again,...
 *   → { rule_grant: [...], rule_nine_again: [...], ... }
 *
 * Auth: ST/dev only (mounted with the same `requireRole('st')` gate as
 * the individual rule-engine endpoints in index.js — composes cleanly
 * because every category has identical auth semantics).
 *
 * The 7 existing per-category endpoints stay in place for admin
 * tooling that writes / inspects them individually.
 */
const ALLOWED_RULE_CATEGORIES = new Set([
  'grant',
  'nine_again',
  'skill_bonus',
  'speciality_grant',
  'tier_budget',
  'disc_attr',
  'derived_stat_modifier',
  'status_floor',
]);

export const rulesAggregateRouter = Router();

rulesAggregateRouter.get('/', async (req, res) => {
  const raw = req.query.categories;
  if (!raw) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'categories query param required' });
  }
  const categories = String(raw)
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  if (!categories.length) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'categories cannot be empty' });
  }
  const invalid = categories.filter(c => !ALLOWED_RULE_CATEGORIES.has(c));
  if (invalid.length) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Unknown rule categories: ${invalid.join(', ')}`,
      allowed: [...ALLOWED_RULE_CATEGORIES],
    });
  }
  // Deduplicate so a malformed `categories=grant,grant` doesn't double-query.
  const uniq = [...new Set(categories)];
  // Fire all category queries in parallel. Each backed by the same
  // `rule_<category>` collection the individual routers use, so the
  // wire format and semantics are identical.
  const arrays = await Promise.all(
    uniq.map(cat => getCollection(`rule_${cat}`).find({}).toArray())
  );
  const result = {};
  for (let i = 0; i < uniq.length; i++) {
    result[`rule_${uniq[i]}`] = arrays[i];
  }
  res.json(result);
});
