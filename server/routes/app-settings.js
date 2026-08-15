/**
 * /api/settings — global app settings (Epic STM, issue #378).
 *
 * Single-document collection `app_settings`, keyed _id: 'global'. Per
 * ADR-004 Rev 2 §D2, the settings doc is auto-seeded on first GET and
 * mutated via a whitelist-gated PATCH. No schemaless writes; unknown
 * keys 400.
 *
 * Two flags today: `st_mods_enabled` (the global kill-switch for the STM
 * overlay) and `game_in_progress` (gdx.5 — whether a game session is
 * currently live; gates game-day features like gdx.7's roll-spend
 * automation). Future flags piggyback by extending ALLOWED_KEYS +
 * VALIDATORS — each addition is a code change, not config.
 *
 * gdx.5: GET is open to any authenticated role (players need to read
 * game_in_progress); PATCH stays ST-only for both flags.
 */

import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { broadcastSettingsUpdate } from '../ws.js';

const router = Router();
const col = () => getCollection('app_settings');
const GLOBAL_ID = 'global';

const ALLOWED_KEYS = ['st_mods_enabled', 'game_in_progress'];
const VALIDATORS = {
  st_mods_enabled: (v) => typeof v === 'boolean',
  game_in_progress: (v) => typeof v === 'boolean',
};

function defaultSettings() {
  return {
    _id: GLOBAL_ID,
    st_mods_enabled: true,
    game_in_progress: false,
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

function creatorFromUser(user) {
  return {
    discord_id: String(user?.id || ''),
    discord_name: user?.global_name || user?.username || '',
  };
}

// ─── GET /api/settings ───────────────────────────────────────────────
// Returns the global settings doc, seeding with defaults if absent.
// Idempotent — only the very first call across the app's lifetime
// creates a document. gdx.5: open to any authenticated role (mount-level
// requireAuth in server/index.js already covers "must be logged in") —
// players need to read game_in_progress. Write stays ST-only below.
router.get('/', async (req, res) => {
  const existing = await col().findOne({ _id: GLOBAL_ID });
  if (existing) {
    // gdx.5 review finding: a doc that predates a given ALLOWED_KEYS entry
    // (this collection existed before game_in_progress; also reachable if
    // a PATCH ever lands before any GET, since PATCH's own upsert only
    // $setOnInsert's _id) would otherwise return that key as `undefined`
    // rather than its real default — self-heal on read. Audit fields
    // (updated_at/updated_by) are never touched here; they describe the
    // real last write, not a synthetic one.
    const defaults = defaultSettings();
    const merged = { ...existing };
    for (const key of ALLOWED_KEYS) {
      if (!(key in merged)) merged[key] = defaults[key];
    }
    return res.json(merged);
  }

  const seed = defaultSettings();
  try {
    await col().insertOne(seed);
  } catch (err) {
    // Race: another concurrent first-GET seeded between findOne and insertOne.
    // Duplicate-key on _id — read back the doc the other request seeded.
    if (err?.code === 11000) {
      const refetched = await col().findOne({ _id: GLOBAL_ID });
      if (refetched) return res.json(refetched);
    }
    throw err;
  }
  res.json(seed);
});

// ─── PATCH /api/settings ─────────────────────────────────────────────
// Partial update against the whitelist. Rejects unknown keys (400) and
// type-mismatched values (400). Stamps updated_at + updated_by. Auto-seeds
// the doc on first write if a PATCH lands before any GET (defensive — the
// common path is GET-then-PATCH but we don't require it).
router.patch('/', requireRole('st'), async (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body);
  if (keys.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'body is empty' });
  }

  for (const k of keys) {
    if (!ALLOWED_KEYS.includes(k)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'unknown key', key: k });
    }
    if (!VALIDATORS[k](body[k])) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'invalid value type for key', key: k });
    }
  }

  const update = {
    ...body,
    updated_at: new Date().toISOString(),
    updated_by: creatorFromUser(req.user),
  };

  const result = await col().findOneAndUpdate(
    { _id: GLOBAL_ID },
    { $set: update, $setOnInsert: { _id: GLOBAL_ID } },
    { returnDocument: 'after', upsert: true },
  );
  // gdx.5: broadcast on every successful PATCH (any key), not just
  // game_in_progress — the client's handler just refetches the whole
  // doc, so there is no benefit to threading "which key changed"
  // through this route, and it makes st_mods_enabled live-broadcast
  // too (a strict improvement — it previously had no live path at all).
  broadcastSettingsUpdate();
  res.json(result);
});

export default router;
