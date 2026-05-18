import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { connectDb, closeDb, isConnected, getDb } from './db.js';
import { verifyRulesEngine, formatMissingReport, formatPassReport } from './scripts/rules-verify/verify-rules-engine.js';
import authRouter from './routes/auth.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { cacheControl, noCache } from './middleware/cache-control.js';
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
  grantRouter, specialityGrantRouter, skillBonusRouter, nineAgainRouter, rulesAggregateRouter,
  discAttrRouter, derivedStatModRouter, tierBudgetRouter, statusFloorRouter,
} from './routes/rules-engine.js';
import adminMigrationsRouter from './routes/admin-migrations.js';
import contestedRollsRouter from './routes/contested-rolls.js';
import stModsRouter, { auditRouter as stModAuditRouter } from './routes/st_mods.js';
import appSettingsRouter from './routes/app-settings.js';
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
//
// Issue #255 (perf, 2026-05-11): explicit Cache-Control discipline.
// Endpoints whose data varies per user (mine=1 vs ST sees all) or
// mutates frequently are marked `no-cache` so browsers always
// revalidate. Read-only / slowly-changing endpoints (rule docs,
// territory list) get `private, max-age=300` for in-session reuse.
app.use('/api/characters', requireAuth, noCache(), charactersRouter);
app.use('/api/downtime_cycles', requireAuth, noCache(), cyclesRouter);
app.use('/api/downtime_submissions', requireAuth, noCache(), submissionsRouter);
app.use('/api/project_invitations', requireAuth, noCache(), projectInvitationsRouter);
app.use('/api/players', requireAuth, noCache(), playersRouter);
app.use('/api/questionnaire', requireAuth, noCache(), questionnaireRouter);
app.use('/api/history', requireAuth, noCache(), historyRouter);
app.use('/api/ordeal-responses', requireAuth, noCache(), ordealResponsesRouter);
app.use('/api/ordeal_submissions', requireAuth, noCache(), ordealSubmissionsRouter);
app.use('/api/ordeal_rubrics', requireAuth, noCache(), ordealRubricsRouter);
app.use('/api/attendance', requireAuth, noCache(), attendanceRouter);
app.use('/api/archive_documents', requireAuth, noCache(), archiveDocumentsRouter);
app.use('/api/tickets', requireAuth, noCache(), ticketsRouter);
// Rules engine — must mount before /api/rules (purchasable_powers) so Express
// routes /api/rules/grant etc. to the engine, not the /:key wildcard.
//
// Issue #255: rule docs change rarely (only via ST writes in the admin
// Rules Data view, which calls invalidateRulesCache() to flush the
// client-side cache on update). Safe to mark cacheable for 5 minutes
// — STs editing rules see their own writes via the client's in-memory
// cache invalidation; other users see new values within one max-age
// window after a server-side change.
const RE_ST = [requireAuth, requireRole('st')];
const CACHE_5MIN = cacheControl(300);
app.use('/api/rules/grant',                  ...RE_ST, CACHE_5MIN, grantRouter);
app.use('/api/rules/speciality_grant',       ...RE_ST, CACHE_5MIN, specialityGrantRouter);
app.use('/api/rules/skill_bonus',            ...RE_ST, CACHE_5MIN, skillBonusRouter);
app.use('/api/rules/nine_again',             ...RE_ST, CACHE_5MIN, nineAgainRouter);
app.use('/api/rules/disc_attr',              ...RE_ST, CACHE_5MIN, discAttrRouter);
app.use('/api/rules/derived_stat_modifier',  ...RE_ST, CACHE_5MIN, derivedStatModRouter);
app.use('/api/rules/tier_budget',            ...RE_ST, CACHE_5MIN, tierBudgetRouter);
app.use('/api/rules/status_floor',           ...RE_ST, CACHE_5MIN, statusFloorRouter);
// Issue #256 (perf): aggregated rules-engine endpoint — coalesces the
// 7 per-category endpoints into a single round-trip for `preloadRules`.
// Mounted before `/api/rules` (purchasable powers) so Express routes
// `/api/rules/aggregate` to this router, not the wildcard.
//
// Issue #265 (rebase-resolution): the aggregate endpoint serves the
// same rule-doc content the 7 per-category endpoints do, just merged
// into one response — so it gets the same CACHE_5MIN treatment.
// Closes #265's one-line follow-up as part of this rebase.
app.use('/api/rules/aggregate',              ...RE_ST, CACHE_5MIN, rulesAggregateRouter);
app.use('/api/rules', requireAuth, CACHE_5MIN, rulesRouter);
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

// Territories — GET open to all authenticated users; writes are ST-only (enforced in router).
// Issue #255: same data for every reader (no per-user filtering) and
// changes rarely. Cacheable for 5 minutes. ST writes invalidate the
// client cache on save.
app.use('/api/territories', requireAuth, CACHE_5MIN, territoriesRouter);
// Tracker — auth required; players can only read/write own characters (enforced in router).
// Issue #255: per-user state (own characters) and mutates on every roll → no-cache.
app.use('/api/tracker_state', requireAuth, noCache(), trackerRouter);
app.use('/api/session_logs', requireAuth, requireRole('st'), noCache(), sessionsRouter);
// Coordinator tier: needs read/write for check-in (fin.3) and finance (fin.4).
// requireRole('coordinator') implicitly allows st/dev too.
// Issue #255: live session state → no-cache.
app.use('/api/game_sessions', requireAuth, requireRole('coordinator'), noCache(), gameSessionsRouter);
app.use('/api/downtime_investigations', requireAuth, noCache(), investigationsRouter);
app.use('/api/npcs', requireAuth, noCache(), npcsRouter);
app.use('/api/relationships', requireAuth, noCache(), relationshipsRouter);
app.use('/api/npc-flags', requireAuth, noCache(), npcFlagsRouter);
app.use('/api/admin', requireAuth, requireRole('st'), noCache(), adminMigrationsRouter);
// Epic STM (issue #358): ST mod overlay foundation. ST-auth gated at the
// router level (requireRole('st')); requireAuth must run first to populate
// req.user. no-cache since mods mutate frequently from the admin panel.
app.use('/api/st_mods', requireAuth, noCache(), stModsRouter);
app.use('/api/st_mod_audit', requireAuth, noCache(), stModAuditRouter);
// Epic STM (issue #378): global app settings (kill-switch lives here).
// ST-auth at router level; requireAuth populates req.user. no-cache since
// PATCH from the STM-5 admin panel needs to surface to all readers without
// stale-cache lag.
app.use('/api/settings', requireAuth, noCache(), appSettingsRouter);

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
