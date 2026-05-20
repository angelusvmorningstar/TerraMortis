/**
 * /api/settings — global app settings (Epic STM, issue #378).
 *
 * Single-document collection `app_settings`, keyed _id: 'global'. Per
 * ADR-004 Rev 2 §D2, the settings doc is auto-seeded on first GET and
 * mutated via a whitelist-gated PATCH. No schemaless writes; unknown
 * keys 400.
 *
 * Currently the only flag is `st_mods_enabled` (the global kill-switch
 * for the STM overlay). Future flags piggyback by extending ALLOWED_KEYS
 * + VALIDATORS — each addition is a code change, not config.
 */

import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('app_settings');
const GLOBAL_ID = 'global';

const ALLOWED_KEYS = ['st_mods_enabled'];
const VALIDATORS = {
  st_mods_enabled: (v) => typeof v === 'boolean',
};

function defaultSettings() {
  return {
    _id: GLOBAL_ID,
    st_mods_enabled: true,
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
// creates a document.
router.get('/', requireRole('st'), async (req, res) => {
  const existing = await col().findOne({ _id: GLOBAL_ID });
  if (existing) return res.json(existing);

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
  res.json(result);
});

export default router;
