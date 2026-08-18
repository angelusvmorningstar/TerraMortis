/**
 * Bloodline slug derivation (BL-4, issue #1008).
 *
 * Lifted out of `server/scripts/seed-bloodlines.js:78-85` so the seed and the
 * write route share ONE implementation. BL-3b retires the seed to
 * `scripts/archive/`; leaving `deriveSlug` in there would either take the
 * route's slug logic with it or, worse, invite a second copy. A slug that two
 * writers derive differently is drift pattern #2 wearing a different hat.
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
