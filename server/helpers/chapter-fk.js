/**
 * cm-2b — the Chapter foreign key on `downtime_submissions`, and its
 * DUAL-READ COMPATIBILITY SHIM.
 *
 * WHY THIS MODULE EXISTS
 *
 *   cm-2b renames the collection `downtime_cycles` -> `chapters` and the FK
 *   `downtime_submissions.cycle_id` -> `chapter_id`. The collection copy is
 *   ADDITIVE (copy-then-drop, `--drop-source` is a separate flag), but the FK
 *   rename is DESTRUCTIVE: `$rename` removes `cycle_id`. Code review found that
 *   neither deploy order avoids an outage window:
 *
 *     - migrate first, deploy second -> the still-live OLD server filters on
 *       `cycle_id`, which no longer exists. Every Downtime/Feeding/Archive view
 *       goes empty until the deploy lands.
 *     - deploy first, migrate second -> the NEW server filters on `chapter_id`,
 *       which does not exist yet. Same empty views, other way round.
 *
 *   Angelus's ruling (story cm-2b, Review Findings, 2026-08-17) is a dual-read
 *   compatibility shim, mirroring this project's own CM-1 legacy-mirror
 *   precedent (`cycle-model.md` §7). CM-1's mirror was field-level on one
 *   document; this one is field-level across two NAMES.
 *
 * THE CONTRACT, WHICH IS DELIBERATELY ASYMMETRIC
 *
 *   READ  : `chapter_id`, falling back to `cycle_id` when `chapter_id` is
 *           ABSENT. Never both at once — a document that somehow carries both
 *           resolves on `chapter_id` and the legacy value is ignored, exactly
 *           as the migration's own `--prefer-new` recovery does.
 *   WRITE : `chapter_id` ONLY. A request body still carrying a `cycle_id` key
 *           is REJECTED with 400 `LEGACY_CYCLE_ID_REJECTED`.
 *
 *   The asymmetry is the whole point. Accepting legacy WRITES would re-open the
 *   defect the shim exists to route around: a stale browser bundle or a stale
 *   TM Cockpit script writing a `cycle_id`-only submission that is invisible to
 *   `GET`, to hold-flags, to publish and to the delete-orphan guard, and that
 *   also skips `requireOpenCycle`'s deadline/phase gate (which fails open when
 *   the FK is absent). Reads tolerate the past; writes do not create more of it.
 *
 * SCOPE. This is the `downtime_submissions` Chapter FK and nothing else.
 *   `project_invitations.cycle_id`, `ranking_ballots.cycle_id` and
 *   `npcs.linked_cycle_id` are three DIFFERENT collections' own FKs that happen
 *   to share the old name. cm-2b deliberately leaves all three alone (story
 *   Task 1 Correction 1); do not point this module at them.
 *
 * REMOVAL. The read fallback is transitional. Once `--apply` has run and burnt
 *   in — the same gate as `--drop-source` — a follow-up story deletes the
 *   `cycle_id` half of every helper here and the module collapses to the
 *   dual-TYPE `$in` it already carries for issue #497. Grep for
 *   `LEGACY_CHAPTER_FK` to find every site in one pass.
 */

import { ObjectId } from 'mongodb';

/** The canonical FK name from cm-2b onward. */
export const CHAPTER_FK = 'chapter_id';

/** The pre-cm-2b name. Read-only compatibility; never written. */
export const LEGACY_CHAPTER_FK = 'cycle_id';

/** ObjectId or null, never a throw. Local twin of each route's own `parseId`. */
export function toChapterOid(value) {
  if (value instanceof ObjectId) return value;
  if (value === null || value === undefined) return null;
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
}

/**
 * PURE. Both storage forms of one Chapter reference.
 *
 * Issue #497: the FK is stored as an ObjectId on DT2+ submissions and as a
 * plain string on DT1 ones, and BSON comparison is type-strict. Every filter
 * built here therefore carries both, which is the dual-type `$in` pattern the
 * rest of this diff already uses — composed with, not re-derived alongside.
 *
 * @param {*} raw - an ObjectId, a 24-hex string, or anything stringifiable.
 * @returns {Array<ObjectId|string>}
 */
export function chapterFkValues(raw) {
  if (raw === null || raw === undefined) return [];
  const oid = toChapterOid(raw);
  const str = raw instanceof ObjectId ? raw.toHexString() : String(raw);
  // Both forms, always. A non-24-hex reference (test residue, a hand-written
  // fixture) yields no ObjectId and matches on its string form alone.
  return oid ? [oid, str] : [str];
}

/**
 * PURE. The Mongo clause that matches a submission's Chapter FK under EITHER
 * name and EITHER storage type.
 *
 * The legacy branch is guarded on `chapter_id` being absent, so the fallback is
 * genuinely a fallback: a document carrying both names can only ever match on
 * the new one, and a corrupt document whose two names disagree can never be
 * pulled into two different Chapters at once.
 *
 * @param {*} raw
 * @returns {object} a filter fragment with a top-level `$or`
 */
export function chapterFkFilter(raw) {
  const values = chapterFkValues(raw);
  return {
    $or: [
      { [CHAPTER_FK]: { $in: values } },
      { [CHAPTER_FK]: { $exists: false }, [LEGACY_CHAPTER_FK]: { $in: values } },
    ],
  };
}

/**
 * PURE. `chapterFkFilter` combined with an existing filter, without either one
 * clobbering the other's `$or`.
 *
 * Callers that already own a top-level `$or` (the joint-project accept path's
 * dual-type `character_id` match, for one) get an explicit `$and`; everyone
 * else gets a flat merge, so the common filter shape stays readable in a
 * profiler.
 *
 * @param {object} base
 * @param {*} raw
 */
export function withChapterFk(base, raw) {
  const clause = chapterFkFilter(raw);
  if (!base || Object.keys(base).length === 0) return clause;
  if (Object.prototype.hasOwnProperty.call(base, '$or')
      || Object.prototype.hasOwnProperty.call(base, '$and')) {
    return { $and: [clause, base] };
  }
  return { ...base, ...clause };
}

/**
 * Projection fragment for any read that projects rather than fetching whole
 * documents. Projecting `chapter_id` alone would make the fallback unreachable
 * — the legacy field would be stripped before `readChapterFk` ever saw it.
 */
export const CHAPTER_FK_PROJECTION = Object.freeze({
  [CHAPTER_FK]: 1,
  [LEGACY_CHAPTER_FK]: 1,
});

/**
 * PURE. Read the Chapter FK off an already-fetched submission: `chapter_id`,
 * falling back to `cycle_id` when `chapter_id` is absent or null.
 *
 * @param {object} doc
 * @returns {*} the raw stored value (ObjectId or string), or null.
 */
export function readChapterFk(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const next = doc[CHAPTER_FK];
  if (next !== undefined && next !== null) return next;
  const legacy = doc[LEGACY_CHAPTER_FK];
  if (legacy !== undefined && legacy !== null) return legacy;
  return null;
}

/** PURE. `readChapterFk` coerced to an ObjectId, or null when unusable. */
export function readChapterFkOid(doc) {
  return toChapterOid(readChapterFk(doc));
}

/**
 * The response half of the read fallback: make sure a submission leaving the
 * API always names its Chapter as `chapter_id`, whatever it is stored as.
 *
 * WHY THIS IS PART OF THE SHIM, not scope creep. The shim's job is that the
 * deployed system tolerates both field names during the transition window. The
 * server-side filters above deliver that for every QUERY, but the client also
 * reads the FK off documents it has already fetched — `app.js` picks the
 * feeding Chapter with `subs.some(s => String(s.chapter_id) === ...)`,
 * `admin/downtime-story.js` matches submissions to a Chapter the same way. A
 * pre-migration document handed to those with only `cycle_id` on it is found by
 * the query and then dropped on the floor by the renderer, which is the same
 * empty view the shim exists to prevent — just one layer later. Normalising
 * once, at the boundary, fixes every client reader without a shim in each of
 * roughly twenty client files.
 *
 * STILL READ-ONLY. This mutates the outbound copy that is about to be
 * serialised. Nothing is written back to Mongo, and `cycle_id` is dropped from
 * the response rather than mirrored, so no client can round-trip it into a
 * write (which the write guard below would reject anyway).
 *
 * @param {object} doc - a submission document about to be sent
 * @returns {object} the same object, mutated
 */
export function normaliseChapterFkForResponse(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  if (!Object.prototype.hasOwnProperty.call(doc, LEGACY_CHAPTER_FK)) return doc;
  if (doc[CHAPTER_FK] === undefined || doc[CHAPTER_FK] === null) {
    doc[CHAPTER_FK] = doc[LEGACY_CHAPTER_FK];
  }
  delete doc[LEGACY_CHAPTER_FK];
  return doc;
}

/**
 * PURE. The Chapter FK named on a query string: `?chapter_id=`, falling back to
 * `?cycle_id=`.
 *
 * A stale client bundle asks for one Chapter's submissions by the old param
 * name. Before this, `GET /api/downtime_submissions?cycle_id=<id>` matched no
 * known param and returned the ENTIRE collection unfiltered — inconsistent with
 * its own `/hold-flags` sibling, which 400s when its param is missing.
 *
 * @param {object} query - `req.query`
 * @returns {{ raw: string|undefined, name: string|null }}
 */
export function chapterFkQueryParam(query) {
  const q = query || {};
  if (q[CHAPTER_FK]) return { raw: q[CHAPTER_FK], name: CHAPTER_FK };
  if (q[LEGACY_CHAPTER_FK]) return { raw: q[LEGACY_CHAPTER_FK], name: LEGACY_CHAPTER_FK };
  return { raw: undefined, name: null };
}

/**
 * PURE. The write half of the shim. Returns a 400 body when a request body
 * still carries the legacy key, or null when the body is clean.
 *
 * Named reason, not a generic schema error: the caller needs to know it is
 * running stale code, not that it mistyped a field.
 *
 * @param {object} body - `req.body`
 */
export function legacyChapterFkRefusal(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (!Object.prototype.hasOwnProperty.call(body, LEGACY_CHAPTER_FK)) return null;
  return {
    error: 'LEGACY_CYCLE_ID_REJECTED',
    message:
      `'${LEGACY_CHAPTER_FK}' is no longer accepted on a downtime submission; send '${CHAPTER_FK}' ` +
      `instead. cm-2b renamed the field when downtime_cycles became chapters. Reads still resolve ` +
      `the old name for documents written before the migration, but nothing may write it: a ` +
      `${LEGACY_CHAPTER_FK}-only submission is invisible to every list, publish and delete guard. ` +
      `If you are a browser, hard-reload to pick up the current bundle.`,
    field: LEGACY_CHAPTER_FK,
    expected: CHAPTER_FK,
  };
}

/**
 * Express middleware form of `legacyChapterFkRefusal`. Mount on the SUBMISSIONS
 * router's write verbs only — `project_invitations` legitimately writes its own
 * `cycle_id` and must not be caught by this.
 */
export function rejectLegacyChapterFk(req, res, next) {
  const refusal = legacyChapterFkRefusal(req.body);
  if (refusal) return res.status(400).json(refusal);
  return next();
}
