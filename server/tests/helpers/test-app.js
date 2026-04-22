/**
 * Test helper — creates an Express app with auth bypass.
 * Instead of validating Discord tokens, injects req.user directly.
 */

import express from 'express';
import cors from 'cors';
import { requireRole } from '../../middleware/auth.js';
import charactersRouter from '../../routes/characters.js';
import territoriesRouter from '../../routes/territories.js';
import { cyclesRouter, submissionsRouter } from '../../routes/downtime.js';
import gameSessionsRouter from '../../routes/game-sessions.js';
import playersRouter from '../../routes/players.js';
import residencyRouter from '../../routes/territory-residency.js';
import attendanceRouter from '../../routes/attendance.js';
import trackerRouter from '../../routes/tracker.js';
import ordealSubmissionsRouter from '../../routes/ordeal-submissions.js';
import archiveDocumentsRouter from '../../routes/archive-documents.js';
import rulesRouter from '../../routes/rules.js';

/**
 * Create a test app with a mock user injected via header.
 * Pass X-Test-User header as JSON to set req.user.
 */
export function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Mock auth middleware — reads user from X-Test-User header
  function mockAuth(req, res, next) {
    const header = req.headers['x-test-user'];
    if (!header) {
      return res.status(401).json({ error: 'AUTH_ERROR', message: 'Authentication required' });
    }
    try {
      req.user = JSON.parse(header);
    } catch {
      return res.status(401).json({ error: 'AUTH_ERROR', message: 'Invalid test user header' });
    }
    next();
  }

  // Health check
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Protected routes with mock auth
  app.use('/api/characters', mockAuth, charactersRouter);
  app.use('/api/downtime_cycles', mockAuth, cyclesRouter);
  app.use('/api/downtime_submissions', mockAuth, submissionsRouter);
  app.use('/api/players', mockAuth, playersRouter);
  app.use('/api/territory-residency', mockAuth, residencyRouter);
  app.use('/api/attendance', mockAuth, attendanceRouter);

  // ST-only routes
  app.use('/api/territories', mockAuth, requireRole('st'), territoriesRouter);
  app.use('/api/game_sessions', mockAuth, requireRole('st'), gameSessionsRouter);
  app.use('/api/tracker_state', mockAuth, requireRole('st'), trackerRouter);
  app.use('/api/ordeal_submissions', mockAuth, ordealSubmissionsRouter);
  app.use('/api/archive_documents', mockAuth, archiveDocumentsRouter);
  app.use('/api/rules', mockAuth, rulesRouter);

  return app;
}

/** Build X-Test-User header for an ST user */
export function stUser(overrides = {}) {
  return JSON.stringify({
    id: 'test-st-001',
    username: 'test_st',
    role: 'st',
    player_id: 'p-st-001',
    character_ids: [],
    ...overrides,
  });
}

/** Build X-Test-User header for a player user */
export function playerUser(characterIds = [], overrides = {}) {
  return JSON.stringify({
    id: 'test-player-001',
    username: 'test_player',
    role: 'player',
    player_id: 'p-player-001',
    character_ids: characterIds,
    ...overrides,
  });
}
