/**
 * The `office_content` collection's uniqueness indexes (oxp.10).
 *
 * Two constraints, both as partial unique indexes on the one shared
 * collection (see `office_content.schema.js` for why `kind: 'office'` and
 * `kind: 'merit_caps'` documents share one collection):
 *
 *   - at most one `kind: 'office'` document per `category`
 *   - at most one `kind: 'merit_caps'` document, full stop
 *
 * Office category names are fixed, ASCII, code-controlled strings (unlike
 * bloodline names, which are player/ST-authored free text) — no collation
 * or case-insensitivity concern the way `bloodline-name-index.js` had to
 * solve for. This repo also has no concurrent write path against this
 * collection (locked scope: read-only in TM Game, see the schema file's own
 * header), so there is no race to defend against the way BL-4's admin CRUD
 * needed — the seed script's own reconciliation (DIFFERS/orphan/dupe
 * reporting) is the real defence; these indexes are a backstop, not the
 * primary guard.
 */

export const OFFICE_CATEGORY_INDEX = 'office_content_category_unique';
export const MERIT_CAPS_SINGLETON_INDEX = 'office_content_merit_caps_singleton';

/**
 * Create both indexes if absent. Idempotent.
 * @param {import('mongodb').Collection} col
 */
export async function ensureOfficeContentIndexes(col) {
  await col.createIndex(
    { category: 1 },
    { unique: true, partialFilterExpression: { kind: 'office' }, name: OFFICE_CATEGORY_INDEX },
  );
  await col.createIndex(
    { kind: 1 },
    { unique: true, partialFilterExpression: { kind: 'merit_caps' }, name: MERIT_CAPS_SINGLETON_INDEX },
  );
}
