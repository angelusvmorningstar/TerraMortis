/**
 * Server-side character normalizer.
 *
 * Eliminates merit rating-vs-channels drift at the persistence layer.
 * Runs on every character write (POST/PUT) so no client can save
 * inconsistent data — past, present, or future.
 *
 * The merit schema has two parallel sources of truth for a merit's dots:
 *  1. The persisted `rating` integer.
 *  2. The sum of channel fields: cp + xp + free + free_*.
 *
 * Project rule (CLAUDE.md / feedback_effective_rating_discipline.md):
 * effective rating = sum of all channel dots; bonus dots are real dots.
 *
 * This normalizer enforces that contract before persistence:
 *  - If sum ≠ rating: set rating = sum (sync drift).
 *  - If rating > 0 and sum = 0: move rating into `free` (backfill the
 *    "phantom rating" pattern where a merit was stored without any
 *    channel populated, e.g. early imports or granted_by entries that
 *    never had their grant channel filled).
 *
 * After normalize, sum(channels) === rating for every merit.
 */

const MERIT_CHANNELS = [
  'cp', 'xp', 'free',
  'free_mci', 'free_vm', 'free_lk', 'free_ohm', 'free_inv',
  'free_pt', 'free_mdb', 'free_sw', 'free_bloodline', 'free_pet',
  'free_attache', 'free_carthian',
];

/**
 * Granted-by → backfill channel.
 *
 * For Pattern 1 backfills on rule-engine-managed merits, the dots must
 * land in the channel the rule engine writes. Otherwise the engine
 * adds its derived dots on top of the generic `free`, double-counting.
 *
 * Mapping mirrors the rule engine evaluators (public/js/editor/rule_engine/*).
 * Unknown granted_by tags fall back to `free` (preserves dots without
 * claiming a specific source).
 */
const GRANTED_BY_CHANNEL = {
  'Bloodline':  'free_bloodline',
  'OHM':        'free_ohm',
  'PT':         'free_pt',
  'Safe Word':  'free_sw',
  'VM':         'free_vm',
  'K-9':        'free_pet',
  'Falconry':   'free_pet',
  'MCI':        'free_mci',
  'MDB':        'free_mdb',
  'Lorekeeper': 'free_lk',
  'Invested':   'free_inv',
  'Carthian Pull': 'free_carthian', // #508
};

function backfillChannel(merit) {
  const gb = merit.granted_by || '';
  return GRANTED_BY_CHANNEL[gb] || 'free';
}

function sumChannels(merit) {
  let s = 0;
  for (const ch of MERIT_CHANNELS) s += (merit[ch] || 0);
  return s;
}

/**
 * Normalize a single merit. Mutates in place. Returns a diagnostics
 * object describing what changed (or { changed: false }).
 */
export function normalizeMerit(merit) {
  if (!merit || typeof merit !== 'object') return { changed: false };
  const sum = sumChannels(merit);
  const rating = merit.rating || 0;

  if (sum === 0 && rating > 0) {
    const channel = backfillChannel(merit);
    merit[channel] = (merit[channel] || 0) + rating;
    return {
      changed: true,
      reason: 'backfilled',
      channel,
      before: { rating, sum: 0 },
      after:  { rating, sum: rating },
    };
  }

  if (sum !== rating) {
    merit.rating = sum;
    return {
      changed: true,
      reason: 'synced',
      before: { rating, sum },
      after:  { rating: sum, sum },
    };
  }

  return { changed: false };
}

/**
 * Normalize every merit on a character document. Mutates in place.
 * Safe to call on partial-update payloads — if `merits` is absent
 * or not an array, this is a no-op.
 */
export function normalizeCharacterMerits(doc) {
  if (!doc || !Array.isArray(doc.merits)) {
    return { changed: false, changes: [] };
  }
  const changes = [];
  let changed = false;
  for (const m of doc.merits) {
    const r = normalizeMerit(m);
    if (r.changed) {
      changed = true;
      const label = m.area
        ? `${m.name} (${m.area})`
        : m.qualifier ? `${m.name} (${m.qualifier})` : m.name;
      changes.push({ merit: label, category: m.category, ...r });
    }
  }
  return { changed, changes };
}

/**
 * Express middleware. Runs after schema validation so we only normalize
 * structurally-valid bodies. Silent — no logging on the hot path.
 */
export function normalizeMeritsMiddleware(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    normalizeCharacterMerits(req.body);
  }
  next();
}

/**
 * N-4 (MNEC, issue #696) — cross-field validation for White Ants.
 *
 * JSON-Schema can't express "the array's length must equal a sibling field's
 * computed value" so the rule lives here. Two invariants per White Ants merit:
 *
 *   1. `territories.length === effectiveRating` — every dot picks a Territory.
 *   2. No duplicates within a single merit's territories array.
 *
 * Effective rating uses the same union-of-channels math as `meritFreeSum`:
 *   cp + xp + sum(free_grants.*) + sum(free_<slug>)
 * which mirrors the client-side `syncMeritRating` formula (domain.js). We
 * recompute here rather than trusting `m.rating` because the API accepts
 * partial bodies that may omit `m.rating` even when bumping the dot fields.
 *
 * Partial-save tolerance: if `req.body.merits` is absent, this middleware is a
 * no-op (PATCH-style saves that only touch e.g. status are allowed).
 */
export function validateWhiteAntsTerritoriesMiddleware(req, res, next) {
  const merits = req.body && Array.isArray(req.body.merits) ? req.body.merits : null;
  if (!merits) return next();

  for (let i = 0; i < merits.length; i++) {
    const m = merits[i];
    if (!m || m.name !== 'White Ants') continue;

    const rating = _effectiveMeritRating(m);
    const territories = Array.isArray(m.territories) ? m.territories : [];

    if (territories.length !== rating) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `White Ants territories length (${territories.length}) must equal merit rating (${rating}). One Territory must be picked per dot.`,
        detail: { merit_index: i, merit: 'White Ants', rating, territories_length: territories.length },
      });
    }
    const seen = new Set();
    for (const slug of territories) {
      if (seen.has(slug)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `White Ants territories must be distinct — '${slug}' appears more than once.`,
          detail: { merit_index: i, merit: 'White Ants', duplicate: slug },
        });
      }
      seen.add(slug);
    }
  }
  return next();
}

function _effectiveMeritRating(m) {
  const cp = m.cp || 0;
  const xp = m.xp || 0;
  const fromMap = m.free_grants && typeof m.free_grants === 'object'
    ? Object.values(m.free_grants).reduce((s, n) => s + (n || 0), 0)
    : 0;
  // 14 legacy free_<slug> fields, summed verbatim (same shape as the
  // LEGACY_FREE_SLUGS constant in public/js/data/rules-helpers.js).
  const legacy = (m.free_attache || 0) + (m.free_bloodline || 0) + (m.free_carthian || 0)
    + (m.free_fwb || 0) + (m.free_inv || 0) + (m.free_lk || 0) + (m.free_mci || 0)
    + (m.free_mdb || 0) + (m.free_ohm || 0) + (m.free_pet || 0) + (m.free_pt || 0)
    + (m.free_retainer || 0) + (m.free_sw || 0) + (m.free_vm || 0);
  return cp + xp + fromMap + legacy;
}
