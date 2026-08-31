/**
 * Record a REFUSED write-once transition (issue #1132).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why a separate collection, and why not on the character
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   BL-5 (#1008) made `clan` and `bloodline` write-once. A forbidden change
 *   returns `409 WRITE_ONCE_VIOLATION` and nothing persisted that it happened
 *   — the 409 was the only trace, seen once and then gone. #1132's own first
 *   acceptance criterion was deciding where the record should live.
 *
 *   This repo already has two audit-trail precedents and they agree:
 *   `xp_ledger` (append-only XP-write record, written by a direct insert from
 *   the same PUT handler, read back through one small ST-only GET) and
 *   `st_mod_audit` (ST-mod lifecycle events in their own separate collection).
 *   Neither is the right REUSE target — wrong domain each — but together they
 *   establish the convention: a small, purpose-built, append-only collection
 *   per audit concern, not a shared generic audit surface.
 *
 *   And not on the character document. Nothing in this codebase puts
 *   write-history on `characters`, which is one of ADR-007's two "sacrosanct"
 *   collections for persistence-safety reasons, not an audit-noise target.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this is best-effort, and never blocks
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   The caller is already on its way to returning a 409. A logging failure
 *   must not turn a correct, well-explained refusal into a 500 the ST cannot
 *   act on. Same guarantee xpl.1's ledger insert makes, for the same reason:
 *   the audit machinery is additive, so it never gets a veto over the path it
 *   is observing. A failure is logged and swallowed.
 *
 *   Deliberately purely additive: `character-write-once.js`'s refusal logic and
 *   the 409 response shape are untouched by this story (issue #1132 says so
 *   outright), and this module is imported by, not merged into, the route.
 */

import { getCollection } from '../db.js';

const COLLECTION = 'write_once_violations';

/**
 * The ST behind the request, in `st_mod_audit`'s own `by` shape.
 *
 * `xp_ledger` carries a flat `st_username` string; `st_mod_audit` carries
 * `{ discord_id, discord_name }`. The second is the stronger shape for a
 * security-adjacent record: a Discord username can be changed by its owner,
 * the snowflake id cannot, so a record keyed only on the name can stop
 * identifying anybody.
 *
 * The fallbacks are not decoration. `xp_ledger`'s own code review (2026-08-15,
 * Medium) found `req.user.username` assumed always present, which would have
 * written an unattributed row on the one path where attribution is the point.
 */
export function actorFromUser(user) {
  return {
    discord_id: String(user?.id || ''),
    discord_name: user?.global_name || user?.username || 'unknown',
  };
}

/**
 * Build the documents for one refusal.
 *
 * @param {import('mongodb').ObjectId} characterId
 * @param {Array<{field: string, stored_value: *, attempted_value: *}>} rows
 *   ONE ROW PER FIELD. A single request that is refused over both `clan` and
 *   `bloodline` produces two documents, never one document naming two fields —
 *   a conflated row cannot answer "which value was attempted for which field".
 * @param {object} user  req.user
 * @param {string} [at]  ISO timestamp; shared by every row of one refusal, so
 *   the rows of a single attempt can be recognised as one event.
 */
export function buildViolationDocs(characterId, rows, user, at = new Date().toISOString()) {
  const actor = actorFromUser(user);
  return rows.map(row => ({
    character_id: characterId,
    field: row.field,
    // `undefined` would be dropped by the driver, taking the key with it and
    // leaving the record silent about the very thing it exists to say. `null`
    // is the honest stored form of "there was nothing there". Nothing else is
    // normalised: '' stays '', case and whitespace stay as attempted.
    stored_value: row.stored_value === undefined ? null : row.stored_value,
    attempted_value: row.attempted_value === undefined ? null : row.attempted_value,
    actor,
    at,
  }));
}

/**
 * Write the documents. Never throws, never blocks the caller's own response.
 */
export async function recordWriteOnceViolations(characterId, rows, user) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  try {
    await getCollection(COLLECTION).insertMany(buildViolationDocs(characterId, rows, user));
  } catch (err) {
    // Codex review (2026-08-31): a non-Error rejection (null/undefined) makes
    // `err.message` itself throw, escaping this catch and turning the 409
    // this call sits in front of into a 500. `err?.message` never does.
    console.error('write_once_violations insert failed for character', String(characterId), err?.message ?? err);
  }
}
