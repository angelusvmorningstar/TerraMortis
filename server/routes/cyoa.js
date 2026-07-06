/**
 * CYOA (Choose Your Own Adventure) routes (issue #971).
 *
 * Cross-project write-back: the CYOA player page fires a POST when a player
 * reaches a story ending. This route stores a single document per
 * (player_id, story_id) pair in the `cyoa_passages` collection. Replaying
 * an epilogue overwrites the prior record (upsert, $setOnInsert for created_at).
 *
 * Endpoints:
 *   POST /api/cyoa/passages   — authenticated (any role); upsert passage record
 *
 * No GET endpoint in v1 (scoped to v2).
 *
 * Unique index on { player_id: 1, story_id: 1 } is ensured at startup in
 * server/index.js after connectDb() resolves (option b per story design).
 */

import { Router } from 'express';
import { getCollection } from '../db.js';

const router = Router();

router.post('/passages', async (req, res) => {
  const { story_id, version, outcome, character, code } = req.body ?? {};

  // --- validation ---

  if (!story_id || typeof story_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'story_id is required' });
  }
  if (!/^[a-z0-9-]+$/.test(story_id)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'story_id must match ^[a-z0-9-]+$' });
  }
  if (story_id.length > 64) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'story_id must be 64 characters or fewer' });
  }

  if (!version || typeof version !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'version is required' });
  }
  if (version.length > 16) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'version must be 16 characters or fewer' });
  }

  if (!outcome || typeof outcome !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'outcome is required' });
  }
  if (outcome.length > 32) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'outcome must be 32 characters or fewer' });
  }

  if (character === undefined || character === null || typeof character !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character is required' });
  }
  if (character.length > 128) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character must be 128 characters or fewer' });
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'code is required' });
  }
  if (code.length > 4096) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'code must be 4096 characters or fewer' });
  }

  // --- upsert ---
  const col = getCollection('cyoa_passages');
  const now = new Date().toISOString();
  await col.updateOne(
    { player_id: req.user.player_id, story_id },
    {
      $set: { discord_id: req.user.id, character, story_id, version, outcome, code, updated_at: now },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );

  res.json({ ok: true });
});

export default router;
