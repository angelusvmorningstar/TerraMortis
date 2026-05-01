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
