/**
 * cm-2 migration: rename the `chapters` collection to `story_cycles`, rename
 * `downtime_cycles.chapter_id` to `story_cycle_id`, and relabel the documents
 * from "Chapter N" to "Story N". Manual, ST-invoked, one-off. Nothing calls
 * this on server boot and nothing calls it in test setup; the vitest suite
 * imports its exported functions and runs them against `tm_suite_test` only.
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
 *   a copy, `chapters` sits untouched and unread by the deployed code as a
 *   zero-cost rollback for the whole burn-in.
 *
 *   `--drop-source` is therefore a SEPARATE opt-in flag from `--apply`. That
 *   is load-bearing for sequencing, not fussiness: cm-2b renames
 *   `downtime_cycles` -> `chapters`, and MongoDB will not hold two collections
 *   of that name, so cm-2b literally cannot start until the drop has happened.
 *   The burn-in gate is mechanical: `db.getCollectionNames()` must not contain
 *   `chapters`.
 *
 * `_id` PRESERVATION IS NON-NEGOTIABLE
 *
 *   `downtime_cycles.chapter_id` holds those `_id`s AS STRINGS. A copy that
 *   lets Mongo mint fresh `_id`s produces a `story_cycles` collection that
 *   looks correct and is joined to nothing. Every copy here writes the source
 *   `_id` verbatim.
 *
 * RELABELLING (relayed via the coordinating session as Angelus's direct chat
 * instruction, 2026-08-16 — overriding the story's own Open Q3)
 *
 *   The three live documents are labelled "Chapter 1" / "Chapter 2" /
 *   "Chapter 3" while holding Stories. Since the collection and the whole
 *   ST-facing Cycle tab move to Story vocabulary, the labels move with them:
 *   "Chapter N" -> "Story N", taking N from the document's own `number` field.
 *   The naming was settled by `cycle-model.md` §11a (added 2026-08-16), which
 *   is the ruling that fixes the collection names for cm-2 and cm-2b. §4 is
 *   NOT the authority here: it is explicitly headed "UNDER REVIEW with Symon
 *   ... Pending, do not treat as final", and names cm-2's own collection
 *   naming as one of the things awaiting that review. §4 is cited only as the
 *   descriptive precedent for the "<Tier> <N>" *form* ("Chapter 7"), which
 *   makes "Story 2" its sibling one tier up; live
 *   `game_sessions.chapter_label` already contains the string "Story 2,
 *   Chapter 2", which is that convention written by hand.
 *
 *   A label is only rewritten when it is EXACTLY "Chapter <n>" (any spacing,
 *   any case) AND <n> matches the document's own `number`. Anything richer
 *   ("Chapter Two: The Price of Power") is left verbatim and reported, because
 *   rewriting ST-authored prose would be guessing. Already-"Story <n>" labels
 *   are recognised as done, which is what makes the relabel idempotent.
 *
 * Usage. Run it from `server/` (`node scripts/cm-2-...`). Note that
 * `dotenv/config` here resolves the REPO-ROOT `.env`, not `server/.env` —
 * verified by running it, which prints `injecting env (4) from ..\.env`. Both
 * files hold live Atlas URIs, so this is not a safety difference, but do not
 * assume an override placed in `server/.env` will be picked up.
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/cm-2-chapters-to-story-cycles.mjs
 *
 *   # write (copies + field rename + relabel; does NOT drop `chapters`):
 *   node scripts/cm-2-chapters-to-story-cycles.mjs --apply
 *
 *   # much later, after the burn-in, to free the name for cm-2b:
 *   node scripts/cm-2-chapters-to-story-cycles.mjs --drop-source --apply
 *
 *   # against the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/cm-2-chapters-to-story-cycles.mjs --apply
 *
 * REFUSALS. Every one of these leaves every document exactly as it was:
 *
 *   - SOURCE SHAPE. A `chapters` document carrying `phase`, `game_number` or
 *     `game_phase` is a DOWNTIME CYCLE, not a Story-grouping. See the guard
 *     below; this is the one refusal that must never be talked past.
 *   - `story_cycles` already holds a document under a source `_id` whose body
 *     differs from what would be written (and is not simply the same document
 *     awaiting its relabel);
 *   - a `downtime_cycles` document carries BOTH `chapter_id` and
 *     `story_cycle_id` (a `$rename` would silently discard one of them);
 *   - a `chapter_id` value resolves to no document in `chapters` (a dangling
 *     reference; live data has none, but a guess here would invent a grouping).
 *
 * THE SOURCE-SHAPE GUARD, AND WHY IT EXISTS
 *
 *   cm-2b renames `downtime_cycles` -> `chapters`. After cm-2b ships, a
 *   collection called `chapters` still exists — but it holds game cycles, not
 *   Story-groupings. Without a guard, re-running this script at that point
 *   (someone repeating the "documented ritual" from memory) would copy every
 *   real downtime cycle into `story_cycles` as though it were a Story, and a
 *   subsequent `--drop-source --apply` would then DELETE THE ENTIRE LIVE
 *   `downtime_cycles` DATA SET. Nothing in the plan output would have looked
 *   wrong: a document like `{ label: 'Downtime 5', number: undefined }` trips
 *   none of the other refusals. `sourceShapeRefusals` closes that, and it is
 *   evaluated by BOTH `planRename` and `dropSource` so neither entry point can
 *   be reached around it.
 *
 * RECOVERY: THE BOTH-FIELDS STATE, AND `--prefer-new`
 *
 *   Between the deploy and the migration run, the deployed client writes
 *   `story_cycle_id` while live cycles still carry `chapter_id`. One ST touch
 *   of a Story dropdown in that window leaves a cycle carrying BOTH, which is
 *   a refusal — and a refusal is all-or-nothing for the whole run.
 *
 *   `--prefer-new` is the documented way out. It treats `story_cycle_id` as
 *   authoritative (it is the value the live, deployed system wrote most
 *   recently) and `$unset`s the stale `chapter_id`, instead of refusing. It
 *   NEVER changes the value of `story_cycle_id`; the only write is the removal
 *   of the old field. It is opt-in, it is listed line by line in the dry run,
 *   and it warns explicitly when the surviving value is null while the
 *   discarded one was not — that means the ST cleared the grouping (in that
 *   window the Story dropdown is empty, so "— none —" is the only option they
 *   could have picked), and the cycle will come out of the migration
 *   ungrouped. Re-select the Story in the Cycle tab afterwards; the plan
 *   prints which cycles need it.
 *
 *   Runbook when a run refuses with `both-fields`:
 *     1. `node scripts/cm-2-chapters-to-story-cycles.mjs --prefer-new`
 *        — dry run. Read every `both-fields` line, and every `WARNING` line
 *        about a null survivor, and note those cycles' labels.
 *     2. `node scripts/cm-2-chapters-to-story-cycles.mjs --prefer-new --apply`.
 *     3. Re-run bare (no `--prefer-new`) and confirm `0 copied, 0 relabelled,
 *        0 field rename(s)` and no refusals.
 *     4. Re-select the Story in the Cycle tab for any cycle step 1 warned
 *        about.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getDb, closeDb } from '../db.js';

export const SOURCE_COLLECTION = 'chapters';
export const TARGET_COLLECTION = 'story_cycles';
export const OLD_FIELD = 'chapter_id';
export const NEW_FIELD = 'story_cycle_id';
export const CYCLES_COLLECTION = 'downtime_cycles';

/** "Chapter 3", "chapter  3" — the auto-relabellable shape, and nothing else. */
const PLAIN_CHAPTER_LABEL = /^chapter\s+(\d+)$/i;
/** "Story 3" — already migrated. */
const PLAIN_STORY_LABEL = /^story\s+(\d+)$/i;

/**
 * Fields a `downtime_cycles` document carries and a Story-grouping document
 * never does. A Story-grouping is `{ _id, number, label, created_at }` and
 * nothing else (verified against all three live documents, 2026-08-16).
 *
 * This is the discriminator behind the source-shape guard described in the
 * header: after cm-2b, a collection named `chapters` holds game cycles, and
 * re-running this script against it would be catastrophic.
 */
export const DOWNTIME_CYCLE_MARKERS = ['phase', 'game_number', 'game_phase'];

/**
 * PURE. Returns a refusal per source document that looks like a downtime cycle
 * rather than a Story-grouping. An empty array means the collection is the one
 * this script was built for.
 *
 * @param {Array<object>} sourceDocs
 */
export function sourceShapeRefusals(sourceDocs) {
  const refusals = [];
  for (const doc of sourceDocs || []) {
    const markers = DOWNTIME_CYCLE_MARKERS
      .filter(f => Object.prototype.hasOwnProperty.call(doc, f));
    if (!markers.length) continue;
    refusals.push({
      kind: 'source-shape',
      _id: String(doc._id),
      detail:
        `${SOURCE_COLLECTION} _id ${String(doc._id)} carries ${markers.join(', ')}, which a ` +
        `Story-grouping document never has. THIS DOES NOT LOOK LIKE THE COLLECTION THIS SCRIPT ` +
        `WAS BUILT FOR — it looks like a ${CYCLES_COLLECTION} document. cm-2b renames ` +
        `${CYCLES_COLLECTION} -> ${SOURCE_COLLECTION}, so if cm-2b has already shipped then cm-2 ` +
        `has already run and must NOT be run again: copying these into ${TARGET_COLLECTION} and ` +
        `then running --drop-source would delete the live ${CYCLES_COLLECTION} data set. ` +
        `Refusing outright. This is not the same as the other refusals, which are about the ` +
        `state of a migration that is genuinely in progress.`,
    });
  }
  return refusals;
}

/**
 * Decide what a source document's label should become.
 *
 * PURE. Returns one of:
 *   { action: 'relabel',   label }  - rewrite to `label`
 *   { action: 'unchanged', label }  - already "Story <number>"; leave it
 *   { action: 'kept',      label }  - ST-authored prose or an unrecognised
 *                                     shape; left verbatim, reported so it can
 *                                     be hand-edited in the admin UI
 *
 * The empty-string fallback below exists ONLY so the regexes have a string to
 * match against. It must never leak into what gets written: a 'kept' result
 * returns `doc.label` VERBATIM — including `undefined` for a document with no
 * `label` field at all, and a number for a non-string one. Coercing here would
 * fabricate `label: ''` on a copy of a document that never had the field, and
 * would silently destroy a non-string label.
 */
export function planLabel(doc) {
  const label = typeof doc.label === 'string' ? doc.label : '';
  const trimmed = label.trim();

  const story = PLAIN_STORY_LABEL.exec(trimmed);
  if (story && Number(story[1]) === doc.number) {
    return { action: 'unchanged', label };
  }

  const chapter = PLAIN_CHAPTER_LABEL.exec(trimmed);
  if (chapter && Number(chapter[1]) === doc.number) {
    return { action: 'relabel', label: `Story ${doc.number}` };
  }

  return { action: 'kept', label: doc.label };
}

/** Canonical (key-sorted) JSON, so field insertion order never fakes a diff. */
function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return JSON.stringify(value);
}

/** Everything except `label` — the part that must match verbatim on a re-run. */
function bodyWithoutLabel(doc) {
  const { label: _label, ...rest } = doc || {};
  return canonicalJSON({ ...rest, _id: String(rest._id) });
}

/**
 * Read both collections and the cycle references, and build the complete plan.
 *
 * PURE with respect to the database: reads only, no writes, so `main()` can
 * print the whole thing before anyone decides to run it. The `db` handle is an
 * ARGUMENT rather than resolved internally, so a test can hand over
 * `tm_suite_test` and this can never reach live data by accident.
 *
 * @param {import('mongodb').Db} db
 * @param {{ preferNew?: boolean }} [opts] - `preferNew` turns a `both-fields`
 *   refusal into a resolution that keeps `story_cycle_id` and `$unset`s the
 *   stale `chapter_id`. See the header's recovery runbook.
 */
export async function planRename(db, { preferNew = false } = {}) {
  const source = db.collection(SOURCE_COLLECTION);
  const target = db.collection(TARGET_COLLECTION);
  const cycles = db.collection(CYCLES_COLLECTION);

  const sourceDocs = await source.find({}).toArray();

  // ── Source-shape guard ────────────────────────────────────────────────────
  // Evaluated FIRST and returned early. If `chapters` is not the collection
  // this script was built for, every subsequent computation is meaningless and
  // printing a plan over it would be actively misleading.
  const shapeRefusals = sourceShapeRefusals(sourceDocs);
  if (shapeRefusals.length) {
    return {
      sourceCount: sourceDocs.length,
      targetCount: await target.countDocuments({}),
      copies: [], relabels: [], noops: [], keptLabels: [],
      fieldRenames: [], bothFieldResolutions: [],
      expectedCounts: new Map(),
      refusals: shapeRefusals,
      sourceIds: [],
      wrongSourceShape: true,
    };
  }

  const targetDocs = await target.find({}).toArray();
  const targetById = new Map(targetDocs.map(d => [String(d._id), d]));
  const sourceIds = new Set(sourceDocs.map(d => String(d._id)));

  const refusals = [];
  const copies = [];
  const relabels = [];
  const noops = [];
  const keptLabels = [];

  for (const doc of sourceDocs) {
    const id = String(doc._id);
    const labelPlan = planLabel(doc);
    if (labelPlan.action === 'kept' && /chapter/i.test(String(doc.label || ''))) {
      keptLabels.push({ _id: id, label: doc.label });
    }
    // A 'kept' document's `label` is carried across VERBATIM — the key is not
    // rewritten, so a document with no `label` field keeps not having one
    // rather than acquiring a fabricated `label: null` on the copy.
    const targetDoc = labelPlan.action === 'kept' ? { ...doc } : { ...doc, label: labelPlan.label };
    const existing = targetById.get(id);

    if (!existing) {
      copies.push({ _id: id, doc: targetDoc, oldLabel: doc.label, newLabel: labelPlan.label });
      continue;
    }

    const sameBody = bodyWithoutLabel(existing) === bodyWithoutLabel(targetDoc);
    if (!sameBody) {
      refusals.push({
        kind: 'target-differs',
        _id: id,
        detail: `${TARGET_COLLECTION} already holds a DIFFERENT document under _id ${id}.`,
      });
      continue;
    }

    if (existing.label === labelPlan.label) {
      noops.push({ _id: id, label: existing.label });
    } else if (existing.label === doc.label) {
      // Copied by an earlier run, not yet relabelled. Safe to finish the job.
      // `idValue` keeps the REAL key (an ObjectId here) alongside its string
      // form: `_id` is the human-readable identifier used in log lines, but a
      // string will not match an ObjectId-keyed document in a query filter.
      relabels.push({ _id: id, idValue: existing._id, oldLabel: existing.label, newLabel: labelPlan.label });
    } else {
      refusals.push({
        kind: 'target-differs',
        _id: id,
        detail: `${TARGET_COLLECTION} _id ${id} carries an unexpected label ` +
                `'${existing.label}' (source '${doc.label}', target '${labelPlan.label}').`,
      });
    }
  }

  // ── downtime_cycles field rename ──────────────────────────────────────────
  const cycleDocs = await cycles
    .find({ $or: [{ [OLD_FIELD]: { $exists: true } }, { [NEW_FIELD]: { $exists: true } }] })
    .project({ [OLD_FIELD]: 1, [NEW_FIELD]: 1, game_number: 1 })
    .toArray();

  const fieldRenames = [];
  const bothFieldResolutions = [];
  // Expected post-state grouping, counted across BOTH field names so it is
  // stable whether this is a first run or a re-run.
  const expectedCounts = new Map();

  for (const cy of cycleDocs) {
    const hasOld = Object.prototype.hasOwnProperty.call(cy, OLD_FIELD);
    const hasNew = Object.prototype.hasOwnProperty.call(cy, NEW_FIELD);

    if (hasOld && hasNew) {
      if (!preferNew) {
        refusals.push({
          kind: 'both-fields',
          _id: String(cy._id),
          detail: `${CYCLES_COLLECTION} _id ${String(cy._id)} carries BOTH ${OLD_FIELD} and ` +
                  `${NEW_FIELD}; a $rename would silently discard one. Re-run with --prefer-new ` +
                  `to keep ${NEW_FIELD} (what the deployed app wrote most recently) and clear the ` +
                  `stale ${OLD_FIELD}.`,
        });
        continue;
      }
      const keep = cy[NEW_FIELD];
      const discard = cy[OLD_FIELD];
      bothFieldResolutions.push({
        _id: String(cy._id),
        idValue: cy._id,
        keep: keep === null || keep === undefined ? null : String(keep),
        discard: discard === null || discard === undefined ? null : String(discard),
        // The ST cleared the grouping in the deploy/migrate window, where the
        // Story dropdown had nothing in it to pick but "none". Not an error,
        // but it does mean this cycle comes out ungrouped.
        clearsGrouping: (keep === null || keep === undefined) && discard !== null && discard !== undefined,
        game_number: cy.game_number,
      });
      if (keep !== null && keep !== undefined) {
        const key = String(keep);
        expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);
      }
      continue;
    }

    const ref = hasOld ? cy[OLD_FIELD] : cy[NEW_FIELD];

    if (hasOld) {
      if (ref !== null && ref !== undefined && !sourceIds.has(String(ref))) {
        refusals.push({
          kind: 'dangling-ref',
          _id: String(cy._id),
          detail: `${CYCLES_COLLECTION} _id ${String(cy._id)} has ${OLD_FIELD}='${String(ref)}' ` +
                  `which resolves to no ${SOURCE_COLLECTION} document.`,
        });
        continue;
      }
      // `idValue` carries the REAL key alongside its display string, so the
      // $rename can be scoped to exactly the planned documents — see the
      // scoped `updateMany` filter in `applyRename`.
      fieldRenames.push({
        _id: String(cy._id),
        idValue: cy._id,
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
    relabels,
    noops,
    keptLabels,
    fieldRenames,
    bothFieldResolutions,
    expectedCounts,
    refusals,
    sourceIds: [...sourceIds],
    wrongSourceShape: false,
  };
}

/**
 * Verify the post-state. Reads only. Returns `{ ok, problems }`.
 *
 * Three checks, all of which must hold before any drop is permitted:
 *   1. every source `_id` is present in `story_cycles`;
 *   2. no `downtime_cycles` document still carries the old field;
 *   3. the per-story-cycle cycle counts match the plan's expectation exactly,
 *      so no cycle silently lost its grouping.
 */
export async function verifyRename(db, plan) {
  const target = db.collection(TARGET_COLLECTION);
  const cycles = db.collection(CYCLES_COLLECTION);
  const problems = [];

  const targetIds = new Set((await target.find({}).project({ _id: 1 }).toArray()).map(d => String(d._id)));
  for (const id of plan.sourceIds) {
    if (!targetIds.has(id)) problems.push(`${TARGET_COLLECTION} is missing _id ${id}.`);
  }

  const stillOld = await cycles.countDocuments({ [OLD_FIELD]: { $exists: true } });
  if (stillOld > 0) {
    problems.push(`${stillOld} ${CYCLES_COLLECTION} document(s) still carry ${OLD_FIELD}.`);
  }

  const after = await cycles
    .find({ [NEW_FIELD]: { $nin: [null] } })
    .project({ [NEW_FIELD]: 1 })
    .toArray();
  const actual = new Map();
  for (const cy of after) {
    const key = String(cy[NEW_FIELD]);
    actual.set(key, (actual.get(key) || 0) + 1);
  }
  for (const [key, want] of plan.expectedCounts) {
    const got = actual.get(key) || 0;
    if (got !== want) {
      problems.push(`Story cycle ${key} groups ${got} cycle(s), expected ${want}.`);
    }
  }
  for (const [key, got] of actual) {
    if (!plan.expectedCounts.has(key)) {
      problems.push(`Story cycle ${key} unexpectedly groups ${got} cycle(s).`);
    }
  }

  return { ok: problems.length === 0, problems };
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
  const result = {
    copied: 0, relabelled: 0, alreadyPresent: plan.noops.length,
    fieldsRenamed: 0, staleFieldsCleared: 0, refused: plan.refusals.length,
    labelsKept: plan.keptLabels.length, verified: null,
  };

  if (plan.refusals.length) {
    for (const r of plan.refusals) log(`  REFUSED  : ${r.detail}`);
    log('  Nothing was written. Every document is exactly as it was.');
    return result;
  }

  for (const row of plan.copies) {
    if (!apply) {
      log(`  [DRY RUN] would copy _id ${row._id} to ${TARGET_COLLECTION}` +
          (row.oldLabel === row.newLabel ? '' : ` and relabel '${row.oldLabel}' -> '${row.newLabel}'`));
      continue;
    }
    // `_id` written VERBATIM. `$setOnInsert` makes this atomic
    // insert-or-nothing, so two overlapping runs cannot both create it and a
    // document that already exists is never clobbered.
    const { _id, ...fields } = row.doc;
    const res = await db.collection(TARGET_COLLECTION).updateOne(
      { _id },
      { $setOnInsert: fields },
      { upsert: true },
    );
    if (res.upsertedCount === 1) {
      result.copied += 1;
      log(`  copied   : _id ${row._id}` +
          (row.oldLabel === row.newLabel ? '' : ` (relabelled '${row.oldLabel}' -> '${row.newLabel}')`));
    } else {
      result.alreadyPresent += 1;
      log(`  skip     : _id ${row._id} appeared in ${TARGET_COLLECTION} mid-run; left as found.`);
    }
  }

  for (const row of plan.relabels) {
    if (!apply) {
      log(`  [DRY RUN] would relabel _id ${row._id}: '${row.oldLabel}' -> '${row.newLabel}'`);
      continue;
    }
    const res = await db.collection(TARGET_COLLECTION).updateOne(
      { _id: row.idValue, label: row.oldLabel },
      { $set: { label: row.newLabel } },
    );
    if (res.modifiedCount === 1) {
      result.relabelled += 1;
      log(`  relabel  : _id ${row._id}: '${row.oldLabel}' -> '${row.newLabel}'`);
    } else {
      log(`  skip     : _id ${row._id} label moved on since planning; left as found.`);
    }
  }

  // ── --prefer-new: clear the stale old field on both-fields documents ──────
  // Only ever an $unset of `chapter_id`. `story_cycle_id` is never written to
  // by this branch, so the value the deployed app wrote is authoritative by
  // construction, not by trust.
  for (const row of plan.bothFieldResolutions || []) {
    const warn = row.clearsGrouping
      ? ` WARNING: ${NEW_FIELD} is null while ${OLD_FIELD} was '${row.discard}', so this cycle` +
        ` (game ${row.game_number ?? '?'}) comes out UNGROUPED. Re-select its Story in the Cycle tab.`
      : '';
    if (!apply) {
      log(`  [DRY RUN] would keep ${NEW_FIELD}='${row.keep}' and clear stale ` +
          `${OLD_FIELD}='${row.discard}' on ${CYCLES_COLLECTION} _id ${row._id}.${warn}`);
      continue;
    }
    const res = await db.collection(CYCLES_COLLECTION).updateOne(
      { _id: row.idValue, [OLD_FIELD]: { $exists: true } },
      { $unset: { [OLD_FIELD]: '' } },
    );
    if (res.modifiedCount === 1) {
      result.staleFieldsCleared += 1;
      log(`  cleared  : ${CYCLES_COLLECTION} _id ${row._id} stale ${OLD_FIELD}='${row.discard}'; ` +
          `kept ${NEW_FIELD}='${row.keep}'.${warn}`);
    } else {
      log(`  skip     : ${CYCLES_COLLECTION} _id ${row._id} moved on since planning; left as found.`);
    }
  }

  if (plan.fieldRenames.length) {
    if (!apply) {
      log(`  [DRY RUN] would rename ${OLD_FIELD} -> ${NEW_FIELD} on ` +
          `${plan.fieldRenames.length} ${CYCLES_COLLECTION} document(s)`);
    } else {
      // SCOPED to exactly the planned `_id`s, not a blanket
      // `{ [OLD_FIELD]: { $exists: true } }`. A document that acquires
      // `chapter_id` between plan and apply never passed the dangling-ref or
      // both-fields checks, and `$rename` OVERWRITES its destination — so an
      // unscoped update could silently clobber that document's
      // `story_cycle_id`. Still naturally idempotent: the `$exists` clause is
      // retained, so a second run over the same ids matches nothing.
      const res = await db.collection(CYCLES_COLLECTION).updateMany(
        { _id: { $in: plan.fieldRenames.map(r => r.idValue) }, [OLD_FIELD]: { $exists: true } },
        { $rename: { [OLD_FIELD]: NEW_FIELD } },
      );
      result.fieldsRenamed = res.modifiedCount;
      log(`  renamed  : ${res.modifiedCount} ${CYCLES_COLLECTION} document(s) ` +
          `${OLD_FIELD} -> ${NEW_FIELD}`);
    }
  }

  for (const kept of plan.keptLabels) {
    log(`  label    : _id ${kept._id} keeps its ST-authored label '${kept.label}'. ` +
        'Not auto-rewritten; edit it by hand in the Cycle tab if you want it to say Story.');
  }

  if (apply) {
    result.verified = await verifyRename(db, plan);
    if (result.verified.ok) {
      log('  verified : counts, ids and groupings all match.');
    } else {
      for (const p of result.verified.problems) log(`  VERIFY   : ${p}`);
    }
  }

  return result;
}

/**
 * Drop the source `chapters` collection. Separate, explicit, and refused
 * unless nothing would be lost by dropping it — this is the burn-in gate.
 *
 * WHY THIS GATE IS DELIBERATELY NARROWER THAN `applyRename`'S REFUSALS
 *
 *   `applyRename` compares source and target bodies byte for byte, because it
 *   is about to COPY: a differing target under a source `_id` means the plan
 *   no longer describes the database, and copying over it could destroy
 *   something. Those checks stay exactly as they are, there.
 *
 *   `--drop-source` runs at the far end of a deliberately long burn-in during
 *   which `story_cycles` is the LIVE, actively-edited copy. An ST renaming a
 *   Story in the Cycle tab is not a fault — it is the system working. Gating
 *   the drop on content equality would mean the script's own printed advice
 *   ("edit it by hand in the Cycle tab if you want it to say Story") produces
 *   a state that permanently blocks the drop, with no override, and therefore
 *   permanently blocks cm-2b.
 *
 *   The real question at drop time is only: IS ANYTHING ABOUT TO BE LOST.
 *   That is three checks, all structural, none about content:
 *     1. the source-shape guard (this is genuinely the collection we think);
 *     2. every source `_id` exists in `story_cycles`;
 *     3. no `downtime_cycles` document still points at the source by the old
 *        field name.
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

  const sourceDocs = await db.collection(SOURCE_COLLECTION).find({}).project({ _id: 1 }).toArray();
  const fullSourceDocs = await db.collection(SOURCE_COLLECTION).find({}).toArray();

  // 1. Source shape. The one that matters most here: this is the call that
  //    deletes a collection.
  const shapeRefusals = sourceShapeRefusals(fullSourceDocs);
  if (shapeRefusals.length) return refuse(shapeRefusals.map(r => r.detail));

  const targetCount = await db.collection(TARGET_COLLECTION).countDocuments({});
  if (targetCount === 0) {
    return refuse([`${TARGET_COLLECTION} is empty. Run --apply first; refusing to drop ${SOURCE_COLLECTION}.`]);
  }

  // 2. ID existence. Nothing about labels or bodies: a Story legitimately
  //    renamed during the burn-in still has its `_id` and is not lost.
  const targetIds = new Set(
    (await db.collection(TARGET_COLLECTION).find({}).project({ _id: 1 }).toArray()).map(d => String(d._id)),
  );
  const missing = sourceDocs.map(d => String(d._id)).filter(id => !targetIds.has(id));
  if (missing.length) {
    return refuse(missing.map(id =>
      `${SOURCE_COLLECTION} _id ${id} has NO corresponding ${TARGET_COLLECTION} document. ` +
      `Dropping now would lose it. Run --apply first; refusing to drop ${SOURCE_COLLECTION}.`));
  }

  // 3. No cycle still references the source by the old field name.
  const stillOld = await db.collection(CYCLES_COLLECTION).countDocuments({ [OLD_FIELD]: { $exists: true } });
  if (stillOld > 0) {
    return refuse([
      `${stillOld} ${CYCLES_COLLECTION} document(s) still carry ${OLD_FIELD}. Run --apply first; ` +
      `refusing to drop ${SOURCE_COLLECTION}.`]);
  }

  if (!apply) {
    log(`  [DRY RUN] every ${SOURCE_COLLECTION} _id is present in ${TARGET_COLLECTION} and no ` +
        `${CYCLES_COLLECTION} document carries ${OLD_FIELD}; would drop ${SOURCE_COLLECTION} ` +
        `(${sourceDocs.length} document(s)).`);
    return { dropped: false, alreadyDropped: false, refused: false, problems: [] };
  }

  await db.collection(SOURCE_COLLECTION).drop();
  log(`  dropped  : ${SOURCE_COLLECTION}. The name is now free for cm-2b.`);
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
    console.log(`Recovery : --prefer-new (a both-fields cycle keeps ${NEW_FIELD}, stale ${OLD_FIELD} cleared)`);
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
        console.log(`Dropped ${SOURCE_COLLECTION}. Confirm with db.getCollectionNames() — cm-2b is unblocked.`);
      } else {
        console.log('Re-run with --drop-source --apply to drop.');
      }
      return;
    }

    const plan = await planRename(db, { preferNew });
    console.log(`${SOURCE_COLLECTION}: ${plan.sourceCount} document(s). ` +
                `${TARGET_COLLECTION}: ${plan.targetCount} document(s).`);
    if (plan.wrongSourceShape) {
      console.log('');
      console.log(`WRONG SOURCE SHAPE. '${SOURCE_COLLECTION}' does not hold Story-groupings.`);
    } else {
      console.log(`${plan.copies.length} to copy, ${plan.relabels.length} to relabel, ` +
                  `${plan.noops.length} already present, ` +
                  `${plan.fieldRenames.length} ${CYCLES_COLLECTION} field rename(s)` +
                  (plan.bothFieldResolutions.length
                    ? `, ${plan.bothFieldResolutions.length} stale ${OLD_FIELD} to clear (--prefer-new)`
                    : '') + '.');
    }
    console.log('');

    const res = await applyRename(db, plan, { apply, log: msg => console.log(msg) });
    console.log('');
    console.log(`Totals: ${res.copied} copied, ${res.relabelled} relabelled, ` +
                `${res.alreadyPresent} already present, ${res.fieldsRenamed} field rename(s), ` +
                `${res.staleFieldsCleared} stale field(s) cleared, ` +
                `${res.refused} refusal(s), ${res.labelsKept} label(s) left for a human.`);

    if (res.refused) {
      failed = true;
      console.log('');
      console.log('One or more refusals. NOTHING was written; every document is exactly as it was.');
      if (plan.wrongSourceShape) {
        console.log('This is the SOURCE-SHAPE refusal. Do not work around it: check whether cm-2b has');
        console.log(`already renamed ${CYCLES_COLLECTION} to ${SOURCE_COLLECTION}. If it has, this`);
        console.log('migration has already run and running it again would destroy live data.');
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
      console.log('Idempotency check: re-run with --apply and confirm "0 copied, 0 relabelled, 0 field rename(s)".');
      console.log(`Then burn in. Only after that: --drop-source --apply, which frees the name '${SOURCE_COLLECTION}' for cm-2b.`);
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
