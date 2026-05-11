/**
 * Test helper — creates an Express app with auth bypass.
 * Instead of validating Discord tokens, injects req.user directly.
 */

import express from 'express';
import cors from 'cors';
import { requireRole } from '../../middleware/auth.js';
import { cacheControl, noCache } from '../../middleware/cache-control.js';
import charactersRouter from '../../routes/characters.js';
import territoriesRouter from '../../routes/territories.js';
import { cyclesRouter, submissionsRouter, projectInvitationsRouter } from '../../routes/downtime.js';
import gameSessionsRouter from '../../routes/game-sessions.js';
import playersRouter from '../../routes/players.js';
import attendanceRouter from '../../routes/attendance.js';
import trackerRouter from '../../routes/tracker.js';
import ordealSubmissionsRouter from '../../routes/ordeal-submissions.js';
import archiveDocumentsRouter from '../../routes/archive-documents.js';
import rulesRouter from '../../routes/rules.js';
import {
  grantRouter, specialityGrantRouter, skillBonusRouter, nineAgainRouter, rulesAggregateRouter,
  discAttrRouter, derivedStatModRouter, tierBudgetRouter, statusFloorRouter,
} from '../../routes/rules-engine.js';
import relationshipsRouter from '../../routes/relationships.js';
import npcFlagsRouter from '../../routes/npc-flags.js';
import npcsRouter from '../../routes/npcs.js';

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

  // Protected routes with mock auth.
  // Issue #255: mirror prod Cache-Control discipline so tests can assert
  // the headers are wired correctly through the same middleware stack.
  const CACHE_5MIN = cacheControl(300);
  app.use('/api/characters', mockAuth, noCache(), charactersRouter);
  app.use('/api/downtime_cycles', mockAuth, noCache(), cyclesRouter);
  app.use('/api/downtime_submissions', mockAuth, noCache(), submissionsRouter);
  app.use('/api/project_invitations', mockAuth, noCache(), projectInvitationsRouter);
  app.use('/api/players', mockAuth, noCache(), playersRouter);
  app.use('/api/attendance', mockAuth, noCache(), attendanceRouter);

  // Territories — matches prod: auth required at app level; write gating is
  // inside the router (POST/PUT ST-only, PATCH /:id/feeding-rights regent+ST).
  app.use('/api/territories', mockAuth, CACHE_5MIN, territoriesRouter);
  // ST-only routes
  app.use('/api/game_sessions', mockAuth, requireRole('coordinator'), noCache(), gameSessionsRouter);
  app.use('/api/tracker_state', mockAuth, requireRole('st'), noCache(), trackerRouter);
  app.use('/api/ordeal_submissions', mockAuth, noCache(), ordealSubmissionsRouter);
  app.use('/api/archive_documents', mockAuth, noCache(), archiveDocumentsRouter);
  // Rules engine — must mount before /api/rules (purchasable_powers)
  const reRoleST = requireRole('st');
  app.use('/api/rules/grant',                 mockAuth, reRoleST, CACHE_5MIN, grantRouter);
  app.use('/api/rules/speciality_grant',      mockAuth, reRoleST, CACHE_5MIN, specialityGrantRouter);
  app.use('/api/rules/skill_bonus',           mockAuth, reRoleST, CACHE_5MIN, skillBonusRouter);
  app.use('/api/rules/nine_again',            mockAuth, reRoleST, CACHE_5MIN, nineAgainRouter);
  app.use('/api/rules/disc_attr',             mockAuth, reRoleST, CACHE_5MIN, discAttrRouter);
  app.use('/api/rules/derived_stat_modifier', mockAuth, reRoleST, CACHE_5MIN, derivedStatModRouter);
  app.use('/api/rules/tier_budget',           mockAuth, reRoleST, CACHE_5MIN, tierBudgetRouter);
  app.use('/api/rules/status_floor',          mockAuth, reRoleST, CACHE_5MIN, statusFloorRouter);
  // Issue #265 (rebase): aggregate endpoint same content as per-category
  // routes — mounted with the same CACHE_5MIN wiring.
  app.use('/api/rules/aggregate',             mockAuth, reRoleST, CACHE_5MIN, rulesAggregateRouter);
  app.use('/api/rules', mockAuth, CACHE_5MIN, rulesRouter);
  app.use('/api/relationships', mockAuth, noCache(), relationshipsRouter);
  app.use('/api/npcs', mockAuth, noCache(), npcsRouter);
  app.use('/api/npc-flags', mockAuth, noCache(), npcFlagsRouter);

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

/** Build X-Test-User header for a coordinator user (fin.1) */
export function coordinatorUser(overrides = {}) {
  return JSON.stringify({
    id: 'test-coord-001',
    username: 'test_coord',
    role: 'coordinator',
    player_id: 'p-coord-001',
    character_ids: [],
    ...overrides,
  });
}
