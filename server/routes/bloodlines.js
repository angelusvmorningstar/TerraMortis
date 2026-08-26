/**
 * Bloodlines routes (BL-1 read; issue #1008).
 *
 * Epic BL — Mongo-backed replacement for the static BLOODLINE_DISCS /
 * BLOODLINE_CLANS / APPROVED_BLOODLINES constants, so a bloodline can be added
 * without a Netlify deploy. Reads are public: BL-2 wires `clanDiscList` to
 * this collection and both the player app and the DT form need it without a
 * token, exactly as the equipment catalogue does.
 *
 * ADMR-1: the BL-4 admin CRUD (`GET /admin`, `GET /:id/impact`, `GET /:id`,
 * `POST`, `PATCH`, `DELETE`) is RETIRED - ST authoring now lives in TM Admin,
 * a separate app writing to this repo's own shared `bloodlines` collection.
 * This file keeps ONLY the plain public read below, because
 * `public/js/data/bloodlines-cache.js` depends on it for LIVE gameplay data
 * (every character sheet's in-clan-vs-out-of-clan discipline XP costing, in
 * both this app and the player-facing suite) - a completely separate concern
 * from the admin screen that used to sit alongside it here. See
 * `specs/stories/admr-1-retire-bloodlines-admin.md` for the full route/caller
 * audit that justified keeping this one endpoint and nothing else.
 *
 * A REAL, KNOWN GAP THIS RETIREMENT LEAVES BEHIND (not fixed here, flagged for
 * Angelus): `broadcastBloodlineUpdate` (`server/ws.js`) used to be called
 * directly from the now-deleted write handlers, live-pushing an edit to every
 * open TM Game tab over WebSocket. Nothing in this repo calls it any more -
 * an ST edit made through TM Admin will not reach an already-open TM Game tab
 * until that tab is reloaded. The cache itself is unaffected (it still reads
 * this same shared collection correctly on every boot/reload); only the
 * mid-session live-push is gone.
 *
 * Endpoint:
 *
 *   GET    /api/bloodlines             public   list, name ascending
 *
 * `buildBloodlinesRouter` keeps its `authMiddleware` parameter even though
 * nothing inside uses it any more, deliberately - `server/index.js` and
 * `server/tests/helpers/test-app.js` both call it as
 * `buildBloodlinesRouter(requireAuth)` / `buildBloodlinesRouter(mockAuth)`,
 * and this story's own scope is the route surface, not the mount sites.
 */

import { Router } from 'express';
import { getCollection } from '../db.js';

export default function buildBloodlinesRouter(authMiddleware) {
  const router = Router();
  const col = () => getCollection('bloodlines');

  // `notes` is ST bookkeeping, not player-facing flavour (ruled by Angelus
  // 2026-08-10). These reads are unauthenticated, so it is projected out at
  // the query rather than stripped after fetch - the same shape as the
  // `st_hidden` filtering on relationships.
  const PUBLIC_PROJECTION = { projection: { notes: 0 } };

  router.get('/', async (req, res) => {
    const docs = await col().find({}, PUBLIC_PROJECTION).sort({ name: 1 }).toArray();
    res.json(docs);
  });

  return router;
}
