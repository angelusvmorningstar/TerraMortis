/**
 * cm-2b migration: rename the `downtime_cycles` collection to `chapters` and
 * rename `downtime_submissions.cycle_id` to `chapter_id`. Manual, ST-invoked,
 * one-off. Nothing calls this on server boot and nothing calls it in test
 * setup; the vitest suite imports its exported functions and runs them against
 * `tm_suite_test` only.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang. Vitest's transform fails on one with a bare
 * "SyntaxError: Invalid or unexpected token" and no location, which silently
 * takes down the whole importing suite (documented in CLAUDE.md and in
 * `migrate-office-purchases-to-seats.mjs`, which learned it the hard way).
 * This script IS imported by a test suite. Run it with an explicit `node`.
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 *
 *   AND FOR THIS MIGRATION SPECIFICALLY, `--apply` IS BLOCKED ON ANOTHER
 *   REPO. See `specs/cm-2b-cross-repo-coordination.md`. TM Cockpit holds an
 *   Atlas custom role scoped to `readWrite` on seven NAMED collections, one of
 *   which is `downtime_cycles`. Renaming the collection here does not extend
 *   that grant to `chapters`, and TM Cockpit is the tool that processes every
 *   live downtime cycle. Open Question 1 of story cm-2b was RULED on
 *   2026-08-17: hold `--apply` until the TM Cockpit side has updated its own
 *   direct-access scripts AND its Atlas role has been re-scoped.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database name
 *   from MONGODB_DB, defaulting to `tm_suite`). Running this bare from
 *   `server/` with `server/.env` in place therefore targets LIVE Atlas. What
 *   makes that survivable is the DRY-RUN DEFAULT: without `--apply` this only
 *   reads, and prints exactly what it would do.
 *
 * WHY A COPY-THEN-DROP, NOT A NATIVE `renameCollection`
 *
 *   The project's standing order (`specs/epic-dbo-database-ownership.md#L82`,
 *   repeated at `specs/deferred-work.md#L300`) is "copy, verify, cut over,
 *   then drop. Never delete the source first." `renameCollection` also has no
 *   dry run, and it would leave the inverse rename as the only way back. With
 *   a copy, `downtime_cycles` sits untouched as a zero-cost rollback for the
 *   whole burn-in — and for this migration that rollback matters more than it
 *   did for cm-2, because TM Cockpit keeps writing to `downtime_cycles` by
 *   name until its own side lands.
 *
 *   `--drop-source` is therefore a SEPARATE opt-in flag from `--apply`.
 *
 * `_id` PRESERVATION IS NON-NEGOTIABLE
 *
 *   `downtime_submissions.cycle_id` holds those `_id`s as ObjectIds (DT2+) and
 *   as STRINGS (DT1) — the issue #497 mixed-type split, still unresolved in
 *   live data. A copy that lets Mongo mint fresh `_id`s produces a `chapters`
 *   collection that looks correct and is joined to nothing. Every copy here
 *   writes the source `_id` verbatim, and every reference comparison is done
 *   on `String(ref)` so both storage types resolve.
 *
 * NO RELABELLING. Unlike cm-2, this migration does not touch `label`. cm-2
 *   moved documents up a tier ("Chapter N" held a Story), so their labels were
 *   wrong. Here the documents were always Chapters; only the container's name
 *   was wrong. Every field, `label` included, is carried across verbatim.
 *
 * `downtime_submissions` IS NOT RENAMED. Only its `cycle_id` FIELD is. A
 *   submission's identity genuinely is about the downtime phase; the container's
 *   was not (cycle-model.md §11a).
 *
 * Usage. Run it from `server/` (`node scripts/cm-2b-...`). Note that
 * `dotenv/config` here resolves the REPO-ROOT `.env`, not `server/.env`. Both
 * files hold live Atlas URIs, so this is not a safety difference, but do not
 * assume an override placed in `server/.env` will be picked up.
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/cm-2b-downtime-cycles-to-chapters.mjs
 *
 *   # write (copies + field rename; does NOT drop `downtime_cycles`):
 *   #   BLOCKED on the TM Cockpit coordination above. Do not run without a
 *   #   fresh, explicit go-ahead from Angelus.
 *   node scripts/cm-2b-downtime-cycles-to-chapters.mjs --apply
 *
 *   # much later, after the burn-in:
 *   node scripts/cm-2b-downtime-cycles-to-chapters.mjs --drop-source --apply
 *
 *   # against the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/cm-2b-downtime-cycles-to-chapters.mjs --apply
 *
 * THE DEPLOYED CODE IS NOT INERT, AND DOES NOT NEED TO WAIT FOR THIS SCRIPT
 *
 *   The script is inert until somebody types `--apply`. The APPLICATION code
 *   shipped alongside it is not: it points every route and client call at
 *   `chapters` and `chapter_id`. Review found that the FK half of that has no
 *   safe deploy order on its own, because `$rename` REMOVES `cycle_id`: migrate
 *   first and the still-live old server matches nothing; deploy first and the
 *   new server matches nothing.
 *
 *   The resolution is a DUAL-READ COMPATIBILITY SHIM in the application, not in
 *   this script: `server/helpers/chapter-fk.js`. Every server-side read of the
 *   submission FK resolves `chapter_id`, falling back to `cycle_id`; every
 *   write writes `chapter_id` only and REJECTS a body still carrying
 *   `cycle_id`. So the deployed app tolerates both field names during the
 *   window, and this script can run whenever the TM Cockpit coordination
 *   allows. Read that module's header before changing anything here about
 *   `OLD_FIELD`.
 *
 * REFUSALS. Every one of these leaves every document exactly as it was:
 *
 *   - SOURCE SHAPE. A `downtime_cycles` document that is Story-GROUPING shaped
 *     (a numeric `number`, a `label`/`created_at`, and none of the Chapter
 *     markers) is cm-2's data, not a Chapter. See the guard below.
 *   - TARGET SHAPE. A `chapters` document that is Story-grouping shaped means
 *     cm-2's `--drop-source` never ran and `chapters` is still cm-2's OLD
 *     collection. Copying Chapters in beside Stories would silently mix two
 *     document kinds in one collection. This is the guard that enforces cm-2's
 *     own stated sequencing gate ("db.getCollectionNames() must not contain
 *     chapters") rather than trusting a human to remember it.
 *   - TARGET PHANTOM. A Chapter-shaped `chapters` document with no counterpart
 *     in `downtime_cycles`, before `--apply` has run. That is the actual
 *     signature of the sequencing violation everyone is worried about: the app
 *     deployed and started creating Chapters in a collection the migration has
 *     not populated. A refusal in `planRename`; only an advisory in
 *     `dropSource`, where post-cutover Chapters legitimately look like this.
 *   - `chapters` already holds a document under a source `_id` whose body
 *     differs OUTSIDE the burn-in-mutable field set (an ST advancing a phase or
 *     editing a label during burn-in is reported, not refused — see
 *     `BURN_IN_MUTABLE_FIELDS`);
 *   - a `downtime_submissions` document carries BOTH `cycle_id` and
 *     `chapter_id` (a `$rename` would silently discard one of them);
 *   - a `cycle_id` value resolves to no document in `downtime_cycles` (a
 *     dangling reference).
 *
 * RECOVERY: THE BOTH-FIELDS STATE, AND `--prefer-new`
 *
 *   Between the deploy and the migration run, the deployed client writes
 *   `chapter_id` while live submissions still carry `cycle_id`. One player save
 *   in that window leaves a submission carrying BOTH, which is a refusal — and
 *   a refusal is all-or-nothing for the whole run.
 *
 *   `--prefer-new` is the documented way out. It treats `chapter_id` as
 *   authoritative (it is the value the live, deployed system wrote most
 *   recently) and `$unset`s the stale `cycle_id`, instead of refusing. It NEVER
 *   changes the value of `chapter_id`; the only write is the removal of the old
 *   field. It is opt-in, it is listed line by line in the dry run, and it warns
 *   explicitly when the surviving value is null while the discarded one was not
 *   — that submission comes out of the migration unattached to any Chapter and
 *   has to be re-pointed by hand.
 *
 *   Runbook when a run refuses with `both-fields`:
 *     1. `node scripts/cm-2b-downtime-cycles-to-chapters.mjs --prefer-new`
 *        — dry run. Read every `both-fields` line, and every `WARNING` line
 *        about a null survivor, and note those submissions' ids.
 *     2. `node scripts/cm-2b-downtime-cycles-to-chapters.mjs --prefer-new --apply`.
 *     3. Re-run bare (no `--prefer-new`) and confirm `0 copied, 0 field
 *        rename(s)` and no refusals.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getDb, closeDb } from '../db.js';

export const SOURCE_COLLECTION = 'downtime_cycles';
export const TARGET_COLLECTION = 'chapters';
export const OLD_FIELD = 'cycle_id';
export const NEW_FIELD = 'chapter_id';
export const SUBMISSIONS_COLLECTION = 'downtime_submissions';

/**
 * Fields a Chapter document (what `downtime_cycles` holds) carries and a
 * cm-2-era Story-grouping never does. A Story-grouping is
 * `{ _id, number, label, created_at }` plus, since cm-3, an optional
 * `final_chapter_id` — and nothing else (verified against all three live
 * documents, 2026-08-16, and against `server/routes/story-cycles.js`'s own
 * create/patch handlers, which write exactly those keys).
 *
 * This is the discriminator behind BOTH shape guards described in the header.
 */
export const CHAPTER_MARKERS = [
  'phase', 'game_number', 'game_phase', 'status', 'phase_sequence',
  // Review finding (2026-08-17): the original five were too few. These are
  // equally Chapter-only, and their absence from the list was half of why a
  // Story-grouping that had picked up ANY extra key defeated the guard.
  'phase_signoff', 'joint_projects', 'regent_confirmations',
  'deadline_at', 'auto_open_at', 'manual_open', 'submission_count',
  'out_of_window_player_ids', 'feeding_rights_confirmed',
];

/**
 * The key set a Story-grouping document is EXPECTED to have. Kept exported for
 * documentation, but deliberately no longer used as a hard allowlist — see
 * `isStoryGroupingShaped`.
 */
export const STORY_GROUPING_KEYS = ['_id', 'number', 'label', 'created_at', 'final_chapter_id'];

/**
 * PURE. Is this document a cm-2-era Story-grouping rather than a Chapter?
 *
 * POSITIVE SHAPE CHECK, changed 2026-08-17 after review.
 *
 *   The original was negative: "carries none of the Chapter markers AND every
 *   one of its keys is in a hard-coded five-key allowlist". One field outside
 *   that allowlist — anything a future story might add to `story_cycles`, a
 *   stray `updated_at`, an ops annotation — silently defeated the check, and a
 *   silently-defeated shape guard lets `dropSource` proceed over cm-2's own
 *   data. That is a guard failing OPEN, which is the worst way for this
 *   particular one to fail.
 *
 *   It now asks whether the document MATCHES the Story-grouping shape rather
 *   than whether it fails to match anything else: it must carry a numeric
 *   `number` (a Chapter never does — Chapters carry `game_number`), at least
 *   one of `label`/`created_at`, and NONE of the Chapter markers. Extra keys
 *   no longer matter.
 *
 * @param {object} doc
 */
export function isStoryGroupingShaped(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const has = k => Object.prototype.hasOwnProperty.call(doc, k);
  // Any Chapter marker settles it: this is a Chapter (or something stranger),
  // not a Story-grouping.
  if (Object.keys(doc).some(k => CHAPTER_MARKERS.includes(k))) return false;
  // The identifying field. A bare `{_id}` is not evidence of anything.
  if (typeof doc.number !== 'number') return false;
  return has('label') || has('created_at');
}

/**
 * PURE. Returns a refusal per SOURCE document that looks like a cm-2-era
 * Story-grouping rather than a Chapter. An empty array means `downtime_cycles`
 * is the collection this script was built for.
 *
 * @param {Array<object>} sourceDocs
 */
export function sourceShapeRefusals(sourceDocs) {
  const refusals = [];
  for (const doc of sourceDocs || []) {
    if (!isStoryGroupingShaped(doc)) continue;
    refusals.push({
      kind: 'source-shape',
      _id: String(doc._id),
      detail:
        `${SOURCE_COLLECTION} _id ${String(doc._id)} has the shape of a cm-2-era STORY-GROUPING ` +
        `({ number, label, created_at }) and none of the fields a Chapter always carries ` +
        `(${CHAPTER_MARKERS.join(', ')}). THIS DOES NOT LOOK LIKE THE COLLECTION THIS SCRIPT WAS ` +
        `BUILT FOR. Refusing outright: copying Story-groupings into ${TARGET_COLLECTION} and then ` +
        `running --drop-source would destroy them. Work out how a Story-grouping document reached ` +
        `${SOURCE_COLLECTION} before doing anything else.`,
    });
  }
  return refusals;
}

/**
 * PURE. Returns a refusal per TARGET document that looks like a cm-2-era
 * Story-grouping. This is the mechanical form of cm-2's own sequencing gate:
 * cm-2's header states that cm-2b "literally cannot start until the drop has
 * happened", and this is what enforces it instead of trusting a memory.
 *
 * @param {Array<object>} targetDocs
 */
export function targetShapeRefusals(targetDocs) {
  const refusals = [];
  for (const doc of targetDocs || []) {
    if (!isStoryGroupingShaped(doc)) continue;
    refusals.push({
      kind: 'target-shape',
      _id: String(doc._id),
      detail:
        `${TARGET_COLLECTION} _id ${String(doc._id)} is a cm-2-era STORY-GROUPING document, which ` +
        `means cm-2's --drop-source has NOT run and '${TARGET_COLLECTION}' is still cm-2's OLD ` +
        `collection. Copying Chapters in beside Stories would silently mix two document kinds in ` +
        `one collection. Run cm-2 to completion first (its --drop-source --apply frees this name), ` +
        `then re-run this script.`,
    });
  }
  return refusals;
}

/**
 * PURE. The refusal that catches the ACTUAL sequencing violation: a
 * Chapter-shaped document sitting in `chapters` with no counterpart in
 * `downtime_cycles`.
 *
 * WHY THIS EXISTS SEPARATELY FROM `targetShapeRefusals` (added 2026-08-17 after
 * review). `targetShapeRefusals` only fires on cm-2-era Story-groupings, which
 * is the wrong hazard for this migration. The one everybody is actually worried
 * about is the reverse order: the CODE deploys before `--apply` runs, an ST
 * creates a Chapter through the now-live `POST /api/chapters`, and that
 * document lands in a target collection the migration has not populated yet. It
 * collides with nothing, it is copied past in silence, and once `--drop-source`
 * runs it is a permanent phantom with no rollback copy anywhere.
 *
 * WHY IT IS A REFUSAL IN `planRename` AND ONLY AN ADVISORY IN `dropSource`.
 * Before `--apply`, `chapters` may legitimately hold nothing but copies of
 * `downtime_cycles` documents, so a phantom there is a real fault. AFTER the
 * cutover, during months of burn-in, every genuinely NEW Chapter is created
 * directly in `chapters` and has no source counterpart by design — refusing on
 * that would block the drop forever. `dropSource`'s own question is only "is
 * anything about to be LOST", and a phantom in the target is not lost by
 * dropping the source. It is still worth naming out loud, which is what the
 * advisory does.
 *
 * @param {Array<object>} targetDocs
 * @param {Iterable<string>} sourceIds - stringified `downtime_cycles` `_id`s
 */
export function targetPhantomRefusals(targetDocs, sourceIds) {
  const known = new Set([...(sourceIds || [])].map(String));
  const refusals = [];
  for (const doc of targetDocs || []) {
    const id = String(doc._id);
    if (known.has(id)) continue;
    if (isStoryGroupingShaped(doc)) continue;   // targetShapeRefusals' job, not this one
    refusals.push({
      kind: 'target-phantom',
      _id: id,
      detail:
        `${TARGET_COLLECTION} _id ${id} has NO corresponding ${SOURCE_COLLECTION} document` +
        (doc.label ? ` ('${doc.label}')` : '') + `. Before --apply has run, every ${TARGET_COLLECTION} ` +
        `document should be a copy of a ${SOURCE_COLLECTION} one, so this is the signature of the ` +
        `sequencing violation cm-2b exists to avoid: the application code deployed and started ` +
        `writing to '${TARGET_COLLECTION}' before the migration populated it. That document has no ` +
        `rollback copy and --drop-source would leave it permanently unmatched. Decide what should ` +
        `happen to it by hand — copy it back to ${SOURCE_COLLECTION}, or accept it deliberately — ` +
        `before re-running.`,
    });
  }
  return refusals;
}

/**
 * PURE. Canonical (key-sorted) JSON, so field insertion order never fakes a
 * diff.
 *
 * BSON HANDLING, fixed 2026-08-17 after review. The original fell through to
 * the generic-object branch for every BSON scalar, and the modern driver's
 * `Object.keys(new ObjectId(...))` is EMPTY — so every ObjectId serialised to
 * `{}` and two documents differing only in an ObjectId-valued field
 * (`story_cycle_id`, `session_id`, anything nested in `joint_projects[]`)
 * compared EQUAL. That is the exact case the `target-differs` refusal exists to
 * catch, silently passing as a no-op. Every BSON value now serialises through
 * its own `_bsontype` tag plus its string form, so ObjectId('a') and
 * ObjectId('b') differ, and ObjectId('a') differs from the plain string 'a'
 * (which is a real storage difference worth seeing).
 */
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === 'object') {
    if (typeof value._bsontype === 'string') {
      return JSON.stringify(`${value._bsontype}(${String(value)})`);
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The whole body, with `_id` stringified so ObjectId vs string never fakes a diff. */
function bodyOf(doc) {
  return canonicalJSON({ ...(doc || {}), _id: String(doc?._id) });
}

/**
 * Fields a Chapter legitimately acquires or changes DURING the burn-in, while
 * `chapters` is the live copy and `downtime_cycles` is the frozen rollback.
 *
 * `dropSource` already reasons this way in prose — "an ST advancing a Chapter's
 * phase in the Cycle tab is not a fault, it is the system working" — but
 * `planRename` was never given the same tolerance, so ANY ST edit during
 * burn-in made it refuse permanently afterward, breaking the script's own
 * documented idempotency re-run ("re-run with --apply and confirm 0 copied, 0
 * field renames") and the `--prefer-new` runbook's step 3.
 *
 * Everything the app or the Cycle tab writes through `PUT /api/chapters/:id` is
 * here. What is NOT here is the identity: `_id` and `game_number`. A Chapter
 * whose `game_number` has drifted between the two collections is a genuine
 * "these are not the same document" signal and still refuses.
 */
export const BURN_IN_MUTABLE_FIELDS = [
  'label', 'title', 'status', 'phase', 'game_phase', 'phase_sequence', 'phase_signoff',
  'deadline_at', 'auto_open_at', 'manual_open', 'manual_open_at', 'manual_open_by',
  'submission_count', 'out_of_window_player_ids', 'feeding_rights_confirmed',
  'regent_confirmations', 'joint_projects', 'story_cycle_id', 'session_id',
  'maintenance_audit', 'updated_at', 'loaded_at', 'notes',
];

/**
 * PURE. The sorted names of every top-level field on which two documents
 * differ, `_id` excluded (it is the join key and is compared as a string
 * elsewhere). A field present on one side and absent on the other counts.
 */
export function bodyDifferences(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  keys.delete('_id');
  const differing = [];
  for (const k of keys) {
    if (canonicalJSON(a?.[k]) !== canonicalJSON(b?.[k])) differing.push(k);
  }
  return differing.sort();
}

/**
 * Read both collections and the submission references, and build the complete
 * plan.
 *
 * PURE with respect to the database: reads only, no writes, so `main()` can
 * print the whole thing before anyone decides to run it. The `db` handle is an
 * ARGUMENT rather than resolved internally, so a test can hand over
 * `tm_suite_test` and this can never reach live data by accident.
 *
 * @param {import('mongodb').Db} db
 * @param {{ preferNew?: boolean }} [opts] - `preferNew` turns a `both-fields`
 *   refusal into a resolution that keeps `chapter_id` and `$unset`s the stale
 *   `cycle_id`. See the header's recovery runbook.
 */
export async function planRename(db, { preferNew = false } = {}) {
  const source = db.collection(SOURCE_COLLECTION);
  const target = db.collection(TARGET_COLLECTION);
  const subs = db.collection(SUBMISSIONS_COLLECTION);

  const sourceDocs = await source.find({}).toArray();
  const targetDocs = await target.find({}).toArray();

  // ── Shape guards ──────────────────────────────────────────────────────────
  // Evaluated FIRST and returned early. If either collection is not the one
  // this script was built for, every subsequent computation is meaningless and
  // printing a plan over it would be actively misleading.
  const shapeRefusals = [
    ...sourceShapeRefusals(sourceDocs),
    ...targetShapeRefusals(targetDocs),
  ];
  if (shapeRefusals.length) {
    return {
      sourceCount: sourceDocs.length,
      targetCount: targetDocs.length,
      copies: [], noops: [], drifted: [],
      fieldRenames: [], bothFieldResolutions: [],
      expectedCounts: new Map(),
      refusals: shapeRefusals,
      sourceIds: [], submissionIds: [],
      wrongShape: true,
    };
  }

  const targetById = new Map(targetDocs.map(d => [String(d._id), d]));
  const sourceIds = new Set(sourceDocs.map(d => String(d._id)));

  const refusals = [];
  const copies = [];
  const noops = [];
  const drifted = [];

  // The sequencing-violation guard. Evaluated after the shape guards (which
  // answer "are these the collections we think") and before the copy plan.
  refusals.push(...targetPhantomRefusals(targetDocs, sourceIds));

  for (const doc of sourceDocs) {
    const id = String(doc._id);
    const existing = targetById.get(id);

    if (!existing) {
      copies.push({ _id: id, doc });
      continue;
    }

    const differences = bodyDifferences(existing, doc);
    if (differences.length === 0) {
      noops.push({ _id: id, label: existing.label });
      continue;
    }

    // Burn-in tolerance. `applyRename` copies with `$setOnInsert`, so an
    // existing target document is never written to either way; the question a
    // difference raises is only whether it is EXPECTED. A phase advance or a
    // label edit during burn-in is expected and is reported, not refused. A
    // difference in anything else — an identity field, an unknown key — still
    // means the plan no longer describes the database.
    const unexpected = differences.filter(f => !BURN_IN_MUTABLE_FIELDS.includes(f));
    if (unexpected.length === 0) {
      drifted.push({ _id: id, label: existing.label, fields: differences });
      continue;
    }
    refusals.push({
      kind: 'target-differs',
      _id: id,
      fields: unexpected,
      detail:
        `${TARGET_COLLECTION} already holds a DIFFERENT document under _id ${id}. ` +
        `Differing field(s) outside the burn-in-mutable set: ${unexpected.join(', ')}.` +
        (differences.length > unexpected.length
          ? ` (Also differing, but tolerated: ${differences.filter(f => !unexpected.includes(f)).join(', ')}.)`
          : ''),
    });
  }

  // ── downtime_submissions field rename ─────────────────────────────────────
  const subDocs = await subs
    .find({ $or: [{ [OLD_FIELD]: { $exists: true } }, { [NEW_FIELD]: { $exists: true } }] })
    .project({ [OLD_FIELD]: 1, [NEW_FIELD]: 1, character_id: 1 })
    .toArray();

  const fieldRenames = [];
  const bothFieldResolutions = [];
  // Every submission this plan CONSIDERED. `verifyRename` scopes its post-write
  // checks to these ids so a submission saved mid---apply (a player pressing
  // Save while the migration runs) cannot fake a corruption alarm.
  const submissionIds = subDocs.map(s => s._id);
  // Expected post-state grouping, counted across BOTH field names so it is
  // stable whether this is a first run or a re-run.
  const expectedCounts = new Map();

  for (const sub of subDocs) {
    const hasOld = Object.prototype.hasOwnProperty.call(sub, OLD_FIELD);
    const hasNew = Object.prototype.hasOwnProperty.call(sub, NEW_FIELD);

    if (hasOld && hasNew) {
      if (!preferNew) {
        refusals.push({
          kind: 'both-fields',
          _id: String(sub._id),
          detail: `${SUBMISSIONS_COLLECTION} _id ${String(sub._id)} carries BOTH ${OLD_FIELD} and ` +
                  `${NEW_FIELD}; a $rename would silently discard one. Re-run with --prefer-new ` +
                  `to keep ${NEW_FIELD} (what the deployed app wrote most recently) and clear the ` +
                  `stale ${OLD_FIELD}.`,
        });
        continue;
      }
      const keep = sub[NEW_FIELD];
      const discard = sub[OLD_FIELD];
      bothFieldResolutions.push({
        _id: String(sub._id),
        idValue: sub._id,
        keep: keep === null || keep === undefined ? null : String(keep),
        discard: discard === null || discard === undefined ? null : String(discard),
        // The submission comes out of the migration attached to no Chapter.
        clearsGrouping: (keep === null || keep === undefined) && discard !== null && discard !== undefined,
        character_id: sub.character_id == null ? null : String(sub.character_id),
      });
      if (keep !== null && keep !== undefined) {
        const key = String(keep);
        expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);
      }
      continue;
    }

    const ref = hasOld ? sub[OLD_FIELD] : sub[NEW_FIELD];

    if (hasOld) {
      // Issue #497: `cycle_id` is stored as an ObjectId on DT2+ submissions and
      // as a plain string on DT1 ones. `sourceIds` holds stringified `_id`s and
      // `ref` is stringified here, so both storage types resolve identically.
      if (ref !== null && ref !== undefined && !sourceIds.has(String(ref))) {
        refusals.push({
          kind: 'dangling-ref',
          _id: String(sub._id),
          detail: `${SUBMISSIONS_COLLECTION} _id ${String(sub._id)} has ${OLD_FIELD}='${String(ref)}' ` +
                  `which resolves to no ${SOURCE_COLLECTION} document.`,
        });
        continue;
      }
      // `idValue` carries the REAL key alongside its display string, so the
      // $rename can be scoped to exactly the planned documents — see the
      // scoped `updateMany` filter in `applyRename`.
      fieldRenames.push({
        _id: String(sub._id),
        idValue: sub._id,
        ref: ref === null || ref === undefined ? null : String(ref),
      });
    }

    if (ref !== null && ref !== undefined) {
      const key = String(ref);
      expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);
    }
  }

  return {
    sourceCount: sourceDocs.length,
    targetCount: targetDocs.length,
    copies,
    noops,
    drifted,
    fieldRenames,
    bothFieldResolutions,
    expectedCounts,
    refusals,
    sourceIds: [...sourceIds],
    submissionIds,
    wrongShape: false,
  };
}

/**
 * Read a collection's indexes, or `[]` if it does not exist yet.
 * `db.collection(x).indexes()` throws NamespaceNotFound on a missing namespace.
 */
async function indexesOf(db, name) {
  const existing = await db.listCollections({ name }).toArray();
  if (!existing.length) return [];
  try {
    return await db.collection(name).indexes();
  } catch {
    return [];
  }
}

/** PURE. An index's identity for comparison: its key pattern, canonicalised. */
function indexKeySignature(ix) {
  return canonicalJSON(ix?.key ?? {});
}

/**
 * PURE. Source indexes (excluding `_id_`, which every collection gets free)
 * that have no key-pattern match in the target.
 */
export function missingIndexes(sourceIndexes, targetIndexes) {
  const have = new Set((targetIndexes || []).map(indexKeySignature));
  return (sourceIndexes || [])
    .filter(ix => ix.name !== '_id_')
    .filter(ix => !have.has(indexKeySignature(ix)));
}

/**
 * Verify the post-state. Reads only. Returns `{ ok, problems, warnings }`.
 *
 * Three integrity checks, all of which must hold before any drop is permitted:
 *   1. every source `_id` is present in `chapters`;
 *   2. no submission THIS PLAN COVERED still carries the old field;
 *   3. the per-Chapter submission counts match the plan's expectation exactly,
 *      so no submission silently lost its Chapter.
 *
 * SCOPED TO THE PLAN'S OWN SNAPSHOT (fixed 2026-08-17 after review). Checks 2
 * and 3 used to run as live full-collection re-counts against a plan-time
 * expectation. A player pressing Save during a long `--apply` therefore
 * produced "Verification FAILED after writing. Do NOT run --drop-source" —
 * indistinguishable, at the console, from genuine data loss. They now read only
 * the submissions the plan itself considered, so a new document is invisible to
 * them rather than alarming. Nothing is lost by that narrowing: `dropSource`'s
 * own guard 3 is a deliberately UNSCOPED full-collection sweep, and that is the
 * gate that actually protects the destructive step.
 *
 * Index parity is reported as a WARNING, not a problem: an unindexed copy is a
 * performance fault, not a data-loss one, and it must not make `--apply` print
 * "do NOT run --drop-source".
 */
export async function verifyRename(db, plan) {
  const target = db.collection(TARGET_COLLECTION);
  const subs = db.collection(SUBMISSIONS_COLLECTION);
  const problems = [];
  const warnings = [];

  const targetIds = new Set((await target.find({}).project({ _id: 1 }).toArray()).map(d => String(d._id)));
  for (const id of plan.sourceIds) {
    if (!targetIds.has(id)) problems.push(`${TARGET_COLLECTION} is missing _id ${id}.`);
  }

  const planned = plan.submissionIds || [];

  const stillOld = await subs.countDocuments({
    _id: { $in: planned },
    [OLD_FIELD]: { $exists: true },
  });
  if (stillOld > 0) {
    problems.push(`${stillOld} ${SUBMISSIONS_COLLECTION} document(s) from this plan still carry ${OLD_FIELD}.`);
  }

  const after = await subs
    .find({ _id: { $in: planned }, [NEW_FIELD]: { $nin: [null] } })
    .project({ [NEW_FIELD]: 1 })
    .toArray();
  const actual = new Map();
  for (const sub of after) {
    const key = String(sub[NEW_FIELD]);
    actual.set(key, (actual.get(key) || 0) + 1);
  }
  for (const [key, want] of plan.expectedCounts) {
    const got = actual.get(key) || 0;
    if (got !== want) {
      problems.push(`Chapter ${key} groups ${got} submission(s), expected ${want}.`);
    }
  }
  for (const [key, got] of actual) {
    if (!plan.expectedCounts.has(key)) {
      problems.push(`Chapter ${key} unexpectedly groups ${got} submission(s).`);
    }
  }

  // Index parity. A copy-then-upsert (deliberately chosen over a native
  // `renameCollection`, see the header) creates nothing but `_id_` on the
  // target, and neither the old verify nor `dropSource` looked.
  const missing = missingIndexes(await indexesOf(db, SOURCE_COLLECTION), await indexesOf(db, TARGET_COLLECTION));
  for (const ix of missing) {
    warnings.push(
      `${TARGET_COLLECTION} has no index matching ${SOURCE_COLLECTION}'s '${ix.name}' ` +
      `(${indexKeySignature(ix)}). Not data loss, but the copy is slower than the original was.`);
  }

  return { ok: problems.length === 0, problems, warnings };
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * Nothing at all is written while `plan.refusals` is non-empty — a refusal is
 * a full stop for the run, not a per-row skip, because the refusal conditions
 * all describe a database whose shape the plan no longer describes.
 *
 * @param {import('mongodb').Db} db
 * @param {object} plan - the output of `planRename`
 * @param {{ apply?: boolean, log?: Function }} opts
 */
export async function applyRename(db, plan, { apply = false, log = () => {} } = {}) {
  // DRY-RUN vs APPLY COUNTS ARE KEPT APART (fixed 2026-08-17 after review).
  // `alreadyPresent` used to be seeded from `plan.noops.length` whether or not
  // `--apply` was passed, so a genuine dry run printed a headline like
  // "0 copied, 3 already present, 0 field rename(s)" — one real figure among
  // placeholder zeros, with nothing saying which was which. The `would*` fields
  // carry the dry-run plan; the others stay zero until something is written.
  const drifted = plan.drifted || [];
  const result = {
    applied: !!apply,
    copied: 0,
    alreadyPresent: apply ? plan.noops.length + drifted.length : 0,
    fieldsRenamed: 0,
    staleFieldsCleared: 0,
    indexesCreated: 0,
    wouldCopy: apply ? 0 : plan.copies.length,
    wouldRename: apply ? 0 : plan.fieldRenames.length,
    wouldClear: apply ? 0 : (plan.bothFieldResolutions?.length || 0),
    planNoops: plan.noops.length,
    planDrifted: drifted.length,
    refused: plan.refusals.length,
    verified: null,
  };

  if (plan.refusals.length) {
    for (const r of plan.refusals) log(`  REFUSED  : ${r.detail}`);
    log('  Nothing was written. Every document is exactly as it was.');
    return result;
  }

  for (const row of drifted) {
    log(`  drifted  : _id ${row._id}` + (row.label ? ` ('${row.label}')` : '') +
        ` is already in ${TARGET_COLLECTION} and has since been EDITED there ` +
        `(${row.fields.join(', ')}). Expected during burn-in; ${TARGET_COLLECTION} is the live copy ` +
        `and is left exactly as it is.`);
  }

  // Everything below writes. An exception escaping here used to surface as a
  // bare error message from `main()`, after an unknown number of documents had
  // already been written, with none of the "nothing was written" narration the
  // refusal path gives. It now says what state the database is in.
  try {
    for (const row of plan.copies) {
      if (!apply) {
        log(`  [DRY RUN] would copy _id ${row._id} to ${TARGET_COLLECTION}` +
            (row.doc?.label ? ` ('${row.doc.label}')` : ''));
        continue;
      }
      // `_id` written VERBATIM. `$setOnInsert` makes this atomic
      // insert-or-nothing, so two overlapping runs cannot both create it and a
      // document that already exists is never clobbered.
      const { _id, ...fields } = row.doc;

      // A body-less source document (`{_id}` and nothing else — plausible test
      // residue, and `isStoryGroupingShaped` deliberately does not flag it as
      // suspicious) produces an EMPTY `$setOnInsert`, which MongoDB rejects
      // outright. A guarded insert does the same job for that one case.
      if (Object.keys(fields).length === 0) {
        try {
          await db.collection(TARGET_COLLECTION).insertOne({ _id });
          result.copied += 1;
          log(`  copied   : _id ${row._id} (body-less document; copied as {_id} alone)`);
        } catch (err) {
          if (err?.code === 11000) {
            result.alreadyPresent += 1;
            log(`  skip     : _id ${row._id} appeared in ${TARGET_COLLECTION} mid-run; left as found.`);
          } else throw err;
        }
        continue;
      }

      const res = await db.collection(TARGET_COLLECTION).updateOne(
        { _id },
        { $setOnInsert: fields },
        { upsert: true },
      );
      if (res.upsertedCount === 1) {
        result.copied += 1;
        log(`  copied   : _id ${row._id}` + (row.doc?.label ? ` ('${row.doc.label}')` : ''));
      } else {
        result.alreadyPresent += 1;
        log(`  skip     : _id ${row._id} appeared in ${TARGET_COLLECTION} mid-run; left as found.`);
      }
    }

    // ── --prefer-new: clear the stale old field on both-fields documents ──────
    // Only ever an $unset of `cycle_id`. `chapter_id` is never written to by this
    // branch, so the value the deployed app wrote is authoritative by
    // construction, not by trust.
    for (const row of plan.bothFieldResolutions || []) {
      const warn = row.clearsGrouping
        ? ` WARNING: ${NEW_FIELD} is null while ${OLD_FIELD} was '${row.discard}', so this submission` +
          ` (character ${row.character_id ?? '?'}) comes out ATTACHED TO NO CHAPTER. Re-point it by hand.`
        : '';
      if (!apply) {
        log(`  [DRY RUN] would keep ${NEW_FIELD}='${row.keep}' and clear stale ` +
            `${OLD_FIELD}='${row.discard}' on ${SUBMISSIONS_COLLECTION} _id ${row._id}.${warn}`);
        continue;
      }
      const res = await db.collection(SUBMISSIONS_COLLECTION).updateOne(
        { _id: row.idValue, [OLD_FIELD]: { $exists: true } },
        { $unset: { [OLD_FIELD]: '' } },
      );
      if (res.modifiedCount === 1) {
        result.staleFieldsCleared += 1;
        log(`  cleared  : ${SUBMISSIONS_COLLECTION} _id ${row._id} stale ${OLD_FIELD}='${row.discard}'; ` +
            `kept ${NEW_FIELD}='${row.keep}'.${warn}`);
      } else {
        log(`  skip     : ${SUBMISSIONS_COLLECTION} _id ${row._id} moved on since planning; left as found.`);
      }
    }

    if (plan.fieldRenames.length) {
      if (!apply) {
        log(`  [DRY RUN] would rename ${OLD_FIELD} -> ${NEW_FIELD} on ` +
            `${plan.fieldRenames.length} ${SUBMISSIONS_COLLECTION} document(s)`);
      } else {
        // SCOPED to exactly the planned `_id`s, not a blanket
        // `{ [OLD_FIELD]: { $exists: true } }`. A document that acquires
        // `cycle_id` between plan and apply never passed the dangling-ref or
        // both-fields checks, and `$rename` OVERWRITES its destination — so an
        // unscoped update could silently clobber that document's `chapter_id`.
        // Still naturally idempotent: the `$exists` clause is retained, so a
        // second run over the same ids matches nothing.
        const res = await db.collection(SUBMISSIONS_COLLECTION).updateMany(
          { _id: { $in: plan.fieldRenames.map(r => r.idValue) }, [OLD_FIELD]: { $exists: true } },
          { $rename: { [OLD_FIELD]: NEW_FIELD } },
        );
        result.fieldsRenamed = res.modifiedCount;
        log(`  renamed  : ${res.modifiedCount} ${SUBMISSIONS_COLLECTION} document(s) ` +
            `${OLD_FIELD} -> ${NEW_FIELD}`);
      }
    }

    // ── Index parity ──────────────────────────────────────────────────────────
    // A copy-then-upsert creates nothing on the target but `_id_`. A native
    // `renameCollection` would have carried the indexes across, but it is
    // deliberately rejected in this script's header (no dry run, no free
    // rollback, and TM Cockpit keeps writing to the source by name meanwhile), so
    // they are recreated here instead.
    {
      const sourceIndexes = await indexesOf(db, SOURCE_COLLECTION);
      const targetIndexes = await indexesOf(db, TARGET_COLLECTION);
      const missing = missingIndexes(sourceIndexes, targetIndexes);
      for (const ix of missing) {
        const opts = { name: ix.name };
        for (const k of ['unique', 'sparse', 'partialFilterExpression', 'expireAfterSeconds', 'collation', 'weights', 'default_language']) {
          if (ix[k] !== undefined) opts[k] = ix[k];
        }
        if (!apply) {
          log(`  [DRY RUN] would create index '${ix.name}' ${indexKeySignature(ix)} on ${TARGET_COLLECTION}`);
          continue;
        }
        await db.collection(TARGET_COLLECTION).createIndex(ix.key, opts);
        result.indexesCreated += 1;
        log(`  indexed  : created '${ix.name}' ${indexKeySignature(ix)} on ${TARGET_COLLECTION}`);
      }
    }

  } catch (err) {
    log(`  ABORTED  : ${err?.message || String(err)}`);
    log(`  This run is PARTIAL, not rolled back. ${result.copied} document(s) were copied to ` +
        `${TARGET_COLLECTION}, ${result.fieldsRenamed} ${SUBMISSIONS_COLLECTION} field rename(s) and ` +
        `${result.staleFieldsCleared} stale-field clear(s) were written before this failed.`);
    log(`  Nothing was DELETED — ${SOURCE_COLLECTION} is untouched, and the copy step is idempotent. ` +
        `Fix the cause, then re-run bare (dry run) to see what is left.`);
    throw err;
  }

  if (apply) {
    result.verified = await verifyRename(db, plan);
    if (result.verified.ok) {
      log('  verified : counts, ids and Chapter attachments all match.');
    } else {
      for (const p of result.verified.problems) log(`  VERIFY   : ${p}`);
    }
    for (const w of result.verified.warnings || []) log(`  NOTE     : ${w}`);
  }

  return result;
}

/**
 * Drop the source `downtime_cycles` collection. Separate, explicit, and
 * refused unless nothing would be lost by dropping it — this is the burn-in
 * gate.
 *
 * WHY THIS GATE IS DELIBERATELY NARROWER THAN `applyRename`'S REFUSALS
 *
 *   `applyRename` compares source and target bodies byte for byte, because it
 *   is about to COPY: a differing target under a source `_id` means the plan
 *   no longer describes the database, and copying over it could destroy
 *   something. Those checks stay exactly as they are, there.
 *
 *   `--drop-source` runs at the far end of a deliberately long burn-in during
 *   which `chapters` is the LIVE, actively-edited copy. An ST advancing a
 *   Chapter's phase in the Cycle tab is not a fault — it is the system working.
 *   Gating the drop on content equality would permanently block the drop.
 *
 *   The real question at drop time is only: IS ANYTHING ABOUT TO BE LOST.
 *   That is three checks, all structural, none about content:
 *     1. `chapters` is not empty (plus the two shape guards, which are about
 *        whether these are the collections we think at all);
 *     2. every source `_id` exists in `chapters`;
 *     3. no `downtime_submissions` document still points at the source by the
 *        old field name.
 *
 * @param {import('mongodb').Db} db
 * @param {{ apply?: boolean, log?: Function }} opts
 */
export async function dropSource(db, { apply = false, log = () => {} } = {}) {
  const existing = await db.listCollections({ name: SOURCE_COLLECTION }).toArray();
  if (!existing.length) {
    log(`  already dropped: no ${SOURCE_COLLECTION} collection exists. Nothing to do.`);
    return { dropped: false, alreadyDropped: true, refused: false, problems: [] };
  }

  const refuse = problems => {
    for (const p of problems) log(`  REFUSED  : ${p}`);
    return { dropped: false, alreadyDropped: false, refused: true, problems };
  };

  const fullSourceDocs = await db.collection(SOURCE_COLLECTION).find({}).toArray();
  const fullTargetDocs = await db.collection(TARGET_COLLECTION).find({}).toArray();

  // 0. Shape. The one that matters most here: this is the call that deletes a
  //    collection.
  const shapeRefusals = [
    ...sourceShapeRefusals(fullSourceDocs),
    ...targetShapeRefusals(fullTargetDocs),
  ];
  if (shapeRefusals.length) return refuse(shapeRefusals.map(r => r.detail));

  // 0b. Phantom Chapters — ADVISORY here, a refusal in `planRename`.
  //     After the cutover every genuinely NEW Chapter is created directly in
  //     `chapters` and has no source counterpart by design, so refusing on this
  //     would block the drop forever. It is not a loss either: dropping the
  //     source cannot lose a document that was never in the source. Named out
  //     loud so the operator can tell "expected new Chapters" from "the deploy
  //     went out before --apply did".
  const sourceIdSet = new Set(fullSourceDocs.map(d => String(d._id)));
  const phantoms = targetPhantomRefusals(fullTargetDocs, sourceIdSet);
  for (const p of phantoms) {
    log(`  NOTE     : ${TARGET_COLLECTION} _id ${p._id} has no ${SOURCE_COLLECTION} counterpart. ` +
        `Expected for Chapters created after the cutover; unexpected if --apply has only just run. ` +
        `Not a reason to refuse the drop — nothing in ${SOURCE_COLLECTION} is lost by it.`);
  }

  // 1. Target non-empty.
  if (fullTargetDocs.length === 0) {
    return refuse([`${TARGET_COLLECTION} is empty. Run --apply first; refusing to drop ${SOURCE_COLLECTION}.`]);
  }

  // 2. ID existence. Nothing about bodies: a Chapter legitimately edited during
  //    the burn-in still has its `_id` and is not lost.
  const targetIds = new Set(fullTargetDocs.map(d => String(d._id)));
  const missing = fullSourceDocs.map(d => String(d._id)).filter(id => !targetIds.has(id));
  if (missing.length) {
    return refuse(missing.map(id =>
      `${SOURCE_COLLECTION} _id ${id} has NO corresponding ${TARGET_COLLECTION} document. ` +
      `Dropping now would lose it. Run --apply first; refusing to drop ${SOURCE_COLLECTION}.`));
  }

  // 3. No submission still references the source by the old field name.
  const stillOld = await db.collection(SUBMISSIONS_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } });
  if (stillOld > 0) {
    return refuse([
      `${stillOld} ${SUBMISSIONS_COLLECTION} document(s) still carry ${OLD_FIELD}. Run --apply first; ` +
      `refusing to drop ${SOURCE_COLLECTION}.`]);
  }

  if (!apply) {
    log(`  [DRY RUN] every ${SOURCE_COLLECTION} _id is present in ${TARGET_COLLECTION} and no ` +
        `${SUBMISSIONS_COLLECTION} document carries ${OLD_FIELD}; would drop ${SOURCE_COLLECTION} ` +
        `(${fullSourceDocs.length} document(s)).`);
    return { dropped: false, alreadyDropped: false, refused: false, problems: [] };
  }

  await db.collection(SOURCE_COLLECTION).drop();
  log(`  dropped  : ${SOURCE_COLLECTION}. TM Suite now reads ${TARGET_COLLECTION} only.`);
  return { dropped: true, alreadyDropped: false, refused: false, problems: [] };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const drop = argv.includes('--drop-source');
  const preferNew = argv.includes('--prefer-new');
  const dbName = process.env.MONGODB_DB || 'tm_game';

  console.log(`Mode     : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Step     : ${drop ? `DROP SOURCE (${SOURCE_COLLECTION})` : `RENAME (${SOURCE_COLLECTION} -> ${TARGET_COLLECTION})`}`);
  if (preferNew && !drop) {
    console.log(`Recovery : --prefer-new (a both-fields submission keeps ${NEW_FIELD}, stale ${OLD_FIELD} cleared)`);
  }
  console.log(`Target DB: ${dbName}`);
  console.log('');

  await connectDb();
  let failed = false;
  try {
    const db = getDb();

    if (drop) {
      const res = await dropSource(db, { apply, log: msg => console.log(msg) });
      console.log('');
      if (res.refused) {
        failed = true;
        console.log('Refused. Nothing was dropped and nothing else changed.');
      } else if (res.alreadyDropped) {
        console.log('Already dropped. Nothing to do.');
      } else if (res.dropped) {
        console.log(`Dropped ${SOURCE_COLLECTION}. Confirm with db.getCollectionNames().`);
      } else {
        console.log('Re-run with --drop-source --apply to drop.');
      }
      return;
    }

    const plan = await planRename(db, { preferNew });
    console.log(`${SOURCE_COLLECTION}: ${plan.sourceCount} document(s). ` +
                `${TARGET_COLLECTION}: ${plan.targetCount} document(s).`);
    if (plan.wrongShape) {
      console.log('');
      console.log(`WRONG COLLECTION SHAPE. Refusing to plan anything.`);
    } else {
      console.log(`${plan.copies.length} to copy, ${plan.noops.length} already present, ` +
                  ((plan.drifted || []).length
                    ? `${plan.drifted.length} already present and edited since (burn-in drift), `
                    : '') +
                  `${plan.fieldRenames.length} ${SUBMISSIONS_COLLECTION} field rename(s)` +
                  (plan.bothFieldResolutions.length
                    ? `, ${plan.bothFieldResolutions.length} stale ${OLD_FIELD} to clear (--prefer-new)`
                    : '') + '.');
    }
    console.log('');

    const res = await applyRename(db, plan, { apply, log: msg => console.log(msg) });
    console.log('');
    // The dry-run and apply headlines are DIFFERENT SENTENCES on purpose. One
    // line mixing a real count with placeholder zeros, with nothing marking
    // which was which, is the line an operator reads as the result of the run.
    if (res.applied) {
      console.log(`Totals: ${res.copied} copied, ${res.alreadyPresent} already present, ` +
                  `${res.fieldsRenamed} field rename(s), ` +
                  `${res.staleFieldsCleared} stale field(s) cleared, ` +
                  `${res.indexesCreated} index(es) created, ` +
                  `${res.refused} refusal(s).`);
    } else {
      console.log(`Totals (DRY RUN — nothing was written): would copy ${res.wouldCopy}, ` +
                  `${res.planNoops} already present` +
                  (res.planDrifted ? ` (+${res.planDrifted} present and edited since)` : '') +
                  `, would rename ${res.wouldRename} field(s), ` +
                  `would clear ${res.wouldClear} stale field(s), ` +
                  `${res.refused} refusal(s).`);
    }

    if (res.refused) {
      failed = true;
      console.log('');
      console.log('One or more refusals. NOTHING was written; every document is exactly as it was.');
      if (plan.refusals.some(r => r.kind === 'target-shape')) {
        console.log(`TARGET-SHAPE refusal: '${TARGET_COLLECTION}' still holds cm-2's Story-groupings.`);
        console.log('Finish cm-2 first (--drop-source --apply), which frees the name.');
      } else if (plan.refusals.some(r => r.kind === 'source-shape')) {
        console.log(`SOURCE-SHAPE refusal: '${SOURCE_COLLECTION}' holds Story-grouping documents.`);
        console.log('Work out how they got there before doing anything else.');
      } else if (plan.refusals.some(r => r.kind === 'target-phantom')) {
        console.log(`TARGET-PHANTOM refusal: '${TARGET_COLLECTION}' already holds Chapter(s) that`);
        console.log(`'${SOURCE_COLLECTION}' does not. That is the signature of the application code`);
        console.log('having deployed BEFORE --apply ran. Decide what happens to each by hand first.');
      } else if (plan.refusals.some(r => r.kind === 'both-fields')) {
        console.log(`Both-fields refusal: re-run with --prefer-new to keep ${NEW_FIELD} and clear`);
        console.log(`the stale ${OLD_FIELD}. Preview it bare first; see the recovery runbook in this`);
        console.log('script\'s header comment.');
      } else {
        console.log('Decide what should happen to each, by hand, then re-run.');
      }
    } else if (res.verified && !res.verified.ok) {
      failed = true;
      console.log('');
      console.log('Verification FAILED after writing. Do NOT run --drop-source. See the VERIFY lines above.');
    } else if (apply) {
      console.log('Idempotency check: re-run with --apply and confirm "0 copied, 0 field rename(s)".');
      console.log('Then burn in. Only after that: --drop-source --apply.');
    } else {
      console.log('Re-run with --apply to write.');
    }
  } finally {
    await closeDb();
    if (failed) process.exitCode = 1;
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
