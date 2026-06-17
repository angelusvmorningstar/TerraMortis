/**
 * Equipment Catalogue routes (ECM-1, issue #868).
 *
 * Epic ECM (specs/epic-ecm-equipment-catalogue-migration.md). Mongo-backed
 * replacement for the static EQUIPMENT_CATALOGUE module. Reads are public
 * (the DT form and player app both need them without a token); writes are
 * ST-gated.
 *
 * Mounted via a factory so the test app can substitute its mockAuth for the
 * production requireAuth without the router needing to know which one is
 * in play. The mixed-auth shape (no-auth reads + ST-auth writes) does not
 * fit the parent-route-mount pattern used elsewhere; per-handler auth chains
 * with an injected requireAuth keep the wiring explicit.
 *
 * Endpoints (per epic D3):
 *
 *   GET    /api/equipment_catalogue              public   list all
 *   GET    /api/equipment_catalogue/:id          public   single by ObjectId
 *   GET    /api/equipment_catalogue/:id/impact   public   holder count + names
 *   POST   /api/equipment_catalogue              ST       create
 *   PATCH  /api/equipment_catalogue/:id          ST       partial update
 *   DELETE /api/equipment_catalogue/:id          ST       409 if any holder
 *
 * Write paths broadcast `broadcastCatalogueUpdate(itemId, op)` on the WS so
 * ECM-4/5/6 dropdown clients can refetch the catalogue. Wired in ECM-1 even
 * though no client listens yet — the cost of firing into an empty WS is nil
 * and ECM-6 inherits the wiring rather than having to add it.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  equipmentCatalogueSchema,
  EQUIPMENT_CATALOGUE_UPDATABLE_FIELDS,
} from '../schemas/equipment_catalogue.schema.js';
import { broadcastCatalogueUpdate } from '../ws.js';

/**
 * Validate :id param as a 24-char ObjectId hex. On failure short-circuit
 * with 404 — same surface a non-existent doc returns, so probing clients
 * can't distinguish "malformed id" from "no such id".
 */
function withObjectId(req, res, next) {
  if (!ObjectId.isValid(req.params.id) || String(new ObjectId(req.params.id)) !== req.params.id) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
  }
  req._oid = new ObjectId(req.params.id);
  next();
}

/**
 * Factory: returns the equipment_catalogue router with the supplied auth
 * middleware applied to the write handlers. `authMiddleware` runs before
 * `requireRole('st')`; in prod that's `requireAuth`, in tests `mockAuth`.
 */
export default function buildEquipmentCatalogueRouter(authMiddleware) {
  const router = Router();
  const col = () => getCollection('equipment_catalogue');
  const chars = () => getCollection('characters');

  // ─────────────────────────────────────────────────────────────────────────
  //  Public reads
  // ─────────────────────────────────────────────────────────────────────────

  router.get('/', async (req, res) => {
    const docs = await col().find({}).sort({ bucket: 1, name: 1 }).toArray();
    res.json(docs);
  });

  router.get('/:id/impact', withObjectId, async (req, res) => {
    const item = await col().findOne({ _id: req._oid });
    if (!item) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
    const holders = await chars()
      .find({ 'equipment.catalogue_id': req._oid }, { projection: { name: 1 } })
      .toArray();
    res.json({
      holders: holders.length,
      character_names: holders.map(c => c.name).filter(Boolean),
    });
  });

  router.get('/:id', withObjectId, async (req, res) => {
    const doc = await col().findOne({ _id: req._oid });
    if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
    res.json(doc);
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  ST-only writes
  // ─────────────────────────────────────────────────────────────────────────

  router.post('/',
    authMiddleware, requireRole('st'),
    validate(equipmentCatalogueSchema),
    async (req, res) => {
      const now = new Date().toISOString();
      const doc = { ...req.body, created_at: now, updated_at: now };
      // Don't trust client-supplied _id on create.
      delete doc._id;
      const result = await col().insertOne(doc);
      const created = await col().findOne({ _id: result.insertedId });
      broadcastCatalogueUpdate(result.insertedId, 'create');
      res.status(201).json(created);
    }
  );

  router.patch('/:id',
    authMiddleware, requireRole('st'),
    withObjectId,
    async (req, res) => {
      const filtered = {};
      for (const [field, value] of Object.entries(req.body)) {
        if (EQUIPMENT_CATALOGUE_UPDATABLE_FIELDS.has(field)) filtered[field] = value;
      }
      if (!Object.keys(filtered).length) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'No updatable fields provided',
        });
      }
      filtered.updated_at = new Date().toISOString();
      const result = await col().findOneAndUpdate(
        { _id: req._oid },
        { $set: filtered },
        { returnDocument: 'after' }
      );
      if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
      broadcastCatalogueUpdate(req._oid, 'update');
      res.json(result);
    }
  );

  router.delete('/:id',
    authMiddleware, requireRole('st'),
    withObjectId,
    async (req, res) => {
      // D5 + ECM-6 HALT-DAR pin: hard-block at the API layer when held.
      const holders = await chars()
        .find({ 'equipment.catalogue_id': req._oid }, { projection: { name: 1 } })
        .toArray();
      if (holders.length > 0) {
        return res.status(409).json({
          error: 'CONFLICT',
          message: `Cannot delete — item is held by ${holders.length} character${holders.length === 1 ? '' : 's'}`,
          holders: holders.length,
          character_names: holders.map(c => c.name).filter(Boolean),
        });
      }
      const result = await col().deleteOne({ _id: req._oid });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
      }
      broadcastCatalogueUpdate(req._oid, 'delete');
      res.status(204).end();
    }
  );

  return router;
}
