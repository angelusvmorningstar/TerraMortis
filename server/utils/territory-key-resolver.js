/**
 * Submission territory key resolver — server-side normalisation helper.
 *
 * Issue #496 / story 496.1 (dual-read tolerance window).
 *
 * Resolves any territory key found in a submission response to the canonical
 * territory `_id` string. Accepts every format the audit found in live data:
 *
 *   - 24-char hex ObjectId        — direct lookup against territories._id
 *   - Short slug ("harbour")       — TERRITORY_DATA.slug
 *   - Long slug ("the_harbour")    — via TERRITORY_SLUG_MAP
 *   - Display name ("The Harbour") — via TERRITORY_SLUG_MAP / territories.name
 *   - Legacy variants              — via TERRITORY_SLUG_MAP
 *
 * Returns:
 *   - The territory's `_id` as a string
 *   - `null` if the key represents Barrens or is unmappable
 *
 * This helper is the gatekeeper for the 4-story migration in #496:
 *   - 496.1 (this story): every server-side reader of submission territory
 *     fields uses this helper, so subsequent stories can flip the form-side
 *     write format without breakage.
 *   - 496.4: this helper is the single deletion target once all submissions
 *     are uniformly ObjectId-keyed.
 */

import { normaliseTerritorySlug } from './territory-slugs.js';

const OID_PATTERN = /^[a-f0-9]{24}$/i;

/**
 * Build O(1) lookup maps from a territories array (typically the result of
 * `db.collection('territories').find().toArray()`).
 *
 * Pre-build once per request handler scope and pass to
 * `resolveSubmissionTerritoryKey()` to avoid rebuilding inside inner loops.
 */
export function buildTerritoryLookupMaps(territories) {
  const byId = new Map();
  const bySlug = new Map();
  const byName = new Map();
  for (const t of territories || []) {
    if (!t || !t._id) continue;
    const id = String(t._id);
    byId.set(id, t);
    if (t.slug) bySlug.set(String(t.slug), t);
    if (t.name) byName.set(String(t.name), t);
  }
  return { byId, bySlug, byName };
}

/**
 * Resolve any submission territory key to a canonical territory `_id` string.
 *
 * @param {string|null|undefined} key   The raw key from a submission response.
 * @param {object} maps                 Output of `buildTerritoryLookupMaps()`.
 * @returns {string|null}               Canonical `_id` string, or `null`.
 */
export function resolveSubmissionTerritoryKey(key, maps) {
  if (!key) return null;
  const s = String(key);

  // Path 1: direct ObjectId lookup. Lowercase the input so uppercase-hex
  // submission keys still resolve (MongoDB emits lowercase, but be defensive
  // against any future writer that doesn't).
  if (OID_PATTERN.test(s)) {
    const lc = s.toLowerCase();
    if (maps.byId.has(lc)) return lc;
  }

  // Path 2: route through legacy slug map (handles long slug, display name,
  // legacy variants, short-slug pass-through; returns null for Barrens).
  const canonicalSlug = normaliseTerritorySlug(s);
  if (canonicalSlug === null) return null; // explicit Barrens
  if (canonicalSlug && maps.bySlug.has(canonicalSlug)) {
    return String(maps.bySlug.get(canonicalSlug)._id);
  }

  // Path 3: display-name fallback for names not in TERRITORY_SLUG_MAP
  // (defensive — covers any future territory whose name precedes a SLUG_MAP update).
  if (maps.byName.has(s)) {
    return String(maps.byName.get(s)._id);
  }

  return null;
}
