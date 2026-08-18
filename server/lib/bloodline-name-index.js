/**
 * The `bloodlines` collection's unique-name index (Epic BL, #1008).
 *
 * Shared by the seed script and the write route so there is exactly one
 * definition of what "names must be distinct" means in this collection.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why the index carries a collation
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   BL-4 shipped with a raw, case-SENSITIVE `bloodline_name_unique`, and the
 *   route did the case-insensitive work in application code: read the whole
 *   collection, normalise, compare, insert if clear. That is a read-then-write
 *   with no lock, so two concurrent POSTs for "Khaibit" and "khaibit" could
 *   both complete the scan before either insert landed, and the index could
 *   not catch the second because to a case-sensitive index the two names are
 *   different. Both documents persisted, both appeared in the dropdown, and
 *   the cache collapsed them onto one `_key` (`bloodlines-cache.js:66`), so
 *   one of the two became permanently unreachable for costing.
 *
 *   `strength: 2` is the case-insensitive, accent-SENSITIVE level, which is
 *   the same comparison the cache performs with `name.trim().toLowerCase()`
 *   for every practical bloodline name. The database now enforces the rule
 *   atomically, which is the only thing that can: the route's pre-insert scan
 *   stays, but purely so the ST gets a 409 naming the existing bloodline
 *   rather than a driver error mapped to a bare conflict.
 *
 *   Surrounding whitespace is still the route's job — `name` is trimmed before
 *   it is ever stored, so no document can carry it.
 */

export const BLOODLINE_NAME_INDEX = 'bloodline_name_unique';

/** Case-insensitive, accent-sensitive. See the header for why strength 2. */
export const BLOODLINE_NAME_COLLATION = { locale: 'en', strength: 2 };

const SPEC = { name: 1 };
const OPTIONS = {
  unique: true,
  collation: BLOODLINE_NAME_COLLATION,
  name: BLOODLINE_NAME_INDEX,
};

/** Trim + case-fold, matching `bloodlines-cache.js`'s `_key`. */
function normKey(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

/**
 * Create the index if it is absent, and upgrade the pre-BL-4 case-sensitive
 * one in place if it is present. Idempotent, and safe to call on every write.
 *
 * MongoDB refuses `createIndex` when an index of the same name exists with
 * different options (error 85 / 86), so an upgrade is a drop plus a create.
 * The collection is scanned for case-different duplicates BEFORE the drop:
 * recreating would fail on them, and failing after the drop would leave the
 * collection with no unique index at all, which is worse than the state we
 * started in.
 *
 * @param {import('mongodb').Collection} col
 * @returns {Promise<'created'|'unchanged'|'recreated'>}
 */
export async function ensureBloodlineNameIndex(col) {
  try {
    await col.createIndex(SPEC, OPTIONS);
    return 'created';
  } catch (err) {
    if (!err || (err.code !== 85 && err.code !== 86)) throw err;
  }

  const existing = (await col.indexes()).find(i => i.name === BLOODLINE_NAME_INDEX);
  if (existing?.unique && existing?.collation?.strength === BLOODLINE_NAME_COLLATION.strength) {
    return 'unchanged';
  }

  const seen = new Map();
  const clashes = [];
  for (const doc of await col.find({}, { projection: { name: 1 } }).toArray()) {
    const key = normKey(doc.name);
    if (!key) continue;
    if (seen.has(key)) clashes.push(`"${seen.get(key)}" and "${doc.name}"`);
    else seen.set(key, doc.name);
  }
  if (clashes.length) {
    throw new Error(
      `Cannot make ${BLOODLINE_NAME_INDEX} case-insensitive: the collection already holds names that `
      + `differ only by case: ${clashes.join('; ')}. Remove or rename one of each pair first. `
      + 'The existing case-sensitive index has been left in place.'
    );
  }

  await col.dropIndex(BLOODLINE_NAME_INDEX);
  await col.createIndex(SPEC, OPTIONS);
  return 'recreated';
}
