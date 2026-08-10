/**
 * Bloodlines routes (BL-1, issue #1008).
 *
 * Epic BL — Mongo-backed replacement for the static BLOODLINE_DISCS /
 * BLOODLINE_CLANS / APPROVED_BLOODLINES constants, so a bloodline can be added
 * without a Netlify deploy. Reads are public: BL-2 wires `clanDiscList` to
 * this collection and both the player app and the DT form need it without a
 * token, exactly as the equipment catalogue does.
 *
 * BL-1 is READ-ONLY and inert. Nothing in the client reads it yet; the
 * constants remain the live source until BL-2. Writes (POST/PATCH/DELETE),
 * the ST admin CRUD, and any WS broadcast are BL-4 — deliberately absent
 * here, because an unused broadcast is a claim the code makes and cannot keep.
 *
 * Endpoints:
 *
 *   GET /api/bloodlines        public   list, name ascending
 *   GET /api/bloodlines/:id    public   single by ObjectId
 *
 * Built as a factory taking the auth middleware even though nothing is gated
 * yet, so BL-4 adds its write handlers in place rather than converting the
 * mount. `server/routes/equipment-catalogue.js` is the precedent for the
 * mixed public-read / ST-write shape this grows into.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';

/**
 * Validate :id as a 24-char ObjectId hex. On failure short-circuit with 404 —
 * the same surface a missing doc returns, so a prober cannot distinguish
 * "malformed id" from "no such id". That behaviour is copied from the ECM
 * router deliberately.
 *
 * The round-trip comparison is case-insensitive, which the ECM router's is
 * not: `ObjectId.prototype.toString()` always renders lowercase hex, so a
 * strict comparison 404s an UPPERCASE id that is perfectly valid and addresses
 * a real document. Registered against the ECM twin rather than fixed here.
 */
function withObjectId(req, res, next) {
  const raw = req.params.id;
  if (!ObjectId.isValid(raw) || String(new ObjectId(raw)) !== raw.toLowerCase()) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });
  }
  req._oid = new ObjectId(raw);
  next();
}

/**
 * @param {import('express').RequestHandler} [authMiddleware] - unused in BL-1
 *   (every endpoint here is a public read). Accepted now so BL-4's ST-gated
 *   writes slot in without changing the mount in index.js and test-app.js.
 */
// eslint-disable-next-line no-unused-vars
export default function buildBloodlinesRouter(authMiddleware) {
  const router = Router();
  const col = () => getCollection('bloodlines');

  // `notes` is ST bookkeeping, not player-facing flavour (ruled by Angelus
  // 2026-08-10). These reads are unauthenticated, so it is projected out at
  // the query rather than stripped after fetch — the same shape as the
  // `st_hidden` filtering on relationships. Every other reference collection
  // carrying a free-text note (the eight `rule_*` collections) sits behind
  // requireAuth; this keeps bloodlines consistent with that. BL-4 adds an
  // ST-gated read that includes it.
  const PUBLIC_PROJECTION = { projection: { notes: 0 } };

  router.get('/', async (req, res) => {
    const docs = await col().find({}, PUBLIC_PROJECTION).sort({ name: 1 }).toArray();
    res.json(docs);
  });

  router.get('/:id', withObjectId, async (req, res) => {
    const doc = await col().findOne({ _id: req._oid }, PUBLIC_PROJECTION);
    if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });
    res.json(doc);
  });

  return router;
}
