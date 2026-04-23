import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { connectDb, closeDb, isConnected } from './db.js';
import authRouter from './routes/auth.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import charactersRouter from './routes/characters.js';
import territoriesRouter from './routes/territories.js';
import trackerRouter from './routes/tracker.js';
import sessionsRouter from './routes/sessions.js';
import { cyclesRouter, submissionsRouter } from './routes/downtime.js';
import investigationsRouter from './routes/investigations.js';
import npcsRouter from './routes/npcs.js';
import gameSessionsRouter, { getNextSession } from './routes/game-sessions.js';
import playersRouter from './routes/players.js';
import questionnaireRouter from './routes/questionnaire.js';
import historyRouter from './routes/history.js';
import ordealResponsesRouter from './routes/ordeal-responses.js';
import ordealSubmissionsRouter from './routes/ordeal-submissions.js';
import ordealRubricsRouter from './routes/ordeal-rubrics.js';
import residencyRouter from './routes/territory-residency.js';
import attendanceRouter from './routes/attendance.js';
import archiveDocumentsRouter from './routes/archive-documents.js';
import ticketsRouter from './routes/tickets.js';
import rulesRouter from './routes/rules.js';
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
app.use('/api/players', requireAuth, playersRouter);
app.use('/api/questionnaire', requireAuth, questionnaireRouter);
app.use('/api/history', requireAuth, historyRouter);
app.use('/api/ordeal-responses', requireAuth, ordealResponsesRouter);
app.use('/api/ordeal_submissions', requireAuth, ordealSubmissionsRouter);
app.use('/api/ordeal_rubrics', requireAuth, ordealRubricsRouter);
app.use('/api/territory-residency', requireAuth, residencyRouter);
app.use('/api/attendance', requireAuth, attendanceRouter);
app.use('/api/archive_documents', requireAuth, archiveDocumentsRouter);
app.use('/api/tickets', requireAuth, ticketsRouter);
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
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    console.error('Health check will report disconnected status');
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`);
  closeDb().then(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
