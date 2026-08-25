import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { contestedRollRequestSchema } from '../schemas/contested_roll_request.schema.js';
import { calcEffectiveCityStatus } from '../../public/js/data/city-status-calc.js';
import { findRegentTerritory } from '../../public/js/data/helpers.js';
import { currentCycleInGamePhase } from '../../public/js/downtime/cycle-phase.js';

const router = Router();
const col     = () => getCollection('contested_roll_requests');
const logCol  = () => getCollection('session_logs');

// POST /api/contested_roll_requests — player creates a challenge
router.post('/', validate(contestedRollRequestSchema), async (req, res) => {
  const { challenger_character_id } = req.body;

  // Challenger must own the character they're challenging as
  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.includes(challenger_character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Character does not belong to you' });
  }

  // crd.1: request_type is set explicitly, AFTER the req.body spread, so the
  // route is always the authority on it. Before this story a plain contested
  // roll carried NO request_type at all, and every guard against Status
  // Actions sharing this collection worked only because absence happens to
  // satisfy `$ne: 'status_action'` — the same implicit-discriminator
  // fragility that produced the oaq.3 void-orphaning bug (see PUT /:id/void).
  const doc = {
    ...req.body,
    request_type: 'contested_roll',
    status:     'pending',
    outcome:    null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // crd.1 (external code review). `defender_aspect`, `defender_wp_spent` and
  // `defender_merit_ids` are the DEFENDER's own submitted resolution choices —
  // AC3's literal rule is that they "only ever get populated later, by crd.3a,
  // not by this story or by POST /". The `...req.body` spread above let the
  // ATTACKER assert all three at creation, which is the same injury as the
  // attacker-writable `defender_pool` this whole epic exists to remove: an
  // attacker-authored value would sit in stored pending data looking like the
  // defender's own choice. Stripped AFTER the spread, the same way
  // `request_type` is force-set after it, so the route is always the authority.
  // The schema still LISTS them (additionalProperties: false, and crd.3a's
  // resolve endpoint writes them) — they are simply never honoured here.
  // crd.4a review (external Codex, Pass 2): defender_status_term is the same
  // shape of defender-owned field and was missed from this list when the
  // schema grew it — an attacker could otherwise pre-populate a bogus
  // "defender's choice" into a pending document before the defender ever
  // acts. /resolve still overwrites it before any pool is finalised, so this
  // could not change a final roll's outcome, but it violated the same
  // provenance boundary the other three fields exist to protect.
  for (const f of ['defender_aspect', 'defender_wp_spent', 'defender_merit_ids', 'defender_status_term']) delete doc[f];

  const result  = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// GET /api/contested_roll_requests/mine — pending challenges targeting me
router.get('/mine', async (req, res) => {
  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.length) return res.json([]);

  // crd.1 route audit: this query had NO request_type clause at all. It was
  // safe only by accident — office-actions.js writes `target_id`, not
  // `target_character_id`, so a Status Action simply never matched the field
  // name. Any future writer adding a target_character_id to a status_action
  // (or a fourth request_type sharing this collection) would have leaked
  // straight into a player's own queue. Scoped positively rather than as
  // `$ne: 'status_action'`: `$in: [null, 'contested_roll']` matches legacy
  // documents (request_type absent — everything written before crd.1) and new
  // explicit ones, and nothing else.
  const docs = await col()
    .find({
      target_character_id: { $in: charIds },
      status: 'pending',
      request_type: { $in: [null, 'contested_roll'] },
    })
    .sort({ created_at: -1 })
    .toArray();

  res.json(docs);
});

// crd.3a: Resistance Attribute for each defensive aspect. Effective rating is
// read as dots + bonus directly off the live character document (this
// project's "effective ratings" convention, CLAUDE.md) — no client accessor
// is imported here, since public/js/data/accessors.js is browser-coupled
// (bloodlines cache, rule-engine cache) and unsuitable for server-side use.
//
// crd.3a code review (external Codex, Pass 2/3a): a plain object's truthy
// lookup accepts inherited Object.prototype keys ('toString', 'constructor',
// '__proto__' all resolve truthily) as if they were valid aspects. ASPECT_KEYS
// is checked with .includes() below rather than indexed directly, so an
// off-enum value — inherited or not — always 400s before ASPECT_ATTR is ever
// touched.
const ASPECT_KEYS = ['mental', 'social', 'physical'];
const ASPECT_ATTR = { mental: 'Resolve', social: 'Composure', physical: 'Stamina' };

function _attrEffective(character, attrName) {
  const a = character.attributes?.[attrName];
  return (a?.dots || 0) + (a?.bonus || 0);
}

function _willpowerMax(character) {
  return _attrEffective(character, 'Resolve') + _attrEffective(character, 'Composure');
}

// crd.3a AC5: narrow, explicitly-named 2-merit bonus lookup — Indomitable and
// Closed Book, the two merits the disposable mockup already proved correct.
// No generic merit-bonus-value field exists anywhere on the character
// document (see this story's own Dev Notes for the full gap analysis); a
// third merit needing a contest bonus is real future work for a new
// server/schemas/rules/ type, not an extension of this lookup.
function _meritBonus(merit) {
  if (merit.rule_key === 'indomitable') return 2;
  if (merit.rule_key === 'closed-book') return merit.rating || 0;
  return 0;
}

// crd.4a: the at-Court City Status advantage gate. Short-circuits on the
// cheapest check first (power_name) so the overwhelming majority of
// /resolve calls (any non-power contest) never touch chapters/game_sessions/
// territories at all. Returns null when the gate is closed for this
// challenge, or { eligible: true, bp_value, city_value } when open — the
// three conditions (power, game mode, both-sides attendance) plus the
// City-Status-higher requirement, all evaluated fresh from live data, never
// cached or client-asserted (AC1).
async function _statusChoiceEligibility(challenge, defenderChar) {
  if (!challenge.power_name || typeof challenge.power_name !== 'string' || !challenge.power_name.trim()) {
    return null;
  }

  // Game mode active — mirrors office-actions.js's own GATED_TYPES check
  // (lines ~164-168) exactly, same import, no second (deriveStatus) arg
  // needed server-side.
  const cycles = await getCollection('chapters').find().toArray();
  if (!currentCycleInGamePhase(cycles)) return null;

  // At Court — both challenger and defender attended:true in the SAME
  // current game session. Session-selection mirrors office-actions.js's own
  // findLatestSession (session_date <= today, tie-broken by _id) rather than
  // attendance.js's own unfiltered "most recent by date" sort — a
  // future-dated game_sessions document is a real, supported shape in this
  // app (server/routes/game-sessions.js's own GET /next), and office-
  // actions.js's own comment documents the tie-break need. Crd-4a review
  // (external Codex, Pass 2): mirroring attendance.js's own query verbatim
  // would let a pre-created future session's attendance silently outrank the
  // actually-live one. Attendance MATCHING (id-then-name fallback) still
  // mirrors attendance.js's own robustness pattern.
  const today = new Date().toISOString().slice(0, 10);
  const latestSession = await getCollection('game_sessions').findOne(
    { session_date: { $lte: today } },
    { sort: { session_date: -1, _id: -1 } },
  );
  if (!latestSession) return null;
  const attendance = latestSession.attendance || [];
  function attendedIn(charId, charName) {
    // Crd-4a review (external Codex, Pass 1): require a genuinely non-empty
    // id before comparing, so two missing/blank ids (e.g. a malformed
    // attendance row) can never coincidentally match via String(undefined)
    // === String(undefined). Not currently reachable end-to-end (Pass 2
    // confirmed the route's own ownership/ObjectId checks already exclude a
    // missing target/challenger id before this function is ever reached),
    // but defended here too, matching this file's own established
    // defence-in-depth standard for exactly this kind of schema-shouldn't-
    // allow-it-but-guard-anyway case.
    const hasId = charId != null && String(charId).trim() !== '';
    const entry = attendance.find(a =>
      (hasId && String(a.character_id) === String(charId))
      || (charName && (a.character_name === charName || a.name === charName))
    );
    return entry?.attended === true;
  }

  let challengerChar;
  try {
    challengerChar = await getCollection('characters').findOne({ _id: new ObjectId(challenge.challenger_character_id) });
  } catch { return null; }
  if (!challengerChar) return null;

  if (!attendedIn(challenge.challenger_character_id, challengerChar.name)) return null;
  if (!attendedIn(challenge.target_character_id, defenderChar.name)) return null;

  // City Status — same territories/regentAmbience/calcEffectiveCityStatus
  // pattern office-actions.js already uses for its own budget check (lines
  // ~316-319).
  const territories = await getCollection('territories').find({}).toArray();
  const defenderAmbience   = findRegentTerritory(territories, defenderChar)?.ambience;
  const challengerAmbience = findRegentTerritory(territories, challengerChar)?.ambience;
  const defenderStatus   = calcEffectiveCityStatus(defenderChar, defenderAmbience);
  const challengerStatus = calcEffectiveCityStatus(challengerChar, challengerAmbience);

  if (!(defenderStatus > challengerStatus)) return null;

  return {
    eligible:  true,
    bp_value:   defenderChar.blood_potency || 0,
    city_value: defenderStatus - challengerStatus,
  };
}

// PUT /api/contested_roll_requests/:id/resolve — defender computes their own
// server-verified pool from live character state; does not roll dice or
// change status (see this story's own "resolving is not accepting" decision).
router.put('/:id/resolve', async (req, res) => {
  const challenge = await _findChallenge(req, res);
  if (!challenge) return;

  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.includes(challenge.target_character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not the target of this challenge' });
  }

  const { defender_aspect, defender_wp_spent, defender_merit_ids } = req.body || {};
  if (!ASPECT_KEYS.includes(defender_aspect)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'defender_aspect must be one of mental, social, physical' });
  }
  const attrName = ASPECT_ATTR[defender_aspect];

  // AC9's literal wording ("do not accept defender_wp_spent as anything other
  // than a boolean") is enforced here explicitly — this route has no
  // validate() middleware (that's POST-only), so a non-boolean would
  // otherwise be silently coerced rather than rejected (crd.3a code review,
  // external Codex, Pass 3a).
  if (defender_wp_spent !== undefined && typeof defender_wp_spent !== 'boolean') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'defender_wp_spent must be a boolean' });
  }

  let defenderOid;
  try { defenderOid = new ObjectId(challenge.target_character_id); } catch {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid target_character_id' });
  }
  const character = await getCollection('characters').findOne({ _id: defenderOid });
  if (!character) return res.status(404).json({ error: 'NOT_FOUND', message: 'Defender character not found' });

  let pool = _attrEffective(character, attrName);

  const spendWp = defender_wp_spent === true;
  if (spendWp) {
    // Live re-check, never a value cached or submitted earlier (this story's
    // own trust-boundary purpose). No tracker_state document at all means the
    // defender has never touched the live tracker — full, undamaged
    // Willpower, mirroring the client's own defaults() fallback.
    const trackerDoc = await getCollection('tracker_state').findOne({
      character_id: { $in: [defenderOid, challenge.target_character_id] },
    });
    // `?? ` (not a doc-existence ternary): tracker_state's own PUT route is an
    // unvalidated partial upsert, so a real document can exist with no
    // `willpower` field at all. Falling through to the full-WP default on a
    // missing FIELD, not just a missing DOCUMENT, is what actually re-checks
    // something (crd.3a code review, external Codex, Pass 2/3a) — `?? ` also
    // preserves a genuine, legitimately-tracked `willpower: 0` correctly.
    const currentWp = trackerDoc?.willpower ?? _willpowerMax(character);
    if (currentWp <= 0) {
      return res.status(409).json({ error: 'CONFLICT', message: 'Not enough Willpower to spend' });
    }
    // Resistance-trait roll: +2, not the usual +3 (Rulebook's general
    // Willpower rule; see crd.1's Dev Notes for the full citation).
    pool += 2;
  }

  // AC4: a submitted id the character does not actually have is silently
  // dropped, not a hard validation failure.
  const ownedRuleKeys = new Set((character.merits || []).map(m => m.rule_key).filter(Boolean));
  const resolvedMeritIds = Array.from(new Set(
    (Array.isArray(defender_merit_ids) ? defender_merit_ids : []).filter(id => ownedRuleKeys.has(id))
  ));
  // Bonuses are summed by looking up ONE merit per resolved rule_key (the
  // first match), not by walking every character merit row — the character
  // schema has no uniqueItems/cross-row rule_key constraint, so two merit
  // entries sharing one rule_key (a data anomaly, not prevented anywhere) had
  // been contributing the bonus twice (crd.3a code review, external Codex,
  // Pass 1/2).
  for (const ruleKey of resolvedMeritIds) {
    const merit = (character.merits || []).find(m => m.rule_key === ruleKey);
    if (merit) pool += _meritBonus(merit);
  }

  // crd.4a: the at-Court City Status advantage. Gate is closed for the
  // overwhelming majority of resolves (any non-power contest) — statusChoice
  // is null and finalPool/defenderStatusTerm fall straight through unchanged.
  const statusChoice = await _statusChoiceEligibility(challenge, character);
  let finalPool = pool;
  let defenderStatusTerm = null;
  if (statusChoice) {
    const { defender_status_term } = req.body || {};
    if (defender_status_term === 'bp' || defender_status_term === 'city') {
      defenderStatusTerm = defender_status_term;
      finalPool = pool + (defender_status_term === 'bp' ? statusChoice.bp_value : statusChoice.city_value);
    } else {
      // AC3: required-but-not-yet-chosen — NOT a 400. The aspect/WP/merit
      // portion above is already legitimately computed and worth showing;
      // only the final total is withheld, the same null-means-"not resolved
      // yet" signal already established for a missing defender_aspect.
      finalPool = null;
    }
  }

  // Crd-4a review (external Codex, Pass 1): `blood_potency` is schema-
  // constrained to an integer (character.schema.js) so this is not reachable
  // through the normal character API today, but a schema-valid pool total
  // going non-finite has already burned this exact route once (crd.1's own
  // documented `_roll(undefined)` -> zero-die silent loss). `!= null` alone
  // does not catch NaN (`NaN != null` is true), and `Math.max`/`Math.min`
  // both propagate NaN silently through the clamp below — so a corrupted
  // (e.g. direct-Mongo-write) blood_potency could otherwise persist
  // defender_pool as NaN, which JSON-serialises as null but is NOT `== null`
  // when read back from Mongo, defeating /accept's own null-pool guard the
  // same way crd.1's original bug did. Treated the same as "not resolved
  // yet", not clamped to a number.
  if (finalPool != null && !Number.isFinite(finalPool)) finalPool = null;

  // Defensive clamp to the collection's own declared domain
  // (contested_roll_request.schema.js: defender_pool is 0-30). This route has
  // no validate() middleware, and a character's attribute `bonus` and a
  // merit's `rating` both have NO declared maximum, so a schema-valid
  // character can genuinely drive the computed total outside the range this
  // collection's own schema promises everywhere else (crd.3a code review,
  // external Codex, Pass 1/2). Skipped when finalPool is null (AC3) — Math.min
  // would otherwise silently coerce null to 0, a real total rather than "not
  // resolved yet".
  if (finalPool != null) finalPool = Math.max(0, Math.min(30, finalPool));

  await col().updateOne(
    { _id: challenge._id },
    { $set: {
        defender_pool:         finalPool,
        defender_aspect,
        defender_wp_spent:     spendWp,
        defender_merit_ids:    resolvedMeritIds,
        defender_status_term:  defenderStatusTerm,
        updated_at:            new Date().toISOString(),
      } }
  );

  const updated = await col().findOne({ _id: challenge._id });
  if (statusChoice) updated.status_choice = statusChoice;
  res.json(updated);
});

// PUT /api/contested_roll_requests/:id/accept — target accepts; dice rolled server-side
router.put('/:id/accept', async (req, res) => {
  const challenge = await _findChallenge(req, res);
  if (!challenge) return;

  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.includes(challenge.target_character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not the target of this challenge' });
  }

  // crd.1 INTERIM GUARD (external code review). crd.1 made `defender_pool`
  // optional at creation, which made a pending challenge with no pool at all a
  // newly reachable state — but left this route unchanged. `_roll(undefined)`
  // returns `[]` (Math.max(0, undefined) is NaN, so its loop never runs), so
  // accepting one silently resolved the challenge with the defender on ZERO
  // dice and handed the attacker the win.
  //
  // crd.3a's resolve endpoint is what will ever populate `defender_pool` for
  // real. Until then, an unresolved request cannot be accepted at all, which is
  // safe; silently rolling zero dice, which is not. This is deliberately a
  // block and NOT a pool computation — do not grow resolution logic here, it
  // belongs in crd.3a. Delete this guard when crd.3a lands and every pending
  // challenge reaches accept with a server-computed pool.
  //
  // `== null` on purpose: an explicit `defender_pool: 0` is a RESOLVED pool
  // (crd.3a may legitimately compute zero dice) and must still be accepted.
  if (challenge.defender_pool == null) {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'This challenge has no defender pool yet and cannot be accepted. The defender must resolve their own pool first.',
    });
  }

  // Roll dice server-side for both sides
  const atkCols = _roll(challenge.challenger_pool);
  const defCols = _roll(challenge.defender_pool);
  const atkSuc  = _countSuc(atkCols);
  const defSuc  = _countSuc(defCols);

  let outcome, margin;
  if (atkSuc > defSuc)      { outcome = 'attacker'; margin = atkSuc - defSuc; }
  else if (defSuc > atkSuc) { outcome = 'defender'; margin = defSuc - atkSuc; }
  else                       { outcome = 'draw';     margin = 0; }

  const outcomeData = {
    attacker: { name: challenge.challenger_character_name, pool: challenge.challenger_pool, successes: atkSuc, rolls: atkCols },
    defender: { name: challenge.target_character_name,    pool: challenge.defender_pool,   successes: defSuc, rolls: defCols },
    outcome,
    margin,
  };

  await col().updateOne(
    { _id: challenge._id },
    { $set: { status: 'resolved', outcome: outcomeData, updated_at: new Date().toISOString() } }
  );

  // Log to session_logs directly (session_logs HTTP endpoint is ST-only)
  try {
    await logCol().insertOne({
      session_date:  new Date().toISOString().slice(0, 10),
      type:          'player_contested_roll',
      roll_type:     challenge.roll_type,
      power_name:    challenge.power_name || null,
      challenge_id:  String(challenge._id),
      attacker:      outcomeData.attacker,
      defender:      outcomeData.defender,
      outcome,
      margin,
      timestamp:     new Date().toISOString(),
    });
  } catch { /* log failure is non-fatal */ }

  res.json(await col().findOne({ _id: challenge._id }));
});

// PUT /api/contested_roll_requests/:id/decline — target declines
router.put('/:id/decline', async (req, res) => {
  const challenge = await _findChallenge(req, res);
  if (!challenge) return;

  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.includes(challenge.target_character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not the target of this challenge' });
  }

  await col().updateOne(
    { _id: challenge._id },
    { $set: { status: 'declined', updated_at: new Date().toISOString() } }
  );

  res.json({ declined: true });
});

// PUT /api/contested_roll_requests/:id/void — ST override
router.put('/:id/void', requireRole('st'), async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });
  }

  // oaq.2 review finding: this collection now also carries pending Status
  // Actions (request_type: 'status_action'), which have their own
  // accept/decline lifecycle in office-actions.js. Without this guard, an
  // ST could void a pending Status Action here — a status neither route
  // family recognizes, permanently orphaning the record (office-actions.js's
  // own _findPending only ever matches status:'pending', so a 'voided'
  // record becomes unreachable by either the correct accept or decline).
  // gdx.12: same reasoning extends to Humanity Checks (request_type:
  // 'humanity_check', humanity-check.js's own accept/decline lifecycle).
  const result = await col().updateOne(
    { _id: oid, request_type: { $nin: ['status_action', 'humanity_check'] } },
    { $set: { status: 'voided', updated_at: new Date().toISOString() } }
  );
  if (!result.matchedCount) return res.status(404).json({ error: 'NOT_FOUND' });

  res.json(await col().findOne({ _id: oid }));
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _findChallenge(req, res) {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });
    return null;
  }
  // oaq.2 review finding: exclude status_action requests — they have their
  // own lifecycle (office-actions.js's accept/decline), and a status_action
  // doc has no challenger/target_character_id fields for the caller-
  // ownership check below to compare against anyway. gdx.12: same exclusion
  // for humanity_check requests (humanity-check.js's own lifecycle; a
  // humanity_check doc has no challenger/target_character_id fields either).
  const doc = await col().findOne({ _id: oid, request_type: { $nin: ['status_action', 'humanity_check'] } });
  if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return null; }
  if (doc.status !== 'pending') {
    res.status(409).json({ error: 'CONFLICT', message: 'Challenge is no longer pending' });
    return null;
  }
  return doc;
}

function d10() { return Math.floor(Math.random() * 10) + 1; }

function _roll(n) {
  const cols = [];
  for (let i = 0; i < Math.max(0, n); i++) {
    const v = d10();
    const r = { v, s: v >= 8, x: v === 10 };
    const ch = [];
    let last = r;
    while (last.x) { const cv = d10(); last = { v: cv, s: cv >= 8, x: cv === 10 }; ch.push(last); }
    cols.push({ r, ch });
  }
  return cols;
}

function _countSuc(cols) {
  let s = 0;
  for (const col of cols) {
    if (col.r.s) s++;
    for (const d of col.ch) if (d.s) s++;
  }
  return s;
}

export default router;
