/**
 * Bloodline slug derivation (BL-4, issue #1008).
 *
 * Lifted out of `server/scripts/seed-bloodlines.js:78-85` so the seed and the
 * (since-retired) write route shared ONE implementation. BL-3b retired the
 * seed to `scripts/archive/`; leaving `deriveSlug` in there would either have
 * taken the route's slug logic with it or, worse, invited a second copy.
 * ADMR-1 (2026-08-26) then retired the write route itself (authoring moved to
 * TM Admin) - the frozen `server/scripts/archive/seed-bloodlines.js` remains
 * the one live caller, still smoke-tested by `bl3b-archived-seed-smoke.test.js`
 * for exactly that reason. Behavioural coverage of this function itself lives
 * in `bloodline-slug.test.js`.
 *
 * The slug is always derived server-side from `name` and is never accepted
 * from a client.
 */

/**
 * Stable kebab id from a display name. Diacritics are stripped rather than
 * hyphenated through, so "Lidérc" gives "liderc" and not "lid-rc".
 *
 * Returns '' when the name carries no letters or digits at all. Callers must
 * treat that as a rejection: the schema's `slug` pattern requires a leading
 * alphanumeric, so an empty slug would otherwise surface as an opaque
 * pattern-mismatch error rather than "that name has nothing to make an id
 * from".
 *
 * @param {string} name
 * @returns {string}
 */
export function deriveSlug(name) {
  return String(name)
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
