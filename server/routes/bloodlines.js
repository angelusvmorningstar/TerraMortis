/**
 * Bloodlines routes (BL-1 read, BL-4 write; issue #1008).
 *
 * Epic BL — Mongo-backed replacement for the static BLOODLINE_DISCS /
 * BLOODLINE_CLANS / APPROVED_BLOODLINES constants, so a bloodline can be added
 * without a Netlify deploy. Reads are public: BL-2 wires `clanDiscList` to
 * this collection and both the player app and the DT form need it without a
 * token, exactly as the equipment catalogue does.
 *
 * BL-4 added the writes. `server/routes/equipment-catalogue.js` is the
 * precedent for the mixed public-read / ST-write shape, and this file follows
 * it closely, with three deliberate departures each recorded at its site:
 *
 *   1. PATCH validates the MERGED document, not the patch body (ECM validates
 *      nothing on PATCH). Bloodlines carry a four-discipline count rule that a
 *      partial update can break, and breaking it re-costs every holder.
 *   2. The impact endpoint is ST-gated (ECM's is public). It joins character
 *      names to a data problem, and this epic has kept its public surface
 *      minimal since BL-1 (`notes` is the same ruling).
 *   3. DELETE guards on `rule_grant` references as well as holders, and
 *      matches holders on the cache's normalised key rather than exactly.
 *
 * Endpoints:
 *
 *   GET    /api/bloodlines             public   list, name ascending
 *   GET    /api/bloodlines/admin       ST       full documents, incl. `notes`
 *   GET    /api/bloodlines/:id/impact  ST       who references this bloodline
 *   GET    /api/bloodlines/:id         public   single by ObjectId
 *   POST   /api/bloodlines             ST       create
 *   PATCH  /api/bloodlines/:id         ST       partial update, allowlisted
 *   DELETE /api/bloodlines/:id         ST       409 when referenced, else 204
 *
 * Built as a factory taking the auth middleware, so BL-4's write handlers
 * slotted in without touching the mounts at `server/index.js` and
 * `server/tests/helpers/test-app.js`.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import Ajv from 'ajv';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { bloodlineSchema, BLOODLINE_UPDATABLE_FIELDS } from '../schemas/bloodline.schema.js';
import { deriveSlug } from '../lib/bloodline-slug.js';
import { ensureBloodlineNameIndex } from '../lib/bloodline-name-index.js';
import { deleteBloodlineGuarded } from '../lib/bloodline-delete-guard.js';
import { broadcastBloodlineUpdate } from '../ws.js';
// The same cross-boundary import the seed script already makes. BL-3b deletes
// only the three BLOODLINE_* exports; CORE_DISCS / RITUAL_DISCS stay.
import { CORE_DISCS, RITUAL_DISCS } from '../../public/js/data/constants.js';

/**
 * Every discipline a bloodline could legitimately grant. The schema
 * deliberately carries no enum for this (see `bloodline.schema.js:51-54`): an
 * enum would put the discipline list back behind a deploy, which is the exact
 * thing this epic exists to delete. So the check lives here, mirroring the
 * seed script's integrity gate.
 */
const KNOWN_DISCIPLINES = [...CORE_DISCS, ...RITUAL_DISCS];

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
const validateBloodline = ajv.compile(bloodlineSchema);

/**
 * Trim + case-fold. Deliberately identical to `bloodlines-cache.js:66`'s
 * `_key`, because that is the normalisation costing actually resolves through:
 * a character carrying " khaibit" is being costed off the Khaibit document,
 * so the collision check and the delete guard must both see it that way.
 *
 * The `bloodline_name_unique` index now sees the same thing: this story's
 * review gave it a `strength: 2` collation (`server/lib/bloodline-name-index.js`).
 * That is what makes the rule real. The pre-insert scan below is a
 * read-then-write with no lock, so on its own two concurrent POSTs for
 * "Khaibit" and "khaibit" could both pass it and both land, collapsing to one
 * entry in the cache and leaving one document permanently unreachable for
 * costing while both still appeared in the dropdown. The scan now exists to
 * produce a 409 that names the bloodline in the way; the INDEX is what forbids
 * the second document, and its E11000 is mapped to a 409 rather than a 500.
 */
function normKey(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

/**
 * Validate :id as a 24-char ObjectId hex. On failure short-circuit with 404 —
 * the same surface a missing doc returns, so a prober cannot distinguish
 * "malformed id" from "no such id". That behaviour is copied from the ECM
 * router deliberately.
 *
 * The round-trip comparison is case-insensitive, which the ECM router's is
 * not: `ObjectId.prototype.toString()` always renders lowercase hex, so a
 * strict comparison 404s an UPPERCASE id that is perfectly valid and addresses
 * a real document. Registered against the ECM twin rather than fixed here.
 */
function withObjectId(req, res, next) {
  const raw = req.params.id;
  if (!ObjectId.isValid(raw) || String(new ObjectId(raw)) !== raw.toLowerCase()) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });
  }
  req._oid = new ObjectId(raw);
  next();
}

function badRequest(res, message, errors) {
  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    message,
    ...(errors ? { errors } : {}),
  });
}

/**
 * Trim, and adopt the canonical spelling of any discipline that differs from a
 * known one only by case. `"Auspex "` and `"auspex"` are the discipline field's
 * version of the whitespace and case tolerance `name` has always had, and
 * rejecting them as "Unknown discipline" was an avoidable refusal on a value
 * this function can resolve exactly. What is stored is always the canonical
 * spelling, because the character's own discipline keys are matched against it
 * literally: a stored `"auspex"` would resolve the bloodline and then never
 * match the discipline, which is precisely the silent mis-costing the known-set
 * check exists to prevent.
 *
 * Anything not resolvable is passed through untouched, so
 * `unknownDisciplineMessage` still reports it verbatim.
 */
function canonicaliseDisciplines(disciplines) {
  if (!Array.isArray(disciplines)) return disciplines; // shape is the schema's job
  return disciplines.map(d => {
    if (typeof d !== 'string') return d;
    const trimmed = d.trim();
    return KNOWN_DISCIPLINES.find(k => k.toLowerCase() === trimmed.toLowerCase()) || trimmed;
  });
}

/**
 * Check every discipline name against the known set. A typo like "Vigor" is
 * drift pattern #15 arriving through the discipline field: the bloodline name
 * resolves, the discipline never matches the character's own list, and the
 * holder is charged out-of-clan for it forever. Returns a message naming the
 * offending value, or null when the list is clean.
 *
 * Runs on the canonicalised list, so it reports what would actually be stored.
 */
function unknownDisciplineMessage(disciplines) {
  if (!Array.isArray(disciplines)) return null; // shape is the schema's job
  const unknown = disciplines.filter(d => typeof d === 'string' && d.trim() && !KNOWN_DISCIPLINES.includes(d));
  if (!unknown.length) return null;
  return `Unknown discipline${unknown.length === 1 ? '' : 's'}: ${unknown.map(d => `"${d}"`).join(', ')}. `
    + `Known disciplines are: ${KNOWN_DISCIPLINES.join(', ')}.`;
}

/** Ajv error list flattened into the shape `middleware/validate.js` returns. */
function schemaErrors() {
  return (validateBloodline.errors || []).map(e => ({
    path: e.instancePath || '(root)',
    message: e.message,
    ...(e.params?.additionalProperty ? { property: e.params.additionalProperty } : {}),
  }));
}

/**
 * @param {import('express').RequestHandler} authMiddleware - runs before
 *   `requireRole('st')` on every write. In prod that is `requireAuth`, in
 *   tests `mockAuth`.
 */
export default function buildBloodlinesRouter(authMiddleware) {
  const router = Router();
  const col = () => getCollection('bloodlines');
  const chars = () => getCollection('characters');
  const grants = () => getCollection('rule_grant');

  /**
   * Make sure the case-insensitive unique index exists before the first write
   * of the process. It is the only atomic guard on the normalised name, and
   * the seed script is not a precondition of this screen working — a
   * collection created entirely through POST would otherwise carry no unique
   * index at all.
   *
   * Memoised, so it costs one round trip per process rather than per write. A
   * failure is logged and cleared rather than thrown: it must not take the
   * write path down, and the pre-insert scan still rejects the ordinary case.
   */
  let _indexReady = null;
  function ensureNameIndex() {
    if (!_indexReady) {
      _indexReady = ensureBloodlineNameIndex(col()).catch(err => {
        console.error('[bloodlines] could not ensure the unique name index:', err);
        _indexReady = null;
      });
    }
    return _indexReady;
  }

  // `notes` is ST bookkeeping, not player-facing flavour (ruled by Angelus
  // 2026-08-10). These reads are unauthenticated, so it is projected out at
  // the query rather than stripped after fetch — the same shape as the
  // `st_hidden` filtering on relationships. Every other reference collection
  // carrying a free-text note (the eight `rule_*` collections) sits behind
  // requireAuth; this keeps bloodlines consistent with that. BL-4's
  // GET /admin below is the ST-gated read that includes it.
  const PUBLIC_PROJECTION = { projection: { notes: 0 } };

  /**
   * Everything that references this bloodline by NAME. There is no foreign key
   * anywhere in this epic, on purpose (drift pattern #2), so both joins are
   * string matches on the normalised key.
   *
   * Both collections are read whole and filtered in memory rather than queried
   * with a case-insensitive regex. That is deliberate: the sets are tiny (13
   * bloodline-carrying characters and 3 bloodline grant rules live), and doing
   * it this way means the guard uses literally the same `normKey` the cache
   * resolves costing through, instead of a regex that agrees with it by
   * inspection.
   */
  async function referencesFor(name) {
    const key = normKey(name);
    const holderRows = await chars()
      .find({ bloodline: { $nin: [null, ''] } }, { projection: { name: 1, moniker: 1, bloodline: 1 } })
      .toArray();
    const holders = holderRows.filter(c => normKey(c.bloodline) === key);
    const grantRows = await grants()
      .find({ condition: 'bloodline' }, { projection: { source: 1, grant_type: 1, target: 1, target_qualifier: 1, bloodline_name: 1 } })
      .toArray();
    const grantRefs = grantRows.filter(g => normKey(g.bloodline_name) === key);
    return {
      holders: holders.length,
      character_names: holders.map(c => c.moniker || c.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      grant_rules: grantRefs.length,
      grant_rule_labels: grantRefs
        .map(g => [g.grant_type, g.target, g.target_qualifier].filter(Boolean).join(': '))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public reads (BL-1; shape unchanged by BL-4)
  // ─────────────────────────────────────────────────────────────────────────

  router.get('/', async (req, res) => {
    const docs = await col().find({}, PUBLIC_PROJECTION).sort({ name: 1 }).toArray();
    res.json(docs);
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  ST-gated reads
  //
  //  Both MUST stay above `router.get('/:id')`: Express matches in
  //  registration order, so a later `/admin` would be swallowed by `/:id` and
  //  404'd by withObjectId as a malformed ObjectId.
  // ─────────────────────────────────────────────────────────────────────────

  router.get('/admin',
    authMiddleware, requireRole('st'),
    async (req, res) => {
      const docs = await col().find({}).sort({ name: 1 }).toArray();

      // `grant_rule_count` is computed here, in ONE read of `rule_grant` for
      // the whole list, because the admin screen's Delete button has to mirror
      // the server's delete gate and the client cannot see grant rules at all.
      // Its own holder join covers `characters.bloodline`; without this a
      // bloodline with no holders but a grant rule offered an enabled Delete
      // that the API then refused with a 409 (AC 12). The alternative, an
      // /impact fetch per row, is an N+1 on a screen that renders 23 rows.
      const grantRows = await grants()
        .find({ condition: 'bloodline' }, { projection: { bloodline_name: 1 } })
        .toArray();
      const grantsByKey = new Map();
      for (const g of grantRows) {
        const key = normKey(g.bloodline_name);
        if (!key) continue;
        grantsByKey.set(key, (grantsByKey.get(key) || 0) + 1);
      }

      res.json(docs.map(d => ({ ...d, grant_rule_count: grantsByKey.get(normKey(d.name)) || 0 })));
    }
  );

  router.get('/:id/impact',
    authMiddleware, requireRole('st'),
    withObjectId,
    async (req, res) => {
      const doc = await col().findOne({ _id: req._oid });
      if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });
      res.json(await referencesFor(doc.name));
    }
  );

  router.get('/:id', withObjectId, async (req, res) => {
    const doc = await col().findOne({ _id: req._oid }, PUBLIC_PROJECTION);
    if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });
    res.json(doc);
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  ST-only writes
  // ─────────────────────────────────────────────────────────────────────────

  router.post('/',
    authMiddleware, requireRole('st'),
    async (req, res) => {
      const src = req.body || {};

      // `name` is the canonical key every other referent matches on, so it is
      // trimmed here and never again. The schema's `minLength: 1` passes a
      // string of spaces, which is why this check is not left to it.
      const name = typeof src.name === 'string' ? src.name.trim() : '';
      if (!name) return badRequest(res, 'Name is required.');

      // Derived server-side, never accepted from the client.
      const slug = deriveSlug(name);
      if (!slug) {
        return badRequest(res, 'Name must contain at least one letter or digit, so an id can be derived from it.');
      }

      const doc = {
        name,
        slug,
        clan: src.clan,
        disciplines: canonicaliseDisciplines(src.disciplines),
        notes: src.notes === undefined ? null : src.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      doc.updated_at = doc.created_at;

      if (!validateBloodline(doc)) {
        return badRequest(res, 'Bloodline failed schema validation. Exactly four distinct, named disciplines and one of the five clans are required.', schemaErrors());
      }
      const discMsg = unknownDisciplineMessage(doc.disciplines);
      if (discMsg) return badRequest(res, discMsg);

      // The index is the guard; this scan is the message. Two concurrent
      // POSTs can both clear the scan, which is why the collation was added
      // (`server/lib/bloodline-name-index.js`) — but a lone ST typing a name
      // that already exists should be told which bloodline is in the way, not
      // handed a bare conflict from the driver.
      await ensureNameIndex();
      const existing = await col().find({}, { projection: { name: 1 } }).toArray();
      const clash = existing.find(b => normKey(b.name) === normKey(name));
      if (clash) {
        return res.status(409).json({
          error: 'CONFLICT',
          message: `A bloodline named "${clash.name}" already exists. Names must be distinct ignoring case and surrounding spaces, because that is how a character's bloodline is matched.`,
          existing_name: clash.name,
        });
      }

      let insertedId;
      try {
        const result = await col().insertOne(doc);
        insertedId = result.insertedId;
      } catch (err) {
        // This is where the race is actually lost by the loser: the collated
        // unique index refuses the second of two concurrent case-different
        // creates, and without this the raw driver error would reach the
        // client as a 500.
        if (err && err.code === 11000) {
          return res.status(409).json({
            error: 'CONFLICT',
            message: `A bloodline named "${name}" already exists. Names must be distinct ignoring case and surrounding spaces, because that is how a character's bloodline is matched.`,
          });
        }
        throw err;
      }

      const created = await col().findOne({ _id: insertedId });
      broadcastBloodlineUpdate(insertedId, 'create');
      res.status(201).json(created);
    }
  );

  router.patch('/:id',
    authMiddleware, requireRole('st'),
    withObjectId,
    async (req, res) => {
      const filtered = {};
      for (const [field, value] of Object.entries(req.body || {})) {
        if (BLOODLINE_UPDATABLE_FIELDS.has(field)) filtered[field] = value;
      }
      if ('disciplines' in filtered) filtered.disciplines = canonicaliseDisciplines(filtered.disciplines);
      if (!Object.keys(filtered).length) {
        return badRequest(res, 'No updatable fields provided. Name and slug are immutable: correct a mis-typed name by deleting and recreating, which is possible while it has no holders.');
      }

      const current = await col().findOne({ _id: req._oid });
      if (!current) return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });

      // THE departure from the ECM precedent (AC 2). ECM runs an allowlist and
      // no schema validation at all, which is tolerable for a free-text
      // catalogue. Here, validating the patch BODY would let
      // `{ disciplines: ['Auspex','Celerity','Vigour'] }` write a
      // three-discipline bloodline straight past the count rule, and every
      // holder's costing would quietly change. Fetch, merge, validate, write.
      const merged = { ...current, ...filtered };
      if (!validateBloodline(merged)) {
        return badRequest(res, 'The resulting bloodline would fail schema validation. Exactly four distinct, named disciplines and one of the five clans are required.', schemaErrors());
      }
      const discMsg = unknownDisciplineMessage(merged.disciplines);
      if (discMsg) return badRequest(res, discMsg);

      filtered.updated_at = new Date().toISOString();
      const result = await col().findOneAndUpdate(
        { _id: req._oid },
        { $set: filtered },
        { returnDocument: 'after' }
      );
      if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });
      broadcastBloodlineUpdate(req._oid, 'update');
      res.json(result);
    }
  );

  router.delete('/:id',
    authMiddleware, requireRole('st'),
    withObjectId,
    async (req, res) => {
      const doc = await col().findOne({ _id: req._oid });
      if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });

      // DELETE here means "remove a mistake", never "retire a bloodline".
      // Bloodlines are permanent (ruled 2026-08-10, commit 07945307, which
      // removed the `active` field); the permanence is expressed as this
      // guard rather than as a missing feature, because create-only plus an
      // immutable name plus no delete would make a single typo permanent and
      // visible in every ST's dropdown forever, with no correction path.
      //
      // The check runs on both sides of the delete and the document is put
      // back if a reference lands in between — see
      // `server/lib/bloodline-delete-guard.js` for why that, and not a
      // transaction, is what closes the window.
      const outcome = await deleteBloodlineGuarded({
        findReferences: () => referencesFor(doc.name),
        deleteDoc: async () => (await col().deleteOne({ _id: req._oid })).deletedCount,
        restoreDoc: () => col().insertOne(doc),   // same _id, verbatim
      });

      if (!outcome.found) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Bloodline not found' });
      }
      if (!outcome.deleted) {
        const refs = outcome.refs;
        const parts = [];
        if (refs.holders > 0) parts.push(`held by ${refs.holders} character${refs.holders === 1 ? '' : 's'}`);
        if (refs.grant_rules > 0) parts.push(`referenced by ${refs.grant_rules} bloodline grant rule${refs.grant_rules === 1 ? '' : 's'}`);
        return res.status(409).json({
          error: 'CONFLICT',
          message: `Cannot delete "${doc.name}": ${parts.join(' and ')}.`
            + (outcome.restored ? ' The reference arrived while the delete was running, so the bloodline has been kept.' : ''),
          ...refs,
        });
      }

      broadcastBloodlineUpdate(req._oid, 'delete');
      res.status(204).end();
    }
  );

  return router;
}
