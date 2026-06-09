/**
 * Routes for the per-cycle clan/covenant ranking ballot (#624).
 * Collection: ranking_ballots — one doc per { cycle_id, voter_character_id }.
 *
 * Auth model:
 *   - PUT /            player writes their OWN ballot (ownership-gated; ST may write any).
 *   - GET /mine        player reads their OWN ballot (ownership-gated).
 *   - GET /aggregate   ST ONLY — per-character clan/covenant points totals,
 *                      computed at request time (derived, never stored).
 *
 * Points: 1st = 5, 2nd = 4, 3rd = 3, 4th = 2, 5th = 1. Players never read the aggregate.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { rankingBallotSchema } from '../schemas/ranking_ballot.schema.js';

const router  = Router();
const col     = () => getCollection('ranking_ballots');
const charCol = () => getCollection('characters');

const SLOT_POINTS = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };

/** ST/dev may act on any character; a player only on their own. */
function owns(req, charId) {
  const role = req.user?.role;
  if (role === 'st' || role === 'dev') return true;
  return (req.user?.character_ids || []).map(String).includes(String(charId));
}

function toOid(id) { try { return new ObjectId(String(id)); } catch { return null; } }

// GET /api/ranking_ballots/mine?cycle_id=&voter= — player reads their own ballot
router.get('/mine', async (req, res) => {
  const cycleId = String(req.query.cycle_id || '');
  const voter   = String(req.query.voter || '');
  if (!cycleId || !voter) return res.status(400).json({ error: 'BAD_REQUEST', message: 'cycle_id and voter are required' });
  if (!owns(req, voter)) return res.status(403).json({ error: 'FORBIDDEN' });
  const doc = await col().findOne({ cycle_id: cycleId, voter_character_id: voter });
  res.json(doc || null);
});

// GET /api/ranking_ballots/aggregate?cycle_id=&mode= — ST ONLY: per-character points totals.
// mode=ranked (default): 5/4/3/2/1 by slot position.
// mode=political: each pick earns the voter's clan/covenant status regardless of position.
// Computed at request time (derived-never-stored). Players have NO read path here.
// Returns clan_points, clan_votes, clan_voter_count, covenant_points, covenant_votes, covenant_voter_count.
router.get('/aggregate', requireRole('st'), async (req, res) => {
  const cycleId = String(req.query.cycle_id || '');
  const mode    = req.query.mode === 'political' ? 'political' : 'ranked';
  if (!cycleId) return res.status(400).json({ error: 'BAD_REQUEST', message: 'cycle_id is required' });

  const ballots = await col().find({ cycle_id: cycleId }).toArray();

  // Fetch voter docs for both modes — needed for voter_count_by_org in ranked, and weights in political.
  const voterIds  = [...new Set(ballots.map(b => b.voter_character_id))].map(toOid).filter(Boolean);
  const voterDocs = voterIds.length ? await charCol().find({ _id: { $in: voterIds } }).toArray() : [];
  const voterById = new Map(voterDocs.map(d => [String(d._id), d]));

  // Count how many ballots were submitted by members of each clan/covenant.
  const clan_voter_count = {}, covenant_voter_count = {};
  for (const b of ballots) {
    const v = voterById.get(String(b.voter_character_id));
    if (!v) continue;
    if (v.clan)     clan_voter_count[v.clan]         = (clan_voter_count[v.clan]         || 0) + 1;
    if (v.covenant) covenant_voter_count[v.covenant] = (covenant_voter_count[v.covenant] || 0) + 1;
  }

  // Accumulates both the running total and the per-ballot contribution list.
  function addVote(pts, votes, cid, contribution) {
    if (!cid) return;
    const k = String(cid);
    pts[k] = (pts[k] || 0) + contribution;
    if (!votes[k]) votes[k] = [];
    votes[k].push(contribution);
  }

  const clan_points = {}, clan_votes = {};
  const covenant_points = {}, covenant_votes = {};

  if (mode === 'ranked') {
    for (const b of ballots) {
      for (const [slot, cid] of Object.entries(b.clan_ranking || {}))
        addVote(clan_points, clan_votes, cid, SLOT_POINTS[slot] || 0);
      for (const [slot, cid] of Object.entries(b.covenant_ranking || {}))
        addVote(covenant_points, covenant_votes, cid, SLOT_POINTS[slot] || 0);
    }
  } else {
    // Political: weight = voter's clan/covenant status; position is irrelevant.
    for (const b of ballots) {
      const voter = voterById.get(String(b.voter_character_id));
      if (!voter) continue;
      const clanWeight = voter.status?.clan || 0;
      const covWeight  = voter.status?.covenant?.[voter.covenant] || 0;
      for (const cid of Object.values(b.clan_ranking || {}))
        addVote(clan_points, clan_votes, cid, clanWeight);
      for (const cid of Object.values(b.covenant_ranking || {}))
        addVote(covenant_points, covenant_votes, cid, covWeight);
    }
  }

  // Sort contributions descending so breakdown reads highest-first.
  for (const arr of Object.values(clan_votes))     arr.sort((a, b) => b - a);
  for (const arr of Object.values(covenant_votes)) arr.sort((a, b) => b - a);

  res.json({ clan_points, clan_votes, clan_voter_count, covenant_points, covenant_votes, covenant_voter_count });
});

// PUT /api/ranking_ballots — player writes (upserts) their own ballot for a cycle.
router.put('/', validate(rankingBallotSchema), async (req, res) => {
  const cycleId = String(req.body.cycle_id);
  const voter   = String(req.body.voter_character_id);
  if (!owns(req, voter)) return res.status(403).json({ error: 'FORBIDDEN' });

  const clanRanking = req.body.clan_ranking || {};
  const covRanking  = req.body.covenant_ranking || {};

  const voterOid = toOid(voter);
  if (!voterOid) return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid voter id' });
  const voterDoc = await charCol().findOne({ _id: voterOid });
  if (!voterDoc) return res.status(404).json({ error: 'NOT_FOUND', message: 'voter character not found' });

  // Resolve every picked character once.
  const pickedIds = [...Object.values(clanRanking), ...Object.values(covRanking)].filter(Boolean).map(String);
  const pickedOids = pickedIds.map(toOid);
  if (pickedOids.some(o => o === null)) return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid character id in a ranking' });
  const docs = pickedOids.length ? await charCol().find({ _id: { $in: pickedOids } }).toArray() : [];
  const byId = new Map(docs.map(d => [String(d._id), d]));

  const voterClan = voterDoc.clan || '';
  const voterCov  = voterDoc.covenant || '';
  const inClan = (cid) => { const d = byId.get(cid); return !!(d && d.clan && d.clan === voterClan); };
  const inCov  = (cid) => { const d = byId.get(cid); return !!(d && (d.covenant === voterCov || (d.status?.covenant?.[voterCov] || 0) > 0)); };

  // Clean a ranking (partial allowed) while enforcing self-exclusion + distinct + membership.
  // Returns the cleaned {slot:charId} object, or a string error message.
  function clean(ranking, isMember, label) {
    const out = {};
    const seen = new Set();
    for (const slot of ['1', '2', '3', '4', '5']) {
      const raw = ranking[slot];
      if (raw == null || raw === '') continue;        // empty slot — scores nothing
      const cid = String(raw);
      if (cid === voter)   return `you cannot rank yourself in the ${label}`;
      if (seen.has(cid))   return `the ${label} has the same character twice`;
      if (!isMember(cid))  return `the ${label} includes a character outside your ${label.split(' ')[0]}`;
      seen.add(cid);
      out[slot] = cid;
    }
    return out;
  }

  const clanClean = clean(clanRanking, inClan, 'clan ranking');
  if (typeof clanClean === 'string') return res.status(400).json({ error: 'BAD_REQUEST', message: clanClean });
  const covClean = clean(covRanking, inCov, 'covenant ranking');
  if (typeof covClean === 'string') return res.status(400).json({ error: 'BAD_REQUEST', message: covClean });

  await col().findOneAndUpdate(
    { cycle_id: cycleId, voter_character_id: voter },
    { $set: { cycle_id: cycleId, voter_character_id: voter, clan_ranking: clanClean, covenant_ranking: covClean, updated_at: new Date() } },
    { upsert: true },
  );
  res.json({ ok: true });
});

export default router;
