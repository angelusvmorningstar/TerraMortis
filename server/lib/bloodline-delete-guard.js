/**
 * The guarded bloodline delete (Epic BL, BL-4 / #1008).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why the reference check runs twice
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   DELETE is refused when any character holds the name or any `rule_grant`
 *   references it. BL-4 shipped that as read-then-delete: two collection reads,
 *   then `deleteOne`. Nothing holds a lock across those calls, so a character
 *   assigned the bloodline (or a grant rule created against it) in the gap is
 *   invisible to the guard, and the delete goes through on a bloodline that is
 *   now referenced. The holder is left costed fully out-of-clan behind BL-2's
 *   "unknown bloodline" banner, and the grant rule points at nothing.
 *
 *   A MongoDB transaction does NOT fix this and it is worth saying why, since
 *   it is the obvious reach: transactions give snapshot reads and conflict on
 *   WRITES to the same documents. A concurrent insert into `characters` does
 *   not touch any document this transaction writes, so it would not conflict,
 *   and the transaction would commit exactly as the unguarded version does.
 *   MongoDB has no predicate locking, so there is no read-set to serialise
 *   against.
 *
 *   What does close it is checking again AFTER the delete and putting the
 *   document back if a reference appeared. The document is restored with its
 *   original `_id`, so nothing that referenced it by id is disturbed, and the
 *   ST gets the same 409 they would have got had the writes arrived in the
 *   other order. A reference created after the second read is a reference to a
 *   bloodline that no longer exists, which is a different problem with an
 *   existing owner: BL-2's loud miss reports it, and BL-5 governs what a
 *   character may hold.
 *
 * Every collection touch is injected, so the ordering this module exists to
 * get right is testable without racing a real database.
 */

/** True when anything at all references the bloodline. */
export function isReferenced(refs) {
  return !!refs && ((refs.holders || 0) > 0 || (refs.grant_rules || 0) > 0);
}

/**
 * @param {object} io
 * @param {() => Promise<object>} io.findReferences - the reference join
 * @param {() => Promise<number>} io.deleteDoc      - returns deletedCount
 * @param {() => Promise<void>} io.restoreDoc       - re-inserts the document verbatim
 * @returns {Promise<{ deleted: boolean, found: boolean, restored: boolean, refs: object }>}
 */
export async function deleteBloodlineGuarded({ findReferences, deleteDoc, restoreDoc }) {
  const before = await findReferences();
  if (isReferenced(before)) {
    return { deleted: false, found: true, restored: false, refs: before };
  }

  const deletedCount = await deleteDoc();
  if (!deletedCount) {
    // Someone else deleted it between the read and here. Nothing to undo.
    return { deleted: false, found: false, restored: false, refs: before };
  }

  const after = await findReferences();
  if (isReferenced(after)) {
    await restoreDoc();
    return { deleted: false, found: true, restored: true, refs: after };
  }

  return { deleted: true, found: true, restored: false, refs: after };
}
