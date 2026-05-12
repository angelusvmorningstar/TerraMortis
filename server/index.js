import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { connectDb, closeDb, isConnected, getDb } from './db.js';
import { verifyRulesEngine, formatMissingReport, formatPassReport } from './scripts/rules-verify/verify-rules-engine.js';
import authRouter from './routes/auth.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import charactersRouter from './routes/characters.js';
import territoriesRouter from './routes/territories.js';
import trackerRouter from './routes/tracker.js';
import sessionsRouter from './routes/sessions.js';
import { cyclesRouter, submissionsRouter, projectInvitationsRouter } from './routes/downtime.js';
import investigationsRouter from './routes/investigations.js';
import npcsRouter from './routes/npcs.js';
import relationshipsRouter from './routes/relationships.js';
import npcFlagsRouter from './routes/npc-flags.js';
import gameSessionsRouter, { getNextSession } from './routes/game-sessions.js';
import playersRouter from './routes/players.js';
import questionnaireRouter from './routes/questionnaire.js';
import historyRouter from './routes/history.js';
import ordealResponsesRouter from './routes/ordeal-responses.js';
import ordealSubmissionsRouter from './routes/ordeal-submissions.js';
import ordealRubricsRouter from './routes/ordeal-rubrics.js';
import attendanceRouter from './routes/attendance.js';
import archiveDocumentsRouter from './routes/archive-documents.js';
import ticketsRouter from './routes/tickets.js';
import rulesRouter from './routes/rules.js';
import {
  grantRouter, specialityGrantRouter, skillBonusRouter, nineAgainRouter,
  discAttrRouter, derivedStatModRouter, tierBudgetRouter, statusFloorRouter,
} from './routes/rules-engine.js';
import adminMigrationsRouter from './routes/admin-migrations.js';
import contestedRollsRouter from './routes/contested-rolls.js';
import { attachWS } from './ws.js';
// NOTE: The old /api/pdf route was removed. Character sheet PDFs are now
// rendered client-side via public/js/print/. See
// specs/guidance/pdf-target/PRIOR-ART.md for the post-mortem on why the
// server-side pdfkit approach failed on Render.

const app = express();

// CORS v3 manual middleware — NO cors package
const allowedOrigins = config.CORS_ORIGIN.split(',').map(o => o.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || config.NODE_ENV !== 'production')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

// Health check — proves DB connectivity
app.get('/api/health', (req, res) => {
  const dbStatus = isConnected() ? 'connected' : 'disconnected';
  const httpStatus = dbStatus === 'connected' ? 200 : 503;
  res.status(httpStatus).json({ status: dbStatus === 'connected' ? 'ok' : 'error', db: dbStatus });
});

// Auth routes (public — no middleware)
app.use('/api/auth', authRouter);

// Protected routes — require valid token (role resolved from players collection)
// Characters and downtime submissions have internal role filtering (ST vs player)
app.use('/api/characters', requireAuth, charactersRouter);
app.use('/api/downtime_cycles', requireAuth, cyclesRouter);
app.use('/api/downtime_submissions', requireAuth, submissionsRouter);
app.use('/api/project_invitations', requireAuth, projectInvitationsRouter);
app.use('/api/players', requireAuth, playersRouter);
app.use('/api/questionnaire', requireAuth, questionnaireRouter);
app.use('/api/history', requireAuth, historyRouter);
app.use('/api/ordeal-responses', requireAuth, ordealResponsesRouter);
app.use('/api/ordeal_submissions', requireAuth, ordealSubmissionsRouter);
app.use('/api/ordeal_rubrics', requireAuth, ordealRubricsRouter);
app.use('/api/attendance', requireAuth, attendanceRouter);
app.use('/api/archive_documents', requireAuth, archiveDocumentsRouter);
app.use('/api/tickets', requireAuth, ticketsRouter);
// Rules engine — must mount before /api/rules (purchasable_powers) so Express
// routes /api/rules/grant etc. to the engine, not the /:key wildcard.
const RE_ST = [requireAuth, requireRole('st')];
app.use('/api/rules/grant',                  ...RE_ST, grantRouter);
app.use('/api/rules/speciality_grant',       ...RE_ST, specialityGrantRouter);
app.use('/api/rules/skill_bonus',            ...RE_ST, skillBonusRouter);
app.use('/api/rules/nine_again',             ...RE_ST, nineAgainRouter);
app.use('/api/rules/disc_attr',              ...RE_ST, discAttrRouter);
app.use('/api/rules/derived_stat_modifier',  ...RE_ST, derivedStatModRouter);
app.use('/api/rules/tier_budget',            ...RE_ST, tierBudgetRouter);
app.use('/api/rules/status_floor',           ...RE_ST, statusFloorRouter);
app.use('/api/rules', requireAuth, rulesRouter);
app.use('/api/contested_roll_requests', requireAuth, contestedRollsRouter);

// /api/pdf removed — PDF generation moved client-side to public/js/print/.
// Stale browsers calling the old endpoint get a 410 Gone with a refresh hint.
app.all('/api/pdf/*path', (req, res) => {
  res.status(410).json({
    error: 'GONE',
    message: 'PDF generation has moved client-side. Hard-refresh the page (Ctrl+Shift+R / Cmd+Shift+R) to load the new renderer.',
  });
});

// Public game session endpoint — used by website banner (no auth)
app.get('/api/game_sessions/next', getNextSession);

// Territories — GET open to all authenticated users; writes are ST-only (enforced in router)
app.use('/api/territories', requireAuth, territoriesRouter);
// Tracker — auth required; players can only read/write own characters (enforced in router)
app.use('/api/tracker_state', requireAuth, trackerRouter);
app.use('/api/session_logs', requireAuth, requireRole('st'), sessionsRouter);
// Coordinator tier: needs read/write for check-in (fin.3) and finance (fin.4).
// requireRole('coordinator') implicitly allows st/dev too.
app.use('/api/game_sessions', requireAuth, requireRole('coordinator'), gameSessionsRouter);
app.use('/api/downtime_investigations', requireAuth, investigationsRouter);
app.use('/api/npcs', requireAuth, npcsRouter);
app.use('/api/relationships', requireAuth, relationshipsRouter);
app.use('/api/npc-flags', requireAuth, npcFlagsRouter);
app.use('/api/admin', requireAuth, requireRole('st'), adminMigrationsRouter);

// Start server first, then attempt DB connection
// Server must be reachable even if MongoDB is unavailable
async function start() {
  const server = app.listen(config.PORT, () => {
    console.log(`TM Suite API running on port ${config.PORT} (${config.NODE_ENV})`);
  });

  // Attach WebSocket server for live tracker sync
  attachWS(server);

  try {
    await connectDb();
    await runRulesEngineGate();
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    console.error('Health check will report disconnected status');
  }
}

// Verify the rules-engine seed state matches expected_sources.json. In
// production a missing tuple silently breaks XP/derived-stat calculations
// (RDE-3 PT XP refund regression) — fail boot so the deploy goes red instead
// of shipping silently broken behaviour. In dev/test we warn and continue so
// a fresh laptop without seed data can still boot.
async function runRulesEngineGate() {
  const dbName = process.env.MONGODB_DB || 'tm_suite';
  const result = await verifyRulesEngine(getDb());
  if (result.ok) {
    console.log(formatPassReport(result.counts, dbName));
    return;
  }
  if (config.NODE_ENV === 'production') {
    console.error('CRITICAL: rules-engine verification failed — refusing to boot.');
    console.error(formatMissingReport(result.missing, dbName));
    process.exit(1);
  }
  console.warn('WARNING: rules-engine verification failed (non-production — continuing).');
  console.warn(formatMissingReport(result.missing, dbName));
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`);
  closeDb().then(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
