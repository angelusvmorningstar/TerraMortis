/**
 * oxp.10 — the two read shapes every `office_content` consumer needs, in one
 * place, so a repointed call site never re-derives the collection's own
 * discriminated-`kind` shape (see `server/schemas/office_content.schema.js`).
 *
 * No caching module here, unlike the client-side `office-content-cache.js`
 * (`public/js/data/office-content-cache.js`). `office-purchase.js` reads
 * `office_content` from directly inside an active MongoDB transaction
 * alongside its other `{session: dbSession}` reads (`office_seats`,
 * `office_merit_dots`, `office_manoeuvre_ranks`) — a client-style cache would
 * either be blind to the transaction's own isolation level or would have to
 * bypass it, either of which is a correctness risk a cache buys nothing
 * against on a collection this small and this rarely read per request.
 */

import { getCollection } from '../db.js';

const col = () => getCollection('office_content');

/**
 * The one `kind: 'office'` document for `category`, or `undefined` if none
 * exists yet (a real, valid state for 'Administrator' until oxp-8 — see the
 * schema file's own header).
 *
 * @param {string} category
 * @param {{session?: import('mongodb').ClientSession}} [opts]
 */
export async function getOfficeEntry(category, opts = {}) {
  const { session } = opts;
  return col().findOne({ kind: 'office', category }, session ? { session } : undefined) ?? undefined;
}

/**
 * The flat merit-name -> dot-cap map from the singleton `kind: 'merit_caps'`
 * document. Returns `{}` if the document is somehow missing rather than
 * throwing, so a caller's existing `caps[merit] || 5` default-cap fallback
 * degrades to "every merit defaults to 5" instead of a 500.
 *
 * @param {{session?: import('mongodb').ClientSession}} [opts]
 */
export async function getMeritCaps(opts = {}) {
  const { session } = opts;
  const doc = await col().findOne({ kind: 'merit_caps' }, session ? { session } : undefined);
  return doc?.caps || {};
}
