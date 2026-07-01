// fix-cycle-status-desync.mjs — one-off data fix (2026-06-25)
//
// PROBLEM: the player downtime form reads a cycle's RAW stored `status` field, while the admin
// Cycle tab derives status from `game_phase` via deriveCycleStatus(). The "Downtime" phase button
// only writes `game_phase` and never persists the derived `status`, so the two drifted:
//   - Game 5: game_phase='downtime' (admin: active) but stored status='prep' -> player form sees it
//     as closed, so DT5 never opened to players.
//   - Game 4: stored status='active' + manual_open=true (latched, never cleared) -> the player form's
//     cycle picker (active > game > prep > closed) lands on the stale Game 4 ahead of Game 5.
//
// FIX: realign the stored `status` with the intended `game_phase` for these two cycles, so every
// reader (player form on raw status, admin on derived) agrees:
//   - Game 4 -> game_phase 'processing', status 'closed', manual_open false  (done / not picked)
//   - Game 5 -> game_phase 'downtime',  status 'active'                       (downtimes open)
//
// This is a stopgap for the DATA. The real code fix (persist status = deriveCycleStatus() on the
// downtime_cycles write path, and have the player form derive defensively) is separate.
//
// SAFETY: dry-run by default — prints the before/after diff and changes NOTHING. Pass --apply to
// write. Touches ONLY game_number 4 and 5 in tm_suite.downtime_cycles. Reversible: re-run with the
// original values if needed (printed below).
//
//   Dry run:  node server/scripts/fix-cycle-status-desync.mjs
//   Apply:    node server/scripts/fix-cycle-status-desync.mjs --apply

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MongoClient } from 'mongodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Root .env (TM Suite/.env). Falls back to an already-exported MONGODB_URI.
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;
if (!URI) { console.error('No MONGODB_URI (root .env or env var).'); process.exit(1); }

// Mirror of public/js/downtime/db.js deriveCycleStatus — used only to SHOW that the new stored
// status matches what the admin derives. Not used to compute the write (the write is explicit).
function deriveCycleStatus(cy) {
  if (cy?.game_phase === 'game')       return 'game';
  if (cy?.game_phase === 'downtime')   return 'active';
  if (cy?.game_phase === 'processing') return 'closed';
  const ps = cy?.phase_signoff || {};
  if (ps.projects) return 'closed';
  if (cy?.manual_open === true) return 'active';
  if (!ps.prep) return 'prep';
  if (!ps.city) return 'game';
  return 'active';
}

// The intended end state for each affected cycle.
const FIXES = [
  { game_number: 4, intent: 'Game 4 is done -> Processing / closed; clear the stale manual_open latch',
    set: { game_phase: 'processing', status: 'closed', manual_open: false } },
  { game_number: 5, intent: 'Game 5 downtimes OPEN to players (Downtime phase -> active)',
    set: { game_phase: 'downtime', status: 'active' } },
];

// Player-open verdict (mirrors downtime-form.js _gateBlocks for a general, non-ST player).
function playerOpen(cy, now) {
  if (!cy) return false;
  if (cy.status !== 'active') return false;                 // _formStatuses = ['active'] for players
  if (cy.deadline_at && new Date(cy.deadline_at) < now) {   // deadline-past clause
    if (cy.manual_open !== true) return false;
  }
  return true;
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const col = client.db('tm_suite').collection('downtime_cycles');
  const now = new Date();

  console.log(`\n=== Cycle status desync fix — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'} ===\n`);

  for (const fix of FIXES) {
    const cy = await col.findOne({ game_number: fix.game_number });
    if (!cy) { console.log(`game ${fix.game_number}: NOT FOUND — skipped\n`); continue; }

    const before = { status: cy.status, game_phase: cy.game_phase ?? null, manual_open: cy.manual_open ?? null };
    const after  = { ...before, ...fix.set };

    console.log(`Game ${fix.game_number} — "${cy.label || ''}"`);
    console.log(`  intent : ${fix.intent}`);
    console.log(`  before : status=${before.status}  game_phase=${before.game_phase}  manual_open=${before.manual_open}  (deriveCycleStatus=${deriveCycleStatus(cy)})  player-open=${playerOpen(cy, now)}`);
    console.log(`  after  : status=${after.status}  game_phase=${after.game_phase}  manual_open=${after.manual_open}  (deriveCycleStatus=${deriveCycleStatus({ ...cy, ...fix.set })})  player-open=${playerOpen({ ...cy, ...fix.set }, now)}`);
    console.log(`  revert : { status: '${before.status}', game_phase: ${before.game_phase === null ? 'null' : `'${before.game_phase}'`}, manual_open: ${before.manual_open} }`);

    if (APPLY) {
      const res = await col.updateOne({ _id: cy._id }, { $set: { ...fix.set, updated_at: now } });
      console.log(`  -> written (matched ${res.matchedCount}, modified ${res.modifiedCount})`);
    }
    console.log('');
  }

  if (!APPLY) {
    console.log('DRY RUN complete — nothing was written. Re-run with --apply to commit.\n');
  } else {
    console.log('Done. Re-open the player downtime form: Game 5 should now be the open cycle.\n');
    console.log('Note: this fixes the DATA only. Setting "Downtime" in the Cycle tab will still not');
    console.log('persist `status` until the code fix lands — so if you re-toggle phases, re-check status.\n');
  }
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
