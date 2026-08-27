/**
 * Office content routes (oxp.10, split out of oxp.1, 2026-08-13).
 *
 * Mongo-backed replacement for the static `OFFICE_DATA` / `MERIT_DOT_CAPS`
 * constants (`public/js/tabs/office-data.js`, deleted in this same story),
 * following Epic BL's bloodlines precedent exactly: reads are public (the
 * player-facing office tab and the sheet editor both need this without a
 * token, same as bloodlines and the equipment catalogue), and this repo is
 * READ-ONLY against this collection — no write route, no admin UI here. A
 * future TM Admin story adds ST authoring against this same shared
 * `office_content` collection (see `server/schemas/office_content.schema.js`
 * for the locked scope decision and the two document kinds it holds).
 *
 * Endpoints:
 *
 *   GET    /api/office_content             public   both kinds, unfiltered
 *
 * A single unfiltered list (not split into two endpoints, and not filtered
 * by `kind`) because every real consumer (`office-content-cache.js` client
 * side; the four server dependents) wants both the office documents and the
 * merit-caps document on every load, the same shape as `bloodlines-cache.js`
 * fetching its one collection whole. Sorted by `kind` then `category` so
 * office documents sort together, ahead of the singleton `merit_caps`
 * document (which sorts last since `'merit_caps' > 'office'`
 * lexicographically) - a stable, human-scannable order, not a functional
 * requirement any consumer depends on.
 */

import { Router } from 'express';
import { getCollection } from '../db.js';

export default function buildOfficeContentRouter(authMiddleware) {
  const router = Router();
  const col = () => getCollection('office_content');

  router.get('/', async (req, res) => {
    const docs = await col().find({}).sort({ kind: 1, category: 1 }).toArray();
    res.json(docs);
  });

  return router;
}
